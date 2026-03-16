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

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  VARCHAR(255) NOT NULL REFERENCES chatbots(company_id) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token   ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_company ON admin_sessions(company_id);
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
