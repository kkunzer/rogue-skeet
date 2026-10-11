import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '../core/vec2';
import { CLAY_TYPES, clayRadius, type Clay, type ClayTypeDef } from '../sim/clay';
import type { SimConfig } from '../sim/config';
import { GROUND_H, GUN_BARREL, GUN_BASE, WORLD_H, WORLD_W } from '../sim/field';
import { clayPositionAt } from '../sim/predict';
import { effectivePatternRadius } from '../sim/shot';
import type { World } from '../sim/world';
import type { SchemeView } from '../input/scheme';

interface Fx {
  x: number;
  y: number;
  r: number;
  t: number;
  kind: 'burst-hit' | 'burst-miss' | 'break' | 'blast';
}

interface Arc {
  from: Vec2;
  to: Vec2;
  t: number;
  link: number;
}

const FX_LIFE = 0.3;
const ARC_LIFE = 0.28;
const WIND_TELEGRAPH_FALLBACK = 0.5;

/** Cheap deterministic hash to [0,1) for cosmetic jitter (never touches the sim). */
const h01 = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Greybox renderer for the live sim: flat clay shapes, shot lines, burst rings, reticle, barrel pips,
 * and the run-mode extras (cracked armor, wind streaks, chain arcs, trajectory preview). Lives in
 * the y-up world layer and is redrawn each frame from sim state, interpolated by `alpha`. The VFX
 * layer hangs off the same World events (`burst`, `break`) instead of this class.
 */
export class FieldView {
  readonly root = new Container();
  private g = new Graphics();
  private world: World | null = null;
  private offs: (() => void)[] = [];
  private fx: Fx[] = [];
  private arcs: Arc[] = [];
  /** Flat expanding ring on each break. The juice layer replaces it with the real flash. */
  breakRing = true;
  /** Which clays show the faint trajectory preview (run mode, after picking a physics mod). */
  previewFilter: ((c: Clay) => boolean) | null = null;
  /** Gust telegraph lead in seconds (set by run mode from tuning). */
  windTelegraph = WIND_TELEGRAPH_FALLBACK;

  constructor(private cfg: SimConfig) {
    this.root.addChild(this.g);
  }

  setWorld(world: World | null): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.fx = [];
    this.arcs = [];
    this.world = world;
    if (!world) return;
    // positions are interpolated with the world's own config (gravity, wind), not the global one
    this.cfg = world.cfg;
    this.offs.push(
      world.events.on('burst', (b) => {
        this.fx.push({
          x: b.shot.aim.x,
          y: b.shot.aim.y,
          r: b.shot.radius,
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
      world.events.on('explosion', ({ x, y, radius, t }) => {
        if (this.breakRing) this.fx.push({ x, y, r: radius, t, kind: 'blast' });
      }),
      world.events.on('chain', ({ from, to, link, t }) => this.arcs.push({ from, to, t, link })),
    );
  }

  /** Pattern radius a shot fired now would have (after upgrades). */
  private patternRadius(): number {
    const base = effectivePatternRadius(this.cfg);
    const hook = this.world?.hooks.modifyPattern;
    return hook ? hook({ radius: base, damage: 1 }).radius : base;
  }

  render(alpha: number, dt: number, view: SchemeView, ghostTrail: boolean): void {
    const g = this.g;
    g.clear();
    const w = this.world;
    if (!w) return;
    const sub = alpha * dt;
    const now = w.time + sub;

    this.drawWind(g, w, now);

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

    // faint predicted paths (after a physics mod pick)
    if (this.previewFilter) {
      for (const c of w.clays) {
        if (!this.previewFilter(c)) continue;
        for (let k = 1; k <= 22; k++) {
          const p = clayPositionAt(this.cfg, c, sub + k * 0.11);
          if (p.x < -4 || p.x > WORLD_W + 4 || p.y < GROUND_H - 1 || p.y > WORLD_H + 10) break;
          g.circle(p.x, p.y, 0.45).fill({ color: 0xffffff, alpha: 0.32 * (1 - k / 26) });
        }
      }
    }

    // clays
    for (const c of w.clays) {
      const p = clayPositionAt(this.cfg, c, sub);
      this.drawClay(g, c, p, now);
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
      g.circle(s.aim.x, s.aim.y, s.radius).stroke({
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
        f.kind === 'burst-hit'
          ? 0x7be08a
          : f.kind === 'burst-miss'
            ? 0xff6b6b
            : f.kind === 'blast'
              ? 0xffb454
              : 0xffd27a;
      const r =
        f.kind === 'break'
          ? f.r * (1.2 + u * 2.2)
          : f.kind === 'blast'
            ? f.r * (0.3 + u * 0.7)
            : f.r * (0.6 + u * 0.5);
      g.circle(f.x, f.y, r).stroke({ width: 0.6, color, alpha: 1 - u });
    }

    // chain arcs: a jagged bolt between clays that fades fast (always shown: it is gameplay info)
    this.arcs = this.arcs.filter((a) => now - a.t < ARC_LIFE);
    for (const a of this.arcs) this.drawArc(g, a, now);

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
      const r = this.patternRadius();
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

  /** Streaks for gusts: faint and still while telegraphed, brighter and sweeping while active. */
  private drawWind(g: Graphics, w: World, now: number): void {
    const gusts = w.cfg.gusts;
    if (gusts.length === 0) return;
    const lead = this.windTelegraph;
    for (let gi = 0; gi < gusts.length; gi++) {
      const gu = gusts[gi];
      if (!gu || now < gu.start - lead || now >= gu.end) continue;
      const dir = gu.ax >= 0 ? 1 : -1;
      const warn = now < gu.start;
      const fade = warn
        ? 0.12 + 0.28 * (1 - (gu.start - now) / lead)
        : Math.min(0.5, 0.5 * ((gu.end - now) / 0.3));
      const slide = warn ? 0 : (now - gu.start) * 55 * dir;
      for (let i = 0; i < 11; i++) {
        const y = GROUND_H + 14 + h01(gi + 1, i) * (WORLD_H - GROUND_H - 30);
        const len = 9 + h01(i, gi + 3) * 9;
        let x = h01(i + 7, gi) * WORLD_W + slide;
        x = ((x % (WORLD_W + len)) + WORLD_W + len) % (WORLD_W + len);
        g.moveTo(x, y)
          .lineTo(x - dir * len, y)
          .stroke({ width: 0.45, color: 0xcfeaff, alpha: fade });
        // arrow head so the direction reads
        g.moveTo(x - dir * 1.6, y + 1.1)
          .lineTo(x, y)
          .lineTo(x - dir * 1.6, y - 1.1)
          .stroke({ width: 0.35, color: 0xcfeaff, alpha: fade });
      }
    }
  }

  private drawArc(g: Graphics, a: Arc, now: number): void {
    const u = (now - a.t) / ARC_LIFE;
    const n = 7;
    const dx = a.to.x - a.from.x;
    const dy = a.to.y - a.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const j = i === 0 || i === n ? 0 : (h01(a.link * 3.1 + i, a.t * 50) - 0.5) * 4.5;
      pts.push({ x: a.from.x + dx * f + nx * j, y: a.from.y + dy * f + ny * j });
    }
    for (const [width, alpha, color] of [
      [1.6, 0.25 * (1 - u), 0x5ec8ff],
      [0.55, 1 - u, 0xe8fbff],
    ] as const) {
      const first = pts[0] as Vec2;
      g.moveTo(first.x, first.y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width, color, alpha });
    }
  }

  /** One clay: a distinct silhouette per type with a bright rim; armored shows cracks after its first hit. */
  private drawClay(g: Graphics, c: Clay, p: Vec2, now: number): void {
    const def: ClayTypeDef = CLAY_TYPES[c.type];
    const r = clayRadius(c.type, this.cfg);
    const spin = (now - c.launchTime) * (c.id % 2 === 0 ? 5 : -5);
    switch (def.shape) {
      case 'disc':
        g.circle(p.x, p.y, r).fill(def.fill).stroke({ width: 0.5, color: def.rim });
        break;
      case 'split': {
        g.circle(p.x, p.y, r).fill(def.fill).stroke({ width: 0.5, color: def.rim });
        const ca = Math.cos(spin);
        const sa = Math.sin(spin);
        g.moveTo(p.x - ca * r, p.y - sa * r)
          .lineTo(p.x + ca * r, p.y + sa * r)
          .stroke({ width: 0.55, color: 0x3a0a55 });
        break;
      }
      case 'half': {
        g.moveTo(p.x, p.y)
          .arc(p.x, p.y, r, spin, spin + Math.PI)
          .closePath()
          .fill(def.fill)
          .stroke({ width: 0.4, color: def.rim });
        break;
      }
      case 'hex': {
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          pts.push(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        }
        g.poly(pts)
          .fill(c.cracked ? 0xb0b9c8 : def.fill)
          .stroke({ width: 0.85, color: c.cracked ? 0xffb46b : def.rim });
        g.circle(p.x, p.y, r * 0.38).stroke({ width: 0.3, color: 0x2e3b55 });
        if (c.cracked) {
          for (const [a0, a1, k] of [
            [-0.3, 0.9, 0],
            [2.2, 3.4, 1],
            [4.2, 5.1, 2],
          ] as const) {
            const mx = p.x + Math.cos((a0 + a1) / 2) * r * 0.45 + (k - 1) * 0.35;
            const my = p.y + Math.sin((a0 + a1) / 2) * r * 0.45;
            g.moveTo(p.x, p.y)
              .lineTo(mx, my)
              .lineTo(p.x + Math.cos(a1) * r * 0.95, p.y + Math.sin(a1) * r * 0.95)
              .stroke({ width: 0.4, color: 0x1a2233 });
          }
        }
        break;
      }
      case 'oval': {
        const dir = c.vx >= 0 ? 1 : -1;
        const ry = r * 0.78;
        g.ellipse(p.x, p.y, r * 1.35, ry)
          .fill(def.fill)
          .stroke({ width: 0.5, color: def.rim });
        // ears and a tail so it reads as a rabbit, not a squashed disc
        g.ellipse(p.x + dir * r * 0.85, p.y + ry * 0.95, r * 0.28, r * 0.6).fill(def.rim);
        g.circle(p.x - dir * r * 1.3, p.y + 0.1, r * 0.3).fill(def.rim);
        break;
      }
    }
  }

  destroy(): void {
    this.setWorld(null);
    this.root.destroy({ children: true });
  }
}
