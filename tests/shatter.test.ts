import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { defaultJuiceTuning } from '../src/feel/tuning';
import { HitStop } from '../src/render/vfx/hitstop';
import { Shake } from '../src/render/vfx/shake';
import {
  debrisState,
  desaturate,
  hitQuality,
  isConvex,
  planShatter,
  polyArea,
  shardVelocity,
  sliceDisc,
} from '../src/render/vfx/shatter';

const R = 2.2;
const disc = Math.PI * R * R;

describe('sliceDisc', () => {
  it('produces the requested number of valid convex polygons for n = 6..12', () => {
    for (let n = 6; n <= 12; n++) {
      for (let seed = 0; seed < 25; seed++) {
        const shards = sliceDisc(new Rng(`s${n}-${seed}`), n, R);
        expect(shards).toHaveLength(n);
        for (const s of shards) {
          expect(s.poly.length).toBeGreaterThanOrEqual(6);
          expect(s.poly.every(Number.isFinite)).toBe(true);
          expect(isConvex(s.poly)).toBe(true);
          expect(polyArea(s.poly)).toBeGreaterThan(0);
        }
      }
    }
  });
  it('shard areas sum to about the clay disc area', () => {
    for (let seed = 0; seed < 30; seed++) {
      const n = 6 + (seed % 7);
      const shards = sliceDisc(new Rng(seed), n, R);
      const total = shards.reduce((a, s) => a + polyArea(s.poly), 0);
      expect(total / disc).toBeGreaterThan(0.97);
      expect(total / disc).toBeLessThan(1.001);
      expect(shards.reduce((a, s) => a + s.area, 0)).toBeCloseTo(total, 6);
    }
  });
  it('is deterministic for a seed and varies between seeds', () => {
    const a = sliceDisc(new Rng('x'), 8, R);
    const b = sliceDisc(new Rng('x'), 8, R);
    const c = sliceDisc(new Rng('y'), 8, R);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('clamps absurd counts', () => {
    expect(sliceDisc(new Rng(1), 1, R).length).toBe(5);
    expect(sliceDisc(new Rng(1), 99, R).length).toBe(16);
  });
});

describe('shardVelocity', () => {
  const dir = { x: 0.6, y: 0.8 };
  it('is clay velocity plus the shot impulse when there is no spread', () => {
    const v = shardVelocity(
      { x: 10, y: -4 },
      dir,
      { x: 1, y: 0 },
      { impulse: 30, explode: 0, jitter: 0 },
      () => 0.5,
    );
    expect(v.x).toBeCloseTo(10 + 18, 9);
    expect(v.y).toBeCloseTo(-4 + 24, 9);
  });
  it('adds radial explosion push and stays centred on clay velocity + impulse', () => {
    const rng = new Rng('mean');
    const cfg = { ...defaultJuiceTuning, shardJitter: 0 };
    const plan = planShatter(
      {
        x: 40,
        y: 80,
        vx: 12,
        vy: 5,
        radius: R,
        color: 0xff8a3d,
        shotDir: dir,
        quality: 0.5,
        perfect: false,
      },
      cfg,
      rng,
    );
    const n = plan.shards.length;
    const mx = plan.shards.reduce((a, s) => a + s.vx, 0) / n;
    const my = plan.shards.reduce((a, s) => a + s.vy, 0) / n;
    const k = 0.8 + 0.2 * 0.5; // shard velocity scale for quality 0.5
    const ex = 12 + dir.x * defaultJuiceTuning.shardImpulse * k;
    const ey = 5 + dir.y * defaultJuiceTuning.shardImpulse * k;
    // radial terms roughly cancel; the mean stays within a fraction of the explode speed
    expect(Math.hypot(mx - ex, my - ey)).toBeLessThan(defaultJuiceTuning.shardExplode * 0.6);
    // every shard moves at least roughly with the clay (forward component along the shot)
    for (const s of plan.shards) {
      const along = (s.vx - 12) * dir.x + (s.vy - 5) * dir.y;
      expect(along).toBeGreaterThan(
        defaultJuiceTuning.shardImpulse * k - defaultJuiceTuning.shardExplode * 1.01,
      );
    }
  });
});

describe('planShatter', () => {
  const base = { x: 10, y: 50, vx: 5, vy: 0, radius: R, color: 0xff8a3d, shotDir: { x: 0, y: 1 } };
  it('perfect hits get more shards, a bigger flash, more shake and the longest hit-stop', () => {
    const t = defaultJuiceTuning;
    const normal = planShatter({ ...base, quality: 0.4, perfect: false }, t, new Rng(1));
    const perfect = planShatter({ ...base, quality: 1, perfect: true }, t, new Rng(1));
    expect(normal.shards.length).toBeGreaterThanOrEqual(t.shardCountMin);
    expect(normal.shards.length).toBeLessThanOrEqual(t.shardCountMax);
    expect(perfect.shards.length).toBe(t.shardCountPerfect);
    expect(perfect.rings[0]!.r1).toBeGreaterThan(normal.rings[0]!.r1);
    expect(perfect.shake).toBeGreaterThan(normal.shake);
    expect(perfect.hitStopMs).toBe(t.hitStopMaxMs);
    expect(normal.hitStopMs).toBeGreaterThanOrEqual(t.hitStopMinMs);
    expect(normal.hitStopMs).toBeLessThanOrEqual(t.hitStopMaxMs);
    expect(perfect.puffs.filter((p) => p.kind === 'spark').length).toBe(t.sparkCountPerfect);
    expect(normal.puffs.some((p) => p.kind === 'spark')).toBe(false);
  });
  it('hit-stop stays in the 40-60 ms window by default', () => {
    for (let q = 0; q <= 1; q += 0.1) {
      const p = planShatter(
        { ...base, quality: q, perfect: false },
        defaultJuiceTuning,
        new Rng(2),
      );
      expect(p.hitStopMs).toBeGreaterThanOrEqual(40);
      expect(p.hitStopMs).toBeLessThanOrEqual(60);
    }
  });
});

describe('hitQuality', () => {
  it('is 1 for perfect and rises as the burst gets closer', () => {
    expect(hitQuality(0, 7, true)).toBe(1);
    expect(hitQuality(6, 7, false)).toBeLessThan(hitQuality(3, 7, false));
    expect(hitQuality(3, 7, false)).toBeLessThan(1);
    expect(hitQuality(99, 7, false)).toBeGreaterThan(0);
  });
});

describe('debris readability', () => {
  const cfg = defaultJuiceTuning;
  const sat = (c: number): number => {
    const r = (c >> 16) & 255,
      g = (c >> 8) & 255,
      b = c & 255;
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  it('desaturate(1) is grey, desaturate(0) is unchanged', () => {
    expect(desaturate(0xff8a3d, 0)).toBe(0xff8a3d);
    expect(sat(desaturate(0xff8a3d, 1))).toBeLessThanOrEqual(1);
    expect(sat(desaturate(0xff8a3d, 0.5))).toBeLessThan(sat(0xff8a3d));
  });
  it('reaches full desaturation by the tuned time (~250 ms) and fades out by the life', () => {
    expect(debrisState(0, cfg).desat).toBe(0);
    expect(debrisState(cfg.debrisDesatMs / 2, cfg).desat).toBeCloseTo(0.5, 9);
    expect(debrisState(cfg.debrisDesatMs, cfg).desat).toBe(1);
    expect(cfg.debrisDesatMs).toBeLessThanOrEqual(300);
    expect(debrisState(cfg.debrisFadeStartMs - 1, cfg).alpha).toBe(1);
    expect(debrisState(cfg.debrisLifeMs - 1, cfg).alpha).toBeLessThan(0.1);
    expect(debrisState(cfg.debrisLifeMs, cfg).dead).toBe(true);
    expect(debrisState(cfg.debrisLifeMs - 1, cfg).dead).toBe(false);
    // a faster tune desaturates faster
    expect(debrisState(100, { ...cfg, debrisDesatMs: 100 }).desat).toBe(1);
  });
});

describe('Shake', () => {
  it('kicks, caps and decays to zero', () => {
    const s = new Shake(2);
    s.kick(1);
    s.kick(1.5);
    expect(s.amp).toBeLessThanOrEqual(2);
    expect(s.amp).toBeGreaterThan(1.5);
    let o = s.update(0.016, 16, () => 1);
    expect(Math.abs(o.x)).toBeLessThanOrEqual(s.amp + 1e-9);
    for (let i = 0; i < 60; i++) o = s.update(0.016, 16, () => 1);
    expect(s.amp).toBe(0);
    expect(o).toEqual({ x: 0, y: 0 });
  });
});

describe('HitStop', () => {
  it('holds about the requested time in real ms, then a cooldown blocks stacking', () => {
    const h = new HitStop(100);
    h.request(50);
    expect(h.tick(16.7)).toBe(false); // first frame draws the impact
    let held = 0;
    while (h.tick(16.7)) held++;
    expect(held).toBe(3); // 3 frames at 60 fps ~ 50 ms
    h.request(50);
    expect(h.active).toBe(false); // cooldown
    for (let i = 0; i < 8; i++) h.tick(16.7);
    h.request(50);
    expect(h.active).toBe(true);
  });
  it('ignores zero / negative requests and clamps long ones', () => {
    const h = new HitStop();
    h.request(0);
    expect(h.active).toBe(false);
    h.request(5000);
    expect(h.remaining).toBeLessThanOrEqual(80);
  });
});
