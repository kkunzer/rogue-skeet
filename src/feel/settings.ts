/**
 * Player-facing feel settings (juice A/B, sound, haptics), persisted in localStorage and shared by
 * sandbox and control test. Tunable numbers live in tuning.ts; these are the on/off switches.
 */
export interface FeelSettings {
  /** Master A/B switch: shatter VFX, shake, hit-stop and the hit/shot audio + haptic feedback. */
  juice: boolean;
  sound: boolean;
  /** Master volume 0..1. */
  volume: number;
  haptics: boolean;
  /** Experimental iOS Safari switch-input haptic (shot only). Default on for iOS. */
  iosHaptics: boolean;
}

export const FEEL_KEY = 'rogue-skeet.feel.v1';

export interface Storage2 {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** iPhone / iPad (incl. iPadOS reporting as Mac with touch). */
export function isIOS(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined = safeNav(),
): boolean {
  if (!nav) return false;
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1)
  );
}

function safeNav(): Navigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}

export const defaultFeel = (): FeelSettings => ({
  juice: true,
  sound: true,
  volume: 0.8,
  haptics: true,
  iosHaptics: isIOS(),
});

export const feel: FeelSettings = defaultFeel();

const listeners = new Set<(s: FeelSettings) => void>();
export function onFeelChange(fn: (s: FeelSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyFeelChanged(): void {
  for (const fn of listeners) fn(feel);
}

function defaultStore(): Storage2 | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Merge a saved blob into `target`, ignoring bad fields. Pure apart from mutating `target`. */
export function applyFeel(target: FeelSettings, raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return;
  const o = raw as Record<string, unknown>;
  for (const k of ['juice', 'sound', 'haptics', 'iosHaptics'] as const)
    if (typeof o[k] === 'boolean') target[k] = o[k];
  if (typeof o.volume === 'number' && Number.isFinite(o.volume))
    target.volume = Math.min(1, Math.max(0, o.volume));
}

export function loadFeel(store: Storage2 | null = defaultStore()): void {
  try {
    const s = store?.getItem(FEEL_KEY);
    if (s) applyFeel(feel, JSON.parse(s));
  } catch {
    /* corrupt or blocked storage: keep defaults */
  }
  notifyFeelChanged();
}

export function saveFeel(store: Storage2 | null = defaultStore()): void {
  try {
    store?.setItem(FEEL_KEY, JSON.stringify(feel));
  } catch {
    /* storage blocked */
  }
  notifyFeelChanged();
}
