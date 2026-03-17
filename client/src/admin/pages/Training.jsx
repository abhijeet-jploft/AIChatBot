import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const STATUS_CLASS = {
  pending: 'bg-secondary',
  running: 'bg-warning text-dark',
  completed: 'bg-success',
  failed: 'bg-danger',
};

export default function Training() {
  const { authFetch, company } = useAuth();
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const logRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  useEffect(() => {
    if (!jobId) return undefined;

    const poll = async () => {
      try {
        const res = await authFetch(`/training/scrape/status/${jobId}`);
        if (!res.ok) return;

        const data = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current);
        }
      } catch {
        // Keep polling across transient network issues.
      }
    };

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [jobId, authFetch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaveMsg('');
    setJob(null);
    setJobId(null);
    setSubmitting(true);

    try {
      const res = await authFetch('/training/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start scrape job');
      }

      setJobId(data.jobId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!jobId) return;
    setSaveMsg('');

    try {
      const res = await authFetch(`/training/scrape/save/${jobId}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.saved) {
        const linkInfo = typeof data.links === 'number' ? ` and ${data.links} links` : '';
        setSaveMsg(`Saved ${data.lines} lines${linkInfo} to ${data.companyId}`);
      } else {
        setSaveMsg('Save failed. See server logs.');
      }
    } catch {
      setSaveMsg('Network error while saving.');
    }
  };

  const isRunning = job?.status === 'running' || submitting;
  const companyLabel = company?.displayName || company?.companyId || 'this company';

  return (
    <div
      className="flex-grow-1 overflow-auto"
      style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)' }}
    >
      <div className="py-4 px-3 px-md-5 mx-auto" style={{ maxWidth: 960 }}>
        <h5 className="fw-bold mb-1" style={{ color: 'var(--chat-text-heading)' }}>
          Website Scraper - Training Data
        </h5>
        <p className="text-muted mb-4" style={{ fontSize: 13 }}>
          Crawl a full website, deduplicate repeating headers and footers, and save
          the generated training data directly to <strong>{companyLabel}</strong>.
        </p>

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

            <div className="col-12 col-md-8">
              <div
                className="rounded-3 h-100 d-flex align-items-center px-3 py-2 small"
                style={{
                  background: 'var(--chat-bg)',
                  border: '1px solid var(--chat-border)',
                  color: 'var(--chat-muted)',
                }}
              >
                Training target:
                <strong className="ms-1" style={{ color: 'var(--chat-text)' }}>
                  {companyLabel}
                </strong>
              </div>
            </div>

            <div className="col-12 col-md-4 d-flex align-items-end">
              <button
                type="submit"
                className="btn btn-primary px-4 w-100"
                disabled={!url.trim() || isRunning}
              >
                {isRunning ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    {job?.status === 'running'
                      ? `Scraping - ${job.pages?.length || 0} pages found...`
                      : 'Starting...'}
                  </>
                ) : (
                  'Start Scraping'
                )}
              </button>
            </div>
          </div>
        </form>

        {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

        {job && (
          <div>
            <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
              <span
                className={`badge ${STATUS_CLASS[job.status] || 'bg-secondary'}`}
                style={{ fontSize: 11 }}
              >
                {job.status.toUpperCase()}
              </span>
              <span className="small text-muted">
                {job.pages?.length || 0} pages scraped
                {job.jsonlLines ? ` | ${job.jsonlLines} JSONL lines` : ''}
                {job.errors?.length ? ` | ${job.errors.length} errors` : ''}
              </span>
            </div>

            {job.status === 'completed' && (
              <div className="d-flex gap-2 mb-3 flex-wrap">
                <button className="btn btn-sm btn-success" onClick={handleSave}>
                  Save to Training Data
                </button>
              </div>
            )}

            {saveMsg && (
              <div className="alert alert-info py-2 small mb-3">{saveMsg}</div>
            )}

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
                <strong style={{ color: 'var(--chat-text)' }}>Output format:</strong>{' '}
                each line becomes a training conversation entry. Shared header and
                footer content is deduplicated automatically before save.
              </div>
            )}

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
                  {job.pages.map((page, index) => (
                    <div
                      key={`${page.url || 'page'}-${index}`}
                      className="small"
                      style={{ lineHeight: 1.9, color: 'var(--chat-muted)' }}
                    >
                      <span style={{ color: 'var(--chat-accent)', marginRight: 6 }}>
                        {index + 1}.
                      </span>
                      <span style={{ color: 'var(--chat-text)' }}>{page.title}</span>
                      <span style={{ opacity: 0.45, marginLeft: 6, fontSize: 11 }}>
                        {page.url}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {job.errors?.length > 0 && (
              <div className="mb-3">
                <div className="small fw-semibold mb-1" style={{ color: '#f87171' }}>
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
                  {job.errors.map((entry, index) => (
                    <div
                      key={`${entry.url || 'error'}-${index}`}
                      className="small"
                      style={{ color: '#f87171', lineHeight: 1.8 }}
                    >
                      {entry.url} - {entry.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                {(job.log || []).map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
                {job.status === 'running' && <div style={{ opacity: 0.4 }}>... crawling ...</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
