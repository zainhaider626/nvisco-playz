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
const BAD_TITLE = /(logo|diagram|map|drawing|sketch|svg|interior|engine|wheel|detail|cockpit|dashboard|steering|badge|emblem|stamp|poster|crash|accident|damaged|wreck|cutaway|blueprint|museum shop|screenshot|model car|scale model|miniature|toy|packaging|talent|portrait of|briefing|journalist|ceo|actress|actor|singer|politician|minister)/i;
/** Hard cases: extra search phrases, words the file name must contain, and words that rule a file out. Keys are item ids. */
export const HINTS = {
  'cars-6': { q: ['Toyota Hilux pickup', 'Toyota Hilux'], must: /hilux/, ban: /fire|carnival|service|police|army|rescue|ambulance/ },
  'cars-8': { q: ['Mercedes-Benz S-Class W223', 'Mercedes-Benz S-Class W222', 'Mercedes S-Class'], must: /s class|s klasse|s500|s580|s 580|s 500/, ban: /\bcl\b|cl class|c 140/ },
  'cars-12': { q: ['Rolls-Royce Phantom VIII', 'Rolls-Royce Phantom VII'], must: /phantom/, ban: /phantom (i|ii|iii|iv|v|vi)( |$)|19[0-6]\d|boat ?tail/ },
  'cars-18': { q: ['Rolls-Royce Boat Tail 2021', 'Rolls-Royce Boat Tail'], must: /boat ?tail/, ban: /19[0-6]\d|phantom ii|trunk|rear|seat|door|lid/ },
  'cars-19': { q: ['Ferrari 250 GTO 1962', 'Ferrari 250 GTO'], must: /250 gto/, ban: /cmc|modell|model|replica|lego|toy/ },
  'yachts-3': { q: ['Azimut 55 yacht', 'Azimut motor yacht', 'Azimut yacht Monaco'], must: /azimut/, ban: /hotel|lobby|astrakhan|hostel|bank/ },
  'yachts-4': { q: ['Sunseeker 76 Yacht', 'Sunseeker yacht', 'Sunseeker Predator'], must: /sunseeker/ },
  'yachts-5': { q: ['Savannah yacht Feadship', 'Feadship yacht', 'Feadship superyacht'], must: /feadship|savannah/, ban: /hotel|city|county/ },
  'watches-3': { q: ['Omega Seamaster Diver 300M', 'Omega Seamaster'], must: /seamaster/, ban: /planet ocean|aqua terra|speedmaster|ploprof/ },
  'watches-8': { q: ['Richard Mille RM 011', 'Richard Mille watch'], must: /richard mille/, ban: /shop|mall|store|elements|kowloon/ },
  'watches-9': { q: ['Henry Graves Supercomplication', 'Patek Philippe Graves'], must: /graves|supercomplication/ },
  'watches-12': { q: ['Graff Hallucination watch', 'Graff Hallucination'], must: /graff/ },
  'mobiles-4': { q: ['iPhone 16', 'iPhone 16 Pro'], must: /iphone 16/, ban: /pack|box|case|charger|label|plus/ },
  'mobiles-5': { q: ['iPhone 16 Pro Max', 'iPhone 16 Pro'], must: /iphone 16 pro/, ban: /pack|box|case|macbook|label/ },
  'mobiles-7': { q: ['Vertu Signature Touch', 'Vertu Signature', 'Vertu phone'], must: /vertu/ },
  'mobiles-8': { q: ['Vertu Signature Cobra', 'Vertu Ascent', 'Vertu Constellation'], must: /vertu/ },
  'mobiles-9': { q: ['Goldvish Le Million', 'Goldvish phone'], must: /goldvish/ },
  'mobiles-10': { q: ['Stuart Hughes iPhone', 'Stuart Hughes iPhone 3G'], must: /stuart hughes/ },
  'mobiles-11': { skip: true },
  'art-5': { q: ['Klimt Adele Bloch-Bauer I', 'Gustav Klimt Portrait of Adele Bloch-Bauer I'], must: /adele|bloch/, ban: /study|sketch|drawing|atelier|studio|room/ },
  // Businesses where a search only finds people or unrelated places: keep the drawing instead of a wrong photo.
  'south_america-15': { skip: true }, 'asia-10': { skip: true }, 'north_america-10': { skip: true },
  // Checked by hand: the search only finds the wrong kind of place or people, so these show a plain tile.
  'africa-15': { skip: true }, 'africa-16': { skip: true }, 'europe-2': { skip: true }, 'north_america-2': { skip: true }, 'north_america-7': { skip: true }, 'north_america-13': { skip: true }, 'oceania-5': { skip: true }, 'south_america-7': { skip: true }, 'south_america-14': { skip: true }, 'south_america-18': { skip: true }, 'asia-8': { skip: true }, 'europe-8': { skip: true }, 'europe-10': { skip: true }, 'europe-18': { skip: true }, 'europe-19': { skip: true }, 'europe-20': { skip: true }, 'north_america-12': { skip: true }, 'north_america-14': { skip: true }, 'north_america-15': { skip: true }, 'oceania-4': { skip: true }, 'oceania-6': { skip: true }, 'oceania-8': { skip: true }, 'oceania-11': { skip: true }, 'oceania-12': { skip: true }, 'oceania-14': { skip: true },
  'art-9': { q: ['Mona Lisa Leonardo da Vinci C2RMF', 'Mona Lisa'], must: /mona lisa/, ban: /plate|painted|residenz|copy|replica|prado|crowd|louvre museum/ },
};
/** Extra search phrases for a business: its own name first, then shorter generic ones that must still name the kind of place. */
const GENERIC_LAST = new Set(['co', 'group', 'fund', 'company', 'network', 'fleet', 'grid', 'works', 'startup', 'consortium', 'operator', 'agency', 'label', 'house', 'hub', 'chain', 'franchise']);
export function assetPlan(name) {
  const w = name.replace(/[^A-Za-z0-9 -]+/g, ' ').trim().split(/\s+/);
  const keep = w.filter(x => !GENERIC_LAST.has(x.toLowerCase()));
  const noun = (keep[keep.length - 1] || w[w.length - 1]).toLowerCase().replace(/s$/, '');
  const two = keep.slice(-2).join(' '), lead = keep.slice(0, 2).join(' ');
  const plan = [{ q: name }];
  for (const q of [two, lead, keep.join(' ')]) if (q && !plan.some(p => p.q.toLowerCase() === q.toLowerCase())) plan.push({ q, must: new RegExp(noun.length > 3 ? noun : keep[0].toLowerCase()) });
  return plan;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Choose the best result for a search phrase. Exported for tests. */
export function pickBest(pages, query, { strict = false, must = null, ban = null } = {}) {
  const words = norm(query).split(' ').filter(w => w.length > 1);
  let best = null;
  for (const p of Object.values(pages || {})) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const title = norm(p.title.replace(/^File:/, '').replace(/\.\w+$/, ''));
    const lic = ii.extmetadata?.LicenseShortName?.value || '';
    if (!/^image\/(jpeg|png)$/.test(ii.mime) || !OK_LICENSE.test(lic) || BAD_TITLE.test(title) || (ban && ban.test(title)) || (must && !must.test(title)) || ii.width < 600 || ii.height < 350) continue;
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
  if (only !== 'assets') for (const it of ITEMS) jobs.push({ id: it.id, q: it.q || it.name, name: it.name, strict: false, hint: HINTS[it.id] });
  if (only !== 'items') for (const a of ASSETS) jobs.push({ id: a.id, q: a.name, name: a.name, strict: true, hint: HINTS[a.id] });
  const redo = (process.argv.find(a => a.startsWith('--redo=')) || '').slice(7).split(',').filter(Boolean);
  for (const id of redo) { if (manifest[id]) { try { fs.unlinkSync(path.join(OUT, manifest[id].file)); } catch {} delete manifest[id]; } }
  let got = 0, miss = [];
  for (const j of jobs) {
    if (!force && manifest[j.id] && fs.existsSync(path.join(OUT, manifest[j.id].file))) continue;
    if (j.hint?.skip) continue;
    try {
      let best = null;
      if (j.hint) {
        for (const q of j.hint.q) { best = pickBest(await search(q), q, { must: j.hint.must, ban: j.hint.ban }); if (best) break; await new Promise(s => setTimeout(s, 350)); }
      } else {
        if (j.strict) {
          for (const st of assetPlan(j.name)) {
            best = pickBest(await search(st.q), st.q, { strict: !st.must, must: st.must, ban: /(man|woman|girl|boy|people|family|wedding|party|fashion|crowd|selfie|workers?|staff|opening|ceremony|protest|visit|meeting)\b/ });
            if (best) break; await new Promise(s => setTimeout(s, 350));
          }
        } else {
          best = pickBest(await search(j.q), j.q, { strict: false });
          if (!best && j.q !== j.name) best = pickBest(await search(j.name), j.name);
        }
      }
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
