// Default appearance from reference: black header, white text, reddish glow, red accent (user bubble)
const DEFAULT_COMPANY_THEMES = {
  _JP_Loft: {
    primaryColor: '#E02F3A',
    primaryDarkColor: '#B02530',
    secondaryColor: '#000000',
    secondaryLightColor: '#1A1A1A',
    headerBackground: '#000000',
    headerShadow: '0 4px 12px rgba(224, 47, 58, 0.25)',
    headerTextColor: '#FFFFFF',
  },
};

function normalizeHex(value) {
  const trimmed = String(value || '').trim();
  return /^#([0-9a-f]{6})$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function normalizeCssValue(value, maxLen = 500) {
  if (value == null || value === '') return null;
  const s = String(value).trim().slice(0, maxLen);
  return s || null;
}

const FALLBACK_DEFAULTS = {
  primaryColor: '#E02F3A',
  primaryDarkColor: '#B02530',
  secondaryColor: '#000000',
  secondaryLightColor: '#1A1A1A',
  headerBackground: '#000000',
  headerShadow: '0 4px 12px rgba(224, 47, 58, 0.25)',
  headerTextColor: '#FFFFFF',
};

function mergeCompanyTheme(companyId, theme = {}) {
  const defaults = DEFAULT_COMPANY_THEMES[companyId] || FALLBACK_DEFAULTS;
  const merged = {
    primaryColor: normalizeHex(theme.primaryColor) || defaults?.primaryColor || null,
    primaryDarkColor: normalizeHex(theme.primaryDarkColor) || defaults?.primaryDarkColor || null,
    secondaryColor: normalizeHex(theme.secondaryColor) || defaults?.secondaryColor || null,
    secondaryLightColor: normalizeHex(theme.secondaryLightColor) || defaults?.secondaryLightColor || null,
    headerBackground: normalizeCssValue(theme.headerBackground) ?? defaults?.headerBackground ?? null,
    headerShadow: normalizeCssValue(theme.headerShadow) ?? defaults?.headerShadow ?? null,
    headerTextColor: normalizeHex(theme.headerTextColor) || defaults?.headerTextColor || null,
  };

  return Object.values(merged).some((v) => v != null && v !== '') ? merged : null;
}

module.exports = {
  mergeCompanyTheme,
};
