import type { SchemeId, Handedness } from '../input/scheme';
import type { MissReason } from '../sim/classify';
import type { HouseId } from '../sim/houses';

export const SCHEMA_ID = 'rogue-skeet.control-test';
/** v2 adds the required `juice` block. v1 files (no juice block) still validate. */
export const SCHEMA_VERSION = 2;
export const SUPPORTED_VERSIONS: readonly number[] = [1, 2];

/** Feel settings in force during a session: the juice A/B state plus sound and haptics. */
export interface JuiceRecord {
  juice: boolean;
  sound: boolean;
  volume: number;
  haptics: boolean;
  hapticProvider: string;
}

export type ReportedReason = MissReason | 'unsure';
export const REPORTED_REASONS: readonly ReportedReason[] = [
  'ahead',
  'behind',
  'high',
  'low',
  'unsure',
];

export interface XY {
  x: number;
  y: number;
}

export interface ShotRecord {
  /** Fire time, ms since attempt start. */
  t: number;
  /** Burst time, ms since attempt start. */
  arriveT: number;
  barrel: number;
  aim: XY;
  hit: boolean;
  perfect: boolean;
  /** Clay ids broken by this shot. */
  broke: number[];
  /** For a miss: nearest live clay at burst time. */
  targetClayId: number | null;
  /** aim - clay position at burst, world units. */
  missVector: XY | null;
  missDist: number | null;
  /** Miss classifier output. */
  classified: MissReason | null;
}

export interface ClayRecord {
  id: number;
  house: HouseId;
  launchT: number;
  broken: boolean;
  brokenT: number | null;
}

export interface ThrowRecord {
  index: number;
  kind: 'single' | 'double';
  /** First launch, ms since attempt start. */
  launchT: number;
  clays: ClayRecord[];
  /** Launch to first shot fired, ms; null if no shot was fired. */
  timeToFirstShotMs: number | null;
  shots: ShotRecord[];
  /** Taps rejected by cycle / reload. */
  rejectedTaps: number;
  /** Classifier's reason for the last miss in this throw (null when nothing to explain). */
  classified: MissReason | null;
  /** What the tester said, when asked. */
  reported: ReportedReason | null;
  /** reported === classified (null when not asked). */
  explained: boolean | null;
}

export interface AttemptRecord {
  /** 1-based attempt number within the scheme. */
  attempt: number;
  startedAt: string;
  durationMs: number;
  clays: number;
  broken: number;
  /** Throws where every clay broke. */
  throwsCleared: number;
  /** broken / clays, 0..1. */
  hitRate: number;
  /** Shots fired while no throw was in progress. */
  strayShots: number;
  throws: ThrowRecord[];
}

export interface SchemeRecord {
  scheme: SchemeId;
  /** Position in this tester's Latin-square order, 0-based. */
  position: number;
  /** 1..5, or null if not rated. */
  feelRating: number | null;
  attempts: AttemptRecord[];
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screen: { w: number; h: number; dpr: number };
  viewport: { w: number; h: number };
  maxTouchPoints: number;
  hardwareConcurrency: number | null;
}

export interface ControlTestResult {
  schema: typeof SCHEMA_ID;
  version: number;
  buildSha: string;
  createdAt: string;
  updatedAt: string;
  complete: boolean;
  tester: { id: string; handedness: Handedness };
  device: DeviceInfo;
  /** Snapshot of every tunable at the start of the session (aim assist, offsets, flick curve, ...). */
  settings: Record<string, number | string | boolean>;
  /** Present in v2+; absent in v1 files. */
  juice?: JuiceRecord;
  testSeed: string;
  attemptsPerScheme: number;
  schemeOrder: SchemeId[];
  schemes: SchemeRecord[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isXY = (v: unknown): boolean => isObj(v) && isNum(v.x) && isNum(v.y);

/** Hand-rolled validator (no dependency): returns a list of problems, empty when valid. */
export function validateResult(input: unknown): string[] {
  const errs: string[] = [];
  const need = (ok: boolean, msg: string): void => {
    if (!ok && errs.length < 50) errs.push(msg);
  };
  if (!isObj(input)) return ['result is not an object'];
  need(input.schema === SCHEMA_ID, `schema must be "${SCHEMA_ID}"`);
  need(
    typeof input.version === 'number' && SUPPORTED_VERSIONS.includes(input.version),
    `version must be one of ${SUPPORTED_VERSIONS.join(', ')}`,
  );
  if (input.version === 2) {
    const j = input.juice;
    need(
      isObj(j) &&
        typeof j.juice === 'boolean' &&
        typeof j.sound === 'boolean' &&
        isNum(j.volume) &&
        typeof j.haptics === 'boolean' &&
        isStr(j.hapticProvider),
      'juice block invalid (required in v2)',
    );
  } else if (input.juice !== undefined) {
    need(isObj(input.juice), 'juice must be an object');
  }
  need(isStr(input.buildSha), 'buildSha must be a string');
  need(
    isStr(input.createdAt) && !Number.isNaN(Date.parse(input.createdAt)),
    'createdAt must be an ISO date',
  );
  need(typeof input.complete === 'boolean', 'complete must be boolean');
  need(
    isObj(input.tester) &&
      isStr(input.tester.id) &&
      (input.tester.handedness === 'right' || input.tester.handedness === 'left'),
    'tester invalid',
  );
  need(isObj(input.device) && isStr(input.device.userAgent), 'device invalid');
  need(isObj(input.settings), 'settings must be an object');
  need(isStr(input.testSeed), 'testSeed must be a string');
  need(isNum(input.attemptsPerScheme), 'attemptsPerScheme must be a number');
  const ids = ['tap', 'drag', 'flick'];
  need(
    Array.isArray(input.schemeOrder) && input.schemeOrder.every((s) => ids.includes(s as string)),
    'schemeOrder invalid',
  );
  if (!Array.isArray(input.schemes)) {
    need(false, 'schemes must be an array');
    return errs;
  }
  input.schemes.forEach((sc: unknown, si: number) => {
    const p = `schemes[${si}]`;
    if (!isObj(sc)) return need(false, `${p} not an object`);
    need(ids.includes(sc.scheme as string), `${p}.scheme invalid`);
    need(isNum(sc.position), `${p}.position invalid`);
    need(
      sc.feelRating === null || (isNum(sc.feelRating) && sc.feelRating >= 1 && sc.feelRating <= 5),
      `${p}.feelRating must be null or 1..5`,
    );
    if (!Array.isArray(sc.attempts)) return need(false, `${p}.attempts must be an array`);
    sc.attempts.forEach((a: unknown, ai: number) => {
      const ap = `${p}.attempts[${ai}]`;
      if (!isObj(a)) return need(false, `${ap} not an object`);
      need(isNum(a.attempt) && a.attempt >= 1, `${ap}.attempt invalid`);
      need(isStr(a.startedAt), `${ap}.startedAt invalid`);
      need(isNum(a.clays) && isNum(a.broken) && a.broken <= a.clays, `${ap} clays/broken invalid`);
      need(isNum(a.hitRate) && a.hitRate >= 0 && a.hitRate <= 1, `${ap}.hitRate invalid`);
      need(isNum(a.throwsCleared) && isNum(a.strayShots), `${ap} counters invalid`);
      if (!Array.isArray(a.throws)) return need(false, `${ap}.throws must be an array`);
      a.throws.forEach((t: unknown, ti: number) => {
        const tp = `${ap}.throws[${ti}]`;
        if (!isObj(t)) return need(false, `${tp} not an object`);
        need(isNum(t.index) && isNum(t.launchT) && isNum(t.rejectedTaps), `${tp} numbers invalid`);
        need(t.kind === 'single' || t.kind === 'double', `${tp}.kind invalid`);
        need(
          t.timeToFirstShotMs === null || isNum(t.timeToFirstShotMs),
          `${tp}.timeToFirstShotMs invalid`,
        );
        need(
          t.classified === null ||
            ['ahead', 'behind', 'high', 'low'].includes(t.classified as string),
          `${tp}.classified invalid`,
        );
        need(
          t.reported === null || REPORTED_REASONS.includes(t.reported as ReportedReason),
          `${tp}.reported invalid`,
        );
        need(t.explained === null || typeof t.explained === 'boolean', `${tp}.explained invalid`);
        need(
          Array.isArray(t.clays) &&
            t.clays.every((c: unknown) => isObj(c) && isNum(c.id) && typeof c.broken === 'boolean'),
          `${tp}.clays invalid`,
        );
        if (!Array.isArray(t.shots)) return need(false, `${tp}.shots must be an array`);
        t.shots.forEach((s: unknown, i: number) => {
          const sp = `${tp}.shots[${i}]`;
          if (!isObj(s)) return need(false, `${sp} not an object`);
          need(isNum(s.t) && isNum(s.arriveT) && isNum(s.barrel), `${sp} times invalid`);
          need(isXY(s.aim), `${sp}.aim invalid`);
          need(typeof s.hit === 'boolean' && typeof s.perfect === 'boolean', `${sp} flags invalid`);
          need(s.missVector === null || isXY(s.missVector), `${sp}.missVector invalid`);
          need(
            s.classified === null ||
              ['ahead', 'behind', 'high', 'low'].includes(s.classified as string),
            `${sp}.classified invalid`,
          );
        });
      });
    });
  });
  return errs;
}

export function parseResult(json: string): ControlTestResult {
  const data: unknown = JSON.parse(json);
  const errs = validateResult(data);
  if (errs.length) throw new Error(`Invalid control-test result: ${errs.slice(0, 5).join('; ')}`);
  return data as ControlTestResult;
}
