const { GoogleGenerativeAI } = require('@google/generative-ai');
const { loadCompanyContext } = require('./trainingLoader');
const {
  buildBusinessProfilePrompt,
  buildConfiguredBusinessInfoPrompt,
  buildDocxRulesPrompt,
  buildLanguageInstruction,
  enforceOutputRules,
  inferCompanyProfile,
} = require('./chatRules');
const {
  buildConversationModePrompt,
  buildModeContext,
  buildModeDebugLine,
  normalizeConversationModeId,
} = require('./conversationModes');
const { buildGeminiModelCandidates, normalizeGeminiModel } = require('./geminiModelService');

const BASE_SYSTEM_PROMPT_PREFIX =
  'You are a helpful AI sales assistant. You represent the company professionally, ' +
  'help visitors understand offerings, and guide them toward booking consultations or ' +
  'taking action. Be friendly, concise, and focused on understanding their needs before ' +
  'recommending solutions.\n\n' +
  'Style guidelines:\n' +
  '- When asked for apps, case studies, or examples, provide exact names found in the knowledge base whenever available.\n' +
  '- If names are available in context, do not replace them with generic capability descriptions.\n' +
  '- If specific names are truly unavailable, say so clearly and then share closest relevant examples.\n' +
  '- If relevant source links are present in context, include the exact URL when suggesting a page or redirecting users. Never invent URLs.\n' +
  '- When contact details appear in the company knowledge base or manual training, prefer those exact details over configured fallback business contact fields. In particular, if the knowledge base shows `Phone:` numbers, use those for call/contact answers.\n' +
  '- For generic out-of-domain tutorial or code-snippet requests, do not provide tutorial code. Politely redirect to business-focused guidance and discovery questions.\n' +
  '- Use emojis naturally in your responses to make the conversation fun and engaging (e.g. 👍 😊 ✨ 🎯 💡). Do not overuse—1–3 per message is enough.\n' +
  '- Format important text using Markdown: **bold** for emphasis, *italic* for nuance, bullet points for lists, `code` for technical terms.\n\n';

function buildBaseSystemPrompt(
  assistantName = '',
  languageInstruction = '',
  businessProfilePrompt = '',
  companyProfile = null,
  configuredBusinessInfoPrompt = '',
  temporalContext = ''
) {
  return [
    BASE_SYSTEM_PROMPT_PREFIX + buildDocxRulesPrompt({ assistantName, companyProfile }),
    temporalContext ? `Temporal context:\n- ${String(temporalContext).trim()}` : '',
    languageInstruction,
    businessProfilePrompt,
    configuredBusinessInfoPrompt,
  ].filter(Boolean).join('\n');
}

function isModelNotFoundError(err) {
  const msg = String(err?.message || '').toLowerCase();
  // We can skip 404s (not found) and 429s (quota/rate-limited) if we want to fallback
  return (msg.includes('404') && (msg.includes('not found') || msg.includes('not supported'))) || msg.includes('429');
}

function buildPrompt(
  companyId,
  messages,
  modeId,
  modeContext,
  assistantName = '',
  languageConfig = {},
  configuredBusinessInfo = null,
  temporalContext = ''
) {
  const latestUserMessage = [...(messages || [])].reverse().find((m) => m?.role === 'user')?.content || '';
  const context = loadCompanyContext(companyId, latestUserMessage);
  const companyProfile = inferCompanyProfile({ context });
  const modePrompt = buildConversationModePrompt(modeId, modeContext);
  const convo = (messages || []).map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n');
  const configuredBizPrompt = buildConfiguredBusinessInfoPrompt(configuredBusinessInfo);
  return [
    buildBaseSystemPrompt(
      assistantName,
      buildLanguageInstruction({
        latestUserMessage,
        companyPrimaryLanguage: languageConfig?.primary,
        languageMultiEnabled: languageConfig?.multiEnabled,
        languageAutoDetectEnabled: languageConfig?.autoDetectEnabled,
        languageExtraLocales: languageConfig?.extraLocales,
        context,
      }),
      buildBusinessProfilePrompt(companyProfile),
      companyProfile,
      configuredBizPrompt,
      temporalContext
    ),
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
  const companyContext = loadCompanyContext(companyId, latestUserMessage);
  const companyProfile = inferCompanyProfile({ context: companyContext });
  const {
    modeId: requestedModeId,
    modeContext: providedModeContext,
    safetyConfig,
    apiKey,
    model,
    assistantName,
    languageConfig,
    configuredBusinessInfo,
    temporalContext,
    ..._rest
  } = options || {};
  const modeId = normalizeConversationModeId(requestedModeId);
  const modeContext = providedModeContext || buildModeContext({ modeId, latestUserMessage, messages });
  if (process.env.AI_MODE_DEBUG === '1') {
    console.log(`[ai-mode][gemini] company=${companyId} ${buildModeDebugLine(modeId, modeContext)}`);
  }

  const key = apiKey || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('Gemini API key not configured');
  const genAI = new GoogleGenerativeAI(key);
  const modelName = normalizeGeminiModel(model, process.env.GEMINI_MODEL);
  const prompt = buildPrompt(
    companyId,
    messages,
    modeId,
    modeContext,
    assistantName,
    languageConfig,
    configuredBusinessInfo,
    temporalContext
  );
  const candidates = buildGeminiModelCandidates(modelName, process.env.GEMINI_MODEL);
  try {
    let lastModelNotFoundError = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        const gModel = genAI.getGenerativeModel({ model: candidate });
        const result = await gModel.generateContent(prompt);
        const modelText = result?.response?.text?.() || '';
        return enforceOutputRules({
          latestUserMessage,
          modelText,
          messages,
          modeContext,
          safetyConfig,
          assistantName,
          companyProfile,
          companyPrimaryLanguage: languageConfig?.primary,
          languageConfig,
          context: companyContext,
        });
      } catch (err) {
        if (isModelNotFoundError(err)) {
          lastModelNotFoundError = err;
          if (i < candidates.length - 1) continue;
          const wrapped = new Error(`No supported Gemini model available for generateContent. Tried: ${candidates.join(', ')}. Last error: ${err.message}`);
          wrapped.cause = err;
          throw wrapped;
        }
        throw err;
      }
    }
    if (lastModelNotFoundError) {
      const wrapped = new Error(`No supported Gemini model available for generateContent. Tried: ${candidates.join(', ')}. Last error: ${lastModelNotFoundError.message}`);
      wrapped.cause = lastModelNotFoundError;
      throw wrapped;
    }
    throw new Error(`No supported Gemini model available for generateContent. Tried: ${candidates.join(', ')}`);
  } catch (err) {
    console.error('GEMINI ERROR:', err);
    throw err;
  }
}

module.exports = { sendMessage };
