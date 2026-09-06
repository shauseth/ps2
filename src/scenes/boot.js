// The opening ("Sony Computer Entertainment" scene), ported from the retail OSDSYS behaviour documented by the
// aap/osdbits reverse engineering and cross-checked against frame measurements (research/frames-boot.md).
// Coordinates: ROM (x, y, z) -> three.js (x, -y, -z); the camera looks down -z. Simulation runs at 60 steps/s.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HIST_TABLE_C, HIST_TABLE_D, HIST_CELLS, srcPos, CUBE_SEEDS, LIGHT_COLORS } from './opening-data.js';
import { noiseTexture, glowTexture } from '../textures.js';
import { makeRng } from '../rng.js';
import { el, clear } from '../ui/overlay.js';

const FPS = 60;
const TOWER_HALF = 2.2;          // box half-width (pitch is 5.2)
const STATE_LEVELS = [16, 56, 104, 320, 672, 800, 1160, 1160];
const DISC_READY_FRAME = 230;    // when a "disc" is identified (variable on real hardware)

function towerGrid() {
  // real HeightGrid: two radial bumps + integer-hash dither, clamped [32, 220]
  const sq = Math.sqrt(5202), g = [];
  for (let i = 0; i < 20; i++) { g[i] = []; for (let j = 0; j < 20; j++) {
    const gx = (i - 10) * 5.1 + 2.55, gy = (j - 10) * 5.1 + 2.55;
    const d1 = 2 * Math.hypot(-5.1 - gx, gy), d2 = 4 * Math.hypot(10.2 - gx, 5.1 - gy);
    let v = Math.min(255, Math.max(32, 255 * (sq - d1) / sq)) + Math.min(255, Math.max(32, 255 * (sq - d2) / sq * 0.5));
    v *= 0.85; v -= 10 * ((Math.trunc(((i + j) * i) / (j + 1)) % 11) - 5);
    g[i][j] = Math.min(220, Math.max(32, v));
  } }
  return g;
}
// Tower wall texture: a light grey panel/grout pattern (authored, not extracted).
function wallTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  const rnd = makeRng(41);
  ctx.fillStyle = '#c4c7ce'; ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size); const d = img.data;
  for (let i = 0; i < size * size; i++) { const n = (rnd() - 0.5) * 22; d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n; }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(70,74,84,0.28)'; ctx.lineWidth = 2;
  for (let k = 0; k <= size; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, size); ctx.moveTo(0, k); ctx.lineTo(size, k); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  for (let k = 3; k <= size; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, size); ctx.moveTo(0, k); ctx.lineTo(size, k); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
const FEEDBACK_SHADER = {
  uniforms: { tCur: { value: null }, tPrev: { value: null }, mix: { value: 0.625 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D tCur, tPrev; uniform float mix; varying vec2 vUv; void main(){ vec4 c = texture2D(tCur, vUv); vec4 p = texture2D(tPrev, vUv); gl_FragColor = vec4(c.rgb * (1.0 - mix) + p.rgb * mix, 1.0); }`,
};
const BLUR_SHADER = {
  uniforms: { tDiffuse: { value: null }, radius: { value: 0 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float radius; uniform vec2 resolution; varying vec2 vUv;
    void main(){ if (radius <= 0.0) { gl_FragColor = texture2D(tDiffuse, vUv); return; } vec2 px = radius / resolution; vec4 s = vec4(0.0);
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px);
      gl_FragColor = s / 25.0; }`,
};
// Screen-space refraction like the ROM: sample the captured frame at the fragment's own screen position,
// displaced by the projected normal and zoomed about the cube centre (-8.4 % on front faces); plus edge glow.
const REFRACT_SHADER = {
  uniforms: { tScreen: { value: null }, centre: { value: new THREE.Vector2(0.5, 0.5) }, zoom: { value: -0.084 }, tint: { value: new THREE.Vector3(112 / 128, 112 / 128, 127 / 128) }, gain: { value: 1.0 }, shift: { value: 0.05 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec4 vClip; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vClip = projectionMatrix * mv; gl_Position = vClip; }`,
  fragmentShader: `uniform sampler2D tScreen; uniform vec2 centre; uniform float zoom; uniform vec3 tint; uniform float gain; uniform float shift; varying vec3 vN; varying vec3 vV; varying vec4 vClip;
    void main(){ vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5; vec3 n = normalize(vN); uv += n.xy * shift; uv += (uv - centre) * zoom; uv = clamp(uv, 0.001, 0.999);
      vec3 c = texture2D(tScreen, uv).rgb * tint * gain; float l = abs(dot(n, normalize(vV))); float e = (1.0 - l) * (1.0 - l) * 0.5;
      gl_FragColor = vec4(c + vec3(0.8, 0.86, 1.0) * e * 0.55, 1.0); }`,
};
const RIM_SHADER = {
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float l = abs(dot(normalize(vN), normalize(vV))); float e = (1.0 - l) * (1.0 - l) * 0.5; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * e * 1.6, 1.0); }`,
};

export class BootScene {
  constructor(app) {
    this.app = app;
    // layer 1: towers (rendered to a target and fed back at 62.5 %); layer 2: fog, lights, cubes over it
    this.towerScene = new THREE.Scene(); this.towerScene.background = new THREE.Color(0x000000);
    this.scene = new THREE.Scene(); this.scene.background = null;          // fog + lights over the fed-back tower layer
    this.finalScene = new THREE.Scene(); this.finalScene.background = null; // the captured frame + refractive cubes
    this.camera = new THREE.PerspectiveCamera(26.9, 4 / 3, 1, 3000);
    this.wallTex = wallTexture();
    this.fogTex = [noiseTexture(64, 31, { octaves: 4, baseFreq: 2, contrast: 1.9, bias: 0.08 }), noiseTexture(64, 32, { octaves: 4, baseFreq: 3, contrast: 1.8, bias: 0.05 }), noiseTexture(64, 33, { octaves: 5, baseFreq: 4, contrast: 1.7 })];
    for (const t of this.fogTex) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); }
    this.glowTex = glowTexture(64, { core: 0.06, power: 2.4 });
    this.coreTex = glowTexture(32, { core: 0.5, power: 4 });
    this.grid = towerGrid();
    this._buildStatic();
    this._setupPost();
    this.sceText = null;
  }
  _setupPost() {
    const r = this.app.renderer; const size = r.getSize(new THREE.Vector2());
    const mk = () => new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rtTowers = mk(); this.rtFeed = [mk(), mk()]; this.feedIdx = 0; this.rtPre = mk();
    this.feedMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FEEDBACK_SHADER.uniforms), vertexShader: FEEDBACK_SHADER.vertexShader, fragmentShader: FEEDBACK_SHADER.fragmentShader, depthTest: false, depthWrite: false });
    this.feedScene = new THREE.Scene(); this.feedScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.feedMat)); this.feedCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // background quad showing the fed-back tower layer, drawn first in the overlay scene
    this.bgMat = new THREE.MeshBasicMaterial({ map: this.rtFeed[0].texture, depthTest: false, depthWrite: false });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat); bg.frustumCulled = false; bg.renderOrder = -10;
    bg.onBeforeRender = (renderer, scene, camera) => { bg.matrixWorld.identity(); }; // keep it screen-aligned
    this.bgMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'gl_Position = vec4(position.xy, 0.999, 1.0);'); };
    this.scene.add(bg); this.bgQuad = bg;
    this.preMat = new THREE.MeshBasicMaterial({ map: this.rtPre.texture, depthTest: false, depthWrite: false });
    const bg2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.preMat); bg2.frustumCulled = false; bg2.renderOrder = -10;
    this.preMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'gl_Position = vec4(position.xy, 0.999, 1.0);'); };
    this.finalScene.add(bg2);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.finalScene, this.camera));
    this.blur = new ShaderPass(BLUR_SHADER); this.blur.uniforms.resolution.value.set(size.x, size.y); this.composer.addPass(this.blur);
    this.composer.addPass(new OutputPass());
  }
  resize(w, h) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h);
    for (const t of [this.rtTowers, ...this.rtFeed, this.rtPre]) t.setSize(w, h); this.blur.uniforms.resolution.value.set(w, h);
  }
  _buildStatic() {
    // --- fog: six additive scrolling noise layers on a 17x17 grid (spacing 6), blue blob centred at ROM (-5.1, 0) ---
    this.fogLayers = [];
    const sq = Math.sqrt(5202);
    for (let l = 0; l < 6; l++) {
      const geo = new THREE.PlaneGeometry(96, 96, 16, 16); const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + 2, y = -pos.getY(i); // ROM x,y of this vertex
        const d = Math.hypot(-5.1 - (x + 1), 0 - (y + 3)); let c = (sq - d * 4) * 96 / sq; c = Math.min(127, Math.max(0, c));
        col[i * 3] = (c / 4) / 128; col[i * 3 + 1] = (c * 2 / 5) / 128; col[i * 3 + 2] = c / 128;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const tex = this.fogTex[[2, 1, 0, 2, 1, 0][l]].clone(); tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 20 / 128 * 1.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      const m = new THREE.Mesh(geo, mat); m.position.set(2, 0, -(134 - l * 5)); m.renderOrder = 5;
      this.scene.add(m); this.fogLayers.push({ mesh: m, tex, anim: 0, rate: (14 - l) * 0.0001 * (l + 1) * 0.5 });
    }
    // --- four comet lights: sprite heads (4 history positions each) + a 128-sample additive trail ---
    this.lights = [];
    for (let l = 0; l < 4; l++) {
      const c = LIGHT_COLORS[l].map(v => v / 128); const colour = new THREE.Color(c[0], c[1], c[2]);
      const heads = [];
      for (let i = 0; i < 4; i++) {
        const a = 24 * (i + 1) / 5 / 128, aw = 12 * (i + 1) / 5 / 128;
        const s1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: colour.clone().multiplyScalar(0.5), transparent: true, opacity: a * 4, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); s1.scale.set(1.6, 1.6, 1);
        const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.coreTex, color: 0xffffff, transparent: true, opacity: aw * 4, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); s2.scale.set(0.5, 0.5, 1);
        s1.renderOrder = 8; s2.renderOrder = 9; this.scene.add(s1, s2); heads.push([s1, s2]);
      }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(128 * 3), 3)); tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(128 * 3), 3));
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); trail.frustumCulled = false; trail.renderOrder = 7;
      this.scene.add(trail);
      this.lights.push({ colour, heads, trail, history: [], samples: [] });
    }
    // --- five glass cubes: back-face then front-face screen-space refraction passes + Fresnel edge glow ---
    this.cubes = [];
    const cg = new THREE.BoxGeometry(3.6, 3.6, 3.6);
    for (let i = 0; i < 5; i++) {
      const d = i === 2 ? 0.9 : (i - 2) * 0.8;
      const sd = CUBE_SEEDS[i];
      const anchor = new THREE.Vector3(sd[0] * 3.5, -(sd[1] * 3.5), -(sd[2] * -15 + 150));
      const rate = [0.0031 / d, d * 0.0022, d / 1000 + 0.0013];
      const v = d * (i % 3) * 3.7 + 0.2856;
      const mkMat = (side, gain, zoom) => { const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(REFRACT_SHADER.uniforms), vertexShader: REFRACT_SHADER.vertexShader, fragmentShader: REFRACT_SHADER.fragmentShader, side, depthWrite: false, depthTest: false }); m.uniforms.gain.value = gain; m.uniforms.zoom.value = zoom; return m; };
      const back = new THREE.Mesh(cg, mkMat(THREE.BackSide, 122 / 128, 0.0)); back.renderOrder = 20;
      const front = new THREE.Mesh(cg, mkMat(THREE.FrontSide, 240 / 128, -0.084)); front.renderOrder = 21;
      const grp = new THREE.Group(); grp.position.copy(anchor); grp.rotation.set(v, v, v); grp.add(back, front);
      this.finalScene.add(grp); this.cubes.push({ mesh: grp, mats: [back.material, front.material], rate, ang: [v, v, v] });
    }
    // lights for the towers (VU1 light rows: (0,0,-1) white, (0.5,0.5,0) and (-0.5,-0.5,0) at 0.8, ambient 0.4)
    const L1 = new THREE.DirectionalLight(0xffffff, 2.2); L1.position.set(0, 0, 1); this.towerScene.add(L1, L1.target);
    const L2 = new THREE.DirectionalLight(0xffffff, 1.2); L2.position.set(0.5, -0.5, 0); this.towerScene.add(L2, L2.target);
    const L3 = new THREE.DirectionalLight(0xffffff, 1.2); L3.position.set(-0.5, 0.5, 0); this.towerScene.add(L3, L3.target);
    this.towerScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    this.towerGroup = new THREE.Group(); this.towerScene.add(this.towerGroup);
  }
  // ---- the tower field from the 21-slot history (real GenerateTowerField) ----
  buildTowers(history, card) {
    clear(this.towerGroup); this.towers = [];
    const flags = [], C = [], D = [];
    for (let r = 0; r < 14; r++) { flags[r] = []; C[r] = []; D[r] = []; for (let c = 0; c < 9; c++) { flags[r][c] = 0; C[r][c] = 0; D[r][c] = 1; } }
    if (card) for (let i = 0; i < Math.min(21, history.length); i++) {
      const e = history[i]; if (!e || !e.name) continue;
      const tidx = e.count < 14 ? e.count : (e.count - 14) % 10 + 4;
      for (let t = 0; t < 6; t++) { const [r, c] = HIST_CELLS[i][t];
        if (t === e.own) { flags[r][c] = 1; C[r][c] = HIST_TABLE_C[Math.min(13, tidx)]; D[r][c] = HIST_TABLE_D[Math.min(13, tidx)]; }
        else if (e.mask >> t & 1) { flags[r][c] = 1; C[r][c] = 1; D[r][c] = 1; } }
    }
    const mat = new THREE.MeshLambertMaterial({ map: this.wallTex, vertexColors: true });
    for (let r = 0; r < 14; r++) for (let c = 0; c < 9; c++) {
      if (!flags[r][c]) continue;
      const [sx, sy, sz] = srcPos(r, c);
      let px = (sx + 4.8) * 4, py = (sy - 6.5) * 4, pz = (sz + 4) * 12 + 150;
      const A = Math.max(D[r][c] * 30, 3); const f3 = C[r][c]; pz += f3 * 30 - A;
      const B = f3 >= 1 ? 0 : Math.trunc((1 - f3) * 128);
      const s = this.grid[r + 3][c + 6] * (B !== 0 ? B / 128 : A / 30) / 128 * 1.15; // vertex brightness (1.0 = 128)
      const geo = new THREE.BoxGeometry(TOWER_HALF * 2, TOWER_HALF * 2, A * 2);
      const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3); const nrm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) { const near = pos.getZ(i) > 0; const isCap = nrm.getZ(i) > 0.5; const v = near ? (isCap ? s : s * 0.8) : 0; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // authentic smeared texture bands: per-cell integer-division ST offset
      const u = (Math.trunc((r + c + 9) * (r + 8) / (c + 7)) + Math.trunc((r + c + 9) * (r + 7) / (c + 9))) / 256;
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + u, uv.getY(i) * 0.5 + u);
      const m = new THREE.Mesh(geo, mat); m.position.set(px, -py, -pz);
      m.userData = { sways: f3 !== 1 };
      this.towerGroup.add(m); this.towers.push(m);
    }
  }
  enter({ history = [], card = true, mode = 'menu' } = {}) {
    this.mode = mode; this.disc = mode === 'disc'; this.done = false;
    this.buildTowers(history, card);
    // camera state (real InitAnimation)
    this.frame = 0; this.acc = 0; this.state = 0; this.go = false; this.ended = false; this.discReady = false;
    this.pos = new THREE.Vector3(0, 0, 16); this.rot = -0.12;
    this.pSpeed = [0, 0, 0.04]; this.pAcc1 = [0, 0, 0]; this.pAcc2 = [0, 0, 0]; this.rSpeed = 0.001; this.rAcc = 0;
    this.sceState = 0; this.sceAlpha = 0; this.sceStep = 4;
    this.rnd = makeRng(this.app.rng.int(1, 1e6)); this.lightsSeed = Math.floor(this.rnd() * 2345) + 3456;
    for (const L of this.lights) { L.history = []; L.samples = []; }
    for (const f of this.fogLayers) f.anim = 0;
    for (let i = 0; i < 2; i++) { this.app.renderer.setRenderTarget(this.rtFeed[i]); this.app.renderer.clear(); } this.app.renderer.setRenderTarget(null);
    clear(this.app.ui);
    this.sceText = el('div', 'sce-text', 'Sony Computer Entertainment'); this.sceText.style.opacity = '0'; this.app.ui.appendChild(this.sceText);
    this.lead = 2.0; this.app.fade(1, 0);
    this.app.sounds?.play('startup', this.lead, this.disc ? { disc: true, whooshPeakAt: null } : {});
    this.stepFrame(); this.render();
  }
  exit() { this.sceText?.remove(); }

  // ---- one 60 Hz frame of the real state machine ----
  stepFrame() {
    const fps = FPS, ts = 1.0; const p = this.pos;
    if (STATE_LEVELS[this.state] < p.z) this.state++;
    switch (this.state) {
      case 1:
        if (this.disc) {
          this.rSpeed = 0.0004;
          this.pAcc2[2] = this.frame < fps * 20 / 6 ? -0.00014 : 0.000025;
          if (this.frame >= DISC_READY_FRAME) { this.pAcc2[2] = 0.003; this.go = true; this.state++; }
        } else { this.pAcc1[2] = 0.0000004; if (this.frame > fps * 2) { this.go = true; this.state++; } }
        break;
      case 2:
        if (this.frame > fps * 10) this.go = true;
        if (this.go) {
          if (this.disc) { this.pAcc1[2] = 0.0004; this.rAcc = 0.00008; } else { this.pAcc2[2] = 0.0099; this.rAcc = 0.000195; }
          this.pAcc2[0] = this.pAcc2[1] = 0;
        }
        break;
      case 3: this.ended = true; break;
      default: break;
    }
    this.rSpeed += (2 * this.rAcc) * 0.5 * ts;
    for (let k = 0; k < 3; k++) this.pSpeed[k] += (2 * this.pAcc2[k] + this.pAcc1[k]) * 0.5 * ts;
    this.pAcc2[2] += this.pAcc1[2] * ts;
    this.rot += (2 * this.rSpeed + this.rAcc) * 0.5 * ts;
    p.x += (2 * this.pSpeed[0] + this.pAcc2[0]) * 0.5 * ts; p.y += (2 * this.pSpeed[1] + this.pAcc2[1]) * 0.5 * ts; p.z += (2 * this.pSpeed[2] + this.pAcc2[2]) * 0.5 * ts;
    // camera (ROM -> three: y and z negated); up = (sin r, cos r) in ROM screen-down space
    this.camera.position.set(p.x, -p.y, -p.z);
    this.camera.up.set(Math.sin(this.rot), Math.cos(this.rot), 0);
    this.camera.lookAt(p.x, -p.y, -p.z - 1);
    // SCE text: armed past z 18, alpha +4/frame to 240 then -4, drawn at min(alpha,112)/128
    if (p.z > 18 && this.sceState === 0) this.sceState = 1;
    if (this.sceState === 1) { this.sceAlpha += this.sceStep; if (this.sceAlpha === 240) this.sceStep = -4; if (this.sceAlpha === 0) { this.sceStep = 4; this.sceState = -1; } }
    if (this.sceText) this.sceText.style.opacity = String(Math.min(this.sceAlpha, 112) / 128);
    // tower sway: collective +-10 degrees roll with a 6 s period (maxed towers do not sway)
    const sway = Math.sin(((this.frame % 360) - 180) * Math.PI / 180) * (10 * Math.PI / 180);
    for (const m of this.towers) m.rotation.z = m.userData.sways ? -sway : 0;
    // fog scroll
    for (const f of this.fogLayers) { f.anim += f.rate; if (f.anim > 1) f.anim -= 1; f.tex.offset.x = -f.anim; }
    // comets
    const fr = this.frame + this.lightsSeed;
    for (let l = 0; l < 4; l++) {
      const L = this.lights[l];
      const c = Math.cos((fr + l * 17) * 0.01 * (l + 10) * 0.1), s = Math.sin((fr + l * 15) * 0.005 * (l + 10) * 0.1);
      const P = new THREE.Vector3((10 - l) * c, -((3 + l) * s), -(c * 12 + 88));
      L.history.push(P); if (L.history.length > 4) L.history.shift();
      L.samples.push(P); if (L.samples.length > 128) L.samples.shift();
      for (let i = 0; i < 4; i++) { const h = L.history[Math.max(0, L.history.length - 4 + i)]; for (const sp of L.heads[i]) sp.position.copy(h); }
      const n = L.samples.length; const pa = L.trail.geometry.attributes.position, ca = L.trail.geometry.attributes.color;
      for (let j = 0; j < 128; j++) { const k = Math.min(n - 1, Math.max(0, j - (128 - n))); const q = L.samples[k] || P; pa.setXYZ(j, q.x, q.y, q.z); const age = n > 1 ? (n - 1 - k) / (n - 1) : 1; const a = (1 - age) * 0.9; ca.setXYZ(j, L.colour.r * a, L.colour.g * a, L.colour.b * a); }
      pa.needsUpdate = true; ca.needsUpdate = true; L.trail.geometry.setDrawRange(128 - n, n);
    }
    // cubes tumble
    for (const cb of this.cubes) { for (let k = 0; k < 3; k++) { cb.ang[k] += cb.rate[k]; if (cb.ang[k] > Math.PI) cb.ang[k] -= 2 * Math.PI; } cb.mesh.rotation.set(cb.ang[0], -cb.ang[1], -cb.ang[2]); }
    // fly-up motion blur strength (3 ping-pong 7/8 resamples in the ROM)
    const nb = p.z > 56 ? Math.min(3, Math.floor((p.z - 56) / 12)) : 0; this.blur.uniforms.radius.value = nb * 1.2;
    this.frame++;
  }
  update(dt, st) {
    if (st < this.lead) { this.app.fade(1, 0); return; }
    if (st - dt < this.lead) this.app.fade(0, 0.05);
    this.acc += dt; let n = 0;
    while (this.acc >= 1 / FPS && n < 6) { this.stepFrame(); this.acc -= 1 / FPS; n++; }
    // scene end: fade over the last ~0.4 s before z passes 104, then hand over
    const z = this.pos.z; const fo = Math.min(1, Math.max(0, (z - 90) / 14));
    if (fo > 0) this.app.fade(fo, 0);
    if (this.ended && !this.done) { this.done = true; this.app.onBootDone?.(this.mode); }
  }
  render() {
    const r = this.app.renderer;
    // 1. towers -> rtTowers; 2. feedback blend with the previous composite; 3. overlay scene over the fed-back layer
    r.setRenderTarget(this.rtTowers); r.setClearColor(0x000000, 1); r.clear(); r.render(this.towerScene, this.camera);
    const prev = this.rtFeed[this.feedIdx], next = this.rtFeed[1 - this.feedIdx];
    this.feedMat.uniforms.tCur.value = this.rtTowers.texture; this.feedMat.uniforms.tPrev.value = prev.texture;
    r.setRenderTarget(next); r.render(this.feedScene, this.feedCam); this.feedIdx = 1 - this.feedIdx;
    this.bgMat.map = next.texture; this.bgMat.needsUpdate = true;
    // 3. fog + lights over the tower layer -> rtPre (the frame the cubes refract)
    r.setRenderTarget(this.rtPre); r.clear(); r.render(this.scene, this.camera);
    this.camera.updateMatrixWorld();
    for (const cb of this.cubes) { const c = cb.mesh.position.clone().project(this.camera); for (const m of cb.mats) { m.uniforms.tScreen.value = this.rtPre.texture; m.uniforms.centre.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5); } }
    r.setRenderTarget(null);
    this.composer.render();
  }
}
