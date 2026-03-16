import { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ─── Status badge colour map ──────────────────────────────────────────────────
const STATUS_CLASS = {
  pending: 'bg-secondary',
  running: 'bg-warning text-dark',
  completed: 'bg-success',
  failed: 'bg-danger',
};

export default function TrainOrgData() {
  const [url, setUrl] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const logRef = useRef(null);
  const pollRef = useRef(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  // Poll status while job is active
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/scrape/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current);
        }
      } catch {
        // network hiccup — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaveMsg('');
    setJob(null);
    setJobId(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/scrape/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          companyId: companyId.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start scrape job');
      }

      const data = await res.json();
      setJobId(data.jobId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = () => {
    if (!jobId) return;
    window.open(`${API_BASE}/scrape/download/${jobId}`, '_blank');
  };

  const handleSave = async () => {
    if (!jobId) return;
    setSaveMsg('');
    try {
      const res = await fetch(`${API_BASE}/scrape/save/${jobId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.saved) {
        const linkInfo = typeof data.links === 'number' ? ` and ${data.links} links` : '';
        setSaveMsg(
          `Saved ${data.lines} lines${linkInfo} -> training company: ${data.companyId}`
        );
      } else {
        setSaveMsg('Save failed. See server logs.');
      }
    } catch {
      setSaveMsg('Network error while saving.');
    }
  };

  const isRunning = job?.status === 'running' || submitting;

  return (
    <div
      className="flex-grow-1 overflow-auto"
      style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)' }}
    >
      <div
        className="py-4 px-3 px-md-5 mx-auto"
        style={{ maxWidth: 860 }}
      >
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <h5
          className="fw-bold mb-1"
          style={{ color: 'var(--chat-text-heading)' }}
        >
          Website Scraper → Training Data
        </h5>
        <p className="text-muted mb-4" style={{ fontSize: 13 }}>
          Crawl a full website, deduplicate repeating headers &amp; footers,
          and export an&nbsp;
          <strong>Anthropic JSONL</strong> training file with prompt-caching
          ready&nbsp; system&nbsp;/&nbsp;user&nbsp;/&nbsp;assistant entries.
        </p>

        {/* ── Form ────────────────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3 p-3 p-md-4 mb-4"
          style={{
            background: 'var(--chat-surface)',
            border: '1px solid var(--chat-border)',
          }}
        >
          <div className="row g-3">
            <div className="col-12">
              <label
                className="form-label small fw-semibold mb-1"
                style={{ color: 'var(--chat-text)' }}
              >
                Website URL <span className="text-danger">*</span>
              </label>
              <input
                type="url"
                className="form-control"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isRunning}
                style={{
                  background: 'var(--chat-bg)',
                  color: 'var(--chat-text)',
                  borderColor: 'var(--chat-border)',
                }}
              />
            </div>

            <div className="col-12 col-md-6">
              <label
                className="form-label small fw-semibold mb-1"
                style={{ color: 'var(--chat-text)' }}
              >
                Company ID{' '}
                <span className="text-muted fw-normal">(optional)</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="_My_Company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={isRunning}
                style={{
                  background: 'var(--chat-bg)',
                  color: 'var(--chat-text)',
                  borderColor: 'var(--chat-border)',
                }}
              />
              <div className="form-text" style={{ fontSize: 11, color: 'var(--chat-muted)' }}>
                Auto-generated from domain if left blank. Used as training folder name.
              </div>
            </div>

            <div className="col-12 d-flex align-items-end">
              <button
                type="submit"
                className="btn btn-primary px-4"
                disabled={!url.trim() || isRunning}
              >
                {isRunning ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    {job?.status === 'running'
                      ? `Scraping — ${job.pages?.length || 0} pages found…`
                      : 'Starting…'}
                  </>
                ) : (
                  'Start Scraping'
                )}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="alert alert-danger py-2 small mb-3">{error}</div>
        )}

        {/* ── Results panel ────────────────────────────────────────────────────── */}
        {job && (
          <div>
            {/* Status row */}
            <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
              <span
                className={`badge ${STATUS_CLASS[job.status] || 'bg-secondary'}`}
                style={{ fontSize: 11 }}
              >
                {job.status.toUpperCase()}
              </span>
              <span className="small text-muted">
                {job.pages?.length || 0} pages scraped
                {job.jsonlLines ? ` · ${job.jsonlLines} JSONL lines` : ''}
                {job.errors?.length ? ` · ${job.errors.length} errors` : ''}
              </span>
            </div>

            {/* Action buttons */}
            {job.status === 'completed' && (
              <div className="d-flex gap-2 mb-3 flex-wrap">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleDownload}
                >
                  ↓ Download JSONL
                </button>
                <button
                  className="btn btn-sm btn-success"
                  onClick={handleSave}
                >
                  Save to Training Data
                </button>
              </div>
            )}

            {saveMsg && (
              <div className="alert alert-info py-2 small mb-3">{saveMsg}</div>
            )}

            {/* JSONL format legend */}
            {job.status === 'completed' && (
              <div
                className="rounded-3 p-3 mb-3 small"
                style={{
                  background: 'var(--chat-surface)',
                  border: '1px solid var(--chat-border)',
                  fontSize: 12,
                  color: 'var(--chat-muted)',
                }}
              >
                <strong style={{ color: 'var(--chat-text)' }}>JSONL format:</strong>
                {' '}each line = one conversation with{' '}
                <code style={{ color: 'var(--chat-accent)' }}>system</code> (AI persona){' '}+{' '}
                <code style={{ color: 'var(--chat-accent)' }}>user</code> (visitor question){' '}+{' '}
                <code style={{ color: 'var(--chat-accent)' }}>assistant</code> (page content).{' '}
                No embedded line breaks — fully Anthropic prompt-caching compatible.
                Global header/footer data is deduplicated into one entry.
              </div>
            )}

            {/* Pages list */}
            {job.pages?.length > 0 && (
              <div className="mb-3">
                <div
                  className="small fw-semibold mb-1"
                  style={{ color: 'var(--chat-text-heading)' }}
                >
                  Pages Scraped ({job.pages.length})
                </div>
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    background: 'var(--chat-surface)',
                    border: '1px solid var(--chat-border)',
                    borderRadius: 8,
                    padding: '8px 14px',
                  }}
                >
                  {job.pages.map((p, i) => (
                    <div
                      key={i}
                      className="small"
                      style={{ lineHeight: 1.9, color: 'var(--chat-muted)' }}
                    >
                      <span style={{ color: 'var(--chat-accent)', marginRight: 6 }}>
                        {i + 1}.
                      </span>
                      <span style={{ color: 'var(--chat-text)' }}>{p.title}</span>
                      <span style={{ opacity: 0.45, marginLeft: 6, fontSize: 11 }}>
                        {p.url}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {job.errors?.length > 0 && (
              <div className="mb-3">
                <div
                  className="small fw-semibold mb-1"
                  style={{ color: '#f87171' }}
                >
                  Errors ({job.errors.length})
                </div>
                <div
                  style={{
                    maxHeight: 100,
                    overflowY: 'auto',
                    background: 'var(--chat-surface)',
                    border: '1px solid #f871713a',
                    borderRadius: 8,
                    padding: '8px 14px',
                  }}
                >
                  {job.errors.map((e, i) => (
                    <div key={i} className="small" style={{ color: '#f87171', lineHeight: 1.8 }}>
                      {e.url} — {e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live log */}
            <div>
              <div
                className="small fw-semibold mb-1"
                style={{ color: 'var(--chat-text-heading)' }}
              >
                Scraper Log
              </div>
              <div
                ref={logRef}
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  background: '#0b0b0e',
                  border: '1px solid var(--chat-border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#86efac',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {(job.log || []).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
                {job.status === 'running' && (
                  <div style={{ opacity: 0.4 }}>● crawling…</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
