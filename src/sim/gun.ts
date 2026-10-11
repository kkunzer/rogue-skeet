import type { SimConfig } from './config';

export type FireStatus = 'ok' | 'cycle' | 'reloading';

/** Double-barrel gun: `barrels` shots, `gunCycle` between shots, `gunReload` after the last one. */
export class Gun {
  loaded: number;
  private nextReadyAt = 0;
  private reloadDoneAt: number | null = null;

  constructor(private readonly cfg: SimConfig) {
    this.loaded = cfg.barrels;
  }

  /** Finish a reload whose time has come. Call with the current sim time. */
  update(t: number): void {
    if (this.reloadDoneAt !== null && t >= this.reloadDoneAt) {
      this.loaded = this.cfg.barrels;
      this.reloadDoneAt = null;
    }
  }

  status(t: number): FireStatus {
    this.update(t);
    if (this.reloadDoneAt !== null || this.loaded <= 0) return 'reloading';
    if (t < this.nextReadyAt) return 'cycle';
    return 'ok';
  }

  /** Fire a barrel at time t. Returns the 0-based barrel index, or null if the gun cannot fire. */
  fire(t: number): number | null {
    if (this.status(t) !== 'ok') return null;
    const barrel = this.cfg.barrels - this.loaded;
    this.loaded -= 1;
    this.nextReadyAt = t + this.cfg.gunCycle;
    if (this.loaded <= 0) this.reloadDoneAt = t + this.cfg.gunReload;
    return barrel;
  }

  get reloading(): boolean {
    return this.reloadDoneAt !== null;
  }

  /** 0..1 reload progress (1 when not reloading). */
  reloadProgress(t: number): number {
    if (this.reloadDoneAt === null) return 1;
    const start = this.reloadDoneAt - this.cfg.gunReload;
    return Math.min(1, Math.max(0, (t - start) / this.cfg.gunReload));
  }
}
