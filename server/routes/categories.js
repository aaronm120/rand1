const express = require('express');
const { db, auditLog } = require('../database');
const { requireAuth, requirePMAdmin, isPM } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories — all authenticated users
router.get('/', requireAuth, (req, res) => {
  const showAll = req.query.all === 'true' && isPM(req.user);
  const where = showAll ? '' : 'WHERE active = 1';
  res.json(db.prepare(`SELECT * FROM request_categories ${where} ORDER BY name`).all());
});

// POST /api/categories — PM Admin only
router.post('/', requirePMAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Category name is required' });
  const existing = db.prepare('SELECT id FROM request_categories WHERE name = ?').get(name.trim());
  if (existing) return res.status(409).json({ error: 'Category already exists' });
  const result = db.prepare('INSERT INTO request_categories (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM request_categories))')
    .run(name.trim());
  auditLog(req.user.id, 'create_category', 'category', result.lastInsertRowid, { name }, req.ip);
  res.status(201).json(db.prepare('SELECT * FROM request_categories WHERE id=?').get(result.lastInsertRowid));
});

// PATCH /api/categories/:id — PM Admin only
router.patch('/:id', requirePMAdmin, (req, res) => {
  const { name, active } = req.body;
  const cat = db.prepare('SELECT * FROM request_categories WHERE id=?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  db.prepare('UPDATE request_categories SET name=?, active=? WHERE id=?')
    .run(name?.trim() || cat.name, active !== undefined ? (active ? 1 : 0) : cat.active, req.params.id);
  auditLog(req.user.id, 'update_category', 'category', req.params.id, { active }, req.ip);
  res.json(db.prepare('SELECT * FROM request_categories WHERE id=?').get(req.params.id));
});

// DELETE /api/categories/:id — PM Admin only, blocked if any requests use it
router.delete('/:id', requirePMAdmin, (req, res) => {
  const cat = db.prepare('SELECT * FROM request_categories WHERE id=?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const requestCount = db.prepare('SELECT COUNT(*) as cnt FROM service_requests WHERE category_id=?').get(req.params.id).cnt;
  if (requestCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${requestCount} service request${requestCount !== 1 ? 's' : ''} use this category. Mark it inactive instead.` });
  }
  db.prepare('DELETE FROM request_categories WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_category', 'category', req.params.id, { name: cat.name }, req.ip);
  res.json({ message: 'Deleted' });
});

module.exports = router;
