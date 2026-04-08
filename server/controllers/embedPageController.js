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
              COALESCE(NULLIF(BTRIM(ch.display_name), ''), c.name) AS widget_title,
              ch.icon_url,
              va.va_enabled,
              va.liveavatar_api_key,
              va.liveavatar_avatar_id,
              va.liveavatar_context_id,
              va.liveavatar_voice_id,
              va.va_sandbox_mode,
              va.va_voice_source,
              va.va_video_quality,
              vo.elevenlabs_api_key,
              vo.voice_custom_id,
              vo.voice_custom_name
       FROM embed_settings em
       INNER JOIN chatbots c ON c.company_id = em.company_id
       LEFT JOIN chat_settings ch ON ch.company_id = em.company_id
       LEFT JOIN virtual_assistant_settings va ON va.company_id = em.company_id
       LEFT JOIN voice_settings vo ON vo.company_id = em.company_id
       WHERE em.embed_slug = $1 AND em.embed_secret = $2`,
      [slug, token]
    );
    if (!rows.length) {
      return res.status(404).type('text/plain').send('Not found');
    }
    const row = rows[0];
    const iconUrlRaw = row.icon_url != null ? String(row.icon_url).trim() : '';
    const companyIdParam = String(req.query.companyId || req.query.company_id || '').trim();
    if (!companyIdParam || companyIdParam !== row.company_id) {
      return res.status(404).type('text/plain').send('Not found');
    }
    // Use a relative /api path so the widget resolves against the iframe's actual origin.
    // chat-widget.js posts failures to /api/chat/client-error (source: embed-iframe-page in admin Logs → System).
    const apiUrl = '/api';

    const vaEnabled = Boolean(row.va_enabled) && row.liveavatar_api_key && row.liveavatar_avatar_id;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml((row.widget_title || 'Chat').trim() || 'Chat')} Chatbot</title>
  <style>
    html,body{margin:0;height:100%;overflow:hidden;background:transparent}
    #jploft-embed-page-loading{
      position:fixed;inset:0;z-index:2147483646;
      display:flex;align-items:center;justify-content:center;
      box-sizing:border-box;
      background:rgba(255,255,255,.94);
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
      font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    }
    #jploft-embed-page-loading .jploft-embed-loading-inner{
      display:flex;flex-direction:column;align-items:center;gap:14px;color:#18181b;text-align:center;padding:24px;
    }
    #jploft-embed-page-loading .jploft-embed-loading-spinner{
      width:40px;height:40px;border-radius:50%;
      border:3px solid #e4e4e7;border-top-color:#E02F3A;
      animation:jploft-embed-spin .75s linear infinite;
      flex-shrink:0;
    }
    @keyframes jploft-embed-spin{to{transform:rotate(360deg)}}
    #jploft-embed-page-loading .jploft-embed-loading-text{font-size:15px;font-weight:500;max-width:280px;line-height:1.4}
  </style>
</head>
<body>
<div id="jploft-embed-page-loading" role="status" aria-live="polite" aria-busy="true">
  <div class="jploft-embed-loading-inner">
    <span class="jploft-embed-loading-spinner" aria-hidden="true"></span>
    <span class="jploft-embed-loading-text">Loading chat…</span>
  </div>
</div>
<script>
window.JPLoftChatConfig = {
  apiUrl: ${JSON.stringify(apiUrl)},
  companyId: ${JSON.stringify(row.company_id)},
  companyName: ${JSON.stringify(row.widget_title || 'Chat')},
  apiKey: ${JSON.stringify(token)},
  iconUrl: ${JSON.stringify(iconUrlRaw || '')},
  forceOpen: true${vaEnabled ? `,\n  vaEnabled: true` : ''}
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
