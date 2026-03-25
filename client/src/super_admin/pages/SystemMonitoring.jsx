import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const LOG_TABS = [
  { id: 'error_reports', label: 'Error Reports' },
  { id: 'warnings', label: 'Warnings' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'logs', label: 'Logs' },
];

export default function SystemMonitoring() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [status, setStatus] = useState(null);
  const [entries, setEntries] = useState([]);
  const [activeTab, setActiveTab] = useState('error_reports');
  const [logsLoading, setLogsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await saFetch('/system/status');
      if (!res.ok) throw new Error('Failed to load system status');
      setStatus(await res.json());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (tab = activeTab) => {
    setLogsLoading(true);
    try {
      const res = await saFetch(`/system/logs?tab=${encodeURIComponent(tab)}&limit=120`);
      if (!res.ok) throw new Error('Failed to load logs');
      const data = await res.json();
      setEntries(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadLogs(activeTab);
    const id = setInterval(() => {
      loadStatus();
      loadLogs(activeTab);
    }, 30000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLogs(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtUptime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">System Monitoring</h2>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => { loadStatus(); loadLogs(activeTab); }}>
          Refresh
        </button>
      </div>

      {loading && !status ? (
        <div className="sa-loading">Loading…</div>
      ) : status ? (
        <>
          {/* Overall status */}
          <div className="sa-status-banner sa-status-ok">
            <span className="sa-status-dot" />
            System is <strong>{status.status}</strong> — DB {status.dbConnected ? 'connected' : 'DISCONNECTED'}
          </div>

          <div className="sa-detail-cols" style={{ marginBottom: 16 }}>
            <div className="sa-panel">
              <h3 className="sa-panel-title">Server Load</h3>
              <ul className="sa-info-list">
                <li><span>CPU Load (1m)</span><strong>{status.metrics?.serverLoad?.cpuLoadPercent1m ?? '-'}%</strong></li>
                <li><span>Load Avg 1m</span><strong>{status.metrics?.serverLoad?.avg1m ?? '-'}</strong></li>
                <li><span>Load Avg 5m</span><strong>{status.metrics?.serverLoad?.avg5m ?? '-'}</strong></li>
                <li><span>Load Avg 15m</span><strong>{status.metrics?.serverLoad?.avg15m ?? '-'}</strong></li>
              </ul>
            </div>
            <div className="sa-panel">
              <h3 className="sa-panel-title">Latency</h3>
              <ul className="sa-info-list">
                <li><span>API latency</span><strong>{status.metrics?.apiLatencyMs ?? '-'} ms</strong></li>
                <li><span>AI avg response</span><strong>{status.metrics?.aiResponseTime?.avgMs ?? '-'} ms</strong></li>
                <li><span>AI p95 response</span><strong>{status.metrics?.aiResponseTime?.p95Ms ?? '-'} ms</strong></li>
                <li><span>AI max response</span><strong>{status.metrics?.aiResponseTime?.maxMs ?? '-'} ms</strong></li>
              </ul>
            </div>
            <div className="sa-panel">
              <h3 className="sa-panel-title">Error Logs</h3>
              <ul className="sa-info-list">
                <li><span>Recent errors</span><strong className="sa-text-err">{status.metrics?.errors?.recentErrors ?? 0}</strong></li>
                <li><span>Recent warnings</span><strong>{status.metrics?.errors?.recentWarnings ?? 0}</strong></li>
                <li><span>Generated</span><strong>{status.generatedAt ? new Date(status.generatedAt).toLocaleTimeString() : '-'}</strong></li>
              </ul>
            </div>
          </div>

          <div className="sa-tabs" style={{ marginBottom: 12 }}>
            {LOG_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`sa-tab ${activeTab === tab.id ? 'sa-tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="sa-panel">
            <h3 className="sa-panel-title" style={{ marginTop: 0 }}>
              {LOG_TABS.find((t) => t.id === activeTab)?.label || 'Logs'}
            </h3>
            {logsLoading ? (
              <div className="sa-loading">Loading entries…</div>
            ) : entries.length === 0 ? (
              <div className="sa-empty">No entries in this tab.</div>
            ) : (
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Level</th>
                      <th>Type</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={`${entry.type}-${entry.id}-${entry.ts}`}>
                        <td>{new Date(entry.ts).toLocaleString()}</td>
                        <td><span className={`sa-badge ${entry.level === 'error' ? 'sa-badge-hot' : entry.level === 'warn' ? 'sa-badge-warn' : 'sa-badge-cold'}`}>{entry.level}</span></td>
                        <td>{entry.type}</td>
                        <td>
                          <div>{entry.message}</div>
                          {entry.meta ? (
                            <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: 'var(--sa-text-muted)', fontSize: 12 }}>
                              {JSON.stringify(entry.meta, null, 2)}
                            </pre>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sa-detail-cols">
            {/* Process */}
            <div className="sa-panel">
              <h3 className="sa-panel-title">Process (Node.js)</h3>
              <ul className="sa-info-list">
                <li><span>Status</span><strong>{status.status}</strong></li>
                <li><span>Uptime</span><strong>{fmtUptime(status.uptime)}</strong></li>
                <li><span>Node Version</span><strong>{status.nodeVersion}</strong></li>
                <li><span>Heap Used</span><strong>{status.memory.heapUsedMB} MB</strong></li>
                <li><span>Heap Total</span><strong>{status.memory.heapTotalMB} MB</strong></li>
                <li><span>RSS</span><strong>{status.memory.rssMB} MB</strong></li>
              </ul>
            </div>

            {/* OS */}
            <div className="sa-panel">
              <h3 className="sa-panel-title">Host System</h3>
              <ul className="sa-info-list">
                <li><span>Platform</span><strong>{status.os.platform}</strong></li>
                <li><span>Architecture</span><strong>{status.os.arch}</strong></li>
                <li><span>CPUs</span><strong>{status.os.cpus}</strong></li>
                <li><span>Free Memory</span><strong>{status.os.freeMemMB} MB</strong></li>
                <li><span>Total Memory</span><strong>{status.os.totalMemMB} MB</strong></li>
                <li><span>Database</span><strong className={status.dbConnected ? 'sa-text-ok' : 'sa-text-err'}>{status.dbConnected ? 'Connected' : 'Disconnected'}</strong></li>
              </ul>
            </div>
          </div>

          {/* Vehicle data pipeline note */}
          <div className="sa-panel sa-panel-info">
            <h3 className="sa-panel-title">Data Ingestion Pipeline</h3>
            <p className="sa-text-muted">
              Vehicle-collected data (GPS, sensor, environmental inputs) flows through the training ingestion pipeline.
              Use the <strong>Training</strong> module per company to verify that uploaded/scraped datasets are processed correctly.
              Structured data (CSV/JSONL) and database integrations are ingested via the company training pages.
            </p>
            <ul className="sa-check-list">
              <li className="sa-check-ok">JSONL training files processed per company</li>
              <li className="sa-check-ok">Scraped website content merged into knowledge base</li>
              <li className="sa-check-ok">Document uploads (PDF/DOCX) extracted and stored</li>
              <li className="sa-check-ok">Manual knowledge entries stored per company</li>
              <li className="sa-check-ok">Conversational training pairs ingested</li>
            </ul>
          </div>
        </>
      ) : (
        <div className="sa-empty">Could not load system status.</div>
      )}
    </div>
  );
}
