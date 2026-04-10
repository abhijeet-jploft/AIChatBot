import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import { useSuperToast } from '../context/ToastContext';
import { buildAiModePermissionChecks, hasAnyAiModePermission, hasAnyPermission, hasPermission } from '../lib/permissions';
import {
  INDUSTRY_PRESETS,
  OTHER_VALUE,
  parseIndustryFromApi,
  buildIndustryToSave,
} from '../../lib/accountProfileIndustry';
import PhoneInputWithCountryCode from '../../components/PhoneInputWithCountryCode';
import {
  normalizeUrlForSubmit,
  splitPhoneForForm,
  validatePhone,
  validateEmail,
} from '../../lib/contactValidation';

const TRAINING_PERMISSION_CHECKS = [
  ...buildAiModePermissionChecks('view'),
  ['training_scrape', 'view'],
  ['training_conversational', 'view'],
  ['training_documents', 'view'],
  ['training_database', 'view'],
  ['training_media', 'view'],
  ['training_structured', 'view'],
  ['training_manual', 'view'],
];

export default function CompanyDetail() {
  const { companyId } = useParams();
  const { admin, saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [company, setCompany] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editPhoneCode, setEditPhoneCode] = useState('+1');
  const [editPhoneLocal, setEditPhoneLocal] = useState('');
  const [editCompanyWebsite, setEditCompanyWebsite] = useState('');
  const [industrySelect, setIndustrySelect] = useState('');
  const [industryOtherSpecify, setIndustryOtherSpecify] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [openAdminBusy, setOpenAdminBusy] = useState(false);
  const canViewCompanyInfo = hasPermission(admin, 'business_management', 'view');
  const canEditCompanyInfo = hasPermission(admin, 'business_management', 'edit');
  const canViewAdminAccess = hasPermission(admin, 'user_management', 'view');
  const canEditAdminAccess = hasPermission(admin, 'user_management', 'edit');
  const canViewApi = hasPermission(admin, 'api_management', 'view');
  const canViewVoice = hasPermission(admin, 'voice_management', 'view');
  const canViewAi = hasAnyAiModePermission(admin, 'view');
  const canViewTraining = hasAnyPermission(admin, TRAINING_PERMISSION_CHECKS);
  const canViewConfigurations = canViewCompanyInfo || canViewAdminAccess || canViewApi || canViewVoice || canViewAi;

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
      setEditOwnerName(c.owner_name || '');
      const parsedPhone = splitPhoneForForm(c.admin_phone || '', '+1');
      setEditPhoneCode(parsedPhone.countryCode);
      setEditPhoneLocal(parsedPhone.localNumber);
      setEditCompanyWebsite(c.company_website || '');
      const { select, other } = parseIndustryFromApi(c.industry_category);
      setIndustrySelect(select);
      setIndustryOtherSpecify(other);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  const handleIndustrySelectChange = (value) => {
    setIndustrySelect(value);
    if (value !== OTHER_VALUE) setIndustryOtherSpecify('');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const specify = industryOtherSpecify.trim();
    if (!editName.trim()) {
      showToast('Company name is required.', 'error');
      return;
    }
    if (industrySelect === OTHER_VALUE && !specify) {
      showToast('Please specify the industry when “Other” is selected.', 'error');
      return;
    }    const emailCheck = validateEmail(editAdminEmail);
    if (!emailCheck.valid) {
      showToast(emailCheck.error, 'error');
      return;
    }    const industryCategory = buildIndustryToSave(industrySelect, specify);
    const phoneCheck = validatePhone(editPhoneCode, editPhoneLocal);
    if (!phoneCheck.valid) {
      showToast(phoneCheck.error, 'error');
      return;
    }
    const normalizedCompanyWebsite = normalizeUrlForSubmit(editCompanyWebsite);
    if (normalizedCompanyWebsite === null) {
      showToast('Please enter a valid company website URL.', 'error');
      return;
    }

    setEditBusy(true);
    try {
      const res = await saFetch(`/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          adminEmail: editAdminEmail.trim(),
          ownerName: editOwnerName.trim(),
          phone: phoneCheck.normalized,
          companyWebsite: normalizedCompanyWebsite,
          industryCategory,
        }),
      });
      const errJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errJson.error || 'Update failed');
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
    setOpenAdminBusy(true);
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
    } finally {
      setOpenAdminBusy(false);
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
          <Link to="/super-admin/companies" className="sa-breadcrumb">← Back</Link>
          <h2 className="sa-page-title">{company.display_name || company.name}</h2>
          <code className="sa-code-muted">{company.company_id}</code>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canViewConfigurations && (
            <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-btn sa-btn-primary sa-btn-sm">
              Configurations
            </Link>
          )}
          {canViewCompanyInfo && (
            <Link to={`/super-admin/companies/${companyId}/settings`} className="sa-btn sa-btn-primary sa-btn-sm">
              Settings
            </Link>
          )}
          {canViewAi && (
            <Link to={`/super-admin/companies/${companyId}/mode-settings`} className="sa-btn sa-btn-primary sa-btn-sm">
              AI Mode
            </Link>
          )}
          {canViewApi && (
            <Link to={`/super-admin/companies/${companyId}/api-settings`} className="sa-btn sa-btn-primary sa-btn-sm">
              API Settings
            </Link>
          )}
          {canViewApi && (
            <Link to={`/super-admin/companies/${companyId}/api-tracking`} className="sa-btn sa-btn-primary sa-btn-sm">
              API Tracking
            </Link>
          )}
          {canViewVoice && (
            <Link to={`/super-admin/companies/${companyId}/voice-settings`} className="sa-btn sa-btn-primary sa-btn-sm">
              Voice
            </Link>
          )}
          {canViewAdminAccess && (
            <Link to={`/super-admin/companies/${companyId}/admin-settings-access`} className="sa-btn sa-btn-primary sa-btn-sm">
              Users
            </Link>
          )}
          {canViewTraining && (
            <Link to={`/super-admin/training/${companyId}`} className="sa-btn sa-btn-primary sa-btn-sm">
              Training
            </Link>
          )}
          {canEditAdminAccess && (
            <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={handleOpenAsAdmin} disabled={openAdminBusy}>
              {openAdminBusy ? 'Opening...' : 'Open As Company Admin'}
            </button>
          )}
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
        {canViewCompanyInfo && (
        <div className="sa-panel">
          <h3 className="sa-panel-title">Company Info</h3>
          <form onSubmit={handleEdit}>
            <div className="sa-field">
              <label>Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={25} required disabled={!canEditCompanyInfo} />
            </div>
            <div className="sa-field">
              <label>Description</label>
              <textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} disabled={!canEditCompanyInfo} />
            </div>
            <div className="sa-field">
              <label>Admin login email <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="email"
                value={editAdminEmail}
                onChange={(e) => setEditAdminEmail(e.target.value)}
                placeholder="admin@company.com"
                required
                disabled={!canEditCompanyInfo}
              />
              <p className="sa-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Company admins sign in with this email and their password. Must be unique across companies.
              </p>
            </div>

            <h4 className="sa-panel-title" style={{ fontSize: 15, marginTop: 16, marginBottom: 10 }}>
              Owner account profile
            </h4>
            <p className="sa-text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Same fields as the company admin &quot;Account profile&quot; page. Admins can also edit these themselves.
            </p>
            <div className="sa-field">
              <label>Owner name</label>
              <input
                type="text"
                value={editOwnerName}
                onChange={(e) => setEditOwnerName(e.target.value)}
                disabled={!canEditCompanyInfo}
                autoComplete="off"
              />
            </div>
            <div className="sa-field">
              <label>Phone number</label>
              <PhoneInputWithCountryCode
                countryCode={editPhoneCode}
                onCountryCodeChange={setEditPhoneCode}
                localNumber={editPhoneLocal}
                onLocalNumberChange={setEditPhoneLocal}
                disabled={!canEditCompanyInfo}
                placeholder="e.g. 5550100"
                autoComplete="tel"
              />
            </div>
            <div className="sa-field">
              <label>Company website</label>
              <input
                type="text"
                value={editCompanyWebsite}
                onChange={(e) => setEditCompanyWebsite(e.target.value)}
                placeholder="https://example.com"
                disabled={!canEditCompanyInfo}
                autoComplete="off"
              />
            </div>
            <div className="sa-field">
              <label>Industry category</label>
              <select
                value={industrySelect}
                onChange={(e) => handleIndustrySelectChange(e.target.value)}
                disabled={!canEditCompanyInfo}
              >
                <option value="">Select industry…</option>
                {INDUSTRY_PRESETS.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
                <option value={OTHER_VALUE}>{OTHER_VALUE}</option>
              </select>
            </div>
            {industrySelect === OTHER_VALUE ? (
              <div className="sa-field">
                <label>Please specify industry <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  value={industryOtherSpecify}
                  onChange={(e) => setIndustryOtherSpecify(e.target.value)}
                  placeholder='e.g. Agriculture, Non-profit'
                  maxLength={120}
                  required
                  disabled={!canEditCompanyInfo}
                />
                <p className="sa-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Required when Other is selected.
                </p>
              </div>
            ) : null}

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
                  {canEditCompanyInfo && company.embed_secret && (
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
                {canEditCompanyInfo && (
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginTop: 6 }} onClick={handleRegenerateEmbed}>
                    Regenerate embed secret
                  </button>
                )}
              </div>
            )}
            {company.lead_notification_email != null && (
              <div className="sa-field" style={{ marginTop: 8 }}>
                <label>Lead notification email</label>
                <div style={{ fontSize: 13 }}>{company.lead_notification_email || '—'}</div>
              </div>
            )}
            {canEditCompanyInfo && (
              <button type="submit" className="sa-btn sa-btn-primary sa-btn-sm" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</button>
            )}
          </form>
        </div>
        )}

        {/* Reset admin password */}
        {canViewAdminAccess && (
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
              <label>New Admin Password <span style={{ color: '#ef4444' }}>*</span></label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
                required
                disabled={!canEditAdminAccess}
              />
            </div>
            {canEditAdminAccess && (
            <button type="submit" className="sa-btn sa-btn-warning sa-btn-sm" disabled={resetBusy}>
              {resetBusy ? 'Resetting…' : company.admin_configured ? 'Reset Password' : 'Set Password'}
            </button>
            )}
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
