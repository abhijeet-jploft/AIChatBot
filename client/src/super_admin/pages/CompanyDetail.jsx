import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

export default function CompanyDetail() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [company, setCompany] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        saFetch(`/companies/${companyId}`),
        saFetch(`/companies/${companyId}/stats`),
      ]);
      if (!cRes.ok) throw new Error('Company not found');
      const [c, s] = await Promise.all([cRes.json(), sRes.json()]);
      setCompany(c);
      setStats(s);
      setEditName(c.name || '');
      setEditDesc(c.description || '');
      setEditAdminEmail(c.admin_email || '');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  const handleEdit = async (e) => {
    e.preventDefault();
    setEditBusy(true);
    try {
      const res = await saFetch(`/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc, adminEmail: editAdminEmail.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Company updated', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setEditBusy(false);
    }
  };

  const handleRegenerateEmbed = async () => {
    if (!window.confirm('Generate a new embed secret? Existing iframe/script embeds must be updated.')) return;
    try {
      const res = await saFetch(`/companies/${companyId}/regenerate-embed-secret`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('New embed secret generated. Copy it from settings JSON or DB.', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCopyEmbedSecret = async () => {
    if (!company?.embed_secret) return;
    try {
      await navigator.clipboard.writeText(String(company.embed_secret));
      showToast('Embed secret copied', 'success');
    } catch {
      showToast('Failed to copy embed secret', 'error');
    }
  };

  const handleOpenAsAdmin = async () => {
    try {
      const res = await saFetch(`/companies/${companyId}/impersonate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      try {
        localStorage.setItem(
          `admin_handoff_${id}`,
          JSON.stringify({ token: data.token, ts: Date.now() })
        );
      } catch (e) {
        showToast('Could not store handoff token', 'error');
        return;
      }
      const adminPath = `${window.location.origin}/admin?handoff=${encodeURIComponent(id)}`;
      window.open(adminPath, '_blank', 'noopener,noreferrer');
      showToast('Opening company admin in a new tab', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
    setResetBusy(true);
    try {
      const res = await saFetch(`/companies/${companyId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Admin password reset successfully', 'success');
      setNewPassword('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setResetBusy(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading…</div>;
  if (!company) return <div className="sa-empty">Company not found.</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to="/super-admin/companies" className="sa-breadcrumb">← Companies</Link>
          <h2 className="sa-page-title">{company.display_name || company.name}</h2>
          <code className="sa-code-muted">{company.company_id}</code>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-btn sa-btn-primary sa-btn-sm">
            All Configurations
          </Link>
          <Link to={`/super-admin/companies/${companyId}/settings`} className="sa-btn sa-btn-primary sa-btn-sm">
            Settings
          </Link>
          <Link to={`/super-admin/companies/${companyId}/api-settings`} className="sa-btn sa-btn-ghost sa-btn-sm">
            API Settings
          </Link>
          <Link to={`/super-admin/training/${companyId}`} className="sa-btn sa-btn-primary sa-btn-sm">
            Training
          </Link>
          <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={handleOpenAsAdmin}>
            Open as company admin
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="sa-kpi-grid sa-kpi-grid-sm">
          <div className="sa-kpi-card"><div className="sa-kpi-label">Total Conversations</div><div className="sa-kpi-value">{stats.total_conversations}</div></div>
          <div className="sa-kpi-card"><div className="sa-kpi-label">Total Leads</div><div className="sa-kpi-value">{stats.total_leads}</div></div>
          <div className="sa-kpi-card"><div className="sa-kpi-label">New Leads</div><div className="sa-kpi-value">{stats.new_leads}</div></div>
          <div className="sa-kpi-card"><div className="sa-kpi-label">Hot / Very Hot Leads</div><div className="sa-kpi-value">{stats.hot_leads}</div></div>
          <div className="sa-kpi-card"><div className="sa-kpi-label">Conversations (7d)</div><div className="sa-kpi-value">{stats.conversations_last_7d}</div></div>
          <div className="sa-kpi-card"><div className="sa-kpi-label">New Leads (7d)</div><div className="sa-kpi-value">{stats.leads_last_7d}</div></div>
        </div>
      )}

      <div className="sa-detail-cols">
        {/* Company info */}
        <div className="sa-panel">
          <h3 className="sa-panel-title">Company Info</h3>
          <form onSubmit={handleEdit}>
            <div className="sa-field">
              <label>Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="sa-field">
              <label>Description</label>
              <textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <div className="sa-field">
              <label>Admin login email</label>
              <input
                type="email"
                value={editAdminEmail}
                onChange={(e) => setEditAdminEmail(e.target.value)}
                placeholder="admin@company.com"
                required
              />
              <p className="sa-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Company admins sign in with this email and their password. Must be unique across companies.
              </p>
            </div>
            <div className="sa-field-row">
              <div className="sa-info-item"><span>AI Mode</span><strong>{company.ai_mode || 'default'}</strong></div>
              <div className="sa-info-item"><span>AI Provider</span><strong>{company.ai_provider || '—'}</strong></div>
              <div className="sa-info-item"><span>Agent</span><strong>{company.agent_paused ? 'Paused' : 'Active'}</strong></div>
            </div>
            {company.embed_slug && (
              <div className="sa-field" style={{ marginTop: 8 }}>
                <label>Embed</label>
                <div className="sa-text-muted" style={{ fontSize: 12 }}>
                  Slug: <code>{company.embed_slug}</code>
                  {company.embed_secret && (
                    <>
                      {' · '}
                      Secret <span title={company.embed_secret}>…{String(company.embed_secret).slice(-6)}</span>
                      <button
                        type="button"
                        className="sa-btn sa-btn-ghost sa-btn-xs"
                        style={{ marginLeft: 8 }}
                        onClick={handleCopyEmbedSecret}
                        title="Copy embed secret"
                        aria-label="Copy embed secret"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginTop: 6 }} onClick={handleRegenerateEmbed}>
                  Regenerate embed secret
                </button>
              </div>
            )}
            {company.lead_notification_email != null && (
              <div className="sa-field" style={{ marginTop: 8 }}>
                <label>Lead notification email</label>
                <div style={{ fontSize: 13 }}>{company.lead_notification_email || '—'}</div>
              </div>
            )}
            <button type="submit" className="sa-btn sa-btn-primary sa-btn-sm" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</button>
          </form>
        </div>

        {/* Reset admin password */}
        <div className="sa-panel">
          <h3 className="sa-panel-title">Admin Access</h3>
          <p className="sa-text-muted sa-mb">
            Admins log in at <code className="sa-code">/admin</code> with <strong>email + password</strong>. The login email is edited under Company Info. Use this form to set or reset the password (invalidates active sessions).
          </p>
          <p className="sa-text-muted sa-mb">
            {company.admin_configured
              ? 'Password is set.'
              : 'No password set yet — set one below so the admin can sign in.'}
          </p>
          <form onSubmit={handleResetPassword}>
            <div className="sa-field">
              <label>New Admin Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
                required
              />
            </div>
            <button type="submit" className="sa-btn sa-btn-warning sa-btn-sm" disabled={resetBusy}>
              {resetBusy ? 'Resetting…' : company.admin_configured ? 'Reset Password' : 'Set Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
