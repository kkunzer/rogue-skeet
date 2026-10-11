/**
 * Hit-stop as a purely visual freeze: while `tick()` returns true the presenter skips redrawing
 * (the screen holds the impact frame) but the sim and input clock keep running untouched. This
 * keeps control-test timing identical with juice on or off. Real time (ms), not sim time.
 */
export class HitStop {
  /** Remaining freeze, ms. */
  remaining = 0;
  private cooldown = 0;
  /** A freeze was requested since the last tick: draw that frame first so the impact (clay gone, debris out) is what freezes. */
  private fresh = false;
  /** Total freezes started (diagnostic). */
  count = 0;
  /** Minimum gap between freezes, ms, so rapid hits never stack into a stutter. */
  constructor(private readonly cooldownMs = 100) {}

  request(ms: number): void {
    if (ms <= 0 || this.cooldown > 0) return;
    if (this.remaining <= 0) {
      this.count++;
      this.fresh = true;
    }
    this.remaining = Math.max(this.remaining, Math.min(ms, 80));
  }

  get active(): boolean {
    return this.remaining > 0;
  }

  /** Advance by real `dtMs`. Returns true if this frame should be held. */
  tick(dtMs: number): boolean {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dtMs);
    if (this.remaining <= 0) return false;
    if (this.fresh) {
      this.fresh = false;
      return false;
    }
    this.remaining -= dtMs;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.cooldown = this.cooldownMs;
    }
    return true;
  }

  reset(): void {
    this.remaining = 0;
    this.cooldown = 0;
    this.fresh = false;
  }
}
