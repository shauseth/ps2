// The PS2 startup sound, re-synthesised from measurements (research/audio-startup.md, sections 3 and 6).
// Five layers sequenced by the boot state machine: HUM (T0), CHORD + LOW + SPARKLE (T0+0.65), WHOOSH
// (peak at T0+3.22 with no disc), and HIT 2 (the "PlayStation 2" logo ping). Every event is rendered offline
// once into a stereo buffer; playback just schedules the buffers.
import { db, envCurve, mulCurve, whiteBuffer, pinkBuffer, filterChain, bandpass, playBuffer, reverbIR, normalizeBuffer, cluster, freqCurve } from './dsp.js';

const SR = 48000;
const PEAK = db(-14);                       // chord 50 ms RMS peak = -14 dBFS
const HUM = [[260.7, 0], [390.0, -4], [326.5, -5], [220.0, -7], [183.0, -9], [147.8, -12], [274.0, -12], [99.1, -13], [122.5, -13], [200.5, -12], [169.5, -13], [231.7, -14], [455.6, -14], [519.0, -13], [487.5, -17], [77.5, -15],
  [640.1, -25], [712.6, -24], [783.0, -30], [1047.4, -30], [1185.8, -30], [1208.5, -30], [1483.2, -28], [1685.3, -17], [1738.8, -22], [1830.3, -22], [2222.9, -25], [2386.2, -22], [2503.4, -13], [2454.3, -18]];
const HUM_LEVEL = -21;
const CHORD = [[145.0, -13, -2.0], [181.6, -10, -3.0], [202.1, -14, -2.0], [225.6, -12, -2.0], [240.2, -13, -3.0], [259.3, -11, -2.0], [271.0, -12, -2.0], [326.7, -16, -2.0], [339.8, -16, -2.0], [480.5, -9, -2.5], [508.3, -8, -2.0],
  [302.3, -4.4, -2.0], [358.9, -4.0, -1.8], [401.5, -6.0, -2.5], [455.6, -2.6, -2.0], [532.0, -2.8, -3.0], [606.4, 0.0, -3.5], [679.7, -5.7, -4.5], [716.0, 1.1, -5.5], [805.7, -6.1, -5.5],
  [901.0, -8.0, -5.0], [928.7, -7.5, -5.0], [956.5, -7.5, -5.0], [1031.2, -6.0, -5.0], [1062.0, -4.0, -4.5], [1120.6, -7.0, -5.0], [1173.0, -3.5, -5.0], [1255.0, -3.5, -5.0], [1412.0, -2.5, -4.5], [1501.5, -9.0, -4.5], [1656.0, -2.3, -4.5], [1821.0, -6.0, -3.0], [1924.0, -3.3, -5.0], [2026.0, -19.0, -4.5], [2113.5, -14.0, -5.0], [2240.0, -19.0, -5.0], [2398.0, -17.0, -5.0], [2589.0, -24.0, -5.5], [2681.0, -16.0, -5.5], [2847.0, -18.0, -7.0], [3116.0, -15.0, -7.5], [3590.0, -28.0, -8.0]];
const RUSH = [[3850, 3230, 0.65], [3790, 3210, 0.48], [3560, 3330, 0.35], [3570, 3000, 0.67], [2906, 2640, 0.45], [3164, 2906, 0.30]];
const STREAKS = [[0.02, 9600, 7300, 1.0], [0.30, 8700, 6700, 1.0], [0.65, 9400, 7500, 0.9], [1.10, 8400, 6100, 1.0]];
const SWEEP_F = [[1.9, 3200], [2.7, 3600], [3.3, 4200], [4.05, 5600], [4.2, 4700], [4.4, 4300], [4.7, 4000], [5.3, 3700], [5.6, 3350], [5.9, 3100], [6.1, 2850], [6.5, 1550]];
const SWEEP_L = [[1.8, -70], [2.0, -50], [3.3, -49], [3.9, -43], [4.05, -37], [4.3, -34], [4.8, -41], [5.3, -44], [5.6, -47], [6.0, -49], [6.5, -55], [7.0, -70]];
const WHOOSH_ENV = [[-0.45, -40], [-0.30, -20], [-0.10, -6], [0.0, 0], [0.32, -3], [0.85, -6], [1.10, -10], [1.60, -20], [1.85, -30], [2.10, -40], [2.30, -70]];
const WHOOSH_BANDS = [[[40, 1200], 0.00, 0.00, 0.0], [[1200, 4000], 0.07, -0.10, 4.0], [[4000, 20000], 0.12, -0.25, 0.0]];
const HIT2 = [[462.9, -6, 0.00, 0.15, 0.056], [345.7, 0, 0.02, 0.17, 0.045], [257.8, -4, 0.06, 0.21, 0.07], [193.4, -12, 0.14, 0.30, 0.07]];
const HIT2_TICKS = [[4680, -50], [6250, -48], [8340, -46]];

export const TIMING = { hum: 0.0, chord: 0.65, whooshPeakNoDisc: 0.65 + 1.82 + 0.75, whooshLead: 0.5, hit2AfterDust: 0.1 };

async function offline(seconds, build) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  build(ctx, ctx.destination);
  return ctx.startRendering();
}
function noiseSource(ctx, buf, at, stop) { const s = ctx.createBufferSource(); s.buffer = buf; s.start(at); if (stop) s.stop(stop); return s; }
function gainCurve(ctx, curve, duration, scale = 1) { const g = ctx.createGain(); g.gain.setValueCurveAtTime(scale === 1 ? curve : curve.map(v => v * scale), 0, duration); return g; }
function pan(ctx, p) { const s = ctx.createStereoPanner(); s.pan.value = p; return s; }

// ---- HUM: the "void" pad; starts at buffer t=0, runs the whole buffer ----
async function renderHum(D = 14) {
  return offline(D, (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = PEAK * db(HUM_LEVEL) * 2.2; master.connect(out);
    const env = gainCurve(ctx, envCurve([[0, -6], [0.4, 0], [0.65, 0], [0.95, -4], [4.65, -6], [12.65, -8]], D), D); env.connect(master);
    HUM.forEach(([f, l], i) => { const p = pan(ctx, [-0.3, 0, 0.3][i % 3]); p.connect(env); cluster(ctx, p, { f0: f, tOn: 0, duration: D, levelDb: l, decayDbS: 0, attack: 0.15, spread: 6, voices: 3, seed: 100 + i, amRate: 0.3 + 0.1 * i, amDepth: 0.3 }); });
    const breath = bandpass(ctx, 30, 130, 4); noiseSource(ctx, pinkBuffer(ctx, D, 21), 0).connect(breath.input); const bg = ctx.createGain(); bg.gain.value = db(-26); breath.output.connect(bg); bg.connect(env);
    const air = filterChain(ctx, [['highpass', 600], ['highpass', 600]]); noiseSource(ctx, pinkBuffer(ctx, D, 22), 0).connect(air.input); const ag = ctx.createGain(); ag.gain.value = db(-30); air.output.connect(ag); ag.connect(env);
  });
}
// ---- CHORD (+ low layer, sparkle, rush): H at buffer t=0.05 ----
async function renderChord(D = 12) {
  const H = 0.05;
  // pass 1: the chord clusters, one independently detuned copy per channel; normalised afterwards
  const dry = await offline(D, (ctx, out) => {
    for (let side = 0; side < 2; side++) {
      const p = pan(ctx, side === 0 ? -1 : 1); p.connect(out);
      CHORD.forEach(([f, l, dk], i) => { const boost = f > 1900 && f < 3300 ? 12 : f > 1200 ? 8 : f > 700 ? 4 : 0; const wide = f > 1900; cluster(ctx, p, { f0: f, tOn: H, duration: D, levelDb: l, decayDbS: dk, attack: 0.04, spread: wide ? 60 : 25, voices: wide ? 6 : 4, seed: 1000 * side + i, boostDb: boost }); });
    }
  });
  normalizeBuffer(dry, PEAK * 3.4);
  // pass 2: chord + transients + low layer + sparkle + reverb
  return offline(D, (ctx, out) => {
    const ir = reverbIR(ctx, 2.4, 1); const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = db(-16); conv.connect(wet); wet.connect(out);
    const chordSrc = ctx.createBufferSource(); chordSrc.buffer = dry; chordSrc.connect(out); chordSrc.connect(conv); chordSrc.start(0);
    const mono = ctx.createGain(); mono.connect(out);
    // attack thump / splash / air
    const th = filterChain(ctx, [['lowpass', 150], ['lowpass', 150]]); noiseSource(ctx, whiteBuffer(ctx, 1, 5), 0, 1).connect(th.input); const thg = gainCurve(ctx, envCurve([[H, -20], [H + 0.01, 0], [H + 0.08, -8], [H + 0.2, -40]], 1), 1, PEAK * db(-18) * 0.5); th.output.connect(thg); thg.connect(mono);
    const sp = filterChain(ctx, [['highpass', 3000]]); noiseSource(ctx, whiteBuffer(ctx, 1, 6), 0, 1).connect(sp.input); const spg = gainCurve(ctx, envCurve([[H, -20], [H + 0.005, 0], [H + 0.06, -6], [H + 0.2, -14], [H + 0.6, -40]], 1), 1, PEAK * db(-30) * 0.5); sp.output.connect(spg); spg.connect(mono);
    const air = filterChain(ctx, [['highpass', 2500], ['highpass', 2500]]); noiseSource(ctx, pinkBuffer(ctx, D, 23), 0).connect(air.input); const airg = gainCurve(ctx, envCurve([[H, -30], [H + 0.05, 0], [H + 6, -12], [H + 10, -20]], D), D, PEAK * db(-44) * 0.5); air.output.connect(airg); airg.connect(mono);
    // rush glides
    RUSH.forEach(([fa, fb, d], i) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(fa, H); o.frequency.exponentialRampToValueAtTime(fb, H + d); const g = gainCurve(ctx, envCurve([[H, -30], [H + 0.03, 0], [H + d, -14], [H + d + 0.4, -40]], D), D, PEAK * db(-24)); o.connect(g); g.connect(mono); o.start(0); o.stop(H + d + 1); });
    // sub tone + bubbly rumble + slow low lines
    const sub = ctx.createOscillator(); sub.frequency.value = 32.2; const subg = gainCurve(ctx, envCurve([[H, -20], [H + 0.3, -6], [H + 1.0, 0], [H + 3, -2], [H + 8, -10]], D), D, PEAK * db(-15)); sub.connect(subg); subg.connect(mono); sub.start(0); sub.stop(D);
    const rb = bandpass(ctx, 24, 115, 2); noiseSource(ctx, pinkBuffer(ctx, D, 3), 0).connect(rb.input);
    const rEnv = mulCurve(envCurve([[H, -14], [H + 0.4, -4], [H + 1.2, 0], [H + 2.5, 0], [H + 8, -12]], D), (t) => (1 + 0.6 * Math.sin(2 * Math.PI * 0.31 * t)) * (1 + 0.3 * Math.sin(2 * Math.PI * 1.34 * t + 1)));
    const rg = gainCurve(ctx, rEnv, D, PEAK * db(-10) * 0.35); rb.output.connect(rg); rg.connect(mono);
    [[145.6, -24, 1.5, 0.45], [181.6, -22, 0.0, 1.2]].forEach(([f, l, dly, amr], i) => cluster(ctx, mono, { f0: f, tOn: H + dly, duration: D, levelDb: l, decayDbS: -0.5, attack: dly ? 0.8 : 0.1, spread: 4, voices: 2, seed: 50 + i, amRate: amr, amDepth: 0.8, scale: PEAK * 1.4 }));
    // sparkle: faint HF streaks + the resonant sweep of the hum
    STREAKS.forEach(([dly, fa, fb, d]) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(fa, H + dly); o.frequency.exponentialRampToValueAtTime(fb, H + dly + d); const g = gainCurve(ctx, envCurve([[H + dly, -40], [H + dly + 0.05, 0], [H + dly + d, -18], [H + dly + d + 0.3, -50]], D), D, PEAK * db(-54)); o.connect(g); g.connect(mono); o.start(H + dly); o.stop(H + dly + d + 0.5); });
    const sweepEnv = gainCurve(ctx, envCurve(SWEEP_L.map(([a, l]) => [H + a, l]), D), D, PEAK * 1.6); sweepEnv.connect(mono);
    const nse = filterChain(ctx, [['lowpass', 150], ['lowpass', 150]]); noiseSource(ctx, whiteBuffer(ctx, D, 9), 0).connect(nse.input);
    [1.0, 1.035, 1.14].forEach((ratio, i) => {
      const fc = freqCurve(SWEEP_F.map(([a, f]) => [H + a, f * ratio]), D);
      const o = ctx.createOscillator(); o.frequency.setValueCurveAtTime(fc, 0, D); const og = ctx.createGain(); og.gain.value = 0.25 + 0.15 * i / 2; o.connect(og); og.connect(sweepEnv); o.start(0); o.stop(D);
      // ring-modulated noise band following the same trajectory (noise x carrier)
      const car = ctx.createOscillator(); car.frequency.setValueCurveAtTime(fc, 0, D); const rm = ctx.createGain(); rm.gain.value = 0; car.connect(rm.gain); nse.output.connect(rm); const rmg = ctx.createGain(); rmg.gain.value = 0.8 / 3; rm.connect(rmg); rmg.connect(sweepEnv); car.start(0); car.stop(D);
    });
  });
}
// ---- WHOOSH: peak at buffer t = 0.5 ----
async function renderWhoosh(D = 3.3) {
  const P = 0.5;
  return offline(D, (ctx, out) => {
    const ir = reverbIR(ctx, 2.4, 2); const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = db(-20); conv.connect(wet); wet.connect(out);
    for (let side = 0; side < 2; side++) {
      const p = pan(ctx, side === 0 ? -1 : 1); p.connect(out); p.connect(conv);
      const pn = pinkBuffer(ctx, D, 10 + side);
      for (const [[lo, hi], don, doff, g] of WHOOSH_BANDS) {
        const bp = bandpass(ctx, lo, Math.min(hi, 20000), 2); noiseSource(ctx, pn, 0).connect(bp.input);
        const env = envCurve(WHOOSH_ENV.map(([a, l]) => [P + a + (a <= 0 ? don : doff * (a / 2.1)), l]), D);
        const eg = gainCurve(ctx, env, D, PEAK * db(-6) * 1.1 * db(g)); bp.output.connect(eg); eg.connect(p);
      }
    }
  });
}
// ---- HIT 2 (PlayStation 2 logo): onset at buffer t = 0.02 ----
async function renderHit2(D = 3.6) {
  const T = 0.02;
  const dry = await offline(D, (ctx, out) => {
    for (const [f, l, st, pk, tau] of HIT2) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0, T + st); g.gain.linearRampToValueAtTime(db(l), T + pk); g.gain.setTargetAtTime(0, T + pk, tau); o.connect(g); g.connect(out); o.start(0); o.stop(D); }
    for (const [f, l] of HIT2_TICKS) { const o = ctx.createOscillator(); o.frequency.value = f; const g = gainCurve(ctx, envCurve([[T, -20], [T + 0.02, 0], [T + 0.1, -30], [T + 0.3, -60]], D), D, db(l)); o.connect(g); g.connect(out); o.start(0); o.stop(D); }
    const spl = filterChain(ctx, [['highpass', 60]]); noiseSource(ctx, pinkBuffer(ctx, D, 31), 0).connect(spl.input); const sg = gainCurve(ctx, envCurve([[T, -30], [T + 0.005, 0], [T + 0.05, -4], [T + 0.3, -16], [T + 0.6, -40], [T + 1.0, -60]], D), D, db(-29) * 0.5); spl.output.connect(sg); sg.connect(out);
  });
  normalizeBuffer(dry, PEAK * db(14) * 0.5);
  return offline(D, (ctx, out) => {
    const ir = reverbIR(ctx, 2.4, 3); const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = db(-12); conv.connect(wet); wet.connect(out);
    const s = ctx.createBufferSource(); s.buffer = dry; const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.4, 0); p.pan.setValueAtTime(-0.4, T + 0.1); p.pan.linearRampToValueAtTime(0, T + 0.3); s.connect(p); p.connect(out); p.connect(conv); s.start(0);
  });
}

export class StartupSound {
  constructor() { this.buffers = null; this.playing = []; }
  async prepare() {
    if (this.buffers) return this.buffers;
    const [hum, chord, whoosh, hit2] = await Promise.all([renderHum(), renderChord(), renderWhoosh(), renderHit2()]);
    this.buffers = { hum, chord, whoosh, hit2 }; return this.buffers;
  }
  // Schedule the no-disc or disc boot relative to absolute context time T0 (scene visible).
  start(ctx, dest, T0, { disc = false, whooshPeakAt = null } = {}) {
    if (!this.buffers) return;
    const b = this.buffers; const trim = 0.9;
    const wp = whooshPeakAt != null ? whooshPeakAt : T0 + TIMING.whooshPeakNoDisc;
    this.playing = [
      playBuffer(ctx, b.hum, dest, T0 + TIMING.hum, { gain: trim }),
      playBuffer(ctx, b.chord, dest, T0 + TIMING.chord - 0.05, { gain: trim }),
      playBuffer(ctx, b.whoosh, dest, wp - 0.5, { gain: trim }),
    ];
    if (disc) this.gateOut(ctx, wp + 1.35);
    return this.playing;
  }
  // With a disc the console mutes: (1-x)^2 over 0.8 s (chord/hum -10 -> -40 dB), ending 0.3 s after black.
  gateOut(ctx, at) { for (const p of this.playing.slice(0, 2)) { const g = p.gain.gain; g.setValueAtTime(g.value, at); g.setValueCurveAtTime(new Float32Array(Array.from({ length: 40 }, (_, i) => g.value * Math.pow(1 - i / 39, 2))), at, 0.8); } }
  hit2(ctx, dest, at) { if (this.buffers) playBuffer(ctx, this.buffers.hit2, dest, at, { gain: 0.9 }); }
  stopAll(ctx, fade = 0.3) { const t = ctx.currentTime; for (const p of this.playing) { p.gain.gain.setValueAtTime(p.gain.gain.value, t); p.gain.gain.linearRampToValueAtTime(0, t + fade); try { p.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ } } this.playing = []; }
}
