import { useEffect, useState } from 'react';

// ─── Date grouping helpers ────────────────────────────────────────────────────
const GROUP_ORDER = ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Older'];

function getGroupLabel(dateStr) {
  const d     = new Date(dateStr);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today)                         return 'Today';
  if (d >= new Date(+today - 864e5))      return 'Yesterday';
  if (d >= new Date(+today - 7  * 864e5)) return 'Last 7 days';
  if (d >= new Date(+today - 30 * 864e5)) return 'Last 30 days';
  return 'Older';
}

function groupSessions(sessions) {
  const map = {};
  for (const s of sessions) {
    const label = getGroupLabel(s.updated_at);
    (map[label] = map[label] || []).push(s);
  }
  return GROUP_ORDER.filter((l) => map[l]).map((l) => ({ label: l, items: map[l] }));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChatSidebar({
  companies      = [],
  companyId,
  onSelectCompany,
  onNewChat,
  theme          = 'light',
  onThemeChange,
  isMobile       = false,
  currentPage    = 'chat',
  onNavigate,
  sessions       = [],
  sessionId,
  onSelectSession,
  onDeleteSession,
}) {
  const [collapsed, setCollapsed] = useState(isMobile);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => { if (isMobile) setCollapsed(true); }, [isMobile]);

  const grouped = groupSessions(sessions);

  return (
    <aside
      className="chat-sidebar d-flex flex-column flex-shrink-0"
      style={{
        width:      collapsed ? 56 : 260,
        minWidth:   collapsed ? 56 : 260,
        background: 'var(--chat-sidebar)',
        transition: 'width 0.2s ease',
      }}
    >
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div className="chat-sidebar-header d-flex align-items-center justify-content-between px-3">
        {!collapsed && (
          <span className="fw-semibold" style={{ color: 'var(--chat-text-heading)' }}>
            AI Chat Agent
          </span>
        )}
        <div className="d-flex align-items-center gap-1">
          {/* Theme toggle */}
          <button
            type="button"
            className="btn btn-link text-secondary p-1"
            onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1"  x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22"   x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1"  y1="12" x2="3"  y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78"  x2="5.64"  y2="18.36"/>
                <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          {/* Collapse toggle */}
          <button
            type="button"
            className="btn btn-link text-secondary p-0 px-2"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Expanded content ─────────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          {/* New chat button */}
          <button
            type="button"
            className="btn btn-primary mx-3 mt-3"
            onClick={onNewChat}
          >
            + New chat
          </button>

          {/* Company / Training selector */}
          <div className="mt-3 px-3">
            <label className="form-label small text-muted mb-1">Company / Training</label>
            <select
              className="form-select form-select-sm"
              value={companyId}
              onChange={(e) => onSelectCompany(e.target.value)}
              style={{ background: 'var(--chat-surface)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
              ))}
            </select>
          </div>

          {/* ── Chat history list ─────────────────────────────────────────────── */}
          {currentPage === 'chat' && (
            <div className="mt-2 pb-1" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {grouped.length === 0 ? (
                <p className="px-3 mt-2 mb-0" style={{ fontSize: 12, color: 'var(--chat-muted)' }}>
                  No conversations yet.
                </p>
              ) : (
                grouped.map((group) => (
                  <div key={group.label} className="mb-1">
                    {/* Date group label */}
                    <div
                      className="px-3 pt-2 pb-1"
                      style={{ fontSize: 10, fontWeight: 700, color: 'var(--chat-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      {group.label}
                    </div>

                    {/* Session items */}
                    {group.items.map((s) => {
                      const isActive  = sessionId === s.id;
                      const isHovered = hoveredId  === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => onSelectSession?.(s.id)}
                          onMouseEnter={() => setHoveredId(s.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '5px 10px', margin: '1px 6px', borderRadius: 7, cursor: 'pointer',
                            background: isActive ? 'var(--session-active-bg)' : isHovered ? 'var(--session-hover-bg)' : 'transparent',
                            transition: 'background 0.12s',
                          }}
                        >
                          <span style={{
                            fontSize: 13,
                            color: isActive ? 'var(--session-active-color)' : 'var(--chat-text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            flex: 1, minWidth: 0, lineHeight: 1.5,
                          }}>
                            {s.title || 'New Chat'}
                          </span>

                          {/* Delete — shown on hover */}
                          {isHovered && (
                            <button
                              type="button"
                              className="btn btn-link p-0 ms-1 flex-shrink-0"
                              style={{ color: '#f87171', lineHeight: 1 }}
                              aria-label="Delete conversation"
                              onClick={(e) => { e.stopPropagation(); onDeleteSession?.(s.id); }}
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

      {/* ── Bottom navigation ────────────────────────────────────────────────── */}
      <nav className="pb-2 pt-3" style={{ borderTop: '1px solid var(--chat-border)', marginTop: 'auto' }}>
        {/* Chat */}
        <button
          type="button"
          onClick={() => onNavigate?.('chat')}
          className="btn btn-link d-flex align-items-center gap-2 text-decoration-none"
          style={{
            color: currentPage === 'chat' ? 'var(--chat-accent)' : 'var(--chat-muted)',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: currentPage === 'chat' ? 'var(--session-active-bg)' : 'transparent',
            borderRadius: 8, margin: '2px 8px', padding: '6px 10px', width: 'calc(100% - 16px)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {!collapsed && <span className="small fw-medium">Chat</span>}
        </button>

        {/* Train Org Data */}
        <button
          type="button"
          onClick={() => onNavigate?.('train')}
          className="btn btn-link d-flex align-items-center gap-2 text-decoration-none"
          style={{
            color: currentPage === 'train' ? 'var(--chat-accent)' : 'var(--chat-muted)',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: currentPage === 'train' ? 'var(--session-active-bg)' : 'transparent',
            borderRadius: 8, margin: '2px 8px', padding: '6px 10px', width: 'calc(100% - 16px)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          {!collapsed && <span className="small fw-medium">Train Org Data</span>}
        </button>

        {/* Admin Panel */}
        <a
          href="/admin/"
          className="btn btn-link d-flex align-items-center gap-2 text-decoration-none"
          style={{
            color: 'var(--chat-muted)',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 8, margin: '2px 8px', padding: '6px 10px', width: 'calc(100% - 16px)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {!collapsed && <span className="small fw-medium">Admin</span>}
        </a>
      </nav>
    </aside>
  );
}
