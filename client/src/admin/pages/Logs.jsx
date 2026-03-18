import { useCallback, useEffect, useState, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 50;
const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'chat', label: 'Chat' },
  { value: 'system', label: 'System' },
];

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function levelBadge(level) {
  const l = (level || 'info').toLowerCase();
  if (l === 'error') return 'text-bg-danger';
  if (l === 'warn') return 'text-bg-warning';
  return 'text-bg-secondary';
}

export default function Logs() {
  const { authFetch } = useAuth();
  const [type, setType] = useState('all');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('type', type);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      const res = await authFetch(`/logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load logs');
      const json = await res.json();
      setData({
        rows: json.rows || [],
        total: json.total ?? 0,
        limit: json.limit ?? PAGE_SIZE,
        offset: json.offset ?? offset,
      });
    } catch {
      setData({ rows: [], total: 0, limit: PAGE_SIZE, offset: 0 });
    } finally {
      setLoading(false);
    }
  }, [authFetch, type, offset]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const currentPage = data.total === 0 ? 1 : Math.floor(data.offset / data.limit) + 1;
  const fromRow = data.total === 0 ? 0 : data.offset + 1;
  const toRow = Math.min(data.offset + data.limit, data.total);

  const toggleMeta = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-4">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Logs</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        Chat-related and system-related logs. Use tabs to filter by type.
      </p>

      <div className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body py-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="small" style={{ color: 'var(--chat-muted)' }}>Type:</span>
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`btn btn-sm ${type === t.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => {
                  setType(t.value);
                  setOffset(0);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
          ) : !data.rows.length ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
              No logs found.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                  <thead style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)' }}>
                    <tr>
                      <th className="border-0 py-2">Time</th>
                      <th className="border-0 py-2">Type</th>
                      <th className="border-0 py-2">Level</th>
                      <th className="border-0 py-2">Message</th>
                      <th className="border-0 py-2 text-end">Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr>
                          <td className="align-middle small text-nowrap" style={{ color: 'var(--chat-muted)' }}>
                            {formatDateTime(row.ts)}
                          </td>
                          <td className="align-middle">
                            <span className="badge bg-secondary">{row.type}</span>
                          </td>
                          <td className="align-middle">
                            <span className={`badge ${levelBadge(row.level)}`}>{row.level}</span>
                          </td>
                          <td className="align-middle">
                            <span
                              className="d-inline-block text-break"
                              style={{ maxWidth: 420 }}
                              title={row.message}
                            >
                              {row.message || '—'}
                            </span>
                          </td>
                          <td className="align-middle text-end">
                            {row.meta && Object.keys(row.meta).length > 0 ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => toggleMeta(row.id)}
                                aria-expanded={expandedId === row.id}
                              >
                                {expandedId === row.id ? 'Hide' : 'Show'}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                        {row.meta && expandedId === row.id && (
                          <tr key={`${row.id}-meta`}>
                            <td colSpan={5} className="p-3 small" style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-muted)' }}>
                              <pre className="mb-0 font-monospace" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {JSON.stringify(row.meta, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
                      disabled={offset <= 0}
                      onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                    >
                      Previous
                    </button>
                    <span className="d-flex align-items-center px-2 small" style={{ color: 'var(--chat-text)' }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={offset + PAGE_SIZE >= data.total}
                      onClick={() => setOffset((o) => Math.min(data.total - 1, o + PAGE_SIZE))}
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
