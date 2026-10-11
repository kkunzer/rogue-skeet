import type { HouseId } from '../sim/houses';
import {
  SYNTH_SR,
  synthArmor,
  synthRoundClear,
  synthRunOver,
  synthShellEmpty,
  synthSynergy,
  synthUpgrade,
  synthZap,
  synthChime,
  synthClick,
  synthCrack,
  synthGunBody,
  synthGunTail,
  synthGunTransient,
  synthThunk,
} from './synth';

export const CUE_IDS = [
  'gunTransient',
  'gunBody',
  'gunTail',
  'crack1',
  'crack2',
  'crack3',
  'thunk',
  'chime',
  'click',
  'armor',
  'zap',
  'shellEmpty',
  'upgrade',
  'synergy',
  'roundClear',
  'runOver',
] as const;
export type CueId = (typeof CUE_IDS)[number];

/**
 * Cue -> sample file under `public/audio/` (null = synth only). A file that is missing or fails to
 * decode falls back to the procedural synth for that cue, so any subset of files works.
 */
export const AUDIO_MANIFEST: Record<CueId, string | null> = {
  gunTransient: null,
  gunBody: null,
  gunTail: null,
  crack1: null,
  crack2: null,
  crack3: null,
  thunk: null,
  chime: null,
  click: null,
  armor: null,
  zap: null,
  shellEmpty: null,
  upgrade: null,
  synergy: null,
  roundClear: null,
  runOver: null,
};

/** Procedural fallback for every cue. */
export const SYNTH_CUES: Record<CueId, (sr: number) => Float32Array> = {
  gunTransient: synthGunTransient,
  gunBody: synthGunBody,
  gunTail: synthGunTail,
  crack1: (sr) => synthCrack(0, sr),
  crack2: (sr) => synthCrack(1, sr),
  crack3: (sr) => synthCrack(2, sr),
  thunk: synthThunk,
  chime: synthChime,
  click: synthClick,
  armor: synthArmor,
  zap: synthZap,
  shellEmpty: synthShellEmpty,
  upgrade: synthUpgrade,
  synergy: synthSynergy,
  roundClear: synthRoundClear,
  runOver: synthRunOver,
};

export const CRACK_CUES: readonly CueId[] = ['crack1', 'crack2', 'crack3'];

/** Trap thunk pan and pitch per house: high house sits left and thumps higher, low house right and lower. */
export const HOUSE_AUDIO: Record<HouseId, { pan: number; rate: number }> = {
  high: { pan: -0.7, rate: 1.12 },
  low: { pan: 0.7, rate: 0.86 },
  center: { pan: 0, rate: 1 },
};

/** Random pitch (playback rate) and gain for one play: `1 +/- pitchVar`, `base * (1 +/- gainVar)`. */
export function randomizeCue(
  rand: () => number,
  pitchVar: number,
  gainVar: number,
  baseGain = 1,
): { rate: number; gain: number } {
  return {
    rate: 1 + (rand() * 2 - 1) * pitchVar,
    gain: baseGain * (1 + (rand() * 2 - 1) * gainVar),
  };
}

/** Playback-rate multiplier for the combo ladder: 1st hit = 1, each further hit +step semitones, capped. */
export function comboRate(streak: number, stepSemitones: number, maxSteps: number): number {
  const steps = Math.min(Math.max(0, streak - 1), maxSteps);
  return Math.pow(2, (steps * stepSemitones) / 12);
}

export interface PlayOpts {
  /** Extra playback-rate multiplier (house pitch, combo ladder). */
  rate?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
  gain?: number;
  /** Seconds from now. */
  delay?: number;
  /** Override random variance for this play. */
  pitchVar?: number;
  gainVar?: number;
}

export interface AudioStats {
  /** Cue play requests while sound was enabled (counted even before the context is unlocked). */
  triggered: number;
  /** Requests that actually started a source node. */
  played: number;
  last: CueId | null;
  byCue: Partial<Record<CueId, number>>;
  state: string;
  /** Cues whose real sample loaded (others use the synth). */
  samples: CueId[];
}

export interface AudioManagerOptions {
  createContext?: () => AudioContext;
  rand?: () => number;
  /** Where sample files live; default `${import.meta.env.BASE_URL}audio/`. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
  manifest?: Record<CueId, string | null>;
  pitchVar?: number;
  gainVar?: number;
}

/**
 * Web Audio manager. The context is created and resumed on the first user gesture (iOS needs this),
 * buffers are decoded/generated once, and every play randomizes pitch and gain.
 */
export class AudioManager {
  enabled = true;
  volume = 0.8;
  pitchVar = 0.08;
  gainVar = 0.12;
  readonly stats: AudioStats = {
    triggered: 0,
    played: 0,
    last: null,
    byCue: {},
    state: 'locked',
    samples: [],
  };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<CueId, AudioBuffer>();
  private files = new Map<CueId, Promise<ArrayBuffer | null>>();
  private readonly rand: () => number;
  private readonly createContext: () => AudioContext;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly manifest: Record<CueId, string | null>;
  private unlockOff: (() => void) | null = null;

  constructor(opts: AudioManagerOptions = {}) {
    this.rand = opts.rand ?? Math.random;
    this.createContext =
      opts.createContext ??
      ((): AudioContext => {
        const C =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        return new C();
      });
    this.baseUrl = opts.baseUrl ?? `${import.meta.env?.BASE_URL ?? '/'}audio/`;
    this.fetchFn =
      opts.fetchFn ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.manifest = opts.manifest ?? AUDIO_MANIFEST;
    if (opts.pitchVar !== undefined) this.pitchVar = opts.pitchVar;
    if (opts.gainVar !== undefined) this.gainVar = opts.gainVar;
  }

  /** Start fetching sample files (no AudioContext needed yet). Safe to call once at boot. */
  preload(): void {
    if (!this.fetchFn) return;
    for (const id of CUE_IDS) {
      const file = this.manifest[id];
      if (!file || this.files.has(id)) continue;
      const f = this.fetchFn;
      this.files.set(
        id,
        f(this.baseUrl + file)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .catch(() => null),
      );
    }
  }

  /** Create + resume the context on the first gesture. Removes its own listeners once running. */
  attachUnlock(target: EventTarget = window): void {
    this.unlockOff?.();
    const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const handler = (): void => {
      void this.unlock().then(() => {
        if (this.ctx?.state === 'running') {
          this.unlockOff?.();
          this.unlockOff = null;
        }
      });
    };
    for (const e of events) target.addEventListener(e, handler, { capture: true, passive: true });
    this.unlockOff = (): void => {
      for (const e of events) target.removeEventListener(e, handler, { capture: true });
    };
  }

  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        this.ctx = this.createContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.buildSynthBuffers();
        void this.loadSamples();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      this.stats.state = this.ctx.state;
      // iOS: play one silent buffer inside the gesture to fully unlock output.
      const b = this.ctx.createBuffer(1, 1, SYNTH_SR);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    } catch {
      /* no WebAudio, or blocked: cues keep counting but stay silent */
    }
  }

  private buildSynthBuffers(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const id of CUE_IDS) {
      // generated at a fixed rate; the browser resamples buffers to the context rate on playback
      const data = SYNTH_CUES[id](SYNTH_SR);
      const buf = ctx.createBuffer(1, data.length, SYNTH_SR);
      buf.getChannelData(0).set(data);
      this.buffers.set(id, buf);
    }
  }

  /** Decode downloaded files and swap them in for the synth buffers; failures keep the synth. */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    this.preload();
    for (const id of CUE_IDS) {
      const pending = this.files.get(id);
      if (!pending) continue;
      try {
        const data = await pending;
        if (!data) continue;
        const buf = await ctx.decodeAudioData(data.slice(0));
        this.buffers.set(id, buf);
        this.stats.samples.push(id);
      } catch {
        /* undecodable: synth fallback stays */
      }
    }
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Play one cue. Returns false when sound is off or the context is not unlocked yet. */
  cue(id: CueId, o: PlayOpts = {}): boolean {
    if (!this.enabled) return false;
    this.stats.triggered++;
    this.stats.last = id;
    this.stats.byCue[id] = (this.stats.byCue[id] ?? 0) + 1;
    const ctx = this.ctx;
    const master = this.master;
    const buf = this.buffers.get(id);
    if (!ctx || !master || !buf || ctx.state !== 'running') return false;
    const v = randomizeCue(
      this.rand,
      o.pitchVar ?? this.pitchVar,
      o.gainVar ?? this.gainVar,
      o.gain ?? 1,
    );
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = v.rate * (o.rate ?? 1);
    const g = ctx.createGain();
    g.gain.value = v.gain;
    src.connect(g);
    let tail: AudioNode = g;
    if (o.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.min(1, Math.max(-1, o.pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(master);
    src.start(ctx.currentTime + (o.delay ?? 0));
    this.stats.played++;
    return true;
  }

  /** Gun report: transient, body and tail layers fired together, sharing one pitch roll. */
  gunReport(): void {
    const { rate } = randomizeCue(this.rand, this.pitchVar, 0);
    this.cue('gunTransient', { rate, pitchVar: 0 });
    this.cue('gunBody', { rate, pitchVar: 0 });
    this.cue('gunTail', { rate, pitchVar: 0, gain: 0.8 });
  }

  /** Random one of the three clay-crack variants, pitched by the combo ladder. */
  crack(rate = 1, delay = 0, gain = 1): void {
    const id = CRACK_CUES[Math.floor(this.rand() * CRACK_CUES.length)] ?? 'crack1';
    this.cue(id, { rate, delay, gain });
  }

  /** Trap thunk for a house: panned and pitched per house. */
  thunk(house: HouseId): void {
    const h = HOUSE_AUDIO[house];
    this.cue('thunk', { pan: h.pan, rate: h.rate });
  }

  destroy(): void {
    this.unlockOff?.();
    void this.ctx?.close?.();
    this.ctx = null;
    this.master = null;
  }
}

export const audio = new AudioManager();
