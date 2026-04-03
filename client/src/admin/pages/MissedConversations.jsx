import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  clampFromNotAfterTo,
  clampToNotBeforeFrom,
  nextToAfterFromChange,
} from '../../utils/dateRangeFields';
import { buildVisitorPreviewUrl } from '../lib/visitorPreview';
import { formatDateTime } from '../../utils/dateFormat';
import SortableHeader from '../components/SortableHeader';

const PAGE_SIZE = 20;
const PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

export default function MissedConversations() {
  const { authFetch, company } = useAuth();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState({
    search: '',
    fromDate: '',
    toDate: '',
    minMessages: '1',
    maxMessages: '',
    page: 1,
  });
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    fromDate: '',
    toDate: '',
    minMessages: '1',
    maxMessages: '',
    page: 1,
  });
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState({ field: null, dir: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('page', String(appliedFilters.page));
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());
      if (appliedFilters.fromDate) params.set('fromDate', appliedFilters.fromDate);
      if (appliedFilters.toDate) params.set('toDate', appliedFilters.toDate);
      if (appliedFilters.minMessages) params.set('minMessages', appliedFilters.minMessages);
      if (appliedFilters.maxMessages) params.set('maxMessages', appliedFilters.maxMessages);
      const res = await authFetch(`/missed-conversations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load missed conversations');
      const json = await res.json();
      setData({
        rows: json.rows || [],
        total: json.total ?? 0,
        limit: json.limit ?? pageSize,
        page: json.page ?? appliedFilters.page,
      });
    } catch {
      setData({ rows: [], total: 0, limit: pageSize, page: 1 });
    } finally {
      setLoading(false);
    }
  }, [authFetch, appliedFilters, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedRows = useMemo(() => {
    if (!sort.field || !sort.dir) return data.rows;
    const sorted = [...data.rows];
    sorted.sort((a, b) => {
      if (sort.field === 'disconnectedAt') {
        const av = new Date(a.disconnectedAt).getTime(); const bv = new Date(b.disconnectedAt).getTime();
        if (av < bv) return sort.dir === 'asc' ? -1 : 1;
        if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [data.rows, sort.field, sort.dir]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);

  return (
    <div className="p-4" id="missed-conversations-top">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Missed conversations</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        Visitors who chatted but left without becoming a lead. Open the chat to follow up.
      </p>

      <div className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-12 col-md-4">
              <label className="form-label small">Search</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="First message or session ID"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">From</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.fromDate}
                onChange={(e) => {
                  const nextFromDate = clampFromNotAfterTo(filters.toDate, e.target.value);
                  const nextToDate = nextToAfterFromChange(nextFromDate, filters.toDate);
                  setFilters((prev) => ({ ...prev, fromDate: nextFromDate, toDate: nextToDate }));
                }}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">To</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.toDate}
                min={filters.fromDate || undefined}
                onChange={(e) => {
                  const nextToDate = clampToNotBeforeFrom(filters.fromDate, e.target.value);
                  setFilters((prev) => ({ ...prev, toDate: nextToDate }));
                }}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">Min user msgs</label>
              <input
                type="number"
                min="1"
                max="999"
                className="form-control form-control-sm"
                value={filters.minMessages}
                onChange={(e) => { if (e.target.value.length <= 3) setFilters((prev) => ({ ...prev, minMessages: e.target.value })); }}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">Max user msgs</label>
              <input
                type="number"
                min="1"
                max="999"
                className="form-control form-control-sm"
                value={filters.maxMessages}
                onChange={(e) => { if (e.target.value.length <= 3) setFilters((prev) => ({ ...prev, maxMessages: e.target.value })); }}
              />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setAppliedFilters({ ...filters, page: 1 })}
            >
              Apply filters
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                const reset = {
                  search: '',
                  fromDate: '',
                  toDate: '',
                  minMessages: '1',
                  maxMessages: '',
                  page: 1,
                };
                setFilters(reset);
                setAppliedFilters(reset);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
          ) : !data.rows.length ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
              No missed conversations.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                  <thead>
                    <tr>
                      <th className="border-0 py-2">First message</th>
                      <th className="border-0 py-2">User msgs</th>
                      <th className="border-0 py-2">Total msgs</th>
                      <SortableHeader label="Left at" field="disconnectedAt" sort={sort} onSort={setSort} className="border-0 py-2" />
                      <th className="border-0 py-2 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.id}>
                        <td className="align-middle">
                          <span
                            className="d-inline-block text-truncate"
                            style={{ maxWidth: 320 }}
                            title={row.firstMessage || '—'}
                          >
                            {row.firstMessage || '—'}
                          </span>
                        </td>
                        <td className="align-middle">{row.userMessageCount}</td>
                        <td className="align-middle">{row.messageCount}</td>
                        <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                          {formatDateTime(row.disconnectedAt)}
                        </td>
                        <td className="align-middle text-end">
                          <div className="admin-action-stack admin-action-stack-end">
                            <Link
                              to={`/admin/chat/${row.sessionId}`}
                              className="btn btn-sm btn-primary"
                            >
                              Operate Chat
                            </Link>
                            <a
                              href={buildVisitorPreviewUrl(company, row.sessionId)}
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
              {data.total > 0 && (
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
                  <div className="small" style={{ color: 'var(--chat-muted)' }}>
                    Showing {fromRow}–{toRow} of {data.total}
                  </div>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <label className="small d-flex align-items-center gap-1" style={{ color: 'var(--chat-muted)' }}>
                      Per page
                      <select
                        className="form-select form-select-sm"
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value) || PAGE_SIZE);
                          setAppliedFilters((prev) => ({ ...prev, page: 1 }));
                        }}
                        style={{ width: 88 }}
                      >
                        {PER_PAGE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                    <div className="d-flex gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={data.page <= 1}
                      onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
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
                      onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                    >
                      Next
                    </button>
                    </div>
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
