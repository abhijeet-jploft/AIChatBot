import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

export default function Companies() {
  const { saFetch } = useSuperAuth();
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
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">Companies</h2>
        <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => setShowCreate(true)}>
          + New Company
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="sa-modal-overlay">
          <div className="sa-modal">
            <div className="sa-modal-header">
              <h4>Create New Company</h4>
              <button type="button" className="sa-modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="sa-field">
                <label>Company ID <small>(slug, no spaces)</small></label>
                <input type="text" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} placeholder="_Acme" required pattern="[a-zA-Z0-9_\-]{1,80}" />
              </div>
              <div className="sa-field">
                <label>Company Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" required />
              </div>
              <div className="sa-field">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional description" />
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
                <label>Admin password <small>(optional — set later via company detail)</small></label>
                <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="Min 8 characters" minLength={8} />
              </div>
              <div className="sa-modal-footer">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-sm">
            <div className="sa-modal-header">
              <h4>Delete Company</h4>
              <button type="button" className="sa-modal-close" onClick={() => setDeleteTarget(null)}>×</button>
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
        <div className="sa-loading">Loading companies…</div>
      ) : companies.length === 0 ? (
        <div className="sa-empty">No companies yet. Create one above.</div>
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
              {companies.map((c) => (
                <tr key={c.company_id}>
                  <td><code className="sa-code">{c.company_id}</code></td>
                  <td><Link to={`/super-admin/companies/${c.company_id}`} className="sa-link">{c.display_name || c.name}</Link></td>
                  <td style={{ fontSize: 13 }}>{c.admin_email || <span className="sa-text-muted">—</span>}</td>
                  <td>
                    <span className={`sa-badge ${c.agent_paused ? 'sa-badge-paused' : 'sa-badge-active'}`}>
                      {c.agent_paused ? 'Paused' : 'Active'}
                    </span>
                  </td>
                  <td>
                    {!c.admin_email ? (
                      <span className="sa-badge sa-badge-warn">No email</span>
                    ) : c.admin_configured ? (
                      <span className="sa-badge sa-badge-ok">Ready</span>
                    ) : (
                      <span className="sa-badge sa-badge-warn">No password</span>
                    )}
                  </td>
                  <td>{c.lead_count}</td>
                  <td>{c.conversation_count}</td>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="sa-row-actions">
                      <Link to={`/super-admin/companies/${c.company_id}`} className="sa-btn sa-btn-ghost sa-btn-xs">Manage</Link>
                      <Link to={`/super-admin/training/${c.company_id}`} className="sa-btn sa-btn-ghost sa-btn-xs">Training</Link>
                      {c.company_id !== '_default' && (
                        <button type="button" className="sa-btn sa-btn-danger sa-btn-xs" onClick={() => setDeleteTarget(c)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
