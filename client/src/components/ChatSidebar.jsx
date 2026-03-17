import { useEffect, useState } from 'react';

const GROUP_ORDER = ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Older'];

function getGroupLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) return 'Today';
  if (d >= new Date(+today - 864e5)) return 'Yesterday';
  if (d >= new Date(+today - 7 * 864e5)) return 'Last 7 days';
  if (d >= new Date(+today - 30 * 864e5)) return 'Last 30 days';
  return 'Older';
}

function groupSessions(sessions) {
  const map = {};
  for (const s of sessions) {
    const label = getGroupLabel(s.updated_at);
    (map[label] = map[label] || []).push(s);
  }
  return GROUP_ORDER.filter((label) => map[label]).map((label) => ({ label, items: map[label] }));
}

export default function ChatSidebar({
  onNewChat,
  theme = 'light',
  onThemeChange,
  isMobile = false,
  currentPage = 'chat',
  onNavigate,
  sessions = [],
  sessionId,
  onSelectSession,
  onDeleteSession,
}) {
  const [collapsed, setCollapsed] = useState(isMobile);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  const grouped = groupSessions(sessions);

  return (
    <aside
      className="chat-sidebar d-flex flex-column flex-shrink-0"
      style={{
        width: collapsed ? 56 : 260,
        minWidth: collapsed ? 56 : 260,
        background: 'var(--chat-sidebar)',
        transition: 'width 0.2s ease',
      }}
    >
      <div
        className="chat-sidebar-header d-flex align-items-center justify-content-between px-3"
        style={{
          background: 'var(--chat-header-bg, var(--chat-sidebar))',
          color: 'var(--chat-header-text, var(--chat-text-heading))',
          boxShadow: 'var(--chat-header-shadow, none)',
        }}
      >
        {!collapsed && (
          <span className="fw-semibold" style={{ color: 'inherit' }}>
            AI Chat Agent
          </span>
        )}
        <div className="d-flex align-items-center gap-1" style={{ color: 'inherit' }}>
          <button
            type="button"
            className="btn btn-link p-1"
            style={{ color: 'inherit', opacity: 0.9 }}
            onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="btn btn-link p-0 px-2"
            style={{ color: 'inherit', opacity: 0.9 }}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <button
            type="button"
            className="btn btn-primary mx-3 mt-3 bg-dark"
            onClick={onNewChat}
          >
            + New chat
          </button>

          {currentPage === 'chat' && (
            <div className="mt-2 pb-1" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {grouped.length === 0 ? (
                <p className="px-3 mt-2 mb-0" style={{ fontSize: 12, color: 'var(--chat-muted)' }}>
                  No conversations yet.
                </p>
              ) : (
                grouped.map((group) => (
                  <div key={group.label} className="mb-1">
                    <div
                      className="px-3 pt-2 pb-1"
                      style={{ fontSize: 10, fontWeight: 700, color: 'var(--chat-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      {group.label}
                    </div>

                    {group.items.map((s) => {
                      const isActive = sessionId === s.id;
                      const isHovered = hoveredId === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => onSelectSession?.(s.id)}
                          onMouseEnter={() => setHoveredId(s.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: isActive ? '7px 10px' : '5px 10px',
                            margin: isActive ? '4px 2px' : '1px 6px',
                            borderRadius: isActive ? 6 : 7,
                            cursor: 'pointer',
                            background: isActive
                              ? 'linear-gradient(135deg, var(--chat-launcher-gradient-start), var(--chat-launcher-gradient-end))'
                              : isHovered
                                ? 'var(--session-hover-bg)'
                                : 'transparent',
                            boxShadow: isActive ? '0 10px 22px -16px var(--chat-launcher-shadow)' : 'none',
                            transition: 'background 0.12s, box-shadow 0.12s',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              color: isActive ? '#ffffff' : 'var(--chat-text)',
                              fontWeight: isActive ? 600 : 400,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flex: 1,
                              minWidth: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            {s.title || 'New Chat'}
                          </span>

                          {isHovered && (
                            <button
                              type="button"
                              className="btn btn-link p-0 ms-1 flex-shrink-0"
                              style={{ color: isActive ? 'rgba(255,255,255,0.9)' : '#f87171', lineHeight: 1 }}
                              aria-label="Delete conversation"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession?.(s.id);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      
    </aside>
  );
}
