import { validateResult, type ControlTestResult } from './schema';

const KEY = 'rogue-skeet.controlTest.sessions.v1';
const MAX_KEPT = 12;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Load saved sessions (newest first). Corrupt or invalid entries are dropped. */
export function loadSessions(store: KeyValueStore | null = defaultStore()): ControlTestResult[] {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => validateResult(r).length === 0) as ControlTestResult[];
  } catch {
    return [];
  }
}

/** Upsert a session (keyed by createdAt + tester id), newest first, capped. Never throws. */
export function saveSession(
  result: ControlTestResult,
  store: KeyValueStore | null = defaultStore(),
): boolean {
  if (!store) return false;
  try {
    const key = (r: ControlTestResult): string => `${r.createdAt}|${r.tester.id}`;
    const rest = loadSessions(store).filter((r) => key(r) !== key(result));
    const next = [result, ...rest].slice(0, MAX_KEPT);
    store.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
