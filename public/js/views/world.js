import { $, esc, fmt, money, ic, dur, avatar, syncAfford, haptic, CAT_ICON } from '../util.js';
import { section } from '../ui.js';
import { S, ACT, boostActive, tapValueNow, regionUnlocked, regionOwned } from '../store.js';
import { tryTap, doAction } from '../core.js';
import { get, post } from '../api.js';
import { tapBurst } from '../fx.js';
import { assetArt } from '../art.js';

let root, sponsors = [], spots = [];
const seenSponsors = new Set();

function mapSvg() {
  const { map } = S, regs = S.data.regions;
  const paths = regs.map((r, i) => {
    const n = regionOwned(r.id), f = n / S.data.perRegion, open = regionUnlocked(i);
    const fill = n ? r.color : open ? '#3a5688' : '#25304a';
    const op = n ? (0.6 + 0.4 * f).toFixed(2) : '1';
    const glow = n === S.data.perRegion ? `style="filter:drop-shadow(0 0 6px ${r.color})"` : '';
    const edge = !n && open ? `stroke="${r.color}" stroke-opacity=".8" stroke-width="1.6"` : '';
    return `<path class="cont" d="${map.continents[r.id]}" fill="${fill}" opacity="${op}" ${edge} ${glow}/>`;
  }).join('');
  return `<svg viewBox="${map.viewBox}" role="img" aria-label="World map">${paths}</svg>`;
}
function pinsHtml() {
  const { map } = S, [, , W, H] = map.viewBox.split(/\s+/).map(Number);
  return S.data.regions.map((r, i) => {
    const [x, y] = map.centers[r.id], n = regionOwned(r.id), open = regionUnlocked(i);
    const name = r.name.replace('North America', 'N. America').replace('South America', 'S. America');
    return `<span class="mpin" style="left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%;${open ? '' : 'opacity:.55'}">${open ? '' : ic('lock', 11, '', 2.4) + ' '}${esc(name)}${n ? `<i>${Math.round(n / S.data.perRegion * 100)}%</i>` : ''}</span>`;
  }).join('');
}

function boostHtml() {
  const t = S.st.tap, now = Date.now();
  if (boostActive()) return `<div class="boost active" data-boost>${ic('zap', 14, '', 2.4)}2× taps · ${dur(new Date(t.boost_until) - now).replace(/^00:/, '')}</div>`;
  if (t.boost_ready_at && new Date(t.boost_ready_at) > now) return `<div class="boost" data-boost style="opacity:.75">${ic('zap', 14, '', 2.4)}Ready in ${dur(new Date(t.boost_ready_at) - now)}</div>`;
  return `<button class="boost" data-boost data-act="boost">${ic('zap', 14, '', 2.4)}Boost 2× · ${Math.round(S.data.config.boostSeconds / 60)} min</button>`;
}

/** The cheapest thing the player can still buy, shown as a progress card so there is always a next step. */
function nextGoal() {
  const st = S.st; let best = null;
  S.data.regions.forEach((r, i) => {
    if (!regionUnlocked(i)) return;
    for (const a of S.data.assets) if (a.region === r.id && !st.owned[a.id] && (!best || a.cost < best.cost)) best = { a, cost: a.cost, region: r };
  });
  if (!best) return '';
  const p = Math.min(1, st.cash / best.cost), can = p >= 1;
  return `<div class="card goal" data-act="region" data-id="${best.region.id}" style="cursor:pointer;margin-top:12px">
    <div class="row g8"><div class="arttile" style="width:64px">${assetArt(best.a, best.region.color)}</div>
      <div class="grow"><div class="t-xs muted b" style="text-transform:uppercase;letter-spacing:.06em">Next goal</div><div class="b ell">${esc(best.a.name)}</div></div>
      <span class="price ${can ? '' : 'alt'}" data-goalprice data-gc="${best.cost}">${money(best.cost)}</span></div>
    <div class="bar mt12"><i data-goalbar style="width:${(p * 100).toFixed(1)}%;${can ? '' : 'background:var(--blue)'}"></i></div>
    <div class="row between t-xs muted mt8"><span>+${money(best.a.income)}/hour in ${esc(best.region.name)}</span><span data-goalpct>${can ? 'Ready to buy' : Math.floor(p * 100) + '%'}</span></div></div>`;
}
function updateGoal() {
  const g = $('.goal', root); if (!g) return;
  const cost = Number(g.querySelector("[data-goalprice]").dataset.gc), p = Math.min(1, S.cash / cost);
  g.querySelector('[data-goalbar]').style.width = (p * 100).toFixed(1) + '%';
  g.querySelector('[data-goalpct]').textContent = p >= 1 ? 'Ready to buy' : Math.floor(p * 100) + '%';
}

function draw() {
  const st = S.st, t = st.tap;
  const maxed = t.next_cost == null;
  root.innerHTML = `
    <div class="card guidecard" data-act="guide" role="button"><span class="tile" style="--t:#fff">${ic('info', 21)}</span><div class="grow"><div class="b">How to use this app</div><div class="t-sm muted">Simple steps for every section</div></div>${ic('chevron-right', 18)}</div>
    <div class="mapwrap mt12" id="map"><div class="mapin">${mapSvg()}${pinsHtml()}</div><div id="boostBox">${boostHtml()}</div><div class="combo" id="combo"></div><div class="hint">${ic('pointer', 14, '', 2)}Tap anywhere here to earn</div></div>
    <div class="card row between mt12">
      <div class="row g8 grow"><span class="tile" style="--t:#f4b740">${ic('pointer', 21)}</span><div class="grow"><div class="b">Tap power <span class="chip">Lv ${t.level}</span></div>
        <div class="t-sm muted num">${money(tapValueNow())} per tap${maxed ? ' · max level' : ` → <b class="pos">${money(t.next_value)}</b>`}</div></div></div>
      ${maxed ? '' : `<button class="price ${st.cash >= t.next_cost ? '' : 'off'}" data-act="tapup" id="tapUp" data-cost="${t.next_cost}">${money(t.next_cost)}</button>`}
    </div>
    <div class="quick mt12">${[['expand', 'Expand', 'globe'], ['auction', 'Top spot', 'megaphone'], ['wallet', 'Credits', 'banknote']].map(([id, l, i]) => `<button data-act="quick" data-id="${id}">${ic(i, 22)}<span>${l}</span></button>`).join('')}</div>
    ${nextGoal()}
    ${spots.length ? `${section('Top companies', '<a class="t-sm" href="#/auction">Bid for a spot</a>')}<div class="hscroll">${spots.map(s => `<div class="sponsor" data-act="company" data-id="${s.company.id}" style="cursor:pointer">${avatar(s.company.company_name, s.company.logo_url, 38)}<div class="grow"><div class="b ell">${esc(s.company.company_name)}</div><div class="t-xs muted ell">${esc(s.company.tagline || s.company.industry)}</div></div><span class="chip gold">#${s.rank}</span></div>`).join('')}</div>` : ''}
    ${sponsors.length ? `${section('Featured companies')}<div class="hscroll">${sponsors.map(s => `<a class="sponsor" href="/go/s/${s.id}" target="_blank" rel="noopener sponsored">${avatar(s.name, s.logo_url, 38)}<div class="grow"><div class="b ell">${esc(s.name)}</div><div class="t-xs muted ell">${esc(s.tagline || 'Sponsored')}</div></div>${ic('external-link', 15)}</a>`).join('')}</div>` : ''}
    ${section('Your conquest')}
    <div class="group">${S.data.regions.map((r, i) => { const n = regionOwned(r.id), open = regionUnlocked(i); return `<div class="li" ${open ? `data-act="region" data-id="${r.id}"` : ''} style="${open ? '' : 'opacity:.55'}">
        <span class="tile" style="--t:${r.color}">${ic(open ? 'map-pin' : 'lock', 20)}</span>
        <div class="grow"><div class="row between"><b>${esc(r.name)}</b><span class="t-sm muted num">${open ? `${n} / ${S.data.perRegion}` : `Own ${S.data.regionUnlockOwned} in ${esc(S.data.regions[i - 1].name)}`}</span></div>
        <div class="bar mt8"><i style="width:${n / S.data.perRegion * 100}%;background:${r.color}"></i></div></div>${open ? ic('chevron-right', 18) : ''}</div>`; }).join('')}</div>`;
  const map = $('#map', root);
  map.addEventListener('pointerdown', onTap);
}

function onTap(e) {
  if (e.target.closest('[data-act]')) return;
  if (!tryTap()) return;
  const map = e.currentTarget, rect = map.getBoundingClientRect();
  tapBurst(map, e.clientX - rect.left, e.clientY - rect.top, '+' + money(tapValueNow()), $('#combo', map));
  haptic(6);
}

ACT.tapup = async () => { await doAction('/api/tap/upgrade'); };
ACT.boost = async () => { await doAction('/api/boost'); };
ACT.quick = (el) => { location.hash = '#/' + el.dataset.id; };
ACT.region = (el) => { location.hash = '#/invest/' + el.dataset.id; };

export function mount(r) {
  root = r;
  draw();
  get('/api/spots').then(res => { spots = res.rows || []; if (root.isConnected && spots.length) draw(); }).catch(() => {});
  get('/api/sponsors').then(res => {
    sponsors = res.rows; if (!root.isConnected) return; draw();
    for (const s of sponsors) if (!seenSponsors.has(s.id)) { seenSponsors.add(s.id); post(`/api/sponsors/${s.id}/seen`).catch(() => {}); }
  }).catch(() => {});
  return {
    update(ev) {
      if (!root.isConnected) return;
      if (ev === 'sec') { const b = $('#boostBox', root); if (b) b.innerHTML = boostHtml(); syncAfford(root); updateGoal(); return; }
      if (ev === 'state') draw();
    },
  };
}
