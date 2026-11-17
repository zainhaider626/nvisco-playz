// Pictures. Items and businesses show a real photo (downloaded by scripts/fetch-images.mjs from Wikimedia Commons, credited on /credits.html).
// If a photo is missing or fails to load, a plain vector drawing is shown instead. Company emblems on the stock market are abstract shapes, never real logos.
let uid = 0;
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (arr, seed) => arr[seed % arr.length];
const hsl = (h, s, l) => `hsl(${Math.round(h) % 360} ${s}% ${l}%)`;
const shade = (h, l = 50, s = 70) => hsl(h, s, l);

/** Wrap a drawing: dark panel with a soft coloured glow behind it. */
function wrap(inner, glow = '#888', { w = 120, h = 80, cls = 'art', legendary = false } = {}) {
  const id = 'g' + (++uid);
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">
    <defs><radialGradient id="${id}" cx="50%" cy="62%" r="62%"><stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="#0b0b0d"/><rect width="${w}" height="${h}" fill="url(#${id})"/>${inner}
    ${legendary ? `<g fill="#ffe08a"><path d="M100 10l1.6 4.2 4.2 1.6-4.2 1.6-1.6 4.2-1.6-4.2-4.2-1.6 4.2-1.6z"/><path d="M14 22l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" opacity=".8"/></g>` : ''}</svg>`;
}
const ground = (y = 62, c = '#ffffff22') => `<ellipse cx="60" cy="${y}" rx="46" ry="3.5" fill="#000" opacity=".5"/><rect x="8" y="${y + 1}" width="104" height=".8" fill="${c}"/>`;

// ------------------------------------------------------------------ cars
const CAR = {
  hatch:   { L: 70, roofH: 15, a: .26, b: .8, c: .9 },   sedan:  { L: 86, roofH: 12, a: .3, b: .72, c: .86 },
  pickup:  { L: 88, roofH: 14, a: .24, b: .5, c: .52, bed: 1 }, ev:   { L: 82, roofH: 13, a: .22, b: .78, c: .92 },
  suv:     { L: 86, roofH: 17, a: .27, b: .84, c: .9 }, roadster: { L: 80, roofH: 7, a: .36, b: .6, c: .8, open: 1 },
  coupe:   { L: 84, roofH: 10, a: .34, b: .66, c: .88 }, limo: { L: 104, roofH: 12, a: .22, b: .86, c: .94 },
  super:   { L: 88, roofH: 8, a: .4, b: .62, c: .88 },  spyder: { L: 86, roofH: 6, a: .4, b: .55, c: .86, open: 1 },
  hyper:   { L: 92, roofH: 7, a: .42, b: .6, c: .9, wing: 1 }, vintage: { L: 84, roofH: 14, a: .3, b: .66, c: .8, fender: 1 },
  rally:   { L: 80, roofH: 13, a: .28, b: .76, c: .88, wing: 1 }, armored: { L: 90, roofH: 17, a: .26, b: .85, c: .93, thick: 1 },
  gold:    { L: 88, roofH: 9, a: .38, b: .64, c: .88, gold: 1 }, concept: { L: 94, roofH: 6, a: .46, b: .58, c: .9, wing: 1 },
  future:  { L: 94, roofH: 9, a: .3, b: .72, c: .94, glow: 1 }, space: { L: 100, roofH: 10, a: .36, b: .7, c: .96, glow: 1, wing: 1 },
};
export function carArt(item, glowHue) {
  const p = CAR[item.art] || CAR.sedan, seed = hash(item.id);
  const hue = p.gold ? 44 : (item.k * 47 + seed % 30) % 360, body = p.gold ? '#d9a521' : p.thick ? '#44505c' : shade(hue, 46, 62), dark = p.gold ? '#8a6410' : shade(hue, 26, 55);
  const x0 = 60 - p.L / 2, x1 = 60 + p.L / 2, yb = 55, yr = 42 - p.roofH, Lw = p.L;
  const rx = (f) => (x0 + Lw * f).toFixed(1);
  const cabin = p.open
    ? `<path d="M${rx(.34)} 43 L${rx(.4)} ${yr + 3} L${rx(.5)} ${yr + 3} L${rx(.52)} 43z" fill="#1a1d24"/>`
    : `<path d="M${rx(p.a)} 43 L${rx(p.a + .1)} ${yr} L${rx(p.b)} ${yr} L${rx(p.c)} 43z" fill="${body}"/><path d="M${rx(p.a + .02)} 42 L${rx(p.a + .11)} ${yr + 2} L${rx(p.b - .02)} ${yr + 2} L${rx(p.c - .03)} 42z" fill="#9fd4ff" opacity=".85"/><path d="M${rx((p.a + p.b) / 2 + .02)} ${yr + 2}v${40 - yr}" stroke="${body}" stroke-width="1.4"/>`;
  const wheels = [x0 + Lw * .2, x1 - Lw * .2].map(cx => `<circle cx="${cx.toFixed(1)}" cy="55" r="7.4" fill="#0a0a0a"/><circle cx="${cx.toFixed(1)}" cy="55" r="4.2" fill="${p.gold ? '#ffe08a' : '#cfd5de'}"/><circle cx="${cx.toFixed(1)}" cy="55" r="1.6" fill="#333"/>`).join('');
  return wrap(`${ground(62)}
    ${p.glow ? `<ellipse cx="60" cy="58" rx="${Lw / 2 + 6}" ry="5" fill="#22d3ee" opacity=".35"/>` : ''}
    ${p.bed ? `<rect x="${rx(.6)}" y="38" width="${(Lw * .4).toFixed(1)}" height="5" fill="${dark}"/>` : ''}
    <path d="M${x0} ${yb + 1} L${x0} 49 Q${x0} 44 ${x0 + 7} 43.5 L${rx(p.a)} 43 L${rx(p.c)} 43 L${x1 - 4} 44.5 Q${x1} 46 ${x1} 51 L${x1} ${yb + 1}z" fill="${body}"/>
    ${cabin}
    <path d="M${x0 + 2} 50 H${x1 - 2}" stroke="${dark}" stroke-width="1" opacity=".7"/>
    <rect x="${x0}" y="47" width="5" height="3" rx="1.2" fill="#fff6c8"/><rect x="${x1 - 4}" y="47" width="4" height="3" rx="1.2" fill="#ff4d4d"/>
    ${p.wing ? `<rect x="${x1 - 7}" y="${yr + 2}" width="10" height="2" rx="1" fill="#111"/><rect x="${x1 - 4}" y="${yr + 3}" width="1.6" height="9" fill="#111"/>` : ''}
    ${p.fender ? `<path d="M${rx(.1)} 44 q8 -6 14 0M${rx(.7)} 44 q8 -6 14 0" stroke="${dark}" stroke-width="2" fill="none"/>` : ''}
    ${wheels}`, shade(hue, 60, 60), { legendary: item.legendary });
}

// ------------------------------------------------------------------ yachts
const YACHT = { rowboat: 0, fisher: 1, sport: 2, motor: 3, super: 4, giga: 5, palace: 6, nation: 7 };
export function yachtArt(item) {
  const n = YACHT[item.art] ?? 3, s = 1 + n * .1, hue = (item.k * 41 + 190) % 360, hull = shade(hue, 30, 28);
  const w = 52 + n * 6, x0 = 60 - w / 2, x1 = 60 + w / 2, yw = 56;
  let decks = '';
  const dn = Math.min(6, Math.max(1, Math.ceil(n * .85)));
  for (let i = 0; i < dn; i++) {
    const dw = (w * .62) - i * (w * .07), dh = 5.5, y = yw - 8 - i * dh;
    decks += `<rect x="${(60 - dw / 2 - n * .3).toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh}" rx="1.4" fill="#f4f6fb"/><rect x="${(60 - dw / 2 + 2 - n * .3).toFixed(1)}" y="${(y + 1.6).toFixed(1)}" width="${(dw - 4).toFixed(1)}" height="1.6" fill="#59a5d8" opacity=".9"/>`;
  }
  const top = yw - 8 - dn * 5.5;
  const mast = n <= 1 ? `<path d="M60 ${yw - 16}V${yw - 38}M60 ${yw - 36}L${n === 0 ? 74 : 72} ${yw - 18}H60z" stroke="#e5e7eb" fill="#e5e7eb" stroke-width="1.2"/>` : '';
  const heli = n >= 5 ? `<rect x="${x1 - 18}" y="${top - 1}" width="14" height="1.6" fill="#ddd"/><circle cx="${x1 - 11}" cy="${top - 1.8}" r="3.4" fill="none" stroke="#fbbf24" stroke-width="1"/>` : '';
  const dome = n >= 6 ? `<path d="M${60 - 8} ${top} a8 8 0 0 1 16 0z" fill="#ffd36a"/>` : '';
  const flag = n >= 7 ? `<path d="M${x0 + 6} ${yw - 16}v-14l9 3-9 3" fill="#ef4444" stroke="#ddd" stroke-width=".8"/>` : '';
  return wrap(`<path d="M0 62q10-3 20 0t20 0t20 0t20 0t20 0t20 0v18H0z" fill="#0e4b73" opacity=".7"/>
    ${mast}${decks}${dome}${heli}${flag}
    <path d="M${x0 - 4} ${yw - 7} H${x1 + 6} L${x1 - 6} ${yw + 5} H${x0 + 8}z" fill="${hull}"/><path d="M${x0 - 2} ${yw - 4}H${x1 + 3}" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
    <path d="M0 64q10-3 20 0t20 0t20 0t20 0t20 0t20 0" stroke="#7dd3fc" stroke-opacity=".6" fill="none" stroke-width="1.2"/>`, shade(hue, 70, 55), { legendary: item.legendary });
}

// ------------------------------------------------------------------ jets
export function jetArt(item) {
  const kind = item.art, hue = (item.k * 53 + 200) % 360, body = kind === 'space' ? '#e9edf5' : '#f2f4f8', acc = shade(hue, 60, 50);
  const L = { prop: 56, light: 62, biz: 72, long: 90, space: 84 }[kind] || 70, x0 = 60 - L / 2, x1 = 60 + L / 2, y = 40;
  const nose = kind === 'prop' ? `<circle cx="${x1}" cy="${y}" r="2.2" fill="#555"/><rect x="${x1 + 1}" y="${y - 9}" width="1.8" height="18" fill="#9ca3af"/>` : '';
  const wing = kind === 'space'
    ? `<path d="M${60 - 4} ${y + 4} L${x0 + 6} ${y + 18} L${60 + 14} ${y + 4}z" fill="#c8ccd6"/>`
    : `<path d="M${60 - 8} ${y + 1} L${60 - 24} ${y + 17} L${60 - 14} ${y + 17} L${60 + 14} ${y + 1}z" fill="#cdd3de"/>${kind === 'prop' ? `<path d="M${60 - 10} ${y - 5} H${60 + 16} v2 H${60 - 10}z" fill="#cdd3de"/>` : ''}`;
  const tail = `<path d="M${x0 + 2} ${y - 1} L${x0 - 2} ${y - 17} L${x0 + 9} ${y - 17} L${x0 + 18} ${y - 1}z" fill="${acc}"/>${kind === 'biz' ? `<path d="M${x0 - 2} ${y - 17}h10" stroke="#ddd" stroke-width="2"/>` : ''}`;
  const wins = Array.from({ length: Math.floor(L / 8) - 1 }, (_, i) => `<circle cx="${(x0 + 16 + i * 6).toFixed(1)}" cy="${y - 1.5}" r="1.15" fill="#4b6584"/>`).join('');
  const engine = kind === 'prop' ? '' : `<ellipse cx="${60 + 2}" cy="${y + 8}" rx="6" ry="2.6" fill="#8b93a1"/>`;
  return wrap(`${ground(60)}${tail}<path d="M${x0} ${y} Q${x0 + 2} ${y - 6} ${x0 + 14} ${y - 6.5} H${x1 - 14} Q${x1 + 2} ${y - 5} ${x1 + 2} ${y} Q${x1} ${y + 5} ${x1 - 12} ${y + 5.6} H${x0 + 12} Q${x0 + 2} ${y + 5} ${x0} ${y}z" fill="${body}"/>
    <path d="M${x1 - 12} ${y - 5} Q${x1 - 4} ${y - 5} ${x1} ${y - 2} H${x1 - 12}z" fill="#294a70"/><path d="M${x0 + 4} ${y + 2.4}H${x1 - 2}" stroke="${acc}" stroke-width="1.6"/>${wins}${wing}${engine}${nose}
    ${kind === 'space' ? `<ellipse cx="${x0 - 3}" cy="${y + 1}" rx="7" ry="3" fill="#fb923c" opacity=".7"/>` : ''}`, shade(hue, 70, 55), { legendary: item.legendary });
}

// ------------------------------------------------------------------ watches
export function watchArt(item) {
  const k = item.art, seed = hash(item.id), gold = ['repeater', 'diamond', 'grand', 'unique', 'pocket'].includes(k), rose = k === 'unique';
  const metal = rose ? '#e3a587' : gold ? '#e2b84a' : '#c9ced8', dial = { field: '#2f4a33', diver: '#0b1e3a', dress: '#f4efe2', classic: '#f2f2f2', chrono: '#14161c', skeleton: '#0b0b0d', calendar: '#f3f4f6', repeater: '#fff6df', diamond: '#14161c', grand: '#10131a', unique: '#2a1b1b', pocket: '#fbf7e8' }[k] || '#fff';
  const fg = ['dress', 'classic', 'calendar', 'repeater', 'pocket'].includes(k) ? '#222' : '#eee';
  const marks = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = 15.5, r2 = i % 3 ? 17 : 18.8; return `<path d="M${60 + Math.sin(a) * r1} ${40 - Math.cos(a) * r1}L${60 + Math.sin(a) * r2} ${40 - Math.cos(a) * r2}" stroke="${fg}" stroke-width="${i % 3 ? .9 : 1.5}"/>`; }).join('');
  const gems = k === 'diamond' || k === 'unique' ? Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; return `<circle cx="${60 + Math.sin(a) * 23}" cy="${40 - Math.cos(a) * 23}" r="1.3" fill="${i % 2 ? '#e0f2fe' : '#fff'}"/>`; }).join('') : '';
  const gears = k === 'skeleton' || k === 'grand' ? `<g fill="none" stroke="${metal}" stroke-width="1.2"><circle cx="52" cy="38" r="7"/><circle cx="52" cy="38" r="2.5"/><circle cx="68" cy="45" r="5"/><circle cx="66" cy="31" r="4"/></g><g stroke="${metal}" stroke-width=".8"><path d="M52 31v14M45 38h14M63 45h10M66 27v8"/></g>` : '';
  const subs = k === 'chrono' || k === 'grand' ? `<g fill="none" stroke="${fg}" stroke-width=".8"><circle cx="52" cy="40" r="4.5"/><circle cx="68" cy="40" r="4.5"/><circle cx="60" cy="48" r="4.5"/></g>` : '';
  const cal = k === 'calendar' ? `<rect x="66" y="38" width="7" height="5" fill="#fff" stroke="#999" stroke-width=".6"/><text x="69.5" y="42" font-size="4.2" text-anchor="middle" fill="#222" font-family="Inter,sans-serif">17</text>` : '';
  const strapC = k === 'field' ? '#4a5d3f' : k === 'diver' ? '#111827' : rose ? '#5b3a29' : gold ? '#6b3a1d' : '#1f2937';
  const strap = k === 'pocket' ? `<path d="M60 14V8" stroke="${metal}" stroke-width="3"/><circle cx="60" cy="6.5" r="3" fill="none" stroke="${metal}" stroke-width="1.4"/><path d="M60 3.6q18 -6 34 6" stroke="${metal}" stroke-width="1.2" fill="none" stroke-dasharray="2 1.5"/>`
    : `<rect x="50" y="2" width="20" height="22" rx="3" fill="${strapC}"/><rect x="50" y="56" width="20" height="22" rx="3" fill="${strapC}"/><path d="M54 8v8M66 8v8M54 64v8M66 64v8" stroke="#fff" stroke-opacity=".2" stroke-dasharray="1 2"/>`;
  const bezel = k === 'diver' ? `<circle cx="60" cy="40" r="22" fill="none" stroke="#2563eb" stroke-width="3"/>` : '';
  const hands = `<path d="M60 40L${60 + Math.sin(seed % 6) * 10} ${40 - Math.cos(seed % 6) * 10}" stroke="${fg}" stroke-width="1.8" stroke-linecap="round"/><path d="M60 40L${60 + 12} ${40 - 5}" stroke="${fg}" stroke-width="1.1" stroke-linecap="round"/><circle cx="60" cy="40" r="1.4" fill="${metal}"/>`;
  return wrap(`${strap}<circle cx="60" cy="40" r="22" fill="${metal}"/>${bezel}<circle cx="60" cy="40" r="19.4" fill="${dial}"/>${gems}${k === 'skeleton' || k === 'grand' ? '' : marks}${gears}${subs}${cal}${hands}
    <rect x="82" y="38" width="3.4" height="4" rx="1" fill="${metal}"/><path d="M48 28 Q60 20 72 28" stroke="#fff" stroke-opacity=".28" stroke-width="2" fill="none" stroke-linecap="round"/>`, metal, { legendary: item.legendary });
}

// ------------------------------------------------------------------ phones
export function phoneArt(item) {
  const k = item.art, hue = (item.k * 63 + 210) % 360;
  const frame = { gold: '#e2b84a', diamond: '#cbd5e1', exec: '#5b3a29', glass: '#9ad7ff', holo: '#a78bfa', sat: '#374151' }[k] || '#2a2f3a';
  const sid = 's' + (++uid);
  let body;
  if (k === 'feature') body = `<rect x="46" y="8" width="28" height="64" rx="5" fill="#3a3f4b"/><rect x="50" y="13" width="20" height="16" rx="1.5" fill="#9bc5a0"/><g fill="#6b7280">${Array.from({ length: 12 }, (_, i) => `<rect x="${50 + (i % 3) * 7}" y="${35 + Math.floor(i / 3) * 8}" width="5.5" height="5" rx="1.4"/>`).join('')}</g>`;
  else if (k === 'fold') body = `<rect x="30" y="12" width="28" height="56" rx="4" fill="${frame}"/><rect x="62" y="12" width="28" height="56" rx="4" fill="${frame}"/><rect x="32.5" y="14.5" width="23" height="51" rx="2.5" fill="url(#${sid})"/><rect x="64.5" y="14.5" width="23" height="51" rx="2.5" fill="url(#${sid})"/><rect x="58" y="14" width="4" height="52" fill="#111"/>`;
  else body = `<rect x="43" y="6" width="34" height="68" rx="7" fill="${frame}" ${k === 'glass' ? 'fill-opacity=".45" stroke="#9ad7ff"' : ''}/><rect x="${k === 'budget' ? 46 : 45.4}" y="${k === 'budget' ? 12 : 8.4}" width="${k === 'budget' ? 28 : 29.2}" height="${k === 'budget' ? 54 : 63.2}" rx="5.4" fill="url(#${sid})"/>${['flagship', 'gold', 'diamond', 'exec', 'holo'].includes(k) ? '' : '<circle cx="60" cy="12" r="1.3" fill="#000" opacity=".6"/>'}`;
  const cam = ['flagship', 'gold', 'diamond', 'exec', 'sat', 'glass'].includes(k) ? `<g><rect x="63" y="9" width="11" height="11" rx="3.4" fill="#0b0b0d" stroke="#555" stroke-width=".6"/><circle cx="67" cy="13" r="2" fill="#223"/><circle cx="71" cy="17" r="1.6" fill="#223"/></g>` : '';
  const ui = k === 'feature' ? '' : `<g opacity=".95"><rect x="${k === 'fold' ? 34 : 49}" y="20" width="${k === 'fold' ? 18 : 22}" height="3" rx="1.5" fill="#fff" opacity=".85"/><rect x="${k === 'fold' ? 34 : 49}" y="27" width="${k === 'fold' ? 12 : 14}" height="3" rx="1.5" fill="#fff" opacity=".45"/><g fill="#fff" opacity=".35">${[0, 1, 2, 3].map(i => `<rect x="${k === 'fold' ? 34 + i * 5 : 49 + i * 6}" y="${k === 'fold' ? 36 : 40}" width="4" height="4" rx="1.2"/>`).join('')}</g></g>`;
  const extra = k === 'sat' ? `<path d="M74 10 L86 -2" stroke="#9ca3af" stroke-width="2"/>` : k === 'diamond' ? `<g fill="#fff"><circle cx="43" cy="20" r="1.6"/><circle cx="43" cy="40" r="1.6"/><circle cx="77" cy="30" r="1.6"/><circle cx="77" cy="55" r="1.6"/></g>` : k === 'holo' ? `<path d="M60 8L40 -4M60 8L80 -4" stroke="#a78bfa" stroke-opacity=".8" stroke-width="1"/><path d="M48 -2h24l-12 14z" fill="#a78bfa" opacity=".25"/>` : '';
  return wrap(`<defs><linearGradient id="${sid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(hue, 70, 38)}"/><stop offset="1" stop-color="${shade(hue + 60, 80, 18)}"/></linearGradient></defs>${body}${ui}${cam}${extra}`, shade(hue, 70, 55), { legendary: item.legendary });
}

// ------------------------------------------------------------------ paintings & relics
export function artArt(item) {
  const k = item.art, hue = (item.k * 71 + 20) % 360, c1 = shade(hue, 60, 50), c2 = shade(hue + 120, 55, 45), c3 = shade(hue + 220, 60, 62);
  const frame = item.legendary ? '#e2b84a' : '#8b6a3e';
  const cid = 'c' + (++uid), clip = `<clipPath id="${cid}"><rect x="26" y="12" width="68" height="44"/></clipPath>`;
  const panel = (inner, bg = '#111') => `<rect x="22" y="8" width="76" height="52" rx="2" fill="${frame}"/><rect x="26" y="12" width="68" height="44" fill="${bg}"/><g clip-path="url(#${cid})">${inner}</g>`;
  let inner;
  switch (k) {
    case 'mural': inner = panel(`<rect x="26" y="12" width="68" height="44" fill="#6b3a2a"/>${Array.from({ length: 5 }, (_, r) => `<path d="M26 ${12 + r * 9}h68" stroke="#4a2a1d" stroke-width=".8"/>`).join('')}<circle cx="46" cy="32" r="10" fill="${c1}"/><path d="M60 50l14-26 14 26z" fill="${c3}"/><path d="M30 46q10-14 20 0" stroke="#fff" stroke-width="2.4" fill="none"/>`); break;
    case 'landscape': inner = panel(`<rect x="26" y="12" width="68" height="30" fill="#7dc3f0"/><circle cx="76" cy="24" r="6" fill="#fde68a"/><path d="M26 44q16-18 32-4t36-10v26H26z" fill="#3d8c4f"/><path d="M26 50q20-10 40 0t28-6v12H26z" fill="#2c6b3b"/>`); break;
    case 'print': inner = panel(`<rect x="26" y="12" width="68" height="44" fill="${c3}"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${30 + (i % 10) * 7}" cy="${17 + Math.floor(i / 10) * 11}" r="2" fill="${c1}"/>`).join('')}<circle cx="60" cy="34" r="10" fill="#fff"/><circle cx="60" cy="34" r="5" fill="${c2}"/>`); break;
    case 'bronze': return wrap(`${ground(62)}<rect x="44" y="52" width="32" height="8" fill="#555"/><path d="M60 14a6 6 0 1 1 .1 0M54 24h12l4 14-6 2 2 12h-12l2-12-6-2z" fill="#a8743a"/>`, '#a8743a', { legendary: item.legendary });
    case 'impress': inner = panel(Array.from({ length: 70 }, (_, i) => { const h = hash(item.id + i); return `<ellipse cx="${26 + h % 68}" cy="${12 + (h >> 8) % 44}" rx="${3 + h % 4}" ry="${2 + (h >> 4) % 3}" fill="${[c1, c2, c3, '#f1e4b3'][h % 4]}" opacity=".9" transform="rotate(${h % 90} ${26 + h % 68} ${12 + (h >> 8) % 44})"/>`; }).join(''), '#2c3e5a'); break;
    case 'bust': return wrap(`${ground(64)}<rect x="46" y="52" width="28" height="10" fill="#cfcfd6"/><path d="M50 52q-2-10 10-12q12 2 10 12z" fill="#e5e5ea"/><ellipse cx="60" cy="26" rx="10" ry="13" fill="#eeeef2"/><path d="M52 24q4-3 8 0M60 24q4-3 8 0" stroke="#9a9aa5" fill="none"/>`, '#d6d6e0', { legendary: item.legendary });
    case 'portrait': inner = panel(`<rect x="26" y="12" width="68" height="44" fill="#2a1d14"/><ellipse cx="60" cy="52" rx="20" ry="14" fill="${c2}"/><ellipse cx="60" cy="31" rx="9" ry="11" fill="#e8c39e"/><path d="M50 28q10-14 20 0" fill="#3b2a1f"/><path d="M56 36q4 3 8 0" stroke="#7a3b3b" fill="none"/>`); break;
    case 'modern': inner = panel(`<rect x="26" y="12" width="68" height="44" fill="#f2f2f0"/><rect x="32" y="16" width="26" height="36" fill="${c1}"/><circle cx="74" cy="28" r="12" fill="${c2}"/><path d="M62 52l12-12 14 12z" fill="#111"/><path d="M28 20L92 52" stroke="${c3}" stroke-width="2"/>`); break;
    case 'relic': return wrap(`${ground(64)}<path d="M52 12h16v6q10 6 8 22q-2 12-10 18H54q-8-6-10-18q-2-16 8-22z" fill="#b9652f"/><path d="M48 30h24M47 42h26" stroke="#7a3f1b" stroke-width="2"/><path d="M52 34l4 4 4-4 4 4" stroke="#f5d29a" fill="none" stroke-width="1.2"/>`, '#b9652f', { legendary: item.legendary });
    default: return wrap(`<circle cx="60" cy="30" r="24" fill="none" stroke="#f5c542" stroke-width="2" opacity=".6"/><rect x="38" y="8" width="44" height="54" rx="3" fill="#caa13a"/><rect x="42" y="12" width="36" height="46" fill="#241a0b"/><circle cx="60" cy="30" r="9" fill="#e8c39e"/><path d="M48 52q12-18 24 0" fill="${c2}"/><circle cx="60" cy="30" r="14" fill="none" stroke="#ffe08a" stroke-width="1.4"/>`, '#caa13a', { legendary: item.legendary });
  }
  return wrap(`<defs>${clip}</defs>${inner}`, c1, { legendary: item.legendary });
}

export const PHOTOS = {};
export async function loadPhotos() {
  try { const r = await fetch('/photos/manifest.json', { cache: 'no-cache' }); if (r.ok) Object.assign(PHOTOS, await r.json()); } catch { /* photos are optional */ }
}
const withPhoto = (svg, id, fit = 'cover') => {
  const p = PHOTOS[id]; if (!p) return svg;
  return `<div class="phwrap">${svg}<img class="phimg ${fit}" loading="lazy" decoding="async" alt="" src="/photos/${encodeURIComponent(p.file)}"></div>`;
};
export function itemArt(item) {
  const f = { cars: carArt, yachts: yachtArt, jets: jetArt, watches: watchArt, mobiles: phoneArt, art: artArt }[item.cat];
  return withPhoto(f ? f(item) : wrap('', '#666'), item.id, item.cat === 'mobiles' || item.cat === 'watches' ? 'contain' : 'cover');
}

// ------------------------------------------------------------------ businesses, industries and property (assets)
export function assetArt(a, color = '#34d399') {
  const idx = a.k ?? 0, t = idx / 19, seed = hash(a.id), accent = color;
  const win = (x, y, w, h, cols = 2, rows = 3) => { let s = ''; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s += `<rect x="${(x + 2 + c * (w - 4) / cols).toFixed(1)}" y="${(y + 3 + r * (h - 5) / rows).toFixed(1)}" width="${((w - 6) / cols).toFixed(1)}" height="${((h - 8) / rows).toFixed(1)}" fill="${(seed >> (r * 3 + c)) & 1 ? '#fde68a' : '#334155'}"/>`; return s; };
  let g = ground(62);
  if (a.cat === 'business') {
    const w = 30 + t * 50, h = 16 + t * 34, x = 60 - w / 2;
    g += `<rect x="${x}" y="${62 - h}" width="${w}" height="${h}" fill="#e5e7eb"/>${win(x, 62 - h, w, h * .72, Math.max(2, Math.round(w / 14)), Math.max(1, Math.round(h / 14)))}
      <rect x="${x - 2}" y="${62 - h * .32}" width="${w + 4}" height="5" fill="${accent}"/>${Array.from({ length: Math.round(w / 6) }, (_, i) => `<rect x="${x - 2 + i * (w + 4) / Math.round(w / 6)}" y="${62 - h * .32}" width="${(w + 4) / Math.round(w / 6) / 2}" height="5" fill="#fff" opacity=".7"/>`).join('')}
      <rect x="${60 - 5}" y="${62 - 12}" width="10" height="12" fill="#1f2937"/><rect x="${x + 4}" y="${62 - h - 6}" width="${Math.min(w - 8, 30)}" height="5" rx="1.6" fill="${accent}"/>
      ${idx > 12 ? `<rect x="${60 - 3}" y="${62 - h - 18}" width="6" height="12" fill="#9ca3af"/><circle cx="60" cy="${62 - h - 20}" r="2" fill="#f87171"/>` : ''}`;
  } else if (a.cat === 'industry') {
    const n = 1 + Math.floor(t * 3.99), w = 20 + t * 14;
    for (let i = 0; i < n; i++) {
      const x = 60 - (n * w) / 2 + i * w + 2, h = 16 + ((seed >> i) % 8) + t * 14;
      g += `<rect x="${x}" y="${62 - h}" width="${w - 4}" height="${h}" fill="#cbd5e1"/><path d="M${x} ${62 - h}l${(w - 4) / 2} -6 ${(w - 4) / 2} 6z" fill="${accent}"/>${win(x, 62 - h, w - 4, h, 2, 2)}`;
    }
    g += `<rect x="${60 + n * w / 2 - 6}" y="${62 - 34 - t * 10}" width="6" height="${34 + t * 10}" fill="#9ca3af"/><rect x="${60 + n * w / 2 - 7}" y="${62 - 36 - t * 10}" width="8" height="3" fill="${accent}"/>
      <g fill="#cbd5e1" opacity=".55"><circle cx="${60 + n * w / 2 - 3}" cy="${62 - 42 - t * 10}" r="4"/><circle cx="${60 + n * w / 2 + 3}" cy="${62 - 50 - t * 10}" r="5"/></g>${t > .4 ? `<ellipse cx="${60 - n * w / 2 - 8}" cy="52" rx="8" ry="10" fill="#94a3b8"/>` : ''}`;
  } else {
    const n = 1 + Math.floor(t * 3.2);
    if (t < .15) g += `<path d="M42 62V44l18-14 18 14v18z" fill="#e5e7eb"/><path d="M38 46l22-18 22 18" stroke="${accent}" stroke-width="4" fill="none"/><rect x="56" y="50" width="8" height="12" fill="#92400e"/>`;
    else for (let i = 0; i < n + 1; i++) {
      const w = 18 + (seed >> i) % 6, h = 24 + t * 30 + ((seed >> (i * 2)) % 14), x = 60 - ((n + 1) * 22) / 2 + i * 22 + 2;
      g += `<rect x="${x}" y="${62 - h}" width="${w}" height="${h}" fill="${i % 2 ? '#d1d5db' : '#e5e7eb'}"/>${win(x, 62 - h, w, h, 2, Math.max(2, Math.round(h / 8)))}<rect x="${x}" y="${62 - h - 2}" width="${w}" height="2.5" fill="${accent}"/>${t > .7 ? `<path d="M${x + w / 2} ${62 - h - 2}v-8" stroke="#9ca3af" stroke-width="1.2"/>` : ''}`;
    }
  }
  return withPhoto(wrap(g, accent, {}), a.id);
}

// ------------------------------------------------------------------ company emblems for the stock market (abstract, original shapes)
export function stockLogo(stock, size = 44) {
  const s = hash(stock.id), c = stock.color || '#888', shape = s % 8, id = 'e' + (++uid);
  const inner = [
    `<circle cx="22" cy="22" r="10" fill="none" stroke="#fff" stroke-width="4"/><circle cx="22" cy="22" r="3.4" fill="#fff"/>`,
    `<path d="M22 8l11 6.5v13L22 36 11 27.5v-13z" fill="#fff"/><path d="M22 15l5 3v6l-5 3-5-3v-6z" fill="${c}"/>`,
    `<path d="M10 32V16M17 32V10M24 32V20M31 32V13" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>`,
    `<path d="M22 8c9 6 11 14 0 28C11 22 13 14 22 8z" fill="#fff"/>`,
    `<path d="M10 22h24M22 10v24M13.5 13.5l17 17M30.5 13.5l-17 17" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M9 31L22 10l13 21z" fill="#fff"/><path d="M16 31l6-9 6 9z" fill="${c}"/>`,
    `<rect x="10" y="10" width="11" height="11" rx="2.5" fill="#fff"/><rect x="23" y="10" width="11" height="11" rx="2.5" fill="#fff" opacity=".7"/><rect x="10" y="23" width="11" height="11" rx="2.5" fill="#fff" opacity=".7"/><rect x="23" y="23" width="11" height="11" rx="2.5" fill="#fff"/>`,
    `<path d="M12 28q10-22 20-4M12 20q10-14 20-2" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="30" r="2.6" fill="#fff"/>`,
  ][shape];
  return `<svg class="slogo" width="${size}" height="${size}" viewBox="0 0 44 44" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs><rect width="44" height="44" rx="11" fill="url(#${id})"/>${inner}</svg>`;
}
