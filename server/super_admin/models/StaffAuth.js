const pool = require('../../db/index');
const { normalizePermissionMatrix, mergePermissionMatrices } = require('../permissions');

async function fetchRolesForStaff(staffId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.permissions
     FROM super_admin_staff_user_roles sur
     JOIN super_admin_roles r ON r.id = sur.role_id
     WHERE sur.staff_user_id = $1
     ORDER BY r.name`,
    [staffId]
  );
  return rows;
}

function mapStaffUserWithRoles(userRow, roleRows) {
  if (!userRow) return null;
  const matrices = roleRows.map((r) => normalizePermissionMatrix(r.permissions));
  const permissions = mergePermissionMatrices(matrices.length ? matrices : [{}]);
  const roleIds = roleRows.map((r) => r.id);
  const roleNames = roleRows.map((r) => r.name);
  return {
    id: userRow.id,
    name: userRow.full_name,
    email: userRow.email,
    password_hash: userRow.password_hash,
    roleId: roleIds[0] || null,
    roleIds,
    roleName: roleNames.length ? roleNames.join(', ') : 'Unassigned',
    permissions,
    isActive: userRow.is_active !== false,
    mustChangePassword: userRow.must_change_password !== false,
    lastLoginAt: userRow.last_login_at || null,
    lastPasswordChangeAt: userRow.last_password_change_at || null,
    createdAt: userRow.created_at || null,
  };
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.full_name,
       s.email,
       s.password_hash,
       s.is_active,
       s.must_change_password,
       s.last_login_at,
       s.last_password_change_at,
       s.created_at
     FROM super_admin_staff_users s
     WHERE LOWER(s.email) = LOWER($1)
     LIMIT 1`,
    [email]
  );
  const user = rows[0];
  if (!user) return null;
  const roleRows = await fetchRolesForStaff(user.id);
  return mapStaffUserWithRoles(user, roleRows);
}

async function findById(staffId) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.full_name,
       s.email,
       s.password_hash,
       s.is_active,
       s.must_change_password,
       s.last_login_at,
       s.last_password_change_at,
       s.created_at
     FROM super_admin_staff_users s
     WHERE s.id = $1`,
    [staffId]
  );
  const user = rows[0];
  if (!user) return null;
  const roleRows = await fetchRolesForStaff(user.id);
  return mapStaffUserWithRoles(user, roleRows);
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
       s.is_active,
       s.must_change_password,
       s.last_login_at,
       s.last_password_change_at
     FROM super_admin_staff_sessions ss
     JOIN super_admin_staff_users s ON s.id = ss.staff_user_id
     WHERE ss.token = $1
       AND ss.expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  if (!rows[0]) return null;
  const userRow = rows[0];
  const roleRows = await fetchRolesForStaff(userRow.id);
  const staff = mapStaffUserWithRoles(
    {
      id: userRow.id,
      full_name: userRow.full_name,
      email: userRow.email,
      password_hash: null,
      is_active: userRow.is_active,
      must_change_password: userRow.must_change_password,
      last_login_at: userRow.last_login_at,
      last_password_change_at: userRow.last_password_change_at,
      created_at: null,
    },
    roleRows
  );
  return {
    sessionId: userRow.session_id,
    expiresAt: userRow.expires_at,
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
  fetchRolesForStaff,
};
