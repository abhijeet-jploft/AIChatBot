const ACCESS_LEVELS = ['none', 'view', 'edit', 'full'];

const ACCESS_RANK = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', sensitive: false },
  { key: 'business_management', label: 'Business Management', sensitive: false },
  { key: 'user_management', label: 'User Management', sensitive: false },
  { key: 'ai_configuration', label: 'AI Configuration', sensitive: false },
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

function hasPermission(matrix, moduleKey, minimumLevel = 'view') {
  const normalized = normalizePermissionMatrix(matrix);
  const current = normalized[moduleKey] || 'none';
  return (ACCESS_RANK[current] || 0) >= (ACCESS_RANK[normalizeAccessLevel(minimumLevel)] || 0);
}

module.exports = {
  ACCESS_LEVELS,
  PERMISSION_MODULES,
  buildEmptyPermissionMatrix,
  buildFullPermissionMatrix,
  normalizeAccessLevel,
  normalizePermissionMatrix,
  hasPermission,
};