export const ACCESS_LEVELS = ['none', 'view', 'edit', 'full'];

const ACCESS_RANK = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

export const PERMISSION_MODULES = [
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

export function normalizePermissionMatrix(input) {
  return PERMISSION_MODULES.reduce((acc, moduleDef) => {
    const value = String(input?.[moduleDef.key] || 'none').trim().toLowerCase();
    acc[moduleDef.key] = Object.prototype.hasOwnProperty.call(ACCESS_RANK, value) ? value : 'none';
    return acc;
  }, {});
}

export function hasPermission(admin, moduleKey, minimumLevel = 'view') {
  if (admin?.type === 'super_admin') return true;
  const matrix = normalizePermissionMatrix(admin?.permissions);
  return (ACCESS_RANK[matrix[moduleKey]] || 0) >= (ACCESS_RANK[minimumLevel] || 0);
}

export function hasAnyPermission(admin, checks = []) {
  if (admin?.type === 'super_admin') return true;
  return checks.some(([moduleKey, minimumLevel]) => hasPermission(admin, moduleKey, minimumLevel || 'view'));
}

export function allowedModules(admin) {
  return PERMISSION_MODULES.filter((moduleDef) => hasPermission(admin, moduleDef.key, 'view'));
}