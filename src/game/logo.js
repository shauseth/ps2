// Vector artwork for the disc: the Rockstar badge (R and star as filled paths), the "grand theft auto" letterforms
// redrawn as paths (Pricedown is not open-licensed), the SA logo lockup, HUD digits in the same family, the legal
// notice and the two badge-reveal masks. Everything is generated from point lists at runtime; the numbers were
// measured on the reference crops (crop-badge-games.png, crop-sa-logo.png, ref-intro/t0026.00.png, the HUD frames).
//
// Letterforms: every glyph is a blocky rounded polygon with slit counters (7 units wide) in a grid where the x-height
// is 84 units (the crop's 84 px). Bars are 21 thick, stems 28, letters 63 wide (t 69), fills 10 apart so the black
// edges of neighbours merge; a 12-unit black edge and an 8-unit light keyline surround the whole word (a double
// outline, as on the real logo). Contours are clockwise, holes counter-clockwise (nonzero fill), so where the r's
// dropped leg meets the h's ascender the fills union like the original.

const f = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Shoelace sign in a y-down system: positive = visually clockwise.
const area = (pts) => pts.reduce((a, [x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]; return a + x * ny - nx * y; }, 0);
// Polygon with rounded corners as a path: points [x, y, r?]; each corner's radius is clamped to half its shorter edge.
function rounded(pts, cw = true, dr = 6) {
  if ((area(pts) > 0) !== cw) pts = pts.slice().reverse();
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const [x, y, r = dr] = pts[i]; const [px, py] = pts[(i + n - 1) % n]; const [nx, ny] = pts[(i + 1) % n];
    const l1 = Math.hypot(px - x, py - y) || 1, l2 = Math.hypot(nx - x, ny - y) || 1, k = Math.min(r, l1 / 2, l2 / 2);
    const ax = x + (px - x) / l1 * k, ay = y + (py - y) / l1 * k, bx = x + (nx - x) / l2 * k, by = y + (ny - y) / l2 * k;
    d += `${i ? 'L' : 'M'}${f(ax)} ${f(ay)}Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
  }
  return d + 'Z';
}
const shift = (pts, dx, dy) => pts.map(([x, y, r]) => (r == null ? [x + dx, y + dy] : [x + dx, y + dy, r]));
const hole = ([x0, y0, x1, y1], dx = 0, dy = 0, r = 2) => rounded(shift([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]], dx, dy), false);
function starPath(cx, cy, R, r, n = 5) {
  const pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, k = i % 2 ? r : R; pts.push([cx + k * Math.cos(a), cy + k * Math.sin(a)]); }
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + 'Z';
}

// ---------------- Rockslab badge (viewBox 0 0 116 100): the R is mirrored, the parody's whole joke ----------------
// The R traced from crop-badge-games.png (badge 534x457 px there, scaled by 0.218): a heavy 12° italic, the stem's
// left edge from (41.7,17.9) to (33,58.6), the bowl bulging to x 77.3, an open oblique counter, the leg kicking out
// from a notch under the bowl to a vertical bar at x 61-72 with a slanted foot. Verified on ref-intro/t0002.00.png:
// x 28.6-66.5 %, y 17.9-59 % of the badge.
const R_PATH = 'M41.7 17.9L70.4 17.9C75.5 17.9 77.6 22.5 77.3 27.4C77.1 32.5 74.5 37.8 68 39.4C70.5 40.5 71.7 43 71.7 45.3L71.9 57Q72 59.7 70.5 59.7L67.8 59.7L61.2 58.2L61 48.5C61 45 60.2 43.7 58.4 43.4L46.9 43.3L43.2 58.6L33 58.6Z'
  + 'M51.3 25.8L50.2 36.8L58.4 36.8C62.5 36.6 65.5 34.5 66.3 31.5C67 28.5 66 25.8 63 25.8Z';
// The star: a fat five-point star (inner radius 0.47 R) centred over the leg's lower right; bbox x 62-93, y 48-78.
const STAR_PATH = starPath(77.5, 64.5, 16.5, 7.75);
export function rockstarBadgeSVG({ fill = '#e39516', cls = '' } = {}) {
  return `<svg viewBox="0 0 116 100" class="r-badge ${cls}" preserveAspectRatio="none"><rect class="r-badge-bg" x="0" y="0" width="116" height="100" rx="14.2" ry="14.3" fill="${fill}"/><path class="r-badge-r" transform="translate(116 0) scale(-1 1)" d="${R_PATH}" fill="#000" fill-rule="evenodd"/><path class="r-badge-star" d="${STAR_PATH}" fill="#fff"/></svg>`;
}

// ---------------- Badge reveals ----------------
// Both are <mask>s in objectBoundingBox units wrapped in a zero-size <svg>, so they work through CSS
// `mask: url(#id)` on the HTML box that holds the badge as well as through a mask attribute on SVG content. A CSS
// custom property `--reveal` (0..1) inherited from any ancestor of the defs drives them; put the defs and the badge
// under the same element that carries --reveal.
// Games: a front tilted ~15° (higher on the right, as in crop-anim.png) sweeping from above the top-left to below the
// bottom-right, the edge roughened by turbulence displacement and softened by a blur (the sprayed look).
export function wipeMaskSVG(id = 'r-wipe') {
  return `<svg class="r-mask-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><mask id="${id}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="-0.2" y="-0.2" width="1.4" height="1.4" style="mask-type:luminance">`
    + `<filter id="${id}-f" filterUnits="userSpaceOnUse" x="-0.4" y="-1.9" width="1.8" height="3.3" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="30 20" numOctaves="4" seed="11" result="n"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="n" scale="0.06" xChannelSelector="R" yChannelSelector="G"/>`
    + `<feGaussianBlur stdDeviation="0.012 0.018"/></filter>`
    // the front's left end runs from y -0.12 (nothing shows at 0) to 1.38 (the rounded lower-right corner clears at 1)
    + `<g class="reveal-wipe" style="transform:translateY(calc(var(--reveal, 0) * 1.5px))"><g filter="url(#${id}-f)"><rect x="-3" y="-7" width="8" height="6.885" fill="#fff" transform="rotate(-17)"/></g></g>`
    + `</mask></defs></svg>`;
}
// North: a fat marker drawing a zig-zag "Z" down the badge, four strokes alternating left→right and right→left, the
// last one ending at the lower left as in crop-anim.png at 8.0 s (the hard slanted stroke ends are what reads as the
// lightning tear). stroke-dashoffset on a pathLength="1" path exposes the strokes in order as --reveal grows.
export function tearMaskSVG(id = 'r-tear') {
  const k = Math.tan(30 * Math.PI / 180);        // the path is drawn through skewX(-30) so the butt ends lean
  const pts = [[-0.4, 0.12], [1.35, -0.04], [1.35, 0.3], [-0.4, 0.52], [-0.4, 0.72], [1.35, 0.56], [1.35, 0.86], [-0.4, 1.08]];
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x + k * y)} ${f(y)}`).join('');
  return `<svg class="r-mask-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><mask id="${id}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="-0.2" y="-0.2" width="1.4" height="1.4" style="mask-type:luminance">`
    + `<path class="reveal-tear" d="${d}" fill="none" stroke="#fff" stroke-width="0.5" stroke-linecap="butt" stroke-linejoin="bevel" pathLength="1" stroke-dasharray="1" transform="skewX(-30)" style="stroke-dashoffset:calc(1 - var(--reveal, 0))"/>`
    + `</mask></defs></svg>`;
}

// ---------------- Pricedown-manner letterforms ----------------
const GAP = 10;
// [x, y, r?] contours (c) and [x0, y0, x1, y1] holes (h) per glyph, x-top at y 0, baseline at y 84 (crop pixels).
const LC = {
  g: { w: 63, c: [[[0, 0, 9], [63, 0, 9], [63, 111, 8], [0, 111, 8], [0, 91, 2], [35, 91, 2], [35, 84, 2], [0, 84, 2]]], h: [[28, 21, 35, 63]] },   // low-slung: hook wraps under with a notch at the left
  r: { w: 63, c: [[[0, 0, 8], [63, 0, 14], [63, 86, 4], [66, 92, 4], [66, 110, 5], [60, 114, 4], [36, 104, 5], [35, 53, 2], [28, 53, 2], [28, 84, 3], [0, 84, 8]]], h: [[28, 22, 35, 31]] },   // the right leg drops below the baseline
  a: { w: 63, c: [[[0, 0, 10], [63, 0, 10], [63, 84, 3], [0, 84, 8], [0, 31, 13], [35, 31, 2], [35, 22, 2], [0, 22, 2]]], h: [[28, 53, 35, 63]] },   // flat top, notch under the bar, bowl at the bottom
  n: { w: 63, c: [[[0, 0, 8], [63, 0, 11], [63, 84, 3], [35, 84, 2], [35, 21, 2], [28, 21, 2], [28, 84, 2], [0, 84, 8]]] },
  d: { w: 63, c: [[[0, 0, 10], [35, 0, 2], [35, -24, 5], [63, -24, 5], [63, 84, 3], [0, 84, 8]]], h: [[28, 21, 35, 63]] },
  t: { w: 69, lb: -3, c: [[[7, 0, 6], [34, 0, 6], [34, 4, 1], [69, 4, 5], [69, 25, 2], [34, 25, 2], [34, 63, 2], [42, 63, 2], [42, 31, 2], [69, 31, 2], [69, 84, 10], [7, 84, 10], [7, 25, 1], [0, 25, 3], [0, 4, 3], [7, 4, 1]]] },   // crossbar overhangs left, right leg hangs from a notch
  h: { w: 63, c: [[[0, -24, 5], [28, -24, 5], [28, 0, 2], [63, 0, 11], [63, 84, 3], [35, 84, 2], [35, 21, 2], [28, 21, 2], [28, 84, 2], [0, 84, 8]]] },
  e: { w: 63, c: [[[0, 0, 10], [63, 0, 10], [63, 51, 2], [28, 51, 2], [28, 63, 2], [63, 63, 8], [63, 84, 3], [0, 84, 8]]], h: [[28, 21, 35, 31]] },
  f: { w: 63, c: [[[0, 0, 8], [63, 0, 7], [63, 19, 2], [28, 19, 2], [28, 25, 2], [63, 25, 2], [63, 46, 2], [28, 46, 2], [28, 84, 8], [0, 84, 8]], [[40, 58, 8], [65, 58, 8], [65, 94, 4], [62, 97, 3], [40, 87, 4]]], h: [[45, 66, 50, 84]] },   // the detached foot at the lower right
  u: { w: 63, c: [[[0, 0, 8], [28, 0, 8], [28, 63, 2], [35, 63, 2], [35, 0, 8], [63, 0, 8], [63, 84, 8], [0, 84, 8]]] },
  o: { w: 63, c: [[[0, 0, 12], [63, 0, 12], [63, 84, 10], [0, 84, 10]]], h: [[28, 21, 35, 62]] },
};
// Digits, $ and : on a 100-unit cap height, 72 wide (the HUD clock's 0.55x1.1 look), same construction.
const PD = {
  0: { w: 72, c: [[[0, 0, 18], [72, 0, 18], [72, 100, 18], [0, 100, 18]]], h: [[32, 24, 40, 76]] },
  1: { w: 60, c: [[[26, 0, 4], [56, 0, 6], [56, 100, 6], [26, 100, 6], [26, 38, 2], [0, 38, 4], [0, 18, 4]]] },
  2: { w: 72, c: [[[0, 0, 16], [72, 0, 16], [72, 62, 2], [30, 62, 2], [30, 76, 2], [72, 76, 2], [72, 100, 6], [0, 100, 6], [0, 38, 2], [42, 38, 2], [42, 24, 2], [0, 24, 2]]] },
  3: { w: 72, c: [[[0, 0, 16], [72, 0, 16], [72, 100, 16], [0, 100, 16], [0, 76, 2], [42, 76, 2], [42, 62, 2], [0, 62, 2], [0, 38, 2], [42, 38, 2], [42, 24, 2], [0, 24, 2]]] },
  4: { w: 72, c: [[[0, 0, 8], [72, 0, 8], [72, 100, 8], [42, 100, 6], [42, 62, 2], [0, 62, 6]]], h: [[30, 14, 42, 40]] },
  5: { w: 72, c: [[[0, 0, 8], [72, 0, 8], [72, 24, 2], [30, 24, 2], [30, 38, 2], [72, 38, 16], [72, 100, 16], [0, 100, 16], [0, 76, 2], [42, 76, 2], [42, 62, 2], [0, 62, 2]]] },
  6: { w: 72, c: [[[0, 0, 18], [72, 0, 18], [72, 24, 2], [30, 24, 2], [30, 38, 2], [72, 38, 16], [72, 100, 18], [0, 100, 18]]], h: [[32, 54, 40, 76]] },
  7: { w: 72, c: [[[0, 0, 8], [72, 0, 16], [72, 100, 8], [42, 100, 6], [42, 24, 2], [0, 24, 6]]] },
  8: { w: 72, c: [[[0, 0, 18], [72, 0, 18], [72, 100, 18], [0, 100, 18]]], h: [[32, 20, 40, 44], [32, 56, 40, 80]] },
  9: { w: 72, c: [[[0, 0, 18], [72, 0, 18], [72, 100, 18], [0, 100, 18], [0, 76, 2], [42, 76, 2], [42, 62, 2], [0, 62, 16]]], h: [[32, 22, 40, 46]] },
  $: { w: 72, c: [[[0, 0, 16], [72, 0, 16], [72, 22, 2], [30, 22, 2], [30, 40, 2], [72, 40, 16], [72, 100, 16], [0, 100, 16], [0, 78, 2], [42, 78, 2], [42, 60, 2], [0, 60, 16]], [[30, -12, 3], [42, -12, 3], [42, 2, 0], [30, 2, 0]], [[30, 98, 0], [42, 98, 0], [42, 112, 3], [30, 112, 3]]] },
  ':': { w: 40, c: [[[10, 24, 4], [34, 24, 4], [34, 46, 4], [10, 46, 4]], [[10, 60, 4], [34, 60, 4], [34, 82, 4], [10, 82, 4]]] },
};
// Path data for a run of glyphs from a table, letters `gap` apart; returns { d, w }.
function runPath(table, text, gap, x0 = 0, y0 = 0) {
  let x = x0, d = '';
  for (const ch of text) {
    const g = table[ch]; if (!g) continue;
    x += g.lb || 0;
    for (const c of g.c) d += rounded(shift(c, x, y0), true);
    for (const h of g.h || []) d += hole(h, x, y0);
    x += g.w + gap;
  }
  return { d, w: x - x0 - gap };
}

// The word block as laid out on the logo (crop pixels): "grand" at (113,86), "theft" at (165,202), "auto" at (151,304);
// the keyline box around it is x 93-549, y 42-408 (aspect 1.25, matching the frame's 35 x 37.2 % of the picture).
const BOX = { x: 93, y: 42, w: 456, h: 366 };
export function grandTheftAutoSVG() {
  ensureStyle();
  const s = 150 / BOX.h, mx = (200 - BOX.w * s) / 2;
  const d = runPath(LC, 'grand', GAP, 113, 86).d + runPath(LC, 'theft', GAP, 165, 202).d + runPath(LC, 'donut', GAP, 123, 304).d;
  return `<svg viewBox="0 0 200 150" class="gta-word" overflow="visible"><g transform="translate(${f(mx - BOX.x * s)} ${f(-BOX.y * s)}) scale(${f(s)})" stroke-linejoin="round">`
    + `<path class="gta-key" d="${d}" fill="none" stroke="#fff" stroke-width="40"/><path class="gta-edge" d="${d}" fill="none" stroke="#141414" stroke-width="24"/><path class="gta-fill" d="${d}" fill="#fff"/></g></svg>`;
}
// Word block over "San Andreas". Measured on ref-intro/t0026.00.png: the logo box is x 29.2-73.3 %, y 24.0-74.5 % of
// the picture (aspect 1.164); inside it the GTA word takes x 10.7-90 %, y 0-73.7 %, the blackletter y 66.5-100 %
// (its caps rise into "auto"). The letters fill 93.5 % of the svg's width, hence the wider svg box.
export function saLogoHTML() {
  ensureStyle();
  return `<div class="sa-logo">${grandTheftAutoSVG()}<div class="sa-word">Sans Andreas</div></div>`;
}
// Digits, $ and : as inline SVG paths (fill currentColor, black edge), everything else as text.
export function pricedownText(text) {
  ensureStyle();
  let out = '', run = '';
  const flush = () => { if (!run) return; const { d, w } = runPath(PD, run, 8); out += `<svg class="pd" viewBox="0 -16 ${w} 132" preserveAspectRatio="xMinYMid meet"><path d="${d}"/></svg>`; run = ''; };
  for (const ch of String(text)) { if (PD[ch]) run += ch; else { flush(); out += esc(ch); } }
  flush();
  return `<span class="pricedown">${out}</span>`;
}
export const LEGAL_PARODY = [
  '© 2026 Shauseth. Rockslab Games, Rockslab North, the R* logo, Grand Theft Donut and the Grand',
  'Theft Donut logo are trademarks of nobody at all, registered nowhere, and were drawn in a browser',
  'one evening. Any resemblance to a real publisher is a tribute; any resemblance to a real donut',
  'is a coincidence. Note: The content of this videogame is purely fictional, and is not intended to',
  'represent any actual person, business, organization or bakery. No cars were stolen in the making',
  'of this website. No memory cards were harmed. The makers of this videogame do not in any way',
  'endorse, condone or encourage this kind of behavior, mostly because they are one person, and',
  'that person has to be at work in the morning. Please insert disc 2. There is no disc 2.',
];
export function legalText() {
  return LEGAL_PARODY.join(' ');
}

// Default layout of the lockup and the digit runs, injected once at zero specificity (:where) so the screens that
// size these pieces themselves always win. Pirata One "San Andreas" at 100 px: ink 431 wide, ascent 77, descent 3.
// On the frame the blackletter's ink spans 26 % of the logo height and 93 % of its width, so 28 cqw of the logo
// width squeezed to 0.77, with a black text-stroke (12 of the crop's 160 px em out from the glyph). The blackletter's
// thin white keyline is left out: the screens restyle .sa-word with their own stroke widths, and a ::before/text-shadow
// keyline cannot follow those.
const STYLE = `:where(.sa-logo){position:relative;aspect-ratio:1.164;container-type:inline-size}
:where(.sa-logo)>:where(.gta-word){position:absolute;left:7.95%;top:0;width:84.9%;height:auto;aspect-ratio:4/3;display:block;overflow:visible}
:where(.sa-logo)>:where(.sa-word){position:absolute;left:-50%;right:-50%;top:57.4cqw;text-align:center;white-space:nowrap;font:400 28cqw/1 var(--gta-black,"Pirata One",serif);color:#fff;transform:scaleX(0.77);transform-origin:50% 0;paint-order:stroke fill;-webkit-text-stroke:0.15em #141414}
:where(.pricedown){white-space:nowrap}
:where(.pricedown)>:where(svg.pd){display:inline-block;height:1.32em;width:auto;vertical-align:-0.16em;overflow:visible;fill:currentColor;stroke:#000;stroke-width:10;stroke-linejoin:round;paint-order:stroke fill}`;
let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.id = 'gta-logo-style'; s.textContent = STYLE; document.head.appendChild(s);
}
