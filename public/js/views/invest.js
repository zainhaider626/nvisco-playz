import { $, esc, fmt, money, ic, syncAfford, tile, CAT_ICON } from '../util.js';
import { S, ACT, regionUnlocked, regionOwned, revLive } from '../store.js';
import { doAction } from '../core.js';
import { pageHeader, titleBlock, sheet, toast } from '../ui.js';
import { assetArt } from '../art.js';

let root, regionId = null, cat = 'business';
const CROP = { africa: [425, 130, 215, 255], south_america: [255, 210, 150, 235], asia: [455, 20, 430, 285], europe: [395, 45, 215, 170], north_america: [55, 15, 360, 235], oceania: [735, 285, 235, 135] };
const catCount = (assets, regionOwnedMap) => (c) => assets.filter(a => a.cat === c).length;

const assetsOf = (rid) => S.data.assets.filter(a => a.region === rid);
const levelOf = (id) => S.st.owned[id] || 0;
const incomeOf = (a, level) => a.income * Math.pow(S.data.upgradeIncomeRatio, level - 1);

function regionShape(r, f) {
  const c = CROP[r.id];
  return `<svg class="shape" style="width:100%;height:auto;display:block" viewBox="${c.join(' ')}"><path d="${S.map.continents[r.id]}" fill="${r.color}" opacity="${(0.25 + 0.75 * f).toFixed(2)}" stroke="rgba(255,255,255,.3)" stroke-width="1.2" ${f === 1 ? `style="filter:drop-shadow(0 0 8px ${r.color})"` : ''}/></svg>`;
}

function drawList() {
  const regs = S.data.regions;
  const total = S.st ? Object.keys(S.st.owned).length : 0, all = S.data.assets.length;
  root.innerHTML = `${titleBlock('Invest', `${total} of ${all} assets owned`)}
    ${liveCard()}
    <div class="stack">${regs.map((r, i) => {
      const as = assetsOf(r.id), open = regionUnlocked(i), n = regionOwned(r.id);
      const cnt = (c) => as.filter(a => a.cat === c && levelOf(a.id)).length + '/' + as.filter(a => a.cat === c).length;
      const status = !open ? `Own ${S.data.regionUnlockOwned} assets in ${esc(regs[i - 1].name)} to unlock` : n === S.data.perRegion ? `Conquered · +${S.data.regionSetBonus * 100}% income` : esc(r.tagline);
      return `<div class="card ${open ? '' : 'locked'}" style="${open ? 'cursor:pointer' : 'opacity:.6'}" ${open ? `data-act="region" data-id="${r.id}"` : ''}>
        <div class="row" style="gap:14px"><div style="width:76px;flex:none">${regionShape(r, open ? n / S.data.perRegion : 0.2)}</div>
          <div class="grow"><div class="row between"><b class="t-lg">${esc(r.name)}</b>${open ? `<span class="t-sm muted num">${n} / ${S.data.perRegion}</span>` : ic('lock', 16)}</div>
            <div class="t-sm muted" style="margin:2px 0 10px">${status}</div>
            ${open ? `<div class="bar"><i style="width:${(n * 100 / S.data.perRegion)}%;background:${r.color}"></i></div>
            <div class="row g8 wrap mt12"><span class="chip">${ic('store', 13)}${cnt('business')}</span><span class="chip">${ic('factory', 13)}${cnt('industry')}</span><span class="chip">${ic('building-2', 13)}${cnt('realestate')}</span></div>` : ''}</div>
          ${open ? ic('chevron-right', 18) : ''}</div></div>`; }).join('')}</div>${sellCard()}`;
}

/** Every business you own, working live: what it earns each second and what it has earned in total. */
function liveCard() {
  const rows = S.data.assets.filter(a => levelOf(a.id)).map(a => ({ a, ...revLive(a.id) })).sort((x, y) => y.ps - x.ps);
  if (!rows.length) return `<div class="card" style="margin-bottom:12px"><div class="row" style="gap:12px">${ic('trending-up', 22)}<div><b>Your business is empty</b><div class="t-sm muted">Buy your first shop below. Each one shows its own live income here.</div></div></div></div>`;
  const total = (S.st.income_per_hour || 0) / 3600, shown = rows.slice(0, 8);
  return `<div class="card" style="margin-bottom:12px"><div class="row between"><b>Live revenue</b><span class="pos num" id="liveTotal">+${money(total)}/s</span></div>
    <div class="t-sm muted" style="margin:2px 0 8px">Each business adds its income to your balance every second.</div>
    <div class="stack" style="gap:6px">${shown.map(({ a, ps, earned }) => `<div class="row between t-sm"><span class="ell" style="max-width:52%">${esc(a.name)}</span><span class="num"><span class="pos" data-ps="${a.id}">+${money(ps)}/s</span> <span class="muted">· <span data-earn="${a.id}">${money(earned)}</span></span></span></div>`).join('')}
      ${rows.length > shown.length ? `<div class="t-sm muted">and ${rows.length - shown.length} more working for you</div>` : ''}</div></div>`;
}

function sellCard() {
  const st = S.st, n = Object.keys(st.owned).length, boosts = st.rank_boosts || 0, min = S.data.expand.sell.minAssets;
  const wait = st.sell_ready_at && new Date(st.sell_ready_at).getTime() > Date.now() ? Math.ceil((new Date(st.sell_ready_at).getTime() - Date.now()) / 3600e3) : 0;
  const refund = st.biz_value * S.data.expand.sell.refund;
  return `<div class="card" style="margin-top:12px"><div class="row" style="gap:12px;align-items:flex-start">${ic('trophy', 24)}<div class="grow"><b>Sell your whole business</b>
    <div class="t-sm muted" style="margin:2px 0 10px">Get ${S.data.expand.sell.refund * 100}% of what your businesses are worth back in cash and earn a <b>Rank Boost</b>: it moves you up 5 places on the world ranking. If you are already #1 the boost waits until someone passes you.</div>
    <div class="row g8 wrap"><span class="chip">${ic('trophy', 13)}${boosts} boost${boosts === 1 ? '' : 's'} saved</span>${n >= min ? `<span class="chip">Cash back ${money(refund)}</span>` : ''}</div>
    <div class="row g8 wrap mt12"><button class="btn ${n >= min && !wait ? 'primary' : ''}" data-act="sell-biz" ${n >= min && !wait ? '' : 'disabled'}>${n < min ? `Own ${min} businesses first` : wait ? `Ready in ${wait} h` : 'Sell business'}</button>
      <button class="btn" data-act="use-boost" ${boosts ? '' : 'disabled'}>Use a boost</button></div></div></div></div>`;
}

function assetCard(a, color) {
  const lvl = levelOf(a.id), max = S.data.assetMaxLevel, cash = S.cash;
  const t = `<div class="arttile">${assetArt(a, color)}</div>`;
  if (!lvl) {
    const can = cash >= a.cost;
    return `<div class="li">${t}<div class="grow"><div class="b ell">${esc(a.name)}</div>
      <div class="t-sm muted num"><span class="pos">+${money(a.income)}/h</span> · pays back in ${a.payback < 1 ? Math.round(a.payback * 60) + ' min' : a.payback.toFixed(1) + ' h'}</div></div>
      <button class="price ${can ? '' : 'off'}" data-act="buy" data-id="${a.id}" data-cost="${a.cost}">${money(a.cost)}</button></div>`;
  }
  const up = lvl < max ? a.upgrade[lvl - 1] : null;
  return `<div class="li owned">${t}<div class="grow"><div class="b ell">${esc(a.name)}</div>
    <div class="t-sm num"><span class="pos" data-ps="${a.id}">+${money(revLive(a.id).ps)}/s</span> <span class="muted">· Level ${lvl} · earned <span data-earn="${a.id}">${money(revLive(a.id).earned)}</span></span></div>
    <div class="pips mt8">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
    ${up ? `<button class="price alt ${cash >= up ? '' : 'off'}" data-act="upg" data-id="${a.id}" data-cost="${up}">${ic('arrow-up', 14, '', 2.4)}&nbsp;${money(up)}</button>` : '<span class="chip gold">Max</span>'}</div>`;
}

function drawRegion() {
  const idx = S.data.regions.findIndex(r => r.id === regionId), r = S.data.regions[idx];
  if (!r || !regionUnlocked(idx)) { location.hash = '#/invest'; return; }
  const as = assetsOf(r.id), n = regionOwned(r.id);
  const list = as.filter(a => a.cat === cat);
  const cats = [['business', 'Business', 'store'], ['industry', 'Industry', 'factory'], ['realestate', 'Property', 'building-2']];
  const incomeHere = as.reduce((s, a) => s + (levelOf(a.id) ? incomeOf(a, levelOf(a.id)) : 0), 0);
  root.innerHTML = `${pageHeader(r.name)}
    <div class="card"><div class="row" style="gap:16px"><div style="width:88px;flex:none">${regionShape(r, n / S.data.perRegion)}</div>
      <div class="grow"><div class="row between"><b class="t-xl num">${n}<span class="muted t-md"> / ${S.data.perRegion}</span></b><span class="t-sm pos num">+${money(incomeHere)}/h</span></div><div class="bar mt8"><i style="width:${(n * 100 / S.data.perRegion)}%;background:${r.color}"></i></div>
      <div class="t-sm muted mt8">Own all ${S.data.perRegion} for <b class="goldt">+${S.data.regionSetBonus * 100}% income</b> in this region.</div></div></div></div>
    <div class="seg mt12">${cats.map(([id, label, icon]) => `<button class="${cat === id ? 'on' : ''}" data-act="cat" data-id="${id}">${ic(icon, 16)}${label}</button>`).join('')}</div>
    <div class="group mt12" id="assetList">${list.map(a => assetCard(a, r.color)).join('')}</div>`;
}

const draw = () => (regionId ? drawRegion() : drawList());

ACT['sell-biz'] = () => {
  const st = S.st, refund = st.biz_value * S.data.expand.sell.refund;
  const sh = sheet(`<h2 style="margin:4px 0 6px;font-size:20px">Sell your whole business?</h2>
    <p class="muted t-sm" style="margin:0 0 12px">All ${Object.keys(st.owned).length} businesses, industries and properties are sold. You get <b>${money(refund)}</b> back and <b>1 Rank Boost</b>. Your income drops to what your items, branches and offers still earn, and you can sell again after 12 hours.</p>
    <div class="row g8"><button class="btn block" data-close>Keep it</button><button class="btn primary block" id="sellGo">Sell now</button></div>`);
  sh.el.querySelector('#sellGo').onclick = async () => { sh.close(); const r = await doAction('/api/business/sell', {}, { ok: 'Business sold. You earned a Rank Boost!' }); if (r) draw(); };
};
ACT['use-boost'] = async () => {
  const r = await doAction('/api/rank/boost', {});
  if (r) { toast(`Moved up from #${r.from} to #${r.to}`, 'good'); draw(); }
};
ACT.cat = (el) => { cat = el.dataset.id; draw(); };
ACT.buy = async (el) => { const r = await doAction('/api/assets/buy', { asset_id: el.dataset.id }, { ok: 'Purchased!' }); if (r) draw(); };
ACT.upg = async (el) => { const r = await doAction('/api/assets/upgrade', { asset_id: el.dataset.id }, { ok: 'Upgraded!' }); if (r) draw(); };

export function mount(r, arg) {
  root = r; regionId = arg || null; if (regionId) cat = 'business';
  draw();
  let last = 0;
  return {
    update(ev) {
      if (!root.isConnected) return;
      if (ev === 'state') draw();
      if (ev === 'sec') {
        syncAfford(root);   // toggle buttons in place; never re-render under a finger
        root.querySelectorAll('[data-earn]').forEach(e => { e.textContent = money(revLive(e.dataset.earn).earned); });
        root.querySelectorAll('[data-ps]').forEach(e => { e.textContent = `+${money(revLive(e.dataset.ps).ps)}/s`; });
        const lt = root.querySelector('#liveTotal'); if (lt) lt.textContent = `+${money(S.st.income_per_hour / 3600)}/s`;
      }
    },
  };
}
