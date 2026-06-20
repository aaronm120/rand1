/* ═══════════════════════════════════════════════════════
   BUILDING DIRECTORY
   ═══════════════════════════════════════════════════════ */

route('directory', async () => {
  const u = state.user;
  setHeader('Building Directory', 'Tenant contacts across all buildings');

  const [directory, tenants] = await Promise.all([
    apiFetch('GET', '/api/directory'),
    isPM(u) ? apiFetch('GET', '/api/tenants') : Promise.resolve([]),
  ]);

  const BUILDINGS = ['728', '730', '732'];

  function renderTenantCard(tenant) {
    const { users = [], contacts = [] } = tenant;
    const visibleUsers = isPM(u) ? users : users.filter(usr => !usr.directory_opt_out);

    const usersHtml = visibleUsers.length ? visibleUsers.map(usr => `
      <div class="directory-person">
        <div class="directory-avatar">${(usr.name||'?').charAt(0).toUpperCase()}</div>
        <div class="directory-person-info">
          <div class="directory-person-name">${esc(usr.name)}${isPM(u) && usr.directory_opt_out ? ' <span style="font-size:.7rem;color:var(--gray-400)">(opted out)</span>' : ''}</div>
          ${usr.title ? `<div class="directory-person-meta">${esc(usr.title)}</div>` : ''}
          ${usr.phone ? `<div class="directory-person-meta"><a href="tel:${esc(usr.phone)}">${esc(usr.phone)}</a></div>` : ''}
          ${usr.email ? `<div class="directory-person-meta"><a href="mailto:${esc(usr.email)}">${esc(usr.email)}</a></div>` : ''}
          ${roleBadge(usr.role)}
        </div>
      </div>`).join('') : '';

    const contactsHtml = contacts.length ? contacts.map(c => `
      <div class="directory-person contact">
        <div class="directory-avatar" style="background:var(--primary-light);color:var(--primary)">📋</div>
        <div class="directory-person-info">
          <div class="directory-person-name">${esc(c.name)} <span style="font-size:.7rem;color:var(--gray-500)">Named Contact</span></div>
          ${c.role_label ? `<div class="directory-person-meta">${esc(c.role_label)}</div>` : ''}
          ${c.email ? `<div class="directory-person-meta"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
          ${c.phone ? `<div class="directory-person-meta"><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>` : ''}
        </div>
      </div>`).join('') : '';

    const allPeopleHtml = contactsHtml + usersHtml;
    if (!allPeopleHtml && !isPM(u)) return '';

    return `<div class="directory-company" id="company-${tenant.id}">
      <div class="directory-company-header">
        <div>
          <div class="directory-company-name">${esc(tenant.name)}</div>
          ${tenant.suite ? `<div class="directory-company-meta">Suite ${esc(tenant.suite)}</div>` : ''}
        </div>
        <div style="text-align:right">
          ${buildingTag(tenant.building)}
          ${isPM(u) ? `<button class="btn btn-ghost btn-sm" onclick="navigate('tenant-detail',{id:${tenant.id}})">Details →</button>` : ''}
        </div>
      </div>
      ${allPeopleHtml ? `<div class="directory-people">${allPeopleHtml}</div>` : `<div style="font-size:.85rem;color:var(--gray-400);padding:12px 0">No listed contacts</div>`}
    </div>`;
  }

  let searchHtml = `
    <div class="card" style="margin-bottom:18px">
      <div style="padding:12px 18px">
        <input class="form-input" id="dir-search" placeholder="Search by name, company, title…" oninput="filterDirectory()" style="max-width:400px">
      </div>
    </div>`;

  let buildingHtml = BUILDINGS.map(bld => {
    const bldTenants = directory.filter(t => String(t.building) === String(bld));
    if (!bldTenants.length) return '';
    const cards = bldTenants.map(renderTenantCard).filter(Boolean).join('');
    if (!cards) return '';
    return `<div class="building-section" id="bld-${bld}">
      <div class="building-section-header ${`building-${bld}`}">
        <h3>${bld} W. Randolph</h3>
        <span style="font-size:.85rem;opacity:.8">${bldTenants.length} tenant${bldTenants.length!==1?'s':''}</span>
      </div>
      ${cards}
    </div>`;
  }).filter(Boolean).join('');

  if (!buildingHtml) {
    buildingHtml = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Directory is empty</div><div class="empty-desc">No tenant contacts are currently listed.</div></div>`;
  }

  setContent(`
    ${heroHtml('Building Directory', 'Contact information for tenants across all buildings', '📋')}
    ${searchHtml}
    <div id="directory-content">${buildingHtml}</div>
  `);

  window._directoryData = directory;
});

function filterDirectory() {
  const q = (document.getElementById('dir-search')?.value || '').toLowerCase().trim();
  const data = window._directoryData || [];
  const u = state.user;
  const BUILDINGS = ['728', '730', '732'];

  if (!q) {
    document.getElementById('directory-content').innerHTML = BUILDINGS.map(bld => {
      const bldTenants = data.filter(t => String(t.building) === String(bld));
      if (!bldTenants.length) return '';
      const cards = bldTenants.map(renderDirTenantCard).filter(Boolean).join('');
      if (!cards) return '';
      return `<div class="building-section" id="bld-${bld}">
        <div class="building-section-header building-${bld}"><h3>${bld} W. Randolph</h3></div>
        ${cards}
      </div>`;
    }).filter(Boolean).join('');
    return;
  }

  const matched = data.filter(t => {
    const nameMatch = t.name.toLowerCase().includes(q);
    const userMatch = (t.users||[]).some(usr => usr.name.toLowerCase().includes(q) || (usr.title||'').toLowerCase().includes(q) || (usr.email||'').toLowerCase().includes(q));
    const contactMatch = (t.contacts||[]).some(c => c.name.toLowerCase().includes(q) || (c.role_label||'').toLowerCase().includes(q));
    return nameMatch || userMatch || contactMatch;
  });

  if (!matched.length) {
    document.getElementById('directory-content').innerHTML =
      `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No results for "${esc(q)}"</div></div>`;
    return;
  }

  document.getElementById('directory-content').innerHTML = matched.map(renderDirTenantCard).filter(Boolean).join('');
}

function renderDirTenantCard(tenant) {
  const u = state.user;
  const { users = [], contacts = [] } = tenant;
  const visibleUsers = isPM(u) ? users : users.filter(usr => !usr.directory_opt_out);
  const allPeople = [...contacts.map(c => `
      <div class="directory-person contact">
        <div class="directory-avatar" style="background:var(--primary-light);color:var(--primary)">📋</div>
        <div class="directory-person-info">
          <div class="directory-person-name">${esc(c.name)} <span style="font-size:.7rem">Named Contact</span></div>
          ${c.role_label?`<div class="directory-person-meta">${esc(c.role_label)}</div>`:''}
          ${c.email?`<div class="directory-person-meta"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`:''}
          ${c.phone?`<div class="directory-person-meta">${esc(c.phone)}</div>`:''}
        </div>
      </div>`),
    ...visibleUsers.map(usr => `
      <div class="directory-person">
        <div class="directory-avatar">${(usr.name||'?')[0].toUpperCase()}</div>
        <div class="directory-person-info">
          <div class="directory-person-name">${esc(usr.name)}</div>
          ${usr.title?`<div class="directory-person-meta">${esc(usr.title)}</div>`:''}
          ${usr.email?`<div class="directory-person-meta"><a href="mailto:${esc(usr.email)}">${esc(usr.email)}</a></div>`:''}
          ${usr.phone?`<div class="directory-person-meta">${esc(usr.phone)}</div>`:''}
        </div>
      </div>`)];

  if (!allPeople.length && !isPM(u)) return '';
  return `<div class="directory-company">
    <div class="directory-company-header">
      <div><div class="directory-company-name">${esc(tenant.name)}</div>${tenant.suite?`<div class="directory-company-meta">Suite ${esc(tenant.suite)}</div>`:''}</div>
      ${buildingTag(tenant.building)}
    </div>
    ${allPeople.length ? `<div class="directory-people">${allPeople.join('')}</div>` : '<div style="font-size:.85rem;color:var(--gray-400);padding:8px 0">No listed contacts</div>'}
  </div>`;
}
