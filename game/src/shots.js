// The deterministic screenshot scenes behind ?shot=start|play|chase|mission.
// Each scene drives the REAL world with the REAL step function — staging only
// sets up positions, wanted level and mission state, then simulates a few
// seconds so traffic, pedestrians and police are mid-action, exactly as in
// play. Same seed, same frame, every time.
import { STEP } from './config.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { ax: 0, ay: 0, run: false };

function run(world, seconds, input = IDLE, actions = 0) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input, i === 0 ? actions : 0);
}

/** Put the player in the nearest car and return that car. */
function enterNearestCar(world) {
  const s = world.state;
  let best = null; let bd = Infinity;
  for (const c of s.cars) {
    const d = Math.hypot(c.x - s.player.x, c.y - s.player.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) {
    s.player.x = best.x; s.player.y = best.y;
    world.step(STEP, IDLE, 1); // ACTION_INTERACT
  }
  return s.player.inCar;
}

/**
 * Stage the named scene in `world` and return { screen, save } for the
 * renderer. Names: start, play, chase, mission (anything else is start).
 */
export function stageShot(name, world) {
  const s = world.state;
  world.reset();

  if (name === 'play') {
    // Driving through traffic on a main road, first mission active: put the
    // stolen car squarely on the northbound avenue so the frame is motion,
    // traffic and city — not a car nosed into a building.
    world.startMission();
    const car = enterNearestCar(world);
    if (car) {
      car.x = 772; car.y = 1960; car.angle = -Math.PI / 2; car.speed = 255;
      s.player.x = car.x; s.player.y = car.y;
    }
    run(world, 2.0, { ax: 0, ay: -1, run: false });
    s.cash = 370;
    return { screen: SCREEN_PLAY, save: null };
  }

  if (name === 'chase') {
    // Three-star police chase: player driving the avenue, units framed
    // behind and beside, light damage smoke trailing.
    world.startMission();
    const car = enterNearestCar(world);
    if (car) {
      car.x = 772; car.y = 2060; car.angle = -Math.PI / 2; car.speed = 320;
      car.smoke = 0.4; car.health = 72;
      s.player.x = car.x; s.player.y = car.y;
    }
    world.setWanted(3);
    run(world, 0.3, { ax: 0, ay: -1, run: false }); // lets the units spawn
    // Frame the pursuit around the northbound player car: two units behind
    // (south), one alongside on the next lane, one ahead turning in.
    const spots = [
      { dx: -48, dy: 190 }, { dx: 52, dy: 300 }, { dx: 118, dy: 30 }, { dx: -30, dy: -260 },
    ];
    s.police.forEach((cop, i) => {
      const spot = spots[i % spots.length];
      cop.x = s.player.x + spot.dx;
      cop.y = s.player.y + spot.dy;
      cop.angle = -Math.PI / 2;
      cop.speed = 300;
    });
    run(world, 0.55, { ax: 0.06, ay: -1, run: false });
    s.cash = 620;
    return { screen: SCREEN_PLAY, save: null };
  }

  if (name === 'mission') {
    // The delivery moment: car at the Neon Garage, mission complete panel.
    world.startMission();
    const car = enterNearestCar(world);
    if (car) {
      car.x = s.landmarks.garage.x + 30;
      car.y = s.landmarks.garage.y + 46;
      car.angle = 0.3;
      car.speed = 0;
      s.player.x = car.x; s.player.y = car.y;
    }
    run(world, 0.4, IDLE);
    // The step into the garage zone completes M1 if the staging lined up;
    // force the complete state either way so the panel is what renders.
    if (s.missionState !== 'complete') {
      s.cash += 250;
      s.missionState = 'complete';
      s.banner = '';
      s.bannerTimer = 0;
    }
    return { screen: SCREEN_COMPLETE, save: null };
  }

  // start: title over the dusk city, traffic drifting behind the panel.
  run(world, 3, IDLE);
  return { screen: SCREEN_TITLE, save: { bestCash: 1250, missionsDone: 2 } };
}
