// DUSTLINE — emergency-scope constants for threejs-fps-02.
// Frozen numbers are taken from the Final Design Specification; the emergency scope
// (2 weapons, 1 grenade, 3v3 bots, first-to-5, simplified map/economy) is the owner's
// 16 Nov 2026 decision for this competition only. Nothing here changes a frozen number.
export const CONFIG = {
  // Match
  hp: 100,
  winScore: 5,
  maxRounds: 9,
  buySeconds: 12,
  roundSeconds: 100,
  plantSeconds: 3.2,
  bombSeconds: 35,
  defuseSeconds: 5.0,
  endBannerSeconds: 4,
  // Movement
  walkSpeed: 4.9,
  crouchSpeed: 2.4,
  jumpSpeed: 6.2,
  gravity: 20,
  // Damage zones
  headMult: 2,
  legsMult: 0.75,
  // Economy (frozen)
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  plantReward: 300,
  defuseReward: 300,
  moneyCap: 9000,
  // Map (emergency: Foundry Yard simplified, 48 x 36 m)
  mapWidth: 48,
  mapDepth: 36,
  wallHeight: 4.6,
  // Bot perception (frozen)
  fovDeg: 100,
  viewDistance: 55,
  losCheckSeconds: 0.12,
  visibleSeconds: 0.15,
  memorySeconds: 4.0,
  reactionSeconds: 0.28,
  reactionRusher: 0.25,
  reactionHolder: 0.30,
  peripheralDeg: 130,
  peripheralMeters: 6,
  // Bot accuracy: added spread by round (frozen)
  spreadRounds1to3: 2.2,
  spreadRounds4to7: 1.8,
  spreadRounds8plus: 1.5,
  burstMin: 3,
  burstMax: 5,
  burstPauseSeconds: 0.4,
  // Hearing radii (frozen)
  hearShotVK: 45,
  hearShotP9: 35,
  hearStepsRun: 12,
  hearStepsCrouch: 4,
  hearPlant: 15,
  hearDefuse: 10,
  hearReload: 6,
  hearBounce: 8,
  // Visual / performance budgets (frozen)
  fogNear: 25,
  fogFar: 70,
  maxDrawCalls: 180,
  maxTriangles: 350000,
  maxParticles: 300,
  maxTracers: 32,
};

// Weapons: P9 (starter pistol, free) and VK-47 (frozen stats). Longbow, Kestrel-9 and
// Breacher are cut for the emergency scope — they stay in the -01 specification.
export const WEAPONS = {
  P9: {
    name: 'P9',
    price: 0,
    damage: 26,
    rpm: 400,
    mag: 12,
    reserve: 48,
    reloadSeconds: 1.6,
    spreadStill: 0.004,
    spreadMove: 0.03,
    kick: 0.006,
    auto: false,
    tracer: 0xf0a830,
    sound: 'p9',
  },
  VK47: {
    name: 'VK-47',
    price: 2700,
    damage: 34,
    rpm: 600,
    mag: 30,
    reserve: 90,
    reloadSeconds: 2.4,
    spreadStill: 0.003,
    spreadMove: 0.026,
    kick: 0.011,
    auto: true,
    tracer: 0xf0a830,
    sound: 'vk',
  },
};

// Frag grenade (frozen stats). Smoke and Flash are cut for the emergency scope.
export const FRAG = {
  price: 300,
  damageCenter: 85,
  damageEdge: 10,
  radius: 6,
  fuseSeconds: 1.5,
  throwSpeed: 18,
  restitution: 0.4,
  maxPerRound: 1,
};

// Team colours: attackers teal, defenders amber/rust on charcoal bodies.
export const TEAM = {
  attackers: { name: 'Attackers', marker: 0x2ec4b6, visor: 0x2ec4b6 },
  defenders: { name: 'Defenders', marker: 0xf0a830, visor: 0xff5a1f },
};
