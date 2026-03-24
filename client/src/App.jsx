import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ChatSidebar from './components/ChatSidebar';
import ChatMain from './components/ChatMain';
import Landing from './pages/Landing';
import { ISO_TO_OPENING_LANG, resolveBrowserSpeechBCp47 } from './constants/chatLanguages';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function normalizePrimaryLanguage(language) {
  const value = String(language || '').trim().toLowerCase();
  if (!value) return 'english';
  if (ISO_TO_OPENING_LANG[value]) return ISO_TO_OPENING_LANG[value];
  if (['ru', 'ru-ru', 'russian', 'русский', 'русский язык'].includes(value)) return 'russian';
  if (['uk', 'uk-ua', 'ukrainian', 'українська', 'украинский'].includes(value)) return 'ukrainian';
  if (['ar', 'arabic', 'العربية'].includes(value)) return 'arabic';
  if (['hi', 'hindi', 'हिन्दी', 'हिंदी'].includes(value)) return 'hindi';
  if (['ja', 'ja-jp', 'japanese', '日本語'].includes(value)) return 'japanese';
  if (['zh', 'zh-cn', 'zh-tw', 'chinese', '中文'].includes(value)) return 'chinese';
  if (['ko', 'ko-kr', 'korean', '한국어'].includes(value)) return 'korean';
  return 'english';
}

/** When admin left primary as English but training text is clearly Russian retail, use training for the widget opening only. */
function getEffectiveOpeningLanguage(primaryLanguage, contentLocaleHint, businessProfileId = 'generic_business') {
  const primary = normalizePrimaryLanguage(primaryLanguage);
  const hint = contentLocaleHint ? normalizePrimaryLanguage(contentLocaleHint) : null;
  if (primary !== 'english') return primary;
  if (String(businessProfileId) === 'ecommerce_marketplace' && hint && hint !== 'english') return hint;
  return primary;
}

function isLegacyGenericGreeting(text, primaryLanguage, businessProfileId = 'generic_business') {
  const value = String(text || '').trim();
  if (!value) return false;

  const normalizedLanguage = normalizePrimaryLanguage(primaryLanguage);
  const englishLegacy = /(hi!\s*welcome to|your digital consultant|are you looking to build something|exploring ideas)/i.test(value);
  const genericBusinessPitch = /(цифровой консультант|решени(е|я) для своего бизнеса|наших услуг|изучаете возможности|what do you want to build|our services|business solution)/i.test(value);
  const storeTerms = /(товар|товары|категори|акци|доставк|возврат|пункт(ы)? выдачи|магазин|маркетплейс|product|products|category|categories|promotion|delivery|return|pickup|store|marketplace)/i.test(value);

  if (normalizedLanguage !== 'english' && englishLegacy) {
    return true;
  }

  if (businessProfileId === 'ecommerce_marketplace' && genericBusinessPitch && !storeTerms) {
    return true;
  }

  return false;
}

function buildOpeningCopy(language, companyName, chatbotName, businessProfileId = 'generic_business') {
  const introName = String(chatbotName || '').trim();
  const safeCompanyName = String(companyName || DEFAULT_COMPANY_NAME).trim() || DEFAULT_COMPANY_NAME;

  if (businessProfileId === 'ecommerce_marketplace') {
    const marketplaceCopyByLanguage = {
      russian: {
        welcome: `Здравствуйте! Добро пожаловать в ${safeCompanyName}!`,
        intro: introName ? `Я ${introName}.` : 'Я помогу вам с сайтом магазина.',
        question: 'Подскажу по товарам, категориям, акциям, доставке, возврату и пунктам выдачи. Что вас интересует?',
      },
      english: {
        welcome: `Hi! Welcome to ${safeCompanyName}!`,
        intro: introName ? `I\'m ${introName}.` : 'I can help you with the store website.',
        question: 'I can help with products, categories, promotions, delivery, returns, and pickup points. What are you looking for?',
      },
    };

    return marketplaceCopyByLanguage[language] || marketplaceCopyByLanguage.english;
  }

  const copyByLanguage = {
    russian: {
      welcome: `Здравствуйте! Добро пожаловать в ${safeCompanyName}!`,
      intro: introName ? `Я ${introName}, ваш цифровой консультант.` : 'Я ваш цифровой консультант.',
      question: 'Вы хотите что-то создать или просто изучаете варианты?',
    },
    ukrainian: {
      welcome: `Вітаю! Ласкаво просимо до ${safeCompanyName}!`,
      intro: introName ? `Я ${introName}, ваш цифровий консультант.` : 'Я ваш цифровий консультант.',
      question: 'Ви хочете щось створити чи просто вивчаєте варіанти?',
    },
    arabic: {
      welcome: `مرحباً! أهلاً بك في ${safeCompanyName}!`,
      intro: introName ? `أنا ${introName}، مستشارك الرقمي.` : 'أنا مستشارك الرقمي.',
      question: 'هل ترغب في بناء شيء ما أم أنك تستكشف الأفكار فقط؟',
    },
    hindi: {
      welcome: `नमस्ते! ${safeCompanyName} में आपका स्वागत है!`,
      intro: introName ? `मैं ${introName} हूं, आपका डिजिटल कंसल्टेंट।` : 'मैं आपका डिजिटल कंसल्टेंट हूं।',
      question: 'क्या आप कुछ बनवाना चाहते हैं या अभी सिर्फ विकल्प देख रहे हैं?',
    },
    japanese: {
      welcome: `こんにちは。${safeCompanyName}へようこそ。`,
      intro: introName ? `私は${introName}です。デジタルコンサルタントとしてご案内します。` : 'デジタルコンサルタントとしてご案内します。',
      question: '何かを構築したいですか、それとも情報収集中ですか。',
    },
    chinese: {
      welcome: `您好，欢迎来到${safeCompanyName}！`,
      intro: introName ? `我是${introName}，您的数字顾问。` : '我是您的数字顾问。',
      question: '您是想开始搭建项目，还是先了解一下可选方案？',
    },
    korean: {
      welcome: `안녕하세요. ${safeCompanyName}에 오신 것을 환영합니다.`,
      intro: introName ? `저는 ${introName}이며 디지털 컨설턴트입니다.` : '저는 디지털 컨설턴트입니다.',
      question: '무언가를 구축하려고 하시나요, 아니면 먼저 아이디어를 살펴보고 계신가요?',
    },
    english: {
      welcome: `Hi! Welcome to ${safeCompanyName}!`,
      intro: introName ? `I'm ${introName}, your digital consultant.` : "I'm your digital consultant.",
      question: 'Are you looking to build something or just exploring ideas?',
    },
  };

  return copyByLanguage[language] || copyByLanguage.english;
}

function buildDefaultOpeningMessage(
  companyName,
  chatbotName,
  primaryLanguage,
  businessProfileId = 'generic_business',
  contentLocaleHint = ''
) {
  const safeCompanyName = String(companyName || DEFAULT_COMPANY_NAME).trim() || DEFAULT_COMPANY_NAME;
  const copy = buildOpeningCopy(
    getEffectiveOpeningLanguage(primaryLanguage, contentLocaleHint, businessProfileId),
    safeCompanyName,
    chatbotName,
    businessProfileId
  );

  return `${copy.welcome}\n${copy.intro}\n${copy.question}`;
}

function normalizeAssistantNameInText(text, chatbotName) {
  const safeChatbotName = String(chatbotName || '').replace(/\s+/g, ' ').trim();
  if (!safeChatbotName) return String(text || '');

  let output = String(text || '');
  output = output
    .replace(/\b(i\s*(?:am|'m)\s+)anaya\b/gi, `$1${safeChatbotName}`)
    .replace(/\b(it\s*(?:is|'s)\s+)anaya\b/gi, `$1${safeChatbotName}`)
    .replace(/\b(this is\s+)anaya\b/gi, `$1${safeChatbotName}`)
    .replace(/\b(my name is\s+)anaya\b/gi, `$1${safeChatbotName}`)
    .replace(/\banaya(?=,\s*your digital consultant\b)/gi, safeChatbotName)
    .replace(/\banaya(?=\s+here\b)/gi, safeChatbotName)
    .replace(/\banaya(?=\s+from\b)/gi, safeChatbotName);

  if (/\banaya\b/i.test(output) && /\b(hi|hello|hey|welcome|consultant)\b/i.test(output)) {
    output = output.replace(/\banaya\b/gi, safeChatbotName);
  }

  return output;
}

const AUTO_TRIGGER_DEFAULT_SECONDS = 8;
const AUTO_TRIGGER_DEFAULT_SCROLL_PERCENT = 40;
const THEME_KEY = 'ai-chat-theme';
const CHAT_VIEW_MODE_KEY = 'ai-chat-view-mode';
const WIDGET_BUTTON_POS_KEY = 'ai-chat-widget-button-position';
const WIDGET_PANEL_SIDE_KEY = 'ai-chat-widget-panel-side';
const WIDGET_BUTTON_DRAGGED_KEY = 'ai-chat-widget-button-dragged';
const CHAT_STATE_KEY = 'ai-chat-state';
const COMPANIES_CACHE_KEY = 'ai-chat-companies-cache-v1';
const DEFAULT_COMPANY_ID = '_JP_Loft';
const DEFAULT_COMPANY_NAME = 'JP Loft';

/** Icon URL from settings may be relative (e.g. /favicon.ico) or //cdn… — resolve against the current page. */
function resolvePublicMediaUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^data:/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) {
    if (typeof window === 'undefined' || !window.location) return `https:${s}`;
    return `${window.location.protocol}${s}`;
  }
  if (typeof window === 'undefined') return s;
  try {
    return new URL(s, window.location.href).href;
  } catch {
    return s;
  }
}

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

function getDefaultWidgetButtonPosition(viewportWidth, viewportHeight, side = 'right') {
  const margin = getWidgetButtonMargin(viewportWidth);
  const x =
    side === 'left'
      ? margin
      : viewportWidth - WIDGET_BUTTON_SIZE - margin;
  return clampWidgetButtonPosition(
    { x, y: viewportHeight - WIDGET_BUTTON_SIZE - margin },
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

function readCachedCompanies() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COMPANIES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c === 'object' && c.id && c.id !== '_default');
  } catch {
    return [];
  }
}

/** Same rules as initial chatViewMode state — single source for mount-time panel mode. */
function resolveInitialChatViewMode(isWebsiteView, initialChatState) {
  const fallback = CHAT_VIEW_MODES.WIDGET_CLOSED;
  try {
    const stored = localStorage.getItem(CHAT_VIEW_MODE_KEY);
    if (Object.values(CHAT_VIEW_MODES).includes(stored)) {
      return stored === CHAT_VIEW_MODES.FULL_PAGE ? CHAT_VIEW_MODES.WIDGET_OPEN : stored;
    }
  } catch {
    // ignore
  }

  if (Object.values(CHAT_VIEW_MODES).includes(initialChatState?.chatViewMode)) {
    return initialChatState.chatViewMode === CHAT_VIEW_MODES.FULL_PAGE
      ? CHAT_VIEW_MODES.WIDGET_OPEN
      : initialChatState.chatViewMode;
  }

  if (isWebsiteView && initialChatState?.sessionId) return CHAT_VIEW_MODES.WIDGET_OPEN;

  return fallback;
}

function parseAutoTriggerRules(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function stripPathSlashes(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function matchPathRule(pathname, rule) {
  const path = stripPathSlashes(pathname);
  const r = stripPathSlashes(rule);
  if (!r) return path === '';

  if (r.endsWith('*')) {
    const prefix = r.slice(0, -1);
    if (!prefix) return true;
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  return path === r || path.startsWith(`${r}/`);
}

function resolveAutoTriggerOpenMode(autoTrigger) {
  const configuredMode = String(autoTrigger?.openMode || '').trim().toLowerCase();

  if (configuredMode === 'click') return 'click';
  if (configuredMode === 'auto') return autoTrigger?.enabled === false ? 'click' : 'auto';
  return autoTrigger?.enabled === false ? 'click' : 'auto';
}

function shouldEnableAutoTrigger(autoTrigger, pathname) {
  if (resolveAutoTriggerOpenMode(autoTrigger) !== 'auto') return false;

  const path = String(pathname || '/').toLowerCase();
  const selectedRules = parseAutoTriggerRules(autoTrigger.selectedPages);
  const hasPageTargeting = Boolean(
    autoTrigger.onlySelectedPages ||
    autoTrigger.onPricingPage ||
    autoTrigger.onPortfolioPage ||
    selectedRules.length
  );

  if (!hasPageTargeting) return true;

  let matched = false;
  if (autoTrigger.onPricingPage && /(^|\/)pricing(\/|$)/i.test(path)) matched = true;
  if (autoTrigger.onPortfolioPage && /(^|\/)portfolio(\/|$)/i.test(path)) matched = true;
  if (selectedRules.some((rule) => matchPathRule(path, rule))) matched = true;

  return matched;
}

export default function App() {
  const location = useLocation();
  const isWebsiteView = location.pathname === '/' || location.pathname === '';
  const initialChatState = readInitialChatState();
  const initialViewMode = resolveInitialChatViewMode(isWebsiteView, initialChatState);
  const hasPersistedWidgetButtonPosRef = useRef(false);

  // Website: activation timers only if panel was closed; restore open panel from persistence.
  // Closing the widget persisted widgetActivated:true (skip auto for rest of session). After a full
  // reload with the panel closed, reset flags so auto-trigger can run again.
  const [widgetActivated, setWidgetActivated] = useState(() => {
    if (!isWebsiteView) return initialChatState?.widgetActivated ?? true;
    if (initialChatState?.sessionId) return initialChatState?.widgetActivated ?? true;
    if (initialViewMode === CHAT_VIEW_MODES.WIDGET_OPEN) return true;
    return false;
  });
  const [autoPopupHandled, setAutoPopupHandled] = useState(() => {
    if (!isWebsiteView) return initialChatState?.autoPopupHandled ?? true;
    if (initialChatState?.sessionId) return initialChatState?.autoPopupHandled ?? true;
    if (initialViewMode === CHAT_VIEW_MODES.WIDGET_OPEN) return true;
    return false;
  });
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
  const [chatViewMode, setChatViewMode] = useState(initialViewMode);
  const [widgetButtonPos, setWidgetButtonPos] = useState(() => {
    const { width, height } = getViewport();
    let wasDragged = initialChatState?.widgetButtonDragged === true;
    if (!wasDragged) {
      try { wasDragged = localStorage.getItem(WIDGET_BUTTON_DRAGGED_KEY) === '1'; } catch {}
    }
    hasPersistedWidgetButtonPosRef.current = wasDragged;

    let fallbackSide = 'right';
    try {
      const panelSide = localStorage.getItem(WIDGET_PANEL_SIDE_KEY);
      if (panelSide === 'left') fallbackSide = 'right';
      if (panelSide === 'right') fallbackSide = 'left';
    } catch {
      // Use right as a safe default if panel side cannot be read.
    }
    const fallback = getDefaultWidgetButtonPosition(width, height, fallbackSide);

    const fromChat = initialChatState?.widgetButtonPos;
    if (fromChat && typeof fromChat.x === 'number' && typeof fromChat.y === 'number') {
      return clampWidgetButtonPosition(fromChat, width, height);
    }

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
  const cachedCompanies = useMemo(() => readCachedCompanies(), []);
  const [companyId, setCompanyId]   = useState(() => {
    const fromState = initialChatState?.companyId || DEFAULT_COMPANY_ID;
    if (cachedCompanies.some((c) => c.id === fromState)) return fromState;
    if (cachedCompanies.some((c) => c.id === DEFAULT_COMPANY_ID)) return DEFAULT_COMPANY_ID;
    return cachedCompanies[0]?.id || fromState;
  });
  const [widgetHeaderIconFailed, setWidgetHeaderIconFailed] = useState(false);
  const [companies, setCompanies]   = useState(() => cachedCompanies);
  const [messages, setMessages]     = useState(() => Array.isArray(initialChatState?.messages) ? initialChatState.messages : []);
  const [loading, setLoading]       = useState(false);
  const [sessionId, setSessionId]   = useState(() => initialChatState?.sessionId || null);
  const [sessions, setSessions]     = useState([]);
  const currentCompany = companies.find((c) => c.id === companyId);
  const companyNameForOpening = currentCompany?.companyName || currentCompany?.name || DEFAULT_COMPANY_NAME;
  const chatbotNameForOpening = String(currentCompany?.chatbotName || '').trim();
  const businessProfileId = String(currentCompany?.businessProfile?.id || 'generic_business');
  const effectiveOpeningLanguage = getEffectiveOpeningLanguage(
    currentCompany?.language?.primary,
    currentCompany?.language?.contentLocaleHint,
    businessProfileId
  );
  const configuredOpeningMessage = String(currentCompany?.greetingMessage || '').trim();
  const openingMessageText = configuredOpeningMessage
    && !isLegacyGenericGreeting(configuredOpeningMessage, effectiveOpeningLanguage, businessProfileId)
    ? configuredOpeningMessage
    : buildDefaultOpeningMessage(
      companyNameForOpening,
      chatbotNameForOpening,
      currentCompany?.language?.primary,
      businessProfileId,
      currentCompany?.language?.contentLocaleHint
    );
  const resolvedAutoTriggerMode = resolveAutoTriggerOpenMode(currentCompany?.autoTrigger);
  const autoTriggerConfig = useMemo(() => ({
    enabled: resolvedAutoTriggerMode === 'auto',
    openMode: resolvedAutoTriggerMode,
    afterSeconds: Math.max(0, Math.min(120, Number(currentCompany?.autoTrigger?.afterSeconds ?? AUTO_TRIGGER_DEFAULT_SECONDS))),
    afterScrollPercent: Math.max(0, Math.min(100, Number(currentCompany?.autoTrigger?.afterScrollPercent ?? AUTO_TRIGGER_DEFAULT_SCROLL_PERCENT))),
    onlySelectedPages: Boolean(currentCompany?.autoTrigger?.onlySelectedPages),
    onPricingPage: Boolean(currentCompany?.autoTrigger?.onPricingPage),
    onPortfolioPage: Boolean(currentCompany?.autoTrigger?.onPortfolioPage),
    selectedPages: String(currentCompany?.autoTrigger?.selectedPages || ''),
  }), [
    resolvedAutoTriggerMode,
    currentCompany?.autoTrigger?.enabled,
    currentCompany?.autoTrigger?.openMode,
    currentCompany?.autoTrigger?.afterSeconds,
    currentCompany?.autoTrigger?.afterScrollPercent,
    currentCompany?.autoTrigger?.onlySelectedPages,
    currentCompany?.autoTrigger?.onPricingPage,
    currentCompany?.autoTrigger?.onPortfolioPage,
    currentCompany?.autoTrigger?.selectedPages,
  ]);

  useEffect(() => {
    setWidgetHeaderIconFailed(false);
  }, [currentCompany?.iconUrl]);

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
  const typingPresenceRef = useRef({ isTyping: false, lastSentAt: 0 });
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

  const getPreferredBrowserVoice = useCallback((gender, preferredBcp47) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const allVoices = window.speechSynthesis.getVoices() || [];
    if (!allVoices.length) return null;

    const want = String(preferredBcp47 || 'en-US').trim();
    const prefix = want.split('-')[0].toLowerCase();
    const langVoices = allVoices.filter((v) => String(v.lang || '').toLowerCase().startsWith(prefix));
    const pool = langVoices.length ? langVoices : allVoices;

    const femaleHint = /(female|woman|zira|susan|samantha|aria|eva|linda|hazel|jenny|karen|emma|alloy)/i;
    const maleHint = /(male|man|david|mark|alex|guy|daniel|george|james|tom|ryan|adam)/i;
    const matcher = String(gender || 'female').toLowerCase() === 'male' ? maleHint : femaleHint;

    return pool.find((v) => matcher.test(v.name || '')) || pool[0] || null;
  }, []);

  const speakWithBrowserVoice = useCallback((text, gender = 'female', ignoreEmoji = false, onEnd, localeOpts = {}) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      return;
    }

    const speechText = sanitizeSpeechText(text, { ignoreEmoji });
    if (!speechText) return;

    const bcp47 = resolveBrowserSpeechBCp47(
      speechText,
      localeOpts.companyLangCode,
      localeOpts.ttsOverride
    );

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(speechText);
      const selectedVoice = getPreferredBrowserVoice(gender, bcp47);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || bcp47;
      } else {
        utterance.lang = bcp47;
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

  const browserVoiceLocaleOpts = useMemo(
    () => ({
      companyLangCode: currentCompany?.language?.primary,
      ttsOverride: currentCompany?.voice?.ttsLanguageCode,
    }),
    [currentCompany?.language?.primary, currentCompany?.voice?.ttsLanguageCode]
  );

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

  // â”€â”€ Theme â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      widgetButtonPos,
      widgetButtonDragged: hasPersistedWidgetButtonPosRef.current,
    };

    try { localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(chatState)); } catch {}
    try { localStorage.setItem(WIDGET_BUTTON_DRAGGED_KEY, hasPersistedWidgetButtonPosRef.current ? '1' : '0'); } catch {}

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
    widgetButtonPos,
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
      let newMode = Object.values(CHAT_VIEW_MODES).includes(chatState.chatViewMode)
        ? chatState.chatViewMode
        : CHAT_VIEW_MODES.WIDGET_CLOSED;
      if (newMode === CHAT_VIEW_MODES.FULL_PAGE) newMode = CHAT_VIEW_MODES.WIDGET_OPEN;
      setChatViewMode(newMode);
      hasPersistedWidgetButtonPosRef.current = chatState.widgetButtonDragged === true;
      if (chatState.widgetButtonPos && typeof chatState.widgetButtonPos.x === 'number' && typeof chatState.widgetButtonPos.y === 'number') {
        const { width, height } = getViewport();
        setWidgetButtonPos(clampWidgetButtonPosition(chatState.widgetButtonPos, width, height));
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isWebsiteView]);

  // Re-clamp launcher when switching company; if not dragged/persisted, keep it on the opposite side of the panel.
  useEffect(() => {
    const { width, height } = getViewport();
    const selected = companies.find((c) => c.id === companyId);
    const panelSide = selected?.widgetPosition === 'left' ? 'left' : 'right';
    const oppositeSide = panelSide === 'left' ? 'right' : 'left';

    setWidgetButtonPos((prev) => {
      if (hasPersistedWidgetButtonPosRef.current) {
        return clampWidgetButtonPosition(prev, width, height);
      }
      return getDefaultWidgetButtonPosition(width, height, oppositeSide);
    });

    try { localStorage.setItem(WIDGET_PANEL_SIDE_KEY, panelSide); } catch {}
  }, [companyId, companies]);

  // â”€â”€ Website view: when widget is open, keep activation/popup handled; when not website view, always activated â”€
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

  // Widget activation (admin-configurable auto trigger)
  useEffect(() => {
    if (!isWebsiteView || widgetActivated) return;
    if (!currentCompany) return;

    const currentPath = typeof window !== 'undefined' ? window.location.pathname : location.pathname;
    if (!shouldEnableAutoTrigger(autoTriggerConfig, currentPath)) return;

    const delayMs = Math.max(0, Number(autoTriggerConfig.afterSeconds || 0) * 1000);
    const scrollThreshold = Math.max(0, Math.min(1, Number(autoTriggerConfig.afterScrollPercent || 0) / 100));

    let delayTimer = null;
    if (delayMs <= 0) {
      setWidgetActivated(true);
    } else {
      delayTimer = setTimeout(() => setWidgetActivated(true), delayMs);
    }

    const onScroll = () => {
      if (scrollThreshold <= 0) return;
      const doc = document.documentElement;
      const scrollHeight = Math.max(doc.scrollHeight, doc.clientHeight, window.innerHeight);
      const maxScroll = scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return;
      const ratio = Math.min(1, window.scrollY / maxScroll);
      if (ratio >= scrollThreshold) setWidgetActivated(true);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isWebsiteView, widgetActivated, location.pathname, autoTriggerConfig, currentCompany]);

  // â”€â”€ Activation checks open popup once (icon is always visible/clickable) â”€â”€â”€
  useEffect(() => {
    if (!isWebsiteView || !widgetActivated || autoPopupHandled) return;

    setCurrentPage('chat');
    if (messages.length === 0 && !openingMessageShown) {
      setMessages([{ role: 'assistant', content: openingMessageText }]);
      setOpeningMessageShown(true);
    }
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN);
    setAutoPopupHandled(true);
  }, [isWebsiteView, widgetActivated, autoPopupHandled, messages.length, openingMessageShown, openingMessageText]);

  useEffect(() => {
    if (!messages.length) return;
    const firstMessage = messages[0];
    if (!firstMessage || firstMessage.role !== 'assistant') return;
    if (!isLegacyGenericGreeting(firstMessage.content, effectiveOpeningLanguage, businessProfileId)) return;
    if (firstMessage.content === openingMessageText) return;

    setMessages((prev) => {
      if (!prev.length || prev[0]?.role !== 'assistant') return prev;
      if (!isLegacyGenericGreeting(prev[0]?.content, effectiveOpeningLanguage, businessProfileId)) return prev;
      return [{ ...prev[0], content: openingMessageText }, ...prev.slice(1)];
    });
  }, [messages, openingMessageText, effectiveOpeningLanguage, businessProfileId]);

  // â”€â”€ Resize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Companies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    fetch(`${API_BASE}/train/companies`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((c) => c && c.id !== '_default')
          : [];

        setCompanies(list);
        try { localStorage.setItem(COMPANIES_CACHE_KEY, JSON.stringify(list)); } catch {}
        setCompanyId((prev) => {
          if (list.some((c) => c.id === prev)) return prev;
          if (list.some((c) => c.id === DEFAULT_COMPANY_ID)) return DEFAULT_COMPANY_ID;
          return list[0]?.id || DEFAULT_COMPANY_ID;
        });
      })
      .catch(() => {
        if (!cachedCompanies.length) {
          setCompanies([]);
          setCompanyId(DEFAULT_COMPANY_ID);
        }
      });
  }, [cachedCompanies.length]);

  useEffect(() => {
    if (!chatbotNameForOpening) return;
    setMessages((prev) => {
      let changed = false;
      const normalized = prev.map((message) => {
        if (message?.role !== 'assistant' || typeof message.content !== 'string') return message;
        const nextContent = normalizeAssistantNameInText(message.content, chatbotNameForOpening);
        if (nextContent === message.content) return message;
        changed = true;
        return { ...message, content: nextContent };
      });
      return changed ? normalized : prev;
    });
  }, [chatbotNameForOpening]);

  // â”€â”€ Sessions (reload whenever companyId changes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadSessions = useCallback(() => {
    fetch(`${API_BASE}/sessions?companyId=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]));
  }, [companyId, chatbotNameForOpening]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // â”€â”€ Active visitor presence via WebSocket (for dashboard live activity) â”€â”€â”€â”€â”€â”€â”€
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
              const content = normalizeAssistantNameInText(String(msg.content), chatbotNameForOpening);
              const voiceUrl = msg.voice?.audioDataUrl ? String(msg.voice.audioDataUrl) : undefined;
              setMessages((prev) => [...prev, { role: 'assistant', content, voiceUrl }]);
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

  // â”€â”€ Select a session: load its messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Delete a session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDeleteSession = async (id) => {
    try { await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' }); } catch {}
    if (sessionId === id) { setSessionId(null); setMessages([]); }
    loadSessions();
  };

  // â”€â”€ New chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const clearChat = () => {
    setSessionId(null);
    setMessages([]);
    setOpeningMessageShown(false);
  };

  // â”€â”€ Change company â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSelectCompany = (id) => {
    setCompanyId(id);
    setSessionId(null);
    setMessages([]);
    setOpeningMessageShown(false);
  };

  const sendTypingPresence = useCallback((isTyping) => {
    const sock = presenceWsRef.current;
    const sid = sessionIdRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN || !sid) return;

    const nextTyping = Boolean(isTyping);
    const now = Date.now();
    const last = typingPresenceRef.current;
    if (last.isTyping === nextTyping && now - last.lastSentAt < 600) return;

    try {
      sock.send(JSON.stringify({
        type: 'typing',
        companyId,
        sessionId: sid,
        isTyping: nextTyping,
      }));
      typingPresenceRef.current = { isTyping: nextTyping, lastSentAt: now };
    } catch {
      // ignore socket send failures
    }
  }, [companyId]);

  // â”€â”€ Send message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sendMessage = async (content) => {
    if (!content.trim() || loading) return;
    sendTypingPresence(false);

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
      const normalizedAssistantContent = normalizeAssistantNameInText(String(data?.content || ''), chatbotNameForOpening);
      const responseAudioDataUrl = data?.voice?.audioDataUrl;
      // Index of the new assistant message: we already added the user message earlier, so it's messages.length + 1
      const newAssistantIndex = messages.length + 1;
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: normalizedAssistantContent,
        voiceUrl: responseAudioDataUrl || undefined,
      }]);
      if (responseAudioDataUrl) {
        playAssistantVoice(responseAudioDataUrl, newAssistantIndex);
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
        { role: 'assistant', content: 'We are facing some technical issue.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const persistUiStateNow = useCallback((nextMode, nextWidgetButtonPos = widgetButtonPos, overrides = {}) => {
    const safeMode = nextMode === CHAT_VIEW_MODES.FULL_PAGE ? CHAT_VIEW_MODES.WIDGET_OPEN : nextMode;
    const persisted = readPersistedChatState() || {};
    const nextState = {
      ...persisted,
      widgetActivated,
      autoPopupHandled,
      openingMessageShown,
      currentPage,
      companyId,
      messages,
      sessionId,
      chatViewMode: safeMode,
      widgetButtonPos: nextWidgetButtonPos,
      widgetButtonDragged: hasPersistedWidgetButtonPosRef.current,
      ...overrides,
    };

    try { localStorage.setItem(CHAT_VIEW_MODE_KEY, safeMode); } catch {}
    try { localStorage.setItem(WIDGET_BUTTON_POS_KEY, JSON.stringify(nextWidgetButtonPos)); } catch {}
    try { localStorage.setItem(WIDGET_BUTTON_DRAGGED_KEY, hasPersistedWidgetButtonPosRef.current ? '1' : '0'); } catch {}
    try { localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(nextState)); } catch {}
    try {
      window.history.replaceState(
        { ...(window.history.state || {}), aiChat: nextState },
        ''
      );
    } catch {}
  }, [
    widgetButtonPos,
    widgetActivated,
    autoPopupHandled,
    openingMessageShown,
    currentPage,
    companyId,
    messages,
    sessionId,
  ]);

  const handleOpenWidget = () => {
    setCurrentPage('chat');
    if (isWebsiteView) setAutoPopupHandled(true);
    if (isWebsiteView && messages.length === 0 && !openingMessageShown) {
      setMessages([{ role: 'assistant', content: openingMessageText }]);
      setOpeningMessageShown(true);
    }
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN);
    persistUiStateNow(CHAT_VIEW_MODES.WIDGET_OPEN, widgetButtonPos, {
      currentPage: 'chat',
      widgetActivated: true,
      autoPopupHandled: true,
      openingMessageShown: openingMessageShown || (isWebsiteView && messages.length === 0),
    });
  };

  const handleCloseWidget = () => {
    sendTypingPresence(false);
    if (isWebsiteView) {
      setWidgetActivated(true);
      setAutoPopupHandled(true);
    }
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_CLOSED);
    persistUiStateNow(CHAT_VIEW_MODES.WIDGET_CLOSED, widgetButtonPos, {
      widgetActivated: true,
      autoPopupHandled: true,
    });
  };

  const handleMaximizeWidget = () => {
    setCurrentPage('chat');
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN); // Disabled full page mode
    persistUiStateNow(CHAT_VIEW_MODES.WIDGET_OPEN, widgetButtonPos, {
      currentPage: 'chat',
      widgetActivated: true,
      autoPopupHandled: true,
    });
  };

  const handleMinimizeToWidget = () => {
    setCurrentPage('chat');
    setChatViewMode(CHAT_VIEW_MODES.WIDGET_OPEN);
    persistUiStateNow(CHAT_VIEW_MODES.WIDGET_OPEN, widgetButtonPos, {
      currentPage: 'chat',
      widgetActivated: true,
      autoPopupHandled: true,
    });
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
      const { width, height } = getViewport();
      const next = clampWidgetButtonPosition(
        {
          x: drag.originX + (event.clientX - drag.startClientX),
          y: drag.originY + (event.clientY - drag.startClientY),
        },
        width,
        height
      );
      hasPersistedWidgetButtonPosRef.current = true;
      setWidgetButtonPos(next);
      persistUiStateNow(chatViewMode, next);
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

  const companyName = currentCompany?.displayName || currentCompany?.name || DEFAULT_COMPANY_NAME;
  const companyIconUrl = resolvePublicMediaUrl(currentCompany?.iconUrl);
  const widgetSide = currentCompany?.widgetPosition === 'left' ? 'left' : 'right';
  const greetingMessage = currentCompany?.greetingMessage || null;
  const voiceEnabled = Boolean(currentCompany?.voice?.enabled);
  const voiceResponseEnabled = currentCompany?.voice?.responseEnabled !== false;
  const voiceGender = currentCompany?.voice?.gender === 'male' ? 'male' : 'female';
  const handlePlayBrowserVoice = useCallback(async (content, messageIndex) => {
    if (!content || messageIndex == null) return;

    pauseAssistantVoice();
    setPlayingMessageIndex(messageIndex);

    try {
      if (!sessionId) throw new Error('Session-backed ElevenLabs audio is unavailable');

      const res = await fetch(`${API_BASE}/chat/voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Page-Url': typeof window !== 'undefined' ? window.location.href : '',
        },
        body: JSON.stringify({
          companyId: companyId || DEFAULT_COMPANY_ID,
          sessionId: sessionId || undefined,
          messageIndex: messageIndex ?? undefined,
          text: content,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to synthesize message voice');
      }

      const data = await res.json();
      const audioDataUrl = data?.voice?.audioDataUrl;
      if (!audioDataUrl) {
        throw new Error('Missing ElevenLabs audio response');
      }

      setMessages((prev) => prev.map((message, index) => (
        index === messageIndex ? { ...message, voiceUrl: audioDataUrl } : message
      )));
      playAssistantVoice(audioDataUrl, messageIndex);
      return;
    } catch {
      speakWithBrowserVoice(
        content,
        voiceGender,
        Boolean(currentCompany?.voice?.ignoreEmoji),
        () => setPlayingMessageIndex(null),
        browserVoiceLocaleOpts
      );
    }
  }, [pauseAssistantVoice, sessionId, companyId, playAssistantVoice, speakWithBrowserVoice, voiceGender, currentCompany?.voice?.ignoreEmoji, browserVoiceLocaleOpts]);
  const companyThemeStyle = buildCompanyThemeStyle(currentCompany?.theme, theme);
  const isFullPage = chatViewMode === CHAT_VIEW_MODES.FULL_PAGE;
  const isWidgetOpen = chatViewMode === CHAT_VIEW_MODES.WIDGET_OPEN;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `${companyName} Chatbot`;
  }, [companyName]);
  /** Draggable launcher / minimize control â€” position persisted in localStorage + CHAT_STATE_KEY */
  const widgetButtonStyle = {
    left: `${widgetButtonPos.x}px`,
    top: `${widgetButtonPos.y}px`,
    right: 'auto',
    bottom: 'auto',
  };

  /** Full-height sidebar when widget is open (desktop), docked left/right from admin setting */
  const panelStyle = isWidgetOpen && !isSmallScreen ? (() => {
    const w = 'min(420px, calc(100vw - 48px))';
    const base = {
      top: 0,
      bottom: 0,
      height: '100dvh',
      maxHeight: '100dvh',
      width: w,
      borderRadius: 0,
      boxShadow:
        widgetSide === 'left'
          ? '8px 0 28px -10px rgba(0,0,0,0.22)'
          : '-8px 0 28px -10px rgba(0,0,0,0.22)',
    };
    return widgetSide === 'left'
      ? { ...base, left: 0, right: 'auto' }
      : { ...base, right: 0, left: 'auto' };
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
          onTypingChange={sendTypingPresence}
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
              <div className="chat-widget-title-wrap">
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="chat-widget-icon-btn"
                    onClick={clearChat}
                    aria-label="Start new chat"
                    title="New chat"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <span className="chat-widget-title">{companyName}</span>
                </div>
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

                <button
                  type="button"
                  className="chat-widget-icon-btn"
                  onClick={handleCloseWidget}
                  aria-label="Close widget"
                  title="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>

                <span
                  className="chat-widget-avatar"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-hidden="true"
                >
                  {companyIconUrl && !widgetHeaderIconFailed ? (
                    <img
                      src={companyIconUrl}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        display: 'block',
                        background: '#fff',
                      }}
                      onError={() => setWidgetHeaderIconFailed(true)}
                    />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--chat-header-text, #fff)' }}>
                      {(companyName || '?').trim().charAt(0).toUpperCase() || '?'}
                    </span>
                  )}
                </span>
              </div>
            </header>

            <div className="chat-widget-main">
              <ChatMain
                messages={messages}
                loading={loading}
                onSend={sendMessage}
                onTypingChange={sendTypingPresence}
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
