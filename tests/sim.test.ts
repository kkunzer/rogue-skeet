import { describe, expect, it } from 'vitest';
import { advanceBallistic } from '../src/sim/ballistics';
import { defaultSimConfig, type SimConfig } from '../src/sim/config';
import { ThrowDirector } from '../src/sim/director';
import { GUN_ORIGIN, clampAim } from '../src/sim/field';
import { Gun } from '../src/sim/gun';
import { HOUSES } from '../src/sim/houses';
import { clayPositionAt, idealAim } from '../src/sim/predict';
import { effectivePatternRadius, flightTime, hitRadius, isPerfect } from '../src/sim/shot';
import { TEST_THROWS, buildTestSet, type ClaySpec } from '../src/sim/throws';
import { World } from '../src/sim/world';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({ ...defaultSimConfig, ...over });
const SPEC: ClaySpec = { type: 'standard', house: 'high', delay: 0, speed: 70, angleDeg: 55 };

function flyClay(c: SimConfig, spec: ClaySpec, dt: number, seconds: number) {
  const w = new World(c);
  const clay = w.launch(spec, 0);
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) w.step(dt);
  return { x: clay.x, y: clay.y, vx: clay.vx, vy: clay.vy };
}

describe('ballistics', () => {
  it('is deterministic', () => {
    expect(flyClay(cfg(), SPEC, 1 / 120, 1)).toEqual(flyClay(cfg(), SPEC, 1 / 120, 1));
  });
  it('is independent of step size (closed form)', () => {
    const a = flyClay(cfg(), SPEC, 1 / 120, 1);
    const b = flyClay(cfg(), SPEC, 1 / 60, 1);
    const c = flyClay(cfg(), SPEC, 1 / 240, 1);
    for (const o of [b, c]) {
      expect(o.x).toBeCloseTo(a.x, 6);
      expect(o.y).toBeCloseTo(a.y, 6);
    }
  });
  it('matches the no-drag parabola when drag is 0, and slows with drag', () => {
    const k = advanceBallistic({ x: 0, y: 0, vx: 10, vy: 20 }, 2, 38, 0);
    expect(k.x).toBeCloseTo(20, 9);
    expect(k.y).toBeCloseTo(20 * 2 - 0.5 * 38 * 4, 9);
    const d = advanceBallistic({ x: 0, y: 0, vx: 10, vy: 20 }, 2, 38, 0.3);
    expect(d.x).toBeLessThan(20);
  });
  it('can be run backwards (negative dt) to the starting state', () => {
    const s = { x: 3, y: 4, vx: 20, vy: 30 };
    const fwd = advanceBallistic(s, 0.8, 38, 0.15);
    const back = advanceBallistic(fwd, -0.8, 38, 0.15);
    expect(back.x).toBeCloseTo(s.x, 9);
    expect(back.y).toBeCloseTo(s.y, 9);
  });
  it('launches from the house port, high house to the right and low house to the left', () => {
    const w = new World(cfg());
    const hi = w.launch({ ...SPEC, house: 'high' }, 0);
    const lo = w.launch({ ...SPEC, house: 'low' }, 0);
    expect(hi.x).toBe(HOUSES.high.port.x);
    expect(hi.vx).toBeGreaterThan(0);
    expect(lo.vx).toBeLessThan(0);
    expect(HOUSES.high.port.y).toBeGreaterThan(HOUSES.low.port.y);
  });
});

describe('shot model', () => {
  it('flight time = base + distance / speed, in the 150-350 ms band across the playfield', () => {
    const c = cfg();
    const aim = { x: GUN_ORIGIN.x, y: GUN_ORIGIN.y + 40 };
    expect(flightTime(c, GUN_ORIGIN, aim)).toBeCloseTo(c.shotBaseTime + 40 / c.shotSpeed, 9);
    const t = buildTestSet().flatMap((th) => th.clays);
    for (const spec of t) {
      const w = new World(c);
      const clay = w.launch(spec, 0);
      for (let i = 0; i < 120 * 3 && clay.status === 'live'; i++) {
        w.step(1 / 120);
        if (clay.status === 'live' && clay.age > 0.4) {
          const f = idealAim(c, clay, 0).flight;
          expect(f).toBeGreaterThan(0.15);
          expect(f).toBeLessThan(0.35);
        }
      }
    }
  });
  it('pattern radius scales with aim assist up to +50%', () => {
    expect(effectivePatternRadius(cfg({ aimAssist: 0 }))).toBe(5);
    expect(effectivePatternRadius(cfg({ aimAssist: 0.5 }))).toBeCloseTo(7.5, 9);
    expect(effectivePatternRadius(cfg({ aimAssist: 2 }))).toBeCloseTo(7.5, 9); // capped
    expect(effectivePatternRadius(cfg({ aimAssist: -1 }))).toBe(5);
  });
  it('breaks a clay just inside pattern + clay radius and not just outside', () => {
    // A stationary clay (no gravity, no speed) makes the boundary exact.
    const c = cfg({ gravity: 0, drag: 0 });
    const R = hitRadius(c, 'standard');
    expect(R).toBeCloseTo(7.2, 9);
    const port = HOUSES.low.port;
    for (const [off, expectHit] of [
      [R - 0.05, true],
      [R + 0.05, false],
    ] as const) {
      const w = new World(c);
      w.launch({ ...SPEC, house: 'low', speed: 0 }, 0);
      w.fire({ aim: { x: port.x - off, y: port.y }, t: 0 });
      for (let i = 0; i < 120; i++) w.step(1 / 120);
      expect(w.stats.hits).toBe(expectHit ? 1 : 0);
    }
  });
  it('aim assist widens the hit radius', () => {
    const port = HOUSES.low.port;
    const run = (assist: number) => {
      const c = cfg({ gravity: 0, drag: 0, aimAssist: assist });
      const w = new World(c);
      w.launch({ ...SPEC, house: 'low', speed: 0 }, 0);
      w.fire({ aim: { x: port.x - 9, y: port.y }, t: 0 });
      for (let i = 0; i < 120; i++) w.step(1 / 120);
      return w.stats.hits;
    };
    expect(run(0)).toBe(0); // 9 > 7.2
    expect(run(0.5)).toBe(1); // 9 < 7.5 + 2.2
  });
  it('hit test is exact at the burst instant (boundary), using clay position at arrival', () => {
    const c = cfg();
    const w = new World(c);
    const clay = w.launch(SPEC, 0);
    const shot = w.fire({ aim: { x: 40, y: 70 }, t: 0 });
    const at = clayPositionAt(c, clay, shot?.arriveTime ?? 0);
    const d = Math.hypot(at.x - 40, at.y - 70);
    for (let i = 0; i < 60 && w.shots.length; i++) w.step(1 / 120);
    expect(w.stats.hits).toBe(d < hitRadius(c, 'standard') ? 1 : 0);
  });
  it('perfect hit is the inner 35% of the hit radius', () => {
    const c = cfg();
    const R = hitRadius(c, 'standard');
    expect(isPerfect(c, 'standard', 0.35 * R - 0.01)).toBe(true);
    expect(isPerfect(c, 'standard', 0.35 * R + 0.01)).toBe(false);
  });
  it('a perfect-lead shot is a perfect hit', () => {
    const c = cfg();
    const w = new World(c);
    const clay = w.launch(SPEC, 0);
    for (let i = 0; i < 60; i++) w.step(1 / 120);
    const lead = idealAim(c, clay, 0);
    w.fire({ aim: lead.aim, t: w.time });
    for (let i = 0; i < 120 && w.shots.length; i++) w.step(1 / 120);
    expect(w.stats.hits).toBe(1);
    expect(w.stats.perfect).toBe(1);
  });
  it('clampAim keeps aim inside the playfield above the ground', () => {
    const p = clampAim({ x: -5, y: 0 });
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(12);
  });
});

describe('gun', () => {
  it('fires two barrels 120 ms apart, then reloads 700 ms after the second', () => {
    const g = new Gun(cfg());
    expect(g.fire(0)).toBe(0);
    expect(g.status(0.05)).toBe('cycle');
    expect(g.fire(0.05)).toBeNull();
    expect(g.status(0.12)).toBe('ok');
    expect(g.fire(0.12)).toBe(1);
    expect(g.loaded).toBe(0);
    expect(g.status(0.5)).toBe('reloading');
    expect(g.reloadProgress(0.12 + 0.35)).toBeCloseTo(0.5, 6);
    expect(g.status(0.12 + 0.699)).toBe('reloading');
    expect(g.status(0.12 + 0.7)).toBe('ok');
    expect(g.loaded).toBe(2);
  });
  it('the world rejects fire while cycling or reloading and emits reject', () => {
    const w = new World(cfg());
    const rejects: string[] = [];
    w.events.on('reject', (r) => rejects.push(r.reason));
    expect(w.fire({ aim: { x: 40, y: 70 }, t: 0 })).not.toBeNull();
    expect(w.fire({ aim: { x: 40, y: 70 }, t: 0.05 })).toBeNull();
    expect(w.fire({ aim: { x: 40, y: 70 }, t: 0.13 })).not.toBeNull();
    expect(w.fire({ aim: { x: 40, y: 70 }, t: 0.4 })).toBeNull();
    expect(rejects).toEqual(['cycle', 'reloading']);
  });
});

describe('predict', () => {
  it('idealAim lands exactly on the clay at burst time', () => {
    const c = cfg();
    const w = new World(c);
    const clay = w.launch(SPEC, 0);
    for (let i = 0; i < 50; i++) w.step(1 / 120);
    const lead = idealAim(c, clay, 0.05);
    const at = clayPositionAt(c, clay, 0.05 + lead.flight);
    expect(Math.hypot(at.x - lead.aim.x, at.y - lead.aim.y)).toBeLessThan(1e-6);
    expect(lead.flight).toBeCloseTo(flightTime(c, GUN_ORIGIN, lead.aim), 6);
  });
});

describe('throws and director', () => {
  it('the control-test set is 16 singles + 4 doubles, both houses, standard only, and fixed', () => {
    const a = buildTestSet();
    expect(a).toHaveLength(TEST_THROWS);
    expect(a.filter((t) => t.kind === 'single')).toHaveLength(16);
    expect(a.filter((t) => t.kind === 'double')).toHaveLength(4);
    const clays = a.flatMap((t) => t.clays);
    expect(clays.every((c) => c.type === 'standard')).toBe(true);
    expect(clays.filter((c) => c.house === 'high').length).toBeGreaterThanOrEqual(10);
    expect(clays.filter((c) => c.house === 'low').length).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(buildTestSet())).toBe(JSON.stringify(a));
    expect(JSON.stringify(buildTestSet('other-seed'))).not.toBe(JSON.stringify(a));
  });
  it('director runs throws one at a time and waits for hold', () => {
    const w = new World(cfg());
    const d = new ThrowDirector(w, buildTestSet().slice(0, 2), 0.5);
    const log: string[] = [];
    d.events.on('throwStart', (e) => log.push(`start${e.index}`));
    d.events.on('throwEnd', (e) => {
      log.push(`end${e.index}`);
      d.hold();
    });
    d.events.on('done', () => log.push('done'));
    for (let i = 0; i < 120 * 12; i++) {
      d.update();
      w.step(1 / 120);
    }
    expect(log).toEqual(['start0', 'end0']); // held after the first throw
    d.release(0.1);
    for (let i = 0; i < 120 * 12 && !log.includes('end1'); i++) {
      d.update();
      w.step(1 / 120);
    }
    expect(log).toContain('start1');
    expect(log).toContain('end1');
  });
});
