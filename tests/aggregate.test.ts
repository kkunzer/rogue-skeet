import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aggregate, median, renderMarkdown } from '../src/telemetry/aggregate';
import { parseResult } from '../src/telemetry/schema';

const load = (name: string) =>
  parseResult(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('aggregate', () => {
  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  const alice = load('alice'); // nolead then perfect, honest answers, 100% explained on attempt 1
  const bob = load('bob'); // perfect then nolead, "not sure" answers
  const agg = aggregate([alice, bob]);

  it('computes first/last hit rate and learning delta per scheme', () => {
    expect(agg.files).toBe(2);
    expect(agg.schemes.map((s) => s.scheme)).toEqual(['tap', 'drag', 'flick']);
    for (const s of agg.schemes) {
      expect(s.testers).toBe(2);
      // alice 3/24 -> 24/24, bob 24/24 -> 3/24
      expect(s.firstRate).toBeCloseTo(((3 / 24 + 1) / 2) * 100, 6);
      expect(s.lastRate).toBeCloseTo(((1 + 3 / 24) / 2) * 100, 6);
      expect(s.learningDelta).toBeCloseTo(0, 6);
      expect(s.lastAttempt).toBe(2);
    }
  });
  it('computes explainability from reported vs classified reasons and mean feel', () => {
    const onlyAlice = aggregate([alice]);
    const onlyBob = aggregate([bob]);
    for (const s of onlyAlice.schemes) expect(s.explainability).toBe(100);
    for (const s of onlyBob.schemes) expect(s.explainability).toBe(0);
    for (const s of agg.schemes) expect(s.explainability).toBeCloseTo(50, 6);
    const feel = Object.fromEntries(agg.schemes.map((s) => [s.scheme, s.meanFeel]));
    // alice order: flick(4) drag(3) tap(2); bob: drag(5) tap(4) flick(3) -> by scheme name
    expect(feel.tap).toBeCloseTo(
      (alice.schemes.find((s) => s.scheme === 'tap')?.feelRating ?? 0) / 2 +
        (bob.schemes.find((s) => s.scheme === 'tap')?.feelRating ?? 0) / 2,
      6,
    );
  });
  it('takes the median time to first shot across all throws', () => {
    for (const s of agg.schemes) {
      expect(s.medianTimeToFirstShotMs).toBeGreaterThan(400);
      expect(s.medianTimeToFirstShotMs).toBeLessThan(900);
    }
  });
  it('renders a markdown table per scheme and per-tester curves', () => {
    const md = renderMarkdown(agg);
    expect(md).toContain('| Scheme | Testers | Attempt 1 hit rate');
    expect(md).toMatch(/\| tap \| 2 \|/);
    expect(md).toContain('## Per-tester curves');
    expect(md).toMatch(/\| alice \| tap \| 13 → 100 \|/);
    expect(md).toMatch(/\| bob \| tap \| 100 → 13 \|/);
  });
  it('flags learning delta and explainability goals', () => {
    const md = renderMarkdown(aggregate([alice]));
    expect(md).toContain('✓'); // +87.5 pts and 100% explainability
    expect(renderMarkdown(aggregate([bob]))).not.toMatch(/pts ✓/);
  });
  it('disambiguates a repeated tester id', () => {
    const a = aggregate([alice, alice]);
    expect(a.curves.some((c) => c.tester === 'alice (2)')).toBe(true);
  });
});
