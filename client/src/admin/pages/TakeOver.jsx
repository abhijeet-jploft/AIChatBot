import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const LIVE_POLL_MS = 8000;

export default function TakeOver() {
  const { authFetch, company } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(null);
  const [draft, setDraft] = useState({});

  const fetchLive = useCallback(async () => {
    try {
      const res = await authFetch('/dashboard/live');
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [fetchLive]);

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
      if (res.ok) {
        setDraft((prev) => ({ ...prev, [sessionId]: '' }));
      }
    } finally {
      setSending(null);
    }
  };

  const chattingSessions = sessions.filter((s) => (s.messageCount || 0) > 0);

  return (
    <div className="p-4">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Take over conversation</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        Send a message to a visitor who is currently chatting. They will see it as an assistant message in real time.
      </p>

      <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
          ) : !chattingSessions.length ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
              No active chats right now. Visitors who have sent at least one message appear here.
            </div>
          ) : (
            <ul className="list-group list-group-flush">
              {chattingSessions.map((s) => (
                <li
                  key={s.sessionId}
                  className="list-group-item d-flex flex-column gap-2"
                  style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}
                >
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div className="small">
                      <span className="text-muted">Session:</span>{' '}
                      <code style={{ fontSize: '0.85em' }}>{s.sessionId}</code>
                      {s.pageUrl && (
                        <>
                          {' · '}
                          <a href={s.pageUrl} target="_blank" rel="noopener noreferrer" className="text-truncate d-inline-block" style={{ maxWidth: 240 }}>
                            {s.pageUrl.replace(/^https?:\/\//, '')}
                          </a>
                        </>
                      )}
                    </div>
                    <a
                      href={`/?sessionId=${encodeURIComponent(s.sessionId)}&companyId=${encodeURIComponent(company?.companyId || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline-secondary"
                    >
                      Open chat
                    </a>
                  </div>
                  <div className="d-flex gap-2 align-items-end">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Type your message..."
                      value={draft[s.sessionId] ?? ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [s.sessionId]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSend(s.sessionId, draft[s.sessionId]);
                      }}
                      style={{ maxWidth: 400 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={sending === s.sessionId || !(draft[s.sessionId] ?? '').trim()}
                      onClick={() => handleSend(s.sessionId, draft[s.sessionId])}
                    >
                      {sending === s.sessionId ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
