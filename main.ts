// HEXEMBER — "Make the best game" (best-game-01) entry, Node 22, standard library only.
//
// The game itself is the static tree in game/ beside this file: index.html plus ES modules,
// with three.js vendored under game/vendor/three/. No build step, no network request — a
// desktop browser loads it offline. This program is only the hand-in: it copies game/ and
// screenshots/ into the output directory and writes dossier.json there, the summary the
// judge reads, through the vendored make.fun helper.
//
// HEXEMBER is a 3D isometric tactical light-grid defense & roguelite. You defend the Core
// Reactor on a floating hex island in the dark, where light is both the build territory and
// the resource: Lumen buys towers and lights Beacon Pylons, and towers only fire from lit
// tiles. Ten waves, five enemy roles with different counters, the Eclipse Sovereign boss on
// wave 10, a boon choice between waves, four difficulties, and a local grade plus top-5
// ranking at the end of every run.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Folder holding this file, and the output folder (/output inside the grader).
const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The dossier limits the scorer enforces (reference/gate.json). Only text_max_bytes shapes
// the bytes; the rest refuse an entry the scorer would refuse: more than 4 screenshots or
// one over 256 KiB; more than 993 files in game/ or 48 MiB of game files in all; or any
// path under game/ longer than 1000 bytes (game/ counts beside /output's own cap).
const dossierLimits = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Hand-in, in order: stage the game tree, stage the screenshots if any, then write the
// dossier that describes both.
mkdirSync(outputDir, { recursive: true });
cpSync(joinPath(entryDir, 'game'), joinPath(outputDir, 'game'), { recursive: true });
mkdirSync(joinPath(outputDir, 'screenshots'), { recursive: true });
if (existsSync(joinPath(entryDir, 'screenshots'))) {
  cpSync(joinPath(entryDir, 'screenshots'), joinPath(outputDir, 'screenshots'), { recursive: true });
}

writeFileSync(joinPath(outputDir, 'dossier.json'), buildDossier(outputDir, dossierLimits));
