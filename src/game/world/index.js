// The world: SA coordinates in the public API (x east, y north, z up, metres; heading in degrees, 0 = north, 90 = west),
// three.js inside (x, z, -y). Owns the scene, the camera, the environment preset, the lazily built sets, the actors and
// vehicles, and the offscreen stills (credit strips, legal-screen portraits, loading artworks): small throwaway dioramas
// rendered through a WebGLRenderTarget into a canvas. Sibling modules may still be stubs, so every prop, vehicle and
// actor is fetched through a fallback: a still is always a canvas, never an exception.
import * as THREE from 'three';
import { applyEnv, flatMat, toonify, textTexture, windowTexture, roadTexture, PALETTE } from './materials.js';
import * as props from './props.js';
import * as vehicles from './vehicles.js';
import { makeActor } from './actors.js';
import { buildLcAirport, buildLsAirport, buildLosSantos } from './sets.js';
import { makeRng } from '../../rng.js';
import { glowTexture } from '../../textures.js';

export const toThree = ([x, y, z]) => new THREE.Vector3(x, z, -y);
export const fromThree = (v) => [v.x, -v.z, v.y];
export const headingToYaw = (deg) => deg * Math.PI / 180;
const BUILDERS = { lcAirport: buildLcAirport, lsAirport: buildLsAirport, losSantos: buildLosSantos };
const INTERIOR = { lcAirport: true, lsAirport: true };
const Y = new THREE.Vector3(0, 1, 0);
const vec = (p) => (Array.isArray(p) ? toThree(p) : toThree([p.x, p.y, p.z]));

// ---------------- fallbacks (used only while a sibling module is a stub or fails) ----------------
const box = (w, h, d, hex, opts) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flatMat(hex, opts)); m.position.y = h / 2; return m; };
const boxGroup = (w, h, d, hex) => { const g = new THREE.Group(); g.add(box(w, h, d, hex)); return g; };
// A blocky humanoid so portraits and silhouettes still read as a person. Origin at the feet, facing -Z at heading 0.
const FIGURE = { cj: [PALETTE.skin.dark, PALETTE.cloth.tank, PALETTE.cloth.jeans], tenpenny: [PALETTE.skin.dark, PALETTE.cloth.navy, PALETTE.cloth.navy], pulaski: [PALETTE.skin.light, PALETTE.cloth.navy, PALETTE.cloth.navy], hernandez: [PALETTE.skin.tan, PALETTE.cloth.navy, PALETTE.cloth.navy], driver: [PALETTE.skin.tan, 0x8a3a2a, 0x3a3a3a], steward: [PALETTE.skin.light, 0x8a2a4a, 0x2a2a3a] };
function boxFigure(preset = 'cj') {
  const [skin, top, legs] = FIGURE[preset] || FIGURE.driver; const group = new THREE.Group();
  const part = (w, h, d, hex, x, y, z) => { const m = box(w, h, d, hex); m.position.set(x, y, z); group.add(m); return m; };
  part(0.36, 0.86, 0.22, legs, 0, 0, 0); part(0.44, 0.58, 0.26, top, 0, 0.86, 0); part(0.12, 0.62, 0.12, skin, -0.3, 0.84, 0); part(0.12, 0.62, 0.12, skin, 0.3, 0.84, 0);
  const head = part(0.22, 0.26, 0.24, skin, 0, 1.5, 0); part(0.24, 0.08, 0.26, PALETTE.cloth.hair, 0, 1.72, 0); head.name = 'head';
  return { group, preset, setPosition(x, y, z) { group.position.set(x, z, -y); }, setHeading(deg) { group.rotation.y = headingToYaw(deg); }, play() {}, update() {}, moveTo() { return true; }, holdProp() {}, lookAt() {} };
}
function boxVehicle(kind) {
  const spec = { makeTaxi: [1.8, 1.2, 4.6, PALETTE.taxi], makeCopCar: [1.9, 1.2, 4.9, PALETTE.cop], makeBMX: [0.4, 0.8, 1.6, 0x3a3a3a], makeTrain: [3, 3.5, 40, 0x552222] }[kind] || [1.8, 1.2, 4.4, 0x888888];
  const group = new THREE.Group(); const body = box(spec[0], spec[1], spec[2], spec[3]); body.position.y += 0.3; group.add(body);
  return { group, setPosition(x, y, z) { group.position.set(x, z, -y); }, setHeading(deg) { group.rotation.y = headingToYaw(deg); }, setDoor() {}, lights() {}, lightbar() {}, spin() {}, update() {}, seat(name) { return new THREE.Vector3(name === 'driver' ? -0.4 : 0.4, 0.9, name.startsWith('r') ? 0.6 : -0.4); } };
}

// ---------------- diorama kit ----------------
// Everything a still builder needs, with every sibling call guarded. Positions here are plain three.js metres
// (x right, y up, z toward the camera); `place` converts to the SA calls the actor/vehicle objects expect.
class Kit {
  constructor(seed) {
    this.rng = makeRng(seed); this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1200); this.env = null;
  }
  environment(name, over) { this.env = applyEnv(this.scene, name, over); return this.env; }
  look(pos, at, fov = 45) { this.camera.position.set(...pos); this.camera.lookAt(...at); this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  add(o, x = 0, y = 0, z = 0, ry = 0) { const g = o?.group || o; if (!g?.isObject3D) return null; g.position.set(x, y, z); g.rotation.y = ry; this.scene.add(g); return g; }
  // Actors and vehicles keep their own heading state: go through their API (SA coords) when they have one.
  place(o, x = 0, y = 0, z = 0, heading = 0) {
    if (!o) return null;
    if (o.setPosition && o.setHeading) { o.setPosition(x, -z, y); o.setHeading(heading); if (o.group && !o.group.parent) this.scene.add(o.group); return o.group; }
    return this.add(o, x, y, z, headingToYaw(heading));
  }
  prop(name, fallback, ...args) { try { const g = props[name]?.(...args); if (g?.isObject3D) return g; } catch (e) { /* stub or sibling bug: box below */ } return boxGroup(...fallback); }
  vehicle(kind, ...args) { try { const v = vehicles[kind]?.(...args); if (v?.group?.isObject3D) return v; } catch (e) { /* fallback */ } return boxVehicle(kind); }
  actor(preset, clip = 'idle', frames = 14) {
    let a = null; try { a = makeActor(preset); } catch (e) { a = null; }
    if (!a?.group?.isObject3D) a = boxFigure(preset);
    try { a.play?.(clip, { loop: true, fade: 0 }); for (let i = 0; i < frames; i++) a.update?.(1 / 30); } catch (e) { /* pose stays */ }
    return a;
  }
  ground(size, hex, y = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), flatMat(hex)); m.rotation.x = -Math.PI / 2; m.position.y = y; this.scene.add(m); return m; }
  mesh(geom, hex, x = 0, y = 0, z = 0, opts) { const m = new THREE.Mesh(geom, flatMat(hex, opts)); m.position.set(x, y, z); this.scene.add(m); return m; }
  box(w, h, d, hex, x = 0, y = 0, z = 0, ry = 0, opts) { const m = box(w, h, d, hex, opts); m.position.set(x, y + h / 2, z); m.rotation.y = ry; this.scene.add(m); return m; }   // y = the base
  unlit(geom, hex, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: hex })); m.position.set(x, y, z); this.scene.add(m); return m; }
  // Additive glow sprite (headlights, lightbars, neon, lamp heads).
  glow(x, y, z, size, hex, opacity = 0.8) {
    Kit.tex = Kit.tex || glowTexture(64, { core: 0.08, power: 2.4 });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Kit.tex, color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.position.set(x, y, z); s.scale.set(size, size, 1); this.scene.add(s); return s;
  }
  point(x, y, z, hex, intensity, distance) { const l = new THREE.PointLight(hex, intensity, distance, 1.2); l.position.set(x, y, z); this.scene.add(l); return l; }
  lampRow(z0, z1, step, x, side = 1) { for (let z = z0; z <= z1; z += step) { this.add(this.prop('streetLamp', [0.2, 7, 0.2, PALETTE.metal]), x, 0, z, side > 0 ? Math.PI / 2 : -Math.PI / 2); } }
  palms(list) { for (const [x, z, h] of list) this.add(this.prop('palm', [0.3, h, 0.3, PALETTE.treeDark], h), x, 0, z, this.rng() * 6.28); }
  // Distant unlit skyline, slightly darker than the card, behind a toon portrait.
  skyline(hex, y = 0) { for (let i = -6; i <= 6; i++) { const h = 3 + this.rng() * 9, w = 3 + this.rng() * 4; this.unlit(new THREE.BoxGeometry(w, h, 2), hex, i * 5.5 + this.rng() * 2, y + h / 2, -40); } }
  // Toon portrait on a flat card: the actor (and an optional bike / car) with ink outlines, framed bust or full length.
  portrait({ bg, preset = 'cj', clip = 'idle', prop = 'none', framing = 'bust', heading = 165, bike = false, car = null, skyline = null }) {
    this.environment('flat', { bg });
    if (skyline != null) this.skyline(skyline, -1);
    const a = this.actor(preset, clip); try { a.holdProp?.(prop); } catch (e) { /* optional */ }
    if (bike) { const b = this.vehicle('makeBMX'); this.place(b, 0, 0, 0, heading); toonify(b.group); this.place(a, 0, 0.42, 0, heading); }
    else if (car) { const c = this.vehicle('makeTrafficCar', car); this.place(c, 0.6, 0, -0.8, heading + 25); toonify(c.group, { outline: 0.03 }); this.place(a, -1.4, 0, 0.3, heading); }
    else this.place(a, 0, 0, 0, heading);
    toonify(a.group, { outline: 0.018 });
    if (framing === 'bust') this.look([0.35, 1.55, 2.3], [0, 1.32, 0], 32);
    else if (framing === 'full') this.look([0.6, 1.1, 5.0], [0, 0.92, 0], 34);
    else this.look([2.2, 1.3, 6.2], [0, 0.9, 0], 36);
  }
}

// Sky-facing jet silhouette (fuselage, swept wings, tail) for the animation card.
function jetMesh(hex = 0x2c3038) {
  const g = new THREE.Group(); const mat = flatMat(hex);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 12, 4, 8), mat); body.rotation.x = Math.PI / 2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 3.2), mat); wing.position.z = 1; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 1.8), mat); tail.position.z = 5.5; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 2), mat); fin.position.set(0, 1.4, 5.4); g.add(fin);
  for (const s of [-1, 1]) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3, 8), mat); eng.rotation.x = Math.PI / 2; eng.position.set(s * 3.2, -0.6, 1.2); g.add(eng); }
  return g;
}
// A ferris wheel: rim, spokes, cabins, A-frame legs.
function ferrisWheel(r = 10) {
  const g = new THREE.Group(); const white = flatMat(0xe6e6e6), n = 16, cabins = [0xd83030, 0xf0c020, 0x3060d0, 0x30a050];
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 6, 40), white); g.add(rim);
  const rim2 = rim.clone(); rim2.position.z = 1.4; g.add(rim2); rim.position.z = -1.4;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, r, 4), white); sp.position.set(Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0); sp.rotation.z = a + Math.PI / 2; g.add(sp);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 1.1), flatMat(cabins[i % 4])); c.position.set(Math.cos(a) * r, Math.sin(a) * r - 0.9, 0); g.add(c);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.4, 8), flatMat(0x888888)); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (const s of [-1, 1]) for (const z of [-1.4, 1.4]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, r * 1.35, 6), flatMat(0xc8c8c8)); leg.position.set(s * r * 0.4, -r * 0.5, z); leg.rotation.z = s * 0.55; g.add(leg); }
  g.position.y = r + 0.6; return g;
}
// Suspension-bridge tower with a catenary main cable and hangers (San Fierro card).
function bridgeTower(k, z, x = 0) {
  const red = 0xb8452c;
  for (const s of [-1, 1]) k.box(1.8, 62, 1.8, red, x + s * 5.5, 0, z);
  for (const y of [22, 40, 56]) k.box(12.6, 2, 1.4, red, x, y, z);
}
function catenary(k, x, z0, z1, yTop, yLow, hex = 0x7a2418) {
  const steps = 14, mat = flatMat(hex);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps, y0 = yLow + (yTop - yLow) * (1 - t0) ** 2, y1 = yLow + (yTop - yLow) * (1 - t1) ** 2;
    const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1, len = Math.hypot(zb - za, y1 - y0);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 5), mat); seg.position.set(x, (y0 + y1) / 2, (za + zb) / 2); seg.rotation.x = Math.atan2(zb - za, y1 - y0); k.scene.add(seg);
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, Math.max(0.1, y0 - 11), 3), mat); hang.position.set(x, 11 + (y0 - 11) / 2, za); k.scene.add(hang);
  }
}

// ---------------- the stills ----------------
// Credits montage (research §3) + the six loading artworks (§4, tinted red / yellow / teal / grey-yellow / red-orange /
// green) + eight tinted cover panels for the legal screen. Each builder dresses a Kit and frames its camera.
const DIORAMAS = {
  // 1. LSPD cruiser on a night street, headlights on, the lightbar's blue on the house behind.
  lspdNight(k) {
    k.environment('night'); k.ground(140, 0x26262c);
    k.add(k.prop('roadSegment', [7, 0.02, 60, PALETTE.asphalt], 60, 2)); k.add(k.prop('sidewalk', [2, 0.05, 60, 0x4c4a46], 60), -5, 0, 0); k.add(k.prop('sidewalk', [2, 0.05, 60, 0x4c4a46], 60), 5, 0, 0);
    k.add(k.prop('house', [12, 4.5, 9, 0x8a7a60], { w: 12, d: 9, h: 4.6, color: 0xa08a6a }), 6, 0, -16); k.add(k.prop('house', [12, 4.5, 9, 0x6a6a5a], { w: 11, d: 9, h: 4.2, color: 0x8a8070 }), -9, 0, -19, 0.2);
    k.add(k.prop('fence', [14, 1.6, 0.1, 0x5a5044], 14), 6, 0, -10); k.add(k.prop('streetLamp', [0.2, 7, 0.2, PALETTE.metal]), -6.2, 0, -7); k.palms([[11, -12, 8], [-13, -14, 7]]);
    k.glow(-6.2, 6.6, -7, 3, 0xffd890, 0.7); k.point(-6.2, 6.4, -7, 0xffd090, 14, 18);
    const car = k.vehicle('makeCopCar'); try { car.lights?.(true); car.lightbar?.(true); } catch (e) { /* optional */ }
    k.place(car, 0.4, 0, 0, 18);
    const f = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(Y, headingToYaw(18)).add(new THREE.Vector3(0.4, 0, 0));
    for (const s of [-0.7, 0.7]) { const p = f(s, 0.75, -2.4); k.glow(p.x, p.y, p.z, 2.2, 0xfff2c0, 0.9); }
    const top = f(0, 1.75, -0.2); k.glow(top.x, top.y, top.z, 4.5, 0x4060ff, 0.75); k.point(top.x, top.y + 0.3, top.z, 0x3050ff, 26, 16);
    k.look([-6.4, 1.25, 6.2], [0.6, 0.9, -1], 46);
  },
  // 2. BMX rider under palms, teal sky, the sun glaring behind.
  bmxPalms(k) {
    k.environment('sunrise', { top: 0x66d8cc, mid: 0xb8e0b0, sunDir: [-0.35, 0.26, -0.9], sunSize: 5.5, glow: 1.5, sun: 0xfffbe0, fog: [0xf2c890, 30, 160] });
    k.ground(160, PALETTE.tan); k.add(k.prop('roadSegment', [7, 0.02, 60, PALETTE.asphalt], 60, 2), 0, 0, -4, Math.PI / 2); k.add(k.prop('sidewalk', [2, 0.05, 60, PALETTE.sidewalk], 60), 0, 0, -0.2, Math.PI / 2);
    k.add(k.prop('building', [14, 6, 10, PALETTE.stucco], { w: 14, d: 10, h: 6, color: 0xd8c8a8 }), -12, 0, -16); k.add(k.prop('house', [10, 4.5, 9, 0xc8b89a]), 6, 0, -18);
    k.palms([[-6, -11, 9], [4, -13, 8], [10, -9, 7]]);
    const bike = k.vehicle('makeBMX'); k.place(bike, 0, 0, 0.6, 90); const cj = k.actor('cj', 'pedal'); k.place(cj, 0, 0.42, 0.6, 90);
    k.look([0.5, 0.9, 6.4], [0.2, 1.1, 0], 40);
  },
  // 3. San Fierro bridge, orange sky, everything orange.
  bridge(k) {
    k.environment('gold', { top: 0xe89a48, mid: 0xf4b868, horizon: 0xffd8a0, fog: [0xf4be7c, 25, 150], sunDir: [0.25, 0.2, -1], glow: 1.2 });
    k.box(14, 0.8, 240, 0x8a6a48, 0, 10, -60); k.box(0.3, 1.1, 240, 0xb8452c, -7, 10.8, -60); k.box(0.3, 1.1, 240, 0xb8452c, 7, 10.8, -60);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 240), flatMat(PALETTE.asphalt, { map: roadTexture({ lanes: 4, repeat: [1, 12] }) })); road.rotation.x = -Math.PI / 2; road.position.set(0, 10.81, -60); k.scene.add(road);
    bridgeTower(k, -40); bridgeTower(k, -160);
    for (const s of [-1, 1]) { catenary(k, s * 5.5, -40, 30, 62, 12); catenary(k, s * 5.5, -40, -100, 62, 20); catenary(k, s * 5.5, -160, -100, 62, 20); }
    const car = k.vehicle('makeTrafficCar', 0xe8e8e8); k.place(car, -2.5, 10.8, -18, 0);
    k.look([3.5, 12.4, 22], [-1, 22, -40], 55);
  },
  // 4. Casino tower interior: stacked gold balconies, a lamp burning at the top.
  casinoInterior(k) {
    k.environment('gold', { fog: [0xd8a850, 5, 60], amb: [0xffd080, 0.6], dir: [0xffe0a0, 0.6], sunDir: [0.2, 1, 0.4] }); k.scene.background = new THREE.Color(0xd8a850);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 90, 32, 1, true), flatMat(0xb08850, { side: THREE.BackSide, map: windowTexture({ cols: 12, rows: 12, wall: '#b08850', frame: '#6a4a20', glass: '#f0d080', litFraction: 0.6, lit: '#ffe8a8', repeat: [3, 3] }) })); wall.position.y = 40; k.scene.add(wall);
    for (let i = 0; i < 16; i++) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 13.6, 0.9, 32, 1, true), flatMat(0xd8b070, { side: THREE.DoubleSide })); ring.position.y = 3 + i * 4.4; k.scene.add(ring); const slab = new THREE.Mesh(new THREE.RingGeometry(12.2, 15, 32), flatMat(0xe0c080, { side: THREE.DoubleSide })); slab.rotation.x = -Math.PI / 2; slab.position.y = 2.6 + i * 4.4; k.scene.add(slab); }
    k.glow(0, 62, -6, 30, 0xfff0c0, 0.9); k.point(0, 60, -6, 0xffe0a0, 60, 90);
    k.look([7, 4, 9], [-5, 34, -9], 60);
  },
  // 5. Orange car on a wide street, pale yellow sky.
  orangeCar(k) {
    k.environment('gold', { top: 0xf0dca0, mid: 0xf8e8b8, horizon: 0xfff4d0, fog: [0xfaecc0, 40, 220], sunDir: [-0.5, 0.35, 0.8] });
    k.ground(200, 0xd0b888); k.add(k.prop('roadSegment', [14, 0.02, 120, PALETTE.asphalt], 120, 4), 0, 0, 0, Math.PI / 2);
    k.add(k.prop('sidewalk', [2, 0.05, 120, PALETTE.sidewalk], 120), 0, 0, -9, Math.PI / 2); k.lampRow(-30, 30, 15, -8.5, 1); k.palms([[-20, -14, 8], [18, -12, 9]]);
    k.add(k.prop('building', [16, 5, 10, 0xd8c8a8], { w: 16, d: 10, h: 5, color: 0xd8c8a8 }), -14, 0, -17); k.add(k.prop('building', [16, 7, 10, 0xc8b898], { w: 18, d: 10, h: 7, color: 0xc8b898 }), 8, 0, -18);
    const car = k.vehicle('makeTrafficCar', 0xe06a1c); k.place(car, 0, 0, 0, 112); const d = k.actor('driver', 'driveCar');
    try { const seat = car.seat?.('driver'); if (seat && car.group) { car.group.add(d.group); d.group.position.copy(seat).add(new THREE.Vector3(0, -0.55, 0)); } else k.place(d, 0.4, 0.05, -0.2, 112); } catch (e) { /* no seat */ }
    k.look([-3.2, 0.9, 6.6], [0.6, 0.9, 0], 42);
  },
  // 6. A jet in a bright blue sky, telephone wires, palm fronds top-right.
  jet(k) {
    k.environment('noonBlue', { top: 0x48c0f0, mid: 0x8adcf8, horizon: 0xd8f0fc, sunDir: [0.5, 0.75, 0.4] });
    const j = jetMesh(); j.position.set(6, 46, -44); j.rotation.set(0.25, 0.9, 0.15); k.scene.add(j);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 10, 6), flatMat(0x6a4a2a)); pole.position.set(-2.4, 5, -3); k.scene.add(pole);
    for (const y of [8.6, 9.4]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), flatMat(0x6a4a2a)); bar.position.set(-2.4, y, -3); k.scene.add(bar); }
    for (const [dx, dy] of [[-1, 8.6], [-0.35, 8.6], [0.35, 9.4], [1, 9.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 90, 3), flatMat(0x202020)); w.position.set(-2.4 + dx - 20, dy - 1.5, -3 - 30); w.rotation.z = Math.PI / 2; w.rotation.y = 0.6; k.scene.add(w); }
    k.palms([[7.5, 0.5, 9], [10, -6, 11]]);
    k.look([0, 1.6, 6], [1.5, 12, -12], 60);
  },
  // 7. A shop street with a green sign, palms, morning light from behind the camera.
  shopStreet(k) {
    k.environment('sunrise', { sunDir: [0.3, 0.22, 0.9] }); k.ground(200, PALETTE.tan);
    k.add(k.prop('roadSegment', [7, 0.02, 80, PALETTE.asphalt], 80, 2)); k.add(k.prop('sidewalk', [2, 0.05, 80, PALETTE.sidewalk], 80), 5, 0, 0); k.add(k.prop('sidewalk', [2, 0.05, 80, PALETTE.sidewalk], 80), -5, 0, 0);
    const shops = [[0xd8c0a0, 'LIQUOR'], [0xc8b090, 'DONUTS'], [0xb8a888, 'PAWN'], [0xe0d0b0, 'MARKET']];
    shops.forEach(([c, s], i) => k.add(k.prop('building', [10, 5.5, 10, c], { w: 10, d: 10, h: 5.5 + (i % 2) * 2, color: c, sign: s }), 11, 0, -4 - i * 11));
    shops.forEach(([c], i) => k.add(k.prop('building', [10, 6, 10, c], { w: 10, d: 10, h: 6.5 - (i % 2) * 2, color: c }), -11, 0, -8 - i * 11));
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 0.3), flatMat(0x2a8a3a, { map: textTexture('Cluckin', { font: 'bold 56px sans-serif', color: '#fff', bg: '#2a8a3a', w: 256, h: 96 }) })); sign.position.set(6.5, 6.2, -12); sign.rotation.y = -Math.PI / 2; k.scene.add(sign);
    k.add(k.prop('trafficLight', [0.3, 5, 0.3, 0x444444]), 5.5, 0, 6); k.lampRow(-40, 0, 20, -5.5, -1); k.palms([[7, -30, 10], [-7, -20, 9], [-8, -45, 8]]);
    k.look([-2.2, 1.7, 15], [1.5, 3.5, -12], 50);
  },
  // 8. A lone figure walking into the low sun, silhouetted.
  sunsetFigure(k) {
    k.environment('gold', { top: 0xe0963c, mid: 0xf4b85c, horizon: 0xffe4a0, sun: 0xfff8d8, sunDir: [0.05, 0.09, -1], sunSize: 6.5, glow: 1.2, amb: [0x8a5024, 0.32], hemi: [0xc08040, 0x402010, 0.2], dir: [0xffc070, 0.25], fog: [0xf4c070, 40, 140] });
    k.ground(200, 0x6a4828); k.add(k.prop('roadSegment', [7, 0.02, 80, 0x3a3028], 80, 2));
    const cj = k.actor('cj', 'walk'); k.place(cj, 0.2, 0, 0, 0); k.palms([[-9, -30, 10], [12, -26, 9], [-16, -50, 11]]);
    k.add(k.prop('streetLamp', [0.2, 7, 0.2, 0x202020]), 6, 0, -24, -Math.PI / 2);
    k.look([0, 1.2, 6.2], [0, 1.4, -2], 40);
  },
  // 9. Freeway under a yellow sky: lamp posts, a median, a few cars.
  freeway(k) {
    k.environment('gold', { top: 0xf0cc78, mid: 0xf8dc98, horizon: 0xfff0b8, fog: [0xf8e0a0, 50, 240], sunDir: [-0.55, 0.32, -1], glow: 0.55 });
    k.ground(300, 0xc8a870);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(24, 200), flatMat(PALETTE.asphalt, { map: roadTexture({ lanes: 6, repeat: [1, 10] }) })); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, -50); k.scene.add(road);
    k.add(k.prop('wall', [200, 0.9, 0.4, 0xb8b0a0], 200, 0.9, 0xb8b0a0), 0, 0, -50); k.lampRow(-140, 20, 16, -13, 1); k.lampRow(-132, 20, 16, 13, -1);
    for (const [x, z, c] of [[-8, -12, 0xc02020], [5, -34, 0xe8e8e8], [-3, -60, 0x2040a0], [9, -90, 0x808080]]) { const v = k.vehicle('makeTrafficCar', c); k.place(v, x, 0, z, z < -50 ? 180 : 0); }
    k.box(0.5, 8, 0.5, 0x606060, -12.5, 0, -70); k.box(0.5, 8, 0.5, 0x606060, 12.5, 0, -70); k.box(26, 1.6, 0.4, 0x3a7a3a, 0, 7.2, -70);
    k.look([4, 6.5, 26], [0, 3, -40], 50);
  },
  // 10. A ferris wheel on the pier against a blue sky.
  ferris(k) {
    k.environment('noonBlue'); k.ground(200, 0x9a7a50);
    k.add(k.prop('fence', [30, 1.2, 0.1, 0xe0e0e0], 30), 0, 0, 6); k.scene.add(ferrisWheel(10));
    k.box(4, 3, 3, 0xd8d0c0, -9, 0, -2); k.box(3, 2.6, 3, 0xd04040, 9, 0, -3); k.palms([[-16, -8, 9], [15, -12, 8]]);
    k.look([-7, 2, 22], [0, 9.5, 0], 55);
  },
  // 11. A forest road between dark pines.
  forestRoad(k) {
    k.environment('noonBlue', { top: 0x88b0c8, mid: 0xb8ccc8, horizon: 0xd8dcc0, fog: [0xc8d0b8, 12, 95], amb: [0xc8d0c0, 0.62], dir: [0xfff0d0, 0.6], sunDir: [-0.4, 0.8, -0.3] });
    k.ground(300, 0x3a4a2a); k.add(k.prop('roadSegment', [7, 0.02, 160, 0x50504a], 160, 2), 0, 0, -50);
    const pine = (x, z, h) => { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h * 0.3, 5), flatMat(0x3a2a1a)); tr.position.set(x, h * 0.15, z); k.scene.add(tr); const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.18, h * 0.8, 7), flatMat(0x1c3a22)); c.position.set(x, h * 0.3 + h * 0.4, z); k.scene.add(c); };
    for (let z = 4; z > -120; z -= 5) { pine(-6 - k.rng() * 6, z, 12 + k.rng() * 10); pine(6 + k.rng() * 6, z - 2.5, 12 + k.rng() * 10); if (k.rng() < 0.5) pine(-14 - k.rng() * 6, z, 14 + k.rng() * 8); if (k.rng() < 0.5) pine(14 + k.rng() * 6, z, 14 + k.rng() * 8); }
    k.look([0, 1.5, 10], [0, 4, -40], 55);
  },
  // 12. Red-rock desert: mesas, sand, a two-lane road, a pink-yellow sky.
  desert(k) {
    k.environment('gold', { top: 0xe8a888, mid: 0xf4c890, horizon: 0xffe4b0, fog: [0xf4d0a0, 70, 320], sunDir: [-0.6, 0.35, -0.7], glow: 0.6 });
    k.ground(400, 0xd4a468); k.add(k.prop('roadSegment', [7, 0.02, 200, 0x5a4a40], 200, 2), 8, 0, -80, 0.2);
    const mesa = (x, z, w, h, d) => { k.box(w, h, d, 0xb0503a, x, 0, z); k.box(w * 0.7, h * 0.35, d * 0.7, 0xc86a48, x, h, z); k.box(w * 1.4, h * 0.25, d * 1.4, 0x9a4a34, x, 0, z); k.box(w * 1.9, h * 0.08, d * 1.9, 0xc07a50, x, 0, z); };
    mesa(-60, -120, 50, 28, 40); mesa(70, -150, 70, 36, 50); mesa(-20, -210, 90, 45, 60); mesa(30, -90, 20, 12, 16);
    for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.5 + k.rng() * 2, 6), flatMat(0x4a6a3a)); c.position.set(-30 + k.rng() * 60, 1.5, -20 - k.rng() * 60); k.scene.add(c); }
    k.look([0, 3, 20], [0, 9, -60], 50);
  },
  // 13. Casino neon: magenta signs and lit facades at night.
  casinoNeon(k) {
    k.environment('neon'); k.ground(200, 0x1a0a18);
    const lit = windowTexture({ cols: 6, rows: 8, wall: '#3a1838', frame: '#180818', glass: '#ff58c8', litFraction: 0.7, lit: '#ff9ce0', repeat: [2, 3] });
    for (const [x, z, w, h] of [[-14, -14, 14, 30], [12, -18, 16, 40], [0, -30, 20, 26]]) k.box(w, h, 12, 0x501848, x, 0, z, 0, { map: lit, emissive: 0x401030 });
    for (let i = 0; i < 5; i++) k.box(30, 0.5, 0.4, 0xff40c0, 0, 5 + i * 4.5, -11.7, 0, { emissive: 0xff40c0, emissiveIntensity: 1.2 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 6.2), new THREE.MeshBasicMaterial({ map: textTexture('CASINO', { font: 'bold 96px sans-serif', color: '#ff80e0', bg: '#2a0a24', w: 512, h: 160, stroke: '#ffe0f8', strokeWidth: 4 }) })); sign.position.set(6, 30, -11.6); k.scene.add(sign);
    for (const [x, y] of [[-8, 12], [6, 30], [14, 8], [-2, 24]]) k.glow(x, y, -8, 14, 0xff60d0, 0.5);
    k.box(30, 0.5, 0.4, 0x40c0ff, 0, 2.5, -11.7, 0, { emissive: 0x40c0ff, emissiveIntensity: 1.2 }); k.lampRow(-6, 6, 12, -8, 1);
    k.look([-2, 2.2, 17], [2, 15, -8], 55);
  },
};
// The six loading artworks (research §4 tint order) and eight cover panels for the legal screen, all toon portraits.
const ART = [
  { bg: 0x7c1216, preset: 'tenpenny', clip: 'idle', heading: 160 },
  { bg: 0xe9dc9c, preset: 'driver', clip: 'talk', heading: 200 },
  { bg: 0x86bccb, preset: 'cj', clip: 'pedal', framing: 'wide', bike: true, heading: 120, skyline: 0x6ea6b6 },
  { bg: 0xcfc699, preset: 'tenpenny', clip: 'lookAround', framing: 'full', heading: 150, skyline: 0xb8b088 },
  { bg: 0xe8c48a, preset: 'hernandez', clip: 'idle', framing: 'wide', car: 0xd04a20, heading: 170 },
  { bg: 0xc4d0c0, preset: 'steward', clip: 'idle', heading: 175 },
];
const PORTRAITS = [
  { bg: 0xd48a2c, preset: 'cj', clip: 'idle', heading: 165 }, { bg: 0x3f6ea8, preset: 'tenpenny', clip: 'talk', heading: 195 },
  { bg: 0x8a8a8a, preset: 'steward', clip: 'idle', heading: 170 }, { bg: 0x5a8a48, preset: 'pulaski', clip: 'idle', heading: 160 },
  { bg: 0xa03030, preset: 'hernandez', clip: 'lookAround', heading: 200 }, { bg: 0xd8b040, preset: 'cj', clip: 'pedal', framing: 'wide', bike: true, heading: 110 },
  { bg: 0x6a4a8a, preset: 'driver', clip: 'idle', heading: 165 }, { bg: 0x3a8a90, preset: 'pulaski', clip: 'idle', framing: 'wide', car: 0x1a1a1a, heading: 175 },
];
for (let i = 0; i < ART.length; i++) DIORAMAS['art' + (i + 1)] = (k) => k.portrait(ART[i]);
for (let i = 0; i < PORTRAITS.length; i++) DIORAMAS['portrait' + (i + 1)] = (k) => k.portrait(PORTRAITS[i]);
// Hue pairs for the 2D fallback when WebGL cannot render a still (the caller's own fallback would do the same).
const TINTS = { lspdNight: ['#0a0f2a', '#2a3560'], bmxPalms: ['#66d8cc', '#f0c890'], bridge: ['#e89a48', '#ffd8a0'], casinoInterior: ['#b08850', '#f0d080'], orangeCar: ['#f0dca0', '#e06a1c'], jet: ['#48c0f0', '#d8f0fc'], shopStreet: ['#4fbfc6', '#f8bf72'], sunsetFigure: ['#e0963c', '#ffe4a0'], freeway: ['#f0cc78', '#fff0b8'], ferris: ['#2f78d8', '#c6e2f4'], forestRoad: ['#88b0c8', '#3a4a2a'], desert: ['#e8a888', '#b0503a'], casinoNeon: ['#0c0414', '#ff60d0'] };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function fallbackCanvas(name, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const m = name.match(/^(art|portrait)(\d+)$/); const t = TINTS[name] || (m ? [hex((m[1] === 'art' ? ART : PORTRAITS)[+m[2] - 1]?.bg ?? 0x808080), '#202020'] : ['#404040', '#808080']);
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, t[0]); grad.addColorStop(1, t[1]); g.fillStyle = grad; g.fillRect(0, 0, w, h);
  return c;
}
// Linear -> sRGB, applied when the render target holds linear values (three >= r152 writes RTs in the working space).
const SRGB = new Uint8Array(256); for (let i = 0; i < 256; i++) { const l = i / 255; SRGB[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }

// ---------------- the world ----------------
export class World {
  constructor(app) {
    this.app = app; this.built = false; this.sets = {}; this.actors = {}; this.vehicles = {}; this.current = null; this.currentName = 'none';
    this.env = null; this.envName = null; this.time = 0; this.stills = {}; this.rtLinear = null;
  }
  ensureBuilt() {
    if (this.built) return; this.built = true;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1000);
    this.camera.position.set(0, 2, 8);
  }
  resize(w, h) { if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); } }
  set(name) {
    if (!this.sets[name] && BUILDERS[name]) {
      try { this.sets[name] = BUILDERS[name](); } catch (e) { console.error('world: set ' + name + ' failed', e); this.sets[name] = null; }
      if (!this.sets[name]?.group) this.sets[name] = { group: new THREE.Group(), anchors: {}, mapData: null, walkable: () => true };
    }
    return this.sets[name] || null;
  }
  // Swaps the set and the environment; actors and vehicles created so far stay in the scene.
  show(name = 'none', env = 'sunrise') {
    this.ensureBuilt();
    if (this.current) this.scene.remove(this.current.group); this.current = null; this.currentName = name;
    if (INTERIOR[name] && env === 'sunrise') env = 'interior';
    if (this.env) this.env.remove(); this.env = applyEnv(this.scene, env); this.envName = env;
    if (name !== 'none') { const s = this.set(name); if (s) { this.current = s; this.scene.add(s.group); } }
    for (const a of Object.values(this.actors)) if (a.group && !a.group.parent) this.scene.add(a.group);
    for (const v of Object.values(this.vehicles)) if (v.group && !v.group.parent) this.scene.add(v.group);
  }
  actor(name) {
    if (!this.actors[name]) {
      this.ensureBuilt(); let a = null; try { a = makeActor(name); } catch (e) { console.error('world: actor ' + name + ' failed', e); }
      if (!a?.group) a = boxFigure(name); this.actors[name] = a; this.scene.add(a.group);
    }
    return this.actors[name];
  }
  vehicle(name) {
    if (!this.vehicles[name]) {
      this.ensureBuilt(); const kind = { taxi: 'makeTaxi', copcar: 'makeCopCar', bmx: 'makeBMX', train: 'makeTrain' }[name] || 'makeTrafficCar';
      let v = null; try { v = kind === 'makeTrain' ? vehicles.makeTrain(5) : vehicles[kind](); } catch (e) { console.error('world: vehicle ' + name + ' failed', e); }
      if (!v?.group) v = boxVehicle(kind); this.vehicles[name] = v; this.scene.add(v.group);
    }
    return this.vehicles[name];
  }
  // Anchors live in the set that owns them; build that set on demand ('lc.' / 'ls.' prefixes, everything else Los Santos).
  anchor(name) {
    for (const s of Object.values(this.sets)) if (s?.anchors?.[name]) return { ...s.anchors[name] };
    const s = this.set(name.startsWith('lc.') ? 'lcAirport' : name.startsWith('ls.') ? 'lsAirport' : 'losSantos');
    return s?.anchors?.[name] ? { ...s.anchors[name] } : { x: 0, y: 0, z: 0, heading: 0 };
  }
  mapData() { return this.set('losSantos')?.mapData || null; }
  walkable(x, y) { const s = this.set('losSantos'); return s?.walkable ? !!s.walkable(x, y) : true; }
  setCamera({ pos, look, fov } = {}) {
    this.ensureBuilt(); const c = this.camera;
    if (pos) c.position.copy(vec(pos)); c.up.set(0, 1, 0); if (look) c.lookAt(vec(look));
    if (fov && fov !== c.fov) { c.fov = fov; c.updateProjectionMatrix(); }
  }
  update(dt) { this.time += dt; for (const a of Object.values(this.actors)) a.update?.(dt); for (const v of Object.values(this.vehicles)) v.update?.(dt); }
  render(renderer, camera = this.camera) {
    this.ensureBuilt(); if (this.env?.sky) this.env.sky.position.copy(camera.position);
    renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(this.scene, camera);
  }
  // Offscreen still: build the named diorama, render it into a render target, read the pixels back and flip them into a
  // 2D canvas (WebGL rows run bottom-up), converting to sRGB when the target holds linear values. Cached per name + size.
  renderStill(name, w = 320, h = 224) {
    const key = name + '@' + w + 'x' + h; if (this.stills[key]) return this.stills[key];
    let c = null; try { c = this.renderDiorama(name, w, h); } catch (e) { console.info('world: still ' + name + ' fell back', e); c = null; }
    if (!c) c = fallbackCanvas(name, w, h);
    this.stills[key] = c; return c;
  }
  renderDiorama(name, w, h) {
    const build = DIORAMAS[name]; const renderer = this.app?.renderer; if (!build || !renderer) return null;
    const k = new Kit(name.split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0) & 0xffffff, 7)); build(k);
    k.camera.aspect = w / h; k.camera.updateProjectionMatrix(); if (k.env?.sky) k.env.sky.position.copy(k.camera.position);
    if (this.rtLinear == null) this.rtLinear = probeLinear(renderer);
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    const prevRT = renderer.getRenderTarget(), prevClear = new THREE.Color(); renderer.getClearColor(prevClear); const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(k.scene.background || 0x000000, 1); renderer.clear(); renderer.render(k.scene, k.camera);
    const buf = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevAlpha); rt.dispose();
    disposeScene(k.scene);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h), px = img.data, lut = this.rtLinear ? SRGB : null;
    for (let y = 0; y < h; y++) { const src = (h - 1 - y) * w * 4, dst = y * w * 4; for (let i = 0; i < w * 4; i += 4) { const s = src + i, d = dst + i; px[d] = lut ? lut[buf[s]] : buf[s]; px[d + 1] = lut ? lut[buf[s + 1]] : buf[s + 1]; px[d + 2] = lut ? lut[buf[s + 2]] : buf[s + 2]; px[d + 3] = 255; } }
    g.putImageData(img, 0, 0); return c;
  }
}
// Does this renderer write linear values into render targets? Render a mid-grey quad and read it back (55 = linear, 128 = sRGB).
function probeLinear(renderer) {
  try {
    const scene = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); cam.position.z = 1;
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x808080 })));
    const rt = new THREE.WebGLRenderTarget(2, 2); const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.render(scene, cam); const px = new Uint8Array(16); renderer.readRenderTargetPixels(rt, 0, 0, 2, 2, px);
    renderer.setRenderTarget(prev); rt.dispose(); return px[0] < 96;
  } catch (e) { return true; }
}
// Frees the diorama's GPU buffers (textures are tiny canvases and the toon ramp is shared: leave them).
function disposeScene(scene) {
  scene.traverse((o) => { if (o.isMesh || o.isSprite) { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) m.dispose?.(); } });
}
