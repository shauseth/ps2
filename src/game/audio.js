// Game-side sound for the San Andreas disc: every cue is synthesised at runtime (Web Audio), nothing is shipped.
// Long buffers (the logo foley, the theme, the loading loop, the ambiences, the cues) render once in
// OfflineAudioContexts at 48 kHz in the order the boot needs them; playback only schedules buffers on the console's
// context (null before the first gesture: then everything is skipped). Voices go through speechSynthesis.
// Numbers from research/gta-sa-launch.md sections 2 (movie sound), 7 (the theme) and 9 (logo foley on real hardware).
const VOICES = false;   // speech synthesis for the dialogue: off, the subtitles carry the lines
import { db, envCurve, whiteBuffer, pinkBuffer, filterChain, bandpass, playBuffer, reverbIR, normalizeBuffer } from '../audio/dsp.js';
import { makeRng } from '../rng.js';

const SR = 48000;
const BPM = 96, BEAT = 60 / BPM, STEP = BEAT / 4, CYCLE = 32 * STEP;   // 96 BPM: a 16th is 156.25 ms, the 2-bar cycle exactly 5 s
const THEME_AT = 23.3;                                                // beat 1 lands on the SA logo flash (movie time)
const CYCLES = 15;                                                    // 75 s of cycles from 23.3 s, then a held G under the producer cards to 102 s
const PAD_LV = db(-25);
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// The lead riff on the 32-step cycle ([step, length, MIDI]); the G3 at 30 is the pickup into the next cycle.
const RIFF_A = [[0, 2, 67], [2, 2, 63], [4, 1, 62], [5, 1, 63], [6, 1, 62], [7, 1, 60], [8, 2, 62], [10, 2, 62], [14, 2, 58], [16, 1, 60], [17, 1, 58], [18, 2, 60], [20, 2, 62], [22, 2, 55], [24, 2, 60], [26, 1, 58], [27, 1, 55], [30, 2, 55]];
// B section: the second bar answers around G3 (G-D, G-C#, G-C, G-Bb).
const RIFF_B = [...RIFF_A.slice(0, 8), [14, 1, 55], [15, 2, 62], [17, 1, 55], [18, 2, 61], [20, 1, 55], [21, 2, 60], [23, 1, 55], [24, 2, 58], [26, 2, 55], [30, 2, 55]];
// Bass: the transcription (F1 pickup, G1, the Bb1 stab on beat 3 of bar 2, Ab2-G2-D2 walking back) over the measured G1 pedal.
const BASS = [[0, 2, 29], [2, 4, 31], [6, 2, 31], [8, 2, 31], [11, 1, 31], [12, 2, 31], [16, 4, 31], [20, 2, 31], [22, 4, 34], [26, 2, 44], [28, 2, 43], [30, 2, 38]];
const BASS_EB = [[0, 2, 39], ...BASS.slice(1)];                        // from cycle 5 an Eb2 opens the odd bars
const KICK = [0, 7, 8, 16, 22, 24], SNARE = [4, 12, 20, 28];
const PAD_G = [79, 86], PAD_BB = [82, 87];                             // G5/D6, Bb5/Eb6 over the Bb/Ab turn (steps 22-29)

// ---- small helpers on top of dsp.js ----
async function offline(seconds, build) { const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR); build(ctx, ctx.destination); return ctx.startRendering(); }
function source(ctx, buf, at = 0, stop = 0) { const s = ctx.createBufferSource(); s.buffer = buf; s.start(at); if (stop) s.stop(stop); return s; }
function gainCurve(ctx, curve, duration, scale = 1) { const g = ctx.createGain(); g.gain.setValueCurveAtTime(scale === 1 ? curve : curve.map((v) => v * scale), 0, duration); return g; }
function pan(ctx, p, dest) { const s = ctx.createStereoPanner(); s.pan.value = p; if (dest) s.connect(dest); return s; }
function filt(ctx, type, hz, Q = Math.SQRT1_2, gain = 0) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = Q; f.gain.value = gain; return f; }
function tone(ctx, dest, type, hz, t0, t1, { detune = 0, gain = 1 } = {}) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = detune; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t0); o.stop(t1); return o; }
// Attack-hold-release gain (linear ramps), silent before t.
function ahr(ctx, dest, t, dur, a, r, level) { const g = ctx.createGain(), p = g.gain, h = t + Math.max(a, dur); p.setValueAtTime(0, 0); p.setValueAtTime(0, t); p.linearRampToValueAtTime(level, t + a); p.setValueAtTime(level, h); p.linearRampToValueAtTime(0, h + r); if (dest) g.connect(dest); return g; }
// Percussive gain: `level` at t, exponential decay with time constant tau.
function decay(ctx, dest, t, level, tau) { const g = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(level, t); g.gain.setTargetAtTime(0, t, tau); if (dest) g.connect(dest); return g; }
function withRoom(ctx, out, t60, wetDb, seed) { const conv = ctx.createConvolver(); conv.buffer = reverbIR(ctx, t60, seed); const wet = ctx.createGain(); wet.gain.value = db(wetDb); conv.connect(wet); wet.connect(out); const bus = ctx.createGain(); bus.connect(out); bus.connect(conv); return bus; }
function hit(ctx, dest, buf, t, gain, rate = 1) { const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(t); }
function rmsNormalize(buf, levelDb) { let e = 0, n = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; n += d.length; } const g = db(levelDb) / (Math.sqrt(e / n) || 1); for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } let m = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); } return m > db(-1) ? normalizeBuffer(buf, db(-1)) : buf; }
// A seamless loop of `seconds`: whatever rings past the loop point (reverb, releases) is folded onto the start.
function foldLoop(buf, seconds) { const n = Math.round(seconds * buf.sampleRate), out = new OfflineAudioContext(buf.numberOfChannels, n, buf.sampleRate).createBuffer(buf.numberOfChannels, n, buf.sampleRate); for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = out.getChannelData(c); d.set(s.subarray(0, n)); for (let i = n; i < Math.min(s.length, 2 * n); i++) d[i - n] += s[i]; } return out; }
// Amplitude curve (400/s) of spray-can strokes over the given spans: 70-160 ms bursts, 20-60 ms gaps, a 10-14 Hz flutter.
function strokes(rnd, spans, duration, rate = 400) {
  const n = Math.ceil(duration * rate), out = new Float32Array(n);
  for (const [from, to] of spans) { let t = from; while (t < to) { const len = Math.min(to - t, 0.07 + rnd() * 0.09), flut = 10 + rnd() * 4, ph = rnd() * 6.283, lv = 0.6 + rnd() * 0.4, i0 = Math.floor(t * rate), i1 = Math.floor((t + len) * rate); for (let i = i0; i < i1 && i < n; i++) { const x = (i - i0) / Math.max(1, i1 - i0); out[i] = lv * Math.min(1, x * 8, (1 - x) * 8) * (0.75 + 0.25 * Math.sin(6.283 * flut * i / rate + ph)); } t += len + 0.02 + rnd() * 0.04; } }
  return out;
}
// A slowly wandering level (1 +/- depth) that is periodic in `period` so loops do not step at the seam.
function wander(rnd, duration, period, depth = 0.3, rate = 400) { const n = Math.ceil(duration * rate), out = new Float32Array(n), k = [1, 2, 3].map((m) => m + Math.floor(rnd() * 2)), ph = [0, 0, 0].map(() => rnd() * 6.283); for (let i = 0; i < n; i++) { const t = i / rate / period; out[i] = 1 + depth * (0.5 * Math.sin(6.283 * k[0] * t + ph[0]) + 0.3 * Math.sin(6.283 * k[1] * t + ph[1]) + 0.2 * Math.sin(6.283 * k[2] * t + ph[2])); } return out; }
function clack(ctx, dest, nb, t, lv) { const bp = bandpass(ctx, 400, 1500, 2); source(ctx, nb, t, t + 0.1).connect(bp.input); bp.output.connect(decay(ctx, dest, t, lv, 0.012)); tone(ctx, decay(ctx, dest, t, lv * 0.8, 0.03), 'sine', 90, t, t + 0.2); }

// ---- the music: mix bus, drum kit, instruments, patterns ----
// Dry + a light reverb send, with one panned output per instrument (optional send and lowpass).
function mixBus(ctx, out, { t60 = 1.3, seed = 7, wetDb = -18 } = {}) {
  const dry = ctx.createGain(); dry.connect(out);
  const conv = ctx.createConvolver(); conv.buffer = reverbIR(ctx, t60, seed); const wet = ctx.createGain(); wet.gain.value = db(wetDb); conv.connect(wet); wet.connect(out); const send = ctx.createGain(); send.connect(conv);
  const side = (p, sendDb = null, lp = 0) => { const pn = pan(ctx, p, dry); if (sendDb != null) { const sg = ctx.createGain(); sg.gain.value = db(sendDb); pn.connect(sg); sg.connect(send); } if (!lp) return pn; const f = filt(ctx, 'lowpass', lp, 0.6); f.connect(pn); return f; };
  return { dry, send, click: whiteBuffer(ctx, 0.03, 5), kick: side(0), snare: side(0.05, -8), hat: side(0.25), bass: side(0), lead: side(-0.12, -5), piano: side(-0.28, -3), whistle: side(0.22, -4, 4500), pad: side(0, 0, 2600) };
}
function compressor(ctx, out) { const c = ctx.createDynamicsCompressor(); c.threshold.value = -12; c.knee.value = 10; c.ratio.value = 2.5; c.attack.value = 0.005; c.release.value = 0.2; c.connect(out); return c; }
async function renderKit() {
  const [kick, snare, hat, openHat, crash] = await Promise.all([
    offline(0.6, (ctx, out) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(175, 0); o.frequency.exponentialRampToValueAtTime(47, 0.06); o.connect(decay(ctx, out, 0, 1, 0.11)); o.start(0); o.stop(0.6); const c = filt(ctx, 'highpass', 1500); source(ctx, whiteBuffer(ctx, 0.05, 3), 0, 0.05).connect(c); c.connect(decay(ctx, out, 0, 0.35, 0.004)); }),
    offline(0.7, (ctx, out) => { const bus = withRoom(ctx, out, 0.3, -10, 8); const bp = bandpass(ctx, 900, 6000, 2); source(ctx, whiteBuffer(ctx, 0.4, 4), 0, 0.4).connect(bp.input); bp.output.connect(decay(ctx, bus, 0, 0.8, 0.075)); const o = ctx.createOscillator(); o.frequency.setValueAtTime(230, 0); o.frequency.exponentialRampToValueAtTime(170, 0.05); o.connect(decay(ctx, bus, 0, 0.7, 0.05)); o.start(0); o.stop(0.4); }),
    offline(0.15, (ctx, out) => { const f = filterChain(ctx, [['highpass', 7000], ['highpass', 7000], ['peaking', 9500, 1]]); f.output.gain.value = 6; source(ctx, whiteBuffer(ctx, 0.15, 5), 0, 0.15).connect(f.input); f.output.connect(decay(ctx, out, 0, 1, 0.018)); }),
    offline(0.7, (ctx, out) => { const f = filterChain(ctx, [['highpass', 6500], ['highpass', 6500], ['peaking', 9000, 1]]); f.output.gain.value = 6; source(ctx, whiteBuffer(ctx, 0.7, 6), 0, 0.7).connect(f.input); f.output.connect(decay(ctx, out, 0, 1, 0.15)); }),
    offline(2.5, (ctx, out) => { const f = filterChain(ctx, [['highpass', 3500], ['peaking', 6500, 1]]); f.output.gain.value = 4; source(ctx, whiteBuffer(ctx, 2.5, 7), 0, 2.5).connect(f.input); f.output.connect(decay(ctx, out, 0, 1, 0.55)); }),
  ]);
  for (const b of [kick, snare, hat, openHat, crash]) normalizeBuffer(b, 1);
  return { kick, snare, hat, openHat, crash };
}
// One cycle of drums; `c` picks the variant (ghost snare on even cycles, open hat on odd, a fill every fourth).
function drums(ctx, bus, kit, T, c) {
  const fill = c % 4 === 3;
  for (const s of KICK) hit(ctx, bus.kick, kit.kick, T + s * STEP, db(-2) * (s % 8 === 0 ? 1 : 0.8));
  for (const s of SNARE) hit(ctx, bus.snare, kit.snare, T + s * STEP, db(-5));
  if (fill) for (const [s, v] of [[29, 0.45], [30, 0.6], [31, 0.75]]) hit(ctx, bus.snare, kit.snare, T + s * STEP, db(-5) * v, 1.04); else if (c % 2 === 0) hit(ctx, bus.snare, kit.snare, T + 27 * STEP, db(-5) * 0.3);
  for (let s = 0; s < 32; s += 2) { const open = (s === 14 && c % 2 === 1) || (s === 30 && fill); hit(ctx, bus.hat, open ? kit.openHat : kit.hat, T + s * STEP, (open ? db(-15) : db(-17)) * (s % 8 === 0 ? 1 : s % 4 === 0 ? 0.8 : 0.55)); }
  for (const s of [3, 11, 19, 27]) hit(ctx, bus.hat, kit.hat, T + s * STEP, db(-17) * 0.4);
}
// Bass: a sine sub (high notes an octave down) plus a sawtooth through a closing lowpass.
function bassNote(ctx, bus, t, dur, midi, vel = 1, rel = 0.03) {
  const hz = midiHz(midi), sub = midi > 38 ? hz / 2 : hz, stop = t + dur + rel + 0.05;
  const sg = ahr(ctx, bus.bass, t, dur, 0.006, rel, db(-10) * vel); tone(ctx, sg, 'sine', sub, t, stop); tone(ctx, sg, 'sine', sub * 2, t, stop, { gain: db(-13) });
  const lp = filt(ctx, 'lowpass', 320, 2); lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.14); lp.connect(bus.bass);
  const wg = ahr(ctx, lp, t, dur, 0.004, rel, db(-18) * vel); tone(ctx, wg, 'sawtooth', hz, t, stop);
}
function bassCycle(ctx, bus, T, notes, vel = 1) { for (const [s, len, m] of notes) bassNote(ctx, bus, T + s * STEP, len * STEP - 0.02, m, vel * (s % 8 === 0 ? 1 : 0.85)); }
// The lead: a nasal square + saw (a formant peak at 1.5 kHz), a piano-like layer of decaying partials, and the
// "west coast whistle" (a triangle with vibrato and portamento) doubling an octave up.
function leadNote(ctx, bus, t, dur, midi, vel = 1, rel = 0.05) {
  const hz = midiHz(midi), stop = t + dur + rel + 0.05;
  const pk = filt(ctx, 'peaking', 1500, 1.2, 9), lp = filt(ctx, 'lowpass', 3600, 0.7); pk.connect(lp); lp.connect(bus.lead);
  const g = ahr(ctx, pk, t, dur, 0.01, rel, db(-13) * vel); tone(ctx, g, 'square', hz, t, stop, { gain: 0.7 }); tone(ctx, g, 'sawtooth', hz, t, stop, { detune: 9, gain: 0.5 });
}
function pianoNote(ctx, bus, t, dur, midi, vel = 1) {
  const hz = midiHz(midi), end = t + dur + 0.04, stop = end + 0.7;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(1, t); g.gain.setTargetAtTime(0, end, 0.08); g.connect(bus.piano);
  for (const [k, lv, tau] of [[1, 1, 0.5], [2, 0.45, 0.28], [3, 0.22, 0.18], [4.01, 0.1, 0.1]]) tone(ctx, decay(ctx, g, t, db(-12) * vel * lv, tau), 'sine', hz * k, t, stop);
  source(ctx, bus.click, t).connect(decay(ctx, g, t, db(-25) * vel, 0.004));   // the hammer
}
function whistleNote(ctx, bus, t, dur, midi, vel = 1, from = 0, rel = 0.07) {
  const hz = midiHz(midi), stop = t + dur + rel + 0.1;
  const o = ctx.createOscillator(); o.type = 'triangle'; if (from) { o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.045); } else o.frequency.setValueAtTime(hz, t);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz * 0.012, t + 0.3); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(stop);
  o.connect(ahr(ctx, bus.whistle, t, dur, from ? 0.012 : 0.03, rel, db(-16) * vel)); o.start(t); o.stop(stop);
}
function padChord(ctx, bus, t, dur, midis, level, a = 0.35, r = 0.5) { const g = ahr(ctx, bus.pad, t, dur, a, r, level), stop = t + Math.max(a, dur) + r + 0.1; for (const m of midis) for (const [det, p] of [[-9, -0.55], [9, 0.55]]) tone(ctx, pan(ctx, p, g), 'sawtooth', midiHz(m), t, stop, { detune: det, gain: 0.5 }); }
function riffCycle(ctx, bus, T, notes, { lead = true, piano = true, whistle = true, gainDb = 0 } = {}, st = {}) {
  for (const [s, len, m] of notes) {
    const t = T + s * STEP, dur = len * STEP - 0.03, vel = db(gainDb) * (s % 8 === 0 ? 1 : s % 4 === 0 ? 0.9 : 0.78), legato = st.end != null && Math.abs(st.end - t) < 1e-6 && st.on;
    if (lead) leadNote(ctx, bus, t, dur, m, vel); if (piano) pianoNote(ctx, bus, t, dur, m, vel);
    if (whistle) whistleNote(ctx, bus, t, dur + 0.02, m + 12, vel, legato ? st.hz : 0);
    st.hz = midiHz(m + 12); st.end = T + (s + len) * STEP; st.on = whistle;
  }
  return st;
}
// Two-bar patterns rendered once (the cycle plus its tails) and laid down per cycle in the final mix.
function pattern(seconds, build) { return offline(seconds, (ctx, out) => build(ctx, mixBus(ctx, out))); }
async function renderTheme(kit) {
  const fromG4 = () => ({ end: 0, hz: midiHz(67), on: true });          // every riff cycle follows the G3 pickup: the whistle glides in from G4
  const [dEven, dOdd, dFill, bass, bassEb, riffA, riffAw, riffBw, pickup, pad] = await Promise.all([
    pattern(7, (ctx, bus) => drums(ctx, bus, kit, 0, 0)), pattern(7, (ctx, bus) => drums(ctx, bus, kit, 0, 1)), pattern(7, (ctx, bus) => drums(ctx, bus, kit, 0, 3)),
    pattern(7, (ctx, bus) => bassCycle(ctx, bus, 0, BASS)), pattern(7, (ctx, bus) => bassCycle(ctx, bus, 0, BASS_EB)),
    pattern(7, (ctx, bus) => riffCycle(ctx, bus, 0, RIFF_A, { whistle: false })), pattern(7, (ctx, bus) => riffCycle(ctx, bus, 0, RIFF_A, {}, fromG4())), pattern(7, (ctx, bus) => riffCycle(ctx, bus, 0, RIFF_B, {}, fromG4())),
    pattern(7, (ctx, bus) => riffCycle(ctx, bus, 0, [[30, 2, 55]], { whistle: false })),
    pattern(7.5, (ctx, bus) => { padChord(ctx, bus, 0, 24 * STEP, PAD_G, PAD_LV); padChord(ctx, bus, 24 * STEP, 8 * STEP, PAD_BB, PAD_LV); }),   // t = 0 is step -2
  ]);
  const END = CYCLES * CYCLE;
  return offline(END + 7, (ctx, out) => {
    const comp = compressor(ctx, out), lay = (buf, t) => source(ctx, buf, t).connect(comp);
    for (let c = 0; c < CYCLES; c++) {
      const T = c * CYCLE, b = Math.floor((c - 2) / 4) % 2 === 1;
      lay(c % 4 === 3 ? dFill : c % 2 ? dOdd : dEven, T); lay(c >= 4 ? bassEb : bass, T);
      if (c >= 1) lay(pad, T - 2 * STEP);
      if (c === 1) lay(pickup, T); else if (c >= 2) lay(b ? riffBw : c >= 4 ? riffAw : riffA, T);
    }
    // the ending: one more downbeat with a crash, then everything holds G and dies away over 5 s
    const bus = mixBus(ctx, comp); hit(ctx, bus.kick, kit.kick, END, db(-2)); hit(ctx, bus.snare, kit.crash, END, db(-14));
    bassNote(ctx, bus, END, 4.0, 31, 1, 1.5); padChord(ctx, bus, END - 2 * STEP, 4.5, PAD_G, PAD_LV, 0.35, 1.5);
    leadNote(ctx, bus, END, 4.0, 67, 1, 1.5); whistleNote(ctx, bus, END, 4.0, 79, 1, midiHz(67), 1.5); pianoNote(ctx, bus, END, 3.5, 67); pianoNote(ctx, bus, END, 3.5, 55, 0.8);
  }).then((b) => normalizeBuffer(b, db(-6)));
}
// The loading screens' "slightly different version": bass, hats, the pad and the whistle motif, two cycles looped.
function renderLoading(kit) {
  const L = 2 * CYCLE;
  return offline(L + 3, (ctx, out) => {
    const bus = mixBus(ctx, out, { t60: 1.8, seed: 8, wetDb: -15 }), st = {};
    for (let c = 0; c < 2; c++) {
      const T = c * CYCLE;
      for (let s = 0; s < 32; s += 2) hit(ctx, bus.hat, kit.hat, T + s * STEP, db(-21) * (s % 8 === 0 ? 1 : s % 4 === 0 ? 0.75 : 0.5));
      bassCycle(ctx, bus, T, BASS, db(-7)); padChord(ctx, bus, c ? T - 2 * STEP : T, (c ? 24 : 22) * STEP, PAD_G, db(-24)); padChord(ctx, bus, T + 22 * STEP, 8 * STEP, PAD_BB, db(-24));
      if (c === 0) riffCycle(ctx, bus, T, RIFF_A, { lead: false, piano: false, gainDb: 2 }, st);
    }
  }).then((b) => normalizeBuffer(foldLoop(b, L), db(-9)));
}

// ---- the movie's foley before the theme (buffer t = movie t) ----
function renderIntro() {
  const D = THEME_AT;
  return offline(D, (ctx, out) => {
    const rnd = makeRng(41);
    // Rockstar Games: the badge sprayed on stroke by stroke 0.15-1.2 s (2-8 kHz hiss peaking at 4.5 kHz, about -35 dBFS)
    const spray = bandpass(ctx, 2000, 8000, 4); source(ctx, whiteBuffer(ctx, 1.4, 1), 0, 1.4).connect(spray.input); const spk = filt(ctx, 'peaking', 4500, 1.5, 8); spray.output.connect(spk);
    const sg = gainCurve(ctx, strokes(rnd, [[0.15, 1.2]], 1.4), 1.4, db(-32)); spk.connect(sg); sg.connect(out);
    // Rockstar North: a marker-cap pop 0.4 s before the blue starts (6.0 s), scribble bursts 6.45-6.9, 7.0-7.9 and 8.2-8.4 s
    // peaking near 8.8 kHz, a 20-120 Hz rumble under them (-22 dB relative)
    tone(ctx, decay(ctx, out, 6.0, db(-24), 0.03), 'sine', 90, 6.0, 6.3); const pc = filt(ctx, 'highpass', 2000); source(ctx, whiteBuffer(ctx, 0.05, 6), 6.0, 6.05).connect(pc); pc.connect(decay(ctx, out, 6.0, db(-30), 0.003));
    const scr = filterChain(ctx, [['highpass', 6000], ['highpass', 6000], ['peaking', 8800, 1.5]]); scr.output.gain.value = 8; source(ctx, whiteBuffer(ctx, 3, 2), 5.8, 8.6).connect(scr.input);
    const scg = gainCurve(ctx, strokes(rnd, [[6.45, 6.9], [7.0, 7.9], [8.2, 8.4]], 8.6), 8.6, db(-30)); scr.output.connect(scg); scg.connect(out);
    const rum = bandpass(ctx, 20, 120, 2); source(ctx, pinkBuffer(ctx, 3, 3), 5.8, 8.6).connect(rum.input); const rg = gainCurve(ctx, envCurve([[5.9, -70], [6.2, 0], [8.2, 0], [8.4, -70]], 8.6), 8.6, db(-40)); rum.output.connect(rg); rg.connect(out);
    // the drone under the text cards: 60-250 Hz with partials at 100/150/169/190/214 Hz, rising -45 to -31 dBFS over 13.5-19 s, held, gone at the flash
    const dr = gainCurve(ctx, envCurve([[13.5, -45], [19.0, -31], [21.5, -31], [23.0, -37], [23.3, -80]], D), D, db(3.5)); dr.connect(out);
    for (const [f, l] of [[100, -7], [150, -4], [169, 0], [190, -1], [214, -6]]) for (const [det, p] of [[-4, -0.4], [4, 0.4]]) tone(ctx, pan(ctx, p, dr), 'sine', f, 13.4, D, { detune: det, gain: db(l) * 0.5 });
    const bed = bandpass(ctx, 60, 250, 2); source(ctx, pinkBuffer(ctx, D, 4), 13.4, D).connect(bed.input); const bg = ctx.createGain(); bg.gain.value = db(-10); bed.output.connect(bg); bg.connect(dr);
    // the riser into the flash: a resonant band of noise sweeping 500 Hz to 7 kHz over 21.5-23.3 s with a saw glide under it
    const rz = filt(ctx, 'bandpass', 500, 2.5); rz.frequency.setValueAtTime(500, 21.5); rz.frequency.exponentialRampToValueAtTime(7000, 23.3); source(ctx, whiteBuffer(ctx, 2, 7), 21.4, 23.3).connect(rz);
    const rzg = gainCurve(ctx, envCurve([[21.5, -40], [23.0, -18], [23.28, -14], [23.3, -80]], D), D, db(2)); rz.connect(rzg); rzg.connect(out);
    const gl = ctx.createOscillator(); gl.type = 'sawtooth'; gl.frequency.setValueAtTime(500, 21.5); gl.frequency.exponentialRampToValueAtTime(3500, 23.3); const glp = filt(ctx, 'lowpass', 2000); gl.connect(glp);
    const glg = gainCurve(ctx, envCurve([[21.5, -52], [23.2, -32], [23.3, -80]], D), D); glp.connect(glg); glg.connect(out); gl.start(21.5); gl.stop(23.3);
  });
}
// The hit under the white flash: a boom, a splash, a crash and a Gm stab (peaks -8 dBFS on the capture).
function renderFlash() {
  return offline(3.5, (ctx, out) => {
    const bus = withRoom(ctx, out, 1.8, -12, 9);
    const bo = ctx.createOscillator(); bo.frequency.setValueAtTime(64, 0); bo.frequency.exponentialRampToValueAtTime(38, 0.5); bo.connect(decay(ctx, bus, 0, 1, 0.35)); bo.start(0); bo.stop(2);
    const spl = bandpass(ctx, 200, 5000, 2); source(ctx, whiteBuffer(ctx, 0.6, 8), 0, 0.6).connect(spl.input); spl.output.connect(decay(ctx, bus, 0, 0.5, 0.09));
    const cr = filterChain(ctx, [['highpass', 3500], ['peaking', 6500, 1]]); cr.output.gain.value = 4; source(ctx, whiteBuffer(ctx, 3, 9), 0, 3).connect(cr.input); cr.output.connect(decay(ctx, bus, 0, 0.35, 0.55));
    const lp = filt(ctx, 'lowpass', 2500, 0.7); lp.connect(decay(ctx, bus, 0, 0.3, 0.28)); for (const m of [43, 55, 58, 62, 67]) for (const det of [-6, 6]) tone(ctx, lp, 'sawtooth', midiHz(m), 0, 1.5, { detune: det, gain: 0.25 });
  }).then((b) => normalizeBuffer(b, db(-9)));
}
// A laser seek: a tick and a tiny chirp, far down.
function renderSeek() {
  return offline(0.3, (ctx, out) => {
    const tk = bandpass(ctx, 1500, 5000, 2); source(ctx, whiteBuffer(ctx, 0.1, 10), 0, 0.1).connect(tk.input); tk.output.connect(decay(ctx, out, 0, 1, 0.006));
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(320, 0.01); o.frequency.exponentialRampToValueAtTime(900, 0.09); o.connect(ahr(ctx, out, 0.01, 0.07, 0.01, 0.03, 0.25)); o.start(0.01); o.stop(0.15);
  }).then((b) => normalizeBuffer(b, db(-36)));
}

// ---- one-shot cues ----
const CUES = {
  // a 1992 cellphone: two rings of a 1400/1760 Hz warble
  phone: () => offline(3.0, (ctx, out) => { for (const r0 of [0, 1.5]) { const o = ctx.createOscillator(); o.type = 'square'; for (let i = 0; i < 36; i++) o.frequency.setValueAtTime(i % 2 ? 1760 : 1400, r0 + i * 0.025); const lp = filt(ctx, 'lowpass', 4500); o.connect(lp); lp.connect(ahr(ctx, out, r0, 0.9, 0.005, 0.01, 0.5)); o.start(r0); o.stop(r0 + 0.95); } }).then((b) => normalizeBuffer(b, db(-16))),
  doorOpen: () => offline(0.7, (ctx, out) => {
    const c = filt(ctx, 'highpass', 1800); source(ctx, whiteBuffer(ctx, 0.3, 11), 0, 0.3).connect(c); c.connect(decay(ctx, out, 0, 1, 0.004)); c.connect(decay(ctx, out, 0.045, 0.6, 0.004));
    tone(ctx, decay(ctx, out, 0.01, 0.5, 0.04), 'sine', 85, 0.01, 0.4);
    const cr = ctx.createOscillator(); cr.type = 'sawtooth'; cr.frequency.value = 480; const w = ctx.createOscillator(); w.frequency.value = 9; const wg = ctx.createGain(); wg.gain.value = 70; w.connect(wg); wg.connect(cr.frequency); const clp = filt(ctx, 'lowpass', 1400, 2); cr.connect(clp); clp.connect(ahr(ctx, out, 0.06, 0.22, 0.05, 0.08, 0.12)); cr.start(0.06); cr.stop(0.45); w.start(0.06); w.stop(0.45);
  }).then((b) => normalizeBuffer(b, db(-16))),
  doorClose: () => offline(0.6, (ctx, out) => {
    const th = ctx.createOscillator(); th.frequency.setValueAtTime(95, 0); th.frequency.exponentialRampToValueAtTime(55, 0.08); th.connect(decay(ctx, out, 0, 1, 0.06)); th.start(0); th.stop(0.5);
    const bd = bandpass(ctx, 150, 900, 2); source(ctx, whiteBuffer(ctx, 0.3, 12), 0, 0.3).connect(bd.input); bd.output.connect(decay(ctx, out, 0, 0.8, 0.035));
    const ck = filt(ctx, 'highpass', 2500); source(ctx, whiteBuffer(ctx, 0.05, 13), 0, 0.05).connect(ck); ck.connect(decay(ctx, out, 0, 0.5, 0.003)); tone(ctx, decay(ctx, out, 0.005, 0.12, 0.05), 'sine', 2400, 0.005, 0.4);
  }).then((b) => normalizeBuffer(b, db(-10))),
  sirenBlip: () => offline(0.6, (ctx, out) => { for (const [type, g] of [['square', 0.5], ['sine', 0.4]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(560, 0); o.frequency.exponentialRampToValueAtTime(1350, 0.24); o.frequency.exponentialRampToValueAtTime(950, 0.34); const lp = filt(ctx, 'lowpass', 2600, 1); o.connect(lp); lp.connect(ahr(ctx, out, 0, 0.3, 0.008, 0.05, g)); o.start(0); o.stop(0.4); } }).then((b) => normalizeBuffer(b, db(-12))),
  trainHorn: () => offline(2.6, (ctx, out) => {
    const bus = withRoom(ctx, out, 1.6, -14, 14), lp = filt(ctx, 'lowpass', 1400, 0.8); lp.connect(ahr(ctx, bus, 0, 1.3, 0.08, 0.45, 0.22));
    for (const f of [233, 311, 370, 466]) for (const det of [-5, 5]) tone(ctx, lp, 'sawtooth', f, 0, 2.0, { detune: det, gain: 0.5 });
    const br = bandpass(ctx, 800, 3000, 2); source(ctx, pinkBuffer(ctx, 2, 15), 0, 2).connect(br.input); br.output.connect(ahr(ctx, bus, 0, 1.3, 0.08, 0.45, db(-22)));
  }).then((b) => normalizeBuffer(b, db(-12))),
  // a freight train crossing left to right over 14 s: the rumble swells, the clacks pan, the horn is doppler-shifted
  trainPass: () => offline(14, (ctx, out) => {
    const env = envCurve([[0, -40], [4.5, -8], [9, -8], [14, -40]], 14), nb = whiteBuffer(ctx, 0.1, 17);
    const rum = bandpass(ctx, 30, 250, 2); source(ctx, pinkBuffer(ctx, 14, 16), 0).connect(rum.input); const rg = gainCurve(ctx, env, 14, 0.8); rum.output.connect(rg); rg.connect(out);
    for (let t = 0.2; t < 13.8; t += 0.5) { const p = pan(ctx, -1 + 2 * t / 14, out), lv = env[Math.min(env.length - 1, Math.floor(t * 400))]; clack(ctx, p, nb, t, lv * 0.5); clack(ctx, p, nb, t + 0.11, lv * 0.35); }
    const hp = pan(ctx, -0.6, out); hp.pan.setValueAtTime(-0.6, 2.5); hp.pan.linearRampToValueAtTime(0.6, 6.5); const hl = filt(ctx, 'lowpass', 1400, 0.8); hl.connect(ahr(ctx, hp, 2.5, 2.4, 0.1, 0.5, 0.18));
    for (const f of [233, 311, 370, 466]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.04, 2.5); o.frequency.linearRampToValueAtTime(f * 0.96, 6.5); o.connect(hl); o.start(2.5); o.stop(6.5); }
  }).then((b) => normalizeBuffer(b, db(-12))),
  radioStatic: () => offline(1.6, (ctx, out) => {
    const rnd = makeRng(31), bp = bandpass(ctx, 300, 3000, 2); source(ctx, whiteBuffer(ctx, 1.6, 18), 0).connect(bp.input);
    const curve = new Float32Array(640); for (let i = 0; i < 640; i++) { const t = i / 400; curve[i] = t < 0.02 ? t / 0.02 : t > 1.35 ? Math.max(0, (1.5 - t) / 0.15) : 0.35 + 0.65 * Math.pow(rnd(), 3); }
    const g = gainCurve(ctx, curve, 1.6); bp.output.connect(g); g.connect(out);
    for (const t of [0, 1.42]) tone(ctx, decay(ctx, out, t, 0.6, 0.02), 'sine', 400, t, t + 0.1);   // squelch
  }).then((b) => normalizeBuffer(b, db(-22))),
  headBump: () => offline(0.4, (ctx, out) => { tone(ctx, decay(ctx, out, 0, 1, 0.045), 'sine', 110, 0, 0.35); tone(ctx, decay(ctx, out, 0, 0.5, 0.06), 'sine', 62, 0, 0.35); const lp = filt(ctx, 'lowpass', 500); source(ctx, whiteBuffer(ctx, 0.2, 19), 0, 0.2).connect(lp); lp.connect(decay(ctx, out, 0, 0.6, 0.03)); }).then((b) => normalizeBuffer(b, db(-14))),
  footstep: () => offline(0.25, (ctx, out) => { const lp = filt(ctx, 'lowpass', 900); source(ctx, whiteBuffer(ctx, 0.2, 20), 0, 0.2).connect(lp); lp.connect(decay(ctx, out, 0, 0.8, 0.02)); tone(ctx, decay(ctx, out, 0, 0.5, 0.03), 'sine', 95, 0, 0.2); const hp = filt(ctx, 'highpass', 2000); source(ctx, whiteBuffer(ctx, 0.2, 21), 0.01, 0.2).connect(hp); hp.connect(decay(ctx, out, 0.01, 0.2, 0.01)); }).then((b) => normalizeBuffer(b, db(-26))),
  // handcuffs: a ratchet of nine clicks with a ring at the first and last
  cuffs: () => offline(0.6, (ctx, out) => { const nb = whiteBuffer(ctx, 0.05, 22); for (let i = 0; i < 9; i++) { const t = 0.02 + i * 0.024, bp = bandpass(ctx, 3000, 7000, 2); source(ctx, nb, t, t + 0.05).connect(bp.input); bp.output.connect(decay(ctx, out, t, 0.8, 0.004)); } for (const t of [0.02, 0.212]) tone(ctx, decay(ctx, out, t, 0.25, 0.06), 'sine', 3300, t, t + 0.4); }).then((b) => normalizeBuffer(b, db(-20))),
  flash: renderFlash,
};

// ---- ambience loops (RMS-levelled, seamless) ----
const LOOPS = {
  // a terminal: murmur (pink noise 250-1500 Hz wandering slowly), fluorescent hum, a PA chime, a trolley rolling past
  airport: () => { const L = 12, D = L + 2.5; return offline(D, (ctx, out) => {
    const rnd = makeRng(29), bus = withRoom(ctx, out, 2.2, -12, 12);
    const mm = bandpass(ctx, 250, 1500, 2); source(ctx, pinkBuffer(ctx, D, 9), 0).connect(mm.input); const mg = gainCurve(ctx, wander(rnd, D, L, 0.35), D, db(-10)); mm.output.connect(mg); mg.connect(bus);
    tone(ctx, out, 'sine', 120, 0, L, { gain: db(-30) }); tone(ctx, out, 'sine', 240, 0, L, { gain: db(-36) });
    for (const [t, f] of [[3.1, 1319], [3.55, 1047]]) tone(ctx, decay(ctx, bus, t, db(-22), 0.35), 'sine', f, t, t + 1.5);
    const tr = bandpass(ctx, 60, 300, 2); source(ctx, pinkBuffer(ctx, 4, 10), 7.4, 11.4).connect(tr.input); const tg = gainCurve(ctx, envCurve([[7.5, -60], [8.3, 0], [9.6, 0], [10.6, -60]], 11.4), 11.4, db(-22)); tr.output.connect(tg); tg.connect(out);
  }).then((b) => rmsNormalize(foldLoop(b, L), -34)); },
  // a Los Santos street at dawn: distant traffic under 500 Hz, a breeze, birds in short swept chirps
  street: () => { const L = 12, D = L + 2; return offline(D, (ctx, out) => {
    const rnd = makeRng(23);
    const tr = filterChain(ctx, [['lowpass', 500], ['lowpass', 500]]); source(ctx, pinkBuffer(ctx, D, 7), 0).connect(tr.input); const tg = gainCurve(ctx, wander(rnd, D, L, 0.4), D, db(-12)); tr.output.connect(tg); tg.connect(out);
    const br = filt(ctx, 'highpass', 1200); source(ctx, pinkBuffer(ctx, D, 8), 0).connect(br); const bg = gainCurve(ctx, wander(rnd, D, L, 0.5), D, db(-32)); br.connect(bg); bg.connect(out);
    for (let t = 0.4; t < L - 0.6; t += 0.7 + rnd() * 1.3) { const n = 2 + Math.floor(rnd() * 4), f0 = 2400 + rnd() * 1600, p = pan(ctx, rnd() * 1.6 - 0.8, out), lv = db(-22 - rnd() * 8);
      for (let k = 0; k < n; k++) { const tk = t + k * (0.07 + rnd() * 0.05), o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, tk); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, tk + 0.025); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, tk + 0.055); o.connect(ahr(ctx, p, tk, 0.045, 0.008, 0.02, lv)); o.start(tk); o.stop(tk + 0.1); } }
  }).then((b) => rmsNormalize(foldLoop(b, L), -36)); },
  carInterior: () => { const L = 8, D = L + 1; return offline(D, (ctx, out) => {
    const rnd = makeRng(37), eg = gainCurve(ctx, wander(rnd, D, L, 0.15), D, db(-14)); eg.connect(out); const elp = filt(ctx, 'lowpass', 220, 1); elp.connect(eg);
    tone(ctx, elp, 'sawtooth', 44, 0, D, { gain: 0.6 }); tone(ctx, eg, 'sine', 44, 0, D, { gain: 0.6 }); tone(ctx, eg, 'sine', 88, 0, D, { gain: 0.25 });
    const rd = bandpass(ctx, 90, 700, 2); source(ctx, pinkBuffer(ctx, D, 11), 0).connect(rd.input); const rg = gainCurve(ctx, wander(rnd, D, L, 0.3), D, db(-20)); rd.output.connect(rg); rg.connect(out);
  }).then((b) => rmsNormalize(foldLoop(b, L), -30)); },
  // an idling engine: 22 firings a second through a resonant lowpass, the 44 Hz fundamental, exhaust noise
  engine: () => { const L = 6, D = L + 0.5; return offline(D, (ctx, out) => {
    const rnd = makeRng(43), eg = gainCurve(ctx, wander(rnd, D, L, 0.12), D); eg.connect(out);
    const res = filt(ctx, 'lowpass', 170, 5); res.connect(eg); tone(ctx, res, 'square', 22, 0, D, { gain: 0.5 });
    const lp = filt(ctx, 'lowpass', 420, 1); lp.connect(eg); tone(ctx, lp, 'sawtooth', 44, 0, D, { gain: 0.3 });
    const ex = bandpass(ctx, 100, 900, 2); source(ctx, pinkBuffer(ctx, D, 12), 0).connect(ex.input); const xg = ctx.createGain(); xg.gain.value = 0.12; ex.output.connect(xg); xg.connect(eg);
  }).then((b) => rmsNormalize(foldLoop(b, L), -26)); },
  train: () => { const L = 6.6, D = L + 0.6; return offline(D, (ctx, out) => {
    const rnd = makeRng(47), nb = whiteBuffer(ctx, 0.1, 17);
    const rum = bandpass(ctx, 30, 200, 2); source(ctx, pinkBuffer(ctx, D, 13), 0).connect(rum.input); const rg = gainCurve(ctx, wander(rnd, D, L, 0.25), D, db(-8)); rum.output.connect(rg); rg.connect(out);
    for (let t = 0.1; t < L; t += 0.55) { clack(ctx, out, nb, t, 0.5); clack(ctx, out, nb, t + 0.12, 0.35); }
    const hs = filt(ctx, 'highpass', 3000); source(ctx, whiteBuffer(ctx, D, 14), 0).connect(hs); const hg = ctx.createGain(); hg.gain.value = db(-34); hs.connect(hg); hg.connect(out);
  }).then((b) => rmsNormalize(foldLoop(b, L), -24)); },
};

// ---- voices ----
const CHARACTERS = {
  cj: { pitch: 0.9, rate: 1.0, prefer: ['Aaron', 'Alex', 'David', 'Fred', 'Google US English'] },
  sweet: { pitch: 0.55, rate: 0.9, prefer: ['Fred', 'Mark', 'Aaron', 'Alex', 'Google US English'] },
  tenpenny: { pitch: 0.65, rate: 0.92, prefer: ['Alex', 'David', 'Aaron', 'Fred', 'Google US English'] },
  pulaski: { pitch: 1.1, rate: 1.08, prefer: ['Eddy', 'Reed', 'Mark', 'Rocko', 'Aaron', 'Google US English'] },
  hernandez: { pitch: 0.95, rate: 1.0, prefer: ['Rocko', 'Reed', 'Eddy', 'David', 'Aaron', 'Google US English'] },
  driver: { pitch: 1.0, rate: 1.05, prefer: ['Reed', 'Rocko', 'Mark', 'Aaron'] },
  steward: { pitch: 1.15, rate: 1.0, prefer: ['Samantha', 'Zira', 'Google US English', 'Karen', 'Moira'] },
};
function pickVoice(voices, name) {
  const cfg = CHARACTERS[name] || CHARACTERS.cj, us = voices.filter((v) => /^en[-_]US/i.test(v.lang || '')), en = voices.filter((v) => /^en/i.test(v.lang || '')), pool = us.length ? us : en.length ? en : voices;
  for (const p of cfg.prefer) { const v = pool.find((x) => x.name && x.name.includes(p)); if (v) return v; }
  if (!pool.length) return null; let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return pool[h % pool.length];
}

export class GameAudio {
  constructor(app) {
    this.app = app; this.buffers = {}; this.kit = null; this.waiters = {}; this.playing = []; this.loops = {}; this.gens = {}; this.prepared = null; this.utterances = []; this.movie = null; this._voices = null;
    // Render early so the disc read and the logos have their sound. The capture harness (muted, no context) renders on demand.
    if (this.ctx || !this.app.audio.muted) this.prepare().catch((e) => console.error('game audio prepare failed', e));
  }
  get ctx() { return this.app.audio.ctx; }
  get dest() { return this.app.audio.master; }
  // Render every buffer once, in the order the boot needs them: the seek tick, the logo foley and the flash, the theme,
  // the loading loop, then the cues and ambiences. Buffers land in this.buffers as they finish.
  prepare() {
    if (this.prepared) return this.prepared;
    this.prepared = (async () => {
      if (typeof OfflineAudioContext === 'undefined') return this.buffers;
      const put = (obj) => { for (const [k, b] of Object.entries(obj)) { this.buffers[k] = b; (this.waiters[k] || []).forEach((fn) => fn()); delete this.waiters[k]; } };
      put({ seek: await renderSeek() });
      const [intro, flash, kit] = await Promise.all([renderIntro(), renderFlash(), renderKit()]); this.kit = kit; put({ intro, flash });
      put({ theme: await renderTheme(kit) });
      put({ loading: await renderLoading(kit) });
      const cn = Object.keys(CUES).filter((n) => n !== 'flash'); put(Object.fromEntries((await Promise.all(cn.map((n) => CUES[n]()))).map((b, i) => [cn[i], b])));
      const ln = Object.keys(LOOPS); put(Object.fromEntries((await Promise.all(ln.map((n) => LOOPS[n]()))).map((b, i) => [ln[i], b])));
      return this.buffers;
    })();
    return this.prepared;
  }
  _landed(name) { return new Promise((res) => { if (this.buffers[name]) res(); else (this.waiters[name] = this.waiters[name] || []).push(res); }); }
  // Schedule a rendered buffer at an absolute context time. A buffer still rendering starts when it lands, offset so it
  // stays in sync (loops wrap); `cb` then receives the handle. Returns the handle when it started now.
  _at(name, when, { gain = 1, rate = 1, pan: p = 0, loop = false, fadeIn = 0, tag = name } = {}, cb) {
    const ctx = this.ctx; if (!ctx || !this.dest) return null;
    const buf = this.buffers[name], gen = this.gens[tag] = this.gens[tag] || 0;
    if (!buf) { this.prepare().catch(() => {}); this._landed(name).then(() => { if (this.gens[tag] === gen) this._at(name, when, { gain, rate, pan: p, loop, fadeIn, tag }, cb); }); return null; }
    const now = ctx.currentTime, start = Math.max(when, now); let offset = 0;
    if (when < now) { offset = (now - when) * rate; if (loop) offset %= buf.duration; else if (offset >= buf.duration) return null; }
    let dest = this.dest; if (p) { const pn = ctx.createStereoPanner(); pn.pan.value = p; pn.connect(dest); dest = pn; }
    let h; if (offset) { const src = ctx.createBufferSource(); src.buffer = buf; src.loop = loop; const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(dest); src.start(start, offset); h = { src, gain: g }; } else h = playBuffer(ctx, buf, dest, start, { gain, loop });
    if (rate !== 1) h.src.playbackRate.value = rate;
    if (fadeIn) { h.gain.gain.setValueAtTime(0, start); h.gain.gain.linearRampToValueAtTime(gain, start + fadeIn); }
    h.name = name; h.tag = tag; this.playing.push(h); h.src.onended = () => { this.playing = this.playing.filter((x) => x !== h); };
    if (cb) cb(h); return h;
  }
  _stop(h, fade = 0.3) { const t = this.ctx.currentTime, g = h.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); try { h.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ } this.playing = this.playing.filter((x) => x !== h); }
  _stopTag(tag, fade) { this.gens[tag] = (this.gens[tag] || 0) + 1; for (const h of this.playing.filter((x) => x.tag === tag)) this._stop(h, fade); }
  // Faint laser seeks while the disc is read (a fixed pattern, seeded).
  driveSeeks(seconds) { const ctx = this.ctx; if (!ctx) return; const rnd = makeRng(19), t0 = ctx.currentTime; for (let t = 0.7; t < seconds - 0.5; t += 0.45 + rnd() * 1.3) this._at('seek', t0 + t, { gain: 0.5 + rnd() * 0.5, rate: 0.85 + rnd() * 0.3, tag: 'seek' }); }
  // The intro movie's sound, scheduled relative to movie time 0: the foley, then the flash hit and the theme at 23.3 s.
  startMovie() { const ctx = this.ctx; if (!ctx) return; this.stopMovie(0.05); const t0 = ctx.currentTime + 0.03; this.movie = { t0 }; this._at('intro', t0, { tag: 'movie' }); this._at('flash', t0 + THEME_AT, { tag: 'movie' }); this._at('theme', t0 + THEME_AT, { tag: 'movie' }); }
  stopMovie(fade = 0.6) { if (!this.ctx) return; this._stopTag('movie', fade); this.movie = null; }
  startLoadingTune() { this.loop('loading', { fade: 1.0 }); }
  stopLoadingTune(fade = 1) { this.stopLoop('loading', fade); }
  // One-shot cues by name: 'phone', 'doorOpen', 'doorClose', 'sirenBlip', 'trainHorn', 'trainPass', 'radioStatic',
  // 'headBump', 'footstep', 'cuffs', 'flash'. opts: gain, at (seconds from now), rate, pan.
  play(name, { gain = 1, at = 0, rate = 1, pan: p = 0 } = {}) { const ctx = this.ctx; if (!ctx) return null; return this._at(name, ctx.currentTime + at, { gain, rate, pan: p, tag: 'cue' }); }
  // Looping ambience by name: 'airport', 'street', 'carInterior', 'engine', 'train' (also 'trainPass', 'loading').
  loop(name, { gain = 1, fade = 0.8, rate = 1 } = {}) { const ctx = this.ctx; if (!ctx || this.loops[name]) return this.loops[name] || null; const tag = 'loop:' + name; this.loops[name] = { name, tag }; this._at(name, ctx.currentTime, { gain, rate, loop: true, fadeIn: fade, tag }, (h) => { if (this.loops[name]?.tag === tag) this.loops[name] = h; }); return this.loops[name]; }
  stopLoop(name, fade = 0.5) { if (!this.loops[name]) return; delete this.loops[name]; if (this.ctx) this._stopTag('loop:' + name, fade); }
  // Resolves with the speechSynthesis voice list (empty without speechSynthesis or after 1.5 s).
  voicesReady() {
    if (this._voices) return this._voices;
    this._voices = new Promise((resolve) => {
      const ss = globalThis.speechSynthesis; if (!ss || !ss.getVoices) { resolve([]); return; }
      const done = () => { const v = ss.getVoices(); if (v.length) resolve(v); return v.length > 0; };
      if (done()) return; ss.addEventListener?.('voiceschanged', done); setTimeout(() => resolve(ss.getVoices()), 1500);
    });
    return this._voices;
  }
  // Speak a line with the character's voice; resolves on end, on error or after the timeout. Muted, without a context or
  // without speechSynthesis it resolves after about 0.06 s per character instead, so cutscene timing still works.
  say(character, text, { timeout = 8 } = {}) {
    const ss = globalThis.speechSynthesis, Utt = globalThis.SpeechSynthesisUtterance, secs = Math.min(timeout, Math.max(0.3, 0.06 * String(text).length));
    // Voices are off: the lines are subtitles only (Shaurya's call, 2026-09-17). The promise still resolves on the
    // estimated line length so the callers' timing is unchanged.
    if (!VOICES || !ss || !Utt || this.app.audio.muted || !this.ctx) return new Promise((r) => setTimeout(r, secs * 1000));
    return new Promise((resolve) => {
      const cfg = CHARACTERS[character] || CHARACTERS.cj; let done = false, timer = 0;
      const u = new Utt(String(text)); u.pitch = cfg.pitch; u.rate = cfg.rate; u.volume = 1; u.lang = 'en-US';
      const finish = () => { if (done) return; done = true; clearTimeout(timer); this.utterances = this.utterances.filter((x) => x !== u); resolve(); };
      u.onend = finish; u.onerror = finish; timer = setTimeout(finish, timeout * 1000); this.utterances.push(u);   // kept referenced: Chrome drops unreferenced utterances mid-line
      const speak = (voices) => { if (done) return; const v = pickVoice(voices, character); if (v) u.voice = v; try { ss.speak(u); } catch (e) { finish(); } };
      const now = ss.getVoices ? ss.getVoices() : []; if (now.length) speak(now); else this.voicesReady().then(speak);
    });
  }
  cancelSpeech() { try { globalThis.speechSynthesis?.cancel(); } catch (e) { /* noop */ } this.utterances = []; }
  stopAll() { this.cancelSpeech(); this.loops = {}; this.movie = null; for (const tag of Object.keys(this.gens)) this.gens[tag]++; if (!this.ctx) return; for (const h of this.playing.slice()) this._stop(h, 0.3); }
}
