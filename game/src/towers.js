// HEXEMBER — towers.js (Builder B)
// Pure logic: 5 tower types, stats, firing. No three.js, no DOM.
// Base numbers are the BASE the sim scales (e.g. glassSupernova x1.65);
// boons are NEVER applied here. Costs live in TOWER_TYPES.cost / TOWER_COSTS;
// the sim applies discounts (e.g. pitchBlackGreed 0.4) on top of those.
//
// Expected state shape from sim: state.enemies = [{id, q, r, hp, role, ...}]
// (axial hex coords, same q/r space as the tower), state.time optional
// (seconds; used only for the overheat gate). towerFire returns hit events
// for the sim to apply — it never mutates enemy HP itself.

export const TOWER_TYPES = {
  prism: {
    id: 'prism', name: 'Pulse Prism', cost: 50,
    range: 2.5, dmg: 12, rate: 2, chain: 2,
    desc: 'Golden crystal prism — cheap rapid chain-lightning; chains to nearby enemies.',
  },
  heliotrope: {
    id: 'heliotrope', name: 'Heliotrope Beam', cost: 75,
    range: 3, dps: 20, burn: 4,
    desc: 'Amber laser obelisk — continuous beam; burn lights tiles for 4s, revealing Umbra Stalkers.',
  },
  lance: {
    id: 'lance', name: 'Sentinel Lance', cost: 100,
    range: 5, dmg: 60, rate: 0.5,
    desc: 'Silver lance — long-range sniper; heavy single-target burst, counters armored Brutes at range.',
  },
  mortar: {
    id: 'mortar', name: 'Shatter Mortar', cost: 125,
    range: 3.5, dmg: 40, aoe: 1, rate: 0.6, ignoresArmor: true,
    desc: 'Heavy mortar — lobbed AoE shells that ignore armor; the Brute counter.',
  },
  pylonSuar: {
    id: 'pylonSuar', name: 'Pylon Suar', cost: 60,
    range: 2, auraRadius: 2, dmg: 0, rate: 0,
    desc: 'Radiant light pylon — no direct damage; aura lights tiles and powers nearby towers.',
  },
};

// Flat cost lookup (sim applies boon discounts from this, not from TOWER_TYPES).
export const TOWER_COSTS = Object.fromEntries(
  Object.values(TOWER_TYPES).map((t) => [t.id, t.cost]),
);

// Axial hex distance in tiles.
export function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function createTower(type, q, r) {
  if (!TOWER_TYPES[type]) throw new Error(`unknown tower type: ${type}`);
  return { id: `${type}@${q},${r}`, type, evo: null, q, r, cooldown: 0, overheatUntil: 0, kills: 0 };
}

// Effective stats: base type stats overridden by evolution mods (if any).
export function towerStats(tower) {
  return { ...TOWER_TYPES[tower.type], ...(tower.mods || {}) };
}

export function towerRange(tower) {
  const s = towerStats(tower);
  // Suar Pylon's "range" is its aura radius (evolutions raise auraRadius,
  // so read that first for pylons or the wider aura would never apply).
  if (tower.type === 'pylonSuar') return s.auraRadius ?? s.range ?? 0;
  return s.range ?? s.auraRadius ?? 0;
}

// Base damage (evolution applied, boons NOT applied). Heliotrope reports
// its beam dps; Suar Pylon deals no direct damage (0).
export function towerDamage(tower) {
  const s = towerStats(tower);
  if (tower.type === 'heliotrope') return s.dps ?? 0;
  return s.dmg ?? 0;
}

// Enemies in range, nearest first. Beacon Seeker priority (snuffer, stalker)
// is honoured before distance; every other tower is pure nearest-first.
function targetsInRange(tower, state) {
  const s = towerStats(tower);
  const range = towerRange(tower);
  const list = (state.enemies || []).filter(
    (e) => e && e.hp > 0 && hexDistance(tower.q, tower.r, e.q, e.r) <= range,
  );
  const priority = s.priority || null;
  list.sort((a, b) => {
    if (priority) {
      // Enemies carry `role` (sim/enemies.js); fall back to `type` for
      // foreign state shapes. Beacon Seeker priority: snuffer, stalker.
      const pa = priority.indexOf(a.role ?? a.type), pb = priority.indexOf(b.role ?? b.type);
      const ra = pa === -1 ? priority.length : pa, rb = pb === -1 ? priority.length : pb;
      if (ra !== rb) return ra - rb;
    }
    return hexDistance(tower.q, tower.r, a.q, a.r) - hexDistance(tower.q, tower.r, b.q, b.r);
  });
  return list;
}

// Fire one tick. Returns hit events for the sim to apply:
//   {targetId, damage, kind:'hit'|'chain'|'beam'|'aoe', ...}
// kind extras: beam -> {burn} (seconds the tile stays lit/burning);
// aoe -> {aoe, ignoresArmor, slow?}; chain -> {chainIndex}.
// Beam (heliotrope) is continuous: dps * dt every tick, no cooldown.
// Other towers tick tower.cooldown down by dt and fire at rate when it
// reaches 0. Suar Pylon never fires (aura only) — returns [].
export function towerFire(tower, state, dt) {
  if (!state || !state.enemies) return [];
  // Overheat gate (Overcharge): no firing while overheated, when the sim
  // supplies a clock. Without state.time the gate is inert.
  if (state.time !== undefined && tower.overheatUntil && state.time < tower.overheatUntil) return [];
  const s = towerStats(tower);
  const inRange = targetsInRange(tower, state);
  if (inRange.length === 0) return [];

  // --- Heliotrope: continuous beam on the first target in range. ---
  if (tower.type === 'heliotrope') {
    const primary = inRange[0];
    const events = [{
      targetId: primary.id, damage: (s.dps ?? 0) * dt, kind: 'beam', burn: s.burn ?? 4,
    }];
    // Flare Projector: the burn spreads to enemies adjacent to the primary.
    if (s.burnSpread) {
      for (const e of inRange) {
        if (e.id === primary.id) continue;
        if (hexDistance(primary.q, primary.r, e.q, e.r) <= 1) {
          events.push({ targetId: e.id, damage: 0, kind: 'beam', burn: s.burn ?? 4 });
        }
      }
    }
    return events;
  }

  // --- Suar Pylon: aura only, no direct damage. ---
  if (tower.type === 'pylonSuar') return [];

  // --- Cooldown weapons: prism / lance / mortar. ---
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return [];
  tower.cooldown = 1 / (s.rate || 1);

  const dmg = s.dmg ?? 0;

  // --- Mortar: AoE around the first target; one event per enemy in radius. ---
  if (tower.type === 'mortar') {
    const shells = s.shells || 1;
    const events = [];
    const seen = new Set();
    // Nova Cluster fires 3 shells at up to 3 distinct targets in range.
    // One event per enemy per volley: overlapping blasts do NOT stack on
    // the same enemy (cluster buys coverage, not triple damage).
    const shellTargets = inRange.slice(0, shells);
    for (const target of shellTargets) {
      const aoe = s.aoe ?? 1;
      for (const e of state.enemies) {
        if (!e || e.hp <= 0 || seen.has(e.id)) continue;
        if (hexDistance(target.q, target.r, e.q, e.r) <= aoe) {
          seen.add(e.id);
          events.push({
            targetId: e.id, damage: dmg, kind: 'aoe',
            aoe, ignoresArmor: true, ...(s.slow ? { slow: s.slow } : {}),
          });
        }
      }
    }
    return events;
  }

  // --- Lance: single heavy shot; Zenith Railgun pierces extra targets. ---
  if (tower.type === 'lance') {
    const pierce = s.pierce || 0;
    return inRange.slice(0, 1 + pierce).map((e, i) => ({
      targetId: e.id, damage: dmg, kind: 'hit', ...(i > 0 ? { pierced: true } : {}),
    }));
  }

  // --- Prism: chain lightning, `chain` = TOTAL targets hit (base 2). ---
  const chain = s.chain ?? 1;
  return inRange.slice(0, chain).map((e, i) => ({
    targetId: e.id, damage: dmg, kind: i === 0 ? 'hit' : 'chain', chainIndex: i,
  }));
}
