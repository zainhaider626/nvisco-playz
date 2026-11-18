import { esc, fmt, money, avatar, ic } from '../util.js';
import { S, ACT } from '../store.js';
import { pageHeader } from '../ui.js';

let root;
const RING = [4, 5, 6, 7];
const FXN = { 1: 3, 3: 3, 2: 1, 4: 4, 7: 4 };
const BLURB = ['Where every business starts.', 'Sky-blue rewards for growing merchants.', 'Midnight navy with a gold shimmer.', 'Soft silk finish for serious magnates.', 'Royal purple with a golden glow.', 'Matte black with a rainbow edge.', 'Deep green and gold, for sovereigns.', 'The black card. Few ever hold it.'];

function face(t, st, state) {
  const id = Math.min(7, t.id), digits = String(10000 + t.id * 1111).slice(-4);
  return `<div class="pcard-w t${id} ${RING.includes(id) ? 'ring' : ''} ${state}"><div class="pcard face">
      <div class="fx">${'<i></i>'.repeat(FXN[id] || 0)}</div>
      <div class="top"><div class="co">${avatar(st.me.company_name, st.me.logo_url, 26)}<b class="ell">${esc(st.me.company_name)}</b></div><div class="chipsvg">${ic('nfc', 22, '', 1.8)}</div></div>
      <div class="emv"></div>
      <div class="pan num">••••  ••••  ••••  ${digits}</div>
      <div class="foot"><div class="holder"><small>Card holder</small><b class="ell">${esc(st.me.company_name)}</b></div>
        <div class="tier">${esc(t.name)}<small>${esc(t.card)}</small></div></div>
      ${state === 'locked' ? `<div class="lockov">${ic('lock', 26, '', 2)}<b>Earn ${money(t.min)} in total</b><span>to unlock</span></div>` : ''}
    </div></div>`;
}

function draw() {
  const st = S.st, tiers = S.data.tiers, cur = st.me.tier.id, next = tiers[cur + 1];
  const score = st.score, p = next ? Math.max(0, Math.min(1, (score - tiers[cur].min) / (next.min - tiers[cur].min))) : 1;
  root.innerHTML = `${pageHeader('Your cards')}
    <p class="muted t-sm" style="margin:-2px 2px 12px">Your card upgrades as your total earnings grow. Swipe to see every card you can unlock.</p>
    <div class="cardrail" id="rail">${tiers.map(t => {
      const state = t.id < cur ? 'done' : t.id === cur ? 'now' : 'locked';
      return `<div class="cardslot" data-t="${t.id}">${face(t, st, state)}<div class="cardcap"><b>${esc(t.name)}</b> ${state === 'now' ? '<span class="chip pos">Your card</span>' : state === 'done' ? '<span class="chip">Unlocked</span>' : `<span class="chip gold">${ic('lock', 11, '', 2.4)} ${fmt(t.min)}</span>`}<div class="t-sm muted">${esc(BLURB[t.id] || '')}</div></div></div>`;
    }).join('')}</div>
    <div class="card mt12">${next ? `<div class="row between"><div><div class="t-sm muted">Next card</div><div class="b t-lg">${esc(next.card)}</div></div><span class="chip">${esc(next.name)}</span></div>
      <div class="bar mt12"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
      <div class="row between t-xs muted mt8 num"><span>${money(score)} earned</span><span>${money(next.min)} needed</span></div>`
      : `<div class="b t-lg">You hold the top card</div><p class="muted t-sm" style="margin:4px 0 0">There is nothing above the ${esc(tiers[cur].card)}. Keep growing your empire.</p>`}</div>
    <button class="btn block mt12" data-act="open-profile">${ic('user', 17)}Open my profile</button>`;
  const slot = root.querySelector(`.cardslot[data-t="${cur}"]`); const rail = root.querySelector('#rail');
  if (slot && rail) requestAnimationFrame(() => { rail.scrollLeft = slot.offsetLeft - (rail.clientWidth - slot.clientWidth) / 2; });
}

export function mount(r) { root = r; draw(); return { update(ev) { if (ev === 'state' && root.isConnected) draw(); } }; }
