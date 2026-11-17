import { q } from './db.js';
import { STOCKS, STOCK_BY_ID, STOCK_KAPPA, STOCK_BAND, STOCK_STEP_SECONDS } from './gamedata.js';

const STEPS_PER_MIN = 60 / STOCK_STEP_SECONDS;

// In-memory snapshot of the shared market. One random walk shared by every player.
const prices = new Map();      // id -> price
const history = new Map();     // id -> [{t, p}] last ~60 minutes
let updatedAt = Date.now();

function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export async function loadMarket() {
  for (const s of STOCKS) await q(`INSERT INTO stocks (id, price) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [s.id, s.base]);
  const r = await q(`SELECT id, price FROM stocks`);
  for (const row of r.rows) prices.set(row.id, row.price);
  const h = await q(`SELECT stock_id, extract(epoch from ts)*1000 AS t, price FROM stock_ticks WHERE ts > now() - interval '70 minutes' ORDER BY ts ASC`);
  for (const row of h.rows) { if (!history.has(row.stock_id)) history.set(row.stock_id, []); history.get(row.stock_id).push({ t: Number(row.t), p: row.price }); }
  for (const s of STOCKS) if (!history.get(s.id)?.length) history.set(s.id, [{ t: Date.now(), p: prices.get(s.id) ?? s.base }]);
}

/** Move every price one small step (called every few seconds). In-memory only; persistMarket() stores a snapshot each minute. */
export function stepMarket() {
  const now = Date.now();
  for (const s of STOCKS) {
    const p = prices.get(s.id) ?? s.base;
    // mean-reverting log random walk, clamped to a band so trading profit is bounded
    const logRet = -(STOCK_KAPPA / STEPS_PER_MIN) * Math.log(p / s.base) + (s.vol / Math.sqrt(STEPS_PER_MIN)) * randn();
    let np = p * Math.exp(logRet);
    np = Math.min(s.base * STOCK_BAND[1], Math.max(s.base * STOCK_BAND[0], np));
    prices.set(s.id, np);
    const h = history.get(s.id) || []; h.push({ t: now, p: np });
    while (h.length > 150) h.shift();
    history.set(s.id, h);
  }
  updatedAt = now;
}

export async function persistMarket() {
  const ids = STOCKS.map(s => s.id), ps = STOCKS.map(s => prices.get(s.id) ?? s.base);
  await q(`UPDATE stocks st SET price = v.price FROM (SELECT unnest($1::text[]) AS id, unnest($2::float8[]) AS price) v WHERE st.id = v.id`, [ids, ps]);
  await q(`INSERT INTO stock_ticks (stock_id, price) SELECT unnest($1::text[]), unnest($2::float8[])`, [ids, ps]);
}

export const priceOf = (id) => prices.get(id) ?? STOCK_BY_ID[id]?.base ?? 0;

export function getMarket() {
  return {
    t: updatedAt,
    stocks: STOCKS.map(s => {
      const h = history.get(s.id) || [];
      const p = prices.get(s.id) ?? s.base;
      const first = h[0]?.p ?? p;
      return { id: s.id, price: p, chg: first ? (p / first - 1) : 0, history: h.map(x => x.p) };
    }),
  };
}

export async function pruneTicks() { await q(`DELETE FROM stock_ticks WHERE ts < now() - interval '36 hours'`); }
