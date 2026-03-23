const SuperAdmin = require('../models/SuperAdmin');
const { hashPassword, verifyPassword, generateToken, getSessionExpiry } = require('../../admin/utils/auth');

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

    return res.json({ token, expiresAt: expiresAt.toISOString(), username: admin.username });
  } catch (err) {
    console.error('[super admin auth] setup:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/auth/login
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const admin = await SuperAdmin.findByUsername(String(username).trim());
    if (!admin) return res.status(401).json({ error: 'Invalid username or password' });

    if (!admin.password_hash) {
      return res.status(400).json({ error: 'Password not set. Use /super-admin/auth/setup.' });
    }

    if (!verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await SuperAdmin.createSession(admin.id, token, expiresAt);

    return res.json({ token, expiresAt: expiresAt.toISOString(), username: admin.username });
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
    if (token) await SuperAdmin.deleteSession(token);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/auth/me
async function me(req, res) {
  return res.json({ id: req.superAdminId, username: req.superAdminUsername });
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

module.exports = { setup, login, logout, me, changePassword, status };
