import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { useSaTheme } from '../context/ThemeContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function readJsonSafe(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text().catch(() => '');
  if (!raw) return {};
  if (!contentType.includes('application/json')) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function Login() {
  const { theme } = useSaTheme();
  const { login } = useSuperAuth();
  const { showToast } = useSuperToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupEmail, setSetupEmail] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/super-admin/auth/status`)
      .then((r) => readJsonSafe(r))
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      if (needsSetup) {
        const res = await fetch(`${API_BASE}/super-admin/auth/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), email: setupEmail.trim() || undefined, password }),
        });
        const data = await readJsonSafe(res);
        if (!res.ok) throw new Error(data.error || 'Setup failed');
        await login(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
      navigate('/super-admin', { replace: true });
    } catch (err) {
      showToast(err?.message || 'Authentication failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sa-shell" data-sa-theme={theme}>
    <div className="sa-login-page">
      <div className="sa-login-card">
        <div className="sa-login-brand">
          <div className="sa-brand-badge">SA</div>
          <div>
            <h5 className="sa-login-title">Super Admin</h5>
            <small className="sa-login-sub">Platform Management Console</small>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="sa-login-form">
          {needsSetup && (
            <div className="sa-setup-notice">
              <strong>First-time setup</strong> — Create your super admin account.
            </div>
          )}

          <div className="sa-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
            />
          </div>

          {needsSetup && (
            <div className="sa-field">
              <label>Email (optional)</label>
              <input
                type="email"
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
              />
            </div>
          )}

          <div className="sa-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength={8}
            />
          </div>

          <button type="submit" className="sa-btn sa-btn-primary sa-btn-full" disabled={submitting}>
            {submitting ? 'Please wait…' : needsSetup ? 'Create account & sign in' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
    </div>
  );
}
