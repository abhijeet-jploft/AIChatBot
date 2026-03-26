import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { hasAnyAiModePermission, hasPermission } from '../lib/permissions';

const DEFAULT_FILTERS = {
  search: '',
  agentStatus: 'all',
  adminLogin: 'all',
};

function getAdminLoginState(company) {
  if (!company?.admin_email) return 'no_email';
  if (company.admin_configured) return 'ready';
  return 'no_password';
}

function matchesCompanySearch(company, rawSearch) {
  const search = String(rawSearch || '').trim().toLowerCase();
  if (!search) return true;

  return [
    company?.company_id,
    company?.display_name,
    company?.name,
    company?.description,
    company?.admin_email,
    company?.embed_slug,
    company?.ai_mode,
  ].some((value) => String(value || '').toLowerCase().includes(search));
}

export default function Companies() {
  const { admin, saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const load = async () => {
    setLoading(true);
    try {
      const res = await saFetch('/companies');
      if (!res.ok) throw new Error('Failed to load companies');
      setCompanies(await res.json());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
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
      load();
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
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSuspendToggle = async (company) => {
    const nextSuspended = !company?.is_suspended;
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
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSuspendBusyId(null);
    }
  };

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = matchesCompanySearch(company, filters.search);
    const matchesAgent =
      filters.agentStatus === 'all' ||
      (filters.agentStatus === 'active' && !company.agent_paused) ||
      (filters.agentStatus === 'paused' && company.agent_paused);
    const matchesAdmin =
      filters.adminLogin === 'all' || getAdminLoginState(company) === filters.adminLogin;

    return matchesSearch && matchesAgent && matchesAdmin;
  });

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.agentStatus !== DEFAULT_FILTERS.agentStatus ||
    filters.adminLogin !== DEFAULT_FILTERS.adminLogin;
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
          {!loading && companies.length > 0 && (
            <div className="sa-text-muted" style={{ marginTop: 6 }}>
              Showing {filteredCompanies.length} of {companies.length} companies
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasActiveFilters && !loading && companies.length > 0 && (
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-btn-sm"
              onClick={() => setFilters({ ...DEFAULT_FILTERS })}
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
                <label>Company ID <small>(slug, no spaces)</small></label>
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
                <label>Company Name</label>
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
                <label>Admin login email</label>
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
                <input
                  type="password"
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

      {loading ? (
        <div className="sa-loading">Loading companies...</div>
      ) : companies.length === 0 ? (
        <div className="sa-empty">No companies yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sa-panel sa-panel-compact">
            <div className="sa-field-row" style={{ alignItems: 'flex-end', marginBottom: 0 }}>
              <div className="sa-field" style={{ flex: '2 1 280px', minWidth: 240, marginBottom: 0 }}>
                <label>Search companies</label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                  placeholder="Search by name, company ID, email, slug, or description"
                />
              </div>
              <div className="sa-field" style={{ flex: '1 1 180px', minWidth: 180, marginBottom: 0 }}>
                <label>Agent status</label>
                <select
                  value={filters.agentStatus}
                  onChange={(e) => setFilters((current) => ({ ...current, agentStatus: e.target.value }))}
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
                  onChange={(e) => setFilters((current) => ({ ...current, adminLogin: e.target.value }))}
                >
                  <option value="all">All login states</option>
                  <option value="ready">Ready</option>
                  <option value="no_password">No password</option>
                  <option value="no_email">No email</option>
                </select>
              </div>
            </div>
          </div>

          {filteredCompanies.length === 0 ? (
            <div className="sa-empty">No companies match the current search or filters.</div>
          ) : (
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((company) => {
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
                        <td>{new Date(company.created_at).toLocaleDateString()}</td>
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
                                onClick={() => handleSuspendToggle(company)}
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
          )}
        </div>
      )}
    </div>
  );
}
