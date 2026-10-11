import { GROUND_H, WORLD_W } from './field';
import type { Kin } from './ballistics';
import type { Vec2 } from '../core/vec2';

/** The two houses of the control test and sandbox. */
export type BaseHouseId = 'high' | 'low';
/** `center` is the trench house in the middle of the field (run mode boss flurry). */
export type HouseId = BaseHouseId | 'center';

export interface House {
  id: HouseId;
  /** Left edge, width and height of the building (world units). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Launch port position. */
  port: Vec2;
  /** Horizontal launch direction: +1 throws to the right, -1 to the left. */
  dir: 1 | -1;
}

const HOUSE_W = 13;
const HIGH_H = 36;
const LOW_H = 18;

/** High house on the left (higher), low house on the right (lower). Clays cross the sky. */
export const HOUSES: Record<HouseId, House> = {
  high: {
    id: 'high',
    x: 0,
    y: GROUND_H,
    w: HOUSE_W,
    h: HIGH_H,
    port: { x: HOUSE_W, y: GROUND_H + HIGH_H - 4 },
    dir: 1,
  },
  low: {
    id: 'low',
    x: WORLD_W - HOUSE_W,
    y: GROUND_H,
    w: HOUSE_W,
    h: LOW_H,
    port: { x: WORLD_W - HOUSE_W, y: GROUND_H + LOW_H - 4 },
    dir: -1,
  },
  // Trench set into the ground left of the gun: throws clays almost straight up (angles past 90
  // degrees lean back toward the high house).
  center: {
    id: 'center',
    x: 28,
    y: GROUND_H,
    w: 10,
    h: 0,
    port: { x: 33, y: GROUND_H + 0.5 },
    dir: 1,
  },
};

/** Launch state from a house port at `speed` and `angleDeg` above horizontal, thrown across the field. */
export function launchKin(house: House, speed: number, angleDeg: number): Kin {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: house.port.x,
    y: house.port.y,
    vx: house.dir * speed * Math.cos(a),
    vy: speed * Math.sin(a),
  };
}
