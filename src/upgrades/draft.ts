import type { Rng } from '../core/rng';
import { UPGRADES } from './defs';
import type { UpgradeDef, UpgradeId } from './types';

export const OFFER_COUNT = 3;
/** Physics mods are rarer, stronger picks. */
export const PHYSICS_WEIGHT = 0.5;

export const draftWeight = (u: UpgradeDef): number => (u.physics ? PHYSICS_WEIGHT : 1);

/**
 * Offer `count` distinct upgrades the player does not own, drawn without replacement with weights
 * (physics mods at half weight). Pure function of the seeded `rng`.
 */
export function offerDraft(
  rng: Rng,
  owned: readonly UpgradeId[],
  count = OFFER_COUNT,
  pool: readonly UpgradeDef[] = UPGRADES,
): UpgradeId[] {
  const left = pool.filter((u) => !owned.includes(u.id));
  const out: UpgradeId[] = [];
  while (out.length < count && left.length > 0) {
    const total = left.reduce((sum, u) => sum + draftWeight(u), 0);
    let r = rng.next() * total;
    let idx = left.length - 1;
    for (let i = 0; i < left.length; i++) {
      r -= draftWeight(left[i] as UpgradeDef);
      if (r < 0) {
        idx = i;
        break;
      }
    }
    out.push((left.splice(idx, 1)[0] as UpgradeDef).id);
  }
  return out;
}
