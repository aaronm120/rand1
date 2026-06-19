const express = require('express');
const { db } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const resources = db.prepare('SELECT * FROM resources WHERE is_active = 1 ORDER BY name').all();
  res.json(resources);
});

router.get('/:id', requireAuth, (req, res) => {
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found' });
  res.json(resource);
});

router.post('/', requireAdmin, (req, res) => {
  const { name, description, type, capacity, amenities, location, rules } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  const result = db.prepare(`INSERT INTO resources (name, description, type, capacity, amenities, location, rules)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, description || null, type, capacity || null, amenities || null, location || null, rules || null);
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(resource);
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, description, type, capacity, amenities, location, rules, is_active } = req.body;
  const resource = db.prepare('SELECT id FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found' });
  db.prepare(`UPDATE resources SET name=?, description=?, type=?, capacity=?, amenities=?, location=?, rules=?, is_active=? WHERE id=?`)
    .run(name, description || null, type, capacity || null, amenities || null, location || null, rules || null, is_active !== undefined ? is_active : 1, req.params.id);
  const updated = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const resource = db.prepare('SELECT id FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found' });
  db.prepare('UPDATE resources SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Resource deactivated' });
});

module.exports = router;
