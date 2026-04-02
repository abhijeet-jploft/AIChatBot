const pool = require('../../db/index');
const { normalizeCalendarRangeQuery, calendarDayOrNull } = require('../../utils/dateRangeQuery');
const { getLogs } = require('../../services/adminLogStore');

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function inferLogCategory(row) {
  const explicit = String(row?.meta?.category || '').trim().toLowerCase();
  if (explicit === 'notification' || explicit === 'warning' || explicit === 'error_report' || explicit === 'log') {
    return explicit;
  }
  const level = String(row?.level || '').toLowerCase();
  if (level === 'error') return 'error_report';
  if (level === 'warn' || level === 'warning') return 'warning';
  return 'log';
}

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
    const { from: fromQ, to: toQ } = normalizeCalendarRangeQuery(req.query.from, req.query.to);
    const fromDate = fromQ ? new Date(fromQ) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = toQ ? new Date(toQ) : new Date();
    // When to is a calendar date (YYYY-MM-DD), extend to end-of-day so BETWEEN includes the full day
    if (calendarDayOrNull(toQ)) {
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const byCompanyLimit = Math.max(1, Math.min(500, Number(req.query.byCompanyLimit || req.query.limit) || 20));
    const byCompanyPage = Math.max(1, Number(req.query.byCompanyPage || req.query.page) || 1);
    let byCompanyOffset = Math.max(0, Number(req.query.byCompanyOffset || req.query.offset) || 0);
    if ((req.query.byCompanyPage != null || req.query.page != null) && req.query.byCompanyOffset == null && req.query.offset == null) {
      byCompanyOffset = (byCompanyPage - 1) * byCompanyLimit;
    }

    const companySearch = String(req.query.companySearch || req.query.search || '').trim();
    const minConversationsRaw = req.query.minConversations;
    const minLeadsRaw = req.query.minLeads;
    const minConvertedRaw = req.query.minConverted;
    const minConversations = (minConversationsRaw === undefined || String(minConversationsRaw).trim() === '')
      ? null
      : Math.max(0, Number(minConversationsRaw) || 0);
    const minLeads = (minLeadsRaw === undefined || String(minLeadsRaw).trim() === '')
      ? null
      : Math.max(0, Number(minLeadsRaw) || 0);
    const minConverted = (minConvertedRaw === undefined || String(minConvertedRaw).trim() === '')
      ? null
      : Math.max(0, Number(minConvertedRaw) || 0);

    const byCompanyFilterParams = [fromDate, toDate];
    const byCompanyFilters = [];
    if (companySearch) {
      byCompanyFilterParams.push(`%${companySearch}%`);
      const searchPh = `$${byCompanyFilterParams.length}`;
      byCompanyFilters.push(`(ca.company_id ILIKE ${searchPh} OR ca.name ILIKE ${searchPh})`);
    }
    if (minConversations != null) {
      byCompanyFilterParams.push(minConversations);
      byCompanyFilters.push(`ca.conversations >= $${byCompanyFilterParams.length}`);
    }
    if (minLeads != null) {
      byCompanyFilterParams.push(minLeads);
      byCompanyFilters.push(`ca.leads >= $${byCompanyFilterParams.length}`);
    }
    if (minConverted != null) {
      byCompanyFilterParams.push(minConverted);
      byCompanyFilters.push(`ca.converted >= $${byCompanyFilterParams.length}`);
    }
    const byCompanyWhereSql = byCompanyFilters.length ? `WHERE ${byCompanyFilters.join(' AND ')}` : '';
    const byCompanyCte = `
      WITH company_activity AS (
        SELECT
          c.company_id,
          c.name,
          COUNT(DISTINCT s.id)::int AS conversations,
          COUNT(DISTINCT l.id)::int AS leads,
          COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END)::int AS converted
        FROM chatbots c
        LEFT JOIN chat_sessions s ON s.company_id = c.company_id AND s.created_at BETWEEN $1 AND $2
        LEFT JOIN leads l ON l.company_id = c.company_id AND l.created_at BETWEEN $1 AND $2 AND l.deleted_at IS NULL
        WHERE c.company_id <> '_scrape_jobs'
        GROUP BY c.company_id, c.name
      )
    `;

    const byCompanyCountPromise = pool.query(
      `${byCompanyCte}
       SELECT COUNT(*)::int AS total
       FROM company_activity ca
       ${byCompanyWhereSql}`,
      byCompanyFilterParams
    );
    const byCompanyRowsPromise = pool.query(
      `${byCompanyCte}
       SELECT ca.company_id, ca.name, ca.conversations, ca.leads, ca.converted
       FROM company_activity ca
       ${byCompanyWhereSql}
       ORDER BY ca.leads DESC, ca.conversations DESC, ca.company_id ASC
       LIMIT $${byCompanyFilterParams.length + 1}
       OFFSET $${byCompanyFilterParams.length + 2}`,
      [...byCompanyFilterParams, byCompanyLimit, byCompanyOffset]
    );

    const [byCompanyCount, byCompanyRows, leadsByStatus, convsByDay] = await Promise.all([
      byCompanyCountPromise,
      byCompanyRowsPromise,
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

    const byCompanyTotal = Number(byCompanyCount.rows?.[0]?.total || 0);
    const byCompanyCurrentPage = Math.floor(byCompanyOffset / byCompanyLimit) + 1;
    const byCompanyTotalPages = Math.max(1, Math.ceil(byCompanyTotal / byCompanyLimit));

    return res.json({
      period: { from: fromQ || fromDate.toISOString().slice(0, 10), to: toQ || toDate.toISOString().slice(0, 10) },
      byCompany: byCompanyRows.rows,
      byCompanyMeta: {
        total: byCompanyTotal,
        limit: byCompanyLimit,
        page: byCompanyCurrentPage,
        offset: byCompanyOffset,
        totalPages: byCompanyTotalPages,
        filters: {
          companySearch: companySearch || '',
          minConversations,
          minLeads,
          minConverted,
        },
      },
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
    const db = require('../../db/index');

    let dbOk = false;
    let apiLatencyMs = null;
    const latencyStart = process.hrtime.bigint();
    try {
      await db.query('SELECT 1');
      dbOk = true;
    } catch {}
    apiLatencyMs = Math.round(Number(process.hrtime.bigint() - latencyStart) / 1e6);

    const mem = process.memoryUsage();
    const cpus = Math.max(1, os.cpus().length);
    const loadAvg = os.loadavg();
    const loadPct = Math.round((loadAvg[0] / cpus) * 100);

    const { rows: allLogRows } = getLogs({ type: 'all', limit: 400, offset: 0 });
    const aiSamples = allLogRows
      .filter((r) => typeof r?.meta?.aiResponseMs === 'number')
      .map((r) => Number(r.meta.aiResponseMs))
      .filter((v) => Number.isFinite(v) && v >= 0);
    const errorCount = allLogRows.filter((r) => String(r.level || '').toLowerCase() === 'error').length;
    const warningCount = allLogRows.filter((r) => ['warn', 'warning'].includes(String(r.level || '').toLowerCase())).length;

    return res.json({
      status: 'running',
      dbConnected: dbOk,
      generatedAt: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      metrics: {
        serverLoad: {
          avg1m: Number(loadAvg[0].toFixed(2)),
          avg5m: Number(loadAvg[1].toFixed(2)),
          avg15m: Number(loadAvg[2].toFixed(2)),
          cpuLoadPercent1m: loadPct,
        },
        apiLatencyMs,
        aiResponseTime: {
          samples: aiSamples.length,
          avgMs: aiSamples.length ? Math.round(aiSamples.reduce((a, b) => a + b, 0) / aiSamples.length) : null,
          p95Ms: percentile(aiSamples, 95),
          maxMs: aiSamples.length ? Math.max(...aiSamples) : null,
        },
        errors: {
          recentErrors: errorCount,
          recentWarnings: warningCount,
        },
      },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      os: {
        platform: os.platform(),
        arch: os.arch(),
        cpus,
        freeMemMB: Math.round(os.freemem() / 1024 / 1024),
        totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      },
    });
  } catch (err) {
    console.error('[super admin] getSystemStatus:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/system/logs?tab=all|error_reports|warnings|notifications|logs&limit=100&offset=0
async function getSystemLogs(req, res) {
  try {
    const tab = String(req.query.tab || 'all').trim().toLowerCase();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const { rows, total } = getLogs({ type: 'all', limit: 1000, offset: 0 });
    const mapped = rows.map((row) => ({
      ...row,
      category: inferLogCategory(row),
    }));

    const filtered = mapped.filter((row) => {
      if (tab === 'all') return true;
      if (tab === 'error_reports') return row.category === 'error_report';
      if (tab === 'warnings') return row.category === 'warning';
      if (tab === 'notifications') return row.category === 'notification';
      if (tab === 'logs') return row.category === 'log';
      return true;
    });

    return res.json({
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      overallTotal: total,
      limit,
      offset,
      tab,
    });
  } catch (err) {
    console.error('[super admin] getSystemLogs:', err);
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
  getSystemLogs,
};
