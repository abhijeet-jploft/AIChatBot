const { getLogs } = require('../../services/adminLogStore');

/**
 * GET /admin/logs
 * Query: type=chat|system|all, limit, offset
 */
async function listLogs(req, res) {
  try {
    const result = getLogs(req.query);
    res.json(result);
  } catch (err) {
    console.error('[admin logs] list:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listLogs };
