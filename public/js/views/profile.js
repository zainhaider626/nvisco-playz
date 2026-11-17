import { $, esc, money, usdMicro, flag, avatar, ic, fmt, tile } from '../util.js';
import { S, ACT, countryName, emit } from '../store.js';
import { get, post } from '../api.js';
import { doAction, refreshState } from '../core.js';
import { pageHeader, sheet, toast, section } from '../ui.js';
import { pickAndUpload, removeMedia } from '../media.js';
import { NUMFMT, setNumMode } from '../util.js';

let root, rw = null;

const METHODS = [['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['bank', 'Bank transfer'], ['paypal', 'PayPal'], ['wise', 'Wise'], ['other', 'Other']];

function walletHtml() {
  const R = S.st.rewards, cfg = S.data.config;
  if (!R.enabled) return `<div class="card"><div class="b">Rewards</div><p class="muted t-sm" style="margin:4px 0 0">Real-money rewards are switched off right now.</p></div>`;
  const used = Math.min(1, R.units_today / R.unit_cap);
  const bal = R.balance_micro, min = R.min_withdraw_micro;
  const ageOk = (Date.now() - new Date(S.st.me.created_at)) / 86400000 >= cfg.minAccountAgeDays;
  const pending = rw?.withdrawals?.find(w => w.status === 'pending');
  const can = R.eligible && bal >= min && ageOk && !pending;
  const why = !R.eligible ? 'This account is not eligible for rewards.' : pending ? 'You have a withdrawal waiting for review.' : !ageOk ? `Withdrawals unlock ${cfg.minAccountAgeDays} days after sign-up.` : bal < min ? `Reach ${usdMicro(min)} to withdraw.` : '';
  const kind = (l) => l.kind === 'reward' ? 'Tap reward ' + esc(l.ref.replace('day:', '')) : l.kind === 'withdraw_hold' ? 'Withdrawal requested' : l.kind === 'withdraw_refund' ? 'Withdrawal returned' : esc(l.kind);
  return `<div class="card hl" id="wallet"><div class="row between"><div><div class="t-sm muted">Rewards wallet</div><div class="num goldt" style="font-size:32px;font-weight:700;letter-spacing:-.03em">${usdMicro(bal)}</div></div>${tile('wallet', '#f4b740', 'lg')}</div>
    <div class="mt16"><div class="row between t-sm"><span class="muted">Reward taps today</span><b class="num">${R.units_today.toLocaleString('en-US')} / ${R.unit_cap.toLocaleString('en-US')}</b></div>
    <div class="bar" style="margin:8px 0 12px"><i style="width:${used * 100}%;background:var(--gold)"></i></div>
    <div class="row between t-sm"><span class="muted">Estimated today</span><b class="goldt num">${usdMicro(R.est_today_micro)}</b></div>
    <div class="row between t-sm mt8"><span class="muted">Today's pool</span><span class="num">${usdMicro(R.pool_today_micro)} · ${R.players_today} players</span></div></div>
    <details style="margin-top:14px"><summary class="t-sm b" style="cursor:pointer;color:var(--gold)">How rewards work</summary>
      <ul class="t-sm muted" style="line-height:1.6;padding-left:18px;margin:8px 0 0">
        <li>Each day a <b>reward pool</b> is funded by a share of ad revenue and company sponsorships.</li>
        <li>Every valid tap (up to ${R.unit_cap.toLocaleString('en-US')} a day) earns you a share of that pool when the day closes.</li>
        <li>A tap is never worth more than ${usdMicro(cfg.maxRateMicro)} and the pool is never overspent. If few people play, unused money rolls over.</li>
        <li>Bots, auto-clickers and duplicate accounts forfeit rewards. Every payout is reviewed by a person.</li></ul></details>
    <div style="margin-top:16px">${can ? `<button class="btn gold block" data-act="withdraw-open">Withdraw ${usdMicro(bal)}</button>` : `<button class="btn block off">Withdraw</button><div class="t-xs dim center" style="margin-top:8px">${esc(why)}</div>`}</div>
    ${rw?.ledger?.length ? `<div class="mt16"><div class="t-xs muted b" style="text-transform:uppercase;letter-spacing:.06em">Recent activity</div>${rw.ledger.slice(0, 8).map(l => `<div class="kv t-sm"><span>${kind(l)}</span><b class="num ${l.micro >= 0 ? 'pos' : ''}">${l.micro >= 0 ? '+' : '-'}${usdMicro(Math.abs(l.micro))}</b></div>`).join('')}</div>` : ''}
    ${rw?.withdrawals?.length ? `<div class="mt16"><div class="t-xs muted b" style="text-transform:uppercase;letter-spacing:.06em">Withdrawals</div>${rw.withdrawals.map(w => `<div class="kv t-sm"><span class="num">${usdMicro(w.micro)} · ${esc(w.method)}</span><span class="chip ${w.status === 'paid' ? 'pos' : w.status === 'pending' ? 'gold' : ''}">${esc(w.status)}</span></div>`).join('')}</div>` : ''}</div>`;
}

function creditsHtml() {
  return `<div class="card row between" data-act="open-credits" style="cursor:pointer"><div class="row" style="gap:12px">${tile('banknote', '#ffffff')}<div><div class="b">Game credits</div><div class="t-sm muted">Add money to bid for the top spot</div></div></div><b class="num t-lg">${usdMicro(S.st.credits_micro || 0)}</b></div>`;
}
function prestigeHtml() {
  const p = S.st.prestige, can = p.gain >= 1;
  return `<div class="card"><div class="row" style="gap:12px">${tile('star', '#f4b740')}<div class="grow"><div class="b">Prestige</div><div class="t-sm muted num">${p.stars} stars · ×${p.mult_now.toFixed(2)} income and taps · ${p.count} resets</div></div></div>
    <p class="t-sm muted" style="margin:12px 0">Reset your cash, assets and stocks for permanent stars. Trophies, rank and rewards are kept. Each star adds +${S.data.config.prestigeStarBonus * 100}% income and tap power.</p>
    ${can ? `<button class="btn gold block" data-act="prestige">Prestige now · +${p.gain} stars → ×${p.mult_next.toFixed(2)}</button>` : `<button class="btn block off">Earn ${money(p.min_run)} in a run to prestige</button><div class="t-xs dim center" style="margin-top:8px">This run: ${money(S.st.run_earned)}</div>`}</div>`;
}

function brandHtml() {
  const m = S.st.me;
  return `<div class="card"><div class="b t-lg">Logo and banner</div><p class="t-sm muted" style="margin:4px 0 12px">Shown on rankings, your public page and the top-spot auction. Use them to market your business.</p>
    <div class="banner" style="${m.banner_url ? `background-image:url('${esc(m.banner_url)}')` : ''}"></div>
    <div class="row" style="margin-top:-30px;padding:0 12px;gap:12px;align-items:flex-end">${avatar(m.company_name, m.logo_url, 64)}<div class="grow"></div></div>
    <div class="row mt12" style="gap:8px"><button class="btn grow sm" data-act="up-logo">${ic('sparkles', 15)}Change logo</button><button class="btn grow sm" data-act="up-banner">${ic('layout-grid', 15)}Change banner</button></div>
    ${m.logo_url || m.banner_url ? `<div class="row mt8" style="gap:8px">${m.logo_url ? '<button class="btn ghost sm grow" data-act="rm-logo">Remove logo</button>' : ''}${m.banner_url ? '<button class="btn ghost sm grow" data-act="rm-banner">Remove banner</button>' : ''}</div>` : ''}</div>`;
}

function formHtml() {
  const m = S.st.me, inds = S.data.industries.map(i => `<option ${m.industry === i ? 'selected' : ''}>${esc(i)}</option>`).join('');
  return `<form class="card" id="pform" novalidate><div class="b t-lg">Company profile</div><p class="t-sm muted" style="margin:4px 0 0">Shown on leaderboards and on your public page, which makes it free marketing for your brand.</p>
    <label class="f">Company name</label><input name="company_name" maxlength="32" value="${esc(m.company_name)}">
    <label class="f">Tagline</label><input name="tagline" maxlength="80" value="${esc(m.tagline)}" placeholder="What you do in one line">
    <div class="row" style="gap:10px;align-items:flex-start"><div class="grow"><label class="f">Country</label><select name="country">${S.countries.map(c => `<option value="${c.code}" ${c.code === m.country.trim() ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="grow"><label class="f">City</label><input name="city" maxlength="60" value="${esc(m.city)}"></div></div>
    <label class="f">Industry</label><select name="industry">${inds}</select>
    <label class="f">Website</label><input name="website" value="${esc(m.website)}" placeholder="https://yourcompany.com">
    <label class="f">About your company</label><textarea name="description" maxlength="500">${esc(m.description)}</textarea>
    <label class="f">Contact (email, WhatsApp or link)</label><input name="contact" value="${esc(m.contact)}">
    <label class="row" style="margin-top:16px;cursor:pointer"><input type="checkbox" name="open_for_work" ${m.open_for_work ? 'checked' : ''}><span class="b">We're open for work or hiring</span></label>
    <label class="f">What are you looking for?</label><input name="looking_for" maxlength="120" value="${esc(m.looking_for)}" placeholder="e.g. PCB design clients, React developers">
    <div class="err" id="perr"></div><button class="btn primary block" type="submit">Save profile</button></form>`;
}

function draw() {
  const st = S.st, m = st.me, link = `${location.origin}/c/${m.id}`;
  let hap = true; try { hap = localStorage.getItem('te_haptics') !== '0'; } catch { /* ignore */ }
  root.innerHTML = `${pageHeader('Profile')}
    <div class="card"><div class="row" style="gap:14px">${avatar(m.company_name, m.logo_url, 56)}<div class="grow"><div class="b t-lg ell">${esc(m.company_name)}</div>
      <div class="t-sm muted row" style="gap:6px;flex-wrap:wrap">${flag(m.country)}<span>${esc(countryName(m.country))}</span><span>·</span><span>${esc(m.tier.name)}</span><span>·</span><span>${esc(S.data.leagues[m.league].name)} League</span></div></div></div>
      <div class="statgrid mt16"><div><small>Total earned</small><b class="num">${money(st.score)}</b></div><div><small>Net worth</small><b class="num">${money(st.net_worth)}</b></div><div><small>Taps</small><b class="num">${st.tap_total.toLocaleString('en-US')}</b></div></div>
      <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="copy" data-v="${esc(link)}">${ic('copy', 17)}Copy link</button><a class="btn grow" href="/c/${m.id}" target="_blank" rel="noopener">${ic('external-link', 17)}Public page</a></div></div>
    <div class="stack mt16">${creditsHtml()}${walletHtml()}${prestigeHtml()}${brandHtml()}${formHtml()}
    ${section('Account')}
    <div class="group" style="margin-top:-4px"><div class="li" style="min-height:52px"><span class="muted">Email</span><span class="grow" style="text-align:right">${esc(m.email)}</span></div>
      <div class="li" style="min-height:52px"><span class="muted">Member since</span><span class="grow" style="text-align:right">${new Date(m.created_at).toLocaleDateString()}</span></div>
      <div class="li" style="min-height:52px"><span class="grow">Number style<br><small class="muted t-xs">${NUMFMT.mode === 'south' ? 'K, L (lakh), Cr (crore)' : 'K, M, B, T, Qa, Qi, Sx…'}</small></span><div class="seg" style="width:150px"><button class="${NUMFMT.mode === 'intl' ? 'on' : ''}" data-act="numfmt" data-m="intl">K M B</button><button class="${NUMFMT.mode === 'south' ? 'on' : ''}" data-act="numfmt" data-m="south">L Cr</button></div></div>
      <label class="li" style="min-height:52px;cursor:pointer"><span class="grow">Haptic feedback</span><input type="checkbox" id="hap" ${hap ? 'checked' : ''}></label>
      ${m.is_admin ? `<a class="li" href="/credits.html" style="min-height:52px"><span class="grow">Photo credits</span>${ic('chevron-right', 18)}</a>
      <a class="li" href="/admin.html" style="min-height:52px"><span class="grow">Admin panel</span>${ic('chevron-right', 18)}</a>` : ''}
      <button class="li" data-act="logout" style="width:100%;min-height:52px;color:var(--red);text-align:left">${ic('log-out', 18)}<span class="grow">Log out</span></button></div></div>`;
  const f = $('#pform', root);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f)); fd.open_for_work = f.open_for_work.checked;
    try { await post('/api/profile', fd); await refreshState(); toast('Profile saved', 'good'); } catch (err) { $('#perr', root).textContent = err.message; }
  });
  $('#hap', root).addEventListener('change', (e) => { try { localStorage.setItem('te_haptics', e.target.checked ? '1' : '0'); } catch { /* ignore */ } });
}

async function loadWallet() { try { rw = await get('/api/rewards'); if (root.isConnected) draw(); } catch { /* ignore */ } }

ACT.numfmt = (el) => { setNumMode(el.dataset.m); location.reload(); };
ACT['up-logo'] = () => pickAndUpload('logo', () => refreshState());
ACT['up-banner'] = () => pickAndUpload('banner', () => refreshState());
ACT['rm-logo'] = () => removeMedia('logo', () => refreshState());
ACT['rm-banner'] = () => removeMedia('banner', () => refreshState());
ACT['open-credits'] = () => { location.hash = '#/wallet'; };
ACT.copy = async (el) => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Link copied', 'good'); } catch { toast(el.dataset.v); } };
ACT.logout = async () => { await post('/api/auth/logout'); location.hash = ''; location.reload(); };
ACT.prestige = () => {
  const p = S.st.prestige;
  const s = sheet(`<div class="center"><span class="tile lg" style="--t:#f4b740;margin:0 auto 12px">${ic('star', 28)}</span><h2 style="margin:0 0 8px;font-size:20px">Prestige now?</h2><p class="muted t-sm" style="margin:0 0 20px">You will lose your cash, assets, stocks and tap upgrades, and gain <b class="goldt">${p.gain} stars</b> (×${p.mult_next.toFixed(2)} income and taps). Trophies, ranking, league and wallet are kept.</p>
    <div class="row"><button class="btn grow" data-close>Cancel</button><button class="btn gold grow" id="pgo">Prestige</button></div></div>`, { center: true });
  $('#pgo', s.el).addEventListener('click', async () => { s.close(); const r = await doAction('/api/prestige', {}, { ok: 'Prestige complete' }); if (r) draw(); });
};
ACT['withdraw-open'] = () => {
  const R = S.st.rewards;
  const s = sheet(`<h2 style="margin:4px 0 4px;font-size:20px">Withdraw ${usdMicro(R.balance_micro)}</h2><p class="t-sm muted" style="margin:0">A person reviews every payout, usually within 1 to 3 days.</p>
    <label class="f">Method</label><select id="wm">${METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <label class="f">Account number / email</label><input id="wa" placeholder="e.g. 03xx-xxxxxxx or you@email.com"><div class="err" id="werr"></div>
    <button class="btn primary block" id="wgo" style="margin-top:8px">Request withdrawal</button>`);
  $('#wgo', s.el).addEventListener('click', async () => {
    try { await post('/api/rewards/withdraw', { method: $('#wm', s.el).value, account: $('#wa', s.el).value }); s.close(); toast('Withdrawal requested', 'good'); await refreshState(); await loadWallet(); }
    catch (e) { $('#werr', s.el).textContent = e.message; }
  });
};

export function mount(r, arg) {
  root = r; draw(); loadWallet();
  if (arg === 'wallet') setTimeout(() => $('#wallet', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  return { update(ev) { /* keep the form untouched while typing; only refresh wallet numbers on state */ if (ev === 'state' && root.isConnected && !root.contains(document.activeElement)) draw(); } };
}
