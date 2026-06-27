const express = require('express');
const path = require('path');
const multer = require('multer');
const { db, auditLog, getSettings } = require('../database');
const { requireAuth, requirePM, requirePMAdmin, isPM } = require('../middleware/auth');
const { notifyNewRequest, notifyRequestStatus, notifyNewComment } = require('../lib/email');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `req-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?)$/i;
    cb(null, allowed.test(file.originalname));
  },
});

const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['open', 'in_progress', 'pending_tenant', 'resolved', 'closed'];

function getRequestById(id, userId, userRole) {
  return db.prepare(`
    SELECT r.*, c.name as category_name,
           t.name as tenant_name, t.building as tenant_building,
           u.name as submitted_by_name, u.email as submitted_by_email,
           pm.name as created_by_pm_name
    FROM service_requests r
    JOIN request_categories c ON r.category_id = c.id
    JOIN tenants t ON r.tenant_id = t.id
    JOIN users u ON r.submitted_by_id = u.id
    LEFT JOIN users pm ON r.created_by_pm_id = pm.id
    WHERE r.id = ?
  `).get(id);
}

// GET /api/requests — list
router.get('/', requireAuth, (req, res) => {
  const { status, priority, building, tenant_id, category_id } = req.query;
  let where = [];
  let params = [];

  if (!isPM(req.user)) {
    // Tenants see only their own company's requests
    where.push('r.tenant_id = ?');
    params.push(req.user.tenant_id);
  } else if (tenant_id) {
    where.push('r.tenant_id = ?');
    params.push(tenant_id);
  }

  if (status && VALID_STATUSES.includes(status)) { where.push('r.status = ?'); params.push(status); }
  if (priority && VALID_PRIORITIES.includes(priority)) { where.push('r.priority = ?'); params.push(priority); }
  if (building && ['720','730','732'].includes(building)) { where.push('r.building = ?'); params.push(building); }
  if (category_id) { where.push('r.category_id = ?'); params.push(category_id); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const requests = db.prepare(`
    SELECT r.id, r.status, r.priority, r.building, r.created_at, r.updated_at,
           c.name as category_name,
           t.name as tenant_name, t.building as tenant_building,
           u.name as submitted_by_name
    FROM service_requests r
    JOIN request_categories c ON r.category_id = c.id
    JOIN tenants t ON r.tenant_id = t.id
    JOIN users u ON r.submitted_by_id = u.id
    ${whereClause}
    ORDER BY
      CASE r.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      r.created_at DESC
  `).all(...params);

  res.json(requests);
});

// GET /api/requests/:id — detail
router.get('/:id', requireAuth, (req, res) => {
  const req_ = getRequestById(req.params.id);
  if (!req_) return res.status(404).json({ error: 'Request not found' });
  if (!isPM(req.user) && req_.tenant_id !== req.user.tenant_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const history = db.prepare(`
    SELECT h.*, u.name as changed_by_name
    FROM request_status_history h JOIN users u ON h.changed_by_id = u.id
    WHERE h.request_id = ? ORDER BY h.created_at ASC
  `).all(req.params.id);

  const attachments = db.prepare(`
    SELECT a.*, u.name as uploaded_by_name
    FROM request_attachments a JOIN users u ON a.uploaded_by_id = u.id
    WHERE a.request_id = ? ORDER BY a.created_at ASC
  `).all(req.params.id);

  let notes = [];
  if (isPM(req.user)) {
    notes = db.prepare(`
      SELECT n.*, u.name as author_name
      FROM request_notes n JOIN users u ON n.author_id = u.id
      WHERE n.request_id = ? ORDER BY n.created_at ASC
    `).all(req.params.id);
  }

  const comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.role as author_role
    FROM service_request_comments c JOIN users u ON c.author_id = u.id
    WHERE c.request_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json({ ...req_, history, attachments, notes, comments });
});

// POST /api/requests — create
router.post('/', requireAuth, upload.array('attachments', 5), (req, res) => {
  const { category_id, description, priority, tenant_id: bodyTenantId } = req.body;
  if (!category_id || !description?.trim()) {
    return res.status(400).json({ error: 'Category and description are required' });
  }
  if (description.trim().length > 5000) {
    return res.status(400).json({ error: 'Description must be 5,000 characters or fewer' });
  }

  // PM can create on behalf of a tenant
  let tenantId, submittedById, createdByPMId;
  if (isPM(req.user)) {
    if (!bodyTenantId) return res.status(400).json({ error: 'Tenant is required when PM creates a request' });
    tenantId = bodyTenantId;
    // PM creating on behalf — use a tenant user as the nominal submitter so status
    // update emails go to someone on that tenant, not the PM. Prefer tenant_admin,
    // fall back to any active tenant user.
    const tenantRep = db.prepare(
      `SELECT id FROM users WHERE tenant_id=? AND active=1 ORDER BY CASE role WHEN 'tenant_admin' THEN 0 ELSE 1 END LIMIT 1`
    ).get(bodyTenantId);
    submittedById = tenantRep ? tenantRep.id : req.user.id;
    createdByPMId = req.user.id;
  } else {
    if (!req.user.tenant_id) return res.status(400).json({ error: 'Not associated with a tenant' });
    tenantId = req.user.tenant_id;
    submittedById = req.user.id;
    createdByPMId = null;
  }

  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const cat = db.prepare('SELECT id FROM request_categories WHERE id=? AND active=1').get(category_id);
  if (!cat) return res.status(400).json({ error: 'Invalid category' });

  const prio = VALID_PRIORITIES.includes(priority) ? priority : 'medium';

  const reqId = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO service_requests (tenant_id, building, category_id, description, priority, status, submitted_by_id, created_by_pm_id)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(tenantId, tenant.building, category_id, description.trim(), prio, submittedById, createdByPMId);

    const id = result.lastInsertRowid;

    db.prepare(`INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_id) VALUES (?, NULL, 'open', ?)`)
      .run(id, req.user.id);

    if (req.files?.length) {
      for (const f of req.files) {
        db.prepare(`INSERT INTO request_attachments (request_id, original_name, stored_name, mime_type, uploaded_by_id) VALUES (?, ?, ?, ?, ?)`)
          .run(id, f.originalname, f.filename, f.mimetype || 'application/octet-stream', req.user.id);
      }
    }

    return id;
  })();

  auditLog(req.user.id, 'create_request', 'service_request', reqId, { tenantId, priority: prio }, req.ip);
  const created = getRequestById(reqId);

  // Notify all PM users of the new request
  const pmUsers = db.prepare(`
    SELECT u.email, np.request_updates FROM users u
    LEFT JOIN notification_prefs np ON np.user_id = u.id
    WHERE u.role IN ('pm_admin', 'pm_user') AND u.active = 1
  `).all();

  // Confirmation to the submitting tenant user only (not when PM creates on behalf)
  const submitter = !isPM(req.user) ? db.prepare(`
    SELECT u.email, np.request_updates FROM users u
    LEFT JOIN notification_prefs np ON np.user_id = u.id
    WHERE u.id = ? AND u.active = 1
  `).get(req.user.id) : null;

  notifyNewRequest(created, pmUsers, submitter).catch(err => console.warn('[Email] Notification failed:', err.message));

  res.status(201).json(created);
});

// PATCH /api/requests/:id/status — PM can set any status; submitter can only close their own
router.patch('/:id/status', requireAuth, (req, res) => {
  const { status, note } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const req_ = db.prepare('SELECT * FROM service_requests WHERE id=?').get(req.params.id);
  if (!req_) return res.status(404).json({ error: 'Request not found' });

  if (!isPM(req.user)) {
    if (req_.tenant_id !== req.user.tenant_id) return res.status(403).json({ error: 'Access denied' });
    const tenantAdminCanClose = req.user.role === 'tenant_admin'
      && getSettings().tenant_admin_close_all_requests === '1';
    if (req_.submitted_by_id !== req.user.id && !tenantAdminCanClose) {
      return res.status(403).json({ error: 'You can only close requests you submitted' });
    }
    if (status !== 'closed') return res.status(403).json({ error: 'You can only close a request, not change its status otherwise' });
  }

  const oldStatus = req_.status;
  db.prepare(`UPDATE service_requests SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, req.params.id);
  db.prepare(`INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_id, note) VALUES (?, ?, ?, ?, ?)`)
    .run(req.params.id, oldStatus, status, req.user.id, note || null);

  auditLog(req.user.id, 'status_change', 'service_request', req.params.id, { from: oldStatus, to: status }, req.ip);

  const full = getRequestById(req.params.id);
  if (isPM(req.user)) {
    // Notify the tenant submitter. Guard against the edge case where submitted_by_id
    // points to a PM (fallback when a PM created the request for a tenant with no users).
    const submitter = db.prepare(`
      SELECT u.email, np.request_updates FROM users u
      LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE u.id = ? AND u.active = 1 AND u.role NOT IN ('pm_admin', 'pm_user')
    `).get(req_.submitted_by_id);

    if (submitter) {
      notifyRequestStatus(full, status, [submitter]).catch(err => console.warn('[Email] Notification failed:', err.message));
    } else if (req_.submitted_by_id !== req.user.id) {
      // submitted_by_id was a PM fallback — notify all active tenant users instead
      const tenantUsers = db.prepare(`
        SELECT u.email, np.request_updates FROM users u
        LEFT JOIN notification_prefs np ON np.user_id = u.id
        WHERE u.tenant_id = ? AND u.active = 1 AND u.role NOT IN ('pm_admin', 'pm_user')
      `).all(req_.tenant_id);
      if (tenantUsers.length) notifyRequestStatus(full, status, tenantUsers).catch(err => console.warn('[Email] Notification failed:', err.message));
    }
  } else {
    // Tenant closed their own request → notify PM users so they're aware
    const pmUsers = db.prepare(`
      SELECT u.email, np.request_updates FROM users u
      LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE u.role IN ('pm_admin', 'pm_user') AND u.active = 1
    `).all();
    notifyRequestStatus(full, status, pmUsers).catch(err => console.warn('[Email] Notification failed:', err.message));
  }

  res.json(getRequestById(req.params.id));
});

// PATCH /api/requests/:id/priority — PM only
router.patch('/:id/priority', requirePM, (req, res) => {
  const { priority } = req.body;
  if (!VALID_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
  const req_ = db.prepare('SELECT id FROM service_requests WHERE id=?').get(req.params.id);
  if (!req_) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE service_requests SET priority=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(priority, req.params.id);
  res.json(getRequestById(req.params.id));
});

// POST /api/requests/:id/notes — PM only internal note
router.post('/:id/notes', requirePM, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Note content is required' });
  if (content.trim().length > 5000) return res.status(400).json({ error: 'Note must be 5,000 characters or fewer' });
  const req_ = db.prepare('SELECT id FROM service_requests WHERE id=?').get(req.params.id);
  if (!req_) return res.status(404).json({ error: 'Request not found' });
  const result = db.prepare(`INSERT INTO request_notes (request_id, author_id, content) VALUES (?, ?, ?)`)
    .run(req.params.id, req.user.id, content.trim());
  const note = db.prepare(`
    SELECT n.*, u.name as author_name FROM request_notes n JOIN users u ON n.author_id = u.id WHERE n.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(note);
});

// POST /api/requests/:id/comments — shared tenant ↔ PM comment thread
router.post('/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (content.trim().length > 5000) return res.status(400).json({ error: 'Comment must be 5,000 characters or fewer' });
  const req_ = db.prepare('SELECT * FROM service_requests WHERE id=?').get(req.params.id);
  if (!req_) return res.status(404).json({ error: 'Request not found' });
  if (!isPM(req.user) && req_.tenant_id !== req.user.tenant_id) return res.status(403).json({ error: 'Access denied' });
  if (req_.status === 'closed') return res.status(403).json({ error: 'Cannot comment on a closed request' });

  const autoAdvance = isPM(req.user) && req_.status === 'open';

  const commentId = db.transaction(() => {
    const r = db.prepare(`INSERT INTO service_request_comments (request_id, author_id, content) VALUES (?, ?, ?)`)
      .run(req.params.id, req.user.id, content.trim());
    if (autoAdvance) {
      db.prepare(`UPDATE service_requests SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.params.id);
      db.prepare(`INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_id, note) VALUES (?, 'open', 'in_progress', ?, NULL)`)
        .run(req.params.id, req.user.id);
    }
    return r.lastInsertRowid;
  })();

  if (autoAdvance) {
    auditLog(req.user.id, 'status_change', 'service_request', req.params.id, { from: 'open', to: 'in_progress', auto: true }, req.ip);
  }

  const comment = db.prepare(`
    SELECT c.*, u.name as author_name, u.role as author_role
    FROM service_request_comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?
  `).get(commentId);

  const full = getRequestById(req.params.id);
  notifyNewComment(full, comment, isPM(req.user)).catch(err => console.warn('[Email] Notification failed:', err.message));

  res.status(201).json(comment);
});

// POST /api/requests/:id/attachments — upload attachment
router.post('/:id/attachments', requireAuth, upload.array('attachments', 5), (req, res) => {
  const req_ = db.prepare('SELECT * FROM service_requests WHERE id=?').get(req.params.id);
  if (!req_) return res.status(404).json({ error: 'Request not found' });
  if (!isPM(req.user) && req_.tenant_id !== req.user.tenant_id) return res.status(403).json({ error: 'Access denied' });
  if (req_.status === 'closed') return res.status(403).json({ error: 'Cannot attach files to a closed request' });
  if (!req.files?.length) return res.status(400).json({ error: 'No files provided' });

  const saved = [];
  for (const f of req.files) {
    const result = db.prepare(`INSERT INTO request_attachments (request_id, original_name, stored_name, mime_type, uploaded_by_id) VALUES (?, ?, ?, ?, ?)`)
      .run(req.params.id, f.originalname, f.filename, f.mimetype, req.user.id);
    saved.push({ id: result.lastInsertRowid, original_name: f.originalname, stored_name: f.filename });
  }
  res.status(201).json(saved);
});

module.exports = router;
