const { Pool } = require('pg');

// pg requires password to be a string (never undefined)
function getPassword() {
  const fromEnv = process.env.PG_PASSWORD;
  if (fromEnv != null && fromEnv !== '') return String(fromEnv);
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return u.password ? decodeURIComponent(u.password) : '';
    } catch { return ''; }
  }
  return '';
}

const password = getPassword();

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, password })
  : new Pool({
      host:     process.env.PG_HOST     || 'localhost',
      port:     parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'ai_chatbot',
      user:     process.env.PG_USER     || 'postgres',
      password,
    });

pool.on('error', (err) => {
  console.error('[db] Unexpected client error:', err.message);
});

module.exports = pool;
