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

function cloneDefaultAdminVisibility() {
  return {
    fixed: { ...DEFAULT_ADMIN_VISIBILITY.fixed },
    settings: { ...DEFAULT_ADMIN_VISIBILITY.settings },
    aiMode: DEFAULT_ADMIN_VISIBILITY.aiMode,
    voice: { ...DEFAULT_ADMIN_VISIBILITY.voice },
  };
}

function buildPresetVoiceAccessKey(profileId, gender) {
  const normalizedProfileId = String(profileId || '').trim().toLowerCase();
  const normalizedGender = String(gender || '').trim().toLowerCase() === 'male' ? 'male' : 'female';
  return `${normalizedProfileId}:${normalizedGender}`;
}

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

function parseAllowedPresetVoiceKeys(rawValue) {
  if (rawValue == null || rawValue === '') return {};

  let parsed = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return {};
    }
  }

  if (Array.isArray(parsed)) {
    const cleaned = sanitizeAllowedVoiceKeyList(parsed);
    return cleaned.length ? { [GLOBAL_VOICE_SCOPE]: cleaned } : {};
  }

  if (!parsed || typeof parsed !== 'object') return {};

  const entries = Object.entries(parsed).reduce((acc, [scope, keys]) => {
    const normalizedScope = normalizePresetVoiceLanguageScope(scope);
    if (!normalizedScope) return acc;
    const cleanedKeys = sanitizeAllowedVoiceKeyList(keys);
    if (cleanedKeys.length) {
      acc[normalizedScope] = cleanedKeys;
    }
    return acc;
  }, {});

  return entries;
}

function serializeAllowedPresetVoiceKeys(value) {
  const parsed = parseAllowedPresetVoiceKeys(value);
  if (!Object.keys(parsed).length) return null;
  return JSON.stringify(parsed);
}

function getAllowedPresetVoiceKeysForLanguage(allowedPresetVoiceKeys, languageCode) {
  const parsed = parseAllowedPresetVoiceKeys(allowedPresetVoiceKeys);
  const normalizedScope = normalizePresetVoiceLanguageScope(languageCode);
  if (normalizedScope && Array.isArray(parsed[normalizedScope])) return parsed[normalizedScope];
  if (normalizedScope && normalizedScope.includes('-')) {
    const primaryScope = normalizePresetVoiceLanguageScope(normalizedScope.split('-')[0]);
    if (primaryScope && Array.isArray(parsed[primaryScope])) return parsed[primaryScope];
  }
  if (Array.isArray(parsed[GLOBAL_VOICE_SCOPE])) return parsed[GLOBAL_VOICE_SCOPE];
  return null;
}

function normalizeAllowedPresetVoiceKeysInput(rawValue) {
  if (rawValue === undefined) {
    return { provided: false, resolvedValue: undefined, storedValue: undefined };
  }

  if (rawValue === null) {
    return { provided: true, resolvedValue: {}, storedValue: null };
  }

  let cleaned;
  try {
    cleaned = parseAllowedPresetVoiceKeys(rawValue);
  } catch {
    return { provided: true, error: 'allowedPresetVoiceKeys must be an object, array, or null' };
  }

  return {
    provided: true,
    resolvedValue: cleaned,
    storedValue: serializeAllowedPresetVoiceKeys(cleaned),
  };
}

function buildAdminVisibilityPayload(company) {
  const payload = cloneDefaultAdminVisibility();

  payload.settings.chatLanguages = company?.admin_visibility_language_settings !== false;
  payload.settings.autoTrigger = company?.admin_visibility_auto_trigger !== false;
  payload.settings.escalation = company?.admin_visibility_escalation !== false;
  payload.settings.safety = company?.admin_visibility_safety !== false;
  payload.aiMode = company?.admin_visibility_ai_mode !== false;

  payload.voice.enableVoiceMode = company?.admin_visibility_voice_mode_toggle !== false;
  payload.voice.enableVoiceResponse = company?.admin_visibility_voice_response_toggle !== false;
  payload.voice.ignoreEmoji = company?.admin_visibility_voice_ignore_emoji !== false;
  payload.voice.spokenLanguage = company?.admin_visibility_voice_spoken_language !== false;
  payload.voice.presetVoices = company?.admin_visibility_voice_preset_voices !== false;
  payload.voice.trainCustomVoice = company?.admin_visibility_voice_custom_training !== false;
  payload.voice.allowedPresetVoiceKeys = parseAllowedPresetVoiceKeys(
    company?.admin_visibility_allowed_preset_voice_keys
  );

  return payload;
}

function normalizeAdminVisibilityPatchInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { updates: {}, error: 'Invalid admin visibility payload' };
  }

  const updates = {
    admin_visibility_language_settings:
      payload?.settings?.chatLanguages !== undefined ? Boolean(payload.settings.chatLanguages) : undefined,
    admin_visibility_auto_trigger:
      payload?.settings?.autoTrigger !== undefined ? Boolean(payload.settings.autoTrigger) : undefined,
    admin_visibility_escalation:
      payload?.settings?.escalation !== undefined ? Boolean(payload.settings.escalation) : undefined,
    admin_visibility_safety:
      payload?.settings?.safety !== undefined ? Boolean(payload.settings.safety) : undefined,
    admin_visibility_ai_mode:
      payload?.aiMode !== undefined ? Boolean(payload.aiMode) : undefined,
    admin_visibility_voice_mode_toggle:
      payload?.voice?.enableVoiceMode !== undefined ? Boolean(payload.voice.enableVoiceMode) : undefined,
    admin_visibility_voice_response_toggle:
      payload?.voice?.enableVoiceResponse !== undefined ? Boolean(payload.voice.enableVoiceResponse) : undefined,
    admin_visibility_voice_ignore_emoji:
      payload?.voice?.ignoreEmoji !== undefined ? Boolean(payload.voice.ignoreEmoji) : undefined,
    admin_visibility_voice_spoken_language:
      payload?.voice?.spokenLanguage !== undefined ? Boolean(payload.voice.spokenLanguage) : undefined,
    admin_visibility_voice_preset_voices:
      payload?.voice?.presetVoices !== undefined ? Boolean(payload.voice.presetVoices) : undefined,
    admin_visibility_voice_custom_training:
      payload?.voice?.trainCustomVoice !== undefined ? Boolean(payload.voice.trainCustomVoice) : undefined,
  };

  const allowedKeys = normalizeAllowedPresetVoiceKeysInput(payload?.voice?.allowedPresetVoiceKeys);
  if (allowedKeys.error) {
    return { updates: {}, error: allowedKeys.error };
  }
  if (allowedKeys.provided) {
    updates.admin_visibility_allowed_preset_voice_keys = allowedKeys.storedValue;
  }

  return { updates };
}

function isPresetVoiceAllowed(allowedPresetVoiceKeys, profileId, gender) {
  const resolvedKeys = getAllowedPresetVoiceKeysForLanguage(allowedPresetVoiceKeys, arguments[3]);
  if (resolvedKeys == null) return true;
  const key = buildPresetVoiceAccessKey(profileId, gender);
  return resolvedKeys.includes(key);
}

function hasAnyVoiceSettingAccess(adminVisibility) {
  return Boolean(
    adminVisibility?.voice?.enableVoiceMode
    || adminVisibility?.voice?.enableVoiceResponse
    || adminVisibility?.voice?.ignoreEmoji
    || adminVisibility?.voice?.spokenLanguage
    || adminVisibility?.voice?.presetVoices
    || adminVisibility?.voice?.trainCustomVoice
  );
}

module.exports = {
  DEFAULT_ADMIN_VISIBILITY,
  buildAdminVisibilityPayload,
  buildPresetVoiceAccessKey,
  getAllowedPresetVoiceKeysForLanguage,
  hasAnyVoiceSettingAccess,
  isPresetVoiceAllowed,
  normalizeAdminVisibilityPatchInput,
  parseAllowedPresetVoiceKeys,
  serializeAllowedPresetVoiceKeys,
};
