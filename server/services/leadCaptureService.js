const Lead = require('../models/Lead');
const {
  buildLeadRequirementSummary,
  normalizeWhitespace,
  sanitizeLocation,
  sanitizeVisitorName,
} = require('./conversationInsights');

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_RE = /(\+?\d[\d\s\-()]{8,}\d)/;
const CONSULTATION_RE = /\b(consult|consultation|discuss project|project discussion|quick call)\b/i;
const PRICING_RE = /\b(price|pricing|quote|quotation|estimate|cost|budget)\b/i;
const CONTACT_RE = /\b(contact me|call me|reach me|reach out|get back to me|follow up)\b/i;
const MEETING_RE = /\b(book(?:ing)?|schedule|arrange)\b[^\n]{0,30}\b(meeting|call|demo|consultation)\b/i;
const URGENCY_RE = /\b(urgent|asap|immediately|priority|deadline|this week|today|tomorrow)\b/i;
const BUDGET_RE = /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:-|to)\s*(?:[$€£₹])?\s?\d[\d,]*(?:\.\d+)?)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|inr|eur|gbp|k|m)\b)/i;
const TIMELINE_RE = /\b(?:\d+\s*(?:day|days|week|weeks|month|months)|asap|urgent|this week|next week|next month)\b/i;

// Note: `/i` does not make `[a-z]` match A–Z; first letter must allow uppercase (e.g. "Name: John").
// `(?!at\b)` avoids "I'm at…" / "call me at…" matching as a name.
const NAME_PATTERNS = [
  /\bmy name is\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i,
  /\bi am\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i,
  /\bthis is\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i,
  /\bname\s*[:=-]\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i,
  /\bi(?:'|’|')m\s+(?!at\b)([A-Za-z][A-Za-z\s.'-]{1,60})/i,
  /\bcall me\s+(?!at\b)([A-Za-z][A-Za-z\s.'-]{1,60})/i,
  /\byou can call me\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i,
];

const LOOSE_NAME_REJECT = new Set(['at', 'the', 'a', 'an', 'or', 'and', 'to', 'in', 'on', 'for', 'me', 'it', 'is', 'be', 'as']);

function looseLeadNameFromRaw(raw) {
  let s = normalizeWhitespace(String(raw || '').split(/[,:;|/\n]/)[0]);
  if (!s || /@/.test(s)) return '';

  s = s
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, ' ');
  s = normalizeWhitespace(s.replace(/[^\p{L}\s.'-]/gu, ' '));
  const words = s.split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return '';
  const letters = words.join('').replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return '';
  if (words.length === 1 && LOOSE_NAME_REJECT.has(words[0].toLowerCase())) return '';

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function finalizeExtractedName(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  const strict = sanitizeVisitorName(trimmed);
  if (strict) return strict;

  return looseLeadNameFromRaw(trimmed);
}

function normalizePhone(raw = '') {
  const cleaned = String(raw).replace(/[^\d+]/g, '');
  if (!cleaned) return '';

  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';

  return hasPlus ? `+${digits}` : digits;
}

function extractEmail(text = '') {
  const match = String(text).match(EMAIL_RE);
  return match ? match[0].toLowerCase() : '';
}

function extractPhone(text = '') {
  const match = String(text).match(PHONE_RE);
  return match ? normalizePhone(match[1]) : '';
}

function extractName(text = '') {
  const source = String(text || '');

  const structured = source.match(/^\s*name\s*:\s*(.+)$/im);
  if (structured?.[1]) {
    const fromLine = finalizeExtractedName(structured[1].trim());
    if (fromLine) return fromLine;
  }

  for (const pattern of NAME_PATTERNS) {
    const match = source.match(pattern);
    if (match && match[1]) {
      const resolved = finalizeExtractedName(match[1]);
      if (resolved) return resolved;
    }
  }
  return '';
}

function extractLocation(text = '') {
  const match = String(text).match(/\b(?:from|based in|located in|location is)\s+([a-z][a-z\s,-]{1,80})/i);
  return match ? sanitizeLocation(match[1]) : '';
}

function extractBusinessType(text = '') {
  const match = String(text).match(/\b(?:my|our)\s+([a-z][a-z\s]{1,40})\s+(?:business|company|startup|agency|store|clinic|restaurant)\b/i);
  return match ? match[1].trim().replace(/\s+/g, ' ') : '';
}

function extractBudgetRange(text = '') {
  const explicit = String(text).match(BUDGET_RE);
  if (explicit) return explicit[0].trim();

  const qualitative = String(text).match(/\b(low|medium|high)\s+budget\b/i);
  return qualitative ? qualitative[0].trim() : '';
}

function extractTimeline(text = '') {
  const match = String(text).match(TIMELINE_RE);
  return match ? match[0].trim() : '';
}

function inferServiceRequested(text = '') {
  const source = String(text).toLowerCase();
  if (/\bmobile app|android app|ios app\b/.test(source)) return 'Mobile App Development';
  if (/\becommerce|online store|shop\b/.test(source)) return 'E-commerce Development';
  if (/\bwebsite|web site|landing page\b/.test(source)) return 'Website Development';
  if (/\bcrm|erp|dashboard\b/.test(source)) return 'Custom Software Development';
  if (/\bai agent|chatbot|ai chatbot\b/.test(source)) return 'AI Chatbot Development';
  return '';
}

function inferDeviceType(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|android|iphone/.test(ua)) return 'mobile';
  return 'desktop';
}

function parseBrowserFromUA(userAgent = '') {
  const ua = String(userAgent || '');
  if (!ua) return '';
  // Order matters — check specific browsers before generic engines
  const browsers = [
    [/Edg(?:e|A|iOS)?\/(\S+)/, 'Edge'],
    [/OPR\/(\S+)|Opera\/(\S+)/, 'Opera'],
    [/SamsungBrowser\/(\S+)/, 'Samsung Browser'],
    [/UCBrowser\/(\S+)/, 'UC Browser'],
    [/Brave/, 'Brave'],
    [/Vivaldi\/(\S+)/, 'Vivaldi'],
    [/YaBrowser\/(\S+)/, 'Yandex'],
    [/Firefox\/(\S+)/, 'Firefox'],
    [/CriOS\/(\S+)/, 'Chrome'],
    [/FxiOS\/(\S+)/, 'Firefox'],
    [/Chrome\/(\S+)/, 'Chrome'],
    [/Safari\/(\S+).*Version\/(\S+)/, 'Safari'],
    [/Safari\/(\S+)/, 'Safari'],
  ];
  for (const [re, name] of browsers) {
    const m = ua.match(re);
    if (m) {
      const version = (m[1] || m[2] || '').split('.').slice(0, 2).join('.');
      return version ? `${name} ${version}` : name;
    }
  }
  return '';
}

function parseOSFromUA(userAgent = '') {
  const ua = String(userAgent || '');
  if (!ua) return '';
  if (/Windows NT 10/.test(ua)) return /Windows NT 10.*Win64|WOW64/.test(ua) ? 'Windows 10/11' : 'Windows 10';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Windows/.test(ua)) return 'Windows';
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+)/);
  if (macMatch) return `macOS ${macMatch[1].replace(/_/g, '.')}`;
  if (/Macintosh|Mac OS/.test(ua)) return 'macOS';
  if (/iPhone|iPad|iPod/.test(ua)) {
    const iosMatch = ua.match(/OS (\d+[._]\d+)/);
    return iosMatch ? `iOS ${iosMatch[1].replace(/_/g, '.')}` : 'iOS';
  }
  const androidMatch = ua.match(/Android (\d+\.?\d*)/);
  if (androidMatch) return `Android ${androidMatch[1]}`;
  if (/Linux/.test(ua)) return 'Linux';
  if (/CrOS/.test(ua)) return 'Chrome OS';
  return '';
}

function buildProjectSummary(messages = []) {
  return buildLeadRequirementSummary({ messages });
}

function inferIntent(flags = {}) {
  if (flags.meetingRequested) return 'meeting_booking';
  if (flags.consultationRequested) return 'consultation_request';
  if (flags.pricingRequested) return 'pricing_request';
  if (flags.contactRequested) return 'contact_request';
  if (flags.highIntent) return 'high_intent';
  return 'general_inquiry';
}

function inferContactMethod({ phone, email, contactRequested, meetingRequested }) {
  if (phone && email) return 'whatsapp/email/call';
  if (phone) return 'whatsapp/call';
  if (email) return 'email';
  if (meetingRequested || contactRequested) return 'call';
  return 'unknown';
}

function scoreLead({
  hasPhone,
  hasEmail,
  hasName,
  consultationRequested,
  pricingRequested,
  contactRequested,
  meetingRequested,
  urgencyMentioned,
  budgetMentioned,
  timelineMentioned,
  highIntent,
  userMessageCount,
}) {
  let score = 0;

  if (hasPhone) score += 30;
  if (hasEmail) score += 22;
  if (hasName) score += 8;
  if (consultationRequested) score += 18;
  if (meetingRequested) score += 20;
  if (contactRequested) score += 12;
  if (urgencyMentioned) score += 14;
  if (budgetMentioned) score += 10;
  if (timelineMentioned) score += 10;
  if (pricingRequested) score += 5;
  if (highIntent) score += 12;
  if (userMessageCount <= 2) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function findLatestUserMessage(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return String(messages[i]?.content || '');
  }
  return '';
}

function deriveLeadFromConversation({ messages = [], requestMeta = {} }) {
  const userMessages = messages.filter((m) => m?.role === 'user').map((m) => String(m.content || ''));
  const latestUserMessage = findLatestUserMessage(messages);
  const allUserText = userMessages.join('\n');

  const name = extractName(allUserText);
  const phone = extractPhone(allUserText);
  const email = extractEmail(allUserText);
  const location = extractLocation(allUserText);
  const businessType = extractBusinessType(allUserText);
  const budgetRange = extractBudgetRange(allUserText);
  const timeline = extractTimeline(allUserText);
  const serviceRequested = inferServiceRequested(allUserText || latestUserMessage);
  const projectSummary = buildLeadRequirementSummary({
    lead: {
      location,
      business_type: businessType,
      service_requested: serviceRequested,
      budget_range: budgetRange,
      timeline,
    },
    messages,
  });

  const consultationRequested = CONSULTATION_RE.test(latestUserMessage);
  const pricingRequested = PRICING_RE.test(latestUserMessage);
  const contactRequested = CONTACT_RE.test(latestUserMessage);
  const meetingRequested = MEETING_RE.test(latestUserMessage);
  const urgencyMentioned = URGENCY_RE.test(allUserText);
  const budgetMentioned = Boolean(budgetRange);
  const timelineMentioned = Boolean(timeline);
  const highIntent = /\b(start|ready to start|need this|project|timeline|budget|proposal|convert|launch)\b/i.test(allUserText)
    || meetingRequested
    || consultationRequested
    || urgencyMentioned;

  const leadScore = scoreLead({
    hasPhone: Boolean(phone),
    hasEmail: Boolean(email),
    hasName: Boolean(name),
    consultationRequested,
    pricingRequested,
    contactRequested,
    meetingRequested,
    urgencyMentioned,
    budgetMentioned,
    timelineMentioned,
    highIntent,
    userMessageCount: userMessages.length,
  });

  const aiDetectedIntent = inferIntent({
    consultationRequested,
    pricingRequested,
    contactRequested,
    meetingRequested,
    highIntent,
  });

  const contactMethod = inferContactMethod({
    phone,
    email,
    contactRequested,
    meetingRequested,
  });

  const landingPage = requestMeta.pageUrl || requestMeta.referer || requestMeta.origin || '';
  const deviceType = inferDeviceType(requestMeta.userAgent);
  const browser = parseBrowserFromUA(requestMeta.userAgent);
  const osName = parseOSFromUA(requestMeta.userAgent);
  const ipAddress = requestMeta.ipAddress || '';
  const messageEnquiry = latestUserMessage.slice(0, 2000);

  return {
    name,
    phone,
    email,
    location,
    businessType,
    budgetRange,
    timeline,
    serviceRequested,
    projectSummary,
    aiDetectedIntent,
    contactMethod,
    leadScore,
    landingPage,
    deviceType,
    browser,
    osName,
    ipAddress,
    messageEnquiry,
    flags: {
      consultationRequested,
      pricingRequested,
      contactRequested,
      meetingRequested,
      urgencyMentioned,
      budgetMentioned,
      timelineMentioned,
      highIntent,
      userMessageCount: userMessages.length,
    },
  };
}

async function captureLeadFromConversation({ companyId, sessionId, messages = [], requestMeta = {} }) {
  if (!companyId || !sessionId || !Array.isArray(messages) || messages.length === 0) {
    return { captured: false, reason: 'missing_context' };
  }

  const inferred = deriveLeadFromConversation({ messages, requestMeta });
  const userMessages = messages.filter((m) => m?.role === 'user').map((m) => String(m.content || ''));

  // Lead capture: only when we can reach the visitor — email or mobile (phone).
  // Name alone, pricing/consultation/meeting asks, or generic high intent do NOT create a lead.
  const hasContact = Boolean(inferred.email) || Boolean(inferred.phone);
  if (!hasContact) {
    return { captured: false, reason: 'no_contact_details' };
  }

  const { lead, inserted, previousStatus } = await Lead.upsertCapturedLead({
    companyId,
    sessionId,
    name: inferred.name,
    phone: inferred.phone,
    email: inferred.email,
    location: inferred.location,
    businessType: inferred.businessType,
    serviceRequested: inferred.serviceRequested,
    projectSummary: inferred.projectSummary,
    budgetRange: inferred.budgetRange,
    timeline: inferred.timeline,
    landingPage: inferred.landingPage,
    deviceType: inferred.deviceType,
    aiDetectedIntent: inferred.aiDetectedIntent,
    leadScore: inferred.leadScore,
    contactMethod: inferred.contactMethod,
    messageEnquiry: inferred.messageEnquiry,
    ipAddress: inferred.ipAddress,
    ipCountry: requestMeta.ipCountry || '',
    ipCityState: requestMeta.ipCityState || '',
    browser: inferred.browser,
    osName: inferred.osName,
  });

  if (!lead) {
    return { captured: false, reason: 'upsert_failed' };
  }

  if (inserted) {
    await Lead.addStatusHistory(lead.id, previousStatus, lead.status || 'new');
    await Lead.addActivity(
      lead.id,
      'lead_created',
      'Lead captured automatically from chatbot conversation.',
      {
        aiDetectedIntent: inferred.aiDetectedIntent,
        leadScore: inferred.leadScore,
        contactMethod: inferred.contactMethod,
      }
    );
  }

  return {
    captured: true,
    inserted,
    leadId: lead.id,
    lead,
  };
}

module.exports = {
  captureLeadFromConversation,
  deriveLeadFromConversation,
  normalizePhone,
};
