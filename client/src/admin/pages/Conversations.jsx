import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../../utils/dateFormat';
import SortableHeader from '../components/SortableHeader';
import {
  clampFromNotAfterTo,
  clampToNotBeforeFrom,
  nextToAfterFromChange,
} from '../../utils/dateRangeFields';
import { buildVisitorPreviewUrl } from '../lib/visitorPreview';

async function toggleElementFullscreen(element) {
  if (!element) return;

  if (document.fullscreenElement === element) {
    await document.exitFullscreen();
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }

  if (typeof element.requestFullscreen !== 'function') {
    return;
  }

  await element.requestFullscreen();
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

const PAGE_SIZE = 20;
const PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];
const INTENT_OPTIONS = [
  { value: 'all', label: 'All intents' },
  { value: 'website', label: 'Website' },
  { value: 'app', label: 'App' },
  { value: 'pricing_request', label: 'Pricing' },
  { value: 'support_request', label: 'Support' },
  { value: 'consultation_request', label: 'Consultation' },
  { value: 'general_inquiry', label: 'General' },
];

const OUTCOME_OPTIONS = [
  { value: 'all', label: 'All outcomes' },
  { value: 'lead_captured', label: 'Lead captured' },
  { value: 'converted', label: 'Converted' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'no_lead', label: 'No lead' },
];

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatConversationStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return 'Active';
  if (normalized === 'closed') return 'Closed';
  if (normalized === 'escalated' || normalized === 'converted_to_lead') return 'Escalated';
  return humanize(status || 'closed');
}

function buildConvertLeadDraft(detail) {
  return {
    name: detail?.lead?.name || detail?.session?.visitorName || '',
    phone: detail?.lead?.phone || '',
    email: detail?.lead?.email || '',
    location: detail?.lead?.location || '',
  };
}

export default function Conversations() {
  const { authFetch, company } = useAuth();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [leadStatus, setLeadStatus] = useState('all');
  const [status, setStatus] = useState('all');
  const [intent, setIntent] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState({ field: null, dir: null });
  const [detailId, setDetailId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showConvertLeadModal, setShowConvertLeadModal] = useState(false);
  const [convertLeadTargetId, setConvertLeadTargetId] = useState(null);
  const [convertLeadDraft, setConvertLeadDraft] = useState({ name: '', phone: '', email: '', location: '' });
  const [convertingLead, setConvertingLead] = useState(false);
  const [convertLeadError, setConvertLeadError] = useState('');
  const transcriptPanelRef = useRef(null);
  const [isTranscriptFullscreen, setIsTranscriptFullscreen] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('page', String(page));
      if (appliedSearch) params.set('search', appliedSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (leadStatus && leadStatus !== 'all') params.set('leadStatus', leadStatus);
      if (status && status !== 'all') params.set('status', status);
      if (intent && intent !== 'all') params.set('intent', intent);
      if (outcome && outcome !== 'all') params.set('outcome', outcome);
      const res = await authFetch(`/conversations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load conversations');
      const json = await res.json();
      setData({
        rows: json.rows || [],
        total: json.total ?? 0,
        limit: json.limit ?? pageSize,
        page: json.page ?? page,
      });
    } catch {
      setData({ rows: [], total: 0, limit: pageSize, page: 1 });
    } finally {
      setLoading(false);
    }
  }, [authFetch, page, appliedSearch, dateFrom, dateTo, leadStatus, status, intent, outcome, pageSize]);

  const openDetail = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setDetailId(sessionId);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await authFetch(`/conversations/${sessionId}`);
      if (!res.ok) throw new Error('Failed to load conversation details');
      const payload = await res.json();
      setDetail(payload);
      setConvertLeadDraft(buildConvertLeadDraft(payload));
    } catch {
      setDetail({ error: 'Failed to load conversation details' });
    } finally {
      setDetailLoading(false);
    }
  }, [authFetch]);

  const openConvertLeadModal = (conversation) => {
    setConvertLeadTargetId(conversation.id);
    setConvertLeadDraft({
      name: conversation.visitorName || '',
      phone: '',
      email: '',
      location: '',
    });
    setConvertLeadError('');
    setShowConvertLeadModal(true);
  };

  const submitConvertLead = async () => {
    if (!convertLeadTargetId) return;
    setConvertingLead(true);
    setConvertLeadError('');
    try {
      const res = await authFetch(`/conversations/${convertLeadTargetId}/convert-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convertLeadDraft),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to convert lead');
      setShowConvertLeadModal(false);
      setConvertLeadTargetId(null);
      await loadConversations();
    } catch (err) {
      setConvertLeadError(err.message || 'Failed to convert lead');
    } finally {
      setConvertingLead(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

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
    if (!detailId && document.fullscreenElement === transcriptPanelRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [detailId]);

  const handleTranscriptFullscreen = useCallback(async () => {
    await toggleElementFullscreen(transcriptPanelRef.current);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const hasFilters =
    appliedSearch ||
    dateFrom ||
    dateTo ||
    (leadStatus && leadStatus !== 'all') ||
    (status && status !== 'all') ||
    (intent && intent !== 'all') ||
    (outcome && outcome !== 'all');

  const clearFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setDateFrom('');
    setDateTo('');
    setLeadStatus('all');
    setStatus('all');
    setIntent('all');
    setOutcome('all');
    setPage(1);
  };

  const sortedRows = useMemo(() => {
    if (!sort.field || !sort.dir) return data.rows;
    const sorted = [...data.rows];
    sorted.sort((a, b) => {
      let av, bv;
      if (sort.field === 'visitorId') { av = (a.visitorId || a.id || '').toString().toLowerCase(); bv = (b.visitorId || b.id || '').toString().toLowerCase(); }
      else if (sort.field === 'visitorName') { av = (a.visitorName || '').toLowerCase(); bv = (b.visitorName || '').toLowerCase(); }
      else if (sort.field === 'createdAt') { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
      else return 0;
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [data.rows, sort.field, sort.dir]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);

  return (
    <div className="p-4" id="conversations-top">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Conversations</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)' }}>
        All chat sessions. Filter by date range, lead status, active/closed; search by visitor name, email, phone, or first message.
      </p>

      <form id="conversations-filters" onSubmit={handleSearchSubmit} className="card mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-4 col-lg-3">
              <label className="form-label small">Search</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Visitor name, email, phone, or first message..."
              />
            </div>
            <div className="col-6 col-md-2 col-lg-2">
              <label className="form-label small">From date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  setDateFrom(clampFromNotAfterTo(dateTo, v));
                  setDateTo((t) => nextToAfterFromChange(v, t));
                }}
              />
            </div>
            <div className="col-6 col-md-2 col-lg-2">
              <label className="form-label small">To date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(clampToNotBeforeFrom(dateFrom, e.target.value))}
              />
            </div>
            <div className="col-6 col-md-2 col-lg-2">
              <label className="form-label small">Lead</label>
              <select
                className="form-select form-select-sm"
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value)}
              >
                <option value="all">All</option>
                <option value="yes">Lead captured</option>
                <option value="no">No lead</option>
              </select>
            </div>
            <div className="col-6 col-md-2 col-lg-2">
              <label className="form-label small">Status</label>
              <select
                className="form-select form-select-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All</option>
                <option value="active">Active only</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="col-6 col-md-2 col-lg-2">
              <label className="form-label small">Intent</label>
              <select className="form-select form-select-sm" value={intent} onChange={(e) => setIntent(e.target.value)}>
                {INTENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2 col-lg-2">
              <label className="form-label small">Outcome</label>
              <select className="form-select form-select-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {OUTCOME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-auto d-flex gap-1 flex-wrap">
              <button type="submit" className="btn btn-primary btn-sm">Search</button>
              {hasFilters && (
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      <div className="card" id="conversations-table" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>Loading...</div>
          ) : !data.rows.length ? (
            <div className="p-4 text-center small" style={{ color: 'var(--chat-muted)' }}>
              No conversations found{appliedSearch ? ' for this search.' : '.'}
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0 admin-conversations-table" style={{ color: 'var(--chat-text)' }}>
                  <thead>
                    <tr>
                      <SortableHeader label="Visitor ID" field="visitorId" sort={sort} onSort={setSort} className="border-0 py-2" />
                      <SortableHeader label="Visitor name" field="visitorName" sort={sort} onSort={setSort} className="border-0 py-2" />
                      <SortableHeader label="Date and time" field="createdAt" sort={sort} onSort={setSort} className="border-0 py-2" />
                      <th className="border-0 py-2">Conversation status</th>
                      <th className="border-0 py-2">Lead captured</th>
                      <th className="border-0 py-2">Source page</th>
                      <th className="border-0 py-2">Conversation duration</th>
                      <th className="border-0 py-2">Intent tag</th>
                      <th className="border-0 py-2 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((conv) => (
                      <tr key={conv.id}>
                        <td className="align-middle">
                          <code className="small">{conv.visitorId || conv.id}</code>
                        </td>
                        <td className="align-middle">
                          {conv.visitorName || 'Anonymous visitor'}
                        </td>
                        <td className="align-middle small" style={{ color: 'var(--chat-muted)' }}>
                          {formatDateTime(conv.createdAt)}
                        </td>
                        <td className="align-middle">
                          <span className={`badge ${
                            conv.status === 'active'
                              ? 'text-bg-success'
                              : conv.status === 'escalated' || conv.status === 'converted_to_lead'
                                ? 'text-bg-warning'
                                : 'text-bg-secondary'
                          }`}>
                            {formatConversationStatus(conv.status)}
                          </span>
                        </td>
                        <td className="align-middle">{conv.leadCaptured ? 'Yes' : 'No'}</td>
                        <td className="align-middle">
                          {conv.sourcePage ? (
                            <a
                              href={conv.sourcePage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="small"
                              title={conv.sourcePage}
                            >
                              {String(conv.sourcePage).slice(0, 64)}
                            </a>
                          ) : (
                            <span className="small">—</span>
                          )}
                        </td>
                        <td className="align-middle">
                          {conv.durationLabel || '—'}
                        </td>
                        <td className="align-middle">
                          {humanize(conv.intentTag)}
                        </td>
                        <td className="align-middle text-end">
                          <div className="admin-action-stack admin-action-stack-end">
                            {conv.leadCaptured ? (
                              <Link to={`/admin/leads/${conv.leadId}`} className="btn btn-sm btn-outline-primary">View lead</Link>
                            ) : null}
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openDetail(conv.id)}>
                              Details
                            </button>
                            {!conv.leadCaptured ? (
                              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => openConvertLeadModal(conv)}>
                                Convert Lead
                              </button>
                            ) : null}
                            <Link to={`/admin/chat/${conv.id}`} className="btn btn-sm btn-primary">
                              Operate Chat
                            </Link>
                            <a
                              href={buildVisitorPreviewUrl(company, conv.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-secondary"
                            >
                              Visitor preview
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.total > 0 && (
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
                  <div className="small" style={{ color: 'var(--chat-muted)' }}>
                    Showing {fromRow}–{toRow} of {data.total}
                  </div>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <label className="small d-flex align-items-center gap-1" style={{ color: 'var(--chat-muted)' }}>
                      Per page
                      <select
                        className="form-select form-select-sm"
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value) || PAGE_SIZE);
                          setPage(1);
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
                      disabled={data.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="d-flex align-items-center px-2 small" style={{ color: 'var(--chat-text)' }}>
                      Page {data.page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={data.page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

      {detailId ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: 'rgba(0,0,0,0.55)', zIndex: 2050 }}
          onClick={() => { setDetailId(null); setDetail(null); }}
        >
          <div
            className="position-absolute top-50 start-50 translate-middle"
            style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-header d-flex justify-content-between align-items-center" style={{ borderColor: 'var(--chat-border)' }}>
                <div>
                  <strong>Conversation details</strong>
                  {detail?.session?.visitorName ? (
                    <span className="small ms-2" style={{ color: 'var(--chat-muted)' }}>{detail.session.visitorName}</span>
                  ) : null}
                </div>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setDetailId(null); setDetail(null); }}>
                  Close
                </button>
              </div>
              <div className="card-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                {detailLoading ? (
                  <div className="small text-muted">Loading conversation details...</div>
                ) : detail?.error ? (
                  <div className="small text-danger">{detail.error}</div>
                ) : detail ? (
                  <>
                    <div className="row g-3 mb-3 small">
                      <div className="col-md-4"><strong>Status:</strong> {humanize(detail.session?.status)}</div>
                      <div className="col-md-4"><strong>Intent:</strong> {humanize(detail.session?.intentTag)}</div>
                      <div className="col-md-4"><strong>Duration:</strong> {detail.session?.durationLabel || '—'}</div>
                      <div className="col-md-6"><strong>Source page:</strong> {detail.session?.sourcePage || '—'}</div>
                      <div className="col-md-6"><strong>Captured at:</strong> {formatDateTime(detail.session?.createdAt)}</div>
                    </div>

                    <div className="mb-3 p-3 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
                      <div className="small fw-semibold mb-2">AI conversation summary</div>
                      <div className="small mb-1"><strong>Visitor intent:</strong> {detail.summary?.visitorIntent || '—'}</div>
                      <div className="small mb-1"><strong>Business type:</strong> {detail.summary?.businessType || '—'}</div>
                      <div className="small mb-1"><strong>Requirements:</strong> {detail.summary?.requirementsDiscussed || '—'}</div>
                      <div className="small mb-1"><strong>Qualification:</strong> {detail.summary?.qualificationLevel || '—'}</div>
                      <div className="small"><strong>Suggested action:</strong> {detail.summary?.suggestedNextAction || '—'}</div>
                    </div>

                    {detail.lead ? (
                      <div className="mb-3 p-3 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
                        <div className="small fw-semibold mb-2">Lead information</div>
                        <div className="row g-2 small">
                          <div className="col-md-6"><strong>Name:</strong> {detail.lead.name || '—'}</div>
                          <div className="col-md-6"><strong>Phone:</strong> {detail.lead.phone || '—'}</div>
                          <div className="col-md-6"><strong>Email:</strong> {detail.lead.email || '—'}</div>
                          <div className="col-md-6"><strong>Service:</strong> {detail.lead.serviceRequested || '—'}</div>
                          <div className="col-md-6"><strong>Budget:</strong> {detail.lead.budgetRange || '—'}</div>
                          <div className="col-md-6"><strong>Timeline:</strong> {detail.lead.timeline || '—'}</div>
                        </div>
                      </div>
                    ) : null}

                    <div ref={transcriptPanelRef}>
                      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                        <div className="small fw-semibold mb-0">Full transcript</div>
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
                      <div style={isTranscriptFullscreen ? { height: 'calc(100vh - 128px)', overflowY: 'auto', background: '#11131a', border: '1px solid #2e3545', borderRadius: 8, padding: 12 } : { maxHeight: 360, overflowY: 'auto', background: '#11131a', border: '1px solid #2e3545', borderRadius: 8, padding: 12 }}>
                        {(detail.messages || []).length ? (
                          detail.messages.map((message, index) => (
                            <div key={`${message.createdAt}-${index}`} className="mb-2" style={{ color: '#d1d5db' }}>
                              <div style={{ fontSize: 11, opacity: 0.75 }}>
                                {String(message.role || '').toUpperCase()} • {formatDateTime(message.createdAt)} • {humanize(message.messageType || 'text')}
                              </div>
                              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{message.content}</div>
                            </div>
                          ))
                        ) : (
                          <div className="small" style={{ color: '#9ca3af' }}>No transcript available.</div>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showConvertLeadModal ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: 'rgba(0,0,0,0.55)', zIndex: 2060 }}
          onClick={() => { if (!convertingLead) setShowConvertLeadModal(false); }}
        >
          <div
            className="position-absolute top-50 start-50 translate-middle"
            style={{ width: 'min(560px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-header d-flex justify-content-between align-items-center" style={{ borderColor: 'var(--chat-border)' }}>
                <strong>Convert conversation to lead</strong>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowConvertLeadModal(false)} disabled={convertingLead}>Close</button>
              </div>
              <div className="card-body">
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label small">Visitor name</label>
                    <input className="form-control form-control-sm" value={convertLeadDraft.name} onChange={(e) => setConvertLeadDraft((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small">Location</label>
                    <input className="form-control form-control-sm" value={convertLeadDraft.location} onChange={(e) => setConvertLeadDraft((prev) => ({ ...prev, location: e.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small">Phone</label>
                    <input className="form-control form-control-sm" value={convertLeadDraft.phone} onChange={(e) => setConvertLeadDraft((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Required if email is empty" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small">Email</label>
                    <input className="form-control form-control-sm" value={convertLeadDraft.email} onChange={(e) => setConvertLeadDraft((prev) => ({ ...prev, email: e.target.value }))} placeholder="Required if phone is empty" />
                  </div>
                </div>
                {convertLeadError ? <div className="text-danger small mt-2">{convertLeadError}</div> : null}
                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowConvertLeadModal(false)} disabled={convertingLead}>Cancel</button>
                  <button className="btn btn-success btn-sm" onClick={submitConvertLead} disabled={convertingLead}>
                    {convertingLead ? 'Converting...' : 'Convert Lead'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
