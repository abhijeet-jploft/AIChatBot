const pool = require('../../db/index');
const os = require('os');

// GET /super-admin/dashboard
async function getDashboard(req, res) {
  try {
    const [
      companies,
      activeSubscriptions,
      conversations,
      leads,
      convertedLeadsMonthly,
      convertedLeadsYearly,
      recentLeads,
      topCompanies,
      leadsByStatus,
      conversationsByDay,
      revenueByMonth,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM chatbots`),
      pool.query(`SELECT COUNT(*) AS n FROM chatbots WHERE COALESCE(is_suspended, FALSE) = FALSE`),
      pool.query(`SELECT COUNT(*) AS n FROM chat_sessions`),
      pool.query(`SELECT COUNT(*) AS n FROM leads WHERE deleted_at IS NULL`),
      pool.query(
        `SELECT COUNT(*) AS n
         FROM leads
         WHERE deleted_at IS NULL
           AND status = 'converted'
           AND created_at >= DATE_TRUNC('month', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*) AS n
         FROM leads
         WHERE deleted_at IS NULL
           AND status = 'converted'
           AND created_at >= DATE_TRUNC('year', NOW())`
      ),
      pool.query(
        `SELECT l.name, l.email, l.phone, l.lead_score_category, l.status, l.created_at, c.name AS company_name
         FROM leads l
         JOIN chatbots c ON c.company_id = l.company_id
         WHERE l.deleted_at IS NULL
         ORDER BY l.created_at DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT c.company_id, c.name,
           COUNT(DISTINCT s.id) AS conversations,
           COUNT(DISTINCT l.id) AS leads
         FROM chatbots c
         LEFT JOIN chat_sessions s ON s.company_id = c.company_id
         LEFT JOIN leads l ON l.company_id = c.company_id AND l.deleted_at IS NULL
         GROUP BY c.company_id, c.name
         ORDER BY leads DESC, conversations DESC
         LIMIT 5`
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS n
         FROM leads
         WHERE deleted_at IS NULL
         GROUP BY status
         ORDER BY n DESC`
      ),
      pool.query(
        `SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::int AS n
         FROM chat_sessions
         WHERE created_at >= NOW() - INTERVAL '14 days'
         GROUP BY day
         ORDER BY day`
      ),
      pool.query(
        `SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS converted_count
         FROM leads
         WHERE deleted_at IS NULL
           AND status = 'converted'
           AND created_at >= NOW() - INTERVAL '12 months'
         GROUP BY month
         ORDER BY month`
      ),
    ]);

    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMins = Math.floor((uptimeSeconds % 3600) / 60);
    const cpuCount = os.cpus().length;
    const load1m = os.loadavg()[0];
    const loadPercent = Math.round((load1m / Math.max(1, cpuCount)) * 100);
    const memoryUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const healthy = loadPercent < 85 && memoryUsedMB < 1200;

    const monthlyRevenue = parseInt(convertedLeadsMonthly.rows[0].n, 10) * 100;
    const yearlyRevenue = parseInt(convertedLeadsYearly.rows[0].n, 10) * 100;

    return res.json({
      stats: {
        totalBusinesses: parseInt(companies.rows[0].n, 10),
        activeSubscriptions: parseInt(activeSubscriptions.rows[0].n, 10),
        totalConversations: parseInt(conversations.rows[0].n, 10),
        totalLeads: parseInt(leads.rows[0].n, 10),
        revenue: {
          monthly: monthlyRevenue,
          yearly: yearlyRevenue,
          currency: 'USD',
          source: 'estimated_from_converted_leads',
        },
        systemHealthStatus: healthy ? 'Healthy' : 'Degraded',
      },
      recentLeads: recentLeads.rows,
      topCompanies: topCompanies.rows,
      charts: {
        leadsByStatus: leadsByStatus.rows,
        conversationsByDay: conversationsByDay.rows.map((r) => ({
          day: r.day,
          conversations: Number(r.n || 0),
        })),
        revenueByMonth: revenueByMonth.rows.map((r) => ({
          month: r.month,
          revenue: Number(r.converted_count || 0) * 100,
        })),
      },
      system: {
        uptime: `${uptimeHours}h ${uptimeMins}m`,
        nodeVersion: process.version,
        memoryUsedMB,
        cpuCount,
        cpuLoadPercent1m: loadPercent,
        platform: os.platform(),
      },
    });
  } catch (err) {
    console.error('[super admin] getDashboard:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getDashboard };
