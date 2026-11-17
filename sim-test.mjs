// HEXEMBER — sim-test.mjs
// Headless Node test: imports the REAL sim modules and plays waves 1-10
// with a scripted auto-player (builds towers/pylons, uses Flare and
// Overcharge, picks boons). No browser, no rendering, no DOM.
// Run: `node sim-test.mjs` — prints PASS/FAIL per assertion + a summary.
// Exit code 0 = all pass, 1 = any failure.

import { createSim, stepSim, startWave, placeTower, placePylon, evolveTower, useFlare, useOvercharge, chooseBoon } from './game/src/sim.js';
import { buildWave, WAVE_COUNT, BOSS_WAVE, BOON_WAVES } from './game/src/waves.js';
import { hexDistance, buildPath, hexNeighbors } from './game/src/hex.js';
import { computeLit, isLit } from './game/src/light.js';
import { awardLumen, spendLumen } from './game/src/economy.js';
import { getDifficulty, DIFFICULTY_IDS } from './game/src/difficulty.js';
import { gradeFor, saveRun, loadTopRuns, bestScore } from './game/src/ranking.js';
import { TICK } from './game/src/config.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const PATH = buildPath();
const onPath = (q, r) => PATH.some((t) => t.q === q && t.r === r);
const minDistToPath = (q, r) => Math.min(...PATH.map((t) => hexDistance({ q, r }, t)));
const distToCore = (q, r) => hexDistance({ q, r }, { q: 0, r: 0 });

// All buildable tiles, best first: closest to the path, then to the Core.
function candidateTiles() {
  const tiles = [];
  for (let q = -5; q <= 5; q++) {
    const rMin = Math.max(-5, -q - 5);
    const rMax = Math.min(5, -q + 5);
    for (let r = rMin; r <= rMax; r++) {
      if (!onPath(q, r)) tiles.push({ q, r });
    }
  }
  tiles.sort((a, b) => minDistToPath(a.q, a.r) - minDistToPath(b.q, b.r) || distToCore(a.q, a.r) - distToCore(b.q, b.r));
  return tiles;
}

// Pylon spots that extend light along the path (checked in this order).
const PYLON_SPOTS = [
  { q: 3, r: 1 }, { q: 3, r: -1 }, { q: 4, r: 1 }, { q: 4, r: -1 },
  { q: 2, r: 2 }, { q: 2, r: -2 }, { q: 1, r: 2 }, { q: 1, r: -2 },
  { q: 0, r: 3 }, { q: 0, r: -3 },
];
const TOWER_ROTATION = ['lance', 'prism', 'mortar', 'heliotrope', 'pylonSuar', 'prism', 'lance', 'mortar', 'prism', 'heliotrope', 'lance'];
const EVO_PICK = { prism: 'arcConductor', lance: 'zenithRailgun', mortar: 'seismicCore', heliotrope: 'solarObelisk', pylonSuar: 'amplifierNode' };

function autoBuild(state) {
  // 0) Emergency, boss fight only: boss Phase 1 needs >= 3 lit Pylons
  // to be damageable. If fewer than 3 are lit while the boss lives, a
  // replacement Pylon outranks everything. (Not before the boss — early
  // waves snowball faster by spending that Lumen on towers instead.)
  const litPylons = state.pylons.filter((p) => p.lit).length;
  if (state.boss && litPylons < 3) {
    for (const s of PYLON_SPOTS) {
      if (state.lumen < 30) break;
      if (placePylon(state, s.q, s.r).ok) break;
    }
  }
  // 1) Pylons first — light unlocks the tiles towers need — but never
  // spend the tower budget on pylons: at most 2 while lumen is tight,
  // more only when rich (lumen >= 150), max 6 total.
  for (const s of PYLON_SPOTS) {
    if (state.pylons.length >= 6) break;
    if (state.pylons.length >= 2 && state.lumen < 150) break;
    if (state.lumen < 90) break;
    placePylon(state, s.q, s.r);
  }
  // 2) Towers on the best lit tiles, rotating types. A failed placement
  // (too expensive / dark / occupied) moves to the NEXT type — retrying
  // the same unaffordable type on every tile builds nothing.
  let i = 0;
  for (const t of candidateTiles()) {
    if (state.lumen < 50) break;
    const type = TOWER_ROTATION[i % TOWER_ROTATION.length];
    i++;
    placeTower(state, type, t.q, t.r);
  }
  // 3) Evolve when rich.
  if (state.lumen > 120) {
    for (const t of [...state.towers]) {
      if (!t.evo && EVO_PICK[t.type] && state.lumen > 120) {
        evolveTower(state, t.id, EVO_PICK[t.type]);
      }
    }
  }
  // 4) Extra pylons when rich, after towers + evolutions.
  for (const s of PYLON_SPOTS) {
    if (state.pylons.length >= 6 || state.lumen < 90) break;
    placePylon(state, s.q, s.r);
  }
}

// ---------------------------------------------------------------- unit checks
console.log('--- unit checks ---');
check('TICK is 1/60', TICK === 1 / 60, `got ${TICK}`);
check('path has 6 tiles spawn->Core', PATH.length === 6 && PATH[0].q === 5 && PATH[5].q === 0 && PATH[5].r === 0);
check('hexDistance (0,0)-(2,1) is 3', hexDistance({ q: 0, r: 0 }, { q: 2, r: 1 }) === 3);
check('hexNeighbors returns 6', hexNeighbors(0, 0).length === 6);
check('wave 1 spawns 6 skitterers', buildWave(1, 'radiant').spawns.find((s) => s.role === 'skitterer')?.count === 6);
check('wave 3 has stalkers, wave 2 does not', buildWave(3, 'radiant').spawns.some((s) => s.role === 'stalker') && !buildWave(2, 'radiant').spawns.some((s) => s.role === 'stalker'));
check('wave 4 has snuffers', buildWave(4, 'radiant').spawns.some((s) => s.role === 'snuffer'));
check('wave 6 has brutes', buildWave(6, 'radiant').spawns.some((s) => s.role === 'brute'));
check('wave 10 has the boss', buildWave(10, 'radiant').spawns.some((s) => s.role === 'boss'));
check('WAVE_COUNT 10 / BOSS_WAVE 10 / BOON_WAVES 3,6,9', WAVE_COUNT === 10 && BOSS_WAVE === 10 && JSON.stringify(BOON_WAVES) === '[3,6,9]');
check('4 difficulty ids', JSON.stringify(DIFFICULTY_IDS) === JSON.stringify(['ember', 'radiant', 'eclipse', 'awakening']));
check('awakening has bossPhase4, ember coreHP 12', getDifficulty('awakening').bossPhase4 === true && getDifficulty('ember').coreMaxHP === 12);
check('unknown difficulty falls back to radiant', getDifficulty('nope').id === 'radiant');
check('gradeFor S/A/B/null', gradeFor({ stars: 3, won: true }) === 'S' && gradeFor({ stars: 2, won: true }) === 'A' && gradeFor({ stars: 1, won: true }) === 'B' && gradeFor({ stars: 0, won: false }) === null);
{
  const before = bestScore();
  saveRun({ score: 12345, wave: 10, grade: 'S', date: '2026-11-17' });
  const top = loadTopRuns();
  check('ranking save/load round-trip (memory fallback)', top.length > 0 && top[0].score >= 12345 && bestScore() >= Math.max(before, 12345));
}

// ---------------------------------------------------------------- sim checks
console.log('--- sim checks ---');
const sim = createSim('radiant');
check('createSim radiant: build phase, core 10/10, lumen 150', sim.phase === 'build' && sim.coreHP === 10 && sim.coreMaxHP === 10 && sim.lumen === 150);
check('Core tile is lit, spawn tile is dark', isLit(sim, 0, 0) && !isLit(sim, 5, 0));
check('computeLit contains the Core', computeLit(sim).has('0,0'));
{
  const s2 = createSim('ember');
  check('ember core HP is 12', s2.coreMaxHP === 12 && s2.coreHP === 12);
  awardLumen(s2, 10);
  check('awardLumen adds + tracks collected', s2.lumen === 160 && s2.lumenCollected === 10);
  check('spendLumen true on success, false when broke', spendLumen(s2, 50) === true && s2.lumen === 110 && spendLumen(s2, 9999) === false && s2.lumen === 110);
}
check('placeTower rejects on-path tile', placeTower(sim, 'prism', 3, 0).ok === false);
check('placeTower rejects dark tile', placeTower(sim, 'prism', 5, 1).ok === false);
check('placeTower rejects unknown type', placeTower(sim, 'deathray', 1, 1).ok === false);
{
  const broke = createSim('radiant');
  broke.lumen = 0;
  check('placeTower rejects when broke', placeTower(broke, 'prism', 1, 1).ok === false);
  check('placePylon rejects when broke', placePylon(broke, 3, 1).ok === false);
}
{
  const p = placePylon(sim, 3, 1);
  check('placePylon on dark tile ok (pylons extend light)', p.ok === true);
  check('tile next to new pylon is now lit', isLit(sim, 2, 1) === true);
  const t = placeTower(sim, 'prism', 2, 1);
  check('placeTower on newly lit tile ok', t.ok === true);
  check('placeTower rejects occupied tile', placeTower(sim, 'lance', 2, 1).ok === false);
  const evo = evolveTower(sim, t.tower.id, 'arcConductor');
  check('evolveTower prism -> arcConductor ok', evo.ok === true && sim.towers[0].evo === 'arcConductor', JSON.stringify(evo));
  check('evolveTower rejects second evolution', evolveTower(sim, t.tower.id, 'gatlingSpire').ok === false);
  check('evolveTower rejects wrong-base evo', evolveTower(sim, t.tower.id, 'zenithRailgun').ok === false);
}
{
  const f = useFlare(sim, 3, 0);
  check('useFlare ok, then on cooldown', f.ok === true && useFlare(sim, 3, 0).ok === false);
  check('useOvercharge ok on a tower', useOvercharge(sim, sim.towers[0].id).ok === true);
  check('chooseBoon rejects outside boon phase', chooseBoon(sim, 'glassSupernova').ok === false);
}

// ---------------------------------------------------------------- auto-play waves 1-10
console.log('--- auto-play waves 1-10 ---');
const game = createSim('radiant');
autoBuild(game);
let wavesCleared = 0;
let boonsChosen = 0;
let softLock = false;
let steps = 0;
const MAX_STEPS_PER_WAVE = 60 * 300; // 5 sim-minutes per wave, then it is a soft-lock
const MAX_TOTAL_STEPS = 60 * 60 * 30;

while (game.phase !== 'victory' && game.phase !== 'gameover' && steps < MAX_TOTAL_STEPS) {
  if (game.phase === 'build') {
    autoBuild(game);
    const started = startWave(game);
    if (!started.ok) { softLock = true; break; }
  } else if (game.phase === 'boon') {
    const pick = game.boonChoices[0];
    const res = chooseBoon(game, pick);
    if (res.ok) boonsChosen++;
    else { softLock = true; break; }
  } else if (game.phase === 'wave') {
    let waveSteps = 0;
    const waveNo = game.wave;
    while (game.phase === 'wave' && waveSteps < MAX_STEPS_PER_WAVE) {
      stepSim(game, {}, TICK);
      steps++;
      waveSteps++;
      // Auto-player micro-actions, once per sim-second.
      if (game.tick % 60 === 0) {
        autoBuild(game);
        // Flare on the boss whenever it is ready: breaks P1 immunity,
        // stuns, and reveals — useful in every phase, not just P1.
        if (game.boss) {
          useFlare(game, game.boss.q, game.boss.r);
        }
        if (game.towers.length) useOvercharge(game, game.towers[0].id);
      }
    }
    if (game.phase === 'wave') { softLock = true; break; } // wave never ended
    if (game.phase === 'build' || game.phase === 'boon') wavesCleared++;
    console.log(`  wave ${waveNo} done: phase=${game.phase} coreHP=${game.coreHP} kills=${game.kills} lumen=${Math.round(game.lumen)} towers=${game.towers.length} pylons=${game.pylons.length} score=${game.score}`);
  } else {
    softLock = true;
    break;
  }
}

check('auto-play reached wave 10', game.wave === 10, `wave=${game.wave}`);
check('no soft-lock (every wave terminated)', softLock === false);
check('game terminated (victory or gameover)', game.phase === 'victory' || game.phase === 'gameover', `phase=${game.phase}`);
check('enemies died (kills > 0)', game.kills > 0, `kills=${game.kills}`);
check('Lumen flowed (collected > 0)', game.lumenCollected > 0, `collected=${game.lumenCollected}`);
check('towers were built', game.towersBuilt > 0, `built=${game.towersBuilt}`);
check('boon offered after waves 3/6/9 and chosen', boonsChosen === 3, `chosen=${boonsChosen}`);
check('score grew (kills + wave bonuses)', game.score > 0, `score=${game.score}`);
if (game.phase === 'victory') {
  check('victory: stars 1-3 and grade set', game.stars >= 1 && game.stars <= 3 && ['S', 'A', 'B'].includes(game.grade), `stars=${game.stars} grade=${game.grade}`);
  console.log(`  VICTORY stars=${game.stars} grade=${game.grade} score=${game.score} kills=${game.kills} lumenCollected=${Math.round(game.lumenCollected)} time=${Math.round(game.time)}s`);
} else {
  console.log(`  GAMEOVER at wave ${game.wave}: coreHP=${game.coreHP} kills=${game.kills} score=${game.score} (termination asserted, balance is a tuning note)`);
}

// ---------------------------------------------------------------- summary
console.log('---');
console.log(`TOTAL: ${pass} passed, ${fail} failed${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`);
process.exit(fail ? 1 : 0);
