const pool = require('../../db/index');
const { normalizeCalendarRangeQuery } = require('../../utils/dateRangeQuery');
const { getActiveForCompany } = require('../../services/activeVisitorsService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFilters(query = {}) {
  const search = String(query.search || '').trim();
  const { from: fromDate, to: toDate } = normalizeCalendarRangeQuery(query.fromDate, query.toDate);

  const minMessagesRaw = Number.parseInt(String(query.minMessages || ''), 10);
  const maxMessagesRaw = Number.parseInt(String(query.maxMessages || ''), 10);
  const minMessages = Number.isFinite(minMessagesRaw) ? Math.max(1, minMessagesRaw) : null;
  const maxMessages = Number.isFinite(maxMessagesRaw) ? Math.max(1, maxMessagesRaw) : null;

  return {
    search,
    fromDate,
    toDate,
    minMessages,
    maxMessages,
  };
}

function buildWhere(companyId, filters, activeSessionIds) {
  const where = ['mb.company_id = $1'];
  const values = [companyId];

  if (activeSessionIds.length > 0) {
    values.push(activeSessionIds);
    where.push(`mb.session_id <> ALL($${values.length}::uuid[])`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const i = values.length;
    where.push(`(
      COALESCE(mb.first_message, '') ILIKE $${i}
      OR mb.session_id::text ILIKE $${i}
    )`);
  }

  if (filters.fromDate) {
    values.push(filters.fromDate);
    where.push(`mb.disconnected_at >= $${values.length}::date`);
  }

  if (filters.toDate) {
    values.push(filters.toDate);
    where.push(`mb.disconnected_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  if (Number.isFinite(filters.minMessages)) {
    values.push(filters.minMessages);
    where.push(`mb.user_message_count >= $${values.length}`);
  }

  if (Number.isFinite(filters.maxMessages)) {
    values.push(filters.maxMessages);
    where.push(`mb.user_message_count <= $${values.length}`);
  }

  return { whereSql: where.join(' AND '), values };
}

function buildMissedBaseCte() {
  return `
    WITH scoped_sessions AS (
      SELECT cs.id, cs.company_id, cs.updated_at
      FROM chat_sessions cs
      WHERE cs.company_id = $1
    ),
    message_stats AS (
      SELECT
        m.session_id,
        COUNT(*) FILTER (WHERE m.role = 'user')::int AS user_message_count,
        COUNT(*)::int AS message_count
      FROM chat_messages m
      JOIN scoped_sessions ss ON ss.id = m.session_id
      GROUP BY m.session_id
    ),
    first_user_message AS (
      SELECT DISTINCT ON (m.session_id)
        m.session_id,
        m.content AS first_message
      FROM chat_messages m
      JOIN scoped_sessions ss ON ss.id = m.session_id
      WHERE m.role = 'user'
      ORDER BY m.session_id, m.created_at ASC
    ),
    missed_base AS (
      SELECT
        ss.company_id,
        ss.id AS session_id,
        ss.updated_at AS disconnected_at,
        ms.user_message_count,
        ms.message_count,
        fum.first_message
      FROM scoped_sessions ss
      JOIN message_stats ms ON ms.session_id = ss.id
      LEFT JOIN first_user_message fum ON fum.session_id = ss.id
      LEFT JOIN leads l
        ON l.company_id = ss.company_id
       AND l.session_id = ss.id
       AND l.deleted_at IS NULL
      WHERE ms.user_message_count > 0
        AND l.id IS NULL
    )
  `;
}

/**
 * GET /admin/missed-conversations
 * Query: limit, offset (or page)
 * Returns: { rows, total, limit, offset } - sessions that chatted but left without becoming a lead.
 */
async function listMissedConversations(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const filters = parseFilters(req.query);

    const activeSessionIds = (getActiveForCompany(companyId)?.sessions || [])
      .map((s) => s?.sessionId)
      .filter((s) => UUID_RE.test(String(s || '')));

    const { whereSql, values } = buildWhere(companyId, filters, activeSessionIds);
    const baseCte = buildMissedBaseCte();

    const countQuery = `${baseCte}
      SELECT COUNT(*)::int AS total
      FROM missed_base mb
      WHERE ${whereSql}`;

    const rowsQuery = `${baseCte}
      SELECT
        mb.session_id,
        mb.first_message,
        mb.user_message_count,
        mb.message_count,
        mb.disconnected_at
      FROM missed_base mb
      WHERE ${whereSql}
      ORDER BY mb.disconnected_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}`;

    const [countResult, rowsResult] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(rowsQuery, [...values, limit, offset]),
    ]);

    const total = Number(countResult.rows?.[0]?.total || 0);
    const rows = (rowsResult.rows || []).map((r) => ({
      id: String(r.session_id),
      sessionId: r.session_id,
      firstMessage: r.first_message || null,
      userMessageCount: Number(r.user_message_count || 0),
      messageCount: Number(r.message_count || 0),
      disconnectedAt: r.disconnected_at,
    }));

    res.json({
      rows,
      total,
      limit,
      offset,
      page,
      filters: {
        search: filters.search,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        minMessages: filters.minMessages,
        maxMessages: filters.maxMessages,
      },
    });
  } catch (err) {
    console.error('[admin missed-conversations] list:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listMissedConversations };
