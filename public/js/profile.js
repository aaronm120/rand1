/* ═══════════════════════════════════════════════════════
   PROFILE — edit profile, password, notifications, opt-out
   ═══════════════════════════════════════════════════════ */

route('profile', async () => {
  // Fetch fresh data — admin may have updated this user's profile since login
  try {
    const fresh = await apiFetch('GET', '/api/auth/me');
    state.user = { ...state.user, ...fresh };
  } catch (_) {}
  const u = state.user;
  setHeader('My Profile', u.tenant_name || '');

  const prefs = u.notification_prefs || {};

  setContent(`
    ${heroHtml('My Profile', 'Manage your account settings', '👤')}
    <div class="grid grid-2" style="align-items:start">
      <!-- Profile info -->
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-header"><div class="card-title">Profile Information</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label required">Full Name</label>
              <input class="form-input" id="p-name" value="${esc(u.name||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Job Title</label>
              <input class="form-input" id="p-title" value="${esc(u.title||'')}" placeholder="e.g. Office Manager">
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input class="form-input" id="p-phone" type="tel" value="${esc(u.phone||'')}" placeholder="+1 (312) 555-0100">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-input" id="p-email" type="email" value="${esc(u.email||'')}">
            </div>
            ${!isPM(u) ? `
              <div class="form-group">
                <div class="toggle-row">
                  <div>
                    <div class="toggle-label">Hide from Building Directory</div>
                    <div class="toggle-desc">Your name won't appear in the tenant directory</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="p-optout" ${u.directory_opt_out ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>` : ''}
            <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
          </div>
        </div>

        <!-- Change password -->
        <div class="card">
          <div class="card-header"><div class="card-title">Change Password</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label required">Current Password</label>
              <input class="form-input" id="pw-current" type="password" autocomplete="current-password">
            </div>
            <div class="form-group">
              <label class="form-label required">New Password</label>
              <input class="form-input" id="pw-new" type="password" autocomplete="new-password">
              <div class="form-hint">Minimum 8 characters</div>
            </div>
            <div class="form-group">
              <label class="form-label required">Confirm New Password</label>
              <input class="form-input" id="pw-confirm" type="password" autocomplete="new-password">
            </div>
            <button class="btn btn-secondary" onclick="changePassword()">Update Password</button>
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Email Notifications</div>
          <div class="card-subtitle">Control which emails you receive</div>
        </div>
        <div class="card-body">
          <div class="toggle-row">
            <div>
              <div class="toggle-label">Service Request Updates</div>
              <div class="toggle-desc">Status changes on your submitted requests</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="n-requests" ${prefs.request_updates ? 'checked' : ''} onchange="saveNotifications()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <div class="toggle-label">Booking Confirmations</div>
              <div class="toggle-desc">Confirmation emails when you book amenities</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="n-bookings" ${prefs.booking_confirmations ? 'checked' : ''} onchange="saveNotifications()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <div class="toggle-label">Announcements</div>
              <div class="toggle-desc">Building-wide and targeted announcements</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="n-announcements" ${prefs.announcements ? 'checked' : ''} onchange="saveNotifications()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div style="font-size:.8rem;color:var(--gray-400);margin-top:12px">Changes are saved automatically when you toggle.</div>
        </div>
      </div>
    </div>
  `);
});

async function saveProfile() {
  const u = state.user;
  const body = {
    name:               document.getElementById('p-name')?.value.trim(),
    email:              document.getElementById('p-email')?.value.trim() || undefined,
    title:              document.getElementById('p-title')?.value.trim() || null,
    phone:              document.getElementById('p-phone')?.value.trim() || null,
    directory_opt_out:  document.getElementById('p-optout')?.checked ? 1 : 0,
  };
  if (!body.name) { toast('Name is required', 'warning'); return; }
  try {
    const updated = await apiFetch('PUT', '/api/auth/profile', body);
    state.user = { ...state.user, ...updated };
    toast('Profile saved', 'success');
    renderNav();
  } catch (e) { toast(e.message, 'error'); }
}

async function changePassword() {
  const current = document.getElementById('pw-current')?.value;
  const newPw   = document.getElementById('pw-new')?.value;
  const confirm = document.getElementById('pw-confirm')?.value;
  if (!current || !newPw || !confirm) { toast('All password fields are required', 'warning'); return; }
  if (newPw !== confirm) { toast('New passwords do not match', 'warning'); return; }
  if (newPw.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
  try {
    await apiFetch('PUT', '/api/auth/password', { current_password: current, new_password: newPw });
    toast('Password updated', 'success');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } catch (e) { toast(e.message, 'error'); }
}

async function saveNotifications() {
  const body = {
    request_updates:       document.getElementById('n-requests')?.checked ? 1 : 0,
    booking_confirmations: document.getElementById('n-bookings')?.checked ? 1 : 0,
    announcements:         document.getElementById('n-announcements')?.checked ? 1 : 0,
  };
  try {
    await apiFetch('PUT', '/api/auth/notifications', body);
    state.user.notification_prefs = body;
  } catch (e) { toast('Failed to save notification preferences', 'error'); }
}
