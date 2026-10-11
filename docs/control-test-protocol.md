# Control test protocol

How to run the Phase 1 control playtest and read the results. The goal is to pick the default control scheme (tap, drag reticle, or flick) by data, as described in [design-prototype.md](design-prototype.md) and [implementation-plan.md](implementation-plan.md).

## What you need

- 5 or more testers, each on their own phone (mix iPhone and Android if you can).
- The deployed link (GitHub Pages) or a local build served on your network. Ten minutes per tester.
- A place to collect the exported JSON files, e.g. a `results/` folder.

## Sending testers the link

Send `https://<your-pages-host>/rogue-skeet/?scene=controlTest` and ask them to open it on their phone, in portrait, with the sound off or on (it does not matter in Phase 1). Optional URL parameters:

| Parameter | Effect |
|---|---|
| `attempts=5` | Attempts per scheme (default 5). Use fewer for a quick check. |
| `schemes=tap,drag` | Restrict to some schemes (relative Latin-square order is kept). |
| `dev` | Shows the tuning panel (for you, not testers). |

Tip: "Add to Home Screen" gives a fullscreen run with no browser bars, which is closer to the final feel.

## What testers do

1. Enter a tester ID (their name or initials, unique per person) and pick right- or left-handed. Leave the Options section alone for the standard test; aim assist defaults to 0 and is recorded in the results.
2. For each of the three schemes, in an order picked from a hash of their ID (all 6 orders are used across testers):
   - Read the one-card instructions.
   - Play 5 attempts. Every attempt is the same 20 throws (16 singles, 4 doubles, both houses) with the same clays, so improvement is learning, not luck. Shells are unlimited; the gun has two barrels and reloads for about 0.7 s after the second.
   - After any throw where they missed, the game pauses and asks "Why did you miss?" with Ahead / Behind / High / Low / Not sure. They should answer honestly from what they saw; "Not sure" is a valid and useful answer.
   - After the last attempt of a scheme they rate how it felt, 1 to 5 (judge the controls, not the score).
3. On the results screen, tap Share (phones) or Download / Copy JSON and send the file to you.

Progress is autosaved to the browser after every attempt. If the page closes, the saved sessions list on the Control Test start screen reopens the results (and its Copy / Share / Download buttons) for sessions already recorded.

## Collecting and aggregating

Put the files in `results/` and run:

```sh
npm run aggregate -- results/*.json > results/summary.md
```

Invalid files are skipped with a message on stderr. The report has one table per run with a row per scheme:

- attempt 1 vs attempt N hit rate (clays broken / 24, averaged over testers),
- learning delta (mean of each tester's last minus first attempt, in percentage points),
- median time from clay launch to first shot,
- explainability (share of "Why did you miss?" answers that match the miss classifier),
- mean feel rating,

followed by each tester's hit-rate curve per scheme.

## Reading the results

Suggested guides for the decision (from the plan, not hard rules):

- Learning delta of at least +15 points: the scheme has a visible learning curve, so lead is learnable.
- Explainability of at least 60%: testers can say why they missed, so the scheme is not hiding the lead.
- Prefer lower time to first shot and a higher feel rating when two schemes are close.

The aggregator marks the schemes that meet a guide with a check mark. Also look at the per-tester curves: one tester with a flat curve at 90% is a ceiling effect, not a failed scheme. Things that look suspicious (a very low hit rate across all schemes, or large `rejectedTaps` counts) usually mean a layout or latency problem on that device; the JSON includes the device info, build SHA and every tunable, so you can reproduce it.

## JSON format

`schema: "rogue-skeet.control-test"`, `version: 1`. Per throw: launch time, time to first shot, each shot (aim point, fire and arrival times, hit, perfect, miss vector, classifier reason), clays broken, rejected taps, reported vs classified reason. See `src/telemetry/schema.ts`; `validateResult` checks a file.
