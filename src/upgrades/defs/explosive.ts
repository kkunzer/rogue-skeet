import { dist } from '../../core/vec2';
import type { UpgradeDef } from '../types';

/** Explosive fragments: a break also breaks every live clay within R (explosions never re-explode). */
export const explosive: UpgradeDef = {
  id: 'explosive',
  name: 'Explosive fragments',
  category: 'Shells',
  blurb: 'Every break blows up nearby clays.',
  icon: 'EX',
  color: 0xff7a45,
  onClayBroken(info, world, ctx) {
    if (info.cause.kind === 'explosion') return;
    const r = ctx.params.explosiveRadius;
    const near = world
      .liveAtBurst()
      .map((e) => ({ ...e, d: dist(e.pos, info.pos) }))
      .filter((e) => e.d < r)
      .sort((a, b) => a.d - b.d || a.clay.id - b.clay.id);
    if (near.length === 0) return;
    world.emitExplosion(info.pos.x, info.pos.y, r);
    const cause = {
      kind: 'explosion' as const,
      depth: info.cause.depth + 1,
      link: 0,
      from: info.pos,
    };
    for (const e of near) world.damageClay(e.clay, info.shot, 1, e.d, false, cause);
  },
};
