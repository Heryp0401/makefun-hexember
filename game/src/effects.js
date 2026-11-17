// effects.js — HEXEMBER particles, beams, hit-stop, screen shake.
// Pure view-side FX: no sim state is read or mutated here.
import * as THREE from 'three';

// --- Particles: one pooled THREE.Points system, per-particle velocity/life ---
const MAX_PARTICLES = 2000;
let points = null, positions = null, velocities = null, life = null, maxLife = null;
let colors = null, baseColors = null, head = 0, alive = 0;

function ensurePoints(scene) {
  if (points) return;
  positions = new Float32Array(MAX_PARTICLES * 3);
  velocities = new Float32Array(MAX_PARTICLES * 3);
  life = new Float32Array(MAX_PARTICLES);
  maxLife = new Float32Array(MAX_PARTICLES);
  colors = new Float32Array(MAX_PARTICLES * 3);
  baseColors = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
}

export function spawnParticles(scene, pos, { color = 0xffb703, count = 16, speed = 3, life: lifeSec = 0.7, up = 1.5 } = {}) {
  ensurePoints(scene);
  const c = new THREE.Color(color);
  for (let n = 0; n < count; n++) {
    const i = head; head = (head + 1) % MAX_PARTICLES;
    positions[i * 3] = pos.x; positions[i * 3 + 1] = (pos.y ?? 0.5) + Math.random() * 0.2; positions[i * 3 + 2] = pos.z;
    const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
    velocities[i * 3] = Math.cos(a) * sp;
    velocities[i * 3 + 1] = (Math.random() * 0.8 + 0.2) * up;
    velocities[i * 3 + 2] = Math.sin(a) * sp;
    life[i] = maxLife[i] = lifeSec * (0.6 + Math.random() * 0.7);
    const shade = 0.7 + Math.random() * 0.5;
    baseColors[i * 3] = c.r * shade; baseColors[i * 3 + 1] = c.g * shade; baseColors[i * 3 + 2] = c.b * shade;
    colors[i * 3] = baseColors[i * 3]; colors[i * 3 + 1] = baseColors[i * 3 + 1]; colors[i * 3 + 2] = baseColors[i * 3 + 2];
    alive++;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
}

// --- Beams: thin additive cylinder + outer glow sleeve + end sparks ---
export function createBeam(scene, from, to, color = 0xffb703, { width = 0.09, life: lifeSec = 0 } = {}) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(width, width, 1, 6, 1, true), coreMat);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(width * 2.6, width * 2.6, 1, 6, 1, true), glowMat);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(width * 2.2, 8, 8), glowMat);
  group.add(core, sleeve, tip);
  group.userData = { from: new THREE.Vector3(from.x, from.y ?? 1, from.z), to: new THREE.Vector3(to.x, to.y ?? 0.5, to.z), life: lifeSec, age: 0, dead: false, coreMat, glowMat };
  const place = () => {
    const { from: f, to: t } = group.userData;
    const mid = f.clone().add(t).multiplyScalar(0.5);
    const dir = t.clone().sub(f), len = dir.length();
    group.position.copy(mid);
    group.lookAt(t.x, t.y, t.z);
    group.rotateX(Math.PI / 2); // cylinder Y axis -> along beam
    core.scale.set(1, len, 1); sleeve.scale.set(1, len, 1);
    tip.position.set(0, len / 2, 0);
  };
  place();
  scene.add(group);
  return {
    group,
    setEndpoints(f, t) {
      group.userData.from.set(f.x, f.y ?? 1, f.z);
      group.userData.to.set(t.x, t.y ?? 0.5, t.z);
      place();
    },
    dispose() {
      group.userData.dead = true;
      scene.remove(group);
      core.geometry.dispose(); sleeve.geometry.dispose(); tip.geometry.dispose();
      coreMat.dispose(); glowMat.dispose();
    },
  };
}
const beams = new Set();
export function trackBeam(beam) { beams.add(beam); return beam; }

// --- Hit-stop + shake ---
let freezeUntil = 0, shakeMag = 0, shakeUntil = 0;
export function hitStop(ms = 60) { freezeUntil = Math.max(freezeUntil, performance.now() + ms); }
export function shake(magnitude = 0.25, ms = 250) {
  shakeMag = Math.max(shakeMag, magnitude); shakeUntil = Math.max(shakeUntil, performance.now() + ms);
}
export function isHitStopped() { return performance.now() < freezeUntil; }
export function getShakeOffset() {
  if (performance.now() > shakeUntil) { shakeMag = 0; return { x: 0, y: 0 }; }
  return { x: (Math.random() - 0.5) * 2 * shakeMag, y: (Math.random() - 0.5) * 2 * shakeMag };
}

// Advance particles + beam lifetimes. Returns { frozen } so the caller can
// pause its own animation while a hit-stop is active. dt is real seconds.
export function updateEffects(dt) {
  const frozen = performance.now() < freezeUntil;
  if (frozen) return { frozen };
  if (points && alive > 0) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { positions[i * 3 + 1] = -100; alive--; continue; }
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      velocities[i * 3 + 1] -= 4 * dt; // gravity
      const f = life[i] / maxLife[i]; // fade from base color, not compounded
      colors[i * 3] = baseColors[i * 3] * f;
      colors[i * 3 + 1] = baseColors[i * 3 + 1] * f;
      colors[i * 3 + 2] = baseColors[i * 3 + 2] * f;
    }
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
  }
  beams.forEach((b) => {
    const u = b.group.userData;
    if (u.dead) { beams.delete(b); return; }
    if (u.life > 0) {
      u.age += dt;
      const f = Math.max(0, 1 - u.age / u.life);
      u.coreMat.opacity = 0.95 * f; u.glowMat.opacity = 0.45 * f;
      if (f <= 0) { b.dispose(); beams.delete(b); }
    } else {
      // Idle pulse for persistent beams.
      const pulse = 0.8 + Math.sin(performance.now() * 0.02) * 0.15;
      u.coreMat.opacity = 0.95 * pulse; u.glowMat.opacity = 0.45 * pulse;
    }
  });
  return { frozen };
}
