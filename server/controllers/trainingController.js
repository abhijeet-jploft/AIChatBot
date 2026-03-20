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
      `SELECT c.company_id, c.name AS db_company_name, ch.display_name, ch.icon_url, ch.greeting_message, ch.widget_position,
              th.theme_primary_color, th.theme_primary_dark_color,
              th.theme_secondary_color, th.theme_secondary_light_color,
              th.theme_header_background, th.theme_header_shadow, th.theme_header_text_color,
              vo.voice_mode_enabled,
              vo.voice_gender,
              vo.voice_profile,
              vo.voice_custom_id,
              vo.voice_custom_gender,
              vo.voice_ignore_emoji,
              vo.voice_response_enabled
         FROM chatbots c
         INNER JOIN chat_settings ch ON ch.company_id = c.company_id
         INNER JOIN theme_settings th ON th.company_id = c.company_id
         INNER JOIN voice_settings vo ON vo.company_id = c.company_id
       WHERE c.company_id = ANY($1::text[])`,
      [companyIds]
    );
    const dbMap = Object.fromEntries(rows.map((r) => [r.company_id, r]));
    const enriched = companies.map((c) => {
      const dbRow = dbMap[c.id] || {};
      const companyLabel = String(dbRow.db_company_name || '').trim() || c.name;
      const chatbotRaw = String(dbRow.display_name || '').trim();
      const customAvailable = Boolean(dbRow.voice_custom_id);
      const resolvedProfile = customAvailable
        ? (dbRow.voice_profile === 'custom' ? 'custom' : (dbRow.voice_profile || 'professional'))
        : (dbRow.voice_profile === 'custom' ? 'professional' : (dbRow.voice_profile || 'professional'));
      const resolvedGender = customAvailable
        ? (dbRow.voice_custom_gender === 'male' ? 'male' : 'female')
        : (dbRow.voice_gender === 'male' ? 'male' : 'female');

      return {
        id: c.id,
        name: companyLabel,
        companyName: companyLabel,
        chatbotName: chatbotRaw,
        displayName: chatbotRaw || companyLabel,
        iconUrl: dbRow.icon_url || null,
        greetingMessage: dbRow.greeting_message || null,
        widgetPosition: String(dbRow.widget_position || 'right').toLowerCase() === 'left' ? 'left' : 'right',
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
