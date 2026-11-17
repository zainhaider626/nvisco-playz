import { $, esc, usdMicro, flag, avatar, ic, dur, tile } from '../util.js';
import { S, ACT, countryName } from '../store.js';
import { get, post } from '../api.js';
import { pageHeader, toast, section } from '../ui.js';

let root, d = null;
const usd = (m) => usdMicro(m);

function coRow(c, right, extra = '') {
  return `<div class="li" data-act="company" data-id="${c.id}" style="min-height:64px">${avatar(c.company_name, c.logo_url, 44)}<div class="grow"><div class="b ell">${esc(c.company_name)}</div>
    <div class="t-xs muted row" style="gap:6px">${flag(c.country)}<span class="ell">${esc(c.industry || '')}${c.tagline ? ' · ' + esc(c.tagline) : ''}</span></div>${extra}</div>${right}</div>`;
}
function draw() {
  if (!d) { root.innerHTML = `${pageHeader('Top spot')}<div class="sk" style="height:180px;border-radius:16px"></div>`; return; }
  const o = d.open, me = o.me, left = new Date(o.ends_at) - Date.now(), min = o.next_min_micro;
  root.innerHTML = `${pageHeader('Top spot')}
    <div class="hero"><div class="t-xs muted b" style="text-transform:uppercase;letter-spacing:.08em">Auction ends in</div>
      <div class="countdown" id="acd" style="font-size:36px;margin:4px 0 10px">${dur(left)}</div>
      <div class="row between t-sm"><span class="muted">Top ${o.slots} companies get the featured spot</span><b class="num">${o.total_bidders} bidder${o.total_bidders === 1 ? '' : 's'}</b></div>
      <div class="row between t-sm mt8"><span class="muted">${o.bids.length >= o.slots ? 'Bid to beat' : 'Starting bid'}</span><b class="num">${usd(o.bids.length >= o.slots ? o.cut_micro : o.min_bid_micro)}</b></div>
      ${me ? `<div class="chip ${me.winning ? 'pos' : 'gold'}" style="margin-top:12px">${me.winning ? 'You hold a top spot' : `You are #${me.rank}`} · your bid ${usd(me.bid_micro)}</div>` : ''}
      <form id="bid" class="mt16" novalidate><div class="row" style="gap:8px"><input id="bamt" inputmode="decimal" placeholder="${(min / 1e6).toFixed(2)}" value="${(min / 1e6).toFixed(2)}" style="font-weight:700;font-size:18px" autocomplete="off"><button class="btn primary" style="flex:none;min-width:120px" type="submit">${me ? 'Raise bid' : 'Place bid'}</button></div>
        <div class="row mt8" style="gap:6px">${[0.5, 1, 5, 10].map(x => `<button type="button" class="btn sm grow" data-act="bump" data-v="${x}">+$${x}</button>`).join('')}</div>
        <div class="row between t-sm mt12"><span class="muted">Your credits</span><span class="row" style="gap:8px"><b class="num">${usd(d.credits_micro)}</b><button type="button" class="btn sm" data-act="go-wallet">Add</button></span></div>
        <div class="err" id="berr" role="alert"></div></form>
      <p class="t-xs dim" style="margin:8px 0 0">Your bid is held from your credits. If you are outbid you are refunded when the auction closes; winners pay their own bid. A bid in the last minutes extends the clock.</p></div>
    ${section('Live bids')}
    ${o.bids.length ? `<div class="stack" style="gap:8px">${o.bids.slice(0, 10).map(b => `<div class="podium ${b.rank === 1 ? 'first' : ''}" data-act="company" data-id="${b.company.id}"><div class="no">${b.rank}</div>${avatar(b.company.company_name, b.company.logo_url, 40)}<div class="grow"><div class="b ell">${esc(b.company.company_name)} ${b.mine ? '<span class="chip pos" style="height:20px">You</span>' : ''}</div><div class="t-xs muted">${b.winning ? 'In a top spot' : 'Outbid'}</div></div><b class="num">${usd(b.amount_micro)}</b></div>`).join('')}</div>` : '<div class="card center muted">No bids yet. Be the first. Bidding starts at $1.</div>'}
    ${d.spots.length ? `${section('Featured right now')}<div class="group">${d.spots.map(s => coRow(s.company, `<span class="chip gold">#${s.rank}</span>`)).join('')}</div>` : ''}
    ${section('Recent winners')}
    ${d.recent.length ? `<div class="group">${d.recent.map(s => coRow(s.company, `<div style="text-align:right"><b class="num">${usd(s.amount_micro)}</b><div class="t-xs muted">#${s.rank} · ${new Date(s.closed_at).toLocaleDateString()}</div></div>`, s.company.website ? `<div class="t-xs dim ell">${esc(s.company.website)}</div>` : '')).join('')}</div>` : '<div class="card center muted">Winners will appear here after the first auction closes.</div>'}`;
  $('#bid', root).addEventListener('submit', async (e) => {
    e.preventDefault(); $('#berr', root).textContent = '';
    try { const r = await post('/api/auction/bid', { amount_usd: Number($('#bamt', root).value) }); d = r; if (S.st) S.st.credits_micro = r.credits_micro; toast('Bid placed', 'good'); draw(); }
    catch (err) { $('#berr', root).textContent = err.message; }
  });
}
async function load() { try { d = await get('/api/auction'); if (root.isConnected) draw(); } catch (e) { toast(e.message, 'err'); } }
ACT.bump = (el) => { const i = $('#bamt', root); i.value = ((Number(i.value) || 0) + Number(el.dataset.v)).toFixed(2); };
ACT['go-wallet'] = () => { location.hash = '#/wallet'; };

export function mount(r) {
  root = r; d = null; draw(); load();
  return {
    update(ev) {
      if (!root.isConnected) return;
      if (ev === 'auction') { if (!root.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') load(); }
      if (ev === 'sec' && d) { const e = $('#acd', root); if (e) { const l = new Date(d.open.ends_at) - Date.now(); e.textContent = dur(l); if (l < -2000) load(); } }
    },
  };
}
