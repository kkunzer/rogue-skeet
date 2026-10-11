# Rogue Skeet — Prototype Implementation Plan (design doc steps 1–3)

## Context

`docs/design-prototype.md` describes a portrait, one-thumb skeet roguelite. Its prototype plan is: (1) greybox three control schemes and run a 20-throw learning test, (2) nail one satisfying hit, (3) build one station with 4 clay types, 6 upgrades and a boss, then (4) play 20 runs and (5) decide go/no-go. The repo is empty except the README and the doc. This plan builds steps 1–3 as one browser codebase. Each phase ends in a deployable, playable build, so you can run the human playtests (steps 1, 4 and 5) yourself.

### Decisions from the design interview (Oct 2026)

| Topic | Decision |
|---|---|
| Platform | Web, TypeScript, Vite, PixiJS v8 (WebGL). Hosted on GitHub Pages and installable as a PWA. Capacitor wrapper later for native iOS haptics. |
| View | 2D sky plane, shooter's view down-range, portrait. High house on the left, low house on the right, ground strip at the bottom for rabbits, gun at bottom center. |
| Shot model | The shot flies from the gun to the tap point (flight time = base + distance / speed). The pattern then bursts there and breaks any clay inside its radius at that instant. |
| Telemetry | Local only. Results screen with Copy / Share / Download JSON, plus a Node aggregation script. No backend. |
| Test devices | Mix of iPhone and Android. Web vibration on Android, experimental iOS Safari haptic, Capacitor provider stubbed for later. |
| Clay set | Standard, Splitter, Armored, Rabbit |
| Boss | 12-clay flurry from every house |
| Upgrades (6) | Explosive fragments, Chain shatter (together they make the named synergy **Shrapnel Storm**), Slug, Smaller-radius-2x-score curse, Wind gusts, Heavier gravity |
| Audio | CC0 samples layered with pitch/volume variation in Web Audio. Every sound cue has a procedural synth fallback. |
| Shell economy | Every shot spends a shell, and an escaped clay costs one more. Hitting 0 with clays still live or scheduled ends the run. |
| Boss clear | The boss has its own shell pool. You clear it if you still have shells when the flurry ends. |

Out of scope: meta-progression, extra stations, heat, daily seed, monetization, and art beyond stylized vector.

## Architecture

Deterministic, renderer-free sim plus thin input and render layers. This keeps hit math unit-testable, lets bots verify that lead is learnable, and makes daily seeds possible later.

```
index.html, vite.config.ts (base '/rogue-skeet/'), public/manifest.webmanifest (fullscreen, portrait)
src/
  main.ts                 boot + scene router (menu / sandbox / controlTest / run)
  core/   loop.ts (fixed 120 Hz sim, rAF render), rng.ts (seeded sfc32), vec2.ts, events.ts (typed bus)
  sim/    world.ts, ballistics.ts (gravity, drag, wind), clay.ts (type behaviors), shot.ts (flight + burst + hit),
          gun.ts (barrels, cycle, reload, shell pool), houses.ts, throws.ts (data-driven throw schedules), predict.ts
  input/  pointer.ts (screen↔world, event timestamps → sim time, left-hand mirror),
          scheme.ts (ControlScheme → FireIntent{aim,t}), tap.ts, drag.ts, flick.ts
  render/ stage.ts (fixed 9:16 playfield, letterboxed with decorative sky/ground), clayView, shotView, hud, background
          vfx/ shatter.ts, particles.ts, flash.ts, shake.ts, hitstop.ts
  feel/   tuning.ts (every tunable in one typed object + Tweakpane panel at ?dev, JSON export), audio.ts, haptics.ts
  modes/  sandbox/, controlTest/, run/
  upgrades/ types.ts (hooks), defs/*.ts, synergies.ts, draft.ts
  telemetry/ schema.ts, recorder.ts (localStorage autosave), export.ts
tools/aggregate-control-test.ts
tests/ (Vitest), e2e/ (Playwright on /opt/pw-browsers/chromium, touch-emulated phone viewports)
.github/workflows/ci.yml (lint, typecheck, test, build), pages.yml (deploy on push to main + manual dispatch)
```

Key mechanics. Starting values live in `tuning.ts` and get tuned live through the dev panel.
- **World**: a fixed 90×160 playfield, so the game is identical on every phone. Clay radius ≈2.2 and pattern radius ≈5. Shot flight is ~0.08 s plus distance/400, which gives roughly 150–350 ms.
- **Hit resolution**: at arrival, any clay whose distance from the burst point is less than pattern radius plus clay radius breaks. The aim-assist slider scales pattern radius up to +50%. A clay inside the inner 35% of the pattern counts as a "perfect" hit.
- **Gun**: 2 barrels, ~120 ms cycle between shots and ~700 ms reload after both are fired. Data-driven, so relics can change barrels and reload later.
- **Input**: listen to `pointerdown`/`pointermove`/`pointerup` with `touch-action:none` and no zoom. Each shot uses the event's timestamp, so a dropped frame doesn't shift when it fires.
- **Miss classifier**: split the aim-minus-clay offset into components along and across the clay's velocity, then label it ahead / behind / high / low.

## Phase 0 — Scaffold
Set up Vite, TypeScript (strict), PixiJS v8, Tweakpane v4, Vitest, Playwright, ESLint and Prettier, all at pinned exact versions. Add the CI and Pages workflows and the PWA manifest, plus a blank portrait stage with a letterbox and a debug overlay showing FPS and input timing. Add npm scripts: `dev`, `build`, `test`, `e2e`, `lint`, `typecheck`, `aggregate`.

## Phase 1 — Controls greybox + 20-throw test (Doc step 1)
1. **Sim core**: ballistics, standard clay, houses, throw schedule, shot flight and burst, gun, seeded RNG. Greybox visuals only: flat discs, rings and lines.
2. **Three schemes** behind one `ControlScheme` interface:
   - *Tap where it'll be*: fires on pointerdown at the touch point plus a tunable vertical offset (default 0). A toggle adds a ghost trail behind clays so they stay readable under the finger.
   - *Drag reticle, lift to fire*: the reticle sits offset above the thumb (mirrored for left-handed players) and moves 1:1 with the drag; release fires. A quick tap with no drag fires the second barrel at the last reticle position, so doubles stay usable.
   - *Flick to fire*: swipe direction sets the angle from the gun and swipe speed sets burst distance, through a tunable curve with clamps.
3. **Accessibility**: aim-assist slider (default 0 in the test and recorded in results) and a left-handed mirror.
4. **Sandbox mode**: free play with any scheme, plus the dev panel for tuning feel.
5. **Control-test mode**:
   - A fixed-seed set of 20 throws: 16 singles and 4 doubles from both houses, standard clays only, identical every attempt.
   - Flow: tester ID and handedness → each scheme in Latin-square order (picked by tester-ID hash) → 5 attempts per scheme (configurable with `?attempts=`).
   - After each throw with a miss, the game pauses between throws and asks "Why did you miss?" (Ahead / Behind / High / Low / Not sure). The answer is compared with the classifier to give a miss-explainability score.
   - After each scheme the tester rates feel from 1 to 5.
   - Infinite shells; barrels and reload still apply.
6. **Telemetry**: per throw, record launch time, time to first shot, every shot (aim point, arrival time, hit or miss, miss vector, actual vs. reported reason) and which clays broke. Also record device info, settings and the build SHA. Autosave to localStorage, then export with Copy / Share / Download.
7. **Aggregator**: `npm run aggregate -- results/*.json` writes a markdown table per scheme: attempt-1 vs. attempt-5 hit rate, learning delta, median time to first shot, explainability %, mean feel rating, plus per-tester curves. Suggested guides for your call: learning delta of at least +15 points and explainability of at least 60%.

**Gate**: you run the test with 5+ people, aggregate the results and pick the default scheme. Phase 2 can start in parallel, since it doesn't depend on the scheme.

## Phase 2 — Nail one hit (Doc step 2)
- **Shatter VFX**: procedurally slice each clay into 6–12 shards. Shards inherit the clay's velocity plus an impulse from the shot direction, spin, and fall under gravity. Add a dust puff, an impact flash ring, a 40–60 ms hit-stop and light screen shake, all scaled by hit quality; a perfect hit gets a bigger burst. Set the readability rules now: live clays keep a bright rim and debris desaturates within ~250 ms. Particles run in a Pixi `ParticleContainer`.
- **Audio** (`feel/audio.ts`): unlock Web Audio on the first touch (required on iOS) and use pre-decoded buffers.
  - Cues: gun report (transient, body and tail layers), 3 clay-crack variants, a trap thunk per house that is stereo-panned and pitched per house (the doc's "audio cue from its house"), a combo pitch ladder, and a perfect-hit chime.
  - Every play randomizes pitch ±8% and gain.
  - CC0 files go in `public/audio/` with a `CREDITS.md`. If they can't be downloaded here, I'll list exact files for you to drop in; the synth fallbacks keep the game working either way.
- **Haptics** (`feel/haptics.ts`): providers chosen in order, with short patterns for shot, hit and perfect hit:
  1. Capacitor `Haptics`, only when running natively.
  2. `navigator.vibrate` (Android Chrome).
  3. An experimental iOS 18+ Safari switch-input trick, which only works inside a gesture, so on the shot.
  4. Nothing.

  `docs/native.md` gives the Capacitor iOS steps, which need a Mac.
- **A/B toggle** for juice on/off, so you can check the difference on a device.

## Phase 3 — One playable station (Doc step 3)
- **Clays** (`sim/clay.ts`):
  - *Splitter*: on a hit, spawns 2 smaller clays on diverging paths, and each counts toward escapes.
  - *Armored*: takes 2 hits; the first cracks it and deflects it.
  - *Rabbit*: rolls along the ground strip and bounces off seeded bumps.
- **Run structure** (`modes/run/`): Round 1 standard, Round 2 adds splitters, Round 3 rabbits, Round 4 armored, then the boss flurry from 3 houses within ~3 s.
  - Each round has 8–9 throws and a fixed shell pool. Starting values are 16 / 20 / 18 / 22 shells and 18 for the boss, all in data.
  - Every shot costs 1 shell and an escape costs 1 more. Reaching 0 shells with clays still live or scheduled loses the run.
  - Scoring: 100 per clay × combo (+0.1 per consecutive hit, capped at ×3) × upgrade multipliers, with +50% for a perfect hit. A miss or an escape breaks the combo.
- **Draft** (`upgrades/draft.ts`): after each round, pick 1 of 3 offered upgrades, so 4 picks per run from the pool of 6. Already-owned upgrades are never offered, and physics mods are offered at half weight. Picking a physics mod shows a faint trajectory preview for the next 3 throws.
- **Upgrade hooks**: `onShotFired`, `modifyPattern`, `onClayHit`, `onClayBroken`, `modifyPhysics`, `modifyScore`.
  - *Explosive fragments*: a break also breaks any live clay within radius R.
  - *Chain shatter*: a break arcs to the nearest live clay within R2, up to 3 links.
  - *Slug*: 40% pattern radius but a faster shot, breaks armored in one hit, ×1.5 score.
  - *Curse*: smaller radius, ×2 score.
  - *Wind gusts*: seeded lateral gusts, with streaks that warn ~0.5 s ahead, so wind is never hidden RNG.
  - *Heavier gravity*: ×1.5 gravity, with launch speed adjusted so arcs still cross the screen.
  - *Synergy*: owning Explosive fragments and Chain shatter shows a **SHRAPNEL STORM** banner and adds +25% chain range.
- **HUD and screens**: shell icons, barrel state, score, combo and round progress in a top bar, leaving the bottom clear for the thumb. Draft cards. A run summary with score, breaks by clay type, picks and synergies, an optional "felt fresh?" rating from 1 to 5, and Play again with a new seed.
- **Run log**: run summaries (seed, picks, score, round reached, cleared or not) saved in localStorage and exportable as JSON, to support your 20-run freshness check (step 4).

## Verification
- **Every phase**: `npm run lint && npm run typecheck && npm test && npm run build` pass, and CI is green.
- **Unit tests (Vitest)**:
  - ballistics are deterministic for a seed; flight time; hit radius and perfect-hit math; gun cycle and reload.
  - A **perfect-lead bot** using `sim/predict.ts` scores 20/20 on the test throws under each scheme's aim mapping, while a **no-lead bot** aiming at the clay's current position scores under 30%. Together these show that lead matters and is learnable.
  - the miss classifier; telemetry schema round-trip; the aggregator against fixture JSONs.
  - splitter spawns 2, armored needs 2 hits, rabbits stay on the ground and bounce.
  - upgrade effects and chain caps; synergy detection; the draft never duplicates an upgrade and respects weights.
  - the run state machine: shells running out loses, an escape drains a shell, the boss clear rule.
- **E2E (Playwright, emulated Pixel 7 and iPhone 14 touch viewports)**:
  - load the app;
  - sandbox: a bot fires real touch events at predicted lead points and the hit counter goes up;
  - finish a whole control-test attempt and check that the exported JSON validates;
  - finish a whole seeded run and reach the summary;
  - take screenshots at each phase to share progress.

  A `window.__debug` hook (dev and test builds only) exposes predictions to the bot.
- **On device (you)**: open the Pages URL on an iPhone and an Android phone and check input latency, audio unlock, Android vibration and PWA fullscreen. Then the human gates: the controls test with 5+ testers and 20 station runs.

## Delivery
Each phase is committed and pushed as its own playable milestone. GitHub Pages deploys from `main` and needs a one-time setup (Settings → Pages → Source: GitHub Actions). To playtest a branch before merging, add it to the `github-pages` environment's allowed deployment branches.
