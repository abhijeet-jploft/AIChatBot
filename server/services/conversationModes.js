const {
  DEFAULT_MODE_CONTEXT,
  buildMixedModePrompt,
  selectMixedModeScenario,
} = require('./aiModes');

const DEFAULT_CONVERSATION_MODE = 'mixed_mode';

const MODE_OPTIONS = Object.freeze([
  {
    id: 'lead_generation',
    label: 'Lead Generation',
    description: 'Prioritize qualification and collect contact details before the chat ends.',
  },
  {
    id: 'meeting_booking',
    label: 'Meeting Booking',
    description: 'Guide visitors to schedule a consultation with clear next steps.',
  },
  {
    id: 'product_recommendation',
    label: 'Product Recommendation',
    description: 'Understand needs and recommend the most suitable service or product path.',
  },
  {
    id: 'customer_support',
    label: 'Customer Support',
    description: 'Resolve support questions clearly and escalate to human help when needed.',
  },
  {
    id: 'mixed_mode',
    label: 'Mixed Mode',
    description: 'Blend lead generation, support, and recommendation behavior by visitor intent.',
  },
]);

const MODE_PLAYBOOKS = Object.freeze({
  lead_generation: [
    'Qualify intent quickly using concise discovery questions.',
    'Before ending high-intent conversations, ask for name and contact details.',
    'Keep the conversation focused on conversion and next steps.',
  ],
  meeting_booking: [
    'Move from requirement discovery toward booking a short consultation.',
    'Offer a 10-minute call and ask for preferred contact channel.',
    'Confirm the key agenda the team should prepare for the meeting.',
  ],
  product_recommendation: [
    'Ask about business type, target users, and desired outcomes before suggesting options.',
    'Recommend suitable services/products with reasoning tied to user goals.',
    'Use relevant examples and links from the knowledge base when available.',
  ],
  customer_support: [
    'Prioritize clear and accurate issue-resolution steps.',
    'Confirm issue details and expected outcome before proposing actions.',
    'Escalate politely when confidence is low or human intervention is requested.',
  ],
  mixed_mode: [
    'Blend lead generation, support, and recommendation based on visitor intent.',
    'Prioritize discovery before recommendations or escalation.',
    'Move high-intent conversations toward contact capture or consultation booking.',
  ],
});

function normalizeConversationModeId(modeId) {
  const normalized = String(modeId || '').trim().toLowerCase().replace(/\s+/g, '_');
  return MODE_OPTIONS.some((m) => m.id === normalized) ? normalized : DEFAULT_CONVERSATION_MODE;
}

function isValidConversationModeId(modeId) {
  if (modeId === undefined || modeId === null) return false;
  const normalized = String(modeId).trim().toLowerCase().replace(/\s+/g, '_');
  return MODE_OPTIONS.some((m) => m.id === normalized);
}

function getModeOption(modeId) {
  const normalized = normalizeConversationModeId(modeId);
  return MODE_OPTIONS.find((m) => m.id === normalized) || MODE_OPTIONS.find((m) => m.id === DEFAULT_CONVERSATION_MODE);
}

function getModeCatalog(activeModeId = DEFAULT_CONVERSATION_MODE) {
  const activeOption = getModeOption(activeModeId);
  return {
    active: {
      mode: activeOption.id,
      label: activeOption.label,
      description: activeOption.description,
      pricingPolicy: 'strict_no_exact_price',
    },
    options: {
      modes: [...MODE_OPTIONS],
    },
  };
}

function buildModeContext({ modeId, latestUserMessage = '', messages = [] } = {}) {
  const normalizedMode = normalizeConversationModeId(modeId);

  if (normalizedMode === DEFAULT_CONVERSATION_MODE) {
    const mixedContext = selectMixedModeScenario({ latestUserMessage, messages });
    return {
      ...mixedContext,
      mode: normalizedMode,
      conversationGoal: normalizedMode,
    };
  }

  return {
    ...DEFAULT_MODE_CONTEXT,
    mode: normalizedMode,
    conversationGoal: normalizedMode,
    scenario: 'mode_selected',
    confidence: 1,
    reason: 'company-selected conversation mode',
  };
}

function buildConversationModePrompt(modeId = DEFAULT_CONVERSATION_MODE, modeContext = null) {
  const modeOption = getModeOption(modeId);
  const normalizedMode = modeOption.id;

  if (normalizedMode === DEFAULT_CONVERSATION_MODE) {
    return buildMixedModePrompt({
      ...(modeContext || {}),
      mode: normalizedMode,
      conversationGoal: normalizedMode,
    });
  }

  const playbook = MODE_PLAYBOOKS[normalizedMode] || MODE_PLAYBOOKS[DEFAULT_CONVERSATION_MODE];

  return [
    '## Active AI Mode',
    `- Mode: ${modeOption.label}`,
    `- Conversation goal: ${modeOption.label}`,
    '- Pricing disclosure: never provide exact numeric pricing in chat',
    '',
    'Mode playbook for this turn:',
    ...playbook.map((line) => `- ${line}`),
  ].join('\n');
}

function buildModeDebugLine(modeId = DEFAULT_CONVERSATION_MODE, modeContext = null) {
  const normalizedMode = normalizeConversationModeId(modeId);
  const scenario = modeContext?.scenario || (normalizedMode === 'mixed_mode' ? 'mixed_general' : 'mode_selected');
  const confidence = modeContext?.confidence !== undefined ? modeContext.confidence : (normalizedMode === 'mixed_mode' ? 0.5 : 1);
  return `[ai-mode] mode=${normalizedMode} scenario=${scenario} confidence=${confidence}`;
}

module.exports = {
  DEFAULT_CONVERSATION_MODE,
  MODE_OPTIONS,
  buildConversationModePrompt,
  buildModeContext,
  buildModeDebugLine,
  getModeCatalog,
  getModeOption,
  isValidConversationModeId,
  normalizeConversationModeId,
};