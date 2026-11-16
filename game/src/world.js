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

  // ---- Stage 1: canvas textures (no external assets) ------------------------
  // Deterministic PRNG so the textures are identical on every load.
  function srand(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function corrugatedTexture(base, dark, light, seed) {
    const rand = srand(seed);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = dark; g.fillRect(x, 0, 3, 128);
      g.fillStyle = light; g.fillRect(x + 5, 0, 2, 128);
    }
    for (let i = 0; i < 40; i += 1) {
      g.fillStyle = `rgba(20,12,6,${0.05 + rand() * 0.12})`;
      g.fillRect(rand() * 128, rand() * 40, 2 + rand() * 3, 40 + rand() * 88);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, 128, 4); g.fillRect(0, 124, 128, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function crateTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#8a6a42'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#7a5c36';
    for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 3);
    g.strokeStyle = '#4a3418'; g.lineWidth = 6; g.strokeRect(5, 5, 118, 118);
    g.fillStyle = '#2e2110'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 20px sans-serif';
    g.fillText('DUSTLINE', 64, 52);
    g.font = 'bold 15px sans-serif';
    g.fillText('FRAGILE', 64, 78);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  // Floor: concrete with tonal patches, speckle, oil stains, cracks, dashed
  // lane lines and darkened wall bases. Plane UVs: canvas left = west (-x),
  // canvas top = north (-z); 1024 px = 48 m, 768 px = 36 m.
  function floorTexture() {
    const rand = srand(7);
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 768;
    const g = c.getContext('2d');
    g.fillStyle = '#43484f'; g.fillRect(0, 0, 1024, 768);
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * 1024;
      const y = rand() * 768;
      const r = 60 + rand() * 160;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rand() > 0.5 ? 'rgba(20,22,26,0.16)' : 'rgba(120,125,135,0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 5200; i += 1) {
      g.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(200,205,215,0.07)';
      g.fillRect(rand() * 1024, rand() * 768, 1.5, 1.5);
    }
    const stains = [
      [896, 192, 46], [896, 576, 40], [384, 298, 30], [640, 470, 34],
      [256, 30, 80], [700, 384, 26], [180, 640, 30],
    ];
    for (const [x, y, r] of stains) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(12,10,8,0.34)');
      grad.addColorStop(1, 'rgba(12,10,8,0)');
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, rand() * 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(15,16,18,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      let x = rand() * 1024;
      let y = rand() * 768;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) {
        x += (rand() - 0.5) * 120;
        y += (rand() - 0.5) * 120;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(200,176,96,0.32)';
    for (const py of [128, 384, 640]) {
      for (let px = 24; px < 1024; px += 72) g.fillRect(px, py - 3, 40, 6);
    }
    const edges = [
      [0, 0, 1024, 44, 0, 0, 0, 44],
      [0, 724, 1024, 44, 0, 768, 0, 724],
      [0, 0, 44, 768, 0, 0, 44, 0],
      [980, 0, 44, 768, 1024, 0, 980, 0],
    ];
    for (const [x, y, w, h, x0, y0, x1, y1] of edges) {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(0,0,0,0.38)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  function radialShadowTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function sparkTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  materials.contRust = new THREE.MeshStandardMaterial({
    map: corrugatedTexture('#7a3f22', '#5a2c16', '#9a5a34', 11), roughness: 0.85, metalness: 0.25,
  });
  materials.contBlue = new THREE.MeshStandardMaterial({
    map: corrugatedTexture('#46667c', '#324a5c', '#5f8299', 23), roughness: 0.85, metalness: 0.25,
  });
  materials.crateLabel = new THREE.MeshStandardMaterial({
    map: crateTexture(), roughness: 0.9, metalness: 0,
  });
  materials.floorTex = new THREE.MeshStandardMaterial({
    map: floorTexture(), roughness: 0.95, metalness: 0,
  });
  // Warm emissive for window strips + hanging lamps (no new lights).
  const matEmissive = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2a1a08), emissive: new THREE.Color(0xffb347),
    emissiveIntensity: 1.6, roughness: 0.6,
  });
  // Cheap AO: soft radial contact shadows, one merged transparent mesh.
  const matShadow = new THREE.MeshBasicMaterial({
    map: radialShadowTexture(), transparent: true, depthWrite: false,
  });

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

  // Site A cover: container, crate, tank. (Stage 1: container restyled to
  // corrugated rust — same size/position, still cover.)
  box(3.0, 1.2, 1.2, 15, 0.6, -9, 'contRust');
  box(1.2, 1.1, 1.2, 18.5, 0.55, -12, 'hairline');
  box(1.6, 1.6, 1.6, 13, 0.8, -5.5, 'hairline');
  // Site B cover: container, crate, tank. (Stage 1: corrugated blue.)
  box(3.0, 1.2, 1.2, 15, 0.6, 9, 'contBlue');
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
    grad.addColorStop(0.30, '#2f3640');
    grad.addColorStop(0.40, '#6a5232');
    grad.addColorStop(0.47, '#8a6a3a');
    grad.addColorStop(0.54, '#6b543a');
    grad.addColorStop(0.64, '#33291d');
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
  // Site signs on the east wall: anime-style panels — dark gradient, double
  // team-color border, glowing letter with a white highlight, small SITE tag
  // and a hazard-stripe corner. Letters A/B and team colors are kept.
  function siteSign(letter, color, z) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, 160);
    bg.addColorStop(0, '#232c38');
    bg.addColorStop(1, '#12161c');
    x.fillStyle = bg; x.fillRect(0, 0, 256, 160);
    x.strokeStyle = color; x.lineWidth = 10; x.strokeRect(8, 8, 240, 144);
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2; x.strokeRect(16, 16, 224, 128);
    x.save();
    x.shadowColor = color; x.shadowBlur = 22;
    x.fillStyle = color; x.font = 'bold 96px sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(letter, 128, 74);
    x.restore();
    x.fillStyle = color; x.font = 'bold 20px sans-serif';
    x.fillText(`SITE ${letter}`, 128, 138);
    x.save();
    x.beginPath(); x.rect(196, 116, 52, 36); x.clip();
    for (let i = -36; i < 88; i += 14) {
      x.fillStyle = (Math.floor(i / 14) % 2 === 0) ? '#f0a830' : '#1c1e20';
      x.beginPath();
      x.moveTo(196 + i, 116); x.lineTo(196 + i + 14, 116);
      x.lineTo(196 + i + 14 + 36, 152); x.lineTo(196 + i + 36, 152);
      x.closePath(); x.fill();
    }
    x.restore();
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

  // ---- Stage 1: anime foundry-yard environment ------------------------------
  // All new static geometry is merged by material (same pattern as
  // weapons.js mergeStaticByMaterial): the whole upgrade is ~16 extra draw
  // calls. New colliders only in dead zones (wall strips / corners, clear of
  // lanes, waypoints, spawns and plant zones). Footprint, wall heights, lane
  // gaps, plant zones, spawns and the waypoint graph are untouched.
  function mergeGeometries(geos) {
    let vCount = 0;
    let iCount = 0;
    for (const g of geos) {
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    if (vCount === 0) return null;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const IndexArray = vCount > 65535 ? Uint32Array : Uint16Array;
    const idx = new IndexArray(iCount);
    let vOff = 0;
    let iOff = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vOff * 3);
      nor.set(g.attributes.normal.array, vOff * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
      if (g.index) {
        const src = g.index.array;
        for (let i = 0; i < src.length; i++) idx[iOff + i] = src[i] + vOff;
        iOff += src.length;
      } else {
        for (let i = 0; i < n; i++) idx[iOff + i] = vOff + i;
        iOff += n;
      }
      vOff += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  const buckets = new Map();
  const bucketOpts = new Map();
  bucketOpts.set(materials.contRust, { shadow: true, shootable: true });
  bucketOpts.set(materials.contBlue, { shadow: true, shootable: true });
  bucketOpts.set(materials.roof, { shadow: true, shootable: true });
  bucketOpts.set(materials.steelblue, { shadow: true, shootable: true });
  bucketOpts.set(materials.wood, { shadow: true, shootable: true });
  bucketOpts.set(materials.crateLabel, { shadow: true, shootable: true });
  bucketOpts.set(matEmissive, { shadow: false, shootable: false });
  bucketOpts.set(materials.trunk, { shadow: true, shootable: true });
  bucketOpts.set(materials.leaf, { shadow: true, shootable: false });
  bucketOpts.set(materials.leafDark, { shadow: true, shootable: false });
  bucketOpts.set(matShadow, { shadow: false, shootable: false });
  function pushGeo(geo, material, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
    geo.applyMatrix4(m);
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geo);
  }
  function pushBox(w, h, d, x, y, z, material) {
    pushGeo(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  }
  // Collider for a new prop — dead zones only, registered by hand so a merged
  // mesh never gets one giant box covering the whole map.
  function deadCollider(x0, y0, z0, x1, y1, z1) {
    colliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
  }

  // Textured floor plane over the flat floor box (y 0.005; AO discs sit at
  // 0.02, hazard borders / plant strips above that — no coplanar faces).
  const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(48, 36), materials.floorTex);
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.set(0, 0.005, 0);
  floorPlane.receiveShadow = true;
  group.add(floorPlane);

  // 1. Corrugated containers + warehouse facades, flat against the walls.
  // North wall, east of the furnace.
  pushBox(10, 3.6, 0.9, 6, 1.8, -17.55, materials.contBlue);
  pushBox(10.6, 0.28, 1.15, 6, 3.72, -17.55, materials.roof);
  deadCollider(1, 0, -18, 11, 3.86, -17.1);
  pushBox(6, 3.2, 0.9, -4, 1.6, -17.55, materials.contRust);
  pushBox(6.6, 0.28, 1.15, -4, 3.32, -17.55, materials.roof);
  deadCollider(-7, 0, -18, -1, 3.46, -17.1);
  // South wall.
  pushBox(12, 3.4, 0.9, -2, 1.7, 17.55, materials.contRust);
  pushBox(12.6, 0.28, 1.15, -2, 3.52, 17.55, materials.roof);
  deadCollider(-8, 0, 17.1, 4, 3.66, 18);
  // West wall (south half) and east wall (north half).
  pushBox(0.9, 3.2, 8, -23.55, 1.6, 10, materials.contBlue);
  pushBox(1.15, 0.28, 8.6, -23.55, 3.32, 10, materials.roof);
  deadCollider(-24, 0, 6, -23.1, 3.46, 14);
  pushBox(0.9, 3.0, 5, 23.55, 1.5, -15.5, materials.contRust);
  pushBox(1.15, 0.28, 5.6, 23.55, 3.12, -15.5, materials.roof);
  deadCollider(23.1, 0, -18, 24, 3.26, -13);
  // Silo beside the north facade, poking above the wall line.
  pushGeo(new THREE.CylinderGeometry(1.1, 1.25, 5.6, 12), materials.steelblue, 12.8, 2.8, -17.2);
  pushGeo(new THREE.CylinderGeometry(0.2, 1.15, 0.7, 12), materials.roof, 12.8, 5.9, -17.2);
  deadCollider(11.55, 0, -18, 14.05, 6.2, -15.95);
  // Corner container stacks.
  pushBox(3.0, 1.2, 1.2, 21, 0.6, -16.3, materials.contRust);
  pushBox(2.4, 1.2, 1.2, 20.6, 1.8, -16.3, materials.contBlue);
  deadCollider(19.5, 0, -16.9, 22.5, 2.4, -15.7);
  pushBox(3.0, 1.2, 1.2, -20.5, 0.6, 16.3, materials.contBlue);
  pushBox(2.4, 1.2, 1.2, -20.9, 1.8, 16.3, materials.contRust);
  deadCollider(-22, 0, 15.7, -19, 2.4, 16.9);
  // Upright container, NW corner.
  pushBox(1.2, 3.0, 1.2, -22.6, 1.5, -16.6, materials.contRust);
  deadCollider(-23.2, 0, -17.2, -22, 3, -16);
  // Emissive window strips on the facade faces (proud of the face by 0.02).
  for (const wx of [3, 6, 9]) pushBox(1.6, 0.5, 0.06, wx, 2.4, -17.08, matEmissive);
  for (const wx of [-6, -4, -2]) pushBox(1.2, 0.5, 0.06, wx, 2.2, -17.08, matEmissive);
  for (const wx of [-6, -2, 2]) pushBox(1.6, 0.5, 0.06, wx, 2.4, 17.08, matEmissive);
  for (const wz of [7.5, 10, 12.5]) pushBox(0.06, 0.5, 1.4, -23.08, 2.2, wz, matEmissive);
  for (const wz of [-16.5, -14.5]) pushBox(0.06, 0.5, 1.2, 23.08, 2.2, wz, matEmissive);

  // 2. B-corridor + site interiors: workbench, shelves, labelled crates,
  // hanging lamps (emissive only — no new lights).
  // Workbench against the corridor south wall.
  pushBox(2.4, 0.12, 0.9, 0, 0.95, 15.4, materials.wood);
  pushBox(2.2, 0.08, 0.7, 0, 0.3, 15.4, materials.wood);
  for (const lx of [-1.05, 1.05]) for (const lz of [15.05, 15.75]) pushBox(0.1, 0.9, 0.1, lx, 0.45, lz, materials.wood);
  deadCollider(-1.2, 0, 14.95, 1.2, 1.05, 15.85);
  // Shelves against the corridor north wall.
  for (const ux of [-5.05, -2.95]) pushBox(0.08, 2.0, 0.5, ux, 1.0, 8.45, materials.wood);
  for (const sy of [0.5, 1.1, 1.7]) pushBox(2.2, 0.08, 0.5, -4, sy, 8.45, materials.wood);
  deadCollider(-5.1, 0, 8.2, -2.9, 2.0, 8.7);
  // Labelled crates in the corridor.
  pushBox(1.1, 1.1, 1.1, 9.5, 0.55, 15.3, materials.crateLabel);
  pushBox(0.9, 0.9, 0.9, 9.5, 1.55, 15.3, materials.crateLabel);
  deadCollider(8.95, 0, 14.75, 10.05, 2.0, 15.85);
  // Hanging lamps over the B lane (bottom 2.68 m — clear of players).
  for (const lx of [-3, 3, 9]) {
    pushBox(0.04, 0.24, 0.04, lx, 2.88, 12, materials.roof);
    pushBox(0.5, 0.08, 0.18, lx, 2.72, 12, matEmissive);
  }
  // Site shelves, flat against the east wall under the site signs.
  for (const sz of [-9, 9]) {
    for (const uz of [sz - 1.05, sz + 1.05]) pushBox(0.6, 2.0, 0.08, 23.7, 1.0, uz, materials.wood);
    for (const sy of [0.5, 1.1, 1.7]) pushBox(0.6, 0.08, 2.2, 23.7, sy, sz, materials.wood);
    pushBox(0.45, 0.45, 0.45, 23.7, 1.95, sz - 0.5, materials.crateLabel);
    pushBox(0.45, 0.45, 0.45, 23.7, 1.95, sz + 0.4, materials.crateLabel);
    deadCollider(23.4, 0, sz - 1.1, 24, 2.2, sz + 1.1);
  }

  // 3. Vegetation: low-poly anime trees (trunk + layered foliage) and grass
  // tufts, all at map edges / dead zones. Trunks collide; foliage does not.
  const treeSpots = [
    [-16.8, -17.1], [15.8, -17.1], [8, 17.2], [-14, 17.2], [-22.9, 16.9], [22.9, 16.9],
  ];
  for (const [tx, tz] of treeSpots) {
    pushGeo(new THREE.CylinderGeometry(0.2, 0.3, 1.7, 6), materials.trunk, tx, 0.85, tz);
    pushGeo(new THREE.IcosahedronGeometry(1.0, 0), materials.leaf, tx, 2.2, tz, 0, 0, 0, 1, 0.85, 1);
    pushGeo(new THREE.IcosahedronGeometry(0.75, 0), materials.leafDark, tx + 0.35, 2.85, tz - 0.2, 0, 0, 0, 1, 0.85, 1);
    pushGeo(new THREE.IcosahedronGeometry(0.55, 0), materials.leaf, tx - 0.3, 3.35, tz + 0.15, 0, 0, 0, 1, 0.9, 1);
    deadCollider(tx - 0.3, 0, tz - 0.3, tx + 0.3, 1.7, tz + 0.3);
  }
  // Grass tufts along the wall bases (walk-through, no colliders).
  const tuftSpots = [
    [-21, -17.5], [-19, -17.5], [-9.5, -17.5], [17, -17.5], [19.5, -17.5],
    [-19, 17.5], [-17, 17.5], [-11, 17.5], [-9, 17.5], [5, 17.5], [12, 17.5],
    [15, 17.5], [19, 17.5], [21, 17.5],
    [-23.5, -6], [-23.5, -2], [-23.5, 2], [-23.5, 6],
    [23.5, -3], [23.5, 0], [23.5, 3],
  ];
  {
    const rand = srand(31);
    for (const [gx, gz] of tuftSpots) {
      for (let i = 0; i < 3; i += 1) {
        const dx = (rand() - 0.5) * 0.35;
        const dz = (rand() - 0.5) * 0.35;
        pushGeo(
          new THREE.ConeGeometry(0.09, 0.55, 4), materials.leaf,
          gx + dx, 0.27, gz + dz, rand() * Math.PI, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3,
        );
      }
    }
  }

  // 7. Cheap AO: soft contact-shadow discs under props / barrels / crates /
  // containers / trees / facades (radial gradient, one merged mesh).
  function aoDisc(x, z, sx, sz = sx) {
    pushGeo(new THREE.CircleGeometry(1, 20), matShadow, x, 0.02, z, 0, -Math.PI / 2, 0, sx, sz, 1);
  }
  aoDisc(15, -9, 3.6, 1.9); aoDisc(18.5, -12, 1.7); aoDisc(13, -5.5, 2.2);
  aoDisc(15, 9, 3.6, 1.9); aoDisc(18.5, 12, 1.7); aoDisc(13, 5.5, 2.2);
  aoDisc(-6, -4, 1.7); aoDisc(6, 4, 1.7); aoDisc(-14, -8, 1.8);
  aoDisc(-10, 8, 2.2); aoDisc(10, -8, 2.2); aoDisc(-2, 6, 3.0, 1.8);
  for (const [bx, bz] of [[-18, -15], [-16.9, -15.1], [-13, 14.5], [-11.9, 14.6], [18, 14.5], [19.1, 14.6], [12, 15], [13.1, 15.2]]) aoDisc(bx, bz, 0.9);
  aoDisc(-20, -15, 1.7); aoDisc(21, -15, 1.7);
  aoDisc(-12, -16.6, 4.6, 1.9);
  aoDisc(21, -16.3, 3.6, 1.9); aoDisc(-20.5, 16.3, 3.6, 1.9); aoDisc(-22.6, -16.6, 1.8);
  aoDisc(12.8, -17.2, 2.9);
  aoDisc(6, -17.3, 10.6, 1.6); aoDisc(-4, -17.3, 6.6, 1.6); aoDisc(-2, 17.3, 12.6, 1.6);
  aoDisc(-23.3, 10, 1.6, 8.6); aoDisc(23.3, -15.5, 1.6, 5.6);
  aoDisc(0, 15.4, 3.0, 1.5); aoDisc(-4, 8.45, 2.8, 1.1); aoDisc(9.5, 15.3, 1.7);
  aoDisc(23.4, -9, 1.2, 2.8); aoDisc(23.4, 9, 1.2, 2.8);
  for (const [tx, tz] of treeSpots) aoDisc(tx, tz, 2.4);

  // Flush the merged buckets (one mesh per material).
  const mergedMeshes = {};
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    const opts = bucketOpts.get(material) || {};
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    if (material === matShadow) mesh.renderOrder = 1;
    group.add(mesh);
    mergedMeshes[material] = mesh;
    if (opts.shootable) shootables.push(mesh);
  }
  buckets.clear();

  // 4. Sky: keep the gradient dome; add a sun disc + glow and soft cloud
  // puffs (billboards are overkill — flattened spheres read as anime clouds).
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a8), fog: false }),
  );
  sun.position.set(120, 80, 90);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(24, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff9a40), transparent: true, opacity: 0.28,
      fog: false, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  sunGlow.position.set(126, 83, 95);
  sunGlow.lookAt(0, 0, 0);
  scene.add(sunGlow);
  {
    const cloudGeos = [];
    const cloudSpots = [
      [-140, 55, -80], [60, 62, -150], [160, 50, -40], [-160, 58, 40],
      [120, 66, 120], [-60, 52, 150], [0, 70, -180], [180, 60, 80], [-100, 64, 120],
    ];
    const rand = srand(55);
    for (const [cx, cy, cz] of cloudSpots) {
      for (let i = 0; i < 3; i += 1) {
        const r = 9 + rand() * 7;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(cx + (rand() - 0.5) * 18, cy + (rand() - 0.5) * 3, cz + (rand() - 0.5) * 10),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 0.35, 1),
        );
        const g = new THREE.SphereGeometry(r, 10, 8);
        g.applyMatrix4(m);
        cloudGeos.push(g);
      }
    }
    const clouds = new THREE.Mesh(
      mergeGeometries(cloudGeos),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe0a37e), transparent: true, opacity: 0.65, fog: false }),
    );
    scene.add(clouds);
  }

  // 5. Particles: drifting embers / sparks as THREE.Points (max 300,
  // additive). main.js never calls a world step, so the points animate
  // themselves via onBeforeRender with a private clock — no main.js change.
  {
    const EMBER_COUNT = 300;
    const rand = srand(99);
    const emberPos = new Float32Array(EMBER_COUNT * 3);
    const emberBase = new Float32Array(EMBER_COUNT * 3);
    const emberSpeed = new Float32Array(EMBER_COUNT);
    const emberPhase = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      let x; let y; let z;
      if (i < 180) {
        x = -12 + (rand() - 0.5) * 4;
        z = -16.8 + (rand() - 0.5) * 2.5;
        y = 0.5 + rand() * 3.5;
      } else {
        x = -22 + rand() * 44;
        z = -16 + rand() * 32;
        y = 0.3 + rand() * 4.5;
      }
      emberPos[i * 3] = x; emberPos[i * 3 + 1] = y; emberPos[i * 3 + 2] = z;
      emberBase[i * 3] = x; emberBase[i * 3 + 1] = y; emberBase[i * 3 + 2] = z;
      emberSpeed[i] = 0.3 + rand() * 0.6;
      emberPhase[i] = rand() * Math.PI * 2;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const embers = new THREE.Points(
      emberGeo,
      new THREE.PointsMaterial({
        color: new THREE.Color(0xffa040), size: 0.12, map: sparkTexture(),
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    embers.frustumCulled = false;
    const emberClock = new THREE.Clock();
    embers.onBeforeRender = () => {
      const dt = Math.min(0.05, emberClock.getDelta());
      const t = emberClock.elapsedTime;
      for (let i = 0; i < EMBER_COUNT; i += 1) {
        let y = emberPos[i * 3 + 1] + emberSpeed[i] * dt;
        if (y > 5.5) y = emberBase[i * 3 + 1];
        emberPos[i * 3 + 1] = y;
        emberPos[i * 3] = emberBase[i * 3] + Math.sin(t * 0.8 + emberPhase[i]) * 0.3;
      }
      emberGeo.attributes.position.needsUpdate = true;
    };
    group.add(embers);
  }

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
