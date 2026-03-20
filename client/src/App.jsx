import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ChatSidebar from './components/ChatSidebar';
import ChatMain from './components/ChatMain';
import Landing from './pages/Landing';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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

  const headerBg = theme.headerBackground || null;
  const headerShadowVal = theme.headerShadow || null;
  const headerText = theme.headerTextColor || null;

  if (mode === 'dark') {
    const background = mixHexColors(primaryDark, '#050505', 0.78) || '#111111';
    const sidebar = mixHexColors(background, '#FFFFFF', 0.05) || background;
    const surface = mixHexColors(background, '#FFFFFF', 0.1) || '#1F1F1F';
    const border = mixHexColors(surface, '#FFFFFF', 0.18) || '#363636';
    const assistantBubble = mixHexColors(surface, '#FFFFFF', 0.03) || surface;
    const bodyText = '#F3F4F6';
    const mutedText = '#B2B7C2';

    const darkVars = {
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
      '--chat-header-bg': headerBg || `linear-gradient(120deg, ${primary}, ${primaryDark})`,
      '--chat-header-shadow': headerShadowVal || 'none',
      '--chat-header-text': headerText || '#FFFFFF',
      '--chat-header-gradient-start': primary,
      '--chat-header-gradient-end': primaryDark,
      '--chat-launcher-gradient-start': primary,
      '--chat-launcher-gradient-end': primaryDark,
      '--chat-launcher-shadow': withAlpha(primary, 0.55),
      '--chat-host-glow-1': withAlpha(primary, 0.18),
      '--chat-host-glow-2': withAlpha(primaryDark, 0.12),
      '--chat-host-bg-base': background,
    };
    return darkVars;
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
    '--chat-header-bg': headerBg || `linear-gradient(120deg, ${primary}, ${primaryDark})`,
    '--chat-header-shadow': headerShadowVal || 'none',
    '--chat-header-text': headerText || '#FFFFFF',
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

  const params = new URLSearchParams(window.location.search);
  const urlSessionId = params.get('sessionId') || params.get('session_id');
  const urlCompanyId = params.get('companyId') || params.get('company_id');
  if (urlSessionId) {
    const persisted = readPersistedChatState();
    return {
      ...persisted,
      sessionId: urlSessionId,
      companyId: urlCompanyId || persisted?.companyId || DEFAULT_COMPANY_ID,
      messages: [],
      openingMessageShown: true,
    };
  }

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

  // On landing page always start with activation not yet triggered so 6–10s / 40% scroll / 8s idle run; open from admin (sessionId in URL) = already activated
  const [widgetActivated, setWidgetActivated] = useState(() =>
    isWebsiteView && !initialChatState?.sessionId ? false : (initialChatState?.widgetActivated ?? true)
  );
  const [autoPopupHandled, setAutoPopupHandled] = useState(() =>
    isWebsiteView && !initialChatState?.sessionId ? false : (initialChatState?.autoPopupHandled ?? true)
  );
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
    // Open from admin (URL has sessionId): always open maximized on chatbot side
    if (isWebsiteView && initialChatState?.sessionId) return CHAT_VIEW_MODES.FULL_PAGE;
    // On landing, always start closed so activation (6–10s / scroll / idle) runs
    if (isWebsiteView) return fallback;
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
  const presenceWsRef = useRef(null);
  const responseAudioRef = useRef(null);
  const speechUtteranceRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const [playingMessageIndex, setPlayingMessageIndex] = useState(null);

  const stripEmoji = useCallback((text) => {
    try {
      return String(text || '').replace(/\p{Emoji}/gu, '').replace(/\s+/g, ' ').trim();
    } catch {
      return String(text || '').trim();
    }
  }, []);

  const stripLeadingInvisible = useCallback((str) => {
    return String(str || '').replace(/^[\s\uFEFF\u200B-\u200D\u2060\u00AD]*/, '');
  }, []);

  const sanitizeSpeechText = useCallback((text, options = {}) => {
    let out = stripLeadingInvisible(String(text || ''))
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|[-*+])\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (options.ignoreEmoji) out = stripEmoji(out);
    return out;
  }, [stripEmoji, stripLeadingInvisible]);

  const getPreferredBrowserVoice = useCallback((gender) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const allVoices = window.speechSynthesis.getVoices() || [];
    if (!allVoices.length) return null;

    const englishVoices = allVoices.filter((v) => /^en(-|$)/i.test(v.lang || ''));
    const pool = englishVoices.length ? englishVoices : allVoices;

    const femaleHint = /(female|woman|zira|susan|samantha|aria|eva|linda|hazel|jenny|karen|emma|alloy)/i;
    const maleHint = /(male|man|david|mark|alex|guy|daniel|george|james|tom|ryan|adam)/i;
    const matcher = String(gender || 'female').toLowerCase() === 'male' ? maleHint : femaleHint;

    return pool.find((v) => matcher.test(v.name || '')) || pool[0] || null;
  }, []);

  const speakWithBrowserVoice = useCallback((text, gender = 'female', ignoreEmoji = false, onEnd) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      return;
    }

    const speechText = sanitizeSpeechText(text, { ignoreEmoji });
    if (!speechText) return;

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(speechText);
      const selectedVoice = getPreferredBrowserVoice(gender);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }

      const isMale = String(gender || '').toLowerCase() === 'male';
      utterance.pitch = isMale ? 0.9 : 1.1;
      utterance.rate = 1;

      utterance.onend = () => {
        if (speechUtteranceRef.current === utterance) {
          speechUtteranceRef.current = null;
        }
        if (typeof onEnd === 'function') onEnd();
      };

      utterance.onerror = () => {
        if (speechUtteranceRef.current === utterance) {
          speechUtteranceRef.current = null;
        }
        if (typeof onEnd === 'function') onEnd();
      };

      speechUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch {
      if (typeof onEnd === 'function') onEnd();
    }
  }, [getPreferredBrowserVoice, sanitizeSpeechText]);

  const pauseAssistantVoice = useCallback(() => {
    try {
      if (responseAudioRef.current) {
        responseAudioRef.current.pause();
        responseAudioRef.current.src = '';
        responseAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      speechUtteranceRef.current = null;
    } catch {
      // ignore
    }
    setPlayingMessageIndex(null);
  }, []);

  const playAssistantVoice = useCallback((audioDataUrl, messageIndex) => {
    if (!audioDataUrl || typeof window === 'undefined') return;

    try {
      if (responseAudioRef.current) {
        responseAudioRef.current.pause();
        responseAudioRef.current = null;
      }

      setPlayingMessageIndex(messageIndex ?? null);

      const audio = new Audio(audioDataUrl);
      responseAudioRef.current = audio;

      const clearPlaying = () => {
        if (responseAudioRef.current === audio) {
          responseAudioRef.current = null;
        }
        setPlayingMessageIndex(null);
      };

      audio.onended = clearPlaying;
      audio.onerror = clearPlaying;

      audio.play().catch(clearPlaying);
    } catch {
      setPlayingMessageIndex(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (responseAudioRef.current) {
        try {
          responseAudioRef.current.pause();
          responseAudioRef.current.src = '';
        } catch {
          // ignore
        }
        responseAudioRef.current = null;
      }

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }

      speechUtteranceRef.current = null;
      setPlayingMessageIndex(null);
    };
  }, []);

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
    const params = new URLSearchParams(location.search);
    const hasScrollToLead = params.get('scrollTo') === 'lead';
    if (params.has('sessionId') && (location.pathname === '/' || location.pathname === '') && !hasScrollToLead) {
      window.history.replaceState(window.history.state, '', window.location.pathname || '/');
    }
  }, [location.search, location.pathname]);

  const handleScrolledToLead = useCallback(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname || '/');
  }, []);

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

  // ── Website view: when widget is open, keep activation/popup handled; when not website view, always activated ─
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

    const getScrollRatio = () => {
      const doc = document.documentElement;
      const scrollHeight = Math.max(doc.scrollHeight, doc.clientHeight, window.innerHeight);
      const maxScroll = scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return 0;
      return Math.min(1, window.scrollY / maxScroll);
    };

    const onScroll = () => {
      if (getScrollRatio() >= SCROLL_THRESHOLD) setWidgetActivated(true);
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

  // ── Active visitor presence via WebSocket (for dashboard live activity) ───────
  useEffect(() => {
    if (!companyId) return;
    const getWsUrl = () => {
      if (typeof window === 'undefined' || !window.location) return null;
      const base = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
      const u = new URL(base);
      return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/api/ws';
    };
    let reconnectTimer = null;
    const sendRegister = (sock, sid, pageUrl) => {
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      try {
        sock.send(JSON.stringify({
          type: 'register',
          companyId,
          sessionId: sid ?? undefined,
          pageUrl: pageUrl ?? window.location?.href ?? '',
        }));
      } catch (_) {}
    };
    const connect = () => {
      const url = getWsUrl();
      if (!url) return;
      try {
        const sock = new WebSocket(url);
        presenceWsRef.current = sock;
        sock.onopen = () => sendRegister(sock, sessionIdRef.current, window.location?.href);
        sock.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'message' && msg.content != null) {
              setMessages((prev) => [...prev, { role: 'assistant', content: String(msg.content) }]);
            }
          } catch (_) {}
        };
        sock.onclose = () => {
          presenceWsRef.current = null;
          reconnectTimer = setTimeout(connect, 5000);
        };
        sock.onerror = () => {};
      } catch (_) {}
    };
    connect();
    const onLocationChange = () => {
      const sock = presenceWsRef.current;
      if (sock?.readyState === WebSocket.OPEN) {
        try {
          sock.send(JSON.stringify({ type: 'page', pageUrl: window.location?.href ?? '' }));
        } catch (_) {}
        sendRegister(sock, sessionIdRef.current, window.location?.href);
      }
    };
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (presenceWsRef.current) {
        presenceWsRef.current.close();
        presenceWsRef.current = null;
      }
    };
  }, [companyId]);

  useEffect(() => {
    const sock = presenceWsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send(JSON.stringify({
        type: 'register',
        companyId,
        sessionId: sessionId ?? undefined,
        pageUrl: window.location?.href ?? '',
      }));
    } catch (_) {}
  }, [companyId, sessionId, location.pathname]);

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
        headers: {
          'Content-Type': 'application/json',
          'X-Page-Url': typeof window !== 'undefined' ? window.location.href : '',
        },
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
      const responseAudioDataUrl = data?.voice?.audioDataUrl;
      // Index of the new assistant message: we already added the user message earlier, so it's messages.length + 1
      const newAssistantIndex = messages.length + 1;
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.content,
        voiceUrl: responseAudioDataUrl || undefined,
      }]);
      if (responseAudioDataUrl) {
        playAssistantVoice(responseAudioDataUrl, newAssistantIndex);
      } else if (voiceEnabled && voiceResponseEnabled) {
        const voiceGender = currentCompany?.voice?.gender === 'male' ? 'male' : 'female';
        const ignoreEmoji = Boolean(currentCompany?.voice?.ignoreEmoji);
        setPlayingMessageIndex(newAssistantIndex);
        speakWithBrowserVoice(data?.content, voiceGender, ignoreEmoji, () => setPlayingMessageIndex(null));
      }

      // Update active session ID (server returns the created/used session)
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        // Re-register presence with this sessionId immediately so take-over can push messages to this socket
        const sock = presenceWsRef.current;
        if (sock?.readyState === WebSocket.OPEN) {
          try {
            sock.send(JSON.stringify({
              type: 'register',
              companyId: companyId || DEFAULT_COMPANY_ID,
              sessionId: data.sessionId,
              pageUrl: window.location?.href ?? '',
            }));
          } catch (_) {}
        }
      }
      loadSessions(); // refresh history list
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Bal: We are facing some technical issue' },
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
  const voiceEnabled = Boolean(currentCompany?.voice?.enabled);
  const voiceResponseEnabled = currentCompany?.voice?.responseEnabled !== false;
  const voiceGender = currentCompany?.voice?.gender === 'male' ? 'male' : 'female';
  const handlePlayBrowserVoice = useCallback((content, messageIndex) => {
    if (!content) return;
    setPlayingMessageIndex(messageIndex ?? null);
    speakWithBrowserVoice(content, voiceGender, Boolean(currentCompany?.voice?.ignoreEmoji), () => setPlayingMessageIndex(null));
  }, [voiceGender, currentCompany?.voice?.ignoreEmoji, speakWithBrowserVoice]);
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
    return { left: '24px', top: '24px', right: 'auto', bottom: 'auto' };
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
          scrollToLead={new URLSearchParams(location.search).get('scrollTo') === 'lead'}
          onScrolledToLead={handleScrolledToLead}
          showMic={voiceEnabled}
          onPlayVoice={playAssistantVoice}
          onPauseVoice={pauseAssistantVoice}
          playingMessageIndex={playingMessageIndex}
          voiceEnabled={voiceEnabled}
          voiceResponseEnabled={voiceResponseEnabled}
          onPlayBrowserVoice={handlePlayBrowserVoice}
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
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="chat-widget-icon-btn d-none"
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
                scrollToLead={new URLSearchParams(location.search).get('scrollTo') === 'lead'}
                onScrolledToLead={handleScrolledToLead}
                showMic={voiceEnabled}
                onPlayVoice={playAssistantVoice}
                onPauseVoice={pauseAssistantVoice}
                playingMessageIndex={playingMessageIndex}
                voiceEnabled={voiceEnabled}
                voiceResponseEnabled={voiceResponseEnabled}
                onPlayBrowserVoice={handlePlayBrowserVoice}
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
