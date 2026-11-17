import { $, $$, esc, fmt, money, bigMoney, avatar, ic, usdMicro, haptic } from './util.js';
import { S, subscribe, emit, setState, ACT, tapValueNow } from './store.js';
import { get, setUnauthHandler } from './api.js';
import { toast, sheet } from './ui.js';
import { refreshState } from './core.js';
import { showAuth } from './auth.js';
import * as world from './views/world.js';
import * as invest from './views/invest.js';
import * as items from './views/items.js';
import * as trade from './views/trade.js';
import * as ranks from './views/ranks.js';
import * as profile from './views/profile.js';
import { loadPhotos } from './art.js';
import * as expand from './views/expand.js';
import * as auction from './views/auction.js';
import * as wallet from './views/wallet.js';
import { openCompany } from './views/company.js';

const views = { world, invest, items, trade, ranks, profile, expand, auction, wallet };
const TAB_OF = { auction: 'ranks', wallet: 'world' };
const TABS = [['world', 'World', 'globe'], ['invest', 'Invest', 'trending-up'], ['items', 'Items', 'layout-grid'], ['trade', 'Trade', 'chart-candlestick'], ['expand', 'Expand', 'flag'], ['ranks', 'Ranks', 'trophy']];
let view = null, started = false, es = null, loops = [];

let splashAt = performance.now();
function hideSplash() {
  const s = $('#splash'); if (!s) return;
  const wait = Math.max(0, 1500 - (performance.now() - splashAt));
  setTimeout(() => { s.classList.add('off'); setTimeout(() => s.remove(), 700); }, wait);
}

async function boot() {
  const [data, countries, map] = (await Promise.all([get('/api/gamedata'), fetch('/data/countries.json').then(r => r.json()), fetch('/data/map.json').then(r => r.json()), loadPhotos()])).slice(0, 3);
  S.data = data; S.countries = countries; S.map = map;
  document.title = data.config.appName;
  setUnauthHandler(() => { stop(); showAuth(begin); });
  try { await begin(); } catch (e) { if (e.status === 401) { showAuth(begin); hideSplash(); } else { hideSplash(); $('#root').innerHTML = `<div class="auth center"><div class="card"><div class="b t-lg">Couldn't load the game</div><p class="muted t-sm">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`; } }
}

async function begin() {
  const st = await get('/api/state?init=1');
  S.market = await get('/api/market');
  S.pendingTaps = 0; setState(st);
  buildShell();
  startLive();
  route();
  welcome(st);
  hideSplash();
}

function buildShell() {
  document.body.classList.remove('authing');
  $('#root').innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><img src="/brand/logo-white.png" height="26" style="width:auto" alt="">${esc(S.data.config.appName)}</div>
      <nav class="nav" id="tabbar">${TABS.map(([id, label, icon]) => `<button data-tab="${id}" aria-label="${label}">${ic(icon, 22, '', 1.9)}<span>${label}</span></button>`).join('')}</nav></aside>
    <main class="main"><div id="card"></div><div id="view" class="view-in"></div></main></div>
    <div class="mini" id="mini"><div class="in"><span class="tile" style="--t:#34d399;width:32px;height:32px;border-radius:10px">${ic('wallet', 17)}</span><b class="num grow t-lg" id="miniBal"></b><span class="muted t-sm num" id="miniTap"></span></div></div>`;
  $('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { haptic(4); location.hash = '#/' + b.dataset.tab; } });
  renderCard();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => $('#mini')?.classList.toggle('on', !en.isIntersecting && en.boundingClientRect.top < 0), { threshold: 0 }).observe($('#card'));
  }
}

const RING = [4, 5, 6, 7];
const FXN = { 1: 3, 3: 3, 2: 1, 4: 4, 7: 4 };
function renderCard() {
  const st = S.st, t = st.me.tier, R = st.rewards, id = Math.min(7, t.id);
  $('#card').innerHTML = `<div class="pcard-w t${id} ${RING.includes(id) ? 'ring' : ''}"><div class="pcard" data-act="open-profile" role="button" aria-label="Open profile">
      <div class="fx">${'<i></i>'.repeat(FXN[id] || 0)}</div>
      <div class="top"><div class="co">${avatar(st.me.company_name, st.me.logo_url, 28)}<b class="ell">${esc(st.me.company_name)}</b></div>
        <div class="chipsvg">${ic('nfc', 22, '', 1.8)}</div></div>
      <div class="lbl">Balance</div>
      <div class="bal num" id="bal">${bigMoney(S.cash)}</div>
      <div class="stats num"><div><small>Per tap</small><b id="tapv">+${money(tapValueNow())}</b></div><div><small>Per second</small><b id="inc">+${money(st.income_per_hour / 3600)}</b></div><div><small>Per hour</small><b id="inch">+${money(st.income_per_hour)}</b></div></div>
      <div class="foot">${R.enabled && R.eligible ? `<span class="rwchip" data-act="open-wallet">${ic('hand-coins', 15, '', 2)}Today ≈ ${usdMicro(R.est_today_micro)}</span>` : '<span></span>'}
        <div class="tier">${esc(t.name)}<small>${esc(t.card)}</small></div></div></div></div>`;
}
const updateBal = () => {
  const b = $('#bal'); if (!b) return;
  const v = bigMoney(S.cash); b.textContent = v;
  const t = $('#tapv'); if (t) t.textContent = `+${money(tapValueNow())}`;
  const ip = $('#inc'); if (ip && S.st) { ip.textContent = `+${money(S.st.income_per_hour / 3600)}`; $('#inch').textContent = `+${money(S.st.income_per_hour)}`; }
  const mb = $('#miniBal'); if (mb) mb.textContent = v;
  const mt = $('#miniTap'); if (mt) mt.textContent = `+${money(tapValueNow())}/tap`;
};

ACT['open-profile'] = () => { location.hash = '#/profile'; };
ACT['open-wallet'] = (el, e) => { e.stopPropagation(); location.hash = '#/profile/wallet'; };
ACT.back = () => { if (history.length > 1) history.back(); else location.hash = '#/world'; };
ACT.company = (el) => openCompany(el.dataset.id);

function route() {
  if (!S.st) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let tab = parts[0] || 'world';
  if (tab === 'c') { const id = parts[1]; history.replaceState(null, '', '#/world'); tab = 'world'; parts[0] = 'world'; parts[1] = undefined; setTimeout(() => openCompany(id), 300); }
  if (!views[tab]) tab = 'world';
  view?.destroy?.(); S.tabTimers.forEach(clearInterval); S.tabTimers = [];
  const hi = TAB_OF[tab] || tab; $$('#tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === hi));
  const root = $('#view'); root.innerHTML = ''; root.classList.remove('view-in'); void root.offsetWidth; root.classList.add('view-in');
  view = views[tab].mount(root, parts[1], parts[2]) || {};
  if (!started) started = true; else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, e); });

// ---------------------------------------------------------------- live updates
function startLive() {
  stop(); started = false;
  let last = performance.now();
  loops.push(setInterval(() => { const now = performance.now(), dt = Math.min(5, (now - last) / 1000); last = now; if (!S.st || document.hidden) return; S.cash += S.st.income_per_hour / 3600 * dt; updateBal(); }, 250));
  loops.push(setInterval(() => view?.update?.('sec'), 1000));
  es = new EventSource('/api/stream');
  es.addEventListener('tick', (e) => applyTick(JSON.parse(e.data)));
  es.addEventListener('market', (e) => applyMarket(JSON.parse(e.data)));
  es.addEventListener('auction', () => emit('auction'));
  es.addEventListener('notice', (e) => { try { toast(JSON.parse(e.data).body, 'good'); } catch { /* ignore */ } refreshState().then(() => emit('notice')).catch(() => {}); });
  document.addEventListener('visibilitychange', onVisible);
}
function stop() { loops.forEach(clearInterval); loops = []; es?.close(); es = null; document.removeEventListener('visibilitychange', onVisible); }
let hiddenAt = 0;
function onVisible() {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!S.st) return;
  if (Date.now() - hiddenAt > 30000) {
    // coming back: ask the server what happened while the app was closed; the earnings are already part of the balance
    get('/api/state?init=1').then(async st => { S.pendingTaps = 0; setState(st); S.market = await get('/api/market'); emit('tick'); if (st.away_earned > 0) welcome(st); }).catch(() => {});
  }
}

function applyMarket(d) {
  if (!S.market) return;
  for (const s of d.stocks) {
    const m = S.market.stocks.find(x => x.id === s.id); if (!m) continue;
    m.price = s.price; m.chg = s.chg; if (!d.quiet) { m.history.push(s.price); if (m.history.length > 70) m.history.shift(); }
  }
  S.market.t = d.t; if (!d.quiet) emit('market');
}

function applyTick(d) {
  const st = S.st; if (!st) return;
  applyMarket({ t: d.market.t, stocks: d.market.stocks.map(s => ({ ...s })), quiet: true });
  const me = d.me;
  st.cash = me.cash; st.score = me.score; st.season_earned = me.season_earned; st.net_worth = me.net_worth; st.portfolio_value = me.portfolio_value;
  if (me.income_per_hour != null) st.income_per_hour = me.income_per_hour;
  if (me.credits_micro != null) st.credits_micro = me.credits_micro;
  S.cash = me.cash + S.pendingTaps * tapValueNow();
  emit('tick');
}

subscribe((ev) => {
  if (!S.st || !$('#card')) return;
  if (ev === 'state') renderCard();
  if (ev === 'tick') { updateBal(); }
  if (ev === 'quick') { updateBal(); return; }
  view?.update?.(ev);
});

function welcome(st) {
  let onb = true; try { onb = localStorage.getItem('te_onb') === '1'; } catch { /* ignore */ }
  if (!onb && st.tap_total < 5) {
    const row = (i, h, p) => `<div class="row" style="align-items:flex-start;gap:14px"><span class="tile" style="--t:#34d399">${ic(i, 21)}</span><div><div class="b">${h}</div><div class="muted t-sm">${p}</div></div></div>`;
    const s = sheet(`<h2 style="margin:4px 0 4px;font-size:22px;letter-spacing:-.02em">Welcome, ${esc(st.me.company_name)}</h2><p class="muted" style="margin:0 0 18px">Three things to know before you start.</p>
      <div class="stack">${row('pointer', 'Tap the map', 'Every tap earns cash. Upgrade your tap power any time.')}${row('trending-up', 'Invest while you are away', `Businesses and real estate keep earning, even offline (up to ${S.data.config.offlineCapHours} hours).`)}${row('trophy', 'Climb the rankings', 'Your company name is shown on live leaderboards and a public page you can share.')}</div>
      <button class="btn primary block" data-close style="margin-top:20px">Start earning</button>`, { onClose: () => { try { localStorage.setItem('te_onb', '1'); } catch { /* ignore */ } } });
    return;
  }
  if (st.away_earned > 0) {
    sheet(`<div class="center"><span class="tile lg" style="--t:#f4b740;margin:6px auto 12px">${ic('coins', 28)}</span><h2 style="margin:0 0 4px;font-size:20px">Welcome back</h2>
      <p class="muted t-sm" style="margin:0 0 6px">While you were away your companies earned</p>
      <div class="num goldt" style="font-size:36px;font-weight:700;letter-spacing:-.03em">${money(st.away_earned)}</div>
      <p class="t-xs muted" style="margin:8px 0 0">Already added to your balance: ${bigMoney(S.cash)}</p><button class="btn primary block" data-close style="margin-top:20px">Nice</button></div>`, { center: true });
  }
  (st.notifications || []).forEach((n, i) => setTimeout(() => toast(n.body, 'good'), 600 + i * 1200));
}

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
document.addEventListener('error', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('phimg')) t.remove(); }, true);
boot();
