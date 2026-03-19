const pool = require('../db/index');

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
}

/**
 * Fetch chatbot row for a company.
 * @param {string} companyId
 * @returns {Promise<object|null>}
 */
async function findByCompanyId(companyId) {
  const { rows } = await pool.query(
    `SELECT
      company_id,
      ai_mode,
      agent_paused,
      voice_mode_enabled,
      voice_gender,
      voice_profile,
      voice_ignore_emoji,
      voice_response_enabled,
      escalation_trigger_user_requests_human,
      escalation_trigger_ai_confidence_low,
      escalation_trigger_urgent_keywords,
      escalation_trigger_angry_sentiment,
      escalation_trigger_high_value_lead,
      escalation_action_instant_notification,
      escalation_action_auto_schedule_meeting,
      escalation_action_chat_takeover_alert,
      escalation_high_value_lead_score_threshold,
      safety_block_topics_enabled,
      safety_block_topics,
      safety_prevent_internal_data,
      safety_restrict_database_price_exposure,
      safety_disable_competitor_comparisons,
      safety_restrict_file_sharing,
      language_primary,
      language_multi_enabled,
      language_auto_detect_enabled,
      language_manual_switch_enabled
    FROM chatbots WHERE company_id = $1`,
    [companyId]
  );

  return rows[0] || null;
}

async function setAgentPaused(companyId, paused) {
  await pool.query(
    `UPDATE chatbots SET agent_paused = $1 WHERE company_id = $2`,
    [Boolean(paused), companyId]
  );
}

module.exports = { findOrCreate, findByCompanyId, setAgentPaused };
