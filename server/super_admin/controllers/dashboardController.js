const pool = require('../../db/index');
const os = require('os');

// GET /super-admin/dashboard
async function getDashboard(req, res) {
  try {
    const [companies, conversations, leads, recentLeads, topCompanies] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM chatbots`),
      pool.query(`SELECT COUNT(*) AS n FROM chat_sessions`),
      pool.query(`SELECT COUNT(*) AS n FROM leads WHERE deleted_at IS NULL`),
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
    ]);

    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMins = Math.floor((uptimeSeconds % 3600) / 60);

    return res.json({
      stats: {
        totalCompanies: parseInt(companies.rows[0].n, 10),
        totalConversations: parseInt(conversations.rows[0].n, 10),
        totalLeads: parseInt(leads.rows[0].n, 10),
      },
      recentLeads: recentLeads.rows,
      topCompanies: topCompanies.rows,
      system: {
        uptime: `${uptimeHours}h ${uptimeMins}m`,
        nodeVersion: process.version,
        memoryUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpuCount: os.cpus().length,
        platform: os.platform(),
      },
    });
  } catch (err) {
    console.error('[super admin] getDashboard:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getDashboard };
