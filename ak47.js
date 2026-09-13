// ak47.js
// 3D-модель АК-47 (тактическая конфигурация) для Three.js
// Использование:
//   import { createAK47 } from './ak47.js';
//   const rifle = createAK47();
//   scene.add(rifle);

import * as THREE from 'three';

/* ============================================================
   ПРОЦЕДУРНАЯ ТЕКСТУРА ШУМА (для микрорельефа металла)
   ============================================================ */
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

/* ============================================================
   МАТЕРИАЛЫ
   ============================================================ */
const MAT = {
  steel: new THREE.MeshStandardMaterial({
    color: 0x4d545c, metalness: 1.0, roughness: 0.50, roughnessMap: NOISE
  }),
  steelDark: new THREE.MeshStandardMaterial({
    color: 0x2e3238, metalness: 1.0, roughness: 0.56, roughnessMap: NOISE
  }),
  phosphate: new THREE.MeshStandardMaterial({
    color: 0x353a41, metalness: 0.92, roughness: 0.70, roughnessMap: NOISE
  }),
  blackMetal: new THREE.MeshStandardMaterial({
    color: 0x1b1e22, metalness: 0.88, roughness: 0.62, roughnessMap: NOISE
  }),
  polymer: new THREE.MeshStandardMaterial({
    color: 0x17191b, metalness: 0.06, roughness: 0.66
  }),
  polymerSoft: new THREE.MeshStandardMaterial({
    color: 0x0f1113, metalness: 0.03, roughness: 0.86
  }),
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

/* ============================================================
   ХЕЛПЕРЫ
   ============================================================ */
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
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 24,
    steps: 1
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
    g.add(mesh(
      new THREE.BoxGeometry(toothW, toothH, width),
      MAT.steelDark,
      start + i * pitch, baseH + toothH / 2, 0
    ));
  }
  return g;
}

/* ============================================================
   МАГАЗИН (изогнутый, профиль по дуге)
   ============================================================ */
function makeMagazine() {
  const R = 27, W = 4.0, D = 3.0;
  const cx = 27, cy = -4.0;
  const a0 = Math.PI, a1 = Math.PI * 1.205;

  const shape = new THREE.Shape();
  shape.absarc(cx, cy, R + W / 2, a0, a1, false);
  shape.absarc(cx, cy, R - W / 2, a1, a0, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: D,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 56,
    steps: 1
  });
  geo.translate(0, 0, -D / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, MAT.polymer);
}

/* ============================================================
   ГЛАВНАЯ ФУНКЦИЯ — СБОРКА МОДЕЛИ АК-47
   ============================================================ */
export function createAK47() {
  const rifle = new THREE.Group();
  rifle.name = 'AK47';

  /* ---------- СТВОЛЬНАЯ КОРОБКА ---------- */
  rifle.add(box(24, 5.3, 3.4, MAT.phosphate, -4, -1.75, 0));
  rifle.add(box(22, 1.0, 3.2, MAT.phosphate, -5, 1.4, 0));

  const topRail = makeRail(20, 2.2);
  topRail.position.set(-5, 1.9, 0);
  rifle.add(topRail);

  for (const rx of [-13.5, -9.5, 3.5, 6.5]) {
    rifle.add(cyl(0.22, 0.22, 3.6, 10, MAT.steelDark, rx, -2.2, 0, 'z'));
  }

  /* ---------- СТВОЛ ---------- */
  rifle.add(cyl(0.85, 0.85, 38, 28, MAT.steel, 23, 0, 0, 'x'));

  // дульный тормоз
  rifle.add(cyl(1.05, 1.05, 3.8, 24, MAT.steelDark, 43.6, 0, 0, 'x'));
  rifle.add(cyl(1.15, 1.15, 0.55, 24, MAT.steelDark, 42.0, 0, 0, 'x'));
  rifle.add(cyl(1.15, 1.15, 0.55, 24, MAT.steelDark, 45.3, 0, 0, 'x'));
  for (let i = 0; i < 3; i++) {
    rifle.add(box(0.5, 2.4, 2.4, MAT.blackMetal, 42.9 + i * 0.9, 0, 0));
  }

  /* ---------- МУШКА ---------- */
  rifle.add(box(3.4, 2.6, 2.6, MAT.steelDark, 39, 1.25, 0));
  rifle.add(cyl(0.22, 0.22, 1.9, 12, MAT.steel, 39, 3.1, 0, 'y'));
  rifle.add(box(1.3, 2.3, 0.45, MAT.steelDark, 39, 3.1, 1.05));
  rifle.add(box(1.3, 2.3, 0.45, MAT.steelDark, 39, 3.1, -1.05));

  /* ---------- ГАЗОВАЯ КАМОРА / ТРУБКА ---------- */
  rifle.add(box(2.5, 2.5, 2.6, MAT.steelDark, 7.2, 1.7, 0));
  rifle.add(cyl(0.62, 0.62, 23, 18, MAT.steel, 19.5, 2.65, 0, 'x'));
  rifle.add(box(2.8, 4.5, 2.6, MAT.steelDark, 30, 1.25, 0));

  /* ---------- ЦЕВЬЁ (тактическое) ---------- */
  rifle.add(box(20.5, 3.0, 3.6, MAT.polymer, 18.25, -1.9, 0));   // нижнее
  rifle.add(box(20.5, 1.7, 3.3, MAT.polymer, 18.25, 1.15, 0));   // верхнее

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

  // кольца-обоймы цевья
  rifle.add(cyl(1.35, 1.35, 1.3, 20, MAT.steelDark, 10.6, 0, 0, 'x'));
  rifle.add(cyl(1.30, 1.30, 1.1, 20, MAT.steelDark, 28.6, 0, 0, 'x'));

  // шомпол
  rifle.add(cyl(0.16, 0.16, 27, 8, MAT.steel, 25, -1.55, 1.4, 'x'));

  /* ---------- ПРИЦЕЛ ---------- */
  rifle.add(box(3.6, 1.7, 3.2, MAT.steelDark, 4, 1.6, 0));
  const leaf = box(3.4, 0.32, 2.6, MAT.steel, 4, 2.55, 0);
  leaf.rotation.z = -0.16;
  rifle.add(leaf);

  /* ---------- ЗАТВОРНАЯ РАМА / РУКОЯТКА ---------- */
  rifle.add(cyl(0.32, 0.32, 1.9, 12, MAT.steel, 1.5, 0.35, 2.55, 'z'));
  rifle.add(cyl(0.52, 0.52, 0.7, 14, MAT.steelDark, 1.5, 0.35, 3.4, 'z'));

  /* ---------- ПРЕДОХРАНИТЕЛЬ ---------- */
  const safety = box(6.2, 1.05, 0.38, MAT.steelDark, -4.2, -1.5, 1.85);
  safety.rotation.z = -0.10;
  rifle.add(safety);
  rifle.add(cyl(0.5, 0.5, 0.5, 12, MAT.steelDark, -7.2, -1.9, 1.9, 'z'));

  /* ---------- СПУСКОВАЯ СКОБА И СПУСК ---------- */
  rifle.add(box(6.2, 0.5, 2.2, MAT.steelDark, -6.2, -6.4, 0));
  rifle.add(box(0.5, 2.3, 2.2, MAT.steelDark, -3.4, -5.4, 0));
  rifle.add(box(0.5, 2.3, 2.2, MAT.steelDark, -9.1, -5.4, 0));

  const trigger = box(0.55, 2.1, 0.85, MAT.steel, -5.9, -5.3, 0);
  trigger.rotation.z = 0.18;
  rifle.add(trigger);

  // кнопка сброса магазина
  rifle.add(box(1.0, 0.7, 1.4, MAT.steelDark, -2.4, -4.9, 0));

  /* ---------- МАГАЗИН ---------- */
  rifle.add(makeMagazine());

  // крышка магазина
  (function addMagPlate() {
    const a1 = Math.PI * 1.205;
    const R = 27, cx = 27, cy = -4.0;
    const px = cx + R * Math.cos(a1) + 0.6 * 0.22;
    const py = cy + R * Math.sin(a1) - 0.6 * 0.22;

    const plate = box(4.8, 0.55, 3.35, MAT.polymerSoft, px, py, 0);
    plate.rotation.z = a1;
    rifle.add(plate);
  })();

  // рёбра жёсткости на магазине
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI + (i + 0.6) * 0.145;
    const px = 27 + 27 * Math.cos(ang);
    const py = -4.0 + 27 * Math.sin(ang);
    const rib = box(0.28, 3.0, 0.35, MAT.polymerSoft, px, py, 1.62);
    rib.rotation.z = ang + Math.PI / 2;
    rifle.add(rib);
  }

  /* ---------- ПИСТОЛЕТНАЯ РУКОЯТКА ---------- */
  const grip = extrudeSide([
    [-10.0, -3.5],
    [-14.2, -3.5],
    [-17.6, -12.4],
    [-14.6, -13.5]
  ], 3.0, MAT.polymerSoft);
  rifle.add(grip);

  // текстура рукоятки
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const gx = -11.2 - t * 3.0;
    const gy = -5.6 - t * 6.4;
    const rg = box(0.35, 1.9, 3.15, MAT.polymer, gx, gy, 0);
    rg.rotation.z = -0.36;
    rifle.add(rg);
  }

  /* ---------- ПРИКЛАД (ТАКТИЧЕСКИЙ) ---------- */
  // основное тело приклада
  const stock = extrudeSide([
    [-15.0, 0.9],
    [-22.0, 0.5],
    [-28.0, 0.5],
    [-36.0, -0.5],
    [-38.5, -2.5],
    [-38.0, -7.0],
    [-15.0, -4.4]
  ], 3.2, MAT.polymer);
  rifle.add(stock);

  // затыльник
  const buttpad = box(1.2, 5.5, 3.5, MAT.polymerSoft, -38.6, -4.75, 0);
  buttpad.rotation.z = -0.15;
  rifle.add(buttpad);

  // щека (cheek rest)
  const cheekRest = box(8.0, 1.2, 3.0, MAT.polymerSoft, -30.0, 0.8, 0);
  cheekRest.rotation.z = -0.08;
  rifle.add(cheekRest);

  // механизм складывания (hinge)
  rifle.add(cyl(1.1, 1.1, 3.6, 16, MAT.steelDark, -15.0, -1.75, 0, 'z'));
  rifle.add(box(1.5, 1.5, 3.8, MAT.steelDark, -15.0, -1.75, 0));
  for (let i = -1; i <= 1; i++) {
    rifle.add(box(0.3, 1.2, 3.8, MAT.steel, -15.0, -1.75 + i * 0.6, 0));
  }

  // антабка на прикладе
  const sling1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 20), MAT.steelDark);
  sling1.position.set(-35.0, 0.0, 0);
  sling1.rotation.y = Math.PI / 2;
  rifle.add(sling1);

  // антабка на газовой каморе
  const sling2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.15, 8, 20), MAT.steelDark);
  sling2.position.set(30, -0.3, 1.5);
  sling2.rotation.x = Math.PI / 2;
  rifle.add(sling2);

  /* ---------- КОЛЛИМАТОРНЫЙ ПРИЦЕЛ ---------- */
  (function addOptic() {
    const optic = new THREE.Group();

    optic.add(box(3.2, 0.55, 2.8, MAT.blackMetal, 0, 0.27, 0));
    optic.add(box(0.7, 0.85, 1.7, MAT.blackMetal, 1.0, 1.0, 0));
    optic.add(box(0.7, 0.85, 1.7, MAT.blackMetal, -1.0, 1.0, 0));

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 3.8, 28, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x1b1e22, metalness: 0.85, roughness: 0.5,
        roughnessMap: NOISE, side: THREE.DoubleSide
      })
    );
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 2.45, 0);
    optic.add(tube);

    optic.add(cyl(1.3, 1.3, 0.5, 28, MAT.blackMetal, 1.85, 2.45, 0, 'x'));
    optic.add(cyl(1.3, 1.3, 0.5, 28, MAT.blackMetal, -1.85, 2.45, 0, 'x'));

    const lensFront = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), MAT.glass);
    lensFront.rotation.y = Math.PI / 2;
    lensFront.position.set(1.86, 2.45, 0);
    optic.add(lensFront);

    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), MAT.glass);
    lensRear.rotation.y = -Math.PI / 2;
    lensRear.position.set(-1.86, 2.45, 0);
    optic.add(lensRear);

    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), MAT.dot);
    dot.rotation.y = -Math.PI / 2;
    dot.position.set(1.4, 2.45, 0);
    optic.add(dot);

    optic.add(cyl(0.42, 0.42, 0.55, 14, MAT.blackMetal, 0, 3.65, 0, 'y'));
    optic.add(cyl(0.42, 0.42, 0.55, 14, MAT.blackMetal, 0, 2.45, 1.2, 'z'));

    optic.position.set(-2.0, 2.8, 0);
    rifle.add(optic);
  })();

  /* ---------- ТЕНИ ---------- */
  rifle.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  /* ---------- ПОЗИЦИОНИРОВАНИЕ И МАСШТАБ ---------- */
  // Модель создана в условных единицах (~80 единиц в длину), нужно уменьшить масштаб
  // для корректного отображения в мире игры (1 единица ≈ 1 метр).
  // Реальная длина АК-47 ≈ 0.88м, высота ≈ 0.35м.
  const scaleFactor = 0.015; // Коэффициент масштабирования
  rifle.scale.setScalar(scaleFactor);
  
  // Центрируем модель относительно начала координат (0,0,0) для корректного расчёта хитбокса.
  const bbox = new THREE.Box3().setFromObject(rifle);
  const center = bbox.getCenter(new THREE.Vector3());
  rifle.position.sub(center); // Сдвигаем так, чтобы центр был в (0,0,0)

  return rifle;
}
