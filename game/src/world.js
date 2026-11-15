// Foundry Yard, emergency scope: a 48 x 36 m foundry yard with three lanes and two
// bomb sites, built from boxes. Every box is a collider for bodies and a surface a
// bullet stops on. Attackers spawn west, defenders east; site A is north-east,
// site B is south-east. Plant zones are floor strips, not colliders.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CONFIG } from './config.js';

export const SITES = {
  A: { minX: 14, maxX: 22, minZ: -13, maxZ: -5, color: 0x2ec4b6 },
  B: { minX: 14, maxX: 22, minZ: 5, maxZ: 13, color: 0xf0a830 },
};

export const SPAWNS = {
  attackers: { minX: -22, maxX: -18, minZ: -6, maxZ: 6 },
  defenders: { minX: 14, maxX: 20, minZ: -3, maxZ: 3 },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'teal' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and outer walls, 48 x 36 m, 4.6 m high, open to the sky.
  box(48.4, 0.4, 36.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 36.4, -24.2, 2.3, 0, 'hairline');
  box(0.4, 4.6, 36.4, 24.2, 2.3, 0, 'hairline');
  box(48.4, 4.6, 0.4, 0, 2.3, -18.2, 'hairline');
  box(48.4, 4.6, 0.4, 0, 2.3, 18.2, 'hairline');

  // Mid wall at x = 0 with three gaps: A-long (z -14..-10), Mid (z -2..2), B (z 10..14).
  box(0.4, 4.6, 4, 0, 2.3, -16, 'hairline');
  box(0.4, 4.6, 8, 0, 2.3, -6, 'hairline');
  box(0.4, 4.6, 8, 0, 2.3, 6, 'hairline');
  box(0.4, 4.6, 4, 0, 2.3, 16, 'hairline');

  // B corridor: low walls and a 3.0 m roof over the south lane (x -6..12, z 8..16).
  box(18, 3.0, 0.4, 3, 1.5, 8, 'hairline');
  box(18, 3.0, 0.4, 3, 1.5, 16, 'hairline');
  box(18, 0.4, 8, 3, 3.2, 12, 'hairline');

  // Site A cover: container, crate, tank.
  box(3.0, 1.2, 1.2, 15, 0.6, -9, 'hairline');
  box(1.2, 1.1, 1.2, 18.5, 0.55, -12, 'hairline');
  box(1.6, 1.6, 1.6, 13, 0.8, -5.5, 'hairline');
  // Site B cover: container, crate, tank.
  box(3.0, 1.2, 1.2, 15, 0.6, 9, 'hairline');
  box(1.2, 1.1, 1.2, 18.5, 0.55, 12, 'hairline');
  box(1.6, 1.6, 1.6, 13, 0.8, 5.5, 'hairline');
  // Mid cover: crates and a pillar to break the long sightlines.
  box(1.2, 1.1, 1.2, -6, 0.55, -4, 'hairline');
  box(1.2, 1.1, 1.2, 6, 0.55, 4, 'hairline');
  box(1.6, 0.7, 1.6, -10, 0.35, 8, 'hairline');
  box(1.6, 0.7, 1.6, 10, 0.35, -8, 'hairline');
  box(1.2, 3.2, 1.2, -14, 1.6, -8, 'hairline');
  box(2.4, 0.9, 1.2, -2, 0.45, 6, 'hairline');

  // Plant-zone floor strips (visual only, no collision): teal for A, amber for B.
  box(8, 0.04, 8, 18, 0.02, -9, 'teal', false);
  box(8, 0.04, 8, 18, 0.02, 9, 'accent', false);

  // Light: warm sodium key, cool fill, sky gradient. One shadow caster only.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.ink), new THREE.Color(PALETTE.surface), 1.6);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.1);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 1.8);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  // Waypoint graph: three lanes, two sites, connectors between lanes.
  const nodes = [];
  for (const z of [-12, 0, 12]) {
    for (const x of [-21, -15, -9, -3, 3, 9, 15]) nodes.push({ x, z });
  }
  nodes.push({ x: 17, z: -9 }); // 21: site A
  nodes.push({ x: 19, z: -6 }); // 22: site A
  nodes.push({ x: 17, z: 9 }); // 23: site B
  nodes.push({ x: 19, z: 6 }); // 24: site B
  nodes.push({ x: -3, z: -6 }); // 25: connector
  nodes.push({ x: 3, z: -6 }); // 26: connector
  nodes.push({ x: -3, z: 6 }); // 27: connector
  nodes.push({ x: 3, z: 6 }); // 28: connector
  nodes.push({ x: 15, z: -6 }); // 29: connector
  nodes.push({ x: 15, z: 6 }); // 30: connector

  const edges = new Map();
  function link(a, b) {
    if (!edges.has(a)) edges.set(a, []);
    if (!edges.has(b)) edges.set(b, []);
    edges.get(a).push(b);
    edges.get(b).push(a);
  }
  // Along each lane (lanes are rows of 7 nodes: 0-6 A, 7-13 Mid, 14-20 B).
  for (const base of [0, 7, 14]) {
    for (let i = 0; i < 6; i += 1) link(base + i, base + i + 1);
  }
  // Connectors between lanes.
  link(3, 25); link(25, 10); link(4, 26); link(26, 11); // x=-3 / x=3, A<->Mid
  link(10, 27); link(27, 17); link(11, 28); link(28, 18); // Mid<->B
  link(6, 29); link(29, 13); // A lane east end <-> Mid east end
  link(13, 30); link(30, 20); // Mid east end <-> B lane east end
  // Sites.
  link(6, 21); link(21, 22); link(22, 29);
  link(20, 23); link(23, 24); link(24, 30);

  // Debug graph lines (hidden unless ?debuggraph=1).
  const linePositions = [];
  for (const [a, list] of edges) {
    for (const b of list) {
      if (a < b) linePositions.push(nodes[a].x, 0.1, nodes[a].z, nodes[b].x, 0.1, nodes[b].z);
    }
  }
  const graphGeometry = new THREE.BufferGeometry();
  graphGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const graphLines = new THREE.LineSegments(
    graphGeometry,
    new THREE.LineBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.7 }),
  );
  graphLines.visible = false;
  scene.add(graphLines);

  return { colliders, shootables, group, nodes, edges, graphLines, fogNear: CONFIG.fogNear, fogFar: CONFIG.fogFar };
}
