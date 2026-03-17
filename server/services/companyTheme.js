const DEFAULT_COMPANY_THEMES = {
  _JP_Loft: {
    primaryColor: '#D72638',
    primaryDarkColor: '#8F1020',
    secondaryColor: '#FFFFFF',
    secondaryLightColor: '#F5F5FC',
  },
};

function normalizeHex(value) {
  const trimmed = String(value || '').trim();
  return /^#([0-9a-f]{6})$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function mergeCompanyTheme(companyId, theme = {}) {
  const defaults = DEFAULT_COMPANY_THEMES[companyId] || null;
  const merged = {
    primaryColor: normalizeHex(theme.primaryColor) || defaults?.primaryColor || null,
    primaryDarkColor: normalizeHex(theme.primaryDarkColor) || defaults?.primaryDarkColor || null,
    secondaryColor: normalizeHex(theme.secondaryColor) || defaults?.secondaryColor || null,
    secondaryLightColor: normalizeHex(theme.secondaryLightColor) || defaults?.secondaryLightColor || null,
  };

  return Object.values(merged).some(Boolean) ? merged : null;
}

module.exports = {
  mergeCompanyTheme,
};
