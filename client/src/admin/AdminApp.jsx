import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AdminToastProvider } from './context/AdminToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import ConversationMode from './pages/ConversationMode';
import Training from './pages/Training';
import './index.css';

function AdminLayout({ children }) {
  const { company, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--chat-bg)' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="d-flex min-vh-100" style={{ background: 'var(--chat-bg)' }}>
      <aside className="d-flex flex-column border-end" style={{ width: 220, background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)' }}>
        <div className="p-3 border-bottom" style={{ borderColor: 'var(--chat-border)' }}>
          <h6 className="mb-0" style={{ color: 'var(--chat-text-heading)' }}>{company?.displayName || 'Admin'}</h6>
          <small className="text-muted">Admin panel</small>
        </div>
        <nav className="nav flex-column p-2">
          <a className={`nav-link py-2 ${location.pathname === '/admin' || location.pathname === '/admin/' ? 'fw-bold' : ''}`} href="/admin" style={{ color: 'var(--chat-text)' }}>Dashboard</a>
          <a className={`nav-link py-2 ${location.pathname === '/admin/settings' ? 'fw-bold' : ''}`} href="/admin/settings" style={{ color: 'var(--chat-text)' }}>Settings</a>
          <a className={`nav-link py-2 ${location.pathname === '/admin/modes' ? 'fw-bold' : ''}`} href="/admin/modes" style={{ color: 'var(--chat-text)' }}>AI Mode</a>
          <a className={`nav-link py-2 ${location.pathname === '/admin/training' ? 'fw-bold' : ''}`} href="/admin/training" style={{ color: 'var(--chat-text)' }}>Training</a>
        </nav>
        <div className="mt-auto p-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
          <a className="nav-link py-2" href="/" style={{ color: 'var(--chat-muted)', fontSize: 13 }}>← Back to chat</a>
          <button className="btn btn-link nav-link p-0 text-danger" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
      <main className="flex-grow-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function AdminApp() {
  const { token } = useAuth();

  return (
    <AdminToastProvider>
      <Routes>
        <Route path="login" element={token ? <Navigate to="/admin/" replace /> : <Login />} />
        <Route
          index
          element={
            token ? (
              <AdminLayout>
                <Dashboard />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="settings"
          element={
            token ? (
              <AdminLayout>
                <Settings />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="modes"
          element={
            token ? (
              <AdminLayout>
                <ConversationMode />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="training"
          element={
            token ? (
              <AdminLayout>
                <Training />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/admin/" replace />} />
      </Routes>
    </AdminToastProvider>
  );
}
