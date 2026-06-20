const express = require('express');
const { db, getSettings } = require('../database');
const { requirePMAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — public
router.get('/', (req, res) => res.json(getSettings()));

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
    'banner_enabled', 'banner_image_url', 'banner_title', 'banner_subtitle', 'banner_link_url', 'banner_height',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'email_enabled',
  ];
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction((data) => {
    for (const key of allowed) {
      if (key in data) upsert.run(key, data[key] ?? '');
    }
  })(req.body);
  res.json(getSettings());
});

// POST /api/settings/upload — image upload (multer injected by index.js)
router.post('/upload', requirePMAdmin, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/settings/${req.file.filename}` });
});

module.exports = router;
