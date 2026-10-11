/** A lateral wind gust on flying clays: constant acceleration `ax` (world units / s^2) over [start, end) sim seconds. */
export interface Gust {
  start: number;
  end: number;
  ax: number;
}

/** Sim tunables. `feel/tuning.ts` extends this, so the live tuning object can be handed to the sim. */
export interface SimConfig {
  /** Gravity on clays, world units / s^2. */
  gravity: number;
  /** Linear air drag on clays, 1/s. */
  drag: number;
  /** Shot flight time = base + distance / speed. */
  shotBaseTime: number;
  /** Shot travel speed, world units / s. */
  shotSpeed: number;
  /** Pattern radius, world units. */
  patternRadius: number;
  /** Standard clay radius, world units. */
  clayRadius: number;
  /** Aim assist 0..0.5: scales pattern radius by (1 + aimAssist). */
  aimAssist: number;
  /** A clay inside this fraction of the hit radius is a perfect hit. */
  perfectFrac: number;
  /** Barrels per reload. */
  barrels: number;
  /** Minimum seconds between shots. */
  gunCycle: number;
  /** Seconds to reload after the last barrel fires. */
  gunReload: number;
  /** Multiplier on every shot's flight time (Slug < 1 = faster shot). */
  shotTimeMul: number;
  /** Multiplier on the launch speed of flying clays (Heavier gravity raises it so arcs still cross the screen). */
  launchSpeedMul: number;
  /** Seeded lateral gusts (Wind gusts upgrade). Predictions include them. */
  gusts: readonly Gust[];
  /** Seed for the rabbits' bump layout (set per run and round). */
  rabbitSeed: number;
}

export const defaultSimConfig: Readonly<SimConfig> = {
  gravity: 38,
  drag: 0.15,
  shotBaseTime: 0.12,
  shotSpeed: 450,
  patternRadius: 5,
  clayRadius: 2.2,
  aimAssist: 0,
  perfectFrac: 0.35,
  barrels: 2,
  gunCycle: 0.12,
  gunReload: 0.7,
  shotTimeMul: 1,
  launchSpeedMul: 1,
  gusts: [],
  rabbitSeed: 1,
};
