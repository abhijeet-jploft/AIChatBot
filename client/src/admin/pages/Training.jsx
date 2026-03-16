import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const STATUS_CLASS = {
  pending: 'bg-secondary',
  running: 'bg-warning text-dark',
  completed: 'bg-success',
  failed: 'bg-danger',
};

export default function Training() {
  const { authFetch } = useAuth();
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await authFetch(`/training/scrape/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current);
        }
      } catch {}
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
      if (!res.ok) throw new Error(data.error || 'Failed to start');
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
      const res = await authFetch(`/training/scrape/save/${jobId}`, { method: 'POST' });
      const data = await res.json();
      setSaveMsg(data.saved ? `Saved ${data.lines} lines, ${data.links} links` : 'Save failed');
    } catch {
      setSaveMsg('Network error');
    }
  };

  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Train data (website scrape)</h5>
      <form onSubmit={handleSubmit} className="mb-4" style={{ maxWidth: 500 }}>
        <div className="mb-2">
          <label className="form-label">Website URL</label>
          <input
            type="url"
            className="form-control"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com"
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
            required
          />
        </div>
        {error && <div className="alert alert-danger py-2 mb-2">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Starting…' : 'Start scrape'}
        </button>
      </form>

      {job && (
        <div className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
          <div className="card-body">
            <span className={`badge ${STATUS_CLASS[job.status] || 'bg-secondary'}`}>{job.status}</span>
            {job.pages?.length > 0 && <span className="ms-2 text-muted">{job.pages.length} pages</span>}
            {job.status === 'completed' && (
              <button className="btn btn-sm btn-success ms-2" onClick={handleSave}>Save to training</button>
            )}
            {saveMsg && <div className="mt-2 text-small">{saveMsg}</div>}
            {job.log?.length > 0 && (
              <pre className="mt-2 mb-0 p-2 rounded small overflow-auto" style={{ maxHeight: 200, background: 'var(--chat-bg)', fontSize: 11 }}>
                {job.log.slice(-30).join('\n')}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
