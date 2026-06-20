const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ── Pending restore check — must run before opening the DB ───────────────────
(function applyPendingRestore() {
  const pendingDb      = path.join(dataDir, 'portal.db.pending');
  const pendingUploads = path.join(dataDir, 'uploads.pending');
  const currentDb      = path.join(dataDir, 'portal.db');
  const uploadsDir     = path.join(__dirname, '../uploads');
  if (!fs.existsSync(pendingDb)) return;
  try {
    if (fs.existsSync(currentDb)) fs.renameSync(currentDb, currentDb + '.bak');
    fs.renameSync(pendingDb, currentDb);
    if (fs.existsSync(pendingUploads)) {
      if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
      try {
        fs.renameSync(pendingUploads, uploadsDir);
      } catch {
        // Cross-device rename — fall back to copy then delete
        fs.cpSync(pendingUploads, uploadsDir, { recursive: true });
        fs.rmSync(pendingUploads, { recursive: true, force: true });
      }
    }
    console.log('[Restore] Backup applied successfully.');
  } catch (e) {
    console.error('[Restore] Failed to apply pending restore:', e.message);
  }
})();

const db = new Database(path.join(dataDir, 'portal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── DEFAULT SETTINGS ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  building_name: 'Randolph Office Center',
  building_tagline: 'Tenant Portal',
  buildings: '728,730,732',           // comma-separated W. Randolph buildings
  building_address: 'W. Randolph Street, Chicago, IL',
  building_phone: '(312) 555-0100',
  building_email: 'management@randolphofficecenter.com',
  building_hours: 'Mon–Fri 7:00 AM – 9:00 PM · Sat 8:00 AM – 6:00 PM · Sun Closed',
  emergency_phone: '(312) 555-0199',
  welcome_headline: 'Welcome to Your Tenant Portal',
  welcome_message: 'Submit service requests, book amenities, stay informed on building news — all in one place.',
  announcement: '',
  announcement_type: 'info',
  primary_color: '#1B3A6B',
  primary_light: '#2752A0',
  primary_dark: '#0F2040',
  accent_color: '#C9922A',
  bg_color: '#F0F4F9',
  sidebar_bg: '#0F2040',
  font_family: 'Inter',
  theme_preset: 'navy',
  logo_type: 'text',
  logo_url: '',
  banner_enabled: 'false',
  banner_image_url: '',
  banner_title: '',
  banner_subtitle: '',
  banner_link_url: '',
  banner_height: '180',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: 'noreply@randolphofficecenter.com',
  email_enabled: 'false',
  maintenance_mode: 'false',
  maintenance_message: 'The portal is temporarily offline for scheduled maintenance. Please check back later.',
};

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

function initializeDatabase() {
  db.exec(`
    -- ── Users ─────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      email            TEXT UNIQUE NOT NULL,
      name             TEXT NOT NULL,
      password_hash    TEXT NOT NULL,
      role             TEXT NOT NULL DEFAULT 'tenant_user',
      tenant_id        INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      title            TEXT,
      phone            TEXT,
      directory_opt_out INTEGER DEFAULT 0,
      active           INTEGER DEFAULT 1,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Tenants (companies) ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tenants (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      building   TEXT NOT NULL,         -- '728', '730', '732'
      suite      TEXT,
      active     INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Named contacts per tenant (shown in directory) ────────────────────────
    CREATE TABLE IF NOT EXISTS tenant_contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      title      TEXT,
      email      TEXT,
      phone      TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Request categories (dynamic, managed by PM Admin) ─────────────────────
    CREATE TABLE IF NOT EXISTS request_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE NOT NULL,
      active     INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Service requests ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS service_requests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
      building        TEXT NOT NULL,
      category_id     INTEGER NOT NULL REFERENCES request_categories(id),
      description     TEXT NOT NULL,
      priority        TEXT NOT NULL DEFAULT 'medium',
      status          TEXT NOT NULL DEFAULT 'open',
      submitted_by_id INTEGER NOT NULL REFERENCES users(id),
      created_by_pm_id INTEGER REFERENCES users(id),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── PM-only internal notes ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS request_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      author_id  INTEGER NOT NULL REFERENCES users(id),
      content    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Status change history ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS request_status_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id    INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      from_status   TEXT,
      to_status     TEXT NOT NULL,
      changed_by_id INTEGER NOT NULL REFERENCES users(id),
      note          TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── File attachments ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS request_attachments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id      INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      original_name   TEXT NOT NULL,
      stored_name     TEXT NOT NULL,
      mime_type       TEXT,
      uploaded_by_id  INTEGER NOT NULL REFERENCES users(id),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Announcements ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS announcements (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      content          TEXT NOT NULL,
      author_id        INTEGER NOT NULL REFERENCES users(id),
      target_type      TEXT NOT NULL DEFAULT 'portfolio', -- 'portfolio','building','tenant'
      target_building  TEXT,     -- '728','730','732' or NULL
      target_tenant_id INTEGER REFERENCES tenants(id),
      urgent           INTEGER DEFAULT 0,
      pinned           INTEGER DEFAULT 0,
      publish_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Amenities ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS amenities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      location    TEXT,
      capacity    INTEGER NOT NULL DEFAULT 50,
      active      INTEGER DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Add-on resources per amenity ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS amenity_resources (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      quantity   INTEGER DEFAULT 1,
      active     INTEGER DEFAULT 1
    );

    -- ── Bookings ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bookings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      amenity_id INTEGER NOT NULL REFERENCES amenities(id),
      user_id    INTEGER NOT NULL REFERENCES users(id),
      tenant_id  INTEGER NOT NULL REFERENCES tenants(id),
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      headcount  INTEGER DEFAULT 1,
      notes      TEXT,
      status     TEXT NOT NULL DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Resources selected per booking ───────────────────────────────────────
    CREATE TABLE IF NOT EXISTS booking_resources (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      resource_id INTEGER NOT NULL REFERENCES amenity_resources(id),
      quantity    INTEGER DEFAULT 1
    );

    -- ── PM-set blackout windows ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS blackouts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      amenity_id    INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      start_time    TEXT NOT NULL,
      end_time      TEXT NOT NULL,
      reason        TEXT,
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Leases (PM Admin only) ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS leases (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      building      TEXT NOT NULL,
      suite         TEXT NOT NULL,
      start_date    TEXT NOT NULL,
      end_date      TEXT NOT NULL,
      monthly_rent  REAL,
      notes         TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Notification preferences per user ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS notification_prefs (
      user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      request_updates       INTEGER DEFAULT 1,
      booking_confirmations INTEGER DEFAULT 1,
      announcements         INTEGER DEFAULT 1
    );

    -- ── Audit log ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER REFERENCES users(id),
      action     TEXT NOT NULL,
      entity     TEXT,
      entity_id  INTEGER,
      metadata   TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Site settings (key/value) ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // ── Migrations ────────────────────────────────────────────────────────────
  try { db.exec('ALTER TABLE users ADD COLUMN door_code TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE leases ADD COLUMN sq_footage REAL'); } catch (_) {}
  try { db.exec('ALTER TABLE leases ADD COLUMN security_deposit REAL'); } catch (_) {}
  try { db.exec('ALTER TABLE leases ADD COLUMN lease_type TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE leases ADD COLUMN renewal_option TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE tenants ADD COLUMN directory_hidden INTEGER DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE announcements ADD COLUMN expires_at DATETIME'); } catch (_) {}

  // ── Seed default settings ─────────────────────────────────────────────────
  const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    upsert.run(key, value);
  }

  // ── Seed PM Admin ─────────────────────────────────────────────────────────
  const adminExists = db.prepare("SELECT id FROM users WHERE email = 'admin@randolphofficecenter.com'").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('Admin123!', 10);
    const adminId = db.prepare(
      `INSERT INTO users (email, name, password_hash, role, active)
       VALUES ('admin@randolphofficecenter.com', 'Building Management', ?, 'pm_admin', 1)`
    ).run(hash).lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(adminId);
  }

  // ── Seed PM User ──────────────────────────────────────────────────────────
  const pmUserExists = db.prepare("SELECT id FROM users WHERE email = 'staff@randolphofficecenter.com'").get();
  if (!pmUserExists) {
    const hash = bcrypt.hashSync('Staff123!', 10);
    const pmUserId = db.prepare(
      `INSERT INTO users (email, name, password_hash, role, active)
       VALUES ('staff@randolphofficecenter.com', 'Property Staff', ?, 'pm_user', 1)`
    ).run(hash).lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(pmUserId);
  }

  // ── Seed demo tenants ─────────────────────────────────────────────────────
  const tenantCount = db.prepare('SELECT COUNT(*) as c FROM tenants').get().c;
  if (tenantCount === 0) {
    const t1 = db.prepare("INSERT INTO tenants (name, building, suite) VALUES ('Acme Corp', '728', 'Suite 200')").run().lastInsertRowid;
    const t2 = db.prepare("INSERT INTO tenants (name, building, suite) VALUES ('Bright Ventures LLC', '730', 'Suite 150')").run().lastInsertRowid;
    const t3 = db.prepare("INSERT INTO tenants (name, building, suite) VALUES ('Sterling Law Partners', '732', 'Suite 300')").run().lastInsertRowid;

    // Tenant admin for Acme
    const hash1 = bcrypt.hashSync('Tenant123!', 10);
    const ta1 = db.prepare(
      `INSERT INTO users (email, name, password_hash, role, tenant_id, title, phone, active)
       VALUES ('admin@acmecorp.com', 'Alice Johnson', ?, 'tenant_admin', ?, 'Office Manager', '312-555-0200', 1)`
    ).run(hash1, t1).lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(ta1);

    // Tenant user for Acme
    const hash2 = bcrypt.hashSync('Tenant123!', 10);
    const tu1 = db.prepare(
      `INSERT INTO users (email, name, password_hash, role, tenant_id, title, phone, active)
       VALUES ('bob@acmecorp.com', 'Bob Williams', ?, 'tenant_user', ?, 'Engineer', '312-555-0201', 1)`
    ).run(hash2, t1).lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(tu1);

    // Tenant admin for Bright Ventures
    const hash3 = bcrypt.hashSync('Tenant123!', 10);
    const ta2 = db.prepare(
      `INSERT INTO users (email, name, password_hash, role, tenant_id, title, phone, active)
       VALUES ('info@brightventures.com', 'Carol Davis', ?, 'tenant_admin', ?, 'CEO', '312-555-0300', 1)`
    ).run(hash3, t2).lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(ta2);

    // Named contact for Sterling Law
    db.prepare("INSERT INTO tenant_contacts (tenant_id, name, title, email, phone, is_primary) VALUES (?, 'James Sterling', 'Managing Partner', 'j.sterling@sterlinglaw.com', '312-555-0400', 1)").run(t3);
  }

  // ── Seed request categories ────────────────────────────────────────────────
  const catCount = db.prepare('SELECT COUNT(*) as c FROM request_categories').get().c;
  if (catCount === 0) {
    const cats = ['HVAC', 'Electrical', 'Plumbing', 'Cleaning', 'Building Access', 'General'];
    cats.forEach((name, i) =>
      db.prepare('INSERT INTO request_categories (name, sort_order) VALUES (?, ?)').run(name, i)
    );
  }

  // ── Seed Rooftop amenity ───────────────────────────────────────────────────
  const amenityCount = db.prepare('SELECT COUNT(*) as c FROM amenities').get().c;
  if (amenityCount === 0) {
    const rooftopId = db.prepare(
      `INSERT INTO amenities (name, description, location, capacity)
       VALUES ('Rooftop Terrace', 'Panoramic city views — ideal for events, networking, and gatherings. Available April through October.', 'Rooftop Level', 75)`
    ).run().lastInsertRowid;

    const addons = [
      { name: 'Folding Tables', qty: 10 },
      { name: 'Chairs', qty: 50 },
      { name: 'AV Screen & Projector', qty: 1 },
      { name: 'Wireless Microphone', qty: 2 },
      { name: 'Portable Heaters', qty: 4 },
    ];
    for (const a of addons) {
      db.prepare('INSERT INTO amenity_resources (amenity_id, name, quantity) VALUES (?, ?, ?)').run(rooftopId, a.name, a.qty);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return { ...DEFAULT_SETTINGS, ...s };
}

function auditLog(userId, action, entity, entityId, metadata, ipAddress) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId ?? null, action, entity ?? null, entityId ?? null,
    metadata ? JSON.stringify(metadata) : null, ipAddress ?? null);
}

module.exports = { db, initializeDatabase, getSettings, DEFAULT_SETTINGS, auditLog };
