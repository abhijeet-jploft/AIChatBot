/** Map API language codes to keys used by opening-message copy helpers (App.jsx). Unknown → english. */
export const ISO_TO_OPENING_LANG = {
  en: 'english',
  ru: 'russian',
  uk: 'ukrainian',
  ar: 'arabic',
  hi: 'hindi',
  ja: 'japanese',
  zh: 'chinese',
  ko: 'korean',
};

/** BCP-47 locale for Web Speech API (best-effort by OS). */
export const LANG_CODE_TO_BCP47 = {
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

/**
 * Pick utterance language so Cyrillic/HTML scripts are not read with an English-only voice
 * (which sounds like only Latin tokens are spoken).
 */
export function resolveBrowserSpeechBCp47(text, companyLangCode, voiceTtsOverride) {
  const t = String(text || '');
  try {
    if (/\p{Script=Cyrillic}/u.test(t)) return 'ru-RU';
    if (/\p{Script=Arabic}/u.test(t)) return 'ar-SA';
    if (/\p{Script=Devanagari}/u.test(t)) return 'hi-IN';
    if (/\p{Script=Han}/u.test(t)) return 'zh-CN';
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t)) return 'ja-JP';
    if (/\p{Script=Hangul}/u.test(t)) return 'ko-KR';
  } catch {
    // \p{Script=} may be unavailable in very old browsers
  }

  const o = String(voiceTtsOverride || '').trim().toLowerCase();
  if (o && LANG_CODE_TO_BCP47[o]) return LANG_CODE_TO_BCP47[o];

  const c = String(companyLangCode || 'en').trim().toLowerCase();
  return LANG_CODE_TO_BCP47[c] || 'en-US';
}
