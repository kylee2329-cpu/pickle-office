/* =========================================================
   합동 비서실 · 3D 미니어처 오피스 (Three.js + OrbitControls)
   - 클레이 질감의 아이소메트릭 사무실 (메인 라운지 · 작업실 · 회의실)
   - 6인 비서 미니어처 인형: 방 이동 시 걸어서 이동, 움직임 ON 시 숨쉬기·라운지 액션
   - 이름표·얼굴 썸네일·말풍선은 HTML 오버레이(#critters)에 3D 좌표를 투영해 배치
   - CDN/WebGL 실패는 window 'po3d:error' 이벤트로 알리고, 앱이 폴백 메시지를 보여 줍니다.
   ========================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- 방 배치 (x: 오른쪽, z: 앞쪽) ---------------- */
// 작업실 = 왼쪽 뒤, 회의실 = 오른쪽 뒤, 메인 라운지 = 앞쪽 전체
const ANCHORS = {
  work: [[-7.55, -4.55], [-4.90, -4.55], [-2.25, -4.55], [-7.55, -2.35], [-4.90, -2.35], [-2.25, -2.35]],
  meet: [[2.70, -5.30], [4.95, -5.30], [7.20, -5.30], [2.70, -2.20], [4.95, -2.20], [7.20, -2.20]],
  main: [[-2.90, 5.20], [-0.10, 5.75], [2.60, 5.15], [-5.20, 1.95], [-7.10, 4.35], [6.30, 4.55]],
};
const FOCUS = { work: [-4.90, -6.10], meet: [4.95, -3.75], main: [0.30, 2.90] };
const DOORS = { work: [-4.60, -0.55], meet: [4.30, -0.55], main: [0.20, 1.40] };
const PINS = {
  work: { pos: [-8.55, 3.95, -1.10], label: '🗂 작업실' },
  meet: { pos: [8.35, 4.55, -0.70], label: '📋 회의실' },
  main: { pos: [-8.30, 2.65, 6.55], label: '☕ 라운지' },
};

/* ---------------- 캐릭터별 머리 모양/소품 ---------------- */
const LOOKS = {
  kyle: { hair: 'bob', hairColor: 0x6b5748, prop: 'clipboard', skin: 0xf3d4bd },
  cloie: { hair: 'long', hairColor: 0x7d5540, prop: 'tablet', skin: 0xf6dbc6 },
  aika: { hair: 'ponytail', hairColor: 0x6d5040, prop: 'marker', skin: 0xf1d0b6 },
  peika: { hair: 'bun', hairColor: 0x8a6142, prop: 'mug', skin: 0xf6d9c0 },
  reika: { hair: 'wave', hairColor: 0x64514a, prop: 'mug', skin: 0xf4d5c0 },
  seika: { hair: 'high', hairColor: 0x574437, prop: 'phone', skin: 0xf2d2ba },
};

/* ---------------- 캔버스 텍스처 ---------------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function woodTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#e3bd8c';
    g.fillRect(0, 0, w, h);
    const plank = 64;
    for (let y = 0; y < h; y += plank) {
      g.fillStyle = `rgba(206, 158, 106, ${0.2 + Math.random() * 0.18})`;
      g.fillRect(0, y, w, plank);
      g.strokeStyle = 'rgba(150, 110, 72, .22)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      // 나뭇결
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = `rgba(168, 126, 84, ${0.05 + Math.random() * 0.07})`;
        g.lineWidth = 1;
        const yy = y + Math.random() * plank;
        g.beginPath();
        g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + rand(-5, 5), w * 0.7, yy + rand(-5, 5), w, yy + rand(-3, 3));
        g.stroke();
      }
      // 이음새
      const seam = Math.random() * w;
      g.strokeStyle = 'rgba(146, 106, 68, .28)';
      g.beginPath(); g.moveTo(seam, y); g.lineTo(seam, y + plank); g.stroke();
    }
  }, [2, 2]);
}

function rugTexture() {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#f3e7d3';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e2cdab';
    g.lineWidth = 10;
    g.strokeRect(16, 16, w - 32, h - 32);
    g.strokeStyle = 'rgba(200, 168, 124, .55)';
    g.lineWidth = 3;
    for (let x = 40; x < w - 30; x += 28) {
      for (let y = 40; y < h - 30; y += 28) {
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}

function whiteboardTexture() {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#cfc7b8';
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    const inks = ['#3f7fbf', '#c9506f', '#0f9d78', '#e08a1e', '#5b4b8a'];
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = inks[i % inks.length];
      g.lineWidth = 5;
      g.globalAlpha = 0.92;
      const y = 46 + i * 34 + rand(-6, 6);
      const x0 = 34 + rand(0, 30);
      g.beginPath(); g.moveTo(x0, y);
      g.bezierCurveTo(x0 + 40, y - 10, x0 + 90, y + 12, x0 + 140 + Math.random() * 150, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    // 체크박스 목록 느낌
    g.strokeStyle = '#8a8173';
    g.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      g.strokeRect(36, 92 + i * 40, 14, 14);
    }
  });
}

function screenTexture() {
  return canvasTex(256, 160, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#8fc3d8');
    grd.addColorStop(1, '#4d7fa8');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.78)';
    g.fillRect(18, 22, 96, 8);
    g.fillRect(18, 40, 150, 6);
    g.fillStyle = 'rgba(255,255,255,.42)';
    for (let i = 0; i < 3; i++) g.fillRect(18 + i * 66, 66, 54, 50);
  });
}

function meetingScreenTexture() {
  return canvasTex(320, 180, (g, w, h) => {
    g.fillStyle = '#26313d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b95c'; g.fillRect(24, 28, 120, 10);
    g.fillStyle = '#7fc7a9'; g.fillRect(24, 50, 80, 10);
    g.fillStyle = '#d98a6a';
    g.fillRect(24, 84, 120, 68);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(170, 84, 120, 22);
    g.fillRect(170, 118, 120, 12);
    g.fillStyle = 'rgba(255,255,255,.1)';
    g.fillRect(170, 144, 88, 10);
  });
}

/* ---------------- 재질 ---------------- */
const material = (color, extra) => new THREE.MeshStandardMaterial({
  color, roughness: 0.86, metalness: 0.02, ...(extra || {}),
});
const glassMat = () => new THREE.MeshStandardMaterial({
  color: 0xd7ecec, roughness: 0.14, metalness: 0.05, transparent: true, opacity: 0.26,
  side: THREE.DoubleSide,
});

const geoCache = new Map();
function rboxGeo(w, h, d, r = 0.06, seg = 3) {
  const key = [w, h, d, r, seg].join('|');
  if (!geoCache.has(key)) {
    const radius = Math.min(r, Math.min(w, h, d) / 2 - 0.002);
    geoCache.set(key, new RoundedBoxGeometry(w, h, d, seg, Math.max(0.004, radius)));
  }
  return geoCache.get(key);
}

/* =========================================================
   메인
   ========================================================= */
const S = {
  ready: false,
  motion: true,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  stage: null,
  canvas: null,
  agents: [],
  byId: new Map(),
  rooms: {},
  rest: {},
  selected: null,
  meetingDemo: null,
  clock: null,
  raf: 0,
  frameCb: null,
  onSelect: null,
  reduced: false,
  lastLabels: {},
};

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (_) { return false; }
}

function fail(reason) {
  window.dispatchEvent(new CustomEvent('po3d:error', { detail: { reason } }));
}

/* ---------------- 조명 ---------------- */
function addLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0xd9bf99, 0.78);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2d6, 1.75);
  key.position.set(9, 17, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -15;
  key.shadow.camera.right = 15;
  key.shadow.camera.top = 15;
  key.shadow.camera.bottom = -15;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.42);
  fill.position.set(-12, 9, -8);
  scene.add(fill);

  const warm = new THREE.PointLight(0xffd9a0, 16, 14, 2);
  warm.position.set(4.9, 2.9, -3.6);
  scene.add(warm);
}

/* ---------------- 플랫폼·벽·바닥 ---------------- */
function buildShell(scene) {
  const floorTex = woodTexture();
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, metalness: 0.02 });

  // 단면이 둥근 나무 베이스
  const base = new THREE.Mesh(rboxGeo(19.8, 0.75, 15.8, 0.28, 4), material(0xd2a070));
  base.position.set(0, -0.38, 0);
  base.receiveShadow = true;
  scene.add(base);

  // 바닥
  const floor = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.08, 15.2), floorMat);
  floor.position.set(0, -0.02, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // 다이너마 아래 부드러운 그림자 (테이블 위에 놓인 미니어처 느낌)
  const shadowTex = canvasTex(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(90, 62, 30, .34)');
    grd.addColorStop(0.55, 'rgba(90, 62, 30, .16)');
    grd.addColorStop(1, 'rgba(90, 62, 30, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 26), new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false,
  }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0.3, -0.82, 0.4);
  scene.add(shadowPlane);

  // 앞쪽 계단 (미니어처 느낌)
  const step = new THREE.Mesh(rboxGeo(19.2, 0.18, 0.5, 0.08), material(0xc9976a));
  step.position.set(0, -0.30, 7.75);
  scene.add(step);

  const wallMat = material(0xf7ead6, { roughness: 0.95 });
  const trimMat = material(0xe3cdaf);
  const H = 3.35;
  const T = 0.26;

  // 뒤벽 (창문 두 개)
  const backZ = -7.45;
  const backSegments = [
    { x: -8.6, w: 2.4 }, { x: -1.2, w: 4.2 }, { x: 5.6, w: 4.0 },
  ];
  // 아래 띠
  const lowBack = new THREE.Mesh(rboxGeo(19.2, 1.2, T, 0.03), wallMat);
  lowBack.position.set(0, 0.6, backZ); lowBack.castShadow = true; lowBack.receiveShadow = true;
  scene.add(lowBack);
  // 위 띠
  const topBack = new THREE.Mesh(rboxGeo(19.2, H - 2.7, T, 0.03), wallMat);
  topBack.position.set(0, 2.7 + (H - 2.7) / 2, backZ); topBack.castShadow = true;
  scene.add(topBack);
  // 기둥
  backSegments.forEach((s) => {
    const p = new THREE.Mesh(rboxGeo(s.w, 1.5, T, 0.03), wallMat);
    p.position.set(s.x, 1.95, backZ); p.castShadow = true;
    scene.add(p);
  });
  // 창문 (유리 + 프레임)
  const winSpots = [[-5.6, 3.4], [-1.9, 3.4], [4.2, 3.4]];
  winSpots.forEach(([x, w]) => {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), glassMat());
    glass.position.set(x, 1.95, backZ + 0.14);
    scene.add(glass);
    const lightBox = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), new THREE.MeshBasicMaterial({
      color: 0xdfeefb, transparent: true, opacity: 0.5,
    }));
    lightBox.position.set(x, 1.95, backZ + 0.15);
    scene.add(lightBox);
    // 창틀
    const frame = new THREE.Mesh(rboxGeo(w + 0.18, 1.5, 0.1, 0.03), trimMat);
    frame.position.set(x, 1.95, backZ + 0.1);
    frame.material = material(0xfbf1e0);
    scene.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), glassMat());
    pane.position.set(x, 1.95, backZ + 0.18);
    scene.add(pane);
    const mullion = new THREE.Mesh(rboxGeo(0.06, 1.3, 0.06, 0.02), material(0xfbf1e0));
    mullion.position.set(x, 1.95, backZ + 0.19);
    scene.add(mullion);
  });

  // 왼쪽 벽
  const leftX = -9.45;
  const leftWall = new THREE.Mesh(rboxGeo(T, H, 15.2, 0.03), wallMat);
  leftWall.position.set(leftX, H / 2, 0);
  leftWall.castShadow = true; leftWall.receiveShadow = true;
  scene.add(leftWall);
  // 왼쪽 벽 몰딩
  const skirt = new THREE.Mesh(rboxGeo(0.08, 0.22, 15.2, 0.03), trimMat);
  skirt.position.set(leftX + 0.16, 0.11, 0);
  scene.add(skirt);

  // 벽 상단 크라운
  const crownB = new THREE.Mesh(rboxGeo(19.3, 0.12, 0.34, 0.04), trimMat);
  crownB.position.set(0, H + 0.02, backZ);
  scene.add(crownB);
  const crownL = new THREE.Mesh(rboxGeo(0.34, 0.12, 15.3, 0.04), trimMat);
  crownL.position.set(leftX, H + 0.02, 0);
  scene.add(crownL);

  // 시계 (왼쪽 벽)
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), material(0xfdfaf3));
  face.rotation.z = Math.PI / 2;
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), material(0xbfa07a));
  rim.rotation.y = Math.PI / 2;
  clock.add(rim);
  const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), material(0x4a4238));
  hand1.position.set(0.05, 0.09, 0);
  clock.add(hand1);
  const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.02), material(0x4a4238));
  hand2.position.set(0.05, 0.03, 0.06);
  hand2.rotation.x = Math.PI / 2;
  clock.add(hand2);
  clock.position.set(leftX + 0.22, 2.55, 1.9);
  scene.add(clock);
}

/* ---------------- 소품 헬퍼 ---------------- */
function addBox(parent, w, h, d, x, y, z, mat, opts = {}) {
  const m = new THREE.Mesh(opts.geo || rboxGeo(w, h, d, opts.r == null ? 0.05 : opts.r), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast !== false;
  m.receiveShadow = !!opts.receive;
  parent.add(m);
  return m;
}

function addCyl(parent, rt, rb, h, x, y, z, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opts.seg || 18), mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast !== false;
  m.receiveShadow = !!opts.receive;
  parent.add(m);
  return m;
}

function plant(parent, x, z, scale = 1) {
  const g = new THREE.Group();
  const pot = addCyl(g, 0.28, 0.22, 0.42, 0, 0.21, 0, material(0xd9a27c), { seg: 16 });
  pot.castShadow = true;
  const soil = addCyl(g, 0.24, 0.24, 0.04, 0, 0.42, 0, material(0x7a5a42));
  soil.castShadow = false;
  const greens = [0x86a86b, 0x9cbb7f, 0x749a5e, 0xa9c78f];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(0.06, 0.24);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(rand(0.16, 0.26), 10, 8), material(greens[i % greens.length]));
    leaf.position.set(Math.cos(a) * r, 0.55 + rand(0, 0.55), Math.sin(a) * r);
    leaf.scale.set(1, rand(0.7, 1.25), 1);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  parent.add(g);
  return g;
}

function mug(parent, x, y, z, color = 0xfdfaf3) {
  const g = new THREE.Group();
  addCyl(g, 0.075, 0.065, 0.13, 0, 0.065, 0, material(color), { seg: 14 });
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 10), material(color));
  handle.position.set(0.075, 0.075, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function laptop(parent, x, y, z, ry = 0, screenColor = 0x9fc4dc) {
  const g = new THREE.Group();
  addBox(g, 0.62, 0.035, 0.44, 0, 0.02, 0, material(0xd9d4cb), { r: 0.02 });
  const lid = addBox(g, 0.62, 0.42, 0.025, 0, 0.24, -0.21, material(0xc9c3b8), { r: 0.02, rx: -0.18 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34), new THREE.MeshBasicMaterial({ color: screenColor }));
  screen.position.set(0, 0.25, -0.195);
  screen.rotation.x = -0.18;
  g.add(screen);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

/* ---------------- 작업실 ---------------- */
function buildWork(scene) {
  const g = new THREE.Group();
  const wood = material(0xdcb98d);
  const woodDark = material(0xa8815c);
  // 바닥 러그
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.6), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 190, (c, w, h) => {
      c.fillStyle = '#e7ece3'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#cfd9c7'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
    }), roughness: 0.95,
  }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-4.9, 0.012, -3.5);
  rug.receiveShadow = true;
  g.add(rug);

  // 책상 3개
  const deskXs = [-7.55, -4.90, -2.25];
  deskXs.forEach((x) => {
    addBox(g, 2.0, 0.12, 0.95, x, 0.78, -5.80, wood, { r: 0.05 });
    // 다리
    addBox(g, 0.12, 0.76, 0.12, x - 0.85, 0.39, -5.85, woodDark, { r: 0.03 });
    addBox(g, 0.12, 0.76, 0.12, x + 0.85, 0.39, -5.85, woodDark, { r: 0.03 });
    addBox(g, 0.12, 0.76, 0.12, x - 0.85, 0.39, -5.35, woodDark, { r: 0.03 });
    addBox(g, 0.12, 0.76, 0.12, x + 0.85, 0.39, -5.35, woodDark, { r: 0.03 });
    // 모니터
    const stand = addCyl(g, 0.04, 0.06, 0.24, x, 0.95, -6.05, material(0x8d8479), { seg: 10 });
    addBox(g, 0.5, 0.03, 0.3, x, 0.86, -6.05, material(0x8d8479), { r: 0.02 });
    const frame = addBox(g, 0.92, 0.58, 0.06, x, 1.28, -6.05, material(0x3d4650), { r: 0.03 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.48), new THREE.MeshBasicMaterial({ map: screenTexture() }));
    scr.position.set(x, 1.28, -6.01);
    g.add(scr);
    // 키보드·머그·서류
    addBox(g, 0.44, 0.03, 0.16, x, 0.86, -5.55, material(0xf2ece0), { r: 0.02 });
    addBox(g, 0.26, 0.01, 0.20, x + 0.62, 0.85, -5.62, material(0xfffaf1), { r: 0.01 });
    addBox(g, 0.26, 0.01, 0.20, x + 0.62, 0.87, -5.60, material(0xfdf1dc), { r: 0.01, ry: 0.12 });
    mug(g, x - 0.62, 0.84, -5.58, 0xf7e6c8);
    // 의자
    const chair = new THREE.Group();
    addCyl(chair, 0.34, 0.30, 0.12, 0, 0.42, 0, material(0x8fa9a2), { seg: 16 });
    addBox(chair, 0.62, 0.55, 0.12, 0, 0.72, -0.28, material(0x8fa9a2), { r: 0.06 });
    addCyl(chair, 0.06, 0.06, 0.36, 0, 0.2, 0, material(0x6f6a61), { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      addBox(chair, 0.34, 0.04, 0.06, Math.cos(a) * 0.17, 0.06, Math.sin(a) * 0.17, material(0x6f6a61), { r: 0.02, ry: -a });
    }
    chair.position.set(x, 0, -4.95);
    g.add(chair);
  });

  // 화이트보드 (왼쪽 벽)
  const wb = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.86), new THREE.MeshStandardMaterial({ map: whiteboardTexture(), roughness: 0.55 }));
  board.position.set(0.02, 1.55, 0);
  board.rotation.y = Math.PI / 2;
  wb.add(board);
  const wbFrame = addBox(wb, 0.1, 1.98, 3.12, -0.03, 1.55, 0, material(0xe8ddc9), { r: 0.03 });
  addBox(wb, 0.16, 0.05, 1.6, 0.06, 0.56, 0, material(0xdcd0bb), { r: 0.02 });
  wb.position.set(-9.3, 0, -4.6);
  g.add(wb);
  // 보드 마커
  ['#c9506f', '#3f7fbf', '#0f9d78'].forEach((c, i) => {
    addCyl(g, 0.035, 0.035, 0.2, -9.12, 0.6, -5.2 + i * 0.22, material(new THREE.Color(c).getHex()), { seg: 8, rz: Math.PI / 2 });
  });

  // 책장 (뒤벽 오른쪽)
  const shelf = new THREE.Group();
  addBox(shelf, 1.5, 2.0, 0.42, 0, 1.0, 0, material(0xe1c49d), { r: 0.04 });
  for (let i = 0; i < 3; i++) {
    addBox(shelf, 1.36, 0.06, 0.34, 0, 0.45 + i * 0.55, 0.02, material(0xcda87e), { r: 0.02 });
    for (let b = 0; b < 5; b++) {
      const h = rand(0.22, 0.34);
      addBox(shelf, 0.09, h, 0.24, -0.52 + b * 0.13 + rand(-0.02, 0.02), 0.48 + i * 0.55 + h / 2, 0.02,
        material([0xc98b6b, 0x7f9f8c, 0xdcb679, 0x8f9dc0, 0xb98fa6][(i + b) % 5]), { r: 0.012 });
    }
  }
  shelf.position.set(-0.9, 0, -7.2);
  g.add(shelf);

  // 서류 상자·바구니
  addBox(g, 0.7, 0.42, 0.55, -8.9, 0.21, -1.3, material(0xd8b48b), { r: 0.05 });
  addBox(g, 0.68, 0.2, 0.53, -8.9, 0.52, -1.3, material(0xf3e5cf), { r: 0.02 });
  plant(g, -8.95, -6.7, 0.85);

  // 파일 캐비닛
  addBox(g, 0.9, 1.15, 0.6, -0.35, 0.57, -2.5, material(0xd9cbb6), { r: 0.05 });
  addBox(g, 0.7, 0.05, 0.04, -0.35, 0.85, -2.18, material(0x9c9184), { r: 0.02 });

  scene.add(g);
  return g;
}

/* ---------------- 회의실 ---------------- */
function buildMeet(scene) {
  const g = new THREE.Group();
  const glass = glassMat();
  const frameMat = material(0xb08a63);
  const X0 = 0.85, Z0 = -0.55;

  // 유리 파티션 (왼쪽 벽: 작업실과 사이)
  const leftLen = 6.4;
  const paneH = 2.5;
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(leftLen / 4 - 0.06, paneH - 0.1), glass);
    p.position.set(X0, paneH / 2 + 0.05, -7.0 + leftLen / 8 + i * (leftLen / 4));
    p.rotation.y = Math.PI / 2;
    g.add(p);
  }
  // 파티션 프레임
  const xFrames = [-7.0, -5.4, -3.8, -2.2, -0.6];
  xFrames.forEach((z) => {
    addBox(g, 0.1, paneH, 0.09, X0, paneH / 2 + 0.05, z, frameMat, { r: 0.02 });
  });
  addBox(g, 0.12, 0.1, leftLen, X0, paneH + 0.05, -7.0 + leftLen / 2, frameMat, { r: 0.02 });
  addBox(g, 0.12, 0.12, leftLen, X0, 0.06, -7.0 + leftLen / 2, frameMat, { r: 0.02 });

  // 앞쪽 유리 (라운지와 사이) - 가운데 출입구
  const frontZ = Z0;
  const frontSegs = [[2.2, 1.3], [6.4, 1.9], [8.2, 1.9]];
  [[2.0, 2.2], [6.55, 2.5], [9.0, 0.55]].forEach(([cx, w]) => {
    if (w < 0.4) return;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, paneH - 0.1), glass);
    p.position.set(cx, paneH / 2 + 0.05, frontZ);
    g.add(p);
  });
  [3.1, 5.35, 7.8, 9.25].forEach((x) => {
    addBox(g, 0.09, paneH, 0.1, x, paneH / 2 + 0.05, frontZ, frameMat, { r: 0.02 });
  });
  addBox(g, 8.5, 0.1, 0.12, 5.05, paneH + 0.05, frontZ, frameMat, { r: 0.02 });
  addBox(g, 8.5, 0.12, 0.12, 5.05, 0.06, frontZ, frameMat, { r: 0.02 });

  // 러그
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 5.6), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 190, (c, w, h) => {
      c.fillStyle = '#eae6f1'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d5cfe4'; c.lineWidth = 7; c.strokeRect(9, 9, w - 18, h - 18);
    }), roughness: 0.95,
  }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(4.95, 0.012, -3.8);
  rug.receiveShadow = true;
  g.add(rug);

  // 회의 테이블
  const table = new THREE.Group();
  addBox(table, 4.6, 0.16, 1.95, 0, 0.78, 0, material(0xd9b183), { r: 0.08 });
  addBox(table, 4.3, 0.1, 1.7, 0, 0.66, 0, material(0xbb9469), { r: 0.05 });
  [[-1.7, 0], [1.7, 0]].forEach(([x]) => {
    addBox(table, 0.24, 0.62, 0.24, x, 0.36, 0, material(0xb08a63), { r: 0.05 });
    addBox(table, 0.5, 0.06, 0.9, x, 0.07, 0, material(0xb08a63), { r: 0.04 });
  });
  // 서류·노트·컵
  addBox(table, 0.34, 0.02, 0.26, -1.2, 0.87, 0.2, material(0xfdf7ec), { r: 0.01, ry: 0.2 });
  addBox(table, 0.34, 0.02, 0.26, -1.15, 0.89, 0.18, material(0xf6ecd8), { r: 0.01, ry: 0.1 });
  mug(table, 1.35, 0.86, -0.35, 0xf2dfc4);
  mug(table, 0.55, 0.86, 0.42, 0xe8eef4);
  table.position.set(4.95, 0, -3.75);
  g.add(table);

  // 회의 전화기
  const phone = new THREE.Group();
  addBox(phone, 0.42, 0.1, 0.42, 0, 0.05, 0, material(0x40484f), { r: 0.03 });
  addBox(phone, 0.34, 0.05, 0.16, 0, 0.12, 0, material(0x59636b), { r: 0.02 });
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x4cd08a : 0x8b939a }));
    led.position.set(-0.1 + i * 0.1, 0.16, 0.12);
    phone.add(led);
  }
  phone.position.set(4.95, 0.86, -3.75);
  g.add(phone);

  // 의자 6개
  const chairs = [[2.7, -4.95, 0], [4.95, -4.95, 0], [7.2, -4.95, 0], [2.7, -2.55, Math.PI], [4.95, -2.55, Math.PI], [7.2, -2.55, Math.PI]];
  chairs.forEach(([x, z, ry]) => {
    const c = new THREE.Group();
    addCyl(c, 0.33, 0.29, 0.12, 0, 0.44, 0, material(0xc9a88c), { seg: 16 });
    addBox(c, 0.58, 0.52, 0.11, 0, 0.72, -0.27, material(0xc9a88c), { r: 0.05 });
    addCyl(c, 0.05, 0.05, 0.38, 0, 0.21, 0, material(0x7a6f64), { seg: 8 });
    addCyl(c, 0.22, 0.24, 0.04, 0, 0.04, 0, material(0x7a6f64), { seg: 12 });
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    g.add(c);
  });

  // 회의실 스크린 (뒤벽)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.75), new THREE.MeshBasicMaterial({ map: meetingScreenTexture() }));
  screen.position.set(4.95, 2.0, -7.2);
  g.add(screen);
  addBox(g, 3.24, 1.88, 0.06, 4.95, 2.0, -7.24, material(0x3a4148), { r: 0.03, cast: false });

  // 펜던트 조명
  const pendant = new THREE.Group();
  const cord = addCyl(pendant, 0.012, 0.012, 0.85, 0, 0.42, 0, material(0x5a5148), { seg: 6 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 20, 1, true), material(0xe8c9a0, { side: THREE.DoubleSide }));
  shade.position.y = -0.08;
  pendant.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9bd }));
  bulb.position.y = -0.16;
  pendant.add(bulb);
  pendant.position.set(4.95, 3.05, -3.75);
  g.add(pendant);

  // 화분
  plant(g, 8.6, -6.7, 1.0);
  scene.add(g);
  return g;
}

/* ---------------- 메인 라운지 ---------------- */
function buildLounge(scene) {
  const g = new THREE.Group();

  // 큰 러그
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 5.4), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.98 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.3, 0.012, 3.3);
  rug.receiveShadow = true;
  g.add(rug);

  // 곡선 소파 (3조각)
  const sofaG = new THREE.Group();
  const sofaMat = material(0x93b3a4, { roughness: 0.98 });
  const sofaDark = material(0x7d9d8e, { roughness: 0.98 });
  [[-1.55, 0.5, 0.42], [0, 0.32, 0], [1.55, 0.5, -0.42]].forEach(([x, rot, zz]) => {
    const seg = new THREE.Group();
    addBox(seg, 1.7, 0.34, 1.05, 0, 0.2, 0, sofaMat, { r: 0.14 });
    addBox(seg, 1.7, 0.52, 0.28, 0, 0.56, -0.42, sofaDark, { r: 0.12 });
    addBox(seg, 0.26, 0.38, 1.0, -0.76, 0.44, 0, sofaDark, { r: 0.1 });
    addBox(seg, 0.26, 0.38, 1.0, 0.76, 0.44, 0, sofaDark, { r: 0.1 });
    // 쿠션
    const cush = addBox(seg, 0.55, 0.16, 0.5, 0.3, 0.42, 0.05, material(0xf2e2c8), { r: 0.1 });
    cush.rotation.z = 0.06;
    seg.position.set(x, 0, zz);
    seg.rotation.y = rot;
    sofaG.add(seg);
  });
  sofaG.position.set(0.35, 0, 1.55);
  g.add(sofaG);

  // 커피 테이블
  const tbl = new THREE.Group();
  addCyl(tbl, 0.78, 0.78, 0.1, 0, 0.42, 0, material(0xd6ab7c), { seg: 28 });
  addCyl(tbl, 0.12, 0.18, 0.38, 0, 0.2, 0, material(0xb78d63), { seg: 12 });
  addCyl(tbl, 0.42, 0.42, 0.03, 0, 0.04, 0, material(0xb78d63), { seg: 20 });
  mug(tbl, 0.2, 0.47, 0.1, 0xf3e0c4);
  mug(tbl, -0.18, 0.47, -0.2, 0xe9eff5);
  // 잡지
  addBox(tbl, 0.36, 0.02, 0.28, -0.22, 0.48, 0.24, material(0xe8c9c0), { r: 0.01, ry: 0.3 });
  tbl.position.set(0.4, 0, 3.35);
  g.add(tbl);

  // 빈백 2개
  [[-5.6, 2.4, 0xd9a27c], [-6.8, 4.1, 0xb9c9b1]].forEach(([x, z, col]) => {
    const bean = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), material(col, { roughness: 0.95 }));
    bean.scale.set(1, 0.72, 1);
    bean.position.set(x, 0.42, z);
    bean.castShadow = true;
    g.add(bean);
    const cush = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), material(0xf6ecdc));
    cush.scale.set(1.2, 0.45, 1);
    cush.position.set(x + 0.5, 0.18, z + 0.35);
    g.add(cush);
  });

  // 커피 바 (오른쪽)
  const bar = new THREE.Group();
  addBox(bar, 1.15, 1.02, 3.9, 0, 0.51, 0, material(0xe0c3a1), { r: 0.08 });
  addBox(bar, 1.25, 0.12, 4.0, 0, 1.06, 0, material(0xf5ead8), { r: 0.06 });
  // 에스프레소 머신
  addBox(bar, 0.6, 0.52, 0.66, 0, 1.36, -0.9, material(0x6d747c), { r: 0.06 });
  addBox(bar, 0.46, 0.1, 0.5, 0, 1.62, -0.9, material(0x565d64), { r: 0.03 });
  addCyl(bar, 0.05, 0.05, 0.22, 0, 1.16, -1.22, material(0xcfd6dc), { seg: 8 });
  addCyl(bar, 0.16, 0.16, 0.06, 0, 1.13, -0.62, material(0xb8bfc6), { seg: 14 });
  // 컵·원두
  [0.1, 0.9, 1.5].forEach((z) => mug(bar, 0.25, 1.12, z, 0xf7eddc));
  addCyl(bar, 0.16, 0.14, 0.26, -0.2, 1.25, 1.5, material(0xa87c56), { seg: 12 });
  // 위쪽 진열장
  addBox(bar, 0.42, 0.06, 3.6, -0.35, 2.28, 0, material(0xe6cba9), { r: 0.03 });
  for (let i = 0; i < 5; i++) {
    mug(bar, -0.35, 2.31, -1.4 + i * 0.7, [0xf3e3c8, 0xdfe8ef, 0xe7d3d8][i % 3]);
  }
  bar.position.set(8.7, 0, 3.4);
  g.add(bar);

  // 실내 퍼팅 (미니 골프)
  const green = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.CircleGeometry(1.85, 40), material(0x7ea865, { roughness: 0.98 }));
  mat.rotation.x = -Math.PI / 2;
  mat.scale.set(1.15, 0.72, 1);
  mat.position.y = 0.015;
  mat.receiveShadow = true;
  green.add(mat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.62, 1.72, 40), material(0x94bb79));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.set(1.15, 0.72, 1);
  ring.position.y = 0.02;
  green.add(ring);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), material(0x3f5236));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(0.8, 0.025, 0.3);
  green.add(hole);
  const flagPole = addCyl(green, 0.014, 0.014, 0.85, 0.8, 0.44, 0.3, material(0xe8e2d6), { seg: 6 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), new THREE.MeshStandardMaterial({ color: 0xd96b6b, side: THREE.DoubleSide }));
  flag.position.set(0.98, 0.82, 0.3);
  green.add(flag);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), material(0xffffff));
  ball.position.set(-0.55, 0.07, -0.25);
  green.add(ball);
  green.position.set(5.8, 0, 5.4);
  g.add(green);

  // 커피 바 스툴
  [2.2, 3.4, 4.6].forEach((z) => {
    const st = new THREE.Group();
    addCyl(st, 0.22, 0.19, 0.08, 0, 0.62, 0, material(0xc9a179), { seg: 14 });
    addCyl(st, 0.045, 0.05, 0.6, 0, 0.31, 0, material(0x8d6a48), { seg: 10 });
    addCyl(st, 0.18, 0.2, 0.04, 0, 0.03, 0, material(0x8d6a48), { seg: 12 });
    st.position.set(7.55, 0, z);
    g.add(st);
  });

  // 빈백 옆 작은 러그·사이드 테이블
  const sideRug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshStandardMaterial({
    color: 0xe9dcc4, roughness: 0.98,
  }));
  sideRug.rotation.x = -Math.PI / 2;
  sideRug.scale.set(1.15, 0.8, 1);
  sideRug.position.set(-6.2, 0.014, 3.4);
  sideRug.receiveShadow = true;
  g.add(sideRug);
  const sideTable = new THREE.Group();
  addCyl(sideTable, 0.42, 0.42, 0.06, 0, 0.46, 0, material(0xd9b183), { seg: 20 });
  addCyl(sideTable, 0.06, 0.08, 0.44, 0, 0.23, 0, material(0xb08a63), { seg: 10 });
  addCyl(sideTable, 0.24, 0.26, 0.03, 0, 0.02, 0, material(0xb08a63), { seg: 14 });
  mug(sideTable, 0.12, 0.5, 0.1, 0xf7e6c8);
  sideTable.position.set(-4.35, 0, 3.15);
  g.add(sideTable);

  // 층 스탠드
  const lamp = new THREE.Group();
  addCyl(lamp, 0.24, 0.28, 0.05, 0, 0.03, 0, material(0xb08a63), { seg: 16 });
  addCyl(lamp, 0.035, 0.035, 1.6, 0, 0.8, 0, material(0xb08a63), { seg: 8 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.44, 20, 1, true), material(0xf0d9b0, { side: THREE.DoubleSide }));
  shade.position.y = 1.66;
  lamp.add(shade);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b8 }));
  glow.position.y = 1.6;
  lamp.add(glow);
  lamp.position.set(-8.3, 0, 1.1);
  g.add(lamp);

  // 라운지 책장 (왼쪽 벽)
  const shelf = new THREE.Group();
  addBox(shelf, 0.45, 2.1, 2.4, 0, 1.05, 0, material(0xe1c49d), { r: 0.05 });
  for (let i = 0; i < 4; i++) {
    addBox(shelf, 0.35, 0.05, 2.24, 0.06, 0.4 + i * 0.5, 0, material(0xcda87e), { r: 0.02 });
    for (let b = 0; b < 6; b++) {
      const h = rand(0.2, 0.32);
      addBox(shelf, 0.22, h, 0.09, 0.06, 0.43 + i * 0.5 + h / 2, -0.95 + b * 0.13,
        material([0xc98b6b, 0x7f9f8c, 0xdcb679, 0x8f9dc0, 0xb98fa6, 0x9ec0b4][(i + b) % 6]), { r: 0.01 });
    }
  }
  shelf.position.set(-9.15, 0, 5.0);
  g.add(shelf);

  // 식물들
  plant(g, -8.9, -1.4, 1.1);
  plant(g, 8.9, -0.9, 0.95);
  plant(g, -2.4, 7.0, 1.0);
  plant(g, 4.4, 7.05, 0.9);
  plant(g, 8.8, 6.6, 1.05);

  // 낮은 화분 테두리 (앞쪽)
  addBox(g, 18.4, 0.3, 0.3, 0, 0.15, 7.35, material(0xdcc6a8), { r: 0.06 });

  scene.add(g);
  return g;
}

/* =========================================================
   레이카 전용 모델 (3등신 클레이 피규어 · 웨이브 긴머리)
   다른 5명은 기존 makeDoll 그대로, 레이카만 아래 빌더를 씁니다.
   ========================================================= */
const RK = {
  purple: 0x7b4ae2,
  purpleHi: 0x9c7cf4,
  purpleDeep: 0x5a33b8,
  cream: 0xf9f1e2,
  ivory: 0xfffbf3,
  tights: 0xf2dccb,
  shoe: 0x4b3a52,
  pearl: 0xfff9f0,
  eye: 0x33241d,
  lash: 0x241a15,
  lip: 0xc06f79,
  blush: 0xef8f98,
  brow: 0x4a3931,
};

// (r, y) 프로파일을 회전시켜 매끈한 몸통·머리 실루엣을 만듭니다.
function latheProfile(profile, seg = 40) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0002, r), y));
  return new THREE.LatheGeometry(pts, seg);
}

// 끝으로 갈수록 가늘어지는 곡선 머리카락 가닥 (튜브 단면을 진행률에 따라 줄입니다).
function taperedTube(points, r0, r1, radial = 9, tubular = 26) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(p[0], p[1], p[2])));
  const geo = new THREE.TubeGeometry(curve, tubular, r0, radial, false);
  const pos = geo.attributes.position;
  const ring = radial + 1;
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      cx += pos.getX(k); cy += pos.getY(k); cz += pos.getZ(k);
    }
    cx /= ring; cy /= ring; cz /= ring;
    const taper = (r0 + (r1 - r0) * t) / r0;
    const tip = t < 0.8 ? 1 : Math.sqrt(Math.max(0.004, 1 - ((t - 0.8) / 0.2) ** 2));
    const f = taper * tip;
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      pos.setXYZ(k, cx + (pos.getX(k) - cx) * f, cy + (pos.getY(k) - cy) * f, cz + (pos.getZ(k) - cz) * f);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// 스커트에 잔주름을 넣습니다.
function pleatGeo(geo, folds, amp) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = 1 + amp * Math.cos(Math.atan2(z, x) * folds);
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makeReikaDoll(spec, index) {
  const look = LOOKS.reika;
  const g = new THREE.Group();
  const parts = {};

  const skinMat = material(look.skin, { roughness: 0.7 });
  const hairMat = material(look.hairColor, { roughness: 0.52, side: THREE.DoubleSide });
  const purpleMat = material(RK.purple, { roughness: 0.66 });
  const purpleHiMat = material(RK.purpleHi, { roughness: 0.6 });
  const purpleDeepMat = material(RK.purpleDeep, { roughness: 0.68 });
  const creamMat = material(RK.cream, { roughness: 0.8 });
  const ivoryMat = material(RK.ivory, { roughness: 0.74 });
  const tightsMat = material(RK.tights, { roughness: 0.86 });
  const shoeMat = material(RK.shoe, { roughness: 0.42, metalness: 0.1 });
  const pearlMat = new THREE.MeshStandardMaterial({ color: RK.pearl, roughness: 0.18, metalness: 0.32 });
  const eyeMat = material(RK.eye, { roughness: 0.26 });
  const lashMat = material(RK.lash, { roughness: 0.4 });
  const lipMat = material(RK.lip, { roughness: 0.42 });
  const browMat = material(RK.brow, { roughness: 0.5 });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blushMat = new THREE.MeshBasicMaterial({ color: RK.blush, transparent: true, opacity: 0.3, depthWrite: false });

  /* ---------- 다리 ---------- */
  const hipY = 0.545;
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.052, hipY, 0);
    const leg = new THREE.Mesh(
      taperedTube([[0, 0.012, 0], [0, -0.16, 0.005], [0, -0.33, 0.007], [0, -0.485, 0.004]], 0.051, 0.027, 8, 16),
      tightsMat,
    );
    leg.castShadow = true;
    pivot.add(leg);
    const shoe = new THREE.Mesh(rboxGeo(0.096, 0.06, 0.168, 0.026, 3), shoeMat);
    shoe.position.set(0, -0.514, 0.022);
    shoe.rotation.x = -0.05;
    shoe.castShadow = true;
    pivot.add(shoe);
    const heel = new THREE.Mesh(rboxGeo(0.058, 0.03, 0.038, 0.008, 2), shoeMat);
    heel.position.set(0, -0.529, -0.05);
    pivot.add(heel);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 5, 14, Math.PI * 1.1), creamMat);
    strap.position.set(0, -0.487, 0.012);
    strap.rotation.set(Math.PI / 2, 0, Math.PI * 0.45);
    pivot.add(strap);
    g.add(pivot);
    if (s > 0) parts.legR = pivot; else parts.legL = pivot;
  });

  /* ---------- 플레어 스커트 ---------- */
  const skirtGeo = pleatGeo(latheProfile([
    [0.108, 0.6], [0.118, 0.552], [0.143, 0.474], [0.175, 0.406],
    [0.202, 0.358], [0.203, 0.352], [0.15, 0.346], [0, 0.342],
  ], 84), 14, 0.032);
  const skirt = new THREE.Mesh(skirtGeo, purpleHiMat);
  skirt.castShadow = true;
  g.add(skirt);
  // 밑단 크림 트림
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.198, 0.0095, 6, 44), creamMat);
  hem.position.set(0, 0.362, 0);
  hem.rotation.x = Math.PI / 2;
  g.add(hem);
  // 허리 크림 벨트
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 8, 30), creamMat);
  belt.position.set(0, 0.606, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.9, 1);
  g.add(belt);

  /* ---------- 재킷 몸통 ---------- */
  const torsoGeo = latheProfile([
    [0.104, 0.585], [0.113, 0.598], [0.109, 0.63], [0.119, 0.674],
    [0.137, 0.718], [0.146, 0.758], [0.143, 0.798], [0.126, 0.836],
    [0.09, 0.862], [0.046, 0.872], [0, 0.874],
  ], 46);
  torsoGeo.translate(0, -0.73, 0);
  const torso = new THREE.Mesh(torsoGeo, purpleMat);
  torso.position.set(0, 0.73, 0);
  torso.scale.set(1, 1, 0.88);
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;
  parts.torsoBase = { x: 1, y: 1, z: 0.88 };

  // 블라우스 V 패널 (크림)
  const vShape = new THREE.Shape();
  vShape.moveTo(-0.05, 0.05);
  vShape.lineTo(0.05, 0.05);
  vShape.lineTo(0, -0.082);
  vShape.lineTo(-0.05, 0.05);
  const blouse = new THREE.Mesh(new THREE.ExtrudeGeometry(vShape, {
    depth: 0.014, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 3,
  }), ivoryMat);
  blouse.position.set(0, 0.812, 0.104);
  blouse.rotation.x = 0.2;
  g.add(blouse);

  // 크림 카라 (V 위쪽 테두리)
  [-1, 1].forEach((s) => {
    const collar = new THREE.Mesh(taperedTube([
      [s * 0.048, 0.868, 0.058], [s * 0.062, 0.842, 0.088], [s * 0.056, 0.806, 0.11],
    ], 0.014, 0.008, 7, 12), creamMat);
    g.add(collar);
  });

  // 라펠 (연보라 재킷 깃)
  [-1, 1].forEach((s) => {
    const lapel = new THREE.Mesh(rboxGeo(0.03, 0.15, 0.016, 0.007, 2), purpleHiMat);
    lapel.position.set(s * 0.06, 0.795, 0.108);
    lapel.rotation.set(0.1, s * 0.32, s * 0.3);
    g.add(lapel);
  });

  // 단추·가슴 배지
  [0.712, 0.664].forEach((y, i) => {
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 10, 8), pearlMat);
    btn.position.set(0, y, (i === 0 ? 0.122 : 0.113));
    btn.scale.set(1, 1, 0.6);
    g.add(btn);
  });
  const badge = new THREE.Group();
  const badgePlate = new THREE.Mesh(rboxGeo(0.034, 0.019, 0.006, 0.003, 2), creamMat);
  badge.add(badgePlate);
  const badgeDot = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), purpleMat);
  badgeDot.position.set(-0.009, 0, 0.004);
  badge.add(badgeDot);
  badge.position.set(0.058, 0.775, 0.116);
  badge.rotation.y = 0.3;
  g.add(badge);
  parts.badge = badge;

  // 어깨 볼륨
  [-1, 1].forEach((s) => {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.049, 14, 12), purpleMat);
    pad.position.set(s * 0.117, 0.838, 0);
    pad.scale.set(1, 0.92, 0.95);
    g.add(pad);
  });

  /* ---------- 팔 ---------- */
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.124, 0.836, 0.004);
    const sleeve = new THREE.Mesh(
      taperedTube([[0, 0.004, 0], [s * 0.012, -0.08, 0.008], [s * 0.016, -0.155, 0.006], [s * 0.014, -0.208, 0]], 0.046, 0.03, 8, 16),
      purpleMat,
    );
    sleeve.castShadow = true;
    pivot.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.016, 14), creamMat);
    cuff.position.set(s * 0.014, -0.214, 0);
    pivot.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.041, 12, 10), skinMat);
    hand.position.set(s * 0.015, -0.248, 0.004);
    hand.scale.set(0.92, 1, 1);
    hand.castShadow = true;
    pivot.add(hand);
    pivot.rotation.z = s * 0.14;
    g.add(pivot);
    if (s > 0) parts.armR = pivot; else parts.armL = pivot;
  });

  /* ---------- 목 ---------- */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.047, 0.075, 14), skinMat);
  neck.position.set(0, 0.888, 0.002);
  g.add(neck);

  /* ---------- 머리 ---------- */
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.155, 0);
  g.add(headGroup);
  parts.head = headGroup;
  parts.headBaseY = 1.155;

  const headGeo = latheProfile([
    [0, -0.238], [0.038, -0.232], [0.075, -0.219], [0.112, -0.198],
    [0.142, -0.166], [0.163, -0.124], [0.176, -0.072], [0.183, -0.016],
    [0.185, 0.038], [0.18, 0.092], [0.168, 0.142], [0.146, 0.184],
    [0.112, 0.216], [0.068, 0.234], [0, 0.24],
  ], 44);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.scale.set(1, 1, 0.95);
  head.castShadow = true;
  headGroup.add(head);

  // 귀
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), skinMat);
    ear.position.set(s * 0.177, -0.03, -0.012);
    ear.scale.set(0.5, 1, 0.8);
    headGroup.add(ear);
  });

  /* ---------- 얼굴 ---------- */
  [-1, 1].forEach((s) => {
    // 눈동자
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 14), eyeMat);
    eye.position.set(s * 0.078, -0.052, 0.146);
    eye.scale.set(0.92, 1.12, 0.62);
    headGroup.add(eye);
    // 속눈썹 라인 (눈 위쪽)
    const lash = new THREE.Mesh(new THREE.SphereGeometry(0.049, 14, 10), lashMat);
    lash.position.set(s * 0.078, -0.014, 0.145);
    lash.scale.set(0.98, 0.3, 0.58);
    headGroup.add(lash);
    // 눈꼬리
    const flick = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), lashMat);
    flick.position.set(s * 0.116, -0.016, 0.14);
    flick.scale.set(0.75, 0.4, 0.5);
    headGroup.add(flick);
    // 캐치라이트
    const big = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 8, 8), whiteMat);
    big.position.set(s * 0.066, -0.034, 0.181);
    big.scale.set(0.85, 1, 0.45);
    headGroup.add(big);
    const small = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), whiteMat);
    small.position.set(s * 0.094, -0.074, 0.176);
    small.scale.set(1, 1, 0.5);
    headGroup.add(small);
    // 눈썹
    const brow = new THREE.Mesh(taperedTube([
      [s * 0.042, 0.012, 0.166], [s * 0.074, 0.03, 0.171], [s * 0.106, 0.018, 0.154],
    ], 0.0075, 0.0035, 6, 12), browMat);
    headGroup.add(brow);
    // 볼터치
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.031, 12, 10), blushMat);
    blush.position.set(s * 0.125, -0.093, 0.12);
    blush.scale.set(1, 0.72, 0.22);
    blush.rotation.y = s * 0.5;
    headGroup.add(blush);
  });
  // 코
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 8, 8), skinMat);
  nose.position.set(0, -0.092, 0.172);
  nose.scale.set(0.85, 0.8, 0.6);
  headGroup.add(nose);
  // 입 (부드러운 미소)
  const mouth = new THREE.Mesh(taperedTube([
    [-0.023, -0.133, 0.163], [-0.011, -0.142, 0.169], [0, -0.145, 0.171], [0.011, -0.142, 0.169], [0.023, -0.133, 0.163],
  ], 0.0055, 0.0045, 6, 16), lipMat);
  headGroup.add(mouth);

  /* ---------- 웨이브 긴머리 ---------- */
  const hair = new THREE.Group();
  headGroup.add(hair);
  parts.hair = hair;

  // 두피 껍질 (얼굴 앞쪽은 비워 둠)
  const gap = 1.95;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.197, 34, 22, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, Math.PI * 0.82),
    hairMat,
  );
  cap.position.set(0, 0.012, -0.004);
  cap.scale.set(1.0, 1.0, 0.98);
  cap.castShadow = true;
  hair.add(cap);
  // 뒷머리 볼륨
  const backMass = new THREE.Mesh(new THREE.SphereGeometry(0.163, 22, 18), hairMat);
  backMass.position.set(0, -0.045, -0.075);
  backMass.scale.set(1.06, 1.3, 0.9);
  backMass.castShadow = true;
  hair.add(backMass);

  // 정수리 윤기 가닥
  const sheen = new THREE.Mesh(taperedTube([
    [0.05, 0.2, 0.03], [0.02, 0.215, 0.075], [-0.03, 0.198, 0.1], [-0.075, 0.168, 0.1],
  ], 0.02, 0.008, 6, 16), material(new THREE.Color(look.hairColor).lerp(new THREE.Color(0xffe4c8), 0.28), { roughness: 0.42 }));
  hair.add(sheen);

  // 앞머리 (옆으로 흐르는 사이드 뱅)
  hair.add(new THREE.Mesh(taperedTube([
    [0.058, 0.182, 0.078], [0.022, 0.176, 0.136], [-0.04, 0.146, 0.166], [-0.1, 0.102, 0.16], [-0.146, 0.05, 0.124],
  ], 0.057, 0.016, 8, 28), hairMat));
  hair.add(new THREE.Mesh(taperedTube([
    [-0.02, 0.202, 0.048], [-0.076, 0.184, 0.116], [-0.132, 0.15, 0.146], [-0.168, 0.098, 0.118],
  ], 0.05, 0.014, 8, 26), hairMat));
  hair.add(new THREE.Mesh(taperedTube([
    [0.076, 0.19, 0.062], [0.108, 0.166, 0.116], [0.122, 0.126, 0.142], [0.114, 0.086, 0.14],
  ], 0.038, 0.011, 8, 24), hairMat));

  // 얼굴 옆을 감싸는 가닥
  [-1, 1].forEach((s) => {
    hair.add(new THREE.Mesh(taperedTube([
      [s * 0.143, 0.128, 0.074], [s * 0.176, 0.02, 0.094], [s * 0.184, -0.09, 0.074],
      [s * 0.172, -0.18, 0.054], [s * 0.156, -0.248, 0.042],
    ], 0.045, 0.013, 8, 26), hairMat));
    hair.add(new THREE.Mesh(taperedTube([
      [s * 0.128, 0.098, 0.104], [s * 0.156, -0.002, 0.116], [s * 0.166, -0.112, 0.1], [s * 0.16, -0.196, 0.082],
    ], 0.024, 0.008, 7, 22), hairMat));
  });

  // 층진 웨이브 뒷머리
  for (let i = -2; i <= 2; i++) {
    const x0 = i * 0.046;
    const sw = Math.sign(i) || 1;
    hair.add(new THREE.Mesh(taperedTube([
      [x0 * 1.05, 0.152, -0.099],
      [x0 * 1.5, 0.05, -0.146],
      [x0 * 1.72 + 0.014 * sw, -0.084, -0.132],
      [x0 * 1.86, -0.235, -0.152],
      [x0 * 1.7, -0.395 - 0.018 * Math.abs(i), -0.124],
    ], 0.052, 0.014, 8, 28), hairMat));
  }
  // 어깨 앞으로 흐르는 긴 가닥
  [-1, 1].forEach((s) => {
    hair.add(new THREE.Mesh(taperedTube([
      [s * 0.132, 0.098, 0.018], [s * 0.166, -0.02, 0.034], [s * 0.176, -0.16, 0.02],
      [s * 0.162, -0.3, 0.0], [s * 0.148, -0.398, -0.022],
    ], 0.037, 0.011, 8, 26), hairMat));
  });

  // 보라 헤어핀 + 진주
  const pin = new THREE.Group();
  const pinBar = new THREE.Mesh(rboxGeo(0.058, 0.016, 0.013, 0.006, 2), purpleHiMat);
  pin.add(pinBar);
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 10, 8), pearlMat);
    p.position.set(i * 0.018, 0, 0.008);
    pin.add(p);
  }
  pin.position.set(0.158, 0.118, 0.038);
  pin.rotation.set(0.1, 0.55, 0.42);
  hair.add(pin);

  /* ---------- 소품 (오른손) ---------- */
  const prop = new THREE.Group();
  const m = new THREE.Group();
  addCyl(m, 0.045, 0.039, 0.078, 0, 0.042, 0, ivoryMat, { seg: 14 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0455, 0.007, 6, 16), purpleMat);
  band.position.set(0, 0.072, 0);
  band.rotation.x = Math.PI / 2;
  m.add(band);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 12), ivoryMat);
  handle.position.set(0.048, 0.042, 0);
  handle.rotation.y = Math.PI / 2;
  m.add(handle);
  m.position.set(0.012, -0.292, 0.048);
  prop.add(m);
  parts.armR.add(prop);
  parts.prop = prop;

  // 라운지 액션 소품 (기존과 호환)
  const putter = new THREE.Group();
  addCyl(putter, 0.012, 0.012, 0.62, 0, -0.3, 0, material(0x9aa3ac), { seg: 6 });
  addBox(putter, 0.12, 0.03, 0.05, 0, -0.6, 0.02, material(0x4e5862), { r: 0.01 });
  putter.position.set(0, 0, 0.02);
  putter.rotation.x = 0.25;
  putter.visible = false;
  parts.armR.add(putter);
  parts.putter = putter;

  const racket = new THREE.Group();
  addCyl(racket, 0.012, 0.012, 0.3, 0, -0.42, 0, material(0xc98b6b), { seg: 6 });
  const rHead = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 6, 18), material(0xd7cbb8));
  rHead.position.set(0, -0.62, 0);
  racket.add(rHead);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.115, 16), new THREE.MeshStandardMaterial({ color: 0xf6f2e8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  strings.position.set(0, -0.62, 0);
  racket.add(strings);
  racket.rotation.x = 0.3;
  racket.visible = false;
  parts.armR.add(racket);
  parts.racket = racket;

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), material(0xffffff));
  ball.position.set(0.34, 0.05, 0.3);
  ball.visible = false;
  g.add(ball);
  parts.ball = ball;

  // 선택 링
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.color), transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  parts.ring = ring;

  // 바닥 그림자
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x6b533a, transparent: true, opacity: 0.16 }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  g.add(blob);

  g.traverse((o) => { if (o.isMesh) o.userData.agentId = spec.id; });

  g.scale.setScalar(1.42);
  g.userData = { spec, parts, index };
  return g;
}

/* ---------------- 미니어처 인형 ---------------- */
function makeDoll(spec, index) {
  if (spec.id === 'reika') return makeReikaDoll(spec, index);
  const look = LOOKS[spec.id] || LOOKS.reika;
  const g = new THREE.Group();
  // 클레이 미니어처 느낌으로 옷 색을 살짝 밝힙니다.
  const cloth = new THREE.Color(spec.color).lerp(new THREE.Color(0xfff6ea), 0.22);
  const outfit = material(cloth, { roughness: 0.72 });
  const skin = material(look.skin, { roughness: 0.8 });
  const hairMat = material(look.hairColor, { roughness: 0.72 });
  const shoe = material(0x5c5148, { roughness: 0.8 });

  const parts = {};

  // 다리
  const legGeo = new THREE.CapsuleGeometry(0.072, 0.16, 4, 8);
  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(legGeo, skin);
    leg.position.set(s * 0.095, 0.23, 0);
    leg.castShadow = true;
    g.add(leg);
    if (s > 0) parts.legR = leg; else parts.legL = leg;
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.24), shoe);
    sh.position.set(s * 0.095, 0.055, 0.03);
    sh.castShadow = true;
    g.add(sh);
  });

  // 몸통 (클레이 원피스)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 0.3, 6, 14), outfit);
  torso.position.set(0, 0.68, 0);
  torso.scale.set(1.02, 1, 0.92);
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // 치마/하의
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.275, 0.19, 16, 1, true), outfit);
  skirt.position.set(0, 0.50, 0);
  skirt.castShadow = true;
  g.add(skirt);

  // 칼라
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.03, 6, 16), material(0xfdf8ef));
  collar.position.set(0, 0.87, 0.02);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);

  // 팔 (어깨 피벗)
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.262, 0.82, 0.02);
    const armMat = material(new THREE.Color(spec.color).lerp(new THREE.Color(0x6b4b33), 0.18), { roughness: 0.74 });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.2, 4, 8), armMat);
    arm.position.set(0, -0.13, 0);
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), skin);
    hand.position.set(0, -0.25, 0.01);
    pivot.add(hand);
    pivot.rotation.z = s * 0.16;
    g.add(pivot);
    if (s > 0) parts.armR = pivot; else parts.armL = pivot;
  });

  // 머리
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.252, 20, 16), skin);
  head.position.set(0, 1.095, 0);
  head.scale.set(1, 1.02, 0.98);
  head.castShadow = true;
  g.add(head);
  parts.head = head;

  // 머리카락
  const hair = new THREE.Group();
  // 얼굴 앞쪽(약 110°)은 비워 두고 덮는 머리카락 껍질 — 눈·볼·입이 보이게
  const gap = 1.95;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.263, 26, 18, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, Math.PI * 0.66),
    hairMat,
  );
  cap.position.set(0, 1.105, -0.008);
  cap.scale.set(1.03, 1.04, 1.03);
  cap.castShadow = true;
  hair.add(cap);
  // 앞머리 (이마만 살짝)
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.252, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.16), hairMat);
  fringe.position.set(0, 1.175, 0.03);
  fringe.rotation.x = 0.30;
  fringe.scale.set(1.02, 0.9, 1.02);
  hair.add(fringe);
  // 뒷머리
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), hairMat);
  back.position.set(0, 1.05, -0.10);
  back.scale.set(1.0, 1.06, 0.95);
  hair.add(back);

  if (look.hair === 'long' || look.hair === 'wave') {
    const len = look.hair === 'long' ? 0.34 : 0.26;
    const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, len, 4, 12), hairMat);
    fall.position.set(0, 0.88 - len * 0.1, -0.12);
    fall.scale.set(1.05, 1, 0.72);
    fall.castShadow = true;
    hair.add(fall);
  }
  if (look.hair === 'ponytail' || look.hair === 'high') {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), hairMat);
    tail.position.set(0, look.hair === 'high' ? 1.16 : 1.02, -0.28);
    tail.rotation.x = look.hair === 'high' ? -0.5 : -0.15;
    tail.castShadow = true;
    hair.add(tail);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 6, 12), material(0xe8a0a8));
    tie.position.set(0, look.hair === 'high' ? 1.28 : 1.13, -0.2);
    tie.rotation.x = Math.PI / 2;
    hair.add(tie);
  }
  if (look.hair === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), hairMat);
    bun.position.set(0, 1.28, -0.16);
    hair.add(bun);
  }
  g.add(hair);
  parts.hair = hair;

  // 얼굴 (눈·볼·입)
  const eyeMat = material(0x2b2620, { roughness: 0.5 });
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), eyeMat);
    eye.position.set(s * 0.092, 1.105, 0.248);
    eye.scale.set(0.85, 1.1, 0.6);
    g.add(eye);
    const gloss = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    gloss.position.set(s * 0.092 + 0.011, 1.118, 0.264);
    g.add(gloss);
  });
  [-1, 1].forEach((s) => {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), new THREE.MeshBasicMaterial({ color: 0xf3a8ab, transparent: true, opacity: 0.45 }));
    blush.position.set(s * 0.152, 1.062, 0.228);
    blush.rotation.y = s * 0.4;
    g.add(blush);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0xb8656b }));
  mouth.position.set(0, 1.05, 0.246);
  mouth.rotation.set(Math.PI, 0, 0);
  g.add(mouth);

  // 소품 (오른손)
  const prop = new THREE.Group();
  const propKind = look.prop;
  if (propKind === 'mug') {
    const m = new THREE.Group();
    addCyl(m, 0.055, 0.05, 0.1, 0, 0.05, 0, material(0xfdfaf3), { seg: 12 });
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 6, 10), material(0xfdfaf3));
    h.position.set(0.055, 0.055, 0);
    h.rotation.y = Math.PI / 2;
    m.add(h);
    m.position.set(0.03, -0.34, 0.05);
    prop.add(m);
  } else if (propKind === 'clipboard') {
    addBox(prop, 0.2, 0.26, 0.02, 0, -0.34, 0.06, material(0xd9b086), { r: 0.01 });
    addBox(prop, 0.16, 0.2, 0.005, 0, -0.34, 0.07, material(0xfdf6e8), { r: 0.01 });
  } else if (propKind === 'tablet') {
    addBox(prop, 0.18, 0.24, 0.015, 0, -0.34, 0.06, material(0x4e5862), { r: 0.01 });
  } else if (propKind === 'marker') {
    addCyl(prop, 0.018, 0.018, 0.16, 0, -0.34, 0.06, material(0xe08a1e), { seg: 8, rz: 0.4 });
  } else if (propKind === 'phone') {
    addBox(prop, 0.11, 0.19, 0.015, 0, -0.34, 0.06, material(0x3d4650), { r: 0.01 });
  }
  parts.armR.add(prop);
  parts.prop = prop;

  // 라운지 액션 소품
  // ⛳ 퍼터
  const putter = new THREE.Group();
  addCyl(putter, 0.012, 0.012, 0.62, 0, -0.3, 0, material(0x9aa3ac), { seg: 6 });
  addBox(putter, 0.12, 0.03, 0.05, 0, -0.6, 0.02, material(0x4e5862), { r: 0.01 });
  putter.position.set(0, 0, 0.02);
  putter.rotation.x = 0.25;
  putter.visible = false;
  parts.armR.add(putter);
  parts.putter = putter;

  // 🎾 라켓
  const racket = new THREE.Group();
  addCyl(racket, 0.012, 0.012, 0.3, 0, -0.42, 0, material(0xc98b6b), { seg: 6 });
  const head2 = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 6, 18), material(0xd7cbb8));
  head2.position.set(0, -0.62, 0);
  racket.add(head2);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.115, 16), new THREE.MeshStandardMaterial({ color: 0xf6f2e8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  strings.position.set(0, -0.62, 0);
  racket.add(strings);
  racket.rotation.x = 0.3;
  racket.visible = false;
  parts.armR.add(racket);
  parts.racket = racket;

  // ⛳ 공
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), material(0xffffff));
  ball.position.set(0.34, 0.05, 0.3);
  ball.visible = false;
  g.add(ball);
  parts.ball = ball;

  // 선택 링
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.color), transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  parts.ring = ring;

  // 바닥 그림자
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x6b533a, transparent: true, opacity: 0.16 }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  g.add(blob);

  g.traverse((o) => { if (o.isMesh) o.userData.agentId = spec.id; });

  g.scale.setScalar(1.42);
  g.userData = { spec, parts, index };
  return g;
}

/* ---------------- 캐릭터 이동 ---------------- */
function anchorFor(room, idx) {
  const list = ANCHORS[room] || ANCHORS.main;
  return list[idx % list.length];
}

const BASE_YAW = {
  main: (i) => (i % 3 - 1) * 0.42,          // 라운지: 카메라 쪽(+z)을 바라보되 조금씩 흩어지게
  work: () => Math.PI,                       // 작업실: 책상을 바라봄(-z)
  meet: (i) => (i < 3 ? 0.12 : Math.PI - 0.12), // 회의실: 테이블 쪽
};

function faceToward(obj, target, lerp) {
  const dx = target.x - obj.position.x;
  const dz = target.z - obj.position.z;
  const want = Math.atan2(dx, dz);
  let cur = obj.rotation.y;
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  obj.rotation.y = cur + d * (lerp == null ? 0.14 : lerp);
}

function buildPath(fromRoom, toRoom, fromPos, toPos) {
  const pts = [];
  const push = (x, z) => pts.push(V(x, 0, z));
  if (fromRoom !== toRoom) {
    const dFrom = DOORS[fromRoom] || DOORS.main;
    const dTo = DOORS[toRoom] || DOORS.main;
    push(dFrom[0], dFrom[1]);
    if (fromRoom !== 'main' && toRoom !== 'main') push(0.1, 1.0);
    if (toRoom !== 'main') push(dTo[0], dTo[1]);
  }
  push(toPos[0], toPos[1]);
  // 이미 지나온 점은 건너뜁니다.
  const out = pts.filter((p) => p.distanceTo(V(fromPos[0], 0, fromPos[1])) > 0.25);
  if (!out.length) out.push(V(toPos[0], 0, toPos[1]));
  return out;
}

function startWalk(agent, room, idx, opts) {
  const pos = anchorFor(room, idx);
  const from = [agent.group.position.x, agent.group.position.z];
  const path = buildPath(agent.room, room, from, pos);
  agent.room = room;
  agent.idx = idx;
  agent.target = pos;
  agent.baseYaw = (BASE_YAW[room] || BASE_YAW.main)(idx);
  agent.walk = { path, seg: 0, t: 0, speed: opts && opts.speed ? opts.speed : 2.6 };
  agent.anim = 'walk';
}

/* ---------------- 장면 구성 ---------------- */
function buildScene() {
  const scene = new THREE.Scene();
  scene.background = null;
  addLights(scene);
  buildShell(scene);
  buildWork(scene);
  buildMeet(scene);
  buildLounge(scene);

  // 방 라벨용 기준점 (반짝이는 표식)
  Object.entries(PINS).forEach(([room, p]) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xc79a63, transparent: true, opacity: 0.55 }));
    dot.position.set(p.pos[0], p.pos[1], p.pos[2]);
    scene.add(dot);
  });
  return scene;
}

/* ---------------- 3D → 화면 투영 (이름표) ---------------- */
function updateLabels() {
  const stage = S.stage;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const cam = S.camera;
  const items = [];
  const labels = stage.querySelectorAll('#critters .critter');
  const scaleRef = 26;
  labels.forEach((el) => {
    const id = el.dataset.id;
    const agent = S.byId.get(id);
    if (!agent) return;
    const p = V(agent.group.position.x, 2.06, agent.group.position.z).project(cam);
    const visible = p.z < 1 && p.x > -1.25 && p.x < 1.25 && p.y > -1.25 && p.y < 1.25;
    const dist = S.camera.position.distanceTo(V(agent.group.position.x, 1.0, agent.group.position.z));
    const scale = clamp((scaleRef / dist) * 1.5, 0.82, 1.08);
    items.push({
      id, el, visible,
      x: (p.x * 0.5 + 0.5) * rect.width,
      y: (-p.y * 0.5 + 0.5) * rect.height,
      scale,
      depth: p.z,
    });
  });

  // 화면 위쪽부터 차례로 놓으며 겹치면 위로 밀어 올립니다.
  const placed = [];
  // 좁은 화면에서는 이름표를 크게 밀어 올리지 않고, 조금만 비켜 놓습니다(캐릭터와 멀어지지 않게).
  const narrow = rect.width < 560;
  const maxStack = narrow ? 14 : 30;
  const labelW = narrow ? 30 : 62;
  const labelH = narrow ? 28 : 54;
  items.sort((a, b) => a.y - b.y);
  items.forEach((it) => {
    const w = labelW * it.scale;
    const h = labelH * it.scale;
    let y = it.y;
    for (let guard = 0; guard < 8; guard++) {
      const box = { l: it.x - w / 2, r: it.x + w / 2, t: y - h, b: y + 4 };
      const hit = placed.find((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
      if (!hit) { placed.push(box); break; }
      if (it.y - (hit.t - 4) > maxStack) { placed.push(box); break; }
      y = Math.max(it.y - maxStack, hit.t - 2);
    }
    it.y = y;
    if (!it.visible) {
      it.el.style.opacity = '0';
      it.el.style.pointerEvents = 'none';
      return;
    }
    it.el.style.opacity = '';
    it.el.style.pointerEvents = '';
    it.el.style.zIndex = String(it.el.classList.contains('is-selected') ? 60 : 10 + Math.round((1 - it.depth) * 40));
    it.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${it.scale.toFixed(3)})`;
  });

  // 방 라벨
  stage.querySelectorAll('.zone-pin').forEach((el) => {
    const room = el.dataset.room;
    const pin = PINS[room];
    if (!pin) return;
    const p = V(pin.pos[0], pin.pos[1], pin.pos[2]).project(cam);
    const x = (p.x * 0.5 + 0.5) * rect.width;
    const y = (-p.y * 0.5 + 0.5) * rect.height;
    const dist = S.camera.position.distanceTo(V(pin.pos[0], pin.pos[1], pin.pos[2]));
    const s = clamp(22 / dist * 1.05, 0.62, 0.98);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
    el.style.opacity = p.z < 1 ? '' : '0';
  });
}

/* ---------------- 애니메이션 ---------------- */
function stepWalk(agent, dt) {
  const w = agent.walk;
  if (!w) return;
  const p = w.path[w.seg];
  if (!p) { agent.walk = null; agent.anim = 'idle'; return; }
  const cur = agent.group.position;
  const dx = p.x - cur.x;
  const dz = p.z - cur.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.06) {
    w.seg++;
    if (w.seg >= w.path.length) {
      agent.walk = null;
      agent.anim = 'idle';
      agent.group.position.set(agent.target[0], 0, agent.target[1]);
    }
    return;
  }
  const stepLen = Math.min(dist, w.speed * dt);
  cur.x += (dx / dist) * stepLen;
  cur.z += (dz / dist) * stepLen;
  const want = Math.atan2(dx, dz);
  agent.group.rotation.y = want;
  agent.walkPhase = (agent.walkPhase || 0) + dt * 9.2;
  const p2 = agent.group.userData.parts;
  const swing = Math.sin(agent.walkPhase) * 0.5;
  agent.group.position.y = Math.abs(Math.sin(agent.walkPhase)) * 0.045;
  if (p2.legL && p2.legR) {
    p2.legL.rotation.x = swing;
    p2.legR.rotation.x = -swing;
  }
  if (p2.armL && p2.armR) {
    p2.armL.rotation.x = -swing * 0.7;
    p2.armR.rotation.x = swing * 0.7;
  }
  agent.group.rotation.z = Math.sin(agent.walkPhase * 0.5) * 0.03;
}

function stepIdle(agent, t) {
  const p = agent.group.userData.parts;
  if (agent.baseYaw != null) {
    let d = agent.baseYaw - agent.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    agent.group.rotation.y += d * 0.07;
  }
  const ph = agent.phase || 0;
  const rest = S.rest[agent.id] || '';
  const moving = S.motion && !S.reduced;
  agent.group.position.y = moving ? Math.sin(t * 1.5 + ph) * 0.012 : 0;
  if (!moving) {
    if (p.legL) { p.legL.rotation.x = 0; p.legR.rotation.x = 0; }
    if (p.armL) { p.armL.rotation.set(0, 0, 0.16); p.armR.rotation.set(0, 0, -0.16); }
    agent.group.rotation.z = 0;
    setRestProps(p, '');
    return;
  }
  const breathe = 1 + Math.sin(t * 1.9 + ph) * 0.018;
  const tb = p.torsoBase || { x: 1.02, y: 1, z: 0.92 };
  p.torso.scale.set(tb.x, tb.y * breathe, tb.z);
  p.head.position.y = (p.headBaseY == null ? 1.09 : p.headBaseY) + Math.sin(t * 1.9 + ph + 0.4) * 0.008;
  agent.group.rotation.z = Math.sin(t * 0.9 + ph) * 0.018;
  if (p.armL) p.armL.rotation.z = 0.16 + Math.sin(t * 1.3 + ph) * 0.05;
  if (p.armR) p.armR.rotation.z = -0.16 - Math.sin(t * 1.3 + ph + 0.6) * 0.05;

  // 라운지 미니 액션
  setRestProps(p, rest);
  if (rest === 'golf') {
    p.armR.rotation.x = -0.25 + Math.sin(t * 1.6 + ph) * 0.35;
    p.armR.rotation.z = -0.3;
    agent.group.rotation.y += Math.sin(t * 0.7 + ph) * 0.0012;
  } else if (rest === 'tennis') {
    p.armR.rotation.x = Math.sin(t * 3.1 + ph) * 0.9 - 0.3;
    p.armR.rotation.z = -0.5;
  } else if (rest === 'coffee') {
    p.armR.rotation.x = -0.75 + Math.sin(t * 1.1 + ph) * 0.16;
    p.armR.rotation.z = -0.35;
  } else if (rest === 'charge') {
    agent.group.rotation.z = Math.sin(t * 0.7 + ph) * 0.05;
    p.head.rotation.z = Math.sin(t * 0.7 + ph) * 0.07;
  } else if (rest === 'stretch') {
    p.armL.rotation.z = 0.9 + Math.sin(t * 1.2 + ph) * 0.25;
    p.armR.rotation.z = -0.9 - Math.sin(t * 1.2 + ph) * 0.25;
  }
  if (rest !== 'charge') p.head.rotation.z *= 0.9;
}

function setRestProps(p, rest) {
  if (!p) return;
  if (p.putter) p.putter.visible = rest === 'golf';
  if (p.racket) p.racket.visible = rest === 'tennis';
  if (p.ball) p.ball.visible = rest === 'golf' || rest === 'tennis';
  if (p.prop) p.prop.visible = !(rest === 'golf' || rest === 'tennis');
}

function animate() {
  S.raf = requestAnimationFrame(animate);
  const dt = Math.min(0.05, S.clock.getDelta());
  const t = S.clock.elapsedTime;

  S.agents.forEach((agent) => {
    if (agent.walk) stepWalk(agent, dt);
    else stepIdle(agent, t);
    // 선택 링
    const ring = agent.group.userData.parts.ring;
    if (ring) {
      const on = S.selected === agent.id;
      ring.material.opacity += ((on ? 0.85 : 0) - ring.material.opacity) * 0.15;
      ring.scale.setScalar(on ? 1 + Math.sin(t * 3.4) * 0.06 : 1);
    }
  });

  // 회의 소집 데모
  if (S.meetingDemo) {
    const d = S.meetingDemo;
    d.t += dt;
    if (d.t > d.gatherAt && !d.gathered) {
      d.gathered = true;
      S.agents.forEach((a) => {
        a.group.rotation.y = Math.atan2(4.95 - a.group.position.x, -3.75 - a.group.position.z);
      });
    }
    if (d.t > d.endAt) {
      S.meetingDemo = null;
      S.agents.forEach((a, i) => startWalk(a, S.rooms[a.id] || 'main', a.idx || i));
    }
  }

  S.controls.update();
  updateLabels();
  S.renderer.render(S.scene, S.camera);
}

/* ---------------- 시작 ---------------- */
function start(cfg) {
  if (S.ready) return true;
  if (!webglAvailable()) { fail('이 브라우저에서는 3D(WebGL)를 켤 수 없어요.'); return false; }
  try {
    const canvas = cfg.canvas;
    S.canvas = canvas;
    S.stage = cfg.stage;
    S.onSelect = cfg.onSelect || null;
    S.reduced = false;
    try { S.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.renderer = renderer;

    const rect = S.stage.getBoundingClientRect();
    const scene = buildScene();
    S.scene = scene;

    const camera = new THREE.PerspectiveCamera(38, Math.max(0.3, rect.width / Math.max(1, rect.height)), 0.5, 120);
    S.camera = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 9;
    controls.maxDistance = 38;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = 1.3;
    controls.target.copy(VIEW.target);
    S.controls = controls;

    // 캐릭터 생성
    (cfg.agents || []).forEach((spec, i) => {
      const doll = makeDoll(spec, i);
      const room = spec.room || 'main';
      const anchor = anchorFor(room, i % 6);
      doll.position.set(anchor[0], 0, anchor[1]);
      doll.rotation.y = (BASE_YAW[room] || BASE_YAW.main)(i % 6);
      scene.add(doll);
      const agent = {
        id: spec.id,
        group: doll,
        room,
        idx: i % 6,
        target: anchor,
        baseYaw: (BASE_YAW[room] || BASE_YAW.main)(i % 6),
        phase: rand(0, Math.PI * 2),
        anim: 'idle',
      };
      S.agents.push(agent);
      S.byId.set(spec.id, agent);
      S.rooms[spec.id] = room;
    });

    S.clock = new THREE.Clock();
    resetView();

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) {
      S.ro = new ResizeObserver(() => resize());
      S.ro.observe(S.stage);
    }

    controls.addEventListener('start', () => { S.userMoved = true; });

    // 클릭 선택 (드래그와 구분)
    let downX = 0, downY = 0, downT = 0;
    canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = Date.now(); });
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
      if (Date.now() - downT > 700) return;
      pickAt(e.clientX, e.clientY);
    });

    resize();
    S.clock.start();
    animate();
    S.ready = true;
    window.dispatchEvent(new CustomEvent('po3d:ready'));
    return true;
  } catch (err) {
    console.error('[office3d] start failed', err);
    fail((err && err.message) || '3D 장면을 준비하지 못했어요.');
    return false;
  }
}

function pickAt(clientX, clientY) {
  const rect = S.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, S.camera);
  const targets = S.agents.map((a) => a.group);
  const hit = ray.intersectObjects(targets, true)[0];
  if (!hit) return;
  let o = hit.object;
  while (o && !o.userData.agentId) o = o.parent;
  const id = o && o.userData.agentId;
  if (id && S.onSelect) S.onSelect(id);
}

const VIEW = { pos: new THREE.Vector3(10.6, 11.6, 13.4), target: new THREE.Vector3(0, 1.0, 0.7) };

function resetView() {
  const c = S.camera, ctl = S.controls;
  if (!c || !ctl) return;
  ctl.target.copy(VIEW.target);
  frameCamera();
  ctl.update();
}

// 플랫폼 전체가 화면 안에 들어오도록 카메라 거리를 자동으로 맞춥니다(가로·세로 비율 모두).
function frameCamera(opt) {
  const c = S.camera, ctl = S.controls;
  if (!c || !ctl) return;
  const o = opt || {};
  const mx = o.x == null ? 0.99 : o.x;
  const my = o.y == null ? 1.22 : o.y;
  const dir = new THREE.Vector3().subVectors(VIEW.pos, VIEW.target).normalize();
  const box = new THREE.Box3(new THREE.Vector3(-9.9, 0, -7.8), new THREE.Vector3(9.9, 3.1, 7.8));
  const corners = [];
  [box.min.x, box.max.x].forEach((x) => [box.min.y, box.max.y].forEach((y) => [box.min.z, box.max.z].forEach((z) => corners.push(new THREE.Vector3(x, y, z)))));
  const fits = (dist) => {
    c.position.copy(ctl.target).addScaledVector(dir, dist);
    c.lookAt(ctl.target);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    return corners.every((v) => {
      const p = v.clone().project(c);
      return Math.abs(p.x) <= mx && Math.abs(p.y) <= my;
    });
  };
  let lo = 7, hi = 70;
  if (!fits(hi)) return;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid; else lo = mid;
  }
  c.position.copy(ctl.target).addScaledVector(dir, hi);
  c.lookAt(ctl.target);
  c.updateMatrixWorld(true);
}

function resize() {
  if (!S.renderer || !S.stage) return;
  const rect = S.stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h;
  // 화면이 좁을수록 조금 멀리서 프레임에 맞춥니다.
  const fit = clamp(1.34 - Math.min(1, w / h) * 0.24, 1.02, 1.34);
  if (!S.userMoved) frameCamera();
  S.camera.updateProjectionMatrix();
}

/* ---------------- 공개 API ---------------- */
window.PO3D = {
  start,
  get ready() { return S.ready; },
  resize,
  resetView() { S.userMoved = false; resetView(); },
  debug() {
    return {
      pos: S.camera.position.toArray().map((n) => +n.toFixed(2)),
      target: S.controls.target.toArray().map((n) => +n.toFixed(2)),
      dist: +S.camera.position.distanceTo(S.controls.target).toFixed(2),
      fov: S.camera.fov,
      aspect: +S.camera.aspect.toFixed(3),
      userMoved: !!S.userMoved,
    };
  },
  setMotion(on) { S.motion = !!on; },
  setSelected(id) { S.selected = id; },
  // 카메라를 특정 비서에게 붙입니다. (검증·스크린샷용: yaw는 캐릭터 정면 기준 상대각)
  focusAgent(id, opts) {
    const a = S.byId.get(id);
    if (!a || !S.camera || !S.controls) return false;
    const o = opts || {};
    const target = V(a.group.position.x, o.targetY == null ? 1.15 : o.targetY, a.group.position.z);
    const dist = o.dist == null ? 4 : o.dist;
    const yaw = a.group.rotation.y + (o.yaw == null ? 0 : o.yaw);
    const pitch = o.pitch == null ? 0.16 : o.pitch;
    if (o.allowClose || dist < S.controls.minDistance) S.controls.minDistance = Math.min(S.controls.minDistance, dist);
    S.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    S.controls.target.copy(target);
    S.controls.update();
    S.userMoved = true;
    return true;
  },
  setRest(map) {
    if (!map) return;
    Object.entries(map).forEach(([id, info]) => { S.rest[id] = info && info.kind ? info.kind : ''; });
  },
  setRooms(map) {
    if (!map) return;
    Object.entries(map).forEach(([id, room]) => {
      const agent = S.byId.get(id);
      if (!agent || !ANCHORS[room]) return;
      if (agent.room === room) { S.rooms[id] = room; return; }
      S.rooms[id] = room;
      startWalk(agent, room, agent.idx == null ? 0 : agent.idx);
    });
  },
  callMeeting() {
    if (!S.ready) return false;
    S.meetingDemo = { t: 0, gatherAt: 2.6, endAt: 8.4, gathered: false };
    S.agents.forEach((a, i) => startWalk(a, 'meet', i, { speed: 2.9 }));
    return true;
  },
  setRoomsVerbose() {},
};
