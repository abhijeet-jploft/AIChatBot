const { getCompanies, loadCompanyContext } = require('../services/trainingLoader');
const pool = require('../db/index');
const { mergeCompanyTheme } = require('../services/companyTheme');

/**
 * GET /api/train/companies
 * Returns companies from train_data, enriched with display_name, icon_url, greeting_message, theme from DB
 */
async function getCompaniesList(req, res) {
  try {
    const companies = getCompanies();
    if (!companies.length) {
      return res.json([]);
    }
    const companyIds = companies.map((c) => c.id);
    const { rows } = await pool.query(
      `SELECT company_id, display_name, icon_url, greeting_message,
              theme_primary_color, theme_primary_dark_color,
              theme_secondary_color, theme_secondary_light_color,
              theme_header_background, theme_header_shadow, theme_header_text_color,
              voice_mode_enabled
         FROM chatbots
       WHERE company_id = ANY($1::text[])`,
      [companyIds]
    );
    const dbMap = Object.fromEntries(rows.map((r) => [r.company_id, r]));
    const enriched = companies.map((c) => ({
      id: c.id,
      name: c.name,
      displayName: dbMap[c.id]?.display_name || c.name,
      iconUrl: dbMap[c.id]?.icon_url || null,
      greetingMessage: dbMap[c.id]?.greeting_message || null,
      voice: {
        enabled: Boolean(dbMap[c.id]?.voice_mode_enabled),
      },
      theme: mergeCompanyTheme(c.id, {
        primaryColor: dbMap[c.id]?.theme_primary_color,
        primaryDarkColor: dbMap[c.id]?.theme_primary_dark_color,
        secondaryColor: dbMap[c.id]?.theme_secondary_color,
        secondaryLightColor: dbMap[c.id]?.theme_secondary_light_color,
        headerBackground: dbMap[c.id]?.theme_header_background,
        headerShadow: dbMap[c.id]?.theme_header_shadow,
        headerTextColor: dbMap[c.id]?.theme_header_text_color,
      }),
    }));
    res.json(enriched);
  } catch (err) {
    console.error('Training error:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/train/companies/:companyId/context
 */
function getCompanyContext(req, res) {
  try {
    const { companyId } = req.params;
    const context = loadCompanyContext(companyId);
    if (context === null) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json({ context: context || '' });
  } catch (err) {
    console.error('Training error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getCompaniesList, getCompanyContext };
