import type { Rng } from '../core/rng';
import type { Gust } from '../sim/config';
import type { UpgradeTuning } from './params';

/**
 * Seeded gust schedule: alternating quiet gaps and gusts of random strength and side, covering
 * `horizon` sim seconds. Visible streaks show each gust `windTelegraph` seconds before it starts, so
 * the wind is readable, never hidden randomness.
 */
export function generateGusts(rng: Rng, p: UpgradeTuning, horizon = 150): Gust[] {
  const out: Gust[] = [];
  let t = rng.range(1.5, 2.5);
  while (t < horizon) {
    const len = rng.range(p.windGustMin, p.windGustMax);
    const mag = rng.range(p.windAccelMin, p.windAccelMax);
    out.push({ start: round(t), end: round(t + len), ax: round(rng.next() < 0.5 ? -mag : mag) });
    t += len + rng.range(p.windGapMin, p.windGapMax);
  }
  return out;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;
