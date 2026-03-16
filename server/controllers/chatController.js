const { sendMessage } = require('../services/anthropicService');
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
    const userMsg = messages[messages.length - 1];

    // Persist pre-response data (non-fatal if DB is unavailable)
    try {
      await Chatbot.findOrCreate(companyId);

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
    } catch (dbErr) {
      console.error('[chat] DB pre-write (non-fatal):', dbErr.message);
    }

    const response = await sendMessage(companyId, messages);

    if (sid) {
      try {
        await ChatMessage.create(sid, 'assistant', response);
      } catch (dbErr) {
        console.error('[chat] DB post-write (non-fatal):', dbErr.message);
      }
    }

    res.json({ content: response, sessionId: sid });
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: err.message || 'Failed to get AI response' });
  }
}

module.exports = { postMessage };
