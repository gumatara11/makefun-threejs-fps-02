// Weapons: P9 and VK-47 (frozen stats). One view model per weapon, a magazine, a
// reload, and spread that punishes moving. Cadence uses a time accumulator
// (AMB-02, approved): leftover time carries into the next tick, so 600 RPM fires
// exactly 10 shots a second even on a 60 Hz fixed step.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './config.js';

let gloveTextureCache = null;
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

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.35 });
  // First-person hands v5: articulated gloved hands, rebuilt from the finger
  // chains up (v3 read as blocks, v4 fingers blurred into one ribbed stack).
  // Each finger now has its own anatomy — middle longest, pinky shortest and
  // thinnest, tighter curl toward the pinky, a dark reinforced distal
  // phalanx and fingertip pad so each finger ends distinctly — plus a
  // thicker palm with knuckle-root bumps, a high-contrast glove texture
  // (visible at normal play distance), and slimmer, lighter forearms.
  // Hands are children of the weapon model, so they follow recoil kick, the
  // reload dip, and weapon switches exactly — visual only, no gameplay,
  // combat, or input code is touched.
  const gloveTex = makeGloveTexture();
  const glove = gloveTex
    ? new THREE.MeshStandardMaterial({ map: gloveTex, bumpMap: gloveTex, bumpScale: 0.7, roughness: 0.85, metalness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: new THREE.Color('#7e8272'), roughness: 0.85, metalness: 0.05 });
  const glovePad = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9a9e90'), roughness: 0.55, metalness: 0.05 });
  const gloveTip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f423c'), roughness: 0.8, metalness: 0.05 });
  const crease = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1e20'), roughness: 0.95 });
  const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5c6068'), roughness: 0.95, metalness: 0 });
  const strap = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a89a7a'), roughness: 0.7, metalness: 0.05 });
  // Articulated finger: capsule phalanges chained on joint pivots. Segments
  // extend along `axis` ('y' = up, 'z' = forward); each joint rotates about
  // `curlAxis` by angles[i], curling the finger around the grip. A knuckle
  // sphere sits at every joint and a dark crease ring marks each joint.
  function buildFinger({ lens, r, axis = 'z', curlAxis = 'y', angles = [] }) {
    const root = new THREE.Group();
    let parent = root;
    lens.forEach((len, i) => {
      const pivot = new THREE.Group();
      if (i > 0) {
        if (axis === 'z') pivot.position.set(0, 0, lens[i - 1]);
        else pivot.position.set(0, lens[i - 1], 0);
        pivot.rotation[curlAxis] = angles[i - 1] ?? 0;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.0016, 6, 12), crease);
        if (axis === 'y') ring.rotation.x = Math.PI / 2;
        ring.scale.set(1.3, 0.8, 1);
        pivot.add(ring);
      }
      // Fingers are flattened (wide, thin), not round pills: the scale is
      // applied in the finger's local space, so it holds for both axes.
      const flat = axis === 'z' ? [1.3, 0.8, 1] : [1.3, 1, 0.8];
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 10, 8), i === 0 ? glovePad : glove);
      knuckle.scale.set(...flat);
      pivot.add(knuckle);
      const last = i === lens.length - 1;
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), last ? gloveTip : glove);
      seg.scale.set(1.3, 1, 0.8);
      if (axis === 'z') { seg.rotation.x = Math.PI / 2; seg.position.set(0, 0, len / 2); }
      else seg.position.set(0, len / 2, 0);
      pivot.add(seg);
      if (last) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), gloveTip);
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
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.042), glove));
    const bulge = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), glove);
    bulge.scale.set(w * 0.52, h * 0.5, 0.026);
    bulge.position.set(0, 0.004, 0.016);
    g.add(bulge);
    const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glove);
    thenar.scale.set(0.026, 0.038, 0.018);
    thenar.position.set(-w * 0.32, -h * 0.3, 0.014);
    g.add(thenar);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glove);
    heel.scale.set(w * 0.4, h * 0.22, 0.018);
    heel.position.set(0, -h * 0.42, 0.014);
    g.add(heel);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.018, 0.008), glovePad);
    pad.position.set(0, h * 0.42, 0.022);
    g.add(pad);
    // Knuckle roots: one bump per finger where the fingers leave the palm.
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), glovePad);
      root.position.set(-w * 0.36 + i * w * 0.24, h * 0.47, 0.02);
      g.add(root);
    }
    return g;
  }
  function buildForearm() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.038, 0.22, 12), sleeve));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.03, 12), strap);
    cuff.position.set(0, 0.09, 0);
    g.add(cuff);
    // Rounded wrist at the top so the arm never reads as a cut pipe.
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), glovePad);
    wrist.scale.set(1, 0.55, 1);
    wrist.position.set(0, 0.11, 0);
    g.add(wrist);
    // Sleeve folds: two raised rings so the arm reads as fabric, not a stick.
    [[-0.03, 0.034], [-0.075, 0.037]].forEach(([fy, fr]) => {
      const fold = new THREE.Mesh(new THREE.TorusGeometry(fr, 0.004, 8, 14), sleeve);
      fold.rotation.x = Math.PI / 2;
      fold.position.set(0, fy, 0);
      g.add(fold);
    });
    return g;
  }
  const model = new THREE.Group();
  if (def.name === 'P9') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.08), grip);
    handle.position.set(0, -0.08, 0.08);
    model.add(slide, handle);
    // Right hand: palm behind the grip; four fingers wrap the grip around
    // its camera-side edge and across the front, thumb along the frame.
    const palmR = buildPalm(0.102, 0.112);
    palmR.position.set(0, -0.075, 0.128);
    palmR.rotation.x = -0.08;
    model.add(palmR);
    // Per-finger anatomy: middle longest, pinky shortest/thinnest, curl
    // tightens toward the pinky, tips stagger back in an arc.
    [
      { y: -0.038, lens: [0.028, 0.024, 0.014], r: 0.0105, angles: [-0.6, -0.4], dz: 0.002 },
      { y: -0.066, lens: [0.032, 0.027, 0.015], r: 0.0115, angles: [-0.72, -0.52], dz: 0 },
      { y: -0.094, lens: [0.03, 0.026, 0.014], r: 0.011, angles: [-0.78, -0.58], dz: -0.002 },
      { y: -0.12, lens: [0.024, 0.02, 0.012], r: 0.0085, angles: [-0.85, -0.65], dz: -0.004 },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'z', curlAxis: 'y', angles: cfg.angles });
      f.position.set(-0.045, cfg.y, 0.105 + cfg.dz);
      f.rotation.y = Math.PI + 0.35;
      model.add(f);
    });
    const thumbR = buildFinger({ lens: [0.034, 0.027], r: 0.012, axis: 'z', curlAxis: 'x', angles: [-0.3, -0.25] });
    thumbR.position.set(-0.048, -0.055, 0.118);
    thumbR.rotation.y = Math.PI + 0.15;
    model.add(thumbR);
    const armR = buildForearm();
    armR.position.set(0.01, -0.2, 0.22);
    armR.rotation.x = 0.38;
    model.add(armR);
    // Left support hand: palm cupped under the grip, shifted forward; its
    // fingers rise along the front of the grip, outer fingers fanned so they
    // read past the grip silhouette; forearm angles down-left (V shape).
    const palmL = buildPalm(0.106, 0.096);
    palmL.position.set(-0.02, -0.172, -0.005);
    palmL.rotation.x = 0.35;
    palmL.rotation.z = 0.12;
    model.add(palmL);
    [
      { lx: -0.042, lens: [0.026, 0.022, 0.016], r: 0.0105, angles: [0.12, 0.2] },
      { lx: -0.014, lens: [0.03, 0.025, 0.017], r: 0.0115, angles: [0.18, 0.28] },
      { lx: 0.014, lens: [0.028, 0.024, 0.016], r: 0.011, angles: [0.2, 0.3] },
      { lx: 0.042, lens: [0.022, 0.018, 0.013], r: 0.0085, angles: [0.25, 0.35] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'x', angles: cfg.angles });
      f.position.set(cfg.lx, -0.15, 0.008);
      f.rotation.z = cfg.lx < 0 ? 0.3 : -0.3;
      model.add(f);
    });
    const thumbL = buildFinger({ lens: [0.028, 0.022], r: 0.011, axis: 'z', curlAxis: 'x', angles: [-0.15, -0.15] });
    thumbL.position.set(-0.04, -0.135, 0.005);
    thumbL.rotation.y = Math.PI + 0.2;
    model.add(thumbL);
    const armL = buildForearm();
    armL.position.set(-0.085, -0.225, 0.08);
    armL.rotation.x = 0.38;
    armL.rotation.z = 0.45;
    model.add(armL);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.09), grip);
    mag.position.set(0, -0.1, -0.05);
    mag.rotation.x = 0.2;
    model.add(receiver, barrel, stock, mag);
    // Right hand on the stock grip: palm below the stock, fingers wrapping
    // up around its camera-side edge and over the top, thumb on the far side.
    const palmR = buildPalm(0.108, 0.118);
    palmR.position.set(0, -0.055, 0.29);
    palmR.rotation.x = -0.05;
    model.add(palmR);
    [
      { z: 0.238, lens: [0.032, 0.028, 0.024], r: 0.0105, angles: [-0.6, -0.65] },
      { z: 0.272, lens: [0.036, 0.031, 0.026], r: 0.0115, angles: [-0.72, -0.78] },
      { z: 0.306, lens: [0.034, 0.03, 0.025], r: 0.011, angles: [-0.78, -0.83] },
      { z: 0.338, lens: [0.027, 0.023, 0.019], r: 0.0085, angles: [-0.85, -0.9] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'z', angles: cfg.angles });
      f.position.set(-0.055, -0.075, cfg.z);
      f.rotation.z = -0.12;
      model.add(f);
    });
    const thumbR = buildFinger({ lens: [0.03, 0.024], r: 0.012, axis: 'z', curlAxis: 'x', angles: [-0.2, -0.2] });
    thumbR.position.set(0.042, -0.045, 0.33);
    thumbR.rotation.y = Math.PI + 0.1;
    model.add(thumbR);
    const armR = buildForearm();
    armR.position.set(0.01, -0.14, 0.45);
    armR.rotation.x = 0.38;
    model.add(armR);
    // Left hand on the foregrip: palm under the barrel, fingers wrapping up
    // around the barrel and over the top, thumb over the top from the far side.
    const palmL = buildPalm(0.102, 0.108);
    palmL.position.set(0, -0.035, -0.32);
    palmL.rotation.x = 0.15;
    model.add(palmL);
    [
      { z: -0.252, lens: [0.028, 0.024, 0.02], r: 0.0105, angles: [-0.6, -0.7] },
      { z: -0.284, lens: [0.032, 0.027, 0.022], r: 0.0115, angles: [-0.7, -0.8] },
      { z: -0.316, lens: [0.03, 0.026, 0.021], r: 0.011, angles: [-0.75, -0.85] },
      { z: -0.346, lens: [0.024, 0.02, 0.016], r: 0.0085, angles: [-0.85, -0.9] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'z', angles: cfg.angles });
      f.position.set(-0.038, -0.038, cfg.z);
      f.rotation.z = -0.1;
      model.add(f);
    });
    const thumbL = buildFinger({ lens: [0.026, 0.02], r: 0.011, axis: 'y', curlAxis: 'z', angles: [0.6, 0.5] });
    thumbL.position.set(0.03, -0.005, -0.30);
    thumbL.rotation.z = 0.15;
    model.add(thumbL);
    const armL = buildForearm();
    armL.position.set(-0.055, -0.125, -0.13);
    armL.rotation.x = 0.38;
    armL.rotation.z = 0.2;
    model.add(armL);
  }
  model.position.set(0.28, -0.25, -0.68);
  model.scale.setScalar(0.62);
  return model;
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
  models[current].visible = true;

  function step(dt) {
    flashLeft = Math.max(0, flashLeft - dt);
    kick += (0 - kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.68 + kick;
    model.rotation.x = kick * 2.2;
    flash.visible = flashLeft > 0;
    flash.rotation.z = flashLeft * 30;
    flashLight.intensity = flashLeft > 0 ? 18 : 0;
    const st = live[current];
    if (st.reloadLeft > 0) {
      st.reloadLeft = Math.max(0, st.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (WEAPONS[current].reloadSeconds - st.reloadLeft) * 2);
      if (st.reloadLeft === 0) {
        const need = WEAPONS[current].mag - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take;
        st.reserve -= take;
      }
    }
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
      models[current].visible = false;
      current = key;
      models[current].visible = true;
      live[current].accumulator = 0;
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
