const axios = require('axios');

const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const MAX_TTS_CHARACTERS = Number(process.env.ELEVENLABS_MAX_TTS_CHARACTERS || 650);

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

const VALID_VOICE_PROFILE_IDS = new Set(VOICE_PROFILE_CATALOG.map((profile) => profile.id));
const DEFAULT_VOICE_PROFILE = normalizeVoiceProfile(process.env.ELEVENLABS_DEFAULT_VOICE_PROFILE) || 'professional';

let warnedMissingVoiceId = false;

function normalizeVoiceGender(value) {
  return String(value || 'female').trim().toLowerCase() === 'male' ? 'male' : 'female';
}

function normalizeVoiceProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return VALID_VOICE_PROFILE_IDS.has(normalized) ? normalized : null;
}

function getVoiceProfileConfig(profile) {
  const normalized = normalizeVoiceProfile(profile) || DEFAULT_VOICE_PROFILE;
  return VOICE_PROFILE_CATALOG.find((item) => item.id === normalized) || VOICE_PROFILE_CATALOG[0];
}

function getVoicePresetCatalog(options = {}) {
  const includeVoiceIds = Boolean(options.includeVoiceIds);
  return VOICE_PROFILE_CATALOG.map((profile) => ({
    id: profile.id,
    label: profile.label,
    description: profile.description,
    previewText: profile.previewText,
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
}

/** Flat list of all voices for admin table. Optional filters: gender, profile, search (voice name or profile label). */
function getVoiceList(filters = {}) {
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
  return rows;
}

function resolveVoiceSelection(options = {}) {
  const gender = normalizeVoiceGender(options.gender);
  const profileConfig = getVoiceProfileConfig(options.profile);
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

function getVoicePreviewText(profile, gender) {
  const profileConfig = getVoiceProfileConfig(profile);
  const normalizedGender = normalizeVoiceGender(gender);
  const fallback = `Hello, this is a ${normalizedGender} ${profileConfig.id} voice preview for your chatbot.`;
  return profileConfig.previewText || fallback;
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
  const apiKey = process.env.ELEVENLABS_API_KEY;
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
  getVoiceList,
  getVoicePreviewText,
  getVoicePresetCatalog,
  normalizeVoiceGender,
  normalizeVoiceProfile,
  synthesizeTextResponse,
};
