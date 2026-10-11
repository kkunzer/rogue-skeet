import { EventBus } from '../core/events';
import { dist, sub, type Vec2 } from '../core/vec2';
import { CLAY_TYPES, advanceClay, clayPos, clayRadius, clayVel, type Clay } from './clay';
import { classifyMiss, type MissClass } from './classify';
import type { SimConfig } from './config';
import { GROUND_H, GUN_ORIGIN, WORLD_H, WORLD_W, clampAim } from './field';
import { Gun, type FireStatus } from './gun';
import { HOUSES, launchKin } from './houses';
import { flightTime, hitRadius, isPerfect, type Shot } from './shot';
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
  hit: boolean;
  broken: BurstHit[];
  /** For a miss: the nearest live clay at burst time and the miss geometry. */
  nearest: { clay: Clay; dist: number; offset: Vec2; miss: MissClass } | null;
}

export interface WorldEvents {
  launch: { clay: Clay; t: number };
  shot: { shot: Shot };
  reject: { t: number; reason: Exclude<FireStatus, 'ok'> };
  burst: BurstResult;
  /** Fired once per clay broken by a burst (after `burst` data is computed). */
  break: { clay: Clay; shot: Shot; dist: number; perfect: boolean; t: number };
  escape: { clay: Clay; t: number };
}

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
  /** Running totals for HUDs. */
  stats = { hits: 0, perfect: 0, shots: 0, escapes: 0, launched: 0 };

  constructor(readonly cfg: SimConfig) {
    this.gun = new Gun(cfg);
  }

  launch(spec: ClaySpec, throwIndex: number): Clay {
    const house = HOUSES[spec.house];
    const k = launchKin(house, spec.speed, spec.angleDeg);
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
    const shot: Shot = {
      id: this.nextShotId++,
      barrel,
      origin: GUN_ORIGIN,
      aim,
      fireTime: t,
      arriveTime: t + flightTime(this.cfg, GUN_ORIGIN, aim),
      resolved: false,
    };
    this.shots.push(shot);
    this.stats.shots++;
    this.events.emit('shot', { shot });
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
      const fell = c.vy < 0 && c.y < GROUND_H + r * 0.5;
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
    const broken: BurstHit[] = [];
    let nearest: BurstResult['nearest'] = null;
    for (const c of this.clays) {
      if (c.status !== 'live') continue;
      const k = advanceClay(c, dtp, this.cfg);
      const d = dist(shot.aim, k);
      if (d < hitRadius(this.cfg, c.type)) {
        broken.push({ clay: c, dist: d, perfect: isPerfect(this.cfg, c.type, d) });
      } else if (!nearest || d < nearest.dist) {
        const offset = sub(shot.aim, k);
        nearest = { clay: c, dist: d, offset, miss: classifyMiss(offset, clayVel(k)) };
      }
    }
    const hit = broken.length > 0;
    // A shot that hit something is not a "miss", so no miss geometry.
    const result: BurstResult = { shot, t, hit, broken, nearest: hit ? null : nearest };
    this.events.emit('burst', result);
    for (const b of broken) {
      b.clay.status = 'broken';
      // Freeze the clay at its break position for listeners.
      const k = advanceClay(b.clay, dtp, this.cfg);
      b.clay.x = k.x;
      b.clay.y = k.y;
      b.clay.vx = k.vx;
      b.clay.vy = k.vy;
      this.stats.hits++;
      if (b.perfect) this.stats.perfect++;
      this.events.emit('break', { clay: b.clay, shot, dist: b.dist, perfect: b.perfect, t });
    }
  }
}

export { clayPos };
