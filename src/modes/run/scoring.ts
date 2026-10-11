import type { ScoreInfo } from '../../upgrades/types';

export const BASE_POINTS = 100;
/** Combo multiplier gained per consecutive hit, and its cap. */
export const COMBO_STEP = 0.1;
export const COMBO_CAP = 3;
/** A perfect hit scores +50%. */
export const PERFECT_MULT = 1.5;

/** Combo multiplier after `streak` consecutive hits: x1.0, x1.1, ... capped at x3. */
export const comboMult = (streak: number): number =>
  Math.min(COMBO_CAP, Math.round((1 + COMBO_STEP * Math.max(0, streak)) * 1000) / 1000);

/** Points for one broken clay: 100 x combo x perfect x upgrade multipliers (already folded into `mult`). */
export const clayPoints = (s: Pick<ScoreInfo, 'base' | 'combo' | 'perfect' | 'mult'>): number =>
  Math.round(s.base * s.combo * (s.perfect ? PERFECT_MULT : 1) * s.mult);
