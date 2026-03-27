const pool = require('../db/index');
const { shouldSendEmailFor } = require('./notificationPreferencesService');
const {
  getTransporterForCompany,
  resolveLeadFromAddress,
} = require('./smtpTransportService');

function urgencyFromLead(lead = {}) {
  const category = String(lead.lead_score_category || '').toLowerCase();
  if (category === 'very_hot' || category === 'hot') return 'high';
  if (category === 'warm') return 'medium';
  return 'low';
}

function formatLeadName(lead = {}) {
  return lead.name || lead.email || lead.phone || 'Unnamed lead';
}

async function getCompanyNotificationConfig(companyId) {
  const { rows } = await pool.query(
    `SELECT
      c.company_id,
      COALESCE(NULLIF(BTRIM(c.name), ''), c.company_id) AS company_name,
      ld.lead_email_notifications_enabled,
      ld.lead_notification_email,
      sm.smtp_from_email
     FROM chatbots c
     INNER JOIN chat_settings ch ON ch.company_id = c.company_id
     INNER JOIN lead_settings ld ON ld.company_id = c.company_id
     LEFT JOIN smtp_settings sm ON sm.company_id = c.company_id
     WHERE c.company_id = $1`,
    [companyId]
  );

  return rows[0] || null;
}

async function canSendLeadEmail(companyId, config) {
  if (!config?.lead_email_notifications_enabled || !config?.lead_notification_email) return false;
  const t = await getTransporterForCompany(companyId);
  return Boolean(t);
}

async function sendNewLeadNotification({ companyId, lead }) {
  if (!companyId || !lead) {
    return { sent: false, reason: 'missing_context' };
  }

  const nType = (lead?.ai_detected_intent || '') === 'meeting_booking' ? 'meeting_request' : 'new_lead';
  if (!(await shouldSendEmailFor(companyId, nType))) {
    return { sent: false, reason: 'notification_preferences' };
  }

  const config = await getCompanyNotificationConfig(companyId);
  if (!(await canSendLeadEmail(companyId, config))) {
    return { sent: false, reason: 'email_disabled_or_unconfigured' };
  }

  const transporter = await getTransporterForCompany(companyId);
  const urgency = urgencyFromLead(lead);
  const leadName = formatLeadName(lead);
  const service = lead.service_requested || 'Not specified';

  const subject = `[${config.company_name}] New Lead (${urgency.toUpperCase()})`;
  const text = [
    `A new lead was captured for ${config.company_name}.`,
    '',
    `Lead Name: ${leadName}`,
    `Service Requested: ${service}`,
    `Urgency Level: ${urgency}`,
    `Lead Score: ${lead.lead_score || 0} (${lead.lead_score_category || 'cold'})`,
    `Contact: ${lead.phone || '-'} / ${lead.email || '-'}`,
    `Captured At: ${new Date(lead.created_at || Date.now()).toISOString()}`,
  ].join('\n');

  await transporter.sendMail({
    from: resolveLeadFromAddress(config.smtp_from_email),
    to: config.lead_notification_email,
    subject,
    text,
  });

  return { sent: true };
}

async function sendDueReminderDigest(companyId) {
  if (!companyId) {
    return { sent: false, reason: 'missing_company' };
  }

  if (!(await shouldSendEmailFor(companyId, 'new_lead'))) {
    return { sent: false, reason: 'notification_preferences' };
  }

  const config = await getCompanyNotificationConfig(companyId);
  if (!(await canSendLeadEmail(companyId, config))) {
    return { sent: false, reason: 'email_disabled_or_unconfigured' };
  }

  const { rows } = await pool.query(
    `SELECT
      id,
      name,
      phone,
      email,
      service_requested,
      lead_score,
      lead_score_category,
      reminder_at,
      reminder_note
     FROM leads
     WHERE company_id = $1
       AND deleted_at IS NULL
       AND reminder_at IS NOT NULL
       AND reminder_at <= NOW()
       AND status NOT IN ('converted', 'lost')
       AND (reminder_notified_at IS NULL OR reminder_notified_at::date < CURRENT_DATE)
     ORDER BY reminder_at ASC
     LIMIT 20`,
    [companyId]
  );

  if (!rows.length) {
    return { sent: false, reason: 'no_due_reminders' };
  }

  const lines = rows.map((lead) => {
    const urgency = urgencyFromLead(lead);
    return [
      `- ${formatLeadName(lead)} (${urgency.toUpperCase()})`,
      `  Service: ${lead.service_requested || 'Not specified'}`,
      `  Reminder: ${new Date(lead.reminder_at).toISOString()}`,
      `  Note: ${lead.reminder_note || '-'}`,
      `  Contact: ${lead.phone || '-'} / ${lead.email || '-'}`,
    ].join('\n');
  });

  const subject = `[${config.company_name}] Reminder: ${rows.length} lead follow-up${rows.length === 1 ? '' : 's'} due`;
  const text = [
    `You have ${rows.length} lead reminder${rows.length === 1 ? '' : 's'} due in ${config.company_name}.`,
    '',
    ...lines,
  ].join('\n');

  const transporter = await getTransporterForCompany(companyId);
  await transporter.sendMail({
    from: resolveLeadFromAddress(config.smtp_from_email),
    to: config.lead_notification_email,
    subject,
    text,
  });

  await pool.query(
    `UPDATE leads
     SET reminder_notified_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [rows.map((lead) => lead.id)]
  );

  return { sent: true, count: rows.length };
}

module.exports = {
  sendDueReminderDigest,
  sendNewLeadNotification,
};
