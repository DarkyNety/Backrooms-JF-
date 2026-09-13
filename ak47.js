/* ============================================================================
   ak47-game.js
   AK-47 model + FPS game logic, animations, effects, and audio.

   Requires three.js (ESM).

   Usage:
     import { AK47Game } from './ak47-game.js';
     const game = new AK47Game(document.getElementById('app'));
     game.start();
     // ...
     game.dispose();
   ============================================================================ */

import * as THREE from 'three';

/* ============================================================================
   TEXTURE HELPERS
   ============================================================================ */

function makeNoiseTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 195 + (Math.random() - 0.5) * 95;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

const NOISE = makeNoiseTexture();

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,240,190,0.95)');
  g.addColorStop(0.42, 'rgba(255,160,50,0.55)');
  g.addColorStop(0.72, 'rgba(255,90,10,0.18)');
  g.addColorStop(1.00, 'rgba(255,60,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeHoleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0.00, 'rgba(0,0,0,1)');
  g.addColorStop(0.28, 'rgba(8,8,9,0.96)');
  g.addColorStop(0.42, 'rgba(60,60,62,0.55)');
  g.addColorStop(0.62, 'rgba(130,130,132,0.22)');
  g.addColorStop(1.00, 'rgba(160,160,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 30, 0, 7); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ============================================================================
   MATERIALS
   ============================================================================ */

const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x4d545c, metalness: 1.0, roughness: 0.50, roughnessMap: NOISE }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x2e3238, metalness: 1.0, roughness: 0.56, roughnessMap: NOISE }),
  phosphate: new THREE.MeshStandardMaterial({ color: 0x353a41, metalness: 0.92, roughness: 0.70, roughnessMap: NOISE }),
  blackMetal: new THREE.MeshStandardMaterial({ color: 0x1b1e22, metalness: 0.88, roughness: 0.62, roughnessMap: NOISE }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.06, roughness: 0.66 }),
  polymerSoft: new THREE.MeshStandardMaterial({ color: 0x0f1113, metalness: 0.03, roughness: 0.86 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x9ecbff, metalness: 0.0, roughness: 0.06,
    transparent: true, opacity: 0.30, side: THREE.DoubleSide,
    clearcoat: 1.0, clearcoatRoughness: 0.05
  }),
  dot: new THREE.MeshStandardMaterial({
    color: 0xff2a10, emissive: 0xff2a10, emissiveIntensity: 6,
    toneMapped: false, side: THREE.DoubleSide
  })
};

const SCOPE_GLASS = new THREE.MeshPhysicalMaterial({
  color: 0x9ecbff, metalness: 0.0, roughness: 0.02,
  transparent: true, opacity: 0.24, side: THREE.DoubleSide,
  clearcoat: 1.0, clearcoatRoughness: 0.01, envMapIntensity: 2.2,
  depthWrite: false, toneMapped: true
});

const SCOPE_GLASS_REAR = new THREE.MeshPhysicalMaterial({
  color: 0x8fc0e8, metalness: 0.0, roughness: 0.02,
  transparent: true, opacity: 0.20, side: THREE.DoubleSide,
  clearcoat: 1.0, clearcoatRoughness: 0.01, envMapIntensity: 2.2,
  depthWrite: false, toneMapped: true
});

/* ============================================================================
   GEOMETRY HELPERS
   ============================================================================ */

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}
function cyl(r1, r2, h, seg, mat, x = 0, y = 0, z = 0, axis = 'x') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
function extrudeSide(points, depth, mat, bevel = 0.14) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 24, steps: 1
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
function makeRail(length, width = 2.2) {
  const g = new THREE.Group();
  const baseH = 0.45, toothH = 0.42;
  g.add(mesh(new THREE.BoxGeometry(length, baseH, width), MAT.steelDark, 0, baseH / 2, 0));
  const pitch = 1.05, toothW = 0.62;
  const n = Math.max(1, Math.floor((length - 0.5) / pitch));
  const start = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    g.add(mesh(new THREE.BoxGeometry(toothW, toothH, width), MAT.steelDark,
      start + i * pitch, baseH + toothH / 2, 0));
  }
  return g;
}
function makeMagazine() {
  const R = 27, W = 4.0, D = 3.0;
  const cx = 27, cy = -4.0;
  const a0 = Math.PI, a1 = Math.PI * 1.205;
  const shape = new THREE.Shape();
  shape.absarc(cx, cy, R + W / 2, a0, a1, false);
  shape.absarc(cx, cy, R - W / 2, a1, a0, true);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: D, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12,
    bevelSegments: 2, curveSegments: 56, steps: 1
  });
  geo.translate(0, 0, -D / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, MAT.polymer);
}

/* ============================================================================
   MODEL: createAK47()
   ============================================================================ */

export function createAK47() {
  const rifle = new THREE.Group();
  rifle.name = 'AK47';

  /* --- ствольная коробка --- */
  rifle.add(box(24, 5.3, 3.4, MAT.phosphate, -4, -1.75, 0));
  rifle.add(box(22, 1.0, 3.2, MAT.phosphate, -5, 1.4, 0));

  const topRail = makeRail(20, 2.2);
  topRail.position.set(-5, 1.9, 0);
  rifle.add(topRail);

  for (const rx of [-13.5, -9.5, 3.5, 6.5]) {
    rifle.add(cyl(0.22, 0.22, 3.6, 10, MAT.steelDark, rx, -2.2, 0, 'z'));
  }

  /* --- ствол --- */
  rifle.add(cyl(0.85, 0.85, 38, 28, MAT.steel, 23, 0, 0, 'x'));
  rifle.add(cyl(1.05, 1.05, 3.8, 24, MAT.steelDark, 43.6, 0, 0, 'x'));
  rifle.add(cyl(1.15, 1.15, 0.55, 24, MAT.steelDark, 42.0, 0, 0, 'x'));
  rifle.add(cyl(1.15, 1.15, 0.55, 24, MAT.steelDark, 45.3, 0, 0, 'x'));
  for (let i = 0; i < 3; i++) {
    rifle.add(box(0.5, 2.4, 2.4, MAT.blackMetal, 42.9 + i * 0.9, 0, 0));
  }

  /* --- мушка --- */
  rifle.add(box(3.4, 2.6, 2.6, MAT.steelDark, 39, 1.25, 0));
  rifle.add(cyl(0.22, 0.22, 1.9, 12, MAT.steel, 39, 3.1, 0, 'y'));
  rifle.add(box(1.3, 2.3, 0.45, MAT.steelDark, 39, 3.1, 1.05));
  rifle.add(box(1.3, 2.3, 0.45, MAT.steelDark, 39, 3.1, -1.05));

  /* --- газовая камора / трубка --- */
  rifle.add(box(2.5, 2.5, 2.6, MAT.steelDark, 7.2, 1.7, 0));
  rifle.add(cyl(0.62, 0.62, 23, 18, MAT.steel, 19.5, 2.65, 0, 'x'));
  rifle.add(box(2.8, 4.5, 2.6, MAT.steelDark, 30, 1.25, 0));

  /* --- цевьё --- */
  rifle.add(box(20.5, 3.0, 3.6, MAT.polymer, 18.25, -1.9, 0));
  rifle.add(box(20.5, 1.7, 3.3, MAT.polymer, 18.25, 1.15, 0));

  const railBottom = makeRail(12, 2.4);
  railBottom.rotation.x = Math.PI;
  railBottom.position.set(19.5, -3.4, 0);
  rifle.add(railBottom);

  const railLeft = makeRail(10, 2.0);
  railLeft.rotation.x = Math.PI / 2;
  railLeft.position.set(19.5, -1.9, 1.8);
  rifle.add(railLeft);

  const railRight = makeRail(10, 2.0);
  railRight.rotation.x = -Math.PI / 2;
  railRight.position.set(19.5, -1.9, -1.8);
  rifle.add(railRight);

  rifle.add(cyl(1.35, 1.35, 1.3, 20, MAT.steelDark, 10.6, 0, 0, 'x'));
  rifle.add(cyl(1.30, 1.30, 1.1, 20, MAT.steelDark, 28.6, 0, 0, 'x'));
  rifle.add(cyl(0.16, 0.16, 27, 8, MAT.steel, 25, -1.55, 1.4, 'x'));

  /* --- ружейный прицел (целик) --- */
  rifle.add(box(3.6, 1.7, 3.2, MAT.steelDark, 4, 1.6, 0));
  const leaf = box(3.4, 0.32, 2.6, MAT.steel, 4, 2.55, 0);
  leaf.rotation.z = -0.16;
  rifle.add(leaf);

  /* --- затворная рама / рукоятка --- */
  const bolt = new THREE.Group();
  bolt.name = 'bolt';
  bolt.add(cyl(0.32, 0.32, 1.9, 12, MAT.steel, 1.5, 0.35, 2.55, 'z'));
  bolt.add(cyl(0.52, 0.52, 0.7, 14, MAT.steelDark, 1.5, 0.35, 3.4, 'z'));
  rifle.add(bolt);

  /* --- предохранитель --- */
  const safety = box(6.2, 1.05, 0.38, MAT.steelDark, -4.2, -1.5, 1.85);
  safety.rotation.z = -0.10;
  rifle.add(safety);
  rifle.add(cyl(0.5, 0.5, 0.5, 12, MAT.steelDark, -7.2, -1.9, 1.9, 'z'));

  /* --- спусковая скоба и спуск --- */
  rifle.add(box(6.2, 0.5, 2.2, MAT.steelDark, -6.2, -6.4, 0));
  rifle.add(box(0.5, 2.3, 2.2, MAT.steelDark, -3.4, -5.4, 0));
  rifle.add(box(0.5, 2.3, 2.2, MAT.steelDark, -9.1, -5.4, 0));

  const trigger = box(0.55, 2.1, 0.85, MAT.steel, -5.9, -5.3, 0);
  trigger.rotation.z = 0.18;
  rifle.add(trigger);

  rifle.add(box(1.0, 0.7, 1.4, MAT.steelDark, -2.4, -4.9, 0));

  /* --- магазин --- */
  const magazine = makeMagazine();
  magazine.name = 'magazine';
  rifle.add(magazine);

  (function addMagPlate() {
    const a1 = Math.PI * 1.205;
    const R = 27, cx = 27, cy = -4.0;
    const px = cx + R * Math.cos(a1) + 0.6 * 0.22;
    const py = cy + R * Math.sin(a1) - 0.6 * 0.22;
    const plate = box(4.8, 0.55, 3.35, MAT.polymerSoft, px, py, 0);
    plate.rotation.z = a1;
    rifle.add(plate);
  })();

  for (let i = 0; i < 4; i++) {
    const ang = Math.PI + (i + 0.6) * 0.145;
    const px = 27 + 27 * Math.cos(ang);
    const py = -4.0 + 27 * Math.sin(ang);
    const rib = box(0.28, 3.0, 0.35, MAT.polymerSoft, px, py, 1.62);
    rib.rotation.z = ang + Math.PI / 2;
    rifle.add(rib);
  }

  /* --- пистолетная рукоятка --- */
  const grip = extrudeSide([
    [-10.0, -3.5], [-14.2, -3.5], [-17.6, -12.4], [-14.6, -13.5]
  ], 3.0, MAT.polymerSoft);
  rifle.add(grip);

  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const gx = -11.2 - t * 3.0;
    const gy = -5.6 - t * 6.4;
    const rg = box(0.35, 1.9, 3.15, MAT.polymer, gx, gy, 0);
    rg.rotation.z = -0.36;
    rifle.add(rg);
  }

  /* --- приклад --- */
  const stock = extrudeSide([
    [-15.0, 0.9], [-22.0, 0.5], [-28.0, 0.5], [-36.0, -0.5],
    [-38.5, -2.5], [-38.0, -7.0], [-15.0, -4.4]
  ], 3.2, MAT.polymer);
  rifle.add(stock);

  const buttpad = box(1.2, 5.5, 3.5, MAT.polymerSoft, -38.6, -4.75, 0);
  buttpad.rotation.z = -0.15;
  rifle.add(buttpad);

  const cheekRest = box(8.0, 1.2, 3.0, MAT.polymerSoft, -30.0, 0.8, 0);
  cheekRest.rotation.z = -0.08;
  rifle.add(cheekRest);

  rifle.add(cyl(1.1, 1.1, 3.6, 16, MAT.steelDark, -15.0, -1.75, 0, 'z'));
  rifle.add(box(1.5, 1.5, 3.8, MAT.steelDark, -15.0, -1.75, 0));
  for (let i = -1; i <= 1; i++) {
    rifle.add(box(0.3, 1.2, 3.8, MAT.steel, -15.0, -1.75 + i * 0.6, 0));
  }

  const sling1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 20), MAT.steelDark);
  sling1.position.set(-35.0, 0.0, 0);
  sling1.rotation.y = Math.PI / 2;
  rifle.add(sling1);

  const sling2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.15, 8, 20), MAT.steelDark);
  sling2.position.set(30, -0.3, 1.5);
  sling2.rotation.x = Math.PI / 2;
  rifle.add(sling2);

  /* --- коллиматорный прицел --- */
  (function addOptic() {
    const optic = new THREE.Group();
    optic.name = 'optic';

    optic.add(box(3.6, 0.5, 2.8, MAT.blackMetal, 0, -2.55, 0));
    optic.add(box(0.8, 2.0, 1.6, MAT.blackMetal, 1.25, -1.55, 0));
    optic.add(box(0.8, 2.0, 1.6, MAT.blackMetal, -1.25, -1.55, 0));
    optic.add(cyl(0.13, 0.13, 0.18, 8, MAT.steel, 1.25, -1.55, 0.85, 'z'));
    optic.add(cyl(0.13, 0.13, 0.18, 8, MAT.steel, -1.25, -1.55, 0.85, 'z'));

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x14171a, metalness: 0.92, roughness: 0.40, roughnessMap: NOISE
    });
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.35, 3.6, 36, 1, true),
      bodyMat
    );
    tube.rotation.z = Math.PI / 2;
    optic.add(tube);

    const frontBezel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.55, 0.55, 36, 1, true), MAT.blackMetal);
    frontBezel.rotation.z = Math.PI / 2;
    frontBezel.position.set(1.75, 0, 0);
    optic.add(frontBezel);

    const frontRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.09, 10, 36), MAT.steelDark);
    frontRing.rotation.y = Math.PI / 2;
    frontRing.position.set(2.02, 0, 0);
    optic.add(frontRing);

    const rearBezel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.55, 0.55, 36, 1, true), MAT.blackMetal);
    rearBezel.rotation.z = Math.PI / 2;
    rearBezel.position.set(-1.75, 0, 0);
    optic.add(rearBezel);

    const rearRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.09, 10, 36), MAT.steelDark);
    rearRing.rotation.y = Math.PI / 2;
    rearRing.position.set(-2.02, 0, 0);
    optic.add(rearRing);

    const frontGlass = new THREE.Mesh(new THREE.CircleGeometry(1.44, 40), SCOPE_GLASS);
    frontGlass.rotation.y = Math.PI / 2;
    frontGlass.position.set(1.94, 0, 0);
    frontGlass.renderOrder = 5;
    optic.add(frontGlass);

    const rearGlass = new THREE.Mesh(new THREE.CircleGeometry(1.44, 40), SCOPE_GLASS_REAR);
    rearGlass.rotation.y = -Math.PI / 2;
    rearGlass.position.set(-1.94, 0, 0);
    rearGlass.renderOrder = 5;
    optic.add(rearGlass);

    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), MAT.dot);
    dot.rotation.y = -Math.PI / 2;
    dot.position.set(0.9, 0, 0);
    dot.renderOrder = 1;
    optic.add(dot);

    const dotGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff2a10, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    dotGlow.rotation.y = -Math.PI / 2;
    dotGlow.position.set(0.86, 0, 0);
    dotGlow.renderOrder = 2;
    optic.add(dotGlow);

    optic.add(cyl(0.42, 0.42, 0.65, 18, MAT.blackMetal, 0, 1.6, 0, 'y'));
    optic.add(cyl(0.5, 0.5, 0.09, 18, MAT.steelDark, 0, 1.98, 0, 'y'));
    optic.add(cyl(0.38, 0.38, 0.55, 18, MAT.blackMetal, 0, 0, 1.55, 'z'));
    optic.add(cyl(0.46, 0.46, 0.08, 18, MAT.steelDark, 0, 0, 1.88, 'z'));
    optic.add(cyl(0.28, 0.28, 0.28, 12, MAT.steel, -1.35, 1.5, 0, 'y'));

    optic.position.set(-1.4, 5.25, 0);
    rifle.add(optic);
  })();

  rifle.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  return rifle;
}

/* ============================================================================
   CONSTANTS
   ============================================================================ */

const INSPECT_END = 3.10;
const INSPECT_DURATION = 5.60;

const INSPECT_KEYS = [
  { t: 0.00, p: [0, 0, 0],               r: [0, 0, 0] },
  { t: 0.45, p: [0.03, 0.05, 0.06],      r: [-0.10, 0.85, -0.75] },
  { t: 1.15, p: [0.01, 0.07, 0.10],      r: [0.05, -0.75, 0.70] },
  { t: 1.85, p: [-0.02, 0.06, 0.04],     r: [0.55, 0.15, 0.10] },
  { t: 2.45, p: [0.00, 0.03, 0.03],      r: [0.10, 0.05, 0.25] },
  { t: 3.10, p: [0, 0, 0],               r: [0, 0, 0] }
];

const MUZZLE_LOCAL = new THREE.Vector3(0, 0, -0.475);
const BASE_POS = new THREE.Vector3(0.115, -0.115, -0.42);
const BASE_ROT = new THREE.Vector3(0, 0, 0);
const ADS_POS = new THREE.Vector3(0, -0.0525, -0.32);
const ADS_ROT = new THREE.Vector3(0, 0, 0);

const FLASH_TEX = makeFlashTexture();
const HOLE_TEX = makeHoleTexture();
const DOT_TEX = makeDotTexture();

/* ============================================================================
   AUDIO (WebAudio synth)
   ============================================================================ */

class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { console.warn('Audio unavailable', e); }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  click(vol = 0.3, freq = 1400, dur = 0.055) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.20);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.30);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.32);

    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.65, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.18);

    const src2 = this.ctx.createBufferSource(); src2.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 900; bp.Q.value = 0.7;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t + 0.05);
    g2.gain.linearRampToValueAtTime(0.10, t + 0.09);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.85);
    src2.connect(bp); bp.connect(g2); g2.connect(this.master);
    src2.start(t); src2.stop(t + 0.9);
  }

  impact() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(1800 + Math.random() * 900, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.13);
  }

  ping() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1560, 2340, 3120].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.13 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.55 + i * 0.1);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.6);
    });
  }

  dryFire() { this.click(0.22, 2600, 0.04); }
}

/* ============================================================================
   GAME
   ============================================================================ */

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ak47-game{position:relative;width:100%;height:100%;overflow:hidden;background:#05070a;
      font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#cfd8e3;}
    .ak47-game canvas{display:block;}
    .ak47-ui{position:absolute;inset:0;pointer-events:none;z-index:10;}
    .ak47-cross{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:44px;height:44px;transition:opacity .1s;}
    .ak47-cross i{position:absolute;background:#d8ffe0;box-shadow:0 0 3px rgba(0,0,0,.9);
      opacity:.85;transition:opacity .1s;}
    .ak47-cross .v{width:2px;height:9px;left:21px;}
    .ak47-cross .h{height:2px;width:9px;top:21px;}
    .ak47-cross .t{top:0;} .ak47-cross .b{bottom:0;}
    .ak47-cross .l{left:0;} .ak47-cross .r{right:0;}
    .ak47-cross .dot{width:2px;height:2px;left:21px;top:21px;border-radius:50%;background:#fff;}
    .ak47-cross.hit i{background:#ff5a3c;}
    .ak47-cross.hit .dot{background:#ff5a3c;}
    .ak47-ammo{position:absolute;right:42px;bottom:34px;font-variant-numeric:tabular-nums;
      font-size:44px;font-weight:200;letter-spacing:2px;text-shadow:0 2px 10px #000;}
    .ak47-ammo small{font-size:20px;opacity:.55;}
    .ak47-wpn{position:absolute;right:44px;bottom:96px;font-size:13px;letter-spacing:4px;
      opacity:.45;text-transform:uppercase;}
    .ak47-hint{position:absolute;left:24px;bottom:24px;font-size:13px;line-height:1.7;opacity:.5;}
    .ak47-hint b{color:#9fd0ff;font-weight:600;}
    .ak47-msg{position:absolute;left:50%;top:62%;transform:translateX(-50%);
      font-size:15px;letter-spacing:3px;color:#ff8a5c;opacity:0;transition:opacity .2s;}
    .ak47-overlay{position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:18px;cursor:pointer;
      background:radial-gradient(circle at 50% 45%,#101820 0%,#04060a 80%);}
    .ak47-overlay h1{font-size:34px;font-weight:200;letter-spacing:12px;color:#e6eef8;}
    .ak47-overlay p{font-size:14px;letter-spacing:3px;opacity:.5;}
    .ak47-overlay .keys{margin-top:14px;font-size:13px;line-height:2;opacity:.65;text-align:center;}
    .ak47-overlay .keys b{color:#ffb27a;}
    .ak47-overlay.hidden{display:none;}
  `;
  document.head.appendChild(style);
}

export class AK47Game {
  /**
   * @param {HTMLElement} container  Element that will host the canvas + UI.
   * @param {Object} [options]
   * @param {number} [options.sensitivity=0.0022]
   */
  constructor(container = document.body, options = {}) {
    _injectStyles();

    this.container = container;
    this.container.classList.add('ak47-game');

    this.sensitivity = options.sensitivity ?? 0.0022;

    /* --- weapon state --- */
    this.W = {
      state: 'holstered',
      time: 0,
      ammo: 30,
      magSize: 30,
      reserve: 90,
      fireInterval: 0.098,
      reloadDur: 2.75,
      inspectDur: INSPECT_DURATION,
      drawDur: 0.62
    };

    /* --- player --- */
    this.player = {
      pos: new THREE.Vector3(0, 1.7, 10),
      vel: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      height: 1.7, radius: 0.42,
      onGround: true,
      walkSpeed: 4.4, sprintSpeed: 7.6
    };

    /* --- input --- */
    this.keys = Object.create(null);
    this.pointerLocked = false;

    /* --- effects pools --- */
    this.hittables = [];
    this.colliders = [];
    this.plates = [];
    this.decals = [];
    this.decalCursor = 0;
    this.casings = [];
    this.tracers = [];
    this.droppedMags = [];

    /* --- animation state --- */
    this.triggerHeld = false;
    this.fireCooldown = 0;
    this.shotIndex = 0;
    this.flashTimer = 0;
    this.adsHeld = false;
    this.adsAmount = 0;

    this.swayTarget = new THREE.Vector2(0, 0);
    this.swayCurrent = new THREE.Vector2(0, 0);

    this.kickPos = new THREE.Vector3();
    this.kickRot = new THREE.Vector3();
    this.kickPosVel = new THREE.Vector3();
    this.kickRotVel = new THREE.Vector3();

    this.camShake = new THREE.Vector3();
    this.camShakeVel = new THREE.Vector3();

    this.bobTime = 0;
    this.bobAmount = 0;
    this.breatheTime = 0;

    this.reloadFlags = {
      magDropped: false, magInserted: false,
      ammoGiven: false, boltRacked: false, magSpawned: false
    };

    this.inspectOffsetPos = new THREE.Vector3();
    this.inspectOffsetRot = new THREE.Vector3();
    this.inspectOffsetActive = false;

    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = 300;
    this._camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._raf = 0;
    this._running = false;
    this._hitTimeout = 0;

    this.audio = new SynthAudio();

    /* --- build everything --- */
    this._setupRenderer();
    this._setupScenes();
    this._setupEnvironment();
    this._setupWorld();
    this._setupWeapon();
    this._setupEffects();
    this._setupUI();
    this._setupInput();

    this._clock = new THREE.Clock();
  }

  /* ────────────────────────────────────────────────────────────── */
  /*  SETUP                                                         */
  /* ────────────────────────────────────────────────────────────── */

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth || window.innerWidth,
                          this.container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.container.appendChild(this.renderer.domElement);
  }

  _setupScenes() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0d131b, 45, 190);
    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.05, 500);

    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(55, w / h, 0.01, 30);
  }

  _setupEnvironment() {
    // environment (PMREM from a procedural sky canvas)
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#4d7ec4');
    g.addColorStop(0.42, '#c9dcef');
    g.addColorStop(0.50, '#8d949c');
    g.addColorStop(0.58, '#4a4d50');
    g.addColorStop(1.00, '#191b1d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);

    const sg = ctx.createRadialGradient(150, 60, 0, 150, 60, 60);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.25, 'rgba(255,245,220,0.7)');
    sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(150, 60, 60, 0, 7); ctx.fill();

    ctx.fillStyle = 'rgba(20,24,30,0.75)';
    for (let i = 0; i < 14; i++) {
      const w = 20 + Math.random() * 60;
      const h = 20 + Math.random() * 45;
      ctx.fillRect(Math.random() * 512, 128 - h, w, h);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();

    this.scene.environment = this.envMap;
    this.weaponScene.environment = this.envMap;

    // sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(0x2f5b96) },
          mid: { value: new THREE.Color(0x9db8d4) },
          bot: { value: new THREE.Color(0x1a1f26) }
        },
        vertexShader: `varying vec3 vP;
          void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vP = wp.xyz;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
          void main(){ float h = normalize(vP).y;
            vec3 col = h > 0.0 ? mix(mid, top, pow(h,0.65)) : mix(mid, bot, pow(-h,0.5));
            gl_FragColor = vec4(col,1.0);}`,
        side: THREE.BackSide, depthWrite: false, fog: false
      })
    );
    this.scene.add(sky);

    // lights (world)
    this.scene.add(new THREE.HemisphereLight(0xa8c8ff, 0x2b2a26, 0.85));
    const sun = new THREE.DirectionalLight(0xffe9c4, 2.4);
    sun.position.set(38, 54, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55;
    sun.shadow.camera.bottom = -55;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // lights (weapon viewmodel)
    this.weaponScene.add(new THREE.HemisphereLight(0xbfd6ff, 0x2a2c30, 1.5));
    const wKey = new THREE.DirectionalLight(0xfff2dd, 2.6);
    wKey.position.set(1.2, 2.0, 1.6); this.weaponScene.add(wKey);
    const wFill = new THREE.DirectionalLight(0x8fb4ff, 1.2);
    wFill.position.set(-1.6, 0.4, 0.8); this.weaponScene.add(wFill);
    const wRim = new THREE.DirectionalLight(0xffd9a8, 1.0);
    wRim.position.set(0.4, -0.8, -1.4); this.weaponScene.add(wRim);
  }

  _setupWorld() {
    const hittables = this.hittables;
    const colliders = this.colliders;

    // ground
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.96, metalness: 0.02 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    hittables.push(ground);

    const grid = new THREE.GridHelper(240, 120, 0x5a6672, 0x323840);
    grid.position.y = 0.012;
    grid.material.opacity = 0.30;
    grid.material.transparent = true;
    this.scene.add(grid);

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.88, metalness: 0.03 });
    const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.8, metalness: 0.25 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.55, metalness: 0.9 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.35, metalness: 1.0 });

    const addCrate = (x, y, z, w, h, d, mat = crateMat, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y + h / 2, z);
      m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      hittables.push(m);
      if (Math.abs(ry) < 0.01) {
        colliders.push({
          min: new THREE.Vector3(x - w / 2, y, z - d / 2),
          max: new THREE.Vector3(x + w / 2, y + h, z + d / 2)
        });
      }
    };

    addCrate(-7, 0, -8, 1.6, 1.2, 1.6);
    addCrate(-7, 1.2, -8, 1.4, 1.0, 1.4);
    addCrate(-9.5, 0, -9, 1.6, 1.2, 1.6);
    addCrate(7.5, 0, -10, 2.0, 1.4, 1.6, crateMat2);
    addCrate(9.8, 0, -10.6, 1.6, 1.2, 1.6, crateMat2);
    addCrate(-13, 0, -22, 2.2, 1.6, 2.2);
    addCrate(12, 0, -26, 2.4, 1.6, 2.4, crateMat2);
    addCrate(0, 0, -34, 3.0, 1.8, 3.0, crateMat2);

    const addWall = (x, z, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x596068, roughness: 0.95, metalness: 0.02 }));
      m.position.set(x, h / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m); hittables.push(m);
      colliders.push({
        min: new THREE.Vector3(x - w / 2, 0, z - d / 2),
        max: new THREE.Vector3(x + w / 2, h, z + d / 2)
      });
    };
    addWall(-18, -14, 0.4, 2.4, 10);
    addWall(18, -16, 0.4, 2.4, 10);

    const addPlate = (x, z, r = 0.42) => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), darkMetal);
      post.position.y = 0.575; post.castShadow = true;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.07, 26), plateMat);
      plate.rotation.x = Math.PI / 2;
      plate.position.y = 1.35;
      plate.castShadow = true;
      g.add(post, plate);
      g.position.set(x, 0, z);
      this.scene.add(g);
      hittables.push(plate);
      this.plates.push(plate);
    };
    addPlate(-4, -18);
    addPlate(0, -18, 0.5);
    addPlate(4, -18);
    addPlate(-8, -30, 0.55);
    addPlate(8, -30, 0.55);
    addPlate(0, -46, 0.7);

    // distant hills
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(22 + Math.random() * 16, 16 + Math.random() * 18, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 1.0, flatShading: true })
      );
      m.position.set(Math.cos(a) * 150, -2, Math.sin(a) * 150 - 40);
      m.rotation.y = Math.random() * 3;
      this.scene.add(m);
    }
  }

  _setupWeapon() {
    this.weaponRoot = new THREE.Group();
    this.weaponRoot.rotation.order = 'YXZ';
    this.weaponScene.add(this.weaponRoot);

    const ak = createAK47();
    ak.rotation.y = Math.PI / 2;
    ak.scale.setScalar(0.01);
    this.weaponRoot.add(ak);
    this.ak = ak;

    this.magMesh = ak.getObjectByName('magazine');
    this.boltMesh = ak.getObjectByName('bolt');

    /* --- muzzle flash group --- */
    this.flashGroup = new THREE.Group();
    this.flashGroup.position.copy(MUZZLE_LOCAL);
    this.flashGroup.visible = false;
    this.weaponRoot.add(this.flashGroup);

    const flashMat = new THREE.MeshBasicMaterial({
      map: FLASH_TEX, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false
    });
    const quadA = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), flashMat);
    const quadB = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.20), flashMat);
    quadB.rotation.z = Math.PI / 4;
    this.flashGroup.add(quadA, quadB);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.30, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb050, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false
      })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -0.16;
    this.flashGroup.add(cone);

    this.flashLight = new THREE.PointLight(0xffb060, 0, 3.5, 2);
    this.flashLight.position.copy(MUZZLE_LOCAL);
    this.weaponRoot.add(this.flashLight);

    this.worldFlashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
    this.scene.add(this.worldFlashLight);

    this.weaponRoot.visible = false;
  }

  _setupEffects() {
    // ---- particles ----
    this.MAX_PARTICLES = 900;
    this.pPositions = new Float32Array(this.MAX_PARTICLES * 3);
    this.pColors = new Float32Array(this.MAX_PARTICLES * 3);
    this.pData = [];
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.pData.push({ life: 0, maxLife: 1, vel: new THREE.Vector3(), base: new THREE.Color(), grav: 1 });
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.pColors, 3));
    this.pGeo = pGeo;
    const pointsMat = new THREE.PointsMaterial({
      size: 0.075, map: DOT_TEX, vertexColors: true,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true
    });
    this.points = new THREE.Points(pGeo, pointsMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.pCursor = 0;

    // ---- decals ----
    this.decalMat = new THREE.MeshBasicMaterial({
      map: HOLE_TEX, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, toneMapped: false
    });
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(decalGeo, this.decalMat);
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      this.decals.push(m);
    }

    // ---- casings geometry ----
    this.casingGeo = new THREE.CylinderGeometry(0.0048, 0.0052, 0.025, 8);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1.0, roughness: 0.32 });

    // ---- tracers geometry ----
    const tracerGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true);
    tracerGeo.translate(0, 0.5, 0);
    tracerGeo.rotateX(Math.PI / 2);
    this.tracerGeo = tracerGeo;
  }

  _setupUI() {
    this.uiRoot = document.createElement('div');
    this.uiRoot.className = 'ak47-ui';

    // crosshair
    const cross = document.createElement('div');
    cross.className = 'ak47-cross';
    ['v t', 'v b', 'h l', 'h r', 'dot'].forEach(cls => {
      const i = document.createElement('i');
      i.className = cls;
      cross.appendChild(i);
    });
    this.uiRoot.appendChild(cross);
    this.crossEl = cross;

    // weapon name
    const wpn = document.createElement('div');
    wpn.className = 'ak47-wpn';
    wpn.textContent = 'AK-47';
    this.uiRoot.appendChild(wpn);

    // ammo
    const ammo = document.createElement('div');
    ammo.className = 'ak47-ammo';
    const mag = document.createElement('span');
    mag.textContent = '30';
    const small = document.createElement('small');
    small.textContent = ' / ';
    const res = document.createElement('span');
    res.textContent = '90';
    small.appendChild(res);
    ammo.appendChild(mag);
    ammo.appendChild(small);
    this.uiRoot.appendChild(ammo);
    this.magEl = mag;
    this.resEl = res;

    // state message
    const msg = document.createElement('div');
    msg.className = 'ak47-msg';
    this.uiRoot.appendChild(msg);
    this.stateMsgEl = msg;

    // hint
    const hint = document.createElement('div');
    hint.className = 'ak47-hint';
    hint.innerHTML =
      '<b>1</b> — достать &nbsp;·&nbsp; <b>ЛКМ</b> — огонь &nbsp;·&nbsp; <b>ПКМ</b> — прицел ' +
      '&nbsp;·&nbsp; <b>R</b> — перезарядка &nbsp;·&nbsp; <b>G</b> — осмотр<br>' +
      '<b>WASD</b> — движение &nbsp;·&nbsp; <b>Shift</b> — бег &nbsp;·&nbsp; <b>Space</b> — прыжок ' +
      '&nbsp;·&nbsp; <b>Esc</b> — пауза';
    this.uiRoot.appendChild(hint);

    this.container.appendChild(this.uiRoot);

    // start overlay
    const overlay = document.createElement('div');
    overlay.className = 'ak47-overlay';
    overlay.innerHTML =
      '<h1>AK-47</h1>' +
      '<p>ТЕСТОВЫЙ ПОЛИГОН</p>' +
      '<div class="keys">' +
        '<b>1</b> достать · <b>ЛКМ</b> огонь · <b>ПКМ</b> прицел · <b>R</b> перезарядка · <b>G</b> осмотр<br>' +
        '<b>WASD</b> движение · <b>Shift</b> бег · <b>Space</b> прыжок' +
      '</div>' +
      '<p style="margin-top:20px;font-size:12px;opacity:.35;">НАЖМИТЕ, ЧТОБЫ НАЧАТЬ</p>';
    this.container.appendChild(overlay);
    this.overlayEl = overlay;
  }

  _setupInput() {
    this._onOverlayClick = () => {
      this.audio.init();
      this.renderer.domElement.requestPointerLock();
    };
    this.overlayEl.addEventListener('click', this._onOverlayClick);

    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.overlayEl.classList.toggle('hidden', this.pointerLocked);
      if (this.pointerLocked) this.audio.resume();
    };
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      const sens = this.sensitivity * (1 - this.adsAmount * 0.55);
      this.player.yaw -= e.movementX * sens;
      this.player.pitch -= e.movementY * sens;
      this.player.pitch = Math.max(-1.45, Math.min(1.45, this.player.pitch));

      const swayScale = 1 - this.adsAmount * 0.9;
      this.swayTarget.x += -e.movementX * 0.00035 * swayScale;
      this.swayTarget.y += e.movementY * 0.00035 * swayScale;
      this.swayTarget.x = Math.max(-0.035, Math.min(0.035, this.swayTarget.x));
      this.swayTarget.y = Math.max(-0.035, Math.min(0.035, this.swayTarget.y));
    };
    document.addEventListener('mousemove', this._onMouseMove);

    this._onKeyDown = (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (this.keys[e.code]) return;
      this.keys[e.code] = true;
      if (e.code === 'Digit1') this.draw();
      if (e.code === 'KeyR') this.reload();
      if (e.code === 'KeyG') this.inspect();
    };
    document.addEventListener('keydown', this._onKeyDown);

    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    document.addEventListener('keyup', this._onKeyUp);

    this._onMouseDown = (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) {
        if (this.W.state === 'inspecting') this._cancelInspect();
        this.triggerHeld = true;
        this._tryFire();
      }
      if (e.button === 2) {
        if (this.W.state === 'inspecting') this._cancelInspect();
        this.adsHeld = true;
      }
    };
    document.addEventListener('mousedown', this._onMouseDown);

    this._onMouseUp = (e) => {
      if (e.button === 0) {
        this.triggerHeld = false;
        this.fireCooldown = 0;
        this.shotIndex = 0;
      }
      if (e.button === 2) this.adsHeld = false;
    };
    document.addEventListener('mouseup', this._onMouseUp);

    this._onContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', this._onContextMenu);

    this._onResize = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.weaponCamera.aspect = w / h; this.weaponCamera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);
  }

  /* ────────────────────────────────────────────────────────────── */
  /*  PUBLIC API                                                    */
  /* ────────────────────────────────────────────────────────────── */

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    this._loop();
    setTimeout(() => this._setStateMessage('НАЖМИТЕ «1», ЧТОБЫ ДОСТАТЬ ОРУЖИЕ', 3.2), 600);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('resize', this._onResize);
    if (this.overlayEl && this._onOverlayClick) {
      this.overlayEl.removeEventListener('click', this._onOverlayClick);
    }
    if (this.renderer) {
      this.renderer.dispose();
      const c = this.renderer.domElement;
      if (c.parentNode) c.parentNode.removeChild(c);
    }
    if (this.uiRoot && this.uiRoot.parentNode) this.uiRoot.parentNode.removeChild(this.uiRoot);
    if (this.overlayEl && this.overlayEl.parentNode) this.overlayEl.parentNode.removeChild(this.overlayEl);
    this.container.classList.remove('ak47-game');
  }

  /* --- actions --- */
  draw()    { this._drawWeapon(); }
  reload()  { this._tryReload(); }
  inspect() { this._tryInspect(); }

  /** Update mouse sensitivity at runtime. */
  setSensitivity(v) { this.sensitivity = v; }

  /* ────────────────────────────────────────────────────────────── */
  /*  MAIN LOOP                                                     */
  /* ────────────────────────────────────────────────────────────── */

  _loop = () => {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this._clock.getDelta(), 0.05);

    this._updatePlayer(dt);
    this._updateWeapon(dt);
    this._updateFiring(dt);
    this._updateFlash(dt);
    this._updateParticles(dt);
    this._updateCasings(dt);
    this._updateTracers(dt);
    this._updateDroppedMags(dt);
    this._updateCamera();

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
  };

  /* ────────────────────────────────────────────────────────────── */
  /*  WEAPON ACTIONS                                                */
  /* ────────────────────────────────────────────────────────────── */

  _drawWeapon() {
    if (this.W.state === 'inspecting') { this._cancelInspect(); return; }
    if (this.W.state === 'drawing' || this.W.state === 'reloading') return;
    if (this.W.state === 'idle') return;
    this.W.state = 'drawing';
    this.W.time = 0;
    this.weaponRoot.visible = true;
    this.audio.click(0.25, 900, 0.07);
    setTimeout(() => this.audio.click(0.2, 1600, 0.05), 220);
    setTimeout(() => this.audio.click(0.18, 2200, 0.04), 380);
  }

  _cancelInspect() {
    if (this.W.state === 'inspecting') {
      this.W.state = 'idle';
      this.W.time = 0;
    }
  }

  _tryReload() {
    if (this.W.state === 'inspecting') this._cancelInspect();
    if (this.W.state !== 'idle') return;
    if (this.W.ammo >= this.W.magSize) return;
    if (this.W.reserve <= 0) { this._setStateMessage('НЕТ ПАТРОНОВ'); return; }

    this.W.state = 'reloading';
    this.W.time = 0;
    this.reloadFlags.magDropped = false;
    this.reloadFlags.magInserted = false;
    this.reloadFlags.ammoGiven = false;
    this.reloadFlags.boltRacked = false;
    this.reloadFlags.magSpawned = false;
    this.magMesh.visible = true;
    this.magMesh.position.set(0, 0, 0);
    this.boltMesh.position.set(0, 0, 0);
    this.audio.click(0.3, 1100, 0.06);
  }

  _tryInspect() {
    if (this.W.state === 'inspecting') { this._cancelInspect(); return; }
    if (this.W.state !== 'idle') return;
    this.W.state = 'inspecting';
    this.W.time = 0;
    this.audio.click(0.15, 700, 0.09);
  }

  /* ────────────────────────────────────────────────────────────── */
  /*  FIRING                                                        */
  /* ────────────────────────────────────────────────────────────── */

  _tryFire() {
    if (this.W.state !== 'idle') return;
    if (this.fireCooldown > 0) return;

    if (this.W.ammo <= 0) {
      this.audio.dryFire();
      this.fireCooldown = 0.28;
      this.kickRot.x += 0.02;
      return;
    }

    this.W.ammo--;
    this._updateHUD();
    this.fireCooldown = this.W.fireInterval;

    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));

    const moveFactor = Math.min(this.player.vel.length() / this.player.walkSpeed, 1.4);
    const spreadBase = 0.0012 + moveFactor * 0.010 + Math.min(this.shotIndex, 20) * 0.00055;
    const spread = spreadBase * (1 - this.adsAmount * 0.75);

    const upV = new THREE.Vector3(0, 1, 0);
    const rightV = new THREE.Vector3().crossVectors(dir, upV).normalize();
    const trueUp = new THREE.Vector3().crossVectors(rightV, dir).normalize();
    dir.addScaledVector(rightV, (Math.random() - 0.5) * spread * 2)
       .addScaledVector(trueUp, (Math.random() - 0.5) * spread * 2)
       .normalize();

    this._raycaster.set(origin, dir);
    const hits = this._raycaster.intersectObjects(this.hittables, false);

    let endPoint, hitInfo = null;
    if (hits.length > 0) {
      hitInfo = hits[0];
      endPoint = hitInfo.point.clone();
    } else {
      endPoint = origin.clone().addScaledVector(dir, 200);
    }

    // world-space muzzle
    this.weaponRoot.updateWorldMatrix(true, true);
    this.camera.updateMatrixWorld(true);
    const muzzleCamSpace = MUZZLE_LOCAL.clone().applyMatrix4(this.weaponRoot.matrixWorld);
    const muzzleWorld = muzzleCamSpace.clone().applyMatrix4(this.camera.matrixWorld);

    this._spawnTracer(muzzleWorld, endPoint);

    // muzzle flash
    this.flashGroup.visible = true;
    this.flashGroup.rotation.z = Math.random() * Math.PI * 2;
    this.flashGroup.scale.setScalar(0.85 + Math.random() * 0.5);
    this.flashLight.intensity = 7 + Math.random() * 4;
    this.worldFlashLight.position.copy(muzzleWorld);
    this.worldFlashLight.intensity = 45;
    this.flashTimer = 0.045;

    // recoil
    const i = Math.min(this.shotIndex, 30);
    const recoilScale = 1 - this.adsAmount * 0.35;
    const vert = (0.0125 + 0.0082 * Math.min(i / 10, 1)) * recoilScale;
    const horiz = (Math.sin(i * 0.62) * 0.0052 * Math.min(i / 5, 1)
                 + Math.sin(i * 0.27) * 0.0038 * Math.min(i / 8, 1)
                 + (Math.random() - 0.5) * 0.0026) * recoilScale;

    this.player.pitch = Math.max(-1.45, Math.min(1.45, this.player.pitch + vert));
    this.player.yaw += horiz;

    this.kickPos.z += (0.030 + Math.random() * 0.012) * recoilScale;
    this.kickPos.y += 0.004;
    this.kickRot.x += (0.085 + Math.random() * 0.03) * recoilScale;
    this.kickRot.z += (Math.random() - 0.5) * 0.05;
    this.kickRot.y += (Math.random() - 0.5) * 0.03;

    this.camShakeVel.x += (Math.random() - 0.5) * 3.5 * recoilScale;
    this.camShakeVel.y += (Math.random() - 0.5) * 3.5 * recoilScale;
    this.camShakeVel.z += (Math.random() - 0.5) * 2.0 * recoilScale;

    // eject casing
    const ejectCam = new THREE.Vector3(0.03, 0.01, -0.18).applyMatrix4(this.weaponRoot.matrixWorld);
    const ejectWorld = ejectCam.clone().applyMatrix4(this.camera.matrixWorld);
    const ejectDir = new THREE.Vector3(1, 0, 0)
      .applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));
    this._spawnCasing(ejectWorld, ejectDir.multiplyScalar(2.2));

    // impact
    if (hitInfo) {
      const n = hitInfo.face
        ? hitInfo.face.normal.clone().transformDirection(hitInfo.object.matrixWorld)
        : dir.clone().negate();

      this._addDecal(hitInfo.point, n, 0.05);

      const sparkCount = 7 + Math.floor(Math.random() * 6);
      for (let s = 0; s < sparkCount; s++) {
        const v = n.clone().multiplyScalar(1.6 + Math.random() * 2.4)
          .add(new THREE.Vector3(
            (Math.random() - 0.5) * 2.6,
            Math.random() * 2.0,
            (Math.random() - 0.5) * 2.6
          ));
        this._spawnParticle(hitInfo.point, v, 0xffc060, 0.28 + Math.random() * 0.32, 1);
      }
      for (let s = 0; s < 5; s++) {
        const v = n.clone().multiplyScalar(0.6)
          .add(new THREE.Vector3(
            (Math.random() - 0.5) * 1.4, Math.random() * 1.0, (Math.random() - 0.5) * 1.4));
        this._spawnParticle(hitInfo.point, v, 0x8a8f96, 0.45 + Math.random() * 0.4, 0.25);
      }

      if (this.plates.includes(hitInfo.object)) this.audio.ping();
      else this.audio.impact();

      this.crossEl.classList.add('hit');
      clearTimeout(this._hitTimeout);
      this._hitTimeout = setTimeout(() => this.crossEl.classList.remove('hit'), 90);
    }

    this.audio.shot();
    this.shotIndex++;
  }

  /* ────────────────────────────────────────────────────────────── */
  /*  EFFECT SPAWNERS                                               */
  /* ────────────────────────────────────────────────────────────── */

  _spawnParticle(pos, vel, color, life, grav = 1) {
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % this.MAX_PARTICLES;
    const d = this.pData[i];
    d.life = life; d.maxLife = life;
    d.vel.copy(vel);
    d.base.set(color);
    d.grav = grav;
    this.pPositions[i * 3] = pos.x;
    this.pPositions[i * 3 + 1] = pos.y;
    this.pPositions[i * 3 + 2] = pos.z;
    this.pColors[i * 3] = d.base.r;
    this.pColors[i * 3 + 1] = d.base.g;
    this.pColors[i * 3 + 2] = d.base.b;
  }

  _addDecal(point, normal, scale = 0.055) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.visible = true;
    d.position.copy(point).addScaledVector(normal, 0.006);
    d.lookAt(point.clone().add(normal));
    d.rotateZ(Math.random() * Math.PI * 2);
    d.scale.setScalar(scale * (0.75 + Math.random() * 0.6));
  }

  _spawnCasing(worldPos, baseVel) {
    const m = new THREE.Mesh(this.casingGeo, this.casingMat);
    m.position.copy(worldPos);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.castShadow = true;
    this.scene.add(m);
    this.casings.push({
      obj: m,
      vel: baseVel.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        1.4 + Math.random() * 0.9,
        (Math.random() - 0.5) * 0.6
      )),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22
      ),
      life: 4.5, bounced: 0
    });
    if (this.casings.length > 45) {
      const old = this.casings.shift();
      this.scene.remove(old.obj);
    }
  }

  _spawnTracer(from, to) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd48a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const m = new THREE.Mesh(this.tracerGeo, mat);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, from.distanceTo(to));
    this.scene.add(m);
    this.tracers.push({ obj: m, mat, life: 0.055 });
  }

  _spawnDroppedMag(sourceMesh) {
    sourceMesh.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    sourceMesh.matrixWorld.decompose(p, q, s);

    const clone = new THREE.Mesh(sourceMesh.geometry, sourceMesh.material);
    clone.position.copy(p);
    clone.quaternion.copy(q);
    clone.scale.copy(s);
    clone.castShadow = true;
    this.scene.add(clone);

    this.droppedMags.push({
      obj: clone,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.35, -0.5, (Math.random() - 0.5) * 0.35),
      spin: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5),
      life: 6
    });
  }

  /* ────────────────────────────────────────────────────────────── */
  /*  UPDATERS                                                      */
  /* ────────────────────────────────────────────────────────────── */

  _updatePlayer(dt) {
    const forward = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));

    let moveX = 0, moveZ = 0;
    if (this.keys['KeyW']) moveZ += 1;
    if (this.keys['KeyS']) moveZ -= 1;
    if (this.keys['KeyD']) moveX += 1;
    if (this.keys['KeyA']) moveX -= 1;

    const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight'])
                      && moveZ > 0 && this.adsAmount < 0.5;
    const baseSpeed = sprinting ? this.player.sprintSpeed : this.player.walkSpeed;
    const speed = baseSpeed * (1 - this.adsAmount * 0.45);

    const wish = new THREE.Vector3();
    wish.addScaledVector(forward, moveZ);
    wish.addScaledVector(right, moveX);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    const accel = this.player.onGround ? 14 : 3;
    this.player.vel.x += (wish.x - this.player.vel.x) * Math.min(accel * dt, 1);
    this.player.vel.z += (wish.z - this.player.vel.z) * Math.min(accel * dt, 1);

    if (this.keys['Space'] && this.player.onGround) {
      this.player.vel.y = 5.0;
      this.player.onGround = false;
    }

    this.player.vel.y -= 20 * dt;

    this.player.pos.x += this.player.vel.x * dt;
    this.player.pos.z += this.player.vel.z * dt;
    this.player.pos.y += this.player.vel.y * dt;

    // XZ collision
    const r = this.player.radius;
    for (const b of this.colliders) {
      const feet = this.player.pos.y - this.player.height;
      if (feet > b.max.y - 0.05) continue;
      if (this.player.pos.y < b.min.y) continue;

      const cx = Math.max(b.min.x, Math.min(this.player.pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(this.player.pos.z, b.max.z));
      const dx = this.player.pos.x - cx;
      const dz = this.player.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2);
        if (d > 0.0001) {
          const push = (r - d) / d;
          this.player.pos.x += dx * push;
          this.player.pos.z += dz * push;
        } else {
          this.player.pos.x += (this.player.pos.x < (b.min.x + b.max.x) / 2 ? -0.1 : 0.1);
        }
      }
    }

    // ground / floor
    const gh = this._groundHeightAt(this.player.pos.x, this.player.pos.z);
    const floorY = gh + this.player.height;
    if (this.player.pos.y <= floorY) {
      this.player.pos.y = floorY;
      if (this.player.vel.y < 0) this.player.vel.y = 0;
      this.player.onGround = true;
    } else {
      this.player.onGround = false;
    }

    const lim = 110;
    this.player.pos.x = Math.max(-lim, Math.min(lim, this.player.pos.x));
    this.player.pos.z = Math.max(-lim, Math.min(lim, this.player.pos.z));

    // bob / breathe timers
    const planarSpeed = Math.hypot(this.player.vel.x, this.player.vel.z);
    const targetBob = this.player.onGround ? Math.min(planarSpeed / this.player.walkSpeed, 1.4) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(dt * 8, 1);
    this.bobTime += dt * (6.0 + planarSpeed * 1.1);
    this.breatheTime += dt;
  }

  _updateWeapon(dt) {
    const pos = BASE_POS.clone();
    const rot = BASE_ROT.clone();

    /* 1. drawing */
    if (this.W.state === 'drawing') {
      this.W.time += dt;
      const t = Math.min(this.W.time / this.W.drawDur, 1);
      const e = this._easeOutCubic(t);
      const k = 1 - e;
      pos.y -= k * 0.55;
      pos.z += k * 0.12;
      rot.x -= k * 1.25;
      rot.z += k * 0.45;
      rot.y += k * 0.25;
      if (t >= 1) { this.W.state = 'idle'; this.W.time = 0; }
    }

    /* 2. inspecting */
    if (this.W.state === 'inspecting') {
      this.W.time += dt;
      const t = this.W.time * (INSPECT_END / this.W.inspectDur);

      let k0 = INSPECT_KEYS[0], k1 = INSPECT_KEYS[INSPECT_KEYS.length - 1];
      for (let i = 0; i < INSPECT_KEYS.length - 1; i++) {
        if (t >= INSPECT_KEYS[i].t && t <= INSPECT_KEYS[i + 1].t) {
          k0 = INSPECT_KEYS[i]; k1 = INSPECT_KEYS[i + 1];
          break;
        }
      }
      const localT = this._smoothstep(k0.t, k1.t, t);
      this.inspectOffsetPos.set(
        k0.p[0] + (k1.p[0] - k0.p[0]) * localT,
        k0.p[1] + (k1.p[1] - k0.p[1]) * localT,
        k0.p[2] + (k1.p[2] - k0.p[2]) * localT
      );
      this.inspectOffsetRot.set(
        k0.r[0] + (k1.r[0] - k0.r[0]) * localT,
        k0.r[1] + (k1.r[1] - k0.r[1]) * localT,
        k0.r[2] + (k1.r[2] - k0.r[2]) * localT
      );
      this.inspectOffsetActive = true;

      if (this.W.time >= this.W.inspectDur) { this.W.state = 'idle'; this.W.time = 0; }
    } else if (this.inspectOffsetActive) {
      const k = Math.min(dt * 16, 1);
      this.inspectOffsetPos.multiplyScalar(1 - k);
      this.inspectOffsetRot.multiplyScalar(1 - k);
      if (this.inspectOffsetPos.lengthSq() < 1e-6 && this.inspectOffsetRot.lengthSq() < 1e-6) {
        this.inspectOffsetPos.set(0, 0, 0);
        this.inspectOffsetRot.set(0, 0, 0);
        this.inspectOffsetActive = false;
      }
    }

    pos.add(this.inspectOffsetPos);
    rot.x += this.inspectOffsetRot.x;
    rot.y += this.inspectOffsetRot.y;
    rot.z += this.inspectOffsetRot.z;

    /* 3. reloading */
    if (this.W.state === 'reloading') {
      this.W.time += dt;
      const t = this.W.time;
      const tiltIn = this._smoothstep(0.00, 0.22, t);
      const tiltOut = 1 - this._smoothstep(2.38, 2.75, t);
      const tilt = tiltIn * tiltOut;

      pos.z += 0.05 * tilt;
      pos.y -= 0.07 * tilt;
      pos.x -= 0.015 * tilt;
      rot.z += 0.52 * tilt;
      rot.x += 0.16 * tilt;
      rot.y -= 0.20 * tilt;

      if (t > 0.35 && t < 2.2) {
        pos.y += Math.sin(t * 24) * 0.0035 * tilt;
        rot.z += Math.sin(t * 19) * 0.012 * tilt;
      }

      if (!this.reloadFlags.magDropped && t >= 0.30) {
        this.reloadFlags.magDropped = true;
        this._spawnDroppedMag(this.magMesh);
        this.magMesh.visible = false;
        this.audio.click(0.30, 800, 0.08);
        setTimeout(() => this.audio.click(0.18, 500, 0.12), 90);
      }

      if (t >= 1.30 && t < 1.75) {
        if (!this.reloadFlags.magSpawned) {
          this.reloadFlags.magSpawned = true;
          this.magMesh.visible = true;
          this.magMesh.position.set(0, -14, 0);
        }
        const u = this._smoothstep(1.30, 1.75, t);
        this.magMesh.position.y = -14 * (1 - u);
        if (!this.reloadFlags.magInserted && u > 0.98) {
          this.reloadFlags.magInserted = true;
          this.magMesh.position.set(0, 0, 0);
          this.audio.click(0.34, 1200, 0.07);
        }
      }

      if (!this.reloadFlags.ammoGiven && t >= 1.80) {
        this.reloadFlags.ammoGiven = true;
        const need = this.W.magSize - this.W.ammo;
        const give = Math.min(need, this.W.reserve);
        this.W.ammo += give;
        this.W.reserve -= give;
        this._updateHUD();
        this.audio.click(0.26, 1500, 0.05);
      }

      if (t >= 2.00 && t < 2.32) {
        const u = (t - 2.00) / 0.32;
        this.boltMesh.position.x = -1.7 * Math.sin(Math.PI * u);
        if (!this.reloadFlags.boltRacked && u > 0.5) {
          this.reloadFlags.boltRacked = true;
          this.audio.click(0.42, 1000, 0.07);
          this.audio.click(0.30, 2400, 0.05);
        }
      } else {
        this.boltMesh.position.x = 0;
      }

      if (t >= this.W.reloadDur) {
        this.W.state = 'idle';
        this.W.time = 0;
        this.magMesh.position.set(0, 0, 0);
        this.magMesh.visible = true;
      }
    }

    /* 4. sway */
    this.swayCurrent.x += (this.swayTarget.x - this.swayCurrent.x) * Math.min(dt * 9, 1);
    this.swayCurrent.y += (this.swayTarget.y - this.swayCurrent.y) * Math.min(dt * 9, 1);
    this.swayTarget.multiplyScalar(1 - Math.min(dt * 2.2, 1));
    pos.x += this.swayCurrent.x;
    pos.y += this.swayCurrent.y;
    rot.y += this.swayCurrent.x * 1.4;
    rot.x += this.swayCurrent.y * 1.4;

    /* 5. bob */
    const bobX = Math.sin(this.bobTime) * 0.0125 * this.bobAmount;
    const bobY = Math.abs(Math.cos(this.bobTime)) * 0.0105 * this.bobAmount - 0.004 * this.bobAmount;
    const bobR = Math.sin(this.bobTime) * 0.020 * this.bobAmount;
    pos.x += bobX;
    pos.y += bobY;
    rot.z += bobR;
    rot.x += Math.abs(Math.cos(this.bobTime)) * 0.008 * this.bobAmount;

    /* 6. breathe */
    const idleAmount = 1 - Math.min(this.bobAmount, 1);
    pos.y += Math.sin(this.breatheTime * 1.35) * 0.0022 * idleAmount;
    pos.x += Math.sin(this.breatheTime * 0.85) * 0.0016 * idleAmount;
    rot.z += Math.sin(this.breatheTime * 1.1) * 0.006 * idleAmount;

    /* 7. ADS */
    const wantAds = this.adsHeld && this.W.state === 'idle';
    const adsTarget = wantAds ? 1 : 0;
    this.adsAmount += (adsTarget - this.adsAmount) * Math.min(dt * 11, 1);
    if (this.adsAmount < 0.0005) this.adsAmount = 0;
    if (this.adsAmount > 0.9995) this.adsAmount = 1;

    if (this.adsAmount > 0) {
      pos.lerp(ADS_POS, this.adsAmount);
      rot.x = rot.x * (1 - this.adsAmount) + ADS_ROT.x * this.adsAmount;
      rot.y = rot.y * (1 - this.adsAmount) + ADS_ROT.y * this.adsAmount;
      rot.z = rot.z * (1 - this.adsAmount) + ADS_ROT.z * this.adsAmount;
    }

    /* 8. recoil spring */
    const stiff = 220, damp = 17;
    this.kickPosVel.addScaledVector(this.kickPos, -stiff * dt);
    this.kickPosVel.multiplyScalar(Math.max(0, 1 - damp * dt));
    this.kickPos.addScaledVector(this.kickPosVel, dt);

    this.kickRotVel.addScaledVector(this.kickRot, -stiff * dt);
    this.kickRotVel.multiplyScalar(Math.max(0, 1 - damp * dt));
    this.kickRot.addScaledVector(this.kickRotVel, dt);

    pos.add(this.kickPos);
    rot.x += this.kickRot.x;
    rot.y += this.kickRot.y;
    rot.z += this.kickRot.z;

    /* 9. camera shake decay */
    this.camShakeVel.multiplyScalar(Math.max(0, 1 - 9 * dt));
    this.camShake.addScaledVector(this.camShakeVel, dt * 0.02);
    this.camShake.multiplyScalar(Math.max(0, 1 - 8 * dt));

    /* apply */
    this.weaponRoot.position.copy(pos);
    this.weaponRoot.rotation.set(rot.x, rot.y, rot.z);

    /* HUD & FOV */
    this.crossEl.style.opacity = String(1 - this.adsAmount * 0.7);
    const targetMainFov = 75 - this.adsAmount * 24;
    const targetWeaponFov = 55 - this.adsAmount * 17;
    if (Math.abs(this.camera.fov - targetMainFov) > 0.02) {
      this.camera.fov += (targetMainFov - this.camera.fov) * Math.min(dt * 12, 1);
      this.camera.updateProjectionMatrix();
    }
    if (Math.abs(this.weaponCamera.fov - targetWeaponFov) > 0.02) {
      this.weaponCamera.fov += (targetWeaponFov - this.weaponCamera.fov) * Math.min(dt * 12, 1);
      this.weaponCamera.updateProjectionMatrix();
    }
  }

  _updateFiring(dt) {
    if (this.fireCooldown
