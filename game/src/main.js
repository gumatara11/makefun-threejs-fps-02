// DUSTLINE — emergency build for make.fun threejs-fps-02.
// The orchestrator: renderer, fixed 60 Hz loop, player input, bots, rounds,
// grenades, HUD, sound, pause (AMB-30), shot poses, bench and autopilot.
// The player is an attacker; A1 carries the bomb at round start.
import * as THREE from 'three';
import { CONFIG, WEAPONS } from './config.js';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createCombat, createHitboxes } from './combat.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createPlayer } from './player.js';
import { createWeaponSet } from './weapons.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { findPath, nearestNode } from './physics.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '0', 10) || (Date.now() % 2147483647);
const BENCH = params.get('bench') === '1';
const AUTO = params.get('auto') === '1';
const DEBUG_GRAPH = params.get('debuggraph') === '1';
const HEADLESS = SHOT !== null || BENCH || AUTO;

window.addEventListener('error', (event) => {
  window.__lastError = String(event.message);
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(SEED);

// --- Renderer, scene, camera -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(PALETTE.canvas, CONFIG.fogNear, CONFIG.fogFar);

const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
world.graphLines.visible = DEBUG_GRAPH;
const combat = createCombat(scene, world.shootables);
const grenades = createGrenades(scene, world.colliders, world.shootables);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders, -20, 0);
const weapons = createWeaponSet(camera);

// --- State -------------------------------------------------------------------
let clockTime = 0;
let started = false;
let paused = false;
let simRunning = false;
let matchStarted = false;
let buyMenuOpen = false;
let selected = 'weapon'; // 'weapon' | 'frag'
let lastWeapon = 'P9';
let prevFiring = false;
let autoFiring = false;
let autoHoldingE = false;
let lastBeep = -10;
let benchDone = false;
const simSamples = [];
const frameTimes = [];
const hearEvents = []; // { x, z, radius, until }

const bombMaterial = new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 1.2 });
const bombMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.4), bombMaterial);
bombMesh.visible = false;
scene.add(bombMesh);
const bombLight = new THREE.PointLight(0xf0a830, 0, 6);
scene.add(bombLight);

const droppedWeapons = [];
function spawnDroppedWeapon(weapon, x, z) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.1, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.35 }),
  );
  mesh.position.y = 0.12;
  group.add(mesh);
  group.position.set(x, 0, z);
  scene.add(group);
  droppedWeapons.push({ group, weapon, x, z });
}
function clearDroppedWeapons() {
  for (const dropped of droppedWeapons) scene.remove(dropped.group);
  droppedWeapons.length = 0;
}

function pushHearEvent(x, z, radius, ttl = 1.5) {
  hearEvents.push({ x, z, radius, until: clockTime + ttl });
}

// --- Actors ------------------------------------------------------------------
const playerActor = {
  id: 'player',
  name: 'You',
  team: 'attackers',
  isPlayer: true,
  body: player.state,
  hitMeshes: [],
  health: CONFIG.hp,
  alive: true,
  weapon: 'P9',
  money: CONFIG.startMoney,
  frags: 0,
  hasBomb: false,
  site: 'A',
};
const playerBoxes = createHitboxes(playerActor);
playerActor.hitMeshes = playerBoxes.meshes;
for (const mesh of playerBoxes.meshes) {
  mesh.userData.baseY = mesh.position.y;
  scene.add(mesh);
}

let bots;
let rounds;
const actors = [playerActor];

const G = {
  get time() {
    return clockTime;
  },
  random,
  combat,
  get bots() {
    return bots;
  },
  getActors() {
    return actors;
  },
  getPlayer() {
    return playerActor;
  },
  getBomb() {
    return rounds.state.bomb;
  },
  // Health lives with the actor. Returns true when the hit killed the victim.
  applyDamage(victim, amount, attacker) {
    if (victim.isPlayer) {
      victim.health -= amount;
      if (victim.health > 0) return false;
      victim.health = 0;
      victim.alive = false;
      if (victim.hasBomb) {
        victim.hasBomb = false;
        G.onBombDropped(victim);
      }
      return true;
    }
    return bots.damage(victim, amount, attacker);
  },
  // Single entry point for every hit: rounds owns the kill, this owns the feedback.
  onDamage(victim, amount, weapon, attacker) {
    if (!victim.alive) return;
    const killed = rounds.damageActor(victim, amount, attacker, weapon);
    if (attacker === playerActor) {
      hud.hitMarker(killed);
      audio.hit(killed);
    }
    if (victim === playerActor) audio.hurt();
  },
  onBotShot(bot, result) {
    const distance = Math.hypot(bot.body.position.x - player.state.position.x, bot.body.position.z - player.state.position.z);
    if (distance < 45) audio.shot(bot.weapon === 'VK47' ? 'vk' : 'p9', true);
    pushHearEvent(bot.body.position.x, bot.body.position.z, bot.weapon === 'VK47' ? CONFIG.hearShotVK : CONFIG.hearShotP9);
  },
  onBombPickup(actor) {
    if (actor === playerActor) {
      hud.showBanner('You have the bomb — plant it on A or B', 3000);
      audio.click();
    }
  },
  onBombDropped(actor) {
    const bomb = rounds.state.bomb;
    bomb.status = 'dropped';
    bomb.carrier = null;
    bomb.position.copy(actor.body.position);
    if (actor === playerActor) hud.showBanner('Bomb dropped!', 2000);
  },
  onKill(victim, attacker, weapon) {
    const victimName = victim.isPlayer ? 'You' : victim.id;
    const killerName = attacker ? (attacker.isPlayer ? 'You' : attacker.id) : '—';
    hud.killFeed(`${killerName} ▸ ${victimName}  [${weapon || 'frag'}]`);
    if (victim.weapon === 'VK47') {
      spawnDroppedWeapon('VK47', victim.body.position.x, victim.body.position.z);
    }
    if (victim === playerActor) hud.showBanner('Eliminated — next round', 3000);
  },
  onRoundStart(round) {
    hud.showBanner(`Round ${round}`, 2000);
    hud.setScore(rounds.state.scoreA, rounds.state.scoreD);
    clearDroppedWeapons();
    grenades.reset();
  },
  onLiveStart() {},
  onRoundEnd(winner, reason, scoreA, scoreD) {
    const winnerName = winner === 'attackers' ? 'Attackers' : 'Defenders';
    hud.showBanner(`${winnerName} win the round — ${reason}`, 3000);
    hud.setScore(scoreA, scoreD);
    if (winner === 'attackers') audio.roundWin();
    else audio.roundLose();
  },
  onMatchEnd(scoreA, scoreD) {
    document.exitPointerLock?.();
    const won = scoreA > scoreD;
    hud.showOverlay('end', `Attackers ${scoreA} — ${scoreD} Defenders. ${won ? 'You win the match.' : 'You lose the match.'}`);
    simRunning = false;
  },
  onPlant(actor, site) {
    hud.showBanner(actor === playerActor ? `You planted the bomb on site ${site}!` : `Bomb planted on site ${site}!`, 3000);
    audio.beep(false);
    pushHearEvent(rounds.state.bomb.position.x, rounds.state.bomb.position.z, CONFIG.hearPlant, 2);
  },
  onDefuse(actor) {
    hud.showBanner(actor === playerActor ? 'You defused the bomb!' : 'Bomb defused!', 3000);
    audio.beep(false);
    pushHearEvent(rounds.state.bomb.position.x, rounds.state.bomb.position.z, CONFIG.hearDefuse, 2);
  },
  onExplode(position) {
    audio.explosion();
    pushHearEvent(position.x, position.z, 45, 2);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }),
    );
    flash.position.copy(position).y += 1;
    flash.scale.setScalar(0.5);
    scene.add(flash);
    let life = 0.6;
    const tick = () => {
      life -= 1 / 60;
      flash.scale.setScalar(0.5 + (0.6 - life) * 16);
      flash.material.opacity = Math.max(0, life / 0.6) * 0.9;
      if (life > 0) requestAnimationFrame(tick);
      else scene.remove(flash);
    };
    requestAnimationFrame(tick);
  },
  onPlantProgress(fraction) {
    hud.setProgress('Planting…', fraction);
  },
  onDefuseProgress(fraction) {
    hud.setProgress('Defusing…', fraction);
  },
  onBuy(actor, item) {
    if (actor !== playerActor) return;
    if (item === 'VK47') {
      weapons.buy('VK47');
      weapons.switchTo('VK47');
    }
    audio.buy();
    hud.setMoney(actor.money);
  },
  playerReset(actor, wasAlive) {
    player.teleport(-20, 0, -Math.PI / 2);
    if (wasAlive) weapons.refillMagFree();
    else {
      weapons.resetToPistol();
      actor.weapon = 'P9';
    }
    selected = 'weapon';
    buyMenuOpen = false;
    hud.hideBuyMenu();
  },
};

bots = createBots(scene, world, G);
bots.makeBot('A1', 'attackers', 'rusher', -21, -3, 'A');
bots.makeBot('A2', 'attackers', 'lurker', -21, 3, 'B');
bots.makeBot('D1', 'defenders', 'holder', 16, -2, 'A');
bots.makeBot('D2', 'defenders', 'holder', 16, 2, 'B');
bots.makeBot('D3', 'defenders', 'rotator', 18, 0, 'mid');
for (const bot of bots.list) actors.push(bot);

rounds = createRounds(G);

// --- Input -------------------------------------------------------------------
const input = createInput(renderer.domElement, (locked) => {
  if (HEADLESS) return;
  if (!locked && started && !rounds.state.matchOver) {
    // AMB-30: pointer lock lost mid-match -> pause screen with the final controls
    // and a Lanjut button. The simulation stays frozen until the player clicks it.
    paused = true;
    simRunning = false;
    buyMenuOpen = false;
    hud.hideBuyMenu();
    hud.showOverlay('paused');
  } else if (locked && paused) {
    paused = false;
    simRunning = true;
    hud.hideOverlay();
  }
});
document.addEventListener('pointerlockerror', () => {
  if (HEADLESS) return;
  if (started && !rounds.state.matchOver) {
    paused = true;
    simRunning = false;
    hud.showOverlay('paused');
  }
});

hud.onPlay(() => {
  audio.ensure();
  if (rounds.state.matchOver) {
    weapons.resetToPistol();
    playerActor.weapon = 'P9';
    playerActor.frags = 0;
    selected = 'weapon';
    clearDroppedWeapons();
    rounds.startMatch();
    matchStarted = true;
  } else if (!matchStarted) {
    rounds.startMatch();
    matchStarted = true;
  }
  started = true;
  paused = false;
  simRunning = true;
  hud.hideOverlay();
  if (!HEADLESS) input.requestLock();
});

// --- Shooting ----------------------------------------------------------------
function fireOnce(weaponKey) {
  const def = WEAPONS[weaponKey];
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed());
  const result = combat.shoot(playerActor, origin, direction, def, actors, spread, random);
  audio.shot(def.sound);
  pushHearEvent(
    player.state.position.x,
    player.state.position.z,
    weaponKey === 'VK47' ? CONFIG.hearShotVK : CONFIG.hearShotP9,
  );
  player.recoil(def.kick, (random() - 0.5) * def.kick * 0.6);
  if (result && result.actor) G.onDamage(result.actor, result.damage, weaponKey, playerActor);
}

function handlePressed(pressed) {
  if (buyMenuOpen) {
    if (pressed.has('Digit1')) {
      const result = rounds.buy(playerActor, 'VK47');
      if (!result.ok) audio.denied();
    } else if (pressed.has('Digit2')) {
      const result = rounds.buy(playerActor, 'FRAG');
      if (!result.ok) audio.denied();
    }
    if (pressed.has('KeyB') || pressed.has('Escape')) {
      buyMenuOpen = false;
      hud.hideBuyMenu();
    }
    return;
  }
  if (pressed.has('Digit1')) {
    selected = 'weapon';
    weapons.switchTo(playerActor.weapon);
  } else if (pressed.has('Digit2')) {
    selected = 'weapon';
    weapons.switchTo('P9');
  } else if (pressed.has('Digit3')) {
    if (playerActor.frags > 0) {
      lastWeapon = weapons.current;
      selected = 'frag';
    } else {
      audio.denied();
    }
  } else if (pressed.has('Digit4') || pressed.has('Digit5')) {
    // Smoke and Flash are cut in the emergency scope.
    audio.denied();
  }
  if (pressed.has('KeyG') && weapons.current === 'VK47') {
    spawnDroppedWeapon('VK47', player.state.position.x, player.state.position.z);
    playerActor.weapon = 'P9';
    weapons.switchTo('P9');
    audio.click();
  }
  if (pressed.has('KeyF')) {
    for (let i = droppedWeapons.length - 1; i >= 0; i -= 1) {
      const dropped = droppedWeapons[i];
      const distance = Math.hypot(dropped.x - player.state.position.x, dropped.z - player.state.position.z);
      if (distance < 1.5) {
        playerActor.weapon = dropped.weapon;
        weapons.buy(dropped.weapon);
        weapons.switchTo(dropped.weapon);
        scene.remove(dropped.group);
        droppedWeapons.splice(i, 1);
        audio.click();
        break;
      }
    }
  }
  if (pressed.has('KeyB')) {
    if (rounds.state.phase === 'buy') {
      buyMenuOpen = true;
      hud.setMoney(playerActor.money);
      hud.showBuyMenu(
        playerActor.money >= WEAPONS.VK47.price && playerActor.weapon !== 'VK47',
        playerActor.money >= 300 && playerActor.frags < 1,
      );
    } else {
      audio.denied();
    }
  }
  if (pressed.has('KeyR')) {
    if (weapons.reload()) audio.reload();
  }
}

// --- Autopilot (test only: ?auto=1) -------------------------------------------
const autoRay = new THREE.Raycaster();
let autoPath = [];
let autoGoalX = null;
let autoGoalZ = null;
function autoStep(dt) {
  const state = rounds.state;
  if (state.phase === 'buy') {
    if (playerActor.money >= WEAPONS.VK47.price && playerActor.weapon === 'P9') rounds.buy(playerActor, 'VK47');
    return;
  }
  if (state.phase !== 'live' || !playerActor.alive) {
    autoFiring = false;
    autoHoldingE = false;
    return;
  }
  const eye = new THREE.Vector3(
    player.state.position.x,
    player.state.position.y + player.state.eye,
    player.state.position.z,
  );
  let best = null;
  let bestDistance = Infinity;
  for (const bot of bots.list) {
    if (!bot.alive || bot.team === 'attackers') continue;
    const torso = new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.05, bot.body.position.z);
    const distance = eye.distanceTo(torso);
    if (distance > bestDistance) continue;
    const direction = torso.clone().sub(eye).normalize();
    autoRay.set(eye, direction);
    autoRay.far = distance;
    const hits = autoRay.intersectObjects(world.shootables.concat(bot.hitMeshes), false);
    if (hits.length > 0 && hits[0].object.userData.actor === bot) {
      best = bot;
      bestDistance = distance;
    }
  }
  if (best) {
    // Planting beats shooting: carrying the bomb in a plant zone, hold still and
    // plant instead of trading shots at a far target.
    if (playerActor.hasBomb && rounds.inPlantZone(playerActor, 'A')) {
      autoFiring = false;
      autoHoldingE = true;
      // Stand still (friction through player.step) so speed drops below the
      // 0.5 m/s plant gate; returning without stepping would freeze velocity.
      player.step(dt, new Set());
      return;
    }
    const dx = best.body.position.x - player.state.position.x;
    const dz = best.body.position.z - player.state.position.z;
    const dy = best.body.position.y + 1.05 - (player.state.position.y + player.state.eye);
    player.state.yaw = Math.atan2(-dx, -dz);
    player.state.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    // Pulse the trigger so the semi-auto P9 keeps firing while the target is up.
    autoFiring = clockTime % 0.3 < 0.15;
    autoHoldingE = false;
    return;
  }
  autoFiring = false;
  // Planting beats moving: carrying the bomb in a plant zone, hold still and
  // plant instead of jittering around the goal node (speed spikes reset plant).
  if (playerActor.hasBomb && rounds.inPlantZone(playerActor, 'A')) {
    autoHoldingE = true;
    player.step(dt, new Set());
    return;
  }
  // Play the objective: fetch a dropped bomb, plant with the bomb, otherwise hunt.
  let tx;
  let tz;
  if (state.bomb.status === 'dropped') {
    tx = state.bomb.position.x;
    tz = state.bomb.position.z;
  } else if (playerActor.hasBomb) {
    tx = 18;
    tz = -9;
  } else {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const bot of bots.list) {
      if (!bot.alive || bot.team === 'attackers') continue;
      const d = Math.hypot(bot.body.position.x - player.state.position.x, bot.body.position.z - player.state.position.z);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = bot;
      }
    }
    if (!nearest) return;
    tx = nearest.body.position.x;
    tz = nearest.body.position.z;
  }
  // Replan only when the goal moved or the path ran out: replanning every second
  // snaps the start back to the node behind and the player walks back and forth.
  if (autoPath.length === 0 || autoGoalX === null || Math.hypot(tx - autoGoalX, tz - autoGoalZ) > 3) {
    const start = nearestNode(world.nodes, player.state.position.x, player.state.position.z);
    const goal = nearestNode(world.nodes, tx, tz);
    autoPath = findPath(world.nodes, world.edges, start, goal);
    autoGoalX = tx;
    autoGoalZ = tz;
    // Skip the first node when the next one is already closer (we are past it).
    if (autoPath.length > 1) {
      const first = world.nodes[autoPath[0]];
      const second = world.nodes[autoPath[1]];
      const dFirst = Math.hypot(first.x - player.state.position.x, first.z - player.state.position.z);
      const dSecond = Math.hypot(second.x - player.state.position.x, second.z - player.state.position.z);
      if (dSecond < dFirst) autoPath.shift();
    }
  }
  const node = autoPath.length > 0 ? world.nodes[autoPath[0]] : { x: tx, z: tz };
  const dx = node.x - player.state.position.x;
  const dz = node.z - player.state.position.z;
  if (Math.hypot(dx, dz) < 0.6 && autoPath.length > 0) autoPath.shift();
  const length = Math.hypot(dx, dz) || 1;
  const sin = Math.sin(player.state.yaw);
  const cos = Math.cos(player.state.yaw);
  const forward = (dx / length) * -sin + (dz / length) * -cos;
  const strafe = (dx / length) * cos + (dz / length) * -sin;
  const keys = new Set();
  if (forward > 0.3) keys.add('KeyW');
  else if (forward < -0.3) keys.add('KeyS');
  if (strafe > 0.3) keys.add('KeyD');
  else if (strafe < -0.3) keys.add('KeyA');
  player.step(dt, keys);
  autoHoldingE = playerActor.hasBomb && rounds.inPlantZone(playerActor, 'A');
}

// --- Fixed-step tick -----------------------------------------------------------
function tick(dt) {
  clockTime += dt;
  const state = rounds.state;
  const keys = AUTO ? new Set() : input.state.keys;
  if (AUTO) autoStep(dt);
  if (playerActor.alive) {
    const look = input.takeLook();
    if (look.x !== 0 || look.y !== 0) player.look(look.x, look.y);
  }
  const pressed = input.takePressed();
  if (pressed.size > 0 && playerActor.alive) handlePressed(pressed);
  if (playerActor.alive && !AUTO) player.step(dt, keys);
  weapons.step(dt);

  const holdingE = AUTO ? autoHoldingE : keys.has('KeyE') && !buyMenuOpen;
  rounds.step(dt, { holdingE });

  // Firing: P9 fires once per click; VK-47 is automatic (AMB-02 accumulator).
  const firing =
    (input.state.firing || autoFiring) &&
    !buyMenuOpen &&
    selected !== 'frag' &&
    playerActor.alive &&
    (state.phase === 'live' || state.phase === 'buy');
  if (firing) {
    if (weapons.current === 'P9') {
      if (!prevFiring && weapons.ready() && weapons.takeRound()) fireOnce('P9');
    } else {
      const shots = weapons.triggerHeld(dt);
      for (let i = 0; i < shots; i += 1) fireOnce('VK47');
    }
  } else if (selected === 'frag' && (input.state.firing || autoFiring) && !prevFiring && playerActor.frags > 0) {
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    grenades.throwFrag(playerActor, origin, direction);
    playerActor.frags -= 1;
    audio.click();
    selected = 'weapon';
    weapons.switchTo(lastWeapon);
  }
  prevFiring = input.state.firing || autoFiring;

  bots.perceive(clockTime, dt, actors, hearEvents, state.number);
  bots.step(dt, clockTime, state, actors);
  grenades.step(dt, actors, (actor, damage, source, attacker) => {
    G.onDamage(actor, damage, source, attacker);
  }, (position) => {
    audio.explosion();
    pushHearEvent(position.x, position.z, 45, 2);
  });
  combat.stepTracers(dt);
  for (let i = hearEvents.length - 1; i >= 0; i -= 1) {
    if (hearEvents[i].until < clockTime) hearEvents.splice(i, 1);
  }

  // Player hitboxes follow the body.
  for (const mesh of playerActor.hitMeshes) {
    mesh.position.set(player.state.position.x, player.state.position.y + mesh.userData.baseY, player.state.position.z);
  }
  // Bomb mesh: visible when dropped or planted, blinking while planted.
  const bomb = state.bomb;
  if (bomb.status === 'dropped' || bomb.status === 'planted') {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.position.x, 0.12, bomb.position.z);
    bombMaterial.emissiveIntensity = bomb.status === 'planted' ? (Math.floor(clockTime * 4) % 2 === 0 ? 2.2 : 0.4) : 1.2;
    bombLight.position.set(bomb.position.x, 1, bomb.position.z);
    bombLight.intensity = bomb.status === 'planted' ? (Math.floor(clockTime * 4) % 2 === 0 ? 8 : 0) : 0;
    if (bomb.status === 'planted') {
      const interval = bomb.timer < 10 ? 0.5 : 1;
      if (clockTime - lastBeep >= interval) {
        lastBeep = clockTime;
        audio.beep(bomb.timer < 10);
      }
    }
  } else {
    bombMesh.visible = false;
    bombLight.intensity = 0;
  }
}

// --- HUD sync ------------------------------------------------------------------
function syncHud() {
  const state = rounds.state;
  hud.setHealth(playerActor.health);
  hud.setMoney(playerActor.money);
  if (selected === 'frag') {
    hud.setAmmo(playerActor.frags, 0);
    hud.setWeapon('FRAG');
  } else {
    const weaponState = weapons.state;
    hud.setAmmo(weaponState.mag, weaponState.reserve);
    hud.setWeapon(weapons.current === 'VK47' ? 'VK-47' : 'P9');
  }
  if (state.phase === 'buy') hud.setTimer(state.timeLeft, 'buy');
  else if (state.bomb.status === 'planted') hud.setTimer(state.bomb.timer, 'bomb');
  else hud.setTimer(Math.max(0, state.timeLeft), 'live');
  hud.setScore(state.scoreA, state.scoreD);
  const aliveAttackers = (playerActor.alive ? 1 : 0) + bots.aliveByTeam('attackers').length;
  hud.setAlive(aliveAttackers, bots.aliveByTeam('defenders').length);
  const bomb = state.bomb;
  if (bomb.status === 'carried' && bomb.carrier) {
    hud.setBomb(bomb.carrier === playerActor ? 'YOU CARRY THE BOMB' : `${bomb.carrier.id.toUpperCase()} CARRIES THE BOMB`);
  } else if (bomb.status === 'dropped') {
    hud.setBomb('BOMB DROPPED');
  } else if (bomb.status === 'planted') {
    hud.setBomb(`BOMB PLANTED ${bomb.site} — ${Math.ceil(bomb.timer)}s`);
  } else {
    hud.setBomb('');
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.y = body.yaw;
  camera.rotation.x = body.pitch;
  camera.rotation.z = 0;
}

// --- Shot poses (?shot=start|play|plant|end) ------------------------------------
function setupShot(name) {
  started = true;
  simRunning = true;
  hud.hideOverlay();
  if (name === 'start') {
    simRunning = false;
    hud.showOverlay('start');
    return;
  }
  rounds.startMatch();
  matchStarted = true;
  if (name === 'play') {
    playerActor.money = 5000;
    rounds.buy(playerActor, 'VK47');
    rounds.buy(playerActor, 'FRAG');
    const state = rounds.state;
    state.number = 2;
    state.scoreA = 1;
    state.scoreD = 0;
    state.phase = 'live';
    state.timeLeft = 60;
    player.teleport(-4, 0, -Math.PI / 2);
    const d3 = bots.list.find((b) => b.id === 'D3');
    d3.body.position.set(6, 0, 0);
    d3.yaw = Math.PI / 2;
    for (let i = 0; i < 30; i += 1) tick(1 / 60);
  } else if (name === 'plant') {
    playerActor.money = 5000;
    rounds.buy(playerActor, 'VK47');
    rounds.buy(playerActor, 'FRAG');
    const state = rounds.state;
    state.phase = 'live';
    state.timeLeft = 60;
    const a1 = bots.list.find((b) => b.id === 'A1');
    a1.hasBomb = false;
    state.bomb.status = 'planted';
    state.bomb.carrier = null;
    state.bomb.site = 'A';
    state.bomb.position.set(20, 0, -8);
    state.bomb.timer = 20;
    player.teleport(15.5, 0, -7.5, Math.atan2(-(20 - 15.5), -(-8 - -7.5)));
    const d1 = bots.list.find((b) => b.id === 'D1');
    d1.body.position.set(21, 0, -5.5);
    d1.yaw = Math.atan2(-(20 - 21), -(-8 - -5.5));
    for (let i = 0; i < 60; i += 1) tick(1 / 60);
  } else if (name === 'end') {
    const state = rounds.state;
    state.scoreA = 5;
    state.scoreD = 3;
    state.phase = 'matchEnd';
    state.matchOver = true;
    hud.showOverlay('end', 'Attackers 5 — 3 Defenders. You win the match.');
  }
  hud.hideBanner();
  simRunning = false;
}

function paintTwiceThenReady() {
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
}

// --- Main loop -------------------------------------------------------------------
const FIXED = 1 / 60;
let accumulator = 0;
let lastNow = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  if (BENCH) frameTimes.push(frameDt * 1000);
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= FIXED && steps < 5) {
    if (simRunning) {
      const t0 = performance.now();
      tick(FIXED);
      simSamples.push(performance.now() - t0);
      if (simSamples.length > 1200) simSamples.shift();
    }
    accumulator -= FIXED;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;
  syncCamera();
  syncHud();
  renderer.render(scene, camera);
  if (BENCH && !benchDone && clockTime >= 10) {
    benchDone = true;
    const sorted = simSamples.slice().sort((a, b) => a - b);
    const average = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const fps = 1000 / (frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length));
    window.__bench = {
      fps: Math.round(fps * 10) / 10,
      simAvgMs: Math.round(average * 100) / 100,
      simP99Ms: Math.round(p99 * 100) / 100,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
    document.title = `BENCH fps=${window.__bench.fps} simAvg=${window.__bench.simAvgMs}ms simP99=${window.__bench.simP99Ms}ms calls=${window.__bench.drawCalls} tris=${window.__bench.triangles}`;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__DUSTLINE__ = {
  version: '0.1.0-emergency',
  state: rounds.state,
  get simTime() {
    return clockTime;
  },
  get player() {
    return playerActor;
  },
  get bots() {
    return bots.list;
  },
  get phase() {
    return rounds.state.phase;
  },
  start() {
    if (!matchStarted) {
      rounds.startMatch();
      matchStarted = true;
      started = true;
      simRunning = true;
    }
  },
  teleport(x, z, yaw) {
    player.teleport(x, z, yaw);
  },
  giveMoney(amount) {
    playerActor.money = amount;
  },
  buy(item) {
    return rounds.buy(playerActor, item);
  },
  setPhase(phase) {
    rounds.state.phase = phase;
  },
  // Test-only: hand the bomb to the player (as if the carrier had dropped it).
  debugGiveBomb() {
    const bomb = rounds.state.bomb;
    if (bomb.carrier && bomb.carrier !== playerActor) bomb.carrier.hasBomb = false;
    playerActor.hasBomb = true;
    bomb.status = 'carried';
    bomb.carrier = playerActor;
    G.onBombPickup(playerActor);
  },
  // Test-only: resume the fixed-step simulation (shot poses freeze it).
  resume() {
    started = true;
    simRunning = true;
  },
  // Test-only: live internals for diagnosing plant/defuse behavior.
  get debugState() {
    return {
      autoHoldingE,
      autoFiring,
      plantProgress: rounds.state.plant ? rounds.state.plant.progress : null,
      carrier: rounds.state.bomb.carrier ? rounds.state.bomb.carrier.id : null,
      bombStatus: rounds.state.bomb.status,
      playerSpeed: Math.hypot(player.state.velocity.x, player.state.velocity.z),
      inZoneA: rounds.inPlantZone(playerActor, 'A'),
      phase: rounds.state.phase,
    };
  },
};

hud.showOverlay('start');
if (SHOT) {
  setupShot(SHOT);
  syncCamera();
  syncHud();
  paintTwiceThenReady();
} else if (BENCH || AUTO) {
  rounds.startMatch();
  matchStarted = true;
  started = true;
  simRunning = true;
  hud.hideOverlay();
}
requestAnimationFrame(frame);
