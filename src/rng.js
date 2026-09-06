// Small seeded PRNG (mulberry32) so captures are reproducible.
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.int = (lo, hi) => Math.floor(rnd.range(lo, hi + 1));
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return rnd;
}
