import { describe, expect, it } from 'vitest';
import { classifyMiss } from '../src/sim/classify';

const right = { x: 40, y: 0 };
const upRight = { x: 30, y: 30 };

describe('classifyMiss', () => {
  it('ahead / behind along the velocity', () => {
    expect(classifyMiss({ x: 8, y: 0 }, right).reason).toBe('ahead');
    expect(classifyMiss({ x: -8, y: 0 }, right).reason).toBe('behind');
    // moving left: ahead is toward -x
    expect(classifyMiss({ x: -8, y: 0 }, { x: -40, y: 0 }).reason).toBe('ahead');
    expect(classifyMiss({ x: 8, y: 0 }, { x: -40, y: 0 }).reason).toBe('behind');
  });
  it('high / low across the velocity', () => {
    expect(classifyMiss({ x: 0, y: 8 }, right).reason).toBe('high');
    expect(classifyMiss({ x: 0, y: -8 }, right).reason).toBe('low');
    expect(classifyMiss({ x: 0, y: 8 }, { x: -40, y: 0 }).reason).toBe('high');
  });
  it('decomposes along a diagonal flight line', () => {
    const along = { x: 6, y: 6 }; // along (30,30)
    const m = classifyMiss(along, upRight);
    expect(m.reason).toBe('ahead');
    expect(m.along).toBeCloseTo(Math.hypot(6, 6), 6);
    expect(Math.abs(m.across)).toBeLessThan(1e-9);
    const above = classifyMiss({ x: -5, y: 5 }, upRight); // perpendicular, pointing up-left
    expect(above.reason).toBe('high');
    expect(above.across).toBeGreaterThan(0);
    expect(classifyMiss({ x: 5, y: -5 }, upRight).reason).toBe('low');
  });
  it('picks the larger component on mixed offsets', () => {
    expect(classifyMiss({ x: 9, y: 3 }, right).reason).toBe('ahead');
    expect(classifyMiss({ x: 3, y: 9 }, right).reason).toBe('high');
    expect(classifyMiss({ x: -3, y: -9 }, right).reason).toBe('low');
    expect(classifyMiss({ x: -9, y: 3 }, right).reason).toBe('behind');
  });
  it('handles a stationary clay without NaN', () => {
    const m = classifyMiss({ x: 3, y: 1 }, { x: 0, y: 0 });
    expect(Number.isFinite(m.along)).toBe(true);
    expect(m.reason).toBe('ahead');
  });
});
