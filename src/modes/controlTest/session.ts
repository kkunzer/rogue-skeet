import type { Handedness, SchemeId } from '../../input/scheme';
import { currentJuiceRecord } from '../../feel/feelSystem';
import { TEST_SEED } from '../../sim/throws';
import { BUILD_SHA } from '../../telemetry/build';
import { collectDevice } from '../../telemetry/device';
import {
  SCHEMA_ID,
  SCHEMA_VERSION,
  type AttemptRecord,
  type ControlTestResult,
  type JuiceRecord,
} from '../../telemetry/schema';
import { saveSession, type KeyValueStore } from '../../telemetry/storage';
import { schemeOrderFor } from './plan';

export interface SessionOptions {
  testerId: string;
  handedness: Handedness;
  attemptsPerScheme: number;
  onlySchemes?: SchemeId[];
  settings: Record<string, number | string | boolean>;
  /** Feel settings in force; defaults to the persisted ones. */
  juice?: JuiceRecord;
  /** Defaults to localStorage; pass null to disable autosave. */
  store?: KeyValueStore | null;
  now?: () => Date;
}

/** A tester's whole run: scheme order, attempts, feel ratings. Autosaves after every change. */
export class ControlTestSession {
  readonly result: ControlTestResult;
  readonly order: SchemeId[];
  schemeIdx = 0;
  private readonly store: KeyValueStore | null | undefined;
  private readonly now: () => Date;

  constructor(opts: SessionOptions) {
    this.now = opts.now ?? (() => new Date());
    this.store = opts.store;
    this.order = schemeOrderFor(opts.testerId, opts.onlySchemes);
    const t = this.now().toISOString();
    this.result = {
      schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      buildSha: BUILD_SHA,
      createdAt: t,
      updatedAt: t,
      complete: false,
      tester: { id: opts.testerId.trim(), handedness: opts.handedness },
      device: collectDevice(),
      settings: opts.settings,
      juice: opts.juice ?? currentJuiceRecord(),
      testSeed: TEST_SEED,
      attemptsPerScheme: opts.attemptsPerScheme,
      schemeOrder: this.order,
      schemes: this.order.map((scheme, position) => ({
        scheme,
        position,
        feelRating: null,
        attempts: [],
      })),
    };
    this.save();
  }

  get scheme(): SchemeId | null {
    return this.order[this.schemeIdx] ?? null;
  }

  private get currentRecord() {
    return this.result.schemes[this.schemeIdx];
  }

  /** Attempts already finished for the current scheme. */
  get attemptsDone(): number {
    return this.currentRecord?.attempts.length ?? 0;
  }

  get attemptsPerScheme(): number {
    return this.result.attemptsPerScheme;
  }

  get schemeFinished(): boolean {
    return this.attemptsDone >= this.result.attemptsPerScheme;
  }

  get finished(): boolean {
    return this.schemeIdx >= this.order.length;
  }

  addAttempt(rec: AttemptRecord): void {
    this.currentRecord?.attempts.push(rec);
    this.save();
  }

  setFeel(rating: number): void {
    const rec = this.currentRecord;
    if (rec) rec.feelRating = Math.min(5, Math.max(1, Math.round(rating)));
    this.save();
  }

  /** Move on to the next scheme (after rating). */
  nextScheme(): void {
    this.schemeIdx++;
    if (this.finished) this.result.complete = true;
    this.save();
  }

  save(): void {
    this.result.updatedAt = this.now().toISOString();
    if (this.store === null) return;
    saveSession(this.result, this.store);
  }
}
