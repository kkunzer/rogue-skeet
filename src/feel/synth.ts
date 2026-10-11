import { Rng } from '../core/rng';

/**
 * Procedural sample generators: every audio cue has one, so the game works with no sound files.
 * Pure functions returning mono Float32Array at `sr`. Deterministic (seeded).
 */
export const SYNTH_SR = 44100;

const TAU = Math.PI * 2;

/** One-pole low-pass filter coefficient for cutoff `fc`. */
const lpCoef = (fc: number, sr: number): number => 1 - Math.exp((-TAU * fc) / sr);

function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * k;
  }
  return buf;
}

function noise(rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

function lowpass(x: Float32Array, fc: number, sr: number): Float32Array {
  const a = lpCoef(fc, sr);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    s += a * ((x[i] ?? 0) - s);
    y[i] = s;
  }
  return y;
}

function highpass(x: Float32Array, fc: number, sr: number): Float32Array {
  const lp = lowpass(x, fc, sr);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = (x[i] ?? 0) - (lp[i] ?? 0);
  return y;
}

const len = (sec: number, sr: number): number => Math.max(1, Math.floor(sec * sr));

/** Gun report, layer 1: a very short bright click. */
export function synthGunTransient(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('gun-transient');
  const n = len(0.03, sr);
  const x = highpass(noise(rng, n), 1800, sr);
  for (let i = 0; i < n; i++) x[i] = (x[i] ?? 0) * Math.exp(-i / sr / 0.003);
  return normalize(x, 0.85);
}

/** Gun report, layer 2: the boom. Noise burst plus a falling sine thump, soft-clipped. */
export function synthGunBody(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('gun-body');
  const n = len(0.28, sr);
  const x = lowpass(noise(rng, n), 1600, sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 45 + 110 * Math.exp(-t / 0.035);
    phase += (TAU * f) / sr;
    const v = (x[i] ?? 0) * 0.9 * Math.exp(-t / 0.06) + Math.sin(phase) * 0.9 * Math.exp(-t / 0.09);
    x[i] = Math.tanh(v * 1.6);
  }
  return normalize(x, 0.9);
}

/** Gun report, layer 3: low rumble tail with two faint slap-back echoes. */
export function synthGunTail(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('gun-tail');
  const n = len(0.85, sr);
  const x = lowpass(noise(rng, n), 650, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] = (x[i] ?? 0) * (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.2);
  }
  const out = new Float32Array(n);
  const echoes: [number, number][] = [
    [0, 1],
    [0.041, 0.4],
    [0.083, 0.22],
  ];
  for (const [d, g] of echoes) {
    const off = Math.floor(d * sr);
    for (let i = off; i < n; i++) out[i] = (out[i] ?? 0) + (x[i - off] ?? 0) * g;
  }
  return normalize(out, 0.6);
}

/** Clay crack: bright noise snap, a few ringing ticks and a sparse crackle of fragments. */
export function synthCrack(variant: 0 | 1 | 2, sr = SYNTH_SR): Float32Array {
  const rng = new Rng(`crack-${variant}`);
  const n = len(0.16, sr);
  const f0 = [2300, 3100, 3900][variant] ?? 2300;
  const snap = lowpass(highpass(noise(rng, n), 1400, sr), 7000, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] =
      (snap[i] ?? 0) * 1.4 * Math.exp(-t / 0.011) +
      Math.sin(TAU * f0 * t) * 0.4 * Math.exp(-t / 0.02) +
      Math.sin(TAU * f0 * 1.51 * t) * 0.22 * Math.exp(-t / 0.014) +
      Math.sin(TAU * 420 * t) * 0.35 * Math.exp(-t / 0.012);
  }
  // fragments tinkling: tiny decaying bursts at random times
  const bursts = 7 + variant * 2;
  for (let b = 0; b < bursts; b++) {
    const start = Math.floor(rng.range(0.006, 0.12) * sr);
    const amp = rng.range(0.1, 0.35) * (1 - start / n);
    const fr = rng.range(3000, 7500);
    for (let i = 0; i < len(0.012, sr) && start + i < n; i++) {
      const t = i / sr;
      out[start + i] = (out[start + i] ?? 0) + Math.sin(TAU * fr * t) * amp * Math.exp(-t / 0.004);
    }
  }
  return normalize(out, 0.85);
}

/** Trap thunk: a short low "chunk" of the throwing arm. Played pitched and panned per house. */
export function synthThunk(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('thunk');
  const n = len(0.22, sr);
  const low = lowpass(noise(rng, n), 500, sr);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (TAU * (62 + 95 * Math.exp(-t / 0.045))) / sr;
    out[i] =
      Math.sin(phase) * 0.9 * Math.exp(-t / 0.06) +
      (low[i] ?? 0) * 1.1 * Math.exp(-t / 0.018) +
      Math.sin(TAU * 1250 * t) * 0.18 * Math.exp(-t / 0.006);
  }
  return normalize(out, 0.9);
}

/** Perfect-hit chime: three inharmonic-free partials with a fast attack and a ringing decay. */
export function synthChime(sr = SYNTH_SR): Float32Array {
  const n = len(0.7, sr);
  const out = new Float32Array(n);
  const partials: [number, number, number][] = [
    [1318.5, 1, 0.2],
    [1975.5, 0.55, 0.14],
    [2637, 0.3, 0.09],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [f, g, d] of partials) v += Math.sin(TAU * f * t) * g * Math.exp(-t / d);
    out[i] = v * (1 - Math.exp(-t / 0.002));
  }
  return normalize(out, 0.7);
}

/** Dry-fire click for a rejected shot. */
export function synthClick(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('click');
  const n = len(0.07, sr);
  const hp = highpass(noise(rng, n), 2500, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] =
      Math.sin(TAU * 2600 * t) * 0.5 * Math.exp(-t / 0.004) +
      (hp[i] ?? 0) * 0.6 * Math.exp(-t / 0.002) +
      Math.sin(TAU * 900 * t) * 0.5 * Math.exp(-t / 0.012);
  }
  return normalize(out, 0.5);
}

/** Armored clay first hit: a metallic clang (inharmonic partials) over a short click. */
export function synthArmor(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('armor');
  const n = len(0.3, sr);
  const click = highpass(noise(rng, n), 2500, sr);
  const out = new Float32Array(n);
  const partials: [number, number, number][] = [
    [1180, 1, 0.07],
    [1895, 0.7, 0.05],
    [2740, 0.5, 0.04],
    [3980, 0.3, 0.025],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = (click[i] ?? 0) * 0.9 * Math.exp(-t / 0.003);
    for (const [f, g, d] of partials) v += Math.sin(TAU * f * t) * g * Math.exp(-t / d);
    out[i] = v;
  }
  return normalize(out, 0.8);
}

/** Chain shatter arc: a fast rising electric zap with crackle. */
export function synthZap(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('zap');
  const n = len(0.2, sr);
  const out = new Float32Array(n);
  const hp = highpass(noise(rng, n), 3000, sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (TAU * (500 + 3800 * (t / 0.2))) / sr;
    const env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.07);
    out[i] = (Math.sin(phase) * 0.6 + (hp[i] ?? 0) * (0.5 + 0.5 * Math.sin(TAU * 70 * t))) * env;
  }
  return normalize(out, 0.7);
}

/** Out of shells: a hollow dry thud, lower and duller than the click. */
export function synthShellEmpty(sr = SYNTH_SR): Float32Array {
  const rng = new Rng('shell-empty');
  const n = len(0.22, sr);
  const low = lowpass(noise(rng, n), 900, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] =
      Math.sin(TAU * (210 - 90 * Math.min(1, t / 0.12)) * t) * 0.9 * Math.exp(-t / 0.05) +
      (low[i] ?? 0) * 0.5 * Math.exp(-t / 0.02) +
      Math.sin(TAU * 1800 * t) * 0.25 * Math.exp(-t / 0.004);
  }
  return normalize(out, 0.6);
}

function arpeggio(
  sr: number,
  notes: readonly number[],
  step: number,
  decay: number,
  total: number,
  shimmer = 0.25,
): Float32Array {
  const n = len(total, sr);
  const out = new Float32Array(n);
  notes.forEach((f, k) => {
    const start = Math.floor(k * step * sr);
    for (let i = start; i < n; i++) {
      const t = (i - start) / sr;
      const env = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / decay);
      out[i] =
        (out[i] ?? 0) +
        (Math.sin(TAU * f * t) + shimmer * Math.sin(TAU * f * 2.005 * t)) * env * 0.5;
    }
  });
  return normalize(out, 0.7);
}

/** Upgrade picked: bright rising arpeggio. */
export const synthUpgrade = (sr = SYNTH_SR): Float32Array =>
  arpeggio(sr, [523.25, 659.25, 783.99, 1046.5], 0.07, 0.18, 0.7);

/** Round cleared: a warm major arpeggio. */
export const synthRoundClear = (sr = SYNTH_SR): Float32Array =>
  arpeggio(sr, [392, 493.88, 587.33, 783.99], 0.11, 0.25, 1.0, 0.15);

/** Run over: a slow falling minor figure. */
export const synthRunOver = (sr = SYNTH_SR): Float32Array =>
  arpeggio(sr, [392, 311.13, 261.63, 196], 0.18, 0.3, 1.3, 0.1);

/** Synergy banner: a big stacked chord with a low boom underneath. */
export function synthSynergy(sr = SYNTH_SR): Float32Array {
  const n = len(1.1, sr);
  const out = new Float32Array(n);
  const chord = [261.63, 329.63, 392, 523.25, 659.25];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    chord.forEach((f, k) => {
      const on = Math.max(0, t - k * 0.035);
      v += Math.sin(TAU * f * on) * Math.exp(-on / 0.35) * (on > 0 ? 1 : 0);
    });
    phase += (TAU * (55 + 90 * Math.exp(-t / 0.08))) / sr;
    v += Math.sin(phase) * 1.4 * Math.exp(-t / 0.14);
    out[i] = Math.tanh(v * 0.55) * (1 - Math.exp(-t / 0.002));
  }
  return normalize(out, 0.85);
}
