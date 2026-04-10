/**
 * In-memory store for active visitor activity.
 * Supports both WebSocket presence (primary) and HTTP ping/message (fallback).
 * Key: companyId -> Map of sessionId -> { pageUrl, lastSeen, messageCount, socket? }
 * Active = (socket open) OR (no socket and lastSeen within ACTIVE_TTL_MS).
 */
const ACTIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 min
const OPEN = 1;
const TYPING_TTL_MS = 4500;
const OPERATOR_ACTIVE_TTL_MS = Math.max(
  30 * 1000,
  parseInt(process.env.OPERATOR_ACTIVE_TTL_MS || '180000', 10)
);
const pool = require('../db');

const store = new Map();
/** companyId:sessionId -> { active: true, since: timestamp } */
const operatedSessions = new Map();
/** socket -> { companyId, sessionId } for quick unregister on close */
const socketToKey = new WeakMap();
/** companyId -> Set<WebSocket> for dashboard subscribers */
const subscribers = new Map();

function getOrCreateCompany(companyId) {
  if (!store.has(companyId)) store.set(companyId, new Map());
  return store.get(companyId);
}

function getOrCreateSubscribers(companyId) {
  if (!subscribers.has(companyId)) subscribers.set(companyId, new Set());
  return subscribers.get(companyId);
}

function cleanup() {
  const now = Date.now();
  for (const [companyId, sessions] of store.entries()) {
    for (const [sessionId, data] of sessions.entries()) {
      const hasOpenSocket = data.socket && data.socket.readyState === OPEN;
      if (!hasOpenSocket && now - data.lastSeen > ACTIVE_TTL_MS) {
        sessions.delete(sessionId);
      }
    }
    if (sessions.size === 0) store.delete(companyId);
  }
}

let cleanupTimer = null;
function scheduleCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

function summarizeText(text, maxLen = 180) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}...`;
}

function notifySubscribers(companyId) {
  const subs = subscribers.get(companyId);
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify({ type: 'visitors', data: getActiveForCompany(companyId) });
  for (const ws of subs) {
    if (ws.readyState === OPEN) {
      try { ws.send(payload); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Record activity (HTTP ping or message). Updates existing session or creates TTL-based entry.
 */
function record(companyId, sessionId, pageUrl, isChatting = false) {
  if (!companyId) return;
  scheduleCleanup();
  const sessions = getOrCreateCompany(companyId);
  const key = sessionId || `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const existing = sessions.get(key) || {
    pageUrl: '',
    lastSeen: 0,
    messageCount: 0,
    firstSeen: now,
    typingUntil: 0,
  };
  sessions.set(key, {
    ...existing,
    pageUrl: pageUrl || existing.pageUrl,
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    messageCount: isChatting ? (existing.messageCount || 0) + 1 : (existing.messageCount || 0),
  });
  notifySubscribers(companyId);
}

function recordMessage(companyId, sessionId, role, content, pageUrl) {
  if (!companyId || !sessionId) return;
  scheduleCleanup();
  const sessions = getOrCreateCompany(companyId);
  const now = Date.now();
  const existing = sessions.get(sessionId) || {
    pageUrl: '',
    lastSeen: 0,
    messageCount: 0,
    firstSeen: now,
    typingUntil: 0,
  };

  const normalizedRole = String(role || '').toLowerCase() === 'assistant' ? 'assistant' : 'user';
  sessions.set(sessionId, {
    ...existing,
    pageUrl: pageUrl || existing.pageUrl,
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    messageCount: (existing.messageCount || 0) + 1,
    lastMessageRole: normalizedRole,
    lastMessageAt: now,
    lastMessagePreview: summarizeText(content),
    typingUntil: normalizedRole === 'user' ? 0 : (existing.typingUntil || 0),
  });

  notifySubscribers(companyId);
}

function setTyping(companyId, sessionId, isTyping) {
  if (!companyId || !sessionId) return;
  scheduleCleanup();
  const sessions = getOrCreateCompany(companyId);
  const now = Date.now();
  const existing = sessions.get(sessionId) || {
    pageUrl: '',
    lastSeen: 0,
    messageCount: 0,
    firstSeen: now,
    typingUntil: 0,
  };

  sessions.set(sessionId, {
    ...existing,
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    typingUntil: isTyping ? now + TYPING_TTL_MS : 0,
  });

  notifySubscribers(companyId);
}

/**
 * Register a visitor over WebSocket. They are "active" while the socket is open.
 * Re-registering with a new sessionId (e.g. after first chat message) updates the key.
 */
function registerSocket(companyId, sessionId, pageUrl, socket) {
  if (!companyId || !socket) return;
  if (socketToKey.has(socket)) unregisterSocket(socket);
  scheduleCleanup();
  const sessions = getOrCreateCompany(companyId);
  const key = sessionId || `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const existing = sessions.get(key) || {
    pageUrl: '',
    lastSeen: 0,
    messageCount: 0,
    firstSeen: now,
    typingUntil: 0,
  };
  sessions.set(key, {
    pageUrl: pageUrl || existing.pageUrl,
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    messageCount: existing.messageCount || 0,
    typingUntil: existing.typingUntil || 0,
    lastMessageRole: existing.lastMessageRole,
    lastMessageAt: existing.lastMessageAt,
    lastMessagePreview: existing.lastMessagePreview,
    socket,
  });
  socketToKey.set(socket, { companyId, sessionId: key });
  notifySubscribers(companyId);
}

/**
 * Unregister a visitor when their WebSocket closes.
 * Optional onUnregister(companyId, sessionId, { pageUrl, messageCount }) is called before removing (for missed-conversation tracking).
 */
function unregisterSocket(socket, onUnregister) {
  const key = socketToKey.get(socket);
  if (!key) return;
  const sessions = store.get(key.companyId);
  const entry = sessions?.get(key.sessionId);
  if (typeof onUnregister === 'function' && entry) {
    try {
      onUnregister(key.companyId, key.sessionId, {
        pageUrl: entry.pageUrl || '',
        messageCount: entry.messageCount || 0,
      });
    } catch (e) {
      // ignore
    }
  }
  socketToKey.delete(socket);
  if (sessions) {
    sessions.delete(key.sessionId);
    if (sessions.size === 0) store.delete(key.companyId);
    notifySubscribers(key.companyId);
  }
}

/**
 * Update current page URL for a visitor (same WebSocket).
 */
function updatePageSocket(socket, pageUrl) {
  const key = socketToKey.get(socket);
  if (!key || !pageUrl) return;
  const sessions = store.get(key.companyId);
  const entry = sessions?.get(key.sessionId);
  if (entry) {
    entry.pageUrl = pageUrl;
    entry.lastSeen = Date.now();
    notifySubscribers(key.companyId);
  }
}

function setTypingForSocket(socket, isTyping) {
  const key = socketToKey.get(socket);
  if (!key) return;
  setTyping(key.companyId, key.sessionId, Boolean(isTyping));
}

/**
 * Subscribe to live visitor updates for a company (dashboard). Call with admin WebSocket.
 */
function subscribe(companyId, ws) {
  if (!companyId || !ws) return;
  getOrCreateSubscribers(companyId).add(ws);
  if (ws.readyState === OPEN) {
    try { ws.send(JSON.stringify({ type: 'visitors', data: getActiveForCompany(companyId) })); } catch (e) { /* ignore */ }
  }
}

function unsubscribe(companyId, ws) {
  const subs = subscribers.get(companyId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) subscribers.delete(companyId);
  }
}

/**
 * Get the visitor WebSocket for a session (if connected).
 */
function getSocketForSession(companyId, sessionId) {
  const sessions = store.get(companyId);
  const entry = sessions?.get(sessionId);
  return entry?.socket && entry.socket.readyState === OPEN ? entry.socket : null;
}

/**
 * Push a message to a visitor's chat (admin take-over).
 * Sends { type: 'message', content, createdAt? } on their WebSocket.
 * Returns true if sent, false if no socket or not open.
 */
function pushMessageToSession(companyId, sessionId, content, meta = {}) {
  const socket = getSocketForSession(companyId, sessionId);
  if (!socket) return false;
  try {
    socket.send(JSON.stringify({
      type: 'message',
      content: String(content || ''),
      createdAt: meta?.createdAt || undefined,
    }));
    return true;
  } catch (e) {
    return false;
  }
}

const { shouldSendDashboardAlert } = require('./notificationPreferencesService');

/**
 * Send a live alert to all admin dashboard subscribers for this company.
 * Payload: { kind, message, link?, meetingRequested? } — sent as { type: 'alert', ...payload }.
 */
async function broadcastAlert(companyId, payload) {
  try {
    const ok = await shouldSendDashboardAlert(companyId, payload);
    if (!ok) return;
  } catch (e) {
    console.error('[broadcastAlert] prefs:', e.message);
  }
  const subs = subscribers.get(companyId);
  if (!subs || subs.size === 0) return;
  const msg = JSON.stringify({ type: 'alert', ...payload });
  for (const ws of subs) {
    if (ws.readyState === OPEN) {
      try { ws.send(msg); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Get active visitors for a company.
 * Active = (socket open) OR (no socket and lastSeen within TTL).
 */
function getActiveForCompany(companyId) {
  const sessions = getOrCreateCompany(companyId);
  const now = Date.now();
  const list = [];
  let currentlyChatting = 0;
  let typingCount = 0;
  let lastMessageAt = null;
  for (const [sessionId, data] of sessions.entries()) {
    const hasOpenSocket = data.socket && data.socket.readyState === OPEN;
    const withinTtl = !data.socket && (now - data.lastSeen <= ACTIVE_TTL_MS);
    if (!hasOpenSocket && !withinTtl) continue;

    const startedAt = data.firstSeen || data.lastSeen || now;
    const sessionLastMessageAt = data.lastMessageAt || null;
    const isTyping = Boolean(data.typingUntil && data.typingUntil > now);

    list.push({
      sessionId,
      pageUrl: data.pageUrl || '—',
      lastSeen: data.lastSeen,
      messageCount: data.messageCount || 0,
      isOpen: Boolean(hasOpenSocket),
      startedAt,
      durationSeconds: Math.max(0, Math.floor((now - startedAt) / 1000)),
      isTyping,
      lastMessageAt: sessionLastMessageAt,
      lastMessageRole: data.lastMessageRole || null,
      lastMessagePreview: data.lastMessagePreview || null,
    });
    if ((data.messageCount || 0) > 0) currentlyChatting += 1;
    if (isTyping) typingCount += 1;
    if (sessionLastMessageAt && (!lastMessageAt || sessionLastMessageAt > lastMessageAt)) {
      lastMessageAt = sessionLastMessageAt;
    } else if (data.lastSeen && (!lastMessageAt || data.lastSeen > lastMessageAt)) {
      lastMessageAt = data.lastSeen;
    }
  }
  return {
    activeCount: list.length,
    currentlyChatting,
    typingCount,
    lastMessageAt,
    sessions: list.sort((a, b) => b.lastSeen - a.lastSeen),
  };
}

/**
 * Mark a session as admin-operated (pauses AI responses for this session).
 */
async function setOperatorActive(companyId, sessionId, active = true) {
  if (!companyId || !sessionId) return;
  const key = `${companyId}:${sessionId}`;
  if (active) {
    operatedSessions.set(key, { active: true });
    try {
      await pool.query(
        `INSERT INTO operator_sessions (company_id, session_id, is_active, updated_at)
         VALUES ($1, $2, TRUE, NOW())
         ON CONFLICT (company_id, session_id)
         DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
        [companyId, sessionId]
      );
    } catch (err) {
      // Fallback to in-memory state if DB is temporarily unavailable.
      console.error('[activeVisitors] setOperatorActive(true) DB sync failed:', err.message);
    }
  } else {
    operatedSessions.delete(key);
    try {
      await pool.query(
        'DELETE FROM operator_sessions WHERE company_id = $1 AND session_id = $2',
        [companyId, sessionId]
      );
    } catch (err) {
      // Fallback to in-memory clear if DB is temporarily unavailable.
      console.error('[activeVisitors] setOperatorActive(false) DB sync failed:', err.message);
    }
  }
}

/**
 * Check if a session is currently admin-operated (AI should be paused).
 */
async function isOperatorActive(companyId, sessionId) {
  if (!companyId || !sessionId) return false;
  const key = `${companyId}:${sessionId}`;
  try {
    const result = await pool.query(
      `SELECT is_active, updated_at
       FROM operator_sessions
       WHERE company_id = $1 AND session_id = $2
       LIMIT 1`,
      [companyId, sessionId]
    );
    const row = result.rows[0] || null;
    const isActive = Boolean(row?.is_active);
    const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
    const isStale = isActive && (!updatedAt || (Date.now() - updatedAt > OPERATOR_ACTIVE_TTL_MS));

    if (isStale) {
      operatedSessions.delete(key);
      try {
        await pool.query(
          'DELETE FROM operator_sessions WHERE company_id = $1 AND session_id = $2',
          [companyId, sessionId]
        );
      } catch (cleanupErr) {
        console.error('[activeVisitors] stale operator session cleanup failed:', cleanupErr.message);
      }
      return false;
    }

    if (isActive) {
      operatedSessions.set(key, { active: true });
    } else {
      operatedSessions.delete(key);
    }
    return isActive;
  } catch (err) {
    console.error('[activeVisitors] isOperatorActive DB read failed:', err.message);
    const entry = operatedSessions.get(key);
    if (entry) return true;
    return false;
  }
}

module.exports = {
  record,
  recordMessage,
  setTyping,
  setTypingForSocket,
  getActiveForCompany,
  getSocketForSession,
  pushMessageToSession,
  registerSocket,
  unregisterSocket,
  updatePageSocket,
  subscribe,
  unsubscribe,
  broadcastAlert,
  setOperatorActive,
  isOperatorActive,
};
