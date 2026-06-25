const express = require('express');
const { db, getSettings, auditLog } = require('../database');
const { requirePMAdmin } = require('../middleware/auth');

const router = express.Router();

// Public settings — strips sensitive SMTP credentials
const PUBLIC_KEYS = [
  'building_name', 'building_tagline', 'buildings',
  'building_address', 'building_phone', 'building_email',
  'building_hours', 'emergency_phone',
  'welcome_headline', 'welcome_message',
  'announcement', 'announcement_type',
  'primary_color', 'primary_light', 'primary_dark', 'accent_color',
  'bg_color', 'sidebar_bg', 'font_family', 'theme_preset',
  'logo_type', 'logo_url',
  'login_image',
  'banner_enabled', 'banner_image_url', 'banner_title', 'banner_subtitle', 'banner_link_url', 'banner_height',
  'email_enabled', 'maintenance_mode', 'maintenance_message',
];

router.get('/', (req, res) => {
  const all = getSettings();
  const pub = {};
  for (const k of PUBLIC_KEYS) pub[k] = all[k];
  res.json(pub);
});

// Full settings — PM Admin only; smtp_pass masked (never sent to client)
router.get('/admin', requirePMAdmin, (req, res) => {
  const s = getSettings();
  res.json({ ...s, smtp_pass: s.smtp_pass ? '••••••••' : '' });
});

// PUT /api/settings — PM Admin only
router.put('/', requirePMAdmin, (req, res) => {
  const allowed = [
    'building_name', 'building_tagline', 'buildings',
    'building_address', 'building_phone', 'building_email',
    'building_hours', 'emergency_phone',
    'welcome_headline', 'welcome_message',
    'announcement', 'announcement_type',
    'primary_color', 'primary_light', 'primary_dark', 'accent_color',
    'bg_color', 'sidebar_bg', 'font_family', 'theme_preset',
    'logo_type', 'logo_url',
    'login_image',
    'banner_enabled', 'banner_image_url', 'banner_title', 'banner_subtitle', 'banner_link_url', 'banner_height',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'email_enabled',
    'maintenance_mode', 'maintenance_message',
  ];
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const changedKeys = [];
  db.transaction((data) => {
    for (const key of allowed) {
      if (!(key in data)) continue;
      if (key === 'smtp_pass' && data[key] === '••••••••') continue;
      upsert.run(key, data[key] ?? '');
      changedKeys.push(key);
    }
  })(req.body);
  auditLog(req.user.id, 'update_settings', 'settings', null, { keys: changedKeys }, req.ip);
  const s = getSettings();
  res.json({ ...s, smtp_pass: s.smtp_pass ? '••••••••' : '' });
});

// POST /api/settings/upload — image upload (multer injected by index.js)
router.post('/upload', requirePMAdmin, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/settings/${req.file.filename}` });
});

module.exports = router;
