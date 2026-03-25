const pool = require('../../db/index');

// GET /super-admin/companies/:companyId/api-tracking
async function getCompanyApiTracking(req, res) {
  try {
    const { companyId } = req.params;
    const limit = Math.max(10, Math.min(300, Number(req.query.limit) || 100));

    const companyQ = await pool.query(`SELECT company_id FROM chatbots WHERE company_id = $1`, [companyId]);
    if (!companyQ.rows[0]) return res.status(404).json({ error: 'Company not found' });

    const [totalQ, byProviderQ, byCategoryQ, chatContextQ, recentQ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_calls,
           COUNT(*) FILTER (WHERE success = TRUE)::int AS success_calls,
           COUNT(*) FILTER (WHERE success = FALSE)::int AS failed_calls,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS calls_24h,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS calls_7d,
           COALESCE(ROUND(AVG(latency_ms))::int, 0) AS avg_latency_ms
         FROM api_usage_logs
         WHERE company_id = $1`,
        [companyId]
      ),
      pool.query(
        `SELECT
           api_provider AS provider,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE success = FALSE)::int AS failed,
           COALESCE(ROUND(AVG(latency_ms))::int, 0) AS avg_latency_ms
         FROM api_usage_logs
         WHERE company_id = $1
         GROUP BY api_provider
         ORDER BY calls DESC, provider ASC`,
        [companyId]
      ),
      pool.query(
        `SELECT
           api_category AS category,
           COUNT(*)::int AS calls
         FROM api_usage_logs
         WHERE company_id = $1
         GROUP BY api_category
         ORDER BY calls DESC, category ASC`,
        [companyId]
      ),
      pool.query(
        `SELECT
           COALESCE(request_context, 'unknown') AS context,
           api_provider AS provider,
           model,
           COUNT(*)::int AS calls
         FROM api_usage_logs
         WHERE company_id = $1 AND api_category = 'chat'
         GROUP BY COALESCE(request_context, 'unknown'), api_provider, model
         ORDER BY calls DESC, provider ASC`,
        [companyId]
      ),
      pool.query(
        `SELECT
           id,
           session_id AS "sessionId",
           api_provider AS provider,
           api_category AS category,
           model,
           request_context AS "requestContext",
           latency_ms AS "latencyMs",
           success,
           error_message AS "errorMessage",
           metadata,
           created_at AS "createdAt"
         FROM api_usage_logs
         WHERE company_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [companyId, limit]
      ),
    ]);

    return res.json({
      companyId,
      summary: totalQ.rows[0] || {},
      byProvider: byProviderQ.rows || [],
      byCategory: byCategoryQ.rows || [],
      chatContextApis: chatContextQ.rows || [],
      recent: recentQ.rows || [],
      limit,
    });
  } catch (err) {
    console.error('[super admin] getCompanyApiTracking:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getCompanyApiTracking };

