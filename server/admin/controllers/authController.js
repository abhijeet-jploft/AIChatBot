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
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const company = await CompanyAdmin.findByAdminEmail(email);
    if (!company || !company.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!verifyPassword(password, company.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const cid = company.company_id;
    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await CompanyAdmin.createSession(cid, token, expiresAt);

    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      companyId: cid,
      companyName: company.name,
      adminEmail: company.admin_email || null,
    });
  } catch (err) {
    console.error('[admin auth] login:', err);
    res.status(500).json({ error: err.message });
  }
}

async function setup(req, res) {
  return res.status(403).json({
    error: 'Self-service admin setup is disabled. Your platform administrator must assign login email and password.',
  });
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
      adminEmail: company.admin_email || null,
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
