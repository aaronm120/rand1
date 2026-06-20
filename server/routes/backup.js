const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const archiver  = require('archiver');
const unzipper  = require('unzipper');
const multer    = require('multer');
const nodemailer          = require('nodemailer');
const { db, getSettings } = require('../database');
const { requirePMAdmin }  = require('../middleware/auth');

const router   = express.Router();
const dataDir  = path.join(__dirname, '../../data');
const uploadsDir = path.join(__dirname, '../../uploads');

// Multer: save uploaded zip to OS temp dir, max 500 MB
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `portal-restore-${Date.now()}.zip`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.zip$/i.test(file.originalname) || file.mimetype === 'application/zip';
    cb(ok ? null : new Error('Only .zip files are accepted'), ok);
  },
});

// ── GET /api/admin/backup ────────────────────────────────────────────────────
// Streams a ZIP containing portal.db + uploads/ directory.
router.get('/backup', requirePMAdmin, async (req, res) => {
  const tmpDb = path.join(dataDir, `backup-snap-${Date.now()}.db`);
  try {
    await db.backup(tmpDb);

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="randolph-portal-backup-${date}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    // Clean up the temp DB snapshot once the response stream finishes
    res.on('finish', () => { try { fs.unlinkSync(tmpDb); } catch (_) {} });
    res.on('close',  () => { try { fs.unlinkSync(tmpDb); } catch (_) {} });

    archive.pipe(res);
    archive.file(tmpDb, { name: 'portal.db' });
    if (fs.existsSync(uploadsDir)) archive.directory(uploadsDir, 'uploads');
    await archive.finalize();
  } catch (err) {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/restore ──────────────────────────────────────────────────
// Accepts a ZIP backup, validates it, and stages it for the next server restart.
router.post('/restore', requirePMAdmin, restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  const zipPath          = req.file.path;
  const pendingDbPath    = path.join(dataDir, 'portal.db.pending');
  const pendingUploads   = path.join(dataDir, 'uploads.pending');

  try {
    const directory = await unzipper.Open.file(zipPath);
    const dbEntry   = directory.files.find(f => f.path === 'portal.db');
    if (!dbEntry) {
      return res.status(400).json({ error: 'Invalid backup: portal.db not found in archive' });
    }

    // Extract portal.db → pending slot
    await new Promise((resolve, reject) => {
      dbEntry.stream()
        .pipe(fs.createWriteStream(pendingDbPath))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Extract uploads/ → pending uploads slot
    const uploadEntries = directory.files.filter(
      f => f.path.startsWith('uploads/') && f.type !== 'Directory'
    );
    if (uploadEntries.length > 0) {
      if (fs.existsSync(pendingUploads)) fs.rmSync(pendingUploads, { recursive: true, force: true });
      fs.mkdirSync(pendingUploads, { recursive: true });

      await Promise.all(uploadEntries.map(f => new Promise((resolve, reject) => {
        const relPath = f.path.slice('uploads/'.length);
        const outPath = path.join(pendingUploads, relPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        f.stream().pipe(fs.createWriteStream(outPath))
          .on('finish', resolve).on('error', reject);
      })));
    }

    res.json({ ok: true, requiresRestart: true });
  } catch (err) {
    try { fs.unlinkSync(pendingDbPath); } catch (_) {}
    try { fs.rmSync(pendingUploads, { recursive: true, force: true }); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(zipPath); } catch (_) {}
  }
});

// ── POST /api/admin/test-email ───────────────────────────────────────────────
// Tests SMTP using the values from the form (not necessarily saved yet).
// Falls back to the stored smtp_pass if the password field was left blank.
router.post('/test-email', requirePMAdmin, async (req, res) => {
  const { to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from } = req.body;
  if (!to)        return res.status(400).json({ error: 'Recipient email is required' });
  if (!smtp_host) return res.status(400).json({ error: 'SMTP host is required' });

  // Use the provided password, or fall back to what's already stored
  const password = smtp_pass || getSettings().smtp_pass || '';
  const port     = parseInt(smtp_port, 10) || 587;

  const transporter = nodemailer.createTransport({
    host:   smtp_host,
    port,
    secure: port === 465,
    auth:   smtp_user ? { user: smtp_user, pass: password } : undefined,
  });

  try {
    await transporter.sendMail({
      from:    smtp_from || 'noreply@randolphofficecenter.com',
      to,
      subject: 'Test Email — Randolph Office Center Portal',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1B3A6B">Test Email</h2>
        <p>This is a test message from the <strong>Randolph Office Center Tenant Portal</strong>.</p>
        <p style="color:#166534;background:#dcfce7;padding:10px 14px;border-radius:6px">
          &#10003; Your SMTP configuration is working correctly.
        </p>
        <p style="color:#999;font-size:12px;margin-top:24px">Sent via the Admin Panel · SMTP host: ${smtp_host}</p>
      </div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── POST /api/admin/restart ──────────────────────────────────────────────────
// Triggers a clean process exit so PM2 (or the process manager) restarts the server.
router.post('/restart', requirePMAdmin, (req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 500);
});

module.exports = router;
