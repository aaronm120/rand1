/* ═══════════════════════════════════════════════════════
   SERVICE REQUESTS — list, new, detail
   ═══════════════════════════════════════════════════════ */

// ── List ──────────────────────────────────────────────────────────
route('requests', async () => {
  const u = state.user;
  setHeader('Service Requests', isPM(u) ? 'All buildings' : u.tenant_name || '');

  const [requests, categories, tenants] = await Promise.all([
    apiFetch('GET', '/api/requests'),
    apiFetch('GET', '/api/categories'),
    isPM(u) ? apiFetch('GET', '/api/tenants') : Promise.resolve([]),
  ]);

  // Filters (client-side for responsiveness)
  let filtered = [...requests];

  function render(list) {
    const tableRows = list.length ? list.map(r => `
      <tr onclick="navigate('request-detail',{id:${r.id}})" style="cursor:pointer">
        <td><strong>#${r.id}</strong></td>
        <td>${esc(r.category_name)}</td>
        ${isPM(u) ? `<td>${esc(r.tenant_name)}<br><small style="color:var(--gray-500)">${r.building} W. Randolph</small></td>` : ''}
        <td>${priorityBadge(r.priority)}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="col-nowrap">${fmtDate(r.created_at)}</td>
        <td class="col-nowrap">${fmtDate(r.updated_at)}</td>
      </tr>`).join('') :
      `<tr><td colspan="7" class="table-empty"><div class="empty-icon">📭</div>No requests found</td></tr>`;

    document.querySelector('#requests-table tbody').innerHTML = tableRows;
    document.getElementById('req-count').textContent = `${list.length} request${list.length !== 1 ? 's' : ''}`;
  }

  function applyFilters() {
    const q       = document.getElementById('f-search')?.value.toLowerCase() || '';
    const status  = document.getElementById('f-status')?.value || '';
    const prio    = document.getElementById('f-prio')?.value || '';
    const cat     = document.getElementById('f-cat')?.value || '';
    const building= document.getElementById('f-building')?.value || '';

    filtered = requests.filter(r =>
      (!q || r.category_name.toLowerCase().includes(q) || String(r.id).includes(q) || r.tenant_name?.toLowerCase().includes(q)) &&
      (!status   || r.status    === status) &&
      (!prio     || r.priority  === prio) &&
      (!cat      || String(r.category_id) === cat) &&
      (!building || r.building  === building)
    );
    render(filtered);
  }

  const tenantFilter = isPM(u) ? `
    <select class="form-select" id="f-building" onchange="document.dispatchEvent(new Event('filter-change'))">
      <option value="">All Buildings</option>
      <option value="728">728 W. Randolph</option>
      <option value="730">730 W. Randolph</option>
      <option value="732">732 W. Randolph</option>
    </select>` : '';

  setContent(`
    ${heroHtml('Service Requests', 'Submit and track maintenance requests', '🔧')}
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">All Requests</div>
          <div class="card-subtitle" id="req-count">Loading…</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigate('new-request')">+ New Request</button>
      </div>
      <div style="padding:14px 18px;border-bottom:1px solid var(--gray-100)">
        <div class="filter-bar">
          <input class="form-input" id="f-search" placeholder="🔍 Search…" oninput="document.dispatchEvent(new Event('filter-change'))">
          <select class="form-select" id="f-status" onchange="document.dispatchEvent(new Event('filter-change'))">
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_tenant">Pending Tenant</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select class="form-select" id="f-prio" onchange="document.dispatchEvent(new Event('filter-change'))">
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select class="form-select" id="f-cat" onchange="document.dispatchEvent(new Event('filter-change'))">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
          ${tenantFilter}
        </div>
      </div>
      <div class="table-wrap">
        <table id="requests-table">
          <thead><tr>
            <th>#</th><th>Category</th>
            ${isPM(u) ? '<th>Tenant / Building</th>' : ''}
            <th>Priority</th><th>Status</th><th>Created</th><th>Updated</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `);

  document.addEventListener('filter-change', applyFilters, { once: false });
  render(requests);

  // cleanup on navigation away
  const cleanup = () => document.removeEventListener('filter-change', applyFilters);
  document.getElementById('page-content').addEventListener('DOMNodeRemoved', cleanup, { once: true });
});

// ── New Request ────────────────────────────────────────────────────
route('new-request', async () => {
  const u = state.user;
  setHeader('New Service Request', '');

  const [categories, tenants] = await Promise.all([
    apiFetch('GET', '/api/categories'),
    isPM(u) ? apiFetch('GET', '/api/tenants') : Promise.resolve([]),
  ]);

  const tenantSelect = isPM(u) ? `
    <div class="form-group">
      <label class="form-label required">Tenant (creating on behalf of)</label>
      <select class="form-select" id="req-tenant">
        <option value="">— Select tenant —</option>
        ${tenants.map(t => `<option value="${t.id}">${esc(t.name)} · ${t.building} W. Randolph</option>`).join('')}
      </select>
    </div>` : '';

  setContent(`
    ${heroHtml('New Service Request', 'Submit a maintenance or facility request', '🔧')}
    <div class="card" style="max-width:680px">
      <div class="card-header"><div class="card-title">Request Details</div></div>
      <div class="card-body">
        ${tenantSelect}
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Category</label>
            <select class="form-select" id="req-cat">
              <option value="">— Select category —</option>
              ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label required">Priority</label>
            <select class="form-select" id="req-priority">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label required">Description</label>
          <textarea class="form-textarea" id="req-desc" placeholder="Describe the issue in detail — location, what's happening, when it started…" rows="5"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Attachments (photos, documents)</label>
          <input type="file" id="req-files" class="form-input" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx">
          <div class="form-hint">Up to 5 files · 10 MB each · Images and documents</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-secondary" onclick="navigate('requests')">Cancel</button>
          <button class="btn btn-primary" id="req-submit" onclick="submitRequest()">Submit Request</button>
        </div>
      </div>
    </div>
  `);
});

async function submitRequest() {
  const u = state.user;
  const cat     = document.getElementById('req-cat')?.value;
  const desc    = document.getElementById('req-desc')?.value.trim();
  const priority= document.getElementById('req-priority')?.value;
  const tenantEl= document.getElementById('req-tenant');
  const files   = document.getElementById('req-files')?.files;

  if (!cat) { toast('Please select a category', 'warning'); return; }
  if (!desc) { toast('Description is required', 'warning'); return; }
  if (isPM(u) && !tenantEl?.value) { toast('Please select a tenant', 'warning'); return; }

  const btn = document.getElementById('req-submit');
  btn.disabled = true; btn.textContent = 'Submitting…';

  try {
    const body = { category_id: cat, description: desc, priority };
    if (isPM(u)) body.tenant_id = tenantEl.value;

    let request;
    if (files && files.length) {
      const fd = new FormData();
      Object.entries(body).forEach(([k,v]) => fd.append(k, v));
      for (const f of files) fd.append('attachments', f);
      request = await apiFetch('POST', '/api/requests', fd, true);
    } else {
      request = await apiFetch('POST', '/api/requests', body);
    }

    toast('Request submitted successfully', 'success');
    navigate('request-detail', { id: request.id });
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.textContent = 'Submit Request';
  }
}

// ── Request Detail ─────────────────────────────────────────────────
route('request-detail', async ({ id }) => {
  if (!id) return navigate('requests');
  const u = state.user;
  setHeader('Loading request…', '');

  const req = await apiFetch('GET', `/api/requests/${id}`);
  setHeader(`Request #${req.id}`, `${req.category_name} · ${req.tenant_name}`);

  const statusOptions = ['open','in_progress','pending_tenant','resolved','closed'];
  const pmPanel = isPM(u) ? `
    <div class="card" style="margin-top:18px">
      <div class="card-header"><div class="card-title">PM Actions</div></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Update Status</label>
            <div style="display:flex;gap:8px">
              <select class="form-select" id="new-status">
                ${statusOptions.map(s => `<option value="${s}" ${s===req.status?'selected':''}>${s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}
              </select>
              <button class="btn btn-primary" onclick="updateStatus(${req.id})">Update</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <div style="display:flex;gap:8px">
              <select class="form-select" id="new-priority">
                ${['low','medium','high','urgent'].map(p=>`<option value="${p}" ${p===req.priority?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
              </select>
              <button class="btn btn-secondary" onclick="updatePriority(${req.id})">Update</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-header"><div class="card-title">🔒 Internal Notes (PM only)</div></div>
      <div class="card-body">
        <div id="notes-list">${renderNotes(req.notes || [])}</div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <textarea class="form-textarea" id="new-note" placeholder="Add internal note…" rows="2" style="min-height:64px"></textarea>
          <button class="btn btn-secondary" style="align-self:flex-end" onclick="addNote(${req.id})">Add Note</button>
        </div>
      </div>
    </div>` : '';

  // Attachments
  const attHtml = req.attachments?.length ? req.attachments.map(a => `
    <a href="/api/uploads/${esc(a.stored_name)}?token=${state.token}" target="_blank" style="display:flex;align-items:center;gap:6px;font-size:.85rem;padding:4px 0">
      📎 ${esc(a.original_name)}</a>`).join('') :
    '<span style="font-size:.85rem;color:var(--gray-400)">No attachments</span>';

  // Status history
  const histHtml = (req.history || []).map(h => `
    <div class="history-item">
      <div class="history-dot ${h.to_status}"></div>
      <div>
        <div style="font-size:.875rem;font-weight:600;color:var(--gray-800)">${h.to_status.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
        <div class="history-meta">${esc(h.changed_by_name)} · ${fmt(h.created_at)}${h.note ? ` · "${esc(h.note)}"` : ''}</div>
      </div>
    </div>`).join('') || '<span style="font-size:.85rem;color:var(--gray-400)">No history</span>';

  setContent(`
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="navigate('requests')">← Back</button>
      ${statusBadge(req.status)} ${priorityBadge(req.priority)}
      ${buildingTag(req.building)}
    </div>
    <div class="grid grid-2">
      <div>
        <div class="card">
          <div class="card-header"><div class="card-title">Request #${req.id}</div></div>
          <div class="card-body">
            <div class="detail-grid" style="margin-bottom:14px">
              <div><div class="detail-field-label">Category</div><div class="detail-field-value">${esc(req.category_name)}</div></div>
              <div><div class="detail-field-label">Priority</div><div class="detail-field-value">${priorityBadge(req.priority)}</div></div>
              <div><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(req.status)}</div></div>
              <div><div class="detail-field-label">Building</div><div class="detail-field-value">${buildingTag(req.building)}</div></div>
              <div><div class="detail-field-label">Submitted by</div><div class="detail-field-value">${esc(req.submitted_by_name)}</div></div>
              <div><div class="detail-field-label">Date</div><div class="detail-field-value">${fmt(req.created_at)}</div></div>
              ${req.created_by_pm_name ? `<div><div class="detail-field-label">Created by PM</div><div class="detail-field-value">${esc(req.created_by_pm_name)}</div></div>` : ''}
            </div>
            <div class="detail-section-title">Description</div>
            <div style="font-size:.9rem;color:var(--gray-800);white-space:pre-wrap;background:var(--gray-50);padding:12px;border-radius:var(--radius)">${esc(req.description)}</div>
            <div class="detail-section-title" style="margin-top:16px">Attachments</div>
            <div>${attHtml}</div>
          </div>
        </div>
        ${pmPanel}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Status History</div></div>
        <div class="card-body" id="history-list">${histHtml}</div>
      </div>
    </div>
  `);
});

function renderNotes(notes) {
  if (!notes.length) return '<div style="font-size:.85rem;color:var(--gray-400)">No internal notes yet</div>';
  return notes.map(n => `
    <div class="note-item">
      <div style="display:flex;justify-content:space-between">
        <span class="note-author">${esc(n.author_name)}</span>
        <span class="note-time">${fmt(n.created_at)}</span>
      </div>
      <div class="note-body">${esc(n.content)}</div>
    </div>`).join('');
}

async function updateStatus(reqId) {
  const status = document.getElementById('new-status')?.value;
  try {
    await apiFetch('PATCH', `/api/requests/${reqId}/status`, { status });
    toast('Status updated', 'success');
    navigate('request-detail', { id: reqId });
  } catch (e) { toast(e.message, 'error'); }
}

async function updatePriority(reqId) {
  const priority = document.getElementById('new-priority')?.value;
  try {
    await apiFetch('PATCH', `/api/requests/${reqId}/priority`, { priority });
    toast('Priority updated', 'success');
    navigate('request-detail', { id: reqId });
  } catch (e) { toast(e.message, 'error'); }
}

async function addNote(reqId) {
  const content = document.getElementById('new-note')?.value.trim();
  if (!content) { toast('Note cannot be empty', 'warning'); return; }
  try {
    const note = await apiFetch('POST', `/api/requests/${reqId}/notes`, { content });
    document.getElementById('new-note').value = '';
    const list = document.getElementById('notes-list');
    if (list) {
      const div = document.createElement('div');
      div.className = 'note-item';
      div.innerHTML = `<div style="display:flex;justify-content:space-between"><span class="note-author">${esc(note.author_name)}</span><span class="note-time">${fmt(note.created_at)}</span></div><div class="note-body">${esc(note.content)}</div>`;
      const empty = list.querySelector('[style*="gray"]');
      if (empty) empty.remove();
      list.appendChild(div);
    }
    toast('Note added', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
