// HEXEMBER — difficulty.js
// Four difficulties as multipliers on one Radiant base curve.
// Ember (easy), Radiant (normal, default), Eclipse (hard),
// Awakening (hardest: bigger multipliers + boss Phase 4).

import { DIFFICULTY } from './config.js';

export const DIFFICULTY_IDS = ['ember', 'radiant', 'eclipse', 'awakening'];

// Returns a fresh copy of the difficulty table entry.
// Unknown ids fall back to Radiant (never throw on bad input).
export function getDifficulty(id) {
  const d = DIFFICULTY[id] || DIFFICULTY.radiant;
  return { ...d };
}

// One-line human description per difficulty (title screen / Awakening
// '!' tooltip). Concrete numbers, so the player sees the real difference.
export function difficultyBlurb(id) {
  switch (id) {
    case 'ember':
      return 'Ember — mudah: musuh -30% HP, -15% cepat, Lumen +25%, Core 12 HP.';
    case 'radiant':
      return 'Radiant — normal: kurva dasar, Core 10 HP.';
    case 'eclipse':
      return 'Eclipse — sulit: musuh +40% HP, +15% cepat, Lumen -10%, drain +25%.';
    case 'awakening':
      return 'Awakening — tersulit: musuh +60% HP, +25% cepat, drain Pylon 2x, Lumen -25%, bos mendapat Fase 4 (Eclipse Unbound).';
    default:
      return difficultyBlurb('radiant');
  }
}
