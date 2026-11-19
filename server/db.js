import { ASSETS } from './gamedata.js';
import pg from 'pg';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// bigint columns come back as strings by default; keep them as BigInt-safe strings and convert where needed.
pg.types.setTypeParser(1082, v => v); // DATE as 'YYYY-MM-DD'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
pool.on('error', e => console.error('pg pool error', e.message));

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    c.release();
  }
}

export async function migrate() {
  const sql = fs.readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await pool.query(sql);
  // Economy v2: business upgrade levels now stop at 5 and income per level changed, so cap old levels and have every cached income recomputed.
  const v = (await pool.query(`SELECT val FROM meta WHERE key='econ'`)).rows[0]?.val;
  if (!['2', '3', '4'].includes(v)) {
    await pool.query(`UPDATE user_assets SET level = 5 WHERE level > 5`);
    await pool.query(`UPDATE users SET income_per_hour = 0 WHERE NOT is_bot AND id IN (SELECT user_id FROM user_assets)`);
  }
  if (v !== '4') {
    // Economy v3/v4: ten assets per region (assets that no longer exist are removed) and a per-business income column; cached incomes are recomputed on next open.
    await pool.query(`DELETE FROM user_assets WHERE asset_id <> ALL($1::text[])`, [ASSETS.map(a => a.id)]);
    await pool.query(`UPDATE users SET income_per_hour = 0 WHERE NOT is_bot AND id IN (SELECT user_id FROM user_assets)`);
    await pool.query(`INSERT INTO meta (key, val) VALUES ('econ','4') ON CONFLICT (key) DO UPDATE SET val='4'`);
  }
}

/** Current reward day (YYYY-MM-DD) in the configured timezone. */
export async function rewardDay(c = pool) {
  const r = await c.query(`SELECT (now() AT TIME ZONE $1)::date::text AS d`, [config.rewardTz]);
  return r.rows[0].d;
}
