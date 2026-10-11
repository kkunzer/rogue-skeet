import { len, normalize, sub, type Vec2 } from '../core/vec2';
import { GUN_ORIGIN, clampAim } from '../sim/field';
import type {
  ControlScheme,
  InputConfig,
  PointerEvt,
  SchemeEnv,
  SchemeView,
  Script,
} from './scheme';

const MIN_ANGLE = (8 * Math.PI) / 180;
const MAX_ANGLE = Math.PI - MIN_ANGLE;

/** Burst distance for a swipe speed: clamped power curve between min/max speed and dist. */
export function flickDistance(cfg: InputConfig, speed: number): number {
  const span = Math.max(1e-6, cfg.flickMaxSpeed - cfg.flickMinSpeed);
  const u = Math.min(1, Math.max(0, (speed - cfg.flickMinSpeed) / span));
  return cfg.flickDistMin + (cfg.flickDistMax - cfg.flickDistMin) * Math.pow(u, cfg.flickGamma);
}

/** Inverse of `flickDistance`; null when `dist` is outside the curve's range. */
export function flickSpeedFor(cfg: InputConfig, dist: number): number | null {
  if (dist < cfg.flickDistMin - 1e-9 || dist > cfg.flickDistMax + 1e-9) return null;
  const frac = (dist - cfg.flickDistMin) / Math.max(1e-6, cfg.flickDistMax - cfg.flickDistMin);
  const u = Math.pow(Math.min(1, Math.max(0, frac)), 1 / cfg.flickGamma);
  return cfg.flickMinSpeed + u * (cfg.flickMaxSpeed - cfg.flickMinSpeed);
}

/** Aim point of a swipe with velocity `v` (world units / s): direction from the gun, speed -> distance. */
export function flickAim(cfg: InputConfig, v: Vec2): Vec2 {
  let angle = Math.atan2(v.y, v.x);
  // Downward swipes still shoot into the sky: clamp to just above horizontal.
  angle = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, angle));
  if (v.y <= 0) angle = v.x >= 0 ? MIN_ANGLE : MAX_ANGLE;
  const d = flickDistance(cfg, len(v));
  return clampAim({ x: GUN_ORIGIN.x + Math.cos(angle) * d, y: GUN_ORIGIN.y + Math.sin(angle) * d });
}

interface Sample {
  pos: Vec2;
  t: number;
}

/** Flick to fire: swipe direction is the angle from the gun, swipe speed sets burst distance. */
export class FlickScheme implements ControlScheme {
  readonly id = 'flick' as const;
  readonly label = 'Flick';
  readonly summary = 'Flick toward the target';
  readonly instructions =
    'Flick your thumb in the direction of the clay from the gun. A faster flick sends the shot farther away; a slower flick lands it closer. The shot fires when you lift.';
  private active: { id: number; samples: Sample[] } | null = null;

  constructor(private readonly env: SchemeEnv) {}

  onPointer(e: PointerEvt): void {
    const a = this.active;
    if (e.type === 'down') {
      if (!a) this.active = { id: e.id, samples: [{ pos: e.pos, t: e.t }] };
      return;
    }
    if (!a || a.id !== e.id) return;
    if (e.type === 'move') {
      a.samples.push({ pos: e.pos, t: e.t });
    } else if (e.type === 'cancel') {
      this.active = null;
    } else if (e.type === 'up') {
      a.samples.push({ pos: e.pos, t: e.t });
      this.active = null;
      const cfg = this.env.cfg();
      const v = this.velocity(a.samples, cfg);
      if (!v) return;
      this.env.emit({ aim: flickAim(cfg, v), t: e.t });
    }
  }

  /** Swipe velocity over the trailing window; null if the swipe was too short to count. */
  private velocity(samples: Sample[], cfg: InputConfig): Vec2 | null {
    const last = samples[samples.length - 1];
    const first0 = samples[0];
    if (!last || !first0) return null;
    if (len(sub(last.pos, first0.pos)) < cfg.flickMinTravel) return null;
    const cutoff = last.t - cfg.flickWindowMs / 1000;
    let first = last;
    for (const s of samples) {
      if (s.t >= cutoff - 1e-9) {
        first = s;
        break;
      }
    }
    if (first === last) first = samples[samples.length - 2] ?? first0;
    const dt = Math.max(0.008, last.t - first.t);
    return { x: (last.pos.x - first.pos.x) / dt, y: (last.pos.y - first.pos.y) / dt };
  }

  reset(): void {
    this.active = null;
  }

  view(): SchemeView {
    return this.active ? { trail: this.active.samples.map((s) => s.pos) } : {};
  }

  canReach(aim: Vec2): boolean {
    const rel = sub(aim, GUN_ORIGIN);
    const ang = Math.atan2(rel.y, rel.x);
    return flickSpeedFor(this.env.cfg(), len(rel)) !== null && ang >= MIN_ANGLE && ang <= MAX_ANGLE;
  }

  script(aim: Vec2): Script {
    const cfg = this.env.cfg();
    const rel = sub(aim, GUN_ORIGIN);
    const dir = normalize(rel);
    const speed = flickSpeedFor(cfg, len(rel)) ?? cfg.flickMaxSpeed;
    const travel = speed * 0.06;
    const end = { x: aim.x, y: aim.y };
    const mid = { x: end.x - dir.x * travel * 0.5, y: end.y - dir.y * travel * 0.5 };
    const start = { x: end.x - dir.x * travel, y: end.y - dir.y * travel };
    return {
      events: [
        { type: 'down', id: 1, pos: start, t: -0.06 },
        { type: 'move', id: 1, pos: mid, t: -0.03 },
        { type: 'up', id: 1, pos: end, t: 0 },
      ],
    };
  }
}
