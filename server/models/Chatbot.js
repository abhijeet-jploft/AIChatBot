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

module.exports = { findOrCreate };
