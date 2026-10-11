import type { Vec2 } from '../core/vec2';
import type { Clay } from './clay';
import type { Shot } from './shot';
import type { World } from './world';

/** Where a break came from. Cascade effects (explosions, chains) carry the point they spread from. */
export interface BreakCause {
  kind: 'shot' | 'explosion' | 'chain';
  /** 0 for the pattern itself, +1 for each cascade level. World stops hooks past MAX_CASCADE_DEPTH. */
  depth: number;
  /** Chain link number (1-based) for `chain`, else 0. */
  link: number;
  /** Source point of a cascade break (explosion centre, previous chain link). */
  from: Vec2 | null;
}

/** Pattern properties of a shot, modifiable per shot by `modifyPattern`. */
export interface Pattern {
  /** Pattern radius, world units. */
  radius: number;
  /** Hits dealt to each clay in the pattern. */
  damage: number;
}

/** A clay inside the pattern at burst time, before damage is applied. `damage` is mutable. */
export interface HitInfo {
  clay: Clay;
  shot: Shot;
  dist: number;
  perfect: boolean;
  damage: number;
}

export interface BreakInfo {
  clay: Clay;
  shot: Shot;
  cause: BreakCause;
  /** Where the clay was when it broke. */
  pos: Vec2;
  dist: number;
  perfect: boolean;
}

/**
 * Sim-level extension points, all optional. They run inside `World.resolve` (and `fire`), see only
 * sim state and are pure functions of it, so a run stays deterministic. Presentation reacts to the
 * events the world emits, never to the hooks themselves.
 */
export interface SimHooks {
  modifyPattern?(p: Pattern): Pattern;
  onShotFired?(shot: Shot, world: World): void;
  onClayHit?(hit: HitInfo, world: World): void;
  onClayBroken?(info: BreakInfo, world: World): void;
}

/** Hard stop for cascades, in case an upgrade combination ever loops. */
export const MAX_CASCADE_DEPTH = 8;

/** Combine several hook sets: modifyPattern chains in order, the others all run in order. */
export function composeHooks(list: readonly SimHooks[]): SimHooks {
  return {
    modifyPattern: (p) =>
      list.reduce((acc, h) => (h.modifyPattern ? h.modifyPattern(acc) : acc), p),
    onShotFired: (s, w) => list.forEach((h) => h.onShotFired?.(s, w)),
    onClayHit: (hit, w) => list.forEach((h) => h.onClayHit?.(hit, w)),
    onClayBroken: (info, w) => list.forEach((h) => h.onClayBroken?.(info, w)),
  };
}
