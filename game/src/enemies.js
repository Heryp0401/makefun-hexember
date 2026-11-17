// HEXEMBER — enemies.js (Builder C). Pure logic: no three.js, no DOM.
// Roles: Skitterer (swarm), Umbra Stalker (cloaked), Snuffer (pylon saboteur),
// Stone Brute (armored). Boss lives in boss.js.
// State shape expected (owned by sim.js, builder A):
//   state.time (seconds), state.path [{q,r}, spawn -> Core] (lane A alias),
//   state.paths {A: [...6 tiles], B: [...8 tiles]} (two lanes; each enemy
//   walks its own lane via enemy.pathId), state.pylons [{id,q,r,hp,lit}],
//   state.enemies (for reference only).
//   Lit check, in order: state.isTileLit(q,r) fn, state.litTiles Set of "q,r",
//   state.flareUntil/flareQ/flareR/flareRadius, state.burnTiles Set of "q,r"
//   (Heliotrope burn lights its tile 4s — GDD gap closure #3).
// Difficulty: createEnemy returns RADIANT base stats (+ wave scaling only).
// The sim applies difficulty multipliers on top of baseHp/baseSpeed.

export const ENEMY_ROLES = {
  skitterer: {
    id: 'skitterer', name: 'Skitterer', hp: 30, speed: 1.2, reward: 5, leak: 1,
    armor: 0, cloaked: false,
    desc: 'Purple spider swarm. Fast, fragile, comes in numbers.',
  },
  stalker: {
    id: 'stalker', name: 'Umbra Stalker', hp: 45, speed: 1.0, reward: 8, leak: 1,
    armor: 0, cloaked: true,
    desc: 'Hooded assassin. Cloaked in darkness — can only be damaged on a lit tile or while revealed by Flare / burn.',
  },
  snuffer: {
    id: 'snuffer', name: 'Snuffer', hp: 60, speed: 0.9, reward: 10, leak: 1,
    armor: 0, cloaked: false,
    desc: 'Hunched saboteur with teal claws. Leaves the path to smash the nearest lit Pylon (3 HP).',
  },
  brute: {
    id: 'brute', name: 'Stone Brute', hp: 300, speed: 0.5, reward: 20, leak: 2,
    armor: 5, cloaked: false,
    desc: 'Massive stone brute with lava cracks. Armor 5 flat (min damage 1, mortar ignores armor).',
  },
};

// Wave HP scaling (Radiant curve): +7% HP per wave after wave 1. Speed never scales by wave.
export const WAVE_HP_PER_WAVE = 0.07;
// Snuffer: only diverts to a lit Pylon within this many tiles.
export const SNUFFER_DIVERT_RANGE = 4;
// Snuffer attacks: 1 damage per hit, 1 hit per second. Pylon HP is 3 (sim owns pylons).
export const SNUFFER_ATTACK_DAMAGE = 1;
export const SNUFFER_ATTACK_INTERVAL = 1;
// Slow effect (applied by towers/sim): halves speed unless slowImmune.
export const SLOW_MUL = 0.5;

let _nextId = 1;

export function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function createEnemy(role, wave = 1, difficulty = 'radiant', spawn = null) {
  const base = ENEMY_ROLES[role];
  if (!base) throw new Error(`createEnemy: unknown role "${role}"`);
  const w = Math.max(1, wave | 0);
  const hp = Math.max(1, Math.round(base.hp * (1 + WAVE_HP_PER_WAVE * (w - 1))));
  const enemy = {
    id: `enemy-${role}-${_nextId++}`,
    role, wave: w, difficulty,
    pathId: 'A', // invasion lane: 'A' (main) or 'B' (flank); the sim sets it at spawn
    hp, maxHp: hp,
    baseHp: base.hp, baseSpeed: base.speed,
    q: spawn ? spawn.q : 0, r: spawn ? spawn.r : 0,
    pathIndex: 0, progress: 0, moveAcc: 0,
    speed: base.speed, reward: base.reward, leak: base.leak, armor: base.armor,
    cloaked: base.cloaked,
    slowUntil: 0, slowMul: SLOW_MUL, slowImmune: false,
    stunUntil: 0, revealedUntil: 0,
    mode: 'path', targetPylon: null, nextAttackAt: 0,
    done: false, reachedCore: false,
  };
  return enemy;
}

// The lane an enemy walks: its own pathId ('A' | 'B'), falling back to
// the single v1 path when the state carries no paths map.
export function pathFor(state, enemy) {
  if (!state) return [];
  return (state.paths && state.paths[enemy.pathId]) || state.path || [];
}

// Nearest tile of the ENEMY'S OWN lane (a Snuffer that diverted from B
// rejoins B, never A).
function nearestPathIndex(state, enemy, q, r) {
  const path = pathFor(state, enemy);
  if (!path.length) return 0;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = hexDistance(q, r, path[i].q, path[i].r);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function nearestLitPylon(state, q, r, maxRange) {
  const pylons = state.pylons || [];
  let best = null, bestD = Infinity;
  for (const p of pylons) {
    if (!p.lit || p.hp <= 0) continue;
    const d = hexDistance(q, r, p.q, p.r);
    if (d <= maxRange && d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function stepToward(enemy, tq, tr) {
  // One hex step to the neighbor that most reduces distance to target.
  let bestQ = enemy.q, bestR = enemy.r, bestD = hexDistance(enemy.q, enemy.r, tq, tr);
  for (const [dq, dr] of NEIGHBORS) {
    const nq = enemy.q + dq, nr = enemy.r + dr;
    const d = hexDistance(nq, nr, tq, tr);
    if (d < bestD) { bestD = d; bestQ = nq; bestR = nr; }
  }
  enemy.q = bestQ; enemy.r = bestR;
  return bestD;
}

// One fixed-step tick. Returns events the sim consumes:
//   {type:'move', id, role, q, r, pathIndex, progress}
//   {type:'attackPylon', id, role, pylonId, damage, pylonHp, destroyed}
//   {type:'leak', id, role, damage, q, r}   (enemy reached the Core)
//   {type:'die', id, role, reward}          (hp hit 0 — sim removes it)
// Movement is discrete tile stepping: moveAcc in [0,1) is progress to the
// next tile, so render can interpolate smoothly between tiles.
export function enemyTick(enemy, state, dt) {
  const events = [];
  if (!enemy || enemy.done) return events;
  const t = (state && state.time) || 0;

  if (enemy.hp <= 0) {
    enemy.done = true;
    events.push({ type: 'die', id: enemy.id, role: enemy.role, reward: enemy.reward });
    return events;
  }
  if (dt <= 0) return events;
  if (t < enemy.stunUntil) return events; // stunned (e.g. Solar Flare): no move, no attack

  const path = pathFor(state, enemy);
  if (!path.length) return events;

  // --- Snuffer saboteur logic ---
  if (enemy.role === 'snuffer') {
    if (enemy.mode === 'path') {
      const pylon = nearestLitPylon(state, enemy.q, enemy.r, SNUFFER_DIVERT_RANGE);
      if (pylon) {
        enemy.mode = 'attackPylon';
        enemy.targetPylon = pylon.id;
        return events; // divert this tick; walks toward the Pylon from next tick
      }
    } else if (enemy.mode === 'attackPylon') {
      const pylons = state.pylons || [];
      const target = pylons.find((p) => p.id === enemy.targetPylon);
      if (!target || target.hp <= 0 || !target.lit) {
        // Target gone/dark: rejoin the path at the nearest path tile.
        enemy.mode = 'path';
        enemy.targetPylon = null;
        enemy.pathIndex = nearestPathIndex(state, enemy, enemy.q, enemy.r);
        enemy.q = path[enemy.pathIndex].q;
        enemy.r = path[enemy.pathIndex].r;
        enemy.moveAcc = 0;
        events.push({ type: 'move', id: enemy.id, role: enemy.role, q: enemy.q, r: enemy.r, pathIndex: enemy.pathIndex, progress: 0 });
        return events;
      }
      const dist = hexDistance(enemy.q, enemy.r, target.q, target.r);
      if (dist <= 1) {
        // In range: smash the Pylon (sim owns Pylon HP; we report the hit).
        if (t >= enemy.nextAttackAt) {
          enemy.nextAttackAt = t + SNUFFER_ATTACK_INTERVAL;
          target.hp = Math.max(0, target.hp - SNUFFER_ATTACK_DAMAGE);
          events.push({
            type: 'attackPylon', id: enemy.id, role: enemy.role,
            pylonId: target.id, damage: SNUFFER_ATTACK_DAMAGE,
            pylonHp: target.hp, destroyed: target.hp <= 0,
          });
          if (target.hp <= 0) {
            target.lit = false;
            enemy.mode = 'path';
            enemy.targetPylon = null;
            enemy.pathIndex = nearestPathIndex(state, enemy, enemy.q, enemy.r);
            enemy.moveAcc = 0;
          }
        }
        return events;
      }
      // Walk toward the Pylon (off-path, tile stepping).
      const effSpeed = effectiveSpeed(enemy, t);
      enemy.moveAcc += dt * effSpeed;
      let moved = false;
      while (enemy.moveAcc >= 1) {
        enemy.moveAcc -= 1;
        stepToward(enemy, target.q, target.r);
        moved = true;
        if (hexDistance(enemy.q, enemy.r, target.q, target.r) <= 1) break;
      }
      if (moved) events.push({ type: 'move', id: enemy.id, role: enemy.role, q: enemy.q, r: enemy.r, pathIndex: enemy.pathIndex, progress: enemy.moveAcc });
      return events;
    }
  }

  // --- Normal path movement ---
  if (enemy.pathIndex >= path.length - 1) {
    enemy.done = true;
    enemy.reachedCore = true;
    events.push({ type: 'leak', id: enemy.id, role: enemy.role, damage: enemy.leak, q: enemy.q, r: enemy.r });
    return events;
  }
  const effSpeed = effectiveSpeed(enemy, t);
  enemy.moveAcc += dt * effSpeed;
  let moved = false;
  while (enemy.moveAcc >= 1) {
    enemy.moveAcc -= 1;
    enemy.pathIndex += 1;
    enemy.q = path[enemy.pathIndex].q;
    enemy.r = path[enemy.pathIndex].r;
    enemy.progress = enemy.pathIndex;
    moved = true;
    if (enemy.pathIndex >= path.length - 1) {
      enemy.done = true;
      enemy.reachedCore = true;
      events.push({ type: 'leak', id: enemy.id, role: enemy.role, damage: enemy.leak, q: enemy.q, r: enemy.r });
      return events;
    }
  }
  if (moved) events.push({ type: 'move', id: enemy.id, role: enemy.role, q: enemy.q, r: enemy.r, pathIndex: enemy.pathIndex, progress: enemy.moveAcc });
  return events;
}

function effectiveSpeed(enemy, t) {
  let s = enemy.speed;
  if (!enemy.slowImmune && enemy.slowUntil && t < enemy.slowUntil) s *= (enemy.slowMul ?? SLOW_MUL);
  return s;
}
