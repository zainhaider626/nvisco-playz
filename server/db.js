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
}

/** Current reward day (YYYY-MM-DD) in the configured timezone. */
export async function rewardDay(c = pool) {
  const r = await c.query(`SELECT (now() AT TIME ZONE $1)::date::text AS d`, [config.rewardTz]);
  return r.rows[0].d;
}
