import { dist, type Vec2 } from '../core/vec2';
import { advanceClay, type ClayState } from './clay';
import type { SimConfig } from './config';
import { GUN_ORIGIN } from './field';
import { flightTime } from './shot';

type ClayLike = ClayState;

/**
 * Clay centre `dt` seconds from its current state. Exact: uses the same integrator as the sim,
 * including rabbits' bounces and wind gusts (read from `cfg.gusts` at the clay's clock).
 */
export function clayPositionAt(cfg: SimConfig, clay: ClayLike, dt: number): Vec2 {
  const s = advanceClay(clay, dt, cfg);
  return { x: s.x, y: s.y };
}

export interface Lead {
  /** Aim point that meets the clay when the shot bursts. */
  aim: Vec2;
  /** Shot flight time to that aim point, seconds. */
  flight: number;
}

/**
 * The aim point that hits the clay dead centre if the shot is fired `delay` seconds from the
 * clay's current state. Solves aim = clayPosition(delay + flightTime(aim)) by fixed-point iteration
 * (a contraction, because the shot is much faster than the clay).
 */
export function idealAim(
  cfg: SimConfig,
  clay: ClayLike,
  delay = 0,
  origin: Vec2 = GUN_ORIGIN,
): Lead {
  let aim = clayPositionAt(cfg, clay, delay);
  let flight = flightTime(cfg, origin, aim);
  for (let i = 0; i < 40; i++) {
    const next = clayPositionAt(cfg, clay, delay + flight);
    const moved = dist(next, aim);
    aim = next;
    flight = flightTime(cfg, origin, aim);
    if (moved < 1e-9) break;
  }
  return { aim, flight };
}

/** Aim straight at where the clay is at fire time (no lead). */
export function noLeadAim(cfg: SimConfig, clay: ClayLike, delay = 0): Vec2 {
  return clayPositionAt(cfg, clay, delay);
}
