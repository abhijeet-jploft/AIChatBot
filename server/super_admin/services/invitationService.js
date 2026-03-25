const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port) return null;

  const options = { host, port, secure };
  if (user && pass) options.auth = { user, pass };
  cachedTransporter = nodemailer.createTransport(options);
  return cachedTransporter;
}

async function sendStaffInvitation({ name, email, roleName, temporaryPassword, loginUrl, invitedBy }) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: 'email_unconfigured' };

  const subject = 'Super Admin Staff Access Invitation';
  const text = [
    `Hello ${name || 'Team member'},`,
    '',
    'You have been granted staff access to the Super Admin panel.',
    roleName ? `Assigned role: ${roleName}` : null,
    invitedBy ? `Invited by: ${invitedBy}` : null,
    '',
    `Login URL: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'You must change your password immediately after signing in.',
  ].filter(Boolean).join('\n');

  await transporter.sendMail({
    from: process.env.LEAD_NOTIFICATION_FROM || process.env.SMTP_USER || 'no-reply@localhost',
    to: email,
    subject,
    text,
  });

  return { sent: true };
}

module.exports = {
  sendStaffInvitation,
};