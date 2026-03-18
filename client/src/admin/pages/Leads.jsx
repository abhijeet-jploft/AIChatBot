import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

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

export default function Leads() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();

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
  const [ownerValue, setOwnerValue] = useState('');
  const [reminderAtValue, setReminderAtValue] = useState('');
  const [reminderNoteValue, setReminderNoteValue] = useState('');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);

  const selectedLead = detail?.lead || null;

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
      } else if (!selectedLeadId || !rows.some((row) => row.id === selectedLeadId)) {
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
  }, [appliedFilters, authFetch, selectedLeadId, showToast]);

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
    if (!selectedLead?.id) {
      setShowTranscriptModal(false);
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
    <div className="p-4">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h5 className="mb-1" style={{ color: 'var(--chat-text-heading)' }}>Leads</h5>
          <div className="small" style={{ color: 'var(--chat-muted)' }}>
            {total} lead{total === 1 ? '' : 's'} captured from chatbot conversations.
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-primary btn-sm" onClick={exportAll}>Export CSV</button>
          <button className="btn btn-outline-primary btn-sm" onClick={exportSelected}>Export Selected</button>
        </div>
      </div>

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
                onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">To</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.toDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
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

      <div className="row g-3">
        <div className="col-lg-5">
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
                <div style={{ maxHeight: 680, overflowY: 'auto' }}>
                  {leads.map((lead) => {
                    const selected = selectedLeadId === lead.id;
                    const overdue = Boolean(lead.reminder_overdue);
                    const dueToday = Boolean(lead.reminder_due_today);
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        className="w-100 text-start mb-2 p-2 rounded border-0"
                        style={{
                          background: selected ? 'var(--chat-sidebar)' : 'var(--chat-bg)',
                          border: overdue
                            ? '1px solid #dc3545'
                            : dueToday
                              ? '1px solid #fd7e14'
                              : '1px solid var(--chat-border)',
                          color: 'var(--chat-text)',
                        }}
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <label className="m-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(lead.id)}
                              onChange={() => toggleSelectLead(lead.id)}
                            />
                          </label>
                          <div className="flex-grow-1">
                            <div className="fw-semibold" style={{ fontSize: 14 }}>
                              {lead.name || lead.email || lead.phone || 'Unnamed lead'}
                            </div>
                            <div className="small" style={{ color: 'var(--chat-muted)' }}>
                              {(lead.project_summary || lead.service_requested || 'No requirement summary').slice(0, 120)}
                            </div>
                            <div className="d-flex gap-2 mt-1 flex-wrap">
                              <span className="badge text-bg-light border">{humanize(lead.status)}</span>
                              <span className="badge text-bg-light border">{humanize(lead.lead_score_category)} ({lead.lead_score})</span>
                              {dueToday ? <span className="badge text-bg-warning">Reminder today</span> : null}
                              {overdue ? <span className="badge text-bg-danger">Overdue</span> : null}
                            </div>
                            <div className="small mt-1" style={{ color: 'var(--chat-muted)' }}>
                              Reminder: {lead.reminder_at ? formatDateTime(lead.reminder_at) : '-'}
                            </div>
                          </div>
                          <small style={{ color: 'var(--chat-muted)' }}>{new Date(lead.created_at).toLocaleDateString()}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {total > 0 && (
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2 pt-2 border-top" style={{ borderColor: 'var(--chat-border)' }}>
                    <div className="small" style={{ color: 'var(--chat-muted)' }}>
                      Showing {fromRow}–{toRow} of {total}
                    </div>
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
                )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-7">
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
                        {selectedLead.name || selectedLead.email || selectedLead.phone || 'Lead'}
                      </h6>
                      <div className="small" style={{ color: 'var(--chat-muted)' }}>
                        Captured: {formatDateTime(selectedLead.created_at)}
                      </div>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => setShowTranscriptModal(true)}>Open Full Conversation</button>
                      <button className="btn btn-outline-primary btn-sm" onClick={exportCurrentLead}>Export Lead</button>
                      <button className="btn btn-outline-primary btn-sm" onClick={downloadTranscript}>Download Transcript</button>
                      <button className="btn btn-success btn-sm" onClick={markConverted}>Mark Converted</button>
                      <button className="btn btn-outline-danger btn-sm" onClick={deleteLead}>Delete</button>
                    </div>
                  </div>

                  <div className="row g-2 mb-3 small">
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
                    <div className="col-md-6"><strong>Intent:</strong> {humanize(selectedLead.ai_detected_intent)}</div>
                    <div className="col-md-6"><strong>Contact Method:</strong> {selectedLead.contact_method || '-'}</div>
                    <div className="col-md-6"><strong>Assigned Owner:</strong> {selectedLead.assigned_owner || '-'}</div>
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
                    <label className="form-label small">Assigned owner</label>
                    <div className="d-flex gap-2">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={ownerValue}
                        onChange={(e) => setOwnerValue(e.target.value)}
                        placeholder="Owner name"
                      />
                      <button className="btn btn-outline-primary btn-sm" onClick={saveOwner} disabled={savingOwner}>
                        {savingOwner ? 'Saving...' : 'Save'}
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
                    <label className="form-label small">Project summary</label>
                    <div className="p-2 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
                      {selectedLead.project_summary || 'No project summary available.'}
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

                  <div className="mt-3" id="lead-transcript-panel">
                    <label className="form-label small">Full conversation transcript</label>
                    <div style={{ maxHeight: 260, overflowY: 'auto', background: '#0b0b0e', border: '1px solid var(--chat-border)', borderRadius: 8, padding: '10px 12px' }}>
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
      </div>

      {showTranscriptModal ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: 'rgba(0,0,0,0.65)', zIndex: 2000 }}
          onClick={() => setShowTranscriptModal(false)}
        >
          <div
            className="position-absolute top-50 start-50 translate-middle"
            style={{ width: 'min(980px, 94vw)', maxHeight: '86vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card" style={{ background: '#0b0b0e', borderColor: 'var(--chat-border)' }}>
              <div className="card-header d-flex justify-content-between align-items-center" style={{ color: '#e5e7eb' }}>
                <strong>Full Conversation</strong>
                <button className="btn btn-sm btn-outline-light" onClick={() => setShowTranscriptModal(false)}>Close</button>
              </div>
              <div className="card-body" style={{ maxHeight: '74vh', overflowY: 'auto' }}>
                {(detail?.transcript || []).length ? (
                  detail.transcript.map((message, idx) => (
                    <div key={`${message.created_at}-${idx}`} className="mb-3" style={{ color: '#d1d5db' }}>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>
                        {String(message.role || '').toUpperCase()} • {formatDateTime(message.created_at)}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{message.content}</div>
                    </div>
                  ))
                ) : (
                  <div className="small" style={{ color: '#9ca3af' }}>No transcript available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
