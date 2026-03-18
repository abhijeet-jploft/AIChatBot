const pool = require('../../db/index');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /admin/conversations
 * Query: search, limit, offset (or page; offset = (page-1)*limit)
 * Returns: { rows, total } - conversations with message_count, first_message, leadId when applicable.
 */
async function listConversations(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(req.query.limit) || DEFAULT_LIMIT));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    const countWhere = ['cs.company_id = $1'];
    const listWhere = ['cs.company_id = $1'];
    const countValues = [companyId];
    const listValues = [companyId];

    if (search) {
      const searchPattern = `%${search}%`;
      countValues.push(searchPattern);
      listValues.push(searchPattern);
      const iCount = countValues.length;
      const iList = listValues.length;
      countWhere.push(`(
        cs.title ILIKE $${iCount}
        OR EXISTS (
          SELECT 1 FROM chat_messages m
          WHERE m.session_id = cs.id AND m.role = 'user' AND m.content ILIKE $${iCount}
          LIMIT 1
        )
      )`);
      listWhere.push(`(
        cs.title ILIKE $${iList}
        OR EXISTS (
          SELECT 1 FROM chat_messages m
          WHERE m.session_id = cs.id AND m.role = 'user' AND m.content ILIKE $${iList}
          LIMIT 1
        )
      )`);
    }

    const countSql = `SELECT COUNT(*)::int AS total
      FROM chat_sessions cs
      WHERE ${countWhere.join(' AND ')}`;
    const countResult = await pool.query(countSql, countValues);
    const total = countResult.rows[0]?.total ?? 0;

    const listValuesWithPage = [...listValues, limit, offset];
    const listSql = `
      SELECT
        cs.id,
        cs.title,
        cs.created_at,
        cs.updated_at,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id)::int AS message_count,
        (SELECT content FROM chat_messages WHERE session_id = cs.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) AS first_message,
        (SELECT l.id FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL LIMIT 1) AS lead_id
      FROM chat_sessions cs
      WHERE ${listWhere.join(' AND ')}
      ORDER BY cs.updated_at DESC
      LIMIT $${listValues.length + 1}
      OFFSET $${listValues.length + 2}
    `;
    const { rows } = await pool.query(listSql, listValuesWithPage);

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const conversations = rows.map((r) => ({
      id: r.id,
      title: r.title || 'New Chat',
      firstMessage: (r.first_message || '').toString().slice(0, 200),
      messageCount: r.message_count ?? 0,
      leadId: r.lead_id || null,
      leadCaptured: Boolean(r.lead_id),
      status: r.updated_at >= thirtyMinutesAgo ? 'active' : 'closed',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    res.json({
      rows: conversations,
      total,
      limit,
      offset,
      page,
    });
  } catch (err) {
    console.error('[admin conversations] list:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listConversations };
