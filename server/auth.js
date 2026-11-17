import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, tx } from './db.js';
import { config } from './config.js';
import { asyncH, bad, clean, HttpError, cleanUrl } from './util.js';
import { INDUSTRIES, LEAGUES } from './gamedata.js';
import { START_CASH } from './economy.js';
import { assignLeague } from './leagues.js';

const COOKIE = 'te_session';
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,&'’\-+_!()@#]{1,30}[\p{L}\p{N}.!)]$/u;
const RESERVED = ['admin', 'administrator', 'support', 'official', 'staff', 'moderator', 'system', config.appName.toLowerCase()];
const countries = new Set(JSON.parse((await import('node:fs')).readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8')).map(c => c.code));

export function setSession(res, uid) {
  const token = jwt.sign({ uid }, config.jwtSecret, { expiresIn: '60d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 60 * 86400e3, path: '/' });
}

/** Attach req.uid when a valid session cookie is present. */
export function readSession(req, _res, next) {
  const t = req.cookies?.[COOKIE];
  if (t) { try { req.uid = jwt.verify(t, config.jwtSecret).uid; } catch { /* invalid/expired */ } }
  next();
}
export const requireAuth = (req, _res, next) => (req.uid ? next() : next(new HttpError(401, 'Please sign in')));
export const requireAdmin = asyncH(async (req, _res, next) => {
  if (!req.uid) throw new HttpError(401, 'Please sign in');
  const r = await q(`SELECT is_admin FROM users WHERE id=$1`, [req.uid]);
  if (!r.rows[0]?.is_admin) throw new HttpError(403, 'Admins only');
  next();
});

export function validateProfile(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.company_name !== undefined) {
    const name = clean(b.company_name, 32);
    if (!NAME_RE.test(name)) throw bad('Company name must be 3-32 characters (letters, numbers and . , & - \' only)');
    if (RESERVED.some(r => name.toLowerCase() === r)) throw bad('That company name is reserved');
    out.company_name = name;
  }
  if (!partial || b.country !== undefined) {
    const c = clean(b.country, 2).toUpperCase();
    if (!countries.has(c)) throw bad('Choose your country');
    out.country = c;
  }
  if (!partial || b.industry !== undefined) {
    const i = clean(b.industry, 40);
    out.industry = INDUSTRIES.includes(i) ? i : 'Other';
  }
  if (b.tagline !== undefined) out.tagline = clean(b.tagline, 80);
  if (b.city !== undefined) out.city = clean(b.city, 60);
  if (b.website !== undefined) out.website = cleanUrl(b.website, { max: 200 });
  if (b.logo_url !== undefined) out.logo_url = cleanUrl(b.logo_url, { httpsOnly: true, max: 300 });
  if (b.description !== undefined) out.description = (typeof b.description === 'string' ? b.description.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 500) : '');
  if (b.contact !== undefined) out.contact = clean(b.contact, 120);
  if (b.open_for_work !== undefined) out.open_for_work = !!b.open_for_work;
  if (b.looking_for !== undefined) out.looking_for = clean(b.looking_for, 120);
  return out;
}

export const authRouter = Router();
const limitRegister = rateLimit({ windowMs: 3600e3, limit: config.registerLimitPerHour, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-ups from this network. Try again later.' } });
const limitLogin = rateLimit({ windowMs: 15 * 60e3, limit: config.loginLimitPer15Min, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

authRouter.post('/register', limitRegister, asyncH(async (req, res) => {
  const b = req.body || {};
  const email = clean(b.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 100) throw bad('Password must be at least 8 characters');
  const prof = validateProfile(b);
  const hash = await bcrypt.hash(b.password, 10);
  const ipHash = crypto.createHash('sha256').update(`${req.ip}|${config.jwtSecret}`).digest('hex').slice(0, 24);
  const isAdmin = config.adminEmails.includes(email);
  try {
    const id = await tx(async c => {
      const r = await c.query(
        `INSERT INTO users (email, pass_hash, company_name, tagline, industry, country, city, website, description, logo_url, contact, open_for_work, looking_for, is_admin, signup_ip_hash, cash, net_worth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING id`,
        [email, hash, prof.company_name, prof.tagline || '', prof.industry, prof.country, prof.city || '', prof.website || '', prof.description || '',
         prof.logo_url || '', prof.contact || '', !!prof.open_for_work, prof.looking_for || '', isAdmin, ipHash, START_CASH]);
      await assignLeague(c, r.rows[0].id, 0);
      return r.rows[0].id;
    });
    setSession(res, id);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') {
      if (String(e.constraint).includes('email')) throw bad('An account with this email already exists');
      throw bad('That company name is already taken');
    }
    throw e;
  }
}));

authRouter.post('/login', limitLogin, asyncH(async (req, res) => {
  const email = clean(req.body?.email, 120).toLowerCase();
  const r = await q(`SELECT id, pass_hash, status FROM users WHERE lower(email)=$1 AND NOT is_bot`, [email]);
  const u = r.rows[0];
  const ok = u && await bcrypt.compare(String(req.body?.password ?? ''), u.pass_hash);
  if (!ok) throw new HttpError(401, 'Wrong email or password');
  if (u.status === 'banned') throw new HttpError(403, 'This account has been suspended');
  setSession(res, u.id);
  res.json({ ok: true });
}));

authRouter.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
export { COOKIE };
