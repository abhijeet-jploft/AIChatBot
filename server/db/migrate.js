const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('./index');
const {
  MODULE_SETTINGS_SCHEMA_SQL,
  MODULE_SETTINGS_TABLE_NAMES,
  LEGACY_SETTINGS_COLUMNS,
} = require('./companySettingsSchema');

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

-- Admin: login only on chatbots; config lives in module *settings tables
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS admin_email VARCHAR(320);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbots_admin_email_unique
  ON chatbots (admin_email)
  WHERE admin_email IS NOT NULL AND admin_email <> '';

-- Company admin (owner) account profile (4.8.2)
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS admin_phone VARCHAR(64);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS company_website VARCHAR(512);
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS industry_category VARCHAR(128);

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

ALTER TABLE leads ADD COLUMN IF NOT EXISTS message_enquiry TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_country VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_city_state VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS browser VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS os_name VARCHAR(255);

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

-- Support tickets raised by visitor triggers or admins, managed by super admin.
CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      VARCHAR(255) NOT NULL REFERENCES chatbots(company_id) ON DELETE CASCADE,
  session_id      UUID         REFERENCES chat_sessions(id) ON DELETE SET NULL,
  source          VARCHAR(32)  NOT NULL DEFAULT 'visitor',
  message         TEXT         NOT NULL,
  priority        VARCHAR(16)  NOT NULL DEFAULT 'normal',
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  requested_by    VARCHAR(255),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company_created ON support_tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created ON support_tickets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id              BIGSERIAL    PRIMARY KEY,
  ticket_id       UUID         NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_role     VARCHAR(32)  NOT NULL,
  sender_name     VARCHAR(255),
  message         TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created ON support_ticket_messages(ticket_id, created_at ASC);

-- Per-company third-party API usage telemetry (chat/voice/etc.)
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id               BIGSERIAL    PRIMARY KEY,
  company_id       VARCHAR(255) NOT NULL REFERENCES chatbots(company_id) ON DELETE CASCADE,
  session_id       UUID         REFERENCES chat_sessions(id) ON DELETE SET NULL,
  api_provider     VARCHAR(32)  NOT NULL,
  api_category     VARCHAR(32)  NOT NULL,
  model            VARCHAR(128),
  request_context  VARCHAR(64),
  latency_ms       INTEGER,
  success          BOOLEAN      NOT NULL DEFAULT TRUE,
  error_message    TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_usage_company_created ON api_usage_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider_created ON api_usage_logs(api_provider, created_at DESC);
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

function slugifyForEmbed(str) {
  const s = String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'company';
}

/** @param {'chatbots'|'settings'|'company_settings'} source */
function copyModuleSettingsFromSourceSql(source) {
  const allowed = new Set(['chatbots', 'settings', 'company_settings']);
  if (!allowed.has(source)) throw new Error(`Invalid settings copy source: ${source}`);
  return [
    `INSERT INTO chat_settings (company_id, display_name, icon_url, greeting_message, widget_position, ai_mode, agent_paused)
     SELECT company_id, display_name, icon_url, greeting_message, widget_position, ai_mode, agent_paused FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       icon_url = EXCLUDED.icon_url,
       greeting_message = EXCLUDED.greeting_message,
       widget_position = EXCLUDED.widget_position,
       ai_mode = EXCLUDED.ai_mode,
       agent_paused = EXCLUDED.agent_paused,
       updated_at = NOW()`,
    `INSERT INTO theme_settings (
       company_id, theme_primary_color, theme_primary_dark_color, theme_secondary_color, theme_secondary_light_color,
       theme_header_background, theme_header_shadow, theme_header_text_color
     )
     SELECT company_id, theme_primary_color, theme_primary_dark_color, theme_secondary_color, theme_secondary_light_color,
            theme_header_background, theme_header_shadow, theme_header_text_color FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       theme_primary_color = EXCLUDED.theme_primary_color,
       theme_primary_dark_color = EXCLUDED.theme_primary_dark_color,
       theme_secondary_color = EXCLUDED.theme_secondary_color,
       theme_secondary_light_color = EXCLUDED.theme_secondary_light_color,
       theme_header_background = EXCLUDED.theme_header_background,
       theme_header_shadow = EXCLUDED.theme_header_shadow,
       theme_header_text_color = EXCLUDED.theme_header_text_color,
       updated_at = NOW()`,
    `INSERT INTO lead_settings (company_id, lead_email_notifications_enabled, lead_notification_email)
     SELECT company_id, lead_email_notifications_enabled, lead_notification_email FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       lead_email_notifications_enabled = EXCLUDED.lead_email_notifications_enabled,
       lead_notification_email = EXCLUDED.lead_notification_email,
       updated_at = NOW()`,
    `INSERT INTO voice_settings (
       company_id, voice_mode_enabled, voice_gender, voice_profile, voice_custom_id, voice_custom_name, voice_custom_gender,
       voice_ignore_emoji, voice_response_enabled
     )
     SELECT company_id, voice_mode_enabled, voice_gender, voice_profile, voice_custom_id, voice_custom_name, voice_custom_gender,
            voice_ignore_emoji, voice_response_enabled FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       voice_mode_enabled = EXCLUDED.voice_mode_enabled,
       voice_gender = EXCLUDED.voice_gender,
       voice_profile = EXCLUDED.voice_profile,
       voice_custom_id = EXCLUDED.voice_custom_id,
       voice_custom_name = EXCLUDED.voice_custom_name,
       voice_custom_gender = EXCLUDED.voice_custom_gender,
       voice_ignore_emoji = EXCLUDED.voice_ignore_emoji,
       voice_response_enabled = EXCLUDED.voice_response_enabled,
       updated_at = NOW()`,
    `INSERT INTO escalation_settings (
       company_id, escalation_trigger_user_requests_human, escalation_trigger_ai_confidence_low,
       escalation_trigger_urgent_keywords, escalation_trigger_angry_sentiment, escalation_trigger_high_value_lead,
       escalation_action_instant_notification, escalation_action_auto_schedule_meeting, escalation_action_chat_takeover_alert,
       escalation_high_value_lead_score_threshold
     )
     SELECT company_id, escalation_trigger_user_requests_human, escalation_trigger_ai_confidence_low,
            escalation_trigger_urgent_keywords, escalation_trigger_angry_sentiment, escalation_trigger_high_value_lead,
            escalation_action_instant_notification, escalation_action_auto_schedule_meeting, escalation_action_chat_takeover_alert,
            escalation_high_value_lead_score_threshold FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       escalation_trigger_user_requests_human = EXCLUDED.escalation_trigger_user_requests_human,
       escalation_trigger_ai_confidence_low = EXCLUDED.escalation_trigger_ai_confidence_low,
       escalation_trigger_urgent_keywords = EXCLUDED.escalation_trigger_urgent_keywords,
       escalation_trigger_angry_sentiment = EXCLUDED.escalation_trigger_angry_sentiment,
       escalation_trigger_high_value_lead = EXCLUDED.escalation_trigger_high_value_lead,
       escalation_action_instant_notification = EXCLUDED.escalation_action_instant_notification,
       escalation_action_auto_schedule_meeting = EXCLUDED.escalation_action_auto_schedule_meeting,
       escalation_action_chat_takeover_alert = EXCLUDED.escalation_action_chat_takeover_alert,
       escalation_high_value_lead_score_threshold = EXCLUDED.escalation_high_value_lead_score_threshold,
       updated_at = NOW()`,
    `INSERT INTO safety_settings (
       company_id, safety_block_topics_enabled, safety_block_topics, safety_prevent_internal_data,
       safety_restrict_database_price_exposure, safety_disable_competitor_comparisons, safety_restrict_file_sharing
     )
     SELECT company_id, safety_block_topics_enabled, safety_block_topics, safety_prevent_internal_data,
            safety_restrict_database_price_exposure, safety_disable_competitor_comparisons, safety_restrict_file_sharing FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       safety_block_topics_enabled = EXCLUDED.safety_block_topics_enabled,
       safety_block_topics = EXCLUDED.safety_block_topics,
       safety_prevent_internal_data = EXCLUDED.safety_prevent_internal_data,
       safety_restrict_database_price_exposure = EXCLUDED.safety_restrict_database_price_exposure,
       safety_disable_competitor_comparisons = EXCLUDED.safety_disable_competitor_comparisons,
       safety_restrict_file_sharing = EXCLUDED.safety_restrict_file_sharing,
       updated_at = NOW()`,
    `INSERT INTO language_settings (
       company_id, language_primary, language_multi_enabled, language_auto_detect_enabled, language_manual_switch_enabled
     )
     SELECT company_id, language_primary, language_multi_enabled, language_auto_detect_enabled, language_manual_switch_enabled FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       language_primary = EXCLUDED.language_primary,
       language_multi_enabled = EXCLUDED.language_multi_enabled,
       language_auto_detect_enabled = EXCLUDED.language_auto_detect_enabled,
       language_manual_switch_enabled = EXCLUDED.language_manual_switch_enabled,
       updated_at = NOW()`,
    `INSERT INTO embed_settings (company_id, embed_slug, embed_secret)
     SELECT company_id, embed_slug, embed_secret FROM ${source}
     ON CONFLICT (company_id) DO UPDATE SET
       embed_slug = EXCLUDED.embed_slug,
       embed_secret = EXCLUDED.embed_secret,
       updated_at = NOW()`,
  ];
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return rows.length > 0;
}

async function ensureAdminVisibilityExtraColumns(client) {
  await client.query(
    `ALTER TABLE admin_visibility_settings ADD COLUMN IF NOT EXISTS admin_visibility_allowed_ai_mode_ids TEXT`
  );
  await client.query(
    `ALTER TABLE admin_visibility_settings ADD COLUMN IF NOT EXISTS admin_visibility_training_modules TEXT`
  );
  await client.query(
    `ALTER TABLE admin_visibility_settings ADD COLUMN IF NOT EXISTS admin_visibility_allowed_chat_language_codes TEXT`
  );
}

async function ensureModuleSettingsTables(client) {
  await client.query(MODULE_SETTINGS_SCHEMA_SQL);
  await client.query(`ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS widget_position VARCHAR(10) NOT NULL DEFAULT 'right'`);
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_enabled BOOLEAN NOT NULL DEFAULT TRUE');
  await client.query("ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_open_mode VARCHAR(16) NOT NULL DEFAULT 'auto'");
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_delay_seconds INTEGER NOT NULL DEFAULT 8');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_scroll_percent INTEGER NOT NULL DEFAULT 40');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_only_selected_pages BOOLEAN NOT NULL DEFAULT FALSE');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_pricing_page BOOLEAN NOT NULL DEFAULT FALSE');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_portfolio_page BOOLEAN NOT NULL DEFAULT FALSE');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS auto_trigger_selected_pages TEXT');
  await client.query(`ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32) NOT NULL DEFAULT 'anthropic'`);
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS ai_model VARCHAR(128)');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT');
  await client.query('ALTER TABLE chat_settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT');
  await client.query('ALTER TABLE voice_settings ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT');
  await client.query('ALTER TABLE language_settings ADD COLUMN IF NOT EXISTS language_extra_locales TEXT');
  await client.query('ALTER TABLE voice_settings ADD COLUMN IF NOT EXISTS voice_tts_language_code VARCHAR(12)');
}

async function splitMonolithicSettingsIntoModules(client) {
  // Prefer `settings` first; loop in case both legacy names exist.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let source = null;
    if (await tableExists(client, 'settings')) source = 'settings';
    else if (await tableExists(client, 'company_settings')) source = 'company_settings';
    if (!source) break;

    for (const sql of copyModuleSettingsFromSourceSql(source)) {
      await client.query(sql);
    }
    await client.query(`DROP TABLE IF EXISTS ${source} CASCADE`);
    console.log(`[db] Split monolithic ${source} into module settings tables`);
  }
}

async function chatbotsHasLegacySettingsColumns(client) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chatbots' AND column_name = 'display_name'`
  );
  return rows.length > 0;
}

async function migrateLegacyChatbotSettingsToModules(client) {
  const hasLegacy = await chatbotsHasLegacySettingsColumns(client);
  if (!hasLegacy) return;

  await client.query('DROP INDEX IF EXISTS idx_chatbots_embed_slug_unique');
  await client.query('DROP INDEX IF EXISTS idx_chatbots_embed_secret_unique');

  for (const sql of copyModuleSettingsFromSourceSql('chatbots')) {
    try {
      await client.query(sql);
    } catch (err) {
      // Older deployments can have only a subset of legacy chatbot columns.
      // Skip that module copy if its source columns do not exist.
      if (err && err.code === '42703') {
        console.warn(`[db] Skipping partial legacy copy due to missing column: ${err.message}`);
        continue;
      }
      throw err;
    }
  }

  for (const col of LEGACY_SETTINGS_COLUMNS) {
    await client.query(`ALTER TABLE chatbots DROP COLUMN IF EXISTS ${col}`);
  }
}

async function ensureModuleSettingsRows(client) {
  const allowed = new Set(MODULE_SETTINGS_TABLE_NAMES);
  for (const table of MODULE_SETTINGS_TABLE_NAMES) {
    if (!allowed.has(table)) throw new Error(`Invalid module settings table: ${table}`);
    await client.query(
      `INSERT INTO ${table} (company_id) SELECT company_id FROM chatbots ON CONFLICT (company_id) DO NOTHING`
    );
  }
}

async function backfillEmbedCredentials(client) {
  const { rows } = await client.query(
    `SELECT em.company_id, c.name, ch.display_name, em.embed_slug, em.embed_secret
     FROM embed_settings em
     JOIN chatbots c ON c.company_id = em.company_id
     LEFT JOIN chat_settings ch ON ch.company_id = em.company_id`
  );
  for (const r of rows) {
    if (r.embed_slug && r.embed_secret) continue;
    const baseSlug = slugifyForEmbed(r.display_name || r.name || r.company_id);
    let slug = baseSlug;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await client.query(
        `SELECT 1 FROM embed_settings WHERE embed_slug = $1 AND company_id <> $2`,
        [slug, r.company_id]
      );
      if (!clash.rows.length) break;
      slug = `${baseSlug}-${++n}`;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    await client.query(
      `UPDATE embed_settings SET embed_slug = $1, embed_secret = $2, updated_at = NOW() WHERE company_id = $3`,
      [slug, secret, r.company_id]
    );
  }
}

async function ensureChatSettingsBusinessInfoColumns(client) {
  await client.query(`
    ALTER TABLE chat_settings
      ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS business_description TEXT,
      ADD COLUMN IF NOT EXISTS business_industry_type VARCHAR(255),
      ADD COLUMN IF NOT EXISTS business_service_categories TEXT,
      ADD COLUMN IF NOT EXISTS business_contact_email VARCHAR(320),
      ADD COLUMN IF NOT EXISTS business_contact_phone VARCHAR(64)
  `);
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    console.log('[db] Schema ready');
    await ensureModuleSettingsTables(client);
    await ensureAdminVisibilityExtraColumns(client);
    await splitMonolithicSettingsIntoModules(client);
    console.log('[db] Module settings tables ready');
    await migrateLegacyChatbotSettingsToModules(client);
    console.log('[db] Legacy chatbots settings migrated (if any)');
    await syncChatbots(client);
    console.log('[db] Chatbots synced');
    await ensureModuleSettingsRows(client);
    console.log('[db] Module settings rows ensured');
    await ensureChatSettingsBusinessInfoColumns(client);
    console.log('[db] Business info columns ready');
    await backfillEmbedCredentials(client);
    console.log('[db] Embed paths ready');
    await normalizeLanguagePrimaryCodes(client);
    console.log('[db] Language primary codes normalized (if needed)');
    await ensureSuperAdminTables(client);
    console.log('[db] Super admin tables ready');
  } finally {
    client.release();
  }
}

const SUPER_ADMIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS super_admins (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  email         VARCHAR(255),
  password_hash TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS super_admin_sessions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  UUID         NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  token           VARCHAR(255) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ  NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_token ON super_admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_admin ON super_admin_sessions(super_admin_id);

CREATE TABLE IF NOT EXISTS super_admin_alert_rules (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  rule_type   VARCHAR(64)  NOT NULL,
  conditions  JSONB        NOT NULL DEFAULT '{}',
  actions     JSONB        NOT NULL DEFAULT '{}',
  enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  UUID         REFERENCES super_admins(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS super_admin_roles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB        NOT NULL DEFAULT '{}',
  is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS super_admin_staff_users (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              VARCHAR(160) NOT NULL,
  email                  VARCHAR(255) NOT NULL UNIQUE,
  password_hash          TEXT,
  is_active              BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password   BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at          TIMESTAMPTZ,
  last_password_change_at TIMESTAMPTZ,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_super_admin_staff_active ON super_admin_staff_users(is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS super_admin_staff_user_roles (
  staff_user_id UUID NOT NULL REFERENCES super_admin_staff_users(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES super_admin_roles(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_super_admin_staff_user_roles_role ON super_admin_staff_user_roles(role_id);

CREATE TABLE IF NOT EXISTS super_admin_staff_sessions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id  UUID         NOT NULL REFERENCES super_admin_staff_users(id) ON DELETE CASCADE,
  token          VARCHAR(255) NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ  NOT NULL,
  last_active_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_super_admin_staff_sessions_token ON super_admin_staff_sessions(token);
CREATE INDEX IF NOT EXISTS idx_super_admin_staff_sessions_staff ON super_admin_staff_sessions(staff_user_id);

CREATE TABLE IF NOT EXISTS super_admin_audit_logs (
  id           BIGSERIAL    PRIMARY KEY,
  actor_type   VARCHAR(32)  NOT NULL,
  actor_id     UUID,
  actor_label  VARCHAR(255) NOT NULL,
  action       VARCHAR(120) NOT NULL,
  target_type  VARCHAR(64),
  target_id    VARCHAR(255),
  target_label VARCHAR(255),
  metadata     JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_created ON super_admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_actor ON super_admin_audit_logs(actor_type, actor_id, created_at DESC);
`;

async function ensureSuperAdminTables(client) {
  await client.query(SUPER_ADMIN_SCHEMA);
  await client.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  await client.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS full_name VARCHAR(160)`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS last_password_change_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await client.query(`ALTER TABLE super_admin_staff_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await client.query(`ALTER TABLE super_admin_staff_sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await migrateStaffUserRoles(client);
}

/** Many-to-many staff ↔ roles; migrates legacy super_admin_staff_users.role_id then drops it. */
async function migrateStaffUserRoles(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS super_admin_staff_user_roles (
      staff_user_id UUID NOT NULL REFERENCES super_admin_staff_users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES super_admin_roles(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (staff_user_id, role_id)
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_super_admin_staff_user_roles_role ON super_admin_staff_user_roles(role_id)`
  );

  const col = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'super_admin_staff_users' AND column_name = 'role_id'`
  );
  if (!col.rows.length) return;

  await client.query(`
    INSERT INTO super_admin_staff_user_roles (staff_user_id, role_id)
    SELECT id, role_id FROM super_admin_staff_users
    WHERE role_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);

  await client.query(
    `ALTER TABLE super_admin_staff_users DROP CONSTRAINT IF EXISTS super_admin_staff_users_role_id_fkey`
  );
  await client.query(`DROP INDEX IF EXISTS idx_super_admin_staff_role`);
  await client.query(`ALTER TABLE super_admin_staff_users DROP COLUMN role_id`);
}

/** Map legacy language labels to ISO 639-1 codes used by admin + ElevenLabs. */
async function normalizeLanguagePrimaryCodes(client) {
  const {
    normalizeLanguagePrimaryToCode,
    parseLanguageExtraLocalesJson,
    serializeLanguageExtraLocales,
    normalizeLanguageExtraLocalesInput,
  } = require('../services/supportedChatLanguages');

  const { rows } = await client.query(
    `SELECT company_id, language_primary, language_extra_locales FROM language_settings`
  );
  for (const r of rows) {
    const nextPrimary = normalizeLanguagePrimaryToCode(r.language_primary);
    const extra = normalizeLanguageExtraLocalesInput(
      parseLanguageExtraLocalesJson(r.language_extra_locales),
      nextPrimary
    );
    const extraJson = serializeLanguageExtraLocales(extra);
    await client.query(
      `UPDATE language_settings SET language_primary = $2, language_extra_locales = $3, updated_at = NOW()
       WHERE company_id = $1 AND (language_primary IS DISTINCT FROM $2 OR language_extra_locales IS DISTINCT FROM $3)`,
      [r.company_id, nextPrimary, extraJson]
    );
  }
}

module.exports = { migrate };
