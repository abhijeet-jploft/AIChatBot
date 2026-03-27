import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import {
  INDUSTRY_PRESETS,
  OTHER_VALUE,
  parseIndustryFromApi,
  buildIndustryToSave,
} from '../../lib/accountProfileIndustry';

export default function AccountProfile() {
  const { company, authFetch, refreshProfile } = useAuth();
  const { showToast } = useAdminToast();
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [industrySelect, setIndustrySelect] = useState('');
  const [industryOtherSpecify, setIndustryOtherSpecify] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setOwnerName(company.ownerName || '');
    setEmail(company.adminEmail || '');
    setPhone(company.phone || '');
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

    setSaving(true);
    try {
      const res = await authFetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerName: ownerName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          companyName: companyName.trim(),
          companyWebsite: companyWebsite.trim(),
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

  return (
    <div className="p-4">
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
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Email address</label>
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
              <input
                type="tel"
                className="form-control form-control-sm"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small" style={{ color: 'var(--chat-text)' }}>Company name</label>
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
                  Please specify your industry
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
            <Link to="/admin/settings" className="btn btn-outline-secondary btn-sm">
              Change password (Settings)
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
