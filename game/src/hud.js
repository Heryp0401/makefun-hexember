// HEXEMBER — hud.js (Builder E: UI/HUD)
// Builds the in-game HUD inside the #hud container provided by the
// integrator's index.html. Pure DOM, no three.js, no sim imports.
// Tower costs/names MUST match config.js / towers.js (builders A/B).
// All DOM is built with document.createElement; no innerHTML is used.

export const TOWER_DEFS = [
  { type: 'prism',      name: 'Pulse Prism',    short: 'Prism',    cost: 50,  hotkey: '1', icon: '\u25C6', color: '#7DD3FC', desc: 'Tembakan pulsa cepat' },
  { type: 'heliotrope', name: 'Heliotrope Beam', short: 'Heliotrope', cost: 75,  hotkey: '2', icon: '\u2600', color: '#FDB813', desc: 'Laser bakar, terangi Stalker' },
  { type: 'lance',      name: 'Sentinel Lance', short: 'Lance',     cost: 100, hotkey: '3', icon: '\u27B9', color: '#A78BFA', desc: 'Tombak jarak jauh' },
  { type: 'mortar',     name: 'Shatter Mortar', short: 'Mortar',    cost: 125, hotkey: '4', icon: '\u2739', color: '#FB7185', desc: 'Ledakan area' },
  { type: 'pylonSuar',  name: 'Pylon Suar',     short: 'Suar',      cost: 60,  hotkey: '5', icon: '\u25C8', color: '#34D399', desc: 'Menara cahaya + sinyal' },
  { type: 'pylon',      name: 'Beacon Pylon',   short: 'Pylon',     cost: 30,  hotkey: 'P', icon: '\u2B21', color: '#FFB703', desc: 'Nyalakan petak gelap' },
];

export const TOTAL_WAVES = 10; // GDD FINAL v1.0: 10 wave, bos di wave 10.

const PALETTE = { bg: '#0A0F1D', panel: '#16213E', gold: '#FFB703', orange: '#FB8500' };

let hudCallbacks = {};
let selectedType = null;
let muted = false;
let speed = 1;
let paused = false;
let els = null; // cached element refs
let styleInjected = false;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement('style');
  s.id = 'hexember-hud-style';
  s.textContent = `
#hud{position:absolute;inset:0;pointer-events:none;font-family:'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;color:#E8EDF7;z-index:10}
#hud button{pointer-events:auto;font-family:inherit;cursor:pointer}
.hx-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:stretch;gap:10px;padding:10px 12px;
  background:linear-gradient(180deg,rgba(10,15,29,.92),rgba(10,15,29,.55) 78%,transparent);pointer-events:none}
.hx-topbar>*{pointer-events:auto}
.hx-panel{background:rgba(22,33,62,.92);border:1px solid rgba(255,183,3,.45);border-radius:10px;
  box-shadow:0 2px 14px rgba(0,0,0,.5)}
.hx-stat{display:flex;flex-direction:column;justify-content:center;padding:6px 14px;min-width:110px}
.hx-label{font-size:10px;letter-spacing:.14em;color:#FFB703;font-weight:700}
.hx-value{font-size:22px;font-weight:800;line-height:1.05;color:#fff;font-variant-numeric:tabular-nums}
.hx-value .hx-unit{font-size:12px;color:#9FB0D0;font-weight:600}
.hx-hearts{display:flex;align-items:center;gap:2px;font-size:20px;line-height:1;min-height:26px}
.hx-heart{color:#FB8500;text-shadow:0 0 8px rgba(251,133,0,.7)}
.hx-heart.empty{color:#3A4763;text-shadow:none}
.hx-heart-num{font-size:13px;color:#9FB0D0;font-weight:700;margin-left:6px}
.hx-lumen-icon{color:#FFB703;font-size:20px;margin-right:6px;text-shadow:0 0 10px rgba(255,183,3,.8)}
.hx-wave{flex:1;display:flex;align-items:center;justify-content:center;gap:12px;text-align:center}
.hx-wave .hx-value{font-size:24px;letter-spacing:.06em}
.hx-phase{font-size:11px;font-weight:700;letter-spacing:.12em;color:#7DD3FC;border:1px solid rgba(125,211,252,.5);
  border-radius:20px;padding:3px 10px;white-space:nowrap}
.hx-phase.build{color:#34D399;border-color:rgba(52,211,153,.5)}
.hx-phase.wave{color:#FB7185;border-color:rgba(251,113,133,.5)}
.hx-startwave{background:linear-gradient(180deg,#FFB703,#FB8500);color:#0A0F1D;border:none;border-radius:10px;
  font-size:15px;font-weight:800;letter-spacing:.04em;padding:10px 18px;min-height:48px;
  box-shadow:0 0 16px rgba(255,183,3,.45)}
.hx-startwave:active{transform:translateY(1px)}
.hx-controls{display:flex;align-items:center;gap:8px;padding:6px 10px}
.hx-btn{background:#16213E;color:#E8EDF7;border:1px solid rgba(255,183,3,.45);border-radius:8px;
  min-width:48px;min-height:44px;font-size:14px;font-weight:700;padding:6px 12px}
.hx-btn:hover{border-color:#FFB703;background:#1E2C52}
.hx-btn.active{background:linear-gradient(180deg,#FFB703,#FB8500);color:#0A0F1D;border-color:#FFB703}
.hx-btn.muted-on{color:#FB7185;border-color:#FB7185}
.hx-buildbar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:8px;
  padding:10px;background:rgba(10,15,29,.88);border:1px solid rgba(255,183,3,.45);border-radius:14px;
  box-shadow:0 4px 20px rgba(0,0,0,.6);pointer-events:auto;max-width:calc(100vw - 220px);overflow-x:auto}
.hx-card{flex:0 0 auto;width:118px;background:#16213E;border:2px solid rgba(255,183,3,.3);border-radius:10px;
  padding:8px 6px 7px;text-align:center;color:#E8EDF7;position:relative;min-height:118px}
.hx-card:hover{border-color:#FFB703}
.hx-card.selected{border-color:#FFB703;background:#22335F;box-shadow:0 0 14px rgba(255,183,3,.55)}
.hx-card.unaffordable{opacity:.45;filter:saturate(.4)}
.hx-card.unaffordable:hover{border-color:rgba(255,183,3,.3)}
.hx-card-icon{font-size:30px;line-height:1.1;text-shadow:0 0 12px currentColor}
.hx-card-name{font-size:12px;font-weight:800;margin-top:4px;min-height:30px;line-height:1.15}
.hx-card-cost{font-size:16px;font-weight:800;color:#FFB703;margin-top:4px}
.hx-card-cost .hx-lumen-icon{font-size:14px;margin-right:2px}
.hx-card-key{display:inline-block;margin-top:5px;font-size:11px;font-weight:800;color:#0A0F1D;
  background:#FFB703;border-radius:5px;padding:2px 8px}
.hx-abilities{position:absolute;right:12px;bottom:150px;display:flex;flex-direction:column;gap:14px;pointer-events:auto}
.hx-ability{position:relative;width:92px;height:92px;border-radius:50%;border:3px solid #FFB703;
  background:radial-gradient(circle at 50% 35%,#22335F,#0A0F1D 75%);color:#fff;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:0}
.hx-ability .hx-ab-icon{font-size:30px;line-height:1;text-shadow:0 0 12px rgba(255,183,3,.8);z-index:2}
.hx-ability .hx-ab-state{font-size:11px;font-weight:800;letter-spacing:.05em;z-index:2}
.hx-ability .hx-ab-key{position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;
  background:#FFB703;color:#0A0F1D;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;z-index:3}
.hx-ability.ready{box-shadow:0 0 18px rgba(52,211,153,.65);border-color:#34D399}
.hx-ability.ready .hx-ab-state{color:#34D399}
.hx-ability.cooling{border-color:#5A6B8C;box-shadow:none}
.hx-ability.cooling .hx-ab-state{color:#FFB703}
.hx-ability .hx-ab-sweep{position:absolute;inset:0;z-index:1;pointer-events:none}
.hx-ability-name{text-align:center;font-size:10px;font-weight:800;letter-spacing:.1em;color:#FFD166;margin-top:2px}
.hx-toast{position:absolute;top:84px;left:50%;transform:translateX(-50%);background:rgba(22,33,62,.95);
  border:1px solid rgba(255,183,3,.6);color:#FFD166;border-radius:8px;padding:8px 16px;font-size:14px;
  font-weight:700;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap;z-index:20}
.hx-toast.show{opacity:1}
@media (max-width:900px){
  .hx-value{font-size:17px}.hx-wave .hx-value{font-size:18px}.hx-stat{min-width:82px;padding:5px 9px}
  .hx-card{width:96px;min-height:104px}.hx-card-icon{font-size:24px}
  .hx-abilities{bottom:132px}.hx-ability{width:72px;height:72px}.hx-ability .hx-ab-icon{font-size:22px}
  .hx-buildbar{max-width:calc(100vw - 16px)}
}
`;
  document.head.appendChild(s);
}

function formatNum(n) {
  const v = Math.floor(Number(n) || 0);
  return v.toLocaleString('en-US');
}

function renderHearts(container, hp, maxHp) {
  while (container.firstChild) container.removeChild(container.firstChild);
  const total = Math.max(0, Math.floor(Number(maxHp) || 0));
  const filled = Math.max(0, Math.min(total, Math.floor(Number(hp) || 0)));
  const shown = Math.min(total, 10);
  for (let i = 0; i < shown; i++) {
    const h = el('span', 'hx-heart' + (i < filled ? '' : ' empty'), '\u2665');
    container.appendChild(h);
  }
  // Always show the exact numbers beside the hearts (also covers maxHP > 10).
  container.appendChild(el('span', 'hx-heart-num', filled + '/' + total));
}

function abilityRemaining(state, key) {
  const ab = state && state[key];
  if (!ab || ab.cooldownUntil === undefined || ab.cooldownUntil === null) return 0;
  // cooldownUntil is in seconds on the same clock as state.now when given,
  // otherwise wall-clock seconds (Date.now()/1000).
  const now = (state && typeof state.now === 'number') ? state.now : Date.now() / 1000;
  return Math.max(0, Number(ab.cooldownUntil) - now);
}

function renderAbility(btn, sweep, stateEl, remaining, total) {
  if (remaining > 0) {
    btn.classList.remove('ready');
    btn.classList.add('cooling');
    const secs = Math.ceil(remaining);
    stateEl.textContent = secs + 's';
    const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
    // Radial cooldown sweep: dark wedge shrinks as the cooldown ends.
    const deg = frac * 360;
    sweep.style.background =
      'conic-gradient(rgba(10,15,29,.82) ' + deg + 'deg, transparent ' + deg + 'deg)';
  } else {
    btn.classList.remove('cooling');
    btn.classList.add('ready');
    stateEl.textContent = 'READY';
    sweep.style.background = 'none';
  }
}

// Cooldown totals (seconds) — must match abilities.js (builder C).
// Used only for the sweep fraction; remaining seconds come from state.
const FLARE_COOLDOWN = 20;
const OVERCHARGE_COOLDOWN = 25;

export function initHUD(callbacks) {
  hudCallbacks = callbacks || {};
  injectStyle();
  let root = document.getElementById('hud');
  if (!root) {
    root = el('div');
    root.id = 'hud';
    document.body.appendChild(root);
  }
  while (root.firstChild) root.removeChild(root.firstChild);

  // ---- Top bar ----
  const top = el('div', 'hx-topbar');

  const scorePanel = el('div', 'hx-panel hx-stat');
  scorePanel.appendChild(el('div', 'hx-label', 'SCORE'));
  const scoreVal = el('div', 'hx-value', '0');
  scorePanel.appendChild(scoreVal);
  top.appendChild(scorePanel);

  const hpPanel = el('div', 'hx-panel hx-stat');
  hpPanel.appendChild(el('div', 'hx-label', 'CORE HP'));
  const hearts = el('div', 'hx-hearts');
  hpPanel.appendChild(hearts);
  top.appendChild(hpPanel);

  const lumenPanel = el('div', 'hx-panel hx-stat');
  lumenPanel.appendChild(el('div', 'hx-label', 'LUMEN'));
  const lumenRow = el('div', 'hx-value');
  const lumenIcon = el('span', 'hx-lumen-icon', '\u25C6');
  const lumenVal = el('span', null, '0');
  lumenRow.appendChild(lumenIcon);
  lumenRow.appendChild(lumenVal);
  lumenPanel.appendChild(lumenRow);
  top.appendChild(lumenPanel);

  const wavePanel = el('div', 'hx-panel hx-wave');
  const waveVal = el('div', 'hx-value', 'WAVE 1 / 10');
  wavePanel.appendChild(waveVal);
  const phaseBadge = el('span', 'hx-phase build', 'FASE BANGUN');
  wavePanel.appendChild(phaseBadge);
  const startWaveBtn = el('button', 'hx-startwave', '\u25B6  MULAI WAVE');
  startWaveBtn.id = 'hud-start-wave';
  startWaveBtn.type = 'button';
  startWaveBtn.addEventListener('click', () => {
    if (hudCallbacks.onStartWave) hudCallbacks.onStartWave();
  });
  wavePanel.appendChild(startWaveBtn);
  top.appendChild(wavePanel);

  const controls = el('div', 'hx-panel hx-controls');
  const pauseBtn = el('button', 'hx-btn', '\u23F8  Jeda');
  pauseBtn.id = 'hud-pause';
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Jeda / lanjut (Spasi)');
  pauseBtn.addEventListener('click', () => {
    if (hudCallbacks.onPause) hudCallbacks.onPause();
  });
  const speedBtn = el('button', 'hx-btn', '1x');
  speedBtn.id = 'hud-speed';
  speedBtn.type = 'button';
  speedBtn.title = 'Kecepatan (F)';
  speedBtn.addEventListener('click', () => {
    if (hudCallbacks.onSpeed) hudCallbacks.onSpeed();
  });
  const muteBtn = el('button', 'hx-btn', '\u266A');
  muteBtn.id = 'hud-mute';
  muteBtn.type = 'button';
  muteBtn.title = 'Suara (M)';
  muteBtn.addEventListener('click', () => {
    if (hudCallbacks.onMute) hudCallbacks.onMute();
  });
  controls.appendChild(pauseBtn);
  controls.appendChild(speedBtn);
  controls.appendChild(muteBtn);
  top.appendChild(controls);

  root.appendChild(top);

  // ---- Bottom build bar ----
  const bar = el('div', 'hx-buildbar');
  bar.id = 'hud-buildbar';
  const cardEls = {};
  for (const def of TOWER_DEFS) {
    const card = el('button', 'hx-card');
    card.type = 'button';
    card.dataset.type = def.type;
    card.title = def.name + ' — ' + def.desc + ' (' + def.cost + ' Lumen)';
    const icon = el('div', 'hx-card-icon', def.icon);
    icon.style.color = def.color;
    card.appendChild(icon);
    card.appendChild(el('div', 'hx-card-name', def.name));
    const cost = el('div', 'hx-card-cost');
    cost.appendChild(el('span', 'hx-lumen-icon', '\u25C6'));
    cost.appendChild(document.createTextNode(String(def.cost)));
    card.appendChild(cost);
    card.appendChild(el('span', 'hx-card-key', '[' + def.hotkey + ']'));
    card.addEventListener('click', () => {
      selectTower(def.type);
      if (hudCallbacks.onSelect) hudCallbacks.onSelect(def.type);
    });
    bar.appendChild(card);
    cardEls[def.type] = card;
  }
  root.appendChild(bar);

  // ---- Right-side ability buttons ----
  const abWrap = el('div', 'hx-abilities');
  function makeAbility(key, label, icon, cbName) {
    const holder = el('div');
    const btn = el('button', 'hx-ability ready');
    btn.type = 'button';
    btn.id = 'hud-ability-' + key;
    btn.setAttribute('aria-label', label + ' (tombol ' + key.toUpperCase() + ')');
    const keyBadge = el('span', 'hx-ab-key', key.toUpperCase());
    const sweep = el('span', 'hx-ab-sweep');
    const ic = el('span', 'hx-ab-icon', icon);
    const st = el('span', 'hx-ab-state', 'READY');
    btn.appendChild(keyBadge);
    btn.appendChild(sweep);
    btn.appendChild(ic);
    btn.appendChild(st);
    btn.addEventListener('click', () => {
      if (hudCallbacks[cbName]) hudCallbacks[cbName]();
    });
    holder.appendChild(btn);
    holder.appendChild(el('div', 'hx-ability-name', label));
    return { holder, btn, sweep, stateEl: st };
  }
  const flare = makeAbility('q', 'SOLAR FLARE', '\u2600', 'onFlare');
  const over = makeAbility('e', 'OVERCHARGE', '\u26A1', 'onOvercharge');
  abWrap.appendChild(flare.holder);
  abWrap.appendChild(over.holder);
  root.appendChild(abWrap);

  // ---- Toast (transient messages, e.g. ghost reason) ----
  const toast = el('div', 'hx-toast');
  toast.id = 'hud-toast';
  root.appendChild(toast);

  els = {
    root, scoreVal, hearts, lumenVal, waveVal, phaseBadge, startWaveBtn,
    pauseBtn, speedBtn, muteBtn, cardEls, flare, over, toast,
  };
  renderHearts(hearts, 5, 5);
  return els;
}

export function selectTower(type) {
  selectedType = type || null;
  if (els) {
    for (const [t, card] of Object.entries(els.cardEls)) {
      card.classList.toggle('selected', t === selectedType);
    }
  }
  return selectedType;
}

export function setPaused(p) {
  paused = !!p;
  if (els) {
    els.pauseBtn.textContent = paused ? '\u25B6  Lanjut' : '\u23F8  Jeda';
    els.pauseBtn.classList.toggle('active', paused);
  }
}

export function setSpeed(s) {
  speed = s === 2 ? 2 : 1;
  if (els) {
    els.speedBtn.textContent = speed + 'x';
    els.speedBtn.classList.toggle('active', speed === 2);
  }
}

export function setMuted(m) {
  muted = !!m;
  if (els) {
    els.muteBtn.classList.toggle('muted-on', muted);
    els.muteBtn.textContent = muted ? '\u266A\u0338' : '\u266A';
    els.muteBtn.title = muted ? 'Suara mati (M)' : 'Suara (M)';
  }
}

let toastTimer = null;
export function showToast(msg, ms) {
  if (!els) return;
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms || 1600);
}

const PHASE_LABELS = {
  build: 'FASE BANGUN',
  wave: 'WAVE BERJALAN',
  boon: 'PILIH BOON',
  paused: 'JEDA',
  victory: 'MENANG',
  gameover: 'GUGUR',
  title: 'HEXEMBER',
};

export function updateHUD(state) {
  if (!els) return;
  state = state || {};
  els.scoreVal.textContent = formatNum(state.score);
  els.lumenVal.textContent = formatNum(state.lumen);
  renderHearts(els.hearts, state.coreHP, state.coreMaxHP);
  const total = state.totalWaves || TOTAL_WAVES;
  els.waveVal.textContent = 'WAVE ' + (state.wave || 1) + ' / ' + total;
  const phase = state.phase || 'build';
  els.phaseBadge.textContent = PHASE_LABELS[phase] || String(phase).toUpperCase();
  els.phaseBadge.className = 'hx-phase ' + (phase === 'build' ? 'build' : phase === 'wave' ? 'wave' : '');
  // Start-wave button only during the build phase.
  els.startWaveBtn.style.display = phase === 'build' ? '' : 'none';
  if (typeof state.paused === 'boolean' && state.paused !== paused) setPaused(state.paused);
  if (typeof state.speed === 'number' && state.speed !== speed) setSpeed(state.speed);
  if (typeof state.muted === 'boolean' && state.muted !== muted) setMuted(state.muted);
  if (state.selected !== undefined && state.selected !== selectedType) selectTower(state.selected);
  // Affordability: dim cards the player cannot afford right now.
  const lumen = Number(state.lumen) || 0;
  for (const def of TOWER_DEFS) {
    const card = els.cardEls[def.type];
    if (card) card.classList.toggle('unaffordable', lumen < def.cost);
  }
  // Ability cooldowns.
  renderAbility(els.flare.btn, els.flare.sweep, els.flare.stateEl,
    abilityRemaining(state, 'flare'), FLARE_COOLDOWN);
  renderAbility(els.over.btn, els.over.sweep, els.over.stateEl,
    abilityRemaining(state, 'overcharge'), OVERCHARGE_COOLDOWN);
}
