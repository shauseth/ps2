// The OSD "clock" module: main menu (black + 7 orbs) and the System Configuration backdrop (fog tunnel, 12 crystal
// rods, glass cubes as item icons). Geometry from the aap/osdbits reverse engineering, motion and colours from frame
// measurements (research/frames-menu-main.md). ROM (x, y, z) -> three.js (x, -y, -z); the camera looks down -z.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { glowTexture, noiseTexture } from '../textures.js';
import { makeRng } from '../rng.js';

const FPS = 60, TAU = Math.PI * 2, D2R = Math.PI / 180;
const RING_R = 20, ROD_LEN = 26, ROD_R = 2.6;         // ROM rod geometry (ring radius, length, circumradius)
const HUB_Y = 0.96;                                    // hub sits at 49 % H: camera slightly below the axis
const CUBE_POS = [[-11.5, -12.0, 47.5], [-22.5, -7.2, 47.5], [-10.75, -2.4, 47.5], [-21.75, 2.4, 47.5], [-11.25, 7.2, 47.5], [-22.0, 12.0, 47.5]];

const SOFT_BLUR = {
  uniforms: { tDiffuse: { value: null }, radius: { value: 1.6 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float radius; uniform vec2 resolution; varying vec2 vUv;
    void main(){ vec2 px = radius / resolution; vec4 s = vec4(0.0); float w = 0.0;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { float k = exp(-0.35 * float(i*i + j*j)); s += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px) * k; w += k; }
      gl_FragColor = s / w; }`,
};
// Glass: screen-space refraction of the captured backdrop + flat facet shading + Blinn specular + Fresnel rim.
const GLASS = {
  uniforms: { tScreen: { value: null }, centre: { value: new THREE.Vector2(0.5, 0.5) }, zoom: { value: -0.1 }, shift: { value: 0.05 }, refr: { value: 0.35 }, body: { value: new THREE.Vector3(0.15, 0.35, 0.45) }, bodyMix: { value: 0.7 }, rim: { value: new THREE.Vector3(0.6, 0.85, 1.0) }, rimGain: { value: 0.9 }, spec: { value: 0.6 }, lightDir: { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() }, alpha: { value: 1.0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec4 vClip; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vClip = projectionMatrix * mv; gl_Position = vClip; }`,
  fragmentShader: `uniform sampler2D tScreen; uniform vec2 centre; uniform float zoom, shift, refr, bodyMix, rimGain, spec, alpha; uniform vec3 body, rim, lightDir; varying vec3 vN; varying vec3 vV; varying vec4 vClip;
    void main(){ vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5; vec3 n = normalize(vN); vec3 v = normalize(vV); uv += n.xy * shift; uv += (uv - centre) * zoom; uv = clamp(uv, 0.001, 0.999);
      vec3 back = texture2D(tScreen, uv).rgb * refr;
      float facet = 0.45 + 0.75 * max(0.0, dot(n, lightDir));                 // flat-shaded facets
      vec3 h = normalize(lightDir + v); float sp = pow(max(0.0, dot(n, h)), 40.0) * spec;
      float f = 1.0 - abs(dot(n, v)); float e = f * f * f * 0.6;
      vec3 c = back * (1.0 - bodyMix) + body * bodyMix * facet + rim * e * rimGain + vec3(sp);
      gl_FragColor = vec4(c, alpha); }`,
};

function hexRodGeometry(length = ROD_LEN, radius = ROD_R) {
  const body = new THREE.CylinderGeometry(radius, radius, length, 6, 1, false); body.translate(0, length / 2, 0);
  const cap = new THREE.CylinderGeometry(radius * 0.9, radius, radius * 0.15, 6, 1, false); cap.translate(0, length + radius * 0.075, 0);
  const geos = [body, cap].map(g => g.toNonIndexed());
  let count = 0; for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals(); return geo;
}
function glassMaterial(side, over = {}) {
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(GLASS.uniforms), vertexShader: GLASS.vertexShader, fragmentShader: GLASS.fragmentShader, side, depthWrite: false, depthTest: false, transparent: true });
  for (const [k, v] of Object.entries(over)) { if (v && v.isVector3) m.uniforms[k].value.copy(v); else if (Array.isArray(v)) m.uniforms[k].value.set(...v); else m.uniforms[k].value = v; }
  return m;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class MenuScene {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);   // backdrop: tunnel + orbs
    this.overlay = new THREE.Scene(); this.overlay.background = null;                    // rods + cubes over the captured backdrop
    this.camera = new THREE.PerspectiveCamera(2 * Math.atan(112 / (512 * 0.47)) * 180 / Math.PI, 4 / 3, 1, 3000);
    this.baseFov = this.camera.fov;
    this.restPos = new THREE.Vector3(10.436, -HUB_Y, 103); this.flyOffset = 0;
    this.glowTex = glowTexture(64, { core: 0.04, power: 3.2 }); this.coreTex = glowTexture(32, { core: 0.55, power: 6 });
    this.clockTime = null; this.clockOffset = 0;
    this.look = 'main'; this.mode = 'list'; this.mix = 0; this.mixTarget = 0; this.mixSpeed = 1;
    this.frame = 0; this.acc = 0; this.entry = 0; this.selectedItem = 0; this.configTimer = 0; this.exitZoom = 0; this._itemCount = 6;
    this.hueT = Math.random() * 21.9;
    this._build(); this._post();
    this.trailCanvas = document.createElement('canvas'); Object.assign(this.trailCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  }
  _post() {
    const r = this.app.renderer; const size = r.getSize(new THREE.Vector2());
    this.rtBack = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.backMat = new THREE.MeshBasicMaterial({ map: this.rtBack.texture, depthTest: false, depthWrite: false });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backMat); bg.frustumCulled = false; bg.renderOrder = -10;
    this.backMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'gl_Position = vec4(position.xy, 0.999, 1.0);'); };
    this.overlay.add(bg);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.overlay, this.camera));
    this.blur = new ShaderPass(SOFT_BLUR); this.blur.uniforms.resolution.value.set(size.x, size.y); this.composer.addPass(this.blur);
    this.composer.addPass(new OutputPass());
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h); this.rtBack.setSize(w, h); this.blur.uniforms.resolution.value.set(w, h); this.blur.uniforms.radius.value = Math.max(1, w / 640 * 1.6); this.trailCanvas.width = w; this.trailCanvas.height = h; }

  _build() {
    const s = this.scene;
    // --- fog tunnel: centred on the hub axis (x = 0); brightness ~1/depth^2.2 in linear light so the screen ramp
    // reads linear: near-black hole around the hub, #362b5a-class violet at the corners, right half brighter ---
    const tex = noiseTexture(256, 19, { octaves: 6, baseFreq: 5, contrast: 0.9, bias: 0.12 }); tex.repeat.set(6, 4); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const RINGS = 33, SEGS = 32, RAD = 60, SPACING = 20;
    const geo = new THREE.CylinderGeometry(RAD, RAD, 1, SEGS, RINGS - 1, true); geo.rotateX(Math.PI / 2);
    const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const zi = Math.round((pos.getZ(i) + 0.5) * (RINGS - 1));
      const z = zi * SPACING - 20; const pp = Math.pow(Math.min(1, 72 / Math.max(z, 1)), 2.2);
      col[i * 3] = pp * 0.062; col[i * 3 + 1] = pp * 0.042; col[i * 3 + 2] = pp * 0.165;
      pos.setZ(i, -(zi * SPACING - 20));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.tunnelBase = geo.attributes.position.array.slice();
    this.tunnelMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    this.tunnel = new THREE.Mesh(geo, this.tunnelMat); this.tunnel.renderOrder = -5; this.tunnel.frustumCulled = false; s.add(this.tunnel); this.tunnelTex = tex;
    // --- orbs (three coords, centred on the hub) ---
    this.orbs = [];
    for (let i = 0; i < 7; i++) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(0x30 / 128, 0x62 / 128, 0x80 / 128), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.coreTex, color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      halo.renderOrder = 30; core.renderOrder = 31; s.add(halo, core);
      this.orbs.push({ halo, core, pos: new THREE.Vector3(), trail: [], theta: (i / 7) * TAU, drift: 0, phase: 0 });
    }
    this.sphereN = new THREE.Vector3(0.2, 0.3, 1).normalize();
    // --- rods (overlay, ROM space inside a tilted group) ---
    this.tilt = new THREE.Group(); this.tilt.rotation.set(-3 * D2R, 7 * D2R, 0); this.overlay.add(this.tilt);   // left side and bottom nearer
    this.romOverlay = new THREE.Group(); this.romOverlay.scale.set(1, -1, -1); this.tilt.add(this.romOverlay);
    this.clock = new THREE.Group(); this.romOverlay.add(this.clock);
    const rodGeo = hexRodGeometry(ROD_LEN, ROD_R); const edgeGeo = new THREE.EdgesGeometry(rodGeo, 25);
    this.rodBackMat = glassMaterial(THREE.BackSide, { refr: 0.2, bodyMix: 0.65, rimGain: 0.25, spec: 0.1 });
    this.rodMat = glassMaterial(THREE.FrontSide, { refr: 0.25, bodyMix: 0.75, rimGain: 0.5, spec: 0.35, zoom: -0.1 });
    this.hourMat = glassMaterial(THREE.FrontSide, { refr: 0.15, bodyMix: 0.85, body: [0.42, 0.78, 0.98], rim: [0.7, 0.95, 1.0], rimGain: 0.8, spec: 0.8, zoom: -0.1 });
    this.hourBackMat = glassMaterial(THREE.BackSide, { refr: 0.15, bodyMix: 0.8, body: [0.3, 0.6, 0.85], rimGain: 0.3, spec: 0.3 });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.35, depthTest: false });
    this.rods = [];
    for (let i = 0; i < 12; i++) {
      const pivot = new THREE.Group(); pivot.rotation.order = 'ZYX';
      const back = new THREE.Mesh(rodGeo, this.rodBackMat); back.renderOrder = 10; const mesh = new THREE.Mesh(rodGeo, this.rodMat); mesh.renderOrder = 11;
      const edges = new THREE.LineSegments(edgeGeo, this.edgeMat); edges.renderOrder = 12;
      pivot.add(back, mesh, edges); pivot.userData = { i, back, mesh }; this.clock.add(pivot); this.rods.push(pivot);
    }
    // --- glass cubes attached to the camera: the list's item icons ---
    this.cubeCam = new THREE.Group(); this.overlay.add(this.cubeCam);
    const cg = new THREE.BoxGeometry(5.28, 5.28, 5.28); const cubeEdge = new THREE.EdgesGeometry(cg);
    this.cubes = CUBE_POS.map((p, i) => {
      const back = new THREE.Mesh(cg, glassMaterial(THREE.BackSide, { refr: 0.7, bodyMix: 0.3, body: [0.14, 0.13, 0.2], rimGain: 0.35, spec: 0.35 })); back.renderOrder = 20;
      const front = new THREE.Mesh(cg, glassMaterial(THREE.FrontSide, { refr: 0.8, bodyMix: 0.35, body: [0.16, 0.15, 0.22], rimGain: 1.0, spec: 0.8, zoom: -0.1 })); front.renderOrder = 21;
      const edges = new THREE.LineSegments(cubeEdge, new THREE.LineBasicMaterial({ color: 0xd8d8f0, transparent: true, opacity: 0.4, depthTest: false })); edges.renderOrder = 22;
      const g = new THREE.Group(); g.position.set(p[0], -p[1], -p[2]); g.add(back, front, edges); g.visible = false; this.cubeCam.add(g);
      return { group: g, back: back.material, front: front.material, edges: edges.material, i, bright: 0, scale: 0 };
    });
  }

  setLook(look, seconds = 0) {
    const prev = this.look; this.look = look; this.mixTarget = look === 'config' ? 1 : 0; this.mixSpeed = seconds > 0 ? 1 / seconds : 1e9;
    if (look === 'config' && prev !== 'config') { this.configTimer = 0; this.exitTimer = null; for (const c of this.cubes) c.scale = 0; }
    if (look !== 'config' && prev === 'config') this.exitTimer = 0;
    if ((look === 'browser' || look === 'save' || look === 'logo') && prev === 'main') this.exitZoom = 0.0001;
    if (look === 'main' && prev !== 'main') this.exitZoom = 0;
  }
  setMode(mode) { this.mode = mode; }            // 'list' | 'display' | 'options'
  scatterOut() { this.scatter = 0.0001; }        // orbs fly outward and dim (Browser entry, ~1.8 s)
  reappear() { this.scatter = 0; this.entry = 0; this.bootCluster = 0.3; for (const o of this.orbs) o.trail = []; }
  setSelectedItem(i) { this.selectedItem = i; }
  get itemCount() { return this._itemCount; } set itemCount(n) { this._itemCount = n; }
  now(t) { return this.clockTime != null ? new Date(this.clockTime + t * 1000) : new Date(Date.now() + (this.clockOffset || 0)); }

  enter({ look = 'main', fromBoot = true } = {}) {
    this.setLook(look, 0); this.mix = this.mixTarget; this.frame = 0; this.acc = 0; this.entry = 0; this.exitZoom = 0; this.exitTimer = null;
    this.flyOffset = 100; this.orbEase = 0; this.bootCluster = fromBoot ? 1 : 0; this.scatter = 0;
    const rnd = makeRng(this.app.rng.int(1, 1e6)); this.rnd = rnd;
    for (const o of this.orbs) { o.trail = []; o.phase = rnd() * TAU; o.drift = 0; }
    if (!this.trailCanvas.isConnected) this.app.ui.appendChild(this.trailCanvas);
    this.app.fade(0, 0.05);
  }
  exit() { this.trailCanvas.remove(); }

  // rod colour cycle: HSV hue 202 -> 254 -> 202 over 21.9 s (triangle), S ~0.65, V ~0.5
  rodColour(dt) {
    this.hueT = (this.hueT + dt) % 21.9; const k = this.hueT / 21.9; const tri = k < 0.5 ? k * 2 : 2 - k * 2;
    const hue = 202 + 52 * tri; const c = new THREE.Color(); c.setHSL(hue / 360, 0.68, 0.30); return c;
  }
  // the 30 s fold: rotation about the hour axis; edge-on (90 deg) held :14.5-:16.5 and :44.5-:46.5, eased in from :10, out by :21
  foldAngle(secs) {
    const s = secs % 30; let a = 0;
    if (s >= 10 && s < 14.5) a = smooth(10, 14.5, s) * 90;
    else if (s >= 14.5 && s < 16.5) a = 90;
    else if (s >= 16.5 && s < 21) { const k = smooth(16.5, 21, s); a = 90 * (1 - k) + Math.sin(k * Math.PI) * 6; }
    return a * D2R;
  }

  stepFrame(t, dtWall) {
    const d = this.now(t); const secs = d.getSeconds() + d.getMilliseconds() / 1000, mins = d.getMinutes() + secs / 60, hour = d.getHours() % 12;
    const hourAngle = -(hour / 12) * TAU;          // 12 at the top, clockwise on screen (ROM y is down)
    // camera fly-in and browser-exit zoom
    this.flyOffset *= 0.97;
    this.camera.position.set(this.restPos.x, this.restPos.y, this.restPos.z + this.flyOffset);
    this.camera.lookAt(this.restPos.x, this.restPos.y, this.restPos.z - 1);
    if (this.exitZoom > 0) { this.exitZoom = Math.min(1, this.exitZoom + 1 / 30); this.camera.fov = this.baseFov / (1 + 0.5 * this.exitZoom); this.camera.updateProjectionMatrix(); }
    else if (this.camera.fov !== this.baseFov) { this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); }
    // ---- orbs: on a slowly tumbling sphere; ring most of the time; they gather into one cluster around :15/:45 ----
    this.entry++;
    this.orbEase += ((mins / 60) - this.orbEase) * 0.005; const R = this.orbEase * 7.25 + 10;
    const n = this.sphereN; n.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0025).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.0012).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(); const v = new THREE.Vector3().crossVectors(n, u);
    const s30 = secs % 30; const gather = smooth(11, 15, s30) * (1 - smooth(17, 21, s30));   // 0 = ring, 1 = cluster
    this.bootCluster = Math.max(0, this.bootCluster - 1 / (7 * FPS));
    const gatherAll = Math.max(gather, this.bootCluster);
    const clusterTheta = this.frame * (TAU / (2.37 * FPS)); // the cluster itself circles the sphere every 2.37 s
    if (this.scatter > 0) this.scatter = Math.min(1, this.scatter + 1 / (1.8 * FPS));
    for (let i = 0; i < 7; i++) {
      const o = this.orbs[i];
      o.drift += (this.rnd() - 0.5) * 0.004; o.drift *= 0.985; o.theta += o.drift * 0.1 + 0.0009;   // slow wander (a few deg/s)
      const base = o.theta; const th = base + (clusterTheta + o.phase * 0.08 - base) * gatherAll;
      const el = Math.sin(o.phase + this.frame * 0.003) * 0.35 * (1 - gatherAll);                   // off-ring wobble (sphere, not a flat ring)
      const p = new THREE.Vector3().addScaledVector(u, Math.cos(th) * Math.cos(el) * R).addScaledVector(v, Math.sin(th) * Math.cos(el) * R).addScaledVector(n, Math.sin(el) * R);
      p.y += HUB_Y; // hub
      if (this.scatter > 0) { const k = this.scatter; p.add(new THREE.Vector3(Math.cos(o.phase) * 60 * k, Math.sin(o.phase) * 40 * k, 0)); }
      o.pos.copy(p); o.halo.position.copy(p); o.core.position.copy(p);
      const depth = this.camera.position.distanceTo(p); const perPx = 2 * depth * Math.tan(this.camera.fov * Math.PI / 360) / 224;
      o.halo.scale.set(perPx * 16, perPx * 16, 1); o.core.scale.set(perPx * 4.7, perPx * 4.7, 1);
      const a = Math.min(1, this.entry / 90) * (1 - (this.scatter || 0)); o.halo.material.opacity = 0.42 * a; o.core.material.opacity = a;
      if (this.frame % 3 === 0) { o.trail.push(p.clone()); if (o.trail.length > 50) o.trail.shift(); }
    }
    // ---- System Configuration backdrop ----
    const e = this.mix; const T = this.configTimer / FPS;
    const fogIn = e > 0 ? smooth(0.25, 1.35, T) : 0; const rodsIn = fogIn; const cubesIn = smooth(0.6, 1.35, T);
    const out = this.exitTimer != null ? 1 - smooth(0.15, 1.35, this.exitTimer / FPS) : 1;
    const bd = Math.min(fogIn, out) * (e > 0.001 ? 1 : 0);
    this.tunnelMat.opacity = bd; this.tunnel.visible = bd > 0.001;
    this.tunnel.position.set(0, this.camera.position.y, this.camera.position.z);
    this.tunnelTex.offset.y += 0.0005;
    { const pos = this.tunnel.geometry.attributes.position; const base = this.tunnelBase; const ph = this.frame * 100 / 65536 * TAU;
      for (let i = 0; i < pos.count; i++) { const zi = Math.round((-(base[i * 3 + 2]) + 20) / 20); const w = 1 + 0.05 * Math.sin(ph + zi * 5120 / 65536 * TAU); pos.setXY(i, base[i * 3] * w, base[i * 3 + 1] * w); } pos.needsUpdate = true; }
    // wheel: face-on (Display/Options) with the :15/:45 fold; in the list it keeps turning about the hour axis (6 deg/s)
    const turn = this.mode === 'list' ? secs * 6 * D2R : this.foldAngle(secs);
    const bundle = this.mode === 'list' ? 0 : smooth(12, 14.5, secs % 30) * (1 - smooth(16.5, 20, secs % 30));
    this.clock.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), hourAngle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
    const rc = this.rodColour(dtWall); const idle = new THREE.Color(rc.r * 0.8, rc.g * 0.85, rc.b * 0.8).lerp(new THREE.Color(0.3, 0.6, 0.85), bundle * 0.7);
    const ringEase = Math.min(rodsIn, out); this.clock.visible = bd > 0.001;
    for (const p of this.rods) {
      const ud = p.userData; const isHour = ud.i === hour;
      const a = -ud.i * TAU / 12 - Math.PI; const r = RING_R + (1 - ringEase) * 60;   // rods slide in from outside
      p.position.set(-Math.sin(a) * r, Math.cos(a) * r, 0); p.rotation.set(0, this.frame * 0.006 + ud.i * 0.7, a);
      const sc = Math.max(0.001, ringEase); p.scale.set(sc, sc, sc);
      ud.mesh.material = isHour ? this.hourMat : this.rodMat; ud.back.material = isHour ? this.hourBackMat : this.rodBackMat;
    }
    this.rodMat.uniforms.body.value.set(idle.r, idle.g, idle.b); this.rodBackMat.uniforms.body.value.set(idle.r * 0.6, idle.g * 0.6, idle.b * 0.7);
    for (const m of [this.rodMat, this.rodBackMat, this.hourMat, this.hourBackMat]) m.uniforms.alpha.value = ringEase;
    this.edgeMat.opacity = 0.35 * ringEase;
    // cubes: list state only; scale in 0.75 s from +0.35 s; selected one lit blue
    const showCubes = this.mode === 'list' && e > 0.5;
    for (const c of this.cubes) {
      const target = showCubes && c.i < this.itemCount ? Math.min(cubesIn, out) : 0; c.scale += (target - c.scale) * 0.2;
      c.group.visible = c.scale > 0.01; c.group.scale.setScalar(Math.max(0.001, c.scale) * 1.0);
      const ang = this.frame * 30 / 65536 * TAU + c.i * 7000 / 65536 * TAU; c.group.rotation.set(ang, ang * 0.9, ang * 1.1);
      const sel = c.i === this.selectedItem ? 1 : 0; c.bright += (sel - c.bright) * 0.12;
      const body = new THREE.Color(0.16, 0.15, 0.22).lerp(new THREE.Color(0.05, 0.28, 0.9), c.bright);
      c.front.uniforms.body.value.set(body.r, body.g, body.b); c.back.uniforms.body.value.set(body.r * 0.8, body.g * 0.8, body.b * 0.9);
      c.front.uniforms.bodyMix.value = 0.35 + 0.5 * c.bright; c.back.uniforms.bodyMix.value = 0.3 + 0.5 * c.bright;
      c.edges.color.setRGB(0.85 + 0.1 * c.bright, 0.85 + 0.1 * c.bright, 0.94); c.edges.opacity = 0.4 * c.scale;
    }
    if (e > 0.5) this.configTimer++;
    if (this.exitTimer != null) this.exitTimer++;
    this.frame++;
  }
  update(dt, t) {
    if (this.mix !== this.mixTarget) { const step = this.mixSpeed * dt; this.mix = this.mix < this.mixTarget ? Math.min(this.mixTarget, this.mix + step) : Math.max(this.mixTarget, this.mix - step); }
    this.acc += dt; let n = 0; while (this.acc >= 1 / FPS && n < 6) { this.stepFrame(t, 1 / FPS); this.acc -= 1 / FPS; n++; }
  }
  drawTrails() {
    const c = this.trailCanvas, ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const v = new THREE.Vector3();
    for (const o of this.orbs) {
      const tr = o.trail; if (tr.length < 2) continue;
      const pts = tr.map(p => { v.copy(p).project(this.camera); return [(v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height]; });
      for (let k = 1; k < pts.length; k++) {
        const f = Math.max(0, 128 - 3 * (pts.length - 1 - k)) / 128;
        const rr = 48 * f * f * f * f / 128, gg = 98 * f * f / 128, bb = 128 * f / 128;
        ctx.strokeStyle = `rgba(${Math.round(rr * 255)},${Math.round(gg * 255)},${Math.round(bb * 255)},${(f * 0.22).toFixed(3)})`; ctx.lineWidth = Math.max(1, c.height / 720 * 1.0);
        ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  render() {
    const r = this.app.renderer;
    this.cubeCam.position.copy(this.camera.position); this.cubeCam.quaternion.copy(this.camera.quaternion);
    this.tilt.position.set(0, HUB_Y * 0 + 0, 0);
    r.setRenderTarget(this.rtBack); r.setClearColor(0x000000, 1); r.clear(); r.render(this.scene, this.camera);
    this.camera.updateMatrixWorld();
    const hub = new THREE.Vector3(0, 0, 0).project(this.camera);
    for (const m of [this.rodMat, this.rodBackMat, this.hourMat, this.hourBackMat]) { m.uniforms.tScreen.value = this.rtBack.texture; m.uniforms.centre.value.set(hub.x * 0.5 + 0.5, hub.y * 0.5 + 0.5); }
    for (const cb of this.cubes) { if (!cb.group.visible) continue; const p = new THREE.Vector3(); cb.group.getWorldPosition(p); p.project(this.camera); for (const m of [cb.front, cb.back]) { m.uniforms.tScreen.value = this.rtBack.texture; m.uniforms.centre.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5); } }
    r.setRenderTarget(null);
    this.composer.render();
    this.drawTrails();
  }
}
