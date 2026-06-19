const express = require('express');
const { db } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_CATEGORIES = ['maintenance', 'electrical', 'plumbing', 'hvac', 'cleaning', 'security', 'internet', 'elevator', 'parking', 'other'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];

router.get('/', requireAuth, (req, res) => {
  let tickets;
  if (req.user.role === 'admin' && req.query.all === 'true') {
    const statusFilter = req.query.status;
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      tickets = db.prepare(`
        SELECT t.*, u.name as user_name, u.email as user_email, u.unit_number as user_unit
        FROM tickets t JOIN users u ON t.user_id = u.id
        WHERE t.status = ? ORDER BY t.created_at DESC
      `).all(statusFilter);
    } else {
      tickets = db.prepare(`
        SELECT t.*, u.name as user_name, u.email as user_email, u.unit_number as user_unit
        FROM tickets t JOIN users u ON t.user_id = u.id
        ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                 t.created_at DESC
      `).all();
    }
  } else {
    tickets = db.prepare(`
      SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
  }
  res.json(tickets);
});

router.get('/:id', requireAuth, (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, u.name as user_name, u.email as user_email, u.unit_number as user_unit
    FROM tickets t JOIN users u ON t.user_id = u.id
    WHERE t.id = ? AND (t.user_id = ? OR ? = 'admin')
  `).get(req.params.id, req.user.id, req.user.role);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.post('/', requireAuth, (req, res) => {
  const { title, description, category, priority, unit_number, location } = req.body;
  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Title, description, and category are required' });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  const ticketPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium';

  const result = db.prepare(`INSERT INTO tickets (user_id, title, description, category, priority, unit_number, location)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, title, description, category, ticketPriority, unit_number || null, location || null);

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ticket);
});

router.put('/:id', requireAuth, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (req.user.role === 'admin') {
    const { status, admin_notes, assigned_to, priority } = req.body;
    const newStatus = VALID_STATUSES.includes(status) ? status : ticket.status;
    const newPriority = VALID_PRIORITIES.includes(priority) ? priority : ticket.priority;
    db.prepare(`UPDATE tickets SET status=?, admin_notes=?, assigned_to=?, priority=?,
                updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(newStatus, admin_notes !== undefined ? admin_notes : ticket.admin_notes,
           assigned_to !== undefined ? assigned_to : ticket.assigned_to, newPriority, req.params.id);
  } else {
    if (ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this ticket' });
    }
    if (['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Cannot edit a resolved or closed ticket' });
    }
    const { title, description, category, priority, unit_number, location } = req.body;
    db.prepare(`UPDATE tickets SET title=?, description=?, category=?, priority=?, unit_number=?, location=?,
                updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(title || ticket.title, description || ticket.description, category || ticket.category,
           VALID_PRIORITIES.includes(priority) ? priority : ticket.priority,
           unit_number !== undefined ? unit_number : ticket.unit_number,
           location !== undefined ? location : ticket.location, req.params.id);
  }

  const updated = db.prepare(`
    SELECT t.*, u.name as user_name, u.email as user_email
    FROM tickets t JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `).get(req.params.id);
  res.json(updated);
});

module.exports = router;
