/**
 * JP Loft / AI Chat Agent - embeddable widget (vanilla JS)
 * Usage: <script src="https://your-domain.com/chat-widget.js" data-api-url="https://your-api.com/api" data-company-id="_JP_Loft"></script>
 * Or set window.JPLoftChatConfig = { apiUrl: '...', companyId: '...', companyName: 'JP Loft', apiKey: 'optional-embed-key' } before loading.
 * Optional apiKey is sent as header X-Embed-Api-Key on API requests (per-company key from your dashboard).
 *
 * Activation is configurable from admin auto-trigger settings.
 * Opening message uses company settings (greeting message if configured, otherwise company + chatbot names).
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var config = window.JPLoftChatConfig || {};
  var apiUrl = (script && script.getAttribute('data-api-url')) || config.apiUrl || '';
  var companyId = (script && script.getAttribute('data-company-id')) || config.companyId || '_JP_Loft';
  var companyName = (script && script.getAttribute('data-company-name')) || config.companyName || 'JP Loft';
  var companyLegalName = companyName;
  var chatbotDisplayName = '';
  var apiKey = (script && script.getAttribute('data-api-key')) || config.apiKey || '';
  var forceOpen = Boolean(config.forceOpen || (script && script.getAttribute('data-force-open') === 'true'));
  var explicitWidgetSide = (script && script.getAttribute('data-widget-side')) || config.widgetSide || '';
  var widgetSide = String(explicitWidgetSide || 'right').toLowerCase() === 'left' ? 'left' : 'right';
  var avatarLetter = ((companyName || '').trim().charAt(0) || 'J').toUpperCase();
  var companyIconUrl = null;
  var companyGreetingMessage = null;
  var companyPrimaryLanguage = 'en';
  var companyVoiceTtsLanguage = '';
  var companyContentLocaleHint = '';
  var companyBusinessProfile = { id: 'generic_business' };

  var DEFAULT_OPENING_QUESTION = 'How can I help you today?';
  var CHAT_STATE_KEY = 'ai-chat-state';
  var WIDGET_SIDE_BY_COMPANY_KEY = 'ai-chat-widget-side-by-company-v1';
  var AUTO_TRIGGER_DEFAULT_SECONDS = 8;
  var AUTO_TRIGGER_DEFAULT_SCROLL_PERCENT = 40;
  var TABLET_BREAKPOINT = 1024;
  var MOBILE_BREAKPOINT = 768;
  var WIDGET_BUTTON_SIZE = 56;
  var WIDGET_BUTTON_MARGIN_DESKTOP = 24;
  var WIDGET_BUTTON_MARGIN_MOBILE = 14;
  var DRAG_DISTANCE_THRESHOLD = 6;
  var PANEL_GAP = 12;

  if (!apiUrl) {
    console.warn('[JPLoft Chat] data-api-url or JPLoftChatConfig.apiUrl required');
    return;
  }

  function readPersistedWidgetSide() {
    if (explicitWidgetSide) return widgetSide;
    try {
      var raw = typeof localStorage !== 'undefined' && localStorage.getItem(WIDGET_SIDE_BY_COMPANY_KEY);
      if (!raw) return widgetSide;
      var parsed = JSON.parse(raw);
      var side = parsed && typeof parsed === 'object' ? parsed[companyId] : null;
      return side === 'left' || side === 'right' ? side : widgetSide;
    } catch (e) {
      return widgetSide;
    }
  }
  widgetSide = readPersistedWidgetSide();

  function mergeHeaders(extra) {
    var h = {};
    if (extra && typeof extra === 'object') {
      var k;
      for (k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
      }
    }
    if (apiKey) h['X-Embed-Api-Key'] = apiKey;
    return h;
  }

  var ISO_OPENING = { en: 'english', ru: 'russian', uk: 'ukrainian', ar: 'arabic', hi: 'hindi', ja: 'japanese', zh: 'chinese', ko: 'korean' };
  var LANG_BCP47 = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', uk: 'uk-UA', nl: 'nl-NL', cs: 'cs-CZ', ar: 'ar-SA', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', hi: 'hi-IN', hu: 'hu-HU', fi: 'fi-FI', el: 'el-GR', he: 'he-IL', vi: 'vi-VN', no: 'nb-NO', sv: 'sv-SE', da: 'da-DK', ro: 'ro-RO', id: 'id-ID', ms: 'ms-MY', fil: 'fil-PH', sk: 'sk-SK', hr: 'hr-HR', bg: 'bg-BG', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN' };

  function resolveWidgetSpeechBcp47(text) {
    var t = String(text || '');
    try {
      if (/\p{Script=Cyrillic}/u.test(t)) return 'ru-RU';
      if (/\p{Script=Arabic}/u.test(t)) return 'ar-SA';
      if (/\p{Script=Devanagari}/u.test(t)) return 'hi-IN';
      if (/\p{Script=Han}/u.test(t)) return 'zh-CN';
      if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t)) return 'ja-JP';
      if (/\p{Script=Hangul}/u.test(t)) return 'ko-KR';
    } catch (e) {}
    var ove = String(companyVoiceTtsLanguage || '').trim().toLowerCase();
    if (ove && LANG_BCP47[ove]) return LANG_BCP47[ove];
    var c = String(companyPrimaryLanguage || 'en').trim().toLowerCase();
    return LANG_BCP47[c] || 'en-US';
  }

  function normalizePrimaryLanguage(language) {
    var value = String(language || '').trim().toLowerCase();
    if (!value) return 'english';
    if (Object.prototype.hasOwnProperty.call(ISO_OPENING, value)) return ISO_OPENING[value];
    if (['ru', 'ru-ru', 'russian', 'русский', 'русский язык'].indexOf(value) >= 0) return 'russian';
    if (['uk', 'uk-ua', 'ukrainian', 'українська', 'украинский'].indexOf(value) >= 0) return 'ukrainian';
    if (['ar', 'arabic', 'العربية'].indexOf(value) >= 0) return 'arabic';
    if (['hi', 'hindi', 'हिन्दी', 'हिंदी'].indexOf(value) >= 0) return 'hindi';
    if (['ja', 'ja-jp', 'japanese', '日本語'].indexOf(value) >= 0) return 'japanese';
    if (['zh', 'zh-cn', 'zh-tw', 'chinese', '中文'].indexOf(value) >= 0) return 'chinese';
    if (['ko', 'ko-kr', 'korean', '한국어'].indexOf(value) >= 0) return 'korean';
    return 'english';
  }

  function getEffectiveOpeningLanguage(primaryLanguage, contentLocaleHint, businessProfileId) {
    var primary = normalizePrimaryLanguage(primaryLanguage);
    var hint = contentLocaleHint ? normalizePrimaryLanguage(contentLocaleHint) : null;
    if (primary !== 'english') return primary;
    if (String(businessProfileId || 'generic_business') === 'ecommerce_marketplace' && hint && hint !== 'english') {
      return hint;
    }
    return primary;
  }

  function isLegacyGenericGreeting(text, primaryLanguage, businessProfileId) {
    var value = String(text || '').trim();
    if (!value) return false;

    var normalizedLanguage = normalizePrimaryLanguage(primaryLanguage);
    var englishLegacy = /(hi!\s*welcome to|your digital consultant|are you looking to build something|exploring ideas)/i.test(value);
    var genericBusinessPitch = /(цифровой консультант|решени(е|я) для своего бизнеса|наших услуг|изучаете возможности|what do you want to build|our services|business solution)/i.test(value);
    var storeTerms = /(товар|товары|категори|акци|доставк|возврат|пункт(ы)? выдачи|магазин|маркетплейс|product|products|category|categories|promotion|delivery|return|pickup|store|marketplace)/i.test(value);

    if (normalizedLanguage !== 'english' && englishLegacy) return true;
    if (String(businessProfileId || 'generic_business') === 'ecommerce_marketplace' && genericBusinessPitch && !storeTerms) return true;
    return false;
  }

  function buildOpeningCopy(language, legalName, botName, businessProfileId) {
    var introName = String(botName || '').trim();
    var welcomeCompany = String(legalName || companyName || 'our company').trim() || 'our company';

    if (String(businessProfileId || 'generic_business') === 'ecommerce_marketplace') {
      var marketplaceCopyByLanguage = {
        russian: {
          welcome: 'Здравствуйте! Добро пожаловать в ' + welcomeCompany + '!',
          intro: introName ? 'Я ' + introName + '.' : 'Я помогу вам с сайтом магазина.',
          question: 'Подскажу по товарам, категориям, акциям, доставке, возврату и пунктам выдачи. Что вас интересует?',
        },
        english: {
          welcome: 'Hi! Welcome to ' + welcomeCompany + '!',
          intro: introName ? "I\'m " + introName + '.' : 'I can help you with the store website.',
          question: 'I can help with products, categories, promotions, delivery, returns, and pickup points. What are you looking for?',
        },
      };

      return marketplaceCopyByLanguage[language] || marketplaceCopyByLanguage.english;
    }

    var copyByLanguage = {
      russian: {
        welcome: 'Здравствуйте! Добро пожаловать в ' + welcomeCompany + '!',
        intro: introName ? 'Я ' + introName + ', ваш цифровой консультант.' : 'Я ваш цифровой консультант.',
        question: 'Чем могу помочь вам сегодня?',
      },
      ukrainian: {
        welcome: 'Вітаю! Ласкаво просимо до ' + welcomeCompany + '!',
        intro: introName ? 'Я ' + introName + ', ваш цифровий консультант.' : 'Я ваш цифровий консультант.',
        question: 'Чим можу допомогти вам сьогодні?',
      },
      arabic: {
        welcome: 'مرحباً! أهلاً بك في ' + welcomeCompany + '!',
        intro: introName ? 'أنا ' + introName + '، مستشارك الرقمي.' : 'أنا مستشارك الرقمي.',
        question: 'كيف يمكنني مساعدتك اليوم؟',
      },
      hindi: {
        welcome: 'नमस्ते! ' + welcomeCompany + ' में आपका स्वागत है!',
        intro: introName ? 'मैं ' + introName + ' हूं, आपका डिजिटल कंसल्टेंट।' : 'मैं आपका डिजिटल कंसल्टेंट हूं।',
        question: 'मैं आज आपकी किस प्रकार सहायता कर सकता हूँ?',
      },
      japanese: {
        welcome: 'こんにちは。' + welcomeCompany + 'へようこそ。',
        intro: introName ? '私は' + introName + 'です。デジタルコンサルタントとしてご案内します。' : 'デジタルコンサルタントとしてご案内します。',
        question: '本日はどのようなご用件でしょうか。',
      },
      chinese: {
        welcome: '您好，欢迎来到' + welcomeCompany + '！',
        intro: introName ? '我是' + introName + '，您的数字顾问。' : '我是您的数字顾问。',
        question: '今天我可以为您提供什么帮助？',
      },
      korean: {
        welcome: '안녕하세요. ' + welcomeCompany + '에 오신 것을 환영합니다.',
        intro: introName ? '저는 ' + introName + '이며 디지털 컨설턴트입니다.' : '저는 디지털 컨설턴트입니다.',
        question: '오늘 무엇을 도와드릴까요?',
      },
      english: {
        welcome: 'Hi! Welcome to ' + welcomeCompany + '!',
        intro: introName ? "I'm " + introName + ', your digital consultant.' : "I'm your digital consultant.",
        question: DEFAULT_OPENING_QUESTION,
      },
    };
    return copyByLanguage[language] || copyByLanguage.english;
  }

  var activated = false;
  var opened = false;
  var openingMessageShown = false;
  var stopActivationWatchers = null;
  var messages = [];
  var sessionId = null;
  var sessions = [];
  var loading = false;
  var persistedWidgetOpen = false;
  var autoTrigger = {
    enabled: true,
    openMode: 'auto',
    afterSeconds: AUTO_TRIGGER_DEFAULT_SECONDS,
    afterScrollPercent: AUTO_TRIGGER_DEFAULT_SCROLL_PERCENT,
    onlySelectedPages: false,
    onPricingPage: false,
    onPortfolioPage: false,
    selectedPages: '',
  };

  var requestGeneration = 0;

  var presenceWs = null;
  var wsReconnectTimer = null;
  var WS_RECONNECT_MS = 5000;
  var typingTimer = null;
  var responseAudio = null;
  var speechUtterance = null;
  var playingMessageIndex = null;
  var speechRecognition = null;
  var keepMicOpen = false;
  var micRecording = false;
  var voiceEnabled = false;
  var voiceResponseEnabled = true;
  var voiceGender = 'female';
  var voiceIgnoreEmoji = false;

  var root = null;
  var launcher = null;
  var panel = null;
  var closeFab = null;
  var sidebarEl = null;
  var messagesEl = null;
  var inputEl = null;
  var sendBtn = null;
  var micBtn = null;
  var maxBtn = null;

  var isFullscreen = false;
  var ignoreButtonClick = false;
  var dragState = {
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  };

  var viewport = getViewport();
  var widgetButtonPos = getDefaultWidgetButtonPosition(viewport.width, viewport.height);

  (function readPersistedState() {
    try {
      var raw = typeof localStorage !== 'undefined' && localStorage.getItem(CHAT_STATE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s === 'object' && s.companyId && s.companyId === companyId) {
        if (Array.isArray(s.messages)) messages = s.messages;
        if (s.sessionId != null) sessionId = s.sessionId;
        if (s.openingMessageShown != null) openingMessageShown = s.openingMessageShown;
        if (s.widgetButtonPos && typeof s.widgetButtonPos.x === 'number' && typeof s.widgetButtonPos.y === 'number') {
          widgetButtonPos = clampWidgetButtonPosition(s.widgetButtonPos, viewport.width, viewport.height);
        }
        if (s.widgetOpen === true) persistedWidgetOpen = true;
      }
    } catch (e) {}
  })();

  function getViewport() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 1280,
      height: window.innerHeight || document.documentElement.clientHeight || 720,
    };
  }

  function clampColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
  function normalizeHexColor(value) {
    var trimmed = String(value || '').trim();
    return /^#([0-9a-f]{6})$/i.test(trimmed) ? trimmed.toUpperCase() : null;
  }
  function hexToRgb(hex) {
    var n = normalizeHexColor(hex);
    if (!n) return null;
    return {
      r: parseInt(n.slice(1, 3), 16),
      g: parseInt(n.slice(3, 5), 16),
      b: parseInt(n.slice(5, 7), 16),
    };
  }
  function rgbToHex(rgb) {
    var parts = [rgb.r, rgb.g, rgb.b].map(function (c) {
      return clampColorChannel(c).toString(16).padStart(2, '0');
    });
    return '#' + parts.join('').toUpperCase();
  }
  function mixHexColors(base, mixWith, ratio) {
    var a = hexToRgb(base);
    var b = hexToRgb(mixWith);
    if (!a || !b) return normalizeHexColor(base) || normalizeHexColor(mixWith) || null;
    var mix = Math.max(0, Math.min(1, ratio));
    return rgbToHex({
      r: a.r + (b.r - a.r) * mix,
      g: a.g + (b.g - a.g) * mix,
      b: a.b + (b.b - a.b) * mix,
    });
  }
  function withAlpha(hex, alpha) {
    var rgb = hexToRgb(hex);
    if (!rgb) return undefined;
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }
  function buildThemeVars(theme) {
    if (!theme) return null;
    var primary = normalizeHexColor(theme.primaryColor);
    var primaryDark = normalizeHexColor(theme.primaryDarkColor) || mixHexColors(primary, '#000000', 0.35);
    var secondary = normalizeHexColor(theme.secondaryColor) || '#E5E7EB';
    var secondaryLight = normalizeHexColor(theme.secondaryLightColor) || mixHexColors(secondary, '#FFFFFF', 0.12);
    if (!primary) return null;
    var headerBg = theme.headerBackground || null;
    var headerShadowVal = theme.headerShadow || null;
    var headerText = theme.headerTextColor || null;
    var background = secondaryLight || mixHexColors(secondary, '#F5F5FC', 0.45) || '#F5F5FC';
    var sidebar = mixHexColors(secondary, '#F8F8FF', 0.35) || '#F8F8FF';
    var surface = '#FFFFFF';
    var border = mixHexColors(primary, '#E5E7EB', 0.82) || '#E5E7EB';
    var assistantBubble = mixHexColors('#FFFFFF', secondaryLight || '#F5F5FC', 0.45) || '#FBFBFE';
    var bodyText = '#1F2937';
    var mutedText = '#6B7280';
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
      '--session-hover-bg': withAlpha('#FFFFFF', 0.08),
      '--session-active-bg': withAlpha(primary, 0.2),
      '--session-active-color': mixHexColors(primary, '#FFFFFF', 0.2) || primary,
      '--chat-header-bg': headerBg || 'linear-gradient(120deg,' + primary + ',' + primaryDark + ')',
      '--chat-header-shadow': headerShadowVal || 'none',
      '--chat-header-text': headerText || '#FFFFFF',
      '--chat-launcher-gradient-start': primary,
      '--chat-launcher-gradient-end': primaryDark,
      '--chat-launcher-shadow': withAlpha(primary, 0.55),
    };
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
    var margin = getWidgetButtonMargin(viewportWidth);
    var maxX = Math.max(margin, viewportWidth - WIDGET_BUTTON_SIZE - margin);
    var maxY = Math.max(margin, viewportHeight - WIDGET_BUTTON_SIZE - margin);

    return {
      x: clampValue(position.x, margin, maxX),
      y: clampValue(position.y, margin, maxY),
    };
  }

  function getDefaultWidgetButtonPosition(viewportWidth, viewportHeight) {
    var margin = getWidgetButtonMargin(viewportWidth);
    return clampWidgetButtonPosition(
      {
        x: widgetSide === 'left' ? margin : (viewportWidth - WIDGET_BUTTON_SIZE - margin),
        y: viewportHeight - WIDGET_BUTTON_SIZE - margin,
      },
      viewportWidth,
      viewportHeight
    );
  }

  function parseAutoTriggerRules(value) {
    return String(value || '')
      .split(/[\n,]/)
      .map(function (entry) { return entry.trim().toLowerCase(); })
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
    var path = stripPathSlashes(pathname);
    var r = stripPathSlashes(rule);
    if (!r) return path === '';

    if (r.charAt(r.length - 1) === '*') {
      var prefix = r.slice(0, -1);
      if (!prefix) return true;
      return path === prefix || path.indexOf(prefix + '/') === 0;
    }

    return path === r || path.indexOf(r + '/') === 0;
  }

  function resolveAutoTriggerOpenMode(autoTriggerConfig) {
    var configuredMode = String((autoTriggerConfig && autoTriggerConfig.openMode) || '').trim().toLowerCase();

    if (configuredMode === 'click') return 'click';
    if (configuredMode === 'auto') return autoTriggerConfig && autoTriggerConfig.enabled === false ? 'click' : 'auto';
    return autoTriggerConfig && autoTriggerConfig.enabled === false ? 'click' : 'auto';
  }

  function shouldEnableAutoTrigger(pathname) {
    if (resolveAutoTriggerOpenMode(autoTrigger) !== 'auto') return false;

    var rules = parseAutoTriggerRules(autoTrigger.selectedPages);
    var hasTargeting = Boolean(
      autoTrigger.onlySelectedPages ||
      autoTrigger.onPricingPage ||
      autoTrigger.onPortfolioPage ||
      rules.length
    );
    if (!hasTargeting) return true;

    var path = String(pathname || '/').toLowerCase();
    var matched = false;
    if (autoTrigger.onPricingPage && /(^|\/)pricing(\/|$)/i.test(path)) matched = true;
    if (autoTrigger.onPortfolioPage && /(^|\/)portfolio(\/|$)/i.test(path)) matched = true;
    if (rules.some(function (rule) { return matchPathRule(path, rule); })) matched = true;
    return matched;
  }

  function isSmallScreen() {
    return getViewport().width <= TABLET_BREAKPOINT;
  }

  function setWidgetDragging(isDragging) {
    if (launcher) launcher.classList[isDragging ? 'add' : 'remove']('is-dragging');
    if (closeFab) closeFab.classList[isDragging ? 'add' : 'remove']('is-dragging');
  }

  function resetDragState() {
    dragState = {
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      originX: 0,
      originY: 0,
      moved: false,
    };
    setWidgetDragging(false);
  }

  function applyWidgetButtonPosition() {
    if (!launcher) return;

    [launcher].forEach(function (el) {
      el.style.left = widgetButtonPos.x + 'px';
      el.style.top = widgetButtonPos.y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
  }

  function updateMaxButtonState() {
    if (!maxBtn) return;

    if (isSmallScreen()) {
      maxBtn.style.display = 'none';
      return;
    }

    maxBtn.style.display = 'inline-flex';
    if (isFullscreen) {
      maxBtn.setAttribute('aria-label', 'Restore chat size');
      maxBtn.setAttribute('title', 'Restore');
      maxBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="10" y1="14" x2="3" y2="21"/></svg>';
      return;
    }

    maxBtn.setAttribute('aria-label', 'Expand to full screen');
    maxBtn.setAttribute('title', 'Full screen');
    maxBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  }

  function updateCloseFabVisibility() {
    if (!closeFab) return;
    closeFab.style.display = 'none';
  }

  function updatePanelPosition() {
    if (!panel) return;

    var vp = getViewport();
    var fullscreenActive = isFullscreen || vp.width <= TABLET_BREAKPOINT;

    if (fullscreenActive) {
      panel.classList.add('is-fullscreen');
      panel.style.left = '0';
      panel.style.top = '0';
      panel.style.right = '0';
      panel.style.bottom = '0';
      panel.style.width = '100vw';
      panel.style.height = '100dvh';
      panel.style.maxWidth = '100vw';
      panel.style.maxHeight = '100dvh';
    } else {
      var sideProp = widgetSide === 'left' ? 'left' : 'right';
      var resetProp = sideProp === 'left' ? 'right' : 'left';
      panel.classList.remove('is-fullscreen');
      panel.style[sideProp] = '0';
      panel.style[resetProp] = 'auto';
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.width = 'min(420px,calc(100vw - 48px))';
      panel.style.height = '100dvh';
      panel.style.maxWidth = '';
      panel.style.maxHeight = '100dvh';
      panel.style.borderRadius = '0';
      panel.style.boxShadow = sideProp === 'left'
        ? '8px 0 28px -10px rgba(0,0,0,0.22)'
        : '-8px 0 28px -10px rgba(0,0,0,0.22)';
    }

    updateMaxButtonState();
    updateCloseFabVisibility();
  }

  function onViewportResize() {
    var vp = getViewport();
    widgetButtonPos = clampWidgetButtonPosition(widgetButtonPos, vp.width, vp.height);
    applyWidgetButtonPosition();
    updatePanelPosition();
  }

  function withDragGuard(action) {
    return function (event) {
      if (ignoreButtonClick) {
        ignoreButtonClick = false;
        event.preventDefault();
        return;
      }
      action(event);
    };
  }

  function onWidgetButtonPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;

    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: widgetButtonPos.x,
      originY: widgetButtonPos.y,
      moved: false,
    };

    if (event.currentTarget && event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onWidgetButtonPointerMove(event) {
    if (dragState.pointerId === null || event.pointerId !== dragState.pointerId) return;

    var deltaX = event.clientX - dragState.startClientX;
    var deltaY = event.clientY - dragState.startClientY;

    if (!dragState.moved && Math.hypot(deltaX, deltaY) >= DRAG_DISTANCE_THRESHOLD) {
      dragState.moved = true;
      setWidgetDragging(true);
    }

    if (!dragState.moved) return;

    var vp = getViewport();
    widgetButtonPos = clampWidgetButtonPosition(
      {
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      },
      vp.width,
      vp.height
    );

    applyWidgetButtonPosition();
    updatePanelPosition();

    event.preventDefault();
  }

  function onWidgetButtonPointerUp(event) {
    if (dragState.pointerId === null || event.pointerId !== dragState.pointerId) return;

    if (dragState.moved) {
      ignoreButtonClick = true;
      event.preventDefault();
      var vp = getViewport();
      widgetButtonPos = clampWidgetButtonPosition(
        {
          x: dragState.originX + (event.clientX - dragState.startClientX),
          y: dragState.originY + (event.clientY - dragState.startClientY),
        },
        vp.width,
        vp.height
      );
      applyWidgetButtonPosition();
      updatePanelPosition();
      persistState();
    }

    if (event.currentTarget && event.currentTarget.releasePointerCapture) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetDragState();
  }

  function loadSessions() {
    fetch(apiUrl + '/sessions?companyId=' + encodeURIComponent(companyId), { headers: mergeHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        sessions = Array.isArray(data) ? data : [];
        if (sidebarEl && isFullscreen) renderSidebar();
      })
      .catch(function () { sessions = []; });
  }

  function deleteSession(id) {
    fetch(apiUrl + '/sessions/' + encodeURIComponent(id), { method: 'DELETE', headers: mergeHeaders() })
      .then(function () {
        if (sessionId === id) {
          stopMicCapture();
          pauseAssistantVoice();
          sessionId = null;
          messages = [];
          openingMessageShown = false;
          messages.push({ role: 'assistant', content: getOpeningMessage() });
          openingMessageShown = true;
          renderMessages();
          persistState();
        }
        loadSessions();
      })
      .catch(function () {});
  }

  function renderSidebar() {
    if (!sidebarEl) return;
    var newBtn = '<button type="button" class="jploft-sidebar-new">+ New chat</button>';
    var list = sessions.map(function (s) {
      var title = (s.title && s.title.trim()) || 'New Chat';
      var active = sessionId === s.id ? ' active' : '';
      var delBtn = '<button type="button" class="jploft-sidebar-del" data-session-id="' + escapeHtml(s.id) + '" aria-label="Delete conversation" title="Delete">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>';
      return '<div class="jploft-sidebar-item' + active + '" data-session-id="' + escapeHtml(s.id) + '" title="' + escapeHtml(title) + '">' +
        '<span class="jploft-sidebar-item-title">' + escapeHtml(title) + '</span>' + delBtn + '</div>';
    }).join('');
    sidebarEl.innerHTML = '<div class="jploft-sidebar-header">Sessions</div>' + newBtn + '<div class="jploft-sidebar-list">' + list + '</div>';
    var newChatBtn = sidebarEl.querySelector('.jploft-sidebar-new');
    if (newChatBtn) {
      newChatBtn.onclick = function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        newChat();
      };
    }
    sidebarEl.querySelectorAll('.jploft-sidebar-item').forEach(function (el) {
      var id = el.getAttribute('data-session-id');
      el.onclick = function (e) {
        if (e.target.closest('.jploft-sidebar-del')) return;
        if (id) selectSession(id);
      };
    });
    sidebarEl.querySelectorAll('.jploft-sidebar-del').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var sid = btn.getAttribute('data-session-id');
        if (sid) deleteSession(sid);
      };
    });
  }

  function newChat() {
    stopMicCapture();
    pauseAssistantVoice();
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    sendPresenceTyping(false);
    requestGeneration++;
    loading = false;
    sessionId = null;
    sendPresenceRegister(undefined);
    messages = [];
    openingMessageShown = false;
    messages.push({ role: 'assistant', content: getOpeningMessage() });
    openingMessageShown = true;
    if (inputEl) {
      inputEl.value = '';
      resizeInput();
    }
    setSendButtonState();
    renderMessages();
    persistState();
    if (sidebarEl && isFullscreen) renderSidebar();
  }

  function selectSession(id) {
    stopMicCapture();
    pauseAssistantVoice();
    sessionId = id;
    loading = true;
    setSendButtonState();
    renderMessages();
    fetch(apiUrl + '/sessions/' + encodeURIComponent(id) + '/messages', { headers: mergeHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        messages = Array.isArray(data) ? data.map(function (m) {
          var content = m.role === 'assistant'
            ? normalizeAssistantNameInText(m.content, chatbotDisplayName)
            : m.content;
          return {
            role: m.role,
            content: content,
            voiceUrl: m.voice_url || m.voiceUrl || undefined,
          };
        }) : [];
        loading = false;
        setSendButtonState();
        applyVoiceFeatureState();
        renderMessages();
        persistState();
        if (sidebarEl && isFullscreen) renderSidebar();
      })
      .catch(function () {
        messages = [];
        loading = false;
        setSendButtonState();
        renderMessages();
        if (sidebarEl && isFullscreen) renderSidebar();
      });
  }

  function toggleFullscreen(event) {
    if (event) event.preventDefault();
    if (isSmallScreen()) return;

    isFullscreen = !isFullscreen;
    updatePanelPosition();
    if (isFullscreen) {
      loadSessions();
      if (sidebarEl) renderSidebar();
    }
  }

  function createStyles() {
    var css = [
      '#jploft-chat-root{--chat-bg:#f4f4f5;--chat-surface:#ffffff;--chat-border:#d4d4d8;--chat-text:#18181b;--chat-text-heading:#09090b;--chat-muted:#71717a;--chat-accent:#E02F3A;--chat-accent-hover:#B02530;--chat-header-bg:#000000;--chat-header-shadow:0 4px 12px rgba(224,47,58,0.25);--chat-header-text:#ffffff;--chat-sidebar:#e4e4e7;--user-bubble:#E02F3A;--user-bubble-text:#ffffff;--assistant-bubble:#ffffff;--session-hover-bg:rgba(0,0,0,0.05);--session-active-bg:rgba(224,47,58,0.2);--session-active-color:#E02F3A;--chat-launcher-gradient-start:#E02F3A;--chat-launcher-gradient-end:#B02530;--chat-launcher-shadow:rgba(224,47,58,0.55);font-family:Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '#jploft-chat-root *{box-sizing:border-box}',
      '#jploft-chat-root button,#jploft-chat-root textarea{font:inherit}',
      '#jploft-chat-root svg{display:inline-block;overflow:visible;flex-shrink:0}',
      '#jploft-chat-root button{padding:0;margin:0}',
      '#jploft-chat-root input,#jploft-chat-root select,#jploft-chat-root textarea{margin:0}',
      '#jploft-chat-root ul,#jploft-chat-root ol{list-style:none;margin:0;padding:0}',
      '#jploft-chat-root a{color:inherit}',
      '#jploft-chat-root img{display:inline-block;max-width:100%;height:auto}',
      '#jploft-chat-root *{outline:none}',
      '#jploft-chat-root *::before,#jploft-chat-root *::after{box-sizing:border-box}',

      '#jploft-chat-root .jploft-btn img.jploft-launcher-icon,#jploft-chat-root .jploft-close-fab img.jploft-launcher-icon{width:28px;height:28px;object-fit:contain;object-position:center;border-radius:8px;display:block;pointer-events:none}',
      '#jploft-chat-root .jploft-btn,#jploft-chat-root .jploft-close-fab{position:fixed;right:24px;bottom:24px;width:56px;height:56px;border:0;border-radius:999px;padding:0;background:linear-gradient(135deg,var(--chat-launcher-gradient-start,#E02F3A),var(--chat-launcher-gradient-end,#B02530));color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 38px -20px var(--chat-launcher-shadow,rgba(224,47,58,.55));z-index:99998;transition:transform .2s,box-shadow .2s}',
      '#jploft-chat-root .jploft-btn:hover,#jploft-chat-root .jploft-close-fab:hover{transform:translateY(-2px);box-shadow:0 24px 45px -22px var(--chat-launcher-shadow,rgba(224,47,58,.7))}',
      '#jploft-chat-root .jploft-btn:focus,#jploft-chat-root .jploft-close-fab:focus{outline:2px solid rgba(255,255,255,.5);outline-offset:2px}',
      '#jploft-chat-root .jploft-btn:hover,#jploft-chat-root .jploft-close-fab:hover{transform:translateY(-2px);box-shadow:0 24px 45px -22px rgba(79,70,229,.9)}',
      '#jploft-chat-root .jploft-draggable{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}',
      '#jploft-chat-root .jploft-draggable.is-dragging{cursor:grabbing;transition:none;transform:none}',
      '#jploft-chat-root .jploft-close-fab{display:none;z-index:100000}',

      '#jploft-chat-root .jploft-panel{position:fixed;right:0;top:0;bottom:0;width:min(420px,calc(100vw - 48px));height:100dvh;max-height:100dvh;border:1px solid var(--chat-border);border-radius:0;background:var(--chat-surface);box-shadow:-8px 0 28px -10px rgba(0,0,0,.22);z-index:99999;display:flex;flex-direction:column;overflow:hidden}',
      '#jploft-chat-root .jploft-panel.is-fullscreen{position:fixed !important;left:0 !important;top:0 !important;right:0 !important;bottom:0 !important;width:100% !important;height:100% !important;max-width:100% !important;max-height:100% !important;border-radius:0;border:0;box-shadow:none;z-index:2147483647 !important;overflow:hidden}',
      '#jploft-chat-root .jploft-fullscreen-inner{display:flex;flex:1;min-height:0;min-width:0;overflow:hidden}',
      '#jploft-chat-root .jploft-sidebar{display:none;flex-direction:column;width:260px;min-width:260px;flex-shrink:0;background:var(--chat-sidebar,var(--chat-bg));border-right:1px solid var(--chat-border);overflow:hidden}',
      '#jploft-chat-root .jploft-panel.is-fullscreen .jploft-sidebar{display:flex}',
      '#jploft-chat-root .jploft-sidebar-header{padding:12px;border-bottom:1px solid var(--chat-border);flex-shrink:0;font-weight:600;font-size:14px;color:var(--chat-text)}',
      '#jploft-chat-root .jploft-sidebar-new{display:block;width:calc(100% - 24px);margin:12px 12px 0;padding:8px 12px;border:0;border-radius:6px;background:linear-gradient(135deg,var(--chat-launcher-gradient-start),var(--chat-launcher-gradient-end));color:#fff;font:inherit;cursor:pointer;font-size:13px;font-weight:600;text-align:center;box-shadow:0 10px 22px -16px var(--chat-launcher-shadow);transition:background .12s,box-shadow .12s,transform .12s}',
      '#jploft-chat-root .jploft-sidebar-new:hover{opacity:0.95;transform:translateY(-1px);box-shadow:0 12px 26px -14px var(--chat-launcher-shadow)}',
      '#jploft-chat-root .jploft-sidebar-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 8px 8px}',
      '#jploft-chat-root .jploft-sidebar-item{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 10px;margin:1px 6px;border-radius:7px;border-top-left-radius:0;border-bottom-left-radius:0;cursor:pointer;font-size:13px;color:var(--chat-text);border:1px solid transparent;background:transparent;transition:background .12s,box-shadow .12s}',
      '#jploft-chat-root .jploft-sidebar-item:hover{background:var(--session-hover-bg)}',
      '#jploft-chat-root .jploft-sidebar-item.active{padding:7px 10px;margin:4px 2px;background:linear-gradient(135deg,var(--chat-launcher-gradient-start),var(--chat-launcher-gradient-end));color:#fff;font-weight:600;border-radius:6px;border-top-left-radius:0;border-bottom-left-radius:0;box-shadow:0 10px 22px -16px var(--chat-launcher-shadow)}',
      '#jploft-chat-root .jploft-sidebar-item-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5}',
      '#jploft-chat-root .jploft-sidebar-del{display:none;flex-shrink:0;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:#f87171;cursor:pointer;align-items:center;justify-content:center;transition:background .12s}',
      '#jploft-chat-root .jploft-sidebar-item:hover .jploft-sidebar-del{display:inline-flex}',
      '#jploft-chat-root .jploft-sidebar-item.active .jploft-sidebar-del{color:rgba(255,255,255,0.9)}',
      '#jploft-chat-root .jploft-sidebar-del:hover{background:rgba(0,0,0,0.08)}',
      '#jploft-chat-root .jploft-sidebar-item.active .jploft-sidebar-del:hover{background:rgba(255,255,255,0.2)}',

      '#jploft-chat-root .jploft-header{height:52px;min-height:52px;padding:0 10px;background:var(--chat-header-bg,linear-gradient(120deg,#4f46e5,#6d28d9));color:var(--chat-header-text,#fff);box-shadow:var(--chat-header-shadow,none);display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:2;flex-shrink:0}',
      '#jploft-chat-root .jploft-title-wrap{display:flex;align-items:center;min-width:0;flex:1}',
      '#jploft-chat-root .jploft-title-line{display:flex;align-items:center;gap:8px;min-width:0}',
      '#jploft-chat-root .jploft-title{font-size:13px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#jploft-chat-root .jploft-subtitle{font-size:10px;opacity:.86;letter-spacing:.03em}',
      '#jploft-chat-root .jploft-right{display:flex;align-items:center;gap:8px}',
      '#jploft-chat-root .jploft-icon-btn{width:28px;height:28px;border:0;border-radius:999px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--chat-header-text,#fff);background:transparent;cursor:pointer;transition:background .2s ease}',
      '#jploft-chat-root .jploft-icon-btn:focus{outline:2px solid rgba(255,255,255,.5);outline-offset:2px}',
      '#jploft-chat-root .jploft-icon-btn:hover{background:rgba(255,255,255,.14)}',
      '#jploft-chat-root .jploft-avatar{width:36px;height:36px;border-radius:8px;overflow:hidden;position:relative;flex-shrink:0;background:#fff;display:inline-flex;align-items:center;justify-content:center}',
      '#jploft-chat-root .jploft-avatar-text{font-size:14px;font-weight:600;color:var(--chat-accent,#4f46e5)}',

      '#jploft-chat-root .jploft-main{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--chat-surface)}',
      '#jploft-chat-root .jploft-body{flex:1;min-height:0;overflow-y:auto;padding:12px;background:var(--chat-bg)}',
      '#jploft-chat-root .jploft-msg{display:flex;margin-bottom:16px}',
      '#jploft-chat-root .jploft-msg.user{justify-content:flex-end}',
      '#jploft-chat-root .jploft-msg.assistant{justify-content:flex-start}',
      '#jploft-chat-root .jploft-bubble{position:relative;max-width:min(85%,780px);padding:8px 12px;border:1px solid var(--chat-border);box-shadow:0 12px 26px -22px rgba(0,0,0,.55);font-size:14px;line-height:1.45;word-break:break-word}',
      '#jploft-chat-root .jploft-bubble.user{background:var(--user-bubble,var(--chat-accent));color:var(--user-bubble-text,#fff);border-color:transparent;border-radius:16px 16px 0 16px}',
      '#jploft-chat-root .jploft-bubble.assistant{background:var(--assistant-bubble,var(--chat-surface));color:var(--chat-text);border-radius:16px 16px 16px 0}',
      '#jploft-chat-root .jploft-content.user{white-space:pre-wrap}',
      '#jploft-chat-root .jploft-content.assistant p{margin:0 0 .45em;line-height:1.55}',
      '#jploft-chat-root .jploft-content.assistant p:last-child{margin-bottom:0}',
      '#jploft-chat-root .jploft-content.assistant pre{margin:.5em 0;padding:.75rem 1rem;border-radius:6px;background:var(--chat-bg);overflow:auto}',
      '#jploft-chat-root .jploft-content.assistant code{padding:.15em .35em;border-radius:4px;background:var(--chat-bg);font-size:.9em}',
      '#jploft-chat-root .jploft-content.assistant pre code{padding:0;background:transparent}',
      '#jploft-chat-root .jploft-content.assistant a{color:var(--chat-accent);text-decoration:underline}',
      '#jploft-chat-root .jploft-typing-dots span{animation:jploft-blink 1.4s infinite}',
      '#jploft-chat-root .jploft-typing-dots span:nth-child(2){animation-delay:.2s}',
      '#jploft-chat-root .jploft-typing-dots span:nth-child(3){animation-delay:.4s}',
      '#jploft-chat-root .jploft-voice-row{margin-top:8px;display:inline-flex;align-items:center;gap:8px}',
      '#jploft-chat-root .jploft-voice-btn{width:28px;height:28px;border:0;border-radius:8px;padding:0;background:linear-gradient(135deg,var(--chat-launcher-gradient-start),var(--chat-launcher-gradient-end));color:var(--chat-header-text,#fff);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer}',
      '#jploft-chat-root .jploft-voice-btn:focus{outline:2px solid var(--chat-accent);outline-offset:2px}',
      '#jploft-chat-root .jploft-voice-btn:hover{opacity:.92}',
      '#jploft-chat-root .jploft-voice-btn.is-playing{box-shadow:0 0 0 3px rgba(0,0,0,.08)}',
      '#jploft-chat-root .jploft-mic-wave{display:inline-flex;align-items:flex-end;justify-content:center;gap:2px;width:16px;height:14px}',
      '#jploft-chat-root .jploft-mic-wave::before,#jploft-chat-root .jploft-mic-wave::after,#jploft-chat-root .jploft-mic-wave span{content:"";display:block;width:2px;border-radius:999px;background:currentColor;animation:jploft-mic-bars .9s infinite ease-in-out}',
      '#jploft-chat-root .jploft-mic-wave span{height:70%;animation-delay:.15s}',
      '#jploft-chat-root .jploft-mic-wave::before{height:40%;animation-delay:0s}',
      '#jploft-chat-root .jploft-mic-wave::after{height:55%;animation-delay:.3s}',

      '#jploft-chat-root .jploft-footer{flex-shrink:0;padding:12px;background:var(--chat-bg);border-top:1px solid var(--chat-border)}',
      '#jploft-chat-root .jploft-input-wrap{display:flex;align-items:flex-end;gap:8px;border:1px solid var(--chat-border);border-radius:10px;overflow:hidden;background:var(--chat-surface);padding:8px 12px}',
      '#jploft-chat-root .jploft-input{flex:1;resize:none;min-height:100px;max-height:200px;border:0;outline:0;background:transparent;color:var(--chat-text);font-size:16px;line-height:1.4;padding:8px 2px 4px}',
      '#jploft-chat-root .jploft-input::placeholder{color:#a1a1aa}',
      '#jploft-chat-root .jploft-mic-btn{width:40px;height:40px;border-radius:999px;border:0;background:transparent;color:var(--chat-muted);display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;cursor:pointer;transition:background .15s ease,color .15s ease,box-shadow .15s ease,transform .15s ease}',
      '#jploft-chat-root .jploft-mic-btn:focus{outline:none}',
      '#jploft-chat-root .jploft-mic-btn:hover:not(:disabled){background:rgba(0,0,0,.04);color:var(--chat-text-heading)}',
      '#jploft-chat-root .jploft-mic-btn:disabled{opacity:.5;cursor:not-allowed}',
      '#jploft-chat-root .jploft-mic-btn.is-recording{background:var(--chat-accent);color:#fff;box-shadow:0 0 0 4px rgba(0,0,0,.08)}',
      '#jploft-chat-root .jploft-send{width:44px;height:42px;border:0;border-radius:8px;padding:0;background:linear-gradient(135deg,var(--chat-launcher-gradient-start),var(--chat-launcher-gradient-end));color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease;box-shadow:0 12px 26px -18px var(--chat-launcher-shadow)}',
      '#jploft-chat-root .jploft-send:focus{outline:none}',
      '#jploft-chat-root .jploft-send:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 18px 32px -20px var(--chat-launcher-shadow);opacity:0.95}',
      '#jploft-chat-root .jploft-send:disabled{opacity:.55;cursor:not-allowed}',

      '@keyframes jploft-mic-bars{0%,100%{transform:scaleY(.6);opacity:.6}50%{transform:scaleY(1.2);opacity:1}}',
      '@keyframes jploft-blink{0%,60%,100%{opacity:.3}30%{opacity:1}}',
      '@media(max-width:1024px){#jploft-chat-root .jploft-panel{inset:0;width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;border-radius:0;border:0;box-shadow:none}#jploft-chat-root .jploft-close-fab{display:none !important}#jploft-chat-root .jploft-btn,#jploft-chat-root .jploft-close-fab{right:14px;bottom:14px}}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'jploft-chat-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /** Resolve relative / protocol-relative icon URLs against the host page (embed runs on third-party origins). */
  function resolvePublicMediaUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (/^data:/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf('//') === 0) {
      return (typeof window !== 'undefined' && window.location && window.location.protocol ? window.location.protocol : 'https:') + s;
    }
    if (typeof window === 'undefined' || !window.location) return s;
    try {
      return new URL(s, window.location.href).href;
    } catch (e) {
      return s;
    }
  }

  var LAUNCHER_SVG =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>';

  function setLauncherIconContents() {
    if (!launcher) return;
    launcher.innerHTML = LAUNCHER_SVG;
  }

  function setAvatarContents(avatarEl) {
    if (!avatarEl) return;
    avatarEl.innerHTML = '';
    var letter = String(avatarLetter || 'J').toUpperCase().charAt(0) || 'J';
    if (!companyIconUrl) {
      var spanOnly = document.createElement('span');
      spanOnly.className = 'jploft-avatar-text';
      spanOnly.textContent = letter;
      avatarEl.appendChild(spanOnly);
      return;
    }
    var img = document.createElement('img');
    img.alt = '';
    img.src = companyIconUrl;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;background:#fff';
    img.onerror = function () {
      avatarEl.innerHTML = '';
      var span = document.createElement('span');
      span.className = 'jploft-avatar-text';
      span.textContent = letter;
      avatarEl.appendChild(span);
    };
    avatarEl.appendChild(img);
  }

  companyIconUrl = resolvePublicMediaUrl(config.iconUrl || null);

  function normalizeAssistantNameInText(text, assistantName) {
    var safeName = String(assistantName || '').replace(/\s+/g, ' ').trim();
    if (!safeName) return String(text || '');

    var output = String(text || '');
    output = output
      .replace(/\b(i\s*(?:am|'m)\s+)anaya\b/gi, '$1' + safeName)
      .replace(/\b(it\s*(?:is|'s)\s+)anaya\b/gi, '$1' + safeName)
      .replace(/\b(this is\s+)anaya\b/gi, '$1' + safeName)
      .replace(/\b(my name is\s+)anaya\b/gi, '$1' + safeName)
      .replace(/\banaya(?=,\s*your digital consultant\b)/gi, safeName)
      .replace(/\banaya(?=\s+here\b)/gi, safeName)
      .replace(/\banaya(?=\s+from\b)/gi, safeName);

    if (/\banaya\b/i.test(output) && /\b(hi|hello|hey|welcome|consultant)\b/i.test(output)) {
      output = output.replace(/\banaya\b/gi, safeName);
    }

    return output;
  }

  function decodeHtmlEntities(str) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = String(str || '');
    return textarea.value;
  }

  function toSafeHttpUrl(rawUrl) {
    var url = decodeHtmlEntities(rawUrl || '').trim();
    if (!url) return '';
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (e) {}
    return '';
  }

  function renderAssistantContent(content) {
    var source = String(content || '');
    var codeBlocks = [];
    var tokenPrefix = '%%JPLOFT_CODE_';

    source = source.replace(/```([\s\S]*?)```/g, function (_m, code) {
      var idx = codeBlocks.push(String(code || '').replace(/^\n+|\n+$/g, '')) - 1;
      return tokenPrefix + idx + '%%';
    });

    var html = escapeHtml(source)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_m, label, url) {
        var safeHref = toSafeHttpUrl(url);
        if (!safeHref) return escapeHtml(label);
        return '<a href="' + escapeHtml(safeHref) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      })
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    html = html.replace(new RegExp(tokenPrefix + '(\\d+)%%', 'g'), function (_m, indexText) {
      var idx = Number(indexText);
      var code = idx >= 0 && idx < codeBlocks.length ? codeBlocks[idx] : '';
      return '<pre><code>' + escapeHtml(code) + '</code></pre>';
    });

    return html;
  }

  function stripEmoji(text) {
    try {
      return String(text || '').replace(/\p{Emoji}/gu, '').replace(/\s+/g, ' ').trim();
    } catch (e) {
      return String(text || '').trim();
    }
  }

  function stripLeadingInvisible(str) {
    return String(str || '').replace(/^[\s\uFEFF\u200B-\u200D\u2060\u00AD]*/, '');
  }

  function sanitizeSpeechText(text, options) {
    var opts = options || {};
    var out = stripLeadingInvisible(String(text || ''))
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|[-*+])\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (opts.ignoreEmoji) out = stripEmoji(out);
    return out;
  }

  function getPreferredBrowserVoice(gender, preferredBcp47) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    var allVoices = window.speechSynthesis.getVoices() || [];
    if (!allVoices.length) return null;

    var want = String(preferredBcp47 || 'en-US').trim();
    var prefix = want.split('-')[0].toLowerCase();
    var langVoices = allVoices.filter(function (v) { return String(v.lang || '').toLowerCase().indexOf(prefix) === 0; });
    var pool = langVoices.length ? langVoices : allVoices;
    var femaleHint = /(female|woman|zira|susan|samantha|aria|eva|linda|hazel|jenny|karen|emma|alloy)/i;
    var maleHint = /(male|man|david|mark|alex|guy|daniel|george|james|tom|ryan|adam)/i;
    var matcher = String(gender || 'female').toLowerCase() === 'male' ? maleHint : femaleHint;
    return pool.find(function (v) { return matcher.test(v.name || ''); }) || pool[0] || null;
  }

  function speakWithBrowserVoice(text, gender, ignoreEmoji, onEnd) {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      if (typeof onEnd === 'function') onEnd();
      return;
    }

    var speechText = sanitizeSpeechText(text, { ignoreEmoji: Boolean(ignoreEmoji) });
    if (!speechText) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }

    var bcp47 = resolveWidgetSpeechBcp47(speechText);

    try {
      window.speechSynthesis.cancel();

      var utterance = new SpeechSynthesisUtterance(speechText);
      var selectedVoice = getPreferredBrowserVoice(gender, bcp47);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || bcp47;
      } else {
        utterance.lang = bcp47;
      }

      utterance.pitch = String(gender || '').toLowerCase() === 'male' ? 0.9 : 1.1;
      utterance.rate = 1;
      utterance.onend = function () {
        if (speechUtterance === utterance) speechUtterance = null;
        if (typeof onEnd === 'function') onEnd();
      };
      utterance.onerror = function () {
        if (speechUtterance === utterance) speechUtterance = null;
        if (typeof onEnd === 'function') onEnd();
      };

      speechUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      if (typeof onEnd === 'function') onEnd();
    }
  }

  function setMicButtonState(isRecording) {
    micRecording = Boolean(isRecording);
    if (!micBtn) return;

    micBtn.classList.toggle('is-recording', micRecording);
    micBtn.setAttribute('aria-label', micRecording ? 'Stop voice input' : 'Start voice input');
    micBtn.innerHTML = micRecording
      ? '<span class="jploft-mic-wave"><span></span></span>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';
  }

  function stopMicCapture() {
    keepMicOpen = false;
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (e) {}
    }
    setMicButtonState(false);
  }

  function ensureSpeechRecognition() {
    if (typeof window === 'undefined') return null;
    if (speechRecognition) return speechRecognition;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    var recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = function (event) {
      var finalTranscript = '';
      for (var i = event.resultIndex; i < event.results.length; i += 1) {
        var result = event.results[i];
        if (result.isFinal && result[0] && result[0].transcript) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        inputEl.value = inputEl.value
          ? (inputEl.value.trim() + ' ' + finalTranscript.trim())
          : finalTranscript.trim();
        onInputChange();
      }
    };

    recognition.onend = function () {
      if (keepMicOpen) {
        try {
          recognition.start();
        } catch (e) {}
      } else {
        setMicButtonState(false);
      }
    };

    recognition.onerror = function () {
      keepMicOpen = false;
      setMicButtonState(false);
    };

    speechRecognition = recognition;
    return speechRecognition;
  }

  function onMicButtonClick(event) {
    event.preventDefault();
    if (!voiceEnabled || loading) return;

    if (micRecording) {
      stopMicCapture();
      return;
    }

    var recognition = ensureSpeechRecognition();
    if (!recognition) return;

    keepMicOpen = true;
    try {
      recognition.start();
      setMicButtonState(true);
    } catch (e) {
      setMicButtonState(false);
    }
  }

  function pauseAssistantVoice() {
    try {
      if (responseAudio) {
        responseAudio.pause();
        responseAudio.src = '';
        responseAudio = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      speechUtterance = null;
    } catch (e) {}
    playingMessageIndex = null;
    renderMessages();
  }

  function playAssistantVoice(audioDataUrl, messageIndex) {
    if (!audioDataUrl || typeof window === 'undefined') return;
    pauseAssistantVoice();

    playingMessageIndex = messageIndex;
    renderMessages();

    try {
      var audio = new Audio(audioDataUrl);
      responseAudio = audio;
      var clearPlaying = function () {
        if (responseAudio === audio) responseAudio = null;
        if (playingMessageIndex === messageIndex) {
          playingMessageIndex = null;
          renderMessages();
        }
      };
      audio.onended = clearPlaying;
      audio.onerror = clearPlaying;
      audio.play().catch(clearPlaying);
    } catch (e) {
      playingMessageIndex = null;
      renderMessages();
    }
  }

  function fetchAssistantVoice(messageIndex, text) {
    return fetch(apiUrl + '/chat/voice', {
      method: 'POST',
      headers: mergeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        companyId: companyId,
        sessionId: sessionId || undefined,
        messageIndex: messageIndex,
        text: text || '',
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (err) {
            throw new Error(err.error || 'Failed to synthesize message voice');
          });
        }
        return response.json();
      })
      .then(function (data) {
        var audioDataUrl = data && data.voice && data.voice.audioDataUrl ? String(data.voice.audioDataUrl) : '';
        if (!audioDataUrl) {
          throw new Error('Missing ElevenLabs audio response');
        }
        return audioDataUrl;
      });
  }

  function playMessageVoice(messageIndex) {
    var msg = messages[messageIndex];
    if (!msg || msg.role !== 'assistant' || !msg.content || !voiceResponseEnabled) return;

    if (msg.voiceUrl) {
      playAssistantVoice(msg.voiceUrl, messageIndex);
      return;
    }

    // Fallback when server-side TTS was unavailable for this message.
    if (!voiceEnabled) return;
    pauseAssistantVoice();
    playingMessageIndex = messageIndex;
    renderMessages();
    fetchAssistantVoice(messageIndex, msg.content)
      .then(function (audioDataUrl) {
        if (!messages[messageIndex]) return;
        messages[messageIndex].voiceUrl = audioDataUrl;
        persistState();
        playAssistantVoice(audioDataUrl, messageIndex);
      })
      .catch(function () {
        speakWithBrowserVoice(msg.content, voiceGender, voiceIgnoreEmoji, function () {
          if (playingMessageIndex === messageIndex) {
            playingMessageIndex = null;
            renderMessages();
          }
        });
      });
  }

  function applyVoiceFeatureState() {
    if (!inputEl) return;
    inputEl.placeholder = voiceEnabled ? 'Type your message or use the mic...' : 'Type your message...';
    if (micBtn) {
      micBtn.style.display = voiceEnabled ? 'inline-flex' : 'none';
      micBtn.disabled = loading || !voiceEnabled;
    }
    if (!voiceEnabled) {
      stopMicCapture();
    }
  }

  function persistState() {
    try {
      var state = {
        companyId: companyId,
        messages: messages,
        sessionId: sessionId,
        openingMessageShown: openingMessageShown,
        widgetButtonPos: { x: widgetButtonPos.x, y: widgetButtonPos.y },
        widgetOpen: opened,
      };
      localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function setSendButtonState() {
    if (!sendBtn || !inputEl) return;
    var hasText = (inputEl.value || '').trim().length > 0;
    sendBtn.disabled = loading || !hasText;
    if (micBtn) micBtn.disabled = loading || !voiceEnabled;
  }

  function resizeInput() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
  }

  function renderMessages() {
    if (!messagesEl) return;

    var html = messages.map(function (m, i) {
      var cls = m.role === 'user' ? 'user' : 'assistant';
      var contentHtml = cls === 'assistant'
        ? renderAssistantContent(m.content)
        : escapeHtml(m.content).replace(/\n/g, '<br>');
      var voiceHtml = '';
      if (cls === 'assistant' && m.content && voiceResponseEnabled) {
        var isPlaying = playingMessageIndex === i;
        var voiceButtonIcon = isPlaying
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
        var waveHtml = isPlaying
          ? '<span class="jploft-mic-wave" style="color:var(--chat-accent)" aria-hidden="true"><span></span></span>'
          : '';
        voiceHtml = '<div class="jploft-voice-row">' +
          '<button type="button" class="jploft-voice-btn' + (isPlaying ? ' is-playing' : '') + '" data-index="' + i + '" aria-label="' + (isPlaying ? 'Stop' : 'Play response') + '">' +
          voiceButtonIcon +
          '</button>' + waveHtml + '</div>';
      }
      return '<div class="jploft-msg ' + cls + '"><div class="jploft-bubble ' + cls + '">' +
        '<div class="jploft-content ' + cls + '">' + contentHtml + '</div>' + voiceHtml +
        '</div></div>';
    }).join('');

    if (loading) {
      html += '<div class="jploft-msg assistant"><div class="jploft-bubble assistant"><span class="jploft-typing-dots"><span>.</span><span>.</span><span>.</span></span></div></div>';
    }

    messagesEl.innerHTML = html;
    messagesEl.querySelectorAll('.jploft-voice-btn').forEach(function (btn) {
      btn.onclick = function () {
        var index = Number(btn.getAttribute('data-index'));
        if (Number.isNaN(index)) return;
        if (playingMessageIndex === index) {
          pauseAssistantVoice();
          return;
        }
        playMessageVoice(index);
      };
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function getOpeningMessage() {
    var profileId = companyBusinessProfile && companyBusinessProfile.id;
    var effectiveOpening = getEffectiveOpeningLanguage(companyPrimaryLanguage, companyContentLocaleHint, profileId);
    if (
      companyGreetingMessage
      && companyGreetingMessage.trim()
      && !isLegacyGenericGreeting(companyGreetingMessage, effectiveOpening, profileId)
    ) {
      return companyGreetingMessage.trim();
    }

    var copy = buildOpeningCopy(
      effectiveOpening,
      companyLegalName || companyName || 'our company',
      chatbotDisplayName,
      profileId
    );

    return copy.welcome + '\n' + copy.intro + '\n' + copy.question;
  }

  function refreshLegacyOpeningMessage() {
    if (!Array.isArray(messages) || messages.length === 0) return;
    if (!messages[0] || messages[0].role !== 'assistant') return;
    var profileId = companyBusinessProfile && companyBusinessProfile.id;
    var effectiveOpening = getEffectiveOpeningLanguage(companyPrimaryLanguage, companyContentLocaleHint, profileId);
    if (!isLegacyGenericGreeting(messages[0].content, effectiveOpening, profileId)) return;

    var nextOpeningMessage = getOpeningMessage();
    if (messages[0].content === nextOpeningMessage) return;

    messages[0] = { role: 'assistant', content: nextOpeningMessage };
    if (messagesEl) renderMessages();
    persistState();
  }

  function openPanel() {
    if (!panel || !root || opened) return;
    opened = true;
    activated = true;
    resetActivationWatchers();

    if (messages.length === 0 && !openingMessageShown) {
      messages.push({ role: 'assistant', content: getOpeningMessage() });
      openingMessageShown = true;
      renderMessages();
      persistState();
    }

    if (launcher) launcher.style.display = 'none';
    panel.style.display = 'flex';
    updatePanelPosition();
    setSendButtonState();
    applyVoiceFeatureState();
    persistState();

    setTimeout(function () {
      if (inputEl) inputEl.focus();
    }, 0);
  }

  function closePanel() {
    if (!panel || !launcher) return;
    opened = false;
    activated = true;
    resetActivationWatchers();
    isFullscreen = false;
    stopMicCapture();
    pauseAssistantVoice();
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    sendPresenceTyping(false);
    updateMaxButtonState();
    panel.style.display = 'none';
    if (closeFab) closeFab.style.display = 'none';
    launcher.style.display = 'flex';
    persistState();
  }

  function sendToApi(userContent, callback) {
    var gen = requestGeneration;
    // Optimistic: push the user message immediately so it's visible before the API responds.
    messages.push({ role: 'user', content: userContent });
    var msgs = messages.slice(); // snapshot for API (user msg already included)
    loading = true;
    setSendButtonState();
    applyVoiceFeatureState();
    renderMessages();

    var pageUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';
    fetch(apiUrl + '/chat/message', {
      method: 'POST',
      headers: mergeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        companyId: companyId,
        sessionId: sessionId || undefined,
        messages: msgs.map(function (m) { return { role: m.role, content: m.content }; }),
        pageUrl: pageUrl,
      }),
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (err) {
            throw new Error(err.error || 'Failed to get response');
          });
        }
        return r.json();
      })
      .then(function (data) {
        if (gen !== requestGeneration) return;
        if (data.sessionId) sessionId = data.sessionId;
        sendPresenceRegister(sessionId);
        var assistantText = normalizeAssistantNameInText(String(data.content || ''), chatbotDisplayName);
        var voiceUrl = data && data.voice && data.voice.audioDataUrl ? String(data.voice.audioDataUrl) : '';
        // User message already pushed optimistically before fetch — only push assistant.
        messages.push({
          role: 'assistant',
          content: assistantText,
          voiceUrl: voiceUrl || undefined,
        });
        loading = false;
        setSendButtonState();
        applyVoiceFeatureState();
        renderMessages();
        var assistantIndex = messages.length - 1;
        if (voiceResponseEnabled) {
          if (voiceUrl) {
            playAssistantVoice(voiceUrl, assistantIndex);
          }
        }
        loadSessions();
        persistState();
        if (callback) callback();
      })
      .catch(function () {
        if (gen !== requestGeneration) return;
        // User message was already pushed optimistically — just add error assistant message.
        messages.push({ role: 'assistant', content: 'We are facing some technical issue. Please try again.' });
        loading = false;
        setSendButtonState();
        applyVoiceFeatureState();
        renderMessages();
        if (callback) callback();
      });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!inputEl || loading) return;

    var text = (inputEl.value || '').trim();
    if (!text) return;

    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    sendPresenceTyping(false);

    inputEl.value = '';
    resizeInput();
    setSendButtonState();
    sendToApi(text);
  }

  function onInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  }

  function onInputChange() {
    resizeInput();
    setSendButtonState();

    if (!inputEl) return;
    var hasText = Boolean((inputEl.value || '').trim());
    sendPresenceTyping(hasText);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(function () {
      sendPresenceTyping(false);
    }, 1300);
  }

  function createWidget() {
    root = document.createElement('div');
    root.id = 'jploft-chat-root';

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'jploft-btn jploft-draggable';
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML = LAUNCHER_SVG;
    launcher.style.display = 'flex';
    launcher.onclick = withDragGuard(openPanel);

    panel = document.createElement('section');
    panel.className = 'jploft-panel';
    panel.setAttribute('aria-label', 'Chat widget');
    panel.style.display = 'none';
    panel.innerHTML =
      '<header class="jploft-header">' +
        '<div class="jploft-title-wrap">' +
          '<div class="jploft-title-line">' +
            '<button type="button" class="jploft-icon-btn jploft-new-btn" aria-label="Start new chat" title="New chat">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
            '</button>' +
            '<span class="jploft-title">' + escapeHtml(companyName) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="jploft-right">' +
          '<button type="button" class="jploft-icon-btn jploft-close-btn" aria-label="Close widget" title="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
          '<span class="jploft-avatar" aria-hidden="true"><span class="jploft-avatar-text">' + escapeHtml(avatarLetter) + '</span></span>' +
        '</div>' +
      '</header>' +
      '<div class="jploft-fullscreen-inner">' +
        '<div class="jploft-sidebar" aria-label="Chat sessions"></div>' +
        '<div class="jploft-main">' +
          '<div class="jploft-body"></div>' +
          '<form class="jploft-footer">' +
            '<div class="jploft-input-wrap">' +
              '<textarea class="jploft-input" placeholder="Type your message..." autocomplete="off" rows="1"></textarea>' +
              '<button type="button" class="jploft-mic-btn" aria-label="Start voice input"></button>' +
              '<button type="submit" class="jploft-send" aria-label="Send message" title="Send">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
              '</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';

    closeFab = document.createElement('button');
    closeFab.type = 'button';
    closeFab.className = 'jploft-close-fab jploft-draggable';
    closeFab.setAttribute('aria-label', 'Close chatbot');
    closeFab.setAttribute('title', 'Close');
    closeFab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeFab.onclick = withDragGuard(closePanel);

    var closeBtn = panel.querySelector('.jploft-close-btn');
    closeBtn.onclick = closePanel;
    var newBtn = panel.querySelector('.jploft-new-btn');
    if (newBtn) {
      newBtn.onclick = function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        newChat();
      };
    }

    maxBtn = panel.querySelector('.jploft-max-btn');
    if (maxBtn) maxBtn.onclick = toggleFullscreen;

    [launcher, closeFab].forEach(function (el) {
      el.addEventListener('pointerdown', onWidgetButtonPointerDown);
      el.addEventListener('pointermove', onWidgetButtonPointerMove);
      el.addEventListener('pointerup', onWidgetButtonPointerUp);
      el.addEventListener('pointercancel', onWidgetButtonPointerUp);
    });

    sidebarEl = panel.querySelector('.jploft-sidebar');
    messagesEl = panel.querySelector('.jploft-body');
    inputEl = panel.querySelector('.jploft-input');
    micBtn = panel.querySelector('.jploft-mic-btn');
    sendBtn = panel.querySelector('.jploft-send');

    var form = panel.querySelector('form');
    form.onsubmit = onSubmit;
    inputEl.addEventListener('keydown', onInputKeyDown);
    inputEl.addEventListener('input', onInputChange);
    if (micBtn) micBtn.addEventListener('click', onMicButtonClick);
    setMicButtonState(false);

    resizeInput();
    setSendButtonState();
    applyVoiceFeatureState();
    applyWidgetButtonPosition();
    updatePanelPosition();
    window.addEventListener('resize', onViewportResize);

    root.appendChild(launcher);
    root.appendChild(panel);
    root.appendChild(closeFab);
    document.body.appendChild(root);

    applyWidgetButtonPosition();
    if (persistedWidgetOpen) {
      activated = true;
      opened = true;
      if (launcher) launcher.style.display = 'none';
      if (panel) {
        panel.style.display = 'flex';
        if (messages.length === 0 && !openingMessageShown) {
          messages.push({ role: 'assistant', content: getOpeningMessage() });
          openingMessageShown = true;
        }
        renderMessages();
        updatePanelPosition();
      }
      persistState();
    }

    connectPresenceWs();
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', sendPageUpdate);
      window.addEventListener('hashchange', sendPageUpdate);
    }
    fetchThemeAndApply(root);
    bindEmbedLocationTracking();
  }

  function bindEmbedLocationTracking() {
    if (typeof window === 'undefined') return;

    function onEmbedLocationChange() {
      sendPageUpdate();
      if (activated) return;
      resetActivationWatchers();
      runActivation();
    }

    ['pushState', 'replaceState'].forEach(function (method) {
      var orig = window.history[method];
      if (typeof orig !== 'function' || orig.__jploftPatched) return;
      function wrapped() {
        var ret = orig.apply(this, arguments);
        try {
          window.dispatchEvent(new Event('jploftlocationchange'));
        } catch (e) {}
        return ret;
      }
      wrapped.__jploftPatched = true;
      window.history[method] = wrapped;
    });

    window.addEventListener('jploftlocationchange', onEmbedLocationChange);
    window.addEventListener('popstate', onEmbedLocationChange);
    window.addEventListener('hashchange', onEmbedLocationChange);
  }

  function sendPageUpdate() {
    if (!presenceWs || presenceWs.readyState !== 1) return;
    var url = typeof window !== 'undefined' && window.location ? window.location.href : '';
    try {
      presenceWs.send(JSON.stringify({ type: 'page', pageUrl: url }));
    } catch (e) {}
  }

  function getWsUrl() {
    if (!apiUrl) return '';
    var a = document.createElement('a');
    a.href = apiUrl;
    var protocol = (a.protocol === 'https:') ? 'wss:' : 'ws:';
    return protocol + '//' + a.host + '/api/ws';
  }

  function sendPresenceRegister(sid, page) {
    if (!presenceWs || presenceWs.readyState !== 1) return;
    var url = (typeof page === 'string') ? page : (typeof window !== 'undefined' && window.location ? window.location.href : '');
    try {
      presenceWs.send(JSON.stringify({
        type: 'register',
        companyId: companyId,
        sessionId: sid || undefined,
        pageUrl: url,
      }));
    } catch (e) {}
  }

  function sendPresenceTyping(isTyping) {
    if (!presenceWs || presenceWs.readyState !== 1 || !sessionId) return;
    try {
      presenceWs.send(JSON.stringify({
        type: 'typing',
        companyId: companyId,
        sessionId: sessionId,
        isTyping: Boolean(isTyping),
      }));
    } catch (e) {}
  }

  function connectPresenceWs() {
    if (!apiUrl || !companyId) return;
    var wsUrl = getWsUrl();
    if (!wsUrl) return;
    try {
      if (presenceWs) {
        presenceWs.close();
        presenceWs = null;
      }
      presenceWs = new WebSocket(wsUrl);
      presenceWs.onopen = function () {
        if (wsReconnectTimer) {
          clearTimeout(wsReconnectTimer);
          wsReconnectTimer = null;
        }
        sendPresenceRegister(sessionId, window.location ? window.location.href : '');
      };
      presenceWs.onmessage = function (event) {
        try {
          var msg = JSON.parse(event.data || '{}');
          if (msg.type === 'message' && msg.content != null) {
            var assistantText = normalizeAssistantNameInText(String(msg.content || ''), chatbotDisplayName);
            messages.push({
              role: 'assistant',
              content: assistantText,
              voiceUrl: msg.voice && msg.voice.audioDataUrl ? String(msg.voice.audioDataUrl) : undefined,
            });
            renderMessages();
            persistState();
            loadSessions();
          }
        } catch (e) {}
      };
      presenceWs.onclose = function () {
        presenceWs = null;
        if (!wsReconnectTimer) {
          wsReconnectTimer = setTimeout(connectPresenceWs, WS_RECONNECT_MS);
        }
      };
      presenceWs.onerror = function () {};
    } catch (e) {}
  }

  function resetActivationWatchers() {
    if (typeof stopActivationWatchers === 'function') {
      stopActivationWatchers();
      stopActivationWatchers = null;
    }
  }

  function fetchThemeAndApply(widgetRoot) {
    fetch(apiUrl + '/train/companies', { headers: mergeHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (companies) {
        if (!widgetRoot) return;
        if (!Array.isArray(companies)) {
          resetActivationWatchers();
          if (!activated) runActivation();
          return;
        }
        var company = companies.find(function (c) { return c.id === companyId; });
        if (company) {
          if (company.companyName) companyLegalName = company.companyName;
          if (company.chatbotName) chatbotDisplayName = company.chatbotName;
          if (company.displayName) companyName = company.displayName;
          companyIconUrl = resolvePublicMediaUrl(company.iconUrl || config.iconUrl);
          companyGreetingMessage = company.greetingMessage || null;
          companyPrimaryLanguage = (company.language && company.language.primary) || 'en';
          companyContentLocaleHint = (company.language && company.language.contentLocaleHint) || '';
          companyBusinessProfile = company.businessProfile || { id: 'generic_business' };
          refreshLegacyOpeningMessage();
          if (company.voice && typeof company.voice === 'object') {
            voiceEnabled = Boolean(company.voice.enabled);
            voiceResponseEnabled = company.voice.responseEnabled !== false;
            voiceGender = company.voice.gender === 'male' ? 'male' : 'female';
            companyVoiceTtsLanguage = (company.voice.ttsLanguageCode && String(company.voice.ttsLanguageCode)) || '';
            voiceIgnoreEmoji = Boolean(company.voice.ignoreEmoji);
          } else {
            voiceEnabled = false;
            voiceResponseEnabled = true;
            voiceGender = 'female';
            companyVoiceTtsLanguage = '';
            voiceIgnoreEmoji = false;
          }
          if (company.autoTrigger && typeof company.autoTrigger === 'object') {
            var nextAutoTriggerMode = resolveAutoTriggerOpenMode(company.autoTrigger);
            autoTrigger.openMode = nextAutoTriggerMode;
            autoTrigger.enabled = nextAutoTriggerMode === 'auto';
            autoTrigger.afterSeconds = Math.max(0, Math.min(120, Number(company.autoTrigger.afterSeconds != null ? company.autoTrigger.afterSeconds : AUTO_TRIGGER_DEFAULT_SECONDS)));
            autoTrigger.afterScrollPercent = Math.max(0, Math.min(100, Number(company.autoTrigger.afterScrollPercent != null ? company.autoTrigger.afterScrollPercent : AUTO_TRIGGER_DEFAULT_SCROLL_PERCENT)));
            autoTrigger.onlySelectedPages = Boolean(company.autoTrigger.onlySelectedPages);
            autoTrigger.onPricingPage = Boolean(company.autoTrigger.onPricingPage);
            autoTrigger.onPortfolioPage = Boolean(company.autoTrigger.onPortfolioPage);
            autoTrigger.selectedPages = String(company.autoTrigger.selectedPages || '');
          }
          widgetSide = company.widgetPosition === 'left' ? 'left' : 'right';
          try {
            var rawSide = typeof localStorage !== 'undefined' && localStorage.getItem(WIDGET_SIDE_BY_COMPANY_KEY);
            var parsedSide = rawSide ? JSON.parse(rawSide) : {};
            var nextSide = {};
            var key;
            if (parsedSide && typeof parsedSide === 'object') {
              for (key in parsedSide) {
                if (Object.prototype.hasOwnProperty.call(parsedSide, key)) nextSide[key] = parsedSide[key];
              }
            }
            nextSide[companyId] = widgetSide;
            if (typeof localStorage !== 'undefined') localStorage.setItem(WIDGET_SIDE_BY_COMPANY_KEY, JSON.stringify(nextSide));
          } catch (e) {}
          var vp = getViewport();
          widgetButtonPos = clampWidgetButtonPosition(widgetButtonPos, vp.width, vp.height);
          applyWidgetButtonPosition();
          updatePanelPosition();
          var titleEl = widgetRoot.querySelector('.jploft-title');
          if (titleEl) titleEl.textContent = companyName;
          var avatarEl = widgetRoot.querySelector('.jploft-avatar');
          if (avatarEl) {
            avatarLetter = (companyName || '').trim().charAt(0) || 'J';
            setAvatarContents(avatarEl);
          }
          setLauncherIconContents();
        } else {
          companyIconUrl = resolvePublicMediaUrl(config.iconUrl || null);
          avatarLetter = (companyName || '').trim().charAt(0) || 'J';
          var avatarFallback = widgetRoot.querySelector('.jploft-avatar');
          if (avatarFallback) setAvatarContents(avatarFallback);
          setLauncherIconContents();
        }
        messages = messages.map(function (msg) {
          if (!msg || msg.role !== 'assistant') return msg;
          return {
            role: msg.role,
            content: normalizeAssistantNameInText(msg.content, chatbotDisplayName),
            voiceUrl: msg.voiceUrl || undefined,
          };
        });
        setSendButtonState();
        applyVoiceFeatureState();
        renderMessages();
        var theme = company && company.theme;
        if (theme) {
          var vars = buildThemeVars(theme);
          if (vars) {
            var key;
            for (key in vars) widgetRoot.style.setProperty(key, vars[key]);
            document.documentElement.style.setProperty('--brand', vars['--chat-accent'] || '');
            document.documentElement.style.setProperty('--brand-soft', (vars['--chat-accent'] || '') + '22');
            document.documentElement.style.setProperty('--embed-header-bg', vars['--chat-header-bg'] || '');
          }
        }
        resetActivationWatchers();
        if (!activated) runActivation();
      })
      .catch(function () {
        resetActivationWatchers();
        if (!activated) runActivation();
      });
  }

  function activate() {
    if (activated) return;

    activated = true;
    if (typeof stopActivationWatchers === 'function') {
      stopActivationWatchers();
      stopActivationWatchers = null;
    }

    if (launcher && !opened) launcher.style.display = 'flex';
    if (!openingMessageShown) openPanel();
  }

  function runActivation() {
    if (activated) return;

    if (forceOpen) {
      activate();
      return;
    }

    var currentPath = (typeof window !== 'undefined' && window.location) ? window.location.pathname : '/';
    if (!shouldEnableAutoTrigger(currentPath)) return;

    var delayMs = Math.max(0, Number(autoTrigger.afterSeconds || 0) * 1000);
    var scrollThreshold = Math.max(0, Math.min(1, Number(autoTrigger.afterScrollPercent || 0) / 100));
    var delayTimer = null;

    if (delayMs <= 0) {
      activate();
    } else {
      delayTimer = setTimeout(activate, delayMs);
    }

    function onScroll() {
      if (scrollThreshold <= 0) return;
      var doc = document.documentElement;
      var scrollHeight = Math.max(doc.scrollHeight, doc.clientHeight, window.innerHeight);
      var maxScroll = scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return;
      var ratio = Math.min(1, window.scrollY / maxScroll);
      if (ratio >= scrollThreshold) activate();
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    stopActivationWatchers = function () {
      clearTimeout(delayTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }

  createStyles();
  createWidget();
})();
