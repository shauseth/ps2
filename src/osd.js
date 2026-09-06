// OSD controller: screen stack, background look, transitions, clock, memory-card data, sounds, disc.
import { SCREENS } from './ui/osd.js';
import { saveState } from './state.js';
import { personalCards, CONTENT_VERSION } from './content.js';

const LOOK = { main: 'main', version: 'main', psDriver: 'main', dvdPlayer: 'main', config: 'config', clockAdjust: 'config', clockOptions: 'config', browser: 'browser', memoryCard: 'browser', saveOptions: 'save', saveInfo: 'save', logo: 'logo' };

export class OSD {
  constructor(app) {
    this.app = app; this.stack = []; this.timeline = []; this.busy = false;
    // A SCPH-70012 slim: values as the real Version Information screen lists them for that model.
    this.model = { console: 'SCPH-70012', browser: '1.40', cdPlayer: '2.00', psDriver: '1.11', dvdPlayer: '3.10U', mac: '00:19:C5:2A:7B:1E' };
    this.clockOffset = 0;
    if (!app.console.cards || app.console.contentVersion !== CONTENT_VERSION) { app.console.cards = personalCards(); app.console.contentVersion = CONTENT_VERSION; app.console.disc = true; saveState(app.console); }
    if (app.console.disc == null) app.console.disc = true;
  }
  now() { return new Date(Date.now() + this.clockOffset + (this.app.clockAdvance || 0)); }
  setClock(d) { this.clockOffset = d.getTime() - Date.now(); this.app.scenes.menu.clockOffset = this.clockOffset; }
  saveSettings() { saveState(this.app.console); }
  freeKB(slot) { return Math.max(0, 8192 - 128 - this.app.console.cards[slot].reduce((a, s) => a + s.sizeKB, 0)); }
  sfx(name) { this.app.sounds?.play(name); }
  setMode(mode) { this.app.scenes.menu.setMode(mode); }
  // ---- timeline helper: run functions at delays (seconds) ----
  after(delay, fn) { this.timeline.push({ t: delay, fn }); }
  update(dt) {
    this.top()?.update(dt);
    if (this.pending > 0) { this.pending -= dt; if (this.pending <= 0) this.app.ui.classList.remove('pending'); }
    if (this.timeline.length) { for (const ev of this.timeline) ev.t -= dt; const due = this.timeline.filter(e => e.t <= 0); this.timeline = this.timeline.filter(e => e.t > 0); for (const e of due) e.fn(); }
  }
  // ---- stack ----
  top() { return this.stack[this.stack.length - 1]?.screen; }
  push(name, args = {}) {
    const cur = this.stack[this.stack.length - 1]; if (cur) { cur.args.sel = cur.screen.sel; cur.screen.unmount(); }
    const screen = new SCREENS[name](this, args); this.stack.push({ name, args, screen }); screen.mount();
    if (screen.items && screen.sel != null) { this.app.scenes.menu.setSelectedItem(screen.sel); this.app.scenes.menu.itemCount = screen.items.length; }
    this.applyLook(name, cur?.name);
  }
  pop(extra = {}) {
    const cur = this.stack.pop(); cur?.screen.unmount();
    const nxt = this.stack[this.stack.length - 1]; if (!nxt) { this.push('main'); return; }
    nxt.screen = new SCREENS[nxt.name](this, { ...nxt.args, ...extra }); nxt.screen.mount();
    if (nxt.screen.items && nxt.screen.sel != null) { this.app.scenes.menu.setSelectedItem(nxt.screen.sel); this.app.scenes.menu.itemCount = nxt.screen.items.length; }
    this.applyLook(nxt.name, cur?.name);
  }
  popTo(name, args) { while (this.stack.length && this.stack[this.stack.length - 1].name !== name) this.stack.pop().screen.unmount(); if (this.stack.length) this.stack.pop().screen.unmount(); this.push(name, args); }
  reset(name = 'main', args = {}) { for (const s of this.stack) s.screen.unmount(); this.stack = []; this.timeline = []; this.busy = false; this.push(name, args); }
  applyLook(name, prev) {
    const look = LOOK[name] || 'main', prevLook = LOOK[prev] || 'main'; const scene = this.app.scenes.menu;
    scene.setLook(look, look === prevLook ? 0 : (look === 'config' || prevLook === 'config') ? 1.0 : 0.5);
    scene.setMode(name === 'clockOptions' || name === 'clockAdjust' ? 'options' : 'list');
    this.app.picture.dataset.look = look;
    // System Configuration: the backdrop fades in first and the text pops ~1.4 s after X; leaving it, the fog and rods
    // fade for 1.2 s and the main-menu text pops just after black (cursor remembered)
    if (look === 'config' && prevLook !== 'config') this.pending = 1.4; else if (prevLook === 'config' && look !== 'config') this.pending = 1.3; else this.pending = 0;
    this.app.ui.classList.toggle('pending', this.pending > 0);
  }
  // ---- Browser transitions (measured: no camera sweep) ----
  enterBrowser() {
    if (this.busy) return; this.busy = true;
    const cur = this.stack[this.stack.length - 1]; cur.args.sel = cur.screen.sel; cur.screen.unmount(); // text hard-cuts off
    const scene = this.app.scenes.menu; scene.scatterOut();                               // orbs scatter and dim ~1.8 s
    this.app.sounds?.stop('ambience', 5.5, 0.7);
    this.after(1.8, () => this.app.fade(1, 0.15));
    this.after(2.55, () => { this.app.picture.dataset.look = 'browser'; scene.setLook('browser', 0); this.stack.push({ name: 'browser', args: {}, screen: null }); this.stack[this.stack.length - 1].screen = new SCREENS.browser(this, { fadeIn: true }); this.top().mount(); this.app.fade(0, 0); this.busy = false; });
  }
  leaveBrowser() {
    if (this.busy) return; this.busy = true; this.sfx('cancel');
    const scene = this.app.scenes.menu;
    this.app.fade(1, 0.35);                                                                 // Browser fades to black in 0.35 s
    this.after(0.6, () => this.app.sounds?.menuEntry());                                    // the entry wash restarts during the fade
    this.after(0.4, () => { this.top()?.unmount(); this.stack.pop(); this.app.picture.dataset.look = 'main'; scene.setLook('main', 0); });
    this.after(2.5, () => { scene.reappear(); this.app.fade(0, 0.05); });                    // orbs fade in
    this.after(3.5, () => { const m = this.stack[this.stack.length - 1]; if (m) { m.screen = new SCREENS.main(this, { sel: 0 }); m.screen.mount(); } this.busy = false; });
  }
  leaveCard(screen) {
    if (this.busy) return; this.busy = true; this.sfx('cancel');
    this.after(0.3, () => { screen.root.classList.add('vanish'); });
    this.after(0.55, () => { this.stack.pop().screen.unmount(); const b = this.stack[this.stack.length - 1]; b.screen = new SCREENS.browser(this, { sel: screen.slot, fadeIn: false }); b.screen.mount(); b.screen.root.classList.add('unflip'); this.app.picture.dataset.look = 'browser'; this.busy = false; });
    this.after(0.95, () => { const b = this.stack[this.stack.length - 1]; b?.screen?.root.classList.remove('unflip'); }); // the un-flip rule targets the selected slot; drop it once played so moving the cursor does not replay it
  }
  // ---- disc ----
  toggleDisc() { this.app.console.disc = !this.app.console.disc; saveState(this.app.console); const t = this.top(); if (t && t.draw && t.root.classList.contains('browser')) t.draw(); return this.app.console.disc; }
  // Links open from inside the button press, which is still the user's gesture, so the browser allows the new tab.
  openLink(url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* blocked */ } }
  bootDisc() {
    if (this.busy) return; this.busy = true;
    this.app.fade(1, 0.4);                                                                  // Browser fades to black, ~5 s while the drive spins up
    this.after(0.5, () => { this.top()?.unmount(); this.stack.push({ name: 'logo', args: {}, screen: null }); });
    this.after(5.0, () => { const s = new SCREENS.logo(this); this.stack[this.stack.length - 1].screen = s; s.mount(); this.app.picture.dataset.look = 'logo'; this.app.fade(0, 0); this.app.sounds?.play('logoHum'); });
  }
  afterLogo() { this.app.fade(1, 0); this.stack.pop()?.screen?.unmount(); const b = this.stack[this.stack.length - 1]; if (b && b.name === 'browser') { b.screen = new SCREENS.browser(this, { sel: this.app.console.cards.length, fadeIn: true }); b.screen.mount(); this.app.picture.dataset.look = 'browser'; } else this.reset('main'); this.app.fade(0, 0.3); this.busy = false; }
  press(b) { if (this.busy) return; this.top()?.press(b); }
  wordmarkSVG() {
    // Recreated "PlayStation(R)2" logotype as flowing text (proportions from the reference frames; not a Sony asset)
    return `<span class="wm-word">PersonalStation</span><span class="wm-reg">®</span><span class="wm-two">2</span>`;
  }
}
