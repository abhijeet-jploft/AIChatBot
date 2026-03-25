import { useEffect, useState } from 'react';
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
import SupportTickets from './pages/SupportTickets';
import CompanySettings from './pages/CompanySettings';
import CompanyApiSettings from './pages/CompanyApiSettings';
import CompanyApiTracking from './pages/CompanyApiTracking';
import CompanyConfigurations from './pages/CompanyConfigurations';
import CompanyVoiceSettings from './pages/CompanyVoiceSettings';
import CompanyThemeSettings from './pages/CompanyThemeSettings';
import CompanyModeSettings from './pages/CompanyModeSettings';
import CompanyAdminSettingsAccess from './pages/CompanyAdminSettingsAccess';
import SuperAdminProfile from './pages/SuperAdminProfile';
import StaffWorkspace from './pages/StaffWorkspace';
import StaffManagement from './pages/StaffManagement';
import AccessDenied from './pages/AccessDenied';
import { hasPermission } from './lib/permissions';

const TRAINING_PERMISSION_CHECKS = [
  ['ai_configuration', 'view'],
  ['training_scrape', 'view'],
  ['training_conversational', 'view'],
  ['training_documents', 'view'],
  ['training_database', 'view'],
  ['training_media', 'view'],
  ['training_structured', 'view'],
  ['training_manual', 'view'],
];
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
  const companyMatch = location.pathname.match(/^\/super-admin\/companies\/([^/]+)/);
  const currentCompanyId = companyMatch?.[1] ? decodeURIComponent(companyMatch[1]) : null;
  const isForcedPasswordChange = admin?.type === 'staff' && admin?.mustChangePassword;
  const canAccess = (moduleKey, minimumLevel = 'view') => hasPermission(admin, moduleKey, minimumLevel);
  const canAccessCompanySelector =
    canAccess('business_management')
    || canAccess('ai_configuration')
    || canAccess('training_scrape')
    || canAccess('training_conversational')
    || canAccess('training_documents')
    || canAccess('training_database')
    || canAccess('training_media')
    || canAccess('training_structured')
    || canAccess('training_manual')
    || canAccess('voice_management')
    || canAccess('api_management')
    || canAccess('user_management');

  const navGroups = [
    {
      label: 'Platform',
      items: [
        ...(admin?.type === 'staff' ? [{ to: '/super-admin/staff', label: 'My Workspace' }] : []),
        ...(canAccess('dashboard') ? [{ to: '/super-admin', label: 'Dashboard', end: true }] : []),
        ...(canAccessCompanySelector ? [{ to: '/super-admin/companies', label: 'Companies', end: false }] : []),
        ...(canAccess('analytics') ? [{ to: '/super-admin/reports', label: 'Reports' }] : []),
        ...(canAccess('user_management') ? [{ to: '/super-admin/staff-management', label: 'Staff Management' }] : []),
        { to: '/super-admin/profile', label: 'My profile' },
      ],
    },
    {
      label: 'System',
      items: [
        ...(canAccess('system_settings') ? [{ to: '/super-admin/monitoring', label: 'System Monitoring' }] : []),
        ...(canAccess('support_tickets') ? [{ to: '/super-admin/support-tickets', label: 'Support Tickets' }] : []),
        ...(canAccess('system_settings') ? [{ to: '/super-admin/alert-rules', label: 'Alert Rules' }] : []),
      ],
    },
    ...(currentCompanyId ? [{
      label: 'Company',
      items: [
        ...(canAccess('user_management') ? [{ to: `/super-admin/companies/${encodeURIComponent(currentCompanyId)}/admin-settings-access`, label: 'Admin Settings Access' }] : []),
        ...(canAccess('api_management') ? [{ to: `/super-admin/companies/${encodeURIComponent(currentCompanyId)}/api-tracking`, label: 'API Tracking' }] : []),
      ],
    }] : []),
  ]
    .map((group) => ({ ...group, items: (group.items || []).filter(Boolean) }))
    .filter((group) => group.items.length > 0);

  const visibleNavGroups = isForcedPasswordChange
    ? navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.to === '/super-admin/profile') })).filter((group) => group.items.length > 0)
    : navGroups;

  const currentPageLabel =
    visibleNavGroups
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

          {visibleNavGroups.map((group) => (
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
                  admin?.name?.[0]?.toUpperCase() || admin?.username?.[0]?.toUpperCase() || 'S'
                )}
              </div>
              <div>
                <div className="sa-user-name">{admin?.name || admin?.username || 'Super Admin'}</div>
                <div className="sa-user-role">{admin?.roleName || admin?.email || 'Platform Admin'}</div>
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

function RequirePermission({ moduleKey, minimumLevel = 'view', children }) {
  const { admin, loading, refreshAdmin } = useSuperAuth();
  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [rechecked, setRechecked] = useState(false);

  useEffect(() => {
    setRechecked(false);
    setRefreshing(false);
  }, [location.pathname, moduleKey, minimumLevel, admin?.id]);

  useEffect(() => {
    if (loading || refreshing || rechecked) return;
    if (admin?.type !== 'staff') return;
    if (admin.mustChangePassword) return;
    if (hasPermission(admin, moduleKey, minimumLevel)) return;

    let cancelled = false;
    setRefreshing(true);
    Promise.resolve(refreshAdmin?.())
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setRefreshing(false);
        setRechecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [admin, loading, minimumLevel, moduleKey, refreshAdmin, refreshing, rechecked]);

  if (loading || refreshing) {
    return (
      <div className="sa-shell sa-full-center">
        <div className="sa-spinner" />
      </div>
    );
  }
  if (!admin) {
    return <Navigate to="/super-admin/login" state={{ from: location }} replace />;
  }
  if (admin.type === 'staff' && admin.mustChangePassword && location.pathname !== '/super-admin/profile') {
    return <Navigate to="/super-admin/profile" replace />;
  }
  if (!hasPermission(admin, moduleKey, minimumLevel)) {
    return <Navigate to="/super-admin/access-denied" replace />;
  }
  return children;
}

function RequireAnyPermission({ checks, children }) {
  const { admin, loading, refreshAdmin } = useSuperAuth();
  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [rechecked, setRechecked] = useState(false);

  useEffect(() => {
    setRechecked(false);
    setRefreshing(false);
  }, [location.pathname, admin?.id, JSON.stringify(checks || [])]);

  const allowed = (checks || []).some(([moduleKey, minimumLevel]) => hasPermission(admin, moduleKey, minimumLevel || 'view'));

  useEffect(() => {
    if (loading || refreshing || rechecked) return;
    if (admin?.type !== 'staff') return;
    if (admin.mustChangePassword) return;
    if (allowed) return;

    let cancelled = false;
    setRefreshing(true);
    Promise.resolve(refreshAdmin?.())
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setRefreshing(false);
        setRechecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [admin, allowed, loading, refreshAdmin, refreshing, rechecked]);

  if (loading || refreshing) {
    return (
      <div className="sa-shell sa-full-center">
        <div className="sa-spinner" />
      </div>
    );
  }
  if (!admin) {
    return <Navigate to="/super-admin/login" state={{ from: location }} replace />;
  }
  if (admin.type === 'staff' && admin.mustChangePassword && location.pathname !== '/super-admin/profile') {
    return <Navigate to="/super-admin/profile" replace />;
  }
  if (!allowed) {
    return <Navigate to="/super-admin/access-denied" replace />;
  }
  return children;
}

function HomeRoute() {
  const { admin } = useSuperAuth();
  if (admin?.type === 'staff' && !hasPermission(admin, 'dashboard', 'view')) {
    return <Navigate to="/super-admin/staff" replace />;
  }
  return <Dashboard />;
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
                  <Route index element={<HomeRoute />} />
                  <Route path="staff" element={<StaffWorkspace />} />
                  <Route path="access-denied" element={<AccessDenied />} />
                  <Route path="staff-management" element={<RequirePermission moduleKey="user_management"><StaffManagement /></RequirePermission>} />
                  <Route path="companies" element={<RequireAnyPermission checks={[
                    ['business_management', 'view'],
                    ['ai_configuration', 'view'],
                    ['voice_management', 'view'],
                    ['api_management', 'view'],
                    ['user_management', 'view'],
                  ]}><Companies /></RequireAnyPermission>} />
                  <Route path="companies/:companyId/settings" element={<RequirePermission moduleKey="business_management"><CompanySettings /></RequirePermission>} />
                  <Route path="companies/:companyId/api-settings" element={<RequirePermission moduleKey="api_management"><CompanyApiSettings /></RequirePermission>} />
                  <Route path="companies/:companyId/api-tracking" element={<RequirePermission moduleKey="api_management"><CompanyApiTracking /></RequirePermission>} />
                  <Route path="companies/:companyId/configurations" element={<RequireAnyPermission checks={[
                    ['business_management', 'view'],
                    ['ai_configuration', 'view'],
                    ['voice_management', 'view'],
                    ['api_management', 'view'],
                    ['user_management', 'view'],
                  ]}><CompanyConfigurations /></RequireAnyPermission>} />
                  <Route path="companies/:companyId/admin-settings-access" element={<RequirePermission moduleKey="user_management"><CompanyAdminSettingsAccess /></RequirePermission>} />
                  <Route path="companies/:companyId/voice-settings" element={<RequirePermission moduleKey="voice_management"><CompanyVoiceSettings /></RequirePermission>} />
                  <Route path="companies/:companyId/theme-settings" element={<RequirePermission moduleKey="system_settings"><CompanyThemeSettings /></RequirePermission>} />
                  <Route path="companies/:companyId/mode-settings" element={<RequirePermission moduleKey="ai_configuration"><CompanyModeSettings /></RequirePermission>} />
                  <Route path="companies/:companyId" element={<RequireAnyPermission checks={[
                    ['business_management', 'view'],
                    ['ai_configuration', 'view'],
                    ['voice_management', 'view'],
                    ['api_management', 'view'],
                    ['user_management', 'view'],
                  ]}><CompanyDetail /></RequireAnyPermission>} />
                  <Route path="training/:companyId" element={<RequireAnyPermission checks={TRAINING_PERMISSION_CHECKS}><Training /></RequireAnyPermission>} />
                  <Route path="monitoring" element={<RequirePermission moduleKey="system_settings"><SystemMonitoring /></RequirePermission>} />
                  <Route path="support-tickets" element={<RequirePermission moduleKey="support_tickets"><SupportTickets /></RequirePermission>} />
                  <Route path="reports" element={<RequirePermission moduleKey="analytics"><Reports /></RequirePermission>} />
                  <Route path="alert-rules" element={<RequirePermission moduleKey="system_settings"><AlertRules /></RequirePermission>} />
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
