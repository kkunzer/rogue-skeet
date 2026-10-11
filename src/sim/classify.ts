import type { Vec2 } from '../core/vec2';

export type MissReason = 'ahead' | 'behind' | 'high' | 'low';
export const MISS_REASONS: readonly MissReason[] = ['ahead', 'behind', 'high', 'low'];

export interface MissClass {
  reason: MissReason;
  /** Offset component along the clay's velocity (+ = aim ahead of the clay). */
  along: number;
  /** Offset component across the velocity, positive = above the flight line. */
  across: number;
}

/**
 * Decompose offset = aim - clayPosition into components along and across the clay's velocity,
 * then label the larger one: ahead / behind (along) or high / low (across).
 */
export function classifyMiss(offset: Vec2, vel: Vec2): MissClass {
  const speed = Math.hypot(vel.x, vel.y);
  const ux = speed < 1e-9 ? 1 : vel.x / speed;
  const uy = speed < 1e-9 ? 0 : vel.y / speed;
  // Perpendicular chosen to point upward, so "across > 0" always means above the flight line.
  let px = -uy;
  let py = ux;
  if (py < 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const along = offset.x * ux + offset.y * uy;
  const across = offset.x * px + offset.y * py;
  const reason: MissReason =
    Math.abs(along) >= Math.abs(across)
      ? along >= 0
        ? 'ahead'
        : 'behind'
      : across >= 0
        ? 'high'
        : 'low';
  return { reason, along, across };
}
