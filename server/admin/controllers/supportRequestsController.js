const { add: addSupportRequest } = require('../../services/supportRequestsStore');
const { appendSystemLog } = require('../../services/adminLogStore');
const pool = require('../../db/index');

/**
 * GET /admin/support-requests
 * Query: limit, offset (or page)
 * Returns: { rows, total, limit, offset, page } with optional firstMessage from DB.
 */
async function listSupportRequestsHandler(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS n FROM support_tickets WHERE company_id = $1`,
      [companyId]
    );
    const listQ = await pool.query(
      `SELECT id, company_id AS "companyId", session_id AS "sessionId", source, message, priority, status,
              requested_by AS "requestedBy", created_at AS "requestedAt"
       FROM support_tickets
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [companyId, limit, offset]
    );
    const rows = listQ.rows.map((r) => ({
      ...r,
      firstMessage: r.message,
    }));

    res.json({
      rows,
      total: Number(countQ.rows[0]?.n || 0),
      limit,
      offset,
      page,
    });
  } catch (err) {
    console.error('[admin support-requests] list:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/support-requests
 * Body: { message, priority? }
 * Creates a manual admin-raised support ticket.
 */
async function createSupportRequestHandler(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const companyName = req.adminCompanyName || companyId;
    const message = String(req.body?.message || '').trim();
    const priorityRaw = String(req.body?.priority || 'normal').trim().toLowerCase();
    const priority = ['low', 'normal', 'high', 'urgent'].includes(priorityRaw) ? priorityRaw : 'normal';
    if (!message) return res.status(400).json({ error: 'message is required' });

    addSupportRequest(companyId, {
      sessionId: null,
      message,
      source: 'admin',
      requestedBy: companyName,
      priority,
    });

    appendSystemLog('warn', 'Admin raised support ticket', {
      category: 'notification',
      companyId,
      companyName,
      priority,
      message,
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[admin support-requests] create:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function listSupportRequestMessagesHandler(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const { ticketId } = req.params;
    const ticketQ = await pool.query(
      `SELECT id FROM support_tickets WHERE id = $1 AND company_id = $2`,
      [ticketId, companyId]
    );
    if (!ticketQ.rows[0]) return res.status(404).json({ error: 'Ticket not found' });

    const q = await pool.query(
      `SELECT id, ticket_id AS "ticketId", sender_role AS "senderRole", sender_name AS "senderName",
              message, created_at AS "createdAt"
       FROM support_ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );
    return res.json({ rows: q.rows });
  } catch (err) {
    console.error('[admin support-requests] list messages:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function createSupportRequestMessageHandler(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const companyName = req.adminCompanyName || companyId;
    const { ticketId } = req.params;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required' });

    const ticketQ = await pool.query(
      `SELECT id FROM support_tickets WHERE id = $1 AND company_id = $2`,
      [ticketId, companyId]
    );
    if (!ticketQ.rows[0]) return res.status(404).json({ error: 'Ticket not found' });

    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_role, sender_name, message)
       VALUES ($1, 'admin', $2, $3)`,
      [ticketId, companyName, message]
    );
    await pool.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[admin support-requests] create message:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listSupportRequestsHandler,
  createSupportRequestHandler,
  listSupportRequestMessagesHandler,
  createSupportRequestMessageHandler,
};
