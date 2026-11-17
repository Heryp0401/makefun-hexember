// HEXEMBER — smoke-test.mjs
// Browser smoke test (Playwright / playwright-core + the cached Chromium).
// Loads game/index.html from a local static server (spawns `node serve.ts`
// itself), asserts: page loads, canvas renders, ZERO console errors, all 4
// ?shot= scenes render at 1280x720 via the REAL three.js renderer, and
// screenshot determinism (render ?shot=play twice -> identical bytes).
// Writes the 4 screenshots to screenshots/ (JPEG, each <= 256 KiB).
// Run: `node smoke-test.mjs` — prints PASS/FAIL per check, exit 0 = all pass.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8931;
const BASE = `http://localhost:${PORT}/index.html`;
const SHOTS = [
  { name: '1-play.jpg', query: '?shot=play&seed=1' },
  { name: '2-title.jpg', query: '?shot=title&seed=1' },
  { name: '3-boss.jpg', query: '?shot=boss&seed=1' },
  { name: '4-victory.jpg', query: '?shot=victory&seed=1' },
];
const MAX_SHOT_BYTES = 262144;

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

// Chromium executable: playwright-core ships no browser; use the cached
// Playwright Chromium build on this VM (same one python-playwright uses).
const HOME = process.env.HOME || '/home/hatch';
const CANDIDATES = [
  `${HOME}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
  `${HOME}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`,
];
const executablePath = CANDIDATES.find((p) => existsSync(p));

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(true);
      } catch { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('server did not start'));
      setTimeout(tick, 200);
    };
    tick();
  });
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: here, stdio: 'ignore',
});
let browser = null;
try {
  await waitForServer(`${BASE}`);
  check('static server serves index.html', true);
  check('chromium executable found', !!executablePath, executablePath || 'no cached chromium');
  if (!executablePath) throw new Error('no chromium executable');

  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });

  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));

  // ---- normal load (title screen, live game) ----
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const title = await page.title();
  check('page loads (title HEXEMBER)', title === 'HEXEMBER', `title=${title}`);
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('#game canvas');
    if (!c) return { ok: false };
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return { ok: true, w: c.width, h: c.height, webgl: !!gl };
  });
  check('canvas renders (WebGL context)', canvasInfo.ok && canvasInfo.webgl, JSON.stringify(canvasInfo));
  const titleVisible = await page.evaluate(() => !!document.querySelector('#screens .hx-logo'));
  check('title screen shows (HEXEMBER logo + difficulty select)', titleVisible);
  const diffCount = await page.evaluate(() => document.querySelectorAll('#screens .hx-diff').length);
  check('4 difficulty buttons on title', diffCount === 4, `found ${diffCount}`);
  const bangVisible = await page.evaluate(() => !!document.querySelector('#screens .hx-badge-bang'));
  check('Awakening "!" badge visible', bangVisible);

  // ---- ?shot= scenes: real renderer, 1280x720, deterministic ----
  mkdirSync(join(here, 'screenshots'), { recursive: true });
  const shotErrorsBefore = errors.length;
  for (const shot of SHOTS) {
    await page.goto(BASE + shot.query, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const rendererKind = await page.evaluate(() => window.__hexemberShotRenderer || 'unset');
    check(`${shot.name}: real three.js renderer (not 2D fallback)`, rendererKind === 'three', `renderer=${rendererKind}`);
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    check(`${shot.name}: renders at 1280x720`, buf.length > 20000, `${buf.length} bytes`);
    const outPath = join(here, 'screenshots', shot.name);
    writeFileSync(outPath, buf);
    const size = statSync(outPath).size;
    check(`${shot.name}: <= 256 KiB`, size <= MAX_SHOT_BYTES, `${size} bytes`);
  }
  check('shot scenes: zero console errors', errors.length === shotErrorsBefore, errors.slice(shotErrorsBefore).join(' | '));

  // ---- determinism: ?shot=play twice, byte-identical ----
  await page.goto(BASE + '?shot=play&seed=1', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const a = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.goto(BASE + '?shot=play&seed=1', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const b = await page.screenshot({ type: 'jpeg', quality: 80 });
  check('determinism: ?shot=play twice byte-identical', a.equals(b), `${a.length} vs ${b.length} bytes`);

  check('whole run: zero console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

console.log('---');
console.log(`TOTAL: ${pass} passed, ${fail} failed${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`);
process.exit(fail ? 1 : 0);
