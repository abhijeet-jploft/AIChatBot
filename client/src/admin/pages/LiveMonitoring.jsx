import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const LIVE_POLL_MS = 10000;
const WS_RECONNECT_MS = 5000;

function formatTimeAgo(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function LiveMonitoring() {
  const { authFetch, token, company } = useAuth();
  const [live, setLive] = useState({
    activeCount: 0,
    currentlyChatting: 0,
    typingCount: 0,
    lastMessageAt: null,
    sessions: [],
  });
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await authFetch('/dashboard/live');
      if (!res.ok) return;
      const data = await res.json();
      setLive({
        activeCount: Number(data?.activeCount || 0),
        currentlyChatting: Number(data?.currentlyChatting || 0),
        typingCount: Number(data?.typingCount || 0),
        lastMessageAt: data?.lastMessageAt || null,
        sessions: Array.isArray(data?.sessions) ? data.sessions : [],
      });
    } catch {
      // ignore transient failures
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!token) {
      fetchLive();
      return undefined;
    }

    const getWsUrl = () => {
      if (typeof window === 'undefined' || !window.location) return null;
      const base = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
      const parsed = new URL(base);
      const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${parsed.host}/api/admin/ws?token=${encodeURIComponent(token)}`;
    };

    const connect = () => {
      const url = getWsUrl();
      if (!url) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'visitors' && payload.data) {
              setLive({
                activeCount: Number(payload.data.activeCount || 0),
                currentlyChatting: Number(payload.data.currentlyChatting || 0),
                typingCount: Number(payload.data.typingCount || 0),
                lastMessageAt: payload.data.lastMessageAt || null,
                sessions: Array.isArray(payload.data.sessions) ? payload.data.sessions : [],
              });
              setLoading(false);
            }
          } catch {
            // ignore malformed messages
          }
        };
        ws.onclose = () => {
          wsRef.current = null;
          reconnectRef.current = setTimeout(connect, WS_RECONNECT_MS);
        };
        ws.onerror = () => {};
      } catch {
        reconnectRef.current = setTimeout(connect, WS_RECONNECT_MS);
      }
    };

    fetchLive();
    connect();

    const poll = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetchLive();
      }
    }, LIVE_POLL_MS);

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      clearInterval(poll);
    };
  }, [token, fetchLive]);

  const sessions = Array.isArray(live.sessions) ? live.sessions : [];

  return (
    <div className="p-4" id="live-monitoring-top">
      <h5 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>Live chat monitoring</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        Real-time visitor tracking with typing indicators, current page and instant message preview.
      </p>

      <div className="row g-3 mb-3">
        <div className="col-6 col-md-3">
          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small" style={{ color: 'var(--chat-muted)' }}>Active visitors</div>
              <div className="fw-bold" style={{ fontSize: 22, color: 'var(--chat-text-heading)' }}>{live.activeCount}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small" style={{ color: 'var(--chat-muted)' }}>Currently chatting</div>
              <div className="fw-bold" style={{ fontSize: 22, color: 'var(--chat-text-heading)' }}>{live.currentlyChatting}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small" style={{ color: 'var(--chat-muted)' }}>Visitors typing</div>
              <div className="fw-bold" style={{ fontSize: 22, color: 'var(--chat-text-heading)' }}>{live.typingCount}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small" style={{ color: 'var(--chat-muted)' }}>Last activity</div>
              <div className="fw-semibold" style={{ color: 'var(--chat-text-heading)' }}>{formatTimeAgo(live.lastMessageAt)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 small text-center" style={{ color: 'var(--chat-muted)' }}>Loading live sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 small text-center" style={{ color: 'var(--chat-muted)' }}>
              No active sessions right now.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                <thead style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)' }}>
                  <tr>
                    <th className="border-0 py-2">Visitor / Session</th>
                    <th className="border-0 py-2">Typing</th>
                    <th className="border-0 py-2">Current page</th>
                    <th className="border-0 py-2">Duration</th>
                    <th className="border-0 py-2">Last message</th>
                    <th className="border-0 py-2 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.sessionId}>
                      <td className="align-middle">
                        <div className="small" style={{ color: 'var(--chat-muted)' }}>Visitor ID</div>
                        <code>{session.sessionId}</code>
                      </td>
                      <td className="align-middle">
                        {session.isTyping ? <span className="badge text-bg-warning">Typing...</span> : <span className="badge text-bg-light border">Idle</span>}
                      </td>
                      <td className="align-middle">
                        <span className="small" title={session.pageUrl || ''}>
                          {String(session.pageUrl || '-').slice(0, 80)}
                        </span>
                      </td>
                      <td className="align-middle">{formatDuration(session.durationSeconds)}</td>
                      <td className="align-middle">
                        <div className="small" style={{ color: 'var(--chat-muted)' }}>
                          {session.lastMessageRole ? String(session.lastMessageRole).toUpperCase() : 'No Message'} • {formatTimeAgo(session.lastMessageAt || session.lastSeen)}
                        </div>
                        <div className="small">
                          {session.lastMessagePreview || '-'}
                        </div>
                      </td>
                      <td className="align-middle text-end">
                        <div className="admin-action-stack admin-action-stack-end">
                          <Link to={`/admin/chat/${session.sessionId}`} className="btn btn-sm btn-primary">Operate Chat</Link>
                          <a
                            href={`/?sessionId=${encodeURIComponent(session.sessionId)}&companyId=${encodeURIComponent(company?.companyId || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Visitor preview
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
