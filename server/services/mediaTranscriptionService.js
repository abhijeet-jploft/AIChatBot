const { GoogleGenerativeAI } = require('@google/generative-ai');
const GEMINI_MODEL_FALLBACKS = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function isModelNotFoundError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('404') && (msg.includes('not found') || msg.includes('not supported'));
}

function isQuotaExceededError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('quota exceeded') || msg.includes('too many requests');
}

function buildQuotaExceededMessage(err, options = {}) {
  const requestedModel = String(options.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  const keySource = String(options.keySource || 'server configuration');
  const retryMatch = String(err?.message || '').match(/Please retry in\s+([^\.\s]+s?)/i);
  const retryHint = retryMatch?.[1] ? ` Retry after ${retryMatch[1]}.` : '';
  return `Gemini media transcription quota exceeded for ${requestedModel} using ${keySource}. Verify the deployed server is using the intended Gemini API key and that billing/quota are enabled.${retryHint}`;
}

function inferMediaType(mime = '', originalName = '') {
  const m = String(mime || '').toLowerCase();
  const n = String(originalName || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(n)) return 'image';
  if (m.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return 'audio';
  if (m.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|m4v)$/.test(n)) return 'video';
  return 'media';
}

function buildPrompt(mediaType, fileName) {
  return [
    `You are converting uploaded ${mediaType} content into training data.`,
    'Return only factual extracted content. Do not add assumptions.',
    'If text is visible/audible, transcribe it verbatim first, then add a concise semantic summary.',
    'Output plain text only.',
    `File: ${fileName}`,
  ].join('\n');
}

async function transcribeMediaFiles(files, options = {}) {
  const key = String(options.apiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('Gemini API key not configured for media transcription');

  const genAI = new GoogleGenerativeAI(key);
  const requestedModel = options.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelCandidates = [requestedModel, ...GEMINI_MODEL_FALLBACKS].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const entries = [];
  for (const file of files || []) {
    const mediaType = inferMediaType(file?.mimetype, file?.originalname);
    const mimeType = String(file?.mimetype || 'application/octet-stream');
    const inlineData = Buffer.from(file?.buffer || Buffer.alloc(0)).toString('base64');
    if (!inlineData) {
      throw new Error(`Cannot transcribe empty file: ${file?.originalname || 'unknown'}`);
    }

    let content = '';
    let lastQuotaError = null;
    for (let i = 0; i < modelCandidates.length; i += 1) {
      const candidate = modelCandidates[i];
      try {
        const model = genAI.getGenerativeModel({ model: candidate });
        const result = await model.generateContent([
          { text: buildPrompt(mediaType, file?.originalname || 'unknown') },
          { inlineData: { mimeType, data: inlineData } },
        ]);
        content = String(result?.response?.text?.() || '').trim();
        if (content) break;
      } catch (err) {
        if (isQuotaExceededError(err)) {
          const quotaErr = new Error(buildQuotaExceededMessage(err, { ...options, model: candidate }));
          quotaErr.cause = err;
          lastQuotaError = quotaErr;
          if (i < modelCandidates.length - 1) continue;
          throw quotaErr;
        }
        if (isModelNotFoundError(err) && i < modelCandidates.length - 1) continue;
        throw err;
      }
    }
    if (!content && lastQuotaError) {
      throw lastQuotaError;
    }
    if (!content) {
      throw new Error(`No transcription returned for ${file?.originalname || 'unknown file'}`);
    }

    entries.push({
      type: 'media',
      mediaType,
      name: file?.originalname || 'media',
      mimetype: mimeType,
      content,
      ts: new Date().toISOString(),
    });
  }

  return entries;
}

module.exports = { transcribeMediaFiles };

