import { firstOf, playRun } from './runBot';
import type { UpgradeId } from '../../src/upgrades/types';

const kind = (process.argv[2] ?? 'perfect') as 'perfect' | 'noisy' | 'nolead';
const n = Number(process.argv[3] ?? 6);
const prefs = (process.argv[4] ?? '').split(',').filter(Boolean) as UpgradeId[];
const noise = Number(process.argv[5] ?? 2.5);
let wins = 0;
for (let i = 1; i <= n; i++) {
  const r = playRun({
    seed: `seed${i}`,
    kind,
    noise,
    pick: prefs.length ? firstOf(...prefs) : undefined,
  });
  if (r.won) wins++;
  console.log(
    `${kind} seed${i}: ${r.won ? 'WON ' : 'lost'} score=${r.score} round=${r.ctl.round + 1} shellsLeft=[${r.shellsLeft.join(',')}] shots=${r.shots} hits=${r.hits} picks=${r.ctl.owned.join('/')}`,
  );
}
console.log(`wins ${wins}/${n}`);
