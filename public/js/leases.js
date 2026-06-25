/* ═══════════════════════════════════════════════════════
   LEASE TRACKING — PM Admin only
   ═══════════════════════════════════════════════════════ */

route('leases', async () => {
  if (!isPMAdmin(state.user)) { navigate('dashboard'); return; }
  setHeader('Lease Tracking', 'Tenant lease records');

  let leases, tenants;
  try {
    [leases, tenants] = await Promise.all([
      apiFetch('GET', '/api/leases'),
      apiFetch('GET', '/api/tenants'),
    ]);
  } catch (e) {
    setContent(`<div class="card"><div class="card-body"><p style="color:var(--danger)">Failed to load lease data. Please refresh the page.</p></div></div>`);
    return;
  }

  window._leaseTenants = tenants;

  function leaseRow(l) {
    const expDate  = l.lease_end ? new Date(l.lease_end) : null;
    const daysLeft = expDate ? Math.ceil((expDate - new Date()) / 86400000) : null;
    let expClass = '';
    let expLabel = '';
    if (daysLeft !== null) {
      if (daysLeft < 0) { expClass = 'badge-danger'; expLabel = 'Expired'; }
      else if (daysLeft <= 90) { expClass = 'badge-warning'; expLabel = `${daysLeft}d left`; }
      else { expClass = 'badge-success'; expLabel = `${daysLeft}d left`; }
    }

    return `<tr onclick="navigate('lease-detail',{id:${l.id}})" style="cursor:pointer">
      <td><strong>${esc(l.tenant_name)}</strong></td>
      <td>${buildingTag(l.tenant_building)}</td>
      <td>${l.suite_number ? esc(l.suite_number) : '—'}</td>
      <td>${l.lease_start ? fmtDate(l.lease_start) : '—'}</td>
      <td>${l.lease_end ? fmtDate(l.lease_end) : '—'}</td>
      <td>${expLabel ? `<span class="badge ${expClass}">${expLabel}</span>` : '—'}</td>
      <td>${l.monthly_rent ? '$' + Number(l.monthly_rent).toLocaleString() : '—'}</td>
      <td>${l.sq_footage ? Number(l.sq_footage).toLocaleString() + ' sqft' : '—'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();showLeaseModal(${l.id})">Edit</button></td>
    </tr>`;
  }

  const now = new Date();
  const activeLeases = leases.filter(l => !l.lease_end || new Date(l.lease_end) >= now);
  const formerLeases = leases.filter(l => l.lease_end && new Date(l.lease_end) < now);

  const expiring = activeLeases.filter(l => {
    if (!l.lease_end) return false;
    const d = Math.ceil((new Date(l.lease_end) - now) / 86400000);
    return d >= 0 && d <= 90;
  });

  const leaseTable = (rows) => `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Tenant</th><th>Building</th><th>Suite</th>
          <th>Lease Start</th><th>Lease End</th><th>Status</th>
          <th>Monthly Rent</th><th>Sq Ft</th><th></th>
        </tr></thead>
        <tbody>${rows.map(leaseRow).join('')}</tbody>
      </table>
    </div>`;

  setContent(`
    ${heroHtml('Lease Tracking', 'Track lease terms, expiration dates, and tenant details', '📄')}
    ${expiring.length ? `
      <div class="alert alert-warning" style="margin-bottom:18px">
        <span style="font-size:1.2rem">⏰</span>
        <div><strong>${expiring.length} lease${expiring.length!==1?'s':''} expiring within 90 days</strong><div style="font-size:.85rem;margin-top:3px">${expiring.map(l=>`${esc(l.tenant_name)} (${fmtDate(l.lease_end)})`).join(', ')}</div></div>
      </div>` : ''}
    <div class="card">
      <div class="card-header">
        <div class="card-title">${activeLeases.length} Active Lease Record${activeLeases.length!==1?'s':''}</div>
        <button class="btn btn-primary btn-sm" onclick="showLeaseModal()">+ Add Lease Record</button>
      </div>
      ${activeLeases.length ? leaseTable(activeLeases) :
        `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No active lease records</div><div class="empty-desc">Add lease records for your tenants.</div></div>`}
    </div>
    ${formerLeases.length ? `
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <div class="card-title" style="color:var(--gray-500)">Former Leases</div>
        <span class="badge badge-gray">${formerLeases.length}</span>
      </div>
      ${leaseTable(formerLeases)}
    </div>` : ''}
  `);
});

route('lease-detail', async ({ id }) => {
  if (!isPMAdmin(state.user)) { navigate('dashboard'); return; }
  if (!id) return navigate('leases');

  let lease, attachments;
  try {
    [lease, attachments] = await Promise.all([
      apiFetch('GET', `/api/leases/${id}`),
      apiFetch('GET', `/api/leases/${id}/attachments`),
    ]);
  } catch (e) {
    setContent(`<div class="card"><div class="card-body"><p style="color:var(--danger)">Failed to load lease. Please refresh.</p></div></div>`);
    return;
  }
  setHeader(lease.tenant_name, 'Lease detail');

  const expDate = lease.lease_end ? new Date(lease.lease_end) : null;
  const daysLeft = expDate ? Math.ceil((expDate - new Date()) / 86400000) : null;
  let expBadge = '';
  if (daysLeft !== null) {
    if (daysLeft < 0) expBadge = `<span class="badge badge-danger">Expired</span>`;
    else if (daysLeft <= 90) expBadge = `<span class="badge badge-warning">${daysLeft} days remaining</span>`;
    else expBadge = `<span class="badge badge-success">${daysLeft} days remaining</span>`;
  }

  function attachmentList(atts) {
    if (!atts.length) return `<p style="font-size:.875rem;color:var(--gray-500);margin:0">No documents attached.</p>`;
    return atts.map(a => `
      <div class="lease-attachment-row" id="la-${a.id}">
        <span class="lease-attachment-icon">📄</span>
        <a href="/api/uploads/${esc(a.stored_name)}?token=${state.token}" target="_blank" class="lease-attachment-name">${esc(a.original_name)}</a>
        <span class="lease-attachment-meta">${fmt(a.created_at)}</span>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:2px 8px" onclick="deleteLeaseAttachment(${id},${a.id})">Remove</button>
      </div>`).join('');
  }

  setContent(`
    <button class="btn btn-ghost btn-sm" onclick="navigate('leases')" style="margin-bottom:14px">← Back to Leases</button>
    <div class="card" style="max-width:720px">
      <div class="card-header">
        <div>
          <div class="card-title">${esc(lease.tenant_name)}</div>
          <div class="card-subtitle">${buildingTag(lease.tenant_building)} ${lease.suite_number ? `Suite ${esc(lease.suite_number)}` : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${expBadge}
          <button class="btn btn-secondary btn-sm" onclick="showLeaseModal(${lease.id})">Edit</button>
        </div>
      </div>
      <div class="card-body">
        <div class="detail-grid">
          <div><div class="detail-field-label">Lease Start</div><div class="detail-field-value">${lease.lease_start ? fmtDate(lease.lease_start) : '—'}</div></div>
          <div><div class="detail-field-label">Lease End</div><div class="detail-field-value">${lease.lease_end ? fmtDate(lease.lease_end) : '—'}</div></div>
          <div><div class="detail-field-label">Monthly Rent</div><div class="detail-field-value">${lease.monthly_rent ? '$' + Number(lease.monthly_rent).toLocaleString() : '—'}</div></div>
          <div><div class="detail-field-label">Square Footage</div><div class="detail-field-value">${lease.sq_footage ? Number(lease.sq_footage).toLocaleString() + ' sqft' : '—'}</div></div>
          <div><div class="detail-field-label">Renewal Option</div><div class="detail-field-value">${lease.renewal_option || '—'}</div></div>
          <div><div class="detail-field-label">Security Deposit</div><div class="detail-field-value">${lease.security_deposit ? '$' + Number(lease.security_deposit).toLocaleString() : '—'}</div></div>
          <div><div class="detail-field-label">Lease Type</div><div class="detail-field-value">${lease.lease_type || '—'}</div></div>
          <div><div class="detail-field-label">Last Updated</div><div class="detail-field-value">${fmt(lease.updated_at)}</div></div>
        </div>
        ${lease.notes ? `<div class="detail-section-title" style="margin-top:16px">Notes</div><div style="font-size:.9rem;white-space:pre-wrap;color:var(--gray-700)">${esc(lease.notes)}</div>` : ''}
      </div>
    </div>

    <div class="card" style="max-width:720px;margin-top:16px">
      <div class="card-header">
        <div class="card-title">Documents</div>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
          Upload PDF
          <input type="file" accept=".pdf,application/pdf" style="display:none" onchange="uploadLeaseAttachment(${id}, this)">
        </label>
      </div>
      <div class="card-body" id="lease-attachments-list">
        ${attachmentList(attachments)}
      </div>
    </div>
  `);
});

async function uploadLeaseAttachment(leaseId, input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const token = state.token;
    const res = await fetch(`/api/leases/${leaseId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    toast('Document uploaded', 'success');
    const atts = await apiFetch('GET', `/api/leases/${leaseId}/attachments`);
    const list = document.getElementById('lease-attachments-list');
    if (list) list.innerHTML = atts.length
      ? atts.map(a => `
          <div class="lease-attachment-row" id="la-${a.id}">
            <span class="lease-attachment-icon">📄</span>
            <a href="/api/uploads/${esc(a.stored_name)}?token=${state.token}" target="_blank" class="lease-attachment-name">${esc(a.original_name)}</a>
            <span class="lease-attachment-meta">${fmt(a.created_at)}</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:2px 8px" onclick="deleteLeaseAttachment(${leaseId},${a.id})">Remove</button>
          </div>`).join('')
      : `<p style="font-size:.875rem;color:var(--gray-500);margin:0">No documents attached.</p>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteLeaseAttachment(leaseId, attachmentId) {
  if (!confirm('Remove this document? This cannot be undone.')) return;
  try {
    await apiFetch('DELETE', `/api/leases/${leaseId}/attachments/${attachmentId}`);
    const row = document.getElementById(`la-${attachmentId}`);
    if (row) {
      row.remove();
      const list = document.getElementById('lease-attachments-list');
      if (list && !list.querySelector('.lease-attachment-row'))
        list.innerHTML = `<p style="font-size:.875rem;color:var(--gray-500);margin:0">No documents attached.</p>`;
    }
    toast('Document removed', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function showLeaseModal(id) {
  const tenants = window._leaseTenants || [];
  const editing = !!id;

  const loadAndShow = async () => {
    let l = {};
    if (editing) {
      l = await apiFetch('GET', `/api/leases/${id}`).catch(()=>({}));
    }
    const tenantOpts = tenants.map(t =>
      `<option value="${t.id}" ${String(t.id)===String(l.tenant_id)?'selected':''}>${esc(t.name)} · ${t.building}</option>`
    ).join('');

    showModal(`
      <div class="modal-header"><div class="modal-title">${editing ? 'Edit' : 'Add'} Lease Record</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        ${!editing ? `<div class="form-group"><label class="form-label required">Tenant</label>
          <select class="form-select" id="ls-tenant"><option value="">— Select —</option>${tenantOpts}</select></div>` : ''}
        <div class="form-row">
          <div class="form-group"><label class="form-label">Suite / Unit</label><input class="form-input" id="ls-suite" value="${esc(l.suite_number||'')}"></div>
          <div class="form-group"><label class="form-label">Sq Footage</label><input type="number" class="form-input" id="ls-sqft" value="${l.sq_footage||''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Lease Start</label><input type="date" class="form-input" id="ls-start" value="${l.lease_start?.slice(0,10)||''}"></div>
          <div class="form-group"><label class="form-label">Lease End</label><input type="date" class="form-input" id="ls-end" value="${l.lease_end?.slice(0,10)||''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Monthly Rent ($)</label><input type="number" class="form-input" id="ls-rent" value="${l.monthly_rent||''}"></div>
          <div class="form-group"><label class="form-label">Security Deposit ($)</label><input type="number" class="form-input" id="ls-deposit" value="${l.security_deposit||''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Lease Type</label>
            <select class="form-select" id="ls-type">
              <option value="">— Select —</option>
              ${['Gross','Net','NNN','Modified Gross','Full Service'].map(t=>`<option ${l.lease_type===t?'selected':''}>${t}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Renewal Option</label><input class="form-input" id="ls-renewal" value="${esc(l.renewal_option||'')}" placeholder="e.g. 2x 5-year options"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="ls-notes" rows="3">${esc(l.notes||'')}</textarea></div>
      </div>
      <div class="modal-footer">
        ${editing ? `<button class="btn btn-danger" onclick="deleteLease(${id})">Delete</button>` : ''}
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveLease(${id||'null'})">${editing ? 'Save Changes' : 'Add Record'}</button>
      </div>`);
  };

  loadAndShow();
}

async function saveLease(id) {
  const body = {
    tenant_id:       id ? undefined : document.getElementById('ls-tenant')?.value,
    suite_number:    document.getElementById('ls-suite')?.value || null,
    sq_footage:      document.getElementById('ls-sqft')?.value ? parseFloat(document.getElementById('ls-sqft').value) : null,
    lease_start:     document.getElementById('ls-start')?.value || null,
    lease_end:       document.getElementById('ls-end')?.value || null,
    monthly_rent:    document.getElementById('ls-rent')?.value ? parseFloat(document.getElementById('ls-rent').value) : null,
    security_deposit:document.getElementById('ls-deposit')?.value ? parseFloat(document.getElementById('ls-deposit').value) : null,
    lease_type:      document.getElementById('ls-type')?.value || null,
    renewal_option:  document.getElementById('ls-renewal')?.value || null,
    notes:           document.getElementById('ls-notes')?.value || null,
  };
  if (!id && !body.tenant_id) { toast('Please select a tenant', 'warning'); return; }
  if (body.lease_start && body.lease_end && body.lease_start >= body.lease_end) {
    toast('Lease end date must be after start date', 'warning'); return;
  }
  try {
    if (id) await apiFetch('PATCH', `/api/leases/${id}`, body);
    else await apiFetch('POST', '/api/leases', body);
    closeModal(); toast(id ? 'Lease updated' : 'Lease record added', 'success');
    navigate('leases');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteLease(id) {
  if (!confirm('Delete this lease record? This cannot be undone.')) return;
  try {
    await apiFetch('DELETE', `/api/leases/${id}`);
    closeModal(); toast('Lease record deleted', 'success'); navigate('leases');
  } catch (e) { toast(e.message, 'error'); }
}
