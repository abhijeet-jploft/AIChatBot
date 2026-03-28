import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const LIVE_POLL_MS = 8000;
const WS_RECONNECT_MS = 5000;
const PAGE_SIZE = 20;

const TAB_LIVE = 'live';
const TAB_ALL = 'all';

function canTakeOver(sessionId) {
  return typeof sessionId === 'string' && sessionId.length === 36 && sessionId.includes('-');
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function TakeOver() {
  const { authFetch, company, token } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB_LIVE);

  // Live conversations
  const [liveSessions, setLiveSessions] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [sending, setSending] = useState(null);
  const [draft, setDraft] = useState({});
  const liveWsRef = useRef(null);
  const liveReconnectRef = useRef(null);

  // All conversations (server-side search + pagination)
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [allData, setAllData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [allLoading, setAllLoading] = useState(false);

  // Reply modal (send message to any conversation)
  const [replyTo, setReplyTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySending, setReplySending] = useState(false);

  const fetchLive = useCallback(async () => {
    try {
      const res = await authFetch('/dashboard/live');
      if (!res.ok) return;
      const data = await res.json();
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      const openOnly = sessions.filter((s) => s.isOpen && (s.messageCount || 0) > 0);
      setLiveSessions(openOnly);
    } catch {
      setLiveSessions([]);
    } finally {
      setLiveLoading(false);
    }
  }, [authFetch]);

  // Live conversations: WebSocket for real-time updates, HTTP poll as fallback
  useEffect(() => {
    if (!token) {
      fetchLive();
      return;
    }

    const getWsUrl = () => {
      if (typeof window === 'undefined' || !window.location) return null;
      const base = API_BASE.startsWith('http')
        ? API_BASE
        : `${window.location.origin}${API_BASE}`;
      const u = new URL(base);
      const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${u.host}/api/admin/ws?token=${encodeURIComponent(token)}`;
    };

    const applySessions = (payload) => {
      if (!payload || !Array.isArray(payload.sessions)) {
        setLiveSessions([]);
        return;
      }
      const openOnly = payload.sessions.filter(
        (s) => s.isOpen && (s.messageCount || 0) > 0
      );
      setLiveSessions(openOnly);
      setLiveLoading(false);
    };

    fetchLive();

    const connect = () => {
      const url = getWsUrl();
      if (!url) return;
      try {
        const ws = new WebSocket(url);
        liveWsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'visitors' && msg.data) {
              applySessions(msg.data);
            }
          } catch (_) {}
        };
        ws.onclose = () => {
          liveWsRef.current = null;
          liveReconnectRef.current = setTimeout(connect, WS_RECONNECT_MS);
        };
        ws.onerror = () => {};
      } catch (_) {}
    };

    connect();

    const pollFallback = setInterval(() => {
      if (!liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) {
        fetchLive();
      }
    }, LIVE_POLL_MS);

    return () => {
      if (liveReconnectRef.current) clearTimeout(liveReconnectRef.current);
      if (liveWsRef.current) {
        liveWsRef.current.close();
        liveWsRef.current = null;
      }
      clearInterval(pollFallback);
    };
  }, [token, fetchLive]);

  const loadAllConversations = useCallback(async () => {
    setAllLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));
      if (appliedSearch) params.set('search', appliedSearch);
      const res = await authFetch(`/conversations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load conversations');
      const json = await res.json();
      setAllData({
        rows: json.rows || [],
        total: json.total ?? 0,
        limit: json.limit ?? PAGE_SIZE,
        page: json.page ?? page,
      });
    } catch {
      setAllData({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
    } finally {
      setAllLoading(false);
    }
  }, [authFetch, page, appliedSearch]);

  useEffect(() => {
    if (activeTab === TAB_ALL) loadAllConversations();
  }, [activeTab, loadAllConversations]);

  const handleSend = async (sessionId, content) => {
    const text = (content || '').trim();
    if (!text) return;
    setSending(sessionId);
    try {
      const res = await authFetch(`/conversations/${sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) setDraft((prev) => ({ ...prev, [sessionId]: '' }));
    } finally {
      setSending(null);
    }
  };

  const openReplyModal = (conv) => {
    setReplyTo({ sessionId: conv.id, label: (conv.firstMessage || conv.title || 'Conversation').toString().slice(0, 80) });
    setReplyDraft('');
  };

  const closeReplyModal = () => {
    setReplyTo(null);
    setReplyDraft('');
  };

  const handleReplySend = async (e) => {
    e?.preventDefault();
    const text = replyDraft.trim();
    if (!text || !replyTo) return;
    setReplySending(true);
    try {
      const res = await authFetch(`/conversations/${replyTo.sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) closeReplyModal();
    } finally {
      setReplySending(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(allData.total / allData.limit));
  const fromRow = allData.total === 0 ? 0 : (allData.page - 1) * allData.limit + 1;
  const toRow = Math.min(allData.page * allData.limit, allData.total);

  const visitorPreviewUrl = (sid) =>
    `/?sessionId=${encodeURIComponent(sid)}&companyId=${encodeURIComponent(company?.companyId || '')}`;

  return (
    <div className="p-4" id="take-over-top">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Take over conversation</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        <strong>Operate Chat</strong> opens the full visitor-style chat (theme, mic, voice playback) so you can read the thread and reply; messages are sent to the visitor in real time. Use <strong>Visitor preview</strong> to open the public site in a new tab. Quick <strong>Send</strong> below still works for one-line replies.
      </p>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3" style={{ borderColor: 'var(--chat-border)' }}>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === TAB_LIVE ? 'active' : ''}`}
            style={{
              color: activeTab === TAB_LIVE ? 'var(--chat-text-heading)' : 'var(--chat-muted)',
              borderColor: activeTab === TAB_LIVE ? 'var(--chat-border) var(--chat-border) var(--chat-surface)' : 'transparent',
              background: activeTab === TAB_LIVE ? 'var(--chat-surface)' : 'transparent',
            }}
            onClick={() => setActiveTab(TAB_LIVE)}
          >
            Live conversations
            {liveSessions.length > 0 && (
              <span className="badge bg-primary ms-1">{liveSessions.length}</span>
            )}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === TAB_ALL ? 'active' : ''}`}
            style={{
              color: activeTab === TAB_ALL ? 'var(--chat-text-heading)' : 'var(--chat-muted)',
              borderColor: activeTab === TAB_ALL ? 'var(--chat-border) var(--chat-border) var(--chat-surface)' : 'transparent',
              background: activeTab === TAB_ALL ? 'var(--chat-surface)' : 'transparent',
            }}
            onClick={() => setActiveTab(TAB_ALL)}
          >
            All conversations
          </button>
        </li>
      </ul>

      {/* Live conversations */}
      {activeTab === TAB_LIVE && (
        <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
          <div className="card-body p-0">
            {liveLoading ? (
              <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
            ) : !liveSessions.length ? (
              <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
                No active visitors. Sessions appear when someone has the chatbot open and disappear when they close it.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                  <thead style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)' }}>
                    <tr>
                      <th className="border-0 py-2">Session / Page</th>
                      <th className="border-0 py-2 text-center d-none d-md-table-cell">Messages</th>
                      <th className="border-0 py-2 d-none d-lg-table-cell">Last seen</th>
                      <th className="border-0 py-2 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveSessions.map((s) => {
                      const canSend = canTakeOver(s.sessionId);
                      return (
                        <tr key={s.sessionId}>
                          <td className="align-middle">
                            <div className="d-flex flex-column">
                              <code className="small" style={{ wordBreak: 'break-all' }}>{s.sessionId}</code>
                              {s.pageUrl && (
                                <a
                                  href={s.pageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="small text-truncate"
                                  style={{ maxWidth: 'min(280px, 60vw)' }}
                                >
                                  {s.pageUrl.replace(/^https?:\/\//, '')}
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="align-middle text-center d-none d-md-table-cell">{s.messageCount ?? 0}</td>
                          <td className="align-middle small d-none d-lg-table-cell" style={{ color: 'var(--chat-muted)' }}>
                            {s.lastSeen ? formatTimeAgo(new Date(s.lastSeen).toISOString()) : '—'}
                          </td>
                          <td className="align-middle">
                            <div className="d-flex flex-wrap gap-1 justify-content-end align-items-center">
                              {canSend ? (
                                <>
                                  <div className="admin-action-stack">
                                    <Link
                                      to={`/admin/chat/${s.sessionId}`}
                                      className="btn btn-sm btn-primary"
                                    >
                                      Operate Chat
                                    </Link>
                                    <a
                                      href={visitorPreviewUrl(s.sessionId)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-sm btn-outline-secondary"
                                    >
                                      Visitor preview
                                    </a>
                                  </div>
                                  <div className="d-flex gap-1 align-items-center mt-1 mt-md-0">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      placeholder="Message..."
                                      value={draft[s.sessionId] ?? ''}
                                      onChange={(e) => setDraft((prev) => ({ ...prev, [s.sessionId]: e.target.value }))}
                                      onKeyDown={(e) => e.key === 'Enter' && handleSend(s.sessionId, draft[s.sessionId])}
                                      style={{ width: 140, minWidth: 100 }}
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={sending === s.sessionId || !(draft[s.sessionId] ?? '').trim()}
                                      onClick={() => handleSend(s.sessionId, draft[s.sessionId])}
                                    >
                                      {sending === s.sessionId ? '…' : 'Send'}
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <span className="small text-muted">Chat not started</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All conversations */}
      {activeTab === TAB_ALL && (
        <>
          <form onSubmit={handleSearchSubmit} className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-2">
              <div className="row g-2 align-items-center">
                <div className="col-12 col-md-6 col-lg-4">
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by title or first message..."
                    aria-label="Search conversations"
                  />
                </div>
                <div className="col-auto">
                  <button type="submit" className="btn btn-primary btn-sm">Search</button>
                </div>
                {appliedSearch && (
                  <div className="col-auto">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => { setSearch(''); setAppliedSearch(''); setPage(1); }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>

          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body p-0">
              {allLoading ? (
                <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
              ) : !allData.rows.length ? (
                <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
                  No conversations found{appliedSearch ? ' for this search.' : '.'}
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                      <thead style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)' }}>
                        <tr>
                          <th className="border-0 py-2">First message / Title</th>
                          <th className="border-0 py-2 text-center d-none d-sm-table-cell">Messages</th>
                          <th className="border-0 py-2 d-none d-md-table-cell">Lead</th>
                          <th className="border-0 py-2 d-none d-lg-table-cell">Status</th>
                          <th className="border-0 py-2 d-none d-lg-table-cell">Updated</th>
                          <th className="border-0 py-2 text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allData.rows.map((conv) => (
                          <tr key={conv.id}>
                            <td className="align-middle">
                              <span
                                className="d-inline-block text-truncate"
                                style={{ maxWidth: 'min(280px, 60vw)' }}
                                title={conv.firstMessage || conv.title}
                              >
                                {conv.firstMessage || conv.title || '—'}
                              </span>
                            </td>
                            <td className="align-middle text-center d-none d-sm-table-cell">{conv.messageCount}</td>
                            <td className="align-middle d-none d-md-table-cell">
                              {conv.leadCaptured ? (
                                <span className="badge text-bg-success">Yes</span>
                              ) : (
                                <span className="badge text-bg-secondary">No</span>
                              )}
                            </td>
                            <td className="align-middle d-none d-lg-table-cell">
                              <span className={`badge ${conv.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}`}>
                                {conv.status}
                              </span>
                            </td>
                            <td className="align-middle small d-none d-lg-table-cell" style={{ color: 'var(--chat-muted)' }}>
                              {formatTimeAgo(conv.updatedAt)}
                            </td>
                            <td className="align-middle text-end">
                              <div className="admin-action-stack admin-action-stack-end">
                                {conv.leadCaptured && (
                                  <Link to={`/admin/leads/${conv.leadId}`} className="btn btn-sm btn-outline-secondary">View lead</Link>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => openReplyModal(conv)}
                                >
                                  Send message
                                </button>
                                <Link
                                  to={`/admin/chat/${conv.id}`}
                                  className="btn btn-sm btn-primary"
                                >
                                  Operate Chat
                                </Link>
                                <a
                                  href={visitorPreviewUrl(conv.id)}
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
                  {allData.total > 0 && (
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
                      <div className="small" style={{ color: 'var(--chat-muted)' }}>
                        Showing {fromRow}–{toRow} of {allData.total}
                      </div>
                      <div className="d-flex gap-1 align-items-center">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <span className="px-2 small" style={{ color: 'var(--chat-text)' }}>
                          Page {allData.page} of {totalPages}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Reply / Send message modal (any conversation) */}
      {replyTo && (
        <div
          className="modal d-block"
          tabIndex={-1}
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => e.target === e.currentTarget && closeReplyModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reply-modal-title"
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="modal-header" style={{ borderColor: 'var(--chat-border)' }}>
                <h6 id="reply-modal-title" className="modal-title" style={{ color: 'var(--chat-text-heading)' }}>Send message to conversation</h6>
                <button type="button" className="btn-close" aria-label="Close" onClick={closeReplyModal} />
              </div>
              <div className="modal-body">
                <p className="small mb-2" style={{ color: 'var(--chat-muted)' }}>
                  {replyTo.label}
                </p>
                <form onSubmit={handleReplySend}>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Type your message..."
                    style={{ background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)', color: 'var(--chat-text)' }}
                  />
                </form>
              </div>
              <div className="modal-footer" style={{ borderColor: 'var(--chat-border)' }}>
                <button type="button" className="btn btn-outline-secondary" onClick={closeReplyModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={replySending || !replyDraft.trim()}
                  onClick={handleReplySend}
                >
                  {replySending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
