const {
  getSettingsJsonForCompany,
  updateSettings,
  getModeSettings,
  previewVoice,
  listVoices,
} = require('../../admin/controllers/settingsController');

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
  req.adminCompanyId = req.params.companyId;
  try {
    await updateSettings(req, res);
  } finally {
    req.adminCompanyId = prev;
  }
}

/**
 * GET /super-admin/companies/:companyId/settings/modes
 * Same payload as GET /api/admin/settings/modes for that company.
 */
async function getCompanyModeSettings(req, res) {
  const prev = req.adminCompanyId;
  req.adminCompanyId = req.params.companyId;
  try {
    await getModeSettings(req, res);
  } finally {
    req.adminCompanyId = prev;
  }
}

/**
 * GET /super-admin/companies/:companyId/settings/voices
 * Same payload as GET /api/admin/settings/voices for that company.
 */
async function getCompanyVoices(req, res) {
  const prev = req.adminCompanyId;
  req.adminCompanyId = req.params.companyId;
  try {
    await listVoices(req, res);
  } finally {
    req.adminCompanyId = prev;
  }
}

/**
 * POST /super-admin/companies/:companyId/settings/voice-preview
 * Same payload as POST /api/admin/settings/voice-preview for that company.
 */
async function previewCompanyVoice(req, res) {
  const prev = req.adminCompanyId;
  req.adminCompanyId = req.params.companyId;
  try {
    await previewVoice(req, res);
  } finally {
    req.adminCompanyId = prev;
  }
}

module.exports = {
  getCompanySettings,
  patchCompanySettings,
  getCompanyModeSettings,
  getCompanyVoices,
  previewCompanyVoice,
};
