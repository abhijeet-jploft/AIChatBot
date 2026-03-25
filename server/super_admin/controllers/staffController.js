const crypto = require('crypto');
const pool = require('../../db/index');
const { hashPassword } = require('../../admin/utils/auth');
const {
  ACCESS_LEVELS,
  PERMISSION_MODULES,
  normalizePermissionMatrix,
} = require('../permissions');
const { appendAuditLog, listAuditLogs } = require('../services/auditService');
const { sendStaffInvitation } = require('../services/invitationService');

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function makeTemporaryPassword() {
  return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + 'aA1';
}

async function ensureRoleExists(roleId) {
  const { rows } = await pool.query(
    `SELECT id, name, description, permissions, is_system, created_at, updated_at
     FROM super_admin_roles
     WHERE id = $1`,
    [roleId]
  );
  return rows[0] || null;
}

async function listRoles(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.id,
         r.name,
         r.description,
         r.permissions,
         r.is_system,
         r.created_at,
         r.updated_at,
         COUNT(s.id)::int AS staff_count
       FROM super_admin_roles r
       LEFT JOIN super_admin_staff_users s ON s.role_id = r.id
       GROUP BY r.id
       ORDER BY r.created_at DESC`
    );
    return res.json({
      rows: rows.map((row) => ({
        ...row,
        permissions: normalizePermissionMatrix(row.permissions),
      })),
    });
  } catch (err) {
    console.error('[super admin] listRoles:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function createRole(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim() || null;
    const permissions = normalizePermissionMatrix(req.body?.permissions);

    if (!name) return res.status(400).json({ error: 'Role name is required' });

    const clash = await pool.query(
      `SELECT id FROM super_admin_roles WHERE LOWER(name) = LOWER($1)`,
      [name]
    );
    if (clash.rows.length) return res.status(409).json({ error: 'A role with this name already exists' });

    const { rows } = await pool.query(
      `INSERT INTO super_admin_roles (name, description, permissions)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, permissions, is_system, created_at, updated_at`,
      [name, description, JSON.stringify(permissions)]
    );

    await appendAuditLog(req, {
      action: 'role.created',
      targetType: 'role',
      targetId: rows[0].id,
      targetLabel: rows[0].name,
      metadata: { permissions },
    });

    return res.status(201).json({
      ...rows[0],
      permissions: normalizePermissionMatrix(rows[0].permissions),
    });
  } catch (err) {
    console.error('[super admin] createRole:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateRole(req, res) {
  try {
    const { roleId } = req.params;
    const existing = await ensureRoleExists(roleId);
    if (!existing) return res.status(404).json({ error: 'Role not found' });

    const updates = ['updated_at = NOW()'];
    const params = [];

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Role name cannot be empty' });
      const clash = await pool.query(
        `SELECT id FROM super_admin_roles WHERE LOWER(name) = LOWER($1) AND id <> $2`,
        [name, roleId]
      );
      if (clash.rows.length) return res.status(409).json({ error: 'A role with this name already exists' });
      updates.push(`name = $${params.length + 1}`);
      params.push(name);
    }

    if (req.body?.description !== undefined) {
      updates.push(`description = $${params.length + 1}`);
      params.push(String(req.body.description || '').trim() || null);
    }

    if (req.body?.permissions !== undefined) {
      updates.push(`permissions = $${params.length + 1}`);
      params.push(JSON.stringify(normalizePermissionMatrix(req.body.permissions)));
    }

    params.push(roleId);
    const { rows } = await pool.query(
      `UPDATE super_admin_roles
       SET ${updates.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, name, description, permissions, is_system, created_at, updated_at`,
      params
    );

    await appendAuditLog(req, {
      action: 'role.updated',
      targetType: 'role',
      targetId: rows[0].id,
      targetLabel: rows[0].name,
      metadata: {
        previousName: existing.name,
        permissions: normalizePermissionMatrix(rows[0].permissions),
      },
    });

    return res.json({
      ...rows[0],
      permissions: normalizePermissionMatrix(rows[0].permissions),
    });
  } catch (err) {
    console.error('[super admin] updateRole:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteRole(req, res) {
  try {
    const { roleId } = req.params;
    const replacementRoleId = req.body?.replacementRoleId || null;
    const existing = await ensureRoleExists(roleId);
    if (!existing) return res.status(404).json({ error: 'Role not found' });
    if (existing.is_system) return res.status(400).json({ error: 'System roles cannot be deleted' });

    const assignmentResult = await pool.query(
      `SELECT COUNT(*)::int AS n FROM super_admin_staff_users WHERE role_id = $1`,
      [roleId]
    );
    const assignedCount = Number(assignmentResult.rows[0]?.n || 0);

    if (assignedCount > 0 && !replacementRoleId) {
      return res.status(409).json({
        error: 'Role is assigned to staff members. Provide replacementRoleId to reassign them before deletion.',
        assignedCount,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (assignedCount > 0) {
        const replacement = await client.query(
          `SELECT id, name FROM super_admin_roles WHERE id = $1`,
          [replacementRoleId]
        );
        if (!replacement.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Replacement role not found' });
        }
        await client.query(
          `UPDATE super_admin_staff_users SET role_id = $2, updated_at = NOW() WHERE role_id = $1`,
          [roleId, replacementRoleId]
        );
      }
      await client.query(`DELETE FROM super_admin_roles WHERE id = $1`, [roleId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await appendAuditLog(req, {
      action: 'role.deleted',
      targetType: 'role',
      targetId: roleId,
      targetLabel: existing.name,
      metadata: { assignedCount, replacementRoleId: replacementRoleId || null },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] deleteRole:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function listStaffUsers(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.full_name,
         s.email,
         s.role_id,
         s.is_active,
         s.must_change_password,
         s.last_login_at,
         s.last_password_change_at,
         s.created_at,
         s.updated_at,
         r.name AS role_name
       FROM super_admin_staff_users s
       LEFT JOIN super_admin_roles r ON r.id = s.role_id
       ORDER BY s.created_at DESC`
    );
    return res.json({ rows });
  } catch (err) {
    console.error('[super admin] listStaffUsers:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function createStaffUser(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const roleId = String(req.body?.roleId || '').trim();

    if (!name) return res.status(400).json({ error: 'Staff name is required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });

    const role = await ensureRoleExists(roleId);
    if (!role) return res.status(400).json({ error: 'Role not found' });

    const clash = await pool.query(
      `SELECT id FROM super_admin_staff_users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (clash.rows.length) return res.status(409).json({ error: 'A staff account with this email already exists' });

    const temporaryPassword = makeTemporaryPassword();
    const passwordHash = hashPassword(temporaryPassword);

    const { rows } = await pool.query(
      `INSERT INTO super_admin_staff_users (full_name, email, password_hash, role_id, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, full_name, email, role_id, is_active, must_change_password, last_login_at, last_password_change_at, created_at, updated_at`,
      [name, email, passwordHash, roleId]
    );

    const loginUrl = `${req.protocol}://${req.get('host')}/super-admin/login`;
    const invite = await sendStaffInvitation({
      name,
      email,
      roleName: role.name,
      temporaryPassword,
      loginUrl,
      invitedBy: req.authUser?.username || req.authUser?.name || req.authUser?.email || 'Super Admin',
    });

    await appendAuditLog(req, {
      action: 'staff.created',
      targetType: 'staff_user',
      targetId: rows[0].id,
      targetLabel: `${name} <${email}>`,
      metadata: { roleId, roleName: role.name, invitationSent: invite.sent === true },
    });

    return res.status(201).json({
      user: {
        ...rows[0],
        role_name: role.name,
      },
      invite,
      temporaryPassword,
    });
  } catch (err) {
    console.error('[super admin] createStaffUser:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateStaffUser(req, res) {
  try {
    const { staffId } = req.params;
    const existingRes = await pool.query(
      `SELECT id, full_name, email, role_id, is_active FROM super_admin_staff_users WHERE id = $1`,
      [staffId]
    );
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: 'Staff user not found' });

    if (req.authUser?.type === 'staff' && req.authUser?.id === staffId) {
      return res.status(403).json({ error: 'You cannot change your own staff assignment from this screen' });
    }

    const updates = ['updated_at = NOW()'];
    const params = [];

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Staff name cannot be empty' });
      updates.push(`full_name = $${params.length + 1}`);
      params.push(name);
    }

    if (req.body?.email !== undefined) {
      const email = normalizeEmail(req.body.email);
      if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
      const clash = await pool.query(
        `SELECT id FROM super_admin_staff_users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
        [email, staffId]
      );
      if (clash.rows.length) return res.status(409).json({ error: 'A staff account with this email already exists' });
      updates.push(`email = $${params.length + 1}`);
      params.push(email);
    }

    if (req.body?.roleId !== undefined) {
      const role = await ensureRoleExists(req.body.roleId);
      if (!role) return res.status(400).json({ error: 'Role not found' });
      updates.push(`role_id = $${params.length + 1}`);
      params.push(role.id);
    }

    if (req.body?.isActive !== undefined) {
      updates.push(`is_active = $${params.length + 1}`);
      params.push(Boolean(req.body.isActive));
    }

    params.push(staffId);
    const { rows } = await pool.query(
      `UPDATE super_admin_staff_users
       SET ${updates.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, full_name, email, role_id, is_active, must_change_password, last_login_at, last_password_change_at, created_at, updated_at`,
      params
    );

    const roleNameRes = await pool.query(`SELECT name FROM super_admin_roles WHERE id = $1`, [rows[0].role_id]);
    const roleName = roleNameRes.rows[0]?.name || 'Unassigned';

    await appendAuditLog(req, {
      action: 'staff.updated',
      targetType: 'staff_user',
      targetId: staffId,
      targetLabel: `${rows[0].full_name} <${rows[0].email}>`,
      metadata: {
        previousRoleId: existing.role_id,
        nextRoleId: rows[0].role_id,
        isActive: rows[0].is_active,
      },
    });

    return res.json({
      ...rows[0],
      role_name: roleName,
    });
  } catch (err) {
    console.error('[super admin] updateStaffUser:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function resetStaffPassword(req, res) {
  try {
    const { staffId } = req.params;
    const { rows } = await pool.query(
      `SELECT s.id, s.full_name, s.email, r.name AS role_name
       FROM super_admin_staff_users s
       LEFT JOIN super_admin_roles r ON r.id = s.role_id
       WHERE s.id = $1`,
      [staffId]
    );
    const staff = rows[0];
    if (!staff) return res.status(404).json({ error: 'Staff user not found' });

    const temporaryPassword = makeTemporaryPassword();
    await pool.query(
      `UPDATE super_admin_staff_users
       SET password_hash = $2,
           must_change_password = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [staffId, hashPassword(temporaryPassword)]
    );
    await pool.query(`DELETE FROM super_admin_staff_sessions WHERE staff_user_id = $1`, [staffId]);

    const loginUrl = `${req.protocol}://${req.get('host')}/super-admin/login`;
    const invite = await sendStaffInvitation({
      name: staff.full_name,
      email: staff.email,
      roleName: staff.role_name,
      temporaryPassword,
      loginUrl,
      invitedBy: req.authUser?.username || req.authUser?.name || req.authUser?.email || 'Super Admin',
    });

    await appendAuditLog(req, {
      action: 'staff.password_reset',
      targetType: 'staff_user',
      targetId: staff.id,
      targetLabel: `${staff.full_name} <${staff.email}>`,
      metadata: { invitationSent: invite.sent === true },
    });

    return res.json({ ok: true, invite, temporaryPassword });
  } catch (err) {
    console.error('[super admin] resetStaffPassword:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteStaffUser(req, res) {
  try {
    const { staffId } = req.params;
    if (req.authUser?.type === 'staff' && req.authUser?.id === staffId) {
      return res.status(403).json({ error: 'You cannot delete your own staff account' });
    }

    const { rows } = await pool.query(
      `DELETE FROM super_admin_staff_users
       WHERE id = $1
       RETURNING id, full_name, email`,
      [staffId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staff user not found' });

    await appendAuditLog(req, {
      action: 'staff.deleted',
      targetType: 'staff_user',
      targetId: rows[0].id,
      targetLabel: `${rows[0].full_name} <${rows[0].email}>`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] deleteStaffUser:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getOverview(req, res) {
  try {
    const [roles, staff, activeStaff, pendingPassword, recentLogins, auditRows] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM super_admin_roles`),
      pool.query(`SELECT COUNT(*)::int AS n FROM super_admin_staff_users`),
      pool.query(`SELECT COUNT(*)::int AS n FROM super_admin_staff_users WHERE is_active = TRUE`),
      pool.query(`SELECT COUNT(*)::int AS n FROM super_admin_staff_users WHERE must_change_password = TRUE`),
      pool.query(
        `SELECT full_name, email, last_login_at
         FROM super_admin_staff_users
         WHERE last_login_at IS NOT NULL
         ORDER BY last_login_at DESC
         LIMIT 5`
      ),
      listAuditLogs(12, 0),
    ]);

    return res.json({
      counts: {
        roles: Number(roles.rows[0]?.n || 0),
        staff: Number(staff.rows[0]?.n || 0),
        activeStaff: Number(activeStaff.rows[0]?.n || 0),
        pendingPasswordChanges: Number(pendingPassword.rows[0]?.n || 0),
      },
      recentLogins: recentLogins.rows,
      auditLogs: auditRows,
    });
  } catch (err) {
    console.error('[super admin] getOverview:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getAuditLogs(req, res) {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = await listAuditLogs(limit, offset);
    return res.json({ rows, limit, offset });
  } catch (err) {
    console.error('[super admin] getAuditLogs:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getPermissionCatalog(req, res) {
  return res.json({ modules: PERMISSION_MODULES, accessLevels: ACCESS_LEVELS });
}

module.exports = {
  getOverview,
  getPermissionCatalog,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listStaffUsers,
  createStaffUser,
  updateStaffUser,
  resetStaffPassword,
  deleteStaffUser,
  getAuditLogs,
};