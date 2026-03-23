const SuperAdmin = require('../models/SuperAdmin');

async function requireSuperAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.query?.token;

  if (!token) {
    return res.status(401).json({ error: 'Super admin authentication required' });
  }

  const session = await SuperAdmin.findSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired super admin session' });
  }

  req.superAdminId = session.super_admin_id;
  req.superAdminUsername = session.username;
  next();
}

module.exports = { requireSuperAuth };
