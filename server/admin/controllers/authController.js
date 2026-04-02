const CompanyAdmin = require('../models/CompanyAdmin');
const { hashPassword, verifyPassword, generateToken, getSessionExpiry } = require('../utils/auth');
const { buildAdminVisibilityPayload } = require('../../services/adminSettingsAccess');

function buildEmbedPayload(company) {
  const slug = String(company?.embed_slug || '').trim();
  const secret = String(company?.embed_secret || '').trim();
  const companyId = String(company?.company_id || '').trim();
  if (!slug || !secret || !companyId) {
    return {
      embedSlug: null,
      embedPath: null,
      embedUrl: null,
    };
  }

  const embedPath = `/embed/${encodeURIComponent(slug)}/${encodeURIComponent(secret)}?companyId=${encodeURIComponent(companyId)}`;
  const publicBase = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');

  return {
    embedSlug: slug,
    embedPath,
    embedUrl: publicBase ? `${publicBase}${embedPath}` : null,
  };
}

function buildMePayload(company) {
  if (!company) return null;
  const embed = buildEmbedPayload(company);
  return {
    companyId: company.company_id,
    name: company.name,
    companyName: company.name,
    ownerName: company.owner_name || null,
    chatbotName: company.display_name || '',
    displayName: company.name,
    adminEmail: company.admin_email || null,
    phone: company.admin_phone || null,
    companyWebsite: company.company_website || null,
    industryCategory: company.industry_category || null,
    isSuspended: Boolean(company.is_suspended),
    iconUrl: company.icon_url || null,
    greetingMessage: company.greeting_message || null,
    embedSlug: embed.embedSlug,
    embedPath: embed.embedPath,
    embedUrl: embed.embedUrl,
    adminVisibility: buildAdminVisibilityPayload(company),
  };
}

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
    if (company.is_suspended) {
      return res.status(403).json({ error: 'This company is currently suspended. Contact your super admin.' });
    }

    const cid = company.company_id;
    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await CompanyAdmin.createSession(cid, token, expiresAt);
    const companySettings = await CompanyAdmin.findByCompanyId(cid);

    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      companyId: cid,
      companyName: company.name,
      adminEmail: company.admin_email || null,
      embedSlug: companySettings?.embed_slug || null,
      embedPath: (() => {
        const embed = buildEmbedPayload(companySettings || company);
        return embed.embedPath;
      })(),
      embedUrl: (() => {
        const embed = buildEmbedPayload(companySettings || company);
        return embed.embedUrl;
      })(),
      adminVisibility: buildAdminVisibilityPayload(companySettings),
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
    res.json(buildMePayload(company));
  } catch (err) {
    console.error('[admin auth] me:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateProfile(req, res) {
  try {
    const body = req.body || {};
    const companyId = req.adminCompanyId;
    try {
      await CompanyAdmin.updateAccountProfile(companyId, {
        ownerName: body.ownerName,
        adminEmail: body.email ?? body.adminEmail,
        adminPhone: body.phone ?? body.adminPhone,
        companyName: body.companyName,
        companyWebsite: body.companyWebsite,
        industryCategory: body.industryCategory,
      });
    } catch (e) {
      if (e.code === 'EMAIL_IN_USE') {
        return res.status(409).json({ error: 'This email is already in use by another account.' });
      }
      if (e.code === 'EMAIL_REQUIRED' || e.code === 'INVALID_EMAIL') {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }
      if (e.code === 'COMPANY_NAME_REQUIRED') {
        return res.status(400).json({ error: 'Company name is required.' });
      }
      if (e.code === 'INVALID_PHONE') {
        return res.status(400).json({ error: 'Phone number must include country code and contain 6 to 15 digits.' });
      }
      if (e.code === 'INVALID_URL') {
        return res.status(400).json({ error: 'Company website must be a valid URL.' });
      }
      throw e;
    }

    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(buildMePayload(company));
  } catch (err) {
    console.error('[admin auth] updateProfile:', err);
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

module.exports = { login, setup, logout, me, updateProfile, changePassword };
