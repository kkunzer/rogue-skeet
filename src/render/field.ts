import { Container, Graphics } from 'pixi.js';
import { CLAY_TYPES, clayRadius } from '../sim/clay';
import type { SimConfig } from '../sim/config';
import { GUN_BARREL, GUN_BASE } from '../sim/field';
import { clayPositionAt } from '../sim/predict';
import { effectivePatternRadius } from '../sim/shot';
import type { World } from '../sim/world';
import type { SchemeView } from '../input/scheme';

interface Fx {
  x: number;
  y: number;
  r: number;
  t: number;
  kind: 'burst-hit' | 'burst-miss' | 'break';
}

const FX_LIFE = 0.3;

/**
 * Greybox renderer for the live sim: flat clay discs, shot lines, burst rings, reticle, barrel pips.
 * Lives in the y-up world layer and is redrawn each frame from sim state, interpolated by `alpha`.
 * Phase 2 hangs VFX off the same World events (`burst`, `break`) instead of this class.
 */
export class FieldView {
  readonly root = new Container();
  private g = new Graphics();
  private world: World | null = null;
  private offs: (() => void)[] = [];
  private fx: Fx[] = [];
  /** Flat expanding ring on each break. The juice layer replaces it with the real flash. */
  breakRing = true;

  constructor(private readonly cfg: SimConfig) {
    this.root.addChild(this.g);
  }

  setWorld(world: World | null): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.fx = [];
    this.world = world;
    if (!world) return;
    this.offs.push(
      world.events.on('burst', (b) => {
        this.fx.push({
          x: b.shot.aim.x,
          y: b.shot.aim.y,
          r: effectivePatternRadius(this.cfg),
          t: b.t,
          kind: b.hit ? 'burst-hit' : 'burst-miss',
        });
      }),
      world.events.on('break', ({ clay, t }) => {
        if (!this.breakRing) return;
        this.fx.push({
          x: clay.x,
          y: clay.y,
          r: clayRadius(clay.type, this.cfg),
          t,
          kind: 'break',
        });
      }),
    );
  }

  render(alpha: number, dt: number, view: SchemeView, ghostTrail: boolean): void {
    const g = this.g;
    g.clear();
    const w = this.world;
    if (!w) return;
    const sub = alpha * dt;
    const now = w.time + sub;

    // ghost trail
    if (ghostTrail) {
      for (const c of w.clays) {
        const def = CLAY_TYPES[c.type];
        const r = clayRadius(c.type, this.cfg);
        for (let k = 1; k <= 7; k++) {
          const back = k * 0.035;
          if (c.age + sub - back < 0) break;
          const p = clayPositionAt(this.cfg, c, sub - back);
          g.circle(p.x, p.y, r * (1 - k * 0.1)).fill({
            color: def.fill,
            alpha: 0.45 * (1 - k / 8),
          });
        }
      }
    }

    // clays: flat disc with a bright rim
    for (const c of w.clays) {
      const def = CLAY_TYPES[c.type];
      const r = clayRadius(c.type, this.cfg);
      const p = clayPositionAt(this.cfg, c, sub);
      g.circle(p.x, p.y, r).fill(def.fill).stroke({ width: 0.5, color: def.rim });
    }

    // shots in flight: line from the muzzle to the head, target marker at the aim point
    for (const s of w.shots) {
      const span = Math.max(1e-6, s.arriveTime - s.fireTime);
      const p = Math.min(1, Math.max(0, (now - s.fireTime) / span));
      const hx = s.origin.x + (s.aim.x - s.origin.x) * p;
      const hy = s.origin.y + (s.aim.y - s.origin.y) * p;
      g.moveTo(s.origin.x, s.origin.y)
        .lineTo(hx, hy)
        .stroke({ width: 0.35, color: 0xffffff, alpha: 0.7 });
      g.circle(hx, hy, 0.8).fill(0xffffff);
      g.circle(s.aim.x, s.aim.y, effectivePatternRadius(this.cfg)).stroke({
        width: 0.25,
        color: 0xffffff,
        alpha: 0.35,
      });
    }

    // burst / break rings
    this.fx = this.fx.filter((f) => now - f.t < FX_LIFE);
    for (const f of this.fx) {
      const u = (now - f.t) / FX_LIFE;
      const color =
        f.kind === 'burst-hit' ? 0x7be08a : f.kind === 'burst-miss' ? 0xff6b6b : 0xffd27a;
      const r = f.kind === 'break' ? f.r * (1.2 + u * 2.2) : f.r * (0.6 + u * 0.5);
      g.circle(f.x, f.y, r).stroke({ width: 0.6, color, alpha: 1 - u });
    }

    // scheme overlay: swipe trail and reticle
    if (view.trail && view.trail.length > 1) {
      const [first, ...rest] = view.trail;
      if (first) {
        g.moveTo(first.x, first.y);
        for (const p of rest) g.lineTo(p.x, p.y);
        g.stroke({ width: 0.6, color: 0xbfd7ff, alpha: 0.6 });
      }
    }
    if (view.reticle) {
      const { pos, held } = view.reticle;
      const a = held ? 0.95 : 0.4;
      const r = effectivePatternRadius(this.cfg);
      g.circle(pos.x, pos.y, r).stroke({ width: 0.4, color: 0xffd27a, alpha: a });
      g.moveTo(pos.x - r * 1.5, pos.y).lineTo(pos.x + r * 1.5, pos.y);
      g.moveTo(pos.x, pos.y - r * 1.5).lineTo(pos.x, pos.y + r * 1.5);
      g.stroke({ width: 0.3, color: 0xffd27a, alpha: a });
    }

    // barrel pips on the gun tips: filled = loaded
    const loaded = w.gun.loaded;
    const n = this.cfg.barrels;
    for (let i = 0; i < Math.min(n, 2); i++) {
      const bx = GUN_BASE.x + (i === 0 ? -1.1 : 1.1);
      g.rect(bx - 0.7, GUN_BASE.y + GUN_BARREL - 1.6, 1.4, 1.6).fill(
        i < loaded ? 0xffd27a : 0x374151,
      );
    }
  }

  destroy(): void {
    this.setWorld(null);
    this.root.destroy({ children: true });
  }
}
