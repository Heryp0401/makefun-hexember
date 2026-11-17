// HEXEMBER — hex.js
// Axial hex-grid math (pointy-top) + the fixed enemy path. Pure, no imports.

export const GRID_RADIUS = 5; // hex island radius -> 91 tiles
export const CORE_HEX = { q: 0, r: 0 };
export const SPAWN_HEX = { q: 5, r: 0 };

// Six axial neighbour directions (pointy-top axial).
const DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function hexKey(q, r) {
  return `${q},${r}`;
}

// Inverse of hexKey: 'q,r' -> { q, r } (NaN when malformed).
export function parseHexKey(key) {
  const [q, r] = String(key).split(',').map(Number);
  return { q, r };
}

export function hexNeighbors(q, r) {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

// Axial distance: (|dq| + |dr| + |dq+dr|) / 2.
export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Fixed enemy path: straight line from the spawn edge to the Core.
// Spawn (5,0) -> (4,0) -> (3,0) -> (2,0) -> (1,0) -> Core (0,0).
export function buildPath() {
  return [
    { q: 5, r: 0 },
    { q: 4, r: 0 },
    { q: 3, r: 0 },
    { q: 2, r: 0 },
    { q: 1, r: 0 },
    { q: 0, r: 0 },
  ];
}
