// Procedural textures generated on a canvas at load time (nothing is shipped from the real BIOS).
import * as THREE from 'three';
import { makeRng } from './rng.js';

// Value-noise fBm on a grid, tileable when `tile` is true.
export function fbmField(size, { octaves = 5, seed = 1, tile = true, lacunarity = 2, gain = 0.5, baseFreq = 4 } = {}) {
  const rnd = makeRng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, freq = baseFreq, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = Math.max(2, Math.round(freq));
    const lattice = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) lattice[i] = rnd();
    const at = (x, y) => lattice[((y % n + n) % n) * n + ((x % n + n) % n)];
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const x1 = tile ? x0 + 1 : Math.min(n - 1, x0 + 1), y1 = tile ? y0 + 1 : Math.min(n - 1, y0 + 1);
        const a = at(x0, y0), b = at(x1, y0), c = at(x0, y1), d = at(x1, y1);
        const v = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
        out[y * size + x] += v * amp;
      }
    }
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function canvasTexture(size, paint, { wrap = THREE.ClampToEdgeWrapping, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  paint(ctx, c);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = wrap; tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Soft cloud puff: radial falloff multiplied by fBm, alpha only (white). Good for layered volumetric clouds.
export function cloudPuffTexture(size = 256, seed = 3, { softness = 1.6, detail = 0.55 } = {}) {
  const f = fbmField(size, { octaves: 5, seed, tile: false, baseFreq: 3 });
  return canvasTexture(size, (ctx) => {
    const img = ctx.createImageData(size, size); const d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x / size - 0.5) * 2, dy = (y / size - 0.5) * 2; const r = Math.sqrt(dx * dx + dy * dy);
      const fall = Math.max(0, 1 - Math.pow(r, softness));
      const n = f[y * size + x];
      const a = Math.max(0, Math.min(1, fall * (1 - detail + detail * (n * 1.6 - 0.2))));
      const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
  });
}

// Radial glow sprite (white core, transparent edge) for point lights and orbs.
export function glowTexture(size = 128, { core = 0.12, power = 2.2 } = {}) {
  return canvasTexture(size, (ctx) => {
    const img = ctx.createImageData(size, size); const d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5; const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = r < core ? 1 : Math.max(0, Math.pow(1 - (r - core) / (1 - core), power));
      const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
  });
}

// Tileable greyscale fBm noise (for fog tunnel walls, crystal surfaces, tower marble).
export function noiseTexture(size = 256, seed = 5, { octaves = 5, baseFreq = 4, contrast = 1, bias = 0, gain = 0.5 } = {}) {
  const f = fbmField(size, { octaves, seed, tile: true, baseFreq, gain });
  return canvasTexture(size, (ctx) => {
    const img = ctx.createImageData(size, size); const d = img.data;
    for (let i = 0; i < size * size; i++) {
      const v = Math.max(0, Math.min(1, (f[i] - 0.5) * contrast + 0.5 + bias));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { wrap: THREE.RepeatWrapping, srgb: false });
}

// Vertical gradient environment for glassy reflections: dark below, dim blue horizon, bright top.
export function gradientEnvTexture(renderer, stops = [[0, '#000000'], [0.45, '#0a1230'], [0.62, '#7d8ca8'], [1, '#e9eef5']]) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 256, 0, 0);
  for (const [p, col] of stops) g.addColorStop(p, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(tex).texture; pmrem.dispose();
  return env;
}
