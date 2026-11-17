# Nvisco Playz

*Promote your business with Nvisco Playz.* A tap-and-invest business game where every player is a **company**: tap, buy businesses and property in six regions, open branches and partner with companies in every country, trade 22 world-style stocks, collect real cars, yachts, jets, watches, phones and art, climb live rankings and bid for the top spot.

Stack: Node 22, Express, PostgreSQL 16, vanilla JS front end (no build step), Server-Sent Events. Android app: Capacitor shell (see `BUILD-APK.md`).

## What is inside

- Numbers up to unlimited size: K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc and beyond, or lakh/crore (Profile > Number style; South-Asian countries default to it).
- Businesses keep earning while the app is closed (up to `OFFLINE_CAP_HOURS`, default 12) and the amount is already in your balance when you return.
- Animated tier cards (Starter, Stratos, Citadel, Cutts Silk, Dubai Royale, Octave Black, Morgen Reserve, Centaur Black).
- Top-spot auction from $1, winners shown with profile details. Anyone can set a logo and banner.
- Wallet: players add credits through your Easypaisa / SadaPay / bank account; you approve each deposit by transaction ID (admin panel > Connect wallet).
- **Two sign-in doors**: *Individual* (players) and *Admin* (your `ADMIN_USERNAME` / `ADMIN_PASSWORD`). Admin has its own panel at `/admin.html` with Log out and "Switch to my game".

## Run it on your computer

```bash
createuser tapempire -P && createdb tapempire -O tapempire     # PostgreSQL
cp .env.example .env     # for local use set NODE_ENV=development, COOKIE_SECURE=false and an ADMIN_PASSWORD
npm install && npm start # http://localhost:3000
```

## Put it online (needed so friends can play)

**Render (easiest):** push this repo to GitHub, then Render > New > Blueprint > select it (`render.yaml`). After the first deploy open the service > Environment and set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (12+ characters). Free plans sleep when idle, so use a paid plan for a real launch.
**Any server:** `cp .env.example .env`, fill it in, `docker compose up -d --build`, and put Caddy, nginx or Cloudflare in front for HTTPS.

## Real product photos

Cars, yachts, jets, watches, phones and art use real photos from Wikimedia Commons (free licences; credits at `/credits.html`). The photos are not in the repo until you fetch them: **Actions > "Fetch product photos" > Run workflow** (it commits them), or run `npm run photos` on a computer with internet. Render also tries during each build. Until a photo exists, a plain drawing is shown, so the game never breaks. Some searches may miss: list them in the run log and replace by hand in `public/photos/` plus `manifest.json`.

## Before real money moves (please read)

- Rewards and paid auctions are games of skill/chance with real money: check prize-game, payments, tax and KYC rules in Pakistan and each player country. This is not legal advice.
- Product names (Nokia, Rolex, Ferrari...) and artwork photos belong to their owners; they are used only to identify items and are shown with credits. Get a lawyer's view before charging money or paying rewards while using real brand names. Stock-market companies use invented names and abstract emblems, not real logos.
- Deposits are checked by hand against your account statement. Automatic gateways (JazzCash/Easypaisa merchant API, Stripe) can replace this later in `server/wallet.js`.
- Credits are non-withdrawable. Keep rewards budget-capped (see `.env.example`).

## Commands

| Command | What it does |
|---|---|
| `npm test` | API tests (server running on :3000) |
| `npm run photos` | download product photos from Wikimedia Commons |
| `npm run simulate` | pacing simulation |

Game numbers live in `server/gamedata.js` and `server/economy.js`.
