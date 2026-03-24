const pool = require('../db/index');

/**
 * Create a new chat session.
 * @param {string} companyId
 * @returns {Promise<{id: string}>}
 */
async function create(companyId) {
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (company_id) VALUES ($1) RETURNING id`,
    [companyId]
  );
  return { id: rows[0].id };
}

/**
 * List sessions for a company, newest first.
 * @param {string} companyId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function listByCompany(companyId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, title, created_at, updated_at,
            (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id)::int AS message_count
     FROM   chat_sessions cs
     WHERE  company_id = $1
     ORDER  BY updated_at DESC
     LIMIT  $2`,
    [companyId, limit]
  );
  return rows;
}

/**
 * Get session by id.
 * @param {string} id
 * @returns {Promise<{title: string, company_id: string}|null>}
 */
async function findById(id) {
  const { rows } = await pool.query(
    `SELECT title, company_id FROM chat_sessions WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Update session title and updated_at.
 * @param {string} id
 * @param {string} title
 */
async function updateTitle(id, title) {
  await pool.query(
    `UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2`,
    [title, id]
  );
}

/**
 * Touch session (update updated_at only).
 * @param {string} id
 */
async function touch(id) {
  await pool.query(
    `UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Delete a session and its messages (CASCADE).
 * @param {string} id
 */
async function deleteById(id) {
  await pool.query('DELETE FROM chat_sessions WHERE id = $1', [id]);
}

module.exports = {
  create,
  listByCompany,
  findById,
  updateTitle,
  touch,
  deleteById,
};
