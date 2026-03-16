# Embeddable Chat Widget

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

## Behavior (per AI Chat Agent doc)

- **Activation** (widget does not open immediately):
  - 6–10 seconds on landing page, OR
  - 40% scroll, OR
  - 8 seconds user idle (no mouse/keyboard/scroll)
- **Opening message**: “Hi! Welcome to JP Loft! I'm Anaya, your digital consultant. Are you looking to build something or just exploring ideas?”

## CORS

If the widget is embedded on a different domain than the API, the API must allow that origin (e.g. `Access-Control-Allow-Origin: *` or the embedder’s domain). The default server uses `cors()` and allows all origins.

## Serving the script

- **Vite dev**: Script is at `http://localhost:3000/chat-widget.js`; use `data-api-url="http://localhost:3000/api"` (or your API URL) for local testing.
- **Production**: Copy `chat-widget.js` to your CDN or static host and set `src` and `data-api-url` to your production URLs.
