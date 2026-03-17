import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ChatSidebar from './components/ChatSidebar';
import ChatMain from './components/ChatMain';
import Landing from './pages/Landing';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Opening message per AI Chat Agent doc (JP Loft)
const OPENING_MESSAGE = `Hi! Welcome to JP Loft!
I'm Anaya, your digital consultant.
Are you looking to build something or just exploring ideas?`;

const ACTIVATION_DELAY_MS_MIN = 6000;
const ACTIVATION_DELAY_MS_MAX = 10000;
const IDLE_MS = 8000;
const SCROLL_THRESHOLD = 0.4;
const THEME_KEY = 'ai-chat-theme';
const CHAT_VIEW_MODE_KEY = 'ai-chat-view-mode';
const WIDGET_BUTTON_POS_KEY = 'ai-chat-widget-button-position';
const CHAT_STATE_KEY = 'ai-chat-state';
const DEFAULT_COMPANY_ID = '_JP_Loft';
const DEFAULT_COMPANY_NAME = 'JP Loft';
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024; // below this: open in full page; above: panel relative to button
const WIDGET_BUTTON_SIZE = 56;
const WIDGET_BUTTON_MARGIN_DESKTOP = 24;
const WIDGET_BUTTON_MARGIN_MOBILE = 14;
const DRAG_DISTANCE_THRESHOLD = 6;
const CHAT_VIEW_MODES = {
  WIDGET_CLOSED: 'widget-closed',
  WIDGET_OPEN: 'widget-open',
  FULL_PAGE: 'full-page',
};

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHexColor(value) {
  const trimmed = String(value || '').trim();
  return /^#([0-9a-f]{6})$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const parts = [r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0'));
  return `#${parts.join('').toUpperCase()}`;
}

function mixHexColors(base, mixWith, ratio) {
  const a = hexToRgb(base);
  const b = hexToRgb(mixWith);
  if (!a || !b) return normalizeHexColor(base) || normalizeHexColor(mixWith) || null;

  const mix = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: a.r + (b.r - a.r) * mix,
    g: a.g + (b.g - a.g) * mix,
    b: a.b + (b.b - a.b) * mix,
  });
}

function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function buildCompanyThemeStyle(theme, mode = 'light') {
  if (!theme) return null;

  const primary = normalizeHexColor(theme.primaryColor);
  const primaryDark = normalizeHexColor(theme.primaryDarkColor) || mixHexColors(primary, '#000000', 0.35);
  const secondary = normalizeHexColor(theme.secondaryColor);
  const secondaryLight = normalizeHexColor(theme.secondaryLightColor) || mixHexColors(secondary, '#FFFFFF', 0.12);

  if (!primary || !secondary) return null;

  if (mode === 'dark') {
    const background = mixHexColors(primaryDark, '#050505', 0.78) || '#111111';
    const sidebar = mixHexColors(background, '#FFFFFF', 0.05) || background;
    const surface = mixHexColors(background, '#FFFFFF', 0.1) || '#1F1F1F';
    const border = mixHexColors(surface, '#FFFFFF', 0.18) || '#363636';
    const assistantBubble = mixHexColors(surface, '#FFFFFF', 0.03) || surface;
    const bodyText = '#F3F4F6';
    const mutedText = '#B2B7C2';

    return {
      '--chat-bg': background,
      '--chat-sidebar': sidebar,
      '--chat-surface': surface,
      '--chat-border': border,
      '--chat-text': bodyText,
      '--chat-text-heading': '#FFFFFF',
      '--chat-muted': mutedText,
      '--chat-accent': primary,
      '--chat-accent-hover': primaryDark,
      '--user-bubble': primary,
      '--user-bubble-text': '#FFFFFF',
      '--assistant-bubble': assistantBubble,
      '--input-placeholder': withAlpha(bodyText, 0.58),
      '--session-hover-bg': withAlpha('#FFFFFF', 0.08),
      '--session-active-bg': withAlpha(primary, 0.2),
      '--session-active-color': mixHexColors(primary, '#FFFFFF', 0.2) || primary,
      '--chat-header-gradient-start': primary,
      '--chat-header-gradient-end': primaryDark,
      '--chat-launcher-gradient-start': primary,
      '--chat-launcher-gradient-end': primaryDark,
      '--chat-launcher-shadow': withAlpha(primary, 0.55),
      '--chat-host-glow-1': withAlpha(primary, 0.18),
      '--chat-host-glow-2': withAlpha(primaryDark, 0.12),
      '--chat-host-bg-base': background,
    };
  }

  const background = secondaryLight || mixHexColors(secondary, '#F5F5FC', 0.45) || '#F5F5FC';
  const sidebar = mixHexColors(secondary, '#F8F8FF', 0.35) || '#F8F8FF';
  const surface = '#FFFFFF';
  const border = mixHexColors(primary, '#E5E7EB', 0.82) || '#E5E7EB';
  const assistantBubble = mixHexColors('#FFFFFF', secondaryLight || '#F5F5FC', 0.45) || '#FBFBFE';
  const bodyText = '#1F2937';
  const mutedText = '#6B7280';

  return {
    '--chat-bg': background,
    '--chat-sidebar': sidebar,
    '--chat-surface': surface,
    '--chat-border': border,
    '--chat-text': bodyText,
    '--chat-text-heading': '#111827',
    '--chat-muted': mutedText,
    '--chat-accent': primary,
    '--chat-accent-hover': primaryDark,
    '--user-bubble': primary,
    '--user-bubble-text': '#FFFFFF',
    '--assistant-bubble': assistantBubble,
    '--input-placeholder': withAlpha(bodyText, 0.58),
    '--session-hover-bg': withAlpha('#FFFFFF', 0.08),
    '--session-active-bg': withAlpha(primary, 0.2),
    '--session-active-color': mixHexColors(primary, '#FFFFFF', 0.2) || primary,
    '--chat-header-gradient-start': primary,
    '--chat-header-gradient-end': primaryDark,
    '--chat-launcher-gradient-start': primary,
    '--chat-launcher-gradient-end': primaryDark,
    '--chat-launcher-shadow': withAlpha(primary, 0.55),
    '--chat-host-glow-1': 'rgb(0 102 255 / 0.20)',
    '--chat-host-glow-2': '#E6F4ED',
    '--chat-host-bg-base': '#F5F5FC',
  };
}

function getViewport() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function getWidgetButtonMargin(viewportWidth) {
  return viewportWidth < MOBILE_BREAKPOINT
    ? WIDGET_BUTTON_MARGIN_MOBILE
    : WIDGET_BUTTON_MARGIN_DESKTOP;
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampWidgetButtonPosition(position, viewportWidth, viewportHeight) {
  const margin = getWidgetButtonMargin(viewportWidth);
  const maxX = Math.max(margin, viewportWidth - WIDGET_BUTTON_SIZE - margin);
  const maxY = Math.max(margin, viewportHeight - WIDGET_BUTTON_SIZE - margin);

  return {
    x: clampValue(position.x, margin, maxX),
    y: clampValue(position.y, margin, maxY),
  };
}

function getDefaultWidgetButtonPosition(viewportWidth, viewportHeight) {
  const margin = getWidgetButtonMargin(viewportWidth);
  return clampWidgetButtonPosition(
    {
      x: viewportWidth - WIDGET_BUTTON_SIZE - margin,
      y: viewportHeight - WIDGET_BUTTON_SIZE - margin,
    },
    viewportWidth,
    viewportHeight
  );
}

function readPersistedChatState() {
  try {
    const raw = localStorage.getItem(CHAT_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function readInitialChatState() {
  if (typeof window === 'undefined') return null;

  try {
    const historyState = window.history.state?.aiChat;
    if (historyState && typeof historyState === 'object') return historyState;
  } catch {}

  return readPersistedChatState();
}

export default function App() {
  const location = useLocation();
  const isWebsiteView = location.pathname === '/' || location.pathname === '';
  const initialChatState = readInitialChatState();

  const [widgetActivated, setWidgetActivated] = useState(() => initialChatState?.widgetActivated ?? !isWebsiteView);
  const [autoPopupHandled, setAutoPopupHandled] = useState(() => initialChatState?.autoPopupHandled ?? !isWebsiteView);
  const [openingMessageShown, setOpeningMessageShown] = useState(() => initialChatState?.openingMessageShown ?? false);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const [isSmallScreen, setIsSmallScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= TABLET_BREAKPOINT : false
  );
  const [currentPage, setCurrentPage] = useState(() => initialChatState?.currentPage || 'chat');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
  });
  const [chatViewMode, setChatViewMode] = useState(() => {
    const fallback = CHAT_VIEW_MODES.WIDGET_CLOSED;
    if (Object.values(CHAT_VIEW_MODES).includes(initialChatState?.chatViewMode)) {
      return initialChatState.chatViewMode;
    }
    try {
      const stored = localStorage.getItem(CHAT_VIEW_MODE_KEY);
      return Object.values(CHAT_VIEW_MODES).includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const [widgetButtonPos, setWidgetButtonPos] = useState(() => {
    const { width, height } = getViewport();
    const fallback = getDefaultWidgetButtonPosition(width, height);

    try {
      const raw = localStorage.getItem(WIDGET_BUTTON_POS_KEY);
      if (!raw) return fallback;

      const parsed = JSON.parse(raw);
      if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') {
        return fallback;
      }

      return clampWidgetButtonPosition(parsed, width, height);
    } catch {
      return fallback;
    }
  });
  const [isDraggingWidgetButton, setIsDraggingWidgetButton] = useState(false);
  const [companyId, setCompanyId]   = useState(() => initialChatState?.companyId || DEFAULT_COMPANY_ID);
  const [companies, setCompanies]   = useState([]);
  const [messages, setMessages]     = useState(() => Array.isArray(initialChatState?.messages) ? initialChatState.messages : []);
  const [loading, setLoading]       = useState(false);
  const [sessionId, setSessionId]   = useState(() => initialChatState?.sessionId || null);
  const [sessions, setSessions]     = useState([]);

  const dragStateRef = useRef({
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });
  const ignoreButtonClickRef = useRef(false);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(CHAT_VIEW_MODE_KEY, chatViewMode); } catch {}
  }, [chatViewMode]);

  useEffect(() => {
    try { localStorage.setItem(WIDGET_BUTTON_POS_KEY, JSON.stringify(widgetButtonPos)); } catch {}
  }, [widgetButtonPos]);

  useEffect(() => {
    const chatState = {
      widgetActivated,
      autoPopupHandled,
      openingMessageShown,
      currentPage,
      companyId,
      messages,
      sessionId,
      chatViewMode,
    };

    try { localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(chatState)); } catch {}

    try {
      window.history.replaceState(
        { ...(window.history.state || {}), aiChat: chatState },
        ''
      );
    } catch {}
  }, [
    widgetActivated,
    autoPopupHandled,
    openingMessageShown,
    currentPage,
    companyId,
    messages,
    sessionId,
    chatViewMode,
  ]);

  useEffect(() => {
    const onPopState = (event) => {
      const chatState = event.state?.aiChat || readPersistedChatState();
      if (!chatState || typeof chatState !== 'object') return;

      setWidgetActivated(chatState.widgetActivated ?? !isWebsiteView);
      setAutoPopupHandled(chatState.autoPopupHandled ?? !isWebsiteView);
      setOpeningMessageShown(chatState.openingMessageShown ?? false);
      setCurrentPage(chatState.currentPage || 'chat');
      setCompanyId(chatState.companyId || DEFAULT_COMPANY_ID);
      setMessages(Array.isArray(chatState.messages) ? chatState.messages : []);
      setSessionId(chatState.sessionId || null);
      setChatViewMode(
        Object.values(CHAT_VIEW_MODES).includes(chatState.chatViewMode)
          ? chatState.chatViewMode
          : CHAT_VIEW_MODES.WIDGET_CLOSED
      );
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isWebsiteView]);

  // ── Website view: reset activation when entering landing ───────────────────
  useEffect(() => {
    if (isWebsiteView) {
      if (chatViewMode !== CHAT_VIEW_MODES.WIDGET_CLOSED) {
        setWidgetActivated(true);
        setAutoPopupHandled(true);
      }
    } else {
      setWidgetActivated(true);
      setAutoPopupHandled(true);
    }
  }, [isWebsiteView, chatViewMode]);

  // ── Widget activation (doc: 6–10s OR 40% scroll OR 8s idle) ─────────────────
  useEffect(() => {
    if (!isWebsiteView || widgetActivated) return;

    const delay = ACTIVATION_DELAY_MS_MIN + Math.random() * (ACTIVATION_DELAY_MS_MAX - ACTIVATION_DELAY_MS_MIN);
    const t1 = setTimeout(() => setWidgetActivated(true), delay);

    const onScroll = () => {
      const scrolled = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) || 0;
      if (scrolled >= SCROLL_THRESHOLD) setWidgetActivated(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setWidgetActivated(true), IDLE_MS);
    };
    resetIdle();
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('scroll', resetIdle);

    return () => {
      clearTimeout(t1);
      clearTimeout(idleTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('scroll', resetIdle);
    };
  }, [isWebsiteView, widgetActivated]);

  // ── Activation checks open popup once (icon is always visible/clickable) ───
  useEffect(() => {
    if (!isWebsiteView || !widgetActivated || autoPopupHandled) return;

    setCurrentPage('chat');
    if (messages.length === 0 && !openingMessageShown) {
      setMessages([{ role: 'assistant', content: OPENING_MESSAGE }]);
      setOpeningMessageShown(true);
    }
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN);
    setAutoPopupHandled(true);
  }, [isWebsiteView, widgetActivated, autoPopupHandled, messages.length, openingMessageShown]);

  // ── Resize ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const { width, height } = getViewport();
      setIsMobile(width < MOBILE_BREAKPOINT);
      setIsSmallScreen(width <= TABLET_BREAKPOINT);
      setWidgetButtonPos((prev) => clampWidgetButtonPosition(prev, width, height));
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Companies ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/train/companies`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((c) => c && c.id !== '_default')
          : [];

        setCompanies(list);
        setCompanyId((prev) => {
          if (list.some((c) => c.id === prev)) return prev;
          if (list.some((c) => c.id === DEFAULT_COMPANY_ID)) return DEFAULT_COMPANY_ID;
          return list[0]?.id || DEFAULT_COMPANY_ID;
        });
      })
      .catch(() => {
        setCompanies([]);
        setCompanyId(DEFAULT_COMPANY_ID);
      });
  }, []);

  // ── Sessions (reload whenever companyId changes) ───────────────────────────
  const loadSessions = useCallback(() => {
    fetch(`${API_BASE}/sessions?companyId=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]));
  }, [companyId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!sessionId || messages.length > 0) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`);
        const data = await res.json();

        if (!cancelled) {
          setMessages(Array.isArray(data) ? data.map((m) => ({ role: m.role, content: m.content })) : []);
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, messages.length]);

  // ── Select a session: load its messages ───────────────────────────────────
  const handleSelectSession = async (id) => {
    setSessionId(id);
    try {
      const res  = await fetch(`${API_BASE}/sessions/${id}/messages`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data.map((m) => ({ role: m.role, content: m.content })) : []);
    } catch {
      setMessages([]);
    }
  };

  // ── Delete a session ──────────────────────────────────────────────────────
  const handleDeleteSession = async (id) => {
    try { await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' }); } catch {}
    if (sessionId === id) { setSessionId(null); setMessages([]); }
    loadSessions();
  };

  // ── New chat ───────────────────────────────────────────────────────────────
  const clearChat = () => {
    setSessionId(null);
    setMessages([]);
    setOpeningMessageShown(false);
  };

  // ── Change company ─────────────────────────────────────────────────────────
  const handleSelectCompany = (id) => {
    setCompanyId(id);
    setSessionId(null);
    setMessages([]);
    setOpeningMessageShown(false);
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async (content) => {
    if (!content.trim() || loading) return;

    const userMsg = { role: 'user', content: content.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId:  companyId || DEFAULT_COMPANY_ID,
          sessionId:  sessionId || undefined,
          messages:   [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get response');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);

      // Update active session ID (server returns the created/used session)
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
      }
      loadSessions(); // refresh history list
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Bal: We are having technical issue' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWidget = () => {
    setCurrentPage('chat');
    if (isWebsiteView) setAutoPopupHandled(true);
    if (isWebsiteView && messages.length === 0 && !openingMessageShown) {
      setMessages([{ role: 'assistant', content: OPENING_MESSAGE }]);
      setOpeningMessageShown(true);
    }
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN);
  };

  const handleCloseWidget = () => {
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_CLOSED);
  };

  const handleMaximizeWidget = () => {
    setCurrentPage('chat');
    setChatViewMode(CHAT_VIEW_MODES.FULL_PAGE);
  };

  const handleMinimizeToWidget = () => {
    setCurrentPage('chat');
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN);
  };

  const handleWidgetButtonPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: widgetButtonPos.x,
      originY: widgetButtonPos.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleWidgetButtonPointerMove = (event) => {
    const drag = dragStateRef.current;
    if (drag.pointerId === null || event.pointerId !== drag.pointerId) return;

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) >= DRAG_DISTANCE_THRESHOLD) {
      drag.moved = true;
      setIsDraggingWidgetButton(true);
    }

    if (!drag.moved) return;

    const { width, height } = getViewport();
    setWidgetButtonPos(
      clampWidgetButtonPosition(
        { x: drag.originX + deltaX, y: drag.originY + deltaY },
        width,
        height
      )
    );

    // Prevent synthetic click firing after a drag gesture.
    event.preventDefault();
  };

  const handleWidgetButtonPointerUp = (event) => {
    const drag = dragStateRef.current;
    if (drag.pointerId === null || event.pointerId !== drag.pointerId) return;

    if (drag.moved) {
      ignoreButtonClickRef.current = true;
    }

    dragStateRef.current = {
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      originX: 0,
      originY: 0,
      moved: false,
    };

    setIsDraggingWidgetButton(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const withDragGuard = (action) => () => {
    if (ignoreButtonClickRef.current) {
      ignoreButtonClickRef.current = false;
      return;
    }
    action();
  };

  const currentCompany = companies.find((c) => c.id === companyId);
  const companyName = currentCompany?.displayName || currentCompany?.name || DEFAULT_COMPANY_NAME;
  const companyIconUrl = currentCompany?.iconUrl || null;
  const greetingMessage = currentCompany?.greetingMessage || null;
  const companyThemeStyle = buildCompanyThemeStyle(currentCompany?.theme, theme);
  const isFullPage = chatViewMode === CHAT_VIEW_MODES.FULL_PAGE;
  const isWidgetOpen = chatViewMode === CHAT_VIEW_MODES.WIDGET_OPEN;
  const widgetButtonStyle = {
    left: `${widgetButtonPos.x}px`,
    top: `${widgetButtonPos.y}px`,
    right: 'auto',
    bottom: 'auto',
  };

  const panelStyle = isWidgetOpen && !isSmallScreen ? (() => {
    const { width, height } = getViewport();
    const gap = 12;
    const panelW = Math.min(370, width - 48);
    const panelH = Math.min(610, height - 128);
    const btnRight = widgetButtonPos.x + WIDGET_BUTTON_SIZE;
    const btnTop = widgetButtonPos.y;
    const bottom = Math.min(height - panelH - 24, Math.max(24, height - btnTop + gap));
    const right = Math.max(24, Math.min(width - panelW - 24, width - btnRight));
    return { bottom: `${bottom}px`, right: `${right}px`, left: 'auto', top: 'auto' };
  })() : undefined;

  if (isFullPage) {
    return (
      <div className="chat-shell d-flex overflow-hidden" style={companyThemeStyle || undefined}>
        <ChatSidebar
          onNewChat={clearChat}
          theme={theme}
          onThemeChange={setTheme}
          isMobile={isMobile}
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          sessions={sessions}
          sessionId={sessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />
        <ChatMain
          messages={messages}
          loading={loading}
          onSend={sendMessage}
          companyName={companyName}
          companyIconUrl={companyIconUrl}
          greetingMessage={greetingMessage}
        />

        <button
          type="button"
          className={`chat-fullpage-minimize chat-widget-draggable${isDraggingWidgetButton ? ' is-dragging' : ''}`}
          style={widgetButtonStyle}
          onClick={withDragGuard(handleMinimizeToWidget)}
          onPointerDown={handleWidgetButtonPointerDown}
          onPointerMove={handleWidgetButtonPointerMove}
          onPointerUp={handleWidgetButtonPointerUp}
          onPointerCancel={handleWidgetButtonPointerUp}
          aria-label="Minimize chatbot"
          title="Minimize to widget"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="10" y1="14" x2="3" y2="21" />
          </svg>
        </button>
      </div>
    );
  }

  const widgetContent = (
    <>
      {isWidgetOpen ? (
        <>
          <section
            className="chat-widget-panel"
            aria-label="Chat widget"
            style={panelStyle}
          >
            <header className="chat-widget-header">
              <button
                type="button"
                className="chat-widget-icon-btn"
                onClick={handleCloseWidget}
                aria-label="Close widget"
                title="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="chat-widget-title-wrap">
                <span className="chat-widget-title">{companyName}</span>
                <span className="chat-widget-subtitle">AI Sales Agent</span>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="chat-widget-icon-btn"
                  onClick={handleMaximizeWidget}
                  aria-label="Maximize chatbot"
                  title="Open full page"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>

                <span className="chat-widget-avatar" style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }} aria-hidden="true">
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>{companyName.charAt(0).toUpperCase()}</span>
                  {companyIconUrl && <img src={companyIconUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />}
                </span>
              </div>
            </header>

            <div className="chat-widget-main">
              <ChatMain
                messages={messages}
                loading={loading}
                onSend={sendMessage}
                companyName={companyName}
                companyIconUrl={companyIconUrl}
                greetingMessage={greetingMessage}
                showHeader={false}
                compact
              />
            </div>
          </section>

          <button
            type="button"
            className={`chat-widget-close-fab chat-widget-draggable${isDraggingWidgetButton ? ' is-dragging' : ''}`}
            style={widgetButtonStyle}
            onClick={withDragGuard(handleCloseWidget)}
            onPointerDown={handleWidgetButtonPointerDown}
            onPointerMove={handleWidgetButtonPointerMove}
            onPointerUp={handleWidgetButtonPointerUp}
            onPointerCancel={handleWidgetButtonPointerUp}
            aria-label="Close chatbot"
            title="Close"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`chat-widget-launcher chat-widget-draggable${isDraggingWidgetButton ? ' is-dragging' : ''}`}
          style={widgetButtonStyle}
          onClick={withDragGuard(handleOpenWidget)}
          onPointerDown={handleWidgetButtonPointerDown}
          onPointerMove={handleWidgetButtonPointerMove}
          onPointerUp={handleWidgetButtonPointerUp}
          onPointerCancel={handleWidgetButtonPointerUp}
          aria-label="Open chatbot"
          title="Open chatbot"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="12" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
          </svg>
        </button>
      )}
    </>
  );

  if (isWebsiteView) {
    return (
      <>
        <Landing />
        <div
          className="chat-widget-host"
          style={{ ...(companyThemeStyle || {}), position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}
        >
          <div style={{ pointerEvents: 'auto' }}>{widgetContent}</div>
        </div>
      </>
    );
  }

  return (
    <div className="chat-widget-host" style={companyThemeStyle || undefined}>
      {widgetContent}
    </div>
  );
}
