/** Kinematic state of a flying body. y is up. */
export interface Kin {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Closed-form motion under gravity and linear drag (dv/dt = -k v - g ŷ).
 * Exact for any dt (including negative), so sim step size never changes a trajectory
 * and `predict.ts` agrees with the sim to floating-point precision.
 */
export function advanceBallistic(s: Kin, dt: number, gravity: number, drag: number): Kin {
  if (drag < 1e-9) {
    return {
      x: s.x + s.vx * dt,
      y: s.y + s.vy * dt - 0.5 * gravity * dt * dt,
      vx: s.vx,
      vy: s.vy - gravity * dt,
    };
  }
  const e = Math.exp(-drag * dt);
  const f = (1 - e) / drag;
  const vTerm = -gravity / drag;
  return {
    x: s.x + s.vx * f,
    y: s.y + vTerm * dt + (s.vy - vTerm) * f,
    vx: s.vx * e,
    vy: vTerm + (s.vy - vTerm) * e,
  };
}
