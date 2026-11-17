// HEXEMBER — boons.js (Builder C). Pure logic: no three.js, no DOM.
// Pick 1 of 3 after waves 3 / 6 / 9 (screens.js shows the panel; sim calls
// rollBoons then applyBoon). Only 3 boons exist, so a run can own all three
// by wave 9. Owned boons are tracked on state.boons (array of ids).

export const BOONS = [
  {
    id: 'glassSupernova',
    name: 'Glass Supernova',
    dmgMul: 1.65, coreMaxHP: 3, unhealable: true,
    desc: '+65% tower damage. Core max HP becomes 3 and can NEVER be healed. Glass cannon run.',
    tradeoff: 'Core max HP menjadi 3, tidak bisa disembuhkan',
  },
  {
    id: 'pitchBlackGreed',
    name: 'Pitch-Black Greed',
    buildDiscount: 0.4, pylonRadiusMul: 0.65,
    desc: 'Build costs -40%. Pylon light radius x0.65. Cheap, but the dark closes in.',
    tradeoff: 'Radius Pylon -35%',
  },
  {
    id: 'volatileCapacitors',
    name: 'Volatile Capacitors',
    overchargeSpread: true, overheat: 5,
    desc: 'Overcharge spreads to nearby towers. Overheat lasts 5s instead of 2.5s. Big bursts, long cooldowns.',
    tradeoff: 'Overheat 5 detik',
  },
];

export const BOON_WAVES = [3, 6, 9];

function ownedBoons(state) {
  if (!state) return [];
  if (Array.isArray(state.boons)) return state.boons;
  if (Array.isArray(state.ownedBoons)) return state.ownedBoons;
  return [];
}

function boonById(id) {
  return BOONS.find((b) => b.id === id) || null;
}

// Returns up to 3 boon defs the player does not own yet (shallow copies so
// the caller cannot mutate the shared table). Empty array if all are owned.
export function rollBoons(state) {
  const owned = new Set(ownedBoons(state));
  return BOONS.filter((b) => !owned.has(b.id)).slice(0, 3).map((b) => ({ ...b }));
}

// Applies a boon to state. Returns {ok:true, boonId} or {ok:false, reason}.
// Reasons: 'unknown-boon', 'already-owned'.
export function applyBoon(state, boonId) {
  const boon = boonById(boonId);
  if (!boon) return { ok: false, reason: 'unknown-boon' };
  if (!state) return { ok: false, reason: 'no-state' };
  if (!Array.isArray(state.boons)) state.boons = [];
  if (state.boons.includes(boonId)) return { ok: false, reason: 'already-owned' };

  if (boonId === 'glassSupernova') {
    state.dmgMul = (state.dmgMul ?? 1) * boon.dmgMul;
    // GDD: Core max HP BECOMES 3 (not +3) and can never be healed.
    state.coreMaxHP = boon.coreMaxHP;
    state.coreMaxHp = boon.coreMaxHP; // alias — sim may read either casing
    state.unhealable = true;
    // Clamp current Core HP to the new max (sim owns coreHP; keep it valid).
    if (state.coreHP !== undefined) state.coreHP = Math.min(state.coreHP, boon.coreMaxHP);
    if (state.core && state.core.hp !== undefined) state.core.hp = Math.min(state.core.hp, boon.coreMaxHP);
  } else if (boonId === 'pitchBlackGreed') {
    state.buildDiscount = boon.buildDiscount;
    state.buildCostMul = 1 - boon.buildDiscount; // 0.6 — economy.js reads this
    state.pylonRadiusMul = (state.pylonRadiusMul ?? 1) * boon.pylonRadiusMul;
  } else if (boonId === 'volatileCapacitors') {
    state.overchargeSpread = true;
    state.volatileCapacitors = true;
    state.overchargeOverheat = boon.overheat; // abilities.js reads this (5s)
  }

  state.boons.push(boonId);
  return { ok: true, boonId };
}
