import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useSuperAuth } from './context/AuthContext';
import { useSaTheme } from './context/ThemeContext';
import { SuperToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Training from './pages/Training';
import SystemMonitoring from './pages/SystemMonitoring';
import Reports from './pages/Reports';
import AlertRules from './pages/AlertRules';
import CompanySettings from './pages/CompanySettings';
import CompanyApiSettings from './pages/CompanyApiSettings';
import CompanyConfigurations from './pages/CompanyConfigurations';
import CompanyVoiceSettings from './pages/CompanyVoiceSettings';
import CompanyThemeSettings from './pages/CompanyThemeSettings';
import CompanyModeSettings from './pages/CompanyModeSettings';
import SuperAdminProfile from './pages/SuperAdminProfile';
import './index.css';

function saAvatarSrc(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  if (typeof window !== 'undefined' && s.startsWith('/')) return `${window.location.origin}${s}`;
  return s;
}

function SuperAdminLayout({ children }) {
  const { admin, logout } = useSuperAuth();
  const { theme, toggleTheme } = useSaTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const navGroups = [
    {
      label: 'Platform',
      items: [
        { to: '/super-admin', label: 'Dashboard', end: true },
        { to: '/super-admin/companies', label: 'Companies', end: false },
        { to: '/super-admin/reports', label: 'Reports' },
        { to: '/super-admin/profile', label: 'My profile' },
      ],
    },
    {
      label: 'System',
      items: [
        { to: '/super-admin/monitoring', label: 'System Monitoring' },
        { to: '/super-admin/alert-rules', label: 'Alert Rules' },
      ],
    },
  ];

  const currentPageLabel =
    navGroups
      .flatMap((g) => g.items)
      .find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))
      ?.label || 'Super Admin';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const companyMatch = location.pathname.match(/^\/super-admin\/companies\/([^/]+)/);
    const companyPart = companyMatch?.[1] ? ` · ${decodeURIComponent(companyMatch[1])}` : '';
    document.title = `Super Admin${companyPart} · ${currentPageLabel}`;
  }, [location.pathname, currentPageLabel]);

  const handleLogout = async () => {
    await logout();
    navigate('/super-admin/login', { replace: true });
  };

  return (
    <div className="sa-shell" data-sa-theme={theme}>
      <div className="sa-board">
        <aside className="sa-sidebar">
          <div className="sa-brand-wrap">
            <div className="sa-brand-badge">SA</div>
            <div>
              <h6 className="mb-0 sa-brand-title">Super Admin</h6>
              <small className="sa-brand-subtitle">Platform Management</small>
            </div>
          </div>

          {navGroups.map((group) => (
            <div key={group.label} className="sa-nav-group">
              <div className="sa-nav-group-title">{group.label}</div>
              <nav className="sa-nav">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end !== false}
                    className={({ isActive }) => `sa-nav-link${isActive ? ' is-active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}

          <div className="sa-sidebar-footer">
            <div className="sa-sidebar-user">
              <div className="sa-user-avatar">
                {admin?.avatarUrl ? (
                  <img src={saAvatarSrc(admin.avatarUrl)} alt="" />
                ) : (
                  admin?.username?.[0]?.toUpperCase() || 'S'
                )}
              </div>
              <div>
                <div className="sa-user-name">{admin?.username || 'Super Admin'}</div>
                <div className="sa-user-role">{admin?.email || 'Platform Admin'}</div>
              </div>
            </div>
            <button className="sa-logout-btn" onClick={handleLogout} title="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </aside>

        <main className="sa-main">
          <header className="sa-topbar">
            <span className="sa-topbar-title">{currentPageLabel}</span>
            <button
              type="button"
              className="sa-theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3c0 5 4 9 9 9 .27 0 .53-.01.79-.04A1 1 0 0 1 21 12.79z" />
                </svg>
              )}
            </button>
          </header>
          <div className="sa-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function RequireSuperAuth({ children }) {
  const { admin, loading } = useSuperAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="sa-shell sa-full-center">
        <div className="sa-spinner" />
      </div>
    );
  }
  if (!admin) {
    return <Navigate to="/super-admin/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function SuperAdminApp() {
  return (
    <SuperToastProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          path="*"
          element={
            <RequireSuperAuth>
              <SuperAdminLayout>
                <Routes>
                  <Route index element={<Dashboard />} />
                  <Route path="companies" element={<Companies />} />
                  <Route path="companies/:companyId/settings" element={<CompanySettings />} />
                  <Route path="companies/:companyId/api-settings" element={<CompanyApiSettings />} />
                  <Route path="companies/:companyId/configurations" element={<CompanyConfigurations />} />
                  <Route path="companies/:companyId/voice-settings" element={<CompanyVoiceSettings />} />
                  <Route path="companies/:companyId/theme-settings" element={<CompanyThemeSettings />} />
                  <Route path="companies/:companyId/mode-settings" element={<CompanyModeSettings />} />
                  <Route path="companies/:companyId" element={<CompanyDetail />} />
                  <Route path="training/:companyId" element={<Training />} />
                  <Route path="monitoring" element={<SystemMonitoring />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="alert-rules" element={<AlertRules />} />
                  <Route path="profile" element={<SuperAdminProfile />} />
                  <Route path="*" element={<Navigate to="/super-admin" replace />} />
                </Routes>
              </SuperAdminLayout>
            </RequireSuperAuth>
          }
        />
      </Routes>
    </SuperToastProvider>
  );
}
