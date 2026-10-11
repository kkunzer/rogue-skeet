import { dist } from '../../core/vec2';
import type { UpgradeDef } from '../types';

/** Chain range with the Shrapnel Storm synergy applied. */
export function chainRange(base: number, bonus: number, storm: boolean): number {
  return base * (storm ? 1 + bonus : 1);
}

/** Chain shatter: a break arcs to the nearest live clay in range, up to `chainLinks` links per shot. */
export const chain: UpgradeDef = {
  id: 'chain',
  name: 'Chain shatter',
  category: 'Shells',
  blurb: 'A break arcs to the nearest clay, up to 3 links.',
  icon: 'CH',
  color: 0x5ec8ff,
  onClayBroken(info, world, ctx) {
    if (info.cause.kind === 'explosion') return;
    const link = info.cause.kind === 'chain' ? info.cause.link : 0;
    if (link >= ctx.params.chainLinks) return;
    const range = chainRange(
      ctx.params.chainRadius,
      ctx.params.synergyChainBonus,
      ctx.synergy('shrapnelStorm'),
    );
    let best: { clay: (typeof info)['clay']; pos: { x: number; y: number }; d: number } | null =
      null;
    for (const e of world.liveAtBurst()) {
      const d = dist(e.pos, info.pos);
      if (d < range && (!best || d < best.d || (d === best.d && e.clay.id < best.clay.id)))
        best = { ...e, d };
    }
    if (!best) return;
    world.emitChain(info.pos, best.pos, link + 1);
    world.damageClay(best.clay, info.shot, 1, best.d, false, {
      kind: 'chain',
      depth: info.cause.depth + 1,
      link: link + 1,
      from: info.pos,
    });
  },
};
