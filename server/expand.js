import { Router } from 'express';
import { q } from './db.js';
import { asyncH, bad, HttpError } from './util.js';
import { requireAuth } from './auth.js';
import * as G from './gamedata.js';
import * as E from './economy.js';
import { act, loadAndAccrue, rederive, save, loadOwned } from './game.js';
import { tx } from './db.js';
import { sendTo } from './sse.js';

export const expandRouter = Router();
expandRouter.use(requireAuth);

const regionOpen = (code, owned) => {
  const reg = G.COUNTRY_BY_CODE[code]; if (!reg) return false;
  const idx = G.REGIONS.findIndex(r => r.id === reg.region);
  if (idx === 0) return true;
  const prev = G.REGIONS[idx - 1].id;
  let n = 0; for (const id of owned.keys()) if (id.startsWith(prev + '-')) n++;
  return n >= G.REGION_UNLOCK_OWNED;
};

// Buy a branch (level 1) or upgrade it (levels 2-5)
expandRouter.post('/expand/branch', act(async (c, u, req) => {
  const code = String(req.body?.country || '').toUpperCase();
  if (!G.COUNTRY_BY_CODE[code]) throw bad('Choose a country from the list');
  const { owned, branches } = await loadOwned(c, u.id);
  if (!regionOpen(code, owned)) throw bad('Unlock that region first');
  const level = branches.get(code) || 0;
  if (level >= G.BRANCH_MAX_LEVEL) throw bad('This branch is already at the top level');
  const cost = E.branchCost(code, level + 1);
  if (u.cash < cost) throw bad('Not enough cash');
  u.cash -= cost;
  await c.query(`INSERT INTO user_branches (user_id, country, level) VALUES ($1,$2,1) ON CONFLICT (user_id, country) DO UPDATE SET level = user_branches.level + 1`, [u.id, code]);
  await rederive(c, u);
  return { country: code, level: level + 1 };
}));

const profileOf = `u.id, u.company_name, u.logo_url, u.banner_url, u.country, u.industry, u.tagline, u.is_bot, u.lifetime_earned AS score, u.open_for_work`;

expandRouter.get('/expand', asyncH(async (req, res) => {
  const [br, pa] = await Promise.all([
    q(`SELECT country, level FROM user_branches WHERE user_id=$1`, [req.uid]),
    q(`SELECT p.id, p.status, p.country, p.requester, p.partner, p.created_at,
              CASE WHEN p.requester=$1 THEN p.partner ELSE p.requester END AS other_id
       FROM partnerships p WHERE (p.requester=$1 OR p.partner=$1) AND p.status IN ('pending','active') ORDER BY p.id DESC`, [req.uid]),
  ]);
  const ids = [...new Set(pa.rows.map(r => r.other_id))];
  const profs = ids.length ? (await q(`SELECT ${profileOf} FROM users u WHERE u.id = ANY($1)`, [ids])).rows : [];
  const byId = Object.fromEntries(profs.map(p => [p.id, { ...p, country: p.country.trim() }]));
  const rows = pa.rows.map(r => ({ id: r.id, status: r.status, country: r.country.trim(), incoming: r.partner === req.uid && r.status === 'pending', since: r.created_at, company: byId[r.other_id] }));
  res.json({ branches: Object.fromEntries(br.rows.map(b => [b.country.trim(), b.level])), partnerships: rows });
}));

// Companies you can partner with in a country (they are based there)
expandRouter.get('/expand/candidates', asyncH(async (req, res) => {
  const code = String(req.query.country || '').toUpperCase();
  if (!G.COUNTRY_BY_CODE[code]) throw bad('Choose a country');
  const r = await q(
    `SELECT ${profileOf}, (SELECT status FROM partnerships p WHERE p.status IN ('pending','active') AND ((p.requester=$2 AND p.partner=u.id) OR (p.partner=$2 AND p.requester=u.id)) LIMIT 1) AS link
     FROM users u WHERE u.country=$1 AND u.id <> $2 AND u.status='active' ORDER BY u.lifetime_earned DESC LIMIT 20`, [code, req.uid]);
  res.json({ rows: r.rows.map(x => ({ ...x, country: x.country.trim(), demo: x.is_bot })) });
}));

async function relink(c, ids) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) { const u = await loadAndAccrue(c, id); await rederive(c, u); await save(c, u); }
}

expandRouter.post('/expand/partner', asyncH(async (req, res) => {
  const code = String(req.body?.country || '').toUpperCase();
  const target = parseInt(req.body?.company_id);
  if (req.body?.scope !== 'ranked' && !G.COUNTRY_BY_CODE[code]) throw bad('Choose a country');
  if (!Number.isFinite(target) || target === req.uid) throw bad('Choose another company');
  const out = await tx(async c => {
    const ranked = req.body?.scope === 'ranked';
    if (!ranked) { const br = await c.query(`SELECT level FROM user_branches WHERE user_id=$1 AND country=$2`, [req.uid, code]); if (!br.rows[0]) throw bad('Open a branch in that country first'); }
    const t = (await c.query(`SELECT id, country, is_bot, status, company_name FROM users WHERE id=$1`, [target])).rows[0];
    if (!t || t.status !== 'active') throw bad('That company is not available');
    if (!ranked && t.country.trim() !== code) throw bad('That company is based in a different country');
    const active = (await c.query(`SELECT COUNT(*)::int n FROM partnerships WHERE status='active' AND (requester=$1 OR partner=$1)`, [req.uid])).rows[0].n;
    if (active >= G.PARTNER_MAX) throw bad(`You can have at most ${G.PARTNER_MAX} partners`);
    try {
      const status = t.is_bot ? 'active' : 'pending';
      const ins = await c.query(`INSERT INTO partnerships (requester, partner, country, status, decided_at) VALUES ($1,$2,$3,$4, CASE WHEN $4='active' THEN now() END) RETURNING id`, [req.uid, target, ranked ? t.country.trim() : code, status]);
      if (status === 'active') await relink(c, [req.uid]);
      else await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'partner',$2)`, [target, `A company wants to partner with you. Open Expand to answer.`]);
      return { id: ins.rows[0].id, status };
    } catch (e) { if (e.code === '23505') throw bad('You already have a partnership or a pending request with this company'); throw e; }
  });
  if (out.status === 'pending') sendTo(target, 'notice', { body: 'You have a new partnership request' });
  res.json({ ok: true, ...out });
}));

expandRouter.post('/expand/partner/:id/respond', asyncH(async (req, res) => {
  const accept = !!req.body?.accept; const id = parseInt(req.params.id);
  const other = await tx(async c => {
    const p = (await c.query(`SELECT * FROM partnerships WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!p || p.partner !== req.uid || p.status !== 'pending') throw bad('That request is no longer open');
    if (accept) {
      const n = (await c.query(`SELECT COUNT(*)::int n FROM partnerships WHERE status='active' AND (requester=$1 OR partner=$1)`, [req.uid])).rows[0].n;
      if (n >= G.PARTNER_MAX) throw bad(`You already have ${G.PARTNER_MAX} partners`);
    }
    await c.query(`UPDATE partnerships SET status=$2, decided_at=now() WHERE id=$1`, [id, accept ? 'active' : 'declined']);
    if (accept) {
      await relink(c, [p.requester, p.partner]);
      await c.query(`INSERT INTO notifications (user_id, kind, body) VALUES ($1,'partner',$2)`, [p.requester, 'Your partnership request was accepted. Your income just went up.']);
    }
    return p.requester;
  });
  if (accept) sendTo(other, 'notice', { body: 'Partnership accepted' });
  res.json({ ok: true });
}));

expandRouter.post('/expand/partner/:id/end', asyncH(async (req, res) => {
  const id = parseInt(req.params.id);
  await tx(async c => {
    const p = (await c.query(`SELECT * FROM partnerships WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!p || (p.requester !== req.uid && p.partner !== req.uid) || !['pending', 'active'].includes(p.status)) throw bad('Nothing to end');
    await c.query(`UPDATE partnerships SET status='ended', decided_at=now() WHERE id=$1`, [id]);
    if (p.status === 'active') await relink(c, [p.requester, p.partner]);
  });
  res.json({ ok: true });
}));

// ---- investor / partner offers made by the app in every country: each one adds its own income stream
expandRouter.get('/expand/offers', asyncH(async (req, res) => {
  const code = String(req.query.country || '').toUpperCase();
  if (!G.COUNTRY_BY_CODE[code]) throw bad('Choose a country');
  const [br, mine] = await Promise.all([
    q(`SELECT level FROM user_branches WHERE user_id=$1 AND country=$2`, [req.uid, code]),
    q(`SELECT offer_id FROM user_offers WHERE user_id=$1`, [req.uid]),
  ]);
  const level = br.rows[0]?.level || 0, taken = new Set(mine.rows.map(r => r.offer_id));
  res.json({ level, active: mine.rows.length, max: G.OFFER_MAX, rows: G.offersFor(code).map(o => ({ ...o, status: taken.has(o.id) ? 'active' : level >= o.minBranch ? 'open' : 'locked' })) });
}));

expandRouter.post('/expand/offer', act(async (c, u, req) => {
  const o = G.offerById(String(req.body?.offer_id || '')); if (!o) throw bad('Unknown offer');
  const { branches, offers } = await loadOwned(c, u.id);
  if ((branches.get(o.country) || 0) < o.minBranch) throw bad(`Upgrade your ${o.country} branch to level ${o.minBranch} to unlock this offer`);
  if (offers.some(x => x.id === o.id)) throw bad('You already accepted this offer');
  if (offers.length >= G.OFFER_MAX) throw bad(`You can hold at most ${G.OFFER_MAX} offers at once`);
  await c.query(`INSERT INTO user_offers (user_id, offer_id) VALUES ($1,$2)`, [u.id, o.id]);
  await rederive(c, u);
  return { offer: o.id };
}));

expandRouter.post('/expand/offer/end', act(async (c, u, req) => {
  const r = await c.query(`DELETE FROM user_offers WHERE user_id=$1 AND offer_id=$2`, [u.id, String(req.body?.offer_id || '')]);
  if (!r.rowCount) throw bad('Nothing to end');
  await rederive(c, u);
}));

// ---- ranked players anywhere (worldwide or in your country) you can team up with
expandRouter.get('/expand/ranked', asyncH(async (req, res) => {
  const me = (await q(`SELECT country FROM users WHERE id=$1`, [req.uid])).rows[0];
  const own = req.query.scope === 'country';
  const r = await q(
    `SELECT ${profileOf}, (SELECT status FROM partnerships p WHERE p.status IN ('pending','active') AND ((p.requester=$1 AND p.partner=u.id) OR (p.partner=$1 AND p.requester=u.id)) LIMIT 1) AS link,
            (SELECT COUNT(*)::int + 1 FROM users x WHERE x.status <> 'banned' AND x.lifetime_earned > u.lifetime_earned) AS rank
     FROM users u WHERE u.id <> $1 AND u.status='active' ${own ? 'AND u.country = $2' : ''} ORDER BY u.lifetime_earned DESC, u.id LIMIT 25`, own ? [req.uid, me.country.trim()] : [req.uid]);
  res.json({ rows: r.rows.map(x => ({ ...x, country: x.country.trim(), demo: false })) });
}));
