const pool = require('../../db/index');

async function findByCompanyId(companyId) {
  const { rows } = await pool.query(
    `SELECT id, company_id, name, display_name, icon_url, greeting_message, password_hash
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

async function updateSettings(companyId, { display_name, icon_url, greeting_message }) {
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
  createSession,
  findSessionByToken,
  deleteSession,
};
