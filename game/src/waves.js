// HEXEMBER — waves.js
// Wave director: 10 waves, boss on wave 10, boon choice after waves 3/6/9.
// Compositions scale with wave number; difficulty only affects stats
// (via the difficulty object), not the spawn counts.

import { getDifficulty } from './difficulty.js';

export const WAVE_COUNT = 10;
export const BOSS_WAVE = 10;
export const BOON_WAVES = [3, 6, 9];

// buildWave(n, difficulty) -> { n, spawns: [{ role, count, delay, interval }] }
// delay = seconds after wave start before the first spawn of the group;
// interval = seconds between individual spawns in the group.
// difficulty may be an id string or a difficulty object (only used for
// future scaling; counts are difficulty-independent by design).
export function buildWave(n, difficulty) {
  const d =
    typeof difficulty === 'string'
      ? getDifficulty(difficulty)
      : difficulty || getDifficulty('radiant');
  void d; // counts are difficulty-independent; stats scale in the sim.
  const spawns = [];
  // Skitterers every wave: n*2+4 (wave 1 -> 6, wave 10 -> 24).
  spawns.push({ role: 'skitterer', count: n * 2 + 4, delay: 0, interval: 0.7 });
  // Stalkers from wave 3.
  if (n >= 3) {
    spawns.push({ role: 'stalker', count: n - 1, delay: 4, interval: 0.9 });
  }
  // Snuffers from wave 4.
  if (n >= 4) {
    spawns.push({ role: 'snuffer', count: n - 2, delay: 8, interval: 1.0 });
  }
  // Brutes from wave 6.
  if (n >= 6) {
    spawns.push({
      role: 'brute',
      count: Math.floor((n - 4) / 2),
      delay: 12,
      interval: 2.0,
    });
  }
  // Eclipse Sovereign on wave 10, with escorts.
  if (n === BOSS_WAVE) {
    spawns.push({ role: 'boss', count: 1, delay: 2, interval: 0 });
  }
  return { n, spawns };
}
