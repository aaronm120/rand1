const express = require('express');
const { db, auditLog } = require('../database');
const { requireAuth, requirePMAdmin, requirePM, isPM, isTenantAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/tenants — PM: all tenants; Tenant Admin: their own
router.get('/', requireAuth, (req, res) => {
  if (isPM(req.user)) {
    const tenants = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND active = 1) as user_count
      FROM tenants t ORDER BY t.building, t.name
    `).all();
    res.json(tenants);
  } else if (isTenantAdmin(req.user)) {
    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.user.tenant_id);
    res.json(tenant ? [tenant] : []);
  } else {
    const tenant = db.prepare('SELECT id, name, building, suite FROM tenants WHERE id=?').get(req.user.tenant_id);
    res.json(tenant ? [tenant] : []);
  }
});

// GET /api/tenants/:id
router.get('/:id', requireAuth, (req, res) => {
  if (!isPM(req.user) && req.user.tenant_id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  tenant.contacts = db.prepare('SELECT * FROM tenant_contacts WHERE tenant_id=? ORDER BY is_primary DESC, name').all(tenant.id);
  tenant.users = db.prepare('SELECT id, name, email, role, title, phone, directory_opt_out, active FROM users WHERE tenant_id=? ORDER BY name').all(tenant.id);
  res.json(tenant);
});

// POST /api/tenants — PM Admin only
router.post('/', requirePMAdmin, (req, res) => {
  const { name, building, suite } = req.body;
  if (!name?.trim() || !building) return res.status(400).json({ error: 'Name and building are required' });
  if (!['728','730','732'].includes(building)) return res.status(400).json({ error: 'Invalid building' });
  const result = db.prepare('INSERT INTO tenants (name, building, suite) VALUES (?, ?, ?)').run(name.trim(), building, suite || null);
  auditLog(req.user.id, 'create_tenant', 'tenant', result.lastInsertRowid, { name, building }, req.ip);
  res.status(201).json(db.prepare('SELECT * FROM tenants WHERE id=?').get(result.lastInsertRowid));
});

// PATCH /api/tenants/:id — PM Admin or Tenant Admin (limited)
router.patch('/:id', requireAuth, (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  if (!isPM(req.user) && req.user.tenant_id !== tenant.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, building, suite, active, directory_hidden, cascade_users } = req.body;
  const newBuilding = isPM(req.user) && building ? building : tenant.building;
  const newActive = isPM(req.user) && active !== undefined ? (active ? 1 : 0) : tenant.active;
  const newDirHidden = isPM(req.user) && directory_hidden !== undefined ? (directory_hidden ? 1 : 0) : (tenant.directory_hidden ?? 0);

  db.prepare(`UPDATE tenants SET name=?, building=?, suite=?, active=?, directory_hidden=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(name?.trim() || tenant.name, newBuilding, suite ?? tenant.suite, newActive, newDirHidden, req.params.id);

  if (isPM(req.user) && newActive === 0 && cascade_users) {
    db.prepare('UPDATE users SET active=0, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=?').run(req.params.id);
  }

  auditLog(req.user.id, 'update_tenant', 'tenant', req.params.id, { active: newActive }, req.ip);
  res.json(db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id));
});

// ── Tenant Contacts ────────────────────────────────────────────────────────────

// POST /api/tenants/:id/contacts
router.post('/:id/contacts', requireAuth, (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  if (!isPM(req.user) && req.user.tenant_id !== tenant.id) return res.status(403).json({ error: 'Access denied' });

  const { name, title, email, phone, is_primary } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Contact name required' });

  if (is_primary) {
    db.prepare('UPDATE tenant_contacts SET is_primary=0 WHERE tenant_id=?').run(tenant.id);
  }

  const result = db.prepare('INSERT INTO tenant_contacts (tenant_id, name, title, email, phone, is_primary) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tenant.id, name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM tenant_contacts WHERE id=?').get(result.lastInsertRowid));
});

// PATCH /api/tenants/contacts/:contactId
router.patch('/contacts/:contactId', requireAuth, (req, res) => {
  const contact = db.prepare('SELECT * FROM tenant_contacts WHERE id=?').get(req.params.contactId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (!isPM(req.user) && req.user.tenant_id !== contact.tenant_id) return res.status(403).json({ error: 'Access denied' });

  const { name, title, email, phone, is_primary } = req.body;
  if (is_primary) {
    db.prepare('UPDATE tenant_contacts SET is_primary=0 WHERE tenant_id=?').run(contact.tenant_id);
  }
  db.prepare('UPDATE tenant_contacts SET name=?, title=?, email=?, phone=?, is_primary=? WHERE id=?')
    .run(name ?? contact.name, title ?? contact.title, email ?? contact.email, phone ?? contact.phone,
      is_primary !== undefined ? (is_primary ? 1 : 0) : contact.is_primary, req.params.contactId);
  res.json(db.prepare('SELECT * FROM tenant_contacts WHERE id=?').get(req.params.contactId));
});

// DELETE /api/tenants/contacts/:contactId
// DELETE /api/tenants/:id — PM Admin only, blocks if tenant has active users
router.delete('/:id', requirePMAdmin, (req, res) => {
  const tenant = db.prepare('SELECT id, name FROM tenants WHERE id=?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenant_id=?').get(req.params.id).cnt;
  if (userCount > 0) {
    return res.status(409).json({ error: `Cannot delete tenant with ${userCount} user${userCount !== 1 ? 's' : ''}. Remove or reassign their accounts first.` });
  }
  const requestCount = db.prepare('SELECT COUNT(*) as cnt FROM service_requests WHERE tenant_id=?').get(req.params.id).cnt;
  if (requestCount > 0) {
    return res.status(409).json({ error: `Cannot delete tenant with ${requestCount} service request${requestCount !== 1 ? 's' : ''} on record.` });
  }
  const bookingCount = db.prepare('SELECT COUNT(*) as cnt FROM bookings WHERE tenant_id=?').get(req.params.id).cnt;
  if (bookingCount > 0) {
    return res.status(409).json({ error: `Cannot delete tenant with ${bookingCount} booking${bookingCount !== 1 ? 's' : ''} on record.` });
  }
  db.prepare('DELETE FROM tenant_contacts WHERE tenant_id=?').run(req.params.id);
  db.prepare('DELETE FROM leases WHERE tenant_id=?').run(req.params.id);
  db.prepare('DELETE FROM tenants WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_tenant', 'tenant', req.params.id, { name: tenant.name }, req.ip);
  res.json({ message: 'Tenant deleted' });
});

router.delete('/contacts/:contactId', requireAuth, (req, res) => {
  const contact = db.prepare('SELECT * FROM tenant_contacts WHERE id=?').get(req.params.contactId);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  if (!isPM(req.user) && req.user.tenant_id !== contact.tenant_id) return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM tenant_contacts WHERE id=?').run(req.params.contactId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
