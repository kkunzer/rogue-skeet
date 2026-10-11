import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

const seq = (r: Rng, n: number): number[] => Array.from({ length: n }, () => r.next());

describe('Rng', () => {
  it('is deterministic for the same numeric seed', () => {
    expect(seq(new Rng(42), 50)).toEqual(seq(new Rng(42), 50));
  });
  it('is deterministic for the same string seed and differs across seeds', () => {
    expect(seq(new Rng('abc'), 20)).toEqual(seq(new Rng('abc'), 20));
    expect(seq(new Rng('abc'), 20)).not.toEqual(seq(new Rng('abd'), 20));
    expect(seq(new Rng(1), 20)).not.toEqual(seq(new Rng(2), 20));
  });
  it('next() stays in [0,1) with a sane mean', () => {
    const r = new Rng(7);
    const xs = seq(r, 10000);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
  it('range and int respect bounds', () => {
    const r = new Rng('bounds');
    for (let i = 0; i < 2000; i++) {
      const f = r.range(-3, 5);
      expect(f).toBeGreaterThanOrEqual(-3);
      expect(f).toBeLessThan(5);
      const n = r.int(2, 4);
      expect([2, 3, 4]).toContain(n);
    }
    const seen = new Set(Array.from({ length: 500 }, () => r.int(1, 6)));
    expect(seen.size).toBe(6);
  });
  it('pick returns members and throws on empty', () => {
    const r = new Rng(3);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr));
    expect(() => r.pick([])).toThrow();
  });
  it('fork is deterministic, label-dependent, and does not advance the parent', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    const fa = a.fork('wind');
    a.fork('other');
    expect(seq(fa, 10)).toEqual(seq(b.fork('wind'), 10));
    expect(seq(new Rng(9).fork('x'), 5)).not.toEqual(seq(new Rng(9).fork('y'), 5));
    expect(seq(a, 10)).toEqual(seq(b, 10));
  });
});
