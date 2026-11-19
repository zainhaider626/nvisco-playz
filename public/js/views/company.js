import { esc, money, flag, avatar, ic } from '../util.js';
import { S, countryName } from '../store.js';
import { get } from '../api.js';
import { sheet, toast } from '../ui.js';

export async function openCompany(id) {
  let c;
  try { c = await get('/api/company/' + encodeURIComponent(id)); } catch (e) { toast(e.message, 'err'); return; }
  const regs = S.data.regions;
  const link = `${location.origin}/c/${c.id}`;
  const contact = c.contact || '';
  const contactHref = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact) ? `mailto:${contact}` : /^https?:\/\//i.test(contact) ? contact : '';
  const web = /^https?:\/\//i.test(c.website) ? c.website : '';
  const s = sheet(`
    <div class="row" style="gap:14px">${avatar(c.company_name, c.logo_url, 60)}
      <div class="grow"><div class="row g8" style="gap:6px"><b class="t-xl ell" style="letter-spacing:-.02em">${esc(c.company_name)}</b>${c.demo ? '<span class="demo">SAMPLE</span>' : ''}${c.featured ? '<span class="feat">FEATURED</span>' : ''}</div>
      <div class="muted t-sm">${esc(c.tagline || c.industry)}</div></div><button class="iconbtn" data-close aria-label="Close">${ic('x', 18)}</button></div>
    <div class="row wrap mt16" style="gap:6px"><span class="chip">${flag(c.country)}${esc(c.city ? c.city + ', ' : '')}${esc(countryName(c.country))}</span>
      <span class="chip">${esc(c.industry)}</span>${c.open_for_work ? `<span class="chip pos">${ic('briefcase', 12)}Open for work</span>` : ''}</div>
    ${c.description ? `<p style="line-height:1.55;white-space:pre-wrap;margin:16px 0 0" class="muted">${esc(c.description)}</p>` : ''}
    ${c.looking_for ? `<div class="card mt16"><div class="t-xs muted b" style="text-transform:uppercase;letter-spacing:.06em">Looking for</div><div class="b" style="margin-top:2px">${esc(c.looking_for)}</div></div>` : ''}
    <div class="group mt16" style="padding:0 14px">
      <div class="kv"><span>World rank</span><b class="num">#${c.world_rank.toLocaleString('en-US')}</b></div>
      <div class="kv"><span>${esc(countryName(c.country))} rank</span><b class="num">#${c.country_rank.toLocaleString('en-US')}</b></div>
      <div class="kv"><span>League</span><b style="color:${c.league.color}">${esc(c.league.name)}</b></div>
      <div class="kv"><span>Tier</span><b>${esc(c.tier.name)}</b></div>
      <div class="kv"><span>Total earned</span><b class="num">${money(c.score)}</b></div>
      <div class="kv"><span>Items · prestige</span><b class="num">${c.items} · ${c.prestige_count}</b></div></div>
    <div class="row wrap mt16" style="gap:6px">${regs.map(r => `<span class="chip"><span style="width:8px;height:8px;border-radius:50%;background:${r.color}"></span>${esc(r.name)} <b class="num" style="color:var(--tx)">${c.regions[r.id] || 0}/20</b></span>`).join('')}</div>
    <div class="row wrap mt16" style="gap:8px">
      ${web ? `<a class="btn primary grow" href="${esc(web)}" target="_blank" rel="nofollow noopener ugc">${ic('external-link', 17)}Website</a>` : ''}
      ${contactHref ? `<a class="btn grow" href="${esc(contactHref)}" target="_blank" rel="nofollow noopener ugc">${ic('mail', 17)}Contact</a>` : contact ? `<button class="btn grow" data-copy="${esc(contact)}">${ic('copy', 17)}${esc(contact)}</button>` : ''}
      <button class="btn grow" data-copy="${esc(link)}">${ic('share-2', 17)}Share</button></div>`);
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied to clipboard', 'good'); } catch { toast(b.dataset.copy); }
  });
}
