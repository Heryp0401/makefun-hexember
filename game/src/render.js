// render.js — HEXEMBER three.js view. Pure view: reads sim state, never mutates it.
// Fixed isometric camera (38 deg elevation, locked zoom), drag + WASD pan.
// Palette: obsidian island, dim cyan grid, amber/gold light, crimson/violet foes.
import * as THREE from 'three';
import {
  createIslandMesh, createTowerMesh, createEnemyMesh, createBossMesh,
  createPylonMesh, createCoreMesh, hexToWorld as modelHexToWorld, normalizeTowerType,
} from './models.js';
import { spawnParticles, createBeam, trackBeam, updateEffects, getShakeOffset, hitStop } from './effects.js';

export { hexToWorld } from './models.js';

const ELEV = 38 * Math.PI / 180;          // fixed isometric elevation
const FRUSTUM_HALF_H = 8.6;               // locked zoom (no wheel zoom)
const PAN_LIMIT = 7, PAN_SPEED = 9;
const GOLD = 0xffb703, AMBER = 0xfb8500, CYAN = 0x1f4068;
const TOWER_RANGE = { prism: 3, obelisk: 4, lance: 5, mortar: 3, radiant: 2 };
const PYLON_RADIUS = 2;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x05070f, 1);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070f, 0.012);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const camDir = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
  const panTarget = new THREE.Vector3(0, 0, 0);

  // Lighting: dim blue ambient + cool moon dir + warm point lights on core/pylons.
  scene.add(new THREE.AmbientLight(0x33456e, 0.85));
  scene.add(new THREE.HemisphereLight(0x2a3a5f, 0x0a0f1d, 0.5));
  const moon = new THREE.DirectionalLight(0x8fb4ff, 0.7);
  moon.position.set(-6, 12, 4); scene.add(moon);
  const coreLight = new THREE.PointLight(GOLD, 60, 18, 1.6);
  coreLight.position.set(0, 3, 0); scene.add(coreLight);
  const pylonLights = [];
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight(AMBER, 0, 10, 1.8);
    scene.add(pl); pylonLights.push(pl);
  }

  // Static world.
  const island = createIslandMesh();
  scene.add(island);
  const core = createCoreMesh();
  scene.add(core);

  // Dynamic groups + per-id caches (diffed each frame, stale entries removed).
  const towerGroup = new THREE.Group(), enemyGroup = new THREE.Group(),
    pylonGroup = new THREE.Group(), fxGroup = new THREE.Group(),
    overlayGroup = new THREE.Group();
  scene.add(towerGroup, enemyGroup, pylonGroup, fxGroup, overlayGroup);
  const towers = new Map(), enemies = new Map(), pylons = new Map();
  let bossGroup = null, bossId = null;
  const towerBeams = new Map(); // tower id -> beam (firing visual, optional state.beamTo)

  // Overlays: hover hex outline, ghost, range rings, flare ring, reason label.
  const hoverRing = makeHexOutline(0xffd166, 0.9);
  const ghostGroup = new THREE.Group();
  const ghostDisc = makeDisc(1, 0xffb703, 0.12);
  const rangeRing = makeCircleRing(1, 0xffd166, 0.9);
  const rangeDisc = makeDisc(1, 0xffd166, 0.06);
  const pylonRing = makeCircleRing(1, AMBER, 0.7);
  const flareRing = makeCircleRing(1, 0xfff3c4, 1);
  flareRing.material.transparent = true;
  overlayGroup.add(hoverRing, ghostGroup, ghostDisc, rangeRing, rangeDisc, pylonRing, flareRing);
  ghostGroup.visible = ghostDisc.visible = rangeRing.visible = rangeDisc.visible = false;
  pylonRing.visible = flareRing.visible = hoverRing.visible = false;
  let ghostType = null, ghostValid = true;

  // Light-network lines between lit pylons and the Core.
  const netMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  let netLines = null, netKey = '';
  // Reason label sprite (redrawn only when the reason text changes).
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }));
  labelSprite.scale.set(2.4, 0.6, 1); labelSprite.visible = false;
  overlayGroup.add(labelSprite);
  let lastReason = '';

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const clock = { last: performance.now() };
  let flareT = 0;

  function makeHexOutline(color, opacity) {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.95, 0.03, Math.sin(a) * 0.95));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }
  function makeCircleRing(radius, color, opacity) {
    const pts = [];
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0.04, Math.sin(a) * radius));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }
  function makeDisc(radius, color, opacity) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.035;
    return m;
  }
  function setLabel(text) {
    if (text === lastReason) return;
    lastReason = text;
    const ctx = labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 10); ctx.fill();
    ctx.strokeStyle = '#e63946'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    labelTex.needsUpdate = true;
  }
  function hpBar(width = 0.9) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x1a0505, transparent: true, opacity: 0.85, depthWrite: false }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0.95, depthWrite: false }));
    fg.position.z = 0.001;
    g.add(bg, fg); g.userData.fg = fg; g.userData.width = width;
    return g;
  }
  function setHpBar(bar, frac) {
    const f = Math.max(0, Math.min(1, frac));
    bar.userData.fg.scale.x = Math.max(f, 0.001);
    bar.userData.fg.position.x = -(1 - f) * bar.userData.width / 2;
    bar.userData.fg.material.color.setHSL(0.02 + f * 0.33, 0.9, 0.5);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);
    camera.left = -FRUSTUM_HALF_H * aspect; camera.right = FRUSTUM_HALF_H * aspect;
    camera.top = FRUSTUM_HALF_H; camera.bottom = -FRUSTUM_HALF_H;
    camera.updateProjectionMatrix();
  }
  resize();

  function screenToHex(x, y) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = -((y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    // World -> axial (flat-top), cube-rounded.
    const qf = (2 / 3 * hit.x) / 1, rf = (-1 / 3 * hit.x + Math.sqrt(3) / 3 * hit.z) / 1;
    let q = Math.round(qf), r = Math.round(rf), s = Math.round(-qf - rf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s + qf + rf);
    if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > 5) return null;
    return { q, r };
  }

  function applyPan(dt, uiState) {
    // WASD / arrows: uiState.keys may be a Set of codes, an object, or an array.
    const keys = uiState.keys;
    const down = (code, letter) => {
      if (!keys) return false;
      if (keys instanceof Set) return keys.has(code) || keys.has(letter);
      if (Array.isArray(keys)) return keys.includes(code) || keys.includes(letter);
      return !!keys[code] || !!keys[letter] || !!keys[letter.toLowerCase()];
    };
    let mx = 0, mz = 0;
    if (down('KeyA', 'a') || down('ArrowLeft', 'left')) mx -= 1;
    if (down('KeyD', 'd') || down('ArrowRight', 'right')) mx += 1;
    if (down('KeyW', 'w') || down('ArrowUp', 'up')) mz -= 1;
    if (down('KeyS', 's') || down('ArrowDown', 'down')) mz += 1;
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      panTarget.x += (mx / len) * PAN_SPEED * dt;
      panTarget.z += (mz / len) * PAN_SPEED * dt;
    }
    // Drag: uiState.panDelta is a per-frame pixel delta; input.js zeroes it after render.
    const pd = uiState.panDelta;
    if (pd && (pd.x || pd.y)) {
      const ppu = canvas.clientHeight / (FRUSTUM_HALF_H * 2);
      panTarget.x -= pd.x / Math.max(1, ppu);
      panTarget.z -= pd.y / Math.max(1, ppu * Math.sin(ELEV));
    }
    const r = Math.hypot(panTarget.x, panTarget.z);
    if (r > PAN_LIMIT) { panTarget.x *= PAN_LIMIT / r; panTarget.z *= PAN_LIMIT / r; }
  }

  function syncTowers(list) {
    const seen = new Set();
    (list || []).forEach((t) => {
      const key = String(t.id ?? `${t.q},${t.r}`);
      seen.add(key);
      let rec = towers.get(key);
      const kind = normalizeTowerType(t.type);
      if (!rec || rec.kind !== kind || rec.evo !== (t.evo | 0)) {
        if (rec) { towerGroup.remove(rec.group); }
        const group = createTowerMesh(kind, t.evo | 0);
        const p = modelHexToWorld(t.q, t.r);
        group.position.set(p.x, 0, p.z);
        towerGroup.add(group);
        rec = { group, kind, evo: t.evo | 0 };
        towers.set(key, rec);
      }
      const p = modelHexToWorld(t.q, t.r);
      rec.group.position.set(p.x, 0, p.z);
      // Optional firing visual: state may carry t.beamTo {q,r} while a tower fires.
      const bt = t.beamTo || t.target;
      if (bt) {
        let beam = towerBeams.get(key);
        const from = { x: p.x, y: 1.6, z: p.z };
        const tp = modelHexToWorld(bt.q, bt.r);
        const to = { x: tp.x, y: 0.6, z: tp.z };
        if (!beam) { beam = trackBeam(createBeam(scene, from, to, kind === 'lance' ? 0x7dd3fc : GOLD)); towerBeams.set(key, beam); }
        else beam.setEndpoints(from, to);
      } else if (towerBeams.has(key)) {
        towerBeams.get(key).dispose(); towerBeams.delete(key);
      }
    });
    towers.forEach((rec, key) => {
      if (!seen.has(key)) {
        towerGroup.remove(rec.group);
        towers.delete(key);
        if (towerBeams.has(key)) { towerBeams.get(key).dispose(); towerBeams.delete(key); }
      }
    });
  }

  function syncEnemies(list, dt) {
    const seen = new Set();
    (list || []).forEach((e) => {
      const key = String(e.id);
      seen.add(key);
      let rec = enemies.get(key);
      if (!rec) {
        const group = createEnemyMesh(e.role);
        const bar = hpBar(e.role === 'brute' ? 1.2 : 0.9);
        bar.position.y = e.role === 'brute' ? 1.9 : 1.5;
        group.add(bar);
        enemyGroup.add(group);
        const p = modelHexToWorld(e.q, e.r);
        group.position.set(p.x, 0, p.z);
        rec = { group, bar, role: e.role, sx: p.x, sz: p.z };
        enemies.set(key, rec);
      }
      const p = modelHexToWorld(e.q, e.r);
      // Smooth chase toward the sim position (alpha-free damped lerp).
      rec.sx += (p.x - rec.sx) * 0.3; rec.sz += (p.z - rec.sz) * 0.3;
      rec.group.position.set(rec.sx, 0, rec.sz);
      // Bob + face travel direction.
      const moving = Math.hypot(p.x - rec.sx, p.z - rec.sz) > 0.01;
      rec.group.position.y = moving ? Math.abs(Math.sin(performance.now() * 0.012 + key.length)) * 0.06 : 0;
      if (moving) rec.group.rotation.y = Math.atan2(p.x - rec.sx, p.z - rec.sz);
      if (e.maxHp) setHpBar(rec.bar, e.hp / e.maxHp);
      rec.bar.quaternion.copy(camera.quaternion);
      rec.last = { x: rec.sx, z: rec.sz };
    });
    enemies.forEach((rec, key) => {
      if (!seen.has(key)) {
        // Death burst at the last known spot.
        if (rec.last) spawnParticles(scene, { x: rec.last.x, y: 0.5, z: rec.last.z }, { color: 0xe63946, count: 22, speed: 3.5 });
        enemyGroup.remove(rec.group);
        enemies.delete(key);
      }
    });
  }

  function syncPylons(list) {
    const seen = new Set();
    const litPts = [];
    (list || []).forEach((py) => {
      const key = `${py.q},${py.r}`;
      seen.add(key);
      let rec = pylons.get(key);
      if (!rec || rec.lit !== !!py.lit) {
        if (rec) pylonGroup.remove(rec.group);
        const group = createPylonMesh(!!py.lit);
        const p = modelHexToWorld(py.q, py.r);
        group.position.set(p.x, 0, p.z);
        pylonGroup.add(group);
        rec = { group, lit: !!py.lit, q: py.q, r: py.r };
        pylons.set(key, rec);
      }
      if (py.lit) litPts.push({ q: py.q, r: py.r, radius: py.radius || PYLON_RADIUS });
    });
    pylons.forEach((rec, key) => { if (!seen.has(key)) { pylonGroup.remove(rec.group); pylons.delete(key); } });
    // Lit tiles: from state.litTiles if given, else from lit pylon radii.
    island.userData.setAllDark();
    const litSet = new Set();
    if (stateLitTiles) {
      stateLitTiles.forEach((t) => litSet.add(typeof t === 'string' ? t : `${t.q},${t.r}`));
    } else {
      litPts.forEach((py) => {
        for (let q = -5; q <= 5; q++) for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) {
          if (Math.max(Math.abs(q - py.q), Math.abs(r - py.r), Math.abs(q + r - py.q - py.r)) <= py.radius) litSet.add(`${q},${r}`);
        }
      });
    }
    litSet.forEach((k) => { const [q, r] = k.split(',').map(Number); island.userData.setTileLit(q, r, true); });
    // Point lights on lit pylons (pool of 6).
    pylonLights.forEach((pl, i) => {
      const py = litPts[i];
      if (py) {
        const p = modelHexToWorld(py.q, py.r);
        pl.position.set(p.x, 2.2, p.z); pl.intensity = 22;
      } else pl.intensity = 0;
    });
    // Amber light-network lines: lit pylon -> Core, and pylon -> nearest lit pylon.
    const keyStr = litPts.map((p) => `${p.q},${p.r}`).sort().join('|');
    if (keyStr !== netKey) {
      netKey = keyStr;
      if (netLines) { overlayGroup.remove(netLines); netLines.geometry.dispose(); netLines = null; }
      if (litPts.length) {
        const pts = [];
        litPts.forEach((py) => {
          const a = modelHexToWorld(py.q, py.r);
          pts.push(new THREE.Vector3(a.x, 0.12, a.z), new THREE.Vector3(0, 0.12, 0));
          let best = null, bd = 1e9;
          litPts.forEach((o) => {
            if (o === py) return;
            const d = Math.hypot(o.q - py.q, o.r - py.r);
            if (d < bd) { bd = d; best = o; }
          });
          if (best) {
            const b = modelHexToWorld(best.q, best.r);
            pts.push(new THREE.Vector3(a.x, 0.12, a.z), new THREE.Vector3(b.x, 0.12, b.z));
          }
        });
        netLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), netMat);
        overlayGroup.add(netLines);
      }
    }
    return litPts;
  }

  let stateLitTiles = null;

  function render(state, uiState = {}, alpha = 1) {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - clock.last) / 1000));
    clock.last = now;
    state = state || {};
    uiState = uiState || {};
    stateLitTiles = state.litTiles || null;

    updateEffects(dt); // hit-stop pauses FX updates inside
    applyPan(dt, uiState);

    // Core: pulse + HP-driven dimming (coreHP/coreMaxHP, e.g. 10/10).
    const hpMax = state.coreMaxHP || state.coreMax || 100;
    const hpFrac = state.coreHP == null ? 1 : Math.max(0, Math.min(1, state.coreHP / hpMax));
    const pulse = 1 + Math.sin(now * 0.0022) * 0.12;
    core.scale.setScalar(pulse * (0.7 + 0.3 * hpFrac));
    core.userData.crystal.rotation.y = now * 0.0006;
    core.userData.rings.forEach((ring, i) => { ring.rotation.z = now * 0.0004 * (i ? -1 : 1); });
    coreLight.intensity = (30 + 30 * hpFrac) * pulse;
    coreLight.color.setHSL(0.11, 0.95, hpFrac < 0.3 ? 0.45 : 0.6);

    syncTowers(state.towers);
    syncEnemies(state.enemies, dt);
    const litPylons = syncPylons(state.pylons);

    // Boss.
    if (state.boss) {
      const b = state.boss;
      if (!bossGroup || bossId !== String(b.id ?? 'boss') || bossGroup.userData.phase !== (b.phase | 0 || 1)) {
        if (bossGroup) scene.remove(bossGroup);
        bossGroup = createBossMesh(b.phase | 0 || 1);
        const bar = hpBar(3.2); bar.position.y = 4.6; bossGroup.add(bar);
        bossGroup.userData.bar = bar;
        scene.add(bossGroup);
        bossId = String(b.id ?? 'boss');
      }
      const p = modelHexToWorld(b.q, b.r);
      bossGroup.position.set(p.x, 0, p.z);
      bossGroup.position.y = 0.25 + Math.sin(now * 0.0015) * 0.15; // hovers
      if (b.maxHp) setHpBar(bossGroup.userData.bar, b.hp / b.maxHp);
      bossGroup.userData.bar.quaternion.copy(camera.quaternion);
    } else if (bossGroup) {
      spawnParticles(scene, { x: bossGroup.position.x, y: 1.5, z: bossGroup.position.z }, { color: 0x9d4edd, count: 60, speed: 5, life: 1.2 });
      hitStop(90); // boss death: brief freeze + burst
      scene.remove(bossGroup); bossGroup = null; bossId = null;
    }

    // Solar Flare: expanding gold ring while the flare is actually active
    // (activeUntil on the sim clock; a bare flare object means inactive).
    const flare = state.flare;
    const flareActive = !!(flare && flare.activeUntil && (state.time || 0) < flare.activeUntil);
    if (flareActive) {
      flareT = Math.min(1, flareT + dt * 1.4);
      const R = 1 + flareT * 9;
      flareRing.visible = true;
      flareRing.scale.setScalar(R);
      flareRing.material.opacity = 0.9 * (1 - flareT);
      coreLight.intensity = 120;
    } else { flareT = 0; flareRing.visible = false; }

    // Ghost preview + range rings (build phase).
    const sel = uiState.selected;
    const hover = uiState.hoverHex;
    const placingType = typeof sel === 'string' ? normalizeTowerType(sel) : null;
    const placing = !!placingType && !!hover;
    if (placing) {
      if (ghostType !== placingType) {
        ghostGroup.clear();
        const g = createTowerMesh(placingType, 0);
        g.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false;
          }
        });
        ghostGroup.add(g);
        ghostType = placingType;
      }
      const p = modelHexToWorld(hover.q, hover.r);
      const invalid = uiState.ghostValid === false;
      const shakeX = invalid ? Math.sin(now * 0.03) * 0.06 : 0;
      ghostGroup.position.set(p.x + shakeX, 0, p.z);
      ghostGroup.visible = true;
      ghostGroup.traverse((o) => {
        if (o.isMesh) o.material.color.set(invalid ? 0xe63946 : 0xffd166);
      });
      ghostDisc.visible = true;
      ghostDisc.position.set(p.x, 0.035, p.z);
      ghostDisc.material.color.set(invalid ? 0xe63946 : 0xffb703);
      ghostDisc.material.opacity = invalid ? 0.25 : 0.12;
      const range = TOWER_RANGE[placingType] || 3;
      rangeRing.visible = rangeDisc.visible = true;
      rangeRing.position.set(p.x, 0.04, p.z);
      rangeDisc.position.set(p.x, 0.035, p.z);
      rangeRing.scale.setScalar(range * 1.55);
      rangeDisc.scale.setScalar(range * 1.55);
      rangeRing.material.color.set(invalid ? 0xe63946 : 0xffd166);
      if (invalid && uiState.ghostReason) {
        setLabel(uiState.ghostReason);
        labelSprite.visible = true;
        labelSprite.position.set(p.x, 2.4, p.z);
      } else labelSprite.visible = false;
    } else {
      ghostGroup.visible = ghostDisc.visible = rangeRing.visible = rangeDisc.visible = false;
      labelSprite.visible = false;
      ghostType = null;
    }
    // Hover hex outline (not while placing — ghost already shows it).
    if (hover && !placing) {
      const p = modelHexToWorld(hover.q, hover.r);
      hoverRing.position.set(p.x, 0.03, p.z);
      hoverRing.visible = true;
    } else hoverRing.visible = false;
    // Pylon radius ring (amber) under the hovered pylon, if any.
    const hoverPylon = hover && litPylons.find((py) => py.q === hover.q && py.r === hover.r);
    if (hoverPylon) {
      const p = modelHexToWorld(hoverPylon.q, hoverPylon.r);
      pylonRing.visible = true;
      pylonRing.position.set(p.x, 0.04, p.z);
      pylonRing.scale.setScalar(hoverPylon.radius * 1.55);
    } else pylonRing.visible = false;

    // Camera: fixed 38-deg iso, locked zoom, pan target + shake offset.
    const sh = getShakeOffset();
    camera.position.set(panTarget.x + camDir.x * 40 + sh.x, camDir.y * 40 + sh.y, panTarget.z + camDir.z * 40);
    camera.lookAt(panTarget.x + sh.x, 0, panTarget.z + sh.y);
    camera.updateProjectionMatrix();
    // Hit-stop freezes FX updates (see updateEffects), the frame still draws.
    // alpha is accepted for the sim-interpolation contract; enemy motion is
    // smoothed with a damped lerp instead (single-snapshot state, no prev frame).
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, render, resize, screenToHex, hexToWorld: modelHexToWorld };
}
