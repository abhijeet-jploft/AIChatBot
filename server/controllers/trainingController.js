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
              voice_mode_enabled,
              voice_gender,
              voice_profile,
              voice_custom_id,
              voice_custom_gender,
              voice_ignore_emoji,
              voice_response_enabled
         FROM chatbots
       WHERE company_id = ANY($1::text[])`,
      [companyIds]
    );
    const dbMap = Object.fromEntries(rows.map((r) => [r.company_id, r]));
    const enriched = companies.map((c) => {
      const dbRow = dbMap[c.id] || {};
      const customAvailable = Boolean(dbRow.voice_custom_id);
      const resolvedProfile = customAvailable
        ? (dbRow.voice_profile === 'custom' ? 'custom' : (dbRow.voice_profile || 'professional'))
        : (dbRow.voice_profile === 'custom' ? 'professional' : (dbRow.voice_profile || 'professional'));
      const resolvedGender = customAvailable
        ? (dbRow.voice_custom_gender === 'male' ? 'male' : 'female')
        : (dbRow.voice_gender === 'male' ? 'male' : 'female');

      return {
        id: c.id,
        name: c.name,
        displayName: dbRow.display_name || c.name,
        iconUrl: dbRow.icon_url || null,
        greetingMessage: dbRow.greeting_message || null,
        voice: {
          enabled: Boolean(dbRow.voice_mode_enabled),
          responseEnabled: Boolean(dbRow.voice_response_enabled !== false),
          gender: resolvedGender,
          profile: resolvedProfile,
          customAvailable,
          ignoreEmoji: Boolean(dbRow.voice_ignore_emoji),
        },
        theme: mergeCompanyTheme(c.id, {
          primaryColor: dbRow.theme_primary_color,
          primaryDarkColor: dbRow.theme_primary_dark_color,
          secondaryColor: dbRow.theme_secondary_color,
          secondaryLightColor: dbRow.theme_secondary_light_color,
          headerBackground: dbRow.theme_header_background,
          headerShadow: dbRow.theme_header_shadow,
          headerTextColor: dbRow.theme_header_text_color,
        }),
      };
    });
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
