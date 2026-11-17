// HEXEMBER — wave director (Builder A, v2).
// 10 waves, same compositions as v1 (counts, delays, intervals and total
// spawn counts are unchanged — only the LANE split changes).
// Every spawn group carries a `path` field ('A' | 'B'), deterministic:
//   Wave 1: every group on A (teach the main lane before the fork matters).
//   Waves 2+: skitterers on A; stalkers (w3+) on B; snuffers (w4+) on A;
//   brutes (w6+) on B; the boss (w10) on A.
//   Waves 5+: the skitterer group SPLITS into two groups — A count
//   ceil(n/2), B count floor(n/2), B delay = A delay + 0.5s so two
//   enemies never share the spawn tile on the same tick.
// Composition does not depend on difficulty (verified: identical defs
// for ember / radiant / eclipse / awakening); difficulty only scales
// HP/speed downstream in the sim.

export const WAVE_COUNT = 10;
export const BOSS_WAVE = 10;
export const BOON_WAVES = [3, 6, 9];

// Spawn-group counts per wave (v1 numbers, untouched):
//   skitterer 4 + 2n, stalker n - 1 (w3+), snuffer n - 2 (w4+),
//   brute floor((n - 4) / 2) (w6+), boss 1 (w10 only).
export function buildWave(n, difficulty) {
  const wave = Math.min(WAVE_COUNT, Math.max(1, (n | 0) || 1));
  void difficulty; // composition is difficulty-independent by design
  const spawns = [];

  const skitCount = 4 + 2 * wave;
  if (wave >= 5) {
    // Split skitterer swarm across both lanes (7+7 at w5, 12+12 at w10).
    const aCount = Math.ceil(skitCount / 2);
    const bCount = Math.floor(skitCount / 2);
    spawns.push({ role: 'skitterer', count: aCount, delay: 0, interval: 0.7, path: 'A' });
    spawns.push({ role: 'skitterer', count: bCount, delay: 0.5, interval: 0.7, path: 'B' });
  } else {
    spawns.push({ role: 'skitterer', count: skitCount, delay: 0, interval: 0.7, path: 'A' });
  }

  if (wave >= 3) {
    spawns.push({ role: 'stalker', count: wave - 1, delay: 4, interval: 0.9, path: 'B' });
  }
  if (wave >= 4) {
    spawns.push({ role: 'snuffer', count: wave - 2, delay: 8, interval: 1, path: 'A' });
  }
  if (wave >= 6) {
    spawns.push({ role: 'brute', count: Math.floor((wave - 4) / 2), delay: 12, interval: 2, path: 'B' });
  }
  if (wave === BOSS_WAVE) {
    spawns.push({ role: 'boss', count: 1, delay: 2, interval: 0, path: 'A' });
  }

  return { n: wave, spawns };
}
