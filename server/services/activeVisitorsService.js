/**
 * In-memory store for active visitor activity.
 * Supports both WebSocket presence (primary) and HTTP ping/message (fallback).
 * Key: companyId -> Map of sessionId -> { pageUrl, lastSeen, messageCount, socket? }
 * Active = (socket open) OR (no socket and lastSeen within ACTIVE_TTL_MS).
 */
const ACTIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 min
const OPEN = 1;

const store = new Map();
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
  const existing = sessions.get(key) || { pageUrl: '', lastSeen: 0, messageCount: 0 };
  sessions.set(key, {
    ...existing,
    pageUrl: pageUrl || existing.pageUrl,
    lastSeen: Date.now(),
    messageCount: isChatting ? (existing.messageCount || 0) + 1 : (existing.messageCount || 0),
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
  const existing = sessions.get(key) || { pageUrl: '', lastSeen: 0, messageCount: 0 };
  sessions.set(key, {
    pageUrl: pageUrl || existing.pageUrl,
    lastSeen: Date.now(),
    messageCount: existing.messageCount || 0,
    socket,
  });
  socketToKey.set(socket, { companyId, sessionId: key });
  notifySubscribers(companyId);
}

/**
 * Unregister a visitor when their WebSocket closes.
 */
function unregisterSocket(socket) {
  const key = socketToKey.get(socket);
  if (!key) return;
  socketToKey.delete(socket);
  const sessions = store.get(key.companyId);
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
 * Send a live alert to all admin dashboard subscribers for this company.
 * Payload: { kind, message, link? } — sent as { type: 'alert', ...payload }.
 */
function broadcastAlert(companyId, payload) {
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
  let lastMessageAt = null;
  for (const [sessionId, data] of sessions.entries()) {
    const hasOpenSocket = data.socket && data.socket.readyState === OPEN;
    const withinTtl = !data.socket && (now - data.lastSeen <= ACTIVE_TTL_MS);
    if (!hasOpenSocket && !withinTtl) continue;
    list.push({
      sessionId,
      pageUrl: data.pageUrl || '—',
      lastSeen: data.lastSeen,
      messageCount: data.messageCount || 0,
    });
    if ((data.messageCount || 0) > 0) currentlyChatting += 1;
    if (data.lastSeen && (!lastMessageAt || data.lastSeen > lastMessageAt)) lastMessageAt = data.lastSeen;
  }
  return {
    activeCount: list.length,
    currentlyChatting,
    lastMessageAt,
    sessions: list.sort((a, b) => b.lastSeen - a.lastSeen),
  };
}

module.exports = {
  record,
  getActiveForCompany,
  registerSocket,
  unregisterSocket,
  updatePageSocket,
  subscribe,
  unsubscribe,
  broadcastAlert,
};
