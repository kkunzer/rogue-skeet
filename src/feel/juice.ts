import { Rng } from '../core/rng';
import { CLAY_TYPES } from '../sim/clay';
import type { SimConfig } from '../sim/config';
import { hitRadius } from '../sim/shot';
import type { World } from '../sim/world';
import type { HitStop } from '../render/vfx/hitstop';
import type { VfxSink } from '../render/vfx/particles';
import type { Shake } from '../render/vfx/shake';
import { hitQuality, planShatter, type ShatterInput } from '../render/vfx/shatter';
import { comboRate, type AudioManager } from './audio';
import type { Haptics } from './haptics';
import type { FeelSettings } from './settings';
import type { JuiceTuning } from './tuning';

export type AudioSink = Pick<AudioManager, 'cue' | 'gunReport' | 'crack' | 'thunk'>;
export type HapticsSink = Pick<Haptics, 'play'>;

export interface JuiceDeps {
  vfx: VfxSink;
  audio: AudioSink;
  haptics: HapticsSink;
  shake: Pick<Shake, 'kick'>;
  hitstop: Pick<HitStop, 'request'>;
  /** Live tuning (sim + juice). */
  cfg: () => SimConfig & JuiceTuning;
  settings: () => FeelSettings;
  /** Looks-only randomness (never the sim RNG). */
  rng?: Rng;
}

/** Counters for tests and the debug API. */
export interface JuiceStats {
  shatters: number;
  perfects: number;
  missPuffs: number;
  hitStops: number;
  shakes: number;
  streak: number;
}

/**
 * Presentation director: listens to `World.events` and turns them into VFX, audio, haptics, shake
 * and hit-stop. It only ever reads sim state, so the sim stays deterministic and identical with
 * juice on or off. Phase 3 mechanics need no changes here: anything that emits `break` gets the
 * full treatment (chain shatter, explosions), and `shatterAt` / `explosion` are public for effects
 * that are not clay breaks.
 */
export class Juice {
  readonly stats: JuiceStats = {
    shatters: 0,
    perfects: 0,
    missPuffs: 0,
    hitStops: 0,
    shakes: 0,
    streak: 0,
  };
  private offs: (() => void)[] = [];
  private rng: Rng;
  private burstIdx = 0;
  private world: World | null = null;

  constructor(private readonly d: JuiceDeps) {
    this.rng = d.rng ?? new Rng(Date.now());
  }

  /** Consecutive-hit streak used for the pitch ladder (resets on a missed burst or an escape). */
  get streak(): number {
    return this.stats.streak;
  }

  attach(world: World | null): void {
    this.detach();
    this.world = world;
    this.stats.streak = 0;
    if (!world) return;
    const ev = world.events;
    this.offs.push(
      ev.on('launch', ({ clay }) => {
        if (this.on()) this.d.audio.thunk(clay.house);
      }),
      ev.on('shot', () => {
        if (!this.on()) return;
        this.d.audio.gunReport();
        this.d.haptics.play('shot');
      }),
      ev.on('reject', () => {
        if (this.on()) this.d.audio.cue('click');
      }),
      ev.on('burst', (b) => {
        this.burstIdx = 0;
        if (b.hit) {
          this.stats.streak++;
          if (this.on()) this.d.haptics.play(b.broken.some((x) => x.perfect) ? 'perfect' : 'hit');
        } else {
          this.stats.streak = 0;
          if (this.on() && this.d.cfg().missPuff) {
            this.stats.missPuffs++;
            this.d.vfx.puff(b.shot.aim.x, b.shot.aim.y, this.d.cfg().patternRadius * 0.7);
          }
        }
      }),
      ev.on('break', (e) => {
        if (!this.on()) return;
        const cfg = this.d.cfg();
        const def = CLAY_TYPES[e.clay.type];
        const o = e.shot.origin;
        const dx = e.shot.aim.x - o.x;
        const dy = e.shot.aim.y - o.y;
        const len = Math.hypot(dx, dy) || 1;
        const radius = cfg.clayRadius * def.radiusScale;
        this.shatterAt(
          {
            x: e.clay.x,
            y: e.clay.y,
            vx: e.clay.vx,
            vy: e.clay.vy,
            radius,
            color: def.fill,
            shotDir: { x: dx / len, y: dy / len },
            quality: hitQuality(e.dist, hitRadius(cfg, e.clay.type), e.perfect),
            perfect: e.perfect,
          },
          true,
        );
      }),
      ev.on('escape', () => {
        this.stats.streak = 0;
      }),
    );
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.world = null;
  }

  /**
   * Full break treatment for one clay-like thing: shards, dust, flash, shake, hit-stop, crack sound
   * (pitched by the combo ladder), chime if perfect. Call directly for non-clay effects.
   */
  shatterAt(inp: ShatterInput, withAudio = true): void {
    const cfg = this.d.cfg();
    const plan = planShatter(inp, cfg, this.rng);
    this.d.vfx.shatter(plan);
    this.stats.shatters++;
    if (inp.perfect) this.stats.perfects++;
    if (plan.shake > 0) {
      this.d.shake.kick(plan.shake);
      this.stats.shakes++;
    }
    if (plan.hitStopMs > 0) {
      this.d.hitstop.request(plan.hitStopMs);
      this.stats.hitStops++;
    }
    if (!withAudio) return;
    const rate = comboRate(this.stats.streak, cfg.comboStepSemitones, cfg.comboMaxSteps);
    const delay = this.burstIdx++ * 0.035;
    this.d.audio.crack(rate, delay, inp.perfect ? 1 : 0.7 + 0.3 * plan.quality);
    if (inp.perfect) this.d.audio.cue('chime', { rate, delay: delay + 0.02 });
  }

  /** Radial blast (explosive fragments, bombs): big ring, dust, shake and a low boom. No clay needed. */
  explosion(x: number, y: number, radius: number): void {
    if (!this.on()) return;
    const cfg = this.d.cfg();
    this.d.vfx.ring({
      x,
      y,
      r0: radius * 0.2,
      r1: radius,
      lifeMs: cfg.flashLifeMs * 1.6,
      color: 0xffb454,
    });
    this.d.vfx.puff(x, y, radius * 0.6, 0xe8dcc0);
    this.d.shake.kick(cfg.shakeAmpPerfect);
    this.d.hitstop.request(cfg.hitStopMaxMs);
    this.d.audio.cue('gunBody', { rate: 0.6, gain: 1 });
  }

  private on(): boolean {
    return this.d.settings().juice && this.world !== null;
  }
}
