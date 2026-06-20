const express = require('express');
const { db } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/reservations - user gets own, admin gets all with ?all=true
router.get('/', requireAuth, (req, res) => {
  let reservations;
  if (req.user.role === 'admin' && req.query.all === 'true') {
    reservations = db.prepare(`
      SELECT r.*, res.name as resource_name, res.location as resource_location, res.type as resource_type,
             u.name as user_name, u.email as user_email, u.unit_number as user_unit
      FROM reservations r
      JOIN resources res ON r.resource_id = res.id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.start_time DESC
    `).all();
  } else {
    reservations = db.prepare(`
      SELECT r.*, res.name as resource_name, res.location as resource_location, res.type as resource_type
      FROM reservations r
      JOIN resources res ON r.resource_id = res.id
      WHERE r.user_id = ?
      ORDER BY r.start_time DESC
    `).all(req.user.id);
  }
  res.json(reservations);
});

// GET /api/reservations/availability?resourceId=X&date=YYYY-MM-DD
router.get('/availability', requireAuth, (req, res) => {
  const { resourceId, date } = req.query;
  if (!resourceId || !date) {
    return res.status(400).json({ error: 'resourceId and date are required' });
  }
  const reservations = db.prepare(`
    SELECT id, title, start_time, end_time, status,
           CASE WHEN user_id = ? THEN user_id ELSE NULL END as is_mine
    FROM reservations
    WHERE resource_id = ? AND status = 'confirmed'
    AND date(start_time) = ?
    ORDER BY start_time
  `).all(req.user.id, resourceId, date);
  res.json(reservations);
});

// GET /api/reservations/:id
router.get('/:id', requireAuth, (req, res) => {
  const reservation = db.prepare(`
    SELECT r.*, res.name as resource_name, res.location as resource_location
    FROM reservations r JOIN resources res ON r.resource_id = res.id
    WHERE r.id = ? AND (r.user_id = ? OR ? = 'admin')
  `).get(req.params.id, req.user.id, req.user.role);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
  res.json(reservation);
});

// POST /api/reservations
router.post('/', requireAuth, (req, res) => {
  const { resource_id, title, start_time, end_time, attendees, notes } = req.body;
  if (!resource_id || !title || !start_time || !end_time) {
    return res.status(400).json({ error: 'Resource, title, start time, and end time are required' });
  }

  const start = new Date(start_time);
  const end = new Date(end_time);
  if (isNaN(start) || isNaN(end)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (end <= start) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }
  if (start < new Date()) {
    return res.status(400).json({ error: 'Cannot book a time in the past' });
  }

  const resource = db.prepare('SELECT id, capacity FROM resources WHERE id = ? AND is_active = 1').get(resource_id);
  if (!resource) return res.status(404).json({ error: 'Resource not found or inactive' });

  // Check for conflicts
  const conflict = db.prepare(`
    SELECT id FROM reservations
    WHERE resource_id = ? AND status = 'confirmed'
    AND NOT (end_time <= ? OR start_time >= ?)
  `).get(resource_id, start_time, end_time);

  if (conflict) {
    return res.status(409).json({ error: 'This resource is already booked for the selected time. Please choose a different time.' });
  }

  const result = db.prepare(`INSERT INTO reservations (resource_id, user_id, title, start_time, end_time, attendees, notes)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(resource_id, req.user.id, title, start_time, end_time, attendees || 1, notes || null);

  const reservation = db.prepare(`
    SELECT r.*, res.name as resource_name, res.location as resource_location
    FROM reservations r JOIN resources res ON r.resource_id = res.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(reservation);
});

// PUT /api/reservations/:id/cancel
router.put('/:id/cancel', requireAuth, (req, res) => {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
  if (reservation.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to cancel this reservation' });
  }
  if (reservation.status === 'cancelled') {
    return res.status(400).json({ error: 'Reservation is already cancelled' });
  }
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  res.json({ message: 'Reservation cancelled successfully' });
});

// PUT /api/reservations/:id (admin update)
router.put('/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const reservation = db.prepare('SELECT id FROM reservations WHERE id = ?').get(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);
  const updated = db.prepare(`
    SELECT r.*, res.name as resource_name, u.name as user_name
    FROM reservations r JOIN resources res ON r.resource_id = res.id JOIN users u ON r.user_id = u.id
    WHERE r.id = ?
  `).get(req.params.id);
  res.json(updated);
});

module.exports = router;
