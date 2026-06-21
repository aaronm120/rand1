const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, auditLog, getSettings } = require('../database');
const { requireAuth, requirePMAdmin, isPM, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
    JWT_SECRET, { expiresIn: '7d' }
  );
}

function safeUser(user) {
  const { password_hash, door_code, ...u } = user;
  return u;
}

function safePMUser(user) {
  const { password_hash, ...u } = user;
  return u;
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare(`
    SELECT u.*, t.name as tenant_name, t.building as tenant_building, t.suite as tenant_suite
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id
    WHERE u.email = ?
  `).get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been deactivated. Contact building management.' });

  // Block non-PM logins during maintenance mode
  if (!['pm_admin', 'pm_user'].includes(user.role)) {
    const settings = getSettings();
    if (settings.maintenance_mode === '1' || settings.maintenance_mode === 'true') {
      return res.status(503).json({ error: settings.maintenance_message || 'The portal is currently offline for maintenance.' });
    }
  }

  // Ensure notification prefs exist
  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(user.id);

  const prefs = db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(user.id);
  const token = makeToken(user);

  auditLog(user.id, 'login', 'user', user.id, null, req.ip);
  res.json({ token, user: { ...safeUser(user), notification_prefs: prefs } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.*, t.name as tenant_name, t.building as tenant_building, t.suite as tenant_suite
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id
    WHERE u.id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(user.id);
  const prefs = db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(user.id);
  res.json({ ...safeUser(user), notification_prefs: prefs });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, (req, res) => {
  const { name, email, title, phone, directory_opt_out } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const newEmail = email?.toLowerCase().trim() || user.email;
  if (newEmail !== user.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(newEmail, req.user.id);
    if (conflict) return res.status(409).json({ error: 'Email already in use' });
  }

  db.prepare(`UPDATE users SET name=?, email=?, title=?, phone=?, directory_opt_out=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(name.trim(), newEmail, title || null, phone || null, directory_opt_out ? 1 : 0, req.user.id);
  const updated = db.prepare(`
    SELECT u.*, t.name as tenant_name, t.building as tenant_building
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?
  `).get(req.user.id);
  res.json(safeUser(updated));
});

// PUT /api/auth/password
router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords are required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(bcrypt.hashSync(new_password, 10), req.user.id);
  auditLog(req.user.id, 'password_change', 'user', req.user.id, null, req.ip);
  res.json({ message: 'Password updated' });
});

// PUT /api/auth/notifications
router.put('/notifications', requireAuth, (req, res) => {
  const { request_updates, booking_confirmations, announcements } = req.body;
  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(req.user.id);
  db.prepare(`UPDATE notification_prefs SET request_updates=?, booking_confirmations=?, announcements=? WHERE user_id=?`)
    .run(request_updates ? 1 : 0, booking_confirmations ? 1 : 0, announcements ? 1 : 0, req.user.id);
  res.json(db.prepare('SELECT * FROM notification_prefs WHERE user_id=?').get(req.user.id));
});

// ── PM Admin: user management ─────────────────────────────────────────────────

// GET /api/auth/users
router.get('/users', requirePMAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.title, u.phone,
           u.directory_opt_out, u.active, u.door_code, u.created_at,
           t.name as tenant_name, t.building as tenant_building
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// POST /api/auth/users
router.post('/users', requirePMAdmin, (req, res) => {
  const { email, name, role, tenant_id, title, phone, password } = req.body;
  if (!email || !name || !role || !password) {
    return res.status(400).json({ error: 'Email, name, role, and password are required' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const tenantRoles = ['tenant_admin', 'tenant_user'];
  if (tenantRoles.includes(role) && !tenant_id) {
    return res.status(400).json({ error: 'Tenant is required for tenant roles' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    `INSERT INTO users (email, name, password_hash, role, tenant_id, title, phone, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(email.toLowerCase().trim(), name, hash, role, tenant_id || null, title || null, phone || null);

  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(result.lastInsertRowid);
  auditLog(req.user.id, 'create_user', 'user', result.lastInsertRowid, { email, role }, req.ip);
  const user = db.prepare(`
    SELECT u.*, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(safePMUser(user));
});

// PUT /api/auth/users/:id
router.put('/users/:id', requirePMAdmin, (req, res) => {
  const { email, name, role, tenant_id, title, phone, active, password, door_code, directory_opt_out } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent demoting the last PM Admin
  if (user.role === 'pm_admin' && role !== 'pm_admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='pm_admin' AND active=1").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot change role of the only PM Admin' });
  }

  // Tenant roles require a tenant association
  const newRole = role || user.role;
  const newTenantId = tenant_id !== undefined ? tenant_id : user.tenant_id;
  if (['tenant_admin', 'tenant_user'].includes(newRole) && !newTenantId) {
    return res.status(400).json({ error: 'Tenant is required for tenant roles' });
  }

  const newEmail = email?.toLowerCase().trim() || user.email;
  if (newEmail !== user.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(newEmail, req.params.id);
    if (conflict) return res.status(409).json({ error: 'Email already in use' });
  }

  db.prepare(`UPDATE users SET email=?, name=?, role=?, tenant_id=?, title=?, phone=?, active=?, door_code=?, directory_opt_out=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(newEmail, name || user.name, role || user.role, tenant_id ?? user.tenant_id,
      title ?? user.title, phone ?? user.phone, active !== undefined ? (active ? 1 : 0) : user.active,
      door_code !== undefined ? (door_code || null) : user.door_code,
      directory_opt_out !== undefined ? (directory_opt_out ? 1 : 0) : user.directory_opt_out,
      req.params.id);

  if (password && password.length >= 8) {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  }

  auditLog(req.user.id, 'update_user', 'user', req.params.id, { role }, req.ip);
  const updated = db.prepare(`
    SELECT u.*, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?
  `).get(req.params.id);
  res.json(safePMUser(updated));
});

// POST /api/auth/impersonate/:id — PM Admin only
router.post('/impersonate/:id', requirePMAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot impersonate yourself' });

  const target = db.prepare(`
    SELECT u.*, t.name as tenant_name, t.building as tenant_building
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id
    WHERE u.id = ?
  `).get(targetId);

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'pm_admin') return res.status(403).json({ error: 'Cannot impersonate another PM Admin' });
  if (!target.active) return res.status(400).json({ error: 'Cannot impersonate an inactive user' });

  const token = jwt.sign(
    { id: target.id, email: target.email, role: target.role, tenant_id: target.tenant_id,
      impersonatedBy: req.user.id, impersonatedByName: req.user.name },
    JWT_SECRET, { expiresIn: '4h' }
  );

  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(target.id);
  const prefs = db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(target.id);

  auditLog(req.user.id, 'impersonate_start', 'user', target.id, { target_email: target.email, target_name: target.name }, req.ip);
  res.json({ token, user: { ...safeUser(target), notification_prefs: prefs, impersonatedBy: req.user.id, impersonatedByName: req.user.name } });
});

// DELETE /api/auth/users/:id — PM Admin only, cannot delete self
router.delete('/users/:id', requirePMAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const user = db.prepare('SELECT id, name FROM users WHERE id=?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id=?').run(targetId);
  auditLog(req.user.id, 'delete_user', 'user', targetId, { name: user.name }, req.ip);
  res.json({ message: 'User deleted' });
});

router.get('/tenant-users', requireAuth, (req, res) => {
  if (!req.user.tenant_id) return res.status(400).json({ error: 'Not a tenant user' });
  const isPMRole = isPM(req.user);
  // tenant_admin can see their own tenant; PM can see any
  const tenantId = req.query.tenant_id && isPMRole ? req.query.tenant_id : req.user.tenant_id;
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.title, u.phone, u.directory_opt_out, u.active, u.created_at
    FROM users u WHERE u.tenant_id = ? ORDER BY u.name
  `).all(tenantId);
  res.json(users);
});

module.exports = router;
