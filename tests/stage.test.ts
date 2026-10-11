import { describe, expect, it } from 'vitest';
import {
  WORLD_H,
  WORLD_W,
  computeLayout,
  screenToWorld,
  worldToScreen,
} from '../src/render/layout';

describe('computeLayout', () => {
  it('fits exactly on a 9:16 screen', () => {
    const l = computeLayout(450, 800);
    expect(l.scale).toBeCloseTo(5, 9);
    expect(l.left).toBeCloseTo(0, 9);
    expect(l.top).toBeCloseTo(0, 9);
    expect(l.width).toBeCloseTo(450, 9);
    expect(l.height).toBeCloseTo(800, 9);
  });
  it('letterboxes top/bottom on a taller screen (e.g. 9:20)', () => {
    const l = computeLayout(360, 800);
    expect(l.scale).toBeCloseTo(4, 9);
    expect(l.left).toBeCloseTo(0, 9);
    expect(l.height).toBeCloseTo(640, 9);
    expect(l.top).toBeCloseTo(80, 9);
  });
  it('pillarboxes left/right on a wider screen', () => {
    const l = computeLayout(800, 800);
    expect(l.scale).toBeCloseTo(5, 9);
    expect(l.width).toBeCloseTo(450, 9);
    expect(l.left).toBeCloseTo(175, 9);
    expect(l.top).toBeCloseTo(0, 9);
  });
  it('never returns a zero or NaN scale for degenerate sizes', () => {
    const l = computeLayout(0, 0);
    expect(l.scale).toBeGreaterThan(0);
    expect(Number.isFinite(l.left)).toBe(true);
  });
});

describe('world/screen transform', () => {
  const l = computeLayout(360, 800);
  it('maps world origin (bottom-left, y up) to the bottom-left of the playfield', () => {
    expect(worldToScreen(l, { x: 0, y: 0 })).toEqual({ x: 0, y: l.top + l.height });
  });
  it('maps world top-right to the top-right of the playfield', () => {
    const p = worldToScreen(l, { x: WORLD_W, y: WORLD_H });
    expect(p.x).toBeCloseTo(l.left + l.width, 9);
    expect(p.y).toBeCloseTo(l.top, 9);
  });
  it('moving up in world moves up (smaller y) on screen', () => {
    const a = worldToScreen(l, { x: 10, y: 10 });
    const b = worldToScreen(l, { x: 10, y: 20 });
    expect(b.y).toBeLessThan(a.y);
  });
  it('round-trips screen -> world -> screen on several layouts', () => {
    for (const [w, h] of [
      [360, 800],
      [800, 360],
      [390, 844],
      [1024, 768],
    ] as const) {
      const lay = computeLayout(w, h);
      for (const p of [
        { x: 0, y: 0 },
        { x: 45, y: 80 },
        { x: 90, y: 160 },
        { x: 12.5, y: 140.25 },
      ]) {
        const back = screenToWorld(lay, worldToScreen(lay, p));
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });
});
