// Props for the disc-boot world (research/gta-sa-launch.md §5). The PS2 look: boxes, cylinders and a few planes carrying tiny
// nearest-filtered canvas textures (64-128 px, like the console's), Lambert shading, no shadows. Units are metres; every
// builder returns a THREE.Group with its origin at the base centre and its front (doors, signs, lamp arms) facing -z, which is
// SA north at heading 0 (world/index.js: toThree = (x, z, -y), headingToYaw = deg * PI / 180). Nothing is loaded: textures are
// drawn once at build time and cached, parts sharing a material are merged so a prop costs one to three draw calls.
import * as THREE from 'three';
import * as M from './materials.js';
import { makeRng } from '../../rng.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const BAY = 3, STOREY = 3.2, GROUND = 3.6;   // facade tile = one window bay x one storey; the shop band on the ground floor
const SANS = 'bold 64px "TeX Gyre Heros", Helvetica, Arial, sans-serif';
const SCHEMES = [['#e9d64a', '#1c1c1c'], ['#c8362a', '#f4f0e6'], ['#2a4fa8', '#f4f0e6'], ['#2e8a3c', '#f4f0e6'], ['#f0ece2', '#1c1c1c'], ['#1c1c1c', '#f4d84a']];
const scheme = (text) => { let h = 7; for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return SCHEMES[h % SCHEMES.length]; };
const css = (hex) => '#' + new THREE.Color(hex).getHexString();
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const shadeHex = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
const lum = (hex) => { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; };

// ---------------- materials and textures (cached: the sets share programs and the world can merge by material) ----------------
const mats = new Map(), texes = new Map();
const key = (...a) => a.map((v) => (v && v.uuid) || String(v)).join('|');
function plain(hex, opts = {}) { const k = key('plain', hex, JSON.stringify(opts)); if (!mats.has(k)) mats.set(k, M.flatMat?.(hex, opts) || new THREE.MeshLambertMaterial({ color: hex, ...opts })); return mats.get(k); }
function texMat(tex, { color = 0xffffff, emissive = 0x000000, emissiveMap = null, alphaTest = 0, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  const k = key('tex', tex, color, emissive, emissiveMap, alphaTest, side, transparent, opacity); if (mats.has(k)) return mats.get(k);
  const m = new THREE.MeshLambertMaterial({ map: tex || null, color, emissive, emissiveMap: emissiveMap || null, alphaTest, side, transparent, opacity, depthWrite: !transparent }); mats.set(k, m); return m;
}
// A canvas texture drawn once; nearest magnification keeps the texel edges the console showed.
function canvasTex(k, w, h, draw) {
  if (texes.has(k)) return texes.get(k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); let t = null;
  if (g) { draw(g, w, h); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
  texes.set(k, t); return t;
}
function speckle(g, w, h, seed, n, alpha, dark) { const r = makeRng(seed); g.fillStyle = `rgba(${dark ? '0,0,0' : '255,255,255'},${alpha})`; for (let i = 0; i < n; i++) g.fillRect(r.int(0, w - 1), r.int(0, h - 1), 1, 1); }
function textTex(text, { w = 512, h = 128, bg = '#111', fg = '#fff', font = SANS, pad = 0.08, border = null } = {}) {
  return canvasTex(key('text', text, w, h, bg, fg, font, border), w, h, (g) => {
    if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(2, h / 24); g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth); }
    let size = Math.round(h * 0.62); g.font = font.replace(/\d+px/, size + 'px'); const tw = g.measureText(text).width, max = w * (1 - 2 * pad);
    if (tw > max) { size = Math.floor(size * max / tw); g.font = font.replace(/\d+px/, size + 'px'); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + size * 0.04);
  });
}
// one bay x one storey of an office facade: a window with a pale frame, dark blue-grey glass, a sill shadow, the floor line
function windowTex(hex) {
  return canvasTex('win' + hex, 64, 64, (g, w, h) => {
    g.fillStyle = css(hex); g.fillRect(0, 0, w, h); speckle(g, w, h, 11, 140, 0.08, true);
    g.fillStyle = shade(hex, 0.8); g.fillRect(0, 62, w, 2);
    g.fillStyle = '#d9d6cc'; g.fillRect(19, 15, 26, 32); g.fillStyle = '#3a4658'; g.fillRect(21, 17, 22, 28);
    g.fillStyle = '#5a6a80'; g.fillRect(21, 17, 10, 12); g.fillStyle = '#2a3242'; g.fillRect(31, 17, 1, 28); g.fillRect(21, 30, 22, 1);
    g.fillStyle = shade(hex, 0.7); g.fillRect(19, 47, 26, 2);
  });
}
// the ground floor of a shop: an awning band, a big dark pane, a door, a kick plate
function storefrontTex(hex) {
  return canvasTex('shop' + hex, 64, 72, (g, w, h) => {
    g.fillStyle = css(hex); g.fillRect(0, 0, w, h); speckle(g, w, h, 12, 140, 0.08, true);
    g.fillStyle = '#7a2a22'; g.fillRect(0, 13, w, 8); g.fillStyle = '#5a1e18'; g.fillRect(0, 20, w, 1);
    g.fillStyle = '#cfcabe'; g.fillRect(2, 22, 60, 44); g.fillStyle = '#252c38'; g.fillRect(4, 24, 56, 40);
    g.fillStyle = '#3c4a5c'; g.fillRect(4, 24, 22, 14); g.fillStyle = '#cfcabe'; g.fillRect(25, 24, 2, 40);
    g.fillStyle = '#3a3a40'; g.fillRect(29, 28, 12, 36); g.fillStyle = '#c8c0a8'; g.fillRect(38, 46, 2, 3);
    g.fillStyle = shade(hex, 0.6); g.fillRect(0, 66, w, 6);
  });
}
function roofTex() { return canvasTex('roof', 64, 64, (g, w, h) => { g.fillStyle = '#6f6d68'; g.fillRect(0, 0, w, h); speckle(g, w, h, 13, 400, 0.12, false); speckle(g, w, h, 14, 300, 0.2, true); }); }
function shingleTex() { return canvasTex('shingle', 64, 64, (g, w, h) => { g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h); speckle(g, w, h, 15, 300, 0.15, true); g.fillStyle = '#a8a8a8'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 2); }); }
// Two house faces side by side (left half: two curtained windows and a door; right half: windows only), a plinth, a trim line
// under the eave, drawn once per colour; house() maps its front and back onto the left half and its sides onto the right.
function houseTex(hex, trim) {
  return canvasTex(key('house', hex, trim), 256, 64, (g, w, h) => {
    g.fillStyle = css(hex); g.fillRect(0, 0, w, h); speckle(g, w, h, 16, 600, 0.07, true);
    g.fillStyle = shade(hex, 0.62); g.fillRect(0, 58, w, 6); g.fillStyle = css(trim); g.fillRect(0, 4, w, 3);
    for (const x of [14, 84, 150, 206]) { g.fillStyle = css(trim); g.fillRect(x, 22, 30, 24); g.fillStyle = '#3c4a5c'; g.fillRect(x + 2, 24, 26, 20); g.fillStyle = '#d8d0b8'; g.fillRect(x + 2, 24, 26, 4); g.fillRect(x + 2, 24, 5, 20); g.fillRect(x + 23, 24, 5, 20); g.fillStyle = css(trim); g.fillRect(x + 14, 24, 2, 20); g.fillStyle = shade(hex, 0.7); g.fillRect(x, 46, 30, 2); }
    g.fillStyle = css(trim); g.fillRect(54, 24, 20, 34); g.fillStyle = '#5a3a28'; g.fillRect(56, 26, 16, 32); g.fillStyle = '#3c4a5c'; g.fillRect(58, 30, 12, 8); g.fillStyle = '#d8c060'; g.fillRect(68, 44, 2, 2);
  });
}
// asphalt with the markings: a dashed yellow centre (double solid from four lanes), white dashes between same-way lanes
function roadTex(lanes) {
  return canvasTex('road' + lanes, 128, 128, (g, w, h) => {
    g.fillStyle = '#4b4b4b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 21, 600, 0.12, false); speckle(g, w, h, 22, 600, 0.18, true);
    g.fillStyle = '#404040'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    g.fillStyle = '#c9a63a'; if (lanes >= 4) { g.fillRect(w / 2 - 3, 0, 2, h); g.fillRect(w / 2 + 1, 0, 2, h); } else if (lanes === 2) g.fillRect(w / 2 - 1, 0, 2, 48);
    g.fillStyle = '#d8d8d0'; for (let i = 1; i < lanes; i++) if (i * 2 !== lanes) g.fillRect(Math.round(i * w / lanes) - 1, 0, 2, 40);
  });
}
function intersectionTex() {
  return canvasTex('xing', 128, 128, (g, w, h) => {
    g.fillStyle = '#4b4b4b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 23, 600, 0.12, false); speckle(g, w, h, 24, 600, 0.18, true);
    g.fillStyle = '#d8d8d0'; for (let i = 0; i < 8; i++) { const p = 12 + i * 14; g.fillRect(p, 4, 8, 12); g.fillRect(p, h - 16, 8, 12); g.fillRect(4, p, 12, 8); g.fillRect(w - 16, p, 12, 8); }
  });
}
function sidewalkTex() { return canvasTex('walk', 64, 64, (g, w, h) => { g.fillStyle = '#a09a8e'; g.fillRect(0, 0, w, h); speckle(g, w, h, 25, 300, 0.1, true); speckle(g, w, h, 26, 200, 0.12, false); g.fillStyle = '#847e74'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); }); }
function ballastTex() {
  return canvasTex('ballast', 64, 64, (g, w, h) => {
    g.fillStyle = '#7a7264'; g.fillRect(0, 0, w, h); speckle(g, w, h, 27, 700, 0.2, true); speckle(g, w, h, 28, 500, 0.18, false);
    for (const y of [5, 37]) { g.fillStyle = '#4e3e30'; g.fillRect(4, y, 56, 13); g.fillStyle = '#6a5a48'; g.fillRect(4, y, 56, 2); }
  });
}
// cinder blocks in greys (two staggered courses of 0.2 x 0.4 m) so the material colour gives the wall its tan
function blockTex() {
  return canvasTex('block', 64, 32, (g, w, h) => {
    g.fillStyle = '#a6a6a6'; g.fillRect(0, 0, w, h); g.fillStyle = '#f0f0f0';
    for (const [x, y] of [[1, 1], [33, 1], [17, 17], [49, 17], [-15, 17]]) g.fillRect(x, y, 30, 14);
    speckle(g, w, h, 29, 250, 0.12, true);
  });
}
function chainlinkTex() {
  return canvasTex('chain', 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#b4b4b0'; g.lineWidth = 1.5; g.beginPath();
    for (let k = -8; k <= 8; k++) { g.moveTo(0, k * 8); g.lineTo(w, k * 8 + w); g.moveTo(0, k * 8); g.lineTo(w, k * 8 - w); }
    g.stroke();
  });
}
// a palm frond, v = base to tip: a rib and paired leaflets that reach further where the frond mesh is wide
function frondTex(dead) {
  return canvasTex('frond' + dead, 32, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); const leaf = dead ? ['#8a6a30', '#a08040'] : ['#3a7a24', '#5a9a32']; g.lineWidth = 2.2;
    for (let y = 122; y > 6; y -= 5) { const t = 1 - y / h, reach = 15 * Math.sin(Math.PI * (0.15 + 0.85 * t)); g.strokeStyle = leaf[Math.floor(y / 5) % 2]; g.beginPath(); g.moveTo(16, y); g.lineTo(16 - reach, y - 9); g.moveTo(16, y); g.lineTo(16 + reach, y - 9); g.stroke(); }
    g.fillStyle = dead ? '#6a4a22' : '#4c7a26'; g.fillRect(15, 2, 2, 124);
  });
}
function trunkTex() { return canvasTex('trunk', 32, 32, (g, w, h) => { g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h); speckle(g, w, h, 30, 90, 0.25, true); g.fillStyle = '#5e4630'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3); g.fillStyle = '#a58860'; for (let y = 4; y < h; y += 8) g.fillRect(0, y, w, 1); }); }
function stripeTex() { return canvasTex('stripe', 32, 8, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#d02a22'; for (let x = -16; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0); g.lineTo(x + 16, h); g.lineTo(x + 8, h); g.closePath(); g.fill(); } }); }
// 4 x 4 m of acoustic ceiling: a 0.5 m tile grid, optionally a recessed 1.5 x 0.75 m fluorescent panel with a dark rim
function ceilingTex(light) {
  return canvasTex('ceil' + light, 64, 64, (g, w, h) => {
    g.fillStyle = '#d9d6cd'; g.fillRect(0, 0, w, h); speckle(g, w, h, 31, 300, 0.08, true); g.fillStyle = '#bdb9af'; for (let i = 0; i < w; i += 8) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
    if (light) { g.fillStyle = '#3a3a3a'; g.fillRect(19, 25, 26, 14); g.fillStyle = '#fff5c8'; g.fillRect(20, 26, 24, 12); g.fillStyle = '#e8d890'; for (let x = 22; x < 44; x += 3) g.fillRect(x, 26, 1, 12); }
  });
}
function ceilingGlowTex() { return canvasTex('ceilglow', 64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(21, 27, 22, 10); }); }
function beltTex() { return canvasTex('belt', 32, 32, (g, w, h) => { g.fillStyle = '#1e1e20'; g.fillRect(0, 0, w, h); g.fillStyle = '#303032'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1); g.fillStyle = '#141416'; for (let y = 4; y < h; y += 8) g.fillRect(0, y, w, 1); g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h); }); }
function lensTex(state) {
  return canvasTex('lens' + state, 32, 96, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    const lamps = [['#ff2a2a', '#5a1a1a', state === 'red'], ['#ffb020', '#6a4a10', state === 'amber'], ['#30e060', '#1a4a2a', state === 'green']];
    lamps.forEach(([on, off, lit], i) => { g.fillStyle = lit ? on : off; g.beginPath(); g.arc(16, 16 + 32 * i, 11, 0, TAU); g.fill(); });
  });
}
function gradTex() { return canvasTex('grad', 4, 32, (g, w, h) => { g.clearRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = `rgba(255,255,255,${(y / (h - 1)) ** 1.5})`; g.fillRect(0, y, w, 1); } }); }

// ---------------- geometry helpers ----------------
function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const plane = (w, h) => new THREE.PlaneGeometry(w, h);
// A box; `tile` = metres per texture repeat (horizontal, vertical), `rep` = whole repeats on the x faces, vertically, on the z faces.
function box(w, h, d, { tile = null, rep = null } = {}) {
  const g = new THREE.BoxGeometry(w, h, d); if (!tile && !rep) return g;
  const [tw, th] = tile || [1, 1]; const sx = rep ? rep[2] : w / tw, sz = rep ? rep[0] : d / tw, sy = rep ? rep[1] : h / th;
  const faces = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]], uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * faces[f][0], uv.getY(i) * faces[f][1]);
  return g;
}
function mergeGeos(list) {
  const gs = []; let n = 0;
  for (const { geo, m } of list) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m); gs.push(g); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of gs) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}
// Collects placed geometries per material and merges each material's parts into one mesh.
class Parts {
  constructor() { this.lists = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rot = null, scl = null) {
    const m = new THREE.Matrix4(); if (rot) m.makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)); if (scl) m.scale(new THREE.Vector3(scl[0], scl[1], scl[2])); m.setPosition(x, y, z);
    if (!this.lists.has(mat)) this.lists.set(mat, []); this.lists.get(mat).push({ geo, m }); return this;
  }
  build(group = new THREE.Group()) { for (const [mat, list] of this.lists) group.add(new THREE.Mesh(mergeGeos(list), mat)); return group; }
}
// A frond along +x: rises a little, then droops; narrow at the stem, widest mid-way, pointed at the tip.
function frondGeo(L = 3, droop = 1.2, W = 0.6) {
  const n = 7, p = [], t2 = []; const pt = (i) => { const t = i / n; return [L * t, 0.35 * Math.sin(t * Math.PI) - droop * t * t, W / 2 * Math.sin(Math.PI * (0.15 + 0.85 * t))]; };
  for (let i = 0; i < n; i++) { const [x0, y0, h0] = pt(i), [x1, y1, h1] = pt(i + 1), v0 = i / n, v1 = (i + 1) / n; const a = [x0, y0, -h0, 0, v0], b = [x0, y0, h0, 1, v0], c = [x1, y1, h1, 1, v1], d = [x1, y1, -h1, 0, v1]; for (const q of [a, b, c, a, c, d]) { p.push(q[0], q[1], q[2]); t2.push(q[3], q[4]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(t2, 2)); g.computeVertexNormals(); return g;
}
// A gable roof: ridge along x at y = rise over the eaves, slopes textured by `tile` metres, gable triangles included.
function gableGeo(L, D, rise, tile = 0.6) {
  const p = [], uv = [], s = Math.hypot(D / 2, rise); const push = (a, b, c) => { for (const q of [a, b, c]) { p.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); } };
  const A = [-L / 2, 0, -D / 2, 0, 0], B = [L / 2, 0, -D / 2, L / tile, 0], C = [L / 2, rise, 0, L / tile, s / tile], Dd = [-L / 2, rise, 0, 0, s / tile];
  const E = [-L / 2, 0, D / 2, 0, 0], F = [L / 2, 0, D / 2, L / tile, 0];
  push(A, C, B); push(A, Dd, C); push(F, Dd, E); push(F, C, Dd);                       // front slope (-z), back slope (+z), wound outward
  push(E, Dd, A); push(B, C, F);                                                          // gables (-x, +x)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

// ---------------- buildings ----------------
// A flat-roofed block: a window facade tiled per bay and storey, an optional shop band on the ground floor with a named sign,
// a parapet slab and some rooftop clutter on the bigger ones.
export function building({ w = 12, d = 12, h = 8, color = 0xb8a88e, windows = true, sign = null, shop = null } = {}) {
  const P = new Parts(); const isShop = shop ?? !!sign;
  const bays = Math.max(1, Math.round(w / BAY)), baysD = Math.max(1, Math.round(d / BAY));
  if (isShop) P.add(box(w, GROUND, d, { rep: [baysD, 1, bays] }), texMat(storefrontTex(color)), 0, GROUND / 2, 0);
  const y0 = isShop ? GROUND : 0, hh = Math.max(0.5, h - y0), storeys = Math.max(1, Math.round(hh / STOREY));
  P.add(box(w, hh, d, { rep: [baysD, storeys, bays] }), windows && hh >= 2 ? texMat(windowTex(color)) : plain(color), 0, y0 + hh / 2, 0);   // a shop's short parapet band stays plain
  P.add(box(w + 0.3, 0.35, d + 0.3, { tile: [2, 2] }), texMat(roofTex()), 0, h + 0.025, 0);
  if (w * d >= 120) { const grey = plain(0x9a9a94); P.add(box(1.6, 0.9, 1.2), grey, w * 0.22, h + 0.65, d * 0.12); P.add(box(2.2, 1.5, 2.2), grey, -w * 0.25, h + 0.95, -d * 0.2); }
  if (sign) { const [bg, fg] = scheme(sign); P.add(plane(w * 0.7, 0.72), texMat(textTex(sign, { bg, fg, border: fg })), 0, GROUND - 0.55, -d / 2 - 0.06, [0, Math.PI, 0]); }
  return P.build();
}
// A low house: one facade texture on every wall (door and two windows), a shingled gable roof with the ridge along x, two steps.
export function house({ w = 10, d = 9, h = 4.2, color = 0xc8b89a, roof = 0x5a4636, trim = 0xf0ece2 } = {}) {
  const P = new Parts(); const body = box(w, h, d, { rep: [1, 1, 1] }), uv = body.attributes.uv;
  for (let i = 0; i < 24; i++) uv.setX(i, uv.getX(i) * 0.5 + (i < 8 ? 0.5 : 0));   // x faces: the windows-only half; z faces: the door half
  P.add(body, texMat(houseTex(color, trim)), 0, h / 2, 0);
  P.add(gableGeo(w + 1, d + 1, Math.min(2.2, d * 0.28)), texMat(shingleTex(), { color: roof }), 0, h - 0.05, 0);
  const step = plain(0x9d978c); P.add(box(1.8, 0.18, 1.1), step, 0, 0.09, -d / 2 - 0.5); P.add(box(1.8, 0.18, 0.55), step, 0, 0.27, -d / 2 - 0.22);
  return P.build();
}

// ---------------- street furniture ----------------
export function palm(height = 7) {
  const rng = makeRng(1000 + Math.round(height * 37)); const P = new Parts();
  const lean = new THREE.Euler(rng.range(-0.05, 0.05), 0, rng.range(-0.08, 0.08)), top = new THREE.Vector3(0, height, 0).applyEuler(lean);
  P.add(scaleUV(cyl(0.17, 0.3, height, 7), 2, height / 0.6), texMat(trunkTex()), top.x / 2, top.y / 2, top.z / 2, [lean.x, lean.y, lean.z]);
  P.add(cyl(0.34, 0.22, 0.7, 7), texMat(trunkTex(), { color: 0xb0a080 }), top.x, top.y - 0.15, top.z);   // the boot of old frond bases
  const green = texMat(frondTex(false), { alphaTest: 0.5, side: THREE.DoubleSide }), dead = texMat(frondTex(true), { alphaTest: 0.5, side: THREE.DoubleSide });
  const n = 9; for (let i = 0; i < n; i++) P.add(frondGeo(rng.range(2.6, 3.4), rng.range(0.9, 1.5)), green, top.x, top.y + 0.2, top.z, [0, i / n * TAU + rng.range(-0.15, 0.15), rng.range(-0.1, 0.3)]);
  for (let i = 0; i < 4; i++) P.add(frondGeo(2.0, 2.4, 0.5), dead, top.x, top.y - 0.2, top.z, [0, i / 4 * TAU + 0.4, -0.5]);
  return P.build();
}
// The Los Santos cobra-head lamp: a tapered pole, a curved arm reaching 2.6 m toward -z, a warm lamp under the head.
export function streetLamp(height = 7.5) {
  const P = new Parts(), steel = plain(0x5e5f58);
  P.add(cyl(0.2, 0.24, 0.5), steel, 0, 0.25, 0); P.add(cyl(0.07, 0.12, height), steel, 0, height / 2, 0);
  const arm = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, height - 0.05, 0), new THREE.Vector3(0, height + 0.9, -0.5), new THREE.Vector3(0, height + 0.7, -2.6));
  P.add(new THREE.TubeGeometry(arm, 6, 0.055, 5, false), steel, 0, 0, 0);
  P.add(box(0.32, 0.16, 0.75), steel, 0, height + 0.62, -2.75);
  P.add(box(0.22, 0.03, 0.5), plain(0xffe6b0, { emissive: 0xffc870 }), 0, height + 0.53, -2.75);
  return P.build();
}
// A mast-arm signal: the arm reaches 5.4 m toward -z with two hanging heads whose lenses face -z; `userData.setSignal('red'|'amber'|'green')`.
export function trafficLight() {
  const P = new Parts(), pole = plain(0x55564a), head = plain(0x1e1e1e), g = new THREE.Group();
  P.add(cyl(0.1, 0.13, 6.2), pole, 0, 3.1, 0); P.add(cyl(0.07, 0.07, 5.4).rotateX(Math.PI / 2), pole, 0, 6.0, -2.7);
  P.add(cyl(0.035, 0.035, 2.3), pole, 0, 5.4, -1.0, [-60 * D2R, 0, 0]);
  const lenses = []; for (const z of [-2.3, -4.4]) { P.add(box(0.34, 1.05, 0.3), head, 0, 5.45, z); P.add(box(0.44, 0.06, 0.4), head, 0, 5.95, z); lenses.push({ geo: plane(0.28, 0.95).rotateY(Math.PI), m: new THREE.Matrix4().setPosition(0, 5.45, z - 0.16) }); }
  P.add(box(0.36, 0.5, 0.03), plain(0xe8e8e2), 0, 3.6, -0.13);
  P.build(g); const lens = new THREE.Mesh(mergeGeos(lenses), texMat(lensTex('red'))); g.add(lens);
  g.userData.setSignal = (state) => { lens.material = texMat(lensTex(state)); }; return g;
}
// A pole billboard: 8 x 3.6 m board at 6.5 m, the text on the -z face with two lamps over it and a catwalk under it.
export function billboard(text = '') {
  const P = new Parts(), steel = plain(0x6a6a62), W = 8, H = 3.6, Y = 6.5; const [bg, fg] = scheme(text);
  P.add(cyl(0.22, 0.3, Y + 0.4), steel, 0, (Y + 0.4) / 2, 0); P.add(box(W + 0.3, H + 0.3, 0.25), plain(0x2e2e2e), 0, Y + H / 2, 0);
  P.add(box(W + 0.6, 0.08, 0.9), steel, 0, Y - 0.2, -0.4);
  for (const x of [-W * 0.3, W * 0.3]) { P.add(cyl(0.03, 0.03, 0.9), steel, x, Y + H + 0.45, -0.35, [-0.7, 0, 0]); P.add(box(0.36, 0.1, 0.22), plain(0x3a3a3a), x, Y + H + 0.78, -0.72); }
  P.add(plane(W, H).rotateY(Math.PI), texMat(textTex(text, { bg, fg, w: 512, h: 256, border: fg })), 0, Y + H / 2, -0.135);
  return P.build();
}
// Chain-link along x: posts every 3 m, a top rail, the lattice as a see-through plane.
export function fence(len = 10, h = 1.8) {
  const P = new Parts(), steel = plain(0x8a8a86), n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) P.add(cyl(0.025, 0.03, h), steel, -len / 2 + i * len / n, h / 2, 0);
  P.add(cyl(0.02, 0.02, len).rotateZ(Math.PI / 2), steel, 0, h - 0.03, 0);
  P.add(scaleUV(plane(len, h), len / 0.5, h / 0.5), texMat(chainlinkTex(), { side: THREE.DoubleSide, alphaTest: 0.05, transparent: true }), 0, h / 2, 0);
  return P.build();
}
// The Jefferson alley's block wall along x (research §5: tan, about 2.5 m, a flat cap), block courses of 0.2 x 0.4 m.
export function wall(len = 10, h = 2.5, color = 0xc9a86b) {
  const P = new Parts(); P.add(box(len, h, 0.35, { tile: [0.8, 0.4] }), texMat(blockTex(), { color }), 0, h / 2, 0);
  P.add(box(len + 0.06, 0.08, 0.45), plain(shadeHex(color, 1.12)), 0, h + 0.04, 0); return P.build();
}

// ---------------- ground ----------------
// Asphalt along z, `lanes` x 3.5 m wide, the markings tiling every 8 m.
export function roadSegment(len = 20, lanes = 2) {
  const g = new THREE.Group(); const m = new THREE.Mesh(scaleUV(plane(lanes * 3.5, len).rotateX(-Math.PI / 2), 1, len / 8), texMat(roadTex(lanes))); m.position.y = 0.01; g.add(m); return g;
}
export function intersection(lanes = 2) {
  const g = new THREE.Group(), W = lanes * 3.5; const m = new THREE.Mesh(plane(W, W).rotateX(-Math.PI / 2), texMat(intersectionTex())); m.position.y = 0.015; g.add(m); return g;
}
// A kerbed concrete strip along z, 15 cm high, slabs every 1.5 m.
export function sidewalk(len = 20, width = 2) {
  const g = new THREE.Group(); const m = new THREE.Mesh(box(width, 0.15, len, { tile: [1.5, 1.5] }), texMat(sidewalkTex())); m.position.y = 0.075; g.add(m); return g;
}
// Ballast with sleepers every 0.6 m and two rails 1.44 m apart, along z.
export function railTrack(len = 20) {
  const P = new Parts(); P.add(scaleUV(plane(3.4, len).rotateX(-Math.PI / 2), 1, len / 1.2), texMat(ballastTex()), 0, 0.02, 0);
  const rail = plain(0x9a9a98); for (const x of [-0.72, 0.72]) P.add(box(0.07, 0.14, len), rail, x, 0.12, 0); return P.build();
}
// A crossing gate: white mast with the crossbuck and two red lamps, a striped arm swinging across +x; `userData.setDown(0..1)`.
export function railCrossingGate() {
  const g = new THREE.Group(), P = new Parts(), white = plain(0xe8e8e2), dark = plain(0x2a2a2a);
  P.add(box(0.5, 0.25, 0.5), plain(0x8a8a86), 0, 0.125, 0); P.add(cyl(0.09, 0.11, 4.4), white, 0, 2.45, 0); P.add(box(0.36, 0.6, 0.2), dark, 0, 1.15, 0);
  const board = (t, z, r) => P.add(box(1.2, 0.22, 0.03), texMat(textTex(t, { bg: '#f4f4f0', fg: '#141414', w: 256, h: 48 })), 0, 3.9, z, [0, 0, r]);
  board('RAILROAD', -0.12, Math.PI / 4); board('CROSSING', -0.16, -Math.PI / 4);
  P.add(box(1.0, 0.1, 0.1), dark, 0, 3.0, -0.08);
  P.add(cyl(0.14, 0.14, 0.08).rotateX(Math.PI / 2), plain(0xff2020, { emissive: 0xff2020 }), -0.4, 3.0, -0.16); P.add(cyl(0.14, 0.14, 0.08).rotateX(Math.PI / 2), plain(0x5a1414), 0.4, 3.0, -0.16);
  P.build(g);
  const arm = new Parts(); arm.add(box(4, 0.12, 0.05, { tile: [0.4, 0.12] }), texMat(stripeTex()), 2, 0, 0); arm.add(box(0.7, 0.2, 0.12), dark, -0.55, 0, 0);
  const pivot = arm.build(); pivot.position.set(0, 1.15, -0.15); g.add(pivot);
  g.userData.setDown = (t) => { pivot.rotation.z = (1 - Math.min(1, Math.max(0, t))) * 88 * D2R; }; g.userData.setDown(0); return g;
}
// A board sign, the text readable on both faces, on a slim post unless `post` is false (then it sits on the ground for wall mounting).
export function sign(text = '', color = 0xffffff, { post = true, w = 1.4, h = 0.5, y = 2.2 } = {}) {
  const P = new Parts(), bg = css(color), fg = lum(color) > 0.5 ? '#141414' : '#f4f4f0'; const cy = post ? y : h / 2;
  if (post) P.add(cyl(0.03, 0.035, y), plain(0x6a6a62), 0, y / 2, 0.02);
  P.add(box(w, h, 0.04), texMat(textTex(text, { bg, fg, w: 512, h: Math.round(512 * h / w) })), 0, cy, 0); return P.build();
}

// ---------------- airport interiors ----------------
// A check-in desk facing -z: kick plate, blue-grey front with the red stripe of the LC terminal, cream top, a monitor on the staff side.
export function airportCounter() {
  const P = new Parts(); P.add(box(4, 0.12, 0.95), plain(0x2c2c30), 0, 0.06, 0); P.add(box(4, 0.95, 0.9), plain(0x4b5468), 0, 0.6, 0);
  P.add(box(4.15, 0.06, 1.1), plain(0xe6e0d2), 0, 1.1, 0); P.add(box(4.0, 0.07, 0.02), plain(0xc82a2a), 0, 0.75, -0.455);
  P.add(box(0.42, 0.34, 0.05), plain(0x1a1a1c), 0.9, 1.35, 0.3, [-0.15, 0, 0]); P.add(box(0.5, 0.05, 0.6), plain(0x777770), -1.2, 1.16, 0.05);
  return P.build();
}
// A luggage conveyor along z; `userData.advance(metres)` scrolls the belt.
export function baggageBelt(len = 10) {
  const g = new THREE.Group(), P = new Parts(); const t = beltTex(), bt = t ? t.clone() : null; if (bt) bt.needsUpdate = true;
  P.add(box(1.2, 0.55, len), plain(0x3a3a3c), 0, 0.275, 0); const rail = plain(0xa9a9a4); for (const x of [-0.6, 0.6]) P.add(box(0.1, 0.16, len), rail, x, 0.63, 0);
  P.add(scaleUV(plane(1.0, len).rotateX(-Math.PI / 2), 1, len), texMat(bt), 0, 0.56, 0); P.build(g);
  g.userData.advance = (m) => { if (bt) bt.offset.y = (bt.offset.y - m) % 1; }; return g;
}
// Three dark-blue seats on a steel beam, facing -z.
export function bench() {
  const P = new Parts(), seat = plain(0x2a3352), steel = plain(0x8a8a86);
  for (const x of [-0.6, 0, 0.6]) { P.add(box(0.55, 0.06, 0.5), seat, x, 0.45, 0); P.add(box(0.55, 0.4, 0.05), seat, x, 0.7, 0.25, [-0.15, 0, 0]); }
  P.add(box(1.9, 0.08, 0.08), steel, 0, 0.38, 0); for (const x of [-0.75, 0.75]) P.add(box(0.06, 0.38, 0.5), steel, x, 0.19, 0);
  return P.build();
}
export function pillar(h = 4.2) {
  const P = new Parts(); P.add(box(0.6, h, 0.6), plain(0xd2cec4), 0, h / 2, 0); P.add(box(0.7, 0.35, 0.7), plain(0x9a968c), 0, 0.175, 0); P.add(box(0.72, 0.2, 0.72), plain(0xc4c0b6), 0, h - 0.1, 0); return P.build();
}
// A 4 x 4 m ceiling slab whose underside carries the tile grid and, by default, one glowing fluorescent panel.
export function ceilingPanel({ light = true, size = 4 } = {}) {
  const g = new THREE.Group(); const m = new THREE.Mesh(box(size, 0.1, size, { rep: [1, 1, 1] }), texMat(ceilingTex(light), light ? { emissive: 0xffe6a8, emissiveMap: ceilingGlowTex() } : {})); m.position.y = 0.05; g.add(m); return g;
}
// A hanging terminal sign: dark board with the text on both faces and two rods above; `bg: 'transparent'` gives bare letters for a wall.
export function terminalSign(text = '', { w = 3, h = 0.6, bg = '#161616', fg = '#f4f4f0', hang = true } = {}) {
  const P = new Parts(); const tex = textTex(text, { bg, fg, w: 512, h: Math.max(64, Math.round(512 * h / w)) });
  if (bg === 'transparent') { P.add(plane(w, h).rotateY(Math.PI), texMat(tex, { alphaTest: 0.5, side: THREE.DoubleSide }), 0, h / 2, 0); return P.build(); }
  P.add(box(w, h, 0.06), plain(0x161616), 0, h / 2, 0); const tm = texMat(tex);
  P.add(plane(w - 0.02, h - 0.02).rotateY(Math.PI), tm, 0, h / 2, -0.031); P.add(plane(w - 0.02, h - 0.02), tm, 0, h / 2, 0.031);
  if (hang) for (const x of [-(w / 2 - 0.3), w / 2 - 0.3]) P.add(cyl(0.015, 0.015, 0.5), plain(0x8a8a86), x, h + 0.25, 0);
  return P.build();
}

// ---------------- markers ----------------
// The mission marker: a translucent red tube fading upward, with a ring on the ground.
export function redMarker(r = 1, h = 2.2) {
  const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ map: gradTex(), color: 0xff2828, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const tube = new THREE.CylinderGeometry(r, r, h, 16, 1, true); const ring = new THREE.RingGeometry(r * 0.85, r, 24).rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(mergeGeos([{ geo: tube, m: new THREE.Matrix4().setPosition(0, h / 2, 0) }, { geo: ring, m: new THREE.Matrix4().setPosition(0, 0.02, 0) }]), m)); return g;
}
// The blue arrow that hovers over the BMX: an inverted cone with a dark rim, bobbing and turning through `userData.update(dt)`.
export function blueMarker() {
  const g = new THREE.Group(), cone = new THREE.Group(); let t = 0;
  cone.add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.85, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a78ff, transparent: true, opacity: 0.75, depthWrite: false })));
  cone.add(new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.9, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x102a80, transparent: true, opacity: 0.35, side: THREE.BackSide, depthWrite: false })));
  cone.position.y = 2.3; g.add(cone);
  g.userData.update = (dt) => { t += dt; cone.position.y = 2.3 + 0.15 * Math.sin(t * 3); cone.rotation.y = t * 1.5; }; return g;
}
