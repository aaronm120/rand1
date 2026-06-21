const express = require('express');
const { db, auditLog } = require('../database');
const { requireAuth, requirePMAdmin, requirePM, isPM } = require('../middleware/auth');

const router = express.Router();

// GET /api/amenities — list active amenities (all authenticated users)
router.get('/', requireAuth, (req, res) => {
  const showAll = req.query.all === 'true' && isPM(req.user);
  const where = showAll ? '' : 'WHERE active = 1';
  const amenities = db.prepare(`SELECT * FROM amenities ${where} ORDER BY name`).all();
  for (const a of amenities) {
    a.resources = db.prepare('SELECT * FROM amenity_resources WHERE amenity_id = ? AND active = 1 ORDER BY name').all(a.id);
  }
  res.json(amenities);
});

// GET /api/amenities/:id
router.get('/:id', requireAuth, (req, res) => {
  const amenity = db.prepare('SELECT * FROM amenities WHERE id=?').get(req.params.id);
  if (!amenity) return res.status(404).json({ error: 'Amenity not found' });
  amenity.resources = db.prepare('SELECT * FROM amenity_resources WHERE amenity_id=? AND active=1 ORDER BY name').all(amenity.id);
  res.json(amenity);
});

// POST /api/amenities — PM Admin only
router.post('/', requirePMAdmin, (req, res) => {
  const { name, description, location, capacity } = req.body;
  if (!name?.trim() || !capacity) return res.status(400).json({ error: 'Name and capacity are required' });
  const result = db.prepare(`INSERT INTO amenities (name, description, location, capacity) VALUES (?, ?, ?, ?)`)
    .run(name.trim(), description || null, location || null, parseInt(capacity));
  auditLog(req.user.id, 'create_amenity', 'amenity', result.lastInsertRowid, null, req.ip);
  const amenity = db.prepare('SELECT * FROM amenities WHERE id=?').get(result.lastInsertRowid);
  amenity.resources = [];
  res.status(201).json(amenity);
});

// PATCH /api/amenities/:id — PM Admin only
router.patch('/:id', requirePMAdmin, (req, res) => {
  const { name, description, location, capacity, active } = req.body;
  const a = db.prepare('SELECT * FROM amenities WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE amenities SET name=?, description=?, location=?, capacity=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(name ?? a.name, description ?? a.description, location ?? a.location,
      capacity ? parseInt(capacity) : a.capacity, active !== undefined ? (active ? 1 : 0) : a.active, req.params.id);
  auditLog(req.user.id, 'update_amenity', 'amenity', req.params.id, null, req.ip);
  const updated = db.prepare('SELECT * FROM amenities WHERE id=?').get(req.params.id);
  updated.resources = db.prepare('SELECT * FROM amenity_resources WHERE amenity_id=? ORDER BY name').all(req.params.id);
  res.json(updated);
});

// POST /api/amenities/:id/resources — add add-on resource
router.post('/:id/resources', requirePMAdmin, (req, res) => {
  const { name, quantity } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Resource name required' });
  const a = db.prepare('SELECT id FROM amenities WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Amenity not found' });
  const result = db.prepare('INSERT INTO amenity_resources (amenity_id, name, quantity) VALUES (?, ?, ?)')
    .run(req.params.id, name.trim(), parseInt(quantity) || 1);
  res.status(201).json(db.prepare('SELECT * FROM amenity_resources WHERE id=?').get(result.lastInsertRowid));
});

// PATCH /api/amenities/resources/:resId — update resource
router.patch('/resources/:resId', requirePMAdmin, (req, res) => {
  const { name, quantity, active } = req.body;
  const r = db.prepare('SELECT * FROM amenity_resources WHERE id=?').get(req.params.resId);
  if (!r) return res.status(404).json({ error: 'Resource not found' });
  db.prepare('UPDATE amenity_resources SET name=?, quantity=?, active=? WHERE id=?')
    .run(name ?? r.name, quantity ? parseInt(quantity) : r.quantity, active !== undefined ? (active ? 1 : 0) : r.active, req.params.resId);
  res.json(db.prepare('SELECT * FROM amenity_resources WHERE id=?').get(req.params.resId));
});

// DELETE /api/amenities/resources/:resId — delete resource
router.delete('/resources/:resId', requirePMAdmin, (req, res) => {
  const r = db.prepare('SELECT id FROM amenity_resources WHERE id=?').get(req.params.resId);
  if (!r) return res.status(404).json({ error: 'Resource not found' });
  db.prepare('DELETE FROM amenity_resources WHERE id=?').run(req.params.resId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
