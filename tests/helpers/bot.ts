import { createScheme } from '../../src/input';
import { defaultInputConfig, type InputConfig, type SchemeId } from '../../src/input/scheme';
import { AttemptRunner } from '../../src/modes/controlTest/attempt';
import { defaultSimConfig, type SimConfig } from '../../src/sim/config';
import { idealAim, noLeadAim } from '../../src/sim/predict';
import type { ReportedReason, AttemptRecord } from '../../src/telemetry/schema';
import type { MissReason } from '../../src/sim/classify';

export type BotKind = 'perfect' | 'nolead';

export interface BotOptions {
  scheme: SchemeId;
  kind: BotKind;
  sim?: SimConfig;
  input?: InputConfig;
  /** Clay age (s) at which the bot starts shooting at it. */
  reaction?: number;
  attemptNo?: number;
  /** Answer for "Why did you miss?" given the classifier's reason; default: honest. */
  answer?: (classified: MissReason | null) => ReportedReason;
}

export interface BotRun {
  record: AttemptRecord;
  unreachable: number;
}

/** Headless bot: plays one 20-throw attempt through the scheme's own pointer scripts. */
export function runBotAttempt(opts: BotOptions): BotRun {
  const sim = opts.sim ?? { ...defaultSimConfig };
  const input = opts.input ?? { ...defaultInputConfig };
  const runner = new AttemptRunner(sim, opts.attemptNo ?? 1);
  const scheme = createScheme(opts.scheme, {
    cfg: () => input,
    emit: (intent) => void runner.fire(intent),
  });
  runner.events.on('throwStart', () => scheme.reset());
  const reaction = opts.reaction ?? 0.45;
  const targeted = new Set<number>();
  let unreachable = 0;
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 600 && runner.state !== 'done'; i++) {
    if (runner.state === 'asking') {
      const classified = runner.recorder.lastThrow?.classified ?? null;
      runner.answer(opts.answer ? opts.answer(classified) : (classified ?? 'unsure'));
      continue;
    }
    const w = runner.world;
    for (const c of w.liveClays()) {
      if (targeted.has(c.id) || c.age < reaction || w.gun.status(w.time) !== 'ok') continue;
      const aim = opts.kind === 'perfect' ? idealAim(sim, c, 0).aim : noLeadAim(sim, c, 0);
      if (!scheme.canReach(aim)) {
        unreachable++;
        targeted.add(c.id);
        continue;
      }
      targeted.add(c.id);
      for (const ev of scheme.script(aim).events) scheme.onPointer({ ...ev, t: w.time + ev.t });
      break;
    }
    runner.update(dt);
  }
  return { record: runner.record(), unreachable };
}
