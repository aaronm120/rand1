/* ═══════════════════════════════════════════════════════
   AUTH — login, MFA, forgot password, reset password
   ═══════════════════════════════════════════════════════ */

let _pendingMFAToken = null;

function renderAuthCard(mode) {
  if (mode === 'forgot')           { renderForgotPasswordForm();   return; }
  if (mode === 'reset')            { renderResetPasswordForm();    return; }
  if (mode === 'force-pw-change')  { renderForceChangePassword(); return; }

  document.getElementById('auth-form-container').innerHTML = `
    <div class="auth-form">
      <h2>Sign in to your account</h2>
      <div class="form-group">
        <label class="form-label required">Email address</label>
        <input id="auth-email" class="form-input" type="email" placeholder="you@company.com" autocomplete="email" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label required">Password</label>
        <input id="auth-password" class="form-input" type="password" placeholder="••••••••" autocomplete="current-password">
        <div id="auth-error" class="form-error" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-lg auth-submit" id="auth-btn" onclick="doLogin()">Sign in</button>
      <div class="auth-links" style="margin-top:16px;font-size:.8rem;color:var(--gray-400)">
        <button onclick="renderForgotPasswordForm()">Forgot password?</button>
        &nbsp;&middot;&nbsp; Contact building management if you need access.
      </div>
    </div>`;

  ['auth-email','auth-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
  document.getElementById('auth-email')?.focus();
}

async function doLogin() {
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-btn');
  if (!email || !password) { showAuthError('Email and password are required'); return; }

  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const result = await apiFetch('POST', '/api/auth/login', { email, password });
    if (result.mfa_required) {
      _pendingMFAToken = result.mfa_token;
      renderMFAStep();
      return;
    }
    state.token = result.token; state.user = result.user;
    localStorage.setItem('roc_token', result.token);
    if (errEl) errEl.style.display = 'none';
    if (result.user.force_password_change) { renderForceChangePassword(); return; }
    showApp();
  } catch (e) {
    showAuthError(e.message);
    btn.disabled = false; btn.textContent = 'Sign in';
  }
}

function renderMFAStep() {
  document.getElementById('auth-form-container').innerHTML = `
    <div class="auth-form">
      <h2>Two-Factor Authentication</h2>
      <p style="color:var(--gray-500);font-size:.88rem;margin-bottom:18px">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
      <div class="form-group">
        <label class="form-label required">Verification Code</label>
        <input id="mfa-code" class="form-input" type="text" placeholder="000000 or backup code"
          autocomplete="one-time-code" maxlength="11" style="letter-spacing:.15em;font-size:1.15rem;text-align:center">
        <div id="mfa-error" class="form-error" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-lg auth-submit" id="mfa-btn" onclick="doMFAVerify()">Verify</button>
      <div class="auth-links" style="margin-top:16px">
        <button onclick="_pendingMFAToken=null; renderAuthCard('login')">Back to sign in</button>
      </div>
    </div>`;
  const mfaInput = document.getElementById('mfa-code');
  mfaInput?.focus();
  mfaInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doMFAVerify();
  });
}

async function doMFAVerify() {
  const code  = document.getElementById('mfa-code')?.value.trim();
  const errEl = document.getElementById('mfa-error');
  const btn   = document.getElementById('mfa-btn');
  if (!code) { errEl.textContent = 'Code is required'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Verifying…';
  errEl.style.display = 'none';
  try {
    const { token, user } = await apiFetch('POST', '/api/auth/mfa/verify', { mfa_token: _pendingMFAToken, code });
    _pendingMFAToken = null;
    state.token = token; state.user = user;
    localStorage.setItem('roc_token', token);
    if (user.force_password_change) { renderForceChangePassword(); return; }
    showApp();
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Verify';
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ── Forgot password ────────────────────────────────────

function renderForgotPasswordForm() {
  document.getElementById('auth-form-container').innerHTML = `
    <div class="auth-form">
      <h2>Reset password</h2>
      <p style="color:var(--gray-500);font-size:.88rem;margin-bottom:18px">Enter your email address and we'll send you a link to reset your password.</p>
      <div id="forgot-success" class="alert alert-success" style="display:none">
        Check your inbox — if that email is registered, a reset link is on its way.
      </div>
      <div id="forgot-fields">
        <div class="form-group">
          <label class="form-label required">Email address</label>
          <input id="forgot-email" class="form-input" type="email" placeholder="you@company.com" autocomplete="email" autofocus>
          <div id="forgot-error" class="form-error" style="display:none"></div>
        </div>
        <button class="btn btn-primary btn-lg auth-submit" id="forgot-btn" onclick="doForgotPassword()">Send Reset Link</button>
      </div>
      <div class="auth-links" style="margin-top:16px">
        <button onclick="renderAuthCard('login')">Back to sign in</button>
      </div>
    </div>`;

  document.getElementById('forgot-email')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doForgotPassword();
  });
  document.getElementById('forgot-email')?.focus();
}

async function doForgotPassword() {
  const email = document.getElementById('forgot-email')?.value.trim();
  const errEl = document.getElementById('forgot-error');
  const btn   = document.getElementById('forgot-btn');

  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Email is required'; errEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await apiFetch('POST', '/api/auth/forgot-password', { email });
    document.getElementById('forgot-fields').style.display = 'none';
    document.getElementById('forgot-success').style.display = 'block';
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Send Reset Link';
  }
}

// ── Reset password (from email link) ──────────────────

function renderResetPasswordForm() {
  const token = new URLSearchParams(window.location.search).get('reset_token') || '';

  document.getElementById('auth-form-container').innerHTML = `
    <div class="auth-form">
      <h2>Set new password</h2>
      <div id="reset-info" style="display:none;color:var(--gray-500);font-size:.88rem;margin-bottom:16px"></div>
      <div id="reset-banner" style="display:none;margin-bottom:16px"></div>
      <div id="reset-fields" style="display:none">
        <div class="form-group">
          <label class="form-label required">New password</label>
          <input id="reset-pw" class="form-input" type="password" placeholder="Min 8 chars, upper, lower &amp; number" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label required">Confirm password</label>
          <input id="reset-pw-confirm" class="form-input" type="password" placeholder="••••••••" autocomplete="new-password">
          <div id="reset-error" class="form-error" style="display:none"></div>
        </div>
        <button class="btn btn-primary btn-lg auth-submit" id="reset-btn" onclick="doResetPassword()">Reset Password</button>
      </div>
      <div class="auth-links" style="margin-top:16px">
        <button onclick="showAuth('login')">Back to sign in</button>
      </div>
    </div>`;

  ['reset-pw','reset-pw-confirm'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') doResetPassword(); });
  });

  if (!token) {
    showResetBanner('This reset link is missing or invalid. Please request a new one.', 'danger');
    return;
  }

  apiFetch('GET', `/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
    .then(data => {
      document.getElementById('reset-info').textContent = `Resetting password for ${data.email}`;
      document.getElementById('reset-info').style.display = 'block';
      document.getElementById('reset-fields').style.display = 'block';
    })
    .catch(e => {
      showResetBanner(e.message || 'This reset link is invalid or has expired. Please request a new one.', 'danger');
    });
}

async function doResetPassword() {
  const token   = new URLSearchParams(window.location.search).get('reset_token') || '';
  const pw      = document.getElementById('reset-pw')?.value;
  const confirm = document.getElementById('reset-pw-confirm')?.value;
  const errEl   = document.getElementById('reset-error');
  const btn     = document.getElementById('reset-btn');

  errEl.style.display = 'none';
  if (!pw || !confirm)    { errEl.textContent = 'Both fields are required';                         errEl.style.display = 'block'; return; }
  if (pw !== confirm)     { errEl.textContent = 'Passwords do not match';                            errEl.style.display = 'block'; return; }
  if (pw.length < 8)      { errEl.textContent = 'Password must be at least 8 characters';            errEl.style.display = 'block'; return; }
  if (!/[a-z]/.test(pw))  { errEl.textContent = 'Password must contain at least one lowercase letter'; errEl.style.display = 'block'; return; }
  if (!/[A-Z]/.test(pw))  { errEl.textContent = 'Password must contain at least one uppercase letter'; errEl.style.display = 'block'; return; }
  if (!/\d/.test(pw))     { errEl.textContent = 'Password must contain at least one number';         errEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Resetting…';
  try {
    await apiFetch('POST', '/api/auth/reset-password', { token, new_password: pw });
    document.getElementById('reset-fields').style.display = 'none';
    document.getElementById('reset-info').style.display  = 'none';
    showResetBanner('Password reset successfully! Redirecting to sign in…', 'success');
    history.replaceState(null, '', '/');
    setTimeout(() => showAuth('login'), 2500);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Reset Password';
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
}

// ── Forced password change (admin-required on first login) ─────────

function renderForceChangePassword() {
  document.getElementById('auth-form-container').innerHTML = `
    <div class="auth-form">
      <h2>Set your password</h2>
      <p style="color:var(--gray-500);font-size:.88rem;margin-bottom:18px">
        Your account requires you to set a new password before you can continue.
      </p>
      <div class="form-group">
        <label class="form-label required">New password</label>
        <input id="fpc-pw" class="form-input" type="password" placeholder="Min 8 chars, upper, lower &amp; number" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label class="form-label required">Confirm password</label>
        <input id="fpc-confirm" class="form-input" type="password" placeholder="••••••••" autocomplete="new-password">
        <div id="fpc-error" class="form-error" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-lg auth-submit" id="fpc-btn" onclick="doForcePasswordChange()">Set Password &amp; Continue</button>
    </div>`;

  ['fpc-pw', 'fpc-confirm'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') doForcePasswordChange(); });
  });
  document.getElementById('fpc-pw')?.focus();
}

async function doForcePasswordChange() {
  const pw      = document.getElementById('fpc-pw')?.value;
  const confirm = document.getElementById('fpc-confirm')?.value;
  const errEl   = document.getElementById('fpc-error');
  const btn     = document.getElementById('fpc-btn');

  errEl.style.display = 'none';
  if (!pw)               { errEl.textContent = 'Password is required'; errEl.style.display = 'block'; return; }
  if (pw.length < 8)     { errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display = 'block'; return; }
  if (!/[a-z]/.test(pw)) { errEl.textContent = 'Password must contain at least one lowercase letter'; errEl.style.display = 'block'; return; }
  if (!/[A-Z]/.test(pw)) { errEl.textContent = 'Password must contain at least one uppercase letter'; errEl.style.display = 'block'; return; }
  if (!/\d/.test(pw))    { errEl.textContent = 'Password must contain at least one number'; errEl.style.display = 'block'; return; }
  if (pw !== confirm)    { errEl.textContent = 'Passwords do not match'; errEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const result = await apiFetch('POST', '/api/auth/force-password-change', { new_password: pw });
    state.token = result.token; state.user = result.user;
    localStorage.setItem('roc_token', result.token);
    showApp();
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Set Password & Continue';
  }
}

function showResetBanner(msg, type) {
  const el = document.getElementById('reset-banner');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${esc(msg)}</div>`;
  el.style.display = 'block';
}
