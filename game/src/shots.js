// HEXEMBER — deterministic screenshots (F). ?shot=<scene>&seed=<n> renders
// one exact scene: same query = same pixels. No audio, no wall-clock time,
// no Math.random in shot mode — mulberry32(seed) only. 1280x720.
// buildShotState() returns a SIM-SHAPED state (same fields as sim.js:
// towers {type,evo,q,r}, enemies {role,q,r,pathIndex,hp,maxHp},
// boss {hp,maxHp,phase}, pylons {q,r,lit}, flare {activeUntil,...}).
// renderShot() uses the REAL three.js renderer (render.js) + the real
// HUD/screens DOM. There is no 2D fallback: the real path is verified by
// smoke-test.mjs (22/22, byte-identical determinism); if it ever throws,
// renderShot reports window.__hexemberShotRenderer = 'error'.

import { computeLit } from './light.js';
import { buildPath, buildPaths } from './hex.js';

export const SHOT_WIDTH = 1280;
export const SHOT_HEIGHT = 720;

export const SHOT_SCENES = {
  title: { label: 'Title', wave: 0, desc: 'Island lit, no enemies, difficulty select visible (Ember/Radiant/Eclipse/Awakening + "!" badge).' },
  play: { label: 'Play', wave: 5, desc: 'Wave 5 mid-action, 8 towers placed, enemies on both lanes, Flare active, towers firing, HUD visible.' },
  boss: { label: 'Boss', wave: 10, desc: 'Wave 10, Eclipse Sovereign at 60% HP on lane A with 4 escorts on the B flank, HUD visible.' },
  victory: { label: 'Victory', wave: 10, desc: 'Victory screen, 3 stars, grade S, top 5 table with seeded sample entries.' },
};

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The REAL invasion paths (hex.js/sim.js): A straight line spawn -> Core,
// B the long flank that forks at the second tile and rejoins at (0,1).
const PATH = buildPath();
const PATHS = buildPaths();
const PYLONS = [
  { id: 'pylon-1', q: 3, r: 1, lit: true, hp: 3 },
  { id: 'pylon-2', q: 3, r: -1, lit: true, hp: 3 },
  { id: 'pylon-3', q: 0, r: 3, lit: true, hp: 3 },
];
// Towers on lit tiles next to the paths (real types + real evo ids).
// All 8 sit off BOTH lanes; t1/t2/t3/t7 stand within range of B-lane tiles.
const PLAY_TOWERS = [
  { id: 't1', type: 'prism', evo: 'arcConductor', q: 2, r: 3 },
  { id: 't2', type: 'heliotrope', evo: null, q: 2, r: 1 },
  { id: 't3', type: 'lance', evo: null, q: 1, r: 1 },
  { id: 't4', type: 'mortar', evo: 'seismicCore', q: 2, r: -1 },
  { id: 't5', type: 'prism', evo: null, q: 1, r: -1 },
  { id: 't6', type: 'pylonSuar', evo: 'amplifierNode', q: 4, r: -1 },
  { id: 't7', type: 'lance', evo: 'zenithRailgun', q: 1, r: 3 },
  { id: 't8', type: 'prism', evo: 'gatlingSpire', q: 3, r: -2 },
];
const ENEMY_ROLES = ['skitterer', 'stalker', 'snuffer', 'brute'];
const RUN_NAMES = ['Astra', 'Bima', 'Citra', 'Dewi', 'Elang', 'Fajar', 'Gita', 'Hana'];

// Evo id -> render level (models.js: 0 base, 1 evolved, 2 crowned).
// The two evo branches per tower look distinct: the first-listed evo of
// each pair gets the level-2 treatment, the second stays level 1.
const EVO_LEVEL = {
  arcConductor: 2, gatlingSpire: 1,
  solarObelisk: 2, flareProjector: 1,
  zenithRailgun: 2, beaconSeeker: 1,
  seismicCore: 2, novaCluster: 1,
  sanctuarySpire: 2, amplifierNode: 1,
};
export function evoLevel(evo) {
  if (!evo) return 0;
  return EVO_LEVEL[evo] ?? 1;
}

function seededBestRuns(seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const runs = [];
  let score = 52000 + Math.floor(rng() * 8000);
  for (let i = 0; i < 5; i++) {
    const day = 10 + Math.floor(rng() * 7); // fixed base 2026-11-10 + offset
    runs.push({
      rank: i + 1,
      score,
      wave: i === 0 ? 10 : 8 + Math.floor(rng() * 3),
      grade: i === 0 ? 'S' : (rng() < 0.5 ? 'A' : 'B'),
      date: `2026-11-${String(day).padStart(2, '0')}`,
      name: RUN_NAMES[Math.floor(rng() * RUN_NAMES.length)],
    });
    score -= 4000 + Math.floor(rng() * 5000);
  }
  return runs;
}

export function buildShotState(scene, seed = 1) {
  const s = String(scene || '').toLowerCase();
  if (!SHOT_SCENES[s]) throw new Error(`unknown shot scene: ${scene}`);
  const rng = mulberry32(seed);
  // Sim-shaped base: same field names/casing as sim.js createSim().
  const base = {
    scene: s, seed, time: 0, tick: 0, // fixed time: never wall-clock in shot mode
    phase: 'build', wave: 0, waveTotal: 10,
    difficulty: { id: 'radiant', hpMul: 1, speedMul: 1, dropsMul: 1, drainMul: 1, coreMaxHP: 10, bossPhase4: false },
    coreHP: 10, coreMaxHP: 10, coreHp: 10, coreMax: 10,
    lumen: 120, score: 0, kills: 0, towersBuilt: 0, lumenCollected: 0,
    towers: [], enemies: [], pylons: PYLONS.map((p) => ({ ...p })),
    boss: null, boons: [], boonChoices: [],
    flare: { activeUntil: 0, q: 0, r: 0, radius: 2, cooldownUntil: 0 },
    overcharge: { cooldownUntil: 0 },
    burnTiles: [], darknessUntil: 0, path: PATH, paths: PATHS,
    events: [], stars: 0, grade: null, bestRuns: [], bestScore: 0,
    stats: { wave: 0, wavesReached: 0, kills: 0, enemiesKilled: 0, lumen: 0, lumenCollected: 0, towers: 0, towersBuilt: 0, timeSec: 0, playTimeSeconds: 0 },
  };
  const withLit = (st) => ({ ...st, litTiles: computeLit(st) });
  if (s === 'title') {
    const bestRuns = seededBestRuns(seed);
    return withLit({ ...base, phase: 'build', wave: 0, lumen: 120, bestRuns, bestScore: bestRuns[0].score });
  }
  if (s === 'play') {
    const enemies = [];
    // 14 enemies, 7 per lane, spread along each lane so both invasions
    // read at a glance (A has 6 tiles, B has 8 — one A tile repeats).
    const A_SPREAD = [0, 1, 2, 3, 4, 5, 3];
    const B_SPREAD = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 0; i < 7; i++) {
      const hp = 60 + Math.floor(rng() * 40);
      const aAt = PATH[A_SPREAD[i]];
      enemies.push({
        id: `enemy-a${i}`, role: ENEMY_ROLES[i % ENEMY_ROLES.length],
        q: aAt.q, r: aAt.r, pathIndex: A_SPREAD[i], pathId: 'A', hp, maxHp: 100,
      });
      const bAt = PATHS.B[B_SPREAD[i]];
      enemies.push({
        id: `enemy-b${i}`, role: ENEMY_ROLES[(i + 2) % ENEMY_ROLES.length],
        q: bAt.q, r: bAt.r, pathIndex: B_SPREAD[i], pathId: 'B', hp, maxHp: 100,
      });
    }
    const towers = PLAY_TOWERS.map((t) => ({ ...t, cooldown: 0, beamTo: null }));
    // Four towers visibly firing beams at enemies on both lanes.
    towers[0].beamTo = { q: enemies[1].q, r: enemies[1].r }; // B lane
    towers[1].beamTo = { q: enemies[0].q, r: enemies[0].r }; // A lane
    towers[2].beamTo = { q: enemies[3].q, r: enemies[3].r }; // B lane
    towers[3].beamTo = { q: enemies[2].q, r: enemies[2].r }; // A lane
    return withLit({
      ...base, phase: 'wave', wave: 5, lumen: 340, coreHP: 8, coreHp: 8,
      score: 12450, kills: 87, towersBuilt: 8, lumenCollected: 1180,
      towers, enemies,
      // Flare ACTIVE over the B flank: visible radius + lit B-lane tiles.
      flare: { activeUntil: 4, q: 3, r: 2, radius: 2, cooldownUntil: 0 },
      stats: { wave: 5, wavesReached: 5, kills: 87, enemiesKilled: 87, lumen: 1180, lumenCollected: 1180, towers: 8, towersBuilt: 8, timeSec: 312, playTimeSeconds: 312 },
    });
  }
  if (s === 'boss') {
    const enemies = [];
    for (let i = 0; i < 4; i++) {
      // Escorts ride the B flank while the Sovereign takes lane A.
      const at = PATHS.B[1 + i];
      enemies.push({
        id: `enemy-${i}`, role: ENEMY_ROLES[i % ENEMY_ROLES.length],
        q: at.q, r: at.r, pathIndex: 1 + i, pathId: 'B', hp: 80, maxHp: 100,
      });
    }
    const towers = PLAY_TOWERS.map((t) => ({ ...t, cooldown: 0, beamTo: null }));
    towers[1].beamTo = { q: 3, r: 0 }; // heliotrope beam on the boss
    towers[2].beamTo = { q: 3, r: 0 };
    towers[0].beamTo = { q: enemies[0].q, r: enemies[0].r }; // prism beam on a B escort
    return withLit({
      ...base, phase: 'wave', wave: 10, lumen: 520, coreHP: 6, coreHp: 6,
      score: 48200, kills: 243, towersBuilt: 8, lumenCollected: 2100,
      towers, enemies,
      boss: { id: 'boss', role: 'boss', name: 'Eclipse Sovereign', hp: 1800, maxHp: 3000, phase: 2, q: 3, r: 0, pathIndex: 2 },
      stats: { wave: 10, wavesReached: 10, kills: 243, enemiesKilled: 243, lumen: 2100, lumenCollected: 2100, towers: 8, towersBuilt: 8, timeSec: 640, playTimeSeconds: 640 },
    });
  }
  // victory
  const bestRuns = seededBestRuns(seed);
  return withLit({
    ...base, phase: 'victory', wave: 10, lumen: 860, coreHP: 10, coreHp: 10,
    score: bestRuns[0].score, kills: 312, towersBuilt: 9, lumenCollected: 2450,
    stars: 3, grade: 'S', bestRuns, bestScore: bestRuns[0].score,
    stats: { wave: 10, wavesReached: 10, kills: 312, enemiesKilled: 312, lumen: 2450, lumenCollected: 2450, towers: 9, towersBuilt: 9, timeSec: 742, playTimeSeconds: 742 },
  });
}

export function getShotQuery() {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get('shot'), seed: parseInt(p.get('seed') || '1', 10) || 1 };
}

export function isShotMode() {
  return !!getShotQuery().shot;
}

// ---- renderShot: REAL three.js renderer, no fallback ----
export async function renderShot(scene, seed = 1) {
  const state = buildShotState(scene, seed);
  let canvas = document.querySelector('#game canvas') || document.querySelector('canvas');
  if (!canvas) { // shot mode before main.js built its canvas: make one
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  }
  canvas.width = SHOT_WIDTH; canvas.height = SHOT_HEIGHT;
  canvas.style.width = `${SHOT_WIDTH}px`; canvas.style.height = `${SHOT_HEIGHT}px`;
  let rendered = 'error';
  try {
    const { createRenderer } = await import('./render.js');
    const view = createRenderer(canvas);
    // Freeze wall-clock for this one frame: render() reads
    // performance.now() for bob/pulse (and FX for shake), so a fixed
    // clock is what makes two renders byte-identical.
    const origNow = performance.now.bind(performance);
    performance.now = () => 0;
    try {
      const viewState = {
        ...state,
        towers: state.towers.map((t) => ({ ...t, evo: evoLevel(t.evo) })),
      };
      view.render(viewState, {
        selected: null, hoverHex: null, ghostValid: false,
        panDelta: { x: 0, y: 0 }, keys: new Set(),
      });
    } finally {
      performance.now = origNow;
    }
    rendered = 'three';
  } catch (err) {
    console.error('HEXEMBER shot: real renderer failed', err);
  }
  // DOM overlays on top of the 3D frame (real HUD / real screens).
  try {
    if (scene === 'title') {
      const { showTitle } = await import('./screens.js');
      showTitle({ bestScore: state.bestScore, topRuns: state.bestRuns, onStart: () => {} });
    } else if (scene === 'victory') {
      const { showVictory } = await import('./screens.js');
      showVictory({
        stars: state.stars, grade: state.grade, stats: state.stats,
        topRuns: state.bestRuns, onAgain: () => {}, onTitle: () => {},
      });
    } else {
      const { initHUD, updateHUD } = await import('./hud.js');
      initHUD({});
      updateHUD({ ...state, now: state.time, paused: false, speed: 1, muted: false, selected: null });
    }
  } catch (err) {
    console.error('HEXEMBER shot: overlay failed', err);
  }
  window.__hexemberShotRenderer = rendered;
  return state;
}
