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

export interface RunBotOptions {
  /** Unused hook kept for callers that pass the `?simspeed` they loaded with. */
  speed?: number;
  /** Upgrade ids in order of preference when drafting (clicks the DOM card). */
  picks?: string[];
  /** Skip aiming at (and so lose) clays by leading badly on purpose. Default: perfect lead. */
  noLead?: boolean;
  /** Wait this long on the draft cards before picking (screenshots). */
  draftDelayMs?: number;
}

declare global {
  interface Window {
    __runBot?: { stop: () => void; shots: number; phases: string[] };
  }
}

/**
 * Installs an in-page run bot: clicks through setup, intro, round-clear and draft cards with real DOM
 * clicks (draft by `data-upgrade`), and shoots every live clay at its predicted lead point through
 * `window.__debug.shootAt` (real PointerEvents on the canvas). Runs until `window.__runBot.stop()`.
 */
export async function installRunBot(page: Page, opts: RunBotOptions = {}): Promise<void> {
  await page.evaluate((o) => {
    const dbg = window.__debug;
    const picks = o.picks ?? [];
    let draftSince: number | null = null;
    const pendingUntil = new Map<string, number>();
    const state = { stop: () => clearInterval(iv), shots: 0, phases: [] as string[] };
    window.__runBot = state;
    const click = (sel: string): boolean => {
      const b = document.querySelector<HTMLElement>(sel);
      b?.click();
      return !!b;
    };
    const tick = (): void => {
      const phase = document.body.dataset.phase ?? '';
      if (state.phases[state.phases.length - 1] !== phase) state.phases.push(phase);
      if (phase === 'setup') click('#btn-run-start');
      else if (phase === 'intro') click('#btn-run-go');
      else if (phase === 'roundClear') click('#btn-run-draft');
      else if (phase === 'draft') {
        draftSince ??= performance.now();
        if (performance.now() - draftSince < (o.draftDelayMs ?? 0)) return;
        draftSince = null;
        const offers = [...document.querySelectorAll<HTMLElement>('.upg-card')];
        const ids = offers.map((c) => c.dataset.upgrade ?? '');
        const want = picks.find((p) => ids.includes(p)) ?? ids[0];
        offers.find((c) => c.dataset.upgrade === want)?.click();
      } else if (phase === 'playing') {
        const st = dbg.state();
        if (!st || !st.gunReady) return;
        // Compare against the sim clock (world.time), not wall time or the extrapolated input clock:
        // under SwiftShader the sim can lag the frames.
        const simNow = st.time;
        const preds = dbg.predictions();
        for (const c of [...st.clays].sort((a, b) => b.age - a.age)) {
          const key = `${dbg.run()?.round ?? 0}:${c.id}`; // clay ids restart every round
          if (c.age < 0.3 || (pendingUntil.get(key) ?? 0) > simNow) continue;
          const pr = preds.find((p) => p.id === c.id);
          if (!pr) continue;
          const aim = dbg.shootAt(c.id, o.noLead ? { lead: false } : {});
          if (!aim) continue;
          state.shots++;
          pendingUntil.set(key, st.now + pr.flight + 0.15);
          break;
        }
      }
    };
    const iv = setInterval(tick, 8);
  }, opts);
}

export async function stopRunBot(page: Page): Promise<void> {
  await page.evaluate(() => window.__runBot?.stop());
}
