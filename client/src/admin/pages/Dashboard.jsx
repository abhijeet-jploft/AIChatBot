import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const REFRESH_INTERVAL_MS = 30000;
const LIVE_POLL_MS = 15000;
const WS_RECONNECT_MS = 5000;
const API_BASE = import.meta.env.VITE_API_URL || '/api';

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

function formatTimeAgoTs(ts) {
  if (!ts) return '—';
  return formatTimeAgo(new Date(ts).toISOString());
}

export default function Dashboard() {
  const { authFetch, token, company } = useAuth();
  const { showToast } = useAdminToast();
  const [data, setData] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agentPausedUpdating, setAgentPausedUpdating] = useState(false);
  const [markingContactedId, setMarkingContactedId] = useState(null);
  const [noteModalLead, setNoteModalLead] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const liveWsRef = useRef(null);
  const liveReconnectRef = useRef(null);
  const prevLiveDataRef = useRef({ activeCount: 0, currentlyChatting: 0 });
  const liveDataInitializedRef = useRef(false);

  const fetchDashboard = useCallback(() => {
    authFetch('/dashboard')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load dashboard');
        const json = await res.json();
        setData(json);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [authFetch]);

  const fetchLive = useCallback(() => {
    authFetch('/dashboard/live')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setLiveData(json);
      })
      .catch(() => setLiveData(null));
  }, [authFetch]);

  const addLeadNote = useCallback((leadId, note) => {
    if (!leadId || !note?.trim()) return;
    setSavingNote(true);
    authFetch(`/leads/${leadId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() }),
    })
      .then((res) => {
        if (res.ok) {
          showToast('Note added', 'success');
          setNoteModalLead(null);
          setNoteText('');
          fetchDashboard();
        } else throw new Error('Failed to add note');
      })
      .catch(() => showToast('Failed to add note', 'error'))
      .finally(() => setSavingNote(false));
  }, [authFetch, fetchDashboard, showToast]);

  const markLeadContacted = useCallback((leadId) => {
    if (!leadId) return;
    setMarkingContactedId(leadId);
    authFetch(`/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' }),
    })
      .then((res) => { if (res.ok) return fetchDashboard(); })
      .finally(() => setMarkingContactedId(null));
  }, [authFetch, fetchDashboard]);

  const unmarkLeadContacted = useCallback((leadId) => {
    if (!leadId) return;
    if (!window.confirm('Are you sure you want to unmark as contacted? The lead will be set back to New.')) return;
    setMarkingContactedId(leadId);
    authFetch(`/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'new' }),
    })
      .then((res) => { if (res.ok) return fetchDashboard(); })
      .finally(() => setMarkingContactedId(null));
  }, [authFetch, fetchDashboard]);

  const setAgentPaused = useCallback((paused) => {
    setAgentPausedUpdating(true);
    authFetch('/agent/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to update');
        await fetchDashboard();
      })
      .catch(() => {})
      .finally(() => setAgentPausedUpdating(false));
  }, [authFetch, fetchDashboard]);

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  // Live visitors: WebSocket for real-time updates, fallback poll when disconnected
  useEffect(() => {
    if (!token) return;
    const getWsUrl = () => {
      if (typeof window === 'undefined' || !window.location) return null;
      const base = API_BASE.startsWith('http')
        ? API_BASE
        : `${window.location.origin}${API_BASE}`;
      const u = new URL(base);
      const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${u.host}/api/admin/ws?token=${encodeURIComponent(token)}`;
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
            if (msg.type === 'visitors' && msg.data) setLiveData(msg.data);
            if (msg.type === 'alert' && msg.message) showToast(msg.message, 'success');
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
      if (!liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) fetchLive();
    }, LIVE_POLL_MS);
    return () => {
      if (liveReconnectRef.current) clearTimeout(liveReconnectRef.current);
      if (liveWsRef.current) {
        liveWsRef.current.close();
        liveWsRef.current = null;
      }
      clearInterval(pollFallback);
    };
  }, [token, fetchLive, showToast]);

  // Live alerts: toast when "currently chatting" or active count increases (skip first load)
  useEffect(() => {
    if (!liveData) return;
    const prev = prevLiveDataRef.current;
    const curChatting = liveData.currentlyChatting ?? 0;
    const curActive = liveData.activeCount ?? 0;
    if (liveDataInitializedRef.current) {
      if (curChatting > prev.currentlyChatting) showToast('New chat started', 'info');
      else if (curActive > prev.activeCount && prev.activeCount > 0) showToast('New visitor on site', 'info');
    } else {
      liveDataInitializedRef.current = true;
    }
    prevLiveDataRef.current = { activeCount: curActive, currentlyChatting: curChatting };
  }, [liveData, showToast]);

  if (loading && !data) {
    return (
      <div className="p-4 d-flex align-items-center justify-content-center" style={{ minHeight: 320 }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="alert alert-danger">
          {error}
          <button className="btn btn-sm btn-outline-danger ms-2" onClick={fetchDashboard}>Retry</button>
        </div>
      </div>
    );
  }

  const sys = data?.systemStatus || {};
  const kpis = data?.kpis || {};
  const recentLeads = data?.recentLeads || [];
  const recentConversations = data?.recentConversations || [];
  const notifications = data?.notifications || [];
  const aiInsights = data?.aiInsights || [];
  const isEmpty = !data?.summary?.total && recentConversations.length === 0;

  const systemStatusParts = [];
  if (sys.connectedDomain && String(sys.connectedDomain).trim() && sys.connectedDomain !== '—') {
    systemStatusParts.push(`Domain: ${sys.connectedDomain}`);
  }
  if (sys.lastTrainingDate) {
    systemStatusParts.push(`Last training: ${sys.lastTrainingDate}`);
  }
  if (sys.activeLanguages && String(sys.activeLanguages).trim()) {
    systemStatusParts.push(sys.activeLanguages);
  }
  if (typeof sys.voiceModeEnabled === 'boolean') {
    systemStatusParts.push(`Voice: ${sys.voiceModeEnabled ? 'On' : 'Off'}`);
  }
  const systemStatusLine = systemStatusParts.length > 0 ? systemStatusParts.join(' · ') : null;

  return (
    <div className="p-4">
      {/* System Status Header */}
      <div
        className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 pb-3 border-bottom"
        style={{ borderColor: 'var(--chat-border)' }}
      >
        <div className="d-flex flex-wrap align-items-center gap-3">
          <h5 className="mb-0 d-flex align-items-center gap-2" style={{ color: 'var(--chat-text-heading)' }}>
            {sys.agentName}
            <Link to="/admin/settings" className="btn btn-link p-0" style={{ color: 'var(--chat-muted)', fontSize: 14 }} aria-label="Edit agent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </Link>
          </h5>
          <span
            className="badge"
            style={{
              background: sys.status === 'Online' ? 'var(--chat-accent)' : sys.status === 'Training' ? '#0d6efd' : 'var(--chat-muted)',
              color: '#fff',
            }}
          >
            {sys.status}
          </span>
          {systemStatusLine ? (
            <span className="small" style={{ color: 'var(--chat-muted)' }}>
              {systemStatusLine}
            </span>
          ) : null}
        </div>
        <div className="d-flex align-items-center gap-2">
          {sys.paused ? (
            <button type="button" className="btn btn-sm btn-success" disabled={agentPausedUpdating} onClick={() => setAgentPaused(false)} title="Resume AI">
              {agentPausedUpdating ? '…' : 'Resume AI'}
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-warning" disabled={agentPausedUpdating} onClick={() => setAgentPaused(true)} title="Pause AI">
              {agentPausedUpdating ? '…' : 'Pause AI'}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={fetchDashboard} title="Refresh dashboard data">
            Refresh
          </button>
          <Link to="/admin/training" className="btn btn-sm btn-primary" title="Refresh training / Open knowledge base">Training</Link>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div
          className="rounded-3 p-5 text-center mb-4"
          style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}
        >
          <p className="mb-2" style={{ color: 'var(--chat-text-heading)', fontSize: 18 }}>
            Your AI agent is live and ready. Share your website to start receiving visitors.
          </p>
          <p className="small mb-3" style={{ color: 'var(--chat-muted)' }}>
            Add the widget to your site and conversations will appear here.
          </p>
          <Link to="/admin/training" className="btn btn-outline-primary me-2">Widget & training</Link>
          <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary">Test chat</a>
        </div>
      )}

      {/* Key Performance Metrics (KPI Cards) */}
      <h6 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Key metrics</h6>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-4 col-lg-2">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small text-muted" style={{ color: 'var(--chat-muted)' }}>Visitors engaged</div>
              <div className="fw-bold" style={{ color: 'var(--chat-text-heading)', fontSize: 20 }}>{kpis.visitorsEngaged?.today ?? 0}</div>
              <div className="small" style={{ color: 'var(--chat-muted)' }}>
                Yesterday: {kpis.visitorsEngaged?.yesterday ?? 0} · {kpis.visitorsEngaged?.percentChange >= 0 ? '+' : ''}{kpis.visitorsEngaged?.percentChange ?? 0}%
              </div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small text-muted" style={{ color: 'var(--chat-muted)' }}>Conversations started</div>
              <div className="fw-bold" style={{ color: 'var(--chat-text-heading)', fontSize: 20 }}>{kpis.conversationsStarted?.today ?? 0}</div>
              <div className="small" style={{ color: 'var(--chat-muted)' }}>This week: {kpis.conversationsStarted?.thisWeek ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small text-muted" style={{ color: 'var(--chat-muted)' }}>Leads generated</div>
              <div className="fw-bold" style={{ color: 'var(--chat-text-heading)', fontSize: 20 }}>{kpis.leadsGenerated?.today ?? 0}</div>
              <div className="small" style={{ color: 'var(--chat-muted)' }}>This week: {kpis.leadsGenerated?.thisWeek ?? 0} · Conv. {kpis.leadsGenerated?.conversionRate ?? 0}%</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small text-muted" style={{ color: 'var(--chat-muted)' }}>Meetings requested</div>
              <div className="fw-bold" style={{ color: 'var(--chat-text-heading)', fontSize: 20 }}>{kpis.meetingsRequested?.pending ?? 0}</div>
              <div className="small" style={{ color: 'var(--chat-muted)' }}>Pending · Completed: {kpis.meetingsRequested?.completed ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small text-muted" style={{ color: 'var(--chat-muted)' }}>Conversion rate</div>
              <div className="fw-bold" style={{ color: 'var(--chat-text-heading)', fontSize: 20 }}>{kpis.conversionRate ?? 0}%</div>
              <div className="small" style={{ color: 'var(--chat-muted)' }}>Leads / Conversations</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body py-3">
              <div className="small text-muted" style={{ color: 'var(--chat-muted)' }}>AI response rate</div>
              <div className="fw-bold" style={{ color: 'var(--chat-text-heading)', fontSize: 20 }}>{kpis.aiResponseRate ?? 100}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Activity Panel */}
      <h6 className="mb-3 mt-2" style={{ color: 'var(--chat-text-heading)' }}>Live activity</h6>
      <div className="card mb-4" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body py-3">
          <div className="row g-3 small">
            <div className="col-6 col-md-3">
              <span style={{ color: 'var(--chat-muted)' }}>Active visitors</span>
              <div style={{ color: 'var(--chat-text-heading)', fontSize: 18 }}>{liveData?.activeCount ?? '—'}</div>
            </div>
            <div className="col-6 col-md-3">
              <span style={{ color: 'var(--chat-muted)' }}>Currently chatting</span>
              <div style={{ color: 'var(--chat-text-heading)', fontSize: 18 }}>{liveData?.currentlyChatting ?? '—'}</div>
            </div>
            <div className="col-6 col-md-3">
              <span style={{ color: 'var(--chat-muted)' }}>Last message</span>
              <div style={{ color: 'var(--chat-text)' }}>{liveData?.lastMessageAt ? formatTimeAgoTs(liveData.lastMessageAt) : (recentConversations[0] ? formatTimeAgo(recentConversations[0].updatedAt) : '—')}</div>
            </div>
            <div className="col-6 col-md-3">
              <span style={{ color: 'var(--chat-muted)' }}>Pages</span>
              <div style={{ color: 'var(--chat-text)' }}>{liveData?.sessions?.length ? liveData.sessions.length : '—'}</div>
            </div>
          </div>
          {liveData?.sessions?.length > 0 && (
            <div className="mt-3 pt-2 border-top" style={{ borderColor: 'var(--chat-border)' }}>
              <div className="small mb-1" style={{ color: 'var(--chat-muted)' }}>Current pages</div>
              <ul className="mb-0 ps-3 small" style={{ color: 'var(--chat-text)', maxHeight: 120, overflowY: 'auto' }}>
                {liveData.sessions.slice(0, 10).map((s, i) => (
                  <li key={i} className="text-truncate" title={s.pageUrl}>{s.pageUrl || '—'} · {formatTimeAgoTs(s.lastSeen)}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mb-0 mt-2 small" style={{ color: 'var(--chat-muted)' }}>Updates every 15s. Widget and chat send heartbeat every 30s.</p>
        </div>
      </div>

      <div className="row g-4">
        {/* Lead Snapshot */}
        <div className="col-lg-6">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-header d-flex align-items-center justify-content-between py-2" style={{ background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)', color: 'var(--chat-text-heading)' }}>
              <span>Lead snapshot</span>
              <Link to="/admin/leads" className="btn btn-sm btn-link p-0" style={{ color: 'var(--chat-accent)' }}>View all</Link>
            </div>
            <div className="card-body p-0">
              {recentLeads.length === 0 ? (
                <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>No leads yet</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {recentLeads.slice(0, 5).map((lead) => (
                    <li
                      key={lead.id}
                      className="list-group-item d-flex justify-content-between align-items-start border-0 px-3 py-2"
                      style={{
                        background: 'transparent',
                        borderColor: 'var(--chat-border)',
                      }}
                    >
                      <div className="ms-0 flex-grow-1 min-width-0 overflow-hidden">
                        <div className="fw-semibold text-truncate" style={{ color: 'var(--chat-text)' }} title={lead.name || 'Unnamed lead'}>
                          {lead.name || 'Unnamed lead'}
                        </div>
                        <div
                          className="small"
                          style={{
                            color: 'var(--chat-muted)',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={lead.requirement}
                        >
                          {lead.requirement}
                        </div>
                        <div className="small text-truncate" style={{ color: 'var(--chat-muted)' }} title={lead.sourcePage || '-'}>
                          Source: {lead.sourcePage || '-'}
                        </div>
                        <div className="small" style={{ color: 'var(--chat-muted)' }}>
                          Received: {formatTimeAgo(lead.timeReceived)}
                        </div>
                      </div>
                      <div className="ms-2">
                        <Link to={`/admin/leads/${lead.id}`} className="btn btn-sm btn-outline-secondary">View lead</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Conversation Snapshot */}
        <div className="col-lg-6">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-header d-flex align-items-center justify-content-between py-2" style={{ background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)', color: 'var(--chat-text-heading)' }}>
              <span>Conversation snapshot</span>
              <Link to="/admin/conversations" className="btn btn-sm btn-link p-0" style={{ color: 'var(--chat-accent)' }}>View all</Link>
            </div>
            <div className="card-body p-0">
              {recentConversations.length === 0 ? (
                <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>No conversations yet</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {recentConversations.slice(0, 5).map((conv) => {
                    const isLive = String(conv.status || '').toLowerCase() === 'active';
                    return (
                    <li key={conv.id} className="list-group-item d-flex justify-content-between align-items-start border-0 px-3 py-2" style={{ background: 'transparent', borderColor: 'var(--chat-border)' }}>
                      <div className="ms-0 flex-grow-1 min-width-0 overflow-hidden">
                        <div className="small text-truncate" style={{ color: 'var(--chat-text)' }} title={conv.firstMessage}>
                          {conv.firstMessage}
                        </div>
                        <div className="small" style={{ color: 'var(--chat-muted)' }}>
                          Duration: {conv.duration} · Lead: {conv.leadCaptured ? 'Yes' : 'No'} · Status: {conv.status}
                        </div>
                      </div>
                      <div className="d-flex flex-column gap-1 ms-2">
                        <Link to={`/admin/chat/${conv.id}`} className="btn btn-sm btn-outline-secondary">
                          Operator chat
                        </Link>
                        {isLive ? (
                          <Link to={`/admin/chat/${conv.id}`} className="btn btn-sm btn-primary">
                            Take over
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );})}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="col-lg-6">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-header py-2" style={{ background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)', color: 'var(--chat-text-heading)' }}>
              AI insights
            </div>
            <div className="card-body">
              {aiInsights.length === 0 ? (
                <div className="small" style={{ color: 'var(--chat-muted)' }}>No insights yet. Activity will appear here.</div>
              ) : (
                <ul className="mb-0 ps-3 small" style={{ color: 'var(--chat-text)' }}>
                  {aiInsights.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="col-lg-6">
          <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-header py-2" style={{ background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)', color: 'var(--chat-text-heading)' }}>
              Recent notifications
            </div>
            <div className="card-body">
              {notifications.length === 0 ? (
                <div className="small" style={{ color: 'var(--chat-muted)' }}>No new notifications</div>
              ) : (
                <ul className="mb-0 list-unstyled small">
                  {notifications.map((n, i) => (
                    <li key={i} className="mb-2">
                      <Link to={n.link} style={{ color: 'var(--chat-accent)' }}>{n.message}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 small" style={{ color: 'var(--chat-muted)' }}>
        Dashboard refreshes every 30 seconds. Use Refresh to update now.
      </div>

      {/* Add note modal (Lead snapshot) */}
      {noteModalLead && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} aria-modal="true" role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="modal-header" style={{ borderColor: 'var(--chat-border)' }}>
                <h6 className="modal-title" style={{ color: 'var(--chat-text-heading)' }}>Add note — {noteModalLead.name}</h6>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => { setNoteModalLead(null); setNoteText(''); }} />
              </div>
              <div className="modal-body">
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Enter note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  style={{ background: 'var(--chat-bg)', borderColor: 'var(--chat-border)', color: 'var(--chat-text)' }}
                />
              </div>
              <div className="modal-footer" style={{ borderColor: 'var(--chat-border)' }}>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { setNoteModalLead(null); setNoteText(''); }}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={savingNote || !noteText.trim()} onClick={() => addLeadNote(noteModalLead.id, noteText)}>
                  {savingNote ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
