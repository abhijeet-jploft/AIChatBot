import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

export default function SystemMonitoring() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
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

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, []);

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
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={load}>Refresh</button>
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
