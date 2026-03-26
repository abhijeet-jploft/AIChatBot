import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { hasPermission } from '../lib/permissions';

const STATUS_BADGE = {
  pending:   { cls: 'sa-badge-cold', label: 'PENDING' },
  running:   { cls: 'sa-badge-warn', label: 'RUNNING' },
  completed: { cls: 'sa-badge-ok',   label: 'DONE' },
  failed:    { cls: 'sa-badge-hot',  label: 'FAILED' },
};

/** Scrape / transcribe / large uploads can run a long time — avoid client/proxy aborting early. */
const TRAINING_LONG_FETCH_MS = 30 * 60 * 1000;
const SCRAPE_POLL_INTERVAL_MS = 2500;

function scrapeJobStorageKey(companyId) {
  return `sa-training-scrape-job:${companyId}`;
}

function trainingFetchErrorMessage(err) {
  if (err && typeof err === 'object' && err.name === 'AbortError') {
    return 'Request timed out. If a scrape or upload was still running, check the server or try again with a smaller job.';
  }
  return err?.message || 'Network error.';
}

const TABS = [
  { id: 'scrape', label: 'Website scraping', permission: 'training_scrape' },
  { id: 'conversational', label: 'Conversational', permission: 'training_conversational' },
  { id: 'documents', label: 'Documents', permission: 'training_documents' },
  { id: 'database', label: 'Database / SQL', permission: 'training_database' },
  { id: 'media', label: 'Media training', permission: 'training_media' },
  { id: 'structured', label: 'Structured (CSV / Excel)', permission: 'training_structured' },
  { id: 'manual', label: 'Manual knowledge', permission: 'training_manual' },
];

export default function Training() {
  const { companyId } = useParams();
  const { saFetch, admin } = useSuperAuth();
  const { showToast } = useSuperToast();
  const canViewTab = useCallback((permissionKey) => (
    hasPermission(admin, 'ai_configuration', 'view') || hasPermission(admin, permissionKey, 'view')
  ), [admin]);
  const canEditTab = useCallback((permissionKey) => (
    hasPermission(admin, 'ai_configuration', 'edit') || hasPermission(admin, permissionKey, 'edit')
  ), [admin]);
  const availableTabs = TABS.filter((tab) => canViewTab(tab.permission));
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.id || 'scrape');

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

  // Database / SQL
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

  // Structured
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

  // Auto-scroll scrape log
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
    if (!companyId || jobId) return;
    const loadActiveJob = async () => {
      try {
        const res = await saFetch(`/training/${companyId}/scrape/active`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.jobId) {
          setJobId(data.jobId);
          setJob(data);
        }
      } catch {
        /* ignore */
      }
    };
    loadActiveJob();
  }, [companyId, jobId, saFetch]);

  // Warn before closing the tab while a scrape is active (prevents accidental full refresh).
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

  // Cleanup voice recognition on unmount
  useEffect(() => () => {
    try {
      manualShouldBeRecordingRef.current = false;
      manualRecognitionRef.current?.stop?.();
    } catch { /* ignore */ }
  }, []);

  // Scrape polling
  useEffect(() => {
    if (!jobId) return undefined;
    const poll = async () => {
      try {
        const res = await saFetch(`/training/${companyId}/scrape/status/${jobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            const activeRes = await saFetch(`/training/${companyId}/scrape/active`);
            if (activeRes.ok) {
              const activeData = await activeRes.json();
              if (activeData?.jobId) {
                if (activeData.jobId !== jobId) setJobId(activeData.jobId);
                setJob(activeData);
                return;
              }
            }
            clearInterval(pollRef.current);
            setJob((current) => ({
              ...(current || {}),
              status: 'failed',
              error: 'Scrape job was lost (server restarted). Start again to continue.',
            }));
            setJobId(null);
          }
          return;
        }
        const data = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') clearInterval(pollRef.current);
      } catch { /* ignore */ }
    };
    poll();
    pollRef.current = setInterval(poll, SCRAPE_POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [jobId, companyId, saFetch]);

  const loadManual = async () => {
    setManualLoading(true);
    try {
      const res = await saFetch(`/training/${companyId}/manual`);
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
      const res = await saFetch(`/training/${companyId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data) ? data : (data.files || []));
      }
    } catch { /* ignore */ }
  }, [saFetch, companyId]);

  useEffect(() => {
    if (activeTab === 'manual') loadManual();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id || 'scrape');
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const hasScrapedTrainingFile = files.some((file) => file?.name === 'scraped_website.jsonl');
  const canSaveScrapedPages = (job?.pages?.length || 0) > 0 && job?.status !== 'failed';
  const scrapeSaveLabel = hasScrapedTrainingFile
    ? (job?.status === 'completed' ? 'Append scraped pages to scraped_website.jsonl' : 'Append pages scraped so far to scraped_website.jsonl')
    : (job?.status === 'completed' ? 'Create scraped_website.jsonl from scraped pages' : 'Create scraped_website.jsonl from pages scraped so far');

  // ─── Scrape ───────────────────────────────────────────────────────────────
  const handleScrapeSubmit = async (e) => {
    e.preventDefault();
    setJob(null);
    setJobId(null);
    setSubmitting(true);
    try {
      const res = await saFetch(`/training/${companyId}/scrape/start`, {
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
      const res = await saFetch(`/training/${companyId}/scrape/save/${jobId}`, {
        method: 'POST',
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        const linesAppended = data.linesAppended ?? data.savedLines ?? data.lines ?? 0;
        const linesSkipped = data.linesSkipped ?? 0;
        showToast(
          `Appended ${linesAppended} lines to scraped_website.jsonl${linesSkipped ? ` (${linesSkipped} already present)` : ''}. ${data.links ?? 0} links saved.`,
          'success'
        );
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
      const res = await saFetch(`/training/${companyId}/conversational`, {
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
    if (!docFiles?.length) { showToast('Select at least one file (PDF, DOCX, TXT, or SQL/DDL).', 'error'); return; }
    setDocSaving(true);
    try {
      const form = new FormData();
      Array.from(docFiles).forEach((f) => form.append('files', f));
      const res = await saFetch(`/training/${companyId}/documents`, {
        method: 'POST',
        body: form,
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        showToast(`Saved ${data.files?.length || data.results?.length || 0} document(s).`, 'success');
        setDocFiles(null);
        document.getElementById('sa-doc-input')?.form?.reset();
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
    if (!dbContent.trim() && !dbFiles?.length) { showToast('Paste schema/SQL text or choose file(s).', 'error'); return; }
    setDbSaving(true);
    try {
      const form = new FormData();
      if (dbTitle.trim()) form.append('title', dbTitle.trim());
      if (dbContent.trim()) form.append('content', dbContent.trim());
      if (dbFiles?.length) Array.from(dbFiles).forEach((f) => form.append('files', f));
      const res = await saFetch(`/training/${companyId}/database`, {
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
        setDbContent('');
        setDbTitle('');
        setDbFiles(null);
        document.getElementById('sa-db-files')?.form?.reset();
        loadFiles();
      } else showToast(data.error || 'Save failed.', 'error');
    } catch (err) {
      showToast(trainingFetchErrorMessage(err), 'error');
    } finally {
      setDbSaving(false);
    }
  };

  // ─── Media ────────────────────────────────────────────────────────────────
  const handleMediaSubmit = async (e) => {
    e.preventDefault();
    if (!mediaFiles?.length) { showToast('Select at least one media file (image/audio/video).', 'error'); return; }
    if (!mediaJsonl.trim()) { showToast('Wait for transcription to complete before saving.', 'error'); return; }
    setMediaSaving(true);
    try {
      const form = new FormData();
      Array.from(mediaFiles).forEach((f) => form.append('files', f));
      form.append('transcript', mediaTranscript.trim());
      form.append('jsonlContent', mediaJsonl.trim());
      const res = await saFetch(`/training/${companyId}/media`, {
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
        document.getElementById('sa-media-input')?.form?.reset();
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
      const res = await saFetch(`/training/${companyId}/media/transcribe`, {
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
    if (structuredFile) {
      setStructuredSaving(true);
      const form = new FormData();
      form.append('file', structuredFile);
      try {
        const res = await saFetch(`/training/${companyId}/structured/upload`, {
          method: 'POST',
          body: form,
          timeoutMs: TRAINING_LONG_FETCH_MS,
        });
        const data = await res.json();
        if (data.saved) {
          showToast(`Appended ${data.count} row(s).`, 'success');
          setStructuredFile(null);
          const el = document.getElementById('sa-structured-file');
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
    let rows = [];
    if (structuredJson.trim()) {
      try {
        rows = JSON.parse(structuredJson);
        if (!Array.isArray(rows)) rows = [rows];
      } catch {
        showToast('Invalid JSON. Use an array of objects.', 'error');
        return;
      }
    }
    if (!rows.length) { showToast('Paste JSON array or upload CSV/Excel.', 'error'); return; }
    setStructuredSaving(true);
    try {
      const res = await saFetch(`/training/${companyId}/structured`, {
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

  // ─── Manual ───────────────────────────────────────────────────────────────
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setManualSaving(true);
    try {
      const res = await saFetch(`/training/${companyId}/manual`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualContent }),
        timeoutMs: TRAINING_LONG_FETCH_MS,
      });
      const data = await res.json();
      if (data.saved || data.ok) {
        showToast('Manual knowledge saved.', 'success');
        loadFiles();
      } else showToast('Save failed.', 'error');
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
        if (result.isFinal && result[0]?.transcript) finalTranscript += result[0].transcript;
      }
      if (finalTranscript.trim()) {
        setManualContent((prev) => prev ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim());
      }
    };
    recognition.onend = () => {
      if (manualShouldBeRecordingRef.current) {
        try { recognition.start(); } catch { /* ignore restart errors */ }
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
      try { manualRecognitionRef.current?.stop?.(); } catch { /* ignore */ }
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

  return (
    <div className="sa-page">
      {/* Header */}
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}`} className="sa-breadcrumb">← Back to {companyId}</Link>
          <h2 className="sa-page-title">Training — Knowledge base</h2>
        </div>
      </div>
      <p style={{ color: 'var(--sa-text-muted)', fontSize: 13, marginTop: -10 }}>
        All training methods use a single file:{' '}
        <strong style={{ color: 'var(--sa-text)' }}>scraped_website.jsonl</strong>. Data is appended
        only if not already present. Website scraping also writes{' '}
        <strong style={{ color: 'var(--sa-text)' }}>scraped_website_links.txt</strong> for page links.
      </p>

      {/* Saved files summary */}
      {files.length > 0 && (
        <div className="sa-panel sa-panel-compact">
          <strong style={{ color: 'var(--sa-text-heading)', fontSize: 13 }}>Saved files ({companyId})</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--sa-text-muted)', fontSize: 13 }}>
            {files.map((f, i) => (
              <li key={i}>
                {f.name || f.filename || f}
                {f.size ? ` (${Math.round(f.size / 1024)} KB)` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="sa-tabs" style={{ flexWrap: 'wrap' }}>
        {availableTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sa-tab ${activeTab === t.id ? 'sa-tab-active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Website scraping ─────────────────────────────────────────────── */}
      {activeTab === 'scrape' && canViewTab('training_scrape') && (
        <>
          <div className="sa-panel">
            <form onSubmit={handleScrapeSubmit}>
              <div className="sa-field">
                <label>
                  Website URL <span style={{ color: 'var(--sa-danger)' }}>*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={isScrapeRunning}
                />
              </div>
              <button
                type="submit"
                className="sa-btn sa-btn-primary"
                  disabled={!canEditTab('training_scrape') || !url.trim() || isScrapeRunning}
              >
                {isScrapeRunning
                  ? (job?.status === 'running'
                    ? `Scraping — ${job.pages?.length || 0} pages...`
                    : 'Starting...')
                  : 'Start scraping'}
              </button>
            </form>
          </div>

          {job && (
            <div className="sa-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <span className={`sa-badge ${STATUS_BADGE[job.status]?.cls || 'sa-badge-cold'}`}>
                  {(STATUS_BADGE[job.status]?.label || job.status).toUpperCase()}
                </span>
                <span style={{ color: 'var(--sa-text-muted)', fontSize: 13 }}>
                  {job.pages?.length || 0} pages | {job.jsonlLines || 0} JSONL lines
                </span>
              </div>
              {canSaveScrapedPages && (
                <div style={{ marginBottom: 14 }}>
                  <button type="button" className="sa-btn sa-btn-success sa-btn-sm" onClick={handleScrapeSave} disabled={!canEditTab('training_scrape')}>
                    {scrapeSaveLabel}
                  </button>
                  <div style={{ marginTop: 8, color: 'var(--sa-text-muted)', fontSize: 12 }}>
                    Uses {job.status === 'completed' ? 'the completed scrape job' : 'pages already scraped so far'} to {hasScrapedTrainingFile ? 'append only new' : 'create'} entries in <strong style={{ color: 'var(--sa-text)' }}>scraped_website.jsonl</strong>.
                  </div>
                </div>
              )}
              {job.pages?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text-heading)', marginBottom: 6 }}>
                    Pages ({job.pages.length})
                  </div>
                  <div style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--sa-bg)', border: '1px solid var(--sa-border)', borderRadius: 8, padding: '8px 14px' }}>
                    {job.pages.map((page, i) => (
                      <div key={`${page.url}-${i}`} style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--sa-text-muted)' }}>
                        <span style={{ color: 'var(--sa-accent)', marginRight: 6 }}>{i + 1}.</span>
                        <span style={{ color: 'var(--sa-text)' }}>{page.title}</span>
                        <span style={{ opacity: 0.45, marginLeft: 6, fontSize: 11 }}>{page.url}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text-heading)', marginBottom: 6 }}>Log</div>
              <div
                ref={logRef}
                style={{ maxHeight: 220, overflowY: 'auto', background: '#0b0b0e', border: '1px solid var(--sa-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#86efac', whiteSpace: 'pre-wrap' }}
              >
                {(job.log || []).map((line, i) => <div key={`${line}-${i}`}>{line}</div>)}
                {job.status === 'running' && <div style={{ opacity: 0.4 }}>... crawling ...</div>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Conversational ───────────────────────────────────────────────── */}
      {activeTab === 'conversational' && canViewTab('training_conversational') && (
        <div className="sa-panel">
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', marginBottom: 14 }}>
            Append an instruction or a Q&amp;A pair. Appends to{' '}
            <strong style={{ color: 'var(--sa-text)' }}>scraped_website.jsonl</strong> only if not already present.
          </p>
          <form onSubmit={handleConversationalSubmit}>
            <div className="sa-field">
              <label>Single instruction (e.g. &quot;We do not provide template websites.&quot;)</label>
              <textarea
                className="sa-textarea"
                rows={2}
                value={convText}
                onChange={(e) => setConvText(e.target.value)}
                placeholder="Optional: one instruction"
              />
            </div>
            <div className="sa-field">
              <label>Or Q&amp;A — User message</label>
              <input
                type="text"
                value={convUser}
                onChange={(e) => setConvUser(e.target.value)}
                placeholder="User question"
                style={{ marginBottom: 8 }}
              />
              <label>Assistant response</label>
              <textarea
                className="sa-textarea"
                rows={2}
                value={convAssistant}
                onChange={(e) => setConvAssistant(e.target.value)}
                placeholder="How AI should respond"
              />
            </div>
            <button
              type="submit"
              className="sa-btn sa-btn-primary"
              disabled={!canEditTab('training_conversational') || convSaving || (!convText.trim() && !convUser.trim() && !convAssistant.trim())}
            >
              {convSaving ? 'Saving...' : 'Append to training'}
            </button>
          </form>
        </div>
      )}

      {/* ─── Documents ────────────────────────────────────────────────────── */}
      {activeTab === 'documents' && canViewTab('training_documents') && (
        <div className="sa-panel">
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', marginBottom: 14 }}>
            Upload PDF, DOCX, TXT/Markdown, or{' '}
            <strong style={{ color: 'var(--sa-text)' }}>database text</strong> dumps (
            <code>.sql</code>, <code>.ddl</code>, Prisma, etc. — see{' '}
            <strong style={{ color: 'var(--sa-text)' }}>Database / SQL</strong> tab for paste + notes).
            Content is appended to{' '}
            <strong style={{ color: 'var(--sa-text)' }}>scraped_website.jsonl</strong> only if not already present.
            <strong style={{ color: 'var(--sa-text)' }}> Binary SQLite</strong> <code>.db</code> files are not
            supported here — export schema to <code>.sql</code> first.
          </p>
          <form onSubmit={handleDocumentsSubmit}>
            <div className="sa-field">
              <input
                id="sa-doc-input"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.sql,.ddl,.mysql,.pgsql,.prisma,.graphql,.cql,.hql,.tsql"
                multiple
                onChange={(e) => setDocFiles(e.target.files)}
              />
            </div>
            <button type="submit" className="sa-btn sa-btn-primary" disabled={!canEditTab('training_documents') || docSaving || !docFiles?.length}>
              {docSaving ? 'Saving...' : `Save ${docFiles?.length || 0} file(s)`}
            </button>
          </form>
        </div>
      )}

      {/* ─── Database / SQL ───────────────────────────────────────────────── */}
      {activeTab === 'database' && canViewTab('training_database') && (
        <div className="sa-panel">
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', marginBottom: 14 }}>
            Teach the bot the{' '}
            <strong style={{ color: 'var(--sa-text)' }}>schema and data rules</strong> (DDL,{' '}
            <code>CREATE TABLE</code>, sample row descriptions, business terms). Stored as dedicated{' '}
            <strong style={{ color: 'var(--sa-text)' }}>database knowledge</strong> in{' '}
            <code>scraped_website.jsonl</code> (deduped). Do{' '}
            <strong style={{ color: 'var(--sa-text)' }}>not</strong> paste live credentials or connection strings.
          </p>
          <form onSubmit={handleDatabaseSubmit}>
            <div className="sa-field">
              <label>Label (optional)</label>
              <input
                type="text"
                placeholder="e.g. CRM schema v2"
                value={dbTitle}
                onChange={(e) => setDbTitle(e.target.value)}
              />
            </div>
            <div className="sa-field">
              <label>Schema / SQL / notes</label>
              <textarea
                className="sa-textarea sa-textarea-code"
                rows={12}
                placeholder={'-- Example:\nCREATE TABLE orders (\n  id UUID PRIMARY KEY,\n  status TEXT\n);\n-- Or describe tables and columns in plain English.'}
                value={dbContent}
                onChange={(e) => setDbContent(e.target.value)}
              />
            </div>
            <div className="sa-field">
              <label>Or upload file(s)</label>
              <input
                id="sa-db-files"
                type="file"
                accept=".sql,.ddl,.mysql,.pgsql,.sqlite,.db,.txt,.md,.prisma,.graphql,.cql,.hql,.tsql"
                multiple
                onChange={(e) => setDbFiles(e.target.files)}
              />
              <small style={{ color: 'var(--sa-text-muted)', fontSize: 12, display: 'block', marginTop: 4 }}>
                Text SQL and DDL supported. Binary SQLite (<code>.db</code>) must be exported to{' '}
                <code>.sql</code> first (e.g. <code>sqlite3 app.db &quot;.schema&quot; &gt; schema.sql</code>).
              </small>
            </div>
            <button
              type="submit"
              className="sa-btn sa-btn-primary"
              disabled={!canEditTab('training_database') || dbSaving || (!dbContent.trim() && !dbFiles?.length)}
            >
              {dbSaving ? 'Saving...' : 'Append database knowledge'}
            </button>
          </form>
        </div>
      )}

      {/* ─── Media training ───────────────────────────────────────────────── */}
      {activeTab === 'media' && canViewTab('training_media') && (
        <div className="sa-panel">
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', marginBottom: 14 }}>
            Upload images, audio, or video. Optionally add caption/transcript text so AI can use
            media context in answers.
          </p>
          <form onSubmit={handleMediaSubmit}>
            <div className="sa-field">
              <label>Media files</label>
              <input
                id="sa-media-input"
                type="file"
                accept="image/*,audio/*,video/*"
                multiple
                onChange={(e) => handleMediaFileChange(e.target.files)}
                disabled={!canEditTab('training_media') || mediaSaving || mediaTranscribing}
              />
            </div>
            <div className="sa-field">
              <label>Auto transcript preview</label>
              <textarea
                className="sa-textarea"
                rows={4}
                value={mediaTranscript}
                onChange={(e) => setMediaTranscript(e.target.value)}
                placeholder={mediaTranscribing ? 'Transcribing media files...' : 'Transcript will be generated automatically'}
                disabled={mediaTranscribing}
              />
            </div>
            <div className="sa-field">
              <label>Generated JSONL entries</label>
              <textarea
                className="sa-textarea sa-textarea-code"
                rows={8}
                value={mediaJsonl}
                onChange={(e) => setMediaJsonl(e.target.value)}
                placeholder={mediaTranscribing ? 'Generating JSONL...' : 'JSONL entries will appear after transcription'}
                disabled={mediaTranscribing}
              />
            </div>
            <button
              type="submit"
              className="sa-btn sa-btn-primary"
              disabled={!canEditTab('training_media') || mediaSaving || mediaTranscribing || !mediaFiles?.length || !mediaJsonl.trim()}
            >
              {mediaTranscribing ? 'Transcribing...' : mediaSaving ? 'Saving...' : `Save ${mediaFiles?.length || 0} media file(s)`}
            </button>
          </form>
        </div>
      )}

      {/* ─── Structured ───────────────────────────────────────────────────── */}
      {activeTab === 'structured' && canViewTab('training_structured') && (
        <div className="sa-panel">
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', marginBottom: 14 }}>
            Paste a JSON array of objects, or upload CSV/Excel. Data is appended to{' '}
            <strong style={{ color: 'var(--sa-text)' }}>scraped_website.jsonl</strong> only if not already present.
          </p>
          <form onSubmit={handleStructuredSubmit}>
            <div className="sa-field">
              <label>JSON array (e.g. products, services)</label>
              <textarea
                className="sa-textarea sa-textarea-code"
                rows={6}
                value={structuredJson}
                onChange={(e) => setStructuredJson(e.target.value)}
                placeholder='[{"name":"Service A","price":"..."}, ...]'
              />
            </div>
            <div className="sa-field">
              <label>Or upload CSV / Excel file</label>
              <input
                id="sa-structured-file"
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={(e) => setStructuredFile(e.target.files?.[0] || null)}
              />
            </div>
            <button type="submit" className="sa-btn sa-btn-primary" disabled={!canEditTab('training_structured') || structuredSaving}>
              {structuredSaving ? 'Saving...' : 'Append to training'}
            </button>
          </form>
        </div>
      )}

      {/* ─── Manual knowledge ─────────────────────────────────────────────── */}
      {activeTab === 'manual' && canViewTab('training_manual') && (
        <div className="sa-panel">
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', marginBottom: 14 }}>
            FAQs, policies, business description. Stored in{' '}
            <strong style={{ color: 'var(--sa-text)' }}>scraped_website.jsonl</strong> (manual section);
            replaces previous manual knowledge.
          </p>
          {manualLoading ? (
            <div style={{ color: 'var(--sa-text-muted)', fontSize: 13 }}>Loading...</div>
          ) : (
            <form onSubmit={handleManualSubmit}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                  Manual knowledge text
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: manualRecording ? 'var(--sa-accent)' : 'var(--sa-text-muted)' }}>
                    {manualRecording ? 'Recording...' : 'Use mic'}
                  </span>
                  <button
                    type="button"
                    onClick={handleManualMicClick}
                    disabled={!canEditTab('training_manual') || manualSaving}
                    title={manualRecording ? 'Stop voice input' : 'Start voice input'}
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${manualRecording ? 'var(--sa-accent)' : 'var(--sa-border)'}`,
                      background: manualRecording ? 'rgba(108,99,255,0.16)' : 'var(--sa-bg)',
                      color: manualRecording ? 'var(--sa-accent)' : 'var(--sa-text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                      <line x1="8" y1="22" x2="16" y2="22" />
                    </svg>
                  </button>
                </div>
              </div>
              <textarea
                className="sa-textarea"
                rows={12}
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
                placeholder="Enter FAQs, policies, instructions..."
                style={{ marginBottom: 12 }}
              />
              <button type="submit" className="sa-btn sa-btn-primary" disabled={manualSaving}>
                {manualSaving ? 'Saving...' : 'Save manual knowledge'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
