import { $, esc, money, flag, avatar, ic, syncAfford, tile } from '../util.js';
import { S, ACT, countryName, regionUnlocked } from '../store.js';
import { doAction } from '../core.js';
import { get, post } from '../api.js';
import { sheet, toast, titleBlock, section } from '../ui.js';

let root, regionId = null, data = null;
const X = () => S.data.expand;
const lvlOf = (code) => S.st.branches?.[code] || 0;
const regionIdx = (id) => S.data.regions.findIndex(r => r.id === id);

function lvlPips(n) { return `<div class="lvl">${Array.from({ length: X().maxLevel }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`; }

function countryRow(c, open) {
  const lv = lvlOf(c.code), max = X().maxLevel, cost = lv < max ? c.costs[lv] : null;
  return `<div class="li" style="${open ? '' : 'opacity:.5'}"><div class="cflag">${flag(c.code)}</div>
    <div class="grow" style="min-width:0"><div class="b ell">${esc(countryName(c.code))}</div>${lv ? `<div class="row" style="gap:6px;margin-top:5px;flex-wrap:nowrap">${lvlPips(lv)}<span class="t-xs pos num" style="white-space:nowrap">+${(lv * X().incomePerLevel * 100).toFixed(1)}%</span></div>` : '<div class="t-xs muted">No branch yet</div>'}</div>
    ${lv ? `<button class="btn ghost sm" data-act="partner" data-c="${c.code}" aria-label="Partner in ${esc(countryName(c.code))}" style="padding:0 10px">${ic('handshake', 17)}</button>` : ''}
    ${cost == null ? '<span class="chip gold">Max</span>' : `<button class="price ${S.cash >= cost && open ? '' : 'off'}" data-act="branch" data-c="${c.code}" data-cost="${open ? cost : 1e300}">${lv ? ic('arrow-up', 14, '', 2.4) + '&nbsp;' : ''}${money(cost)}</button>`}</div>`;
}

function summary() {
  const st = S.st, total = Object.values(st.branches || {}).reduce((a, b) => a + b, 0), n = Object.keys(st.branches || {}).length;
  const bonus = total * X().incomePerLevel, pcount = st.partners || 0;
  return `<div class="statgrid"><div><small>Branches</small><b class="num">${n}</b></div><div><small>Branch income</small><b class="pos num">+${(bonus * 100).toFixed(1)}%</b></div><div><small>Partners</small><b class="num">${pcount} / ${X().partnerMax}</b></div></div>`;
}

function draw() {
  const regs = S.data.regions, rid = regionId || regs.find((r, i) => regionUnlocked(i))?.id || regs[0].id;
  regionId = rid;
  const list = X().regionCountries[rid], open = regionUnlocked(regionIdx(rid));
  const done = list.filter(c => lvlOf(c.code)).length;
  const links = data?.partnerships || [];
  const incoming = links.filter(l => l.incoming), active = links.filter(l => l.status === 'active'), pending = links.filter(l => l.status === 'pending' && !l.incoming);
  const lrow = (l, actions) => `<div class="li" data-act="company" data-id="${l.company.id}">${avatar(l.company.company_name, l.company.logo_url, 40)}<div class="grow"><div class="b ell">${esc(l.company.company_name)}</div><div class="t-xs muted row" style="gap:6px">${flag(l.country)}${esc(countryName(l.country))}</div></div>${actions}</div>`;
  root.innerHTML = `${titleBlock('Expand', 'Open branches and partner with companies in every country')}
    ${summary()}
    <div class="tabs mt16">${regs.map((r, i) => `<button class="${r.id === rid ? 'on' : ''}" data-act="xregion" data-id="${r.id}">${regionUnlocked(i) ? '' : '🔒 '}${esc(r.name)}</button>`).join('')}</div>
    <div class="card mt12 row between"><div><div class="b">${esc(regs[regionIdx(rid)].name)}</div><div class="t-sm muted">${open ? `${done} / ${list.length} countries · own all for <b class="goldt">+${X().regionSetBonus * 100}% income</b>` : 'Own assets in the previous region to unlock'}</div></div><span class="tile" style="--t:${regs[regionIdx(rid)].color}">${ic(open ? 'globe' : 'lock', 20)}</span></div>
    <div class="group mt12" id="cl">${list.map(c => countryRow(c, open)).join('')}</div>
    ${incoming.length ? `${section('Partnership requests')}<div class="group">${incoming.map(l => lrow(l, `<button class="btn primary sm" data-act="presp" data-id="${l.id}" data-ok="1">Accept</button><button class="btn ghost sm" data-act="presp" data-id="${l.id}" data-ok="0">Decline</button>`)).join('')}</div>` : ''}
    ${section('Your partners', `<span class="t-sm muted num">${active.length} / ${X().partnerMax} · +${(X().partnerBonus * 100).toFixed(0)}% income each</span>`)}
    ${active.length || pending.length ? `<div class="group">${active.map(l => lrow(l, `<button class="btn ghost sm" data-act="pend" data-id="${l.id}">End</button>`)).join('')}${pending.map(l => lrow(l, `<span class="chip">Waiting</span><button class="btn ghost sm" data-act="pend" data-id="${l.id}">Cancel</button>`)).join('')}</div>`
      : `<div class="card muted t-sm">Open a branch, then tap <b>Partner</b> on that country to team up with a company based there.</div>`}`;
}

async function load() { try { data = await get('/api/expand'); if (root.isConnected) draw(); } catch (e) { toast(e.message, 'err'); } }

ACT.xregion = (el) => { regionId = el.dataset.id; draw(); };
ACT.branch = async (el) => { const c = el.dataset.c, had = lvlOf(c); const r = await doAction('/api/expand/branch', { country: c }, { ok: had ? `${countryName(c)} branch upgraded` : `Branch opened in ${countryName(c)}` }); if (r) { draw(); } };
ACT.presp = async (el) => { try { await post(`/api/expand/partner/${el.dataset.id}/respond`, { accept: el.dataset.ok === '1' }); toast(el.dataset.ok === '1' ? 'Partnership started' : 'Request declined', 'good'); const { refreshState } = await import('../core.js'); await refreshState(); await load(); } catch (e) { toast(e.message, 'err'); } };
ACT.pend = async (el) => { try { await post(`/api/expand/partner/${el.dataset.id}/end`); const { refreshState } = await import('../core.js'); await refreshState(); await load(); toast('Partnership ended'); } catch (e) { toast(e.message, 'err'); } };
ACT.partner = async (el) => {
  const code = el.dataset.c, s = sheet(`<h2 style="margin:4px 0 4px;font-size:20px">Partner in ${esc(countryName(code))}</h2><p class="muted t-sm" style="margin:0 0 12px">A partner adds +${(X().partnerBonus * 100).toFixed(0)}% to your income. Demo companies accept at once; real players get a request.</p><div id="cands" class="stack"><div class="sk" style="height:56px"></div><div class="sk" style="height:56px"></div></div>`);
  try {
    const d = await get('/api/expand/candidates?country=' + code), box = $('#cands', s.el);
    box.innerHTML = d.rows.length ? `<div class="group">${d.rows.map(c => `<div class="li">${avatar(c.company_name, c.logo_url, 40)}<div class="grow"><div class="b ell">${esc(c.company_name)} ${c.demo ? '<span class="demo">DEMO</span>' : ''}</div><div class="t-xs muted ell">${esc(c.industry)}</div></div>
      ${c.link ? `<span class="chip">${c.link === 'active' ? 'Partner' : 'Requested'}</span>` : `<button class="btn primary sm" data-pick="${c.id}">Request</button>`}</div>`).join('')}</div>` : '<div class="card muted t-sm center">No companies are based here yet.</div>';
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return; b.classList.add('off');
      try { const r = await post('/api/expand/partner', { country: code, company_id: Number(b.dataset.pick) }); s.close(); toast(r.status === 'active' ? 'Partnership started' : 'Request sent', 'good'); const { refreshState } = await import('../core.js'); await refreshState(); await load(); }
      catch (err) { toast(err.message, 'err'); b.classList.remove('off'); }
    });
  } catch (e) { toast(e.message, 'err'); s.close(); }
};

export function mount(r, arg) {
  root = r; regionId = arg || regionId; data = null; draw(); load();
  return { update(ev) { if (!root.isConnected) return; if (ev === 'state') draw(); if (ev === 'sec') syncAfford(root); } };
}
