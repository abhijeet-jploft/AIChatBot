const axios = require('axios');

const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const MAX_TTS_CHARACTERS = Number(process.env.ELEVENLABS_MAX_TTS_CHARACTERS || 650);
const CUSTOM_VOICE_PROFILE_ID = 'custom';

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

const BUILTIN_VOICE_PROFILE_IDS = new Set(VOICE_PROFILE_CATALOG.map((profile) => profile.id));
const DEFAULT_VOICE_PROFILE = BUILTIN_VOICE_PROFILE_IDS.has(String(process.env.ELEVENLABS_DEFAULT_VOICE_PROFILE || '').trim().toLowerCase())
  ? String(process.env.ELEVENLABS_DEFAULT_VOICE_PROFILE || '').trim().toLowerCase()
  : 'professional';

let warnedMissingVoiceId = false;

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

function getVoicePresetCatalog(options = {}) {
  const includeVoiceIds = Boolean(options.includeVoiceIds);
  const catalog = VOICE_PROFILE_CATALOG.map((profile) => ({
    id: profile.id,
    label: profile.label,
    description: profile.description,
    previewText: profile.previewText,
    genders: ['female', 'male'],
    voices: {
      female: {
        label: profile.voices.female.label,
        ...(includeVoiceIds ? { voiceId: profile.voices.female.voiceId } : {}),
      },
      male: {
        label: profile.voices.male.label,
        ...(includeVoiceIds ? { voiceId: profile.voices.male.voiceId } : {}),
      },
    },
  }));

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
function getVoiceList(filters = {}, options = {}) {
  const genderFilter = filters.gender ? String(filters.gender).toLowerCase() : null;
  const profileFilter = filters.profile ? String(filters.profile).toLowerCase() : null;
  const search = (filters.search || '').trim().toLowerCase();

  const rows = [];
  for (const profile of VOICE_PROFILE_CATALOG) {
    for (const gender of ['female', 'male']) {
      const voice = profile.voices[gender];
      if (!voice) continue;
      if (genderFilter && gender !== genderFilter) continue;
      if (profileFilter && profile.id !== profileFilter) continue;
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

function resolveVoiceSelection(options = {}) {
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
  const fallbackVoiceId = PREMADE_VOICE_IDS.professional[gender];
  const voiceId = options.voiceId || presetVoice?.voiceId || fallbackVoiceId;

  return {
    gender,
    profile: profileConfig.id,
    profileLabel: profileConfig.label,
    voiceName: presetVoice?.label || (gender === 'male' ? 'Male voice' : 'Female voice'),
    voiceId,
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
  const apiKey = String(options.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
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

async function synthesizeTextResponse(text, options = {}) {
  const apiKey = String(options.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[ElevenLabs] ELEVENLABS_API_KEY is not set. Response voice will not be generated. Set it in .env to enable TTS.');
    return null;
  }

  const speechText = sanitizeTextForSpeech(text, { ignoreEmoji: Boolean(options.ignoreEmoji) });
  if (!speechText) return null;

  const voiceSelection = resolveVoiceSelection(options);
  const { gender, profile, profileLabel, voiceName, voiceId } = voiceSelection;

  if (!voiceId) {
    if (!warnedMissingVoiceId) {
      console.warn('[ElevenLabs] Voice ID missing for current profile. Pre-made voices use built-in IDs; this usually indicates a code bug.');
      warnedMissingVoiceId = true;
    }
    return null;
  }

  const modelId = options.modelId || DEFAULT_MODEL_ID;

  let response;
  try {
    response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        text: speechText,
        model_id: modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );
  } catch (err) {
    if (err.response?.status === 402) {
      const e = new Error('ElevenLabs quota exceeded or payment required. Upgrade your plan at elevenlabs.io.');
      e.status = 402;
      throw e;
    }
    throw err;
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
  getVoiceList,
  getVoicePreviewText,
  getVoicePresetCatalog,
  normalizeVoiceGender,
  normalizeVoiceProfile,
  synthesizeTextResponse,
};
