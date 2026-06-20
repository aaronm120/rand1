/* =====================================================
   RANDOLPH OFFICE CENTER — TENANT PORTAL
   ===================================================== */

// ── STATE ────────────────────────────────────────────
const state = {
  user: null,
  token: localStorage.getItem('roc_token') || null,
  page: null,
  pageParams: {},
  settings: {},
};

// ── THEME PRESETS ────────────────────────────────────
const THEME_PRESETS = [
  { id:'navy',     name:'Navy Pro',    primary:'#1B3A6B', primary_light:'#2752A0', primary_dark:'#0F2040', accent_color:'#C9922A', bg_color:'#F0F4F9', sidebar_bg:'#0F2040' },
  { id:'ocean',    name:'Ocean',       primary:'#0369A1', primary_light:'#0891B2', primary_dark:'#0C4A6E', accent_color:'#0EA5E9', bg_color:'#F0F9FF', sidebar_bg:'#0C4A6E' },
  { id:'forest',   name:'Forest',      primary:'#166534', primary_light:'#16A34A', primary_dark:'#052E16', accent_color:'#CA8A04', bg_color:'#F0FDF4', sidebar_bg:'#052E16' },
  { id:'burgundy', name:'Burgundy',    primary:'#881337', primary_light:'#BE123C', primary_dark:'#4C0519', accent_color:'#B45309', bg_color:'#FFF5F5', sidebar_bg:'#4C0519' },
  { id:'slate',    name:'Slate',       primary:'#334155', primary_light:'#475569', primary_dark:'#0F172A', accent_color:'#3B82F6', bg_color:'#F8FAFC', sidebar_bg:'#0F172A' },
  { id:'violet',   name:'Violet',      primary:'#5B21B6', primary_light:'#7C3AED', primary_dark:'#2E1065', accent_color:'#DB2777', bg_color:'#FAF5FF', sidebar_bg:'#2E1065' },
  { id:'charcoal', name:'Charcoal',    primary:'#374151', primary_light:'#4B5563', primary_dark:'#111827', accent_color:'#06B6D4', bg_color:'#F9FAFB', sidebar_bg:'#111827' },
  { id:'custom',   name:'Custom',      primary:null },
];

const AVAILABLE_FONTS = [
  { value:'system',           label:'System Default' },
  { value:'Inter',            label:'Inter' },
  { value:'Roboto',           label:'Roboto' },
  { value:'Open Sans',        label:'Open Sans' },
  { value:'Lato',             label:'Lato' },
  { value:'Poppins',          label:'Poppins' },
  { value:'Nunito',           label:'Nunito' },
  { value:'Montserrat',       label:'Montserrat' },
  { value:'DM Sans',          label:'DM Sans' },
  { value:'Plus Jakarta Sans',label:'Plus Jakarta Sans' },
  { value:'Raleway',          label:'Raleway' },
];

// ── UTILS ─────────────────────────────────────────────
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fmt(iso,opts){ if(!iso)return'—'; const d=new Date(iso); return isNaN(d)?iso:d.toLocaleString('en-US',opts||{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); }
function fmtDate(iso){ return fmt(iso,{month:'short',day:'numeric',year:'numeric'}); }
function fmtTime(iso){ return fmt(iso,{hour:'numeric',minute:'2-digit'}); }
function initials(n){ if(!n)return'?'; return n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function getMonthShort(iso){ return new Date(iso).toLocaleString('en-US',{month:'short'}).toUpperCase(); }
function getDayNum(iso){ return new Date(iso).getDate(); }

function toast(msg, type=''){
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = {success:'✓',error:'✕',warning:'⚠'};
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span style="flex:1">${esc(msg)}</span><button class="toast-close" onclick="this.parentNode.remove()">×</button>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(), 4500);
}

function showModal(html, onOpen){
  document.getElementById('modal-inner').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-box').scrollTop = 0;
  if(onOpen) onOpen();
}
function closeModal(){ document.getElementById('modal-overlay').classList.add('hidden'); }

function setContent(html){ document.getElementById('page-content').innerHTML = html; }
function setHeader(title, subtitle){
  document.getElementById('page-title-area').innerHTML =
    `<div class="page-title">${esc(title)}</div>${subtitle?`<div class="page-subtitle">${esc(subtitle)}</div>`:''}`;
}

function heroHtml(title, subtitle, icon){
  const s = state.settings||{};
  const hasImg = s.hero_style==='image' && s.hero_image_url;
  return `<div class="page-hero">
    ${hasImg?`<div class="page-hero-bg-img" style="background-image:url(${esc(s.hero_image_url)})"></div><div class="page-hero-overlay"></div>`:''}
    <div class="page-hero-dots"></div>
    <div class="page-hero-content">
      <div class="page-hero-icon">${icon}</div>
      <div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>
    </div>
  </div>`;
}

// ── THEME ENGINE ──────────────────────────────────────
function loadGoogleFont(family){
  const el = document.getElementById('portal-font');
  if(el) el.remove();
  if(!family || family==='system'){
    document.documentElement.style.setProperty('--font','-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif');
    return;
  }
  const link = document.createElement('link');
  link.id = 'portal-font'; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
  document.documentElement.style.setProperty('--font',`'${family}',-apple-system,sans-serif`);
}

function applyTheme(s){
  const r = document.documentElement;
  if(s.primary_color) r.style.setProperty('--primary', s.primary_color);
  if(s.primary_light)  r.style.setProperty('--primary-light', s.primary_light);
  if(s.primary_dark)   r.style.setProperty('--primary-dark', s.primary_dark);
  if(s.primary_dark)   r.style.setProperty('--hero-from', s.primary_dark);
  if(s.primary_light)  r.style.setProperty('--hero-to', s.primary_light);
  if(s.accent_color)   r.style.setProperty('--accent', s.accent_color);
  if(s.bg_color)       r.style.setProperty('--bg', s.bg_color);
  if(s.sidebar_bg)     r.style.setProperty('--sidebar-bg', s.sidebar_bg);
  if(s.font_family)    loadGoogleFont(s.font_family);
}

function updateBranding(s){
  document.title = s.building_name || 'Tenant Portal';
  const logoAbbr = (s.building_name||'ROC').split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase();
  const logoImg  = s.logo_type==='image' && s.logo_url ? `<img src="${esc(s.logo_url)}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:6px">` : null;

  // Auth left panel
  const ahl = document.getElementById('auth-left-heading');
  const als = document.getElementById('auth-left-sub');
  const alo = document.getElementById('auth-left-logo');
  const abg = document.getElementById('auth-left-bg');
  if(ahl) ahl.textContent = s.building_name||'Randolph Office Center';
  if(als) als.textContent = s.welcome_message||'Your all-in-one tenant portal for booking spaces and managing building requests.';
  if(alo) alo.innerHTML  = logoImg || logoAbbr;
  if(abg && s.auth_bg_type==='image' && s.auth_bg_url) abg.style.backgroundImage=`url(${s.auth_bg_url})`;

  // Sidebar brand
  const sbb = document.getElementById('sb-brand-badge');
  const sbn = document.getElementById('sb-brand-name');
  const sbs = document.getElementById('sb-brand-sub');
  if(sbb) sbb.innerHTML = logoImg || logoAbbr;
  if(sbn) sbn.textContent = s.building_name||'Randolph Office Center';
  if(sbs) sbs.textContent = s.building_tagline||'Tenant Portal';
}

// ── API ───────────────────────────────────────────────
async function apiFetch(method, url, body){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(state.token) opts.headers['Authorization']='Bearer '+state.token;
  if(body) opts.body=JSON.stringify(body);
  const res = await fetch(url,opts);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Request failed');
  return data;
}
async function uploadImage(file){
  const fd = new FormData(); fd.append('image',file);
  const res = await fetch('/api/settings/upload',{method:'POST',headers:{'Authorization':'Bearer '+state.token},body:fd});
  if(!res.ok) throw new Error('Upload failed');
  return (await res.json()).url;
}
const api = {
  login:(e,p)=>apiFetch('POST','/api/auth/login',{email:e,password:p}),
  register:d=>apiFetch('POST','/api/auth/register',d),
  getMe:()=>apiFetch('GET','/api/auth/me'),
  updateProfile:d=>apiFetch('PUT','/api/auth/profile',d),
  changePassword:d=>apiFetch('PUT','/api/auth/password',d),
  getUsers:()=>apiFetch('GET','/api/auth/users'),
  updateUser:(id,d)=>apiFetch('PUT',`/api/auth/users/${id}`,d),
  getResources:()=>apiFetch('GET','/api/resources'),
  getResource:id=>apiFetch('GET',`/api/resources/${id}`),
  createResource:d=>apiFetch('POST','/api/resources',d),
  updateResource:(id,d)=>apiFetch('PUT',`/api/resources/${id}`,d),
  getMyReservations:()=>apiFetch('GET','/api/reservations'),
  getAllReservations:()=>apiFetch('GET','/api/reservations?all=true'),
  getAvailability:(rid,date)=>apiFetch('GET',`/api/reservations/availability?resourceId=${rid}&date=${date}`),
  createReservation:d=>apiFetch('POST','/api/reservations',d),
  cancelReservation:id=>apiFetch('PUT',`/api/reservations/${id}/cancel`),
  getMyTickets:()=>apiFetch('GET','/api/tickets'),
  getAllTickets:()=>apiFetch('GET','/api/tickets?all=true'),
  createTicket:d=>apiFetch('POST','/api/tickets',d),
  updateTicket:(id,d)=>apiFetch('PUT',`/api/tickets/${id}`,d),
  getSettings:()=>apiFetch('GET','/api/settings'),
  saveSettings:d=>apiFetch('PUT','/api/settings',d),
};

// ── BADGE HELPERS ─────────────────────────────────────
function statusBadge(s){
  const m={confirmed:['success','Confirmed'],cancelled:['gray','Cancelled'],open:['info','Open'],in_progress:['purple','In Progress'],on_hold:['warning','On Hold'],resolved:['success','Resolved'],closed:['gray','Closed']};
  const[c,l]=m[s]||['gray',s]; return `<span class="badge badge-${c}">${l}</span>`;
}
function priorityBadge(p){ const m={urgent:'danger',high:'warning',medium:'info',low:'success'}; return `<span class="badge badge-${m[p]||'gray'}">${esc(p)}</span>`; }
function categoryLabel(c){ const m={maintenance:'Maintenance',electrical:'Electrical',plumbing:'Plumbing',hvac:'HVAC',cleaning:'Cleaning',security:'Security',internet:'Internet/IT',elevator:'Elevator',parking:'Parking',other:'Other'}; return m[c]||c; }
function resTypeLabel(t){ const m={conference_room:'Conference Room',training_room:'Training Room',event_space:'Event Space',kitchen:'Kitchen'}; return m[t]||t; }
function resEmoji(t){ const m={conference_room:'🤝',training_room:'📋',event_space:'🌆',kitchen:'🍽️'}; return m[t]||'🏢'; }
function resImgClass(type,image){
  if(image==='boardroom') return 'board';
  if(image==='rooftop')   return 'event';
  if(image==='kitchen')   return 'kitchen';
  if(image==='training')  return 'train';
  if(image==='conference')return 'conf';
  const m={conference_room:'conf',training_room:'train',event_space:'event',kitchen:'kitchen'}; return m[type]||'default';
}

// ── NAVIGATION ────────────────────────────────────────
const NAV_TENANT = [
  {id:'dashboard',       icon:'🏠', label:'Dashboard'},
  {id:'resources',       icon:'📅', label:'Reserve a Space'},
  {id:'my-reservations', icon:'🗓️', label:'My Reservations'},
  {sep:true},
  {id:'new-ticket',      icon:'🔧', label:'Submit a Request'},
  {id:'my-tickets',      icon:'📋', label:'My Requests'},
  {sep:true},
  {id:'profile',         icon:'👤', label:'My Profile'},
];
const NAV_ADMIN = [
  {id:'dashboard',         icon:'🏠', label:'Dashboard'},
  {id:'resources',         icon:'📅', label:'Reserve a Space'},
  {id:'my-reservations',   icon:'🗓️', label:'My Reservations'},
  {sep:true},
  {id:'new-ticket',        icon:'🔧', label:'Submit a Request'},
  {id:'my-tickets',        icon:'📋', label:'My Requests'},
  {sep:true, label:'Admin'},
  {id:'admin-tickets',     icon:'🎫', label:'Manage Requests'},
  {id:'admin-reservations',icon:'📆', label:'All Reservations'},
  {id:'admin-resources',   icon:'🏛️', label:'Manage Spaces'},
  {id:'admin-users',       icon:'👥', label:'Tenant Users'},
  {sep:true},
  {id:'personalize',       icon:'🎨', label:'Personalize Portal'},
  {id:'profile',           icon:'⚙️', label:'Settings'},
];

function renderNav(){
  const nav = state.user?.role==='admin' ? NAV_ADMIN : NAV_TENANT;
  let html = '';
  for(const item of nav){
    if(item.sep){ html += item.label ? `<div class="nav-section-label">${esc(item.label)}</div>` : `<hr class="sidebar-sep">`; }
    else{ html += `<button class="nav-item${state.page===item.id?' active':''}" data-page="${item.id}"><span class="nav-icon">${item.icon}</span>${esc(item.label)}</button>`; }
  }
  const navEl = document.getElementById('sidebar-nav');
  navEl.innerHTML = html;
  navEl.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click',()=>{ closeSidebarMobile(); navigate(btn.dataset.page); });
  });
  const u = state.user;
  document.getElementById('sidebar-user').innerHTML = `
    <div class="user-avatar">${esc(initials(u?.name))}</div>
    <div class="user-details">
      <div class="user-name">${esc(u?.name)}</div>
      <div class="user-role">${u?.role==='admin'?'Building Admin':(u?.unit_number||'Tenant')}</div>
    </div>
    <button class="btn-signout" id="signout-btn" title="Sign Out">⏏</button>`;
  document.getElementById('signout-btn').addEventListener('click', signOut);
  const avatarBtn = document.getElementById('header-avatar-btn');
  if(avatarBtn){ avatarBtn.textContent=initials(u?.name); avatarBtn.onclick=()=>navigate('profile'); }
  updateBranding(state.settings);
}

// ── ROUTER ────────────────────────────────────────────
const pages = {
  'dashboard':           pageDashboard,
  'resources':           pageResources,
  'book-resource':       pageBookResource,
  'my-reservations':     pageMyReservations,
  'new-ticket':          pageNewTicket,
  'my-tickets':          pageMyTickets,
  'profile':             pageProfile,
  'admin-tickets':       pageAdminTickets,
  'admin-reservations':  pageAdminReservations,
  'admin-resources':     pageAdminResources,
  'admin-users':         pageAdminUsers,
  'personalize':         pagePersonalize,
};
async function navigate(page, params={}){
  state.page=page; state.pageParams=params;
  renderNav();
  const fn = pages[page];
  if(!fn) return navigate('dashboard');
  setContent(`<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`);
  try{ await fn(params); } catch(e){ setContent(`<div style="padding:1.75rem"><div class="alert alert-danger"><span class="alert-icon">⚠</span><div>${esc(e.message)}</div></div></div>`); }
}

// ── AUTH ──────────────────────────────────────────────
function showAuth(mode='login'){
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  updateBranding(state.settings);
  renderAuthCard(mode);
}
function showApp(){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderNav();
  navigate('dashboard');
}
function signOut(){ localStorage.removeItem('roc_token'); state.token=null; state.user=null; showAuth('login'); }

function renderAuthCard(mode){
  const card = document.getElementById('auth-card');
  const s = state.settings||{};
  const logoAbbr = (s.building_name||'ROC').split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase();
  const badgeHtml = s.logo_type==='image'&&s.logo_url ? `<img src="${esc(s.logo_url)}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:5px">` : logoAbbr;

  if(mode==='login'){
    card.innerHTML=`
      <div class="auth-form-logo">
        <div class="auth-form-badge">${badgeHtml}</div>
        <span class="auth-form-brand">${esc(s.building_name||'Randolph Office Center')}</span>
      </div>
      <h2>Welcome back</h2>
      <p class="auth-form-sub">Sign in to your tenant portal account</p>
      <div id="auth-err" class="alert alert-danger" style="display:none"><span class="alert-icon">⚠</span><div id="auth-err-msg"></div></div>
      <form id="login-form">
        <div class="form-group"><label class="form-label">Email Address <span class="req">*</span></label>
          <input class="form-control" type="email" id="l-email" placeholder="you@company.com" required autocomplete="email"></div>
        <div class="form-group"><label class="form-label">Password <span class="req">*</span></label>
          <input class="form-control" type="password" id="l-pass" placeholder="••••••••" required autocomplete="current-password"></div>
        <button class="btn btn-primary btn-block btn-xl" type="submit" id="login-btn" style="margin-top:.25rem">Sign In</button>
      </form>
      <div class="auth-switch">Don't have an account? <button id="to-register">Create one here</button></div>`;
    document.getElementById('login-form').addEventListener('submit', async e=>{
      e.preventDefault();
      const btn=document.getElementById('login-btn'), err=document.getElementById('auth-err'), msg=document.getElementById('auth-err-msg');
      err.style.display='none'; btn.disabled=true; btn.textContent='Signing in…';
      try{
        const{token,user}=await api.login(document.getElementById('l-email').value, document.getElementById('l-pass').value);
        localStorage.setItem('roc_token',token); state.token=token; state.user=user; showApp();
      }catch(ex){ msg.textContent=ex.message; err.style.display='flex'; btn.disabled=false; btn.textContent='Sign In'; }
    });
    document.getElementById('to-register').addEventListener('click',()=>renderAuthCard('register'));
  } else {
    card.innerHTML=`
      <div class="auth-form-logo">
        <div class="auth-form-badge">${badgeHtml}</div>
        <span class="auth-form-brand">${esc(s.building_name||'Randolph Office Center')}</span>
      </div>
      <h2>Create an account</h2>
      <p class="auth-form-sub">Register to access the tenant portal</p>
      <div id="auth-err" class="alert alert-danger" style="display:none"><span class="alert-icon">⚠</span><div id="auth-err-msg"></div></div>
      <form id="reg-form">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full Name <span class="req">*</span></label><input class="form-control" type="text" id="r-name" required></div>
          <div class="form-group"><label class="form-label">Email <span class="req">*</span></label><input class="form-control" type="email" id="r-email" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Company</label><input class="form-control" type="text" id="r-company"></div>
          <div class="form-group"><label class="form-label">Suite / Unit</label><input class="form-control" type="text" id="r-unit"></div>
        </div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-control" type="tel" id="r-phone"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Password <span class="req">*</span></label><input class="form-control" type="password" id="r-pass" required></div>
          <div class="form-group"><label class="form-label">Confirm <span class="req">*</span></label><input class="form-control" type="password" id="r-conf" required></div>
        </div>
        <button class="btn btn-primary btn-block btn-xl" type="submit" id="reg-btn">Create Account</button>
      </form>
      <div class="auth-switch">Already have an account? <button id="to-login">Sign in here</button></div>`;
    document.getElementById('reg-form').addEventListener('submit', async e=>{
      e.preventDefault();
      const btn=document.getElementById('reg-btn'), err=document.getElementById('auth-err'), msg=document.getElementById('auth-err-msg');
      err.style.display='none';
      const pw=document.getElementById('r-pass').value, cf=document.getElementById('r-conf').value;
      if(pw!==cf){ msg.textContent='Passwords do not match'; err.style.display='flex'; return; }
      btn.disabled=true; btn.textContent='Creating…';
      try{
        const{token,user}=await api.register({name:document.getElementById('r-name').value,email:document.getElementById('r-email').value,password:pw,company:document.getElementById('r-company').value,unit_number:document.getElementById('r-unit').value,phone:document.getElementById('r-phone').value});
        localStorage.setItem('roc_token',token); state.token=token; state.user=user; showApp();
      }catch(ex){ msg.textContent=ex.message; err.style.display='flex'; btn.disabled=false; btn.textContent='Create Account'; }
    });
    document.getElementById('to-login').addEventListener('click',()=>renderAuthCard('login'));
  }
}

// ── DASHBOARD ─────────────────────────────────────────
async function pageDashboard(){
  setHeader('Dashboard');
  const[reservations,tickets]=await Promise.all([api.getMyReservations(),api.getMyTickets()]);
  const s=state.settings||{};
  const now=new Date();
  const upcoming=reservations.filter(r=>r.status==='confirmed'&&new Date(r.start_time)>=now);
  const active=tickets.filter(t=>!['resolved','closed'].includes(t.status));
  const ann = s.announcement;
  setContent(`
    ${heroHtml(s.welcome_headline||'Welcome to Your Tenant Portal', s.welcome_message||'', '🏢')}
    <div class="page-body-inset">
      ${ann?`<div class="alert alert-${s.announcement_type||'info'}" style="margin-bottom:1.25rem"><span class="alert-icon">📢</span><div>${esc(ann)}</div></div>`:''}
      <div class="stats-grid" style="margin-bottom:1.25rem">
        <div class="stat-card blue">  <div class="stat-icon blue">📅</div><div><div class="stat-value">${upcoming.length}</div><div class="stat-label">Upcoming Bookings</div></div></div>
        <div class="stat-card orange"><div class="stat-icon orange">🎫</div><div><div class="stat-value">${active.length}</div><div class="stat-label">Active Requests</div></div></div>
        <div class="stat-card red">   <div class="stat-icon red">🔓</div><div><div class="stat-value">${tickets.filter(t=>t.status==='open').length}</div><div class="stat-label">Open Tickets</div></div></div>
        <div class="stat-card green"> <div class="stat-icon green">✅</div><div><div class="stat-value">${tickets.filter(t=>t.status==='resolved').length}</div><div class="stat-label">Resolved</div></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
        <div class="card">
          <div class="card-header"><div class="card-title">Upcoming Reservations</div><button class="btn btn-sm btn-secondary" onclick="navigate('resources')">+ Book Space</button></div>
          <div style="padding:${upcoming.length?'.4rem 0':'0'}">
            ${upcoming.length?upcoming.slice(0,5).map(r=>`
              <div class="res-card" style="margin:.25rem .75rem;border-radius:10px">
                <div class="res-date"><div class="res-date-mon">${getMonthShort(r.start_time)}</div><div class="res-date-day">${getDayNum(r.start_time)}</div></div>
                <div class="res-info"><div class="res-name">${esc(r.resource_name)}</div><div class="res-time">${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}</div><div class="res-purpose">${esc(r.title)}</div></div>
                ${statusBadge(r.status)}
              </div>`).join('')
            :`<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">No upcoming reservations</div><div class="empty-desc">Book a common area space for your next meeting.</div></div>`}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Recent Requests</div><button class="btn btn-sm btn-secondary" onclick="navigate('new-ticket')">+ New Request</button></div>
          <div style="padding:${tickets.length?'.4rem .75rem':'0'}">
            ${tickets.length?tickets.slice(0,5).map(t=>`
              <div class="ticket-card ${t.priority}" style="cursor:pointer;margin-bottom:.5rem" onclick="navigate('my-tickets')">
                <div class="tc-top"><div><div class="tc-title">${esc(t.title)}</div><div class="tc-meta" style="margin-top:.15rem"><span>${esc(categoryLabel(t.category))}</span><span>${fmtDate(t.created_at)}</span></div></div>
                <div class="tc-badges">${priorityBadge(t.priority)}${statusBadge(t.status)}</div></div>
              </div>`).join('')
            :`<div class="empty-state"><div class="empty-icon">🔧</div><div class="empty-title">No requests yet</div><div class="empty-desc">Submit a service request for building assistance.</div></div>`}
          </div>
        </div>
      </div>
      <div class="alert alert-info" style="margin-top:1.25rem">
        <span class="alert-icon">🕐</span>
        <div><strong>Building Hours:</strong> ${esc(s.building_hours||'Mon–Fri 7:00 AM – 9:00 PM · Sat 8:00 AM – 6:00 PM · Sun Closed')}
        &nbsp;|&nbsp; <strong>Emergency:</strong> ${esc(s.emergency_phone||'(555) 200-0000')}</div>
      </div>
    </div>`);
}

// ── RESOURCES ─────────────────────────────────────────
async function pageResources(){
  setHeader('Reserve a Space');
  const resources = await api.getResources();
  setContent(`
    ${heroHtml('Reserve a Space','Book conference rooms, event spaces, and building amenities','📅')}
    <div class="page-body-inset">
      <div class="resource-grid">
        ${resources.map(r=>{
          const cls = resImgClass(r.type,r.image);
          const hasImg = r.image_url;
          return `<div class="resource-card">
            <div class="resource-img ${cls}">
              ${hasImg?`<div class="resource-img-bg" style="background-image:url(${esc(r.image_url)})"></div><div class="resource-img-overlay"></div>`:''}
              <span class="resource-img-emoji">${resEmoji(r.type)}</span>
            </div>
            <div class="resource-body">
              <div class="resource-name">${esc(r.name)}</div>
              <div class="resource-meta">
                <span class="badge badge-info">${esc(resTypeLabel(r.type))}</span>
                ${r.capacity?`<span class="badge badge-gray">👥 Up to ${r.capacity}</span>`:''}
              </div>
              <div class="resource-location">📍 ${esc(r.location||'See details')}</div>
              <div class="resource-amenity-list">
                ${r.amenities?r.amenities.split(',').slice(0,5).map(a=>`<span class="amenity-chip">${esc(a.trim())}</span>`).join(''):''}
                ${r.amenities&&r.amenities.split(',').length>5?`<span class="amenity-chip">+${r.amenities.split(',').length-5} more</span>`:''}
              </div>
              <div class="resource-actions">
                <button class="btn btn-secondary btn-sm" onclick="showResourceDetail(${r.id})">Details</button>
                <button class="btn btn-primary btn-sm" onclick="navigate('book-resource',{id:${r.id}})">Reserve Now →</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`);
}

window.showResourceDetail = async function(id){
  const r = await api.getResource(id);
  const cls = resImgClass(r.type,r.image);
  const hasImg = r.image_url;
  const amenities = r.amenities?r.amenities.split(','):[];
  showModal(`
    <div class="modal-header"><div class="modal-title">${esc(r.name)}</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="resource-img ${cls}" style="height:130px;border-radius:10px;margin-bottom:1.1rem">
        ${hasImg?`<div class="resource-img-bg" style="background-image:url(${esc(r.image_url)})"></div><div class="resource-img-overlay"></div>`:''}
        <span class="resource-img-emoji">${resEmoji(r.type)}</span>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.85rem">
        <span class="badge badge-info">${esc(resTypeLabel(r.type))}</span>
        ${r.capacity?`<span class="badge badge-gray">👥 Capacity: ${r.capacity}</span>`:''}
        ${r.location?`<span class="badge badge-gray">📍 ${esc(r.location)}</span>`:''}
      </div>
      <p style="font-size:.9rem;color:var(--text-light);margin-bottom:1rem">${esc(r.description||'')}</p>
      ${amenities.length?`<div style="margin-bottom:1rem"><div class="form-label">Amenities</div><div class="resource-amenity-list">${amenities.map(a=>`<span class="amenity-chip">✓ ${esc(a.trim())}</span>`).join('')}</div></div>`:''}
      ${r.rules?`<div class="alert alert-warning"><span class="alert-icon">📜</span><div><strong>Booking Rules:</strong> ${esc(r.rules)}</div></div>`:''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();navigate('book-resource',{id:${r.id}})">Reserve This Space →</button>
    </div>`);
};

// ── BOOK RESOURCE ─────────────────────────────────────
async function pageBookResource({id}={}){
  if(!id) return navigate('resources');
  const resource = await api.getResource(id);
  setHeader('Reserve a Space', resource.name);
  const today = new Date().toISOString().split('T')[0];
  setContent(`
    ${heroHtml('Book: '+resource.name, '📍 '+( resource.location||''), '📅')}
    <div class="page-body-inset">
      <div style="max-width:680px;margin:0 auto">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${esc(resource.name)}</div>
              <div style="font-size:.77rem;color:var(--text-light);margin-top:.2rem">
                ${resource.location?`📍 ${esc(resource.location)} &nbsp;|&nbsp;`:''}
                ${resource.capacity?`👥 Up to ${resource.capacity} people`:''}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="navigate('resources')">← Back</button>
          </div>
          <div class="card-body">
            ${resource.rules?`<div class="alert alert-warning mb-2"><span class="alert-icon">📜</span><div style="font-size:.82rem">${esc(resource.rules)}</div></div>`:''}
            <form id="book-form">
              <div class="form-group">
                <label class="form-label">Purpose / Title <span class="req">*</span></label>
                <input class="form-control" type="text" id="b-title" placeholder="e.g. Client Presentation, Team Standup" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Date <span class="req">*</span></label>
                  <input class="form-control" type="date" id="b-date" min="${today}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Attendees</label>
                  <input class="form-control" type="number" id="b-attendees" min="1" max="${resource.capacity||100}" value="1">
                </div>
              </div>
              <div id="avail-section" class="hidden">
                <div class="form-label" style="margin-bottom:.4rem">
                  Available Slots <span style="font-size:.72rem;color:var(--text-muted);font-weight:400">— click a slot to pre-fill start time</span>
                </div>
                <div id="slot-grid" class="slot-grid"></div>
                <div class="form-row" style="margin-top:.7rem">
                  <div class="form-group">
                    <label class="form-label">Start Time <span class="req">*</span></label>
                    <select class="form-control" id="b-start" required><option value="">Select start time</option></select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">End Time <span class="req">*</span></label>
                    <select class="form-control" id="b-end" required><option value="">Select end time</option></select>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Notes (optional)</label>
                <textarea class="form-control" id="b-notes" placeholder="Special requirements, setup needs, catering…"></textarea>
              </div>
              <div id="book-err" class="alert alert-danger hidden"><span class="alert-icon">⚠</span><div id="book-err-msg"></div></div>
              <div style="display:flex;gap:.75rem">
                <button type="submit" class="btn btn-primary btn-lg" id="b-submit" disabled>Confirm Reservation</button>
                <button type="button" class="btn btn-ghost btn-lg" onclick="navigate('resources')">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>`);

  document.getElementById('b-date').addEventListener('change',()=>loadAvailability(id));
  document.getElementById('b-start').addEventListener('change', updateEndTimes);
  document.getElementById('book-form').addEventListener('submit', async e=>{
    e.preventDefault();
    const err=document.getElementById('book-err'), msg=document.getElementById('book-err-msg');
    err.classList.add('hidden');
    const date=document.getElementById('b-date').value, start=document.getElementById('b-start').value, end=document.getElementById('b-end').value;
    if(!start||!end){ msg.textContent='Please select a start and end time.'; err.classList.remove('hidden'); return; }
    const btn=document.getElementById('b-submit'); btn.disabled=true; btn.textContent='Confirming…';
    try{
      await api.createReservation({resource_id:id,title:document.getElementById('b-title').value,start_time:`${date}T${start}:00`,end_time:`${date}T${end}:00`,attendees:document.getElementById('b-attendees').value,notes:document.getElementById('b-notes').value});
      toast('Reservation confirmed!','success'); navigate('my-reservations');
    }catch(ex){ msg.textContent=ex.message; err.classList.remove('hidden'); btn.disabled=false; btn.textContent='Confirm Reservation'; }
  });
}

async function loadAvailability(resourceId){
  const date=document.getElementById('b-date').value; if(!date) return;
  document.getElementById('avail-section').classList.remove('hidden');
  document.getElementById('slot-grid').innerHTML='<div class="loading" style="padding:.6rem"><div class="spinner"></div></div>';
  const existing = await api.getAvailability(resourceId,date);
  const booked = existing.map(r=>({start:r.start_time.slice(11,16),end:r.end_time.slice(11,16)}));
  const slots=[];
  for(let h=7;h<21;h++) for(const m of[0,30]){
    const t=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    slots.push({t,busy:booked.some(b=>t>=b.start&&t<b.end)});
  }
  document.getElementById('slot-grid').innerHTML=slots.map(s=>`
    <div class="time-slot ${s.busy?'booked':'avail'}" data-time="${s.t}" ${s.busy?'title="Already booked"':''}>
      ${fmt12(s.t)}
    </div>`).join('');
  document.querySelectorAll('.time-slot.avail').forEach(el=>{
    el.addEventListener('click',()=>{
      document.querySelectorAll('.time-slot').forEach(t=>t.classList.remove('selected'));
      el.classList.add('selected');
      fillStartTimes(slots, el.dataset.time);
    });
  });
  fillStartTimes(slots,null);
  document.getElementById('b-submit').disabled=false;
}
function fillStartTimes(slots, preSelect){
  const sel=document.getElementById('b-start');
  sel.innerHTML='<option value="">Select start time</option>';
  slots.filter(s=>!s.busy).forEach(s=>{ const o=document.createElement('option'); o.value=s.t; o.textContent=fmt12(s.t); if(s.t===preSelect)o.selected=true; sel.appendChild(o); });
  updateEndTimes();
}
function updateEndTimes(){
  const sv=document.getElementById('b-start').value, sel=document.getElementById('b-end');
  sel.innerHTML='<option value="">Select end time</option>';
  if(!sv) return;
  for(let h=7;h<=21;h++) for(const m of[0,30]){
    const t=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    if(t>sv){ const o=document.createElement('option'); o.value=t; o.textContent=fmt12(t); sel.appendChild(o); }
  }
  const[sh,sm]=sv.split(':').map(Number);
  const et=`${String(sh+1).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
  if(sh+1<=21) sel.value=et;
}
function fmt12(t){ const[h,m]=t.split(':').map(Number); const ap=h<12?'AM':'PM'; const h12=h===0?12:h>12?h-12:h; return `${h12}:${String(m).padStart(2,'0')} ${ap}`; }

// ── MY RESERVATIONS ───────────────────────────────────
async function pageMyReservations(){
  setHeader('My Reservations');
  const reservations = await api.getMyReservations();
  const now=new Date();
  const upcoming=reservations.filter(r=>r.status==='confirmed'&&new Date(r.start_time)>=now);
  const past=reservations.filter(r=>r.status!=='confirmed'||new Date(r.start_time)<now);
  const resRow=(r,cancellable)=>`
    <div class="res-card" style="margin:.25rem .75rem;border-radius:10px">
      <div class="res-date"><div class="res-date-mon">${getMonthShort(r.start_time)}</div><div class="res-date-day">${getDayNum(r.start_time)}</div></div>
      <div class="res-info">
        <div class="res-name">${esc(r.resource_name)}</div>
        <div class="res-time">${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}${r.resource_location?` · ${esc(r.resource_location)}`:''}</div>
        <div class="res-purpose">${esc(r.title)}${r.attendees>1?` · ${r.attendees} attendees`:''}</div>
      </div>
      <div class="res-actions">${statusBadge(r.status)}${cancellable&&r.status==='confirmed'?`<button class="btn btn-danger btn-sm" onclick="confirmCancel(${r.id})">Cancel</button>`:''}</div>
    </div>`;
  setContent(`
    ${heroHtml('My Reservations','View and manage your space bookings','🗓️')}
    <div class="page-body-inset">
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header"><div class="card-title">Upcoming (${upcoming.length})</div><button class="btn btn-primary btn-sm" onclick="navigate('resources')">+ New Reservation</button></div>
        <div style="padding:${upcoming.length?'.4rem 0':'0'}">
          ${upcoming.length?upcoming.map(r=>resRow(r,true)).join(''):`<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">No upcoming reservations</div></div>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">History (${past.length})</div></div>
        <div style="padding:${past.length?'.4rem 0':'0'}">
          ${past.length?past.map(r=>resRow(r,false)).join(''):`<div class="empty-state"><div class="empty-icon">🗓️</div><div class="empty-title">No past reservations</div></div>`}
        </div>
      </div>
    </div>`);
}

window.confirmCancel = function(id){
  showModal(`
    <div class="modal-header"><div class="modal-title">Cancel Reservation</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><p>Are you sure you want to cancel this reservation? This cannot be undone.</p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Keep It</button>
      <button class="btn btn-danger" id="do-cancel">Yes, Cancel</button>
    </div>`);
  document.getElementById('do-cancel').addEventListener('click', async()=>{
    try{ await api.cancelReservation(id); closeModal(); toast('Reservation cancelled.','success'); pageMyReservations(); }
    catch(e){ toast(e.message,'error'); }
  });
};

// ── NEW TICKET ────────────────────────────────────────
async function pageNewTicket(){
  setHeader('Submit a Request');
  const s=state.settings||{};
  setContent(`
    ${heroHtml('Submit a Service Request','Report issues or request building services','🔧')}
    <div class="page-body-inset">
      <div style="max-width:680px;margin:0 auto">
        <div class="card">
          <div class="card-header"><div class="card-title">New Service Request</div></div>
          <div class="card-body">
            <div class="alert alert-info mb-2">
              <span class="alert-icon">ℹ</span>
              <div>For emergencies call <strong>${esc(s.emergency_phone||'(555) 200-0000')}</strong> immediately. For routine requests, use this form and we'll respond within 1–2 business days.</div>
            </div>
            <form id="ticket-form">
              <div class="form-group">
                <label class="form-label">Request Title <span class="req">*</span></label>
                <input class="form-control" type="text" id="t-title" placeholder="Brief description of the issue" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Category <span class="req">*</span></label>
                  <select class="form-control" id="t-cat" required>
                    <option value="">Select category</option>
                    <option value="maintenance">🔨 Maintenance</option>
                    <option value="electrical">⚡ Electrical</option>
                    <option value="plumbing">🚿 Plumbing</option>
                    <option value="hvac">🌡️ HVAC / Climate</option>
                    <option value="cleaning">🧹 Cleaning</option>
                    <option value="security">🔒 Security</option>
                    <option value="internet">💻 Internet / IT</option>
                    <option value="elevator">🛗 Elevator</option>
                    <option value="parking">🅿️ Parking</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Priority</label>
                  <select class="form-control" id="t-pri">
                    <option value="low">🟢 Low</option>
                    <option value="medium" selected>🔵 Medium</option>
                    <option value="high">🟡 High</option>
                    <option value="urgent">🔴 Urgent / Safety</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Suite / Unit</label>
                  <input class="form-control" type="text" id="t-unit" value="${esc(state.user?.unit_number||'')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Specific Location</label>
                  <input class="form-control" type="text" id="t-loc" placeholder="e.g. 4th floor restroom">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Description <span class="req">*</span></label>
                <textarea class="form-control" id="t-desc" rows="5" placeholder="Describe the issue in detail — when it started, severity, what you've tried…" required></textarea>
              </div>
              <div id="ticket-err" class="alert alert-danger hidden"><span class="alert-icon">⚠</span><div id="ticket-err-msg"></div></div>
              <div style="display:flex;gap:.75rem">
                <button type="submit" class="btn btn-primary btn-lg" id="t-submit">Submit Request</button>
                <button type="button" class="btn btn-ghost btn-lg" onclick="navigate('my-tickets')">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>`);
  document.getElementById('ticket-form').addEventListener('submit', async e=>{
    e.preventDefault();
    const err=document.getElementById('ticket-err'), msg=document.getElementById('ticket-err-msg'), btn=document.getElementById('t-submit');
    err.classList.add('hidden'); btn.disabled=true; btn.textContent='Submitting…';
    try{
      await api.createTicket({title:document.getElementById('t-title').value,category:document.getElementById('t-cat').value,priority:document.getElementById('t-pri').value,unit_number:document.getElementById('t-unit').value,location:document.getElementById('t-loc').value,description:document.getElementById('t-desc').value});
      toast('Request submitted!','success'); navigate('my-tickets');
    }catch(ex){ msg.textContent=ex.message; err.classList.remove('hidden'); btn.disabled=false; btn.textContent='Submit Request'; }
  });
}

// ── MY TICKETS ────────────────────────────────────────
async function pageMyTickets(){
  setHeader('My Requests');
  const tickets = await api.getMyTickets();
  let filter='all';
  setContent(`
    ${heroHtml('My Service Requests','Track the status of your submitted requests','📋')}
    <div class="page-body-inset">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem">
        <div class="filter-row">
          ${['all','open','in_progress','on_hold','resolved','closed'].map(f=>`<button class="filter-chip${f===filter?' active':''}" data-f="${f}">${f==='all'?'All':f.replace('_',' ')}</button>`).join('')}
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigate('new-ticket')">+ New Request</button>
      </div>
      <div id="tlist"></div>
    </div>`);
  function renderList(){
    const list=filter==='all'?tickets:tickets.filter(t=>t.status===filter);
    document.getElementById('tlist').innerHTML = list.length
      ?`<div class="ticket-list">${list.map(t=>`
          <div class="ticket-card ${t.priority}" onclick="showTicketDetail(${t.id})">
            <div class="tc-top">
              <div>
                <div class="tc-title">${esc(t.title)}</div>
                <div class="tc-meta" style="margin-top:.2rem"><span>#${t.id}</span><span>${esc(categoryLabel(t.category))}</span><span>${fmtDate(t.created_at)}</span>${t.unit_number?`<span>${esc(t.unit_number)}</span>`:''}</div>
              </div>
              <div class="tc-badges">${priorityBadge(t.priority)}${statusBadge(t.status)}</div>
            </div>
            <div class="tc-desc">${esc(t.description)}</div>
            ${t.admin_notes?`<div class="alert alert-info" style="margin-top:.5rem;padding:.4rem .75rem;font-size:.78rem;margin-bottom:0"><strong>Management:</strong> ${esc(t.admin_notes)}</div>`:''}
          </div>`).join('')}</div>`
      :`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No requests found</div></div>`;
  }
  renderList();
  document.querySelectorAll('.filter-chip[data-f]').forEach(btn=>{
    btn.addEventListener('click',()=>{ document.querySelectorAll('.filter-chip[data-f]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); filter=btn.dataset.f; renderList(); });
  });
}
window.showTicketDetail = async function(id){
  const tickets=await api.getMyTickets();
  const t=tickets.find(x=>x.id===id); if(!t) return;
  showModal(`
    <div class="modal-header"><div><div class="modal-title">Ticket #${t.id}</div><div style="font-size:.8rem;color:var(--text-light)">${esc(t.title)}</div></div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">${statusBadge(t.status)}${priorityBadge(t.priority)}<span class="badge badge-gray">${esc(categoryLabel(t.category))}</span></div>
      <div class="detail-grid">
        <div class="detail-item"><label>Submitted</label><span>${fmtDate(t.created_at)}</span></div>
        <div class="detail-item"><label>Last Updated</label><span>${fmtDate(t.updated_at)}</span></div>
        <div class="detail-item"><label>Unit</label><span>${esc(t.unit_number||'—')}</span></div>
        <div class="detail-item"><label>Location</label><span>${esc(t.location||'—')}</span></div>
        <div class="detail-item full"><label>Description</label><span style="white-space:pre-wrap">${esc(t.description)}</span></div>
      </div>
      ${t.admin_notes?`<div class="alert alert-info"><span class="alert-icon">💬</span><div><strong>Response from Building Management:</strong><br>${esc(t.admin_notes)}</div></div>`:''}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`);
};

// ── PROFILE ───────────────────────────────────────────
async function pageProfile(){
  setHeader('My Profile');
  const user=await api.getMe();
  setContent(`
    ${heroHtml('My Profile','Manage your account and preferences','👤')}
    <div class="page-body-inset" style="max-width:640px;margin:0 auto">
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header"><div class="card-title">Personal Information</div></div>
        <div class="card-body">
          <form id="pf-form">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Full Name <span class="req">*</span></label><input class="form-control" type="text" id="pf-name" value="${esc(user.name)}" required></div>
              <div class="form-group"><label class="form-label">Email</label><input class="form-control" type="email" value="${esc(user.email)}" disabled><div class="form-hint">Email cannot be changed.</div></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Company</label><input class="form-control" type="text" id="pf-company" value="${esc(user.company||'')}"></div>
              <div class="form-group"><label class="form-label">Suite / Unit</label><input class="form-control" type="text" id="pf-unit" value="${esc(user.unit_number||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-control" type="tel" id="pf-phone" value="${esc(user.phone||'')}"></div>
            <div id="pf-msg"></div>
            <button type="submit" class="btn btn-primary" id="pf-save">Save Changes</button>
          </form>
        </div>
      </div>
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header"><div class="card-title">Change Password</div></div>
        <div class="card-body">
          <form id="pw-form">
            <div class="form-group"><label class="form-label">Current Password <span class="req">*</span></label><input class="form-control" type="password" id="pw-cur" required></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">New Password <span class="req">*</span></label><input class="form-control" type="password" id="pw-new" required></div>
              <div class="form-group"><label class="form-label">Confirm New <span class="req">*</span></label><input class="form-control" type="password" id="pw-conf" required></div>
            </div>
            <div id="pw-msg"></div>
            <button type="submit" class="btn btn-secondary" id="pw-save">Update Password</button>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="detail-grid">
            <div class="detail-item"><label>Account Type</label><span>${user.role==='admin'?'Building Admin':'Tenant'}</span></div>
            <div class="detail-item"><label>Member Since</label><span>${fmtDate(user.created_at)}</span></div>
          </div>
          <hr class="divider">
          <button class="btn btn-danger btn-sm" onclick="signOut()">Sign Out</button>
        </div>
      </div>
    </div>`);
  document.getElementById('pf-form').addEventListener('submit', async e=>{
    e.preventDefault(); const btn=document.getElementById('pf-save'); btn.disabled=true; btn.textContent='Saving…';
    try{
      const upd=await api.updateProfile({name:document.getElementById('pf-name').value,company:document.getElementById('pf-company').value,unit_number:document.getElementById('pf-unit').value,phone:document.getElementById('pf-phone').value});
      state.user={...state.user,...upd}; renderNav();
      document.getElementById('pf-msg').innerHTML='<div class="alert alert-success mt-1"><span class="alert-icon">✓</span><div>Profile saved.</div></div>';
      toast('Profile saved!','success');
    }catch(ex){ document.getElementById('pf-msg').innerHTML=`<div class="alert alert-danger mt-1"><span class="alert-icon">⚠</span><div>${esc(ex.message)}</div></div>`; }
    btn.disabled=false; btn.textContent='Save Changes';
  });
  document.getElementById('pw-form').addEventListener('submit', async e=>{
    e.preventDefault(); const btn=document.getElementById('pw-save');
    const nw=document.getElementById('pw-new').value, cf=document.getElementById('pw-conf').value;
    if(nw!==cf){ document.getElementById('pw-msg').innerHTML='<div class="alert alert-danger mt-1"><span class="alert-icon">⚠</span><div>Passwords do not match.</div></div>'; return; }
    btn.disabled=true; btn.textContent='Updating…';
    try{
      await api.changePassword({current_password:document.getElementById('pw-cur').value,new_password:nw});
      document.getElementById('pw-form').reset();
      document.getElementById('pw-msg').innerHTML='<div class="alert alert-success mt-1"><span class="alert-icon">✓</span><div>Password updated.</div></div>';
      toast('Password updated!','success');
    }catch(ex){ document.getElementById('pw-msg').innerHTML=`<div class="alert alert-danger mt-1"><span class="alert-icon">⚠</span><div>${esc(ex.message)}</div></div>`; }
    btn.disabled=false; btn.textContent='Update Password';
  });
}

// ── ADMIN: TICKETS ────────────────────────────────────
async function pageAdminTickets(){
  if(state.user?.role!=='admin') return navigate('dashboard');
  setHeader('Manage Requests');
  const tickets=await api.getAllTickets();
  let filter='open';
  const cnt={all:tickets.length,open:0,in_progress:0,on_hold:0,resolved:0,closed:0};
  tickets.forEach(t=>{ if(cnt[t.status]!==undefined)cnt[t.status]++; });
  setContent(`
    ${heroHtml('Manage Service Requests','Review and action all tenant requests','🎫')}
    <div class="page-body-inset">
      <div class="stats-grid" style="margin-bottom:1.25rem">
        <div class="stat-card blue">  <div class="stat-icon blue">📬</div><div><div class="stat-value">${cnt.open}</div><div class="stat-label">Open</div></div></div>
        <div class="stat-card purple"><div class="stat-icon purple">⚙️</div><div><div class="stat-value">${cnt.in_progress}</div><div class="stat-label">In Progress</div></div></div>
        <div class="stat-card orange"><div class="stat-icon orange">⏸</div><div><div class="stat-value">${cnt.on_hold}</div><div class="stat-label">On Hold</div></div></div>
        <div class="stat-card green"><div class="stat-icon green">✅</div><div><div class="stat-value">${cnt.resolved}</div><div class="stat-label">Resolved</div></div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="filter-row">
            ${['all','open','in_progress','on_hold','resolved','closed'].map(f=>`<button class="filter-chip${f===filter?' active':''}" data-f="${f}">${f.replace('_',' ')} ${f!=='all'?`(${cnt[f]||0})`:''}</button>`).join('')}
          </div>
        </div>
        <div id="admin-tlist"></div>
      </div>
    </div>`);
  function renderList(){
    const list=filter==='all'?tickets:tickets.filter(t=>t.status===filter);
    document.getElementById('admin-tlist').innerHTML = list.length
      ?`<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Title</th><th>Tenant</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>${list.map(t=>`<tr>
            <td style="color:var(--text-muted);font-size:.78rem">#${t.id}</td>
            <td><div class="fw-700 fs-sm">${esc(t.title)}</div>${t.unit_number?`<div style="font-size:.72rem;color:var(--text-muted)">${esc(t.unit_number)}</div>`:''}</td>
            <td><div class="fs-sm">${esc(t.user_name||'—')}</div><div style="font-size:.72rem;color:var(--text-muted)">${esc(t.user_email||'')}</div></td>
            <td><span class="badge badge-gray">${esc(categoryLabel(t.category))}</span></td>
            <td>${priorityBadge(t.priority)}</td><td>${statusBadge(t.status)}</td>
            <td style="font-size:.76rem;color:var(--text-muted)">${fmtDate(t.created_at)}</td>
            <td><button class="btn btn-sm btn-secondary" onclick="adminUpdateTicket(${t.id})">Update</button></td>
          </tr>`).join('')}</tbody></table></div>`
      :`<div class="empty-state"><div class="empty-icon">🎫</div><div class="empty-title">No tickets</div></div>`;
  }
  renderList();
  document.querySelectorAll('.filter-chip[data-f]').forEach(btn=>{
    btn.addEventListener('click',()=>{ document.querySelectorAll('.filter-chip[data-f]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); filter=btn.dataset.f; renderList(); });
  });
}
window.adminUpdateTicket = async function(id){
  const tickets=await api.getAllTickets(); const t=tickets.find(x=>x.id===id); if(!t) return;
  showModal(`
    <div class="modal-header"><div><div class="modal-title">Update Ticket #${t.id}</div><div style="font-size:.8rem;color:var(--text-light)">${esc(t.user_name)} · ${esc(t.user_email)}</div></div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="alert alert-info" style="margin-bottom:1rem"><span class="alert-icon">📝</span><div style="font-size:.82rem"><strong>${esc(t.title)}</strong><br><span style="white-space:pre-wrap">${esc(t.description)}</span></div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Status</label><select class="form-control" id="at-status">
          ${['open','in_progress','on_hold','resolved','closed'].map(s=>`<option value="${s}"${t.status===s?' selected':''}>${s.replace('_',' ')}</option>`).join('')}
        </select></div>
        <div class="form-group"><label class="form-label">Priority</label><select class="form-control" id="at-pri">
          ${['low','medium','high','urgent'].map(p=>`<option value="${p}"${t.priority===p?' selected':''}>${p}</option>`).join('')}
        </select></div>
      </div>
      <div class="form-group"><label class="form-label">Assigned To</label><input class="form-control" type="text" id="at-assigned" value="${esc(t.assigned_to||'')}"></div>
      <div class="form-group"><label class="form-label">Admin Notes <span style="font-weight:400;font-size:.75rem">(visible to tenant)</span></label>
        <textarea class="form-control" id="at-notes" rows="4">${esc(t.admin_notes||'')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-at">Save Changes</button></div>`);
  document.getElementById('save-at').addEventListener('click', async()=>{
    try{ await api.updateTicket(id,{status:document.getElementById('at-status').value,priority:document.getElementById('at-pri').value,assigned_to:document.getElementById('at-assigned').value,admin_notes:document.getElementById('at-notes').value}); closeModal(); toast('Ticket updated!','success'); pageAdminTickets(); }
    catch(e){ toast(e.message,'error'); }
  });
};

// ── ADMIN: RESERVATIONS ───────────────────────────────
async function pageAdminReservations(){
  if(state.user?.role!=='admin') return navigate('dashboard');
  setHeader('All Reservations');
  const all=await api.getAllReservations();
  const now=new Date();
  const up=all.filter(r=>r.status==='confirmed'&&new Date(r.start_time)>=now);
  setContent(`
    ${heroHtml('All Reservations','View and manage every building reservation','📆')}
    <div class="page-body-inset">
      <div class="stats-grid" style="margin-bottom:1.25rem">
        <div class="stat-card blue"><div class="stat-icon blue">📅</div><div><div class="stat-value">${up.length}</div><div class="stat-label">Upcoming</div></div></div>
        <div class="stat-card gold"><div class="stat-icon gold">📊</div><div><div class="stat-value">${all.length}</div><div class="stat-label">Total</div></div></div>
        <div class="stat-card red"><div class="stat-icon red">❌</div><div><div class="stat-value">${all.filter(r=>r.status==='cancelled').length}</div><div class="stat-label">Cancelled</div></div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          ${all.length?`<table><thead><tr><th>Space</th><th>Tenant</th><th>Purpose</th><th>Date & Time</th><th>People</th><th>Status</th><th></th></tr></thead>
          <tbody>${all.map(r=>`<tr>
            <td><div class="fw-700 fs-sm">${esc(r.resource_name)}</div><div style="font-size:.72rem;color:var(--text-muted)">${esc(r.resource_location||'')}</div></td>
            <td><div class="fs-sm">${esc(r.user_name||'—')}</div><div style="font-size:.72rem;color:var(--text-muted)">${esc(r.user_unit||'')}</div></td>
            <td class="fs-sm">${esc(r.title)}</td>
            <td><div class="fs-sm" style="white-space:nowrap">${fmtDate(r.start_time)}</div><div style="font-size:.72rem;color:var(--text-muted)">${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}</div></td>
            <td style="text-align:center">${r.attendees||1}</td>
            <td>${statusBadge(r.status)}</td>
            <td>${r.status==='confirmed'?`<button class="btn btn-sm btn-danger" onclick="adminCancelRes(${r.id})">Cancel</button>`:''}</td>
          </tr>`).join('')}</tbody></table>`
          :`<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">No reservations yet</div></div>`}
        </div>
      </div>
    </div>`);
}
window.adminCancelRes = async function(id){
  if(!confirm('Cancel this reservation?')) return;
  try{ await api.cancelReservation(id); toast('Cancelled.','success'); pageAdminReservations(); }
  catch(e){ toast(e.message,'error'); }
};

// ── ADMIN: RESOURCES ──────────────────────────────────
async function pageAdminResources(){
  if(state.user?.role!=='admin') return navigate('dashboard');
  setHeader('Manage Spaces');
  const resources=await api.getResources();
  setContent(`
    ${heroHtml('Manage Spaces','Add, edit, and configure reservable spaces','🏛️')}
    <div class="page-body-inset">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1rem">
        <div class="section-title">All Spaces (${resources.length})</div>
        <button class="btn btn-primary" onclick="adminAddResource()">+ Add Space</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Capacity</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${resources.map(r=>`<tr>
            <td><div class="fw-700">${esc(r.name)}</div><div style="font-size:.72rem;color:var(--text-muted)">${esc((r.description||'').slice(0,55))}…</div></td>
            <td><span class="badge badge-info">${esc(resTypeLabel(r.type))}</span></td>
            <td class="fs-sm">${esc(r.location||'—')}</td>
            <td style="text-align:center">${r.capacity||'—'}</td>
            <td>${r.is_active?'<span class="badge badge-success">Active</span>':'<span class="badge badge-gray">Inactive</span>'}</td>
            <td style="display:flex;gap:.4rem">
              <button class="btn btn-sm btn-secondary" onclick="adminEditResource(${r.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="adminToggleResource(${r.id},${r.is_active})">${r.is_active?'Deactivate':'Activate'}</button>
            </td>
          </tr>`).join('')}</tbody></table>
        </div>
      </div>
    </div>`);
}
function resourceModal(r={}, onSave){
  showModal(`
    <div class="modal-header"><div class="modal-title">${r.id?'Edit Space':'Add New Space'}</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name <span class="req">*</span></label><input class="form-control" type="text" id="rf-name" value="${esc(r.name||'')}" required></div>
        <div class="form-group"><label class="form-label">Type <span class="req">*</span></label>
          <select class="form-control" id="rf-type">
            ${['conference_room','training_room','event_space','kitchen'].map(t=>`<option value="${t}"${r.type===t?' selected':''}>${resTypeLabel(t)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Location</label><input class="form-control" type="text" id="rf-loc" value="${esc(r.location||'')}"></div>
        <div class="form-group"><label class="form-label">Capacity</label><input class="form-control" type="number" id="rf-cap" value="${r.capacity||''}" min="1"></div>
      </div>
      <div class="form-group"><label class="form-label">Header Image URL</label><input class="form-control" type="text" id="rf-img" value="${esc(r.image_url||'')}" placeholder="https://… (optional custom photo)"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-control" id="rf-desc" rows="3">${esc(r.description||'')}</textarea></div>
      <div class="form-group"><label class="form-label">Amenities <span style="font-weight:400;font-size:.75rem">(comma-separated)</span></label><input class="form-control" type="text" id="rf-amen" value="${esc(r.amenities||'')}" placeholder="Projector, Whiteboard, WiFi"></div>
      <div class="form-group"><label class="form-label">Booking Rules</label><textarea class="form-control" id="rf-rules" rows="3">${esc(r.rules||'')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-rf">${r.id?'Save Changes':'Add Space'}</button></div>`);
  document.getElementById('save-rf').addEventListener('click', async()=>{
    const data={name:document.getElementById('rf-name').value,type:document.getElementById('rf-type').value,location:document.getElementById('rf-loc').value,capacity:document.getElementById('rf-cap').value||null,image_url:document.getElementById('rf-img').value||null,description:document.getElementById('rf-desc').value,amenities:document.getElementById('rf-amen').value,rules:document.getElementById('rf-rules').value};
    if(!data.name){ toast('Name is required','error'); return; }
    await onSave(data);
  });
}
window.adminAddResource = ()=>resourceModal({}, async d=>{ try{ await api.createResource(d); closeModal(); toast('Space added!','success'); pageAdminResources(); }catch(e){ toast(e.message,'error'); } });
window.adminEditResource = async id=>{ const r=await api.getResource(id); resourceModal(r, async d=>{ try{ await api.updateResource(id,{...d,is_active:r.is_active}); closeModal(); toast('Space updated!','success'); pageAdminResources(); }catch(e){ toast(e.message,'error'); } }); };
window.adminToggleResource = async function(id,isActive){
  if(!confirm(`${isActive?'Deactivate':'Activate'} this space?`)) return;
  try{ const r=await api.getResource(id); await api.updateResource(id,{...r,is_active:isActive?0:1}); toast('Done.','success'); pageAdminResources(); }catch(e){ toast(e.message,'error'); }
};

// ── ADMIN: USERS ──────────────────────────────────────
async function pageAdminUsers(){
  if(state.user?.role!=='admin') return navigate('dashboard');
  setHeader('Tenant Users');
  const users=await api.getUsers();
  setContent(`
    ${heroHtml('Tenant Users','Manage all registered tenant accounts','👥')}
    <div class="page-body-inset">
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Suite</th><th>Phone</th><th>Role</th><th>Joined</th><th></th></tr></thead>
          <tbody>${users.map(u=>`<tr>
            <td><div style="display:flex;align-items:center;gap:.5rem"><div class="user-avatar" style="width:30px;height:30px;font-size:.68rem;background:var(--primary-light)">${esc(initials(u.name))}</div><span class="fw-700 fs-sm">${esc(u.name)}</span></div></td>
            <td class="fs-sm">${esc(u.email)}</td>
            <td class="fs-sm">${esc(u.company||'—')}</td>
            <td class="fs-sm">${esc(u.unit_number||'—')}</td>
            <td class="fs-sm">${esc(u.phone||'—')}</td>
            <td><span class="badge ${u.role==='admin'?'badge-purple':'badge-info'}">${u.role}</span></td>
            <td style="font-size:.75rem;color:var(--text-muted)">${fmtDate(u.created_at)}</td>
            <td>${u.id!==state.user?.id?`<button class="btn btn-sm btn-secondary" onclick="adminEditUser(${u.id})">Edit</button>`:''}</td>
          </tr>`).join('')}</tbody></table>
        </div>
      </div>
    </div>`);
}
window.adminEditUser = async function(id){
  const users=await api.getUsers(); const u=users.find(x=>x.id===id); if(!u) return;
  showModal(`
    <div class="modal-header"><div class="modal-title">Edit: ${esc(u.name)}</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input class="form-control" type="text" id="eu-name" value="${esc(u.name)}"></div>
        <div class="form-group"><label class="form-label">Role</label><select class="form-control" id="eu-role"><option value="tenant"${u.role==='tenant'?' selected':''}>Tenant</option><option value="admin"${u.role==='admin'?' selected':''}>Admin</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Company</label><input class="form-control" type="text" id="eu-company" value="${esc(u.company||'')}"></div>
        <div class="form-group"><label class="form-label">Suite</label><input class="form-control" type="text" id="eu-unit" value="${esc(u.unit_number||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-control" type="tel" id="eu-phone" value="${esc(u.phone||'')}"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-eu">Save</button></div>`);
  document.getElementById('save-eu').addEventListener('click', async()=>{
    try{ await api.updateUser(id,{name:document.getElementById('eu-name').value,role:document.getElementById('eu-role').value,company:document.getElementById('eu-company').value,unit_number:document.getElementById('eu-unit').value,phone:document.getElementById('eu-phone').value}); closeModal(); toast('User updated!','success'); pageAdminUsers(); }
    catch(e){ toast(e.message,'error'); }
  });
};

// ── PERSONALIZE ───────────────────────────────────────
async function pagePersonalize(){
  if(state.user?.role!=='admin') return navigate('dashboard');
  setHeader('Personalize Portal');

  const saved = await api.getSettings();
  state.settings = {...saved};
  let pending = {...saved};

  function setPending(key, val){ pending[key]=val; applyTheme(pending); updateBranding(pending); }

  setContent(`
    ${heroHtml('Personalize Portal','Customize the look, branding, and content of your tenant portal','🎨')}
    <div style="padding:1.75rem 1.75rem 5rem">
      <div class="persona-layout">

        <!-- Section nav -->
        <div class="persona-nav" id="persona-nav">
          <button class="persona-nav-item active" data-sec="branding"><span class="persona-nav-icon">🏷️</span> Branding</button>
          <button class="persona-nav-item" data-sec="colors"><span class="persona-nav-icon">🎨</span> Colors & Theme</button>
          <button class="persona-nav-item" data-sec="typography"><span class="persona-nav-icon">🔤</span> Typography</button>
          <button class="persona-nav-item" data-sec="images"><span class="persona-nav-icon">🖼️</span> Images</button>
          <button class="persona-nav-item" data-sec="info"><span class="persona-nav-icon">🏢</span> Building Info</button>
        </div>

        <!-- Sections -->
        <div id="persona-content">

          <!-- BRANDING -->
          <div class="persona-section active" id="sec-branding">
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Building Identity</div><div class="persona-card-desc">Set the name, tagline, and logo displayed throughout the portal</div></div>
              <div class="persona-card-body">
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Building Name</label><input class="form-control" id="p-bname" value="${esc(saved.building_name||'')}"></div>
                  <div class="form-group"><label class="form-label">Portal Tagline</label><input class="form-control" id="p-btagline" value="${esc(saved.building_tagline||'')}"></div>
                </div>
                <div class="form-group">
                  <label class="form-label">Logo Style</label>
                  <div style="display:flex;gap:1.5rem;margin-top:.25rem">
                    <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem"><input type="radio" name="logo-type" value="text" id="lt-text" ${saved.logo_type!=='image'?'checked':''}>Text (initials)</label>
                    <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem"><input type="radio" name="logo-type" value="image" id="lt-image" ${saved.logo_type==='image'?'checked':''}>Custom image</label>
                  </div>
                </div>
                <div id="logo-img-section" style="display:${saved.logo_type==='image'?'block':'none'}">
                  <div class="form-group">
                    <label class="form-label">Logo Image</label>
                    <div class="img-upload-row">
                      <input class="form-control" type="text" id="p-logo-url" value="${esc(saved.logo_url||'')}" placeholder="https://… or upload">
                      <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">Upload <input type="file" id="logo-file" accept="image/*" style="display:none"></label>
                    </div>
                    <img id="logo-preview-img" class="img-preview${saved.logo_url?' show':''}" src="${esc(saved.logo_url||'')}" alt="Logo">
                  </div>
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <label class="form-label">Sidebar Preview</label>
                  <div class="logo-preview-box">
                    <div class="logo-prev-badge" id="lp-badge">${saved.logo_type==='image'&&saved.logo_url?`<img src="${esc(saved.logo_url)}" style="width:100%;height:100%;object-fit:contain;border-radius:7px">`:(saved.building_name||'ROC').split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase()}</div>
                    <div class="logo-prev-text">
                      <div class="lp-name" id="lp-name">${esc(saved.building_name||'Building Name')}</div>
                      <div class="lp-sub" id="lp-sub">${esc(saved.building_tagline||'Tenant Portal')}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- COLORS -->
          <div class="persona-section" id="sec-colors">
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Theme Presets</div><div class="persona-card-desc">Choose a built-in theme — applies instantly across the portal</div></div>
              <div class="persona-card-body">
                <div class="theme-presets" id="preset-grid">
                  ${THEME_PRESETS.map(p=>`
                    <div class="theme-swatch${pending.theme_preset===p.id?' selected':''}" data-preset="${p.id}" title="${p.name}">
                      <div class="swatch-top" style="background:${p.primary||pending.primary_color||'#1B3A6B'}"></div>
                      <div class="swatch-bot" style="background:${p.accent_color||pending.accent_color||'#C9922A'}"></div>
                      <div class="swatch-label">${p.name}</div>
                    </div>`).join('')}
                </div>
              </div>
            </div>
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Custom Colors</div><div class="persona-card-desc">Fine-tune individual colors — changes apply live</div></div>
              <div class="persona-card-body">
                <div class="color-group">
                  ${[
                    {key:'primary_color', label:'Primary Color', sub:'Sidebar active, buttons, links'},
                    {key:'accent_color',  label:'Accent Color',  sub:'Highlights, active nav indicator, badge accents'},
                    {key:'bg_color',      label:'Page Background', sub:'Main content area background'},
                    {key:'sidebar_bg',    label:'Sidebar Background', sub:'Navigation sidebar background color'},
                  ].map(c=>`
                    <div class="color-row">
                      <div><div class="color-row-label">${c.label}</div><div class="color-row-sub">${c.sub}</div></div>
                      <div class="color-input-wrap">
                        <div class="color-swatch"><input type="color" id="cp-${c.key}" value="${esc(pending[c.key]||'#1B3A6B')}"></div>
                        <input type="text" class="color-hex" id="ch-${c.key}" value="${esc(pending[c.key]||'#1B3A6B')}" maxlength="7">
                      </div>
                    </div>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- TYPOGRAPHY -->
          <div class="persona-section" id="sec-typography">
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Font Family</div><div class="persona-card-desc">Choose the typeface used throughout the portal — changes apply instantly</div></div>
              <div class="persona-card-body">
                <div class="form-group">
                  <label class="form-label">Font</label>
                  <select class="form-control" id="p-font" style="max-width:280px">
                    ${AVAILABLE_FONTS.map(f=>`<option value="${f.value}"${(pending.font_family||'Inter')===f.value?' selected':''}>${f.label}</option>`).join('')}
                  </select>
                </div>
                <div class="font-preview-box" id="font-preview-box" style="font-family:${pending.font_family&&pending.font_family!=='system'?`'${pending.font_family}',sans-serif`:'inherit'}">
                  <div class="font-preview-title">The quick brown fox jumps over the lazy dog</div>
                  <div class="font-preview-body">Professional tenant portal management system — 0123456789</div>
                  <div class="font-preview-nums">Aa Bb Cc Dd Ee Ff Gg — Regular · Medium · SemiBold · Bold</div>
                </div>
              </div>
            </div>
          </div>

          <!-- IMAGES -->
          <div class="persona-section" id="sec-images">
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Login Screen Background</div><div class="persona-card-desc">Background shown on the left panel of the sign-in screen</div></div>
              <div class="persona-card-body">
                <div class="form-group">
                  <div style="display:flex;gap:1.5rem;margin-bottom:.75rem">
                    <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem"><input type="radio" name="auth-bg" value="gradient" id="ab-grad" ${saved.auth_bg_type!=='image'?'checked':''}> Theme gradient</label>
                    <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem"><input type="radio" name="auth-bg" value="image" id="ab-img" ${saved.auth_bg_type==='image'?'checked':''}> Custom image</label>
                  </div>
                </div>
                <div id="auth-bg-section" style="display:${saved.auth_bg_type==='image'?'block':'none'}">
                  <div class="img-upload-row">
                    <input class="form-control" type="text" id="p-auth-bg-url" value="${esc(saved.auth_bg_url||'')}" placeholder="https://unsplash.com/…">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">Upload <input type="file" id="auth-bg-file" accept="image/*" style="display:none"></label>
                  </div>
                  <img id="auth-bg-preview" class="img-preview${saved.auth_bg_url?' show':''}" src="${esc(saved.auth_bg_url||'')}" alt="Auth background">
                </div>
                <div class="alert alert-info mt-2" style="margin-bottom:0"><span class="alert-icon">💡</span><div style="font-size:.8rem">For best results use a high-quality landscape photo (1920×1080 or larger). Services like <strong>Unsplash</strong> offer free professional imagery.</div></div>
              </div>
            </div>
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Page Hero Banners</div><div class="persona-card-desc">Background shown behind each page's title banner</div></div>
              <div class="persona-card-body">
                <div class="form-group">
                  <div style="display:flex;gap:1.5rem;margin-bottom:.75rem">
                    <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem"><input type="radio" name="hero-style" value="gradient" id="hs-grad" ${saved.hero_style!=='image'?'checked':''}> Theme gradient</label>
                    <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem"><input type="radio" name="hero-style" value="image" id="hs-img" ${saved.hero_style==='image'?'checked':''}> Custom image</label>
                  </div>
                </div>
                <div id="hero-img-section" style="display:${saved.hero_style==='image'?'block':'none'}">
                  <div class="img-upload-row">
                    <input class="form-control" type="text" id="p-hero-img-url" value="${esc(saved.hero_image_url||'')}" placeholder="https://…">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">Upload <input type="file" id="hero-img-file" accept="image/*" style="display:none"></label>
                  </div>
                  <img id="hero-img-preview" class="img-preview${saved.hero_image_url?' show':''}" src="${esc(saved.hero_image_url||'')}" alt="Hero image">
                </div>
              </div>
            </div>
          </div>

          <!-- BUILDING INFO -->
          <div class="persona-section" id="sec-info">
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Contact & Hours</div><div class="persona-card-desc">Displayed on the dashboard and throughout the portal</div></div>
              <div class="persona-card-body">
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Address</label><input class="form-control" id="p-addr" value="${esc(saved.building_address||'')}"></div>
                  <div class="form-group"><label class="form-label">Main Phone</label><input class="form-control" id="p-phone" value="${esc(saved.building_phone||'')}"></div>
                </div>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="p-email" value="${esc(saved.building_email||'')}"></div>
                  <div class="form-group"><label class="form-label">Emergency Phone</label><input class="form-control" id="p-emergency" value="${esc(saved.emergency_phone||'')}"></div>
                </div>
                <div class="form-group"><label class="form-label">Building Hours</label><input class="form-control" id="p-hours" value="${esc(saved.building_hours||'')}"></div>
              </div>
            </div>
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Dashboard Welcome</div><div class="persona-card-desc">Text shown in the hero banner on the dashboard</div></div>
              <div class="persona-card-body">
                <div class="form-group"><label class="form-label">Welcome Headline</label><input class="form-control" id="p-wh" value="${esc(saved.welcome_headline||'')}"></div>
                <div class="form-group"><label class="form-label">Welcome Message</label><textarea class="form-control" id="p-wm" rows="3">${esc(saved.welcome_message||'')}</textarea></div>
              </div>
            </div>
            <div class="persona-card">
              <div class="persona-card-head"><div class="persona-card-title">Announcement Banner</div><div class="persona-card-desc">Optional banner shown to all tenants at the top of their dashboard</div></div>
              <div class="persona-card-body">
                <div class="form-group"><label class="form-label">Announcement Text <span style="font-weight:400;font-size:.75rem">(leave blank to hide)</span></label><textarea class="form-control" id="p-ann" rows="3" placeholder="e.g. Parking garage closed for maintenance Nov 10–12">${esc(saved.announcement||'')}</textarea></div>
                <div class="form-group" style="margin-bottom:0"><label class="form-label">Banner Type</label>
                  <select class="form-control" id="p-ann-type" style="max-width:200px">
                    ${['info','success','warning','danger'].map(t=>`<option value="${t}"${saved.announcement_type===t?' selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /persona-content -->
      </div>

      <!-- Sticky save bar -->
      <div class="persona-save-bar">
        <div class="persona-save-info">Changes apply <strong>live</strong> — hit Save to make them permanent</div>
        <div style="display:flex;gap:.65rem">
          <button class="btn btn-ghost" id="p-discard">Discard Changes</button>
          <button class="btn btn-primary" id="p-save">💾 Save All Changes</button>
        </div>
      </div>
    </div>`);

  // ── Section nav ──
  document.querySelectorAll('.persona-nav-item').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.persona-nav-item').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.persona-section').forEach(s=>s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sec-'+btn.dataset.sec).classList.add('active');
    });
  });

  // ── Branding inputs ──
  const updateLogoPreview = ()=>{
    const name=document.getElementById('p-bname').value;
    const abbr=name.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase()||'ROC';
    const isImg=document.getElementById('lt-image').checked;
    const url=document.getElementById('p-logo-url')?.value;
    document.getElementById('lp-name').textContent=name||'Building Name';
    document.getElementById('lp-sub').textContent=document.getElementById('p-btagline').value||'Tenant Portal';
    document.getElementById('lp-badge').innerHTML = isImg&&url ? `<img src="${esc(url)}" style="width:100%;height:100%;object-fit:contain;border-radius:7px">` : abbr;
  };
  document.getElementById('p-bname').addEventListener('input', e=>{ setPending('building_name',e.target.value); updateLogoPreview(); });
  document.getElementById('p-btagline').addEventListener('input', e=>{ setPending('building_tagline',e.target.value); updateLogoPreview(); });
  document.querySelectorAll('input[name="logo-type"]').forEach(r=>r.addEventListener('change',()=>{
    const isImg=r.value==='image';
    document.getElementById('logo-img-section').style.display=isImg?'block':'none';
    setPending('logo_type',r.value); updateLogoPreview();
  }));
  document.getElementById('p-logo-url').addEventListener('input', e=>{ setPending('logo_url',e.target.value); const img=document.getElementById('logo-preview-img'); img.src=e.target.value; img.classList.toggle('show',!!e.target.value); updateLogoPreview(); });
  document.getElementById('logo-file').addEventListener('change', async e=>{
    try{ const url=await uploadImage(e.target.files[0]); document.getElementById('p-logo-url').value=url; setPending('logo_url',url); const img=document.getElementById('logo-preview-img'); img.src=url; img.classList.add('show'); updateLogoPreview(); toast('Logo uploaded!','success'); }
    catch(ex){ toast('Upload failed: '+ex.message,'error'); }
  });

  // ── Colour presets ──
  document.querySelectorAll('.theme-swatch').forEach(sw=>{
    sw.addEventListener('click',()=>{
      const preset=THEME_PRESETS.find(p=>p.id===sw.dataset.preset);
      if(!preset) return;
      document.querySelectorAll('.theme-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      if(preset.primary){
        Object.assign(pending,{primary_color:preset.primary,primary_light:preset.primary_light,primary_dark:preset.primary_dark,accent_color:preset.accent_color,bg_color:preset.bg_color,sidebar_bg:preset.sidebar_bg,theme_preset:preset.id});
        ['primary_color','accent_color','bg_color','sidebar_bg'].forEach(k=>{ const cp=document.getElementById('cp-'+k), ch=document.getElementById('ch-'+k); if(cp&&pending[k]){ cp.value=pending[k]; ch.value=pending[k]; } });
        applyTheme(pending); updateBranding(pending);
      } else {
        pending.theme_preset='custom';
      }
    });
  });

  // ── Colour pickers ──
  ['primary_color','accent_color','bg_color','sidebar_bg'].forEach(key=>{
    const cp=document.getElementById('cp-'+key), ch=document.getElementById('ch-'+key);
    if(!cp) return;
    cp.addEventListener('input', e=>{ ch.value=e.target.value; setPending(key,e.target.value); pending.theme_preset='custom'; document.querySelectorAll('.theme-swatch').forEach(s=>s.classList.remove('selected')); document.querySelector('.theme-swatch[data-preset="custom"]')?.classList.add('selected'); });
    ch.addEventListener('input', e=>{ if(/^#[0-9a-fA-F]{6}$/.test(e.target.value)){ cp.value=e.target.value; setPending(key,e.target.value); } });
  });

  // ── Typography ──
  document.getElementById('p-font').addEventListener('change', e=>{
    setPending('font_family',e.target.value);
    const fam=e.target.value==='system'?'inherit':`'${e.target.value}',sans-serif`;
    document.getElementById('font-preview-box').style.fontFamily=fam;
  });

  // ── Image toggles ──
  document.querySelectorAll('input[name="auth-bg"]').forEach(r=>r.addEventListener('change',()=>{ document.getElementById('auth-bg-section').style.display=r.value==='image'?'block':'none'; setPending('auth_bg_type',r.value); }));
  document.getElementById('p-auth-bg-url').addEventListener('input', e=>{ setPending('auth_bg_url',e.target.value); const img=document.getElementById('auth-bg-preview'); img.src=e.target.value; img.classList.toggle('show',!!e.target.value); });
  document.getElementById('auth-bg-file').addEventListener('change', async e=>{
    try{ const url=await uploadImage(e.target.files[0]); document.getElementById('p-auth-bg-url').value=url; setPending('auth_bg_url',url); const img=document.getElementById('auth-bg-preview'); img.src=url; img.classList.add('show'); toast('Image uploaded!','success'); }
    catch(ex){ toast('Upload failed: '+ex.message,'error'); }
  });
  document.querySelectorAll('input[name="hero-style"]').forEach(r=>r.addEventListener('change',()=>{ document.getElementById('hero-img-section').style.display=r.value==='image'?'block':'none'; setPending('hero_style',r.value); }));
  document.getElementById('p-hero-img-url').addEventListener('input', e=>{ setPending('hero_image_url',e.target.value); const img=document.getElementById('hero-img-preview'); img.src=e.target.value; img.classList.toggle('show',!!e.target.value); });
  document.getElementById('hero-img-file').addEventListener('change', async e=>{
    try{ const url=await uploadImage(e.target.files[0]); document.getElementById('p-hero-img-url').value=url; setPending('hero_image_url',url); const img=document.getElementById('hero-img-preview'); img.src=url; img.classList.add('show'); toast('Image uploaded!','success'); }
    catch(ex){ toast('Upload failed: '+ex.message,'error'); }
  });

  // ── Building info ──
  [['p-addr','building_address'],['p-phone','building_phone'],['p-email','building_email'],['p-emergency','emergency_phone'],['p-hours','building_hours'],['p-wh','welcome_headline'],['p-wm','welcome_message'],['p-ann','announcement'],['p-ann-type','announcement_type']].forEach(([id,key])=>{
    document.getElementById(id)?.addEventListener('input', e=>{ pending[key]=e.target.value; });
    document.getElementById(id)?.addEventListener('change', e=>{ pending[key]=e.target.value; });
  });

  // ── Save / Discard ──
  document.getElementById('p-save').addEventListener('click', async()=>{
    const btn=document.getElementById('p-save'); btn.disabled=true; btn.textContent='Saving…';
    try{
      const result=await api.saveSettings(pending);
      state.settings={...result};
      saved={...result};
      pending={...result};
      applyTheme(state.settings);
      updateBranding(state.settings);
      renderNav();
      toast('Portal settings saved!','success');
    }catch(e){ toast('Save failed: '+e.message,'error'); }
    btn.disabled=false; btn.textContent='💾 Save All Changes';
  });
  document.getElementById('p-discard').addEventListener('click',()=>{
    pending={...saved};
    applyTheme(saved);
    updateBranding(saved);
    state.settings={...saved};
    toast('Changes discarded.','');
    pagePersonalize();
  });
}

// ── MOBILE MENU ───────────────────────────────────────
function closeSidebarMobile(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').style.display='none';
}
document.getElementById('mobile-menu-btn').addEventListener('click',()=>{
  const open=document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').style.display=open?'block':'none';
});
document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebarMobile);
document.getElementById('modal-overlay').addEventListener('click', e=>{ if(e.target===document.getElementById('modal-overlay')) closeModal(); });

// ── INIT ──────────────────────────────────────────────
async function init(){
  // Always load settings first so theme/branding apply before anything shows
  try{ state.settings = await api.getSettings(); } catch{ state.settings = {}; }
  applyTheme(state.settings);
  updateBranding(state.settings);

  if(state.token){
    try{
      state.user = await api.getMe();
      showApp();
    }catch{
      localStorage.removeItem('roc_token');
      state.token=null;
      showAuth('login');
    }
  } else {
    showAuth('login');
  }
}
init();
