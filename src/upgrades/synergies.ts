import type { SynergyId, UpgradeId } from './types';

export interface SynergyDef {
  id: SynergyId;
  /** Shown in the banner. */
  name: string;
  blurb: string;
  requires: readonly UpgradeId[];
}

export const SYNERGIES: readonly SynergyDef[] = [
  {
    id: 'shrapnelStorm',
    name: 'SHRAPNEL STORM',
    blurb: 'Explosive fragments + Chain shatter: chains reach 25% further.',
    requires: ['explosive', 'chain'],
  },
];

export function activeSynergies(owned: Iterable<UpgradeId>): SynergyDef[] {
  const have = new Set(owned);
  return SYNERGIES.filter((s) => s.requires.every((r) => have.has(r)));
}

/** Synergies that `after` has and `before` did not (what a pick just unlocked). */
export function newSynergies(
  before: readonly UpgradeId[],
  after: readonly UpgradeId[],
): SynergyDef[] {
  const had = new Set(activeSynergies(before).map((s) => s.id));
  return activeSynergies(after).filter((s) => !had.has(s.id));
}
