// Generates public/data/map.json (continent SVG paths), public/data/countries.json and public/flags/*.svg
// Run once: npm run build:assets   (dev dependencies only; the running server needs none of them)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import { feature, merge } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const countries = require('world-countries');

const byNum = new Map(countries.map(c => [c.ccn3, c]));
const continentOf = (c) => {
  if (!c) return null;
  if (c.ccn3 === '643') return 'asia';           // keep Russia in Asia for the game map
  switch (c.region) {
    case 'Africa': return 'africa';
    case 'Asia': return 'asia';
    case 'Europe': return 'europe';
    case 'Oceania': return 'oceania';
    case 'Americas': return c.subregion === 'South America' ? 'south_america' : 'north_america';
    default: return null;                         // Antarctica etc.
  }
};

const geoms = topo.objects.countries.geometries;
const groups = {};
for (const g of geoms) {
  const c = byNum.get(String(g.id).padStart(3, '0'));
  const k = continentOf(c);
  if (!k) continue;
  (groups[k] ||= []).push(g);
}

const W = 1000, H = 520;
const land = feature(topo, topo.objects.land);
const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: [] .concat(
  { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-170, 78], [180, 78], [180, -56], [-170, -56], [-170, 78]]] } }) });
const pathGen = geoPath(projection).digits(1);

const out = { viewBox: `0 0 ${W} ${H}`, continents: {}, centers: {} };
for (const [k, list] of Object.entries(groups)) {
  const mp = merge(topo, list);
  out.continents[k] = pathGen(mp);
  const b = pathGen.bounds(mp); out.bbox = out.bbox || {}; out.bbox[k] = [Math.round(b[0][0]), Math.round(b[0][1]), Math.round(b[1][0]), Math.round(b[1][1])];
  const [cx, cy] = projection(geoCentroid(mp));
  out.centers[k] = [Math.round(cx), Math.round(cy)];
}
// Manual nicer label anchors for continents whose centroid is skewed by islands
out.centers.north_america = [215, 170];
out.centers.asia = [700, 175];
out.centers.europe = [500, 135];
out.centers.oceania = [850, 365];
fs.writeFileSync('public/data/map.json', JSON.stringify(out));

const list = countries
  .filter(c => c.cca2 && c.region !== 'Antarctic')
  .map(c => ({ code: c.cca2, name: c.name.common }))
  .sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync('public/data/countries.json', JSON.stringify(list));

const flagSrc = path.dirname(require.resolve('flag-icons/package.json')) + '/flags/4x3';
fs.mkdirSync('public/flags', { recursive: true });
let n = 0;
for (const c of list) {
  const f = `${flagSrc}/${c.code.toLowerCase()}.svg`;
  if (fs.existsSync(f)) { fs.copyFileSync(f, `public/flags/${c.code.toLowerCase()}.svg`); n++; }
}
console.log('continents:', Object.keys(out.continents).join(','), '| countries:', list.length, '| flags:', n,
  '| map.json bytes:', fs.statSync('public/data/map.json').size);
