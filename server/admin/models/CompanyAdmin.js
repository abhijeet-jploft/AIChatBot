const pool = require('../../db/index');

async function findByCompanyId(companyId) {
  const { rows } = await pool.query(
    `SELECT id, company_id, name, display_name, icon_url, greeting_message, password_hash,
            ai_mode,
            theme_primary_color, theme_primary_dark_color,
            theme_secondary_color, theme_secondary_light_color,
            theme_header_background, theme_header_shadow, theme_header_text_color,
            lead_email_notifications_enabled,
            lead_notification_email
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

module.exports = {
  findByCompanyId,
  setPassword,
  updateSettings,
  updateThemeSettings,
  createSession,
  findSessionByToken,
  deleteSession,
};
