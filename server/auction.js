import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, tx, rewardDay } from './db.js';
import { config } from './config.js';
import { asyncH, bad, toMicro } from './util.js';
import { requireAuth } from './auth.js';
import { sendTo, connectedUserIds } from './sse.js';

// Paid top-spot auction. The top `slots` bidders get a featured spot until the next auction closes.
// A bid is held from the bidder's credits at once; losers are refunded when the auction closes, winners pay their own bid.
export const auctionRouter = Router();
auctionRouter.use(requireAuth);

const PROFILE = `u.id, u.company_name, u.logo_url, u.banner_url, u.country, u.industry, u.tagline, u.website, u.lifetime_earned AS score`;
const shapeCo = (r) => ({ id: r.id, company_name: r.company_name, logo_url: r.logo_url, banner_url: r.banner_url, country: String(r.country).trim(), industry: r.industry, tagline: r.tagline, website: r.website });

export async function ensureOpenAuction(c) {
  let a = (await c.query(`SELECT * FROM auctions WHERE status='open'`)).rows[0];
  if (a) return a;
  await c.query(`INSERT INTO auctions (ends_at, slots) VALUES (now() + ($1 || ' hours')::interval, $2) ON CONFLICT DO NOTHING`, [String(config.auctionHours), config.auctionSlots]);
  a = (await c.query(`SELECT * FROM auctions WHERE status='open'`)).rows[0];
  return a;
}

const bidsOf = async (c, auctionId) => (await c.query(
  `SELECT b.user_id, b.amount_micro::text AS amount, b.created_at, ${PROFILE} FROM auction_bids b JOIN users u ON u.id=b.user_id
   WHERE b.auction_id=$1 ORDER BY b.amount_micro DESC, b.created_at ASC`, [auctionId])).rows;

export async function auctionSnapshot(c, uid) {
  const a = await ensureOpenAuction(c);
  const bids = await bidsOf(c, a.id);
  const slots = a.slots;
  const list = bids.slice(0, 25).map((b, i) => ({ rank: i + 1, amount_micro: Number(b.amount), mine: b.user_id === uid, winning: i < slots, company: shapeCo(b) }));
  const myIdx = bids.findIndex(b => b.user_id === uid);
  const cut = bids.length >= slots ? Number(bids[slots - 1].amount) : 0;
  const spots = (await c.query(
    `SELECT w.rank, w.amount_micro::text AS amount, ${PROFILE} FROM auction_wins w JOIN users u ON u.id=w.user_id
     WHERE w.auction_id = (SELECT MAX(id) FROM auctions WHERE status='closed') ORDER BY w.rank`)).rows
    .map(r => ({ rank: r.rank, amount_micro: Number(r.amount), company: shapeCo(r) }));
  const recent = (await c.query(
    `SELECT w.rank, w.amount_micro::text AS amount, a.id AS auction_id, a.ends_at, ${PROFILE} FROM auction_wins w JOIN auctions a ON a.id=w.auction_id JOIN users u ON u.id=w.user_id
     WHERE a.status='closed' ORDER BY a.id DESC, w.rank ASC LIMIT 18`)).rows
    .map(r => ({ auction_id: r.auction_id, rank: r.rank, amount_micro: Number(r.amount), closed_at: r.ends_at, company: shapeCo(r) }));
  const credits = (await c.query(`SELECT credits_micro::text AS c FROM users WHERE id=$1`, [uid])).rows[0]?.c || '0';
  return {
    open: {
      id: a.id, ends_at: a.ends_at, slots, min_bid_micro: config.auctionMinBidMicro, min_raise_micro: config.auctionMinRaiseMicro,
      bids: list, total_bidders: bids.length, cut_micro: cut,
      next_min_micro: bids.length >= slots ? cut + config.auctionMinRaiseMicro : config.auctionMinBidMicro,
      me: myIdx >= 0 ? { bid_micro: Number(bids[myIdx].amount), rank: myIdx + 1, winning: myIdx < slots } : null,
    },
    spots, recent, credits_micro: Number(credits),
  };
}

auctionRouter.get('/auction', asyncH(async (req, res) => {
  res.json(await tx(c => auctionSnapshot(c, req.uid)));
}));

const limitBid = rateLimit({ windowMs: 60e3, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little.' } });
auctionRouter.post('/auction/bid', limitBid, asyncH(async (req, res) => {
  const amountUsd = Number(req.body?.amount_usd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 1_000_000) throw bad('Enter an amount in dollars');
  const amount = Number(toMicro(amountUsd));
  const snap = await tx(async c => {
    const u = (await c.query(`SELECT id, credits_micro, status FROM users WHERE id=$1 FOR UPDATE`, [req.uid])).rows[0];
    if (!u || u.status !== 'active') throw bad('This account cannot bid right now');
    const a = await ensureOpenAuction(c);
    await c.query(`SELECT 1 FROM auctions WHERE id=$1 FOR UPDATE`, [a.id]);
    if (new Date(a.ends_at).getTime() <= Date.now()) throw bad('This auction has just ended. A new one starts in a moment.');
    const bids = await bidsOf(c, a.id);
    const mine = bids.find(b => b.user_id === u.id);
    const old = mine ? Number(mine.amount) : 0;
    if (amount < config.auctionMinBidMicro) throw bad(`Bids start at $${(config.auctionMinBidMicro / 1e6).toFixed(2)}`);
    if (mine && amount < old + config.auctionMinRaiseMicro) throw bad(`Raise your bid by at least $${(config.auctionMinRaiseMicro / 1e6).toFixed(2)}`);
    if (!mine && bids.length >= a.slots) {
      const cut = Number(bids[a.slots - 1].amount);
      if (amount < cut + config.auctionMinRaiseMicro) throw bad(`To enter the top ${a.slots} you need at least $${((cut + config.auctionMinRaiseMicro) / 1e6).toFixed(2)}`);
    }
    const delta = amount - old;
    if (Number(u.credits_micro) < delta) throw bad(`You need $${(delta / 1e6).toFixed(2)} in credits. Add credits first.`);
    await c.query(`UPDATE users SET credits_micro = credits_micro - $2 WHERE id=$1`, [u.id, delta]);
    await c.query(`INSERT INTO credit_ledger (user_id, micro, kind, ref) VALUES ($1,$2,'auction_hold',$3)`, [u.id, -delta, `auction:${a.id}`]);
    await c.query(`INSERT INTO auction_bids (auction_id, user_id, amount_micro) VALUES ($1,$2,$3)
                   ON CONFLICT (auction_id, user_id) DO UPDATE SET amount_micro=$3, updated_at=now()`, [a.id, u.id, amount]);
    // anti-sniping: a bid in the last minutes pushes the end time out a little
    await c.query(`UPDATE auctions SET ends_at = GREATEST(ends_at, now() + ($2 || ' minutes')::interval) WHERE id=$1`, [a.id, String(config.auctionAntiSnipeMinutes)]);
    return auctionSnapshot(c, u.id);
  });
  for (const id of connectedUserIds()) sendTo(id, 'auction', { top: snap.open.bids.slice(0, 5), total: snap.open.total_bidders, ends_at: snap.open.ends_at });
  res.json({ ok: true, ...snap });
}));

/** Close every auction whose time is up: charge winners, refund the rest, feed the reward pool, open the next one. */
export async function closeDueAuctions({ force = false } = {}) {
  const due = (await q(`SELECT id FROM auctions WHERE status='open' AND ($1 OR ends_at <= now())`, [force])).rows;
  const results = [];
  for (const { id } of due) {
    const r = await tx(async c => {
      const a = (await c.query(`SELECT * FROM auctions WHERE id=$1 AND status='open' FOR UPDATE`, [id])).rows[0];
      if (!a) return null;
      const bids = await bidsOf(c, a.id);
      let revenue = 0;
      for (let i = 0; i < bids.length; i++) {
        const b = bids[i], amt = Number(b.amount);
        if (i < a.slots) {
          revenue += amt;
          await c.query(`INSERT INTO auction_wins (auction_id, rank, user_id, amount_micro) VALUES ($1,$2,$3,$4)`, [a.id, i + 1, b.user_id, amt]);
          await c.query(`INSERT INTO credit_ledger (user_id, micro, kind, ref) VALUES ($1,0,'auction_paid',$2)`, [b.user_id, `auction:${a.id}:paid:${amt}`]);
          await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'auction',$2)`, [b.user_id, `You won spot #${i + 1} in the Top Spot auction. Your company is featured until the next auction closes.`]);
        } else {
          await c.query(`UPDATE users SET credits_micro = credits_micro + $2 WHERE id=$1`, [b.user_id, amt]);
          await c.query(`INSERT INTO credit_ledger (user_id, micro, kind, ref) VALUES ($1,$2,'auction_refund',$3)`, [b.user_id, amt, `auction:${a.id}`]);
          await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'auction',$2)`, [b.user_id, `The Top Spot auction ended and you did not win. Your $${(amt / 1e6).toFixed(2)} was returned to your credits.`]);
        }
      }
      await c.query(`UPDATE auctions SET status='closed', settled_at=now(), ends_at = LEAST(ends_at, now()) WHERE id=$1`, [a.id]);
      const toPool = Math.floor(revenue * config.auctionPoolShare);
      if (toPool > 0) await c.query(`INSERT INTO pool_funds (day, source, micro, note) VALUES ($1,'auction',$2,$3)`, [await rewardDay(c), toPool, `auction #${a.id} revenue share`]);
      await ensureOpenAuction(c);
      return { id: a.id, winners: Math.min(bids.length, a.slots), revenue_micro: revenue, to_pool_micro: toPool };
    });
    if (r) results.push(r);
  }
  return results;
}
