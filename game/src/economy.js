// HEXEMBER — economy.js
// Lumen: income, spending, Pylon drain, passive Core trickle.
// Pure logic (no DOM); brownout / relight live in light.js.

import { ECONOMY } from './config.js';
import { applyBrownout, restorePylons } from './light.js';

// Award Lumen (kill drops, boss drops, any gain). Counts toward the
// end-of-run "Lumen collected" stat. Returns the new balance.
export function awardLumen(state, amount) {
  state.lumen = (state.lumen || 0) + amount;
  state.lumenCollected = (state.lumenCollected || 0) + amount;
  return state.lumen;
}

// Spend Lumen. Returns true on success, false when the balance is too low
// (balance untouched).
export function spendLumen(state, amount) {
  if ((state.lumen || 0) < amount) return false;
  state.lumen -= amount;
  return true;
}

// Per-tick economy: Core passive +2/s, Sanctuary Spire +2/s each,
// minus 1/s per lit Pylon (x difficulty drain multiplier).
// At 0 Lumen the outermost Pylon browns out; at >= 5 Lumen pylons relight.
// Runs in build / wave / boon phases only (not title / victory / gameover).
export function tickEconomy(state, dt) {
  if (!state || !(dt > 0)) return state;
  if (state.phase !== 'build' && state.phase !== 'wave' && state.phase !== 'boon') {
    return state;
  }
  const drainMul = state.difficulty?.drainMul ?? 1;
  let income = ECONOMY.passiveLumenPerSec;
  for (const t of state.towers || []) {
    if (t.type === 'pylonSuar' && t.evo === 'sanctuarySpire') {
      income += 2;
    }
  }
  const litPylons = (state.pylons || []).filter((p) => p.lit).length;
  const drain = litPylons * ECONOMY.pylonDrainPerSec * drainMul;
  state.lumen = Math.max(0, (state.lumen || 0) + (income - drain) * dt);
  if (state.lumen <= 0) applyBrownout(state);
  else restorePylons(state);
  return state;
}
