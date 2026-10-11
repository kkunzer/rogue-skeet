import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { OFFER_COUNT, PHYSICS_WEIGHT, draftWeight, offerDraft } from '../src/upgrades/draft';
import { UPGRADES, UPGRADE_IDS } from '../src/upgrades/defs';
import type { UpgradeId } from '../src/upgrades/types';

describe('draft', () => {
  it('offers 3 distinct upgrades and never one the player owns', () => {
    for (let seed = 0; seed < 300; seed++) {
      const owned = UPGRADE_IDS.filter((_, i) => (seed >> i) % 2 === 1).slice(0, 3);
      const offer = offerDraft(new Rng(`d${seed}`), owned);
      expect(offer).toHaveLength(OFFER_COUNT);
      expect(new Set(offer).size).toBe(OFFER_COUNT);
      for (const id of offer) expect(owned).not.toContain(id);
    }
  });

  it('is a pure function of the seeded rng', () => {
    expect(offerDraft(new Rng('x'), ['slug'])).toEqual(offerDraft(new Rng('x'), ['slug']));
    const diff = Array.from({ length: 20 }, (_, i) => offerDraft(new Rng(`y${i}`), []).join());
    expect(new Set(diff).size).toBeGreaterThan(5);
  });

  it('with 3 owned, the last 3 are all offered; with fewer left it offers what remains', () => {
    const owned: UpgradeId[] = ['explosive', 'chain', 'slug'];
    expect([...offerDraft(new Rng('a'), owned)].sort()).toEqual(['curse', 'gravity', 'wind']);
    expect(offerDraft(new Rng('a'), ['explosive', 'chain', 'slug', 'curse', 'wind'])).toEqual([
      'gravity',
    ]);
  });

  it('offers physics mods at half weight (statistical, fixed seeds, exact expectation)', () => {
    // exact inclusion probability by enumerating the ordered weighted draws
    const w = UPGRADES.map(draftWeight);
    const exact = UPGRADES.map(() => 0);
    const walk = (left: number[], p: number, picked: number[]): void => {
      if (picked.length === OFFER_COUNT) {
        for (const i of picked) exact[i] = (exact[i] ?? 0) + p;
        return;
      }
      const total = left.reduce((s, i) => s + (w[i] ?? 0), 0);
      for (const i of left)
        walk(
          left.filter((j) => j !== i),
          (p * (w[i] ?? 0)) / total,
          [...picked, i],
        );
    };
    walk(
      UPGRADES.map((_, i) => i),
      1,
      [],
    );
    expect(exact.reduce((a, b) => a + b, 0)).toBeCloseTo(OFFER_COUNT, 9);

    const N = 12000;
    const rng = new Rng('draft-stats');
    const count = UPGRADES.map(() => 0);
    for (let i = 0; i < N; i++)
      for (const id of offerDraft(rng, [])) count[UPGRADES.findIndex((u) => u.id === id)]!++;
    UPGRADES.forEach((_, i) => {
      expect(count[i]! / N).toBeCloseTo(exact[i]!, 1);
      expect(Math.abs(count[i]! / N - exact[i]!)).toBeLessThan(0.02);
    });
    const phys = UPGRADES.map((u, i) => (u.physics ? i : -1)).filter((i) => i >= 0);
    const shell = UPGRADES.map((u, i) => (!u.physics ? i : -1)).filter((i) => i >= 0);
    const avg = (idx: number[]): number => idx.reduce((s, i) => s + count[i]!, 0) / idx.length;
    expect(avg(phys)).toBeLessThan(avg(shell) * 0.85);
    expect(PHYSICS_WEIGHT).toBe(0.5);
  });
});
