require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Upload directories ────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
const settingsUploadsDir = path.join(uploadsDir, 'settings');
[uploadsDir, settingsUploadsDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Multer for settings image uploads
const settingsStorage = multer.diskStorage({
  destination: settingsUploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `setting-${Date.now()}${ext}`);
  },
});
const settingsUpload = multer({
  storage: settingsStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(jpe?g|png|gif|webp|svg)$/i.test(file.originalname)),
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? false : `http://localhost:${process.env.PORT || 3000}`),
  credentials: true,
}));
app.use(helmet({
  // Allow inline scripts/styles used by the SPA
  contentSecurityPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});
app.use(express.static(path.join(__dirname, '../public')));

// Serve uploaded files (attachment downloads require auth — handled via /api/uploads route)
// Settings images are public (logos, backgrounds)
app.use('/uploads/settings', express.static(settingsUploadsDir));

// ── API Routes ────────────────────────────────────────────────────────────────
const settingsRouter = require('./routes/settings');

// Settings upload — inject multer before the route handler
app.post('/api/settings/upload', settingsUpload.single('image'), (req, res, next) => {
  settingsRouter.handle(req, res, next);
});

app.post('/api/auth/login', loginLimiter);
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/requests',      require('./routes/requests'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/bookings',      require('./routes/bookings'));
app.use('/api/amenities',     require('./routes/amenities'));
app.use('/api/directory',     require('./routes/directory'));
app.use('/api/leases',        require('./routes/leases'));
app.use('/api/tenants',       require('./routes/tenants'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/settings',      settingsRouter);
app.use('/api/admin',         require('./routes/backup'));

// Serve attachment files with auth check
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');
app.get('/api/uploads/:filename', (req, res) => {
  const token = req.headers.authorization?.slice(7) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Auth required' });
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  const filePath = path.join(uploadsDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Audit log endpoint — PM only
const { requirePMAdmin } = require('./middleware/auth');
const { db } = require('./database');
app.get('/api/audit', requirePMAdmin, (req, res) => {
  const { entity, limit = 100, offset = 0 } = req.query;
  const where = entity ? 'WHERE a.entity = ?' : '';
  const params = entity ? [entity, parseInt(limit), parseInt(offset)] : [parseInt(limit), parseInt(offset)];
  const logs = db.prepare(`
    SELECT a.*, u.name as user_name, u.email as user_email
    FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
    ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(...params);
  res.json(logs);
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler — must be registered after all routes
app.use((err, req, res, next) => {
  console.error('[Error]', req.method, req.path, err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => { console.error('[Unhandled Rejection]', reason); });
process.on('uncaughtException', (err) => { console.error('[Uncaught Exception]', err); process.exit(1); });

// ── Start ─────────────────────────────────────────────────────────────────────
initializeDatabase();
app.listen(PORT, () => {
  console.log(`Randolph Office Center Portal — http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('  PM Admin : admin@randolphofficecenter.com / Admin123!');
    console.log('  PM Staff : staff@randolphofficecenter.com / Staff123!');
    console.log('  Tenant   : admin@acmecorp.com / Tenant123!');
  }
});
