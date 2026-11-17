// Real-money rewards. Design goal: payouts can NEVER exceed the money that was actually put into the pool.
//   pool(day)   = rollover + ad-revenue share + sponsor funding for that day (all integer micro-USD)
//   payout(you) = pool * yourUnits / totalUnits, but never more than MAX_RATE_MICRO_PER_TAP per unit
//   whatever is not paid rolls over to the next day. Nothing is ever created from thin air.
import { q, tx, rewardDay } from './db.js';
import { config } from './config.js';
import { HttpError, bad, clean } from './util.js';

export const eligible = (u) => config.rewardsEnabled && u.status === 'active' && !u.is_bot;

/** Count reward-eligible taps (units), capped per player per day. Returns units today. */
export async function addUnits(c, uid, n, day) {
  const cap = config.dailyUnitCap;
  const r = await c.query(
    `INSERT INTO daily_taps (day, user_id, units) VALUES ($1,$2,LEAST($3::int,$4::int))
     ON CONFLICT (day, user_id) DO UPDATE SET units = LEAST($3::int, daily_taps.units + $4::int) RETURNING units`,
    [day, uid, cap, n]);
  return r.rows[0].units;
}

export async function balanceMicro(c, uid) {
  const r = await c.query(`SELECT COALESCE(SUM(micro),0)::text AS b FROM wallet_ledger WHERE user_id=$1`, [uid]);
  return BigInt(r.rows[0].b);
}

/** Today's pool, units and the rate a tap is currently worth. */
export async function todayPool(c, day) {
  const [st, f, t] = await Promise.all([
    c.query(`SELECT rollover_micro::text AS r FROM pool_state WHERE id=1`),
    c.query(`SELECT COALESCE(SUM(micro),0)::text AS s FROM pool_funds WHERE day=$1`, [day]),
    c.query(`SELECT COALESCE(SUM(dt.units),0)::bigint::text AS u, COUNT(*)::int AS n
             FROM daily_taps dt JOIN users u ON u.id=dt.user_id
             WHERE dt.day=$1 AND u.status='active' AND NOT u.is_bot AND dt.units>0`, [day]),
  ]);
  const pool = BigInt(st.rows[0].r) + BigInt(f.rows[0].s);
  const units = BigInt(t.rows[0].u);
  return { pool, units, players: t.rows[0].n };
}

export function rateFor(pool, units, myUnits = 1n) {
  const maxRate = BigInt(config.maxRateMicroPerTap);
  const total = units > myUnits ? units : myUnits;           // include yourself in the estimate
  if (total === 0n) return maxRate;
  const byPool = pool / total;
  return byPool < maxRate ? byPool : maxRate;
}

export async function summary(c, u, day) {
  const my = await c.query(`SELECT units FROM daily_taps WHERE day=$1 AND user_id=$2`, [day, u.id]);
  const units = BigInt(my.rows[0]?.units ?? 0);
  const { pool, units: total, players } = await todayPool(c, day);
  const rate = rateFor(pool, total, units);
  const bal = await balanceMicro(c, u.id);
  return {
    enabled: config.rewardsEnabled,
    eligible: eligible(u),
    balance_micro: Number(bal),
    units_today: Number(units),
    unit_cap: config.dailyUnitCap,
    est_today_micro: Number(rate * units),
    rate_micro: Number(rate),
    pool_today_micro: Number(pool),
    players_today: players,
    min_withdraw_micro: config.minWithdrawMicro,
  };
}

export async function history(uid) {
  const [l, w] = await Promise.all([
    q(`SELECT id, kind, micro::text AS micro, ref, created_at FROM wallet_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [uid]),
    q(`SELECT id, micro::text AS micro, method, status, admin_note, created_at, processed_at FROM withdrawals WHERE user_id=$1 ORDER BY id DESC LIMIT 10`, [uid]),
  ]);
  return {
    ledger: l.rows.map(r => ({ ...r, micro: Number(r.micro) })),
    withdrawals: w.rows.map(r => ({ ...r, micro: Number(r.micro) })),
  };
}

const METHODS = ['jazzcash', 'easypaisa', 'bank', 'paypal', 'wise', 'other'];

export async function requestWithdrawal(uid, body) {
  if (!config.rewardsEnabled) throw new HttpError(403, 'Rewards are switched off');
  const method = clean(body.method, 20).toLowerCase();
  const account = clean(body.account, 80);
  if (!METHODS.includes(method)) throw bad('Choose a payout method');
  if (account.length < 4) throw bad('Enter your account number or email for this payout method');
  return tx(async c => {
    const ur = await c.query(`SELECT id, status, is_bot, created_at, now() AS now FROM users WHERE id=$1 FOR UPDATE`, [uid]);
    const u = ur.rows[0];
    if (!u || u.status !== 'active' || u.is_bot) throw new HttpError(403, 'This account cannot withdraw');
    const ageDays = (u.now - u.created_at) / 86400000;
    if (ageDays < config.minAccountAgeDays) throw bad(`Withdrawals unlock ${config.minAccountAgeDays} days after sign-up`);
    const bal = await balanceMicro(c, uid);
    const amount = body.amount_micro ? BigInt(Math.floor(Number(body.amount_micro))) : bal;   // default: everything
    if (amount < BigInt(config.minWithdrawMicro)) throw bad(`Minimum withdrawal is $${(config.minWithdrawMicro / 1e6).toFixed(2)}`);
    if (amount > bal) throw bad('Not enough balance');
    const pending = await c.query(`SELECT 1 FROM withdrawals WHERE user_id=$1 AND status='pending'`, [uid]);
    if (pending.rowCount) throw bad('You already have a withdrawal waiting for review');
    const w = await c.query(`INSERT INTO withdrawals (user_id, micro, method, account) VALUES ($1,$2,$3,$4) RETURNING id`, [uid, amount.toString(), method, account]);
    await c.query(`INSERT INTO wallet_ledger (user_id, kind, micro, ref) VALUES ($1,'withdraw_hold',$2,$3)`, [uid, (-amount).toString(), `w${w.rows[0].id}`]);
    return { id: w.rows[0].id, micro: Number(amount) };
  });
}

/** Add the day's share of every running sponsor campaign to the pool (idempotent). */
export async function fundCampaigns(c, day) {
  await c.query(
    `INSERT INTO pool_funds (day, source, campaign_id, micro, note)
     SELECT $1::date, 'sponsor', s.id, floor(s.budget_micro * s.reward_share / (s.ends_on - s.starts_on + 1))::bigint, 'sponsor: ' || s.name
     FROM sponsors s WHERE s.status='active' AND s.starts_on <= $1::date AND s.ends_on >= $1::date
     ON CONFLICT (day, campaign_id) WHERE campaign_id IS NOT NULL DO NOTHING`, [day]);
  await c.query(`UPDATE sponsors SET status='ended' WHERE status='active' AND ends_on < $1::date`, [day]);
}

/** Pay out one finished day. Safe to call repeatedly: a settled day is skipped. */
export async function settleDay(day) {
  return tx(async c => {
    await c.query(`SELECT pg_advisory_xact_lock(7001)`);
    if ((await c.query(`SELECT 1 FROM reward_settlements WHERE day=$1`, [day])).rowCount) return null;
    await fundCampaigns(c, day);
    const st = await c.query(`SELECT rollover_micro::text AS r FROM pool_state WHERE id=1 FOR UPDATE`);
    const f = await c.query(`SELECT COALESCE(SUM(micro),0)::text AS s FROM pool_funds WHERE day=$1`, [day]);
    const pool = BigInt(st.rows[0].r) + BigInt(f.rows[0].s);
    const rows = (await c.query(
      `SELECT dt.user_id, dt.units FROM daily_taps dt JOIN users u ON u.id=dt.user_id
       WHERE dt.day=$1 AND u.status='active' AND NOT u.is_bot AND dt.units>0`, [day])).rows;
    let total = 0n; for (const r of rows) total += BigInt(r.units);
    let paid = 0n; const payouts = [];
    if (config.rewardsEnabled && total > 0n) {
      const maxRate = BigInt(config.maxRateMicroPerTap);
      const ceiling = total * maxRate;
      const distributable = pool < ceiling ? pool : ceiling;
      for (const r of rows) {
        const p = distributable * BigInt(r.units) / total;
        if (p > 0n) { payouts.push([r.user_id, p]); paid += p; }
      }
    }
    if (paid > pool) throw new Error('invariant violated: payouts exceed pool');   // defence in depth
    for (const [uid, p] of payouts) {
      await c.query(`INSERT INTO wallet_ledger (user_id, kind, micro, ref) VALUES ($1,'reward',$2,$3) ON CONFLICT DO NOTHING`, [uid, p.toString(), `day:${day}`]);
      await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'reward',$2)`, [uid, `Your taps on ${day} earned $${(Number(p) / 1e6).toFixed(4)} in real rewards.`]);
    }
    const rollover = pool - paid;
    await c.query(`UPDATE pool_state SET rollover_micro=$1 WHERE id=1`, [rollover.toString()]);
    await c.query(`INSERT INTO reward_settlements (day, pool_micro, units_total, paid_micro, rollover_micro, players) VALUES ($1,$2,$3,$4,$5,$6)`,
      [day, pool.toString(), total.toString(), paid.toString(), rollover.toString(), payouts.length]);
    await c.query(`DELETE FROM daily_taps WHERE day < ($1::date - 30)`, [day]);
    return { day, pool: Number(pool), units: Number(total), paid: Number(paid), rollover: Number(rollover), players: payouts.length };
  });
}

/** Settle every unsettled day that has finished (handles server downtime). */
export async function settleDue() {
  const today = await rewardDay();
  const r = await q(
    `SELECT d::date::text AS day FROM generate_series(
        COALESCE((SELECT max(day) + 1 FROM reward_settlements), $1::date - 1), $1::date - 1, interval '1 day') d
     WHERE d::date < $1::date`, [today]);
  const out = [];
  for (const row of r.rows) { const s = await settleDay(row.day); if (s) out.push(s); }
  return out;
}
