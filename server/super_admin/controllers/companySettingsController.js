const {
  getSettingsJsonForCompany,
  updateSettings,
  getModeSettings,
  previewVoice,
  listVoices,
} = require('../../admin/controllers/settingsController');
const CompanyAdmin = require('../../admin/models/CompanyAdmin');
const {
  buildAdminVisibilityPayload,
  normalizeAdminVisibilityPatchInput,
} = require('../../services/adminSettingsAccess');

/**
 * GET /super-admin/companies/:companyId/settings
 * Same payload as GET /api/admin/settings for that company.
 */
async function getCompanySettings(req, res) {
  try {
    const data = await getSettingsJsonForCompany(req.params.companyId);
    if (!data) return res.status(404).json({ error: 'Company not found' });
    return res.json(data);
  } catch (err) {
    console.error('[super admin] getCompanySettings:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /super-admin/companies/:companyId/settings
 * Same body as PATCH /api/admin/settings.
 */
async function patchCompanySettings(req, res) {
  const prev = req.adminCompanyId;
  const prevBypass = req.adminSettingsAccessBypass;
  req.adminCompanyId = req.params.companyId;
  req.adminSettingsAccessBypass = true;
  try {
    await updateSettings(req, res);
  } finally {
    req.adminCompanyId = prev;
    req.adminSettingsAccessBypass = prevBypass;
  }
}

/**
 * GET /super-admin/companies/:companyId/settings/modes
 * Same payload as GET /api/admin/settings/modes for that company.
 */
async function getCompanyModeSettings(req, res) {
  const prev = req.adminCompanyId;
  const prevBypass = req.adminSettingsAccessBypass;
  req.adminCompanyId = req.params.companyId;
  req.adminSettingsAccessBypass = true;
  try {
    await getModeSettings(req, res);
  } finally {
    req.adminCompanyId = prev;
    req.adminSettingsAccessBypass = prevBypass;
  }
}

/**
 * GET /super-admin/companies/:companyId/settings/voices
 * Same payload as GET /api/admin/settings/voices for that company.
 */
async function getCompanyVoices(req, res) {
  const prev = req.adminCompanyId;
  const prevBypass = req.adminSettingsAccessBypass;
  req.adminCompanyId = req.params.companyId;
  req.adminSettingsAccessBypass = true;
  try {
    await listVoices(req, res);
  } finally {
    req.adminCompanyId = prev;
    req.adminSettingsAccessBypass = prevBypass;
  }
}

/**
 * POST /super-admin/companies/:companyId/settings/voice-preview
 * Same payload as POST /api/admin/settings/voice-preview for that company.
 */
async function previewCompanyVoice(req, res) {
  const prev = req.adminCompanyId;
  const prevBypass = req.adminSettingsAccessBypass;
  req.adminCompanyId = req.params.companyId;
  req.adminSettingsAccessBypass = true;
  try {
    await previewVoice(req, res);
  } finally {
    req.adminCompanyId = prev;
    req.adminSettingsAccessBypass = prevBypass;
  }
}

async function getCompanyAdminVisibility(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.params.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    return res.json({ adminVisibility: buildAdminVisibilityPayload(company) });
  } catch (err) {
    console.error('[super admin] getCompanyAdminVisibility:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function patchCompanyAdminVisibility(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.params.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { updates, error } = normalizeAdminVisibilityPatchInput(req.body);
    if (error) return res.status(400).json({ error });

    await CompanyAdmin.updateAdminVisibility(req.params.companyId, updates);
    const updatedCompany = await CompanyAdmin.findByCompanyId(req.params.companyId);
    return res.json({ adminVisibility: buildAdminVisibilityPayload(updatedCompany) });
  } catch (err) {
    console.error('[super admin] patchCompanyAdminVisibility:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getCompanySettings,
  patchCompanySettings,
  getCompanyModeSettings,
  getCompanyVoices,
  previewCompanyVoice,
  getCompanyAdminVisibility,
  patchCompanyAdminVisibility,
};
