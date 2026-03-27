const nodemailer = require('nodemailer');
const pool = require('../db/index');

/** Single cached transport for server-wide .env SMTP */
let cachedGlobalTransporter = null;

/** @type {Map<string, import('nodemailer').Transporter>} */
const companyTransporterCache = new Map();

function buildTransportOptionsFromEnv() {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port) return null;

  const options = { host, port, secure };
  if (user && pass) options.auth = { user, pass };
  return options;
}

function getGlobalTransporter() {
  if (cachedGlobalTransporter) return cachedGlobalTransporter;
  const options = buildTransportOptionsFromEnv();
  if (!options) return null;
  cachedGlobalTransporter = nodemailer.createTransport(options);
  return cachedGlobalTransporter;
}

function invalidateGlobalSmtpCache() {
  cachedGlobalTransporter = null;
}

/**
 * Clear cached nodemailer transport for a company (call after SMTP settings change).
 * @param {string} [companyId]  omit to clear all company caches
 */
function invalidateCompanySmtpCache(companyId) {
  if (companyId) companyTransporterCache.delete(companyId);
  else companyTransporterCache.clear();
}

function buildTransportFromRow(row) {
  const host = String(row.smtp_host || '').trim();
  if (!host) return null;
  const port = Number.parseInt(String(row.smtp_port ?? 587), 10) || 587;
  const secure = Boolean(row.smtp_secure) || port === 465;
  const options = { host, port, secure };
  const user = String(row.smtp_user || '').trim();
  const pass = row.smtp_password != null ? String(row.smtp_password) : '';
  if (user && pass) options.auth = { user, pass };
  return nodemailer.createTransport(options);
}

async function fetchSmtpSettingsRow(companyId) {
  const { rows } = await pool.query(
    `SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_email
     FROM smtp_settings WHERE company_id = $1`,
    [companyId]
  );
  return rows[0] || null;
}

/**
 * Company SMTP when `smtp_host` is set; otherwise global .env transport.
 * @param {string} companyId
 * @returns {Promise<import('nodemailer').Transporter | null>}
 */
async function getTransporterForCompany(companyId) {
  if (!companyId) return getGlobalTransporter();

  const row = await fetchSmtpSettingsRow(companyId);
  const host = row?.smtp_host?.trim();
  if (host) {
    if (companyTransporterCache.has(companyId)) {
      return companyTransporterCache.get(companyId);
    }
    const t = buildTransportFromRow(row);
    if (t) companyTransporterCache.set(companyId, t);
    return t;
  }

  return getGlobalTransporter();
}

/** "From" for lead mail: explicit company From (from smtp_settings row), then env. */
function resolveLeadFromAddress(smtpFromEmail) {
  const from = String(smtpFromEmail || '').trim();
  if (from) return from;
  return process.env.LEAD_NOTIFICATION_FROM || process.env.SMTP_USER || 'no-reply@localhost';
}

module.exports = {
  getGlobalTransporter,
  getTransporterForCompany,
  invalidateCompanySmtpCache,
  invalidateGlobalSmtpCache,
  buildTransportOptionsFromEnv,
  fetchSmtpSettingsRow,
  resolveLeadFromAddress,
};
