// Anime semi-realistic tactical operatives (Stage 2).
// Procedural geometry + vertex colors only — no external assets, no textures.
// One MeshStandardMaterial per bot (vertexColors) + one emissive pack material,
// so the death fade touches only that bot's materials (fixes the old shared
// body/leg material bug where fading one dead bot faded all bodies).
// Draw calls per bot: 5 (legL, legR, torso, head, pack) vs 7 before.
import * as THREE from 'three';
import { TEAM } from './config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

// Geometry helpers: transform in place, then paint a flat vertex color.
function xform(geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(px, py, pz);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// One painted, transformed primitive. Args: geometry, color, position,
// rotation (radians), scale.
function part(geo, hex, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return paint(xform(geo, px, py, pz, rx, ry, rz, sx, sy, sz), hex);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 12, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

// Merge painted primitives into a single BufferGeometry (position/normal/color).
function mergeParts(parts) {
  let vCount = 0;
  let iCount = 0;
  for (const g of parts) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const IndexArray = vCount > 65535 ? Uint32Array : Uint16Array;
  const idx = new IndexArray(iCount);
  let vOff = 0;
  let iOff = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vOff * 3);
    nor.set(g.attributes.normal.array, vOff * 3);
    col.set(g.attributes.color.array, vOff * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i += 1) idx[iOff + i] = src[i] + vOff;
    iOff += src.length;
    vOff += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Per-bot look. Accent comes from the team (attackers teal, defenders amber).
const DESIGNS = {
  A1: { gender: 'male', skin: 0xe8b98d, hair: 0x1a1d24, hairStyle: 'spiky' },
  A2: { gender: 'female', skin: 0xf0c8a0, hair: 0x6b4423, hairStyle: 'ponytail' },
  D1: { gender: 'male', skin: 0xd9a06f, hair: 0x2a3550, hairStyle: 'spiky' },
  D2: { gender: 'female', skin: 0xeec39a, hair: 0x8a4a3a, hairStyle: 'bun' },
  D3: { gender: 'male', skin: 0xc98f66, hair: 0x4a4a4a, hairStyle: 'spiky' },
};

const GUNMETAL = 0x1c1f24;
const BOOT = 0x16181d;
const GLOVE = 0x20242b;
const EYE_DARK = 0x14142a;
const MOUTH = 0x8a4a3a;

function shadeOf(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}

// One leg, built relative to the hip pivot (pivot at y 0.82 in group space).
// Spans y 0.82 -> 0, ~0.2 wide; both legs together ~0.46 wide, matching the
// 0.5-wide legs hitbox. Female legs are slightly slimmer.
function buildLegGeometry(design, team) {
  const female = design.gender === 'female';
  const w = female ? 0.18 : 0.20;
  const pants = team === 'attackers' ? 0x272c34 : 0x2e2a26;
  const parts = [
    part(box(w, 0.42, 0.24), pants, 0, -0.21, 0),
    part(box(w + 0.01, 0.12, 0.07), 0x23272e, 0, -0.44, -0.12), // knee pad
    part(box(w - 0.02, 0.32, 0.20), shadeOf(pants, 0.8), 0, -0.60, 0),
    part(box(w, 0.12, 0.30), BOOT, 0, -0.76, -0.03), // boot
    part(box(w, 0.07, 0.10), BOOT, 0, -0.775, -0.16), // boot toe
  ];
  return mergeParts(parts);
}

// Torso + arms + rifle, merged into one mesh (group space, feet y=0).
// Chest spans y ~0.8 -> 1.5, width ~0.52 — matches the torso hitbox.
function buildTorsoGeometry(design, team, accent) {
  const female = design.gender === 'female';
  const uniform = team === 'attackers' ? 0x2e343c : 0x3a3230;
  const pants = team === 'attackers' ? 0x272c34 : 0x2e2a26;
  const vest = 0x23272e;
  const chestW = female ? 0.48 : 0.54;
  const parts = [
    // Hips, belt, buckle.
    part(box(female ? 0.46 : 0.50, 0.18, 0.28), pants, 0, 0.88, 0),
    part(box(0.52, 0.07, 0.30), 0x1d2026, 0, 0.98, 0),
    part(box(0.10, 0.05, 0.02), accent, 0, 0.98, -0.16),
    // Chest + vest plates + pouches.
    part(box(chestW, 0.52, 0.30), uniform, 0, 1.24, 0),
    part(box(0.46, 0.36, 0.05), vest, 0, 1.26, -0.165),
    part(box(0.46, 0.36, 0.05), vest, 0, 1.26, 0.165),
    part(box(0.12, 0.14, 0.04), shadeOf(vest, 0.75), -0.12, 1.16, -0.195),
    part(box(0.12, 0.14, 0.04), shadeOf(vest, 0.75), 0.12, 1.16, -0.195),
    // Team stripe across the upper chest + collar + shoulder pads.
    part(box(chestW + 0.01, 0.09, 0.31), accent, 0, 1.44, 0),
    part(box(0.30, 0.08, 0.26), 0x1d2026, 0, 1.52, 0),
    part(box(0.17, 0.09, 0.30), vest, -0.31, 1.48, 0),
    part(box(0.17, 0.09, 0.30), vest, 0.31, 1.48, 0),
  ];
  // Arms reaching forward to hold the rifle across the chest.
  // Upper arms angle forward-down from the shoulders; forearms angle inward
  // to the rifle; gloves sit on the grip (right) and forend (left).
  const sx = female ? 0.28 : 0.30;
  for (const side of [-1, 1]) {
    parts.push(
      part(box(0.13, 0.34, 0.13), uniform, side * sx, 1.30, -0.06, 0.55, 0, 0),
      part(box(0.24, 0.11, 0.11), uniform, side * 0.19, 1.15, -0.16, 0, side * -0.25, 0),
    );
  }
  parts.push(
    part(box(0.13, 0.11, 0.13), GLOVE, 0.10, 1.12, -0.18), // right hand on grip
    part(box(0.13, 0.11, 0.13), GLOVE, -0.02, 1.14, -0.42), // left hand on forend
  );
  // Rifle held across the chest, barrel forward (-z), slight diagonal.
  parts.push(
    part(box(0.07, 0.10, 0.40), GUNMETAL, 0.02, 1.15, -0.32, 0, 0.15, 0),
    part(cyl(0.025, 0.025, 0.28, 8), GUNMETAL, 0.075, 1.16, -0.60, Math.PI / 2, 0, 0.15),
    part(box(0.06, 0.09, 0.16), GUNMETAL, -0.015, 1.14, -0.10, 0, 0.15, 0),
    part(box(0.05, 0.14, 0.07), shadeOf(GUNMETAL, 0.7), 0.02, 1.06, -0.30, 0, 0, 0.15),
    part(box(0.04, 0.05, 0.12), GUNMETAL, 0.03, 1.22, -0.34, 0, 0.15, 0),
    part(box(0.05, 0.10, 0.05), GLOVE, 0.0, 1.08, -0.16, 0.3, 0, 0),
    part(box(0.03, 0.03, 0.06), accent, 0.05, 1.20, -0.48, 0, 0.15, 0), // accent detail
  );
  return mergeParts(parts);
}

// Head + face + hair, merged into one mesh (group space).
// Head sphere centre y 1.63, ~0.30 wide — matches the head hitbox.
function buildHeadGeometry(design) {
  const { skin, hair, hairStyle } = design;
  const parts = [
    part(box(0.11, 0.12, 0.11), skin, 0, 1.50, 0), // neck
    part(sph(1, 14, 10), skin, 0, 1.63, 0, 0, 0, 0, 0.15, 0.165, 0.14), // head
    part(box(0.16, 0.10, 0.12), shadeOf(skin, 0.95), 0, 1.55, -0.01), // jaw
    // Anime eyes: dark glossy ovals + white highlights, brows, nose, mouth.
    part(sph(1, 10, 8), EYE_DARK, -0.058, 1.645, -0.128, 0, 0, 0, 0.032, 0.048, 0.018),
    part(sph(1, 10, 8), EYE_DARK, 0.058, 1.645, -0.128, 0, 0, 0, 0.032, 0.048, 0.018),
    part(sph(1, 6, 6), 0xffffff, -0.048, 1.66, -0.142, 0, 0, 0, 0.011, 0.011, 0.008),
    part(sph(1, 6, 6), 0xffffff, 0.068, 1.66, -0.142, 0, 0, 0, 0.011, 0.011, 0.008),
    part(box(0.07, 0.012, 0.012), hair, -0.058, 1.705, -0.135, 0, 0, 0.10),
    part(box(0.07, 0.012, 0.012), hair, 0.058, 1.705, -0.135, 0, 0, -0.10),
    part(box(0.02, 0.03, 0.015), shadeOf(skin, 0.85), 0, 1.60, -0.145),
    part(box(0.035, 0.008, 0.008), MOUTH, 0, 1.56, -0.138),
    // Hair cap + bangs.
    part(sph(1, 14, 10), hair, 0, 1.685, 0.012, 0, 0, 0, 0.165, 0.15, 0.155),
    part(box(0.26, 0.07, 0.05), hair, 0, 1.72, -0.12),
  ];
  if (hairStyle === 'spiky') {
    parts.push(
      part(box(0.28, 0.22, 0.08), hair, 0, 1.60, 0.10), // back hair
      part(cone(0.04, 0.13), hair, 0, 1.83, 0, -0.3, 0, 0),
      part(cone(0.04, 0.12), hair, -0.09, 1.81, -0.02, 0, 0, 0.5),
      part(cone(0.04, 0.12), hair, 0.09, 1.81, -0.02, 0, 0, -0.5),
      part(cone(0.04, 0.11), hair, -0.05, 1.80, 0.08, 0.4, 0, 0),
      part(cone(0.04, 0.11), hair, 0.05, 1.80, 0.08, 0.4, 0, 0),
    );
  } else if (hairStyle === 'ponytail') {
    parts.push(
      part(box(0.30, 0.34, 0.07), hair, 0, 1.50, 0.12), // long back hair
      part(cyl(0.05, 0.035, 0.38, 8), hair, 0, 1.42, 0.20, 0.35, 0, 0),
      part(box(0.11, 0.05, 0.05), 0xf0a830, 0, 1.60, 0.16), // hair tie
    );
  } else {
    // bun: shorter back hair + topknot bun.
    parts.push(
      part(box(0.30, 0.22, 0.07), hair, 0, 1.56, 0.12),
      part(sph(1, 10, 8), hair, 0, 1.74, 0.15, 0, 0, 0, 0.09, 0.09, 0.09),
    );
  }
  return mergeParts(parts);
}

// Build one bot's visuals. Returns the group plus the handles bots.js needs:
// pack (bomb indicator), per-bot materials (death fade), leg pivots + torso /
// head meshes (walk cycle + bob). Hit part tags are set on each mesh.
export function buildCharacter(bot) {
  const design = DESIGNS[bot.id] || DESIGNS.A1;
  const team = bot.team;
  const accent = team === 'attackers' ? TEAM.attackers.marker : TEAM.defenders.marker;

  // Per-bot materials: the death fade must never touch another bot.
  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.65, metalness: 0.05,
  });
  const packMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 1.2, roughness: 0.5,
  });

  const group = new THREE.Group();

  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.82, 0);
  const legLMesh = new THREE.Mesh(buildLegGeometry(design, team), bodyMaterial);
  legLMesh.userData.part = 'legs';
  legL.add(legLMesh);

  const legR = new THREE.Group();
  legR.position.set(0.13, 0.82, 0);
  const legRMesh = new THREE.Mesh(buildLegGeometry(design, team), bodyMaterial);
  legRMesh.userData.part = 'legs';
  legR.add(legRMesh);

  const torso = new THREE.Mesh(buildTorsoGeometry(design, team, accent), bodyMaterial);
  torso.userData.part = 'torso';

  const head = new THREE.Mesh(buildHeadGeometry(design), bodyMaterial);
  head.userData.part = 'head';

  const pack = new THREE.Mesh(box(0.22, 0.28, 0.10), packMaterial);
  pack.position.set(0, 1.18, 0.22);
  pack.userData.part = 'torso';
  pack.visible = false;

  group.add(legL, legR, torso, head, pack);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.userData.actor = bot;
    }
  });
  return {
    group,
    pack,
    materials: [bodyMaterial, packMaterial],
    legL,
    legR,
    torso,
    head,
  };
}
