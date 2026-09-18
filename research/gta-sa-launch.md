# GTA San Andreas on a PS2: disc boot to "Ah shit, here we go again"

Measurements for the disc-boot recreation (src/game/). Frames were sampled from public PS2 captures with a headless
browser and measured with OpenCV; audio was decoded and analysed spectrally; text, timings and coordinates come from
the PS2 GXT dump (Sergeanur/GXT, `SA PS2/american*.txt`), the decompiled `intro.sc` (ScriptFixSA / DE leak) and
gta-reversed-modern. Nothing from the game is shipped: every screen is redrawn, every sound re-synthesised.

Captures: 9QpburD7KSc "GTA PS2 Original San Andreas Intro" (PS2 on PS4, 30 fps, 4:3 pillarboxed in 16:9; logos and
credits, then the cutscene; its loading screens were trimmed by the uploader), 6yKXXRcq4v4 "Opening Intro (PS2)" (real
PS2, 2011: logos, credits, legal screen, six loading artworks), hVjsG4FIg04 "Intro & First Missions (PS2)" (real PS2,
subtitles on, HUD after the cutscene). All percentages below are of the 4:3 picture (640x448 game space).

## 1. Console side (already in src/osd.js)

Browser, X on the disc: fade to black 0.4 s, ~5 s of drive spin-up, the "PlayStation 2" logo (forms 0.30 s, holds
2.15 s, hard cut) with the logo hum. After the cut the console reads the disc: black for 8.3 s (slim, PAL) to 9.1 s (fat, NTSC) with faint laser
seeks (measured by per-frame brightness on two real-hardware captures; 8.7 s used).

## 2. Intro movie (one FMV: logos + titles), t = 0 at movie start

| t (s) | what |
|---|---|
| 0.0-0.2 | black |
| 0.2-1.0 | Rockstar Games badge revealed by a ragged diagonal wipe (top-left to bottom-right, soft noisy edge) |
| 1.2-1.5 | "rockstar games" (blackletter, grey-white #a3a2a3, with a small ® right of the badge corner) fades in |
| 4.3-4.7 | whole card fades out; black until 6.4 |
| 6.4-8.2 | Rockstar North badge revealed through a jagged zig-zag tear sweeping top to bottom (a lightning-bolt "Z" mask) |
| 8.8-9.2 | "rockstar north" fades in |
| 13.0-13.6 | card fades out |
| 13.8-14.6 | "Rockstar Games Presents" fades in (bold sans, centred, y 50 %); holds; fades 17.4-18.2 |
| 18.4-19.4 | "a Rockstar North Game" fades in; holds; slow fade 21.8-23.2 |
| 23.3 | full-frame white flash (0.2 s) and the SA logo appears with a strong white glow; the theme's beat 1 |
| 23.4-26.0 | glow decays; 26.6-27.8 logo dims to dark grey; 28.0 black |
| 28.4 | credits montage begins (15 cards at ~5 s cadence, listed in section 3); ends at 102 |
| 102-104 | black, then the console loading sequence (section 4) |

Badge geometry (same for both): x 29.2-70.5 % (w 41.5 %), y 16.8-64.2 % (h 47.6 %), centre (49.8 %, 40.5 %); displayed
aspect 1.16:1; corner radius 13 % of the badge height. Colours as captured: games #ce900b (true orange is brighter;
#e39516 used), north #22257a (#2a2e8f used). Inside: a black italic "R" occupying about x 41-56 %, y 27-52 % of the
picture with a white five-point star over its lower right (star bbox x 51.6-62.1 %, y 40.4-53.2 %). Text line below:
x 30.7-69.6 %, y 65.2-74.5 % (incl. descenders), median #a3a2a3 (games) / #b8b7b8 (north).
Text cards: "Rockstar Games Presents" x 27.3-75.3 %, y 47.8-52.0 % (cap height about 3.2 % H), colour #808c8a as
captured (≈ #dcdcdc at full); "a Rockstar North Game" x 29.2-73.6 %, same y.
SA logo: bbox x 29.3-72.2 %, y 24.4-73.9 %; "grand theft auto" (Pricedown, three stacked lines) from y 25.7 to 50.7 %,
"San Andreas" (blackletter with a white outline) y 51.1-73.9 %. Plain state #878787 as captured, glow state #eeedf2.

Sound (from the audio track): the games wipe carries a broadband hiss 0.15-1.2 s (energy 2-8 kHz, peaks ≈ 4.5 kHz,
-35 dBFS); the north tear a brighter hiss 5.9-8.4 s (peaks 8-9.5 kHz) over a low rumble (20-120 Hz, -22 dB rel.);
silence otherwise. From 13.5 s a low drone (60-250 Hz; peaks 100, 150, 169, 190, 214 Hz) rises from -44 to -30 dBFS
until 19 s, then a riser (energy moving 500 Hz to 7 kHz) 21.5-23.3 s; the theme hits at 23.3 s at -13 dBFS RMS.

## 3. Credits montage (28.4-102 s)

Each card: a still sliced into 3-4 tall strips, each strip slightly rotated (±3-6°) and sheared, sliding in over
~0.5 s from the right; credit titles in a gold blackletter (#ad9f5c as captured, ≈ #d8c05a), names in a pale mint
bold sans (#a19891 captured, ≈ #c9d9cc), text blocks placed left or right of the strips; hold ~3 s; out ~0.5 s.
Strips cover about x 12-87 %, y 22-73 %.

| # | start | image | credits |
|---|---|---|---|
| 1 | 28.4 | LSPD cruiser on a night street, blue light | art director — Aaron Garbut; technical director — Obbe Vermeij |
| 2 | 33.5 | BMX rider under palms, teal sky | technical director — Adam Fowler; senior programmer — Alexander Roger |
| 3 | 38.5 | bridge, orange sky | san fierro — Gary McAdam, Wayland Standing, Chris Marshall; los santos — Nik Taylor, Steven Mulholland, James Allen, Simon Little; countryside — Scott Wilson, Stuart Macdonald |
| 4 | 43.5 | casino tower interior, gold | las venturas — Adam Cochrane, Andrew Soosay, David Cooper, Gillian Bertram; interior artists — Andy Hay, Michael Pirso, C-J Dick, Alan Burns, Lee Montgomery; front end design — Stuart Petri |
| 5 | 48.5 | orange car, wide street | vehicles — Paul Kurowski, Jolyon Orme, Alan Duncan; character artists — Ian McQue, Toks Solarin, Alisdair Wood, Alan Davidson, Rick Stirling |
| 6 | 53.5 | jet in a blue sky | animation — Duncan Shields, Gus Braid, Mondo Ghulam, Iwan Scheer, Mark Tennant, Terry Kenny |
| 7 | 58.5 | shop street, green sign | audio — Allan Walker, Craig Conner, Will Morton, Jonathan McCavish; audio coders — Colin Entwistle, Matthew Smith |
| 8 | 63.5 | figure at sunset | a.i. code — Gordon Yeoman, James Broad, John Gurney; game code — Graeme Williamson, John Whyte, Derek Payne, Shaun McKillop, Barane Chan |
| 9 | 68.5 | freeway, yellow sky | tool coders — Greg Smith, Alex Carter; visual effects code — Andrzej Madajczyk, Mark Nicholson, Derek Ward, Alexander Illes |
| 10 | 73.5 | ferris wheel | lead level design — Craig Filshie; senior level design — Imran Sarwar, William Mills, Andy Duthie, Chris Rothwell |
| 11 | 78.5 | forest road | level design — Paul Davis, Neil Ferguson, Judith George, John Haime, Simon Lashley, Chris McMahon, Steven Taylor, Kevin Wong, Christian Cantamessa, David Beddoes, Keith McLeman, Kevin Bolt |
| 12 | 83.5 | red-rock desert | test — Craig Arbuthnott, Jeff Rosa, Neil Corbett, Neil Meikle, David Murdoch, David Watson, Rich Huie, Lance Williams, Elizabeth Satterwhite; associate producer — Lee Cummings; audio test — George Williamson |
| 13 | 88.5 | casino neon, magenta | written by — Dan Houser, James Worrall, DJ Pooh; cinematic — Alex Horton, Navid Khonsari, Jamie King |
| 14 | 93.0 | (text only, centred) | producer — Leslie Benzies |
| 15 | 98.0 | (text only, centred) | executive producer — Sam Houser |

## 4. Console loading (real PS2, 6yKXXRcq4v4; TCRF: the PS2 loading screen is a fixed 30 s timer)

movie end → black 5.5 s → legal screen 9.9 s (0.3 s fades; the cover-art collage around the SA logo, eight lines of
white legal text at the bottom) → black 0.5 s → six artworks, 30.4 s total, each ≈ 3 s hold + 1.7 s cross-fade,
the SA logo bottom-left (x 4-16 %, y 78-95 %) with the loading bar under it (engine: 180x10 px at x 50, y 448-40,
light grey #E1E1E1, half-brightness remainder, 2 px black border; no "loading" text) → fade 1.3 s → black ≥ 8 s.
Artwork tints in order: red (bald man in a suit), yellow (bandana and plaid shirt), teal (CJ on a BMX), grey-yellow
(Tenpenny with a pistol), red/orange (purple-clad shooter on a lowrider), green (girl with a cross necklace).
A "slightly different version" of the theme plays under the artworks, volume tied to the fades (silent on the legal
screen). Legal text (transcribed from the frame):
"© 2004 Rockstar Games, Inc. Rockstar Games, Rockstar North, the R* logo, Grand Theft Auto and the Grand Theft Auto
logo are trademarks and/or registered trademarks of Take-Two Interactive Software, Inc. All other marks and trademarks
are properties of their respective owners. All Rights Reserved. Note: The content of this videogame is purely
fictional, and is not intended to represent any actual person, business or organization. Any similarity between any
character, dialogue, event or plot element of this game and any actual person, business or organization is purely
coincidental. The makers and publishers of this videogame do not in any way endorse, condone or encourage this kind of
behavior."

## 5. The opening (script INTRO; times measured on hVjsG4FIg04, T = 0 at the title card)

Letterbox: the cutscenes run with the game's widescreen bars, picture y 14.1-82.2 %. Subtitles: white bold sans with
a black edge, centred, in the lower bar at y ≈ 88 % (gameplay: ≈ 89 %), no speaker names; PS2 GXT strings verbatim.

| T (s) | shot / text |
|---|---|
| 0-8.6 | black; "Francis INTL. Airport, / Liberty City, / 1992." three white lines at (50 %, 40.2 / 44.6 / 49.1 %), alpha 200/255, ~0.7 s fades (script: DISPLAY_TEXT 320,180/200/220, scale 0.8x1.8, no shadow) |
| 5-10 | PROLOG1: Francis Intl. check-in, CJ (white tank top, blue jeans) carries a suitcase down steps past a "JUANK AIR" sign; VO "After five years on the East Coast, it was time to go home." (7-11) |
| 10-13 | LS arrivals: dark baggage tunnel, belt, yellow "Baggage" sign; caption "Los Santos International Airport." (script: 6.8-10.0 s into PROLOG1, (50 %, 44.6 %), scale 0.6x1.6, 1 px shadow); "(Phone ringing)" 12-13 |
| 14-19 | "'Sup?", "Carl, it's Sweet." (14), "Whassup, Sweet, what you want?" (16), "It's Moms... She's dead, bro." (17-19); CJ lifts the suitcase off the belt |
| 20-23 | CJ walks through the terminal (Customs / Immigration signs), no text |
| 24-26 | top-down: the yellow Taxi driving |
| 27-32 | black (disc load; 6-10 s) |
| 33-35 | PROLOG3 (79.5 s, 06:30, SUNNY_COUNTRYSIDE): silhouette, the LSPD cruiser swings in front of the taxi, low sun |
| 36-42 | low angle on the cruiser, doors open, two officers out; "Passenger. Show us your hands." (41-42) |
| 43-46 | close on the taxi door opening |
| 47-49 | "Stop. Get down on your knees."; CJ steps out |
| 50-51 | close on "POLICE" door |
| 52-55 | CJ kneels, hands behind head; "Now down on your stomach." (53) |
| 56 | "There you go." (Hernandez frisks CJ on the ground) |
| 57-62 | Tenpenny walks round; close-up of his face against the sun |
| 63-68 | over CJ on the ground: "I'll take that, Hernandez." (66), "Hey, that's my paper man. That's money." (67-68) |
| 69-70 | "This is drug money." (cash held up to the sun) |
| 71 | "My money, man..." |
| 72-74 | "Hey don't worry about it, I'll fill it out later." |
| 75-77 | silhouettes of the three standing |
| 78-80 | "Welcome home, Carl. Glad to be back?" |
| 81-82 | "You haven't forgotten about us, have you boy?" |
| 84-85 | "Hell no, officer Tenpenny." |
| 86-87 | "I was just wondering what took y'all so long." |
| 88-89 | two-shot; "Get in the car." |
| 91 | "Ease up, man. Damn." |
| 93-97 | Pulaski holds the door; "Watch your head." (96); "Oh! My bad." (97) |
| 99-101 | "Get outta here, you greaseball bastard!" (taxi leaves) |
| 102-104 | "Stupid Mexican..." (102), "Oh, hey, sorry." (104) |
| 105-107 | "My bag. Hey, man, my bag!" |
| 108-112 | the cruiser pulls away up the palm street; darkens |
| 113-117 | black (0.5 s in the script; disc load on PS2) |
| 118 | ride (scripted, letterboxed; camera table and subtitle table below); "How you been, Carl? How's your wonderful family?" |
| 138-147 | overhead of the rail yard and crossing; the freight train; "This is a weapon, Officer Pulaski, that was used to gun down / a police officer not ten minutes ago." |
| 170-174 | "In the meantime, try not to gun down any more officers of the law." (overhead of the intersection) |
| 177-183 | the cruiser by the alley wall; "I thought you said you was innocent, Carl?..." (177), "This is car 58... WHAT?!" (181), "See you around like a doughnut, Carl..." (182) |
| 184-188 | "Officer Pendelbury's down? We'll be right over."; car drives off; CJ by the wall |
| 188.5-199.5 | over-the-shoulder push-in with handheld shake, CJ walking slowly: "Ah shit, here we go again." (188.5-191.0), "Worst place in the world." (191.5-192.5), "Rollin Heights Balla country." (193-195), "I ain't represented Grove Street in five years," (195.5-198), "but the Ballas won't give a shit." (198-199.5) |
| 200-204 | fixed shot, CJ looks around; 204.5 HUD fades in; 205.5 help box; 206.5 "Press △ to jump on the bike." and the blue marker on the BMX |

Ride subtitle table (ms from the ride fade-in; PS2 GXT): 0/3050 "How you been, Carl? How's your wonderful family?";
3150/2530 "I'm here to bury my Moms. You know that."; 6000/1600 "Yeah, I guess I do."; 9190/1530 "So what else you
got shakin' Carl?"; 10810/5510 "Nothing. I live in Liberty City now. I'm clean. Legit."; 16600/2560 "No, you ain't
never been clean, Carl."; 21000/1350 "Well, what've we got here?"; 23500/3760 "This is a weapon, Officer Pulaski, that
was used to gun down"; 27260/2450 "a police officer not ten minutes ago."; 30700/3620 "Officer Pendelbury. A fine man,
I might add."; 35000/1440 "Damn, you work fast for a man fresh off the plane." (the line is rewritten here; the game's own wording is not used); 36750/1739 "You know I just got off the plane!"; 38489/2450 "It's a
good thing we found you and retrieved the murder weapon."; 40939/971 "That ain't my gun."; 41910/1320 "Don't bullshit
me, Carl."; 43230/1342 "Yeah, don't bullshit him, Carl."; 44572/1747 "What the fuck you want from me this time?";
46700/2355 "When we want you, we'll find you."; 49500/4400 "In the meantime, try not to gun down any more officers of
the law."; 55900/3111 "You can't leave me here - it's BALLAS country."; 59500/3400 "I thought you said you was innocent,
Carl? That you don't bang?"; 62900/1180 "This is car 58... WHAT?!"; 64080/1700 "See you around like a doughnut,
Carl..."; 65780/2500 "Officer Pendelbury's down? We'll be right over."
Ride camera table (TIMERB ms): 0 fixed high shot (2358.66,-1246.35,28.79); 1500 7 s track; 5500 low street shot;
9500 6.8 s follow; 16200 low shot approaching the train (2316.99,-1378.12,23.31); 20500 high shot of the train
(2271.75,-1396.44,36.73); 32300 side of the car 5.7 s; 37589 fixed; 38500 7.5 s westward pan; 46000 fixed; 48000 5 s
track; 53000 descending crane 4 s; 57000 fixed; 59200 2.5 s track; 61400 alley; 63000 end shot, CJ out and the car
away; then a 6.5 s push, then the 13.5 s voice-over dolly (2217.62,-1262.76,24.45 → 2238.64,-1261.33,24.63) with
simulated shake, 2.5 s fixed, control at +16 s. World: cruiser COPCARLA created at (2431.61,-1254.06,22.83) heading
89.5, lights on; Pulaski drives, Tenpenny front, Hernandez rear, CJ rear; freight train at (2285.15,-1257.50) held at
the crossing (~13 s); CJ dumped at (2239.37,-1261.94,22.94) facing east, BMX at (2246.51,-1263.09,22.95) heading 285
(7 m east); Grove Street cul-de-sac (2471.7,-1668.0) ≈ 500 m south-east; the Johnson house at (2495.2,-1687.0).

After the cutscene: $350, health 100, no weapons, 06:3x. Help box "Use ~k~GO_FORWARD~, ... to move Carl."; BMX blip;
after 5 s objective "Get on the bike." (4 s); within 2 m: "Press △ to jump on the bike."; after mounting "Follow the
'CJ' icon on the radar to get back to the hood."; entering Grove Street: "Grove Street - Home." then "At least it was
before I fucked everything up." (4 s each); the red marker at the Johnson house starts "Big Smoke".

## 6. HUD (gta-reversed constants, 640x448 space; PS2 text size = PC 1.0)

Colours: RED #B4191D, GREEN #36682C, DARK_BLUE #323C7F, LIGHT_BLUE #ACCBF1, LIGHT_GRAY #E1E1E1, GOLD #906210,
CREAM #E2C063. Clock: Pricedown 0.55x1.1, right-aligned at x=W-32, y=22, LIGHT_GRAY, 2 px edge, "%02d:%02d".
Money: same font/scale, GREEN, "$%08d", y=77 on a new game (89-12). Health bar: 9 px tall, ≈62 px wide on a new game,
RED, half-brightness remainder, 2 px black border, right-aligned under the clock. Weapon icon 47x58 at y=20, left of
the clock (fist when unarmed). Radar: ellipse centre (87, 382), radii 47x38, black rim over x 36-138, y 340-424; blips
8x8. Zone name: blackletter 1.2x1.9, LIGHT_BLUE, right at W-32, bottom at y=420, 1 s in / 3 s hold / 1 s out.
Vehicle name: Bank-Gothic-like 1.0x1.5, GREEN, top at y=344. Mission title: Pricedown 1.0x1.3, GOLD, right at W-20,
bottom at H-115, slides in. Help box: dark translucent box top-left, white text. WASTED style: blackletter 2.1, centred.

## 7. Theme from San Andreas (Michael Hunter) — re-synthesis data

96 BPM (measured 96.25), 4/4, G minor; beat 1 on the SA logo flash. Bass (measured, 2-bar loop): G1 through most of
the cycle, a Bb1 stab on beat 3 of bar 2 (1 beat) then Ab1/Ab2 (half a beat) walking back to G; from cycle 5 an Eb2 on
beat 1 of the odd bars. Chords implied: Gm - Eb - Bb - Ab. Lead riff (Online Sequencer #735265, cross-checked with
two letter-note sites; MIDI, 16th-note grid of a 32-step cycle, [start,len]): pickup G3 [-2,2]; G4 [0,2] D#4 [2,2] D4
[4,1] D#4 [5,1] D4 [6,1] C4 [7,1] D4 [8,2] D4 [10,2] rest; A#3 [14,2] C4 [16,1] A#3 [17,1] C4 [18,2] D4 [20,2] G3 [22,2]
C4 [24,2] A#3 [26,1] G3 [27,1] rest [28,2] G3 [30,2]. Bass in the same grid: D2 [-2,2] F1 [0,2] G1 [2,4] G1 [11,1]
G1 [12,2] A#1 [22,4] G#2 [26,2] G2 [28,2] D2 [30,2]. B section (second bar of the cycle): G3 [14,1] D4 [15,2] G3 [17,1]
C#4 [18,2] G3 [20,1] C4 [21,2] G3 [23,1] A#3 [24,2] G3 [26,2]. Arrangement in the movie: drums + bass from 23.3 s,
riff from the first credits card (~33 s), B section alternating every four cycles; high string pad on G5/D6, Bb5/Eb6
over the Bb/Ab turn; a "west coast whistle" lead doubles the riff an octave up; ends with the credits at 102 s.
Loading variant: the same material sparser (bass, hats, pad), starting on the first artwork.

## 8. Fonts (all shipped in assets/fonts, licences alongside)

Blackletter (Rockstar wordmarks, credit titles, "San Andreas", zone names): Pirata One (OFL). Bank-Gothic-like
(vehicle names): Michroma (OFL). Bold grotesque (subtitles, captions, credit names, text cards): TeX Gyre Heros Bold
(GUST). Pricedown ("grand theft auto", HUD digits) is not open-licensed for embedding: the letterforms are redrawn as
SVG paths in src/game/logo.js.

## 9. Refinements from a second pass over real-hardware captures (slim PAL and fat NTSC)

Card lengths are identical across PAL, NTSC and PS2-on-PS4 within 0.1 s: Rockstar Games card 4.4 s (badge "drawn on"
stroke by stroke over 1.2 s, then the star and the wordmark appear at once, hold 2.6 s, fade 0.5 s), black 1.8 s,
Rockstar North card 7.4 s (blue drawn in about eight strokes over 2.0 s, 0.6 s pause, wordmark fades in over 0.8 s,
then the white star and a thin white outline on the R pop in, hold 2.6 s, white elements fade 0.6 s, the blue stays
0.6 s, cut), black 0.6 s, "Rockstar Games Presents" 3.5 s (1.0 in, 1.6 hold, 0.8 out), black 1.1 s, "a Rockstar North
Game" 3.7 s (0.8 in), black 0.8 s, an 80 ms white flash then the SA logo decaying linearly to black over 3.9 s, black
1.1 s, fifteen credit cards (4.4 s on, 0.5 s black, period 4.96 s; the two producer cards 3.9 s), black 6.2 s, legal
screen 9.8 s (static, silent, hard cuts), loading 30.4 s, black 9.6 s, title card 11 s, airport 21.5 s, black 15.4 s
(disc), pull-over 79.6 s, black 11.2 s (disc), the ride. "Ah shit, here we go again" lands about 6 min 20 s after the
PlayStation 2 logo. The movie is skippable with X (the loading is not).
Logo sound on a clean capture: the games scribble 0.2-1.0 s (peak 4.1-5.0 kHz, -34..-39 dBFS); before the north badge
one 0.1 s marker-cap pop (80-100 Hz thump plus a click) 0.4 s before the blue starts, then scribble bursts at 6.45-6.9,
7.0-7.9 and 8.2-8.4 s (peak 8-9.7 kHz); the drone under the text cards peaks 168-190 Hz rising -46 to -33 dBFS; the
hit at the flash peaks -8 dBFS and the theme sustains near -17 dBFS.
PS2 loading bar as seen on hardware: a thin light-grey outlined bar at y 86-89 % spanning x 8.6-35.7 %, filling at a
constant pace under the logo (x 8-37 %, y 57-88 %); artworks held ≈ 5 s with ≈ 1 s cross-fades in random order.
Sunrise look (console timecyc, 6 AM, sunny): sky top #5acdff, sky bottom #c89055, sun core/corona #ff8000 and very
large (SunSz 8.4 at 6 AM, 2.2 at 7 AM), no clouds, fog start 100 m, far clip 800 m; the PS2 colour filter multiplies
the frame by roughly R 1.84, G 1.41, B 0.67 at 6 AM so whites go cream (#faf9ab measured on the clock) and blue jeans
read grey-olive; a "radiosity" bloom adds a faint offset double image of highlights. HUD clock reads 06:46 when
control returns; the ride to Grove Street ends around 07:18.
