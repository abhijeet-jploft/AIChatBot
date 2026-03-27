import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};

const labelStyle = { color: 'var(--chat-text)' };
const mutedStyle = { color: 'var(--chat-muted)' };
const headingStyle = { color: 'var(--chat-text-heading)', fontWeight: 700 };

export default function EmailSmtpSettings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [fallbackHint, setFallbackHint] = useState('');
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/email-smtp');
        if (!res.ok) throw new Error('Failed to load');
        const d = await res.json();
        if (cancelled) return;
        const s = d.smtp || {};
        setHost(s.host || '');
        setPort(s.port !== '' && s.port != null ? String(s.port) : '');
        setSecure(Boolean(s.secure));
        setUser(s.user || '');
        setFromEmail(s.fromEmail || '');
        setPasswordConfigured(Boolean(s.passwordConfigured));
        setFallbackHint(d.fallbackHint || '');
        setPassword('');
        setPasswordTouched(false);
      } catch {
        if (!cancelled) showToast('Failed to load SMTP settings', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authFetch, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const smtp = {
        host: host.trim(),
        port: port === '' ? null : Number.parseInt(port, 10),
        secure,
        user: user.trim(),
        fromEmail: fromEmail.trim(),
      };
      if (passwordTouched) smtp.password = password;
      const res = await authFetch('/email-smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const s = data.smtp || {};
      setPasswordConfigured(Boolean(s.passwordConfigured));
      setPassword('');
      setPasswordTouched(false);
      showToast('SMTP settings saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await authFetch('/email-smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Test send failed');
      showToast(`Test email sent to ${data.to}`, 'success');
    } catch (err) {
      showToast(err.message || 'Test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: 'var(--chat-muted)' }}>Loading…</div>
    );
  }

  return (
    <div className="p-4 mx-auto" style={{ maxWidth: 720 }}>
      <h5 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>
        Email — SMTP
      </h5>
      <p className="small mb-3" style={mutedStyle}>
        Configure outgoing mail for <strong style={{ color: 'var(--chat-text)' }}>lead notifications</strong> and reminder digests.
        This is separate from server-wide environment variables: if you leave SMTP host empty, the server&apos;s default{' '}
        <code>SMTP_*</code> settings are used.
      </p>
      {fallbackHint ? (
        <p className="small mb-3 rounded-2 p-2" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)', ...mutedStyle }}>
          {fallbackHint}
        </p>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>SMTP server</div>
          <div className="mb-3">
            <label className="form-label small" style={labelStyle}>Host</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. smtp.sendgrid.net (empty = use server default)"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              autoComplete="off"
              style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
            />
          </div>
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label small" style={labelStyle}>Port</label>
              <input
                type="number"
                min={1}
                max={65535}
                className="form-control"
                placeholder="587"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>
            <div className="col-12 col-md-8 d-flex align-items-end">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="smtp-secure"
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="smtp-secure" style={labelStyle}>
                  TLS / SSL (secure)
                </label>
                <div className="form-text" style={mutedStyle}>Typical: port 587 STARTTLS (unchecked) or 465 SSL (checked).</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Authentication</div>
          <div className="mb-3">
            <label className="form-label small" style={labelStyle}>Username</label>
            <input
              type="text"
              className="form-control"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
            />
          </div>
          <div className="mb-0">
            <label className="form-label small" style={labelStyle}>Password</label>
            <input
              type="password"
              className="form-control"
              placeholder={passwordConfigured ? '•••••••• (leave blank to keep)' : 'Optional if server allows unauthenticated relay'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordTouched(true);
              }}
              autoComplete="new-password"
              style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
            />
            <div className="form-text" style={mutedStyle}>
              Stored on the server for this company only. Clear by saving with an empty password.
            </div>
          </div>
        </div>

        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Sender</div>
          <div className="mb-0">
            <label className="form-label small" style={labelStyle}>From address</label>
            <input
              type="email"
              className="form-control"
              placeholder="notifications@yourdomain.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
            />
            <div className="form-text" style={mutedStyle}>
              Overrides <code>LEAD_NOTIFICATION_FROM</code> for this company when set.
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mb-4">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save SMTP settings'}
          </button>
        </div>
      </form>

      <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
        <div className="mb-2" style={headingStyle}>Send test email</div>
        <p className="small mb-3" style={mutedStyle}>
          Uses the saved company SMTP if host is set; otherwise the server default. Recipient defaults to your lead notification email or admin login email.
        </p>
        <div className="mb-3">
          <label className="form-label small" style={labelStyle}>To (optional)</label>
          <input
            type="email"
            className="form-control"
            placeholder="Override recipient"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
        </div>
        <button type="button" className="btn btn-outline-primary" disabled={testing} onClick={handleTest}>
          {testing ? 'Sending…' : 'Send test'}
        </button>
      </div>
    </div>
  );
}
