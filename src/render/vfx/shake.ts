/** Decaying screen shake. Pure; the caller applies the offset to the world container. */
export class Shake {
  /** Current amplitude, world units. */
  amp = 0;
  constructor(private readonly maxAmp = 2.5) {}

  /** Add a kick: the larger of the two amplitudes plus a quarter of the smaller, capped. */
  kick(a: number): void {
    if (a <= 0) return;
    this.amp = Math.min(this.maxAmp, Math.max(this.amp, a) + 0.25 * Math.min(this.amp, a));
  }

  /** Decay by `dt` seconds (exponential, rate `decay`/s) and return a random offset within the amplitude. */
  update(dt: number, decay: number, rand: () => number = Math.random): { x: number; y: number } {
    this.amp *= Math.exp(-decay * dt);
    if (this.amp < 0.01) {
      this.amp = 0;
      return { x: 0, y: 0 };
    }
    return { x: (rand() * 2 - 1) * this.amp, y: (rand() * 2 - 1) * this.amp };
  }

  reset(): void {
    this.amp = 0;
  }
}
