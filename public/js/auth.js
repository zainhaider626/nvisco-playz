import { $, esc, ic } from './util.js';
import { S } from './store.js';
import { post } from './api.js';

/** Sign-in screen with two doors: Individual (players) and Admin (the owner, username + password only the owner knows). */
export function showAuth(onDone) {
  document.body.classList.add('authing');
  const guess = (() => { try { return (new Intl.Locale(navigator.language).region || '').toUpperCase(); } catch { return ''; } })();
  const def = S.countries.some(c => c.code === guess) ? guess : 'PK';
  const opts = S.countries.map(c => `<option value="${c.code}" ${c.code === def ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const inds = S.data.industries.map(i => `<option>${esc(i)}</option>`).join('');
  const root = $('#root');
  const pt = (i, h, p) => `<div class="p"><span class="tile" style="--t:#fff">${ic(i, 19)}</span><div><b>${h}</b><span>${p}</span></div></div>`;
  root.innerHTML = `<div class="auth">
    <div style="text-align:center;margin-top:6px"><img src="/brand/logo-white.png" alt="Nvisco" style="width:150px;height:auto;display:inline-block">
      <div style="font-size:13px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;margin-top:10px">Nvisco Playz</div>
      <div class="muted" style="margin-top:6px;font-size:14.5px">Promote your business with Nvisco Playz</div></div>
    <div class="authtoggle" id="who"><button data-who="user" class="on">${ic('user', 18)}Individual</button><button data-who="admin">${ic('shield', 18)}Admin</button></div>

    <div id="userSide">
      <div class="points">${pt('globe', 'Conquer the world', 'Buy businesses, property and industry in every region and open branches in every country.')}${pt('trophy', 'Live rankings', 'Climb your league, your country and the world. Win the top spot to feature your company.')}${pt('badge-check', 'Your brand, your page', 'Add your logo and banner. Share a public company page with clients.')}</div>
      <div class="seg" style="margin-bottom:12px"><button data-m="up" class="on">Create account</button><button data-m="in">Log in</button></div>
      <form class="card" id="authForm" autocomplete="on" novalidate>
        <div id="upOnly">
          <label class="f" style="margin-top:0">Company name</label><input name="company_name" maxlength="32" placeholder="Nvisco Hardware" autocomplete="organization">
          <div class="row" style="gap:10px;align-items:flex-start"><div class="grow"><label class="f">Country</label><select name="country">${opts}</select></div>
            <div class="grow"><label class="f">Industry</label><select name="industry">${inds}</select></div></div>
        </div>
        <label class="f">Email</label><input name="email" type="email" autocomplete="email" placeholder="you@company.com">
        <label class="f">Password</label><input name="password" type="password" autocomplete="current-password" placeholder="At least 8 characters">
        <div id="moreWrap"><details style="margin-top:14px"><summary class="muted t-sm" style="cursor:pointer">Add a website and tagline</summary>
          <label class="f">Website</label><input name="website" placeholder="yourcompany.com" autocomplete="url">
          <label class="f">Tagline</label><input name="tagline" maxlength="80" placeholder="What does your company do?"></details></div>
        <div class="err" id="authErr" role="alert"></div>
        <button class="btn primary block" id="authBtn" type="submit" style="margin-top:6px;height:50px">Create account</button>
      </form>
      <p class="fine">Free to play. Cash rewards come from ad revenue and sponsor budgets and are never guaranteed. By continuing you agree to play fairly.</p>
    </div>

    <div id="adminSide" class="hide">
      <div class="card" style="margin-top:14px"><div class="row g8" style="margin-bottom:6px"><span class="tile" style="--t:#fff">${ic('shield', 20)}</span><div><div class="b">Owner sign-in</div><div class="muted t-sm">Only the owner has this username and password.</div></div></div>
        <form id="adminForm" autocomplete="off" novalidate>
          <label class="f">Admin username</label><input name="username" autocomplete="username" autocapitalize="off" spellcheck="false">
          <label class="f">Admin password</label><input name="password" type="password" autocomplete="current-password">
          <div class="err" id="adminErr" role="alert"></div>
          <button class="btn primary block" id="adminBtn" type="submit" style="margin-top:6px;height:50px">Open admin panel</button>
        </form></div>
      <p class="fine">Admin sessions are separate from player accounts and end after 12 hours.</p>
    </div></div>`;

  root.querySelectorAll('#who button').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('#who button').forEach(x => x.classList.toggle('on', x === b));
    $('#userSide').classList.toggle('hide', b.dataset.who !== 'user'); $('#adminSide').classList.toggle('hide', b.dataset.who !== 'admin');
  }));

  let mode = 'up';
  const form = $('#authForm');
  const setMode = (m) => {
    mode = m;
    root.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#upOnly').classList.toggle('hide', m === 'in'); $('#moreWrap').classList.toggle('hide', m === 'in');
    $('#authBtn').textContent = m === 'up' ? 'Create account' : 'Log in';
    form.password.autocomplete = m === 'up' ? 'new-password' : 'current-password';
    $('#authErr').textContent = '';
  };
  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = $('#authBtn'); btn.disabled = true; btn.classList.add('off'); $('#authErr').textContent = '';
    try {
      await post(mode === 'up' ? '/api/auth/register' : '/api/auth/login', mode === 'up' ? f : { email: f.email, password: f.password });
      document.body.classList.remove('authing');
      onDone();
    } catch (err) { $('#authErr').textContent = err.message; btn.disabled = false; btn.classList.remove('off'); }
  });

  $('#adminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), btn = $('#adminBtn'); btn.disabled = true; btn.classList.add('off'); $('#adminErr').textContent = '';
    try { await post('/api/admin/login', { username: f.username, password: f.password }); location.href = '/admin.html'; }
    catch (err) { $('#adminErr').textContent = err.message; btn.disabled = false; btn.classList.remove('off'); }
  });
}
