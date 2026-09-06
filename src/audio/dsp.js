// Small DSP helpers shared by the offline synths. All numbers come from research/audio-*.md.
import { makeRng } from '../rng.js';
export const db = (x) => Math.pow(10, x / 20);

// Piecewise-linear-in-dB envelope sampled into a Float32Array (amplitude), for GainNode.setValueCurveAtTime.
// points: [[t, dB], ...] in seconds from the curve start; -inf before the first point; holds the last value.
export function envCurve(points, duration, rate = 400) {
  const n = Math.max(2, Math.ceil(duration * rate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v;
    if (t < points[0][0]) v = -200;
    else if (t >= points[points.length - 1][0]) v = points[points.length - 1][1];
    else { let k = 0; while (points[k + 1][0] <= t) k++; const [t0, a] = points[k], [t1, b] = points[k + 1]; v = a + (b - a) * (t - t0) / (t1 - t0); }
    out[i] = db(v);
  }
  return out;
}
// Multiply a curve by a function of time.
export function mulCurve(curve, fn, rate = 400) { const out = new Float32Array(curve.length); for (let i = 0; i < curve.length; i++) out[i] = curve[i] * fn(i / rate); return out; }

export function whiteBuffer(ctx, seconds, seed = 1, channels = 1) {
  const rnd = makeRng(seed); const n = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(channels, n, ctx.sampleRate);
  for (let c = 0; c < channels; c++) { const d = buf.getChannelData(c); let s = 0; for (let i = 0; i < n; i++) { d[i] = rnd() * 2 - 1; s += d[i] * d[i]; } const g = 1 / Math.sqrt(s / n); for (let i = 0; i < n; i++) d[i] *= g; }
  return buf;
}
// Pink noise (Paul Kellet's filter), RMS-normalised to 1.
export function pinkBuffer(ctx, seconds, seed = 2, channels = 1) {
  const rnd = makeRng(seed); const n = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(channels, n, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, s = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; d[i] = p * 0.11; s += d[i] * d[i];
    }
    const g = 1 / Math.sqrt(s / n); for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}
// Butterworth-like band/low/high pass made of cascaded biquads. Returns {input, output}.
export function filterChain(ctx, stages) {
  let first = null, prev = null;
  for (const [type, freq, Q = Math.SQRT1_2] of stages) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; if (prev) prev.connect(f); else first = f; prev = f; }
  return { input: first, output: prev };
}
export function bandpass(ctx, lo, hi, order = 4) { const st = []; for (let i = 0; i < order / 2; i++) { st.push(['highpass', lo]); st.push(['lowpass', hi]); } return filterChain(ctx, st); }
export function playBuffer(ctx, buf, dest, at = 0, { gain = 1, loop = false } = {}) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = loop; const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(dest); src.start(at); return { src, gain: g };
}
// Exponentially decaying stereo noise impulse response (T60 seconds), 20 ms fade-in, energy-normalised.
export function reverbIR(ctx, t60 = 2.4, seed = 1) {
  const rnd = makeRng(seed); const n = Math.ceil(t60 * 1.2 * ctx.sampleRate); const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let e = 0; for (let i = 0; i < n; i++) { const t = i / ctx.sampleRate; let v = (rnd() * 2 - 1) * Math.pow(10, -3 * t / t60); if (t < 0.02) v *= t / 0.02; d[i] = v; e += v * v; } const g = 0.6 / Math.sqrt(e); for (let i = 0; i < n; i++) d[i] *= g; }
  return ir;
}
export function normalizeBuffer(buf, peak) { let m = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); } if (m > 0) for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= peak / m; } return buf; }
// A cluster of `voices` detuned sines sharing one envelope curve (the measured partials are 40-100 cent wide combs).
export function cluster(ctx, dest, { f0, tOn, duration, levelDb = 0, decayDbS = 0, attack = 0.04, spread = 25, voices = 4, seed = 0, amRate = 0, amDepth = 0, boostDb = 0, floorDb = -60, scale = 1 }) {
  const rnd = makeRng(seed + 11);
  const g = ctx.createGain(); g.gain.value = 0;
  const pts = []; const rate = 400; const n = Math.ceil(duration * rate); const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate, tr = t - tOn; if (tr < 0) { curve[i] = 0; continue; }
    const a = Math.min(1, 1 - Math.exp(-tr / (attack / 3)));
    let lvl = Math.max(levelDb + decayDbS * tr, levelDb + floorDb);
    if (boostDb) lvl += boostDb * Math.exp(-tr / 0.07);
    let v = db(lvl) * a;
    if (amRate) v *= 1 - amDepth * 0.5 * (1 + Math.sin(2 * Math.PI * amRate * t + seed));
    curve[i] = v * scale / voices;
  }
  g.gain.setValueCurveAtTime(curve, 0, duration);
  const offs = voices > 1 ? Array.from({ length: voices }, (_, k) => -spread + 2 * spread * k / (voices - 1)) : [0];
  for (const c of offs) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * Math.pow(2, (c + (rnd() * 6 - 3)) / 1200);
    const vg = ctx.createGain(); vg.gain.value = 1 + 0.15 * (rnd() * 2 - 1); o.connect(vg); vg.connect(g); o.start(Math.max(0, tOn - 0.01)); o.stop(duration);
  }
  g.connect(dest); return g;
}
// Frequency trajectory with exponential interpolation between [t, Hz] points, as a Float32Array for setValueCurveAtTime.
export function freqCurve(points, duration, rate = 400) {
  const n = Math.max(2, Math.ceil(duration * rate)); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / rate; let f;
    if (t <= points[0][0]) f = points[0][1]; else if (t >= points[points.length - 1][0]) f = points[points.length - 1][1];
    else { let k = 0; while (points[k + 1][0] <= t) k++; const [t0, a] = points[k], [t1, b] = points[k + 1]; f = Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * (t - t0) / (t1 - t0)); }
    out[i] = f; }
  return out;
}
