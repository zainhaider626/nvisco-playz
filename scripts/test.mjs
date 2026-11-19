// End-to-end API test against a running server (default http://localhost:3000) using the real database.
// Usage: node scripts/test.mjs
import { q, pool, rewardDay } from '../server/db.js';
import * as rewards from '../server/rewards.js';
import { config } from '../server/config.js';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); } };

class Client {
  constructor() { this.cookie = ''; }
  async call(method, path, body) {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie?.() || []; if (sc.length) this.cookie = sc.map(s => s.split(';')[0]).join('; ');
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: r.status, ...json };
  }
  get(p) { return this.call('GET', p); }
  post(p, b) { return this.call('POST', p, b || {}); }
}
const tag = Date.now().toString(36);
const mk = async (name, email, country = 'PK') => {
  const c = new Client();
  const r = await c.post('/api/auth/register', { email, password: 'secret123', company_name: name, country, industry: 'Technology', website: 'example.com', tagline: 'We build things' });
  if (r.status !== 200) throw new Error('register failed ' + JSON.stringify(r));
  return c;
};
const setUser = (email, sets) => q(`UPDATE users SET ${Object.keys(sets).map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE lower(email)=$1`, [email, ...Object.values(sets)]);

console.log('\nAuth');
const aEmail = `a${tag}@test.dev`;
const A = await mk(`Alpha Works ${tag}`, aEmail);
ok((await A.get('/api/state')).cash === 50, 'new player starts with $50');
ok((await new Client().get('/api/state')).status === 401, 'state requires login');
const dup = await new Client().post('/api/auth/register', { email: `x${tag}@t.dev`, password: 'secret123', company_name: `alpha works ${tag}`, country: 'PK' });
ok(dup.status === 400 && /taken/.test(dup.error), 'company names are unique (case-insensitive)');
const weak = await new Client().post('/api/auth/register', { email: `w${tag}@t.dev`, password: 'short', company_name: `Weak ${tag}`, country: 'PK' });
ok(weak.status === 400, 'short password rejected');
const xss = await new Client().post('/api/auth/register', { email: `s${tag}@t.dev`, password: 'secret123', company_name: `<script>x</script>`, country: 'PK' });
ok(xss.status === 400, 'script tags in company name rejected');
const login = new Client(); ok((await login.post('/api/auth/login', { email: aEmail, password: 'secret123' })).status === 200, 'login works');
ok((await new Client().post('/api/auth/login', { email: aEmail, password: 'nope' })).status === 401, 'wrong password rejected');

console.log('\nTapping');
let s = await A.get('/api/state');
const t1 = await A.post('/api/tap', { n: 40 });
ok(t1.accepted > 0 && t1.accepted <= 40, `tap accepted ${t1.accepted}`);
ok(Math.abs(t1.gain - t1.accepted * 1) < 1e-6, 'each tap pays $1 at level 0');
const t2 = await A.post('/api/tap', { n: 100 });
ok(t2.accepted < 20, `burst beyond the token bucket is throttled (accepted ${t2.accepted})`);
ok(t1.units > 0, 'taps count as reward units');

console.log('\nBuying');
await setUser(aEmail, { cash: 1e6 });
let r = await A.post('/api/assets/buy', { asset_id: 'africa-1' });
ok(r.status === 200 && r.state.owned['africa-1'] === 1, 'buy first business');
ok(r.state.income_per_hour > 0, `passive income now ${Math.round(r.state.income_per_hour)}/h`);
ok((await A.post('/api/assets/buy', { asset_id: 'africa-1' })).status === 400, 'cannot buy twice');
ok((await A.post('/api/assets/buy', { asset_id: 'asia-1' })).status === 400, 'locked region cannot be bought');
r = await A.post('/api/assets/upgrade', { asset_id: 'africa-1' });
ok(r.status === 200 && r.state.owned['africa-1'] === 2, 'upgrade asset to level 2');
r = await A.post('/api/tap/upgrade'); ok(r.status === 200 && r.state.tap.level === 1, 'tap upgrade');
r = await A.post('/api/items/buy', { item_id: 'cars-1' }); ok(r.status === 200 && r.state.items.includes('cars-1'), 'buy first car');
ok(r.state.income_bonus > 0, 'car gives income bonus');
ok((await A.post('/api/items/buy', { item_id: 'jets-5' })).status === 400, 'cannot afford a private airliner');
const poor = await mk(`Poor Co ${tag}`, `p${tag}@test.dev`);
ok((await poor.post('/api/assets/buy', { asset_id: 'africa-1' })).status === 400, 'cannot buy without cash');
r = await A.post('/api/boost'); ok(r.status === 200 && r.state.tap.boost_until, 'boost activates');
ok((await A.post('/api/boost')).status === 400, 'boost has a cooldown');

console.log('\nTrading');
const mk0 = await A.get('/api/market'); ok(mk0.stocks.length === 22, 'market has 22 stocks');
r = await A.post('/api/trade', { stock_id: 'SBZ', side: 'buy', shares: 1000 });
ok(r.status === 200 && r.state.holdings.SBZ.shares === 1000, 'buy shares');
ok(r.state.portfolio_value > 0, 'portfolio valued');
const cashBefore = r.state.cash;
r = await A.post('/api/trade', { stock_id: 'SBZ', side: 'sell', shares: 1000 });
ok(r.status === 200 && !r.state.holdings.SBZ, 'sell all shares');
ok(r.state.cash < cashBefore + 1000 * 12 * 4.2 && r.state.trade_pnl < 0, 'round trip costs the 1% fee each way (never free money)');
ok((await A.post('/api/trade', { stock_id: 'SBZ', side: 'buy', shares: 100001 })).status === 400, 'position cap enforced');
ok((await A.post('/api/trade', { stock_id: 'SBZ', side: 'sell', shares: 5 })).status === 400, 'cannot sell shares you do not own');

console.log('\nBoards, profiles, directory');
const w = await A.get('/api/leaderboard/world'); ok(w.rows.length > 5 && w.rows[0].rank === 1, 'world board has rows');
ok(w.rows.every((x, i) => i === 0 || w.rows[i - 1].score >= x.score), 'world board is sorted');
const cb = await A.get('/api/leaderboard/country'); ok(cb.rows.every(x => x.country === 'PK'), 'country board only shows my country');
ok(cb.rows.some(x => x.me) || cb.me, 'I appear on the country board (or pinned below it)');
const lb = await A.get('/api/leaderboard/league'); ok(lb.rows.some(x => x.me) && lb.league.name === 'Bronze' && lb.ends_at, 'league board shows my cohort and season end');
const dir = await A.get(`/api/directory?q=${encodeURIComponent('Alpha Works ' + tag)}`); ok(dir.rows.length === 1 && dir.rows[0].tagline === 'We build things', 'directory search finds my company');
ok(!(await A.get('/api/directory?open=1')).rows.some(x => x.company_name === 'Alpha Works ' + tag), 'open-for-work filter excludes me until I opt in');
const me = (await A.get('/api/state')).me;
const co = await A.get(`/api/company/${me.id}`); ok(co.company_name === 'Alpha Works ' + tag && co.world_rank > 0, 'company profile with ranks');
const html = await fetch(`${BASE}/c/${me.id}`).then(r => r.text()); ok(html.includes('Alpha Works') && html.includes('World rank'), 'public company page renders');
ok((await A.post('/api/profile', { website: 'javascript:alert(1)' })).status === 400, 'javascript: links rejected');
ok((await A.post('/api/profile', { description: '<img src=x onerror=alert(1)>', open_for_work: true, looking_for: 'Clients' })).status === 200, 'profile update');
const html2 = await fetch(`${BASE}/c/${me.id}`).then(r => r.text()); ok(!html2.includes('<img src=x') && html2.includes('&lt;img'), 'profile text is HTML-escaped');
ok((await A.get('/api/directory?open=1')).rows.some(x => x.id === me.id), 'open-for-work filter finds me now');

console.log('\nPrestige');
r = await A.post('/api/prestige'); ok(r.status === 400, 'prestige blocked below $10B');
await setUser(aEmail, { run_earned: 5e12 });
r = await A.post('/api/prestige');
ok(r.status === 200 && r.state.me.stars > 0 && r.state.cash === 50 && Object.keys(r.state.owned).length === 0 && r.state.items.includes('cars-1'), `prestige resets progress, keeps trophies (+${r.state.me.stars} stars)`);

console.log('\nRewards: the pool can never be overspent');
// fresh isolated day far in the past so real data is untouched
const day = '2001-01-01';
await q(`DELETE FROM reward_settlements WHERE day=$1`, [day]); await q(`DELETE FROM pool_funds WHERE day=$1`, [day]); await q(`DELETE FROM daily_taps WHERE day=$1`, [day]);
const ids = []; for (let i = 0; i < 5; i++) { const c = await mk(`Reward ${i} ${tag}`, `r${i}${tag}@test.dev`); ids.push((await c.get('/api/state')).me.id); }
const before = (await q(`SELECT rollover_micro::text r FROM pool_state`)).rows[0].r;
const units = [2000, 1500, 500, 10, 0];
for (let i = 0; i < ids.length; i++) if (units[i]) await q(`INSERT INTO daily_taps (day, user_id, units) VALUES ($1,$2,$3)`, [day, ids[i], units[i]]);
await q(`INSERT INTO pool_funds (day, source, micro) VALUES ($1,'manual',$2)`, [day, 100_000]);       // $0.10: too small for the demand
let st = await rewards.settleDay(day);
ok(st.paid <= st.pool, `small pool ($${st.pool / 1e6}) fully shared but not exceeded (paid ${st.paid})`);
ok(st.paid >= st.pool - 5, 'nearly all of a small pool is distributed pro-rata');
const bal = async (id) => Number((await q(`SELECT COALESCE(SUM(micro),0)::text b FROM wallet_ledger WHERE user_id=$1`, [id])).rows[0].b);
ok((await bal(ids[0])) > (await bal(ids[1])) && (await bal(ids[1])) > (await bal(ids[2])), 'more taps -> bigger share');
ok((await bal(ids[4])) === 0, 'zero taps -> nothing');
ok((await rewards.settleDay(day)) === null, 'a settled day cannot be paid twice');

const day2 = '2001-01-02';
await q(`DELETE FROM reward_settlements WHERE day=$1`, [day2]); await q(`DELETE FROM pool_funds WHERE day=$1`, [day2]); await q(`DELETE FROM daily_taps WHERE day=$1`, [day2]);
await q(`INSERT INTO daily_taps (day, user_id, units) VALUES ($1,$2,2000)`, [day2, ids[0]]);
await q(`INSERT INTO pool_funds (day, source, micro) VALUES ($1,'manual',$2)`, [day2, 50_000_000]);   // $50 pool, one tapper
st = await rewards.settleDay(day2);
ok(st.paid === 2000 * config.maxRateMicroPerTap, `huge pool, few tappers -> capped at $${config.maxRateMicroPerTap / 1e6}/tap (paid ${st.paid})`);
ok(st.rollover === st.pool - st.paid && st.rollover > 0, 'unspent money rolls over instead of being given away');
await q(`UPDATE pool_state SET rollover_micro=$1`, [before]);   // restore real rollover for the dev DB

console.log('\nWithdrawals');
const rc = new Client(); await rc.post('/api/auth/login', { email: `r0${tag}@test.dev`, password: 'secret123' });
await q(`INSERT INTO wallet_ledger (user_id, kind, micro, ref) VALUES ($1,'reward',6000000,'test-topup')`, [ids[0]]);
let wd = await rc.post('/api/rewards/withdraw', { method: 'jazzcash', account: '03001234567' });
ok(wd.status === 400 && /unlock/.test(wd.error), 'new accounts must wait before withdrawing');
await q(`UPDATE users SET created_at = now() - interval '10 days' WHERE id=$1`, [ids[0]]);
ok((await rc.post('/api/rewards/withdraw', { method: 'jazzcash', account: '1' })).status === 400, 'account details required');
wd = await rc.post('/api/rewards/withdraw', { method: 'jazzcash', account: '03001234567' });
ok(wd.status === 200 && wd.micro > 5_000_000, 'withdrawal request accepted');
ok((await rc.post('/api/rewards/withdraw', { method: 'jazzcash', account: '03001234567' })).status === 400, 'only one pending withdrawal at a time');
const rw = await rc.get('/api/rewards'); ok(rw.summary.balance_micro < 2_000_000, 'balance is held while the withdrawal is pending');
ok((await rc.get('/api/admin/stats')).status === 401, 'normal players cannot open the admin API');

console.log('\nAdmin');
const B = await mk(`Beta Works ${tag}`, `b${tag}@test.dev`, 'US');
const adm = new Client();
ok((await adm.get('/api/admin/stats')).status === 401, 'admin API needs the owner login');
ok((await adm.post('/api/admin/login', { username: config.adminUsername, password: 'wrong-password' })).status === 401, 'wrong admin password rejected');
ok((await adm.post('/api/admin/login', { username: 'nobody', password: config.adminPassword })).status === 401, 'wrong admin username rejected');
ok((await adm.post('/api/admin/login', { username: config.adminUsername, password: config.adminPassword })).status === 200, 'owner can sign in with admin credentials');
ok((await adm.get('/api/admin/me')).admin === true, 'admin session recognised');
ok((await rc.get('/api/admin/me')).admin === false, 'a player session is not an admin session');
const stats = await adm.get('/api/admin/stats'); ok(stats.status === 200 && stats.users.players > 0, 'admin stats load');
const pend = await adm.get('/api/admin/withdrawals'); const mine = pend.rows.find(x => x.user_id === ids[0]); ok(!!mine, 'pending withdrawal visible to admin');
ok((await adm.post(`/api/admin/withdrawals/${mine.id}/reject`, { note: 'test' })).status === 200, 'admin rejects');
ok((await rc.get('/api/rewards')).summary.balance_micro > 5_000_000, 'rejected withdrawal is refunded to the wallet');
const sp = await adm.post('/api/admin/sponsors', { name: `Sponsor ${tag}`, budget_usd: 30, reward_share: 0.6, days: 30, company_id: me.id, tagline: 'Hi' });
ok(sp.status === 200, 'sponsor campaign created');
const todayFunds = Number((await q(`SELECT COALESCE(SUM(micro),0)::text s FROM pool_funds WHERE campaign_id=$1`, [sp.id])).rows[0].s);
ok(todayFunds === 600_000, `$30 x 60% over 30 days funds $0.60/day (got ${todayFunds / 1e6})`);
ok((await A.get('/api/sponsors')).rows.some(x => x.id === sp.id), 'sponsor appears in the app');
ok((await adm.post('/api/admin/funds', { amount_usd: 10, source: 'ads', note: 'test' })).added_micro === 10_000_000 * config.adRevenueShare, 'ad revenue adds only the configured share to the pool');
await adm.post(`/api/admin/sponsors/${sp.id}/status`, { status: 'ended' });
const out = await adm.post('/api/admin/logout'); ok(out.status === 200 && (await adm.get('/api/admin/stats')).status === 401, 'admin can log out and the panel closes');

console.log('\nPayment accounts, deposits and credits');
await adm.post('/api/admin/login', { username: config.adminUsername, password: config.adminPassword });
ok((await adm.post('/api/admin/payments', { pkr_per_usd: 280, instructions: 'Send then paste the ID', methods: [{ id: 'easypaisa', label: 'Easypaisa', account_title: 'Nvisco', account_number: '03001234567' }, { id: 'sadapay', label: 'SadaPay', account_title: 'Nvisco', account_number: '03001234568', enabled: false }] })).status === 200, 'admin saves payment accounts');
const wl = await A.get('/api/wallet'); ok(wl.payments.methods.length === 1 && wl.payments.methods[0].id === 'easypaisa', 'players only see enabled payment methods');
ok((await A.post('/api/wallet/deposit', { method: 'sadapay', amount_usd: 5, txn_id: 'TXN123456' })).status === 400, 'disabled method rejected');
ok((await A.post('/api/wallet/deposit', { method: 'easypaisa', amount_usd: 5, txn_id: 'x' })).status === 400, 'bad transaction id rejected');
let dep = await A.post('/api/wallet/deposit', { method: 'easypaisa', amount_usd: 5, txn_id: 'EP' + tag.toUpperCase() + 'A' });
ok(dep.status === 200 && dep.pkr === 1400, 'deposit request created with PKR amount');
ok((await B.post('/api/wallet/deposit', { method: 'easypaisa', amount_usd: 5, txn_id: 'EP' + tag.toUpperCase() + 'A' })).status === 400, 'same transaction id cannot be reused');
ok((await A.get('/api/wallet')).credits_micro === 0, 'credits stay zero until approved');
const dl = await adm.get('/api/admin/deposits'); const dmine = dl.rows.find(x => x.id === dep.id); ok(!!dmine, 'admin sees the pending deposit');
ok((await adm.post(`/api/admin/deposits/${dep.id}/approve`, {})).status === 200, 'admin approves deposit');
ok((await adm.post(`/api/admin/deposits/${dep.id}/approve`, {})).status === 400, 'cannot approve twice');
ok((await A.get('/api/wallet')).credits_micro === 5_000_000, 'approved deposit becomes credits');

console.log('\nTop-spot auction');
await adm.post('/api/admin/auction/close-now');          // start from a clean open auction
let au = await A.get('/api/auction'); ok(au.open.slots === 3 && au.open.min_bid_micro === 1_000_000, 'auction is open with $1 minimum');
ok((await A.post('/api/auction/bid', { amount_usd: 0.5 })).status === 400, 'bids below $1 rejected');
await adm.post(`/api/admin/users/${ids[0]}/credits`, { amount_usd: 20, note: 'test' });
ok((await B.post('/api/auction/bid', { amount_usd: 2 })).status === 400, 'cannot bid without credits');
r = await A.post('/api/auction/bid', { amount_usd: 2 }); ok(r.status === 200 && r.open.me.bid_micro === 2_000_000 && r.open.me.rank === 1, 'first bid placed and ranked first');
ok((await A.get('/api/wallet')).credits_micro === 3_000_000, 'bid is held from credits');
ok((await A.post('/api/auction/bid', { amount_usd: 2.2 })).status === 400, 'a raise must be at least $0.50');
r = await A.post('/api/auction/bid', { amount_usd: 3 }); ok(r.status === 200 && r.open.me.bid_micro === 3_000_000, 'raising a bid works');
ok((await A.get('/api/wallet')).credits_micro === 2_000_000, 'only the raise difference is held');
await adm.post(`/api/admin/users/${ids[0]}/credits`, { amount_usd: 100, note: 'test' });
r = await A.post('/api/auction/bid', { amount_usd: 5000 }); ok(r.status === 400, 'cannot bid more credits than the wallet holds');
const closed = await adm.post('/api/admin/auction/close-now'); ok(closed.closed.length === 1 && closed.closed[0].winners >= 1, 'auction closes with winners');
const spots = await A.get('/api/spots'); ok(spots.rows[0]?.company.id === me.id && spots.rows[0].amount_micro === 3_000_000, 'winner holds the top spot');
const dir2 = await A.get('/api/directory'); ok(dir2.rows[0].id === me.id && dir2.rows[0].featured, 'winner is featured at the top of the directory');
au = await A.get('/api/auction'); ok(au.recent.length >= 1 && au.recent[0].company.company_name && au.open.bids.length === 0, 'recent winners list and a fresh auction');
const poolBefore = Number((await q(`SELECT COALESCE(SUM(micro),0)::text s FROM pool_funds WHERE source='auction'`)).rows[0].s);
ok(poolBefore >= 900_000, 'part of the auction revenue feeds the reward pool');

console.log('\nCountry branches and partnerships');
await setUser(`a${tag}@test.dev`, { cash: 1e20 });
await A.post('/api/assets/buy', { asset_id: 'africa-1', qty: 5 });
r = await A.post('/api/expand/branch', { country: 'NG' }); ok(r.status === 200 && r.state.branches.NG === 1, 'open a branch in Nigeria');
const incBefore = r.state.income_per_hour;
ok((await A.post('/api/expand/branch', { country: 'JP' })).status === 400, 'locked region branch refused');
r = await A.post('/api/expand/branch', { country: 'NG' }); ok(r.status === 200 && r.state.branches.NG === 2 && r.state.income_per_hour > incBefore, 'branch upgrade raises income');
const cand = await A.get('/api/expand/candidates?country=NG'); ok(Array.isArray(cand.rows), 'partner candidates endpoint works');
ok((await A.post('/api/expand/partner', { country: 'PK', company_id: 1 })).status === 400, 'partnering needs a branch in that country');

console.log('\nUploads');
const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.alloc(80)]);
const up = await fetch(BASE + '/api/media/logo', { method: 'POST', headers: { 'content-type': 'image/png', cookie: A.cookie }, body: png });
const upj = await up.json(); ok(up.status === 200 && /^\/media\//.test(upj.url), 'logo upload accepted');
const got = await fetch(BASE + upj.url); ok(got.status === 200 && got.headers.get('content-type') === 'image/png', 'uploaded logo is served');
const bad1 = await fetch(BASE + '/api/media/banner', { method: 'POST', headers: { 'content-type': 'image/svg+xml', cookie: A.cookie }, body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' + ' '.repeat(200)) });
ok(bad1.status === 400, 'SVG and other non-image uploads are refused');
ok((await A.get('/api/state')).me.logo_url === upj.url, 'profile now uses the uploaded logo');

console.log('\nWelcome-back honesty');
await setUser(`a${tag}@test.dev`, { last_seen: new Date(Date.now() - 3 * 3600e3), last_accrual: new Date(Date.now() - 3 * 3600e3) });
const cashA = Number((await q(`SELECT cash::float8 c FROM users WHERE id=$1`, [ids[0]])).rows[0].c);
const back = await A.get('/api/state?init=1');
ok(back.away_earned > 0 && back.cash >= cashA + back.away_earned * 0.999, 'coins earned while away are already inside the balance');

console.log('\nLive revenue, offers, sell business, stop loss, sample companies');
{
  const F = await mk(`Feature Works ${tag}`, `f${tag}@test.dev`);
  const fid = (await F.get('/api/state')).me.id;
  await setUser(`f${tag}@test.dev`, { cash: 1e12, lifetime_earned: 1e6 });
  for (const id of ['africa-1', 'africa-3', 'africa-4', 'africa-6']) await F.post('/api/assets/buy', { asset_id: id });
  let st = await F.get('/api/state');
  const sum = Object.values(st.rev).reduce((t, r) => t + r.ph, 0);
  ok(Object.keys(st.rev).length === 4 && Math.abs(sum - st.income_per_hour) < 1e-6 * st.income_per_hour, 'each business reports its own income and they add up to the total');
  await F.post('/api/expand/branch', { country: 'NG' });
  let r = await F.post('/api/expand/offer', { offer_id: 'NG-1' });
  ok(r.status === 200 && r.state.offers.length === 1 && r.state.income_per_hour > st.income_per_hour, 'investor offer adds its own income stream');
  ok((await F.post('/api/expand/offer', { offer_id: 'NG-3' })).status === 400, 'offer above branch level is refused');
  ok((await F.get('/api/expand/offers?country=NG')).rows.length === 3, 'three offers per country');
  ok((await F.get('/api/expand/ranked?scope=world')).rows.length > 0, 'ranked players list loads');
  r = await F.post('/api/business/sell');
  ok(r.status === 200 && r.state.rank_boosts === 1 && Object.keys(r.state.owned).length === 0, 'selling the business gives a rank boost');
  ok((await F.post('/api/business/sell')).status === 400, 'cannot sell again straight away');
  await setUser(`f${tag}@test.dev`, { lifetime_earned: 5 });
  r = await F.post('/api/rank/boost');
  ok(r.status === 200 && r.from > r.to && r.state.rank_boosts === 0, 'rank boost moves you up');
  await setUser(`f${tag}@test.dev`, { lifetime_earned: 9e30 });
  await q(`UPDATE users SET rank_boosts=1 WHERE id=$1`, [fid]);
  r = await F.post('/api/rank/boost');
  ok(r.status === 400 && (await F.get('/api/state')).rank_boosts === 1, 'boost is kept when you are already #1');
  const mk0 = await F.get('/api/market'); const s0 = mk0.stocks[0];
  await setUser(`f${tag}@test.dev`, { cash: 1e6 });
  await F.post('/api/trade', { stock_id: s0.id, side: 'buy', shares: 5 });
  ok((await F.post('/api/trade/orders', { stock_id: s0.id, stop_loss: s0.price * 2 })).status === 400, 'stop loss above price refused');
  r = await F.post('/api/trade/orders', { stock_id: s0.id, stop_loss: s0.price * 0.5, take_profit: s0.price * 2 });
  ok(r.status === 200 && r.state.holdings[s0.id].stop_loss > 0, 'stop loss and take profit saved');
  const smp = (await q(`SELECT COUNT(*)::int n FROM users WHERE is_sample AND country = ANY($1)`, [['GB', 'IT', 'NG', 'TR', 'PK']])).rows[0].n;
  ok(smp === 5, 'five sample companies exist');
}

console.log(`\n${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);
