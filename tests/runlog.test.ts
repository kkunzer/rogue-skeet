import { describe, expect, it } from 'vitest';
import {
  loadRuns,
  parseRunLog,
  rateRun,
  runsToJSON,
  saveRun,
  validateRunSummary,
  type KeyValueStore,
  type RunSummary,
} from '../src/modes/run/runLog';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};

const run = (n: number, over: Partial<RunSummary> = {}): RunSummary => ({
  v: 1,
  id: `2026-10-12T10:00:0${n}Z|seed${n}`,
  seed: `seed${n}`,
  picks: ['chain', 'explosive', 'slug'],
  score: 12345 + n,
  roundReached: 5,
  cleared: true,
  breaksByType: { standard: 20, splitter: 3, rabbit: 2 },
  synergies: ['shrapnelStorm'],
  freshRating: null,
  scheme: 'tap',
  buildSha: 'abc1234',
  timestamp: `2026-10-12T10:00:0${n}.000Z`,
  shellsLeft: [6, 5, 5, 8, 7],
  shots: 62,
  hits: 60,
  ...over,
});

describe('run log', () => {
  it('saves newest first, upserts by id and survives a reload', () => {
    const store = mem();
    expect(loadRuns(store)).toEqual([]);
    expect(saveRun(run(1), store)).toBe(true);
    expect(saveRun(run(2), store)).toBe(true);
    expect(loadRuns(store).map((r) => r.seed)).toEqual(['seed2', 'seed1']);
    saveRun(run(1, { score: 1 }), store);
    const runs = loadRuns(store);
    expect(runs).toHaveLength(2);
    expect(runs.find((r) => r.seed === 'seed1')?.score).toBe(1);
  });

  it('records the felt-fresh rating', () => {
    const store = mem();
    saveRun(run(1), store);
    expect(rateRun(run(1).id, 4, store)).toBe(true);
    expect(loadRuns(store)[0]?.freshRating).toBe(4);
    expect(rateRun('missing', 3, store)).toBe(false);
  });

  it('keeps the required fields and validates them', () => {
    const r = run(1);
    expect(validateRunSummary(r)).toEqual([]);
    for (const k of [
      'seed',
      'picks',
      'score',
      'roundReached',
      'cleared',
      'breaksByType',
      'synergies',
      'freshRating',
      'scheme',
      'buildSha',
      'timestamp',
    ])
      expect(Object.keys(r)).toContain(k);
    expect(validateRunSummary({ ...r, picks: ['nope'] })).not.toEqual([]);
    expect(validateRunSummary({ ...r, freshRating: 9 })).not.toEqual([]);
    expect(validateRunSummary({ ...r, roundReached: 0 })).not.toEqual([]);
    expect(validateRunSummary({ ...r, scheme: 'laser' })).not.toEqual([]);
    expect(validateRunSummary(null)).not.toEqual([]);
  });

  it('exports JSON that parses back to the same runs', () => {
    const runs = [run(2, { freshRating: 5 }), run(1)];
    const text = runsToJSON(runs);
    expect(parseRunLog(text)).toEqual(runs);
    expect(parseRunLog('{"kind":"nope"}')).toBeNull();
    expect(parseRunLog('not json')).toBeNull();
    // invalid rows are dropped, not fatal
    const bad = JSON.stringify({ kind: 'run-log', runs: [run(1), { seed: 'x' }] });
    expect(parseRunLog(bad)).toHaveLength(1);
  });

  it('tolerates corrupt or missing storage', () => {
    const store = mem();
    store.setItem('rogue-skeet.runlog.v1', '{broken');
    expect(loadRuns(store)).toEqual([]);
    store.setItem('rogue-skeet.runlog.v1', JSON.stringify([run(1), { nope: true }]));
    expect(loadRuns(store)).toHaveLength(1);
    expect(saveRun(run(1), null)).toBe(false);
    const throwing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveRun(run(1), throwing)).toBe(false);
  });
});
