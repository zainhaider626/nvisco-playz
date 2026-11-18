CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL,
  pass_hash       TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  tagline         TEXT NOT NULL DEFAULT '',
  industry        TEXT NOT NULL DEFAULT 'other',
  country         CHAR(2) NOT NULL DEFAULT 'PK',
  city            TEXT NOT NULL DEFAULT '',
  website         TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  logo_url        TEXT NOT NULL DEFAULT '',
  contact         TEXT NOT NULL DEFAULT '',
  open_for_work   BOOLEAN NOT NULL DEFAULT FALSE,
  looking_for     TEXT NOT NULL DEFAULT '',
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  is_bot          BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'active',          -- active | frozen | banned
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accrual    TIMESTAMPTZ NOT NULL DEFAULT now(),
  signup_ip_hash  TEXT NOT NULL DEFAULT '',

  cash            DOUBLE PRECISION NOT NULL DEFAULT 50,
  lifetime_earned DOUBLE PRECISION NOT NULL DEFAULT 0,      -- ranking score (never decreases)
  run_earned      DOUBLE PRECISION NOT NULL DEFAULT 0,      -- earned since last prestige
  season_earned   DOUBLE PRECISION NOT NULL DEFAULT 0,      -- league score
  away_earned     DOUBLE PRECISION NOT NULL DEFAULT 0,
  income_per_hour DOUBLE PRECISION NOT NULL DEFAULT 0,      -- effective, all multipliers applied
  tap_bonus       DOUBLE PRECISION NOT NULL DEFAULT 0,      -- item tap bonus (fraction)
  tap_level       INT NOT NULL DEFAULT 0,
  tap_total       BIGINT NOT NULL DEFAULT 0,
  assets_value    DOUBLE PRECISION NOT NULL DEFAULT 0,
  items_value     DOUBLE PRECISION NOT NULL DEFAULT 0,
  portfolio_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_worth       DOUBLE PRECISION NOT NULL DEFAULT 50,
  trade_pnl       DOUBLE PRECISION NOT NULL DEFAULT 0,
  trade_pnl_peak  DOUBLE PRECISION NOT NULL DEFAULT 0,
  prestige_count  INT NOT NULL DEFAULT 0,
  prestige_stars  INT NOT NULL DEFAULT 0,
  league          SMALLINT NOT NULL DEFAULT 0,
  cohort          INT NOT NULL DEFAULT 0,
  tap_tokens      DOUBLE PRECISION NOT NULL DEFAULT 40,
  tap_token_ts    TIMESTAMPTZ NOT NULL DEFAULT now(),
  boost_until     TIMESTAMPTZ,
  boost_ready_at  TIMESTAMPTZ,
  bot_growth      DOUBLE PRECISION NOT NULL DEFAULT 0        -- hourly income growth for demo bots
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_company_uq ON users (lower(company_name));
CREATE INDEX IF NOT EXISTS users_score_idx ON users (lifetime_earned DESC);
CREATE INDEX IF NOT EXISTS users_country_score_idx ON users (country, lifetime_earned DESC);
CREATE INDEX IF NOT EXISTS users_league_idx ON users (league, cohort, season_earned DESC);

CREATE TABLE IF NOT EXISTS user_assets (
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  level    INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, asset_id)
);
CREATE TABLE IF NOT EXISTS user_items (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS stocks (
  id TEXT PRIMARY KEY,
  price DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_ticks (
  stock_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  price DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_ticks_idx ON stock_ticks (stock_id, ts DESC);
CREATE TABLE IF NOT EXISTS holdings (
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id TEXT NOT NULL,
  shares   BIGINT NOT NULL,
  cost     DOUBLE PRECISION NOT NULL,                        -- total cost basis of held shares
  PRIMARY KEY (user_id, stock_id)
);

CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, seen, id DESC);

-- ---------- rewards (all money is integer micro-USD: 1 USD = 1,000,000) ----------
CREATE TABLE IF NOT EXISTS pool_funds (
  id BIGSERIAL PRIMARY KEY,
  day DATE NOT NULL,
  source TEXT NOT NULL,                                       -- ads | sponsor | manual
  campaign_id INT,
  micro BIGINT NOT NULL CHECK (micro >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pool_funds_campaign_day_uq ON pool_funds (day, campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pool_funds_day_idx ON pool_funds (day);
CREATE TABLE IF NOT EXISTS daily_taps (
  day DATE NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  units INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);
CREATE TABLE IF NOT EXISTS reward_settlements (
  day DATE PRIMARY KEY,
  pool_micro BIGINT NOT NULL,
  units_total BIGINT NOT NULL,
  paid_micro BIGINT NOT NULL,
  rollover_micro BIGINT NOT NULL,
  players INT NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pool_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rollover_micro BIGINT NOT NULL DEFAULT 0
);
INSERT INTO pool_state (id, rollover_micro) VALUES (1, 0) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                                          -- reward | withdraw_hold | withdraw_refund | adjust
  micro BIGINT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_user_idx ON wallet_ledger (user_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_reward_day_uq ON wallet_ledger (user_id, ref) WHERE kind = 'reward';
CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  micro BIGINT NOT NULL CHECK (micro > 0),
  method TEXT NOT NULL,
  account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',                      -- pending | paid | rejected
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_one_pending ON withdrawals (user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS sponsors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  url TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  budget_micro BIGINT NOT NULL CHECK (budget_micro >= 0),      -- what the sponsor paid you
  reward_share DOUBLE PRECISION NOT NULL DEFAULT 0.6,          -- fraction of budget that funds the player pool
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',                       -- active | paused | ended
  clicks INT NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- v2: media, country expansion, auction, credits, deposits, settings ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_micro BIGINT NOT NULL DEFAULT 0 CHECK (credits_micro >= 0);
CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id, kind);
CREATE TABLE IF NOT EXISTS user_branches (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country CHAR(2) NOT NULL,
  level SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, country)
);
CREATE TABLE IF NOT EXISTS partnerships (
  id SERIAL PRIMARY KEY,
  requester INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country CHAR(2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',                      -- pending | active | declined | ended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  CHECK (requester <> partner)
);
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_pair_uq ON partnerships (LEAST(requester, partner), GREATEST(requester, partner)) WHERE status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS partnerships_req_idx ON partnerships (requester, status);
CREATE INDEX IF NOT EXISTS partnerships_par_idx ON partnerships (partner, status);
CREATE TABLE IF NOT EXISTS auctions (
  id SERIAL PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',                         -- open | closed
  slots INT NOT NULL DEFAULT 3,
  settled_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS auctions_one_open ON auctions ((status)) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS auction_bids (
  auction_id INT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_micro BIGINT NOT NULL CHECK (amount_micro > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (auction_id, user_id)
);
CREATE INDEX IF NOT EXISTS auction_bids_rank_idx ON auction_bids (auction_id, amount_micro DESC, created_at);
CREATE TABLE IF NOT EXISTS auction_wins (
  id SERIAL PRIMARY KEY,
  auction_id INT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_micro BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auction_id, rank)
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  micro BIGINT NOT NULL,                                       -- signed
  kind TEXT NOT NULL,                                          -- deposit | auction_hold | auction_refund | auction_paid | adjust
  ref TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, id DESC);
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount_usd_micro BIGINT NOT NULL CHECK (amount_usd_micro > 0),
  amount_local NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  txn_id TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',                      -- pending | approved | rejected
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (method, txn_id)
);
CREATE INDEX IF NOT EXISTS deposits_status_idx ON deposits (status, id DESC);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, val TEXT NOT NULL);
