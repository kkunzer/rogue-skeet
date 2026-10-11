import { GROUND_H, WORLD_W } from './field';
import type { Kin } from './ballistics';
import type { Vec2 } from '../core/vec2';

export type HouseId = 'high' | 'low';

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
