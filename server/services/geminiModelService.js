const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
];

function stripGeminiModelPrefix(modelName) {
  const normalized = String(modelName || '').trim();
  if (!normalized) return '';
  return normalized.replace(/^models\//i, '');
}

function normalizeGeminiModel(requestedModel, fallbackModel = process.env.GEMINI_MODEL) {
  const requested = stripGeminiModelPrefix(requestedModel);
  const fallback = stripGeminiModelPrefix(fallbackModel);

  const requestedLower = requested.toLowerCase();
  const fallbackLower = fallback.toLowerCase();

  const invalidRequested = !requested
    || requestedLower.includes('claude')
    || requestedLower === 'gemini-1.5-flash-latest';

  const invalidFallback = !fallback || fallbackLower === 'gemini-1.5-flash-latest';

  if (!invalidRequested) return requested;
  if (!invalidFallback) return fallback;
  return DEFAULT_GEMINI_MODEL;
}

function buildGeminiModelCandidates(requestedModel, fallbackModel = process.env.GEMINI_MODEL) {
  const primary = normalizeGeminiModel(requestedModel, fallbackModel);
  return [primary, ...GEMINI_MODEL_FALLBACKS].filter((value, index, array) => value && array.indexOf(value) === index);
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
  stripGeminiModelPrefix,
  normalizeGeminiModel,
  buildGeminiModelCandidates,
};