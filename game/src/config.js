// HEXEMBER — config.js
// Pure constants / tuning. No imports, no DOM, no three.js.
// Single source of truth for the numbers shared by all builders (see brief).

export const TICK = 1 / 60;

// Tile size in world units (hex.js takes it as a parameter, default 1.0).
export const TILE_SIZE = 1.0;

export const PALETTE = {
  bg: '#0A0F1D',
  island: '#16213E',
  grid: '#1F4068',
  amber: '#FFB703',
  gold: '#FB8500',
  crimson: '#E63946',
  violet: '#9D4EDD',
};

// Difficulties: multipliers on the Radiant base curve.
// coreMaxHP is the Core HP for that difficulty (Ember 12, others 10).
export const DIFFICULTY = {
  ember: {
    id: 'ember', label: 'Ember', hpMul: 0.7, speedMul: 0.85,
    dropsMul: 1.25, drainMul: 0.75, coreMaxHP: 12, bossPhase4: false,
  },
  radiant: {
    id: 'radiant', label: 'Radiant', hpMul: 1.0, speedMul: 1.0,
    dropsMul: 1.0, drainMul: 1.0, coreMaxHP: 10, bossPhase4: false,
  },
  eclipse: {
    id: 'eclipse', label: 'Eclipse', hpMul: 1.4, speedMul: 1.15,
    dropsMul: 0.9, drainMul: 1.25, coreMaxHP: 10, bossPhase4: false,
  },
  awakening: {
    id: 'awakening', label: 'Awakening', hpMul: 1.6, speedMul: 1.25,
    dropsMul: 0.75, drainMul: 2.0, coreMaxHP: 10, bossPhase4: true,
  },
};

export const ECONOMY = {
  passiveLumenPerSec: 2, // Core reactor trickle (brownout recovery floor)
  pylonCost: 30,
  pylonDrainPerSec: 1, // per lit Beacon Pylon, while active
  pylonRadius: 2, // tiles of light around a lit Pylon
  coreLightRadius: 2, // permanent light around the Core, never browns out
};

// Build costs in Lumen. Beacon Pylon cost lives in ECONOMY.pylonCost.
export const TOWER_COSTS = {
  prism: 50,
  heliotrope: 75,
  lance: 100,
  mortar: 125,
  pylonSuar: 60,
};

// Evolution costs 75% of the tower's base cost.
export const EVO_COST_MUL = 0.75;

export const ABILITY = {
  // Solar Flare (Q): lights a dark area, reveals cloaked, stuns, and
  // breaks boss Phase-1 immunity for its duration.
  flare: { cooldown: 20, duration: 6, radius: 2, stun: 1.5 },
  // Overcharge (E): fire-rate multiplier, then the tower overheats.
  overcharge: { cooldown: 25, duration: 5, rateMul: 2.5, overheat: 2.5 },
};

export const SCORING = {
  killScore: 10, // per enemy kill
  waveBonus: 100, // per cleared wave
};

// Starting Lumen for a fresh run: enough for 2-3 opening towers.
export const STARTING_LUMEN = 150;
