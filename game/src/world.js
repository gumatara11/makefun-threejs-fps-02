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

  // Sky: a dusk gradient dome (dark zenith, warm sodium glow at the horizon),
  // so the scene stops reading as grey boxes under a flat grey void. One
  // draw call, unfogged.
  function skyDome() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1c222a');
    grad.addColorStop(0.35, '#2f3640');
    grad.addColorStop(0.44, '#8a6a3a');
    grad.addColorStop(0.5, '#54452e');
    grad.addColorStop(0.62, '#33291d');
    grad.addColorStop(1, '#241d16');
    x.fillStyle = grad; x.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(280, 24, 12),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    scene.add(dome);
    return dome;
  }
  skyDome();

  // Furnace on the north wall: the foundry's heart. Dark housing, a glowing
  // orange mouth (emissive — no new light), a chimney stack. Clear of lanes
  // and waypoints; the housing is real cover against the wall.
  box(4.0, 3.0, 1.2, -12, 1.5, -17.4, 'hairline');
  box(0.8, 2.0, 0.8, -12, 4.0, -17.4, 'hairline');
  const furnaceGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x331505), emissive: new THREE.Color(0xff7a1f), emissiveIntensity: 2.2, roughness: 0.9 }),
  );
  furnaceGlow.position.set(-12, 1.2, -16.78);
  group.add(furnaceGlow);
  // Gantry columns at the walls: industrial verticality. The beam itself was
  // removed — seen end-on down the mid lane it read as a giant black wedge
  // overhead (its unlit underside). The columns stay as wall pilasters.
  const colW = box(0.5, 4.6, 0.5, -23.5, 2.3, 0, 'hairline');
  colW.castShadow = false;
  const colE = box(0.5, 4.6, 0.5, 23.5, 2.3, 0, 'hairline');
  colE.castShadow = false;
  // Floor markings: hazard-stripe borders around both plant zones (one
  // transparent plane each) and a faint centre line down mid lane, so the
  // objective reads at a glance.
  function hazardBorder(x, z) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.save();
    g.beginPath(); g.rect(0, 0, 256, 256); g.rect(28, 28, 200, 200); g.clip('evenodd');
    for (let i = -256; i < 512; i += 32) {
      g.fillStyle = (Math.floor(i / 32) % 2 === 0) ? '#f0a830' : '#1c1e20';
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 + 256, 256); g.lineTo(i + 256, 256);
      g.closePath(); g.fill();
    }
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 8.4),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, metalness: 0 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.03, z);
    plane.receiveShadow = true;
    group.add(plane);
    return plane;
  }
  hazardBorder(18, -9);
  hazardBorder(18, 9);
  const midLine = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 0.22),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.18, roughness: 0.9 }),
  );
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.set(0, 0.03, 0);
  midLine.receiveShadow = true;
  group.add(midLine);
  // More barrel clusters and stacked corner crates (dead zones only: clear of
  // waypoints, lanes, spawns and plant zones).
  cylinder(0.45, 1.0, -13, 14.5, 'accent');
  cylinder(0.45, 1.0, -11.9, 14.6, 'hairline');
  cylinder(0.45, 1.0, 18, 14.5, 'accent');
  cylinder(0.45, 1.0, 19.1, 14.6, 'hairline');
  box(1.2, 1.1, 1.2, -20, 1.65, -15, 'surface');
  box(1.2, 1.1, 1.2, 21, 1.65, -15, 'surface');
  function cylinder(radius, height, x, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), materials[material]);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  // Barrel clusters, 3 m off their lanes. (The north-west pair used to sit
  // at (-12,-15) and blocked the furnace mouth; it moved to the corner.)
  cylinder(0.45, 1.0, -18, -15, 'accent');
  cylinder(0.45, 1.0, -16.9, -15.1, 'hairline');
  cylinder(0.45, 1.0, 12, 15, 'accent');
  cylinder(0.45, 1.0, 13.1, 15.2, 'hairline');
  // Corner crates.
  box(1.2, 1.1, 1.2, -20, 0.55, -15, 'surface');
  box(1.2, 1.1, 1.2, 21, 0.55, -15, 'surface');
  // Wall pipes, high up, visual only — they never block movement or shots.
  box(40, 0.25, 0.25, 0, 3.8, -17.8, 'hairline', false);
  box(40, 0.25, 0.25, 0, 3.8, 17.8, 'hairline', false);
  // Site signs on the east wall: big canvas letters, no external texture.
  function siteSign(letter, color, z) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#24272c'; x.fillRect(0, 0, 256, 160);
    x.strokeStyle = color; x.lineWidth = 10; x.strokeRect(8, 8, 240, 144);
    x.fillStyle = color; x.font = 'bold 110px sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(letter, 128, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.0),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }),
    );
    sign.position.set(23.9, 3.4, z);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
    return sign;
  }
  siteSign('A', '#2ec4b6', -9);
  siteSign('B', '#f0a830', 9);

  // Plant-zone floor strips (visual only, no collision): teal for A, amber for B.
  box(8, 0.04, 8, 18, 0.02, -9, 'teal', false);
  box(8, 0.04, 8, 18, 0.02, 9, 'accent', false);

  // Light: warm sodium key, cool fill, sky gradient. One shadow caster only.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.ink), new THREE.Color(PALETTE.surface), 1.7);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xf5e3b0), 2.3);
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
