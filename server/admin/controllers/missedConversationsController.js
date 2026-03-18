const { list: listMissed } = require('../../services/missedConversationsStore');
const pool = require('../../db/index');

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

    const result = listMissed(companyId, { limit, offset });
    const sessionIds = result.rows.map((r) => r.sessionId).filter(Boolean);

    let firstMessageBySession = new Map();
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await pool.query(
        `SELECT session_id, content
         FROM (
           SELECT session_id, content,
             ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at ASC) AS rn
           FROM chat_messages
           WHERE session_id IN (${placeholders}) AND role = 'user'
         ) sub
         WHERE rn = 1`,
        sessionIds
      );
      rows.forEach((r) => firstMessageBySession.set(r.session_id, r.content));
    }

    const rows = result.rows.map((r) => ({
      ...r,
      firstMessage: firstMessageBySession.get(r.sessionId) || null,
    }));

    res.json({
      rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      page: Math.floor(result.offset / result.limit) + 1,
    });
  } catch (err) {
    console.error('[admin missed-conversations] list:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listMissedConversations };
