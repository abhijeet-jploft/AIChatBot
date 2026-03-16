const CompanyAdmin = require('../models/CompanyAdmin');
const pool = require('../../db/index');

async function getSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json({
      companyId: company.company_id,
      name: company.name,
      displayName: company.display_name || company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
    });
  } catch (err) {
    console.error('[admin settings] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const { displayName, iconUrl, greetingMessage } = req.body;
    await CompanyAdmin.updateSettings(req.adminCompanyId, {
      display_name: displayName !== undefined ? displayName : undefined,
      icon_url: iconUrl !== undefined ? iconUrl : undefined,
      greeting_message: greetingMessage !== undefined ? greetingMessage : undefined,
    });

    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    res.json({
      companyId: company.company_id,
      name: company.name,
      displayName: company.display_name || company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
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

module.exports = { getSettings, updateSettings, listCompanies };
