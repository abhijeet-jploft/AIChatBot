// Rules derived from: AI Chat Agent __ Feature listing and Ideas __ JPloft.docx
// SRS Sections: 3.0 Functional Requirements, 4.2 AI Training, 4.5 AI Configuration

const PRICING_QUERY_RE = /\b(price|pricing|cost|budget|quote|quotation|estimate|estimated|how much|hourly rate)\b/i;
const PRICE_VALUE_RE = /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|inr|eur|gbp|dollars?|rupees?|euros?|pounds?)\b|\b\d+\s?(?:k|m)\b)/i;
const SIMPLE_RANGE_RE = /\b\d+\s*(?:-|to)\s*\d+\b/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const URGENT_RE = /\b(urgent|asap|immediately|1-2 days|48 hours|this week|deadline|presentation|investor demo|client waiting)\b/i;
const PRICE_PUSHBACK_RE = /\b(just tell( me)?( the)? price|just price|only price|price only|direct price|exact price|just give me (the )?(price|cost)|tell me (the )?(price|cost) (only|directly)|how much exactly)\b/i;
const OFF_DOMAIN_CODE_REQUEST_RE = /(\bhello\s*world\b|\b(leetcode|homework|assignment|tutorial)\b|\b(write|give|show|generate|create|provide|send)\b[^\n]{0,60}\b(code|program|script|snippet)\b|\bpython\b[^\n]{0,50}\bcode\b|\bjavascript\b[^\n]{0,50}\bcode\b|\bjava\b[^\n]{0,50}\bcode\b|\bc\+\+\b[^\n]{0,50}\bcode\b|\bc#\b[^\n]{0,50}\bcode\b)/i;
const DOMAIN_BUSINESS_INTENT_RE = /(\b(build|develop|create|make|launch|start|need|looking for|want)\b[^\n]{0,80}\b(website|web app|mobile app|app|software|platform|system|crm|erp|ecommerce|product|project|business)\b|\b(portfolio|case study|services|consultation|quote|pricing)\b)/i;

const DOCX_RULES = [
  'Pricing (4.5.7): NEVER provide exact numeric pricing, ranges, or quotations in chat. Always redirect pricing questions to consultation.',
  'Price flow: For pricing questions: (1) deflect politely and ask what they are building first; (2) if they repeat "just tell price", explain estimates depend on scope and features; (3) ask qualification questions (business type, website vs app, contact vs order, timeline); (4) explain features they need instead of price; (5) at most suggest a quick discussion is needed for an accurate estimate; (6) move to call booking; (7) capture contact details.',
  'Repeated price request: If the user asks for price again after the AI has already responded, tell them to contact the company directly for pricing and include the Contact Us link when it is available in the knowledge base.',
  'If user refuses call: Offer to send a brief plan or outline. Ask for email instead.',
  'Never give hourly rate or generic hourly quote. Say the project is scoped based on requirements, features, and complexity.',
  'Data Safety (4.2.7): NEVER expose raw database records, internal identifiers (UUIDs, IDs), or structured internal data in replies.',
  'Safety: Do not share internal notes, sensitive database data, or client details. Maintain client privacy and demonstrate capabilities through portfolio instead.',
  'If information is unreliable or unknown: Say "I may need to confirm this with our team. I can arrange a quick discussion for you."',
  'Instruction Compliance: Follow configured company instructions exactly.',
  'Urgent leads: Acknowledge immediately, ask only fast essential questions, set realistic expectations, push direct call strongly, and capture contact quickly.',
  'Booking intent: When users seek final proposal, quote, or decision, guide toward consultation booking.',
  'Call closing: Offer a 10-minute call. Provide booking link when available. Ask where to send meeting details, then collect phone and name.',
  'Page redirect and links: When showing portfolio, similar projects, services, or relevant content, redirect the user to that page or provide the direct URL link from the knowledge base when available.',
  'Guided viewing: Say "I am opening a similar project for you" or "Let me take you to that page" and include the link.',
  'Out-of-domain coding/tutorial requests: Do not provide that content. Redirect to business-focused guidance and discovery questions.',
  'Redirection style: Be polite and helpful. Briefly clarify scope, then ask a bridge question tied to the business domain.',
  'First-time visitor: Ask discovery questions about new vs existing business, business type, customer action, and timeline. Be welcoming, not interrogative.',
  'Confused or idea-stage visitor: Help shape the idea. Ask what they want to create, product vs service, and who their customers are. Explain they do not need to know the tech yet.',
  'Exploring or browsing: No pressure. Offer guidance, relevant page links, and a checklist or guide by email or WhatsApp when useful.',
  'Portfolio or capability questions: Show similar projects, explain what was built, ask qualification questions, and guide toward consultation.',
  'Technology questions: Answer briefly, then redirect to requirements.',
  'Returning visitor: Welcome back, skip generic intro, and take them straight to relevant portfolio or services.',
  'Job seeker: Confirm hiring, do not ask for a resume in chat, and instead share the HR email for applications while briefly explaining the process.',
  'Wrong visitor: Politely clarify what the company does and offer a relevant alternative.',
  'Competitor or agency checking: Give safe company-level answers without exposing private client data or pricing.',
  'Feature shopper: Answer clearly, then stop checklist mode and redirect to the actual business need and consultation.',
  'Act as: Sales Executive + Product Consultant + Website Guide + Lead Generator. Not a CRM or FAQ bot.',
  'Greeting: When greeting the user, first welcome the visitor to the company (e.g. "Hi! Welcome to [Company Name]!").',
  'Discovery before recommendation: Always understand needs before suggesting solutions.',
  'Qualification: Budget, timeline, and requirement matter. Ask conversationally.',
  'Value building: Explain what they need instead of jumping to price.',
  'Objection handling: Handle doubts and price objections professionally. Never refuse; redirect to consultation.',
  'Upsell/cross-sell: Suggest upgrades or bundles when relevant.',
  'Contact capture: Collect name, phone, and email when moving toward conversion.',
  'Phone validation: If the user shares a phone number without an explicit country code, ask a short follow-up for the country code before treating the number as complete.',
];

function buildDocxRulesPrompt(options = {}) {
  const configuredName = String(options?.assistantName || '').replace(/\s+/g, ' ').trim();
  const greetingRule = configuredName
    ? `Greeting continuation: Introduce yourself using the configured chatbot name exactly as "${configuredName}" (e.g. "I'm ${configuredName}, your digital consultant.").`
    : 'Greeting continuation: Introduce yourself as the company\'s digital consultant.';

  return [
    'Operating Rules (from product specification):',
    ...DOCX_RULES.map((rule) => `- ${rule}`),
    `- ${greetingRule}`,
  ].join('\n');
}

function isPricingQuestion(text = '') {
  return PRICING_QUERY_RE.test(String(text));
}

function isPricePushback(text = '') {
  return PRICE_PUSHBACK_RE.test(String(text));
}

function isUrgentLead(text = '') {
  return URGENT_RE.test(String(text));
}

function containsPriceLikeNumbers(text = '') {
  const t = String(text);
  return PRICE_VALUE_RE.test(t) || SIMPLE_RANGE_RE.test(t);
}

function isOffDomainCodeRequest(text = '') {
  const t = String(text || '');
  return OFF_DOMAIN_CODE_REQUEST_RE.test(t) && !DOMAIN_BUSINESS_INTENT_RE.test(t);
}

function detectMentionedLanguage(text = '') {
  const match = String(text || '').toLowerCase().match(/\b(python|javascript|java|c\+\+|c#|php|ruby|go|swift|kotlin)\b/);
  return match ? match[1] : '';
}

function buildOffDomainRedirectReply(latestUserMessage = '') {
  const language = detectMentionedLanguage(latestUserMessage);
  const languagePart = language
    ? ` If you are planning a ${language}-based product for your business, I can help with the right approach.`
    : ' If you are planning a website, app, or software product for your business, I can help with the right approach.';

  return [
    'Thanks for your question.',
    '',
    `I cannot provide generic coding tutorial snippets here.${languagePart}`,
    '',
    'Share these details and I will guide you:',
    '- What you want to build',
    '- Who your target users are',
    '- The key features you need first',
  ].join('\n');
}

function hasProjectContext(messages = []) {
  const priorUserText = messages
    .filter((message) => message?.role === 'user')
    .slice(0, -1)
    .map((message) => message.content)
    .join(' \n ');

  return DOMAIN_BUSINESS_INTENT_RE.test(priorUserText);
}

function isRepeatedPricingQuestion(messages = []) {
  if (!Array.isArray(messages) || messages.length < 3) return false;

  const latestIndex = messages.length - 1;
  const latestMessage = messages[latestIndex];
  if (latestMessage?.role !== 'user' || !isPricingQuestion(latestMessage.content)) return false;

  for (let i = latestIndex - 1; i >= 0; i -= 1) {
    const message = messages[i];

    if (message?.role === 'assistant') {
      return messages
        .slice(0, i)
        .some((priorMessage) => priorMessage?.role === 'user' && isPricingQuestion(priorMessage.content));
    }
  }

  return false;
}

function buildPricingDeflectionReply({ latestUserMessage = '', messages = [] } = {}) {
  if (isRepeatedPricingQuestion(messages)) {
    return [
      'For exact pricing, please contact the company directly because the final quote depends on your scope, features, and timeline.',
      '',
      'If a Contact Us page or direct contact link is available, please use that for the pricing request.',
      '',
      'If you want, I can still help you narrow down the project requirements before you reach out.',
    ].join('\n');
  }

  if (isPricePushback(latestUserMessage)) {
    return [
      'I understand. I just do not want to mislead you with a random number because two similar projects can vary a lot based on features and business goals.',
      '',
      'For exact pricing, the best next step is to contact the company directly.',
      '',
      'If a Contact Us page or direct contact link is available, please use that for the pricing request.',
      '',
      'If you prefer, I can still help narrow down your requirements first so your pricing inquiry is more accurate.',
    ].join('\n');
  }

  if (hasProjectContext(messages)) {
    return [
      'I can help with the budget guidance. Based on what you have shared, the final cost depends on the exact features, user flow, and complexity.',
      '',
      'What we usually scope first is:',
      '- The core pages or modules you need',
      '- Whether users will contact you, book, or order online',
      '- Admin, integrations, SEO, and mobile readiness',
      '',
      'Projects like this are scoped after a quick discussion so we do not overbuild or underquote. If you want, I can help line up a short consultation and collect the best WhatsApp or email for the details.',
    ].join('\n');
  }

  return [
    'I can definitely help with budget guidance.',
    '',
    'First, let me understand what you are planning to build so I can give you relevant information instead of random numbers.',
    '',
    'What are you looking to create?',
    '- A website for your business',
    '- A mobile app',
    '- An e-commerce store',
    '- Something else',
    '',
    'And what kind of business is this for?',
    '',
    'Once I know that, I can explain the features you will likely need and how projects like yours are usually scoped.',
  ].join('\n');
}

function sanitizeInternalIdentifiers(text = '') {
  return String(text).replace(UUID_RE, '[redacted-id]');
}

function needsUrgentEscalationFallback(text = '') {
  return !/\b(call|phone|number|whatsapp|priority|urgent|deadline|10[- ]minute|consult)\b/i.test(String(text || ''));
}

function buildUrgentEscalationReply() {
  return [
    'I understand this is urgent, and I will prioritize a fast path for you.',
    '',
    'To avoid delay, please share these quick details:',
    '- What needs to be ready (website, app, or landing page)',
    '- Your exact deadline',
    '- Whether content/design is ready',
    '',
    'The best next step is a quick 10-minute call so the team can confirm what is feasible in your timeline. Please share your best phone number and name for priority callback.',
  ].join('\n');
}

function violatesJobSeekerRule(text = '') {
  return /\b(upload|attach|share)\b[^\n]{0,30}\b(resume|cv)\b/i.test(String(text || ''));
}

function buildJobSeekerSafeReply() {
  return [
    'Thanks for your interest in joining the team.',
    '',
    'Please apply through the official hiring contact listed on the company website or Contact Us page so your profile is reviewed through the right process.',
    '',
    'If helpful, I can guide you on suitable role categories based on your experience.',
  ].join('\n');
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAssistantIdentity(text = '', assistantName = '') {
  const targetName = String(assistantName || '').replace(/\s+/g, ' ').trim();
  if (!targetName) return String(text || '');

  let output = String(text || '');
  const hasTargetName = new RegExp(`\\b${escapeRegExp(targetName)}\\b`, 'i').test(output);
  if (hasTargetName && !/\banaya\b/i.test(output)) {
    return output;
  }

  output = output
    .replace(/\b(i\s*(?:am|'m)\s+)anaya\b/gi, `$1${targetName}`)
    .replace(/\b(it\s*(?:is|'s)\s+)anaya\b/gi, `$1${targetName}`)
    .replace(/\b(this is\s+)anaya\b/gi, `$1${targetName}`)
    .replace(/\b(my name is\s+)anaya\b/gi, `$1${targetName}`)
    .replace(/\banaya(?=,\s*your digital consultant\b)/gi, targetName)
    .replace(/\banaya(?=\s+here\b)/gi, targetName)
    .replace(/\banaya(?=\s+from\b)/gi, targetName);

  // Final fallback for greeting-style responses that still mention Anaya.
  if (/\banaya\b/i.test(output) && /\b(hi|hello|hey|welcome|consultant)\b/i.test(output)) {
    output = output.replace(/\banaya\b/gi, targetName);
  }

  return output;
}

function enforceOutputRules({
  latestUserMessage = '',
  modelText = '',
  messages = [],
  modeContext = null,
  safetyConfig = {},
  assistantName = '',
}) {
  const preventInternalData = safetyConfig?.preventInternalData !== false;
  const restrictDatabasePriceExposure = safetyConfig?.restrictDatabasePriceExposure !== false;
  const disableCompetitorComparisons = safetyConfig?.disableCompetitorComparisons !== false;
  const restrictFileSharing = safetyConfig?.restrictFileSharing !== false;

  const normalizedUserMessage = String(latestUserMessage || '');

  // Safety controls: refuse when user requests disallowed content
  if (safetyConfig?.blockTopicsEnabled) {
    const topics = String(safetyConfig?.blockTopics || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (topics.length > 0) {
      const matched = topics.find((t) => t && normalizedUserMessage.toLowerCase().includes(t));
      if (matched) {
        return 'Sorry, I can not help with that topic. If you share what you are trying to achieve, I can suggest a safe alternative approach.';
      }
    }
  }

  if (disableCompetitorComparisons) {
    const wantsComparison = /\b(compare|vs\.?|versus|alternatives|competitor|competitors|better than)\b/i.test(normalizedUserMessage);
    if (wantsComparison) {
      return 'I can not do direct competitor comparisons. I can help you understand the features you need and how we can support your goals. What are you trying to build and for which audience?';
    }
  }

  if (restrictFileSharing) {
    const wantsFile = /\b(upload|attach|send|share)\b[^\n]{0,40}\b(file|document|pdf|docx|screenshot|image|attachment)\b/i.test(normalizedUserMessage)
      || /\b(file|document|pdf|docx)\b/i.test(normalizedUserMessage);
    if (wantsFile) {
      return 'I can not accept files directly in chat. Please describe the details in text, and I will help you review the requirements and next steps.';
    }
  }

  let output = preventInternalData ? sanitizeInternalIdentifiers(modelText || '') : (modelText || '');

  if (isOffDomainCodeRequest(latestUserMessage)) {
    return buildOffDomainRedirectReply(latestUserMessage);
  }

  if (isPricingQuestion(latestUserMessage)) {
    if (restrictDatabasePriceExposure) {
      const pricingFallback = buildPricingDeflectionReply({ latestUserMessage, messages });
      const looksTooGeneric = /random numbers|what are you looking to create/i.test(output);
      const lacksConsultativeFlow = !/business|website|app|order|contact|consult|estimate|scope|feature/i.test(output);

      if (!output || containsPriceLikeNumbers(output) || looksTooGeneric || lacksConsultativeFlow) {
        output = pricingFallback;
      }
    }
  }

  if ((modeContext?.scenario === 'urgent_buyer' || isUrgentLead(latestUserMessage)) && needsUrgentEscalationFallback(output)) {
    output = buildUrgentEscalationReply();
  }

  if (modeContext?.scenario === 'job_seeker' && violatesJobSeekerRule(output)) {
    output = buildJobSeekerSafeReply();
  }

  output = normalizeAssistantIdentity(output, assistantName);

  return output;
}

module.exports = {
  buildDocxRulesPrompt,
  enforceOutputRules,
  isPricingQuestion,
  isPricePushback,
  isUrgentLead,
  containsPriceLikeNumbers,
  isOffDomainCodeRequest,
};
