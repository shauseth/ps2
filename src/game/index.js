// Disc boot: the "game" state of the console. After the PlayStation 2 logo the disc is read and the title runs its
// own sequence: the Rockstar logos and credits movie, the console's loading screens, the opening cutscene, then
// control. Each phase is a screen object { mount(), update(dt) -> done?, render?(renderer), press?(button),
// resize?(w, h), unmount() } created with a shared context. Timing is driven by app.step (deterministic in capture
// mode: `?capture=1&state=game&phase=movie&t=12` mounts the movie and pre-steps 12 s).
import { GameAudio } from './audio.js';
import { World } from './world/index.js';
import { Hud } from './hud.js';
import { MovieScreen } from './movie.js';
import { LoadingScreen } from './loading.js';
import { Cutscene } from './cutscene.js';
import { Play } from './play.js';
import { el } from '../ui/overlay.js';

export const PHASES = ['read', 'movie', 'loading', 'cutscene', 'play'];
const READ_SECONDS = 8.7;   // black while the console reads the disc after the logo (measured 8.3 s on a slim PAL, 9.1 s on a fat NTSC)
const STEP = 1 / 30;

// The disc read: black, a few faint laser seeks.
class ReadScreen {
  constructor(ctx) { this.ctx = ctx; this.t = 0; this.root = el('div', 'phase read'); }
  mount() { this.ctx.root.appendChild(this.root); this.ctx.audio.driveSeeks?.(READ_SECONDS); }
  update(dt) { this.t += dt; return this.t >= READ_SECONDS; }
  unmount() { this.root.remove(); }
}

export class GameState {
  constructor(app) { this.app = app; this.root = null; this.phase = null; this.screen = null; this.built = false; this.time = 0; }
  ensureBuilt() {
    if (this.built) return; this.built = true;
    this.audio = new GameAudio(this.app);
    this.world = new World(this.app);
    this.hud = new Hud(this);
  }
  get ctx() { return { app: this.app, game: this, audio: this.audio, world: this.world, hud: this.hud, root: this.root, input: this.app.input }; }
  enter({ phase = 'read', t = 0 } = {}) {
    this.ensureBuilt();
    const ui = this.app.ui; while (ui.firstChild) ui.removeChild(ui.firstChild);
    this.root = el('div', 'game'); ui.appendChild(this.root);
    this.app.picture.dataset.look = 'game';
    this.app.fade(0, 0);
    this.world.ensureBuilt?.();
    this.goto(phase);
    if (t > 0) this.advance(t);
  }
  exit() { this.screen?.unmount?.(); this.screen = null; this.phase = null; this.audio?.stopAll?.(); this.hud?.detach?.(); this.root?.remove(); this.root = null; }
  make(phase) {
    const ctx = this.ctx;
    switch (phase) {
      case 'read': return new ReadScreen(ctx);
      case 'movie': return new MovieScreen(ctx);
      case 'loading': return new LoadingScreen(ctx);
      case 'cutscene': return new Cutscene(ctx);
      case 'play': return new Play(ctx);
      default: throw new Error('unknown phase ' + phase);
    }
  }
  goto(phase, opts) {
    this.screen?.unmount?.();
    this.phase = phase; this.screen = this.make(phase); this.screen.opts = opts || {};
    this.screen.mount();
  }
  next() { const i = PHASES.indexOf(this.phase); if (i >= 0 && i < PHASES.length - 1) this.goto(PHASES[i + 1]); else this.eject(); }
  // Deterministic pre-roll (capture mode): step the current screen without rendering.
  advance(seconds) { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) { if (this.screen?.update(STEP)) { this.next(); } } }
  update(dt) { this.time += dt; if (!this.screen) return; if (this.screen.update(dt)) this.next(); }
  render(r) {
    if (this.screen?.render) { this.screen.render(r); return; }
    r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear();
  }
  resize(w, h) { this.world?.resize?.(w, h); this.screen?.resize?.(w, h); }
  onPress(b) { if (b === 'select') { this.eject(); return; } this.screen?.press?.(b); }
  // Taking the disc out: the console drops back to the Browser (the site's escape hatch; a real PS2 would just hang).
  eject() { const app = this.app; app.console.disc = true; app.setState(app.scenes.menuState, { screen: 'browser' }); }
}
