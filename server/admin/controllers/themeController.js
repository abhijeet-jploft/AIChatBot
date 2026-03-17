const CompanyAdmin = require('../models/CompanyAdmin');
const { mergeCompanyTheme } = require('../../services/companyTheme');

async function getTheme(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const theme = mergeCompanyTheme(company.company_id, {
      primaryColor: company.theme_primary_color,
      primaryDarkColor: company.theme_primary_dark_color,
      secondaryColor: company.theme_secondary_color,
      secondaryLightColor: company.theme_secondary_light_color,
      headerBackground: company.theme_header_background,
      headerShadow: company.theme_header_shadow,
      headerTextColor: company.theme_header_text_color,
    });
    res.json({ theme });
  } catch (err) {
    console.error('[admin theme] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateTheme(req, res) {
  try {
    const { theme: bodyTheme } = req.body;
    if (!bodyTheme || typeof bodyTheme !== 'object') {
      return res.status(400).json({ error: 'theme object is required' });
    }

    await CompanyAdmin.updateThemeSettings(req.adminCompanyId, {
      primaryColor: bodyTheme.primaryColor,
      primaryDarkColor: bodyTheme.primaryDarkColor,
      secondaryColor: bodyTheme.secondaryColor,
      secondaryLightColor: bodyTheme.secondaryLightColor,
      headerBackground: bodyTheme.headerBackground,
      headerShadow: bodyTheme.headerShadow,
      headerTextColor: bodyTheme.headerTextColor,
    });

    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    const theme = mergeCompanyTheme(company.company_id, {
      primaryColor: company.theme_primary_color,
      primaryDarkColor: company.theme_primary_dark_color,
      secondaryColor: company.theme_secondary_color,
      secondaryLightColor: company.theme_secondary_light_color,
      headerBackground: company.theme_header_background,
      headerShadow: company.theme_header_shadow,
      headerTextColor: company.theme_header_text_color,
    });
    res.json({ theme });
  } catch (err) {
    console.error('[admin theme] update:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getTheme, updateTheme };
