const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { db, auditLog, getSettings } = require('../database');
const { requireAuth, requirePMAdmin, isPM, JWT_SECRET } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/email');

const router = express.Router();

// ── TOTP helpers (RFC 6238) — built-in crypto only ─────────────────────────
const _B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function totpGenSecret() {
  const bytes = crypto.randomBytes(20);
  let out = '', bits = 0, val = 0;
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += _B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += _B32[(val << (5 - bits)) & 31];
  return out;
}

function _totpDecode(str) {
  str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = []; let bits = 0, val = 0;
  for (const ch of str) {
    val = (val << 5) | _B32.indexOf(ch); bits += 5;
    if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function _totpCode(secret, step) {
  const key = _totpDecode(secret);
  const buf = Buffer.allocUnsafe(8);
  let n = step; for (let i = 7; i >= 0; i--) { buf[i] = n & 0xff; n = Math.floor(n / 256); }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[19] & 0x0f;
  const code = (((hmac[off] & 0x7f) << 24) | ((hmac[off+1] & 0xff) << 16) |
                ((hmac[off+2] & 0xff) << 8) | (hmac[off+3] & 0xff)) % 1_000_000;
  return String(code).padStart(6, '0');
}

function totpVerify(secret, token) {
  const t = (token || '').replace(/\D/g, '');
  if (t.length !== 6) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  return _totpCode(secret, step - 1) === t ||
         _totpCode(secret, step)     === t ||
         _totpCode(secret, step + 1) === t;
}

function totpUri(email, secret) {
  const iss = 'Randolph Office Center';
  return `otpauth://totp/${encodeURIComponent(iss)}:${encodeURIComponent(email)}` +
         `?secret=${secret}&issuer=${encodeURIComponent(iss)}&algorithm=SHA1&digits=6&period=30`;
}

function genBackupCodes() {
  return Array.from({ length: 8 }, () => {
    const h = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${h.slice(0, 5)}-${h.slice(5)}`;
  });
}

function hashBackupCode(code, userId) {
  return crypto.createHmac('sha256', `roc-mfa-backup-${userId}`)
    .update(code.replace(/[^A-Z0-9]/gi, '').toUpperCase())
    .digest('hex');
}
// ────────────────────────────────────────────────────────────────────────────

function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
  if (!/\d/.test(pw))    return 'Password must contain at least one number';
  return null;
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id, token_version: user.token_version || 0 },
    JWT_SECRET, { expiresIn: '7d' }
  );
}

function safeUser(user) {
  const { password_hash, door_code, mfa_secret, mfa_backup_codes, ...u } = user;
  return u;
}

function safePMUser(user) {
  const { password_hash, mfa_secret, mfa_backup_codes, ...u } = user;
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

  // If MFA is enabled, issue a short-lived pending token — full login completes at /mfa/verify
  if (user.mfa_enabled && user.mfa_secret) {
    const mfaToken = jwt.sign({ mfa_pending: true, id: user.id }, JWT_SECRET, { expiresIn: '5m' });
    return res.json({ mfa_required: true, mfa_token: mfaToken });
  }

  // Invalidate any outstanding password reset tokens now that user has authenticated
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

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
  const { name, email, title, phone, directory_opt_out, current_password } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const newEmail = email?.toLowerCase().trim() || user.email;
  if (newEmail !== user.email) {
    if (!current_password) {
      return res.status(400).json({ error: 'Your current password is required to change your email address' });
    }
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
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
  const pwErr = validatePassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash=?, token_version=token_version+1, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(bcrypt.hashSync(new_password, 10), req.user.id);
  auditLog(req.user.id, 'password_change', 'user', req.user.id, null, req.ip);
  // Return a fresh token so this session stays valid after the version increment
  const refreshed = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({ message: 'Password updated', token: makeToken(refreshed) });
});

// POST /api/auth/force-password-change — used when force_password_change=1; no current password required
router.post('/force-password-change', requireAuth, (req, res) => {
  const { new_password } = req.body;
  if (!new_password) return res.status(400).json({ error: 'New password is required' });
  const pwErr = validatePassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  db.prepare(`UPDATE users SET password_hash=?, token_version=token_version+1, force_password_change=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(bcrypt.hashSync(new_password, 10), req.user.id);
  auditLog(req.user.id, 'force_password_change', 'user', req.user.id, null, req.ip);

  const refreshed = db.prepare(`
    SELECT u.*, t.name as tenant_name, t.building as tenant_building, t.suite as tenant_suite
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?
  `).get(req.user.id);
  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(req.user.id);
  const prefs = db.prepare('SELECT * FROM notification_prefs WHERE user_id=?').get(req.user.id);
  res.json({ token: makeToken(refreshed), user: { ...safeUser(refreshed), notification_prefs: prefs } });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Always return the same response to prevent email enumeration
  const ok = () => res.json({ message: 'If that email is registered, a reset link has been sent.' });

  const user = db.prepare('SELECT id, email, name, active FROM users WHERE email = ?')
    .get(email.toLowerCase().trim());
  if (!user || !user.active) return ok();

  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash  = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  db.transaction(() => {
    // Remove any previous unused tokens for this user, and purge globally expired ones
    db.prepare(`DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= datetime('now')`).run(user.id);
    db.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, user.id, expiresAt);
  })();

  const baseUrl  = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/?reset_token=${plainToken}`;

  sendPasswordResetEmail(user, resetUrl)
    .catch(err => console.warn('[Email] Password reset send failed:', err.message));

  auditLog(null, 'password_reset_request', 'user', user.id, { email: user.email }, req.ip);
  ok();
});

// GET /api/auth/verify-reset-token?token=xxx
router.get('/verify-reset-token', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = db.prepare(`
    SELECT u.email FROM password_reset_tokens r
    JOIN users u ON r.user_id = u.id
    WHERE r.token_hash = ? AND r.used = 0 AND r.expires_at > datetime('now') AND u.active = 1
  `).get(tokenHash);

  if (!record) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  res.json({ email: record.email });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ error: 'Token and new password are required' });
  const pwErr = validatePassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = db.prepare(`
    SELECT r.id, r.user_id, u.email, u.active FROM password_reset_tokens r
    JOIN users u ON r.user_id = u.id
    WHERE r.token_hash = ? AND r.used = 0 AND r.expires_at > datetime('now')
  `).get(tokenHash);

  if (!record) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  if (!record.active) return res.status(400).json({ error: 'This account has been deactivated. Contact building management.' });

  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(bcrypt.hashSync(new_password, 10), record.user_id);
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(record.id);
  })();

  auditLog(record.user_id, 'password_reset_complete', 'user', record.user_id, { email: record.email }, req.ip);
  res.json({ message: 'Password reset successfully. You can now sign in.' });
});

// PUT /api/auth/notifications
router.put('/notifications', requireAuth, (req, res) => {
  const { request_updates, booking_confirmations, announcements, booking_reminders } = req.body;
  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(req.user.id);
  db.prepare(`UPDATE notification_prefs SET request_updates=?, booking_confirmations=?, announcements=?, booking_reminders=? WHERE user_id=?`)
    .run(
      request_updates   ? 1 : 0,
      booking_confirmations ? 1 : 0,
      announcements     ? 1 : 0,
      booking_reminders != null ? (booking_reminders ? 1 : 0) : 1,
      req.user.id
    );
  res.json(db.prepare('SELECT * FROM notification_prefs WHERE user_id=?').get(req.user.id));
});

// ── PM Admin: user management ─────────────────────────────────────────────────

// GET /api/auth/users
router.get('/users', requirePMAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.title, u.phone,
           u.directory_opt_out, u.active, u.door_code, u.mfa_enabled, u.created_at,
           t.name as tenant_name, t.building as tenant_building,
           COALESCE(np.request_updates, 1)       as notif_requests,
           COALESCE(np.booking_confirmations, 1) as notif_bookings,
           COALESCE(np.announcements, 1)         as notif_announcements
    FROM users u
    LEFT JOIN tenants t           ON u.tenant_id  = t.id
    LEFT JOIN notification_prefs np ON np.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// POST /api/auth/users
router.post('/users', requirePMAdmin, (req, res) => {
  const { email, name, role, tenant_id, title, phone, password, force_password_change } = req.body;
  if (!email || !name || !role || !password) {
    return res.status(400).json({ error: 'Email, name, role, and password are required' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const tenantRoles = ['tenant_admin', 'tenant_user'];
  if (tenantRoles.includes(role) && !tenant_id) {
    return res.status(400).json({ error: 'Tenant is required for tenant roles' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    `INSERT INTO users (email, name, password_hash, role, tenant_id, title, phone, active, force_password_change)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(email.toLowerCase().trim(), name, hash, role, tenant_id || null, title || null, phone || null,
    force_password_change ? 1 : 0);

  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(result.lastInsertRowid);
  auditLog(req.user.id, 'create_user', 'user', result.lastInsertRowid, { email, role, force_password_change: force_password_change ? 1 : 0 }, req.ip);
  const user = db.prepare(`
    SELECT u.*, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(safePMUser(user));
});

// PUT /api/auth/users/:id
router.put('/users/:id', requirePMAdmin, (req, res) => {
  const { email, name, role, tenant_id, title, phone, active, password, door_code, directory_opt_out,
          notifications_enabled } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent removing the last active PM Admin (via role change or deactivation)
  if (user.role === 'pm_admin') {
    const roleChanging   = role !== undefined && role !== 'pm_admin';
    const deactivating   = active !== undefined && !active;
    if (roleChanging || deactivating) {
      const remainingAdmins = db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role='pm_admin' AND active=1 AND id!=?"
      ).get(req.params.id).c;
      if (remainingAdmins === 0) {
        return res.status(400).json({ error: 'Cannot demote or deactivate the only active PM Admin' });
      }
    }
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

  if (password) {
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    db.prepare('UPDATE users SET password_hash=?, token_version=token_version+1, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(bcrypt.hashSync(password, 10), req.params.id);
  }

  if (notifications_enabled !== undefined) {
    const v = notifications_enabled ? 1 : 0;
    db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(req.params.id);
    db.prepare(`UPDATE notification_prefs SET request_updates=?, booking_confirmations=?, booking_reminders=?, announcements=? WHERE user_id=?`)
      .run(v, v, v, v, req.params.id);
  }

  auditLog(req.user.id, 'update_user', 'user', req.params.id, { role, password_changed: !!password, notifications_enabled }, req.ip);
  const updated = db.prepare(`
    SELECT u.*, t.name as tenant_name,
           COALESCE(np.request_updates, 1)       as notif_requests,
           COALESCE(np.booking_confirmations, 1) as notif_bookings,
           COALESCE(np.announcements, 1)         as notif_announcements
    FROM users u
    LEFT JOIN tenants t            ON u.tenant_id  = t.id
    LEFT JOIN notification_prefs np ON np.user_id  = u.id
    WHERE u.id = ?
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
      token_version: target.token_version || 0,
      impersonatedBy: req.user.id, impersonatedByName: req.user.name },
    JWT_SECRET, { expiresIn: '30m' }
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

// ── MFA routes ────────────────────────────────────────────────────────────────

// In-memory set of consumed MFA token hashes (5-min tokens; clean up every 10 min)
const _usedMFATokens = new Set();
setInterval(() => _usedMFATokens.clear(), 10 * 60 * 1000);

// POST /api/auth/mfa/verify — complete login after TOTP check
router.post('/mfa/verify', (req, res) => {
  const { mfa_token, code } = req.body;
  if (!mfa_token || !code) return res.status(400).json({ error: 'Token and code are required' });

  // Hash the raw token to use as the consumed-token key (avoids storing the secret in memory)
  const tokenKey = crypto.createHash('sha256').update(mfa_token).digest('hex');
  if (_usedMFATokens.has(tokenKey)) {
    return res.status(401).json({ error: 'This session has already been used. Please sign in again.' });
  }

  let payload;
  try { payload = jwt.verify(mfa_token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Session expired. Please sign in again.' }); }

  if (!payload.mfa_pending) return res.status(400).json({ error: 'Invalid MFA token' });

  const user = db.prepare(`
    SELECT u.*, t.name as tenant_name, t.building as tenant_building, t.suite as tenant_suite
    FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?
  `).get(payload.id);

  if (!user || !user.active) return res.status(401).json({ error: 'Account not found or inactive' });
  if (!user.mfa_enabled || !user.mfa_secret) return res.status(400).json({ error: 'MFA is not enabled for this account' });

  const normalized = (code || '').replace(/\D/g, '');

  // Try TOTP first
  if (!totpVerify(user.mfa_secret, normalized)) {
    // Fall back to backup code check
    const stored = JSON.parse(user.mfa_backup_codes || '[]');
    const matchIdx = stored.findIndex(h => h === hashBackupCode(code, user.id));
    if (matchIdx === -1) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }
    // Consume the backup code (one-time use)
    stored.splice(matchIdx, 1);
    db.prepare('UPDATE users SET mfa_backup_codes=? WHERE id=?').run(JSON.stringify(stored), user.id);
    auditLog(user.id, 'login_mfa_backup', 'user', user.id, null, req.ip);
  }

  // Mark this MFA token as consumed so it cannot be replayed
  _usedMFATokens.add(tokenKey);

  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(user.id);
  const prefs = db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(user.id);
  const token = makeToken(user);
  auditLog(user.id, 'login_mfa', 'user', user.id, null, req.ip);
  res.json({ token, user: { ...safeUser(user), notification_prefs: prefs } });
});

// GET /api/auth/mfa/setup — generate secret + otpauth URI (does not enable MFA yet)
router.get('/mfa/setup', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (user.mfa_enabled) return res.status(400).json({ error: 'MFA is already enabled. Disable it first.' });
  // Reuse an existing pending secret so re-opening the setup modal doesn't invalidate a scanned QR code
  const secret = user.mfa_secret || totpGenSecret();
  if (!user.mfa_secret) {
    db.prepare('UPDATE users SET mfa_secret=? WHERE id=?').run(secret, user.id);
  }
  res.json({ secret, otpauth_uri: totpUri(user.email, secret) });
});

// POST /api/auth/mfa/enable — verify code then activate MFA; returns one-time backup codes
router.post('/mfa/enable', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Verification code is required' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user.mfa_secret) return res.status(400).json({ error: 'Start setup first' });
  if (user.mfa_enabled) return res.status(400).json({ error: 'MFA is already enabled' });
  if (!totpVerify(user.mfa_secret, code)) return res.status(401).json({ error: 'Invalid code — try again' });

  const plainCodes = genBackupCodes();
  const hashedCodes = JSON.stringify(plainCodes.map(c => hashBackupCode(c, user.id)));
  db.prepare('UPDATE users SET mfa_enabled=1, mfa_backup_codes=? WHERE id=?').run(hashedCodes, user.id);
  auditLog(req.user.id, 'mfa_enabled', 'user', req.user.id, null, req.ip);
  res.json({ message: 'MFA enabled', backup_codes: plainCodes });
});

// POST /api/auth/mfa/disable — requires current password
router.post('/mfa/disable', requireAuth, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Current password is required' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user.mfa_enabled) return res.status(400).json({ error: 'MFA is not enabled' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect password' });
  db.prepare('UPDATE users SET mfa_enabled=0, mfa_secret=NULL, mfa_backup_codes=NULL WHERE id=?').run(user.id);
  auditLog(req.user.id, 'mfa_disabled', 'user', req.user.id, null, req.ip);
  res.json({ message: 'MFA disabled' });
});

// POST /api/auth/mfa/admin-reset/:userId — PM Admin: reset MFA for any user
router.post('/mfa/admin-reset/:userId', requirePMAdmin, (req, res) => {
  const target = db.prepare('SELECT id, name FROM users WHERE id=?').get(req.params.userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET mfa_enabled=0, mfa_secret=NULL, mfa_backup_codes=NULL WHERE id=?').run(req.params.userId);
  auditLog(req.user.id, 'mfa_admin_reset', 'user', req.params.userId, { target_name: target.name }, req.ip);
  res.json({ message: 'MFA reset' });
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
