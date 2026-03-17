/**
 * JP Loft / AI Chat Agent - embeddable widget (vanilla JS)
 * Usage: <script src="https://your-domain.com/chat-widget.js" data-api-url="https://your-api.com/api" data-company-id="_JP_Loft"></script>
 * Or set window.JPLoftChatConfig = { apiUrl: '...', companyId: '...', companyName: 'JP Loft' } before loading.
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
  var avatarLetter = ((companyName || '').trim().charAt(0) || 'J').toUpperCase();

  var OPENING_MSG = "Hi! Welcome to JP Loft!\nI'm Anaya, your digital consultant.\nAre you looking to build something or just exploring ideas?";
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

  var activated = false;
  var opened = false;
  var openingMessageShown = false;
  var stopActivationWatchers = null;
  var messages = [];
  var sessionId = null;
  var loading = false;
  var presenceWs = null;
  var wsReconnectTimer = null;
  var WS_RECONNECT_MS = 5000;

  var root = null;
  var launcher = null;
  var panel = null;
  var closeFab = null;
  var messagesEl = null;
  var inputEl = null;
  var sendBtn = null;
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

  function getViewport() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 1280,
      height: window.innerHeight || document.documentElement.clientHeight || 720,
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

    maxBtn.setAttribute('aria-label', 'Expand chat');
    maxBtn.setAttribute('title', 'Expand');
    maxBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  }

  function updateCloseFabVisibility() {
    if (!closeFab) return;
    if (!opened) {
      closeFab.style.display = 'none';
      return;
    }

    closeFab.style.display = isSmallScreen() || isFullscreen ? 'none' : 'flex';
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

  function toggleFullscreen(event) {
    if (event) event.preventDefault();
    if (isSmallScreen()) return;

    isFullscreen = !isFullscreen;
    updatePanelPosition();
  }

  function createStyles() {
    var css = [
      '#jploft-chat-root{--chat-bg:#f4f4f5;--chat-surface:#ffffff;--chat-border:#d4d4d8;--chat-text:#18181b;--chat-muted:#71717a;--chat-accent:#E02F3A;--chat-header-bg:#000000;--chat-header-shadow:0 4px 12px rgba(224,47,58,0.25);--chat-header-text:#ffffff;font-family:Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '#jploft-chat-root *{box-sizing:border-box}',
      '#jploft-chat-root button,#jploft-chat-root textarea{font:inherit}',

      '#jploft-chat-root .jploft-btn,#jploft-chat-root .jploft-close-fab{position:fixed;right:24px;bottom:24px;width:56px;height:56px;border:0;border-radius:999px;background:var(--chat-accent,linear-gradient(135deg,#4f46e5,#6d28d9));color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 38px -20px rgba(79,70,229,.85);z-index:99998;transition:transform .2s,box-shadow .2s}',
      '#jploft-chat-root .jploft-btn:hover,#jploft-chat-root .jploft-close-fab:hover{transform:translateY(-2px);box-shadow:0 24px 45px -22px rgba(79,70,229,.9)}',
      '#jploft-chat-root .jploft-draggable{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}',
      '#jploft-chat-root .jploft-draggable.is-dragging{cursor:grabbing;transition:none;transform:none}',
      '#jploft-chat-root .jploft-close-fab{display:none;z-index:100000}',

      '#jploft-chat-root .jploft-panel{position:fixed;right:24px;bottom:96px;width:min(370px,calc(100vw - 48px));height:min(610px,calc(100dvh - 128px));max-height:calc(100dvh - 128px);border:1px solid var(--chat-border);border-radius:14px;background:var(--chat-surface);box-shadow:0 28px 65px -26px rgba(0,0,0,.45);z-index:99999;display:flex;flex-direction:column;overflow:hidden}',
      '#jploft-chat-root .jploft-panel.is-fullscreen{inset:0;width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;border-radius:0;border:0;box-shadow:none}',

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
      '#jploft-chat-root .jploft-bubble.user{background:var(--chat-accent);color:#fff;border-color:transparent;border-radius:16px 16px 0 16px}',
      '#jploft-chat-root .jploft-bubble.assistant{background:var(--chat-surface);color:var(--chat-text);border-radius:16px 16px 16px 0}',
      '#jploft-chat-root .jploft-typing{color:var(--chat-muted)}',

      '#jploft-chat-root .jploft-footer{flex-shrink:0;padding:12px;background:var(--chat-bg);border-top:1px solid var(--chat-border)}',
      '#jploft-chat-root .jploft-input-wrap{display:flex;align-items:flex-end;gap:8px;border:1px solid #6b7280;border-radius:10px;overflow:hidden;background:var(--chat-surface);padding:8px 12px}',
      '#jploft-chat-root .jploft-input{flex:1;resize:none;min-height:44px;max-height:160px;border:0;outline:0;background:transparent;color:var(--chat-text);font-size:16px;line-height:1.4;padding:8px 2px 4px}',
      '#jploft-chat-root .jploft-input::placeholder{color:#a1a1aa}',
      '#jploft-chat-root .jploft-send{width:44px;height:42px;border:0;border-radius:8px;background:#60a5fa;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .2s ease,opacity .2s ease}',
      '#jploft-chat-root .jploft-send:hover{background:#3b82f6}',
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

  function openPanel() {
    if (!panel || !root || opened) return;
    opened = true;

    if (messages.length === 0 && !openingMessageShown) {
      messages.push({ role: 'assistant', content: OPENING_MSG });
      openingMessageShown = true;
      renderMessages();
    }

    if (launcher) launcher.style.display = 'none';
    panel.style.display = 'flex';
    updatePanelPosition();
    setSendButtonState();

    setTimeout(function () {
      if (inputEl) inputEl.focus();
    }, 0);
  }

  function closePanel() {
    if (!panel || !launcher) return;
    opened = false;
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
      headers: { 'Content-Type': 'application/json' },
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
    fetch(apiUrl + '/train/companies')
      .then(function (r) { return r.json(); })
      .then(function (companies) {
        if (!Array.isArray(companies)) return;
        var company = companies.find(function (c) { return c.id === companyId; });
        var theme = company && company.theme;
        if (!theme || !widgetRoot) return;
        if (theme.headerBackground) widgetRoot.style.setProperty('--chat-header-bg', theme.headerBackground);
        if (theme.headerShadow) widgetRoot.style.setProperty('--chat-header-shadow', theme.headerShadow);
        if (theme.headerTextColor) widgetRoot.style.setProperty('--chat-header-text', theme.headerTextColor);
        if (theme.primaryColor) widgetRoot.style.setProperty('--chat-accent', theme.primaryColor);
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
