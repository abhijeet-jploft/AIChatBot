const pool = require('../db/index');

/**
 * Ensure a chatbot exists for the given company. Creates if missing.
 * @param {string} companyId
 * @returns {Promise<void>}
 */
async function findOrCreate(companyId) {
  const name = companyId.replace(/^_/, '').replace(/_/g, ' ').trim() || companyId;
  await pool.query(
    `INSERT INTO chatbots (company_id, name) VALUES ($1, $2)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId, name]
  );
}

/**
 * Fetch chatbot row for a company.
 * @param {string} companyId
 * @returns {Promise<object|null>}
 */
async function findByCompanyId(companyId) {
  const { rows } = await pool.query(
    `SELECT company_id, ai_mode FROM chatbots WHERE company_id = $1`,
    [companyId]
  );

  return rows[0] || null;
}

module.exports = { findOrCreate, findByCompanyId };
