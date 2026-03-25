const pool = require('../../db/index');
const { normalizePermissionMatrix } = require('../permissions');

function mapStaff(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    password_hash: row.password_hash,
    roleId: row.role_id,
    roleName: row.role_name || 'Unassigned',
    permissions: normalizePermissionMatrix(row.permissions),
    isActive: row.is_active !== false,
    mustChangePassword: row.must_change_password !== false,
    lastLoginAt: row.last_login_at || null,
    lastPasswordChangeAt: row.last_password_change_at || null,
    createdAt: row.created_at || null,
  };
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.full_name,
       s.email,
       s.password_hash,
       s.role_id,
       s.is_active,
       s.must_change_password,
       s.last_login_at,
       s.last_password_change_at,
       s.created_at,
       r.name AS role_name,
       r.permissions
     FROM super_admin_staff_users s
     LEFT JOIN super_admin_roles r ON r.id = s.role_id
     WHERE LOWER(s.email) = LOWER($1)
     LIMIT 1`,
    [email]
  );
  return mapStaff(rows[0]);
}

async function findById(staffId) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.full_name,
       s.email,
       s.password_hash,
       s.role_id,
       s.is_active,
       s.must_change_password,
       s.last_login_at,
       s.last_password_change_at,
       s.created_at,
       r.name AS role_name,
       r.permissions
     FROM super_admin_staff_users s
     LEFT JOIN super_admin_roles r ON r.id = s.role_id
     WHERE s.id = $1
     LIMIT 1`,
    [staffId]
  );
  return mapStaff(rows[0]);
}

async function createSession(staffId, token, expiresAt) {
  await pool.query(
    `INSERT INTO super_admin_staff_sessions (staff_user_id, token, expires_at, last_active_at)
     VALUES ($1, $2, $3, NOW())`,
    [staffId, token, expiresAt]
  );
}

async function findSessionByToken(token) {
  const { rows } = await pool.query(
    `SELECT
       ss.id AS session_id,
       ss.expires_at,
       s.id,
       s.full_name,
       s.email,
       s.role_id,
       s.is_active,
       s.must_change_password,
       s.last_login_at,
       s.last_password_change_at,
       r.name AS role_name,
       r.permissions
     FROM super_admin_staff_sessions ss
     JOIN super_admin_staff_users s ON s.id = ss.staff_user_id
     LEFT JOIN super_admin_roles r ON r.id = s.role_id
     WHERE ss.token = $1
       AND ss.expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  if (!rows[0]) return null;
  const staff = mapStaff(rows[0]);
  return {
    sessionId: rows[0].session_id,
    expiresAt: rows[0].expires_at,
    staff,
  };
}

async function touchSession(sessionId, expiresAt) {
  await pool.query(
    `UPDATE super_admin_staff_sessions
     SET last_active_at = NOW(), expires_at = $2
     WHERE id = $1`,
    [sessionId, expiresAt]
  );
}

async function updateLastLogin(staffId) {
  await pool.query(
    `UPDATE super_admin_staff_users
     SET last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [staffId]
  );
}

async function setPassword(staffId, passwordHash, mustChangePassword = false) {
  await pool.query(
    `UPDATE super_admin_staff_users
     SET password_hash = $2,
         must_change_password = $3,
         last_password_change_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [staffId, passwordHash, mustChangePassword]
  );
}

async function deleteSession(token) {
  await pool.query(`DELETE FROM super_admin_staff_sessions WHERE token = $1`, [token]);
}

async function deleteAllSessions(staffId) {
  await pool.query(`DELETE FROM super_admin_staff_sessions WHERE staff_user_id = $1`, [staffId]);
}

module.exports = {
  findByEmail,
  findById,
  createSession,
  findSessionByToken,
  touchSession,
  updateLastLogin,
  setPassword,
  deleteSession,
  deleteAllSessions,
};