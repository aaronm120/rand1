const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const archiver  = require('archiver');
const unzipper  = require('unzipper');
const multer    = require('multer');
const { db }              = require('../database');
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

// ── POST /api/admin/restart ──────────────────────────────────────────────────
// Triggers a clean process exit so PM2 (or the process manager) restarts the server.
router.post('/restart', requirePMAdmin, (req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 500);
});

module.exports = router;
