// Economy simulator: how long does it take a player to progress, for different play styles?
// Usage: node scripts/simulate.mjs
import { ASSETS } from '../server/gamedata.js';
import * as E from '../server/economy.js';

function run({ name, sessionsPerDay, sessionMinutes, tapsPerSec = 4, days = 60 }) {
  let cash = E.START_CASH, tapLevel = 0, owned = new Map(), items = new Set();
  let income = 0, run_earned = 0, stars = 0;
  const milestones = {};
  const sessionGap = 24 * 60 / sessionsPerDay;
  let awayMinutes = 0;
  for (let minute = 0; minute < days * 24 * 60; minute++) {
    const inSession = (minute % sessionGap) < sessionMinutes;
    if (inSession) awayMinutes = 0; else awayMinutes++;
    const earningPassive = awayMinutes < 8 * 60;
    let gain = 0;
    if (earningPassive) gain += income / 60;
    if (inSession) {
      const tv = E.tapValue({ tapLevel, tapBonus: 0, stars, incomePerHour: income, boosted: false });
      gain += tv * tapsPerSec * 60;
    }
    cash += gain; run_earned += gain;
    if (inSession) {
      // spend greedily: next unowned asset in ladder order, or tap upgrade if cheap relative
      for (let guard = 0; guard < 50; guard++) {
        const next = ASSETS.find(a => !owned.has(a.id));
        const tapCost = E.tapUpgradeCost(tapLevel);
        let bought = false;
        if (next && cash >= E.assetBaseCost(next)) {
          cash -= E.assetBaseCost(next); owned.set(next.id, 1); bought = true;
        } else if (tapLevel < E.TAP_LEVEL_MAX && cash >= tapCost && tapCost < (next ? E.assetBaseCost(next) * 0.5 : Infinity)) {
          cash -= tapCost; tapLevel++; bought = true;
        }
        if (!bought) break;
        income = E.derive({ owned, items, stars, tapLevel }).incomePerHour;
      }
      const n = owned.size;
      for (const m of [1, 5, 10, 20, 40, 60, 80, 100, 120]) if (n >= m && !(m in milestones)) milestones[m] = (minute / 1440).toFixed(1);
    }
  }
  console.log(name.padEnd(34), 'assets owned (day reached):', JSON.stringify(milestones));
}
run({ name: 'Hardcore: 4 sessions/day x 10min', sessionsPerDay: 4, sessionMinutes: 10 });
run({ name: 'Regular: 3 sessions/day x 6min', sessionsPerDay: 3, sessionMinutes: 6 });
run({ name: 'Casual: 1 session/day x 5min', sessionsPerDay: 1, sessionMinutes: 5 });
