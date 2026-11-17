// HEXEMBER — procedural audio (F). 100% WebAudio, no files, no network.
// Lazy init on first user gesture; silent in shot mode (main.js never
// calls ensureAudio()/startMusic() when ?shot= is present).
// One shared 0.5s white-noise buffer feeds every percussive sound.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let musicNodes = null; // { drone, fifth, pulse, pulseGain, lfo, timer, step }
let musicIntensity = 0;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  // Shared white-noise buffer (0.5s), built once.
  noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (ctx.state === 'suspended') void ctx.resume();
  return true;
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = !!m;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  return muted;
}

// tone(freq, dur, type, gain, slideTo, delay=0, dest=master): one oscillator,
// optional exponential glide to slideTo. gain is peak; short attack, exp decay.
function tone(freq, dur, type, gain, slideTo, delay = 0, dest = null) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, freq), t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest || master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// noise(dur, filterFreq, gain, filterType='lowpass', delay=0, dest=master):
// burst of the shared white-noise buffer through one biquad filter.
function noise(dur, filterFreq, gain, filterType = 'lowpass', delay = 0, dest = null) {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest || master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// SFX table: name -> synthesis recipe (one or two helper calls each).
// All gains are peak values into the 0.5 master gain; nothing clips.
const SFX = {
  place: (d) => { noise(0.18, 300, 0.5, 'lowpass', 0, d); tone(90, 0.12, 'sine', 0.4, 50, 0, d); },
  error: (d) => { tone(110, 0.18, 'square', 0.2, 90, 0, d); },
  shoot_prism: (d) => { tone(880, 0.12, 'sawtooth', 0.16, 220, 0, d); noise(0.08, 3000, 0.1, 'highpass', 0, d); },
  shoot_beam: (d) => { tone(440, 0.25, 'sine', 0.16, 660, 0, d); },
  shoot_lance: (d) => { noise(0.06, 4000, 0.3, 'highpass', 0, d); tone(1200, 0.06, 'square', 0.12, 300, 0, d); },
  shoot_mortar: (d) => { noise(0.35, 200, 0.55, 'lowpass', 0, d); tone(60, 0.3, 'sine', 0.45, 35, 0, d); },
  enemy_die: (d) => { tone(300, 0.15, 'triangle', 0.28, 80, 0, d); noise(0.1, 800, 0.18, 'lowpass', 0, d); },
  lumen: (d) => { tone(1320, 0.25, 'sine', 0.18, 1760, 0, d); tone(1760, 0.2, 'sine', 0.1, 1760, 0.06, d); },
  pylon: (d) => { tone(220, 0.4, 'sine', 0.12, 220, 0, d); tone(330, 0.4, 'sine', 0.06, 330, 0, d); },
  brownout: (d) => { tone(520, 0.18, 'square', 0.16, 520, 0, d); tone(392, 0.18, 'square', 0.16, 392, 0.2, d); },
  flare: (d) => { noise(0.5, 800, 0.25, 'bandpass', 0, d); tone(300, 0.5, 'sine', 0.12, 1200, 0, d); },
  overcharge: (d) => { tone(180, 0.6, 'sawtooth', 0.14, 900, 0, d); },
  boss_roar: (d) => { tone(160, 0.9, 'sawtooth', 0.28, 40, 0, d); noise(0.7, 150, 0.25, 'lowpass', 0, d); },
  victory: (d) => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.18, f, i * 0.12, d));
  },
  defeat: (d) => { tone(110, 1.2, 'sawtooth', 0.2, 55, 0, d); tone(55, 1.2, 'sine', 0.18, 40, 0.1, d); },
  click: (d) => { tone(800, 0.05, 'square', 0.1, 800, 0, d); },
  wave_start: (d) => { tone(196, 0.35, 'sawtooth', 0.18, 196, 0, d); tone(294, 0.35, 'sawtooth', 0.18, 294, 0.18, d); },
};

export function playSFX(name, opts = {}) {
  if (!ctx || muted) return false;
  const fn = SFX[name];
  if (!fn) return false;
  if (ctx.state === 'suspended') void ctx.resume();
  // opts.gain scales the whole effect (0..1, default 1) through a temporary
  // per-call gain node, so overlapping scaled SFX never interfere.
  if (opts.gain !== undefined && opts.gain !== 1) {
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, opts.gain));
    g.connect(master);
    fn(g);
    setTimeout(() => g.disconnect(), 1500);
  } else {
    fn(null);
  }
  return true;
}

// ---- Music: layered oscillators, intensity 0..1 follows wave/boss ----
// Layer 0 (always): dark drone, sine 55 Hz + fifth 82.5 Hz, quiet.
// Layer 1 (intensity > 0.25): pulse bass — 55 Hz square through an LFO'd
// gain, slow 1 Hz throb. Layer 2 (intensity > 0.5): sparse arpeggio,
// minor-scale notes every 500 ms, deterministic step cycle, very quiet.
// Music never starts before a user gesture (ensureAudio gates it) and is
// never started in shot mode (main.js skips startMusic there).
const ARP_SCALE = [220, 261.63, 329.63, 392, 329.63, 261.63];

export function startMusic() {
  if (!ensureAudio() || musicNodes) return false;
  const drone = ctx.createOscillator();
  drone.type = 'sine'; drone.frequency.value = 55;
  const droneGain = ctx.createGain(); droneGain.gain.value = 0.05;
  drone.connect(droneGain).connect(master); drone.start();
  const fifth = ctx.createOscillator();
  fifth.type = 'sine'; fifth.frequency.value = 82.5;
  const fifthGain = ctx.createGain(); fifthGain.gain.value = 0.02;
  fifth.connect(fifthGain).connect(master); fifth.start();
  const pulse = ctx.createOscillator();
  pulse.type = 'square'; pulse.frequency.value = 55;
  const pulseGain = ctx.createGain(); pulseGain.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine'; lfo.frequency.value = 1;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.03;
  lfo.connect(lfoGain).connect(pulseGain.gain);
  pulse.connect(pulseGain).connect(master); pulse.start(); lfo.start();
  const timer = setInterval(() => {
    if (!musicNodes || musicIntensity < 0.5 || muted) return;
    const f = ARP_SCALE[musicNodes.step % ARP_SCALE.length];
    musicNodes.step++;
    tone(f, 0.4, 'triangle', 0.05);
  }, 500);
  musicNodes = { drone, fifth, pulse, lfo, droneGain, fifthGain, pulseGain, timer, step: 0 };
  applyMusicIntensity();
  return true;
}

function applyMusicIntensity() {
  if (!musicNodes || !ctx) return;
  const t = ctx.currentTime;
  musicNodes.droneGain.gain.setTargetAtTime(0.04 + 0.02 * musicIntensity, t, 0.5);
  musicNodes.fifthGain.gain.setTargetAtTime(0.01 + 0.03 * musicIntensity, t, 0.5);
  musicNodes.pulseGain.gain.setTargetAtTime(musicIntensity > 0.25 ? 0.035 : 0, t, 0.5);
}

export function setMusicIntensity(v) {
  musicIntensity = Math.max(0, Math.min(1, v || 0));
  applyMusicIntensity();
  return musicIntensity;
}

export function stopMusic() {
  if (!musicNodes) return false;
  clearInterval(musicNodes.timer);
  for (const k of ['drone', 'fifth', 'pulse', 'lfo']) {
    try { musicNodes[k].stop(); } catch (_) { /* already stopped */ }
  }
  musicNodes = null;
  return true;
}
