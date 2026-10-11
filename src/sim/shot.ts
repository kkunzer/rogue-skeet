import { dist, type Vec2 } from '../core/vec2';
import type { Clay } from './clay';
import { clayRadius } from './clay';
import type { SimConfig } from './config';

export interface Shot {
  id: number;
  barrel: number;
  origin: Vec2;
  aim: Vec2;
  fireTime: number;
  arriveTime: number;
  resolved: boolean;
  /** Pattern radius of this shot (after aim assist and upgrades), world units. */
  radius: number;
  /** Hits dealt to each clay in the pattern (Slug = 2, which breaks armored in one hit). */
  damage: number;
}

/** Seconds from firing until the pattern bursts at `aim`. */
export function flightTime(cfg: SimConfig, origin: Vec2, aim: Vec2): number {
  return cfg.shotTimeMul * (cfg.shotBaseTime + dist(origin, aim) / cfg.shotSpeed);
}

/** Pattern radius after aim assist (up to +50%). */
export function effectivePatternRadius(cfg: SimConfig): number {
  return cfg.patternRadius * (1 + Math.min(0.5, Math.max(0, cfg.aimAssist)));
}

/** A clay breaks if its centre is closer to the burst than this. */
export function hitRadius(
  cfg: SimConfig,
  type: Clay['type'],
  patternRadius: number = effectivePatternRadius(cfg),
): number {
  return patternRadius + clayRadius(type, cfg);
}

/** Perfect hit: the clay centre is inside the inner `perfectFrac` of the hit radius. */
export function isPerfect(
  cfg: SimConfig,
  type: Clay['type'],
  d: number,
  patternRadius?: number,
): boolean {
  return d < cfg.perfectFrac * hitRadius(cfg, type, patternRadius);
}
