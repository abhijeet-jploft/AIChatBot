/**
 * In-memory store for support/human handoff requests.
 * Per company, ring buffer of last MAX_ENTRIES.
 */
const MAX_ENTRIES = 500;
const pool = require('../db/index');

const byCompany = new Map();

function getList(companyId) {
  if (!byCompany.has(companyId)) byCompany.set(companyId, []);
  return byCompany.get(companyId);
}

function add(companyId, {
  sessionId,
  message,
  source = 'visitor',
  requestedBy = null,
  priority = 'normal',
  requestedAt = new Date().toISOString(),
} = {}) {
  const list = getList(companyId);
  list.push({
    id: `${companyId}-${sessionId}-${Date.now()}`,
    companyId,
    sessionId,
    message: message || '',
    source: String(source || 'visitor'),
    requestedBy: requestedBy || undefined,
    priority: String(priority || 'normal'),
    requestedAt,
  });
  if (list.length > MAX_ENTRIES) list.shift();

  // Persist for cross-session super-admin workflows.
  pool.query(
    `WITH created AS (
       INSERT INTO support_tickets (company_id, session_id, source, message, priority, status, requested_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING id
     )
     INSERT INTO support_ticket_messages (ticket_id, sender_role, sender_name, message)
     SELECT id, $7, $6, $4 FROM created`,
    [
      companyId,
      sessionId || null,
      String(source || 'visitor'),
      String(message || ''),
      String(priority || 'normal'),
      requestedBy || null,
      String(source || 'visitor') === 'admin' ? 'admin' : 'visitor',
    ]
  ).catch((err) => {
    console.error('[supportRequestsStore] persist add:', err.message);
  });
}

function list(companyId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const offset = Math.max(0, Number(options.offset) || 0);
  const list = getList(companyId);
  const total = list.length;
  const rows = [...list].reverse().slice(offset, offset + limit);
  return { rows, total, limit, offset };
}

/** Keywords that indicate a request for human/support (case-insensitive). */
const SUPPORT_KEYWORDS = [
  'human',
  'real person',
  'real people',
  'support',
  'agent',
  'representative',
  'talk to someone',
  'speak to someone',
  'customer service',
  'live agent',
  'live chat',
  'human agent',
  'human support',
  'get help',
  'need help',
  'contact support',
  'speak with',
  'talk with',
  'operator',
];

function isSupportRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();
  return SUPPORT_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = { add, list, isSupportRequest };
