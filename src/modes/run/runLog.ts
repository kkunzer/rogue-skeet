import type { SchemeId } from '../../input/scheme';
import { SCHEME_IDS } from '../../input/scheme';
import type { UpgradeId } from '../../upgrades/types';
import { UPGRADE_IDS } from '../../upgrades/defs';

/** One finished (won or lost) run, as saved in the run log and exported for the 20-run check. */
export interface RunSummary {
  /** Schema version. */
  v: 1;
  id: string;
  seed: string;
  /** Upgrades picked, in pick order. */
  picks: UpgradeId[];
  score: number;
  /** 1..4 for the rounds, 5 for the boss: the round the run ended in. */
  roundReached: number;
  /** Boss cleared. */
  cleared: boolean;
  /** Clays broken, by clay type. */
  breaksByType: Record<string, number>;
  /** Synergy ids that were active at some point in the run. */
  synergies: string[];
  /** "Felt fresh?" rating, 1..5, or null when the player skipped it. */
  freshRating: number | null;
  scheme: SchemeId;
  buildSha: string;
  /** ISO timestamp of the end of the run. */
  timestamp: string;
  /** Shells left at the end of each round played. */
  shellsLeft: number[];
  shots: number;
  hits: number;
}

const KEY = 'rogue-skeet.runlog.v1';
const MAX_KEPT = 300;

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

/** Human-readable problems with a candidate summary; empty when it is valid. */
export function validateRunSummary(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const o = x as Record<string, unknown>;
  const str = (k: string): void => {
    if (typeof o[k] !== 'string' || (o[k] as string).length === 0) errs.push(`${k}: string`);
  };
  const num = (k: string): void => {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) errs.push(`${k}: number`);
  };
  if (o.v !== 1) errs.push('v: 1');
  for (const k of ['id', 'seed', 'buildSha', 'timestamp']) str(k);
  for (const k of ['score', 'roundReached', 'shots', 'hits']) num(k);
  if (typeof o.roundReached === 'number' && (o.roundReached < 1 || o.roundReached > 5))
    errs.push('roundReached: 1..5');
  if (typeof o.cleared !== 'boolean') errs.push('cleared: boolean');
  if (
    !Array.isArray(o.picks) ||
    !o.picks.every((p) => typeof p === 'string' && (UPGRADE_IDS as readonly string[]).includes(p))
  )
    errs.push('picks: upgrade ids');
  if (!Array.isArray(o.synergies) || !o.synergies.every((s) => typeof s === 'string'))
    errs.push('synergies: string[]');
  if (!Array.isArray(o.shellsLeft) || !o.shellsLeft.every((n) => typeof n === 'number'))
    errs.push('shellsLeft: number[]');
  if (typeof o.breaksByType !== 'object' || o.breaksByType === null) errs.push('breaksByType');
  else if (!Object.values(o.breaksByType).every((n) => typeof n === 'number'))
    errs.push('breaksByType: numbers');
  if (
    o.freshRating !== null &&
    !(typeof o.freshRating === 'number' && o.freshRating >= 1 && o.freshRating <= 5)
  )
    errs.push('freshRating: 1..5 or null');
  if (typeof o.scheme !== 'string' || !(SCHEME_IDS as readonly string[]).includes(o.scheme))
    errs.push('scheme');
  return errs;
}

/** Saved runs, newest first. Corrupt or invalid entries are dropped. */
export function loadRuns(store: KeyValueStore | null = defaultStore()): RunSummary[] {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => validateRunSummary(r).length === 0) as RunSummary[];
  } catch {
    return [];
  }
}

/** Upsert by id, newest first, capped. Never throws. */
export function saveRun(run: RunSummary, store: KeyValueStore | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    const rest = loadRuns(store).filter((r) => r.id !== run.id);
    store.setItem(KEY, JSON.stringify([run, ...rest].slice(0, MAX_KEPT)));
    return true;
  } catch {
    return false;
  }
}

/** Set the "felt fresh?" rating of a saved run. */
export function rateRun(
  id: string,
  rating: number | null,
  store: KeyValueStore | null = defaultStore(),
): boolean {
  const run = loadRuns(store).find((r) => r.id === id);
  if (!run) return false;
  return saveRun({ ...run, freshRating: rating }, store);
}

export function runsToJSON(runs: readonly RunSummary[]): string {
  return JSON.stringify({ game: 'rogue-skeet', kind: 'run-log', v: 1, runs }, null, 2);
}

/** Parse an exported run log (as written by `runsToJSON`). Returns the valid runs, or null if it is not a run log. */
export function parseRunLog(text: string): RunSummary[] | null {
  try {
    const o: unknown = JSON.parse(text);
    if (typeof o !== 'object' || o === null) return null;
    const rec = o as { kind?: unknown; runs?: unknown };
    if (rec.kind !== 'run-log' || !Array.isArray(rec.runs)) return null;
    return rec.runs.filter((r) => validateRunSummary(r).length === 0) as RunSummary[];
  } catch {
    return null;
  }
}

export function runLogFilename(now = new Date()): string {
  return `skeet-run-log_${now.toISOString().slice(0, 10)}.json`;
}

export async function copyRunLog(runs: readonly RunSummary[]): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(runsToJSON(runs));
    return true;
  } catch {
    return false;
  }
}

export function downloadRunLog(runs: readonly RunSummary[]): void {
  const url = URL.createObjectURL(new Blob([runsToJSON(runs)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = runLogFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
