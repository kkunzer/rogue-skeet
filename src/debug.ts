import type { Vec2 } from './core/vec2';
import type { ControlScheme } from './input/scheme';
import type { SimClock } from './input/pointer';
import type { InputConfig } from './input/scheme';
import type { SimConfig } from './sim/config';
import { idealAim } from './sim/predict';
import type { World } from './sim/world';
import type { ControlTestResult } from './telemetry/schema';

/** Presentation counters exposed to tests (`window.__debug.fx()`). */
export interface FxDebug {
  shardsSpawned: number;
  particlesSpawned: number;
  ringsSpawned: number;
  shattersSpawned: number;
  activeShards: number;
  activeParticles: number;
  peakActive: number;
  dropped: number;
  shatters: number;
  perfects: number;
  missPuffs: number;
  streak: number;
  audio: {
    triggered: number;
    played: number;
    last: string | null;
    byCue: Record<string, number>;
    state: string;
    samples: string[];
  };
  haptics: { provider: string; triggers: number; last: string | null };
  hitStopActive: boolean;
  hitStops: number;
  shakeAmp: number;
  paused: boolean;
  juiceOn: boolean;
}

/** What the active mode hands to the debug API. */
export interface DebugProvider {
  mode: string;
  world: () => World | null;
  scheme: () => ControlScheme;
  cfg: () => SimConfig & InputConfig;
  clock: SimClock;
  canvas: () => HTMLCanvasElement;
  fx?: () => FxDebug;
  pauseFx?: (on: boolean) => void;
  toClient: (p: Vec2) => { x: number; y: number };
  result?: () => ControlTestResult | null;
  phase?: () => string;
}

/** Dev and test builds only: `?test` enables it in a production build. */
export const debugEnabled = (): boolean =>
  import.meta.env.DEV || new URLSearchParams(location.search).has('test');

let provider: DebugProvider | null = null;

export function setDebugProvider(p: DebugProvider | null): void {
  provider = p;
  if (!debugEnabled()) return;
  (window as unknown as { __debug?: unknown }).__debug = api;
}

const need = (): DebugProvider => {
  if (!provider) throw new Error('no debug provider (not in a play mode)');
  return provider;
};

/** Seconds from the world's last sim step to "now" (frame latency to add to predictions). */
function sinceStep(p: DebugProvider, w: World): number {
  return Math.max(0, p.clock.now() - w.time);
}

const api = {
  mode: (): string => provider?.mode ?? 'none',
  phase: (): string => provider?.phase?.() ?? '',
  schemeId: (): string => need().scheme().id,
  state() {
    const p = need();
    const w = p.world();
    if (!w) return null;
    return {
      time: w.time,
      now: p.clock.now(),
      stats: { ...w.stats },
      loaded: w.gun.loaded,
      gunReady: w.gun.status(p.clock.now()) === 'ok',
      clays: w.clays.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        vx: c.vx,
        vy: c.vy,
        age: c.age,
        house: c.house,
        throwIndex: c.throwIndex,
      })),
      shots: w.shots.map((s) => ({ id: s.id, aim: s.aim, arriveTime: s.arriveTime })),
    };
  },
  /** Aim point that hits clay `id` if the shot is fired `delay` seconds from now. */
  idealAim(id: number, delay = 0): { aim: Vec2; flight: number } | null {
    const p = need();
    const w = p.world();
    const c = w?.clays.find((x) => x.id === id && x.status === 'live');
    if (!w || !c) return null;
    return idealAim(p.cfg(), c, delay + sinceStep(p, w));
  },
  /**
   * Perform the active scheme's gesture so that it fires at the ideal lead point for clay `id`,
   * dispatching real PointerEvents on the canvas. Returns the aim point, or null if unreachable.
   */
  shootAt(id: number, opts: { lead?: boolean; offset?: Vec2 } = {}): Vec2 | null {
    const p = need();
    const w = p.world();
    const c = w?.clays.find((x) => x.id === id && x.status === 'live');
    if (!w || !c) return null;
    const scheme = p.scheme();
    const probe = scheme.script({ x: 45, y: 80 });
    const lead = Math.max(0, -Math.min(...probe.events.map((e) => e.t)));
    const delay = lead + sinceStep(p, w);
    const base = opts.lead === false ? { x: c.x, y: c.y } : idealAim(p.cfg(), c, delay).aim;
    const aim = opts.offset ? { x: base.x + opts.offset.x, y: base.y + opts.offset.y } : base;
    if (!scheme.canReach(aim)) return null;
    const canvas = p.canvas();
    const events = scheme.script(aim).events;
    const dispatch = (ev: (typeof events)[number]): void => {
      const client = p.toClient(ev.pos);
      const type = {
        down: 'pointerdown',
        move: 'pointermove',
        up: 'pointerup',
        cancel: 'pointercancel',
      }[ev.type];
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          clientX: client.x,
          clientY: client.y,
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    };
    if (lead <= 0.1) {
      // Short gestures (tap, flick) run synchronously with a busy-wait so the event timestamps,
      // and therefore the measured flick speed, don't depend on timer jitter.
      const t0 = performance.now();
      for (const ev of events) {
        const at = t0 + (ev.t + lead) * 1000;
        while (performance.now() < at);
        dispatch(ev);
      }
    } else {
      for (const ev of events) {
        const wait = (ev.t + lead) * 1000;
        if (wait <= 0) dispatch(ev);
        else setTimeout(() => dispatch(ev), wait);
      }
    }
    return aim;
  },
  /** Presentation counters: particles spawned, audio cues triggered, haptics, hit-stop. */
  fx: (): FxDebug | null => provider?.fx?.() ?? null,
  /** Hold the presentation still (the sim keeps running) so a mid-shatter frame can be captured. */
  pauseFx: (on = true): void => provider?.pauseFx?.(on),
  worldToClient: (x: number, y: number) => need().toClient({ x, y }),
  result: (): ControlTestResult | null => provider?.result?.() ?? null,
};

export type DebugApi = typeof api;
