import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AdminToastProvider } from './context/AdminToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Conversations from './pages/Conversations';
import LiveMonitoring from './pages/LiveMonitoring';
import Settings from './pages/Settings';
import AccountProfile from './pages/AccountProfile';
import NotificationPreferences from './pages/NotificationPreferences';
import EmailSmtpSettings from './pages/EmailSmtpSettings';
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
import VirtualAssistant from './pages/VirtualAssistant';
import './index.css';
import { hasAnyTrainingModuleAccess, hasAnyVoiceSettingAccess, mergeAdminVisibility } from '../constants/adminVisibility';

const ADMIN_SEARCH_ENTRIES = [
  { page: 'Dashboard', text: 'Key metrics', to: '/admin', hash: 'dashboard-key-metrics', keywords: 'kpi metrics conversion visitors leads' },
  { page: 'Dashboard', text: 'Live activity', to: '/admin', hash: 'dashboard-live-activity', keywords: 'live activity current pages active visitors' },
  { page: 'Dashboard', text: 'Lead snapshot', to: '/admin', hash: 'dashboard-lead-snapshot', keywords: 'recent leads view lead' },
  { page: 'Dashboard', text: 'Conversation snapshot', to: '/admin', hash: 'dashboard-conversation-snapshot', keywords: 'recent conversations operate chat' },
  { page: 'Leads', text: 'Lead list and details', to: '/admin/leads', hash: 'leads-top', keywords: 'crm lead status follow-up reminder update' },
  { page: 'Conversations', text: 'Conversation filters', to: '/admin/conversations', hash: 'conversations-filters', keywords: 'search date status intent outcome' },
  { page: 'Conversations', text: 'Conversation table', to: '/admin/conversations', hash: 'conversations-table', keywords: 'visitor id duration source page operate chat' },
  { page: 'Live monitoring', text: 'Live session monitor', to: '/admin/live-monitoring', hash: 'live-monitoring-top', keywords: 'active sessions typing visitors' },
  { page: 'Missed conversations', text: 'Missed visitor chats', to: '/admin/missed-conversations', hash: 'missed-conversations-top', keywords: 'left chats follow up' },
  { page: 'Support requests', text: 'Support tickets queue', to: '/admin/support-requests', hash: 'support-requests-top', keywords: 'ticket support request' },
  { page: 'Take over', text: 'Operator takeover controls', to: '/admin/take-over', hash: 'take-over-top', keywords: 'take over operator send message' },
  { page: 'Training', text: 'Knowledge and training', to: '/admin/training', hash: 'training-top', keywords: 'documents website scrape retrain ai' },
  { page: 'Logs', text: 'System and audit logs', to: '/admin/logs', hash: 'logs-top', keywords: 'logs events admin actions' },
  { page: 'Account profile', text: 'Company profile', to: '/admin/account-profile', hash: 'account-profile-top', keywords: 'name domain company profile' },
  { page: 'Notifications', text: 'Notification preferences', to: '/admin/notification-preferences', hash: 'notification-preferences-top', keywords: 'alerts email whatsapp' },
  { page: 'Email (SMTP)', text: 'SMTP configuration', to: '/admin/email-smtp', hash: 'email-smtp-top', keywords: 'smtp sender email settings' },
  { page: 'Settings', text: 'Chatbot settings', to: '/admin/settings', hash: 'settings-top', keywords: 'agent language tone prompts' },
  { page: 'Theme', text: 'Theme customization', to: '/admin/theme', hash: 'theme-top', keywords: 'colors widget theme' },
  { page: 'Voice settings', text: 'Voice provider settings', to: '/admin/voice-settings', hash: 'voice-settings-top', keywords: 'voice tts elevenlabs' },
  { page: 'AI Mode', text: 'AI mode controls', to: '/admin/modes', hash: 'modes-top', keywords: 'ai mode automation response mode' },
  { page: 'Virtual Assistant', text: 'Avatar assistant settings', to: '/admin/virtual-assistant', hash: 'virtual-assistant-top', keywords: 'virtual assistant avatar liveavatar video ai' },
];

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function AdminLayout({ children }) {
  const { company, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const companyName = company?.displayName || 'Admin';
  const adminVisibility = mergeAdminVisibility(company?.adminVisibility);
  const canAccessVoiceSettings = hasAnyVoiceSettingAccess(adminVisibility);
  const canAccessAiMode = Boolean(adminVisibility.aiMode);
  const canAccessTraining = hasAnyTrainingModuleAccess(adminVisibility);
  const canAccessVA = Boolean(adminVisibility.virtualAssistant);

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
        ...(canAccessTraining ? [{ to: '/admin/training', label: 'Training' }] : []),
        { to: '/admin/logs', label: 'Logs' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { to: '/admin/account-profile', label: 'Account profile' },
        { to: '/admin/notification-preferences', label: 'Notifications' },
        { to: '/admin/email-smtp', label: 'Email (SMTP)' },
        { to: '/admin/settings', label: 'Settings' },
        ...(canAccessVoiceSettings ? [{ to: '/admin/voice-settings', label: 'Voice Settings' }] : []),
        { to: '/admin/theme', label: 'Theme' },
        ...(canAccessAiMode ? [{ to: '/admin/modes', label: 'AI Mode' }] : []),
        ...(canAccessVA ? [{ to: '/admin/virtual-assistant', label: 'Virtual Assistant' }] : []),
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const searchResults = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    if (!q) return [];
    return ADMIN_SEARCH_ENTRIES
      .filter((entry) => {
        const haystack = `${entry.page} ${entry.text} ${entry.keywords}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 10);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `${companyName} Admin · ${currentPageLabel}`;
  }, [companyName, currentPageLabel]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(event.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const sectionId = decodeURIComponent(location.hash.slice(1));
    const timer = setTimeout(() => {
      const node = document.getElementById(sectionId);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [location.pathname, location.hash]);

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

  const handleSearchResultClick = (entry) => {
    const to = `${entry.to}${entry.hash ? `#${entry.hash}` : ''}`;
    navigate(to);
    setSearchOpen(false);
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
            <button className="admin-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </aside>

        <main className="admin-main">
          {company?.isSuspended ? (
            <div
              role="alert"
              style={{
                margin: '14px 20px 0',
                border: '1px solid #fca5a5',
                background: '#7f1d1d',
                color: '#fee2e2',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              This company is suspended. Any changes in admin have no effect, and the chatbot is paused until issue resolve's.
            </div>
          ) : null}
          <header className="admin-topbar">
            <div>
              <p className="admin-welcome mb-1">Welcome,</p>
              <h5 className="mb-0 admin-page-title">{currentPageLabel}</h5>
            </div>
            <div className="admin-topbar-search-wrap" ref={searchRef}>
              <input
                className="admin-topbar-search"
                type="search"
                placeholder="Find settings, leads, or pages"
                aria-label="Search admin pages"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                    return;
                  }
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    e.preventDefault();
                    handleSearchResultClick(searchResults[0]);
                  }
                }}
              />
              {searchOpen && searchQuery.trim() ? (
                <div className="admin-search-popup" role="listbox" aria-label="Admin search results">
                  {searchResults.length > 0 ? (
                    searchResults.map((entry, index) => (
                      <button
                        key={`${entry.to}-${entry.hash || 'top'}-${index}`}
                        type="button"
                        className="admin-search-popup-item"
                        onClick={() => handleSearchResultClick(entry)}
                      >
                        <span className="admin-search-popup-page">{entry.page}</span>
                        <span className="admin-search-popup-text">{entry.text}</span>
                      </button>
                    ))
                  ) : (
                    <div className="admin-search-popup-empty">No page or text found.</div>
                  )}
                </div>
              ) : null}
            </div>
          </header>
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { token, company } = useAuth();
  const adminVisibility = mergeAdminVisibility(company?.adminVisibility);
  const canAccessVoiceSettings = hasAnyVoiceSettingAccess(adminVisibility);
  const canAccessAiMode = Boolean(adminVisibility.aiMode);
  const canAccessTraining = hasAnyTrainingModuleAccess(adminVisibility);
  const canAccessVA = Boolean(adminVisibility.virtualAssistant);

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
          path="account-profile"
          element={
            token ? (
              <AdminLayout>
                <AccountProfile />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="notification-preferences"
          element={
            token ? (
              <AdminLayout>
                <NotificationPreferences />
              </AdminLayout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="email-smtp"
          element={
            token ? (
              <AdminLayout>
                <EmailSmtpSettings />
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
              canAccessVoiceSettings ? (
                <AdminLayout>
                  <VoiceSettings />
                </AdminLayout>
              ) : (
                <Navigate to="/admin/settings" replace />
              )
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="modes"
          element={
            token ? (
              canAccessAiMode ? (
                <AdminLayout>
                  <ConversationMode />
                </AdminLayout>
              ) : (
                <Navigate to="/admin/settings" replace />
              )
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="virtual-assistant"
          element={
            token ? (
              canAccessVA ? (
                <AdminLayout>
                  <VirtualAssistant />
                </AdminLayout>
              ) : (
                <Navigate to="/admin/settings" replace />
              )
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="training"
          element={
            token ? (
              canAccessTraining ? (
                <AdminLayout>
                  <Training />
                </AdminLayout>
              ) : (
                <Navigate to="/admin/" replace />
              )
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
