/* ═══════════════════════════════════════════════════════
   ANNOUNCEMENTS
   ═══════════════════════════════════════════════════════ */

route('announcements', async () => {
  const u = state.user;
  setHeader('Announcements', 'Building communications');

  const announcements = await apiFetch('GET', '/api/announcements');

  const pinned  = announcements.filter(a => a.pinned);
  const urgent  = announcements.filter(a => a.urgent && !a.pinned);
  const regular = announcements.filter(a => !a.pinned && !a.urgent);

  function annCardHtml(a) {
    return `<div class="ann-card ${a.urgent?'urgent':''} ${a.pinned?'pinned':''}" onclick="navigate('announcement-detail',{id:${a.id}})" style="cursor:pointer">
      <div class="ann-card-header">
        <div class="ann-card-title">${esc(a.title)}</div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          ${a.urgent ? '<span class="badge badge-danger">🚨 Urgent</span>' : ''}
          ${a.pinned ? '<span class="badge badge-warning">📌 Pinned</span>' : ''}
          <span class="badge badge-gray">${targetLabel(a)}</span>
        </div>
      </div>
      <div class="ann-card-body">${esc(a.content.slice(0,220))}${a.content.length>220?'…':''}</div>
      <div class="ann-card-footer">
        <span>${fmtDate(a.publish_at)}</span>
        <span>${esc(a.author_name)}</span>
        ${isPM(state.user) && a.expires_at ? `<span style="color:var(--gray-400);font-size:.78rem">Expires ${fmtDate(a.expires_at)}</span>` : ''}
      </div>
    </div>`;
  }

  const pmActions = isPM(u) ? `<button class="btn btn-primary btn-sm" onclick="navigate('new-announcement')">+ New Announcement</button>` : '';

  setContent(`
    ${heroHtml('Announcements', 'Stay informed on building updates', '📢')}
    <div class="card">
      <div class="card-header">
        <div class="card-title">${announcements.length} announcement${announcements.length!==1?'s':''}</div>
        ${pmActions}
      </div>
      <div style="padding:18px">
        ${pinned.length ? `<div style="margin-bottom:18px"><div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-bottom:8px">📌 Pinned</div><div class="ann-grid">${pinned.map(annCardHtml).join('')}</div></div>` : ''}
        ${urgent.length ? `<div style="margin-bottom:18px"><div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--danger);margin-bottom:8px">🚨 Urgent</div><div class="ann-grid">${urgent.map(annCardHtml).join('')}</div></div>` : ''}
        ${regular.length ? `<div class="ann-grid">${regular.map(annCardHtml).join('')}</div>` :
          (!pinned.length && !urgent.length ? `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No announcements</div><div class="empty-desc">New announcements from building management will appear here.</div></div>` : '')}
      </div>
    </div>
  `);
});

function targetLabel(a) {
  if (a.target_type === 'portfolio') return 'All Buildings';
  if (a.target_type === 'building') return `${a.target_building} W. Randolph`;
  if (a.target_type === 'tenant') return a.target_tenant_name || 'Your Company';
  return 'All';
}

// ── Detail ─────────────────────────────────────────────────────────
route('announcement-detail', async ({ id }) => {
  if (!id) return navigate('announcements');
  const u = state.user;
  const ann = await apiFetch('GET', `/api/announcements/${id}`);
  setHeader(ann.title, '');

  const pmActions = isPM(u) ? `
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn btn-secondary btn-sm" onclick="showEditAnnModal(${ann.id})">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement(${ann.id})">Delete</button>
    </div>` : '';

  setContent(`
    <button class="btn btn-ghost btn-sm" onclick="navigate('announcements')" style="margin-bottom:14px">← Back</button>
    <div class="card" style="max-width:760px">
      <div class="card-header" style="gap:10px;flex-wrap:wrap">
        <div>
          <div class="card-title" style="font-size:1.2rem">${esc(ann.title)}</div>
          <div class="card-subtitle">${fmtDate(ann.publish_at)} · ${esc(ann.author_name)} · <span class="badge badge-gray">${targetLabel(ann)}</span></div>
        </div>
        <div style="display:flex;gap:6px">
          ${ann.urgent ? '<span class="badge badge-danger">🚨 Urgent</span>' : ''}
          ${ann.pinned ? '<span class="badge badge-warning">📌 Pinned</span>' : ''}
        </div>
      </div>
      <div class="card-body">
        <div style="font-size:.95rem;line-height:1.7;white-space:pre-wrap;color:var(--gray-800)">${esc(ann.content)}</div>
        ${pmActions}
      </div>
    </div>
  `);
});

// ── New announcement (PM only) ─────────────────────────────────────
route('new-announcement', async () => {
  if (!isPM(state.user)) return navigate('announcements');
  setHeader('New Announcement', '');

  const tenants = await apiFetch('GET', '/api/tenants');

  setContent(`
    ${heroHtml('New Announcement', 'Publish communications to tenants', '📢')}
    <div class="card" style="max-width:680px">
      <div class="card-header"><div class="card-title">Compose Announcement</div></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label required">Title</label>
          <input class="form-input" id="ann-title" placeholder="Announcement subject…">
        </div>
        <div class="form-group">
          <label class="form-label required">Content</label>
          <textarea class="form-textarea" id="ann-content" rows="6" placeholder="Write the full announcement here…" style="min-height:140px"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Target Audience</label>
            <select class="form-select" id="ann-target" onchange="updateTargetFields()">
              <option value="portfolio">All Buildings (Portfolio)</option>
              <option value="building">Specific Building</option>
              <option value="tenant">Specific Tenant</option>
            </select>
          </div>
          <div id="ann-target-detail"></div>
        </div>
        <div class="form-row" style="margin-top:4px">
          <label class="form-check"><input type="checkbox" id="ann-urgent"> <span>Mark as Urgent 🚨</span></label>
          <label class="form-check"><input type="checkbox" id="ann-pinned"> <span>Pin to top 📌</span></label>
        </div>
        <div class="form-group" style="margin-top:12px">
          <label class="form-label">Auto-delete on (optional)</label>
          <input type="datetime-local" class="form-input" id="ann-expires" style="max-width:260px">
          <div class="form-hint">Leave blank for no expiry. The announcement is automatically deleted on this date.</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px">
          <button class="btn btn-secondary" onclick="navigate('announcements')">Cancel</button>
          <button class="btn btn-primary" onclick="submitAnnouncement()">Publish Announcement</button>
        </div>
      </div>
    </div>
  `);

  window._annTenants = tenants;
  updateTargetFields();
});

function updateTargetFields() {
  const target = document.getElementById('ann-target')?.value;
  const container = document.getElementById('ann-target-detail');
  if (!container) return;
  if (target === 'building') {
    container.innerHTML = `<div class="form-group"><label class="form-label required">Building</label>
      <select class="form-select" id="ann-building">
        <option value="728">728 W. Randolph</option>
        <option value="730">730 W. Randolph</option>
        <option value="732">732 W. Randolph</option>
      </select></div>`;
  } else if (target === 'tenant') {
    const tenants = window._annTenants || [];
    container.innerHTML = `<div class="form-group"><label class="form-label required">Tenant</label>
      <select class="form-select" id="ann-tenant">
        <option value="">— Select tenant —</option>
        ${tenants.map(t=>`<option value="${t.id}">${esc(t.name)} · ${t.building} W. Randolph</option>`).join('')}
      </select></div>`;
  } else {
    container.innerHTML = '';
  }
}

async function submitAnnouncement() {
  const title   = document.getElementById('ann-title')?.value.trim();
  const content = document.getElementById('ann-content')?.value.trim();
  const target  = document.getElementById('ann-target')?.value;
  const urgent  = document.getElementById('ann-urgent')?.checked;
  const pinned  = document.getElementById('ann-pinned')?.checked;

  if (!title || !content) { toast('Title and content are required', 'warning'); return; }

  const expires = document.getElementById('ann-expires')?.value;
  const body = { title, content, target_type: target, urgent, pinned, expires_at: expires || null };
  if (target === 'building') body.target_building = document.getElementById('ann-building')?.value;
  if (target === 'tenant') {
    body.target_tenant_id = document.getElementById('ann-tenant')?.value;
    if (!body.target_tenant_id) { toast('Please select a tenant', 'warning'); return; }
  }

  try {
    await apiFetch('POST', '/api/announcements', body);
    toast('Announcement published', 'success');
    navigate('announcements');
  } catch (e) { toast(e.message, 'error'); }
}

function showEditAnnModal(id) {
  apiFetch('GET', `/api/announcements/${id}`).then(ann => {
    showModal(`
      <div class="modal-header"><div class="modal-title">Edit Announcement</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="e-ann-title" value="${esc(ann.title)}"></div>
        <div class="form-group"><label class="form-label">Content</label><textarea class="form-textarea" id="e-ann-content" rows="5">${esc(ann.content)}</textarea></div>
        <div class="form-row">
          <label class="form-check"><input type="checkbox" id="e-ann-urgent" ${ann.urgent?'checked':''}> <span>Urgent</span></label>
          <label class="form-check"><input type="checkbox" id="e-ann-pinned" ${ann.pinned?'checked':''}> <span>Pinned</span></label>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label class="form-label">Auto-delete on (optional)</label>
          <input type="datetime-local" class="form-input" id="e-ann-expires" value="${ann.expires_at ? ann.expires_at.slice(0,16) : ''}" style="max-width:260px">
          <div class="form-hint">Clear this field to remove the expiry date.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveAnnEdit(${ann.id})">Save Changes</button>
      </div>`);
  }).catch(e => toast(e.message, 'error'));
}

async function saveAnnEdit(id) {
  const title   = document.getElementById('e-ann-title')?.value.trim();
  const content = document.getElementById('e-ann-content')?.value.trim();
  const urgent  = document.getElementById('e-ann-urgent')?.checked;
  const pinned  = document.getElementById('e-ann-pinned')?.checked;
  const expires = document.getElementById('e-ann-expires')?.value;
  try {
    await apiFetch('PATCH', `/api/announcements/${id}`, { title, content, urgent, pinned, expires_at: expires || null });
    closeModal(); toast('Announcement updated', 'success'); navigate('announcements');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement? This cannot be undone.')) return;
  try {
    await apiFetch('DELETE', `/api/announcements/${id}`);
    toast('Announcement deleted', 'success'); navigate('announcements');
  } catch (e) { toast(e.message, 'error'); }
}
