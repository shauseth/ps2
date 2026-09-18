// The opening (script INTRO, research/gta-sa-launch.md §5) as a data-driven timeline. T = seconds from the title card as
// measured on the hVjsG4FIg04 capture, so a frame at T can be checked against ref-hVj*/t<T>: the cuts, the subtitle
// table (PS2 GXT text verbatim; ride lines in ms from the ride fade-in via R()) and the camera table (SA coordinates:
// x east, y north, z up, metres; heading 0 = north, 90 = west). A shot is a camera position and a look point, each
// absolute or relative to a base (an anchor, an actor, a vehicle, a point on the car's path) in that base's frame
// (f forward, l left, u up), optionally moving to a second pose over `dur` (dolly / crane) with a handheld shake.
// Blocking is timed acts (place, seat, walk, doors, props) and vehicle paths (timed polylines, wheels spun by distance).
// Nothing reads a clock: update(dt) is the only source of time, so ?capture=1 frames are reproducible.
//
// Parts (T): title 0-5 (black, caption) | PROLOG1 5-26.5 (Francis Intl 5-10, LS arrivals 10-26.5) | black 26.5-33 (disc)
// | PROLOG3 33-112.5 (the pull-over, 79.5 s) | black 112.5-117.7 (disc) | ride 117.7-188.5 (subtitle + camera tables) |
// voice-over 188.5-200 (11.5 s dolly) then 200-204.5 fixed → control. The disc blacks are the PS2's (0.5 s in the script).
import * as THREE from 'three';
import { el } from '../ui/overlay.js';

const D2R = Math.PI / 180;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const RIDE0 = 117.7;                                     // the ride fade-in on the capture ("How you been" is up at t0118)
const R = (ms) => RIDE0 + ms / 1000;                     // ride table (TIMERB ms) → T
const VEHICLES = ['copcar', 'taxi', 'train', 'bmx'], ACTORS = ['cj', 'tenpenny', 'pulaski', 'hernandez', 'driver', 'steward'];
const NOMINAL = { walk: 1.45, run: 4.4, carryWalk: 1.3 };  // m/s a gait cycle covers at speed 1 (actors.js)
const LOOPS = ['airport', 'street', 'carInterior', 'engine', 'train'];
const RAIL_Y = -1385;                                    // the east-west rail line (research §5 world notes)
const DOLLY_A = [2217.62, -1262.76, 24.45], DOLLY_B = [2237.0, -1261.33, 24.63];   // script 2238.64: 1.6 m short so the end frame sits over CJ's shoulder
const TITLE = ['Francis INTL. Airport,', 'Liberty City,', '1992.'];

// SA heading → forward / left unit vectors; a pose relative to a base frame; heading from a to b.
const fwd = (h) => [-Math.sin(h * D2R), Math.cos(h * D2R)];
const rel = (b, { f = 0, l = 0, u = 0, h = 0 } = {}) => { const [fx, fy] = fwd(b.heading || 0); return { x: b.x + fx * f - fy * l, y: b.y + fy * f + fx * l, z: (b.z || 0) + u, heading: (b.heading || 0) + h }; };
const headingTo = (a, b) => Math.atan2(-(b.x - a.x), b.y - a.y) / D2R;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const at = (base, f = 0, l = 0, u = 0, h = 0) => ({ base, f, l, u, h });
// Handheld noise: three incommensurate sines, so it never repeats visibly and never touches Math.random.
const wobble = (t, s) => Math.sin(t * 1.7 + s) * 0.55 + Math.sin(t * 4.3 + s * 2.1) * 0.3 + Math.sin(t * 9.1 + s * 0.7) * 0.15;

// ---------------- the parts ----------------
// Each builder gets the cutscene (anchors, helpers) and returns { shots, lines, cues, acts, paths }; every entry has T.
const PARTS = [
  { name: 'title', T0: 0, T1: 5, dark: true, letterbox: false, build: buildTitle },
  { name: 'prolog1', T0: 5, T1: 26.5, set: 'lcAirport', fadeIn: 1, letterbox: true, build: buildProlog1 },
  { name: 'black1', T0: 26.5, T1: 33, black: true, letterbox: true },
  { name: 'prolog3', T0: 33, T1: 112.5, set: 'losSantos', fadeIn: 1, letterbox: true, build: buildProlog3 },
  { name: 'black2', T0: 112.5, T1: RIDE0, black: true, letterbox: true },
  { name: 'ride', T0: RIDE0, T1: 188.5, set: 'losSantos', fadeIn: 1, letterbox: true, build: buildRide },
  { name: 'vo', T0: 188.5, T1: 204.5, set: 'losSantos', letterbox: true, build: buildVo },
];

// 0-5: three white lines at (50 %, 40.2 / 44.6 / 49.1 %), alpha 200/255, 0.7 s fades (DISPLAY_TEXT 320,180/200/220, 0.8x1.8).
function buildTitle(cs) {
  return { acts: [{ T: 0, do: () => { cs.hud.caption(TITLE, { y: [40.2, 44.6, 49.1], size: 'large', shadow: false, alpha: 0 }); cs.tween(5, (k) => { const t = k * 5; cs.hud.captionAlpha?.(0.78 * clamp01(t / 0.7) * (1 - clamp01((t - 3.9) / 0.7))); }, () => cs.hud.caption(null)); } }] };
}

// 5-26.5: Francis Intl (CJ carries the suitcase down the steps to the JUANK AIR counter), then LS arrivals: the baggage
// tunnel, the belt, the phone call from Sweet, the terminal, the taxi from above. Times from the ref-hVj frames.
function buildProlog1(cs) {
  const steps = cs.anchor('lc.steps'), counter = cs.anchor('lc.counter');
  const b0 = cs.anchor('ls.beltStart'), b1 = cs.anchor('ls.beltEnd'), exit = cs.anchor('ls.exit'), taxi = cs.anchor('ls.taxi');
  const belt = { ...b0, heading: headingTo(b0, b1) };           // the belt's own frame: f runs from its mouth to its end
  const lift = rel(belt, { f: 4.5 });                            // where CJ takes the case off the belt
  const case0 = rel(belt, { f: -1.5, u: 0.85 }), case1 = rel(belt, { f: 4.5, u: 0.85 });
  return {
    shots: [
      { T: 5, pos: at('cj', -3.0, -1.1, 1.9), look: at('cj', 4, 0.5, 1.0), fov: 55 },                 // behind CJ, the counter and the sign ahead
      { T: 10, pos: at(belt, 3.5, 0.8, 1.2), look: at(belt, -1.5, 0, 0.6), fov: 50 },                   // into the dark tunnel mouth
      { T: 12, pos: at(belt, 2.5, -3.6, 1.5), look: at(belt, 2.5, 0, 1.0), fov: 50 },                   // the belt side, the Baggage sign
      { T: 14, pos: at(belt, 0, -5.5, 1.6), look: at(belt, 4.5, -1.0, 1.2), fov: 55 },                  // wider: the board, CJ walks in
      { T: 16, pos: at(belt, 4.5, 3.2, 0.9), look: at(belt, 4.5, -1.2, 1.1), fov: 45 },                 // low across the belt: the lift
      { T: 20, pos: at('cj', 3.2, -1.6, 0.5), look: at('cj', 0, 0, 1.3), fov: 55 },                     // low front, looking up past him at the ceiling
      { T: 22, pos: at('cj', -3.5, -1.8, 1.5), look: at('cj', 1, 0, 1.1), fov: 50 },                    // behind-right, tracking
      { T: 24, pos: at('taxi', 0.3, 1.6, 7), look: at('taxi', 0.3, -1.2, 0), fov: 50 },                            // straight down on the taxi, diagonal in frame
    ],
    lines: [
      { T: 7, dur: 4, who: 'cj', text: 'After five years on the East Coast, it was time to go home.' },
      { T: 12, dur: 1.6, text: '(Phone ringing)' },
      { T: 13.6, dur: 0.5, who: 'cj', text: "'Sup?" },
      { T: 14, dur: 1.9, who: 'sweet', text: "Carl, it's Sweet." },
      { T: 16, dur: 1.1, who: 'cj', text: 'Whassup, Sweet, what you want?' },
      { T: 17, dur: 2.8, who: 'sweet', text: "It's Moms... She's dead, bro." },
    ],
    cues: [{ T: 5, loop: 'airport', gain: 0.9 }, { T: 12, play: 'phone' }, { T: 12.9, play: 'phone', gain: 0.6 }, { T: 24, loop: 'engine', gain: 0.5 }, { T: 26.5, stop: 'airport', fade: 0.2 }, { T: 26.5, stop: 'engine', fade: 0.2 }],
    acts: [
      { T: 5, do: () => { cs.place('steward', at(counter, 1.5, 0, 0, 180), 'idle'); cs.place('cj', at(steps, -3.5), 'carryWalk', 'suitcase'); cs.walk('cj', at(steps, -3.5), at(steps, 3.5), 4.9, 'carryWalk', 'carryWalk'); } },
      { T: 10, do: () => { cs.show('lsAirport'); cs.place('steward', [0, 400, 0]); cs.place('cj', at(belt, 9.5, -7), 'idle', 'none'); cs.suitcase(true); cs.tween(7.6, (k) => cs.moveCase(case0, case1, k)); } },
      { T: 11.8, do: () => cs.hud.caption(['Los Santos International Airport.'], { y: [44.6], size: 'small', shadow: true, alpha: 1 }) },   // script: 6.8-10.0 s into PROLOG1
      { T: 15.2, do: () => cs.hud.caption(null) },
      { T: 12.6, do: () => cs.walk('cj', at(belt, 9.5, -7), at(belt, 4.5, -1.2), 3.0, 'walk', 'phoneTalk', belt.heading + 90) },
      { T: 13.6, do: () => cs.actor('cj').holdProp?.('phone') },
      { T: 16.2, do: () => { cs.actor('cj').play('kneel', { loop: true, fade: 0.3 }); } },
      { T: 17.6, do: () => { cs.suitcase(false); cs.actor('cj').holdProp?.('suitcase'); cs.actor('cj').play('idle', { loop: true, fade: 0.3 }); } },
      { T: 19.8, do: () => { cs.walk('cj', at(lift, 0, -1.2), exit, 3.8, 'carryWalk', 'carryWalk'); } },
      { T: 24, do: () => { cs.seat('driver', 'taxi', 'driver', 'driveCar'); cs.vehicle('taxi').lights?.(false); cs.addPath({ who: 'taxi', z: taxi.z, pts: [[24, rel(taxi, { f: -12 })], [26.6, rel(taxi, { f: 14 })]] }); } },
    ],
  };
}

// 33-112.5: PROLOG3 (06:30, sunny). The taxi at pullover.taxi; the cruiser cuts in ahead; CJ out, on his knees, on his
// stomach; the money; the three standing; into the cruiser; the taxi and then the cruiser leave. Blocking is laid out in
// the taxi's frame (f = the road ahead, l = left) and CJ's kneeling spot (facing back down the road, so the low sun is
// behind him and the officers stand between him and the cruiser); the camera sides come from the ref-hVj frames.
function buildProlog3(cs) {
  const taxi = cs.anchor('pullover.taxi');
  let cop = cs.anchor('pullover.copcar'); const ahead = (cop.x - taxi.x) * fwd(taxi.heading)[0] + (cop.y - taxi.y) * fwd(taxi.heading)[1];
  if (ahead < 3 || ahead > 16) cop = rel(taxi, { f: 8.5, l: 0.6, h: -18 });          // the anchor is not in front of the taxi: swing in ahead, angled across
  let out = cs.anchor('pullover.cjOut'); if (dist(out, taxi) < 1 || dist(out, taxi) > 4) out = rel(taxi, { f: 0.4, l: -1.7 });
  let kneel = cs.anchor('pullover.kneel'); if (dist(kneel, taxi) < 1.5 || dist(kneel, taxi) > 9) kneel = rel(taxi, { f: 3.0, l: -2.5, h: 180 }); else kneel = { ...kneel, heading: taxi.heading + 180 };
  const K = (f, l, u = 0, h = 0) => at(kneel, f, l, u, h), TX = (f, l, u = 0, h = 0) => at(taxi, f, l, u, h), CP = (f, l, u = 0, h = 0) => at(cop, f, l, u, h);
  const tenStand = K(-1.8, 1.0), pulStand = K(-2.6, -1.3), herKneel = K(-0.2, -1.0, 0, 90);
  const door = (v, name, open, T, dur = 0.6) => ({ T, do: () => { const veh = cs.vehicle(v), from = open ? 0 : 1; cs.tween(dur, (k) => veh.setDoor?.(name, lerp(from, open ? 1 : 0, k))); } });
  return {
    shots: [
      { T: 33, pos: TX(-6, -14, 1.3), look: TX(0, 0, 0.8), fov: 55 },                             // side silhouette, the sun to the right
      { T: 36, pos: TX(-1.0, 2.6, 0.75), look: TX(8.0, 1.2, 1.0), fov: 62 },                     // low past the taxi at the cruiser, doors opening
      { T: 43, pos: TX(2.0, -3.0, 3.0), look: TX(0.4, -0.9, 0.7), fov: 50 },                     // close over the taxi door
      { T: 47, pos: TX(3.0, -3.6, 3.2), look: TX(1.5, -1.3, 0.6), fov: 55 },                     // CJ steps out
      { T: 50, pos: CP(-3.2, -2.6, 2.6), look: CP(-1.0, -0.9, 0.8), fov: 45 },                   // "POLICE" on the cruiser's quarter
      { T: 52, pos: K(4.2, 0.4, 0.6), look: K(0, 0.2, 0.9), fov: 55 },                            // CJ kneels, backlit
      { T: 57, pos: K(-0.5, 2.8, 0.4), look: at('tenpenny', 0, 0, 1.4), fov: 55 },              // low, looking up at Tenpenny walking round
      { T: 60, pos: at('tenpenny', 1.3, 0.25, 1.35), look: at('tenpenny', 0, 0, 1.45), fov: 38 },   // his face against the sun
      { T: 63, pos: K(2.6, -1.0, 0.75), look: K(-0.5, 0.3, 0.5), fov: 55 },                      // over CJ on the ground
      { T: 69, pos: at('tenpenny', 2.6, -0.9, 1.1), look: at('tenpenny', 0, 0, 1.35), fov: 50 },   // the cash held up to the sun
      { T: 71, pos: K(-3.8, 1.2, 1.5), look: K(0.3, -0.3, 1.25), fov: 55 },                          // the three, silhouettes
      { T: 75, pos: K(-5.0, 0.8, 1.4), look: K(0, 0, 1.2), fov: 55 },                          // wider
      { T: 78, pos: K(-4.5, 0.4, 1.3), look: K(0.5, 0, 1.25), fov: 50 },                         // three-shot: Tenpenny left, CJ centre, Pulaski right
      { T: 84, pos: at('tenpenny', 0.6, -1.5, 1.5), look: at('tenpenny', 0.2, 0, 1.5), fov: 40 },   // Tenpenny's profile, the sun behind his head
      { T: 88, pos: K(-0.8, -2.6, 1.35), look: K(-0.8, 0, 1.3), fov: 45 },                         // two-shot, the tree behind
      { T: 91, pos: K(2.5, 1.8, 1.5), look: at('cj', 0, 0, 1.2), fov: 50 },                       // over Pulaski's shove
      { T: 93, pos: CP(-6.5, -4.5, 0.6), look: CP(-0.8, -1.5, 1.1), fov: 50 },                     // Pulaski at the rear door, low
      { T: 95, pos: CP(-0.5, -6.5, 1.0), look: CP(-0.8, 0, 0.9), fov: 50 },                      // the cruiser's side: LSPD
      { T: 99, pos: TX(1.0, -3.4, 1.1), look: CP(-1.5, -0.5, 0.9), fov: 55 },                    // the taxi's nose in the foreground
      { T: 102, pos: CP(-4.5, -3.5, 0.7), look: at('pulaski', 0, 0, 1.45), fov: 45 },            // Pulaski, the tree behind
      { T: 105, pos: CP(-3, 5, 1.8), look: at('taxi', 0, 0, 0.6), fov: 50 },                     // the taxi drives away
      { T: 108, pos: CP(-9, -4.5, 2.4), look: CP(25, 0, 1.2), fov: 50 },                         // the cruiser pulls away up the street
    ],
    lines: [
      { T: 41, dur: 1.6, who: 'tenpenny', text: 'Passenger. Show us your hands.', g: 1 },
      { T: 47, dur: 2.4, who: 'tenpenny', text: 'Stop. Get down on your knees.', g: 1 },
      { T: 53, dur: 2.2, who: 'hernandez', text: 'Now down on your stomach.', g: 1 },
      { T: 56, dur: 1.2, who: 'hernandez', text: 'There you go.' },
      { T: 66, dur: 1.2, who: 'tenpenny', text: "I'll take that, Hernandez.", g: 1 },
      { T: 67, dur: 2.2, who: 'cj', text: "Hey, that's my paper man. That's money." },
      { T: 69, dur: 2.0, who: 'tenpenny', text: 'This is drug money.', g: 1 },
      { T: 71, dur: 1.2, who: 'cj', text: 'My money, man...', g: 1 },
      { T: 72, dur: 2.8, who: 'tenpenny', text: "Hey don't worry about it, I'll fill it out later.", g: 1 },
      { T: 78, dur: 2.8, who: 'tenpenny', text: 'Welcome home, Carl. Glad to be back?', g: 1 },
      { T: 81, dur: 2.2, who: 'tenpenny', text: "You haven't forgotten about us, have you boy?", g: 1 },
      { T: 84, dur: 1.8, who: 'cj', text: 'Hell no, officer Tenpenny.', g: 1 },
      { T: 86, dur: 2.0, who: 'cj', text: "I was just wondering what took y'all so long.", g: 1 },
      { T: 88, dur: 1.6, who: 'tenpenny', text: 'Get in the car.', g: 1 },
      { T: 91, dur: 1.6, who: 'cj', text: 'Ease up, man. Damn.' },
      { T: 96, dur: 1.2, who: 'pulaski', text: 'Watch your head.' },
      { T: 97, dur: 1.5, who: 'pulaski', text: 'Oh! My bad.', g: 1 },
      { T: 99, dur: 2.2, who: 'pulaski', text: 'Get outta here, you greaseball bastard!', g: 1 },
      { T: 102, dur: 1.8, who: 'pulaski', text: 'Stupid Mexican...', g: 1 },
      { T: 104, dur: 1.2, who: 'pulaski', text: 'Oh, hey, sorry.', g: 1 },
      { T: 105, dur: 2.8, who: 'cj', text: 'My bag. Hey, man, my bag!' },
    ],
    cues: [
      { T: 33, loop: 'street', gain: 0.8 }, { T: 33, loop: 'engine', gain: 0.35 }, { T: 33.6, play: 'sirenBlip' },
      { T: 36.5, play: 'doorOpen' }, { T: 43.5, play: 'doorOpen', gain: 0.8 }, { T: 51.5, play: 'doorOpen', gain: 0.7 }, { T: 94, play: 'doorOpen' },
      { T: 96.6, play: 'headBump' }, { T: 98.2, play: 'doorClose' }, { T: 105.5, play: 'doorClose', gain: 0.7 }, { T: 106.5, play: 'doorClose', gain: 0.8 }, { T: 107.5, play: 'doorClose' },
      { T: 112.5, stop: 'street', fade: 0.3 }, { T: 112.5, stop: 'engine', fade: 0.3 },
    ],
    acts: [
      { T: 33, do: () => {
        cs.seat('driver', 'taxi', 'driver', 'driveCar'); cs.seat('cj', 'taxi', 'rr', 'sitCar'); cs.vehicle('taxi').lights?.(true);
        const c = cs.vehicle('copcar'); c.lights?.(true); c.lightbar?.(true); for (const d of ['fl', 'fr', 'rl', 'rr']) c.setDoor?.(d, 0);
        cs.seat('pulaski', 'copcar', 'driver', 'driveCar'); cs.seat('tenpenny', 'copcar', 'passenger', 'sitCar'); cs.seat('hernandez', 'copcar', 'rl', 'sitCar');
        cs.addPath({ who: 'taxi', z: taxi.z, pts: [[33, rel(taxi, { f: -14 })], [35.8, taxi], [100.5, taxi], [102, rel(taxi, { f: 5, l: 2.5 })], [104, rel(taxi, { f: 20, l: 3.4 })], [108.5, rel(taxi, { f: 72, l: 3.4 })]] });
        cs.addPath({ who: 'copcar', z: cop.z, pts: [[33, rel(cop, { f: -30, l: 3.4 })], [34.6, rel(cop, { f: -8, l: 3.4 })], [36, cop], [108, cop], [109.5, rel(cop, { f: 6 })], [113, rel(cop, { f: 55 })]] });
      } },
      door('copcar', 'fl', true, 36.5), door('copcar', 'fr', true, 36.6),
      { T: 37.3, do: () => { cs.unseat('pulaski', CP(0.3, 1.9, 0, 180)); cs.unseat('tenpenny', CP(0.3, -1.9, 0, 180)); } },
      { T: 40.5, do: () => { cs.walk('tenpenny', CP(0.3, -1.9), tenStand, 2.4, 'walk', 'idle', kneel.heading); cs.walk('pulaski', CP(0.3, 1.9), pulStand, 2.6, 'walk', 'idle', kneel.heading); } },
      door('copcar', 'fl', false, 41.2), door('copcar', 'fr', false, 41.5), { T: 43, do: () => cs.vehicle('taxi').lights?.(false) }, door('taxi', 'rr', true, 43.5, 1.0),
      { T: 47.3, do: () => { cs.unseat('cj', at(out, 0, 0, 0, 0), 'standHandsUp'); cs.actor('cj').holdProp?.('none'); } },
      { T: 47.8, do: () => { cs.walk('cj', out, kneel, 1.9, 'walk', 'idle', kneel.heading); } },
      door('taxi', 'rr', false, 49.5, 0.8), door('copcar', 'rl', true, 51.5),
      { T: 52, do: () => { cs.actor('cj').play('kneel', { loop: true, fade: 0.4 }); cs.unseat('hernandez', CP(-1.0, 1.9, 0, 180)); cs.walk('hernandez', CP(-1.0, 1.9), herKneel, 3.4, 'walk', 'idle', kneel.heading + 90); } },
      door('copcar', 'rl', false, 53.5),
      { T: 52.8, do: () => cs.actor('cj').play('handsBehindHead', { loop: true, fade: 0.4 }) },
      { T: 55.3, do: () => cs.actor('cj').play('prone', { loop: true, fade: 0.5 }) },
      { T: 56, do: () => cs.actor('hernandez').play('kneel', { loop: true, fade: 0.4 }) },
      { T: 57, do: () => { cs.walk('tenpenny', tenStand, K(-3.0, 2.2), 1.6, 'walk', 'walk'); cs.after(1.6, () => cs.walk('tenpenny', K(-3.0, 2.2), K(-1.6, 1.2), 1.4, 'walk', 'idle', kneel.heading)); } },
      { T: 64, do: () => cs.actor('hernandez').holdProp?.('cash') },
      { T: 66.3, do: () => { cs.actor('hernandez').holdProp?.('none'); cs.actor('tenpenny').holdProp?.('cash'); } },
      { T: 70.6, do: () => { cs.actor('cj').play('idle', { loop: true, fade: 0.6 }); cs.actor('cj').setHeading(kneel.heading + 180); cs.actor('hernandez').play('idle', { loop: true, fade: 0.5 }); cs.walk('hernandez', herKneel, CP(3.8, -0.8), 4.0, 'walk', 'idle', cop.heading + 180); } },
      { T: 72, do: () => cs.actor('tenpenny').holdProp?.('none') },
      { T: 83.5, do: () => cs.walk('pulaski', pulStand, K(-4.2, -3.2), 1.8, 'walk', 'idle', kneel.heading) },
      { T: 89.5, do: () => cs.walk('pulaski', K(-4.2, -3.2), K(0.9, 0.8), 1.5, 'walk', 'shove', kneel.heading + 180) },
      { T: 91.2, do: () => { cs.actor('cj').play('stumble', { loop: false, fade: 0.1 }); } },
      { T: 92.2, do: () => { cs.walk('cj', kneel, CP(-0.6, -2.2), 3.3, 'walk', 'idle', 90 + cop.heading); } },
      { T: 92.6, do: () => { cs.walk('pulaski', K(0.9, 0.8), CP(-1.6, -2.6), 2.3, 'walk', 'idle', cop.heading); } },
      door('copcar', 'rr', true, 94),
      { T: 95.6, do: () => cs.walk('cj', CP(-0.6, -2.2), CP(-0.5, -1.5), 0.8, 'walk', 'idle', cop.heading + 90) },
      { T: 96.8, do: () => cs.seat('cj', 'copcar', 'rr', 'sitCar') },
      door('copcar', 'rr', false, 98.2),
      { T: 99, do: () => cs.actor('pulaski').setHeading(cop.heading + 180) },
      { T: 102.5, do: () => { cs.walk('hernandez', CP(3.8, -0.8), CP(-0.2, 2.0), 2.4, 'walk', 'idle', cop.heading - 90); cs.walk('tenpenny', K(-1.6, 1.2), CP(1.0, -2.0), 2.4, 'walk', 'idle', cop.heading + 90); } },
      door('copcar', 'rl', true, 103), door('copcar', 'fr', true, 104),
      { T: 105, do: () => cs.seat('hernandez', 'copcar', 'rl', 'sitCar') }, door('copcar', 'rl', false, 105.5),
      { T: 105.5, do: () => cs.walk('pulaski', CP(-1.6, -2.6), CP(0.9, 2.0), 2.0, 'walk', 'idle', cop.heading - 90) },
      door('copcar', 'fl', true, 105.8),
      { T: 106.3, do: () => cs.seat('tenpenny', 'copcar', 'passenger', 'sitCar') }, door('copcar', 'fr', false, 106.5),
      { T: 107.5, do: () => cs.seat('pulaski', 'copcar', 'driver', 'driveCar') }, door('copcar', 'fl', false, 107.5),
      { T: 108, do: () => cs.vehicle('copcar').lightbar?.(false) },
      { T: 110, do: () => cs.fadeTo(1, 2.5) },
    ],
  };
}

// 117.7-188.5: the ride. The cruiser (COPCARLA at ride.start heading 89.5, Pulaski driving, Tenpenny front, Hernandez and CJ
// rear) goes west, south to the rail crossing, waits for the freight train (~13 s), crosses, west, north, east into the
// Jefferson alley; CJ is thrown out at 183 and the car leaves. Camera table (TIMERB ms) and subtitle table from the script.
function buildRide(cs) {
  const start = cs.anchor('ride.start'), cross = cs.anchor('ride.crossingStop'), stop = cs.anchor('ride.alleyStop'), bmx = cs.anchor('alley.bmx');
  const X1 = cross.x, WAIT = { x: X1, y: cross.y + 2 }, ROW = cross.y - 24, W = stop.x - 12;   // the north-south street, the stop line, the row south of the rails, the column up to the alley
  const path = { who: 'copcar', z: start.z, pts: [
    [RIDE0, start], [128.5, { x: X1 + 6, y: start.y }], [129.4, { x: X1 + 1.2, y: start.y - 2.4 }], [130.0, { x: X1, y: start.y - 7 }],
    [138.5, WAIT], [150.3, WAIT], [153.0, { x: X1, y: ROW + 6 }], [153.8, { x: X1 - 2, y: ROW + 2 }], [154.5, { x: X1 - 7, y: ROW }],
    [161.5, { x: W + 6, y: ROW }], [162.3, { x: W + 1.5, y: ROW + 2 }], [163.0, { x: W, y: ROW + 7 }],
    [174.5, { x: W, y: stop.y - 8 }], [175.3, { x: W + 1, y: stop.y - 2.5 }], [176.0, { x: W + 4.5, y: stop.y }], [179.4, stop], [184.0, stop], [185.5, rel(stop, { f: 7 })], [188.5, rel(stop, { f: 48 })], [193, rel(stop, { f: 120 })] ] };
  cs.addPath(path); const carAt = (T) => cs.pathFrame('copcar', T);
  let tr = cs.anchor('ride.trainStart'); if (Math.abs(tr.y - RAIL_Y) > 30) tr = { x: X1 - 120, y: RAIL_Y, z: cross.z, heading: 270 };   // the anchor is off the rails: run along them from the west
  cs.addPath({ who: 'train', z: tr.z, pts: [[131.5, tr], [147.0, rel({ ...tr, heading: tr.x <= X1 ? 270 : 90 }, { f: 200 })]] });   // 12.9 m/s: the loco at the crossing ~140.8, the last car clear ~146.6
  const cjOut = rel(stop, { f: 0.5, l: -2.2, h: 0 });
  return {
    shots: [
      { T: R(0), pos: [2358.66, -1246.35, 28.79], look: at('copcar', 0, 0, 0.8), fov: 50 },                          // fixed high shot
      { T: R(1500), pos: at('copcar', 5, -9, 1.4), look: at('copcar', 0, 0, 0.9), fov: 50 },                         // 7 s track
      { T: R(5500), pos: at(carAt(125.5), 0, -4.2, 0.5), look: at('copcar', 0, 0, 0.8), fov: 55 },                   // low street shot
      { T: R(9500), pos: at('copcar', -8, 1.5, 2.4), look: at('copcar', 6, 0, 1.0), fov: 55 },                        // 6.8 s follow
      { T: R(16200), pos: [2316.99, -1378.12, 23.31], look: at('copcar', 0, 0, 0.9), fov: 50 },                      // low shot approaching the train
      { T: R(20500), pos: [2271.75, -1396.44, 36.73], look: [X1, RAIL_Y, cross.z], fov: 45 },                        // high shot of the train
      { T: R(32300), pos: at('copcar', 1, -6.5, 1.1), look: at('copcar', 0, 0, 0.95), fov: 50 },                      // side of the car 5.7 s
      { T: R(37589), pos: at(carAt(159.5), 0, -6, 1.7), look: at(carAt(159.5), 25, 0, 1.2), fov: 50 },                // fixed
      { T: R(38500), pos: at(carAt(159.5), 0, -6, 1.7), look: at('copcar', 0, 0, 0.9), fov: 50 },                     // 7.5 s westward pan
      { T: R(46000), pos: at(carAt(165.5), 14, -5, 1.5), look: at(carAt(165.5), 0, 0, 0.8), fov: 50 },                   // fixed
      { T: R(48000), pos: at('copcar', -3, 6.5, 1.4), look: at('copcar', 4, 0, 1.0), fov: 50 },                       // 5 s track
      { T: R(53000), pos: at(carAt(173), -18, -10, 26), look: at(carAt(173), 0, 0, 1), fov: 50, to: { pos: at(carAt(173), -10, -5, 9), dur: 4 } },   // descending crane 4 s
      { T: R(57000), pos: at(carAt(176.5), -14, 1, 2.6), look: at(carAt(179), 0, 0, 1.0), fov: 50 },                  // fixed, into the sun
      { T: R(59200), pos: at('copcar', -6.5, -2.2, 1.9), look: at('copcar', 5, 0, 1.0), fov: 50 },                     // 2.5 s track
      { T: R(61400), pos: at(stop, -8, -2.5, 1.7), look: at(stop, 1, 0, 1.0), fov: 50 },                             // alley
      { T: R(63000), pos: at(stop, 1.5, -7.5, 1.3), look: at(stop, 0.5, -1, 0.9), fov: 50 },                         // end shot: CJ out, the car away
      { T: 182, pos: at(stop, 1.5, -7.5, 1.3), look: at('cj', 0, 0, 1.15), fov: 50, to: { pos: DOLLY_A, dur: 6.5, ease: smooth } },   // the 6.5 s push
    ],
    // PS2 GXT, ms from the ride fade-in / duration.
    lines: [
      [0, 3050, 'tenpenny', "How you been, Carl? How's your wonderful family?"], [3150, 2530, 'cj', "I'm here to bury my Moms. You know that."],
      [6000, 1600, 'tenpenny', 'Yeah, I guess I do.'], [9190, 1530, 'tenpenny', "So what else you got shakin' Carl?"],
      [10810, 5510, 'cj', "Nothing. I live in Liberty City now. I'm clean. Legit."], [16600, 2560, 'tenpenny', "No, you ain't never been clean, Carl."],
      [21000, 1350, 'tenpenny', "Well, what've we got here?"], [23500, 3760, 'tenpenny', 'This is a weapon, Officer Pulaski, that was used to gun down'],
      [27260, 2450, 'tenpenny', 'a police officer not ten minutes ago.'], [30700, 3620, 'pulaski', 'Officer Pendelbury. A fine man, I might add.'],
      [35000, 1440, 'pulaski', 'Damn, you work fast for a man fresh off the plane.'], [36750, 1739, 'cj', 'You know I just got off the plane!'],
      [38489, 2450, 'tenpenny', "It's a good thing we found you and retrieved the murder weapon."], [40939, 971, 'cj', "That ain't my gun."],
      [41910, 1320, 'tenpenny', "Don't bullshit me, Carl."], [43230, 1342, 'pulaski', "Yeah, don't bullshit him, Carl."],
      [44572, 1747, 'cj', 'What the fuck you want from me this time?'], [46700, 2355, 'tenpenny', "When we want you, we'll find you."],
      [49500, 4400, 'tenpenny', 'In the meantime, try not to gun down any more officers of the law.'], [55900, 3111, 'cj', "You can't leave me here - it's BALLAS country."],
      [59500, 3400, 'tenpenny', "I thought you said you was innocent, Carl? That you don't bang?"], [62900, 1180, 'pulaski', 'This is car 58... WHAT?!'],
      [64080, 1700, 'tenpenny', 'See you around like a doughnut, Carl...'], [65780, 4700, 'pulaski', "Officer Pendelbury's down? We'll be right over."],   // 2500 in the table; the capture keeps it up until "Ah shit"
    ].map(([ms, dur, who, text]) => ({ T: R(ms), dur: dur / 1000, who, text })),
    cues: [
      { T: RIDE0, loop: 'carInterior', gain: 0.8 }, { T: RIDE0, loop: 'street', gain: 0.35 }, { T: 133.5, play: 'trainHorn' }, { T: 134.5, play: 'trainPass' },
      { T: 180.9, play: 'radioStatic', gain: 0.8 }, { T: 182.4, play: 'doorOpen' }, { T: 183.8, play: 'radioStatic', gain: 0.6 }, { T: 184.2, play: 'doorClose' },
      { T: 184, stop: 'carInterior', fade: 1.5 }, { T: 184, loop: 'street', gain: 0.8 },
    ],
    acts: [
      { T: RIDE0, do: () => {
        const c = cs.vehicle('copcar'); c.lights?.(true); c.lightbar?.(false); for (const d of ['fl', 'fr', 'rl', 'rr']) c.setDoor?.(d, 0);
        cs.seat('pulaski', 'copcar', 'driver', 'driveCar'); cs.seat('tenpenny', 'copcar', 'passenger', 'sitCar'); cs.seat('hernandez', 'copcar', 'rl', 'sitCar'); cs.seat('cj', 'copcar', 'rr', 'sitCar');
        const b = cs.vehicle('bmx'); b.setPosition(bmx.x, bmx.y, bmx.z); b.setHeading(bmx.heading);
        const t = cs.vehicle('train'); t.lights?.(true);
      } },
      { T: 182.4, do: () => cs.tween(0.6, (k) => cs.vehicle('copcar').setDoor?.('rr', k)) },
      { T: 183, do: () => { cs.unseat('cj', cjOut, 'stumble'); cs.actor('cj').setHeading(stop.heading); } },
      { T: 184.2, do: () => { cs.tween(0.5, (k) => cs.vehicle('copcar').setDoor?.('rr', 1 - k)); cs.actor('cj').play('idle', { loop: true, fade: 0.5 }); } },
    ],
  };
}

// 188.5-204.5: the alley. A dolly with handheld shake behind CJ walking slowly east to alley.cj (11.5 s, five lines), then
// a fixed shot from 200 (the capture; the script's timers say 13.5 + 2.5 s); control returns at 204.5 with CJ at alley.cj facing east and the BMX 7 m ahead.
function buildVo(cs) {
  const cj = cs.anchor('alley.cj'), stop = cs.anchor('ride.alleyStop'), from = rel(stop, { f: 0.5, l: -2.2 });
  return {
    shots: [
      { T: 188.5, pos: DOLLY_A, look: at('cj', 0.5, 0, 1.2), fov: 50, shake: 1, to: { pos: DOLLY_B, dur: 11.5 } },
      { T: 200, pos: at(cj, -2.6, 1.3, 1.55), look: at(cj, 3, -1.0, 0.9), fov: 50 },   // the fixed shot: behind-left, the BMX past his right
    ],
    lines: [
      { T: 188.5, dur: 2.5, who: 'cj', text: 'Ah shit, here we go again.' },
      { T: 191.5, dur: 1.0, who: 'cj', text: 'Worst place in the world.' },
      { T: 193, dur: 2.0, who: 'cj', text: 'Rollin Heights Balla country.' },
      { T: 195.5, dur: 2.5, who: 'cj', text: "I ain't represented Grove Street in five years," },
      { T: 198, dur: 1.5, who: 'cj', text: "but the Ballas won't give a shit." },
    ],
    cues: [{ T: 204.5, stop: 'street', fade: 1.0 }],
    acts: [
      { T: 188.5, do: () => cs.walk('cj', from, cj, 11.5, 'walk', 'lookAround', cj.heading) },
    ],
  };
}

// ---------------- the engine ----------------
export class Cutscene {
  constructor(ctx) {
    this.ctx = ctx; this.world = ctx.world; this.hud = ctx.hud; this.audio = ctx.audio; this.app = ctx.app;
    this.root = el('div', 'phase cutscene'); this.T = 0; this.part = null; this.pi = -1; this.done = false;
    this.events = []; this.ei = 0; this.tweens = []; this.paths = []; this.cam = null; this.fade = null; this.lastFade = -1; this.caseMesh = null; this.setName = null;
  }
  mount() { this.ctx.root.appendChild(this.root); this.hud.attach(this.root); this.world.ensureBuilt?.(); this.enterPart(0); }
  unmount() {
    this.audio.cancelSpeech?.(); for (const l of LOOPS) this.audio.stopLoop?.(l, 0.4);
    this.suitcase(false); this.hud.letterbox(false); this.hud.subtitle(''); this.hud.caption(null); this.hud.detach(); this.root.remove();
  }
  resize() {}
  // Skipping (X / Start) jumps to the end of the voice-over with everything in its final place; index.js then goes to play.
  press(b) { if (b === 'start' || b === 'cross') this.skip(); }
  skip() {
    if (this.done) return; this.audio.cancelSpeech?.(); for (const l of LOOPS) this.audio.stopLoop?.(l, 0.3);
    this.events = []; this.tweens = []; this.paths = []; this.hud.subtitle(''); this.hud.caption(null);
    this.show('losSantos'); this.hud.letterbox(true);
    const cj = this.anchor('alley.cj'), bmx = this.anchor('alley.bmx'), stop = this.anchor('ride.alleyStop');
    this.unseat('cj', cj, 'idle'); this.actor('cj').holdProp?.('none');
    const b = this.vehicle('bmx'); b.setPosition(bmx.x, bmx.y, bmx.z); b.setHeading(bmx.heading);
    const c = this.vehicle('copcar'), far = rel(stop, { f: 160 }); c.setPosition(far.x, far.y, stop.z); c.setHeading(stop.heading); c.lightbar?.(false);
    this.part = { name: 'end', black: false }; this.cam = { pos: DOLLY_B, look: at('cj', 0.3, 0, 1.15), fov: 50, T0: this.T }; this.applyCamera(); this.setFade(0);
    this.done = true;
  }
  enterPart(i) {
    const p = PARTS[i]; this.pi = i; this.part = p; if (!p) { this.done = true; return; }
    if (p.set) this.show(p.set);
    this.hud.letterbox(!!p.letterbox);
    if (p.black) { this.fade = null; this.setFade(1); } else if (p.dark) { this.fade = null; this.setFade(0); } else if (p.fadeIn) this.fade = { from: 1, to: 0, T0: p.T0, dur: p.fadeIn };
    const d = p.build ? p.build(this) : {}; const ev = [];
    for (const s of d.shots || []) ev.push({ T: s.T, run: () => { this.cam = { ...s, T0: s.T }; } });
    for (const l of d.lines || []) ev.push({ T: l.T, run: () => this.line(l) });
    for (const c of d.cues || []) ev.push({ T: c.T, run: () => this.cue(c) });
    for (const a of d.acts || []) ev.push({ T: a.T, run: a.do });
    for (const pa of d.paths || []) this.addPath(pa);
    this.events = ev.sort((a, b) => a.T - b.T); this.ei = 0;
  }
  update(dt) {
    if (this.done) return true;
    this.T += dt;
    for (;;) {
      while (this.ei < this.events.length && this.events[this.ei].T <= this.T) { const e = this.events[this.ei++]; e.run(); }
      if (!this.part || this.T < this.part.T1) break;
      if (this.pi + 1 >= PARTS.length) { this.done = true; break; }
      this.enterPart(this.pi + 1);
    }
    for (const tw of this.tweens) { const k = clamp01((this.T - tw.T0) / tw.dur); tw.fn(k); if (k >= 1) { tw.done = true; tw.end?.(); } }
    this.tweens = this.tweens.filter((t) => !t.done);
    for (const p of this.paths) this.drive(p);
    this.world.update?.(dt); this.hud.update?.(dt);
    this.applyCamera(); this.applyFade();
    return this.done;
  }
  render(r) {
    if (!this.part || this.part.black || this.part.dark) { r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear(); return; }
    this.world.render(r);
  }

  // ---- world helpers (SA coordinates; every sibling call has a fallback so a stub never throws) ----
  show(name) { if (this.setName === name) return; this.setName = name; this.world.show(name, 'sunrise'); }
  anchor(name) { const a = this.world.anchor?.(name); return a && typeof a.x === 'number' ? { x: a.x, y: a.y, z: a.z || 0, heading: a.heading || 0 } : { x: 0, y: 0, z: 0, heading: 0 }; }
  actor(name) { return this.world.actor(name); }
  vehicle(name) { return this.world.vehicle(name); }
  after(seconds, fn) { this.tweens.push({ T0: this.T, dur: seconds, fn: () => {}, end: fn }); }
  tween(dur, fn, end, who) { fn(0); this.tweens.push({ T0: this.T, dur: Math.max(1e-3, dur), fn, end, who }); }
  cancel(who) { this.tweens = this.tweens.filter((t) => t.who !== who); }
  // Position and heading of a three.js object in SA terms (works through a vehicle parent).
  poseOf(group) {
    const v = new THREE.Vector3(); group.getWorldPosition(v); const q = new THREE.Quaternion(); group.getWorldQuaternion(q);
    return { x: v.x, y: -v.z, z: v.y, heading: new THREE.Euler().setFromQuaternion(q, 'YXZ').y / D2R };
  }
  frameOf(base) {
    if (Array.isArray(base)) return { x: base[0], y: base[1], z: base[2] || 0, heading: 0 };
    if (typeof base === 'function') return base(this);
    if (typeof base === 'object' && base) return base;
    if (VEHICLES.includes(base)) return this.poseOf(this.vehicle(base).group);
    if (ACTORS.includes(base)) return this.poseOf(this.actor(base).group);
    return this.anchor(base);
  }
  resolve(ref) {
    if (Array.isArray(ref)) return { x: ref[0], y: ref[1], z: ref[2] || 0, heading: 0 };
    if (ref && ref.base !== undefined) return rel(this.frameOf(ref.base), ref);
    return ref;
  }
  place(name, ref, clip = 'idle', prop) {
    const a = this.actor(name), p = this.resolve(ref); this.cancel(name); if (a.group.parent !== this.world.scene) this.world.scene.add(a.group);
    a.setPosition(p.x, p.y, p.z); a.setHeading(p.heading); a.play(clip, { loop: true, fade: 0 }); if (prop) a.holdProp?.(prop); return a;
  }
  // A timed walk between two poses: the actor faces the way it goes, the gait keeps up with the ground, `then` plays on arrival.
  walk(name, from, to, dur, clip = 'walk', then = 'idle', face) {
    const a = this.actor(name), A = this.resolve(from), B = this.resolve(to), h = dist(A, B) > 0.05 ? headingTo(A, B) : (face ?? A.heading);
    this.cancel(name); if (a.group.parent !== this.world.scene) this.world.scene.add(a.group);
    a.setHeading(h); a.play(clip, { loop: true, speed: Math.max(0.3, dist(A, B) / dur / (NOMINAL[clip] || 1.45)), fade: 0.2 });
    this.tween(dur, (k) => a.setPosition(lerp(A.x, B.x, k), lerp(A.y, B.y, k), lerp(A.z, B.z, k)), () => { if (face != null) a.setHeading(face); a.play(then, { loop: then !== 'shove' && then !== 'stumble', fade: 0.25 }); }, name);
  }
  // Seats an actor by parenting it to the vehicle at the seat point (hips 0.55 above the origin in the seated clips).
  seat(name, veh, seatName, clip = 'sitCar') {
    const a = this.actor(name), v = this.vehicle(veh); let s = null; try { s = v.seat?.(seatName); } catch (e) { s = null; }
    if (!s) s = new THREE.Vector3(seatName === 'driver' ? -0.4 : 0.4, 0.9, seatName.startsWith('r') ? 0.55 : -0.35);
    this.cancel(name); v.group.add(a.group); a.group.position.set(s.x, s.y - 0.55, s.z); a.group.rotation.set(0, 0, 0); a.lookAt?.(null); a.play(clip, { loop: true, fade: 0 });
  }
  unseat(name, ref, clip = 'idle') { const p = this.resolve(ref); const a = this.place(name, p, 'idle'); a.play(clip, { loop: clip !== 'stumble' && clip !== 'shove', fade: 0 }); return a; }
  // The suitcase on the belt: a plain box, ours to add and remove (the actor carries its own once lifted).
  suitcase(on) {
    if (on && !this.caseMesh) { this.caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.24), new THREE.MeshLambertMaterial({ color: 0x7a4a2a })); this.world.scene?.add(this.caseMesh); }
    if (!on && this.caseMesh) { this.caseMesh.parent?.remove(this.caseMesh); this.caseMesh.geometry.dispose(); this.caseMesh.material.dispose(); this.caseMesh = null; }
  }
  moveCase(a, b, k) { if (!this.caseMesh) return; this.caseMesh.position.set(lerp(a.x, b.x, k), lerp(a.z, b.z, k), -lerp(a.y, b.y, k)); this.caseMesh.rotation.y = (a.heading || 0) * D2R; }
  // ---- vehicle paths: [T, {x, y}] points, linear between, heading from a central difference so corners round off ----
  addPath(p) { this.paths = this.paths.filter((q) => q.who !== p.who); p.last = null; const a = p.pts[0][1], b = p.pts.find(([, q]) => dist(a, q) > 0.05); p.heading = b ? headingTo(a, b[1]) : 0; this.paths.push(p); }
  samplePath(p, T) {
    const pts = p.pts; if (T <= pts[0][0]) return pts[0][1]; const n = pts.length; if (T >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 1; while (i < n - 1 && pts[i][0] < T) i++;
    const [t0, a] = pts[i - 1], [t1, b] = pts[i], k = t1 > t0 ? (T - t0) / (t1 - t0) : 1; return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
  }
  pathFrame(who, T) {
    const p = this.paths.find((q) => q.who === who); if (!p) return { x: 0, y: 0, z: 0, heading: 0 };
    const c = this.samplePath(p, T), a = this.samplePath(p, T - 0.2), b = this.samplePath(p, T + 0.2);
    return { x: c.x, y: c.y, z: p.z || 0, heading: dist(a, b) > 0.05 ? headingTo(a, b) : p.heading };
  }
  drive(p) {
    if (this.T < p.pts[0][0]) return; const f = this.pathFrame(p.who, this.T), v = this.vehicle(p.who);
    if (p.last) v.spin?.(dist(p.last, f)); v.setPosition(f.x, f.y, f.z); v.setHeading(f.heading); p.heading = f.heading; p.last = f;
  }
  // ---- subtitles, voices, cues ----
  line(l) {
    this.hud.subtitle(l.text, l.dur);
    if (l.who) { try { const r = this.audio.say?.(l.who, l.text, { timeout: l.dur + 3 }); r?.catch?.(() => {}); } catch (e) { /* no speech */ } }
    if (l.g && ACTORS.includes(l.who)) { const a = this.actor(l.who); a.play('talk', { loop: true, fade: 0.25 }); this.after(l.dur, () => { if (a.clip === 'talk') a.play('idle', { loop: true, fade: 0.3 }); }); }
  }
  cue(c) {
    try {
      if (c.play) this.audio.play?.(c.play, { gain: c.gain ?? 1 });
      else if (c.loop) this.audio.loop?.(c.loop, { gain: c.gain ?? 1, fade: c.fade ?? 0.8 });
      else if (c.stop) this.audio.stopLoop?.(c.stop, c.fade ?? 0.5);
    } catch (e) { /* audio is optional */ }
  }
  // ---- camera: resolved every frame (tracking shots follow their base), moves eased over dur, shake on top ----
  applyCamera() {
    const c = this.cam; if (!c) return; let p = this.resolve(c.pos), q = this.resolve(c.look);
    if (c.to) { const k = (c.to.ease || ((x) => x))(clamp01((this.T - c.T0) / c.to.dur)); const p2 = c.to.pos ? this.resolve(c.to.pos) : p, q2 = c.to.look ? this.resolve(c.to.look) : q; p = { x: lerp(p.x, p2.x, k), y: lerp(p.y, p2.y, k), z: lerp(p.z, p2.z, k) }; q = { x: lerp(q.x, q2.x, k), y: lerp(q.y, q2.y, k), z: lerp(q.z, q2.z, k) }; }
    if (c.shake) { const s = c.shake, t = this.T; p = { x: p.x + 0.035 * s * wobble(t, 1), y: p.y + 0.035 * s * wobble(t, 2), z: p.z + 0.03 * s * wobble(t, 3) }; q = { x: q.x + 0.12 * s * wobble(t, 4), y: q.y + 0.12 * s * wobble(t, 5), z: q.z + 0.1 * s * wobble(t, 6) }; }
    if (![p.x, p.y, p.z, q.x, q.y, q.z].every(Number.isFinite)) return;
    if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 1e-3) q = { ...q, x: q.x + 0.01 };   // never look straight down the up axis
    this.world.setCamera({ pos: [p.x, p.y, p.z], look: [q.x, q.y, q.z], fov: c.fov || 50 });
  }
  // ---- the black overlay, driven from update (app.fade's own transition would run on the wall clock) ----
  fadeTo(to, dur) { this.fade = { from: this.lastFade < 0 ? 0 : this.lastFade, to, T0: this.T, dur }; }
  setFade(v) { if (v !== this.lastFade) { this.lastFade = v; this.app.fade(v, 0); } }
  applyFade() { if (!this.fade) return; const f = this.fade, k = clamp01((this.T - f.T0) / f.dur); this.setFade(+lerp(f.from, f.to, k).toFixed(3)); if (k >= 1) this.fade = null; }
}
