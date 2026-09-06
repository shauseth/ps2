// Memory-card boot history exactly as the console keeps it: 21 slots of {name, count, mask, own}. Each launch
// bumps the title's count; at launches 14, 24, 34... the title "sprawls" into a random extra cell of its
// neighbourhood (the old cell stays as a maxed tower). The opening turns this into the tower field.
import { makeRng } from './rng.js';

export const MAX_SLOTS = 21;
const TITLES = ['SLUS_203.12', 'SLES_500.03', 'SCUS_971.01', 'SLUS_209.46', 'SLPM_650.51', 'SCES_503.61', 'SLUS_210.41', 'SLES_516.03', 'SCUS_973.28', 'SLUS_200.62', 'SLES_524.56', 'SCES_533.26', 'SLUS_213.76', 'SLUS_202.28', 'SLES_508.22', 'SLUS_206.86', 'SCUS_974.36', 'SLES_537.03', 'SLUS_211.79', 'SLPS_251.80', 'SLUS_205.52', 'SLES_511.23', 'SCUS_972.65', 'SLUS_209.42'];

export function launchTitle(history, name, rnd, date = 0) {
  let e = history.find(h => h.name === name);
  if (!e) {
    if (history.length >= MAX_SLOTS) {
      // evict the least-launched (oldest date breaks ties), like the real updater
      history.sort((a, b) => a.count - b.count || a.date - b.date); history.shift();
    }
    e = { name, count: 0, mask: 1, own: 0, date }; history.push(e);
  }
  e.date = date;
  if ((e.mask & 0x3f) !== 0x3f) {
    e.count = Math.min(0x7f, e.count + 1);
    if (e.count >= 14 && (e.count - 14) % 10 === 0) {
      const free = [0, 1, 2, 3, 4, 5].filter(b => !(e.mask >> b & 1));
      if (free.length) { const v = free[Math.floor(rnd() * free.length)]; e.own = v; e.mask |= 1 << v; }
    }
  } else if (e.count < 0x3f) e.count++;
  else { e.count = 0x3f; e.own = 7; }
  return e;
}

// A believable, well-used card for first-time visitors: a library of titles booted with a favourites skew
// (the same simulation the reverse-engineered port uses to get "mostly small towers, the odd monolith").
export function seedHistory(seed = 11, { games = 21, boots = 120 } = {}) {
  const rnd = makeRng(seed); const history = [];
  for (let b = 0; b < boots; b++) { const r1 = Math.floor(rnd() * games), r2 = Math.floor(rnd() * games); const t = Math.min(r1, r2); launchTitle(history, TITLES[t % TITLES.length], rnd, b); }
  return history;
}
// Each visit behaves like one more launch of a favourite (or, now and then, a new title).
export function advanceHistory(state, rnd) {
  const h = state.history; if (!h.length) { state.history = seedHistory(); return; }
  const pick = Math.random() < 0.12 ? TITLES[Math.floor(rnd() * TITLES.length)] : h[Math.floor(Math.pow(rnd(), 2) * h.length)].name;
  launchTitle(h, pick, rnd, state.boots);
}
