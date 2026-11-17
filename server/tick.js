import { pool, q, tx, rewardDay } from './db.js';
import { config } from './config.js';
import { stepMarket, persistMarket, getMarket, pruneTicks } from './market.js';
import { closeDueAuctions } from './auction.js';
import { rolloverIfDue, assignLeague, currentSeason } from './leagues.js';
import * as rewards from './rewards.js';
import { connectedUserIds, sendTo, heartbeat } from './sse.js';
import { LEAGUES, STOCK_STEP_SECONDS } from './gamedata.js';

let running = false, n = 0, lastTick = null;
export const tickInfo = () => ({ lastTick, running });

export async function tick() {
  if (running) return;
  running = true;
  const lock = await pool.connect();                          // one tick at a time even with several server instances
  try {
    const got = (await lock.query(`SELECT pg_try_advisory_lock(7000) AS ok`)).rows[0].ok;
    if (!got) return;
    try {
      // 0. demo bots stay "online" and grow
      await q(`UPDATE users SET last_seen = now(), income_per_hour = income_per_hour * (1 + bot_growth / 60 * (0.4 + random() * 1.2)) WHERE is_bot`);
      // players with an open connection are present: keep their "last seen" fresh so they never get a fake "while you were away" bonus
      const here = connectedUserIds(); if (here.length) await q(`UPDATE users SET last_seen = now() WHERE id = ANY($1)`, [here]);
      // 1. passive income for everyone, capped at the offline limit
      await q(`UPDATE users SET
                 cash = cash + g.g, lifetime_earned = lifetime_earned + g.g, run_earned = run_earned + g.g, season_earned = season_earned + g.g,
                 away_earned = away_earned + CASE WHEN users.last_seen < now() - interval '2 minutes' THEN g.g ELSE 0 END,
                 last_accrual = now(), net_worth = users.cash + g.g + assets_value + items_value + portfolio_value
               FROM (SELECT id, income_per_hour * GREATEST(0, EXTRACT(EPOCH FROM (LEAST(now(), last_seen + ($1 || ' hours')::interval) - last_accrual))) / 3600 AS g
                     FROM users WHERE income_per_hour > 0 AND status <> 'banned') g
               WHERE users.id = g.id`, [String(config.offlineCapHours)]);
      // 2. shared stock market moves, then everyone's portfolio is re-valued
      await persistMarket();
      await q(`UPDATE users u SET portfolio_value = p.v, net_worth = u.cash + u.assets_value + u.items_value + p.v
               FROM (SELECT h.user_id, SUM(h.shares::float8 * st.price) AS v FROM holdings h JOIN stocks st ON st.id = h.stock_id GROUP BY h.user_id) p
               WHERE u.id = p.user_id`);
      // 3. league season, sponsor funding, reward settlement
      const roll = await rolloverIfDue(); if (roll) console.log('[tick] season rolled over', roll);
      await tx(async c => rewards.fundCampaigns(c, await rewardDay(c)));
      const settled = await rewards.settleDue(); for (const s of settled) console.log('[tick] rewards settled', s);
      const closed = await closeDueAuctions(); for (const s of closed) { console.log('[tick] auction closed', s); for (const id of connectedUserIds()) sendTo(id, 'auction', { closed: true }); }
      n++; if (n % 30 === 0) await pruneTicks();
      lastTick = new Date();
      await broadcast();
    } finally { await lock.query(`SELECT pg_advisory_unlock(7000)`); }
  } catch (e) {
    console.error('[tick] failed', e);
  } finally { lock.release(); running = false; }
}

async function broadcast() {
  const ids = connectedUserIds();
  if (!ids.length) return;
  const m = getMarket();
  const market = { t: m.t, stocks: m.stocks.map(s => ({ id: s.id, price: s.price, chg: s.chg })) };
  const r = await q(`SELECT id, cash, lifetime_earned AS score, season_earned, net_worth, income_per_hour, portfolio_value, credits_micro::float8 AS credits_micro FROM users WHERE id = ANY($1)`, [ids]);
  for (const row of r.rows) sendTo(row.id, 'tick', { market, me: row, t: Date.now() });
}

/** The shared market moves every few seconds; every open app gets the new prices at once. */
function marketLoop() {
  stepMarket();
  const ids = connectedUserIds(); if (!ids.length) return;
  const m = getMarket(), msg = { t: m.t, stocks: m.stocks.map(s => ({ id: s.id, price: s.price, chg: s.chg })) };
  for (const id of ids) sendTo(id, 'market', msg);
}

export function startTicker() {
  setInterval(tick, config.tickSeconds * 1000);
  setInterval(marketLoop, STOCK_STEP_SECONDS * 1000);
  setInterval(heartbeat, 25000);
  setTimeout(tick, 1500);
}

// ---------------------------------------------------------------------------- optional demo opponents
const PRE = ['Blue', 'Nova', 'Apex', 'Zen', 'Orbit', 'Prime', 'Delta', 'Lotus', 'Iron', 'Crimson', 'Silver', 'Vertex', 'Mango', 'Falcon', 'Atlas', 'Pixel', 'Cedar', 'Quantum', 'Sunrise', 'Harbor'];
const SUF = ['Labs', 'Digital', 'Foods', 'Trading', 'Studios', 'Logistics', 'Capital', 'Works', 'Systems', 'Media', 'Builders', 'Robotics', 'Textiles', 'Energy', 'Ventures', 'Design'];
const CTRY = ['PK', 'PK', 'PK', 'PK', 'IN', 'IN', 'US', 'US', 'BR', 'NG', 'ID', 'EG', 'TR', 'GB', 'DE', 'FR', 'BD', 'KE', 'MX', 'PH', 'VN', 'SA', 'AE', 'ZA'];
const IND = ['Technology', 'Marketing & Advertising', 'E-commerce & Retail', 'Manufacturing', 'Food & Hospitality', 'Logistics & Transport', 'Design & Creative', 'Energy'];

/** Fill the boards with clearly-labelled demo companies so a brand-new launch does not look empty. */
export async function seedDemoBots(count) {
  const have = (await q(`SELECT COUNT(*)::int n FROM users WHERE is_bot`)).rows[0].n;
  let made = 0;
  for (let i = have; i < count; i++) {
    const name = `${PRE[i % PRE.length]} ${SUF[(i * 7 + Math.floor(i / PRE.length)) % SUF.length]}${i >= PRE.length * SUF.length ? ' ' + i : ''}`;
    const income = Math.pow(10, 2.5 + Math.random() * 5.5);               // 300 .. 100M per hour
    const hours = 20 + Math.random() * 300;
    const earned = income * hours;
    try {
      await tx(async c => {
        const r = await c.query(
          `INSERT INTO users (email, pass_hash, company_name, tagline, industry, country, is_bot, income_per_hour, bot_growth, cash, lifetime_earned, run_earned, net_worth, tap_total)
           VALUES ($1,'!',$2,$3,$4,$5,TRUE,$6,$7,$8,$8,$8,$8,$9) RETURNING id`,
          [`bot${i}@bots.invalid`, name, 'Demo company', IND[i % IND.length], CTRY[i % CTRY.length], income, 0.002 + Math.random() * 0.012, earned, Math.floor(earned / 5)]);
        await assignLeague(c, r.rows[0].id, i % 9 === 0 ? 1 : 0);
        made++;
      });
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  if (made) console.log(`[seed] created ${made} demo companies`);
}
