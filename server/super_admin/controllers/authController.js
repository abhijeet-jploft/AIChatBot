const fs = require('fs');
const path = require('path');
const pool = require('../../db/index');
const SuperAdmin = require('../models/SuperAdmin');
const StaffAuth = require('../models/StaffAuth');
const { hashPassword, verifyPassword, generateToken, getSessionExpiry } = require('../../admin/utils/auth');
const { buildFullPermissionMatrix } = require('../permissions');
const { appendAuditLog } = require('../services/auditService');

const STAFF_IDLE_TIMEOUT_MINUTES = Number(process.env.SUPER_ADMIN_STAFF_IDLE_TIMEOUT_MINUTES || 120);

function getStaffSessionExpiry() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + STAFF_IDLE_TIMEOUT_MINUTES);
  return d;
}

function mapSuperAdminAuthPayload(admin, token, expiresAt) {
  return {
    id: admin.id,
    type: 'super_admin',
    username: admin.username,
    name: admin.username,
    email: admin.email || null,
    avatarUrl: admin.avatar_url || null,
    roleName: 'Super Admin',
    permissions: buildFullPermissionMatrix(),
    mustChangePassword: false,
    defaultRoute: '/super-admin',
    ...(token ? { token } : {}),
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
  };
}

function mapStaffAuthPayload(staff, token, expiresAt) {
  return {
    id: staff.id,
    type: 'staff',
    username: staff.email,
    name: staff.name,
    email: staff.email,
    avatarUrl: null,
    roleName: staff.roleName || 'Staff',
    permissions: staff.permissions,
    mustChangePassword: staff.mustChangePassword !== false,
    defaultRoute: '/super-admin/staff',
    ...(token ? { token } : {}),
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
  };
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter.';
  if (!/\d/.test(value)) return 'Password must include at least one number.';
  return null;
}

// POST /super-admin/auth/setup  — only allowed when no super admin exists yet
async function setup(req, res) {
  try {
    const count = await SuperAdmin.countAll();
    if (count > 0) {
      return res.status(400).json({ error: 'Super admin already set up. Use login instead.' });
    }

    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const hash = hashPassword(password);
    const admin = await SuperAdmin.create(String(username).trim(), email?.trim() || null, hash);

    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await SuperAdmin.createSession(admin.id, token, expiresAt);

    return res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      username: admin.username,
      email: admin.email || null,
      avatarUrl: null,
    });
  } catch (err) {
    console.error('[super admin auth] setup:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/auth/login
async function login(req, res) {
  try {
    const identifier = String(req.body?.username || req.body?.identifier || req.body?.email || '').trim();
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'username or email and password are required' });
    }

    const admin = await SuperAdmin.findByUsername(identifier);
    if (admin) {
      if (!admin.password_hash) {
        return res.status(400).json({ error: 'Password not set. Use /super-admin/auth/setup.' });
      }

      if (!verifyPassword(password, admin.password_hash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = generateToken();
      const expiresAt = getSessionExpiry();
      await SuperAdmin.createSession(admin.id, token, expiresAt);
      await appendAuditLog({ type: 'super_admin', id: admin.id, username: admin.username, email: admin.email }, {
        action: 'auth.login',
        targetType: 'super_admin',
        targetId: admin.id,
        targetLabel: admin.username,
      });
      return res.json(mapSuperAdminAuthPayload(admin, token, expiresAt));
    }

    const staff = await StaffAuth.findByEmail(identifier);
    if (!staff || !staff.password_hash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!staff.isActive) {
      return res.status(403).json({ error: 'This staff account is inactive' });
    }
    if (!verifyPassword(password, staff.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken();
    const expiresAt = getStaffSessionExpiry();
    await StaffAuth.createSession(staff.id, token, expiresAt);
    await StaffAuth.updateLastLogin(staff.id);
    await appendAuditLog({ type: 'staff', id: staff.id, name: staff.name, email: staff.email }, {
      action: 'auth.login',
      targetType: 'staff_user',
      targetId: staff.id,
      targetLabel: `${staff.name} <${staff.email}>`,
    });

    const refreshed = await StaffAuth.findById(staff.id);
    return res.json(mapStaffAuthPayload(refreshed, token, expiresAt));
  } catch (err) {
    console.error('[super admin auth] login:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/auth/logout
async function logout(req, res) {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      await SuperAdmin.deleteSession(token);
      await StaffAuth.deleteSession(token);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/auth/me
async function me(req, res) {
  try {
    if (req.isSuperAdmin) {
      const admin = await SuperAdmin.findById(req.superAdminId);
      if (!admin) return res.status(404).json({ error: 'Super admin not found' });
      return res.json(mapSuperAdminAuthPayload(admin));
    }

    const staff = await StaffAuth.findById(req.staffUserId);
    if (!staff) return res.status(404).json({ error: 'Staff user not found' });
    return res.json({
      id: staff.id,
      type: 'staff',
      username: staff.email,
      name: staff.name,
      email: staff.email,
      avatarUrl: null,
      roleName: staff.roleName,
      permissions: staff.permissions,
      mustChangePassword: staff.mustChangePassword,
      defaultRoute: '/super-admin/staff',
    });
  } catch (err) {
    console.error('[super admin auth] me:', err);
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /super-admin/auth/profile — username, email
async function updateProfile(req, res) {
  try {
    if (req.isSuperAdmin) {
      const username = String(req.body?.username || '').trim();
      const email = String(req.body?.email || '').trim();
      if (!username) return res.status(400).json({ error: 'username is required' });
      if (username.length < 2 || username.length > 100) {
        return res.status(400).json({ error: 'Username must be between 2 and 100 characters.' });
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        return res
          .status(400)
          .json({ error: 'Username may only contain letters, numbers, dot, underscore, and hyphen.' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
      }

      const taken = await SuperAdmin.findOtherByUsername(username, req.superAdminId);
      if (taken) return res.status(400).json({ error: 'That username is already in use.' });

      await SuperAdmin.updateProfile(req.superAdminId, username, email || null);
      const admin = await SuperAdmin.findById(req.superAdminId);
      return res.json({
        id: admin.id,
        type: 'super_admin',
        username: admin.username,
        name: admin.username,
        email: admin.email || null,
        avatarUrl: admin.avatar_url || null,
        roleName: 'Super Admin',
        permissions: buildFullPermissionMatrix(),
        mustChangePassword: false,
        defaultRoute: '/super-admin',
      });
    }

    const name = String(req.body?.name || req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const clash = await pool.query(
      `SELECT id FROM super_admin_staff_users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
      [email, req.staffUserId]
    );
    if (clash.rows.length) return res.status(400).json({ error: 'That email address is already in use.' });

    await pool.query(
      `UPDATE super_admin_staff_users SET full_name = $1, email = $2, updated_at = NOW() WHERE id = $3`,
      [name, email, req.staffUserId]
    );
    const staff = await StaffAuth.findById(req.staffUserId);
    return res.json({
      id: staff.id,
      type: 'staff',
      username: staff.email,
      name: staff.name,
      email: staff.email,
      avatarUrl: null,
      roleName: staff.roleName,
      permissions: staff.permissions,
      mustChangePassword: staff.mustChangePassword,
      defaultRoute: '/super-admin/staff',
    });
  } catch (err) {
    console.error('[super admin auth] update profile:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/auth/profile/avatar — multipart field "avatar"
async function uploadProfileAvatar(req, res) {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: 'Staff profile avatars are not enabled for this module.' });
    }
    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ error: 'Image file is required (field name: avatar).' });

    const mime = String(file.mimetype || '').toLowerCase();
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(mime)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' });
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extMap[mime] || 'bin';
    const dir = path.join(__dirname, '../../../uploads/super-admin');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${req.superAdminId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);

    const publicUrl = `/uploads/super-admin/${filename}`;
    await SuperAdmin.setAvatarUrl(req.superAdminId, publicUrl);
    const admin = await SuperAdmin.findById(req.superAdminId);
    return res.json({
      avatarUrl: admin.avatar_url || null,
      id: admin.id,
      username: admin.username,
      email: admin.email || null,
    });
  } catch (err) {
    console.error('[super admin auth] upload avatar:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/auth/change-password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    if (req.isSuperAdmin) {
      const admin = await SuperAdmin.findById(req.superAdminId);
      if (!admin) return res.status(404).json({ error: 'Super admin not found' });

      const fullAdmin = await SuperAdmin.findByUsername(admin.username);
      if (!verifyPassword(currentPassword, fullAdmin.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hash = hashPassword(newPassword);
      await SuperAdmin.setPassword(req.superAdminId, hash);
      await SuperAdmin.deleteAllSessions(req.superAdminId);

      return res.json({ ok: true, message: 'Password changed. Please log in again.' });
    }

    const staff = await StaffAuth.findById(req.staffUserId);
    if (!staff) return res.status(404).json({ error: 'Staff user not found' });
    if (!verifyPassword(currentPassword, staff.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = hashPassword(newPassword);
    await StaffAuth.setPassword(req.staffUserId, hash, false);
    await StaffAuth.deleteAllSessions(req.staffUserId);
    await appendAuditLog({ type: 'staff', id: staff.id, name: staff.name, email: staff.email }, {
      action: 'auth.password_changed',
      targetType: 'staff_user',
      targetId: staff.id,
      targetLabel: `${staff.name} <${staff.email}>`,
    });
    return res.json({ ok: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    console.error('[super admin auth] change-password:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/auth/status  — check if any super admin exists (for setup page logic)
async function status(req, res) {
  try {
    const count = await SuperAdmin.countAll();
    return res.json({ needsSetup: count === 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { setup, login, logout, me, updateProfile, uploadProfileAvatar, changePassword, status };
