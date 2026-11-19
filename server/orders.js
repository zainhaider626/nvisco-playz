import { q, tx } from './db.js';
import * as G from './gamedata.js';
import * as E from './economy.js';
import { priceOf } from './market.js';
import { loadAndAccrue, save } from './game.js';
import { sendTo } from './sse.js';

let busy = false;
/** Sell a whole position when its stop-loss or take-profit price has been touched. Runs after every market step. */
export async function runOrders() {
  if (busy) return; busy = true;
  try {
    const rows = (await q(`SELECT user_id, stock_id, stop_loss, take_profit FROM holdings WHERE shares > 0 AND (stop_loss IS NOT NULL OR take_profit IS NOT NULL)`)).rows;
    for (const r of rows) {
      const price = priceOf(r.stock_id);
      const hitSl = r.stop_loss != null && price <= r.stop_loss, hitTp = r.take_profit != null && price >= r.take_profit;
      if (!hitSl && !hitTp) continue;
      try {
        const msg = await tx(async c => {
          const u = await loadAndAccrue(c, r.user_id);
          const h = (await c.query(`SELECT shares::text AS shares, cost, stop_loss, take_profit FROM holdings WHERE user_id=$1 AND stock_id=$2 FOR UPDATE`, [r.user_id, r.stock_id])).rows[0];
          if (!h || Number(h.shares) < 1) return null;
          const still = (h.stop_loss != null && price <= h.stop_loss) || (h.take_profit != null && price >= h.take_profit);
          if (!still) return null;
          const shares = Number(h.shares), proceeds = shares * price * (1 - G.STOCK_FEE), basis = h.cost, pnl = proceeds - basis;
          u.cash += proceeds; u.trade_pnl += pnl;
          if (u.trade_pnl > u.trade_pnl_peak) { const e = u.trade_pnl - u.trade_pnl_peak; u.trade_pnl_peak = u.trade_pnl; u.lifetime_earned += e; u.run_earned += e; u.season_earned += e; }
          await c.query(`UPDATE holdings SET shares=0, cost=0, stop_loss=NULL, take_profit=NULL WHERE user_id=$1 AND stock_id=$2`, [r.user_id, r.stock_id]);
          const pv = await c.query(`SELECT stock_id, shares::text AS shares FROM holdings WHERE user_id=$1 AND shares > 0`, [r.user_id]);
          u.portfolio_value = pv.rows.reduce((t, x) => t + Number(x.shares) * priceOf(x.stock_id), 0);
          await save(c, u);
          const body = `${hitSl ? 'Stop loss' : 'Take profit'} sold your ${r.stock_id} shares at $${E.fmt(price)} (${pnl >= 0 ? '+' : '-'}$${E.fmt(Math.abs(pnl))}).`;
          await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'trade',$2)`, [r.user_id, body]);
          return body;
        });
        if (msg) sendTo(r.user_id, 'notice', { body: msg });
      } catch (e) { console.error('[orders] failed', e.message); }
    }
  } finally { busy = false; }
}
