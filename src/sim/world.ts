import { EventBus } from '../core/events';
import { dist, sub, type Vec2 } from '../core/vec2';
import {
  CLAY_TYPES,
  advanceClay,
  clayPos,
  clayRadius,
  clayVel,
  launchState,
  type Clay,
  type SplitDef,
} from './clay';
import { classifyMiss, type MissClass } from './classify';
import type { SimConfig } from './config';
import { GROUND_H, GUN_ORIGIN, WORLD_H, WORLD_W, clampAim } from './field';
import { Gun, type FireStatus } from './gun';
import {
  MAX_CASCADE_DEPTH,
  type BreakCause,
  type HitInfo,
  type Pattern,
  type SimHooks,
} from './hooks';
import { HOUSES } from './houses';
import { effectivePatternRadius, flightTime, hitRadius, isPerfect, type Shot } from './shot';
import type { ClaySpec } from './throws';

export interface FireIntent {
  /** Aim point in world units. */
  aim: Vec2;
  /** Sim time (seconds) at which the player fired, derived from the pointer event timestamp. */
  t: number;
}

export interface BurstHit {
  clay: Clay;
  dist: number;
  perfect: boolean;
}

export interface BurstResult {
  shot: Shot;
  /** Sim time of the burst. */
  t: number;
  /** True when the pattern touched any clay (including armored clays that only cracked). */
  hit: boolean;
  /** Every clay inside the pattern (broken or cracked), nearest first. */
  broken: BurstHit[];
  /** The subset of `broken` that survived with a crack (armored, first hit). */
  cracked: Clay[];
  /** For a miss: the nearest live clay at burst time and the miss geometry. */
  nearest: { clay: Clay; dist: number; offset: Vec2; miss: MissClass } | null;
}

export interface WorldEvents {
  launch: { clay: Clay; t: number };
  shot: { shot: Shot };
  reject: { t: number; reason: Exclude<FireStatus, 'ok'> };
  burst: BurstResult;
  /** Fired once per clay broken by a burst (after `burst` data is computed). */
  break: {
    clay: Clay;
    shot: Shot;
    dist: number;
    perfect: boolean;
    t: number;
    cause: BreakCause;
  };
  /** An armored clay took its first hit: it cracks and is deflected. */
  crack: { clay: Clay; shot: Shot; t: number; cause: BreakCause };
  /** Explosive fragments went off at (x, y). */
  explosion: { x: number; y: number; radius: number; t: number };
  /** Chain shatter arced from one point to a clay (`link` counts from 1). */
  chain: { from: Vec2; to: Vec2; link: number; t: number };
  /** A splitter broke and left these children (already in `world.clays`). */
  split: { parent: Clay; children: Clay[]; t: number };
  escape: { clay: Clay; t: number };
}

/** Speed added to a clay (away from the burst) when its armor cracks, world units / s. */
export const CRACK_DEFLECT = 26;

interface BurstCtx {
  /** Time from the world clock (start of the step) to the shot's arrival. */
  dtp: number;
  /** Arrival time. */
  t: number;
  /** World clock at the start of the step. */
  t0: number;
  spawns: { parent: Clay; def: SplitDef; pos: Vec2; vel: Vec2 }[];
  /** Clays that already took damage from this burst (a clay is damaged at most once per burst). */
  damaged: Set<number>;
  /** While the pattern's own hits are applied, break hooks wait here until all of them are in. */
  deferred: BreakInfoLike[] | null;
}

type BreakInfoLike = Parameters<NonNullable<SimHooks['onClayBroken']>>[0];

/**
 * Deterministic, renderer-free simulation. Drive it with `step(dt)`; feed player input with `fire`
 * and clay launches with `launch`. Everything observable is emitted on `events`.
 */
export class World {
  time = 0;
  clays: Clay[] = [];
  /** Shots in flight (not yet burst). */
  shots: Shot[] = [];
  readonly gun: Gun;
  readonly events = new EventBus<WorldEvents>();
  private nextClayId = 1;
  private nextShotId = 1;
  private lastFireT = -Infinity;
  private burst: BurstCtx | null = null;
  /** Upgrade hooks (empty for the sandbox and the control test). */
  hooks: SimHooks = {};
  /** Running totals for HUDs. */
  stats = { hits: 0, perfect: 0, shots: 0, escapes: 0, launched: 0 };

  constructor(readonly cfg: SimConfig) {
    this.gun = new Gun(cfg);
  }

  launch(spec: ClaySpec, throwIndex: number): Clay {
    const house = HOUSES[spec.house];
    const k = launchState(house, spec, this.cfg);
    const def = CLAY_TYPES[spec.type];
    const clay: Clay = {
      ...k,
      id: this.nextClayId++,
      type: spec.type,
      house: spec.house,
      throwIndex,
      launchTime: this.time,
      age: 0,
      status: 'live',
      hitsLeft: def.hitsToBreak,
      cracked: false,
    };
    this.clays.push(clay);
    this.stats.launched++;
    this.events.emit('launch', { clay, t: this.time });
    return clay;
  }

  liveClays(): Clay[] {
    return this.clays.filter((c) => c.status === 'live');
  }

  /** Try to fire. Returns the shot, or null when the gun cannot fire (reload / cycle). */
  fire(intent: FireIntent): Shot | null {
    const t = Math.max(intent.t, this.lastFireT);
    const status = this.gun.status(t);
    if (status !== 'ok') {
      this.events.emit('reject', { t, reason: status });
      return null;
    }
    const barrel = this.gun.fire(t);
    if (barrel === null) return null;
    this.lastFireT = t;
    const aim = clampAim(intent.aim);
    const base: Pattern = { radius: effectivePatternRadius(this.cfg), damage: 1 };
    const pattern = this.hooks.modifyPattern ? this.hooks.modifyPattern(base) : base;
    const shot: Shot = {
      id: this.nextShotId++,
      barrel,
      origin: GUN_ORIGIN,
      aim,
      fireTime: t,
      arriveTime: t + flightTime(this.cfg, GUN_ORIGIN, aim),
      resolved: false,
      radius: pattern.radius,
      damage: pattern.damage,
    };
    this.shots.push(shot);
    this.stats.shots++;
    this.events.emit('shot', { shot });
    this.hooks.onShotFired?.(shot, this);
    return shot;
  }

  step(dt: number): void {
    const t0 = this.time;
    const t1 = t0 + dt;
    this.gun.update(t0);

    // Resolve bursts that land inside this step, at their exact arrival time.
    const due = this.shots
      .filter((s) => s.arriveTime <= t1)
      .sort((a, b) => a.arriveTime - b.arriveTime || a.id - b.id);
    for (const shot of due) this.resolve(shot, t0);
    if (due.length) this.shots = this.shots.filter((s) => !s.resolved);

    // Advance clays.
    for (const c of this.clays) {
      if (c.status !== 'live') continue;
      const k = advanceClay(c, dt, this.cfg);
      c.x = k.x;
      c.y = k.y;
      c.vx = k.vx;
      c.vy = k.vy;
      c.age += dt;
      const r = clayRadius(c.type, this.cfg);
      const fell = !CLAY_TYPES[c.type].grounded && c.vy < 0 && c.y < GROUND_H + r * 0.5;
      const out = c.x < -8 || c.x > WORLD_W + 8 || c.y > WORLD_H + 20;
      // Clays that fly into a house are gone (they pass behind it in the greybox).
      const inHouse =
        c.age > 0.25 &&
        Object.values(HOUSES).some((h) => c.x > h.x && c.x < h.x + h.w && c.y < h.y + h.h);
      if (fell || out || inHouse) {
        c.status = 'escaped';
        this.stats.escapes++;
        this.events.emit('escape', { clay: c, t: t1 });
      }
    }
    this.clays = this.clays.filter((c) => c.status === 'live');
    this.time = t1;
  }

  /** Burst `shot` using clay positions at its arrival time (clays are currently at time t0). */
  private resolve(shot: Shot, t0: number): void {
    shot.resolved = true;
    const dtp = Math.max(0, shot.arriveTime - t0);
    const t = Math.max(t0, shot.arriveTime);
    const ctx: BurstCtx = { dtp, t, t0, spawns: [], damaged: new Set(), deferred: [] };
    this.burst = ctx;
    const hits: HitInfo[] = [];
    let nearest: BurstResult['nearest'] = null;
    for (const c of this.clays) {
      if (c.status !== 'live') continue;
      const k = advanceClay(c, dtp, this.cfg);
      const d = dist(shot.aim, k);
      if (d < hitRadius(this.cfg, c.type, shot.radius)) {
        hits.push({
          clay: c,
          shot,
          dist: d,
          perfect: isPerfect(this.cfg, c.type, d, shot.radius),
          damage: shot.damage,
        });
      } else if (!nearest || d < nearest.dist) {
        const offset = sub(shot.aim, k);
        nearest = { clay: c, dist: d, offset, miss: classifyMiss(offset, clayVel(k)) };
      }
    }
    hits.sort((a, b) => a.dist - b.dist || a.clay.id - b.clay.id);
    for (const h of hits) this.hooks.onClayHit?.(h, this);
    const hit = hits.length > 0;
    // A shot that hit something is not a "miss", so no miss geometry.
    const result: BurstResult = {
      shot,
      t,
      hit,
      broken: hits,
      cracked: hits.filter((h) => h.damage < h.clay.hitsLeft).map((h) => h.clay),
      nearest: hit ? null : nearest,
    };
    this.events.emit('burst', result);
    const cause: BreakCause = { kind: 'shot', depth: 0, link: 0, from: shot.aim };
    // Phase 1: the pattern's own damage lands on every clay it covers. Phase 2: break hooks
    // (explosions, chains) run, so they only ever see the clays the pattern left alive.
    for (const h of hits) this.damageClay(h.clay, shot, h.damage, h.dist, h.perfect, cause);
    const deferred = ctx.deferred ?? [];
    ctx.deferred = null;
    for (const info of deferred) this.runBreakHook(info);
    this.flushSpawns(ctx);
    this.burst = null;
  }

  // ---- hook API (valid while a burst is being resolved) ---------------------------------------

  /** Live clays with their positions at the instant of the burst being resolved, in id order. */
  liveAtBurst(): { clay: Clay; pos: Vec2 }[] {
    const dtp = this.burst?.dtp ?? 0;
    const out: { clay: Clay; pos: Vec2 }[] = [];
    for (const c of this.clays) {
      if (c.status !== 'live') continue;
      const k = advanceClay(c, dtp, this.cfg);
      out.push({ clay: c, pos: { x: k.x, y: k.y } });
    }
    return out;
  }

  /**
   * Deal `damage` hits to a live clay: it breaks when its armor is used up, otherwise it cracks and
   * is deflected. Each clay breaks at most once, so cascades always terminate.
   */
  damageClay(
    c: Clay,
    shot: Shot,
    damage: number,
    dist: number,
    perfect: boolean,
    cause: BreakCause,
  ): 'broken' | 'cracked' | 'ignored' {
    if (c.status !== 'live' || !this.burst || this.burst.damaged.has(c.id)) return 'ignored';
    this.burst.damaged.add(c.id);
    if (damage >= c.hitsLeft) {
      this.breakClay(c, shot, dist, perfect, cause);
      return 'broken';
    }
    this.crackClay(c, shot, damage, cause);
    return 'cracked';
  }

  /** Presentation events for upgrade effects. */
  emitExplosion(x: number, y: number, radius: number): void {
    this.events.emit('explosion', { x, y, radius, t: this.burst?.t ?? this.time });
  }

  emitChain(from: Vec2, to: Vec2, link: number): void {
    this.events.emit('chain', { from, to, link, t: this.burst?.t ?? this.time });
  }

  private breakClay(c: Clay, shot: Shot, d: number, perfect: boolean, cause: BreakCause): void {
    const ctx = this.burst;
    if (!ctx) return;
    c.status = 'broken';
    // Freeze the clay at its break position for listeners.
    const k = advanceClay(c, ctx.dtp, this.cfg);
    c.x = k.x;
    c.y = k.y;
    c.vx = k.vx;
    c.vy = k.vy;
    this.stats.hits++;
    if (perfect) this.stats.perfect++;
    this.events.emit('break', { clay: c, shot, dist: d, perfect, t: ctx.t, cause });
    const split = CLAY_TYPES[c.type].splits;
    if (split)
      ctx.spawns.push({
        parent: c,
        def: split,
        pos: { x: k.x, y: k.y },
        vel: { x: k.vx, y: k.vy },
      });
    const info = { clay: c, shot, cause, pos: { x: c.x, y: c.y }, dist: d, perfect };
    if (ctx.deferred) ctx.deferred.push(info);
    else this.runBreakHook(info);
  }

  private runBreakHook(info: BreakInfoLike): void {
    if (info.cause.depth <= MAX_CASCADE_DEPTH) this.hooks.onClayBroken?.(info, this);
  }

  private crackClay(c: Clay, shot: Shot, damage: number, cause: BreakCause): void {
    const ctx = this.burst;
    if (!ctx) return;
    c.hitsLeft -= damage;
    c.cracked = true;
    // Deflect away from the burst. The kick is applied to the clay's current state (the start of
    // this step), which is within one sim step of the arrival time.
    const k = advanceClay(c, ctx.dtp, this.cfg);
    const from = cause.from ?? shot.aim;
    let dx = k.x - from.x;
    let dy = k.y - from.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = 0;
      dy = 1;
      len = 1;
    }
    c.vx += (dx / len) * CRACK_DEFLECT;
    c.vy += (dy / len) * CRACK_DEFLECT;
    this.events.emit('crack', { clay: c, shot, t: ctx.t, cause });
  }

  /** Spawn splitter children once the whole burst (including cascades) is resolved. */
  private flushSpawns(ctx: BurstCtx): void {
    for (const sp of ctx.spawns) {
      const { parent, def, pos, vel } = sp;
      const len = Math.hypot(vel.x, vel.y) || 1;
      const nx = -vel.y / len;
      const ny = vel.x / len;
      const children: Clay[] = [];
      for (let i = 0; i < def.count; i++) {
        const s = def.count === 1 ? 0 : (i / (def.count - 1)) * 2 - 1;
        const born = {
          type: def.type,
          x: pos.x,
          y: pos.y,
          vx: vel.x * def.keep + nx * def.spread * s,
          vy: vel.y * def.keep + ny * def.spread * s,
          launchTime: ctx.t,
          age: 0,
        };
        // Children are born at the arrival time but live on the world clock, which is `dtp` earlier.
        const k = advanceClay(born, -ctx.dtp, this.cfg);
        const child: Clay = {
          ...k,
          id: this.nextClayId++,
          type: def.type,
          house: parent.house,
          throwIndex: parent.throwIndex,
          launchTime: ctx.t0,
          age: 0,
          status: 'live',
          hitsLeft: CLAY_TYPES[def.type].hitsToBreak,
          cracked: false,
        };
        this.clays.push(child);
        children.push(child);
      }
      this.events.emit('split', { parent, children, t: ctx.t });
    }
  }
}

export { clayPos };
