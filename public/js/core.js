import { S, setState, emit, tapValueNow } from './store.js';
import { get, post } from './api.js';
import { toast } from './ui.js';

export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

export async function refreshState() {
  await settleTaps();
  const st = await get('/api/state');
  setState(st);
  return st;
}

// ---------------------------------------------------------------- taps: optimistic locally, confirmed in batches
let unsent = 0, inflight = null, timer = null;
let tokens = 40, tokenAt = performance.now();
const BUCKET = 40, REFILL = 7.5;   // slightly stricter than the server (8/s) so the two never disagree

export function tryTap() {
  const now = performance.now();
  tokens = Math.min(BUCKET, tokens + (now - tokenAt) / 1000 * REFILL); tokenAt = now;
  if (tokens < 1) return false;
  tokens -= 1; unsent++; S.pendingTaps++; S.cash += tapValueNow();
  if (unsent >= 25) flush(); else if (!timer) timer = setTimeout(flush, 600);
  return true;
}

async function flush() {
  clearTimeout(timer); timer = null;
  if (inflight || !unsent) return;
  const n = unsent; unsent = 0;
  inflight = (async () => {
    try {
      const r = await post('/api/tap', { n });
      S.pendingTaps -= n;
      const q = r.quick; const st = S.st;
      st.cash = q.cash; st.score = q.score; st.season_earned = q.season_earned; st.net_worth = q.net_worth; st.tap_total += r.accepted;
      if (r.units != null) st.rewards.units_today = r.units;
      S.cash = q.cash + S.pendingTaps * tapValueNow();
      emit('quick');
    } catch (e) {
      S.pendingTaps -= n;
      if (e.status !== 401) { toast(e.message, 'err'); get('/api/state').then(setState).catch(() => {}); }
    } finally { inflight = null; if (unsent) timer = setTimeout(flush, 300); }
  })();
  await inflight;
}
export async function settleTaps() { while (unsent || inflight) { if (unsent && !inflight) await flush(); else await inflight; } }

// ---------------------------------------------------------------- generic server action
export async function doAction(path, body, { ok } = {}) {
  try {
    await settleTaps();
    const r = await post(path, body);
    if (r.state) setState(r.state);
    if (ok) toast(ok, 'good');
    return r;
  } catch (e) { toast(e.message, 'err'); return null; }
}
