# Station playtest: play 20 runs (design doc step 4)

The question: **does run 20 still feel different from run 1?** If the station only holds up for five runs, the game fails pillar 3 (builds break the rules) and the "sameness over time" risk in the design doc comes true. This guide covers how to play the 20 runs, how to export the run log and what to look for. What you find feeds the go/no-go call (step 5).

## Before you start

1. Build or open the Pages URL on your phone (`npm run dev` for a local build). Pick the control scheme the controls test chose: Menu, Run, then the scheme buttons on the setup card. It is remembered.
2. Leave Juice, Sound and Haptics on for this test (they are the game). If you want the A/B comparison, do a few runs with Juice off in the sandbox Settings.
3. Do not use `?seed=`. Each run needs a new random seed, which is the default (Play again starts a new seed).
4. Play like a player, not a tester: try to win, chase builds, do not restart when you pick a "bad" upgrade. Abandoned runs (Menu button mid-run) are not logged, so finish or lose every run.

## While playing

After each run the summary asks **"felt fresh?"** from 1 (same as the last runs) to 5 (totally new). Tap a number before you press Play again. It takes two seconds and it is the main number this test produces.

Also jot down, in a notes app, anything you notice while playing:

- A pick you never take, or one you always take.
- A run that felt like the previous one, and why.
- A moment that felt great (a Shrapnel Storm chain, a perfect wind read) or unfair (a gust you could not read, a shell shortage).
- Whether the physics mods (wind, heavier gravity) made you relearn the lead, or whether you ignored them.

## Exporting the log

Menu, Run log, then **Copy JSON** (paste into a message to yourself) or **Download** (`skeet-run-log_<date>.json`). The file looks like:

```json
{ "game": "rogue-skeet", "kind": "run-log", "v": 1, "runs": [ { "seed": "k3x9a0q", "picks": ["chain", "explosive", "gravity", "curse"],
  "score": 41230, "roundReached": 5, "cleared": true, "breaksByType": { "standard": 31, "splitter": 3, "splitlet": 6, "rabbit": 3, "armored": 3 },
  "synergies": ["shrapnelStorm"], "freshRating": 4, "scheme": "tap", "buildSha": "ab12cd3", "timestamp": "2026-10-12T18:04:11.000Z",
  "shellsLeft": [6, 5, 5, 8, 3], "shots": 64, "hits": 61 } ] }
```

The log lives in the browser's localStorage, so export before you clear site data, switch browsers or install a new build on a different URL. Runs from different `buildSha` values are mixed in one log; note in your head which numbers changed if you retuned in between.

## What to look for in the 20 runs

Open the export (or the Run log screen) and check:

| Signal | Where | Healthy | Warning |
| --- | --- | --- | --- |
| Freshness trend | `freshRating` by run order | Stays at 3 or above, or recovers when a new build appears | Falls to 1-2 by run 8-12 and stays there |
| Build variety | `picks` | At least 12 distinct 4-pick sets in 20 runs; every upgrade picked in more than a few runs | One or two picks in almost every run; an upgrade picked in fewer than 3 of 20 runs |
| Synergy | `synergies` | Shrapnel Storm shows up in several runs and those runs feel like a different game | Never reached, or reached every run (too easy to force) |
| Win rate | `cleared` | Roughly 30-60% for you at run 10+ (a skilled player with nothing unlocked should be able to win) | 0 wins in 20 (pools too tight) or more than 80% (no tension) |
| Where runs end | `roundReached` | Losses spread over rounds 2-5 | Almost every loss in the same round: that round is the difficulty wall |
| Shell margin | `shellsLeft` | Single digits left in most rounds | Always 8+ left (too generous) or 0-1 (too tight) |
| Score spread | `score` | A wide spread that follows the build | Almost the same score every run |
| Hit rate | `hits` / `shots` | Rises over the first 10 runs, then plateaus (lead is learnable) | Flat or falling (the controls or the physics mods hide the lead) |

Then answer the freshness question by comparing the two halves: the mean `freshRating` of runs 1-5 against runs 16-20, and your notes on whether builds felt different. A drop of more than 1.5 points is a warning; if builds also converge (same two or three picks), that is a strong one.

## How this feeds the go/no-go (step 5)

Combine four things:

1. **Run 20 vs run 1**: the freshness trend and your notes. This is the main gate. Go needs a trend that holds at 3 or better, with at least a couple of "that build was absurd" moments.
2. **Controls**: the control test result (guides: learning delta of +15 points or more, explainability of 60% or more) plus the hit-rate curve above. If the lead feels hidden in runs, the scheme or the physics mods are the cause, not the content.
3. **The hit**: did the shatter, sound and haptics still feel good by run 20? If you stopped noticing them, pillar 2 is weaker than it looked.
4. **Cost to scale**: what it would take to turn this one station into the full four. The design doc lists the sameness risk first, and the mitigation (physics mods and rabbits change the lead itself) only works if those really changed how you played.

Suggested call: **Go** if the freshness trend holds, builds varied, the controls gate passed and at least one clearly absurd build emerged. **Iterate** (one more tuning pass on pools, upgrade numbers and the draft, then another 10 runs) if the structure feels good but one signal is in the warning column. **No-go** if freshness collapses by run 10 with converging builds, or lead stops being learnable. Write the decision and the exported log into the repo's notes so the numbers are not lost.

## Tuning knobs if a signal is off

- Too hard or too easy: shell pools in `src/modes/run/stationData.ts`, or `runShellBonus` live in the `?dev` panel (Run and upgrades).
- A dominant or dead pick: radii, multipliers and gust strength in `src/upgrades/params.ts` (also live in `?dev`).
- Pacing: `GAP_RANGE` and `runGapMul`, boss `FLURRY_SECONDS`.
- Replay a bad run exactly: open the app with `?seed=<seed from the log>` (the throws and the wind are identical, and so are the draft offers if you make the same picks).
