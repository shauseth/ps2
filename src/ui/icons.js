// Inline SVG glyphs for the PS2 controller buttons and OSD pictograms. Sized via CSS (height in cqh).
const NS = 'http://www.w3.org/2000/svg';
export const BUTTON = {
  cross: `<svg viewBox="0 0 24 24" class="btn cross"><circle cx="12" cy="12" r="11.2" fill="#0a0a0c"/><circle cx="12" cy="12" r="11.2" fill="none" stroke="#3a3b40" stroke-width="0.8"/><path d="M7.5 7.5 L16.5 16.5 M16.5 7.5 L7.5 16.5" fill="none" stroke="#8d9cf0" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" class="btn circle"><circle cx="12" cy="12" r="11.2" fill="#0a0a0c"/><circle cx="12" cy="12" r="11.2" fill="none" stroke="#3a3b40" stroke-width="0.8"/><circle cx="12" cy="12" r="5" fill="none" stroke="#f04a42" stroke-width="2.4"/></svg>`,
  triangle: `<svg viewBox="0 0 24 24" class="btn triangle"><circle cx="12" cy="12" r="11.2" fill="#0a0a0c"/><circle cx="12" cy="12" r="11.2" fill="none" stroke="#3a3b40" stroke-width="0.8"/><path d="M12 6.4 L17.6 16.4 L6.4 16.4 Z" fill="none" stroke="#3fcc6e" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  square: `<svg viewBox="0 0 24 24" class="btn square"><circle cx="12" cy="12" r="11.2" fill="#0a0a0c"/><circle cx="12" cy="12" r="11.2" fill="none" stroke="#3a3b40" stroke-width="0.8"/><rect x="7.2" y="7.2" width="9.6" height="9.6" fill="none" stroke="#f08ccc" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
};
// Small "sun-like" clock pictogram shown before the time in System Configuration.
export const CLOCK_ICON = `<svg viewBox="0 0 24 24" class="pict clock"><circle cx="12" cy="12" r="5.2" fill="none" stroke="#d8d8d8" stroke-width="1.6"/><path d="M12 8.5 V12 L14.5 13.5" fill="none" stroke="#d8d8d8" stroke-width="1.6" stroke-linecap="round"/><g stroke="#d8d8d8" stroke-width="1.6" stroke-linecap="round"><path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M5.3 18.7 L6.7 17.3 M17.3 6.7 L18.7 5.3"/></g></svg>`;
// Up/down stacked arrows shown beside an editable item, and left/right arrows around a value.
export const ARROWS_UD = `<svg viewBox="0 0 16 24" class="pict arrows-ud"><path d="M8 3 L13 9 H3 Z" fill="#8c8c8c"/><path d="M8 21 L3 15 H13 Z" fill="#8c8c8c"/></svg>`;
export const ARROW_L = `<svg viewBox="0 0 12 20" class="pict arrow-l"><path d="M10 2 L2 10 L10 18 Z" fill="#9a9a9a"/></svg>`;
export const ARROW_R = `<svg viewBox="0 0 12 20" class="pict arrow-r"><path d="M2 2 L10 10 L2 18 Z" fill="#9a9a9a"/></svg>`;
export const ARROW_DOWN = `<svg viewBox="0 0 20 12" class="pict arrow-down"><path d="M2 2 L10 10 L18 2 Z" fill="#5a7ae0"/></svg>`;
export const ARROW_UP = `<svg viewBox="0 0 20 12" class="pict arrow-up"><path d="M2 10 L10 2 L18 10 Z" fill="#5a7ae0"/></svg>`;
// The ghosted "PS2" mark at the top-left of the Browser (outline text, drawn as SVG so it is font-independent).
export const PS2_GHOST = `<svg viewBox="0 0 60 26" class="pict ps2ghost"><text x="1" y="21" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22" fill="none" stroke="#9a9a96" stroke-width="0.8" letter-spacing="0.5">PS2</text></svg>`;
export function svg(str) { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstChild; }
