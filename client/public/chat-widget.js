/**
 * JP Loft / AI Chat Agent - embeddable widget (vanilla JS)
 * Usage: <script src="https://your-domain.com/chat-widget.js" data-api-url="https://your-api.com/api" data-company-id="_JP_Loft"></script>
 * Or set window.JPLoftChatConfig = { apiUrl: '...', companyId: '...', companyName: 'JP Loft', apiKey: 'optional-embed-key' } before loading.
 * Optional apiKey is sent as header X-Embed-Api-Key on API requests (per-company key from your dashboard).
 *
 * Activation (per doc): 6-10s on page OR 40% scroll OR 8s idle.
 * Opening message: Hi! Welcome to JP Loft! I'm Anaya, your digital consultant. Are you looking to build something or just exploring ideas?
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var config = window.JPLoftChatConfig || {};
  var apiUrl = (script && script.getAttribute('data-api-url')) || config.apiUrl || '';
  var companyId = (script && script.getAttribute('data-company-id')) || config.companyId || '_JP_Loft';
  var companyName = (script && script.getAttribute('data-company-name')) || config.companyName || 'JP Loft';
  var apiKey = (script && script.getAttribute('data-api-key')) || config.apiKey || '';
  var avatarLetter = ((companyName || '').trim().charAt(0) || 'J').toUpperCase();
  var companyIconUrl = null;
  var companyGreetingMessage = null;

  var OPENING_MSG = "Hi! Welcome to JP Loft!\nI'm Anaya, your digital consultant.\nAre you looking to build something or just exploring ideas?";
  var CHAT_STATE_KEY = 'ai-chat-state';
  var ACTIVATION_MIN = 6000;
  var ACTIVATION_MAX = 10000;
  var IDLE_MS = 8000;
  var SCROLL_THRESHOLD = 0.4;
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

  var activated = false;
  var opened = false;
  var openingMessageShown = false;
  var stopActivationWatchers = null;
  var messages = [];
  var sessionId = null;
  var sessions = [];
  var loading = false;

  (function readPersistedState() {
    try {
      var raw = typeof localStorage !== 'undefined' && localStorage.getItem(CHAT_STATE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (s.companyId && s.companyId === companyId) {
          if (Array.isArray(s.messages)) messages = s.messages;
          if (s.sessionId != null) sessionId = s.sessionId;
          if (s.openingMessageShown != null) openingMessageShown = s.openingMessageShown;
        }
      }
    } catch (e) {}
  })();
  var presenceWs = null;
  var wsReconnectTimer = null;
  var WS_RECONNECT_MS = 5000;

  var root = null;
  var launcher = null;
  var panel = null;
  var closeFab = null;
  var sidebarEl = null;
  var messagesEl = null;
  var inputEl = null;
  var sendBtn = null;
  var maxBtn = null;

  var isFullscreen = false;
  var hasOpenedOnce = false;
  var firstOpenPinned = false;
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
        x: viewportWidth - WIDGET_BUTTON_SIZE - margin,
        y: viewportHeight - WIDGET_BUTTON_SIZE - margin,
      },
      viewportWidth,
      viewportHeight
    );
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
    if (!launcher || !closeFab) return;

    [launcher, closeFab].forEach(function (el) {
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
    if (!opened) {
      closeFab.style.display = 'none';
      return;
    }
    closeFab.style.display = isSmallScreen() ? 'none' : 'flex';
    if (!isSmallScreen()) {
      closeFab.style.zIndex = isFullscreen ? '2147483647' : '100000';
      if (isFullscreen) {
        closeFab.setAttribute('aria-label', 'Minimize to widget');
        closeFab.setAttribute('title', 'Minimize');
        closeFab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="10" y1="14" x2="3" y2="21"/></svg>';
        closeFab.onclick = withDragGuard(toggleFullscreen);
      } else {
        closeFab.setAttribute('aria-label', 'Close chatbot');
        closeFab.setAttribute('title', 'Close');
        closeFab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeFab.onclick = withDragGuard(closePanel);
      }
    }
  }

  function updatePanelPosition() {
    if (!panel) return;

    if (firstOpenPinned && !isSmallScreen()) {
      panel.classList.remove('is-fullscreen');
      panel.style.left = '24px';
      panel.style.top = '24px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = 'min(370px,calc(100vw - 48px))';
      panel.style.height = 'min(610px,calc(100dvh - 128px))';
      panel.style.maxWidth = '';
      panel.style.maxHeight = 'calc(100dvh - 128px)';
      updateMaxButtonState();
      updateCloseFabVisibility();
      return;
    }

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
      var panelW = Math.min(370, vp.width - 48);
      var panelH = Math.min(610, vp.height - 128);
      var btnRight = widgetButtonPos.x + WIDGET_BUTTON_SIZE;
      var btnTop = widgetButtonPos.y;
      var bottom = Math.min(vp.height - panelH - 24, Math.max(24, vp.height - btnTop + PANEL_GAP));
      var right = Math.max(24, Math.min(vp.width - panelW - 24, vp.width - btnRight));

      panel.classList.remove('is-fullscreen');
      panel.style.left = 'auto';
      panel.style.top = 'auto';
      panel.style.right = right + 'px';
      panel.style.bottom = bottom + 'px';
      panel.style.width = 'min(370px,calc(100vw - 48px))';
      panel.style.height = 'min(610px,calc(100dvh - 128px))';
      panel.style.maxWidth = '';
      panel.style.maxHeight = 'calc(100dvh - 128px)';
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
    if (newChatBtn) newChatBtn.onclick = function () { newChat(); };
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
    sessionId = null;
    messages = [];
    openingMessageShown = false;
    messages.push({ role: 'assistant', content: getOpeningMessage() });
    openingMessageShown = true;
    renderMessages();
    persistState();
    if (sidebarEl && isFullscreen) renderSidebar();
  }

  function selectSession(id) {
    sessionId = id;
    loading = true;
    setSendButtonState();
    renderMessages();
    fetch(apiUrl + '/sessions/' + encodeURIComponent(id) + '/messages', { headers: mergeHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        messages = Array.isArray(data) ? data.map(function (m) { return { role: m.role, content: m.content }; }) : [];
        loading = false;
        setSendButtonState();
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
      '#jploft-chat-root{--chat-bg:#f4f4f5;--chat-surface:#ffffff;--chat-border:#d4d4d8;--chat-text:#18181b;--chat-muted:#71717a;--chat-accent:#E02F3A;--chat-accent-hover:#B02530;--chat-header-bg:#000000;--chat-header-shadow:0 4px 12px rgba(224,47,58,0.25);--chat-header-text:#ffffff;--chat-sidebar:#e4e4e7;--user-bubble:#E02F3A;--user-bubble-text:#ffffff;--assistant-bubble:#ffffff;--session-hover-bg:rgba(0,0,0,0.05);--session-active-bg:rgba(224,47,58,0.2);--session-active-color:#E02F3A;--chat-launcher-gradient-start:#E02F3A;--chat-launcher-gradient-end:#B02530;--chat-launcher-shadow:rgba(224,47,58,0.55);font-family:Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '#jploft-chat-root *{box-sizing:border-box}',
      '#jploft-chat-root button,#jploft-chat-root textarea{font:inherit}',

      '#jploft-chat-root .jploft-btn,#jploft-chat-root .jploft-close-fab{position:fixed;right:24px;bottom:24px;width:56px;height:56px;border:0;border-radius:999px;background:var(--chat-accent,linear-gradient(135deg,#4f46e5,#6d28d9));color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 38px -20px rgba(79,70,229,.85);z-index:99998;transition:transform .2s,box-shadow .2s}',
      '#jploft-chat-root .jploft-btn:hover,#jploft-chat-root .jploft-close-fab:hover{transform:translateY(-2px);box-shadow:0 24px 45px -22px rgba(79,70,229,.9)}',
      '#jploft-chat-root .jploft-draggable{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}',
      '#jploft-chat-root .jploft-draggable.is-dragging{cursor:grabbing;transition:none;transform:none}',
      '#jploft-chat-root .jploft-close-fab{display:none;z-index:100000}',

      '#jploft-chat-root .jploft-panel{position:fixed;right:24px;bottom:96px;width:min(370px,calc(100vw - 48px));height:min(610px,calc(100dvh - 128px));max-height:calc(100dvh - 128px);border:1px solid var(--chat-border);border-radius:14px;background:var(--chat-surface);box-shadow:0 28px 65px -26px rgba(0,0,0,.45);z-index:99999;display:flex;flex-direction:column;overflow:hidden}',
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
      '#jploft-chat-root .jploft-title-wrap{display:flex;flex-direction:column;align-items:center;min-width:0;flex:1}',
      '#jploft-chat-root .jploft-title{font-size:13px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#jploft-chat-root .jploft-subtitle{font-size:10px;opacity:.86;letter-spacing:.03em}',
      '#jploft-chat-root .jploft-right{display:flex;align-items:center;gap:8px}',
      '#jploft-chat-root .jploft-icon-btn{width:28px;height:28px;border:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:var(--chat-header-text,#fff);background:transparent;cursor:pointer;transition:background .2s ease}',
      '#jploft-chat-root .jploft-icon-btn:hover{background:rgba(255,255,255,.14)}',
      '#jploft-chat-root .jploft-avatar{width:36px;height:36px;border-radius:8px;overflow:hidden;position:relative;flex-shrink:0;background:#fff;display:inline-flex;align-items:center;justify-content:center}',
      '#jploft-chat-root .jploft-avatar-text{font-size:14px;font-weight:600;color:var(--chat-accent,#4f46e5)}',

      '#jploft-chat-root .jploft-main{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--chat-surface)}',
      '#jploft-chat-root .jploft-body{flex:1;min-height:0;overflow-y:auto;padding:12px;background:var(--chat-bg)}',
      '#jploft-chat-root .jploft-msg{display:flex;margin-bottom:16px}',
      '#jploft-chat-root .jploft-msg.user{justify-content:flex-end}',
      '#jploft-chat-root .jploft-msg.assistant{justify-content:flex-start}',
      '#jploft-chat-root .jploft-bubble{position:relative;max-width:min(85%,780px);padding:8px 12px;border:1px solid var(--chat-border);box-shadow:0 12px 26px -22px rgba(0,0,0,.55);font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
      '#jploft-chat-root .jploft-bubble.user{background:var(--user-bubble,var(--chat-accent));color:var(--user-bubble-text,#fff);border-color:transparent;border-radius:16px 16px 0 16px}',
      '#jploft-chat-root .jploft-bubble.assistant{background:var(--assistant-bubble,var(--chat-surface));color:var(--chat-text);border-radius:16px 16px 16px 0}',
      '#jploft-chat-root .jploft-typing{color:var(--chat-muted)}',

      '#jploft-chat-root .jploft-footer{flex-shrink:0;padding:12px;background:var(--chat-bg);border-top:1px solid var(--chat-border)}',
      '#jploft-chat-root .jploft-input-wrap{display:flex;align-items:flex-end;gap:8px;border:1px solid #6b7280;border-radius:10px;overflow:hidden;background:var(--chat-surface);padding:8px 12px}',
      '#jploft-chat-root .jploft-input{flex:1;resize:none;min-height:44px;max-height:160px;border:0;outline:0;background:transparent;color:var(--chat-text);font-size:16px;line-height:1.4;padding:8px 2px 4px}',
      '#jploft-chat-root .jploft-input::placeholder{color:#a1a1aa}',
      '#jploft-chat-root .jploft-send{width:44px;height:42px;border:0;border-radius:8px;background:linear-gradient(135deg,var(--chat-launcher-gradient-start),var(--chat-launcher-gradient-end));color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease;box-shadow:0 12px 26px -18px var(--chat-launcher-shadow)}',
      '#jploft-chat-root .jploft-send:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 18px 32px -20px var(--chat-launcher-shadow);opacity:0.95}',
      '#jploft-chat-root .jploft-send:disabled{opacity:.55;cursor:not-allowed}',

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

  function persistState() {
    try {
      var state = {
        companyId: companyId,
        messages: messages,
        sessionId: sessionId,
        openingMessageShown: openingMessageShown,
      };
      localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function setSendButtonState() {
    if (!sendBtn || !inputEl) return;
    var hasText = (inputEl.value || '').trim().length > 0;
    sendBtn.disabled = loading || !hasText;
  }

  function resizeInput() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
  }

  function renderMessages() {
    if (!messagesEl) return;

    var html = messages.map(function (m) {
      var cls = m.role === 'user' ? 'user' : 'assistant';
      return '<div class="jploft-msg ' + cls + '"><div class="jploft-bubble ' + cls + '">' + escapeHtml(m.content) + '</div></div>';
    }).join('');

    if (loading) {
      html += '<div class="jploft-msg assistant"><div class="jploft-bubble assistant jploft-typing">Thinking...</div></div>';
    }

    messagesEl.innerHTML = html;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function getOpeningMessage() {
    return (companyGreetingMessage && companyGreetingMessage.trim()) ? companyGreetingMessage.trim() : OPENING_MSG;
  }

  function openPanel() {
    if (!panel || !root || opened) return;
    opened = true;

    if (messages.length === 0 && !openingMessageShown) {
      messages.push({ role: 'assistant', content: getOpeningMessage() });
      openingMessageShown = true;
      renderMessages();
      persistState();
    }

    if (launcher) launcher.style.display = 'none';
    panel.style.display = 'flex';
    if (!hasOpenedOnce && !isSmallScreen()) {
      firstOpenPinned = true;
      // First ever open: pin panel to top-left corner.
      panel.classList.remove('is-fullscreen');
      panel.style.left = '24px';
      panel.style.top = '24px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = 'min(370px,calc(100vw - 48px))';
      panel.style.height = 'min(610px,calc(100dvh - 128px))';
      panel.style.maxWidth = '';
      panel.style.maxHeight = 'calc(100dvh - 128px)';
      updateMaxButtonState();
      updateCloseFabVisibility();
    } else {
      updatePanelPosition();
    }
    hasOpenedOnce = true;
    setSendButtonState();

    setTimeout(function () {
      if (inputEl) inputEl.focus();
    }, 0);
  }

  function closePanel() {
    if (!panel || !launcher) return;
    opened = false;
    firstOpenPinned = false;
    isFullscreen = false;
    updateMaxButtonState();
    panel.style.display = 'none';
    if (closeFab) closeFab.style.display = 'none';
    launcher.style.display = 'flex';
  }

  function sendToApi(userContent, callback) {
    var msgs = messages.concat([{ role: 'user', content: userContent }]);
    loading = true;
    setSendButtonState();
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
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.sessionId) sessionId = data.sessionId;
        sendPresenceRegister(sessionId);
        messages.push({ role: 'user', content: userContent });
        messages.push({ role: 'assistant', content: data.content || '' });
        loading = false;
        setSendButtonState();
        renderMessages();
        loadSessions();
        persistState();
        if (callback) callback();
      })
      .catch(function () {
        messages.push({ role: 'user', content: userContent });
        messages.push({ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' });
        loading = false;
        setSendButtonState();
        renderMessages();
        if (callback) callback();
      });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!inputEl || loading) return;

    var text = (inputEl.value || '').trim();
    if (!text) return;

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
  }

  function createWidget() {
    root = document.createElement('div');
    root.id = 'jploft-chat-root';

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'jploft-btn jploft-draggable';
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>';
    launcher.style.display = 'flex';
    launcher.onclick = withDragGuard(openPanel);

    panel = document.createElement('section');
    panel.className = 'jploft-panel';
    panel.setAttribute('aria-label', 'Chat widget');
    panel.style.display = 'none';
    panel.innerHTML =
      '<header class="jploft-header">' +
        '<button type="button" class="jploft-icon-btn jploft-close-btn" aria-label="Close widget" title="Close">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>' +
        '<div class="jploft-title-wrap"><span class="jploft-title">' + escapeHtml(companyName) + '</span></div>' +
        '<div class="jploft-right">' +
          '<button type="button" class="jploft-icon-btn jploft-max-btn" aria-label="Expand chat" title="Expand">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' +
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

    maxBtn = panel.querySelector('.jploft-max-btn');
    maxBtn.onclick = toggleFullscreen;

    [launcher, closeFab].forEach(function (el) {
      el.addEventListener('pointerdown', onWidgetButtonPointerDown);
      el.addEventListener('pointermove', onWidgetButtonPointerMove);
      el.addEventListener('pointerup', onWidgetButtonPointerUp);
      el.addEventListener('pointercancel', onWidgetButtonPointerUp);
    });

    sidebarEl = panel.querySelector('.jploft-sidebar');
    messagesEl = panel.querySelector('.jploft-body');
    inputEl = panel.querySelector('.jploft-input');
    sendBtn = panel.querySelector('.jploft-send');

    var form = panel.querySelector('form');
    form.onsubmit = onSubmit;
    inputEl.addEventListener('keydown', onInputKeyDown);
    inputEl.addEventListener('input', onInputChange);

    resizeInput();
    setSendButtonState();
    applyWidgetButtonPosition();
    updatePanelPosition();
    window.addEventListener('resize', onViewportResize);

    root.appendChild(launcher);
    root.appendChild(panel);
    root.appendChild(closeFab);
    document.body.appendChild(root);

    connectPresenceWs();
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', sendPageUpdate);
      window.addEventListener('hashchange', sendPageUpdate);
    }
    fetchThemeAndApply(root);
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
      presenceWs.onclose = function () {
        presenceWs = null;
        if (!wsReconnectTimer) {
          wsReconnectTimer = setTimeout(connectPresenceWs, WS_RECONNECT_MS);
        }
      };
      presenceWs.onerror = function () {};
    } catch (e) {}
  }

  function fetchThemeAndApply(widgetRoot) {
    fetch(apiUrl + '/train/companies', { headers: mergeHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (companies) {
        if (!Array.isArray(companies) || !widgetRoot) return;
        var company = companies.find(function (c) { return c.id === companyId; });
        if (company) {
          if (company.displayName) companyName = company.displayName;
          companyIconUrl = company.iconUrl || null;
          companyGreetingMessage = company.greetingMessage || null;
          var titleEl = widgetRoot.querySelector('.jploft-title');
          if (titleEl) titleEl.textContent = companyName;
          var avatarEl = widgetRoot.querySelector('.jploft-avatar');
          if (avatarEl) {
            avatarLetter = (companyName || '').trim().charAt(0) || 'J';
            if (companyIconUrl) {
              avatarEl.innerHTML = '<span class="jploft-avatar-text" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--chat-accent);">' + escapeHtml(avatarLetter.toUpperCase()) + '</span><img src="' + escapeHtml(companyIconUrl) + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">';
            } else {
              avatarEl.innerHTML = '<span class="jploft-avatar-text">' + escapeHtml(avatarLetter.toUpperCase()) + '</span>';
            }
          }
        }
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
      })
      .catch(function () {});
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
    var delay = ACTIVATION_MIN + Math.random() * (ACTIVATION_MAX - ACTIVATION_MIN);
    var delayTimer = setTimeout(activate, delay);

    function onScroll() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      if (window.scrollY / h >= SCROLL_THRESHOLD) activate();
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    var idleTimer = null;
    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(activate, IDLE_MS);
    }

    resetIdle();
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('scroll', resetIdle);

    stopActivationWatchers = function () {
      clearTimeout(delayTimer);
      clearTimeout(idleTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('scroll', resetIdle);
    };
  }

  createStyles();
  createWidget();
  runActivation();
})();
