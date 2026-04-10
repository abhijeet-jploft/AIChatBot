const path = require('path');
// Use .env in project root only.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const chatRoutes = require('./routes/chat');
const trainRoutes = require('./routes/training');
const scraperRoutes = require('./routes/scraper');
const sessionRoutes = require('./routes/sessions');
const adminRoutes = require('./admin/routes');
const superAdminRoutes = require('./super_admin/routes');
const { renderEmbedPage } = require('./controllers/embedPageController');
const { migrate } = require('./db/migrate');
const { attachPresenceWs } = require('./ws/presence');
const { stopAllJobs } = require('./services/scraperService');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/chat', chatRoutes);
app.use('/api/train', trainRoutes);
app.use('/api/scrape', scraperRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Validate embed secret for a given companyId — used by the integration demo before launching
app.get('/api/embed/validate', async (req, res) => {
  const companyId = String(req.query.companyId || '').trim();
  const secret    = String(req.query.embedSecret || '').trim();
  if (!companyId || !secret) {
    return res.status(400).json({ valid: false, error: 'companyId and embedSecret are required' });
  }
  try {
    const pool = require('./db');
    const result = await pool.query(
      `SELECT company_id FROM embed_settings
       WHERE company_id = $1 AND embed_secret = $2
       LIMIT 1`,
      [companyId, secret]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ valid: false, error: 'Invalid embed secret for this company' });
    }
    return res.json({ valid: true });
  } catch (err) {
    return res.status(500).json({ valid: false, error: 'Validation check failed' });
  }
});

app.get('/embed/:slug/:token', renderEmbedPage);
app.get('/embed/:slug', (req, res) => {
  const tokenFromQuery = String(req.query.apiKey || req.query.token || '').trim();
  if (tokenFromQuery) {
    req.params.token = tokenFromQuery;
    return renderEmbedPage(req, res);
  }
  return res
    .status(400)
    .type('text/plain')
    .send('Missing embed token. Use /embed/{slug}/{embed_secret}?companyId={company_id}');
});

/**
 * Emergency stop endpoint:
 * Stops all active scraper/training jobs in this process.
 */
app.get('/stop-all', (_req, res) => {
  stopAllJobs();
  return res.type('text/plain').send('stopped all');
});

const superAdminUploadDir = path.join(__dirname, '../uploads/super-admin');
fs.mkdirSync(superAdminUploadDir, { recursive: true });
app.use('/uploads/super-admin', express.static(superAdminUploadDir));

const companyIconUploadDir = path.join(__dirname, '../uploads/company-icons');
fs.mkdirSync(companyIconUploadDir, { recursive: true });
app.use('/uploads/company-icons', express.static(companyIconUploadDir));

const clientDist = path.join(__dirname, '../client/dist');

/**
 * Cache control middleware for client assets:
 * - HTML files and chat-widget.js: no-cache (always revalidate)
 * - Hashed JS/CSS from Vite: long-lived cache (immutable)
 * - Other assets: short cache with revalidation
 */
app.use((req, res, next) => {
  const pathname = req.path;
  if (pathname.endsWith('.html') || pathname.endsWith('/chat-widget.js')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  } else if (pathname.match(/\.[a-f0-9]{8}\.(js|css)$/)) {
    // Hashed assets from Vite can be cached permanently
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  next();
});

app.use(express.static(clientDist));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'AI Chat Agent API running' });
});

app.use((_req, res) => {
  res.status(404).type('text/plain').send('not found');
});

// System error logging (admin logs module)
const { appendSystemLog } = require('./services/adminLogStore');
app.use((err, _req, res, next) => {
  appendSystemLog('error', err.message || 'Unhandled error', {
    stack: err.stack,
    path: _req?.path,
    method: _req?.method,
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);
/** Training/scrape/transcribe can exceed Node defaults (e.g. 5m request timeout on newer Node). */
server.timeout = 0;
if (typeof server.requestTimeout === 'number') server.requestTimeout = 1_800_000;
if (typeof server.headersTimeout === 'number') server.headersTimeout = 120_000;

function start() {
  attachPresenceWs(server);
  server.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
  );
}

migrate()
  .then(start)
  .catch((err) => {
    console.error('[startup] PostgreSQL migration failed:', err.message);
    console.error('  → Ensure PostgreSQL is running and PG_* env vars are correct.');
    start();
  });
