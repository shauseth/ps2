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
// a flat silhouette given thickness: the SVG path is repeated as slices through the depth, with the front and back
// in the main colour and the slices between in a darker edge tone, so the shape reads as a solid cut-out when it turns
const SVG_NS = 'http://www.w3.org/2000/svg';
function extrude(pathD, { size = 0.9, depth = 0.16, slices = 14, edge = 'rgba(0,0,0,0.45)' } = {}) {
  const out = [];
  for (let k = 0; k < slices; k++) {
    const z = -depth / 2 + depth * k / (slices - 1); const isFace = k === 0 || k === slices - 1;
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.classList.add('f', 'cut');
    svg.style.width = `calc(var(--u) * ${size})`; svg.style.height = `calc(var(--u) * ${size})`;
    svg.style.marginLeft = `calc(var(--u) * ${-size / 2})`; svg.style.marginTop = `calc(var(--u) * ${-size / 2})`;
    svg.style.transform = U(`translateZ(U(${z}))`); svg.style.setProperty('--l', isFace ? (k === 0 ? '0.7' : '1') : '1');
    const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', pathD); path.style.fill = isFace ? 'var(--c)' : 'var(--c2)';
    if (!isFace) { const shade = document.createElementNS(SVG_NS, 'path'); shade.setAttribute('d', pathD); shade.setAttribute('fill', edge); svg.append(path, shade); } else svg.appendChild(path);
    out.push(svg);
  }
  return out;
}
// the Twitter bird outline (Simple Icons, CC0)
const TWITTER_BIRD = 'M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z';

const GITHUB_MARK = 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';
const LINKEDIN_MARK = 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

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
  // twitter: the bird silhouette, extruded
  bird: () => [part(extrude(TWITTER_BIRD))],
  // github and linkedin: their marks, extruded
  github: () => [part(extrude(GITHUB_MARK))],
  linkedin: () => [part(extrude(LINKEDIN_MARK, { depth: 0.14 }))],
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
