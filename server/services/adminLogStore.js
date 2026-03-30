/**
 * In-memory log store for admin: chat-related and system-related logs.
 * Ring buffer: keeps last MAX_ENTRIES per type.
 */
const MAX_ENTRIES = 1000;
const CHAT = 'chat';
const SYSTEM = 'system';

const chatLogs = [];
const systemLogs = [];
let chatId = 0;
let systemId = 0;

function append(list, idRef, type, level, message, meta = null) {
  const entry = {
    id: ++idRef.current,
    ts: new Date().toISOString(),
    level: level || 'info',
    message: String(message || ''),
    meta: meta || undefined,
    type,
  };
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.shift();
  return entry;
}

const chatIdRef = { current: 0 };
const systemIdRef = { current: 0 };

function appendChatLog(level, message, meta = null) {
  return append(chatLogs, chatIdRef, CHAT, level, message, meta);
}

function appendSystemLog(level, message, meta = null) {
  return append(systemLogs, systemIdRef, SYSTEM, level, message, meta);
}

function getLogs(options = {}) {
  const type = options.type || 'all';
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 50));
  const offset = Math.max(0, Number(options.offset) || 0);

  let list = [];
  if (type === CHAT) list = [...chatLogs].reverse();
  else if (type === SYSTEM) list = [...systemLogs].reverse();
  else list = [...systemLogs, ...chatLogs].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const total = list.length;
  const rows = list.slice(offset, offset + limit);
  return { rows, total, limit, offset };
}

module.exports = {
  appendChatLog,
  appendSystemLog,
  getLogs,
  CHAT,
  SYSTEM,
};
