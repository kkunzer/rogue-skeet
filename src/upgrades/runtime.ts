import type { Rng } from '../core/rng';
import type { SimConfig } from '../sim/config';
import { composeHooks, type SimHooks } from '../sim/hooks';
import { UPGRADES } from './defs';
import type { UpgradeTuning } from './params';
import { activeSynergies } from './synergies';
import type { ScoreInfo, UpgradeCtx, UpgradeDef, UpgradeId } from './types';

/** Upgrades the player owns, in canonical order. */
export function ownedDefs(owned: readonly UpgradeId[]): UpgradeDef[] {
  return UPGRADES.filter((u) => owned.includes(u.id));
}

export function makeCtx(owned: readonly UpgradeId[], params: UpgradeTuning, rng: Rng): UpgradeCtx {
  const set = new Set(owned);
  const syn = new Set(activeSynergies(owned).map((s) => s.id));
  return { has: (id) => set.has(id), synergy: (id) => syn.has(id), params, rng };
}

/** Sim hooks that run the owned upgrades' hooks in canonical order. */
export function buildHooks(owned: readonly UpgradeId[], ctx: UpgradeCtx): SimHooks {
  const defs = ownedDefs(owned);
  return composeHooks(
    defs.map((u): SimHooks => ({
      modifyPattern: u.modifyPattern ? (p) => u.modifyPattern?.(p, ctx) ?? p : undefined,
      onShotFired: u.onShotFired ? (s, w) => u.onShotFired?.(s, w, ctx) : undefined,
      onClayHit: u.onClayHit ? (h, w) => u.onClayHit?.(h, w, ctx) : undefined,
      onClayBroken: u.onClayBroken ? (i, w) => u.onClayBroken?.(i, w, ctx) : undefined,
    })),
  );
}

/** The round's SimConfig after every owned `modifyPhysics`. Returns a fresh object. */
export function applyPhysics(
  base: SimConfig,
  owned: readonly UpgradeId[],
  ctx: UpgradeCtx,
): SimConfig {
  return ownedDefs(owned).reduce((cfg, u) => (u.modifyPhysics ? u.modifyPhysics(cfg, ctx) : cfg), {
    ...base,
  });
}

export function applyScore(
  info: ScoreInfo,
  owned: readonly UpgradeId[],
  ctx: UpgradeCtx,
): ScoreInfo {
  return ownedDefs(owned).reduce((s, u) => (u.modifyScore ? u.modifyScore(s, ctx) : s), info);
}
