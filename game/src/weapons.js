// Weapons: P9 and VK-47 (frozen stats). One view model per weapon, a magazine, a
// reload, and spread that punishes moving. Cadence uses a time accumulator
// (AMB-02, approved): leftover time carries into the next tick, so 600 RPM fires
// exactly 10 shots a second even on a 60 Hz fixed step.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './config.js';

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.35 });
  // Gloved first-person hands (light gloves, PALETTE.ink). Parented to the weapon
  // model, so they follow it exactly through recoil kick, the reload dip, and
  // weapon switches — visual only, no gameplay, combat, or input code is touched.
  // The hands are deliberately chunky and oversized vs the gun (classic FPS
  // viewmodel style): palm wider than the grip, knuckle bars protruding on both
  // sides, thumb on the camera side, and a wrist/forearm entering from the
  // bottom of the screen, so they read as hands at a glance, not as gun parts.
  const glove = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.9, metalness: 0.05 });
  function hand(w, h, d, x, y, z, rx = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glove);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    return m;
  }
  const model = new THREE.Group();
  if (def.name === 'P9') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.08), grip);
    handle.position.set(0, -0.08, 0.08);
    model.add(slide, handle);
    // Right hand wrapped around the pistol grip + forearm from below.
    model.add(
      hand(0.10, 0.12, 0.12, 0, -0.08, 0.08),
      hand(0.11, 0.04, 0.035, 0, -0.045, 0.025),
      hand(0.03, 0.08, 0.045, 0.055, -0.06, 0.06),
      hand(0.075, 0.08, 0.22, 0.01, -0.17, 0.20, 0.55, 0),
    );
    // Left support hand cupping under the grip, shifted FORWARD so it reads as a
    // second hand in front of the right hand (not stacked under it), its forearm
    // angled down-left so the two forearms diverge into a V.
    model.add(
      hand(0.095, 0.07, 0.11, 0, -0.16, -0.02),
      hand(0.10, 0.035, 0.03, 0, -0.135, -0.06),
      hand(0.07, 0.07, 0.20, -0.09, -0.21, 0.10, 0.55, 0.5),
    );
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
    // Right hand on the stock grip + forearm from below.
    model.add(
      hand(0.105, 0.11, 0.13, 0, -0.02, 0.28),
      hand(0.11, 0.04, 0.035, 0, 0.01, 0.235),
      hand(0.03, 0.08, 0.045, 0.055, -0.01, 0.26),
      hand(0.075, 0.08, 0.22, 0.01, -0.11, 0.42, 0.55, 0),
    );
    // Left hand on the foregrip: palm under the barrel, knuckles over the top.
    model.add(
      hand(0.10, 0.08, 0.12, 0, -0.03, -0.32),
      hand(0.105, 0.035, 0.03, 0, 0.055, -0.32),
      hand(0.03, 0.06, 0.04, 0.05, -0.01, -0.30),
      hand(0.07, 0.07, 0.20, -0.05, -0.10, -0.16, 0.55, 0.2),
    );
  }
  model.position.set(0.3, -0.26, -0.7);
  model.scale.setScalar(0.5);
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
    model.position.z = -0.7 + kick;
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
