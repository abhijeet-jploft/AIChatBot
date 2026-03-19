const pool = require('../../db/index');
const ChatMessage = require('../../models/ChatMessage');
const ChatSession = require('../../models/ChatSession');
const { pushMessageToSession } = require('../../services/activeVisitorsService');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /admin/conversations
 * Query: search, limit, page, dateFrom, dateTo, leadStatus (all|yes|no), status (all|active|closed)
 * Returns: { rows, total, limit, page } - conversations with message_count, first_message, leadId.
 * 4.3.3: Filter by date range, lead status, active/closed, search by visitor name/email/phone or first message/title.
 */
async function listConversations(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(req.query.limit) || DEFAULT_LIMIT));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const dateFrom = (req.query.dateFrom || '').trim();
    const dateTo = (req.query.dateTo || '').trim();
    const leadStatus = (req.query.leadStatus || 'all').toLowerCase();
    const statusFilter = (req.query.status || 'all').toLowerCase();
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const countWhere = ['cs.company_id = $1'];
    const listWhere = ['cs.company_id = $1'];
    const countValues = [companyId];
    const listValues = [companyId];
    let paramIndex = 2;

    if (dateFrom) {
      countWhere.push(`(cs.updated_at >= $${paramIndex}::timestamptz)`);
      listWhere.push(`(cs.updated_at >= $${paramIndex}::timestamptz)`);
      countValues.push(dateFrom);
      listValues.push(dateFrom);
      paramIndex += 1;
    }
    if (dateTo) {
      countWhere.push(`(cs.updated_at <= $${paramIndex}::timestamptz)`);
      listWhere.push(`(cs.updated_at <= $${paramIndex}::timestamptz)`);
      countValues.push(dateTo);
      listValues.push(dateTo);
      paramIndex += 1;
    }

    if (leadStatus === 'yes') {
      countWhere.push(`EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
      listWhere.push(`EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
    } else if (leadStatus === 'no') {
      countWhere.push(`NOT EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
      listWhere.push(`NOT EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
    }

    if (statusFilter === 'active') {
      countWhere.push(`cs.updated_at >= $${paramIndex}`);
      listWhere.push(`cs.updated_at >= $${paramIndex}`);
      countValues.push(thirtyMinutesAgo);
      listValues.push(thirtyMinutesAgo);
      paramIndex += 1;
    } else if (statusFilter === 'closed') {
      countWhere.push(`cs.updated_at < $${paramIndex}`);
      listWhere.push(`cs.updated_at < $${paramIndex}`);
      countValues.push(thirtyMinutesAgo);
      listValues.push(thirtyMinutesAgo);
      paramIndex += 1;
    }

    if (search) {
      const searchPattern = `%${search}%`;
      countValues.push(searchPattern);
      listValues.push(searchPattern);
      const iCount = paramIndex;
      const iList = paramIndex;
      paramIndex += 1;
      countWhere.push(`(
        cs.title ILIKE $${iCount}
        OR EXISTS (
          SELECT 1 FROM chat_messages m
          WHERE m.session_id = cs.id AND m.role = 'user' AND m.content ILIKE $${iCount}
          LIMIT 1
        )
        OR EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
          AND (COALESCE(l.name,'') ILIKE $${iCount} OR COALESCE(l.phone,'') ILIKE $${iCount} OR COALESCE(l.email,'') ILIKE $${iCount})
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
        OR EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
          AND (COALESCE(l.name,'') ILIKE $${iList} OR COALESCE(l.phone,'') ILIKE $${iList} OR COALESCE(l.email,'') ILIKE $${iList})
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

    const activeCutoffMs = new Date(thirtyMinutesAgo).getTime();
    const conversations = rows.map((r) => {
      const updatedMs = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return {
        id: r.id,
        title: r.title || 'New Chat',
        firstMessage: (r.first_message || '').toString().slice(0, 200),
        messageCount: r.message_count ?? 0,
        leadId: r.lead_id || null,
        leadCaptured: Boolean(r.lead_id),
        status: updatedMs >= activeCutoffMs ? 'active' : 'closed',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

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

/**
 * POST /admin/conversations/:sessionId/send
 * Body: { content }
 * Saves message as assistant, pushes to visitor WebSocket if connected (take-over).
 */
async function sendMessage(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const sessionId = req.params.sessionId;
    const content = req.body?.content != null ? String(req.body.content) : '';

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const sessionRow = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND company_id = $2',
      [sessionId, companyId]
    );
    if (!sessionRow.rows?.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await ChatMessage.create(sessionId, 'assistant', content);
    await ChatSession.touch(sessionId);

    const pushed = pushMessageToSession(companyId, sessionId, content);

    res.json({ sent: true, pushedToLive: pushed });
  } catch (err) {
    console.error('[admin conversations] send:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listConversations, sendMessage };
