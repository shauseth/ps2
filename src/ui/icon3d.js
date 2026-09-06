// Memory-card icons as real 3D objects built from CSS faces (preserve-3d), the way the console's low-poly save icons
// turned on their pedestal. Primitives (box, prism, pyramid) are composed into small models: a capsule for drug
// discovery, a water tank, a sugar ring, a mortarboard, a phone, a trophy, an envelope. Every model lives in a unit
// box of side `--u` (set by CSS per context); faces carry a baked light level so the object reads as solid while it spins.
import { el } from './overlay.js';

const R2D = 180 / Math.PI;
const U = (tf) => tf.replace(/U\(([-\d.]+)\)/g, (_, k) => `calc(var(--u) * ${k})`);
function face(w, h, tf, l, cls = '') {
  const f = el('div', 'f' + (cls ? ' ' + cls : ''));
  f.style.width = `calc(var(--u) * ${w})`; f.style.height = `calc(var(--u) * ${h})`;
  f.style.marginLeft = `calc(var(--u) * ${-w / 2})`; f.style.marginTop = `calc(var(--u) * ${-h / 2})`;
  f.style.transform = U(tf); f.style.setProperty('--l', String(l));
  return f;
}
// axis-aligned box w x h x d centred at the origin
function box(w, h, d) {
  return [
    face(w, h, `translateZ(U(${d / 2}))`, 1.0), face(w, h, `rotateY(180deg) translateZ(U(${d / 2}))`, 0.62),
    face(d, h, `rotateY(90deg) translateZ(U(${w / 2}))`, 0.8), face(d, h, `rotateY(-90deg) translateZ(U(${w / 2}))`, 0.55),
    face(w, d, `rotateX(90deg) translateZ(U(${h / 2}))`, 1.2), face(w, d, `rotateX(-90deg) translateZ(U(${h / 2}))`, 0.4),
  ];
}
// regular n-gon prism of radius r and height h, centred at the origin
function prism(n, r, h) {
  const side = 2 * r * Math.sin(Math.PI / n), apo = r * Math.cos(Math.PI / n); const out = [];
  for (let k = 0; k < n; k++) { const a = k * 360 / n; const l = 0.5 + 0.65 * (0.5 + 0.5 * Math.cos((a + 20) / R2D)); out.push(face(side, h, `rotateY(${a}deg) translateZ(U(${apo}))`, l)); }
  const pts = Array.from({ length: n }, (_, k) => { const a = (k + 0.5) * 2 * Math.PI / n; return `${50 + 50 * Math.sin(a)}% ${50 - 50 * Math.cos(a)}%`; }).join(', ');
  const cap = (tf, l) => { const f = face(2 * r, 2 * r, tf, l); f.style.clipPath = `polygon(${pts})`; return f; };
  out.push(cap(`rotateX(90deg) translateZ(U(${h / 2}))`, 1.2), cap(`rotateX(-90deg) translateZ(U(${h / 2}))`, 0.4));
  return out;
}
// square pyramid: base side b, height h, base on the plane y = 0, apex above (negative y)
function pyramid(b, h, withBase = true) {
  const slant = Math.sqrt(h * h + (b / 2) * (b / 2)); const tilt = Math.atan2(b / 2, h) * R2D; const out = [];
  for (let k = 0; k < 4; k++) { const f = face(b, slant, `rotateY(${k * 90}deg) translateZ(U(${b / 2})) translateY(U(${-slant / 2})) rotateX(${tilt}deg)`, [1.0, 0.8, 0.62, 0.55][k], 'tri'); f.style.transformOrigin = '50% 100%'; out.push(f); }
  if (withBase) out.push(face(b, b, 'rotateX(-90deg)', 0.4));
  return out;
}
// place parts: translate (x, y, z) in units, optional extra transform, optional colour override
function part(faces, { x = 0, y = 0, z = 0, tf = '', c = null, c2 = null } = {}) {
  const g = el('div', 'g'); g.style.transform = U(`translate3d(U(${x}), U(${y}), U(${z})) ${tf}`);
  if (c) { g.style.setProperty('--c', c); g.style.setProperty('--c2', c2 || c); }
  for (const f of faces) g.appendChild(f); return g;
}

// Each model is a list of parts. `alt` is the save's second colour, used for the contrasting piece of the model.
const MODELS = {
  // arctic sensing: a radar dish on a mast, tilted at the sky
  radar: (alt) => [part(box(0.5, 0.08, 0.5), { y: 0.42 }), part(box(0.08, 0.5, 0.08), { y: 0.14 }), part(prism(12, 0.42, 0.06), { y: -0.16, tf: 'rotateX(-50deg)', c: alt }), part(box(0.05, 0.05, 0.3), { y: -0.28, z: 0.14, tf: 'rotateX(-50deg)' })],
  // drug discovery: a two-tone capsule
  capsule: (alt) => [part(prism(10, 0.24, 0.42), { y: -0.21 }), part(prism(10, 0.24, 0.42), { y: 0.21, c: alt })],
  // water treatment: a tall tank with a lid and a valve pipe
  tank: (alt) => [part(prism(12, 0.34, 0.8), { y: 0.06 }), part(prism(12, 0.38, 0.08), { y: -0.38, c: alt }), part(box(0.1, 0.1, 0.34), { y: 0.2, z: 0.4, c: alt })],
  // glycan: a hexagonal sugar ring of six beads with one branch
  ring: (alt) => [...[0, 1, 2, 3, 4, 5].map((k) => { const a = k * Math.PI / 3; return part(box(0.2, 0.2, 0.2), { x: 0.36 * Math.cos(a), z: 0.36 * Math.sin(a), tf: `rotateY(${-k * 60}deg)` }); }), part(box(0.16, 0.16, 0.16), { x: 0.36, y: -0.3, z: 0, c: alt })],
  // reactor core: a fat octagonal cylinder with the central channel plugged
  core: (alt) => [part(prism(8, 0.42, 0.62)), part(prism(8, 0.14, 0.66), { c: alt })],
  // graduation: mortarboard with a tassel
  mortarboard: (alt) => [part(box(0.96, 0.05, 0.96), { y: -0.2, tf: 'rotateY(45deg)' }), part(prism(8, 0.3, 0.4), { y: 0.05 }), part(box(0.06, 0.34, 0.06), { x: 0.42, y: -0.06, z: 0.42, c: alt })],
  // a course: a book with a contrasting cover
  book: (alt) => [part(box(0.66, 0.86, 0.2)), part(box(0.7, 0.9, 0.05), { z: 0.12, c: alt }), part(box(0.7, 0.9, 0.05), { z: -0.12, c: alt })],
  // conference: a poster on an easel
  poster: (alt) => [part(box(0.76, 0.6, 0.04), { y: -0.14 }), part(box(0.06, 0.9, 0.06), { x: -0.3, y: 0.05, c: alt }), part(box(0.06, 0.9, 0.06), { x: 0.3, y: 0.05, c: alt })],
  // an app: a phone with a lit screen
  phone: (alt) => [part(box(0.46, 0.92, 0.08), { c: alt }), part(box(0.38, 0.78, 0.02), { z: 0.045 })],
  // NeRF cameras: a pyramid (the camera frustum)
  pyramid: () => [part(pyramid(0.88, 0.9), { y: 0.42 })],
  // a neural network: three stacked layers
  layers: (alt) => [part(box(0.8, 0.12, 0.5), { y: -0.32 }), part(box(0.8, 0.12, 0.5), { c: alt }), part(box(0.8, 0.12, 0.5), { y: 0.32 })],
  // this website: a slim console with a disc on the tray
  console: (alt) => [part(box(0.96, 0.18, 0.7), { y: 0.1 }), part(prism(16, 0.24, 0.02), { y: -0.01, z: 0.05, c: alt }), part(box(0.9, 0.02, 0.1), { y: 0.02, z: 0.3, c: alt })],
  // plaque counting: a petri dish with colonies
  petri: (alt) => [part(prism(16, 0.48, 0.1)), ...[[0.15, -0.1], [-0.2, 0.05], [0.05, 0.22], [-0.1, -0.24], [0.28, 0.14]].map(([x, z]) => part(prism(6, 0.06, 0.04), { x, y: -0.07, z, c: alt }))],
  // a paper: a page with a title band
  paper: (alt) => [part(box(0.66, 0.9, 0.03)), part(box(0.48, 0.1, 0.035), { y: -0.3, c: alt }), part(box(0.48, 0.05, 0.035), { y: -0.12, c: alt }), part(box(0.48, 0.05, 0.035), { y: 0.0, c: alt })],
  // an award: a trophy cup on a plinth
  trophy: (alt) => [part(prism(8, 0.3, 0.36), { y: -0.28 }), part(prism(8, 0.08, 0.22), { y: 0.02 }), part(box(0.44, 0.1, 0.44), { y: 0.2 }), part(box(0.54, 0.1, 0.54), { y: 0.3, c: alt })],
  // skills: a toolbox with a handle
  toolbox: (alt) => [part(box(0.9, 0.44, 0.5), { y: 0.14 }), part(box(0.9, 0.06, 0.5), { y: -0.11, c: alt }), part(box(0.5, 0.08, 0.1), { y: -0.28, c: alt }), part(box(0.08, 0.16, 0.1), { x: -0.21, y: -0.2, c: alt }), part(box(0.08, 0.16, 0.1), { x: 0.21, y: -0.2, c: alt })],
  // documents: a stack of pages
  stack: (alt) => [part(box(0.7, 0.05, 0.9), { y: 0.14 }), part(box(0.7, 0.05, 0.9), { y: 0.02, c: alt }), part(box(0.7, 0.05, 0.9), { y: -0.1 })],
  // code: a cube of blocks
  blocks: (alt) => [part(box(0.4, 0.4, 0.4), { x: -0.22, y: 0.2, z: 0.22 }), part(box(0.4, 0.4, 0.4), { x: 0.22, y: 0.2, z: 0.22, c: alt }), part(box(0.4, 0.4, 0.4), { x: -0.22, y: 0.2, z: -0.22, c: alt }), part(box(0.4, 0.4, 0.4), { x: 0.22, y: 0.2, z: -0.22 }), part(box(0.4, 0.4, 0.4), { y: -0.2 })],
  // a profile: an ID badge
  badge: (alt) => [part(box(0.68, 0.86, 0.06)), part(prism(12, 0.14, 0.07), { y: -0.16, c: alt }), part(box(0.44, 0.06, 0.07), { y: 0.14, c: alt }), part(box(0.32, 0.06, 0.07), { y: 0.28, c: alt })],
  // email: an envelope with its flap up
  envelope: (alt) => [part(box(0.92, 0.12, 0.62)), part(pyramid(0.6, 0.26, false), { y: -0.06, c: alt })],
};

// The element is `.save-icon` (sized by CSS, sets --u), containing a tilted, spinning preserve-3d stage.
export function icon3d(spec, cls = 'save-icon') {
  const root = el('div', cls); root.dataset.shape = spec.shape;
  root.style.setProperty('--c', spec.color); root.style.setProperty('--c2', spec.color2 || spec.color);
  const stage = el('div', 'i3d'); const spin = el('div', 'spin'); spin.style.animationDelay = `${-(Math.random() * 9).toFixed(2)}s`;
  const build = MODELS[spec.shape] || MODELS.blocks;
  for (const p of build(spec.color2 || spec.color)) spin.appendChild(p);
  stage.appendChild(spin); root.appendChild(stage);
  return root;
}
