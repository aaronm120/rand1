const express = require('express');
const { db, auditLog } = require('../database');
const { requirePMAdmin } = require('../middleware/auth');

const router = express.Router();

// All lease routes are PM Admin only

// GET /api/leases
router.get('/', requirePMAdmin, (req, res) => {
  const { building, tenant_id } = req.query;
  let where = [];
  let params = [];
  if (building) { where.push('l.building = ?'); params.push(building); }
  if (tenant_id) { where.push('l.tenant_id = ?'); params.push(tenant_id); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const leases = db.prepare(`
    SELECT l.*, t.name as tenant_name, t.suite as tenant_suite
    FROM leases l JOIN tenants t ON l.tenant_id = t.id
    ${whereClause}
    ORDER BY l.end_date ASC
  `).all(...params);
  res.json(leases);
});

// GET /api/leases/:id
router.get('/:id', requirePMAdmin, (req, res) => {
  const lease = db.prepare(`
    SELECT l.*, t.name as tenant_name FROM leases l JOIN tenants t ON l.tenant_id = t.id WHERE l.id = ?
  `).get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });
  res.json(lease);
});

// POST /api/leases
router.post('/', requirePMAdmin, (req, res) => {
  const { tenant_id, building, suite, start_date, end_date, monthly_rent, notes } = req.body;
  if (!tenant_id || !building || !suite || !start_date || !end_date) {
    return res.status(400).json({ error: 'Tenant, building, suite, start date, and end date are required' });
  }
  const tenant = db.prepare('SELECT id FROM tenants WHERE id=?').get(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const result = db.prepare(`
    INSERT INTO leases (tenant_id, building, suite, start_date, end_date, monthly_rent, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tenant_id, building, suite, start_date, end_date, monthly_rent || null, notes || null);

  auditLog(req.user.id, 'create_lease', 'lease', result.lastInsertRowid, { tenant_id }, req.ip);
  res.status(201).json(db.prepare('SELECT l.*, t.name as tenant_name FROM leases l JOIN tenants t ON l.tenant_id = t.id WHERE l.id = ?').get(result.lastInsertRowid));
});

// PATCH /api/leases/:id
router.patch('/:id', requirePMAdmin, (req, res) => {
  const { suite, start_date, end_date, monthly_rent, notes } = req.body;
  const lease = db.prepare('SELECT * FROM leases WHERE id=?').get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });
  db.prepare(`UPDATE leases SET suite=?, start_date=?, end_date=?, monthly_rent=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(suite ?? lease.suite, start_date ?? lease.start_date, end_date ?? lease.end_date,
      monthly_rent !== undefined ? monthly_rent : lease.monthly_rent, notes !== undefined ? notes : lease.notes, req.params.id);
  auditLog(req.user.id, 'update_lease', 'lease', req.params.id, null, req.ip);
  res.json(db.prepare('SELECT l.*, t.name as tenant_name FROM leases l JOIN tenants t ON l.tenant_id=t.id WHERE l.id=?').get(req.params.id));
});

// DELETE /api/leases/:id
router.delete('/:id', requirePMAdmin, (req, res) => {
  const lease = db.prepare('SELECT id FROM leases WHERE id=?').get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM leases WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_lease', 'lease', req.params.id, null, req.ip);
  res.json({ message: 'Deleted' });
});

module.exports = router;
