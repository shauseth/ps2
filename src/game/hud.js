// The SA HUD as DOM: radar, clock, money, health bar, weapon (fist), zone and vehicle names, help box, subtitles /
// objectives, cutscene captions, mission title, letterbox bars. Geometry is the engine's 640x448 layout from
// research/gta-sa-launch.md §6, checked against the real-hardware frames (ref-hVj4/t0205.50, ref-hVj/t0002, t0014):
// x/6.4 → cqw, y/4.48 → cqh in css/hud.css. Every timer runs from update(dt) so captures are deterministic.
import { el, clear } from '../ui/overlay.js';
import { BUTTON, svg } from '../ui/icons.js';
import * as logo from './logo.js';

const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const RADAR_RANGE = 180;       // metres from the centre to the radar's edge on foot (CRadar RADAR_MIN_RANGE)
const RX = 47, RY = 38;        // radar ellipse radii in game pixels (centre 87,382; rim 4 px around it)
const S = 3;                   // radar canvas oversampling
const MAP_PPM = 1;             // the pre-rendered map: one canvas pixel per metre
const RADAR = { ground: '#8d8c5a', road: '#d8d8cc', block: '#66703f', rail: '#4a3a2a' };
const BLIP = { bike: '#4cd8ec', marker: '#b4191d', cj: '#36682c', default: '#f0f0f0' };
const ARROW_ROT = { up: 0, right: 90, down: 180, left: 270 };
const arrowSVG = (dir) => `<svg viewBox="0 0 20 20" class="hud-arrow"><path d="M10 2.5 L18 11 H13.5 V17.5 H6.5 V11 H2 Z" fill="#fff" stroke="#000" stroke-width="1.8" stroke-linejoin="round" transform="rotate(${ARROW_ROT[dir]} 10 10)"/></svg>`;
// The unarmed weapon slot: a white fist on the dark rounded plate (visible plate ≈ 40x40 of the 47x58 cell).
const FIST = `<svg viewBox="0 0 40 40" class="fist-svg"><rect x="0.5" y="0.5" width="39" height="39" rx="5" fill="rgba(0,0,0,0.62)"/><g fill="#fff" stroke="#151515" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M7 25 C6.5 19 9.5 14.5 15 12.5 C16 8.5 21.5 8 23 11.5 C24.5 7.5 30 7.5 31 11.5 C33 9.5 37.5 11 37 15.5 C38 20 37.5 26 34 30 C31 34 25 35.5 19 35 C13 34.5 8 31 7 25 Z"/><path d="M23 11.5 L23.5 20" fill="none" stroke-width="1.2"/><path d="M31 11.5 L31 19" fill="none" stroke-width="1.2"/><path d="M15 12.5 L16 19.5" fill="none" stroke-width="1.2"/><path d="M7 25 C9 21 15 21.5 21 23.5 C26 25 26.5 30 21 30.5 C16 31 11 30 8.5 28.5" /><path d="M11 24.5 C15 24 19 25.5 21.5 27" fill="none" stroke-width="1.1"/></g></svg>`;

// "{triangle}" and friends inside help text become button glyphs (the OSD's discs) or d-pad arrows.
function helpNodes(text) {
  const frag = el('span', 'help-text'); const re = /\{(\w+)\}/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const k = m[1].toLowerCase();
    if (BUTTON[k]) frag.appendChild(svg(BUTTON[k])); else if (k in ARROW_ROT) frag.appendChild(svg(arrowSVG(k))); else frag.appendChild(document.createTextNode(m[0]));
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}
// Pricedown digits from logo.js; the stub returns plain text, which gets the larger text size instead of svg cells.
function priced(node, text) { const html = logo.pricedownText?.(text) ?? text; node.innerHTML = html; node.classList.toggle('txt', !/<svg/i.test(html)); }
// Roads may come as point arrays (optionally with .width) or as { pts | points | path, width }.
function roadPts(r) { const pts = Array.isArray(r) ? r : (r?.pts || r?.points || r?.path || []); const w = (Array.isArray(r) ? r.width : r?.width ?? r?.w) || 8; return { pts, w }; }

export class Hud {
  constructor(game) {
    this.game = game; this.root = el('div', 'hud');
    this.lbTop = el('div', 'lb-top'); this.lbBottom = el('div', 'lb-bottom'); this.lbTop.hidden = this.lbBottom.hidden = true;
    this.cap = el('div', 'caption large'); this.cap.hidden = true;
    this.sub = el('div', 'sub play'); this.sub.hidden = true; this.subTime = Infinity;
    this.helpEl = el('div', 'help'); this.helpEl.hidden = true;
    // gameplay block (fades as one): fist, clock, health, money, radar
    this.main = el('div', 'main'); this.main.hidden = true; this.hudAlpha = 0; this.hudTarget = 0; this.hudFade = 0;
    this.fist = el('div', 'fist'); this.fist.innerHTML = FIST;
    this.clockEl = el('div', 'clock digits'); this.moneyEl = el('div', 'money digits');
    this.healthEl = el('div', 'health'); this.healthFill = el('div', 'fill'); this.healthEl.appendChild(this.healthFill);
    this.radarEl = el('div', 'radar'); this.rcanvas = document.createElement('canvas'); this.rcanvas.width = (RX + 4) * 2 * S; this.rcanvas.height = (RY + 4) * 2 * S; this.radarEl.appendChild(this.rcanvas);
    this.rctx = this.rcanvas.getContext('2d'); this.mapCache = null;
    this.zoneEl = el('div', 'zone'); this.zoneEl.hidden = true; this.zoneT = -1;
    this.vehEl = el('div', 'vehicle'); this.vehEl.hidden = true; this.vehT = -1;
    this.main.append(this.fist, this.clockEl, this.healthEl, this.moneyEl, this.radarEl, this.vehEl, this.zoneEl);
    this.missionEl = el('div', 'mission'); this.missionEl.hidden = true; this.missionT = -1;   // drawn even with the HUD off (mission intros)
    this.root.append(this.lbTop, this.lbBottom, this.cap, this.main, this.missionEl, this.helpEl, this.sub);
    this.clockText = ''; this.moneyText = ''; this.setClock(6, 34); this.setMoney(350); this.setHealth(100);
    this.clock = null; this.syncedAt = null;
    this.radar({ x: 0, y: 0, heading: 0, blips: [], map: null });
  }
  // Timers run from update(dt). Should a phase never call it, the public calls fall back to the game clock (still
  // deterministic: game.time only moves in GameState.update). A frame advanced here is skipped by update() so the two
  // paths never double-count, whichever is called first; the capture pre-roll (frozen game.time) only reaches update().
  sync() {
    const t = this.game?.time; if (typeof t !== 'number') return;
    if (this.clock == null) { this.clock = t; return; }
    if (t > this.clock) { const dt = t - this.clock; this.clock = t; this.syncedAt = t; this.advance(dt); }
  }
  attach(parent) { parent.appendChild(this.root); }
  // Leaving a phase clears the transient text so the next phase starts with an empty HUD.
  detach() { this.root.remove(); this.subtitle(''); this.help(''); this.caption(null); this.letterbox(false); this.showHud(false, 0); this.zoneEl.hidden = this.vehEl.hidden = this.missionEl.hidden = true; this.zoneT = this.vehT = this.missionT = -1; }

  // --- cutscene furniture ---
  // SA's DrawBordersForWideScreen: the picture keeps y 10.2-82.4 % (measured; the top bar is thinner than the bottom).
  letterbox(on) { this.lbTop.hidden = this.lbBottom.hidden = !on; this.sub.classList.toggle('play', !on); }
  // Centred white lines; y = the engine's text top per line (% of H), size 'large' (0.8x1.8) or 'small' (0.6x1.6).
  caption(lines, { y, size = 'large', shadow = false, alpha = 1 } = {}) {
    clear(this.cap); const arr = lines == null ? [] : (Array.isArray(lines) ? lines : String(lines).split('\n')).filter((l) => l != null);
    if (!arr.length) { this.cap.hidden = true; return; }
    const ys = Array.isArray(y) ? y : (y != null ? [y] : (size === 'large' ? [40.2, 44.6, 49.1] : [44.6]));
    const pitch = size === 'large' ? 4.46 : 4.0;   // 20 px between the title card's lines
    this.cap.className = `caption ${size}${shadow ? ' shadow' : ''}`;
    arr.forEach((t, i) => { const yy = ys[i] != null ? ys[i] : ys[ys.length - 1] + pitch * (i - ys.length + 1); const d = el('div', 'cline', t); d.style.setProperty('--y', String(yy)); this.cap.appendChild(d); });
    this.cap.hidden = false; this.captionAlpha(alpha);
  }
  captionAlpha(a) { if (a > 1) a /= 255; this.cap.style.opacity = clamp01(a).toFixed(3); }
  // Subtitles and objectives share the slot; a timeout clears, '' clears now, seconds <= 0 keeps it up.
  subtitle(text, seconds = 3) { this.sync(); this.setSub(text, seconds); }
  setSub(text, seconds = 0) { const t = text || ''; this.sub.textContent = t; this.sub.hidden = !t; this.subTime = t && seconds > 0 && isFinite(seconds) ? seconds : Infinity; }
  objective(text, seconds = 4) { this.subtitle(text, seconds); }
  help(text) { this.sync(); clear(this.helpEl); if (!text) { this.helpEl.hidden = true; return; } this.helpEl.appendChild(helpNodes(String(text))); this.helpEl.hidden = false; }

  // --- gameplay HUD ---
  showHud(on, seconds) { this.sync(); this.hudTarget = on ? 1 : 0; this.hudFade = seconds != null ? seconds : (on ? 1.5 : 0); if (!(this.hudFade > 0)) this.hudAlpha = this.hudTarget; this.applyHud(); }
  applyHud() { this.main.hidden = this.hudAlpha <= 0; this.main.style.opacity = this.hudAlpha.toFixed(3); }
  setClock(h, m) { const t = `${pad2(h)}:${pad2(m)}`; if (t === this.clockText) return; this.clockText = t; priced(this.clockEl, t); }
  setMoney(n) { const t = '$' + String(Math.max(0, Math.floor(n || 0))).padStart(8, '0'); if (t === this.moneyText) return; this.moneyText = t; priced(this.moneyEl, t); }
  setHealth(v, max = 100) { this.healthFill.style.width = (100 * clamp01(max > 0 ? v / max : 0)).toFixed(1) + '%'; }
  zone(name) { this.sync(); this.zoneEl.textContent = name || ''; this.zoneT = name ? 0 : -1; this.zoneEl.hidden = !name; if (name) this.zoneEl.style.opacity = '0'; }
  vehicleName(name) { this.sync(); this.vehEl.textContent = name || ''; this.vehT = name ? 0 : -1; this.vehEl.hidden = !name; if (name) this.vehEl.style.opacity = '0'; }
  missionTitle(text) { this.sync(); this.missionEl.innerHTML = text ? (logo.pricedownText?.(String(text)) ?? String(text)) : ''; this.missionT = text ? 0 : -1; this.missionEl.hidden = !text; if (text) this.placeMission(0); }
  placeMission(t) {
    const k = clamp01(t / 0.5), slide = 1 - (1 - k) * (1 - k);   // eases in from the right over 0.5 s, holds, fades at 4.5 s
    this.missionEl.style.transform = `translate(${((1 - slide) * 45).toFixed(2)}cqw, -0.93em)`;
    this.missionEl.style.opacity = t < 4.5 ? '1' : clamp01(5 - t).toFixed(3);
  }

  // --- radar: the map rotates with the heading, blips clamp to the rim ---
  // state = { x, y, heading (deg, 0 = north, 90 = west), blips: [{ type, x, y }], map: mapData }
  radar(state = {}) {
    this.sync(); const g = this.rctx; if (!g) return;
    const x = state.x ?? 0, y = state.y ?? 0, heading = state.heading ?? 0, blips = state.blips || [];
    const map = state.map !== undefined ? state.map : this.game?.world?.mapData?.();
    const c = this.rcanvas, W = c.width, H = c.height, cx = W / 2, cy = H / 2, rx = RX * S, ry = RY * S;
    const th = heading * Math.PI / 180, sn = Math.sin(th), cs = Math.cos(th), ppm = rx / RADAR_RANGE;
    const toRadar = (wx, wy) => { const dx = wx - x, dy = wy - y; return [(dx * cs + dy * sn) * ppm, (dx * sn - dy * cs) * ppm]; };
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = RADAR.ground; g.fillRect(0, 0, W, H);
    const img = this.mapImage(map);
    if (img) { g.translate(cx, cy); g.rotate(th); g.scale(ppm / MAP_PPM, ppm / MAP_PPM); g.translate(-(x - img.x0) * MAP_PPM, -(img.y1 - y) * MAP_PPM); g.drawImage(img.canvas, 0, 0); }
    g.restore();
    g.lineWidth = 4 * S; g.strokeStyle = '#000'; g.beginPath(); g.ellipse(cx, cy, rx + 2 * S, ry + 2 * S, 0, 0, Math.PI * 2); g.stroke();
    for (const b of blips) {
      if (!b) continue; const type = String(Array.isArray(b) ? b[0] : (b.type || b.kind || b.name || 'default')).toLowerCase();
      const bx = Array.isArray(b) ? b[1] : (b.x ?? b.pos?.x ?? b.pos?.[0] ?? 0), by = Array.isArray(b) ? b[2] : (b.y ?? b.pos?.y ?? b.pos?.[1] ?? 0);
      let [px, py] = toRadar(bx, by); const e = (px / rx) ** 2 + (py / ry) ** 2; if (e > 1) { const k = 1 / Math.sqrt(e); px *= k; py *= k; }
      this.blip(g, cx + px, cy + py, type, b.color);
    }
    // player arrow (always up: the map turns instead), then the N marker on the rim
    g.save(); g.translate(cx, cy); g.beginPath(); g.moveTo(0, -5.5 * S); g.lineTo(4.5 * S, 5 * S); g.lineTo(0, 2.5 * S); g.lineTo(-4.5 * S, 5 * S); g.closePath();
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * S; g.lineJoin = 'round'; g.stroke(); g.fill(); g.restore();
    this.label(g, cx + sn * (rx + 1.5 * S), cy - cs * (ry + 1.5 * S), 'N', 11);
  }
  blip(g, px, py, type, color) {
    const s = 8 * S, half = s / 2; g.lineWidth = 1.2 * S; g.strokeStyle = '#000'; g.fillStyle = color || BLIP[type] || BLIP.default;
    g.fillRect(px - half, py - half, s, s); g.strokeRect(px - half, py - half, s, s);
    if (type === 'cj') this.label(g, px + 2.5 * S, py, 'CJ', 10, 'left');
  }
  label(g, x, y, text, px, align = 'center') {
    g.save(); g.font = `700 ${px * S}px "TeX Gyre Heros", "Nimbus Sans", Helvetica, Arial, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 2.2 * S; g.strokeStyle = '#000'; g.strokeText(text, x, y); g.fillStyle = '#fff'; g.fillText(text, x, y); g.restore();
  }
  // The static map (ground, blocks, roads) drawn once per mapData object, north up, one pixel per metre.
  mapImage(map) {
    if (!map || !map.bounds) return null;
    if (this.mapCache?.src === map) return this.mapCache;
    const { x0, y0, x1, y1 } = map.bounds; const w = Math.max(1, Math.round((x1 - x0) * MAP_PPM)), h = Math.max(1, Math.round((y1 - y0) * MAP_PPM));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const g = canvas.getContext('2d');
    const X = (wx) => (wx - x0) * MAP_PPM, Y = (wy) => (y1 - wy) * MAP_PPM;
    g.fillStyle = RADAR.ground; g.fillRect(0, 0, w, h);
    for (const b of map.blocks || []) {
      const bx0 = b.x0 ?? b.x, by0 = b.y0 ?? b.y, bx1 = b.x1 ?? (b.x + b.w), by1 = b.y1 ?? (b.y + b.h); if (![bx0, by0, bx1, by1].every(Number.isFinite)) continue;
      g.fillStyle = b.color || RADAR.block; g.fillRect(X(Math.min(bx0, bx1)), Y(Math.max(by0, by1)), Math.abs(bx1 - bx0) * MAP_PPM, Math.abs(by1 - by0) * MAP_PPM);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of map.roads || []) {
      const { pts, w: rw } = roadPts(r); if (pts.length < 2) continue;
      g.strokeStyle = r?.color || RADAR.road; g.lineWidth = rw * MAP_PPM; g.beginPath(); pts.forEach((p, i) => { const px = p.x ?? p[0], py = p.y ?? p[1]; if (i) g.lineTo(X(px), Y(py)); else g.moveTo(X(px), Y(py)); }); g.stroke();
    }
    for (const r of map.rails || []) {
      const { pts } = roadPts(r); if (pts.length < 2) continue;
      g.strokeStyle = RADAR.rail; g.lineWidth = 3 * MAP_PPM; g.beginPath(); pts.forEach((p, i) => { const px = p.x ?? p[0], py = p.y ?? p[1]; if (i) g.lineTo(X(px), Y(py)); else g.moveTo(X(px), Y(py)); }); g.stroke();
    }
    this.mapCache = { src: map, canvas, x0, y1 }; return this.mapCache;
  }

  update(dt) {
    const t = this.game?.time;
    if (typeof t === 'number') { if (this.syncedAt === t) { this.syncedAt = null; return; } this.clock = t; }
    this.advance(dt);
  }
  advance(dt) {
    if (this.subTime < Infinity) { this.subTime -= dt; if (this.subTime <= 0) this.setSub(''); }
    if (this.hudAlpha !== this.hudTarget) { const step = this.hudFade > 0 ? dt / this.hudFade : 1; this.hudAlpha = this.hudAlpha < this.hudTarget ? Math.min(this.hudTarget, this.hudAlpha + step) : Math.max(this.hudTarget, this.hudAlpha - step); this.applyHud(); }
    this.zoneT = this.fadeSlot(this.zoneEl, this.zoneT, dt); this.vehT = this.fadeSlot(this.vehEl, this.vehT, dt);
    if (this.missionT >= 0) { this.missionT += dt; if (this.missionT >= 5) { this.missionT = -1; this.missionEl.hidden = true; } else this.placeMission(this.missionT); }
  }
  // Zone and vehicle names: 1 s in, 3 s hold, 1 s out.
  fadeSlot(elm, t, dt) {
    if (t < 0) return -1; t += dt; const a = t < 1 ? t : t < 4 ? 1 : t < 5 ? 5 - t : -1;
    if (a < 0) { elm.hidden = true; return -1; } elm.style.opacity = a.toFixed(3); return t;
  }
}
