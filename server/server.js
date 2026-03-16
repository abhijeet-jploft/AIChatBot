require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const chatRoutes    = require('./routes/chat');
const trainRoutes   = require('./routes/training');
const scraperRoutes = require('./routes/scraper');
const sessionRoutes = require('./routes/sessions');
const adminRoutes   = require('./admin/routes');
const { migrate }   = require('./db/migrate');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/chat',     chatRoutes);
app.use('/api/train',    trainRoutes);
app.use('/api/scrape',   scraperRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin',    adminRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'AI Chat Agent API running' });
});

// Run DB migrations, then start listening.
// If PostgreSQL is unavailable the server still starts — DB-backed
// features won't work until the connection is fixed.
migrate()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error('[startup] PostgreSQL migration failed:', err.message);
    console.error('  → Ensure PostgreSQL is running and PG_* env vars are correct.');
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT} (DB unavailable)`)
    );
  });
