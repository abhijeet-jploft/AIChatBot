/**
 * Must stay in sync with server/services/supportedChatLanguages.js CHAT_LANGUAGE_OPTIONS (code + label).
 */
export const CHAT_LANGUAGE_OPTIONS = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'cs', label: 'Czech' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'fi', label: 'Finnish' },
  { code: 'el', label: 'Greek' },
  { code: 'he', label: 'Hebrew' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'no', label: 'Norwegian' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'ro', label: 'Romanian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'fil', label: 'Filipino' },
  { code: 'sk', label: 'Slovak' },
  { code: 'hr', label: 'Croatian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'sw', label: 'Swahili' },
]);

/**
 * Maps ISO-style primary codes to opening-message keys in App.jsx `buildOpeningCopy`.
 * Codes not listed fall through App.jsx logic and default to English.
 */
export const ISO_TO_OPENING_LANG = Object.freeze({
  en: 'english',
  'en-us': 'english',
  'en-gb': 'english',
  ru: 'russian',
  'ru-ru': 'russian',
  uk: 'ukrainian',
  'uk-ua': 'ukrainian',
  ar: 'arabic',
  hi: 'hindi',
  ja: 'japanese',
  'ja-jp': 'japanese',
  zh: 'chinese',
  'zh-cn': 'chinese',
  'zh-tw': 'chinese',
  ko: 'korean',
  'ko-kr': 'korean',
});

/** ISO 639-1 (or short code) → BCP-47 for SpeechSynthesis; aligned with client/public/chat-widget.js LANG_BCP47 */
const ISO_TO_BCP47 = Object.freeze({
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
  bn: 'bn-IN',
  ur: 'ur-PK',
  sw: 'sw-KE',
});

/**
 * Pick a BCP-47 language tag for the browser TTS engine from message script, voice override, or company primary.
 */
export function resolveBrowserSpeechBCp47(speechText, companyLangCode, ttsOverride) {
  const t = String(speechText || '');
  try {
    if (/\p{Script=Cyrillic}/u.test(t)) return 'ru-RU';
    if (/\p{Script=Arabic}/u.test(t)) return 'ar-SA';
    if (/\p{Script=Devanagari}/u.test(t)) return 'hi-IN';
    if (/\p{Script=Han}/u.test(t)) return 'zh-CN';
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t)) return 'ja-JP';
    if (/\p{Script=Hangul}/u.test(t)) return 'ko-KR';
  } catch {
    /* engines without Unicode property escapes */
  }

  const over = String(ttsOverride ?? '').trim().toLowerCase();
  if (over && over !== 'auto') {
    if (ISO_TO_BCP47[over]) return ISO_TO_BCP47[over];
    const overBase = over.split('-')[0];
    if (ISO_TO_BCP47[overBase]) return ISO_TO_BCP47[overBase];
    if (/^[a-z]{2,3}-[a-z]{2,3}$/i.test(over)) {
      const [lang, region] = over.split('-');
      return `${lang.toLowerCase()}-${region.toUpperCase()}`;
    }
  }

  const raw = String(companyLangCode || 'en').trim().toLowerCase();
  const base = raw.split('-')[0];
  return ISO_TO_BCP47[base] || 'en-US';
}
