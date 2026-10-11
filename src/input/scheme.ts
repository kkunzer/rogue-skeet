import type { Vec2 } from '../core/vec2';
import type { FireIntent } from '../sim/world';

export type SchemeId = 'tap' | 'drag' | 'flick';
export const SCHEME_IDS: readonly SchemeId[] = ['tap', 'drag', 'flick'];
export type Handedness = 'right' | 'left';

/** Input tunables (live: schemes read them through `cfg()` on every event). */
export interface InputConfig {
  handed: Handedness;
  /** Tap: vertical offset from the touch point to the aim point, world units (+ = above the finger). */
  tapOffsetY: number;
  /** Tap: draw a fading ghost trail behind clays so they stay readable under the finger. */
  ghostTrail: boolean;
  /** Drag: reticle offset from the thumb. X is mirrored for left-handed play. */
  reticleOffsetX: number;
  reticleOffsetY: number;
  /** Drag: a touch shorter than this with less movement than `dragSlop` is a quick tap. */
  quickTapMs: number;
  dragSlop: number;
  /** Flick: swipe speed (world units / s) mapped to burst distance (world units) through a curve. */
  flickMinSpeed: number;
  flickMaxSpeed: number;
  flickDistMin: number;
  flickDistMax: number;
  /** Curve exponent: 1 = linear, >1 = slower response at low speeds. */
  flickGamma: number;
  /** Swipe velocity is measured over this trailing window. */
  flickWindowMs: number;
  /** Swipes that travel less than this are ignored (treated as a tap, not a flick). */
  flickMinTravel: number;
}

export const defaultInputConfig: Readonly<InputConfig> = {
  handed: 'right',
  tapOffsetY: 0,
  ghostTrail: false,
  reticleOffsetX: 5,
  reticleOffsetY: 16,
  quickTapMs: 220,
  dragSlop: 1.5,
  flickMinSpeed: 60,
  flickMaxSpeed: 500,
  flickDistMin: 24,
  flickDistMax: 100,
  flickGamma: 1,
  flickWindowMs: 90,
  flickMinTravel: 3,
};

/** A pointer event in world space with a sim timestamp (seconds). */
export interface PointerEvt {
  type: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  pos: Vec2;
  t: number;
}

/** What a scheme draws on top of the field. */
export interface SchemeView {
  reticle?: { pos: Vec2; held: boolean };
  /** Recent swipe path, for the flick scheme. */
  trail?: Vec2[];
}

export interface SchemeEnv {
  cfg: () => InputConfig;
  emit: (intent: FireIntent) => void;
}

/** A gesture that makes a scheme aim at a point; events carry `t` relative to the firing event (t = 0). */
export interface Script {
  events: PointerEvt[];
}

export interface ControlScheme {
  readonly id: SchemeId;
  readonly label: string;
  readonly summary: string;
  readonly instructions: string;
  onPointer(e: PointerEvt): void;
  /** Forget any in-progress gesture and remembered state (new throw / mode / scheme switch). */
  reset(): void;
  view(): SchemeView;
  /** Whether the scheme can be made to aim at `aim` (flick has limited range). */
  canReach(aim: Vec2): boolean;
  /** Pointer events (world space) that make this scheme aim at `aim`. Used by bots and tests. */
  script(aim: Vec2): Script;
}

/** Reticle offset from the thumb, mirrored for left-handed players. */
export function reticleOffset(cfg: InputConfig): Vec2 {
  const side = cfg.handed === 'right' ? -1 : 1;
  return { x: side * cfg.reticleOffsetX, y: cfg.reticleOffsetY };
}
