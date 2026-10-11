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
};
