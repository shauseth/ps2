// Web Audio engine: all OSD sounds are synthesized (no recordings shipped).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this._build(this.ctx);
    return this.ctx;
  }
  _build(ctx) {
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.reverbBus = this._makeReverb(ctx, 3.2, 2.2);
    this.reverbBus.output.connect(this.master);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; }
  // Synthetic impulse response: exponentially decaying noise, a little darker over time.
  _makeReverb(ctx, seconds = 3, decay = 2, { pre = 0.01 } = {}) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const ir = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        const env = t < pre ? 0 : Math.pow(1 - (t - pre) / (seconds - pre), decay);
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.35 - 0.25 * t / seconds); // darkening tail
        d[i] = lp * env;
      }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir; conv.normalize = true;
    const input = ctx.createGain(); const output = ctx.createGain();
    input.connect(conv); conv.connect(output);
    return { input, output, conv };
  }
  // A single oscillator voice with an ADSR-ish envelope. Times in seconds relative to `at` (absolute ctx time).
  voice(ctx, dest, { type = 'sine', freq = 440, detune = 0, gain = 0.2, at = 0, attack = 0.005, hold = 0, decay = 1, curve = 'exp', end = null, pan = 0, freqEnd = null, glideTime = 0 } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(freq, at); osc.detune.value = detune;
    if (freqEnd != null && glideTime > 0) osc.frequency.exponentialRampToValueAtTime(freqEnd, at + glideTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    const dStart = at + attack + hold;
    if (curve === 'exp') g.gain.setTargetAtTime(0.0001, dStart, decay / 4.6);
    else g.gain.linearRampToValueAtTime(0.0001, dStart + decay);
    const stop = end != null ? at + end : dStart + decay + 0.5;
    let node = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    osc.connect(g); node.connect(dest);
    osc.start(at); osc.stop(stop);
    return { osc, gain: g };
  }
  // Band-passed white noise burst with optional frequency sweep.
  noise(ctx, dest, { at = 0, dur = 1, gain = 0.1, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, attack = 0.01, decay = 0.5, curve = 'exp', pan = 0 } = {}) {
    const rate = ctx.sampleRate, len = Math.ceil(rate * (dur + 0.1));
    const buf = ctx.createBuffer(1, len, rate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), at + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain, at + attack);
    if (curve === 'exp') g.gain.setTargetAtTime(0.0001, at + attack, decay / 4.6); else g.gain.linearRampToValueAtTime(0.0001, at + attack + decay);
    let node = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    src.connect(f); f.connect(g); node.connect(dest);
    src.start(at); src.stop(at + dur + 0.1);
    return { src, filter: f, gain: g };
  }
  // Render a sound function offline (for verification/tests). fn(ctx, dest, at) schedules everything at `at`.
  async renderOffline(fn, seconds = 4, sampleRate = 48000) {
    const off = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const saved = { ctx: this.ctx, master: this.master, reverbBus: this.reverbBus };
    this._build(off);
    try { fn(off, this.master, 0.05); } finally { }
    const buf = await off.startRendering();
    Object.assign(this, saved);
    return buf;
  }
}
// Encode an AudioBuffer as 16-bit PCM WAV (for offline verification dumps).
export function bufferToWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, rate = buf.sampleRate;
  const out = new ArrayBuffer(44 + len * ch * 2); const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
  return out;
}
