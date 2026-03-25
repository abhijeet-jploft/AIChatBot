import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const STATUS_CLASS = {
  pending: 'bg-secondary',
  running: 'bg-warning text-dark',
  completed: 'bg-success',
  failed: 'bg-danger',
};

/** Scrape / transcribe / large uploads can run a long time — avoid client/proxy aborting early. */
const TRAINING_LONG_FETCH_MS = 30 * 60 * 1000;
const SCRAPE_POLL_INTERVAL_MS = 2500;

function scrapeJobStorageKey(companyId) {
  return `admin-training-scrape-job:${companyId}`;
}

function trainingFetchErrorMessage(err) {
  if (err && typeof err === 'object' && err.name === 'AbortError') {
    return 'Request timed out. If a scrape or upload was still running, check the server or try again with a smaller job.';
  }
  return err?.message || 'Network error.';
}

const TABS = [
  { id: 'scrape', label: 'Website scraping' },
  { id: 'conversational', label: 'Conversational' },
  { id: 'documents', label: 'Documents' },
  { id: 'database', label: 'Database / SQL' },
  { id: 'media', label: 'Media training' },
  { id: 'structured', label: 'Structured (CSV / Excel)' },
  { id: 'manual', label: 'Manual knowledge' },
];

export default function Training() {
  const { authFetch, company } = useAuth();
  const { showToast } = useAdminToast();
  const companyId = company?.companyId;
  const [activeTab, setActiveTab] = useState('scrape');

  // Website scrape
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Conversational
  const [convText, setConvText] = useState('');
  const [convUser, setConvUser] = useState('');
  const [convAssistant, setConvAssistant] = useState('');
  const [convSaving, setConvSaving] = useState(false);

  // Documents
  const [docFiles, setDocFiles] = useState(null);
  const [docSaving, setDocSaving] = useState(false);

  // Database / SQL knowledge
  const [dbTitle, setDbTitle] = useState('');
  const [dbContent, setDbContent] = useState('');
  const [dbFiles, setDbFiles] = useState(null);
  const [dbSaving, setDbSaving] = useState(false);

  // Media
  const [mediaFiles, setMediaFiles] = useState(null);
  const [mediaTranscript, setMediaTranscript] = useState('');
  const [mediaJsonl, setMediaJsonl] = useState('');
  const [mediaTranscribing, setMediaTranscribing] = useState(false);
  const [mediaSaving, setMediaSaving] = useState(false);

  // Structured (JSON body)
  const [structuredJson, setStructuredJson] = useState('');
  const [structuredFile, setStructuredFile] = useState(null);
  const [structuredSaving, setStructuredSaving] = useState(false);

  // Manual
  const [manualContent, setManualContent] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualRecording, setManualRecording] = useState(false);

  // Training files list
  const [files, setFiles] = useState([]);

  const logRef = useRef(null);
  const pollRef = useRef(null);
  const manualRecognitionRef = useRef(null);
  const manualShouldBeRecordingRef = useRef(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.log]);

  // Restore in-progress scrape job after navigation/remount (does not reload the document).
  useEffect(() => {
    if (!companyId) return;
    try {
      const raw = sessionStorage.getItem(scrapeJobStorageKey(companyId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.jobId && typeof parsed.jobId === 'string') {
        setJobId(parsed.jobId);
        if (parsed.job && typeof parsed.job === 'object') setJob(parsed.job);
      }
    } catch {
      /* ignore */
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    try {
      if (jobId) {
        sessionStorage.setItem(scrapeJobStorageKey(companyId), JSON.stringify({ jobId, job }));
      } else {
        sessionStorage.removeItem(scrapeJobStorageKey(companyId));
      }
    } catch {
      /* ignore */
    }
  }, [companyId, jobId, job]);

  useEffect(() => {
    const busy = submitting || job?.status === 'running';
    if (!busy) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [submitting, job?.status]);

  useEffect(() => () => {
    try {
      manualShouldBeRecordingRef.current = false;
      manualRecognitionRef.current?.stop?.();
    } catch {
      // ignore cleanup errors
    }
  }, []);

  useEffect(() => {
    if (!jobId) return undefined;
    const poll = async () => {
      try {
        const res = await authFetch(`/training/scrape/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') clearInterval(pollRef.current);
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, SCRAPE_POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [jobId, authFetch]);

  const loadManual = async () => {
    setManualLoading(true);
    try {
      const res = await authFetch('/training/manual');
      if (res.ok) {
        const data = await res.json();
        setManualContent(data.text || data.content || '');
      }
    } catch {
      showToast('Failed to load manual knowledge', 'error');
    } finally {
      setManualLoading(false);
    }
  };

  const loadFiles = useCallback(async () => {
    try {
      const res = await authFetch('/training/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {}
  }, [authFetch]);

  useEffect(() => {
    if (activeTab === 'manual') loadManual();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const companyLabel = company?.displayName || company?.companyId || 'this company';

  // ─── Scrape ───────────────────────────────────────────────────────────────
  const handleScrapeSubmit = async (e) => {
    e.preventDefault();
    setJob(null);
    setJobId(null);
    setSubmitting(true);
    try {
      const res = await authFetch('/training/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start scrape job');
      setJobId(data.jobId);
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScrapeSave = async () => {
    if (!jobId) return;
    try {
      const res = await authFetch(`/training/scrape/save/${jobId}`, {
        method: 'POST',
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        const msg = data.linesAppended != null
          ? `Appended ${data.linesAppended} lines to scraped_website.jsonl${data.linesSkipped ? ` (${data.linesSkipped} already present)` : ''}. ${data.links ?? 0} links saved.`
          : `Saved ${data.lines ?? 0} lines and ${data.links ?? 0} links`;
        showToast(msg, 'success');
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    }
  };

  // ─── Conversational ───────────────────────────────────────────────────────
  const handleConversationalSubmit = async (e) => {
    e.preventDefault();
    const text = convText.trim();
    const hasQa = convUser.trim() || convAssistant.trim();
    if (!text && !hasQa) {
      showToast('Enter an instruction or Q&A pair.', 'error');
      return;
    }
    setConvSaving(true);
    try {
      const res = await authFetch('/training/conversational', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text || undefined,
          userMessage: convUser.trim() || undefined,
          assistantMessage: convAssistant.trim() || undefined,
        }),
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        showToast('Appended to conversational training.', 'success');
        setConvText('');
        setConvUser('');
        setConvAssistant('');
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setConvSaving(false);
    }
  };

  // ─── Documents ────────────────────────────────────────────────────────────
  const handleDocumentsSubmit = async (e) => {
    e.preventDefault();
    if (!docFiles?.length) {
      showToast('Select at least one file (PDF, DOCX, TXT, or SQL/DDL).', 'error');
      return;
    }
    setDocSaving(true);
    try {
      const form = new FormData();
      Array.from(docFiles).forEach((f) => form.append('files', f));
      const res = await authFetch('/training/documents', {
        method: 'POST',
        body: form,
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        showToast(`Saved ${data.files?.length || data.results?.length || 0} document(s).`, 'success');
        setDocFiles(null);
        document.getElementById('training-doc-input')?.form?.reset();
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setDocSaving(false);
    }
  };

  // ─── Database / SQL ───────────────────────────────────────────────────────
  const handleDatabaseSubmit = async (e) => {
    e.preventDefault();
    if (!dbContent.trim() && !dbFiles?.length) {
      showToast('Paste schema/SQL text or choose file(s).', 'error');
      return;
    }
    setDbSaving(true);
    try {
      const form = new FormData();
      if (dbTitle.trim()) form.append('title', dbTitle.trim());
      if (dbContent.trim()) form.append('content', dbContent.trim());
      if (dbFiles?.length) {
        Array.from(dbFiles).forEach((f) => form.append('files', f));
      }
      const res = await authFetch('/training/database', {
        method: 'POST',
        body: form,
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved) {
        showToast(
          `Database knowledge saved. ${data.appended ?? 0} new entr(ies), ${data.skipped ?? 0} duplicate(s) skipped.`,
          'success'
        );
        setDbFiles(null);
        document.getElementById('training-db-files')?.form?.reset();
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setDbSaving(false);
    }
  };

  // ─── Media ─────────────────────────────────────────────────────────────────
  const handleMediaSubmit = async (e) => {
    e.preventDefault();
    if (!mediaFiles?.length) {
      showToast('Select at least one media file (image/audio/video).', 'error');
      return;
    }
    if (!mediaJsonl.trim()) {
      showToast('Wait for transcription to complete before saving.', 'error');
      return;
    }
    setMediaSaving(true);
    try {
      const form = new FormData();
      Array.from(mediaFiles).forEach((f) => form.append('files', f));
      form.append('transcript', mediaTranscript.trim());
      form.append('jsonlContent', mediaJsonl.trim());
      const res = await authFetch('/training/media', {
        method: 'POST',
        body: form,
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved) {
        showToast(
          `Saved ${data.files?.length || 0} media file(s). JSONL appended: ${data.linesAppended ?? 0}${data.linesSkipped ? ` (${data.linesSkipped} skipped as duplicates)` : ''}.`,
          'success'
        );
        setMediaFiles(null);
        setMediaTranscript('');
        setMediaJsonl('');
        document.getElementById('training-media-input')?.form?.reset();
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setMediaSaving(false);
    }
  };

  const handleMediaFileChange = async (fileList) => {
    setMediaFiles(fileList);
    setMediaTranscript('');
    setMediaJsonl('');

    if (!fileList?.length) return;

    setMediaTranscribing(true);
    try {
      const form = new FormData();
      Array.from(fileList).forEach((f) => form.append('files', f));
      const res = await authFetch('/training/media/transcribe', {
        method: 'POST',
        body: form,
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to transcribe media');
      setMediaTranscript(data.transcriptPreview || '');
      setMediaJsonl(data.jsonlContent || '');
      showToast('Media transcribed successfully.', 'success');
    } catch (err) {
      const msg =
        err?.name === 'AbortError' ? trainingFetchErrorMessage(err) : err.message || 'Failed to transcribe media';
      showToast(msg, 'error');
    } finally {
      setMediaTranscribing(false);
    }
  };

  // ─── Structured ───────────────────────────────────────────────────────────
  const handleStructuredSubmit = async (e) => {
    e.preventDefault();
    let rows = [];
    if (structuredFile) {
      setStructuredSaving(true);
      const form = new FormData();
      form.append('file', structuredFile);
      try {
        const res = await authFetch('/training/structured/upload', {
          method: 'POST',
          body: form,
          timeoutMs: TRAINING_LONG_FETCH_MS,
        });
        const data = await res.json();
        if (data.saved) {
          showToast(`Appended ${data.count} row(s).`, 'success');
          setStructuredFile(null);
          const el = document.getElementById('training-structured-file');
          if (el) el.value = '';
          loadFiles();
        } else showToast(data.error || 'Save failed.', 'error');
      } catch (err) {
        showToast(trainingFetchErrorMessage(err), 'error');
      } finally {
        setStructuredSaving(false);
      }
      return;
    }
    if (structuredJson.trim()) {
      try {
        rows = JSON.parse(structuredJson);
        if (!Array.isArray(rows)) rows = [rows];
      } catch {
        showToast('Invalid JSON. Use an array of objects.', 'error');
        return;
      }
    }
    if (!rows.length) {
      showToast('Paste JSON array or upload CSV/Excel.', 'error');
      return;
    }
    setStructuredSaving(true);
    try {
      const res = await authFetch('/training/structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved) {
        showToast(`Appended ${data.count} row(s).`, 'success');
        setStructuredJson('');
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setStructuredSaving(false);
    }
  };

  // ─── Manual ──────────────────────────────────────────────────────────────
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setManualSaving(true);
    try {
      const res = await authFetch('/training/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: manualContent }),
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        showToast('Manual knowledge saved.', 'success');
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setManualSaving(false);
    }
  };

  const ensureManualRecognition = () => {
    if (typeof window === 'undefined') return null;
    if (manualRecognitionRef.current) return manualRecognitionRef.current;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal && result[0]?.transcript) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        setManualContent((prev) =>
          prev ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim()
        );
      }
    };

    recognition.onend = () => {
      if (manualShouldBeRecordingRef.current) {
        try {
          recognition.start();
        } catch {
          // ignore restart errors
        }
      } else {
        setManualRecording(false);
      }
    };

    recognition.onerror = () => {
      manualShouldBeRecordingRef.current = false;
      setManualRecording(false);
    };

    manualRecognitionRef.current = recognition;
    return recognition;
  };

  const handleManualMicClick = () => {
    if (manualLoading || manualSaving) return;
    if (manualRecording) {
      try {
        manualRecognitionRef.current?.stop?.();
      } catch {
        // ignore
      }
      manualShouldBeRecordingRef.current = false;
      setManualRecording(false);
      return;
    }

    const recognition = ensureManualRecognition();
    if (!recognition) return;

    try {
      manualShouldBeRecordingRef.current = true;
      recognition.start();
      setManualRecording(true);
    } catch {
      setManualRecording(false);
    }
  };

  const isScrapeRunning = job?.status === 'running' || submitting;
  const manualMicButtonStyle = {
    width: 36,
    height: 36,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${manualRecording ? 'var(--chat-accent)' : 'var(--chat-border)'}`,
    background: manualRecording ? 'color-mix(in srgb, var(--chat-accent) 16%, var(--chat-bg) 84%)' : 'var(--chat-bg)',
    color: manualRecording ? 'var(--chat-accent)' : 'var(--chat-text)',
    transition: 'all 0.2s ease',
  };

  return (
    <div className="flex-grow-1 overflow-auto" style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)' }}>
      <div className="py-4 px-3 px-md-5 mx-auto" style={{ maxWidth: 960 }}>
        <h5 className="fw-bold mb-1" style={{ color: 'var(--chat-text-heading)' }}>
          Training — Knowledge base
        </h5>
        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
          All training methods use a single file: <strong>scraped_website.jsonl</strong>. Data is appended only if not already present. Website scraping also writes <strong>scraped_website_links.txt</strong> for page links.
        </p>

        {/* Tabs */}
        <ul className="nav nav-tabs mb-4 flex-wrap" style={{ borderColor: 'var(--chat-border)' }}>
          {TABS.map((t) => (
            <li key={t.id} className="nav-item">
              <button
                type="button"
                className={`nav-link ${activeTab === t.id ? 'active' : ''}`}
                style={{
                  color: activeTab === t.id ? 'var(--chat-text-heading)' : 'var(--chat-muted)',
                  borderColor: activeTab === t.id ? 'var(--chat-border) var(--chat-border) transparent' : 'transparent',
                  background: activeTab === t.id ? 'var(--chat-surface)' : 'transparent',
                }}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Training files summary */}
        {files.length > 0 && (
          <div className="mb-4 p-3 rounded-3 small" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <strong style={{ color: 'var(--chat-text-heading)' }}>Saved files ({companyLabel})</strong>
            <ul className="mb-0 mt-1 ps-3" style={{ color: 'var(--chat-muted)' }}>
              {files.map((f) => (
                <li key={f.name}>
                  {f.name} ({Math.round(f.size / 1024)} KB)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tab: Website scraping */}
        {activeTab === 'scrape' && (
          <>
            <form onSubmit={handleScrapeSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small fw-semibold mb-1" style={{ color: 'var(--chat-text)' }}>Website URL <span className="text-danger">*</span></label>
                  <input
                    type="url"
                    className="form-control"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    disabled={isScrapeRunning}
                    style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                  />
                </div>
                <div className="col-12 col-md-4 d-flex align-items-end">
                  <button type="submit" className="btn btn-primary px-4 w-100" disabled={!url.trim() || isScrapeRunning}>
                    {isScrapeRunning ? <><span className="spinner-border spinner-border-sm me-2" />{job?.status === 'running' ? `Scraping — ${job.pages?.length || 0} pages...` : 'Starting...'}</> : 'Start scraping'}
                  </button>
                </div>
              </div>
            </form>
            {job && (
              <div>
                <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
                  <span className={`badge ${STATUS_CLASS[job.status] || 'bg-secondary'}`} style={{ fontSize: 11 }}>{job.status.toUpperCase()}</span>
                  <span className="small text-muted">{job.pages?.length || 0} pages | {job.jsonlLines || 0} JSONL lines</span>
                </div>
                {job.status === 'completed' && (
                  <div className="d-flex gap-2 mb-3"><button type="button" className="btn btn-sm btn-success" onClick={handleScrapeSave}>Save to training data</button></div>
                )}
                {job.pages?.length > 0 && (
                  <div className="mb-3">
                    <div className="small fw-semibold mb-1" style={{ color: 'var(--chat-text-heading)' }}>Pages ({job.pages.length})</div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--chat-surface)', border: '1px solid var(--chat-border)', borderRadius: 8, padding: '8px 14px' }}>
                      {job.pages.map((page, i) => (
                        <div key={`${page.url}-${i}`} className="small" style={{ lineHeight: 1.9, color: 'var(--chat-muted)' }}>
                          <span style={{ color: 'var(--chat-accent)', marginRight: 6 }}>{i + 1}.</span>
                          <span style={{ color: 'var(--chat-text)' }}>{page.title}</span>
                          <span style={{ opacity: 0.45, marginLeft: 6, fontSize: 11 }}>{page.url}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="small fw-semibold mb-1" style={{ color: 'var(--chat-text-heading)' }}>Log</div>
                <div ref={logRef} style={{ maxHeight: 220, overflowY: 'auto', background: '#0b0b0e', border: '1px solid var(--chat-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#86efac', whiteSpace: 'pre-wrap' }}>
                  {(job.log || []).map((line, i) => <div key={`${line}-${i}`}>{line}</div>)}
                  {job.status === 'running' && <div style={{ opacity: 0.4 }}>... crawling ...</div>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab: Conversational */}
        {activeTab === 'conversational' && (
          <form onSubmit={handleConversationalSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <p className="small text-muted mb-3">Append an instruction or a Q&A pair. Appends to <strong>scraped_website.jsonl</strong> only if not already present.</p>
            <div className="mb-3">
              <label className="form-label small">Single instruction (e.g. &quot;We do not provide template websites.&quot;)</label>
              <textarea className="form-control" rows={2} value={convText} onChange={(e) => setConvText(e.target.value)} placeholder="Optional: one instruction" style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }} />
            </div>
            <div className="mb-3">
              <label className="form-label small">Or Q&A — User message</label>
              <input type="text" className="form-control mb-2" value={convUser} onChange={(e) => setConvUser(e.target.value)} placeholder="User question" style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }} />
              <label className="form-label small">Assistant response</label>
              <textarea className="form-control" rows={2} value={convAssistant} onChange={(e) => setConvAssistant(e.target.value)} placeholder="How AI should respond" style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={convSaving || (!convText.trim() && !convUser.trim() && !convAssistant.trim())}>
              {convSaving ? 'Saving...' : 'Append to training'}
            </button>
          </form>
        )}

        {/* Tab: Documents */}
        {activeTab === 'documents' && (
          <form onSubmit={handleDocumentsSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <p className="small text-muted mb-3">
              Upload PDF, DOCX, TXT/Markdown, or <strong>database text</strong> dumps (
              <code>.sql</code>, <code>.ddl</code>, Prisma, etc. — see <strong>Database / SQL</strong> tab for paste + notes). Content is appended to{' '}
              <strong>scraped_website.jsonl</strong> only if not already present. <strong>Binary SQLite</strong> <code>.db</code> files are not supported here — export schema to <code>.sql</code> first.
            </p>
            <div className="mb-3">
              <input
                id="training-doc-input"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.sql,.ddl,.mysql,.pgsql,.prisma,.graphql,.cql,.hql,.tsql"
                multiple
                className="form-control"
                onChange={(e) => setDocFiles(e.target.files)}
                style={{ background: 'var(--chat-bg)', borderColor: 'var(--chat-border)' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={docSaving || !docFiles?.length}>
              {docSaving ? 'Saving...' : `Save ${docFiles?.length || 0} file(s)`}
            </button>
          </form>
        )}

        {/* Tab: Database / SQL */}
        {activeTab === 'database' && (
          <form onSubmit={handleDatabaseSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <p className="small text-muted mb-3">
              Teach the bot your <strong>schema and data rules</strong> (DDL, <code>CREATE TABLE</code>, sample row descriptions, business terms). Stored as dedicated{' '}
              <strong>database knowledge</strong> in <code>scraped_website.jsonl</code> (deduped). Do <strong>not</strong> paste live credentials or connection strings.
            </p>
            <div className="mb-3">
              <label className="form-label small">Label (optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. CRM schema v2"
                value={dbTitle}
                onChange={(e) => setDbTitle(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">Schema / SQL / notes</label>
              <textarea
                className="form-control font-monospace"
                rows={12}
                placeholder={'-- Example:\nCREATE TABLE orders (\n  id UUID PRIMARY KEY,\n  status TEXT\n);\n-- Or describe tables and columns in plain English.'}
                value={dbContent}
                onChange={(e) => setDbContent(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)', fontSize: 13 }}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">Or upload file(s)</label>
              <input
                id="training-db-files"
                type="file"
                accept=".sql,.ddl,.mysql,.pgsql,.sqlite,.db,.txt,.md,.prisma,.graphql,.cql,.hql,.tsql"
                multiple
                className="form-control"
                onChange={(e) => setDbFiles(e.target.files)}
                style={{ background: 'var(--chat-bg)', borderColor: 'var(--chat-border)' }}
              />
              <div className="form-text" style={{ color: 'var(--chat-muted)', fontSize: 12 }}>
                Text SQL and DDL supported. Binary SQLite (<code>.db</code>) must be exported to <code>.sql</code> first (e.g. <code>sqlite3 app.db &quot;.schema&quot; &gt; schema.sql</code>).
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={dbSaving || (!dbContent.trim() && !dbFiles?.length)}>
              {dbSaving ? 'Saving...' : 'Append database knowledge'}
            </button>
          </form>
        )}

        {/* Tab: Media */}
        {activeTab === 'media' && (
          <form onSubmit={handleMediaSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <p className="small text-muted mb-3">
              Upload images, audio, or video. Optionally add caption/transcript text so AI can use media context in answers.
            </p>
            <div className="mb-3">
              <label className="form-label small">Media files</label>
              <input
                id="training-media-input"
                type="file"
                accept="image/*,audio/*,video/*"
                multiple
                className="form-control"
                onChange={(e) => handleMediaFileChange(e.target.files)}
                style={{ background: 'var(--chat-bg)', borderColor: 'var(--chat-border)' }}
                disabled={mediaSaving || mediaTranscribing}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">Auto transcript preview</label>
              <textarea
                className="form-control"
                rows={4}
                value={mediaTranscript}
                onChange={(e) => setMediaTranscript(e.target.value)}
                placeholder={mediaTranscribing ? 'Transcribing media files...' : 'Transcript will be generated automatically'}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                disabled={mediaTranscribing}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">Generated JSONL entries</label>
              <textarea
                className="form-control font-monospace"
                rows={8}
                value={mediaJsonl}
                onChange={(e) => setMediaJsonl(e.target.value)}
                placeholder={mediaTranscribing ? 'Generating JSONL...' : 'JSONL entries will appear after transcription'}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)', fontSize: 12 }}
                disabled={mediaTranscribing}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={mediaSaving || mediaTranscribing || !mediaFiles?.length || !mediaJsonl.trim()}>
              {mediaTranscribing ? 'Transcribing...' : mediaSaving ? 'Saving...' : `Save ${mediaFiles?.length || 0} media file(s)`}
            </button>
          </form>
        )}

        {/* Tab: Structured */}
        {activeTab === 'structured' && (
          <form onSubmit={handleStructuredSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <p className="small text-muted mb-3">Paste a JSON array of objects, or upload CSV/Excel. Data is appended to <strong>scraped_website.jsonl</strong> only if not already present.</p>
            <div className="mb-3">
              <label className="form-label small">JSON array (e.g. products, services)</label>
              <textarea className="form-control font-monospace" rows={6} value={structuredJson} onChange={(e) => setStructuredJson(e.target.value)} placeholder='[{"name":"Service A","price":"..."}, ...]' style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)', fontSize: 13 }} />
            </div>
            <div className="mb-3">
              <label className="form-label small">Or upload CSV / Excel file</label>
              <input id="training-structured-file" type="file" accept=".csv,.xlsx,.xls,.json" className="form-control" onChange={(e) => setStructuredFile(e.target.files?.[0] || null)} style={{ background: 'var(--chat-bg)', borderColor: 'var(--chat-border)' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={structuredSaving}>
              {structuredSaving ? 'Saving...' : 'Append to training'}
            </button>
          </form>
        )}

        {/* Tab: Manual */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="rounded-3 p-3 p-md-4 mb-4" style={{ background: 'var(--chat-surface)', border: '1px solid var(--chat-border)' }}>
            <p className="small text-muted mb-3">FAQs, policies, business description. Stored in <strong>scraped_website.jsonl</strong> (manual section); replaces previous manual knowledge.</p>
            {manualLoading ? <div className="text-muted small">Loading...</div> : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label small mb-0" style={{ color: 'var(--chat-muted)' }}>
                    Manual knowledge text
                  </label>
                  <div className="d-flex align-items-center gap-2">
                    <span className="small" style={{ color: manualRecording ? 'var(--chat-accent)' : 'var(--chat-muted)' }}>
                      {manualRecording ? 'Recording...' : 'Use mic'}
                    </span>
                    <button
                      type="button"
                      onClick={handleManualMicClick}
                      aria-label={manualRecording ? 'Stop voice input' : 'Start voice input'}
                      disabled={manualSaving}
                      title={manualRecording ? 'Stop voice input' : 'Start voice input'}
                      style={manualMicButtonStyle}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="8" y1="22" x2="16" y2="22" />
                      </svg>
                    </button>
                  </div>
                </div>
                <textarea className="form-control mb-3" rows={12} value={manualContent} onChange={(e) => setManualContent(e.target.value)} placeholder="Enter FAQs, policies, instructions..." style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }} />
                <button type="submit" className="btn btn-primary" disabled={manualSaving}>{manualSaving ? 'Saving...' : 'Save manual knowledge'}</button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
