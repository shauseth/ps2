// The console's loading (research §4, real PS2 capture 6yKXXRcq4v4, frames ref-6yK2/t0110-t0151): black 5.5 s, the
// legal screen 9.9 s (the cover collage around the SA logo over eight lines of legal text; 0.3 s fades), black 0.5 s,
// six tinted artworks (30.4 s: 0.5 s in, holds with 1.7 s cross-fades) with the SA logo bottom-left and the loading
// bar under it, a 1.3 s fade, black 8 s. Not skippable (the console isn't). Every fade is driven from update(dt) (no
// CSS transitions) so captures are deterministic; stills come from the world, else a tinted painted fallback.
import { el } from '../ui/overlay.js';
import * as logo from './logo.js';
import { makeRng } from '../rng.js';

const BLACK1 = 5.5, LEGAL = 9.9, BLACK2 = 0.5, ARTS = 30.4, FADE = 1.3, BLACK3 = 8.0;
export const LOADING_SECONDS = BLACK1 + LEGAL + BLACK2 + ARTS + FADE + BLACK3;
const T_LEGAL = BLACK1, T_ARTS = BLACK1 + LEGAL + BLACK2, T_FADE = T_ARTS + ARTS;
const LEGAL_FADE = 0.3;                      // hard-ish cuts on the capture (0.3 s in and out)
const ART_IN = 0.5, CROSS = 1.7;             // the first artwork fades from black; the others cross-fade
const HOLDS = [4.9, 3.3, 3.3, 3.3, 3.3, 3.3]; // the first artwork holds longest on the capture (5 s); sums to 30.4 with the fades
const PIC_W = 640, PIC_H = 448;

// The eight lines as set on the PS2 legal screen (transcribed from ref-6yK2/t0115; each line centred, y 68-93 %).
export const LEGAL_LINES = logo.LEGAL_PARODY;

// The cover collage: 13 panels measured on ref-6yK2/t0115 (x, y, w, h in % of the picture, tilt in degrees), each a
// tinted portrait or a small scene. `still` names the world portrait used when the world can render one.
const PANELS = [
  { x: 19.0, y: 6.5, w: 11.5, h: 17.5, tilt: -2, tint: '#8c1c14', still: 'portrait1', fig: { x: 0.5, y: 0.34, s: 0.2, wide: 1.2, color: '#2a2424' } }, // bald man in a suit, red
  { x: 31.0, y: 9.0, w: 7.5, h: 15.0, tilt: 0, tint: '#4d5c8e', still: 'portrait7', fig: { x: 0.55, y: 0.3, s: 0.2, cap: 1 } },         // bandana, blue
  { x: 43.5, y: 7.0, w: 20.0, h: 18.0, tilt: 0, tint: '#7e9450', scene: 'street' },                                                    // street with a green sign (behind the logo)
  { x: 62.5, y: 7.0, w: 9.0, h: 26.0, tilt: 0, tint: '#a6c2d2', scene: 'sign' },                                                       // blue sky, street sign
  { x: 72.0, y: 7.5, w: 12.5, h: 18.0, tilt: 3, tint: '#d2c196', still: 'portrait4', fig: { x: 0.5, y: 0.3, s: 0.16, wide: 1.2 } },    // man in a blue polo, tan
  { x: 16.0, y: 26.0, w: 11.0, h: 19.0, tilt: 0, tint: '#d3792a', still: 'portrait2', fig: { x: 0.5, y: 0.3, s: 0.18, cap: 1, shades: 1 } }, // CJ in orange, cap and shades
  { x: 28.0, y: 26.5, w: 11.0, h: 25.5, tilt: 0, tint: '#e0c8a0', still: 'portrait3', fig: { x: 0.5, y: 0.28, s: 0.15, hair: 1, shades: 1 } }, // blonde girl with shades, cream
  { x: 62.5, y: 28.0, w: 10.0, h: 14.0, tilt: 0, tint: '#4f5f52', still: 'portrait8', fig: { x: 0.5, y: 0.4, s: 0.2 } },               // dark green-grey figure
  { x: 74.5, y: 36.0, w: 13.0, h: 19.0, tilt: -3, tint: '#9aa878', still: 'portrait5', fig: { x: 0.55, y: 0.3, s: 0.16 } },            // cop with a gun, green
  { x: 60.5, y: 38.0, w: 13.0, h: 17.0, tilt: 0, tint: '#c04a20', still: 'portrait6', fig: { x: 0.5, y: 0.42, s: 0.24 } },             // masked girl, red hair
  { x: 12.0, y: 45.0, w: 19.5, h: 18.0, tilt: 0, tint: '#d29030', scene: 'car' },                                                      // orange car
  { x: 34.5, y: 52.5, w: 16.0, h: 11.0, tilt: 0, tint: '#8fb0c8', scene: 'train' },                                                    // tram on a blue street (under the logo)
  { x: 51.5, y: 52.0, w: 20.0, h: 11.0, tilt: 0, tint: '#a5a89a', scene: 'blocks' },                                                   // grey street
];

// The six artworks in the capture's order: tint (the flat background) and the fallback painting.
const ARTS_DATA = [
  { still: 'art1', tint: '#6a0801', fig: { x: 0.62, y: 0.36, s: 0.17, wide: 1.35, color: '#2a2424' }, streaks: '#a0140a' },              // red: bald man in a suit
  { still: 'art2', tint: '#e6cf86', fig: { x: 0.70, y: 0.30, s: 0.15, wide: 1.2, cap: 1, color: '#7a3d2a' } },                            // yellow: bandana and plaid shirt
  { still: 'art3', tint: '#9acdce', fig: { x: 0.74, y: 0.15, s: 0.085, bottom: 0.58, color: '#e8e4d2', cap: 1 }, skyline: '#6d9fa0', bike: true }, // teal: CJ on the BMX
  { still: 'art4', tint: '#dcd687', fig: { x: 0.72, y: 0.22, s: 0.12, wide: 1.1, color: '#2e3245', arm: { dx: -0.2, dy: 0.14 } }, skyline: '#b8b47a' }, // grey-yellow: Tenpenny with a pistol
  { still: 'art5', tint: '#e5ddaa', fig: { x: 0.80, y: 0.22, s: 0.075, bottom: 0.44, color: '#4f3676', arm: { dx: -0.2, dy: -0.01 } }, car: '#b8391a' }, // red-orange: the lowrider
  { still: 'art6', tint: '#c2d6b3', fig: { x: 0.60, y: 0.30, s: 0.14, hair: 1, color: '#8a4a4a' } },                                       // green: girl with a cross necklace
];

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const dark = (hex, k) => css(mix(rgb(hex), [0, 0, 0], k));
const light = (hex, k) => css(mix(rgb(hex), [255, 255, 255], k));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c; }
function ctx2d(c) { try { return c.getContext('2d'); } catch { return null; } }
function soft(g, px) { try { g.filter = px > 0 ? `blur(${px}px)` : 'none'; } catch { /* no canvas filters: stay crisp */ } }

// A flat, painted background: the tint with a lighter top and a few soft lighter streaks (the capture's airbrushed look).
function paintBackground(g, W, H, tint, streak, rng) {
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, light(tint, 0.14)); grad.addColorStop(1, dark(tint, 0.12));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  soft(g, Math.max(2, W * 0.02));
  for (let i = 0; i < 6; i++) {
    g.fillStyle = streak ? css(rgb(streak), 0.35) : light(tint, 0.22); g.globalAlpha = 0.5;
    const x = rng() * W, y = rng() * H, w = W * (0.15 + rng() * 0.3), h = H * (0.04 + rng() * 0.08);
    g.beginPath(); g.ellipse(x, y, w, h, (rng() - 0.5) * 0.6, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1; soft(g, 0);
}
// Head-and-shoulders silhouette (two tones plus a toon outline): x, y the head centre, s the head radius (of H),
// wide the shoulder width, bottom where the body ends (of H; default off the picture), hair/cap/shades the accents,
// color a body colour (else a dark shade of the tint), arm a stretched-out arm {dx, dy} (of W, H) ending in a pistol.
function paintFigure(g, W, H, tint, { x, y, s, wide = 1, hair = 0, cap = 0, shades = 0, bottom = null, color = null, arm = null }, shadeK = 0.55) {
  const cx = x * W, cy = y * H, r = s * H, body = color || dark(tint, shadeK), skin = css(mix(mix(rgb(tint), [214, 160, 118], 0.6), [0, 0, 0], 0.12));
  const outline = dark(tint, 0.8), sw = r * 1.9 * wide, yb = bottom != null ? bottom * H : H + r;
  g.lineJoin = 'round'; g.lineWidth = Math.max(1, r * 0.08); g.strokeStyle = outline;
  // body: neck base, sloping shoulders, then straight down
  g.beginPath(); g.moveTo(cx - sw * 1.05, yb); g.lineTo(cx - sw, cy + r * 2.1); g.quadraticCurveTo(cx - sw * 0.9, cy + r * 1.3, cx - r * 0.6, cy + r * 1.15);
  g.lineTo(cx + r * 0.6, cy + r * 1.15); g.quadraticCurveTo(cx + sw * 0.9, cy + r * 1.3, cx + sw, cy + r * 2.1); g.lineTo(cx + sw * 1.05, yb); g.closePath();
  g.fillStyle = body; g.fill(); g.stroke();
  if (arm) {   // an arm held out, a pistol at the end
    const ax = cx - r * 0.2, ay = cy + r * 1.7, ex = ax + arm.dx * W, ey = ay + arm.dy * H;
    g.lineCap = 'round'; g.lineWidth = r * 0.62; g.strokeStyle = body; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke();
    g.lineWidth = r * 0.36; g.strokeStyle = skin; g.beginPath(); g.moveTo(ex + (ax - ex) * 0.12, ey + (ay - ey) * 0.12); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = '#141414'; g.fillRect(ex - r * 0.5, ey - r * 0.32, r * 0.75, r * 0.26); g.fillRect(ex - r * 0.15, ey - r * 0.1, r * 0.22, r * 0.3);
    g.lineWidth = Math.max(1, r * 0.08); g.strokeStyle = outline; g.lineCap = 'butt';
  }
  // neck
  g.fillStyle = skin; g.fillRect(cx - r * 0.4, cy + r * 0.6, r * 0.8, r * 0.7);
  // long hair falls over the shoulders behind the head
  if (hair) { g.fillStyle = dark(tint, 0.72); g.beginPath(); g.ellipse(cx, cy + r * 0.9, r * 1.55, r * 1.9, 0, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(cx, cy, r * 0.86, r, 0, 0, Math.PI * 2); g.fillStyle = skin; g.fill(); g.stroke();
  // a lit side (the light from the upper right, as on the covers)
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(cx + r * 0.3, cy - r * 0.1, r * 0.42, r * 0.7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(cx - r * 0.35, cy + r * 0.2, r * 0.4, r * 0.65, 0, 0, Math.PI * 2); g.fill();
  if (cap) { g.fillStyle = dark(tint, 0.78); g.beginPath(); g.ellipse(cx, cy - r * 0.1, r * 0.92, r * 0.95, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(cx - r * 1.15, cy - r * 0.25, r * 2.3, r * 0.18); }
  if (shades) { g.fillStyle = '#101010'; g.fillRect(cx - r * 0.78, cy - r * 0.3, r * 1.56, r * 0.28); }
  else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - r * 0.55, cy - r * 0.32, r * 0.4, r * 0.09); g.fillRect(cx + r * 0.15, cy - r * 0.32, r * 0.4, r * 0.09); }
}
function paintScene(g, W, H, tint, kind, rng) {
  const ground = dark(tint, 0.35), ink = dark(tint, 0.75);
  if (kind === 'street') {           // cream sky, an olive street and a dark figure crossing it
    g.fillStyle = light(tint, 0.55); g.fillRect(0, 0, W, H * 0.45); g.fillStyle = ground; g.fillRect(0, H * 0.6, W, H);
    g.fillStyle = light(tint, 0.1); g.fillRect(0, H * 0.45, W, H * 0.15);
    g.fillStyle = '#3c9a4a'; g.fillRect(W * 0.62, H * 0.12, W * 0.22, H * 0.09); g.fillStyle = ink; g.fillRect(W * 0.72, H * 0.21, W * 0.02, H * 0.4);
    paintFigure(g, W, H, tint, { x: 0.32, y: 0.36, s: 0.13 }, 0.7);
  } else if (kind === 'sign') {      // pale sky, a pole with a green street sign near the top
    g.fillStyle = ink; g.fillRect(W * 0.46, H * 0.1, W * 0.06, H); g.fillStyle = '#2f8a44'; g.fillRect(W * 0.2, H * 0.1, W * 0.62, H * 0.1);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(W * 0.26, H * 0.14, W * 0.5, H * 0.02);
    g.fillStyle = dark(tint, 0.2); g.fillRect(0, H * 0.72, W, H);
  } else if (kind === 'car') {       // an orange car nose-on, low
    g.fillStyle = light(tint, 0.3); g.fillRect(0, 0, W, H * 0.4);
    g.fillStyle = ink; g.beginPath(); g.moveTo(W * 0.1, H * 0.62); g.lineTo(W * 0.24, H * 0.36); g.lineTo(W * 0.78, H * 0.36); g.lineTo(W * 0.94, H * 0.62); g.lineTo(W * 0.94, H * 0.82); g.lineTo(W * 0.1, H * 0.82); g.closePath(); g.fill();
    g.fillStyle = light(tint, 0.05); g.fillRect(W * 0.12, H * 0.6, W * 0.8, H * 0.2); g.fillStyle = '#d9e7f0'; g.fillRect(W * 0.3, H * 0.4, W * 0.42, H * 0.18);
    g.fillStyle = '#f4f0d0'; g.fillRect(W * 0.16, H * 0.64, W * 0.1, H * 0.07); g.fillRect(W * 0.78, H * 0.64, W * 0.1, H * 0.07);
    g.fillStyle = '#151515'; g.fillRect(W * 0.14, H * 0.8, W * 0.12, H * 0.1); g.fillRect(W * 0.76, H * 0.8, W * 0.12, H * 0.1);
  } else if (kind === 'train') {     // a red tram on a blue street
    g.fillStyle = light(tint, 0.4); g.fillRect(0, 0, W, H * 0.5); g.fillStyle = dark(tint, 0.25); g.fillRect(0, H * 0.7, W, H);
    g.fillStyle = '#b0301c'; g.fillRect(W * 0.36, H * 0.25, W * 0.3, H * 0.55); g.fillStyle = '#e9d9b0'; g.fillRect(W * 0.4, H * 0.32, W * 0.22, H * 0.2);
    g.fillStyle = ink; g.fillRect(W * 0.34, H * 0.78, W * 0.34, H * 0.05);
  } else {                           // grey blocks: a row of low buildings under a pale sky
    g.fillStyle = light(tint, 0.35); g.fillRect(0, 0, W, H * 0.5);
    for (let i = 0; i < 5; i++) { const x = W * (i * 0.2 + 0.02), h = H * (0.25 + rng() * 0.3); g.fillStyle = dark(tint, 0.15 + rng() * 0.3); g.fillRect(x, H * 0.75 - h, W * 0.17, h); }
    g.fillStyle = ground; g.fillRect(0, H * 0.75, W, H);
  }
}
// Fallback artwork (the world's still is null): the tint with a big soft figure, plus the scene props of that cover.
function paintArt(g, W, H, a, rng) {
  paintBackground(g, W, H, a.tint, a.streaks, rng);
  if (a.skyline) {   // a flat city silhouette with a billboard, the ground a shade darker
    g.fillStyle = a.skyline; for (let i = 0; i < 7; i++) { const x = W * (i * 0.15 - 0.05), h = H * (0.1 + rng() * 0.22); g.fillRect(x, H * 0.55 - h, W * 0.16, h); }
    g.fillRect(W * 0.42, H * 0.14, W * 0.1, H * 0.07); g.fillRect(W * 0.455, H * 0.2, W * 0.008, H * 0.2); g.fillRect(W * 0.505, H * 0.2, W * 0.008, H * 0.2);
    g.fillRect(0, H * 0.55, W, H * 0.45); g.fillStyle = dark(a.skyline, 0.12); g.fillRect(0, H * 0.72, W, H * 0.28);
  }
  if (a.car) {       // the lowrider seen from the front-left: a long body, a pale windscreen, twin headlights, a gold stripe
    const c = a.car;
    g.fillStyle = 'rgba(190,200,210,0.85)'; g.beginPath(); g.moveTo(W * 0.24, H * 0.48); g.lineTo(W * 0.3, H * 0.3); g.lineTo(W * 0.82, H * 0.3); g.lineTo(W * 0.86, H * 0.48); g.closePath(); g.fill();
    g.fillStyle = c; g.beginPath(); g.moveTo(-W * 0.05, H * 0.62); g.quadraticCurveTo(W * 0.05, H * 0.45, W * 0.3, H * 0.44); g.lineTo(W * 0.9, H * 0.46); g.quadraticCurveTo(W * 1.02, H * 0.5, W * 1.05, H * 0.66); g.lineTo(W * 1.05, H * 0.9); g.lineTo(-W * 0.05, H * 0.9); g.closePath(); g.fill();
    g.fillStyle = dark(c, 0.3); g.fillRect(-W * 0.05, H * 0.48, W * 0.36, H * 0.03); g.fillStyle = '#d8b25a'; g.fillRect(-W * 0.05, H * 0.66, W * 0.68, H * 0.05);
    g.fillStyle = '#e9e9e9'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(W * (0.3 + i * 0.07), H * 0.57, W * 0.024, H * 0.034, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#101010'; g.beginPath(); g.ellipse(W * 0.7, H * 0.86, W * 0.09, H * 0.15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark(a.tint, 0.4); g.fillRect(0, H * 0.9, W, H * 0.1);
  }
  soft(g, W * 0.0025);
  paintFigure(g, W, H, a.tint, a.fig);
  soft(g, 0);
  if (a.bike) {      // the BMX under CJ: two wheels, a gold frame, his legs down to the pedals
    const f = a.fig, cx = f.x * W, yb = f.bottom * H, bb = [W * 0.72, H * 0.8];
    g.lineCap = 'round'; g.strokeStyle = '#1e1e28'; g.lineWidth = W * 0.02;
    g.beginPath(); g.moveTo(cx - W * 0.02, yb); g.lineTo(bb[0] - W * 0.03, bb[1] - H * 0.03); g.moveTo(cx + W * 0.03, yb); g.lineTo(bb[0] + W * 0.03, bb[1] - H * 0.02); g.stroke();
    const wheel = (x, y) => { g.lineWidth = W * 0.012; g.strokeStyle = '#1a1a1a'; g.beginPath(); g.ellipse(x, y, W * 0.085, H * 0.12, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(60,60,60,0.3)'; g.fill(); };
    wheel(W * 0.57, H * 0.83); wheel(W * 0.87, H * 0.83);
    g.strokeStyle = '#c9a044'; g.lineWidth = W * 0.013; g.beginPath();
    g.moveTo(W * 0.57, H * 0.83); g.lineTo(bb[0], bb[1]); g.lineTo(W * 0.66, H * 0.56); g.lineTo(W * 0.8, H * 0.54); g.lineTo(W * 0.87, H * 0.83);
    g.moveTo(W * 0.57, H * 0.83); g.lineTo(W * 0.66, H * 0.56); g.moveTo(W * 0.8, H * 0.54); g.lineTo(bb[0], bb[1]); g.moveTo(W * 0.8, H * 0.54); g.lineTo(W * 0.77, H * 0.42); g.lineTo(W * 0.7, H * 0.4); g.stroke();
    g.lineCap = 'butt';
  }
}

export class LoadingScreen {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.tune = false; this.tuneStopped = false;
    this.root = el('div', 'phase loading');
    this.buildLegal(); this.buildArts();
    this.setLegal(0); this.setArts(-1);
  }
  still(name, w, h) { try { return this.ctx.world?.renderStill?.(name, w, h) || null; } catch (e) { console.warn('renderStill', name, e); return null; } }
  // The SA logo lockup from logo.js, with our own class hooks on its two parts so the loading sheet can size them.
  saLogo(cls) {
    const box = el('div', cls); box.innerHTML = logo.saLogoHTML?.() || `<div class="sa-logo">${logo.grandTheftAutoSVG?.() || ''}<div class="sa-word">Sans Andreas</div></div>`;
    const svg = box.querySelector('svg'); if (svg) svg.classList.add('ld-gta');
    let word = box.querySelector('.sa-word'); if (!word) { word = el('div', 'sa-word', 'Sans Andreas'); (box.querySelector('.sa-logo') || box).appendChild(word); }
    word.classList.add('ld-sa');
    return box;
  }
  buildLegal() {
    this.legal = el('div', 'legal');
    const collage = el('div', 'collage'); this.legal.appendChild(collage);
    const rng = makeRng(11);
    PANELS.forEach((p) => {
      const d = el('div', 'panel'); d.style.left = p.x + 'cqw'; d.style.top = p.y + 'cqh'; d.style.width = p.w + 'cqw'; d.style.height = p.h + 'cqh';
      d.style.setProperty('--tilt', p.tilt + 'deg'); d.style.background = p.tint;
      const w = Math.round(p.w * PIC_W / 100 * 2), h = Math.round(p.h * PIC_H / 100 * 2);
      let c = p.still ? this.still(p.still, w, h) : null;
      if (!c) { c = canvas(w, h); const g = ctx2d(c); if (g) { paintBackground(g, w, h, p.tint, null, rng); if (p.scene) paintScene(g, w, h, p.tint, p.scene, rng); else paintFigure(g, w, h, p.tint, p.fig); } }
      d.appendChild(c); collage.appendChild(d);
    });
    this.legal.appendChild(this.saLogo('legal-logo'));
    const text = el('div', 'legal-text'); LEGAL_LINES.forEach((l) => text.appendChild(el('div', 'line', l))); this.legal.appendChild(text);
    this.root.appendChild(this.legal);
  }
  buildArts() {
    this.arts = el('div', 'arts'); const rng = makeRng(23);
    this.artEls = ARTS_DATA.map((a) => {
      const d = el('div', 'art'); d.style.background = a.tint;
      let c = this.still(a.still, PIC_W, PIC_H);
      if (!c) { c = canvas(PIC_W, PIC_H); const g = ctx2d(c); if (g) paintArt(g, PIC_W, PIC_H, a, rng); }
      d.appendChild(c); this.arts.appendChild(d); return d;
    });
    this.root.appendChild(this.arts);
    // the logo and the bar sit over the artworks: 180x10 at (50, 408) of 640x448, 2 px black border (engine constants)
    this.artUi = el('div', 'art-ui'); this.artUi.appendChild(this.saLogo('art-logo'));
    this.bar = el('div', 'bar'); this.fill = el('div', 'fill'); this.bar.appendChild(this.fill); this.artUi.appendChild(this.bar);
    this.root.appendChild(this.artUi);
    // fade-in start of each artwork
    this.artStart = []; let t = 0; ARTS_DATA.forEach((_, i) => { this.artStart.push(t); t += (i ? CROSS : ART_IN) + HOLDS[i]; });
  }
  mount() { this.ctx.root.appendChild(this.root); }
  setLegal(a) { this.legal.style.opacity = String(a); this.legal.style.visibility = a > 0 ? 'visible' : 'hidden'; }
  // at: seconds since the artworks began (negative before)
  setArts(at) {
    const on = at >= 0 && at < ARTS + FADE;
    const out = at >= ARTS ? clamp01(1 - (at - ARTS) / FADE) : 1;
    this.arts.style.visibility = this.artUi.style.visibility = on ? 'visible' : 'hidden';
    this.arts.style.opacity = String(on ? out : 0);
    this.artEls.forEach((d, i) => { const a = on ? clamp01((at - this.artStart[i]) / (i ? CROSS : ART_IN)) : 0; d.style.opacity = String(a); d.style.visibility = a > 0 ? 'visible' : 'hidden'; });
    const first = on ? clamp01(at / ART_IN) : 0;
    this.artUi.style.opacity = String(first * out);
    this.bar.style.visibility = at >= ART_IN && on ? 'visible' : 'hidden';   // no bar on the first artwork's fade-in
    this.fill.style.width = (100 * clamp01(at / ARTS)).toFixed(2) + '%';
  }
  update(dt) {
    this.t += dt; const t = this.t;
    const lt = t - T_LEGAL;
    this.setLegal(lt < 0 || lt >= LEGAL ? 0 : clamp01(Math.min(lt / LEGAL_FADE, (LEGAL - lt) / LEGAL_FADE)));
    const at = t - T_ARTS; this.setArts(at);
    if (at >= 0 && !this.tune) { this.tune = true; this.ctx.audio?.startLoadingTune?.(); }
    if (t >= T_FADE && !this.tuneStopped) { this.tuneStopped = true; this.ctx.audio?.stopLoadingTune?.(FADE); }
    return t >= LOADING_SECONDS;
  }
  unmount() { if (this.tune && !this.tuneStopped) this.ctx.audio?.stopLoadingTune?.(0.2); this.root.remove(); }
}
