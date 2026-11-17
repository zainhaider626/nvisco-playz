import 'dotenv/config';

const env = process.env;
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export const config = {
  appName: env.APP_NAME || 'Nvisco Playz',
  apkUrl: (env.APK_URL || '').trim(),
  port: num(env.PORT, 3000),
  production: env.NODE_ENV === 'production',
  databaseUrl: env.DATABASE_URL || 'postgres://tapempire:tapempire_dev@127.0.0.1:5432/tapempire',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  cookieSecure: bool(env.COOKIE_SECURE, env.NODE_ENV === 'production'),
  trustProxy: bool(env.TRUST_PROXY, false),
  adminEmails: (env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  // Owner login (separate from player accounts). Admin is disabled unless both are set.
  adminUsername: (env.ADMIN_USERNAME || '').trim(),
  adminPassword: env.ADMIN_PASSWORD || '',
  adminLoginLimitPer15Min: num(env.ADMIN_LOGIN_LIMIT_PER_15MIN, 8),

  registerLimitPerHour: num(env.REGISTER_LIMIT_PER_HOUR, 10),   // sign-ups per IP per hour
  loginLimitPer15Min: num(env.LOGIN_LIMIT_PER_15MIN, 30),

  // game loop
  tickSeconds: num(env.TICK_SECONDS, 60),
  offlineCapHours: num(env.OFFLINE_CAP_HOURS, 12),
  seasonDays: num(env.SEASON_DAYS, 7),
  cohortSize: num(env.LEAGUE_COHORT_SIZE, 30),
  seedDemoBots: num(env.SEED_DEMO_BOTS, 0),

  // paid top-spot auction (all money integer micro-USD)
  auctionHours: num(env.AUCTION_HOURS, 24),
  auctionSlots: num(env.AUCTION_SLOTS, 3),
  auctionMinBidMicro: num(env.AUCTION_MIN_BID_MICRO, 1_000_000),     // bids start at $1
  auctionMinRaiseMicro: num(env.AUCTION_MIN_RAISE_MICRO, 500_000),   // each raise is at least $0.50
  auctionAntiSnipeMinutes: num(env.AUCTION_ANTISNIPE_MIN, 5),
  auctionPoolShare: num(env.AUCTION_POOL_SHARE, 0.3),                 // share of auction revenue added to the player reward pool
  pkrPerUsd: num(env.PKR_PER_USD, 280),                               // default shown for deposits; admin can change it in the panel
  mediaMaxBytes: num(env.MEDIA_MAX_BYTES, 450_000),

  // tap anti-abuse (token bucket per player)
  tapBucket: num(env.TAP_BUCKET, 40),
  tapRefillPerSec: num(env.TAP_REFILL_PER_SEC, 8),

  // rewards: every number here is a hard budget control
  rewardsEnabled: bool(env.REWARDS_ENABLED, true),
  rewardTz: env.REWARD_TZ || 'Asia/Karachi',
  maxRateMicroPerTap: num(env.MAX_RATE_MICRO_PER_TAP, 100),   // 100 micro-USD = $0.0001 per tap, absolute ceiling
  dailyUnitCap: num(env.DAILY_UNIT_CAP, 2000),                 // reward-eligible taps per player per day
  minWithdrawMicro: num(env.MIN_WITHDRAW_MICRO, 5_000_000),    // $5
  minAccountAgeDays: num(env.MIN_ACCOUNT_AGE_DAYS, 3),
  adRevenueShare: num(env.AD_REVENUE_SHARE, 0.5),              // share of gross ad revenue that goes to the player pool
};

if (config.production && config.adminPassword && config.adminPassword.length < 12) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters in production');
}
if (config.production && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

if (config.adminPassword && config.adminPassword.length < 10) console.warn('[config] ADMIN_PASSWORD is shorter than 10 characters, please use a longer one');
