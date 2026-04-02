import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import PasswordInput from '../../components/PasswordInput';
import { useAdminToast } from '../context/AdminToastContext';

export default function Login() {
  const { login, setError } = useAuth();
  const { showToast } = useAdminToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/admin', { replace: true });
    } catch (err) {
      showToast(err?.message || 'Login failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--chat-bg)' }}>
      <div className="card shadow" style={{ width: '100%', maxWidth: 400, background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-4">
          <h5 className="card-title mb-4" style={{ color: 'var(--chat-text-heading)' }}>
            Admin login
          </h5>
          <p className="small mb-3" style={{ color: 'var(--chat-text-muted)' }}>
            Sign in with the admin email and password issued by your platform administrator.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" style={{ color: 'var(--chat-text)' }}>Email <span className="text-danger">*</span></label>
              <input
                type="email"
                autoComplete="username"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label" style={{ color: 'var(--chat-text)' }}>Password <span className="text-danger">*</span></label>
              <PasswordInput
                autoComplete="current-password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
              {submitting ? 'Please wait…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
