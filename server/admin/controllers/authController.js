const CompanyAdmin = require('../models/CompanyAdmin');
const { hashPassword, verifyPassword, generateToken, getSessionExpiry } = require('../utils/auth');

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[a-z]/.test(value)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/\d/.test(value)) {
    return 'Password must include at least one number.';
  }
  return null;
}

async function login(req, res) {
  try {
    const { companyId, password } = req.body;
    if (!companyId || !password) {
      return res.status(400).json({ error: 'companyId and password are required' });
    }

    const cid = String(companyId).trim();
    const company = await CompanyAdmin.findByCompanyId(cid);
    if (!company) {
      return res.status(401).json({ error: 'Invalid company ID' });
    }

    if (!company.password_hash) {
      return res.status(400).json({
        error: 'Password not set. Use /admin/auth/setup to set initial password.',
        companyId: cid,
      });
    }

    if (!verifyPassword(password, company.password_hash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await CompanyAdmin.createSession(cid, token, expiresAt);

    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      companyId: cid,
      companyName: company.name,
    });
  } catch (err) {
    console.error('[admin auth] login:', err);
    res.status(500).json({ error: err.message });
  }
}

async function setup(req, res) {
  try {
    const { companyId, password } = req.body;
    if (!companyId || !password) {
      return res.status(400).json({ error: 'companyId and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cid = String(companyId).trim();
    const company = await CompanyAdmin.findByCompanyId(cid);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (company.password_hash) {
      return res.status(400).json({ error: 'Password already set. Use login instead.' });
    }

    const passwordHash = hashPassword(password);
    await CompanyAdmin.setPassword(cid, passwordHash);

    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await CompanyAdmin.createSession(cid, token, expiresAt);

    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      companyId: cid,
      companyName: company.name,
    });
  } catch (err) {
    console.error('[admin auth] setup:', err);
    res.status(500).json({ error: err.message });
  }
}

async function logout(req, res) {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      await CompanyAdmin.deleteSession(token);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin auth] logout:', err);
    res.status(500).json({ error: err.message });
  }
}

async function me(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json({
      companyId: company.company_id,
      name: company.name,
      companyName: company.name,
      chatbotName: company.display_name || '',
      displayName: company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
    });
  } catch (err) {
    console.error('[admin auth] me:', err);
    res.status(500).json({ error: err.message });
  }
}

async function changePassword(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'currentPassword, newPassword and confirmPassword are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!company.password_hash || !verifyPassword(currentPassword, company.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (verifyPassword(newPassword, company.password_hash)) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const nextHash = hashPassword(newPassword);
    await CompanyAdmin.setPassword(companyId, nextHash);

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin auth] change password:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { login, setup, logout, me, changePassword };
