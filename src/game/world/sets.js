// Sets for the disc-boot world (research/gta-sa-launch.md §5): the two airport interiors and one contiguous Los Santos
// exterior. Public API in SA coordinates (x east, y north, z up, metres; heading 0 north, 90 west); three.js keeps
// (x, z, -y). Each builder returns { group, anchors, mapData, walkable(x, y) } plus a few extras (gates, belt, paths).
// Los Santos is a street grid over x 2100-2560, y -1760 to -1200 with the script's landmarks placed by hand: the
// Jefferson alley (CJ is dumped at 2239,-1262 between a low block wall and a tall one), the rail yard with the crossing
// at (2300,-1385), the row street just south of it, the pull-over boulevard along y -1730 and the Grove Street cul-de-sac
// with the Johnson house and its red marker. The ground is flat at z 22.9 (the alley's script height): the real terrain
// drops 10 m toward Ganton, but the play API has no height query, so every anchor sits on one plane. Everything is drawn
// at build time from props.js and merged per material (one mesh per material, ~50 draw calls for the whole city).
import * as THREE from 'three';
import * as P from './props.js';
import { flatMat } from './materials.js';
import { makeRng } from '../../rng.js';

const D2R = Math.PI / 180;
export const GROUND_Z = 22.9;
const A = (x, y, z, heading = 0) => ({ x, y, z, heading });

// ---------------- helpers ----------------
const mats = new Map();
function mat(hex, opts = {}) {
  const k = hex + JSON.stringify(opts); if (mats.has(k)) return mats.get(k);
  let m; try { m = flatMat(hex, opts); } catch (e) { m = new THREE.MeshLambertMaterial({ color: hex }); }
  mats.set(k, m); return m;
}
// A box standing on its base, wrapped in a group so put() can place it by its base centre.
function boxGroup(w, h, d, hex, opts) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex, opts)); m.position.y = h / 2; g.add(m); return g; }
// A props builder guarded against a stub or a throwing sibling: the fallback box keeps the set standing.
function prop(name, fb, ...args) { try { const g = P[name]?.(...args); if (g?.isObject3D) return g; } catch (e) { /* box below */ } return boxGroup(...fb); }
// SA placement: (x, y) metres, heading degrees (0 north, 90 west), z above the local ground.
function put(parent, obj, x, y, heading = 0, z = 0) { obj.position.set(x, z, -y); obj.rotation.y = heading * D2R; parent.add(obj); return obj; }
// A flat plane on the ground (w along x, d along y), lifted `z` so it layers over the base ground.
function slab(parent, w, d, hex, x, y, z = 0.005) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(hex)); return put(parent, m, x, y, 0, z); }
function tree(h = 8, r = 3.2) { const g = boxGroup(0.5, h * 0.45, 0.5, 0x5a4030); const c = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), mat(0x36602a)); c.position.y = h * 0.45 + r * 0.7; c.scale.set(1, 0.8, 1); g.add(c); return g; }
// A telephone pole with a crossbar along local x; wires are laid separately between poles.
function pole(h = 9) { const g = boxGroup(0.28, h, 0.28, 0x6a5238); const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.14), mat(0x6a5238)); bar.position.y = h - 0.5; g.add(bar); return g; }
function wire(parent, x0, y0, x1, y1, z) {
  const len = Math.hypot(x1 - x0, y1 - y0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), mat(0x1a1a1a));
  m.position.set((x0 + x1) / 2, z, -(y0 + y1) / 2); m.rotation.y = Math.atan2(x1 - x0, -(y1 - y0)); parent.add(m);
}

// Merges every mesh under `src` that shares a material into one world-space mesh per material; objects in `live`
// (gates, the belt, the marker: things a sibling animates or looks up by name) are re-parented untouched.
function bake(src, live = []) {
  src.updateMatrixWorld(true);
  const skip = new Set(); for (const o of live) o.traverse((c) => skip.add(c));
  const lists = new Map(), extras = [], out = new THREE.Group();
  src.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    if (Array.isArray(o.material) || o.isInstancedMesh || !o.geometry?.attributes?.position) { extras.push(o); return; }
    if (!lists.has(o.material)) lists.set(o.material, []); lists.get(o.material).push({ geo: o.geometry, m: o.matrixWorld.clone() });
  });
  for (const [m, list] of lists) { const mesh = new THREE.Mesh(merge(list), m); mesh.matrixAutoUpdate = false; out.add(mesh); }
  for (const o of extras) { const c = o.clone(); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); out.add(c); }
  for (const o of live) { const m = o.matrixWorld.clone(); o.removeFromParent(); m.decompose(o.position, o.quaternion, o.scale); out.add(o); }
  return out;
}
function merge(list) {
  const parts = []; let n = 0;
  for (const { geo, m } of list) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (!g.attributes.normal) g.computeVertexNormals(); g.applyMatrix4(m); parts.push(g); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}

// ---------------- airport interiors (cream walls with the double red stripe, tile ceilings with light panels) ----------------
function wallSeg(parent, x, y, len, heading, h = 6, hex = 0xe6e2da) {
  put(parent, boxGroup(len, h, 0.3, hex), x, y, heading);
  for (const z of [1.0, 1.18]) put(parent, boxGroup(len, 0.07, 0.36, 0xc82a2a), x, y, heading, z);
}
function ceiling(parent, x0, y0, x1, y1, h) {
  let ix = 0; for (let x = x0 + 2; x < x1; x += 4, ix++) { let iy = 0; for (let y = y0 + 2; y < y1; y += 4, iy++) { const light = (ix + iy) % 2 === 0; put(parent, prop('ceilingPanel', [4, 0.1, 4, light ? 0xfff2c0 : 0xd9d6cd], { light, size: 4 }), x, y, 0, h); } }
}
const yellow = { bg: '#f2c81e', fg: '#141414' };

// Francis Intl. check-in (ref-hVj t0006): the lower hall in the south, six steps up to the check-in level along the
// north wall with "JUANK AIR" in big grey letters over the desks and a black R* poster; CJ walks north to the steps.
export function buildLcAirport() {
  const src = new THREE.Group(), live = [], H = 6;
  slab(src, 300, 300, 0x33322f, 0, 0, -0.02);
  slab(src, 44, 19, 0xbcb8ac, 0, -8.5, 0);                                  // the lower hall, y -18..1
  put(src, boxGroup(44, 1.2, 17, 0xc8c4b8), 0, 12.5, 0);                    // the check-in level, y 4..21, top at 1.2
  for (let i = 0; i < 6; i++) put(src, boxGroup(16, 1.0 - 0.2 * i, 0.5, i % 2 ? 0x8c8c88 : 0x969692), 0, 3.75 - 0.5 * i, 0);   // treads 0.5 m, risers 0.2 m
  for (const x of [-8.3, 8.3]) put(src, boxGroup(0.3, 1.9, 3.6, 0xd2cec4), x, 2.5, 0);                                         // step cheeks
  for (const s of [-1, 1]) { put(src, boxGroup(13.5, 1.2, 0.3, 0xd2cec4), s * 15, 4, 0); put(src, boxGroup(0.3, 1.0, 17, 0xd2cec4), s * 8.5, 12.5, 0, 1.2); }   // the level's front face, rails
  wallSeg(src, 0, 21, 44, 0, H); wallSeg(src, 0, -18, 44, 0, H); wallSeg(src, -22, 1.5, 39, 90, H); wallSeg(src, 22, 1.5, 39, 90, H);
  put(src, prop('terminalSign', [14, 1.7, 0.1, 0xa8a8a8], 'JUANK AIR', { w: 14, h: 1.7, bg: 'transparent', fg: '#b0b0ae' }), 3, 20.8, 180, 3.4);
  put(src, prop('sign', [1.3, 1.3, 0.05, 0x101010], 'R', 0x101010, { post: false, w: 1.3, h: 1.3 }), -9.5, 20.75, 0, 2.5);
  put(src, boxGroup(5, 3.2, 0.12, 0x2c3e50), 14, 20.7, 0, 1.2); for (const x of [11.2, 16.8]) put(src, prop('pillar', [0.6, 4.6, 0.6, 0xd2cec4], 4.6), x, 20.2, 0, 1.2);   // the glass doorway
  for (const x of [-14, -8, 2, 8]) put(src, prop('airportCounter', [4, 1.1, 0.95, 0x4b5468]), x, 10.2, 180, 1.2);
  for (const [x, y] of [[-10, 8], [10, 8], [-10, -6], [10, -6], [-10, -14], [10, -14]]) put(src, prop('pillar', [0.6, H, 0.6, 0xd2cec4], H - (y > 4 ? 1.2 : 0)), x, y, 0, y > 4 ? 1.2 : 0);
  ceiling(src, -22, -18, 22, 21, H);
  for (const [x, y] of [[-16, -12], [-13.5, -12], [13.5, -12], [16, -12]]) put(src, prop('bench', [1.9, 0.9, 0.6, 0x2a3352]), x, y, 0);
  put(src, prop('terminalSign', [4, 0.8, 0.06, 0x161616], 'Departures', { w: 4, h: 0.8 }), -12, 0.5, 0, 3.2);
  put(src, prop('terminalSign', [4, 0.8, 0.06, 0x161616], 'Check-in', { w: 3.6, h: 0.8 }), 12, 0.5, 0, 3.2);
  const anchors = { 'lc.counter': A(2, 9.2, 1.2, 0), 'lc.steps': A(0, -2.5, 0, 0), 'lc.stepsBottom': A(0, 1, 0, 0), 'lc.walkStart': A(0, -9, 0, 0), 'lc.exit': A(0, -16, 0, 180) };
  return { group: bake(src, live), anchors, mapData: null, walkable: () => true, groundZ: () => 0 };
}

// Los Santos arrivals (ref-hVj t0011, t0020, t0022): the belt out of a dark tunnel in a rough-concrete wall, the yellow
// "Baggage" sign, a low tile ceiling with a lit panel, yellow "Customs" / "Immigration" boards on the way to the doors,
// the airport name board on the north wall, and the taxi rank road outside the south doors.
export function buildLsAirport() {
  const src = new THREE.Group(), live = [], H = 4.6;
  slab(src, 400, 400, 0x33322f, 0, 0, -0.02);
  slab(src, 44, 34, 0xb4b0a4, 0, -1, 0);                                    // the hall: x -22..22, y -18..16
  wallSeg(src, 0, 16, 44, 0, H); wallSeg(src, -22, -1, 34, 90, H); wallSeg(src, 22, -1, 34, 90, H);
  wallSeg(src, -10.5, -18, 23, 0, H); wallSeg(src, 16, -18, 12, 0, H);     // south wall with the doorway at x 1..10
  put(src, boxGroup(9, 3.2, 0.12, 0x2c3e50), 5.5, -18, 0); for (const x of [1, 10]) put(src, prop('pillar', [0.6, H, 0.6, 0xd2cec4], H), x, -17.7, 0);
  // the baggage tunnel: a partition wall at x -8.5 with a 6.4 m opening between concrete piers, black inside
  put(src, boxGroup(0.5, H, 9.5, 0xe6e2da), -8.5, 11.25, 0); put(src, boxGroup(0.5, H, 11.5, 0xe6e2da), -8.5, -12.25, 0);
  for (const y of [-3.9, 3.9]) put(src, boxGroup(1.1, 2.8, 1.1, 0xcfcbc0), -8.5, y, 0);
  put(src, boxGroup(0.5, H - 2.8, 8.8, 0xe6e2da), -8.5, 0, 0, 2.8);
  for (const z of [1.0, 1.18]) for (const [y, len] of [[11.25, 9.5], [-12.25, 11.5]]) put(src, boxGroup(0.56, 0.07, len, 0xc82a2a), -8.5, y, 0, z);
  put(src, boxGroup(10, 3.2, 6.8, 0x141414, { side: THREE.BackSide }), -13.7, 0, 0);   // the tunnel: back faces only, so the hole reads dark
  const belt = prop('baggageBelt', [1.2, 0.6, 26, 0x3a3a3c], 26); put(src, belt, -5, 0, 90); live.push(belt); belt.name = 'belt';
  put(src, prop('terminalSign', [3, 0.7, 0.06, 0xf2c81e], 'Baggage', { w: 3, h: 0.7, ...yellow }), -3.5, 0, 0, 2.2);
  for (const [x, y] of [[-16, 9], [-16, -9], [3, 9], [15, 9], [15, -9]]) put(src, prop('pillar', [0.6, H, 0.6, 0xd2cec4], H), x, y, 0);
  ceiling(src, -22, -18, 22, 16, H);
  put(src, prop('terminalSign', [2.6, 0.6, 0.06, 0xf2c81e], 'Customs', { w: 2.6, h: 0.6, ...yellow }), 4, -6, 0, 3.0);
  put(src, prop('terminalSign', [3.4, 0.6, 0.06, 0xf2c81e], 'Immigration', { w: 3.4, h: 0.6, ...yellow }), 7.5, -10, 0, 3.0);
  put(src, prop('terminalSign', [9, 0.9, 0.06, 0x161616], 'Los Santos International Airport', { w: 9, h: 0.9, fg: '#f2d060', hang: false }), 6, 15.7, 180, 2.9);
  put(src, prop('terminalSign', [4, 0.8, 0.06, 0x161616], 'Arrivals', { w: 3.6, h: 0.8 }), -14, 14, 0, 3.0);
  for (const x of [16, 18.5]) put(src, prop('bench', [1.9, 0.9, 0.6, 0x2a3352]), x, 2, 90);
  // outside: a concrete apron, the taxi rank road along y -24, a kerb, palms, a lamp
  slab(src, 90, 20, 0xa8a49a, 0, -21, 0); put(src, prop('roadSegment', [7, 0.02, 80, 0x4a4a4a], 80, 2), 0, -24, 90);
  put(src, prop('sidewalk', [2, 0.15, 80, 0x9a9384], 80, 2), 0, -19.5, 90); put(src, prop('sidewalk', [2, 0.15, 80, 0x9a9384], 80, 2), 0, -28.5, 90);
  for (const x of [-14, 20]) put(src, prop('palm', [0.4, 8, 0.4, 0x3f7a2a], 8), x, -19.5, 0); put(src, prop('streetLamp', [0.2, 7.5, 0.2, 0x5e5f58]), -3, -19.5, 0);
  const anchors = { 'ls.beltStart': A(-6, 0, 0.56, 270), 'ls.beltEnd': A(7, 0, 0.56, 270), 'ls.exit': A(6, -11, 0, 180), 'ls.doors': A(5.5, -18, 0, 180), 'ls.taxi': A(12, -24, 0, 90) };
  return { group: bake(src, live), anchors, mapData: null, walkable: () => true, groundZ: () => 0, belt };
}

// ---------------- Los Santos ----------------
const X0 = 2100, X1 = 2560, Y0 = -1760, Y1 = -1200, LANE = 3.5;
const NS = [2140, 2200, 2300, 2360, 2420, 2520];                  // north-south streets (2 lanes); 2300 carries the ride to the crossing
const EWS = [                                                      // east-west streets: the start road holds the cruiser's westbound lane at y -1254
  { y: -1210, lanes: 2 }, { y: -1258, lanes: 4, x0: 2303.5, name: 'start' }, { y: -1310, lanes: 2 }, { y: -1394, lanes: 2, noNorth: true, name: 'row' },
  { y: -1500, lanes: 2 }, { y: -1610, lanes: 2 }, { y: -1730, lanes: 4, name: 'boulevard' },
];
for (const r of EWS) { r.hw = r.lanes * LANE / 2; r.x0 ??= X0; r.x1 ??= X1; }
const RAIL = { tracks: [-1381, -1385, -1389], y0: -1391, y1: -1376.5, xing: 2300 };
const ALLEY = { y: -1262, y0: -1266, y1: -1258, x0: 2203.5, x1: 2296.5 };
const COLS = [[X0, 2136.5], [2143.5, 2196.5], [2203.5, 2296.5], [2303.5, 2356.5], [2363.5, 2416.5], [2423.5, 2516.5], [2523.5, X1]];
const CUTS = [[-1213.5, -1206.5], [-1313.5, -1306.5], [-1397.5, RAIL.y1], [-1503.5, -1496.5], [-1613.5, -1606.5], [-1737, -1723]];
const START_CUT = [-1265, -1251];
const ROWNAME = { '-1213.5': 'r0', '-1265': 'r0s', '-1313.5': 'r1', '-1397.5': 'r2', '-1503.5': 'r3', '-1613.5': 'r4', '-1737': 'r5' };
const TYPES = {   // per row, one entry per column
  r0: ['houses', 'houses', 'alley', 'shops:S', 'houses', 'shops:S', 'houses'],
  r0s: [null, null, null, 'houses', 'apartments', 'houses', 'houses'],
  r1: ['lot', 'industrial', 'yard', 'warehouse', 'industrial', 'apartments', 'lot'],
  r2: ['houses', 'houses', 'shops:N', 'houses', 'apartments', 'houses', 'houses'],
  r3: ['lot', 'houses', 'houses', 'shops:N', 'houses', 'houses', 'houses'],
  r4: ['houses', 'apartments', 'houses', 'houses', 'shops:S', 'grove', 'houses'],
  r5: ['shops:N', 'shops:N', 'lot', 'shops:N', 'shops:N', 'shops:N', 'lot'],
};
const GROUND = { houses: [0x8e9060, '#8b8666'], shops: [0xb0aa9c, '#7d7972'], apartments: [0xb0aa9c, '#767169'], industrial: [0xb4ae9e, '#6e6a62'], lot: [0xa89868, '#a09a74'], yard: [0xa89868, '#6e6a62'], warehouse: [0xb0aa9c, '#6e6a62'], alley: [0x8e9060, '#8b8666'], grove: [0x8e9060, '#8b8666'] };
const HOUSE_COLORS = [0xd8c4a0, 0xc8b89a, 0xb8a888, 0xd0c0b0, 0xc4b494, 0xa8b0a0, 0xd8d0c0, 0xc0a890, 0xb0b8b0, 0xe0d8c0];
const ROOFS = [0x5a4636, 0x6a5a4a, 0x4a4a4a, 0x7a4a3a, 0x3f5a3f, 0x6a6a60];
const SHOP_COLORS = [0xd8c0a0, 0xc8b090, 0xb8a888, 0xe0d0b0, 0xc0c0b0, 0xd8b8a0, 0xa8a898, 0xe8dcc0];
const APT_COLORS = [0xb8a88e, 0xa89a80, 0xc0b0a0, 0x9a8a7a, 0xd0c8b8, 0xb0a090];
const SHOPS = ['LIQUOR', 'DONUTS', 'PAWN', 'MARKET', 'TACOS', 'BARBER', 'LAUNDRY', 'CHECKS CASHED', 'AUTO PARTS', '24-7', 'BURGERS', 'TATTOO', 'LOANS', 'PIZZA', 'CAR WASH', 'MOTEL', 'BAIL BONDS', 'GROCERY', 'NAILS', 'DISCOUNT', 'FISH', 'RECORDS', 'FURNITURE', 'CHICKEN', 'JEWELRY', 'PHARMACY', 'VIDEO', 'TIRES', 'BEER', 'CAFE'];

// Rows of a column: the gaps between the street cuts that apply to it, north to south, at least 12 m deep.
function rowsFor(c) {
  const cuts = CUTS.slice(); if (c >= 3) cuts.push(START_CUT); cuts.sort((a, b) => b[1] - a[1]);
  const rows = []; let top = Y1;
  for (const [lo, hi] of cuts) { if (top - hi >= 12) rows.push([hi, top]); top = lo; }
  if (top - Y0 >= 12) rows.push([Y0, top]); return rows;
}
function houseAt(W, x, y, heading, o = {}) {
  const w = o.w ?? W.rng.range(9, 11.5), d = o.d ?? W.rng.range(8, 10), h = o.h ?? W.rng.range(3.8, 4.6);
  const color = o.color ?? W.rng.pick(HOUSE_COLORS), roof = o.roof ?? W.rng.pick(ROOFS), trim = o.trim ?? 0xf0ece2;
  put(W.g, prop('house', [w, h, d, color], { w, d, h, color, roof, trim }), x, y, heading);
  const along = heading % 180 === 0, hx = along ? w / 2 : d / 2, hy = along ? d / 2 : w / 2; W.solid(x - hx, y - hy, x + hx, y + hy);
}
function buildingAt(W, x, y, heading, o) {
  put(W.g, prop('building', [o.w, o.h, o.d, o.color], o), x, y, heading);
  const along = heading % 180 === 0, hx = along ? o.w / 2 : o.d / 2, hy = along ? o.d / 2 : o.w / 2; W.solid(x - hx, y - hy, x + hx, y + hy);
}
function palmAt(W, x, y, h = 8) { put(W.g, prop('palm', [0.4, h, 0.4, 0x3f7a2a], h), x, y, W.rng.range(0, 360)); }
function fenceAt(W, x, y, len, heading, h = 1.8) { put(W.g, prop('fence', [len, h, 0.1, 0x8a8a86], len, h), x, y, heading); if (heading % 180 === 0) W.solid(x - len / 2, y - 0.15, x + len / 2, y + 0.15); else W.solid(x - 0.15, y - len / 2, x + 0.15, y + len / 2); }
function fenceRect(W, x0, y0, x1, y1, gapN = true) {
  const w = x1 - x0, d = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (gapN) { const s = (w - 6) / 2; fenceAt(W, x0 + s / 2, y1, s, 0); fenceAt(W, x1 - s / 2, y1, s, 0); } else fenceAt(W, cx, y1, w, 0);
  fenceAt(W, cx, y0, w, 0); fenceAt(W, x0, cy, d, 90); fenceAt(W, x1, cy, d, 90);
}
// Houses along the north and/or south frontage: 6 m of yard behind the sidewalk, palms and fences in some yards.
function fillHouses(W, x0, y0, x1, y1, { N = true, S = true } = {}) {
  const rows = []; if (N) rows.push({ y: y1 - 10.75, h: 0 }); if (S && (!N || y1 - y0 >= 36)) rows.push({ y: y0 + 10.75, h: 180 });
  for (const r of rows) {
    const pitch = 13.5, n = Math.max(1, Math.floor((x1 - x0 - 3) / pitch)), start = x0 + ((x1 - x0) - (n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) {
      const x = start + i * pitch + W.rng.range(-0.6, 0.6); houseAt(W, x, r.y + W.rng.range(-0.8, 0.8), r.h);
      const front = r.h === 0 ? y1 : y0, s = r.h === 0 ? -1 : 1;
      if (W.rng() < 0.4) palmAt(W, x + W.rng.range(-6, 6), front + s * 3.2, W.rng.range(6, 10));
      if (W.rng() < 0.3) fenceAt(W, x, front + s * 2.3, 11, 0, 1.2);
    }
  }
}
// A strip of shop fronts with signs right behind the sidewalk of one frontage.
function fillShops(W, x0, y0, x1, y1, edge = 'N') {
  let x = x0 + 1.5; const front = edge === 'N' ? y1 - 2.4 : y0 + 2.4;
  while (x < x1 - 8) {
    const w = Math.min(x1 - 1.5 - x, W.rng.range(9, 15)), d = W.rng.range(11, 16), h = W.rng.range(4.4, 7.6);
    buildingAt(W, x + w / 2, edge === 'N' ? front - d / 2 : front + d / 2, edge === 'N' ? 0 : 180, { w, d, h, color: W.rng.pick(SHOP_COLORS), sign: W.rng.pick(SHOPS) });
    x += w + W.rng.range(0, 1.5);
  }
  if (y1 - y0 > 60) fillHouses(W, x0, y0, x1, y1, { N: edge !== 'N', S: edge === 'N' });
}
function fillApartments(W, x0, y0, x1, y1) {
  const n = x1 - x0 > 70 ? 2 : 1, w = (x1 - x0 - 8 - (n - 1) * 8) / n, d = Math.min(y1 - y0 - 12, W.rng.range(16, 22));
  for (let i = 0; i < n; i++) buildingAt(W, x0 + 4 + w / 2 + i * (w + 8), (y0 + y1) / 2 + W.rng.range(-3, 3), 0, { w, d, h: W.rng.range(9, 14), color: W.rng.pick(APT_COLORS), windows: true });
  for (let i = 0; i < 3; i++) palmAt(W, W.rng.range(x0 + 3, x1 - 3), W.rng.range(0, 1) < 0.5 ? y1 - 3.5 : y0 + 3.5, W.rng.range(7, 11));
}
function fillIndustrial(W, x0, y0, x1, y1) {
  const w = Math.min(x1 - x0 - 10, W.rng.range(28, 44)), d = Math.min(y1 - y0 - 14, W.rng.range(16, 22)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  buildingAt(W, cx + W.rng.range(-3, 3), cy + W.rng.range(-2, 2), 0, { w, d, h: W.rng.range(5, 7), color: W.rng.pick([0x9a7a5a, 0xb0a898, 0x8a8a80, 0xc8c0b0]), windows: false });
  for (let i = 0; i < 4; i++) put(W.g, boxGroup(2.2, 1.3, 2.2, W.rng.pick([0x7a3a22, 0x556070, 0x8a7a50])), W.rng.range(x0 + 4, x1 - 4), y0 + W.rng.range(3, 6), W.rng.range(0, 90));
  fenceRect(W, x0 + 2.2, y0 + 2.2, x1 - 2.2, y1 - 2.2); put(W.g, prop('streetLamp', [0.2, 7.5, 0.2, 0x5e5f58]), x0 + 4, y1 - 5, 180);
}
function fillLot(W, x0, y0, x1, y1) {
  fenceRect(W, x0 + 2.2, y0 + 2.2, x1 - 2.2, y1 - 2.2);
  for (let i = 0; i < 3; i++) palmAt(W, W.rng.range(x0 + 4, x1 - 4), W.rng.range(y0 + 4, y1 - 4), W.rng.range(6, 10));
  for (let i = 0; i < 2; i++) put(W.g, tree(W.rng.range(6, 9), W.rng.range(2.5, 3.5)), W.rng.range(x0 + 5, x1 - 5), W.rng.range(y0 + 5, y1 - 5));
  put(W.g, boxGroup(2.4, 1.4, 1.4, 0x3a5a3a), x0 + 5, y1 - 6, 0);                                  // a dumpster
}
// The Jefferson alley block (ref-hVj4 t0186-t0204): a low block wall with a kerb on the north side, a house and palms
// behind it; the tall wall on the south side (an open driveway west of it keeps the ride's end shot clear), trees over
// both walls, a dark apartment block at the east end, a telephone pole; dirt floor between.
function alleyBlock(W) {
  const [x0, x1] = [ALLEY.x0, ALLEY.x1];
  fillHouses(W, x0, ALLEY.y1, x1, -1213.5, { N: true, S: false });
  houseAt(W, 2229, -1247.5, 0, { w: 11, d: 9, h: 4.2, color: 0xd0bca0, roof: 0x5a4636 });
  houseAt(W, 2265, -1248, 0, { w: 10, d: 9, h: 4.0, color: 0xc4b494 });
  palmAt(W, 2212, -1255.3, 9); palmAt(W, 2241, -1254.8, 8.5); palmAt(W, 2251.5, -1256, 10.5); put(W.g, tree(9, 3.8), 2220, -1251);
  slab(W.g, x1 - x0, ALLEY.y1 - ALLEY.y0, 0x8c7b64, (x0 + x1) / 2, ALLEY.y, 0.012);
  put(W.g, boxGroup(45, 0.15, 0.8, 0xa09a8e), 2227.5, ALLEY.y1 - 0.6, 0);                             // the kerb under the low wall
  put(W.g, prop('wall', [45, 1.4, 0.35, 0xb89870], 45, 1.4, 0xb89870), 2227.5, ALLEY.y1, 0); W.solid(2205, ALLEY.y1 - 1.0, 2250, ALLEY.y1 + 0.2);
  fenceAt(W, 2273.25, ALLEY.y1, 46.5, 0);
  put(W.g, prop('wall', [33, 3.0, 0.35, 0xb08a5c], 33, 3.0, 0xb08a5c), 2233.5, ALLEY.y0, 0); W.solid(2217, ALLEY.y0 - 0.2, 2250, ALLEY.y0 + 0.2);
  put(W.g, prop('fence', [14, 1.2, 0.1, 0x8a8a86], 14, 1.2), 2224, ALLEY.y0, 0, 3.08);                   // chain-link on top of the tall wall
  put(W.g, prop('wall', [46.5, 1.8, 0.35, 0xb08a5c], 46.5, 1.8, 0xb08a5c), 2273.25, ALLEY.y0, 0); W.solid(2250, ALLEY.y0 - 0.2, 2296.5, ALLEY.y0 + 0.2);
  put(W.g, tree(9, 3.4), 2236, -1272); put(W.g, tree(7, 3), 2258, -1270.5); put(W.g, boxGroup(2.4, 1.4, 1.4, 0x3a5a3a), 2210, -1270, 0);
  buildingAt(W, 2280, -1284, 0, { w: 26, d: 16, h: 7.5, color: 0x8a7a6a, windows: true });
  fillHouses(W, x0, -1306.5, 2262, -1268, { N: false, S: true });
  put(W.g, pole(9), 2296, -1256.8); put(W.g, pole(9), 2206, -1256.8); wire(W.g, 2206, -1256.8, 2296, -1256.8, 8.55); wire(W.g, 2206.3, -1256.1, 2296.3, -1256.1, 8.55);
}
// The Grove Street cul-de-sac: a 2-lane stub east from the 2420 street into a bulb, houses on both sides, the Johnson
// house (green) at the south-east end with the red marker at its steps; the billboard building on the boulevard behind.
function groveBlock(W) {
  const [x0, x1] = [2423.5, 2516.5], y = -1668;
  fillHouses(W, x0, -1648, x1, -1613.5, { N: true, S: false });
  put(W.g, prop('roadSegment', [7, 0.02, 64.5, 0x4a4a4a], 64.5, 2), (x0 + 2488) / 2, y, 90);
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(9.5, 24).rotateX(-Math.PI / 2), mat(0x4b4b4b)); put(W.g, bulb, 2487, y, 0, 0.008);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9.5, 11.5, 24).rotateX(-Math.PI / 2), mat(0x9a9384)); put(W.g, ring, 2487, y, 0, 0.15);
  for (const s of [-1, 1]) put(W.g, prop('sidewalk', [2, 0.15, 56, 0x9a9384], 56, 2), 2453.5, y + s * 4.5, 90);
  const r = [[x0, y], [2492, y]]; r.width = 7; W.map.roads.push(r);
  const colors = [0x9fb896, 0xd8d0b8, 0xb8c8b0, 0xc8b89a];
  for (let i = 0; i < 4; i++) { houseAt(W, 2434 + i * 14, -1652.5, 180, { color: colors[i % 4] }); houseAt(W, 2434 + i * 14, -1683.5, 0, { color: colors[(i + 2) % 4] }); }
  houseAt(W, 2495.2, -1694.5, 0, { w: 11, d: 10, h: 4.6, color: 0x8fae86, roof: 0x3f5a3f, trim: 0xe8f0e0 });
  const marker = prop('redMarker', [2, 2.2, 2, 0xff2828], 1.0, 2.2); marker.name = 'redMarker'; put(W.g, marker, 2495.2, -1687, 0, 0.02); W.live.push(marker);
  put(W.g, prop('sign', [1.4, 0.5, 0.04, 0x2e8a3c], 'Grove St', 0x2e8a3c, { w: 1.6, h: 0.4, y: 2.6 }), 2426, -1662, 0);
  palmAt(W, 2441, -1661, 9); palmAt(W, 2468, -1675, 8); palmAt(W, 2500, -1676, 10); palmAt(W, 2482, -1660.5, 7.5); put(W.g, tree(8, 3.4), 2510, -1690);
  fenceAt(W, 2462, -1678.5, 24, 0, 1.2); fenceAt(W, 2448, -1657.5, 24, 0, 1.2);
  buildingAt(W, 2470, -1712.5, 180, { w: 26, d: 12, h: 4.5, color: 0xc8b49a, sign: 'LIQUOR' });
  buildingAt(W, 2508, -1713, 180, { w: 14, d: 10, h: 4.2, color: 0xd0b8a0, sign: 'TACOS' });          // the pull-over's low building, the billboard over its roof (ref-intro-rest t0146)
  put(W.g, prop('billboard', [8, 10.5, 0.4, 0x2e2e2e], 'LOS SANTOS'), 2508, -1706.5, 180);
  put(W.g, prop('billboard', [8, 10.5, 0.4, 0x2e2e2e], 'CLUCKIN BELL'), 2536, -1721.5, 180);          // ahead-left of the pulled-over taxi
  buildingAt(W, 2438, -1713, 180, { w: 20, d: 12, h: 5.5, color: 0xd8c0a0, sign: 'DONUTS' });
}
// North of the crossing: the long white warehouse with skylight ridges and a loading dock (ref-hVj2 t0138-t0141).
function warehouseBlock(W) {
  buildingAt(W, 2331, -1345, 0, { w: 48, d: 20, h: 6.2, color: 0xe4e0d4, windows: false });
  for (let i = 0; i < 4; i++) put(W.g, boxGroup(46, 1.1, 2.6, 0xd8d4c8), 2331, -1338 - i * 4.6, 0, 6.5);
  put(W.g, boxGroup(46, 1.0, 3, 0xa8a49a), 2331, -1357, 0);
  put(W.g, prop('streetLamp', [0.2, 7.5, 0.2, 0x5e5f58]), 2310, -1362, 270); put(W.g, prop('streetLamp', [0.2, 7.5, 0.2, 0x5e5f58]), 2350, -1362, 90);
  fenceAt(W, 2338.5, RAIL.y1, 36, 0);
  for (let i = 0; i < 3; i++) put(W.g, boxGroup(2.2, 1.3, 2.2, 0x556070), 2306 + i * 3, -1366, 0);
}
// West of the crossing: the rail yard, a rusty shed, a siding, crates, the yard lamps.
function yardBlock(W) {
  buildingAt(W, 2248, -1330, 0, { w: 40, d: 18, h: 5.5, color: 0x9a7a5a, windows: false });
  put(W.g, prop('railTrack', [3.4, 0.2, 70, 0x7a7264], 70), 2250, -1362, 90);
  for (let i = 0; i < 5; i++) put(W.g, boxGroup(2.4, 2.4, 6, W.rng.pick([0x7a3a22, 0x556070, 0x8a7a50])), 2212 + i * 4, -1352, 90);
  put(W.g, prop('streetLamp', [0.2, 7.5, 0.2, 0x5e5f58]), 2280, -1366, 90); put(W.g, boxGroup(3, 4, 3, 0x8a8a80), 2210, -1368, 0);
  fenceAt(W, 2250, -1315.5, 80, 0);
}
function fill(W, type, c, x0, y0, x1, y1) {
  const kind = type.split(':')[0], [hex, css] = GROUND[kind] || GROUND.lot;
  slab(W.g, x1 - x0, y1 - y0, hex, (x0 + x1) / 2, (y0 + y1) / 2, 0.005); W.map.blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, color: css });
  switch (kind) {
    case 'houses': fillHouses(W, x0, y0, x1, y1); break;
    case 'shops': fillShops(W, x0, y0, x1, y1, type.endsWith(':S') ? 'S' : 'N'); break;
    case 'apartments': fillApartments(W, x0, y0, x1, y1); break;
    case 'industrial': fillIndustrial(W, x0, y0, x1, y1); break;
    case 'lot': fillLot(W, x0, y0, x1, y1); break;
    case 'alley': alleyBlock(W); break;
    case 'grove': groveBlock(W); break;
    case 'warehouse': warehouseBlock(W); break;
    case 'yard': yardBlock(W); break;
    default: break;
  }
}

// Streets: east-west roads run continuous, north-south roads in segments between them, crosswalk tiles on top; sidewalks
// stop short of every corner; the rail corridor gets planks, embedded rails and the gate at the 2300 crossing.
function streets(W) {
  const road = (len, lanes) => prop('roadSegment', [lanes * LANE, 0.02, len, 0x4a4a4a], len, lanes), walk = (len) => prop('sidewalk', [2, 0.15, len, 0x9a9384], len, 2);
  for (const r of EWS) {
    put(W.g, road(r.x1 - r.x0, r.lanes), (r.x0 + r.x1) / 2, r.y, 90); const m = [[r.x0, r.y], [r.x1, r.y]]; m.width = r.lanes * LANE; W.map.roads.push(m);
    for (const [cx0, cx1] of COLS) { if (cx0 < r.x0) continue; for (const s of r.noNorth ? [-1] : [-1, 1]) put(W.g, walk(cx1 - cx0), (cx0 + cx1) / 2, r.y + s * (r.hw + 1), 90); }
  }
  for (const x of NS) {
    const cross = EWS.filter((r) => r.x0 <= x - 3.5); const cuts = cross.map((r) => [r.y - r.hw, r.y + r.hw]).sort((a, b) => b[0] - a[0]);
    let top = Y1; for (const [lo, hi] of cuts) { put(W.g, road(top - hi, 2), x, (top + hi) / 2, 0); top = lo; } put(W.g, road(top - Y0, 2), x, (top + Y0) / 2, 0);
    const m = [[x, Y0], [x, Y1]]; m.width = 7; W.map.roads.push(m);
    for (const r of cross) { const tiles = r.lanes === 2 ? [0] : [-3.5, 3.5]; for (const dy of tiles) put(W.g, prop('intersection', [7, 0.02, 7, 0x4a4a4a], 2), x, r.y + dy, 0, 0.005); }
    for (const s of [-1, 1]) {
      const side = cuts.concat([[-1397.5, RAIL.y1]]);
      if (x === 2300 && s > 0) side.push(START_CUT); if ((x === 2300 && s < 0) || (x === 2200 && s > 0)) side.push([ALLEY.y0 - 0.2, ALLEY.y1 + 0.2]); if (x === 2420 && s > 0) side.push([-1671.5, -1664.5]);
      side.sort((a, b) => b[0] - a[0]); let t = Y1;
      for (const [lo, hi] of side) { if (t - hi >= 5) put(W.g, walk(t - hi - 4), x + s * 4.5, (t + hi) / 2, 0); t = Math.min(t, lo); }
      if (t - Y0 >= 5) put(W.g, walk(t - Y0 - 4), x + s * 4.5, (t + Y0) / 2, 0);
    }
  }
  // the rail corridor: three tracks across the whole width, dirt between, fences except where the yards open onto it
  slab(W.g, X1 - X0, RAIL.y1 - RAIL.y0 + 2, 0x9a8c74, (X0 + X1) / 2, (RAIL.y0 + RAIL.y1) / 2, 0.003);
  for (const y of RAIL.tracks) { for (const [cx0, cx1] of COLS) put(W.g, prop('railTrack', [3.4, 0.2, cx1 - cx0, 0x7a7264], cx1 - cx0), (cx0 + cx1) / 2, y, 90); W.map.rails.push([[X0, y], [X1, y]]); }
  for (const c of [0, 1, 4, 5, 6]) { const [cx0, cx1] = COLS[c]; fenceAt(W, (cx0 + cx1) / 2, RAIL.y1, cx1 - cx0, 0); }
  for (const x of NS) { put(W.g, boxGroup(8, 0.12, 15, 0x5a5652), x, -1385, 0, 0.02); for (const y of RAIL.tracks) for (const dx of [-0.72, 0.72]) put(W.g, boxGroup(8, 0.04, 0.07, 0x9a9a98), x, y + dx, 0, 0.14); }
  const gate = prop('railCrossingGate', [0.5, 4.4, 0.5, 0xe8e8e2]); put(W.g, gate, 2294.6, -1374.4, 0); W.live.push(gate); W.gates.push(gate);
  const gate2 = prop('railCrossingGate', [0.5, 4.4, 0.5, 0xe8e8e2]); put(W.g, gate2, 2305.4, -1391.6, 180); W.live.push(gate2); W.gates.push(gate2);
  put(W.g, boxGroup(1.2, 2.2, 1.2, 0x9a9a94), 2286, -1378.5, 0);                                     // relay hut, west of the gate
  // the alley's own map line
  const alley = [[ALLEY.x0, ALLEY.y], [ALLEY.x1, ALLEY.y]]; alley.width = 5; alley.color = '#a39a82'; W.map.roads.push(alley);
}
// Street furniture: cobra-head lamps, kerb palms, telephone poles with wires, mast-arm signals, a few billboards.
function furniture(W) {
  const lamp = () => prop('streetLamp', [0.2, 7.5, 0.2, 0x5e5f58]);
  const nearNS = (x, d) => NS.some((nx) => Math.abs(nx - x) < d), nearEW = (y, d) => EWS.some((r) => Math.abs(r.y - y) < d) || (y < RAIL.y1 + 8 && y > RAIL.y0 - 8);
  for (const r of EWS) {
    let k = 0; for (let x = r.x0 + 22; x < r.x1 - 10; x += 44, k++) { if (nearNS(x, 6)) continue; const s = r.noNorth ? -1 : k % 2 ? 1 : -1; put(W.g, lamp(), x, r.y + s * (r.hw + 1.0), s > 0 ? 180 : 0); }
    k = 0; for (let x = r.x0 + 12; x < r.x1 - 8; x += 31, k++) { if (nearNS(x, 5)) continue; const s = r.noNorth ? -1 : k % 2 ? -1 : 1; palmAt(W, x, r.y + s * (r.hw + 1.3), W.rng.range(6.5, 10)); }
    if (r.name === 'boulevard' || r.name === 'start' || r.y === -1210 || r.y === -1500) { const s = r.name === 'start' ? 1 : -1, y = r.y + s * (r.hw + 1.6); let px = null; for (let x = r.x0 + 8; x < r.x1; x += 38) { if (nearNS(x, 5)) x += 6; put(W.g, pole(9), x, y, 90); if (px != null) { wire(W.g, px, y - 0.7, x, y - 0.7, 8.55); wire(W.g, px, y + 0.7, x, y + 0.7, 8.55); } px = x; } }
  }
  for (const x of NS) { let k = 0; for (let y = Y1 - 30; y > Y0 + 10; y -= 48, k++) { if (nearEW(y, 9)) continue; const s = k % 2 ? 1 : -1; put(W.g, lamp(), x + s * 4.5, y, s > 0 ? 90 : 270); } }
  const signals = [[2300, -1310], [2360, -1258], [2200, -1394], [2300, -1394], [2420, -1610], [2300, -1730], [2420, -1730], [2520, -1730], [2140, -1730], [2200, -1500]];
  for (const [x, y] of signals) {
    const r = EWS.find((q) => q.y === y); if (!r) continue;
    const sw = prop('trafficLight', [0.3, 6.2, 0.3, 0x55564a]); put(W.g, sw, x - 4.7, y - r.hw - 1.2, 0);
    const ne = prop('trafficLight', [0.3, 6.2, 0.3, 0x55564a]); put(W.g, ne, x + 4.7, y + r.hw + 1.2, 180);
    for (const t of [sw, ne]) try { t.userData.setSignal?.('red'); } catch (e) { /* static */ }
  }
  for (const [x, y, h, text] of [[2340, -1226, 180, 'GROVE'], [2470, -1470, 0, 'SPRUNK'], [2150, -1450, 180, 'CLUCKIN'], [2230, -1520, 0, 'ZIP'], [2545, -1345, 90, 'RADIO LS']]) put(W.g, prop('billboard', [8, 10.5, 0.4, 0x2e2e2e], text), x, y, h);
}

export function buildLosSantos() {
  const src = new THREE.Group(); src.position.y = GROUND_Z;
  const solids = [], W = { g: src, rng: makeRng(2004), live: [], gates: [], map: { roads: [], blocks: [], rails: [] }, solid: (x0, y0, x1, y1) => solids.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]) };
  slab(src, 1400, 1400, 0xb09468, (X0 + X1) / 2, (Y0 + Y1) / 2, -0.06);
  streets(W);
  COLS.forEach(([cx0, cx1], c) => { for (const [ry0, ry1] of rowsFor(c)) { const type = TYPES[ROWNAME[String(ry1)]]?.[c]; if (type) fill(W, type, c, cx0, ry0, cx1, ry1); } });
  furniture(W);
  for (const g of W.gates) try { g.userData.setDown?.(1); } catch (e) { /* static */ }   // the crossing is only ever seen with the train in it
  const group = bake(src, W.live);
  const z = GROUND_Z;
  // The ride (cutscene.js derives the cruiser's path from these: south on x = crossingStop.x, west on y = crossingStop.y - 24,
  // north on x = alleyStop.x - 12, then east into the alley and 120 m on along alleyStop.heading).
  const anchors = {
    'pullover.taxi': A(2497, -1735.4, z, 265), 'pullover.copcar': A(2505.5, -1733.2, z, 240), 'pullover.cjOut': A(2498.6, -1736.6, z + 0.04, 300), 'pullover.kneel': A(2500, -1736.4, z + 0.04, 300),
    'ride.start': A(2431.61, -1254.06, 22.83, 89.5), 'ride.crossingStop': A(2300, -1370, 22.83, 180), 'ride.trainStart': A(2180, -1385, z, 270),
    'ride.row': A(2250, -1394, 22.83, 90), 'ride.column': A(2200, -1330, 22.83, 0), 'ride.alleyStop': A(2212, -1260.6, 22.83, 270),
    'alley.cj': A(2239.37, -1261.94, 22.94, 272.6), 'alley.bmx': A(2246.51, -1263.09, 22.95, 285),
    'grove.enter': A(2428, -1668, z, 270), 'grove.marker': A(2495.2, -1687, z, 0),
  };
  const paths = { ride: [[2431.61, -1254.06], [2306, -1254.5], [2300, -1262], [2300, -1368], [2300, -1387], [2293, -1394], [2207, -1394], [2200, -1387], [2200, -1268], [2207, -1260.6], [2212, -1260.6], [2332, -1260.6]] };
  const mapData = {
    bounds: { x0: X0, y0: Y0, x1: X1, y1: Y1 }, roads: W.map.roads, blocks: W.map.blocks, rails: W.map.rails,
    zones: [
      { name: 'Grove Street', x0: 2426.7, y0: -1688, x1: 2516.7, y1: -1648 },
      { name: 'Jefferson', x0: X0, y0: RAIL.y1, x1: 2300, y1: Y1 }, { name: 'East Los Santos', x0: 2300, y0: RAIL.y1, x1: X1, y1: Y1 },
      { name: 'Ganton', x0: X0, y0: Y0, x1: X1, y1: RAIL.y1 },
    ],
  };
  const walkable = (x, y) => { if (!(x >= X0 && x <= X1 && y >= Y0 && y <= Y1)) return false; for (const s of solids) if (x >= s[0] && x <= s[2] && y >= s[1] && y <= s[3]) return false; return true; };
  const setGates = (t) => { for (const g of W.gates) try { g.userData.setDown?.(t); } catch (e) { /* static */ } };
  return { group, anchors, mapData, walkable, groundZ: () => GROUND_Z, gates: W.gates, setGates, paths, solids };
}
