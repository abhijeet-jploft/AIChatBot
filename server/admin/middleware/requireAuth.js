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
  req.adminCompanySuspended = Boolean(session.is_suspended);

  const isWriteMethod = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase());
  const isAllowedWhileSuspended = req.path === '/auth/logout';
  if (req.adminCompanySuspended && isWriteMethod && !isAllowedWhileSuspended) {
    return res.status(423).json({
      error: 'This company is suspended. Changes are disabled until reactivated by super admin.',
      code: 'COMPANY_SUSPENDED',
    });
  }
  next();
}

module.exports = { requireAuth };
