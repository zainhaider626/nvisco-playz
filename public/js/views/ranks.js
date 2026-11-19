import { $, esc, money, flag, avatar, ic, dur, debounce } from '../util.js';
import { S, ACT, countryName } from '../store.js';
import { get } from '../api.js';
import { sheet, toast, titleBlock } from '../ui.js';

let root, tab = 'league', country = null, token = 0, last = null;
let ex = { q: '', industry: '', country: '', open: false, page: 0, rows: [], more: false };

function segHtml() {
  const t = (id, label, icon) => `<button data-act="rtab" data-id="${id}" class="${tab === id ? 'on' : ''}" aria-label="${label}">${ic(icon, 16)}<span>${label}</span></button>`;
  return `<div class="seg">${t('league', 'League', 'shield')}${t('country', 'Country', 'flag')}${t('world', 'World', 'globe')}${t('explore', 'Find', 'search')}</div>`;
}

function rowHtml(r, kind, i, d) {
  const cls = ['li', r.me ? 'me' : ''].join(' ');
  const prize = kind === 'league' && r.prize > 0 ? `<span class="chip gold" style="height:20px">${ic('trophy', 11, '', 2.4)}+${money(r.prize)}</span>` : '';
  const m = r.rank <= 3 ? ` m${r.rank}` : '';
  return `<div class="${cls}" data-act="company" data-id="${r.id}" style="min-height:62px"><div class="rk${m}">${r.rank}</div>${avatar(r.company_name, r.logo_url, 38)}
    <div class="grow"><div class="row g8" style="gap:6px"><b class="ell">${esc(r.company_name)}</b>${r.featured ? '<span class="feat">AD</span>' : ''}</div>
    <div class="t-xs muted row" style="gap:6px;margin-top:2px">${flag(r.country)}<span>${kind === 'league' ? '' : esc(r.tier)}</span>${prize}</div></div>
    <div class="num b ${r.me ? '' : ''}" style="white-space:nowrap">${money(r.score)}</div></div>`;
}

async function load() {
  const my = ++token;
  const box = $('#board', root); if (!box) return;
  try {
    if (tab === 'league') {
      const d = await get('/api/leaderboard/league'); if (my !== token) return; last = d;
      const rows = d.rows.map((r, i) => {
        let pre = '';
        if (d.promote && r.rank === d.promote + 1) pre = `<div class="divider">${ic('arrow-up', 12, '', 2.6)} PROMOTION ZONE</div>`;
        if (d.demote && r.rank === d.size - d.demote + 1 && r.rank > d.promote + 1) pre = `<div class="divider dn">${ic('chevron-down', 12, '', 2.6)} DEMOTION ZONE</div>`;
        return pre + rowHtml(r, 'league', i, d);
      }).join('');
      box.innerHTML = `<div class="card row between" style="margin-bottom:12px"><div class="row" style="gap:14px"><span class="tile lg" style="--t:${d.league.color}">${ic('shield', 26, '', 1.8)}</span>
          <div><div class="t-lg b" style="color:${d.league.color}">${esc(d.league.name)} League</div><div class="t-sm muted num" id="lend">Ends in ${dur(new Date(d.ends_at) - Date.now())}</div></div></div>
          <button class="iconbtn" data-act="league-info" aria-label="How leagues work">${ic('info', 19)}</button></div><div class="group">${rows}</div>`;
    } else {
      const url = tab === 'country' ? `/api/leaderboard/country?code=${country || ''}` : '/api/leaderboard/world';
      const d = await get(url); if (my !== token) return; last = d;
      if (tab === 'country' && !country) country = S.st.me.country.trim();
      const sel = tab === 'country' ? `<select id="cSel" style="margin-bottom:12px">${S.countries.map(c => `<option value="${c.code}" ${c.code === country ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';
      box.innerHTML = sel + (d.rows.length ? `<div class="group">${d.rows.map((r, i) => rowHtml(r, tab, i, d)).join('')}</div>` : '<div class="card center muted">Nobody here yet. Be the first.</div>')
        + (d.me ? `<div class="center dim" style="margin:6px 0">···</div><div class="group">${rowHtml(d.me, tab, 0, d)}</div>` : '')
        + `<div class="t-xs dim center" style="margin-top:12px">${d.total.toLocaleString('en-US')} companies · ranked by total earned</div>`;
      const cs = $('#cSel', box); if (cs) cs.addEventListener('change', () => { country = cs.value; load(); });
    }
  } catch (e) { if (my === token) box.innerHTML = `<div class="card center muted">${esc(e.message)}</div>`; }
}

// ------------------------------------------------------------------ explore (find companies, clients and work)
function exploreShell() {
  const inds = S.data.industries.map(i => `<option ${ex.industry === i ? 'selected' : ''}>${esc(i)}</option>`).join('');
  return `<div class="card" style="margin-bottom:12px"><div style="position:relative"><span style="position:absolute;left:13px;top:15px;color:var(--tx3)">${ic('search', 18)}</span><input id="exq" style="padding-left:40px" placeholder="Search companies, services, skills" value="${esc(ex.q)}"></div>
    <div class="row mt12" style="gap:8px"><select id="exi"><option value="">All industries</option>${inds}</select>
    <select id="exc"><option value="">All countries</option>${S.countries.map(c => `<option value="${c.code}" ${ex.country === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <label class="row mt12" style="cursor:pointer"><input type="checkbox" id="exo" ${ex.open ? 'checked' : ''}><span class="b">Only companies open for work</span></label></div><div id="exres"></div>`;
}
function exRows() {
  if (!ex.rows.length) return '<div class="card center muted">No companies found. Try a different search.</div>';
  return `<div class="group">` + ex.rows.map(r => `<div class="li" data-act="company" data-id="${r.id}" style="align-items:flex-start;padding:14px">${avatar(r.company_name, r.logo_url, 44)}
    <div class="grow"><div class="row g8" style="gap:6px"><b class="ell">${esc(r.company_name)}</b>${r.featured ? '<span class="feat">FEATURED</span>' : ''}${flag(r.country)}</div>
    <div class="t-sm muted ell">${esc(r.tagline || r.industry)}</div><div class="row g8 wrap mt8" style="gap:6px"><span class="chip">${esc(r.industry)}</span>${r.open_for_work ? `<span class="chip pos">${ic('briefcase', 12)}Open for work</span>` : ''}</div></div></div>`).join('') + '</div>'
    + (ex.more ? '<button class="btn block mt12" data-act="ex-more">Load more</button>' : '');
}
async function exSearch(reset = true) {
  if (reset) { ex.page = 0; }
  const p = new URLSearchParams({ q: ex.q, industry: ex.industry, country: ex.country, open: ex.open ? '1' : '', page: ex.page });
  try { const d = await get('/api/directory?' + p); ex.rows = reset ? d.rows : ex.rows.concat(d.rows); ex.more = d.more; const b = $('#exres', root); if (b) b.innerHTML = exRows(); }
  catch (e) { toast(e.message, 'err'); }
}
function drawExplore() {
  $('#board', root).innerHTML = exploreShell();
  const run = debounce(() => exSearch(true), 350);
  $('#exq', root).addEventListener('input', (e) => { ex.q = e.target.value; run(); });
  $('#exi', root).addEventListener('change', (e) => { ex.industry = e.target.value; exSearch(true); });
  $('#exc', root).addEventListener('change', (e) => { ex.country = e.target.value; exSearch(true); });
  $('#exo', root).addEventListener('change', (e) => { ex.open = e.target.checked; exSearch(true); });
  exSearch(true);
}

ACT.rtab = (el) => { location.hash = '#/ranks/' + el.dataset.id; };
ACT['ex-more'] = () => { ex.page++; exSearch(false); };
ACT['league-info'] = () => sheet(`<h2 style="margin:4px 0 10px;font-size:20px">How leagues work</h2><ul class="muted" style="line-height:1.7;padding-left:18px;margin:0 0 18px">
  <li>You compete with ~${30} companies in your league for one week.</li><li>Your score is how much you <b>earn</b> this week (taps, passive income and trading profit).</li>
  <li>The top <b>${S.data.leaguePromote}</b> move up a league. The bottom ${S.data.leagueDemote} drop down.</li>
  <li>The top 5 also win a cash prize worth ${S.data.leagueRewardHours.join('h / ')}h of your own hourly income.</li>
  <li>Leagues: ${S.data.leagues.map(l => `<b style="color:${l.color}">${l.name}</b>`).join(' → ')}</li></ul><button class="btn primary block" data-close>Got it</button>`);

export function mount(r, arg) {
  root = r; tab = ['league', 'country', 'world', 'explore'].includes(arg) ? arg : 'league';
  root.innerHTML = `${titleBlock('Rankings', 'Live · updated every minute')}${segHtml()}<div id="board" style="margin-top:12px"><div class="stack">${'<div class="sk" style="height:62px;border-radius:14px"></div>'.repeat(6)}</div></div>`;
  tab === 'explore' ? drawExplore() : load();
  return {
    update(ev) {
      if (!root.isConnected) return;
      if (ev === 'tick' && tab !== 'explore') load();
      if (ev === 'sec' && tab === 'league' && last?.ends_at) { const e = $('#lend', root); if (e) e.textContent = 'Ends in ' + dur(new Date(last.ends_at) - Date.now()); }
    },
  };
}
