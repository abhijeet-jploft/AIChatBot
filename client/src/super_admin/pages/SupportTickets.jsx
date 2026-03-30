import { useEffect, useState } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const STATUS_OPTIONS = ['pending', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['all', 'low', 'normal', 'high', 'urgent'];
const SOURCE_OPTIONS = ['all', 'admin', 'visitor'];
const PAGE_SIZE = 20;
const PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

export default function SupportTickets() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [source, setSource] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [loading, setLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadTickets = async ({
    nextStatus = status,
    nextPriority = priority,
    nextSource = source,
    nextSearch = search,
    nextPage = page,
  } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', nextStatus);
      params.set('priority', nextPriority);
      params.set('source', nextSource);
      params.set('limit', String(pageSize));
      params.set('page', String(nextPage));
      if (nextSearch.trim()) params.set('search', nextSearch.trim());

      const res = await saFetch(`/support-tickets?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load support tickets');
      const rows = Array.isArray(json.rows) ? json.rows : [];

      setData({
        rows,
        total: Number(json.total || 0),
        limit: Number(json.limit || pageSize),
        page: Number(json.page || nextPage || 1),
      });

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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load ticket messages');
      setMessages(Array.isArray(json.rows) ? json.rows : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMsgLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, source, search, page, pageSize]);

  useEffect(() => {
    loadMessages(selectedTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId]);

  const selectedTicket = data.rows.find((t) => t.id === selectedTicketId) || null;
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || PAGE_SIZE)));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);

  const handleStatusChange = async (ticketId, nextStatus) => {
    try {
      const res = await saFetch(`/support-tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update ticket status');
      showToast(`Ticket marked ${nextStatus}`, 'success');
      await loadTickets();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim() || sendingReply) return;
    setSendingReply(true);

    try {
      const res = await saFetch(`/support-tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send reply');
      setReplyText('');
      await loadMessages(selectedTicketId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">Support Tickets</h2>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => loadTickets()}>
          Refresh
        </button>
      </div>

      <div className="sa-panel sa-panel-compact" style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <div className="sa-field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">all</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="sa-field" style={{ marginBottom: 0 }}>
            <label>Priority</label>
            <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="sa-field" style={{ marginBottom: 0 }}>
            <label>Source</label>
            <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="sa-field" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Message, company, requester..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sa-btn sa-btn-ghost sa-btn-sm"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setStatus('all');
              setPriority('all');
              setSource('all');
              setPage(1);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-primary sa-btn-sm"
            onClick={() => {
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            Apply Filters
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <div className="sa-panel">
          <h3 className="sa-panel-title" style={{ marginTop: 0 }}>Tickets</h3>

          {loading ? (
            <div className="sa-loading">Loading tickets...</div>
          ) : data.rows.length === 0 ? (
            <div className="sa-empty">No tickets.</div>
          ) : (
            <>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Message</th>
                      <th>Source</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        style={{
                          cursor: 'pointer',
                          background: selectedTicketId === t.id ? 'rgba(108,99,255,0.08)' : 'transparent',
                        }}
                      >
                        <td>
                          <div
                            style={{ fontWeight: 600, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={`${t.companyName || '-'} (${t.companyId || '-'})`}
                          >
                            {t.companyName || '-'}
                          </div>
                          <div
                            className="sa-table-subtext"
                            title={t.companyId || ''}
                            style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {t.companyId || '-'}
                          </div>
                        </td>
                        <td>
                          <div
                            style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={t.message || ''}
                          >
                            {t.message || '-'}
                          </div>
                        </td>
                        <td>{t.source || '-'}</td>
                        <td>{t.priority || '-'}</td>
                        <td>{t.status || 'pending'}</td>
                        <td>{new Date(t.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <div className="sa-text-muted" style={{ fontSize: 12 }}>
                  Showing {fromRow} - {toRow} of {data.total}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="sa-text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Per page
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value) || PAGE_SIZE);
                        setPage(1);
                      }}
                      style={{ minWidth: 84 }}
                    >
                      {PER_PAGE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost sa-btn-sm"
                    disabled={data.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="sa-text-muted" style={{ fontSize: 12 }}>Page {data.page} of {totalPages}</span>
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost sa-btn-sm"
                    disabled={data.page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sa-panel">
          <h3 className="sa-panel-title" style={{ marginTop: 0 }}>Ticket Detail</h3>

          {!selectedTicket ? (
            <div className="sa-empty">Select a ticket.</div>
          ) : (
            <>
              <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
                <div style={{ color: 'var(--sa-text)' }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Company:</strong>{' '}
                  <span style={{ wordBreak: 'break-word' }}>{selectedTicket.companyName} ({selectedTicket.companyId})</span>
                </div>
                <div style={{ color: 'var(--sa-text)' }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Status:</strong>{' '}
                  {selectedTicket.status}
                </div>
                <div style={{ color: 'var(--sa-text)' }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Priority:</strong>{' '}
                  {selectedTicket.priority}
                </div>
                <div style={{ color: 'var(--sa-text)' }}>
                  <strong style={{ color: 'var(--sa-text-heading)' }}>Initial message:</strong>{' '}
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedTicket.message || '-'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="sa-btn sa-btn-sm sa-btn-ghost"
                    onClick={() => handleStatusChange(selectedTicket.id, s)}
                  >
                    Mark {s}
                  </button>
                ))}
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--sa-border)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                {msgLoading ? (
                  <div className="sa-loading">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="sa-empty-sm">No messages yet.</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--sa-text-muted)' }}>
                        {m.senderRole} {m.senderName ? `(${m.senderName})` : ''} • {new Date(m.createdAt).toLocaleString()}
                      </div>
                      <div style={{ color: 'var(--sa-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.message}</div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleReply}>
                {sendingReply ? (
                  <div className="sa-text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    Sending message...
                  </div>
                ) : null}
                <div className="sa-field">
                  <label>Reply on ticket</label>
                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type response for this ticket..."
                    disabled={sendingReply}
                    style={{ color: 'var(--sa-text)', background: 'var(--sa-bg)' }}
                  />
                </div>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={!replyText.trim() || sendingReply}>
                  {sendingReply ? 'Sending...' : 'Send message'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
