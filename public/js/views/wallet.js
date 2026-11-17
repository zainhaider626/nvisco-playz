import { $, esc, usdMicro, ic, flag, tile } from '../util.js';
import { S, ACT } from '../store.js';
import { get, post } from '../api.js';
import { refreshState } from '../core.js';
import { pageHeader, toast } from '../ui.js';

let root, w = null, method = null;
const STATUS = { pending: ['Waiting for check', 'gold'], approved: ['Added', 'pos'], rejected: ['Rejected', ''] };

function draw() {
  if (!w) { root.innerHTML = `${pageHeader('Credits')}<div class="sk" style="height:140px;border-radius:16px"></div>`; return; }
  const pay = w.payments, ms = pay.methods, m = ms.find(x => x.id === method) || ms[0];
  if (m) method = m.id;
  const led = (k) => ({ deposit: 'Credits added', auction_hold: 'Auction bid', auction_refund: 'Bid returned', admin: 'Added by Nvisco' }[k] || k.replace(/_/g, ' '));
  root.innerHTML = `${pageHeader('Credits')}
    <div class="card"><div class="row between"><div><div class="t-sm muted">Game credits</div><div class="num" style="font-size:32px;font-weight:700;letter-spacing:-.03em">${usdMicro(w.credits_micro)}</div></div>${tile('banknote', '#ffffff', 'lg')}</div>
      <p class="t-xs muted" style="margin:10px 0 0">Credits are used to bid for the top spot and to promote your company. They cannot be withdrawn.</p></div>
    <div class="row mt12" style="gap:8px"><button class="btn primary grow" data-act="go-auction">${ic('megaphone', 17)}Top-spot auction</button></div>
    <div class="sect"><h2>Add credits</h2></div>
    ${!ms.length ? '<div class="card muted t-sm">Deposits are not open yet. Check back soon.</div>' : `<form class="card" id="dep" novalidate>
      <div class="methods">${ms.map(x => `<button type="button" class="method ${x.id === method ? 'on' : ''}" data-act="pm" data-id="${x.id}">${tile('wallet', '#fff')}<div class="grow"><div class="b">${esc(x.label)}</div><div class="t-xs muted">${esc(x.account_title)}</div></div>${x.id === method ? ic('check', 18, '', 2.6) : ''}</button>`).join('')}</div>
      <div class="mt12 stack" style="gap:8px"><div class="copyrow"><div><div class="t-xs muted">Send to ${esc(m.label)} account</div><div class="b num" style="font-size:17px">${esc(m.account_number)}</div></div><button type="button" class="btn sm" data-act="copy" data-v="${esc(m.account_number)}">${ic('copy', 15)}Copy</button></div>
        ${m.note ? `<div class="t-xs muted">${esc(m.note)}</div>` : ''}${pay.instructions ? `<div class="t-sm muted">${esc(pay.instructions)}</div>` : ''}</div>
      <label class="f">Amount (US dollars)</label><input name="amount_usd" id="amt" inputmode="decimal" placeholder="${pay.min_usd}" autocomplete="off">
      <div class="t-sm muted" id="pkr" style="margin-top:6px">Rate: $1 = Rs ${pay.pkr_per_usd}. Min $${pay.min_usd}, max $${pay.max_usd}.</div>
      <label class="f">Transaction ID from your payment receipt</label><input name="txn_id" placeholder="e.g. 4829105736" autocomplete="off">
      <label class="f">Sender name or number (optional)</label><input name="sender" maxlength="60" autocomplete="off">
      <div class="err" id="derr" role="alert"></div><button class="btn primary block" type="submit" style="height:50px">I have paid: submit for checking</button>
      <p class="t-xs dim center" style="margin:10px 0 0">After you pay, we match the transaction ID to our account and add your credits, usually within a few hours.</p></form>`}
    ${w.deposits.length ? `<div class="sect"><h2>Your deposits</h2></div><div class="group">${w.deposits.map(d => { const [t, c] = STATUS[d.status] || [d.status, '']; return `<div class="li"><div class="grow"><div class="b num">${usdMicro(d.usd_micro)} <span class="muted t-sm">· Rs ${Math.round(d.local)}</span></div><div class="t-xs muted ell">${esc(d.method)} · ${esc(d.txn_id)}${d.admin_note ? ' · ' + esc(d.admin_note) : ''}</div></div><span class="chip ${c}">${t}</span></div>`; }).join('')}</div>` : ''}
    ${w.ledger.length ? `<div class="sect"><h2>Activity</h2></div><div class="group">${w.ledger.slice(0, 10).map(l => `<div class="li" style="min-height:48px"><span class="grow">${esc(led(l.kind))}</span><b class="num ${l.micro >= 0 ? 'pos' : ''}">${l.micro >= 0 ? '+' : '-'}${usdMicro(Math.abs(l.micro))}</b></div>`).join('')}</div>` : ''}`;
  const f = $('#dep', root);
  if (f) {
    const upd = () => { const v = Number(f.amount_usd.value); $('#pkr', root).innerHTML = v > 0 ? `You pay <b>Rs ${Math.round(v * pay.pkr_per_usd).toLocaleString('en-US')}</b> (rate Rs ${pay.pkr_per_usd} per $1)` : `Rate: $1 = Rs ${pay.pkr_per_usd}. Min $${pay.min_usd}, max $${pay.max_usd}.`; };
    f.amount_usd.addEventListener('input', upd);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); $('#derr', root).textContent = '';
      try { const r = await post('/api/wallet/deposit', { method, amount_usd: Number(fd.amount_usd), txn_id: fd.txn_id, sender: fd.sender }); toast(`Submitted. Rs ${r.pkr} received will be checked soon.`, 'good'); await load(); }
      catch (err) { $('#derr', root).textContent = err.message; }
    });
  }
}
async function load() { try { w = await get('/api/wallet'); S.st.credits_micro = w.credits_micro; if (root.isConnected) draw(); } catch (e) { toast(e.message, 'err'); } }
ACT.pm = (el) => { const keep = $('#dep', root) ? Object.fromEntries(new FormData($('#dep', root))) : {}; method = el.dataset.id; draw(); const f = $('#dep', root); if (f && keep.amount_usd) { f.amount_usd.value = keep.amount_usd; f.txn_id.value = keep.txn_id || ''; } };
ACT['go-auction'] = () => { location.hash = '#/auction'; };

export function mount(r) { root = r; w = null; draw(); load(); return { update(ev) { if (ev === 'notice') load(); } }; }
