const { appendSystemLog } = require('./adminLogStore');

function safePreviewResponseData(data, max = 4000) {
  if (data == null) return undefined;
  try {
    if (Buffer.isBuffer(data)) {
      const s = data.toString('utf8');
      return s.length > max ? `${s.slice(0, max)}…` : s;
    }
    // Axios uses responseType 'arraybuffer' for TTS — error bodies are often ArrayBuffer, not Buffer.
    if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
      const s = Buffer.from(data).toString('utf8');
      return s.length > max ? `${s.slice(0, max)}…` : s;
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data)) {
      const s = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
      return s.length > max ? `${s.slice(0, max)}…` : s;
    }
    if (typeof data === 'object') {
      const s = JSON.stringify(data);
      return s.length > max ? `${s.slice(0, max)}…` : s;
    }
    const s = String(data);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return '[unreadable response body]';
  }
}

/** Rich meta for axios / fetch-style errors (ElevenLabs, Anthropic, etc.). */
function buildVoiceApiErrorMeta(err) {
  if (err == null) return { message: 'unknown error' };
  if (typeof err !== 'object') {
    return { message: String(err) };
  }
  const meta = {
    message: err.message || String(err),
    name: err.name,
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    status: err.status,
    isAxiosError: Boolean(err.isAxiosError),
  };
  if (err.stack) meta.stack = String(err.stack).slice(0, 6000);
  if (err.cause?.message) meta.cause = err.cause.message;

  const resp = err.response;
  if (resp) {
    meta.httpStatus = resp.status;
    meta.httpStatusText = resp.statusText;
    const ct = resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type']);
    if (ct) meta.responseContentType = String(ct);
    if (resp.data !== undefined) {
      meta.responseBody = safePreviewResponseData(resp.data, 4000);
    }
  }

  const cfg = err.config;
  if (cfg) {
    meta.requestMethod = cfg.method;
    meta.requestUrl = cfg.url;
    if (cfg.timeout != null) meta.requestTimeoutMs = cfg.timeout;
    const key = cfg.headers && (cfg.headers['xi-api-key'] || cfg.headers['Xi-Api-Key']);
    if (key) meta.requestHadApiKeyHeader = true;
  }

  return meta;
}

const buildHttpClientErrorMeta = buildVoiceApiErrorMeta;

/**
 * Logs voice/ElevenLabs failures to stderr and Admin → Logs (System) with full detail.
 * @param {string} label - e.g. assistant_reply_tts, chat_voice_endpoint, admin_voice_preview
 */
function logVoiceApiFailure(label, err, baseMeta = {}) {
  const detail = buildVoiceApiErrorMeta(err);
  const statusHint = detail.httpStatus != null ? `HTTP ${detail.httpStatus} — ` : '';
  const line = `Voice API failure [${label}]: ${statusHint}${detail.message}`;
  console.error(`[voice] ${line}`, { ...baseMeta, ...detail });
  appendSystemLog('error', line, { ...baseMeta, ...detail });
}

module.exports = {
  buildVoiceApiErrorMeta,
  buildHttpClientErrorMeta,
  logVoiceApiFailure,
};
