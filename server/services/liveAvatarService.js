/**
 * LiveAvatar API client — wraps calls to api.liveavatar.com
 */

const BASE_URL = 'https://api.liveavatar.com';

async function apiCall(method, path, apiKey, body) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'X-API-KEY': apiKey };
  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.message || json?.error || `LiveAvatar API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ─── Avatars ────────────────────────────────────────────────────────────────

async function listPublicAvatars(apiKey) {
  const json = await apiCall('GET', '/v1/avatars/public?page_size=100', apiKey);
  return json?.data?.results || json?.data || [];
}

async function listUserAvatars(apiKey) {
  const json = await apiCall('GET', '/v1/avatars?page_size=100', apiKey);
  return json?.data?.results || json?.data || [];
}

async function getAvatar(apiKey, avatarId) {
  const json = await apiCall('GET', `/v1/avatars/${encodeURIComponent(avatarId)}`, apiKey);
  return json?.data || null;
}

// ─── Voices ─────────────────────────────────────────────────────────────────

async function listVoices(apiKey) {
  const json = await apiCall('GET', '/v1/voices?page_size=100', apiKey);
  return json?.data?.results || json?.data || [];
}

async function getVoice(apiKey, voiceId) {
  const json = await apiCall('GET', `/v1/voices/${encodeURIComponent(voiceId)}`, apiKey);
  return json?.data || null;
}

async function bindThirdPartyVoice(apiKey, { provider_voice_id, secret_id, name }) {
  const json = await apiCall('POST', '/v1/voices/third_party', apiKey, {
    provider_voice_id,
    secret_id,
    name: name || undefined,
  });
  return json?.data || null;
}

// ─── Contexts ───────────────────────────────────────────────────────────────

async function listContexts(apiKey) {
  const json = await apiCall('GET', '/v1/contexts?page_size=100', apiKey);
  return json?.data?.results || json?.data || [];
}

async function createContext(apiKey, { name, prompt, opening_text, links }) {
  const json = await apiCall('POST', '/v1/contexts', apiKey, {
    name,
    prompt,
    opening_text,
    links: links || [],
  });
  return json?.data || null;
}

async function getContext(apiKey, contextId) {
  const json = await apiCall('GET', `/v1/contexts/${encodeURIComponent(contextId)}`, apiKey);
  return json?.data || null;
}

// ─── Secrets ────────────────────────────────────────────────────────────────

async function createSecret(apiKey, { secret_name, secret_value, secret_type }) {
  const json = await apiCall('POST', '/v1/secrets', apiKey, {
    secret_name,
    secret_value,
    secret_type,
  });
  return json?.data || null;
}

async function listSecrets(apiKey) {
  const json = await apiCall('GET', '/v1/secrets', apiKey);
  return json?.data || [];
}

// ─── Embeddings ─────────────────────────────────────────────────────────────

async function createEmbedV2(apiKey, { avatar_id, context_id, voice_id, is_sandbox, type, max_session_duration, default_language }) {
  const body = { avatar_id };
  if (context_id) body.context_id = context_id;
  if (voice_id) body.voice_id = voice_id;
  if (is_sandbox) body.is_sandbox = true;
  if (type) body.type = type;
  if (max_session_duration) body.max_session_duration = max_session_duration;
  if (default_language) body.default_language = default_language;
  const json = await apiCall('POST', '/v2/embeddings', apiKey, body);
  return json?.data || null;
}

// ─── Credits ────────────────────────────────────────────────────────────────

async function getUserCredits(apiKey) {
  const json = await apiCall('GET', '/v1/users/credits', apiKey);
  return json?.data || null;
}

// ─── Languages ──────────────────────────────────────────────────────────────

async function getLanguages() {
  const res = await fetch(`${BASE_URL}/v1/languages`);
  const json = await res.json().catch(() => null);
  return json?.data || [];
}

module.exports = {
  listPublicAvatars,
  listUserAvatars,
  getAvatar,
  listVoices,
  getVoice,
  bindThirdPartyVoice,
  listContexts,
  createContext,
  getContext,
  createSecret,
  listSecrets,
  createEmbedV2,
  getUserCredits,
  getLanguages,
};
