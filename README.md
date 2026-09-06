# PlayStation 2 startup and menu, in a browser

A researched recreation of the PS2 boot sequence and the OSDSYS menus: the "Sony Computer Entertainment"
tower scene, the main menu with its seven orbs, System Configuration over the fog tunnel and crystal-rod clock,
Version Information, the Browser, memory-card screens and the PlayStation 2 logo. Everything is synthesized
at runtime (three.js + Web Audio); no Sony assets are shipped.

## Run

    node serve.mjs          # then open http://localhost:8000/

Any static file server works (the page is plain ES modules). Click, tap or press a key on the power screen
to boot; browsers require a gesture before audio may play.

## Controls

| Console button | Keyboard | Gamepad |
|---|---|---|
| D-pad | Arrow keys / WASD | D-pad, left stick |
| ✕ (Enter) | Enter, Space, X | Cross (button 0) |
| ○ (Back) | Escape, Backspace, C | Circle (button 1) |
| △ (Version / Options) | Tab, T | Triangle (button 3) |
| □ (Display) | Q | Square (button 2) |
| insert / eject a disc | I | Select |

The Browser and memory-card screens also respond to clicks and taps.

## What is faithful

- Boot: the retail camera state machine (drift, text armed at z 18, fly-up accelerations, roll), the 14x9 tower
  field generated from a 21-slot play history exactly as the console keeps it (your history grows every visit
  and is stored in localStorage), six additive fog layers, four comet lights, five refractive glass cubes,
  the 62.5 % frame feedback glow and the fly-up smear. No memory card (`?card=0`) shows the default scene.
- Menu: black main menu with the orbs; System Configuration with the fog tunnel calibrated to the measured
  radial profile, twelve hexagonal rods on the ROM geometry, the current hour lit, the rod hue cycling over
  21.9 s, the :15/:45 fold, the item cubes on the left, the live-localised text when you change Language.
- Text: TeX Gyre Heros (a Helvetica-metric clone, closest free match to rom0:FONTM) at the measured cap heights,
  baselines and colours; the button hints sit in their fixed columns.
- Sound: the startup chord, hum, sub layer, sparkle sweep, whoosh and logo ping re-synthesized from spectral
  measurements of real recordings; the menu tick, confirm chord (and its slowed cancel and memory-card
  variants), the configuration scroll, sub-menu sounds, delete, the entry wash and a statistical model of the
  ambience, all with a hall reverb.

## URL parameters (for testing)

`?card=0` no memory card · `?disc=1` disc boot · `?seed=N` reproducible randomness · `?capture=1` deterministic
headless mode used by the screenshot harness.

## Licences

three.js (MIT) in `vendor/`; TeX Gyre Heros under the GUST Font License in `assets/fonts/`. Everything else in
this repository was written for this project.
