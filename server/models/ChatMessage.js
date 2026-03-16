const pool = require('../db/index');

/**
 * Insert a message.
 * @param {string} sessionId
 * @param {string} role - 'user' | 'assistant'
 * @param {string} content
 */
async function create(sessionId, role, content) {
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)`,
    [sessionId, role, content]
  );
}

/**
 * List messages for a session, oldest first.
 * @param {string} sessionId
 * @returns {Promise<Array<{role: string, content: string, created_at: Date}>>}
 */
async function listBySession(sessionId) {
  const { rows } = await pool.query(
    `SELECT role, content, created_at
     FROM   chat_messages
     WHERE  session_id = $1
     ORDER  BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

module.exports = { create, listBySession };
