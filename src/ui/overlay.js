// HTML overlay helpers. All sizes are in cqh/cqw (percent of the 4:3 picture) so the layout scales with the TV.
export function el(tag, className, text) {
  const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
// Tween helper driven by the app clock (not CSS), so captures are deterministic.
export class Tweens {
  constructor() { this.list = []; }
  add({ from = 0, to = 1, dur = 0.5, delay = 0, ease = (t) => t, onUpdate, onDone }) {
    const tw = { t: -delay, from, to, dur, ease, onUpdate, onDone, done: false }; this.list.push(tw); return tw;
  }
  update(dt) {
    for (const tw of this.list) {
      if (tw.done) continue;
      tw.t += dt; if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      tw.onUpdate?.(tw.from + (tw.to - tw.from) * tw.ease(k), k);
      if (k >= 1) { tw.done = true; tw.onDone?.(); }
    }
    this.list = this.list.filter(t => !t.done);
  }
  clear() { this.list.length = 0; }
}
export const ease = {
  linear: (t) => t,
  inOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  out: (t) => 1 - Math.pow(1 - t, 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inQuart: (t) => t * t * t * t,
  inExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  smooth: (t) => t * t * (3 - 2 * t),
};
