// Neon Bay: Vice Run — a working gta6-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop browser loads
// offline (game/index.html and its ES modules, no library, no network request). This program
// hands it in: it copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// THE GAME — Neon Bay: Vice Run, an original top-down 2D open-world crime game.
// A procedural seeded city (deterministic from ?seed=N): a grid of city blocks with roads,
// dashed centre lines, sidewalks, hundreds of buildings with lit windows and glowing neon
// signs carrying original names — Neon Bay, Vice Run, Bayview Diner, Palm Court, Hotel Azure,
// Club Mirage, Pier 9 and more — all under a dusk palette with named landmarks (Bayview
// Diner, Neon Garage, Pier 9, Palm Court and the Vice Spray Shop).
//
// Play: on foot with WASD/arrows and Shift to run; press E near any car to enter it, and E
// again to get out. Driving has real acceleration, braking, reverse and speed-sensitive
// steering; traffic cars follow the road grid and turn at junctions, pedestrians stroll the
// sidewalks and flee danger, and collisions damage cars until they smoke and die. Stealing a
// driven car pulls its driver out onto the street and raises the wanted level.
//
// Wanted runs 0–5 stars: police cars spawn as the stars rise, chase, ram and — at three
// stars or more — shoot. Escape by breaking line of sight until the stars cool down, or
// drive into the Vice Spray Shop, which repaints the car for $100 and clears the heat.
// Getting boxed in on foot gets you BUSTED; losing all health gets you WASTED.
//
// Three chained story missions for Marlo, each with a briefing panel, an on-screen mission
// tracker and a waypoint arrow (plus an edge arrow and distance when it is off-screen):
// M1 "First Wheels" — steal a car and deliver it to the Neon Garage; M2 "Bayview Run" —
// pick up the package at Pier 9, outrun two-star heat and deliver it to Palm Court;
// M3 "Vice Run" — take the marked getaway car and cross the city to the spray shop at three
// stars against a 75-second timer. Cash rewards: $250 / $450 / $900.
//
// Combat: punch with Space or click; a pistol pickup waits at the Neon Garage after M1 and
// turns Space into gunfire. HUD shows cash, the in-game clock, wanted stars, health (and car
// health while driving), the mission tracker with reward or countdown, context hints and
// event banners, plus a live minimap (top-right) with roads, landmarks, traffic, police
// dots, the waypoint and the player's arrow. Start screen with story blurb, controls and
// best save; localStorage keeps best cash and missions completed; P/Esc pauses; busted and
// wasted screens restart the run. Sound is synthesized live with WebAudio — engine hum that
// follows speed, police sirens, pickup and cash blips, punches and shots — no audio files.
//
// Four deterministic screenshot scenes (?shot=start|play|chase|mission&seed=1) stage the
// title over the dusk city, driving in traffic with HUD and minimap, a three-star police
// chase, and the First Wheels delivery / mission-complete moment.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A one-line hand-in summary for whoever runs this by hand: the dossier bytes
// written, so a truncated or empty hand-in is obvious at a glance.
console.log(`Neon Bay: Vice Run — dossier.json written to ${out} (${dossier.length} bytes)`);
