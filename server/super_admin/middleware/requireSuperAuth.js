const SuperAdmin = require('../models/SuperAdmin');
const StaffAuth = require('../models/StaffAuth');
const { buildFullPermissionMatrix, getAiModePermissionKey, hasPermission } = require('../permissions');

const STAFF_IDLE_TIMEOUT_MINUTES = Number(process.env.SUPER_ADMIN_STAFF_IDLE_TIMEOUT_MINUTES || 120);

function nextStaffSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + STAFF_IDLE_TIMEOUT_MINUTES);
  return expiresAt;
}

async function requireSuperAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.query?.token;

  if (!token) {
    return res.status(401).json({ error: 'Super admin authentication required' });
  }

  const superSession = await SuperAdmin.findSessionByToken(token);
  if (superSession) {
    req.superAdminId = superSession.super_admin_id;
    req.superAdminUsername = superSession.username;
    req.isSuperAdmin = true;
    req.staffUserId = null;
    req.authUser = {
      type: 'super_admin',
      id: superSession.super_admin_id,
      username: superSession.username,
      name: superSession.username,
      email: superSession.email || null,
      roleName: 'Super Admin',
      permissions: buildFullPermissionMatrix(),
      mustChangePassword: false,
      defaultRoute: '/super-admin',
    };
    return next();
  }

  const staffSession = await StaffAuth.findSessionByToken(token);
  if (!staffSession || !staffSession.staff?.isActive) {
    return res.status(401).json({ error: 'Invalid or expired super admin session' });
  }

  const rollingExpiry = nextStaffSessionExpiry();
  await StaffAuth.touchSession(staffSession.sessionId, rollingExpiry);

  req.superAdminId = null;
  req.superAdminUsername = null;
  req.isSuperAdmin = false;
  req.staffUserId = staffSession.staff.id;
  req.authUser = {
    type: 'staff',
    id: staffSession.staff.id,
    username: staffSession.staff.email,
    name: staffSession.staff.name,
    email: staffSession.staff.email,
    roleId: staffSession.staff.roleId,
    roleIds: Array.isArray(staffSession.staff.roleIds) ? staffSession.staff.roleIds : [],
    roleName: staffSession.staff.roleName,
    permissions: staffSession.staff.permissions,
    mustChangePassword: staffSession.staff.mustChangePassword,
    defaultRoute: '/super-admin/staff',
  };
  return next();
}

function denyAccess(res, message = 'Access Denied', code = 'ACCESS_DENIED') {
  return res.status(403).json({ error: message, code });
}

function requirePermission(moduleKey, minimumLevel = 'view') {
  return (req, res, next) => {
    if (req.isSuperAdmin) return next();
    if (!req.authUser) return res.status(401).json({ error: 'Authentication required' });
    if (req.authUser.mustChangePassword) {
      return denyAccess(res, 'Password change required before accessing staff modules', 'PASSWORD_CHANGE_REQUIRED');
    }
    if (!hasPermission(req.authUser.permissions, moduleKey, minimumLevel)) {
      return denyAccess(res);
    }
    return next();
  };
}

function requireAnyPermission(checks) {
  return (req, res, next) => {
    if (req.isSuperAdmin) return next();
    if (!req.authUser) return res.status(401).json({ error: 'Authentication required' });
    if (req.authUser.mustChangePassword) {
      return denyAccess(res, 'Password change required before accessing staff modules', 'PASSWORD_CHANGE_REQUIRED');
    }
    const allowed = (checks || []).some(([moduleKey, minimumLevel]) => hasPermission(req.authUser.permissions, moduleKey, minimumLevel || 'view'));
    if (!allowed) return denyAccess(res);
    return next();
  };
}

function requireCompanySettingsMutation(req, res, next) {
  if (req.isSuperAdmin) return next();
  if (!req.authUser) return res.status(401).json({ error: 'Authentication required' });
  if (req.authUser.mustChangePassword) {
    return denyAccess(res, 'Password change required before accessing staff modules', 'PASSWORD_CHANGE_REQUIRED');
  }

  const body = req.body || {};
  const keys = Object.keys(body);
  const checks = [];

  if ('ai' in body) checks.push(['api_management', 'edit']);
  if ('aiMode' in body) checks.push([getAiModePermissionKey(body.aiMode) || 'ai_configuration', 'edit']);
  if ('voice' in body) checks.push(['voice_management', 'edit']);
  if ('theme' in body) checks.push(['system_settings', 'edit']);

  const businessKeys = [
    'companyName',
    'chatbotName',
    'iconUrl',
    'greetingMessage',
    'widget',
    'leadNotifications',
    'autoTrigger',
    'escalation',
    'safety',
    'language',
  ];

  if (keys.some((key) => businessKeys.includes(key))) {
    checks.push(['business_management', 'edit']);
  }

  if (!checks.length) return denyAccess(res);
  const allowed = checks.every(([moduleKey, minimumLevel]) => hasPermission(req.authUser.permissions, moduleKey, minimumLevel));
  if (!allowed) return denyAccess(res);
  return next();
}

module.exports = {
  requireSuperAuth,
  requirePermission,
  requireAnyPermission,
  requireCompanySettingsMutation,
};
