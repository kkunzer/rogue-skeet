import { SCHEME_IDS, type Handedness, type SchemeId } from '../../input/scheme';
import { safeGet, safeSet } from '../../ui/dom';

/** Control scheme and handedness chosen in settings. Shared with the sandbox, which writes the same key. */
export const PREFS_KEY = 'rogue-skeet.sandbox.v1';

export interface Prefs {
  scheme: SchemeId;
  handed: Handedness;
}

export function loadPrefs(): Prefs {
  const out: Prefs = { scheme: 'tap', handed: 'right' };
  try {
    const saved = JSON.parse(safeGet(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    if (saved.scheme && SCHEME_IDS.includes(saved.scheme)) out.scheme = saved.scheme;
    if (saved.handed === 'left' || saved.handed === 'right') out.handed = saved.handed;
  } catch {
    /* corrupt saved settings: defaults */
  }
  return out;
}

export function savePrefs(p: Prefs): void {
  safeSet(PREFS_KEY, JSON.stringify(p));
}
