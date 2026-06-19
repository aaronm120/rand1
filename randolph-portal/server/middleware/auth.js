const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'roc-portal-dev-secret-change-in-production';

// Roles: pm_admin > pm_user > tenant_admin > tenant_user
const PM_ROLES = ['pm_admin', 'pm_user'];
const TENANT_ROLES = ['tenant_admin', 'tenant_user'];

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requirePM(req, res, next) {
  requireAuth(req, res, () => {
    if (!PM_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Property management access required' });
    }
    next();
  });
}

function requirePMAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'pm_admin') {
      return res.status(403).json({ error: 'PM Admin access required' });
    }
    next();
  });
}

function requireTenantAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'tenant_admin' && !PM_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Tenant Admin access required' });
    }
    next();
  });
}

// Legacy alias kept for settings route
function requireAdmin(req, res, next) {
  return requirePMAdmin(req, res, next);
}

function isPM(user) { return PM_ROLES.includes(user.role); }
function isTenantAdmin(user) { return user.role === 'tenant_admin'; }
function isPMAdmin(user) { return user.role === 'pm_admin'; }

module.exports = {
  requireAuth, requirePM, requirePMAdmin, requireAdmin,
  requireTenantAdmin, isPM, isTenantAdmin, isPMAdmin,
  JWT_SECRET, PM_ROLES, TENANT_ROLES,
};
