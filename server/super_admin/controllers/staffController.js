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

function normalizeStaffRoleIds(body) {
  if (Array.isArray(body?.roleIds)) {
    return [...new Set(body.roleIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  const single = String(body?.roleId || '').trim();
  return single ? [single] : [];
}

async function loadRolesByIds(roleIds) {
  if (!roleIds.length) return [];
  const { rows } = await pool.query(
    `SELECT id, name FROM super_admin_roles WHERE id = ANY($1::uuid[])`,
    [roleIds]
  );
  return rows;
}

async function replaceStaffRoleAssignments(db, staffUserId, roleIds) {
  await db.query(`DELETE FROM super_admin_staff_user_roles WHERE staff_user_id = $1`, [staffUserId]);
  for (const rid of roleIds) {
    await db.query(
      `INSERT INTO super_admin_staff_user_roles (staff_user_id, role_id) VALUES ($1, $2)`,
      [staffUserId, rid]
    );
  }
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
         COUNT(sur.staff_user_id)::int AS staff_count
       FROM super_admin_roles r
       LEFT JOIN super_admin_staff_user_roles sur ON sur.role_id = r.id
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
      `SELECT COUNT(DISTINCT staff_user_id)::int AS n FROM super_admin_staff_user_roles WHERE role_id = $1`,
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
          `INSERT INTO super_admin_staff_user_roles (staff_user_id, role_id)
           SELECT DISTINCT staff_user_id, $2::uuid
           FROM super_admin_staff_user_roles
           WHERE role_id = $1
           ON CONFLICT DO NOTHING`,
          [roleId, replacementRoleId]
        );
        await client.query(`DELETE FROM super_admin_staff_user_roles WHERE role_id = $1`, [roleId]);
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeStaffSearchQ(raw) {
  return String(raw || '').trim().replace(/[%_\\]/g, '');
}

async function listStaffUsers(req, res) {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 20));
    let page = Math.max(1, Number(req.query.page) || 1);
    const qClean = sanitizeStaffSearchQ(req.query.q);
    const status = String(req.query.status || 'all').toLowerCase();
    const roleIdRaw = String(req.query.roleId || '').trim();

    const cteFrom = `
      WITH staff_agg AS (
        SELECT
          s.id,
          s.full_name,
          s.email,
          s.is_active,
          s.must_change_password,
          s.last_login_at,
          s.last_password_change_at,
          s.created_at,
          s.updated_at,
          COALESCE(
            string_agg(r.name, ', ' ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL),
            ''
          ) AS role_name,
          COALESCE(
            array_agg(r.id ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL),
            ARRAY[]::uuid[]
          ) AS role_ids
        FROM super_admin_staff_users s
        LEFT JOIN super_admin_staff_user_roles sur ON sur.staff_user_id = s.id
        LEFT JOIN super_admin_roles r ON r.id = sur.role_id
        GROUP BY s.id
      )
      SELECT * FROM staff_agg sa`;

    const conditions = [];
    const params = [];
    let p = 1;

    if (qClean) {
      conditions.push(`(sa.full_name ILIKE $${p} OR sa.email ILIKE $${p})`);
      params.push(`%${qClean}%`);
      p += 1;
    }
    if (status === 'active') {
      conditions.push('sa.is_active = TRUE');
    } else if (status === 'inactive') {
      conditions.push('sa.is_active = FALSE');
    }
    if (roleIdRaw && UUID_RE.test(roleIdRaw)) {
      conditions.push(`$${p}::uuid = ANY(sa.role_ids)`);
      params.push(roleIdRaw);
      p += 1;
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const filteredSql = `${cteFrom} ${whereSql}`;

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM (${filteredSql}) t`,
      params
    );
    const total = Number(countRows[0]?.n || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    page = Math.min(page, totalPages);
    const offset = (page - 1) * limit;

    const listParams = [...params, limit, offset];
    const limitPh = `$${p}`;
    const offsetPh = `$${p + 1}`;

    const { rows } = await pool.query(
      `${filteredSql} ORDER BY sa.created_at DESC LIMIT ${limitPh} OFFSET ${offsetPh}`,
      listParams
    );

    return res.json({
      rows,
      total,
      limit,
      page,
      totalPages,
    });
  } catch (err) {
    console.error('[super admin] listStaffUsers:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function createStaffUser(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const roleIds = normalizeStaffRoleIds(req.body);

    if (!name) return res.status(400).json({ error: 'Staff name is required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (!roleIds.length) return res.status(400).json({ error: 'At least one role is required (roleIds or roleId)' });

    const rolesFound = await loadRolesByIds(roleIds);
    if (rolesFound.length !== roleIds.length) {
      return res.status(400).json({ error: 'One or more roles were not found' });
    }

    const clash = await pool.query(
      `SELECT id FROM super_admin_staff_users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (clash.rows.length) return res.status(409).json({ error: 'A staff account with this email already exists' });

    const temporaryPassword = makeTemporaryPassword();
    const passwordHash = hashPassword(temporaryPassword);

    const client = await pool.connect();
    let userRow;
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO super_admin_staff_users (full_name, email, password_hash, must_change_password)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id, full_name, email, is_active, must_change_password, last_login_at, last_password_change_at, created_at, updated_at`,
        [name, email, passwordHash]
      );
      userRow = ins.rows[0];
      await replaceStaffRoleAssignments(client, userRow.id, roleIds);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const roleNameLabel = rolesFound.map((r) => r.name).join(', ');

    const loginUrl = `${req.protocol}://${req.get('host')}/super-admin/login`;
    const invite = await sendStaffInvitation({
      name,
      email,
      roleName: roleNameLabel,
      temporaryPassword,
      loginUrl,
      invitedBy: req.authUser?.username || req.authUser?.name || req.authUser?.email || 'Super Admin',
    });

    await appendAuditLog(req, {
      action: 'staff.created',
      targetType: 'staff_user',
      targetId: userRow.id,
      targetLabel: `${name} <${email}>`,
      metadata: { roleIds, roleName: roleNameLabel, invitationSent: invite.sent === true },
    });

    return res.status(201).json({
      user: {
        ...userRow,
        role_name: roleNameLabel,
        role_ids: roleIds,
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
      `SELECT id, full_name, email, is_active FROM super_admin_staff_users WHERE id = $1`,
      [staffId]
    );
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: 'Staff user not found' });

    const roleIdsInBody = req.body?.roleIds !== undefined || req.body?.roleId !== undefined;
    if (roleIdsInBody && req.authUser?.type === 'staff' && req.authUser?.id === staffId) {
      return res.status(403).json({ error: 'You cannot change your own staff assignment from this screen' });
    }

    const prevRolesRes = await pool.query(
      `SELECT role_id FROM super_admin_staff_user_roles WHERE staff_user_id = $1 ORDER BY role_id`,
      [staffId]
    );
    const previousRoleIds = prevRolesRes.rows.map((r) => r.role_id);

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

    if (req.body?.isActive !== undefined) {
      updates.push(`is_active = $${params.length + 1}`);
      params.push(Boolean(req.body.isActive));
    }

    let nextRoleIds = previousRoleIds;
    if (roleIdsInBody) {
      nextRoleIds = normalizeStaffRoleIds(req.body);
      if (!nextRoleIds.length) return res.status(400).json({ error: 'At least one role is required' });
      const rolesFound = await loadRolesByIds(nextRoleIds);
      if (rolesFound.length !== nextRoleIds.length) {
        return res.status(400).json({ error: 'One or more roles were not found' });
      }
    }

    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      params.push(staffId);
      const { rows } = await client.query(
        `UPDATE super_admin_staff_users
         SET ${updates.join(', ')}
         WHERE id = $${params.length}
         RETURNING id, full_name, email, is_active, must_change_password, last_login_at, last_password_change_at, created_at, updated_at`,
        params
      );
      row = rows[0];
      if (roleIdsInBody) {
        await replaceStaffRoleAssignments(client, staffId, nextRoleIds);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const namesRes = await pool.query(
      `SELECT string_agg(r.name, ', ' ORDER BY r.name) AS role_name
       FROM super_admin_staff_user_roles sur
       JOIN super_admin_roles r ON r.id = sur.role_id
       WHERE sur.staff_user_id = $1`,
      [staffId]
    );
    const roleName = namesRes.rows[0]?.role_name || 'Unassigned';

    await appendAuditLog(req, {
      action: 'staff.updated',
      targetType: 'staff_user',
      targetId: staffId,
      targetLabel: `${row.full_name} <${row.email}>`,
      metadata: {
        previousRoleIds: roleIdsInBody ? previousRoleIds : undefined,
        nextRoleIds: roleIdsInBody ? nextRoleIds : undefined,
        isActive: row.is_active,
      },
    });

    const idsRes = await pool.query(
      `SELECT array_agg(role_id ORDER BY role_id) AS role_ids FROM super_admin_staff_user_roles WHERE staff_user_id = $1`,
      [staffId]
    );

    return res.json({
      ...row,
      role_name: roleName,
      role_ids: idsRes.rows[0]?.role_ids || [],
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
      `SELECT s.id, s.full_name, s.email,
        COALESCE((
          SELECT string_agg(r.name, ', ' ORDER BY r.name)
          FROM super_admin_staff_user_roles sur
          JOIN super_admin_roles r ON r.id = sur.role_id
          WHERE sur.staff_user_id = s.id
        ), '') AS role_name
       FROM super_admin_staff_users s
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
      listAuditLogs({ limit: 12, offset: 0 }),
    ]);

    return res.json({
      counts: {
        roles: Number(roles.rows[0]?.n || 0),
        staff: Number(staff.rows[0]?.n || 0),
        activeStaff: Number(activeStaff.rows[0]?.n || 0),
        pendingPasswordChanges: Number(pendingPassword.rows[0]?.n || 0),
      },
      recentLogins: recentLogins.rows,
      auditLogs: auditRows.rows,
    });
  } catch (err) {
    console.error('[super admin] getOverview:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getAuditLogs(req, res) {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    let offset = Math.max(0, Number(req.query.offset) || 0);
    if (req.query.page != null && req.query.offset == null) {
      offset = (page - 1) * limit;
    }

    const result = await listAuditLogs({
      limit,
      offset,
      search: req.query.q || req.query.search,
      actorType: req.query.actorType,
      action: req.query.action,
      targetType: req.query.targetType,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / limit));
    return res.json({
      rows: result.rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      page: Math.floor(result.offset / limit) + 1,
      totalPages,
    });
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