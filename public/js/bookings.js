/* ═══════════════════════════════════════════════════════
   AMENITY BOOKINGS — calendar + new booking + detail
   ═══════════════════════════════════════════════════════ */

let _calState = { year: 0, month: 0, amenityId: null, selectedDate: null, dayData: {} };

route('bookings', async () => {
  const u = state.user;
  setHeader('Amenity Booking', 'Reserve shared spaces');

  const [amenities, bookings] = await Promise.all([
    apiFetch('GET', '/api/amenities'),
    apiFetch('GET', '/api/bookings'),
  ]);

  if (!amenities.length) {
    setContent(`${heroHtml('Amenity Booking','Reserve building amenities','📅')}
      <div class="empty-state"><div class="empty-icon">🏛️</div><div class="empty-title">No amenities configured</div><div class="empty-desc">PM Admin needs to add amenities from the Admin Panel.</div></div>`);
    return;
  }

  const now = new Date();
  const upcoming = bookings.filter(b => b.status === 'confirmed' && new Date(b.start_time) >= now)
    .sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));

  const myPast = bookings.filter(b => b.status !== 'cancelled' && new Date(b.end_time) < now)
    .sort((a,b)=>new Date(b.start_time)-new Date(a.start_time)).slice(0,5);

  const amenityOpts = amenities.map(a => `<option value="${a.id}">${esc(a.name)} (cap: ${a.capacity})</option>`).join('');

  setContent(`
    ${heroHtml('Amenity Booking', 'Reserve shared spaces and resources', '📅')}
    <div class="grid grid-2" style="align-items:start">
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <div>
              <div class="card-title">Availability Calendar</div>
              <div class="card-subtitle">Select a date to book</div>
            </div>
            <select class="form-select" id="cal-amenity-sel" style="max-width:200px" onchange="reloadCalendar()">
              ${amenityOpts}
            </select>
          </div>
          <div id="calendar-container"></div>
          <div class="card-footer" style="font-size:.75rem;display:flex;gap:14px;flex-wrap:wrap">
            <span style="display:flex;align-items:center;gap:5px"><span style="background:var(--primary-light);width:12px;height:12px;border-radius:3px;display:inline-block"></span> Other booking</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="background:var(--success);width:12px;height:12px;border-radius:3px;display:inline-block"></span> Your booking</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="background:var(--gray-400);width:12px;height:12px;border-radius:3px;display:inline-block"></span> Blocked</span>
          </div>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <div class="card-title">Upcoming Reservations</div>
            <button class="btn btn-primary btn-sm" onclick="navigate('new-booking')">+ Book Space</button>
          </div>
          ${upcoming.length ? upcoming.map(b=>`
            <div class="list-item" onclick="navigate('booking-detail',{id:${b.id}})">
              <div class="list-item-icon" style="background:var(--info-bg);color:var(--info)">📅</div>
              <div class="list-item-body">
                <div class="list-item-title">${esc(b.amenity_name)}</div>
                <div class="list-item-meta">${fmtDate(b.start_time)} · ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)} · ${b.headcount} guests</div>
                ${isPM(u) ? `<div class="list-item-meta">${esc(b.tenant_name)}</div>` : ''}
              </div>
              ${statusBadge(b.status)}
            </div>`).join('') :
            `<div class="empty-state" style="padding:28px"><div class="empty-icon">📅</div><div class="empty-title">No upcoming bookings</div></div>`}
        </div>
        ${myPast.length ? `
          <div class="card">
            <div class="card-header"><div class="card-title">Past Bookings</div></div>
            ${myPast.map(b=>`
              <div class="list-item" onclick="navigate('booking-detail',{id:${b.id}})">
                <div class="list-item-body">
                  <div class="list-item-title">${esc(b.amenity_name)}</div>
                  <div class="list-item-meta">${fmtDate(b.start_time)} · ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}</div>
                </div>
                ${statusBadge(b.status)}
              </div>`).join('')}
          </div>` : ''}
        ${isPM(u) ? `
          <div class="card" style="margin-top:14px">
            <div class="card-header">
              <div class="card-title">Manage Blackouts</div>
              <button class="btn btn-sm btn-secondary" onclick="showAddBlackoutModal()">+ Add Blackout</button>
            </div>
            <div id="blackouts-panel">
              <div class="loading-center"><div class="spinner"></div></div>
            </div>
          </div>` : ''}
      </div>
    </div>
  `);

  // Init calendar
  window._bookingAmenities = amenities;
  const now2 = new Date();
  _calState = { year: now2.getFullYear(), month: now2.getMonth() + 1, amenityId: amenities[0].id, selectedDate: null, dayData: {} };
  await loadCalendar();

  if (isPM(u)) loadBlackouts();
});

async function reloadCalendar() {
  const sel = document.getElementById('cal-amenity-sel');
  if (sel) _calState.amenityId = parseInt(sel.value);
  await loadCalendar();
}

async function loadCalendar() {
  const { year, month, amenityId } = _calState;
  const container = document.getElementById('calendar-container');
  if (!container) return;

  container.innerHTML = `<div class="loading-center" style="padding:24px"><div class="spinner"></div></div>`;

  const data = await apiFetch('GET', `/api/bookings/calendar?amenity_id=${amenityId}&year=${year}&month=${month}`).catch(() => ({ bookings: [], blackouts: [] }));

  // Build day map
  const dayMap = {};
  for (const b of data.bookings) {
    const d = new Date(b.start_time).toLocaleDateString('en-CA');
    if (!dayMap[d]) dayMap[d] = { bookings: [], blackouts: [] };
    dayMap[d].bookings.push(b);
  }
  for (const bl of data.blackouts) {
    const d = new Date(bl.start_time).toLocaleDateString('en-CA');
    if (!dayMap[d]) dayMap[d] = { bookings: [], blackouts: [] };
    dayMap[d].blackouts.push(bl);
  }
  _calState.dayData = dayMap;

  const monthDate = new Date(year, month - 1, 1);
  const monthName = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const firstDay  = monthDate.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toLocaleDateString('en-CA');
  const u = state.user;

  let cells = '';
  // Day headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    cells += `<div class="cal-day-name">${d}</div>`;
  });
  // Blank cells for first week
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell other-month"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayInfo = dayMap[dateStr] || { bookings: [], blackouts: [] };
    const isPast  = dateStr < today;
    const isToday = dateStr === today;
    const isSel   = dateStr === _calState.selectedDate;
    const isBlocked = dayInfo.blackouts.length > 0;

    let classes = 'cal-cell';
    if (isToday) classes += ' today';
    if (isSel)   classes += ' selected';
    if (isBlocked) classes += ' blocked';
    if (!isPast && !isBlocked) classes += ' selectable';

    const events = dayInfo.bookings.slice(0,3).map(b => {
      const isMine = b.user_id === u.id || (isPM(u) && b.tenant_id === u.tenant_id);
      return `<div class="cal-event ${isMine?'mine':''}">${fmtTime(b.start_time)} ${isPM(u)?esc(b.tenant_name?.slice(0,8)||''):esc(b.user_name?.split(' ')[0]||'')}</div>`;
    }).join('');

    const blockEvents = dayInfo.blackouts.slice(0,2).map(bl =>
      `<div class="cal-event blackout">Blocked</div>`
    ).join('');

    const onclick = (!isPast && !isBlocked) ? `onclick="selectCalDay('${dateStr}')"` : '';
    cells += `<div class="${classes}" ${onclick}><span class="cal-day-num">${day}</span>${events}${blockEvents}</div>`;
  }

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1);

  container.innerHTML = `
    <div class="cal-nav">
      <button class="btn btn-ghost btn-sm" onclick="calNav(-1)">‹ Prev</button>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="cal-month">${monthName}</div>
        ${!isCurrentMonth ? `<button class="btn btn-ghost btn-sm" style="font-size:.75rem;padding:2px 8px" onclick="calToday()">Today</button>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="calNav(1)">Next ›</button>
    </div>
    <div class="cal-grid">${cells}</div>`;
}

async function calToday() {
  const now = new Date();
  _calState.year = now.getFullYear();
  _calState.month = now.getMonth() + 1;
  await loadCalendar(_calState.amenityId);
}

async function calNav(dir) {
  _calState.month += dir;
  if (_calState.month < 1) { _calState.month = 12; _calState.year--; }
  if (_calState.month > 12) { _calState.month = 1; _calState.year++; }
  await loadCalendar();
}

function selectCalDay(dateStr) {
  _calState.selectedDate = dateStr;
  loadCalendar();
  navigate('new-booking', { date: dateStr, amenityId: _calState.amenityId });
}

// ── New Booking ─────────────────────────────────────────────────────
route('new-booking', async ({ date, amenityId } = {}) => {
  setHeader('New Booking', 'Reserve an amenity');
  const u = state.user;

  const [amenities, tenants] = await Promise.all([
    apiFetch('GET', '/api/amenities'),
    isPM(u) ? apiFetch('GET', '/api/tenants') : Promise.resolve([]),
  ]);
  if (!amenities.length) { toast('No amenities available', 'warning'); navigate('bookings'); return; }

  const amenityOpts = amenities.map(a => `<option value="${a.id}" ${String(a.id)===String(amenityId)?'selected':''}>${esc(a.name)} (max ${a.capacity} guests)</option>`).join('');
  const tenantSelect = isPM(u) ? `
    <div class="form-group">
      <label class="form-label required">Booking for Tenant</label>
      <select class="form-select" id="bk-tenant">
        <option value="">— Select tenant —</option>
        ${tenants.map(t=>`<option value="${t.id}">${esc(t.name)} · ${t.building} W. Randolph</option>`).join('')}
      </select>
    </div>` : '';

  setContent(`
    ${heroHtml('New Booking', 'Reserve a building amenity', '📅')}
    <div class="card" style="max-width:680px">
      <div class="card-header"><div class="card-title">Booking Details</div></div>
      <div class="card-body">
        ${tenantSelect}
        <div class="form-group">
          <label class="form-label required">Amenity</label>
          <select class="form-select" id="bk-amenity" onchange="loadAmenityResources()">
            ${amenityOpts}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Date</label>
            <input type="date" class="form-input" id="bk-date" value="${date || ''}" min="${new Date().toLocaleDateString('en-CA')}">
          </div>
          <div class="form-group">
            <label class="form-label required">Headcount</label>
            <input type="number" class="form-input" id="bk-headcount" value="1" min="1" max="200">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Start Time</label>
            <input type="time" class="form-input" id="bk-start" value="09:00">
          </div>
          <div class="form-group">
            <label class="form-label required">End Time</label>
            <input type="time" class="form-input" id="bk-end" value="10:00">
          </div>
        </div>
        <div class="form-group" id="resources-group" style="display:none">
          <label class="form-label">Add-on Resources</label>
          <div class="resource-selector" id="resources-list"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="bk-notes" rows="2" style="min-height:64px" placeholder="Purpose of booking, special requests…"></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-secondary" onclick="navigate('bookings')">Cancel</button>
          <button class="btn btn-primary" id="bk-submit" onclick="submitBooking()">Confirm Booking</button>
        </div>
      </div>
    </div>
  `);

  window._resourceQtys = {};
  window._bookingAmenities = amenities;
  loadAmenityResources();
});


function loadAmenityResources() {
  const amenityId = document.getElementById('bk-amenity')?.value;
  const amenity = (window._bookingAmenities||[]).find(a => String(a.id) === String(amenityId));
  const resources = amenity?.resources || [];
  const group = document.getElementById('resources-group');
  const list  = document.getElementById('resources-list');
  if (!group || !list) return;

  if (!resources.length) { group.style.display = 'none'; return; }
  group.style.display = '';
  window._resourceQtys = {};

  list.innerHTML = resources.map(r => `
    <div class="resource-item" id="res-row-${r.id}">
      <div class="resource-name">${esc(r.name)} <span style="font-size:.75rem;color:var(--gray-500)">(max ${r.quantity})</span></div>
      <div class="resource-qty-ctrl">
        <button class="qty-btn" onclick="changeQty(${r.id}, -1)">−</button>
        <span class="qty-val" id="qty-${r.id}">0</span>
        <button class="qty-btn" onclick="changeQty(${r.id}, 1, ${r.quantity})">+</button>
      </div>
    </div>`).join('');
}

function changeQty(resId, delta, max) {
  const cur = window._resourceQtys[resId] || 0;
  const next = Math.min(Math.max(0, cur + delta), max || 999);
  window._resourceQtys[resId] = next;
  const el = document.getElementById('qty-' + resId);
  if (el) el.textContent = next;
  document.getElementById('res-row-' + resId)?.classList.toggle('resource-selected', next > 0);
}


async function submitBooking() {
  const amenityId = document.getElementById('bk-amenity')?.value;
  const date      = document.getElementById('bk-date')?.value;
  const startVal  = document.getElementById('bk-start')?.value;
  const endVal    = document.getElementById('bk-end')?.value;
  const headcount = document.getElementById('bk-headcount')?.value;
  const notes     = document.getElementById('bk-notes')?.value;

  if (!date)     { toast('Please select a date', 'warning'); return; }
  if (!startVal) { toast('Please enter a start time', 'warning'); return; }
  if (!endVal)   { toast('Please enter an end time', 'warning'); return; }
  if (endVal <= startVal) { toast('End time must be after start time', 'warning'); return; }

  const u = state.user;
  if (isPM(u) && !document.getElementById('bk-tenant')?.value) {
    toast('Please select a tenant', 'warning'); return;
  }

  const start = new Date(`${date}T${startVal}:00`);
  const end   = new Date(`${date}T${endVal}:00`);

  const resources = Object.entries(window._resourceQtys||{})
    .filter(([,q])=>q>0).map(([id,quantity])=>({resource_id:parseInt(id),quantity}));

  const body = {
    amenity_id: parseInt(amenityId), start_time: start.toISOString(), end_time: end.toISOString(),
    headcount: parseInt(headcount) || 1, notes: notes || null, resources,
  };
  if (isPM(u)) body.tenant_id = document.getElementById('bk-tenant')?.value;

  const btn = document.getElementById('bk-submit');
  btn.disabled = true; btn.textContent = 'Booking…';
  try {
    const booking = await apiFetch('POST', '/api/bookings', body);
    toast('Booking confirmed!', 'success');
    navigate('booking-detail', { id: booking.id });
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.textContent = 'Confirm Booking';
  }
}

// ── Booking Detail ─────────────────────────────────────────────────
route('booking-detail', async ({ id }) => {
  if (!id) return navigate('bookings');
  const u = state.user;
  const booking = await apiFetch('GET', `/api/bookings/${id}`);
  setHeader(booking.amenity_name, `${fmtDate(booking.start_time)}`);

  const isMine = booking.user_id === u.id || isPM(u);
  const canCancel = isMine && booking.status === 'confirmed' && new Date(booking.start_time) > new Date();
  const resHtml = booking.resources?.length ? booking.resources.map(r => `
    <div style="display:flex;justify-content:space-between;font-size:.875rem;padding:4px 0;border-bottom:1px solid var(--gray-100)">
      <span>${esc(r.resource_name)}</span><span style="font-weight:700">${r.quantity}</span>
    </div>`).join('') : '<span style="font-size:.85rem;color:var(--gray-400)">No add-on resources</span>';

  setContent(`
    <button class="btn btn-ghost btn-sm" onclick="navigate('bookings')" style="margin-bottom:14px">← Back</button>
    <div class="card" style="max-width:600px">
      <div class="card-header">
        <div><div class="card-title">${esc(booking.amenity_name)}</div><div class="card-subtitle">${esc(booking.amenity_location||'')}</div></div>
        ${statusBadge(booking.status)}
      </div>
      <div class="card-body">
        <div class="detail-grid" style="margin-bottom:18px">
          <div><div class="detail-field-label">Date</div><div class="detail-field-value">${fmtDate(booking.start_time)}</div></div>
          <div><div class="detail-field-label">Time</div><div class="detail-field-value">${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}</div></div>
          <div><div class="detail-field-label">Headcount</div><div class="detail-field-value">${booking.headcount} guests</div></div>
          <div><div class="detail-field-label">Booked by</div><div class="detail-field-value">${esc(booking.user_name)}</div></div>
          ${isPM(u) ? `<div><div class="detail-field-label">Tenant</div><div class="detail-field-value">${esc(booking.tenant_name)} · ${booking.tenant_building} W. Randolph</div></div>` : ''}
          <div><div class="detail-field-label">Booked on</div><div class="detail-field-value">${fmt(booking.created_at)}</div></div>
        </div>
        ${booking.notes ? `<div class="detail-section-title">Notes</div><div style="font-size:.9rem;color:var(--gray-700);margin-bottom:14px">${esc(booking.notes)}</div>` : ''}
        <div class="detail-section-title">Add-on Resources</div>
        ${resHtml}
        ${canCancel ? `<div style="margin-top:20px"><button class="btn btn-danger" onclick="cancelBooking(${booking.id})">Cancel Booking</button></div>` : ''}
      </div>
    </div>
  `);
});

async function cancelBooking(id) {
  if (!confirm('Cancel this booking?')) return;
  try {
    await apiFetch('PATCH', `/api/bookings/${id}/cancel`, {});
    toast('Booking cancelled', 'success');
    navigate('bookings');
  } catch (e) { toast(e.message, 'error'); }
}

// ── Blackouts panel (PM) ───────────────────────────────────────────
async function loadBlackouts() {
  const panel = document.getElementById('blackouts-panel');
  if (!panel) return;
  const amenityId = document.getElementById('cal-amenity-sel')?.value;
  const blackouts = await apiFetch('GET', `/api/bookings/blackouts/list${amenityId ? '?amenity_id='+amenityId : ''}`).catch(()=>[]);

  panel.innerHTML = blackouts.length ? blackouts.slice(0,5).map(bl=>`
    <div class="list-item" style="padding:10px 16px">
      <div class="list-item-body">
        <div class="list-item-title">${esc(bl.amenity_name)}</div>
        <div class="list-item-meta">${fmtDate(bl.start_time)} · ${fmtTime(bl.start_time)} – ${fmtTime(bl.end_time)}${bl.reason?` · ${esc(bl.reason)}`:''}
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteBlackout(${bl.id})">Remove</button>
    </div>`).join('') :
    `<div class="empty-state" style="padding:24px"><div class="empty-icon">✅</div><div class="empty-title">No blackouts</div></div>`;
}

function showAddBlackoutModal() {
  const amenities = window._bookingAmenities || [];
  showModal(`
    <div class="modal-header"><div class="modal-title">Add Blackout Window</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Amenity</label>
        <select class="form-select" id="bl-amenity">${amenities.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label required">Start</label><input type="datetime-local" class="form-input" id="bl-start"></div>
        <div class="form-group"><label class="form-label required">End</label><input type="datetime-local" class="form-input" id="bl-end"></div>
      </div>
      <div class="form-group"><label class="form-label">Reason (optional)</label><input class="form-input" id="bl-reason" placeholder="Maintenance, event setup…"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBlackout()">Add Blackout</button>
    </div>`);
}

async function saveBlackout() {
  const body = {
    amenity_id: document.getElementById('bl-amenity')?.value,
    start_time: document.getElementById('bl-start')?.value,
    end_time:   document.getElementById('bl-end')?.value,
    reason:     document.getElementById('bl-reason')?.value,
  };
  if (!body.start_time || !body.end_time) { toast('Start and end are required', 'warning'); return; }
  try {
    await apiFetch('POST', '/api/bookings/blackouts', body);
    closeModal(); toast('Blackout added', 'success'); loadBlackouts();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteBlackout(id) {
  if (!confirm('Remove this blackout?')) return;
  try {
    await apiFetch('DELETE', `/api/bookings/blackouts/${id}`);
    toast('Blackout removed', 'success'); loadBlackouts();
  } catch (e) { toast(e.message, 'error'); }
}
