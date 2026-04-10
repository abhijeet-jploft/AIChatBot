# Third-party website embed (plugin)

Your stack is **React (Vite) + Node (Express)**. The **same Node server** serves `/api`, static `chat-widget.js`, and the **embed HTML page** used for iframe installs.

## Who can embed?

Anyone with your **embed slug**, **embed secret**, and **company id** (from **Admin → Settings → Website embed**) can add the chat to their site. Treat the embed secret like an API key: rotate it if it leaks.

## Two integration options

### 1. Script (recommended — floating launcher)

Host `chat-widget.js` from your deployed app (or CDN copy). The customer’s site loads one script; the widget calls your API (CORS must allow their origin — default server uses permissive CORS).

```html
<script>
  window.JPLoftChatConfig = {
    apiUrl: 'https://YOUR_APP_ORIGIN/api',
    companyId: 'YOUR_COMPANY_ID',
    companyName: 'Your brand',
    apiKey: 'YOUR_EMBED_SECRET'
  };
</script>
<script src="https://YOUR_APP_ORIGIN/chat-widget.js" async></script>
```

`apiKey` is sent as `X-Embed-Api-Key` on API requests (optional but recommended).

### 2. Iframe (full-page or fixed overlay)

Point an iframe at your app’s **embed route** (served by Express):

`https://YOUR_APP_ORIGIN/embed/{slug}/{embed_secret}?companyId={company_id}`

- **slug** and **embed_secret** are looked up in the database; **companyId** query must match the company tied to that embed.
- This route returns minimal HTML that sets `JPLoftChatConfig` and loads `chat-widget.js`.

## Local development

| URL | Role |
|-----|------|
| `http://localhost:7001` | Vite dev client; proxies `/api` and `/embed` → Node |
| `http://localhost:7022` (or `PORT` in `.env`) | Express API + static + `/embed/*` |

Integration lab: open **`/embed-integration-demo.html`** (served from `client/public`). Use **Exact localhost profile** so origins stay on port **7001** (proxy forwards to the API).

## Production checklist

1. Set **`PUBLIC_APP_URL`** on the server so Admin shows canonical `https://…` embed URLs.
2. Serve **`client` build** + API from the same host (or put `chat-widget.js` on a CDN and set `data-api-url` / `JPLoftChatConfig.apiUrl` to your API origin).
3. Use **HTTPS** in production.
4. Tighten **CORS** if you no longer want `*` (optional `cors({ origin: … })` in `server.js`).
5. **Cache busting** (optional): The server sends `Cache-Control: no-cache` headers for HTML and `chat-widget.js`, but if customers have cached versions, add a query string to force refresh:
   ```html
   <script src="https://YOUR_APP_ORIGIN/chat-widget.js?v=20250410" async></script>
   ```
   Update the query string value each time you deploy (e.g., timestamp, version number). This ensures customers' browsers fetch the latest widget code immediately.

## Widget behaviour (admin)

Launcher stays visible; **open mode** (click vs auto-trigger) and **page rules** come from **Admin → Settings**. See app docs for timing, scroll, and path targeting.
