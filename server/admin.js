import { Router } from 'express';
import { q, tx, rewardDay } from './db.js';
import { config } from './config.js';
import { asyncH, bad, clean, cleanUrl, HttpError, toMicro } from './util.js';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getPaymentConfig } from './wallet.js';
import { closeDueAuctions, auctionSnapshot } from './auction.js';
import * as rewards from './rewards.js';

export const adminRouter = Router();

// ---- owner login: its own credentials (ADMIN_USERNAME / ADMIN_PASSWORD) and its own cookie, independent of any player account ----
const ACOOKIE = 'te_admin';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const limitAdmin = rateLimit({ windowMs: 15 * 60e3, limit: config.adminLoginLimitPer15Min, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });
const isAdminReq = (req) => { try { return jwt.verify(req.cookies?.[ACOOKIE] || '', config.jwtSecret).role === 'admin'; } catch { return false; } };
export const requireAdmin = (req, _res, next) => (isAdminReq(req) ? next() : next(new HttpError(401, 'Admin sign-in required')));

adminRouter.post('/login', limitAdmin, asyncH(async (req, res) => {
  if (!config.adminUsername || !config.adminPassword) throw new HttpError(503, 'Admin login is not set up on this server');
  const u = String(req.body?.username ?? ''), p = String(req.body?.password ?? '');
  const ok = same(u, config.adminUsername) & same(p, config.adminPassword);   // both always evaluated
  if (!ok) { await new Promise(r => setTimeout(r, 600)); throw new HttpError(401, 'Wrong username or password'); }
  const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
  res.cookie(ACOOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, maxAge: 12 * 3600e3, path: '/' });
  res.json({ ok: true });
}));
adminRouter.post('/logout', (_req, res) => { res.clearCookie(ACOOKIE, { path: '/' }); res.json({ ok: true }); });
adminRouter.get('/me', (req, res) => res.json({ admin: isAdminReq(req), configured: !!(config.adminUsername && config.adminPassword) }));
adminRouter.use(requireAdmin);
const num = (r) => ({ ...r });

adminRouter.get('/stats', asyncH(async (_req, res) => {
  const day = await rewardDay();
  const [u, tp, st, wd, sp, funds] = await Promise.all([
    q(`SELECT COUNT(*) FILTER (WHERE NOT is_bot)::int AS players, COUNT(*) FILTER (WHERE NOT is_bot AND created_at > now() - interval '24 hours')::int AS new_24h,
              COUNT(*) FILTER (WHERE NOT is_bot AND last_seen > now() - interval '24 hours')::int AS active_24h, COUNT(*) FILTER (WHERE is_bot)::int AS bots,
              COUNT(*) FILTER (WHERE status='frozen')::int AS frozen FROM users`),
    q(`SELECT COALESCE(SUM(units),0)::int AS units, COUNT(*)::int AS players FROM daily_taps WHERE day=$1`, [day]),
    q(`SELECT day::text, pool_micro::text, units_total::text, paid_micro::text, rollover_micro::text, players FROM reward_settlements ORDER BY day DESC LIMIT 14`),
    q(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending, COALESCE(SUM(micro) FILTER (WHERE status='pending'),0)::text AS pending_micro,
              COALESCE(SUM(micro) FILTER (WHERE status='paid'),0)::text AS paid_micro FROM withdrawals`),
    q(`SELECT COUNT(*) FILTER (WHERE status='active')::int AS active, COALESCE(SUM(budget_micro),0)::text AS budget_micro, COALESCE(SUM(clicks),0)::int AS clicks, COALESCE(SUM(impressions),0)::int AS impressions FROM sponsors`),
    q(`SELECT source, COALESCE(SUM(micro),0)::text AS micro FROM pool_funds GROUP BY source`),
  ]);
  const pool = await tx(async c => rewards.todayPool(c, day));
  res.json({
    day, users: u.rows[0], taps_today: tp.rows[0], pool_today_micro: Number(pool.pool), pool_units_today: Number(pool.units),
    settlements: st.rows.map(r => ({ ...r, pool_micro: Number(r.pool_micro), units_total: Number(r.units_total), paid_micro: Number(r.paid_micro), rollover_micro: Number(r.rollover_micro) })),
    withdrawals: { ...wd.rows[0], pending_micro: Number(wd.rows[0].pending_micro), paid_micro: Number(wd.rows[0].paid_micro) },
    sponsors: { ...sp.rows[0], budget_micro: Number(sp.rows[0].budget_micro) },
    funds: funds.rows.map(r => ({ source: r.source, micro: Number(r.micro) })),
    settings: { rewardsEnabled: config.rewardsEnabled, adRevenueShare: config.adRevenueShare, maxRateMicroPerTap: config.maxRateMicroPerTap, dailyUnitCap: config.dailyUnitCap, tz: config.rewardTz },
  });
}));

adminRouter.get('/users', asyncH(async (req, res) => {
  const text = clean(String(req.query.q || ''), 60);
  const p = []; const w = [`NOT u.is_bot`];
  if (text) { p.push(`%${text}%`); w.push(`(u.company_name ILIKE $1 OR u.email ILIKE $1)`); }
  if (req.query.status) { p.push(String(req.query.status)); w.push(`u.status = $${p.length}`); }
  const r = await q(
    `SELECT u.id, u.email, u.company_name, u.country, u.status, u.created_at, u.last_seen, u.lifetime_earned AS score, u.tap_total::text AS taps,
            (SELECT COUNT(*) FROM users x WHERE x.signup_ip_hash = u.signup_ip_hash AND NOT x.is_bot)::int AS same_network,
            COALESCE((SELECT SUM(micro) FROM wallet_ledger l WHERE l.user_id=u.id),0)::text AS balance_micro, u.credits_micro::text AS credits
     FROM users u WHERE ${w.join(' AND ')} ORDER BY u.id DESC LIMIT 100`, p);
  res.json({ rows: r.rows.map(x => ({ ...x, balance_micro: Number(x.balance_micro), credits_micro: Number(x.credits), taps: Number(x.taps) })) });
}));
adminRouter.post('/users/:id/status', asyncH(async (req, res) => {
  const s = req.body?.status;
  if (!['active', 'frozen', 'banned'].includes(s)) throw bad('Bad status');
  await q(`UPDATE users SET status=$2 WHERE id=$1`, [parseInt(req.params.id), s]);
  res.json({ ok: true });
}));

adminRouter.get('/withdrawals', asyncH(async (req, res) => {
  const status = ['pending', 'paid', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await q(`SELECT w.id, w.user_id, w.micro::text AS micro, w.method, w.account, w.status, w.admin_note, w.created_at, w.processed_at, u.company_name, u.email, u.country, u.created_at AS joined,
                            u.tap_total::text AS taps, (SELECT COUNT(*) FROM users x WHERE x.signup_ip_hash = u.signup_ip_hash)::int AS same_network
                     FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status=$1 ORDER BY w.id DESC LIMIT 100`, [status]);
  res.json({ rows: r.rows.map(x => ({ ...x, micro: Number(x.micro), taps: Number(x.taps) })) });
}));
adminRouter.post('/withdrawals/:id/:action', asyncH(async (req, res) => {
  const action = req.params.action;
  if (!['pay', 'reject'].includes(action)) throw new HttpError(404, 'Unknown action');
  const note = clean(req.body?.note || '', 200);
  await tx(async c => {
    const r = await c.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [parseInt(req.params.id)]);
    const w = r.rows[0];
    if (!w || w.status !== 'pending') throw bad('Not a pending withdrawal');
    await c.query(`UPDATE withdrawals SET status=$2, admin_note=$3, processed_at=now() WHERE id=$1`, [w.id, action === 'pay' ? 'paid' : 'rejected', note]);
    if (action === 'reject') await c.query(`INSERT INTO wallet_ledger (user_id, kind, micro, ref) VALUES ($1,'withdraw_refund',$2,$3)`, [w.user_id, w.micro, `w${w.id}`]);
    await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'withdraw',$2)`, [w.user_id,
      action === 'pay' ? `Your withdrawal of $${(Number(w.micro) / 1e6).toFixed(2)} was paid via ${w.method}.` : `Your withdrawal of $${(Number(w.micro) / 1e6).toFixed(2)} was declined and returned to your wallet.${note ? ' Note: ' + note : ''}`]);
  });
  res.json({ ok: true });
}));

// Money in: gross ad revenue (we pass on AD_REVENUE_SHARE of it) or your own manual top-up.
adminRouter.post('/funds', asyncH(async (req, res) => {
  const source = req.body?.source === 'manual' ? 'manual' : 'ads';
  const amount = Number(req.body?.amount_usd);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw bad('Enter a USD amount');
  const micro = source === 'ads' ? toMicro(amount * config.adRevenueShare) : toMicro(amount);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.day || '') ? req.body.day : await rewardDay();
  await q(`INSERT INTO pool_funds (day, source, micro, note) VALUES ($1,$2,$3,$4)`,
    [day, source, micro.toString(), clean(req.body?.note || (source === 'ads' ? `gross ad revenue $${amount}` : 'manual top-up'), 120)]);
  res.json({ ok: true, added_micro: Number(micro), day });
}));

adminRouter.get('/sponsors', asyncH(async (_req, res) => {
  const r = await q(`SELECT s.*, s.budget_micro::text AS budget, u.company_name AS company FROM sponsors s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 100`);
  res.json({ rows: r.rows.map(x => ({ ...x, budget_micro: Number(x.budget), starts_on: x.starts_on, ends_on: x.ends_on })) });
}));
adminRouter.post('/sponsors', asyncH(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 60); if (name.length < 2) throw bad('Sponsor name required');
  const budget = Number(b.budget_usd); if (!Number.isFinite(budget) || budget < 0) throw bad('Budget (USD) required');
  const share = Math.min(1, Math.max(0, Number(b.reward_share ?? 0.6)));
  const days = Math.min(365, Math.max(1, parseInt(b.days) || 30));
  const url = cleanUrl(b.url || '', { max: 300 });
  let userId = null;
  if (b.company_id) { const r = await q(`SELECT id FROM users WHERE id=$1`, [parseInt(b.company_id)]); if (!r.rows[0]) throw bad('No company with that id'); userId = r.rows[0].id; }
  const day = await rewardDay();
  const id = await tx(async c => {
    const r = await c.query(
      `INSERT INTO sponsors (name, user_id, url, tagline, budget_micro, reward_share, starts_on, ends_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date,$7::date + $8::int - 1) RETURNING id`, [name, userId, url, clean(b.tagline || '', 90), toMicro(budget).toString(), share, day, days]);
    await rewards.fundCampaigns(c, day);
    return r.rows[0].id;
  });
  res.json({ ok: true, id });
}));
adminRouter.post('/sponsors/:id/status', asyncH(async (req, res) => {
  const s = ['active', 'paused', 'ended'].includes(req.body?.status) ? req.body.status : null; if (!s) throw bad('Bad status');
  await q(`UPDATE sponsors SET status=$2 WHERE id=$1`, [parseInt(req.params.id), s]);
  res.json({ ok: true });
}));

adminRouter.post('/settle', asyncH(async (_req, res) => { res.json({ ok: true, settled: await rewards.settleDue() }); }));

// ---------------------------------------------------------------- deposits (credits)
adminRouter.get('/deposits', asyncH(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await q(`SELECT d.id, d.user_id, d.method, d.amount_usd_micro::text AS usd, d.amount_local::float8 AS local, d.currency, d.txn_id, d.sender, d.status, d.admin_note, d.created_at, d.processed_at, u.company_name, u.email, u.country
                     FROM deposits d JOIN users u ON u.id=d.user_id WHERE d.status=$1 ORDER BY d.id DESC LIMIT 100`, [status]);
  res.json({ rows: r.rows.map(x => ({ ...x, usd_micro: Number(x.usd) })) });
}));
adminRouter.post('/deposits/:id/:action', asyncH(async (req, res) => {
  const action = req.params.action;
  if (!['approve', 'reject'].includes(action)) throw new HttpError(404, 'Unknown action');
  const note = clean(req.body?.note || '', 200);
  await tx(async c => {
    const d = (await c.query(`SELECT * FROM deposits WHERE id=$1 FOR UPDATE`, [parseInt(req.params.id)])).rows[0];
    if (!d || d.status !== 'pending') throw bad('Not a pending deposit');
    await c.query(`UPDATE deposits SET status=$2, admin_note=$3, processed_at=now() WHERE id=$1`, [d.id, action === 'approve' ? 'approved' : 'rejected', note]);
    if (action === 'approve') {
      await c.query(`UPDATE users SET credits_micro = credits_micro + $2 WHERE id=$1`, [d.user_id, d.amount_usd_micro]);
      await c.query(`INSERT INTO credit_ledger (user_id, micro, kind, ref) VALUES ($1,$2,'deposit',$3)`, [d.user_id, d.amount_usd_micro, `deposit:${d.id}`]);
    }
    await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'deposit',$2)`, [d.user_id,
      action === 'approve' ? `Your deposit of $${(Number(d.amount_usd_micro) / 1e6).toFixed(2)} was approved and added to your credits.` : `Your deposit request was declined.${note ? ' Note: ' + note : ''}`]);
  });
  res.json({ ok: true });
}));
adminRouter.post('/users/:id/credits', asyncH(async (req, res) => {
  const amount = Number(req.body?.amount_usd);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) throw bad('Enter a dollar amount (negative to remove)');
  const micro = Number(toMicro(amount));
  await tx(async c => {
    const r = await c.query(`UPDATE users SET credits_micro = credits_micro + $2 WHERE id=$1 AND credits_micro + $2 >= 0 RETURNING id`, [parseInt(req.params.id), micro]);
    if (!r.rows[0]) throw bad('User not found or balance would go below zero');
    await c.query(`INSERT INTO credit_ledger (user_id, micro, kind, ref) VALUES ($1,$2,'adjust',$3)`, [parseInt(req.params.id), micro, clean(req.body?.note || 'admin adjustment', 80)]);
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- payment accounts ("connect wallet")
adminRouter.get('/payments', asyncH(async (_req, res) => { res.json(await getPaymentConfig()); }));
adminRouter.post('/payments', asyncH(async (req, res) => {
  const b = req.body || {};
  const methods = (Array.isArray(b.methods) ? b.methods : []).slice(0, 8).map(m => ({
    id: clean(m.id, 24).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'method', label: clean(m.label, 40), account_title: clean(m.account_title, 60),
    account_number: clean(m.account_number, 40), note: clean(m.note, 120), enabled: m.enabled !== false,
  })).filter(m => m.label);
  const rate = Number(b.pkr_per_usd); if (!(rate > 0 && rate < 10000)) throw bad('Enter the PKR per USD rate');
  const value = JSON.stringify({ methods, pkr_per_usd: rate, instructions: clean(b.instructions, 400), min_usd: Number(b.min_usd) > 0 ? Number(b.min_usd) : 1, max_usd: Number(b.max_usd) > 0 ? Number(b.max_usd) : 500 });
  await q(`INSERT INTO settings (key, value) VALUES ('payments', $1) ON CONFLICT (key) DO UPDATE SET value=$1`, [value]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- auction control
adminRouter.get('/auction', asyncH(async (_req, res) => {
  const snap = await tx(c => auctionSnapshot(c, 0));
  res.json(snap);
}));
adminRouter.post('/auction/close-now', asyncH(async (_req, res) => { res.json({ ok: true, closed: await closeDueAuctions({ force: true }) }); }));
adminRouter.get('/revenue', asyncH(async (_req, res) => {
  const [dep, auc] = await Promise.all([
    q(`SELECT COALESCE(SUM(amount_usd_micro) FILTER (WHERE status='approved'),0)::text AS approved, COALESCE(SUM(amount_usd_micro) FILTER (WHERE status='pending'),0)::text AS pending, COUNT(*) FILTER (WHERE status='pending')::int AS pending_n FROM deposits`),
    q(`SELECT COALESCE(SUM(amount_micro),0)::text AS total, COUNT(*)::int AS wins FROM auction_wins`),
  ]);
  res.json({ deposits_approved_micro: Number(dep.rows[0].approved), deposits_pending_micro: Number(dep.rows[0].pending), deposits_pending: dep.rows[0].pending_n, auction_revenue_micro: Number(auc.rows[0].total), auction_wins: auc.rows[0].wins });
}));
