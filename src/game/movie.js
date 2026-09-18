// The intro movie (one FMV on the disc): the Rockstar Games and Rockstar North badges, the two text cards, the SA logo
// with its flash, then the fifteen credit cards. Times are seconds since mount as measured on the captures
// (research/gta-sa-launch.md §2-3 and §9); every style is set from update(dt), never from CSS animations, so captures
// are deterministic. Nothing is shipped: badges and letterforms come from logo.js, the strip stills from the world
// (world.renderStill) with a tinted gradient stand-in when a still is not available.
import { el } from '../ui/overlay.js';
import * as logo from './logo.js';
import { makeRng } from '../rng.js';

export const MOVIE_SECONDS = 102.4;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const ramp = (t, t0, dur) => clamp01((t - t0) / dur);     // 0 before t0, 1 after t0 + dur
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// Timeline (s). Games card: wipe 0.2-1.15, star + wordmark at 1.2, fade 4.25-4.75. North card: tear 6.4-8.2, wordmark
// 8.8-9.4 with the star turning white, the thin R outline pops at 9.4, the white elements fade 12.9-13.5, the blue stays
// until the cut at 13.7. Text cards 13.8/17.4 and 18.4/21.8. Flash 23.3 (≈ 0.1 s), glow gone by 26.0, logo black by 27.9.
// Credits from 28.2, period 4.96, each card 4.5 s on (fading over its last 0.4 s), the producer cards 3.9 s.
const T = {
  gamesIn: 0.2, gamesDrawn: 1.15, gamesWord: 1.2, gamesWordIn: 0.3, gamesOut: 4.25, gamesOutDur: 0.5,
  northIn: 6.4, northDrawn: 8.2, northWord: 8.8, northWordIn: 0.6, northPop: 9.4, northWhiteOut: 12.9, northWhiteOutDur: 0.6, northCut: 13.7,
  presentsIn: 13.8, presentsInDur: 0.8, presentsOut: 17.4, presentsOutDur: 0.8,
  northGameIn: 18.4, northGameInDur: 1.0, northGameOut: 21.8, northGameOutDur: 1.4,
  flash: 23.3, flashHold: 0.05, flashDecay: 0.06, glowFrom: 23.4, glowDur: 2.6, saDim: 26.0, saBlack: 27.9,
  credits: 28.2, period: 4.96, cardOn: 4.5, cardOut: 0.4, producerOn: 3.9, stagger: 0.3, slide: 0.25,
};

// Credit cards (research §3, names verbatim). Strips are quads in % of the picture [x0, x1, yTopLeft, yTopRight,
// yBottomLeft, yBottomRight] measured on the hold frames; `order` is the arrival order of the strips; text blocks sit
// at (x, y) with x the aligned edge ('left' by default, 'right', or 'center' for the producer cards).
const CARDS = [
  { still: 'lspdNight', order: [1, 3, 0, 2], strips: [[13, 25.5, 25, 24, 67, 63], [27.5, 38, 30, 29, 56, 58], [40, 51, 22, 23.5, 56, 60], [52, 60, 25, 26, 48, 51]],
    text: [{ x: 61, y: 40.5, title: 'art director', names: ['Duncan Donut'] }, { x: 43.5, y: 60, title: 'technical director', names: ['Holly Sprinkles'] }] },
  { still: 'bmxPalms', order: [2, 0, 3, 1], strips: [[20, 29, 27, 27, 54, 53], [30, 47, 27, 21, 52, 65], [48, 60, 31, 30, 64, 66], [62, 76, 47, 33, 74, 57]],
    text: [{ x: 51.5, y: 19, title: 'technical director', names: ['Glaze Anatomy'] }, { x: 59.5, y: 67, align: 'right', title: 'senior programmer', names: ['Boston Cream'] }] },
  { still: 'bridge', order: [1, 3, 0, 2], strips: [[39, 46, 39, 39, 62, 63], [47, 61, 34, 34, 64, 67], [62, 73.5, 25.5, 26, 80, 81], [75, 86.5, 31.5, 33, 73, 63]],
    text: [{ x: 62.5, y: 13, align: 'right', title: 'sans fierro', names: ['Tim Bits', 'Maple Dipp', 'Chuck Roll'] },
      { x: 37, y: 39.5, align: 'right', title: 'los sandos', names: ['Jam Filledsworth', 'Crully Sugar', 'Frank Fritter', 'Ollie Old-Fashioned'] },
      { x: 60, y: 70, align: 'right', title: 'crumbside', names: ['Cinna Mon', 'Bea Claw'] }] },
  { still: 'casinoInterior', order: [2, 0, 3, 1], strips: [[13.5, 23.5, 28, 28.5, 75, 69], [23.5, 38, 24, 25, 81, 80], [38, 50, 23, 26, 67, 70], [50, 59, 18.5, 17.5, 39, 38.5]],
    text: [{ x: 61, y: 15.5, title: 'las vendors', names: ['Krispy Kream', 'Choco Late', 'Honey Dipp', 'Apple Frittersby'] },
      { x: 51.5, y: 41.5, title: 'interior artists', names: ['Jelly Rolle', 'Sourdough Sam', 'Ring Wallace', 'Powder Sugarman', 'Hole E. Moly'] },
      { x: 40.5, y: 73, title: 'front end design', names: ['Twist O. Lemon'] }] },
  { still: 'orangeCar', order: [1, 3, 0, 2], strips: [[13, 24, 25, 23, 70, 73], [25, 36, 21, 20, 74, 74], [37, 50, 27, 27, 75, 74], [51, 60, 24, 26, 50, 49]],
    text: [{ x: 61.5, y: 30, title: 'vehicles', names: ['Dutch Crumb', 'Long John Silver', 'Cake Batterman'] },
      { x: 52.5, y: 51, title: 'character artists', names: ['Custard Lloyd', 'Icing Bell', 'Bear Clawson', 'Sprinkle Dinkles', 'Bavarian Cream'] }] },
  { still: 'jet', order: [2, 0, 3, 1], strips: [[40, 49.5, 32, 30, 70, 68], [50, 61, 30, 28, 67, 65], [62, 77, 44, 36, 72, 72], [77, 85, 45, 38, 70, 70]],
    text: [{ x: 38.5, y: 29.5, align: 'right', title: 'animation', names: ['Nutmeg Nelson', 'Toast McKay', 'Baker Dozen', 'Fry Daddy', 'Yeast Wilson', 'Proofed Peters'] }] },
  { still: 'shopStreet', order: [1, 3, 0, 2], strips: [[14, 23, 37, 28, 65, 60], [25, 34, 33, 45, 63, 72], [36, 48, 26, 25, 77, 74], [49, 58, 24, 25, 60, 58]],
    text: [{ x: 60, y: 31, title: 'audio', names: ['Dough Hunter', 'Glazed Grant', 'Crumb Marshall', 'Filling Jones'] },
      { x: 52, y: 61.5, title: 'audio coders', names: ['Sesame Street', 'Pink Frostington'] }] },
  { still: 'sunsetFigure', order: [2, 0, 3, 1], strips: [[40.5, 51.5, 28.5, 28.5, 73.5, 73.5], [52.5, 62, 26, 29, 69, 68], [62.5, 73.5, 25.5, 25, 69, 66], [74.5, 85, 36, 36, 64, 62]],
    text: [{ x: 38.5, y: 27, align: 'right', title: 'a.i. code', names: ['Vanilla Bean', 'Ganache Garcia', 'Torus Taylor'] },
      { x: 38.5, y: 47, align: 'right', title: 'game code', names: ['Ring Leader', 'Dip Stickley', 'Coffee Blackwood', 'Double Double', 'Timmy Horton'] }] },
  { still: 'freeway', order: [1, 3, 0, 2], strips: [[13, 23, 26.5, 25, 56.5, 56.5], [23.5, 34, 19, 19, 53, 59], [34.5, 47.5, 17, 17, 64, 60], [48, 59, 19.5, 20, 54, 54]],
    text: [{ x: 60.5, y: 31, title: 'tool coders', names: ['Krul Ler', 'Rolly Polly'] },
      { x: 47.5, y: 56, title: 'visual effects code', names: ['Puff Daddy', 'Eclair Bowie', 'Cronut Chan', 'Fritter Finn'] }] },
  { still: 'ferris', order: [2, 0, 3, 1], strips: [[23, 32, 39, 39, 64, 65], [32.5, 45, 32, 22, 75, 72], [46, 58, 27, 26, 60, 60], [59, 73, 30, 32, 56, 54.5]],
    text: [{ x: 11, y: 17.5, title: 'lead level design', names: ['Munch Kin'] },
      { x: 50.5, y: 61.5, title: 'senior level design', names: ['Bun Jovi', 'Sugar Ray Leonard', 'Duncan Donut', 'Holly Sprinkles'] }] },
  { still: 'forestRoad', order: [1, 3, 0, 2], strips: [[12.5, 20.5, 44, 39, 64.5, 65], [21, 32, 25, 27, 71.5, 72], [33, 45.5, 29, 29, 72, 73], [46, 55, 24, 23, 70, 70]],
    text: [{ x: 57, y: 23.5, title: 'level design', names: ['Glaze Anatomy', 'Boston Cream', 'Tim Bits', 'Maple Dipp', 'Chuck Roll', 'Jam Filledsworth', 'Crully Sugar', 'Frank Fritter', 'Ollie Old-Fashioned', 'Cinna Mon', 'Bea Claw', 'Krispy Kream'] }] },
  { still: 'desert', order: [2, 0, 3, 1], strips: [[44, 53.5, 26.5, 26.5, 67.5, 56], [54, 66, 26, 19, 61, 61.5], [67, 76.5, 23.5, 23.5, 58.5, 58], [77, 87, 31, 32, 61, 55.5]],
    text: [{ x: 42, y: 22, align: 'right', title: 'test', names: ['Choco Late', 'Honey Dipp', 'Apple Frittersby', 'Jelly Rolle', 'Sourdough Sam', 'Ring Wallace', 'Powder Sugarman', 'Hole E. Moly', 'Twist O. Lemon'] },
      { x: 42, y: 67.5, align: 'right', title: 'audio test', names: ['Dutch Crumb'] },
      { x: 53, y: 63.5, title: 'associate producer', names: ['Long John Silver'] }] },
  { still: 'casinoNeon', order: [1, 3, 0, 2], strips: [[39, 45.5, 28.5, 28, 52, 53], [46.5, 62, 22, 22.5, 75, 75], [62.5, 77, 25, 24.5, 67, 67], [77.5, 83.5, 37, 32.5, 64, 64.5]],
    text: [{ x: 37.5, y: 35, align: 'right', title: 'written by', names: ['Cake Batterman', 'Custard Lloyd', 'Icing Bell'] },
      { x: 45, y: 58, align: 'right', title: 'cinematic', names: ['Bear Clawson', 'Sprinkle Dinkles', 'Bavarian Cream'] }] },
  { producer: true, text: [{ x: 50, y: 45, align: 'center', title: 'producer', names: ['Nutmeg Nelson'] }] },
  { producer: true, text: [{ x: 50, y: 45, align: 'center', title: 'executive producer', names: ['Toast McKay'] }] },
];

// Stand-in stills: a sky/ground gradient in the hue of the real shot (mean colours measured on the frames), a sun or
// glow, a few silhouettes. Deterministic (seeded per name) so captures repeat.
const TINTS = {
  lspdNight: ['#1c1e48', '#5a3c2e', '#7a5a40', '#4a78ff', 0.25], bmxPalms: ['#5cc4c4', '#a8b890', '#6a6040', '#fff2c0', 0.35],
  bridge: ['#f0b860', '#c06a34', '#7a4020', '#ffe0a0', 0.4], casinoInterior: ['#c0a068', '#785828', '#40280e', '#ffe8a0', 0.3],
  orangeCar: ['#d8b48a', '#b87850', '#6a3c20', '#ffd8a0', 0.5], jet: ['#8ed8ec', '#bce8f0', '#a8d8e0', '#ffffff', 0.2],
  shopStreet: ['#8ab080', '#a8a898', '#5c5c50', '#d8f0c0', 0.2], sunsetFigure: ['#d09848', '#8c6620', '#3c2810', '#ffd070', 0.55],
  freeway: ['#e8d888', '#d4c470', '#a09050', '#fff8c0', 0.3], ferris: ['#b4bccc', '#98989c', '#706868', '#e0e8f0', 0.25],
  forestRoad: ['#c8a868', '#8a6a44', '#503820', '#f0d090', 0.3], desert: ['#aab4c4', '#c49480', '#a06040', '#f8e8d0', 0.35],
  casinoNeon: ['#b84c80', '#78305a', '#401830', '#ff80c0', 0.45],
};
function fallbackStill(name, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (!g) return c;
  const [top, mid, ground, glow, sunY] = TINTS[name] || ['#808080', '#606060', '#404040', '#ffffff', 0.4];
  const rng = makeRng(name.length * 131 + name.charCodeAt(0));
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, top); sky.addColorStop(0.62, mid); sky.addColorStop(0.64, ground); sky.addColorStop(1, ground);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sx = w * rng.range(0.3, 0.7), sy = h * sunY, sr = w * 0.22;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, sr); sun.addColorStop(0, glow); sun.addColorStop(0.3, glow + '99'); sun.addColorStop(1, glow + '00');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.42)';
  for (let i = 0; i < 6; i++) { const bw = w * rng.range(0.05, 0.16), bh = h * rng.range(0.08, 0.3); g.fillRect(w * rng.range(-0.05, 0.95), h * 0.63 - bh, bw, bh); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.78, w, h * 0.22);
  return c;
}
function stillURL(still) {
  if (!still) return null;
  if (typeof still.toDataURL === 'function') { try { return still.toDataURL(); } catch (e) { return null; } }
  if (typeof still.src === 'string') return still.src;
  return null;
}

// Fallback reveals (used when logo.js has no masks). Polygons in % of the badge box.
// Games: the region 0.55x + 0.835y <= d (a front sweeping from the top-left corner to the lower right; the edge is
// steeper than the diagonal on crop-anim.png) with a jittered, sprayed edge.
function wipePolygon(k, jit) {
  // the front jumps to a quarter of the way in the first 0.1 s, then advances evenly (frames 0.2-1.1 of ref-intro-fine)
  const d = k < 0.105 ? 0.1 + 2.67 * k : 0.38 + 1.05 * (k - 0.105), nx = 0.55, ny = 0.835; const pts = [];
  for (let i = 0; i < jit.length; i++) { const s = -1.6 + 3.6 * i / (jit.length - 1); const j = jit[i] * 0.03; pts.push(`${((nx * (d + j) + ny * s) * 100).toFixed(1)}% ${((ny * (d + j) - nx * s) * 100).toFixed(1)}%`); }
  pts.push('-300% -300%');
  return `polygon(${pts.join(',')})`;
}
// North: the region above a lightning "Z" edge that sweeps from the top to the bottom (research §2, crop-anim.png):
// a flat band first, then the edge leans (deeper on the left) and grows a tooth right of the R.
const ZIG = [[-0.6, 0.3], [0, 0.3], [0.25, 0.15], [0.5, 0.0], [0.6, 0.2], [0.7, 0.22], [0.8, 0.02], [1, -0.1], [1.6, -0.12]];
function tearPolygon(k) {
  const base = -0.05 + 1.25 * k, w = Math.min(1, 2.5 * k);
  const pts = ZIG.map(([x, o]) => `${(x * 100).toFixed(1)}% ${((base + o * w) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(',')},300% -300%,-300% -300%)`;
}

export class MovieScreen {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.stills = {};
    this.root = el('div', 'phase movie');
    this.games = this.badgeCard('games', '#e39516', 'rockslab games');
    this.north = this.badgeCard('north', '#2a2e8f', 'rockslab north');
    this.presents = el('div', 'mv-text', 'Rockslab Games Presents');
    this.northGame = el('div', 'mv-text', 'a Rockslab North Game');
    this.flash = el('div', 'mv-flash');
    this.sa = el('div', 'mv-sa'); this.sa.innerHTML = logo.saLogoHTML?.() || '<div class="sa-logo"><div class="sa-word">Sans Andreas</div></div>';
    this.credits = el('div', 'mv-credits');
    for (const e of [this.games.card, this.north.card, this.presents, this.northGame, this.flash, this.sa, this.credits]) { e.hidden = true; this.root.appendChild(e); }
    this.flash.hidden = false; this.flash.style.opacity = '0';
    this.jit = (() => { const r = makeRng(41); return Array.from({ length: 48 }, () => r.range(-1, 1)); })();
    this.live = null; this.cardIndex = -1;
  }
  // A badge card: the logo.js badge under its reveal mask (or our polygon clip), the wordmark with the ® beside the corner.
  badgeCard(name, fill, word) {
    const card = el('div', `mv-card mv-badge ${name}`);
    const mask = name === 'games' ? logo.wipeMaskSVG?.(`mv-${name}-reveal`) : logo.tearMaskSVG?.(`mv-${name}-reveal`);
    if (mask) { const defs = el('div', 'mv-defs'); defs.innerHTML = mask; card.appendChild(defs); }
    const wrap = el('div', 'badge-wrap'); wrap.innerHTML = logo.rockstarBadgeSVG({ fill, cls: name });
    if (mask) { const url = `url(#mv-${name}-reveal)`; if (/<mask[\s>]/.test(mask)) { wrap.style.setProperty('-webkit-mask', url); wrap.style.setProperty('mask', url); } else wrap.style.clipPath = url; }
    card.appendChild(wrap);
    const w = el('div', 'wordmark', word); const reg = el('span', 'reg', '®'); card.append(w, reg);
    return { card, wrap, word: w, reg, masked: !!mask };
  }
  mount() { this.ctx.root.appendChild(this.root); this.ctx.audio?.startMovie?.(); }
  unmount() { this.ctx.audio?.stopMovie?.(); this.root.remove(); }
  press(b) { if (b === 'start' || b === 'cross') return this.skip(); }
  skip() { this.t = MOVIE_SECONDS; return true; }
  update(dt) {
    this.t += dt; const t = this.t;
    this.badges(t); this.textCards(t); this.saLogo(t); this.creditsAt(t);
    return t >= MOVIE_SECONDS;
  }
  // Reveal progress k onto a badge card: the logo mask through --reveal, else our polygon clip.
  reveal(b, k, poly) { b.card.style.setProperty('--reveal', k.toFixed(3)); if (!b.masked) b.wrap.style.clipPath = poly(k); }
  badges(t) {
    const g = this.games, n = this.north;
    const gOn = t >= T.gamesIn && t < T.gamesOut + T.gamesOutDur;
    g.card.hidden = !gOn;
    if (gOn) {
      this.reveal(g, ramp(t, T.gamesIn, T.gamesDrawn - T.gamesIn), (k) => wipePolygon(k, this.jit));
      const w = ramp(t, T.gamesWord, T.gamesWordIn);            // star and wordmark appear together
      g.word.style.opacity = g.reg.style.opacity = w.toFixed(3);
      g.card.style.setProperty('--star', `rgb(${Math.round(255 * w)},${Math.round(255 * w)},${Math.round(255 * w)})`);
      g.card.style.opacity = (1 - ramp(t, T.gamesOut, T.gamesOutDur)).toFixed(3);
    }
    const nOn = t >= T.northIn && t < T.northCut;
    n.card.hidden = !nOn;
    if (nOn) {
      this.reveal(n, ramp(t, T.northIn, T.northDrawn - T.northIn), tearPolygon);
      const white = 1 - ramp(t, T.northWhiteOut, T.northWhiteOutDur);
      const w = ramp(t, T.northWord, T.northWordIn) * white;
      n.word.style.opacity = n.reg.style.opacity = w.toFixed(3);
      const s = Math.round(255 * w);
      n.card.style.setProperty('--star', `rgb(${s},${s},${s})`);
      n.card.style.setProperty('--r-stroke', t >= T.northPop && white > 0.5 ? '3' : '0');   // thin keyline (1.5 of 116 units shows outside the fill) pops in, drops with the whites
      n.card.style.opacity = '1';
    }
  }
  textCards(t) {
    const fade = (e, tIn, dIn, tOut, dOut) => {
      const on = t >= tIn && t < tOut + dOut; e.hidden = !on;
      if (on) e.style.opacity = (ramp(t, tIn, dIn) * (1 - ramp(t, tOut, dOut))).toFixed(3);
    };
    fade(this.presents, T.presentsIn, T.presentsInDur, T.presentsOut, T.presentsOutDur);
    fade(this.northGame, T.northGameIn, T.northGameInDur, T.northGameOut, T.northGameOutDur);
  }
  saLogo(t) {
    // Full-frame white flash under the logo: a 50 ms hold, then gone within two frames (13 % left at 23.4 on the capture).
    const f = t < T.flash ? 0 : t < T.flash + T.flashHold ? 0.93 : 0.93 * (1 - ramp(t, T.flash + T.flashHold, T.flashDecay));
    this.flash.style.opacity = f.toFixed(3);
    const on = t >= T.flash && t < T.saBlack; this.sa.hidden = !on;
    if (!on) return;
    const glow = 1 - ramp(t, T.glowFrom, T.glowDur);          // strong white halo decaying over 2.6 s
    const dim = 1 - ramp(t, T.saDim, T.saBlack - T.saDim);    // then the plain logo sinks to black
    this.sa.style.opacity = dim.toFixed(3);
    this.sa.style.filter = glow > 0.01 ? `drop-shadow(0 0 ${(0.3 + 0.4 * glow).toFixed(2)}cqh rgba(255,255,255,${(0.9 * glow).toFixed(2)})) drop-shadow(0 0 ${(1.8 * glow).toFixed(2)}cqh rgba(255,255,255,${(0.6 * glow).toFixed(2)}))` : 'none';
  }
  // --- credits montage ---
  still(name) {
    if (name in this.stills) return this.stills[name];
    let url = null;
    try { url = stillURL(this.ctx.world?.renderStill?.(name, 320, 224)); } catch (e) { url = null; }
    if (!url || url.length < 64) url = fallbackStill(name, 320, 224).toDataURL();   // null, or an empty canvas's "data:,"
    this.stills[name] = url; return url;
  }
  buildCard(i) {
    const data = CARDS[i]; const root = el('div', 'mv-credit-card'); const strips = []; const texts = [];
    if (data.strips) {
      const url = this.still(data.still);
      const xs = data.strips.flatMap((s) => [s[0], s[1]]), ys = data.strips.flatMap((s) => s.slice(2));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      data.strips.forEach((s, j) => {
        const [sx0, sx1, tl, tr, bl, br] = s;
        const strip = el('div', 'strip'); const cut = el('div', 'cut'); const pic = el('div', 'pic');
        cut.style.clipPath = `polygon(${sx0}% ${tl}%,${sx1}% ${tr}%,${sx1}% ${br}%,${sx0}% ${bl}%)`;
        pic.style.cssText = `left:${x0}cqw;top:${y0}cqh;width:${x1 - x0}cqw;height:${y1 - y0}cqh;background-image:url("${url}")`;
        // the picture inside turns with its strip (tilt from the top edge; picture units 4:3)
        const tilt = Math.atan2((tr - tl) * 3, (sx1 - sx0) * 4) * 180 / Math.PI;
        const cx = (sx0 + sx1) / 2 - x0, cy = (tl + tr + bl + br) / 4 - y0;
        pic.style.transformOrigin = `${cx}cqw ${cy}cqh`; pic.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
        cut.appendChild(pic); strip.appendChild(cut); root.appendChild(strip);
        strips.push({ el: strip, at: 0.05 + T.stagger * data.order.indexOf(j) });
      });
    }
    const textAt = data.producer ? 0.05 : 0.05 + T.stagger * data.strips.length;
    for (const b of data.text) {
      const block = el('div', `credit ${b.align || 'left'}`);
      block.style.top = `${b.y}cqh`;
      if (b.align === 'right') block.style.right = `${100 - b.x}cqw`; else block.style.left = `${b.x}cqw`;
      block.appendChild(el('div', 'ctitle', b.title));
      for (const nm of b.names) block.appendChild(el('div', 'cname', nm));
      root.appendChild(block); texts.push({ el: block, at: textAt });
    }
    this.credits.appendChild(root);
    return { root, strips, texts, on: data.producer ? T.producerOn : T.cardOn };
  }
  creditsAt(t) {
    const u0 = t - T.credits;
    const i = u0 < 0 ? -1 : Math.min(CARDS.length - 1, Math.floor(u0 / T.period));
    if (i !== this.cardIndex) { this.live?.root.remove(); this.live = null; this.cardIndex = i; if (i >= 0) this.live = this.buildCard(i); }
    this.credits.hidden = !this.live;
    if (!this.live) return;
    const c = this.live, u = u0 - i * T.period;
    if (u >= c.on) { c.root.style.opacity = '0'; return; }
    c.root.style.opacity = (1 - ramp(u, c.on - T.cardOut, T.cardOut)).toFixed(3);
    for (const s of c.strips) {
      const k = ramp(u, s.at, T.slide); s.el.hidden = k <= 0;
      if (k > 0) { s.el.style.transform = `translateX(${(45 * (1 - easeOut(k))).toFixed(2)}cqw)`; s.el.style.opacity = ramp(u, s.at, 0.1).toFixed(3); }
    }
    for (const x of c.texts) { const k = ramp(u, x.at, 0.15); x.el.hidden = k <= 0; if (k > 0) x.el.style.opacity = k.toFixed(3); }
  }
}
