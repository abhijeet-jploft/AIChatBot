import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import { useSuperToast } from '../context/ToastContext';
import { formatDateOnly } from '../../utils/dateFormat';
import { hasAnyAiModePermission, hasPermission } from '../lib/permissions';
import { validateEmail } from '../../lib/contactValidation';

const DEFAULT_FILTERS = {
  search: '',
  agentStatus: 'all',
  adminLogin: 'all',
};
const PAGE_SIZE = 20;
const PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

function getAdminLoginState(company) {
  if (!company?.admin_email) return 'no_email';
  if (company.admin_configured) return 'ready';
  return 'no_password';
}

export default function Companies() {
  const { admin, saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [data, setData] = useState({ rows: [], total: 0, limit: PAGE_SIZE, page: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    companyId: '',
    name: '',
    description: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [suspendBusyId, setSuspendBusyId] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const load = async ({ nextPage = page, nextPageSize = pageSize, nextFilters = filters } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(nextPageSize));
      params.set('page', String(nextPage));
      if (nextFilters.search.trim()) params.set('search', nextFilters.search.trim());
      if (nextFilters.agentStatus && nextFilters.agentStatus !== 'all') params.set('agentStatus', nextFilters.agentStatus);
      if (nextFilters.adminLogin && nextFilters.adminLogin !== 'all') params.set('adminLogin', nextFilters.adminLogin);

      const res = await saFetch(`/companies?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load companies');
      const json = await res.json();
      if (Array.isArray(json)) {
        setData({ rows: json, total: json.length, limit: nextPageSize, page: 1 });
      } else {
        const rows = Array.isArray(json.rows) ? json.rows : [];
        const total = Number(json.total || 0);
        const limit = Number(json.limit || nextPageSize || PAGE_SIZE);
        const currentPage = Number(json.page || nextPage || 1);
        setData({ rows, total, limit, page: currentPage });
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters, page, pageSize]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const emailCheck = validateEmail(form.adminEmail);
    if (!emailCheck.valid) {
      showToast(emailCheck.error, 'error');
      return;
    }
    if (form.adminPassword && form.adminPassword.length < 8) {
      showToast('Admin password must be at least 8 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await saFetch('/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create company');
      showToast('Company created', 'success');
      setShowCreate(false);
      setForm({ companyId: '', name: '', description: '', adminEmail: '', adminPassword: '' });
      if (page === 1) load({ nextPage: 1 });
      else setPage(1);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (companyId) => {
    try {
      const res = await saFetch(`/companies/${companyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      showToast('Company deleted', 'success');
      setDeleteTarget(null);
      if (page === 1) load({ nextPage: 1 });
      else setPage(1);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSuspendToggle = async (company) => {
    const nextSuspended = !company?.is_suspended;
    setSuspendTarget(null);
    setSuspendBusyId(company.company_id);
    try {
      const res = await saFetch(`/companies/${company.company_id}/suspension`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend: nextSuspended }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update suspension status');
      showToast(nextSuspended ? 'Company suspended. Chatbot is now paused.' : 'Company unsuspended.', 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSuspendBusyId(null);
    }
  };

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.agentStatus !== DEFAULT_FILTERS.agentStatus ||
    filters.adminLogin !== DEFAULT_FILTERS.adminLogin;
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || PAGE_SIZE)));
  const fromRow = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const toRow = Math.min(data.page * data.limit, data.total);
  const canViewCompanyDetails =
    hasPermission(admin, 'business_management', 'view')
    || hasAnyAiModePermission(admin, 'view')
    || hasPermission(admin, 'voice_management', 'view')
    || hasPermission(admin, 'api_management', 'view')
    || hasPermission(admin, 'user_management', 'view');
  const canCreateCompany = hasPermission(admin, 'business_management', 'edit');
  const canSuspendCompany = hasPermission(admin, 'business_management', 'edit');
  const canDeleteCompany = hasPermission(admin, 'business_management', 'full');

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h2 className="sa-page-title">Companies</h2>
          {!loading && data.total > 0 && (
            <div className="sa-text-muted" style={{ marginTop: 6 }}>
              Showing {fromRow} - {toRow} of {data.total} companies
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasActiveFilters && (
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-btn-sm"
              onClick={() => {
                setFilters({ ...DEFAULT_FILTERS });
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
          {canCreateCompany && (
            <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => setShowCreate(true)}>
              + New Company
            </button>
          )}
        </div>
      </div>

      {showCreate && canCreateCompany && (
        <div className="sa-modal-overlay">
          <div className="sa-modal">
            <div className="sa-modal-header">
              <h4>Create New Company</h4>
              <button type="button" className="sa-modal-close" onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="sa-field">
                <label>Company ID <span style={{ color: '#ef4444' }}>*</span> <small>(slug, no spaces)</small></label>
                <input
                  type="text"
                  value={form.companyId}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                  placeholder="_Acme"
                  required
                  pattern="[a-zA-Z0-9_-]{1,80}"
                />
              </div>
              <div className="sa-field">
                <label>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Acme Corp"
                  required
                />
              </div>
              <div className="sa-field">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div className="sa-field">
                <label>Admin login email <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  placeholder="admin@company.com"
                  required
                />
              </div>
              <div className="sa-field">
                <label>Admin password <small>(optional - set later via company detail)</small></label>
                <PasswordInput
                  value={form.adminPassword}
                  onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                  placeholder="Min 8 characters"
                  minLength={8}
                />
              </div>
              <div className="sa-modal-footer">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-sm">
            <div className="sa-modal-header">
              <h4>Delete Company</h4>
              <button type="button" className="sa-modal-close" onClick={() => setDeleteTarget(null)}>&times;</button>
            </div>
            <p className="sa-modal-body">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will remove all conversations, leads, and settings for this company.
            </p>
            <div className="sa-modal-footer">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-danger" onClick={() => handleDelete(deleteTarget.company_id)}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}

      {suspendTarget && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-sm">
            <div className="sa-modal-header">
              <h4>{suspendTarget.is_suspended ? 'Unsuspend' : 'Suspend'} Company</h4>
              <button type="button" className="sa-modal-close" onClick={() => setSuspendTarget(null)}>&times;</button>
            </div>
            <p className="sa-modal-body">
              {suspendTarget.is_suspended
                ? <>Are you sure you want to unsuspend <strong>{suspendTarget.display_name || suspendTarget.name}</strong>? The chatbot will be reactivated.</>
                : <>Are you sure you want to suspend <strong>{suspendTarget.display_name || suspendTarget.name}</strong>? The chatbot will be paused and admin changes will have no effect until unsuspended.</>}
            </p>
            <div className="sa-modal-footer">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setSuspendTarget(null)}>Cancel</button>
              <button
                type="button"
                className={`sa-btn ${suspendTarget.is_suspended ? 'sa-btn-success' : 'sa-btn-warn'}`}
                onClick={() => handleSuspendToggle(suspendTarget)}
              >
                {suspendTarget.is_suspended ? 'Unsuspend' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="sa-loading">Loading companies...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sa-panel sa-panel-compact">
            <div className="sa-field-row" style={{ alignItems: 'flex-end', marginBottom: 0 }}>
              <div className="sa-field" style={{ flex: '2 1 280px', minWidth: 240, marginBottom: 0 }}>
                <label>Search companies</label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => {
                    setFilters((current) => ({ ...current, search: e.target.value }));
                    setPage(1);
                  }}
                  placeholder="Search by name, company ID, email, slug, or description"
                />
              </div>
              <div className="sa-field" style={{ flex: '1 1 180px', minWidth: 180, marginBottom: 0 }}>
                <label>Agent status</label>
                <select
                  value={filters.agentStatus}
                  onChange={(e) => {
                    setFilters((current) => ({ ...current, agentStatus: e.target.value }));
                    setPage(1);
                  }}
                >
                  <option value="all">All agents</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <div className="sa-field" style={{ flex: '1 1 180px', minWidth: 180, marginBottom: 0 }}>
                <label>Admin login</label>
                <select
                  value={filters.adminLogin}
                  onChange={(e) => {
                    setFilters((current) => ({ ...current, adminLogin: e.target.value }));
                    setPage(1);
                  }}
                >
                  <option value="all">All login states</option>
                  <option value="ready">Ready</option>
                  <option value="no_password">No password</option>
                  <option value="no_email">No email</option>
                </select>
              </div>
            </div>
          </div>

          {data.total === 0 ? (
            <div className="sa-empty">
              {hasActiveFilters ? 'No companies match the current search or filters.' : 'No companies yet. Create one above.'}
            </div>
          ) : (
            <>
              <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Company ID</th>
                  <th>Name</th>
                  <th>Admin email</th>
                  <th>Agent</th>
                  <th>Admin login</th>
                  <th>Leads</th>
                  <th>Conversations</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((company) => {
                  const adminLoginState = getAdminLoginState(company);
                  const detailsPath = `/super-admin/companies/${encodeURIComponent(company.company_id)}`;

                  return (
                    <tr key={company.company_id}>
                      <td><code className="sa-code">{company.company_id}</code></td>
                      <td>{company.display_name || company.name}</td>
                      <td style={{ fontSize: 13 }}>
                        {company.admin_email || <span className="sa-text-muted">-</span>}
                      </td>
                      <td>
                        <span className={`sa-badge ${company.agent_paused ? 'sa-badge-paused' : 'sa-badge-active'}`}>
                          {company.agent_paused ? 'Paused' : 'Active'}
                        </span>
                        {company.is_suspended ? (
                          <span className="sa-badge sa-badge-hot" style={{ marginLeft: 8 }}>
                            Suspended
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {adminLoginState === 'no_email' ? (
                          <span className="sa-badge sa-badge-warn">No email</span>
                        ) : adminLoginState === 'ready' ? (
                          <span className="sa-badge sa-badge-ok">Ready</span>
                        ) : (
                          <span className="sa-badge sa-badge-warn">No password</span>
                        )}
                      </td>
                      <td>{company.lead_count}</td>
                      <td>{company.conversation_count}</td>
                      <td>{formatDateOnly(company.created_at)}</td>
                      <td>
                        <div className="sa-row-actions">
                          {canViewCompanyDetails && (
                            <Link to={detailsPath} className="sa-btn sa-btn-ghost sa-btn-xs">
                              Details
                            </Link>
                          )}
                          {canSuspendCompany && company.company_id !== '_default' && (
                            <button
                              type="button"
                              className={`sa-btn ${company.is_suspended ? 'sa-btn-success' : 'sa-btn-warn'} sa-btn-xs`}
                              onClick={() => setSuspendTarget(company)}
                              disabled={suspendBusyId === company.company_id}
                            >
                              {suspendBusyId === company.company_id
                                ? (company.is_suspended ? 'Unsuspending...' : 'Suspending...')
                                : (company.is_suspended ? 'Unsuspend' : 'Suspend')}
                            </button>
                          )}
                          {canDeleteCompany && company.company_id !== '_default' && (
                            <button type="button" className="sa-btn sa-btn-danger sa-btn-xs" onClick={() => setDeleteTarget(company)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sa-pagination-bar">
            <span className="sa-text-muted" style={{ fontSize: 12 }}>
              Showing {fromRow} - {toRow} of {data.total}
            </span>
            <label className="sa-text-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || PAGE_SIZE);
                  setPage(1);
                }}
                style={{ minWidth: 84 }}
              >
                {PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-btn-sm"
              disabled={data.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span className="sa-text-muted" style={{ fontSize: 12 }}>
              Page {data.page} of {totalPages}
            </span>
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-btn-sm"
              disabled={data.page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
