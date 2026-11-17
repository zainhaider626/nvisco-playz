import { esc, usdMicro, fmt } from './util.js';
import { get, post } from './api.js';
import { toast } from './ui.js';

const root = document.getElementById('root');
let tab = 'overview';
const U = (m) => usdMicro(m);
const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
const tabs = () => `<div class="tabs">${[['overview', 'Overview'], ['deposits', 'Deposits'], ['payments', 'Connect wallet'], ['auction', 'Auction'], ['withdrawals', 'Withdrawals'], ['money', 'Funding & sponsors'], ['players', 'Players']].map(([id, l]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;

async function overview() {
  const s = await get('/api/admin/stats');
  const rate = s.pool_units_today ? Math.min(s.settings.maxRateMicroPerTap, s.pool_today_micro / s.pool_units_today) : s.settings.maxRateMicroPerTap;
  return `<div class="grid">
    <div class="stat"><span class="muted small">Players</span><b>${s.users.players}</b><span class="tiny muted">${s.users.bots} demo bots</span></div>
    <div class="stat"><span class="muted small">New (24h)</span><b>${s.users.new_24h}</b></div>
    <div class="stat"><span class="muted small">Active (24h)</span><b>${s.users.active_24h}</b></div>
    <div class="stat"><span class="muted small">Tappers today</span><b>${s.taps_today.players}</b><span class="tiny muted">${s.taps_today.units.toLocaleString()} reward taps</span></div>
    <div class="stat"><span class="muted small">Pool today (${esc(s.day)})</span><b>${U(s.pool_today_micro)}</b></div>
    <div class="stat"><span class="muted small">Value of a tap now</span><b>$${(rate / 1e6).toFixed(6)}</b><span class="tiny muted">cap $${(s.settings.maxRateMicroPerTap / 1e6).toFixed(6)}</span></div>
    <div class="stat"><span class="muted small">Pending withdrawals</span><b>${s.withdrawals.pending}</b><span class="tiny muted">${U(s.withdrawals.pending_micro)}</span></div>
    <div class="stat"><span class="muted small">Paid out ever</span><b>${U(s.withdrawals.paid_micro)}</b></div></div>
  <div class="card" style="margin-top:14px"><div class="h3">Money in (all time)</div><div class="row" style="gap:18px;flex-wrap:wrap;margin-top:6px">${s.funds.map(f => `<span><span class="muted small">${esc(f.source)}</span> <b>${U(f.micro)}</b></span>`).join('') || '<span class="muted">Nothing yet</span>'}
    <span><span class="muted small">Sponsor budgets received</span> <b>${U(s.sponsors.budget_micro)}</b></span><span><span class="muted small">Sponsor clicks / views</span> <b>${s.sponsors.clicks} / ${s.sponsors.impressions}</b></span></div>
    <p class="tiny muted" style="margin:8px 0 0">Settings: ad revenue share ${s.settings.adRevenueShare * 100}% · max $${(s.settings.maxRateMicroPerTap / 1e6).toFixed(6)}/tap · ${s.settings.dailyUnitCap} taps/player/day · day ends at midnight ${esc(s.settings.tz)} · rewards ${s.settings.rewardsEnabled ? 'ON' : 'OFF'} (change in .env)</p></div>
  <div class="card scroll" style="margin-top:14px"><div class="row between"><div class="h3">Daily settlements</div><button class="btn sm" data-act="settle">Settle finished days now</button></div>
    <table><tr><th>Day</th><th>Pool</th><th>Tap units</th><th>Paid</th><th>Rolled over</th><th>Players</th></tr>
    ${s.settlements.map(r => `<tr><td>${esc(r.day)}</td><td>${U(r.pool_micro)}</td><td>${r.units_total.toLocaleString()}</td><td>${U(r.paid_micro)}</td><td>${U(r.rollover_micro)}</td><td>${r.players}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No days settled yet.</td></tr>'}</table></div>`;
}

async function withdrawals() {
  const out = [];
  for (const st of ['pending', 'paid', 'rejected']) { const r = await get('/api/admin/withdrawals?status=' + st); out.push([st, r.rows]); }
  return out.map(([st, rows]) => `<div class="card scroll" style="margin-bottom:14px"><div class="h3" style="text-transform:capitalize">${st} (${rows.length})</div>
    <table><tr><th>When</th><th>Company</th><th>Amount</th><th>Method / account</th><th>Signals</th>${st === 'pending' ? '<th></th>' : '<th>Note</th>'}</tr>
    ${rows.map(w => `<tr><td>${ago(w.created_at)}</td><td><b>${esc(w.company_name)}</b><br><span class="muted tiny">${esc(w.email)} · ${esc(w.country)}</span></td><td><b>${U(w.micro)}</b></td><td>${esc(w.method)}<br><span class="tiny">${esc(w.account)}</span></td>
      <td class="tiny">age ${Math.floor((Date.now() - new Date(w.joined)) / 86400000)}d · ${w.taps.toLocaleString()} taps${w.same_network > 2 ? `<br><b style="color:var(--red)">${w.same_network} accounts on this network</b>` : ''}</td>
      ${st === 'pending' ? `<td><button class="btn primary sm" data-act="wd" data-id="${w.id}" data-do="pay">Mark paid</button> <button class="btn danger sm" data-act="wd" data-id="${w.id}" data-do="reject">Reject</button></td>` : `<td class="tiny">${esc(w.admin_note)}</td>`}</tr>`).join('') || `<tr><td colspan="6" class="muted">None</td></tr>`}</table>
    ${st === 'pending' ? '<p class="tiny muted" style="margin:8px 0 0">Send the money yourself (JazzCash / Easypaisa / bank / PayPal), then press <b>Mark paid</b>. Rejecting returns the money to the player\'s wallet.</p>' : ''}</div>`).join('');
}

async function money() {
  const sp = await get('/api/admin/sponsors');
  return `<div class="two"><form class="card" id="fAds"><div class="h3">Add ad revenue</div><p class="small muted">Enter the gross ad income you earned (AdSense, AdMob…). Only your configured share goes to the players' pool.</p>
      <label class="f">Gross revenue (USD)</label><input name="amount_usd" type="number" step="0.01" min="0" placeholder="e.g. 12.50"><div class="err" id="e1"></div><button class="btn primary block" style="margin-top:6px">Add to today's pool</button></form>
    <form class="card" id="fManual"><div class="h3">Top up the pool yourself</div><p class="small muted">Adds the full amount (e.g. a launch giveaway). The pool can never be overspent.</p>
      <label class="f">Amount (USD)</label><input name="amount_usd" type="number" step="0.01" min="0" placeholder="e.g. 5"><div class="err" id="e2"></div><button class="btn block" style="margin-top:6px">Add to today's pool</button></form></div>
  <form class="card" id="fSp" style="margin-top:14px"><div class="h3">New sponsor campaign</div><p class="small muted">A company pays you a budget. Part of it (reward share) funds the player pool evenly over the campaign, the rest is yours. The sponsor is featured in the app.</p>
    <div class="inline form-grid"><div><label class="f">Sponsor name</label><input name="name" required></div><div><label class="f">Company ID in game (optional)</label><input name="company_id" type="number"></div></div>
    <div class="inline"><div><label class="f">Website</label><input name="url" placeholder="https://…"></div><div><label class="f">Tagline</label><input name="tagline" maxlength="90"></div></div>
    <div class="inline"><div><label class="f">Budget paid to you (USD)</label><input name="budget_usd" type="number" step="0.01" min="0" required></div><div><label class="f">Reward share (0-1)</label><input name="reward_share" type="number" step="0.05" min="0" max="1" value="0.6"></div><div><label class="f">Days</label><input name="days" type="number" min="1" max="365" value="30"></div></div>
    <div class="err" id="e3"></div><button class="btn primary" style="margin-top:8px">Create campaign</button></form>
  <div class="card scroll" style="margin-top:14px"><div class="h3">Campaigns</div><table><tr><th>Name</th><th>Budget</th><th>Share</th><th>Dates</th><th>Clicks / views</th><th>Status</th></tr>
    ${sp.rows.map(s => `<tr><td><b>${esc(s.name)}</b>${s.company ? `<br><span class="tiny muted">company: ${esc(s.company)}</span>` : ''}</td><td>${U(s.budget_micro)}</td><td>${Math.round(s.reward_share * 100)}%</td><td class="tiny">${esc(String(s.starts_on))} → ${esc(String(s.ends_on))}</td><td>${s.clicks} / ${s.impressions}</td>
      <td>${esc(s.status)} ${s.status === 'active' ? `<button class="btn sm" data-act="sp" data-id="${s.id}" data-st="paused">Pause</button>` : s.status === 'paused' ? `<button class="btn sm" data-act="sp" data-id="${s.id}" data-st="active">Resume</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No campaigns yet</td></tr>'}</table></div>`;
}

async function players(q = '') {
  const r = await get('/api/admin/users?q=' + encodeURIComponent(q));
  return `<div class="card"><input id="pq" placeholder="Search company or email" value="${esc(q)}"></div><div class="card scroll" style="margin-top:12px"><table><tr><th>Company</th><th>Joined</th><th>Last seen</th><th>Earned</th><th>Taps</th><th>Wallet</th><th>Status</th></tr>
    ${r.rows.map(u => `<tr><td><b>${esc(u.company_name)}</b> <span class="tiny muted">#${u.id} · ${esc(u.country)}</span><br><span class="tiny muted">${esc(u.email)}</span></td><td class="tiny">${ago(u.created_at)}</td><td class="tiny">${ago(u.last_seen)}</td><td>$${fmt(u.score)}</td>
      <td>${u.taps.toLocaleString()}${u.same_network > 2 ? `<br><b class="tiny" style="color:var(--red)">${u.same_network} accts on network</b>` : ''}</td><td>${U(u.balance_micro)}<br><button class="btn sm" data-act="cr" data-id="${u.id}">Credits</button></td>
      <td>${esc(u.status)}<br>${u.status !== 'frozen' ? `<button class="btn sm" data-act="us" data-id="${u.id}" data-st="frozen">Freeze</button>` : `<button class="btn sm" data-act="us" data-id="${u.id}" data-st="active">Unfreeze</button>`} ${u.status !== 'banned' ? `<button class="btn danger sm" data-act="us" data-id="${u.id}" data-st="banned">Ban</button>` : `<button class="btn sm" data-act="us" data-id="${u.id}" data-st="active">Restore</button>`}</td></tr>`).join('')}</table>
    <p class="tiny muted" style="margin:8px 0 0">Frozen players keep playing but earn no rewards. Banned players are removed from boards and cannot log in.</p></div>`;
}


const topbar = () => `<div class="topbar"><div class="row" style="gap:10px"><img src="/brand/logo-white.png" alt=""><h1 class="h2" style="font-size:20px">Admin panel</h1></div>
  <div class="row" style="gap:8px"><a class="btn sm" href="/">Switch to my game</a><button class="btn sm danger" data-act="alogout">Log out</button></div></div>`;

function loginScreen(err = '') {
  root.innerHTML = `<div class="login"><div style="text-align:center"><img src="/brand/logo-white.png" alt="" style="height:44px"><div style="font-size:13px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;margin-top:10px">Nvisco Playz</div></div>
    <form class="card" id="alogin" style="margin-top:22px" novalidate><div class="h3">Owner sign-in</div><p class="small muted" style="margin:4px 0 0">Admin username and password.</p>
      <label class="f">Username</label><input name="username" autocomplete="username" autocapitalize="off"><label class="f">Password</label><input name="password" type="password" autocomplete="current-password">
      <div class="err" id="aerr">${esc(err)}</div><button class="btn primary block" style="margin-top:6px;height:50px">Sign in</button></form>
    <p class="fine"><a href="/">← Back to the game</a></p></div>`;
  document.getElementById('alogin').addEventListener('submit', async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try { await post('/api/admin/login', d); render(); } catch (er) { document.getElementById('aerr').textContent = er.message; }
  });
}

async function deposits() {
  const out = [];
  for (const st of ['pending', 'approved', 'rejected']) out.push([st, (await get('/api/admin/deposits?status=' + st)).rows]);
  const rev = await get('/api/admin/revenue');
  return `<div class="grid" style="margin-bottom:14px"><div class="stat"><span class="muted small">Deposits approved</span><b>${U(rev.deposits_approved_micro)}</b></div><div class="stat"><span class="muted small">Waiting to check</span><b>${U(rev.deposits_pending_micro)}</b><span class="tiny muted">${rev.deposits_pending} request(s)</span></div><div class="stat"><span class="muted small">Auction revenue</span><b>${U(rev.auction_revenue_micro)}</b><span class="tiny muted">${rev.auction_wins} wins</span></div></div>`
    + out.map(([st, rows]) => `<div class="card scroll" style="margin-bottom:14px"><div class="h3" style="text-transform:capitalize">${st} (${rows.length})</div>
    <table><tr><th>When</th><th>Company</th><th>Amount</th><th>Method / transaction ID</th>${st === 'pending' ? '<th></th>' : '<th>Note</th>'}</tr>
    ${rows.map(d => `<tr><td>${ago(d.created_at)}</td><td><b>${esc(d.company_name)}</b><br><span class="muted tiny">${esc(d.email)} · ${esc(d.country)}</span></td><td><b>${U(d.usd_micro)}</b><br><span class="tiny muted">Rs ${Math.round(d.local)}</span></td>
      <td>${esc(d.method)}<br><b class="tiny" style="user-select:all">${esc(d.txn_id)}</b>${d.sender ? `<br><span class="tiny muted">from ${esc(d.sender)}</span>` : ''}</td>
      ${st === 'pending' ? `<td><button class="btn primary sm" data-act="dep" data-id="${d.id}" data-do="approve">Approve</button> <button class="btn danger sm" data-act="dep" data-id="${d.id}" data-do="reject">Reject</button></td>` : `<td class="tiny">${esc(d.admin_note)}</td>`}</tr>`).join('') || '<tr><td colspan="5" class="muted">None</td></tr>'}</table>
    ${st === 'pending' ? '<p class="tiny muted" style="margin:8px 0 0">Check the transaction ID in your Easypaisa / SadaPay app. Approve only when the money has arrived: it adds the credits to the player at once.</p>' : ''}</div>`).join('');
}

async function payments() {
  const p = await get('/api/admin/payments');
  const ms = p.methods.length ? p.methods : [{ id: 'easypaisa', label: 'Easypaisa', account_title: '', account_number: '', enabled: true }, { id: 'sadapay', label: 'SadaPay', account_title: '', account_number: '', enabled: true }];
  return `<form class="card" id="fPay"><div class="h3">Connect your wallet</div><p class="small muted">Players pay into the accounts below, then submit the transaction ID. You approve each deposit in the Deposits tab. (An automatic payment gateway can replace this later without changing the game.)</p>
    ${ms.map((m, i) => `<div class="card" style="margin-top:10px;background:var(--s2)"><div class="inline"><div><label class="f">Name shown</label><input name="label_${i}" value="${esc(m.label)}"></div><div><label class="f">Account title</label><input name="title_${i}" value="${esc(m.account_title)}"></div><div><label class="f">Account number</label><input name="num_${i}" value="${esc(m.account_number)}" inputmode="numeric"></div></div>
      <div class="inline"><div><label class="f">Short note (optional)</label><input name="note_${i}" value="${esc(m.note || '')}"></div><label class="row" style="gap:8px;flex:none"><input type="checkbox" name="en_${i}" ${m.enabled !== false ? 'checked' : ''}><span class="small">Accept</span></label></div><input type="hidden" name="id_${i}" value="${esc(m.id)}"></div>`).join('')}
    <input type="hidden" name="count" value="${ms.length}">
    <div class="inline" style="margin-top:12px"><div><label class="f">PKR per $1</label><input name="rate" type="number" step="0.01" value="${p.pkr_per_usd}"></div><div><label class="f">Min deposit (USD)</label><input name="min" type="number" step="0.5" value="${p.min_usd}"></div><div><label class="f">Max deposit (USD)</label><input name="max" type="number" step="1" value="${p.max_usd}"></div></div>
    <label class="f">Instructions shown to players</label><textarea name="instr" maxlength="400">${esc(p.instructions)}</textarea>
    <div class="err" id="epay"></div><button class="btn primary" style="margin-top:8px">Save payment accounts</button></form>`;
}

async function auctionTab() {
  const a = await get('/api/admin/auction');
  return `<div class="card"><div class="row between"><div><div class="h3">Open auction #${a.open.id}</div><div class="small muted">Ends ${new Date(a.open.ends_at).toLocaleString()} · ${a.open.total_bidders} bidder(s) · top ${a.open.slots} win</div></div><button class="btn sm" data-act="closeauc">Close now and start next</button></div>
    <table style="margin-top:8px"><tr><th>#</th><th>Company</th><th>Bid</th></tr>${a.open.bids.map(b => `<tr><td>${b.rank}</td><td><b>${esc(b.company.company_name)}</b> <span class="tiny muted">${esc(b.company.country)}</span></td><td>${U(b.amount_micro)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No bids yet</td></tr>'}</table></div>
    <div class="card scroll" style="margin-top:14px"><div class="h3">Recent winners</div><table><tr><th>Auction</th><th>#</th><th>Company</th><th>Paid</th></tr>${a.recent.map(r => `<tr><td>#${r.auction_id}</td><td>${r.rank}</td><td><b>${esc(r.company.company_name)}</b></td><td>${U(r.amount_micro)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None yet</td></tr>'}</table>
    <p class="tiny muted" style="margin:8px 0 0">Auction length, slots and minimum bid are set in the server settings (.env).</p></div>`;
}

async function render() {
  try {
    const me = await get('/api/admin/me');
    if (!me.admin) { loginScreen(me.configured ? '' : 'Admin login is not configured on the server (set ADMIN_USERNAME and ADMIN_PASSWORD).'); return; }
    const body = tab === 'overview' ? await overview() : tab === 'deposits' ? await deposits() : tab === 'payments' ? await payments() : tab === 'auction' ? await auctionTab() : tab === 'withdrawals' ? await withdrawals() : tab === 'money' ? await money() : await players();
    root.innerHTML = topbar() + tabs() + body;
    bindForms();
  } catch (e) {
    if (e.status === 401 || e.status === 403) loginScreen('Your admin session ended. Sign in again.');
    else root.innerHTML = `<div class="card redt">${esc(e.message)}</div>`;
  }
}

function bindForms() {
  const bind = (id, errId, fn) => { const f = document.getElementById(id); if (!f) return; f.addEventListener('submit', async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); try { await fn(d); toast('Saved', 'good'); render(); } catch (err) { document.getElementById(errId).textContent = err.message; } }); };
  bind('fAds', 'e1', (d) => post('/api/admin/funds', { amount_usd: d.amount_usd, source: 'ads' }));
  bind('fManual', 'e2', (d) => post('/api/admin/funds', { amount_usd: d.amount_usd, source: 'manual' }));
  bind('fSp', 'e3', (d) => post('/api/admin/sponsors', d));
  bind('fPay', 'epay', (d) => post('/api/admin/payments', { pkr_per_usd: d.rate, min_usd: d.min, max_usd: d.max, instructions: d.instr, methods: Array.from({ length: Number(d.count) }, (_, i) => ({ id: d['id_' + i], label: d['label_' + i], account_title: d['title_' + i], account_number: d['num_' + i], note: d['note_' + i], enabled: d['en_' + i] === 'on' })) }));
  const pq = document.getElementById('pq');
  if (pq) { let t; pq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const keep = pq.value; root.innerHTML = tabs() + await players(keep); bindForms(); const n = document.getElementById('pq'); n.focus(); n.setSelectionRange(keep.length, keep.length); }, 400); }); }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  try {
    if (b.dataset.act === 'wd') { const note = prompt(b.dataset.do === 'pay' ? 'Payment reference (optional)' : 'Reason for rejecting (shown to the player)') ?? null; if (note === null) return; await post(`/api/admin/withdrawals/${b.dataset.id}/${b.dataset.do}`, { note }); }
    if (b.dataset.act === 'sp') await post(`/api/admin/sponsors/${b.dataset.id}/status`, { status: b.dataset.st });
    if (b.dataset.act === 'us') await post(`/api/admin/users/${b.dataset.id}/status`, { status: b.dataset.st });
    if (b.dataset.act === 'alogout') { await post('/api/admin/logout'); toast('Logged out'); render(); return; }
    if (b.dataset.act === 'dep') { const note = prompt(b.dataset.do === 'approve' ? 'Note (optional)' : 'Reason for rejecting (shown to the player)') ?? null; if (note === null) return; await post(`/api/admin/deposits/${b.dataset.id}/${b.dataset.do}`, { note }); }
    if (b.dataset.act === 'closeauc') { if (!confirm('Close the auction now? Winners are charged and everyone else is refunded.')) return; await post('/api/admin/auction/close-now'); }
    if (b.dataset.act === 'cr') { const v = prompt('Add credits in USD (negative to remove)'); if (!v) return; await post(`/api/admin/users/${b.dataset.id}/credits`, { amount_usd: Number(v), note: 'admin adjustment' }); }
    if (b.dataset.act === 'settle') { const r = await post('/api/admin/settle'); toast(r.settled.length ? `Settled ${r.settled.length} day(s)` : 'Nothing to settle'); }
    render();
  } catch (err) { toast(err.message, 'err'); }
});

render();
