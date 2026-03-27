const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const PHONE_RE = /(\+?\d[\d\s\-()]{7,}\d)/g;
const NAME_STOP_RE = /\b(?:my|i|phone|number|email|e-mail|mail|whatsapp|from|based|located|location|budget|timeline|need|want|looking|project|service|website|app|call|contact|reach|team|company)\b/i;
const LOCATION_STOP_RE = /\b(?:yeah|yes|my|phone|number|email|e-mail|mail|whatsapp|budget|timeline|need|want|looking|project|service|call|contact|reach|name)\b/i;
const FILLER_ONLY_RE = /^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|yeah|sure|please|hii)$/i;

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCaseWords(value = '') {
  return normalizeWhitespace(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z]{2,}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function stripContactArtifacts(value = '') {
  return normalizeWhitespace(
    String(value || '')
      .replace(/\b(?:name|phone|email)\s*:\s*[^\n]+/gi, ' ')
      .replace(EMAIL_RE, ' ')
      .replace(PHONE_RE, ' ')
      .replace(/\b(?:my number is|phone number is|email is|my email is|whatsapp number is|call me at|reach me at)\b/gi, ' ')
      .replace(/[|]+/g, ' ')
  );
}

function sanitizeVisitorName(value = '') {
  let source = normalizeWhitespace(String(value || ''));
  if (!source) return '';

  source = source
    .replace(/\b(?:my name is|i am|this is|name\s*[:=-])\b/gi, ' ')
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, ' ')
    .replace(/^[^a-z]+/i, '');

  const stopMatch = source.match(NAME_STOP_RE);
  if (stopMatch && stopMatch.index > 0) {
    source = source.slice(0, stopMatch.index);
  }

  source = source
    .split(/[,:;|/]/)[0]
    .replace(/[^a-z\s.'-]/gi, ' ');

  const cleaned = normalizeWhitespace(source)
    .split(' ')
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');

  if (!cleaned || FILLER_ONLY_RE.test(cleaned)) return '';
  return titleCaseWords(cleaned);
}

function sanitizeLocation(value = '') {
  let source = normalizeWhitespace(String(value || ''));
  if (!source) return '';

  source = source
    .replace(/\b(?:from|based in|located in|location is)\b/gi, ' ')
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, ' ');

  const stopMatch = source.match(LOCATION_STOP_RE);
  if (stopMatch && stopMatch.index > 0) {
    source = source.slice(0, stopMatch.index);
  }

  source = source
    .split(/[,:;|/]/)[0]
    .replace(/\b(?:yeah|yes|ok|okay)\b/gi, ' ')
    .replace(/[^a-z\s,-]/gi, ' ');

  const cleaned = normalizeWhitespace(source)
    .split(' ')
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');

  if (!cleaned || FILLER_ONLY_RE.test(cleaned)) return '';
  return titleCaseWords(cleaned);
}

function humanizeToken(value = '') {
  return normalizeWhitespace(String(value || '').replace(/_/g, ' ')) || '';
}

function getMeaningfulUserMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => String(message?.role || '').toLowerCase() === 'user')
    .map((message) => stripContactArtifacts(message?.content || ''))
    .filter((line) => line && line.length > 12 && !FILLER_ONLY_RE.test(line));
}

function toSentence(text = '') {
  const cleaned = normalizeWhitespace(String(text || '').replace(/[.\s]+$/g, ''));
  if (!cleaned) return '';
  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
}

function extractKeyDiscussionPoints({ messages = [], projectSummary = '' } = {}) {
  const meaningfulMessages = getMeaningfulUserMessages(messages);
  
  // If we have recent messages, use them as discussion points
  if (meaningfulMessages.length > 0) {
    return meaningfulMessages.slice(-3).filter(Boolean);
  }
  
  // Fallback: if there's a project summary, try to split it into sentence-like chunks
  const cleanedSummary = stripContactArtifacts(projectSummary);
  if (!cleanedSummary) return [];
  
  // Split by sentence-ending punctuation
  const points = cleanedSummary
    .split(/[.!?]+/)
    .map(line => normalizeWhitespace(line))
    .filter(line => line && line.length > 8);
  
  return points.slice(0, 5);
}

function buildLeadRequirementSummary({ lead = {}, messages = [] } = {}) {
  const serviceRequested = normalizeWhitespace(lead.serviceRequested || lead.service_requested || '');
  const businessType = normalizeWhitespace(lead.businessType || lead.business_type || '');
  const budgetRange = normalizeWhitespace(lead.budgetRange || lead.budget_range || '');
  const timeline = normalizeWhitespace(lead.timeline || '');
  const location = sanitizeLocation(lead.location || '');
  const discussionPoints = extractKeyDiscussionPoints({ messages, projectSummary: lead.projectSummary || lead.project_summary || '' });

  const sentences = [];
  if (serviceRequested && businessType) {
    sentences.push(toSentence(`Visitor is looking for ${serviceRequested.toLowerCase()} for a ${businessType.toLowerCase()} business`));
  } else if (serviceRequested) {
    sentences.push(toSentence(`Visitor is looking for ${serviceRequested.toLowerCase()}`));
  } else if (businessType) {
    sentences.push(toSentence(`Visitor shared that the inquiry is related to a ${businessType.toLowerCase()} business`));
  }

  if (budgetRange && timeline) {
    sentences.push(toSentence(`They mentioned a budget of ${budgetRange} and a timeline of ${timeline}`));
  } else if (budgetRange) {
    sentences.push(toSentence(`They mentioned a budget of ${budgetRange}`));
  } else if (timeline) {
    sentences.push(toSentence(`They mentioned a timeline of ${timeline}`));
  }

  if (location) {
    sentences.push(toSentence(`Location shared: ${location}`));
  }

  const summary = normalizeWhitespace(sentences.filter(Boolean).join(' '));
  return summary || 'Visitor shared an initial inquiry, and the detailed scope still needs qualification.';
}

function buildConversationSummary({ lead = {}, messages = [], intentTag = '', messageCount = 0, durationSeconds = 0 } = {}) {
  const visitorIntent = humanizeToken(intentTag) || 'General inquiry';
  const requirementsDiscussed = buildLeadRequirementSummary({ lead, messages });
  const businessType = normalizeWhitespace(lead.businessType || lead.business_type || '') || null;
  const leadScoreCategory = String(lead?.lead_score_category || '').toLowerCase();
  const qualificationLevel = leadScoreCategory
    ? humanizeToken(leadScoreCategory)
    : (lead?.id ? 'Warm' : 'Cold');

  let suggestedNextAction = 'Continue qualification and confirm the scope, budget, and preferred contact method.';
  if (lead?.status === 'converted') {
    suggestedNextAction = 'Lead is already converted. Move the discussion into onboarding and project handoff.';
  } else if (lead?.status === 'proposal_sent') {
    suggestedNextAction = 'Follow up on the proposal and confirm the decision timeline with the visitor.';
  } else if (lead?.status === 'follow_up_required') {
    suggestedNextAction = 'Arrange a prompt human follow-up and confirm availability for the next conversation.';
  } else if (lead?.phone || lead?.email) {
    suggestedNextAction = 'A human agent should reach out using the captured contact details and confirm next steps.';
  }

  const text = normalizeWhitespace([
    `Intent: ${visitorIntent}`,
    `Messages: ${Number(messageCount || 0)}`,
    `Duration: ${Math.max(0, Number(durationSeconds || 0))}s`,
    requirementsDiscussed,
  ].join(' | ')).slice(0, 700);

  return {
    text,
    visitorIntent,
    businessType,
    requirementsDiscussed,
    qualificationLevel,
    suggestedNextAction,
  };
}

function pickVisitorDisplayName(...values) {
  for (const value of values) {
    const cleaned = sanitizeVisitorName(value);
    if (cleaned) return cleaned;
  }

  for (const value of values) {
    const fallback = normalizeWhitespace(value);
    if (fallback) return fallback;
  }

  return 'Anonymous visitor';
}

module.exports = {
  buildConversationSummary,
  buildLeadRequirementSummary,
  extractKeyDiscussionPoints,
  humanizeToken,
  normalizeWhitespace,
  pickVisitorDisplayName,
  sanitizeLocation,
  sanitizeVisitorName,
  stripContactArtifacts,
};