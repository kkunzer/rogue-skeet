import type { Gust } from './config';

/** Kinematic state of a flying body. y is up. */
export interface Kin {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Closed-form motion under gravity and linear drag (dv/dt = -k v - g ŷ), plus an optional constant
 * lateral acceleration `ax` (wind).
 * Exact for any dt (including negative), so sim step size never changes a trajectory
 * and `predict.ts` agrees with the sim to floating-point precision.
 */
export function advanceBallistic(s: Kin, dt: number, gravity: number, drag: number, ax = 0): Kin {
  if (drag < 1e-9) {
    return {
      x: s.x + s.vx * dt + 0.5 * ax * dt * dt,
      y: s.y + s.vy * dt - 0.5 * gravity * dt * dt,
      vx: s.vx + ax * dt,
      vy: s.vy - gravity * dt,
    };
  }
  const e = Math.exp(-drag * dt);
  const f = (1 - e) / drag;
  const vTerm = -gravity / drag;
  const uTerm = ax / drag;
  return {
    x: s.x + uTerm * dt + (s.vx - uTerm) * f,
    y: s.y + vTerm * dt + (s.vy - vTerm) * f,
    vx: uTerm + (s.vx - uTerm) * e,
    vy: vTerm + (s.vy - vTerm) * e,
  };
}

const breakCache = new WeakMap<readonly Gust[], number[]>();

function breaks(gusts: readonly Gust[]): number[] {
  let b = breakCache.get(gusts);
  if (!b) {
    b = [...new Set(gusts.flatMap((g) => [g.start, g.end]))].sort((p, q) => p - q);
    breakCache.set(gusts, b);
  }
  return b;
}

/** Wind acceleration at sim time `t` (0 outside every gust). */
export function windAt(gusts: readonly Gust[], t: number): number {
  for (const g of gusts) if (t >= g.start && t < g.end) return g.ax;
  return 0;
}

/**
 * `advanceBallistic` through a piecewise-constant wind: the interval from absolute time `t` to
 * `t + dt` (either direction) is split at gust boundaries and each piece is closed-form, so the
 * result is exact and independent of how the interval is subdivided.
 */
export function advanceWithGusts(
  s: Kin,
  dt: number,
  t: number,
  gravity: number,
  drag: number,
  gusts: readonly Gust[],
): Kin {
  if (gusts.length === 0 || dt === 0) return advanceBallistic(s, dt, gravity, drag);
  const b = breaks(gusts);
  let cur = s;
  let tc = t;
  const tEnd = t + dt;
  for (let guard = 0; guard < 256; guard++) {
    if (dt > 0) {
      if (tEnd - tc <= 1e-12) break;
      const next = b.find((x) => x > tc + 1e-12);
      const segEnd = next !== undefined ? Math.min(next, tEnd) : tEnd;
      cur = advanceBallistic(cur, segEnd - tc, gravity, drag, windAt(gusts, (tc + segEnd) / 2));
      tc = segEnd;
    } else {
      if (tc - tEnd <= 1e-12) break;
      let prev: number | undefined;
      for (let i = b.length - 1; i >= 0; i--) {
        const x = b[i] as number;
        if (x < tc - 1e-12) {
          prev = x;
          break;
        }
      }
      const segEnd = prev !== undefined ? Math.max(prev, tEnd) : tEnd;
      cur = advanceBallistic(cur, segEnd - tc, gravity, drag, windAt(gusts, (tc + segEnd) / 2));
      tc = segEnd;
    }
  }
  return cur;
}
