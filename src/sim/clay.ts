import type { Vec2 } from '../core/vec2';
import { advanceBallistic, type Kin } from './ballistics';
import type { SimConfig } from './config';
import type { HouseId } from './houses';

export type ClayTypeId = 'standard';

/**
 * Clay behaviour as data. Later phases add types (splitter, armored, rabbit) by registering
 * another def: override `advance` for custom motion, and use `hitsToBreak` / hooks in World.
 */
export interface ClayTypeDef {
  id: ClayTypeId;
  label: string;
  radiusScale: number;
  hitsToBreak: number;
  fill: number;
  rim: number;
  /** Motion integrator. Must be a pure function of (state, dt) so predict.ts can reuse it. */
  advance(s: Kin, dt: number, cfg: SimConfig): Kin;
}

export const CLAY_TYPES: Record<ClayTypeId, ClayTypeDef> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    radiusScale: 1,
    hitsToBreak: 1,
    fill: 0xff8a3d,
    rim: 0xfff0c8,
    advance: (s, dt, cfg) => advanceBallistic(s, dt, cfg.gravity, cfg.drag),
  },
};

export type ClayStatus = 'live' | 'broken' | 'escaped';

export interface Clay extends Kin {
  id: number;
  type: ClayTypeId;
  house: HouseId;
  throwIndex: number;
  /** Sim time of launch. */
  launchTime: number;
  age: number;
  status: ClayStatus;
  hitsLeft: number;
}

export const clayPos = (c: Kin): Vec2 => ({ x: c.x, y: c.y });
export const clayVel = (c: Kin): Vec2 => ({ x: c.vx, y: c.vy });

export function clayRadius(type: ClayTypeId, cfg: SimConfig): number {
  return cfg.clayRadius * CLAY_TYPES[type].radiusScale;
}

/** Kinematic state of a clay `dt` seconds from its current state (dt may be negative). */
export function advanceClay(
  c: Pick<Clay, 'type' | 'x' | 'y' | 'vx' | 'vy'>,
  dt: number,
  cfg: SimConfig,
): Kin {
  return CLAY_TYPES[c.type].advance({ x: c.x, y: c.y, vx: c.vx, vy: c.vy }, dt, cfg);
}
