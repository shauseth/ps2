// Maps keyboard, gamepad and pointer to PS2 controller buttons and emits 'press' events.
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  Enter: 'cross', Space: 'cross', KeyX: 'cross', KeyK: 'cross',
  Escape: 'circle', Backspace: 'circle', KeyC: 'circle', KeyL: 'circle',
  Tab: 'triangle', KeyT: 'triangle', KeyJ: 'triangle', KeyQ: 'square', KeyU: 'square',
  KeyI: 'select', Digit1: 'start', KeyP: 'start',
};
// Standard gamepad mapping: 0 cross, 1 circle, 2 square, 3 triangle, 8 select, 9 start, 12-15 dpad.
const PAD = { 0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export class Input extends EventTarget {
  constructor() {
    super();
    this.padState = new Map();
    this.axisState = { x: 0, y: 0 };
    this.enabled = true;
    // Held state (for gameplay): keyboard buttons currently down, plus the gamepad snapshot from the last poll.
    this.keysDown = new Set(); this.padDown = new Set(); this.padAxes = { x: 0, y: 0 };
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const b = KEYS[e.code];
      if (!b) return;
      e.preventDefault();
      if (e.repeat) return;
      this.keysDown.add(b);
      this.press(b, 'keyboard');
    });
    window.addEventListener('keyup', (e) => { const b = KEYS[e.code]; if (b) this.keysDown.delete(b); });
    window.addEventListener('blur', () => this.keysDown.clear());
  }
  // Is a button held right now (keyboard or gamepad)? Also true for the harness' synthetic holds.
  isDown(button) { return this.keysDown.has(button) || this.padDown.has(button) || (this.virtualDown?.has(button) ?? false); }
  // Movement vector in [-1, 1]: d-pad/keys or the left stick.
  axes() {
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0), y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    if (!x && !y) { x = Math.abs(this.padAxes.x) > 0.2 ? this.padAxes.x : 0; y = Math.abs(this.padAxes.y) > 0.2 ? this.padAxes.y : 0; }
    return { x, y };
  }
  // Harness helper: hold a button without a keyboard.
  setVirtual(button, down) { if (!this.virtualDown) this.virtualDown = new Set(); if (down) this.virtualDown.add(button); else this.virtualDown.delete(button); }
  press(button, source = 'app') {
    if (!this.enabled) return;
    this.dispatchEvent(new CustomEvent('press', { detail: { button, source } }));
  }
  pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      pad.buttons.forEach((btn, i) => {
        const name = PAD[i];
        if (!name) return;
        const was = this.padState.get(pad.index + ':' + i) || false;
        if (btn.pressed && !was) this.press(name, 'gamepad');
        this.padState.set(pad.index + ':' + i, btn.pressed);
        if (btn.pressed) this.padDown.add(name); else this.padDown.delete(name);
      });
      // Left stick as d-pad with hysteresis.
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      this.padAxes.x = ax; this.padAxes.y = ay;
      const sx = ax > 0.6 ? 1 : ax < -0.6 ? -1 : (Math.abs(ax) < 0.4 ? 0 : this.axisState.x);
      const sy = ay > 0.6 ? 1 : ay < -0.6 ? -1 : (Math.abs(ay) < 0.4 ? 0 : this.axisState.y);
      if (sx !== this.axisState.x && sx) this.press(sx > 0 ? 'right' : 'left', 'gamepad');
      if (sy !== this.axisState.y && sy) this.press(sy > 0 ? 'down' : 'up', 'gamepad');
      this.axisState = { x: sx, y: sy };
    }
  }
}
