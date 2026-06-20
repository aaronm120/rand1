const express = require('express');
const { db } = require('../database');
const { requireAuth, isPM } = require('../middleware/auth');

const router = express.Router();

// GET /api/directory?building=728&q=search
router.get('/', requireAuth, (req, res) => {
  const { building, q } = req.query;
  const pm = isPM(req.user);

  // Build tenants with their users
  let tenantWhere = ['t.active = 1'];
  let tenantParams = [];
  if (!pm) tenantWhere.push('t.directory_hidden = 0');
  if (building && ['728','730','732'].includes(building)) {
    tenantWhere.push('t.building = ?');
    tenantParams.push(building);
  }

  let tenants = db.prepare(`
    SELECT t.id, t.name, t.building, t.suite FROM tenants t
    WHERE ${tenantWhere.join(' AND ')}
    ORDER BY t.building, t.name
  `).all(...tenantParams);

  for (const tenant of tenants) {
    // Users: PM sees all, tenants see opted-in users
    const optOutFilter = pm ? '' : 'AND u.directory_opt_out = 0';
    let users = db.prepare(`
      SELECT u.id, u.name, u.title, u.email, u.phone, u.directory_opt_out, u.role
      FROM users u
      WHERE u.tenant_id = ? AND u.active = 1 ${optOutFilter}
      ORDER BY u.name
    `).all(tenant.id);

    // Apply search filter to users if provided
    if (q) {
      const ql = q.toLowerCase();
      users = users.filter(u =>
        u.name?.toLowerCase().includes(ql) ||
        u.title?.toLowerCase().includes(ql) ||
        u.email?.toLowerCase().includes(ql)
      );
    }

    // Named contacts
    tenant.contacts = db.prepare('SELECT * FROM tenant_contacts WHERE tenant_id=? ORDER BY is_primary DESC, name ASC').all(tenant.id);
    tenant.users = users;
  }

  // Filter tenants with no visible users if searching
  const result = q
    ? tenants.filter(t => {
        const ql = q.toLowerCase();
        const nameMatch = t.name.toLowerCase().includes(ql);
        return nameMatch || t.users.length > 0;
      })
    : tenants;

  res.json(result);
});

module.exports = router;
