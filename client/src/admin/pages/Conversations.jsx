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

export default function Conversations() {
  const { authFetch, company } = useAuth();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [loading, setLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));
      if (appliedSearch) params.set('search', appliedSearch);
      const res = await authFetch(`/conversations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load conversations');
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
  }, [authFetch, page, appliedSearch]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);

  return (
    <div className="p-4">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Conversations</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        All chat sessions with server-side search and pagination.
      </p>

      <form onSubmit={handleSearchSubmit} className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-6">
              <label className="form-label small">Search</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or first message..."
              />
            </div>
            <div className="col-md-2">
              <button type="submit" className="btn btn-primary btn-sm">Search</button>
            </div>
            {appliedSearch && (
              <div className="col-md-2">
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
          {loading ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
          ) : !data.rows.length ? (
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
                      <th className="border-0 py-2">Messages</th>
                      <th className="border-0 py-2">Lead</th>
                      <th className="border-0 py-2">Status</th>
                      <th className="border-0 py-2">Updated</th>
                      <th className="border-0 py-2 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((conv) => (
                      <tr key={conv.id}>
                        <td className="align-middle">
                          <span
                            className="d-inline-block text-truncate"
                            style={{ maxWidth: 320 }}
                            title={conv.firstMessage || conv.title}
                          >
                            {conv.firstMessage || conv.title || '—'}
                          </span>
                        </td>
                        <td className="align-middle">{conv.messageCount}</td>
                        <td className="align-middle">{conv.leadCaptured ? 'Yes' : 'No'}</td>
                        <td className="align-middle">
                          <span className={`badge ${conv.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}`}>
                            {conv.status}
                          </span>
                        </td>
                        <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                          {formatTimeAgo(conv.updatedAt)}
                        </td>
                        <td className="align-middle text-end">
                          {conv.leadCaptured ? (
                            <Link to={`/admin/leads/${conv.leadId}`} className="btn btn-sm btn-outline-primary me-1">View lead</Link>
                          ) : null}
                          <a
                            href={`/?sessionId=${encodeURIComponent(conv.id)}&companyId=${encodeURIComponent(company?.companyId || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Open chat
                          </a>
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
    </div>
  );
}
