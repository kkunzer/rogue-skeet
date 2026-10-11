import type { SchemeId } from '../input/scheme';
import type { ControlTestResult, SchemeRecord } from './schema';

export const LEARNING_DELTA_GOAL = 15; // percentage points
export const EXPLAINABILITY_GOAL = 60; // percent

export interface SchemeSummary {
  scheme: SchemeId;
  /** Testers with at least one attempt on this scheme. */
  testers: number;
  /** Mean hit rate (%) of attempt 1 across testers. */
  firstRate: number | null;
  /** Mean hit rate (%) of each tester's last attempt. */
  lastRate: number | null;
  /** Highest attempt number reached by any tester (the "N" in attempt-N). */
  lastAttempt: number;
  /** Mean per-tester (last - first) in percentage points, over testers with 2+ attempts. */
  learningDelta: number | null;
  medianTimeToFirstShotMs: number | null;
  /** % of "why did you miss?" answers matching the classifier. */
  explainability: number | null;
  prompts: number;
  meanFeel: number | null;
}

export interface TesterCurve {
  tester: string;
  scheme: SchemeId;
  /** Hit rate (%) per attempt, in order. */
  rates: number[];
  feel: number | null;
}

export interface Aggregate {
  files: number;
  schemes: SchemeSummary[];
  curves: TesterCurve[];
  buildShas: string[];
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const SCHEME_ORDER: SchemeId[] = ['tap', 'drag', 'flick'];

export function aggregate(results: ControlTestResult[]): Aggregate {
  // Unique display name per file (same tester id twice -> "id (2)").
  const seen = new Map<string, number>();
  const named = results.map((r) => {
    const n = (seen.get(r.tester.id) ?? 0) + 1;
    seen.set(r.tester.id, n);
    return { r, name: n > 1 ? `${r.tester.id} (${n})` : r.tester.id };
  });

  const curves: TesterCurve[] = [];
  const bySchemeRecs = new Map<SchemeId, { name: string; rec: SchemeRecord }[]>();
  for (const { r, name } of named) {
    for (const rec of r.schemes) {
      if (!rec.attempts.length) continue;
      curves.push({
        tester: name,
        scheme: rec.scheme,
        rates: rec.attempts.map((a) => Math.round(a.hitRate * 1000) / 10),
        feel: rec.feelRating,
      });
      const list = bySchemeRecs.get(rec.scheme) ?? [];
      list.push({ name, rec });
      bySchemeRecs.set(rec.scheme, list);
    }
  }

  const schemes: SchemeSummary[] = [];
  for (const scheme of SCHEME_ORDER) {
    const list = bySchemeRecs.get(scheme) ?? [];
    if (!list.length) continue;
    const firsts = list.map((x) => (x.rec.attempts[0]?.hitRate ?? 0) * 100);
    const lasts = list.map((x) => (x.rec.attempts[x.rec.attempts.length - 1]?.hitRate ?? 0) * 100);
    const deltas = list
      .filter((x) => x.rec.attempts.length >= 2)
      .map(
        (x) =>
          ((x.rec.attempts[x.rec.attempts.length - 1]?.hitRate ?? 0) -
            (x.rec.attempts[0]?.hitRate ?? 0)) *
          100,
      );
    const throws = list.flatMap((x) => x.rec.attempts.flatMap((a) => a.throws));
    const ttfs = throws.map((t) => t.timeToFirstShotMs).filter((v): v is number => v !== null);
    const asked = throws.filter((t) => t.reported !== null);
    const explained = asked.filter((t) => t.explained === true).length;
    const feels = list.map((x) => x.rec.feelRating).filter((v): v is number => v !== null);
    schemes.push({
      scheme,
      testers: list.length,
      firstRate: mean(firsts),
      lastRate: mean(lasts),
      lastAttempt: Math.max(...list.map((x) => x.rec.attempts.length)),
      learningDelta: mean(deltas),
      medianTimeToFirstShotMs: median(ttfs),
      explainability: asked.length ? (explained / asked.length) * 100 : null,
      prompts: asked.length,
      meanFeel: mean(feels),
    });
  }
  return {
    files: results.length,
    schemes,
    curves,
    buildShas: [...new Set(results.map((r) => r.buildSha))],
  };
}

const f1 = (n: number | null, suffix = ''): string =>
  n === null ? 'n/a' : `${n.toFixed(1)}${suffix}`;

export function renderMarkdown(agg: Aggregate): string {
  const out: string[] = [];
  out.push('# Control test results', '');
  out.push(`Files: ${agg.files}. Build: ${agg.buildShas.join(', ') || 'unknown'}.`, '');
  out.push(
    `Guides: learning delta >= +${LEARNING_DELTA_GOAL} points, explainability >= ${EXPLAINABILITY_GOAL}% (marked with a check).`,
    '',
  );
  out.push(
    '| Scheme | Testers | Attempt 1 hit rate | Attempt N hit rate | Learning delta | Median time to first shot | Explainability | Mean feel (1-5) |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const s of agg.schemes) {
    const delta =
      s.learningDelta === null
        ? 'n/a'
        : `${s.learningDelta >= 0 ? '+' : ''}${s.learningDelta.toFixed(1)} pts${s.learningDelta >= LEARNING_DELTA_GOAL ? ' ✓' : ''}`;
    const expl =
      s.explainability === null
        ? 'n/a'
        : `${s.explainability.toFixed(0)}% (${s.prompts})${s.explainability >= EXPLAINABILITY_GOAL ? ' ✓' : ''}`;
    out.push(
      `| ${s.scheme} | ${s.testers} | ${f1(s.firstRate, '%')} | ${f1(s.lastRate, '%')} (N=${s.lastAttempt}) | ${delta} | ${
        s.medianTimeToFirstShotMs === null ? 'n/a' : `${Math.round(s.medianTimeToFirstShotMs)} ms`
      } | ${expl} | ${f1(s.meanFeel)} |`,
    );
  }
  out.push('', '## Per-tester curves', '', 'Hit rate (%) by attempt.', '');
  out.push('| Tester | Scheme | Curve | Feel |', '|---|---|---|---:|');
  for (const c of agg.curves) {
    out.push(
      `| ${c.tester} | ${c.scheme} | ${c.rates.map((r) => r.toFixed(0)).join(' → ')} | ${c.feel ?? 'n/a'} |`,
    );
  }
  out.push('');
  return out.join('\n');
}
