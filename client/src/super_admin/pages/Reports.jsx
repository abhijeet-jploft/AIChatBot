import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import {
  clampFromNotAfterTo,
  clampToNotBeforeFrom,
  nextToAfterFromChange,
} from '../../utils/dateRangeFields';
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

function formatStatusLabel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

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

function formatPeriodLabel(fromValue, toValue) {
  const fromDate = String(fromValue || '').slice(0, 10);
  const toDate = String(toValue || '').slice(0, 10);
  if (!fromDate && !toDate) return '';
  if (!fromDate) return toDate;
  if (!toDate) return fromDate;
  return fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;
}

const ACTIVITY_PAGE_SIZE = 20;
const ACTIVITY_PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

export default function Reports() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [appliedFrom, setAppliedFrom] = useState(() => from);
  const [appliedTo, setAppliedTo] = useState(() => to);
  const [activitySearchInput, setActivitySearchInput] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityMinConversationsInput, setActivityMinConversationsInput] = useState('');
  const [activityMinConversations, setActivityMinConversations] = useState('');
  const [activityMinLeadsInput, setActivityMinLeadsInput] = useState('');
  const [activityMinLeads, setActivityMinLeads] = useState('');
  const [activityMinConvertedInput, setActivityMinConvertedInput] = useState('');
  const [activityMinConverted, setActivityMinConverted] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(ACTIVITY_PAGE_SIZE);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('from', appliedFrom);
      params.set('to', appliedTo);
      params.set('byCompanyPage', String(activityPage));
      params.set('byCompanyLimit', String(activityPageSize));
      if (activitySearch.trim()) params.set('companySearch', activitySearch.trim());
      if (activityMinConversations !== '') params.set('minConversations', String(activityMinConversations));
      if (activityMinLeads !== '') params.set('minLeads', String(activityMinLeads));
      if (activityMinConverted !== '') params.set('minConverted', String(activityMinConverted));

      const res = await saFetch(`/reports?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load reports');
      setData(await res.json());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [appliedFrom, appliedTo, activitySearch, activityMinConversations, activityMinLeads, activityMinConverted, activityPage, activityPageSize]);

  const chartText = '#8a95b3';
  const chartGrid = 'rgba(138,149,179,0.18)';
  const convDayRaw = data?.conversationsByDay?.map((d) => d.day) || [];
  const convLabels = convDayRaw.map((d) => String(d || '').slice(5, 10));
  const convValues = data?.conversationsByDay?.map((d) => Number(d.n || 0)) || [];
  const leadsStatusLabels = data?.leadsByStatus?.map((s) => formatStatusLabel(s.status)) || [];
  const leadsStatusValues = data?.leadsByStatus?.map((s) => Number(s.n || 0)) || [];
  const periodLabel = formatPeriodLabel(data?.period?.from, data?.period?.to);
  const byCompanyRows = Array.isArray(data?.byCompany) ? data.byCompany : [];
  const byCompanyMeta = data?.byCompanyMeta || {
    total: byCompanyRows.length,
    page: activityPage,
    limit: activityPageSize,
    totalPages: Math.max(1, Math.ceil(byCompanyRows.length / Math.max(1, activityPageSize))),
  };
  const byCompanyTotal = Number(byCompanyMeta.total || 0);
  const byCompanyCurrentPage = Number(byCompanyMeta.page || 1);
  const byCompanyLimit = Number(byCompanyMeta.limit || activityPageSize || ACTIVITY_PAGE_SIZE);
  const byCompanyTotalPages = Math.max(1, Number(byCompanyMeta.totalPages || Math.ceil(byCompanyTotal / Math.max(1, byCompanyLimit)) || 1));
  const byCompanyFromRow = byCompanyTotal === 0 ? 0 : (byCompanyCurrentPage - 1) * byCompanyLimit + 1;
  const byCompanyToRow = Math.min(byCompanyCurrentPage * byCompanyLimit, byCompanyTotal);

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
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              const v = e.target.value;
              setFrom(clampFromNotAfterTo(to, v));
              setTo((t) => nextToAfterFromChange(v, t));
            }}
            className="sa-input-sm"
          />
          <span>to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(clampToNotBeforeFrom(from, e.target.value))}
            className="sa-input-sm"
          />
          <button
            className="sa-btn sa-btn-primary sa-btn-sm"
            onClick={() => {
              setAppliedFrom(from);
              setAppliedTo(to);
              setActivityPage(1);
            }}
          >
            Run
          </button>
        </div>
      </div>

      {loading ? (
        <div className="sa-loading">Loading…</div>
      ) : data ? (
        <>
          {/* By company */}
          <div className="sa-panel">
            <h3 className="sa-panel-title">Activity by Company ({periodLabel})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div className="sa-field" style={{ marginBottom: 0 }}>
                <label>Company search</label>
                <input
                  type="text"
                  value={activitySearchInput}
                  onChange={(e) => setActivitySearchInput(e.target.value)}
                  placeholder="Name or company ID"
                />
              </div>
              <div className="sa-field" style={{ marginBottom: 0 }}>
                <label>Min conversations</label>
                <input
                  type="number"
                  min="0"
                  value={activityMinConversationsInput}
                  onChange={(e) => setActivityMinConversationsInput(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="sa-field" style={{ marginBottom: 0 }}>
                <label>Min leads</label>
                <input
                  type="number"
                  min="0"
                  value={activityMinLeadsInput}
                  onChange={(e) => setActivityMinLeadsInput(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="sa-field" style={{ marginBottom: 0 }}>
                <label>Min converted</label>
                <input
                  type="number"
                  min="0"
                  value={activityMinConvertedInput}
                  onChange={(e) => setActivityMinConvertedInput(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sa-btn sa-btn-ghost sa-btn-sm"
                onClick={() => {
                  setActivitySearchInput('');
                  setActivitySearch('');
                  setActivityMinConversationsInput('');
                  setActivityMinConversations('');
                  setActivityMinLeadsInput('');
                  setActivityMinLeads('');
                  setActivityMinConvertedInput('');
                  setActivityMinConverted('');
                  setActivityPage(1);
                }}
              >
                Reset filters
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-primary sa-btn-sm"
                onClick={() => {
                  setActivitySearch(activitySearchInput.trim());
                  setActivityMinConversations(activityMinConversationsInput.trim());
                  setActivityMinLeads(activityMinLeadsInput.trim());
                  setActivityMinConverted(activityMinConvertedInput.trim());
                  setActivityPage(1);
                }}
              >
                Apply filters
              </button>
            </div>
            {byCompanyRows.length === 0 ? (
              <div className="sa-empty-sm">No company activity matches the selected filters.</div>
            ) : (
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr><th>Company</th><th>Conversations</th><th>Leads</th><th>Converted</th></tr>
                  </thead>
                  <tbody>
                    {byCompanyRows.map((c) => (
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
            )}
            <div className="sa-pagination-bar">
              <span className="sa-text-muted" style={{ fontSize: 12 }}>
                Showing {byCompanyFromRow} - {byCompanyToRow} of {byCompanyTotal}
              </span>
              <label className="sa-text-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Per page
                <select
                  value={activityPageSize}
                  onChange={(e) => {
                    setActivityPageSize(Number(e.target.value) || ACTIVITY_PAGE_SIZE);
                    setActivityPage(1);
                  }}
                  style={{ minWidth: 84 }}
                >
                  {ACTIVITY_PER_PAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="sa-btn sa-btn-ghost sa-btn-sm"
                disabled={byCompanyCurrentPage <= 1}
                onClick={() => setActivityPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span className="sa-text-muted" style={{ fontSize: 12 }}>
                Page {byCompanyCurrentPage} of {byCompanyTotalPages}
              </span>
              <button
                type="button"
                className="sa-btn sa-btn-ghost sa-btn-sm"
                disabled={byCompanyCurrentPage >= byCompanyTotalPages}
                onClick={() => setActivityPage((current) => Math.min(byCompanyTotalPages, current + 1))}
              >
                Next
              </button>
            </div>
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
