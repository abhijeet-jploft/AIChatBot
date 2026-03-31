import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import { useSuperToast } from '../context/ToastContext';

function resolveAvatarSrc(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  if (typeof window !== 'undefined' && s.startsWith('/')) {
    return `${window.location.origin}${s}`;
  }
  return s;
}

export default function SuperAdminProfile() {
  const navigate = useNavigate();
  const { admin, saFetch, refreshAdmin, logout } = useSuperAuth();
  const { showToast } = useSuperToast();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (!admin) return;
    setUsername(admin.type === 'staff' ? (admin.name || '') : (admin.username || ''));
    setEmail(admin.email || '');
  }, [admin]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await saFetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admin?.type === 'staff'
          ? { name: username.trim(), email: email.trim() || null }
          : { username: username.trim(), email: email.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      showToast('Profile saved', 'success');
      await refreshAdmin?.();
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      const res = await saFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      showToast(data.message || 'Password changed. Please log in again.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      await logout();
      navigate('/super-admin/login', { replace: true });
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  const onAvatarSelected = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setAvatarBusy(true);
      try {
        const fd = new FormData();
        fd.append('avatar', file);
        const res = await saFetch('/auth/profile/avatar', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        showToast('Profile photo updated', 'success');
        await refreshAdmin?.();
      } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
      } finally {
        setAvatarBusy(false);
      }
    },
    [saFetch, refreshAdmin, showToast]
  );

  const avatarSrc = resolveAvatarSrc(admin?.avatarUrl);
  const isStaff = admin?.type === 'staff';

  return (
    <div className="sa-page sa-profile-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">Your profile</h2>
      </div>
      <p style={{lineHeight: 0}} className="sa-text-muted sa-profile-subtitle ">
        Update how you appear in the super admin console and manage your sign-in credentials.
      </p>

      {admin?.mustChangePassword ? (
        <div className="sa-panel sa-panel-info sa-profile-force">
          <h4 className="sa-panel-title">Password change required</h4>
          <p className="sa-text-muted sa-mb">
            This staff account was created or reset with a temporary password. Update it now before using other modules.
          </p>
        </div>
      ) : null}

      <div className="sa-panel sa-profile-panel">
        {!isStaff ? (
          <>
            <h4 className="sa-panel-title">Profile photo</h4>
            <div className="sa-profile-photo-row">
              <div className="sa-profile-avatar-preview">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="sa-profile-avatar-image" />
                ) : (
                  <span className="sa-profile-avatar-fallback">
                    {(admin?.username || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <label className="sa-btn sa-btn-ghost sa-btn-sm" style={{ cursor: avatarBusy ? 'wait' : 'pointer' }}>
                  {avatarBusy ? 'Uploading…' : 'Change photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onAvatarSelected} disabled={avatarBusy} />
                </label>
                <div className="sa-text-muted sa-profile-photo-note">
                  JPEG, PNG, WebP, or GIF · max 2 MB
                </div>
              </div>
            </div>

            <hr className="sa-profile-divider" />
          </>
        ) : null}

        <form onSubmit={handleSaveProfile}>
          <h4 className="sa-panel-title">Account</h4>
          <div className="sa-field">
            <label>{isStaff ? 'Name' : 'Username'}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete={isStaff ? 'name' : 'username'}
              required
            />
          </div>
          <div className="sa-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>
          <div className="sa-field-actions">
            <button type="submit" className="sa-btn sa-btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>

        <hr className="sa-profile-divider" />

        <form onSubmit={handleChangePassword}>
          <h4 className="sa-panel-title">Change password</h4>
          <p className="sa-text-muted sa-profile-password-note">
            After a successful change, all sessions are ended and you must sign in again.
          </p>
          <div className="sa-field">
            <label>Current password</label>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="sa-field">
            <label>New password</label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="sa-field-actions">
            <button type="submit" className="sa-btn sa-btn-primary" disabled={changingPw}>
              {changingPw ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
