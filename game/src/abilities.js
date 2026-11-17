// HEXEMBER — abilities.js (Builder C). Pure logic: no three.js, no DOM.
// Q = Solar Flare, E = Overcharge. Cooldowns run on state.time (sim clock).
// This module owns the ABILITY CONSTANTS only. The live implementations
// are sim.js useFlare/useOvercharge (same numbers, same rules) — one live
// path, so the two can never drift apart again.
//   Flare lights its radius (light.js), reveals cloaked Stalkers, stuns
//   1.5s, and breaks boss P1 immunity for 6s (GDD gap #1).

export const FLARE = { cooldown: 20, duration: 6, radius: 2, stun: 1.5 };
export const OVERCHARGE = { cooldown: 25, duration: 5, rateMul: 2.5, overheat: 2.5 };
// Volatile Capacitors boon: overcharge spreads to towers within this range
// and overheat becomes 5s (state.overchargeOverheat, set by boons.js).
export const OVERCHARGE_SPREAD_RANGE = 2;
