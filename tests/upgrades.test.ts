import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { defaultTuning } from '../src/feel/tuning';
import { comboMult, clayPoints } from '../src/modes/run/scoring';
import type { Clay } from '../src/sim/clay';
import { defaultSimConfig, type SimConfig } from '../src/sim/config';
import { MAX_CASCADE_DEPTH, composeHooks, type SimHooks } from '../src/sim/hooks';
import type { ClaySpec } from '../src/sim/throws';
import { World, type WorldEvents } from '../src/sim/world';
import { UPGRADES, upgradeById } from '../src/upgrades/defs';
import { chainRange } from '../src/upgrades/defs/chain';
import { defaultUpgradeTuning } from '../src/upgrades/params';
import { applyPhysics, applyScore, buildHooks, makeCtx } from '../src/upgrades/runtime';
import { SYNERGIES, activeSynergies, newSynergies } from '../src/upgrades/synergies';
import type { UpgradeId } from '../src/upgrades/types';
import { generateGusts } from '../src/upgrades/wind';

const P = defaultUpgradeTuning;
const calm: SimConfig = { ...defaultSimConfig, gravity: 0, drag: 0 };
const SKY: ClaySpec = { type: 'standard', house: 'high', delay: 0, speed: 70, angleDeg: 55 };
const DT = 1 / 120;

function setup(owned: UpgradeId[], cfg: SimConfig = calm): World {
  const ctx = makeCtx(owned, P, new Rng('t'));
  const w = new World(applyPhysics(cfg, owned, ctx));
  w.hooks = buildHooks(owned, ctx);
  return w;
}

function put(w: World, x: number, y: number, type: Clay['type'] = 'standard'): Clay {
  const c = w.launch({ ...SKY, type }, 0);
  c.x = x;
  c.y = y;
  c.vx = 0;
  c.vy = 0;
  return c;
}

function bang(w: World, x: number, y: number): void {
  w.fire({ aim: { x, y }, t: w.time });
  for (let i = 0; i < 90; i++) w.step(DT);
}

function log(w: World): {
  breaks: WorldEvents['break'][];
  chains: WorldEvents['chain'][];
  blasts: WorldEvents['explosion'][];
} {
  const out = {
    breaks: [] as WorldEvents['break'][],
    chains: [] as WorldEvents['chain'][],
    blasts: [] as WorldEvents['explosion'][],
  };
  w.events.on('break', (e) => out.breaks.push(e));
  w.events.on('chain', (e) => out.chains.push(e));
  w.events.on('explosion', (e) => out.blasts.push(e));
  return out;
}

describe('explosive fragments', () => {
  it('a break also breaks every live clay within R, and only those', () => {
    const w = setup(['explosive']);
    const ev = log(w);
    const centre = put(w, 45, 90);
    const near1 = put(w, 45 + P.explosiveRadius - 2, 90);
    const near2 = put(w, 45, 90 - P.explosiveRadius + 3);
    const far = put(w, 45 + P.explosiveRadius + 3, 90);
    bang(w, 45, 90);
    expect([centre, near1, near2].map((c) => c.status)).toEqual(['broken', 'broken', 'broken']);
    expect(far.status).toBe('live');
    expect(ev.blasts).toHaveLength(1);
    expect(ev.blasts[0]?.radius).toBe(P.explosiveRadius);
    expect(ev.breaks.filter((b) => b.cause.kind === 'explosion')).toHaveLength(2);
    expect(w.stats.hits).toBe(3);
  });

  it('does nothing when no clay is near, and explosions do not set off further explosions', () => {
    const w = setup(['explosive']);
    const ev = log(w);
    put(w, 45, 90);
    const chainA = put(w, 45 + 9, 90);
    const chainB = put(w, 45 + 18, 90); // outside R of the first, inside R of A
    bang(w, 45, 90);
    expect(chainA.status).toBe('broken');
    expect(chainB.status).toBe('live');
    expect(ev.blasts).toHaveLength(1);
    const lonely = setup(['explosive']);
    const e2 = log(lonely);
    put(lonely, 45, 90);
    bang(lonely, 45, 90);
    expect(e2.blasts).toHaveLength(0);
  });

  it('cracks (does not break) an armored clay caught in the blast', () => {
    const w = setup(['explosive']);
    put(w, 45, 90);
    const a = put(w, 50, 90, 'armored');
    bang(w, 45, 90);
    expect(a.status).toBe('live');
    expect(a.cracked).toBe(true);
  });
});

describe('chain shatter', () => {
  it('arcs to the nearest clay in range, up to 3 links', () => {
    const w = setup(['chain']);
    const ev = log(w);
    const row = [0, 1, 2, 3, 4, 5].map((i) => put(w, 30 + i * 12, 90));
    bang(w, 30, 90);
    expect(row.map((c) => c.status)).toEqual([
      'broken',
      'broken',
      'broken',
      'broken',
      'live',
      'live',
    ]);
    expect(ev.chains.map((c) => c.link)).toEqual([1, 2, 3]);
    expect(ev.breaks.filter((b) => b.cause.kind === 'chain').map((b) => b.cause.link)).toEqual([
      1, 2, 3,
    ]);
  });

  it('picks the nearest clay and ignores clays beyond R2', () => {
    const w = setup(['chain']);
    put(w, 45, 90);
    const far = put(w, 45 + P.chainRadius + 2, 90);
    const closer = put(w, 45, 90 + 8);
    const closest = put(w, 45 - 5, 90);
    bang(w, 45, 90);
    // the pattern radius (5) already covers `closest`, so chain from it next: nearest to it is `closer`
    expect(far.status).toBe('live');
    expect(closest.status).toBe('broken');
    expect(closer.status).toBe('broken');
  });

  it('shows the arc endpoints in the chain event', () => {
    const w = setup(['chain']);
    const ev = log(w);
    put(w, 45, 90);
    put(w, 45 + 10, 90);
    bang(w, 45, 90);
    expect(ev.chains).toHaveLength(1);
    expect(ev.chains[0]?.from).toEqual({ x: 45, y: 90 });
    expect(ev.chains[0]?.to).toEqual({ x: 55, y: 90 });
  });
});

describe('Shrapnel Storm synergy', () => {
  it('is detected only with both upgrades, and reported once when completed', () => {
    expect(activeSynergies(['explosive'])).toEqual([]);
    expect(activeSynergies(['chain', 'slug'])).toEqual([]);
    expect(activeSynergies(['chain', 'explosive']).map((s) => s.id)).toEqual(['shrapnelStorm']);
    expect(SYNERGIES[0]?.name).toBe('SHRAPNEL STORM');
    expect(newSynergies(['explosive'], ['explosive', 'chain']).map((s) => s.id)).toEqual([
      'shrapnelStorm',
    ]);
    expect(newSynergies(['explosive', 'chain'], ['explosive', 'chain', 'slug'])).toEqual([]);
  });

  it('adds +25% chain range', () => {
    expect(chainRange(17, 0.25, false)).toBe(17);
    expect(chainRange(17, 0.25, true)).toBeCloseTo(21.25, 9);
    // a clay at 19 units: out of reach for chain alone, in reach with the synergy
    const gap = P.chainRadius + 2;
    const solo = setup(['chain']);
    put(solo, 45, 90);
    const outSolo = put(solo, 45 + gap, 90);
    bang(solo, 45, 90);
    expect(outSolo.status).toBe('live');
    const storm = setup(['chain', 'explosive']);
    put(storm, 45, 90);
    const reach = put(storm, 45 + gap, 90);
    bang(storm, 45, 90);
    expect(reach.status).toBe('broken');
  });
});

describe('cascade safety', () => {
  it('a dense cluster with Shrapnel Storm finishes, and each clay breaks exactly once', () => {
    const w = setup(['explosive', 'chain']);
    const ev = log(w);
    const rng = new Rng('cluster');
    const clays: Clay[] = [];
    for (let i = 0; i < 60; i++) clays.push(put(w, 30 + rng.range(0, 30), 70 + rng.range(0, 30)));
    bang(w, 45, 85);
    const ids = ev.breaks.map((b) => b.clay.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ev.breaks.length).toBeGreaterThan(10);
    expect(Math.max(...ev.breaks.map((b) => b.cause.depth))).toBeLessThanOrEqual(MAX_CASCADE_DEPTH);
    expect(clays.filter((c) => c.status === 'broken').length).toBe(ids.length);
  });

  it('the world stops running hooks past the depth cap, even for a runaway upgrade', () => {
    const w = setup([]);
    let calls = 0;
    const runaway: SimHooks = {
      onClayBroken(info, world) {
        calls++;
        for (const e of world.liveAtBurst()) {
          world.damageClay(e.clay, info.shot, 1, 0, false, {
            kind: 'chain',
            depth: info.cause.depth + 1,
            link: info.cause.link + 1,
            from: info.pos,
          });
          break;
        }
      },
    };
    w.hooks = runaway;
    for (let i = 0; i < 120; i++) put(w, 20 + (i % 12) * 3, 60 + Math.floor(i / 12) * 3);
    bang(w, 20, 60);
    // the pattern covers a handful of clays; each starts a runaway chain that the cap cuts off
    expect(calls).toBeGreaterThan(MAX_CASCADE_DEPTH);
    expect(calls).toBeLessThanOrEqual(12 * (MAX_CASCADE_DEPTH + 1));
    expect(w.liveClays().length).toBeGreaterThan(0);
  });
});

describe('slug and curse', () => {
  it('slug: pattern radius x0.4, faster shot, one-hit armor break, x1.5 score', () => {
    const w = setup(['slug']);
    const s = setup(['slug']).fire({ aim: { x: 45, y: 90 }, t: 0 });
    const n = setup([]).fire({ aim: { x: 45, y: 90 }, t: 0 });
    expect(s?.radius).toBeCloseTo((n?.radius ?? 0) * P.slugRadiusMul, 9);
    expect(P.slugRadiusMul).toBe(0.4);
    expect(s?.damage).toBe(1);
    expect((s?.arriveTime ?? 0) - (s?.fireTime ?? 0)).toBeCloseTo(
      ((n?.arriveTime ?? 0) - (n?.fireTime ?? 0)) * P.slugTimeMul,
      9,
    );
    const a = put(w, 60, 90, 'armored');
    bang(w, 60, 90);
    expect(a.status).toBe('broken');
    const ctx = makeCtx(['slug'], P, new Rng('x'));
    const info = {
      base: 100,
      combo: 1,
      perfect: false,
      mult: 1,
      cause: { kind: 'shot' as const, depth: 0, link: 0, from: null },
    };
    expect(applyScore(info, ['slug'], ctx).mult).toBeCloseTo(1.5, 9);
  });

  it('slug misses where the normal pattern would still hit', () => {
    const slug = setup(['slug']);
    const plain = setup([]);
    const a = put(slug, 45 + 5, 90);
    const b = put(plain, 45 + 5, 90);
    bang(slug, 45, 90);
    bang(plain, 45, 90);
    expect(a.status).toBe('live');
    expect(b.status).toBe('broken');
  });

  it('curse: pattern radius x0.7, score x2', () => {
    const w = setup(['curse']);
    const s = w.fire({ aim: { x: 45, y: 90 }, t: 0 });
    expect(s?.radius).toBeCloseTo(defaultSimConfig.patternRadius * P.curseRadiusMul, 9);
    const ctx = makeCtx(['curse'], P, new Rng('x'));
    const info = {
      base: 100,
      combo: 1,
      perfect: false,
      mult: 1,
      cause: { kind: 'shot' as const, depth: 0, link: 0, from: null },
    };
    expect(applyScore(info, ['curse'], ctx).mult).toBe(2);
    expect(clayPoints({ ...info, mult: 2 })).toBe(200);
  });
});

describe('physics upgrades', () => {
  it('heavier gravity: x1.5 gravity, launch speed scaled by sqrt(1.5)', () => {
    const ctx = makeCtx(['gravity'], P, new Rng('x'));
    const cfg = applyPhysics(defaultSimConfig, ['gravity'], ctx);
    expect(cfg.gravity).toBeCloseTo(defaultSimConfig.gravity * 1.5, 9);
    expect(cfg.launchSpeedMul).toBeCloseTo(Math.sqrt(1.5), 9);
    expect(defaultSimConfig.gravity).toBe(38); // base config is not mutated
  });

  it('wind: seeded gusts, strengths and gaps in range, same seed same gusts', () => {
    const a = generateGusts(new Rng('w'), P);
    expect(a).toEqual(generateGusts(new Rng('w'), P));
    expect(a).not.toEqual(generateGusts(new Rng('w2'), P));
    expect(a.length).toBeGreaterThan(15);
    for (let i = 0; i < a.length; i++) {
      const g = a[i]!;
      expect(Math.abs(g.ax)).toBeGreaterThanOrEqual(P.windAccelMin - 0.01);
      expect(Math.abs(g.ax)).toBeLessThanOrEqual(P.windAccelMax + 0.01);
      expect(g.end - g.start).toBeGreaterThanOrEqual(P.windGustMin - 0.01);
      expect(g.end - g.start).toBeLessThanOrEqual(P.windGustMax + 0.01);
      if (i > 0) expect(g.start).toBeGreaterThan(a[i - 1]!.end);
    }
    const ctx = makeCtx(['wind'], P, new Rng('w'));
    expect(applyPhysics(defaultSimConfig, ['wind'], ctx).gusts).toEqual(a);
  });
});

describe('hooks', () => {
  it('fire in order with the right data, and compose', () => {
    const order: string[] = [];
    const w = new World(calm);
    const a: SimHooks = {
      modifyPattern: (p) => ({ ...p, radius: p.radius * 2 }),
      onShotFired: () => void order.push('a:shot'),
      onClayHit: (h) => void order.push(`a:hit:${h.damage}`),
      onClayBroken: () => void order.push('a:broken'),
    };
    const b: SimHooks = {
      modifyPattern: (p) => ({ ...p, radius: p.radius + 1 }),
      onClayHit: (h) => void (h.damage += 1),
      onClayBroken: () => void order.push('b:broken'),
    };
    w.hooks = composeHooks([a, b]);
    put(w, 45, 90);
    const shot = w.fire({ aim: { x: 45, y: 90 }, t: 0 });
    expect(shot?.radius).toBeCloseTo(defaultSimConfig.patternRadius * 2 + 1, 9);
    for (let i = 0; i < 90; i++) w.step(DT);
    expect(order).toEqual(['a:shot', 'a:hit:1', 'a:broken', 'b:broken']);
  });

  it('every upgrade has a card, an icon and a category', () => {
    expect(UPGRADES).toHaveLength(6);
    for (const u of UPGRADES) {
      expect(u.blurb.length).toBeGreaterThan(5);
      expect(u.icon.length).toBeLessThanOrEqual(3);
      expect(['Shells', 'Physics mod', 'Curse']).toContain(u.category);
    }
    expect(UPGRADES.filter((u) => u.physics).map((u) => u.id)).toEqual(['wind', 'gravity']);
    expect(upgradeById('slug').name).toBe('Slug');
  });

  it('combo math: +0.1 per consecutive hit, capped at x3', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(1)).toBeCloseTo(1.1, 9);
    expect(comboMult(10)).toBeCloseTo(2, 9);
    expect(comboMult(20)).toBe(3);
    expect(comboMult(200)).toBe(3);
    expect(defaultTuning.chainLinks).toBe(3);
  });
});
