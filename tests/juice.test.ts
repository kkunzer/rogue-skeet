import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../src/core/rng';
import { Juice, type JuiceDeps } from '../src/feel/juice';
import { defaultFeel, applyFeel, type FeelSettings } from '../src/feel/settings';
import { defaultTuning } from '../src/feel/tuning';
import { createScheme } from '../src/input';
import { defaultInputConfig } from '../src/input/scheme';
import { AttemptRunner } from '../src/modes/controlTest/attempt';
import { HitStop } from '../src/render/vfx/hitstop';
import { Shake } from '../src/render/vfx/shake';
import type { ShatterPlan } from '../src/render/vfx/shatter';
import { defaultSimConfig } from '../src/sim/config';
import { idealAim } from '../src/sim/predict';

interface Rig {
  deps: JuiceDeps;
  plans: ShatterPlan[];
  audio: {
    cue: ReturnType<typeof vi.fn>;
    gunReport: ReturnType<typeof vi.fn>;
    crack: ReturnType<typeof vi.fn>;
    thunk: ReturnType<typeof vi.fn>;
  };
  haptic: ReturnType<typeof vi.fn>;
  puffs: number;
  settings: FeelSettings;
  hitstop: HitStop;
  shake: Shake;
}

function rig(juice = true): Rig {
  const settings = { ...defaultFeel(), juice };
  const plans: ShatterPlan[] = [];
  const audio = { cue: vi.fn(), gunReport: vi.fn(), crack: vi.fn(), thunk: vi.fn() };
  const haptic = vi.fn();
  const r: Rig = {
    plans,
    audio,
    haptic,
    puffs: 0,
    settings,
    hitstop: new HitStop(),
    shake: new Shake(),
    deps: undefined as unknown as JuiceDeps,
  };
  r.deps = {
    vfx: {
      shatter: (p) => void plans.push(p),
      puff: () => void r.puffs++,
      ring: () => undefined,
      clear: () => undefined,
    },
    audio,
    haptics: { play: haptic },
    shake: r.shake,
    hitstop: r.hitstop,
    cfg: () => defaultTuning,
    settings: () => settings,
    rng: new Rng('juice-test'),
  };
  return r;
}

/** Plays the same scripted attempt (perfect-lead taps) and records sim positions every step. */
function runScript(attach?: (runner: AttemptRunner) => void): number[] {
  const sim = { ...defaultSimConfig };
  const runner = new AttemptRunner(sim, 1);
  attach?.(runner);
  const scheme = createScheme('tap', {
    cfg: () => ({ ...defaultInputConfig }),
    emit: (i) => void runner.fire(i),
  });
  runner.events.on('throwStart', () => scheme.reset());
  const targeted = new Set<number>();
  const trace: number[] = [];
  for (let i = 0; i < 120 * 60 && runner.state !== 'done'; i++) {
    if (runner.state === 'asking') {
      runner.answer('unsure');
      continue;
    }
    const w = runner.world;
    for (const c of w.liveClays()) {
      if (targeted.has(c.id) || c.age < 0.5 || w.gun.status(w.time) !== 'ok') continue;
      targeted.add(c.id);
      // every third clay is led badly so both hits and misses occur
      const aim = c.id % 3 === 0 ? { x: c.x, y: c.y } : idealAim(sim, c, 0).aim;
      for (const ev of scheme.script(aim).events) scheme.onPointer({ ...ev, t: w.time + ev.t });
      break;
    }
    runner.update(1 / 120);
    for (const c of w.clays) trace.push(c.x, c.y, c.vx, c.vy);
    trace.push(w.stats.hits, w.stats.shots, w.time);
  }
  return trace;
}

describe('Juice (event-driven presentation)', () => {
  it('reacts to shots, hits, perfects, misses and rejects', () => {
    const r = rig();
    const runner = new AttemptRunner({ ...defaultSimConfig }, 1);
    const j = new Juice(r.deps);
    j.attach(runner.world);
    const w = runner.world;
    // advance to the first clay
    let guard = 0;
    while (w.liveClays().length === 0 && guard++ < 1000) runner.update(1 / 120);
    expect(r.audio.thunk).toHaveBeenCalledWith(w.liveClays()[0]!.house);
    for (let i = 0; i < 60; i++) runner.update(1 / 120);
    const c = w.liveClays()[0]!;
    w.fire({ aim: idealAim(defaultSimConfig, c, 0).aim, t: w.time });
    expect(r.audio.gunReport).toHaveBeenCalledTimes(1);
    expect(r.haptic).toHaveBeenCalledWith('shot');
    // second fire inside the cycle time is rejected -> click
    w.fire({ aim: { x: 40, y: 80 }, t: w.time });
    expect(r.audio.cue).toHaveBeenCalledWith('click');
    for (let i = 0; i < 120 && r.plans.length === 0; i++) runner.update(1 / 120);
    expect(r.plans.length).toBeGreaterThanOrEqual(1);
    expect(r.plans[0]!.shards.length).toBeGreaterThanOrEqual(6);
    expect(r.audio.crack).toHaveBeenCalledTimes(r.plans.length);
    expect(r.haptic.mock.calls.some(([k]) => k === 'hit' || k === 'perfect')).toBe(true);
    expect(j.stats.streak).toBe(1);
    expect(r.shake.amp).toBeGreaterThan(0);
    expect(r.hitstop.active).toBe(true);
    // a missed burst resets the streak and puffs
    const c2 = w.liveClays()[0];
    if (c2) {
      for (let i = 0; i < 30; i++) runner.update(1 / 120);
      w.fire({ aim: { x: 80, y: 20 }, t: w.time + 0.2 });
      for (let i = 0; i < 120; i++) runner.update(1 / 120);
      expect(j.stats.streak).toBe(0);
      expect(r.puffs).toBe(1);
    }
    j.detach();
  });

  it('does nothing visual or audible when juice is off', () => {
    const r = rig(false);
    const runner = new AttemptRunner({ ...defaultSimConfig }, 1);
    new Juice(r.deps).attach(runner.world);
    const w = runner.world;
    while (w.liveClays().length === 0) runner.update(1 / 120);
    for (let i = 0; i < 60; i++) runner.update(1 / 120);
    w.fire({ aim: idealAim(defaultSimConfig, w.liveClays()[0]!, 0).aim, t: w.time });
    for (let i = 0; i < 120; i++) runner.update(1 / 120);
    expect(r.plans).toHaveLength(0);
    expect(r.audio.gunReport).not.toHaveBeenCalled();
    expect(r.audio.thunk).not.toHaveBeenCalled();
    expect(r.haptic).not.toHaveBeenCalled();
    expect(r.shake.amp).toBe(0);
    expect(r.hitstop.active).toBe(false);
  });

  it('sim positions are identical with juice on or off for a fixed input script (hit-stop is visual only)', () => {
    const off = runScript();
    let rOn: Rig | null = null;
    const on = runScript((runner) => {
      rOn = rig(true);
      new Juice(rOn.deps).attach(runner.world);
    });
    expect(off.length).toBeGreaterThan(1000);
    expect(on).toEqual(off);
    // and juice really was active in the second run
    expect((rOn as unknown as Rig).plans.length).toBeGreaterThan(5);
    expect((rOn as unknown as Rig).hitstop.count).toBeGreaterThan(0);
  });
});

describe('feel settings persistence helpers', () => {
  it('applyFeel merges valid fields and ignores junk', () => {
    const s = defaultFeel();
    applyFeel(s, { juice: false, sound: false, volume: 7, haptics: 'yes', extra: 1 });
    expect(s.juice).toBe(false);
    expect(s.sound).toBe(false);
    expect(s.volume).toBe(1);
    expect(s.haptics).toBe(true);
    applyFeel(s, null);
    applyFeel(s, { volume: -3 });
    expect(s.volume).toBe(0);
  });
});
