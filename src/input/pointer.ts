import type { Vec2 } from '../core/vec2';
import { timeScale } from '../core/timescale';
import type { PointerEvt } from './scheme';

/**
 * Maps DOM event timestamps (performance.now() ms) to sim time (seconds). The render loop calls
 * `mark` once per frame with the sim time it is showing; an event that arrived mid-frame is placed
 * relative to that anchor, so a dropped frame doesn't shift when a shot fires.
 */
export class SimClock {
  private perfMs = 0;
  private simSec = 0;
  private marked = false;

  mark(simSec: number, perfMs: number = performance.now()): void {
    this.perfMs = perfMs;
    this.simSec = simSec;
    this.marked = true;
  }

  /**
   * Event timestamp -> sim seconds. Timestamps that are not on the performance.now() clock
   * (synthesized input can carry epoch time) or lie in the future fall back to "now".
   */
  toSim(timeStampMs: number, nowMs: number = performance.now()): number {
    const ts = Math.abs(timeStampMs - nowMs) > 1000 || timeStampMs > nowMs ? nowMs : timeStampMs;
    return this.simSec + ((ts - this.perfMs) / 1000) * timeScale.value;
  }

  /** Sim time "now" (extrapolated from the last frame). */
  now(perfMs: number = performance.now()): number {
    return this.marked ? this.toSim(perfMs) : 0;
  }
}

export interface PointerInputOptions {
  target: HTMLElement;
  clock: SimClock;
  toWorld: (clientX: number, clientY: number) => Vec2;
  onEvent: (e: PointerEvt) => void;
}

/** Listens to pointer events on a target and emits world-space events with sim timestamps. */
export class PointerInput {
  private enabled = true;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly opts: PointerInputOptions) {
    const { target } = opts;
    const bind = (type: string, handler: (e: PointerEvent) => void): void => {
      const fn = handler as EventListener;
      target.addEventListener(type, fn, { passive: false });
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };
    bind('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer ids can't be captured */
      }
      this.emit('down', e);
    });
    bind('pointermove', (e) => this.emit('move', e));
    bind('pointerup', (e) => this.emit('up', e));
    bind('pointercancel', (e) => this.emit('cancel', e));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  private emit(type: PointerEvt['type'], e: PointerEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    this.opts.onEvent({
      type,
      id: e.pointerId,
      pos: this.opts.toWorld(e.clientX, e.clientY),
      t: this.opts.clock.toSim(e.timeStamp),
    });
  }

  destroy(): void {
    for (const c of this.cleanup) c();
    this.cleanup.length = 0;
  }
}
