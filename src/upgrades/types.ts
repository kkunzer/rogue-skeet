import type { Rng } from '../core/rng';
import type { SimConfig } from '../sim/config';
import type { BreakInfo, HitInfo, Pattern } from '../sim/hooks';
import type { Shot } from '../sim/shot';
import type { World } from '../sim/world';
import type { UpgradeTuning } from './params';

export type UpgradeId = 'explosive' | 'chain' | 'slug' | 'curse' | 'wind' | 'gravity';
export type UpgradeCategory = 'Shells' | 'Physics mod' | 'Curse';
export type SynergyId = 'shrapnelStorm';

/** Everything an upgrade may look at. Hooks must stay pure functions of sim state and this. */
export interface UpgradeCtx {
  has(id: UpgradeId): boolean;
  synergy(id: SynergyId): boolean;
  params: UpgradeTuning;
  /** Seeded stream for this round (wind gusts). Never used from per-burst hooks. */
  rng: Rng;
}

/** What `modifyScore` sees and edits: `mult` is the product of all upgrade multipliers. */
export interface ScoreInfo {
  /** Base points for one clay. */
  base: number;
  /** Combo multiplier (1 .. 3). */
  combo: number;
  perfect: boolean;
  /** Upgrade multiplier, starts at 1. */
  mult: number;
  cause: BreakInfo['cause'];
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  category: UpgradeCategory;
  /** One short sentence for the draft card. */
  blurb: string;
  /** Two or three characters for the HUD badge, and its colour. */
  icon: string;
  color: number;
  /** Physics mods are offered at half weight and show a trajectory preview after the pick. */
  physics?: boolean;
  onShotFired?(shot: Shot, world: World, ctx: UpgradeCtx): void;
  modifyPattern?(p: Pattern, ctx: UpgradeCtx): Pattern;
  onClayHit?(hit: HitInfo, world: World, ctx: UpgradeCtx): void;
  onClayBroken?(info: BreakInfo, world: World, ctx: UpgradeCtx): void;
  /** Run-level physics, applied to the round's SimConfig before the World is built. */
  modifyPhysics?(cfg: SimConfig, ctx: UpgradeCtx): SimConfig;
  modifyScore?(s: ScoreInfo, ctx: UpgradeCtx): ScoreInfo;
}
