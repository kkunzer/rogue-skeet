import type { ThrowDirector } from '../sim/director';
import type { World } from '../sim/world';
import type { MissReason } from '../sim/classify';
import type { AttemptRecord, ClayRecord, ReportedReason, ShotRecord, ThrowRecord } from './schema';

const ms = (sec: number): number => Math.round(sec * 1000);
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Records one attempt (a pass through the 20-throw set) from World and Director events. */
export class AttemptRecorder {
  private throws: ThrowRecord[] = [];
  private current: ThrowRecord | null = null;
  private shotRecs = new Map<number, ShotRecord>();
  private stray = 0;
  private readonly t0: number;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly world: World,
    director: ThrowDirector,
    private readonly attempt: number,
    private readonly startedAt: string = new Date().toISOString(),
  ) {
    this.t0 = world.time;
    const rel = (t: number): number => ms(t - this.t0);
    const w = world.events;
    this.offs.push(
      director.events.on('throwStart', ({ index, spec, t }) => {
        this.current = {
          index,
          kind: spec.kind,
          launchT: rel(t),
          clays: [],
          timeToFirstShotMs: null,
          shots: [],
          rejectedTaps: 0,
          classified: null,
          reported: null,
          explained: null,
        };
      }),
      director.events.on('throwEnd', () => {
        const th = this.current;
        if (!th) return;
        const missed = [...th.shots].reverse().find((s) => !s.hit && s.classified);
        th.classified = missed?.classified ?? null;
        this.throws.push(th);
        this.current = null;
      }),
      w.on('launch', ({ clay, t }) => {
        const th = this.current;
        if (!th) return;
        const rec: ClayRecord = {
          id: clay.id,
          house: clay.house,
          launchT: rel(t),
          broken: false,
          brokenT: null,
        };
        th.clays.push(rec);
      }),
      w.on('shot', ({ shot }) => {
        const th = this.current;
        if (!th) {
          this.stray++;
          return;
        }
        const rec: ShotRecord = {
          t: rel(shot.fireTime),
          arriveT: rel(shot.arriveTime),
          barrel: shot.barrel,
          aim: { x: r2(shot.aim.x), y: r2(shot.aim.y) },
          hit: false,
          perfect: false,
          broke: [],
          targetClayId: null,
          missVector: null,
          missDist: null,
          classified: null,
        };
        th.shots.push(rec);
        this.shotRecs.set(shot.id, rec);
        if (th.timeToFirstShotMs === null) {
          const first = th.clays[0];
          const launch = first ? first.launchT : th.launchT;
          th.timeToFirstShotMs = Math.max(0, rec.t - launch);
        }
      }),
      w.on('reject', () => {
        if (this.current) this.current.rejectedTaps++;
      }),
      w.on('burst', (b) => {
        const rec = this.shotRecs.get(b.shot.id);
        if (!rec) return;
        this.shotRecs.delete(b.shot.id);
        rec.arriveT = rel(b.t);
        rec.hit = b.hit;
        rec.perfect = b.broken.some((x) => x.perfect);
        rec.broke = b.broken.map((x) => x.clay.id);
        if (b.nearest) {
          rec.targetClayId = b.nearest.clay.id;
          rec.missVector = { x: r2(b.nearest.offset.x), y: r2(b.nearest.offset.y) };
          rec.missDist = r2(b.nearest.dist);
          rec.classified = b.nearest.miss.reason;
        }
      }),
      w.on('break', ({ clay, t }) => {
        const th = this.current;
        const rec = th?.clays.find((c) => c.id === clay.id);
        if (rec) {
          rec.broken = true;
          rec.brokenT = rel(t);
        }
      }),
    );
  }

  /** The throw that has just ended (last pushed) needs a "Why did you miss?" answer. */
  get lastThrow(): ThrowRecord | null {
    return this.throws[this.throws.length - 1] ?? null;
  }

  needsReason(): boolean {
    const th = this.lastThrow;
    return !!th && th.classified !== null && th.reported === null;
  }

  answer(reason: ReportedReason): void {
    const th = this.lastThrow;
    if (!th || th.classified === null) return;
    th.reported = reason;
    th.explained = reason === th.classified;
  }

  finish(): AttemptRecord {
    for (const off of this.offs) off();
    this.offs.length = 0;
    const clays = this.throws.reduce((n, t) => n + t.clays.length, 0);
    const broken = this.throws.reduce((n, t) => n + t.clays.filter((c) => c.broken).length, 0);
    const cleared = this.throws.filter((t) => t.clays.every((c) => c.broken)).length;
    return {
      attempt: this.attempt,
      startedAt: this.startedAt,
      durationMs: ms(this.world.time - this.t0),
      clays,
      broken,
      throwsCleared: cleared,
      hitRate: clays ? Math.round((broken / clays) * 10000) / 10000 : 0,
      strayShots: this.stray,
      throws: this.throws,
    };
  }
}

export type { MissReason };
