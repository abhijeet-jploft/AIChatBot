const pool = require('../../db/index');

// GET /super-admin/companies/:companyId/api-tracking
async function getCompanyApiTracking(req, res) {
  try {
    const { companyId } = req.params;
    const limit = Math.max(10, Math.min(300, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const provider = String(req.query.provider || '').trim();
    const category = String(req.query.category || '').trim();
    const context = String(req.query.context || '').trim();
    const status = String(req.query.status || '').trim().toLowerCase();

    const companyQ = await pool.query(`SELECT company_id FROM chatbots WHERE company_id = $1`, [companyId]);
    if (!companyQ.rows[0]) return res.status(404).json({ error: 'Company not found' });

    const recentWhere = ['company_id = $1'];
    const recentParams = [companyId];

    if (provider) {
      recentParams.push(provider);
      recentWhere.push(`api_provider = $${recentParams.length}`);
    }
    if (category) {
      recentParams.push(category);
      recentWhere.push(`api_category = $${recentParams.length}`);
    }
    if (context) {
      recentParams.push(context);
      recentWhere.push(`COALESCE(request_context, 'unknown') = $${recentParams.length}`);
    }
    if (status === 'success' || status === 'failed') {
      recentParams.push(status === 'success');
      recentWhere.push(`success = $${recentParams.length}`);
    }
    if (search) {
      recentParams.push(`%${search}%`);
      const p = `$${recentParams.length}`;
      recentWhere.push(`(
        COALESCE(api_provider, '') ILIKE ${p}
        OR COALESCE(api_category, '') ILIKE ${p}
        OR COALESCE(model, '') ILIKE ${p}
        OR COALESCE(request_context, '') ILIKE ${p}
        OR COALESCE(error_message, '') ILIKE ${p}
        OR COALESCE(session_id, '') ILIKE ${p}
      )`);
    }

    const recentWhereSql = recentWhere.join(' AND ');

    const [totalQ, byProviderQ, byCategoryQ, chatContextQ, recentCountQ, recentQ, providerOptionsQ, categoryOptionsQ, contextOptionsQ] = await Promise.all([
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
        `SELECT COUNT(*)::int AS n
         FROM api_usage_logs
         WHERE ${recentWhereSql}`,
        recentParams
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
         WHERE ${recentWhereSql}
         ORDER BY created_at DESC
         LIMIT $${recentParams.length + 1}
         OFFSET $${recentParams.length + 2}`,
        [...recentParams, limit, offset]
      ),
      pool.query(
        `SELECT DISTINCT api_provider AS value
         FROM api_usage_logs
         WHERE company_id = $1 AND COALESCE(api_provider, '') <> ''
         ORDER BY value ASC`,
        [companyId]
      ),
      pool.query(
        `SELECT DISTINCT api_category AS value
         FROM api_usage_logs
         WHERE company_id = $1 AND COALESCE(api_category, '') <> ''
         ORDER BY value ASC`,
        [companyId]
      ),
      pool.query(
        `SELECT DISTINCT COALESCE(request_context, 'unknown') AS value
         FROM api_usage_logs
         WHERE company_id = $1
         ORDER BY value ASC`,
        [companyId]
      ),
    ]);
    const totalRecent = recentCountQ.rows?.[0]?.n || 0;
    const totalPages = Math.max(1, Math.ceil(totalRecent / limit));

    return res.json({
      companyId,
      summary: totalQ.rows[0] || {},
      byProvider: byProviderQ.rows || [],
      byCategory: byCategoryQ.rows || [],
      chatContextApis: chatContextQ.rows || [],
      recent: recentQ.rows || [],
      recentMeta: {
        page,
        limit,
        total: totalRecent,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
      recentFilters: {
        search,
        provider,
        category,
        context,
        status: status === 'success' || status === 'failed' ? status : '',
      },
      recentFilterOptions: {
        providers: (providerOptionsQ.rows || []).map((r) => r.value).filter(Boolean),
        categories: (categoryOptionsQ.rows || []).map((r) => r.value).filter(Boolean),
        contexts: (contextOptionsQ.rows || []).map((r) => r.value).filter(Boolean),
      },
    });
  } catch (err) {
    console.error('[super admin] getCompanyApiTracking:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getCompanyApiTracking };

