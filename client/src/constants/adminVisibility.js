const DEFAULT_ADMIN_VISIBILITY = Object.freeze({
  fixed: {
    basicCompanySettings: true,
    themeSettings: true,
  },
  settings: {
    chatLanguages: true,
    autoTrigger: true,
    escalation: true,
    safety: true,
  },
  aiMode: true,
  voice: {
    enableVoiceMode: true,
    enableVoiceResponse: true,
    ignoreEmoji: true,
    spokenLanguage: true,
    presetVoices: true,
    trainCustomVoice: true,
    allowedPresetVoiceKeys: {},
  },
});

const GLOBAL_VOICE_SCOPE = '__global__';
const AUTO_VOICE_SCOPE = '__auto__';

function sanitizePresetVoiceAccessKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]+:(female|male)$/.test(key) ? key : null;
}

function normalizePresetVoiceLanguageScope(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return AUTO_VOICE_SCOPE;
  if (raw === GLOBAL_VOICE_SCOPE || raw === 'global') return GLOBAL_VOICE_SCOPE;
  if (raw === AUTO_VOICE_SCOPE || raw === 'auto') return AUTO_VOICE_SCOPE;
  return /^[a-z0-9_-]+$/.test(raw) ? raw : null;
}

function sanitizeAllowedVoiceKeyList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => sanitizePresetVoiceAccessKey(entry)).filter(Boolean)));
}

function normalizeAllowedPresetVoiceKeys(rawValue) {
  if (rawValue == null) return {};

  if (Array.isArray(rawValue)) {
    const cleaned = sanitizeAllowedVoiceKeyList(rawValue);
    return cleaned.length ? { [GLOBAL_VOICE_SCOPE]: cleaned } : {};
  }

  if (!rawValue || typeof rawValue !== 'object') return {};

  return Object.entries(rawValue).reduce((acc, [scope, keys]) => {
    const normalizedScope = normalizePresetVoiceLanguageScope(scope);
    if (!normalizedScope) return acc;
    const cleanedKeys = sanitizeAllowedVoiceKeyList(keys);
    if (cleanedKeys.length) {
      acc[normalizedScope] = cleanedKeys;
    }
    return acc;
  }, {});
}

export function buildPresetVoiceAccessKey(profileId, gender) {
  const normalizedProfileId = String(profileId || '').trim().toLowerCase();
  const normalizedGender = String(gender || '').trim().toLowerCase() === 'male' ? 'male' : 'female';
  return `${normalizedProfileId}:${normalizedGender}`;
}

export function mergeAdminVisibility(rawVisibility) {
  const voiceAllowedPresetVoiceKeys = normalizeAllowedPresetVoiceKeys(rawVisibility?.voice?.allowedPresetVoiceKeys);

  return {
    fixed: {
      ...DEFAULT_ADMIN_VISIBILITY.fixed,
      ...(rawVisibility?.fixed || {}),
    },
    settings: {
      ...DEFAULT_ADMIN_VISIBILITY.settings,
      ...(rawVisibility?.settings || {}),
    },
    aiMode: rawVisibility?.aiMode ?? DEFAULT_ADMIN_VISIBILITY.aiMode,
    voice: {
      ...DEFAULT_ADMIN_VISIBILITY.voice,
      ...(rawVisibility?.voice || {}),
      allowedPresetVoiceKeys: voiceAllowedPresetVoiceKeys,
    },
  };
}

export function hasAnyVoiceSettingAccess(adminVisibility) {
  const merged = mergeAdminVisibility(adminVisibility);
  return Boolean(
    merged.voice.enableVoiceMode
    || merged.voice.enableVoiceResponse
    || merged.voice.ignoreEmoji
    || merged.voice.spokenLanguage
    || merged.voice.presetVoices
    || merged.voice.trainCustomVoice
  );
}

export function getPresetVoiceOptions(catalog) {
  if (!Array.isArray(catalog)) return [];

  const rows = [];
  catalog.forEach((profile) => {
    const profileId = String(profile?.id || '').trim().toLowerCase();
    const profileLabel = String(profile?.label || '').trim() || profileId;
    if (!profileId || profileId === 'custom') return;

    ['female', 'male'].forEach((gender) => {
      const voiceName = String(profile?.voices?.[gender]?.label || '').trim();
      if (!voiceName) return;
      rows.push({
        key: buildPresetVoiceAccessKey(profileId, gender),
        profileId,
        profileLabel,
        gender,
        voiceName,
      });
    });
  });

  return rows;
}

export function resolveAllowedPresetVoiceKeys(allowedPresetVoiceKeys, languageCode, catalog) {
  const allKeys = getPresetVoiceOptions(catalog).map((row) => row.key);
  const normalized = normalizeAllowedPresetVoiceKeys(allowedPresetVoiceKeys);
  const scope = normalizePresetVoiceLanguageScope(languageCode);
  const scoped = scope && Array.isArray(normalized[scope])
    ? normalized[scope]
    : scope && scope.includes('-') && Array.isArray(normalized[scope.split('-')[0]])
      ? normalized[scope.split('-')[0]]
      : Array.isArray(normalized[GLOBAL_VOICE_SCOPE])
        ? normalized[GLOBAL_VOICE_SCOPE]
        : null;
  if (scoped == null) return allKeys;
  return allKeys.filter((key) => scoped.includes(key));
}

export function isPresetVoiceAllowed(allowedPresetVoiceKeys, profileId, gender, languageCode = '') {
  const normalized = normalizeAllowedPresetVoiceKeys(allowedPresetVoiceKeys);
  const scope = normalizePresetVoiceLanguageScope(languageCode);
  const scoped = scope && Array.isArray(normalized[scope])
    ? normalized[scope]
    : scope && scope.includes('-') && Array.isArray(normalized[scope.split('-')[0]])
      ? normalized[scope.split('-')[0]]
      : Array.isArray(normalized[GLOBAL_VOICE_SCOPE])
        ? normalized[GLOBAL_VOICE_SCOPE]
        : null;
  if (scoped == null) return true;
  return scoped.includes(buildPresetVoiceAccessKey(profileId, gender));
}
