const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, auditLog } = require('../database');
const { requirePMAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../../uploads');
const pdfStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `lease-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /\.pdf$/i.test(file.originalname));
  },
});

// All lease routes are PM Admin only

const LEASE_SELECT = `
  SELECT l.id, l.tenant_id, l.building,
         l.suite          AS suite_number,
         l.start_date     AS lease_start,
         l.end_date       AS lease_end,
         l.monthly_rent, l.sq_footage, l.security_deposit,
         l.lease_type, l.renewal_option, l.notes,
         l.created_at, l.updated_at,
         t.name           AS tenant_name,
         t.building       AS tenant_building
  FROM leases l JOIN tenants t ON l.tenant_id = t.id
`;

// GET /api/leases
router.get('/', requirePMAdmin, (req, res) => {
  const { building, tenant_id } = req.query;
  let where = [];
  let params = [];
  if (building)   { where.push('l.building = ?');   params.push(building); }
  if (tenant_id)  { where.push('l.tenant_id = ?');  params.push(tenant_id); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  res.json(db.prepare(`${LEASE_SELECT} ${whereClause} ORDER BY CASE WHEN l.end_date IS NULL THEN '9999-99-99' ELSE l.end_date END ASC`).all(...params));
});

// GET /api/leases/:id
router.get('/:id', requirePMAdmin, (req, res) => {
  const lease = db.prepare(`${LEASE_SELECT} WHERE l.id = ?`).get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });
  res.json(lease);
});

// POST /api/leases
router.post('/', requirePMAdmin, (req, res) => {
  const {
    tenant_id, monthly_rent, notes,
    sq_footage, security_deposit, lease_type, renewal_option,
  } = req.body;

  // Accept either frontend names or DB column names
  const suite      = req.body.suite_number ?? req.body.suite ?? null;
  const start_date = req.body.lease_start  ?? req.body.start_date ?? null;
  const end_date   = req.body.lease_end    ?? req.body.end_date   ?? null;

  if (!tenant_id || !start_date) {
    return res.status(400).json({ error: 'Tenant and start date are required' });
  }
  if (isNaN(new Date(start_date))) return res.status(400).json({ error: 'Invalid start date' });
  if (end_date && isNaN(new Date(end_date))) return res.status(400).json({ error: 'Invalid end date' });
  if (end_date && start_date >= end_date) {
    return res.status(400).json({ error: 'Lease end date must be after start date' });
  }

  const tenant = db.prepare('SELECT id, building FROM tenants WHERE id=?').get(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const result = db.prepare(`
    INSERT INTO leases
      (tenant_id, building, suite, start_date, end_date, monthly_rent,
       sq_footage, security_deposit, lease_type, renewal_option, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenant_id, tenant.building, suite, start_date, end_date,
    monthly_rent || null, sq_footage || null, security_deposit || null,
    lease_type || null, renewal_option || null, notes || null,
  );

  auditLog(req.user.id, 'create_lease', 'lease', result.lastInsertRowid, { tenant_id }, req.ip);
  res.status(201).json(db.prepare(`${LEASE_SELECT} WHERE l.id = ?`).get(result.lastInsertRowid));
});

// PATCH /api/leases/:id
router.patch('/:id', requirePMAdmin, (req, res) => {
  const lease = db.prepare('SELECT * FROM leases WHERE id=?').get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });

  const suite      = req.body.suite_number !== undefined ? req.body.suite_number : (req.body.suite      ?? lease.suite);
  const start_date = req.body.lease_start  !== undefined ? req.body.lease_start  : (req.body.start_date ?? lease.start_date);
  const end_date   = req.body.lease_end    !== undefined ? req.body.lease_end    : (req.body.end_date   ?? lease.end_date);

  if (start_date && isNaN(new Date(start_date))) return res.status(400).json({ error: 'Invalid start date' });
  if (end_date && isNaN(new Date(end_date))) return res.status(400).json({ error: 'Invalid end date' });
  if (start_date && end_date && start_date >= end_date) {
    return res.status(400).json({ error: 'Lease end date must be after start date' });
  }

  const monthly_rent     = req.body.monthly_rent     !== undefined ? req.body.monthly_rent     : lease.monthly_rent;
  const sq_footage       = req.body.sq_footage       !== undefined ? req.body.sq_footage       : lease.sq_footage;
  const security_deposit = req.body.security_deposit !== undefined ? req.body.security_deposit : lease.security_deposit;
  const lease_type       = req.body.lease_type       !== undefined ? req.body.lease_type       : lease.lease_type;
  const renewal_option   = req.body.renewal_option   !== undefined ? req.body.renewal_option   : lease.renewal_option;
  const notes            = req.body.notes            !== undefined ? req.body.notes            : lease.notes;

  db.prepare(`
    UPDATE leases
    SET suite=?, start_date=?, end_date=?, monthly_rent=?,
        sq_footage=?, security_deposit=?, lease_type=?, renewal_option=?,
        notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(suite, start_date, end_date, monthly_rent, sq_footage, security_deposit, lease_type, renewal_option, notes, req.params.id);

  auditLog(req.user.id, 'update_lease', 'lease', req.params.id, null, req.ip);
  res.json(db.prepare(`${LEASE_SELECT} WHERE l.id = ?`).get(req.params.id));
});

// DELETE /api/leases/:id
router.delete('/:id', requirePMAdmin, (req, res) => {
  const lease = db.prepare('SELECT id FROM leases WHERE id=?').get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM leases WHERE id=?').run(req.params.id);
  auditLog(req.user.id, 'delete_lease', 'lease', req.params.id, null, req.ip);
  res.json({ message: 'Deleted' });
});

// GET /api/leases/:id/attachments
router.get('/:id/attachments', requirePMAdmin, (req, res) => {
  const lease = db.prepare('SELECT id FROM leases WHERE id=?').get(req.params.id);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });
  const attachments = db.prepare(`
    SELECT a.id, a.original_name, a.stored_name, a.created_at, u.name as uploaded_by_name
    FROM lease_attachments a JOIN users u ON a.uploaded_by_id = u.id
    WHERE a.lease_id = ? ORDER BY a.created_at DESC
  `).all(req.params.id);
  res.json(attachments);
});

// POST /api/leases/:id/attachments
router.post('/:id/attachments', requirePMAdmin, (req, res, next) => {
  uploadPdf.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 20 MB limit' });
      return res.status(400).json({ error: 'Only PDF files are accepted' });
    }
    const lease = db.prepare('SELECT id FROM leases WHERE id=?').get(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });

    const result = db.prepare(
      'INSERT INTO lease_attachments (lease_id, original_name, stored_name, uploaded_by_id) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, req.file.originalname, req.file.filename, req.user.id);

    auditLog(req.user.id, 'upload_lease_attachment', 'lease', req.params.id, { file: req.file.originalname }, req.ip);
    res.status(201).json({
      id: result.lastInsertRowid,
      original_name: req.file.originalname,
      stored_name: req.file.filename,
    });
  });
});

// DELETE /api/leases/:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', requirePMAdmin, (req, res) => {
  const attachment = db.prepare(
    'SELECT * FROM lease_attachments WHERE id=? AND lease_id=?'
  ).get(req.params.attachmentId, req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  db.prepare('DELETE FROM lease_attachments WHERE id=?').run(req.params.attachmentId);

  // Remove file from disk (best-effort)
  try { fs.unlinkSync(path.join(uploadsDir, attachment.stored_name)); } catch (_) {}

  auditLog(req.user.id, 'delete_lease_attachment', 'lease', req.params.id, { file: attachment.original_name }, req.ip);
  res.json({ message: 'Deleted' });
});

module.exports = router;
