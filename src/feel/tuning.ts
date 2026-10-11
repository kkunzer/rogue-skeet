/** Every tunable lives in this one typed object. Dev panel (?dev) edits it live. */
export interface Tuning {
  /** Fixed sim rate in Hz. */
  simHz: number;
  /** Show the FPS / input latency overlay. */
  debugOverlay: boolean;
  /** Placeholder: pattern radius in world units (used from Phase 1). */
  patternRadius: number;
  /** Placeholder: aim assist, 0..0.5 scales pattern radius (used from Phase 1). */
  aimAssist: number;
}

export const defaultTuning: Readonly<Tuning> = {
  simHz: 120,
  debugOverlay: true,
  patternRadius: 5,
  aimAssist: 0,
};

export const tuning: Tuning = { ...defaultTuning };

type Listener = (t: Tuning) => void;
const listeners = new Set<Listener>();

/** Subscribe to tuning changes made via the dev panel. Returns unsubscribe. */
export function onTuningChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyTuningChanged(): void {
  for (const fn of listeners) fn(tuning);
}

export function exportTuningJSON(): string {
  return JSON.stringify(tuning, null, 2);
}

export function isDevMode(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('dev');
}

/** Lazily loads Tweakpane; only call when `isDevMode()`. */
export async function loadDevPanel(): Promise<void> {
  const { createDevPanel } = await import('./devPanel');
  createDevPanel();
}
