// Palette, materials, canvas textures and the PS2 environment presets for the San Andreas world. Everything is drawn or
// synthesised at runtime. Colours come from research/gta-sa-launch.md §9 (console timecyc at 6 AM: sky #5acdff over
// #c89055, an 8° sun, fog from 100 m) as they read *after* the console's warm filter (R 1.84, G 1.41, B 0.67): the
// captured frames show a mint-teal zenith, a peach-orange horizon, cream whites and dark backlit silhouettes, so the
// presets reproduce the filtered look directly (warm ambient, an orange low sun, peach fog) instead of post-processing.
import * as THREE from 'three';

// Light intensities are physical since r155 (a Lambert surface reflects intensity / pi): scale so 1.0 still reads "full".
const LIGHT = parseInt(THREE.REVISION, 10) >= 155 ? Math.PI : 1;
const D2R = Math.PI / 180;

export const PALETTE = {
  asphalt: 0x4a4a4a, sidewalk: 0x9a9384, tan: 0xc9a86b, stucco: 0xd8c4a0, concrete: 0xb0aaa0, brick: 0x9a5a3a, roof: 0x6a4a3a,
  grass: 0x6a7a3a, dirt: 0x8a7a5a, palmTrunk: 0x6b4a2a, palmFrond: 0x3f7a2a, treeDark: 0x2e4a24, metal: 0x777777, glass: 0x7fa0b8,
  taxi: 0xf2c31c, cop: 0x141414, copWhite: 0xe8e8e8, rust: 0x7a3a22, rail: 0x5a4a3a,
  skin: { dark: 0x5b3a22, tan: 0xb98a5e, light: 0xd9b48f },
  cloth: { tank: 0xf0f0f0, jeans: 0x3a4f7a, navy: 0x1e2a48, sneakers: 0xf4f4f4, hair: 0x14100c, khaki: 0xa89870 },
};

// ---------------- materials ----------------
// Vertex-lit look: Lambert, no specular. `emissive` keeps lit windows and neon readable in the dark presets.
export function flatMat(hex, { emissive = 0x000000, emissiveIntensity = 1, side = THREE.FrontSide, map = null, transparent = false, opacity = 1 } = {}) {
  return new THREE.MeshLambertMaterial({ color: hex, emissive, emissiveIntensity, side, map, transparent, opacity });
}
// Three-band toon ramp shared by every toon material (NearestFilter keeps the bands hard, like the loading artworks).
let ramp = null;
function toonRamp(steps = 3) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) { const v = Math.round(255 * (0.5 + 0.5 * i / (steps - 1))); data.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
}
export function toonMat(hex, { emissive = 0x000000, map = null, side = THREE.FrontSide } = {}) {
  ramp = ramp || toonRamp(3);
  return new THREE.MeshToonMaterial({ color: hex, emissive, map, gradientMap: ramp, side });
}
// Ink outline: the same geometry pushed out along its normals and drawn back-face only (thickness in metres).
export function outlineMat(thickness = 0.02, hex = 0x0a0a0a) {
  return new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(hex) } },
    vertexShader: 'uniform float thickness; void main() { vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 color;\nvoid main() {\n  gl_FragColor = vec4(color, 1.0);\n  #include <colorspace_fragment>\n}',
    side: THREE.BackSide,
  });
}
// Turns a Lambert-built object (an actor, a vehicle) into the cover-art look: toon materials of the same colours plus an outline.
export function toonify(root, { outline = 0.02 } = {}) {
  if (!root?.traverse) return root;
  const meshes = []; root.traverse((o) => { if (o.isMesh && !o.isSprite && o.geometry?.attributes?.normal && !o.userData.outline) meshes.push(o); });
  const ink = outlineMat(outline);
  const swap = (m) => (m?.color ? toonMat(m.color.getHex(), { emissive: m.emissive ? m.emissive.getHex() : 0, map: m.map || null, side: m.side }) : m);
  for (const m of meshes) {
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    const o = new THREE.Mesh(m.geometry, ink); o.userData.outline = true; m.add(o);
  }
  return root;
}

// ---------------- canvas textures ----------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function finish(c, { nearest = true, repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (nearest) t.magFilter = THREE.NearestFilter;   // chunky PS2 texels when magnified; mipmapped when far
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true; return t;
}
// Deterministic speckle (mulberry32) so walls and asphalt are not flat colour; `amount` in 0..1.
function speckle(g, w, h, amount, seed = 1) {
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 255 * amount; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
  g.putImageData(img, 0, 0);
}
export function textTexture(text, { font = 'bold 48px sans-serif', color = '#fff', bg = 'transparent', w = 256, h = 64, align = 'center', stroke = null, strokeWidth = 0, nearest = true, lineHeight = 1.1 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  const lines = String(text).split('\n'); const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 48) * lineHeight;
  const x = align === 'left' ? w * 0.06 : align === 'right' ? w * 0.94 : w / 2;
  lines.forEach((line, i) => { const y = h / 2 + (i - (lines.length - 1) / 2) * size; if (stroke && strokeWidth) { g.lineJoin = 'round'; g.strokeStyle = stroke; g.lineWidth = strokeWidth; g.strokeText(line, x, y); } g.fillText(line, x, y); });
  return finish(c, { nearest });
}
// A wall with a grid of windows; `litFraction` of them glow (night scenes). Tileable: repeat it along a facade.
export function windowTexture({ w = 256, h = 256, cols = 4, rows = 3, wall = '#c9b89a', frame = '#4a4a4a', glass = '#6f8ea8', lit = '#ffe6a0', litFraction = 0, seed = 1, sill = true, repeat = null, noise = 0.06 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = wall; g.fillRect(0, 0, w, h); if (noise) speckle(g, w, h, noise, seed);
  let a = (seed * 7919) >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cw = w / cols, ch = h / rows, ww = cw * 0.5, wh = ch * 0.55;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = Math.round(k * cw + (cw - ww) / 2), y = Math.round(r * ch + (ch - wh) / 2);
    g.fillStyle = frame; g.fillRect(x - 2, y - 2, ww + 4, wh + 4);
    g.fillStyle = rnd() < litFraction ? lit : glass; g.fillRect(x, y, ww, wh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, ww * 0.45, wh * 0.4);   // a pale pane so the glass has depth
    g.fillStyle = frame; g.fillRect(x + ww / 2 - 1, y, 2, wh);
    if (sill) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 3, y + wh + 2, ww + 6, 3); }
  }
  return finish(c, { repeat: repeat || [1, 1] });
}
// Asphalt with lane markings: U across the road, V along it (repeat V per segment length).
export function roadTexture({ w = 128, h = 256, lanes = 2, asphalt = '#4c4c4c', line = '#d9d2b4', yellow = '#d8b23a', dashed = true, edges = true, repeat = null, seed = 3 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = asphalt; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.08, seed);
  const lw = Math.max(2, Math.round(w / 48));
  for (let i = 1; i < lanes; i++) {
    const x = Math.round(w * i / lanes - lw / 2); const centre = lanes % 2 === 0 && i === lanes / 2;
    g.fillStyle = centre ? yellow : line;
    if (dashed && !centre) for (let y = 0; y < h; y += h / 4) g.fillRect(x, y, lw, h / 8); else g.fillRect(x, 0, lw, h);
  }
  if (edges) { g.fillStyle = line; g.fillRect(2, 0, lw, h); g.fillRect(w - 2 - lw, 0, lw, h); }
  return finish(c, { repeat: repeat || [1, 1] });
}
export function gradientTexture(stops, { w = 8, h = 256, horizontal = false, nearest = false } = {}) {
  const c = canvas(w, h), g = c.getContext('2d'); const grad = horizontal ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, 0, 0, h);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad; g.fillRect(0, 0, w, h); return finish(c, { nearest });
}

// ---------------- sky + environment presets ----------------
// Gradient dome with a disc + halo sun; drawn from the view direction so it reads right wherever the camera is.
const SKY_VERT = 'varying vec3 vDir; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }';
const SKY_FRAG = `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunSize; uniform float glow; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir); float e = d.y; vec3 col;
  if (e >= 0.0) { float t = pow(e, 0.6); col = t < 0.35 ? mix(horizon, mid, t / 0.35) : mix(mid, top, (t - 0.35) / 0.65); }
  else col = mix(horizon, ground, clamp(-e * 6.0, 0.0, 1.0));
  float c = dot(d, sunDir);
  float disc = smoothstep(cos(sunSize), cos(sunSize * 0.55), c);
  float halo = pow(max(c, 0.0), 28.0) * glow + pow(max(c, 0.0), 7.0) * glow * 0.32;
  col = mix(col, sunColor, disc) + sunColor * halo;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SKY_RADIUS = 750;   // inside the camera's far plane (1000); fog has long taken over by then
function skyDome(p) {
  const u = { top: { value: new THREE.Color(p.top) }, mid: { value: new THREE.Color(p.mid ?? p.top) }, horizon: { value: new THREE.Color(p.horizon) }, ground: { value: new THREE.Color(p.ground ?? p.horizon) }, sunColor: { value: new THREE.Color(p.sun ?? 0xffffff) }, sunDir: { value: new THREE.Vector3(...(p.sunDir || [0, 1, 0])).normalize() }, sunSize: { value: (p.sunSize ?? 0) * D2R }, glow: { value: p.glow ?? 0 } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.frustumCulled = false; m.renderOrder = -10; m.name = 'sky'; return m;
}

// Presets. sunDir is in three.js space (x east, y up, z south); colours are what the captures show (already "filtered").
// amb / hemi / dir: [colour, intensity] with intensity 1 = a fully lit white surface.
export const ENVS = {
  // 06:30 sunny Los Santos (ref-hVj2 t0075/t0108, ref-hVj4 t0200): mint zenith, khaki band, peach horizon, a huge sun low in
  // the east; gold light on everything, shadow sides still warm tan; peach fog from 100 m.
  sunrise: { top: 0x4cbcc8, mid: 0xa8d0a0, horizon: 0xf6b062, ground: 0xd89858, sun: 0xfff2b0, sunDir: [1, 0.10, 0.28], sunSize: 4.2, glow: 0.8, fog: [0xf3b066, 90, 320], amb: [0xffc07c, 0.7], hemi: [0xd8d8a8, 0xb06a34, 0.26], dir: [0xffa84e, 1.0], bg: 0xf6b062 },
  // Everything gold: sunset figure, freeway, bridge (credits stills).
  gold: { top: 0xe0a44c, mid: 0xf2c46a, horizon: 0xffe9a8, ground: 0xd8a860, sun: 0xfff6d0, sunDir: [0.3, 0.12, -1], sunSize: 5, glow: 1.0, fog: [0xf6d284, 60, 260], amb: [0xffc878, 0.7], hemi: [0xf0c070, 0xa06830, 0.3], dir: [0xffd080, 1.0], bg: 0xffe9a8 },
  // Midday blue: the jet, the ferris wheel, the forest road.
  noonBlue: { top: 0x2f78d8, mid: 0x7ab8ec, horizon: 0xc6e2f4, ground: 0xb0c8d0, sun: 0xffffff, sunDir: [0.35, 0.85, 0.3], sunSize: 1.5, glow: 0.4, fog: [0xcfe4f2, 150, 520], amb: [0xdfe8ff, 0.62], hemi: [0xbfd8ff, 0x807050, 0.35], dir: [0xfff4e0, 1.1], bg: 0xc6e2f4 },
  // Night street (the LSPD cruiser still): navy sky, cool ambient, a faint moon.
  night: { top: 0x04071a, mid: 0x0d1636, horizon: 0x2a3560, ground: 0x141a30, sun: 0xc8d0e8, sunDir: [-0.4, 0.5, -0.6], sunSize: 0.5, glow: 0.05, fog: [0x151c34, 40, 220], amb: [0x5a6a98, 0.42], hemi: [0x4a5a90, 0x101018, 0.35], dir: [0x8090c0, 0.5], bg: 0x2a3560 },
  // Casino neon (magenta): near-black sky, pink ambient so the facades catch the signs.
  neon: { top: 0x0c0414, mid: 0x2a0c34, horizon: 0x5a1650, ground: 0x200a20, sun: 0x000000, sunDir: [0, 1, 0], sunSize: 0, glow: 0, fog: [0x3a1032, 25, 140], amb: [0xff70c8, 0.5], hemi: [0xff90d8, 0x3020a0, 0.35], dir: [0xffa0e0, 0.35], bg: 0x5a1650 },
  // Airport interiors: no sky, a dim grey haze, flat white light from above.
  interior: { fog: [0x2a2a2e, 30, 140], amb: [0xdadce6, 0.85], hemi: [0xffffff, 0x50504c, 0.45], dir: [0xffffff, 0.75], sunDir: [0.3, 1, 0.5], bg: 0x2a2a2e },
  // Flat tinted card for the toon portraits: no fog, a low fill plus a key from the upper left, so the three ramp bands land
  // at about 75 / 93 / 100 % of the base colour (the fill must stay low or every band clips to the base colour).
  flat: { amb: [0xffffff, 0.32], hemi: [0xffffff, 0xd0d0d0, 0.08], dir: [0xffffff, 0.7], sunDir: [-0.6, 0.9, 1.2], bg: 0x808080 },
};

// Installs a preset on a scene (sky dome or plain background, fog, ambient + hemisphere + sun). `overrides` patch any
// field (a still might want the sun in frame). Returns the pieces plus remove().
export function applyEnv(scene, name = 'sunrise', overrides = {}) {
  const p = { ...(ENVS[name] || ENVS.sunrise), ...overrides };
  const sunDir = new THREE.Vector3(...(p.sunDir || [1, 1, 0])).normalize();
  const amb = new THREE.AmbientLight(p.amb[0], p.amb[1] * LIGHT);
  const hemi = new THREE.HemisphereLight(p.hemi[0], p.hemi[1], p.hemi[2] * LIGHT);
  const sun = new THREE.DirectionalLight(p.dir[0], p.dir[1] * LIGHT); sun.position.copy(sunDir).multiplyScalar(200);
  scene.add(amb, hemi, sun);
  scene.background = new THREE.Color(p.bg ?? p.horizon ?? 0x000000);
  scene.fog = p.fog ? new THREE.Fog(p.fog[0], p.fog[1], p.fog[2]) : null;
  let sky = null;
  if (p.top != null) { sky = skyDome({ ...p, sunDir: [sunDir.x, sunDir.y, sunDir.z] }); scene.add(sky); }
  const env = { name, preset: p, amb, hemi, sun, sky, sunDir, remove() { scene.remove(amb, hemi, sun); if (sky) { scene.remove(sky); sky.geometry.dispose(); sky.material.dispose(); } scene.fog = null; } };
  return env;
}
