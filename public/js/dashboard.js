/* ═══════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════ */

route('dashboard', async () => {
  const u = state.user;
  setHeader('Dashboard', u.tenant_name ? `${u.tenant_name} · ${u.tenant_building ? u.tenant_building + ' W. Randolph' : ''}` : 'Property Management');

  const s = state.settings;
  const greeting = `Welcome back, ${u.name?.split(' ')?.[0] || u.name || 'there'}`;

  // Load data in parallel
  const [requests, announcements, bookings] = await Promise.all([
    apiFetch('GET', '/api/requests').catch(() => []),
    apiFetch('GET', '/api/announcements').catch(() => []),
    apiFetch('GET', '/api/bookings').catch(() => []),
  ]);

  const openReqs = requests.filter(r => ['open','in_progress','pending_tenant'].includes(r.status));
  const urgentReqs = requests.filter(r => r.priority === 'urgent' && r.status !== 'closed' && r.status !== 'resolved');
  const now = new Date();
  const upcomingBookings = bookings.filter(b => b.status === 'confirmed' && new Date(b.start_time) >= now)
    .sort((a,b) => new Date(a.start_time) - new Date(b.start_time)).slice(0,3);
  const pinnedAnn = announcements.filter(a => a.pinned).slice(0,1);
  const recentAnn = announcements.filter(a => !a.pinned).slice(0,3);

  // PM sees all-building stats
  let statsHtml = '';
  if (isPM(u)) {
    const totalTenants = await apiFetch('GET','/api/tenants').then(t=>t.length).catch(()=>0);
    const totalOpen = openReqs.length;
    statsHtml = `<div class="grid grid-4" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-label">Open Requests</div><div class="stat-value">${totalOpen}</div><div class="stat-sub">${urgentReqs.length} urgent</div></div>
      <div class="stat-card"><div class="stat-icon">🏢</div><div class="stat-label">Tenants</div><div class="stat-value">${totalTenants}</div><div class="stat-sub">across 3 buildings</div></div>
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-label">Today's Bookings</div><div class="stat-value">${bookings.filter(b=>b.status==='confirmed'&&fmtDate(b.start_time)===fmtDate(now.toISOString())).length}</div><div class="stat-sub">amenity reservations</div></div>
      <div class="stat-card"><div class="stat-icon">📢</div><div class="stat-label">Announcements</div><div class="stat-value">${announcements.length}</div><div class="stat-sub">${announcements.filter(a=>a.urgent).length} urgent</div></div>
    </div>`;
  } else {
    statsHtml = `<div class="grid grid-3" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-label">Open Requests</div><div class="stat-value">${openReqs.length}</div><div class="stat-sub">${urgentReqs.length} urgent</div></div>
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-label">Upcoming Bookings</div><div class="stat-value">${upcomingBookings.length}</div><div class="stat-sub">confirmed</div></div>
      <div class="stat-card"><div class="stat-icon">📢</div><div class="stat-label">Announcements</div><div class="stat-value">${announcements.length}</div><div class="stat-sub">${announcements.filter(a=>a.pinned).length} pinned</div></div>
    </div>`;
  }

  // Pinned announcement banner
  const bannerHtml = pinnedAnn.length ? `
    <div class="alert alert-warning" style="margin-bottom:18px">
      <span style="font-size:1.1rem">${pinnedAnn[0].urgent ? '🚨' : '📌'}</span>
      <div><strong>${esc(pinnedAnn[0].title)}</strong><div style="font-size:.875rem;margin-top:2px">${esc(pinnedAnn[0].content.slice(0,160))}${pinnedAnn[0].content.length>160?'…':''}</div></div>
    </div>` : '';

  // Recent requests
  const recentReqs = (isPM(u) ? requests : requests.filter(r => r.tenant_id === u.tenant_id))
    .slice(0, 5);

  const reqsHtml = recentReqs.length ? recentReqs.map(r => `
    <div class="list-item prio-${r.priority}" onclick="navigate('request-detail',{id:${r.id}})">
      <div class="list-item-body">
        <div class="list-item-title">#${r.id} · ${esc(r.category_name)}</div>
        <div class="list-item-meta">
          ${isPM(u) ? `<span>${esc(r.tenant_name)}</span> · ${buildingTag(r.building)} ·` : ''}
          ${fmtDate(r.created_at)}
        </div>
      </div>
      <div class="list-item-right">${statusBadge(r.status)}${priorityBadge(r.priority)}</div>
    </div>`).join('') :
    `<div class="empty-state" style="padding:30px"><div class="empty-icon">✅</div><div class="empty-title">No open requests</div></div>`;

  // Upcoming bookings
  const bookHtml = upcomingBookings.length ? upcomingBookings.map(b => `
    <div class="list-item" onclick="navigate('booking-detail',{id:${b.id}})">
      <div class="list-item-icon" style="background:var(--info-bg);color:var(--info)">📅</div>
      <div class="list-item-body">
        <div class="list-item-title">${esc(b.amenity_name)}</div>
        <div class="list-item-meta">${fmtDate(b.start_time)} · ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)} · ${b.headcount} guests</div>
      </div>
      ${statusBadge(b.status)}
    </div>`).join('') :
    `<div class="empty-state" style="padding:28px"><div class="empty-icon">📅</div><div class="empty-title">No upcoming bookings</div></div>`;

  // Recent announcements
  const annHtml = recentAnn.slice(0,3).map(a => `
    <div class="ann-card ${a.urgent?'urgent':''} ${a.pinned?'pinned':''}" onclick="navigate('announcement-detail',{id:${a.id}})" style="cursor:pointer">
      <div class="ann-card-header">
        <div class="ann-card-title">${esc(a.title)}</div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${a.urgent ? '<span class="badge badge-danger">Urgent</span>' : ''}
          ${a.pinned ? '<span class="badge badge-warning">Pinned</span>' : ''}
        </div>
      </div>
      <div class="ann-card-body">${esc(a.content.slice(0,160))}${a.content.length>160?'…':''}</div>
      <div class="ann-card-footer"><span>${fmtDate(a.publish_at)}</span><span>${esc(a.author_name)}</span></div>
    </div>`).join('') ||
    `<div class="empty-state" style="padding:28px"><div class="empty-icon">📢</div><div class="empty-title">No announcements yet</div></div>`;

  const s2 = state.settings;
  setContent(`
    ${heroHtml(greeting, s2.welcome_message || 'Manage your space from one place.', '🏢')}
    ${bannerHtml}
    ${statsHtml}
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Recent Requests</div><div class="card-subtitle">Latest service activity</div></div>
          <button class="btn btn-sm btn-primary" onclick="navigate('new-request')">+ New Request</button>
        </div>
        ${reqsHtml}
        <div class="card-footer"><button class="btn btn-ghost btn-sm" onclick="navigate('requests')">View all requests →</button></div>
      </div>
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-header">
            <div class="card-title">Upcoming Bookings</div>
            <button class="btn btn-sm btn-secondary" onclick="navigate('new-booking')">+ Book Space</button>
          </div>
          ${bookHtml}
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Announcements</div>
            <button class="btn btn-ghost btn-sm" onclick="navigate('announcements')">View all →</button>
          </div>
          ${annHtml}
        </div>
      </div>
    </div>
  `);
});
