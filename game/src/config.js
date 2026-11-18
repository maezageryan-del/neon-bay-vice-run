// Neon Bay: Vice Run — every tuning number and colour in one place.
// The view is a fixed 1280x720 logical canvas; the world is a much larger
// top-down city the camera scrolls across, so no rule depends on screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The city: a square world of blocks separated by a road grid. */
export const CITY = {
  size: 3200,          // world is size x size pixels
  block: 400,          // one city block (building plot + sidewalks)
  road: 120,           // road width centred on each grid line
  sidewalk: 26,        // sidewalk band inside each block edge
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 150,
  runSpeed: 265,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 340,
  brake: 520,
  reverse: 150,
  maxSpeed: 430,
  maxReverse: 130,
  turnRate: 2.6,       // rad/s at full lock, scaled by speed
  friction: 0.9,       // velocity kept per second-ish (applied as damp)
  health: 100,
};

export const WANTED = {
  max: 5,
  /** Seconds without being seen before one star fades. */
  coolPerStar: 9,
  policePerStar: 2,    // target police count = stars * this (capped)
  policeCap: 8,
};

export const PALETTE = {
  backdrop: '#0b0e1a',
  road: '#232636',
  roadLine: '#e8c547',
  sidewalk: '#3a3f55',
  grass: '#1d2b26',
  buildingRoof: ['#2e3350', '#38304e', '#26384a', '#40304a', '#2a2f45'],
  buildingEdge: '#12141f',
  neonPink: '#ff2e88',
  neonCyan: '#22e6e6',
  neonAmber: '#ffb02e',
  neonViolet: '#9b5cff',
  player: '#ffd94d',
  playerSkin: '#e8a87c',
  ped: ['#e86a92', '#5ec8e6', '#a8e65e', '#e6b85e', '#b85ee6', '#5ee6a8'],
  carBody: ['#e63e3e', '#3e7de6', '#e6c93e', '#3ee6a0', '#e65ee0', '#e67e3e', '#c0c8d8', '#5e5ee6'],
  policeBody: '#eef1f8',
  policeStripe: '#2e5ce6',
  text: '#f2f4ff',
  muted: '#9aa3c0',
  panel: 'rgba(14,16,30,0.88)',
  panelEdge: '#ff2e88',
  cash: '#7dff8a',
  health: '#ff5e6a',
  star: '#ffd94d',
  starOff: '#4a5068',
  waypoint: '#22e6e6',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** localStorage key for the persistent best save. */
export const SAVE_KEY = 'neon-bay-vice-run.save.v1';

/** Neon sign names painted on buildings (all original). */
export const SIGN_NAMES = [
  'NEON BAY', 'VICE RUN', 'BAYVIEW DINER', 'PALM COURT', 'HOTEL AZURE',
  'NEON ARCADE', 'BAY RECORDS', 'VICE MOTORS', 'CLUB MIRAGE', 'TACO LAGO',
  'NEON PAWN', 'BAY CINEMA', 'SURF & TURF', 'HOTEL CORAL', 'VICE GYM',
  'BAY PHARMACY', 'NEON NOODLES', 'PIER 9', 'CLUB SOLSTICE', 'BAY BAKERY',
];

/** The three chained story missions. Waypoints are filled in by the world. */
export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    giver: 'Marlo at the Bayview Diner',
    brief: 'Marlo needs wheels, fast. Steal any car on the street and deliver it to the Neon Garage across town. The heat will notice — one star the moment you pull the driver out.',
    reward: 250,
    stages: ['Steal a car (walk up and press E)', 'Deliver the car to the Neon Garage'],
  },
  {
    id: 'bayview-run',
    name: 'Bayview Run',
    giver: 'Marlo at the Bayview Diner',
    brief: 'A package is waiting by Pier 9. Pick it up on foot, then drive it to the Palm Court drop. Expect two stars of heat the whole way — lose them or outrun them, but deliver.',
    reward: 450,
    stages: ['Pick up the package at Pier 9', 'Deliver the package to Palm Court'],
  },
  {
    id: 'vice-run',
    name: 'Vice Run',
    giver: 'Marlo at the Bayview Diner',
    brief: 'The big one. Grab the marked getaway car, and the whole bay lights up: three stars, every unit in the city. Cross Neon Bay and reach the spray shop before the timer dies. Survive.',
    reward: 900,
    stages: ['Take the getaway car', 'Reach the spray shop before time runs out'],
  },
];
