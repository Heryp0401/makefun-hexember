# HEXEMBER — Module List

Game code lives in `game/index.html` plus 23 ES modules under `game/src/`. Each module is owned by one builder (letters A–F); INTEGRATOR owns the glue and the HTML shell.

## Core systems [A]

- `game/src/config.js` — constants, tuning, difficulty multipliers, palette [A]
- `game/src/hex.js` — hex grid math: axial coords, neighbors, distance, path [A]
- `game/src/light.js` — light system: lit tiles, Pylon radius, brownout [A]
- `game/src/economy.js` — Lumen: income, costs, Pylon drain, passive +2/s [A]
- `game/src/sim.js` — pure game state + fixed timestep 1/60 step, NO three.js/DOM/audio imports [A]
- `game/src/waves.js` — wave director: 10 waves, compositions, boss wave 10 [A]
- `game/src/difficulty.js` — 4 difficulties Ember/Radiant/Eclipse/Awakening as multipliers + Awakening rules [A]
- `game/src/ranking.js` — grade S/A/B/C + top 5 in localStorage [A]

## Towers & enemies [B/C]

- `game/src/towers.js` — 5 tower types, stats, firing [B]
- `game/src/evolutions.js` — 2 evolutions per tower = 10 forms [B]
- `game/src/enemies.js` — 5 enemy roles, movement, counters [C]
- `game/src/boss.js` — Eclipse Sovereign 3 phases + 4th Awakening phase [C]
- `game/src/boons.js` — 3 boons with real trade-offs [C]
- `game/src/abilities.js` — Solar Flare Q + Overcharge E, cooldowns [C]

## Presentation [D]

- `game/src/render.js` — three.js scene, isometric 38deg camera, lighting [D]
- `game/src/models.js` — procedural geometry for towers/enemies/boss/island [D]
- `game/src/effects.js` — particles, hit-stop, screen shake, additive glow [D]

## Interface [E]

- `game/src/hud.js` — HUD DOM: score, Core HP, Lumen, wave, speed, pause [E]
- `game/src/screens.js` — title / victory / game-over / boon panel / difficulty select + Awakening '!' tooltip [E]
- `game/src/input.js` — mouse click/drag/wheel/right-click + keyboard 1-5, Q, E, Space, F, Esc, M [E]

## Audio & capture [F]

- `game/src/audio.js` — WebAudio procedural SFX + music layers, mute [F]
- `game/src/shots.js` — ?shot=&seed= deterministic scenes: title/play/boss/victory [F]

## Glue [INTEGRATOR]

- `game/src/main.js` — glue: boot, game loop, sim/render bridge, state machine [INTEGRATOR]
- `game/index.html` — importmap "three" -> ./vendor/three/three.module.min.js, HUD DOM, module script src/main.js [INTEGRATOR]
