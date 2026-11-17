// HEXEMBER — screens.js (Builder E: UI/screens)
// Title / difficulty select / boon choice / victory / game over / pause.
// All screens render inside the #screens container provided by the
// integrator's index.html, over the live island (render.js keeps running
// behind the overlay). Pure DOM, no three.js, no sim imports.
// Palette: midnight blue #0A0F1D / #16213E + gold #FFB703 / #FB8500.
// All DOM is built with document.createElement; no innerHTML is used.

const DIFFICULTIES = [
  { id: 'ember',     name: 'Ember',     order: 1, tag: 'Mudah',    desc: 'Untuk pemanasan. Musuh lebih lemah, Lumen lebih dermawan.' },
  { id: 'radiant',   name: 'Radiant',   order: 2, tag: 'Normal',   desc: 'Pengalaman standar HEXEMBER. Seimbang untuk semua pemain.' },
  { id: 'eclipse',   name: 'Eclipse',   order: 3, tag: 'Sulit',    desc: 'Musuh lebih kuat dan cepat. Untuk yang sudah menamatkan Radiant.' },
  { id: 'awakening', name: 'Awakening', order: 4, tag: 'Tersulit', desc: 'Mode tersulit. Hanya untuk yang sudah menamatkan Eclipse.',
  },
];

// Awakening tooltip — concrete differences, per GDD FINAL v1.0 §6.
// Must stay in sync with difficulty.js (builder A).
const AWAKENING_TOOLTIP_LINES = [
  '+60% HP musuh',
  '+25% kecepatan musuh',
  'Drain Pylon 2x',
  'Lumen yang jatuh lebih sedikit',
  'Bos mendapat fase ke-4: Eclipse Unbound',
];
const AWAKENING_WARNING = 'Mode tersulit. Hanya untuk yang sudah menamatkan Eclipse.';

let styleInjected = false;
let currentScreen = null; // 'title' | 'boon' | 'victory' | 'gameover' | 'pause' | null
let awakeningTipEl = null;

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
  s.id = 'hexember-screens-style';
  s.textContent = `
#screens{position:absolute;inset:0;pointer-events:none;font-family:'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;color:#E8EDF7;z-index:20}
#screens button{pointer-events:auto;font-family:inherit;cursor:pointer}
.hx-screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;
  background:radial-gradient(ellipse at 50% 42%,rgba(10,15,29,.18),rgba(10,15,29,.72) 78%);padding:16px;overflow-y:auto}
.hx-screen>*{pointer-events:auto}
.hx-panel-card{position:relative;background:rgba(10,15,29,.92);border:1px solid rgba(255,183,3,.55);border-radius:16px;
  box-shadow:0 8px 40px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.4);padding:26px 30px;max-width:720px;width:100%;
  text-align:center;max-height:calc(100vh - 32px);overflow-y:auto}
.hx-logo{font-size:52px;font-weight:900;letter-spacing:.14em;line-height:1;color:#FFB703;
  text-shadow:0 0 26px rgba(255,183,3,.55),0 3px 0 #7A5200}
.hx-tagline{font-size:15px;color:#C7D2E8;margin-top:8px;letter-spacing:.04em}
.hx-tagline b{color:#FFD166}
.hx-section-title{font-size:13px;font-weight:800;letter-spacing:.18em;color:#FFB703;margin:20px 0 10px}
.hx-diff-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.hx-diff{position:relative;flex:1 1 140px;max-width:160px;min-height:96px;background:#16213E;
  border:2px solid rgba(255,183,3,.3);border-radius:12px;color:#E8EDF7;padding:12px 8px 10px}
.hx-diff:hover{border-color:#FFB703}
.hx-diff.selected{border-color:#FFB703;background:#22335F;box-shadow:0 0 16px rgba(255,183,3,.5)}
.hx-diff-name{font-size:17px;font-weight:800}
.hx-diff-tag{font-size:11px;color:#9FB0D0;font-weight:700;letter-spacing:.08em;margin-top:2px}
.hx-diff-dots{font-size:13px;letter-spacing:3px;color:#FFB703;margin-top:8px}
.hx-diff-dots .off{color:#3A4763}
.hx-diff-desc{font-size:11px;color:#C7D2E8;line-height:1.35;margin-top:6px}
.hx-badge-bang{position:absolute;top:-9px;right:-7px;width:26px;height:26px;border-radius:50%;
  background:linear-gradient(180deg,#FFB703,#FB8500);color:#0A0F1D;font-size:16px;font-weight:900;line-height:26px;
  border:2px solid #0A0F1D;box-shadow:0 0 10px rgba(251,133,0,.8);cursor:help}
.hx-tooltip{position:absolute;z-index:30;width:300px;max-width:86vw;background:#16213E;border:1px solid #FB8500;
  border-radius:10px;padding:12px 14px;text-align:left;font-size:13px;line-height:1.5;color:#E8EDF7;
  box-shadow:0 8px 28px rgba(0,0,0,.75);display:none}
.hx-tooltip.show{display:block}
.hx-tooltip ul{margin:6px 0 8px;padding-left:18px}
.hx-tooltip li{margin:2px 0}
.hx-tooltip .hx-warn{color:#FB8500;font-weight:800}
.hx-btn-big{display:inline-block;background:linear-gradient(180deg,#FFB703,#FB8500);color:#0A0F1D;border:none;
  border-radius:12px;font-size:20px;font-weight:900;letter-spacing:.08em;padding:14px 44px;min-height:56px;margin-top:22px;
  box-shadow:0 0 22px rgba(255,183,3,.5)}
.hx-btn-big:hover{filter:brightness(1.08)}
.hx-btn-big:active{transform:translateY(1px)}
.hx-btn-ghost{display:inline-block;background:#16213E;color:#E8EDF7;border:1px solid rgba(255,183,3,.5);
  border-radius:10px;font-size:15px;font-weight:700;padding:11px 22px;min-height:48px;margin-top:14px}
.hx-btn-ghost:hover{border-color:#FFB703}
.hx-howto{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px}
.hx-howto-chip{background:rgba(22,33,62,.85);border:1px solid rgba(255,183,3,.3);border-radius:9px;
  padding:8px 11px;font-size:12.5px;line-height:1.45;color:#C7D2E8;max-width:220px;text-align:left}
.hx-howto-chip b{color:#FFD166}
.hx-best{font-size:14px;color:#FFD166;font-weight:700;margin-top:14px}
.hx-best span{color:#fff}
.hx-stars{font-size:44px;letter-spacing:8px;line-height:1;margin:6px 0}
.hx-stars .on{color:#FFB703;text-shadow:0 0 16px rgba(255,183,3,.8)}
.hx-stars .off{color:#3A4763}
.hx-result-title{font-size:44px;font-weight:900;letter-spacing:.1em;line-height:1}
.hx-result-title.win{color:#FFB703;text-shadow:0 0 24px rgba(255,183,3,.55)}
.hx-result-title.lose{color:#FB7185;text-shadow:0 0 24px rgba(251,113,133,.5)}
.hx-grade{font-size:64px;font-weight:900;color:#FFB703;line-height:1;margin-top:8px;
  text-shadow:0 0 26px rgba(255,183,3,.6)}
.hx-grade-sub{font-size:13px;color:#9FB0D0;letter-spacing:.12em;font-weight:700}
.hx-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:18px}
.hx-stat-cell{background:#16213E;border:1px solid rgba(255,183,3,.3);border-radius:10px;padding:10px 6px}
.hx-stat-cell .v{font-size:22px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
.hx-stat-cell .k{font-size:11px;color:#9FB0D0;font-weight:700;letter-spacing:.06em;margin-top:2px}
.hx-top5{margin:18px auto 0;max-width:480px;width:100%;border-collapse:collapse;font-size:13.5px}
.hx-top5 caption{font-size:12px;font-weight:800;letter-spacing:.16em;color:#FFB703;margin-bottom:6px}
.hx-top5 th,.hx-top5 td{padding:6px 8px;border-bottom:1px solid rgba(255,183,3,.18);text-align:center;font-variant-numeric:tabular-nums}
.hx-top5 th{color:#9FB0D0;font-size:11px;letter-spacing:.1em}
.hx-top5 td:first-child{color:#FFB703;font-weight:800}
.hx-top5 .hx-empty{color:#9FB0D0;font-style:italic}
.hx-boon-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:10px}
.hx-boon{flex:1 1 180px;max-width:210px;min-height:190px;background:#16213E;border:2px solid rgba(255,183,3,.35);
  border-radius:12px;color:#E8EDF7;padding:16px 12px;display:flex;flex-direction:column}
.hx-boon:hover{border-color:#FFB703;box-shadow:0 0 16px rgba(255,183,3,.4)}
.hx-boon:disabled{opacity:.5;cursor:default}
.hx-boon-icon{font-size:34px;line-height:1}
.hx-boon-name{font-size:16px;font-weight:800;margin-top:8px}
.hx-boon-desc{font-size:13px;color:#C7D2E8;line-height:1.45;margin-top:6px;flex:1}
.hx-boon-trade{font-size:12px;color:#FB8500;font-weight:700;line-height:1.4;margin-top:8px}
.hx-boon-hint{font-size:12.5px;color:#9FB0D0;margin-top:14px}
.hx-kbd{display:inline-block;background:#0A0F1D;border:1px solid #FFB703;border-radius:4px;color:#FFB703;
  font-size:11px;font-weight:800;padding:1px 6px}
/* Title-only compact variant: the title card holds logo + tagline +
   4 difficulty buttons + how-to + best score + top-5 + start button,
   so it gets tighter spacing than the other screens (which share
   .hx-panel-card). Keeps all 5 top-5 rows + MULAI inside 720px. */
.hx-panel-card.hx-title-card{padding:14px 24px 16px}
.hx-title-card .hx-logo{font-size:40px}
.hx-title-card .hx-tagline{font-size:13.5px;margin-top:4px}
.hx-title-card .hx-section-title{font-size:12px;margin:10px 0 6px}
.hx-title-card .hx-diff{min-height:84px;padding:8px 6px}
.hx-title-card .hx-diff-name{font-size:16px}
.hx-title-card .hx-diff-dots{margin-top:5px}
.hx-title-card .hx-diff-desc{font-size:10.5px;line-height:1.25;margin-top:4px}
.hx-title-card .hx-howto-chip{box-sizing:border-box;max-width:170px;padding:6px 9px;font-size:11.5px;line-height:1.4}
.hx-title-card .hx-howto + .hx-howto .hx-howto-chip{max-width:640px}
.hx-title-card .hx-best{font-size:13px;margin-top:8px}
.hx-title-card .hx-top5{margin-top:8px;font-size:12.5px}
.hx-title-card .hx-top5 caption{margin-bottom:3px}
.hx-title-card .hx-top5 th,.hx-title-card .hx-top5 td{padding:3px 8px}
.hx-title-card .hx-btn-big{font-size:18px;min-height:46px;padding:10px 36px;margin-top:14px}
@media (max-width:640px){
  .hx-logo{font-size:38px}.hx-result-title{font-size:32px}.hx-grade{font-size:52px}
  .hx-panel-card{padding:18px 14px}.hx-diff{flex:1 1 44%}
}
`;
  document.head.appendChild(s);
}

function getRoot() {
  let root = document.getElementById('screens');
  if (!root) {
    root = el('div');
    root.id = 'screens';
    document.body.appendChild(root);
  }
  return root;
}

function clearRoot() {
  const root = getRoot();
  while (root.firstChild) root.removeChild(root.firstChild);
  awakeningTipEl = null;
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

function formatDate(d) {
  if (d === undefined || d === null || d === '') return '-';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Top-5 table. run: {score, wave, grade, date} — grade may be '' for losses.
function buildTop5Table(topRuns) {
  const table = el('table', 'hx-top5');
  const cap = el('caption', null, 'TOP 5 — SKOR TERBAIK (LOKAL)');
  table.appendChild(cap);
  const head = el('tr');
  for (const h of ['#', 'SKOR', 'WAVE', 'GRADE', 'TANGGAL']) head.appendChild(el('th', null, h));
  table.appendChild(head);
  const runs = Array.isArray(topRuns) ? topRuns.slice(0, 5) : [];
  if (runs.length === 0) {
    const row = el('tr');
    const cell = el('td', 'hx-empty', 'Belum ada run — jadilah yang pertama!');
    cell.colSpan = 5;
    row.appendChild(cell);
    table.appendChild(row);
    return table;
  }
  runs.forEach((run, i) => {
    const row = el('tr');
    row.appendChild(el('td', null, String(i + 1)));
    row.appendChild(el('td', null, Math.floor(Number(run.score) || 0).toLocaleString('en-US')));
    row.appendChild(el('td', null, String(run.wave !== undefined ? run.wave : '-')));
    row.appendChild(el('td', null, run.grade ? String(run.grade) : '-'));
    row.appendChild(el('td', null, formatDate(run.date)));
    table.appendChild(row);
  });
  return table;
}

function buildStatsGrid(stats) {
  const grid = el('div', 'hx-stats');
  const cells = [
    { k: 'WAVE TERCAPAI', v: stats.wavesReached !== undefined ? stats.wavesReached : (stats.wave !== undefined ? stats.wave : '-') },
    { k: 'MUSUH DIBUNUH', v: stats.enemiesKilled !== undefined ? stats.enemiesKilled : 0 },
    { k: 'LUMEN DIKUMPULKAN', v: stats.lumenCollected !== undefined ? stats.lumenCollected : 0 },
    { k: 'MENARA DIBANGUN', v: stats.towersBuilt !== undefined ? stats.towersBuilt : 0 },
    { k: 'WAKTU BERMAIN', v: formatTime(stats.playTimeSeconds !== undefined ? stats.playTimeSeconds : stats.playTime) },
  ];
  for (const c of cells) {
    const cell = el('div', 'hx-stat-cell');
    const val = typeof c.v === 'number' ? c.v.toLocaleString('en-US') : String(c.v);
    cell.appendChild(el('div', 'v', val));
    cell.appendChild(el('div', 'k', c.k));
    grid.appendChild(cell);
  }
  return grid;
}

function playAgainButton(onAgain, label) {
  const btn = el('button', 'hx-btn-big', label || 'MAIN LAGI');
  btn.type = 'button';
  btn.addEventListener('click', () => { if (onAgain) onAgain(); });
  return btn;
}

function toggleAwakeningTooltip(anchorBtn) {
  if (!awakeningTipEl) return;
  const show = !awakeningTipEl.classList.contains('show');
  awakeningTipEl.classList.toggle('show', show);
  if (show && anchorBtn) {
    const r = anchorBtn.getBoundingClientRect();
    // Tooltip is absolutely positioned inside .hx-panel-card (position:relative).
    const cardR = awakeningTipEl.parentElement.getBoundingClientRect();
    let left = r.left - cardR.left + r.width / 2 - 150;
    left = Math.max(8, Math.min(left, cardR.width - 308));
    awakeningTipEl.style.left = left + 'px';
    awakeningTipEl.style.top = (r.bottom - cardR.top + 10) + 'px';
  }
}

export function showTitle(opts) {
  opts = opts || {};
  injectStyle();
  clearRoot();
  currentScreen = 'title';
  const root = getRoot();
  const screen = el('div', 'hx-screen');
  const card = el('div', 'hx-panel-card hx-title-card');

  card.appendChild(el('div', 'hx-logo', 'HEXEMBER'));
  const tag = el('div', 'hx-tagline');
  tag.appendChild(document.createTextNode('Pertahankan Reaktor Inti di pulau heksagonal. '));
  const b1 = el('b', null, 'Cahaya adalah hidupmu');
  tag.appendChild(b1);
  tag.appendChild(document.createTextNode(' — menara hanya menembak dari petak yang terang.'));
  card.appendChild(tag);

  // Difficulty select (part of the title screen, not a separate screen).
  card.appendChild(el('div', 'hx-section-title', 'PILIH KESULITAN'));
  const diffRow = el('div', 'hx-diff-row');
  let selectedDiff = 'radiant';
  const diffBtns = {};
  for (const d of DIFFICULTIES) {
    const btn = el('button', 'hx-diff' + (d.id === selectedDiff ? ' selected' : ''));
    btn.type = 'button';
    btn.dataset.difficulty = d.id;
    btn.setAttribute('aria-pressed', d.id === selectedDiff ? 'true' : 'false');
    btn.appendChild(el('div', 'hx-diff-name', d.name));
    btn.appendChild(el('div', 'hx-diff-tag', d.tag.toUpperCase()));
    const dots = el('div', 'hx-diff-dots');
    for (let i = 1; i <= 4; i++) {
      dots.appendChild(el('span', i <= d.order ? '' : 'off', '\u25CF'));
    }
    btn.appendChild(dots);
    btn.appendChild(el('div', 'hx-diff-desc', d.desc));
    if (d.id === 'awakening') {
      const bang = el('span', 'hx-badge-bang', '!');
      bang.title = 'Lihat perbedaan Awakening';
      bang.setAttribute('role', 'button');
      bang.setAttribute('tabindex', '0');
      bang.setAttribute('aria-label', 'Perbedaan mode Awakening');
      const showTip = (ev) => {
        ev.stopPropagation();
        toggleAwakeningTooltip(btn);
      };
      bang.addEventListener('click', showTip);
      bang.addEventListener('mouseenter', () => {
        if (awakeningTipEl && !awakeningTipEl.classList.contains('show')) toggleAwakeningTooltip(btn);
      });
      bang.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showTip(ev); }
      });
      btn.appendChild(bang);
    }
    btn.addEventListener('click', () => {
      selectedDiff = d.id;
      for (const [id, b] of Object.entries(diffBtns)) {
        b.classList.toggle('selected', id === selectedDiff);
        b.setAttribute('aria-pressed', id === selectedDiff ? 'true' : 'false');
      }
      if (awakeningTipEl) awakeningTipEl.classList.remove('show');
    });
    diffRow.appendChild(btn);
    diffBtns[d.id] = btn;
  }
  card.appendChild(diffRow);

  // Awakening tooltip (one shared element, positioned under the card).
  const tip = el('div', 'hx-tooltip');
  tip.id = 'awakening-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.appendChild(el('div', null, 'Awakening — perbedaan konkret:'));
  const ul = el('ul');
  for (const line of AWAKENING_TOOLTIP_LINES) ul.appendChild(el('li', null, line));
  tip.appendChild(ul);
  tip.appendChild(el('div', 'hx-warn', AWAKENING_WARNING));
  card.appendChild(tip);
  awakeningTipEl = tip;

  // Short tutorial + icon guide.
  card.appendChild(el('div', 'hx-section-title', 'CARA MAIN'));
  const how = el('div', 'hx-howto');
  const chips = [
    ['Bangun di tempat terang', 'Pilih menara di bar bawah (1–5), lalu klik petak yang menyala. Petak gelap tidak bisa dibangun.'],
    ['Nyalakan Pylon', 'Beacon Pylon [P] (30 Lumen) menerangi petak gelap di sekitarnya.'],
    ['Ability', 'Q Solar Flare: ledakan cahaya di kursor (klik kanan juga bisa). E Overcharge: menara menembak 2x lebih cepat.'],
    ['Menang', 'Bertahan 10 wave dan kalahkan Eclipse Sovereign di wave 10. Jaga Core HP penuh untuk 3 bintang.'],
  ];
  for (const [title, body] of chips) {
    const chip = el('div', 'hx-howto-chip');
    chip.appendChild(el('b', null, title));
    chip.appendChild(document.createElement('br'));
    chip.appendChild(document.createTextNode(body));
    how.appendChild(chip);
  }
  card.appendChild(how);
  const keys = el('div', 'hx-howto');
  const keyChip = el('div', 'hx-howto-chip');
  keyChip.appendChild(document.createTextNode('Tombol: '));
  for (const k of ['1–5', 'P', 'Q', 'E', 'Spasi', 'F', 'M']) {
    keyChip.appendChild(el('span', 'hx-kbd', k));
    keyChip.appendChild(document.createTextNode(' '));
  }
  keyChip.appendChild(document.createTextNode('— drag untuk geser kamera, roda mouse terkunci.'));
  keys.appendChild(keyChip);
  card.appendChild(keys);

  // Best score + top 5.
  const best = opts.bestScore;
  if (best !== undefined && best !== null) {
    const bestEl = el('div', 'hx-best');
    bestEl.appendChild(document.createTextNode('SKOR TERBAIK: '));
    bestEl.appendChild(el('span', null, Math.floor(Number(best) || 0).toLocaleString('en-US')));
    card.appendChild(bestEl);
  }
  if (opts.topRuns) card.appendChild(buildTop5Table(opts.topRuns));

  const startBtn = el('button', 'hx-btn-big', '\u25B6  MULAI');
  startBtn.type = 'button';
  startBtn.id = 'title-start';
  startBtn.addEventListener('click', () => {
    if (opts.onStart) opts.onStart(selectedDiff);
  });
  card.appendChild(startBtn);

  screen.appendChild(card);
  root.appendChild(screen);
  return card;
}

export function showBoonChoice(boons, onPick) {
  injectStyle();
  clearRoot();
  currentScreen = 'boon';
  const root = getRoot();
  const screen = el('div', 'hx-screen');
  const card = el('div', 'hx-panel-card');
  card.appendChild(el('div', 'hx-section-title', 'PILIH SATU BOON'));
  card.appendChild(el('div', 'hx-tagline', 'Boon berlaku sampai akhir run. Pilih dengan bijak — setiap kekuatan ada harganya.'));
  const row = el('div', 'hx-boon-row');
  const list = Array.isArray(boons) ? boons.slice(0, 3) : [];
  let picked = false;
  list.forEach((boon, i) => {
    const btn = el('button', 'hx-boon');
    btn.type = 'button';
    btn.appendChild(el('div', 'hx-boon-icon', boon.icon || ['\u2726', '\u2600', '\u26A1'][i % 3]));
    btn.appendChild(el('div', 'hx-boon-name', boon.name || ('Boon ' + (i + 1))));
    btn.appendChild(el('div', 'hx-boon-desc', boon.description || boon.desc || ''));
    if (boon.tradeoff || boon.tradeOff) {
      btn.appendChild(el('div', 'hx-boon-trade', 'Harga: ' + (boon.tradeoff || boon.tradeOff)));
    }
    btn.addEventListener('click', () => {
      if (picked) return;
      picked = true;
      if (onPick) onPick(boon, i);
    });
    row.appendChild(btn);
  });
  card.appendChild(row);
  card.appendChild(el('div', 'hx-boon-hint', 'Klik satu kartu untuk mengambil boon dan lanjut ke wave berikutnya.'));
  screen.appendChild(card);
  root.appendChild(screen);
  return card;
}

export function showVictory(opts) {
  opts = opts || {};
  injectStyle();
  clearRoot();
  currentScreen = 'victory';
  const root = getRoot();
  const screen = el('div', 'hx-screen');
  const card = el('div', 'hx-panel-card');
  card.appendChild(el('div', 'hx-result-title win', 'VICTORY'));
  const stats = opts.stats || {};
  const stars = Math.max(0, Math.min(3, Number(opts.stars) || 0));
  const starsEl = el('div', 'hx-stars');
  for (let i = 0; i < 3; i++) {
    starsEl.appendChild(el('span', i < stars ? 'on' : 'off', '\u2605'));
  }
  card.appendChild(starsEl);
  const grade = opts.grade || (stars === 3 ? 'S' : stars === 2 ? 'A' : 'B');
  card.appendChild(el('div', 'hx-grade', grade));
  card.appendChild(el('div', 'hx-grade-sub', 'ECLIPSE SOVEREIGN DIKALAHKAN — REAKTOR AMAN'));
  card.appendChild(buildStatsGrid(stats));
  if (opts.topRuns) card.appendChild(buildTop5Table(opts.topRuns));
  card.appendChild(playAgainButton(opts.onAgain));
  const menuBtn = el('button', 'hx-btn-ghost', 'Kembali ke Title');
  menuBtn.type = 'button';
  menuBtn.addEventListener('click', () => { if (opts.onTitle) opts.onTitle(); });
  card.appendChild(document.createElement('br'));
  card.appendChild(menuBtn);
  screen.appendChild(card);
  root.appendChild(screen);
  return card;
}

export function showGameOver(opts) {
  opts = opts || {};
  injectStyle();
  clearRoot();
  currentScreen = 'gameover';
  const root = getRoot();
  const screen = el('div', 'hx-screen');
  const card = el('div', 'hx-panel-card');
  const wave = opts.wave !== undefined ? opts.wave : (opts.stats && opts.stats.wavesReached);
  card.appendChild(el('div', 'hx-result-title lose', 'GUGUR di Wave ' + (wave !== undefined ? wave : '?')));
  card.appendChild(el('div', 'hx-grade-sub', 'REAKTOR INTI PADAM — PULAU KEMBALI GELAP'));
  card.appendChild(buildStatsGrid(opts.stats || {}));
  if (opts.topRuns) card.appendChild(buildTop5Table(opts.topRuns));
  card.appendChild(playAgainButton(opts.onAgain));
  const menuBtn = el('button', 'hx-btn-ghost', 'Kembali ke Title');
  menuBtn.type = 'button';
  menuBtn.addEventListener('click', () => { if (opts.onTitle) opts.onTitle(); });
  card.appendChild(document.createElement('br'));
  card.appendChild(menuBtn);
  screen.appendChild(card);
  root.appendChild(screen);
  return card;
}

// Bonus: pause menu for the Esc key (input.js fires onMenu).
export function showPauseMenu(opts) {
  opts = opts || {};
  injectStyle();
  clearRoot();
  currentScreen = 'pause';
  const root = getRoot();
  const screen = el('div', 'hx-screen');
  const card = el('div', 'hx-panel-card');
  card.appendChild(el('div', 'hx-result-title win', 'JEDA'));
  card.appendChild(el('div', 'hx-tagline', 'Istirahat sejenak. Cahaya menunggu.'));
  const resume = el('button', 'hx-btn-big', 'LANJUTKAN');
  resume.type = 'button';
  resume.addEventListener('click', () => { if (opts.onResume) opts.onResume(); });
  card.appendChild(resume);
  card.appendChild(document.createElement('br'));
  const again = el('button', 'hx-btn-ghost', 'Ulangi dari Wave 1');
  again.type = 'button';
  again.addEventListener('click', () => { if (opts.onRestart) opts.onRestart(); });
  card.appendChild(again);
  card.appendChild(document.createTextNode(' '));
  const quit = el('button', 'hx-btn-ghost', 'Kembali ke Title');
  quit.type = 'button';
  quit.addEventListener('click', () => { if (opts.onTitle) opts.onTitle(); });
  card.appendChild(quit);
  screen.appendChild(card);
  root.appendChild(screen);
  return card;
}

export function hideScreens() {
  clearRoot();
  currentScreen = null;
}

export function getCurrentScreen() {
  return currentScreen;
}
