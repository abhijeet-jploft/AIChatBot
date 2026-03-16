const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');

/**
 * GET /api/sessions?companyId=_default
 */
async function list(req, res) {
  const { companyId = '_default' } = req.query;
  try {
    const rows = await ChatSession.listByCompany(companyId, 100);
    res.json(rows);
  } catch (err) {
    console.error('[sessions] list:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/sessions/:id/messages
 */
async function getMessages(req, res) {
  try {
    const rows = await ChatMessage.listBySession(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('[sessions] messages:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/sessions/:id
 */
async function remove(req, res) {
  try {
    await ChatSession.deleteById(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[sessions] delete:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { list, getMessages, remove };
