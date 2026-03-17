const Anthropic = require('@anthropic-ai/sdk');
const { loadCompanyContext } = require('./trainingLoader');
const { buildDocxRulesPrompt, enforceOutputRules } = require('./chatRules');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PERSONA =
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

/**
 * Build system prompt as an array of Anthropic content blocks with cache_control.
 *
 * How caching works:
 *   Block 1 — persona text (small, not cached individually).
 *   Block 2 — large knowledge-base text with cache_control: ephemeral.
 *             Anthropic caches everything up to this marker for 5 minutes.
 *             Subsequent turns read this block from cache at ~90 % cost reduction.
 *
 * If there is no company context, the persona block itself carries the cache marker.
 */
function buildSystemBlocks(companyId, userQuery = '') {
  const context = loadCompanyContext(companyId, userQuery);

  if (context) {
    return [
      { type: 'text', text: PERSONA },
      {
        type: 'text',
        text:
          '## Company Knowledge Base\n' +
          'Use the following information to answer accurately and contextually. ' +
          'Stay aligned with company offerings, policies, and processes:\n\n' +
          context,
        cache_control: { type: 'ephemeral' }, // ← cache breakpoint
      },
    ];
  }

  return [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }];
}

/**
 * Transform the messages array to enable conversation-history caching.
 *
 * Strategy (per Anthropic docs):
 *   - Add a cache_control marker to the last message in the *prior* history
 *     (i.e. the second-to-last message in the full array).
 *   - Anthropic caches everything up to that marker.
 *   - The current (last) user message is processed fresh each turn.
 *
 * Cost model:
 *   Turn 1  : 1.25× cost to write system + (short) history to cache.
 *   Turn 2+ : system + prior history read from cache at ~0.10× cost;
 *             only the newest message is billed at full price.
 *   Idle >5 min: cache expires; next turn incurs a fresh write cost.
 */
function buildCachedMessages(messages) {
  if (!messages || messages.length === 0) return [];

  return messages.map((m, i) => {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const isHistoryEnd = i === messages.length - 2 && messages.length >= 3;

    if (isHistoryEnd) {
      // Wrap content in a block array so we can attach cache_control
      return {
        role,
        content: [
          {
            type: 'text',
            text: m.content,
            cache_control: { type: 'ephemeral' }, // ← history cache breakpoint
          },
        ],
      };
    }

    return { role, content: m.content };
  });
}

/**
 * Send a message to Anthropic with full prompt + history caching.
 */
async function sendMessage(companyId, messages, options = {}) {
  const latestUserMessage = [...(messages || [])].reverse().find((m) => m?.role === 'user')?.content || '';

  const params = {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemBlocks(companyId, latestUserMessage),
    messages: buildCachedMessages(messages),
    ...options,
  };

  const response = await anthropic.messages.create(params);
  const textBlock = response.content.find((b) => b.type === 'text');
  const modelText = textBlock ? textBlock.text : '';
  return enforceOutputRules({ latestUserMessage, modelText, messages });
}

module.exports = { sendMessage, buildSystemBlocks };
