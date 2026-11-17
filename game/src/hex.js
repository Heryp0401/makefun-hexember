// HEXEMBER — hex grid math (Builder A, v2).
// Axial coordinates {q, r} on a pointy-top hex grid of radius 5.
// Two invasion lanes share the spawn (5,0) and the Core (0,0):
//   Path A (main, 6 tiles): straight line along r = 0.
//   Path B (flank, 8 tiles): forks at the second tile, bends through
//   r = 1..2, and rejoins the Core from (0,1). B is the long flank:
//   enemies on B take ~33% longer to reach the Core, so the difficulty
//   increase is positional (defend two lanes), never numeric.

export const GRID_RADIUS = 5;
export const CORE_HEX = { q: 0, r: 0 };
export const SPAWN_HEX = { q: 5, r: 0 };

const PATH_A = [
  { q: 5, r: 0 }, { q: 4, r: 0 }, { q: 3, r: 0 },
  { q: 2, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 0 },
];

const PATH_B = [
  { q: 5, r: 0 }, { q: 4, r: 1 }, { q: 3, r: 2 }, { q: 2, r: 2 },
  { q: 1, r: 2 }, { q: 0, r: 2 }, { q: 0, r: 1 }, { q: 0, r: 0 },
];

// Main lane (v1 path, unchanged): spawn -> Core in 6 tiles.
// Returns fresh tiles every call so callers can never mutate the template.
export function buildPath() {
  return PATH_A.map((t) => ({ ...t }));
}

// Both lanes, keyed by lane id. `path` in the sim state stays an alias
// of paths.A so the boss, shots and render keep working through it.
export function buildPaths() {
  return {
    A: PATH_A.map((t) => ({ ...t })),
    B: PATH_B.map((t) => ({ ...t })),
  };
}

export function hexKey(q, r) {
  return `${q},${r}`;
}

// Axial distance between two tiles {q, r} (cube-coordinate formula).
export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const NEIGHBOR_OFFSETS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// The 6 axial neighbours of (q, r), in clockwise order from east.
export function hexNeighbors(q, r) {
  return NEIGHBOR_OFFSETS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}
