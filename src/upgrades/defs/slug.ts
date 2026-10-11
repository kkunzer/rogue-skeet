import type { UpgradeDef } from '../types';

/** Slug: a tight, fast, hard-hitting pattern that breaks armored clays in one hit; x1.5 score. */
export const slug: UpgradeDef = {
  id: 'slug',
  name: 'Slug',
  category: 'Shells',
  blurb: 'Tiny pattern, faster shot, one-hit armor break, x1.5 score.',
  icon: 'SL',
  color: 0xd9d9e0,
  modifyPattern: (p, ctx) => ({ ...p, radius: p.radius * ctx.params.slugRadiusMul }),
  onClayHit(hit) {
    // pierce armor: whatever armor is left goes in one hit
    hit.damage = Math.max(hit.damage, hit.clay.hitsLeft);
  },
  modifyPhysics: (cfg, ctx) => ({ ...cfg, shotTimeMul: cfg.shotTimeMul * ctx.params.slugTimeMul }),
  modifyScore: (s, ctx) => ({ ...s, mult: s.mult * ctx.params.slugScoreMul }),
};
