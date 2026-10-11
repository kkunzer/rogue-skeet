import { dist, type Vec2 } from '../core/vec2';
import { clampAim } from '../sim/field';
import {
  reticleOffset,
  type ControlScheme,
  type PointerEvt,
  type SchemeEnv,
  type SchemeView,
  type Script,
} from './scheme';

/**
 * Drag reticle, lift to fire. The reticle sits offset from the thumb (above it, mirrored for
 * left-handed play) and follows 1:1; lifting fires. A quick tap with no drag re-fires at the last
 * reticle position (the second barrel); with no previous reticle it fires at the offset position.
 */
export class DragScheme implements ControlScheme {
  readonly id = 'drag' as const;
  readonly label = 'Drag';
  readonly summary = 'Drag the reticle, lift to fire';
  readonly instructions =
    'Touch and drag: a reticle floats above your thumb. Slide it to where the clay will be, then lift your finger to fire. A quick tap fires the second barrel at the last reticle spot.';
  private active: { id: number; startPos: Vec2; startT: number; pos: Vec2; moved: number } | null =
    null;
  private lastReticle: Vec2 | null = null;

  constructor(private readonly env: SchemeEnv) {}

  private reticleFor(pos: Vec2): Vec2 {
    const o = reticleOffset(this.env.cfg());
    return clampAim({ x: pos.x + o.x, y: pos.y + o.y });
  }

  onPointer(e: PointerEvt): void {
    const a = this.active;
    if (e.type === 'down') {
      if (a) return; // one finger at a time
      this.active = { id: e.id, startPos: e.pos, startT: e.t, pos: e.pos, moved: 0 };
      return;
    }
    if (!a || a.id !== e.id) return;
    if (e.type === 'move') {
      a.pos = e.pos;
      a.moved = Math.max(a.moved, dist(e.pos, a.startPos));
    } else if (e.type === 'cancel') {
      this.active = null;
    } else if (e.type === 'up') {
      a.pos = e.pos;
      a.moved = Math.max(a.moved, dist(e.pos, a.startPos));
      const cfg = this.env.cfg();
      const quick = (e.t - a.startT) * 1000 < cfg.quickTapMs && a.moved < cfg.dragSlop;
      const aim = quick && this.lastReticle ? this.lastReticle : this.reticleFor(e.pos);
      this.lastReticle = aim;
      this.active = null;
      this.env.emit({ aim, t: e.t });
    }
  }

  reset(): void {
    this.active = null;
    this.lastReticle = null;
  }

  view(): SchemeView {
    if (this.active) return { reticle: { pos: this.reticleFor(this.active.pos), held: true } };
    if (this.lastReticle) return { reticle: { pos: this.lastReticle, held: false } };
    return {};
  }

  canReach(): boolean {
    return true;
  }

  script(aim: Vec2): Script {
    const o = reticleOffset(this.env.cfg());
    const end = { x: aim.x - o.x, y: aim.y - o.y };
    const start = { x: end.x + 6, y: end.y - 6 };
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return {
      events: [
        { type: 'down', id: 1, pos: start, t: -0.3 },
        { type: 'move', id: 1, pos: mid, t: -0.15 },
        { type: 'move', id: 1, pos: end, t: -0.04 },
        { type: 'up', id: 1, pos: end, t: 0 },
      ],
    };
  }
}
