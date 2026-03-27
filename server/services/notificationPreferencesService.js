const pool = require('../db/index');

const DEFAULTS = {
  channelEmail: true,
  channelDashboard: true,
  types: {
    newLead: true,
    meetingRequest: true,
    trainingCompletion: true,
    payment: true,
    systemAlert: true,
  },
};

function rowToPrefs(row) {
  if (!row) return normalizePrefs(null);
  return {
    channelEmail: Boolean(row.channel_email),
    channelDashboard: Boolean(row.channel_dashboard),
    types: {
      newLead: Boolean(row.notify_new_lead),
      meetingRequest: Boolean(row.notify_meeting_request),
      trainingCompletion: Boolean(row.notify_training_completion),
      payment: Boolean(row.notify_payment),
      systemAlert: Boolean(row.notify_system_alert),
    },
  };
}

function normalizePrefs(raw) {
  const t = { ...DEFAULTS.types, ...(raw?.types || {}) };
  return {
    channelEmail: raw?.channelEmail !== undefined ? Boolean(raw.channelEmail) : DEFAULTS.channelEmail,
    channelDashboard: raw?.channelDashboard !== undefined ? Boolean(raw.channelDashboard) : DEFAULTS.channelDashboard,
    types: {
      newLead: t.newLead !== false,
      meetingRequest: t.meetingRequest !== false,
      trainingCompletion: t.trainingCompletion !== false,
      payment: t.payment !== false,
      systemAlert: t.systemAlert !== false,
    },
  };
}

async function getNotificationPreferences(companyId) {
  if (!companyId) return normalizePrefs(null);
  const { rows } = await pool.query(
    `SELECT channel_email, channel_dashboard,
            notify_new_lead, notify_meeting_request, notify_training_completion,
            notify_payment, notify_system_alert
     FROM notification_preferences WHERE company_id = $1`,
    [companyId]
  );
  return rowToPrefs(rows[0]);
}

/**
 * @param {string} notificationType  'new_lead' | 'meeting_request' | 'training_completion' | 'payment' | 'system_alert'
 */
function prefsAllowType(pRef, notificationType) {
  const key = {
    new_lead: 'newLead',
    meeting_request: 'meetingRequest',
    training_completion: 'trainingCompletion',
    payment: 'payment',
    system_alert: 'systemAlert',
  }[notificationType];
  if (!key) return true;
  return pRef.types[key] !== false;
}

function prefsAllowEmail(pRef, notificationType) {
  return Boolean(pRef.channelEmail) && prefsAllowType(pRef, notificationType);
}

function prefsAllowDashboard(pRef, notificationType) {
  return Boolean(pRef.channelDashboard) && prefsAllowType(pRef, notificationType);
}

async function shouldSendEmailFor(companyId, notificationType) {
  const p = await getNotificationPreferences(companyId);
  return prefsAllowEmail(p, notificationType);
}

/**
 * @param {string} companyId
 * @param {{ kind?: string, meetingRequested?: boolean }} payload
 */
async function shouldSendDashboardAlert(companyId, payload) {
  const p = await getNotificationPreferences(companyId);
  if (!p.channelDashboard) return false;
  const kind = String(payload?.kind || '');
  let nType = 'system_alert';
  if (kind === 'lead_captured') {
    nType = payload.meetingRequested ? 'meeting_request' : 'new_lead';
  } else if (kind.startsWith('escalation_') || kind === 'support_request') {
    nType = 'system_alert';
  }
  return prefsAllowType(p, nType);
}

async function updateNotificationPreferences(companyId, patch) {
  const cur = await getNotificationPreferences(companyId);
  const next = normalizePrefs({
    channelEmail: patch.channelEmail !== undefined ? patch.channelEmail : cur.channelEmail,
    channelDashboard: patch.channelDashboard !== undefined ? patch.channelDashboard : cur.channelDashboard,
    types: {
      newLead: patch.types?.newLead !== undefined ? patch.types.newLead : cur.types.newLead,
      meetingRequest: patch.types?.meetingRequest !== undefined ? patch.types.meetingRequest : cur.types.meetingRequest,
      trainingCompletion: patch.types?.trainingCompletion !== undefined ? patch.types.trainingCompletion : cur.types.trainingCompletion,
      payment: patch.types?.payment !== undefined ? patch.types.payment : cur.types.payment,
      systemAlert: patch.types?.systemAlert !== undefined ? patch.types.systemAlert : cur.types.systemAlert,
    },
  });

  await pool.query(
    `INSERT INTO notification_preferences (
       company_id,
       channel_email, channel_dashboard,
       notify_new_lead, notify_meeting_request, notify_training_completion,
       notify_payment, notify_system_alert
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (company_id) DO UPDATE SET
       channel_email = EXCLUDED.channel_email,
       channel_dashboard = EXCLUDED.channel_dashboard,
       notify_new_lead = EXCLUDED.notify_new_lead,
       notify_meeting_request = EXCLUDED.notify_meeting_request,
       notify_training_completion = EXCLUDED.notify_training_completion,
       notify_payment = EXCLUDED.notify_payment,
       notify_system_alert = EXCLUDED.notify_system_alert,
       updated_at = NOW()`,
    [
      companyId,
      next.channelEmail,
      next.channelDashboard,
      next.types.newLead,
      next.types.meetingRequest,
      next.types.trainingCompletion,
      next.types.payment,
      next.types.systemAlert,
    ]
  );
  return next;
}

module.exports = {
  DEFAULTS,
  getNotificationPreferences,
  updateNotificationPreferences,
  shouldSendEmailFor,
  shouldSendDashboardAlert,
  prefsAllowEmail,
  prefsAllowType,
  normalizePrefs,
};
