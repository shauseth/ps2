// All OSD sounds. Startup/logo come from the measured synth; menu sounds are synthesized here.
import { StartupSound, TIMING } from './startup.js';
import { db, playBuffer, normalizeBuffer } from './dsp.js';
import { renderTick, renderConfirm, renderScroll, renderEnterSub, renderExitSub, renderDelete, renderWash, renderAmbience } from './menu-sfx.js';

const SR = 48000;
async function offline(seconds, build) { const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR); build(ctx, ctx.destination); return ctx.startRendering(); }

export class Sounds {
  constructor(audio) { this.audio = audio; this.startup = new StartupSound(); this.buffers = {}; this.loops = {}; this.ready = false; this.prepared = null; }
  prepare() {
    if (this.prepared) return this.prepared;
    this.prepared = (async () => {
      await this.startup.prepare();
      const [tick, confirm, scroll, enterSub, exitSub, del, wash, ambience] = await Promise.all([renderTick(), renderConfirm(), renderScroll(), renderEnterSub(), renderExitSub(), renderDelete(), renderWash(), renderAmbience()]);
      // Gain staging relative to the boot jingle (peak sample -3 dBFS here): confirm -6.5 dB, tick -15, cancel -14, wash -9,
      // scroll = confirm -7, sub-menu sounds much quieter, ambience RMS 18 dB under the jingle's loudest second.
      normalizeBuffer(tick, db(-18)); normalizeBuffer(confirm, db(-9.5)); normalizeBuffer(scroll, db(-16.5)); normalizeBuffer(enterSub, db(-35)); normalizeBuffer(exitSub, db(-25)); normalizeBuffer(del, db(-10)); normalizeBuffer(wash, db(-12));
      { let e = 0, n = 0; for (let c = 0; c < ambience.numberOfChannels; c++) { const d = ambience.getChannelData(c); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; n += d.length; } const rms = Math.sqrt(e / n); const g = db(-33) / (rms || 1); for (let c = 0; c < ambience.numberOfChannels; c++) { const d = ambience.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
      Object.assign(this.buffers, { tick, confirm, scroll, enterSub, exitSub, delete: del, wash, ambience });
      this.ready = true;
    })();
    return this.prepared;
  }
  get ctx() { return this.audio.ctx; }
  get dest() { return this.audio.master; }
  play(name, delay = 0, opts = {}) {
    const ctx = this.ctx; if (!ctx || !this.ready) return;
    const at = ctx.currentTime + delay;
    if (name === 'startup') return this.startup.start(ctx, this.dest, at, opts);
    if (name === 'logoHum') return this.startup.hit2(ctx, this.dest, at + TIMING.hit2AfterDust);
    if (name === 'ambience') { if (this.loops.ambience) return; const p = playBuffer(ctx, this.buffers.ambience, this.dest, at, { gain: 0, loop: true }); p.gain.gain.linearRampToValueAtTime(1, at + 1.0); this.loops.ambience = p; return p; }
    // the console plays one confirm sample at three clocks: 22050 (confirm), 14716 (memory card), 9270 (cancel)
    if (name === 'cancel') return this.playRate('confirm', 9270 / 22050, at, db(-4.5));
    if (name === 'memcard') return this.playRate('confirm', 14716 / 22050, at, db(-5.5));
    if (name === 'cursor') name = 'tick'; if (name === 'enter') name = 'confirm'; if (name === 'back') name = 'cancel';
    const b = this.buffers[name]; if (b) return playBuffer(ctx, b, this.dest, at, { gain: 1 });
  }
  playRate(name, rate, at, gain = 1) { const ctx = this.ctx; const b = this.buffers[name]; if (!b) return; const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate; const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(this.dest); src.start(at); return { src, gain: g }; }
  // Entering the main menu (after boot and when returning from the Browser): the entry wash plus the ambience sequence.
  menuEntry() { this.play('wash'); this.play('ambience'); }
  stop(name, fade = 1.0, delay = 0) {
    const ctx = this.ctx; const p = this.loops[name]; if (!p || !ctx) return;
    const t = ctx.currentTime + delay; p.gain.gain.setValueAtTime(p.gain.gain.value, t); p.gain.gain.exponentialRampToValueAtTime(0.001, t + fade); try { p.src.stop(t + fade + 0.05); } catch (e) { /* noop */ } delete this.loops[name];
  }
  stopStartup() { if (this.ctx) this.startup.stopAll(this.ctx, 0.4); }
  gateOutStartup(at) { if (this.ctx) this.startup.gateOut(this.ctx, at); }
}
