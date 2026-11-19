import { $, $$, esc, fmt, money, pct, ic } from '../util.js';
import { S, ACT } from '../store.js';
import { doAction } from '../core.js';
import { post } from '../api.js';
import { sheet, titleBlock, section } from '../ui.js';
import { stockLogo } from '../art.js';

let root, openId = null, sh = null, qty = '1', side = 'buy', busy = false, ctype = 'candles';
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

/** Binance-style chart: grid with price axis, candles or line, a dotted line at your entry price, stop-loss / take-profit lines and a live price tag. */
function bigChart(id) {
  const m = price(id), hd = S.st.holdings[id], W = 340, H = 210, L = 6, R = 58, T = 10, B = 18, pw = W - L - R, ph = H - T - B;
  const h = m.history.slice(-66); if (h.length < 3) return `<svg class="chart" viewBox="0 0 ${W} ${H}"></svg>`;
  const entry = hd?.shares ? hd.cost / hd.shares : null, sl = hd?.stop_loss ?? null, tp = hd?.take_profit ?? null;
  const per = 3, candles = []; for (let i = 0; i < h.length; i += per) { const g = h.slice(i, i + per + 1); candles.push({ o: g[0], c: g[g.length - 1], hi: Math.max(...g), lo: Math.min(...g) }); }
  const vals = [...h, ...[entry, sl, tp].filter(v => v != null)];
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo || hi * 0.02) * 0.08; lo -= pad; hi += pad;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * ph, last = h[h.length - 1], up = last >= h[0], col = up ? '#3ddc97' : '#f87171';
  const used = []; const tag = (v, text, c, txt = '#000') => { let ty = y(v); for (const u of used) if (Math.abs(ty - u) < 17) ty = u + (ty >= u ? 17 : -17); used.push(ty); return `<g><rect x="${W - R + 2}" y="${(ty - 8).toFixed(1)}" width="${R - 4}" height="16" rx="3" fill="${c}"/><text x="${W - R / 2}" y="${(ty + 3.6).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${txt}">${text}</text></g>`; };
  const line = (v, c, dash = '4 3') => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${c}" stroke-width="1.2" stroke-dasharray="${dash}"/>`;
  const grid = Array.from({ length: 5 }, (_, i) => { const v = lo + (hi - lo) * i / 4; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,.07)"/><text x="${W - R + 5}" y="${(y(v) + 3).toFixed(1)}" font-size="9" fill="rgba(255,255,255,.45)">${fmt(v)}</text>`; }).join('');
  let body;
  if (ctype === 'candles') {
    const cw = pw / candles.length;
    body = candles.map((k, i) => { const x = L + cw * i + cw / 2, u = k.c >= k.o, c = u ? '#3ddc97' : '#f87171', top = y(Math.max(k.o, k.c)), bh = Math.max(1.2, Math.abs(y(k.o) - y(k.c)));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(k.hi).toFixed(1)}" y2="${y(k.lo).toFixed(1)}" stroke="${c}" stroke-width="1"/><rect x="${(x - cw * 0.3).toFixed(1)}" y="${top.toFixed(1)}" width="${(cw * 0.6).toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}" rx="1"/>`; }).join('');
  } else {
    const pts = h.map((v, i) => [L + pw * i / (h.length - 1), y(v)]), d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    body = `<path d="${d} L${L + pw} ${T + ph} L${L} ${T + ph}Z" fill="${col}" opacity=".13"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/>` +
      pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 3.4 : 1.6}" fill="${i === pts.length - 1 ? '#fff' : col}"/>`).join('');
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price chart">${grid}${body}
    ${line(last, col, '2 3')}${tag(last, fmt(last), col)}
    ${entry != null ? line(entry, '#ffffff') + tag(entry, 'Entry ' + fmt(entry), '#ffffff') : ''}
    ${sl != null ? line(sl, '#f87171') + tag(sl, 'SL ' + fmt(sl), '#f87171') : ''}${tp != null ? line(tp, '#3ddc97') + tag(tp, 'TP ' + fmt(tp), '#3ddc97') : ''}
    <text x="${L}" y="${H - 4}" font-size="9" fill="rgba(255,255,255,.4)">older</text><text x="${L + pw}" y="${H - 4}" font-size="9" text-anchor="end" fill="rgba(255,255,255,.4)">now · live</text></svg>`;
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
    <div class="row between" style="margin:12px 0 4px"><span class="t-xs muted">Live chart · updates every few seconds</span><span class="seg-s"><button class="${ctype === 'candles' ? 'on' : ''}" data-act="ctype" data-id="candles">Candles</button><button class="${ctype === 'line' ? 'on' : ''}" data-act="ctype" data-id="line">Line</button></span></div>
    <div data-live="chart">${bigChart(openId)}</div>
    <div class="row between t-xs muted num"><span>Low ${money(lo)}</span><span>High ${money(hi)}</span></div>
    <div class="group" style="margin:14px 0;padding:0 14px" data-live="pos">${posHtml(pl, h)}</div>
    ${h ? ordersHtml() : ''}
    <div class="buysell"><button class="buy ${side === 'buy' ? 'on' : ''}" data-act="side" data-side="buy">Buy</button><button class="sell ${side === 'sell' ? 'on' : ''}" data-act="side" data-side="sell">Sell</button></div>
    <label class="f" style="margin-top:0">Shares</label><input id="qty" inputmode="numeric" placeholder="1" value="${esc(qty)}" autocomplete="off">
    <div class="qty"><button data-act="qty" data-p="0.25">25%</button><button data-act="qty" data-p="0.5">50%</button><button data-act="qty" data-p="0.75">75%</button><button data-act="qty" data-p="1">${side === 'buy' ? 'Max' : 'All'}</button></div>
    <div class="t-sm center num" id="est" style="min-height:20px;color:${o.ok ? 'var(--tx2)' : 'var(--gold)'}">${esc(o.msg)}</div>
    <button class="btn block mt12 ${side === 'buy' ? 'primary' : 'sellgo'} ${busy ? 'off' : ''}" id="go" data-act="trade" style="height:50px">${side === 'buy' ? 'Buy' : 'Sell'}${o.n ? ' ' + num(o.n) : ''}</button>
    <p class="t-xs dim center" style="margin:12px 0 0">Max ${num(S.data.stockMax)} shares per company · ${S.data.stockFee * 100}% fee on each order. Realised profit counts toward your ranking.</p>`;
}
function ordersHtml() {
  const m = price(openId), hd = S.st.holdings[openId] || {}, p = m.price, v = (x) => (x == null ? '' : String(Number(x.toFixed(x < 10 ? 3 : 2))));
  return `<div class="group" style="margin:0 0 14px;padding:12px 14px" id="orders"><div class="b" style="margin-bottom:2px">Stop loss &amp; take profit</div>
    <div class="t-xs muted" style="margin-bottom:10px">When the price touches a line, your whole position is sold for you, even while you are away.</div>
    <div class="row g8"><div class="grow"><label class="f" style="margin:0 0 4px">Stop loss ($)</label><input id="slv" inputmode="decimal" placeholder="below ${fmt(p)}" value="${v(hd.stop_loss)}" autocomplete="off"></div>
      <div class="grow"><label class="f" style="margin:0 0 4px">Take profit ($)</label><input id="tpv" inputmode="decimal" placeholder="above ${fmt(p)}" value="${v(hd.take_profit)}" autocomplete="off"></div></div>
    <div class="qty" style="margin-top:8px"><button data-act="ordp" data-k="sl" data-p="0.95">SL −5%</button><button data-act="ordp" data-k="sl" data-p="0.9">SL −10%</button><button data-act="ordp" data-k="tp" data-p="1.1">TP +10%</button><button data-act="ordp" data-k="tp" data-p="1.25">TP +25%</button></div>
    <div class="row g8 mt12"><button class="btn primary block" data-act="ordset">Set lines</button><button class="btn block" data-act="ordclr">Clear</button></div></div>`;
}
const posHtml = (pl, h) => `${h ? `<div class="kv"><span>Your position</span><b class="num">${sh1(h)} · ${money(pl.value)}</b></div>
      <div class="kv"><span>Profit / loss</span><b class="num ${pl.pnl >= 0 ? 'pos' : 'neg'}">${pl.pnl >= 0 ? '+' : '-'}${money(Math.abs(pl.pnl))} (${pct(pl.pct)})</b></div>` : ''}
      <div class="kv"><span>Available cash</span><b class="num">${money(S.cash)}</b></div>`;

/** Price, chart and position tick in place; the input and buttons are never replaced while the sheet is open. */
function updateSheetLive() {
  const m = price(openId), pl = pnlOf(openId), h = held(openId), el = sh.el;
  const set = (k, html) => { const e = el.querySelector(`[data-live="${k}"]`); if (e) e.innerHTML = html; };
  set('px', money(m.price)); const c = el.querySelector('[data-live="chg"]'); if (c) { c.textContent = pct(m.chg); c.className = `t-sm num ${m.chg >= 0 ? 'pos' : 'neg'}`; }
  set('chart', bigChart(openId)); set('pos', posHtml(pl, h));
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

ACT.ctype = (el) => { ctype = el.dataset.id; if (sh) { sh.el.querySelectorAll('[data-act="ctype"]').forEach(b => b.classList.toggle('on', b.dataset.id === ctype)); updateSheetLive(); } };
ACT.ordp = (el) => { const inp = $(el.dataset.k === 'sl' ? '#slv' : '#tpv', sh.el); if (inp) inp.value = String(Number((price(openId).price * Number(el.dataset.p)).toFixed(3))); };
const orderCall = async (sl, tp, ok) => { const r = await doAction('/api/trade/orders', { stock_id: openId, stop_loss: sl, take_profit: tp }, { ok }); if (r && sh) { renderSheet(); } };
ACT.ordset = () => { const a = $('#slv', sh.el).value.trim(), b = $('#tpv', sh.el).value.trim(); if (!a && !b) { import('../ui.js').then(u => u.toast('Enter a stop loss or a take profit price', 'err')); return; } orderCall(a ? Number(a) : null, b ? Number(b) : null, 'Lines saved'); };
ACT.ordclr = () => orderCall(null, null, 'Lines cleared');
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
  return { destroy() { sh?.close(); }, update(ev) { if (!root.isConnected) return; if (ev === 'tick' || ev === 'market') refresh(); else if (ev === 'state') { refresh(); } else if (ev === 'notice' && sh) renderSheet(); } };
}
