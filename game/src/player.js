// The player: first-person movement on the shared physics body — acceleration,
// friction, gravity, crouch and jump — plus look and recoil. Walk speed is the
// frozen 4.9 m/s; the starter's 5.2 is not used.
import * as THREE from 'three';
import { createBody } from './physics.js';
import { CONFIG } from './config.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;

export function createPlayer(colliders, spawnX, spawnZ) {
  const mover = createBody(colliders, spawnX, spawnZ, RADIUS, STAND_HEIGHT);
  const state = mover.body;
  state.yaw = Math.PI / 2; // face east, toward the sites
  state.pitch = 0;
  state.eye = STAND_EYE;
  state.crouching = false;
  state.height = STAND_HEIGHT;
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching && !mover.overlaps(state.position.x, state.position.y, state.position.z, STAND_HEIGHT, 0.02)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = state.crouching ? CONFIG.crouchSpeed : CONFIG.walkSpeed;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    const vx = state.velocity.x + (wish.x * speed - state.velocity.x) * blend;
    const vz = state.velocity.z + (wish.z * speed - state.velocity.z) * blend;
    let finalVx = vx;
    let finalVz = vz;
    if (state.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      finalVx = vx * damp;
      finalVz = vz * damp;
    }
    mover.step(dt, finalVx, finalVz, keys.has('Space'));
  }

  return {
    state,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    teleport(x, z, yaw) {
      state.position.set(x, 0, z);
      state.velocity.set(0, 0, 0);
      if (yaw !== undefined) state.yaw = yaw;
      state.pitch = 0;
    },
  };
}
