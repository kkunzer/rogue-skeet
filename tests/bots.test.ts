import { describe, expect, it } from 'vitest';
import { defaultInputConfig, type InputConfig, type SchemeId } from '../src/input/scheme';
import { createScheme } from '../src/input';
import { flickAim, flickDistance, flickSpeedFor } from '../src/input/flick';
import { GUN_ORIGIN } from '../src/sim/field';
import { runBotAttempt } from './helpers/bot';

const SCHEMES: SchemeId[] = ['tap', 'drag', 'flick'];

describe('lead is learnable: perfect-lead bot', () => {
  for (const scheme of SCHEMES) {
    it(`${scheme}: breaks all 24 clays (20/20 throws) with predict.ts aim`, () => {
      const { record, unreachable } = runBotAttempt({ scheme, kind: 'perfect' });
      expect(unreachable).toBe(0);
      expect(record.throws).toHaveLength(20);
      expect(record.clays).toBe(24);
      expect(record.broken).toBe(24);
      expect(record.throwsCleared).toBe(20);
      expect(record.hitRate).toBe(1);
    });
  }
  it('also works with the tap offset and a left-handed drag reticle', () => {
    const input: InputConfig = { ...defaultInputConfig, tapOffsetY: 12, handed: 'left' };
    for (const scheme of ['tap', 'drag'] as const) {
      expect(runBotAttempt({ scheme, kind: 'perfect', input }).record.throwsCleared).toBe(20);
    }
  });
});

describe('lead matters: no-lead bot', () => {
  for (const scheme of SCHEMES) {
    for (const reaction of [0.45, 0.8, 1.2]) {
      it(`${scheme}: aiming at the clay's current position scores < 30% (reaction ${reaction}s)`, () => {
        const { record } = runBotAttempt({ scheme, kind: 'nolead', reaction });
        expect(record.hitRate).toBeLessThan(0.3);
      });
    }
  }
});

describe('control schemes', () => {
  const mk = (id: SchemeId, input: InputConfig = { ...defaultInputConfig }) => {
    const out: { aim: { x: number; y: number }; t: number }[] = [];
    const s = createScheme(id, { cfg: () => input, emit: (i) => out.push(i) });
    return { s, out, input };
  };

  it('tap fires on pointerdown at touch + vertical offset', () => {
    const { s, out } = mk('tap', { ...defaultInputConfig, tapOffsetY: 10 });
    s.onPointer({ type: 'down', id: 1, pos: { x: 30, y: 60 }, t: 1.5 });
    expect(out).toEqual([{ aim: { x: 30, y: 70 }, t: 1.5 }]);
    s.onPointer({ type: 'up', id: 1, pos: { x: 30, y: 60 }, t: 1.6 });
    expect(out).toHaveLength(1);
  });

  it('drag: reticle is offset above the thumb, mirrored for left-handed, fires on release', () => {
    for (const handed of ['right', 'left'] as const) {
      const { s, out, input } = mk('drag', { ...defaultInputConfig, handed });
      s.onPointer({ type: 'down', id: 1, pos: { x: 40, y: 40 }, t: 0 });
      s.onPointer({ type: 'move', id: 1, pos: { x: 50, y: 50 }, t: 0.3 });
      expect(out).toHaveLength(0);
      const sign = handed === 'right' ? -1 : 1;
      const r = s.view().reticle?.pos;
      expect(r?.x).toBeCloseTo(50 + sign * input.reticleOffsetX, 9);
      expect(r?.y).toBeCloseTo(50 + input.reticleOffsetY, 9); // 1:1 drag, above the thumb
      s.onPointer({ type: 'up', id: 1, pos: { x: 50, y: 50 }, t: 0.4 });
      expect(out).toHaveLength(1);
      expect(out[0]?.aim.y).toBeCloseTo(50 + input.reticleOffsetY, 9);
    }
  });

  it('drag: a quick tap with no drag fires the second barrel at the last reticle position', () => {
    const { s, out } = mk('drag');
    s.onPointer({ type: 'down', id: 1, pos: { x: 40, y: 40 }, t: 0 });
    s.onPointer({ type: 'move', id: 1, pos: { x: 60, y: 60 }, t: 0.3 });
    s.onPointer({ type: 'up', id: 1, pos: { x: 60, y: 60 }, t: 0.4 });
    const first = out[0]?.aim;
    // quick tap somewhere else entirely
    s.onPointer({ type: 'down', id: 2, pos: { x: 10, y: 30 }, t: 0.6 });
    s.onPointer({ type: 'up', id: 2, pos: { x: 10, y: 30 }, t: 0.65 });
    expect(out).toHaveLength(2);
    expect(out[1]?.aim).toEqual(first);
    // a slow press without movement is a drag-release at the offset position instead
    s.onPointer({ type: 'down', id: 3, pos: { x: 20, y: 30 }, t: 1 });
    s.onPointer({ type: 'up', id: 3, pos: { x: 20, y: 30 }, t: 1.5 });
    expect(out[2]?.aim).not.toEqual(first);
  });

  it('flick: direction from the gun, speed -> distance through the clamped curve', () => {
    const cfg = { ...defaultInputConfig };
    expect(flickDistance(cfg, 0)).toBe(cfg.flickDistMin);
    expect(flickDistance(cfg, 10_000)).toBe(cfg.flickDistMax);
    const mid = (cfg.flickMinSpeed + cfg.flickMaxSpeed) / 2;
    expect(flickDistance(cfg, mid)).toBeCloseTo((cfg.flickDistMin + cfg.flickDistMax) / 2, 9);
    // inverse
    for (const d of [30, 55, 90])
      expect(flickDistance(cfg, flickSpeedFor(cfg, d) ?? 0)).toBeCloseTo(d, 9);
    expect(flickSpeedFor(cfg, cfg.flickDistMax + 1)).toBeNull();
    // straight up flick lands directly above the gun
    const up = flickAim(cfg, { x: 0, y: mid });
    expect(up.x).toBeCloseTo(GUN_ORIGIN.x, 6);
    expect(up.y).toBeCloseTo(GUN_ORIGIN.y + flickDistance(cfg, mid), 6);
    // gamma shapes the curve
    expect(flickDistance({ ...cfg, flickGamma: 2 }, mid)).toBeLessThan(flickDistance(cfg, mid));
  });

  it('flick: slow or tiny swipes are ignored, a real swipe fires on release', () => {
    const { s, out } = mk('flick');
    s.onPointer({ type: 'down', id: 1, pos: { x: 45, y: 30 }, t: 0 });
    s.onPointer({ type: 'up', id: 1, pos: { x: 45.5, y: 30.5 }, t: 0.1 });
    expect(out).toHaveLength(0);
    s.onPointer({ type: 'down', id: 1, pos: { x: 45, y: 30 }, t: 1 });
    s.onPointer({ type: 'move', id: 1, pos: { x: 45, y: 40 }, t: 1.03 });
    s.onPointer({ type: 'up', id: 1, pos: { x: 45, y: 50 }, t: 1.06 });
    expect(out).toHaveLength(1);
    expect(out[0]?.aim.x).toBeCloseTo(GUN_ORIGIN.x, 6);
    expect(out[0]?.aim.y).toBeGreaterThan(GUN_ORIGIN.y);
  });

  it('flick reaches every ideal aim point in the test set (no unreachable throws)', () => {
    const { unreachable } = runBotAttempt({ scheme: 'flick', kind: 'perfect' });
    expect(unreachable).toBe(0);
  });
});
