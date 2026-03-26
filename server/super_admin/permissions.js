const ACCESS_LEVELS = ['none', 'view', 'edit', 'full'];

const ACCESS_RANK = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

const AI_MODE_PERMISSION_MODULES = [
  { key: 'ai_mode_lead_generation', label: 'AI Mode: Lead Generation', sensitive: false, modeId: 'lead_generation' },
  { key: 'ai_mode_meeting_booking', label: 'AI Mode: Meeting Booking', sensitive: false, modeId: 'meeting_booking' },
  { key: 'ai_mode_product_recommendation', label: 'AI Mode: Product Recommendation', sensitive: false, modeId: 'product_recommendation' },
  { key: 'ai_mode_customer_support', label: 'AI Mode: Customer Support', sensitive: false, modeId: 'customer_support' },
  { key: 'ai_mode_mixed_mode', label: 'AI Mode: Mixed Mode', sensitive: false, modeId: 'mixed_mode' },
];

const AI_MODE_PERMISSION_KEY_BY_MODE = AI_MODE_PERMISSION_MODULES.reduce((acc, moduleDef) => {
  acc[moduleDef.modeId] = moduleDef.key;
  return acc;
}, {});

const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', sensitive: false },
  { key: 'business_management', label: 'Business Management', sensitive: false },
  { key: 'user_management', label: 'User Management', sensitive: false },
  { key: 'ai_configuration', label: 'AI Configuration', sensitive: false },
  ...AI_MODE_PERMISSION_MODULES,
  { key: 'training_scrape', label: 'Training: Website scraping', sensitive: false },
  { key: 'training_conversational', label: 'Training: Conversational', sensitive: false },
  { key: 'training_documents', label: 'Training: Documents', sensitive: false },
  { key: 'training_database', label: 'Training: Database / SQL', sensitive: false },
  { key: 'training_media', label: 'Training: Media', sensitive: false },
  { key: 'training_structured', label: 'Training: Structured CSV / Excel', sensitive: false },
  { key: 'training_manual', label: 'Training: Manual knowledge', sensitive: false },
  { key: 'voice_management', label: 'Voice Management', sensitive: false },
  { key: 'api_management', label: 'API Management', sensitive: false },
  { key: 'conversation_monitoring', label: 'Conversation Monitoring', sensitive: false },
  { key: 'analytics', label: 'Analytics', sensitive: false },
  { key: 'billing_revenue', label: 'Billing & Revenue', sensitive: true },
  { key: 'subscription_management', label: 'Subscription Management', sensitive: true },
  { key: 'support_tickets', label: 'Support Tickets', sensitive: false },
  { key: 'system_settings', label: 'System Settings', sensitive: true },
];

function buildEmptyPermissionMatrix() {
  return PERMISSION_MODULES.reduce((acc, moduleDef) => {
    acc[moduleDef.key] = 'none';
    return acc;
  }, {});
}

function normalizeAccessLevel(value) {
  const next = String(value || 'none').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ACCESS_RANK, next) ? next : 'none';
}

function normalizePermissionMatrix(input) {
  const base = buildEmptyPermissionMatrix();
  if (!input || typeof input !== 'object') return base;

  for (const moduleDef of PERMISSION_MODULES) {
    base[moduleDef.key] = normalizeAccessLevel(input[moduleDef.key]);
  }
  return base;
}

function buildFullPermissionMatrix() {
  return PERMISSION_MODULES.reduce((acc, moduleDef) => {
    acc[moduleDef.key] = 'full';
    return acc;
  }, {});
}

function getAiModePermissionKey(modeId) {
  const normalizedModeId = String(modeId || '').trim().toLowerCase().replace(/\s+/g, '_');
  return AI_MODE_PERMISSION_KEY_BY_MODE[normalizedModeId] || null;
}

function mergePermissionMatrices(matrices) {
  const list = Array.isArray(matrices) ? matrices.filter(Boolean) : [];
  if (!list.length) return buildEmptyPermissionMatrix();
  const merged = buildEmptyPermissionMatrix();
  for (const moduleDef of PERMISSION_MODULES) {
    const key = moduleDef.key;
    let best = 0;
    for (const m of list) {
      const norm = normalizePermissionMatrix(m);
      const rank = ACCESS_RANK[norm[key] || 'none'] || 0;
      if (rank > best) best = rank;
    }
    merged[key] = ACCESS_LEVELS[best] || 'none';
  }
  return merged;
}

function hasPermission(matrix, moduleKey, minimumLevel = 'view') {
  const normalized = normalizePermissionMatrix(matrix);
  const current = normalized[moduleKey] || 'none';
  const requiredRank = ACCESS_RANK[normalizeAccessLevel(minimumLevel)] || 0;
  if ((ACCESS_RANK[current] || 0) >= requiredRank) return true;

  if (String(moduleKey || '').startsWith('ai_mode_')) {
    return (ACCESS_RANK[normalized.ai_configuration] || 0) >= requiredRank;
  }

  return false;
}

function hasAnyAiModePermission(matrix, minimumLevel = 'view') {
  if (hasPermission(matrix, 'ai_configuration', minimumLevel)) return true;
  return AI_MODE_PERMISSION_MODULES.some((moduleDef) => hasPermission(matrix, moduleDef.key, minimumLevel));
}

function buildAiModePermissionChecks(minimumLevel = 'view') {
  return [
    ['ai_configuration', minimumLevel],
    ...AI_MODE_PERMISSION_MODULES.map((moduleDef) => [moduleDef.key, minimumLevel]),
  ];
}

module.exports = {
  ACCESS_LEVELS,
  AI_MODE_PERMISSION_MODULES,
  PERMISSION_MODULES,
  buildEmptyPermissionMatrix,
  buildAiModePermissionChecks,
  buildFullPermissionMatrix,
  getAiModePermissionKey,
  hasAnyAiModePermission,
  mergePermissionMatrices,
  normalizeAccessLevel,
  normalizePermissionMatrix,
  hasPermission,
};