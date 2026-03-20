/**
 * WebSocket handlers for visitor presence and admin live dashboard.
 * - Visitor path: /api/ws — register with { type: 'register', companyId, sessionId?, pageUrl? }; optional { type: 'page', pageUrl }
 * - Admin path:  /api/admin/ws — query ?token=... ; server pushes { type: 'visitors', data } on changes
 */
const { WebSocketServer } = require('ws');
const CompanyAdmin = require('../admin/models/CompanyAdmin');
const {
  registerSocket,
  unregisterSocket,
  updatePageSocket,
  setTypingForSocket,
  subscribe,
  unsubscribe,
} = require('../services/activeVisitorsService');
const { addIfMissed } = require('../services/missedConversationsStore');

const VISITOR_PATH = '/api/ws';
const ADMIN_PATH = '/api/admin/ws';

function handleVisitorWs(ws) {
  let registered = false;
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'register') {
        const { companyId, sessionId, pageUrl } = msg;
        if (!companyId) return;
        registerSocket(companyId, sessionId || null, pageUrl || '', ws);
        registered = true;
        return;
      }
      if (msg.type === 'page' && registered) {
        updatePageSocket(ws, msg.pageUrl || '');
        return;
      }
      if (msg.type === 'typing' && registered) {
        setTypingForSocket(ws, Boolean(msg.isTyping));
      }
    } catch (e) {
      // ignore invalid JSON
    }
  });
  const onUnregister = (companyId, sessionId, data) => addIfMissed(companyId, sessionId, data);
  ws.on('close', () => {
    if (registered) unregisterSocket(ws, onUnregister);
  });
  ws.on('error', () => {
    if (registered) unregisterSocket(ws, onUnregister);
  });
}

async function handleAdminWs(ws, companyId) {
  subscribe(companyId, ws);
  ws.on('close', () => unsubscribe(companyId, ws));
  ws.on('error', () => unsubscribe(companyId, ws));
}

/**
 * Resolve admin companyId from token (query or first message).
 * Returns { companyId } or null.
 */
async function authAdminToken(token) {
  if (!token) return null;
  const session = await CompanyAdmin.findSessionByToken(token);
  return session ? { companyId: session.company_id } : null;
}

/**
 * Attach WebSocket server to HTTP server. Handles upgrade by path.
 * @param {import('http').Server} server - same server as Express
 */
function attachPresenceWs(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const path = request.url?.split('?')[0] || '';

    if (path === VISITOR_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        handleVisitorWs(ws);
      });
      return;
    }

    if (path === ADMIN_PATH) {
      const token = new URL(request.url || '', 'http://x').searchParams.get('token');
      authAdminToken(token).then((auth) => {
        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
          handleAdminWs(ws, auth.companyId);
        });
      }).catch(() => {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      });
      return;
    }

    socket.destroy();
  });

  return wss;
}

module.exports = { attachPresenceWs, VISITOR_PATH, ADMIN_PATH };
