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

`src/core` (loop, rng, vec2, events), `src/sim` (renderer-free world: ballistics, clays, houses, throws, shot, gun, predict, classify), `src/input` (control schemes, pointer + sim clock), `src/render` (stage, layout, greybox, field view, debug overlay), `src/feel` (tuning + dev panel), `src/modes` (sandbox, controlTest, shared HUD/play), `src/telemetry` (schema, recorder, storage, export, aggregate), `src/ui` (DOM overlay helpers), `src/scenes` (router, menu, playfield), `tests/`, `e2e/`, `tools/`.
