import { Router } from 'express';
import { q, tx, rewardDay } from './db.js';
import { config } from './config.js';
import { asyncH, bad, HttpError } from './util.js';
import * as G from './gamedata.js';
import * as E from './economy.js';
import { priceOf, getMarket } from './market.js';
import { requireAuth, validateProfile } from './auth.js';
import * as rewards from './rewards.js';
import { currentSeason } from './leagues.js';

export const gameRouter = Router();

// ------------------------------------------------------------------ helpers
const OFFLINE_CAP_MS = config.offlineCapHours * 3600e3;

/** Lock the player row, credit passive income earned since last time (capped offline), and touch last_seen. */
export async function loadAndAccrue(c, uid) {
  const r = await c.query(`SELECT *, now() AS now_ts FROM users WHERE id=$1 FOR UPDATE`, [uid]);
  const u = r.rows[0];
  if (!u) throw new HttpError(401, 'Please sign in');
  if (u.status === 'banned') throw new HttpError(403, 'This account has been suspended');
  const now = u.now_ts.getTime();
  const end = Math.min(now, u.last_seen.getTime() + OFFLINE_CAP_MS);
  const dt = Math.max(0, (end - u.last_accrual.getTime()) / 1000);
  const g = u.income_per_hour * dt / 3600;
  const away = now - u.last_seen.getTime() > 120000 ? g : 0;
  u.cash += g; u.lifetime_earned += g; u.run_earned += g; u.season_earned += g; u.away_earned += away;
  u.last_accrual = u.now_ts; u.last_seen = u.now_ts;
  return u;
}

const SAVE_COLS = ['cash', 'lifetime_earned', 'run_earned', 'season_earned', 'away_earned', 'income_per_hour', 'tap_bonus', 'tap_level', 'tap_total',
  'assets_value', 'items_value', 'portfolio_value', 'trade_pnl', 'trade_pnl_peak', 'prestige_count', 'prestige_stars', 'tap_tokens', 'tap_token_ts',
  'boost_until', 'boost_ready_at', 'last_accrual', 'last_seen'];

export async function save(c, u) {
  u.net_worth = u.cash + u.assets_value + u.items_value + u.portfolio_value;
  const cols = [...SAVE_COLS, 'net_worth'];
  const sets = cols.map((k, i) => `${k}=$${i + 2}`).join(', ');
  await c.query(`UPDATE users SET ${sets} WHERE id=$1`, [u.id, ...cols.map(k => u[k])]);
}

export async function loadOwned(c, uid) {
  const [a, i, h, br, pa] = await Promise.all([
    c.query(`SELECT asset_id, level FROM user_assets WHERE user_id=$1`, [uid]),
    c.query(`SELECT item_id FROM user_items WHERE user_id=$1`, [uid]),
    c.query(`SELECT stock_id, shares::text AS shares, cost FROM holdings WHERE user_id=$1 AND shares > 0`, [uid]),
    c.query(`SELECT country, level FROM user_branches WHERE user_id=$1`, [uid]),
    c.query(`SELECT COUNT(*)::int AS n FROM partnerships WHERE status='active' AND (requester=$1 OR partner=$1)`, [uid]),
  ]);
  return {
    owned: new Map(a.rows.map(r => [r.asset_id, r.level])),
    items: new Set(i.rows.map(r => r.item_id)),
    holdings: h.rows.map(r => ({ id: r.stock_id, shares: Number(r.shares), cost: r.cost })),
    branches: new Map(br.rows.map(r => [r.country.trim(), r.level])),
    partners: pa.rows[0].n,
  };
}

/** Recompute every cached number that depends on what the player owns. */
export async function rederive(c, u) {
  const { owned, items, holdings, branches, partners } = await loadOwned(c, u.id);
  const d = E.derive({ owned, items, stars: u.prestige_stars, tapLevel: u.tap_level, branches, partners });
  u.income_per_hour = d.incomePerHour; u.tap_bonus = d.tapBonus; u.assets_value = d.assetsValue; u.items_value = d.itemsValue;
  u.portfolio_value = holdings.reduce((s, h) => s + h.shares * priceOf(h.id), 0);
  return { owned, items, holdings, branches, partners, d };
}

const boosted = (u) => u.boost_until && u.boost_until.getTime() > Date.now();

export async function stateOf(c, u, { consume = false } = {}) {
  const day = await rewardDay(c);
  const { owned, items, holdings, branches, partners, d } = await loadOwned(c, u.id).then(async o => ({ ...o, d: E.derive({ owned: o.owned, items: o.items, stars: u.prestige_stars, tapLevel: u.tap_level, branches: o.branches, partners: o.partners }) }));
  const season = await currentSeason(c);
  const tv = E.tapValue({ tapLevel: u.tap_level, tapBonus: u.tap_bonus, stars: u.prestige_stars, incomePerHour: u.income_per_hour, boosted: boosted(u) });
  const gain = E.prestigeStarsFor(u.run_earned);
  const tier = E.tierFor(u.lifetime_earned);
  let notifications = [];
  let away = 0;
  if (consume) {
    away = u.away_earned;
    if (away > 0) { u.away_earned = 0; await c.query(`UPDATE users SET away_earned=0 WHERE id=$1`, [u.id]); }
    const n = await c.query(`UPDATE notifications SET seen=TRUE WHERE id IN (SELECT id FROM notifications WHERE user_id=$1 AND NOT seen ORDER BY id DESC LIMIT 10) RETURNING id, kind, body, created_at`, [u.id]);
    notifications = n.rows.sort((a, b) => a.id - b.id);
  }
  return {
    server_time: Date.now(),
    me: {
      id: u.id, company_name: u.company_name, tagline: u.tagline, industry: u.industry, country: u.country, city: u.city,
      website: u.website, description: u.description, logo_url: u.logo_url, banner_url: u.banner_url, contact: u.contact, open_for_work: u.open_for_work,
      looking_for: u.looking_for, is_admin: u.is_admin, status: u.status, created_at: u.created_at, email: u.email,
      tier, league: u.league, prestige_count: u.prestige_count, stars: u.prestige_stars,
    },
    credits_micro: Number(u.credits_micro || 0), branches: Object.fromEntries(branches), partners,
    cash: u.cash, net_worth: u.net_worth, score: u.lifetime_earned, run_earned: u.run_earned, season_earned: u.season_earned,
    income_per_hour: u.income_per_hour, assets_value: u.assets_value, items_value: u.items_value, portfolio_value: u.portfolio_value,
    trade_pnl: u.trade_pnl, tap_total: Number(u.tap_total),
    tap: { level: u.tap_level, value: tv, base: E.tapValue({ tapLevel: u.tap_level, tapBonus: u.tap_bonus, stars: u.prestige_stars, incomePerHour: u.income_per_hour, boosted: false }), next_cost: u.tap_level >= E.TAP_LEVEL_MAX ? null : E.tapUpgradeCost(u.tap_level), next_value: E.tapValue({ tapLevel: u.tap_level + 1, tapBonus: u.tap_bonus, stars: u.prestige_stars, incomePerHour: u.income_per_hour, boosted: boosted(u) }),
            boost_until: u.boost_until, boost_ready_at: u.boost_ready_at, max: E.TAP_LEVEL_MAX },
    owned: Object.fromEntries(owned), items: [...items],
    holdings: Object.fromEntries(holdings.map(h => [h.id, { shares: h.shares, cost: h.cost }])),
    region_counts: d.regionCounts, cat_counts: d.catCounts, income_bonus: d.incomeBonus, tap_bonus: u.tap_bonus, mult: d.mult,
    prestige: { gain, min_run: E.PRESTIGE_MIN_RUN, mult_now: E.prestigeMult(u.prestige_stars), mult_next: E.prestigeMult(u.prestige_stars + gain), count: u.prestige_count, stars: u.prestige_stars },
    season: { id: season.id, ends_at: season.ends_at },
    away_earned: away, notifications,
    rewards: await rewards.summary(c, u, day),
  };
}

/** Run a player action atomically: lock + accrue, run handler, persist, return fresh state. */
export const act = (handler, { light = false } = {}) => asyncH(async (req, res) => {
  const out = await tx(async c => {
    const u = await loadAndAccrue(c, req.uid);
    const extra = await handler(c, u, req) || {};
    await save(c, u);
    if (light) return { ...extra, quick: { cash: u.cash, score: u.lifetime_earned, season_earned: u.season_earned, net_worth: u.net_worth } };
    return { ...extra, state: await stateOf(c, u) };
  });
  res.json({ ok: true, ...out });
});

gameRouter.use(requireAuth);

// ------------------------------------------------------------------ read
gameRouter.get('/state', asyncH(async (req, res) => {
  const out = await tx(async c => {
    const u = await loadAndAccrue(c, req.uid);
    if (!u.income_per_hour && u.created_at && !u.is_bot) await rederive(c, u);
    await save(c, u);
    return stateOf(c, u, { consume: req.query.init === '1' });
  });
  res.json(out);
}));
gameRouter.get('/market', (_req, res) => res.json(getMarket()));

// ------------------------------------------------------------------ tap
gameRouter.post('/tap', act(async (c, u, req) => {
  let n = Math.floor(Number(req.body?.n));
  if (!Number.isFinite(n) || n < 1) throw bad('Nothing to tap');
  n = Math.min(n, 120);
  const nowMs = Date.now();
  const refill = Math.max(0, (nowMs - u.tap_token_ts.getTime()) / 1000) * config.tapRefillPerSec;
  let tokens = Math.min(config.tapBucket, u.tap_tokens + refill);
  const accepted = Math.min(n, Math.floor(tokens));
  tokens -= accepted;
  u.tap_tokens = tokens; u.tap_token_ts = new Date(nowMs);
  if (accepted <= 0) return { accepted: 0, gain: 0 };
  const tv = E.tapValue({ tapLevel: u.tap_level, tapBonus: u.tap_bonus, stars: u.prestige_stars, incomePerHour: u.income_per_hour, boosted: boosted(u) });
  const gain = tv * accepted;
  u.cash += gain; u.lifetime_earned += gain; u.run_earned += gain; u.season_earned += gain; u.tap_total = Number(u.tap_total) + accepted;
  let units = null;
  if (rewards.eligible(u)) units = await rewards.addUnits(c, u.id, accepted, await rewardDay(c));
  return { accepted, gain, units };
}, { light: true }));

gameRouter.post('/tap/upgrade', act(async (c, u) => {
  if (u.tap_level >= E.TAP_LEVEL_MAX) throw bad('Tap power is maxed out');
  const cost = E.tapUpgradeCost(u.tap_level);
  if (u.cash < cost) throw bad('Not enough cash');
  u.cash -= cost; u.tap_level += 1;
}));

gameRouter.post('/boost', act(async (c, u) => {
  const now = Date.now();
  if (u.boost_ready_at && u.boost_ready_at.getTime() > now) throw bad('Boost is still cooling down');
  u.boost_until = new Date(now + E.BOOST_SECONDS * 1000);
  u.boost_ready_at = new Date(now + E.BOOST_COOLDOWN_SECONDS * 1000);
}));

// ------------------------------------------------------------------ businesses, industries, real estate
gameRouter.post('/assets/buy', act(async (c, u, req) => {
  const a = G.ASSET_BY_ID[req.body?.asset_id]; if (!a) throw bad('Unknown asset');
  const { owned, items, branches, partners } = await loadOwned(c, u.id);
  if (owned.has(a.id)) throw bad('You already own this');
  const d = E.derive({ owned, items, stars: u.prestige_stars, tapLevel: u.tap_level, branches, partners });
  if (!E.regionUnlocked(a.regionIndex, d.regionCounts)) throw bad(`Own ${G.REGION_UNLOCK_OWNED} assets in ${G.REGIONS[a.regionIndex - 1].name} first`);
  const cost = E.assetBaseCost(a);
  if (u.cash < cost) throw bad('Not enough cash');
  u.cash -= cost;
  await c.query(`INSERT INTO user_assets (user_id, asset_id, level) VALUES ($1,$2,1)`, [u.id, a.id]);
  await rederive(c, u);
}));

gameRouter.post('/assets/upgrade', act(async (c, u, req) => {
  const a = G.ASSET_BY_ID[req.body?.asset_id]; if (!a) throw bad('Unknown asset');
  const r = await c.query(`SELECT level FROM user_assets WHERE user_id=$1 AND asset_id=$2 FOR UPDATE`, [u.id, a.id]);
  if (!r.rows[0]) throw bad('Buy it first');
  const level = r.rows[0].level;
  if (level >= G.ASSET_MAX_LEVEL) throw bad('Already at max level');
  const cost = E.assetUpgradeCost(a, level);
  if (u.cash < cost) throw bad('Not enough cash');
  u.cash -= cost;
  await c.query(`UPDATE user_assets SET level=level+1 WHERE user_id=$1 AND asset_id=$2`, [u.id, a.id]);
  await rederive(c, u);
}));

// ------------------------------------------------------------------ luxury collection
gameRouter.post('/items/buy', act(async (c, u, req) => {
  const it = G.ITEM_BY_ID[req.body?.item_id]; if (!it) throw bad('Unknown item');
  const have = await c.query(`SELECT 1 FROM user_items WHERE user_id=$1 AND item_id=$2`, [u.id, it.id]);
  if (have.rowCount) throw bad('You already own this');
  if (u.cash < it.price) throw bad('Not enough cash');
  u.cash -= it.price;
  await c.query(`INSERT INTO user_items (user_id, item_id) VALUES ($1,$2)`, [u.id, it.id]);
  await rederive(c, u);
}));

// ------------------------------------------------------------------ stock trading
gameRouter.post('/trade', act(async (c, u, req) => {
  const s = G.STOCK_BY_ID[req.body?.stock_id]; if (!s) throw bad('Unknown stock');
  const side = req.body?.side;
  const shares = Math.floor(Number(req.body?.shares));
  if (!['buy', 'sell'].includes(side)) throw bad('Choose buy or sell');
  if (!Number.isFinite(shares) || shares < 1) throw bad('Enter a number of shares');
  const price = priceOf(s.id);
  const hr = await c.query(`SELECT shares::text AS shares, cost FROM holdings WHERE user_id=$1 AND stock_id=$2 FOR UPDATE`, [u.id, s.id]);
  const held = hr.rows[0] ? Number(hr.rows[0].shares) : 0;
  const cost0 = hr.rows[0] ? hr.rows[0].cost : 0;
  if (side === 'buy') {
    if (held + shares > G.STOCK_MAX_SHARES) throw bad(`You can hold at most ${G.STOCK_MAX_SHARES.toLocaleString('en-US')} shares of ${s.id}`);
    const cost = shares * price * (1 + G.STOCK_FEE);
    if (u.cash < cost) throw bad('Not enough cash');
    u.cash -= cost;
    await c.query(`INSERT INTO holdings (user_id, stock_id, shares, cost) VALUES ($1,$2,$3,$4)
                   ON CONFLICT (user_id, stock_id) DO UPDATE SET shares = holdings.shares + $3, cost = holdings.cost + $4`, [u.id, s.id, shares, cost]);
  } else {
    if (shares > held) throw bad('You do not own that many shares');
    const proceeds = shares * price * (1 - G.STOCK_FEE);
    const basis = cost0 * (shares / held);
    u.cash += proceeds;
    u.trade_pnl += proceeds - basis;
    if (u.trade_pnl > u.trade_pnl_peak) {          // only new all-time highs count as "earned" (losses are never ignored)
      const e = u.trade_pnl - u.trade_pnl_peak; u.trade_pnl_peak = u.trade_pnl;
      u.lifetime_earned += e; u.run_earned += e; u.season_earned += e;
    }
    await c.query(`UPDATE holdings SET shares = shares - $3, cost = cost - $4 WHERE user_id=$1 AND stock_id=$2`, [u.id, s.id, shares, basis]);
  }
  const pv = await c.query(`SELECT stock_id, shares::text AS shares FROM holdings WHERE user_id=$1 AND shares > 0`, [u.id]);
  u.portfolio_value = pv.rows.reduce((t, r) => t + Number(r.shares) * priceOf(r.stock_id), 0);
}));

// ------------------------------------------------------------------ prestige
gameRouter.post('/prestige', act(async (c, u) => {
  const gain = E.prestigeStarsFor(u.run_earned);
  if (gain < 1) throw bad(`Earn at least $${E.fmt(E.PRESTIGE_MIN_RUN)} in this run to prestige`);
  await c.query(`DELETE FROM user_assets WHERE user_id=$1`, [u.id]);
  await c.query(`DELETE FROM holdings WHERE user_id=$1`, [u.id]);
  u.cash = E.START_CASH; u.tap_level = 0; u.run_earned = 0; u.trade_pnl = 0; u.trade_pnl_peak = 0;
  u.prestige_count += 1; u.prestige_stars += gain; u.portfolio_value = 0;
  await rederive(c, u);
  await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'prestige',$2)`, [u.id, `Prestige complete: +${gain} stars, now x${E.prestigeMult(u.prestige_stars).toFixed(2)} income and taps.`]);
}));

// ------------------------------------------------------------------ profile
gameRouter.post('/profile', asyncH(async (req, res) => {
  const p = validateProfile(req.body || {}, { partial: true });
  if (!Object.keys(p).length) throw bad('Nothing to update');
  const keys = Object.keys(p);
  try {
    await q(`UPDATE users SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1`, [req.uid, ...keys.map(k => p[k])]);
  } catch (e) { if (e.code === '23505') throw bad('That company name is already taken'); throw e; }
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ rewards / wallet
gameRouter.get('/rewards', asyncH(async (req, res) => {
  const u = (await q(`SELECT id, status, is_bot FROM users WHERE id=$1`, [req.uid])).rows[0];
  const day = await rewardDay();
  const out = await tx(async c => ({ summary: await rewards.summary(c, u, day) }));
  res.json({ ...out, ...(await rewards.history(req.uid)) });
}));
gameRouter.post('/rewards/withdraw', asyncH(async (req, res) => {
  res.json({ ok: true, ...(await rewards.requestWithdrawal(req.uid, req.body || {})) });
}));

// ------------------------------------------------------------------ static definitions (cacheable)
export const gamedataHandler = (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    regions: G.REGIONS, categories: G.CATEGORIES, regionUnlockOwned: G.REGION_UNLOCK_OWNED, regionSetBonus: G.REGION_SET_BONUS, assetMaxLevel: G.ASSET_MAX_LEVEL,
    assets: G.ASSETS.map(a => ({ id: a.id, region: a.region, regionIndex: a.regionIndex, k: a.k, index: a.index, cat: a.cat, name: a.name, cost: E.assetBaseCost(a), income: E.assetBaseIncome(a), payback: E.assetPayback(a),
      upgrade: Array.from({ length: G.ASSET_MAX_LEVEL - 1 }, (_, i) => E.assetUpgradeCost(a, i + 1)) })),
    itemCategories: G.ITEM_CATEGORIES, items: G.ITEMS.map(({ q, ...i }) => i),
    stocks: G.STOCKS, stockMax: G.STOCK_MAX_SHARES, stockFee: G.STOCK_FEE, stockStepSeconds: G.STOCK_STEP_SECONDS,
    leagues: G.LEAGUES, leagueRewardHours: G.LEAGUE_REWARD_HOURS, leaguePromote: G.LEAGUE_PROMOTE, leagueDemote: G.LEAGUE_DEMOTE,
    tiers: G.TIERS, industries: G.INDUSTRIES,
    expand: {
      regionCountries: Object.fromEntries(Object.entries(G.REGION_COUNTRIES).map(([r, l]) => [r, l.map(([code]) => ({ code, costs: Array.from({ length: G.BRANCH_MAX_LEVEL }, (_, i) => E.branchCost(code, i + 1)) }))])),
      maxLevel: G.BRANCH_MAX_LEVEL, incomePerLevel: G.BRANCH_INCOME_PER_LEVEL, regionSetBonus: G.BRANCH_REGION_SET_BONUS, partnerBonus: G.PARTNER_INCOME_BONUS, partnerMax: G.PARTNER_MAX,
    },
    config: { appName: config.appName, boostSeconds: E.BOOST_SECONDS, boostCooldown: E.BOOST_COOLDOWN_SECONDS, prestigeMinRun: E.PRESTIGE_MIN_RUN, prestigeStarBonus: E.PRESTIGE_STAR_BONUS,
      tapMaxPerSec: config.tapRefillPerSec, rewardsEnabled: config.rewardsEnabled, maxRateMicro: config.maxRateMicroPerTap, dailyUnitCap: config.dailyUnitCap,
      minWithdrawMicro: config.minWithdrawMicro, minAccountAgeDays: config.minAccountAgeDays, offlineCapHours: config.offlineCapHours,
      auction: { slots: config.auctionSlots, hours: config.auctionHours, minBidMicro: config.auctionMinBidMicro, minRaiseMicro: config.auctionMinRaiseMicro } },
    upgradeIncomeFactor: 0.6,
  });
};
