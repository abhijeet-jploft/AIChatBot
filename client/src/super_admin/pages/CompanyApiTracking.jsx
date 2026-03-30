import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const PER_PAGE_OPTIONS = [10, 50, 100, 500];

function dt(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export default function CompanyApiTracking() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    summary: {},
    byProvider: [],
    byCategory: [],
    chatContextApis: [],
    recent: [],
  });
  const [recentMeta, setRecentMeta] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false,
  });
  const [query, setQuery] = useState({
    page: 1,
    limit: 50,
    search: '',
    provider: '',
    category: '',
    context: '',
    status: '',
  });
  const [searchDraft, setSearchDraft] = useState('');
  const [filterOptions, setFilterOptions] = useState({
    providers: [],
    categories: [],
    contexts: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(query.page));
      params.set('limit', String(query.limit));
      if (query.search) params.set('search', query.search);
      if (query.provider) params.set('provider', query.provider);
      if (query.category) params.set('category', query.category);
      if (query.context) params.set('context', query.context);
      if (query.status) params.set('status', query.status);

      const res = await saFetch(`/companies/${companyId}/api-tracking?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load API tracking');
      setData({
        summary: json.summary || {},
        byProvider: json.byProvider || [],
        byCategory: json.byCategory || [],
        chatContextApis: json.chatContextApis || [],
        recent: json.recent || [],
      });
      setRecentMeta({
        page: Number(json.recentMeta?.page) || 1,
        limit: Number(json.recentMeta?.limit) || query.limit,
        total: Number(json.recentMeta?.total) || 0,
        totalPages: Number(json.recentMeta?.totalPages) || 1,
        hasPrev: Boolean(json.recentMeta?.hasPrev),
        hasNext: Boolean(json.recentMeta?.hasNext),
      });
      setFilterOptions({
        providers: json.recentFilterOptions?.providers || [],
        categories: json.recentFilterOptions?.categories || [],
        contexts: json.recentFilterOptions?.contexts || [],
      });
    } catch (err) {
      showToast(err.message || 'Failed to load API tracking', 'error');
    } finally {
      setLoading(false);
    }
  }, [companyId, query, saFetch, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const applySearch = () => {
    setQuery((prev) => ({ ...prev, page: 1, search: searchDraft.trim() }));
  };

  const resetFilters = () => {
    setQuery((prev) => ({
      ...prev,
      page: 1,
      search: '',
      provider: '',
      category: '',
      context: '',
      status: '',
    }));
    setSearchDraft('');
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${encodeURIComponent(companyId)}`} className="sa-breadcrumb">← Company</Link>
          <h2 className="sa-page-title">API Tracking</h2>
          <div className="sa-text-muted">Third-party API usage and chat context API mapping.</div>
        </div>
        <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="sa-kpi-grid sa-kpi-grid-sm">
        <div className="sa-kpi-card"><div className="sa-kpi-label">Total Calls</div><div className="sa-kpi-value">{data.summary.total_calls || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Success Calls</div><div className="sa-kpi-value">{data.summary.success_calls || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Failed Calls</div><div className="sa-kpi-value">{data.summary.failed_calls || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Calls (24h)</div><div className="sa-kpi-value">{data.summary.calls_24h || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Calls (7d)</div><div className="sa-kpi-value">{data.summary.calls_7d || 0}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-label">Avg Latency</div><div className="sa-kpi-value">{data.summary.avg_latency_ms || 0} ms</div></div>
      </div>

      <div className="sa-detail-cols">
        <div className="sa-panel">
          <h3 className="sa-panel-title">Provider Usage</h3>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr><th>Provider</th><th>Total</th><th>Failed</th><th>Avg Latency</th></tr>
              </thead>
              <tbody>
                {data.byProvider.length ? data.byProvider.map((r) => (
                  <tr key={r.provider}>
                    <td>{r.provider}</td>
                    <td>{r.calls}</td>
                    <td>{r.failed}</td>
                    <td>{r.avg_latency_ms} ms</td>
                  </tr>
                )) : <tr><td colSpan={4} className="sa-text-muted">No usage yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sa-panel">
          <h3 className="sa-panel-title">Chat Context API Used</h3>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr><th>Context</th><th>Provider</th><th>Model</th><th>Calls</th></tr>
              </thead>
              <tbody>
                {data.chatContextApis.length ? data.chatContextApis.map((r, i) => (
                  <tr key={`${r.context}-${r.provider}-${r.model || 'm'}-${i}`}>
                    <td>{r.context || '-'}</td>
                    <td>{r.provider || '-'}</td>
                    <td>{r.model || '-'}</td>
                    <td>{r.calls}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="sa-text-muted">No chat context usage yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sa-panel">
        <h3 className="sa-panel-title">Recent API Calls</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            className="sa-input-sm"
            placeholder="Search provider, model, context, session..."
            style={{ minWidth: 260 }}
          />
          <select
            className="sa-input-sm"
            value={query.provider}
            onChange={(e) => setQuery((prev) => ({ ...prev, provider: e.target.value, page: 1 }))}
          >
            <option value="">All providers</option>
            {filterOptions.providers.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            className="sa-input-sm"
            value={query.category}
            onChange={(e) => setQuery((prev) => ({ ...prev, category: e.target.value, page: 1 }))}
          >
            <option value="">All categories</option>
            {filterOptions.categories.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            className="sa-input-sm"
            value={query.context}
            onChange={(e) => setQuery((prev) => ({ ...prev, context: e.target.value, page: 1 }))}
          >
            <option value="">All contexts</option>
            {filterOptions.contexts.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            className="sa-input-sm"
            value={query.status}
            onChange={(e) => setQuery((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
          >
            <option value="">Any status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          <button type="button" className="sa-btn sa-btn-secondary sa-btn-sm" onClick={applySearch}>Apply</button>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={resetFilters}>Reset</button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Provider</th>
                <th>Category</th>
                <th>Model</th>
                <th>Context</th>
                <th>Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length ? data.recent.map((r) => (
                <tr key={r.id}>
                  <td>{dt(r.createdAt)}</td>
                  <td>{r.provider || '-'}</td>
                  <td>{r.category || '-'}</td>
                  <td>{r.model || '-'}</td>
                  <td>{r.requestContext || '-'}</td>
                  <td>{Number.isFinite(r.latencyMs) ? `${r.latencyMs} ms` : '-'}</td>
                  <td style={{ color: r.success ? 'var(--sa-success)' : 'var(--sa-danger)' }}>
                    {r.success ? 'success' : 'failed'}
                  </td>
                </tr>
              )) : <tr><td colSpan={7} className="sa-text-muted">No API calls tracked yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          <div className="sa-text-muted">
            Showing page {recentMeta.page} of {recentMeta.totalPages} ({recentMeta.total} rows)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="sa-text-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Per page
              <select
                className="sa-input-sm"
                value={query.limit}
                onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, limit: Number(e.target.value) || 50 }))}
              >
                {PER_PAGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="sa-btn sa-btn-secondary sa-btn-sm"
              disabled={!recentMeta.hasPrev}
              onClick={() => setQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-secondary sa-btn-sm"
              disabled={!recentMeta.hasNext}
              onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

