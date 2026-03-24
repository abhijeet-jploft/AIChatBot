/** Shared theme CSS variables for visitor chat and admin operator chat (mirrors App.jsx). */

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHexColor(value) {
  const trimmed = String(value || '').trim();
  return /^#([0-9a-f]{6})$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const parts = [r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0'));
  return `#${parts.join('').toUpperCase()}`;
}

function mixHexColors(base, mixWith, ratio) {
  const a = hexToRgb(base);
  const b = hexToRgb(mixWith);
  if (!a || !b) return normalizeHexColor(base) || normalizeHexColor(mixWith) || null;
  const mix = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: a.r + (b.r - a.r) * mix,
    g: a.g + (b.g - a.g) * mix,
    b: a.b + (b.b - a.b) * mix,
  });
}

function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function buildCompanyThemeStyle(theme, mode = 'light') {
  if (!theme) return null;

  const primary = normalizeHexColor(theme.primaryColor);
  const primaryDark = normalizeHexColor(theme.primaryDarkColor) || mixHexColors(primary, '#000000', 0.35);
  const secondary = normalizeHexColor(theme.secondaryColor);
  const secondaryLight = normalizeHexColor(theme.secondaryLightColor) || mixHexColors(secondary, '#FFFFFF', 0.12);

  if (!primary || !secondary) return null;

  const headerBg = theme.headerBackground || null;
  const headerShadowVal = theme.headerShadow || null;
  const headerText = theme.headerTextColor || null;

  if (mode === 'dark') {
    const background = mixHexColors(primaryDark, '#050505', 0.78) || '#111111';
    const sidebar = mixHexColors(background, '#FFFFFF', 0.05) || background;
    const surface = mixHexColors(background, '#FFFFFF', 0.1) || '#1F1F1F';
    const border = mixHexColors(surface, '#FFFFFF', 0.18) || '#363636';
    const assistantBubble = mixHexColors(surface, '#FFFFFF', 0.03) || surface;
    const bodyText = '#F3F4F6';
    const mutedText = '#B2B7C2';

    return {
      '--chat-bg': background,
      '--chat-sidebar': sidebar,
      '--chat-surface': surface,
      '--chat-border': border,
      '--chat-text': bodyText,
      '--chat-text-heading': '#FFFFFF',
      '--chat-muted': mutedText,
      '--chat-accent': primary,
      '--chat-accent-hover': primaryDark,
      '--user-bubble': primary,
      '--user-bubble-text': '#FFFFFF',
      '--assistant-bubble': assistantBubble,
      '--input-placeholder': withAlpha(bodyText, 0.58),
      '--session-hover-bg': withAlpha('#FFFFFF', 0.08),
      '--session-active-bg': withAlpha(primary, 0.2),
      '--session-active-color': mixHexColors(primary, '#FFFFFF', 0.2) || primary,
      '--chat-header-bg': headerBg || `linear-gradient(120deg, ${primary}, ${primaryDark})`,
      '--chat-header-shadow': headerShadowVal || 'none',
      '--chat-header-text': headerText || '#FFFFFF',
      '--chat-header-gradient-start': primary,
      '--chat-header-gradient-end': primaryDark,
      '--chat-launcher-gradient-start': primary,
      '--chat-launcher-gradient-end': primaryDark,
      '--chat-launcher-shadow': withAlpha(primary, 0.55),
      '--chat-host-glow-1': withAlpha(primary, 0.18),
      '--chat-host-glow-2': withAlpha(primaryDark, 0.12),
      '--chat-host-bg-base': background,
    };
  }

  const background = secondaryLight || mixHexColors(secondary, '#F5F5FC', 0.45) || '#F5F5FC';
  const sidebar = mixHexColors(secondary, '#F8F8FF', 0.35) || '#F8F8FF';
  const surface = '#FFFFFF';
  const border = mixHexColors(primary, '#E5E7EB', 0.82) || '#E5E7EB';
  const assistantBubble = mixHexColors('#FFFFFF', secondaryLight || '#F5F5FC', 0.45) || '#FBFBFE';
  const bodyText = '#1F2937';
  const mutedText = '#6B7280';

  return {
    '--chat-bg': background,
    '--chat-sidebar': sidebar,
    '--chat-surface': surface,
    '--chat-border': border,
    '--chat-text': bodyText,
    '--chat-text-heading': '#111827',
    '--chat-muted': mutedText,
    '--chat-accent': primary,
    '--chat-accent-hover': primaryDark,
    '--user-bubble': primary,
    '--user-bubble-text': '#FFFFFF',
    '--assistant-bubble': assistantBubble,
    '--input-placeholder': withAlpha(bodyText, 0.58),
    '--session-hover-bg': withAlpha('#FFFFFF', 0.08),
    '--session-active-bg': withAlpha(primary, 0.2),
    '--session-active-color': mixHexColors(primary, '#FFFFFF', 0.2) || primary,
    '--chat-header-bg': headerBg || `linear-gradient(120deg, ${primary}, ${primaryDark})`,
    '--chat-header-shadow': headerShadowVal || 'none',
    '--chat-header-text': headerText || '#FFFFFF',
    '--chat-header-gradient-start': primary,
    '--chat-header-gradient-end': primaryDark,
    '--chat-launcher-gradient-start': primary,
    '--chat-launcher-gradient-end': primaryDark,
    '--chat-launcher-shadow': withAlpha(primary, 0.55),
    '--chat-host-glow-1': 'rgb(0 102 255 / 0.20)',
    '--chat-host-glow-2': '#E6F4ED',
    '--chat-host-bg-base': '#F5F5FC',
  };
}

export default buildCompanyThemeStyle;
