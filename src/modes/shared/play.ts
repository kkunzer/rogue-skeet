import { PointerInput, SimClock } from '../../input/pointer';
import { createScheme } from '../../input';
import type { ControlScheme, SchemeId } from '../../input/scheme';
import { setDebugProvider, type DebugProvider } from '../../debug';
import { tuning } from '../../feel/tuning';
import { FieldView } from '../../render/field';
import { buildGreybox } from '../../render/greybox';
import type { Stage } from '../../render/stage';
import type { FireIntent, World } from '../../sim/world';
import type { Container } from 'pixi.js';

export interface PlaySessionOptions {
  stage: Stage;
  scheme: SchemeId;
  /** Receives every FireIntent the scheme emits. */
  onIntent: (intent: FireIntent) => void;
  debug?: Pick<DebugProvider, 'mode' | 'result' | 'phase'>;
}

/**
 * Shared play plumbing for sandbox and control test: greybox + field view, pointer input with sim
 * timestamps, the active control scheme, and the `window.__debug` provider.
 */
export class PlaySession {
  readonly clock = new SimClock();
  readonly field = new FieldView(tuning);
  scheme: ControlScheme;
  world: World | null = null;
  private readonly greybox: Container = buildGreybox();
  private readonly input: PointerInput;

  constructor(private readonly opts: PlaySessionOptions) {
    const { stage } = opts;
    stage.world.addChild(this.greybox, this.field.root);
    this.scheme = this.makeScheme(opts.scheme);
    this.input = new PointerInput({
      target: stage.app.canvas,
      clock: this.clock,
      toWorld: (x, y) => stage.clientToWorld(x, y),
      onEvent: (e) => this.scheme.onPointer(e),
    });
    setDebugProvider({
      mode: opts.debug?.mode ?? 'play',
      result: opts.debug?.result,
      phase: opts.debug?.phase,
      world: () => this.world,
      scheme: () => this.scheme,
      cfg: () => tuning,
      clock: this.clock,
      canvas: () => stage.app.canvas,
      toClient: (p) => {
        const s = stage.worldToScreen(p);
        const r = stage.app.canvas.getBoundingClientRect();
        return { x: r.left + s.x, y: r.top + s.y };
      },
    });
  }

  private makeScheme(id: SchemeId): ControlScheme {
    return createScheme(id, { cfg: () => tuning, emit: (i) => this.opts.onIntent(i) });
  }

  setScheme(id: SchemeId): void {
    this.scheme.reset();
    this.scheme = this.makeScheme(id);
  }

  setWorld(world: World | null): void {
    this.world = world;
    this.field.setWorld(world);
    this.scheme.reset();
  }

  setInputEnabled(on: boolean): void {
    this.input.setEnabled(on);
    if (!on) this.scheme.reset();
  }

  /** Once per frame: anchor the clock and draw. */
  render(alpha: number, dt: number): void {
    const w = this.world;
    this.clock.mark(w ? w.time + alpha * dt : 0);
    this.field.render(alpha, dt, this.scheme.view(), tuning.ghostTrail && this.scheme.id === 'tap');
  }

  destroy(): void {
    setDebugProvider(null);
    this.input.destroy();
    this.field.destroy();
    this.greybox.destroy({ children: true });
  }
}
