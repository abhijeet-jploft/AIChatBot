import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import {
  clampFromNotAfterTo,
  clampToNotBeforeFrom,
  nextToAfterFromChange,
} from '../../utils/dateRangeFields';

async function toggleElementFullscreen(element) {
  if (!element) return false;

  if (document.fullscreenElement === element) {
    await document.exitFullscreen();
    return true;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }

  if (typeof element.requestFullscreen !== 'function') {
    return false;
  }

  await element.requestFullscreen();
  return true;
}

const STATUS_OPTIONS = [
  'new',
  'contacted',
  'in_discussion',
  'proposal_sent',
  'converted',
  'lost',
  'follow_up_required',
];

const SCORE_OPTIONS = ['cold', 'warm', 'hot', 'very_hot'];

const REMINDER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'due_today', label: 'Due Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'none', label: 'No Reminder' },
];

function humanize(value = '') {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function formatDateTimeInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const LEADS_PAGE_SIZE = 20;
const PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

function buildQuery(filters = {}) {
  const params = new URLSearchParams();

  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.scoreCategory && filters.scoreCategory !== 'all') params.set('scoreCategory', filters.scoreCategory);
  if (filters.reminderState && filters.reminderState !== 'all') params.set('reminderState', filters.reminderState);
  if (filters.search) params.set('search', filters.search);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (filters.sort) params.set('sort', filters.sort);
  const limit = Number(filters.limit) || LEADS_PAGE_SIZE;
  const page = Math.max(1, Number(filters.page) || 1);
  params.set('limit', String(limit));
  params.set('offset', String((page - 1) * limit));

  return params.toString();
}

function parseFilename(contentDisposition, fallbackName) {
  if (!contentDisposition) return fallbackName;
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallbackName;
}

function TranscriptExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export default function Leads() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const { leadId: leadIdFromUrl } = useParams();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    status: 'all',
    scoreCategory: 'all',
    reminderState: 'all',
    search: '',
    fromDate: '',
    toDate: '',
    sort: 'newest',
    page: 1,
    limit: LEADS_PAGE_SIZE,
  });
  const [appliedFilters, setAppliedFilters] = useState({
    status: 'all',
    scoreCategory: 'all',
    reminderState: 'all',
    search: '',
    fromDate: '',
    toDate: '',
    sort: 'newest',
    page: 1,
    limit: LEADS_PAGE_SIZE,
  });

  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [activityText, setActivityText] = useState('');
  const [activityType, setActivityType] = useState('contact_attempt');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [unmarkingLeadId, setUnmarkingLeadId] = useState(null);
  const [ownerValue, setOwnerValue] = useState('');
  const [reminderAtValue, setReminderAtValue] = useState('');
  const [reminderNoteValue, setReminderNoteValue] = useState('');
  const [isTranscriptFullscreen, setIsTranscriptFullscreen] = useState(false);
  const transcriptPanelRef = useRef(null);

  const selectedLead = detail?.lead || null;
  const isDetailRoute = Boolean(leadIdFromUrl);

  const isAllSelected = useMemo(
    () => leads.length > 0 && leads.every((lead) => selectedIds.includes(lead.id)),
    [leads, selectedIds]
  );

  const loadLeads = useCallback(async (activeFilters = appliedFilters) => {
    setLoadingList(true);
    try {
      const query = buildQuery(activeFilters);
      const res = await authFetch(`/leads${query ? `?${query}` : ''}`);
      if (!res.ok) throw new Error('Failed to load leads');

      const data = await res.json();
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setLeads(rows);
      setTotal(Number(data?.total || 0));
      setSelectedIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)));

      if (!rows.length) {
        setSelectedLeadId(null);
        setDetail(null);
      } else if (
        !selectedLeadId ||
        (!rows.some((row) => row.id === selectedLeadId) && selectedLeadId !== leadIdFromUrl)
      ) {
        setSelectedLeadId(rows[0].id);
      }
    } catch {
      setLeads([]);
      setTotal(0);
      setSelectedLeadId(null);
      setDetail(null);
      showToast('Failed to load leads', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [appliedFilters, authFetch, selectedLeadId, leadIdFromUrl, showToast]);

  const loadLeadDetail = useCallback(async (leadId) => {
    if (!leadId) {
      setDetail(null);
      return;
    }

    setLoadingDetail(true);
    try {
      const res = await authFetch(`/leads/${leadId}`);
      if (!res.ok) throw new Error('Failed to load lead detail');

      const data = await res.json();
      setDetail(data || null);
    } catch {
      setDetail(null);
      showToast('Failed to load lead details', 'error');
    } finally {
      setLoadingDetail(false);
    }
  }, [authFetch, showToast]);

  const unmarkLeadContacted = useCallback((leadId) => {
    if (!leadId) return;
    if (!window.confirm('Are you sure you want to unmark as contacted? The lead will be set back to New.')) return;
    setUnmarkingLeadId(leadId);
    authFetch(`/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'new' }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        await loadLeads(appliedFilters);
        if (selectedLeadId === leadId) await loadLeadDetail(leadId);
        showToast('Lead unmarked as contacted', 'success');
      })
      .catch(() => showToast('Failed to unmark', 'error'))
      .finally(() => setUnmarkingLeadId(null));
  }, [authFetch, appliedFilters, loadLeads, loadLeadDetail, selectedLeadId, showToast]);

  useEffect(() => {
    if (leadIdFromUrl) {
      setSelectedLeadId(leadIdFromUrl);
    }
  }, [leadIdFromUrl]);

  useEffect(() => {
    loadLeads(appliedFilters);
  }, [appliedFilters, loadLeads]);

  useEffect(() => {
    loadLeadDetail(selectedLeadId);
  }, [selectedLeadId, loadLeadDetail]);

  useEffect(() => {
    setOwnerValue(selectedLead?.assigned_owner || '');
    setReminderAtValue(formatDateTimeInput(selectedLead?.reminder_at));
    setReminderNoteValue(selectedLead?.reminder_note || '');
  }, [selectedLead?.id, selectedLead?.assigned_owner, selectedLead?.reminder_at, selectedLead?.reminder_note]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTranscriptFullscreen(document.fullscreenElement === transcriptPanelRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!selectedLead?.id && document.fullscreenElement === transcriptPanelRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [selectedLead?.id]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters({ ...filters, search: filters.search.trim(), page: 1 });
  };

  const resetFilters = () => {
    const defaults = {
      status: 'all',
      scoreCategory: 'all',
      reminderState: 'all',
      search: '',
      fromDate: '',
      toDate: '',
      sort: 'newest',
      page: 1,
      limit: LEADS_PAGE_SIZE,
    };
    setFilters(defaults);
    setAppliedFilters(defaults);
  };

  const goToPage = (pageNum) => {
    const p = Math.max(1, Math.min(Math.ceil(total / (appliedFilters.limit || LEADS_PAGE_SIZE)), pageNum));
    setFilters((prev) => ({ ...prev, page: p }));
    setAppliedFilters((prev) => ({ ...prev, page: p }));
  };

  const handleTranscriptFullscreen = useCallback(async () => {
    const success = await toggleElementFullscreen(transcriptPanelRef.current);
    if (!success) {
      showToast('Fullscreen mode is not available in this browser.', 'error');
    }
  }, [showToast]);

  const totalPages = Math.max(1, Math.ceil(total / (appliedFilters.limit || LEADS_PAGE_SIZE)));
  const fromRow = total === 0 ? 0 : (appliedFilters.page - 1) * (appliedFilters.limit || LEADS_PAGE_SIZE) + 1;
  const toRow = Math.min(appliedFilters.page * (appliedFilters.limit || LEADS_PAGE_SIZE), total);

  const toggleSelectLead = (leadId) => {
    setSelectedIds((prev) => {
      if (prev.includes(leadId)) return prev.filter((id) => id !== leadId);
      return [...prev, leadId];
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((lead) => lead.id));
    }
  };

  const copyToClipboard = async (label, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      showToast(`${label} copied`, 'success');
    } catch {
      showToast(`Failed to copy ${label.toLowerCase()}`, 'error');
    }
  };

  const saveStatus = async () => {
    if (!selectedLead?.id || !selectedLead?.status) return;

    setSavingStatus(true);
    try {
      const res = await authFetch(`/leads/${selectedLead.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedLead.status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');

      setDetail((prev) => (prev ? { ...prev, lead: data.lead } : prev));
      await Promise.all([loadLeads(appliedFilters), loadLeadDetail(selectedLead.id)]);
      showToast('Lead status updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  const saveOwner = async () => {
    if (!selectedLead?.id) return;

    setSavingOwner(true);
    try {
      const res = await authFetch(`/leads/${selectedLead.id}/owner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: ownerValue.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update owner');

      setDetail((prev) => (prev ? { ...prev, lead: data.lead } : prev));
      await Promise.all([loadLeads(appliedFilters), loadLeadDetail(selectedLead.id)]);
      showToast('Owner updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update owner', 'error');
    } finally {
      setSavingOwner(false);
    }
  };

  const saveReminder = async () => {
    if (!selectedLead?.id) return;

    const reminderAtIso = reminderAtValue ? new Date(reminderAtValue).toISOString() : null;

    setSavingReminder(true);
    try {
      const res = await authFetch(`/leads/${selectedLead.id}/reminder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminderAt: reminderAtIso,
          note: reminderNoteValue.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update reminder');

      setDetail((prev) => (prev ? { ...prev, lead: data.lead } : prev));
      await Promise.all([loadLeads(appliedFilters), loadLeadDetail(selectedLead.id)]);
      showToast(reminderAtIso ? 'Reminder set' : 'Reminder cleared', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update reminder', 'error');
    } finally {
      setSavingReminder(false);
    }
  };

  const clearReminder = async () => {
    if (!selectedLead?.id) return;

    setSavingReminder(true);
    try {
      const res = await authFetch(`/leads/${selectedLead.id}/reminder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminderAt: null,
          note: reminderNoteValue.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear reminder');

      setDetail((prev) => (prev ? { ...prev, lead: data.lead } : prev));
      setReminderAtValue('');
      await Promise.all([loadLeads(appliedFilters), loadLeadDetail(selectedLead.id)]);
      showToast('Reminder cleared', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to clear reminder', 'error');
    } finally {
      setSavingReminder(false);
    }
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!selectedLead?.id || !text) return;

    setSavingNote(true);
    try {
      const res = await authFetch(`/leads/${selectedLead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save note');

      setNoteText('');
      setDetail((prev) => (prev ? { ...prev, lead: data.lead } : prev));
      await loadLeadDetail(selectedLead.id);
      showToast('Note added', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to add note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const addActivity = async () => {
    const text = activityText.trim();
    if (!selectedLead?.id || !text) return;

    setSavingActivity(true);
    try {
      const res = await authFetch(`/leads/${selectedLead.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activityType, details: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add activity');

      setActivityText('');
      setDetail((prev) => (prev ? { ...prev, activities: data.activities || prev.activities } : prev));
      showToast('Activity added', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to add activity', 'error');
    } finally {
      setSavingActivity(false);
    }
  };

  const downloadFromPath = async (path, fallbackName) => {
    const res = await authFetch(path);
    if (!res.ok) {
      let message = 'Download failed';
      try {
        const data = await res.json();
        message = data?.error || message;
      } catch {}
      throw new Error(message);
    }

    const blob = await res.blob();
    const contentDisposition = res.headers.get('Content-Disposition');
    const filename = parseFilename(contentDisposition, fallbackName);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    try {
      const query = buildQuery(appliedFilters);
      await downloadFromPath(`/leads/export.csv${query ? `?${query}` : ''}`, 'leads.csv');
      showToast('CSV exported', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to export CSV', 'error');
    }
  };

  const exportSelected = async () => {
    if (!selectedIds.length) {
      showToast('Select at least one lead', 'info');
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('ids', selectedIds.join(','));
      await downloadFromPath(`/leads/export.csv?${params.toString()}`, 'selected-leads.csv');
      showToast('Selected leads exported', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to export selected leads', 'error');
    }
  };

  const exportCurrentLead = async () => {
    if (!selectedLead?.id) return;
    try {
      await downloadFromPath(`/leads/export.csv?ids=${encodeURIComponent(selectedLead.id)}`, `lead-${selectedLead.id}.csv`);
      showToast('Lead exported', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to export lead', 'error');
    }
  };

  const downloadTranscript = async () => {
    if (!selectedLead?.id) return;
    try {
      await downloadFromPath(`/leads/${selectedLead.id}/transcript.txt`, `lead-${selectedLead.id}-transcript.txt`);
      showToast('Transcript downloaded', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download transcript', 'error');
    }
  };

  const deleteLead = async () => {
    if (!selectedLead?.id) return;
    const confirmed = window.confirm('Delete this lead permanently?');
    if (!confirmed) return;

    try {
      const res = await authFetch(`/leads/${selectedLead.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete lead');
      showToast('Lead deleted', 'success');
      setDetail(null);
      setSelectedLeadId(null);
      navigate('/admin/leads', { replace: true });
      await loadLeads(appliedFilters);
    } catch (err) {
      showToast(err.message || 'Failed to delete lead', 'error');
    }
  };

  const markConverted = async () => {
    if (!selectedLead?.id) return;
    setDetail((prev) => (prev ? { ...prev, lead: { ...prev.lead, status: 'converted' } } : prev));
    await saveStatus();
  };

  return (
    <div className="p-4" id="leads-top">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h5 className="mb-1" style={{ color: 'var(--chat-text-heading)' }}>{isDetailRoute ? 'Lead detail' : 'Leads'}</h5>
          <div className="small" style={{ color: 'var(--chat-muted)' }}>
            {isDetailRoute
              ? 'Complete lead view with transcript, status timeline and notes.'
              : `${total} lead${total === 1 ? '' : 's'} captured from chatbot conversations.`}
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {isDetailRoute ? (
            <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/admin/leads')}>
              Back to leads
            </button>
          ) : (
            <>
              <button className="btn btn-outline-primary btn-sm" onClick={exportAll}>Export CSV</button>
              <button className="btn btn-outline-primary btn-sm" onClick={exportSelected}>Export Selected</button>
            </>
          )}
        </div>
      </div>

      {!isDetailRoute && (
      <form onSubmit={applyFilters} className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-2">
              <label className="form-label small">Search</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Name, phone, email"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">Status</label>
              <select
                className="form-select form-select-sm"
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="all">All</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{humanize(status)}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Score</label>
              <select
                className="form-select form-select-sm"
                value={filters.scoreCategory}
                onChange={(e) => setFilters((prev) => ({ ...prev, scoreCategory: e.target.value }))}
              >
                <option value="all">All</option>
                {SCORE_OPTIONS.map((score) => (
                  <option key={score} value={score}>{humanize(score)}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Reminder</label>
              <select
                className="form-select form-select-sm"
                value={filters.reminderState}
                onChange={(e) => setFilters((prev) => ({ ...prev, reminderState: e.target.value }))}
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">From</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.fromDate}
                max={filters.toDate || undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilters((prev) => ({
                    ...prev,
                    fromDate: clampFromNotAfterTo(prev.toDate, v),
                    toDate: nextToAfterFromChange(v, prev.toDate),
                  }));
                }}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">To</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.toDate}
                min={filters.fromDate || undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilters((prev) => ({
                    ...prev,
                    toDate: clampToNotBeforeFrom(prev.fromDate, v),
                  }));
                }}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">Sort</label>
              <select
                className="form-select form-select-sm"
                value={filters.sort}
                onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value }))}
              >
                <option value="newest">Newest</option>
                <option value="highest_score">Top Score</option>
              </select>
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-primary btn-sm" type="submit">Apply Filters</button>
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={resetFilters}>Reset</button>
          </div>
        </div>
      </form>
      )}

      <div className="row g-3">
        {!isDetailRoute && (
        <div className="col-12">
          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="small text-muted">Lead list</div>
                <label className="small d-flex align-items-center gap-2" style={{ color: 'var(--chat-text)' }}>
                  <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} />
                  Select all
                </label>
              </div>

              {loadingList ? (
                <div className="small text-muted">Loading leads...</div>
              ) : !leads.length ? (
                <div className="small text-muted">No leads found for current filters.</div>
              ) : (
                <>
                <div className="table-responsive" style={{ maxHeight: 680 }}>
                  <table className="table table-sm table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
                    <thead style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)', position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th className="py-2" style={{ width: 34 }} />
                        <th className="py-2">Lead name</th>
                        <th className="py-2">Requirement summary</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Lead score</th>
                        <th className="py-2">Date received</th>
                        <th className="py-2">Contact method</th>
                      </tr>
                    </thead>
                    <tbody>
                        {leads.map((lead) => {
                        const selected = selectedLeadId === lead.id;
                        const overdue = Boolean(lead.reminder_overdue);
                        const dueToday = Boolean(lead.reminder_due_today);
                        const isContacted = (lead.status || '').toLowerCase() === 'contacted';
                        return (
                          <tr
                            key={lead.id}
                            style={{
                              background: selected ? 'var(--chat-sidebar)' : 'transparent',
                              borderLeft: selected ? '3px solid var(--chat-accent)' : (isContacted ? '3px solid var(--bs-success)' : undefined),
                            }}
                          >
                            <td className="align-middle" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(lead.id)}
                                onChange={() => toggleSelectLead(lead.id)}
                              />
                            </td>
                            <td className="align-middle">
                              <button
                                type="button"
                                className="btn btn-link p-0 fw-semibold text-start"
                                style={{ fontSize: 13, textDecoration: 'none' }}
                                onClick={() => {
                                  setSelectedLeadId(lead.id);
                                  navigate(`/admin/leads/${lead.id}`, { replace: true });
                                }}
                                title="Open lead details"
                              >
                                {lead.display_name || lead.name || lead.email || lead.phone || 'Unnamed lead'}
                              </button>
                            </td>
                            <td className="align-middle small">
                              <div className="text-truncate" style={{ maxWidth: 260 }} title={lead.requirement_summary || lead.project_summary || lead.service_requested || ''}>
                                {lead.requirement_summary || lead.project_summary || lead.service_requested || '-'}
                              </div>
                            </td>
                            <td className="align-middle">
                              <div className="d-flex flex-wrap gap-1">
                                {isContacted ? (
                                  <button
                                    type="button"
                                    className="badge bg-success border-0"
                                    style={{ cursor: 'pointer', fontSize: 'inherit' }}
                                    title="Click to unmark as contacted"
                                    disabled={unmarkingLeadId === lead.id}
                                    onClick={(e) => { e.stopPropagation(); unmarkLeadContacted(lead.id); }}
                                  >
                                    {unmarkingLeadId === lead.id ? '…' : humanize(lead.status)}
                                  </button>
                                ) : (
                                  <span className="badge text-bg-light border">{humanize(lead.status)}</span>
                                )}
                                {dueToday ? <span className="badge text-bg-warning">Today</span> : null}
                                {overdue ? <span className="badge text-bg-danger">Overdue</span> : null}
                              </div>
                            </td>
                            <td className="align-middle small">
                              <span className="badge text-bg-light border">
                                {humanize(lead.lead_score_category)} ({lead.lead_score})
                              </span>
                            </td>
                            <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                              {new Date(lead.created_at).toLocaleDateString()}
                            </td>
                            <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                              <div>{humanize(lead.contact_method || 'unknown')}</div>
                              <div className="d-flex gap-1 mt-1 flex-wrap">
                                {lead.phone ? (
                                  <a
                                    href={`tel:${String(lead.phone).replace(/\s+/g, '')}`}
                                    className="btn btn-sm btn-outline-success py-0 px-2"
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Call ${lead.phone}`}
                                  >
                                    Call
                                  </a>
                                ) : null}
                                {lead.email ? (
                                  <a
                                    href={`mailto:${lead.email}`}
                                    className="btn btn-sm btn-outline-primary py-0 px-2"
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Email ${lead.email}`}
                                  >
                                    Email
                                  </a>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {total > 0 && (
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2 pt-2 border-top" style={{ borderColor: 'var(--chat-border)' }}>
                    <div className="small" style={{ color: 'var(--chat-muted)' }}>
                      Showing {fromRow}–{toRow} of {total}
                    </div>
                    <div className="d-flex gap-2 align-items-center flex-wrap">
                      <label className="small d-flex align-items-center gap-1" style={{ color: 'var(--chat-muted)' }}>
                        Per page
                        <select
                          className="form-select form-select-sm"
                          value={appliedFilters.limit || LEADS_PAGE_SIZE}
                          onChange={(e) => {
                            const nextLimit = Number(e.target.value) || LEADS_PAGE_SIZE;
                            setFilters((prev) => ({ ...prev, page: 1, limit: nextLimit }));
                            setAppliedFilters((prev) => ({ ...prev, page: 1, limit: nextLimit }));
                          }}
                          style={{ width: 88 }}
                        >
                          {PER_PAGE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </label>
                      <div className="d-flex gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={appliedFilters.page <= 1}
                        onClick={() => goToPage(appliedFilters.page - 1)}
                      >
                        Previous
                      </button>
                      <span className="d-flex align-items-center px-2 small" style={{ color: 'var(--chat-text)' }}>
                        Page {appliedFilters.page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={appliedFilters.page >= totalPages}
                        onClick={() => goToPage(appliedFilters.page + 1)}
                      >
                        Next
                      </button>
                      </div>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        </div>
        )}

        {isDetailRoute && (
        <div className="col-12">
          <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body">
              {loadingDetail ? (
                <div className="small text-muted">Loading lead details...</div>
              ) : !selectedLead ? (
                <div className="small text-muted">Select a lead to view details.</div>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-3 flex-wrap">
                    <div>
                      <h6 className="mb-1" style={{ color: 'var(--chat-text-heading)' }}>
                        {selectedLead.display_name || selectedLead.name || selectedLead.email || selectedLead.phone || 'Lead'}
                      </h6>
                      <div className="small" style={{ color: 'var(--chat-muted)' }}>
                        Captured: {formatDateTime(selectedLead.created_at)}
                      </div>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      {selectedLead.session_id ? (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => navigate(`/admin/chat/${selectedLead.session_id}`)}
                        >
                          Operate Chat
                        </button>
                      ) : null}
                      <button className="btn btn-outline-primary btn-sm" onClick={exportCurrentLead}>Export Lead</button>
                      <button className="btn btn-outline-primary btn-sm" onClick={downloadTranscript}>Download Transcript</button>
                      <button className="btn btn-success btn-sm" onClick={markConverted}>Mark Converted</button>
                      <button className="btn btn-outline-danger btn-sm" onClick={deleteLead}>Delete</button>
                    </div>
                  </div>

                  <div className="row g-2 mb-3 small">
                    <div className="col-md-6"><strong>Lead Score:</strong> {humanize(selectedLead.lead_score_category)} ({selectedLead.lead_score})</div>
                    <div className="col-md-6"><strong>Status:</strong> {humanize(selectedLead.status)}</div>
                    <div className="col-md-6">
                      <div><strong>Phone:</strong> {selectedLead.phone || '-'}</div>
                      <button className="btn btn-link btn-sm p-0" onClick={() => copyToClipboard('Phone', selectedLead.phone)}>Copy phone</button>
                    </div>
                    <div className="col-md-6">
                      <div><strong>Email:</strong> {selectedLead.email || '-'}</div>
                      <button className="btn btn-link btn-sm p-0" onClick={() => copyToClipboard('Email', selectedLead.email)}>Copy email</button>
                    </div>
                    <div className="col-md-6"><strong>Business Type:</strong> {selectedLead.business_type || '-'}</div>
                    <div className="col-md-6"><strong>Service Requested:</strong> {selectedLead.service_requested || '-'}</div>
                    <div className="col-md-6"><strong>Budget:</strong> {selectedLead.budget_range || '-'}</div>
                    <div className="col-md-6"><strong>Timeline:</strong> {selectedLead.timeline || '-'}</div>
                    <div className="col-md-6"><strong>Location:</strong> {selectedLead.location || '-'}</div>
                    <div className="col-md-6"><strong>Landing Page:</strong> {selectedLead.landing_page || '-'}</div>
                    <div className="col-md-6"><strong>Device Type:</strong> {selectedLead.device_type || '-'}</div>
                    <div className="col-md-6"><strong>Conversation ID:</strong> {selectedLead.session_id || '-'}</div>
                    <div className="col-md-6"><strong>Intent:</strong> {humanize(selectedLead.ai_detected_intent)}</div>
                    <div className="col-md-6"><strong>Contact Method:</strong> {selectedLead.contact_method || '-'}</div>
                    <div className="col-md-6"><strong>Reminder:</strong> {selectedLead.reminder_at ? formatDateTime(selectedLead.reminder_at) : '-'}</div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Status</label>
                    <div className="d-flex gap-2">
                      <select
                        className="form-select form-select-sm"
                        value={selectedLead.status || 'new'}
                        onChange={(e) => setDetail((prev) => prev ? { ...prev, lead: { ...prev.lead, status: e.target.value } } : prev)}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{humanize(status)}</option>
                        ))}
                      </select>
                      <button className="btn btn-primary btn-sm" onClick={saveStatus} disabled={savingStatus}>
                        {savingStatus ? 'Saving...' : 'Update'}
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Follow-up reminder</label>
                    <div className="row g-2 align-items-end">
                      <div className="col-md-5">
                        <input
                          type="datetime-local"
                          className="form-control form-control-sm"
                          value={reminderAtValue}
                          onChange={(e) => setReminderAtValue(e.target.value)}
                        />
                      </div>
                      <div className="col-md-5">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={reminderNoteValue}
                          onChange={(e) => setReminderNoteValue(e.target.value)}
                          placeholder="Reminder note"
                        />
                      </div>
                      <div className="col-md-2 d-flex flex-column gap-1">
                        <button className="btn btn-outline-primary btn-sm" onClick={saveReminder} disabled={savingReminder}>
                          {savingReminder ? 'Saving...' : 'Set'}
                        </button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={clearReminder} disabled={savingReminder || !selectedLead.reminder_at}>
                          Clear
                        </button>
                      </div>
                    </div>
                    {selectedLead.reminder_at ? (
                      <div className="small mt-1" style={{ color: 'var(--chat-muted)' }}>
                        Active reminder: {formatDateTime(selectedLead.reminder_at)}
                      </div>
                    ) : null}
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">AI-generated summary</label>
                    <div className="p-2 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
                      {selectedLead.requirement_summary || selectedLead.project_summary || 'No project summary available.'}
                    </div>
                    {selectedLead.key_discussion_points && selectedLead.key_discussion_points.length > 0 && (
                      <div className="mt-2">
                        <label className="form-label small">Key discussion points</label>
                        <ul className="mb-0 ps-4" style={{ color: 'var(--chat-text)' }}>
                          {selectedLead.key_discussion_points.map((point, idx) => (
                            <li key={idx} className="small" style={{ marginBottom: '6px' }}>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Notes</label>
                    <div className="p-2 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)', whiteSpace: 'pre-wrap' }}>
                      {selectedLead.notes || 'No notes recorded yet.'}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Add note</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add follow-up note"
                    />
                    <button className="btn btn-outline-primary btn-sm mt-2" onClick={addNote} disabled={savingNote || !noteText.trim()}>
                      {savingNote ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Record activity</label>
                    <div className="d-flex gap-2 mb-2">
                      <select className="form-select form-select-sm" value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                        <option value="contact_attempt">Contact Attempt</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="manual_update">Manual Update</option>
                      </select>
                      <button className="btn btn-outline-primary btn-sm" onClick={addActivity} disabled={savingActivity || !activityText.trim()}>
                        {savingActivity ? 'Saving...' : 'Add Activity'}
                      </button>
                    </div>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={activityText}
                      onChange={(e) => setActivityText(e.target.value)}
                      placeholder="Describe contact attempt or follow-up"
                    />
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label small">Status history</label>
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {(detail?.statusHistory || []).length ? (
                          detail.statusHistory.map((item, index) => (
                            <div key={`${item.changed_at}-${index}`} className="small mb-2 p-2 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
                              <div><strong>{humanize(item.from_status || 'new')}</strong>{' -> '}<strong>{humanize(item.to_status)}</strong></div>
                              <div style={{ color: 'var(--chat-muted)' }}>{formatDateTime(item.changed_at)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="small text-muted">No status updates yet.</div>
                        )}
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small">Activity log</label>
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {(detail?.activities || []).length ? (
                          detail.activities.map((item, index) => (
                            <div key={`${item.created_at}-${index}`} className="small mb-2 p-2 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
                              <div><strong>{humanize(item.activity_type)}</strong></div>
                              <div>{item.details || '-'}</div>
                              <div style={{ color: 'var(--chat-muted)' }}>{formatDateTime(item.created_at)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="small text-muted">No activity yet.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    ref={transcriptPanelRef}
                    className="mt-3"
                    id="lead-transcript-panel"
                  >
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <label className="form-label small mb-0">Full conversation transcript</label>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center justify-content-center"
                        onClick={handleTranscriptFullscreen}
                        title={isTranscriptFullscreen ? 'Exit full screen' : 'Open transcript in full screen'}
                        aria-label={isTranscriptFullscreen ? 'Exit full screen' : 'Open transcript in full screen'}
                      >
                        <TranscriptExpandIcon />
                      </button>
                    </div>
                    <div style={isTranscriptFullscreen ? { height: 'calc(100vh - 120px)', overflowY: 'auto', background: '#0b0b0e', border: '1px solid var(--chat-border)', borderRadius: 8, padding: '10px 12px' } : { maxHeight: 260, overflowY: 'auto', background: '#0b0b0e', border: '1px solid var(--chat-border)', borderRadius: 8, padding: '10px 12px' }}>
                      {(detail?.transcript || []).length ? (
                        detail.transcript.map((message, idx) => (
                          <div key={`${message.created_at}-${idx}`} className="mb-2" style={{ color: '#d1d5db' }}>
                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                              {String(message.role || '').toUpperCase()} • {formatDateTime(message.created_at)}
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{message.content}</div>
                          </div>
                        ))
                      ) : (
                        <div className="small" style={{ color: '#9ca3af' }}>No transcript available.</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>

  );
}
