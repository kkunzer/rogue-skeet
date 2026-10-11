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

/** Presentation ("juice") tunables: shatter VFX, shake, hit-stop, audio variance, haptic patterns. */
export interface JuiceTuning {
  /** Shards per normal hit (random in [min, max]) and per perfect hit. */
  shardCountMin: number;
  shardCountMax: number;
  shardCountPerfect: number;
  /** Shard velocity added along the shot direction, world units / s. */
  shardImpulse: number;
  /** Shard velocity pushed radially out of the clay centre, world units / s. */
  shardExplode: number;
  /** Random fraction of speed added to every shard velocity component (0..1). */
  shardJitter: number;
  /** Max shard spin, rad / s. */
  shardSpin: number;
  /** Multiplier on sim gravity for debris. */
  shardGravityScale: number;
  /** Debris reaches full desaturation after this long. */
  debrisDesatMs: number;
  /** Debris starts fading here and is gone at `debrisLifeMs`. */
  debrisFadeStartMs: number;
  debrisLifeMs: number;
  /** Dust puff particles per hit (scaled by quality) and their life. */
  dustCount: number;
  dustLifeMs: number;
  /** Extra bright sparks on a perfect hit. */
  sparkCountPerfect: number;
  /** Impact flash ring: radius multiplier on the clay radius, life, and perfect-hit multiplier. */
  flashRadiusMul: number;
  flashLifeMs: number;
  flashPerfectMul: number;
  /** Screen shake amplitude (world units) for a quality-1 hit, the perfect-hit amplitude, and decay /s. */
  shakeAmp: number;
  shakeAmpPerfect: number;
  shakeDecay: number;
  /** Hit-stop (visual freeze) in ms: lerped from min to max by hit quality. 0 disables. */
  hitStopMinMs: number;
  hitStopMaxMs: number;
  /** Subtle puff where a pattern burst missed. */
  missPuff: boolean;
  /** Audio: pitch variance (+/- fraction), gain variance (+/- fraction), combo ladder. */
  pitchVar: number;
  gainVar: number;
  comboStepSemitones: number;
  comboMaxSteps: number;
  /** Haptic patterns (ms). Perfect = [perfectMs, 24, perfectTailMs]. */
  hapticShotMs: number;
  hapticHitMs: number;
  hapticPerfectMs: number;
  hapticPerfectTailMs: number;
}

export const defaultJuiceTuning: Readonly<JuiceTuning> = {
  shardCountMin: 6,
  shardCountMax: 9,
  shardCountPerfect: 12,
  shardImpulse: 30,
  shardExplode: 16,
  shardJitter: 0.35,
  shardSpin: 16,
  shardGravityScale: 1,
  debrisDesatMs: 250,
  debrisFadeStartMs: 220,
  debrisLifeMs: 600,
  dustCount: 6,
  dustLifeMs: 380,
  sparkCountPerfect: 10,
  flashRadiusMul: 2.6,
  flashLifeMs: 190,
  flashPerfectMul: 1.6,
  shakeAmp: 0.45,
  shakeAmpPerfect: 1.1,
  shakeDecay: 16,
  hitStopMinMs: 40,
  hitStopMaxMs: 60,
  missPuff: true,
  pitchVar: 0.08,
  gainVar: 0.12,
  comboStepSemitones: 2,
  comboMaxSteps: 8,
  hapticShotMs: 8,
  hapticHitMs: 16,
  hapticPerfectMs: 24,
  hapticPerfectTailMs: 14,
};

/** Every tunable lives in this one typed object. Dev panel (?dev) edits it live. */
export interface Tuning extends SimConfig, InputConfig, SandboxConfig, JuiceTuning {
  /** Fixed sim rate in Hz. */
  simHz: number;
  /** Show the FPS / input latency overlay. */
  debugOverlay: boolean;
}

export const defaultTuning: Readonly<Tuning> = {
  ...defaultSimConfig,
  ...defaultInputConfig,
  ...defaultJuiceTuning,
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
