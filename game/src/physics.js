// Shared AABB physics: one body (feet position, velocity, radius, height) moved against
// the world's Box3 colliders, one axis at a time, so a wall never swallows a body.
// Used by the player and by every bot — one code path for movement.
import * as THREE from 'three';

const GRAVITY = 20;

export function createBody(colliders, x, z, radius = 0.34, height = 1.72) {
  const body = {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    onGround: true,
  };
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // wishX/wishZ: desired horizontal velocity (already scaled to m/s). jump: true to jump.
  // Returns nothing; body.position / body.velocity / body.onGround are updated in place.
  function step(dt, wishX, wishZ, jump) {
    body.velocity.x = wishX;
    body.velocity.z = wishZ;
    if (jump && body.onGround) {
      body.velocity.y = 6.2;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) {
      body.position.x = nextX;
    } else {
      body.velocity.x = 0;
    }
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) {
      body.position.z = nextZ;
    } else {
      body.velocity.z = 0;
    }

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return { body, step, overlaps };
}

// Distance on the ground plane.
export function flatDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

// A* over a small waypoint graph. Nodes: [{x, z}], edges: Map<index, [index, ...]>.
// Returns an array of node indices from start to goal (inclusive), or [] when unreachable.
export function findPath(nodes, edges, startIndex, goalIndex) {
  if (startIndex === goalIndex) return [startIndex];
  const open = [startIndex];
  const cameFrom = new Map();
  const gScore = new Map([[startIndex, 0]]);
  const fScore = new Map([[startIndex, heuristic(startIndex, goalIndex)]]);
  const closed = new Set();
  function heuristic(a, b) {
    return Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
  }
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) {
      if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[best]) ?? Infinity)) best = i;
    }
    const current = open.splice(best, 1)[0];
    if (current === goalIndex) {
      const path = [current];
      let node = current;
      while (cameFrom.has(node)) {
        node = cameFrom.get(node);
        path.unshift(node);
      }
      return path;
    }
    closed.add(current);
    for (const next of edges.get(current) ?? []) {
      if (closed.has(next)) continue;
      const tentative = (gScore.get(current) ?? Infinity) + heuristic(current, next);
      if (tentative < (gScore.get(next) ?? Infinity)) {
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        fScore.set(next, tentative + heuristic(next, goalIndex));
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  return [];
}

export function nearestNode(nodes, x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
