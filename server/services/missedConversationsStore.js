/**
 * In-memory store for missed conversations (visitor chatted but left without becoming a lead).
 * Per company, ring buffer of last MAX_ENTRIES.
 */
const MAX_ENTRIES = 500;

const byCompany = new Map();

function getList(companyId) {
  if (!byCompany.has(companyId)) byCompany.set(companyId, []);
  return byCompany.get(companyId);
}

function add(companyId, sessionId, { pageUrl = '', messageCount = 0, disconnectedAt = new Date().toISOString() } = {}) {
  const list = getList(companyId);
  list.push({
    id: `${companyId}-${sessionId}-${Date.now()}`,
    companyId,
    sessionId,
    pageUrl,
    messageCount,
    disconnectedAt,
  });
  if (list.length > MAX_ENTRIES) list.shift();
}

function list(companyId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const offset = Math.max(0, Number(options.offset) || 0);
  const list = getList(companyId);
  const total = list.length;
  const rows = [...list].reverse().slice(offset, offset + limit);
  return { rows, total, limit, offset };
}

/** Simple UUID-ish check (session_id from chat_sessions is UUID) */
function isUuid(s) {
  return typeof s === 'string' && s.length === 36 && s.includes('-');
}

/**
 * Call when a visitor disconnects. If they had messages and no lead, add to missed list.
 * Fire-and-forget async (no need to await in caller).
 */
function addIfMissed(companyId, sessionId, { pageUrl = '', messageCount = 0 }) {
  if (!isUuid(sessionId) || (messageCount || 0) < 1) return;
  const Lead = require('../models/Lead');
  Lead.findByCompanyAndSession(companyId, sessionId)
    .then((lead) => {
      if (!lead) {
        add(companyId, sessionId, { pageUrl, messageCount, disconnectedAt: new Date().toISOString() });
      }
    })
    .catch(() => {});
}

module.exports = { add, list, addIfMissed };
