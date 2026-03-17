const fs   = require('fs');
const path = require('path');
const pool = require('./index');

const TRAIN_DATA_DIR = path.join(__dirname, '../../train_data');

// ─── Schema ───────────────────────────────────────────────────────────────────
// gen_random_uuid() is built-in since PostgreSQL 13.
// pgcrypto provides it on PG < 13 too, so we install it as a safety net.
const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per organisation chatbot (synced from train_data folders)
CREATE TABLE IF NOT EXISTS chatbots (
  id          SERIAL       PRIMARY KEY,
  company_id  VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A conversation thread (one per chat session in the UI)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  VARCHAR(255) NOT NULL REFERENCES chatbots(company_id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL DEFAULT 'New Chat',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Individual messages inside a session
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL    PRIMARY KEY,
  session_id  UUID         NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_company   ON chat_sessions(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session   ON chat_messages(session_id, created_at ASC);

-- Admin: company auth and settings
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS greeting_message TEXT;
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS ai_mode VARCHAR(64) NOT NULL DEFAULT 'mixed_mode';
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS theme_primary_color VARCHAR(7);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS theme_primary_dark_color VARCHAR(7);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS theme_secondary_color VARCHAR(7);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS theme_secondary_light_color VARCHAR(7);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS lead_email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS lead_notification_email TEXT;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  VARCHAR(255) NOT NULL REFERENCES chatbots(company_id) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token   ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_company ON admin_sessions(company_id);

-- Leads CRM module
CREATE TABLE IF NOT EXISTS leads (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         VARCHAR(255) NOT NULL REFERENCES chatbots(company_id) ON DELETE CASCADE,
  session_id         UUID         NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  name               VARCHAR(255),
  phone              VARCHAR(40),
  email              VARCHAR(255),
  location           VARCHAR(255),
  business_type      VARCHAR(255),
  service_requested  TEXT,
  project_summary    TEXT,
  budget_range       VARCHAR(160),
  timeline           VARCHAR(255),
  landing_page       TEXT,
  device_type        VARCHAR(50),
  ai_detected_intent VARCHAR(120),
  status             VARCHAR(40)  NOT NULL DEFAULT 'new',
  lead_score         INTEGER      NOT NULL DEFAULT 0,
  lead_score_category VARCHAR(20) NOT NULL DEFAULT 'cold',
  contact_method     VARCHAR(40),
  assigned_owner     VARCHAR(255),
  reminder_at        TIMESTAMPTZ,
  reminder_note      TEXT,
  reminder_notified_at TIMESTAMPTZ,
  notes              TEXT,
  converted_at       TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_company_created ON leads(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_score ON leads(company_id, lead_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_search_name ON leads(company_id, name);
CREATE INDEX IF NOT EXISTS idx_leads_company_search_phone ON leads(company_id, phone);
CREATE INDEX IF NOT EXISTS idx_leads_company_search_email ON leads(company_id, email);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_owner VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_note TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_company_reminder ON leads(company_id, reminder_at);

CREATE TABLE IF NOT EXISTS lead_status_history (
  id          BIGSERIAL    PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status  VARCHAR(40),
  to_status    VARCHAR(40) NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead ON lead_status_history(lead_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS lead_activities (
  id            BIGSERIAL    PRIMARY KEY,
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type  VARCHAR(40) NOT NULL,
  details        TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);
`;

// ─── Chatbot seeder ───────────────────────────────────────────────────────────
// Reads train_data/<companyId> folders and inserts a chatbot row for each.
// Uses ON CONFLICT DO NOTHING so existing rows are never overwritten.
async function syncChatbots(client) {
  const bots = [{ company_id: '_default', name: 'Default' }];

  if (fs.existsSync(TRAIN_DATA_DIR)) {
    const entries = fs.readdirSync(TRAIN_DATA_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name.startsWith('_') && e.name !== '_default') {
        bots.push({
          company_id: e.name,
          name: e.name.replace(/^_/, '').replace(/_/g, ' ').trim(),
        });
      }
    }
  }

  for (const bot of bots) {
    await client.query(
      `INSERT INTO chatbots (company_id, name)
       VALUES ($1, $2)
       ON CONFLICT (company_id) DO NOTHING`,
      [bot.company_id, bot.name]
    );
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    console.log('[db] Schema ready');
    await syncChatbots(client);
    console.log('[db] Chatbots synced');
  } finally {
    client.release();
  }
}

module.exports = { migrate };
