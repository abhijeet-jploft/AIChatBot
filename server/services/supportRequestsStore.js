/**
 * In-memory store for support/human handoff requests.
 * Per company, ring buffer of last MAX_ENTRIES.
 */
const MAX_ENTRIES = 500;

const byCompany = new Map();

function getList(companyId) {
  if (!byCompany.has(companyId)) byCompany.set(companyId, []);
  return byCompany.get(companyId);
}

function add(companyId, { sessionId, message, requestedAt = new Date().toISOString() } = {}) {
  const list = getList(companyId);
  list.push({
    id: `${companyId}-${sessionId}-${Date.now()}`,
    companyId,
    sessionId,
    message: message || '',
    requestedAt,
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
