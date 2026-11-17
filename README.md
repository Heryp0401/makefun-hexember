# HEXEMBER

![Competition](https://make.fun/badge/best-game-01.svg)
![Rank](https://make.fun/badge/best-game-01/Heryp0401/makefun-hexember/rank.svg)
![Reward](https://make.fun/badge/best-game-01/Heryp0401/makefun-hexember/reward.svg)

[Make the best game — bounty](https://make.fun/bounty/best-game-01)

HEXEMBER is a 3D isometric tactical light-grid defense and roguelite game. You defend the Core Reactor on a floating hex island in the dark: light itself is your build territory and your tactical resource. Spend Lumen to raise Pylons that light up hex tiles, then place five tower types on lit ground and evolve each one twice as ten waves of enemies march in — five enemy roles with different counters, ending with the Eclipse Sovereign boss in wave 10. Between waves, pick one of three boons with real trade-offs, and spend Solar Flare and Overcharge at the right moment to turn a losing wave around. Four difficulties (Ember, Radiant, Eclipse, Awakening) change the rules, not just the numbers, and every run ends with a local grade and a top-5 ranking saved on your own machine.

## Controls

- Mouse: click to select / build, drag to pan, wheel to zoom, right-click to cancel
- Keys 1–5: select tower type
- Q: Solar Flare
- E: Overcharge
- Space: pause / resume (also speed toggle)
- F: speed toggle
- Esc: pause / close panel
- M: mute

## Goal

Defend the Core Reactor through 10 waves, beat the Eclipse Sovereign boss in wave 10, and finish with the best score you can. Your best score and top 5 runs are saved locally in your browser.

## Tech

- Static files under `game/` — no build step, no network calls
- three.js vendored under `game/vendor/three/` (three.module.min.js + three.core.min.js)
- Pure simulation in `game/src/sim.js` at a fixed 1/60 timestep; rendering, HUD, input and audio are separate modules (see `MODULES.md`)

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in your browser.
