import type { Vec2 } from '../core/vec2';

/** Fixed gameplay playfield in world units (y up, origin bottom-left). */
export const WORLD_W = 90;
export const WORLD_H = 160;
/** Height of the ground strip at the bottom of the playfield. */
export const GROUND_H = 12;
/** Gun barrel length; the shot leaves from the muzzle. */
export const GUN_BARREL = 9;
/** Gun base position (bottom center, on the ground strip). */
export const GUN_BASE: Vec2 = { x: WORLD_W / 2, y: GROUND_H };
/** Where shots leave the gun. */
export const GUN_ORIGIN: Vec2 = { x: WORLD_W / 2, y: GROUND_H + GUN_BARREL };

/** Keep an aim point inside the playfield, above the ground strip. */
export function clampAim(p: Vec2): Vec2 {
  return {
    x: Math.min(WORLD_W - 1, Math.max(1, p.x)),
    y: Math.min(WORLD_H - 2, Math.max(GROUND_H + 2, p.y)),
  };
}
