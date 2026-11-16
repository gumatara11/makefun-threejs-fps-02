// Weapons: P9 and VK-47 (frozen stats). One view model per weapon, a magazine, a
// reload, and spread that punishes moving. Cadence uses a time accumulator
// (AMB-02, approved): leftover time carries into the next tick, so 600 RPM fires
// exactly 10 shots a second even on a 60 Hz fixed step.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './config.js';

// Hands v8 (16 Nov, after Gito's "tiru Top 3" direction): the Top 3
// threejs-fps-02 covers (Kilnyard 97.4%, Lantern Rock 95.5%, CAMPANILE
// 95.5% — repos withheld, no code copied) all show the same lesson: the
// weapon is BIG and readable in frame, and the hands read through CONTRAST
// — CAMPANILE's model is a dark-gloved hand on the pistol grip + a gloved
// hand on the foregrip, a bright yellow cuff, and a long tan sleeve. So v8
// drops the v7 skin-tone fingers for near-black tactical gloves (dark
// fingers + palm, mid-grey knuckles, lighter fingertip pads), a yellow cuff,
// and a tan sleeve. A thin skin sliver stays at the wrist (anime touch).
// Fingers are thinner with wider gaps so each finger reads as its own shape
// wrapping the grip — not one capsule block.
// Hands v9 (16 Nov, after Gito's "perbaiki lagi, belum sempurna"): v8's
// fingers still read as knuckle bumps at normal play distance — dark on
// dark (glove #26282a on grip #3a3f46). CAMPANILE's real trick is LIGHT
// fingers on a DARK grip: the foregrip hand's fingers are pale and read as
// separate wrapped bands. So v9 makes the finger SEGMENTS light grey
// (#8f9296, tips #a9adb1) while the palm back, knuckles and creases stay
// dark — the hand still reads as a dark glove, but each finger is a light
// band across the dark grip. Fingers are also bigger (+~30% radius) with
// wider gaps and thicker crease rings, so the separation reads in the
// regular idle view, not only in reload close-ups.
// Hands v11 (16 Nov, after Gito's "perbaiki lagi sampai sempurna"): v10
// fixed the float but the forearms read as smooth PIPES and the wrist
// ball reads as a robot sphere joint. CAMPANILE's forearm (and Lantern
// Rock's) works because the sleeve has SHAPE: it tapers from a narrow
// wrist, swells at the forearm muscle, and carries visible fold creases.
// So v11: the sleeve becomes a lathe profile (wrist narrow -> waist ->
// muscle belly -> elbow), 3 darker fold rings break the surface, and the
// wrist ball is flattened + tucked under the cuff so only a skin sliver
// shows. P9 arms are slimmed (0.88x) + angled wider so they frame the
// weapon instead of crowding the bottom-right; the VK-47 grip-hand arm
// is stood more upright so more of it stays in frame. Fingers untouched
// (v9 as-is); the v10 hand->wrist->forearm connection is preserved.
// Hands v12 (16 Nov, silent pass — Gito: no report until perfect): v11's
// belly was a 0.004 ripple on a monotonic taper and one fold ring was
// buried inside the sleeve, so at idle distance the arms still read as
// tubes WITH RINGS. v12 makes the belly DECISIVE (peak 0.074, >2x the
// wrist 0.036, wider than the elbow 0.058), adds a dark crease shadow
// band under the belly, and makes the 3 fold rings thicker (0.005) +
// darker (FOLD_DARK) with radii recomputed against the new profile so
// none can bury. Everything else v10/v11 stands.
// Hands v13 (16 Nov, silent pass — Gito: "terus sempurnakan"): v12's
// belly is SYMMETRIC — a swollen tube, not an anatomical forearm — and
// the sleeve surface is flat plastic in the flat light. So v13: the
// lathe is displaced toward the camera/palm side (+z) with a Gaussian
// bump peaking at the belly (0.016 at y -0.19), so the muscle swells on
// ONE side like a real flexor mass; the shadow band + fold rings are
// displaced by the same bump so they keep hugging the surface instead
// of burying under the muscle; and the sleeve gets a subtle canvas
// weave texture (faint grid + 2 lengthwise seams) so it reads as cloth.
// P9 arms angle a touch wider (less bottom-right crowding), the VK-47
// grip arm stands a touch more upright. Fingers untouched (v9 as-is);
// the v10 hand->wrist->forearm connection is preserved.
// Hands v14 (16 Nov, silent pass — Gito: "terus sempurnakan"): v13's
// muscle bump (peak 0.016) is too subtle at idle distance — the arms
// read as shaped, textured sleeves, but the muscle itself is not
// unmistakable as anatomy at a glance. So v14 pushes the same bump
// decisively (peak 0.024, sigma 0.085 -> 0.10) and adds a trailing-edge
// crease shadow: a dark partial shell hugging each side of the forearm
// at the belly height, where the bump fades to zero, so the muscle
// reads as a 3D mass in flat light. Rings + band keep hugging via
// hugMuscle. Fingers untouched (v9 as-is); the v10 hand->wrist->
// forearm connection is preserved.
const SKIN = '#f0c49c';
const GLOVE_DARK = '#26282a';
const GLOVE_KNUCKLE = '#55585c';
const GLOVE_TIP = '#6a6e73';
const GLOVE_SEG_LIGHT = '#8f9296';
const GLOVE_TIP_LIGHT = '#a9adb1';
const GLOVE_CREASE = '#141516';
const CUFF_YELLOW = '#d8a419';
const SLEEVE_TAN = '#9a8a68';
const STRAP_DARK = '#6b5a3e';
// Hands v12: v11's fold rings were thin AND low-contrast — and one was
// buried inside the sleeve (profile 0.059 vs ring 0.049). Fold rings and
// the belly shadow band go in FOLD_DARK, clearly darker than the sleeve.
const FOLD_DARK = '#43331a';

// Viewmodel base pose (v8: bigger + closer + more central than v7, so the
// weapon reads large in frame like the Top 3 covers — CAMPANILE's rifle
// spans ~35% of frame width; v7's P9 spanned ~15%. Viewmodel-only, no
// gameplay effect; reload/switch animations reference this constant).
// v8.1: y raised (-0.26 -> -0.20) and scale trimmed (0.85 -> 0.78) — the
// first v8 values pushed both hands to the bottom edge of the frame, the
// VK-47's foregrip hand falling off-screen entirely.
// v9: y raised again (-0.20 -> -0.155) — v8's VK-47 grip hand still sat
// with its knuckles on the bottom frame edge. CAMPANILE's weapon sits more
// centered; lifting the whole viewmodel puts both hands fully in frame.
const VIEW_BASE = { x: 0.21, y: -0.155, z: -0.62 };
const VIEW_SCALE = 0.78;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.35 });
  // First-person hands v8: near-black tactical gloves (dark fingers/palm,
  // mid-grey knuckles, lighter fingertip pads) + bright yellow cuff + tan
  // sleeve — the CAMPANILE look. Skin survives only as a thin wrist sliver.
  // Hands are children of the weapon model, so they follow recoil kick, the
  // reload dip, and weapon switches exactly — visual only, no gameplay,
  // combat, or input code is touched.
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN), roughness: 0.55, metalness: 0 });
  const gloveDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(GLOVE_DARK), roughness: 0.9, metalness: 0 });
  const gloveKnuckle = new THREE.MeshStandardMaterial({ color: new THREE.Color(GLOVE_KNUCKLE), roughness: 0.8, metalness: 0 });
  const gloveTip = new THREE.MeshStandardMaterial({ color: new THREE.Color(GLOVE_TIP), roughness: 0.75, metalness: 0 });
  // v9: light finger segments — the CAMPANILE read (pale fingers on a dark
  // grip). Palm back, knuckles and creases stay dark; only the wrapping
  // finger segments + tips go light, so each finger is a distinct band.
  const gloveSegLight = new THREE.MeshStandardMaterial({ color: new THREE.Color(GLOVE_SEG_LIGHT), roughness: 0.75, metalness: 0 });
  const gloveTipLight = new THREE.MeshStandardMaterial({ color: new THREE.Color(GLOVE_TIP_LIGHT), roughness: 0.7, metalness: 0 });
  const gloveCrease = new THREE.MeshStandardMaterial({ color: new THREE.Color(GLOVE_CREASE), roughness: 0.95 });
  // v13: subtle fabric weave on the sleeve — a low-contrast canvas
  // texture (fine weave grid + 2 lengthwise seams) so the surface reads
  // as cloth in flat light instead of smooth plastic. The map carries
  // the colour (world.js pattern: material colour left white), so the
  // overall tone stays SLEEVE_TAN. 0 draw calls, 0 tris.
  function sleeveTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = SLEEVE_TAN; g.fillRect(0, 0, 128, 128);
    // Fine weave: faint darker grid, low alpha so it stays subtle.
    g.strokeStyle = 'rgba(70,52,24,0.10)'; g.lineWidth = 1;
    for (let i = 0; i <= 128; i += 8) {
      g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(128, i + 0.5); g.stroke();
    }
    // Two lengthwise seams (constant u = vertical lines in canvas space).
    g.strokeStyle = 'rgba(70,52,24,0.28)'; g.lineWidth = 2;
    for (const x of [42, 86]) {
      g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 128); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const sleeve = new THREE.MeshStandardMaterial({ map: sleeveTexture(), roughness: 0.95, metalness: 0 });
  const strap = new THREE.MeshStandardMaterial({ color: new THREE.Color(STRAP_DARK), roughness: 0.7, metalness: 0.05 });
  // v12: fold rings + belly shadow band — clearly darker than the sleeve
  // (#43331a vs #9a8a68) so they read at idle distance in flat lighting.
  const foldDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(FOLD_DARK), roughness: 0.85, metalness: 0 });
  const cuffYellow = new THREE.MeshStandardMaterial({ color: new THREE.Color(CUFF_YELLOW), roughness: 0.6, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7e838b'), roughness: 0.4, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b97a1e'), roughness: 0.5, metalness: 0.2 });
  // Per-hand material set for fingers: LIGHT segments + tips (v9, the
  // CAMPANILE read), mid-grey knuckle pads, near-black joint creases.
  const HAND_MATS = { seg: gloveSegLight, tip: gloveTipLight, pad: gloveKnuckle, ring: gloveCrease };
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
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.0032, 6, 12), mats.ring);
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
      // Fingertips taper (narrower + flatter than the middle segments) so
      // each fingertip reads as its own rounded pad, not a capsule end.
      seg.scale.set(last ? 1.1 : 1.25, 1, last ? 0.7 : 0.75);
      if (axis === 'z') { seg.rotation.x = Math.PI / 2; seg.position.set(0, 0, len / 2); }
      else seg.position.set(0, len / 2, 0);
      pivot.add(seg);
      if (last) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 10, 8), mats.tip);
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
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.042), gloveDark));
    const bulge = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), gloveDark);
    bulge.scale.set(w * 0.52, h * 0.5, 0.02);
    bulge.position.set(0, 0.004, 0.016);
    g.add(bulge);
    const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), gloveDark);
    thenar.scale.set(0.026, 0.038, 0.018);
    thenar.position.set(-w * 0.32, -h * 0.3, 0.014);
    g.add(thenar);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), gloveDark);
    heel.scale.set(w * 0.4, h * 0.22, 0.018);
    heel.position.set(0, -h * 0.42, 0.014);
    g.add(heel);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.018, 0.008), gloveKnuckle);
    pad.position.set(0, h * 0.42, 0.022);
    g.add(pad);
    // Knuckle roots: one bump per finger where the fingers leave the palm —
    // bigger + wider apart in v8 so each finger base reads on its own.
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), gloveKnuckle);
      root.position.set(-w * 0.38 + i * w * 0.253, h * 0.47, 0.02);
      g.add(root);
    }
    // Separation grooves: thin dark slots between the finger roots, running
    // down the back of the hand — this is what makes the back of the hand
    // read as four separated fingers instead of one smooth glove blob.
    // v9: wider (0.0065) so the gaps read at normal play distance.
    for (let i = 0; i < 3; i++) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.0065, h * 0.62, 0.004), gloveCrease);
      groove.position.set(-w * 0.38 + (i + 0.5) * w * 0.253, h * 0.18, 0.022);
      g.add(groove);
    }
    return g;
  }
  // Forearm v11 (Gito: "perbaiki lagi sampai sempurna"): v10 fixed the
  // float but the sleeve was a smooth pipe and the wrist a visible ball.
  // Now a lathe profile (taper + muscle belly) with 3 darker fold rings,
  // and the wrist flattened + tucked under the cuff. `slim` narrows the
  // profile for the P9 arms. Fingers untouched (v9 as-is).
  // Forearm v10 (Top 3 attachment: Kilnyard / Lantern Rock / CAMPANILE):
  // sleeve LONG + THICK — it spans from the wrist down past the bottom
  // frame edge (FOV 74: edge at model y ≈ -0.40), never ends as a
  // mid-frame stub; its top (r 0.042) is as wide as the palm, so the
  // hand-to-arm transition never necks down. Wrist bigger + nudged toward
  // the camera (+z) so it bulges out of the palm's back face instead of
  // hiding behind it — v9's wrist sat behind the palm box, invisible, and
  // the sleeve emerged offset behind the palm's bottom edge: the floating
  // seam. Cuff wider (0.04) as the bright bridge band.
  function buildForearm({ slim = 1 } = {}) {
    const g = new THREE.Group();
    // Lathe profile (radius, y), elbow end -> wrist end. v12: the belly
    // is DECISIVE — peak 0.074 at y -0.19, more than 2x the wrist (0.036)
    // and clearly wider than the elbow end (0.058). v11's "belly" was a
    // 0.004 ripple on a monotonic taper, invisible at idle distance, and
    // its fold ring at -0.06 was buried inside the sleeve (profile 0.059
    // vs ring 0.049). Ring radii below are recomputed against THIS
    // profile (local radius + 0.0015), thicker (0.005) and in FOLD_DARK
    // so they read at idle distance even under flat SwiftShader light.
    const profile = [
      [0.058, -0.31],
      [0.066, -0.26],
      [0.074, -0.19],
      [0.072, -0.13],
      [0.062, -0.07],
      [0.048, -0.02],
      [0.040, 0.03],
      [0.036, 0.06],
    ];
    const pts = profile.map(([r, y]) => new THREE.Vector2(r * slim, y));
    // v13: ASYMMETRIC muscle. The lathe is displaced toward the
    // camera/palm side (+z) with a Gaussian bump peaking at the belly
    // (v14: 0.024 at y -0.19, sigma 0.10 — v13's 0.016 / 0.085 was too
    // subtle at idle distance), so the forearm swells on ONE side like
    // a real flexor mass instead of a symmetric tube bulge. Weight falls
    // off as cos^2 around the circumference (front only, zero at the
    // back) and the bump scales with `slim`. Normals recomputed so the
    // flat light still shades the new shape.
    const MUSCLE_PEAK = 0.024, MUSCLE_Y = -0.19, MUSCLE_SIG = 0.10;
    const muscleBump = (y) => MUSCLE_PEAK * slim * Math.exp(-((y - MUSCLE_Y) ** 2) / (2 * MUSCLE_SIG * MUSCLE_SIG));
    // Pushes a geometry's vertices radially outward (xz-plane) by the
    // muscle bump at their height (arm-space y = local y + yOff), front
    // side only. Used for the sleeve itself (yOff 0) and for the band +
    // rings — their base radii already sit proud, so the same
    // displacement keeps them hugging the new surface instead of
    // burying under the muscle (v12's buried-ring lesson).
    const hugMuscle = (geo, yOff = 0) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const r = Math.hypot(x, z);
        if (r < 1e-6) continue;
        const w = Math.max(0, z / r);
        const d = muscleBump(y + yOff) * w * w;
        p.setXYZ(i, x + (x / r) * d, y, z + (z / r) * d);
      }
      return geo;
    };
    const sleeveGeo = new THREE.LatheGeometry(pts, 16);
    hugMuscle(sleeveGeo);
    sleeveGeo.computeVertexNormals();
    g.add(new THREE.Mesh(sleeveGeo, sleeve));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.04, 16), cuffYellow);
    cuff.position.set(0, 0.045, 0);
    g.add(cuff);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0465, 0.003, 8, 16), strap);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.026, 0);
    g.add(band);
    // Crease shadow band under the belly: a dark stripe wrapping the
    // waist just below the muscle (y -0.039..-0.057), radii proud of the
    // local profile by ~0.002 so it never z-fights or buries. This is
    // what makes the bulge read in flat lighting — a shadow line under
    // the muscle, not just a silhouette change.
    // v13: the band hugs the displaced muscle (hugMuscle, yOff -0.048)
    // so its front stays proud of the muscle instead of sinking under
    // it; open-ended — the caps are invisible inside the sleeve.
    const shadowGeo = new THREE.CylinderGeometry(0.0555 * slim, 0.0605 * slim, 0.018, 16, 1, true);
    hugMuscle(shadowGeo, -0.048);
    const shadow = new THREE.Mesh(shadowGeo, foldDark);
    shadow.position.set(0, -0.048, 0);
    g.add(shadow);
    // Fabric creases: thick dark rings, radius = local profile radius +
    // 0.0015 so each sits proud of the sleeve surface. v11's rings were
    // thin (0.0032), low-contrast (#6b5a3e on #9a8a68), and one was
    // buried inside the sleeve entirely. v13: each ring is displaced by
    // the same muscle bump (rotation baked into the geometry first) so
    // it keeps wrapping the muscle instead of diving under it.
    const folds = [[-0.10, 0.0685], [-0.155, 0.0743], [-0.24, 0.0698]];
    for (const [y, r] of folds) {
      const ringGeo = new THREE.TorusGeometry(r * slim, 0.005, 8, 18);
      ringGeo.rotateX(Math.PI / 2);
      hugMuscle(ringGeo, y);
      const ring = new THREE.Mesh(ringGeo, foldDark);
      ring.position.set(0, y, 0);
      g.add(ring);
    }
    // v14: trailing-edge crease shadow. The bump weight w = max(0, z/r)
    // fades to zero at the forearm's sides (cylinder theta: x = r sin,
    // z = r cos, so theta 0 is the front and +/-PI/2 are the sides). A
    // dark partial shell hugging each side at the belly height draws the
    // line where the muscle mass ends, so the bulge reads as a 3D mass
    // in flat light instead of a smooth swell. Radii are the local
    // profile at the shell's top/bottom (0.0725 @ y -0.145, 0.0689 @
    // y -0.235) + 0.003 proud, height 0.09 around the belly peak; the
    // shell is hugMuscle-displaced like the rings, so its front edge
    // never sinks under the displaced sleeve. Open-ended, no caps.
    for (const side of [Math.PI / 2, (3 * Math.PI) / 2]) {
      const creaseGeo = new THREE.CylinderGeometry(0.0755 * slim, 0.0719 * slim, 0.09, 6, 4, true, side - 0.30, 0.6);
      hugMuscle(creaseGeo, -0.19);
      const crease = new THREE.Mesh(creaseGeo, foldDark);
      crease.position.set(0, -0.19, 0);
      g.add(crease);
    }
    // Wrist v11: flattened pad (not a ball), tucked under the cuff — its
    // top peeks ~0.006 above the cuff as a skin sliver, the bulk hidden
    // inside the cuff cylinder. Glove -> skin sliver -> cuff -> sleeve
    // reads without an obvious sphere joint.
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin);
    wrist.scale.set(1.05, 0.42, 0.85);
    wrist.position.set(0, 0.058, 0.004);
    g.add(wrist);
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
    // Per-finger anatomy v8: thinner fingers, wider gaps (0.033 apart, so
    // each finger reads as its own shape), longer tips that reach the
    // front-left corner of the grip. Index finger rests along the frame
    // (CAMPANILE pose) instead of curling with the rest.
    // v9: bigger fingers (+~30% radius), wider gaps (0.036 apart), longer
    // wrap — each finger must read as its own light band at idle distance.
    [
      { y: -0.032, lens: [0.035, 0.031, 0.024], r: 0.01, angles: [-0.35, -0.15], dz: 0.002 },
      { y: -0.068, lens: [0.039, 0.034, 0.026], r: 0.011, angles: [-0.68, -0.38], dz: 0 },
      { y: -0.104, lens: [0.037, 0.033, 0.025], r: 0.0105, angles: [-0.74, -0.42], dz: -0.002 },
      { y: -0.14, lens: [0.031, 0.027, 0.022], r: 0.0085, angles: [-0.8, -0.45], dz: -0.004 },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'z', curlAxis: 'y', angles: cfg.angles });
      f.position.set(-0.045, cfg.y, 0.105 + cfg.dz);
      f.rotation.y = Math.PI + 0.35;
      model.add(f);
    });
    const thumbR = buildFinger({ lens: [0.038, 0.03], r: 0.0105, axis: 'z', curlAxis: 'x', angles: [-0.3, -0.25] });
    thumbR.position.set(-0.048, -0.055, 0.118);
    thumbR.rotation.y = Math.PI + 0.15;
    model.add(thumbR);
    // v10: wrist lands on the palm heel (visible, camera-side) and the
    // sleeve drifts down-RIGHT, clear of the magazine path, running off
    // the bottom edge — Top 3 attachment (long limb, no mid-frame stub).
    // v11: slimmed (0.88x) + angled wider (z 0.22 -> 0.30) so the P9
    // forearms frame the weapon instead of crowding the bottom-right.
    // v13: angled a touch wider still (z 0.30 -> 0.38) so the P9
    // forearms crowd the bottom-right even less. Rotation is about the
    // wrist point, so the hand->wrist->forearm connection never moves.
    const armR = buildForearm({ slim: 0.88 });
    armR.position.set(0.016, -0.195, 0.164);
    armR.rotation.x = -0.35;
    armR.rotation.z = 0.38;
    model.add(armR);
    // Left support hand v8 (occlusion fix): moved DOWN-LEFT-FORWARD of the
    // grip (palm under the slide, clear of the right hand's silhouette) so
    // it reads as a second hand instead of hiding behind the grip. Fingers
    // rise along the FRONT-LEFT of the grip, fanned wide with real gaps;
    // forearm enters from the bottom-left corner, far from the right arm.
    const palmL = buildPalm(0.106, 0.096);
    palmL.position.set(-0.078, -0.172, -0.03);
    palmL.rotation.x = 0.55;
    palmL.rotation.z = 0.28;
    model.add(palmL);
    // v9: bigger + wider-fanned (0.035 apart) so the support hand's fingers
    // read individually at idle distance, like v9's right hand.
    [
      { lx: -0.055, lens: [0.035, 0.031, 0.024], r: 0.01, angles: [0.12, 0.2] },
      { lx: -0.02, lens: [0.039, 0.034, 0.025], r: 0.011, angles: [0.18, 0.28] },
      { lx: 0.015, lens: [0.037, 0.033, 0.024], r: 0.0105, angles: [0.2, 0.3] },
      { lx: 0.05, lens: [0.031, 0.027, 0.021], r: 0.0085, angles: [0.25, 0.35] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'x', angles: cfg.angles });
      f.position.set(cfg.lx - 0.05, -0.15, -0.02);
      f.rotation.z = cfg.lx < 0 ? 0.3 : -0.3;
      model.add(f);
    });
    const thumbL = buildFinger({ lens: [0.032, 0.025], r: 0.01, axis: 'z', curlAxis: 'x', angles: [-0.15, -0.15] });
    thumbL.position.set(-0.098, -0.135, -0.02);
    thumbL.rotation.y = Math.PI + 0.2;
    model.add(thumbL);
    // v10: forearm no longer near-horizontal (v9's -0.95 z-rotation ran it
    // sideways as a floating stick) — diagonal from the bottom-left corner,
    // wrist on the palm heel, sleeve off the bottom edge.
    // v11: slimmed (0.88x) + angled wider (z -0.45 -> -0.55), same reason.
    // v13: angled a touch wider still (z -0.55 -> -0.62), same reason.
    const armL = buildForearm({ slim: 0.88 });
    armL.position.set(-0.111, -0.28, 0.022);
    armL.rotation.x = -0.35;
    armL.rotation.z = -0.62;
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
    // v9: grip hand raised (palm -0.055 -> -0.038) so the knuckles clear
    // the bottom frame edge — v8's hand sat on the edge.
    const palmR = buildPalm(0.108, 0.118);
    palmR.position.set(0, -0.038, 0.29);
    palmR.rotation.x = -0.05;
    model.add(palmR);
    // v9: bigger fingers, raised with the palm (y -0.075 -> -0.058).
    [
      { z: 0.232, lens: [0.037, 0.033, 0.035], r: 0.01, angles: [-0.58, -0.5] },
      { z: 0.272, lens: [0.041, 0.036, 0.037], r: 0.011, angles: [-0.7, -0.6] },
      { z: 0.312, lens: [0.039, 0.035, 0.036], r: 0.0105, angles: [-0.76, -0.65] },
      { z: 0.352, lens: [0.032, 0.028, 0.029], r: 0.0085, angles: [-0.82, -0.7] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'z', angles: cfg.angles });
      f.position.set(-0.055, -0.058, cfg.z);
      f.rotation.z = -0.12;
      model.add(f);
    });
    const thumbR = buildFinger({ lens: [0.034, 0.027], r: 0.0105, axis: 'z', curlAxis: 'x', angles: [-0.2, -0.2] });
    thumbR.position.set(0.042, -0.045, 0.33);
    thumbR.rotation.y = Math.PI + 0.1;
    model.add(thumbR);
    // v10: wrist on the palm heel (camera-side), sleeve down-RIGHT off the
    // bottom edge; less tilt-back (-0.35) so the sleeve stays in front of
    // the palm plane instead of hiding behind it.
    // v11: stood more upright (z 0.15 -> 0.06) + nudged toward center so
    // more of the grip-hand forearm stays in frame instead of only the
    // cuff + wrist at the corner.
    // v13: stood a touch more upright still (z 0.06 -> 0.02) so a little
    // more of the grip-hand forearm stays in frame.
    const armR = buildForearm();
    armR.position.set(0.0, -0.158, 0.347);
    armR.rotation.x = -0.35;
    armR.rotation.z = 0.02;
    model.add(armR);
    // Left hand on the foregrip: palm under the barrel, fingers wrapping up
    // around the barrel and over the top, thumb over the top from the far side.
    // v9.1: foregrip hand BIGGER (0.125 -> 0.14 wide) and hung LOWER
    // (y -0.042 -> -0.052) so the palm clears the handguard's underside
    // and reads in open space instead of tucking into its shadow.
    const palmL = buildPalm(0.14, 0.145);
    palmL.position.set(-0.025, -0.052, -0.35);
    palmL.rotation.x = 0.15;
    model.add(palmL);
    // v9.2: fingers LONGER (+0.008/segment) so the tips curl over the
    // handguard's top edge and silhouette against the background — the
    // v9.1 fingers read end-on (small nubs) from behind; the over-the-top
    // tips are what makes the hand read as a hand at idle distance.
    [
      { z: -0.276, lens: [0.046, 0.042, 0.044], r: 0.012, angles: [0.62, 0.78] },
      { z: -0.314, lens: [0.05, 0.045, 0.046], r: 0.013, angles: [0.72, 0.88] },
      { z: -0.352, lens: [0.048, 0.044, 0.045], r: 0.0125, angles: [0.77, 0.92] },
      { z: -0.39, lens: [0.042, 0.038, 0.039], r: 0.0105, angles: [0.86, 0.95] },
    ].forEach((cfg) => {
      const f = buildFinger({ lens: cfg.lens, r: cfg.r, axis: 'y', curlAxis: 'z', angles: cfg.angles });
      f.position.set(-0.055, -0.052, cfg.z);
      f.rotation.z = -0.1;
      model.add(f);
    });
    const thumbL = buildFinger({ lens: [0.03, 0.024], r: 0.01, axis: 'y', curlAxis: 'z', angles: [0.6, 0.5] });
    thumbL.position.set(0.03, -0.005, -0.33);
    thumbL.rotation.z = 0.15;
    model.add(thumbL);
    // v10: wrist on the foregrip palm's heel, sleeve diagonal down-left
    // off the bottom edge — the foregrip arm now reads as one limb with
    // the hand, not a separate floating piece.
    const armL = buildForearm();
    armL.position.set(-0.051, -0.188, -0.294);
    armL.rotation.x = -0.35;
    armL.rotation.z = -0.35;
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
