export const ACCESS_LEVELS = ['none', 'view', 'edit', 'full'];

const ACCESS_RANK = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

export const AI_MODE_PERMISSION_MODULES = [
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

export const PERMISSION_MODULES = [
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

export function normalizePermissionMatrix(input) {
  return PERMISSION_MODULES.reduce((acc, moduleDef) => {
    const value = String(input?.[moduleDef.key] || 'none').trim().toLowerCase();
    acc[moduleDef.key] = Object.prototype.hasOwnProperty.call(ACCESS_RANK, value) ? value : 'none';
    return acc;
  }, {});
}

export function getAiModePermissionKey(modeId) {
  const normalizedModeId = String(modeId || '').trim().toLowerCase().replace(/\s+/g, '_');
  return AI_MODE_PERMISSION_KEY_BY_MODE[normalizedModeId] || null;
}

export function hasPermission(admin, moduleKey, minimumLevel = 'view') {
  if (admin?.type === 'super_admin') return true;
  const matrix = normalizePermissionMatrix(admin?.permissions);
  const requiredRank = ACCESS_RANK[minimumLevel] || 0;
  const currentRank = ACCESS_RANK[matrix[moduleKey]] || 0;
  if (currentRank >= requiredRank) return true;

  if (String(moduleKey || '').startsWith('ai_mode_')) {
    return (ACCESS_RANK[matrix.ai_configuration] || 0) >= requiredRank;
  }

  return false;
}

export function hasAnyPermission(admin, checks = []) {
  if (admin?.type === 'super_admin') return true;
  return checks.some(([moduleKey, minimumLevel]) => hasPermission(admin, moduleKey, minimumLevel || 'view'));
}

export function hasAnyAiModePermission(admin, minimumLevel = 'view') {
  if (hasPermission(admin, 'ai_configuration', minimumLevel)) return true;
  return AI_MODE_PERMISSION_MODULES.some((moduleDef) => hasPermission(admin, moduleDef.key, minimumLevel));
}

export function buildAiModePermissionChecks(minimumLevel = 'view') {
  return [
    ['ai_configuration', minimumLevel],
    ...AI_MODE_PERMISSION_MODULES.map((moduleDef) => [moduleDef.key, minimumLevel]),
  ];
}

export function allowedModules(admin) {
  return PERMISSION_MODULES.filter((moduleDef) => hasPermission(admin, moduleDef.key, 'view'));
}