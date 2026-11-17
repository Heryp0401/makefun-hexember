// HEXEMBER — main.js (INTEGRATOR glue)
// Boot, fixed-timestep game loop, state machine, sim/render/HUD/input/audio
// wiring. The sim (sim.js) owns all game rules; this file only connects
// modules and translates between their contracts.
//   title -> build -> wave -> boon -> victory / gameover
// ?shot= mode: no audio, no wall-clock, one deterministic renderShot().

import { createSim, stepSim, startWave, placeTower, placePylon, evolveTower, useFlare, useOvercharge, chooseBoon } from './sim.js';
import { createRenderer } from './render.js';
import { initHUD, updateHUD, selectTower as hudSelectTower, setPaused as hudSetPaused, setSpeed as hudSetSpeed, setMuted as hudSetMuted, showToast } from './hud.js';
import { showTitle, showBoonChoice, showVictory, showGameOver, showPauseMenu, hideScreens, getCurrentScreen } from './screens.js';
import { createInput } from './input.js';
import { ensureAudio, startMusic, setMuted as audioSetMuted, setMusicIntensity, playSFX, isMuted } from './audio.js';
import { getShotQuery, isShotMode, renderShot, evoLevel } from './shots.js';
import { TICK } from './config.js';
import { BOONS } from './boons.js';
import { EVOLUTIONS } from './evolutions.js';
import { saveRun, loadTopRuns, bestScore } from './ranking.js';
import { computeLit } from './light.js';

const gameEl = document.getElementById('game');
const hudEl = document.getElementById('hud');
const screensEl = document.getElementById('screens');

// ---------------------------------------------------------------- canvas
const canvas = document.createElement('canvas');
canvas.id = 'hexember-canvas';
gameEl.appendChild(canvas);

// ---------------------------------------------------------------- game state
// Declared BEFORE the shot-mode branch: bootGame() runs at module scope
// and touches these, so they must not sit in the temporal dead zone.
let sim = createSim('radiant');
sim.phase = 'title';
let renderer = null;
let input = null;
let uiState = null;
let selected = null; // tower type selected for placement, or null
let paused = false;
let speed = 1;
let muted = false;
let lastTowerId = null;
let mouseInside = false;
let boonShownForWave = -1;
let endShown = false;

// ---------------------------------------------------------------- shot mode
// One deterministic frame, no audio, no loop, no wall-clock. renderShot()
// (shots.js) uses the real three.js renderer + real HUD/screens DOM.
if (isShotMode()) {
  const { shot, seed } = getShotQuery();
  renderShot(shot, seed).catch((err) => {
    console.error('HEXEMBER shot failed', err);
    window.__hexemberShotRenderer = 'error';
  });
} else {
  bootGame();
}

function viewState() {
  // The shape input.js/hud.js/render.js read: sim fields + a few extras.
  return {
    ...sim,
    lit: sim._lit || computeLit(sim),
    litTiles: sim._lit || computeLit(sim),
    occupied: [...sim.towers, ...sim.pylons],
    now: sim.time,
    paused, speed, muted,
    selected,
    totalWaves: 10,
  };
}

function renderState() {
  // render.js wants numeric evo levels (0 base / 1 evolved / 2 crowned);
  // the sim stores the evo ID string (or null). Map without mutating sim.
  return {
    ...sim,
    litTiles: sim._lit || computeLit(sim),
    towers: sim.towers.map((t) => ({ ...t, evo: evoLevel(t.evo) })),
  };
}

function blurButtons(container) {
  // After a click, blur the button so Space does not re-trigger it.
  container.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => b.blur());
  });
}

function setHudVisible(v) {
  hudEl.style.display = v ? '' : 'none';
}

function toTitle() {
  sim = createSim('radiant');
  sim.phase = 'title';
  selected = null;
  paused = false;
  speed = 1;
  boonShownForWave = -1;
  endShown = false;
  if (input) input.setSelected(null);
  hudSelectTower(null);
  hudSetPaused(false);
  hudSetSpeed(1);
  setHudVisible(false);
  showTitle({
    bestScore: bestScore(),
    topRuns: loadTopRuns(),
    onStart: (diffId) => startRun(diffId),
  });
}

function startRun(difficultyId = 'radiant') {
  sim = createSim(difficultyId);
  sim.phase = 'build';
  selected = null;
  paused = false;
  speed = 1;
  lastTowerId = null;
  boonShownForWave = -1;
  endShown = false;
  if (input) { input.setSelected(null); input.setSimState(viewState()); }
  hudSelectTower(null);
  hudSetPaused(false);
  hudSetSpeed(1);
  setHudVisible(true);
  hideScreens();
  ensureAudio();
  startMusic();
  setMusicIntensity(0.3);
  updateHUD(viewState());
}

function restartRun() {
  startRun(sim.difficulty ? sim.difficulty.id : 'radiant');
}

function setSelected(type) {
  selected = type || null;
  hudSelectTower(selected);
  if (input) input.setSelected(selected);
}

function doPlace(type, q, r) {
  const res = type === 'pylon' ? placePylon(sim, q, r) : placeTower(sim, type, q, r);
  if (res.ok) {
    lastTowerId = (res.tower || res.pylon) && res.tower ? res.tower.id : lastTowerId;
    playSFX(type === 'pylon' ? 'pylon' : 'place');
  } else {
    playSFX('error');
    showToast(placeReason(res.reason));
  }
  return res.ok;
}

function placeReason(reason) {
  return {
    'wrong-phase': 'Tidak bisa membangun sekarang',
    'unknown-tower': 'Menara tidak dikenal',
    'out-of-grid': 'Di luar pulau',
    'not-lit': 'Area Gelap — nyalakan Pylon dulu',
    'on-path': 'Jalur Musuh',
    'occupied': 'Sudah Ada Menara',
    'not-enough-lumen': 'Lumen Kurang',
  }[reason] || 'Tidak bisa membangun';
}

function doFlare(q, r) {
  // No cursor: flare on the boss, else mid-path.
  if (q === null || q === undefined) {
    if (sim.boss) { q = sim.boss.q; r = sim.boss.r; }
    else { q = 3; r = 0; }
  }
  const res = useFlare(sim, q, r);
  if (res.ok) playSFX('flare');
  else playSFX('error');
  return res.ok;
}

function doOvercharge() {
  const target = sim.towers.find((t) => t.id === lastTowerId) || sim.towers[0];
  if (!target) { playSFX('error'); showToast('Belum ada menara'); return false; }
  const res = useOvercharge(sim, target.id);
  if (res.ok) playSFX('overcharge');
  else { playSFX('error'); showToast('Overcharge belum siap'); }
  return res.ok;
}

function doStartWave() {
  if (sim.phase !== 'build') return false;
  const res = startWave(sim);
  if (res.ok) playSFX('wave_start');
  return res.ok;
}

function togglePause() {
  if (sim.phase === 'title' || sim.phase === 'victory' || sim.phase === 'gameover') return;
  paused = !paused;
  hudSetPaused(paused);
  if (!paused && getCurrentScreen() === 'pause') hideScreens();
}

function toggleSpeed() {
  speed = speed === 1 ? 2 : 1;
  hudSetSpeed(speed);
}

function toggleMute() {
  muted = !muted;
  audioSetMuted(muted);
  hudSetMuted(muted);
}

function openPauseMenu() {
  if (sim.phase === 'title' || sim.phase === 'victory' || sim.phase === 'gameover') return;
  paused = true;
  hudSetPaused(true);
  showPauseMenu({
    onResume: () => { paused = false; hudSetPaused(false); hideScreens(); },
    onRestart: () => restartRun(),
    onTitle: () => toTitle(),
  });
  blurButtons(screensEl);
}

// ---------------------------------------------------------------- boot
function bootGame() {
  renderer = createRenderer(canvas);

  initHUD({
    onSelect: (type) => setSelected(type),
    onStartWave: () => doStartWave(),
    onPause: () => togglePause(),
    onSpeed: () => toggleSpeed(),
    onMute: () => toggleMute(),
    onFlare: () => doFlare(null, null),
    onOvercharge: () => doOvercharge(),
  });
  blurButtons(hudEl);

  uiState = null; // replaced below by input.uiState (single shared object)
  input = createInput(canvas, {
    onSelect: (type) => setSelected(type),
    onPlace: (type, q, r) => doPlace(type, q, r),
    onTileClick: (q, r) => onTileClick(q, r),
    onFlare: (q, r) => doFlare(q, r),
    onOvercharge: () => doOvercharge(),
    onStartWave: () => doStartWave(),
    onPause: () => togglePause(),
    onSpeed: () => toggleSpeed(),
    onMute: () => toggleMute(),
    onMenu: () => openPauseMenu(),
    onInvalidPlace: (reason) => { playSFX('error'); showToast(reason); },
    onPan: (dx, dy) => {
      uiState.panDelta.x += dx;
      uiState.panDelta.y += dy;
    },
  });
  uiState = input.uiState;
  uiState.panDelta = { x: 0, y: 0 }; // drag deltas, zeroed after each render
  uiState.keys = input.keys;
  input.setSimState(viewState());

  // Hover hex comes from the renderer's raycast (mouse position, canvas).
  canvas.addEventListener('pointermove', (e) => {
    mouseInside = true;
    input.mouse.x = e.clientX;
    input.mouse.y = e.clientY;
  });
  canvas.addEventListener('pointerleave', () => { mouseInside = false; });
  canvas.addEventListener('pointerdown', () => { mouseInside = true; });

  // Resize with the window.
  window.addEventListener('resize', () => renderer.resize());

  toTitle();
  requestAnimationFrame(loop);
}

// Click on an owned tower (nothing selected): evolve it with its first
// evolution option when affordable; otherwise report why not.
function onTileClick(q, r) {
  const tower = sim.towers.find((t) => t.q === q && t.r === r);
  if (!tower) return;
  if (tower.evo) { showToast('Menara ini sudah berevolusi'); return; }
  const options = EVOLUTIONS[tower.type] || [];
  if (!options.length) return;
  const evo = options[0];
  const res = evolveTower(sim, tower.id, evo.id);
  if (res.ok) {
    lastTowerId = tower.id;
    playSFX('place');
    showToast(`${tower.type} → ${evo.name}`);
  } else {
    playSFX('error');
    showToast(res.reason === 'not-enough-lumen' ? 'Lumen Kurang untuk evolusi' : 'Evolusi gagal');
  }
}

// ---------------------------------------------------------------- boon / end
function maybeShowBoon() {
  if (sim.phase !== 'boon' || boonShownForWave === sim.wave) return;
  boonShownForWave = sim.wave;
  const defs = sim.boonChoices
    .map((id) => BOONS.find((b) => b.id === id))
    .filter(Boolean)
    .map((b) => ({ id: b.id, name: b.name, description: b.desc, tradeoff: b.tradeoff || '' }));
  if (!defs.length) return;
  showBoonChoice(defs, (boon) => {
    const res = chooseBoon(sim, boon.id);
    if (res.ok) { playSFX('lumen'); hideScreens(); }
  });
  blurButtons(screensEl);
}

function runStats() {
  return {
    wave: sim.wave,
    wavesReached: sim.wave,
    kills: sim.kills,
    enemiesKilled: sim.kills,
    lumen: Math.round(sim.lumenCollected),
    lumenCollected: Math.round(sim.lumenCollected),
    towers: sim.towersBuilt,
    towersBuilt: sim.towersBuilt,
    timeSec: Math.round(sim.time),
    playTimeSeconds: Math.round(sim.time),
  };
}

function maybeShowEnd() {
  if (endShown) return;
  if (sim.phase === 'victory') {
    endShown = true;
    playSFX('victory');
    const topRuns = saveRun({
      score: sim.score, wave: sim.wave, grade: sim.grade,
      date: new Date().toISOString().slice(0, 10),
    });
    showVictory({
      stars: sim.stars, grade: sim.grade, stats: runStats(), topRuns,
      onAgain: () => restartRun(), onTitle: () => toTitle(),
    });
    blurButtons(screensEl);
  } else if (sim.phase === 'gameover') {
    endShown = true;
    playSFX('defeat');
    const topRuns = saveRun({
      score: sim.score, wave: sim.wave, grade: null,
      date: new Date().toISOString().slice(0, 10),
    });
    showGameOver({
      wave: sim.wave, stats: runStats(), topRuns,
      onAgain: () => restartRun(), onTitle: () => toTitle(),
    });
    blurButtons(screensEl);
  }
}

// ---------------------------------------------------------------- loop
let lastNow = performance.now();
let acc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dtReal = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;

  // Hover hex via raycast (only while the pointer is over the canvas).
  if (mouseInside && renderer) {
    const hex = renderer.screenToHex(input.mouse.x, input.mouse.y);
    input.setHoverHex(hex);
  }

  // Fixed timestep 1/60, scaled by the speed toggle; paused = frozen.
  if (!paused && sim.phase !== 'title') {
    acc += dtReal * speed;
    let steps = 0;
    while (acc >= TICK && steps < 8) {
      stepSim(sim, {}, TICK);
      acc -= TICK;
      steps++;
    }
    if (steps === 8) acc = 0; // drop backlog after a long hitch, never spiral
  }

  // Music follows the fight: calm 0.3, late waves 0.7+, boss 1.0.
  if (!isMuted()) {
    setMusicIntensity(sim.boss ? 1.0 : sim.wave >= 8 ? 0.7 : 0.3);
  }

  input.setSimState(viewState());
  if (renderer) {
    renderer.render(renderState(), uiState);
    // Drag deltas are per-frame: zero them after render consumed them.
    uiState.panDelta.x = 0;
    uiState.panDelta.y = 0;
  }
  updateHUD(viewState());
  maybeShowBoon();
  maybeShowEnd();
}

// Debug/test handle (used by the headless Wave-10 playtest, not by the UI).
window.__hexember = {
  get sim() { return sim; },
  get selected() { return selected; },
  get paused() { return paused; },
  get speed() { return speed; },
  startRun, toTitle, doStartWave, doPlace, doFlare, doOvercharge,
  setSpeed: (s) => { speed = s === 2 ? 2 : 1; hudSetSpeed(speed); },
  setPaused: (p) => { paused = !!p; hudSetPaused(paused); },
  actions: { placeTower, placePylon, evolveTower, startWave, chooseBoon, useFlare, useOvercharge },
};
