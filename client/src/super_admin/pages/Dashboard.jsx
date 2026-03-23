import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function Dashboard() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await saFetch('/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      setData(await res.json());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="sa-loading">Loading…</div>;
  if (!data) return <div className="sa-empty">No data</div>;

  const { stats, recentLeads, topCompanies, system } = data;
  const chartText = '#8a95b3';
  const chartGrid = 'rgba(138,149,179,0.18)';
  const topLabels = topCompanies.map((c) => c.name);
  const topLeadValues = topCompanies.map((c) => Number(c.leads || 0));
  const topConvValues = topCompanies.map((c) => Number(c.conversations || 0));
  const companyBarData = {
    labels: topLabels,
    datasets: [
      { label: 'Leads', data: topLeadValues, backgroundColor: '#6c63ff', borderRadius: 6 },
      { label: 'Conversations', data: topConvValues, backgroundColor: '#3b9eff', borderRadius: 6 },
    ],
  };
  const companyBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: chartText } },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items?.[0]?.dataIndex ?? 0;
            return `Company: ${topLabels[idx] || ''}`;
          },
          label: (item) => `${item.dataset?.label || 'Value'}: ${item.parsed?.y ?? item.raw ?? 0}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: chartText }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: chartText }, grid: { color: chartGrid } },
    },
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">System Dashboard</h2>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={load}>Refresh</button>
      </div>

      {/* KPI Cards */}
      <div className="sa-kpi-grid">
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Companies</div>
          <div className="sa-kpi-value">{stats.totalCompanies}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Total Conversations</div>
          <div className="sa-kpi-value">{stats.totalConversations.toLocaleString()}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Total Leads</div>
          <div className="sa-kpi-value">{stats.totalLeads.toLocaleString()}</div>
        </div>
        <div className="sa-kpi-card sa-kpi-card-system">
          <div className="sa-kpi-label">System Uptime</div>
          <div className="sa-kpi-value">{system.uptime}</div>
        </div>
      </div>

      <div className="sa-dashboard-cols">
        {/* Top companies */}
        <div className="sa-panel">
          <h3 className="sa-panel-title">Top Companies by Leads</h3>
          {topCompanies.length === 0 ? (
            <div className="sa-empty-sm">No companies yet.</div>
          ) : (
            <div style={{ height: 280 }}>
              <Bar data={companyBarData} options={companyBarOptions} />
            </div>
          )}
        </div>

        {/* System health */}
        <div className="sa-panel">
          <h3 className="sa-panel-title">System Health</h3>
          <ul className="sa-info-list">
            <li><span>Node</span><strong>{system.nodeVersion}</strong></li>
            <li><span>Platform</span><strong>{system.platform}</strong></li>
            <li><span>CPUs</span><strong>{system.cpuCount}</strong></li>
            <li><span>Memory (heap)</span><strong>{system.memoryUsedMB} MB used</strong></li>
          </ul>
        </div>
      </div>

      {/* Recent leads */}
      <div className="sa-panel sa-panel-full">
        <h3 className="sa-panel-title">Recent Leads (all companies)</h3>
        {recentLeads.length === 0 ? (
          <div className="sa-empty-sm">No leads yet.</div>
        ) : (
          <table className="sa-table">
            <thead>
              <tr><th>Name</th><th>Company</th><th>Score</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {recentLeads.map((l, i) => (
                <tr key={i}>
                  <td>{l.name || '—'}</td>
                  <td>{l.company_name}</td>
                  <td><span className={`sa-badge sa-badge-${l.lead_score_category}`}>{l.lead_score_category}</span></td>
                  <td>{l.status}</td>
                  <td>{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
