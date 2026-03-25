import { useEffect, useState } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const STATUS_OPTIONS = ['pending', 'resolved', 'closed'];

export default function SupportTickets() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [status, setStatus] = useState('pending');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');

  const loadTickets = async (nextStatus = status) => {
    setLoading(true);
    try {
      const res = await saFetch(`/support-tickets?status=${encodeURIComponent(nextStatus)}&limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load support tickets');
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setTickets(rows);
      if (rows.length > 0 && !rows.some((r) => r.id === selectedTicketId)) setSelectedTicketId(rows[0].id);
      if (rows.length === 0) setSelectedTicketId(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticketId) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }
    setMsgLoading(true);
    try {
      const res = await saFetch(`/support-tickets/${ticketId}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load ticket messages');
      setMessages(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMsgLoading(false);
    }
  };

  useEffect(() => { loadTickets(status); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadMessages(selectedTicketId); }, [selectedTicketId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;

  const handleStatusChange = async (ticketId, nextStatus) => {
    try {
      const res = await saFetch(`/support-tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update ticket status');
      showToast(`Ticket marked ${nextStatus}`, 'success');
      loadTickets(status);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim()) return;
    try {
      const res = await saFetch(`/support-tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');
      setReplyText('');
      loadMessages(selectedTicketId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">Support Tickets</h2>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => loadTickets(status)}>Refresh</button>
      </div>

      <div className="sa-tabs" style={{ marginBottom: 12 }}>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} type="button" className={`sa-tab ${status === s ? 'sa-tab-active' : ''}`} onClick={() => setStatus(s)}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.3fr)', gap: 12 }}>
        <div className="sa-panel">
          <h3 className="sa-panel-title" style={{ marginTop: 0 }}>Tickets</h3>
          {loading ? (
            <div className="sa-loading">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="sa-empty">No tickets.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTicketId(t.id)}
                  className={`sa-btn sa-btn-ghost ${selectedTicketId === t.id ? 'sa-tab-active' : ''}`}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.companyName} ({t.companyId})</div>
                    <div style={{ fontSize: 12, color: 'var(--sa-text-muted)' }}>{t.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--sa-text-muted)' }}>
                      {t.source} • {t.priority} • {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sa-panel">
          <h3 className="sa-panel-title" style={{ marginTop: 0 }}>Ticket Detail</h3>
          {!selectedTicket ? (
            <div className="sa-empty">Select a ticket.</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: 'var(--sa-text)', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Company:</strong>{' '}
                  {selectedTicket.companyName} ({selectedTicket.companyId})
                </div>
                <div style={{ color: 'var(--sa-text)', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Status:</strong>{' '}
                  {selectedTicket.status}
                </div>
                <div style={{ color: 'var(--sa-text)' }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Priority:</strong>{' '}
                  {selectedTicket.priority}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map((s) => (
                  <button key={s} type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => handleStatusChange(selectedTicket.id, s)}>
                    Mark {s}
                  </button>
                ))}
              </div>

              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--sa-border)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                {msgLoading ? (
                  <div className="sa-loading">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="sa-empty-sm">No messages yet.</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--sa-text-muted)' }}>
                        {m.senderRole} {m.senderName ? `(${m.senderName})` : ''} • {new Date(m.createdAt).toLocaleString()}
                      </div>
                      <div style={{ color: 'var(--sa-text)' }}>{m.message}</div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleReply}>
                <div className="sa-field">
                  <label>Reply on ticket</label>
                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type response for this ticket..."
                    style={{ color: 'var(--sa-text)', background: 'var(--sa-bg)' }}
                  />
                </div>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={!replyText.trim()}>
                  Send message
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
