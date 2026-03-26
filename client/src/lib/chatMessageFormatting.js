const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const PHONE_RE = /(^|[^\w])((?:[+＋]|00)?\d[\d\s().\-‐‑‒–—﹣－]{6,}\d)(?=$|[^\w])/g;
const URL_RE = /(^|[^/\w])((?:https?:\/\/|www\.)[^\s<>()]+)/g;
const WHATSAPP_RE = /(\b(?:whats\s*app|whatsapp|wa)\b(?:\s+(?:number|no\.?|contact))?\s*[:=-]?\s*)((?:[+＋]|00)?\d[\d\s().\-‐‑‒–—﹣－]{6,}\d)/gi;
const UNICODE_BULLET_RE = /^([ \t]*)[•●▪◦‣⁃]\s+/;
const NAME_PATTERNS = [
  /\bmy name is\s+([a-z][a-z\s.'-]{1,60})/i,
  /\bi am\s+([a-z][a-z\s.'-]{1,60})/i,
  /\bthis is\s+([a-z][a-z\s.'-]{1,60})/i,
  /\bname\s*[:=-]\s*([a-z][a-z\s.'-]{1,60})/i,
];

function protectSegments(text) {
  const tokens = [];
  const protectedText = String(text || '').replace(/```[\s\S]*?```|`[^`\n]+`|\[[^\]]+\]\((?:\\.|[^)])+\)/g, (match) => {
    const token = `@@JPLOFT_TOKEN_${tokens.length}@@`;
    tokens.push(match);
    return token;
  });
  return { protectedText, tokens };
}

function restoreSegments(text, tokens) {
  return String(text || '').replace(/@@JPLOFT_TOKEN_(\d+)@@/g, (_match, indexText) => {
    const index = Number(indexText);
    return Number.isInteger(index) && tokens[index] ? tokens[index] : '';
  });
}

function normalizePhoneForHref(rawPhone = '') {
  const source = String(rawPhone || '').trim();
  if (!source) return '';

  const startsWithPlus = /^[+＋]/.test(source);
  const digits = source.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';

  return `${startsWithPlus ? '+' : ''}${digits}`;
}

function shouldConvertEmojiLineToBullet(text) {
  const source = String(text || '').trim();
  if (!source) return false;
  if (/[:：]\s*$/.test(source)) return false;
  if (/[:：]\s*\S/.test(source)) return true;
  if (/[?!]$/.test(source)) return true;
  return /^(please|kindly|share|provide|send|connect|best|time|preferred|no|you('| a)?ll|they('| wi)?ll|get|major|proven|industry|experienced|client|global|fuel|secure|real-time|driver|fleet|customer|push)\b/i.test(source);
}

function normalizeBulletLines(content) {
  return String(content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (UNICODE_BULLET_RE.test(line)) {
        return line.replace(UNICODE_BULLET_RE, '$1- ');
      }

      const emojiMatch = line.match(/^([ \t]*)([\p{Extended_Pictographic}\u2600-\u27BF][\p{Extended_Pictographic}\u2600-\u27BF\uFE0F\u200D]*)\s+(.*)$/u);
      if (!emojiMatch) return line;

      const [, indent, icon, rest] = emojiMatch;
      if (!shouldConvertEmojiLineToBullet(rest)) return line;
      return `${indent}- ${icon} ${rest.trim()}`;
    })
    .join('\n');
}

function escapeMarkdownLabel(text) {
  return String(text || '').replace(/[\[\]]/g, '\\$&');
}

function trimTrailingUrlPunctuation(url) {
  const source = String(url || '');
  const match = source.match(/[)\],.!?:;]+$/);
  if (!match) {
    return { cleanUrl: source, trailing: '' };
  }

  let trailing = match[0];
  let cleanUrl = source.slice(0, -trailing.length);

  while (trailing.startsWith(')')) {
    const opens = (cleanUrl.match(/\(/g) || []).length;
    const closes = (cleanUrl.match(/\)/g) || []).length;
    if (closes < opens) break;
    cleanUrl += ')';
    trailing = trailing.slice(1);
  }

  return { cleanUrl, trailing };
}

function normalizeUrlForHref(rawUrl = '') {
  const source = String(rawUrl || '').trim();
  if (!source) return '';
  const withProtocol = /^https?:\/\//i.test(source) ? source : `https://${source}`;
  try {
    const parsed = new URL(withProtocol);
    return /^https?:$/i.test(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizeWhatsappForHref(rawPhone = '') {
  const digits = normalizePhoneForHref(rawPhone).replace(/^\+/, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function linkifyContactsInMarkdown(content) {
  const { protectedText, tokens } = protectSegments(content);

  let next = protectedText.replace(URL_RE, (fullMatch, prefix, rawUrl) => {
    const { cleanUrl, trailing } = trimTrailingUrlPunctuation(rawUrl);
    const safeHref = normalizeUrlForHref(cleanUrl);
    if (!safeHref) return fullMatch;
    return `${prefix}[${escapeMarkdownLabel(cleanUrl)}](${safeHref})${trailing}`;
  });

  next = next.replace(WHATSAPP_RE, (fullMatch, label, phoneText) => {
    const href = normalizeWhatsappForHref(phoneText);
    if (!href) return fullMatch;
    return `${label}[${escapeMarkdownLabel(phoneText.trim())}](${href})`;
  });

  next = next.replace(EMAIL_RE, (match) => `[${escapeMarkdownLabel(match)}](mailto:${match})`);

  next = next.replace(PHONE_RE, (fullMatch, prefix, phoneText) => {
    const hrefPhone = normalizePhoneForHref(phoneText);
    if (!hrefPhone) return fullMatch;
    const displayPhone = phoneText.trim();
    return `${prefix}[${escapeMarkdownLabel(displayPhone)}](tel:${hrefPhone})`;
  });

  return restoreSegments(next, tokens);
}

export function sanitizeAssistantHref(rawHref = '') {
  const href = String(rawHref || '').trim();
  if (!href) return '';
  if (/^(mailto:|tel:)/i.test(href)) return href;
  try {
    const parsed = new URL(href, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    return /^https?:$/i.test(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export function preprocessAssistantMarkdown(content) {
  return linkifyContactsInMarkdown(normalizeBulletLines(content));
}

export function detectLeadCapturePrompt(content) {
  const source = String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) return false;

  const fieldMentions = [
    /\b(your name|full name|my name|name\s*[:?])\b/i,
    /\b(phone|phone number|mobile|mobile number|whatsapp|country code|best time to reach)\b/i,
    /\b(email|email address|e-mail)\b/i,
  ].filter((pattern) => pattern.test(source)).length;

  if (fieldMentions < 2) return false;

  return /\b(contact information|please share|please provide|provide these details|share these details|let me know|reach you|preferred contact method|time zone|what are you looking to build|specific technologies|technical discussion|scheduling)\b/i.test(source);
}

export function extractLeadDraftFromMessages(messages = []) {
  const userText = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === 'user')
    .map((message) => String(message?.content || ''))
    .join('\n');

  const emailMatch = userText.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i);
  const phoneMatch = userText.match(/(?:^|[^\w])((?:\+|00)?\d[\d\s().-]{6,}\d)(?=$|[^\w])/);

  let name = '';
  for (const pattern of NAME_PATTERNS) {
    const match = userText.match(pattern);
    if (match?.[1]) {
      name = match[1].trim().replace(/\s+/g, ' ').slice(0, 80);
      break;
    }
  }

  return {
    name,
    phone: phoneMatch?.[1]?.trim() || '',
    email: emailMatch?.[0]?.trim() || '',
  };
}

export function hasLeadContactInMessages(messages = []) {
  const draft = extractLeadDraftFromMessages(messages);
  return Boolean(normalizePhoneForHref(draft.phone) || draft.email);
}

export function buildLeadCaptureMessage({ name = '', phone = '', email = '' }) {
  const lines = [];
  const safeName = String(name || '').trim();
  const safePhone = String(phone || '').trim();
  const safeEmail = String(email || '').trim();

  if (safeName) lines.push(`Name: ${safeName}`);
  if (safePhone) lines.push(`Phone: ${safePhone}`);
  if (safeEmail) lines.push(`Email: ${safeEmail}`);

  return lines.join('\n');
}

export function hasUsableLeadContact({ phone = '', email = '' }) {
  return Boolean(normalizePhoneForHref(phone) || String(email || '').trim());
}