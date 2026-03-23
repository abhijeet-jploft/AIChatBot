const pool = require('../db/index');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /embed/:slug/:token?companyId=...
 * Requires query companyId to match the chatbot row (with slug + token). Otherwise 404.
 * Serves minimal HTML that loads chat-widget.js with JPLoftChatConfig (apiKey = token for X-Embed-Api-Key).
 */
async function renderEmbedPage(req, res) {
  const slug = String(req.params.slug || '').trim();
  const token = String(req.params.token || '').trim();
  if (!slug || !token || slug.length > 200 || token.length > 200) {
    return res.status(404).type('text/plain').send('Not found');
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.company_id,
              COALESCE(NULLIF(BTRIM(ch.display_name), ''), c.name) AS widget_title
       FROM embed_settings em
       INNER JOIN chatbots c ON c.company_id = em.company_id
       LEFT JOIN chat_settings ch ON ch.company_id = em.company_id
       WHERE em.embed_slug = $1 AND em.embed_secret = $2`,
      [slug, token]
    );
    if (!rows.length) {
      return res.status(404).type('text/plain').send('Not found');
    }
    const row = rows[0];
    const companyIdParam = String(req.query.companyId || req.query.company_id || '').trim();
    if (!companyIdParam || companyIdParam !== row.company_id) {
      return res.status(404).type('text/plain').send('Not found');
    }
    // Use a relative /api path so the widget resolves against the iframe's actual origin.
    // This works correctly both through a dev proxy and in production.
    const apiUrl = '/api';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml((row.widget_title || 'Chat').trim() || 'Chat')} Chatbot</title>
  <style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}</style>
</head>
<body>
<script>
window.JPLoftChatConfig = {
  apiUrl: ${JSON.stringify(apiUrl)},
  companyId: ${JSON.stringify(row.company_id)},
  companyName: ${JSON.stringify(row.widget_title || 'Chat')},
  apiKey: ${JSON.stringify(token)},
  forceOpen: true
};
</script>
<script src="/chat-widget.js"></script>
</body>
</html>`;
    return res.type('html').send(html);
  } catch (err) {
    console.error('[embed page]', err);
    return res.status(500).type('text/plain').send('Error');
  }
}

module.exports = { renderEmbedPage };
