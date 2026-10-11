import { Rng } from '../core/rng';
import type { ClayTypeId } from './clay';
import type { BaseHouseId, HouseId } from './houses';

export interface ClaySpec {
  type: ClayTypeId;
  house: HouseId;
  /** Seconds after the throw starts. */
  delay: number;
  speed: number;
  angleDeg: number;
}

export interface ThrowSpec {
  kind: 'single' | 'double';
  clays: ClaySpec[];
  /** Pause after this throw ends before the next begins, seconds. */
  gapAfter: number;
}

/** Launch ranges per house (speed in world units / s, angle in degrees above horizontal). */
export interface LaunchRange {
  speed: [number, number];
  angle: [number, number];
}

export const TEST_LAUNCH: Record<BaseHouseId, LaunchRange> = {
  high: { speed: [70, 86], angle: [44, 62] },
  low: { speed: [62, 80], angle: [48, 66] },
};

export const TEST_SEED = 'control-test-v1';
export const TEST_THROWS = 20;
export const TEST_DOUBLES = 4;
export const TEST_GAP = 1.0;

function claySpec(rng: Rng, house: BaseHouseId, delay: number, range: LaunchRange): ClaySpec {
  return {
    type: 'standard',
    house,
    delay,
    speed: round(rng.range(...range.speed)),
    angleDeg: round(rng.range(...range.angle)),
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * The fixed 20-throw control-test set: 16 singles (8 per house) and 4 doubles (one clay from each
 * house), standard clays only. Pure function of the seed: identical every attempt.
 */
export function buildTestSet(seed: string = TEST_SEED, ranges = TEST_LAUNCH): ThrowSpec[] {
  const rng = new Rng(seed);
  // One double in each of four bands of the order, positions chosen from the seed.
  const bands = [
    [3, 4, 5],
    [8, 9, 10],
    [12, 13, 14],
    [17, 18, 19],
  ];
  const doubleAt = new Set(bands.map((b) => rng.pick(b)));
  const singleHouses: BaseHouseId[] = [];
  for (let i = 0; i < TEST_THROWS - TEST_DOUBLES; i++)
    singleHouses.push(i % 2 === 0 ? 'high' : 'low');
  // Seeded Fisher-Yates shuffle of the single-house order.
  for (let i = singleHouses.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [singleHouses[i], singleHouses[j]] = [
      singleHouses[j] as BaseHouseId,
      singleHouses[i] as BaseHouseId,
    ];
  }
  const out: ThrowSpec[] = [];
  let s = 0;
  for (let i = 0; i < TEST_THROWS; i++) {
    if (doubleAt.has(i)) {
      out.push({
        kind: 'double',
        clays: [
          claySpec(rng, 'high', 0, ranges.high),
          claySpec(rng, 'low', rng.range(0, 0.12), ranges.low),
        ],
        gapAfter: TEST_GAP,
      });
    } else {
      const h = singleHouses[s++] as BaseHouseId;
      out.push({ kind: 'single', clays: [claySpec(rng, h, 0, ranges[h])], gapAfter: TEST_GAP });
    }
  }
  return out;
}

export interface SandboxThrowOptions {
  ranges: Record<BaseHouseId, LaunchRange>;
  doubleChance: number;
  gap: [number, number];
}

/** Endless random throws for free play. */
export function* sandboxThrows(
  seed: string | number,
  opts: SandboxThrowOptions,
): Generator<ThrowSpec> {
  const rng = new Rng(seed);
  for (;;) {
    const gapAfter = round(rng.range(...opts.gap));
    if (rng.next() < opts.doubleChance) {
      yield {
        kind: 'double',
        clays: [
          claySpec(rng, 'high', 0, opts.ranges.high),
          claySpec(rng, 'low', rng.range(0, 0.12), opts.ranges.low),
        ],
        gapAfter,
      };
    } else {
      const h: BaseHouseId = rng.next() < 0.5 ? 'high' : 'low';
      yield { kind: 'single', clays: [claySpec(rng, h, 0, opts.ranges[h])], gapAfter };
    }
  }
}
