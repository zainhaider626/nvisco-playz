import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate, pool, q } from './db.js';
import { authRouter, readSession, requireAuth } from './auth.js';
import { gameRouter, gamedataHandler } from './game.js';
import { ranksRouter, companyPage, sponsorClick } from './ranks.js';
import { adminRouter } from './admin.js';
import { mediaRouter, serveMedia } from './media.js';
import { expandRouter } from './expand.js';
import { auctionRouter } from './auction.js';
import { walletRouter } from './wallet.js';
import { loadMarket } from './market.js';
import { currentSeason } from './leagues.js';
import { startTicker, tick, seedDemoBots, tickInfo } from './tick.js';
import { addClient, connectedCount } from './sse.js';
import { HttpError } from './util.js';

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: ["'self'"], frameAncestors: ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
  } },
  crossOriginEmbedderPolicy: false,
}));
app.use((req, res, next) => (req.path.startsWith('/api/media/') ? next() : express.json({ limit: '20kb' })(req, res, next)));
app.use(cookieParser());
app.use(readSession);

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
// HTML, JS, CSS and the service worker are always revalidated so every update you deploy reaches installed apps on their next open
app.use(express.static(pub, { maxAge: 0, etag: true, extensions: ['html'], setHeaders: (res, p) => { if (/\.(png|jpe?g|webp|woff2|svg|apk)$/i.test(p)) res.setHeader('Cache-Control', 'public, max-age=86400'); else res.setHeader('Cache-Control', 'no-cache'); } }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ...tickInfo(), streams: connectedCount() }));
app.get('/api/gamedata', gamedataHandler);
app.use('/api/auth', authRouter);
app.get('/api/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 4000\n\nevent: hello\ndata: {}\n\n');
  addClient(req.uid, res);
});
app.use('/api/admin', adminRouter);
app.get('/download', (_req, res) => (config.apkUrl ? res.redirect(config.apkUrl) : res.status(404).type('text').send('The Android app is not published yet.')));
app.use('/api', mediaRouter);
app.get('/media/:id', serveMedia);
app.use('/api', gameRouter);
app.use('/api', expandRouter);
app.use('/api', auctionRouter);
app.use('/api', walletRouter);
app.use('/api', ranksRouter);
app.get('/c/:id', companyPage);
app.get('/go/s/:id', sponsorClick);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

await migrate();
await loadMarket();
await currentSeason();
if (config.seedDemoBots) await seedDemoBots(config.seedDemoBots);
else { const gone = (await q(`DELETE FROM users WHERE is_bot RETURNING id`)).rowCount; if (gone) console.log(`[seed] removed ${gone} demo companies (SEED_DEMO_BOTS=0)`); }
const server = app.listen(config.port, () => console.log(`${config.appName} listening on http://localhost:${config.port}`));
startTicker();
const stop = () => { server.close(); pool.end().finally(() => process.exit(0)); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
export { app, tick };
