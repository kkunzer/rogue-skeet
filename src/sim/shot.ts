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
}

/** Seconds from firing until the pattern bursts at `aim`. */
export function flightTime(cfg: SimConfig, origin: Vec2, aim: Vec2): number {
  return cfg.shotBaseTime + dist(origin, aim) / cfg.shotSpeed;
}

/** Pattern radius after aim assist (up to +50%). */
export function effectivePatternRadius(cfg: SimConfig): number {
  return cfg.patternRadius * (1 + Math.min(0.5, Math.max(0, cfg.aimAssist)));
}

/** A clay breaks if its centre is closer to the burst than this. */
export function hitRadius(cfg: SimConfig, type: Clay['type']): number {
  return effectivePatternRadius(cfg) + clayRadius(type, cfg);
}

/** Perfect hit: the clay centre is inside the inner `perfectFrac` of the hit radius. */
export function isPerfect(cfg: SimConfig, type: Clay['type'], d: number): boolean {
  return d < cfg.perfectFrac * hitRadius(cfg, type);
}
