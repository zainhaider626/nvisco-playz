import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, rewardDay } from './db.js';
import { asyncH, bad, clean, esc, slug, HttpError } from './util.js';
import { requireAuth } from './auth.js';
import * as G from './gamedata.js';
import * as E from './economy.js';
import { currentSeason } from './leagues.js';
import { config } from './config.js';

export const ranksRouter = Router();

// A player is "featured" while one of their sponsor campaigns is running.
const TODAY = `(now() AT TIME ZONE '${String(config.rewardTz).replace(/[^A-Za-z0-9_\/+-]/g, '')}')::date`;
const FEATURED = `(EXISTS (SELECT 1 FROM sponsors s WHERE s.user_id = u.id AND s.status='active' AND s.starts_on <= ${TODAY} AND s.ends_on >= ${TODAY})
  OR EXISTS (SELECT 1 FROM auction_wins w WHERE w.user_id = u.id AND w.auction_id = (SELECT MAX(id) FROM auctions WHERE status='closed')))`;
const COLS = `u.id, u.company_name, u.country, u.logo_url, u.banner_url, u.industry, u.tagline, u.is_bot, u.lifetime_earned AS score, u.season_earned, u.income_per_hour, u.league, ${FEATURED} AS featured`;

const shape = (r, rank, meId) => ({
  rank, id: r.id, company_name: r.company_name, country: r.country.trim(), logo_url: r.logo_url, industry: r.industry,
  score: r.score, season_earned: r.season_earned, demo: r.is_bot, featured: r.featured, me: r.id === meId,
  tier: E.tierFor(r.score).name, tier_id: E.tierFor(r.score).id,
});

async function rankOf(score, extraWhere = '', params = []) {
  const r = await q(`SELECT COUNT(*)::int + 1 AS r FROM users u WHERE u.status <> 'banned' AND u.lifetime_earned > $1 ${extraWhere}`, [score, ...params]);
  return r.rows[0].r;
}

async function board(req, res, { where = '', whereRank = '', params = [], title }) {
  const me = (await q(`SELECT u.id, u.country, u.lifetime_earned AS score, u.company_name, u.logo_url, u.banner_url, u.industry, u.is_bot, u.season_earned, u.league, ${FEATURED} AS featured FROM users u WHERE u.id=$1`, [req.uid])).rows[0];
  const rows = (await q(`SELECT ${COLS} FROM users u WHERE u.status <> 'banned' ${where} ORDER BY u.lifetime_earned DESC, u.id LIMIT 50`, params)).rows;
  const list = rows.map((r, i) => shape(r, i + 1, req.uid));
  let mine = null;
  if (!list.some(r => r.me)) mine = shape(me, await rankOf(me.score, whereRank || where, params), req.uid);
  const total = (await q(`SELECT COUNT(*)::int AS n FROM users u WHERE u.status <> 'banned' ${where}`, params)).rows[0].n;
  res.json({ title, rows: list, me: mine, total });
}

ranksRouter.use(requireAuth);

ranksRouter.get('/leaderboard/world', asyncH((req, res) => board(req, res, { title: 'World' })));
ranksRouter.get('/leaderboard/country', asyncH(async (req, res) => {
  let code = clean(String(req.query.code || ''), 2).toUpperCase();
  if (!code) code = (await q(`SELECT country FROM users WHERE id=$1`, [req.uid])).rows[0].country.trim();
  if (!/^[A-Z]{2}$/.test(code)) throw bad('Bad country code');
  return board(req, res, { where: 'AND u.country = $1', whereRank: 'AND u.country = $2', params: [code], title: code });
}));

ranksRouter.get('/leaderboard/league', asyncH(async (req, res) => {
  const me = (await q(`SELECT id, league, cohort FROM users WHERE id=$1`, [req.uid])).rows[0];
  const season = await currentSeason();
  const rows = (await q(`SELECT ${COLS} FROM users u WHERE u.league=$1 AND u.cohort=$2 AND u.status <> 'banned' ORDER BY u.season_earned DESC, u.id`, [me.league, me.cohort])).rows;
  const n = rows.length;
  const list = rows.map((r, i) => ({
    ...shape(r, i + 1, req.uid), score: r.season_earned, total: r.score,
    prize: i < G.LEAGUE_REWARD_HOURS.length ? r.income_per_hour * G.LEAGUE_REWARD_HOURS[i] : 0,
  }));
  res.json({
    league: G.LEAGUES[me.league], ends_at: season.ends_at, rows: list, size: n,
    promote: me.league < G.LEAGUES.length - 1 ? G.LEAGUE_PROMOTE : 0,
    demote: me.league > 0 && n >= 15 ? G.LEAGUE_DEMOTE : 0,
  });
}));

// ---------------------------------------------------------------- directory (find companies, clients and work)
const limitDir = rateLimit({ windowMs: 60e3, limit: 60, standardHeaders: true, legacyHeaders: false });
ranksRouter.get('/directory', limitDir, asyncH(async (req, res) => {
  const text = clean(String(req.query.q || ''), 60);
  const industry = clean(String(req.query.industry || ''), 40);
  const country = clean(String(req.query.country || ''), 2).toUpperCase();
  const open = req.query.open === '1';
  const page = Math.max(0, Math.min(200, parseInt(req.query.page) || 0));
  const w = [`u.status <> 'banned'`, `NOT u.is_bot`]; const p = [];
  if (text) { p.push(`%${text.replace(/[%_\\]/g, m => '\\' + m)}%`); w.push(`(u.company_name ILIKE $${p.length} OR u.tagline ILIKE $${p.length} OR u.description ILIKE $${p.length} OR u.looking_for ILIKE $${p.length})`); }
  if (industry) { p.push(industry); w.push(`u.industry = $${p.length}`); }
  if (/^[A-Z]{2}$/.test(country)) { p.push(country); w.push(`u.country = $${p.length}`); }
  if (open) w.push(`u.open_for_work`);
  const r = await q(
    `SELECT u.id, u.company_name, u.country, u.logo_url, u.banner_url, u.industry, u.tagline, u.open_for_work, u.looking_for, u.lifetime_earned AS score, ${FEATURED} AS featured
     FROM users u WHERE ${w.join(' AND ')} ORDER BY featured DESC, u.lifetime_earned DESC LIMIT 25 OFFSET ${page * 25}`, p);
  res.json({ rows: r.rows.map(x => ({ ...x, country: x.country.trim(), tier: E.tierFor(x.score).name, tier_id: E.tierFor(x.score).id })), page, more: r.rows.length === 25 });
}));

// ---------------------------------------------------------------- company profile
export async function companyData(id) {
  const r = await q(`SELECT u.*, ${FEATURED} AS featured FROM users u WHERE u.id=$1 AND u.status <> 'banned'`, [id]);
  const u = r.rows[0]; if (!u) return null;
  const [world, country, assets] = await Promise.all([
    rankOf(u.lifetime_earned), rankOf(u.lifetime_earned, 'AND u.country = $2', [u.country]),
    q(`SELECT asset_id FROM user_assets WHERE user_id=$1`, [id]),
  ]);
  const counts = {}; for (const a of assets.rows) { const reg = a.asset_id.replace(/-\d+$/, ''); counts[reg] = (counts[reg] || 0) + 1; }
  const items = (await q(`SELECT COUNT(*)::int n FROM user_items WHERE user_id=$1`, [id])).rows[0].n;
  return {
    id: u.id, company_name: u.company_name, tagline: u.tagline, industry: u.industry, country: u.country.trim(), city: u.city,
    website: u.website, description: u.description, logo_url: u.logo_url, banner_url: u.banner_url, contact: u.contact, open_for_work: u.open_for_work, looking_for: u.looking_for,
    score: u.lifetime_earned, tier: E.tierFor(u.lifetime_earned), league: G.LEAGUES[u.league], world_rank: world, country_rank: country,
    prestige_count: u.prestige_count, items, regions: counts, joined: u.created_at, featured: u.featured, demo: u.is_bot, tap_total: Number(u.tap_total),
  };
}
ranksRouter.get('/company/:id', asyncH(async (req, res) => {
  const d = await companyData(parseInt(req.params.id));
  if (!d) throw new HttpError(404, 'Company not found');
  res.json(d);
}));

// ---------------------------------------------------------------- current top spots (auction winners) shown on the home screen
ranksRouter.get('/spots', asyncH(async (_req, res) => {
  const r = await q(`SELECT w.rank, w.amount_micro::text AS amount, u.id, u.company_name, u.logo_url, u.banner_url, u.country, u.industry, u.tagline, u.website
                     FROM auction_wins w JOIN users u ON u.id=w.user_id WHERE w.auction_id = (SELECT MAX(id) FROM auctions WHERE status='closed') ORDER BY w.rank`);
  const open = (await q(`SELECT ends_at FROM auctions WHERE status='open' LIMIT 1`)).rows[0];
  res.json({ rows: r.rows.map(x => ({ rank: x.rank, amount_micro: Number(x.amount), company: { id: x.id, company_name: x.company_name, logo_url: x.logo_url, banner_url: x.banner_url, country: x.country.trim(), industry: x.industry, tagline: x.tagline, website: x.website } })), next_close: open?.ends_at || null });
}));

// ---------------------------------------------------------------- sponsors (featured companies)
ranksRouter.get('/sponsors', asyncH(async (_req, res) => {
  const r = await q(
    `SELECT s.id, s.name, s.tagline, s.url, s.user_id, u.logo_url, u.country FROM sponsors s LEFT JOIN users u ON u.id = s.user_id
     WHERE s.status='active' AND s.starts_on <= $1::date AND s.ends_on >= $1::date ORDER BY s.id DESC LIMIT 8`, [await rewardDay()]);
  res.json({ rows: r.rows });
}));
ranksRouter.post('/sponsors/:id/seen', asyncH(async (req, res) => {
  await q(`UPDATE sponsors SET impressions = impressions + 1 WHERE id=$1`, [parseInt(req.params.id) || 0]);
  res.json({ ok: true });
}));

// public redirect used by sponsor cards so clicks can be counted
export const sponsorClick = asyncH(async (req, res) => {
  const r = await q(`UPDATE sponsors SET clicks = clicks + 1 WHERE id=$1 AND status='active' RETURNING url, user_id`, [parseInt(req.params.id) || 0]);
  const s = r.rows[0];
  if (!s) return res.redirect('/');
  if (s.url) return res.redirect(s.url);
  res.redirect(s.user_id ? `/c/${s.user_id}` : '/');
});

// ---------------------------------------------------------------- public, server-rendered company page (shareable + searchable)
const flagImg = (code) => `<img src="/flags/${esc(String(code).toLowerCase())}.svg" alt="${esc(code)}" width="20" height="15" style="vertical-align:-2px;border-radius:2px">`;
export const companyPage = asyncH(async (req, res) => {
  const id = parseInt(req.params.id);
  const d = Number.isFinite(id) ? await companyData(id) : null;
  if (!d) return res.status(404).send('<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:sans-serif;background:#0b1220;color:#fff;padding:40px">Company not found. <a style="color:#f5c542" href="/">Back to the game</a>');
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? esc(u) : '');
  const initials = esc(d.company_name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const title = `${d.company_name} - ${config.appName}`;
  const desc = d.tagline || d.description.slice(0, 150) || `${d.company_name} is playing ${config.appName}.`;
  res.set('Cache-Control', 'public, max-age=60').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<style>body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#000;color:#f5f5f5}main{max-width:560px;margin:0 auto;padding:28px 18px}
.card{background:#0d0d0d;border:1px solid #232323;border-radius:18px;padding:22px;margin-bottom:14px}.logo{width:72px;height:72px;border-radius:18px;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px;object-fit:cover}
h1{margin:12px 0 4px;font-size:26px}.muted{color:#8a9bc0}.pill{display:inline-block;background:#1a1a1a;border-radius:99px;padding:4px 10px;font-size:13px;margin:4px 6px 0 0}
a.btn{display:inline-block;background:#fff;color:#000;font-weight:700;padding:12px 18px;border-radius:12px;text-decoration:none;margin:6px 8px 0 0}a.btn.alt{background:#1a1a1a;color:#f5f5f5}
.stat{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1c2944}.stat:last-child{border:0}</style></head><body><main>
<div class="card" style="padding:0;overflow:hidden">${d.banner_url ? `<img src="${esc(d.banner_url)}" alt="" style="width:100%;height:140px;object-fit:cover;display:block">` : '<div style="height:90px;background:linear-gradient(135deg,#1b1b1b,#000)"></div>'}<div style="padding:0 22px 22px;margin-top:-36px">${d.logo_url ? `<img class="logo" style="border:3px solid #000" src="${esc(d.logo_url)}" alt="" referrerpolicy="no-referrer">` : `<div class="logo">${initials}</div>`}
<h1>${esc(d.company_name)}</h1><div class="muted">${esc(d.tagline)}</div>
<div style="margin-top:10px"><span class="pill">${flagImg(d.country)} ${esc(d.city || d.country)}</span><span class="pill">${esc(d.industry)}</span>${d.open_for_work ? '<span class="pill" style="background:#12391f;color:#7dffb2">Open for work</span>' : ''}${d.featured ? '<span class="pill" style="background:#3a2e08;color:#f5c542">Featured sponsor</span>' : ''}</div>
${d.description ? `<p style="line-height:1.55;white-space:pre-wrap">${esc(d.description)}</p>` : ''}
${d.looking_for ? `<p><b>Looking for:</b> ${esc(d.looking_for)}</p>` : ''}
<div>${safeUrl(d.website) ? `<a class="btn" rel="nofollow noopener ugc" target="_blank" href="${safeUrl(d.website)}">Visit website</a>` : ''}<a class="btn alt" href="/#/c/${d.id}">See in game</a></div></div></div>
<div class="card"><div class="stat"><span class="muted">World rank</span><b>#${d.world_rank.toLocaleString('en-US')}</b></div>
<div class="stat"><span class="muted">Country rank</span><b>#${d.country_rank.toLocaleString('en-US')}</b></div>
<div class="stat"><span class="muted">League</span><b>${esc(d.league.name)}</b></div>
<div class="stat"><span class="muted">Tier</span><b>${esc(d.tier.name)}</b></div>
<div class="stat"><span class="muted">Total earned</span><b>$${esc(E.fmt(d.score))}</b></div></div>
<div class="card" style="text-align:center"><b>Promote your business with ${esc(config.appName)}</b><br><a class="btn" style="margin-top:12px" href="/">Play free</a></div>
</main></body></html>`);
});
