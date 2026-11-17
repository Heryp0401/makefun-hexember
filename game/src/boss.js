// HEXEMBER — boss.js (Builder C). Pure logic: no three.js, no DOM.
// Eclipse Sovereign, wave 10. Win condition: boss dies.
//   P1 (>=66% HP): IMMUNE until >=3 Pylons lit simultaneously. Solar Flare
//       breaks immunity for 6s (boss.immuneBrokenUntil). GDD gap closure #1.
//   P2 (<66% HP): summons 3 Snuffers + darkness wave (lit radius -1 for 10s).
//   P3 (<33% HP): destroys 1 tower every 15s (boss.nextDestroyAt).
//   P4 Awakening only (<15% HP): Eclipse Unbound — speed +50%, continuous
//       Skitterer summons (1 per 3s), slow-immune.
// Boss-phase enemies always drop Lumen (sim: reward on every summon kill).
// Boss moves along state.path like a normal enemy (tile stepping, moveAcc
// in [0,1) = progress to next tile). Leak damage at Core: 5.

export const BOSS = {
  id: 'boss', name: 'Eclipse Sovereign', hp: 3000, speed: 0.4,
  reward: 0, leak: 5, armor: 0,
  phase2At: 0.66, phase3At: 0.33, phase4At: 0.15,
  p2SummonCount: 3, p2SummonRole: 'snuffer',
  darknessDuration: 10, darknessRadiusDelta: -1,
  p3DestroyInterval: 15,
  p4SpeedMul: 1.5, p4SummonInterval: 3, p4SummonRole: 'skitterer',
  flareImmunityBreak: 6,
};

export function bossPhase(boss) {
  if (!boss) return 1;
  const frac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  if (boss.difficulty === 'awakening' && frac < BOSS.phase4At) return 4;
  if (frac < BOSS.phase3At) return 3;
  if (frac < BOSS.phase2At) return 2;
  return 1;
}

export function createBoss(difficulty = 'radiant') {
  // Sim places the boss on the path: boss.q/r start at path[0] (sim sets
  // them right after creation; bossTick also re-syncs to path[0] while
  // pathIndex is 0 and q/r are still 0,0). Difficulty multipliers are
  // applied by the sim on baseHp/baseSpeed, same as createEnemy.
  return {
    id: 'boss', role: 'boss', name: BOSS.name,
    hp: BOSS.hp, maxHp: BOSS.hp,
    baseHp: BOSS.hp, baseSpeed: BOSS.speed,
    difficulty,
    phase: 1, q: 0, r: 0, pathIndex: 0, progress: 0, moveAcc: 0,
    speed: BOSS.speed, reward: BOSS.reward, leak: BOSS.leak, armor: 0,
    cloaked: false,
    immune: true, immuneBrokenUntil: 0,
    nextDestroyAt: 0, darknessUntil: 0, summonTimer: 0,
    slowUntil: 0, slowMul: 0.5, slowImmune: false,
    stunUntil: 0, revealedUntil: 0,
    p2Triggered: false, p3Triggered: false, p4Triggered: false,
    done: false, reachedCore: false,
  };
}

function litPylonCount(state) {
  const pylons = (state && state.pylons) || [];
  let n = 0;
  for (const p of pylons) if (p.lit && p.hp > 0) n++;
  return n;
}

function nearestTower(state, q, r) {
  const towers = (state && state.towers) || [];
  let best = null, bestD = Infinity;
  for (const tw of towers) {
    if (tw.destroyed) continue;
    const dq = q - tw.q, dr = r - tw.r;
    const d = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    if (d < bestD) { bestD = d; best = tw; }
  }
  return best;
}

// One fixed-step tick. Events the sim consumes:
//   {type:'phase', id:'boss', phase, prevPhase}
//   {type:'immunity', id:'boss', immune}            (only on change)
//   {type:'summon', id:'boss', role, count, q, r}   (sim spawns via createEnemy)
//   {type:'darkness', id:'boss', until, radiusDelta, duration}
//   {type:'destroyTower', id:'boss', towerId, q, r} (sim removes the tower)
//   {type:'move', id:'boss', q, r, pathIndex, progress}
//   {type:'leak', id:'boss', damage:5, q, r}
//   {type:'die', id:'boss', reward:0}               (victory — sim checks this)
export function bossTick(boss, state, dt) {
  const events = [];
  if (!boss || boss.done) return events;
  const t = (state && state.time) || 0;

  if (boss.hp <= 0) {
    boss.done = true;
    boss.immune = false;
    events.push({ type: 'die', id: 'boss', role: 'boss', reward: 0 });
    return events;
  }
  if (dt <= 0) return events;

  // --- Phase transitions (checked every tick; entry effects fire once) ---
  const phase = bossPhase(boss);
  if (phase !== boss.phase) {
    const prev = boss.phase;
    boss.phase = phase;
    events.push({ type: 'phase', id: 'boss', phase, prevPhase: prev });
    if (phase === 2 && !boss.p2Triggered) {
      boss.p2Triggered = true;
      boss.darknessUntil = t + BOSS.darknessDuration;
      events.push({ type: 'summon', id: 'boss', role: BOSS.p2SummonRole, count: BOSS.p2SummonCount, q: boss.q, r: boss.r });
      events.push({ type: 'darkness', id: 'boss', until: boss.darknessUntil, radiusDelta: BOSS.darknessRadiusDelta, duration: BOSS.darknessDuration });
    }
    if (phase === 3 && !boss.p3Triggered) {
      boss.p3Triggered = true;
      boss.nextDestroyAt = t + BOSS.p3DestroyInterval;
    }
    if (phase === 4 && !boss.p4Triggered) {
      boss.p4Triggered = true;
      boss.slowImmune = true;
      // +50% on top of whatever speed the sim set (preserves difficulty mult).
      boss.speed = boss.speed * BOSS.p4SpeedMul;
      boss.summonTimer = 0;
    }
  }

  // --- P1 immunity: broken while >=3 Pylons lit, or 6s after a Flare ---
  if (boss.phase === 1) {
    const broken = t < boss.immuneBrokenUntil || litPylonCount(state) >= 3;
    const immune = !broken;
    if (immune !== boss.immune) {
      boss.immune = immune;
      events.push({ type: 'immunity', id: 'boss', immune });
    }
  } else if (boss.immune) {
    boss.immune = false;
    events.push({ type: 'immunity', id: 'boss', immune: false });
  }

  // --- P3: destroy 1 tower every 15s ---
  if (boss.phase >= 3 && boss.nextDestroyAt && t >= boss.nextDestroyAt) {
    boss.nextDestroyAt = t + BOSS.p3DestroyInterval;
    const target = nearestTower(state, boss.q, boss.r);
    if (target) {
      events.push({ type: 'destroyTower', id: 'boss', towerId: target.id, q: target.q, r: target.r });
    }
    // No towers left: timer still advances, no event spam.
  }

  // --- P4 Awakening: continuous Skitterer summons, 1 per 3s ---
  if (boss.phase === 4) {
    boss.summonTimer += dt;
    while (boss.summonTimer >= BOSS.p4SummonInterval) {
      boss.summonTimer -= BOSS.p4SummonInterval;
      events.push({ type: 'summon', id: 'boss', role: BOSS.p4SummonRole, count: 1, q: boss.q, r: boss.r });
    }
  }

  if (t < boss.stunUntil) return events; // stunned (Solar Flare): no movement

  // --- Movement along the path (same tile stepping as enemies) ---
  const path = (state && state.path) || [];
  if (!path.length) return events;
  if (boss.pathIndex === 0 && boss.q === 0 && boss.r === 0) {
    boss.q = path[0].q; boss.r = path[0].r; // spawn sync (sim may set this itself)
  }
  if (boss.pathIndex >= path.length - 1) {
    boss.done = true;
    boss.reachedCore = true;
    events.push({ type: 'leak', id: 'boss', role: 'boss', damage: BOSS.leak, q: boss.q, r: boss.r });
    return events;
  }
  let speed = boss.speed;
  if (!boss.slowImmune && boss.slowUntil && t < boss.slowUntil) speed *= (boss.slowMul ?? 0.5);
  boss.moveAcc += dt * speed;
  let moved = false;
  while (boss.moveAcc >= 1) {
    boss.moveAcc -= 1;
    boss.pathIndex += 1;
    boss.q = path[boss.pathIndex].q;
    boss.r = path[boss.pathIndex].r;
    boss.progress = boss.pathIndex;
    moved = true;
    if (boss.pathIndex >= path.length - 1) {
      boss.done = true;
      boss.reachedCore = true;
      events.push({ type: 'leak', id: 'boss', role: 'boss', damage: BOSS.leak, q: boss.q, r: boss.r });
      return events;
    }
  }
  if (moved) events.push({ type: 'move', id: 'boss', role: 'boss', q: boss.q, r: boss.r, pathIndex: boss.pathIndex, progress: boss.moveAcc });
  return events;
}
