import { isIOS } from './settings';
import { tuning, type JuiceTuning } from './tuning';

export type HapticKind = 'shot' | 'hit' | 'perfect';
export type HapticProviderId = 'capacitor' | 'vibrate' | 'ios-switch' | 'none';

export interface HapticProvider {
  id: HapticProviderId;
  /** True when it only works inside a user-gesture handler (so only the shot haptic fires). */
  gestureOnly: boolean;
  trigger(kind: HapticKind): void;
}

type PatternCfg = Pick<
  JuiceTuning,
  'hapticShotMs' | 'hapticHitMs' | 'hapticPerfectMs' | 'hapticPerfectTailMs'
>;

/** Vibration pattern (ms) for a haptic kind. Perfect = buzz, gap, tail. */
export function vibratePattern(kind: HapticKind, cfg: PatternCfg): number[] {
  if (kind === 'shot') return [cfg.hapticShotMs];
  if (kind === 'hit') return [cfg.hapticHitMs];
  return [cfg.hapticPerfectMs, 24, cfg.hapticPerfectTailMs];
}

/** The subset of Capacitor's Haptics plugin we call. */
export interface CapacitorHapticsPlugin {
  impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): unknown;
  notification?(o: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): unknown;
}

/** Everything provider selection looks at, injectable for tests. */
export interface HapticEnv {
  capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { Haptics?: CapacitorHapticsPlugin };
  };
  nav?: {
    vibrate?: (p: number | number[]) => boolean;
    userAgent?: string;
    maxTouchPoints?: number;
  };
  doc?: Pick<Document, 'createElement' | 'body'>;
}

export interface HapticOptions {
  /** User setting: allow the experimental iOS switch trick. */
  iosHaptics: boolean;
  cfg?: PatternCfg;
}

const NONE: HapticProvider = { id: 'none', gestureOnly: false, trigger: () => undefined };

/** (a) Capacitor Haptics plugin, only on a native platform. Reached through the global, no import. */
function capacitorProvider(env: HapticEnv): HapticProvider | null {
  const cap = env.capacitor;
  const plugin = cap?.Plugins?.Haptics;
  if (!cap?.isNativePlatform?.() || !plugin) return null;
  return {
    id: 'capacitor',
    gestureOnly: false,
    trigger(kind) {
      try {
        if (kind === 'perfect' && plugin.notification)
          void plugin.notification({ type: 'SUCCESS' });
        else
          void plugin.impact({
            style: kind === 'shot' ? 'LIGHT' : kind === 'hit' ? 'MEDIUM' : 'HEAVY',
          });
      } catch {
        /* plugin unavailable at runtime */
      }
    },
  };
}

/** (b) navigator.vibrate (Android Chrome, Firefox Android). */
function vibrateProvider(env: HapticEnv, cfg: PatternCfg): HapticProvider | null {
  const nav = env.nav;
  if (!nav || typeof nav.vibrate !== 'function') return null;
  return {
    id: 'vibrate',
    gestureOnly: false,
    trigger(kind) {
      try {
        nav.vibrate?.(vibratePattern(kind, cfg));
      } catch {
        /* blocked */
      }
    },
  };
}

/**
 * (c) iOS 18+ Safari: toggling an `<input type="checkbox" switch>` plays a system tick. It only
 * fires when the click happens inside a user-gesture handler, so only the shot haptic uses it.
 */
function iosSwitchProvider(env: HapticEnv): HapticProvider | null {
  const doc = env.doc;
  if (!doc || !isIOS(env.nav as Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined))
    return null;
  let label: HTMLLabelElement | null = null;
  const ensure = (): HTMLLabelElement | null => {
    if (label) return label;
    try {
      const l = doc.createElement('label');
      l.setAttribute('aria-hidden', 'true');
      l.style.cssText =
        'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
      const i = doc.createElement('input');
      i.type = 'checkbox';
      i.setAttribute('switch', '');
      i.tabIndex = -1;
      l.appendChild(i);
      doc.body.appendChild(l);
      label = l;
    } catch {
      label = null;
    }
    return label;
  };
  return {
    id: 'ios-switch',
    gestureOnly: true,
    trigger(kind) {
      if (kind !== 'shot') return;
      ensure()?.click();
    },
  };
}

/** Pick a provider in priority order: Capacitor, vibrate, iOS switch (if enabled), none. */
export function selectProvider(env: HapticEnv, opts: HapticOptions): HapticProvider {
  const cfg = opts.cfg ?? tuning;
  return (
    capacitorProvider(env) ??
    vibrateProvider(env, cfg) ??
    (opts.iosHaptics ? iosSwitchProvider(env) : null) ??
    NONE
  );
}

/** Environment from the real globals (browser). */
export function browserEnv(): HapticEnv {
  const w =
    typeof window === 'undefined'
      ? undefined
      : (window as unknown as { Capacitor?: HapticEnv['capacitor'] });
  return {
    capacitor: w?.Capacitor,
    nav: typeof navigator === 'undefined' ? undefined : navigator,
    doc: typeof document === 'undefined' ? undefined : document,
  };
}

export interface HapticStats {
  provider: HapticProviderId;
  triggers: number;
  last: HapticKind | null;
}

/** App-facing haptics: respects the user's on/off switch and counts triggers for tests. */
export class Haptics {
  enabled = true;
  private provider: HapticProvider = NONE;
  triggers = 0;
  last: HapticKind | null = null;
  constructor(private readonly envFn: () => HapticEnv = browserEnv) {}

  configure(opts: HapticOptions & { enabled: boolean }): void {
    this.enabled = opts.enabled;
    this.provider = selectProvider(this.envFn(), opts);
  }

  get providerId(): HapticProviderId {
    return this.provider.id;
  }

  play(kind: HapticKind): void {
    if (!this.enabled) return;
    this.triggers++;
    this.last = kind;
    this.provider.trigger(kind);
  }

  stats(): HapticStats {
    return { provider: this.provider.id, triggers: this.triggers, last: this.last };
  }
}

export const haptics = new Haptics();
