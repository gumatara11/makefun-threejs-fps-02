// Bot AI, emergency scope: 3v3 (player + 2 attacker bots vs 3 defender bots).
// Roles: A1 rusher (bomb carrier, site A), A2 lurker (site B, crouch last 15 m),
// D1 site-A holder, D2 site-B holder, D3 mid rotator.
// Approved rules applied: AMB-11 target priority with hysteresis, AMB-15 waypoint
// avoid list + A* replan, AMB-16 stuck detection (no teleport), AMB-27 staggered
// perception (max 2 bots per tick + cache), AMB-30 does not touch bots.
// Perception (frozen): FOV 100 deg, view 55 m, LOS every 0.12 s staggered,
// 0.15 s continuous visibility, reaction 0.25/0.28/0.30 s, memory 4.0 s.
import * as THREE from 'three';
import { CONFIG, WEAPONS, TEAM } from './config.js';
import { createBody, findPath, nearestNode, flatDistance } from './physics.js';

const EYE_HEIGHT = 1.6;
const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;

export function createBots(scene, world, G) {
  const raycaster = new THREE.Raycaster();
  const bots = [];
  let perceiveIndex = 0;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6, metalness: 0.05 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.8, metalness: 0.05 });

  function buildBodyMesh(bot) {
    const group = new THREE.Group();
    const teamColor = bot.team === 'attackers' ? TEAM.attackers.marker : TEAM.defenders.marker;
    const visorColor = bot.team === 'attackers' ? TEAM.attackers.visor : TEAM.defenders.visor;
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.9, roughness: 0.5 });
    const visorMaterial = new THREE.MeshStandardMaterial({ color: visorColor, emissive: visorColor, emissiveIntensity: 1.4, roughness: 0.4 });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), legMaterial);
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), bodyMaterial);
    torso.position.y = 1.05;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.31), stripeMaterial);
    stripe.position.y = 1.28;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), bodyMaterial);
    head.position.y = 1.62;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.06, 0.05), visorMaterial);
    visor.position.set(0, 1.64, -0.16);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.5), legMaterial);
    gun.position.set(0.18, 1.15, -0.3);
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.25, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 1.2 }),
    );
    pack.position.set(0, 1.15, 0.2);
    pack.visible = false;
    group.add(legs, torso, stripe, head, visor, gun, pack);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.userData.actor = bot;
      }
    });
    torso.userData.part = 'torso';
    head.userData.part = 'head';
    legs.userData.part = 'legs';
    visor.userData.part = 'head';
    stripe.userData.part = 'torso';
    gun.userData.part = 'torso';
    pack.userData.part = 'torso';
    scene.add(group);
    return { group, pack, materials: [bodyMaterial, legMaterial, stripeMaterial, visorMaterial] };
  }

  function makeBot(id, team, role, x, z, site) {
    const bot = {
      id,
      team,
      role,
      site, // 'A' | 'B' | 'mid'
      body: null,
      mover: null,
      health: CONFIG.hp,
      alive: true,
      weapon: 'P9',
      money: CONFIG.startMoney,
      frags: 0,
      hasBomb: false,
      yaw: team === 'attackers' ? Math.PI / 2 : -Math.PI / 2,
      pitch: 0,
      goalNode: -1,
      path: [],
      pathIndex: 0,
      avoid: new Set(),
      target: null,
      targetVisible: false,
      visibleTime: 0,
      reactionUntil: 0,
      lastSeen: new THREE.Vector3(),
      memoryUntil: 0,
      shotAtBy: null,
      shotAtTime: -10,
      burstLeft: 0,
      burstPauseUntil: 0,
      fireAccumulator: 0,
      state: 'hold',
      investigateUntil: 0,
      investigateNode: -1,
      stuckCheckPos: new THREE.Vector3(x, 0, z),
      stuckCheckTime: 0,
      moving: false,
      fall: 0,
      fade: 1,
      plantReady: false,
    };
    bot.mover = createBody(world.colliders, x, z, BOT_RADIUS, BOT_HEIGHT);
    bot.body = bot.mover.body;
    const visuals = buildBodyMesh(bot);
    bot.group = visuals.group;
    bot.pack = visuals.pack;
    bot.visualMaterials = visuals.materials;
    bot.hitMeshes = [];
    bot.group.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.part) bot.hitMeshes.push(mesh);
    });
    bots.push(bot);
    return bot;
  }

  function spawnPositions() {
    return {
      A1: [-21, -3],
      A2: [-21, 3],
      D1: [16, -2],
      D2: [16, 2],
      D3: [18, 0],
    };
  }

  function resetRound(roundNumber) {
    const spawns = spawnPositions();
    for (const bot of bots) {
      const [x, z] = spawns[bot.id];
      bot.body.position.set(x, 0, z);
      bot.body.velocity.set(0, 0, 0);
      bot.health = CONFIG.hp;
      bot.alive = true;
      bot.frags = 0;
      bot.hasBomb = bot.id === 'A1';
      bot.yaw = bot.team === 'attackers' ? Math.PI / 2 : -Math.PI / 2;
      bot.pitch = 0;
      bot.target = null;
      bot.targetVisible = false;
      bot.visibleTime = 0;
      bot.memoryUntil = 0;
      bot.avoid = new Set();
      bot.path = [];
      bot.pathIndex = 0;
      bot.state = 'hold';
      bot.fall = 0;
      bot.fade = 1;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.visible = true;
      bot.pack.visible = bot.hasBomb;
      for (const material of bot.visualMaterials) {
        material.transparent = false;
        material.opacity = 1;
      }
      // Simplified bot buy: VK-47 when affordable, else P9; a Frag with the remainder.
      if (bot.money >= WEAPONS.VK47.price) {
        bot.weapon = 'VK47';
        bot.money -= WEAPONS.VK47.price;
      } else {
        bot.weapon = 'P9';
      }
      if (bot.money >= 300) {
        bot.frags = 1;
        bot.money -= 300;
      }
    }
    void roundNumber;
  }

  function reactionSeconds(bot) {
    if (bot.role === 'rusher') return CONFIG.reactionRusher;
    if (bot.role === 'holder') return CONFIG.reactionHolder;
    return CONFIG.reactionSeconds;
  }

  function roundSpread(roundNumber) {
    if (roundNumber <= 3) return (CONFIG.spreadRounds1to3 * Math.PI) / 180;
    if (roundNumber <= 7) return (CONFIG.spreadRounds4to7 * Math.PI) / 180;
    return (CONFIG.spreadRounds8plus * Math.PI) / 180;
  }

  function eyeOf(bot) {
    return new THREE.Vector3(bot.body.position.x, bot.body.position.y + EYE_HEIGHT, bot.body.position.z);
  }

  function losBlocked(from, to) {
    const direction = to.clone().sub(from);
    const length = direction.length();
    raycaster.set(from, direction.normalize());
    raycaster.far = length;
    return raycaster.intersectObjects(world.shootables, false).length > 0;
  }

  function canSee(bot, enemy, time) {
    const from = eyeOf(bot);
    const to = new THREE.Vector3(enemy.body.position.x, enemy.body.position.y + 1.05, enemy.body.position.z);
    const distance = from.distanceTo(to);
    if (distance > CONFIG.viewDistance) return { visible: false, distance };
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const angleTo = Math.atan2(-dx, -dz);
    let angle = Math.abs(angleTo - bot.yaw);
    while (angle > Math.PI) angle -= 2 * Math.PI;
    angle = Math.abs(angle);
    const halfFov = (CONFIG.fovDeg / 2) * (Math.PI / 180);
    let peripheral = false;
    if (angle > halfFov) {
      if (distance < CONFIG.peripheralMeters && angle < (CONFIG.peripheralDeg / 2) * (Math.PI / 180)) peripheral = true;
      else return { visible: false, distance };
    }
    if (losBlocked(from, to)) {
      const head = new THREE.Vector3(enemy.body.position.x, enemy.body.position.y + 1.62, enemy.body.position.z);
      if (losBlocked(from, head)) return { visible: false, distance };
    }
    return { visible: true, distance, peripheral };
  }

  // AMB-27: at most 2 bots perceive per tick, round-robin. Each call advances the
  // perception clock for those bots by the check interval.
  function perceive(time, dt, actors, hearEvents, roundNumber) {
    const interval = CONFIG.losCheckSeconds;
    for (let n = 0; n < 2; n += 1) {
      const bot = bots[perceiveIndex % bots.length];
      perceiveIndex += 1;
      if (!bot.alive) continue;
      // Hearing: a loud event turns a holder, and pulls a rotator or attacker to look.
      for (const event of hearEvents) {
        const distance = Math.hypot(event.x - bot.body.position.x, event.z - bot.body.position.z);
        let radius = event.radius;
        const from = new THREE.Vector3(event.x, 1, event.z);
        if (losBlocked(from, eyeOf(bot))) radius *= 0.5;
        if (distance <= radius) {
          if (bot.role === 'holder') {
            bot.yaw = Math.atan2(-(event.x - bot.body.position.x), -(event.z - bot.body.position.z));
          } else {
            bot.investigateNode = nearestNode(world.nodes, event.x, event.z);
            bot.investigateUntil = time + 5;
          }
        }
      }
      // Vision: gather currently-visible enemies.
      let best = null;
      let bestScore = Infinity;
      for (const enemy of actors) {
        if (!enemy.alive || enemy.team === bot.team) continue;
        const seen = canSee(bot, enemy, time);
        if (!seen.visible) continue;
        const shootingMe = bot.shotAtBy === enemy && time - bot.shotAtTime < 1.0;
        const score = (shootingMe ? 0 : 1000) + seen.distance;
        if (score < bestScore) {
          bestScore = score;
          best = { enemy, distance: seen.distance, peripheral: seen.peripheral, shootingMe };
        }
      }
      if (best) {
        bot.visibleTime += interval;
        if (bot.visibleTime >= CONFIG.visibleSeconds) {
          // AMB-11: switch only when the new target is shooting at this bot, or the
          // old target is gone from sight and memory.
          const oldGone = !bot.target || !bot.target.alive || time > bot.memoryUntil;
          if (!bot.target || best.shootingMe || oldGone) {
            if (bot.target !== best.enemy) {
              bot.target = best.enemy;
              bot.reactionUntil = time + reactionSeconds(bot) * (best.peripheral ? 2 : 1);
            }
          }
          bot.targetVisible = true;
          bot.lastSeen.set(best.enemy.body.position.x, 0, best.enemy.body.position.z);
          bot.memoryUntil = time + CONFIG.memorySeconds;
        }
      } else {
        bot.visibleTime = 0;
        bot.targetVisible = false;
        if (bot.target && time > bot.memoryUntil) bot.target = null;
      }
    }
    void dt;
    void roundNumber;
  }

  function faceToward(bot, x, z) {
    bot.yaw = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
  }

  function setGoal(bot, nodeIndex) {
    if (nodeIndex === bot.goalNode && bot.path.length > 0) return;
    const start = nearestNode(world.nodes, bot.body.position.x, bot.body.position.z);
    const avoidFiltered = (index) => !bot.avoid.has(index);
    let path = findPath(world.nodes, world.edges, start, nodeIndex);
    if (path.length === 0) {
      bot.goalNode = nodeIndex;
      bot.path = [];
      return;
    }
    // AMB-15: drop avoided nodes from the path; replan around them.
    path = path.filter(avoidFiltered);
    if (path.length === 0 || path[path.length - 1] !== nodeIndex) {
      path = findPath(world.nodes, world.edges, start, nodeIndex);
    }
    bot.goalNode = nodeIndex;
    bot.path = path;
    bot.pathIndex = 0;
  }

  function decideGoal(bot, time, round) {
    const bomb = G.getBomb();
    if (round.phase !== 'live') {
      bot.state = 'hold';
      return;
    }
    if (bot.team === 'attackers') {
      if (bomb.status === 'planted') {
        // Hold within 12 m of the bomb.
        const node = nearestNode(world.nodes, bomb.position.x, bomb.position.z);
        if (bot.goalNode !== node) setGoal(bot, node);
        bot.state = 'hold';
        return;
      }
      if (bomb.status === 'dropped') {
        const carrier = bots.find((b) => b.alive && b.team === 'attackers' && b.hasBomb);
        if (!carrier) {
          // Nearest living attacker fetches the bomb.
          const alive = bots.filter((b) => b.alive && b.team === 'attackers');
          alive.sort((a, b) => flatDistance(a.body.position, bomb.position) - flatDistance(b.body.position, bomb.position));
          if (alive[0] === bot) {
            bot.state = 'pickup';
            setGoal(bot, nearestNode(world.nodes, bomb.position.x, bomb.position.z));
          }
          return;
        }
      }
      if (bot.hasBomb) {
        const siteNode = bot.site === 'A' ? 21 : 23;
        if (bot.state !== 'plant') setGoal(bot, siteNode);
        bot.state = 'move';
        return;
      }
      // No bomb: push the other site, or investigate.
      if (bot.investigateUntil > time && bot.investigateNode >= 0) {
        setGoal(bot, bot.investigateNode);
        bot.state = 'move';
        return;
      }
      const siteNode = bot.site === 'A' ? 21 : 23;
      setGoal(bot, siteNode);
      bot.state = 'move';
      return;
    }
    // Defenders.
    if (bomb.status === 'planted') {
      const alive = bots.filter((b) => b.alive && b.team === 'defenders');
      alive.sort((a, b) => flatDistance(a.body.position, bomb.position) - flatDistance(b.body.position, bomb.position));
      const defuser = alive[0];
      if (bot === defuser) {
        bot.state = 'defuse';
        setGoal(bot, nearestNode(world.nodes, bomb.position.x, bomb.position.z));
      } else {
        bot.state = 'retake';
        // Second retaker takes a different route: force a detour node first.
        const node = nearestNode(world.nodes, bomb.position.x, bomb.position.z);
        if (bot.goalNode !== node) {
          setGoal(bot, node);
          if (alive[1] === bot && bot.path.length > 2) {
            const detour = bot.id === 'D2' ? 27 : 26;
            bot.path.splice(1, 0, detour);
          }
        }
      }
      return;
    }
    if (bot.investigateUntil > time && bot.investigateNode >= 0) {
      setGoal(bot, bot.investigateNode);
      bot.state = 'move';
      return;
    }
    // Hold the assigned site.
    const holdNode = bot.site === 'A' ? 21 : bot.site === 'B' ? 23 : 10;
    if (bot.goalNode !== holdNode) setGoal(bot, holdNode);
    bot.state = 'hold';
  }

  function moveAlongPath(bot, dt, time) {
    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      bot.moving = false;
      return;
    }
    const node = world.nodes[bot.path[bot.pathIndex]];
    const dx = node.x - bot.body.position.x;
    const dz = node.z - bot.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.6) {
      bot.pathIndex += 1;
      return;
    }
    const crouch = bot.role === 'lurker' && flatDistance(bot.body.position, world.nodes[bot.goalNode] ?? node) < 15;
    const speed = crouch ? CONFIG.crouchSpeed : CONFIG.walkSpeed;
    const vx = (dx / distance) * speed;
    const vz = (dz / distance) * speed;
    bot.mover.step(dt, vx, vz, false);
    bot.moving = true;
    faceToward(bot, node.x, node.z);
    // AMB-16: stuck when barely moving over a 0.75 s window; AMB-15: avoid the
    // current waypoint and replan. Never teleport.
    if (time - bot.stuckCheckTime > 0.75) {
      const moved = flatDistance(bot.body.position, bot.stuckCheckPos);
      if (moved < 0.3 && bot.pathIndex < bot.path.length) {
        bot.avoid.add(bot.path[bot.pathIndex]);
        const goal = bot.goalNode;
        bot.goalNode = -1;
        setGoal(bot, goal);
      }
      bot.stuckCheckPos.set(bot.body.position.x, 0, bot.body.position.z);
      bot.stuckCheckTime = time;
    }
  }

  function fireAt(bot, time, roundNumber, actors) {
    if (!bot.target || !bot.target.alive) return;
    if (time < bot.reactionUntil) return;
    if (bot.burstPauseUntil > time) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = CONFIG.burstMin + Math.floor(G.random() * (CONFIG.burstMax - CONFIG.burstMin + 1));
    }
    const def = WEAPONS[bot.weapon];
    bot.fireAccumulator += (def.rpm / 60) * (1 / 60);
    if (bot.fireAccumulator < 1) return;
    bot.fireAccumulator -= 1;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPauseUntil = time + CONFIG.burstPauseSeconds;
    const target = bot.target;
    const aim = new THREE.Vector3(target.body.position.x, target.body.position.y + 1.05, target.body.position.z);
    const origin = eyeOf(bot);
    const direction = aim.sub(origin).normalize();
    const spread = def.spreadStill + roundSpread(roundNumber);
    const result = G.combat.shoot(bot, origin, direction, def, actors, spread, G.random);
    G.onBotShot(bot, result);
    if (result && result.actor && result.actor !== bot) {
      G.onDamage(result.actor, result.damage, bot.weapon, bot);
    }
  }

  function step(dt, time, round, actors) {
    for (const bot of bots) {
      if (!bot.alive) {
        // Death: 0.4 s fall, then 2 s fade. No gore.
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.45;
        } else if (bot.fade > 0) {
          bot.fade = Math.max(0, bot.fade - dt / 2);
          for (const material of bot.visualMaterials) {
            material.transparent = true;
            material.opacity = bot.fade;
          }
          if (bot.fade === 0) bot.group.visible = false;
        }
        continue;
      }
      bot.pack.visible = bot.hasBomb && Math.floor(time * 2) % 2 === 0;
      decideGoal(bot, time, round);
      const bomb = G.getBomb();
      // A defuser plants its feet on the bomb, not on a waypoint: the nearest
      // node can sit more than 1.5 m away, which would stall the defuse forever.
      const defusing = bot.state === 'defuse' && bomb.status === 'planted';
      // Face the target while engaging; otherwise face the movement direction.
      // Bots never fire outside the live phase, and never while defusing.
      if (round.phase === 'live' && bot.target && bot.targetVisible && time >= bot.reactionUntil && !defusing) {
        faceToward(bot, bot.target.body.position.x, bot.target.body.position.z);
        fireAt(bot, time, round.number, actors);
      } else if (bot.target && time <= bot.memoryUntil) {
        faceToward(bot, bot.lastSeen.x, bot.lastSeen.z);
      }
      const atGoal = bot.path.length === 0 || bot.pathIndex >= bot.path.length;
      // Defuse and bomb pickup steer straight at the bomb for the last metre.
      let directTarget = null;
      if (defusing) directTarget = bomb.position;
      else if (bot.state === 'pickup' && bomb.status === 'dropped') directTarget = bomb.position;
      if (directTarget) {
        const d = flatDistance(bot.body.position, directTarget);
        if (d > 1.0 && round.phase === 'live') {
          const dx = directTarget.x - bot.body.position.x;
          const dz = directTarget.z - bot.body.position.z;
          bot.mover.step(dt, (dx / d) * CONFIG.walkSpeed, (dz / d) * CONFIG.walkSpeed, false);
          faceToward(bot, directTarget.x, directTarget.z);
          bot.moving = true;
        } else {
          bot.moving = false;
        }
      } else if (!atGoal && round.phase === 'live') moveAlongPath(bot, dt, time);
      else bot.moving = false;
      // Bomb pickup by walking over it.
      if (bomb.status === 'dropped' && bot.team === 'attackers') {
        if (flatDistance(bot.body.position, bomb.position) < 1.2) {
          bot.hasBomb = true;
          bomb.status = 'carried';
          bomb.carrier = bot;
          G.onBombPickup(bot);
        }
      }
      // Plant: the carrier stands in the plant zone; rounds.js advances progress.
      if (bot.hasBomb && round.phase === 'live' && bomb.status === 'carried') {
        const site = bot.site === 'A' ? 'A' : 'B';
        const zone = site === 'A' ? { minX: 14, maxX: 22, minZ: -13, maxZ: -5 } : { minX: 14, maxX: 22, minZ: 5, maxZ: 13 };
        const inZone =
          bot.body.position.x >= zone.minX && bot.body.position.x <= zone.maxX &&
          bot.body.position.z >= zone.minZ && bot.body.position.z <= zone.maxZ;
        bot.state = inZone ? 'plant' : bot.state;
        if (inZone) bot.path = [];
      }
      // Sync the visible group with the body.
      bot.group.position.copy(bot.body.position);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function damage(bot, amount, attacker) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (attacker) {
      bot.shotAtBy = attacker;
      bot.shotAtTime = G.time;
    }
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.fall = 0;
      bot.fade = 1;
      if (bot.hasBomb) {
        bot.hasBomb = false;
        G.onBombDropped(bot);
      }
      return true;
    }
    return false;
  }

  return {
    list: bots,
    makeBot,
    resetRound,
    perceive,
    step,
    damage,
    eyeOf,
    get aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    aliveByTeam(team) {
      return bots.filter((b) => b.alive && b.team === team);
    },
  };
}
