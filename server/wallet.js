import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, tx } from './db.js';
import { config } from './config.js';
import { asyncH, bad, clean, toMicro } from './util.js';
import { requireAuth } from './auth.js';

// Credits wallet: players add money to their Nvisco credits (used for auction bids and promotion). Credits are NOT withdrawable.
// Deposits are verified by hand today (the player pays your Easypaisa / SadaPay / bank account and submits the transaction ID).
// getPaymentConfig() is the single place to later plug in an automatic gateway.
export const walletRouter = Router();
walletRouter.use(requireAuth);

export async function getPaymentConfig() {
  const r = await q(`SELECT value FROM settings WHERE key='payments'`);
  let v = {}; try { v = r.rows[0] ? JSON.parse(r.rows[0].value) : {}; } catch { v = {}; }
  const methods = Array.isArray(v.methods) ? v.methods : [];
  return {
    methods: methods.map(m => ({ id: String(m.id), label: String(m.label || m.id), account_title: String(m.account_title || ''), account_number: String(m.account_number || ''), note: String(m.note || ''), enabled: m.enabled !== false })),
    pkr_per_usd: Number(v.pkr_per_usd) > 0 ? Number(v.pkr_per_usd) : config.pkrPerUsd,
    instructions: String(v.instructions || ''),
    min_usd: Number(v.min_usd) > 0 ? Number(v.min_usd) : 1,
    max_usd: Number(v.max_usd) > 0 ? Number(v.max_usd) : 500,
  };
}

walletRouter.get('/wallet', asyncH(async (req, res) => {
  const [pay, me, dep, led] = await Promise.all([
    getPaymentConfig(),
    q(`SELECT credits_micro::text AS c FROM users WHERE id=$1`, [req.uid]),
    q(`SELECT id, method, amount_usd_micro::text AS usd, amount_local::float8 AS local, currency, txn_id, status, admin_note, created_at FROM deposits WHERE user_id=$1 ORDER BY id DESC LIMIT 15`, [req.uid]),
    q(`SELECT kind, micro::text AS micro, ref, created_at FROM credit_ledger WHERE user_id=$1 AND (micro <> 0) ORDER BY id DESC LIMIT 20`, [req.uid]),
  ]);
  res.json({
    credits_micro: Number(me.rows[0]?.c || 0),
    payments: { ...pay, methods: pay.methods.filter(m => m.enabled) },
    deposits: dep.rows.map(d => ({ ...d, usd_micro: Number(d.usd) })),
    ledger: led.rows.map(l => ({ ...l, micro: Number(l.micro) })),
  });
}));

const limitDeposit = rateLimit({ windowMs: 3600e3, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many deposit requests, try again later.' } });
walletRouter.post('/wallet/deposit', limitDeposit, asyncH(async (req, res) => {
  const pay = await getPaymentConfig();
  const method = clean(req.body?.method, 30);
  const m = pay.methods.find(x => x.id === method && x.enabled);
  if (!m) throw bad('Choose one of the available payment methods');
  const usd = Number(req.body?.amount_usd);
  if (!Number.isFinite(usd) || usd < pay.min_usd || usd > pay.max_usd) throw bad(`Enter an amount between $${pay.min_usd} and $${pay.max_usd}`);
  const txn = clean(req.body?.txn_id, 40).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9\-_.]{6,40}$/.test(txn)) throw bad('Enter the transaction ID from your payment receipt (6 to 40 letters and numbers)');
  const sender = clean(req.body?.sender, 60);
  try {
    const r = await q(`INSERT INTO deposits (user_id, method, amount_usd_micro, amount_local, currency, txn_id, sender) VALUES ($1,$2,$3,$4,'PKR',$5,$6) RETURNING id`,
      [req.uid, m.id, toMicro(usd).toString(), Math.round(usd * pay.pkr_per_usd), txn, sender]);
    res.json({ ok: true, id: r.rows[0].id, pkr: Math.round(usd * pay.pkr_per_usd) });
  } catch (e) { if (e.code === '23505') throw bad('That transaction ID was already submitted'); throw e; }
}));
