const pool = require('../../db/index');

function ilikeContainsPattern(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return `%${s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

async function listSupportTickets(req, res) {
  try {
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const priority = String(req.query.priority || 'all').trim().toLowerCase();
    const source = String(req.query.source || 'all').trim().toLowerCase();
    const search = ilikeContainsPattern(req.query.search);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const offset = req.query.offset !== undefined
      ? Math.max(0, Number(req.query.offset) || 0)
      : (page - 1) * limit;

    const where = [];
    const params = [];
    if (status !== 'all') {
      where.push(`t.status = $${params.length + 1}`);
      params.push(status);
    }
    if (priority !== 'all') {
      where.push(`t.priority = $${params.length + 1}`);
      params.push(priority);
    }
    if (source !== 'all') {
      where.push(`t.source = $${params.length + 1}`);
      params.push(source);
    }
    if (search) {
      where.push(`(
        COALESCE(t.message, '') ILIKE $${params.length + 1} ESCAPE '\\'
        OR COALESCE(c.name, '') ILIKE $${params.length + 1} ESCAPE '\\'
        OR COALESCE(t.company_id, '') ILIKE $${params.length + 1} ESCAPE '\\'
        OR COALESCE(t.requested_by, '') ILIKE $${params.length + 1} ESCAPE '\\'
      )`);
      params.push(search);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM support_tickets t
       JOIN chatbots c ON c.company_id = t.company_id
       ${whereSql}`,
      params
    );
    const listQ = await pool.query(
      `SELECT t.id, t.company_id AS "companyId", c.name AS "companyName", t.session_id AS "sessionId",
              t.source, t.message, t.priority, t.status, t.requested_by AS "requestedBy",
              t.created_at AS "createdAt", t.updated_at AS "updatedAt", t.resolved_at AS "resolvedAt", t.closed_at AS "closedAt"
       FROM support_tickets t
       JOIN chatbots c ON c.company_id = t.company_id
       ${whereSql}
       ORDER BY t.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.json({
      rows: listQ.rows,
      total: Number(countQ.rows[0]?.n || 0),
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      status,
      priority,
      source,
      search: String(req.query.search || '').trim(),
    });
  } catch (err) {
    console.error('[super admin] listSupportTickets:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateSupportTicketStatus(req, res) {
  try {
    const { ticketId } = req.params;
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!['pending', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, resolved, or closed' });
    }
    const { rows } = await pool.query(
      `UPDATE support_tickets
       SET status = $1::text,
           updated_at = NOW(),
           resolved_at = CASE WHEN $1::text = 'resolved' THEN NOW() ELSE resolved_at END,
           closed_at = CASE WHEN $1::text = 'closed' THEN NOW() ELSE closed_at END
       WHERE id = $2::uuid
       RETURNING id`,
      [status, ticketId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] updateSupportTicketStatus:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function listSupportTicketMessages(req, res) {
  try {
    const { ticketId } = req.params;
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
    console.error('[super admin] listSupportTicketMessages:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function createSupportTicketMessage(req, res) {
  try {
    const { ticketId } = req.params;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required' });
    const q = await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_role, sender_name, message)
       VALUES ($1, 'super_admin', $2, $3)
       RETURNING id`,
      [ticketId, req.superAdminUsername || 'Super Admin', message]
    );
    if (!q.rows[0]) return res.status(400).json({ error: 'Could not add message' });
    await pool.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[super admin] createSupportTicketMessage:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listSupportTickets,
  updateSupportTicketStatus,
  listSupportTicketMessages,
  createSupportTicketMessage,
};
