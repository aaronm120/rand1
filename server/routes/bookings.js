const express = require('express');
const { db, auditLog } = require('../database');
const { requireAuth, requirePM, requirePMAdmin, isPM } = require('../middleware/auth');
const { notifyBookingConfirm, notifyBookingCancelled } = require('../lib/email');

const router = express.Router();

function hasConflict(amenityId, startTime, endTime, excludeId) {
  const conflict = db.prepare(`
    SELECT id FROM bookings
    WHERE amenity_id = ? AND status = 'confirmed'
    ${excludeId ? 'AND id != ?' : ''}
    AND NOT (end_time <= ? OR start_time >= ?)
  `).get(...([amenityId, ...(excludeId ? [excludeId] : []), startTime, endTime]));
  return !!conflict;
}

function hasBlackout(amenityId, startTime, endTime) {
  const blackout = db.prepare(`
    SELECT id FROM blackouts
    WHERE amenity_id = ?
    AND NOT (end_time <= ? OR start_time >= ?)
  `).get(amenityId, startTime, endTime);
  return !!blackout;
}

function bookingWithDetails(id) {
  return db.prepare(`
    SELECT b.*, a.name as amenity_name, a.capacity as amenity_capacity, a.location as amenity_location,
           u.name as user_name, u.email as user_email,
           t.name as tenant_name, t.building as tenant_building
    FROM bookings b
    JOIN amenities a ON b.amenity_id = a.id
    JOIN users u ON b.user_id = u.id
    JOIN tenants t ON b.tenant_id = t.id
    WHERE b.id = ?
  `).get(id);
}

// GET /api/bookings — list
router.get('/', requireAuth, (req, res) => {
  const { amenity_id, from, to, tenant_id } = req.query;
  let where = [];
  let params = [];

  if (!isPM(req.user)) {
    where.push('b.tenant_id = ?');
    params.push(req.user.tenant_id);
  } else if (tenant_id) {
    where.push('b.tenant_id = ?');
    params.push(tenant_id);
  }

  if (amenity_id) { where.push('b.amenity_id = ?'); params.push(amenity_id); }
  if (from) { where.push('b.start_time >= ?'); params.push(from); }
  if (to) { where.push('b.end_time <= ?'); params.push(to); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const bookings = db.prepare(`
    SELECT b.*, a.name as amenity_name, u.name as user_name, t.name as tenant_name
    FROM bookings b
    JOIN amenities a ON b.amenity_id = a.id
    JOIN users u ON b.user_id = u.id
    JOIN tenants t ON b.tenant_id = t.id
    ${whereClause}
    ORDER BY b.start_time DESC
  `).all(...params);
  res.json(bookings);
});

// GET /api/bookings/calendar?amenity_id=X&year=Y&month=M
router.get('/calendar', requireAuth, (req, res) => {
  const { amenity_id, year, month } = req.query;
  if (!amenity_id || !year || !month) return res.status(400).json({ error: 'amenity_id, year, month required' });

  const y = parseInt(year), m = parseInt(month);
  const start = `${y}-${String(m).padStart(2,'0')}-01T00:00:00.000Z`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString(); // first day of next month, UTC midnight

  const pm = isPM(req.user);
  const rawBookings = db.prepare(`
    SELECT b.id, b.start_time, b.end_time, b.status, b.headcount,
           b.user_id, b.tenant_id, u.name as user_name, t.name as tenant_name
    FROM bookings b JOIN users u ON b.user_id = u.id JOIN tenants t ON b.tenant_id = t.id
    WHERE b.amenity_id = ? AND b.status = 'confirmed'
    AND b.start_time >= ? AND b.start_time < ?
    ORDER BY b.start_time
  `).all(amenity_id, start, end);

  // Non-PM users see names only for their own tenant's bookings; other bookings show as anonymous
  const bookings = rawBookings.map(b => {
    if (pm || b.tenant_id === req.user.tenant_id) return b;
    const { user_name, tenant_name, ...rest } = b;
    return rest;
  });

  const blackouts = db.prepare(`
    SELECT id, start_time, end_time, reason FROM blackouts
    WHERE amenity_id = ? AND start_time >= ? AND start_time < ?
    ORDER BY start_time
  `).all(amenity_id, start, end);

  res.json({ bookings, blackouts });
});

// GET /api/bookings/:id
router.get('/:id', requireAuth, (req, res) => {
  const booking = bookingWithDetails(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!isPM(req.user) && booking.tenant_id !== req.user.tenant_id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const resources = db.prepare(`
    SELECT br.quantity, ar.name as resource_name
    FROM booking_resources br JOIN amenity_resources ar ON br.resource_id = ar.id
    WHERE br.booking_id = ?
  `).all(req.params.id);
  res.json({ ...booking, resources });
});

// POST /api/bookings — create
router.post('/', requireAuth, (req, res) => {
  const { amenity_id, start_time, end_time, headcount, notes, resources } = req.body;
  if (!amenity_id || !start_time || !end_time) {
    return res.status(400).json({ error: 'Amenity, start time, and end time are required' });
  }

  const start = new Date(start_time);
  const end = new Date(end_time);
  if (isNaN(start) || isNaN(end)) return res.status(400).json({ error: 'Invalid date format' });
  if (end <= start) return res.status(400).json({ error: 'End time must be after start time' });
  if (start < new Date()) return res.status(400).json({ error: 'Cannot book a time in the past' });

  // Must be on the hour boundary, duration check
  const durationHours = (end - start) / (1000 * 60 * 60);
  if (durationHours < 1) return res.status(400).json({ error: 'Minimum booking duration is 1 hour' });

  const amenity = db.prepare('SELECT * FROM amenities WHERE id=? AND active=1').get(amenity_id);
  if (!amenity) return res.status(404).json({ error: 'Amenity not found or inactive' });

  const hc = parseInt(headcount) || 1;
  if (hc > amenity.capacity) {
    return res.status(400).json({ error: `Headcount exceeds capacity of ${amenity.capacity}` });
  }

  const tenantId = isPM(req.user)
    ? (req.body.tenant_id || req.user.tenant_id)
    : req.user.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant association required' });

  // Wrap conflict check + INSERT in a transaction to prevent double-booking under concurrent requests
  let bookingId;
  try {
    bookingId = db.transaction(() => {
      if (hasBlackout(amenity_id, start_time, end_time)) {
        throw Object.assign(new Error('This time is blocked by building management'), { status: 409 });
      }
      if (hasConflict(amenity_id, start_time, end_time)) {
        throw Object.assign(new Error('Time slot already booked. Please choose a different time.'), { status: 409 });
      }

      const result = db.prepare(`
        INSERT INTO bookings (amenity_id, user_id, tenant_id, start_time, end_time, headcount, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
      `).run(amenity_id, req.user.id, tenantId, start_time, end_time, hc, notes || null);

      const id = result.lastInsertRowid;

      if (Array.isArray(resources)) {
        for (const r of resources) {
          if (r.resource_id && r.quantity > 0) {
            const res_ = db.prepare('SELECT id, quantity FROM amenity_resources WHERE id=? AND amenity_id=? AND active=1').get(r.resource_id, amenity_id);
            if (res_) {
              db.prepare('INSERT INTO booking_resources (booking_id, resource_id, quantity) VALUES (?, ?, ?)').run(id, r.resource_id, Math.min(r.quantity, res_.quantity));
            }
          }
        }
      }

      return id;
    })();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  auditLog(req.user.id, 'create_booking', 'booking', bookingId, { amenity_id, start_time, end_time }, req.ip);
  const booking = bookingWithDetails(bookingId);

  // Email confirmation
  const userPrefs = db.prepare('SELECT u.email, np.booking_confirmations FROM users u LEFT JOIN notification_prefs np ON np.user_id=u.id WHERE u.id=? AND u.active=1').get(req.user.id);
  if (userPrefs) notifyBookingConfirm(booking, userPrefs).catch(err => console.warn('[Email] Notification failed:', err.message));

  res.status(201).json(booking);
});

// PATCH /api/bookings/:id/cancel
router.patch('/:id/cancel', requireAuth, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const canManage = isPM(req.user)
    || booking.user_id === req.user.id
    || (req.user.role === 'tenant_admin' && booking.tenant_id === req.user.tenant_id);
  if (!canManage) {
    return res.status(403).json({ error: 'Can only cancel your own booking' });
  }
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });
  if (!isPM(req.user) && new Date(booking.start_time) < new Date()) {
    return res.status(400).json({ error: 'Cannot cancel a booking that has already started' });
  }
  db.prepare('UPDATE bookings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run('cancelled', req.params.id);
  auditLog(req.user.id, 'cancel_booking', 'booking', req.params.id, null, req.ip);
  const cancelled = bookingWithDetails(req.params.id);
  notifyBookingCancelled({ ...cancelled, user_id: booking.user_id }, req.user.id).catch(err => console.warn('[Email] Notification failed:', err.message));
  res.json(cancelled);
});

// ── Blackouts (PM Admin) ──────────────────────────────────────────────────────

router.get('/blackouts/list', requirePM, (req, res) => {
  const { amenity_id } = req.query;
  const where = amenity_id ? 'WHERE b.amenity_id = ?' : '';
  const params = amenity_id ? [amenity_id] : [];
  const rows = db.prepare(`
    SELECT b.*, a.name as amenity_name, u.name as created_by_name
    FROM blackouts b JOIN amenities a ON b.amenity_id = a.id JOIN users u ON b.created_by_id = u.id
    ${where} ORDER BY b.start_time DESC
  `).all(...params);
  res.json(rows);
});

router.post('/blackouts', requirePMAdmin, (req, res) => {
  const { amenity_id, start_time, end_time, reason } = req.body;
  if (!amenity_id || !start_time || !end_time) return res.status(400).json({ error: 'amenity_id, start_time, end_time required' });
  const bStart = new Date(start_time), bEnd = new Date(end_time);
  if (isNaN(bStart) || isNaN(bEnd)) return res.status(400).json({ error: 'Invalid date format' });
  if (bEnd <= bStart) return res.status(400).json({ error: 'End time must be after start time' });
  const result = db.prepare(`INSERT INTO blackouts (amenity_id, start_time, end_time, reason, created_by_id) VALUES (?, ?, ?, ?, ?)`)
    .run(amenity_id, bStart.toISOString(), bEnd.toISOString(), reason || null, req.user.id);
  auditLog(req.user.id, 'create_blackout', 'blackout', result.lastInsertRowid, { amenity_id }, req.ip);
  res.status(201).json(db.prepare('SELECT * FROM blackouts WHERE id=?').get(result.lastInsertRowid));
});

router.delete('/blackouts/:id', requirePMAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM blackouts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM blackouts WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_blackout', 'blackout', req.params.id, null, req.ip);
  res.json({ message: 'Deleted' });
});

module.exports = router;
