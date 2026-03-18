const { sendMessage } = require('../services/anthropicService');
const { captureLeadFromConversation } = require('../services/leadCaptureService');
const { sendNewLeadNotification } = require('../services/leadNotificationService');
const { record: recordActiveVisitor, broadcastAlert } = require('../services/activeVisitorsService');
const { appendChatLog } = require('../services/adminLogStore');
const { add: addSupportRequest, isSupportRequest } = require('../services/supportRequestsStore');
const Chatbot = require('../models/Chatbot');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');

/**
 * POST /api/chat/message
 * Body: { messages, companyId?, sessionId? }
 * Returns: { content, sessionId }
 */
async function postMessage(req, res) {
  try {
    const { messages, companyId = '_default', sessionId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    let sid = sessionId || null;
    let selectedModeId = null;
    const userMsg = messages[messages.length - 1];

    // Persist pre-response data (non-fatal if DB is unavailable)
    try {
      await Chatbot.findOrCreate(companyId);
      const chatbot = await Chatbot.findByCompanyId(companyId);
      selectedModeId = chatbot?.ai_mode || null;

      if (!sid) {
        const { id } = await ChatSession.create(companyId);
        sid = id;
      }

      await ChatMessage.create(sid, 'user', userMsg.content);

      const session = await ChatSession.findById(sid);
      if (session?.title === 'New Chat') {
        const title = userMsg.content.replace(/\s+/g, ' ').trim().slice(0, 80);
        await ChatSession.updateTitle(sid, title);
      } else {
        await ChatSession.touch(sid);
      }

      if (chatbot?.agent_paused) {
        const pausedMessage = 'Our AI agent is currently paused. Please leave your name and contact details, and we will get back to you shortly.';
        await ChatMessage.create(sid, 'assistant', pausedMessage);
        return res.json({ content: pausedMessage, sessionId: sid });
      }

      recordActiveVisitor(companyId, sid, req.headers['x-page-url'] || req.headers.referer || req.body.pageUrl, true);

      if (isSupportRequest(userMsg.content)) {
        addSupportRequest(companyId, { sessionId: sid, message: userMsg.content });
        try {
          broadcastAlert(companyId, {
            kind: 'support_request',
            message: 'Support requested',
            link: '/admin/support-requests',
          });
        } catch (alertErr) {
          /* ignore */
        }
      }
    } catch (dbErr) {
      console.error('[chat] DB pre-write (non-fatal):', dbErr.message);
      appendChatLog('error', `Chat DB pre-write: ${dbErr.message}`, { sessionId: sid, companyId });
    }

    const response = await sendMessage(companyId, messages, { modeId: selectedModeId });

    if (sid) {
      try {
        await ChatMessage.create(sid, 'assistant', response);
      } catch (dbErr) {
        console.error('[chat] DB post-write (non-fatal):', dbErr.message);
        appendChatLog('error', `Chat DB post-write: ${dbErr.message}`, { sessionId: sid, companyId });
      }

      captureLeadFromConversation({
        companyId,
        sessionId: sid,
        messages: [...messages, { role: 'assistant', content: response }],
        requestMeta: {
          referer: req.headers.referer,
          origin: req.headers.origin,
          pageUrl: req.headers['x-page-url'],
          userAgent: req.headers['user-agent'],
        },
      })
        .then(async (leadCaptureResult) => {
          if (leadCaptureResult?.captured && leadCaptureResult?.inserted && leadCaptureResult?.lead) {
            try {
              await sendNewLeadNotification({ companyId, lead: leadCaptureResult.lead });
            } catch (notifyErr) {
              console.error('[lead-notify] non-fatal:', notifyErr.message);
            }
            try {
              const lead = leadCaptureResult.lead;
              const meetingRequested = (lead?.ai_detected_intent || '') === 'meeting_booking';
              broadcastAlert(companyId, {
                kind: 'lead_captured',
                message: meetingRequested ? 'Meeting requested — new lead captured' : 'New lead captured',
                link: '/admin/leads',
              });
            } catch (alertErr) {
              /* ignore */
            }
          }
        })
        .catch((leadErr) => {
          console.error('[lead-capture] non-fatal:', leadErr.message);
          appendChatLog('warn', `Lead capture: ${leadErr.message}`, { sessionId: sid, companyId });
        });
    }

    res.json({ content: response, sessionId: sid });
  } catch (err) {
    console.error('[chat] error:', err);
    appendChatLog('error', `Chat error: ${err.message || 'Failed to get AI response'}`, { companyId, stack: err.stack });
    res.status(500).json({ error: err.message || 'Failed to get AI response' });
  }
}

/**
 * POST /api/chat/ping
 * Body: { companyId, sessionId?, pageUrl? }
 * Heartbeat for active visitor tracking. Call periodically from widget/app.
 */
async function ping(req, res) {
  try {
    const { companyId, sessionId, pageUrl } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    recordActiveVisitor(companyId, sessionId || null, pageUrl || null, false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[chat] ping:', err);
    res.status(500).json({ error: err.message || 'Ping failed' });
  }
}

module.exports = { postMessage, ping };
