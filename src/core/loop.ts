/**
 * Fixed-timestep simulation loop with an accumulator.
 *
 * - `update(dt)` runs at a fixed rate (default 120 Hz), dt in seconds.
 * - `render(alpha)` runs once per animation frame; alpha in [0,1) is how far the
 *   accumulator is into the next sim step (for interpolating visuals).
 * - If a frame takes too long, at most `maxCatchUpSteps` steps run; the rest of the
 *   backlog is discarded so the game never spirals.
 * - `advance(seconds)` and `step(n)` drive the loop manually for tests.
 */
export interface LoopOptions {
  hz?: number;
  maxCatchUpSteps?: number;
  update: (dt: number) => void;
  render: (alpha: number) => void;
}

const EPS = 1e-9;

export class GameLoop {
  private hz: number;
  private dt: number;
  private readonly maxCatchUpSteps: number;
  private readonly updateFn: (dt: number) => void;
  private readonly renderFn: (alpha: number) => void;
  private accumulator = 0;
  private rafId = 0;
  private lastTime = 0;
  private running = false;

  /** Total sim steps executed since construction. */
  steps = 0;
  /** Sim time in seconds (steps * dt). */
  time = 0;
  /** Steps dropped by the catch-up clamp (diagnostic). */
  droppedSteps = 0;

  constructor(opts: LoopOptions) {
    this.hz = opts.hz ?? 120;
    this.dt = 1 / this.hz;
    this.maxCatchUpSteps = opts.maxCatchUpSteps ?? 12;
    this.updateFn = opts.update;
    this.renderFn = opts.render;
  }

  get stepSeconds(): number {
    return this.dt;
  }

  get alpha(): number {
    return Math.min(Math.max(this.accumulator / this.dt, 0), 1 - EPS);
  }

  setHz(hz: number): void {
    this.hz = hz;
    this.dt = 1 / hz;
  }

  /** Accumulate `seconds` of real time, run due sim steps, then render once. Returns steps run. */
  advance(seconds: number): number {
    this.accumulator += Math.max(0, seconds);
    let ran = 0;
    while (this.accumulator >= this.dt - EPS) {
      if (ran >= this.maxCatchUpSteps) {
        const dropped = Math.floor((this.accumulator + EPS) / this.dt);
        this.droppedSteps += dropped;
        this.accumulator = 0;
        break;
      }
      this.runStep();
      this.accumulator -= this.dt;
      ran++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.renderFn(this.alpha);
    return ran;
  }

  /** Run exactly `n` sim steps (no accumulator involvement) and render once. For tests/bots. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.runStep();
    this.renderFn(this.alpha);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const elapsed = (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.advance(elapsed);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private runStep(): void {
    this.updateFn(this.dt);
    this.steps++;
    this.time = this.steps * this.dt;
  }
}
