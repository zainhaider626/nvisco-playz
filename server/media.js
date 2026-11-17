import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q } from './db.js';
import { config } from './config.js';
import { asyncH, bad, HttpError } from './util.js';
import { requireAuth } from './auth.js';

// Logo and banner uploads. The browser shrinks pictures before sending; the server re-checks size and file type (PNG, JPEG, WebP only; never SVG).
const sniff = (b) => {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};
export const mediaRouter = Router();
const limit = rateLimit({ windowMs: 3600e3, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many uploads, try again later.' } });

mediaRouter.post('/media/:kind', requireAuth, limit, express.raw({ type: () => true, limit: config.mediaMaxBytes }), asyncH(async (req, res) => {
  const kind = req.params.kind;
  if (!['logo', 'banner'].includes(kind)) throw new HttpError(404, 'Unknown upload type');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 100) throw bad('Choose a picture first');
  const mime = sniff(buf);
  if (!mime) throw bad('Please upload a PNG, JPG or WebP picture');
  const id = (await q(`INSERT INTO media (user_id, kind, mime, data) VALUES ($1,$2,$3,$4) RETURNING id`, [req.uid, kind, mime, buf])).rows[0].id;
  const col = kind === 'logo' ? 'logo_url' : 'banner_url';
  await q(`UPDATE users SET ${col}=$2 WHERE id=$1`, [req.uid, `/media/${id}`]);
  await q(`DELETE FROM media WHERE user_id=$1 AND kind=$2 AND id <> $3`, [req.uid, kind, id]);
  res.json({ ok: true, url: `/media/${id}` });
}));

mediaRouter.delete('/media/:kind', requireAuth, asyncH(async (req, res) => {
  const kind = req.params.kind;
  if (!['logo', 'banner'].includes(kind)) throw new HttpError(404, 'Unknown upload type');
  await q(`UPDATE users SET ${kind === 'logo' ? 'logo_url' : 'banner_url'}='' WHERE id=$1`, [req.uid]);
  await q(`DELETE FROM media WHERE user_id=$1 AND kind=$2`, [req.uid, kind]);
  res.json({ ok: true });
}));

export const serveMedia = asyncH(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw new HttpError(404, 'Not found');
  const r = await q(`SELECT mime, data FROM media WHERE id=$1`, [req.params.id]);
  if (!r.rows[0]) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': r.rows[0].mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(r.rows[0].data);
});
