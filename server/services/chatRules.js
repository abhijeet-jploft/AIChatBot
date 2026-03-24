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
  const profileId = String(options?.companyProfile?.id || 'generic_business').trim();
  const greetingRule =
    profileId === 'ecommerce_marketplace'
      ? configuredName
        ? `Greeting continuation: Use the chatbot name "${configuredName}" if you introduce yourself. Sound like a store/marketplace helper, not a software agency: offer help with products, categories, orders, delivery, returns, or navigating the site. Do not say "digital consultant" or ask what app or website the visitor wants to build unless they bring it up.`
        : 'Greeting continuation: Sound like a store or marketplace helper: offer help with products, orders, delivery, returns, or the catalog. Do not default to software-project discovery questions.'
      : configuredName
        ? `Greeting continuation: Introduce yourself using the configured chatbot name exactly as "${configuredName}" (e.g. "I'm ${configuredName}, your digital consultant.").`
        : 'Greeting continuation: Introduce yourself as the company\'s digital consultant.';
  const profileSpecificRule = profileId === 'ecommerce_marketplace'
    ? '- Marketplace behavior: Treat the company as an e-commerce store or marketplace. On greetings, offer help with products, categories, promotions, delivery, returns, pickup points, or seller information. Do not ask what website, app, or software the visitor wants to build.'
    : profileId === 'support_portal'
      ? '- Support behavior: Treat the site as a help/support destination. On greetings, offer help with FAQs, troubleshooting, account help, or support sections instead of sales discovery.'
      : '- Business behavior: Base your opening and discovery on the actual company knowledge, not a generic software-agency script.';

  return [
    'Operating Rules (from product specification):',
    ...DOCX_RULES.map((rule) => `- ${rule}`),
    `- ${greetingRule}`,
    profileSpecificRule,
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

function countMatches(text = '', re) {
  const matches = String(text || '').match(re);
  return matches ? matches.length : 0;
}

function detectNaturalLanguageFromText(text = '') {
  const sample = String(text || '').trim();
  if (!sample) return '';

  const lowered = sample.toLowerCase();
  const cyrillicCount = countMatches(sample, /\p{Script=Cyrillic}/gu);
  const arabicCount = countMatches(sample, /\p{Script=Arabic}/gu);
  const devanagariCount = countMatches(sample, /\p{Script=Devanagari}/gu);
  const hanCount = countMatches(sample, /\p{Script=Han}/gu);
  const hiraganaKatakanaCount = countMatches(sample, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const hangulCount = countMatches(sample, /\p{Script=Hangul}/gu);

  if (cyrillicCount >= 2) return 'Russian';
  if (arabicCount >= 2) return 'Arabic';
  if (devanagariCount >= 2) return 'Hindi';
  if (hangulCount >= 2) return 'Korean';
  if (hiraganaKatakanaCount >= 2) return 'Japanese';
  if (hanCount >= 2) return 'Chinese';

  if (/\b(привет|здравствуйте|спасибо|цена|стоимость|доставка|товар|каталог|помощь|нет|да)\b/i.test(lowered)) return 'Russian';
  if (/\b(hello|hi|thanks|price|cost|delivery|catalog|support|website|app)\b/i.test(lowered)) return 'English';

  return '';
}

const {
  normalizeLanguagePrimaryToCode,
  toReplyLanguageLabel,
  replyNameToLanguageCode,
} = require('./supportedChatLanguages');

function normalizeLanguageLabel(language = '') {
  const label = toReplyLanguageLabel(language);
  return label || String(language || '').trim();
}

function languageAllowedForReply(replyLabel, primaryRaw, extraLocales, multiEnabled) {
  if (!replyLabel) return true;
  const code = replyNameToLanguageCode(replyLabel);
  if (!code) return true;
  if (!multiEnabled || !Array.isArray(extraLocales) || !extraLocales.length) return true;
  const primaryCode = normalizeLanguagePrimaryToCode(primaryRaw);
  const allowed = new Set([primaryCode, ...extraLocales.map((c) => normalizeLanguagePrimaryToCode(c))]);
  return allowed.has(code);
}

function resolveReplyLanguage({
  latestUserMessage = '',
  companyPrimaryLanguage = '',
  context = '',
  languageMultiEnabled = false,
  languageAutoDetectEnabled = true,
  languageExtraLocales = null,
} = {}) {
  const primaryLabel = toReplyLanguageLabel(companyPrimaryLanguage);
  const userLanguage = languageAutoDetectEnabled !== false
    ? detectNaturalLanguageFromText(latestUserMessage)
    : '';

  if (userLanguage && languageAllowedForReply(userLanguage, companyPrimaryLanguage, languageExtraLocales, languageMultiEnabled)) {
    return userLanguage;
  }

  if (userLanguage && languageMultiEnabled && Array.isArray(languageExtraLocales) && languageExtraLocales.length) {
    return primaryLabel;
  }

  if (userLanguage) return userLanguage;

  const configuredLanguage = normalizeLanguageLabel(companyPrimaryLanguage);
  if (configuredLanguage) return configuredLanguage;

  const contextLanguage = detectNaturalLanguageFromText(String(context || '').slice(0, 12000));
  if (contextLanguage && languageAllowedForReply(contextLanguage, companyPrimaryLanguage, languageExtraLocales, languageMultiEnabled)) {
    return contextLanguage;
  }

  return languageMultiEnabled ? 'the user\'s language' : primaryLabel;
}

function buildLanguageInstruction(options = {}) {
  const replyLanguage = resolveReplyLanguage(options);
  const multiEnabled = options?.languageMultiEnabled === true;
  const autoDetectEnabled = options?.languageAutoDetectEnabled !== false;
  const primaryLabel = toReplyLanguageLabel(options?.companyPrimaryLanguage || 'en');
  const extra = Array.isArray(options?.languageExtraLocales) ? options.languageExtraLocales : [];

  let whitelistNote = '';
  if (multiEnabled && extra.length) {
    const labels = [primaryLabel, ...extra.map((c) => toReplyLanguageLabel(c))];
    whitelistNote = ` Allowed reply languages: ${labels.join(', ')}. If the visitor writes in another language, answer in ${primaryLabel} unless they switch to one of the allowed languages.`;
  }

  if (multiEnabled && autoDetectEnabled) {
    return `Language behavior: Reply in ${replyLanguage}. When the user writes in a clear language, match that language when it is among the allowed languages.${whitelistNote} If the user's language is unclear, use ${primaryLabel}.`;
  }

  return `Language behavior: Reply in ${replyLanguage}.${whitelistNote} Stay in ${primaryLabel} unless multi-language rules above allow switching. Do not switch to English unless the user asks for English or the knowledge base is only in English.`;
}

/**
 * Guess visitor-facing language from scraped training text (for opening copy when DB primary is still English).
 */
function inferTrainingContentLanguageHint(context = '') {
  const sample = String(context || '').trim().slice(0, 80000);
  if (!sample) return '';
  const detected = detectNaturalLanguageFromText(sample);
  return detected ? normalizeLanguageLabel(detected) : '';
}

function inferCompanyProfile({ context = '' } = {}) {
  const raw = String(context || '');
  const text = raw.toLowerCase();
  if (!text.trim()) {
    return { id: 'generic_business', label: 'Generic business website' };
  }

  // Scraper template lines often mention "consultation"; that must not imply a dev agency.
  const stripped = text.replace(
    /you are a helpful ai sales assistant[^.]{0,220}?(consultation|booking)\b[^.]{0,80}\./gi,
    ' '
  );

  const softwareScore = countMatches(
    stripped,
    /\b(app development|website development|software development|mobile app|web apps?|case stud(ies|y)?|hire developers|project scope|tech stack|development company|digital agency|saas platform|crm implementation|erp implementation)\b/gi
  ) + countMatches(stripped, /\b(we build (?:websites|apps|software)|custom software development|mvp development)\b/gi);

  // Cyrillic + Latin retail cues (inflected forms; avoid relying on \b with Cyrillic).
  const ecommerceScore = countMatches(
    stripped,
    /(интернет[\s_-]магазин|онлайн[\s_-]магазин|маркетплейс|wildberries|wild[\s_.-]?berries|вайлдберриз|\bwb\.ru|ozon|ламод|каталог|корзин|доставк|возврат|личн(ый|ого) кабинет|оформлени[ея] заказ|добавить в корзин|оплат[аы]|товар|товары|товаров|скидк|распродаж|акци|бренд|покупател|продавц|продаж|купить|заказ|ассортимент|пункт(ы)? выдачи|pickup point|shopping cart|add to cart|checkout|e-commerce|ecommerce|marketplace|online store|free shipping|\border\b|\bdelivery\b|\breturns?\b|\bproducts?\b|\bshop\b|\bstore\b)/gi
  );

  const urlBoost = /(wildberries\.ru|[/.]wildberries\.|ozon\.ru|market\.yandex|aliexpress\.|\/catalog\/|\/product\/|\/category\/|\/cart|\/basket|\/checkout)/i.test(raw)
    ? 5
    : 0;

  const effectiveEcom = ecommerceScore + urlBoost;

  const supportScore = countMatches(text, /\b(faq|help center|knowledge base|support center|troubleshooting|help|вопросы и ответы|поддержк|справк)\b/gi);

  if (effectiveEcom >= Math.max(3, softwareScore)) {
    return { id: 'ecommerce_marketplace', label: 'E-commerce marketplace' };
  }
  if (softwareScore >= Math.max(3, effectiveEcom + 1)) {
    return { id: 'software_services', label: 'Software or digital services company' };
  }
  if (supportScore >= 3) {
    return { id: 'support_portal', label: 'Support or knowledge-base site' };
  }
  return { id: 'generic_business', label: 'Generic business website' };
}

function buildBusinessProfilePrompt(profile = { id: 'generic_business' }) {
  if (profile?.id === 'ecommerce_marketplace') {
    return [
      'Business profile: This company is an e-commerce marketplace or online store, not a software development agency.',
      'Primary visitor intents: browsing products, finding categories, checking promotions, delivery, returns, pickup points, account help, seller information, and business purchasing.',
      'Greeting behavior: When the user says only hello or sends a short greeting, briefly explain what the store offers and ask what they need help with on the site.',
      'Do not ask what website, app, or software they want to build unless the user explicitly asks about business services, seller tools, or technical implementation.',
    ].join('\n');
  }

  if (profile?.id === 'support_portal') {
    return [
      'Business profile: This company site is primarily a support or help destination.',
      'Greeting behavior: On simple greetings, offer help with FAQs, processes, troubleshooting, or relevant help sections from the site.',
      'Do not pivot to sales discovery unless the user clearly asks about buying or commercial services.',
    ].join('\n');
  }

  if (profile?.id === 'software_services') {
    return [
      'Business profile: This company appears to provide software, web, app, or digital services.',
      'Discovery behavior: Requirement discovery and consultative qualification are appropriate when the user is exploring services.',
    ].join('\n');
  }

  return [
    'Business profile: This is a general business website.',
    'Do not assume the company sells software development services unless the knowledge base clearly indicates that.',
    'On short greetings, start with what the company/site can help with based on the available knowledge base.',
  ].join('\n');
}

function isGreetingOnlyMessage(text = '') {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return /^(hi|hello|hey|hola|bonjour|привет|здравствуй|здравствуйте|добрый день|добрый вечер|салам|ассаламу алейкум)[!.?\s]*$/i.test(normalized);
}

function looksLikeSoftwareAgencyFallback(text = '') {
  return /(what (are|r) you looking to create|website for your business|mobile app|веб-сайт|мобильн(ое|ого) приложени|digital solutions|something you can create|just exploring ideas|digital consultant|решени(е|я) для своего бизнеса|наших услуг|изучаете возможности|what do you want to build|что вы хотите создать|business solution|our services)/i.test(String(text || ''));
}

function buildGreetingReplyForProfile({ replyLanguage = 'English', companyProfile = { id: 'generic_business' } } = {}) {
  const language = normalizeLanguageLabel(replyLanguage).toLowerCase();

  if (companyProfile?.id === 'ecommerce_marketplace') {
    if (language === 'russian') {
      return [
        'Здравствуйте! Я могу помочь по сайту магазина: с товарами и категориями, акциями, доставкой, возвратом, пунктами выдачи, вопросами по продавцам и покупками для бизнеса.',
        '',
        'Что именно вас интересует?'
      ].join('\n');
    }

    return [
      'Hello! I can help with the store website: products and categories, promotions, delivery, returns, pickup points, seller information, and business purchasing.',
      '',
      'What would you like help with?'
    ].join('\n');
  }

  if (companyProfile?.id === 'support_portal') {
    if (language === 'russian') {
      return 'Здравствуйте! Я помогу найти нужную информацию, ответы на частые вопросы или раздел поддержки. Что вы хотите уточнить?';
    }
    return 'Hello! I can help you find the right information, FAQs, or support section. What would you like to check?';
  }

  return '';
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
  companyProfile = null,
  companyPrimaryLanguage = '',
  languageConfig = {},
  context = '',
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

  if (isGreetingOnlyMessage(latestUserMessage) && companyProfile?.id === 'ecommerce_marketplace') {
    const greetingReply = buildGreetingReplyForProfile({
      replyLanguage: resolveReplyLanguage({
        latestUserMessage,
        companyPrimaryLanguage,
        languageMultiEnabled: languageConfig?.multiEnabled,
        languageAutoDetectEnabled: languageConfig?.autoDetectEnabled,
        context,
      }),
      companyProfile,
    });
    if (greetingReply) {
      return greetingReply;
    }
  }

  if (isGreetingOnlyMessage(latestUserMessage) && looksLikeSoftwareAgencyFallback(output)) {
    const greetingReply = buildGreetingReplyForProfile({
      replyLanguage: resolveReplyLanguage({
        latestUserMessage,
        companyPrimaryLanguage,
        languageMultiEnabled: languageConfig?.multiEnabled,
        languageAutoDetectEnabled: languageConfig?.autoDetectEnabled,
        context,
      }),
      companyProfile,
    });
    if (greetingReply) {
      output = greetingReply;
    }
  }

  return output;
}

module.exports = {
  buildBusinessProfilePrompt,
  buildDocxRulesPrompt,
  buildLanguageInstruction,
  detectNaturalLanguageFromText,
  enforceOutputRules,
  inferCompanyProfile,
  inferTrainingContentLanguageHint,
  isPricingQuestion,
  isPricePushback,
  isUrgentLead,
  containsPriceLikeNumbers,
  isOffDomainCodeRequest,
};
