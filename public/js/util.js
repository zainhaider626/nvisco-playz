export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Short numbers: K M B T Qa Qi Sx Sp Oc No Dc ... and, for South-Asian readers, K Lakh(L) Crore(Cr) Arab(Ar) Kharab(Kh) Neel(Nl) ...
const INTL = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];
const SOUTH = [[1e17, 'Sh'], [1e15, 'Pd'], [1e13, 'Nl'], [1e11, 'Kh'], [1e9, 'Ar'], [1e7, 'Cr'], [1e5, 'L'], [1e3, 'K']];
export const NUMFMT = { mode: 'intl' };
try { const m = localStorage.getItem('np_numfmt'); if (m === 'south' || m === 'intl') NUMFMT.mode = m; } catch { /* ignore */ }
export const setNumMode = (m) => { NUMFMT.mode = m; try { localStorage.setItem('np_numfmt', m); } catch { /* ignore */ } };
export const hasNumPref = () => { try { return localStorage.getItem('np_numfmt') != null; } catch { return false; } };
/** three significant digits, never "1000K": a value that rounds up to 1000 moves to the next unit */
function scaled(n, unit) {
  let v = Number((n / unit).toPrecision(3));
  return v;
}
const trim = (v) => String(Number(v.toPrecision(3)));
export function fmt(n) {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '0';
  const neg = n < 0 ? '-' : ''; n = Math.abs(n);
  if (n < 1000) return neg + trim(n);
  if (NUMFMT.mode === 'south' && n < 1e18) {
    for (let i = 0; i < SOUTH.length; i++) {
      const [unit, sfx] = SOUTH[i];
      if (n >= unit) {
        const v = scaled(n, unit), up = SOUTH[i - 1];
        if (up && v * unit >= up[0]) return neg + trim(scaled(n, up[0])) + up[1];
        return neg + trim(v) + sfx;
      }
    }
  }
  let i = Math.min(INTL.length - 1, Math.floor(Math.log10(n) / 3));
  let v = scaled(n, Math.pow(1000, i));
  if (v >= 1000 && i < INTL.length - 1) { i++; v = scaled(n, Math.pow(1000, i)); }
  if (n >= 1e66) return neg + n.toExponential(2).replace('e+', 'e');
  return neg + trim(v) + INTL[i];
}
export const money = (n) => '$' + fmt(n);
/** full digits for the main balance while that is readable, otherwise the short form */
export function bigMoney(n) {
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n < 1e12) return '$' + Math.floor(n).toLocaleString(NUMFMT.mode === 'south' ? 'en-IN' : 'en-US');
  return '$' + fmt(n);
}
export const usdMicro = (m) => { const v = m / 1e6; return '$' + (Math.abs(v) < 1 && v !== 0 ? v.toFixed(4) : v.toFixed(2)); };
export const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
export function dur(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return (d ? d + 'd ' : '') + (d || h ? p(h) + ':' : '') + p(m) + ':' + p(sec);
}
export const flag = (c) => c ? `<img class="flag" src="/flags/${esc(String(c).trim().toLowerCase())}.svg" alt="${esc(c)}" loading="lazy">` : '';

export const hue = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
export function avatar(name, logo, size = 40) {
  const ini = esc(String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join('').toUpperCase());
  const bg = `hsl(${hue(name)} 62% 46%)`;
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .4)}px;--av:${bg}`;
  if (logo && (/^https:\/\//.test(logo) || /^\/media\/[0-9a-f-]{36}$/.test(logo))) {
    return `<img class="avatar" style="${st}" src="${esc(logo)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.outerHTML='<span class=&quot;avatar&quot; style=&quot;${st}&quot;>${ini}</span>'">`;
  }
  return `<span class="avatar" style="${st}">${ini}</span>`;
}

import { ic } from './icons.js';
export { ic };
/** Rounded icon tile tinted with a colour (used for categories, regions, settings rows). */
export const tile = (name, color = '#60a5fa', cls = '') => `<span class="tile ${cls}" style="--t:${color}">${ic(name, cls.includes('lg') ? 26 : 21)}</span>`;
/** Two/three letter monogram tile for tickers. */
export const mono = (code) => `<span class="mono" style="--bgc:hsl(${hue(code)} 45% 34%)">${esc(code.slice(0, 3))}</span>`;
export const CAT_ICON = { business: 'store', industry: 'factory', realestate: 'building-2' };
export const ITEM_ICON = { cars: 'car', yachts: 'sailboat', jets: 'plane', watches: 'watch', mobiles: 'smartphone', art: 'frame' };
export const ITEM_COLOR = { cars: '#f59e0b', yachts: '#22d3ee', jets: '#60a5fa', watches: '#a78bfa', mobiles: '#34d399', art: '#fb7185' };
export const haptic = (ms = 8) => { try { if (localStorage.getItem('te_haptics') !== '0' && navigator.vibrate) navigator.vibrate(ms); } catch { /* ignore */ } };

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

import { S } from './store.js';
/** Enable/disable buy buttons in place as the live balance changes (never re-render under a finger). */
export function syncAfford(root) { root.querySelectorAll('[data-cost]').forEach(b => b.classList.toggle('off', S.cash < Number(b.dataset.cost))); }
