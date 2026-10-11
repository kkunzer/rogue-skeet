import { defaultInputConfig, type InputConfig } from '../input/scheme';
import { defaultSimConfig, type SimConfig } from '../sim/config';
import { TEST_LAUNCH } from '../sim/throws';

/** Free-play (sandbox) throw tunables. The control test uses the fixed set in sim/throws.ts instead. */
export interface SandboxConfig {
  doubleChance: number;
  gapMin: number;
  gapMax: number;
  highSpeedMin: number;
  highSpeedMax: number;
  highAngleMin: number;
  highAngleMax: number;
  lowSpeedMin: number;
  lowSpeedMax: number;
  lowAngleMin: number;
  lowAngleMax: number;
}

/** Every tunable lives in this one typed object. Dev panel (?dev) edits it live. */
export interface Tuning extends SimConfig, InputConfig, SandboxConfig {
  /** Fixed sim rate in Hz. */
  simHz: number;
  /** Show the FPS / input latency overlay. */
  debugOverlay: boolean;
}

export const defaultTuning: Readonly<Tuning> = {
  ...defaultSimConfig,
  ...defaultInputConfig,
  doubleChance: 0.25,
  gapMin: 0.8,
  gapMax: 1.8,
  highSpeedMin: TEST_LAUNCH.high.speed[0],
  highSpeedMax: TEST_LAUNCH.high.speed[1],
  highAngleMin: TEST_LAUNCH.high.angle[0],
  highAngleMax: TEST_LAUNCH.high.angle[1],
  lowSpeedMin: TEST_LAUNCH.low.speed[0],
  lowSpeedMax: TEST_LAUNCH.low.speed[1],
  lowAngleMin: TEST_LAUNCH.low.angle[0],
  lowAngleMax: TEST_LAUNCH.low.angle[1],
  simHz: 120,
  debugOverlay: true,
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
