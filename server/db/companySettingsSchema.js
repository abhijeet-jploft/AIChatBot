/**
 * Settings split by admin feature module (one row per company per table).
 * chatbots keeps identity + password_hash only.
 */

/** Whitelist for migrations / ensure-rows (order matters for documentation only). */
module.exports.MODULE_SETTINGS_TABLE_NAMES = [
  'chat_settings',
  'theme_settings',
  'lead_settings',
  'voice_settings',
  'admin_visibility_settings',
  'escalation_settings',
  'safety_settings',
  'language_settings',
  'embed_settings',
  'smtp_settings',
  'notification_preferences',
];

/** Previous single-table names; migrate splits these into module tables then DROP. */
module.exports.MONOLITHIC_SETTINGS_TABLES = ['settings', 'company_settings'];

module.exports.MODULE_SETTINGS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chat_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_name VARCHAR(255),
  icon_url TEXT,
  greeting_message TEXT,
  widget_position VARCHAR(10) NOT NULL DEFAULT 'right',
  auto_trigger_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_trigger_open_mode VARCHAR(16) NOT NULL DEFAULT 'auto',
  auto_trigger_delay_seconds INTEGER NOT NULL DEFAULT 8,
  auto_trigger_scroll_percent INTEGER NOT NULL DEFAULT 40,
  auto_trigger_only_selected_pages BOOLEAN NOT NULL DEFAULT FALSE,
  auto_trigger_pricing_page BOOLEAN NOT NULL DEFAULT FALSE,
  auto_trigger_portfolio_page BOOLEAN NOT NULL DEFAULT FALSE,
  auto_trigger_selected_pages TEXT,
  ai_mode VARCHAR(64) NOT NULL DEFAULT 'mixed_mode',
  ai_provider VARCHAR(32) NOT NULL DEFAULT 'anthropic',
  ai_model VARCHAR(128),
  anthropic_api_key TEXT,
  gemini_api_key TEXT,
  agent_paused BOOLEAN NOT NULL DEFAULT FALSE,
  business_name VARCHAR(255),
  business_description TEXT,
  business_industry_type VARCHAR(255),
  business_service_categories TEXT,
  business_contact_email VARCHAR(320),
  business_contact_phone VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS theme_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  theme_primary_color VARCHAR(7),
  theme_primary_dark_color VARCHAR(7),
  theme_secondary_color VARCHAR(7),
  theme_secondary_light_color VARCHAR(7),
  theme_header_background VARCHAR(255),
  theme_header_shadow VARCHAR(255),
  theme_header_text_color VARCHAR(7)
);

CREATE TABLE IF NOT EXISTS lead_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lead_email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  lead_notification_email TEXT
);

CREATE TABLE IF NOT EXISTS voice_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voice_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  elevenlabs_api_key TEXT,
  voice_gender VARCHAR(10) NOT NULL DEFAULT 'female',
  voice_profile VARCHAR(20) NOT NULL DEFAULT 'professional',
  voice_custom_id TEXT,
  voice_custom_name VARCHAR(255),
  voice_custom_gender VARCHAR(10),
  voice_ignore_emoji BOOLEAN NOT NULL DEFAULT FALSE,
  voice_response_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  voice_tts_language_code VARCHAR(12)
);

CREATE TABLE IF NOT EXISTS admin_visibility_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_visibility_language_settings BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_auto_trigger BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_escalation BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_safety BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_ai_mode BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_voice_mode_toggle BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_voice_response_toggle BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_voice_ignore_emoji BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_voice_spoken_language BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_voice_preset_voices BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_voice_custom_training BOOLEAN NOT NULL DEFAULT TRUE,
  admin_visibility_allowed_preset_voice_keys TEXT,
  admin_visibility_allowed_ai_mode_ids TEXT,
  admin_visibility_training_modules TEXT,
  admin_visibility_allowed_chat_language_codes TEXT
);

CREATE TABLE IF NOT EXISTS escalation_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalation_trigger_user_requests_human BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_trigger_ai_confidence_low BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_trigger_urgent_keywords BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_trigger_angry_sentiment BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_trigger_high_value_lead BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_action_instant_notification BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_action_auto_schedule_meeting BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_action_chat_takeover_alert BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_high_value_lead_score_threshold INTEGER NOT NULL DEFAULT 75
);

CREATE TABLE IF NOT EXISTS safety_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  safety_block_topics_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  safety_block_topics TEXT,
  safety_prevent_internal_data BOOLEAN NOT NULL DEFAULT TRUE,
  safety_restrict_database_price_exposure BOOLEAN NOT NULL DEFAULT TRUE,
  safety_disable_competitor_comparisons BOOLEAN NOT NULL DEFAULT TRUE,
  safety_restrict_file_sharing BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS language_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  language_primary VARCHAR(50) NOT NULL DEFAULT 'en',
  language_multi_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  language_auto_detect_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  language_manual_switch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  language_extra_locales TEXT
);

CREATE TABLE IF NOT EXISTS embed_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embed_slug VARCHAR(255),
  embed_secret VARCHAR(128)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_embed_settings_embed_slug_unique
  ON embed_settings(embed_slug) WHERE embed_slug IS NOT NULL AND embed_slug <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_embed_settings_embed_secret_unique
  ON embed_settings(embed_secret) WHERE embed_secret IS NOT NULL AND embed_secret <> '';

CREATE TABLE IF NOT EXISTS smtp_settings (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_secure BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_from_email VARCHAR(320)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel_email BOOLEAN NOT NULL DEFAULT TRUE,
  channel_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  notify_new_lead BOOLEAN NOT NULL DEFAULT TRUE,
  notify_meeting_request BOOLEAN NOT NULL DEFAULT TRUE,
  notify_training_completion BOOLEAN NOT NULL DEFAULT TRUE,
  notify_payment BOOLEAN NOT NULL DEFAULT TRUE,
  notify_system_alert BOOLEAN NOT NULL DEFAULT TRUE
);
`;

/** Columns to drop from chatbots after data is copied to module settings */
module.exports.LEGACY_SETTINGS_COLUMNS = [
  'display_name',
  'icon_url',
  'greeting_message',
  'widget_position',
  'ai_mode',
  'theme_primary_color',
  'theme_primary_dark_color',
  'theme_secondary_color',
  'theme_secondary_light_color',
  'theme_header_background',
  'theme_header_shadow',
  'theme_header_text_color',
  'lead_email_notifications_enabled',
  'lead_notification_email',
  'agent_paused',
  'voice_mode_enabled',
  'voice_gender',
  'voice_profile',
  'voice_custom_id',
  'voice_custom_name',
  'voice_custom_gender',
  'voice_ignore_emoji',
  'voice_response_enabled',
  'escalation_trigger_user_requests_human',
  'escalation_trigger_ai_confidence_low',
  'escalation_trigger_urgent_keywords',
  'escalation_trigger_angry_sentiment',
  'escalation_trigger_high_value_lead',
  'escalation_action_instant_notification',
  'escalation_action_auto_schedule_meeting',
  'escalation_action_chat_takeover_alert',
  'escalation_high_value_lead_score_threshold',
  'safety_block_topics_enabled',
  'safety_block_topics',
  'safety_prevent_internal_data',
  'safety_restrict_database_price_exposure',
  'safety_disable_competitor_comparisons',
  'safety_restrict_file_sharing',
  'language_primary',
  'language_multi_enabled',
  'language_auto_detect_enabled',
  'language_manual_switch_enabled',
  'embed_slug',
  'embed_secret',
];
