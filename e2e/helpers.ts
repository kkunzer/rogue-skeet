import type { Page } from '@playwright/test';
import type { DebugApi } from '../src/debug';

declare global {
  interface Window {
    __debug: DebugApi;
  }
}

export interface BotOptions {
  /** Stop when this many hits are registered (sandbox). */
  stopAtHits?: number;
  /** Stop when body[data-phase] equals this (control test). */
  stopAtPhase?: string;
  /** Throw indexes whose clays the bot deliberately leads badly (to exercise the miss prompt). */
  missThrows?: number[];
  /** Give up after this many ms. */
  timeoutMs: number;
}

/**
 * In-page bot: polls sim state through window.__debug and performs the active scheme's gesture
 * with real PointerEvents at the ideal lead point for each clay. Answers "Why did you miss?" prompts.
 */
export async function runBot(
  page: Page,
  opts: BotOptions,
): Promise<{ hits: number; shots: number; timedOut: boolean }> {
  return page.evaluate(
    (o) =>
      new Promise<{ hits: number; shots: number; timedOut: boolean }>((resolve) => {
        const dbg = window.__debug;
        const targeted = new Set<number>();
        const t0 = performance.now();
        const tick = (): void => {
          const phase = document.body.dataset.phase;
          const st = dbg.state();
          const done = (timedOut: boolean): void => {
            clearInterval(iv);
            resolve({ hits: st?.stats.hits ?? 0, shots: st?.stats.shots ?? 0, timedOut });
          };
          if (o.stopAtPhase && phase === o.stopAtPhase) return done(false);
          if (performance.now() - t0 > o.timeoutMs) return done(true);
          if (phase === 'asking') {
            document.querySelector<HTMLButtonElement>('[data-reason="ahead"]')?.click();
            return;
          }
          if (!st) return;
          if (o.stopAtHits && st.stats.hits >= o.stopAtHits) return done(false);
          if (phase && phase !== 'playing') return;
          if (!st.gunReady) return;
          for (const c of st.clays) {
            if (targeted.has(c.id) || c.age < 0.5) continue;
            const lead = !(o.missThrows ?? []).includes(c.throwIndex);
            if (dbg.shootAt(c.id, { lead })) {
              targeted.add(c.id);
              break;
            }
          }
        };
        const iv = setInterval(tick, 8);
      }),
    opts,
  );
}
