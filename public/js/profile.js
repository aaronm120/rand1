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
              <input class="form-input" id="p-email" type="email" value="${esc(u.email||'')}" oninput="toggleEmailPwField(this, '${esc(u.email||'')}')">
            </div>
            <div class="form-group" id="email-pw-group" style="display:none">
              <label class="form-label required">Current Password <span style="font-size:.8rem;font-weight:400;color:var(--gray-500)">(required to change email)</span></label>
              <input class="form-input" id="p-email-pw" type="password" autocomplete="current-password">
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
              <div class="form-hint">Min 8 characters, including uppercase, lowercase, and a number</div>
            </div>
            <div class="form-group">
              <label class="form-label required">Confirm New Password</label>
              <input class="form-input" id="pw-confirm" type="password" autocomplete="new-password">
            </div>
            <button class="btn btn-secondary" onclick="changePassword()">Update Password</button>
          </div>
        </div>
      </div>

      <!-- Notifications + Security -->
      <div>
        <div class="card" style="margin-bottom:14px">
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
                <div class="toggle-label">Booking Reminders</div>
                <div class="toggle-desc">Reminder email 48 hours before your booking starts</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="n-booking-reminders" ${prefs.booking_reminders !== 0 ? 'checked' : ''} onchange="saveNotifications()">
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

        <!-- Security / MFA -->
        <div class="card">
          <div class="card-header"><div class="card-title">Security</div></div>
          <div class="card-body">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
              <div>
                <div style="font-weight:600;font-size:.92rem;margin-bottom:4px">
                  Two-Factor Authentication
                  ${u.mfa_enabled
                    ? '<span class="badge badge-success" style="margin-left:8px;vertical-align:middle">Enabled</span>'
                    : '<span class="badge badge-gray" style="margin-left:8px;vertical-align:middle">Off</span>'}
                </div>
                <div style="font-size:.82rem;color:var(--gray-500)">
                  ${u.mfa_enabled
                    ? 'Your account requires a code from your authenticator app at sign in.'
                    : 'Add an extra layer of security with an authenticator app.'}
                </div>
              </div>
            </div>
            <div style="margin-top:14px">
              ${u.mfa_enabled
                ? `<button class="btn btn-danger btn-sm" onclick="showDisableMFAModal()">Disable Two-Factor Auth</button>`
                : `<button class="btn btn-secondary btn-sm" onclick="setupMFA(event)">Set Up Two-Factor Auth</button>`}
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
});

function toggleEmailPwField(input, originalEmail) {
  const changed = input.value.trim() !== originalEmail;
  const group = document.getElementById('email-pw-group');
  if (group) group.style.display = changed ? '' : 'none';
  if (!changed) {
    const pw = document.getElementById('p-email-pw');
    if (pw) pw.value = '';
  }
}

async function saveProfile() {
  const u = state.user;
  const newEmail = document.getElementById('p-email')?.value.trim();
  const body = {
    name:               document.getElementById('p-name')?.value.trim(),
    email:              newEmail || undefined,
    title:              document.getElementById('p-title')?.value.trim() || null,
    phone:              document.getElementById('p-phone')?.value.trim() || null,
    directory_opt_out:  document.getElementById('p-optout')?.checked ? 1 : 0,
  };
  if (!body.name) { toast('Name is required', 'warning'); return; }
  if (newEmail && newEmail !== u.email) {
    const pw = document.getElementById('p-email-pw')?.value;
    if (!pw) { toast('Enter your current password to change your email address', 'warning'); return; }
    body.current_password = pw;
  }
  const btn = document.querySelector('button[onclick="saveProfile()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const updated = await apiFetch('PUT', '/api/auth/profile', body);
    state.user = { ...state.user, ...updated };
    const group = document.getElementById('email-pw-group');
    const pw    = document.getElementById('p-email-pw');
    if (group) group.style.display = 'none';
    if (pw)    pw.value = '';
    toast('Profile saved', 'success');
    renderNav();
  } catch (e) { toast(e.message, 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

async function changePassword() {
  const current = document.getElementById('pw-current')?.value;
  const newPw   = document.getElementById('pw-new')?.value;
  const confirm = document.getElementById('pw-confirm')?.value;
  if (!current || !newPw || !confirm) { toast('All password fields are required', 'warning'); return; }
  if (newPw !== confirm)       { toast('New passwords do not match', 'warning'); return; }
  if (newPw.length < 8)        { toast('Password must be at least 8 characters', 'warning'); return; }
  if (!/[a-z]/.test(newPw))    { toast('Password must contain at least one lowercase letter', 'warning'); return; }
  if (!/[A-Z]/.test(newPw))    { toast('Password must contain at least one uppercase letter', 'warning'); return; }
  if (!/\d/.test(newPw))       { toast('Password must contain at least one number', 'warning'); return; }
  const btn = document.querySelector('button[onclick="changePassword()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
  try {
    const result = await apiFetch('PUT', '/api/auth/password', { current_password: current, new_password: newPw });
    if (result.token) {
      state.token = result.token;
      localStorage.setItem('roc_token', result.token);
    }
    toast('Password updated', 'success');
    ['pw-current', 'pw-new', 'pw-confirm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  } catch (e) { toast(e.message, 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
}

async function saveNotifications() {
  const body = {
    request_updates:       document.getElementById('n-requests')?.checked ? 1 : 0,
    booking_confirmations: document.getElementById('n-bookings')?.checked ? 1 : 0,
    booking_reminders:     document.getElementById('n-booking-reminders')?.checked ? 1 : 0,
    announcements:         document.getElementById('n-announcements')?.checked ? 1 : 0,
  };
  try {
    await apiFetch('PUT', '/api/auth/notifications', body);
    state.user.notification_prefs = body;
  } catch (e) { toast('Failed to save notification preferences', 'error'); }
}

// ── MFA setup ─────────────────────────────────────────────────────────────────

async function setupMFA(evt) {
  const btn = evt?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  try {
    const { secret, otpauth_uri } = await apiFetch('GET', '/api/auth/mfa/setup');
    showMFASetupModal(secret, otpauth_uri);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Set Up Two-Factor Auth'; }
  }
}

function showMFASetupModal(secret, otpauthUri) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Set Up Two-Factor Auth</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <p style="font-size:.88rem;color:var(--gray-600);margin-bottom:16px">
        Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.),
        then enter the 6-digit code to confirm.
      </p>
      <div id="mfa-qr" style="text-align:center;margin:16px 0"></div>
      <details style="margin-bottom:16px">
        <summary style="font-size:.82rem;color:var(--gray-500);cursor:pointer">Can't scan? Enter the key manually</summary>
        <div style="font-family:monospace;font-size:.88rem;background:var(--gray-50);padding:10px 12px;border-radius:6px;margin-top:8px;word-break:break-all;user-select:all">${esc(secret)}</div>
      </details>
      <div class="form-group">
        <label class="form-label required">Verification Code</label>
        <input class="form-input" id="mfa-setup-code" type="text" inputmode="numeric" placeholder="000000"
          maxlength="8" style="letter-spacing:.2em;font-size:1.1rem;text-align:center" autocomplete="one-time-code">
        <div class="form-hint">Enter the current code from your authenticator app</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="mfa-enable-btn" onclick="enableMFA()">Enable Two-Factor Auth</button>
    </div>`);

  // Render QR code using CDN library
  const qrEl = document.getElementById('mfa-qr');
  if (window.qrcode && qrEl) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(otpauthUri);
      qr.make();
      qrEl.innerHTML = qr.createImgTag(4);
    } catch (_) {
      qrEl.innerHTML = `<div style="font-size:.8rem;color:var(--gray-400)">QR code unavailable — use manual entry above</div>`;
    }
  } else if (qrEl) {
    qrEl.innerHTML = `<div style="font-size:.8rem;color:var(--gray-400)">QR code library not loaded — use manual entry above</div>`;
  }

  document.getElementById('mfa-setup-code')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') enableMFA();
  });
}

async function enableMFA() {
  const code = document.getElementById('mfa-setup-code')?.value.trim();
  const btn  = document.getElementById('mfa-enable-btn');
  if (!code) { toast('Enter the 6-digit code from your authenticator app', 'warning'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Enabling…'; }
  try {
    const { backup_codes } = await apiFetch('POST', '/api/auth/mfa/enable', { code });
    state.user.mfa_enabled = 1;
    closeModal();
    showBackupCodesModal(backup_codes);
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Enable Two-Factor Auth'; }
  }
}

function showBackupCodesModal(codes) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Save Your Backup Codes</div>
      <button class="modal-close" onclick="closeModal(); navigate('profile')">×</button>
    </div>
    <div class="modal-body">
      <div class="alert alert-warning" style="margin-bottom:16px">
        <strong>Save these codes now.</strong> They won't be shown again.
        Use one if you ever lose access to your authenticator app — each code works once.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-family:monospace;font-size:.92rem">
        ${codes.map(c => `<div style="background:var(--gray-50);padding:8px 12px;border-radius:6px;text-align:center">${esc(c)}</div>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="copyBackupCodes(${JSON.stringify(codes).replace(/"/g, '&quot;')})">Copy All</button>
      <button class="btn btn-primary" onclick="closeModal(); navigate('profile')">Done</button>
    </div>`);
}

function copyBackupCodes(codes) {
  navigator.clipboard?.writeText(codes.join('\n'))
    .then(() => toast('Backup codes copied to clipboard', 'success'))
    .catch(() => toast('Copy failed — please copy the codes manually', 'error'));
}

function showDisableMFAModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Disable Two-Factor Auth</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <p style="color:var(--gray-600);font-size:.88rem;margin-bottom:16px">
        Enter your current password to disable two-factor authentication.
        Your account will be less secure without it.
      </p>
      <div class="form-group">
        <label class="form-label required">Current Password</label>
        <input class="form-input" id="mfa-disable-pw" type="password" autocomplete="current-password" autofocus>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" id="mfa-disable-btn" onclick="disableMFA()">Disable Two-Factor Auth</button>
    </div>`);
  document.getElementById('mfa-disable-pw')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') disableMFA();
  });
}

async function disableMFA() {
  const password = document.getElementById('mfa-disable-pw')?.value;
  const btn = document.getElementById('mfa-disable-btn');
  if (!password) { toast('Password is required', 'warning'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Disabling…'; }
  try {
    await apiFetch('POST', '/api/auth/mfa/disable', { password });
    state.user.mfa_enabled = 0;
    closeModal();
    navigate('profile');
    toast('Two-factor authentication disabled', 'success');
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Disable Two-Factor Auth'; }
  }
}
