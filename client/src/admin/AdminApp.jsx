import { Routes, Route, Navigate, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AdminToastProvider } from './context/AdminToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Conversations from './pages/Conversations';
import LiveMonitoring from './pages/LiveMonitoring';
import Settings from './pages/Settings';
import ApiSettings from './pages/ApiSettings';
import VoiceSettings from './pages/VoiceSettings';
import Theme from './pages/Theme';
import ConversationMode from './pages/ConversationMode';
import Training from './pages/Training';
import Logs from './pages/Logs';
import MissedConversations from './pages/MissedConversations';
import SupportRequests from './pages/SupportRequests';
import TakeOver from './pages/TakeOver';
import AdminOperatorChat from './pages/AdminOperatorChat';
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
        { to: '/admin/leads', label: 'Leads', end: false },
        { to: '/admin/conversations', label: 'Conversations' },
        { to: '/admin/live-monitoring', label: 'Live monitoring' },
        { to: '/admin/missed-conversations', label: 'Missed conversations' },
        { to: '/admin/support-requests', label: 'Support requests' },
        { to: '/admin/take-over', label: 'Take over' },
        { to: '/admin/training', label: 'Training' },
        { to: '/admin/logs', label: 'Logs' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { to: '/admin/settings', label: 'Settings' },
        { to: '/admin/voice-settings', label: 'Voice Settings' },
        { to: '/admin/theme', label: 'Theme' },
        { to: '/admin/modes', label: 'AI Mode' },
      ],
    },
  ];

  /** Pages reachable by URL but not listed in the sidebar (hidden from nav). */
  const hiddenPageTitles = {
    '/admin/api-settings': 'API Settings',
  };

  const currentPageLabel =
    navGroups
      .flatMap((group) => group.items)
      .find(
        (item) =>
          item.to === location.pathname ||
          (item.end === false && location.pathname.startsWith(item.to + '/'))
      )?.label ||
    hiddenPageTitles[location.pathname] ||
    'Dashboard';

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
                    end={item.to === '/admin' ? true : item.end === false ? false : true}
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
          path="leads/:leadId?"
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
          path="conversations"
          element={
            token ? (
              <AdminLayout>
                <Conversations />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="live-monitoring"
          element={
            token ? (
              <AdminLayout>
                <LiveMonitoring />
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
          path="api-settings"
          element={
            token ? (
              <AdminLayout>
                <ApiSettings />
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
          path="voice-settings"
          element={
            token ? (
              <AdminLayout>
                <VoiceSettings />
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
        <Route
          path="logs"
          element={
            token ? (
              <AdminLayout>
                <Logs />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="missed-conversations"
          element={
            token ? (
              <AdminLayout>
                <MissedConversations />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="support-requests"
          element={
            token ? (
              <AdminLayout>
                <SupportRequests />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="take-over"
          element={
            token ? (
              <AdminLayout>
                <TakeOver />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="chat/:sessionId"
          element={token ? <AdminOperatorChat /> : <Navigate to="/admin/login" replace />}
        />
        <Route path="*" element={<Navigate to="/admin/" replace />} />
      </Routes>
    </AdminToastProvider>
  );
}
