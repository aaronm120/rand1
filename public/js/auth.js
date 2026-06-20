/* ═══════════════════════════════════════════════════════
   AUTH — login form, renderAuthCard
   ═══════════════════════════════════════════════════════ */

function renderAuthCard() {
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
      <div class="auth-links" style="margin-top:20px;font-size:.8rem;color:var(--gray-400)">
        Contact building management if you need access.
      </div>
    </div>`;

  // Allow Enter key to submit
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
