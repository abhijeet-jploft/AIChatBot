import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function SupportRequests() {
  const { authFetch, company } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketPriority, setTicketPriority] = useState('normal');
  const [activeTicket, setActiveTicket] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadRows, setThreadRows] = useState([]);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));
      const res = await authFetch(`/support-requests?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load support requests');
      const json = await res.json();
      setData({
        rows: json.rows || [],
        total: json.total ?? 0,
        limit: json.limit ?? PAGE_SIZE,
        page: json.page ?? page,
      });
    } catch {
      setData({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
    } finally {
      setLoading(false);
    }
  }, [authFetch, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!ticketMessage.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch('/support-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: ticketMessage.trim(), priority: ticketPriority }),
      });
      const dataJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dataJson.error || 'Failed to raise support ticket');
      setTicketMessage('');
      setTicketPriority('normal');
      setPage(1);
      await load();
    } catch {
      // keep silent here to match current page behavior without toasts
    } finally {
      setCreating(false);
    }
  };

  const openTicketThread = async (row) => {
    setActiveTicket(row);
    setReply('');
    setThreadLoading(true);
    try {
      const res = await authFetch(`/support-requests/${row.id}/messages`);
      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || 'Failed to load ticket thread');
      setThreadRows(Array.isArray(dataJson.rows) ? dataJson.rows : []);
    } catch {
      setThreadRows([]);
    } finally {
      setThreadLoading(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!activeTicket?.id || !reply.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await authFetch(`/support-requests/${activeTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const dataJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dataJson.error || 'Failed to send message');
      setReply('');
      openTicketThread(activeTicket);
      load();
    } catch {
      // keep current UX silent
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="p-4" id="support-requests-top">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Support requests</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        Visitors who asked for a human or support. Open the chat to take over.
      </p>

      <div className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body">
          <h6 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>Raise a support ticket to super admin</h6>
          <form onSubmit={handleCreateTicket} className="row g-2">
            <div className="col-md-8">
              <input
                className="form-control"
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                placeholder="Describe issue, error, or help needed..."
                maxLength={500}
              />
            </div>
            <div className="col-md-2">
              <select className="form-select" value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="col-md-2 d-grid">
              <button type="submit" className="btn btn-primary" disabled={creating || !ticketMessage.trim()}>
                {creating ? 'Submitting...' : 'Raise Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
          ) : !data.rows.length ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
              No support requests.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                  <thead style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)' }}>
                    <tr>
                      <th className="border-0 py-2">Message / trigger</th>
                      <th className="border-0 py-2">Source</th>
                      <th className="border-0 py-2">Status</th>
                      <th className="border-0 py-2">Requested at</th>
                      <th className="border-0 py-2 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="align-middle">
                          <span
                            className="d-inline-block text-truncate"
                            style={{ maxWidth: 400 }}
                            title={row.message || row.firstMessage}
                          >
                            {row.message || row.firstMessage || '—'}
                          </span>
                        </td>
                        <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                          {row.source === 'admin' ? (
                            <span className="badge bg-warning text-dark">Admin Ticket</span>
                          ) : (
                            <span className="badge bg-secondary">Visitor</span>
                          )}
                        </td>
                        <td className="align-middle small">
                          <span className={`badge ${row.status === 'resolved' ? 'bg-success' : row.status === 'closed' ? 'bg-dark' : 'bg-info text-dark'}`}>
                            {row.status || 'pending'}
                          </span>
                        </td>
                        <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                          {formatDateTime(row.requestedAt)}
                        </td>
                        <td className="align-middle text-end">
                          {row.sessionId ? (
                            <div className="admin-action-stack admin-action-stack-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => openTicketThread(row)}
                              >
                                View ticket
                              </button>
                              <Link
                                to={`/admin/chat/${row.sessionId}`}
                                className="btn btn-sm btn-primary"
                              >
                                Operate Chat
                              </Link>
                              <a
                                href={`/?sessionId=${encodeURIComponent(row.sessionId)}&companyId=${encodeURIComponent(company?.companyId || '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-outline-secondary"
                              >
                                Visitor preview
                              </a>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => openTicketThread(row)}
                            >
                              View ticket
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.total > 0 && (
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
                  <div className="small" style={{ color: 'var(--chat-muted)' }}>
                    Showing {fromRow}–{toRow} of {data.total}
                  </div>
                  <div className="d-flex gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={data.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="d-flex align-items-center px-2 small" style={{ color: 'var(--chat-text)' }}>
                      Page {data.page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={data.page >= totalPages}
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

      {activeTicket ? (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} aria-modal="true" role="dialog">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content" style={{ background: 'var(--chat-surface)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}>
              <div className="modal-header" style={{ borderColor: 'var(--chat-border)' }}>
                <h5 className="modal-title">Ticket Thread — {activeTicket.status || 'pending'}</h5>
                <button type="button" className="btn-close" onClick={() => setActiveTicket(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-2" style={{ color: 'var(--chat-muted)' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--chat-text-heading)' }}>Message:</span>{' '}
                  <span style={{ fontSize: '0.82rem', lineHeight: 1.45, wordBreak: 'break-word' }}>{activeTicket.message || '—'}</span>
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--chat-border)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  {threadLoading ? (
                    <div className="small text-muted">Loading thread...</div>
                  ) : threadRows.length === 0 ? (
                    <div className="small text-muted">No messages yet.</div>
                  ) : (
                    threadRows.map((m) => (
                      <div key={m.id} style={{ marginBottom: 10 }}>
                        <div className="small" style={{ color: 'var(--chat-muted)' }}>
                          {m.senderRole} {m.senderName ? `(${m.senderName})` : ''} • {formatDateTime(m.createdAt)}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.message}</div>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendReply}>
                  {sendingReply ? (
                    <div className="small mb-2" style={{ color: 'var(--chat-muted)' }}>
                      Sending message...
                    </div>
                  ) : null}
                  <div className="input-group">
                    <input
                      className="form-control"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Reply to super admin..."
                      disabled={sendingReply}
                    />
                    <button className="btn btn-primary" type="submit" disabled={!reply.trim() || sendingReply}>
                      {sendingReply ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
