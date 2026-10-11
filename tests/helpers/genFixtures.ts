/**
 * Regenerates tests/fixtures/*.json (two synthetic testers) from the headless bots:
 *   npx tsx tests/helpers/genFixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ControlTestSession } from '../../src/modes/controlTest/session';
import { defaultTuning } from '../../src/feel/tuning';
import type { Handedness } from '../../src/input/scheme';
import { runBotAttempt, type BotKind } from './bot';

interface Plan {
  id: string;
  handed: Handedness;
  /** Bot kind per attempt (index 0 = attempt 1). */
  attempts: BotKind[];
  /** Whether miss answers match the classifier. */
  honest: boolean;
  feel: number[];
}

function build(plan: Plan): void {
  let n = 0;
  const session = new ControlTestSession({
    testerId: plan.id,
    handedness: plan.handed,
    attemptsPerScheme: plan.attempts.length,
    settings: Object.fromEntries(
      Object.entries(defaultTuning).filter(([, v]) =>
        ['number', 'string', 'boolean'].includes(typeof v),
      ),
    ) as Record<string, number | string | boolean>,
    store: null,
    now: () => new Date(Date.UTC(2026, 9, 12, 12, 0, n++)),
  });
  session.result.buildSha = 'fixture';
  session.result.device = {
    userAgent: 'fixture',
    platform: 'fixture',
    language: 'en',
    screen: { w: 393, h: 851, dpr: 2.75 },
    viewport: { w: 393, h: 780 },
    maxTouchPoints: 5,
    hardwareConcurrency: 8,
  };
  while (!session.finished) {
    const scheme = session.scheme as 'tap' | 'drag' | 'flick';
    plan.attempts.forEach((kind, i) => {
      const { record } = runBotAttempt({
        scheme,
        kind,
        reaction: kind === 'nolead' ? 0.8 : 0.45,
        attemptNo: i + 1,
        answer: (c) => (plan.honest ? (c ?? 'unsure') : 'unsure'),
      });
      record.startedAt = '2026-10-12T12:00:00.000Z';
      session.addAttempt(record);
    });
    session.setFeel(plan.feel[session.schemeIdx] ?? 3);
    session.nextScheme();
  }
  mkdirSync(new URL('../fixtures/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL(`../fixtures/${plan.id}.json`, import.meta.url),
    JSON.stringify(session.result),
  );
}

build({
  id: 'alice',
  handed: 'right',
  attempts: ['nolead', 'perfect'],
  honest: true,
  feel: [4, 3, 2],
});
build({
  id: 'bob',
  handed: 'left',
  attempts: ['perfect', 'nolead'],
  honest: false,
  feel: [5, 4, 3],
});
