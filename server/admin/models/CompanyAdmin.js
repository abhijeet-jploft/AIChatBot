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

function normalizeAdminEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

/** Login lookup — does not call ensureSettingsRow (no side effects). */
async function findByAdminEmail(rawEmail) {
  const email = normalizeAdminEmail(rawEmail);
  if (!email) return null;
  const { rows } = await pool.query(
    `SELECT company_id, name, password_hash, admin_email, is_suspended FROM chatbots WHERE admin_email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function setAdminEmail(companyId, rawEmail) {
  const email = normalizeAdminEmail(rawEmail);
  await pool.query(`UPDATE chatbots SET admin_email = $1 WHERE company_id = $2`, [email || null, companyId]);
}

async function findByCompanyId(companyId) {
  await ensureSettingsRow(companyId);
  const { rows } = await pool.query(
    `SELECT c.id, c.company_id, c.name, c.password_hash, c.admin_email, c.is_suspended,
            ch.display_name, ch.icon_url, ch.greeting_message,
            ch.widget_position,
            ch.auto_trigger_enabled,
            ch.auto_trigger_open_mode,
            ch.auto_trigger_delay_seconds,
            ch.auto_trigger_scroll_percent,
            ch.auto_trigger_only_selected_pages,
            ch.auto_trigger_pricing_page,
            ch.auto_trigger_portfolio_page,
            ch.auto_trigger_selected_pages,
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
            vo.voice_tts_language_code,
            av.admin_visibility_language_settings,
            av.admin_visibility_auto_trigger,
            av.admin_visibility_escalation,
            av.admin_visibility_safety,
            av.admin_visibility_ai_mode,
            av.admin_visibility_voice_mode_toggle,
            av.admin_visibility_voice_response_toggle,
            av.admin_visibility_voice_ignore_emoji,
            av.admin_visibility_voice_spoken_language,
            av.admin_visibility_voice_preset_voices,
            av.admin_visibility_voice_custom_training,
            av.admin_visibility_allowed_preset_voice_keys,
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
            lg.language_extra_locales,
            em.embed_slug,
            em.embed_secret
     FROM chatbots c
     INNER JOIN chat_settings ch ON ch.company_id = c.company_id
     INNER JOIN theme_settings th ON th.company_id = c.company_id
     INNER JOIN lead_settings ld ON ld.company_id = c.company_id
     INNER JOIN voice_settings vo ON vo.company_id = c.company_id
    INNER JOIN admin_visibility_settings av ON av.company_id = c.company_id
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
  auto_trigger_enabled,
  auto_trigger_open_mode,
  auto_trigger_delay_seconds,
  auto_trigger_scroll_percent,
  auto_trigger_only_selected_pages,
  auto_trigger_pricing_page,
  auto_trigger_portfolio_page,
  auto_trigger_selected_pages,
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
  voice_tts_language_code,
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
  language_extra_locales,
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
  if (auto_trigger_enabled !== undefined) {
    chatU.push(`auto_trigger_enabled = $${i++}`);
    chatV.push(Boolean(auto_trigger_enabled));
  }
  if (auto_trigger_open_mode !== undefined) {
    chatU.push(`auto_trigger_open_mode = $${i++}`);
    chatV.push(String(auto_trigger_open_mode || '').toLowerCase() === 'click' ? 'click' : 'auto');
  }
  if (auto_trigger_delay_seconds !== undefined) {
    chatU.push(`auto_trigger_delay_seconds = $${i++}`);
    chatV.push(Number(auto_trigger_delay_seconds));
  }
  if (auto_trigger_scroll_percent !== undefined) {
    chatU.push(`auto_trigger_scroll_percent = $${i++}`);
    chatV.push(Number(auto_trigger_scroll_percent));
  }
  if (auto_trigger_only_selected_pages !== undefined) {
    chatU.push(`auto_trigger_only_selected_pages = $${i++}`);
    chatV.push(Boolean(auto_trigger_only_selected_pages));
  }
  if (auto_trigger_pricing_page !== undefined) {
    chatU.push(`auto_trigger_pricing_page = $${i++}`);
    chatV.push(Boolean(auto_trigger_pricing_page));
  }
  if (auto_trigger_portfolio_page !== undefined) {
    chatU.push(`auto_trigger_portfolio_page = $${i++}`);
    chatV.push(Boolean(auto_trigger_portfolio_page));
  }
  if (auto_trigger_selected_pages !== undefined) {
    chatU.push(`auto_trigger_selected_pages = $${i++}`);
    chatV.push(String(auto_trigger_selected_pages || '').trim() || null);
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
  if (voice_tts_language_code !== undefined) {
    voiceUpdates.push(`voice_tts_language_code = $${vi++}`);
    const raw = String(voice_tts_language_code || '').trim().toLowerCase();
    voiceValues.push(raw || null);
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
    langValues.push(String(language_primary || 'en').trim().slice(0, 50));
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
  if (language_extra_locales !== undefined) {
    langUpdates.push(`language_extra_locales = $${gi++}`);
    const v = language_extra_locales == null ? null : String(language_extra_locales);
    langValues.push(v && v.length ? v : null);
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

async function updateAdminVisibility(companyId, {
  admin_visibility_language_settings,
  admin_visibility_auto_trigger,
  admin_visibility_escalation,
  admin_visibility_safety,
  admin_visibility_ai_mode,
  admin_visibility_voice_mode_toggle,
  admin_visibility_voice_response_toggle,
  admin_visibility_voice_ignore_emoji,
  admin_visibility_voice_spoken_language,
  admin_visibility_voice_preset_voices,
  admin_visibility_voice_custom_training,
  admin_visibility_allowed_preset_voice_keys,
}) {
  const updates = [];
  const values = [];
  let i = 1;

  if (admin_visibility_language_settings !== undefined) {
    updates.push(`admin_visibility_language_settings = $${i++}`);
    values.push(Boolean(admin_visibility_language_settings));
  }
  if (admin_visibility_auto_trigger !== undefined) {
    updates.push(`admin_visibility_auto_trigger = $${i++}`);
    values.push(Boolean(admin_visibility_auto_trigger));
  }
  if (admin_visibility_escalation !== undefined) {
    updates.push(`admin_visibility_escalation = $${i++}`);
    values.push(Boolean(admin_visibility_escalation));
  }
  if (admin_visibility_safety !== undefined) {
    updates.push(`admin_visibility_safety = $${i++}`);
    values.push(Boolean(admin_visibility_safety));
  }
  if (admin_visibility_ai_mode !== undefined) {
    updates.push(`admin_visibility_ai_mode = $${i++}`);
    values.push(Boolean(admin_visibility_ai_mode));
  }
  if (admin_visibility_voice_mode_toggle !== undefined) {
    updates.push(`admin_visibility_voice_mode_toggle = $${i++}`);
    values.push(Boolean(admin_visibility_voice_mode_toggle));
  }
  if (admin_visibility_voice_response_toggle !== undefined) {
    updates.push(`admin_visibility_voice_response_toggle = $${i++}`);
    values.push(Boolean(admin_visibility_voice_response_toggle));
  }
  if (admin_visibility_voice_ignore_emoji !== undefined) {
    updates.push(`admin_visibility_voice_ignore_emoji = $${i++}`);
    values.push(Boolean(admin_visibility_voice_ignore_emoji));
  }
  if (admin_visibility_voice_spoken_language !== undefined) {
    updates.push(`admin_visibility_voice_spoken_language = $${i++}`);
    values.push(Boolean(admin_visibility_voice_spoken_language));
  }
  if (admin_visibility_voice_preset_voices !== undefined) {
    updates.push(`admin_visibility_voice_preset_voices = $${i++}`);
    values.push(Boolean(admin_visibility_voice_preset_voices));
  }
  if (admin_visibility_voice_custom_training !== undefined) {
    updates.push(`admin_visibility_voice_custom_training = $${i++}`);
    values.push(Boolean(admin_visibility_voice_custom_training));
  }
  if (admin_visibility_allowed_preset_voice_keys !== undefined) {
    updates.push(`admin_visibility_allowed_preset_voice_keys = $${i++}`);
    values.push(admin_visibility_allowed_preset_voice_keys || null);
  }

  if (!updates.length) return;
  await ensureSettingsRow(companyId);
  await flushTableUpdate('admin_visibility_settings', companyId, updates, values);
}

async function createSession(companyId, token, expiresAt) {
  await pool.query(
    `INSERT INTO admin_sessions (company_id, token, expires_at) VALUES ($1, $2, $3)`,
    [companyId, token, expiresAt]
  );
}

async function findSessionByToken(token) {
  const { rows } = await pool.query(
    `SELECT s.company_id, c.name, c.is_suspended
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
  findByAdminEmail,
  normalizeAdminEmail,
  setAdminEmail,
  ensureSettingsRow,
  setPassword,
  updateSettings,
  updateThemeSettings,
  updateAdminVisibility,
  setAgentPaused,
  createSession,
  findSessionByToken,
  deleteSession,
  listActiveSessions,
  deleteAllSessions,
};
