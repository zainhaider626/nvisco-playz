import { q, tx } from './db.js';
import { config } from './config.js';
import { LEAGUES, LEAGUE_PROMOTE, LEAGUE_DEMOTE, LEAGUE_REWARD_HOURS } from './gamedata.js';
import { fmt } from './economy.js';

/** Put a player in a league: fill the newest cohort that has room, otherwise open a new one. */
export async function assignLeague(c, uid, league) {
  const r = await c.query(
    `SELECT cohort, COUNT(*)::int AS n FROM users WHERE league=$1 AND id<>$2 GROUP BY cohort HAVING COUNT(*) < $3 ORDER BY cohort DESC LIMIT 1`,
    [league, uid, config.cohortSize]);
  let cohort;
  if (r.rows[0]) cohort = r.rows[0].cohort;
  else cohort = ((await c.query(`SELECT COALESCE(MAX(cohort),0)+1 AS n FROM users WHERE league=$1`, [league])).rows[0].n);
  await c.query(`UPDATE users SET league=$2, cohort=$3 WHERE id=$1`, [uid, league, cohort]);
}

export async function currentSeason(c = { query: q }) {
  let r = await c.query(`SELECT id, starts_at, ends_at FROM seasons ORDER BY id DESC LIMIT 1`);
  if (!r.rows[0]) {
    r = await c.query(`INSERT INTO seasons (starts_at, ends_at) VALUES (now(), now() + ($1 || ' days')::interval) RETURNING id, starts_at, ends_at`, [String(config.seasonDays)]);
  }
  return r.rows[0];
}

/**
 * End the season when due: pay top-5 prizes, promote the top 5 of every cohort, demote the bottom 5,
 * reshuffle everyone into fresh cohorts and reset the weekly score.
 */
export async function rolloverIfDue() {
  const s = await currentSeason();
  if (new Date(s.ends_at) > new Date()) return null;
  return tx(async c => {
    await c.query(`SELECT pg_advisory_xact_lock(7002)`);
    const cur = (await c.query(`SELECT id, ends_at FROM seasons ORDER BY id DESC LIMIT 1 FOR UPDATE`)).rows[0];
    if (new Date(cur.ends_at) > new Date()) return null;
    const players = (await c.query(
      `SELECT id, league, cohort, season_earned, income_per_hour, is_bot, status FROM users WHERE status <> 'banned'
       ORDER BY league, cohort, season_earned DESC, id`)).rows;
    const groups = new Map();
    for (const p of players) { const k = `${p.league}:${p.cohort}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const newLeague = new Map(); const prizes = []; const notes = [];
    for (const list of groups.values()) {
      list.forEach((p, i) => {
        let nl = p.league;
        const active = Number(p.season_earned) > 0;
        if (i < LEAGUE_PROMOTE && p.league < LEAGUES.length - 1 && active) nl = p.league + 1;
        else if (i >= list.length - LEAGUE_DEMOTE && list.length >= 15 && p.league > 0) nl = p.league - 1;
        newLeague.set(p.id, nl);
        if (i < LEAGUE_REWARD_HOURS.length && active) {
          const prize = Number(p.income_per_hour) * LEAGUE_REWARD_HOURS[i];
          if (prize > 0) prizes.push([p.id, prize]);
          if (!p.is_bot) notes.push([p.id, `Season over: you finished #${i + 1} in ${LEAGUES[p.league].name} League` + (nl > p.league ? ' and were promoted!' : '.') + (prize > 0 ? ` Prize: $${fmt(prize)}.` : '')]);
        } else if (!p.is_bot && nl !== p.league) {
          notes.push([p.id, `Season over: you moved ${nl > p.league ? 'up to' : 'down to'} ${LEAGUES[nl].name} League.`]);
        }
      });
    }
    // prizes
    for (const [id, prize] of prizes) await c.query(
      `UPDATE users SET cash=cash+$2, lifetime_earned=lifetime_earned+$2, run_earned=run_earned+$2, net_worth=net_worth+$2 WHERE id=$1`, [id, prize]);
    // reshuffle: group by new league, random order, cohorts of cohortSize
    const byLeague = new Map();
    for (const p of players) { const nl = newLeague.get(p.id); if (!byLeague.has(nl)) byLeague.set(nl, []); byLeague.get(nl).push(p.id); }
    const ids = [], leagues = [], cohorts = [];
    for (const [lg, list] of byLeague) {
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      const nCohorts = Math.max(1, Math.ceil(list.length / config.cohortSize));
      list.forEach((id, i) => { ids.push(id); leagues.push(lg); cohorts.push((i % nCohorts) + 1); });
    }
    if (ids.length) await c.query(
      `UPDATE users u SET league=v.l, cohort=v.c, season_earned=0 FROM (SELECT unnest($1::int[]) id, unnest($2::int[]) l, unnest($3::int[]) c) v WHERE u.id=v.id`, [ids, leagues, cohorts]);
    for (const [id, body] of notes) await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'league',$2)`, [id, body]);
    await c.query(`INSERT INTO seasons (starts_at, ends_at) VALUES (now(), now() + ($1 || ' days')::interval)`, [String(config.seasonDays)]);
    return { players: ids.length, prizes: prizes.length };
  });
}
