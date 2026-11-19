// Shared client state. `st` is the last full server snapshot; `cash` is the live, ticking balance shown on the card.
export const S = {
  data: null, countries: [], st: null, market: null,
  cash: 0, pendingTaps: 0, tabTimers: [],
};
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = (ev, payload) => subs.forEach(fn => fn(ev, payload));

export function setState(st) {
  S.st = st; S.revAt = Date.now();
  S.cash = st.cash + S.pendingTaps * tapValueNow();
  emit('state');
}
export const boostActive = () => !!(S.st?.tap.boost_until && new Date(S.st.tap.boost_until).getTime() > Date.now());
export const tapValueNow = () => (S.st ? S.st.tap.base * (boostActive() ? 2 : 1) : 0);
export const countryName = (code) => S.countries.find(c => c.code === String(code).trim())?.name || code;
export const ACT = {};   // delegated click handlers: <button data-act="name">
export const regionUnlocked = (idx) => idx === 0 || (S.st.region_counts[S.data.regions[idx - 1].id] || 0) >= S.data.regionUnlockOwned;
export const regionOwned = (id) => S.st.region_counts[id] || 0;

/** Live numbers for one owned business: income per second and everything it has earned so far. */
export function revLive(id) {
  const r = S.st?.rev?.[id]; if (!r) return { ps: 0, earned: 0 };
  return { ps: r.ph / 3600, earned: r.earned + r.ph / 3600 * Math.max(0, (Date.now() - (S.revAt || Date.now())) / 1000) };
}
