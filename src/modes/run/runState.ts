import { EventBus } from '../../core/events';
import { Rng } from '../../core/rng';
import type { SchemeId } from '../../input/scheme';
import { BUILD_SHA } from '../../telemetry/build';
import type { Clay, ClayTypeId } from '../../sim/clay';
import { ThrowDirector } from '../../sim/director';
import { World, type BurstResult, type FireIntent } from '../../sim/world';
import type { Shot } from '../../sim/shot';
import { offerDraft } from '../../upgrades/draft';
import { upgradeById } from '../../upgrades/defs';
import type { UpgradeTuning } from '../../upgrades/params';
import { applyPhysics, applyScore, buildHooks, makeCtx } from '../../upgrades/runtime';
import { activeSynergies, newSynergies, type SynergyDef } from '../../upgrades/synergies';
import type { SynergyId, UpgradeId } from '../../upgrades/types';
import type { SimConfig } from '../../sim/config';
import type { RunTuning } from '../../feel/tuning';
import { BASE_POINTS, clayPoints, comboMult } from './scoring';
import type { RunSummary } from './runLog';
import { BOSS_INDEX, ROUNDS, buildRoundThrows, type RoundDef } from './stationData';

export type RunPhase = 'intro' | 'playing' | 'roundClear' | 'draft' | 'won' | 'lost';

export interface RunEvents {
  phase: { phase: RunPhase; round: number };
  /** A new World exists (round start): presentation re-attaches here. */
  world: { world: World; round: number };
  shells: { shells: number; delta: number; reason: 'start' | 'shot' | 'escape' };
  /** Fired when a fire attempt finds the pool empty. */
  shellEmpty: undefined;
  score: { points: number; total: number; clay: Clay; combo: number; perfect: boolean };
  streak: { streak: number; combo: number };
  synergy: SynergyDef;
  pick: { id: UpgradeId };
}

export type RunConfig = SimConfig & UpgradeTuning & RunTuning;

export interface RunOptions {
  seed: string;
  scheme: SchemeId;
  /** Live tuning (copied at the start of each round). */
  config: RunConfig;
  rounds?: readonly RoundDef[];
  /** Seconds before the first throw of a round. */
  startDelay?: number;
}

export interface RoundStats {
  shellsStart: number;
  shellsEnd: number;
  shots: number;
  hits: number;
  escapes: number;
  score: number;
}

const emptyBreaks = (): Record<ClayTypeId, number> => ({
  standard: 0,
  splitter: 0,
  splitlet: 0,
  armored: 0,
  rabbit: 0,
});

/**
 * The run state machine, renderer-free so tests and bots drive it exactly like the UI:
 * intro -> playing -> roundClear -> draft -> intro ... -> boss -> won | lost.
 *
 * Shell economy: every shot costs 1 shell and an escaped clay costs 1 more (splitter children
 * too). Reaching 0 shells with clays live or still scheduled loses the run. A round that finishes
 * ends the round whatever the pool; the boss is cleared only if shells remain when the flurry ends.
 */
export class RunController {
  readonly events = new EventBus<RunEvents>();
  readonly seed: string;
  readonly scheme: SchemeId;
  readonly rounds: readonly RoundDef[];
  phase: RunPhase = 'intro';
  /** 0..3 are rounds 1-4, 4 is the boss. */
  round = 0;
  shells = 0;
  score = 0;
  streak = 0;
  owned: UpgradeId[] = [];
  offers: UpgradeId[] = [];
  synergies: SynergyId[] = [];
  breaks = emptyBreaks();
  roundStats: RoundStats[] = [];
  world: World;
  director: ThrowDirector;
  /** Throws that still show the faint trajectory preview (set by picking a physics mod). */
  previewLeft = 0;
  private previewKeys = new Set<string>();
  private comboAtBurst = 1;
  private throwsInRound = 0;
  private offs: (() => void)[] = [];
  private totalShots = 0;
  private totalHits = 0;
  private endedAt: string | null = null;

  constructor(private readonly opts: RunOptions) {
    this.seed = opts.seed;
    this.scheme = opts.scheme;
    this.rounds = opts.rounds ?? ROUNDS;
    // A placeholder world so `world` is never null; replaced by startRound().
    this.world = new World({ ...opts.config });
    this.director = new ThrowDirector(this.world, [], 0);
    this.setPhase('intro');
  }

  get def(): RoundDef {
    return this.rounds[this.round] as RoundDef;
  }

  get isBoss(): boolean {
    return this.round === this.rounds.length - 1;
  }

  get comboNow(): number {
    return comboMult(this.streak);
  }

  get over(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  private setPhase(phase: RunPhase): void {
    this.phase = phase;
    this.events.emit('phase', { phase, round: this.round });
  }

  /** Leave the intro card: build this round's world and start the throws. */
  startRound(): void {
    if (this.phase !== 'intro') return;
    for (const off of this.offs) off();
    this.offs = [];
    const cfgBase = this.opts.config;
    const phys = new Rng(`${this.seed}/phys/${this.round}`);
    const ctx = makeCtx(this.owned, cfgBase, phys);
    const cfg = applyPhysics(
      { ...cfgBase, rabbitSeed: new Rng(`${this.seed}/rabbit/${this.round}`).nextU32() },
      this.owned,
      ctx,
    );
    this.world = new World(cfg);
    this.world.hooks = buildHooks(this.owned, ctx);
    const throws = buildRoundThrows(this.seed, this.round, cfgBase.runGapMul, this.rounds);
    this.throwsInRound = throws.length;
    this.director = new ThrowDirector(this.world, throws, this.opts.startDelay ?? 1.2);
    this.shells = Math.max(1, this.def.shells + Math.round(cfgBase.runShellBonus));
    this.roundStats.push({
      shellsStart: this.shells,
      shellsEnd: this.shells,
      shots: 0,
      hits: 0,
      escapes: 0,
      score: 0,
    });
    this.wire();
    this.events.emit('world', { world: this.world, round: this.round });
    this.events.emit('shells', { shells: this.shells, delta: 0, reason: 'start' });
    this.setPhase('playing');
  }

  private stats(): RoundStats {
    return this.roundStats[this.roundStats.length - 1] as RoundStats;
  }

  private wire(): void {
    const w = this.world;
    const ev = w.events;
    this.offs.push(
      ev.on('shot', ({ shot }) => this.onShot(shot)),
      ev.on('burst', (b) => this.onBurst(b)),
      ev.on('break', ({ clay, perfect, cause }) => {
        this.breaks[clay.type]++;
        const ctx = makeCtx(this.owned, this.opts.config, new Rng('score'));
        const info = applyScore(
          { base: BASE_POINTS, combo: this.comboAtBurst, perfect, mult: 1, cause },
          this.owned,
          ctx,
        );
        const points = clayPoints(info);
        this.score += points;
        this.stats().score += points;
        this.events.emit('score', {
          points,
          total: this.score,
          clay,
          combo: info.combo,
          perfect,
        });
      }),
      ev.on('escape', () => {
        this.stats().escapes++;
        this.setStreak(0);
        this.spendShell('escape');
      }),
      this.director.events.on('throwStart', ({ index }) => {
        if (this.previewLeft > 0) {
          this.previewKeys.add(`${this.round}:${index}`);
          this.previewLeft--;
        }
      }),
      this.director.events.on('throwEnd', ({ index }) => {
        if (index >= this.throwsInRound - 1) this.finishRound();
      }),
    );
  }

  /** True when clay `c` belongs to a throw that shows the trajectory preview. */
  isPreviewed(c: Pick<Clay, 'throwIndex'>): boolean {
    return this.previewKeys.has(`${this.round}:${c.throwIndex}`);
  }

  private onShot(_shot: Shot): void {
    this.totalShots++;
    this.stats().shots++;
    this.spendShell('shot');
  }

  private onBurst(b: BurstResult): void {
    this.comboAtBurst = comboMult(this.streak);
    if (b.hit) {
      this.totalHits++;
      this.stats().hits++;
      this.setStreak(this.streak + 1);
    } else {
      this.setStreak(0);
    }
  }

  private setStreak(n: number): void {
    if (n === this.streak) return;
    this.streak = n;
    this.events.emit('streak', { streak: n, combo: comboMult(n) });
  }

  private spendShell(reason: 'shot' | 'escape'): void {
    if (this.shells <= 0) return;
    this.shells--;
    this.stats().shellsEnd = this.shells;
    this.events.emit('shells', { shells: this.shells, delta: -1, reason });
  }

  /** Fire at `intent.aim`. Returns null when not playing, out of shells or the gun is busy. */
  fire(intent: FireIntent): Shot | null {
    if (this.phase !== 'playing') return null;
    if (this.shells <= 0) {
      this.events.emit('shellEmpty', undefined);
      return null;
    }
    return this.world.fire(intent);
  }

  /** Clays that are live now or still waiting to be launched. */
  get scheduled(): boolean {
    return this.director.index < this.throwsInRound - 1 || this.director.pendingCount > 0;
  }

  /** Fixed-step update. */
  update(dt: number): void {
    if (this.phase !== 'playing') return;
    this.director.update();
    this.world.step(dt);
    if (this.phase !== 'playing') return;
    if (
      this.shells <= 0 &&
      this.world.shots.length === 0 &&
      (this.world.liveClays().length > 0 || this.scheduled)
    ) {
      this.finish(false);
    }
  }

  private finishRound(): void {
    if (this.phase !== 'playing') return;
    if (this.isBoss) {
      this.finish(this.shells > 0);
    } else {
      this.setPhase('roundClear');
    }
  }

  private finish(won: boolean): void {
    this.endedAt = new Date().toISOString();
    this.setPhase(won ? 'won' : 'lost');
  }

  /** Move on from the round-clear card to the draft. */
  openDraft(): void {
    if (this.phase !== 'roundClear') return;
    const rng = new Rng(`${this.seed}/draft/${this.round}`);
    this.offers = offerDraft(rng, this.owned);
    this.setPhase('draft');
  }

  /** Take offer `i`. Starts the next round's intro. Returns the synergies the pick unlocked. */
  pick(i: number): SynergyDef[] {
    if (this.phase !== 'draft') return [];
    const id = this.offers[i];
    if (!id) return [];
    const before = [...this.owned];
    this.owned.push(id);
    const unlocked = newSynergies(before, this.owned);
    for (const s of activeSynergies(this.owned))
      if (!this.synergies.includes(s.id)) this.synergies.push(s.id);
    if (upgradeById(id).physics) this.previewLeft = 3;
    this.offers = [];
    this.events.emit('pick', { id });
    for (const s of unlocked) this.events.emit('synergy', s);
    this.round++;
    this.setPhase('intro');
    return unlocked;
  }

  /** Summary of the run so far (final once `over`). */
  summary(scheme: SchemeId = this.scheme): RunSummary {
    const ended = this.endedAt ?? new Date().toISOString();
    return {
      v: 1,
      id: `${ended}|${this.seed}`,
      seed: this.seed,
      picks: [...this.owned],
      score: this.score,
      roundReached: this.round + 1,
      cleared: this.phase === 'won',
      breaksByType: Object.fromEntries(Object.entries(this.breaks).filter(([, n]) => n > 0)),
      synergies: [...this.synergies],
      freshRating: null,
      scheme,
      buildSha: BUILD_SHA,
      timestamp: ended,
      shellsLeft: this.roundStats.map((r) => r.shellsEnd),
      shots: this.totalShots,
      hits: this.totalHits,
    };
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}

export { BOSS_INDEX };
