import { EventBus } from '../core/events';
import type { ClaySpec, ThrowSpec } from './throws';
import type { World } from './world';

export interface DirectorEvents {
  throwStart: { index: number; spec: ThrowSpec; t: number };
  throwEnd: { index: number; spec: ThrowSpec; t: number };
  done: { t: number };
}

/**
 * Feeds throws into a World: waits `startDelay`, launches each throw's clays at their delays,
 * and when every clay of the throw is gone (and no shots are in flight) waits `gapAfter` for the next.
 * `hold()` pauses before the next throw (used for the "Why did you miss?" prompt).
 */
export class ThrowDirector {
  readonly events = new EventBus<DirectorEvents>();
  index = -1;
  finished = false;
  private source: Iterator<ThrowSpec>;
  private current: ThrowSpec | null = null;
  private pending: { at: number; spec: ClaySpec }[] = [];
  private nextAt: number;
  private holding = false;
  private flying = false;

  constructor(
    private readonly world: World,
    source: Iterator<ThrowSpec> | Iterable<ThrowSpec>,
    startDelay = 1.2,
  ) {
    this.source = Symbol.iterator in source ? source[Symbol.iterator]() : source;
    this.nextAt = world.time + startDelay;
  }

  get active(): boolean {
    return this.flying;
  }

  hold(): void {
    this.holding = true;
  }

  /** Release a hold; the next throw starts `delay` seconds from now. */
  release(delay = 0.8): void {
    this.holding = false;
    this.nextAt = this.world.time + delay;
  }

  /** Call once per sim step, before `world.step`. */
  update(): void {
    const w = this.world;
    if (this.finished) return;
    if (!this.flying) {
      if (this.holding || w.time < this.nextAt) return;
      const n = this.source.next();
      if (n.done) {
        this.finished = true;
        this.events.emit('done', { t: w.time });
        return;
      }
      this.index++;
      this.current = n.value;
      this.pending = n.value.clays.map((spec) => ({ at: w.time + spec.delay, spec }));
      this.flying = true;
      this.events.emit('throwStart', { index: this.index, spec: n.value, t: w.time });
    }
    while (this.pending.length && this.pending[0] && this.pending[0].at <= w.time + 1e-9) {
      const p = this.pending.shift();
      if (p) w.launch(p.spec, this.index);
    }
    if (this.pending.length === 0 && this.current) {
      const idx = this.index;
      const live = w.clays.some((c) => c.throwIndex === idx && c.status === 'live');
      if (!live && w.shots.length === 0) {
        const spec = this.current;
        this.flying = false;
        this.current = null;
        this.nextAt = w.time + spec.gapAfter;
        this.events.emit('throwEnd', { index: idx, spec, t: w.time });
      }
    }
  }
}
