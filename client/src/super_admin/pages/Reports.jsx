import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { Bar, Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  BarElement,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

function formatDateTimeFull(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value || '');
  return dt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Reports() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    try {
      const res = await saFetch(`/reports?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Failed to load reports');
      setData(await res.json());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const chartText = '#8a95b3';
  const chartGrid = 'rgba(138,149,179,0.18)';
  const convDayRaw = data?.conversationsByDay?.map((d) => d.day) || [];
  const convLabels = convDayRaw.map((d) => String(d || '').slice(5, 10));
  const convValues = data?.conversationsByDay?.map((d) => Number(d.n || 0)) || [];
  const leadsStatusLabels = data?.leadsByStatus?.map((s) => s.status) || [];
  const leadsStatusValues = data?.leadsByStatus?.map((s) => Number(s.n || 0)) || [];

  const convLineData = {
    labels: convLabels,
    datasets: [
      {
        label: 'Conversations',
        data: convValues,
        borderColor: '#6c63ff',
        backgroundColor: 'rgba(108,99,255,0.2)',
        pointRadius: 2,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const convLineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items?.[0]?.dataIndex ?? 0;
            return `Date: ${formatDateTimeFull(convDayRaw[idx])}`;
          },
          label: (item) => `Conversations: ${item.parsed?.y ?? item.raw ?? 0}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: chartText }, grid: { color: chartGrid } },
      y: { beginAtZero: true, ticks: { color: chartText }, grid: { color: chartGrid } },
    },
  };

  const leadsBarData = {
    labels: leadsStatusLabels,
    datasets: [
      {
        label: 'Leads',
        data: leadsStatusValues,
        borderRadius: 6,
        backgroundColor: ['#6c63ff', '#3b9eff', '#22c680', '#f5a623', '#e54b4b', '#7a84a8'],
      },
    ],
  };

  const leadsBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items?.[0]?.dataIndex ?? 0;
            return `Status: ${leadsStatusLabels[idx] || ''}`;
          },
          label: (item) => `Leads: ${item.parsed?.y ?? item.raw ?? 0}`,
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
        <h2 className="sa-page-title">Reports</h2>
        <div className="sa-filter-row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sa-input-sm" />
          <span>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sa-input-sm" />
          <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={load}>Run</button>
        </div>
      </div>

      {loading ? (
        <div className="sa-loading">Loading…</div>
      ) : data ? (
        <>
          {/* By company */}
          <div className="sa-panel">
            <h3 className="sa-panel-title">Activity by Company ({data.period.from.slice(0,10)} → {data.period.to.slice(0,10)})</h3>
            <table className="sa-table">
              <thead>
                <tr><th>Company</th><th>Conversations</th><th>Leads</th><th>Converted</th></tr>
              </thead>
              <tbody>
                {data.byCompany.map((c) => (
                  <tr key={c.company_id}>
                    <td>{c.name}</td>
                    <td>{c.conversations}</td>
                    <td>{c.leads}</td>
                    <td>{c.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sa-dashboard-cols">
            {/* Leads by status */}
            <div className="sa-panel">
              <h3 className="sa-panel-title">Leads by Status</h3>
              {data.leadsByStatus.length === 0 ? (
                <div className="sa-empty-sm">No lead data for this period.</div>
              ) : (
                <div style={{ height: 260 }}>
                  <Bar data={leadsBarData} options={leadsBarOptions} />
                </div>
              )}
            </div>

            {/* Conversations by day */}
            <div className="sa-panel">
              <h3 className="sa-panel-title">Conversations per Day</h3>
              {data.conversationsByDay.length === 0 ? (
                <div className="sa-empty-sm">No data for this period.</div>
              ) : (
                <div style={{ height: 260 }}>
                  <Line data={convLineData} options={convLineOptions} />
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="sa-empty">No report data.</div>
      )}
    </div>
  );
}
