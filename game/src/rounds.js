// Match state machine: buy phase, live round, plant/defuse, win checks, economy.
// Frozen numbers and win-check order: explosion, then defuse, then elimination
// (with the post-plant exception: attackers all dead after the plant does NOT end
// the round), then timeout. First to 5, at most 9 rounds. Money: start $800,
// kill +$300, win +$3,250, loss +$1,900, plant +$300 to the whole attacker team,
// defuse +$300 to the defuser, cap $9,000.
import * as THREE from 'three';
import { CONFIG, WEAPONS, FRAG } from './config.js';
import { SITES, SPAWNS } from './world.js';

export function createRounds(G) {
  const state = {
    phase: 'buy',
    number: 1,
    scoreA: 0,
    scoreD: 0,
    timeLeft: CONFIG.buySeconds,
    bomb: {
      status: 'carried',
      carrier: null,
      position: new THREE.Vector3(),
      site: null,
      timer: 0,
    },
    plant: null,
    defuse: null,
    winner: null,
    reason: '',
    matchOver: false,
  };

  function inPlantZone(actor, site) {
    const zone = SITES[site];
    const p = actor.body.position;
    return p.x >= zone.minX && p.x <= zone.maxX && p.z >= zone.minZ && p.z <= zone.maxZ;
  }

  function inSpawnZone(actor) {
    const zone = actor.team === 'attackers' ? SPAWNS.attackers : SPAWNS.defenders;
    const p = actor.body.position;
    return p.x >= zone.minX - 4 && p.x <= zone.maxX + 4 && p.z >= zone.minZ - 4 && p.z <= zone.maxZ + 4;
  }

  function aliveActors(team) {
    return G.getActors().filter((a) => a.alive && a.team === team);
  }

  function giveMoney(actor, amount) {
    actor.money = Math.min(CONFIG.moneyCap, (actor.money || 0) + amount);
  }

  function startRound() {
    const round = state.number;
    state.phase = 'buy';
    state.timeLeft = CONFIG.buySeconds;
    state.plant = null;
    state.defuse = null;
    state.winner = null;
    state.reason = '';
    state.bomb.status = 'carried';
    state.bomb.site = null;
    state.bomb.timer = 0;
    // Respawn: dead players get P9 only; survivors keep their primary, magazine
    // refilled free, reserve NOT topped up.
    const wasAlive = new Map();
    for (const actor of G.getActors()) wasAlive.set(actor, actor.alive);
    for (const actor of G.getActors()) {
      actor.health = CONFIG.hp;
      actor.alive = true;
      actor.frags = 0;
      if (actor.isPlayer) {
        G.playerReset(actor, wasAlive.get(actor));
      }
    }
    G.bots.resetRound(round);
    const carrier = G.bots.list.find((b) => b.id === 'A1');
    if (carrier) {
      state.bomb.carrier = carrier;
      carrier.hasBomb = true;
    }
    G.onRoundStart(round);
  }

  function startMatch() {
    state.scoreA = 0;
    state.scoreD = 0;
    state.number = 1;
    state.matchOver = false;
    for (const actor of G.getActors()) actor.money = CONFIG.startMoney;
    startRound();
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'matchEnd') return;
    state.winner = winner;
    state.reason = reason;
    if (winner === 'attackers') state.scoreA += 1;
    else state.scoreD += 1;
    for (const actor of G.getActors()) {
      if (actor.team === winner) giveMoney(actor, CONFIG.winReward);
      else giveMoney(actor, CONFIG.lossReward);
    }
    state.phase = 'end';
    state.timeLeft = CONFIG.endBannerSeconds;
    G.onRoundEnd(winner, reason, state.scoreA, state.scoreD);
    if (state.scoreA >= CONFIG.winScore || state.scoreD >= CONFIG.winScore || state.number >= CONFIG.maxRounds) {
      state.matchOver = true;
    }
  }

  // Health lives with the actor (the player in main.js, bots in bots.js); the
  // bomb drop on death is their job too, through G.onBombDropped. This function
  // only owns the kill reward, the feed and the elimination check.
  function damageActor(victim, amount, attacker, weapon) {
    if (!victim.alive || state.phase !== 'live') return false;
    const killed = G.applyDamage(victim, amount, attacker);
    if (!killed) return false;
    // Kill reward only for an enemy kill: a teammate crossing the line of
    // fire still takes damage (friendly fire is real), but killing your own
    // team must never pay — otherwise farming a teammate is +$300 a kill.
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      giveMoney(attacker, CONFIG.killReward);
      G.onKill(victim, attacker, weapon);
    } else {
      G.onKill(victim, null, weapon);
    }
    checkElimination();
    return true;
  }

  function checkElimination() {
    if (state.phase !== 'live') return;
    const attackersAlive = aliveActors('attackers').length;
    const defendersAlive = aliveActors('defenders').length;
    if (defendersAlive === 0) {
      endRound('attackers', 'elimination');
      return;
    }
    if (attackersAlive === 0 && state.bomb.status !== 'planted') {
      endRound('defenders', 'elimination');
    }
    // Post-plant exception: attackers all dead after the plant does NOT end the round.
  }

  function plantBomb(actor) {
    state.bomb.status = 'planted';
    state.bomb.site = actor.site || (inPlantZone(actor, 'A') ? 'A' : 'B');
    state.bomb.position.copy(actor.body.position);
    state.bomb.timer = CONFIG.bombSeconds;
    state.plant = null;
    for (const teammate of aliveActors('attackers')) giveMoney(teammate, CONFIG.plantReward);
    G.onPlant(actor, state.bomb.site);
  }

  function defuseBomb(actor) {
    state.bomb.status = 'defused';
    state.defuse = null;
    giveMoney(actor, CONFIG.defuseReward);
    G.onDefuse(actor);
    endRound('defenders', 'defuse');
  }

  function step(dt, input) {
    if (state.phase === 'buy') {
      state.timeLeft -= dt;
      // The player takes the bomb by walking over the carrier during the buy phase.
      const player = G.getPlayer();
      const carrier = state.bomb.carrier;
      if (carrier && carrier !== player && carrier.alive && player.alive) {
        const dx = player.body.position.x - carrier.body.position.x;
        const dz = player.body.position.z - carrier.body.position.z;
        if (Math.hypot(dx, dz) < 1.2) {
          carrier.hasBomb = false;
          player.hasBomb = true;
          state.bomb.carrier = player;
          G.onBombPickup(player);
        }
      }
      if (state.timeLeft <= 0) {
        state.phase = 'live';
        state.timeLeft = CONFIG.roundSeconds;
        G.onLiveStart();
      }
      return;
    }
    if (state.phase === 'live') {
      // Plant progress: an attacker in a plant zone holding E, standing still.
      const planter = state.bomb.status === 'carried' ? state.bomb.carrier : null;
      if (planter && planter.alive) {
        const site = inPlantZone(planter, 'A') ? 'A' : inPlantZone(planter, 'B') ? 'B' : null;
        const holding = planter.isPlayer ? input.holdingE : planter.state === 'plant';
        const speed = Math.hypot(planter.body.velocity.x, planter.body.velocity.z);
        if (site && holding && speed < 0.5) {
          if (!state.plant || state.plant.actor !== planter) state.plant = { actor: planter, progress: 0, site };
          state.plant.progress += dt / CONFIG.plantSeconds;
          G.onPlantProgress(state.plant.progress);
          if (state.plant.progress >= 1) plantBomb(planter);
        } else {
          state.plant = null;
          G.onPlantProgress(0);
        }
      } else {
        state.plant = null;
      }
      // Defuse progress: a defender within 1.5 m of the planted bomb holding E.
      if (state.bomb.status === 'planted') {
        state.bomb.timer -= dt;
        let defuser = null;
        for (const actor of aliveActors('defenders')) {
          const distance = Math.hypot(
            actor.body.position.x - state.bomb.position.x,
            actor.body.position.z - state.bomb.position.z,
          );
          if (distance < 1.5) {
            const holding = actor.isPlayer ? input.holdingE : actor.state === 'defuse';
            const speed = Math.hypot(actor.body.velocity.x, actor.body.velocity.z);
            if (holding && speed < 0.5) {
              defuser = actor;
              break;
            }
          }
        }
        if (defuser) {
          if (!state.defuse || state.defuse.actor !== defuser) state.defuse = { actor: defuser, progress: 0 };
          state.defuse.progress += dt / CONFIG.defuseSeconds;
          G.onDefuseProgress(state.defuse.progress);
          if (state.defuse.progress >= 1) defuseBomb(defuser);
        } else {
          state.defuse = null;
          G.onDefuseProgress(0);
        }
        if (state.bomb.timer <= 0 && state.phase === 'live') {
          state.bomb.status = 'exploded';
          G.onExplode(state.bomb.position);
          endRound('attackers', 'explosion');
          return;
        }
      } else {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) {
          endRound('defenders', 'timeout');
          return;
        }
      }
      // Dropped-bomb pickup by the player walking over it.
      if (state.bomb.status === 'dropped') {
        const player = G.getPlayer();
        if (player.alive) {
          const distance = Math.hypot(
            player.body.position.x - state.bomb.position.x,
            player.body.position.z - state.bomb.position.z,
          );
          if (distance < 1.2) {
            player.hasBomb = true;
            state.bomb.status = 'carried';
            state.bomb.carrier = player;
            G.onBombPickup(player);
          }
        }
      }
      return;
    }
    if (state.phase === 'end') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        if (state.matchOver) {
          state.phase = 'matchEnd';
          G.onMatchEnd(state.scoreA, state.scoreD);
        } else {
          state.number += 1;
          startRound();
        }
      }
    }
  }

  function buy(actor, item) {
    if (state.phase !== 'buy') return { ok: false, reason: 'not buy phase' };
    if (!inSpawnZone(actor)) return { ok: false, reason: 'outside spawn' };
    if (item === 'VK47') {
      if (actor.money < WEAPONS.VK47.price) return { ok: false, reason: 'not enough money' };
      if (actor.weapon === 'VK47') return { ok: false, reason: 'already owned' };
      actor.money -= WEAPONS.VK47.price;
      actor.weapon = 'VK47';
      G.onBuy(actor, 'VK47');
      return { ok: true };
    }
    if (item === 'FRAG') {
      if (actor.frags >= FRAG.maxPerRound) return { ok: false, reason: 'one per round' };
      if (actor.money < FRAG.price) return { ok: false, reason: 'not enough money' };
      actor.money -= FRAG.price;
      actor.frags += 1;
      G.onBuy(actor, 'FRAG');
      return { ok: true };
    }
    return { ok: false, reason: 'unknown item' };
  }

  return {
    state,
    startMatch,
    startRound,
    step,
    buy,
    damageActor,
    inPlantZone,
    inSpawnZone,
  };
}
