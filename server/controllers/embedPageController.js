const pool = require('../db/index');
const liveAvatar = require('../services/liveAvatarService');

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

    // ── Virtual Assistant embed ──────────────────────────────────────────
    let vaEmbedUrl = '';
    const vaEnabled = Boolean(row.va_enabled) && row.liveavatar_api_key && row.liveavatar_avatar_id;
    if (vaEnabled) {
      try {
        // Resolve voice ID: if voiceSource is elevenlabs, auto-bind the ElevenLabs voice
        let voiceId = row.liveavatar_voice_id || undefined;
        if (row.va_voice_source === 'elevenlabs' && row.voice_custom_id && row.elevenlabs_api_key) {
          try {
            const secret = await liveAvatar.createSecret(row.liveavatar_api_key, {
              secret_name: `elevenlabs_${row.company_id}`,
              secret_value: row.elevenlabs_api_key,
              secret_type: 'ELEVENLABS_API_KEY',
            });
            const bound = await liveAvatar.bindThirdPartyVoice(row.liveavatar_api_key, {
              provider_voice_id: row.voice_custom_id,
              secret_id: secret.id,
              name: row.voice_custom_name || 'ElevenLabs Voice',
            });
            if (bound?.voice_id) voiceId = bound.voice_id;
          } catch (bindErr) {
            console.error('[embed page] ElevenLabs voice bind error:', bindErr.message);
          }
        }

        // Resolve context ID: auto-create a default context if not configured
        let contextId = row.liveavatar_context_id || undefined;
        if (!contextId) {
          try {
            const ctx = await liveAvatar.createContext(row.liveavatar_api_key, {
              name: `${row.widget_title || 'Chat'} Assistant`,
              prompt: `You are a helpful virtual assistant for ${row.widget_title || 'our company'}.`,
              opening_text: 'Hello! How can I help you today?',
              links: [],
            });
            if (ctx?.id) {
              contextId = ctx.id;
              // Persist so we reuse it next time
              await pool.query(
                `UPDATE virtual_assistant_settings SET liveavatar_context_id = $1 WHERE company_id = $2`,
                [contextId, row.company_id]
              );
              console.log('[embed page] Auto-created LiveAvatar context:', contextId);
            }
          } catch (ctxErr) {
            console.error('[embed page] Auto-create context error:', ctxErr.message);
          }
        }

        const embed = await liveAvatar.createEmbedV2(row.liveavatar_api_key, {
          avatar_id: row.liveavatar_avatar_id,
          context_id: contextId,
          voice_id: voiceId,
          is_sandbox: Boolean(row.va_sandbox_mode),
        });
        const embedUrl = embed?.embed_url || embed?.url || '';
        if (embedUrl) {
          vaEmbedUrl = embedUrl;
        } else {
          console.warn('[embed page] VA embed returned no URL:', JSON.stringify(embed));
        }
      } catch (err) {
        console.error('[embed page] LiveAvatar embed error:', err.message);
      }
    }

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
  forceOpen: true${vaEmbedUrl ? `,\n  vaEnabled: true,\n  vaAvatarEmbedUrl: ${JSON.stringify(vaEmbedUrl)}` : ''}
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
