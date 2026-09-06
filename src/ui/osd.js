// The OSD screen stack. Layout numbers are percentages of the 4:3 picture measured from reference captures
// (research/frames-menu-screens.md, typography.md); every screen owns a DOM subtree inside #ui.
import { el, clear } from './overlay.js';
import { BUTTON, CLOCK_ICON, ARROWS_UD, ARROW_L, ARROW_R, ARROW_DOWN, ARROW_UP, PS2_GHOST, svg } from './icons.js';
import { tr, LANG_NAMES } from './strings.js';
import { icon3d } from './icon3d.js';
import { CARDS } from '../content.js';
const cardLabel = (slot) => `Memory Card (${CARDS[slot].tag})/${slot + 1}`;

const pad2 = (n) => String(n).padStart(2, '0');
export function fmtDate(d, fmt = 'YYYY/MM/DD') {
  const y = d.getFullYear(), m = pad2(d.getMonth() + 1), dd = pad2(d.getDate());
  return fmt === 'MM/DD/YYYY' ? `${m}/${dd}/${y}` : fmt === 'DD/MM/YYYY' ? `${dd}/${m}/${y}` : `${y}/${m}/${dd}`;
}
export function fmtTime(d, fmt = '24-hour') {
  if (fmt === '12-hour') { const h = d.getHours() % 12 || 12; return { text: `${String(h).padStart(2, ' ')}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, ampm: d.getHours() < 12 ? 'AM' : 'PM' }; }
  return { text: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, ampm: '' };
}
export function fmtStamp(osd, stamp) { const m = stamp.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})/); const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : new Date(stamp); const s = osd.app.console.settings; const t = fmtTime(d, s.timeFormat); return `${fmtDate(d, s.dateFormat)}\u00a0\u00a0${t.text}${t.ampm ? '\u00a0' + t.ampm : ''}`; }
function label(text) { const b = el('span'); const m = text.match(/^(.*?)(\((?:PS2|[A-Z]{2,9})\))(.*)$/); if (!m) { b.textContent = text; return b; } b.append(m[1], el('span', 'small', m[2]), m[3]); return b; }
let hintInput = null; // set by Screen so the button hints can fire presses when clicked/tapped
function hints(list) {
  const row = el('div', 'osd-hints');
  for (const [btn, text] of list) { const h = el('span', 'hint clickable'); h.dataset.btn = btn; h.appendChild(svg(BUTTON[btn])); h.appendChild(el('span', 'hint-label', text)); h.addEventListener('click', () => hintInput?.press(btn, 'pointer')); row.appendChild(h); }
  return row;
}
function iconEl(sv, cls = 'save-icon') { return icon3d(sv.icon, cls); }
const step = (list, cur, dir) => { const n = cur + dir; return n >= 0 && n < list.length ? n : cur; };

class Screen {
  constructor(osd) { this.osd = osd; this.root = el('div', 'screen'); this.t = 0; hintInput = osd.app.input; }
  mount() { this.osd.app.ui.appendChild(this.root); }
  unmount() { this.root.remove(); }
  update(dt) { this.t += dt; }
  press() {}
}

// ---------------- Main menu ----------------
export class MainMenu extends Screen {
  constructor(osd, { sel = 0 } = {}) {
    super(osd); this.root.className = 'screen main-menu';
    this.items = ['resume', 'system configuration']; this.sel = sel;
    this.list = el('div', 'menu-list');
    this.els = this.items.map((t, i) => { const e = el('div', 'menu-item clickable', t); e.addEventListener('click', () => { if (this.sel !== i) { this.sel = i; this.osd.sfx('tick'); this.draw(); } else this.osd.app.input.press('cross', 'pointer'); }); this.list.appendChild(e); return e; });
    this.root.appendChild(this.list); this.root.appendChild(hints([['cross', 'Enter'], ['triangle', 'Version']])); this.draw();
  }
  draw() { this.els.forEach((e, i) => e.classList.toggle('selected', i === this.sel)); }
  press(b) {
    if (b === 'up' || b === 'down') { const n = step(this.items, this.sel, b === 'down' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'cross') { this.osd.sfx('confirm'); if (this.sel === 0) this.osd.enterBrowser(); else this.osd.push('config'); }
    else if (b === 'triangle') { this.osd.sfx('confirm'); this.osd.push('version'); }
  }
}

// ---------------- Version Information ----------------
const VERSION_ROWS = [['Console', (o) => o.model.console, null], ['Browser', (o) => o.model.browser, null], ['CD Player', (o) => o.model.cdPlayer, null], ['PlayStation® Driver', (o) => o.model.psDriver, 'psDriver'], ['DVD Player', (o) => o.model.dvdPlayer, 'dvdPlayer'], ['MAC Address', (o) => o.model.mac, null]];
export class VersionInfo extends Screen {
  constructor(osd, { sel = 0 } = {}) {
    super(osd); this.root.className = 'screen version'; this.sel = sel;
    this.root.appendChild(el('div', 'title', 'Version Information'));
    this.table = el('div', 'vtable'); this.root.appendChild(this.table);
    this.rows = VERSION_ROWS.filter(([, val]) => val(osd)).map(([lab, val, sub]) => { const r = el('div', 'vrow'); const l = el('span', 'vlabel', lab); const v = el('span', 'vvalue', val(osd)); r.append(l, v); this.table.appendChild(r); return { r, l, v, sub }; });
    this.hintsA = hints([['circle', 'Back']]); this.hintsB = hints([['circle', 'Back'], ['triangle', 'Options']]); this.root.append(this.hintsA, this.hintsB); this.draw();
  }
  draw() { this.rows.forEach((row, i) => row.r.classList.toggle('selected', i === this.sel)); const sub = !!this.rows[this.sel].sub; this.hintsA.hidden = sub; this.hintsB.hidden = !sub; }
  press(b) {
    if (b === 'up' || b === 'down') { const n = step(this.rows, this.sel, b === 'down' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'circle') { this.osd.sfx('cancel'); this.osd.pop(); }
    else if ((b === 'cross' || b === 'triangle') && this.rows[this.sel].sub) { this.osd.sfx('confirm'); this.osd.push(this.rows[this.sel].sub); }
  }
}
class OptionList extends Screen {
  constructor(osd, title, options, { cls = 'screen version optlist', hintList = [['cross', 'Enter'], ['circle', 'Back']] } = {}) {
    super(osd); this.root.className = cls;
    this.root.appendChild(el('div', 'title', title));
    this.options = options; this.sel = 0; this.editing = false;
    this.table = el('div', 'vtable'); this.root.appendChild(this.table);
    this.rows = options.map((o) => { const r = el('div', 'vrow'); const l = el('span', 'vlabel', o.label); const v = el('span', 'vvalue'); r.append(l, v); this.table.appendChild(r); return { r, l, v, o }; });
    this.root.appendChild(hints(hintList)); this.draw();
  }
  draw() {
    this.rows.forEach((row, i) => {
      row.r.classList.toggle('selected', i === this.sel); clear(row.v);
      if (this.editing && i === this.sel) { row.v.classList.add('stack'); row.o.values.forEach((val, k) => { const s = el('span', 'choice', val); s.classList.toggle('selected', k === row.o.idx); row.v.appendChild(s); }); }
      else { row.v.classList.remove('stack'); row.v.textContent = row.o.values[row.o.idx]; }
    });
  }
  press(b) {
    const row = this.rows[this.sel];
    if (this.editing) {
      if (b === 'up' || b === 'down') { const n = step(row.o.values, row.o.idx, b === 'down' ? 1 : -1); if (n !== row.o.idx) { row.o.idx = n; this.osd.sfx('tick'); this.draw(); } }
      else if (b === 'cross') { this.editing = false; this.osd.sfx('tick'); row.o.onChange?.(row.o.values[row.o.idx]); this.draw(); }
      else if (b === 'circle') { this.editing = false; this.osd.sfx('cancel'); this.draw(); }
      return;
    }
    if (b === 'up' || b === 'down') { const n = step(this.rows, this.sel, b === 'down' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'cross') { this.editing = true; this.osd.sfx('confirm'); this.draw(); }
    else if (b === 'circle') { this.osd.sfx('cancel'); this.osd.pop(); }
  }
}
export class PSDriver extends OptionList { constructor(osd) { super(osd, 'PlayStation® Driver', [{ label: 'Disc Speed', values: ['Standard', 'Fast'], idx: 0 }, { label: 'Texture Mapping', values: ['Standard', 'Smooth'], idx: 0 }]); } }
export class DVDPlayer extends OptionList { constructor(osd) { super(osd, 'DVD Player', [{ label: 'Clear Progressive Setting', values: ['No', 'Yes'], idx: 0 }]); } }

// ---------------- System Configuration ----------------
export class SystemConfig extends Screen {
  constructor(osd, { sel = 0 } = {}) {
    super(osd); this.root.className = 'screen config';
    const s = osd.app.console.settings; this.s = s;
    this.items = [
      { kind: 'clock' },
      { values: ['4:3', 'Full', '16:9'], get: () => s.screenSize, set: (v) => { s.screenSize = v; osd.app.applyScreenSize(v); }, row: true },
      { values: ['On', 'Off'], get: () => s.digitalOut, set: (v) => { s.digitalOut = v; }, row: true },
      { values: ['Y Cb/Pb Cr/Pr', 'RGB'], get: () => s.componentOut, set: (v) => { s.componentOut = v; }, row: true },
      { values: ['Gameplay Function On', 'Gameplay Function Off'], get: () => s.remote, set: (v) => { s.remote = v; }, row: false },
      { kind: 'lang', values: LANG_NAMES, get: () => s.language, set: (v) => { s.language = v; }, row: false },
    ];
    this.sel = sel; this.editing = false; this.display = true; this.fade = 0;
    this.top = el('div', 'config-top'); this.date = el('span', 'date'); this.time = el('span', 'time'); this.time.appendChild(svg(CLOCK_ICON)); this.timeText = el('span', 'time-text'); this.ampm = el('span', 'ampm'); this.time.append(this.timeText, this.ampm); this.top.append(this.date, this.time); this.root.appendChild(this.top);
    this.body = el('div', 'config-body'); this.title = el('div', 'title'); this.item = el('div', 'config-item'); this.itemText = el('span', 'config-item-text'); this.arrows = svg(ARROWS_UD); this.item.append(this.itemText, this.arrows); this.value = el('div', 'config-value');
    this.body.append(this.title, this.item, this.value); this.root.appendChild(this.body);
    this.hintRow = el('div'); this.root.appendChild(this.hintRow);
    this.draw();
  }
  get L() { return tr(this.s.language); }
  draw() {
    const it = this.items[this.sel], L = this.L;
    this.title.textContent = L.title; this.itemText.textContent = L.items[this.sel];
    clear(this.value);
    if (it.kind === 'clock') { this.clockVal = el('span', 'clock-value'); this.value.appendChild(this.clockVal); this.updateClock(); }
    else if (this.editing) {
      if (it.row) it.values.forEach((v) => { const c = el('span', 'choice', v); c.classList.toggle('selected', v === it.get()); this.value.appendChild(c); });
      else { const idx = it.values.indexOf(it.get()); const shown = it.kind === 'lang' ? L.langs[idx] : it.get(); this.value.append(svg(ARROW_L), el('span', 'choice selected', shown), svg(ARROW_R)); }
    } else { const idx = it.values.indexOf(it.get()); this.value.textContent = it.kind === 'lang' ? L.langs[idx] : it.get(); }
    this.arrows.style.visibility = this.editing ? 'hidden' : 'visible';
    clear(this.hintRow);
    const list = this.editing ? [['cross', L.enter], ['circle', L.back]] : [['square', L.display], ['cross', L.enter], ['circle', L.back]];
    if (!this.editing && (this.sel === 0 || this.sel === 1)) list.push(['triangle', L.options]);
    this.hintRow.appendChild(hints(this.display ? list : [['square', L.display]]));
    this.body.hidden = !this.display; this.item.classList.toggle('editing', this.editing);
  }
  updateClock() { const d = this.osd.now(); const t = fmtTime(d, this.s.timeFormat); this.date.textContent = fmtDate(d, this.s.dateFormat); this.timeText.textContent = t.text; this.ampm.textContent = t.ampm; if (this.clockVal) this.clockVal.textContent = `${fmtDate(d, this.s.dateFormat)}\u00a0\u00a0${t.text}${t.ampm ? '\u00a0' + t.ampm : ''}`; }
  update(dt) { super.update(dt); this.updateClock(); if (this.fade > 0) { this.fade -= dt; this.body.style.opacity = String(1 - Math.max(0, this.fade) / 0.33); } }
  crossfade() { this.fade = 0.33; this.body.style.opacity = '0'; }
  press(b) {
    const it = this.items[this.sel];
    if (b === 'square') { this.display = !this.display; this.osd.sfx(this.display ? 'exitSub' : 'enterSub'); this.osd.setMode(this.display ? 'list' : 'display'); this.draw(); return; }
    if (!this.display) return;
    if (this.editing) {
      if (b === 'left' || b === 'right' || ((b === 'up' || b === 'down') && !it.row)) {
        const dir = (b === 'right' || b === 'down') ? 1 : -1; const n = step(it.values, it.values.indexOf(it.get()), dir);
        if (it.values[n] !== it.get()) { it.set(it.values[n]); this.osd.sfx('tick'); this.draw(); }
      } else if (b === 'cross') { this.editing = false; this.osd.sfx('tick'); this.osd.saveSettings(); this.draw(); }
      else if (b === 'circle') { this.editing = false; this.osd.sfx('cancel'); this.draw(); }
      return;
    }
    if (b === 'up' || b === 'down') { const n = step(this.items, this.sel, b === 'down' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('scroll'); this.osd.app.scenes.menu.setSelectedItem(n); this.crossfade(); this.draw(); } }
    else if (b === 'cross') { if (it.kind === 'clock') { this.osd.sfx('tick'); this.osd.push('clockAdjust'); } else { this.editing = true; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'circle') { this.osd.sfx('cancel'); this.osd.pop(); }
    else if (b === 'triangle' && (this.sel === 0 || this.sel === 1)) { this.osd.sfx('confirm'); this.osd.push('clockOptions'); }
  }
}
// Clock Adjustment: fields MM DD YYYY h mm ss (order follows the date format), edited field cyan, wrap-around values.
export class ClockAdjust extends Screen {
  constructor(osd) {
    super(osd); this.root.className = 'screen config'; const s = osd.app.console.settings; this.s = s;
    this.top = el('div', 'config-top'); this.date = el('span', 'date'); this.time = el('span', 'time'); this.time.appendChild(svg(CLOCK_ICON)); this.timeText = el('span', 'time-text'); this.ampm = el('span', 'ampm'); this.time.append(this.timeText, this.ampm); this.top.append(this.date, this.time); this.root.appendChild(this.top);
    this.body = el('div', 'config-body'); this.body.appendChild(el('div', 'title', tr(s.language).title));
    const item = el('div', 'config-item editing'); item.appendChild(el('span', 'config-item-text', tr(s.language).items[0])); this.body.appendChild(item);
    this.value = el('div', 'config-value fields'); this.body.appendChild(this.value); this.root.appendChild(this.body);
    this.root.appendChild(hints([['cross', tr(s.language).enter], ['circle', tr(s.language).back]]));
    const d = osd.now(); this.f = { Y: d.getFullYear(), M: d.getMonth() + 1, D: d.getDate(), h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
    this.order = (s.dateFormat === 'MM/DD/YYYY' ? ['M', 'D', 'Y'] : s.dateFormat === 'DD/MM/YYYY' ? ['D', 'M', 'Y'] : ['Y', 'M', 'D']).concat(['h', 'm', 's']);
    this.sel = 0; this.draw();
  }
  draw() {
    clear(this.value); const f = this.f; const twelve = this.s.timeFormat === '12-hour';
    const show = (k) => k === 'Y' ? String(f.Y) : k === 'h' ? (twelve ? String(f.h % 12 || 12).padStart(2, ' ') : pad2(f.h)) : pad2(f[k]);
    const seps = { 0: '/', 1: '/', 2: '\u00a0\u00a0', 3: ':', 4: ':' };
    this.order.forEach((k, i) => { this.value.appendChild(el('span', i === this.sel ? 'field selected' : 'field', show(k))); if (seps[i] != null) this.value.appendChild(el('span', 'field sep', seps[i])); });
    if (twelve) this.value.appendChild(el('span', 'field small', ' ' + (f.h < 12 ? 'AM' : 'PM')));
  }
  update(dt) { super.update(dt); const d = this.osd.now(); const t = fmtTime(d, this.s.timeFormat); this.date.textContent = fmtDate(d, this.s.dateFormat); this.timeText.textContent = t.text; this.ampm.textContent = t.ampm; }
  press(b) {
    const k = this.order[this.sel]; const max = { Y: 2099, M: 12, D: 31, h: 23, m: 59, s: 59 }, min = { Y: 2000, M: 1, D: 1, h: 0, m: 0, s: 0 };
    if (b === 'left' || b === 'right') { const n = step(this.order, this.sel, b === 'right' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'up' || b === 'down') { let v = this.f[k] + (b === 'up' ? 1 : -1); if (v > max[k]) v = min[k]; if (v < min[k]) v = max[k]; this.f[k] = v; this.osd.sfx('tick'); this.draw(); }
    else if (b === 'cross') { const f = this.f; this.osd.setClock(new Date(f.Y, f.M - 1, f.D, f.h, f.m, f.s)); this.osd.sfx('tick'); this.osd.pop(); }
    else if (b === 'circle') { this.osd.sfx('cancel'); this.osd.pop(); }
  }
}
const ZONES = [['United States / Pacific', 'GMT -8:00', 'GMT-8'], ['United States / Eastern', 'GMT -5:00', 'GMT-5'], ['United Kingdom', 'GMT +0:00', 'GMT'], ['France', 'GMT +1:00', 'GMT+1'], ['Japan', 'GMT +9:00', 'GMT+9']];
export class ClockOptions extends OptionList {
  constructor(osd) {
    const s = osd.app.console.settings; const L = tr(s.language);
    super(osd, 'Options', [
      { label: 'Time Format', values: ['12 hour clock', '24 hour clock'], idx: s.timeFormat === '12-hour' ? 0 : 1, onChange: (v) => { s.timeFormat = v.startsWith('12') ? '12-hour' : '24-hour'; osd.saveSettings(); } },
      { label: 'Date Format', values: ['YYYY/MM/DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], idx: Math.max(0, ['YYYY/MM/DD', 'MM/DD/YYYY', 'DD/MM/YYYY'].indexOf(s.dateFormat)), onChange: (v) => { s.dateFormat = v; osd.saveSettings(); } },
      { label: 'Time Zone', values: ZONES.map(z => `${z[0]}\n${z[1]}`), idx: Math.max(0, ZONES.findIndex(z => z[2] === s.timeZone)), onChange: (v) => { s.timeZone = ZONES.find(z => v.startsWith(z[0]))[2]; osd.saveSettings(); } },
      { label: 'Daylight Savings Time\n(Summer Time)', values: ['Standard (Winter Time)', 'Daylight Savings (Summer Time)'], idx: s.daylight === 'Daylight' ? 1 : 0, onChange: (v) => { s.daylight = v.startsWith('Daylight') ? 'Daylight' : 'Standard'; osd.saveSettings(); } },
    ], { cls: 'screen config config-options', hintList: [['cross', L.enter], ['circle', L.back]] });
    this.s = s;
    this.top = el('div', 'config-top'); this.date = el('span', 'date'); this.time = el('span', 'time'); this.time.appendChild(svg(CLOCK_ICON)); this.timeText = el('span', 'time-text'); this.ampm = el('span', 'ampm'); this.time.append(this.timeText, this.ampm); this.top.append(this.date, this.time); this.root.appendChild(this.top);
  }
  draw() {
    // one item at a time, like the main list: name (cyan) + value (white) under the title
    if (!this.item) { this.table.remove(); this.body = el('div', 'config-body'); this.item = el('div', 'config-item'); this.itemText = el('span', 'config-item-text'); this.arrows = svg(ARROWS_UD); this.item.append(this.itemText, this.arrows); this.value = el('div', 'config-value'); this.body.append(this.item, this.value); this.root.appendChild(this.body); this.root.querySelector('.title').remove(); this.body.prepend(el('div', 'title', 'Options')); }
    const o = this.options[this.sel]; this.itemText.textContent = o.label; clear(this.value);
    if (this.editing) this.value.append(svg(ARROW_L), el('span', 'choice selected', o.values[o.idx]), svg(ARROW_R)); else this.value.textContent = o.values[o.idx];
    this.arrows.style.visibility = this.editing ? 'hidden' : 'visible';
  }
  update(dt) { super.update(dt); const d = this.osd.now(); const t = fmtTime(d, this.s.timeFormat); this.date.textContent = fmtDate(d, this.s.dateFormat); this.timeText.textContent = t.text; this.ampm.textContent = t.ampm; }
  press(b) {
    const o = this.options[this.sel];
    if (this.editing) {
      if (b === 'left' || b === 'right' || b === 'up' || b === 'down') { const n = step(o.values, o.idx, (b === 'right' || b === 'down') ? 1 : -1); if (n !== o.idx) { o.idx = n; o.onChange?.(o.values[n]); this.osd.sfx('tick'); this.draw(); } }
      else if (b === 'cross') { this.editing = false; this.osd.sfx('tick'); this.draw(); }
      else if (b === 'circle') { this.editing = false; this.osd.sfx('cancel'); this.draw(); }
      return;
    }
    if (b === 'up' || b === 'down') { const n = step(this.options, this.sel, b === 'down' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('scroll'); this.draw(); } }
    else if (b === 'cross') { this.editing = true; this.osd.sfx('tick'); this.draw(); }
    else if (b === 'circle') { this.osd.sfx('cancel'); this.osd.pop(); }
  }
}

// ---------------- Browser ----------------
export class Browser extends Screen {
  constructor(osd, { sel = 0, fadeIn = true } = {}) {
    super(osd); this.root.className = 'screen browser';
    this.root.appendChild(svg(PS2_GHOST));
    this.label = el('div', 'browser-label'); this.root.appendChild(this.label);
    this.n = CARDS.length; // the disc is index n
    this.slots = CARDS.map((c, i) => { const s = el('div', 'mc-slot clickable'); s.dataset.slot = String(i); s.addEventListener('click', () => { if (this.sel !== i) { this.sel = i; this.osd.sfx('tick'); this.draw(); } else this.osd.app.input.press('cross', 'pointer'); }); s.appendChild(el('div', 'mc-glow')); for (const f of ['mc-top', 'mc-bottom', 'mc-left', 'mc-right']) s.appendChild(el('div', 'mc-face ' + f)); this.root.appendChild(s); return s; });
    this.disc = el('div', 'disc-icon clickable'); this.disc.appendChild(el('div', 'mc-glow')); this.disc.addEventListener('click', () => { if (this.sel !== this.n) { this.sel = this.n; this.osd.sfx('tick'); this.draw(); } else this.osd.app.input.press('cross', 'pointer'); }); this.root.appendChild(this.disc);
    this.hintEl = hints([['cross', 'Enter'], ['circle', 'Back']]); this.root.appendChild(this.hintEl);
    this.sel = sel; this.flip = 0; if (fadeIn) { this.root.classList.add('fade-in'); }
    this.draw();
  }
  get hasDisc() { return !!this.osd.app.console.disc; }
  draw() {
    const n = this.n; if (this.sel > n || (this.sel === n && !this.hasDisc)) this.sel = 0;
    this.slots.forEach((s, i) => s.classList.toggle('selected', i === this.sel)); this.disc.hidden = !this.hasDisc; this.disc.classList.toggle('selected', this.sel === n);
    this.root.classList.toggle('with-disc', this.hasDisc);
    clear(this.label); this.label.appendChild(this.sel === n ? label('PersonalStation®2 DISC') : label(cardLabel(this.sel)));
  }
  update(dt) { super.update(dt); const g = 0.85 + 0.15 * Math.sin(this.t * 2 * Math.PI / 3); this.root.style.setProperty('--breathe', g.toFixed(3)); if (this.flip > 0) { this.flip -= dt; } }
  press(b) {
    if (this.flip > 0) return;
    const n = this.n;
    if (b === 'left' || b === 'right') { if (this.sel === n) return; const s = this.sel + (b === 'right' ? 1 : -1); if (s >= 0 && s < n) { this.sel = s; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'up' || b === 'down') { if (!this.hasDisc) return; const s = b === 'down' ? n : (this.sel === n ? this.lastCard || 0 : this.sel); if (s !== this.sel) { if (this.sel < n) this.lastCard = this.sel; this.sel = s; this.osd.sfx('tick'); this.draw(); } }
    else if (b === 'cross') {
      if (this.sel === n) { this.osd.sfx('confirm'); this.osd.bootDisc(); }
      else { this.osd.sfx('memcard'); this.flip = 0.4; this.slots[this.sel].classList.add('flip'); this.root.classList.add('flipping'); const slot = this.sel; this.osd.after(0.35, () => this.osd.push('memoryCard', { slot })); }
    }
    else if (b === 'circle') { this.osd.leaveBrowser(); }
  }
}
// Memory card contents: icons pop in one by one while "Loading..." shows.
export class MemoryCard extends Screen {
  constructor(osd, { slot = 0, sel = 0, scroll = 0, loaded = false } = {}) {
    super(osd); this.root.className = 'screen memcard'; this.slot = slot; this.saves = osd.app.console.cards[slot];
    this.head = el('div', 'mc-head'); this.headTitle = el('div', 'browser-label'); this.headFree = el('div', 'mc-free'); this.head.append(this.headTitle, this.headFree); this.root.appendChild(this.head);
    this.root.appendChild(el('div', 'mc-icon-slot'));
    this.saveTitle = el('div', 'save-title'); this.root.appendChild(this.saveTitle);
    this.grid = el('div', 'save-grid'); this.root.appendChild(this.grid);
    this.loading = el('div', 'loading', 'Loading...'); this.root.appendChild(this.loading);
    this.up = svg(ARROW_UP); this.down = svg(ARROW_DOWN); this.root.append(this.up, this.down);
    this.sel = sel; this.cols = 5; this.rowsVisible = 3; this.scroll = scroll;
    this.hintsFull = hints([['cross', 'Enter'], ['circle', 'Back'], ['triangle', 'Options']]); this.hintsLoad = hints([['circle', 'Back']]); this.root.append(this.hintsFull, this.hintsLoad);
    this.rows = []; for (let i = 0; i < this.saves.length; i += this.cols) this.rows.push(this.saves.slice(i, i + this.cols));
    this.cells = []; this.rows.forEach((row, r) => { const rowEl = el('div', 'save-row'); rowEl.style.setProperty('--n', String(row.length)); this.grid.appendChild(rowEl); row.forEach((sv, k) => { const i = r * this.cols + k; const c = el('div', 'save-cell clickable'); c.appendChild(el('div', 'save-glow')); c.appendChild(iconEl(sv)); c.style.setProperty('--k', String(k)); c.addEventListener('click', () => { if (this.sel !== i) { this.sel = i; this.osd.sfx('tick'); this.draw(); } else this.osd.app.input.press('cross', 'pointer'); }); rowEl.appendChild(c); this.cells.push(c); }); });
    // pop-in schedule: header at +0.5 s, icons from +0.45 s, 0.1-0.6 s apart, each scaling up over 0.3 s
    const rnd = () => 0.1 + Math.random() * 0.3; let t = 0.45; this.popAt = this.saves.map(() => { const at = t; t += rnd(); return at; }); this.doneAt = loaded ? 0 : t + 0.3;
    if (loaded) { this.t = 99; } this.draw();
  }
  get loaded() { return this.t >= this.doneAt; }
  draw() {
    const free = this.osd.freeKB(this.slot);
    clear(this.headTitle); this.headTitle.appendChild(label(cardLabel(this.slot))); this.headFree.textContent = `${free.toLocaleString('en-US')} KB Free`;
    this.head.style.opacity = this.t > 0.5 ? '1' : '0';
    this.loading.hidden = this.loaded || this.t < 0.5; this.hintsFull.hidden = !this.loaded; this.hintsLoad.hidden = this.loaded;
    this.cells.forEach((c, i) => { const k = Math.min(1, Math.max(0, (this.t - this.popAt[i]) / 0.3)); c.style.setProperty('--pop', String(k)); c.classList.toggle('selected', i === this.sel && this.t > 0.8); });
    const row = Math.floor(this.sel / this.cols); if (row < this.scroll) this.scroll = row; if (row >= this.scroll + this.rowsVisible) this.scroll = row - this.rowsVisible + 1;
    this.grid.style.setProperty('--scroll', String(this.scroll));
    this.up.style.visibility = this.scroll > 0 ? 'visible' : 'hidden'; this.down.style.visibility = this.scroll + this.rowsVisible < this.rows.length ? 'visible' : 'hidden';
    const sv = this.saves[this.sel]; this.saveTitle.textContent = sv && this.t > 0.4 ? sv.title.join('\n') : '';
  }
  update(dt) { super.update(dt); if (this.t < this.doneAt + 0.5) this.draw(); }
  press(b) {
    if (!this.loaded) { if (b === 'circle') this.osd.leaveCard(this); return; }
    const n = this.saves.length; if (!n) { if (b === 'circle') this.osd.leaveCard(this); return; }
    let s = this.sel;
    if (b === 'left') s = Math.max(0, s - 1); else if (b === 'right') s = Math.min(n - 1, s + 1); else if (b === 'up') s = s - this.cols >= 0 ? s - this.cols : s; else if (b === 'down') s = s + this.cols < n ? s + this.cols : s;
    if (s !== this.sel) { this.sel = s; this.osd.sfx('tick'); this.draw(); return; }
    if (b === 'cross') { this.osd.sfx('confirm'); this.osd.push('saveOptions', { slot: this.slot, index: this.sel }); }
    else if (b === 'triangle') { this.osd.sfx('confirm'); this.osd.push('saveInfo', { slot: this.slot, index: this.sel }); }
    else if (b === 'circle') this.osd.leaveCard(this);
  }
}
// The dimmed icon grid that stays behind a save's own page.
function ghostGrid(osd, slot, index) {
  const g = el('div', 'ghost-grid'); const saves = osd.app.console.cards[slot]; const cols = 5; const scroll = Math.max(0, Math.floor(index / cols) - 2);
  g.style.setProperty('--scroll', String(scroll));
  for (let i = 0; i < saves.length; i += cols) { const rowEl = el('div', 'save-row'); const row = saves.slice(i, i + cols); rowEl.style.setProperty('--n', String(row.length)); row.forEach((sv, k) => { const c = el('div', 'save-cell'); c.style.setProperty('--k', String(k)); c.style.setProperty('--pop', '1'); const ic = iconEl(sv); if (i + k === index) ic.style.visibility = 'hidden'; c.appendChild(ic); rowEl.appendChild(c); }); g.appendChild(rowEl); }
  return g;
}
// Save page: the save's own 4-corner background, its icon big on the left, the text column at 68 %, Copy / Delete,
// and the copy and delete flows exactly as the console words them.
export class SaveOptions extends Screen {
  constructor(osd, { slot, index }) {
    super(osd); this.root.className = 'screen save-page fade-in'; this.slot = slot; this.index = index;
    const sv = osd.app.console.cards[slot][index]; this.sv = sv; this.root.style.setProperty('--bg', sv.bg);
    this.root.appendChild(ghostGrid(osd, slot, index));
    this.big = iconEl(sv, 'save-icon big'); this.root.appendChild(this.big);
    this.info = el('div', 'save-info'); const info = this.info;
    info.appendChild(el('div', 'save-loc')).appendChild(label(cardLabel(slot)));
    this.nameEl = el('div', 'save-name'); this.nameEl.append(el('span', 'l1', sv.title[0]), el('span', 'l2', sv.title[1] || '')); info.appendChild(this.nameEl);
    info.appendChild(el('div', 'save-meta', fmtStamp(osd, sv.date)));
    info.appendChild(el('div', 'save-size', `${sv.stack ? sv.stack + ',   ' : ''}Size ${sv.sizeKB} KB`));
    this.desc = el('div', 'save-desc', (sv.desc || []).join(' ')); this.root.appendChild(this.desc);
    this.opts = (sv.link ? ['Open', 'Delete'] : ['Delete']).map((t, i) => { const o = el('div', 'save-opt', t); o.dataset.i = String(i); o.dataset.act = t; info.appendChild(o); return o; }); // no link, no Open
    this.arrow = el('div', 'copy-arrow', '↓'); this.target = el('div', 'copy-target'); this.targetFree = el('div', 'copy-free'); this.prompt = el('div', 'save-prompt'); this.sure = el('div', 'sure', 'Are you sure?'); this.yesno = el('div', 'yesno'); this.yes = el('span', 'save-opt yn', 'Yes'); this.no = el('span', 'save-opt yn', 'No'); this.yesno.append(this.yes, this.no);
    info.append(this.arrow, this.target, this.targetFree, this.sure, this.yesno); this.root.appendChild(info); this.root.appendChild(this.prompt);
    this.hintEl = el('div'); this.root.appendChild(this.hintEl);
    this.sel = 0; this.stage = 'menu'; this.yn = 1; this.busy = 0; this.draw();
  }
  get other() { return 1 - this.slot; }
  draw() {
    const st = this.stage; const show = (e, on) => { e.hidden = !on; };
    this.opts.forEach((o, i) => { o.classList.toggle('selected', st === 'menu' && i === this.sel); o.classList.toggle('heading', st !== 'menu' && i === this.sel); show(o, st === 'menu' || (i === this.sel && st !== 'confirm-copy' && st !== 'copying' && st !== 'done-delete')); });
    show(this.arrow, st === 'target'); show(this.target, st === 'target' || st === 'confirm-copy' || st === 'copying'); show(this.targetFree, st === 'target'); show(this.prompt, st === 'target' || st === 'copying' || st === 'deleting' || st === 'done-delete' || st === 'cannot' || st === 'opened');
    show(this.sure, st === 'confirm-copy' || st === 'confirm-delete' || st === 'copying' || st === 'deleting'); show(this.yesno, st === 'confirm-copy' || st === 'confirm-delete' || st === 'copying' || st === 'deleting');
    this.yes.classList.toggle('selected', this.yn === 0); this.no.classList.toggle('selected', this.yn === 1); this.yesno.classList.toggle('dim', st === 'copying' || st === 'deleting'); this.sure.classList.toggle('dim', st === 'copying' || st === 'deleting');
    clear(this.target);
    if (st === 'deleting') this.prompt.textContent = 'Deleting... Do not remove memory card device.';
    if (st === 'done-delete') this.prompt.textContent = 'Cannot delete. This one already happened.';
    if (st === 'cannot') this.prompt.textContent = 'Nothing to open here.';
    if (st === 'opened') this.prompt.textContent = 'Opened in a new tab.';
    show(this.big, st !== 'done-delete');
    clear(this.hintEl);
    if (st === 'copying' || st === 'deleting' || st === 'opened' || st === 'cannot') { /* no hints */ } else if (st === 'done-delete') this.hintEl.appendChild(hints([['circle', 'Back']])); else this.hintEl.appendChild(hints([['cross', 'Enter'], ['circle', 'Back']]));
  }
  update(dt) { super.update(dt); if (this.busy > 0) { this.busy -= dt; if (this.busy <= 0) this.finishBusy(); } }
  finishBusy() {
    if (this.stage === 'deleting') { this.stage = 'done-delete'; this.draw(); }           // nothing is ever deleted
    else if (this.stage === 'opened' || this.stage === 'cannot') { this.stage = 'menu'; this.draw(); }
  }
  press(b) {
    const st = this.stage; if (this.busy > 0) return;
    if (st === 'menu') {
      if (b === 'up' || b === 'down') { const n = step(this.opts, this.sel, b === 'down' ? 1 : -1); if (n !== this.sel) { this.sel = n; this.osd.sfx('tick'); this.draw(); } }
      else if (b === 'circle') { this.osd.sfx('cancel'); this.osd.pop(); }
      else if (b === 'cross') { this.osd.sfx('confirm'); this.yn = 1; if (this.opts[this.sel].dataset.act === 'Open') { this.osd.openLink(this.sv.link); this.stage = 'opened'; this.busy = 1.6; } else this.stage = 'confirm-delete'; this.draw(); }
    } else if (st === 'target') {
      if (b === 'cross') { this.osd.sfx('confirm'); this.stage = 'confirm-copy'; this.draw(); } else if (b === 'circle') { this.osd.sfx('cancel'); this.stage = 'menu'; this.draw(); } else if (b === 'left' || b === 'right') this.osd.sfx('tick');
    } else if (st === 'confirm-copy' || st === 'confirm-delete') {
      if (b === 'left' || b === 'right' || b === 'up' || b === 'down') { this.yn = 1 - this.yn; this.osd.sfx('tick'); this.draw(); }
      else if (b === 'circle') { this.osd.sfx('cancel'); this.stage = 'menu'; this.draw(); }
      else if (b === 'cross') { if (this.yn === 1) { this.osd.sfx('cancel'); this.stage = 'menu'; this.draw(); } else { this.osd.sfx(st === 'confirm-delete' ? 'delete' : 'confirm'); this.stage = st === 'confirm-copy' ? 'copying' : 'deleting'; this.busy = 2.5 + this.sv.sizeKB / 250; this.draw(); } }
    } else if (st === 'done-delete') { if (b === 'circle') { this.osd.sfx('cancel'); this.stage = 'menu'; this.sel = 0; this.draw(); } }
  }
}
// Triangle on a save: file information on the OSD's flat indigo background.
export class SaveInfo extends Screen {
  constructor(osd, { slot, index }) {
    super(osd); this.root.className = 'screen save-page info fade-in'; const sv = osd.app.console.cards[slot][index];
    this.root.appendChild(ghostGrid(osd, slot, index));
    this.root.appendChild(iconEl(sv, 'save-icon medium'));
    const box = el('div', 'info-box'); box.appendChild(el('div', 'save-name', sv.title.join('\n')));
    const rows = [['Location', label(cardLabel(slot))], ['File Type', `${CARDS[slot].name} Data (PersonalStation®2)`], ['File Size', `${sv.sizeKB} KB`], ['Last Updated', fmtStamp(osd, sv.date)], ['File Protection', 'Permanent']];
    for (const [k, v] of rows) { const r = el('div', 'info-row'); const vv = el('span', 'v'); if (typeof v === 'string') vv.textContent = v; else vv.appendChild(v); r.append(el('span', 'k', k), vv); box.appendChild(r); }
    this.root.appendChild(box); this.root.appendChild(hints([['circle', 'Back']]));
  }
  press(b) { if (b === 'circle' || b === 'triangle') { this.osd.sfx('cancel'); this.osd.pop(); } }
}
// PlayStation 2 logo: forms from blue-violet dust in 0.30 s, holds 2.15 s, hard cut.
export class LogoScreen extends Screen {
  constructor(osd) { super(osd); this.root.className = 'screen logo'; this.mark = el('div', 'ps2-wordmark'); this.mark.innerHTML = osd.wordmarkSVG(); this.root.appendChild(this.mark); this.dust = el('div', 'logo-dust'); for (let i = 0; i < 60; i++) { const p = el('span'); p.style.setProperty('--x', (Math.random() * 130 - 15).toFixed(1) + '%'); p.style.setProperty('--y', (Math.random() * 160 - 30).toFixed(1) + '%'); p.style.setProperty('--d', (Math.random() * 0.2).toFixed(2) + 's'); p.style.setProperty('--s', (0.4 + Math.random() * 1.2).toFixed(2)); this.dust.appendChild(p); } this.root.appendChild(this.dust); this.cut = false; }
  update(dt) { super.update(dt); const k = Math.min(1, Math.max(0, this.t / 0.30)); this.mark.style.setProperty('--form', String(k)); this.dust.style.setProperty('--form', String(k)); if (this.t > 0.30 + 2.15 && !this.cut) { this.cut = true; this.root.style.visibility = 'hidden'; this.osd.after(1.2, () => this.osd.afterLogo()); } }
  press() {}
}

export const SCREENS = { main: MainMenu, version: VersionInfo, psDriver: PSDriver, dvdPlayer: DVDPlayer, config: SystemConfig, clockAdjust: ClockAdjust, clockOptions: ClockOptions, browser: Browser, memoryCard: MemoryCard, saveOptions: SaveOptions, saveInfo: SaveInfo, logo: LogoScreen };
