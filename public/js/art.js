// Pictures. Items and businesses show a real photo (downloaded by scripts/fetch-images.mjs from Wikimedia Commons, credited on /credits.html).
// There are no drawn or generated pictures: when a photo is missing or fails to load, a plain dark tile with a simple icon is shown instead.
// Stock-market companies use a letter badge, never a real logo.
import { ic } from './icons.js';

export const PHOTOS = {};
export async function loadPhotos() {
  try { const r = await fetch('/photos/manifest.json', { cache: 'no-cache' }); if (r.ok) Object.assign(PHOTOS, await r.json()); } catch { /* photos are optional */ }
}

const ITEM_ICON = { cars: 'car', yachts: 'sailboat', jets: 'plane', watches: 'watch', mobiles: 'smartphone', art: 'frame' };
const ASSET_ICON = { business: 'store', industry: 'factory', realestate: 'building-2' };

/** Photo on top of a plain placeholder tile (the photo hides the tile; if it fails to load the tile stays). */
function photoTile(id, icon, fit = 'cover') {
  const p = PHOTOS[id];
  return `<div class="phwrap"><div class="noph">${ic(icon, 28, '', 1.5)}</div>${p ? `<img class="phimg ${fit}" loading="lazy" decoding="async" alt="" src="/photos/${encodeURIComponent(p.file)}">` : ''}</div>`;
}
export const itemArt = (item) => photoTile(item.id, ITEM_ICON[item.cat] || 'gem', item.cat === 'mobiles' || item.cat === 'watches' ? 'contain' : 'cover');
export const assetArt = (a) => photoTile(a.id, ASSET_ICON[a.cat] || 'building');

/** Stock companies: a letter badge in the company's colour. */
export function stockLogo(stock, size = 44) {
  const words = String(stock.name || stock.id).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/);
  const txt = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  const c = stock.color || '#888';
  return `<span class="slogo" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:linear-gradient(145deg,${c},#000 140%)" aria-hidden="true">${txt}</span>`;
}
