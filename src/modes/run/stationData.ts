import { Rng } from '../../core/rng';
import type { ClayTypeId } from '../../sim/clay';
import type { BaseHouseId, HouseId } from '../../sim/houses';
import { TEST_LAUNCH, type ClaySpec, type LaunchRange, type ThrowSpec } from '../../sim/throws';

/** One round of the station. All numbers are data: tune them here (shell pools also via tuning.runShellBonus). */
export interface RoundDef {
  id: 'r1' | 'r2' | 'r3' | 'r4' | 'boss';
  /** Short label for the HUD ("Round 2/4", "BOSS"). */
  hud: string;
  /** Card title ("Round 2 - Splitters"). */
  title: string;
  blurb: string;
  /** Starting shell pool for this round. */
  shells: number;
  /** Throws in the round (the boss is a single flurry throw). */
  throws: number;
  /** How many of the throws are doubles. */
  doubles: number;
  /** Exactly this many clays of each special type are placed among the round's clays. */
  specials: Partial<Record<Exclude<ClayTypeId, 'standard' | 'splitlet'>, number>>;
  boss?: boolean;
  /** Boss only: clays in the flurry (default FLURRY_CLAYS). */
  clays?: number;
}

export const ROUNDS: readonly RoundDef[] = [
  {
    id: 'r1',
    hud: 'Round 1/4',
    title: 'Round 1 — Standard',
    blurb: 'Singles and doubles from the high and low houses.',
    shells: 16,
    throws: 8,
    doubles: 2,
    specials: {},
  },
  {
    id: 'r2',
    hud: 'Round 2/4',
    title: 'Round 2 — Splitters',
    blurb: 'Purple clays break into two smaller ones. Every piece that escapes costs a shell.',
    shells: 20,
    throws: 9,
    doubles: 2,
    specials: { splitter: 2 },
  },
  {
    id: 'r3',
    hud: 'Round 3/4',
    title: 'Round 3 — Rabbits',
    blurb: 'Green rabbits roll and bounce along the ground. Lead them sideways.',
    shells: 18,
    throws: 9,
    doubles: 2,
    specials: { rabbit: 3, splitter: 1 },
  },
  {
    id: 'r4',
    hud: 'Round 4/4',
    title: 'Round 4 — Armored',
    blurb: 'Steel clays take two hits. The first cracks and deflects them.',
    shells: 22,
    throws: 9,
    doubles: 2,
    specials: { armored: 3, splitter: 1, rabbit: 1 },
  },
  {
    id: 'boss',
    hud: 'BOSS',
    title: 'Boss — The Flurry',
    blurb: 'Twelve clays from three houses in three seconds. Keep a shell in the gun.',
    shells: 18,
    throws: 1,
    doubles: 0,
    specials: { splitter: 1, armored: 2, rabbit: 2 },
    boss: true,
  },
];

export const BOSS_INDEX = ROUNDS.length - 1;
export const FLURRY_CLAYS = 12;
/** The boss flurry launches over this many seconds. */
export const FLURRY_SECONDS = 3.0;

/** Launch ranges for the trench (center) house: nearly straight up, leaning either way. */
export const CENTER_LAUNCH: LaunchRange = { speed: [62, 74], angle: [78, 102] };
/** Rabbit roll speed range (world units / s). */
export const RABBIT_SPEED: [number, number] = [34, 46];
/** Pause after a throw before the next one, seconds. */
export const GAP_RANGE: [number, number] = [0.9, 1.4];

const r1 = (n: number): number => Math.round(n * 10) / 10;

function skySpec(rng: Rng, type: ClayTypeId, house: HouseId, delay: number): ClaySpec {
  const range = house === 'center' ? CENTER_LAUNCH : TEST_LAUNCH[house];
  return {
    type,
    house,
    delay: Math.round(delay * 100) / 100,
    speed: r1(rng.range(...range.speed)),
    angleDeg: r1(rng.range(...range.angle)),
  };
}

function rabbitSpec(rng: Rng, house: BaseHouseId, delay: number): ClaySpec {
  return {
    type: 'rabbit',
    house,
    delay: Math.round(delay * 100) / 100,
    speed: r1(rng.range(...RABBIT_SPEED)),
    angleDeg: 0,
  };
}

const spec = (rng: Rng, type: ClayTypeId, house: BaseHouseId, delay: number): ClaySpec =>
  type === 'rabbit' ? rabbitSpec(rng, house, delay) : skySpec(rng, type, house, delay);

function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

/**
 * The throws of one round: a pure function of (seed, round). Doubles are spread out and never
 * first; special clays are placed among the later clays so the first throw is always a plain
 * standard clay. Rabbits only appear from the high or low house.
 */
export function buildRoundThrows(
  seed: string,
  round: number,
  gapMul = 1,
  defs: readonly RoundDef[] = ROUNDS,
): ThrowSpec[] {
  const def = defs[round];
  if (!def) throw new Error(`no round ${round}`);
  const rng = new Rng(`${seed}/throws/${round}`);
  if (def.boss) return [buildFlurry(rng, def)];

  // which throws are doubles: pick from 2..N-1, no two adjacent
  const doubleAt = new Set<number>();
  const cands = shuffle(
    rng,
    Array.from({ length: def.throws - 2 }, (_, i) => i + 2),
  );
  for (const c of cands) {
    if (doubleAt.size >= def.doubles) break;
    if (!doubleAt.has(c - 1) && !doubleAt.has(c + 1)) doubleAt.add(c);
  }

  // house of each clay, then types
  type Slot = { throwIdx: number; house: BaseHouseId; delay: number };
  const slots: Slot[] = [];
  let prev: BaseHouseId = rng.next() < 0.5 ? 'high' : 'low';
  for (let i = 0; i < def.throws; i++) {
    if (doubleAt.has(i)) {
      slots.push({ throwIdx: i, house: 'high', delay: 0 });
      slots.push({ throwIdx: i, house: 'low', delay: rng.range(0, 0.12) });
    } else {
      // mostly alternate, sometimes repeat
      const flip = rng.next() < 0.75;
      prev = flip ? (prev === 'high' ? 'low' : 'high') : prev;
      slots.push({ throwIdx: i, house: prev, delay: 0 });
    }
  }
  const types: ClayTypeId[] = slots.map(() => 'standard');
  const order = shuffle(
    rng,
    slots.map((_, i) => i).filter((i) => (slots[i] as Slot).throwIdx > 0),
  );
  let k = 0;
  for (const [type, n] of Object.entries(def.specials) as [ClayTypeId, number][]) {
    for (let j = 0; j < n; j++) types[order[k++] as number] = type;
  }

  const out: ThrowSpec[] = [];
  for (let i = 0; i < def.throws; i++) {
    const mine = slots.flatMap((s, idx) =>
      s.throwIdx === i ? [{ s, type: types[idx] as ClayTypeId }] : [],
    );
    out.push({
      kind: mine.length > 1 ? 'double' : 'single',
      clays: mine.map(({ s, type }) => spec(rng, type, s.house, s.delay)),
      gapAfter: r1(rng.range(...GAP_RANGE) * gapMul),
    });
  }
  return out;
}

/**
 * The boss: 12 clays from three houses (high, low and the center trench) launched evenly across
 * FLURRY_SECONDS, round-robin by house with seeded jitter, special types sprinkled in.
 */
function buildFlurry(rng: Rng, def: RoundDef): ThrowSpec {
  const count = def.clays ?? FLURRY_CLAYS;
  const houses: HouseId[] = [];
  const cycle: HouseId[] = ['center', 'high', 'low'];
  let start = rng.int(0, 2);
  while (houses.length < count) {
    houses.push(cycle[start % 3] as HouseId);
    start++;
  }
  const types: ClayTypeId[] = houses.map(() => 'standard');
  // rabbits need a base house; other specials go anywhere but the very first clay
  const free = shuffle(
    rng,
    houses.map((_, i) => i).filter((i) => i > 0),
  );
  const take = (pred: (i: number) => boolean): number => {
    const at = free.findIndex(pred);
    if (at < 0) return -1;
    return free.splice(at, 1)[0] as number;
  };
  for (const [type, n] of Object.entries(def.specials) as [ClayTypeId, number][]) {
    for (let j = 0; j < n; j++) {
      const i = take((idx) => type !== 'rabbit' || houses[idx] !== 'center');
      if (i >= 0) types[i] = type;
    }
  }
  const step = FLURRY_SECONDS / Math.max(1, count - 1);
  const clays = houses.map((h, i): ClaySpec => {
    const delay = Math.max(0, i * step + rng.range(-0.06, 0.06));
    const type = types[i] as ClayTypeId;
    if (type === 'rabbit') return rabbitSpec(rng, h as BaseHouseId, delay);
    return skySpec(rng, type, h, delay);
  });
  clays.sort((a, b) => a.delay - b.delay);
  clays[0] = { ...(clays[0] as ClaySpec), delay: 0 };
  return { kind: 'double', clays, gapAfter: 1 };
}
