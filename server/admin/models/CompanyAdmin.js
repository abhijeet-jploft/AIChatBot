const pool = require('../../db/index');
const { MODULE_SETTINGS_TABLE_NAMES } = require('../../db/companySettingsSchema');

const ALLOWED_MODULE_TABLES = new Set(MODULE_SETTINGS_TABLE_NAMES);

async function ensureSettingsRow(companyId) {
  for (const table of MODULE_SETTINGS_TABLE_NAMES) {
    if (!ALLOWED_MODULE_TABLES.has(table)) throw new Error(`Invalid settings table: ${table}`);
    await pool.query(
      `INSERT INTO ${table} (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
      [companyId]
    );
  }
}

async function findByCompanyId(companyId) {
  await ensureSettingsRow(companyId);
  const { rows } = await pool.query(
    `SELECT c.id, c.company_id, c.name, c.password_hash,
            ch.display_name, ch.icon_url, ch.greeting_message,
            ch.widget_position,
            ch.ai_mode,
            ch.ai_provider, ch.ai_model, ch.anthropic_api_key, ch.gemini_api_key,
            th.theme_primary_color, th.theme_primary_dark_color,
            th.theme_secondary_color, th.theme_secondary_light_color,
            th.theme_header_background, th.theme_header_shadow, th.theme_header_text_color,
            ld.lead_email_notifications_enabled,
            ld.lead_notification_email,
            ch.agent_paused,
            vo.voice_mode_enabled,
            vo.elevenlabs_api_key,
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
            lg.language_manual_switch_enabled,
            em.embed_slug,
            em.embed_secret
     FROM chatbots c
     INNER JOIN chat_settings ch ON ch.company_id = c.company_id
     INNER JOIN theme_settings th ON th.company_id = c.company_id
     INNER JOIN lead_settings ld ON ld.company_id = c.company_id
     INNER JOIN voice_settings vo ON vo.company_id = c.company_id
     INNER JOIN escalation_settings esc ON esc.company_id = c.company_id
     INNER JOIN safety_settings sf ON sf.company_id = c.company_id
     INNER JOIN language_settings lg ON lg.company_id = c.company_id
     INNER JOIN embed_settings em ON em.company_id = c.company_id
     WHERE c.company_id = $1`,
    [companyId]
  );
  return rows[0] || null;
}

async function setPassword(companyId, passwordHash) {
  await pool.query(
    `UPDATE chatbots SET password_hash = $1 WHERE company_id = $2`,
    [passwordHash, companyId]
  );
}

async function flushTableUpdate(table, companyId, setFragments, values) {
  if (!ALLOWED_MODULE_TABLES.has(table)) throw new Error(`Invalid settings table: ${table}`);
  if (!setFragments.length) return;
  const setClause = setFragments.join(', ');
  const allVals = [...values, companyId];
  await pool.query(
    `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE company_id = $${values.length + 1}`,
    allVals
  );
}

async function updateSettings(companyId, {
  company_name,
  display_name,
  icon_url,
  greeting_message,
  widget_position,
  ai_mode,
  ai_provider,
  ai_model,
  anthropic_api_key,
  gemini_api_key,
  theme_primary_color,
  theme_primary_dark_color,
  theme_secondary_color,
  theme_secondary_light_color,
  theme_header_background,
  theme_header_shadow,
  theme_header_text_color,
  lead_email_notifications_enabled,
  lead_notification_email,
  voice_mode_enabled,
  elevenlabs_api_key,
  voice_gender,
  voice_profile,
  voice_custom_id,
  voice_custom_name,
  voice_custom_gender,
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
  language_manual_switch_enabled,
}) {
  if (company_name !== undefined) {
    const n = String(company_name || '').trim().slice(0, 255);
    if (n) {
      await pool.query(`UPDATE chatbots SET name = $1 WHERE company_id = $2`, [n, companyId]);
    }
  }

  const chatU = [];
  const chatV = [];
  let i = 1;
  if (display_name !== undefined) {
    chatU.push(`display_name = $${i++}`);
    chatV.push(display_name);
  }
  if (icon_url !== undefined) {
    chatU.push(`icon_url = $${i++}`);
    chatV.push(icon_url);
  }
  if (greeting_message !== undefined) {
    chatU.push(`greeting_message = $${i++}`);
    chatV.push(greeting_message);
  }
  if (widget_position !== undefined) {
    chatU.push(`widget_position = $${i++}`);
    chatV.push(widget_position === 'left' ? 'left' : 'right');
  }
  if (ai_mode !== undefined) {
    chatU.push(`ai_mode = $${i++}`);
    chatV.push(ai_mode);
  }
  if (ai_provider !== undefined) {
    chatU.push(`ai_provider = $${i++}`);
    chatV.push(ai_provider);
  }
  if (ai_model !== undefined) {
    chatU.push(`ai_model = $${i++}`);
    chatV.push(ai_model || null);
  }
  if (anthropic_api_key !== undefined) {
    chatU.push(`anthropic_api_key = $${i++}`);
    chatV.push(anthropic_api_key || null);
  }
  if (gemini_api_key !== undefined) {
    chatU.push(`gemini_api_key = $${i++}`);
    chatV.push(gemini_api_key || null);
  }

  const themeUpdates = [];
  const themeValues = [];
  let ti = 1;
  if (theme_primary_color !== undefined) {
    themeUpdates.push(`theme_primary_color = $${ti++}`);
    themeValues.push(theme_primary_color);
  }
  if (theme_primary_dark_color !== undefined) {
    themeUpdates.push(`theme_primary_dark_color = $${ti++}`);
    themeValues.push(theme_primary_dark_color);
  }
  if (theme_secondary_color !== undefined) {
    themeUpdates.push(`theme_secondary_color = $${ti++}`);
    themeValues.push(theme_secondary_color);
  }
  if (theme_secondary_light_color !== undefined) {
    themeUpdates.push(`theme_secondary_light_color = $${ti++}`);
    themeValues.push(theme_secondary_light_color);
  }
  if (theme_header_background !== undefined) {
    themeUpdates.push(`theme_header_background = $${ti++}`);
    themeValues.push(theme_header_background || null);
  }
  if (theme_header_shadow !== undefined) {
    themeUpdates.push(`theme_header_shadow = $${ti++}`);
    themeValues.push(theme_header_shadow || null);
  }
  if (theme_header_text_color !== undefined) {
    themeUpdates.push(`theme_header_text_color = $${ti++}`);
    themeValues.push(theme_header_text_color || null);
  }

  const leadUpdates = [];
  const leadValues = [];
  let li = 1;
  if (lead_email_notifications_enabled !== undefined) {
    leadUpdates.push(`lead_email_notifications_enabled = $${li++}`);
    leadValues.push(Boolean(lead_email_notifications_enabled));
  }
  if (lead_notification_email !== undefined) {
    leadUpdates.push(`lead_notification_email = $${li++}`);
    leadValues.push(lead_notification_email || null);
  }

  const voiceUpdates = [];
  const voiceValues = [];
  let vi = 1;
  if (voice_mode_enabled !== undefined) {
    voiceUpdates.push(`voice_mode_enabled = $${vi++}`);
    voiceValues.push(Boolean(voice_mode_enabled));
  }
  if (elevenlabs_api_key !== undefined) {
    voiceUpdates.push(`elevenlabs_api_key = $${vi++}`);
    voiceValues.push(String(elevenlabs_api_key || '').trim() || null);
  }
  if (voice_gender !== undefined) {
    voiceUpdates.push(`voice_gender = $${vi++}`);
    voiceValues.push(String(voice_gender || 'female').toLowerCase() === 'male' ? 'male' : 'female');
  }
  if (voice_profile !== undefined) {
    voiceUpdates.push(`voice_profile = $${vi++}`);
    const normalizedVoiceProfile = String(voice_profile || 'professional').trim().toLowerCase();
    voiceValues.push(['professional', 'corporate', 'sales', 'custom'].includes(normalizedVoiceProfile) ? normalizedVoiceProfile : 'professional');
  }
  if (voice_custom_id !== undefined) {
    voiceUpdates.push(`voice_custom_id = $${vi++}`);
    voiceValues.push(String(voice_custom_id || '').trim() || null);
  }
  if (voice_custom_name !== undefined) {
    voiceUpdates.push(`voice_custom_name = $${vi++}`);
    voiceValues.push(String(voice_custom_name || '').trim().slice(0, 255) || null);
  }
  if (voice_custom_gender !== undefined) {
    voiceUpdates.push(`voice_custom_gender = $${vi++}`);
    voiceValues.push(String(voice_custom_gender || 'female').toLowerCase() === 'male' ? 'male' : 'female');
  }
  if (voice_ignore_emoji !== undefined) {
    voiceUpdates.push(`voice_ignore_emoji = $${vi++}`);
    voiceValues.push(Boolean(voice_ignore_emoji));
  }
  if (voice_response_enabled !== undefined) {
    voiceUpdates.push(`voice_response_enabled = $${vi++}`);
    voiceValues.push(Boolean(voice_response_enabled));
  }

  const escUpdates = [];
  const escValues = [];
  let ei = 1;
  if (escalation_trigger_user_requests_human !== undefined) {
    escUpdates.push(`escalation_trigger_user_requests_human = $${ei++}`);
    escValues.push(Boolean(escalation_trigger_user_requests_human));
  }
  if (escalation_trigger_ai_confidence_low !== undefined) {
    escUpdates.push(`escalation_trigger_ai_confidence_low = $${ei++}`);
    escValues.push(Boolean(escalation_trigger_ai_confidence_low));
  }
  if (escalation_trigger_urgent_keywords !== undefined) {
    escUpdates.push(`escalation_trigger_urgent_keywords = $${ei++}`);
    escValues.push(Boolean(escalation_trigger_urgent_keywords));
  }
  if (escalation_trigger_angry_sentiment !== undefined) {
    escUpdates.push(`escalation_trigger_angry_sentiment = $${ei++}`);
    escValues.push(Boolean(escalation_trigger_angry_sentiment));
  }
  if (escalation_trigger_high_value_lead !== undefined) {
    escUpdates.push(`escalation_trigger_high_value_lead = $${ei++}`);
    escValues.push(Boolean(escalation_trigger_high_value_lead));
  }
  if (escalation_action_instant_notification !== undefined) {
    escUpdates.push(`escalation_action_instant_notification = $${ei++}`);
    escValues.push(Boolean(escalation_action_instant_notification));
  }
  if (escalation_action_auto_schedule_meeting !== undefined) {
    escUpdates.push(`escalation_action_auto_schedule_meeting = $${ei++}`);
    escValues.push(Boolean(escalation_action_auto_schedule_meeting));
  }
  if (escalation_action_chat_takeover_alert !== undefined) {
    escUpdates.push(`escalation_action_chat_takeover_alert = $${ei++}`);
    escValues.push(Boolean(escalation_action_chat_takeover_alert));
  }
  if (escalation_high_value_lead_score_threshold !== undefined) {
    escUpdates.push(`escalation_high_value_lead_score_threshold = $${ei++}`);
    escValues.push(Number(escalation_high_value_lead_score_threshold));
  }

  const safetyUpdates = [];
  const safetyValues = [];
  let si = 1;
  if (safety_block_topics_enabled !== undefined) {
    safetyUpdates.push(`safety_block_topics_enabled = $${si++}`);
    safetyValues.push(Boolean(safety_block_topics_enabled));
  }
  if (safety_block_topics !== undefined) {
    safetyUpdates.push(`safety_block_topics = $${si++}`);
    safetyValues.push(safety_block_topics || null);
  }
  if (safety_prevent_internal_data !== undefined) {
    safetyUpdates.push(`safety_prevent_internal_data = $${si++}`);
    safetyValues.push(Boolean(safety_prevent_internal_data));
  }
  if (safety_restrict_database_price_exposure !== undefined) {
    safetyUpdates.push(`safety_restrict_database_price_exposure = $${si++}`);
    safetyValues.push(Boolean(safety_restrict_database_price_exposure));
  }
  if (safety_disable_competitor_comparisons !== undefined) {
    safetyUpdates.push(`safety_disable_competitor_comparisons = $${si++}`);
    safetyValues.push(Boolean(safety_disable_competitor_comparisons));
  }
  if (safety_restrict_file_sharing !== undefined) {
    safetyUpdates.push(`safety_restrict_file_sharing = $${si++}`);
    safetyValues.push(Boolean(safety_restrict_file_sharing));
  }

  const langUpdates = [];
  const langValues = [];
  let gi = 1;
  if (language_primary !== undefined) {
    langUpdates.push(`language_primary = $${gi++}`);
    langValues.push(String(language_primary || 'English').slice(0, 50));
  }
  if (language_multi_enabled !== undefined) {
    langUpdates.push(`language_multi_enabled = $${gi++}`);
    langValues.push(Boolean(language_multi_enabled));
  }
  if (language_auto_detect_enabled !== undefined) {
    langUpdates.push(`language_auto_detect_enabled = $${gi++}`);
    langValues.push(Boolean(language_auto_detect_enabled));
  }
  if (language_manual_switch_enabled !== undefined) {
    langUpdates.push(`language_manual_switch_enabled = $${gi++}`);
    langValues.push(Boolean(language_manual_switch_enabled));
  }

  const totalPatches =
    chatU.length +
    themeUpdates.length +
    leadUpdates.length +
    voiceUpdates.length +
    escUpdates.length +
    safetyUpdates.length +
    langUpdates.length;
  if (totalPatches === 0) return;

  await ensureSettingsRow(companyId);
  await flushTableUpdate('chat_settings', companyId, chatU, chatV);
  await flushTableUpdate('theme_settings', companyId, themeUpdates, themeValues);
  await flushTableUpdate('lead_settings', companyId, leadUpdates, leadValues);
  await flushTableUpdate('voice_settings', companyId, voiceUpdates, voiceValues);
  await flushTableUpdate('escalation_settings', companyId, escUpdates, escValues);
  await flushTableUpdate('safety_settings', companyId, safetyUpdates, safetyValues);
  await flushTableUpdate('language_settings', companyId, langUpdates, langValues);
}

async function updateThemeSettings(companyId, {
  primaryColor,
  primaryDarkColor,
  secondaryColor,
  secondaryLightColor,
  headerBackground,
  headerShadow,
  headerTextColor,
}) {
  const updates = [];
  const values = [];
  let i = 1;
  if (primaryColor !== undefined) {
    updates.push(`theme_primary_color = $${i++}`);
    values.push(primaryColor || null);
  }
  if (primaryDarkColor !== undefined) {
    updates.push(`theme_primary_dark_color = $${i++}`);
    values.push(primaryDarkColor || null);
  }
  if (secondaryColor !== undefined) {
    updates.push(`theme_secondary_color = $${i++}`);
    values.push(secondaryColor || null);
  }
  if (secondaryLightColor !== undefined) {
    updates.push(`theme_secondary_light_color = $${i++}`);
    values.push(secondaryLightColor || null);
  }
  if (headerBackground !== undefined) {
    updates.push(`theme_header_background = $${i++}`);
    values.push(headerBackground || null);
  }
  if (headerShadow !== undefined) {
    updates.push(`theme_header_shadow = $${i++}`);
    values.push(headerShadow || null);
  }
  if (headerTextColor !== undefined) {
    updates.push(`theme_header_text_color = $${i++}`);
    values.push(headerTextColor || null);
  }
  if (updates.length === 0) return;
  await ensureSettingsRow(companyId);
  await flushTableUpdate('theme_settings', companyId, updates, values);
}

async function createSession(companyId, token, expiresAt) {
  await pool.query(
    `INSERT INTO admin_sessions (company_id, token, expires_at) VALUES ($1, $2, $3)`,
    [companyId, token, expiresAt]
  );
}

async function findSessionByToken(token) {
  const { rows } = await pool.query(
    `SELECT s.company_id, c.name
     FROM admin_sessions s
     JOIN chatbots c ON c.company_id = s.company_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return rows[0] || null;
}

async function deleteSession(token) {
  await pool.query(`DELETE FROM admin_sessions WHERE token = $1`, [token]);
}

async function listActiveSessions(companyId) {
  const { rows } = await pool.query(
    `SELECT id, expires_at, created_at
     FROM admin_sessions
     WHERE company_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [companyId]
  );
  return rows || [];
}

async function deleteAllSessions(companyId) {
  await pool.query(`DELETE FROM admin_sessions WHERE company_id = $1`, [companyId]);
}

async function setAgentPaused(companyId, paused) {
  await ensureSettingsRow(companyId);
  await pool.query(
    `UPDATE chat_settings SET agent_paused = $1, updated_at = NOW() WHERE company_id = $2`,
    [Boolean(paused), companyId]
  );
}

module.exports = {
  findByCompanyId,
  ensureSettingsRow,
  setPassword,
  updateSettings,
  updateThemeSettings,
  setAgentPaused,
  createSession,
  findSessionByToken,
  deleteSession,
  listActiveSessions,
  deleteAllSessions,
};
