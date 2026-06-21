/* ═══════════════════════════════════════════════════════════════
   CORE — state, utils, router, theme, API, nav
   ═══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────────
const state = {
  user: null,
  token: localStorage.getItem('roc_token') || null,
  page: null,
  settings: {},
};

// ── Roles ─────────────────────────────────────────────────────────
const PM_ROLES = ['pm_admin', 'pm_user'];
function isPM(user) { return PM_ROLES.includes(user?.role); }
function isPMAdmin(user) { return user?.role === 'pm_admin'; }
function isTenantAdmin(user) { return user?.role === 'tenant_admin'; }

// ── Utils ─────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function fmt(iso, opts) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('en-US', opts || { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}
function fmtDate(iso) { return fmt(iso, { month:'short', day:'numeric', year:'numeric' }); }
function fmtTime(iso) { return fmt(iso, { hour:'numeric', minute:'2-digit' }); }
function fmtDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function initials(n) {
  if (!n) return '?';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Toasts ────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  el.innerHTML = `<span style="flex:1">${icons[type] || 'ℹ'} ${esc(msg)}</span><button class="toast-close" onclick="this.parentNode.remove()">×</button>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ── Modal ─────────────────────────────────────────────────────────
function showModal(html, onOpen) {
  document.getElementById('modal-inner').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-box').scrollTop = 0;
  if (onOpen) onOpen();
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ── Page content ──────────────────────────────────────────────────
function setContent(html) { document.getElementById('page-content').innerHTML = html; }
function setHeader(title, subtitle) {
  document.getElementById('page-title-area').innerHTML =
    `<div class="page-title">${esc(title)}</div>${subtitle ? `<div class="page-subtitle">${esc(subtitle)}</div>` : ''}`;
}
function heroHtml(title, subtitle, icon) {
  return `<div class="page-hero"><div class="page-hero-dots"></div><div class="page-hero-content"><div class="page-hero-icon">${icon}</div><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></div></div>`;
}

// ── API ───────────────────────────────────────────────────────────
async function apiFetch(method, url, body, isFormData) {
  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401) {
    if (state.token) {
      // Mid-session expiry — clear everything and redirect to login
      state.token = null; state.user = null;
      localStorage.removeItem('roc_token');
      localStorage.removeItem('roc_admin_token');
      showAuth('login');
      throw new Error('Session expired — please sign in again');
    }
    // Login attempt with bad credentials — just throw the server's message
    throw new Error(data.error || 'Authentication failed');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Badges ────────────────────────────────────────────────────────
function statusBadge(s) {
  const map = {
    open: ['info', 'Open'],
    in_progress: ['warning', 'In Progress'],
    pending_tenant: ['purple', 'Pending You'],
    resolved: ['success', 'Resolved'],
    closed: ['gray', 'Closed'],
    confirmed: ['success', 'Confirmed'],
    cancelled: ['danger', 'Cancelled'],
  };
  const [cls, label] = map[s] || ['gray', s];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function priorityBadge(p) {
  const map = { urgent: 'danger', high: 'warning', medium: 'info', low: 'gray' };
  return `<span class="badge badge-${map[p] || 'gray'}">${esc(p)}</span>`;
}

function buildingTag(b) {
  if (!b) return '';
  return `<span class="building-tag building-${b}">📍 ${esc(b)} W. Randolph</span>`;
}

function roleBadge(role) {
  const map = {
    pm_admin: ['danger', 'PM Admin'],
    pm_user: ['warning', 'PM Staff'],
    tenant_admin: ['primary', 'Tenant Admin'],
    tenant_user: ['gray', 'Tenant User'],
  };
  const [cls, label] = map[role] || ['gray', role];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

// ── Theme ─────────────────────────────────────────────────────────
function applyTheme(s) {
  if (!s) return;
  const root = document.documentElement;
  if (s.primary_color) root.style.setProperty('--primary', s.primary_color);
  if (s.primary_light) root.style.setProperty('--primary-light', s.primary_light);
  if (s.primary_dark)  root.style.setProperty('--primary-dark', s.primary_dark);
  if (s.accent_color)  root.style.setProperty('--accent', s.accent_color);
  if (s.bg_color)      root.style.setProperty('--bg', s.bg_color);
  if (s.sidebar_bg)    root.style.setProperty('--sidebar-bg', s.sidebar_bg);

  if (s.font_family && s.font_family !== 'system') {
    const existing = document.getElementById('portal-font');
    if (existing) existing.remove();
    const link = document.createElement('link');
    link.id = 'portal-font'; link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.font_family)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
    root.style.setProperty('--font', `'${s.font_family}',-apple-system,sans-serif`);
  }
}

function updateBranding(s) {
  if (!s) return;
  renderSiteBanner(s);
  const name = s.building_name || 'Randolph Office Center';
  const tag  = s.building_tagline || 'Tenant Portal';

  ['auth-brand-name', 'sb-name'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = name; });
  ['auth-brand-tagline', 'sb-tag'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = tag; });
  document.title = name + ' — Tenant Portal';

  if (s.logo_type === 'image' && s.logo_url) {
    ['auth-brand-icon', 'sb-icon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<img src="${esc(s.logo_url)}" alt="Logo" style="height:2rem;object-fit:contain">`;
    });
  }
}

// ── Sidebar helpers ────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.add('hidden');
}

// ── Navigation ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  { page: 'dashboard',      icon: '⊞',   label: 'Dashboard',         section: null },
  { page: 'requests',       icon: '🔧',  label: 'Service Requests',  section: null },
  { page: 'announcements',  icon: '📢',  label: 'Announcements',     section: null },
  { page: 'bookings',       icon: '📅',  label: 'Amenity Booking',   section: null },
  { page: 'directory',      icon: '🏢',  label: 'Building Directory',section: null },
  { page: 'leases',         icon: '📋',  label: 'Leases',            section: 'PM', roles: ['pm_admin'] },
  { page: 'admin',          icon: '⚙️',  label: 'Admin Panel',       section: 'PM', roles: ['pm_admin'] },
];

function renderNav() {
  const user = state.user;
  if (!user) return;
  const nav = document.getElementById('sidebar-nav');
  let html = '';
  let lastSection = '';

  for (const item of NAV_ITEMS) {
    if (item.roles && !item.roles.includes(user.role)) continue;
    if (item.section && item.section !== lastSection) {
      html += `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section;
    } else if (!item.section && lastSection) {
      lastSection = '';
    }
    const active = state.page === item.page ? 'active' : '';
    html += `<button class="nav-btn ${active}" data-page="${item.page}">
      <span style="font-size:1rem;width:18px;text-align:center">${item.icon}</span>
      ${esc(item.label)}
    </button>`;
  }

  nav.innerHTML = html;
  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { closeSidebar(); navigate(btn.dataset.page); });
  });

  // Sidebar user widget
  const u = state.user;
  const roleLabels = { pm_admin: 'PM Admin', pm_user: 'PM Staff', tenant_admin: 'Tenant Admin', tenant_user: 'Tenant' };
  const tenantName = u.tenant_name ? ` · ${u.tenant_name}` : '';
  document.getElementById('sidebar-user').innerHTML = `
    <div class="sidebar-avatar">${initials(u.name)}</div>
    <div class="sidebar-user-info">
      <div class="sidebar-user-name">${esc(u.name)}</div>
      <div class="sidebar-user-role">${roleLabels[u.role] || u.role}${tenantName}</div>
    </div>`;
}

// ── Router ─────────────────────────────────────────────────────────
const ROUTES = {};
function route(name, fn) { ROUTES[name] = fn; }

async function navigate(page, params = {}) {
  state.page = page;
  closeSidebar();
  renderNav();
  const fn = ROUTES[page];
  if (!fn) return navigate('dashboard');
  setContent('<div class="loading-center"><div class="spinner spinner-lg"></div></div>');
  try { await fn(params); }
  catch (e) { setContent(`<div class="empty-state"><div class="empty-title">Error loading page</div><div class="empty-desc">${esc(e.message)}</div></div>`); }
}

// ── Site Banner ────────────────────────────────────────────────────
function renderSiteBanner(s) {
  const existing = document.getElementById('site-banner');
  if (existing) existing.remove();

  if (s.banner_enabled !== 'true' && s.banner_enabled !== '1') return;

  const height = parseInt(s.banner_height) || 180;
  const hasImage = !!s.banner_image_url;
  const hasText  = s.banner_title || s.banner_subtitle;

  const inner = hasImage
    ? `<img src="${esc(s.banner_image_url)}" alt="${esc(s.banner_title || 'Banner')}"
          style="width:100%;height:100%;object-fit:cover;display:block">`
    : `<div style="width:100%;height:100%;background:var(--primary)"></div>`;

  const overlay = hasText ? `
    <div class="site-banner-text">
      ${s.banner_title    ? `<div class="site-banner-title">${esc(s.banner_title)}</div>` : ''}
      ${s.banner_subtitle ? `<div class="site-banner-sub">${esc(s.banner_subtitle)}</div>` : ''}
    </div>` : '';

  const banner = document.createElement('div');
  banner.id = 'site-banner';
  banner.style.height = height + 'px';
  if (s.banner_link_url) {
    banner.style.cursor = 'pointer';
    banner.onclick = () => {
      const url = s.banner_link_url;
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
    };
  }
  banner.innerHTML = inner + overlay;

  const pageContent = document.getElementById('page-content');
  if (pageContent) pageContent.parentNode.insertBefore(banner, pageContent);
}

// ── JWT client-side decode (no signature verify — read-only) ──────
function decodeJWTPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return {}; }
}

// ── Impersonation ──────────────────────────────────────────────────
function renderImpersonationBanner() {
  const existing = document.getElementById('impersonation-bar');
  if (existing) existing.remove();
  if (!state.user?.impersonatedBy) return;

  const bar = document.createElement('div');
  bar.id = 'impersonation-bar';
  bar.innerHTML = `
    <span style="display:flex;align-items:center;gap:8px">
      <span style="font-size:1rem">👁</span>
      <span>Viewing as <strong>${esc(state.user.name)}</strong>
        (${esc(state.user.tenant_name || state.user.role)}) —
        impersonated by ${esc(state.user.impersonatedByName)}
      </span>
    </span>
    <button onclick="exitImpersonation()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:inherit;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:.8rem;font-weight:600">
      Exit &amp; Return to Admin
    </button>`;
  document.getElementById('app-shell').prepend(bar);
}

async function exitImpersonation() {
  const adminToken = localStorage.getItem('roc_admin_token');
  if (!adminToken) { signOut(); return; }
  state.token = adminToken;
  localStorage.setItem('roc_token', adminToken);
  localStorage.removeItem('roc_admin_token');
  try {
    state.user = await apiFetch('GET', '/api/auth/me');
  } catch {
    signOut(); return;
  }
  renderImpersonationBanner();
  renderNav();
  navigate('dashboard');
  toast(`Returned to admin account`, 'success');
}

// ── App show/hide ──────────────────────────────────────────────────
function showAuth(mode) {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('maintenance-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  renderAuthCard(mode);
}

function showMaintenance(s) {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('auth-screen').classList.add('hidden');
  const el = document.getElementById('maintenance-screen');
  const name = s?.building_name || 'Randolph Office Center';
  const msg  = s?.maintenance_message || 'The portal is temporarily offline for scheduled maintenance. Please check back later.';
  el.innerHTML = `
    <div style="text-align:center;max-width:500px;padding:40px 24px">
      <div style="font-size:3rem;margin-bottom:20px">🔧</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--gray-900);margin-bottom:6px">${esc(name)}</div>
      <div style="font-size:1rem;font-weight:600;color:var(--gray-600);margin-bottom:18px">Scheduled Maintenance</div>
      <p style="color:var(--gray-500);line-height:1.7;margin-bottom:32px">${esc(msg)}</p>
      <button onclick="showStaffLogin()" style="background:none;border:none;color:var(--gray-400);font-size:.8rem;cursor:pointer;text-decoration:underline">Staff Access</button>
    </div>`;
  el.classList.remove('hidden');
}

function showStaffLogin() {
  document.getElementById('maintenance-screen').classList.add('hidden');
  showAuth('login');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  renderImpersonationBanner();
  renderSiteBanner(state.settings);
  renderNav();
  navigate('dashboard');
}

function signOut() {
  state.token = null; state.user = null;
  localStorage.removeItem('roc_token');
  localStorage.removeItem('roc_admin_token');
  showAuth('login');
}
