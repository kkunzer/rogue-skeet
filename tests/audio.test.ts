import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  AUDIO_MANIFEST,
  AudioManager,
  CUE_IDS,
  HOUSE_AUDIO,
  SYNTH_CUES,
  comboRate,
  randomizeCue,
} from '../src/feel/audio';

describe('audio helpers', () => {
  it('pitch and gain randomization stay within +/-8% pitch and the gain variance', () => {
    const rng = new Rng('audio');
    let minR = 9,
      maxR = 0,
      minG = 9,
      maxG = 0;
    for (let i = 0; i < 5000; i++) {
      const v = randomizeCue(() => rng.next(), 0.08, 0.12, 1);
      minR = Math.min(minR, v.rate);
      maxR = Math.max(maxR, v.rate);
      minG = Math.min(minG, v.gain);
      maxG = Math.max(maxG, v.gain);
    }
    expect(minR).toBeGreaterThanOrEqual(0.92);
    expect(maxR).toBeLessThanOrEqual(1.08);
    expect(maxR - minR).toBeGreaterThan(0.12); // actually varies
    expect(minG).toBeGreaterThanOrEqual(0.88);
    expect(maxG).toBeLessThanOrEqual(1.12);
    expect(randomizeCue(() => 0.5, 0.08, 0.12, 0.5)).toEqual({ rate: 1, gain: 0.5 });
    expect(randomizeCue(() => 0, 0.08, 0.12)).toEqual({ rate: 0.92, gain: 0.88 });
    expect(randomizeCue(() => 1, 0.08, 0.12)).toEqual({ rate: 1.08, gain: 1.12 });
  });
  it('combo ladder climbs by semitone steps and caps', () => {
    expect(comboRate(0, 2, 8)).toBe(1);
    expect(comboRate(1, 2, 8)).toBe(1);
    expect(comboRate(2, 2, 8)).toBeCloseTo(Math.pow(2, 2 / 12), 9);
    expect(comboRate(5, 2, 8)).toBeGreaterThan(comboRate(4, 2, 8));
    expect(comboRate(50, 2, 8)).toBeCloseTo(Math.pow(2, 16 / 12), 9);
  });
  it('house thunks pan left for the high house and right for the low house, pitched apart', () => {
    expect(HOUSE_AUDIO.high.pan).toBeLessThan(0);
    expect(HOUSE_AUDIO.low.pan).toBeGreaterThan(0);
    expect(HOUSE_AUDIO.high.rate).not.toBe(HOUSE_AUDIO.low.rate);
  });
  it('every cue has a finite, audible, bounded synth fallback', () => {
    expect(CUE_IDS.length).toBeGreaterThanOrEqual(9);
    for (const id of CUE_IDS) {
      expect(id in AUDIO_MANIFEST).toBe(true);
      const data = SYNTH_CUES[id](44100);
      expect(data.length).toBeGreaterThan(100);
      let peak = 0;
      let finite = true;
      for (const v of data) {
        finite &&= Number.isFinite(v);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(0.2);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });
});

/** Minimal AudioContext double that records what is played. */
function fakeContext() {
  const log = {
    sources: [] as { rate: number; start: number; buffer: unknown }[],
    gains: [] as number[],
    pans: [] as number[],
    resumed: 0,
  };
  const node = () => ({ connect: () => undefined });
  const ctx = {
    state: 'suspended',
    sampleRate: 44100,
    currentTime: 1,
    destination: node(),
    resume: async () => {
      log.resumed++;
      ctx.state = 'running';
    },
    createBuffer: (_c: number, len: number) => ({
      length: len,
      getChannelData: () => new Float32Array(len),
    }),
    createGain: () => {
      const g = { ...node(), gain: { value: 1 } };
      log.gains.push(0);
      return g;
    },
    createStereoPanner: () => {
      const p = { ...node(), pan: { value: 0 } };
      log.pans.push(0);
      pans.push(p);
      return p;
    },
    createBufferSource: () => {
      const s = {
        ...node(),
        buffer: null as unknown,
        playbackRate: { value: 1 },
        start(t: number) {
          log.sources.push({ rate: s.playbackRate.value, start: t, buffer: s.buffer });
        },
      };
      return s;
    },
    decodeAudioData: async () => {
      throw new Error('no decode in test');
    },
    close: async () => undefined,
  };
  const pans: { pan: { value: number } }[] = [];
  return { ctx: ctx as unknown as AudioContext, log, pans };
}

describe('AudioManager', () => {
  it('counts cues before unlock but stays silent; plays after the first gesture', async () => {
    const { ctx, log } = fakeContext();
    const a = new AudioManager({ createContext: () => ctx, rand: () => 0.5, fetchFn: undefined });
    expect(a.cue('click')).toBe(false);
    expect(a.stats.triggered).toBe(1);
    expect(a.stats.played).toBe(0);
    await a.unlock();
    expect(log.resumed).toBe(1);
    expect(a.cue('click')).toBe(true);
    expect(a.stats.played).toBe(1);
    expect(a.stats.last).toBe('click');
  });
  it('applies rate, pan and delay, and the +/-8% randomization', async () => {
    const { ctx, log, pans } = fakeContext();
    let r = 1;
    const a = new AudioManager({ createContext: () => ctx, rand: () => r });
    await a.unlock();
    log.sources.length = 0;
    r = 1; // max pitch roll
    a.cue('thunk', { pan: -0.7, rate: 1.12, delay: 0.05 });
    expect(log.sources[0]!.rate).toBeCloseTo(1.08 * 1.12, 9);
    expect(log.sources[0]!.start).toBeCloseTo(1.05, 9);
    expect(pans[0]!.pan.value).toBe(-0.7);
    r = 0;
    a.cue('crack1');
    expect(log.sources[1]!.rate).toBeCloseTo(0.92, 9);
  });
  it('gun report fires three layers; thunk uses the house pan; disabled means no triggers', async () => {
    const { ctx, pans } = fakeContext();
    const a = new AudioManager({ createContext: () => ctx });
    await a.unlock();
    a.gunReport();
    expect(a.stats.byCue.gunTransient).toBe(1);
    expect(a.stats.byCue.gunBody).toBe(1);
    expect(a.stats.byCue.gunTail).toBe(1);
    a.thunk('high');
    a.thunk('low');
    expect(pans.at(-2)!.pan.value).toBeLessThan(0);
    expect(pans.at(-1)!.pan.value).toBeGreaterThan(0);
    a.enabled = false;
    const n = a.stats.triggered;
    a.crack();
    expect(a.stats.triggered).toBe(n);
  });
  it('crack picks among the three variants', async () => {
    const { ctx } = fakeContext();
    const rng = new Rng('crack');
    const a = new AudioManager({ createContext: () => ctx, rand: () => rng.next() });
    await a.unlock();
    for (let i = 0; i < 60; i++) a.crack();
    expect(a.stats.byCue.crack1).toBeGreaterThan(0);
    expect(a.stats.byCue.crack2).toBeGreaterThan(0);
    expect(a.stats.byCue.crack3).toBeGreaterThan(0);
  });
  it('falls back to the synth when a sample file is missing or undecodable', async () => {
    const { ctx } = fakeContext();
    const manifest = { ...AUDIO_MANIFEST, click: 'click.ogg' };
    const a = new AudioManager({
      createContext: () => ctx,
      manifest,
      baseUrl: '/audio/',
      fetchFn: (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch,
    });
    a.preload();
    await a.unlock();
    await new Promise((r) => setTimeout(r, 10));
    expect(a.stats.samples).toEqual([]);
    expect(a.cue('click')).toBe(true);
  });
});
