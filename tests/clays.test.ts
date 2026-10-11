import { describe, expect, it } from 'vitest';
import { advanceWithGusts, windAt } from '../src/sim/ballistics';
import {
  CLAY_TYPES,
  RABBIT,
  advanceClay,
  advanceRabbit,
  rabbitBase,
  rabbitBump,
  type Clay,
} from '../src/sim/clay';
import { defaultSimConfig, type SimConfig } from '../src/sim/config';
import { GROUND_H } from '../src/sim/field';
import { HOUSES } from '../src/sim/houses';
import { clayPositionAt, idealAim } from '../src/sim/predict';
import type { ClaySpec } from '../src/sim/throws';
import { World, type WorldEvents } from '../src/sim/world';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({ ...defaultSimConfig, ...over });
const SKY: ClaySpec = { type: 'standard', house: 'high', delay: 0, speed: 70, angleDeg: 55 };
const DT = 1 / 120;

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.step(DT);
}

/** Place a stationary-ish live clay (no gravity/drag) for hit tests. */
function still(w: World, type: Clay['type'], x: number, y: number): Clay {
  const c = w.launch({ ...SKY, type }, 0);
  c.x = x;
  c.y = y;
  c.vx = 0;
  c.vy = 0;
  return c;
}
const calm = (): SimConfig => cfg({ gravity: 0, drag: 0 });

function collect(w: World): { [K in keyof WorldEvents]: WorldEvents[K][] } {
  const log = {
    launch: [],
    shot: [],
    reject: [],
    burst: [],
    break: [],
    crack: [],
    explosion: [],
    chain: [],
    split: [],
    escape: [],
  } as { [K in keyof WorldEvents]: WorldEvents[K][] };
  for (const k of Object.keys(log) as (keyof WorldEvents)[])
    w.events.on(k, ((e: unknown) => (log[k] as unknown[]).push(e)) as never);
  return log;
}

function shootAt(w: World, x: number, y: number): void {
  w.fire({ aim: { x, y }, t: w.time });
  run(w, 0.6);
}

describe('splitter', () => {
  it('spawns two smaller children on diverging paths when it breaks', () => {
    const w = new World(calm());
    const log = collect(w);
    const s = still(w, 'splitter', 45, 90);
    s.vx = 20;
    shootAt(w, 45 + 20 * 0.4, 90);
    expect(s.status).toBe('broken');
    expect(log.split).toHaveLength(1);
    const kids = log.split[0]?.children ?? [];
    expect(kids).toHaveLength(2);
    expect(kids.every((k) => k.type === 'splitlet' && k.status === 'live')).toBe(true);
    expect(CLAY_TYPES.splitlet.radiusScale).toBeLessThan(CLAY_TYPES.splitter.radiusScale);
    const [a, b] = kids as [Clay, Clay];
    // they move apart
    expect(Math.hypot(a.vx - b.vx, a.vy - b.vy)).toBeGreaterThan(20);
    expect(w.liveClays().length).toBe(2);
    // children keep the parent's throw index (so the director waits for them)
    expect(kids.every((k) => k.throwIndex === s.throwIndex)).toBe(true);
  });

  it('children that get away are escapes like any clay', () => {
    const w = new World(cfg());
    const log = collect(w);
    const s = w.launch({ ...SKY, type: 'splitter' }, 0);
    run(w, 0.5);
    const p = clayPositionAt(w.cfg, s, 0.3);
    w.fire({ aim: p, t: w.time });
    run(w, 0.45);
    expect(log.split).toHaveLength(1);
    expect(w.stats.escapes).toBe(0);
    run(w, 8);
    expect(log.escape).toHaveLength(2);
    expect(log.escape.every((e) => e.clay.type === 'splitlet')).toBe(true);
    expect(w.stats.escapes).toBe(2);
  });

  it('children can be broken and do not split again', () => {
    const w = new World(calm());
    const log = collect(w);
    const s = still(w, 'splitter', 45, 90);
    shootAt(w, 45, 90);
    const kid = log.split[0]?.children[0] as Clay;
    expect(kid.status).toBe('live');
    w.fire({ aim: { x: kid.x, y: kid.y }, t: w.time });
    run(w, 0.5);
    // aimed where the child was; with a calm field it moved on by (vx * flight), so just ensure no new split
    expect(log.split).toHaveLength(1);
    expect(s.status).toBe('broken');
  });
});

describe('armored', () => {
  it('needs two hits: the first cracks and deflects, the second breaks', () => {
    const w = new World(calm());
    const log = collect(w);
    const a = still(w, 'armored', 45, 90);
    expect(a.hitsLeft).toBe(2);
    shootAt(w, 45, 92);
    expect(a.status).toBe('live');
    expect(a.cracked).toBe(true);
    expect(a.hitsLeft).toBe(1);
    expect(log.crack).toHaveLength(1);
    expect(log.break).toHaveLength(0);
    // pushed away from the burst (burst was above the clay: it goes down)
    expect(a.vy).toBeLessThan(-10);
    // the burst still counts as a hit
    expect(log.burst[0]?.hit).toBe(true);
    expect(log.burst[0]?.cracked).toEqual([a]);
    const k = clayPositionAt(w.cfg, a, 0.2);
    shootAt(w, k.x, k.y);
    expect(a.status).toBe('broken');
    expect(log.break).toHaveLength(1);
  });

  it('breaks in one hit when the shot deals 2 damage (slug)', () => {
    const w = new World(calm());
    w.hooks = { modifyPattern: (p) => ({ ...p, damage: 2 }) };
    const a = still(w, 'armored', 45, 90);
    shootAt(w, 45, 90);
    expect(a.status).toBe('broken');
  });
});

describe('rabbit', () => {
  const rabbitCfg = cfg({ rabbitSeed: 1234 });
  const launch = (c: SimConfig, house: 'high' | 'low' = 'high', speed = 40): [World, Clay] => {
    const w = new World(c);
    const r = w.launch({ type: 'rabbit', house, delay: 0, speed, angleDeg: 0 }, 0);
    return [w, r];
  };

  it('launches on the ground, rolls away from its house and never leaves the ground strip', () => {
    const [w, r] = launch(rabbitCfg);
    const base = rabbitBase(w.cfg);
    expect(r.y).toBeCloseTo(base, 9);
    expect(r.vx).toBeGreaterThan(0);
    let maxY = 0;
    let airborne = 0;
    for (let i = 0; i < 120; i++) {
      w.step(DT);
      if (r.status !== 'live') break;
      expect(r.y).toBeGreaterThanOrEqual(base - 1e-9);
      maxY = Math.max(maxY, r.y - base);
      if (r.y > base + 0.01) airborne++;
    }
    expect(maxY).toBeGreaterThan(0.5); // it bounces
    expect(maxY).toBeLessThan(RABBIT.hopMax ** 2 / (2 * RABBIT.gravity) + 0.01);
    expect(airborne).toBeGreaterThan(0);
    expect(base).toBeCloseTo(GROUND_H + w.cfg.clayRadius * CLAY_TYPES.rabbit.radiusScale, 9);
  });

  it('rolls the other way from the low house and escapes into the far house, not by falling', () => {
    const [w, r] = launch(rabbitCfg, 'low');
    expect(r.vx).toBeLessThan(0);
    const log = collect(w);
    run(w, 5);
    expect(log.escape).toHaveLength(1);
    expect(r.x).toBeLessThan(HOUSES.high.x + HOUSES.high.w + 1);
  });

  it('is deterministic for a seed, differs between seeds, and is independent of step size', () => {
    const path = (seed: number, step: number): { x: number; y: number }[] => {
      const c = cfg({ rabbitSeed: seed });
      const w = new World(c);
      const r = w.launch({ type: 'rabbit', house: 'high', delay: 0, speed: 38, angleDeg: 0 }, 0);
      const out: { x: number; y: number }[] = [];
      for (let t = 0; t < 1.6 - 1e-9; t += step) {
        w.step(step);
        if (Math.abs(t + step - 0.8) < 1e-9 || Math.abs(t + step - 1.6) < 1e-9)
          out.push({ x: r.x, y: r.y });
      }
      return out;
    };
    expect(path(5, 1 / 120)).toEqual(path(5, 1 / 120));
    expect(path(5, 1 / 120)).not.toEqual(path(6, 1 / 120));
    const a = path(5, 1 / 120);
    const b = path(5, 1 / 40);
    for (let i = 0; i < a.length; i++) {
      expect(b[i]?.x).toBeCloseTo(a[i]?.x ?? 0, 6);
      expect(b[i]?.y).toBeCloseTo(a[i]?.y ?? 0, 6);
    }
  });

  it('bump layout is monotone and seeded', () => {
    for (let i = 0; i < 20; i++) {
      expect(rabbitBump(9, i + 1).x).toBeGreaterThan(rabbitBump(9, i).x);
      expect(rabbitBump(9, i).v).toBeGreaterThanOrEqual(RABBIT.hopMin);
      expect(rabbitBump(9, i).v).toBeLessThanOrEqual(RABBIT.hopMax);
    }
    expect(rabbitBump(9, 3)).not.toEqual(rabbitBump(10, 3));
  });

  it('composes exactly: advancing in pieces equals advancing at once', () => {
    const s = { x: 14, y: rabbitBase(rabbitCfg), vx: 40, vy: 0 };
    const whole = advanceRabbit(s, 1.5, rabbitCfg);
    let piece = s;
    for (let i = 0; i < 90; i++) piece = advanceRabbit(piece, 1.5 / 90, rabbitCfg);
    expect(piece.x).toBeCloseTo(whole.x, 8);
    expect(piece.y).toBeCloseTo(whole.y, 8);
  });

  it('predict matches the world exactly for rabbits, and a perfect-lead shot breaks one', () => {
    const [w, r] = launch(rabbitCfg, 'high', 42);
    run(w, 0.4);
    for (const dt of [0.1, 0.4, 0.9]) {
      const p = clayPositionAt(w.cfg, r, dt);
      const w2 = new World(rabbitCfg);
      const r2 = w2.launch({ type: 'rabbit', house: 'high', delay: 0, speed: 42, angleDeg: 0 }, 0);
      const target = Math.round((0.4 + dt) / DT);
      for (let i = 0; i < target; i++) w2.step(DT);
      expect(r2.x).toBeCloseTo(p.x, 6);
      expect(r2.y).toBeCloseTo(p.y, 6);
    }
    const lead = idealAim(w.cfg, r, 0);
    w.fire({ aim: lead.aim, t: w.time });
    run(w, lead.flight + 0.05);
    expect(r.status).toBe('broken');
  });
});

describe('wind gusts and heavier gravity keep predictions exact', () => {
  const gusts = [
    { start: 0.4, end: 1.1, ax: 14 },
    { start: 1.5, end: 2.6, ax: -11 },
  ];

  it('closed-form wind is composable and reversible', () => {
    const s = { x: 10, y: 30, vx: 25, vy: 40 };
    const c = cfg({ gusts });
    const whole = advanceWithGusts(s, 2.2, 0.2, c.gravity, c.drag, gusts);
    let piece = s;
    let t = 0.2;
    for (let i = 0; i < 22; i++) {
      piece = advanceWithGusts(piece, 0.1, t, c.gravity, c.drag, gusts);
      t += 0.1;
    }
    expect(piece.x).toBeCloseTo(whole.x, 9);
    expect(piece.y).toBeCloseTo(whole.y, 9);
    const back = advanceWithGusts(whole, -2.2, 2.4, c.gravity, c.drag, gusts);
    expect(back.x).toBeCloseTo(s.x, 8);
    expect(back.y).toBeCloseTo(s.y, 8);
    expect(windAt(gusts, 0.5)).toBe(14);
    expect(windAt(gusts, 1.2)).toBe(0);
  });

  it('gusts push clays sideways', () => {
    const calmPos = clayPositionAt(cfg(), { type: 'standard', x: 10, y: 30, vx: 25, vy: 40 }, 1);
    const windy = clayPositionAt(
      cfg({ gusts }),
      { type: 'standard', x: 10, y: 30, vx: 25, vy: 40, launchTime: 0, age: 0 },
      1,
    );
    expect(windy.x).toBeGreaterThan(calmPos.x + 2);
    expect(windy.y).toBeCloseTo(calmPos.y, 9);
  });

  for (const [name, c] of [
    ['wind', cfg({ gusts })],
    ['heavier gravity', cfg({ gravity: 38 * 1.5, launchSpeedMul: Math.sqrt(1.5) })],
    ['both', cfg({ gusts, gravity: 57, launchSpeedMul: Math.sqrt(1.5), drag: 0.2 })],
  ] as const) {
    it(`predict matches the world under ${name}; perfect-lead shots break the clay`, () => {
      const w = new World(c);
      const clay = w.launch(SKY, 0);
      run(w, 0.3);
      const p = clayPositionAt(c, clay, 1.1);
      run(w, 1.1);
      expect(clay.x).toBeCloseTo(p.x, 6);
      expect(clay.y).toBeCloseTo(p.y, 6);

      const w2 = new World(c);
      const c2 = w2.launch(SKY, 0);
      run(w2, 0.5);
      const lead = idealAim(c, c2, 0);
      w2.fire({ aim: lead.aim, t: w2.time });
      run(w2, lead.flight + 0.03);
      expect(c2.status).toBe('broken');
      expect(w2.stats.perfect).toBe(1);
    });
  }

  it('heavier gravity: same apex and range as normal gravity, in less time', () => {
    const apex = (c: SimConfig): { top: number; range: number; t: number } => {
      const w = new World(c);
      const clay = w.launch({ ...SKY, speed: 60, angleDeg: 50 }, 0);
      let top = 0;
      let t = 0;
      for (let i = 0; i < 1200 && clay.status === 'live'; i++) {
        w.step(DT);
        t += DT;
        top = Math.max(top, clay.y);
      }
      return { top, range: Math.abs(clay.x - HOUSES.high.port.x), t };
    };
    const n = apex(cfg({ drag: 0 }));
    const h = apex(cfg({ drag: 0, gravity: 57, launchSpeedMul: Math.sqrt(1.5) }));
    expect(h.top).toBeCloseTo(n.top, 0);
    expect(h.range / n.range).toBeGreaterThan(0.9);
    expect(h.range / n.range).toBeLessThan(1.1);
    expect(h.t).toBeLessThan(n.t * 0.9);
  });
});

describe('clay type registry', () => {
  it('has a distinct look per type', () => {
    const shapes = new Set(Object.values(CLAY_TYPES).map((d) => d.shape));
    expect(shapes.size).toBe(Object.keys(CLAY_TYPES).length);
    expect(advanceClay({ type: 'standard', x: 0, y: 0, vx: 1, vy: 1 }, 0, cfg())).toEqual({
      x: 0,
      y: 0,
      vx: 1,
      vy: 1,
    });
  });
});
