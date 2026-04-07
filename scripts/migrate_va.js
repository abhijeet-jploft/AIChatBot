const pool = require('../server/db/index');
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS virtual_assistant_settings (
        company_id VARCHAR(255) PRIMARY KEY REFERENCES chatbots(company_id) ON DELETE CASCADE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        va_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        liveavatar_api_key TEXT,
        liveavatar_avatar_id TEXT,
        liveavatar_avatar_name VARCHAR(255),
        liveavatar_context_id TEXT,
        liveavatar_context_name VARCHAR(255),
        va_voice_source VARCHAR(20) NOT NULL DEFAULT 'liveavatar',
        liveavatar_voice_id TEXT,
        liveavatar_voice_name VARCHAR(255),
        va_sandbox_mode BOOLEAN NOT NULL DEFAULT FALSE,
        va_video_quality VARCHAR(10) NOT NULL DEFAULT 'high'
      )
    `);
    console.log('virtual_assistant_settings table created');

    await pool.query(`
      ALTER TABLE virtual_assistant_settings
      ADD COLUMN IF NOT EXISTS va_video_quality VARCHAR(10) NOT NULL DEFAULT 'high'
    `);
    console.log('va_video_quality column ensured');

    await pool.query(`
      ALTER TABLE admin_visibility_settings
      ADD COLUMN IF NOT EXISTS admin_visibility_virtual_assistant BOOLEAN NOT NULL DEFAULT TRUE
    `);
    console.log('admin_visibility_virtual_assistant column added');

    await pool.end();
    console.log('Done');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
