const pool = require('../../db/index');

async function findByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, username, email, password_hash, avatar_url FROM super_admins WHERE username = $1 OR email = $1`,
    [username]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, username, email, avatar_url FROM super_admins WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findOtherByUsername(username, excludeId) {
  const { rows } = await pool.query(
    `SELECT id FROM super_admins WHERE username = $1 AND id <> $2`,
    [username, excludeId]
  );
  return rows[0] || null;
}

async function updateProfile(id, username, email) {
  await pool.query(
    `UPDATE super_admins SET username = $1, email = $2, updated_at = NOW() WHERE id = $3`,
    [username, email || null, id]
  );
}

async function setAvatarUrl(id, url) {
  await pool.query(
    `UPDATE super_admins SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
    [url || null, id]
  );
}

async function countAll() {
  const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM super_admins`);
  return parseInt(rows[0].n, 10);
}

async function create(username, email, passwordHash) {
  const { rows } = await pool.query(
    `INSERT INTO super_admins (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email`,
    [username, email || null, passwordHash]
  );
  return rows[0];
}

async function setPassword(id, passwordHash) {
  await pool.query(
    `UPDATE super_admins SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, id]
  );
}

async function createSession(superAdminId, token, expiresAt) {
  await pool.query(
    `INSERT INTO super_admin_sessions (super_admin_id, token, expires_at) VALUES ($1, $2, $3)`,
    [superAdminId, token, expiresAt]
  );
}

async function findSessionByToken(token) {
  const { rows } = await pool.query(
    `SELECT s.id, s.super_admin_id, s.expires_at, a.username, a.email
     FROM super_admin_sessions s
     JOIN super_admins a ON a.id = s.super_admin_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return rows[0] || null;
}

async function deleteSession(token) {
  await pool.query(`DELETE FROM super_admin_sessions WHERE token = $1`, [token]);
}

async function deleteAllSessions(superAdminId) {
  await pool.query(`DELETE FROM super_admin_sessions WHERE super_admin_id = $1`, [superAdminId]);
}

module.exports = {
  findByUsername,
  findById,
  findOtherByUsername,
  updateProfile,
  setAvatarUrl,
  countAll,
  create,
  setPassword,
  createSession,
  findSessionByToken,
  deleteSession,
  deleteAllSessions,
};
