import { describe, expect, it } from 'vitest';
import { GameLoop } from '../src/core/loop';

function make(opts: { hz?: number; maxCatchUpSteps?: number } = {}) {
  const log = { updates: 0, alphas: [] as number[] };
  const loop = new GameLoop({
    ...opts,
    update: () => void log.updates++,
    render: (a) => void log.alphas.push(a),
  });
  return { loop, log };
}

describe('GameLoop', () => {
  it('runs 120 fixed steps for one second of elapsed time', () => {
    const { loop, log } = make({ maxCatchUpSteps: 200 });
    loop.advance(1);
    expect(log.updates).toBe(120);
    expect(loop.steps).toBe(120);
    expect(loop.time).toBeCloseTo(1, 9);
  });
  it('accumulates fractional frames without drift', () => {
    const { loop } = make({ maxCatchUpSteps: 1000 });
    for (let i = 0; i < 600; i++) loop.advance(1 / 60); // 10 s at 60 fps
    expect(loop.steps).toBe(1200);
  });
  it('reports the interpolation alpha as the leftover fraction of a step', () => {
    const { loop, log } = make();
    const dt = 1 / 120;
    loop.advance(dt * 2.25);
    expect(loop.steps).toBe(2);
    expect(log.alphas.at(-1)).toBeCloseTo(0.25, 6);
    loop.advance(dt * 0.5);
    expect(loop.steps).toBe(2);
    expect(log.alphas.at(-1)).toBeCloseTo(0.75, 6);
    loop.advance(dt * 0.5);
    expect(loop.steps).toBe(3);
    expect(log.alphas.at(-1)).toBeCloseTo(0.25, 6);
  });
  it('renders exactly once per advance, even with zero sim steps', () => {
    const { loop, log } = make();
    loop.advance(0.001);
    expect(log.updates).toBe(0);
    expect(log.alphas).toHaveLength(1);
  });
  it('clamps catch-up after a long stall and discards the backlog', () => {
    const { loop, log } = make({ maxCatchUpSteps: 10 });
    const ran = loop.advance(5);
    expect(ran).toBe(10);
    expect(log.updates).toBe(10);
    expect(loop.droppedSteps).toBeGreaterThan(500);
    loop.advance(1 / 120);
    expect(log.updates).toBe(11); // no leftover backlog
  });
  it('step(n) drives the sim manually and renders once', () => {
    const { loop, log } = make();
    loop.step(30);
    expect(log.updates).toBe(30);
    expect(log.alphas).toHaveLength(1);
    expect(loop.time).toBeCloseTo(0.25, 9);
  });
  it('honors a custom hz and setHz', () => {
    const { loop } = make({ hz: 60, maxCatchUpSteps: 200 });
    loop.advance(1);
    expect(loop.steps).toBe(60);
    loop.setHz(30);
    loop.advance(1);
    expect(loop.steps).toBe(90);
  });
});
