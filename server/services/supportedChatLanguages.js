/**
 * Supported visitor/chat languages (admin picker + LLM + ElevenLabs hints).
 * Primary storage: ISO 639-1 `code` in language_settings.language_primary.
 * elevenLabs: ISO code for the TTS API when supported; null = model auto-detect.
 */

const CHAT_LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English', replyName: 'English', elevenLabs: 'en' },
  { code: 'es', label: 'Spanish', replyName: 'Spanish', elevenLabs: 'es' },
  { code: 'fr', label: 'French', replyName: 'French', elevenLabs: 'fr' },
  { code: 'de', label: 'German', replyName: 'German', elevenLabs: 'de' },
  { code: 'it', label: 'Italian', replyName: 'Italian', elevenLabs: 'it' },
  { code: 'pt', label: 'Portuguese', replyName: 'Portuguese', elevenLabs: 'pt' },
  { code: 'pl', label: 'Polish', replyName: 'Polish', elevenLabs: 'pl' },
  { code: 'tr', label: 'Turkish', replyName: 'Turkish', elevenLabs: 'tr' },
  { code: 'ru', label: 'Russian', replyName: 'Russian', elevenLabs: 'ru' },
  { code: 'uk', label: 'Ukrainian', replyName: 'Ukrainian', elevenLabs: 'uk' },
  { code: 'nl', label: 'Dutch', replyName: 'Dutch', elevenLabs: 'nl' },
  { code: 'cs', label: 'Czech', replyName: 'Czech', elevenLabs: 'cs' },
  { code: 'ar', label: 'Arabic', replyName: 'Arabic', elevenLabs: 'ar' },
  { code: 'zh', label: 'Chinese', replyName: 'Chinese', elevenLabs: 'zh' },
  { code: 'ja', label: 'Japanese', replyName: 'Japanese', elevenLabs: 'ja' },
  { code: 'ko', label: 'Korean', replyName: 'Korean', elevenLabs: 'ko' },
  { code: 'hi', label: 'Hindi', replyName: 'Hindi', elevenLabs: 'hi' },
  { code: 'hu', label: 'Hungarian', replyName: 'Hungarian', elevenLabs: 'hu' },
  { code: 'fi', label: 'Finnish', replyName: 'Finnish', elevenLabs: 'fi' },
  { code: 'el', label: 'Greek', replyName: 'Greek', elevenLabs: 'el' },
  { code: 'he', label: 'Hebrew', replyName: 'Hebrew', elevenLabs: 'he' },
  { code: 'vi', label: 'Vietnamese', replyName: 'Vietnamese', elevenLabs: 'vi' },
  { code: 'no', label: 'Norwegian', replyName: 'Norwegian', elevenLabs: 'no' },
  { code: 'sv', label: 'Swedish', replyName: 'Swedish', elevenLabs: 'sv' },
  { code: 'da', label: 'Danish', replyName: 'Danish', elevenLabs: 'da' },
  { code: 'ro', label: 'Romanian', replyName: 'Romanian', elevenLabs: 'ro' },
  { code: 'id', label: 'Indonesian', replyName: 'Indonesian', elevenLabs: 'id' },
  { code: 'ms', label: 'Malay', replyName: 'Malay', elevenLabs: 'ms' },
  { code: 'fil', label: 'Filipino', replyName: 'Filipino', elevenLabs: 'fil' },
  { code: 'sk', label: 'Slovak', replyName: 'Slovak', elevenLabs: 'sk' },
  { code: 'hr', label: 'Croatian', replyName: 'Croatian', elevenLabs: 'hr' },
  { code: 'bg', label: 'Bulgarian', replyName: 'Bulgarian', elevenLabs: 'bg' },
  { code: 'ta', label: 'Tamil', replyName: 'Tamil', elevenLabs: 'ta' },
  { code: 'te', label: 'Telugu', replyName: 'Telugu', elevenLabs: 'te' },
  { code: 'bn', label: 'Bengali', replyName: 'Bengali', elevenLabs: null },
  { code: 'mr', label: 'Marathi', replyName: 'Marathi', elevenLabs: 'mr' },
  { code: 'ur', label: 'Urdu', replyName: 'Urdu', elevenLabs: null },
  { code: 'sw', label: 'Swahili', replyName: 'Swahili', elevenLabs: null },
];

const BY_CODE = new Map(CHAT_LANGUAGE_OPTIONS.map((o) => [o.code, o]));

const LEGACY_TO_CODE = new Map();
for (const o of CHAT_LANGUAGE_OPTIONS) {
  LEGACY_TO_CODE.set(o.label.toLowerCase(), o.code);
  LEGACY_TO_CODE.set(o.replyName.toLowerCase(), o.code);
}
const EXTRA_LEGACY = [
  ['english', 'en'],
  ['en-us', 'en'],
  ['en-gb', 'en'],
  ['русский', 'ru'],
  ['русский язык', 'ru'],
  ['українська', 'uk'],
  ['украинский', 'uk'],
  ['العربية', 'ar'],
  ['हिन्दी', 'hi'],
  ['हिंदी', 'hi'],
  ['日本語', 'ja'],
  ['中文', 'zh'],
  ['한국어', 'ko'],
  ['português', 'pt'],
  ['portugues', 'pt'],
];
for (const [k, v] of EXTRA_LEGACY) LEGACY_TO_CODE.set(k, v);

const REPLY_NAME_TO_CODE = new Map(CHAT_LANGUAGE_OPTIONS.map((o) => [o.replyName.toLowerCase(), o.code]));

function normalizeLanguagePrimaryToCode(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'en';
  if (BY_CODE.has(s)) return s;
  if (LEGACY_TO_CODE.has(s)) return LEGACY_TO_CODE.get(s);
  return 'en';
}

function toReplyLanguageLabel(raw) {
  const code = normalizeLanguagePrimaryToCode(raw);
  return BY_CODE.get(code)?.replyName || 'English';
}

function replyNameToLanguageCode(replyName) {
  const key = String(replyName || '').trim().toLowerCase();
  return REPLY_NAME_TO_CODE.get(key) || null;
}

function languageCodeToElevenLabs(code) {
  const c = normalizeLanguagePrimaryToCode(code);
  const el = BY_CODE.get(c)?.elevenLabs;
  return el || null;
}

/**
 * Map detected reply label (e.g. from chatRules.detectNaturalLanguageFromText) to ElevenLabs language_code.
 */
function replyLabelToElevenLabsCode(replyLabel) {
  const code = replyNameToLanguageCode(replyLabel);
  if (!code) return null;
  return languageCodeToElevenLabs(code);
}

function parseLanguageExtraLocalesJson(raw) {
  if (raw == null || raw === '') return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function normalizeLanguageExtraLocalesInput(raw, primaryCode) {
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const primary = normalizeLanguagePrimaryToCode(primaryCode);
  const allowed = new Set(CHAT_LANGUAGE_OPTIONS.map((o) => o.code));
  const next = [];
  for (const item of arr) {
    const c = normalizeLanguagePrimaryToCode(item);
    if (allowed.has(c) && c !== primary && !next.includes(c)) next.push(c);
  }
  return next.slice(0, 40);
}

function serializeLanguageExtraLocales(codes) {
  if (!codes || !codes.length) return null;
  return JSON.stringify(codes);
}

function getLanguageCatalogForClient() {
  return CHAT_LANGUAGE_OPTIONS.map(({ code, label }) => ({ code, label }));
}

const CODE_TO_BCP47 = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ru: 'ru-RU',
  uk: 'uk-UA',
  nl: 'nl-NL',
  cs: 'cs-CZ',
  ar: 'ar-SA',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  hi: 'hi-IN',
  hu: 'hu-HU',
  fi: 'fi-FI',
  el: 'el-GR',
  he: 'he-IL',
  vi: 'vi-VN',
  no: 'nb-NO',
  sv: 'sv-SE',
  da: 'da-DK',
  ro: 'ro-RO',
  id: 'id-ID',
  ms: 'ms-MY',
  fil: 'fil-PH',
  sk: 'sk-SK',
  hr: 'hr-HR',
  bg: 'bg-BG',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
};

function languageCodeToBcp47(code) {
  const c = normalizeLanguagePrimaryToCode(code);
  if (CODE_TO_BCP47[c]) return CODE_TO_BCP47[c];
  if (!c || c === 'en') return 'en-US';
  return `${c}-${c.toUpperCase()}`;
}

/** Languages commonly supported by ElevenLabs multilingual models (works on free tier with monthly credits). */
function getElevenLabsTtsLanguageCatalog() {
  return [
    { code: '', label: 'Auto — detect from message text' },
    ...CHAT_LANGUAGE_OPTIONS.filter((o) => o.elevenLabs).map(({ code, label }) => ({ code, label })),
  ];
}

/**
 * Pick ElevenLabs language_code from assistant/user text; optional voice-setting fallback before company primary.
 */
function resolveSpeechLanguageCode({
  assistantText = '',
  userText = '',
  primaryStored = 'en',
  detectFn,
  voicePreferenceCode = null,
}) {
  const det = typeof detectFn === 'function' ? detectFn : () => '';
  const label = det(assistantText) || det(userText);
  const fromConversation = label ? replyLabelToElevenLabsCode(label) : null;
  if (fromConversation) return fromConversation;

  if (voicePreferenceCode) {
    const pref = normalizeLanguagePrimaryToCode(voicePreferenceCode);
    const el = languageCodeToElevenLabs(pref);
    if (el) return el;
  }

  const primaryCode = normalizeLanguagePrimaryToCode(primaryStored);
  return languageCodeToElevenLabs(primaryCode);
}

module.exports = {
  CHAT_LANGUAGE_OPTIONS,
  normalizeLanguagePrimaryToCode,
  toReplyLanguageLabel,
  replyNameToLanguageCode,
  replyLabelToElevenLabsCode,
  languageCodeToElevenLabs,
  languageCodeToBcp47,
  getElevenLabsTtsLanguageCatalog,
  parseLanguageExtraLocalesJson,
  normalizeLanguageExtraLocalesInput,
  serializeLanguageExtraLocales,
  getLanguageCatalogForClient,
  resolveSpeechLanguageCode,
};
