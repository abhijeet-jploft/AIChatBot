const pool = require('../db/index');
const { ensureSettingsRow } = require('../admin/models/CompanyAdmin');

/**
 * Ensure a chatbot exists for the given company. Creates if missing.
 * @param {string} companyId
 * @returns {Promise<void>}
 */
async function findOrCreate(companyId) {
  const name = companyId.replace(/^_/, '').replace(/_/g, ' ').trim() || companyId;
  await pool.query(
    `INSERT INTO chatbots (company_id, name) VALUES ($1, $2)
     ON CONFLICT (company_id) DO NOTHING`,
                                    [companyId, name]
  );
  await ensureSettingsRow(companyId);
}

/**
 * Fetch chatbot + module settings for a company.
 * @param {string} companyId
 * @returns {Promise<object|null>}
 */
async function findByCompanyId(companyId) {
  await ensureSettingsRow(companyId);
  const { rows } = await pool.query(
    `SELECT
      c.company_id,
      ch.ai_mode,
      ch.agent_paused,
      vo.voice_mode_enabled,
      vo.voice_gender,
      vo.voice_profile,
      vo.voice_custom_id,
      vo.voice_custom_name,
      vo.voice_custom_gender,
      vo.voice_ignore_emoji,
      vo.voice_response_enabled,
      esc.escalation_trigger_user_requests_human,
      esc.escalation_trigger_ai_confidence_low,
      esc.escalation_trigger_urgent_keywords,
      esc.escalation_trigger_angry_sentiment,
      esc.escalation_trigger_high_value_lead,
      esc.escalation_action_instant_notification,
      esc.escalation_action_auto_schedule_meeting,
      esc.escalation_action_chat_takeover_alert,
      esc.escalation_high_value_lead_score_threshold,
      sf.safety_block_topics_enabled,
      sf.safety_block_topics,
      sf.safety_prevent_internal_data,
      sf.safety_restrict_database_price_exposure,
      sf.safety_disable_competitor_comparisons,
      sf.safety_restrict_file_sharing,
      lg.language_primary,
      lg.language_multi_enabled,
      lg.language_auto_detect_enabled,
      lg.language_manual_switch_enabled
    FROM chatbots c
    INNER JOIN chat_settings ch ON ch.company_id = c.company_id
    INNER JOIN voice_settings vo ON vo.company_id = c.company_id
    INNER JOIN escalation_settings esc ON esc.company_id = c.company_id
    INNER JOIN safety_settings sf ON sf.company_id = c.company_id
    INNER JOIN language_settings lg ON lg.company_id = c.company_id
    WHERE c.company_id = $1`,
    [companyId]
  );

  return rows[0] || null;
}

async function setAgentPaused(companyId, paused) {
  await ensureSettingsRow(companyId);
  await pool.query(
    `UPDATE chat_settings SET agent_paused = $1, updated_at = NOW() WHERE company_id = $2`,
    [Boolean(paused), companyId]
  );
}

module.exports = { findOrCreate, findByCompanyId, setAgentPaused };
