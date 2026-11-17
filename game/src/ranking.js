// HEXEMBER — ranking.js
// Local-only ranking: grade per run + top 5 runs in localStorage.
// No network, no DOM dependency (guards localStorage absence with an
// in-memory fallback so the headless sim test can use it too).

export const KEY = 'lightgrid.bestRuns.v1';

// In-memory fallback when localStorage is unavailable (Node / private mode).
let memRuns = [];

function readStore() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // Corrupt / blocked storage -> fall through to memory.
  }
  return [...memRuns];
}

function writeStore(runs) {
  memRuns = [...runs];
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(KEY, JSON.stringify(runs));
    }
  } catch {
    // Storage unavailable: memory fallback already updated.
  }
}

// Grade: S = win with 3 stars (Core HP full), A = 2 stars (>= 50%),
// B = 1 star (any win), defeat = null ("GUGUR di Wave X" on screen).
export function gradeFor({ stars, won }) {
  if (!won) return null;
  if (stars >= 3) return 'S';
  if (stars >= 2) return 'A';
  return 'B';
}

// Save one run. Entry: { score, wave, grade, date }.
// Keeps the top 5 by score, highest first. Returns the stored top 5.
export function saveRun({ score, wave, grade, date }) {
  const runs = readStore();
  runs.push({
    score: Number.isFinite(score) ? score : 0,
    wave: wave || 0,
    grade: grade || null,
    date: date || new Date().toISOString().slice(0, 10),
  });
  runs.sort((a, b) => b.score - a.score);
  const top = runs.slice(0, 5);
  writeStore(top);
  return [...top];
}

// Top 5 runs, highest score first (empty array when none saved).
export function loadTopRuns() {
  const runs = readStore();
  runs.sort((a, b) => b.score - a.score);
  return runs.slice(0, 5);
}

// Best saved score, or 0 when no runs exist.
export function bestScore() {
  const top = loadTopRuns();
  return top.length ? top[0].score : 0;
}
