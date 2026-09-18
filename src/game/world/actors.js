// Actors: articulated box/capsule humanoids for the opening (CJ, the three LSPD officers, the taxi driver, the check-in
// steward). Rig: group (origin at the feet, facing -Z at heading 0) → hips → spine → head / shoulders → elbows → wrists,
// hips → knees → ankles. A pose is a plain object of Euler triples (radians, order XYZ) plus a hips offset; clips are
// procedural (sines for the cycles, eased keyframes for the one-shots), sampled every update and cross-faded. Nothing is
// loaded from files and nothing is random: a pose is a pure function of the clip time, so captures are reproducible.
// Sizes in metres: 1.80 m tall at scale 1, hips 0.95, shoulders 1.46 (CJ is the tallest; the officers a touch shorter).
// Outfits per research/gta-sa-launch.md §5; skin/cloth colours shared with materials.PALETTE when it has them.
import * as THREE from 'three';
import * as materials from './materials.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const wrapDeg = (d) => ((d + 180) % 360 + 360) % 360 - 180;
const wrapRad = (r) => Math.atan2(Math.sin(r), Math.cos(r));
const P = materials.PALETTE || {}, SKIN = P.skin || {}, CLOTH = P.cloth || {};
const mat = (hex) => { try { const m = materials.flatMat?.(hex); if (m) return m; } catch (e) { /* stub */ } return new THREE.MeshLambertMaterial({ color: hex }); };

// ---------------- outfits ----------------
// sleeves: 'skin' (tank top: bare arms), 'short' (shirt: bare forearms), 'long' (uniform / jacket).
const NAVY = CLOTH.navy ?? 0x1e2a48, TROUSERS = 0x1a2340, HAIR = CLOTH.hair ?? 0x14100c;
const UNIFORM = { top: NAVY, sleeves: 'long', pants: TROUSERS, shoes: 0x141414, belt: 0x0e0e0e, tie: 0x0a0a0a, badge: true, holster: true };
export const PRESETS = {
  cj: { skin: SKIN.dark ?? 0x5b3a22, hair: HAIR, hairStyle: 'short', top: CLOTH.tank ?? 0xf0f0f0, sleeves: 'skin', tank: true, pants: CLOTH.jeans ?? 0x3a4f7a, shoes: CLOTH.sneakers ?? 0xf4f4f4, belt: 0x3a2617, buckle: 0xc8a850, height: 1.0 },
  tenpenny: { ...UNIFORM, skin: SKIN.dark ?? 0x5b3a22, hair: null, moustache: 0x1a120c, height: 0.98 },
  pulaski: { ...UNIFORM, skin: SKIN.light ?? 0xd9b48f, hair: 0x5a3a1e, hairStyle: 'short', moustache: 0x5a3a1e, height: 0.97 },
  hernandez: { ...UNIFORM, skin: SKIN.tan ?? 0xb98a5e, hair: HAIR, hairStyle: 'short', cap: 0x182038, height: 0.96 },
  driver: { skin: SKIN.tan ?? 0xb98a5e, hair: HAIR, hairStyle: 'short', moustache: HAIR, top: 0x8a3a2a, sleeves: 'short', pants: 0x3a3a3a, shoes: 0x202020, belt: 0x201810, height: 0.96 },
  steward: { skin: SKIN.light ?? 0xd9b48f, hair: 0xd8b850, hairStyle: 'bob', top: 0x7a2a6a, sleeves: 'long', pants: 0x2a2a3a, shoes: 0x202020, belt: 0x2a2a3a, female: true, height: 0.94 },
};

// ---------------- rig ----------------
const HIP = 0.95, UARM = 0.30, FARM = 0.27, ULEG = 0.43, LLEG = 0.42;
const JOINTS = ['hips', 'spine', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'ulegL', 'llegL', 'footL', 'ulegR', 'llegR', 'footR'];
const pivot = (parent, x, y, z, name) => { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g; };
const box = (parent, w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
// A limb segment hanging from its pivot along -Y (few segments: the PS2 models were a few hundred triangles).
const capsule = (parent, r, len, m) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 2, 8), m); o.position.y = -len / 2; parent.add(o); return o; };
// Low-poly ellipsoid (the head) and a spherical cap over it (hair): phi runs around Y from -X through +Z (the back), so a
// cap that leaves the front open starts just past the face on one side and ends just before it on the other.
const ellipsoid = (parent, rx, ry, rz, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), m); o.scale.set(rx, ry, rz); o.position.set(x, y, z); parent.add(o); return o; };
const cap = (parent, r, m, { theta = 1.5, phiStart = 0, phiLength = TAU, tilt = 0, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1 } = {}) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, phiStart, phiLength, 0, theta), m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.x = tilt; parent.add(o); return o; };

function buildRig(spec) {
  const M = { skin: mat(spec.skin), top: mat(spec.top), pants: mat(spec.pants), shoes: mat(spec.shoes), belt: mat(spec.belt), dark: mat(0x1a1410) };
  const upper = spec.sleeves === 'skin' ? M.skin : M.top, lower = spec.sleeves === 'long' ? M.top : M.skin;
  const group = new THREE.Group(), b = {};
  b.hips = pivot(group, 0, HIP, 0, 'hips');
  box(b.hips, 0.34, 0.20, 0.22, M.pants, 0, -0.06, 0);                       // pelvis 0.79-0.99
  box(b.hips, 0.35, 0.04, 0.23, M.belt, 0, 0.02, 0);
  if (spec.buckle) box(b.hips, 0.05, 0.035, 0.012, mat(spec.buckle), 0, 0.02, -0.118);
  if (spec.holster) box(b.hips, 0.06, 0.15, 0.09, M.dark, 0.19, -0.08, 0.02);
  b.spine = pivot(b.hips, 0, 0.08, 0, 'spine');
  const cw = spec.female ? 0.34 : 0.42;
  box(b.spine, cw - 0.06, 0.24, 0.23, M.top, 0, 0.12, 0);                    // waist 1.03-1.27
  box(b.spine, cw, 0.25, 0.25, M.top, 0, 0.365, 0);                          // chest 1.27-1.52, the shoulders wider than the waist
  if (spec.tank) box(b.spine, 0.18, 0.07, 0.03, M.skin, 0, 0.455, -0.12);     // the tank's scoop neck shows skin
  if (spec.tie) box(b.spine, 0.05, 0.22, 0.012, mat(spec.tie), 0, 0.30, -0.13);
  if (spec.badge) { box(b.spine, 0.035, 0.04, 0.012, mat(0xd8b040), -0.10, 0.36, -0.13); box(b.spine, 0.05, 0.015, 0.012, mat(0xd8d8d8), 0.10, 0.36, -0.13); }
  b.head = pivot(b.spine, 0, 0.48, 0, 'head');
  box(b.head, 0.09, 0.08, 0.09, M.skin, 0, 0.03, 0);                         // neck
  ellipsoid(b.head, 0.095, 0.125, 0.11, M.skin, 0, 0.17, 0).name = 'face';   // head 1.56-1.80
  box(b.head, 0.035, 0.05, 0.035, M.skin, 0, 0.15, -0.105);                  // nose: the profile reads in the close-ups
  for (const s of [-1, 1]) { box(b.head, 0.03, 0.012, 0.012, M.dark, s * 0.04, 0.195, -0.1); box(b.head, 0.02, 0.045, 0.03, M.skin, s * 0.095, 0.17, 0.01); }
  if (spec.moustache) box(b.head, 0.075, 0.018, 0.016, mat(spec.moustache), 0, 0.122, -0.1);
  if (spec.hair != null && spec.hairStyle) {
    const h = mat(spec.hair);
    // Hair is a shell ~1.5 cm outside the skull (the head is 0.095 x 0.125 x 0.11; the facets of both must not cross).
    if (spec.hairStyle === 'bob') { cap(b.head, 0.1, h, { theta: 2.15, phiStart: 3 * Math.PI / 2 + 0.95, phiLength: TAU - 1.9, y: 0.175, sx: 1.16, sy: 1.4, sz: 1.25 }); cap(b.head, 0.1, h, { theta: 0.8, y: 0.175, sx: 1.16, sy: 1.4, sz: 1.25 }); }
    else cap(b.head, 0.1, h, { theta: 1.31, tilt: 0.41, y: 0.175, sx: 1.16, sy: 1.4, sz: 1.25 });   // short crop tilted back: hairline high on the brow, the nape covered
  }
  if (spec.cap) { const c = mat(spec.cap); cap(b.head, 0.1, c, { theta: 1.1, y: 0.2, sx: 1.2, sy: 1.2, sz: 1.28 }); box(b.head, 0.20, 0.015, 0.11, c, 0, 0.275, -0.16); }
  for (const side of ['L', 'R']) {
    const s = side === 'R' ? 1 : -1;
    b['uarm' + side] = pivot(b.spine, s * 0.23, 0.43, 0, 'uarm' + side); capsule(b['uarm' + side], spec.tank ? 0.066 : 0.058, UARM, upper);
    b['farm' + side] = pivot(b['uarm' + side], 0, -UARM, 0, 'farm' + side); capsule(b['farm' + side], 0.047, FARM, lower);
    b['hand' + side] = pivot(b['farm' + side], 0, -FARM, 0, 'hand' + side); box(b['hand' + side], 0.07, 0.14, 0.04, M.skin, 0, -0.07, 0);
    b['uleg' + side] = pivot(b.hips, s * 0.10, -0.02, 0, 'uleg' + side); capsule(b['uleg' + side], 0.085, ULEG, M.pants);
    b['lleg' + side] = pivot(b['uleg' + side], 0, -ULEG, 0, 'lleg' + side); capsule(b['lleg' + side], 0.066, LLEG, M.pants);
    b['foot' + side] = pivot(b['lleg' + side], 0, -LLEG, 0, 'foot' + side); box(b['foot' + side], 0.11, 0.08, 0.27, M.shoes, 0, -0.04, -0.05);
  }
  b.prop = pivot(b.handR, 0, -0.11, -0.03, 'prop');                          // props sit in the right palm
  group.scale.setScalar(spec.height || 1);
  return { group, bones: b };
}

// ---------------- props ----------------
function buildProp(name) {
  const g = new THREE.Group();
  if (name === 'suitcase') { box(g, 0.44, 0.34, 0.14, mat(0x7a4a26), 0, -0.24, 0); box(g, 0.12, 0.05, 0.03, mat(0x3a2414), 0, -0.04, 0); box(g, 0.44, 0.03, 0.15, mat(0x5a3418), 0, -0.10, 0); box(g, 0.44, 0.03, 0.15, mat(0x5a3418), 0, -0.36, 0); }
  else if (name === 'phone') { box(g, 0.045, 0.11, 0.022, mat(0x202024), 0, 0.0, -0.03); box(g, 0.006, 0.05, 0.006, mat(0x404048), 0.015, 0.075, -0.03); }
  else if (name === 'cash') { box(g, 0.07, 0.035, 0.14, mat(0x4a8a3a), 0, -0.01, -0.03); box(g, 0.072, 0.012, 0.03, mat(0xe8e0c0), 0, -0.01, -0.03); }
  else return null;
  return g;
}

// ---------------- poses ----------------
const zero = () => { const p = { y: 0, z: 0 }; for (const j of JOINTS) p[j] = [0, 0, 0]; return p; };
function blend(a, b, k) { const p = { y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) }; for (const j of JOINTS) p[j] = [lerp(a[j][0], b[j][0], k), lerp(a[j][1], b[j][1], k), lerp(a[j][2], b[j][2], k)]; return p; }
// Euler conventions (limbs hang along -Y): x = pitch, + swings the limb forward (-Z); z = roll, + swings the right limb
// outward (the L side is mirrored by the helpers); y = yaw about the limb. Spine/head: x + tips back, y + turns left.
function arm(p, side, pitch, out, elbow, yaw = 0, wrist = 0) { const s = side === 'R' ? 1 : -1; p['uarm' + side] = [pitch, yaw * s, out * s]; p['farm' + side] = [elbow, 0, 0]; p['hand' + side] = [wrist, 0, 0]; }
function leg(p, side, pitch, out, knee, foot = null) { const s = side === 'R' ? 1 : -1; p['uleg' + side] = [pitch, 0, out * s]; p['lleg' + side] = [-knee, 0, 0]; p['foot' + side] = [foot ?? knee - pitch, 0, 0]; }   // foot level by default
const stand = (p) => { arm(p, 'R', 0.05, 0.10, 0.14); arm(p, 'L', 0.05, 0.10, 0.14); leg(p, 'R', 0, 0.04, 0); leg(p, 'L', 0, 0.04, 0); p.spine[0] = -0.02; return p; };
// Aims an arm at directions given in root space (x right, y up, -z forward) for the upper arm and the forearm; the hips
// and spine rotations of the pose are taken into account so a leaning torso still reaches the handlebars / the ear.
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler(), DOWN = new THREE.Vector3(0, -1, 0);
const eulerQ = (a, q) => q.setFromEuler(_e.set(a[0], a[1], a[2], 'XYZ'));
function armAim(p, side, elbow, wrist, twist = 0) {
  const inv = eulerQ(p.hips, _q).multiply(eulerQ(p.spine, _q2)).invert();
  _v.set(elbow[0], elbow[1], elbow[2]).normalize().applyQuaternion(inv); _q2.setFromUnitVectors(DOWN, _v); _e.setFromQuaternion(_q2, 'XYZ'); p['uarm' + side] = [_e.x, _e.y, _e.z];
  _v.set(wrist[0], wrist[1], wrist[2]).normalize().applyQuaternion(inv).applyQuaternion(_q3.copy(_q2).invert()); _q3.setFromUnitVectors(DOWN, _v); _e.setFromQuaternion(_q3, 'XYZ'); p['farm' + side] = [_e.x, _e.y, _e.z]; p['hand' + side] = [0, 0, twist];
}
const mirror = (d) => [-d[0], d[1], d[2]];
function armsAim(p, elbow, wrist, elbowL = mirror(elbow), wristL = mirror(wrist)) { armAim(p, 'R', elbow, wrist); armAim(p, 'L', elbowL, wristL); }
// Two-bone IK, root space: puts the wrist at `target` (the shoulder follows the pose's hips/spine); the elbow bends toward `hint`.
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
function armIK(p, side, target, hint, twist = 0) {
  const s = side === 'R' ? 1 : -1;
  _s.set(s * 0.23, 0.43, 0).applyQuaternion(eulerQ(p.spine, _q2)).add(_v.set(0, 0.08, 0)).applyQuaternion(eulerQ(p.hips, _q)).add(_v.set(0, HIP + p.y, p.z));
  _d.set(target[0], target[1], target[2]).sub(_s); const d = clamp(_d.length(), 0.05, UARM + FARM - 0.005); _d.normalize();
  const a = (UARM * UARM - FARM * FARM + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UARM * UARM - a * a));   // elbow: `a` along the line, `h` off it
  _h.set(hint[0], hint[1], hint[2]); _h.addScaledVector(_d, -_h.dot(_d)); if (_h.lengthSq() < 1e-6) _h.set(s, 0, 0).addScaledVector(_d, -_d.x * s); _h.normalize();   // a hint along the arm line: bend outward
  const ex = _d.x * a + _h.x * h, ey = _d.y * a + _h.y * h, ez = _d.z * a + _h.z * h;
  armAim(p, side, [ex, ey, ez], [_d.x * d - ex, _d.y * d - ey, _d.z * d - ez], twist);
}
// Leg IK in the hips' sagittal plane: the ankle at `target` (root space), the knee forward; `toes` tips the foot down.
function legIK(p, side, target, out = 0.05, toes = 0.15) {
  const s = side === 'R' ? 1 : -1;
  _t.set(target[0], target[1], target[2]).sub(_v.set(0, HIP + p.y, p.z)).applyQuaternion(eulerQ(p.hips, _q).invert()).sub(_v.set(s * 0.1, -0.02, 0));
  const d = clamp(Math.hypot(_t.y, _t.z), 0.05, ULEG + LLEG - 0.005);
  const a = Math.atan2(-_t.z, -_t.y), b = Math.acos(clamp((ULEG * ULEG + d * d - LLEG * LLEG) / (2 * ULEG * d), -1, 1));
  const knee = Math.PI - Math.acos(clamp((ULEG * ULEG + LLEG * LLEG - d * d) / (2 * ULEG * LLEG), -1, 1));
  leg(p, side, a + b, out, knee, knee - (a + b) + toes);
}
// Two-step gait shared by walk / run / carryWalk: legs swing ±legA, the knee folds through the forward swing, arms counter-swing.
function gait(p, w, legA, kneeMin, kneeA, armA, elbow) {
  for (const [side, ph] of [['R', 0], ['L', Math.PI]]) {
    const s = Math.sin(w + ph), swing = Math.max(0, Math.cos(w + ph - 0.5));
    leg(p, side, legA * s, 0.03, kneeMin + kneeA * swing);
    arm(p, side, -armA * s, 0.12, elbow + 0.15 * Math.max(0, -s), 0.1);
  }
  p.spine[1] = 0.08 * Math.sin(w); p.hips[1] = -0.06 * Math.sin(w); p.spine[0] = -0.06; p.head[0] = 0.03;
}
// Seated on a car seat: hips 0.55 above the origin (the world places a driver at seat - 0.55), thighs forward, shins down.
function seated(p) { p.y = -0.40; leg(p, 'R', 1.45, 0.08, 1.35, 0.05); leg(p, 'L', 1.45, 0.08, 1.35, 0.05); p.spine[0] = 0.10; p.head[0] = -0.08; }
// Kneeling upright: hips drop by the shin length, shins flat behind, toes pointing back.
function kneeling(p) { p.y = -0.43; leg(p, 'R', 0.0, 0.10, Math.PI / 2, -1.35); leg(p, 'L', 0.0, 0.10, Math.PI / 2, -1.35); p.spine[0] = -0.04; }
// Eased keyframes for the one-shots: [[t01, pose], ...]; holds the last key.
function keyed(keys, t) { let i = 0; while (i < keys.length - 2 && t >= keys[i + 1][0]) i++; const [t0, a] = keys[i], [t1, b] = keys[i + 1]; return blend(a, b, smooth(clamp((t - t0) / (t1 - t0), 0, 1))); }
const key = (fn) => { const p = stand(zero()); fn(p); return p; };

// Clips: { len: seconds per cycle, fn(t01, pose, seconds) } or { len, keys }. NOMINAL: metres per second the walk cycles
// cover at speed 1 (moveTo scales the clip so the feet keep up with the ground).
export const NOMINAL = { walk: 1.45, run: 4.4, carryWalk: 1.3 };
export const CLIPS = {
  idle: { len: 3.4, fn(t, p) { const w = TAU * t; stand(p); p.spine[0] = -0.02 + 0.012 * Math.sin(w); p.head[0] = 0.015 * Math.sin(w + 1); p.head[1] = 0.03 * Math.sin(w * 0.5); arm(p, 'R', 0.05 + 0.02 * Math.sin(w), 0.10, 0.14); arm(p, 'L', 0.05 + 0.02 * Math.sin(w + 0.4), 0.10, 0.14); } },
  walk: { len: 1.1, fn(t, p) { const w = TAU * t; gait(p, w, 0.5, 0.16, 0.65, 0.42, 0.35); p.y = 0.02 * Math.cos(2 * w) - 0.01; } },
  run: { len: 0.55, fn(t, p) { const w = TAU * t; gait(p, w, 0.85, 0.3, 1.2, 0.75, 1.5); p.spine[0] = -0.28; p.head[0] = 0.18; p.y = 0.04 * Math.cos(2 * w) + 0.02; } },
  // The suitcase hangs from the right hand (research §5, 5-10 s); the torso leans away from the weight.
  carryWalk: { len: 1.15, fn(t, p) { const w = TAU * t; gait(p, w, 0.45, 0.16, 0.6, 0.3, 0.3); arm(p, 'R', 0.02, 0.2, 0.04, 0, 0); p.handR = [0, 0, 0.1]; p.spine[2] = 0.05; p.spine[0] = -0.08; } },
  // Right hand to the ear (the call from Sweet), the head tilts into the phone, the left hand gestures.
  phoneTalk: { len: 2.6, fn(t, p) { const w = TAU * t; stand(p); p.spine[0] = -0.04; p.head[2] = -0.14; p.head[0] = -0.06 + 0.03 * Math.sin(w * 1.7); p.head[1] = -0.05 * Math.sin(w * 0.7); armAim(p, 'R', [0.61, -0.71, -0.39], [-0.58, 0.80, 0.16]); arm(p, 'L', 0.15 + 0.1 * Math.sin(w), 0.15, 0.5 + 0.25 * Math.sin(w * 1.3 + 1), 0.3); } },
  // Kneeling with the hands reaching forward and down: lifting the case off the belt, frisking, "get down on your knees".
  kneel: { len: 3.0, fn(t, p) { const w = TAU * t; stand(p); kneeling(p); p.spine[0] = -0.12 + 0.01 * Math.sin(w); armsAim(p, [0.3, -0.85, -0.4], [0.05, -0.3 + 0.03 * Math.sin(w * 1.5), -0.95]); p.head[0] = -0.02; } },
  // Kneeling with the hands laced behind the head (ref-hVj t0052-55).
  handsBehindHead: { len: 3.0, fn(t, p) { const w = TAU * t; stand(p); kneeling(p); p.spine[0] = -0.06 + 0.01 * Math.sin(w); armsAim(p, [0.95, 0.25, -0.2], [-0.75, 0.55, 0.35]); p.head[0] = -0.12; } },
  // Face down on the asphalt: the hips rotate the whole body flat, head lifted, arms spread.
  prone: { len: 3.0, fn(t, p) { const w = TAU * t; p.y = 0.14 - HIP; p.z = 0.22; p.hips = [-Math.PI / 2, 0, 0]; p.spine[0] = -0.06; p.head[0] = 0.55 + 0.02 * Math.sin(w); leg(p, 'R', 0, 0.12, 0.05, -1.2); leg(p, 'L', 0, 0.12, 0.05, -1.2); armsAim(p, [1, -0.05, -0.2], [0.2, -0.05, -0.95]); } },
  // "Passenger. Show us your hands.": both arms straight up, a slight sway.
  standHandsUp: { len: 2.4, fn(t, p) { const w = TAU * t; stand(p); p.spine[0] = 0.02 + 0.01 * Math.sin(w); p.head[0] = 0.08; armsAim(p, [0.35 + 0.02 * Math.sin(w), 0.85, -0.3], [0.05, 0.98, -0.15]); } },
  sitCar: { len: 3.0, fn(t, p) { const w = TAU * t; stand(p); seated(p); armsAim(p, [0.05, -0.9, -0.3], [-0.3, -0.2, -0.9]); p.head[1] = 0.04 * Math.sin(w * 0.6); p.spine[0] = 0.10 + 0.01 * Math.sin(w); } },
  driveCar: { len: 3.0, fn(t, p) { const w = TAU * t; stand(p); seated(p); const st = 0.04 * Math.sin(w); armsAim(p, [0.1, -0.75 + st, -0.55], [-0.3, 0.42 + st, -0.85], [-0.1, -0.75 - st, -0.55], [0.3, 0.42 - st, -0.85]); p.head[0] = -0.05; } },
  // On the BMX: the world parks the rider's origin 0.42 m above the bike's, so in that frame the saddle is at (0.86, z 0.2),
  // the crank at (0.27, z 0.08) with 0.16 m arms and the grips at (±0.28, 1.0, z -0.39) (measured on vehicles.makeBMX).
  pedal: { len: 0.9, fn(t, p) {
    const w = TAU * t; stand(p); p.y = -0.34; p.z = 0.2; p.spine[0] = -0.5; p.spine[2] = 0.03 * Math.sin(w); p.head[0] = 0.36;
    for (const [side, ph] of [['R', 0], ['L', Math.PI]]) { const s = side === 'R' ? 1 : -1; legIK(p, side, [s * 0.1, -0.06 - 0.16 * Math.cos(w + ph), 0.10 - 0.16 * Math.sin(w + ph)], 0.06, 0.1); }
    armIK(p, 'R', [0.26, 0.64, -0.36], [1, -0.5, 0.3]); armIK(p, 'L', [-0.26, 0.64, -0.36], [-1, -0.5, 0.3]);
  } },
  // A slow sweep of the head with the shoulders following (the alley, "Worst place in the world").
  lookAround: { len: 6.0, fn(t, p) { const w = TAU * t; stand(p); const s = clamp(1.4 * Math.sin(w), -1, 1); p.head[1] = 0.75 * s; p.spine[1] = 0.15 * s; p.head[0] = -0.03 + 0.04 * Math.sin(w * 2); p.spine[0] = -0.03; arm(p, 'R', 0.05, 0.10, 0.16); arm(p, 'L', 0.05, 0.10, 0.16); } },
  // Subtle head nods and a right-hand gesture.
  talk: { len: 2.2, fn(t, p) { const w = TAU * t; stand(p); p.head[0] = 0.05 * Math.sin(2 * w); p.head[1] = 0.06 * Math.sin(w * 0.7); p.spine[0] = -0.03; arm(p, 'R', 0.25 + 0.2 * Math.sin(w), 0.22, 1.0 + 0.4 * Math.sin(w + 0.5), 0.45, 0.2); arm(p, 'L', 0.08, 0.12, 0.3 + 0.1 * Math.sin(w + 2), 0.15); } },
  // One-shots (loop: false holds the last key): a two-handed shove and a stumble backwards ("Get outta here").
  shove: { len: 0.7, keys: [
    [0, key(() => {})],
    [0.35, key((p) => { arm(p, 'R', -0.35, 0.25, 1.7, 0.3); arm(p, 'L', -0.35, 0.25, 1.7, 0.3); p.spine[0] = 0.12; leg(p, 'R', 0.15, 0.06, 0.25); leg(p, 'L', -0.15, 0.06, 0.05); })],
    [0.55, key((p) => { p.spine[0] = -0.35; p.head[0] = 0.2; armsAim(p, [0.15, -0.25, -0.95], [0.0, -0.05, -1]); leg(p, 'R', 0.4, 0.06, 0.45); leg(p, 'L', -0.35, 0.06, 0.05); p.z = -0.12; })],
    [1, key((p) => { p.spine[0] = -0.15; armsAim(p, [0.2, -0.6, -0.75], [0.05, -0.3, -0.95]); leg(p, 'R', 0.25, 0.06, 0.3); leg(p, 'L', -0.2, 0.06, 0.05); p.z = -0.12; })] ] },
  stumble: { len: 1.2, keys: [
    [0, key(() => {})],
    [0.3, key((p) => { p.spine[0] = 0.4; p.spine[2] = 0.1; p.head[0] = 0.3; armsAim(p, [0.8, 0.4, -0.2], [0.3, 0.9, -0.3]); leg(p, 'R', -0.55, 0.1, 0.4); leg(p, 'L', 0.2, 0.1, 0.1); p.z = 0.15; })],
    [0.6, key((p) => { p.spine[0] = 0.1; p.spine[2] = -0.05; p.head[0] = 0.1; armsAim(p, [0.95, -0.1, -0.2], [0.7, 0.6, -0.3]); leg(p, 'R', -0.15, 0.3, 0.35); leg(p, 'L', 0.15, 0.3, 0.3); p.z = 0.3; p.y = -0.06; })],
    [1, key((p) => { p.spine[0] = -0.03; leg(p, 'R', -0.05, 0.12, 0.08); leg(p, 'L', 0.05, 0.12, 0.05); p.z = 0.35; })] ] },
};
for (const c of Object.values(CLIPS)) if (c.keys) c.fn = (t, p) => Object.assign(p, keyed(c.keys, t));

// ---------------- the actor ----------------
const ARRIVE = 0.08, TURN = 540;   // arrival radius (m), turn rate (deg/s)
class Actor {
  constructor(preset) {
    const spec = PRESETS[preset] || PRESETS.driver; const rig = buildRig(spec);
    this.preset = preset; this.spec = spec; this.group = rig.group; this.bones = rig.bones; this.group.name = 'actor:' + preset;
    this.heading = 0; this.clip = 'idle'; this.cur = null; this.prev = null; this.fadeT = 0; this.fadeLen = 0; this.pose = null;
    this.goal = null; this.propName = 'none'; this.propObj = null; this.look = null; this.lookCur = [0, 0];
    this.play('idle', { fade: 0 }); this.update(0);
  }
  setPosition(x, y, z) { this.group.position.set(x, z, -y); return this; }
  setHeading(deg) { this.heading = deg; this.group.rotation.y = deg * D2R; return this; }
  position() { const p = this.group.position; return [p.x, -p.z, p.y]; }
  // Starts a clip; a looping clip already playing just takes the new speed. `fade` seconds cross-fade from the pose on screen.
  play(clip, { loop = true, speed = 1, fade = 0.2 } = {}) {
    const name = CLIPS[clip] ? clip : 'idle';
    if (this.cur && this.cur.name === name && this.cur.loop && loop) { this.cur.speed = speed; return this; }
    if (this.cur) { this.prev = this.pose && this.prev ? { pose: this.pose } : this.cur; this.fadeT = 0; this.fadeLen = fade; }   // interrupted mid-fade: freeze what is on screen
    this.cur = { name, def: CLIPS[name], loop, speed, time: 0 }; this.clip = name; return this;
  }
  sample(st) { const u = st.time / st.def.len; const t = st.loop ? u - Math.floor(u) : clamp(u, 0, 1); const p = zero(); st.def.fn(t, p, st.time); return p; }
  update(dt = 0) {
    if (!(dt >= 0)) dt = 0;
    if (this.goal) this.step(dt);
    this.cur.time += dt * this.cur.speed;
    let pose = this.sample(this.cur);
    if (this.prev) {
      this.fadeT += dt; const k = this.fadeLen > 0 ? clamp(this.fadeT / this.fadeLen, 0, 1) : 1;
      if (!this.prev.pose) this.prev.time += dt * this.prev.speed;
      pose = blend(this.prev.pose || this.sample(this.prev), pose, smooth(k)); if (k >= 1) this.prev = null;
    }
    this.pose = pose; this.apply(pose, dt);
  }
  apply(p, dt) {
    const b = this.bones; b.hips.position.set(0, HIP + p.y, p.z);
    for (const j of JOINTS) b[j].rotation.set(p[j][0], p[j][1], p[j][2]);
    // Head tracking: yaw/pitch toward the look target on top of the clip's head pose, eased and clamped to a neck's range.
    let ty = 0, tp = 0;
    if (this.look) {
      const g = this.group.position, up = 1.62 * this.group.scale.y; const dx = this.look[0] - g.x, dy = this.look[1] - (g.y + up), dz = this.look[2] - g.z;
      ty = clamp(wrapRad(Math.atan2(-dx, -dz) - this.heading * D2R - p.hips[1] - p.spine[1]), -1.3, 1.3); tp = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.6);
    }
    const k = 1 - Math.exp(-dt * 7); this.lookCur[0] += (ty - this.lookCur[0]) * k; this.lookCur[1] += (tp - this.lookCur[1]) * k;
    b.head.rotation.y += this.lookCur[0]; b.head.rotation.x += this.lookCur[1];
  }
  // Walks toward (x, y, z) at `speed` m/s with `clip`, turning to face it first; call every frame, true once arrived.
  moveTo(x, y, z, speed = 1.4, clip = 'walk') {
    const [px, py] = this.position(); const name = CLIPS[clip] ? clip : 'walk';
    if (Math.hypot(x - px, y - py) <= ARRIVE) { if (this.goal) this.arrive(); else this.setPosition(x, y, z); return true; }
    this.goal = { x, y, z, speed, clip: name }; const rate = speed / (NOMINAL[name] || NOMINAL.walk);
    if (this.clip !== name) this.play(name, { speed: rate }); else this.cur.speed = rate;
    return false;
  }
  arrive() { const g = this.goal; this.goal = null; this.setPosition(g.x, g.y, g.z); if (this.clip === g.clip) this.play('idle'); }
  step(dt) {
    const g = this.goal, [px, py, pz] = this.position(); const dx = g.x - px, dy = g.y - py, d = Math.hypot(dx, dy);
    if (d <= ARRIVE) { this.arrive(); return; }
    const want = Math.atan2(-dx, dy) / D2R; const diff = clamp(wrapDeg(want - this.heading), -TURN * dt, TURN * dt); this.setHeading(this.heading + diff);
    if (Math.abs(wrapDeg(want - this.heading)) > 60) return;   // turn on the spot until roughly facing the goal
    const s = Math.min(d, g.speed * dt), h = this.heading * D2R;
    this.setPosition(px - Math.sin(h) * s, py + Math.cos(h) * s, lerp(pz, g.z, s / d));
    if (d - s <= ARRIVE) this.arrive();
  }
  holdProp(name = 'none') {
    if (name === 'bag') name = 'suitcase';
    if (this.propObj) { this.bones.prop.remove(this.propObj); this.propObj = null; }
    this.propName = name; const o = buildProp(name); if (o) { this.propObj = o; this.bones.prop.add(o); }
    return this;
  }
  lookAt(x, y, z) { this.look = x == null ? null : Array.isArray(x) ? [x[0], x[2], -x[1]] : [x, z, -y]; return this; }   // SA coords → three
}
export function makeActor(preset = 'cj') { return new Actor(preset); }
