/* ═══════════════════════════════════════════════════════
   ADMIN PANEL — PM Admin only
   Tabs: Users · Tenants · Categories · Amenities · Settings
   ═══════════════════════════════════════════════════════ */

route('admin', async () => {
  if (!isPMAdmin(state.user)) { navigate('dashboard'); return; }
  setHeader('Admin Panel', 'System configuration and user management');

  const tabs = ['users', 'tenants', 'categories', 'amenities', 'settings'];
  const tabLabels = { users: '👥 Users', tenants: '🏢 Tenants', categories: '🏷 Categories', amenities: '📅 Amenities', settings: '⚙️ Settings' };

  setContent(`
    ${heroHtml('Admin Panel', 'Manage users, tenants, and system configuration', '⚙️')}
    <div class="tab-bar" id="admin-tabs">
      ${tabs.map(t => `<button class="tab-btn ${t==='users'?'active':''}" id="tab-${t}" onclick="showAdminTab('${t}')">${tabLabels[t]}</button>`).join('')}
    </div>
    <div id="admin-tab-content"></div>
  `);

  showAdminTab('users');
});

async function showAdminTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  const el = document.getElementById('admin-tab-content');
  el.innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;

  switch (tab) {
    case 'users':      await renderUsersTab(el); break;
    case 'tenants':    await renderTenantsTab(el); break;
    case 'categories': await renderCategoriesTab(el); break;
    case 'amenities':  await renderAmenitiesTab(el); break;
    case 'settings':   await renderSettingsTab(el); break;
  }
}

// ── USERS TAB ──────────────────────────────────────────────────────
async function renderUsersTab(el) {
  const [users, tenants] = await Promise.all([
    apiFetch('GET', '/api/auth/users'),
    apiFetch('GET', '/api/tenants'),
  ]);
  window._adminTenants = tenants;

  function userRow(u) {
    return `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.tenant_name ? `${esc(u.tenant_name)} · ${buildingTag(u.tenant_building)}` : '—'}</td>
      <td>${u.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
      <td>${fmt(u.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="showUserModal(${u.id})">Edit</button></td>
    </tr>`;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${users.length} Users</div>
        <button class="btn btn-primary btn-sm" onclick="showUserModal()">+ Add User</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tenant</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>${users.map(userRow).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function showUserModal(id) {
  const tenants = window._adminTenants || [];
  const editing = !!id;

  const loadAndShow = async () => {
    let u = {};
    if (editing) u = await apiFetch('GET', `/api/auth/users/${id}`).catch(()=>({}));

    const tenantOpts = tenants.map(t =>
      `<option value="${t.id}" ${String(t.id)===String(u.tenant_id)?'selected':''}>${esc(t.name)} · ${t.building}</option>`
    ).join('');
    const roleOpts = ['pm_admin','pm_user','tenant_admin','tenant_user'].map(r =>
      `<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`
    ).join('');

    showModal(`
      <div class="modal-header"><div class="modal-title">${editing?'Edit':'Add'} User</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Full Name</label><input class="form-input" id="u-name" value="${esc(u.name||'')}"></div>
          <div class="form-group"><label class="form-label required">Email</label><input class="form-input" id="u-email" type="email" value="${esc(u.email||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Role</label>
            <select class="form-select" id="u-role" onchange="toggleTenantField()">${roleOpts}</select></div>
          <div class="form-group" id="u-tenant-group"><label class="form-label">Tenant</label>
            <select class="form-select" id="u-tenant"><option value="">— PM / No tenant —</option>${tenantOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="u-title" value="${esc(u.title||'')}"></div>
          <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="u-phone" value="${esc(u.phone||'')}"></div>
        </div>
        ${!editing ? `<div class="form-group"><label class="form-label required">Password</label><input class="form-input" id="u-password" type="password" placeholder="Min 8 characters"></div>` : ''}
        ${editing ? `<div class="form-group"><label class="form-label">New Password <span style="font-weight:400;font-size:.8rem">(leave blank to keep current)</span></label><input class="form-input" id="u-password" type="password" placeholder="Leave blank to keep current"></div>` : ''}
        ${editing ? `<div class="form-group"><label class="form-check"><input type="checkbox" id="u-active" ${u.active?'checked':''}> <span>Account Active</span></label></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser(${id||'null'})">${editing?'Save':'Create User'}</button>
      </div>`);
    toggleTenantField();
  };
  loadAndShow();
}

function toggleTenantField() {
  const role = document.getElementById('u-role')?.value || '';
  const group = document.getElementById('u-tenant-group');
  if (group) group.style.display = role.startsWith('pm_') ? 'none' : '';
}

async function saveUser(id) {
  const body = {
    name:      document.getElementById('u-name')?.value.trim(),
    email:     document.getElementById('u-email')?.value.trim(),
    role:      document.getElementById('u-role')?.value,
    tenant_id: document.getElementById('u-tenant')?.value || null,
    title:     document.getElementById('u-title')?.value || null,
    phone:     document.getElementById('u-phone')?.value || null,
    password:  document.getElementById('u-password')?.value || undefined,
    active:    id ? (document.getElementById('u-active')?.checked ? 1 : 0) : 1,
  };
  if (!body.name || !body.email) { toast('Name and email are required', 'warning'); return; }
  if (!id && !body.password) { toast('Password is required for new users', 'warning'); return; }
  try {
    if (id) await apiFetch('PUT', `/api/auth/users/${id}`, body);
    else await apiFetch('POST', '/api/auth/users', body);
    closeModal(); toast(id ? 'User updated' : 'User created', 'success');
    showAdminTab('users');
  } catch (e) { toast(e.message, 'error'); }
}

// ── TENANTS TAB ────────────────────────────────────────────────────
async function renderTenantsTab(el) {
  const tenants = await apiFetch('GET', '/api/tenants');

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${tenants.length} Tenants</div>
        <button class="btn btn-primary btn-sm" onclick="showTenantModal()">+ Add Tenant</button>
      </div>
      ${tenants.map(t => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--primary-light);color:var(--primary)">🏢</div>
          <div class="list-item-body">
            <div class="list-item-title">${esc(t.name)}</div>
            <div class="list-item-meta">${buildingTag(t.building)} ${t.suite ? `· Suite ${esc(t.suite)}` : ''} · ${t.user_count||0} users</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="showTenantContactsModal(${t.id})">Contacts</button>
            <button class="btn btn-ghost btn-sm" onclick="showTenantModal(${t.id})">Edit</button>
          </div>
        </div>`).join('') || `<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">No tenants</div></div>`}
    </div>`;
}

function showTenantModal(id) {
  const editing = !!id;
  const loadAndShow = async () => {
    let t = {};
    if (editing) t = await apiFetch('GET', `/api/tenants/${id}`).catch(()=>({}));

    showModal(`
      <div class="modal-header"><div class="modal-title">${editing?'Edit':'Add'} Tenant</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label required">Company Name</label><input class="form-input" id="t-name" value="${esc(t.name||'')}"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Building</label>
            <select class="form-select" id="t-building">
              ${['728','730','732'].map(b=>`<option value="${b}" ${t.building===b?'selected':''}>${b} W. Randolph</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Suite</label><input class="form-input" id="t-suite" value="${esc(t.suite||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="t-phone" value="${esc(t.phone||'')}"></div>
          <div class="form-group"><label class="form-label">Industry</label><input class="form-input" id="t-industry" value="${esc(t.industry||'')}"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveTenant(${id||'null'})">${editing?'Save':'Add Tenant'}</button>
      </div>`);
  };
  loadAndShow();
}

async function saveTenant(id) {
  const body = {
    name:     document.getElementById('t-name')?.value.trim(),
    building: document.getElementById('t-building')?.value,
    suite:    document.getElementById('t-suite')?.value || null,
    phone:    document.getElementById('t-phone')?.value || null,
    industry: document.getElementById('t-industry')?.value || null,
  };
  if (!body.name) { toast('Company name is required', 'warning'); return; }
  try {
    if (id) await apiFetch('PATCH', `/api/tenants/${id}`, body);
    else await apiFetch('POST', '/api/tenants', body);
    closeModal(); toast(id ? 'Tenant updated' : 'Tenant added', 'success');
    showAdminTab('tenants');
  } catch (e) { toast(e.message, 'error'); }
}

function showTenantContactsModal(tenantId) {
  const loadAndShow = async () => {
    const tenant = await apiFetch('GET', `/api/tenants/${tenantId}`).catch(()=>({}));
    const contacts = tenant.contacts || [];

    const renderContacts = (cs) => cs.map(c => `
      <div class="list-item" id="contact-${c.id}">
        <div class="list-item-body">
          <div class="list-item-title">${esc(c.name)} ${c.role_label?`<span class="badge badge-gray">${esc(c.role_label)}</span>`:''}</div>
          <div class="list-item-meta">${[c.email,c.phone].filter(Boolean).map(esc).join(' · ')}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteContact(${c.id},${tenantId})">Remove</button>
      </div>`).join('');

    showModal(`
      <div class="modal-header"><div class="modal-title">Named Contacts · ${esc(tenant.name)}</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div id="contacts-list">${contacts.length ? renderContacts(contacts) : '<div style="font-size:.875rem;color:var(--gray-400);margin-bottom:12px">No contacts yet</div>'}</div>
        <div style="border-top:1px solid var(--gray-200);padding-top:14px;margin-top:12px">
          <div style="font-weight:600;margin-bottom:10px;font-size:.9rem">Add Contact</div>
          <div class="form-row"><div class="form-group"><label class="form-label required">Name</label><input class="form-input" id="nc-name"></div>
            <div class="form-group"><label class="form-label">Role / Label</label><input class="form-input" id="nc-role" placeholder="e.g. Billing, Emergency"></div></div>
          <div class="form-row"><div class="form-group"><label class="form-label">Email</label><input class="form-input" id="nc-email" type="email"></div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="nc-phone"></div></div>
          <button class="btn btn-secondary btn-sm" onclick="addContact(${tenantId})">+ Add Contact</button>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Done</button></div>`);
  };
  loadAndShow();
}

async function addContact(tenantId) {
  const body = {
    name:       document.getElementById('nc-name')?.value.trim(),
    role_label: document.getElementById('nc-role')?.value || null,
    email:      document.getElementById('nc-email')?.value || null,
    phone:      document.getElementById('nc-phone')?.value || null,
  };
  if (!body.name) { toast('Contact name is required', 'warning'); return; }
  try {
    const c = await apiFetch('POST', `/api/tenants/${tenantId}/contacts`, body);
    document.getElementById('contacts-list').insertAdjacentHTML('beforeend', `
      <div class="list-item" id="contact-${c.id}">
        <div class="list-item-body">
          <div class="list-item-title">${esc(c.name)} ${c.role_label?`<span class="badge badge-gray">${esc(c.role_label)}</span>`:''}</div>
          <div class="list-item-meta">${[c.email,c.phone].filter(Boolean).map(esc).join(' · ')}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteContact(${c.id},${tenantId})">Remove</button>
      </div>`);
    ['nc-name','nc-role','nc-email','nc-phone'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteContact(id, tenantId) {
  if (!confirm('Remove this contact?')) return;
  try {
    await apiFetch('DELETE', `/api/tenants/${tenantId}/contacts/${id}`);
    document.getElementById('contact-' + id)?.remove();
  } catch (e) { toast(e.message, 'error'); }
}

// ── CATEGORIES TAB ─────────────────────────────────────────────────
async function renderCategoriesTab(el) {
  const cats = await apiFetch('GET', '/api/categories');

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Request Categories</div>
        <button class="btn btn-primary btn-sm" onclick="showCategoryModal()">+ Add Category</button>
      </div>
      ${cats.map(c => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--info-bg);font-size:1.2rem">${c.icon||'🏷'}</div>
          <div class="list-item-body">
            <div class="list-item-title">${esc(c.name)}</div>
            ${c.description?`<div class="list-item-meta">${esc(c.description)}</div>`:''}
          </div>
          <div style="display:flex;gap:6px">
            <span class="badge ${c.active?'badge-success':'badge-gray'}">${c.active?'Active':'Inactive'}</span>
            <button class="btn btn-ghost btn-sm" onclick="showCategoryModal(${c.id})">Edit</button>
          </div>
        </div>`).join('') || `<div class="empty-state"><div class="empty-icon">🏷</div><div class="empty-title">No categories</div></div>`}
    </div>`;
}

function showCategoryModal(id) {
  const editing = !!id;
  const loadAndShow = async () => {
    let c = {};
    if (editing) c = await apiFetch('GET', `/api/categories/${id}`).catch(()=>({}));

    showModal(`
      <div class="modal-header"><div class="modal-title">${editing?'Edit':'Add'} Category</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input class="form-input" id="cat-icon" value="${esc(c.icon||'🏷')}" style="font-size:1.2rem"></div>
          <div class="form-group"><label class="form-label required">Name</label><input class="form-input" id="cat-name" value="${esc(c.name||'')}"></div>
        </div>
        <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="cat-desc" value="${esc(c.description||'')}"></div>
        ${editing ? `<div class="form-group"><label class="form-check"><input type="checkbox" id="cat-active" ${c.active?'checked':''}> <span>Active</span></label></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveCategory(${id||'null'})">${editing?'Save':'Add'}</button>
      </div>`);
  };
  loadAndShow();
}

async function saveCategory(id) {
  const body = {
    name:        document.getElementById('cat-name')?.value.trim(),
    icon:        document.getElementById('cat-icon')?.value || '🏷',
    description: document.getElementById('cat-desc')?.value || null,
    active:      id ? (document.getElementById('cat-active')?.checked ? 1 : 0) : 1,
  };
  if (!body.name) { toast('Category name is required', 'warning'); return; }
  try {
    if (id) await apiFetch('PATCH', `/api/categories/${id}`, body);
    else await apiFetch('POST', '/api/categories', body);
    closeModal(); toast('Category saved', 'success'); showAdminTab('categories');
  } catch (e) { toast(e.message, 'error'); }
}

// ── AMENITIES TAB ─────────────────────────────────────────────────
async function renderAmenitiesTab(el) {
  const amenities = await apiFetch('GET', '/api/amenities');

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Amenities</div>
        <button class="btn btn-primary btn-sm" onclick="showAmenityModal()">+ Add Amenity</button>
      </div>
      ${amenities.map(a => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--warning-bg)">🏛️</div>
          <div class="list-item-body">
            <div class="list-item-title">${esc(a.name)} <span class="badge badge-gray">Cap: ${a.capacity}</span></div>
            ${a.location?`<div class="list-item-meta">${esc(a.location)}</div>`:''}
            ${a.resources?.length?`<div class="list-item-meta">${a.resources.length} resource${a.resources.length!==1?'s':''} available</div>`:''}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="showAmenityResourcesModal(${a.id})">Resources</button>
            <button class="btn btn-ghost btn-sm" onclick="showAmenityModal(${a.id})">Edit</button>
          </div>
        </div>`).join('') || `<div class="empty-state"><div class="empty-icon">🏛️</div><div class="empty-title">No amenities configured</div></div>`}
    </div>`;
}

function showAmenityModal(id) {
  const editing = !!id;
  const loadAndShow = async () => {
    let a = {};
    if (editing) a = await apiFetch('GET', `/api/amenities/${id}`).catch(()=>({}));

    showModal(`
      <div class="modal-header"><div class="modal-title">${editing?'Edit':'Add'} Amenity</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label required">Name</label><input class="form-input" id="am-name" value="${esc(a.name||'')}" placeholder="e.g. Rooftop Deck"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="am-loc" value="${esc(a.location||'')}" placeholder="e.g. Floor 12"></div>
          <div class="form-group"><label class="form-label required">Capacity</label><input type="number" class="form-input" id="am-cap" value="${a.capacity||'50'}" min="1"></div>
        </div>
        <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="am-desc" rows="2">${esc(a.description||'')}</textarea></div>
        ${editing ? `<div class="form-group"><label class="form-check"><input type="checkbox" id="am-active" ${a.active!==0?'checked':''}> <span>Active</span></label></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveAmenity(${id||'null'})">${editing?'Save':'Add Amenity'}</button>
      </div>`);
  };
  loadAndShow();
}

async function saveAmenity(id) {
  const body = {
    name:        document.getElementById('am-name')?.value.trim(),
    location:    document.getElementById('am-loc')?.value || null,
    capacity:    parseInt(document.getElementById('am-cap')?.value)||50,
    description: document.getElementById('am-desc')?.value || null,
    active:      id ? (document.getElementById('am-active')?.checked?1:0) : 1,
  };
  if (!body.name) { toast('Name is required', 'warning'); return; }
  try {
    if (id) await apiFetch('PATCH', `/api/amenities/${id}`, body);
    else await apiFetch('POST', '/api/amenities', body);
    closeModal(); toast('Amenity saved', 'success'); showAdminTab('amenities');
  } catch (e) { toast(e.message, 'error'); }
}

function showAmenityResourcesModal(amenityId) {
  const loadAndShow = async () => {
    const amenity = await apiFetch('GET', `/api/amenities/${amenityId}`).catch(()=>({}));
    const resources = amenity.resources || [];

    const renderResources = (rs) => rs.map(r => `
      <div class="resource-item" id="res-${r.id}">
        <div><strong>${esc(r.name)}</strong> <span class="badge badge-gray">Max: ${r.quantity}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteResource(${r.id},${amenityId})">Remove</button>
      </div>`).join('');

    showModal(`
      <div class="modal-header"><div class="modal-title">Add-on Resources · ${esc(amenity.name)}</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div id="resources-list">${resources.length ? renderResources(resources) : '<div style="font-size:.875rem;color:var(--gray-400);margin-bottom:12px">No resources yet</div>'}</div>
        <div style="border-top:1px solid var(--gray-200);padding-top:14px;margin-top:12px">
          <div style="font-weight:600;margin-bottom:10px;font-size:.9rem">Add Resource</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label required">Name</label><input class="form-input" id="nr-name" placeholder="e.g. Projector, AV System"></div>
            <div class="form-group"><label class="form-label required">Quantity</label><input type="number" class="form-input" id="nr-qty" value="1" min="1"></div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="addResource(${amenityId})">+ Add Resource</button>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Done</button></div>`);
  };
  loadAndShow();
}

async function addResource(amenityId) {
  const body = {
    name:     document.getElementById('nr-name')?.value.trim(),
    quantity: parseInt(document.getElementById('nr-qty')?.value)||1,
  };
  if (!body.name) { toast('Resource name is required', 'warning'); return; }
  try {
    const r = await apiFetch('POST', `/api/amenities/${amenityId}/resources`, body);
    document.getElementById('resources-list').insertAdjacentHTML('beforeend', `
      <div class="resource-item" id="res-${r.id}">
        <div><strong>${esc(r.name)}</strong> <span class="badge badge-gray">Max: ${r.quantity}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteResource(${r.id},${amenityId})">Remove</button>
      </div>`);
    ['nr-name','nr-qty'].forEach(id => { const el=document.getElementById(id); if(el)el.value=id==='nr-qty'?'1':''; });
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteResource(id, amenityId) {
  if (!confirm('Remove this resource?')) return;
  try {
    await apiFetch('DELETE', `/api/amenities/${amenityId}/resources/${id}`);
    document.getElementById('res-' + id)?.remove();
  } catch (e) { toast(e.message, 'error'); }
}

// ── SETTINGS TAB ──────────────────────────────────────────────────
async function renderSettingsTab(el) {
  const s = await apiFetch('GET', '/api/settings');

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-title">Portal Settings</div></div>
      <div class="card-body">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-bottom:12px">Branding</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Portal Name</label><input class="form-input" id="s-name" value="${esc(s.portal_name||'')}"></div>
          <div class="form-group"><label class="form-label">Tagline</label><input class="form-input" id="s-tagline" value="${esc(s.tagline||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Primary Color</label><input type="color" class="form-input" id="s-color" value="${s.primary_color||'#1a6fc4'}" style="height:42px;padding:4px"></div>
          <div class="form-group"><label class="form-label">Accent Color</label><input type="color" class="form-input" id="s-accent" value="${s.accent_color||'#e8851c'}" style="height:42px;padding:4px"></div>
        </div>
        <div class="form-group"><label class="form-label">Welcome Message</label><textarea class="form-textarea" id="s-welcome" rows="2">${esc(s.welcome_message||'')}</textarea></div>

        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-top:20px;margin-bottom:12px">Email (SMTP)</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">SMTP Host</label><input class="form-input" id="s-smtp-host" value="${esc(s.smtp_host||'')}" placeholder="smtp.example.com"></div>
          <div class="form-group"><label class="form-label">SMTP Port</label><input type="number" class="form-input" id="s-smtp-port" value="${s.smtp_port||587}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">SMTP User</label><input class="form-input" id="s-smtp-user" value="${esc(s.smtp_user||'')}"></div>
          <div class="form-group"><label class="form-label">SMTP Password</label><input type="password" class="form-input" id="s-smtp-pass" placeholder="••••••••"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">From Email</label><input class="form-input" id="s-from-email" type="email" value="${esc(s.from_email||'')}" placeholder="portal@randolphofficecenter.com"></div>
          <div class="form-group"><label class="form-label">From Name</label><input class="form-input" id="s-from-name" value="${esc(s.from_name||'')}"></div>
        </div>
        <div class="form-group">
          <label class="form-check"><input type="checkbox" id="s-email-enabled" ${s.email_enabled?'checked':''}> <span>Enable email notifications</span></label>
        </div>
        <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
      </div>
    </div>`;
}

async function saveSettings() {
  const body = {
    portal_name:    document.getElementById('s-name')?.value.trim() || undefined,
    tagline:        document.getElementById('s-tagline')?.value || undefined,
    primary_color:  document.getElementById('s-color')?.value || undefined,
    accent_color:   document.getElementById('s-accent')?.value || undefined,
    welcome_message:document.getElementById('s-welcome')?.value || undefined,
    smtp_host:      document.getElementById('s-smtp-host')?.value || undefined,
    smtp_port:      parseInt(document.getElementById('s-smtp-port')?.value)||587,
    smtp_user:      document.getElementById('s-smtp-user')?.value || undefined,
    smtp_pass:      document.getElementById('s-smtp-pass')?.value || undefined,
    from_email:     document.getElementById('s-from-email')?.value || undefined,
    from_name:      document.getElementById('s-from-name')?.value || undefined,
    email_enabled:  document.getElementById('s-email-enabled')?.checked ? 1 : 0,
  };
  try {
    const updated = await apiFetch('PUT', '/api/settings', body);
    state.settings = { ...state.settings, ...updated };
    applyTheme(state.settings);
    toast('Settings saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
