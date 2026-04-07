const {
  getModeOption,
  isValidConversationModeId,
  normalizeConversationModeId,
} = require('./conversationModes');
const {
  getLanguageCatalogForClient,
  normalizeLanguagePrimaryToCode,
  parseLanguageExtraLocalesJson,
  normalizeLanguageExtraLocalesInput,
} = require('./supportedChatLanguages');

const VALID_CHAT_LANGUAGE_CODES = new Set(getLanguageCatalogForClient().map((o) => o.code));

/** Keys aligned with admin Training.jsx tabs */
const TRAINING_MODULE_KEYS = Object.freeze([
  'scrape',
  'conversational',
  'documents',
  'database',
  'media',
  'structured',
  'manual',
]);

const DEFAULT_TRAINING_MODULES = TRAINING_MODULE_KEYS.reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {});

const DEFAULT_ADMIN_VISIBILITY = Object.freeze({
  fixed: {
    basicCompanySettings: true,
    themeSettings: true,
  },
  settings: {
    chatLanguages: true,
    /** null = all chat languages allowed when chatLanguages is on */
    chatLanguageAllowedCodes: null,
    autoTrigger: true,
    escalation: true,
    safety: true,
  },
  aiMode: true,
  /** null = all conversation modes allowed when aiMode is on */
  aiModeAllowedIds: null,
  training: { ...DEFAULT_TRAINING_MODULES },
  voice: {
    enableVoiceMode: true,
    enableVoiceResponse: true,
    ignoreEmoji: true,
    spokenLanguage: true,
    presetVoices: true,
    trainCustomVoice: true,
    allowedPresetVoiceKeys: {},
  },
  virtualAssistant: true,
});

const GLOBAL_VOICE_SCOPE = '__global__';
const AUTO_VOICE_SCOPE = '__auto__';

function cloneDefaultAdminVisibility() {
  return {
    fixed: { ...DEFAULT_ADMIN_VISIBILITY.fixed },
    settings: { ...DEFAULT_ADMIN_VISIBILITY.settings },
    aiMode: DEFAULT_ADMIN_VISIBILITY.aiMode,
    aiModeAllowedIds: DEFAULT_ADMIN_VISIBILITY.aiModeAllowedIds,
    training: { ...DEFAULT_ADMIN_VISIBILITY.training },
    voice: { ...DEFAULT_ADMIN_VISIBILITY.voice },
    virtualAssistant: DEFAULT_ADMIN_VISIBILITY.virtualAssistant,
  };
}

function parseAllowedChatLanguageCodes(raw) {
  if (raw == null || raw === '') return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const cleaned = parsed
    .map((c) => normalizeLanguagePrimaryToCode(c))
    .filter((c) => VALID_CHAT_LANGUAGE_CODES.has(c));
  return Array.from(new Set(cleaned));
}

function canAdminSetChatLanguagePrimary(adminVisibility, newPrimary, currentPrimary) {
  if (!adminVisibility?.settings?.chatLanguages) return false;
  const next = normalizeLanguagePrimaryToCode(newPrimary);
  const cur = normalizeLanguagePrimaryToCode(currentPrimary);
  if (next === cur) return true;
  const allowed = adminVisibility.settings.chatLanguageAllowedCodes;
  if (allowed == null) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  return allowed.map((c) => normalizeLanguagePrimaryToCode(c)).includes(next);
}

function canAdminSetChatLanguageExtras(adminVisibility, extraLocaleCodes, primaryCode) {
  if (!adminVisibility?.settings?.chatLanguages) return false;
  const allowed = adminVisibility.settings.chatLanguageAllowedCodes;
  if (allowed == null) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  const allowSet = new Set(allowed.map((c) => normalizeLanguagePrimaryToCode(c)));
  const p = normalizeLanguagePrimaryToCode(primaryCode);
  for (const x of extraLocaleCodes) {
    const c = normalizeLanguagePrimaryToCode(x);
    if (c === p) continue;
    if (!allowSet.has(c)) return false;
  }
  return true;
}

function filterChatLanguageCatalogForAdmin(company, fullCatalog) {
  const av = buildAdminVisibilityPayload(company);
  if (!av.settings.chatLanguages) return [];
  const allowed = av.settings.chatLanguageAllowedCodes;
  if (allowed == null) return fullCatalog;
  const allowSet = new Set(allowed.map((c) => normalizeLanguagePrimaryToCode(c)));
  const primary = normalizeLanguagePrimaryToCode(company.language_primary);
  const extras = parseLanguageExtraLocalesJson(company.language_extra_locales);
  [primary, ...extras].forEach((c) => allowSet.add(normalizeLanguagePrimaryToCode(c)));
  return fullCatalog.filter((row) => allowSet.has(row.code));
}

function parseAllowedAiModeIds(raw) {
  if (raw == null || raw === '') return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const cleaned = parsed
    .map((id) => String(id || '').trim().toLowerCase())
    .filter((id) => isValidConversationModeId(id));
  return Array.from(new Set(cleaned.map((id) => normalizeConversationModeId(id))));
}

function parseTrainingModules(raw) {
  const base = { ...DEFAULT_TRAINING_MODULES };
  if (raw == null || raw === '') return base;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!parsed || typeof parsed !== 'object') return base;
  for (const key of TRAINING_MODULE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      base[key] = Boolean(parsed[key]);
    }
  }
  return base;
}

function sanitizeTrainingModulesPatch(input) {
  if (!input || typeof input !== 'object') return { ...DEFAULT_TRAINING_MODULES };
  const next = { ...DEFAULT_TRAINING_MODULES };
  for (const key of TRAINING_MODULE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      next[key] = Boolean(input[key]);
    }
  }
  return next;
}

function canAdminSetAiMode(adminVisibility, newModeId, currentModeId) {
  if (!adminVisibility?.aiMode) return false;
  const next = normalizeConversationModeId(newModeId);
  const cur = normalizeConversationModeId(currentModeId);
  if (next === cur) return true;
  const allowed = adminVisibility.aiModeAllowedIds;
  if (allowed == null) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  return allowed.some((id) => normalizeConversationModeId(id) === next);
}

function isTrainingModuleAllowed(adminVisibility, moduleKey) {
  const k = String(moduleKey || '').trim().toLowerCase();
  if (!TRAINING_MODULE_KEYS.includes(k)) return false;
  const t = adminVisibility?.training?.[k];
  if (t === undefined) return true;
  return Boolean(t);
}

function hasAnyTrainingModuleAccess(adminVisibility) {
  return TRAINING_MODULE_KEYS.some((k) => isTrainingModuleAllowed(adminVisibility, k));
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
  payload.settings.chatLanguageAllowedCodes = parseAllowedChatLanguageCodes(
    company?.admin_visibility_allowed_chat_language_codes
  );
  payload.settings.autoTrigger = company?.admin_visibility_auto_trigger !== false;
  payload.settings.escalation = company?.admin_visibility_escalation !== false;
  payload.settings.safety = company?.admin_visibility_safety !== false;
  payload.aiMode = company?.admin_visibility_ai_mode !== false;
  payload.aiModeAllowedIds = parseAllowedAiModeIds(company?.admin_visibility_allowed_ai_mode_ids);
  payload.training = parseTrainingModules(company?.admin_visibility_training_modules);

  payload.voice.enableVoiceMode = company?.admin_visibility_voice_mode_toggle !== false;
  payload.voice.enableVoiceResponse = company?.admin_visibility_voice_response_toggle !== false;
  payload.voice.ignoreEmoji = company?.admin_visibility_voice_ignore_emoji !== false;
  payload.voice.spokenLanguage = company?.admin_visibility_voice_spoken_language !== false;
  payload.voice.presetVoices = company?.admin_visibility_voice_preset_voices !== false;
  payload.voice.trainCustomVoice = company?.admin_visibility_voice_custom_training !== false;
  payload.voice.allowedPresetVoiceKeys = parseAllowedPresetVoiceKeys(
    company?.admin_visibility_allowed_preset_voice_keys
  );

  payload.virtualAssistant = company?.admin_visibility_virtual_assistant !== false;

  return payload;
}

function filterModeCatalogForAdmin(company, catalog) {
  const av = buildAdminVisibilityPayload(company);
  const modes = catalog?.options?.modes || [];
  if (!av.aiMode) {
    return { ...catalog, options: { ...catalog.options, modes: [] } };
  }
  const allowed = av.aiModeAllowedIds;
  if (allowed == null) return catalog;
  const set = new Set(allowed.map((id) => normalizeConversationModeId(id)));
  let filtered = modes.filter((m) => set.has(m.id));
  const currentId = normalizeConversationModeId(company?.ai_mode);
  if (!filtered.some((m) => m.id === currentId)) {
    const opt = getModeOption(currentId);
    filtered = [opt, ...filtered];
  }
  return { ...catalog, options: { ...catalog.options, modes: filtered } };
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
    admin_visibility_virtual_assistant:
      payload?.virtualAssistant !== undefined ? Boolean(payload.virtualAssistant) : undefined,
  };

  const allowedKeys = normalizeAllowedPresetVoiceKeysInput(payload?.voice?.allowedPresetVoiceKeys);
  if (allowedKeys.error) {
    return { updates: {}, error: allowedKeys.error };
  }
  if (allowedKeys.provided) {
    updates.admin_visibility_allowed_preset_voice_keys = allowedKeys.storedValue;
  }

  if (payload?.aiModeAllowedIds !== undefined) {
    if (payload.aiModeAllowedIds === null) {
      updates.admin_visibility_allowed_ai_mode_ids = null;
    } else if (!Array.isArray(payload.aiModeAllowedIds)) {
      return { updates: {}, error: 'aiModeAllowedIds must be an array or null' };
    } else {
      const cleaned = payload.aiModeAllowedIds
        .map((id) => String(id || '').trim().toLowerCase())
        .filter((id) => isValidConversationModeId(id))
        .map((id) => normalizeConversationModeId(id));
      const unique = Array.from(new Set(cleaned));
      updates.admin_visibility_allowed_ai_mode_ids = unique.length ? JSON.stringify(unique) : JSON.stringify([]);
    }
  }

  if (payload?.training !== undefined) {
    if (payload.training === null) {
      updates.admin_visibility_training_modules = null;
    } else if (typeof payload.training !== 'object' || Array.isArray(payload.training)) {
      return { updates: {}, error: 'training must be an object or null' };
    } else {
      const sanitized = sanitizeTrainingModulesPatch(payload.training);
      updates.admin_visibility_training_modules = JSON.stringify(sanitized);
    }
  }

  if (payload?.settings?.chatLanguageAllowedCodes !== undefined) {
    if (payload.settings.chatLanguageAllowedCodes === null) {
      updates.admin_visibility_allowed_chat_language_codes = null;
    } else if (!Array.isArray(payload.settings.chatLanguageAllowedCodes)) {
      return { updates: {}, error: 'chatLanguageAllowedCodes must be an array or null' };
    } else {
      const cleaned = Array.from(new Set(
        payload.settings.chatLanguageAllowedCodes
          .map((c) => normalizeLanguagePrimaryToCode(c))
          .filter((c) => VALID_CHAT_LANGUAGE_CODES.has(c))
      ));
      updates.admin_visibility_allowed_chat_language_codes = cleaned.length
        ? JSON.stringify(cleaned)
        : JSON.stringify([]);
    }
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
  TRAINING_MODULE_KEYS,
  buildAdminVisibilityPayload,
  buildPresetVoiceAccessKey,
  canAdminSetAiMode,
  canAdminSetChatLanguageExtras,
  canAdminSetChatLanguagePrimary,
  filterChatLanguageCatalogForAdmin,
  filterModeCatalogForAdmin,
  getAllowedPresetVoiceKeysForLanguage,
  hasAnyTrainingModuleAccess,
  hasAnyVoiceSettingAccess,
  isPresetVoiceAllowed,
  isTrainingModuleAllowed,
  normalizeAdminVisibilityPatchInput,
  parseAllowedPresetVoiceKeys,
  serializeAllowedPresetVoiceKeys,
};
