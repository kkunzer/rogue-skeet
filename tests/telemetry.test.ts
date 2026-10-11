import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ControlTestSession } from '../src/modes/controlTest/session';
import { AttemptRunner } from '../src/modes/controlTest/attempt';
import { resultFilename, resultToJSON } from '../src/telemetry/export';
import { SCHEMA_ID, SCHEMA_VERSION, parseResult, validateResult } from '../src/telemetry/schema';
import { loadSessions, saveSession, type KeyValueStore } from '../src/telemetry/storage';
import { defaultSimConfig } from '../src/sim/config';
import { runBotAttempt } from './helpers/bot';

const memStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

function fullSession(store: KeyValueStore | null = null) {
  const session = new ControlTestSession({
    testerId: 'Round Trip',
    handedness: 'left',
    attemptsPerScheme: 1,
    settings: { aimAssist: 0, handed: 'left', ghostTrail: false },
    store,
  });
  while (!session.finished) {
    const scheme = session.scheme as 'tap' | 'drag' | 'flick';
    session.addAttempt(runBotAttempt({ scheme, kind: 'nolead', reaction: 0.8 }).record);
    session.setFeel(4);
    session.nextScheme();
  }
  return session;
}

describe('telemetry schema', () => {
  it('round-trips through JSON and validates', () => {
    const { result } = fullSession();
    expect(result.schema).toBe(SCHEMA_ID);
    expect(result.version).toBe(SCHEMA_VERSION);
    expect(result.complete).toBe(true);
    expect(validateResult(result)).toEqual([]);
    const back = parseResult(resultToJSON(result));
    expect(back).toEqual(result);
    expect(resultFilename(result)).toMatch(
      /^skeet-control-test_Round_Trip_\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
  it('records per-throw launch, first-shot time, shots and miss classification', () => {
    const { result } = fullSession();
    const att = result.schemes[0]?.attempts[0];
    expect(att?.throws).toHaveLength(20);
    const th = att?.throws.find((t) => t.shots.some((s) => !s.hit && s.classified));
    expect(th).toBeDefined();
    const shot = th?.shots.find((s) => !s.hit && s.classified);
    expect(shot?.missVector).not.toBeNull();
    expect(shot?.arriveT).toBeGreaterThan(shot?.t ?? 0);
    expect(th?.timeToFirstShotMs).toBeGreaterThan(0);
    expect(th?.reported).toBe(th?.classified); // honest bot answers
    expect(th?.explained).toBe(true);
  });
  it('rejects malformed results', () => {
    const { result } = fullSession();
    expect(validateResult({})).not.toEqual([]);
    expect(validateResult({ ...result, version: 99 })).not.toEqual([]);
    const bad = JSON.parse(resultToJSON(result));
    bad.schemes[0].attempts[0].throws[0].shots = 'nope';
    expect(validateResult(bad)).not.toEqual([]);
    expect(() => parseResult('{"schema":"x"}')).toThrow();
  });
  it('validates every fixture file', () => {
    const dir = new URL('./fixtures/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files)
      expect(validateResult(JSON.parse(readFileSync(new URL(f, dir), 'utf8')))).toEqual([]);
  });
});

describe('autosave', () => {
  it('saves after every change and loads back newest first; corrupt data is ignored', () => {
    const store = memStore();
    const s = new ControlTestSession({
      testerId: 'a',
      handedness: 'right',
      attemptsPerScheme: 1,
      settings: {},
      store,
    });
    expect(loadSessions(store)).toHaveLength(1);
    expect(loadSessions(store)[0]?.complete).toBe(false);
    s.addAttempt(runBotAttempt({ scheme: s.scheme ?? 'tap', kind: 'perfect' }).record);
    expect(loadSessions(store)[0]?.schemes[0]?.attempts).toHaveLength(1);
    // a second session is kept alongside (different createdAt/tester)
    saveSession({ ...s.result, tester: { id: 'b', handedness: 'right' } }, store);
    expect(loadSessions(store).map((r) => r.tester.id)).toEqual(['b', 'a']);
    store.setItem('rogue-skeet.controlTest.sessions.v1', '{not json');
    expect(loadSessions(store)).toEqual([]);
    expect(loadSessions(null)).toEqual([]);
    expect(saveSession(s.result, null)).toBe(false);
  });
});

describe('attempt flow', () => {
  it('pauses and asks after a throw with a miss, then continues; explained matches classifier', () => {
    const runner = new AttemptRunner({ ...defaultSimConfig }, 1);
    // never shoot: nothing to ask (no shots), the attempt just runs out
    let asked = 0;
    runner.events.on('asking', () => asked++);
    for (let i = 0; i < 120 * 200 && runner.state !== 'done'; i++) runner.update(1 / 120);
    expect(asked).toBe(0);
    expect(runner.state).toBe('done');
    const rec = runner.record();
    expect(rec.hitRate).toBe(0);
    expect(rec.throws).toHaveLength(20);
  });
  it('a missed shot triggers the prompt, and holds the next throw until answered', () => {
    const runner = new AttemptRunner({ ...defaultSimConfig }, 1);
    let step = 0;
    while (runner.state === 'running' && step++ < 120 * 30) {
      const c = runner.world.liveClays()[0];
      if (c && c.age > 0.5 && runner.world.shots.length === 0 && runner.world.stats.shots === 0) {
        runner.fire({ aim: { x: c.x, y: c.y }, t: runner.world.time }); // no lead: miss
      }
      runner.update(1 / 120);
    }
    expect(runner.state).toBe('asking');
    const idx = runner.director.index;
    for (let i = 0; i < 240; i++) runner.update(1 / 120);
    expect(runner.director.index).toBe(idx); // held
    const classified = runner.classifiedReason;
    expect(classified).not.toBeNull();
    runner.answer('unsure');
    expect(runner.recorder.lastThrow?.explained).toBe(false);
    expect(runner.state).toBe('running');
    for (let i = 0; i < 240; i++) runner.update(1 / 120);
    expect(runner.director.index).toBe(idx + 1);
  });
});
