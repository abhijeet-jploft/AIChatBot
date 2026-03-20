const { GoogleGenerativeAI } = require('@google/generative-ai');
const { loadCompanyContext } = require('./trainingLoader');
const { buildDocxRulesPrompt, enforceOutputRules } = require('./chatRules');
const {
  buildConversationModePrompt,
  buildModeContext,
  buildModeDebugLine,
  normalizeConversationModeId,
} = require('./conversationModes');

const BASE_SYSTEM_PROMPT =
  'You are a helpful AI sales assistant. You represent the company professionally, ' +
  'help visitors understand offerings, and guide them toward booking consultations or ' +
  'taking action. Be friendly, concise, and focused on understanding their needs before ' +
  'recommending solutions.\n\n' +
  'Style guidelines:\n' +
  '- When asked for apps, case studies, or examples, provide exact names found in the knowledge base whenever available.\n' +
  '- If names are available in context, do not replace them with generic capability descriptions.\n' +
  '- If specific names are truly unavailable, say so clearly and then share closest relevant examples.\n' +
  '- If relevant source links are present in context, include the exact URL when suggesting a page or redirecting users. Never invent URLs.\n' +
  '- For generic out-of-domain tutorial or code-snippet requests, do not provide tutorial code. Politely redirect to business-focused guidance and discovery questions.\n' +
  '- Use emojis naturally in your responses to make the conversation fun and engaging (e.g. 👍 😊 ✨ 🎯 💡). Do not overuse—1–3 per message is enough.\n' +
  '- Format important text using Markdown: **bold** for emphasis, *italic* for nuance, bullet points for lists, `code` for technical terms.\n\n' +
  buildDocxRulesPrompt();

function buildPrompt(companyId, messages, modeId, modeContext) {
  const latestUserMessage = [...(messages || [])].reverse().find((m) => m?.role === 'user')?.content || '';
  const context = loadCompanyContext(companyId, latestUserMessage);
  const modePrompt = buildConversationModePrompt(modeId, modeContext);
  const convo = (messages || []).map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n');
  return [
    BASE_SYSTEM_PROMPT,
    context
      ? `## Company Knowledge Base\nUse the following information to answer accurately and contextually:\n\n${context}`
      : '## Company Knowledge Base\nNo company-specific context found.',
    modePrompt,
    '## Conversation',
    convo,
    'Assistant:',
  ].join('\n\n');
}

async function sendMessage(companyId, messages, options = {}) {
  const latestUserMessage = [...(messages || [])].reverse().find((m) => m?.role === 'user')?.content || '';
  const { modeId: requestedModeId, modeContext: providedModeContext, safetyConfig, apiKey, model, ..._rest } = options || {};
  const modeId = normalizeConversationModeId(requestedModeId);
  const modeContext = providedModeContext || buildModeContext({ modeId, latestUserMessage, messages });
  if (process.env.AI_MODE_DEBUG === '1') {
    console.log(`[ai-mode][gemini] company=${companyId} ${buildModeDebugLine(modeId, modeContext)}`);
  }

  const key = apiKey || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('Gemini API key not configured');
  const genAI = new GoogleGenerativeAI(key);
  const modelName = model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const gModel = genAI.getGenerativeModel({ model: modelName });
  const prompt = buildPrompt(companyId, messages, modeId, modeContext);
  const result = await gModel.generateContent(prompt);
  const modelText = result?.response?.text?.() || '';
  return enforceOutputRules({ latestUserMessage, modelText, messages, modeContext, safetyConfig });
}

module.exports = { sendMessage };
