import type { UpgradeDef, UpgradeId } from '../types';
import { chain } from './chain';
import { curse } from './curse';
import { explosive } from './explosive';
import { gravity } from './gravity';
import { slug } from './slug';
import { wind } from './wind';

/** The six upgrades, in a fixed order (hooks run in this order, not pick order). */
export const UPGRADES: readonly UpgradeDef[] = [explosive, chain, slug, curse, wind, gravity];

export const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((u) => u.id);

export const upgradeById = (id: UpgradeId): UpgradeDef => {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error(`unknown upgrade ${id}`);
  return u;
};
