// Vehicles for the disc-boot world (research/gta-sa-launch.md §5): the yellow Taxi, the LSPD cruiser (black-and-white with
// "LSPD" on the front doors, a red/blue roof lightbar), the BMX, the freight train and generic traffic sedans. The PS2
// look: boxes, cylinders and tori under Lambert shading with a few 32-128 px nearest-filtered canvas textures for the
// liveries, glass, hubcaps and signs; nothing is loaded. Units are metres; every vehicle's origin is at the ground centre
// and it faces -z at heading 0 (SA north; world/index.js: toThree = (x, z, -y), headingToYaw = deg * PI / 180). Doors hinge
// at their front edge and swing with setDoor(name, 0..1); wheels roll with spin(metres); the lightbar alternates only
// through update(dt), so captures are deterministic. Siblings may still be stubs: materials.js is used when it answers.
import * as THREE from 'three';
import * as M from './materials.js';
import { makeRng } from '../../rng.js';
import { glowTexture } from '../../textures.js';

const D2R = Math.PI / 180, HALF = Math.PI / 2;
const P = M.PALETTE || {};
const COL = { taxi: P.taxi ?? 0xf2c31c, cop: P.cop ?? 0x141414, copWhite: P.copWhite ?? 0xe8e8e8, tyre: 0x1a1a1a, hub: 0x9a9a96, glass: 0x1a2028, glassHi: 0x46525e, chrome: 0x9c9c98, dark: 0x262626, red: 0xa01414, blue: 0x2038c0, plate: 0xe8e8dc, lamp: 0xe6e0c4 };
const SANS = 'bold 48px "TeX Gyre Heros", Helvetica, Arial, sans-serif';
const DOOR_MAX = 68 * D2R;   // the taxi's rear door in ref-hVj/t0043 and the cruiser's in t0041 stand about 65-70° open
const css = (hex) => '#' + new THREE.Color(hex).getHexString();
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

// ---------------- materials and textures (cached; live() for the lamps and lenses each vehicle toggles on its own) ----------------
const mats = new Map(), texes = new Map();
function mat(hex, opts = {}) {
  const k = hex + '|' + Object.entries(opts).map(([a, b]) => a + ':' + (b && b.isTexture ? b.uuid : b)).join(',');
  if (!mats.has(k)) { let m = null; try { m = M.flatMat?.(hex, opts); } catch (e) { m = null; } mats.set(k, m || new THREE.MeshLambertMaterial({ color: hex, ...opts })); }
  return mats.get(k);
}
const live = (hex, emissive) => new THREE.MeshLambertMaterial({ color: hex, emissive, emissiveIntensity: 0 });
function tex(k, w, h, draw) {
  if (texes.has(k)) return texes.get(k);
  let t = null;
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (g) { draw(g, w, h); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
  } catch (e) { t = null; }
  texes.set(k, t); return t;
}
// Centred text shrunk to fit a box (the same grotesque as the subtitles; the console's liveries are plain bold caps).
function label(g, text, x, y, w, h, color, font = SANS) {
  let size = Math.round(h * 0.82); g.font = font.replace(/\d+px/, size + 'px'); const tw = g.measureText(text).width;
  if (tw > w * 0.9) { size = Math.floor(size * w * 0.9 / tw); g.font = font.replace(/\d+px/, size + 'px'); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + size * 0.05);
}
// Door skin: paint, the belt line, a sill shadow, a handle, optional livery text ("LSPD" in black on the cruiser's white doors).
const doorTex = (paint, text, color) => tex('door|' + paint + '|' + text, 128, 64, (g, w, h) => {
  g.fillStyle = css(paint); g.fillRect(0, 0, w, h); g.fillStyle = shade(paint, 0.7); g.fillRect(0, 0, w, 2); g.fillRect(0, h - 6, w, 6);
  g.fillStyle = shade(paint, 0.45); g.fillRect(w * 0.72, 12, 16, 4);
  if (text) label(g, text, 8, 14, w - 16, 34, color);
});
// Door glass: dark tint with a pale sky band, a paint frame; `pillar` adds the B pillar strip on the front doors' rear edge.
const doorGlassTex = (paint, pillar) => tex('dglass|' + paint + '|' + pillar, 64, 32, (g, w, h) => {
  g.fillStyle = css(COL.glass); g.fillRect(0, 0, w, h); g.fillStyle = css(COL.glassHi); g.fillRect(0, 3, w, 6);
  g.fillStyle = css(paint); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w - (pillar ? 7 : 3), 0, pillar ? 7 : 3, h);
});
// Cabin side: glass with the A, B and C pillars (symmetric, so it reads on both faces of the box).
const cabinSideTex = (paint) => tex('cside|' + paint, 128, 64, (g, w, h) => {
  g.fillStyle = css(COL.glass); g.fillRect(0, 0, w, h); g.fillStyle = css(COL.glassHi); g.fillRect(0, 6, w, 10);
  g.fillStyle = css(paint); g.fillRect(0, 0, w, 5); g.fillRect(0, h - 4, w, 4); g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h); g.fillRect(w / 2 - 5, 0, 10, h);
});
// Windscreen / rear window: glass with a paint border and the pale reflection band.
const screenTex = (paint) => tex('screen|' + paint, 64, 32, (g, w, h) => {
  g.fillStyle = css(COL.glass); g.fillRect(0, 0, w, h); g.fillStyle = css(COL.glassHi); g.fillRect(0, 4, w, 8);
  g.fillStyle = css(paint); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
});
// Hubcap: tyre corner, grey dish, a dark ring and five bolts (the cylinder cap maps the disc onto a square).
const hubTex = () => tex('hub', 32, 32, (g, w, h) => {
  g.fillStyle = css(COL.tyre); g.fillRect(0, 0, w, h); g.fillStyle = shade(COL.tyre, 1.6); g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill();
  g.fillStyle = css(COL.hub); g.beginPath(); g.arc(16, 16, 8.5, 0, 7); g.fill(); g.fillStyle = shade(COL.hub, 0.55); g.beginPath(); g.arc(16, 16, 4, 0, 7); g.fill();
  for (let i = 0; i < 5; i++) { const a = i * 1.2566; g.fillStyle = shade(COL.hub, 0.5); g.fillRect(15 + Math.cos(a) * 6, 15 + Math.sin(a) * 6, 2, 2); }
});
const signTex = (text, fg, bg) => tex('sign|' + text + fg + bg, 96, 32, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); label(g, text, 4, 4, w - 8, h - 8, fg); });
const cabTex = (paint) => tex('cab|' + paint, 64, 32, (g, w, h) => { g.fillStyle = css(paint); g.fillRect(0, 0, w, h); g.fillStyle = css(COL.glass); g.fillRect(6, 5, 20, 12); g.fillRect(38, 5, 20, 12); g.fillStyle = css(COL.glassHi); g.fillRect(6, 5, 20, 3); g.fillRect(38, 5, 20, 3); });

// ---------------- small builders ----------------
const box = (w, h, d, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); return m; };
// A box whose outer face (px for the right side, nx for the left) carries a texture and the rest a plain paint.
function skinnedBox(w, h, d, side, skin, paint, x = 0, y = 0, z = 0) {
  const faces = [paint, paint, paint, paint, paint, paint]; faces[side > 0 ? 0 : 1] = skin; return box(w, h, d, faces, x, y, z);
}
// A cylinder from a to b (frame tubes, stays, bars).
function tube(a, b, r, material, segments = 6) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from), len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segments), material);
  m.position.copy(from).add(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m;
}
// A wheel on an x axle: `pivot` rotates with spin(); the cylinder's caps take the hubcap texture. Returns { pivot, r }.
function wheel(r, width, x, y, z, hubMaterial, segments = 12) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, segments), [mat(COL.tyre), hubMaterial, hubMaterial]); m.rotation.z = HALF; pivot.add(m);
  return { pivot, r };
}
// Additive glow sprite for lamps and lenses (hidden until switched on).
let glowTex = null;
function glow(x, y, z, size, hex, opacity = 0.7) {
  if (!glowTex) { try { glowTex = glowTexture(64, { core: 0.08, power: 2.4 }); } catch (e) { glowTex = null; } }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.position.set(x, y, z); s.scale.set(size, size, 1); s.visible = false; s.userData.opacity = opacity; return s;
}
// Pushes a box's top vertices inward (tumblehome) and rakes its front and rear faces: the cabin / a loco nose.
function taper(geom, { xTop = 0.86, frontIn = 0.55, rearIn = 0.35, frontZ = 0 } = {}) {
  const p = geom.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > 0) { p.setX(i, x * xTop); p.setZ(i, z < frontZ ? z + frontIn : z - rearIn); } }
  p.needsUpdate = true; geom.computeVertexNormals(); return geom;
}

// ---------------- the shared Vehicle object ----------------
// parts: { doors: {fl, fr, rl, rr} -> {pivot, sign}, wheels: [{pivot, r}], cranks: [{pivot, ratio}], head: [material], tail: [material],
// lamps: [sprite], bar: {red, blue, sprites: [red, blue]} | null }; seats: local hip points for 'driver', 'passenger', 'rl', 'rr'.
function vehicle(kind, group, parts, seats) {
  const setBar = (r, b) => { const bar = parts.bar; if (!bar) return; bar.red.emissiveIntensity = r; bar.blue.emissiveIntensity = b; bar.sprites[0].material.opacity = bar.sprites[0].userData.opacity * r; bar.sprites[1].material.opacity = bar.sprites[1].userData.opacity * b; };
  const v = {
    kind, group, parts, time: 0, lit: false, flashing: false,
    setPosition(x, y, z) { group.position.set(x, z, -y); return v; },
    setHeading(deg) { group.rotation.y = (Number(deg) || 0) * D2R; return v; },
    setDoor(name, open = 1) { const d = parts.doors?.[name]; if (d) d.pivot.rotation.y = d.sign * DOOR_MAX * clamp01(open); return v; },
    getDoor(name) { const d = parts.doors?.[name]; return d ? Math.abs(d.pivot.rotation.y) / DOOR_MAX : 0; },
    lights(on = true) {
      v.lit = !!on; for (const m of parts.head || []) m.emissiveIntensity = on ? 1 : 0; for (const m of parts.tail || []) m.emissiveIntensity = on ? 0.9 : 0;
      for (const s of parts.lamps || []) s.visible = !!on; return v;
    },
    lightbar(on = true) { v.flashing = !!on && !!parts.bar; if (parts.bar) { for (const s of parts.bar.sprites) s.visible = v.flashing; if (!v.flashing) setBar(0, 0); else setBar(1, 0.08); } return v; },
    spin(metres = 0) { const m = Number(metres) || 0; for (const w of parts.wheels || []) w.pivot.rotation.x -= m / w.r; for (const c of parts.cranks || []) c.pivot.rotation.x -= m * c.ratio; return v; },
    // The lightbar alternates red / blue at 3 Hz (SA's LSPD bar strobes each side in turn); nothing else keeps time.
    update(dt = 0) { v.time += Number(dt) || 0; if (v.flashing) { const red = (v.time * 3) % 1 < 0.5; setBar(red ? 1 : 0.08, red ? 0.08 : 1); } },
    seat(name = 'driver') { const s = seats[name] || seats.driver || new THREE.Vector3(0, 0.9, 0); return s.clone(); },
  };
  return v;
}

// ---------------- sedans (Taxi, LSPD cruiser, traffic) ----------------
// Proportions of the console's 90s American sedans (the Taxi and the Police LS share a Caprice-like shell): 4.6 x 1.78 m,
// wheelbase 2.8 m, roof at 1.34 m, a long hood, a short trunk, the cabin raked more at the front than the rear.
const SEDAN = { len: 4.6, w: 1.78, tubY: [0.30, 0.80], cab: [-0.9, 1.2], cabTop: [0.84, 1.34], wheelZ: 1.4, wheelX: 0.8, r: 0.32, doors: { f: [-0.85, 1.0], r: [0.15, 0.9] } };
// Hip points 0.55 m above the floor: the consumers drop an actor's feet 0.55 below the seat, so a seated head stays under the 1.4 m roof.
const SEATS = { driver: new THREE.Vector3(-0.4, 0.55, -0.35), passenger: new THREE.Vector3(0.4, 0.55, -0.35), rl: new THREE.Vector3(-0.4, 0.55, 0.55), rr: new THREE.Vector3(0.4, 0.55, 0.55) };
function sedan(kind, { paint, doorPaint = paint, roofPaint = paint, bumper = COL.chrome, doorText = null, doorTextColor = '#101010', roofSign = null, lightbar = false, quarterText = null } = {}) {
  const S = SEDAN, group = new THREE.Group(); group.name = kind;
  const body = mat(paint), roof = mat(roofPaint), door = mat(doorPaint), dark = mat(COL.dark), hub = mat(0xffffff, { map: hubTex() });
  const tubH = S.tubY[1] - S.tubY[0], tubMid = (S.tubY[0] + S.tubY[1]) / 2, cabH = S.cabTop[1] - S.cabTop[0], cabMid = (S.cabTop[0] + S.cabTop[1]) / 2, cabLen = S.cab[1] - S.cab[0], cabZ = (S.cab[0] + S.cab[1]) / 2;
  // Tub (fenders and sills), hood and trunk lids a shade proud, the cabin as a tapered box with glass on four faces.
  group.add(box(S.w, tubH, S.len, body, 0, tubMid, 0));
  group.add(box(S.w - 0.12, 0.08, S.cab[0] - (-S.len / 2) - 0.05, body, 0, S.tubY[1] + 0.04, (S.cab[0] - S.len / 2) / 2 - 0.02));
  group.add(box(S.w - 0.12, 0.1, S.len / 2 - S.cab[1] - 0.05, body, 0, S.tubY[1] + 0.05, (S.cab[1] + S.len / 2) / 2 + 0.02));
  const cabGeom = taper(new THREE.BoxGeometry(S.w - 0.06, cabH, cabLen), { xTop: 0.86, frontIn: 0.55, rearIn: 0.35 });
  const side = mat(0xffffff, { map: cabinSideTex(roofPaint) }), screen = mat(0xffffff, { map: screenTex(roofPaint) });
  const cabin = new THREE.Mesh(cabGeom, [side, side, roof, dark, screen, screen]); cabin.position.set(0, cabMid, cabZ); group.add(cabin);
  // Doors: the pivot sits on the hinge (front edge, at the tub's side); the panel plus a tilted glass frame swing together.
  const doors = {}, tilt = Math.atan(((S.w - 0.06) / 2) * (1 - 0.86) / cabH);
  for (const [name, sign, spec, text, pillar] of [['fl', -1, S.doors.f, doorText, true], ['fr', 1, S.doors.f, doorText, true], ['rl', -1, S.doors.r, null, false], ['rr', 1, S.doors.r, null, false]]) {
    const [z0, len] = spec, pivot = new THREE.Group(); pivot.position.set(sign * (S.w / 2 + 0.012), 0, z0);
    pivot.add(skinnedBox(0.05, tubH - 0.06, len - 0.02, sign, mat(0xffffff, { map: doorTex(doorPaint, text, doorTextColor) }), door, 0, tubMid + 0.02, len / 2));
    const frame = new THREE.Group(); frame.position.set(-sign * 0.02, S.tubY[1], len / 2); frame.rotation.z = sign * tilt; pivot.add(frame);
    frame.add(skinnedBox(0.03, cabH - 0.1, len - 0.1, sign, mat(0xffffff, { map: doorGlassTex(roofPaint, pillar) }), roof, 0, (cabH - 0.1) / 2 + 0.02, 0));
    group.add(pivot); doors[name] = { pivot, sign };   // a left (-x) door swings its trailing edge out to -x: negative yaw
  }
  const wheels = [];
  for (const [x, z] of [[-S.wheelX, -S.wheelZ], [S.wheelX, -S.wheelZ], [-S.wheelX, S.wheelZ], [S.wheelX, S.wheelZ]]) { const w = wheel(S.r, 0.22, x, S.r, z, hub); group.add(w.pivot); wheels.push(w); }
  // Bumpers, grille, lamps, plate, mirrors.
  const chrome = mat(bumper); group.add(box(S.w + 0.04, 0.14, 0.14, chrome, 0, 0.42, -S.len / 2 - 0.03)); group.add(box(S.w + 0.04, 0.14, 0.14, chrome, 0, 0.42, S.len / 2 + 0.03));
  group.add(box(0.72, 0.16, 0.04, dark, 0, 0.66, -S.len / 2 - 0.01));
  const head = [], tail = [], lamps = [];
  for (const x of [-0.6, 0.6]) {
    const h = live(COL.lamp, 0xfff0c0); head.push(h); group.add(box(0.34, 0.14, 0.05, h, x, 0.66, -S.len / 2 - 0.01));
    const t = live(COL.red, 0xff3020); tail.push(t); group.add(box(0.34, 0.12, 0.05, t, x, 0.66, S.len / 2 + 0.01));
    const s = glow(x, 0.66, -S.len / 2 - 0.12, 0.9, 0xfff0c0, 0.75); lamps.push(s); group.add(s);
    group.add(box(0.06, 0.1, 0.14, body, x * 1.6, 0.94, -0.78));
  }
  group.add(box(0.32, 0.14, 0.02, mat(COL.plate), 0, 0.5, S.len / 2 + 0.11));
  // Roof furniture: the Taxi's sign or the cruiser's lightbar (red on the driver's side, blue on the passenger's).
  let bar = null;
  if (roofSign) { const st = mat(0xffffff, { map: signTex(roofSign, '#f2c31c', '#101010') }); const blk = mat(0x101010); group.add(box(0.62, 0.16, 0.2, [blk, blk, blk, blk, st, st], 0, S.cabTop[1] + 0.08, -0.15)); }
  if (lightbar) {
    group.add(box(1.2, 0.06, 0.26, dark, 0, S.cabTop[1] + 0.03, -0.05)); group.add(box(0.1, 0.1, 0.24, dark, 0, S.cabTop[1] + 0.11, -0.05));
    const red = live(COL.red, 0xff2020), blue = live(COL.blue, 0x3060ff);
    group.add(box(0.5, 0.1, 0.24, red, -0.3, S.cabTop[1] + 0.11, -0.05)); group.add(box(0.5, 0.1, 0.24, blue, 0.3, S.cabTop[1] + 0.11, -0.05));
    const sprites = [glow(-0.3, S.cabTop[1] + 0.16, -0.05, 1.4, 0xff3030, 0.8), glow(0.3, S.cabTop[1] + 0.16, -0.05, 1.4, 0x4070ff, 0.8)]; group.add(...sprites);
    bar = { red, blue, sprites };
  }
  // "POLICE" in white on the black rear quarters (the door close-up in ref-hVj/t0050).
  if (quarterText) {
    const qm = new THREE.MeshLambertMaterial({ map: signTex(quarterText, '#f0f0f0', css(paint)), polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sign of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.11), qm); d.position.set(sign * (S.w / 2 + 0.004), 0.62, 1.72); d.rotation.y = sign * HALF; group.add(d); }
  }
  return vehicle(kind, group, { doors, wheels, head, tail, lamps, bar }, SEATS);
}

export function makeTaxi() { return sedan('taxi', { paint: COL.taxi, bumper: 0x8c8c88, roofSign: 'TAXI' }); }
export function makeCopCar() { return sedan('copcar', { paint: COL.cop, doorPaint: COL.copWhite, roofPaint: COL.copWhite, bumper: 0x2a2a2a, doorText: 'LSPD', lightbar: true, quarterText: 'POLICE' }); }
export function makeTrafficCar(hex = 0x888888) { return sedan('traffic', { paint: hex, bumper: 0x8c8c88 }); }

// ---------------- BMX ----------------
// 20-inch wheels (r 0.25) on a 0.95 m wheelbase, a low red frame, high rise bars, cranks that turn at the 44/16 gearing.
export function makeBMX() {
  const group = new THREE.Group(); group.name = 'bmx';
  const frame = mat(0x8a2020), steel = mat(0x3a3a3a), rim = mat(0xa0a0a0), tyre = mat(COL.tyre), black = mat(0x101010);
  const BB = [0, 0.27, 0.08], HT = [0, 0.84, -0.34], HB = [0, 0.62, -0.30], ST = [0, 0.72, 0.22], RA = [0, 0.25, 0.47], FA = [0, 0.25, -0.48], POST = [0, 0.82, 0.24];
  group.add(tube(HB, BB, 0.02, frame), tube(HT, ST, 0.016, frame), tube(BB, ST, 0.016, frame), tube(HB, HT, 0.024, frame), tube(ST, POST, 0.012, steel));
  for (const x of [-0.045, 0.045]) { const o = (p) => [x, p[1], p[2]]; group.add(tube(o(BB), o(RA), 0.011, frame), tube(o(ST), o(RA), 0.011, frame), tube(o(HB), o(FA), 0.011, steel)); }
  group.add(tube(HT, [0, 0.98, -0.37], 0.016, steel), tube([-0.3, 1.0, -0.39], [0.3, 1.0, -0.39], 0.011, steel), tube([-0.34, 1.0, -0.39], [-0.22, 1.0, -0.39], 0.018, black), tube([0.22, 1.0, -0.39], [0.34, 1.0, -0.39], 0.018, black));
  group.add(box(0.12, 0.05, 0.24, black, 0, 0.845, 0.2));
  const wheels = [];
  for (const z of [-0.48, 0.47]) {
    const pivot = new THREE.Group(); pivot.position.set(0, 0.25, z);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.025, 6, 18), tyre); t.rotation.y = HALF; pivot.add(t);
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 18), rim); r.rotation.y = HALF; pivot.add(r);
    for (let i = 0; i < 6; i++) { const s = box(0.006, 0.39, 0.006, rim); s.rotation.x = i * Math.PI / 6; pivot.add(s); }
    const hubm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 6), steel); hubm.rotation.z = HALF; pivot.add(hubm);
    group.add(pivot); wheels.push({ pivot, r: 0.25 });
  }
  // Cranks: one pivot at the bottom bracket, arms opposed, pedals out at x ±0.09; the chainring on the right.
  const crank = new THREE.Group(); crank.position.set(...BB);
  for (const [x, s] of [[-0.075, 1], [0.075, -1]]) { crank.add(box(0.02, 0.17, 0.03, steel, x, s * 0.07, 0)); crank.add(box(0.08, 0.02, 0.05, black, x + Math.sign(x) * 0.045, s * 0.15, 0)); }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 12), steel); ring.rotation.z = HALF; ring.position.x = 0.05; crank.add(ring);
  group.add(crank);
  const chain = box(0.005, 0.01, 0.45, black, 0.05, 0.31, 0.26); group.add(chain);
  return vehicle('bmx', group, { doors: {}, wheels, cranks: [{ pivot: crank, ratio: 1 / 0.25 * 16 / 44 }], head: [], tail: [], lamps: [], bar: null }, { driver: new THREE.Vector3(0, 0.86, 0.2), passenger: new THREE.Vector3(0, 0.86, 0.2) });
}

// ---------------- freight train ----------------
// A boxy diesel (maroon body, black roof, cream nose band, the cab set back from a short hood) pulling flatcars, as seen
// from the overhead crossing shots (ref-hVj2/t0138-t0146). nCars counts the loco: makeTrain(5) = loco + four flatcars.
// The origin is the loco's ground centre; the cars trail behind (+z); rails at y 0, wheels r 0.48.
const TRAIN = { locoLen: 16, carLen: 15, gap: 1.0, w: 2.9, deck: 1.2, r: 0.48 };
function bogie(z, axles, wheels, frameMat) {
  const g = new THREE.Group(); g.position.z = z; const span = (axles - 1) * 1.6;
  for (const x of [-1.2, 1.2]) g.add(box(0.14, 0.44, span + 1.6, frameMat, x, 0.6, 0));
  g.add(box(2.4, 0.2, 0.6, frameMat, 0, 0.9, 0));
  for (let i = 0; i < axles; i++) for (const x of [-1.0, 1.0]) { const w = wheel(TRAIN.r, 0.14, x, TRAIN.r, -span / 2 + i * 1.6, mat(0x3a3a3a), 14); g.add(w.pivot); wheels.push(w); }
  return g;
}
export function makeTrain(nCars = 3) {
  const T = TRAIN, group = new THREE.Group(); group.name = 'train'; const wheels = [], head = [], lamps = [];
  const n = Math.max(1, Math.round(Number(nCars) || 1)), rng = makeRng(58);
  const body = mat(0x5a2a24), roof = mat(0x1c1c1c), under = mat(0x222222), cream = mat(0xd8c890), deck = mat(0x6a4a34), rail = mat(0x4a3a2c), cab = mat(0xffffff, { map: cabTex(0x5a2a24) });
  // Loco: underframe, short nose hood, the cab, the long hood with a roof strip and exhaust; two three-axle bogies.
  const loco = new THREE.Group(); group.add(loco);
  loco.add(box(T.w, 0.35, T.locoLen, under, 0, T.deck - 0.17, 0));
  loco.add(box(T.w - 0.3, 1.3, 2.6, body, 0, T.deck + 0.65, -6.6)); loco.add(box(T.w - 0.3, 0.3, 0.06, cream, 0, T.deck + 0.9, -7.93));
  loco.add(box(T.w, 2.3, 3.0, [cab, cab, roof, under, body, cab], 0, T.deck + 1.15, -3.8));
  loco.add(box(T.w - 0.5, 1.9, 10.4, body, 0, T.deck + 0.95, 2.6)); loco.add(box(T.w - 0.9, 0.12, 10.0, roof, 0, T.deck + 1.96, 2.6));
  loco.add(box(0.6, 0.35, 0.8, roof, 0, T.deck + 2.15, 0.2)); loco.add(box(1.6, 0.2, 2.2, roof, 0, T.deck + 2.1, 5.5));
  loco.add(box(T.w - 0.3, 0.5, 0.25, under, 0, T.deck - 0.55, -T.locoLen / 2 - 0.05)); loco.add(box(T.w - 0.3, 0.5, 0.25, under, 0, T.deck - 0.55, T.locoLen / 2 + 0.05));
  const lampM = live(COL.lamp, 0xfff0c0); head.push(lampM); loco.add(box(0.3, 0.3, 0.06, lampM, 0, T.deck + 1.75, -5.32));
  const s = glow(0, T.deck + 1.75, -5.5, 1.6, 0xfff0c0, 0.8); lamps.push(s); loco.add(s);
  loco.add(bogie(-5, 3, wheels, under), bogie(5, 3, wheels, under));
  // Flatcars: a wooden deck on a dark frame, low side rails, two two-axle bogies, some carrying a container or crates.
  for (let i = 1; i < n; i++) {
    const car = new THREE.Group(); car.position.z = T.locoLen / 2 + T.gap + T.carLen / 2 + (i - 1) * (T.carLen + T.gap); group.add(car);
    car.add(box(T.w - 0.2, 0.28, T.carLen, under, 0, T.deck - 0.2, 0)); car.add(box(T.w, 0.12, T.carLen, deck, 0, T.deck, 0));
    for (const x of [-T.w / 2 + 0.05, T.w / 2 - 0.05]) car.add(box(0.1, 0.25, T.carLen, rail, x, T.deck + 0.18, 0));
    car.add(bogie(-5.3, 2, wheels, under), bogie(5.3, 2, wheels, under));
    const load = rng();
    if (load < 0.4) car.add(box(2.4, 2.3, rng.range(5, 9), mat(rng.pick([0x8a5a3a, 0x4a6a8a, 0x6a6a5a])), 0, T.deck + 1.21, rng.range(-2, 2)));
    else if (load < 0.7) for (let k = 0; k < 3; k++) car.add(box(1.8, 1.0, 1.8, mat(0x9a7a4a), rng.range(-0.3, 0.3), T.deck + 0.56, -4 + k * 4));
  }
  return vehicle('train', group, { doors: {}, wheels, cranks: [], head, tail: [], lamps, bar: null }, { driver: new THREE.Vector3(0.8, T.deck + 1.2, -3.8), passenger: new THREE.Vector3(-0.8, T.deck + 1.2, -3.8) });
}
