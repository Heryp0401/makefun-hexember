// HEXEMBER — playtest.mjs (not part of the entry; lives at repo root)
// Full Wave-1..10 playtest in the REAL browser game: loads the page,
// starts a Radiant run with a real DOM click, then auto-plays through the
// live sim (same action functions the UI calls: placeTower/placePylon/
// evolveTower/startWave/chooseBoon/useFlare/useOvercharge) while wave
// starts and boon picks go through real DOM clicks. Reports: wave reached,
// victory/defeat, score, console errors, soft-locks, boss-fight behaviour
// (P1 immunity, P2 summons + darkness, P3 tower destruction).
// Run: `node playtest.mjs` — exit 0 = victory with 0 console errors.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 8932;
const BASE = `http://localhost:${PORT}/index.html`;
const HOME = process.env.HOME || '/home/hatch';
const executablePath = [
  `${HOME}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
  `${HOME}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`,
].find((p) => existsSync(p));

// Auto-builder injected into the page (same strategy as sim-test.mjs:
// pylons along the path, towers on the best lit tiles, evolve when rich).
const AUTO_BUILD_FN = `() => {
  const H = window.__hexember;
  const sim = H.sim;
  const hexD = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const PATH = [{q:5,r:0},{q:4,r:0},{q:3,r:0},{q:2,r:0},{q:1,r:0},{q:0,r:0}];
  const onPath = (q, r) => PATH.some((t) => t.q === q && t.r === r);
  const minDistToPath = (q, r) => Math.min(...PATH.map((t) => hexD({q,r}, t)));
  const distToCore = (q, r) => hexD({q,r}, {q:0,r:0});
  const tiles = [];
  for (let q = -5; q <= 5; q++) {
    const rMin = Math.max(-5, -q - 5), rMax = Math.min(5, -q + 5);
    for (let r = rMin; r <= rMax; r++) if (!onPath(q, r)) tiles.push({q, r});
  }
  tiles.sort((a, b) => minDistToPath(a.q, a.r) - minDistToPath(b.q, b.r) || distToCore(a.q, a.r) - distToCore(b.q, b.r));
  const PYLON_SPOTS = [{q:3,r:1},{q:3,r:-1},{q:4,r:1},{q:4,r:-1},{q:2,r:2},{q:2,r:-2},{q:1,r:2},{q:1,r:-2},{q:0,r:3},{q:0,r:-3}];
  const ROT = ['lance','prism','mortar','heliotrope','pylonSuar','prism','lance','mortar','prism','heliotrope','lance'];
  const EVO = { prism:'arcConductor', lance:'zenithRailgun', mortar:'seismicCore', heliotrope:'solarObelisk', pylonSuar:'amplifierNode' };
  const A = H.actions;
  const litPylons = sim.pylons.filter((p) => p.lit).length;
  if (sim.boss && litPylons < 3) {
    for (const s of PYLON_SPOTS) { if (sim.lumen < 30) break; if (A.placePylon(sim, s.q, s.r).ok) break; }
  }
  for (const s of PYLON_SPOTS) {
    if (sim.pylons.length >= 6) break;
    if (sim.pylons.length >= 2 && sim.lumen < 150) break;
    if (sim.lumen < 90) break;
    A.placePylon(sim, s.q, s.r);
  }
  let i = 0;
  for (const t of tiles) {
    if (sim.lumen < 50) break;
    A.placeTower(sim, ROT[i % ROT.length], t.q, t.r);
    i++;
  }
  if (sim.lumen > 120) {
    for (const t of [...sim.towers]) {
      if (!t.evo && EVO[t.type] && sim.lumen > 120) A.evolveTower(sim, t.id, EVO[t.type]);
    }
  }
  for (const s of PYLON_SPOTS) {
    if (sim.pylons.length >= 6 || sim.lumen < 90) break;
    A.placePylon(sim, s.q, s.r);
  }
  return { lumen: Math.round(sim.lumen), towers: sim.towers.length, pylons: sim.pylons.length };
}`;

const STATE_FN = `() => {
  const s = window.__hexember.sim;
  if (!s) return null;
  const bossEvents = s.events.filter((e) => ['boss-phase','boss-spawn','boss-killed','boss-leak','tower-destroyed','pylon-destroyed','leak','wave-clear','boon-chosen'].includes(e.type));
  return {
    phase: s.phase, wave: s.wave, coreHP: s.coreHP, coreMaxHP: s.coreMaxHP,
    lumen: Math.round(s.lumen), score: s.score, kills: s.kills,
    towers: s.towers.length, pylons: s.pylons.length,
    litPylons: s.pylons.filter((p) => p.lit).length,
    enemies: s.enemies.length,
    boss: s.boss ? { hp: Math.round(s.boss.hp), maxHp: s.boss.maxHp, phase: s.boss.phase, q: s.boss.q, r: s.boss.r } : null,
    boonChoices: [...s.boonChoices],
    stars: s.stars, grade: s.grade, time: Math.round(s.time),
    bossEvents: bossEvents.map((e) => e.type + (e.phase ? ':' + e.phase : '') + '@w' + (e.wave ?? s.wave)),
  };
}`;

// Playwright evaluates a STRING argument as an expression, not a call:
// passing "() => {...}" returns the function itself (unserializable), so
// the state read came back undefined and the auto-player never ran.
// Convert the source strings to real functions before passing them in.
const AUTO_BUILD = new Function(`return (${AUTO_BUILD_FN})`)();
const READ_STATE = new Function(`return (${STATE_FN})`)();

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const res = await fetch(url); if (res.ok) return resolve(true); } catch { /* not up */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('server did not start'));
      setTimeout(tick, 200);
    };
    tick();
  });
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
let browser = null;
const errors = [];
let result = { outcome: 'timeout', wave: 0, score: 0 };
try {
  await waitForServer(BASE);
  browser = await chromium.launch({
    headless: true, executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  // Real DOM click: start a Radiant run (default selected difficulty).
  await page.click('#title-start');
  await page.waitForTimeout(1000);
  // 2x speed so 10 waves fit in a few real minutes.
  await page.evaluate(() => window.__hexember.setSpeed(2));

  const t0 = Date.now();
  const TIMEOUT_MS = 900000; // 15 min wall clock: browser waves run slower than sim.
  let lastPhaseChange = Date.now();
  let lastPhase = '';
  let lastWave = 0;
  let lastSt = null;
  let bossHpSamples = []; // {t, hp, litPylons, phase} — P1 immunity check
  let softLock = false;
  while (Date.now() - t0 < TIMEOUT_MS) {
    const st = await page.evaluate(READ_STATE);
    if (!st) { await page.waitForTimeout(500); continue; }
    lastSt = st;
    if (st.phase !== lastPhase || st.wave !== lastWave) {
      console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] phase=${st.phase} wave=${st.wave} coreHP=${st.coreHP}/${st.coreMaxHP} kills=${st.kills} lumen=${st.lumen} towers=${st.towers} pylons=${st.pylons} score=${st.score}`);
      lastPhase = st.phase; lastWave = st.wave; lastPhaseChange = Date.now();
    }
    if (st.boss) {
      bossHpSamples.push({ t: st.time, hp: st.boss.hp, lit: st.litPylons, phase: st.boss.phase });
      if (bossHpSamples.length > 400) bossHpSamples.shift();
    }
    if (st.phase === 'victory' || st.phase === 'gameover') {
      result = { outcome: st.phase, wave: st.wave, score: st.score, stars: st.stars, grade: st.grade, kills: st.kills, coreHP: st.coreHP, time: st.time, bossEvents: st.bossEvents };
      break;
    }
    // Waves run slow under SwiftShader (sim lags real time); 240s still
    // catches a genuinely stuck game, whose phase never changes at all.
    if (Date.now() - lastPhaseChange > 240000) { softLock = true; console.log('  SOFT-LOCK? no phase/wave change for 240s'); break; }
    if (st.phase === 'build') {
      await page.evaluate(AUTO_BUILD);
      // Real DOM click on the HUD start-wave button.
      const btn = await page.$('#hud-start-wave');
      if (btn) await btn.click().catch(() => {});
      else await page.evaluate(() => window.__hexember.doStartWave());
    } else if (st.phase === 'boon') {
      await page.evaluate(AUTO_BUILD);
      const card = await page.$('.hx-boon');
      if (card) await card.click().catch(() => {});
      else await page.evaluate(() => window.__hexember.actions.chooseBoon(window.__hexember.sim, window.__hexember.sim.boonChoices[0]));
    } else if (st.phase === 'wave') {
      // Micro-actions ~1x/sec (loop runs ~2-3x/sec; gate inside page).
      await page.evaluate(() => {
        const H = window.__hexember; const s = H.sim;
        const now = Date.now();
        if (!window.__ptLastMicro || now - window.__ptLastMicro > 900) {
          window.__ptLastMicro = now;
          if (s.boss) H.actions.useFlare(s, s.boss.q, s.boss.r);
          if (s.towers.length) H.actions.useOvercharge(s, s.towers[0].id);
        }
      });
    }
    await page.waitForTimeout(400);
  }
  // On timeout, report the last-seen state, not the initial zeros.
  if (result.outcome === 'timeout' && lastSt) {
    result.wave = lastSt.wave; result.score = lastSt.score;
    result.kills = lastSt.kills; result.coreHP = lastSt.coreHP;
    result.time = lastSt.time; result.bossEvents = lastSt.bossEvents;
  }
  result.softLock = softLock;
  result.consoleErrors = errors;
  // Boss-fight forensics from the sampled HP trace.
  const p1 = bossHpSamples.filter((s) => s.phase === 1 && s.lit < 3);
  const p1Damaged = p1.length > 1 && p1[p1.length - 1].hp < p1[0].hp - 1;
  result.bossP1ImmunityHeld = p1.length > 1 ? !p1Damaged : 'no-sample';
  result.bossPhasesSeen = [...new Set(bossHpSamples.map((s) => s.phase))];
  result.bossSamples = bossHpSamples.length;
  console.log('RESULT', JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
const ok = result.outcome === 'victory' && !result.softLock && errors.length === 0;
console.log(ok ? 'PLAYTEST PASS' : 'PLAYTEST FAIL');
process.exit(ok ? 0 : 1);
