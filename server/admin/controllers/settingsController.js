const CompanyAdmin = require('../models/CompanyAdmin');
const pool = require('../../db/index');
const { mergeCompanyTheme } = require('../../services/companyTheme');
const {
  getModeCatalog,
  isValidConversationModeId,
  normalizeConversationModeId,
} = require('../../services/conversationModes');

function normalizeNotificationEmail(value) {
  if (value === undefined) return undefined;
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const modeCatalog = getModeCatalog(company.ai_mode);
    res.json({
      companyId: company.company_id,
      name: company.name,
      displayName: company.display_name || company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
      aiMode: modeCatalog.active,
      leadNotifications: {
        emailEnabled: Boolean(company.lead_email_notifications_enabled),
        email: company.lead_notification_email || null,
      },
      theme: mergeCompanyTheme(company.company_id, {
        primaryColor: company.theme_primary_color,
        primaryDarkColor: company.theme_primary_dark_color,
        secondaryColor: company.theme_secondary_color,
        secondaryLightColor: company.theme_secondary_light_color,
      }),
    });
  } catch (err) {
    console.error('[admin settings] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const { displayName, iconUrl, greetingMessage, aiMode, theme, leadNotifications } = req.body;

    if (aiMode !== undefined && !isValidConversationModeId(aiMode)) {
      return res.status(400).json({ error: 'Invalid aiMode value' });
    }

    const emailEnabled = leadNotifications?.emailEnabled;
    const email = normalizeNotificationEmail(leadNotifications?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid lead notification email' });
    }
    if (emailEnabled === true && !email) {
      return res.status(400).json({ error: 'Lead notification email is required when email notifications are enabled' });
    }

    await CompanyAdmin.updateSettings(req.adminCompanyId, {
      display_name: displayName !== undefined ? displayName : undefined,
      icon_url: iconUrl !== undefined ? iconUrl : undefined,
      greeting_message: greetingMessage !== undefined ? greetingMessage : undefined,
      ai_mode: aiMode !== undefined ? normalizeConversationModeId(aiMode) : undefined,
      theme_primary_color: theme?.primaryColor !== undefined ? theme.primaryColor : undefined,
      theme_primary_dark_color: theme?.primaryDarkColor !== undefined ? theme.primaryDarkColor : undefined,
      theme_secondary_color: theme?.secondaryColor !== undefined ? theme.secondaryColor : undefined,
      theme_secondary_light_color: theme?.secondaryLightColor !== undefined ? theme.secondaryLightColor : undefined,
      lead_email_notifications_enabled: emailEnabled !== undefined ? Boolean(emailEnabled) : undefined,
      lead_notification_email: email !== undefined ? email : undefined,
    });

    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    const modeCatalog = getModeCatalog(company.ai_mode);
    res.json({
      companyId: company.company_id,
      name: company.name,
      displayName: company.display_name || company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
      aiMode: modeCatalog.active,
      leadNotifications: {
        emailEnabled: Boolean(company.lead_email_notifications_enabled),
        email: company.lead_notification_email || null,
      },
      theme: mergeCompanyTheme(company.company_id, {
        primaryColor: company.theme_primary_color,
        primaryDarkColor: company.theme_primary_dark_color,
        secondaryColor: company.theme_secondary_color,
        secondaryLightColor: company.theme_secondary_light_color,
      }),
    });
  } catch (err) {
    console.error('[admin settings] update:', err);
    res.status(500).json({ error: err.message });
  }
}

async function listCompanies(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT company_id, name, display_name FROM chatbots
       WHERE company_id != '_default'
       ORDER BY name ASC`
    );
    res.json(rows.map((r) => ({
      companyId: r.company_id,
      name: r.name,
      displayName: r.display_name || r.name,
    })));
  } catch (err) {
    console.error('[admin] list companies:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getModeSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(getModeCatalog(company.ai_mode));
  } catch (err) {
    console.error('[admin settings] modes:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getSettings, updateSettings, listCompanies, getModeSettings };
