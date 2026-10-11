import { SimClock } from '../src/input/pointer';
import { describe, expect, it } from 'vitest';
import {
  SCHEME_PERMUTATIONS,
  hashString,
  parseTestParams,
  schemeOrderFor,
} from '../src/modes/controlTest/plan';

describe('Latin-square scheme order', () => {
  it('has 6 distinct permutations, each scheme in each position exactly twice', () => {
    expect(new Set(SCHEME_PERMUTATIONS.map((p) => p.join())).size).toBe(6);
    for (let pos = 0; pos < 3; pos++) {
      for (const s of ['tap', 'drag', 'flick']) {
        expect(SCHEME_PERMUTATIONS.filter((p) => p[pos] === s)).toHaveLength(2);
      }
    }
  });
  it('is stable per tester id (case and whitespace insensitive)', () => {
    expect(schemeOrderFor('Kyle')).toEqual(schemeOrderFor('  kyle '));
    expect(schemeOrderFor('kyle')).toEqual(schemeOrderFor('kyle'));
    expect(hashString('kyle')).toBe(hashString('kyle'));
  });
  it('spreads many testers across all 6 orders', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(schemeOrderFor(`tester-${i}`).join());
    expect(seen.size).toBe(6);
  });
  it('restricts to a subset while keeping relative order', () => {
    const full = schemeOrderFor('alice');
    const sub = schemeOrderFor('alice', ['flick', 'tap']);
    expect(sub).toEqual(full.filter((s) => s === 'flick' || s === 'tap'));
  });
  it('parses ?attempts= and ?schemes=', () => {
    expect(parseTestParams('')).toEqual({ attempts: 5, schemes: undefined });
    expect(parseTestParams('?attempts=2&schemes=tap,bogus,flick')).toEqual({
      attempts: 2,
      schemes: ['tap', 'flick'],
    });
    expect(parseTestParams('?attempts=0').attempts).toBe(5);
  });
});

describe('SimClock', () => {
  it('maps event timestamps relative to the last frame anchor', () => {
    const c = new SimClock();
    c.mark(10, 5000);
    expect(c.toSim(5000, 5016)).toBeCloseTo(10, 9);
    expect(c.toSim(5010, 5016)).toBeCloseTo(10.01, 9);
    expect(c.toSim(4990, 5016)).toBeCloseTo(9.99, 9);
  });
  it('falls back to now for timestamps on another clock or in the future', () => {
    const c = new SimClock();
    c.mark(10, 5000);
    expect(c.toSim(1.7e12, 5016)).toBeCloseTo(10.016, 9); // epoch ms
    expect(c.toSim(5100, 5016)).toBeCloseTo(10.016, 9); // future
  });
});
