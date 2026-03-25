import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saFetch(`/companies/${companyId}/api-tracking?limit=120`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load API tracking');
      setData({
        summary: json.summary || {},
        byProvider: json.byProvider || [],
        byCategory: json.byCategory || [],
        chatContextApis: json.chatContextApis || [],
        recent: json.recent || [],
      });
    } catch (err) {
      showToast(err.message || 'Failed to load API tracking', 'error');
    } finally {
      setLoading(false);
    }
  }, [companyId, saFetch, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

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
      </div>
    </div>
  );
}

