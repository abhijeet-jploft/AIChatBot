const pool = require('../../db/index');

// GET /super-admin/alert-rules
async function listAlertRules(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, rule_type, conditions, actions, enabled, created_at, updated_at
       FROM super_admin_alert_rules
       ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('[super admin] listAlertRules:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/alert-rules
async function createAlertRule(req, res) {
  try {
    const { name, description, rule_type, conditions, actions, enabled } = req.body;
    if (!name || !rule_type) {
      return res.status(400).json({ error: 'name and rule_type are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO super_admin_alert_rules (name, description, rule_type, conditions, actions, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(name).trim(),
        description?.trim() || null,
        String(rule_type).trim(),
        JSON.stringify(conditions || {}),
        JSON.stringify(actions || {}),
        enabled !== false,
        req.superAdminId,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[super admin] createAlertRule:', err);
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /super-admin/alert-rules/:ruleId
async function updateAlertRule(req, res) {
  try {
    const { ruleId } = req.params;
    const { name, description, conditions, actions, enabled } = req.body;
    const updates = ['updated_at = NOW()'];
    const params = [];

    if (name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(String(name).trim()); }
    if (description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(description?.trim() || null); }
    if (conditions !== undefined) { updates.push(`conditions = $${params.length + 1}`); params.push(JSON.stringify(conditions)); }
    if (actions !== undefined) { updates.push(`actions = $${params.length + 1}`); params.push(JSON.stringify(actions)); }
    if (enabled !== undefined) { updates.push(`enabled = $${params.length + 1}`); params.push(Boolean(enabled)); }

    params.push(ruleId);
    const { rowCount } = await pool.query(
      `UPDATE super_admin_alert_rules SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Alert rule not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] updateAlertRule:', err);
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /super-admin/alert-rules/:ruleId
async function deleteAlertRule(req, res) {
  try {
    const { ruleId } = req.params;
    const { rowCount } = await pool.query(
      `DELETE FROM super_admin_alert_rules WHERE id = $1`,
      [ruleId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Alert rule not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] deleteAlertRule:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/reports
async function getReports(req, res) {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const [byCompany, leadsByStatus, convsByDay] = await Promise.all([
      pool.query(
        `SELECT c.company_id, c.name,
           COUNT(DISTINCT s.id) AS conversations,
           COUNT(DISTINCT l.id) AS leads,
           COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) AS converted
         FROM chatbots c
         LEFT JOIN chat_sessions s ON s.company_id = c.company_id AND s.created_at BETWEEN $1 AND $2
         LEFT JOIN leads l ON l.company_id = c.company_id AND l.created_at BETWEEN $1 AND $2 AND l.deleted_at IS NULL
         GROUP BY c.company_id, c.name
         ORDER BY leads DESC`,
        [fromDate, toDate]
      ),
      pool.query(
        `SELECT status, COUNT(*) AS n
         FROM leads
         WHERE created_at BETWEEN $1 AND $2 AND deleted_at IS NULL
         GROUP BY status
         ORDER BY n DESC`,
        [fromDate, toDate]
      ),
      pool.query(
        `SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS n
         FROM chat_sessions
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY day
         ORDER BY day`,
        [fromDate, toDate]
      ),
    ]);

    return res.json({
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      byCompany: byCompany.rows,
      leadsByStatus: leadsByStatus.rows,
      conversationsByDay: convsByDay.rows,
    });
  } catch (err) {
    console.error('[super admin] getReports:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/system/status
async function getSystemStatus(req, res) {
  try {
    const os = require('os');
    const pool = require('../../db/index');

    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {}

    const mem = process.memoryUsage();
    return res.json({
      status: 'running',
      dbConnected: dbOk,
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      os: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        freeMemMB: Math.round(os.freemem() / 1024 / 1024),
        totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      },
    });
  } catch (err) {
    console.error('[super admin] getSystemStatus:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  getReports,
  getSystemStatus,
};
