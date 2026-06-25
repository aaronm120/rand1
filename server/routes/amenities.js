const express = require('express');
const { db, auditLog } = require('../database');
const { requireAuth, requirePMAdmin, requirePM, isPM } = require('../middleware/auth');
const { notifyBookingCancelled } = require('../lib/email');

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

  const newActive = active !== undefined ? (active ? 1 : 0) : a.active;

  let cancelledBookings = [];

  db.transaction(() => {
    db.prepare(`UPDATE amenities SET name=?, description=?, location=?, capacity=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(name ?? a.name, description ?? a.description, location ?? a.location,
        capacity ? parseInt(capacity) : a.capacity, newActive, req.params.id);

    // When deactivating, cancel all future confirmed bookings atomically
    if (a.active === 1 && newActive === 0) {
      cancelledBookings = db.prepare(`
        SELECT b.*, a2.name as amenity_name, a2.location as amenity_location,
               u.name as user_name, u.email as user_email,
               t.name as tenant_name, t.building as tenant_building
        FROM bookings b
        JOIN amenities a2 ON b.amenity_id = a2.id
        JOIN users u ON b.user_id = u.id
        JOIN tenants t ON b.tenant_id = t.id
        WHERE b.amenity_id = ? AND b.status = 'confirmed' AND b.start_time > datetime('now')
      `).all(req.params.id);

      for (const booking of cancelledBookings) {
        db.prepare(`UPDATE bookings SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(booking.id);
      }
    }
  })();

  auditLog(req.user.id, 'update_amenity', 'amenity', req.params.id, { active: newActive }, req.ip);

  // Fire audit logs and emails after the transaction commits
  for (const booking of cancelledBookings) {
    auditLog(req.user.id, 'cancel_booking', 'booking', booking.id, { reason: 'amenity_deactivated' }, req.ip);
    notifyBookingCancelled(booking, req.user.id).catch(err => console.warn('[Email] Notification failed:', err.message));
  }
  const cancelledCount = cancelledBookings.length;

  const updated = db.prepare('SELECT * FROM amenities WHERE id=?').get(req.params.id);
  updated.resources = db.prepare('SELECT * FROM amenity_resources WHERE amenity_id=? ORDER BY name').all(req.params.id);
  res.json({ ...updated, cancelled_bookings: cancelledCount });
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

// DELETE /api/amenities/:id/resources/:resId — delete resource
router.delete('/:id/resources/:resId', requirePMAdmin, (req, res) => {
  const r = db.prepare('SELECT id FROM amenity_resources WHERE id=?').get(req.params.resId);
  if (!r) return res.status(404).json({ error: 'Resource not found' });
  db.prepare('DELETE FROM amenity_resources WHERE id=?').run(req.params.resId);
  res.json({ message: 'Deleted' });
});

// DELETE /api/amenities/:id — PM Admin only, blocked if any bookings exist
router.delete('/:id', requirePMAdmin, (req, res) => {
  const amenity = db.prepare('SELECT * FROM amenities WHERE id=?').get(req.params.id);
  if (!amenity) return res.status(404).json({ error: 'Amenity not found' });
  const bookingCount = db.prepare('SELECT COUNT(*) as cnt FROM bookings WHERE amenity_id=?').get(req.params.id).cnt;
  if (bookingCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${bookingCount} booking${bookingCount !== 1 ? 's' : ''} reference this amenity. Mark it inactive instead.` });
  }
  db.prepare('DELETE FROM amenity_resources WHERE amenity_id=?').run(req.params.id);
  db.prepare('DELETE FROM amenities WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_amenity', 'amenity', req.params.id, { name: amenity.name }, req.ip);
  res.json({ message: 'Deleted' });
});

module.exports = router;
