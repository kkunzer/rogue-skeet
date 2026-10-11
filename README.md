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
- **Run** (`?scene=run`, or Run in the menu): the one playable station, described below.

Running the playtest and reading the results: [docs/control-test-protocol.md](docs/control-test-protocol.md).

## Run mode (Phase 3)

One station: four rounds and a boss flurry. Start it from the menu (Run). The setup card shows the run's seed (a new random seed every run; `?seed=abc` fixes it, and the same seed gives the same throws, drafts and wind), the control scheme (default: the one saved in settings, tap if none) and handedness.

- **Rounds**: 1 standard (singles and doubles), 2 adds **splitters** (purple, break into two smaller clays), 3 adds **rabbits** (green ovals that roll and bounce along the ground), 4 adds **armored** (steel hexagons: the first hit cracks and deflects them, the second breaks them), each mixing in the earlier types. Then the **boss**: 12 clays from the high, low and a new center trench house within about 3 seconds, all types mixed. Rounds have 8-9 throws.
- **Shells**: pools of 16 / 20 / 18 / 22 shells for rounds 1-4 and 18 for the boss (data in `src/modes/run/stationData.ts`; `runShellBonus` in the dev panel shifts them all). Every shot costs 1 shell and every clay that escapes costs 1 more (splitter children too). Reaching 0 shells while clays are live or still scheduled ends the run. The boss is cleared like any round: survive to the end of the flurry, even if your last shell breaks the last clay.
- **Score**: 100 per clay x combo (+0.1 per consecutive hit, capped at x3) x upgrade multipliers, +50% for a perfect hit. A missed burst or an escape breaks the combo.
- **Draft** after each of rounds 1-4: pick 1 of 3 upgrades (never one you own; physics mods are offered at half weight; seeded). After picking a physics mod, a faint dotted trajectory preview shows on clays for the next 3 throws.
- **HUD**: round, score, combo, shell icons and count, barrel state, wind warning, owned upgrade icons, all in the top bar so the bottom stays free for the thumb. Cards for round intro, round clear, draft and the run summary (score, breaks by clay type, picks, synergies, seed, an optional "felt fresh?" 1-5 rating, Play again with a new seed, Run log, Menu).

### Upgrades

| Upgrade             | Category    | Effect                                                                                         |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Explosive fragments | Shells      | A break also breaks every live clay within 11 units (armored clays crack).                     |
| Chain shatter       | Shells      | A break arcs (visible bolt) to the nearest live clay within 17 units, up to 3 links.           |
| Slug                | Shells      | Pattern radius x0.4, shot flight x0.6, breaks armored in one hit, x1.5 score.                  |
| Choke curse         | Curse       | Pattern radius x0.7, x2 score.                                                                 |
| Wind gusts          | Physics mod | Seeded lateral gusts push clays. Streaks show 0.5 s ahead; the wind is part of `predict.ts`.   |
| Heavier gravity     | Physics mod | Gravity x1.5, launch speed x sqrt(1.5) so arcs still cross the screen (same shape, less time). |

**Synergy**: Explosive fragments + Chain shatter = **SHRAPNEL STORM** (banner and sound when the second is picked), +25% chain range. Cascades are loop-safe: every clay breaks at most once per burst, explosions never set off explosions, chains stop at 3 links, and the world stops running break hooks past depth 8.

Upgrades act through sim-level hooks (`src/upgrades/types.ts`: `onShotFired`, `modifyPattern`, `onClayHit`, `onClayBroken`, `modifyPhysics`, `modifyScore`; the sim side is `src/sim/hooks.ts`), so a run stays deterministic: the same seed and the same inputs replay identically. Presentation listens to the extra `World` events (`crack`, `explosion`, `chain`, `split`). All the numbers are in `src/upgrades/params.ts` and the `?dev` panel (Run and upgrades).

### Run log

Every finished run (won or lost) is saved to localStorage (`rogue-skeet.runlog.v1`) as `{seed, picks, score, roundReached, cleared, breaksByType, synergies, freshRating, scheme, buildSha, timestamp, shellsLeft, shots, hits}`. Menu, Run log lists them with a win count and the average "felt fresh" rating, and exports the whole log with **Copy JSON** or **Download**. See [docs/station-playtest.md](docs/station-playtest.md) for the 20-run check.

### Bots and tests for runs

`window.__debug.run()` returns the run state (phase, round, shells, score, owned upgrades, draft offers), `window.__debug.predictions()` returns the exact lead point for every live clay (rabbits, wind and gravity included), and `shootAt(id)` performs the scheme's gesture with real pointer events. Playwright plays a whole seeded run through the DOM cards. `?simspeed=N` (2 to 8, only in dev or with `?test`) runs the game N times faster than real time so e2e runs stay short; the input clock scales with it. It is test-only and ignored otherwise.

Headless bots (`tests/helpers/runBot.ts`) drive the same `RunController`: the perfect-lead bot clears every seeded run including the boss with the default shell pools, a no-lead bot loses in round 1.

### Aggregating results

```sh
npm run aggregate -- results/*.json > results/summary.md
```

Prints a markdown table per scheme (attempt 1 vs attempt N hit rate, learning delta, median time to first shot, explainability, mean feel) and per-tester curves.

### Bots and the debug API

Pass `?test` (or run `npm run dev`) to expose `window.__debug` (sim state, `idealAim(clayId)`, `shootAt(clayId)` which performs the active scheme's gesture with real PointerEvents). The unit tests include a perfect-lead bot (24/24 clays under every scheme) and a no-lead bot (under 30%); Playwright drives the same API.

## Layout

`src/core` (loop, rng, vec2, events), `src/sim` (renderer-free world: ballistics, clays, houses, throws, shot, gun, predict, classify), `src/input` (control schemes, pointer + sim clock), `src/render` (stage, layout, greybox, field view, debug overlay), `src/feel` (tuning, dev panel, settings, juice director, audio + synth, haptics), `src/render/vfx` (shatter, particles, shake, hit-stop), `src/modes` (sandbox, controlTest, run, shared HUD/play), `src/upgrades` (hook types, six upgrade defs, synergies, draft, wind), `src/telemetry` (schema, recorder, storage, export, aggregate), `src/ui` (DOM overlay helpers), `src/scenes` (router, menu, playfield), `tests/`, `e2e/`, `tools/`.
