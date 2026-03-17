import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

export default function Settings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [displayName, setDisplayName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [leadEmailNotificationsEnabled, setLeadEmailNotificationsEnabled] = useState(false);
  const [leadNotificationEmail, setLeadNotificationEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authFetch('/settings')
      .then(async (settingsRes) => {
        if (!settingsRes.ok) throw new Error('Failed to load settings');
        const d = await settingsRes.json();

        setDisplayName(d.displayName || d.name || '');
        setIconUrl(d.iconUrl || '');
        setGreetingMessage(d.greetingMessage || '');
        setLeadEmailNotificationsEnabled(Boolean(d.leadNotifications?.emailEnabled));
        setLeadNotificationEmail(d.leadNotifications?.email || '');
      })
      .catch(() => showToast('Failed to load settings', 'error'));
  }, [authFetch, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          iconUrl: iconUrl.trim() || undefined,
          greetingMessage: greetingMessage.trim() || undefined,
          leadNotifications: {
            emailEnabled: leadEmailNotificationsEnabled,
            email: leadNotificationEmail.trim() || null,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Settings saved', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Company settings</h5>
      <form onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
        <div className="mb-3">
          <label className="form-label">Display name</label>
          <input
            type="text"
            className="form-control"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Visible name in chatbot"
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Icon URL</label>
          <input
            type="url"
            className="form-control"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://example.com/icon.png"
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
          {iconUrl && (
            <div className="mt-2">
              <img src={iconUrl} alt="Preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} onError={(e) => e.target.style.display = 'none'} />
            </div>
          )}
        </div>
        <div className="mb-3">
          <label className="form-label">Greeting message</label>
          <textarea
            className="form-control"
            rows={3}
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            placeholder="Custom welcome message"
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Lead notifications</label>
          <div className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="leadEmailEnabled"
              checked={leadEmailNotificationsEnabled}
              onChange={(e) => setLeadEmailNotificationsEnabled(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="leadEmailEnabled">
              Send email notification when a new lead is captured
            </label>
          </div>
          <input
            type="email"
            className="form-control"
            value={leadNotificationEmail}
            onChange={(e) => setLeadNotificationEmail(e.target.value)}
            placeholder="owner@company.com"
            disabled={!leadEmailNotificationsEnabled}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
          <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
            Email includes lead name, requested service, and urgency level.
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
