import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { company, authFetch } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [themePrimaryColor, setThemePrimaryColor] = useState('#D72638');
  const [themePrimaryDarkColor, setThemePrimaryDarkColor] = useState('#8F1020');
  const [themeSecondaryColor, setThemeSecondaryColor] = useState('#050505');
  const [themeSecondaryLightColor, setThemeSecondaryLightColor] = useState('#1F1F1F');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    authFetch('/settings')
      .then((r) => r.json())
      .then((d) => {
        setDisplayName(d.displayName || d.name || '');
        setIconUrl(d.iconUrl || '');
        setGreetingMessage(d.greetingMessage || '');
        setThemePrimaryColor(d.theme?.primaryColor || '#D72638');
        setThemePrimaryDarkColor(d.theme?.primaryDarkColor || '#8F1020');
        setThemeSecondaryColor(d.theme?.secondaryColor || '#050505');
        setThemeSecondaryLightColor(d.theme?.secondaryLightColor || '#1F1F1F');
      })
      .catch(() => setMessage('Failed to load settings'));
  }, [authFetch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          iconUrl: iconUrl.trim() || undefined,
          greetingMessage: greetingMessage.trim() || undefined,
          theme: {
            primaryColor: themePrimaryColor,
            primaryDarkColor: themePrimaryDarkColor,
            secondaryColor: themeSecondaryColor,
            secondaryLightColor: themeSecondaryLightColor,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setMessage('Settings saved');
    } catch {
      setMessage('Failed to save settings');
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
          <label className="form-label">Theme colors</label>
          <div className="row g-3">
            <div className="col-sm-6">
              <label className="form-label small">Primary</label>
              <input type="color" className="form-control form-control-color" value={themePrimaryColor} onChange={(e) => setThemePrimaryColor(e.target.value)} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Primary dark shade</label>
              <input type="color" className="form-control form-control-color" value={themePrimaryDarkColor} onChange={(e) => setThemePrimaryDarkColor(e.target.value)} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Secondary</label>
              <input type="color" className="form-control form-control-color" value={themeSecondaryColor} onChange={(e) => setThemeSecondaryColor(e.target.value)} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Secondary light shade</label>
              <input type="color" className="form-control form-control-color" value={themeSecondaryLightColor} onChange={(e) => setThemeSecondaryLightColor(e.target.value)} />
            </div>
          </div>
          <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
            These company colors control the chatbot theme shown to visitors.
          </div>
        </div>
        {message && <div className="mb-2 text-small">{message}</div>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
