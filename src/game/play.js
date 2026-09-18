// Control: CJ in the Jefferson alley, the BMX, the ride to Grove Street. The first minutes of play after the opening
// (research §5, 204.5-208 s; frames ref-hVj4/t0204.50-t0208.00): the HUD fades in with the zone name, the help box,
// the blue marker over the BMX, the ride down to the red marker at the Johnson house, which starts "Big Smoke".
// Runs on the world / hud / audio contracts and never trusts a sibling to be finished: every optional call is guarded
// and a missing ground or marker falls back to the anchors. Only update(dt) advances time (deterministic captures).
import { el } from '../ui/overlay.js';
import { BUTTON, svg } from '../ui/icons.js';
import { makeRng } from '../rng.js';
import * as props from './world/props.js';
import * as actors from './world/actors.js';

const D2R = Math.PI / 180;
const WALK = 2.2, RUN = 5.0;                 // m/s on foot; cross held = sprint (spec)
const TURN = 720;                            // deg/s CJ turns toward the stick (SA turns on the spot almost instantly)
const ACCEL = 14, DECEL = 20;                // m/s² on foot: a step to full speed, a step to stop
const BIKE = { max: 9, pedal: 3.2, tap: 0.6, coast: 0.7, brake: 7, reverse: 1.2, steer: 85, lean: 0.26 };   // m/s, m/s², deg/s, rad
const MOUNT_RANGE = 2.0;                     // metres from the BMX for the "Press △" prompt (spec: 2 m)
const MOUNT_SECONDS = 0.6;                   // CJ hops on over this long
const MARKER_R = 1.3;                        // the red marker's radius at the Johnson house
const CLOCK = { h: 6, m: 46 };               // 06:46 at control (research §9); one game minute per real second
const HUD_FADE = 1.5, HELP_AT = 2.5, OBJECTIVE_AT = 5, OBJECTIVE_SECS = 4, HELP_SECS = 8;
// The SA chase camera: behind the player, above head height, aimed at the shoulders (ref-hVj4/t0206.50: horizon at
// 40 %, CJ's head at 48 %, feet at 92 %); on the bike further back and higher (t0208.00: head 42 %, wheels 72 %). The yaw
// swings behind the player only while he moves, with an exponential lag; `fov` is vertical (SA's 70° horizontal ≈ 55°).
const CAM = { foot: { back: 3.6, up: 1.95, look: 1.6, fov: 55, lag: 2.6 }, bike: { back: 5.1, up: 2.3, look: 1.3, fov: 58, lag: 3.2 } };
const CAM_MIN = 1.2;                         // the camera never comes closer than this when a wall is in the way
const RIDER_DROP = 0.42;                     // the pedal clip's origin sits 0.42 m under the saddle (actors.js)
const NOMINAL = { walk: 1.45, run: 4.4, ...(actors.NOMINAL || {}) };
// PS2 GXT strings verbatim (research §5); the ~k~ tokens become button glyphs in the help box.
const HELP = {
  move: 'Use {up}, {down}, {left} and {right} to move Carl.',
  mount: 'Press {triangle} to jump on the bike.',
  follow: "Follow the 'CJ' icon on the radar to get back to the hood.",
  pedal: 'To pedal the bike faster repeatedly tap {cross}.',
};
const OBJECTIVE = 'Get on the bike.';
const GROVE_LINES = ['Grove Street - Home.', 'At least it was before I fucked everything up.'];
const MISSION = 'Big Smoke';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapDeg = (d) => ((d + 180) % 360 + 360) % 360 - 180;
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const turnToward = (h, want, maxStep) => h + clamp(wrapDeg(want - h), -maxStep, maxStep);
const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
// START / SELECT have no disc glyph in icons.js: the pad's oblong buttons, drawn to match the discs' dark look.
const PILL = (text) => `<svg viewBox="0 0 48 24" class="btn pill"><rect x="1.5" y="6" width="45" height="12" rx="6" fill="#0a0a0c" stroke="#3a3b40" stroke-width="0.8"/><text x="24" y="15.6" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="7.2" fill="#c8c8d0" letter-spacing="0.4">${text}</text></svg>`;

function pauseOverlay() {
  const o = el('div', 'pause'); o.appendChild(el('div', 'pause-title', 'Paused'));
  const row = el('div', 'pause-hints');
  for (const [b, label] of [['start', 'Resume'], ['select', 'Eject']]) { const h = el('span', 'pkey'); h.appendChild(svg(BUTTON[b] || PILL(b.toUpperCase()))); h.appendChild(el('span', 'label', label)); row.appendChild(h); }
  o.appendChild(row); return o;
}
// Does the set already carry a marker near the anchor (a named prop or anything standing within 1.5 m of it)?
function setHasMarker(group, m) {
  if (!group?.traverse) return false; let found = false; safe(() => group.updateMatrixWorld(true));
  group.traverse((o) => { if (found || o === group) return; if (/marker/i.test(o.name || '')) { found = true; return; } if (o.isGroup && Math.hypot(o.position.x - m.x, -o.position.z - m.y) < 1.5) found = true; });
  return found;
}

export class Play {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.paused = false; this.ending = -1; this.rng = makeRng(23);
    this.root = el('div', 'phase play');
    this.black = el('div', 'blackout'); this.black.hidden = true; this.root.appendChild(this.black);   // under the HUD: the title shows over it
    this.pauseEl = pauseOverlay(); this.pauseEl.hidden = true;
    // CJ in SA coordinates; the camera keeps its own yaw so it can lag the turn
    this.pos = { x: 0, y: 0, z: 0 }; this.heading = 270; this.speed = 0; this.clip = 'idle'; this.stride = 0;
    this.bikePos = { x: 0, y: 0, z: 0 }; this.bikeHeading = 285; this.bikeSpeed = 0; this.lean = 0; this.riding = false; this.mountT = -1; this.mountFrom = null;
    this.camYaw = 270; this.cam = null; this.map = null; this.zoneName = null; this.stick = null; this.moveDir = 270;
    this.helpT = -1; this.helpNext = null; this.groveT = -1; this.stage = { help: false, objective: false, mountHelp: false, grove: 0 };
  }
  mount() {
    const { world, hud, audio, root } = this.ctx;
    root.appendChild(this.root); hud.attach(this.root); this.root.appendChild(this.pauseEl);   // pause above the HUD
    world.show('losSantos', 'sunrise');
    this.map = safe(() => world.mapData?.(), null);
    this.alley = world.anchor('alley.cj'); this.marker = world.anchor('grove.marker'); const b = world.anchor('alley.bmx');
    // CJ where the cruiser dumped him, facing east; the BMX 7 m east under the blue marker
    this.pos = { x: this.alley.x, y: this.alley.y, z: this.alley.z }; this.heading = this.alley.heading ?? 270; this.camYaw = this.heading;
    this.cj = world.actor('cj'); this.cj.holdProp?.('none'); this.cj.lookAt?.(null); this.cj.play?.('idle', { fade: 0 }); this.clip = 'idle'; this.place();
    this.bike = world.vehicle('bmx'); this.bikePos = { x: b.x, y: b.y, z: b.z }; this.bikeHeading = b.heading ?? 285; this.placeBike();
    this.blue = safe(() => props.blueMarker?.()); if (this.blue?.isObject3D) { this.blue.position.set(b.x, b.z, -b.y); world.scene.add(this.blue); } else this.blue = null;
    this.red = null;
    if (!setHasMarker(world.current?.group, this.marker)) { this.red = safe(() => props.redMarker?.()); if (this.red?.isObject3D) { this.red.position.set(this.marker.x, this.marker.z, -this.marker.y); world.scene.add(this.red); } else this.red = null; }
    hud.setClock(CLOCK.h, CLOCK.m); hud.setMoney(350); hud.setHealth(100); hud.showHud(true, HUD_FADE);
    this.zoneName = this.zoneAt(this.pos.x, this.pos.y) || 'Jefferson'; hud.zone(this.zoneName);
    audio.loop?.('street', { gain: 0.5 });
    this.updateCamera(0, true); this.radar();
  }
  update(dt) {
    if (this.paused) return false;
    this.t += dt; const { world, hud } = this.ctx;
    if (this.ending >= 0) return this.endStep(dt);
    if (this.mountT >= 0) this.mountStep(dt); else if (this.riding) this.rideStep(dt); else this.walkStep(dt);
    this.script(dt);
    world.update?.(dt); hud.update?.(dt); this.blue?.userData?.update?.(dt);
    this.updateCamera(dt); this.radar(); this.clock();
    return false;
  }
  render(r) { const { world } = this.ctx; if (this.cam) world.setCamera?.(this.cam); world.render(r); }
  press(b) {
    if (this.ending >= 0) return;
    if (b === 'start') { this.paused = !this.paused; this.pauseEl.hidden = !this.paused; return; }
    if (this.paused) return;
    if (b === 'triangle') { if (this.riding) this.getOff(); else if (this.mountT < 0 && this.distToBike() <= MOUNT_RANGE + 0.6) this.getOn(); }
    else if (b === 'cross' && this.riding && this.bikeSpeed >= 0) this.bikeSpeed = Math.min(BIKE.max, this.bikeSpeed + BIKE.tap);   // each tap is a pedal stroke
  }
  unmount() {
    const { hud, audio } = this.ctx; audio.stopLoop?.('street', 0.5);
    this.blue?.removeFromParent?.(); this.red?.removeFromParent?.();
    if (this.cj?.group) this.cj.group.rotation.z = 0; if (this.bike?.group) this.bike.group.rotation.z = 0;
    hud.detach(); this.root.remove();
  }

  // --- on foot: camera-relative stick, CJ turns toward it and moves along his heading, sliding along walls ---
  walkStep(dt) {
    const input = this.ctx.input, ax = input.axes?.() || { x: 0, y: 0 }, len = Math.hypot(ax.x, ax.y), run = !!input.isDown?.('cross');
    if (len > 0.01) {
      // The stick maps to the world through the camera yaw, latched until the stick itself moves: otherwise walking
      // toward the camera spirals as the camera swings round behind CJ (stick angle 0 = up, positive = right).
      const stick = Math.atan2(ax.x, -ax.y) / D2R;
      if (this.stick == null || Math.abs(wrapDeg(stick - this.stick)) > 12) { this.stick = stick; this.moveDir = wrapDeg(this.camYaw - stick); }
      this.heading = wrapDeg(turnToward(this.heading, this.moveDir, TURN * dt));
      const target = (run ? RUN : WALK) * Math.min(1, len); this.speed = approach(this.speed, target, (target > this.speed ? ACCEL : DECEL) * dt);
    } else { this.stick = null; this.speed = approach(this.speed, 0, DECEL * dt); }
    if (this.speed > 0.05) {
      const h = this.heading * D2R; this.move(-Math.sin(h) * this.speed * dt, Math.cos(h) * this.speed * dt);
      const clip = run && this.speed > WALK + 0.3 ? 'run' : 'walk'; this.playClip(clip, this.speed / (NOMINAL[clip] || 1));
      this.stride += this.speed * dt; if (this.stride >= (clip === 'run' ? 1.4 : 0.85)) { this.stride = 0; this.ctx.audio.play?.('footstep', { gain: 0.45, rate: 0.92 + this.rng() * 0.16 }); }
    } else { this.playClip('idle', 1); this.stride = 0.5; }
    this.place();
  }
  playClip(name, speed) { if (this.clip !== name) { this.clip = name; this.cj.play?.(name, { speed, fade: 0.15 }); } else this.cj.play?.(name, { speed }); }
  // Collision: the step, else a slide along one axis; a start inside a wall can always step out.
  move(dx, dy) {
    const p = this.pos, ok = (x, y) => this.ctx.world.walkable?.(x, y) !== false; let hit = false;
    if (!ok(p.x, p.y) || ok(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; } else if (ok(p.x + dx, p.y)) { p.x += dx; hit = true; } else if (ok(p.x, p.y + dy)) { p.y += dy; hit = true; } else hit = true;
    p.z = this.groundZ(p.x, p.y); return hit;
  }
  place() { this.cj.setPosition?.(this.pos.x, this.pos.y, this.pos.z); this.cj.setHeading?.(this.heading); }
  placeBike() { this.bike.setPosition?.(this.bikePos.x, this.bikePos.y, this.bikePos.z); this.bike.setHeading?.(this.bikeHeading); if (this.bike.group) this.bike.group.rotation.z = this.lean; }
  distToBike() { return Math.hypot(this.pos.x - this.bikePos.x, this.pos.y - this.bikePos.y); }

  // --- the BMX: cross pedals (hold to build up, tap for strokes), square brakes, left/right steer, a lean into turns ---
  rideStep(dt) {
    const input = this.ctx.input, ax = input.axes?.() || { x: 0, y: 0 }, pedal = !!input.isDown?.('cross'), brake = !!input.isDown?.('square');
    let v = this.bikeSpeed;
    if (brake) v = approach(v, ax.y > 0.5 ? -BIKE.reverse : 0, BIKE.brake * dt);   // square brakes; with down held it backs up
    else if (pedal) v = approach(v, BIKE.max, BIKE.pedal * dt);
    else v = approach(v, 0, (ax.y > 0.5 ? 2.5 : BIKE.coast) * dt);
    this.bikeSpeed = v;
    const steer = clamp(ax.x, -1, 1), rate = BIKE.steer * clamp(Math.abs(v) / 4, 0.12, 1) * (v < 0 ? -1 : 1);   // left = heading up (0 north, 90 west)
    this.bikeHeading = wrapDeg(this.bikeHeading - steer * rate * dt);
    this.lean = approach(this.lean, steer * BIKE.lean * clamp(Math.abs(v) / 6, 0, 1), 2.5 * dt);
    const h = this.bikeHeading * D2R, dx = -Math.sin(h) * v * dt, dy = Math.cos(h) * v * dt, bp = this.bikePos, ok = (x, y) => this.ctx.world.walkable?.(x, y) !== false;
    if (!ok(bp.x, bp.y) || ok(bp.x + dx, bp.y + dy)) { bp.x += dx; bp.y += dy; } else if (ok(bp.x + dx, bp.y)) { bp.x += dx; this.bikeSpeed *= 0.5; } else if (ok(bp.x, bp.y + dy)) { bp.y += dy; this.bikeSpeed *= 0.5; } else this.bikeSpeed *= 0.2;
    bp.z = this.groundZ(bp.x, bp.y); this.bike.spin?.(v * dt); this.placeBike();
    // the rider: legs turn with the cranks (44/16 on 20-inch wheels ≈ 0.23 rev/m, the clip is one revolution), frozen when coasting
    this.cj.play?.('pedal', { speed: pedal && v > 0.2 ? 0.21 * v : 0 });
    this.seatRider();
  }
  // CJ's origin from the saddle: the seat offset leans with the bike, then turns with its heading (three x, z → SA x, -y).
  seatWorld() {
    const s = this.bike.seat?.('driver') || { x: 0, y: 0.86, z: 0.2 }, sy = s.y - RIDER_DROP, c = Math.cos(this.lean), sn = Math.sin(this.lean);
    const lx = s.x * c - sy * sn, ly = s.x * sn + sy * c, yaw = this.bikeHeading * D2R;
    const ox = lx * Math.cos(yaw) + s.z * Math.sin(yaw), oz = -lx * Math.sin(yaw) + s.z * Math.cos(yaw);
    return { x: this.bikePos.x + ox, y: this.bikePos.y - oz, z: this.bikePos.z + ly };
  }
  seatRider() { this.pos = this.seatWorld(); this.heading = this.bikeHeading; this.place(); if (this.cj.group) this.cj.group.rotation.z = this.lean; }
  getOn() { this.mountT = 0; this.mountFrom = { ...this.pos }; this.speed = 0; this.ctx.hud.help(''); this.helpT = -1; this.playClip('walk', 1.2); }
  mountStep(dt) {
    this.mountT += dt; const k = Math.min(1, this.mountT / MOUNT_SECONDS), s = this.seatWorld(), f = this.mountFrom;
    this.pos = { x: f.x + (s.x - f.x) * k, y: f.y + (s.y - f.y) * k, z: f.z + (s.z - f.z) * k };
    this.heading = turnToward(this.heading, this.bikeHeading, 540 * dt); this.place();
    if (k >= 0.4 && this.clip !== 'pedal') { this.clip = 'pedal'; this.cj.play?.('pedal', { speed: 0, fade: 0.3 }); }
    if (k >= 1) { this.mountT = -1; this.riding = true; this.stride = 0; this.seatRider(); this.onMounted(); }
  }
  onMounted() {
    const { hud, audio } = this.ctx; if (this.blue) this.blue.visible = false; this.stage.mounted = true;
    hud.vehicleName('BMX'); this.showHelp(HELP.follow, 7, { text: HELP.pedal, secs: 6 }); audio.play?.('footstep', { gain: 0.35, rate: 0.8 });
  }
  getOff() {
    this.riding = false; this.bikeSpeed = 0; this.lean = 0; this.placeBike(); if (this.cj.group) this.cj.group.rotation.z = 0;
    const h = this.bikeHeading * D2R, x = this.bikePos.x - Math.cos(h) * 0.9, y = this.bikePos.y - Math.sin(h) * 0.9;   // steps off to the left
    this.pos = { x, y, z: this.groundZ(x, y) }; this.heading = this.bikeHeading; this.clip = 'idle'; this.cj.play?.('idle', { fade: 0.2 }); this.place();
    this.ctx.hud.vehicleName(''); if (this.blue) this.blue.visible = true;
  }

  // --- the script: help box, objective, zone names, the Grove Street lines, the marker ---
  script(dt) {
    const { hud, audio } = this.ctx, st = this.stage;
    if (!st.help && this.t >= HELP_AT) { st.help = true; this.showHelp(HELP.move, HELP_SECS); }
    if (!st.objective && this.t >= OBJECTIVE_AT) { st.objective = true; hud.objective(OBJECTIVE, OBJECTIVE_SECS); }
    if (!st.mountHelp && !this.riding && this.mountT < 0 && this.distToBike() <= MOUNT_RANGE) { st.mountHelp = true; this.showHelp(HELP.mount, HELP_SECS); }
    else if (st.mountHelp && !st.mounted && this.distToBike() > 2 * MOUNT_RANGE) st.mountHelp = false;   // walked off: the prompt comes back
    if (this.helpT >= 0) { this.helpT -= dt; if (this.helpT <= 0) { this.helpT = -1; hud.help(''); const n = this.helpNext; this.helpNext = null; if (n) this.showHelp(n.text, n.secs); } }
    const z = this.zoneAt(this.pos.x, this.pos.y); if (z !== this.zoneName) { this.zoneName = z; if (z) hud.zone(z); }
    if (st.grove === 0 && z === 'Grove Street') { st.grove = 1; this.groveT = 0; hud.subtitle(GROVE_LINES[0], 4); audio.say?.('cj', GROVE_LINES[0]); }
    else if (st.grove === 1) { this.groveT += dt; if (this.groveT >= 4) { st.grove = 2; hud.subtitle(GROVE_LINES[1], 4); audio.say?.('cj', GROVE_LINES[1]); } }
    if (Math.hypot(this.pos.x - this.marker.x, this.pos.y - this.marker.y) <= MARKER_R) this.startEnding();
  }
  showHelp(text, secs, next = null) { this.ctx.hud.help(text); this.helpT = secs; this.helpNext = next; }
  // The smallest zone box around the point (Grove Street sits inside Ganton); null between zones.
  zoneAt(x, y) {
    let best = null, area = Infinity;
    for (const z of this.map?.zones || []) {
      const x0 = Math.min(z.x0, z.x1), x1 = Math.max(z.x0, z.x1), y0 = Math.min(z.y0, z.y1), y1 = Math.max(z.y0, z.y1);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue; const a = (x1 - x0) * (y1 - y0); if (a < area) { area = a; best = z.name; }
    }
    return best;
  }
  // Ground height: the world's if it has one, else the set's, else the slope between the alley (22.94) and the cul-de-sac (12.9).
  groundZ(x, y) {
    const w = this.ctx.world, s = w.current;
    for (const o of [w, s]) for (const k of ['groundZ', 'height', 'groundHeight']) { if (typeof o?.[k] !== 'function') continue; const z = safe(() => o[k](x, y)); if (Number.isFinite(z)) return z; }
    const a = this.alley, m = this.marker; if (!a || !m || a.y === m.y) return a?.z ?? 0;
    return a.z + (m.z - a.z) * clamp((y - a.y) / (m.y - a.y), 0, 1);
  }
  // The marker: fade to black over a second, then the mission title over black for three seconds, then done (eject).
  startEnding() {
    if (this.ending >= 0) return; this.ending = 0; const { app, hud, audio } = this.ctx;
    app.fade(1, 1.0); hud.help(''); hud.subtitle(''); this.helpT = -1; audio.stopLoop?.('street', 1);
    if (this.riding) this.cj.play?.('pedal', { speed: 0 }); else this.playClip('idle', 1);
  }
  endStep(dt) {
    const was = this.ending; this.ending += dt; const { app, hud, world } = this.ctx; world.update?.(dt); hud.update?.(dt);
    if (was < 1 && this.ending >= 1) { this.black.hidden = false; app.fade(0, 0); hud.showHud(false, 0); hud.missionTitle(MISSION); }
    if (this.ending >= 4) { app.fade(1, 0); return true; }
    return false;
  }

  // --- camera, radar, clock ---
  updateCamera(dt, snap = false) {
    const c = this.riding ? CAM.bike : CAM.foot, target = this.riding ? this.bikeHeading : this.heading, base = this.riding ? this.bikePos : this.pos;
    const moving = this.riding ? Math.abs(this.bikeSpeed) > 0.3 : this.speed > 0.2;
    if (snap) this.camYaw = target; else if (moving || this.mountT >= 0) this.camYaw = wrapDeg(this.camYaw + wrapDeg(target - this.camYaw) * (1 - Math.exp(-c.lag * dt)));
    // Walls: sample the boom from the player outward and stop short of the first blocked point.
    const yaw = this.camYaw * D2R, sx = Math.sin(yaw), sy = -Math.cos(yaw), ok = (x, y) => this.ctx.world.walkable?.(x, y) !== false;
    let back = c.back; for (let d = CAM_MIN; d < c.back; d += 0.5) { if (!ok(base.x + sx * d, base.y + sy * d)) { back = Math.max(CAM_MIN, d - 0.5); break; } }
    const px = base.x + sx * back, py = base.y + sy * back, pz = Math.max(base.z + c.up * (0.6 + 0.4 * back / c.back), this.groundZ(px, py) + 0.6);
    this.cam = { pos: [px, py, pz], look: [base.x, base.y, base.z + c.look], fov: c.fov };
  }
  radar() {
    const blips = [{ type: 'cj', x: this.marker.x, y: this.marker.y }];   // the 'CJ' icon marks the hood from the start (ref-hVj4/t0204.50)
    if (!this.riding) blips.unshift({ type: 'bike', x: this.bikePos.x, y: this.bikePos.y });
    this.ctx.hud.radar?.({ x: this.pos.x, y: this.pos.y, heading: this.camYaw, blips, map: this.map });
  }
  clock() { const m = CLOCK.m + Math.floor(this.t); this.ctx.hud.setClock((CLOCK.h + Math.floor(m / 60)) % 24, m % 60); }
}
