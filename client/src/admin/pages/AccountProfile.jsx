import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import {
  INDUSTRY_PRESETS,
  OTHER_VALUE,
  parseIndustryFromApi,
  buildIndustryToSave,
} from '../../lib/accountProfileIndustry';
import PhoneInputWithCountryCode from '../../components/PhoneInputWithCountryCode';
import PasswordInput from '../../components/PasswordInput';
import {
  normalizeUrlForSubmit,
  splitPhoneForForm,
  validatePhone,
  validateEmail,
} from '../../lib/contactValidation';

export default function AccountProfile() {
  const { company, authFetch, refreshProfile } = useAuth();
  const { showToast } = useAdminToast();
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [industrySelect, setIndustrySelect] = useState('');
  const [industryOtherSpecify, setIndustryOtherSpecify] = useState('');
  const [saving, setSaving] = useState(false);

  /* --- Password & sessions state --- */
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [logoutAllPending, setLogoutAllPending] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!company) return;
    setOwnerName(company.ownerName || '');
    setEmail(company.adminEmail || '');
    const phoneParsed = splitPhoneForForm(company.phone || '', '+1');
    setPhoneCountryCode(phoneParsed.countryCode);
    setPhoneLocal(phoneParsed.localNumber);
    setCompanyName(company.displayName || '');
    setCompanyWebsite(company.companyWebsite || '');
    const { select, other } = parseIndustryFromApi(company.industryCategory);
    setIndustrySelect(select);
    setIndustryOtherSpecify(other);
  }, [company]);

  const handleIndustrySelectChange = (value) => {
    setIndustrySelect(value);
    if (value !== OTHER_VALUE) setIndustryOtherSpecify('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const specify = industryOtherSpecify.trim();
    if (industrySelect === OTHER_VALUE && !specify) {
      showToast('Please specify your industry when you choose “Other”.', 'error');
      return;
    }

    const industryCategory = buildIndustryToSave(industrySelect, specify);
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      showToast(emailCheck.error, 'error');
      return;
    }
    const phoneCheck = validatePhone(phoneCountryCode, phoneLocal);
    if (!phoneCheck.valid) {
      showToast(phoneCheck.error, 'error');
      return;
    }
    const normalizedWebsite = normalizeUrlForSubmit(companyWebsite);
    if (normalizedWebsite === null) {
      showToast('Please enter a valid company website URL.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerName: ownerName.trim(),
          email: email.trim(),
          phone: phoneCheck.normalized,
          companyName: companyName.trim(),
          companyWebsite: normalizedWebsite,
          industryCategory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save profile');
      await refreshProfile();
      showToast('Profile saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const showOtherInput = industrySelect === OTHER_VALUE;

  /* --- Sessions loader --- */
  const loadSessions = () => {
    setSessionsLoading(true);
    authFetch('/settings/sessions')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      })
      .finally(() => setSessionsLoading(false));
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Password change handler --- */
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showToast('Please fill all password fields', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error');
      return;
    }
    if (!/[A-Z]/.test(passwordForm.newPassword)) {
      showToast('New password must contain at least one uppercase letter', 'error');
      return;
    }
    if (!/[a-z]/.test(passwordForm.newPassword)) {
      showToast('New password must contain at least one lowercase letter', 'error');
      return;
    }
    if (!/[0-9]/.test(passwordForm.newPassword)) {
      showToast('New password must contain at least one number', 'error');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await authFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password updated successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  /* --- Logout all sessions handler --- */
  const handleLogoutAll = () => {
    if (!window.confirm('Log out all admin sessions for this company? You will need to sign in again.')) return;
    setLogoutAllPending(true);
    authFetch('/settings/sessions', { method: 'DELETE' })
      .then(async (res) => {
        if (res.ok) {
          showToast('All sessions logged out', 'success');
          loadSessions();
          window.location.href = '/admin';
        } else showToast('Failed to log out sessions', 'error');
      })
      .finally(() => setLogoutAllPending(false));
  };

  return (
    <div className="p-4" id="account-profile-top">
      <div className="mb-3">
        <h5 className="mb-1" style={{ color: 'var(--chat-text-heading)' }}>Account profile</h5>
        <p className="small mb-0" style={{ color: 'var(--chat-muted)' }}>
          Update your personal and company contact details. Sign-in email changes take effect on next login.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)', maxWidth: 640 }}
      >
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Owner name</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={ownerName}
                onChange={(ev) => setOwnerName(ev.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Email address <span className="text-danger">*</span></label>
              <input
                type="email"
                className="form-control form-control-sm"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Phone number</label>
              <PhoneInputWithCountryCode
                countryCode={phoneCountryCode}
                onCountryCodeChange={setPhoneCountryCode}
                localNumber={phoneLocal}
                onLocalNumberChange={setPhoneLocal}
                selectClassName="form-select form-select-sm"
                inputClassName="form-control form-control-sm"
                autoComplete="tel"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Company name <span className="text-danger">*</span></label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={companyName}
                onChange={(ev) => setCompanyName(ev.target.value)}
                required
                autoComplete="organization"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Company website</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={companyWebsite}
                onChange={(ev) => setCompanyWebsite(ev.target.value)}
                placeholder="https://example.com"
                autoComplete="url"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Industry category</label>
              <select
                className="form-select form-select-sm"
                value={industrySelect}
                onChange={(ev) => handleIndustrySelectChange(ev.target.value)}
              >
                <option value="">Select industry…</option>
                {INDUSTRY_PRESETS.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
                <option value={OTHER_VALUE}>{OTHER_VALUE}</option>
              </select>
            </div>
            {showOtherInput ? (
              <div className="col-12">
                <label className="form-label small" style={{ color: 'var(--chat-text)' }}>
                  Please specify your industry <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={industryOtherSpecify}
                  onChange={(ev) => setIndustryOtherSpecify(ev.target.value)}
                  placeholder='Describe your industry (e.g. "Agriculture", "Non-profit")'
                  required
                  maxLength={120}
                  aria-required="true"
                />
                <div className="form-text small" style={{ color: 'var(--chat-muted)' }}>
                  Required when &quot;Other&quot; is selected.
                </div>
              </div>
            ) : null}
          </div>

          <div className="d-flex flex-wrap gap-2 align-items-center mt-4 pt-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>

      {/* Sessions */}
      <div className="card mt-4" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)', maxWidth: 640 }}>
        <div className="card-body">
          <h6 className="mb-1" style={{ color: 'var(--chat-text-heading)' }}>Sessions</h6>
          <p className="small mb-3" style={{ color: 'var(--chat-muted)' }}>Active admin sessions for this company.</p>
          {sessionsLoading ? (
            <p className="small" style={{ color: 'var(--chat-muted)' }}>Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="small" style={{ color: 'var(--chat-muted)' }}>No other active sessions.</p>
          ) : (
            <ul className="small mb-3 ps-3" style={{ color: 'var(--chat-muted)' }}>
              {sessions.slice(0, 10).map((s, i) => (
                <li key={s.id || i}>Session — created {s.created_at ? new Date(s.created_at).toLocaleString() : ''}</li>
              ))}
              {sessions.length > 10 && <li>... and {sessions.length - 10} more</li>}
            </ul>
          )}
          <button type="button" className="btn btn-outline-danger btn-sm"
            onClick={handleLogoutAll}
            disabled={logoutAllPending}>
            {logoutAllPending ? 'Logging out...' : 'Log out all sessions'}
          </button>
        </div>
      </div>

      {/* Password management */}
      <div className="card mt-4" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)', maxWidth: 640 }}>
        <div className="card-body">
          <h6 className="mb-1" style={{ color: 'var(--chat-text-heading)' }}>Password Management</h6>
          <p className="small mb-3" style={{ color: 'var(--chat-muted)' }}>Change admin password with current password verification and strength validation.</p>
          <div className="row g-2">
            <div className="col-12 col-md-4">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Current password <span className="text-danger">*</span></label>
              <PasswordInput
                className="form-control form-control-sm"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>New password <span className="text-danger">*</span></label>
              <PasswordInput
                className="form-control form-control-sm"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Confirm new password <span className="text-danger">*</span></label>
              <PasswordInput
                className="form-control form-control-sm"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="form-text mt-2" style={{ color: 'var(--chat-muted)' }}>Use at least 8 characters with uppercase, lowercase and a number.</div>
          <button type="button" className="btn btn-outline-primary btn-sm mt-3" disabled={changingPassword} onClick={handleChangePassword}>
            {changingPassword ? 'Updating password...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}
