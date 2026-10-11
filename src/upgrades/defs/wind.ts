import { generateGusts } from '../wind';
import type { UpgradeDef } from '../types';

/** Wind gusts: seeded lateral gusts push clays. Telegraphed by streaks; included in predictions. */
export const wind: UpgradeDef = {
  id: 'wind',
  name: 'Wind gusts',
  category: 'Physics mod',
  blurb: 'Gusts push clays sideways. Streaks warn you first.',
  icon: 'WI',
  color: 0x8fe3c0,
  physics: true,
  modifyPhysics: (cfg, ctx) => ({ ...cfg, gusts: generateGusts(ctx.rng, ctx.params) }),
};
