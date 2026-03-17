import { Routes, Route, Navigate, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AdminToastProvider } from './context/AdminToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Settings from './pages/Settings';
import Theme from './pages/Theme';
import ConversationMode from './pages/ConversationMode';
import Training from './pages/Training';
import './index.css';

function AdminLayout({ children }) {
  const { company, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const companyName = company?.displayName || 'Admin';

  const navGroups = [
    {
      label: 'Main',
      items: [
        { to: '/admin', label: 'Dashboard' },
        { to: '/admin/leads', label: 'Leads' },
        { to: '/admin/training', label: 'Training' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { to: '/admin/settings', label: 'Settings' },
        { to: '/admin/theme', label: 'Theme' },
        { to: '/admin/modes', label: 'AI Mode' },
      ],
    },
  ];

  const currentPageLabel = (
    navGroups
      .flatMap((group) => group.items)
      .find((item) => item.to === location.pathname)?.label || 'Dashboard'
  );

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
    <div className="admin-shell">
      <div className="admin-board">
        <aside className="admin-sidebar">
          <div className="admin-brand-wrap">
            <div className="admin-brand-badge">AI</div>
            <div>
              <h6 className="mb-0 admin-brand-title">{companyName}</h6>
              <small className="admin-brand-subtitle">Admin workspace</small>
            </div>
          </div>

          {navGroups.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <div className="admin-nav-group-title">{group.label}</div>
              <nav className="nav flex-column">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}

          <div className="admin-sidebar-footer">
            <NavLink className="admin-sidebar-muted-link" to="/">
              Back to chat
            </NavLink>
            <button className="admin-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-topbar">
            <div>
              <p className="admin-welcome mb-1">Welcome,</p>
              <h5 className="mb-0 admin-page-title">{currentPageLabel}</h5>
            </div>
            <div className="admin-topbar-search-wrap">
              <input
                className="admin-topbar-search"
                type="search"
                placeholder="Find settings, leads, or pages"
                aria-label="Search admin pages"
              />
            </div>
          </header>
          <div className="admin-content">{children}</div>
        </main>
      </div>
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
          path="leads"
          element={
            token ? (
              <AdminLayout>
                <Leads />
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
          path="theme"
          element={
            token ? (
              <AdminLayout>
                <Theme />
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
