// Persistent console state (localStorage): play history that drives the boot towers, and System Configuration settings.
const KEY = 'ps2-osd-state-v1';
const DEFAULTS = {
  boots: 0,
  // Play history: like the real console, each launched title gets a tower; height grows with plays (capped).
  history: [],
  settings: { clock: 'auto', screenSize: '4:3', digitalOut: 'On', componentOut: 'Y Cb/Pb Cr/Pr', remote: 'Gameplay Function On', language: 'English', timeZone: 'GMT', daylight: 'Standard', dateFormat: 'YYYY/MM/DD', timeFormat: '24-hour' },
};
export function loadState() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); return { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...(s.settings || {}) } }; } } catch (e) { /* private mode etc. */ }
  return structuredClone(DEFAULTS);
}
export function saveState(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
export function resetState() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } return structuredClone(DEFAULTS); }
