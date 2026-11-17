// HEXEMBER — input.js (Builder E: UI/input)
// Keyboard + pointer input for the game canvas. Pure DOM, no three.js,
// no sim imports. The integrator (main.js) wires the callbacks to the sim
// and to render.js (which owns screen->hex conversion and camera pan).
//
// Ghost validity is computed from sim state passed via setSimState(state).
// The sim state is read defensively: lit/path/occupied may each be a
// Set of "q,r" strings, a Set/Map of {q,r} objects, an Array of either,
// or a predicate function (q, r) => boolean. If a set is absent, that
// check is skipped (treated as pass) so input never blocks on unknown data.

export const COSTS = {
  prism: 50,
  heliotrope: 75,
  lance: 100,
  mortar: 125,
  pylonSuar: 60,
  pylon: 30, // Beacon Pylon
};

const KEY_TO_TOWER = {
  Digit1: 'prism',
  Digit2: 'heliotrope',
  Digit3: 'lance',
  Digit4: 'mortar',
  Digit5: 'pylonSuar',
  Digit6: 'pylon',
  KeyP: 'pylon',
};

export const GHOST_REASONS = {
  DARK: 'Area Gelap',
  PATH: 'Jalur Musuh',
  POOR: 'Lumen Kurang',
  OCCUPIED: 'Sudah Ada Menara',
};

const CLICK_MAX_MOVE = 7; // px — beyond this a press is a camera drag, not a click
const CLICK_MAX_MS = 500;

function hexKey(q, r) {
  return q + ',' + r;
}

// Does `container` contain hex (q, r)? Accepts Set/Map/Array/function.
function containsHex(container, q, r) {
  if (!container) return undefined; // unknown — caller treats as "no info"
  if (typeof container === 'function') {
    try { return !!container(q, r); } catch (e) { return undefined; }
  }
  if (typeof container.has === 'function') {
    if (container.has(hexKey(q, r))) return true;
    // Map/Set keyed by {q,r} objects — scan values.
    for (const v of container.values ? container.values() : container) {
      if (v && typeof v === 'object' && v.q === q && v.r === r) return true;
      if (v && typeof v === 'object' && v.key === hexKey(q, r)) return true;
    }
    return false;
  }
  if (Array.isArray(container)) {
    for (const v of container) {
      if (typeof v === 'string' && v === hexKey(q, r)) return true;
      if (v && typeof v === 'object' && v.q === q && v.r === r) return true;
    }
    return false;
  }
  return undefined;
}

export function createInput(canvas, callbacks) {
  callbacks = callbacks || {};
  let simState = null;

  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  const uiState = {
    selected: null, // null | 'prism' | 'heliotrope' | 'lance' | 'mortar' | 'pylonSuar' | 'pylon'
    hoverHex: null, // {q, r} | null — set by render.js via setHoverHex()
    ghostValid: false,
    ghostReason: '',
  };

  let destroyed = false;
  let drag = null; // {startX, startY, lastX, lastY, button, moved, t0}

  function setSelected(type) {
    uiState.selected = type || null;
    recomputeGhost();
    return uiState.selected;
  }

  function recomputeGhost() {
    const sel = uiState.selected;
    const hex = uiState.hoverHex;
    if (!sel || !hex) {
      uiState.ghostValid = false;
      uiState.ghostReason = '';
      return;
    }
    const s = simState || {};
    // Check order follows the brief: lit -> not path -> not occupied -> lumen.
    const lit = containsHex(s.lit ?? s.litTiles ?? s.litSet, hex.q, hex.r);
    if (lit === false) {
      uiState.ghostValid = false;
      uiState.ghostReason = GHOST_REASONS.DARK;
      return;
    }
    const onPath = containsHex(s.path ?? s.pathTiles ?? s.pathSet, hex.q, hex.r);
    if (onPath === true) {
      uiState.ghostValid = false;
      uiState.ghostReason = GHOST_REASONS.PATH;
      return;
    }
    const occupied = containsHex(
      s.occupied ?? s.occupiedTiles ?? s.towers ?? s.towerMap, hex.q, hex.r);
    if (occupied === true) {
      uiState.ghostValid = false;
      uiState.ghostReason = GHOST_REASONS.OCCUPIED;
      return;
    }
    const lumen = Number(s.lumen);
    const cost = COSTS[sel];
    if (!Number.isNaN(lumen) && lumen < cost) {
      uiState.ghostValid = false;
      uiState.ghostReason = GHOST_REASONS.POOR;
      return;
    }
    uiState.ghostValid = true;
    uiState.ghostReason = '';
  }

  function setHoverHex(hex) {
    if (hex && typeof hex.q === 'number' && typeof hex.r === 'number') {
      uiState.hoverHex = { q: hex.q, r: hex.r };
    } else {
      uiState.hoverHex = null;
    }
    recomputeGhost();
    if (callbacks.onHoverHex && uiState.hoverHex) {
      callbacks.onHoverHex(uiState.hoverHex.q, uiState.hoverHex.r);
    }
  }

  function setSimState(state) {
    simState = state || null;
    recomputeGhost();
  }

  function selectViaInput(type) {
    // Clicking / pressing the key of the already-selected tower deselects it.
    const next = uiState.selected === type ? null : type;
    setSelected(next);
    if (callbacks.onSelect) callbacks.onSelect(next);
  }

  function tryPlace() {
    const hex = uiState.hoverHex;
    if (!uiState.selected || !hex) return false;
    recomputeGhost();
    if (!uiState.ghostValid) {
      // Tell the player (and the HUD toast) WHY placement is blocked.
      if (callbacks.onInvalidPlace) callbacks.onInvalidPlace(uiState.ghostReason, hex.q, hex.r);
      return false;
    }
    if (callbacks.onPlace) callbacks.onPlace(uiState.selected, hex.q, hex.r);
    return true;
  }

  function fireFlareAtCursor() {
    const hex = uiState.hoverHex;
    if (callbacks.onFlare) {
      if (hex) callbacks.onFlare(hex.q, hex.r);
      else callbacks.onFlare(null, null);
    }
  }

  // ---- Keyboard ----
  function onKeyDown(e) {
    if (destroyed) return;
    // Ignore keys typed into form fields (there are none in-game, but be safe).
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keys.add(e.code);

    if (KEY_TO_TOWER[e.code]) {
      e.preventDefault();
      selectViaInput(KEY_TO_TOWER[e.code]);
      return;
    }
    switch (e.code) {
      case 'KeyQ':
        e.preventDefault();
        fireFlareAtCursor();
        break;
      case 'KeyE':
        e.preventDefault();
        if (callbacks.onOvercharge) callbacks.onOvercharge();
        break;
      case 'Space': {
        e.preventDefault();
        // Space = start wave while building, pause otherwise (per brief).
        const phase = simState && simState.phase;
        if (phase === 'build' && callbacks.onStartWave) callbacks.onStartWave();
        else if (callbacks.onPause) callbacks.onPause();
        break;
      }
      case 'KeyF':
        e.preventDefault();
        if (callbacks.onSpeed) callbacks.onSpeed();
        break;
      case 'KeyM':
        e.preventDefault();
        if (callbacks.onMute) callbacks.onMute();
        break;
      case 'Escape': {
        e.preventDefault();
        if (uiState.selected) {
          // First Esc clears the selection; Esc again opens the menu.
          setSelected(null);
          if (callbacks.onSelect) callbacks.onSelect(null);
        } else if (callbacks.onMenu) {
          callbacks.onMenu();
        } else if (callbacks.onPause) {
          callbacks.onPause();
        }
        break;
      }
      default:
        break;
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
    drag = null;
  }

  // ---- Pointer (mouse + touch unified) ----
  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    if (destroyed) return;
    const p = canvasPos(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    if (e.button === 2) {
      // Right-click = Solar Flare at cursor (no drag, no place).
      e.preventDefault();
      fireFlareAtCursor();
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag = { startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, moved: false, t0: Date.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  }

  function onPointerMove(e) {
    if (destroyed) return;
    const p = canvasPos(e);
    mouse.x = p.x;
    mouse.y = p.y;
    if (!drag) return;
    const dx = p.x - drag.lastX;
    const dy = p.y - drag.lastY;
    drag.lastX = p.x;
    drag.lastY = p.y;
    const total = Math.hypot(p.x - drag.startX, p.y - drag.startY);
    if (total > CLICK_MAX_MOVE) drag.moved = true;
    if (drag.moved && callbacks.onPan) callbacks.onPan(dx, dy);
  }

  function onPointerUp(e) {
    if (destroyed) return;
    mouse.down = false;
    if (!drag) return;
    const wasClick = !drag.moved && (Date.now() - drag.t0) < CLICK_MAX_MS;
    drag = null;
    if (!wasClick) return;
    // Plain click on a tile: place the selected tower, or select the tile.
    if (uiState.selected) {
      tryPlace();
    } else if (uiState.hoverHex && callbacks.onTileClick) {
      callbacks.onTileClick(uiState.hoverHex.q, uiState.hoverHex.r);
    }
  }

  function onContextMenu(e) {
    e.preventDefault(); // wheel is locked and right-click is Flare, never a menu
  }

  function onWheel(e) {
    e.preventDefault(); // zoom locked by design — no zoom change, ever
  }

  function onPointerLeave() {
    setHoverHex(null);
  }

  // NOTE: keydown is listened on window ONLY. Listening on both the canvas
  // and window would fire every handler twice (events bubble canvas->window),
  // which would double-toggle selections and double-fire Q/Space.
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  // Keep the canvas focusable so keydown works after a click on it.
  if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
    keys.clear();
    drag = null;
  }

  return {
    keys,
    mouse,
    uiState,
    destroy,
    setSimState,
    setHoverHex,
    setSelected,
    recomputeGhost,
    getSimState: () => simState,
  };
}
