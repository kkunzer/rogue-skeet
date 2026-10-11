import type { RunDebug } from '../../debug';
import type { RunController } from './runState';

/** Snapshot of the run for `window.__debug.run()`. */
export class RunDebugView {
  constructor(private readonly get: () => RunController | null) {}

  snapshot(): RunDebug | null {
    const c = this.get();
    if (!c) return null;
    const w = c.world;
    const active = w.cfg.gusts.find((g) => w.time >= g.start && w.time < g.end);
    const next = w.cfg.gusts.find((g) => g.start > w.time);
    return {
      seed: c.seed,
      phase: c.phase,
      round: c.round,
      shells: c.shells,
      score: c.score,
      streak: c.streak,
      owned: [...c.owned],
      offers: [...c.offers],
      previewLeft: c.previewLeft,
      synergies: [...c.synergies],
      shellsLeft: c.roundStats.map((r) => r.shellsEnd),
      wind: { now: active?.ax ?? 0, nextStart: next?.start ?? null },
    };
  }
}
