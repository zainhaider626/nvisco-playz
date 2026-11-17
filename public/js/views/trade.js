import { $, $$, esc, fmt, money, pct, ic } from '../util.js';
import { S, ACT } from '../store.js';
import { doAction } from '../core.js';
import { sheet, titleBlock, section } from '../ui.js';
import { stockLogo } from '../art.js';

let root, openId = null, sh = null, qty = '1', side = 'buy', busy = false;
const price = (id) => S.market.stocks.find(s => s.id === id);
const def = (id) => S.data.stocks.find(s => s.id === id);
const num = (n) => Math.floor(n).toLocaleString('en-US');
const sh1 = (n) => `${num(n)} share${Math.floor(n) === 1 ? '' : 's'}`;
const held = (id) => S.st.holdings[id]?.shares || 0;

function spark(h, w = 92, ht = 34, area = true, cls = 'spark') {
  if (!h || h.length < 2) return `<svg class="${cls}" viewBox="0 0 ${w} ${ht}"></svg>`;
  const min = Math.min(...h), max = Math.max(...h), span = max - min || 1;
  const pts = h.map((v, i) => [(i / (h.length - 1)) * w, ht - 3 - ((v - min) / span) * (ht - 6)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const up = h[h.length - 1] >= h[0], col = up ? '#3ddc97' : '#f87171';
  return `<svg class="${cls}" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none">${area ? `<path d="${line} L${w} ${ht} L0 ${ht}Z" fill="${col}" opacity=".14"/>` : ''}<path d="${line}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function pnlOf(id) { const h = S.st.holdings[id]; if (!h || !h.shares) return null; const v = h.shares * price(id).price; return { value: v, pnl: v - h.cost, pct: h.cost ? v / h.cost - 1 : 0 }; }

function rowHtml(s) {
  const m = price(s.id), pl = pnlOf(s.id);
  return `${stockLogo(s, 42)}<div class="grow"><div class="b ell">${esc(s.name)}</div>
    <div class="t-sm ${pl ? (pl.pnl >= 0 ? 'pos' : 'neg') : 'muted'} ell num">${pl ? `${sh1(held(s.id))} · ${pl.pnl >= 0 ? '+' : '-'}${money(Math.abs(pl.pnl))}` : `${s.id} · ${esc(s.sector)}`}</div></div>
    ${spark(m.history)}<div style="text-align:right;min-width:72px"><div class="num b">${money(m.price)}</div><div class="t-sm num ${m.chg >= 0 ? 'pos' : 'neg'}">${pct(m.chg)}</div></div>`;
}
function totals() {
  let value = 0, cost = 0;
  for (const [id, h] of Object.entries(S.st.holdings)) { if (!h.shares) continue; value += h.shares * price(id).price; cost += h.cost; }
  return { value, cost, pnl: value - cost, p: cost ? value / cost - 1 : 0 };
}
function summaryHtml() {
  const t = totals(), cls = t.pnl >= 0 ? 'pos' : 'neg';
  return `<div class="row between"><div><div class="t-sm muted">Portfolio value</div><div class="num" style="font-size:30px;font-weight:700;letter-spacing:-.03em">${money(t.value)}</div></div>
    <div style="text-align:right"><div class="t-sm muted">Profit / loss</div><div class="num b t-lg ${cls}">${t.pnl >= 0 ? '+' : '-'}${money(Math.abs(t.pnl))}</div><span class="chip ${t.pnl >= 0 ? 'pos' : 'neg'}" style="margin-top:2px">${pct(t.p)}</span></div></div>`;
}

function draw() {
  root.innerHTML = `${titleBlock('Trade', 'Prices move every few seconds')}
    <div class="card" id="tsum">${summaryHtml()}</div>
    ${section('Market')}
    <div class="group" id="tlist">${S.data.stocks.map(s => `<div class="li" data-act="stock" data-id="${s.id}" data-row="${s.id}">${rowHtml(s)}</div>`).join('')}</div>`;
}
/** Update prices in place so nothing under a finger is ever replaced. */
function refresh() {
  if (!root?.isConnected) return;
  const sm = $('#tsum', root); if (sm) sm.innerHTML = summaryHtml();
  for (const s of S.data.stocks) { const r = root.querySelector(`[data-row="${s.id}"]`); if (r) r.innerHTML = rowHtml(s); }
  if (sh && openId) updateSheetLive();
}

// ------------------------------------------------------------------ order sheet
function limits() {
  const m = price(openId), fee = S.data.stockFee, max = S.data.stockMax, h = held(openId);
  const buyMax = Math.max(0, Math.min(max - h, Math.floor(S.cash / (m.price * (1 + fee)))));
  return { m, fee, buyMax, sellMax: h };
}
function parsedQty() { const n = Math.floor(Number(qty)); return Number.isFinite(n) && n > 0 ? n : 0; }
function orderState() {
  const { m, fee, buyMax, sellMax } = limits(), n = parsedQty(), max = side === 'buy' ? buyMax : sellMax;
  let msg = '', ok = true;
  if (!n) { ok = false; msg = side === 'buy' ? (buyMax ? `You can buy up to ${num(buyMax)} shares` : 'Not enough cash for a share yet') : (sellMax ? `You own ${num(sellMax)} shares` : 'You do not own any shares of this company'); }
  else if (n > max) { ok = false; msg = side === 'buy' ? (buyMax ? `You can buy at most ${num(buyMax)} shares right now` : 'Not enough cash for that order') : `You only own ${num(sellMax)} shares`; }
  else { const gross = n * m.price; msg = side === 'buy' ? `${sh1(n)} ≈ ${money(gross)} + ${money(gross * fee)} fee` : `${sh1(n)} ≈ ${money(gross)} − ${money(gross * fee)} fee = ${money(gross * (1 - fee))}`; }
  return { n, max, ok, msg, m };
}
function sheetHtml() {
  const s = def(openId), m = price(openId), pl = pnlOf(openId), h = held(openId), o = orderState();
  const lo = Math.min(...m.history), hi = Math.max(...m.history);
  return `<div class="row between"><div class="row">${stockLogo(s, 46)}
      <div><div class="b t-lg">${esc(s.name)}</div><div class="t-sm muted">${s.id} · ${esc(s.sector)}</div></div></div>
      <div style="text-align:right"><div class="num b" style="font-size:20px" data-live="px">${money(m.price)}</div><div class="t-sm num ${m.chg >= 0 ? 'pos' : 'neg'}" data-live="chg">${pct(m.chg)}</div></div></div>
    <div style="margin:14px 0 2px" data-live="chart">${spark(m.history, 300, 150, true, 'chart')}</div>
    <div class="row between t-xs muted num"><span>Low ${money(lo)}</span><span>High ${money(hi)}</span></div>
    <div class="group" style="margin:14px 0;padding:0 14px" data-live="pos">${posHtml(pl, h)}</div>
    <div class="buysell"><button class="buy ${side === 'buy' ? 'on' : ''}" data-act="side" data-side="buy">Buy</button><button class="sell ${side === 'sell' ? 'on' : ''}" data-act="side" data-side="sell">Sell</button></div>
    <label class="f" style="margin-top:0">Shares</label><input id="qty" inputmode="numeric" placeholder="1" value="${esc(qty)}" autocomplete="off">
    <div class="qty"><button data-act="qty" data-p="0.25">25%</button><button data-act="qty" data-p="0.5">50%</button><button data-act="qty" data-p="0.75">75%</button><button data-act="qty" data-p="1">${side === 'buy' ? 'Max' : 'All'}</button></div>
    <div class="t-sm center num" id="est" style="min-height:20px;color:${o.ok ? 'var(--tx2)' : 'var(--gold)'}">${esc(o.msg)}</div>
    <button class="btn block mt12 ${side === 'buy' ? 'primary' : 'sellgo'} ${busy ? 'off' : ''}" id="go" data-act="trade" style="height:50px">${side === 'buy' ? 'Buy' : 'Sell'}${o.n ? ' ' + num(o.n) : ''}</button>
    <p class="t-xs dim center" style="margin:12px 0 0">Max ${num(S.data.stockMax)} shares per company · ${S.data.stockFee * 100}% fee on each order. Realised profit counts toward your ranking.</p>`;
}
const posHtml = (pl, h) => `${h ? `<div class="kv"><span>Your position</span><b class="num">${sh1(h)} · ${money(pl.value)}</b></div>
      <div class="kv"><span>Profit / loss</span><b class="num ${pl.pnl >= 0 ? 'pos' : 'neg'}">${pl.pnl >= 0 ? '+' : '-'}${money(Math.abs(pl.pnl))} (${pct(pl.pct)})</b></div>` : ''}
      <div class="kv"><span>Available cash</span><b class="num">${money(S.cash)}</b></div>`;

/** Price, chart and position tick in place; the input and buttons are never replaced while the sheet is open. */
function updateSheetLive() {
  const m = price(openId), pl = pnlOf(openId), h = held(openId), el = sh.el;
  const set = (k, html) => { const e = el.querySelector(`[data-live="${k}"]`); if (e) e.innerHTML = html; };
  set('px', money(m.price)); const c = el.querySelector('[data-live="chg"]'); if (c) { c.textContent = pct(m.chg); c.className = `t-sm num ${m.chg >= 0 ? 'pos' : 'neg'}`; }
  set('chart', spark(m.history, 300, 150, true, 'chart')); set('pos', posHtml(pl, h));
  paintOrder();
}
function paintOrder() {
  const el = sh?.el; if (!el) return; const o = orderState();
  const est = $('#est', el); if (est) { est.textContent = o.msg; est.style.color = o.ok ? 'var(--tx2)' : 'var(--gold)'; }
  const go = $('#go', el); if (go) { go.textContent = (side === 'buy' ? 'Buy' : 'Sell') + (o.n ? ' ' + num(o.n) : ''); go.classList.toggle('off', busy); }
}
function renderSheet() {
  if (!sh || !openId) return;
  sh.el.innerHTML = '<div class="grab"></div>' + sheetHtml();
  const inp = $('#qty', sh.el);
  inp.addEventListener('input', () => { qty = inp.value.replace(/[^\d]/g, '').slice(0, 9); inp.value = qty; paintOrder(); });
}

ACT.stock = (el) => {
  openId = el.dataset.id; qty = '1'; side = held(openId) ? 'sell' : 'buy'; busy = false;
  sh = sheet('', { onClose: () => { sh = null; openId = null; } }); renderSheet();
};
ACT.side = (el) => { side = el.dataset.side; const o = limits(); qty = String(Math.max(1, Math.min(parsedQty() || 1, (side === 'buy' ? o.buyMax : o.sellMax) || 1))); renderSheet(); };
ACT.qty = (el) => {
  const { buyMax, sellMax } = limits(), p = Number(el.dataset.p), base = side === 'buy' ? buyMax : sellMax;
  qty = String(Math.max(1, Math.floor(base * p))); const inp = $('#qty', sh.el); if (inp) inp.value = qty; paintOrder();
};
ACT.trade = async () => {
  if (busy) return;
  const o = orderState();
  if (!o.ok) { const { toast } = await import('../ui.js'); toast(o.msg, 'err'); return; }
  busy = true; paintOrder();
  const r = await doAction('/api/trade', { stock_id: openId, side, shares: o.n }, { ok: side === 'buy' ? `Bought ${num(o.n)} ${openId}` : `Sold ${num(o.n)} ${openId}` });
  busy = false;
  if (r && sh) { const left = held(openId); if (side === 'sell' && !left) side = 'buy'; qty = '1'; renderSheet(); }
  else paintOrder();
};

export function mount(r) {
  root = r; draw();
  return { destroy() { sh?.close(); }, update(ev) { if (!root.isConnected) return; if (ev === 'tick' || ev === 'market') refresh(); else if (ev === 'state') { refresh(); } } };
}
