/**
 * JP Loft / AI Chat Agent – embeddable widget (vanilla JS)
 * Usage: <script src="https://your-domain.com/chat-widget.js" data-api-url="https://your-api.com/api" data-company-id="_JP_Loft"></script>
 * Or set window.JPLoftChatConfig = { apiUrl: '...', companyId: '...', companyName: 'JP Loft' } before loading.
 *
 * Activation (per doc): 6–10s on page OR 40% scroll OR 8s idle.
 * Opening message: Hi! Welcome to JP Loft! I'm Anaya, your digital consultant. Are you looking to build something or just exploring ideas?
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var config = window.JPLoftChatConfig || {};
  var apiUrl = (script && script.getAttribute('data-api-url')) || config.apiUrl || '';
  var companyId = (script && script.getAttribute('data-company-id')) || config.companyId || '_JP_Loft';
  var companyName = (script && script.getAttribute('data-company-name')) || config.companyName || 'JP Loft';

  var OPENING_MSG = "Hi! Welcome to JP Loft!\nI'm Anaya, your digital consultant.\nAre you looking to build something or just exploring ideas?";
  var ACTIVATION_MIN = 6000;
  var ACTIVATION_MAX = 10000;
  var IDLE_MS = 8000;
  var SCROLL_THRESHOLD = 0.4;

  if (!apiUrl) {
    console.warn('[JPLoft Chat] data-api-url or JPLoftChatConfig.apiUrl required');
    return;
  }

  var activated = false;
  var opened = false;
  var messages = [];
  var sessionId = null;
  var loading = false;
  var root = null;
  var launcher = null;
  var panel = null;
  var messagesEl = null;
  var inputEl = null;
  var openBtn = null;

  function createStyles() {
    var css = [
      '#jploft-chat-root *{box-sizing:border-box}',
      '#jploft-chat-root .jploft-btn{position:fixed;right:24px;bottom:24px;width:56px;height:56px;border:0;border-radius:999px;background:linear-gradient(135deg,#4f46e5,#6d28d9);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 38px -20px rgba(79,70,229,.85);z-index:99998;transition:transform .2s,box-shadow .2s}',
      '#jploft-chat-root .jploft-btn:hover{transform:translateY(-2px);box-shadow:0 24px 45px -22px rgba(79,70,229,.9)}',
      '#jploft-chat-root .jploft-panel{position:fixed;right:24px;bottom:96px;width:min(370px,calc(100vw - 48px));height:min(610px,calc(100dvh - 128px));max-height:calc(100dvh - 128px);background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 28px 65px -26px rgba(0,0,0,.45);z-index:99999;display:flex;flex-direction:column;overflow:hidden}',
      '@media(max-width:1024px){#jploft-chat-root .jploft-panel{inset:0;right:0;bottom:0;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0}}',
      '#jploft-chat-root .jploft-header{height:52px;min-height:52px;padding:0 10px;background:linear-gradient(120deg,#4f46e5,#6d28d9);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0}',
      '#jploft-chat-root .jploft-title-wrap{display:flex;flex-direction:column;align-items:center;flex:1;min-width:0}',
      '#jploft-chat-root .jploft-title{font-size:13px;font-weight:600}',
      '#jploft-chat-root .jploft-subtitle{font-size:10px;opacity:.86}',
      '#jploft-chat-root .jploft-close-btn{width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '#jploft-chat-root .jploft-body{flex:1;min-height:0;overflow-y:auto;padding:12px;background:#f4f4f5}',
      '#jploft-chat-root .jploft-msg{margin-bottom:12px;display:flex;justify-content:flex-end}',
      '#jploft-chat-root .jploft-msg.assistant{justify-content:flex-start}',
      '#jploft-chat-root .jploft-bubble{max-width:85%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
      '#jploft-chat-root .jploft-bubble.user{background:#4f46e5;color:#fff;border-radius:16px 16px 0 16px}',
      '#jploft-chat-root .jploft-bubble.assistant{background:#fff;color:#18181b;border:1px solid #e5e7eb;border-radius:16px 16px 16px 0}',
      '#jploft-chat-root .jploft-typing{padding:10px 14px;color:#71717a;font-size:14px}',
      '#jploft-chat-root .jploft-footer{flex-shrink:0;padding:10px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:8px}',
      '#jploft-chat-root .jploft-input{flex:1;padding:10px 14px;border:1px solid #d4d4d8;border-radius:10px;font-size:14px;font-family:inherit}',
      '#jploft-chat-root .jploft-send{padding:10px 16px;background:linear-gradient(135deg,#4f46e5,#6d28d9);color:#fff;border:0;border-radius:10px;cursor:pointer;font-weight:600}',
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

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = messages.map(function (m) {
      var cls = m.role === 'user' ? 'user' : 'assistant';
      return '<div class="jploft-msg ' + cls + '"><div class="jploft-bubble ' + cls + '">' + escapeHtml(m.content) + '</div></div>';
    }).join('') + (loading ? '<div class="jploft-msg assistant"><div class="jploft-bubble assistant jploft-typing">Thinking...</div></div>' : '');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function openPanel() {
    if (!panel || !root) return;
    opened = true;
    if (messages.length === 0) {
      messages.push({ role: 'assistant', content: OPENING_MSG });
      renderMessages();
    }
    launcher.style.display = 'none';
    panel.style.display = 'flex';
  }

  function closePanel() {
    if (!panel || !launcher) return;
    panel.style.display = 'none';
    launcher.style.display = 'flex';
  }

  function sendToApi(userContent, callback) {
    var msgs = messages.concat([{ role: 'user', content: userContent }]);
    loading = true;
    renderMessages();
    fetch(apiUrl + '/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: companyId,
        sessionId: sessionId || undefined,
        messages: msgs.map(function (m) { return { role: m.role, content: m.content }; }),
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.sessionId) sessionId = data.sessionId;
        messages.push({ role: 'user', content: userContent });
        messages.push({ role: 'assistant', content: data.content || '' });
        loading = false;
        renderMessages();
        if (callback) callback();
      })
      .catch(function (err) {
        messages.push({ role: 'user', content: userContent });
        messages.push({ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' });
        loading = false;
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
    sendToApi(text);
  }

  function createWidget() {
    root = document.createElement('div');
    root.id = 'jploft-chat-root';

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'jploft-btn';
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>';
    launcher.style.display = 'none';
    launcher.onclick = openPanel;

    panel = document.createElement('div');
    panel.className = 'jploft-panel';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="jploft-header">' +
        '<button type="button" class="jploft-close-btn" aria-label="Close">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>' +
        '<div class="jploft-title-wrap"><span class="jploft-title">' + escapeHtml(companyName) + '</span><span class="jploft-subtitle">AI Sales Agent</span></div>' +
        '<div></div>' +
      '</div>' +
      '<div class="jploft-body"></div>' +
      '<form class="jploft-footer"><input type="text" class="jploft-input" placeholder="Type your message..." autocomplete="off"/><button type="submit" class="jploft-send">Send</button></form>';

    var closeBtn = panel.querySelector('.jploft-close-btn');
    closeBtn.onclick = closePanel;
    messagesEl = panel.querySelector('.jploft-body');
    inputEl = panel.querySelector('.jploft-input');
    var form = panel.querySelector('form');
    form.onsubmit = onSubmit;

    root.appendChild(launcher);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function activate() {
    if (activated) return;
    activated = true;
    if (launcher) launcher.style.display = 'flex';
  }

  function runActivation() {
    var delay = ACTIVATION_MIN + Math.random() * (ACTIVATION_MAX - ACTIVATION_MIN);
    setTimeout(activate, delay);

    function onScroll() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      if (window.scrollY / h >= SCROLL_THRESHOLD) activate();
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    var idleTimer;
    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(activate, IDLE_MS);
    }
    resetIdle();
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('scroll', resetIdle);
  }

  createStyles();
  createWidget();
  runActivation();
})();
