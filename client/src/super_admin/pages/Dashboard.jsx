import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LineElement,
  Legend,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

function formatStatusLabel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

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

  const { stats, recentLeads, topCompanies, charts, system } = data;
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
  const leadsStatusLabels = (charts?.leadsByStatus || []).map((item) => formatStatusLabel(item.status));
  const leadsStatusValues = (charts?.leadsByStatus || []).map((item) => Number(item.n || 0));
  const leadsStatusData = {
    labels: leadsStatusLabels,
    datasets: [{
      data: leadsStatusValues,
      backgroundColor: ['#6c63ff', '#3b9eff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'],
      borderWidth: 1,
      borderColor: '#111827',
    }],
  };

  const convTrendLabels = (charts?.conversationsByDay || []).map((item) =>
    new Date(item.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  );
  const convTrendValues = (charts?.conversationsByDay || []).map((item) => Number(item.conversations || 0));
  const convTrendData = {
    labels: convTrendLabels,
    datasets: [{
      label: 'Conversations',
      data: convTrendValues,
      borderColor: '#3b9eff',
      backgroundColor: 'rgba(59, 158, 255, 0.2)',
      tension: 0.3,
      fill: true,
    }],
  };

  const revenueTrendLabels = (charts?.revenueByMonth || []).map((item) =>
    new Date(item.month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  );
  const revenueTrendValues = (charts?.revenueByMonth || []).map((item) => Number(item.revenue || 0));
  const revenueTrendData = {
    labels: revenueTrendLabels,
    datasets: [{
      label: 'Revenue',
      data: revenueTrendValues,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34, 197, 94, 0.18)',
      tension: 0.35,
      fill: true,
    }],
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">Super Admin Dashboard (Overview)</h2>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={load}>Refresh</button>
      </div>

      {/* KPI Cards */}
      <div className="sa-kpi-grid">
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Total Registered Businesses</div>
          <div className="sa-kpi-value">{stats.totalBusinesses}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Active Subscriptions</div>
          <div className="sa-kpi-value">{stats.activeSubscriptions.toLocaleString()}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Total AI Conversations</div>
          <div className="sa-kpi-value">{stats.totalConversations.toLocaleString()}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Leads Generated (All Clients)</div>
          <div className="sa-kpi-value">{stats.totalLeads.toLocaleString()}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Revenue (Monthly)</div>
          <div className="sa-kpi-value">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: stats.revenue?.currency || 'USD', maximumFractionDigits: 0 }).format(stats.revenue?.monthly || 0)}
          </div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Revenue (Yearly)</div>
          <div className="sa-kpi-value">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: stats.revenue?.currency || 'USD', maximumFractionDigits: 0 }).format(stats.revenue?.yearly || 0)}
          </div>
        </div>
        <div className="sa-kpi-card sa-kpi-card-system">
          <div className="sa-kpi-label">System Health Status</div>
          <div className="sa-kpi-value">{stats.systemHealthStatus}</div>
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
            <li><span>CPU Load (1m)</span><strong>{system.cpuLoadPercent1m}%</strong></li>
            <li><span>Memory (heap)</span><strong>{system.memoryUsedMB} MB used</strong></li>
            <li><span>Uptime</span><strong>{system.uptime}</strong></li>
          </ul>
        </div>
      </div>

      <div className="sa-dashboard-cols">
        <div className="sa-panel">
          <h3 className="sa-panel-title">Conversations Trend (Last 14 Days)</h3>
          {convTrendLabels.length === 0 ? (
            <div className="sa-empty-sm">No trend data yet.</div>
          ) : (
            <div style={{ height: 280 }}>
              <Line data={convTrendData} options={companyBarOptions} />
            </div>
          )}
        </div>
        <div className="sa-panel">
          <h3 className="sa-panel-title">Leads by Status</h3>
          {leadsStatusLabels.length === 0 ? (
            <div className="sa-empty-sm">No lead status data yet.</div>
          ) : (
            <div style={{ height: 280 }}>
              <Doughnut data={leadsStatusData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartText } } } }} />
            </div>
          )}
        </div>
      </div>

      <div className="sa-panel">
        <h3 className="sa-panel-title">Revenue Trend (Last 12 Months)</h3>
        {revenueTrendLabels.length === 0 ? (
          <div className="sa-empty-sm">No revenue trend data yet.</div>
        ) : (
          <div style={{ height: 280 }}>
            <Line data={revenueTrendData} options={companyBarOptions} />
          </div>
        )}
      </div>

      {/* Recent leads */}
      {/* <div className="sa-panel sa-panel-full">
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
      </div> */}
    </div>
  );
}
