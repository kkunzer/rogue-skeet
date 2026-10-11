import type { Vec2 } from '../core/vec2';
import { advanceWithGusts, type Kin } from './ballistics';
import type { SimConfig } from './config';
import { GROUND_H } from './field';
import type { House, HouseId } from './houses';
import { launchKin } from './houses';
import type { ClaySpec } from './throws';

export type ClayTypeId = 'standard' | 'splitter' | 'armored' | 'rabbit' | 'splitlet';

/** Shapes the greybox renderer draws (each clay type has a distinct silhouette). */
export type ClayShape = 'disc' | 'split' | 'hex' | 'oval' | 'half';

/** What a splitter leaves behind when it breaks. */
export interface SplitDef {
  type: ClayTypeId;
  count: number;
  /** Velocity added to each child perpendicular to the parent's, world units / s. */
  spread: number;
  /** Fraction of the parent's velocity the children keep. */
  keep: number;
}

/**
 * Clay behaviour as data. Register a type here: override `advance` for custom motion (a pure
 * function of state, dt and absolute time so predict.ts can reuse it), `launch` for a custom
 * start state, and use `hitsToBreak` / `splits` / `grounded` which World reads.
 */
export interface ClayTypeDef {
  id: ClayTypeId;
  label: string;
  radiusScale: number;
  hitsToBreak: number;
  fill: number;
  rim: number;
  shape: ClayShape;
  /** Rolls on the ground strip: never "falls", only escapes sideways. */
  grounded?: boolean;
  splits?: SplitDef;
  /** Motion integrator for `dt` seconds (either sign) from state `s`, which is at sim time `t`. */
  advance(s: Kin, dt: number, cfg: SimConfig, t: number): Kin;
  /** Custom launch state (default: ballistic launch from the house port). */
  launch?(house: House, spec: ClaySpec, cfg: SimConfig): Kin;
}

const flyer = (s: Kin, dt: number, cfg: SimConfig, t: number): Kin =>
  advanceWithGusts(s, dt, t, cfg.gravity, cfg.drag, cfg.gusts);

// ---- rabbit ------------------------------------------------------------------------------------

/** Rabbit physics. Ground is the top of the ground strip; bumps are laid out from the run seed. */
export const RABBIT = {
  gravity: 100,
  /** Fraction of the impact speed kept on each bounce. */
  restitution: 0.5,
  /** Bounces slower than this just roll. */
  minBounce: 7,
  /** Average distance between bumps and the hop speed range they give. */
  spacing: 22,
  firstBump: 8,
  hopMin: 22,
  hopMax: 34,
};

/** Integer hash to [0,1). Pure and seedable. */
function hash01(seed: number, i: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(i + 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Bump i: x position (strictly increasing in i) and the hop speed it gives. */
export function rabbitBump(seed: number, i: number): { x: number; v: number } {
  return {
    x: RABBIT.firstBump + i * RABBIT.spacing + (hash01(seed, 2 * i) - 0.5) * RABBIT.spacing * 0.7,
    v: RABBIT.hopMin + hash01(seed, 2 * i + 1) * (RABBIT.hopMax - RABBIT.hopMin),
  };
}

function nextBump(seed: number, x: number, dir: 1 | -1): { x: number; v: number } | null {
  const i0 = Math.floor((x - RABBIT.firstBump) / RABBIT.spacing);
  if (dir > 0) {
    for (let i = Math.max(0, i0 - 1); i <= i0 + 4; i++) {
      const b = rabbitBump(seed, i);
      if (b.x > x + 1e-7) return b;
    }
    return null;
  }
  for (let i = i0 + 2; i >= 0; i--) {
    const b = rabbitBump(seed, i);
    if (b.x < x - 1e-7) return b;
  }
  return null;
}

/** Centre height of a rabbit rolling on the ground. */
export const rabbitBase = (cfg: SimConfig): number =>
  GROUND_H + cfg.clayRadius * CLAY_TYPES.rabbit.radiusScale;

/**
 * Rabbit motion, piecewise closed-form: roll at constant speed until the next bump, hop (parabola
 * under RABBIT.gravity), land, bounce with restitution until the bounce is too small, roll again.
 * Exactly composable: advance(advance(s, a), b) equals advance(s, a + b) up to rounding, so the
 * sim step size never changes a path and predictions are exact. Wind does not affect rabbits.
 */
export function advanceRabbit(s: Kin, dt: number, cfg: SimConfig): Kin {
  const base = rabbitBase(cfg);
  if (dt <= 0) {
    // Only used for cosmetic trails: rewind along the ground.
    return { x: s.x + s.vx * dt, y: Math.max(base, s.y), vx: s.vx, vy: s.vy };
  }
  const g = RABBIT.gravity;
  let { x, y, vy } = s;
  const vx = s.vx;
  const dir: 1 | -1 = vx >= 0 ? 1 : -1;
  let rem = dt;
  for (let guard = 0; guard < 128 && rem > 1e-12; guard++) {
    if (y > base + 1e-9 || vy > 0) {
      const disc = Math.max(0, vy * vy + 2 * g * (y - base));
      const tl = (vy + Math.sqrt(disc)) / g;
      if (tl > rem) {
        y += vy * rem - 0.5 * g * rem * rem;
        vy -= g * rem;
        x += vx * rem;
        rem = 0;
        break;
      }
      x += vx * tl;
      rem -= tl;
      y = base;
      const vb = Math.sqrt(disc) * RABBIT.restitution;
      vy = vb < RABBIT.minBounce ? 0 : vb;
    } else {
      y = base;
      vy = 0;
      const bump = Math.abs(vx) > 1e-9 ? nextBump(cfg.rabbitSeed, x, dir) : null;
      if (!bump) {
        x += vx * rem;
        rem = 0;
        break;
      }
      const tb = (bump.x - x) / vx;
      if (tb > rem) {
        x += vx * rem;
        rem = 0;
        break;
      }
      x = bump.x;
      rem -= tb;
      vy = bump.v;
    }
  }
  return { x, y, vx, vy };
}

// ---- registry ----------------------------------------------------------------------------------

export const CLAY_TYPES: Record<ClayTypeId, ClayTypeDef> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    radiusScale: 1,
    hitsToBreak: 1,
    fill: 0xff8a3d,
    rim: 0xfff0c8,
    shape: 'disc',
    advance: flyer,
  },
  splitter: {
    id: 'splitter',
    label: 'Splitter',
    radiusScale: 1.2,
    hitsToBreak: 1,
    fill: 0xd04cff,
    rim: 0xffe0ff,
    shape: 'split',
    splits: { type: 'splitlet', count: 2, spread: 20, keep: 0.9 },
    advance: flyer,
  },
  splitlet: {
    id: 'splitlet',
    label: 'Splitlet',
    radiusScale: 0.72,
    hitsToBreak: 1,
    fill: 0xe98bff,
    rim: 0xffffff,
    shape: 'half',
    advance: flyer,
  },
  armored: {
    id: 'armored',
    label: 'Armored',
    radiusScale: 1.25,
    hitsToBreak: 2,
    fill: 0x7d93b8,
    rim: 0xe6f0ff,
    shape: 'hex',
    advance: flyer,
  },
  rabbit: {
    id: 'rabbit',
    label: 'Rabbit',
    radiusScale: 1.1,
    hitsToBreak: 1,
    fill: 0x4fd18a,
    rim: 0xe0fff0,
    shape: 'oval',
    grounded: true,
    advance: (s, dt, cfg) => advanceRabbit(s, dt, cfg),
    launch: (house, spec, cfg) => ({
      x: house.port.x + house.dir * 0.5,
      y: rabbitBase(cfg),
      vx: house.dir * spec.speed,
      vy: 0,
    }),
  },
};

/** Types that fly through the sky (everything except rabbits). */
export const isGrounded = (type: ClayTypeId): boolean => CLAY_TYPES[type].grounded === true;

export type ClayStatus = 'live' | 'broken' | 'escaped';

export interface Clay extends Kin {
  id: number;
  type: ClayTypeId;
  house: HouseId;
  throwIndex: number;
  /** Sim time of launch (or of the world step that spawned it). */
  launchTime: number;
  age: number;
  status: ClayStatus;
  hitsLeft: number;
  /** An armored clay that has taken its first hit. */
  cracked: boolean;
}

export const clayPos = (c: Kin): Vec2 => ({ x: c.x, y: c.y });
export const clayVel = (c: Kin): Vec2 => ({ x: c.vx, y: c.vy });

export function clayRadius(type: ClayTypeId, cfg: SimConfig): number {
  return cfg.clayRadius * CLAY_TYPES[type].radiusScale;
}

/** State of a clay used for prediction: position and velocity, plus its clock if it has one. */
export type ClayState = Pick<Clay, 'type' | 'x' | 'y' | 'vx' | 'vy'> &
  Partial<Pick<Clay, 'launchTime' | 'age'>>;

/** Kinematic state of a clay `dt` seconds from its current state (dt may be negative). */
export function advanceClay(c: ClayState, dt: number, cfg: SimConfig): Kin {
  const t = (c.launchTime ?? 0) + (c.age ?? 0);
  return CLAY_TYPES[c.type].advance({ x: c.x, y: c.y, vx: c.vx, vy: c.vy }, dt, cfg, t);
}

/** Initial kinematic state of a clay launched from `house` per `spec`. */
export function launchState(house: House, spec: ClaySpec, cfg: SimConfig): Kin {
  const def = CLAY_TYPES[spec.type];
  if (def.launch) return def.launch(house, spec, cfg);
  return launchKin(house, spec.speed * cfg.launchSpeedMul, spec.angleDeg);
}
