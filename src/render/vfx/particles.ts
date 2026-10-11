import { Container, Graphics, Particle, ParticleContainer } from 'pixi.js';
import type { JuiceTuning } from '../../feel/tuning';
import { buildVfxTextures, type VfxTextures } from './atlas';
import { debrisState, desaturate, type PuffSpec, type RingSpec, type ShatterPlan } from './shatter';

/** What the juice layer needs from a VFX renderer (a mock in tests). */
export interface VfxSink {
  shatter(plan: ShatterPlan): void;
  puff(x: number, y: number, r: number, color?: number): void;
  ring(spec: RingSpec): void;
  clear(): void;
}

export interface VfxStats {
  /** Cumulative shards / particles / rings spawned since creation. */
  shardsSpawned: number;
  particlesSpawned: number;
  ringsSpawned: number;
  shattersSpawned: number;
  activeShards: number;
  activeParticles: number;
  /** Highest simultaneous (shards + particles) seen. */
  peakActive: number;
  /** Spawns dropped because a pool was exhausted. */
  dropped: number;
}

interface LiveShard {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  ageMs: number;
  color: number;
}

interface LivePart {
  p: Particle;
  kind: 'dust' | 'spark' | 'ring';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size0: number;
  size1: number;
  ageMs: number;
  lifeMs: number;
  alpha: number;
}

const MAX_SHARDS = 320;
const MAX_PARTS = 640;

/**
 * Pooled VFX renderer living in the y-up world layer. Shards are pooled `Graphics` polygons (only
 * their transform and tint change per frame); dust, sparks and flash rings are pre-allocated
 * `Particle`s in a single `ParticleContainer`. Nothing is allocated per frame.
 */
export class VfxLayer implements VfxSink {
  readonly root = new Container();
  readonly stats: VfxStats = {
    shardsSpawned: 0,
    particlesSpawned: 0,
    ringsSpawned: 0,
    shattersSpawned: 0,
    activeShards: 0,
    activeParticles: 0,
    peakActive: 0,
    dropped: 0,
  };
  private readonly shardLayer = new Container();
  private readonly particles: ParticleContainer;
  private readonly tex: VfxTextures;
  private freeShards: Graphics[] = [];
  private shards: LiveShard[] = [];
  private freeParts: Particle[] = [];
  private parts: LivePart[] = [];

  constructor(
    private readonly cfg: () => JuiceTuning & { gravity: number },
    textures?: VfxTextures,
  ) {
    this.tex = textures ?? buildVfxTextures();
    this.particles = new ParticleContainer({
      dynamicProperties: { position: true, vertex: true, rotation: true, color: true, uvs: false },
    });
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = new Particle({
        texture: this.tex.soft,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 0,
        scaleY: 0,
      });
      this.particles.addParticle(p);
      this.freeParts.push(p);
    }
    this.root.addChild(this.shardLayer, this.particles);
  }

  shatter(plan: ShatterPlan): void {
    this.stats.shattersSpawned++;
    for (const s of plan.shards) {
      const g = this.freeShards.pop() ?? (this.shards.length < MAX_SHARDS ? new Graphics() : null);
      if (!g) {
        this.stats.dropped++;
        continue;
      }
      g.clear().poly(s.poly).fill(0xffffff);
      g.visible = true;
      g.alpha = 1;
      g.tint = s.color;
      g.position.set(s.x, s.y);
      g.rotation = s.rot;
      if (!g.parent) this.shardLayer.addChild(g);
      this.shards.push({
        g,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        rot: s.rot,
        spin: s.spin,
        ageMs: 0,
        color: s.color,
      });
      this.stats.shardsSpawned++;
    }
    for (const p of plan.puffs) this.spawnPuff(p);
    for (const r of plan.rings) this.ring(r);
    this.bump();
  }

  /** A subtle burst puff, e.g. where a pattern missed. */
  puff(x: number, y: number, r: number, color = 0xcfd8e8): void {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + x;
      this.spawnPuff({
        kind: 'dust',
        x: x + Math.cos(a) * r * 0.25,
        y: y + Math.sin(a) * r * 0.25,
        vx: Math.cos(a) * 5,
        vy: Math.sin(a) * 5,
        size0: r * 0.3,
        size1: r * 0.8,
        lifeMs: 300,
        color,
        alpha: 0.28,
      });
    }
    this.ring({ x, y, r0: r * 0.5, r1: r * 1.05, lifeMs: 220, color });
    this.bump();
  }

  ring(spec: RingSpec): void {
    const p = this.takePart();
    if (!p) return;
    this.stats.ringsSpawned++;
    this.parts.push({
      p,
      kind: 'ring',
      x: spec.x,
      y: spec.y,
      vx: 0,
      vy: 0,
      size0: spec.r0 * 2,
      size1: spec.r1 * 2,
      ageMs: 0,
      lifeMs: spec.lifeMs,
      alpha: 0.9,
    });
    p.texture = this.tex.ring;
    p.tint = spec.color;
  }

  private spawnPuff(s: PuffSpec): void {
    const p = this.takePart();
    if (!p) return;
    p.texture = this.tex.soft;
    p.tint = s.color;
    this.stats.particlesSpawned++;
    this.parts.push({
      p,
      kind: s.kind,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      size0: s.size0 * 2,
      size1: s.size1 * 2,
      ageMs: 0,
      lifeMs: s.lifeMs,
      alpha: s.alpha,
    });
  }

  private takePart(): Particle | null {
    const p = this.freeParts.pop();
    if (!p) {
      this.stats.dropped++;
      return null;
    }
    return p;
  }

  private bump(): void {
    this.stats.activeShards = this.shards.length;
    this.stats.activeParticles = this.parts.length;
    this.stats.peakActive = Math.max(this.stats.peakActive, this.shards.length + this.parts.length);
  }

  /** Advance everything by real `dt` seconds. */
  update(dt: number): void {
    const cfg = this.cfg();
    const g = cfg.gravity * cfg.shardGravityScale;
    const ms = dt * 1000;

    let w = 0;
    for (const s of this.shards) {
      s.ageMs += ms;
      const st = debrisState(s.ageMs, cfg);
      if (st.dead) {
        s.g.visible = false;
        this.freeShards.push(s.g);
        continue;
      }
      s.vy -= g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      s.g.position.set(s.x, s.y);
      s.g.rotation = s.rot;
      s.g.tint = desaturate(s.color, st.desat);
      s.g.alpha = st.alpha;
      this.shards[w++] = s;
    }
    this.shards.length = w;

    w = 0;
    for (const q of this.parts) {
      q.ageMs += ms;
      const u = q.ageMs / q.lifeMs;
      if (u >= 1) {
        q.p.scaleX = 0;
        q.p.scaleY = 0;
        this.freeParts.push(q.p);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'dust') {
        q.vx *= 0.92;
        q.vy *= 0.92;
      } else if (q.kind === 'spark') {
        q.vy -= g * 0.35 * dt;
      }
      const ease = q.kind === 'ring' ? 1 - (1 - u) * (1 - u) : u;
      const size = q.size0 + (q.size1 - q.size0) * ease;
      const sc = size / this.tex.size;
      q.p.x = q.x;
      q.p.y = q.y;
      q.p.scaleX = sc;
      q.p.scaleY = sc;
      q.p.alpha = q.alpha * (1 - u) * (q.kind === 'ring' ? 1 : 1 - u * 0.3);
      this.parts[w++] = q;
    }
    this.parts.length = w;
    this.bump();
  }

  clear(): void {
    for (const s of this.shards) {
      s.g.visible = false;
      this.freeShards.push(s.g);
    }
    this.shards = [];
    for (const q of this.parts) {
      q.p.scaleX = 0;
      q.p.scaleY = 0;
      this.freeParts.push(q.p);
    }
    this.parts = [];
    this.bump();
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
