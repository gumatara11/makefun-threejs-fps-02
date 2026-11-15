// Hitscan combat, shared by the player and the bots: one ray against the world's
// shootables and every actor's hitboxes, nearest hit wins. Damage zones are the
// frozen ones: head x2, torso x1, legs x0.75. A wall always stops a bullet.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();

export function createCombat(scene, shootables) {
  const tracerPool = [];
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.9 });
  for (let i = 0; i < CONFIG.maxTracers; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function spawnTracer(from, to) {
    const tracer = tracerPool[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracerPool.length;
    const positions = tracer.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = 0.06;
  }

  function stepTracers(dt) {
    for (const tracer of tracerPool) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
    }
  }

  // Shoot one hitscan round. shooter: the actor firing (or null for a test shot).
  // origin/direction: world space. actors: every damageable actor (player + bots).
  // Returns { hit, actor, part, point, distance, blocked } or null when nothing is hit.
  function shoot(shooter, origin, direction, def, actors, spread = 0, random) {
    _dir.copy(direction);
    if (spread > 0 && random) {
      _dir.x += (random() * 2 - 1) * spread;
      _dir.y += (random() * 2 - 1) * spread;
      _dir.z += (random() * 2 - 1) * spread;
      _dir.normalize();
    }
    _ray.set(origin, _dir);
    _ray.far = 120;
    const meshes = [];
    for (const actor of actors) {
      if (!actor.alive || actor === shooter) continue;
      for (const mesh of actor.hitMeshes) meshes.push(mesh);
    }
    const hits = _ray.intersectObjects(shootables.concat(meshes), false);
    const end = origin.clone().addScaledVector(_dir, 120);
    if (hits.length === 0) {
      spawnTracer(origin, end);
      return null;
    }
    const hit = hits[0];
    spawnTracer(origin, hit.point);
    const userData = hit.object.userData;
    if (!userData.actor) return { hit: true, actor: null, part: null, point: hit.point, distance: hit.distance, blocked: true };
    const part = userData.part || 'torso';
    const mult = part === 'head' ? CONFIG.headMult : part === 'legs' ? CONFIG.legsMult : 1;
    const damage = Math.round(def.damage * mult);
    return { hit: true, actor: userData.actor, part, point: hit.point, distance: hit.distance, blocked: false, damage };
  }

  return { shoot, stepTracers, spawnTracer };
}

// Build the three hitbox meshes for the PLAYER. They are invisible to the eye
// (colorWrite off, no depth write) but still raycastable, so bots can shoot the
// player with the same raycast that hits walls and bot bodies. Bots build their
// own visible body meshes in bots.js with the same userData shape.
export function createHitboxes(actor) {
  const meshes = [];
  function box(w, h, d, y, part) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    material.colorWrite = false;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.y = y;
    mesh.userData.actor = actor;
    mesh.userData.part = part;
    meshes.push(mesh);
    return mesh;
  }
  const head = box(0.3, 0.3, 0.3, 1.62, 'head');
  const torso = box(0.55, 0.7, 0.3, 1.05, 'torso');
  const legs = box(0.5, 0.8, 0.3, 0.4, 'legs');
  return { head, torso, legs, meshes };
}
