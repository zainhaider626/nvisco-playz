import { $, esc, fmt, money, ic, syncAfford, tile, ITEM_ICON, ITEM_COLOR } from '../util.js';
import { S, ACT } from '../store.js';
import { doAction } from '../core.js';
import { pageHeader, titleBlock, section } from '../ui.js';
import { itemArt } from '../art.js';

let root, catId = null;
const owned = (cat) => S.st.items.filter(id => id.startsWith(cat + '-')).length;
const effectText = (c) => `+${(c.per * 100).toFixed(c.per * 100 % 1 ? 1 : 0)}% ${c.effect === 'income' ? 'income' : 'tap power'} each`;

/** the best item you own in a category (or its first one) is shown as the category picture */
const showcase = (cat) => { const list = S.data.items.filter(i => i.cat === cat), mine = list.filter(i => S.st.items.includes(i.id)); return mine.length ? mine[mine.length - 1] : list[0]; };

function drawList() {
  const total = S.data.items.length, have = S.st.items.length;
  root.innerHTML = `${titleBlock('Collection', `${have} of ${total} items owned`)}
    <div class="statgrid"><div><small>Income bonus</small><b class="pos num">+${(S.st.income_bonus * 100).toFixed(1)}%</b></div><div><small>Tap bonus</small><b class="pos num">+${(S.st.tap_bonus * 100).toFixed(1)}%</b></div><div><small>Completed sets</small><b class="num">${S.data.itemCategories.filter(c => owned(c.id) === c.count).length} / ${S.data.itemCategories.length}</b></div></div>
    ${section('Categories')}
    <div class="group">${S.data.itemCategories.map(c => { const n = owned(c.id);
      return `<div class="li" data-act="cat-open" data-id="${c.id}" style="min-height:76px"><div class="arttile" style="width:92px">${itemArt(showcase(c.id))}</div>
        <div class="grow"><div class="row between"><b>${esc(c.name)}</b><span class="t-sm muted num">${n} / ${c.count}</span></div>
        <div class="t-sm muted" style="margin:1px 0 8px">${effectText(c)}</div><div class="bar"><i style="width:${n / c.count * 100}%;background:${ITEM_COLOR[c.id]}"></i></div></div>${ic('chevron-right', 18)}</div>`; }).join('')}</div>`;
}

function itemCard(it, c) {
  const has = S.st.items.includes(it.id);
  return `<div class="icard ${has ? 'have' : ''} ${it.legendary ? 'leg' : ''}">${itemArt(it)}
    <div class="info"><div class="b ell">${esc(it.name)}</div>
    <div class="t-xs ${has ? 'pos' : 'muted'}">${it.legendary ? 'Legendary · ' : ''}${effectText(c)}</div>
    ${has ? `<span class="chip pos" style="align-self:flex-start">${ic('check', 13, '', 2.6)}Owned</span>` : `<button class="price ${S.cash >= it.price ? '' : 'off'}" data-act="buy-item" data-id="${it.id}" data-cost="${it.price}" style="width:100%">${money(it.price)}</button>`}</div></div>`;
}

function drawCat() {
  const c = S.data.itemCategories.find(x => x.id === catId); if (!c) { location.hash = '#/items'; return; }
  const list = S.data.items.filter(i => i.cat === c.id), n = owned(c.id);
  root.innerHTML = `${pageHeader(c.name)}
    <div class="card"><div class="row" style="gap:14px">${tile(ITEM_ICON[c.id], ITEM_COLOR[c.id], 'lg')}<div class="grow"><div class="t-xl b num">${n}<span class="muted t-md"> / ${c.count}</span></div>
      <div class="t-sm muted">Complete the set for <b class="goldt">+${Math.round(c.set * 100)}% ${c.effect === 'income' ? 'income' : 'tap power'}</b></div></div></div>
      <div class="bar mt12"><i style="width:${n / c.count * 100}%;background:${ITEM_COLOR[c.id]}"></i></div></div>
    <div class="igrid mt12">${list.map(i => itemCard(i, c)).join('')}</div>`;
}

ACT['cat-open'] = (el) => { location.hash = '#/items/' + el.dataset.id; };
ACT['buy-item'] = async (el) => { const r = await doAction('/api/items/buy', { item_id: el.dataset.id }, { ok: 'Added to your collection' }); if (r) catId ? drawCat() : drawList(); };

export function mount(r, arg) {
  root = r; catId = arg || null;
  catId ? drawCat() : drawList();
  return { update(ev) { if (!root.isConnected) return; if (ev === 'state') (catId ? drawCat() : drawList()); if (ev === 'sec') syncAfford(root); } };
}
