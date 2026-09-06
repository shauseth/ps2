// OSD menu sounds, re-synthesised from the measured BIOS samples (research/audio-menu.md section 9).
// The console plays 17 short samples at fixed clocks through the SPU2 reverb; the "cancel" and "memory card"
// sounds are the confirm sample at lower clocks, which we reproduce with playbackRate.
import { db, envCurve, whiteBuffer, pinkBuffer, filterChain, bandpass, reverbIR } from './dsp.js';
import { makeRng } from '../rng.js';

const SR = 48000;
async function offline(seconds, build) { const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR); build(ctx, ctx.destination); return ctx.startRendering(); }
function sine(ctx, dest, f, gainDb, t0, t1, phase = 0) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = db(gainDb); o.connect(g); g.connect(dest); o.start(t0); o.stop(t1); return o; }
function withReverb(ctx, out, wetDb, seed = 5) { const ir = reverbIR(ctx, 2.3, seed); const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = db(wetDb); conv.connect(wet); wet.connect(out); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000; lp.connect(conv); const bus = ctx.createGain(); bus.connect(out); bus.connect(lp); return bus; }
function envGain(ctx, points, dur, scale = 1) { const g = ctx.createGain(); g.gain.setValueCurveAtTime(envCurve(points, dur).map(v => v * scale), 0, dur); return g; }

// #13 cursor tick: 80 ms 520 Hz tone with a 12 ms broadband click
export function renderTick() {
  return offline(3.0, (ctx, out) => {
    const bus = withReverb(ctx, out, -12, 11);
    const env = envGain(ctx, [[0, -60], [0.003, 0], [0.068, -2], [0.078, -60]], 0.1); env.connect(bus);
    sine(ctx, env, 520, 0, 0, 0.09);
    const click = filterChain(ctx, [['highpass', 1200], ['lowpass', 9000], ['bandpass', 3690, 1.2]]); const n = ctx.createBufferSource(); n.buffer = whiteBuffer(ctx, 0.05, 3); n.start(0); n.connect(click.input);
    const cg = ctx.createGain(); cg.gain.setValueAtTime(db(-12), 0); cg.gain.setTargetAtTime(0, 0.001, 0.0045); click.output.connect(cg); cg.connect(bus);
    const cs = ctx.createOscillator(); cs.frequency.value = 3690; const csg = ctx.createGain(); csg.gain.setValueAtTime(db(-12), 0); csg.gain.setTargetAtTime(0, 0.001, 0.0045); cs.connect(csg); csg.connect(bus); cs.start(0); cs.stop(0.05);
  });
}
// #14 confirm: G#4-C#5-F#5 stacked fourths, beating pairs, swell-dip-swell envelope, 782 ms (dry: variants use playbackRate)
export function renderConfirm() {
  const ENV = [[0, -39], [0.005, -28], [0.015, -21], [0.03, -17], [0.06, -15], [0.10, -12], [0.15, -9], [0.19, -10], [0.22, -14], [0.25, -20], [0.27, -30], [0.29, -22], [0.31, -17], [0.35, -15], [0.40, -17], [0.45, -21], [0.50, -27], [0.55, -32], [0.60, -35], [0.65, -38], [0.70, -42], [0.75, -51], [0.78, -60], [0.79, -80]];
  return offline(0.8, (ctx, out) => {
    const env = envGain(ctx, ENV, 0.8); env.connect(out);
    const pairs = [[411.25, 414.92, 0, 3.4], [547.49, 552.61, -1, 0], [731.32, 737.37, -4, 1.24]];
    for (const [f1, f2, l, ph] of pairs) { sine(ctx, env, f1, l, 0, 0.8); const o = ctx.createOscillator(); o.frequency.value = f2; const g = ctx.createGain(); g.gain.value = db(l); o.connect(g); g.connect(env); o.start(0.0001 + ph / (2 * Math.PI * f2)); o.stop(0.8); }
    for (const [f, l] of [[1210, -33.5], [1238, -35.6], [1423.5, -39.3], [2362, -52], [41, -30], [258, -40]]) sine(ctx, env, f, l, 0, 0.8);
  });
}
// #15 System-Configuration scroll: a sliding tone (octave rise then hover), 593 ms
export function renderScroll() {
  const F = [158, 176, 188, 205, 217, 223, 234, 246, 258, 258, 270, 205, 211, 217, 211, 205, 223, 188, 270, 264, 252, 246, 234];
  const G = [-50, -35, -34, -25, -25, -21, -18, -18, -16, -16, -14, -13, -12, -11, -10, -8, -9, -7, -8, -7, -8, -10, -7, -9, -9, -8, -10, -12, -11, -12, -15, -12, -13, -14, -18, -18, -19, -21, -20, -27, -21, -24, -23, -30, -26, -27, -30, -31, -30, -34, -33, -35, -36, -38, -42, -43, -48, -52, -59];
  return offline(2.5, (ctx, out) => {
    const bus = withReverb(ctx, out, -12, 12);
    const env = envGain(ctx, G.map((v, i) => [i * 0.01, v]), 0.6); env.connect(bus);
    const curve = new Float32Array(F.length); F.forEach((f, i) => { curve[i] = f; });
    const mk = (ratio, l) => { const o = ctx.createOscillator(); o.frequency.setValueCurveAtTime(curve.map(f => f * ratio), 0, 0.575); const g = ctx.createGain(); g.gain.value = db(l); o.connect(g); g.connect(env); o.start(0); o.stop(0.6); };
    mk(1, 0); mk(0.66, -4); mk(0.5, -18);
  });
}
// #11 enter sub-menu (very quiet glissando up then down) and #12 exit sub-menu (quiet descent, then a rising answer)
export function renderEnterSub() {
  return offline(2.6, (ctx, out) => {
    const bus = withReverb(ctx, out, -12, 13);
    const env = envGain(ctx, [[0, -60], [0.05, -20], [0.25, -20], [0.34, -6], [0.5, -9], [0.6, -15], [0.75, -13], [0.9, -18], [1.0, -26], [1.05, -60]], 1.1); env.connect(bus);
    const trackA = [[0, 223], [0.025, 246], [0.05, 258], [0.075, 287], [0.1, 305], [0.125, 322], [0.15, 346], [0.175, 369], [0.225, 428], [0.25, 451], [0.275, 428], [0.3, 398], [0.325, 369], [0.35, 352], [0.375, 322], [0.4, 305], [0.425, 211], [0.45, 193], [0.5, 182], [0.525, 234], [0.55, 217], [0.6, 211], [0.65, 205], [0.7, 193], [0.75, 182], [0.775, 170], [0.8, 105], [0.95, 100]];
    const trackB = [[0.075, 211], [0.1, 217], [0.15, 188], [0.2, 164], [0.25, 252], [0.275, 322], [0.325, 270], [0.35, 264], [0.375, 240], [0.4, 223], [0.6, 305], [0.7, 380], [0.8, 440]];
    const glide = (tr, l, t0, t1) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(tr[0][1], 0); for (const [t, f] of tr) o.frequency.linearRampToValueAtTime(f, Math.max(t, 0.001)); const g = ctx.createGain(); g.gain.value = db(l); o.connect(g); g.connect(env); o.start(t0); o.stop(t1); };
    glide(trackA, 0, 0, 1.05); glide(trackB, -4, 0.075, 0.85);
    const sw = ctx.createOscillator(); sw.frequency.setValueAtTime(7100, 0.2); sw.frequency.linearRampToValueAtTime(7900, 0.23); const sg = ctx.createGain(); sg.gain.setValueAtTime(0, 0); sg.gain.setValueAtTime(db(-25), 0.2); sg.gain.linearRampToValueAtTime(0, 0.24); sw.connect(sg); sg.connect(env); sw.start(0.2); sw.stop(0.25);
  });
}
export function renderExitSub() {
  return offline(3.0, (ctx, out) => {
    const bus = withReverb(ctx, out, -12, 14);
    const env = envGain(ctx, [[0, -60], [0.05, -29], [0.3, -31], [0.375, -36], [0.5, -26], [0.55, -18], [0.6, -10], [0.65, -7], [0.7, -10], [0.75, -16], [0.8, -20], [0.9, -27], [1.0, -32], [1.125, -40], [1.225, -55], [1.3, -70]], 1.35); env.connect(bus);
    const glide = (tr, l, t0, t1) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(tr[0][1], 0); for (const [t, f] of tr) o.frequency.linearRampToValueAtTime(f, Math.max(t, 0.001)); const g = ctx.createGain(); g.gain.value = db(l); o.connect(g); g.connect(env); o.start(t0); o.stop(t1); };
    glide([[0, 199], [0.025, 193], [0.05, 188], [0.075, 164], [0.1, 158], [0.125, 146], [0.15, 123], [0.175, 117], [0.25, 193], [0.3, 117], [0.35, 193], [0.4, 117], [0.5, 117]], 0, 0, 0.5);
    glide([[0.225, 2100], [0.3, 2300], [0.35, 2400], [0.4, 2600], [0.425, 3100], [0.45, 3350]], -10, 0.225, 0.5);
    glide([[0.525, 258], [0.55, 281], [0.575, 311], [0.6, 340], [0.625, 369], [0.65, 398], [0.675, 416], [0.75, 340], [0.85, 334], [1.0, 328], [1.3, 328]], 0, 0.5, 1.35);
    glide([[0.525, 182], [0.7, 188], [0.9, 146], [1.3, 129]], -6, 0.5, 1.35); glide([[0.525, 305], [0.7, 311], [0.9, 252], [1.3, 240]], -8, 0.5, 1.35);
  });
}
// #16 delete save: metallic pre-ring then an A#4+F4 fourth, 513 ms
export function renderDelete() {
  const G = [-44, -31, -27, -28, -39, -40, -37, -35, -36, -35, -29, -26, -26, -27, -27, -26, -22, -18, -15, -12, -9, -8, -10, -10, -10, -11, -11, -12, -13, -15, -17, -20, -25, -30, -32, -31, -29, -28, -29, -30, -31, -32, -33, -34, -35, -37, -38, -40, -43, -48, -59];
  return offline(2.6, (ctx, out) => {
    const bus = withReverb(ctx, out, -12, 15);
    const env = envGain(ctx, G.map((v, i) => [i * 0.01, v]), 0.52); env.connect(bus);
    for (const [f, l, t0] of [[346, -3, 0], [457, 0, 0], [1037, -20, 0.16], [1857, -12, 0], [2455, -10, 0], [1830, -35, 0], [2480, -35, 0]]) sine(ctx, env, f, l, t0, 0.52);
  });
}
// #9 main-menu entry wash: a G-C-D-G stack with a C6 pedal, 4 s, reverb tail
export function renderWash() {
  return offline(9, (ctx, out) => {
    const bus = withReverb(ctx, out, -10, 16);
    const env = envGain(ctx, [[0, -60], [0.1, -20], [0.36, 0], [0.5, -6], [1.0, -8], [1.5, -7], [2.0, -9], [2.5, -7], [3.0, -8], [3.18, -20], [3.6, -40], [4.0, -70]], 4.1); env.connect(bus);
    const rnd = makeRng(77);
    for (const [f, l] of [[384.5, -0.5], [340.7, -4], [507, -2.6], [523, -1.8], [572, -3.5], [597, -5.9], [1023, 0], [1144, -7], [1166, -7], [1540, -2], [2320, -7.3]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.2 + rnd() * 0.3; const lg = ctx.createGain(); lg.gain.value = f * 0.003; lfo.connect(lg); lg.connect(o.frequency); lfo.start(0);
      const g = ctx.createGain(); g.gain.value = db(l) / 4; o.connect(g); g.connect(env); o.start(0); o.stop(4.1); lfo.stop(4.1);
    }
    const bed = bandpass(ctx, 300, 3000, 2); const n = ctx.createBufferSource(); n.buffer = pinkBuffer(ctx, 4.2, 21); n.start(0); n.connect(bed.input); const bg = ctx.createGain(); bg.gain.value = db(-20) / 4; bed.output.connect(bg); bg.connect(env);
  });
}
// Ambience: sub drones + breathy drone events + broadband "wave" swells + beds (statistical model of the real sequence)
export function renderAmbience(D = 96, seed = 9) {
  return offline(D, (ctx, out) => {
    const rnd = makeRng(seed);
    const bus = withReverb(ctx, out, -6, 17);
    const master = ctx.createGain(); master.gain.value = 1; master.connect(bus);
    // 1. sub drones
    for (const [f, ch] of [[37.7, -1], [43.9, 1]]) for (let side = 0; side < 2; side++) {
      const o = ctx.createOscillator(); o.frequency.value = f * (side ? 1.0015 : 1); const p = ctx.createStereoPanner(); p.pan.value = side ? 0.9 : -0.9;
      const g = ctx.createGain(); const am = ctx.createOscillator(); am.frequency.value = 0.05 + rnd() * 0.07; const amg = ctx.createGain(); amg.gain.value = db(-46) * 0.4; g.gain.value = db(-46) * 0.8; am.connect(amg); amg.connect(g.gain);
      o.connect(g); g.connect(p); p.connect(master); o.start(side * 0.37); am.start(0); o.stop(D); am.stop(D);
    }
    // 2. drone events
    const SETS = [[105.5, 136.2, 150.9], [180.2, 200.7, 240.2], [287.1, 301.8], [48, 56, 64, 71, 123], [68, 80, 109, 129], [109, 119, 133, 197, 220]];
    for (let t = 1.0; t < D - 8; t += 8.5 * (0.8 + rnd() * 0.4)) {
      const set = SETS[Math.floor(rnd() * SETS.length)]; const tr = Math.pow(2, (rnd() * 10 - 5) / 12); const pan = rnd() * 1.6 - 0.8;
      const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.setValueCurveAtTime(new Float32Array(Array.from({ length: 220 }, (_, i) => { const x = i / 20; return (x < 4 ? Math.pow(x / 4, 2) : Math.exp(-(x - 4) / 2.3)) * db(-36) / Math.sqrt(set.length); })), t, 11); const p = ctx.createStereoPanner(); p.pan.value = pan; env.connect(p); p.connect(master);
      const trem = ctx.createOscillator(); trem.frequency.value = 0.15 + rnd() * 0.45; const tg = ctx.createGain(); tg.gain.value = 0.4; trem.connect(tg); tg.connect(env.gain); trem.start(t); trem.stop(t + 11);
      for (const f0 of set) { const f = f0 * tr; const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(env); o.start(t); o.stop(t + 11);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 33; const n = ctx.createBufferSource(); n.buffer = whiteBuffer(ctx, 11, 100 + Math.floor(rnd() * 1000)); n.start(t); n.connect(bp); const ng = ctx.createGain(); ng.gain.value = 0.6 * 3; bp.connect(ng); ng.connect(env); }
    }
    // 3. waves: coloured noise swells every ~9 s (20 % chance of a second one 4 s later)
    const waveEvents = []; for (let t = 2.0; t < D - 6; t += 7.2 + rnd() * 3.8) { waveEvents.push(t); if (rnd() < 0.2) waveEvents.push(t + 3.5 + rnd()); }
    for (const t of waveEvents) {
      const lvl = db(-40) * (0.5 + rnd() * 0.5);
      for (let side = 0; side < 2; side++) {
        const n = ctx.createBufferSource(); n.buffer = pinkBuffer(ctx, 8, 300 + Math.floor(rnd() * 500)); n.start(t);
        const col = filterChain(ctx, [['highpass', 25], ['lowpass', 9000], ['lowshelf', 250]]); col.output.frequency && 0; n.connect(col.input);
        const tilt = ctx.createBiquadFilter(); tilt.type = 'highshelf'; tilt.frequency.value = 250; tilt.gain.value = -9; col.output.connect(tilt);
        const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.setValueCurveAtTime(new Float32Array(Array.from({ length: 160 }, (_, i) => { const x = i / 20; const d = x < 1.5 ? -21 + 21 * x / 1.5 : -3.5 * (x - 1.5); return db(d) * lvl; })), t, 8);
        const p = ctx.createStereoPanner(); p.pan.value = side ? 0.7 : -0.7; tilt.connect(env); env.connect(p); p.connect(master);
        const rum = bandpass(ctx, 40, 300, 2); const rn = ctx.createBufferSource(); rn.buffer = pinkBuffer(ctx, 8, 900 + Math.floor(rnd() * 500)); rn.start(t); rn.connect(rum.input); const rg = ctx.createGain(); rg.gain.value = db(-6); rum.output.connect(rg); rg.connect(env);
      }
    }
    // 4. beds
    const bed = bandpass(ctx, 120, 6000, 2); const bn = ctx.createBufferSource(); bn.buffer = pinkBuffer(ctx, D, 2); bn.start(0); bn.connect(bed.input); const bg = ctx.createGain(); bg.gain.value = db(-58) * 2; bed.output.connect(bg); bg.connect(master);
    const hiss = filterChain(ctx, [['highpass', 2000], ['lowpass', 12000]]); const hn = ctx.createBufferSource(); hn.buffer = whiteBuffer(ctx, D, 4); hn.start(0); hn.connect(hiss.input); const hg = ctx.createGain(); hg.gain.value = db(-78) * 2; hiss.output.connect(hg); hg.connect(master);
    // loop seams
    const fade = ctx.createGain(); fade.gain.setValueAtTime(0, 0); fade.gain.linearRampToValueAtTime(1, 3); fade.gain.setValueAtTime(1, D - 3); fade.gain.linearRampToValueAtTime(0, D); bus.disconnect(); bus.connect(fade); fade.connect(out);
  });
}
