// Weapons: P9 and VK-47 (frozen stats). One view model per weapon, a magazine, a
// reload, and spread that punishes moving. Cadence uses a time accumulator
// (AMB-02, approved): leftover time carries into the next tick, so 600 RPM fires
// exactly 10 shots a second even on a 60 Hz fixed step.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './config.js';

let gloveTextureCache = null;
// Anime hands (Stage 3): skin-tone fingers/palm with a dark tactical-glove
// cuff + sleeve — the old flat olive glove blocks read as mittens. Fingers
// are slimmer with clearer knuckles; the wrist shows skin between palm and
// glove cuff so the hand reads as a hand, not a block.
const SKIN = '#f0c49c';
const SKIN_PAD = '#f7d9b8';
const SKIN_TIP = '#dd9a72';
const CREASE_SKIN = '#6b3f24';
function makeGloveTexture() {
  if (gloveTextureCache) return gloveTextureCache;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7e8272'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.14)';
    x.fillRect(Math.random() * 256, Math.random() * 256, 2.2, 2.2);
  }
  x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 2;
  for (let i = -256; i < 512; i += 10) {
    x.beginPath(); x.moveTo(i, 128); x.lineTo(i + 128, 256); x.stroke();
    x.beginPath(); x.moveTo(i + 128, 128); x.lineTo(i, 256); x.stroke();
  }
  x.strokeStyle = 'rgba(12,14,16,0.9)'; x.lineWidth = 3;
  for (const yy of [52, 92, 132]) {
    x.beginPath(); x.moveTo(8, yy); x.lineTo(248, yy); x.stroke();
  }
  x.fillStyle = '#b9bdb0';
  for (let i = 0; i < 4; i++) x.fillRect(16 + i * 58, 12, 50, 34);
  x.strokeStyle = '#fff3c8'; x.lineWidth = 2.5; x.setLineDash([5, 3]);
  for (let i = 0; i < 4; i++) x.strokeRect(18 + i * 58, 14, 46, 30);
  x.strokeRect(6, 6, 244, 244);
  x.setLineDash([]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  gloveTextureCache = tex;
  return tex;
}

// Viewmodel base pose (Stage 3: slightly larger + more central than v6 so both
// hands read in frame; viewmodel-only, no gameplay effect).
const VIEW_BASE = { x: 0.26, y: -0.25, z: -0.68 };
const VIEW_SCALE = 0.68;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.35 });
  // First-person hands v7 (Stage 3): articulated hands in anime skin tones
  // (fingers/palm) with a dark tactical-glove cuff + sleeve — slimmer
  // fingers, clearer knuckles, rosy fingertips. Same finger-chain builder
  // as v5, refined proportions/materials, not rebuilt from zero.
  // Hands are children of the weapon model, so they follow recoil kick, the
  // reload dip, and weapon switches exactly — visual only, no gameplay,
  // combat, or input code is touched.
  const gloveTex = makeGloveTexture();
  const glove = gloveTex
    ? new THREE.MeshStandardMaterial({ map: gloveTex, bumpMap: gloveTex, bumpScale: 0.7, roughness: 0.85, metalness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: new THREE.Color('#7e8272'), roughness: 0.85, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN), roughness: 0.55, metalness: 0 });
  const skinPad = new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN_PAD), roughness: 0.6, metalness: 0 });
  const skinTip = new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN_TIP), roughness: 0.6, metalness: 0 });
  const creaseSkin = new THREE.MeshStandardMaterial({ color: new THREE.Color(CREASE_SKIN), roughness: 0.9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6e7278'), roughness: 0.95, metalness: 0 });
  const strap = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a89a7a'), roughness: 0.7, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7e838b'), roughness: 0.4, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b97a1e'), roughness: 0.5, metalness: 0.2 });
  // Per-hand material set for fingers: skin segments, rosy fingertips,
  // pale knuckle pads, dark joint creases.
  const HAND_MATS = { seg: skin, tip: skinTip, pad: skinPad, ring: creaseSkin };
  // Articulated finger: capsule phalanges chained on joint pivots. Segments
  // extend along `axis` ('y' = up, 'z' = forward); each joint rotates about
  // `curlAxis` by angles[i], curling the finger around the grip. A knuckle
  // sphere sits at every joint and a dark crease ring marks each joint.
  // Stage 3: slimmer fingers (narrower flat scale) with proportionally
  // larger knuckles so each joint reads, in anime skin tones.
  function buildFinger({ lens, r, axis = 'z', curlAxis = 'y', angles = [], mats = HAND_MATS }) {
    const root = new THREE.Group();
    let parent = root;
    lens.forEach((len, i) => {
      const pivot = new THREE.Group();
      if (i > 0) {
        if (axis === 'z') pivot.position.set(0, 0, lens[i - 1]);
        else pivot.position.set(0, lens[i - 1], 0);
        pivot.rotation[curlAxis] = angles[i - 1] ?? 0;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.0016, 6, 12), mats.ring);
        if (axis === 'y') ring.rotation.x = Math.PI / 2;
        ring.scale.set(1.25, 0.75, 1);
        pivot.add(ring);
      }
      // Fingers are flattened (wide, thin), not round pills: the scale is
      // applied in the finger's local space, so it holds for both axes.
      const flat = axis === 'z' ? [1.25, 0.75, 1] : [1.25, 1, 0.75];
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.16, 10, 8), i === 0 ? mats.pad : mats.seg);
      knuckle.scale.set(...flat);
      pivot.add(knuckle);
      const last = i === lens.length - 1;
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), last ? mats.tip : mats.seg);
      seg.scale.set(1.25, 1, 0.75);
      if (axis === 'z') { seg.rotation.x = Math.PI / 2; seg.position.set(0, 0, len / 2); }
      else seg.position.set(0, len / 2, 0);
      pivot.add(seg);
      if (last) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), mats.tip);
        tip.scale.set(...flat);
        if (axis === 'z') tip.position.set(0, 0, len + r * 0.5);
        else tip.position.set(0, len + r * 0.5, 0);
        pivot.add(tip);
      }
      parent.add(pivot);
      parent = pivot;
    });
    return root;
  }
  function buildPalm(w, h) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.042), skin));
    const bulge = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
    bulge.scale.set(w * 0.52, h * 0.5, 0.02);
    bulge.position.set(0, 0.004, 0.016);
    g.add(bulge);
    const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
    thenar.scale.set(0.026, 0.038, 0.018);
    thenar.position.set(-w * 0.32, -h * 0.3, 0.014);
    g.add(thenar);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
    heel.scale.set(w * 0.4, h * 0.22, 0.018);
    heel.position.set(0, -h * 0.42, 0.014);
    g.add(heel);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.018, 0.008), skinPad);
    pad.position.set(0, h * 0.42, 0.022);
    g.add(pad);
    // Knuckle roots: one bump per finger where the fingers leave the palm.
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), skinPad);
      root.position.set(-w * 0.36 + i * w * 0.24, h * 0.47, 0.02);
      g.add(root);
    }
    return g;
  }
  // Forearm v7 (Stage 3): skin wrist between palm and glove cuff, so the
  // hand-to-sleeve transition reads as skin → tactical glove cuff → sleeve,
  // not one grey pipe. Cuff stays the dark textured glove; a tan strap band
  // sits over it.
  function buildForearm() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.11, 16), sleeve));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 16), glove);
    cuff.position.set(0, 0.045, 0);
    g.add(cuff);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0325, 0.003, 8, 16), strap);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.033, 0);
    g.add(band);
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin);
    wrist.scale.set(1, 0.6, 1);
    wrist.position.set(0, 0.065, 0);
    g.add(wrist);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.0035, 8, 14), sleeve);
    fold.rotation.x = Math.PI / 2;
    fold.position.set(0, -0.02, 0);
    g.add(fold);
    return g;
  }
  const model = new THREE.Group();
  // Animated magazine (Stage 3): a separate unmerged child per weapon — it
  // drops out of the weapon during reload. mergeStaticByMaterial skips
  // meshes flagged userData.animated; everything else stays baked.
  let magGroup = null;
  if (def.name === 'P9') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.08), grip);
    handle.position.set(0, -0.08, 0.08);
    // Iron sights: front post + rear notch, so the slide stops reading as a plain bar.
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.008), body);
    frontSight.position.set(0, 0.04, -0.1);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.012), body);
    rearSight.position.set(0, 0.037, 0.1);
    // Trigger, steel muzzle ring, and slide serrations for definition.
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.018), body);
    trigger.position.set(0, -0.055, 0.045);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.02), steel);
    muzzle.position.set(0, 0, -0.125);
    // Thin steel top strip so the slide reads as two-tone, not one slab.
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.18), steel);
    topStrip.position.set(0, 0.032, 0);
    model.add(slide, handle, frontSight, rearSight, trigger, muzzle, topStrip);
    // Magazine: lives inside the grip at rest (base plate just proud of the
    // grip bottom), slides straight down during reload.
    magGroup = new THREE.Group();
    const magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.068), grip);
    magMesh.userData.animated = true;
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.014, 0.072), steel);
    magPlate.position.set(0, -0.055, 0);
    magPlate.userData.animated = true;
    magGroup.add(magMesh, magPlate);
    magGroup.position.set(0, -0.095, 0.08);
    model.add(magGroup);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.025, 0.008), body);
      rib.position.set(0, 0.005, 0.075 + i * 0.014);
      model.add(rib);
      // Side serrations: vertical ribs on both slide flanks, so the slide
      // reads as a pistol slide from the side, not a plain bar.
      for (const sx of [-0.032, 0.032]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.008), body);
        side.position.set(sx, 0.005, 0.075 + i * 0.014);
        model.add(side);
      }
    }
    // Right hand: palm behind the grip; four fingers wrap the grip around
    // its camera-side edge and across the front, thumb along the frame.
    const palmR = buildPalm(0.102, 0.112);
    palmR.position.set(0, -0.075, 0.128);
    palmR.rotation.x = -0.08;
    model.add(palmR);
    // Per-finger anatomy: middle longest, pinky shortest/thinnest, curl
    // tightens toward the pinky, tips stagger back in an arc.
    [
      { y: -0.038, lens: [0.028, 0.024, 0.014], r: 0.0095, angles: [-0.6, -0.4], dz: 0.002 },
      { y: -0.066, lens: [0.032, 0.027, 0.015], r: 0.0105, angles: [-0.72, -0.52], dz: 0 },
      { y: -0.094, lens: [0.03, 0.026, 0.014], r: 0.01, angles: [-0.78, -0.58], dz: -0.002 },
      { y: -0.12, lens: [0.024, 0.02, 0.012], r: 0.0078, angles: [-0.85, -0.65], dz: -0.004 },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'z', curlAxis: 'y', angles: cfg.angles });
      f.position.set(-0.045, cfg.y, 0.105 + cfg.dz);
      f.rotation.y = Math.PI + 0.35;
      model.add(f);
    });
    const thumbR = buildFinger({ lens: [0.034, 0.027], r: 0.011, axis: 'z', curlAxis: 'x', angles: [-0.3, -0.25] });
    thumbR.position.set(-0.048, -0.055, 0.118);
    thumbR.rotation.y = Math.PI + 0.15;
    model.add(thumbR);
    const armR = buildForearm();
    armR.position.set(0.01, -0.15, 0.155);
    armR.rotation.x = -0.55;
    armR.rotation.z = -0.12;
    model.add(armR);
    // Left support hand: palm cupped under the grip, shifted forward and
    // down-left of the right hand so it reads as a second hand, not hidden
    // behind it; fingers rise along the front of the grip, outer fingers
    // fanned so they read past the grip silhouette; forearm angles down-left.
    const palmL = buildPalm(0.106, 0.096);
    palmL.position.set(-0.042, -0.158, -0.005);
    palmL.rotation.x = 0.45;
    palmL.rotation.z = 0.12;
    model.add(palmL);
    [
      { lx: -0.042, lens: [0.026, 0.022, 0.016], r: 0.0095, angles: [0.12, 0.2] },
      { lx: -0.014, lens: [0.03, 0.025, 0.017], r: 0.0105, angles: [0.18, 0.28] },
      { lx: 0.014, lens: [0.028, 0.024, 0.016], r: 0.01, angles: [0.2, 0.3] },
      { lx: 0.042, lens: [0.022, 0.018, 0.013], r: 0.0078, angles: [0.25, 0.35] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'x', angles: cfg.angles });
      f.position.set(cfg.lx - 0.028, -0.136, 0.008);
      f.rotation.z = cfg.lx < 0 ? 0.3 : -0.3;
      model.add(f);
    });
    const thumbL = buildFinger({ lens: [0.028, 0.022], r: 0.01, axis: 'z', curlAxis: 'x', angles: [-0.15, -0.15] });
    thumbL.position.set(-0.068, -0.122, 0.005);
    thumbL.rotation.y = Math.PI + 0.2;
    model.add(thumbL);
    const armL = buildForearm();
    armL.position.set(-0.058, -0.198, 0.0);
    armL.rotation.x = -0.5;
    armL.rotation.z = -0.7;
    model.add(armL);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.38), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), grip);
    stock.position.set(0, -0.02, 0.3);
    // Bigger, angled magazine with a steel base plate, so the rifle stops
    // reading as one plain slab. Stage 3: separate unmerged child — it drops
    // out during reload (see step()).
    magGroup = new THREE.Group();
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), grip);
    mag.userData.animated = true;
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, 0.105), grip);
    magBase.position.set(0, -0.09, 0.02);
    magBase.userData.animated = true;
    magGroup.add(mag, magBase);
    magGroup.position.set(0, -0.11, -0.05);
    magGroup.rotation.x = 0.25;
    model.add(magGroup);
    // Handguard under the barrel, steel muzzle, charging handle.
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.24), grip);
    handguard.position.set(0, 0.0, -0.28);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), steel);
    muzzle.position.set(0, 0.025, -0.6);
    const charging = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), steel);
    charging.position.set(0.055, 0.02, 0.05);
    // Iron sights + trigger, so the rifle stops reading as plain boxes.
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), body);
    rearSight.position.set(0, 0.06, 0.18);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.042, 0.01), body);
    frontSight.position.set(0, 0.066, -0.55);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.02), body);
    trigger.position.set(0, -0.065, 0.08);
    // Amber accent stripe along the receiver top — narrow + muted so it
    // reads as a rail accent, not a slab. One merged mesh.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.22), accent);
    stripe.position.set(0, 0.047, -0.02);
    model.add(receiver, barrel, stock, handguard, muzzle, charging, rearSight, frontSight, trigger, stripe);
    // Right hand on the stock grip: palm below the stock, fingers wrapping
    // up around its camera-side edge and over the top, thumb on the far side.
    const palmR = buildPalm(0.108, 0.118);
    palmR.position.set(0, -0.055, 0.29);
    palmR.rotation.x = -0.05;
    model.add(palmR);
    [
      { z: 0.238, lens: [0.032, 0.028, 0.024], r: 0.0095, angles: [-0.6, -0.65] },
      { z: 0.272, lens: [0.036, 0.031, 0.026], r: 0.0105, angles: [-0.72, -0.78] },
      { z: 0.306, lens: [0.034, 0.03, 0.025], r: 0.01, angles: [-0.78, -0.83] },
      { z: 0.338, lens: [0.027, 0.023, 0.019], r: 0.0078, angles: [-0.85, -0.9] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'z', angles: cfg.angles });
      f.position.set(-0.055, -0.075, cfg.z);
      f.rotation.z = -0.12;
      model.add(f);
    });
    const thumbR = buildFinger({ lens: [0.03, 0.024], r: 0.011, axis: 'z', curlAxis: 'x', angles: [-0.2, -0.2] });
    thumbR.position.set(0.042, -0.045, 0.33);
    thumbR.rotation.y = Math.PI + 0.1;
    model.add(thumbR);
    const armR = buildForearm();
    armR.position.set(0.01, -0.115, 0.325);
    armR.rotation.x = -0.55;
    model.add(armR);
    // Left hand on the foregrip: palm under the barrel, fingers wrapping up
    // around the barrel and over the top, thumb over the top from the far side.
    const palmL = buildPalm(0.102, 0.108);
    palmL.position.set(0, -0.035, -0.32);
    palmL.rotation.x = 0.15;
    model.add(palmL);
    [
      { z: -0.252, lens: [0.028, 0.024, 0.02], r: 0.0095, angles: [-0.6, -0.7] },
      { z: -0.284, lens: [0.032, 0.027, 0.022], r: 0.0105, angles: [-0.7, -0.8] },
      { z: -0.316, lens: [0.03, 0.026, 0.021], r: 0.01, angles: [-0.75, -0.85] },
      { z: -0.346, lens: [0.024, 0.02, 0.016], r: 0.0078, angles: [-0.85, -0.9] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'z', angles: cfg.angles });
      f.position.set(-0.038, -0.038, cfg.z);
      f.rotation.z = -0.1;
      model.add(f);
    });
    const thumbL = buildFinger({ lens: [0.026, 0.02], r: 0.01, axis: 'y', curlAxis: 'z', angles: [0.6, 0.5] });
    thumbL.position.set(0.03, -0.005, -0.30);
    thumbL.rotation.z = 0.15;
    model.add(thumbL);
    const armL = buildForearm();
    armL.position.set(-0.03, -0.068, -0.285);
    armL.rotation.x = -0.4;
    armL.rotation.z = -0.2;
    model.add(armL);
  }
  model.position.set(VIEW_BASE.x, VIEW_BASE.y, VIEW_BASE.z);
  model.scale.setScalar(VIEW_SCALE);
  if (magGroup) {
    model.userData.magGroup = magGroup;
    model.userData.magRest = { pos: magGroup.position.clone(), rot: magGroup.rotation.clone() };
  }
  mergeStaticByMaterial(model);
  return model;
}

// Merge every static mesh of a view model into one geometry per material.
// The finger pivots never animate after build (only the whole model kicks
// and dips on fire/reload), so baking them keeps the exact same look with
// ~100 fewer draw calls — the bench was at 217 calls vs the 180 budget.
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

function mergeStaticByMaterial(model) {
  model.updateMatrixWorld(true);
  const inv = model.matrixWorld.clone().invert();
  const groups = new Map();
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    // Animated parts (magazine) stay live children — never baked, so step()
    // can move them. Everything else merges by material as before.
    if (mesh.userData.animated) continue;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(inv.clone().multiply(mesh.matrixWorld));
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    groups.get(mesh.material).push(geo);
    mesh.parent.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const [material, geos] of groups) {
    const merged = mergeGeometries(geos);
    if (merged) model.add(new THREE.Mesh(merged, material));
  }
}

export function createWeaponSet(camera) {
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.2, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.18, -0.8);
  camera.add(flashLight);

  const models = {};
  for (const key of Object.keys(WEAPONS)) {
    models[key] = buildViewModel(WEAPONS[key]);
    models[key].visible = false;
    camera.add(models[key]);
  }

  // Per-weapon live state: magazine, reserve, cadence accumulator, reload, flash, kick.
  const live = {};
  for (const key of Object.keys(WEAPONS)) {
    live[key] = {
      mag: WEAPONS[key].mag,
      reserve: WEAPONS[key].reserve,
      accumulator: 0,
      reloadLeft: 0,
    };
  }
  let current = 'P9';
  let flashLeft = 0;
  let kick = 0;
  // Weapon-switch animation state (Stage 3): visual only, ~0.25 s. The new
  // weapon is usable the instant switchTo runs — the animation never gates
  // gameplay. { t, from, to } while active, null otherwise.
  let switchAnim = null;
  const SWITCH_SECONDS = 0.25;
  models[current].visible = true;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInQuad(t) { return t * t; }
  // Smoothstep envelope between p=a and p=b (0 below a, 1 above b).
  function smooth(a, b, p) {
    const x = Math.min(1, Math.max(0, (p - a) / (b - a)));
    return x * x * (3 - 2 * x);
  }
  function resetModelPose(model) {
    model.position.set(VIEW_BASE.x, VIEW_BASE.y, VIEW_BASE.z);
    model.rotation.set(0, 0, 0);
  }
  function resetMag(model) {
    const mg = model.userData.magGroup;
    const rest = model.userData.magRest;
    if (mg && rest) {
      mg.position.copy(rest.pos);
      mg.rotation.copy(rest.rot);
    }
  }

  function step(dt) {
    flashLeft = Math.max(0, flashLeft - dt);
    kick += (0 - kick) * Math.min(1, dt * 14);
    // Switch animation: old model sinks + tilts away (hidden past halfway),
    // new model rises from below. Visual only.
    if (switchAnim) {
      switchAnim.t = Math.min(1, switchAnim.t + dt / SWITCH_SECONDS);
      const t = switchAnim.t;
      const old = models[switchAnim.from];
      old.visible = t < 0.5;
      old.position.y = VIEW_BASE.y - 0.16 * easeInQuad(Math.min(1, t * 1.4));
      old.position.z = VIEW_BASE.z + 0.08 * t;
      old.rotation.x = 0.35 * t;
      if (t >= 1) {
        resetModelPose(old);
        old.visible = false;
        switchAnim = null;
      }
    }
    const model = models[current];
    // Pose offsets: kick + switch rise + reload dip, all additive.
    let yOff = 0;
    let zOff = kick;
    let rx = kick * 2.2;
    let rz = 0;
    if (switchAnim) {
      const t = switchAnim.t;
      yOff -= 0.16 * (1 - easeOutCubic(t));
      zOff += 0.08 * (1 - t);
      rx += 0.35 * (1 - t);
    }
    flash.visible = flashLeft > 0;
    flash.rotation.z = flashLeft * 30;
    flashLight.intensity = flashLeft > 0 ? 18 : 0;
    const st = live[current];
    if (st.reloadLeft > 0) {
      st.reloadLeft = Math.max(0, st.reloadLeft - dt);
      const total = WEAPONS[current].reloadSeconds;
      const p = 1 - st.reloadLeft / total;
      // Phased reload: dip + tilt in (0–0.2), hold, raise back (0.82–1).
      // Dip kept shallow (-0.38) and the model lifts slightly (+0.03) so the
      // dropping magazine stays in frame — a deep dip pushed it off-screen.
      const dip = smooth(0, 0.18, p) * (1 - smooth(0.82, 1, p));
      rx += -0.38 * dip;
      rz += 0.12 * dip;
      yOff += 0.01 * dip;
      zOff += 0.03 * dip;
      // Magazine: slides out (0.22–0.48), seats back (0.55–0.82). Drop is
      // 0.09 — enough to open a clear gap under the receiver/grip while the
      // magazine itself stays on screen.
      const mg = model.userData.magGroup;
      if (mg) {
        const rest = model.userData.magRest;
        const out = smooth(0.22, 0.48, p) * (1 - smooth(0.55, 0.82, p));
        mg.position.y = rest.pos.y - 0.09 * out;
        mg.position.z = rest.pos.z + 0.02 * out;
        mg.rotation.x = rest.rot.x + 0.3 * out;
      }
      if (st.reloadLeft === 0) {
        const need = WEAPONS[current].mag - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take;
        st.reserve -= take;
        resetMag(model);
      }
    }
    model.position.set(VIEW_BASE.x, VIEW_BASE.y + yOff, VIEW_BASE.z + zOff);
    model.rotation.set(rx, 0, rz);
  }

  return {
    step,
    get current() {
      return current;
    },
    get def() {
      return WEAPONS[current];
    },
    get state() {
      return live[current];
    },
    get all() {
      return live;
    },
    // AMB-02: accumulate (rpm / 60) shots per second of trigger held; fire while the
    // accumulator holds a whole shot. Leftover fractions carry to the next tick.
    triggerHeld(dt) {
      const def = WEAPONS[current];
      const st = live[current];
      if (st.reloadLeft > 0) return 0;
      st.accumulator += (def.rpm / 60) * dt;
      let fired = 0;
      while (st.accumulator >= 1 && st.mag > 0) {
        st.accumulator -= 1;
        st.mag -= 1;
        fired += 1;
      }
      if (st.mag === 0) st.accumulator = 0;
      if (fired > 0) {
        flashLeft = 0.06;
        kick = 0.055;
      }
      return fired;
    },
    takeRound() {
      const st = live[current];
      if (st.mag <= 0) return false;
      st.mag -= 1;
      flashLeft = 0.06;
      kick = 0.055;
      return true;
    },
    ready() {
      const st = live[current];
      return st.mag > 0 && st.reloadLeft === 0;
    },
    reload() {
      const st = live[current];
      const def = WEAPONS[current];
      if (st.reloadLeft > 0 || st.mag === def.mag || st.reserve === 0) return false;
      st.reloadLeft = def.reloadSeconds;
      return true;
    },
    spread(speed) {
      const def = WEAPONS[current];
      return def.spreadStill + Math.min(1, speed / 4.9) * def.spreadMove;
    },
    switchTo(key) {
      if (!WEAPONS[key] || key === current) return false;
      // A switch interrupted mid-animation: snap the old outgoing model back
      // to its base pose and hide it before starting the new animation.
      if (switchAnim) {
        const prev = models[switchAnim.from];
        resetModelPose(prev);
        prev.visible = false;
        switchAnim = null;
      }
      const oldKey = current;
      current = key;
      models[current].visible = true;
      live[current].accumulator = 0;
      // Old model stays visible until the animation hides it past halfway.
      switchAnim = { t: 0, from: oldKey, to: key };
      return true;
    },
    buy(key) {
      // Buying a primary replaces the held primary's ammo with a fresh load.
      live[key].mag = WEAPONS[key].mag;
      live[key].reserve = WEAPONS[key].reserve;
      live[key].accumulator = 0;
      live[key].reloadLeft = 0;
    },
    refillMagFree() {
      // Survivors carry over: magazine refilled free, reserve NOT topped up (frozen).
      const st = live[current];
      st.mag = WEAPONS[current].mag;
    },
    resetToPistol() {
      // Dead players respawn with P9 only (frozen).
      this.switchTo('P9');
      live.P9.mag = WEAPONS.P9.mag;
      live.P9.reserve = WEAPONS.P9.reserve;
      live.VK47.mag = WEAPONS.VK47.mag;
      live.VK47.reserve = WEAPONS.VK47.reserve;
    },
  };
}
