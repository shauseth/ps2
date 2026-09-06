import * as THREE from 'three';
import { Input } from './input.js';
import { AudioEngine } from './audio/engine.js';
import { Sounds } from './audio/sounds.js';
import { makeRng } from './rng.js';
import { BootScene } from './scenes/boot.js';
import { MenuScene } from './scenes/menu.js';
import { OSD } from './osd.js';
import { loadState, saveState } from './state.js';
import { seedHistory, advanceHistory } from './history.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

class App {
  constructor() {
    this.picture = document.getElementById('picture');
    this.canvas = document.getElementById('gl');
    this.ui = document.getElementById('ui');
    this.fadeEl = document.getElementById('fade');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
    this.renderer.setPixelRatio(CAPTURE ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.input = new Input();
    this.audio = new AudioEngine();
    this.sounds = new Sounds(this.audio);
    this.sounds.prepare().catch((e) => console.error('sound prepare failed', e));
    this.rng = makeRng(Number(params.get('seed') || 7));
    this.time = 0;          // seconds since power-on (deterministic in capture mode)
    this.state = null;
    this.scenes = {};
    this.width = 4; this.height = 3;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.input.addEventListener('press', (e) => this.state?.onPress?.(e.detail.button));
  }
  resize() {
    const r = this.picture.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width)); this.height = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.width, this.height, false);
    for (const s of Object.values(this.scenes)) s.resize?.(this.width, this.height);
  }
  fade(opacity, seconds = 0) {
    this.fadeEl.style.transition = seconds ? `opacity ${seconds}s linear` : 'none';
    this.fadeEl.style.opacity = String(opacity);
  }
  setState(next, ...args) {
    this.state?.exit?.();
    this.state = next;
    this.stateTime = 0;
    next.enter?.(...args);
  }
  step(dt, render = true) {
    this.time += dt; this.stateTime += dt;
    if (!CAPTURE) this.input.pollGamepads();
    this.state?.update?.(dt, this.stateTime);
    if (render) this.state?.render?.(this.renderer);
  }
  start() {
    if (CAPTURE) return; // capture harness drives time via window.__ps2.step
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.step(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const app = new App();
app.scenes.boot = new BootScene(app);
app.scenes.menu = new MenuScene(app);
app.console = loadState();
if (!app.console.history.length || !('mask' in app.console.history[0])) app.console.history = seedHistory();
app.osd = new OSD(app);
// Menu state wraps the 3D background scene and the OSD screen stack.
app.scenes.menuState = {
  enter({ screen = 'main' } = {}) { clearUI(); app.scenes.menu.enter({ look: 'main' }); app.osd.reset(screen); if (screen === 'main') app.sounds?.menuEntry(); },
  exit() { app.scenes.menu.exit(); app.sounds?.stop('ambience'); },
  update(dt, t) { app.scenes.menu.update(dt, t); app.osd.update(dt); },
  render(r) { app.scenes.menu.render(r); },
  resize(w, h) { app.scenes.menu.resize(w, h); },
  onPress(b) { if (b === 'select') { const on = app.osd.toggleDisc(); app.sounds?.play(on ? 'confirm' : 'cancel'); return; } app.osd.press(b); },
};
function clearUI() { const ui = app.ui; while (ui.firstChild) ui.removeChild(ui.firstChild); }
app.resize();
app.onBootDone = (mode) => { app.setState(app.scenes.menuState, { screen: params.get('screen') || 'main' }); };
function bootConsole() {
  app.console.boots += 1; advanceHistory(app.console, app.rng); saveState(app.console);
  const card = params.get('card') !== '0';
  app.setState(app.scenes.boot, { history: app.console.history, card, mode: params.get('disc') ? 'disc' : 'menu' });
}

function powerOn() {
  document.getElementById('power').hidden = true;
  app.audio.ensure();
  bootConsole();
  app.start();
}

if (CAPTURE) {
  document.getElementById('power').hidden = true;
  app.audio.setMuted(true);
  const st = params.get('state') || 'boot';
  if (st === 'boot') bootConsole(); else if (st === 'menu') app.setState(app.scenes.menuState, { screen: params.get('screen') || 'main' }); else app.setState(app.scenes.menuState, { screen: 'main' });
  if (params.get('clock')) { const fixed = new Date(params.get('clock')).getTime(); app.osd.clockOffset = fixed - Date.now(); app.scenes.menu.clockTime = fixed; }
  window.__ps2 = {
    app, ready: true,
    step(seconds, fps = 30) { const n = Math.max(1, Math.round(seconds * fps)); for (let i = 0; i < n; i++) app.step(1 / fps, i === n - 1); },
    press(b) { app.input.press(b, 'harness'); },
    async renderSound(name) {
      // Renders the named buffer (or the whole no-disc boot mix) to a WAV for offline verification.
      const { bufferToWav } = await import('./audio/engine.js'); await app.sounds.prepare();
      let buf;
      if (name === 'boot' || name === 'bootDisc') {
        const disc = name === 'bootDisc'; const T0 = 0.2, D = disc ? 17 : 10;
        const off = new OfflineAudioContext(2, Math.ceil(D * 48000), 48000); const g = off.createGain(); g.connect(off.destination);
        const opts = disc ? { disc: true, whooshPeakAt: T0 + 4.58 } : {};
        app.sounds.startup.start(off, g, T0, opts); if (disc) app.sounds.startup.hit2(off, g, T0 + 13.3 - 0.41);
        buf = await off.startRendering();
      } else buf = app.sounds.buffers[name] || app.sounds.startup.buffers[name];
      if (!buf) throw new Error('no sound ' + name);
      const bytes = new Uint8Array(bufferToWav(buf)); let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s);
    },
  };
} else {
  const gate = document.getElementById('power'); gate.hidden = false;
  const go = () => { powerOn(); window.removeEventListener('keydown', go); gate.removeEventListener('pointerdown', go); };
  gate.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}
