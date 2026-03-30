const axios = require('axios');
const { normalizeLanguagePrimaryToCode } = require('./supportedChatLanguages');

const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const MAX_TTS_CHARACTERS = Number(process.env.ELEVENLABS_MAX_TTS_CHARACTERS || 650);
const CUSTOM_VOICE_PROFILE_ID = 'custom';
const VOICE_LIBRARY_CACHE_TTL_MS = Number(process.env.ELEVENLABS_VOICE_CACHE_MS || 10 * 60 * 1000);
const ELEVENLABS_VOICE_TYPES = ['default', 'community'];

// Pre-made voices: hardcoded IDs only (do not use .env for these). Override in .env only for custom voices.
const PREMADE_VOICE_IDS = {
  professional: { female: '21m00Tcm4TlvDq8ikWAM', male: 'pNInz6obpgDQGcFmaJgB' },
  corporate: { female: 'MF3mGyEYCl7XYWbV9V6O', male: 'ErXwobaYiN019PkySvjV' },
  sales: { female: 'EXAVITQu4vr4xnSDxMaL', male: 'TxGEqnHWrfWFTfGW9XjX' },
};

const VOICE_PROFILE_CATALOG = [
  {
    id: 'professional',
    label: 'Professional',
    description: 'Polished, consultative tone for premium service conversations.',
    previewText: 'Hello, this is the professional voice profile for your AI assistant.',
    voices: {
      female: { label: 'Rachel', voiceId: PREMADE_VOICE_IDS.professional.female },
      male: { label: 'Adam', voiceId: PREMADE_VOICE_IDS.professional.male },
    },
  },
  {
    id: 'corporate',
    label: 'Corporate',
    description: 'Steady, authoritative delivery for enterprise support and operations.',
    previewText: 'Hello, this is the corporate voice profile for clear business communication.',
    voices: {
      female: { label: 'Elli', voiceId: PREMADE_VOICE_IDS.corporate.female },
      male: { label: 'Antoni', voiceId: PREMADE_VOICE_IDS.corporate.male },
    },
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Energetic and persuasive style optimized for conversion-focused chats.',
    previewText: 'Hello, this is the sales voice profile, ready for high-conversion conversations.',
    voices: {
      female: { label: 'Bella', voiceId: PREMADE_VOICE_IDS.sales.female },
      male: { label: 'Josh', voiceId: PREMADE_VOICE_IDS.sales.male },
    },
  },
];

// Language-aware preset visibility in admin. '*' means language-agnostic/multilingual-safe.
const PROFILE_LANGUAGE_SUPPORT = {
  professional: '*',
  corporate: '*',
  // Sales presets are optimized for a subset of locales; hide for other language selections.
  sales: ['en', 'es', 'pt', 'de', 'fr', 'it'],
};

const BUILTIN_VOICE_PROFILE_IDS = new Set(VOICE_PROFILE_CATALOG.map((profile) => profile.id));
const DEFAULT_VOICE_PROFILE = BUILTIN_VOICE_PROFILE_IDS.has(String(process.env.ELEVENLABS_DEFAULT_VOICE_PROFILE || '').trim().toLowerCase())
  ? String(process.env.ELEVENLABS_DEFAULT_VOICE_PROFILE || '').trim().toLowerCase()
  : 'professional';

let warnedMissingVoiceId = false;
const voiceLibraryCache = new Map();

const PROFILE_SELECTION_HINTS = {
  professional: ['professional', 'business', 'support', 'consultative', 'narration', 'clear', 'neutral', 'assistant'],
  corporate: ['corporate', 'business', 'enterprise', 'formal', 'authoritative', 'support', 'operations', 'news'],
  sales: ['sales', 'marketing', 'social media', 'advert', 'promo', 'energetic', 'expressive', 'friendly'],
};

function normalizeElevenLabsApiKey(value) {
  let key = String(value || '').trim();
  if (!key) return '';

  // Accept common copied formats such as: "Bearer <key>" or "xi-api-key: <key>".
  key = key.replace(/^['"]+|['"]+$/g, '').trim();
  key = key.replace(/^authorization\s*:\s*/i, '').trim();
  key = key.replace(/^bearer\s+/i, '').trim();
  key = key.replace(/^xi-api-key\s*[:=]\s*/i, '').trim();

  return key;
}

function normalizeRequestedLanguage(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return normalizeLanguagePrimaryToCode(raw);
}

function normalizeVoiceLabelGender(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male' || normalized === 'female') return normalized;
  return null;
}

function getVoiceLibraryCacheKey(apiKey) {
  return String(apiKey || '').trim() || '__public__';
}

function sanitizeVerifiedLanguages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const language = normalizeRequestedLanguage(item?.language || item?.locale || item?.code || '');
      if (!language) return null;
      return {
        language,
        locale: String(item?.locale || '').trim() || null,
        modelId: String(item?.model_id || item?.modelId || '').trim() || null,
        accent: String(item?.accent || '').trim() || null,
        previewUrl: String(item?.preview_url || item?.previewUrl || '').trim() || null,
      };
    })
    .filter(Boolean);
}

function sanitizeVoiceLibraryEntry(raw) {
  const voiceId = String(raw?.voice_id || raw?.voiceId || '').trim();
  if (!voiceId) return null;

  const labels = raw?.labels && typeof raw.labels === 'object' ? raw.labels : {};
  return {
    voiceId,
    name: String(raw?.name || '').trim() || 'Unnamed voice',
    category: String(raw?.category || '').trim().toLowerCase() || '',
    description: String(raw?.description || '').trim(),
    previewUrl: String(raw?.preview_url || raw?.previewUrl || '').trim() || null,
    gender: normalizeVoiceLabelGender(labels.gender),
    useCase: String(labels.use_case || '').trim().toLowerCase(),
    accent: String(labels.accent || '').trim().toLowerCase(),
    labelDescription: String(labels.description || '').trim().toLowerCase(),
    voiceType: String(raw?.voice_type || raw?.voiceType || '').trim().toLowerCase() || 'default',
    freeUsersAllowed: raw?.free_users_allowed === true,
    availableForTiers: Array.isArray(raw?.available_for_tiers)
      ? raw.available_for_tiers.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [],
    enabledInLibrary: raw?.enabled_in_library !== false,
    verifiedLanguages: sanitizeVerifiedLanguages(raw?.verified_languages),
    highQualityBaseModelIds: Array.isArray(raw?.high_quality_base_model_ids)
      ? raw.high_quality_base_model_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
}

async function fetchVoicesByType(voiceType, apiKey) {
  const response = await axios.get('https://api.elevenlabs.io/v2/voices', {
    headers: apiKey ? { 'xi-api-key': apiKey } : {},
    params: {
      page_size: 100,
      voice_type: voiceType,
      include_total_count: false,
    },
    timeout: 12000,
  });

  return Array.isArray(response?.data?.voices)
    ? response.data.voices.map(sanitizeVoiceLibraryEntry).filter(Boolean)
    : [];
}

async function fetchVoiceLibrary(options = {}) {
  const apiKey = String(options.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
  const cacheKey = getVoiceLibraryCacheKey(apiKey);
  const now = Date.now();
  const cached = voiceLibraryCache.get(cacheKey);

  if (cached?.data && cached.expiresAt > now) {
    return cached.data;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = Promise.allSettled(
    ELEVENLABS_VOICE_TYPES.map((voiceType) => fetchVoicesByType(voiceType, apiKey))
  ).then((results) => {
    const voices = [];
    const seen = new Set();
    for (const result of results) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
      for (const voice of result.value) {
        if (!voice?.voiceId || seen.has(voice.voiceId)) continue;
        seen.add(voice.voiceId);
        voices.push(voice);
      }
    }
    voiceLibraryCache.set(cacheKey, {
      data: voices,
      expiresAt: now + VOICE_LIBRARY_CACHE_TTL_MS,
    });
    return voices;
  }).catch((error) => {
    const fallback = cached?.data || [];
    voiceLibraryCache.set(cacheKey, {
      data: fallback,
      expiresAt: now + Math.min(VOICE_LIBRARY_CACHE_TTL_MS, 60 * 1000),
    });
    if (fallback.length) return fallback;
    throw error;
  }).finally(() => {
    const latest = voiceLibraryCache.get(cacheKey) || {};
    if (latest.promise) {
      delete latest.promise;
      voiceLibraryCache.set(cacheKey, latest);
    }
  });

  voiceLibraryCache.set(cacheKey, {
    ...(cached || {}),
    promise,
    expiresAt: cached?.expiresAt || 0,
    data: cached?.data || null,
  });

  return promise;
}

function isVoiceEligibleForPresetSelection(voice) {
  if (!voice) return false;
  if (voice.voiceType === 'community') {
    return voice.freeUsersAllowed === true || voice.availableForTiers.includes('free');
  }
  return true;
}

function scoreProfileFit(profileId, voice) {
  const haystack = [voice.name, voice.description, voice.useCase, voice.labelDescription, voice.accent, voice.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const hints = PROFILE_SELECTION_HINTS[profileId] || [];
  let score = 0;

  if (profileId === 'professional' && voice.category === 'professional') score += 8;
  if (profileId === 'corporate' && voice.category === 'professional') score += 6;
  if (profileId === 'sales' && (haystack.includes('social media') || haystack.includes('expressive'))) score += 8;

  for (const hint of hints) {
    if (haystack.includes(hint)) score += 4;
  }

  return score;
}

function scoreVoiceTypeFit(voice) {
  if (!voice) return 0;
  if (voice.voiceType === 'default') return 6;
  if (voice.voiceType === 'community') return 2;
  return 0;
}

function scoreLanguageFit(voice, languageCode, modelId) {
  if (!languageCode) return 0;
  const verified = Array.isArray(voice.verifiedLanguages) ? voice.verifiedLanguages : [];
  const exact = verified.find((item) => item.language === languageCode && (!modelId || item.modelId === modelId));
  if (exact) return 80;
  const anyLanguage = verified.find((item) => item.language === languageCode);
  if (anyLanguage) return 70;
  return -1000;
}

function scoreModelFit(voice, modelId) {
  if (!modelId) return 0;
  if (Array.isArray(voice.highQualityBaseModelIds) && voice.highQualityBaseModelIds.includes(modelId)) {
    return 10;
  }
  if (Array.isArray(voice.verifiedLanguages) && voice.verifiedLanguages.some((item) => item.modelId === modelId)) {
    return 8;
  }
  return 0;
}

function selectDynamicPresetVoice(profileId, gender, languageCode, voices, modelId = DEFAULT_MODEL_ID) {
  const requestedGender = normalizeVoiceGender(gender);
  const requestedLanguage = normalizeRequestedLanguage(languageCode);
  const pool = Array.isArray(voices) ? voices : [];

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const voice of pool) {
    if (!voice) continue;
    if (!isVoiceEligibleForPresetSelection(voice)) continue;
    if (voice.gender && voice.gender !== requestedGender) continue;

    const languageScore = scoreLanguageFit(voice, requestedLanguage, modelId);
    if (languageScore < 0) continue;

    const score = languageScore + scoreProfileFit(profileId, voice) + scoreModelFit(voice, modelId) + scoreVoiceTypeFit(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }

  return best;
}

function buildVoiceDebugEntry(voice, options = {}) {
  const requestedProfile = normalizeVoiceProfile(options.profile) || DEFAULT_VOICE_PROFILE;
  const requestedGender = normalizeVoiceGender(options.gender);
  const requestedLanguage = normalizeRequestedLanguage(options.languageCode);
  const modelId = String(options.modelId || DEFAULT_MODEL_ID || '').trim() || DEFAULT_MODEL_ID;

  const eligible = isVoiceEligibleForPresetSelection(voice);
  const genderMatches = !voice?.gender || voice.gender === requestedGender;
  const languageScore = scoreLanguageFit(voice, requestedLanguage, modelId);
  const languageMatches = languageScore >= 0;
  const profileScore = scoreProfileFit(requestedProfile, voice);
  const modelScore = scoreModelFit(voice, modelId);
  const voiceTypeScore = scoreVoiceTypeFit(voice);
  const accepted = eligible && genderMatches && languageMatches;
  const totalScore = accepted ? languageScore + profileScore + modelScore + voiceTypeScore : null;

  const reasons = [];
  if (!eligible) reasons.push('not_free_eligible');
  if (!genderMatches) reasons.push('gender_mismatch');
  if (!languageMatches) reasons.push('language_not_verified');
  if (accepted && voice?.voiceType === 'community') reasons.push('community_voice');
  if (accepted && voice?.voiceType === 'default') reasons.push('default_voice');

  return {
    voiceId: voice?.voiceId || null,
    name: voice?.name || 'Unnamed voice',
    voiceType: voice?.voiceType || 'default',
    category: voice?.category || '',
    gender: voice?.gender || null,
    previewUrl: voice?.previewUrl || null,
    freeUsersAllowed: voice?.freeUsersAllowed === true,
    availableForTiers: Array.isArray(voice?.availableForTiers) ? voice.availableForTiers : [],
    enabledInLibrary: voice?.enabledInLibrary !== false,
    verifiedLanguages: Array.isArray(voice?.verifiedLanguages) ? voice.verifiedLanguages : [],
    scoring: {
      eligible,
      genderMatches,
      languageMatches,
      languageScore,
      profileScore,
      modelScore,
      voiceTypeScore,
      totalScore,
    },
    reasons,
  };
}

async function debugVoiceSelection(options = {}) {
  const requestedProfile = normalizeVoiceProfile(options.profile) || DEFAULT_VOICE_PROFILE;
  const requestedGender = normalizeVoiceGender(options.gender);
  const requestedLanguage = normalizeRequestedLanguage(options.languageCode);
  const modelId = String(options.modelId || DEFAULT_MODEL_ID || '').trim() || DEFAULT_MODEL_ID;
  const limitRaw = Number(options.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.round(limitRaw))) : 30;
  const voices = await fetchVoiceLibrary({ apiKey: options.apiKey }).catch(() => []);
  const selected = selectDynamicPresetVoice(requestedProfile, requestedGender, requestedLanguage, voices, modelId);

  const entries = voices
    .map((voice) => buildVoiceDebugEntry(voice, {
      profile: requestedProfile,
      gender: requestedGender,
      languageCode: requestedLanguage,
      modelId,
    }))
    .sort((left, right) => {
      const leftScore = left.scoring.totalScore ?? Number.NEGATIVE_INFINITY;
      const rightScore = right.scoring.totalScore ?? Number.NEGATIVE_INFINITY;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });

  const matched = entries.filter((entry) => entry.scoring.totalScore !== null).slice(0, limit);
  const rejected = entries.filter((entry) => entry.scoring.totalScore === null).slice(0, limit);

  return {
    request: {
      languageCode: requestedLanguage,
      profile: requestedProfile,
      gender: requestedGender,
      modelId,
      limit,
    },
    summary: {
      totalVoicesFetched: voices.length,
      totalAccepted: entries.filter((entry) => entry.scoring.totalScore !== null).length,
      totalRejected: entries.filter((entry) => entry.scoring.totalScore === null).length,
      defaultVoices: voices.filter((voice) => voice?.voiceType === 'default').length,
      communityVoices: voices.filter((voice) => voice?.voiceType === 'community').length,
    },
    selected: selected
      ? {
        voiceId: selected.voiceId,
        name: selected.name,
        voiceType: selected.voiceType || 'default',
        previewUrl: selected.previewUrl || null,
      }
      : null,
    matched,
    rejected,
  };
}

function normalizeVoiceGender(value) {
  return String(value || 'female').trim().toLowerCase() === 'male' ? 'male' : 'female';
}

function normalizeVoiceProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === CUSTOM_VOICE_PROFILE_ID) return CUSTOM_VOICE_PROFILE_ID;
  return BUILTIN_VOICE_PROFILE_IDS.has(normalized) ? normalized : null;
}

function getVoiceProfileConfig(profile) {
  const normalized = normalizeVoiceProfile(profile);
  const chosen = BUILTIN_VOICE_PROFILE_IDS.has(normalized) ? normalized : DEFAULT_VOICE_PROFILE;
  return VOICE_PROFILE_CATALOG.find((item) => item.id === chosen) || VOICE_PROFILE_CATALOG[0];
}

function getCustomVoiceConfig(value) {
  const voiceId = String(value?.voiceId || value?.customVoiceId || '').trim();
  if (!voiceId) return null;

  const gender = normalizeVoiceGender(value?.gender || value?.customVoiceGender || 'female');
  const voiceName = String(value?.voiceName || value?.customVoiceName || 'My Voice').trim() || 'My Voice';
  return {
    voiceId,
    voiceName,
    gender,
  };
}

async function getVoicePresetCatalog(options = {}) {
  const includeVoiceIds = Boolean(options.includeVoiceIds);
  const languageCode = normalizeRequestedLanguage(options.languageCode);
  const voices = await fetchVoiceLibrary({ apiKey: options.apiKey }).catch(() => []);
  const catalog = VOICE_PROFILE_CATALOG.map((profile) => {
    const femaleDynamicVoice = selectDynamicPresetVoice(
      profile.id,
      'female',
      languageCode,
      voices,
      options.modelId || DEFAULT_MODEL_ID
    );
    const maleDynamicVoice = selectDynamicPresetVoice(
      profile.id,
      'male',
      languageCode,
      voices,
      options.modelId || DEFAULT_MODEL_ID
    );

    return {
      id: profile.id,
      label: profile.label,
      description: profile.description,
      previewText: profile.previewText,
      genders: ['female', 'male'],
      languageCode,
      voices: {
        female: {
          label: femaleDynamicVoice?.name || profile.voices.female.label,
          previewUrl: femaleDynamicVoice?.previewUrl || null,
          source: femaleDynamicVoice ? 'elevenlabs' : 'fallback',
          ...(includeVoiceIds ? { voiceId: femaleDynamicVoice?.voiceId || profile.voices.female.voiceId } : {}),
        },
        male: {
          label: maleDynamicVoice?.name || profile.voices.male.label,
          previewUrl: maleDynamicVoice?.previewUrl || null,
          source: maleDynamicVoice ? 'elevenlabs' : 'fallback',
          ...(includeVoiceIds ? { voiceId: maleDynamicVoice?.voiceId || profile.voices.male.voiceId } : {}),
        },
      },
    };
  });

  const customVoice = getCustomVoiceConfig(options.customVoice);
  if (customVoice) {
    catalog.push({
      id: CUSTOM_VOICE_PROFILE_ID,
      label: 'Your Voice',
      description: 'Your custom trained ElevenLabs voice.',
      previewText: `Hello, this is ${customVoice.voiceName}, your custom trained voice.`,
      genders: [customVoice.gender],
      voices: {
        female: {
          label: customVoice.gender === 'female' ? customVoice.voiceName : 'Not configured',
          ...(includeVoiceIds && customVoice.gender === 'female' ? { voiceId: customVoice.voiceId } : {}),
        },
        male: {
          label: customVoice.gender === 'male' ? customVoice.voiceName : 'Not configured',
          ...(includeVoiceIds && customVoice.gender === 'male' ? { voiceId: customVoice.voiceId } : {}),
        },
      },
      isCustom: true,
    });
  }

  return catalog;
}

/** Flat list of all voices for admin table. Optional filters: gender, profile, search (voice name or profile label). */
async function getVoiceList(filters = {}, options = {}) {
  const genderFilter = filters.gender ? String(filters.gender).toLowerCase() : null;
  const profileFilter = filters.profile ? String(filters.profile).toLowerCase() : null;
  const languageFilter = normalizeRequestedLanguage(filters.language);
  const search = (filters.search || '').trim().toLowerCase();
  const voices = await fetchVoiceLibrary({ apiKey: options.apiKey }).catch(() => []);

  const rows = [];
  for (const profile of VOICE_PROFILE_CATALOG) {
    for (const gender of ['female', 'male']) {
      if (genderFilter && gender !== genderFilter) continue;
      if (profileFilter && profile.id !== profileFilter) continue;
      const dynamicVoice = selectDynamicPresetVoice(profile.id, gender, languageFilter, voices, options.modelId || DEFAULT_MODEL_ID);
      const fallbackVoice = profile.voices[gender];
      const voice = dynamicVoice
        ? {
          label: dynamicVoice.name,
          voiceId: dynamicVoice.voiceId,
          previewUrl: dynamicVoice.previewUrl,
        }
        : fallbackVoice;
      if (!voice) continue;
      if (search) {
        const matchName = (voice.label || '').toLowerCase().includes(search);
        const matchProfile = (profile.label || '').toLowerCase().includes(search);
        if (!matchName && !matchProfile) continue;
      }
      rows.push({
        profileId: profile.id,
        profileLabel: profile.label,
        gender,
        voiceName: voice.label,
        voiceId: voice.voiceId,
        previewUrl: voice.previewUrl || null,
        source: dynamicVoice ? 'elevenlabs' : 'fallback',
        languageCode: languageFilter,
      });
    }
  }

  const customVoice = getCustomVoiceConfig(options.customVoice);
  if (customVoice) {
    const customProfileId = CUSTOM_VOICE_PROFILE_ID;
    const customProfileLabel = 'Your Voice';
    const customGender = customVoice.gender;
    const customName = customVoice.voiceName;

    const customMatchesGender = !genderFilter || customGender === genderFilter;
    const customMatchesProfile = !profileFilter || customProfileId === profileFilter;
    const customMatchesSearch = !search
      || customName.toLowerCase().includes(search)
      || customProfileLabel.toLowerCase().includes(search);

    if (customMatchesGender && customMatchesProfile && customMatchesSearch) {
      rows.push({
        profileId: customProfileId,
        profileLabel: customProfileLabel,
        gender: customGender,
        voiceName: customName,
        voiceId: customVoice.voiceId,
      });
    }
  }

  return rows;
}

async function resolveVoiceSelection(options = {}) {
  const requestedProfile = normalizeVoiceProfile(options.profile) || DEFAULT_VOICE_PROFILE;
  const customVoice = getCustomVoiceConfig({
    customVoiceId: options.customVoiceId,
    customVoiceName: options.customVoiceName,
    customVoiceGender: options.customVoiceGender,
    gender: options.gender,
  });

  if (requestedProfile === CUSTOM_VOICE_PROFILE_ID && customVoice) {
    return {
      gender: customVoice.gender,
      profile: CUSTOM_VOICE_PROFILE_ID,
      profileLabel: 'Your Voice',
      voiceName: customVoice.voiceName,
      voiceId: customVoice.voiceId,
    };
  }

  const gender = normalizeVoiceGender(options.gender);
  const profileConfig = getVoiceProfileConfig(requestedProfile);
  const presetVoice = profileConfig?.voices?.[gender] || null;
  const languageCode = normalizeRequestedLanguage(options.languageCode);
  const dynamicVoice = requestedProfile !== CUSTOM_VOICE_PROFILE_ID
    ? await fetchVoiceLibrary({ apiKey: options.apiKey })
      .then((voices) => selectDynamicPresetVoice(requestedProfile, gender, languageCode, voices, options.modelId || DEFAULT_MODEL_ID))
      .catch(() => null)
    : null;
  const fallbackVoiceId = PREMADE_VOICE_IDS.professional[gender];
  const voiceId = options.voiceId || dynamicVoice?.voiceId || presetVoice?.voiceId || fallbackVoiceId;

  return {
    gender,
    profile: profileConfig.id,
    profileLabel: profileConfig.label,
    voiceName: dynamicVoice?.name || presetVoice?.label || (gender === 'male' ? 'Male voice' : 'Female voice'),
    voiceId,
    previewUrl: dynamicVoice?.previewUrl || null,
  };
}

function getVoicePreviewText(profile, gender, options = {}) {
  const normalizedProfile = normalizeVoiceProfile(profile) || DEFAULT_VOICE_PROFILE;
  const customVoice = getCustomVoiceConfig({
    customVoiceId: options.customVoiceId,
    customVoiceName: options.customVoiceName,
    customVoiceGender: options.customVoiceGender,
    gender,
  });

  if (normalizedProfile === CUSTOM_VOICE_PROFILE_ID && customVoice) {
    return `Hello, this is ${customVoice.voiceName}, your custom trained voice preview.`;
  }

  const profileConfig = getVoiceProfileConfig(normalizedProfile);
  const normalizedGender = normalizeVoiceGender(gender);
  const fallback = `Hello, this is a ${normalizedGender} ${profileConfig.id} voice preview for your chatbot.`;
  return profileConfig.previewText || fallback;
}

function extractElevenLabsErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (Buffer.isBuffer(payload)) {
    try {
      const parsed = JSON.parse(payload.toString('utf8'));
      return extractElevenLabsErrorMessage(parsed, fallback);
    } catch {
      const s = payload.toString('utf8').trim();
      return s || fallback;
    }
  }
  if (typeof ArrayBuffer !== 'undefined' && payload instanceof ArrayBuffer) {
    try {
      const s = Buffer.from(payload).toString('utf8');
      const parsed = JSON.parse(s);
      return extractElevenLabsErrorMessage(parsed, fallback);
    } catch {
      const s = Buffer.from(payload).toString('utf8').trim();
      return s || fallback;
    }
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(payload)) {
    try {
      const s = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString('utf8');
      const parsed = JSON.parse(s);
      return extractElevenLabsErrorMessage(parsed, fallback);
    } catch {
      const s = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString('utf8').trim();
      return s || fallback;
    }
  }
  if (typeof payload === 'string') return payload;
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.detail === 'string') return payload.detail;
  if (payload.detail && typeof payload.detail.message === 'string') return payload.detail.message;
  if (Array.isArray(payload.detail) && payload.detail[0] && typeof payload.detail[0].msg === 'string') {
    return payload.detail[0].msg;
  }
  return fallback;
}

async function createCustomVoiceFromSamples(options = {}) {
  const apiKey = normalizeElevenLabsApiKey(options.apiKey || process.env.ELEVENLABS_API_KEY);
  if (!apiKey) {
    const err = new Error('ELEVENLABS_API_KEY is not set. Add it in .env to train a custom voice.');
    err.status = 400;
    throw err;
  }

  if (typeof fetch !== 'function' || typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    const err = new Error('This Node.js runtime does not support fetch/FormData required for ElevenLabs custom voice training.');
    err.status = 500;
    throw err;
  }

  const name = String(options.name || '').trim();
  if (!name) {
    const err = new Error('Voice name is required.');
    err.status = 400;
    throw err;
  }

  const gender = normalizeVoiceGender(options.gender);
  const files = Array.isArray(options.files)
    ? options.files.filter((file) => file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0)
    : [];

  if (!files.length) {
    const err = new Error('At least one audio sample file is required to train a custom voice.');
    err.status = 400;
    throw err;
  }

  const form = new FormData();
  form.append('name', name.slice(0, 100));

  const description = String(options.description || `Custom ${gender} voice trained from admin panel.`)
    .trim()
    .slice(0, 500);
  if (description) {
    form.append('description', description);
  }

  form.append('labels', JSON.stringify({
    gender,
    source: 'admin_panel',
    profile: CUSTOM_VOICE_PROFILE_ID,
  }));

  files.forEach((file, index) => {
    const rawName = String(file.originalname || `sample-${index + 1}.wav`).trim() || `sample-${index + 1}.wav`;
    const safeName = rawName.replace(/[\\/:*?"<>|]/g, '_');
    const mimeType = String(file.mimetype || 'audio/wav').trim() || 'audio/wav';
    const blob = new Blob([file.buffer], { type: mimeType });
    form.append('files', blob, safeName);
  });

  let response;
  try {
    response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: form,
    });
  } catch (fetchErr) {
    const err = new Error(`Failed to reach ElevenLabs: ${fetchErr.message}`);
    err.status = 502;
    throw err;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const fallback = 'Failed to train custom voice in ElevenLabs.';
    const err = new Error(extractElevenLabsErrorMessage(payload, fallback));
    err.status = response.status;
    throw err;
  }

  const voiceId = String(payload?.voice_id || payload?.voiceId || '').trim();
  if (!voiceId) {
    const err = new Error('ElevenLabs training succeeded but no voice ID was returned.');
    err.status = 502;
    throw err;
  }

  const voiceName = String(payload?.name || name).trim() || name;
  return {
    provider: 'elevenlabs',
    voiceId,
    voiceName,
    gender,
  };
}

/** Remove emoji from string (Unicode Emoji property). */
function stripEmoji(text) {
  return String(text || '').replace(/\p{Emoji}/gu, '').replace(/\s+/g, ' ').trim();
}

/** Remove BOM and leading invisible/control chars so first word is not skipped by TTS. */
function stripLeadingInvisible(str) {
  return String(str || '').replace(/^[\s\uFEFF\u200B-\u200D\u2060\u00AD]*/, '');
}

function sanitizeTextForSpeech(text, options = {}) {
  let plainText = stripLeadingInvisible(String(text || ''))
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*+])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (options.ignoreEmoji) {
    plainText = stripEmoji(plainText);
  }

  if (!plainText) return '';
  return plainText.slice(0, Math.max(120, MAX_TTS_CHARACTERS));
}

function buildApiKeyCandidates(explicitApiKey) {
  const explicit = normalizeElevenLabsApiKey(explicitApiKey);
  const fallback = normalizeElevenLabsApiKey(process.env.ELEVENLABS_API_KEY);
  const list = [];
  if (explicit) list.push({ source: 'company', value: explicit });
  if (fallback && fallback !== explicit) list.push({ source: 'env', value: fallback });
  return list;
}

async function synthesizeTextResponse(text, options = {}) {
  const apiKeyCandidates = buildApiKeyCandidates(options.apiKey);
  if (!apiKeyCandidates.length) {
    console.warn('[ElevenLabs] ELEVENLABS_API_KEY is not set. Response voice will not be generated. Set it in .env to enable TTS.');
    return null;
  }

  const speechText = sanitizeTextForSpeech(text, { ignoreEmoji: Boolean(options.ignoreEmoji) });
  if (!speechText) return null;

  const voiceSelection = await resolveVoiceSelection(options);
  const { gender, profile, profileLabel, voiceName, voiceId } = voiceSelection;

  if (!voiceId) {
    if (!warnedMissingVoiceId) {
      console.warn('[ElevenLabs] Voice ID missing for current profile. Pre-made voices use built-in IDs; this usually indicates a code bug.');
      warnedMissingVoiceId = true;
    }
    return null;
  }

  const modelId = String(options.modelId || DEFAULT_MODEL_ID || '').trim() || DEFAULT_MODEL_ID;
  const preferredLanguageCode = String(options.languageCode || '').trim().toLowerCase();
  const reqUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const candidateModels = Array.from(new Set([modelId, 'eleven_multilingual_v2'].filter(Boolean)));

  let response;
  let lastErr = null;
  const attemptedSources = [];
  for (const candidate of apiKeyCandidates) {
    const apiKey = candidate.value;
    attemptedSources.push(candidate.source);
    const requestConfig = {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 30000,
    };

    for (const candidateModel of candidateModels) {
      const attempts = preferredLanguageCode
        ? [{ includeLanguage: true }, { includeLanguage: false }]
        : [{ includeLanguage: false }];
      for (const attempt of attempts) {
        const payload = {
          text: speechText,
          model_id: candidateModel,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
          },
        };
        if (attempt.includeLanguage) payload.language_code = preferredLanguageCode;
        try {
          response = await axios.post(reqUrl, payload, requestConfig);
          lastErr = null;
          break;
        } catch (err) {
          if (err.response?.status === 402) {
            const e = new Error('ElevenLabs quota exceeded or payment required. Upgrade your plan at elevenlabs.io.');
            e.status = 402;
            throw e;
          }
          lastErr = err;
        }
      }
      if (response) break;
    }
    if (response) break;

    const status = Number(lastErr?.response?.status || 0);
    if (status !== 401 && status !== 403) {
      break;
    }
  }
  if (!response) {
    const status = Number(lastErr?.response?.status || 0);
    const apiMessage = extractElevenLabsErrorMessage(lastErr?.response?.data, lastErr?.message || 'Failed to synthesize speech with ElevenLabs.');

    if (status === 401 || status === 403) {
      const sourceHint = attemptedSources.length
        ? `attempted key source(s): ${Array.from(new Set(attemptedSources)).join(', ')}`
        : 'no API key source available';
      const detail = apiMessage ? ` Provider says: ${apiMessage}` : '';
      const e = new Error(`ElevenLabs authentication failed (${sourceHint}). Update your ElevenLabs API key in Settings -> AI Provider Keys.${detail}`);
      e.status = 401;
      throw e;
    }

    if (status === 429) {
      const e = new Error('ElevenLabs rate limit reached. Please retry in a moment.');
      e.status = 429;
      throw e;
    }

    const e = new Error(apiMessage || 'Failed to synthesize speech with ElevenLabs.');
    if (status) e.status = status;
    throw e;
  }

  const audioBase64 = Buffer.from(response.data).toString('base64');
  const mimeType = 'audio/mpeg';

  return {
    provider: 'elevenlabs',
    gender,
    profile,
    profileLabel,
    voiceName,
    voiceId,
    mimeType,
    audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
  };
}

module.exports = {
  createCustomVoiceFromSamples,
  debugVoiceSelection,
  getVoiceList,
  getVoicePreviewText,
  getVoicePresetCatalog,
  normalizeVoiceGender,
  normalizeVoiceProfile,
  synthesizeTextResponse,
};
