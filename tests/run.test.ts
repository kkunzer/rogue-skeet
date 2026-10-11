import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/feel/tuning';
import { clayPoints, comboMult } from '../src/modes/run/scoring';
import { RunController, type RunConfig, type RunPhase } from '../src/modes/run/runState';
import {
  FLURRY_CLAYS,
  FLURRY_SECONDS,
  ROUNDS,
  buildRoundThrows,
  type RoundDef,
} from '../src/modes/run/stationData';
import { HOUSES } from '../src/sim/houses';
import { idealAim } from '../src/sim/predict';
import { firstOf, playRun } from './helpers/runBot';

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  ...(defaultTuning as RunConfig),
  ...over,
});
const DT = 1 / 120;

const tiny = (over: Partial<RoundDef> = {}): RoundDef => ({
  id: 'r1',
  hud: 'Round 1/4',
  title: 'Round 1 — Test',
  blurb: '',
  shells: 10,
  throws: 2,
  doubles: 0,
  specials: {},
  ...over,
});
const tinyBoss = (over: Partial<RoundDef> = {}): RoundDef =>
  tiny({ id: 'boss', hud: 'BOSS', throws: 1, boss: true, clays: 1, shells: 2, ...over });

/** A controller over `rounds`; a plain round list gets a boss tacked on so the last round is not the boss. */
function make(rounds: RoundDef[], seed = 's1'): RunController {
  const list = rounds.some((r) => r.boss) ? rounds : [...rounds, tinyBoss()];
  return new RunController({
    seed,
    scheme: 'tap',
    config: config(),
    rounds: list,
    startDelay: 0.3,
  });
}

/** Step until `done()` or the clock runs out. */
function until(ctl: RunController, done: () => boolean, seconds = 60): void {
  for (let i = 0; i < seconds / DT && !done(); i++) ctl.update(DT);
}

/** Fire at the exact lead point of the first live clay that is old enough. */
function shootFirst(ctl: RunController): boolean {
  const w = ctl.world;
  const c = w.liveClays().find((x) => x.age > 0.3 && x.hitsLeft > 0);
  if (!c || w.gun.status(w.time) !== 'ok') return false;
  return ctl.fire({ aim: idealAim(w.cfg, c, 0).aim, t: w.time }) !== null;
}

describe('station data', () => {
  it('has four rounds and a boss with the planned pools', () => {
    expect(ROUNDS.map((r) => r.shells)).toEqual([16, 20, 18, 22, 18]);
    expect(ROUNDS.slice(0, 4).every((r) => r.throws >= 8 && r.throws <= 9)).toBe(true);
    expect(ROUNDS[4]?.boss).toBe(true);
  });

  it('builds the throws per round: counts, doubles, special types, deterministic', () => {
    for (let round = 0; round < 4; round++) {
      const def = ROUNDS[round] as RoundDef;
      const a = buildRoundThrows('seedX', round);
      expect(a).toHaveLength(def.throws);
      expect(a.filter((t) => t.kind === 'double')).toHaveLength(def.doubles);
      expect(a[0]?.clays.every((c) => c.type === 'standard')).toBe(true);
      const all = a.flatMap((t) => t.clays);
      for (const [type, n] of Object.entries(def.specials))
        expect(all.filter((c) => c.type === type)).toHaveLength(n);
      expect(buildRoundThrows('seedX', round)).toEqual(a);
      expect(buildRoundThrows('seedY', round)).not.toEqual(a);
    }
    // rounds introduce one new type each, in order
    const types = (r: number): Set<string> =>
      new Set(buildRoundThrows('s', r).flatMap((t) => t.clays.map((c) => c.type)));
    expect(types(0)).toEqual(new Set(['standard']));
    expect(types(1).has('splitter')).toBe(true);
    expect(types(2).has('rabbit')).toBe(true);
    expect(types(3).has('armored')).toBe(true);
    expect(types(3).has('splitter') && types(3).has('rabbit')).toBe(true);
  });

  it('rabbits only come from the high or low house', () => {
    for (let r = 0; r < 5; r++)
      for (const t of buildRoundThrows('rabbits', r).flatMap((x) => x.clays))
        if (t.type === 'rabbit') expect(['high', 'low']).toContain(t.house);
  });

  it('the boss is one flurry of 12 clays from three houses within about 3 seconds', () => {
    const [flurry, ...rest] = buildRoundThrows('boss-seed', 4);
    expect(rest).toHaveLength(0);
    expect(flurry?.clays).toHaveLength(FLURRY_CLAYS);
    const houses = new Set(flurry?.clays.map((c) => c.house));
    expect(houses).toEqual(new Set(['high', 'low', 'center']));
    const delays = flurry?.clays.map((c) => c.delay) ?? [];
    expect(Math.min(...delays)).toBe(0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(FLURRY_SECONDS + 0.1);
    expect(Math.max(...delays)).toBeGreaterThan(FLURRY_SECONDS - 0.3);
    const types = new Set(flurry?.clays.map((c) => c.type));
    expect(types.size).toBeGreaterThanOrEqual(4); // mixed
    expect(HOUSES.center.port.y).toBeLessThan(HOUSES.low.port.y);
  });
});

describe('run state machine', () => {
  it('starts at the intro card, then plays with the round pool', () => {
    const ctl = make([tiny({ shells: 7 })]);
    expect(ctl.phase).toBe('intro');
    const phases: RunPhase[] = [];
    ctl.events.on('phase', (e) => phases.push(e.phase));
    ctl.startRound();
    expect(ctl.phase).toBe('playing');
    expect(ctl.shells).toBe(7);
    expect(phases).toEqual(['playing']);
    ctl.startRound(); // no-op outside the intro
    expect(ctl.shells).toBe(7);
  });

  it('every shot costs a shell; a rejected tap does not', () => {
    const ctl = make([tiny({ shells: 7, throws: 3 })]);
    ctl.startRound();
    until(ctl, () => ctl.world.liveClays().some((c) => c.age > 0.4));
    expect(shootFirst(ctl)).toBe(true);
    expect(ctl.shells).toBe(6);
    // same instant again: the gun is cycling, so the tap is rejected and costs nothing
    expect(ctl.fire({ aim: { x: 40, y: 80 }, t: ctl.world.time })).toBeNull();
    expect(ctl.shells).toBe(6);
  });

  it('an escaped clay costs one more shell, and a round ends when its throws are done', () => {
    const ctl = make([tiny({ shells: 10, throws: 2 })]);
    ctl.startRound();
    until(ctl, () => ctl.phase !== 'playing');
    expect(ctl.phase).toBe('roundClear'); // never shooting does not lose while shells remain
    expect(ctl.shells).toBe(8); // two clays escaped
    expect(ctl.world.stats.escapes).toBe(2);
    expect(ctl.streak).toBe(0);
  });

  it('running out of shells while clays are live or still scheduled loses the run', () => {
    const ctl = make([tiny({ shells: 2, throws: 4 })]);
    ctl.startRound();
    until(ctl, () => ctl.phase !== 'playing');
    expect(ctl.phase).toBe('lost');
    expect(ctl.shells).toBe(0);
    expect(ctl.summary().cleared).toBe(false);
    expect(ctl.summary().roundReached).toBe(1);
  });

  it('a miss that burns the last shell with the clay still up loses; a kill with the last shell does not', () => {
    const miss = make([tiny({ shells: 1, throws: 1 })]);
    miss.startRound();
    until(miss, () => miss.world.liveClays().some((c) => c.age > 0.4));
    miss.fire({ aim: { x: 5, y: 150 }, t: miss.world.time });
    until(miss, () => miss.phase !== 'playing');
    expect(miss.phase).toBe('lost');

    const kill = make([tiny({ shells: 1, throws: 1 })]);
    kill.startRound();
    until(kill, () => kill.world.liveClays().some((c) => c.age > 0.4));
    expect(shootFirst(kill)).toBe(true);
    until(kill, () => kill.phase !== 'playing');
    expect(kill.shells).toBe(0);
    expect(kill.phase).toBe('roundClear');
  });

  it('a shot in flight gets to land before the empty pool ends the run', () => {
    const ctl = make([tiny({ shells: 1, throws: 1 })]);
    ctl.startRound();
    until(ctl, () => ctl.world.liveClays().some((c) => c.age > 0.4));
    shootFirst(ctl);
    expect(ctl.shells).toBe(0);
    ctl.update(DT);
    expect(ctl.phase).toBe('playing'); // shell fired, burst not yet resolved
  });

  it('boss: cleared when shells remain at the end of the flurry, lost if the pool is empty', () => {
    const win = make([tinyBoss({ shells: 2 })]);
    win.startRound();
    until(win, () => win.world.liveClays().some((c) => c.age > 0.4));
    shootFirst(win);
    until(win, () => win.over);
    expect(win.phase).toBe('won');
    expect(win.shells).toBe(1);
    expect(win.summary().cleared).toBe(true);
    expect(win.summary().roundReached).toBe(1);

    const spent = make([tinyBoss({ shells: 1 })]);
    spent.startRound();
    until(spent, () => spent.world.liveClays().some((c) => c.age > 0.4));
    shootFirst(spent);
    until(spent, () => spent.over);
    expect(spent.shells).toBe(0);
    expect(spent.phase).toBe('lost');
  });

  it('the boss has its own pool and a full-size flurry', () => {
    const ctl = new RunController({ seed: 'b', scheme: 'tap', config: config() });
    ctl.round = 4;
    ctl.startRound();
    expect(ctl.isBoss).toBe(true);
    expect(ctl.shells).toBe(18);
    until(ctl, () => ctl.world.stats.launched >= 12, 8);
    expect(ctl.world.stats.launched).toBe(12);
  });

  it('shell bonus tuning shifts every pool', () => {
    const ctl = new RunController({
      seed: 'b',
      scheme: 'tap',
      config: config({ runShellBonus: 3 }),
    });
    ctl.startRound();
    expect(ctl.shells).toBe(19);
  });
});

describe('scoring', () => {
  it('100 per clay x combo (+0.1 per consecutive hit, cap x3) x perfect x upgrades', () => {
    expect(clayPoints({ base: 100, combo: 1, perfect: false, mult: 1 })).toBe(100);
    expect(clayPoints({ base: 100, combo: 1, perfect: true, mult: 1 })).toBe(150);
    expect(clayPoints({ base: 100, combo: 1.5, perfect: false, mult: 2 })).toBe(300);
    expect(clayPoints({ base: 100, combo: comboMult(50), perfect: true, mult: 1.5 })).toBe(675);
  });

  it('a perfect-lead run scores 150, 165, 180... and a miss breaks the combo', () => {
    const ctl = make([tiny({ shells: 14, throws: 6 })]);
    const scores: number[] = [];
    ctl.events.on('score', (e) => scores.push(e.points));
    ctl.startRound();
    const shot = new Set<number>();
    let missed = false;
    until(ctl, () => {
      if (ctl.phase !== 'playing') return true;
      const w = ctl.world;
      if (w.gun.status(w.time) !== 'ok' || w.shots.length > 0) return false;
      if (scores.length === 3 && !missed) {
        missed = true;
        ctl.fire({ aim: { x: 5, y: 150 }, t: w.time }); // far from any clay
        return false;
      }
      const c = w.liveClays().find((x) => x.age > 0.3 && !shot.has(x.id));
      if (c) {
        shot.add(c.id);
        ctl.fire({ aim: idealAim(w.cfg, c, 0).aim, t: w.time });
      }
      return false;
    });
    expect(scores.slice(0, 3)).toEqual([150, 165, 180]);
    // after the miss the combo starts again from x1.0
    expect(scores[3]).toBe(150);
    expect(ctl.world.stats.perfect).toBeGreaterThanOrEqual(4);
  });

  it('streak resets on a miss and on an escape', () => {
    const ctl = make([tiny({ shells: 12, throws: 3 })]);
    ctl.startRound();
    until(ctl, () => ctl.world.liveClays().some((c) => c.age > 0.4));
    shootFirst(ctl);
    until(ctl, () => ctl.streak === 1, 3);
    expect(ctl.streak).toBe(1);
    expect(ctl.comboNow).toBeCloseTo(1.1, 9);
    until(ctl, () => ctl.world.liveClays().some((c) => c.age > 0.4), 20);
    ctl.fire({ aim: { x: 5, y: 150 }, t: ctl.world.time });
    until(ctl, () => ctl.streak === 0, 3);
    expect(ctl.streak).toBe(0);
  });
});

describe('full runs', () => {
  it('flows intro -> playing -> roundClear -> draft x4 -> boss -> won, with fresh offers each draft', () => {
    const seen: string[] = [];
    const offers: string[][] = [];
    const r = playRun({
      seed: 'flow',
      onStep: (ctl) => {
        if (seen[seen.length - 1] !== ctl.phase) {
          seen.push(ctl.phase);
          if (ctl.phase === 'draft') offers.push([...ctl.offers]);
        }
      },
    });
    expect(r.won).toBe(true);
    expect(seen.slice(0, 5)).toEqual(['intro', 'playing', 'roundClear', 'draft', 'intro']);
    expect(seen.filter((p) => p === 'draft')).toHaveLength(4);
    expect(seen.filter((p) => p === 'roundClear')).toHaveLength(4);
    expect(r.ctl.owned).toHaveLength(4);
    expect(new Set(r.ctl.owned).size).toBe(4);
    expect(r.ctl.round).toBe(4);
    for (const o of offers) expect(o).toHaveLength(3);
    // offers never include something already picked
    offers.forEach((o, i) => {
      for (const id of r.ctl.owned.slice(0, i)) expect(o).not.toContain(id);
    });
    const s = r.ctl.summary();
    expect(s.cleared).toBe(true);
    expect(s.roundReached).toBe(5);
    expect(s.picks).toHaveLength(4);
    expect(s.shellsLeft).toHaveLength(5);
  });

  it('is deterministic: the same seed and bot give the same run', () => {
    const a = playRun({ seed: 'det-1' });
    const b = playRun({ seed: 'det-1' });
    expect(a.score).toBe(b.score);
    expect(a.ctl.owned).toEqual(b.ctl.owned);
    expect(a.shellsLeft).toEqual(b.shellsLeft);
    expect(playRun({ seed: 'det-2' }).score).not.toBe(a.score);
  });

  it('a perfect-lead bot clears the whole run (boss included) on several seeds, with shells to spare', () => {
    for (const seed of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      const r = playRun({ seed });
      expect(r.won, `seed ${seed}`).toBe(true);
      expect(r.score).toBeGreaterThan(10000);
      for (const left of r.shellsLeft) expect(left).toBeGreaterThan(0);
    }
  });

  it('a perfect-lead bot also clears with the weakest picks (no cascade upgrades)', () => {
    for (const seed of ['w1', 'w2', 'w3', 'w4']) {
      const r = playRun({ seed, pick: firstOf('curse', 'gravity', 'wind', 'slug') });
      expect(r.won, `seed ${seed}`).toBe(true);
    }
  });

  it('a bot that never leads loses early', () => {
    for (const seed of ['n1', 'n2', 'n3']) {
      const r = playRun({ seed, kind: 'nolead' });
      expect(r.won).toBe(false);
      expect(r.ctl.round).toBeLessThanOrEqual(1);
    }
  });

  it('upgrades picked in the draft reshape the next rounds', () => {
    const r = playRun({
      seed: 'shape',
      pick: firstOf('gravity', 'wind', 'slug', 'chain', 'explosive', 'curse'),
    });
    expect(r.ctl.owned).toContain('gravity');
    expect(r.won).toBe(true);
  });

  it('picking a physics mod previews the next 3 throws', () => {
    let checked = false;
    for (let n = 0; n < 12 && !checked; n++) {
      const flags: Record<number, Record<number, boolean>> = {};
      let previewAtPick = -1;
      const r = playRun({
        seed: `pv${n}`,
        pick: firstOf('wind', 'gravity'),
        onStep: (ctl) => {
          if (ctl.phase === 'draft' && ctl.round === 0) previewAtPick = ctl.previewLeft;
          if (ctl.phase === 'playing' && ctl.director.index >= 0)
            (flags[ctl.round] ??= {})[ctl.director.index] = ctl.isPreviewed({
              throwIndex: ctl.director.index,
            });
        },
      });
      if (r.ctl.owned[0] !== 'wind' && r.ctl.owned[0] !== 'gravity') continue;
      checked = true;
      expect(previewAtPick).toBe(0);
      const round1 = flags[1] ?? {};
      expect([0, 1, 2, 3, 4].map((i) => round1[i])).toEqual([true, true, true, false, false]);
      expect(Object.values(flags[0] ?? {}).some(Boolean)).toBe(false);
    }
    expect(checked).toBe(true);
  });
});
