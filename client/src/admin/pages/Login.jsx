import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useAdminToast } from '../context/AdminToastContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function Login() {
  const { login, setup, setError } = useAuth();
  const { showToast } = useAdminToast();
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState([]);
  const [isSetup, setIsSetup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/companies`)
      .then((r) => r.json())
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => setCompanies([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSetup) {
        await setup(companyId.trim(), password);
      } else {
        await login(companyId.trim(), password);
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      showToast(err?.message || (isSetup ? 'Setup failed' : 'Login failed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--chat-bg)' }}>
      <div className="card shadow" style={{ width: '100%', maxWidth: 400, background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
        <div className="card-body p-4">
          <h5 className="card-title mb-4" style={{ color: 'var(--chat-text-heading)' }}>
            {isSetup ? 'Set up admin access' : 'Admin login'}
          </h5>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" style={{ color: 'var(--chat-text)' }}>Company</label>
              <select
                className="form-select"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                required
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label" style={{ color: 'var(--chat-text)' }}>Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSetup ? 'Minimum 6 characters' : 'Enter password'}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100 mb-2" disabled={submitting}>
              {submitting ? 'Please wait…' : isSetup ? 'Set password & login' : 'Login'}
            </button>
            <button
              type="button"
              className="btn btn-link w-100 text-decoration-none"
              onClick={() => { setIsSetup(!isSetup); setError(null); }}
            >
              {isSetup ? 'Already have a password? Login' : 'First time? Set up password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
