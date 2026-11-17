// models.js — HEXEMBER procedural models. No external assets, no textures.
// All geometry is three.js primitives + standard/basic materials.
// Palette: obsidian island, dim cyan grid, amber/gold light, crimson/violet foes.
import * as THREE from 'three';

export const HEX_SIZE = 1;

// Flat-top axial -> world (y up). Works with fractional q/r too.
export function hexToWorld(q, r) {
  return { x: HEX_SIZE * 1.5 * q, y: 0, z: HEX_SIZE * Math.sqrt(3) * (r + q / 2) };
}

// Tower type aliases (builder B's names may vary; all map to the same 5 forms).
const TOWER_ALIAS = {
  prism: 'prism', crystal: 'prism', shard: 'prism',
  heliotrope: 'obelisk', obelisk: 'obelisk', beam: 'obelisk', laser: 'obelisk',
  lance: 'lance', spear: 'lance', spike: 'lance',
  mortar: 'mortar', cannon: 'mortar', shell: 'mortar',
  pylon: 'radiant', radiant: 'radiant', sun: 'radiant',
  pylonsuar: 'radiant', suar: 'radiant',
};
export function normalizeTowerType(type) {
  return TOWER_ALIAS[String(type || '').toLowerCase()] || 'prism';
}

const GOLD = 0xffb703, AMBER = 0xfb8500, PALE_GOLD = 0xffd166;
const OBSIDIAN = 0x16213e, DARK = 0x0a0f1d, CYAN = 0x1f4068;
const CRIMSON = 0xe63946, VIOLET = 0x9d4edd, SILVER = 0xc0c8d8;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...opts });
}
function glowMat(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0.1,
  });
}
// Hexagonal base plate every tower stands on.
function basePlate(color = 0x2a2118) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.16, 6), mat(color, { metalness: 0.6 }));
  plate.position.y = 0.08;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 6, 6), glowMat(GOLD, 0.8));
  trim.rotation.x = Math.PI / 2; trim.rotation.z = Math.PI / 6; trim.position.y = 0.17;
  g.add(plate, trim);
  return g;
}
// Crystal shard: stretched octahedron, used by prism + core.
function shard(r, h, material) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(r), material);
  m.scale.y = h / (r * 2);
  return m;
}

// --- Island: 91 hex tiles (radius 5) as one InstancedMesh + obsidian cliff ---
export function createIslandMesh() {
  const group = new THREE.Group();
  const tiles = [];
  for (let q = -5; q <= 5; q++) {
    for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) tiles.push({ q, r });
  }
  const geo = new THREE.CylinderGeometry(HEX_SIZE * 0.98, HEX_SIZE * 0.98, 0.3, 6);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.15 });
  const inst = new THREE.InstancedMesh(geo, tileMat, tiles.length);
  const m4 = new THREE.Matrix4();
  const dark = new THREE.Color(0x1a2547), lit = new THREE.Color(0x8a5a1a);
  const litState = new Map();
  tiles.forEach((t, i) => {
    const p = hexToWorld(t.q, t.r);
    m4.makeTranslation(p.x, -0.15, p.z);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, dark);
    litState.set(`${t.q},${t.r}`, { index: i, lit: false });
  });
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);

  // Obsidian cliff: big hex slab under the tiles + jagged edge rocks.
  const cliff = new THREE.Mesh(
    new THREE.CylinderGeometry(HEX_SIZE * 8.6, HEX_SIZE * 6.4, 2.4, 6),
    mat(0x0b1120, { roughness: 0.95, metalness: 0.05 }),
  );
  cliff.position.y = -1.5; cliff.rotation.y = Math.PI / 6;
  group.add(cliff);
  const rockMat = mat(0x111a30, { roughness: 1 });
  // Deterministic pseudo-random from the index (shot mode must be reproducible).
  const det = (i, salt) => { const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(0.35 + det(i, 1) * 0.3, 1 + det(i, 2) * 1.4, 5), rockMat);
    rock.position.set(Math.cos(a) * 8.4, -0.9 - det(i, 3) * 0.5, Math.sin(a) * 8.4);
    rock.rotation.z = (det(i, 4) - 0.5) * 0.5;
    group.add(rock);
  }
  // Thin cyan grid lines: one wireframe hex ring set, drawn slightly above tiles.
  const gridMat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55 });
  const gridPts = [];
  tiles.forEach((t) => {
    const p = hexToWorld(t.q, t.r);
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
      gridPts.push(
        new THREE.Vector3(p.x + Math.cos(a0) * HEX_SIZE * 0.98, 0.02, p.z + Math.sin(a0) * HEX_SIZE * 0.98),
        new THREE.Vector3(p.x + Math.cos(a1) * HEX_SIZE * 0.98, 0.02, p.z + Math.sin(a1) * HEX_SIZE * 0.98),
      );
    }
  });
  const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPts);
  group.add(new THREE.LineSegments(gridGeo, gridMat));

  // Lit/dark per tile. Render calls this from pylons / state.litTiles.
  group.userData.setTileLit = (q, r, isLit) => {
    const rec = litState.get(`${q},${r}`);
    if (!rec || rec.lit === isLit) return;
    rec.lit = isLit;
    inst.setColorAt(rec.index, isLit ? lit : dark);
    inst.instanceColor.needsUpdate = true;
  };
  group.userData.setAllDark = () => {
    litState.forEach((rec) => { if (rec.lit) { rec.lit = false; inst.setColorAt(rec.index, dark); } });
    inst.instanceColor.needsUpdate = true;
  };
  group.userData.tileCount = tiles.length;
  return group;
}

// --- Towers: 5 forms, evo 0/1/2 scales up + adds parts + brightens ---
export function createTowerMesh(type, evo = 0) {
  const kind = normalizeTowerType(type);
  const g = new THREE.Group();
  const s = 1 + evo * 0.16; // evo grows the tower
  const bright = 1 + evo * 0.5;
  g.add(basePlate());
  const gold = glowMat(GOLD, bright), amber = glowMat(AMBER, bright);

  if (kind === 'prism') {
    // Golden crystal cluster on a gear base (towers lineup, far left).
    const core = shard(0.34, 1.5, gold); core.position.y = 0.95; g.add(core);
    const s1 = shard(0.2, 0.9, amber); s1.position.set(0.3, 0.55, 0.12); s1.rotation.z = -0.35; g.add(s1);
    const s2 = shard(0.2, 0.8, gold); s2.position.set(-0.28, 0.5, -0.14); s2.rotation.z = 0.4; g.add(s2);
    if (evo >= 1) { const s3 = shard(0.16, 0.7, amber); s3.position.set(0.05, 0.5, 0.32); s3.rotation.x = 0.35; g.add(s3); }
    if (evo >= 2) {
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 12), glowMat(PALE_GOLD, 1.4));
      crown.rotation.x = Math.PI / 2; crown.position.y = 1.55; g.add(crown);
    }
  } else if (kind === 'obelisk') {
    // Amber laser obelisk: tall tapered pillar, glowing core slit, sky beam tip.
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.9, 4), mat(0x3a2a12, { metalness: 0.7 }));
    pillar.position.y = 1.1; pillar.rotation.y = Math.PI / 4; g.add(pillar);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), amber);
    core.position.y = 1.1; g.add(core);
    const tip = shard(0.2, 0.6, gold); tip.position.y = 2.25; g.add(tip);
    if (evo >= 1) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 10), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 1.7; g.add(ring); }
    if (evo >= 2) { const tip2 = shard(0.13, 0.45, glowMat(PALE_GOLD, 1.6)); tip2.position.set(0.22, 1.9, 0); tip2.rotation.z = -0.3; g.add(tip2); }
  } else if (kind === 'lance') {
    // Silver lance: thin shaft, crossguard, long blade tip (towers lineup, center).
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.1, 8), mat(SILVER, { metalness: 0.9, roughness: 0.25 }));
    shaft.position.y = 1.2; g.add(shaft);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), mat(SILVER, { metalness: 0.9, roughness: 0.3 }));
    guard.position.y = 1.55; g.add(guard);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.85, 4), mat(0xdfe6f2, { metalness: 0.95, roughness: 0.15 }));
    blade.position.y = 2.45; blade.rotation.y = Math.PI / 4; g.add(blade);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), glowMat(0x7dd3fc, 1.2));
    gem.position.y = 1.75; g.add(gem);
    if (evo >= 1) { const blade2 = blade.clone(); blade2.scale.setScalar(0.6); blade2.position.set(0.16, 2.1, 0); blade2.rotation.z = -0.25; g.add(blade2); }
    if (evo >= 2) { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 12), glowMat(0x7dd3fc, 1.2)); halo.position.y = 2.05; g.add(halo); }
  } else if (kind === 'mortar') {
    // Heavy iron mortar: angled barrel on a riveted base, ember glow at the breech.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.35, 8), mat(0x3a3f46, { metalness: 0.8, roughness: 0.5 }));
    base.position.y = 0.35; g.add(base);
    const barrel = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 10), mat(0x2c2f36, { metalness: 0.85, roughness: 0.4 }));
    tube.position.y = 0.55; barrel.add(tube);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.05, 6, 10), mat(0x4a4f58, { metalness: 0.8 }));
    muzzle.rotation.x = Math.PI / 2; muzzle.position.y = 1.08; barrel.add(muzzle);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat(AMBER, 1.2));
    ember.position.y = 0.1; barrel.add(ember);
    barrel.rotation.z = -0.6; barrel.position.set(0.18, 0.5, 0); g.add(barrel);
    if (evo >= 1) { const b2 = barrel.clone(); b2.rotation.z = -0.45; b2.position.set(-0.15, 0.45, 0.1); b2.scale.setScalar(0.85); g.add(b2); }
    if (evo >= 2) { const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.1, 8), mat(0x6b5a1e, { metalness: 0.8 })); plate.position.y = 0.55; g.add(plate); }
  } else {
    // Radiant pylon: gold lattice tower crowned by a glowing orb + halo ring.
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 1.5, 6, 1, true), mat(0x8a6d1f, { metalness: 0.75, roughness: 0.4, side: THREE.DoubleSide }));
    frame.position.y = 0.95; g.add(frame);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), glowMat(PALE_GOLD, 1.6));
    orb.position.y = 1.95; g.add(orb);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 16), gold);
    halo.position.y = 1.95; halo.rotation.x = Math.PI / 2.4; g.add(halo);
    if (evo >= 1) { const orb2 = orb.clone(); orb2.scale.setScalar(0.55); orb2.position.y = 1.45; g.add(orb2); }
    if (evo >= 2) { const spikes = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.3, 6), glowMat(GOLD, 1.2)); spikes.position.y = 2.35; g.add(spikes); }
  }
  g.scale.setScalar(s);
  g.userData.kind = kind; g.userData.evo = evo;
  return g;
}

// --- Enemies ---
function eyes(parent, x, y, z, color, r = 0.045) {
  const m = glowMat(color, 2);
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), m);
    e.position.set(x * s, y, z); parent.add(e);
  });
}
export function createEnemyMesh(role) {
  const g = new THREE.Group();
  const r = String(role || 'skitterer').toLowerCase();
  if (r === 'skitterer') {
    // Crimson/violet spider: round body, 8 bent legs, red eyes.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0x6d28a8, { roughness: 0.6 }));
    body.scale.y = 0.75; body.position.y = 0.32; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0x8b2fb8, { roughness: 0.6 }));
    head.position.set(0, 0.34, 0.28); g.add(head);
    const legMat = mat(0x3b1155, { roughness: 0.7 });
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 1 : -1, k = i % 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.55, 4), legMat);
      const a = (k - 1.5) * 0.5;
      leg.position.set(side * 0.32, 0.22, Math.sin(a) * 0.3);
      leg.rotation.z = side * 1.1; leg.rotation.x = Math.cos(a) * 0.5;
      g.add(leg);
    }
    eyes(g, 0.06, 0.38, 0.42, 0xff2222);
  } else if (r === 'stalker') {
    // Cloaked Umbra Stalker: dark violet cone cloak, hood, violet eyes, wisp.
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 8), mat(0x1a0b2e, { roughness: 0.9, transparent: true, opacity: 0.92 }));
    cloak.position.y = 0.62; g.add(cloak);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mat(0x241040, { roughness: 0.9 }));
    hood.position.y = 1.28; g.add(hood);
    const wisp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 6), glowMat(VIOLET, 0.9));
    wisp.position.set(0.3, 0.5, -0.1); wisp.rotation.z = 0.5; g.add(wisp);
    eyes(g, 0.07, 1.3, 0.18, 0xc084fc, 0.04);
  } else if (r === 'snuffer') {
    // Hunched snuffer: grey-green crouched body, long arms, teal claws/eyes.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), mat(0x4a5240, { roughness: 0.85 }));
    body.scale.set(1, 0.8, 1.15); body.position.set(0, 0.42, 0.05); body.rotation.x = 0.5; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat(0x5a6350, { roughness: 0.85 }));
    head.position.set(0, 0.62, 0.32); g.add(head);
    const armMat = mat(0x3d4436, { roughness: 0.85 });
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 5), armMat);
      arm.position.set(s * 0.32, 0.3, 0.25); arm.rotation.z = s * 0.7; g.add(arm);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), glowMat(0x2dd4bf, 1.4));
      claw.position.set(s * 0.5, 0.08, 0.3); claw.rotation.x = Math.PI; g.add(claw);
    });
    eyes(g, 0.06, 0.66, 0.48, 0x2dd4bf, 0.04);
  } else if (r === 'brute') {
    // Stone brute: blocky obsidian body, lava-crack emissive seams, heavy fists.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.55), mat(0x23272e, { roughness: 0.95 }));
    body.position.y = 0.75; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.4), mat(0x2c313a, { roughness: 0.95 }));
    head.position.y = 1.35; g.add(head);
    const crack = glowMat(0xff6d00, 1.6);
    [-0.2, 0.15].forEach((x) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.02), crack);
      c.position.set(x, 0.75, 0.29); c.rotation.z = x * 2; g.add(c);
    });
    const fistMat = mat(0x1c1f24, { roughness: 0.95 });
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.28), fistMat);
      arm.position.set(s * 0.58, 0.7, 0); g.add(arm);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), fistMat);
      fist.position.set(s * 0.58, 0.28, 0.05); g.add(fist);
    });
    eyes(g, 0.1, 1.38, 0.21, 0xff6d00, 0.05);
  } else {
    // Fallback: small crimson wisp.
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), glowMat(CRIMSON, 1));
    w.position.y = 0.4; g.add(w);
    eyes(g, 0.08, 0.45, 0.24, 0xff2222);
  }
  g.userData.role = r;
  return g;
}

// --- Boss: Eclipse Sovereign. Phase changes size, color, wings, horns. ---
export function createBossMesh(phase = 1) {
  const g = new THREE.Group();
  const p = Math.max(1, Math.min(4, phase | 0));
  const s = 1 + (p - 1) * 0.22;
  const bodyColor = p >= 4 ? 0x2a0a3a : p >= 3 ? 0x4a0a2e : 0x3d0a4a;
  const accent = p >= 4 ? 0x00e5ff : p >= 3 ? 0xff2d55 : p === 2 ? 0xff6d00 : CRIMSON;
  // Torso + head.
  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.9, 6), mat(bodyColor, { roughness: 0.7 }));
  torso.position.y = 1.25; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0x2a0a35, { roughness: 0.65 }));
  head.position.y = 2.5; g.add(head);
  // Horns.
  const hornMat = mat(0x1a0510, { metalness: 0.6, roughness: 0.4 });
  [-1, 1].forEach((sd) => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), hornMat);
    horn.position.set(sd * 0.45, 2.95, 0); horn.rotation.z = -sd * 0.55; g.add(horn);
  });
  // Bat wings (phase 2+), bigger + tattered from phase 3.
  if (p >= 2) {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x5b1a5e, roughness: 0.8, side: THREE.DoubleSide, emissive: accent, emissiveIntensity: 0.15 });
    [-1, 1].forEach((sd) => {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.7, 4), wingMat);
      wing.scale.set(1, 1, 0.12); wing.position.set(sd * 1.05, 2.0, -0.35);
      wing.rotation.z = sd * 0.9; wing.rotation.y = sd * 0.4; g.add(wing);
    });
  }
  // Glowing chest core + crown spikes (phase 3+), eclipse ring (phase 4).
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), glowMat(accent, 2));
  core.position.set(0, 1.5, 0.55); g.add(core);
  if (p >= 3) {
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 4), mat(0x1a0510, { metalness: 0.7 }));
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.42, 2.85, Math.sin(a) * 0.42);
      spike.rotation.z = -Math.cos(a) * 0.6; spike.rotation.x = Math.sin(a) * 0.6; g.add(spike);
    }
  }
  if (p >= 4) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 24), glowMat(0x00e5ff, 1.8));
    ring.position.y = 2.5; ring.rotation.x = Math.PI / 2.5; g.add(ring);
  }
  eyes(g, 0.18, 2.55, 0.42, 0xff2222, 0.08);
  g.scale.setScalar(s);
  g.userData.phase = p;
  return g;
}

// --- Pylon: small gold obelisk; lit = warm emissive + bright orb, dark = cold grey ---
export function createPylonMesh(lit = true) {
  const g = new THREE.Group();
  g.add(basePlate(lit ? 0x2a2118 : 0x1a2233));
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 1.15, 6),
    lit ? mat(0x8a6d1f, { metalness: 0.75, emissive: AMBER, emissiveIntensity: 0.25 }) : mat(0x2a3448, { metalness: 0.4, roughness: 0.8 }),
  );
  shaft.position.y = 0.75; g.add(shaft);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 10),
    lit ? glowMat(PALE_GOLD, 1.8) : mat(0x33405a, { roughness: 0.7 }),
  );
  orb.position.y = 1.5; g.add(orb);
  if (lit) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 14), glowMat(GOLD, 1.2));
    halo.position.y = 1.5; halo.rotation.x = Math.PI / 2.3; g.add(halo);
  }
  g.userData.lit = !!lit;
  return g;
}

// --- Core: golden reactor column at island center, pulsing crystal + rings ---
export function createCoreMesh() {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.3, 8), mat(0x3a2f14, { metalness: 0.7 }));
  plinth.position.y = 0.15; g.add(plinth);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.4, 8), glowMat(GOLD, 0.9));
  column.position.y = 1.0; g.add(column);
  const crystal = shard(0.42, 1.6, glowMat(PALE_GOLD, 1.8));
  crystal.position.y = 2.2; g.add(crystal);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 24), glowMat(GOLD, 1.2));
  ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.45; g.add(ring1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.035, 6, 20), glowMat(AMBER, 1.1));
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 1.9; g.add(ring2);
  g.userData.rings = [ring1, ring2];
  g.userData.crystal = crystal;
  return g;
}
