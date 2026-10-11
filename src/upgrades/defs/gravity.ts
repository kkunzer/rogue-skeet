import type { UpgradeDef } from '../types';

/** Heavier gravity: clays fall faster; launch speed is raised so arcs still cross the screen. */
export const gravity: UpgradeDef = {
  id: 'gravity',
  name: 'Heavier gravity',
  category: 'Physics mod',
  blurb: 'Clays arc faster and drop harder. Relearn your lead.',
  icon: 'HG',
  color: 0xffd166,
  physics: true,
  modifyPhysics: (cfg, ctx) => ({
    ...cfg,
    gravity: cfg.gravity * ctx.params.gravityMul,
    // same apex and range: time scales by 1/sqrt(m), so speed scales by sqrt(m)
    launchSpeedMul: cfg.launchSpeedMul * Math.sqrt(ctx.params.gravityMul),
  }),
};
