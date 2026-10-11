# Rogue Skeet

A portrait, one-thumb skeet-shooting roguelite for mobile web (TypeScript, Vite, PixiJS v8).
Prototype plan: [docs/implementation-plan.md](docs/implementation-plan.md). Design: [docs/design-prototype.md](docs/design-prototype.md).

## Develop

```sh
npm ci
npm run dev          # http://localhost:5173/ (use --host, open on a phone on the same network)
npm test             # Vitest unit tests
npm run e2e          # Playwright tests (builds, previews, Pixel 7 touch viewport)
npm run lint && npm run typecheck
npm run build        # production build with base /rogue-skeet/ (GitHub Pages)
npm run preview      # serve the build at http://localhost:4173/rogue-skeet/
```

Playwright uses the Chromium under `PLAYWRIGHT_BROWSERS_PATH` when present (see `playwright.config.ts`); otherwise run `npx playwright install chromium`.

## Dev panel

Add `?dev` to the URL (e.g. `http://localhost:5173/?dev`) to load the Tweakpane tuning panel with JSON export. It is lazy-loaded and not part of the normal bundle path. `?scene=playfield` opens the greybox layout directly.

## Juice, sound and haptics (Phase 2)

Every hit gets a shatter: the clay is sliced into 6-12 convex shards that inherit its velocity plus an impulse from the shot, spin and fall; debris desaturates within ~250 ms and fades by ~600 ms so live clays (bright rim) stay readable. Also a dust puff, an impact flash ring, light screen shake and a 40-60 ms hit-stop, all scaled by hit quality (a perfect hit gets more shards, sparks, a bigger flash and the longest hit-stop). A missed burst leaves a subtle puff. Code: `src/render/vfx/` (pure planning in `shatter.ts`, pooled rendering in `particles.ts`), orchestrated by `src/feel/juice.ts` from the `World.events` bus. The sim is never touched.

- **Hit-stop is visual only**: it holds the last drawn frame while the sim and input clock keep running, so Control Test timing is identical with juice on or off (covered by a unit test).
- **Settings** (sandbox Settings panel and the Control Test setup screen, persisted in localStorage `rogue-skeet.feel.v1`): Juice on/off (the A/B switch: off is the flat greybox with no effects, sound or haptics), Sound on/off, Volume, Haptics on/off, iOS Safari haptic. The Control Test uses the same values and records them in the result (`juice` block, telemetry schema v2; v1 files still validate).
- **Audio** (`src/feel/audio.ts`): Web Audio unlocked on the first gesture; gun report in three layers, three clay-crack variants, per-house trap thunk (high house panned left and pitched up, low house right and down), combo pitch ladder, perfect chime, dry-fire click; pitch +/-8% and gain randomized per play. Every cue has a procedural synth fallback (`src/feel/synth.ts`).
- **Haptics** (`src/feel/haptics.ts`): Capacitor Haptics when native, else `navigator.vibrate` (Android Chrome), else the experimental iOS 18+ Safari switch-input tick (shot only, needs a user gesture), else nothing. See [docs/native.md](docs/native.md).
- All juice numbers are in `src/feel/tuning.ts` and the `?dev` panel (Juice folders).
- Debug: `window.__debug.fx()` returns particle/audio/haptic counters, `window.__debug.pauseFx()` freezes the presentation for screenshots.

### Audio credits

No third-party samples are shipped yet: all sound is synthesized in code. See [public/audio/WANTED.md](public/audio/WANTED.md) for the CC0 files to drop in (credits go in `public/audio/CREDITS.md`).

## Modes (Phase 1)

- **Sandbox** (`?scene=sandbox`): endless random throws. The Settings button picks the control scheme (tap / drag reticle / flick), handedness, aim assist, tap offset and the tap ghost trail. `?scheme=drag` preselects a scheme.
- **Control Test** (`?scene=controlTest`): the fixed 20-throw test (16 singles, 4 doubles, standard clays, same every attempt). Tester ID and handedness, then the three schemes in a Latin-square order picked from a hash of the ID, 5 attempts each (`?attempts=N`, `?schemes=tap,flick`), a "Why did you miss?" prompt after missed throws, and a 1 to 5 feel rating per scheme. Results autosave to localStorage and export with Copy JSON / Share / Download.
- **Run**: not built yet (Phase 3).

Running the playtest and reading the results: [docs/control-test-protocol.md](docs/control-test-protocol.md).

### Aggregating results

```sh
npm run aggregate -- results/*.json > results/summary.md
```

Prints a markdown table per scheme (attempt 1 vs attempt N hit rate, learning delta, median time to first shot, explainability, mean feel) and per-tester curves.

### Bots and the debug API

Pass `?test` (or run `npm run dev`) to expose `window.__debug` (sim state, `idealAim(clayId)`, `shootAt(clayId)` which performs the active scheme's gesture with real PointerEvents). The unit tests include a perfect-lead bot (24/24 clays under every scheme) and a no-lead bot (under 30%); Playwright drives the same API.

## Layout

`src/core` (loop, rng, vec2, events), `src/sim` (renderer-free world: ballistics, clays, houses, throws, shot, gun, predict, classify), `src/input` (control schemes, pointer + sim clock), `src/render` (stage, layout, greybox, field view, debug overlay), `src/feel` (tuning, dev panel, settings, juice director, audio + synth, haptics), `src/render/vfx` (shatter, particles, shake, hit-stop), `src/modes` (sandbox, controlTest, shared HUD/play), `src/telemetry` (schema, recorder, storage, export, aggregate), `src/ui` (DOM overlay helpers), `src/scenes` (router, menu, playfield), `tests/`, `e2e/`, `tools/`.
