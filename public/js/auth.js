/* ═══════════════════════════════════════════════════════
   AUTH — login, forgot password, reset password
   ═══════════════════════════════════════════════════════ */

function renderAuthCard(mode) {
  if (mode === 'forgot') { renderForgotPasswordForm(); return; }
  if (mode === 'reset')  { renderResetPasswordForm();  return; }

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
}

async function doLogin() {
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-btn');
  if (!email || !password) { showAuthError('Email and password are required'); return; }

  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { token, user } = await apiFetch('POST', '/api/auth/login', { email, password });
    state.token = token; state.user = user;
    localStorage.setItem('roc_token', token);
    errEl.style.display = 'none';
    showApp();
  } catch (e) {
    showAuthError(e.message);
    btn.disabled = false; btn.textContent = 'Sign in';
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
          <input id="reset-pw" class="form-input" type="password" placeholder="At least 8 characters" autocomplete="new-password">
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
  if (!pw || !confirm) { errEl.textContent = 'Both fields are required'; errEl.style.display = 'block'; return; }
  if (pw !== confirm)  { errEl.textContent = 'Passwords do not match';  errEl.style.display = 'block'; return; }
  if (pw.length < 8)   { errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display = 'block'; return; }

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

function showResetBanner(msg, type) {
  const el = document.getElementById('reset-banner');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${esc(msg)}</div>`;
  el.style.display = 'block';
}
