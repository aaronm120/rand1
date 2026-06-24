const jwt = require('jsonwebtoken');
const { db } = require('../database');

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

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
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Confirm the account is still active, role hasn't changed, and token hasn't been invalidated
  const live = db.prepare('SELECT active, role, token_version FROM users WHERE id=?').get(req.user.id);
  if (!live || !live.active) {
    return res.status(401).json({ error: 'This account has been deactivated.' });
  }
  if (live.role !== req.user.role) {
    return res.status(401).json({ error: 'Your session is outdated. Please sign in again.' });
  }
  if ((live.token_version || 0) !== (req.user.token_version || 0)) {
    return res.status(401).json({ error: 'Your session has been invalidated. Please sign in again.' });
  }
  next();
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
