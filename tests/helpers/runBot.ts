import { Rng } from '../../src/core/rng';
import { defaultTuning } from '../../src/feel/tuning';
import type { SchemeId } from '../../src/input/scheme';
import { RunController, type RunConfig } from '../../src/modes/run/runState';
import type { RoundDef } from '../../src/modes/run/stationData';
import type { Clay } from '../../src/sim/clay';
import { clampAim } from '../../src/sim/field';
import { idealAim, noLeadAim } from '../../src/sim/predict';
import { hitRadius } from '../../src/sim/shot';
import { dist } from '../../src/core/vec2';
import { advanceClay } from '../../src/sim/clay';
import type { UpgradeId } from '../../src/upgrades/types';

export type RunBotKind = 'perfect' | 'noisy' | 'nolead';

export interface RunBotOptions {
  seed: string;
  kind?: RunBotKind;
  /** Which offered upgrade to take; default: a seeded random one. */
  pick?: (offers: UpgradeId[], owned: UpgradeId[], rng: Rng) => number;
  config?: Partial<RunConfig>;
  rounds?: readonly RoundDef[];
  /** Clay age (s) before the bot shoots at it. */
  reaction?: number;
  /** Aim noise (world units, std dev) for the `noisy` bot. */
  noise?: number;
  scheme?: SchemeId;
  /** Safety stop in sim seconds. */
  maxSeconds?: number;
  /** Called once per sim step before the bot acts. */
  onStep?: (ctl: RunController) => void;
}

export interface RunBotResult {
  ctl: RunController;
  won: boolean;
  score: number;
  /** Shells left at the end of each round played. */
  shellsLeft: number[];
  shots: number;
  hits: number;
  simSeconds: number;
}

const gauss = (rng: Rng): number =>
  Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());

/**
 * Headless run bot. `perfect` aims at the exact predicted lead point (and uses one shot for two
 * clays when the pattern covers both), `noisy` adds aim error, `nolead` aims at the clay's
 * current position. It drives the same RunController as the UI.
 */
export function playRun(opts: RunBotOptions): RunBotResult {
  const config: RunConfig = { ...(defaultTuning as RunConfig), ...opts.config };
  const ctl = new RunController({
    seed: opts.seed,
    scheme: opts.scheme ?? 'tap',
    config,
    rounds: opts.rounds,
  });
  const kind = opts.kind ?? 'perfect';
  const botRng = new Rng(`bot/${opts.seed}`);
  const reaction = opts.reaction ?? 0.3;
  const dt = 1 / defaultTuning.simHz;
  const covered = new Map<number, number[]>();
  const maxSteps = Math.round((opts.maxSeconds ?? 900) * defaultTuning.simHz);
  let steps = 0;
  for (; steps < maxSteps && !ctl.over; steps++) {
    opts.onStep?.(ctl);
    switch (ctl.phase) {
      case 'intro':
        ctl.startRound();
        covered.clear();
        continue;
      case 'roundClear':
        ctl.openDraft();
        continue;
      case 'draft': {
        const idx = opts.pick
          ? opts.pick(ctl.offers, ctl.owned, botRng)
          : botRng.int(0, ctl.offers.length - 1);
        ctl.pick(idx);
        continue;
      }
      default:
        break;
    }
    const w = ctl.world;
    if (w.gun.status(w.time) === 'ok' && ctl.shells > 0) {
      // clays already going to be hit by a shot in flight
      const incoming = new Map<number, number>();
      for (const s of w.shots)
        for (const id of covered.get(s.id) ?? []) incoming.set(id, (incoming.get(id) ?? 0) + 1);
      const cands = w
        .liveClays()
        .filter((c) => c.age >= reaction && (incoming.get(c.id) ?? 0) < c.hitsLeft)
        .sort((a, b) => b.age - a.age || a.id - b.id);
      for (const c of cands) {
        const lead = kind === 'nolead' ? noLeadAim(w.cfg, c, 0) : idealAim(w.cfg, c, 0).aim;
        let aim = lead;
        if (kind === 'noisy') {
          const n = opts.noise ?? 2.5;
          aim = { x: lead.x + gauss(botRng) * n, y: lead.y + gauss(botRng) * n };
        }
        const cl = clampAim(aim);
        if (dist(cl, aim) > 1e-9 && kind !== 'noisy') continue; // out of reach for now
        const shot = ctl.fire({ aim: cl, t: w.time });
        if (shot) {
          const dtp = shot.arriveTime - w.time;
          const ids: number[] = [];
          for (const o of w.liveClays()) {
            const k = advanceClay(o, dtp, w.cfg);
            if (dist(k, shot.aim) < hitRadius(w.cfg, o.type, shot.radius)) ids.push(o.id);
          }
          covered.set(shot.id, ids);
        }
        break;
      }
    }
    ctl.update(dt);
  }
  return {
    ctl,
    won: ctl.phase === 'won',
    score: ctl.score,
    shellsLeft: ctl.roundStats.map((r) => r.shellsEnd),
    shots: ctl.summary().shots,
    hits: ctl.summary().hits,
    simSeconds: steps * dt,
  };
}

export const firstOf =
  (...prefs: UpgradeId[]) =>
  (offers: UpgradeId[]): number => {
    for (const p of prefs) {
      const i = offers.indexOf(p);
      if (i >= 0) return i;
    }
    return 0;
  };

export type { Clay };
