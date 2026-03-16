import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { company, authFetch } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    authFetch('/settings')
      .then((r) => r.json())
      .then((d) => {
        setDisplayName(d.displayName || d.name || '');
        setIconUrl(d.iconUrl || '');
        setGreetingMessage(d.greetingMessage || '');
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
        {message && <div className="mb-2 text-small">{message}</div>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
