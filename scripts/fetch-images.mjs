// Downloads real, freely licensed photos from Wikimedia Commons for every item (cars, yachts, jets, watches, phones, art) and, best effort, every business.
// Run it where the internet is open (your PC, GitHub Actions or the Render build):  node scripts/fetch-images.mjs [--only=items|assets] [--force]
// Output: public/photos/<id>.<ext> and public/photos/manifest.json (file + licence + author for each photo, shown on the Photo credits page).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS, ASSETS } from '../server/gamedata.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'photos');
const UA = 'NviscoPlayz/1.0 (game photo fetcher; https://github.com/zainhaider626/nvisco-playz)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LICENSE = /^(cc0|cc[- ]by|public domain|pd|attribution|gfdl)/i;
const BAD_TITLE = /(logo|diagram|map|drawing|sketch|svg|interior|engine|wheel|detail|cockpit|dashboard|steering|badge|emblem|stamp|poster|crash|accident|damaged|wreck|cutaway|blueprint|museum shop|screenshot)/i;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Choose the best result for a search phrase. Exported for tests. */
export function pickBest(pages, query, { strict = false } = {}) {
  const words = norm(query).split(' ').filter(w => w.length > 1);
  let best = null;
  for (const p of Object.values(pages || {})) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const title = norm(p.title.replace(/^File:/, '').replace(/\.\w+$/, ''));
    const lic = ii.extmetadata?.LicenseShortName?.value || '';
    if (!/^image\/(jpeg|png)$/.test(ii.mime) || !OK_LICENSE.test(lic) || BAD_TITLE.test(title) || ii.width < 600 || ii.height < 350) continue;
    const hit = words.filter(w => title.includes(w)).length, ratio = hit / (words.length || 1);
    if (strict ? ratio < 0.99 : ratio < 0.5) continue;
    const landscape = ii.width / ii.height; const score = ratio * 10 + (landscape > 1.1 && landscape < 2.2 ? 2 : 0) + Math.min(2, ii.width / 2000) - (p.index ? p.index * 0.01 : 0);
    if (!best || score > best.score) best = { score, page: p, ii, lic };
  }
  return best;
}

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  throw new Error('Wikimedia is busy, try again later');
}
async function search(q) {
  const u = `${API}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=640`;
  return (await getJson(u)).query?.pages;
}

async function main() {
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7), force = process.argv.includes('--force');
  fs.mkdirSync(OUT, { recursive: true });
  const mfile = path.join(OUT, 'manifest.json');
  const manifest = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
  const jobs = [];
  if (only !== 'assets') for (const it of ITEMS) jobs.push({ id: it.id, q: it.q || it.name, name: it.name, strict: false });
  if (only !== 'items') for (const a of ASSETS) jobs.push({ id: a.id, q: a.name, name: a.name, strict: true });
  let got = 0, miss = [];
  for (const j of jobs) {
    if (!force && manifest[j.id] && fs.existsSync(path.join(OUT, manifest[j.id].file))) continue;
    try {
      let best = pickBest(await search(j.q), j.q, { strict: j.strict });
      if (!best && !j.strict && j.q !== j.name) best = pickBest(await search(j.name), j.name);
      if (!best) { miss.push(j.name); continue; }
      const ext = best.ii.mime === 'image/png' ? 'png' : 'jpg', file = `${j.id}.${ext}`;
      const img = await fetch(best.ii.thumburl || best.ii.url, { headers: { 'user-agent': UA } });
      if (!img.ok) { miss.push(j.name); continue; }
      fs.writeFileSync(path.join(OUT, file), Buffer.from(await img.arrayBuffer()));
      const m = best.ii.extmetadata || {};
      manifest[j.id] = { file, title: best.page.title.replace(/^File:/, ''), author: strip(m.Artist?.value) || 'Unknown', license: m.LicenseShortName?.value || '', page: best.ii.descriptionurl };
      got++; console.log('ok  ', j.id.padEnd(18), j.name, '←', manifest[j.id].title);
    } catch (e) { console.log('fail', j.id, e.message); miss.push(j.name); }
    await new Promise(s => setTimeout(s, 350));
  }
  fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1));
  console.log(`\nPhotos saved: ${got} new, ${Object.keys(manifest).length} total. Missing (the app shows a plain drawing for these): ${miss.length}`);
  if (miss.length) console.log(miss.join(', '));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error(e.message); process.exit(0); });
