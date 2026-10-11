import { EventBus } from '../../core/events';
import type { SimConfig } from '../../sim/config';
import { ThrowDirector } from '../../sim/director';
import { buildTestSet, type ThrowSpec } from '../../sim/throws';
import { World, type FireIntent } from '../../sim/world';
import { AttemptRecorder } from '../../telemetry/recorder';
import type { AttemptRecord, ReportedReason } from '../../telemetry/schema';

export type AttemptState = 'running' | 'asking' | 'done';

export interface AttemptEvents {
  throwStart: { index: number; total: number };
  asking: { index: number };
  done: undefined;
}

/**
 * One pass through the fixed throw set: world + director + recorder, plus the pause-and-ask flow
 * after a throw with a miss. Renderer-free, so bots and the UI drive it the same way.
 */
export class AttemptRunner {
  readonly world: World;
  readonly director: ThrowDirector;
  readonly recorder: AttemptRecorder;
  readonly events = new EventBus<AttemptEvents>();
  readonly total: number;
  state: AttemptState = 'running';

  constructor(
    cfg: SimConfig,
    readonly attemptNo: number,
    throws: ThrowSpec[] = buildTestSet(),
  ) {
    this.total = throws.length;
    this.world = new World(cfg);
    this.director = new ThrowDirector(this.world, throws, 1.2);
    this.recorder = new AttemptRecorder(this.world, this.director, attemptNo);
    this.director.events.on('throwStart', ({ index }) =>
      this.events.emit('throwStart', { index, total: this.total }),
    );
    this.director.events.on('throwEnd', ({ index }) => {
      if (this.recorder.needsReason()) {
        this.director.hold();
        this.state = 'asking';
        this.events.emit('asking', { index });
      }
    });
    this.director.events.on('done', () => {
      this.state = 'done';
      this.events.emit('done', undefined);
    });
  }

  /** Throw number being flown (1-based), 0 before the first. */
  get throwNumber(): number {
    return this.director.index + 1;
  }

  update(dt: number): void {
    if (this.state === 'done') return;
    this.director.update();
    this.world.step(dt);
  }

  fire(intent: FireIntent): boolean {
    if (this.state !== 'running') return false;
    return this.world.fire(intent) !== null;
  }

  /** Answer "Why did you miss?" and resume. */
  answer(reason: ReportedReason): void {
    if (this.state !== 'asking') return;
    this.recorder.answer(reason);
    this.state = 'running';
    this.director.release(0.8);
  }

  /** What the classifier says about the throw currently being asked about. */
  get classifiedReason(): ReportedReason | null {
    return this.recorder.lastThrow?.classified ?? null;
  }

  record(): AttemptRecord {
    return this.recorder.finish();
  }
}
