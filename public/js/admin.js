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
  window._adminUsers = users;

  function userRow(u) {
    const canImpersonate = u.role !== 'pm_admin' && u.active;
    return `<tr>
      <td><strong>${esc(u.name)}</strong>${u.mfa_enabled ? ' <span class="badge badge-success" title="Two-factor auth enabled" style="font-size:.65rem;padding:1px 5px;vertical-align:middle">2FA</span>' : ''}</td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.tenant_name ? `${esc(u.tenant_name)} · ${buildingTag(u.tenant_building)}` : '—'}</td>
      <td>${u.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
      <td>${fmt(u.created_at)}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="showUserModal(${u.id})">Edit</button>
        ${canImpersonate ? `<button class="btn btn-ghost btn-sm" style="color:var(--primary)" onclick="startImpersonation(${u.id})">👁 View as</button>` : ''}
      </td>
    </tr>`;
  }

  window.filterAdminUsers = () => {
    const q = (document.getElementById('user-search')?.value || '').toLowerCase();
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    const filtered = q
      ? (window._adminUsers || []).filter(u =>
          u.name.toLowerCase().includes(q) || (u.tenant_name || '').toLowerCase().includes(q))
      : (window._adminUsers || []);
    tbody.innerHTML = filtered.map(userRow).join('');
  };

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${users.length} Users</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="form-input" id="user-search" placeholder="Search by name or tenant…" style="width:220px" oninput="filterAdminUsers()">
          <button class="btn btn-primary btn-sm" onclick="showUserModal()">+ Add User</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tenant</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody id="users-tbody">${users.map(userRow).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function showUserModal(id) {
  const tenants = window._adminTenants || [];
  const editing = !!id;

  const loadAndShow = async () => {
    let u = {};
    if (editing) {
      u = (window._adminUsers || []).find(x => x.id === id) || {};
    }

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
        <div class="form-group" id="u-door-code-group">
          <label class="form-label">Door Code <span style="font-size:.75rem;font-weight:400;color:var(--gray-500)">(PM view only)</span></label>
          <input class="form-input" id="u-door-code" value="${esc(u.door_code||'')}" placeholder="e.g. 4821" autocomplete="off">
        </div>
        <div class="form-group" id="u-dir-optout-group">
          <label class="form-check"><input type="checkbox" id="u-dir-optout" ${u.directory_opt_out?'checked':''}> <span>Hide from Building Directory</span></label>
        </div>
        ${!editing ? `
        <div class="form-group"><label class="form-label required">Password</label><input class="form-input" id="u-password" type="password" placeholder="Min 8 characters"></div>
        <div class="form-group"><label class="form-check"><input type="checkbox" id="u-force-pw-change" checked> <span>Require password change on first login</span></label></div>` : ''}
        ${editing ? `<div class="form-group"><label class="form-label">New Password <span style="font-weight:400;font-size:.8rem">(leave blank to keep current)</span></label><input class="form-input" id="u-password" type="password" placeholder="Leave blank to keep current"></div>` : ''}
        ${editing ? `
        <div class="form-group"><label class="form-check"><input type="checkbox" id="u-active" ${u.active?'checked':''}> <span>Account Active</span></label></div>
        <div class="form-group">
          <div class="toggle-row" style="padding:0">
            <div>
              <div class="toggle-label">Email Notifications</div>
              <div class="toggle-desc">Service requests, bookings, and announcements</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="u-notifications" ${(u.notif_requests || u.notif_bookings || u.notif_announcements) ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        ${editing ? `<button class="btn btn-danger" onclick="deleteUser(${id})">Delete User</button>` : ''}
        ${editing && u.mfa_enabled ? `<button class="btn btn-ghost btn-sm" style="color:var(--warning,#b45309)" onclick="adminResetMFA(${id})">Reset MFA</button>` : ''}
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser(${id||'null'})">${editing?'Save':'Create User'}</button>
      </div>`);
    toggleTenantField();
  };
  loadAndShow();
}

function toggleTenantField() {
  const role = document.getElementById('u-role')?.value || '';
  const isPMRole = role.startsWith('pm_');
  const tenantGroup  = document.getElementById('u-tenant-group');
  const doorGroup    = document.getElementById('u-door-code-group');
  const optoutGroup  = document.getElementById('u-dir-optout-group');
  if (tenantGroup)  tenantGroup.style.display  = isPMRole ? 'none' : '';
  if (doorGroup)    doorGroup.style.display    = isPMRole ? 'none' : '';
  if (optoutGroup)  optoutGroup.style.display  = isPMRole ? 'none' : '';
}

async function startImpersonation(userId) {
  if (!confirm('View the portal as this user? You can return to your admin account at any time via the banner at the top of the screen.')) return;
  try {
    const { token, user } = await apiFetch('POST', `/api/auth/impersonate/${userId}`);
    // Save the current admin token so we can restore it on exit
    localStorage.setItem('roc_admin_token', state.token);
    state.token = token;
    state.user  = user;
    localStorage.setItem('roc_token', token);
    showApp();
    toast(`Now viewing as ${user.name}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteUser(id) {
  if (!confirm('Permanently delete this user? This cannot be undone.')) return;
  try {
    await apiFetch('DELETE', `/api/auth/users/${id}`);
    closeModal(); toast('User deleted', 'success'); showAdminTab('users');
  } catch (e) { toast(e.message, 'error'); }
}

async function adminResetMFA(userId) {
  if (!confirm('Reset two-factor authentication for this user? They will need to set it up again.')) return;
  try {
    await apiFetch('POST', `/api/auth/mfa/admin-reset/${userId}`);
    const u = (window._adminUsers || []).find(x => x.id === userId);
    if (u) u.mfa_enabled = 0;
    closeModal();
    toast('MFA has been reset for this user', 'success');
    showAdminTab('users');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveUser(id) {
  const notifEl = document.getElementById('u-notifications');
  const body = {
    name:                  document.getElementById('u-name')?.value.trim(),
    email:                 document.getElementById('u-email')?.value.trim(),
    role:                  document.getElementById('u-role')?.value,
    tenant_id:             document.getElementById('u-tenant')?.value || null,
    title:                 document.getElementById('u-title')?.value || null,
    phone:                 document.getElementById('u-phone')?.value || null,
    door_code:             document.getElementById('u-door-code')?.value || null,
    directory_opt_out:     document.getElementById('u-dir-optout')?.checked ? 1 : 0,
    password:              document.getElementById('u-password')?.value || undefined,
    active:                id ? (document.getElementById('u-active')?.checked ? 1 : 0) : 1,
    notifications_enabled: notifEl ? (notifEl.checked ? 1 : 0) : undefined,
    force_password_change: !id ? (document.getElementById('u-force-pw-change')?.checked ? 1 : 0) : undefined,
  };
  if (!body.name || !body.email) { toast('Name and email are required', 'warning'); return; }
  if (!id && !body.password) { toast('Password is required for new users', 'warning'); return; }
  try {
    if (id) await apiFetch('PUT', `/api/auth/users/${id}`, body);
    else await apiFetch('POST', '/api/auth/users', body);
    window._adminUsers = null; // invalidate cache so re-open shows fresh data
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
        <div class="list-item" ${!t.active ? 'style="opacity:.55"' : ''}>
          <div class="list-item-icon" style="background:var(--primary-light);color:var(--primary)">🏢</div>
          <div class="list-item-body">
            <div class="list-item-title">
              ${esc(t.name)}
              ${!t.active ? '<span class="badge badge-gray" style="font-size:.7rem">Inactive</span>' : ''}
              ${t.directory_hidden ? '<span class="badge badge-gray" style="font-size:.7rem">Hidden from Directory</span>' : ''}
            </div>
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
        <div class="form-group" style="margin-top:4px">
          <label class="form-check"><input type="checkbox" id="t-dir-hidden" ${t.directory_hidden ? 'checked' : ''}> <span>Hide from Building Directory</span></label>
        </div>
        ${editing ? `
        <div class="form-group" style="margin-top:4px">
          <label class="form-check"><input type="checkbox" id="t-active" ${t.active !== 0 ? 'checked' : ''} onchange="toggleTenantActiveFields()"> <span>Tenant Active</span></label>
        </div>
        <div id="t-cascade-group" style="margin-left:22px;margin-top:6px;${t.active !== 0 ? 'display:none' : ''}">
          <label class="form-check"><input type="checkbox" id="t-cascade-users"> <span style="font-size:.875rem;color:var(--gray-600)">Also deactivate all user accounts for this tenant</span></label>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        ${editing ? `<button class="btn btn-danger" onclick="deleteTenant(${id})">Delete Tenant</button>` : ''}
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveTenant(${id||'null'})">${editing?'Save':'Add Tenant'}</button>
      </div>`);
  };
  loadAndShow();
}

async function deleteTenant(id) {
  if (!confirm('Permanently delete this tenant? Their contacts and lease records will also be removed.\n\nNote: all user accounts must be deleted first.')) return;
  try {
    await apiFetch('DELETE', `/api/tenants/${id}`);
    closeModal(); toast('Tenant deleted', 'success'); showAdminTab('tenants');
  } catch (e) { toast(e.message, 'error'); }
}

function toggleTenantActiveFields() {
  const active = document.getElementById('t-active')?.checked;
  const group = document.getElementById('t-cascade-group');
  if (group) group.style.display = active ? 'none' : 'block';
  if (active && document.getElementById('t-cascade-users')) {
    document.getElementById('t-cascade-users').checked = false;
  }
}

async function saveTenant(id) {
  const body = {
    name:             document.getElementById('t-name')?.value.trim(),
    building:         document.getElementById('t-building')?.value,
    suite:            document.getElementById('t-suite')?.value || null,
    phone:            document.getElementById('t-phone')?.value || null,
    industry:         document.getElementById('t-industry')?.value || null,
    directory_hidden: document.getElementById('t-dir-hidden')?.checked ? 1 : 0,
  };
  if (id) {
    body.active        = document.getElementById('t-active')?.checked ? 1 : 0;
    body.cascade_users = document.getElementById('t-cascade-users')?.checked || false;
  }
  if (!body.name) { toast('Company name is required', 'warning'); return; }
  try {
    if (id) await apiFetch('PATCH', `/api/tenants/${id}`, body);
    else await apiFetch('POST', '/api/tenants', body);
    closeModal(); toast(id ? 'Tenant updated' : 'Tenant added', 'success');
    showAdminTab('tenants');
  } catch (e) { toast(e.message, 'error'); }
}

function renderContactRow(c, tenantId) {
  return `
    <div class="list-item" id="contact-${c.id}">
      <div class="list-item-body">
        <div class="list-item-title">
          ${esc(c.name)}
          ${c.title ? `<span class="badge badge-gray">${esc(c.title)}</span>` : ''}
          ${c.directory_hidden ? '<span class="badge badge-gray" style="font-size:.7rem">Hidden</span>' : ''}
        </div>
        <div class="list-item-meta">
          ${[c.email, c.phone].filter(Boolean).map(esc).join(' · ')}
          ${c.door_code ? `<span style="color:var(--gray-400)"> · Door: ${esc(c.door_code)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="editContact(${c.id},${tenantId})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteContact(${c.id})">Remove</button>
      </div>
    </div>`;
}

function editContact(contactId, tenantId) {
  const c = window._tenantContactsMap?.[contactId];
  if (!c) return;
  const el = document.getElementById('contact-' + contactId);
  if (!el) return;
  el.innerHTML = `
    <div style="flex:1">
      <div class="form-row">
        <div class="form-group"><label class="form-label required">Name</label><input class="form-input" id="ec-name-${contactId}" value="${esc(c.name)}"></div>
        <div class="form-group"><label class="form-label">Role / Label</label><input class="form-input" id="ec-role-${contactId}" value="${esc(c.title || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="ec-email-${contactId}" type="email" value="${esc(c.email || '')}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="ec-phone-${contactId}" value="${esc(c.phone || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Door Code <span style="font-size:.75rem;font-weight:400;color:var(--gray-500)">(PM view only)</span></label><input class="form-input" id="ec-door-${contactId}" value="${esc(c.door_code || '')}" autocomplete="off"></div>
        <div class="form-group" style="justify-content:flex-end;padding-top:24px">
          <label class="form-check"><input type="checkbox" id="ec-hidden-${contactId}" ${c.directory_hidden ? 'checked' : ''}> <span>Hide from Directory</span></label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-primary btn-sm" onclick="saveContact(${contactId},${tenantId})">Save</button>
        <button class="btn btn-ghost btn-sm" onclick="cancelEditContact(${contactId},${tenantId})">Cancel</button>
      </div>
    </div>`;
  document.getElementById(`ec-name-${contactId}`)?.focus();
}

async function saveContact(contactId, tenantId) {
  const name = document.getElementById(`ec-name-${contactId}`)?.value.trim();
  if (!name) { toast('Name is required', 'warning'); return; }
  const body = {
    name,
    title:            document.getElementById(`ec-role-${contactId}`)?.value || null,
    email:            document.getElementById(`ec-email-${contactId}`)?.value || null,
    phone:            document.getElementById(`ec-phone-${contactId}`)?.value || null,
    door_code:        document.getElementById(`ec-door-${contactId}`)?.value || null,
    directory_hidden: document.getElementById(`ec-hidden-${contactId}`)?.checked ? 1 : 0,
  };
  try {
    const updated = await apiFetch('PATCH', `/api/tenants/contacts/${contactId}`, body);
    window._tenantContactsMap[contactId] = updated;
    const el = document.getElementById('contact-' + contactId);
    if (el) el.outerHTML = renderContactRow(updated, tenantId);
    toast('Contact updated', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function cancelEditContact(contactId, tenantId) {
  const c = window._tenantContactsMap?.[contactId];
  if (!c) return;
  const el = document.getElementById('contact-' + contactId);
  if (el) el.outerHTML = renderContactRow(c, tenantId);
}

function showTenantContactsModal(tenantId) {
  const loadAndShow = async () => {
    const tenant = await apiFetch('GET', `/api/tenants/${tenantId}`).catch(()=>({}));
    const contacts = tenant.contacts || [];

    window._tenantContactsMap = {};
    contacts.forEach(c => { window._tenantContactsMap[c.id] = c; });

    showModal(`
      <div class="modal-header"><div class="modal-title">Named Contacts · ${esc(tenant.name)}</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div id="contacts-list">${contacts.length ? contacts.map(c => renderContactRow(c, tenantId)).join('') : '<div data-empty="1" style="font-size:.875rem;color:var(--gray-400);margin-bottom:12px">No contacts yet</div>'}</div>
        <div style="border-top:1px solid var(--gray-200);padding-top:14px;margin-top:12px">
          <div style="font-weight:600;margin-bottom:10px;font-size:.9rem">Add Contact</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label required">Name</label><input class="form-input" id="nc-name"></div>
            <div class="form-group"><label class="form-label">Role / Label</label><input class="form-input" id="nc-role" placeholder="e.g. Billing, Emergency"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="nc-email" type="email"></div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="nc-phone"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Door Code <span style="font-size:.75rem;font-weight:400;color:var(--gray-500)">(PM view only)</span></label><input class="form-input" id="nc-door-code" placeholder="e.g. 4821" autocomplete="off"></div>
            <div class="form-group" style="justify-content:flex-end;padding-top:24px">
              <label class="form-check"><input type="checkbox" id="nc-dir-hidden"> <span>Hide from Building Directory</span></label>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="addContact(${tenantId})">+ Add Contact</button>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Done</button></div>`);
  };
  loadAndShow();
}

async function addContact(tenantId) {
  const body = {
    name:             document.getElementById('nc-name')?.value.trim(),
    role_label:       document.getElementById('nc-role')?.value || null,
    email:            document.getElementById('nc-email')?.value || null,
    phone:            document.getElementById('nc-phone')?.value || null,
    door_code:        document.getElementById('nc-door-code')?.value || null,
    directory_hidden: document.getElementById('nc-dir-hidden')?.checked ? 1 : 0,
  };
  if (!body.name) { toast('Contact name is required', 'warning'); return; }
  try {
    const c = await apiFetch('POST', `/api/tenants/${tenantId}/contacts`, body);
    if (!window._tenantContactsMap) window._tenantContactsMap = {};
    window._tenantContactsMap[c.id] = c;
    const contactsList = document.getElementById('contacts-list');
    contactsList.querySelector('[data-empty]')?.remove();
    contactsList.insertAdjacentHTML('beforeend', renderContactRow(c, tenantId));
    ['nc-name','nc-role','nc-email','nc-phone','nc-door-code'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
    const dirHidden = document.getElementById('nc-dir-hidden');
    if (dirHidden) dirHidden.checked = false;
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteContact(contactId) {
  if (!confirm('Remove this contact?')) return;
  try {
    await apiFetch('DELETE', `/api/tenants/contacts/${contactId}`);
    document.getElementById('contact-' + contactId)?.remove();
    if (window._tenantContactsMap) delete window._tenantContactsMap[contactId];
  } catch (e) { toast(e.message, 'error'); }
}

// ── CATEGORIES TAB ─────────────────────────────────────────────────
async function renderCategoriesTab(el) {
  const cats = await apiFetch('GET', '/api/categories?all=true');
  window._adminCategories = cats;

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
    if (editing) c = (window._adminCategories || []).find(x => x.id === id) || {};

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
  const amenities = await apiFetch('GET', '/api/amenities?all=true');

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Amenities</div>
        <button class="btn btn-primary btn-sm" onclick="showAmenityModal()">+ Add Amenity</button>
      </div>
      ${amenities.map(a => `
        <div class="list-item" style="${a.active===0?'opacity:.55':''}">
          <div class="list-item-icon" style="background:var(--warning-bg)">🏛️</div>
          <div class="list-item-body">
            <div class="list-item-title">${esc(a.name)} <span class="badge badge-gray">Cap: ${a.capacity}</span>${a.active===0?' <span class="badge badge-danger">Inactive</span>':''}</div>
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
    if (id) {
      const result = await apiFetch('PATCH', `/api/amenities/${id}`, body);
      closeModal();
      if (result.cancelled_bookings > 0) {
        toast(`Amenity saved. ${result.cancelled_bookings} future booking${result.cancelled_bookings !== 1 ? 's were' : ' was'} cancelled and tenants notified.`, 'warning');
      } else {
        toast('Amenity saved', 'success');
      }
    } else {
      await apiFetch('POST', '/api/amenities', body);
      closeModal(); toast('Amenity saved', 'success');
    }
    showAdminTab('amenities');
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
        <div id="resources-list">${resources.length ? renderResources(resources) : '<div data-empty="1" style="font-size:.875rem;color:var(--gray-400);margin-bottom:12px">No resources yet</div>'}</div>
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
    const resourcesList = document.getElementById('resources-list');
    resourcesList.querySelector('[data-empty]')?.remove();
    resourcesList.insertAdjacentHTML('beforeend', `
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
  let s;
  try {
    s = await apiFetch('GET', '/api/settings/admin');
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="card-body"><p style="color:var(--danger)">Failed to load settings: ${esc(e.message)}</p></div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-title">Portal Settings</div></div>
      <div class="card-body">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-bottom:12px">Branding</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Portal Name</label><input class="form-input" id="s-name" value="${esc(s.building_name||'')}"></div>
          <div class="form-group"><label class="form-label">Tagline</label><input class="form-input" id="s-tagline" value="${esc(s.building_tagline||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Primary Color</label><input type="color" class="form-input" id="s-color" value="${s.primary_color||'#1a6fc4'}" style="height:42px;padding:4px"></div>
          <div class="form-group"><label class="form-label">Accent Color</label><input type="color" class="form-input" id="s-accent" value="${s.accent_color||'#e8851c'}" style="height:42px;padding:4px"></div>
        </div>
        <div class="form-group"><label class="form-label">Welcome Message</label><textarea class="form-textarea" id="s-welcome" rows="2">${esc(s.welcome_message||'')}</textarea></div>

        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-top:24px;margin-bottom:12px">Top Banner</div>
        <div class="form-group">
          <label class="form-check">
            <input type="checkbox" id="s-banner-enabled" ${(s.banner_enabled==='true'||s.banner_enabled==='1')?'checked':''} onchange="toggleBannerFields()">
            <span>Enable top banner</span>
          </label>
        </div>
        <div id="banner-fields" style="display:${(s.banner_enabled==='true'||s.banner_enabled==='1')?'':'none'}">
          <div class="form-group">
            <label class="form-label">Banner Image</label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <input class="form-input" id="s-banner-url" value="${esc(s.banner_image_url||'')}" placeholder="https://… or upload below" style="flex:1;min-width:200px">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
                Upload Image
                <input type="file" accept="image/*" style="display:none" onchange="uploadBannerImage(this)">
              </label>
            </div>
            <div class="form-hint">Recommended: 1400×200px or wider. PNG, JPG, WebP.</div>
            <div id="banner-preview" style="margin-top:10px;${s.banner_image_url?'':'display:none'}">
              <img id="banner-preview-img" src="${esc(s.banner_image_url||'')}" alt="Banner preview"
                style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;border:1px solid var(--gray-200)">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Headline (optional)</label>
              <input class="form-input" id="s-banner-title" value="${esc(s.banner_title||'')}" placeholder="e.g. Welcome to Randolph Office Center">
            </div>
            <div class="form-group">
              <label class="form-label">Subtext (optional)</label>
              <input class="form-input" id="s-banner-sub" value="${esc(s.banner_subtitle||'')}" placeholder="e.g. Your downtown Chicago home">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Click-through URL (optional)</label>
              <input class="form-input" id="s-banner-link" type="url" value="${esc(s.banner_link_url||'')}" placeholder="https://…">
            </div>
            <div class="form-group">
              <label class="form-label">Banner Height (px)</label>
              <input type="number" class="form-input" id="s-banner-height" value="${s.banner_height||180}" min="60" max="500">
            </div>
          </div>
        </div>
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-top:28px;margin-bottom:12px">Login Screen</div>
        <div class="form-group">
          <label class="form-label">Login Screen Image</label>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <input class="form-input" id="s-login-image-url" value="${esc(s.login_image||'')}" placeholder="https://… or upload below" style="flex:1;min-width:200px">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
              Upload Image
              <input type="file" accept="image/*" style="display:none" onchange="uploadLoginImage(this)">
            </label>
            ${s.login_image ? `<button class="btn btn-ghost btn-sm" onclick="clearLoginImage()" type="button">Remove</button>` : ''}
          </div>
          <div class="form-hint">Shown as a full-height side panel on the login screen on larger screens. Recommended: tall portrait or square image, 800×1200px+.</div>
          <div id="login-image-preview" style="margin-top:10px;${s.login_image?'':'display:none'}">
            <img id="login-image-preview-img" src="${esc(s.login_image||'')}" alt="Login image preview"
              style="max-height:160px;max-width:100%;object-fit:cover;border-radius:8px;border:1px solid var(--gray-200)">
          </div>
        </div>
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
          <div class="form-group"><label class="form-label">From Email</label><input class="form-input" id="s-from-email" type="email" value="${esc(s.smtp_from||'')}" placeholder="portal@randolphofficecenter.com"></div>
        </div>
        <div class="form-group" style="margin-top:4px">
          <label class="form-label">Send Test Email</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="form-input" type="email" id="s-test-email" placeholder="Recipient address…" value="${esc(state.user?.email||'')}" style="max-width:260px">
            <button class="btn btn-secondary btn-sm" onclick="sendTestEmail(this)">Send Test</button>
          </div>
          <div id="test-email-status" style="display:none;margin-top:8px;font-size:.85rem"></div>
          <div class="form-hint">Uses the SMTP settings above — no need to save first. The password field can be left blank to use the stored password.</div>
        </div>
        <div class="form-group">
          <label class="form-check"><input type="checkbox" id="s-email-enabled" ${(s.email_enabled==='true'||s.email_enabled==='1')?'checked':''}> <span>Enable email notifications</span></label>
        </div>
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-top:28px;margin-bottom:12px">Maintenance Mode</div>
        <div class="form-group">
          <label class="form-check"><input type="checkbox" id="s-maint-mode" ${(s.maintenance_mode==='1'||s.maintenance_mode==='true')?'checked':''}> <span>Enable maintenance mode — blocks all tenant logins and shows a maintenance message</span></label>
        </div>
        <div class="form-group">
          <label class="form-label">Maintenance Message</label>
          <textarea class="form-textarea" id="s-maint-msg" rows="2" placeholder="Message shown to tenants during maintenance…">${esc(s.maintenance_message||'')}</textarea>
        </div>
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-top:28px;margin-bottom:12px">Tenant Permissions</div>
        <div class="form-group">
          <label class="form-check"><input type="checkbox" id="s-tenant-admin-close" ${s.tenant_admin_close_all_requests==='1'?'checked':''}> <span>Allow Tenant Admin to close all tenant requests</span></label>
          <div class="form-hint" style="margin-top:4px;margin-left:24px">When enabled, tenant admins can mark any request as closed — not just ones they submitted.</div>
        </div>
        <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>

        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-top:28px;margin-bottom:12px">Backup &amp; Restore</div>
        <div class="form-group">
          <label class="form-label">Download Backup</label>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-secondary" id="backup-download-btn" onclick="downloadBackup(this)">&#8595; Download Backup</button>
            <span style="font-size:.8rem;color:var(--gray-500)">ZIP of database + all uploaded files</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Restore from Backup</label>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <label class="btn btn-secondary" style="cursor:pointer;margin:0">
              Choose .zip File
              <input type="file" accept=".zip" style="display:none" onchange="restoreBackup(this)">
            </label>
            <span style="font-size:.8rem;color:var(--gray-500)">Select a previously downloaded backup to restore</span>
          </div>
          <div id="restore-status" style="display:none;margin-top:10px"></div>
        </div>
      </div>
    </div>`;
}

function toggleBannerFields() {
  const enabled = document.getElementById('s-banner-enabled')?.checked;
  const fields  = document.getElementById('banner-fields');
  if (fields) fields.style.display = enabled ? '' : 'none';
}

async function uploadBannerImage(input) {
  const file = input.files[0];
  if (!file) return;
  const btn = input.closest('label');
  const origText = btn.childNodes[0].textContent;
  btn.childNodes[0].textContent = 'Uploading…';
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/settings/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
      body: fd,
    });
    if (!res.ok) throw new Error('Upload failed');
    const { url } = await res.json();
    document.getElementById('s-banner-url').value = url;
    const preview = document.getElementById('banner-preview');
    const img     = document.getElementById('banner-preview-img');
    if (preview && img) { img.src = url; preview.style.display = ''; }
    toast('Image uploaded', 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.childNodes[0].textContent = origText; input.value = ''; }
}

async function uploadLoginImage(input) {
  const file = input.files[0];
  if (!file) return;
  const btn = input.closest('label');
  const origText = btn.childNodes[0].textContent;
  btn.childNodes[0].textContent = 'Uploading…';
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/settings/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
      body: fd,
    });
    if (!res.ok) throw new Error('Upload failed');
    const { url } = await res.json();
    document.getElementById('s-login-image-url').value = url;
    const preview = document.getElementById('login-image-preview');
    const img     = document.getElementById('login-image-preview-img');
    if (preview && img) { img.src = url; preview.style.display = ''; }
    toast('Image uploaded', 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.childNodes[0].textContent = origText; input.value = ''; }
}

function clearLoginImage() {
  const urlInput = document.getElementById('s-login-image-url');
  const preview  = document.getElementById('login-image-preview');
  if (urlInput) urlInput.value = '';
  if (preview)  preview.style.display = 'none';
}

// ── BACKUP & RESTORE ───────────────────────────────────────────────
async function downloadBackup(btn) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Preparing…';
  try {
    const res = await fetch('/api/admin/backup', {
      headers: { Authorization: 'Bearer ' + state.token },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Backup failed');
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `randolph-portal-backup-${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Backup downloaded', 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function restoreBackup(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm(
    `Restore from "${file.name}"?\n\n` +
    `WARNING: This will stage a full replacement of the database and uploaded files. ` +
    `You must restart the server after uploading to apply the changes. ` +
    `This cannot be undone.`
  )) { input.value = ''; return; }

  const statusEl = document.getElementById('restore-status');
  statusEl.style.display = '';
  statusEl.innerHTML = `<div class="alert alert-warning">Uploading backup — please wait…</div>`;

  const fd = new FormData();
  fd.append('backup', file);
  try {
    const res = await fetch('/api/admin/restore', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Restore failed');

    statusEl.innerHTML = `
      <div class="alert alert-success" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div><strong>Backup staged.</strong> Click Restart to apply — the portal will be offline for a few seconds while it restarts.</div>
        <button class="btn btn-danger btn-sm" onclick="restartServer()">Restart &amp; Apply</button>
      </div>`;
  } catch (e) {
    statusEl.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
    toast(e.message, 'error');
  }
  input.value = '';
}

async function restartServer() {
  if (!confirm('Restart the server now? You will be signed out and redirected to the login page.')) return;
  try {
    await fetch('/api/admin/restart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
    });
  } catch (_) { /* server going down — expect network error */ }
  toast('Server restarting…', 'warning');
  setTimeout(() => signOut(), 2500);
}

async function sendTestEmail(btn) {
  const to = document.getElementById('s-test-email')?.value.trim();
  if (!to) { toast('Enter a recipient email address', 'warning'); return; }

  const statusEl = document.getElementById('test-email-status');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending…';
  statusEl.style.display = 'none';

  const body = {
    to,
    smtp_host: document.getElementById('s-smtp-host')?.value.trim(),
    smtp_port: parseInt(document.getElementById('s-smtp-port')?.value) || 587,
    smtp_user: document.getElementById('s-smtp-user')?.value.trim(),
    smtp_from: document.getElementById('s-from-email')?.value.trim(),
  };
  const newPass = document.getElementById('s-smtp-pass')?.value;
  if (newPass) body.smtp_pass = newPass;

  try {
    await apiFetch('POST', '/api/admin/test-email', body);
    statusEl.style.display = '';
    statusEl.innerHTML = '<span style="color:var(--success,#166534)">&#10003; Test email sent successfully.</span>';
  } catch (e) {
    statusEl.style.display = '';
    statusEl.innerHTML = `<span style="color:var(--danger,#dc2626)">&#10005; ${esc(e.message)}</span>`;
  }
  btn.disabled = false; btn.textContent = orig;
}

async function saveSettings() {
  const body = {
    building_name:    document.getElementById('s-name')?.value.trim() || undefined,
    building_tagline: document.getElementById('s-tagline')?.value || undefined,
    primary_color:    document.getElementById('s-color')?.value || undefined,
    accent_color:     document.getElementById('s-accent')?.value || undefined,
    welcome_message:  document.getElementById('s-welcome')?.value || undefined,
    smtp_host:        document.getElementById('s-smtp-host')?.value || undefined,
    smtp_port:        parseInt(document.getElementById('s-smtp-port')?.value)||587,
    smtp_user:        document.getElementById('s-smtp-user')?.value || undefined,
    smtp_from:        document.getElementById('s-from-email')?.value || undefined,
    email_enabled:        document.getElementById('s-email-enabled')?.checked ? '1' : '0',
    maintenance_mode:                   document.getElementById('s-maint-mode')?.checked ? '1' : '0',
    maintenance_message:                document.getElementById('s-maint-msg')?.value || undefined,
    tenant_admin_close_all_requests:    document.getElementById('s-tenant-admin-close')?.checked ? '1' : '0',
    login_image:      document.getElementById('s-login-image-url')?.value || '',
    banner_enabled:       document.getElementById('s-banner-enabled')?.checked ? '1' : '0',
    banner_image_url: document.getElementById('s-banner-url')?.value || '',
    banner_title:     document.getElementById('s-banner-title')?.value || '',
    banner_subtitle:  document.getElementById('s-banner-sub')?.value || '',
    banner_link_url:  document.getElementById('s-banner-link')?.value || '',
    banner_height:    document.getElementById('s-banner-height')?.value || '180',
  };
  // Only include password if the user typed a new one — blank means "keep existing"
  const newPass = document.getElementById('s-smtp-pass')?.value;
  if (newPass) body.smtp_pass = newPass;
  try {
    const updated = await apiFetch('PUT', '/api/settings', body);
    state.settings = { ...state.settings, ...updated };
    applyTheme(state.settings);
    updateBranding(state.settings);
    toast('Settings saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
