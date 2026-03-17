const CompanyAdmin = require('../models/CompanyAdmin');

async function getStatus(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ paused: Boolean(company.agent_paused), status: company.agent_paused ? 'Paused' : 'Online' });
  } catch (err) {
    console.error('[admin agent] get status:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { paused } = req.body;
    if (typeof paused !== 'boolean') {
      return res.status(400).json({ error: 'paused (boolean) is required' });
    }
    await CompanyAdmin.setAgentPaused(req.adminCompanyId, paused);
    res.json({ paused, status: paused ? 'Paused' : 'Online' });
  } catch (err) {
    console.error('[admin agent] update status:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getStatus, updateStatus };
