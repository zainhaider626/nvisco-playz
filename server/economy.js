// Pure formulas for the whole game economy (no I/O) so the simulator and the server share one source of truth.
import {
  ASSETS, ASSET_BY_ID, ASSET_MAX_LEVEL, ASSETS_PER_REGION, REGIONS, REGION_SET_BONUS, REGION_UNLOCK_OWNED,
  ITEMS, ITEM_BY_ID, ITEM_CATEGORIES, ITEM_CAT_BY_ID, TIERS,
  REGION_COUNTRIES, COUNTRY_BY_CODE, BRANCH_MAX_LEVEL, BRANCH_INCOME_PER_LEVEL, BRANCH_REGION_SET_BONUS, PARTNER_INCOME_BONUS, PARTNER_MAX,
} from './gamedata.js';

export const START_CASH = 50;
export const PRESTIGE_MIN_RUN = 1e10;          // prestige is a late-game reset: needs $10B earned in one run
export const PRESTIGE_STAR_BONUS = 0.05;       // +5% income and tap per star
export const TAP_LEVEL_MAX = 150;
export const BOOST_SECONDS = 120;
export const BOOST_COOLDOWN_SECONDS = 600;
export const TAP_HUSTLE = 0.3;                 // each tap also pays 30% of one second of passive income

// ---- late-game pricing: everything gets steeper once a price passes one million ----
export const LATE_FROM = 1e6, LATE_POWER = 1.04;
export const late = (c) => (c <= LATE_FROM ? c : LATE_FROM * Math.pow(c / LATE_FROM, LATE_POWER));
export const UPGRADE_INCOME_RATIO = 2.6;       // every level multiplies the income by 2.6 (x1, x2.6, x6.8, x17.6, x45.7) while its price grows by only 2.2
export const UPGRADE_COST_RATIO = 2.2;

// ---- assets: one global exponential ladder, payback time slowly rising from 18 min to ~2.7 h ----
const assetRawCost = (a) => 250 * Math.pow(2.15, a.index);                    // before the late-game steepening
export const assetBaseCost = (a) => late(assetRawCost(a));
const rawPayback = (a) => 0.3 + 0.04 * a.index;                               // hours at the raw price
export const assetBaseIncome = (a) => assetRawCost(a) / rawPayback(a);        // per hour at level 1
export const assetPayback = (a) => assetBaseCost(a) / assetBaseIncome(a);     // hours; late assets pay back slower
export const assetIncomeAt = (a, level) => assetBaseIncome(a) * Math.pow(UPGRADE_INCOME_RATIO, level - 1);
export const assetUpgradeCost = (a, level) => late(assetRawCost(a) * Math.pow(UPGRADE_COST_RATIO, level)); // level -> level+1

// ---- country branches: priced from the region's late-game assets, scaled by the country's market size ----
export const branchCost = (code, level) => {
  const c = COUNTRY_BY_CODE[code]; if (!c) return Infinity;
  const ri = REGIONS.findIndex(r => r.id === c.region);
  return Math.round(late(250 * Math.pow(2.15, ri * ASSETS_PER_REGION + 3) * c.f * Math.pow(2.5, level - 1)));
};

// ---- tapping ----
export const tapBase = (level) => Math.pow(1.9, level);
export const tapUpgradeCost = (level) => late(30 * Math.pow(2.4, level));

// ---- prestige ----
export const prestigeStarsFor = (runEarned) => (runEarned >= PRESTIGE_MIN_RUN ? Math.floor(10 * (Math.log10(runEarned) - 9)) : 0);
export const prestigeMult = (stars) => 1 + PRESTIGE_STAR_BONUS * stars;

export const tierFor = (score) => { let t = TIERS[0]; for (const x of TIERS) if (score >= x.min) t = x; return t; };

/**
 * Derive every cached number from what the player owns.
 * owned: Map assetId -> level ; items: Set itemId ; stars: int ; tapLevel: int
 */
export function derive({ owned, items, stars, tapLevel, branches = new Map(), partners = 0, offerPct = 0 }) {
  let baseIncome = 0, assetsValue = 0;
  const rawIncome = {};
  const regionCounts = {};
  for (const [id, level] of owned) {
    const a = ASSET_BY_ID[id]; if (!a) continue;
    regionCounts[a.region] = (regionCounts[a.region] || 0) + 1;
  }
  for (const [id, level] of owned) {
    const a = ASSET_BY_ID[id]; if (!a) continue;
    const complete = regionCounts[a.region] === ASSETS_PER_REGION;
    const inc = assetIncomeAt(a, level) * (complete ? 1 + REGION_SET_BONUS : 1);
    baseIncome += inc; rawIncome[id] = inc;
    let spent = assetBaseCost(a);
    for (let l = 1; l < level; l++) spent += assetUpgradeCost(a, l);
    assetsValue += spent;
  }
  const bizValue = assetsValue;
  let incomeBonus = 0, tapBonus = 0, itemsValue = 0;
  const catCounts = {};
  for (const id of items) {
    const it = ITEM_BY_ID[id]; if (!it) continue;
    const cat = ITEM_CAT_BY_ID[it.cat];
    catCounts[it.cat] = (catCounts[it.cat] || 0) + 1;
    itemsValue += it.price;
    if (cat.effect === 'income') incomeBonus += cat.per; else tapBonus += cat.per;
  }
  for (const cat of ITEM_CATEGORIES) {
    if (catCounts[cat.id] === cat.count) { if (cat.effect === 'income') incomeBonus += cat.set; else tapBonus += cat.set; }
  }
  // country branches and partners add to the same income bonus pool
  let branchBonus = 0, branchValue = 0;
  const branchRegion = {};
  for (const [code, level] of branches) {
    const c = COUNTRY_BY_CODE[code]; if (!c) continue;
    branchBonus += BRANCH_INCOME_PER_LEVEL * level;
    for (let l = 1; l <= level; l++) branchValue += branchCost(code, l);
    branchRegion[c.region] = (branchRegion[c.region] || 0) + 1;
  }
  for (const [region, list] of Object.entries(REGION_COUNTRIES)) if ((branchRegion[region] || 0) >= list.length) branchBonus += BRANCH_REGION_SET_BONUS;
  const partnerBonus = Math.min(partners, PARTNER_MAX) * PARTNER_INCOME_BONUS;
  incomeBonus += branchBonus + partnerBonus + offerPct;
  assetsValue += branchValue;
  const mult = prestigeMult(stars);
  const incomePerHour = baseIncome * mult * (1 + incomeBonus);
  const perAsset = {}; for (const [id, v] of Object.entries(rawIncome)) perAsset[id] = v * mult * (1 + incomeBonus);
  return { perAsset, bizValue, baseIncomePerHour: baseIncome * mult, incomePerHour, tapBonus, incomeBonus, assetsValue, itemsValue, regionCounts, catCounts, mult, branchBonus, partnerBonus };
}

export function tapValue({ tapLevel, tapBonus, stars, incomePerHour, boosted }) {
  const base = tapBase(tapLevel) * prestigeMult(stars) * (1 + tapBonus);
  const hustle = TAP_HUSTLE * incomePerHour / 3600;
  return (base + hustle) * (boosted ? 2 : 1);
}

export function regionUnlocked(regionIndex, regionCounts) {
  if (regionIndex === 0) return true;
  const prev = REGIONS[regionIndex - 1].id;
  return (regionCounts[prev] || 0) >= REGION_UNLOCK_OWNED;
}

// ---- number formatting (server side, for notifications; the client has the same table plus lakh/crore style) ----
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg', 'Uvg', 'Dvg', 'Tvg', 'Qavg', 'Qivg', 'Sxvg', 'Spvg', 'Ocvg', 'Novg', 'Tg'];
const p3 = (v) => String(Number(v.toPrecision(3)));
export function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0 ? '-' : ''; n = Math.abs(n);
  if (n < 1000) return neg + p3(n);
  const i = Math.floor(Math.log10(n) / 3);
  if (i >= SUFFIX.length) return neg + n.toExponential(2).replace('e+', 'e');
  return neg + p3(n / Math.pow(1000, i)) + SUFFIX[i];
}
