import { PointerInput, SimClock } from '../../input/pointer';
import { createScheme } from '../../input';
import type { ControlScheme, SchemeId } from '../../input/scheme';
import { setDebugProvider, type DebugProvider } from '../../debug';
import { audio } from '../../feel/audio';
import { haptics } from '../../feel/haptics';
import { Juice } from '../../feel/juice';
import { feel, onFeelChange } from '../../feel/settings';
import { tuning } from '../../feel/tuning';
import { HitStop } from '../../render/vfx/hitstop';
import { VfxLayer } from '../../render/vfx/particles';
import { Shake } from '../../render/vfx/shake';
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
  readonly vfx = new VfxLayer(() => tuning);
  readonly shake = new Shake();
  readonly hitstop = new HitStop();
  readonly juice: Juice;
  /** Debug: hold the presentation still (sim keeps running) to capture mid-shatter frames. */
  fxPaused = false;
  private lastRenderMs = 0;
  private offFeel: () => void;
  scheme: ControlScheme;
  world: World | null = null;
  private readonly greybox: Container = buildGreybox();
  private readonly input: PointerInput;

  constructor(private readonly opts: PlaySessionOptions) {
    const { stage } = opts;
    stage.world.addChild(this.greybox, this.vfx.root, this.field.root);
    this.juice = new Juice({
      vfx: this.vfx,
      audio,
      haptics,
      shake: this.shake,
      hitstop: this.hitstop,
      cfg: () => tuning,
      settings: () => feel,
    });
    this.offFeel = onFeelChange(() => {
      if (!feel.juice) this.clearFx();
    });
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
      fx: () => ({
        ...this.vfx.stats,
        ...this.juice.stats,
        audio: { ...audio.stats, byCue: { ...audio.stats.byCue } },
        haptics: haptics.stats(),
        hitStopActive: this.hitstop.active,
        hitStops: this.hitstop.count,
        shakeAmp: this.shake.amp,
        paused: this.fxPaused,
        juiceOn: feel.juice,
      }),
      pauseFx: (on) => void (this.fxPaused = on),
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
    this.juice.attach(world);
    this.clearFx();
    this.scheme.reset();
  }

  setInputEnabled(on: boolean): void {
    this.input.setEnabled(on);
    if (!on) this.scheme.reset();
  }

  private clearFx(): void {
    this.vfx.clear();
    this.shake.reset();
    this.hitstop.reset();
    this.opts.stage.setShake(0, 0);
  }

  /**
   * Once per frame: anchor the clock and draw. Hit-stop and pausing only skip the redraw (the
   * screen holds the last frame); the sim and the input clock above keep running, so timing is
   * identical with juice on or off.
   */
  render(alpha: number, dt: number): void {
    const w = this.world;
    this.clock.mark(w ? w.time + alpha * dt : 0);
    const nowMs = performance.now();
    const realMs = this.lastRenderMs ? Math.min(100, Math.max(0, nowMs - this.lastRenderMs)) : 0;
    this.lastRenderMs = nowMs;
    const juiceOn = feel.juice;
    this.field.breakRing = !juiceOn;
    if (this.fxPaused || (juiceOn && this.hitstop.tick(realMs))) return;
    this.field.render(alpha, dt, this.scheme.view(), tuning.ghostTrail && this.scheme.id === 'tap');
    if (juiceOn) {
      this.vfx.update(realMs / 1000);
      const o = this.shake.update(realMs / 1000, tuning.shakeDecay);
      this.opts.stage.setShake(o.x, o.y);
    }
  }

  destroy(): void {
    setDebugProvider(null);
    this.offFeel();
    this.juice.detach();
    this.opts.stage.setShake(0, 0);
    this.input.destroy();
    this.field.destroy();
    this.vfx.destroy();
    this.greybox.destroy({ children: true });
  }
}
