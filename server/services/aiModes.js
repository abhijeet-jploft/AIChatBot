const GLOBAL_MODE = 'mixed_mode';
const PERSONA_TYPE = 'sales_consultant+support_assistant+technical_advisor';
const TONE = 'adaptive';
const CONVERSATION_GOAL = 'mixed_mode';
const PERSONA_BLEND = Object.freeze(['sales_consultant', 'support_assistant', 'technical_advisor']);

const PRICE_QUERY_RE = /\b(price|pricing|cost|budget|quote|quotation|estimate|how much|hourly rate)\b/i;
const URGENT_RE = /\b(urgent|urgently|asap|immediately|48\s*hours?|1-2\s*days?|in\s*\d+\s*days?|deadline|this week|client waiting|investor demo|quick delivery|priority)\b/i;
const JOB_SEEKER_RE = /\b(job|hiring|career|internship|resume|cv|apply|opening|vacancy|fresher|remote)\b/i;
const WRONG_VISITOR_RE = /\b(recharge|track my courier|courier|repair my laptop|amazon customer care|book a flight|order food|government office|recover my instagram|bank customer care)\b/i;
const COMPETITOR_CHECK_RE = /\b(where are you located|location|team size|how big is your team|who are your clients|development process|white\s*-?\s*label|partnership)\b/i;
const RETURNING_VISITOR_RE = /\b(visited earlier|came back|returning|i was here before|i came before|again|last time|few days ago)\b/i;
const PORTFOLIO_RE = /\b(portfolio|previous work|case stud|example project|similar project|have you built|shopify project|ecommerce project|mobile app sample)\b/i;
const TECHNOLOGY_RE = /\b(technology|tech stack|react|node|wordpress|shopify|flutter|native|mern|laravel|backend|frontend)\b/i;
const FEATURE_SHOPPER_RE = /\b(seo|hosting|admin panel|maintenance|payment gateway|mobile responsive|domain included|support after delivery|rank on google|content writing|logo)\b/i;
const IDEA_STAGE_RE = /\b(i have an idea|start something online|dont know what i need|don't know what i need|can you guide|how to start|planning stage|not sure yet)\b/i;
const EXPLORING_RE = /\b(just looking|exploring|checking services|no requirement|just visiting|nothing for now|seeing what you do|not interested)\b/i;
const FIRST_TIME_BUILD_RE = /\b(i need|i want|looking to|planning to)\b[^\n]{0,80}\b(website|web app|app|software|ecommerce|redesign|platform|system)\b/i;

const SCENARIO_LABELS = {
  first_time_visitor: 'First-time visitor',
  idea_stage_visitor: 'Idea-stage visitor',
  price_hungry_user: 'Price-focused visitor',
  exploring_visitor: 'Exploring visitor',
  portfolio_evaluation: 'Portfolio evaluation visitor',
  technology_question: 'Technology question visitor',
  returning_visitor: 'Returning visitor',
  job_seeker: 'Job seeker',
  wrong_visitor: 'Wrong or irrelevant visitor',
  competitor_check: 'Competitor or agency check',
  feature_shopper: 'Feature shopper',
  urgent_buyer: 'Urgent buyer',
  mixed_general: 'General mixed conversation',
};

const MODE_OPTIONS = Object.freeze([
  { id: 'mixed_mode', label: 'Mixed Mode', description: 'Blends sales, support, and technical behavior based on visitor intent.' },
]);

const PERSONA_OPTIONS = Object.freeze([
  { id: 'sales_consultant', label: 'Sales Consultant' },
  { id: 'support_assistant', label: 'Support Assistant' },
  { id: 'technical_advisor', label: 'Technical Advisor' },
]);

const TONE_OPTIONS = Object.freeze([
  { id: 'adaptive', label: 'Adaptive' },
]);

const CONVERSATION_GOAL_OPTIONS = Object.freeze([
  { id: 'mixed_mode', label: 'Mixed Mode' },
]);

const SCENARIO_PLAYBOOKS = {
  first_time_visitor: [
    'Welcome warmly and ask discovery questions without sounding interrogative.',
    'Ask whether this is a new or existing business, then ask what they want users to do.',
    'Guide them toward a practical starting scope and consultation when intent is high.',
  ],
  idea_stage_visitor: [
    'Reduce confusion and reassure them they do not need technical clarity yet.',
    'Ask product vs service, target users, and main business goal.',
    'Recommend a simple first version before complex builds.',
  ],
  price_hungry_user: [
    'Do not provide exact pricing or numeric ranges in chat.',
    'Deflect politely, ask qualification questions, then explain feature-based scope.',
    'Move toward consultation and contact capture.',
  ],
  exploring_visitor: [
    'Keep a no-pressure tone and provide lightweight guidance.',
    'Offer to show relevant pages or examples if they want.',
    'Invite optional follow-up by email or WhatsApp when appropriate.',
  ],
  portfolio_evaluation: [
    'Confirm capability quickly and offer similar projects.',
    'Explain what was built and connect it to the visitor idea.',
    'Include relevant source links from knowledge base when available.',
  ],
  technology_question: [
    'Answer technology questions briefly and accurately.',
    'Redirect back to requirement discovery and business outcome.',
    'Avoid stack-first advice without project context.',
  ],
  returning_visitor: [
    'Acknowledge they are back and skip generic introduction.',
    'Take them directly to relevant examples or services.',
    'Continue from prior context and move toward concrete next step.',
  ],
  job_seeker: [
    'Confirm hiring intent where applicable and keep response concise.',
    'Do not ask for resume upload in chat.',
    'Guide them to official hiring contact on company website.',
  ],
  wrong_visitor: [
    'Politely clarify the company scope and avoid dead-end refusal tone.',
    'Offer a relevant alternative connected to software services when possible.',
    'Keep response short and respectful.',
  ],
  competitor_check: [
    'Provide safe company-level answers without private client details.',
    'Do not disclose pricing details or sensitive internal information.',
    'Redirect toward project-fit discussion if conversation continues.',
  ],
  feature_shopper: [
    'Answer feature questions clearly at first.',
    'Stop checklist mode after a few items and pivot to business need.',
    'Guide to consultation for right-fit scope.',
  ],
  urgent_buyer: [
    'Acknowledge urgency immediately and ask only essential fast questions.',
    'Set realistic expectation; do not overcommit delivery in chat.',
    'Push direct call strongly and capture contact quickly.',
  ],
  mixed_general: [
    'Blend sales, support, and technical guidance based on user intent.',
    'Prioritize discovery before recommendation.',
    'Move high-intent discussions toward consultation and contact capture.',
  ],
};

const DEFAULT_MODE_CONTEXT = Object.freeze({
  mode: GLOBAL_MODE,
  personaType: PERSONA_TYPE,
  tone: TONE,
  conversationGoal: CONVERSATION_GOAL,
  scenario: 'mixed_general',
  confidence: 0.5,
  reason: 'default mixed routing',
});

function normalizeText(text = '') {
  return String(text || '').toLowerCase();
}

function countUserMatches(messages = [], matcher) {
  return (messages || []).filter((m) => m?.role === 'user' && matcher.test(String(m.content || ''))).length;
}

function selectMixedModeScenario({ latestUserMessage = '', messages = [] } = {}) {
  const text = normalizeText(latestUserMessage);
  const pricingCount = countUserMatches(messages, PRICE_QUERY_RE);

  if (!text.trim()) {
    return { ...DEFAULT_MODE_CONTEXT };
  }

  if (URGENT_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'urgent_buyer',
      confidence: 0.98,
      reason: 'urgent keyword detected',
    };
  }

  if (PRICE_QUERY_RE.test(text) || pricingCount >= 2) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'price_hungry_user',
      confidence: pricingCount >= 2 ? 0.95 : 0.88,
      reason: pricingCount >= 2 ? 'repeated pricing request' : 'pricing keyword detected',
    };
  }

  if (JOB_SEEKER_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'job_seeker',
      confidence: 0.94,
      reason: 'job seeker keyword detected',
    };
  }

  if (WRONG_VISITOR_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'wrong_visitor',
      confidence: 0.93,
      reason: 'irrelevant intent keyword detected',
    };
  }

  if (COMPETITOR_CHECK_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'competitor_check',
      confidence: 0.9,
      reason: 'competitor/agency keyword detected',
    };
  }

  if (RETURNING_VISITOR_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'returning_visitor',
      confidence: 0.92,
      reason: 'returning visitor pattern detected',
    };
  }

  if (PORTFOLIO_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'portfolio_evaluation',
      confidence: 0.9,
      reason: 'portfolio/capability query detected',
    };
  }

  if (FEATURE_SHOPPER_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'feature_shopper',
      confidence: 0.9,
      reason: 'feature checklist query detected',
    };
  }

  if (TECHNOLOGY_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'technology_question',
      confidence: 0.87,
      reason: 'technology stack query detected',
    };
  }

  if (IDEA_STAGE_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'idea_stage_visitor',
      confidence: 0.88,
      reason: 'idea-stage query detected',
    };
  }

  if (EXPLORING_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'exploring_visitor',
      confidence: 0.86,
      reason: 'exploring pattern detected',
    };
  }

  if (FIRST_TIME_BUILD_RE.test(text)) {
    return {
      ...DEFAULT_MODE_CONTEXT,
      scenario: 'first_time_visitor',
      confidence: 0.84,
      reason: 'new build intent detected',
    };
  }

  return { ...DEFAULT_MODE_CONTEXT };
}

function buildMixedModePrompt(modeContext = DEFAULT_MODE_CONTEXT) {
  const context = {
    ...DEFAULT_MODE_CONTEXT,
    ...(modeContext || {}),
  };

  const scenarioLabel = SCENARIO_LABELS[context.scenario] || SCENARIO_LABELS.mixed_general;
  const playbook = SCENARIO_PLAYBOOKS[context.scenario] || SCENARIO_PLAYBOOKS.mixed_general;
  const confidencePercent = Math.round(Math.max(0, Math.min(1, context.confidence || 0)) * 100);

  return [
    '## Active AI Mode',
    `- Mode: ${context.mode} (global default)`,
    '- Persona blend: Sales Consultant + Support Assistant + Technical Advisor',
    '- Tone: adaptive (professional, friendly, concise)',
    '- Conversation goal: mixed mode (lead generation, support guidance, and technical clarity)',
    `- Active scenario: ${scenarioLabel}`,
    `- Scenario confidence: ${confidencePercent}%`,
    `- Routing reason: ${context.reason || 'default mixed routing'}`,
    '',
    'Scenario playbook for this turn:',
    ...playbook.map((line) => `- ${line}`),
  ].join('\n');
}

function buildModeDebugLine(modeContext = DEFAULT_MODE_CONTEXT) {
  const context = {
    ...DEFAULT_MODE_CONTEXT,
    ...(modeContext || {}),
  };

  return `[ai-mode] mode=${context.mode} scenario=${context.scenario} confidence=${context.confidence}`;
}

function getModeCatalog() {
  return {
    active: {
      mode: GLOBAL_MODE,
      personaType: PERSONA_TYPE,
      personaBlend: [...PERSONA_BLEND],
      tone: TONE,
      conversationGoal: CONVERSATION_GOAL,
      pricingPolicy: 'strict_no_exact_price',
      description: 'Global mixed mode is active in backend. Scenario routing is automatic per message.',
    },
    options: {
      modes: [...MODE_OPTIONS],
      personas: [...PERSONA_OPTIONS],
      tones: [...TONE_OPTIONS],
      conversationGoals: [...CONVERSATION_GOAL_OPTIONS],
    },
    scenarios: Object.keys(SCENARIO_LABELS).map((scenarioId) => ({
      id: scenarioId,
      label: SCENARIO_LABELS[scenarioId],
      playbook: [...(SCENARIO_PLAYBOOKS[scenarioId] || [])],
    })),
  };
}

module.exports = {
  DEFAULT_MODE_CONTEXT,
  GLOBAL_MODE,
  SCENARIO_LABELS,
  buildMixedModePrompt,
  buildModeDebugLine,
  getModeCatalog,
  selectMixedModeScenario,
};
