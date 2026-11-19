import { esc, money, ic } from '../util.js';
import { S, ACT } from '../store.js';
import { pageHeader } from '../ui.js';

let root;
function topics() {
  const c = S.data.config, off = c.offlineCapHours || 12, max = S.data.assetMaxLevel;
  return [
    ['pointer', 'Earn money by tapping', 'World tab', [
      'Open the <b>World</b> tab. The big black map is your tap pad.',
      'Tap anywhere on it. Every tap gives you money and small banknotes pop out.',
      'Keep tapping fast to build a <b>combo</b> (x5, x10…). Your score and balance grow right away.',
      'Press <b>Tap power</b> (the price button under the map) to earn more per tap.',
      'Press <b>Boost 2×</b> on the map for double taps for a couple of minutes.']],
    ['clock', 'Money while you are away', 'Automatic', [
      `Your businesses pay you every second, even when the app is closed, for up to <b>${off} hours</b>.`,
      'When you come back you see a <b>Welcome back</b> message. That money is already in your balance.',
      'Open the app at least once every few hours so you never miss earnings.']],
    ['crown', 'Your card (top of the screen)', 'World tab', [
      'The card at the top shows your balance, money per tap, per second and per hour.',
      'Tap the card to see <b>all card types</b>. Your card gets a new look when your total earnings pass the next level.',
      'Tap your company name on the card to open your profile.']],
    ['trending-up', 'Invest: buy and upgrade', 'Invest tab', [
      'Open <b>Invest</b> and choose a region (Africa is open first).',
      'Pick <b>Business</b>, <b>Industry</b> or <b>Property</b>, then press the price to buy. It starts earning at once.',
      `Press the arrow button to <b>upgrade</b>. Each business has up to <b>${max} levels</b>, and every level earns more.`,
      `Own ${S.data.regionUnlockOwned} assets in a region to unlock the next region. Own all ${S.data.perRegion} in one region for a +${Math.round(S.data.regionSetBonus * 100)}% income bonus.`,
      'Prices rise as you grow, and they rise faster once they pass one million.',
      'Each business shows its own income <b>per second</b> and what it has earned in total. The Live revenue box at the top of Invest adds them all up.',
      'Press <b>Sell your whole business</b> (bottom of Invest) to get cash back and a <b>Rank Boost</b>. A boost moves you up 5 places on the world ranking. If you are #1 it is saved for later.']],
    ['layout-grid', 'Items: real luxury collection', 'Items tab', [
      'Open <b>Items</b> and choose a group: cars, yachts, jets, watches, phones or art.',
      'Buy an item for its real-world price. Each item gives a permanent bonus to income or tapping.',
      'Collect every item in a group for an extra set bonus.']],
    ['chart-candlestick', 'Trade: company shares', 'Trade tab', [
      'Open <b>Trade</b> and tap a company to see its live price chart.',
      'The chart works like a trading app: price scale on the right, candles or a line, and a tag with the live price.',
      'Choose <b>Buy</b>, type how many shares (or use 25%, 50%, Max) and press the green button.',
      'After you buy, a white dotted line shows your <b>entry price</b>. Set a <b>Stop loss</b> (sells if the price falls) and a <b>Take profit</b> (sells when it rises) and the app sells for you.',
      'To sell, open the company, choose <b>Sell</b>, pick how many and press the red button.',
      `Prices move every few seconds. There is a ${S.data.stockFee * 100}% fee on each order. Buy low and sell high to profit.`]],
    ['flag', 'Expand: country branches and partners', 'Expand tab', [
      'Open <b>Expand</b> and pick a country that is open to you.',
      'Only the region you have reached is shown. Win assets there to open the next one.',
      'Press the price to <b>open a branch</b> and earn extra income from that country. Upgrade the branch for more.',
      'Press the handshake button. Take an <b>investor offer</b> from the app (each one pays its own income every second) or ask a company based there to partner with you.',
      'If no company is based in that country, the offers are your way in. You can also partner with top <b>ranked players</b> from the world or your country.']],
    ['trophy', 'Ranks and leagues', 'Ranks tab', [
      'Open <b>Ranks</b> to see the best companies in the world, in your country and in your league.',
      'Earn more to climb. Seasons end with prizes and promotion to a higher league.',
      'Tap any company to see its public page.']],
    ['megaphone', 'Top spot: show your company', 'Ranks tab → Top spot', [
      'Open the <b>Top spot</b> page (also on the World tab) to promote your company on the home screen.',
      'Add credits first (see Credits below), then press <b>Place bid</b>. The first bid starts at <b>$1</b> and each new bid must be higher.',
      'If someone outbids you, your credits come back to you. The winner is shown to every player.']],
    ['banknote', 'Credits: add money for bidding', 'World tab → Credits', [
      'Open <b>Credits</b> and choose your wallet (Easypaisa, SadaPay or another).',
      'Send the money, then type the <b>transaction ID from your receipt</b> and submit it.',
      'We check it and add the credits to your account. Credits are only for bids, they cannot be withdrawn.']],
    ['user', 'Profile: logo, banner and details', 'Tap your company name on the card', [
      'Open your profile to change your <b>logo</b> and <b>banner</b> and write your company description.',
      'Press <b>Copy link</b> to share your public company page with anyone.',
      `<b>Prestige</b> resets your progress for permanent stars. It unlocks after you earn ${money(c.prestigeMinRun)} in one run.`,
      'Change the number style (K M B or lakh/crore) and vibration here too.']],
  ];
}

function draw() {
  root.innerHTML = `${pageHeader('How to use')}
    <p class="muted t-sm" style="margin:-2px 2px 14px">Tap a section to open the steps. Everything is simple: tap, earn, buy, grow.</p>
    <div class="guide">${topics().map(([icon, title, where, steps], i) => `<details class="gd" ${i === 0 ? 'open' : ''}><summary><span class="tile" style="--t:#fff">${ic(icon, 19)}</span><span class="grow"><b>${esc(title)}</b><small>${esc(where)}</small></span>${ic('chevron-down', 18)}</summary>
      <ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol></details>`).join('')}</div>
    <p class="t-xs dim center" style="margin:18px 0 0">Still stuck? Tap your company name → Profile, or message us from the link on the Nvisco website.</p>`;
}

ACT.guide = () => { location.hash = '#/guide'; };
export function mount(r) { root = r; draw(); return {}; }
