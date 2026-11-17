// HEXEMBER — sim.js
// Pure game state + fixed-timestep (1/60) simulation.
// NO three.js / DOM / audio imports — runs headless in Node (sim-test.mjs).
//
// Cross-module calling conventions (builders B/C implement these names;
// the integrator adapts if a signature drifts):
//   towers.js:    TOWER_TYPES[type] = base stats; createTower(type,q,r)
//   evolutions.js: EVOLUTIONS[evoId] = { id, base, ...stat overrides }
//   enemies.js:   ENEMY_ROLES[role] = base stats; createEnemy(role, diff)
//                 enemyTick(enemy, ctx, dt) — moves the enemy along ctx.path
//                 (pathIndex in tiles, speed in tiles/s); honours
//                 enemy.slowUntil (halved speed) and enemy.stunnedUntil
//                 (no movement); steers toward enemy.divertTarget when set;
//                 returns 'leak' when the enemy reaches the Core.
//                 ctx = { path, now, speedMul, lit:Set, state }.
//   boss.js:      createBoss(diff); bossTick(boss, ctx, dt) — same movement
//                 contract as enemyTick (boss.pathIndex, boss.q/r).
//   boons.js:     BOONS[boonId] = { id, ... } (flags read by the sim).
//   abilities.js: FLARE / OVERCHARGE = { cooldown, duration, radius,
//                 stun, rateMul, overheat } (config ABILITY is the fallback).
//
// Rules enforced here: Stalker takes damage ONLY on a lit tile or while
// revealed (flare / burn); Snuffer diverts to the nearest lit Pylon
// (pylon hp 3); boss P1 immune until >= 3 Pylons lit at once (Flare breaks
// it 6s); boss P2 (<66%) summons 3 Snuffers + a 10s darkness wave (light
// radius -1); boss P3 (<33%) destroys 1 tower every 15s; Awakening P4
// (<15%): speed +50%, Skitterer summons every 3s, slow-immune.
// Towers fire only while their tile is lit. Heliotrope burn lights its
// tile for 4s. Boss-wave enemies always drop Lumen (all kills drop here).

import { TICK, ECONOMY, TOWER_COSTS, EVO_COST_MUL, ABILITY, SCORING, STARTING_LUMEN } from './config.js';
import { GRID_RADIUS, hexKey, hexDistance, buildPath, buildPaths } from './hex.js';
import { computeLit, isLit } from './light.js';
import { awardLumen, spendLumen, tickEconomy } from './economy.js';
import { getDifficulty } from './difficulty.js';
import { buildWave, WAVE_COUNT, BOSS_WAVE, BOON_WAVES } from './waves.js';
import { TOWER_TYPES, createTower } from './towers.js';
import { EVOLUTIONS } from './evolutions.js';
import { ENEMY_ROLES, createEnemy, enemyTick } from './enemies.js';
import { createBoss, bossTick } from './boss.js';
import { BOONS } from './boons.js';
import { FLARE, OVERCHARGE } from './abilities.js';
import { gradeFor } from './ranking.js';

const FLARE_CFG = FLARE && FLARE.cooldown ? FLARE : ABILITY.flare;
const OVERCHARGE_CFG = OVERCHARGE && OVERCHARGE.cooldown ? OVERCHARGE : ABILITY.overcharge;

const LEAK_DAMAGE = { skitterer: 1, stalker: 1, snuffer: 1, brute: 2, boss: 5 };
const BURN_DPS = 10; // Heliotrope burn damage per second (burn lasts 4s)

// ---------------------------------------------------------------- state

export function createSim(difficultyId = 'radiant') {
  const difficulty = getDifficulty(difficultyId);
  // Two invasion lanes (v2): `paths` holds both, `path` stays an alias
  // of paths.A so the boss, shots and render keep working through it.
  const paths = buildPaths();
  return {
    tick: 0,
    time: 0,
    phase: 'build', // 'title' | 'build' | 'wave' | 'boon' | 'victory' | 'gameover'
    wave: 0,
    difficulty, // difficulty object (has .id); Radiant when id unknown
    coreHP: difficulty.coreMaxHP,
    coreMaxHP: difficulty.coreMaxHP,
    lumen: STARTING_LUMEN, // enough for 2-3 opening towers
    score: 0,
    kills: 0,
    towersBuilt: 0,
    lumenCollected: 0,
    towers: [],
    enemies: [],
    pylons: [],
    boss: null,
    flare: { activeUntil: 0, q: 0, r: 0, cooldownUntil: 0 },
    overcharge: { cooldownUntil: 0 },
    boons: [],
    boonChoices: [],
    events: [],
    stars: 0,
    grade: null,
    // internals (not part of the render contract)
    spawnQueue: [],
    waveTime: 0,
    paths,
    path: paths.A,
    burnTiles: [],
    darknessUntil: 0,
    nextId: 1,
    _lit: null,
    _brownoutAt: -99,
    _relightAt: -99,
  };
}

// ---------------------------------------------------------------- helpers

function ev(state, type, data = {}) {
  state.events.push({ tick: state.tick, time: state.time, type, ...data });
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
}

function hasBoon(state, id) {
  return state.boons.includes(id);
}

// BOONS is an array of boon defs; normalize once to an id-keyed map.
const BOON_MAP = Object.fromEntries((BOONS || []).map((b) => [b.id, b]));
function boonMap() {
  return BOON_MAP;
}

function litPylonCount(state) {
  return state.pylons.filter((p) => p.lit).length;
}

function tileLit(state, q, r) {
  if (state._lit) return state._lit.has(hexKey(q, r));
  return isLit(state, q, r);
}

function onPath(state, q, r) {
  // No tower or pylon may be built on EITHER invasion lane.
  const lanes = state.paths ? [state.paths.A, state.paths.B] : [state.path];
  return lanes.some((lane) => lane && lane.some((t) => t.q === q && t.r === r));
}

function occupied(state, q, r) {
  return (
    state.towers.some((t) => t.q === q && t.r === r) ||
    state.pylons.some((p) => p.q === q && p.r === r)
  );
}

function inGrid(q, r) {
  return hexDistance({ q, r }, { q: 0, r: 0 }) <= GRID_RADIUS;
}

// Cost of building a tower, after the Pitch Black Greed discount (40% off).
export function towerCost(state, type) {
  const base = TOWER_COSTS[type];
  if (base == null) return Infinity;
  return Math.round(base * (hasBoon(state, 'pitchBlackGreed') ? 0.6 : 1));
}

function evoCost(state, type) {
  return Math.round(
    TOWER_COSTS[type] * EVO_COST_MUL * (hasBoon(state, 'pitchBlackGreed') ? 0.6 : 1),
  );
}

function pylonCost(state) {
  return Math.round(
    ECONOMY.pylonCost * (hasBoon(state, 'pitchBlackGreed') ? 0.6 : 1),
  );
}

// Evolution lookup. EVOLUTIONS is { baseType: [{ id, mods, ... }, ...] }.
function findEvo(evoId) {
  if (!EVOLUTIONS || typeof EVOLUTIONS !== 'object') return null;
  for (const [base, group] of Object.entries(EVOLUTIONS)) {
    if (Array.isArray(group)) {
      const hit = group.find((e) => e && e.id === evoId);
      if (hit) return { evo: hit, base };
    }
  }
  return null;
}

// Effective tower stats: base (TOWER_TYPES) overridden by evolution mods.
function effStats(tower) {
  const base = TOWER_TYPES[tower.type] || {};
  const found = tower.evo ? findEvo(tower.evo) : null;
  const evo = found ? found.evo : {};
  const { id, base: _b, from: _f, tower: _t, baseType: _bt, ...mods } = evo;
  return { ...base, ...mods };
}

// Damage multiplier from auras: base Pylon Suar aura +10%, Amplifier Node
// aura +25% (per aura, capped at +50% total).
function auraDmgMul(state, tower) {
  let mul = 1;
  for (const t of state.towers) {
    if (t === tower || t.type !== 'pylonSuar') continue;
    const radius = t.evo === 'sanctuarySpire' ? 3 : t.evo === 'amplifierNode' ? 2 : 2;
    if (hexDistance(t, tower) > radius) continue;
    mul += t.evo === 'amplifierNode' ? 0.25 : 0.1;
  }
  return Math.min(mul, 1.5);
}

function globalDmgMul(state) {
  return hasBoon(state, 'glassSupernova') ? 1.65 : 1;
}

// Stalker rule: damageable only on a lit tile, while revealed by Flare,
// or while standing on a Heliotrope burn tile.
function canDamage(state, enemy) {
  if (enemy.role !== 'stalker') return true;
  const now = state.time;
  if (now < (enemy.revealedUntil || 0)) return true;
  if (tileLit(state, enemy.q, enemy.r)) return true;
  for (const b of state.burnTiles) {
    if (b.q === enemy.q && b.r === enemy.r && now < b.until) return true;
  }
  return false;
}

function enemyArmor(enemy) {
  return enemy.armor ?? ENEMY_ROLES[enemy.role]?.armor ?? 0;
}

function killEnemy(state, enemy) {
  const idx = state.enemies.indexOf(enemy);
  if (idx >= 0) state.enemies.splice(idx, 1);
  state.kills += 1;
  state.score += SCORING.killScore;
  const reward = (enemy.reward ?? ENEMY_ROLES[enemy.role]?.reward ?? 0)
    * (state.difficulty.dropsMul ?? 1);
  if (reward > 0) awardLumen(state, reward);
  ev(state, 'kill', { role: enemy.role, reward });
}

// Raw HP damage to a normal enemy (armor + Stalker rule applied).
// Discrete hits have a minimum of 1 damage; DoT ticks (opts.dot) are
// fractional and may deal 0 after armor (no per-tick minimum — a 1/60s
// tick must not round up to 1 or a 20 dps beam becomes 60 dps).
// Returns true if the enemy died.
function damageEnemy(state, enemy, raw, opts = {}) {
  if (!state.enemies.includes(enemy)) return false;
  if (!canDamage(state, enemy)) return false;
  const armor = opts.ignoresArmor ? 0 : enemyArmor(enemy);
  const dmg = opts.dot ? Math.max(0, raw - armor) : Math.max(1, raw - armor);
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    killEnemy(state, enemy);
    return true;
  }
  return false;
}

// Direct HP damage that bypasses the Stalker rule (Heliotrope burn).
function burnDamage(state, enemy, raw) {
  if (!state.enemies.includes(enemy)) return false;
  enemy.hp -= raw;
  if (enemy.hp <= 0) {
    killEnemy(state, enemy);
    return true;
  }
  return false;
}

// Boss damage, gated by the Phase-1 immunity rule.
// opts.dot: fractional DoT tick (no per-tick minimum of 1).
function damageBoss(state, raw, opts = {}) {
  const boss = state.boss;
  if (!boss) return false;
  if (bossImmune(state)) return false; // P1 immunity (see bossImmune)
  boss.hp -= opts.dot ? Math.max(0, raw) : Math.max(1, raw);
  checkBossPhases(state);
  if (boss.hp <= 0) killBoss(state);
  return true;
}

function killBoss(state) {
  const boss = state.boss;
  state.boss = null;
  state.kills += 1;
  state.score += SCORING.waveBonus * 5;
  awardLumen(state, 50 * (state.difficulty.dropsMul ?? 1));
  ev(state, 'boss-killed', { wave: state.wave });
  if (state.wave >= BOSS_WAVE) {
    state.phase = 'victory';
    state.stars =
      state.coreHP >= state.coreMaxHP ? 3 : state.coreHP >= state.coreMaxHP / 2 ? 2 : 1;
    state.grade = gradeFor({ stars: state.stars, won: true });
    ev(state, 'victory', { stars: state.stars, grade: state.grade, score: state.score });
  }
}

function checkBossPhases(state) {
  const boss = state.boss;
  if (!boss) return;
  const frac = boss.hp / boss.maxHp;
  if (boss.phase === 1 && frac < 0.66) {
    boss.phase = 2;
    ev(state, 'boss-phase', { phase: 2 });
    // P2: summon 3 Snuffers + a 10s darkness wave (light radius -1, boss.js canonical).
    for (let i = 0; i < 3; i++) spawnEnemy(state, 'snuffer');
    state.darknessUntil = state.time + 10;
  }
  if (boss.phase === 2 && frac < 0.33) {
    boss.phase = 3;
    boss.nextDestroyAt = state.time + 15;
    ev(state, 'boss-phase', { phase: 3 });
  }
  if (
    boss.phase === 3 &&
    state.difficulty.bossPhase4 &&
    frac < 0.15 &&
    !boss.phase4
  ) {
    boss.phase = 4;
    boss.phase4 = true;
    boss.nextSummonAt = state.time + 3;
    ev(state, 'boss-phase', { phase: 4 });
  }
}

// ---------------------------------------------------------------- actions

export function placeTower(state, type, q, r) {
  if (state.phase !== 'build' && state.phase !== 'wave') {
    return { ok: false, reason: 'wrong-phase' };
  }
  if (!TOWER_COSTS[type]) {
    return { ok: false, reason: 'unknown-tower' };
  }
  if (!inGrid(q, r)) return { ok: false, reason: 'out-of-grid' };
  if (!tileLit(state, q, r)) return { ok: false, reason: 'not-lit' };
  if (onPath(state, q, r)) return { ok: false, reason: 'on-path' };
  if (occupied(state, q, r)) return { ok: false, reason: 'occupied' };
  const cost = towerCost(state, type);
  if (!spendLumen(state, cost)) return { ok: false, reason: 'not-enough-lumen' };
  const tower = createTower(type, q, r) || {};
  tower.id = tower.id ?? state.nextId++;
  tower.type = type;
  tower.evo = tower.evo ?? null;
  tower.q = q;
  tower.r = r;
  tower.cooldown = 0;
  tower.overheatUntil = 0;
  tower.overchargedUntil = 0;
  state.towers.push(tower);
  state.towersBuilt += 1;
  ev(state, 'tower-placed', { type, q, r, cost });
  return { ok: true, tower };
}

export function placePylon(state, q, r) {
  if (state.phase !== 'build' && state.phase !== 'wave') {
    return { ok: false, reason: 'wrong-phase' };
  }
  if (!inGrid(q, r)) return { ok: false, reason: 'out-of-grid' };
  if (onPath(state, q, r)) return { ok: false, reason: 'on-path' };
  if (occupied(state, q, r)) return { ok: false, reason: 'occupied' };
  const cost = pylonCost(state);
  if (!spendLumen(state, cost)) return { ok: false, reason: 'not-enough-lumen' };
  const pylon = { id: `pylon-${state.nextId++}`, q, r, lit: true, hp: 3 };
  state.pylons.push(pylon);
  state._lit = null; // light changed: recompute on next read
  ev(state, 'pylon-placed', { q, r, cost });
  return { ok: true, pylon };
}

export function evolveTower(state, towerId, evoId) {
  if (state.phase !== 'build' && state.phase !== 'wave') {
    return { ok: false, reason: 'wrong-phase' };
  }
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) return { ok: false, reason: 'no-tower' };
  if (tower.evo) return { ok: false, reason: 'already-evolved' };
  const found = findEvo(evoId);
  if (!found || (found.base && found.base !== tower.type)) {
    return { ok: false, reason: 'bad-evolution' };
  }
  const cost = evoCost(state, tower.type);
  if (!spendLumen(state, cost)) return { ok: false, reason: 'not-enough-lumen' };
  tower.evo = evoId;
  state._lit = null; // light may change (Sanctuary Spire lights radius 3)
  ev(state, 'tower-evolved', { towerId, evoId, cost });
  return { ok: true, tower };
}

export function useFlare(state, q, r) {
  if (state.phase !== 'build' && state.phase !== 'wave') {
    return { ok: false, reason: 'wrong-phase' };
  }
  if (state.time < (state.flare.cooldownUntil || 0)) {
    return { ok: false, reason: 'on-cooldown' };
  }
  state.flare = {
    activeUntil: state.time + FLARE_CFG.duration,
    q,
    r,
    radius: FLARE_CFG.radius,
    cooldownUntil: state.time + FLARE_CFG.cooldown,
  };
  // Stun + reveal everything in the flare radius; break boss P1 immunity.
  // Both stun field spellings are set: enemies.js/boss.js read `stunUntil`,
  // the sim's own state uses `stunnedUntil`.
  for (const e of state.enemies) {
    if (hexDistance(e, { q, r }) <= FLARE_CFG.radius) {
      e.stunnedUntil = state.time + FLARE_CFG.stun;
      e.stunUntil = e.stunnedUntil;
      e.revealedUntil = state.time + FLARE_CFG.duration;
    }
  }
  if (state.boss && hexDistance(state.boss, { q, r }) <= FLARE_CFG.radius) {
    state.boss.stunnedUntil = state.time + FLARE_CFG.stun;
    state.boss.stunUntil = state.boss.stunnedUntil;
    state.boss.immunityBrokenUntil = state.time + FLARE_CFG.duration;
  }
  ev(state, 'flare', { q, r });
  return { ok: true };
}

export function useOvercharge(state, towerId) {
  if (state.phase !== 'build' && state.phase !== 'wave') {
    return { ok: false, reason: 'wrong-phase' };
  }
  if (state.time < (state.overcharge.cooldownUntil || 0)) {
    return { ok: false, reason: 'on-cooldown' };
  }
  const overheat = hasBoon(state, 'volatileCapacitors')
    ? 5
    : OVERCHARGE_CFG.overheat;
  const targets = hasBoon(state, 'volatileCapacitors')
    ? state.towers
    : state.towers.filter((t) => t.id === towerId);
  if (!targets.length) return { ok: false, reason: 'no-tower' };
  for (const t of targets) {
    t.overchargedUntil = state.time + OVERCHARGE_CFG.duration;
    t.overheatUntil = state.time + OVERCHARGE_CFG.duration + overheat;
  }
  state.overcharge.cooldownUntil = state.time + OVERCHARGE_CFG.cooldown;
  ev(state, 'overcharge', { towerId, spread: targets.length > 1 });
  return { ok: true };
}

export function chooseBoon(state, boonId) {
  if (state.phase !== 'boon') return { ok: false, reason: 'wrong-phase' };
  if (state.boons.includes(boonId)) return { ok: false, reason: 'already-owned' };
  if (!state.boonChoices.includes(boonId) || !boonMap()[boonId]) {
    return { ok: false, reason: 'not-offered' };
  }
  state.boons.push(boonId);
  // Glass Supernova (GDD/boons.js): Core max HP BECOMES 3 and can never
  // be healed — it is NOT +3 HP. Clamp current HP down to the new max.
  // A second pick is impossible (already-owned above), so this applies once.
  if (boonId === 'glassSupernova') {
    state.coreMaxHP = 3;
    state.coreHP = Math.min(state.coreHP, 3);
    state.unhealable = true;
  }
  state.boonChoices = [];
  state.phase = 'build';
  ev(state, 'boon-chosen', { boonId });
  return { ok: true, boonId };
}

// ---------------------------------------------------------------- waves

export function startWave(state) {
  if (state.phase !== 'build') return { ok: false, reason: 'wrong-phase' };
  if (state.wave >= WAVE_COUNT) return { ok: false, reason: 'no-more-waves' };
  state.wave += 1;
  const def = buildWave(state.wave, state.difficulty);
  state.spawnQueue = [];
  for (const g of def.spawns) {
    for (let i = 0; i < g.count; i++) {
      state.spawnQueue.push({ role: g.role, at: g.delay + i * (g.interval || 0.8), pathId: g.path || 'A' });
    }
  }
  state.spawnQueue.sort((a, b) => a.at - b.at);
  state.waveTime = 0;
  state.phase = 'wave';
  ev(state, 'wave-start', { wave: state.wave });
  return { ok: true, wave: state.wave };
}

function spawnEnemy(state, role, pathId = 'A') {
  // createEnemy(role, wave, difficultyId): wave scales HP +7%/wave
  // (enemies.js), difficulty id selects the multiplier curve.
  const enemy = createEnemy(role, state.wave, state.difficulty.id) || {};
  const base = ENEMY_ROLES[role] || {};
  enemy.id = enemy.id ?? state.nextId++;
  enemy.role = role;
  // Wave-scaled HP from createEnemy, then the difficulty multiplier.
  enemy.maxHp = Math.round(
    (enemy.maxHp ?? enemy.hp ?? base.hp ?? 30) * (state.difficulty.hpMul ?? 1),
  );
  enemy.hp = enemy.maxHp;
  enemy.speed = (enemy.speed ?? base.speed ?? 1) * (state.difficulty.speedMul ?? 1);
  // Spawn at the head of the enemy's OWN lane (boss P2/P4 summons call
  // without a pathId and default to lane A).
  const lane = (state.paths && state.paths[pathId]) || state.path;
  enemy.pathId = pathId;
  enemy.q = lane[0].q;
  enemy.r = lane[0].r;
  enemy.pathIndex = 0;
  enemy.slowUntil = 0;
  enemy.revealedUntil = 0;
  enemy.stunnedUntil = 0;
  enemy.stunUntil = 0;
  enemy.burnUntil = 0;
  enemy.burnDps = 0;
  enemy.reward = enemy.reward ?? base.reward ?? 0;
  enemy.armor = enemy.armor ?? base.armor ?? 0;
  state.enemies.push(enemy);
  return enemy;
}

function spawnBoss(state) {
  const boss = createBoss(state.difficulty.id) || {};
  // createBoss returns base 3000 HP; scale unconditionally (?? would
  // never fire since hp is already set).
  boss.hp = Math.round(3000 * (state.difficulty.hpMul ?? 1));
  boss.maxHp = boss.hp;
  boss.speed = (boss.speed ?? 0.4) * (state.difficulty.speedMul ?? 1);
  boss.difficulty = state.difficulty.id; // boss.js bossPhase() checks the id string
  boss.phase = 1;
  boss.q = state.path[0].q;
  boss.r = state.path[0].r;
  boss.pathIndex = 0;
  boss.slowUntil = 0;
  boss.stunnedUntil = 0;
  boss.stunUntil = 0;
  boss.immunityBrokenUntil = 0;
  state.boss = boss;
  ev(state, 'boss-spawn', { hp: boss.hp });
  return boss;
}

// ---------------------------------------------------------------- combat

// Enemies sorted by progress toward the Core (highest pathIndex first) —
// the boss included in the same sort, so the furthest-along target
// (boss or escort) is always shot first. While the boss is P1-immune it
// is excluded from targeting entirely (towers shoot escorts instead of
// wasting shots on an immune Sovereign).
function bossImmune(state) {
  const boss = state.boss;
  return (
    !!boss &&
    boss.phase === 1 &&
    litPylonCount(state) < 3 &&
    state.time >= (boss.immunityBrokenUntil || 0)
  );
}

function targetsInRange(state, tower, stats) {
  const list = [];
  for (const e of state.enemies) {
    if (hexDistance(tower, e) <= (stats.range ?? 0)) list.push(e);
  }
  if (state.boss && !bossImmune(state) && hexDistance(tower, state.boss) <= (stats.range ?? 0)) {
    list.push(state.boss);
  }
  // Rank by PROGRESS FRACTION along the target's own lane, so a B enemy
  // at index 7 (at the Core) and an A enemy at index 5 (at the Core)
  // rank equal. The boss walks lane A (state.path is the A alias).
  const progress = (e) => {
    const lane = (state.paths && state.paths[e.pathId]) || state.path;
    return e.pathIndex / Math.max(1, lane.length - 1);
  };
  list.sort((a, b) => progress(b) - progress(a));
  return list;
}

function hitBossOrEnemy(state, target, raw, opts) {
  if (target === state.boss) return damageBoss(state, raw);
  return damageEnemy(state, target, raw, opts);
}

function towerFire(state, dt) {
  const now = state.time;
  const dmgMul = globalDmgMul(state);
  for (const tower of [...state.towers]) {
    if (!state.towers.includes(tower)) continue; // destroyed by boss P3
    // Beam visual: render.js draws a beam while tower.beamTo is set.
    // Cleared every tick, set again below only while actually firing.
    tower.beamTo = null;
    const overcharged = now < (tower.overchargedUntil || 0);
    // Overheat blocks firing ONLY after the overcharge window ends:
    // (overchargedUntil, overheatUntil). During overcharge the tower
    // fires at the boosted rate.
    if (!overcharged && now < (tower.overheatUntil || 0)) continue;
    if (!tileLit(state, tower.q, tower.r)) continue; // offline in the dark
    const stats = effStats(tower);
    const aura = auraDmgMul(state, tower);
    const rateMul = overcharged ? OVERCHARGE_CFG.rateMul : 1;

    if (tower.type === 'heliotrope') {
      // Continuous beam + burn. Burn lights the tile for 4s.
      const targets = targetsInRange(state, tower, stats);
      const beamTarget = targets[0] || null;
      if (beamTarget) {
        tower.beamTo = { q: beamTarget.q, r: beamTarget.r };
        const dps = (stats.dps ?? 20) * dmgMul * aura;
        if (beamTarget === state.boss) damageBoss(state, dps * dt, { dot: true });
        else if (canDamage(state, beamTarget)) damageEnemy(state, beamTarget, dps * dt, { dot: true });
        // Apply burn (also to the boss, and also to a dark Stalker — the
        // burn itself is what lights its tile so it can be hit).
        beamTarget.burnUntil = now + (stats.burn ?? 4);
        beamTarget.burnDps = BURN_DPS;
        const key = hexKey(beamTarget.q, beamTarget.r);
        const existing = state.burnTiles.find((b) => hexKey(b.q, b.r) === key);
        if (existing) existing.until = Math.max(existing.until, now + (stats.burn ?? 4));
        else state.burnTiles.push({ q: beamTarget.q, r: beamTarget.r, until: now + (stats.burn ?? 4) });
        // Flare Projector: burn spreads to adjacent enemies.
        if (tower.evo === 'flareProjector') {
          for (const e of state.enemies) {
            if (e !== beamTarget && hexDistance(e, beamTarget) <= 1) {
              e.burnUntil = now + (stats.burn ?? 4);
              e.burnDps = BURN_DPS;
            }
          }
        }
      }
      continue;
    }

    if (tower.type === 'pylonSuar') continue; // aura only, no direct damage

    const rate = stats.rate ?? 1;
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;
    const interval = 1 / (rate * rateMul);
    while (tower.cooldown <= 0) {
      tower.cooldown += interval;
      const targets = targetsInRange(state, tower, stats);
      if (!targets.length) break;
      if (tower.type === 'prism') {
        // Chain: hit up to `chain` targets, each within 1.5 of the last.
        const chain = stats.chain ?? 2;
        let from = targets[0];
        tower.beamTo = from ? { q: from.q, r: from.r } : null;
        const hitSet = new Set();
        for (let c = 0; c < chain && from; c++) {
          hitSet.add(from);
          hitBossOrEnemy(state, from, (stats.dmg ?? 12) * dmgMul * aura, {});
          let next = null;
          for (const cand of targets) {
            if (!hitSet.has(cand) && hexDistance(cand, from) <= 1.5) {
              next = cand;
              break;
            }
          }
          from = next;
        }
      } else if (tower.type === 'lance') {
        // Pierce: hit up to pierce+1 targets, closest to the Core first.
        // Beacon Seeker prefers Snuffers, then Stalkers.
        let pool = targets;
        if (tower.evo === 'beaconSeeker') {
          const prio = ['snuffer', 'stalker'];
          pool = [...targets].sort((a, b) => {
            const pa = a === state.boss ? 99 : prio.indexOf(a.role);
            const pb = b === state.boss ? 99 : prio.indexOf(b.role);
            return (pa < 0 ? 2 : pa) - (pb < 0 ? 2 : pb) || b.pathIndex - a.pathIndex;
          });
        }
        const count = (stats.pierce ?? 0) + 1;
        if (pool.length) tower.beamTo = { q: pool[0].q, r: pool[0].r };
        for (const t of pool.slice(0, count)) {
          hitBossOrEnemy(state, t, (stats.dmg ?? 60) * dmgMul * aura, {});
        }
      } else if (tower.type === 'mortar') {
        const shells = stats.shells ?? 1;
        const shellDmg = stats.dmg ?? 40;
        const aoe = stats.aoe ?? 1;
        // Each shell lands on a target tile (first on the lead target, the
        // rest on the nearest other enemies in range) and splashes.
        const impactTiles = [];
        for (let s = 0; s < shells && s < targets.length; s++) {
          impactTiles.push({ q: targets[s].q, r: targets[s].r });
        }
        if (!impactTiles.length && targets.length) {
          impactTiles.push({ q: targets[0].q, r: targets[0].r });
        }
        if (impactTiles.length) tower.beamTo = { ...impactTiles[0] };
        for (const tile of impactTiles) {
          const splash = [...state.enemies].filter(
            (e) => hexDistance(e, tile) <= aoe,
          );
          for (const e of splash) {
            const died = damageEnemy(state, e, shellDmg * dmgMul * aura, {
              ignoresArmor: true,
            });
            void died;
            if (state.enemies.includes(e) && tower.evo === 'seismicCore') {
              e.slowUntil = now + 2; // 50% slow for 2s
            }
          }
          if (state.boss && hexDistance(state.boss, tile) <= aoe) {
            damageBoss(state, shellDmg * dmgMul * aura);
          }
        }
      }
      // One volley per interval; loop only to catch up lost time.
      if (tower.cooldown > 0) break;
    }
  }
  // Prune expired burn tiles.
  state.burnTiles = state.burnTiles.filter((b) => now < b.until);
}

function tickBurns(state, dt) {
  for (const e of [...state.enemies]) {
    if (state.time < (e.burnUntil || 0) && e.burnDps) {
      burnDamage(state, e, e.burnDps * dt);
    }
  }
  if (state.boss && state.time < (state.boss.burnUntil || 0) && state.boss.burnDps) {
    state.boss.hp -= state.boss.burnDps * dt;
    checkBossPhases(state); // burn damage can cross a phase threshold too
    if (state.boss.hp <= 0) killBoss(state);
  }
}

// ---------------------------------------------------------------- step

export function stepSim(state, input = {}, dt = TICK) {
  if (!state) return state;
  if (state.phase === 'victory' || state.phase === 'gameover' || state.phase === 'title') {
    return state;
  }
  if (!(dt > 0) || dt > 0.1) dt = TICK;
  if (input && input.paused) return state;

  state.tick += 1;
  state.time += dt;
  tickEconomy(state, dt);
  state._lit = computeLit(state);

  if (state.phase === 'boon') return state;
  if (state.phase !== 'wave') return state;

  state.waveTime += dt;
  const now = state.time;

  // Spawn due enemies.
  while (state.spawnQueue.length && state.spawnQueue[0].at <= state.waveTime) {
    const s = state.spawnQueue.shift();
    if (s.role === 'boss') spawnBoss(state);
    else spawnEnemy(state, s.role, s.pathId || 'A');
  }

  towerFire(state, dt);
  tickBurns(state, dt);
  // Combat may have ended the run already (boss killed -> victory).
  if (state.phase !== 'wave') return state;

  // Boss P3: destroy 1 tower every 15s (the tower nearest the boss).
  // Boss P4 (Awakening): summon a Skitterer every 5s.
  if (state.boss) {
    if (state.boss.phase >= 3 && now >= (state.boss.nextDestroyAt || Infinity)) {
      state.boss.nextDestroyAt = now + 15;
      if (state.towers.length) {
        const victim = [...state.towers].sort(
          (a, b) => hexDistance(a, state.boss) - hexDistance(b, state.boss),
        )[0];
        state.towers.splice(state.towers.indexOf(victim), 1);
        state._lit = null; // light may change (Sanctuary Spire lost)
        ev(state, 'tower-destroyed', { type: victim.type, q: victim.q, r: victim.r });
      }
    }
    if (state.boss.phase === 4 && now >= (state.boss.nextSummonAt || Infinity)) {
      state.boss.nextSummonAt = now + 3;
      spawnEnemy(state, 'skitterer');
    }
  }

  // Move enemies. enemyTick/bossTick (builders C) expect the REAL sim
  // state shape — time, path, pylons, towers — so Flare stuns, slows and
  // Snuffer pylon-diverts actually work (a bare {path, now} ctx left
  // t=0 and pylons undefined, silently disabling all three).
  const ctx = {
    path: state.path,
    paths: state.paths,
    now,
    time: now,
    speedMul: state.difficulty.speedMul ?? 1,
    lit: state._lit,
    pylons: state.pylons,
    towers: state.towers,
    state,
  };
  for (const enemy of [...state.enemies]) {
    const result = enemyTick(enemy, ctx, dt);
    // Snuffer pylon attacks happen inside enemyTick (it owns pylon HP);
    // sweep destroyed pylons here so the sim emits the event + relights.
    for (const pylon of [...state.pylons]) {
      if (pylon.hp <= 0) {
        state.pylons.splice(state.pylons.indexOf(pylon), 1);
        state._lit = null; // light changed
        ev(state, 'pylon-destroyed', { q: pylon.q, r: pylon.r });
      }
    }
    // Leak: reached the Core tile (or enemyTick reported it). The Core
    // is the last tile of the enemy's OWN lane (B is 8 tiles, A is 6).
    const enemyLane = (state.paths && state.paths[enemy.pathId]) || state.path;
    if (result === 'leak' || enemy.pathIndex >= enemyLane.length - 1) {
      const idx = state.enemies.indexOf(enemy);
      if (idx >= 0) state.enemies.splice(idx, 1);
      const dmg = LEAK_DAMAGE[enemy.role] ?? 1;
      state.coreHP -= dmg;
      ev(state, 'leak', { role: enemy.role, dmg, coreHP: state.coreHP });
    }
  }

  // Move the boss.
  if (state.boss) {
    const bossCtx = {
      ...ctx,
      speedMul:
        (state.difficulty.speedMul ?? 1) * (state.boss.phase === 4 ? 1.5 : 1),
    };
    const result = bossTick(state.boss, bossCtx, dt);
    if (result === 'leak' || state.boss.pathIndex >= state.path.length - 1) {
      state.coreHP -= LEAK_DAMAGE.boss;
      ev(state, 'boss-leak', { coreHP: state.coreHP });
      state.boss = null;
      // The Sovereign reached the Core: the run is over.
      state.phase = 'gameover';
      state.grade = null;
      ev(state, 'gameover', { wave: state.wave, reason: 'boss-leak' });
      return state;
    }
  }

  // Core destroyed?
  if (state.coreHP <= 0) {
    state.coreHP = 0;
    state.phase = 'gameover';
    state.grade = null;
    ev(state, 'gameover', { wave: state.wave, reason: 'core-destroyed' });
    return state;
  }

  // Wave cleared: queue empty, no enemies, no boss.
  if (!state.spawnQueue.length && !state.enemies.length && !state.boss) {
    state.score += SCORING.waveBonus;
    ev(state, 'wave-clear', { wave: state.wave, score: state.score });
    if (BOON_WAVES.includes(state.wave)) {
      state.phase = 'boon';
      // Offer only boons not owned yet (a second Glass Supernova pick
      // would be meaningless — and chooseBoon rejects it anyway).
      state.boonChoices = Object.keys(boonMap()).filter(
        (id) => !state.boons.includes(id),
      );
    } else {
      state.phase = 'build';
    }
  }
  return state;
}
