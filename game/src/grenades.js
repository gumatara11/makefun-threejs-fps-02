// Frag grenades only (Smoke and Flash are cut for the emergency scope).
// AMB-06, approved: damage is measured to the target's torso centre with one
// raycast and line of sight; no partial damage through cover. Fuse 1.5 s, radius
// 6 m, 85 damage at the centre falling to 10 at the edge. One per actor per round.
import * as THREE from 'three';
import { FRAG, CONFIG } from './config.js';

export function createGrenades(scene, colliders, shootables) {
  const grenades = [];
  const raycaster = new THREE.Raycaster();
  const explosionMaterial = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 });
  const flashLight = new THREE.PointLight(0xffa030, 0, 18);
  scene.add(flashLight);
  let flashLeft = 0;

  function throwFrag(owner, origin, direction) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.6, metalness: 0.4 }),
    );
    mesh.position.copy(origin);
    scene.add(mesh);
    grenades.push({
      mesh,
      owner,
      velocity: direction.clone().multiplyScalar(FRAG.throwSpeed),
      fuse: FRAG.fuseSeconds,
      alive: true,
    });
  }

  // Point-vs-AABB bounce: push the point out along the shallowest axis and reflect
  // that velocity component with the frozen restitution of 0.4.
  function collide(point, velocity) {
    for (const box of colliders) {
      if (!box.containsPoint(point)) continue;
      const px = Math.min(point.x - box.min.x, box.max.x - point.x);
      const py = Math.min(point.y - box.min.y, box.max.y - point.y);
      const pz = Math.min(point.z - box.min.z, box.max.z - point.z);
      if (px <= py && px <= pz) {
        point.x = velocity.x > 0 ? box.min.x - 0.01 : box.max.x + 0.01;
        velocity.x = -velocity.x * FRAG.restitution;
      } else if (py <= pz) {
        point.y = velocity.y > 0 ? box.min.y - 0.01 : box.max.y + 0.01;
        velocity.y = -velocity.y * FRAG.restitution;
      } else {
        point.z = velocity.z > 0 ? box.min.z - 0.01 : box.max.z + 0.01;
        velocity.z = -velocity.z * FRAG.restitution;
      }
      return true;
    }
    return false;
  }

  // onDamage(victim, damage, source) and onExplode(position) are called by the host.
  function step(dt, actors, onDamage, onExplode) {
    flashLeft = Math.max(0, flashLeft - dt);
    flashLight.intensity = flashLeft > 0 ? 60 * (flashLeft / 0.25) : 0;
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const grenade = grenades[i];
      if (!grenade.alive) continue;
      grenade.fuse -= dt;
      grenade.velocity.y -= 20 * dt;
      const next = grenade.mesh.position.clone().addScaledVector(grenade.velocity, dt);
      grenade.mesh.position.copy(next);
      collide(grenade.mesh.position, grenade.velocity);
      if (grenade.mesh.position.y < 0.09) {
        grenade.mesh.position.y = 0.09;
        grenade.velocity.y = Math.abs(grenade.velocity.y) * FRAG.restitution;
      }
      if (grenade.fuse <= 0) {
        grenade.alive = false;
        explode(grenade.mesh.position, grenade.owner, actors, onDamage, onExplode);
        scene.remove(grenade.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  function explode(position, owner, actors, onDamage, onExplode) {
    flashLight.position.copy(position).y += 1;
    flashLeft = 0.25;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      explosionMaterial.clone(),
    );
    flash.position.copy(position);
    flash.scale.setScalar(0.2);
    scene.add(flash);
    let life = 0.3;
    const tick = () => {
      life -= 1 / 60;
      flash.scale.setScalar(0.2 + (0.3 - life) * 14);
      flash.material.opacity = Math.max(0, life / 0.3) * 0.9;
      if (life > 0) requestAnimationFrame(tick);
      else scene.remove(flash);
    };
    requestAnimationFrame(tick);
    if (onExplode) onExplode(position);
    // AMB-06: one raycast from the blast to each torso centre; blocked means no damage.
    // A frag hurts enemies only — the emergency scope keeps friendly fire off.
    const torso = new THREE.Vector3();
    for (const actor of actors) {
      if (!actor || !actor.alive) continue;
      if (owner && actor.team === owner.team) continue;
      const distance = actor.body.position.distanceTo(position);
      if (distance > FRAG.radius) continue;
      torso.set(actor.body.position.x, actor.body.position.y + 1.05, actor.body.position.z);
      const direction = torso.clone().sub(position);
      const length = direction.length();
      raycaster.set(position, direction.normalize());
      raycaster.far = length;
      const blocked = raycaster.intersectObjects(shootables, false).length > 0;
      if (blocked) continue;
      const t = Math.min(1, distance / FRAG.radius);
      const damage = Math.round(FRAG.damageCenter + (FRAG.damageEdge - FRAG.damageCenter) * t);
      if (onDamage) onDamage(actor, damage, 'frag', owner);
    }
  }

  return {
    throwFrag,
    step,
    get active() {
      return grenades.length;
    },
    reset() {
      for (const grenade of grenades) scene.remove(grenade.mesh);
      grenades.length = 0;
    },
  };
}
