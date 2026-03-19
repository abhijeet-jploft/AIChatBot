const pool = require('../../db/index');

async function findByCompanyId(companyId) {
  const { rows } = await pool.query(
    `SELECT id, company_id, name, display_name, icon_url, greeting_message, password_hash,
            ai_mode,
            theme_primary_color, theme_primary_dark_color,
            theme_secondary_color, theme_secondary_light_color,
            theme_header_background, theme_header_shadow, theme_header_text_color,
            lead_email_notifications_enabled,
            lead_notification_email,
            agent_paused,
            voice_mode_enabled,
            voice_gender,
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

async function setPassword(companyId, passwordHash) {
  await pool.query(
    `UPDATE chatbots SET password_hash = $1 WHERE company_id = $2`,
    [passwordHash, companyId]
  );
}

async function updateSettings(companyId, {
  display_name,
  icon_url,
  greeting_message,
  ai_mode,
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
  voice_gender,
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
  const updates = [];
  const values = [];
  let i = 1;
  if (display_name !== undefined) {
    updates.push(`display_name = $${i++}`);
    values.push(display_name);
  }
  if (icon_url !== undefined) {
    updates.push(`icon_url = $${i++}`);
    values.push(icon_url);
  }
  if (greeting_message !== undefined) {
    updates.push(`greeting_message = $${i++}`);
    values.push(greeting_message);
  }
  if (ai_mode !== undefined) {
    updates.push(`ai_mode = $${i++}`);
    values.push(ai_mode);
  }
  if (theme_primary_color !== undefined) {
    updates.push(`theme_primary_color = $${i++}`);
    values.push(theme_primary_color);
  }
  if (theme_primary_dark_color !== undefined) {
    updates.push(`theme_primary_dark_color = $${i++}`);
    values.push(theme_primary_dark_color);
  }
  if (theme_secondary_color !== undefined) {
    updates.push(`theme_secondary_color = $${i++}`);
    values.push(theme_secondary_color);
  }
  if (theme_secondary_light_color !== undefined) {
    updates.push(`theme_secondary_light_color = $${i++}`);
    values.push(theme_secondary_light_color);
  }
  if (theme_header_background !== undefined) {
    updates.push(`theme_header_background = $${i++}`);
    values.push(theme_header_background || null);
  }
  if (theme_header_shadow !== undefined) {
    updates.push(`theme_header_shadow = $${i++}`);
    values.push(theme_header_shadow || null);
  }
  if (theme_header_text_color !== undefined) {
    updates.push(`theme_header_text_color = $${i++}`);
    values.push(theme_header_text_color || null);
  }
  if (lead_email_notifications_enabled !== undefined) {
    updates.push(`lead_email_notifications_enabled = $${i++}`);
    values.push(Boolean(lead_email_notifications_enabled));
  }
  if (lead_notification_email !== undefined) {
    updates.push(`lead_notification_email = $${i++}`);
    values.push(lead_notification_email || null);
  }
  if (voice_mode_enabled !== undefined) {
    updates.push(`voice_mode_enabled = $${i++}`);
    values.push(Boolean(voice_mode_enabled));
  }
  if (voice_gender !== undefined) {
    updates.push(`voice_gender = $${i++}`);
    values.push(String(voice_gender || 'female').toLowerCase() === 'male' ? 'male' : 'female');
  }
  if (voice_ignore_emoji !== undefined) {
    updates.push(`voice_ignore_emoji = $${i++}`);
    values.push(Boolean(voice_ignore_emoji));
  }
  if (voice_response_enabled !== undefined) {
    updates.push(`voice_response_enabled = $${i++}`);
    values.push(Boolean(voice_response_enabled));
  }
  if (escalation_trigger_user_requests_human !== undefined) {
    updates.push(`escalation_trigger_user_requests_human = $${i++}`);
    values.push(Boolean(escalation_trigger_user_requests_human));
  }
  if (escalation_trigger_ai_confidence_low !== undefined) {
    updates.push(`escalation_trigger_ai_confidence_low = $${i++}`);
    values.push(Boolean(escalation_trigger_ai_confidence_low));
  }
  if (escalation_trigger_urgent_keywords !== undefined) {
    updates.push(`escalation_trigger_urgent_keywords = $${i++}`);
    values.push(Boolean(escalation_trigger_urgent_keywords));
  }
  if (escalation_trigger_angry_sentiment !== undefined) {
    updates.push(`escalation_trigger_angry_sentiment = $${i++}`);
    values.push(Boolean(escalation_trigger_angry_sentiment));
  }
  if (escalation_trigger_high_value_lead !== undefined) {
    updates.push(`escalation_trigger_high_value_lead = $${i++}`);
    values.push(Boolean(escalation_trigger_high_value_lead));
  }
  if (escalation_action_instant_notification !== undefined) {
    updates.push(`escalation_action_instant_notification = $${i++}`);
    values.push(Boolean(escalation_action_instant_notification));
  }
  if (escalation_action_auto_schedule_meeting !== undefined) {
    updates.push(`escalation_action_auto_schedule_meeting = $${i++}`);
    values.push(Boolean(escalation_action_auto_schedule_meeting));
  }
  if (escalation_action_chat_takeover_alert !== undefined) {
    updates.push(`escalation_action_chat_takeover_alert = $${i++}`);
    values.push(Boolean(escalation_action_chat_takeover_alert));
  }
  if (escalation_high_value_lead_score_threshold !== undefined) {
    updates.push(`escalation_high_value_lead_score_threshold = $${i++}`);
    values.push(Number(escalation_high_value_lead_score_threshold));
  }

  if (safety_block_topics_enabled !== undefined) {
    updates.push(`safety_block_topics_enabled = $${i++}`);
    values.push(Boolean(safety_block_topics_enabled));
  }
  if (safety_block_topics !== undefined) {
    updates.push(`safety_block_topics = $${i++}`);
    values.push(safety_block_topics || null);
  }
  if (safety_prevent_internal_data !== undefined) {
    updates.push(`safety_prevent_internal_data = $${i++}`);
    values.push(Boolean(safety_prevent_internal_data));
  }
  if (safety_restrict_database_price_exposure !== undefined) {
    updates.push(`safety_restrict_database_price_exposure = $${i++}`);
    values.push(Boolean(safety_restrict_database_price_exposure));
  }
  if (safety_disable_competitor_comparisons !== undefined) {
    updates.push(`safety_disable_competitor_comparisons = $${i++}`);
    values.push(Boolean(safety_disable_competitor_comparisons));
  }
  if (safety_restrict_file_sharing !== undefined) {
    updates.push(`safety_restrict_file_sharing = $${i++}`);
    values.push(Boolean(safety_restrict_file_sharing));
  }

  if (language_primary !== undefined) {
    updates.push(`language_primary = $${i++}`);
    values.push(String(language_primary || 'English').slice(0, 50));
  }
  if (language_multi_enabled !== undefined) {
    updates.push(`language_multi_enabled = $${i++}`);
    values.push(Boolean(language_multi_enabled));
  }
  if (language_auto_detect_enabled !== undefined) {
    updates.push(`language_auto_detect_enabled = $${i++}`);
    values.push(Boolean(language_auto_detect_enabled));
  }
  if (language_manual_switch_enabled !== undefined) {
    updates.push(`language_manual_switch_enabled = $${i++}`);
    values.push(Boolean(language_manual_switch_enabled));
  }
  if (updates.length === 0) return;
  values.push(companyId);
  await pool.query(
    `UPDATE chatbots SET ${updates.join(', ')} WHERE company_id = $${i}`,
    values
  );
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
  values.push(companyId);
  await pool.query(
    `UPDATE chatbots SET ${updates.join(', ')} WHERE company_id = $${i}`,
    values
  );
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
  await pool.query(
    `UPDATE chatbots SET agent_paused = $1 WHERE company_id = $2`,
    [Boolean(paused), companyId]
  );
}

module.exports = {
  findByCompanyId,
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
