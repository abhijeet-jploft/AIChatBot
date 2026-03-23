# Embeddable Chat Widget

## Full Third-Party Demo (JP Loft Defaults)

Open `/embed-integration-demo.html` for the integration lab. Slug URLs like `/jp-loft?apiKey=…&companyId=…` are served from `chat-embed-host.html`.

The demo includes both integration styles in one place:
- `script` mode (loads `chat-widget.js` with `window.JPLoftChatConfig`)
- `iframe` mode (loads `/<embed_slug>?apiKey=...&companyId=...`)

Default demo credentials are pre-filled for JP Loft:
- `embed slug`: `jp-loft`
- `companyId`: `_JP_Loft`
- `apiKey`: `ba6d20d0722f560415ed0f6c1e0dcba4bb429aad3f7dff237a28029d12a30a9a`

## Host page URL (iframe-friendly)

On your deployed app (same host as `/api`):

`https://your-host/<embed_slug>?apiKey=<embed_secret>&companyId=<company_folder_id>`

Both **apiKey** and **companyId** are required. The host page loads an iframe to `/embed/<slug>/<secret>?companyId=...`, which returns 404 if `companyId` does not match that embed.

Vite dev (port 7001) and Express both support the `/<embed_slug>` path.

---

Use the widget on any website with a single script tag (like DataTables).

## Quick start

```html
<script
  src="https://your-domain.com/chat-widget.js"
  data-api-url="https://your-api.com/api"
  data-company-id="_JP_Loft"
  data-company-name="JP Loft"
></script>
```

Or set config before loading:

```html
<script>
  window.JPLoftChatConfig = {
    apiUrl: 'https://your-api.com/api',
    companyId: '_JP_Loft',
    companyName: 'JP Loft'
  };
</script>
<script src="https://your-domain.com/chat-widget.js"></script>
```

## Attributes / config

| Option        | Description                          | Default    |
|---------------|--------------------------------------|------------|
| `apiUrl`      | Base URL of the chat API             | required   |
| `companyId`   | Company/bot ID (e.g. `_JP_Loft`)     | `_JP_Loft` |
| `companyName` | Name shown in the widget header      | JP Loft    |
| `apiKey`      | Optional embed key sent as `X-Embed-Api-Key` | empty |

## Behavior (per AI Chat Agent doc)

- **Launcher icon**: always visible; clicking it opens chat immediately in all modes.
- **Panel open mode (admin controlled)**:
  - `click`: panel opens only when the visitor clicks the launcher.
  - `auto`: panel opens proactively based on trigger rules below.
- **Drag support**: launcher and floating close button are draggable and clamped to viewport bounds.
- **Activation checks** (apply only when open mode is `auto`):
  - 6–10 seconds on landing page, OR
  - 40% scroll, OR
  - 8 seconds user idle (no mouse/keyboard/scroll)
- **Fullscreen toggle**: header expand button toggles desktop fullscreen mode and restore mode.
- **Opening message**: “Hi! Welcome to JP Loft! I'm Anaya, your digital consultant. Are you looking to build something or just exploring ideas?”

## CORS

If the widget is embedded on a different domain than the API, the API must allow that origin (e.g. `Access-Control-Allow-Origin: *` or the embedder’s domain). The default server uses `cors()` and allows all origins.

## Serving the script

- **Vite dev**: Script is at `http://localhost:7001/chat-widget.js`; use `data-api-url="http://localhost:7001/api"` (or your API URL) for local testing.
- **Production**: Copy `chat-widget.js` to your CDN or static host and set `src` and `data-api-url` to your production URLs.
