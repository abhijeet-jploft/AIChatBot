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
  'Job seeker: Confirm hiring, ask for resume and skills, and explain the process briefly.',
  'Wrong visitor: Politely clarify what the company does and offer a relevant alternative.',
  'Competitor or agency checking: Give safe company-level answers without exposing private client data or pricing.',
  'Feature shopper: Answer clearly, then stop checklist mode and redirect to the actual business need and consultation.',
  'Act as: Sales Executive + Product Consultant + Website Guide + Lead Generator. Not a CRM or FAQ bot.',
  'Discovery before recommendation: Always understand needs before suggesting solutions.',
  'Qualification: Budget, timeline, and requirement matter. Ask conversationally.',
  'Value building: Explain what they need instead of jumping to price.',
  'Objection handling: Handle doubts and price objections professionally. Never refuse; redirect to consultation.',
  'Upsell/cross-sell: Suggest upgrades or bundles when relevant.',
  'Contact capture: Collect name, phone, and email when moving toward conversion.',
];

function buildDocxRulesPrompt() {
  return ['Operating Rules (from product specification):', ...DOCX_RULES.map((rule) => `- ${rule}`)].join('\n');
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

function buildPricingDeflectionReply({ latestUserMessage = '', messages = [] } = {}) {
  if (isPricePushback(latestUserMessage)) {
    return [
      'I understand. I just do not want to mislead you with a random number because two similar projects can vary a lot based on features and business goals.',
      '',
      'Give me 30 seconds and I can narrow it down properly:',
      '- What kind of business is this for?',
      '- Is it a website, mobile app, or online store?',
      '- Will customers contact you, book, or order online?',
      '',
      'Once I know that, I can guide you toward the right setup and the next step for an accurate estimate.',
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

function enforceOutputRules({ latestUserMessage = '', modelText = '', messages = [] }) {
  let output = sanitizeInternalIdentifiers(modelText || '');

  if (isOffDomainCodeRequest(latestUserMessage)) {
    return buildOffDomainRedirectReply(latestUserMessage);
  }

  if (isPricingQuestion(latestUserMessage)) {
    const pricingFallback = buildPricingDeflectionReply({ latestUserMessage, messages });
    const looksTooGeneric = /random numbers|what are you looking to create/i.test(output);
    const lacksConsultativeFlow = !/business|website|app|order|contact|consult|estimate|scope|feature/i.test(output);

    if (!output || containsPriceLikeNumbers(output) || looksTooGeneric || lacksConsultativeFlow) {
      output = pricingFallback;
    }
  }

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
