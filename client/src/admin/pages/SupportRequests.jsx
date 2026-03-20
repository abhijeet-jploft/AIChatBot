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

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);

  return (
    <div className="p-4">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Support requests</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        Visitors who asked for a human or support. Open the chat to take over.
      </p>

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
                          {formatDateTime(row.requestedAt)}
                        </td>
                        <td className="align-middle text-end">
                          <Link
                            to={`/admin/chat/${row.sessionId}`}
                            className="btn btn-sm btn-primary me-1"
                          >
                            Operator chat
                          </Link>
                          <a
                            href={`/?sessionId=${encodeURIComponent(row.sessionId)}&companyId=${encodeURIComponent(company?.companyId || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Visitor preview
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
