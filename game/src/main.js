// Boot and the one loop for Neon Bay: Vice Run. Input is read every frame,
// the world advances in fixed 1/60 s steps, and the renderer paints what is
// there. Screens: title, briefing, play, paused, mission-complete, game over.
//
// Sound is pure WebAudio synthesis — engine hum, sirens, pickup blips, punch
// and shot thumps — with no audio files and no network.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for the screenshot pipeline.
import { SAVE_KEY, STEP } from './config.js';
import {
  createWorld, EVENT_BUSTED, EVENT_ENTER, EVENT_HURT, EVENT_MISSION,
  EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_SPRAY, EVENT_STEAL, EVENT_WASTED,
} from './world.js';
import {
  ACTION_ATTACK, ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_BRIEFING, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

// ---- save (localStorage: best cash / missions done) -------------------------
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { bestCash: 0, missionsDone: 0 };
    const parsed = JSON.parse(raw);
    return { bestCash: parsed.bestCash | 0, missionsDone: parsed.missionsDone | 0 };
  } catch { return { bestCash: 0, missionsDone: 0 }; }
}
function writeSave(save) {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

// ---- WebAudio synth -----------------------------------------------------------
function createAudio() {
  let ac = null;
  let engineOsc = null; let engineGain = null;
  let sirenOsc = null; let sirenGain = null; let sirenLfo = null;
  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = ac.createOscillator();
      engineGain = ac.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(ac.destination);
      engineOsc.start();
      sirenOsc = ac.createOscillator();
      sirenGain = ac.createGain();
      sirenLfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenLfo.frequency.value = 0.7;
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ac.destination);
      sirenOsc.start(); sirenLfo.start();
    } catch { ac = null; }
    return ac;
  }
  function blip(freq, dur = 0.09, type = 'square', vol = 0.06, slide = 0) {
    if (!ensure()) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }
  return {
    unlock() { ensure(); },
    /** Fade engine and siren out (title and game-over screens are quiet). */
    silence() {
      if (!ac) return;
      engineGain.gain.setTargetAtTime(0, ac.currentTime, 0.08);
      sirenGain.gain.setTargetAtTime(0, ac.currentTime, 0.08);
    },
    blip,
    pickup() { blip(880, 0.08); setTimeout(() => blip(1320, 0.1), 60); },
    cash() { blip(990, 0.07, 'square', 0.05); setTimeout(() => blip(1480, 0.12, 'square', 0.05), 70); },
    punch() { blip(140, 0.08, 'sawtooth', 0.09, -80); },
    shot() { blip(220, 0.06, 'sawtooth', 0.1, -160); },
    steal() { blip(520, 0.1, 'square', 0.06, 260); },
    spray() { blip(440, 0.2, 'sine', 0.07, 440); },
    hurt() { blip(110, 0.12, 'sawtooth', 0.07, -50); },
    /** Per-frame: engine pitch follows speed; siren gain follows wanted. */
    update(state) {
      if (!ac) return;
      const car = state.player.inCar;
      const targetEngine = car ? 0.028 : 0;
      engineGain.gain.setTargetAtTime(targetEngine, ac.currentTime, 0.1);
      if (car) engineOsc.frequency.setTargetAtTime(50 + Math.abs(car.speed) * 0.32, ac.currentTime, 0.08);
      const targetSiren = state.wanted > 0 && state.police.length > 0 ? 0.016 : 0;
      sirenGain.gain.setTargetAtTime(targetSiren, ac.currentTime, 0.2);
    },
  };
}
const audio = createAudio();

// ---- screenshot mode ------------------------------------------------------------
function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, world.waypoint(), { save: scene.save });
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ---- the game ---------------------------------------------------------------------
function runGame() {
  const input = createInput(canvas);
  let save = readSave();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) { status.textContent = message; }

  function syncScreen() {
    const s = world.state;
    if (s.over) { screen = SCREEN_OVER; return; }
    if (screen === SCREEN_PAUSED || screen === SCREEN_TITLE) return;
    if (s.missionState === 'briefing') screen = SCREEN_BRIEFING;
    else if (s.missionState === 'complete') screen = SCREEN_COMPLETE;
    else screen = SCREEN_PLAY;
  }

  function startRun() {
    world.reset();
    screen = SCREEN_BRIEFING;
    announce('Mission 1 briefing. Press Space to start.');
  }

  function persistProgress() {
    const s = world.state;
    const done = s.missionState === 'done' ? 3 : s.missionIndex;
    save = {
      bestCash: Math.max(save.bestCash, s.cash),
      missionsDone: Math.max(save.missionsDone, done),
    };
    writeSave(save);
  }

  function handleEvents(events) {
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) { audio.cash(); persistProgress(); }
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_SPRAY) audio.spray();
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_ENTER) audio.blip(330, 0.07, 'square', 0.05);
    if (events & (EVENT_BUSTED | EVENT_WASTED)) {
      persistProgress();
      announce(world.state.over === 'busted' ? 'Busted.' : 'Wasted.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    if (actions) audio.unlock();

    if (screen === SCREEN_TITLE) {
      audio.silence();
      if (actions & (ACTION_CONFIRM | ACTION_ATTACK)) startRun();
      // Idle city drift behind the title.
      while (accumulator >= STEP) { world.step(STEP, { ax: 0, ay: 0, run: false }, 0); accumulator -= STEP; }
      renderer.draw(world.state, SCREEN_TITLE, null, { save });
      return;
    }
    if (screen === SCREEN_OVER) {
      audio.silence();
      if (actions & (ACTION_RESTART | ACTION_CONFIRM)) startRun();
      renderer.draw(world.state, SCREEN_OVER, null, { overKind: world.state.over });
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_PLAY || screen === SCREEN_BRIEFING) screen = SCREEN_PAUSED;
    }
    if (screen === SCREEN_PAUSED) {
      renderer.draw(world.state, SCREEN_PAUSED, world.waypoint(), {});
      accumulator = 0;
      return;
    }

    // World-facing actions: confirm starts/advances missions, interact and
    // attack go straight to the world.
    let worldActions = 0;
    if (actions & ACTION_INTERACT) worldActions |= ACTION_INTERACT;
    if (actions & ACTION_ATTACK) worldActions |= ACTION_ATTACK;
    if (actions & ACTION_CONFIRM) worldActions |= ACTION_CONFIRM;

    const snapshot = {
      ax: input.axisX(),
      ay: input.axisY(),
      run: input.held.run,
    };
    let first = true;
    while (accumulator >= STEP) {
      const events = world.step(STEP, snapshot, first ? worldActions : 0);
      first = false;
      handleEvents(events);
      accumulator -= STEP;
      if (world.state.over) break;
    }
    syncScreen();
    audio.update(world.state);
    renderer.draw(world.state, screen, world.waypoint(), { save, overKind: world.state.over });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  announce('Neon Bay: Vice Run. Press Space to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
