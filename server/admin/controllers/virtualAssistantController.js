/**
 * Admin Virtual Assistant controller
 * GET  /admin/virtual-assistant           – current VA settings
 * PUT  /admin/virtual-assistant           – update VA settings
 * GET  /admin/virtual-assistant/avatars   – list avatars from LiveAvatar
 * GET  /admin/virtual-assistant/voices    – list voices from LiveAvatar
 * GET  /admin/virtual-assistant/contexts  – list contexts from LiveAvatar
 * POST /admin/virtual-assistant/contexts  – create a context in LiveAvatar
 * GET  /admin/virtual-assistant/credits   – check LiveAvatar credits
 * POST /admin/virtual-assistant/embed     – create embed URL via LiveAvatar Embed V2
 */

const CompanyAdmin = require('../models/CompanyAdmin');
const liveAvatar = require('../../services/liveAvatarService');
const pool = require('../../db/index');

function pickVASettings(company) {
  return {
    vaEnabled: Boolean(company.va_enabled),
    liveAvatarApiKey: company.liveavatar_api_key ? '••••••••' : '',
    liveAvatarApiKeySet: Boolean(company.liveavatar_api_key),
    avatarId: company.liveavatar_avatar_id || '',
    avatarName: company.liveavatar_avatar_name || '',
    contextId: company.liveavatar_context_id || '',
    contextName: company.liveavatar_context_name || '',
    voiceSource: company.va_voice_source || 'liveavatar',
    voiceId: company.liveavatar_voice_id || '',
    voiceName: company.liveavatar_voice_name || '',
    sandboxMode: Boolean(company.va_sandbox_mode),
    videoQuality: company.va_video_quality || 'high',
  };
}

async function getSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const vaSettings = pickVASettings(company);
    // Include existing voice_settings config for display when voiceSource = 'elevenlabs'
    vaSettings.voiceCustomId = company.voice_custom_id || '';
    vaSettings.voiceCustomName = company.voice_custom_name || '';
    vaSettings.voiceProfile = company.voice_profile || 'professional';
    vaSettings.voiceGender = company.voice_gender || 'female';
    vaSettings.hasElevenLabsKey = Boolean(company.elevenlabs_api_key);
    return res.json(vaSettings);
  } catch (err) {
    console.error('[virtual-assistant] getSettings:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const {
      vaEnabled,
      liveAvatarApiKey,
      avatarId,
      avatarName,
      contextId,
      contextName,
      voiceSource,
      voiceId,
      voiceName,
      sandboxMode,
      videoQuality,
    } = req.body;

    const updates = {};
    if (vaEnabled !== undefined) updates.va_enabled = vaEnabled;
    if (liveAvatarApiKey !== undefined && liveAvatarApiKey !== '••••••••') {
      updates.liveavatar_api_key = liveAvatarApiKey;
    }
    if (avatarId !== undefined) updates.liveavatar_avatar_id = avatarId;
    if (avatarName !== undefined) updates.liveavatar_avatar_name = avatarName;
    if (contextId !== undefined) updates.liveavatar_context_id = contextId;
    if (contextName !== undefined) updates.liveavatar_context_name = contextName;
    if (voiceSource !== undefined) updates.va_voice_source = voiceSource;
    if (voiceId !== undefined) updates.liveavatar_voice_id = voiceId;
    if (voiceName !== undefined) updates.liveavatar_voice_name = voiceName;
    if (sandboxMode !== undefined) updates.va_sandbox_mode = sandboxMode;
    if (videoQuality !== undefined) updates.va_video_quality = videoQuality;

    await CompanyAdmin.updateSettings(req.adminCompanyId, updates);

    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    return res.json(pickVASettings(company));
  } catch (err) {
    console.error('[virtual-assistant] updateSettings:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** Resolve the API key from the company row (stored unmasked in DB). */
async function resolveApiKey(companyId) {
  const company = await CompanyAdmin.findByCompanyId(companyId);
  const key = company?.liveavatar_api_key;
  if (!key) {
    const err = new Error('LiveAvatar API key not configured');
    err.status = 400;
    throw err;
  }
  return key;
}

async function listAvatars(req, res) {
  try {
    const apiKey = await resolveApiKey(req.adminCompanyId);
    const [publicAvatars, userAvatars] = await Promise.all([
      liveAvatar.listPublicAvatars(apiKey),
      liveAvatar.listUserAvatars(apiKey),
    ]);
    return res.json({ publicAvatars, userAvatars });
  } catch (err) {
    console.error('[virtual-assistant] listAvatars:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function listVoices(req, res) {
  try {
    const apiKey = await resolveApiKey(req.adminCompanyId);
    const voices = await liveAvatar.listVoices(apiKey);
    return res.json({ voices });
  } catch (err) {
    console.error('[virtual-assistant] listVoices:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function listContexts(req, res) {
  try {
    const apiKey = await resolveApiKey(req.adminCompanyId);
    const contexts = await liveAvatar.listContexts(apiKey);
    return res.json({ contexts });
  } catch (err) {
    console.error('[virtual-assistant] listContexts:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function createContextHandler(req, res) {
  try {
    const apiKey = await resolveApiKey(req.adminCompanyId);
    const { name, prompt, opening_text, links } = req.body;
    if (!name || !prompt) {
      return res.status(400).json({ error: 'name and prompt are required' });
    }
    const context = await liveAvatar.createContext(apiKey, { name, prompt, opening_text, links });
    return res.json({ context });
  } catch (err) {
    console.error('[virtual-assistant] createContext:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function getCredits(req, res) {
  try {
    const apiKey = await resolveApiKey(req.adminCompanyId);
    const credits = await liveAvatar.getUserCredits(apiKey);
    return res.json({ credits });
  } catch (err) {
    console.error('[virtual-assistant] getCredits:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function createEmbed(req, res) {
  try {
    const apiKey = await resolveApiKey(req.adminCompanyId);
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    const avatarId = req.body.avatarId || company.liveavatar_avatar_id;
    const contextId = req.body.contextId || company.liveavatar_context_id;
    const sandbox = req.body.sandbox ?? company.va_sandbox_mode;
    const voiceSource = company.va_voice_source || 'liveavatar';

    if (!avatarId) {
      return res.status(400).json({ error: 'No avatar selected' });
    }

    // Resolve voice ID based on voice source
    let voiceId = req.body.voiceId || company.liveavatar_voice_id;
    if (voiceSource === 'elevenlabs' && company.voice_custom_id && company.elevenlabs_api_key) {
      try {
        const secret = await liveAvatar.createSecret(apiKey, {
          secret_name: `elevenlabs_${req.adminCompanyId}`,
          secret_value: company.elevenlabs_api_key,
          secret_type: 'ELEVENLABS_API_KEY',
        });
        const bound = await liveAvatar.bindThirdPartyVoice(apiKey, {
          provider_voice_id: company.voice_custom_id,
          secret_id: secret.id,
          name: company.voice_custom_name || 'ElevenLabs Voice',
        });
        if (bound?.voice_id) voiceId = bound.voice_id;
      } catch (bindErr) {
        console.error('[virtual-assistant] ElevenLabs voice bind error:', bindErr.message);
      }
    }

    const embed = await liveAvatar.createEmbedV2(apiKey, {
      avatar_id: avatarId,
      context_id: contextId || undefined,
      voice_id: voiceId || undefined,
      is_sandbox: Boolean(sandbox),
    });
    return res.json({ embed });
  } catch (err) {
    console.error('[virtual-assistant] createEmbed:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  listAvatars,
  listVoices,
  listContexts,
  createContext: createContextHandler,
  getCredits,
  createEmbed,
};
