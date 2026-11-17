// HEXEMBER — light.js
// Light system: which tiles are lit, and the brownout rule.
// Light sources: Core (radius 2, permanent), lit Beacon Pylons, an active
// Solar Flare, Heliotrope burn tiles (4s), Sanctuary Spires (radius 3).
// During a boss "darkness wave" (state.darknessUntil) Pylon light radius
// is -1 for 10s (boss.js canonical) — NOT lights-off: the dark closes in
// by one tile, it does not swallow the island.

import { ECONOMY } from './config.js';
import { GRID_RADIUS, hexKey, hexDistance } from './hex.js';

function hasBoon(state, id) {
  return (state.boons || []).includes(id);
}

// Effective Pylon light radius (Pitch Black Greed shrinks it x0.65).
export function pylonRadius(state) {
  return ECONOMY.pylonRadius * (hasBoon(state, 'pitchBlackGreed') ? 0.65 : 1);
}

export function computeLit(state) {
  const lit = new Set();
  const now = state.time || 0;
  const flareOn = state.flare && now < (state.flare.activeUntil || 0);
  const darkWave = now < (state.darknessUntil || 0);
  const pr = pylonRadius(state);
  // Darkness wave: every light radius shrinks by 1 tile (never below 0).
  const darkDelta = darkWave ? -1 : 0;
  const effPylonRadius = Math.max(0, pr + darkDelta);
  const effSanctuaryRadius = Math.max(0, 3 + darkDelta);
  // Burn tiles illuminate their own tile for 4s (Heliotrope counter).
  const burnKeys = new Set();
  for (const b of state.burnTiles || []) {
    if (now < (b.until || 0)) burnKeys.add(hexKey(b.q, b.r));
  }
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    const rMin = Math.max(-GRID_RADIUS, -q - GRID_RADIUS);
    const rMax = Math.min(GRID_RADIUS, -q + GRID_RADIUS);
    for (let r = rMin; r <= rMax; r++) {
      const tile = { q, r };
      const key = hexKey(q, r);
      if (hexDistance(tile, { q: 0, r: 0 }) <= ECONOMY.coreLightRadius) {
        lit.add(key);
        continue;
      }
      if (burnKeys.has(key)) {
        lit.add(key);
        continue;
      }
      if (flareOn && hexDistance(tile, state.flare) <= (state.flare.radius ?? 2)) {
        lit.add(key);
        continue;
      }
      for (const p of state.pylons || []) {
        if (p.lit && hexDistance(tile, p) <= effPylonRadius) {
          lit.add(key);
          break;
        }
      }
      if (lit.has(key)) continue;
      // Sanctuary Spire (evolved Pylon Suar) lights radius 3 (2 in darkness).
      for (const t of state.towers || []) {
        if (t.evo === 'sanctuarySpire' && hexDistance(tile, t) <= effSanctuaryRadius) {
          lit.add(key);
          break;
        }
      }
    }
  }
  return lit;
}

export function isLit(state, q, r) {
  return computeLit(state).has(hexKey(q, r));
}

// Brownout: at 0 Lumen, the OUTERMOST lit Pylon goes dark (at most one per
// second). The innermost lit Pylon never browns out (recovery floor).
// Returns the pylons switched off (usually 0 or 1).
export function applyBrownout(state) {
  if ((state.lumen || 0) > 0) return [];
  const litPylons = (state.pylons || []).filter((p) => p.lit);
  if (litPylons.length <= 1) return [];
  const now = state.time || 0;
  if (now - (state._brownoutAt ?? -99) < 1) return [];
  litPylons.sort(
    (a, b) => hexDistance(b, { q: 0, r: 0 }) - hexDistance(a, { q: 0, r: 0 }),
  );
  const out = litPylons[0];
  out.lit = false;
  state._brownoutAt = now;
  return [out];
}

// Recovery: once Lumen refills to >= 5, relight the innermost dark Pylon
// (at most one per second). Destroyed pylons are removed, never relit.
export function restorePylons(state) {
  if ((state.lumen || 0) < 5) return [];
  const dark = (state.pylons || []).filter((p) => !p.lit);
  if (!dark.length) return [];
  const now = state.time || 0;
  if (now - (state._relightAt ?? -99) < 1) return [];
  dark.sort(
    (a, b) => hexDistance(a, { q: 0, r: 0 }) - hexDistance(b, { q: 0, r: 0 }),
  );
  dark[0].lit = true;
  state._relightAt = now;
  return [dark[0]];
}
