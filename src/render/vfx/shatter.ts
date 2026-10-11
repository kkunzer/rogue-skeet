import type { Rng } from '../../core/rng';
import type { JuiceTuning } from '../../feel/tuning';

/**
 * Pure shatter planning: slicing a clay disc into convex shards, shard velocities, debris colour
 * and fade curves, hit quality. No Pixi, no sim state, so it is unit-testable and reusable by any
 * future clay type or explosion. `render/vfx/particles.ts` turns a `ShatterPlan` into pixels.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Shard {
  /** Flat [x0,y0,x1,y1,...] polygon relative to the shard's own centroid. */
  poly: number[];
  /** Centroid relative to the clay centre. */
  cx: number;
  cy: number;
  area: number;
}

/** Signed-area magnitude of a flat polygon. */
export function polyArea(flat: readonly number[]): number {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += (flat[i * 2] ?? 0) * (flat[j * 2 + 1] ?? 0) - (flat[j * 2] ?? 0) * (flat[i * 2 + 1] ?? 0);
  }
  return Math.abs(a) / 2;
}

/** True when every turn has the same sign (collinear points allowed). */
export function isConvex(flat: readonly number[]): boolean {
  const n = flat.length / 2;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = i,
      b = (i + 1) % n,
      c = (i + 2) % n;
    const cross =
      ((flat[b * 2] ?? 0) - (flat[a * 2] ?? 0)) *
        ((flat[c * 2 + 1] ?? 0) - (flat[b * 2 + 1] ?? 0)) -
      ((flat[b * 2 + 1] ?? 0) - (flat[a * 2 + 1] ?? 0)) * ((flat[c * 2] ?? 0) - (flat[b * 2] ?? 0));
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

const ARC_STEP = Math.PI / 12; // 15 degrees per arc segment: polygon area within ~1.1% of the disc

function centroidOf(flat: number[]): { cx: number; cy: number; area: number } {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = flat[i * 2] ?? 0,
      y0 = flat[i * 2 + 1] ?? 0,
      x1 = flat[j * 2] ?? 0,
      y1 = flat[j * 2 + 1] ?? 0;
    const f = x0 * y1 - x1 * y0;
    a2 += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a2) < 1e-12) return { cx: 0, cy: 0, area: 0 };
  return { cx: cx / (3 * a2), cy: cy / (3 * a2), area: Math.abs(a2) / 2 };
}

/**
 * Slice a disc of `radius` into `n` convex shards (clamped to 5..16). The disc is cut into
 * K = ceil(n/2) radial wedges of uneven angle; n-K of them are cut again by a chord into an inner
 * triangle and an outer piece. Wedges stay under 180 degrees, so every piece is convex.
 */
export function sliceDisc(rng: Rng, n: number, radius: number): Shard[] {
  const count = Math.min(16, Math.max(5, Math.round(n)));
  const k = Math.ceil(count / 2);
  const splits = count - k;
  const weights = Array.from({ length: k }, () => 1 + rng.range(-0.3, 0.3));
  const total = weights.reduce((a, b) => a + b, 0);
  const splitIdx = new Set<number>();
  while (splitIdx.size < splits) splitIdx.add(rng.int(0, k - 1));

  const shards: Shard[] = [];
  let ang = rng.range(0, Math.PI * 2);
  for (let i = 0; i < k; i++) {
    const span = ((weights[i] ?? 1) / total) * Math.PI * 2;
    const a0 = ang;
    const a1 = ang + span;
    ang = a1;
    const steps = Math.max(1, Math.ceil(span / ARC_STEP));
    const arc: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (span * s) / steps;
      arc.push(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    const polys: number[][] = [];
    if (splitIdx.has(i)) {
      const rho = rng.range(0.38, 0.55) * radius;
      const b0: [number, number] = [Math.cos(a0) * rho, Math.sin(a0) * rho];
      const b1: [number, number] = [Math.cos(a1) * rho, Math.sin(a1) * rho];
      polys.push([0, 0, ...b0, ...b1]);
      polys.push([...arc, ...b1, ...b0]);
    } else {
      polys.push([0, 0, ...arc]);
    }
    for (const p of polys) {
      const { cx, cy, area } = centroidOf(p);
      const local = p.map((v, idx) => v - (idx % 2 === 0 ? cx : cy));
      shards.push({ poly: local, cx, cy, area });
    }
  }
  return shards;
}

/** 0..1 hit quality: 1 for a perfect hit, otherwise higher the closer the clay was to the burst centre. */
export function hitQuality(dist: number, hitRadius: number, perfect: boolean): number {
  if (perfect) return 1;
  const u = Math.min(1, Math.max(0, dist / Math.max(1e-6, hitRadius)));
  return 0.2 + 0.55 * (1 - u);
}

export interface ShardVelCfg {
  impulse: number;
  explode: number;
  jitter: number;
}

/**
 * Shard velocity = clay velocity + impulse along the shot direction + radial explosion push out of
 * the clay centre, each term scaled by `1 +/- jitter`. With jitter 0 it is exactly deterministic.
 */
export function shardVelocity(
  clayV: Pt,
  shotDir: Pt,
  radialDir: Pt,
  cfg: ShardVelCfg,
  rand: () => number,
): Pt {
  const j = (): number => 1 + cfg.jitter * (rand() * 2 - 1);
  const ki = cfg.impulse * j();
  const ke = cfg.explode * j();
  return {
    x: clayV.x + shotDir.x * ki + radialDir.x * ke,
    y: clayV.y + shotDir.y * ki + radialDir.y * ke,
  };
}

const channel = (c: number, shift: number): number => (c >> shift) & 0xff;

/** Blend `color` toward its luma grey (and slightly darker) by `t` in 0..1. t=1 is fully desaturated. */
export function desaturate(color: number, t: number): number {
  const r = channel(color, 16),
    g = channel(color, 8),
    b = channel(color, 0);
  const grey = (0.299 * r + 0.587 * g + 0.114 * b) * 0.78;
  const u = Math.min(1, Math.max(0, t));
  const mix = (c: number): number => Math.round(c + (grey - c) * u);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Debris look at `ageMs`: full colour when fresh, fully grey at `debrisDesatMs`, then fading out. */
export function debrisState(
  ageMs: number,
  cfg: Pick<JuiceTuning, 'debrisDesatMs' | 'debrisFadeStartMs' | 'debrisLifeMs'>,
): { desat: number; alpha: number; dead: boolean } {
  const desat = Math.min(1, Math.max(0, ageMs / Math.max(1, cfg.debrisDesatMs)));
  const span = Math.max(1, cfg.debrisLifeMs - cfg.debrisFadeStartMs);
  const alpha = Math.min(1, Math.max(0, 1 - (ageMs - cfg.debrisFadeStartMs) / span));
  return { desat, alpha, dead: ageMs >= cfg.debrisLifeMs };
}

export interface ShardSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  rot: number;
  poly: number[];
  color: number;
}

export interface PuffSpec {
  kind: 'dust' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size0: number;
  size1: number;
  lifeMs: number;
  color: number;
  alpha: number;
}

export interface RingSpec {
  x: number;
  y: number;
  r0: number;
  r1: number;
  lifeMs: number;
  color: number;
}

export interface ShatterPlan {
  quality: number;
  perfect: boolean;
  shards: ShardSpec[];
  puffs: PuffSpec[];
  rings: RingSpec[];
  /** Screen shake amplitude (world units) and hit-stop (ms) to request. */
  shake: number;
  hitStopMs: number;
}

export interface ShatterInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  /** Unit vector from the gun toward the burst. */
  shotDir: Pt;
  quality: number;
  perfect: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Everything one break needs, as plain data. `rng` is for looks only (never the sim RNG). */
export function planShatter(inp: ShatterInput, cfg: JuiceTuning, rng: Rng): ShatterPlan {
  const q = Math.min(1, Math.max(0, inp.quality));
  const lo = Math.min(cfg.shardCountMin, cfg.shardCountMax);
  const hi = Math.max(cfg.shardCountMin, cfg.shardCountMax);
  const n = inp.perfect ? cfg.shardCountPerfect : Math.round(lerp(lo, hi, Math.min(1, q / 0.6)));
  const slices = sliceDisc(rng, n, inp.radius);
  const scale = inp.perfect ? 1.25 : lerp(0.8, 1, q);
  const velCfg: ShardVelCfg = {
    impulse: cfg.shardImpulse * scale,
    explode: cfg.shardExplode * scale,
    jitter: cfg.shardJitter,
  };
  const shards: ShardSpec[] = slices.map((s) => {
    const len = Math.hypot(s.cx, s.cy);
    const radial = len > 1e-6 ? { x: s.cx / len, y: s.cy / len } : randomDir(rng);
    const v = shardVelocity({ x: inp.vx, y: inp.vy }, inp.shotDir, radial, velCfg, () =>
      rng.next(),
    );
    return {
      x: inp.x + s.cx,
      y: inp.y + s.cy,
      vx: v.x,
      vy: v.y,
      spin: rng.range(-1, 1) * cfg.shardSpin,
      rot: rng.range(0, Math.PI * 2),
      poly: s.poly,
      color: inp.color,
    };
  });

  const puffs: PuffSpec[] = [];
  const dust = Math.round(cfg.dustCount * (inp.perfect ? 1.4 : lerp(0.6, 1, q)));
  for (let i = 0; i < dust; i++) {
    const d = randomDir(rng);
    const sp = rng.range(4, 14);
    puffs.push({
      kind: 'dust',
      x: inp.x + d.x * inp.radius * 0.5,
      y: inp.y + d.y * inp.radius * 0.5,
      vx: inp.vx * 0.3 + d.x * sp + inp.shotDir.x * 4,
      vy: inp.vy * 0.3 + d.y * sp + inp.shotDir.y * 4,
      size0: inp.radius * rng.range(0.5, 0.8),
      size1: inp.radius * rng.range(1.3, 2.0),
      lifeMs: cfg.dustLifeMs * rng.range(0.75, 1.1),
      color: 0xd9d3c4,
      alpha: 0.5,
    });
  }
  if (inp.perfect) {
    for (let i = 0; i < cfg.sparkCountPerfect; i++) {
      const d = randomDir(rng);
      const sp = rng.range(30, 75);
      puffs.push({
        kind: 'spark',
        x: inp.x,
        y: inp.y,
        vx: inp.vx * 0.5 + d.x * sp,
        vy: inp.vy * 0.5 + d.y * sp,
        size0: inp.radius * 0.45,
        size1: inp.radius * 0.1,
        lifeMs: rng.range(180, 300),
        color: 0xffe08a,
        alpha: 1,
      });
    }
  }

  const flashMul = cfg.flashRadiusMul * (inp.perfect ? cfg.flashPerfectMul : lerp(0.75, 1, q));
  const rings: RingSpec[] = [
    {
      x: inp.x,
      y: inp.y,
      r0: inp.radius * 0.6,
      r1: inp.radius * flashMul,
      lifeMs: cfg.flashLifeMs,
      color: inp.perfect ? 0xffe08a : 0xffffff,
    },
  ];

  const shake = inp.perfect ? cfg.shakeAmpPerfect : lerp(cfg.shakeAmp * 0.5, cfg.shakeAmp, q);
  const hitStopMs =
    cfg.hitStopMaxMs <= 0
      ? 0
      : inp.perfect
        ? cfg.hitStopMaxMs
        : lerp(cfg.hitStopMinMs, cfg.hitStopMaxMs, q);
  return { quality: q, perfect: inp.perfect, shards, puffs, rings, shake, hitStopMs };
}

function randomDir(rng: Rng): Pt {
  const a = rng.range(0, Math.PI * 2);
  return { x: Math.cos(a), y: Math.sin(a) };
}
