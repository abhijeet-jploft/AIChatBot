const axios = require('axios');

const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const DEFAULT_FEMALE_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_FEMALE || '';
const DEFAULT_MALE_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_MALE || '';
const MAX_TTS_CHARACTERS = Number(process.env.ELEVENLABS_MAX_TTS_CHARACTERS || 650);

let warnedMissingVoiceId = false;

function normalizeVoiceGender(value) {
  return String(value || 'female').trim().toLowerCase() === 'male' ? 'male' : 'female';
}

function getVoiceIdForGender(gender) {
  return normalizeVoiceGender(gender) === 'male' ? DEFAULT_MALE_VOICE_ID : DEFAULT_FEMALE_VOICE_ID;
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

  const gender = normalizeVoiceGender(options.gender);
  const voiceId = getVoiceIdForGender(gender);
  if (!voiceId) {
    if (!warnedMissingVoiceId) {
      console.warn('[ElevenLabs] Voice IDs are not configured. Set ELEVENLABS_VOICE_ID_FEMALE and ELEVENLABS_VOICE_ID_MALE to enable ElevenLabs TTS.');
      warnedMissingVoiceId = true;
    }
    return null;
  }
  const modelId = options.modelId || DEFAULT_MODEL_ID;

  const response = await axios.post(
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

  const audioBase64 = Buffer.from(response.data).toString('base64');
  const mimeType = 'audio/mpeg';

  return {
    provider: 'elevenlabs',
    gender,
    voiceId,
    mimeType,
    audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
  };
}

module.exports = {
  normalizeVoiceGender,
  synthesizeTextResponse,
};
