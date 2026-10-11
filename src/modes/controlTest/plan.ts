import { SCHEME_IDS, type SchemeId } from '../../input/scheme';

/** All 6 orderings of the three schemes. */
export const SCHEME_PERMUTATIONS: readonly (readonly SchemeId[])[] = [
  ['tap', 'drag', 'flick'],
  ['tap', 'flick', 'drag'],
  ['drag', 'tap', 'flick'],
  ['drag', 'flick', 'tap'],
  ['flick', 'tap', 'drag'],
  ['flick', 'drag', 'tap'],
];

/** FNV-1a, 32 bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const normalizeTesterId = (id: string): string => id.trim().toLowerCase();

/**
 * Scheme order for a tester: one of the 6 permutations picked by a hash of the tester ID, so the
 * same tester always gets the same order and orders are spread across testers.
 * `only` restricts the schemes (the permutation's relative order is kept).
 */
export function schemeOrderFor(testerId: string, only?: readonly SchemeId[]): SchemeId[] {
  const perm = SCHEME_PERMUTATIONS[
    hashString(normalizeTesterId(testerId)) % SCHEME_PERMUTATIONS.length
  ] as readonly SchemeId[];
  return only?.length ? perm.filter((s) => only.includes(s)) : [...perm];
}

export interface TestParams {
  attempts: number;
  schemes?: SchemeId[];
}

/** Read `?attempts=` (default 5) and `?schemes=tap,drag` (optional restriction). */
export function parseTestParams(search: string): TestParams {
  const q = new URLSearchParams(search);
  const n = Number.parseInt(q.get('attempts') ?? '', 10);
  const attempts = Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 5;
  const list = (q.get('schemes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SchemeId => (SCHEME_IDS as readonly string[]).includes(s));
  return { attempts, schemes: list.length ? list : undefined };
}
