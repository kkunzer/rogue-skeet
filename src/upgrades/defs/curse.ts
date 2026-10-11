import type { UpgradeDef } from '../types';

/** Curse of the narrow barrel: smaller pattern, double score. */
export const curse: UpgradeDef = {
  id: 'curse',
  name: 'Choke curse',
  category: 'Curse',
  blurb: 'Smaller pattern radius, but x2 score.',
  icon: 'CU',
  color: 0xb36bff,
  modifyPattern: (p, ctx) => ({ ...p, radius: p.radius * ctx.params.curseRadiusMul }),
  modifyScore: (s, ctx) => ({ ...s, mult: s.mult * ctx.params.curseScoreMul }),
};
