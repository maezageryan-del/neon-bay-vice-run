// The world: a seeded procedural city, the player on foot and in cars,
// traffic, pedestrians, police, the wanted system, pickups and the three
// chained story missions. No drawing and no browser in here: step() advances
// one fixed step from an input snapshot and returns event flags, so the
// caller (main.js) can react with sound and screens without the world
// knowing about either.
import { CAR, CITY, MISSIONS, PALETTE, PLAYER, SIGN_NAMES, WANTED } from './config.js';
import { createRng } from './random.js';

export const EVENT_STEAL = 1;
export const EVENT_PICKUP = 2;
export const EVENT_MISSION = 4;
export const EVENT_HURT = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_SPRAY = 64;
export const EVENT_PUNCH = 128;
export const EVENT_SHOT = 256;
export const EVENT_ENTER = 512;
export const EVENT_EXIT = 1024;

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
/** Is a world point on a road (grid line band) rather than inside a block? */
export function onRoad(x, y) {
  const half = CITY.road / 2;
  const mx = ((x % CITY.block) + CITY.block) % CITY.block;
  const my = ((y % CITY.block) + CITY.block) % CITY.block;
  return mx < half || mx > CITY.block - half || my < half || my > CITY.block - half;
}
/** Nearest road-centre coordinate for a value on one axis. */
function roadCentre(v) { return Math.round(v / CITY.block) * CITY.block; }

export function createWorld(seed) {
  const rng = createRng(seed);

  // ---- city generation (deterministic from the seed) ----------------------
  const buildings = [];
  const signs = [];
  const blocksPerSide = CITY.size / CITY.block;
  for (let bx = 0; bx < blocksPerSide; bx += 1) {
    for (let by = 0; by < blocksPerSide; by += 1) {
      const x0 = bx * CITY.block + CITY.road / 2 + CITY.sidewalk;
      const y0 = by * CITY.block + CITY.road / 2 + CITY.sidewalk;
      const inner = CITY.block - CITY.road - CITY.sidewalk * 2;
      // Split each block into 1-4 building plots.
      const cols = rng.int(1, 2);
      const rows = rng.int(1, 2);
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const w = inner / cols - 14;
          const h = inner / rows - 14;
          const b = {
            x: x0 + (inner / cols) * cx + 7, y: y0 + (inner / rows) * cy + 7,
            w, h, color: rng.pick(PALETTE.buildingRoof), floors: rng.int(2, 9),
          };
          buildings.push(b);
          if (rng.chance(0.34)) {
            signs.push({
              x: b.x + b.w / 2, y: b.y + 16, text: rng.pick(SIGN_NAMES),
              color: rng.pick([PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonAmber, PALETTE.neonViolet]),
            });
          }
        }
      }
    }
  }

  // Landmarks: fixed, named places the missions use.
  const landmarks = {
    diner: { x: 600, y: 600, name: 'Bayview Diner', color: PALETTE.neonAmber },
    garage: { x: 2600, y: 600, name: 'Neon Garage', color: PALETTE.neonCyan },
    pier: { x: 600, y: 2600, name: 'Pier 9', color: PALETTE.neonViolet },
    court: { x: 2600, y: 2600, name: 'Palm Court', color: PALETTE.neonPink },
    spray: { x: 1600, y: 1600, name: 'Vice Spray Shop', color: PALETTE.neonCyan },
  };

  // ---- entities ------------------------------------------------------------
  function makeCar(x, y, angle, opts = {}) {
    return {
      x, y, angle, speed: 0, color: opts.color ?? rng.pick(PALETTE.carBody),
      health: CAR.health, police: !!opts.police, parked: !!opts.parked,
      driver: opts.driver ?? null, // 'traffic' | 'police' | null
      // traffic route: drive along road centres, turning at junctions
      dirX: Math.cos(angle), dirY: Math.sin(angle),
      smoke: 0, dead: false,
    };
  }

  const player = {
    x: 560, y: 660, angle: -Math.PI / 2, health: PLAYER.health,
    inCar: null, hasGun: false, punchTimer: 0, hurtTimer: 0,
  };

  const state = {
    seed,
    buildings, signs, landmarks,
    player,
    cars: [], peds: [], police: [], pickups: [],
    cash: 120, wanted: 0, wantedTimer: 0, seenTimer: 0,
    clock: 18.4, // dusk, in hours
    elapsed: 0,
    missionIndex: 0, missionStage: 0, missionTimer: -1,
    missionState: 'briefing', // briefing | active | complete | failed | done
    banner: '', bannerTimer: 0,
    bustedTimer: 0, over: null, // null | 'busted' | 'wasted'
    camX: 0, camY: 0,
    sprayCooldown: 0,
  };

  function spawnTraffic() {
    state.cars = [];
    // Parked cars along roads.
    for (let i = 0; i < 26; i += 1) {
      const horizontal = rng.chance(0.5);
      const line = rng.int(0, blocksPerSide) * CITY.block;
      const along = rng.range(120, CITY.size - 120);
      const off = CITY.road / 2 - 22;
      const x = horizontal ? along : line + (rng.chance(0.5) ? off : -off);
      const y = horizontal ? line + (rng.chance(0.5) ? off : -off) : along;
      const car = makeCar(x, y, horizontal ? 0 : Math.PI / 2, { parked: true });
      state.cars.push(car);
    }
    // Moving traffic on road centres.
    for (let i = 0; i < 16; i += 1) {
      const horizontal = rng.chance(0.5);
      const line = rng.int(0, blocksPerSide) * CITY.block;
      const along = rng.range(0, CITY.size);
      const dir = rng.chance(0.5) ? 1 : -1;
      const lane = 28 * dir;
      const car = makeCar(
        horizontal ? along : line + lane,
        horizontal ? line + lane : along,
        horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
        { driver: 'traffic' },
      );
      car.speed = rng.range(120, 200);
      state.cars.push(car);
    }
  }

  /** One pedestrian on a random block edge (the sidewalk bands). */
  function makePed() {
    const bx = rng.int(0, blocksPerSide - 1) * CITY.block;
    const by = rng.int(0, blocksPerSide - 1) * CITY.block;
    const edge = rng.int(0, 3);
    const t = rng.range(0, CITY.block);
    const inset = CITY.road / 2 + 12;
    let x = bx; let y = by;
    if (edge === 0) { x = bx + t; y = by + inset; }
    if (edge === 1) { x = bx + t; y = by + CITY.block - inset; }
    if (edge === 2) { x = bx + inset; y = by + t; }
    if (edge === 3) { x = bx + CITY.block - inset; y = by + t; }
    return {
      x, y, angle: rng.range(0, TAU), speed: rng.range(34, 62),
      color: rng.pick(PALETTE.ped), health: 60, flee: 0, down: 0,
      turnTimer: rng.range(1, 5),
    };
  }

  function spawnPeds() {
    state.peds = [];
    for (let i = 0; i < 34; i += 1) state.peds.push(makePed());
  }

  function reset() {
    player.x = 560; player.y = 660; player.angle = -Math.PI / 2;
    player.health = PLAYER.health; player.inCar = null; player.hasGun = false;
    player.punchTimer = 0; player.hurtTimer = 0;
    state.cash = 120; state.wanted = 0; state.wantedTimer = 0; state.seenTimer = 0;
    state.clock = 18.4; state.elapsed = 0;
    state.missionIndex = 0; state.missionStage = 0; state.missionTimer = -1;
    state.missionState = 'briefing';
    state.banner = ''; state.bannerTimer = 0;
    state.bustedTimer = 0; state.over = null; state.sprayCooldown = 0;
    state.police = []; state.pickups = [];
    spawnTraffic();
    spawnPeds();
    updateCamera();
  }

  // ---- missions --------------------------------------------------------------
  /** The current waypoint target {x, y, label} or null. */
  function waypoint() {
    if (state.missionState !== 'active') return null;
    const m = state.missionIndex;
    const s = state.missionStage;
    if (m === 0) {
      if (s === 0) {
        // Nearest car: point at the closest parked/traffic car.
        let best = null; let bd = Infinity;
        for (const c of state.cars) {
          const d = dist(player.x, player.y, c.x, c.y);
          if (d < bd) { bd = d; best = c; }
        }
        return best ? { x: best.x, y: best.y, label: 'STEAL A CAR' } : null;
      }
      return { x: landmarks.garage.x, y: landmarks.garage.y, label: 'NEON GARAGE' };
    }
    if (m === 1) {
      return s === 0
        ? { x: landmarks.pier.x, y: landmarks.pier.y, label: 'PACKAGE — PIER 9' }
        : { x: landmarks.court.x, y: landmarks.court.y, label: 'PALM COURT DROP' };
    }
    if (m === 2) {
      return s === 0
        ? { x: landmarks.diner.x + 140, y: landmarks.diner.y + 60, label: 'GETAWAY CAR' }
        : { x: landmarks.spray.x, y: landmarks.spray.y, label: 'SPRAY SHOP — LOSE THE HEAT' };
    }
    return null;
  }

  function startMission() {
    state.missionState = 'active';
    state.missionStage = 0;
    if (state.missionIndex === 1) {
      state.pickups.push({ x: landmarks.pier.x, y: landmarks.pier.y, kind: 'package', taken: false });
    }
    if (state.missionIndex === 2) {
      // The marked getaway car, parked by the diner.
      const car = makeCar(landmarks.diner.x + 140, landmarks.diner.y + 60, 0,
        { parked: true, color: '#ff2e88' });
      car.getaway = true;
      state.cars.push(car);
    }
  }

  function completeMission(events) {
    const mission = MISSIONS[state.missionIndex];
    state.cash += mission.reward;
    state.missionState = 'complete';
    state.banner = `MISSION COMPLETE — ${mission.name}  +$${mission.reward}`;
    state.bannerTimer = 4;
    if (state.missionIndex === 0 && !player.hasGun) {
      // The pistol pickup appears at the garage after First Wheels.
      state.pickups.push({ x: landmarks.garage.x + 60, y: landmarks.garage.y + 40, kind: 'pistol', taken: false });
    }
    return events | EVENT_MISSION;
  }

  function advanceMission(events) {
    state.missionStage += 1;
    const mission = MISSIONS[state.missionIndex];
    if (state.missionStage >= mission.stages.length) return completeMission(events);
    if (state.missionIndex === 1 && state.missionStage === 1) setWanted(Math.max(state.wanted, 2));
    if (state.missionIndex === 2 && state.missionStage === 1) {
      setWanted(3);
      state.missionTimer = 75;
    }
    return events;
  }

  function nextMission() {
    state.missionIndex += 1;
    state.missionStage = 0;
    state.missionTimer = -1;
    state.missionState = state.missionIndex >= MISSIONS.length ? 'done' : 'briefing';
  }

  function setWanted(n) {
    state.wanted = clamp(n, 0, WANTED.max);
    state.wantedTimer = 0;
  }
  function addWanted(n) { setWanted(state.wanted + n); }

  // ---- police ------------------------------------------------------------------
  function spawnPolice() {
    const want = Math.min(WANTED.policeCap, state.wanted * WANTED.policePerStar);
    while (state.police.length < want) {
      // Spawn on a road near (but not on top of) the player.
      const ang = rng.range(0, TAU);
      const d = rng.range(520, 700);
      let x = clamp(player.x + Math.cos(ang) * d, 40, CITY.size - 40);
      let y = clamp(player.y + Math.sin(ang) * d, 40, CITY.size - 40);
      x = onRoad(x, y) ? x : roadCentre(x);
      const car = makeCar(x, y, Math.atan2(player.y - y, player.x - x),
        { police: true, driver: 'police', color: PALETTE.policeBody });
      car.speed = 0;
      state.police.push(car);
    }
    if (state.police.length > want) state.police.length = Math.max(0, want);
  }

  // ---- collisions ----------------------------------------------------------------
  function collideBuildings(e, radius) {
    for (const b of state.buildings) {
      if (e.x > b.x - radius && e.x < b.x + b.w + radius && e.y > b.y - radius && e.y < b.y + b.h + radius) {
        // Push out along the smallest penetration axis.
        const left = e.x - (b.x - radius);
        const right = (b.x + b.w + radius) - e.x;
        const top = e.y - (b.y - radius);
        const bottom = (b.y + b.h + radius) - e.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) e.x = b.x - radius;
        else if (m === right) e.x = b.x + b.w + radius;
        else if (m === top) e.y = b.y - radius;
        else e.y = b.y + b.h + radius;
        return true;
      }
    }
    return false;
  }

  function damageCar(car, amount) {
    car.health -= amount;
    if (car.health < 55) car.smoke = Math.min(1, car.smoke + amount / 60);
    if (car.health <= 0) { car.dead = true; car.speed = 0; }
  }

  // ---- step ----------------------------------------------------------------------
  /**
   * Advance one fixed step. `input` is {ax, ay, run, actions} where actions
   * carries the ACTION_* flags from input.js (interact/attack/confirm).
   * Returns EVENT_* flags.
   */
  function step(dt, input, actions) {
    let events = 0;
    if (state.over) return events;
    state.elapsed += dt;
    state.clock = (state.clock + dt / 240) % 24; // a game day in ~96 minutes
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.sprayCooldown > 0) state.sprayCooldown -= dt;
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;

    const ACTION_INTERACT = 1; const ACTION_ATTACK = 2; const ACTION_CONFIRM = 8;

    // Mission briefing / complete panels advance on confirm.
    if ((actions & ACTION_CONFIRM) && state.missionState === 'briefing') startMission();
    else if ((actions & ACTION_CONFIRM) && state.missionState === 'complete') nextMission();

    // Mission timer (Vice Run).
    if (state.missionState === 'active' && state.missionTimer > 0) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        state.missionTimer = -1;
        state.missionState = 'briefing';
        state.missionStage = 0;
        setWanted(0);
        state.banner = 'VICE RUN — OUT OF TIME. MARLO WILL TRY AGAIN.';
        state.bannerTimer = 4;
      }
    }

    // ---- interact: enter / exit cars, spray shop -------------------------------
    if (actions & ACTION_INTERACT) {
      if (player.inCar) {
        const car = player.inCar;
        player.inCar = null;
        player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
        player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
        events |= EVENT_EXIT;
      } else {
        // Spray shop: on foot inside its zone with cash repaints nothing (you
        // must be in the car) — on foot it just gives a hint via banner.
        let best = null; let bd = 52;
        for (const c of [...state.cars, ...state.police]) {
          if (c.dead || c.police) continue;
          const d = dist(player.x, player.y, c.x, c.y);
          if (d < bd) { bd = d; best = c; }
        }
        if (best) {
          const wasDriven = best.driver === 'traffic';
          if (wasDriven) {
            // Pull the driver out: a pedestrian appears and flees.
            state.peds.push({
              x: best.x + 24, y: best.y + 10, angle: rng.range(0, TAU),
              speed: 120, color: rng.pick(PALETTE.ped), health: 60, flee: 3, down: 0, turnTimer: 2,
            });
            best.driver = null;
            addWanted(1);
            state.banner = 'CAR STOLEN — WANTED +1';
            state.bannerTimer = 2;
          }
          best.parked = false;
          player.inCar = best;
          events |= EVENT_ENTER | (wasDriven ? EVENT_STEAL : 0);
          // Mission hooks for entering cars.
          if (state.missionState === 'active') {
            if (state.missionIndex === 0 && state.missionStage === 0) events = advanceMission(events);
            if (state.missionIndex === 2 && state.missionStage === 0 && best.getaway) events = advanceMission(events);
          }
        }
      }
    }

    // ---- player movement ---------------------------------------------------------
    if (player.inCar) {
      const car = player.inCar;
      player.x = car.x; player.y = car.y; player.angle = car.angle;
      // Driving input: ay is throttle (up = accelerate), ax steers.
      const throttle = -input.ay;
      const steer = input.ax;
      if (!car.dead) {
        if (throttle > 0) car.speed += CAR.accel * dt * (car.speed < 0 ? 2.2 : 1);
        else if (throttle < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
        car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
        const speedFactor = clamp(Math.abs(car.speed) / 120, 0, 1);
        car.angle += steer * CAR.turnRate * speedFactor * dt * (car.speed < 0 ? -1 : 1);
      }
      car.speed *= Math.pow(CAR.friction, dt * 60 * 0.16);
      if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const hitWall = collideBuildings(car, 24);
      if (hitWall && Math.abs(car.speed) > 130) { damageCar(car, 9); events |= EVENT_HURT; }
      if (!hitWall) { car.x = nx; car.y = ny; } else { car.speed *= -0.25; }
      car.x = clamp(car.x, 20, CITY.size - 20);
      car.y = clamp(car.y, 20, CITY.size - 20);
      player.x = car.x; player.y = car.y; player.angle = car.angle;

      // Spray shop while driving: repaint, clear stars, costs cash.
      if (state.wanted > 0 && state.sprayCooldown <= 0
        && dist(car.x, car.y, landmarks.spray.x, landmarks.spray.y) < 90) {
        if (state.cash >= 100) {
          state.cash -= 100;
          car.color = rng.pick(PALETTE.carBody);
          setWanted(0);
          state.police = [];
          state.sprayCooldown = 5;
          state.banner = 'RESPRAYED — HEAT CLEARED  -$100';
          state.bannerTimer = 3;
          events |= EVENT_SPRAY;
          if (state.missionState === 'active' && state.missionIndex === 2 && state.missionStage === 1) {
            state.missionTimer = -1;
            events = completeMission(events);
          }
        } else if (state.bannerTimer <= 0) {
          state.banner = 'SPRAY SHOP — NEED $100 TO REPAINT';
          state.bannerTimer = 1.5;
        }
      }

      // Mission delivery: M1 garage.
      if (state.missionState === 'active' && state.missionIndex === 0 && state.missionStage === 1
        && dist(car.x, car.y, landmarks.garage.x, landmarks.garage.y) < 95) {
        events = advanceMission(events);
      }
      // M2 delivery: Palm Court in the car with the package.
      if (state.missionState === 'active' && state.missionIndex === 1 && state.missionStage === 1
        && dist(car.x, car.y, landmarks.court.x, landmarks.court.y) < 95) {
        events = advanceMission(events);
      }
      // Running over pedestrians is a crime.
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (Math.abs(car.speed) > 60 && dist(car.x, car.y, ped.x, ped.y) < 26) {
          ped.down = 6; ped.health = 0;
          addWanted(1);
          damageCar(car, 4);
          state.banner = 'PEDESTRIAN DOWN — WANTED +1';
          state.bannerTimer = 2;
          events |= EVENT_HURT;
        }
      }
    } else {
      // On foot.
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const mx = input.ax; const my = input.ay;
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        player.angle = Math.atan2(my, mx);
        player.x += (mx / len) * speed * dt;
        player.y += (my / len) * speed * dt;
        collideBuildings(player, PLAYER.radius);
        player.x = clamp(player.x, 16, CITY.size - 16);
        player.y = clamp(player.y, 16, CITY.size - 16);
      }
      // Combat: punch, or shoot with the pistol once picked up.
      if ((actions & ACTION_ATTACK) && player.punchTimer <= 0) {
        player.punchTimer = 0.32;
        events |= player.hasGun ? EVENT_SHOT : EVENT_PUNCH;
        const range = player.hasGun ? 300 : PLAYER.punchRange;
        let hitSomething = false;
        for (const ped of state.peds) {
          if (ped.down > 0) continue;
          if (dist(player.x, player.y, ped.x, ped.y) < range + 10) {
            ped.health -= player.hasGun ? 60 : PLAYER.punchDamage;
            ped.flee = 4;
            if (ped.health <= 0) ped.down = 8;
            hitSomething = true;
          }
        }
        for (const cop of state.police) {
          if (dist(player.x, player.y, cop.x, cop.y) < range) { damageCar(cop, 12); hitSomething = true; }
        }
        if (hitSomething && !player.hasGun) { addWanted(1); }
        if (hitSomething && player.hasGun) { addWanted(1); }
      }
      // Pickups on foot.
      for (const pk of state.pickups) {
        if (pk.taken) continue;
        if (dist(player.x, player.y, pk.x, pk.y) < 30) {
          pk.taken = true;
          events |= EVENT_PICKUP;
          if (pk.kind === 'pistol') {
            player.hasGun = true;
            state.banner = 'PISTOL ACQUIRED — SPACE / CLICK TO SHOOT';
            state.bannerTimer = 3;
          }
          if (pk.kind === 'package' && state.missionState === 'active'
            && state.missionIndex === 1 && state.missionStage === 0) {
            state.banner = 'PACKAGE PICKED UP — HEAT INCOMING';
            state.bannerTimer = 2.5;
            events = advanceMission(events);
          }
        }
      }
      // Busted: a police car stopped next to you on foot builds the meter.
      let copNear = false;
      for (const cop of state.police) {
        if (Math.abs(cop.speed) < 40 && dist(player.x, player.y, cop.x, cop.y) < 60) copNear = true;
      }
      if (copNear && state.wanted > 0) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 1.6) { state.over = 'busted'; events |= EVENT_BUSTED; }
      } else {
        state.bustedTimer = Math.max(0, state.bustedTimer - dt * 2);
      }
    }

    // ---- traffic AI ----------------------------------------------------------------
    for (const car of state.cars) {
      if (car.driver !== 'traffic' || car.dead || player.inCar === car) continue;
      // Drive straight along the current road; at a junction, maybe turn.
      const nearJunction = Math.abs(car.x - roadCentre(car.x)) < 8 && Math.abs(car.y - roadCentre(car.y)) < 8;
      if (nearJunction && rng.chance(0.012)) {
        const turn = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        car.angle += turn;
      }
      const target = rng.range(120, 190);
      car.speed += clamp(target - car.speed, -120 * dt, 120 * dt);
      // Traffic stays on road centres, so buildings never block it; the
      // position is still clamped to the city bounds.
      car.x = clamp(car.x + Math.cos(car.angle) * car.speed * dt, 20, CITY.size - 20);
      car.y = clamp(car.y + Math.sin(car.angle) * car.speed * dt, 20, CITY.size - 20);
      // Avoid the player's car a little: slow when close ahead.
      if (player.inCar && dist(car.x, car.y, player.x, player.y) < 90) car.speed *= 0.94;
    }

    // Car-car collisions (simple circle push + damage).
    const allCars = [...state.cars, ...state.police];
    for (let i = 0; i < allCars.length; i += 1) {
      for (let j = i + 1; j < allCars.length; j += 1) {
        const a = allCars[i]; const b = allCars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d > 0 && d < 46) {
          const push = (46 - d) / 2;
          const ux = (b.x - a.x) / d; const uy = (b.y - a.y) / d;
          if (player.inCar !== a) { a.x -= ux * push; a.y -= uy * push; }
          if (player.inCar !== b) { b.x += ux * push; b.y += uy * push; }
          const impact = Math.abs(a.speed - b.speed);
          if (impact > 120) { damageCar(a, 5); damageCar(b, 5); if (player.inCar === a || player.inCar === b) events |= EVENT_HURT; }
        }
      }
    }

    // ---- pedestrians -----------------------------------------------------------------
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      ped.turnTimer -= dt;
      if (ped.turnTimer <= 0) { ped.angle = rng.range(0, TAU); ped.turnTimer = rng.range(2, 6); }
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
      }
      const sp = ped.flee > 0 ? 150 : ped.speed;
      let nx = ped.x + Math.cos(ped.angle) * sp * dt;
      let ny = ped.y + Math.sin(ped.angle) * sp * dt;
      // Keep peds off the road centre and out of buildings: bounce off both.
      const probe = { x: nx, y: ny };
      if (collideBuildings(probe, 10)) { ped.angle += Math.PI / 2; nx = ped.x; ny = ped.y; }
      ped.x = clamp(nx, 12, CITY.size - 12);
      ped.y = clamp(ny, 12, CITY.size - 12);
    }
    // Downed pedestrians fade out after their timer; top the crowd back up
    // one at a time so the city never empties and nobody teleports.
    state.peds = state.peds.filter((p) => p.down <= 0 || p.health > 0);
    while (state.peds.length < 30) state.peds.push(makePed());

    // ---- wanted + police ---------------------------------------------------------------
    spawnPolice();
    let seen = false;
    for (const cop of state.police) {
      if (cop.dead) continue;
      const d = dist(cop.x, cop.y, player.x, player.y);
      if (d < 460) seen = true;
      // Chase: steer toward the player, ram on contact.
      const want = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle = angleLerp(cop.angle, want, clamp(dt * 2.4, 0, 1));
      const top = player.inCar ? 400 : 300;
      cop.speed += clamp(top - cop.speed, -300 * dt, 260 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      collideBuildings(cop, 24);
      cop.x = clamp(cop.x, 20, CITY.size - 20);
      cop.y = clamp(cop.y, 20, CITY.size - 20);
      // Ram damage to the player's car: a steady grind while in contact,
      // not an instant wreck — a chase should last minutes, not seconds.
      if (player.inCar && d < 48 && Math.abs(cop.speed) > 120) {
        damageCar(player.inCar, dt * 14);
        events |= EVENT_HURT;
      }
      // Police shoot when wanted >= 3 and the player is on foot nearby.
      if (state.wanted >= 3 && !player.inCar && d < 260 && rng.chance(dt * 1.4)) {
        player.health -= 4;
        player.hurtTimer = 0.2;
        events |= EVENT_HURT;
        if (player.health <= 0) { state.over = 'wasted'; events |= EVENT_WASTED; }
      }
    }
    if (state.wanted > 0) {
      if (seen) { state.seenTimer = 0; state.wantedTimer = 0; }
      else {
        state.seenTimer += dt;
        state.wantedTimer += dt;
        if (state.wantedTimer >= WANTED.coolPerStar) {
          state.wantedTimer = 0;
          setWanted(state.wanted - 1);
          if (state.wanted === 0) state.police = [];
        }
      }
    }
    // Ambient health regen, slow, so a run can recover between fights.
    if (player.health > 0 && player.health < PLAYER.health && !player.inCar) {
      player.health = Math.min(PLAYER.health, player.health + dt * 1.2);
    }
    if (player.inCar && player.inCar.dead) {
      // A wrecked car burns its driver.
      player.health -= dt * 6;
      if (player.health <= 0) { state.over = 'wasted'; events |= EVENT_WASTED; }
    }

    updateCamera();
    return events;
  }

  function updateCamera() {
    state.camX = clamp(player.x - 640, 0, CITY.size - 1280);
    state.camY = clamp(player.y - 360, 0, CITY.size - 720);
  }

  reset();
  return { state, reset, step, waypoint, startMission, nextMission, setWanted, addWanted };
}
