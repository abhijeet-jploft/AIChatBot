const CompanyAdmin = require('../models/CompanyAdmin');

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.query?.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await CompanyAdmin.findSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.adminCompanyId = session.company_id;
  req.adminCompanyName = session.name;
  next();
}

module.exports = { requireAuth };
