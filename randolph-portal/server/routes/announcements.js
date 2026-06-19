const express = require('express');
const { db, auditLog } = require('../database');
const { requireAuth, requirePM, isPM } = require('../middleware/auth');
const { notifyAnnouncement } = require('../lib/email');

const router = express.Router();

const TARGET_TYPES = ['portfolio', 'building', 'tenant'];

function visibleToUser(ann, user) {
  if (isPM(user)) return true;
  const now = new Date();
  if (new Date(ann.publish_at) > now) return false;
  if (ann.target_type === 'portfolio') return true;
  if (ann.target_type === 'building') {
    // user's tenant building must match
    const tenant = db.prepare('SELECT building FROM tenants WHERE id=?').get(user.tenant_id);
    return tenant?.building === ann.target_building;
  }
  if (ann.target_type === 'tenant') return ann.target_tenant_id === user.tenant_id;
  return false;
}

// GET /api/announcements
router.get('/', requireAuth, (req, res) => {
  const all = db.prepare(`
    SELECT a.*, u.name as author_name, t.name as target_tenant_name
    FROM announcements a
    JOIN users u ON a.author_id = u.id
    LEFT JOIN tenants t ON a.target_tenant_id = t.id
    ORDER BY a.pinned DESC, a.publish_at DESC
  `).all();

  const visible = isPM(req.user)
    ? all
    : all.filter(a => visibleToUser(a, req.user));

  res.json(visible);
});

// GET /api/announcements/:id
router.get('/:id', requireAuth, (req, res) => {
  const ann = db.prepare(`
    SELECT a.*, u.name as author_name, t.name as target_tenant_name
    FROM announcements a
    JOIN users u ON a.author_id = u.id
    LEFT JOIN tenants t ON a.target_tenant_id = t.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Announcement not found' });
  if (!visibleToUser(ann, req.user)) return res.status(403).json({ error: 'Access denied' });
  res.json(ann);
});

// POST /api/announcements — PM only
router.post('/', requirePM, (req, res) => {
  const { title, content, target_type, target_building, target_tenant_id, urgent, pinned, publish_at } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Title and content are required' });
  if (!TARGET_TYPES.includes(target_type)) return res.status(400).json({ error: 'Invalid target type' });

  const publishTime = publish_at ? new Date(publish_at).toISOString() : new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO announcements (title, content, author_id, target_type, target_building, target_tenant_id, urgent, pinned, publish_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(), content.trim(), req.user.id, target_type,
    target_building || null, target_tenant_id || null,
    urgent ? 1 : 0, pinned ? 1 : 0, publishTime
  );

  const ann = db.prepare(`
    SELECT a.*, u.name as author_name FROM announcements a JOIN users u ON a.author_id = u.id WHERE a.id = ?
  `).get(result.lastInsertRowid);

  auditLog(req.user.id, 'create_announcement', 'announcement', result.lastInsertRowid, { target_type }, req.ip);

  // Email recipients if publishing now
  if (!publish_at || new Date(publish_at) <= new Date()) {
    let recipientQuery;
    let params = [];
    if (target_type === 'portfolio') {
      recipientQuery = `SELECT u.email, np.announcements FROM users u LEFT JOIN notification_prefs np ON np.user_id=u.id WHERE u.active=1 AND u.role NOT IN ('pm_admin','pm_user')`;
    } else if (target_type === 'building') {
      recipientQuery = `SELECT u.email, np.announcements FROM users u JOIN tenants t ON u.tenant_id=t.id LEFT JOIN notification_prefs np ON np.user_id=u.id WHERE u.active=1 AND t.building=?`;
      params = [target_building];
    } else {
      recipientQuery = `SELECT u.email, np.announcements FROM users u LEFT JOIN notification_prefs np ON np.user_id=u.id WHERE u.active=1 AND u.tenant_id=?`;
      params = [target_tenant_id];
    }
    const recipients = db.prepare(recipientQuery).all(...params);
    notifyAnnouncement(ann, recipients).catch(() => {});
  }

  res.status(201).json(ann);
});

// PATCH /api/announcements/:id — PM only
router.patch('/:id', requirePM, (req, res) => {
  const { title, content, urgent, pinned } = req.body;
  const ann = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE announcements SET title=?, content=?, urgent=?, pinned=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(title || ann.title, content || ann.content, urgent !== undefined ? (urgent ? 1 : 0) : ann.urgent,
      pinned !== undefined ? (pinned ? 1 : 0) : ann.pinned, req.params.id);
  auditLog(req.user.id, 'update_announcement', 'announcement', req.params.id, null, req.ip);
  res.json(db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id));
});

// DELETE /api/announcements/:id — PM only
router.delete('/:id', requirePM, (req, res) => {
  const ann = db.prepare('SELECT id FROM announcements WHERE id=?').get(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_announcement', 'announcement', req.params.id, null, req.ip);
  res.json({ message: 'Deleted' });
});

module.exports = router;
