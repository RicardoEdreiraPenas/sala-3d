import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { DEFAULT_ROOM, ROOM_LIMITS, T, DEFAULT_FURNITURE, FURNITURE_LIMITS, HEIGHTS, WINDOW, CATALOG, PRESETS, DEFAULT_DESIGN } from './config.js';
import { createTextures } from './textures.js';
import { panelInfo } from './info.js';

const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');
const cm = v => Math.round(v * 100);
// centímetros con un decimal solo si hace falta: 0.597 → "59,7", 0.85 → "85"
const c1 = v => { const x = Math.round(v * 1000) / 10; return (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ','); };
const IN = 0.0254;
// Pantalla 16:9 a partir de las pulgadas
const tvSize = inch => ({ w: inch * IN * 0.8716, h: inch * IN * 0.4903, diag: inch * IN });

/* ───────── Renderer ───────── */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.prepend(renderer.domElement);
RectAreaLightUniformsLib.init();
const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.3; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 0.8;

/* ───────── Postproceso (calidad alta): oclusión ambiental + bloom nocturno ───────── */
const HQ_DEFAULT = !matchMedia('(pointer: coarse)').matches && window.innerWidth > 860;
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.blendIntensity = 1.0;
gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.45, 0.92);
composer.addPass(new RenderPass(scene, camera)); composer.addPass(gtao); composer.addPass(bloom); composer.addPass(new OutputPass());
// La oclusión ambiental ignora líneas y objetos transparentes (cristales)
gtao.overrideVisibility = function () {
  const cache = this._visibilityCache;
  this.scene.traverse(o => { cache.set(o, o.visible); if (o.isPoints || o.isLine || (o.isMesh && o.material.transparent)) o.visible = false; });
};

/* ───────── Utilidades ───────── */
let seed = 7;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function rep(tex, u, v, rot = 0) { const t = tex.clone(); t.repeat.set(u, v); t.rotation = rot; t.center.set(.5, .5); t.needsUpdate = true; return t; }
const std = (c, r = 0.6, m = 0, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
/* Coordenadas de textura en metros reales (proyección por cara, con la veta a lo largo del lado más largo).
   Así una tela o una madera tienen la misma escala en un cojín pequeño que en un tablero grande. */
function worldUV(geo, sx, sy, sz) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i) + sx / 2, y = pos.getY(i) + sy / 2, z = pos.getZ(i) + sz / 2;
    let a, b, la, lb;
    if (ax >= ay && ax >= az) { a = z; b = y; la = sz; lb = sy; } else if (ay >= az) { a = x; b = z; la = sx; lb = sz; } else { a = x; b = y; la = sx; lb = sy; }
    if (lb > la) uv.setXY(i, b, a); else uv.setXY(i, a, b);
  }
  uv.needsUpdate = true; return geo;
}
function B(parent, x0, x1, y0, y1, z0, z1, mat, o = {}) {
  const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true;
  parent.add(m); return m;
}
function RB(parent, x0, x1, y0, y1, z0, z1, mat, r = 0.012) {
  const rr = Math.min(r, (x1 - x0) / 2 - 1e-4, (y1 - y0) / 2 - 1e-4, (z1 - z0) / 2 - 1e-4);
  const m = new THREE.Mesh(worldUV(new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 4, Math.max(rr, 0.001)), x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function cyl(parent, r, h, mat, x, y, z, seg = 24, rt) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt ?? r, r, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function disposeGroup(g) {
  g.traverse(o => { if (o.isCSS2DObject) o.element.remove(); if (o.geometry) o.geometry.dispose(); });
  g.removeFromParent();
}

/* ───────── Texturas y materiales ───────── */
const { tex: TX, thumbs: THUMBS, warmUp } = createTextures(THREE, renderer);
const M = {
  wall: std('#EFEBE4', 0.92, 0, { bumpMap: rep(TX.plaster.map, 1 / 1.6, 1 / 1.6), bumpScale: 0.35 }),
  shadowOnly: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  floor: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4, clearcoatRoughness: 0.12 }),
  skirting: std('#F4F2EE', 0.5),
  ceiling: std('#F4F2EE', 0.95, 0, { side: THREE.DoubleSide }),
  pvc: std('#F7F7F5', 0.35),
  glass: new THREE.MeshPhysicalMaterial({ color: '#dfeef0', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }),
  chrome: std('#e6e8ea', 0.15, 1.0),
  dark: std('#1c1f21', 0.6),
  black: std('#0c0d0e', 0.4, 0.2),
  screen: new THREE.MeshPhysicalMaterial({ color: '#0a0c0f', roughness: 0.2, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.04, emissive: '#9fb8d8', emissiveIntensity: 0.0 }),
  white: std('#F5F5F3', 0.4),
  paper: new THREE.MeshStandardMaterial({ color: '#fbf7ef', roughness: 0.9, emissive: '#ffd9a0', emissiveIntensity: 0, side: THREE.DoubleSide }),
  ground: std('#c9ccc7', 0.95),
  outside: std('#dfe7e8', 0.9),
  leaf: std('#4E6B3A', 0.8),
  leafLight: std('#6d8f4a', 0.8),
  pot: std('#EDEAE4', 0.5),
  potGreen: std('#3f5a45', 0.5),
  terracotta: std('#B5643E', 0.8),
  granite: std('#8f8a86', 0.35),
  mesh: std('#2b3036', 0.7),
  chairWhite: std('#eef0f1', 0.45),
  lampMetal: std('#d9d6cf', 0.3, 0.8),
  book: [std('#2f4a5c', 0.7), std('#d7c9a8', 0.7), std('#8b3a2e', 0.7), std('#e8e4dc', 0.7), std('#5a6b4a', 0.7), std('#20242a', 0.7)],
  photo: std('#c7d2d6', 0.5),
  frameWood: std('#b98b5a', 0.6),
  led: new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#ffe2b0', emissiveIntensity: 0 }),
  dimLine: new THREE.LineBasicMaterial({ color: '#b8893f', toneMapped: false }),
  adimLine: new THREE.LineBasicMaterial({ color: '#e0762e', toneMapped: false }),
  fab: null, fabDark: null, pillow: null, throw: null, wood: null, woodEdge: null, rug: null,
};

/* ───────── Estado ───────── */
const state = {
  layout: DEFAULT_DESIGN.layout, fin: { ...DEFAULT_DESIGN.fin }, room: { ...DEFAULT_ROOM }, furn: { ...DEFAULT_FURNITURE },
  night: false, open: false, dims: true, adims: true, tags: window.innerWidth > 860, rot: false, hq: HQ_DEFAULT,
};

/* ───────── Acabados (catálogo en js/config.js) ───────── */
const opt = cat => CATALOG[cat].options.find(o => o.id === state.fin[cat]) || CATALOG[cat].options[0];
function applyFinishes() {
  const f = opt('suelo'), t = TX[f.tex];
  M.floor.map = rep(t.map, 1 / f.size, 1 / f.size);
  M.floor.bumpMap = t.bump ? rep(t.bump, 1 / f.size, 1 / f.size) : null; M.floor.bumpScale = 1.2;
  M.floor.roughness = f.roughness; M.floor.clearcoat = f.clearcoat ?? 0; M.floor.needsUpdate = true;
  M.wall.color.set(opt('pared').color);
  // Tapicería
  const s = opt('sofa'), st = TX[s.tex], k = 1 / (s.size || 0.25);
  M.fab = new THREE.MeshPhysicalMaterial({
    color: s.color, roughness: s.roughness, map: rep(st.map, k, k), ...(st.bump ? { bumpMap: rep(st.bump, k, k), bumpScale: s.bump ?? 1.4 } : {}),
    ...(s.sheen ? { sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(s.color).offsetHSL(0, -0.1, 0.25) } : {}),
  });
  M.fabDark = M.fab.clone(); M.fabDark.color = new THREE.Color(s.color).multiplyScalar(0.86);
  M.pillow = new THREE.MeshPhysicalMaterial({ color: '#F3EEE4', roughness: 0.97, map: rep(TX.boucle.map, 5, 5), bumpMap: rep(TX.boucle.bump, 5, 5), bumpScale: 1.6 });
  M.throw = new THREE.MeshPhysicalMaterial({ color: '#EDE6DA', roughness: 0.95, map: rep(TX.knit.map, 5, 5), bumpMap: rep(TX.knit.bump, 5, 5), bumpScale: 2 });
  // Madera de los muebles
  const w = opt('madera');
  if (w.type === 'wood') {
    M.wood = new THREE.MeshPhysicalMaterial({ color: w.tint, roughness: 0.5, map: rep(TX.oak.map, 0.9, 0.9), bumpMap: rep(TX.oak.bump, 0.9, 0.9), bumpScale: 0.8, clearcoat: 0.12, clearcoatRoughness: 0.5 });
  } else M.wood = new THREE.MeshPhysicalMaterial({ color: w.color, roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.4 });
  M.woodEdge = M.wood;
  // Alfombra
  const r = opt('alfombra');
  M.rug = r.none ? null : r.tex ? std('#ffffff', 0.98, 0, { map: rep(TX[r.tex].map, 1 / r.size, 1 / r.size), ...(TX[r.tex].bump ? { bumpMap: rep(TX[r.tex].bump, 1 / r.size, 1 / r.size), bumpScale: 2 } : {}) }) : std(r.color, 0.98);
}

/* ───────── Geometría de la estancia ───────── */
let G = {};
function computeRoom(r) {
  const { Wt, Wb, L, R, winX, winW, nicheD, frame, H } = r;
  const slope = (Wb - Wt) / L;                   // cuánto se abre la pared de la TV por metro
  const xR = z => Wt + slope * z;                // pared de la TV a la altura z
  const ang = Math.atan(slope);
  const glass0 = winX + frame, glass1 = winX + winW - frame;
  const floorPts = [[0, 0], [winX, 0], [winX, -nicheD], [winX + winW, -nicheD], [winX + winW, 0], [Wt, 0], [xR(L), L], [0, L]];
  let area = 0; for (let i = 0; i < floorPts.length; i++) { const [a, b] = floorPts[i], [c, d] = floorPts[(i + 1) % floorPts.length]; area += a * d - c * b; }
  const winH = Math.min(WINDOW.h, H - WINDOW.box - 0.05);
  return {
    Wt, Wb, L, R, winX, winW, nicheD, frame, H, slope, xR, ang, glass0, glass1, winH,
    leafW: (glass1 - glass0) / 2, rightSeg: Wt - winX - winW,
    area: Math.abs(area) / 2, glassArea: (glass1 - glass0) * winH,
    zMax: Math.max(L, R), s: Math.max(Wb / 3.165, Math.max(L, R) / 2.8, 1),
  };
}
// Corrige medidas imposibles y devuelve avisos para el formulario
function sanitizeRoom(r) {
  const Lm = ROOM_LIMITS, out = { ...DEFAULT_ROOM, ...r }, notes = [];
  const clamp = (k, lo, hi, why) => { const v = Math.min(Math.max(Number(out[k]) || DEFAULT_ROOM[k], lo), hi); if (Math.abs(v - out[k]) > 0.004) { if (why) notes.push(why); } out[k] = v; };
  for (const k of Object.keys(Lm)) clamp(k, Lm[k][0], Lm[k][1]);
  clamp('winW', Lm.winW[0], Math.max(Lm.winW[0], out.Wt - 0.2), 'El nicho de la ventana no cabía en su pared: lo he estrechado.');
  clamp('winX', 0.05, Math.max(0.05, out.Wt - out.winW - 0.05), 'La ventana se salía de su pared: la he movido.');
  clamp('frame', 0, Math.max(0, out.winW / 2 - 0.3), 'El marco de pared dejaba la ventana sin cristal: lo he reducido.');
  if (Math.abs(out.Wb - out.Wt) > 0.4) { out.Wb = out.Wt + Math.sign(out.Wb - out.Wt) * 0.4; notes.push('Entre el ancho de arriba y el de abajo hay más de 40 cm: lo he limitado.'); }
  return { room: out, notes };
}
function sanitizeFurniture(f) {
  const out = { ...DEFAULT_FURNITURE, ...f };
  for (const [k, [lo, hi]] of Object.entries(FURNITURE_LIMITS)) out[k] = Math.min(Math.max(Number(out[k]) || DEFAULT_FURNITURE[k], lo), hi);
  out.tvIn = Math.round(out.tvIn);
  out.chaiseL = Math.max(out.chaiseL, out.sofaD + 0.3);
  return out;
}

/* ───────── Luces ───────── */
const hemi = new THREE.HemisphereLight('#f3f6f8', '#b9ab98', 0.35); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 3.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.layers.enable(1);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
let nightLights = new THREE.Group(), skyLights = new THREE.Group();

/* ───────── Estancia ───────── */
const walls = [];
let roomGroup = null, roomAnim = [], dims = null, ceiling = null;
function buildRoom() {
  if (roomGroup) disposeGroup(roomGroup);
  roomGroup = new THREE.Group(); scene.add(roomGroup);
  walls.length = 0; roomAnim = [];
  const { Wt, L, R, H, winX, winW, nicheD, glass0, glass1, winH, xR, ang } = G;
  const nx0 = winX, nx1 = winX + winW, zb = -nicheD, top = winH + WINDOW.box;

  // Sol entrando por la balconera
  sun.position.set((nx0 + nx1) / 2 - 1.6, 4.6, -5.5); sun.target.position.set((nx0 + nx1) / 2 + 0.4, 0, L * 0.6);
  const half = Math.max(Wt, R) + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: 30 });
  sun.shadow.camera.updateProjectionMatrix();

  const proxies = new THREE.Group(); roomGroup.add(proxies);
  const shadowProxy = b => { const m = B(proxies, ...b, M.shadowOnly, { receive: false }); m.layers.set(1); };
  const valid = b => b[1] - b[0] > 1e-4 && b[3] - b[2] > 1e-4 && b[5] - b[4] > 1e-4;
  const wall = (n, p, boxes, parent = roomGroup, fixed = false) => {
    const g = new THREE.Group();
    boxes.filter(valid).forEach(b => { const m = B(g, ...b, M.wall); m.castShadow = false; if (parent === roomGroup) shadowProxy(b); });
    parent.add(g); walls.push({ g, n: new THREE.Vector3(...n), p: new THREE.Vector3(...p), fixed }); return g;
  };
  // Pared de la ventana con el nicho
  wall([0, 0, 1], [0, 0, 0], [
    [-T, nx0, 0, H, zb - T, 0], [nx1, Wt + T, 0, H, zb - T, 0],                  // macizos a los lados del nicho
    [nx0, nx1, top + 0.02, H, zb, 0],                                               // dintel del nicho
    [nx0, glass0, 0, H, zb - T, zb], [glass1, nx1, 0, H, zb - T, zb],                // marcos de pared de la ventana
    [glass0, glass1, top, H, zb - T, zb],
  ], roomGroup, true);
  // Pared del sofá y su vuelta hacia la cocina
  wall([1, 0, 0], [0, 0, 0], [[-T, 0, 0, H, 0, L]]);
  // Pared de la TV (algo girada): coordenadas locales x = hacia fuera, z = a lo largo
  const tvWall = new THREE.Group(); tvWall.position.set(Wt, 0, 0); tvWall.rotation.y = ang; roomGroup.add(tvWall);
  const n = new THREE.Vector3(-Math.cos(ang), 0, Math.sin(ang));
  wall(n.toArray(), [Wt, 0, 0], [[0, T, 0, H, zb - T, R]], tvWall);
  [[0, T, 0, H, zb - T, R]].forEach(b => { const m = B(tvWall, ...b, M.shadowOnly, { receive: false }); m.layers.set(1); });

  // Techo
  const ceilShape = new THREE.Shape([[0, 0], [nx0, 0], [nx0, zb], [nx1, zb], [nx1, 0], [Wt, 0], [xR(R), R], [0, R]].map(([x, z]) => new THREE.Vector2(x, -z)));
  const cgeo = new THREE.ShapeGeometry(ceilShape);
  ceiling = new THREE.Mesh(cgeo, M.ceiling); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H; ceiling.scale.y = -1; roomGroup.add(ceiling);
  const cp = new THREE.Mesh(new THREE.BoxGeometry(Wt + 0.4, 0.05, R - zb + 0.3), M.shadowOnly); cp.position.set(Wt / 2, H + 0.03, (R + zb) / 2); cp.layers.set(1); cp.castShadow = true; roomGroup.add(cp);

  // Suelo: la sala y el nicho
  const pts = [[0, 0], [nx0, 0], [nx0, zb], [nx1, zb], [nx1, 0], [Wt, 0], [xR(R), R], [0, R]];
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; roomGroup.add(floor);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.set(Wt / 2, -0.012, L / 2); ground.receiveShadow = true; roomGroup.add(ground);

  // Rodapié
  const sk = a => B(roomGroup, ...a, M.skirting);
  sk([0, nx0, 0, 0.07, 0, 0.012]); sk([nx1, Wt, 0, 0.07, 0, 0.012]); sk([0, 0.012, 0, 0.07, 0, L]);
  const skT = new THREE.Group(); tvWall.add(skT); B(skT, -0.012, 0, 0, 0.07, 0, R, M.skirting);

  // Balconera de dos hojas (abre hacia dentro) y cajón de persiana
  const win = new THREE.Group(); roomGroup.add(win);
  const fz = zb - 0.07;
  B(win, glass0, glass1, winH, top, fz - 0.02, zb, M.pvc);                                   // cajón de persiana
  B(win, glass0, glass1, winH - 0.06, winH, fz, zb - 0.01, M.pvc);
  B(win, glass0, glass0 + 0.06, 0, winH, fz, zb - 0.01, M.pvc); B(win, glass1 - 0.06, glass1, 0, winH, fz, zb - 0.01, M.pvc);
  B(win, glass0, glass1, 0, 0.03, fz, zb - 0.01, M.pvc);
  const lw = (glass1 - glass0 - 0.12) / 2;
  const leaf = (x, sign) => {
    const p = new THREE.Group(); p.position.set(x, 0, zb - 0.01); win.add(p);
    const x0 = sign > 0 ? 0 : -lw, x1 = sign > 0 ? lw : 0;
    B(p, x0, x1, 0.03, 0.14, 0, 0.065, M.pvc); B(p, x0, x1, winH - 0.12, winH - 0.06, 0, 0.065, M.pvc);
    B(p, x0, x0 + 0.075, 0.03, winH - 0.06, 0, 0.065, M.pvc); B(p, x1 - 0.075, x1, 0.03, winH - 0.06, 0, 0.065, M.pvc);
    const gl = B(p, x0 + 0.075, x1 - 0.075, 0.14, winH - 0.12, 0.028, 0.036, M.glass); gl.castShadow = false;
    const hx = sign > 0 ? x1 - 0.05 : x0 + 0.03; B(p, hx, hx + 0.02, 1.02, 1.16, 0.065, 0.085, M.white);
    roomAnim.push({ obj: p.rotation, key: 'y', closed: 0, open: sign > 0 ? -1.35 : 1.35 });
  };
  leaf(glass0 + 0.06, 1); leaf(glass1 - 0.06, -1);
  // Exterior: un balcón luminoso
  B(roomGroup, nx0 - 0.6, nx1 + 0.6, -0.02, 0, zb - T - 1.3, zb - T, M.outside);
  B(roomGroup, nx0 - 0.6, nx1 + 0.6, 0, 1.0, zb - T - 1.36, zb - T - 1.3, M.outside);

  // Luz de cielo por la balconera
  skyLights = new THREE.Group(); roomGroup.add(skyLights);
  const sl = new THREE.RectAreaLight('#e4eef7', 3.4, glass1 - glass0 - 0.1, winH - 0.15);
  sl.position.set((glass0 + glass1) / 2, winH / 2, zb - 0.02); sl.lookAt((glass0 + glass1) / 2, winH / 2, 3); skyLights.add(sl);

  // Aire acondicionado sobre el tramo derecho
  const ac = new THREE.Group(); roomGroup.add(ac);
  { const w = Math.min(0.80, G.rightSeg - 0.12), x0 = nx1 + (G.rightSeg - w) / 2 - 0.02, y0 = Math.min(H - 0.38, top + 0.02);
    if (w > 0.4) {
      RB(ac, x0, x0 + w, y0, y0 + 0.28, 0, 0.2, M.white, 0.03);
      B(ac, x0 + 0.03, x0 + w - 0.03, y0 + 0.02, y0 + 0.05, 0.19, 0.205, M.dark, { cast: false });
      G.ac = { x0, x1: x0 + w, y: y0 + 0.14 };
    } else G.ac = null; }

  // Luces de noche
  nightLights = new THREE.Group(); roomGroup.add(nightLights);

  // Cotas de la planta
  dims = new THREE.Group(); roomGroup.add(dims);
  const y0 = 0.02, o = 0.3;
  dim(dims, [0, y0, zb - T - o], [nx0, y0, zb - T - o], fmt(nx0));
  dim(dims, [nx0, y0, zb - T - o], [nx1, y0, zb - T - o], fmt(winW));
  dim(dims, [nx1, y0, zb - T - o], [Wt, y0, zb - T - o], fmt(G.rightSeg));
  dim(dims, [0, y0, zb - T - o - 0.3], [Wt, y0, zb - T - o - 0.3], fmt(Wt));
  dim(dims, [-o, y0, 0], [-o, y0, L], fmt(L));
  dim(dims, [xR(R) + o, y0, 0], [xR(R) + o, y0, R], fmt(R));
  dim(dims, [0, y0, L + 0.25], [xR(L), y0, L + 0.25], fmt(G.Wb), true);
  dim(dims, [nx0 + 0.08, y0, zb], [nx0 + 0.08, y0, 0], fmt(nicheD), true);
}
function dim(parent, a, b, text, inner = false, mat = M.dimLine, cls = 'dim') {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const dir = Bv.clone().sub(A).normalize();
  const perp = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(0.05, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.06);
  const geo = new THREE.BufferGeometry().setFromPoints([A, Bv, A.clone().add(perp), A.clone().sub(perp), Bv.clone().add(perp), Bv.clone().sub(perp)]);
  parent.add(new THREE.LineSegments(geo, mat));
  const el = document.createElement('div'); el.className = cls + (inner ? ' in' : ''); el.textContent = text;
  const lab = new CSS2DObject(el); lab.position.copy(A).add(Bv).multiplyScalar(0.5); parent.add(lab);
  return lab;
}
// Cotas naranjas de un mueble: grupo que se enciende y apaga con «Medidas de muebles»
function fdims(parent) { const g = new THREE.Group(); g.userData.adims = true; g.visible = state.adims; parent.add(g); return g; }
const adim = (g, a, b, text) => { const l = dim(g, a, b, text, false, M.adimLine, 'dim ap'); l.visible = state.adims; return l; };
function tag(parent, text, sub, x, y, z) {
  const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<b>${text}</b><span>${sub}</span>`;
  const o = new CSS2DObject(el); o.position.set(x, y, z); o.visible = state.tags; parent.add(o); return o;
}

/* ───────── Piezas de mobiliario ───────── */
function plant(g, x, z, y = 0, s = 1, tall = false) {
  cyl(g, 0.11 * s, 0.2 * s, tall ? M.pot : M.potGreen, x, y + 0.1 * s, z, 20, 0.13 * s);
  if (tall) {
    cyl(g, 0.012, 1.1 * s, M.frameWood, x, y + 0.75 * s, z, 8);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, h = y + (0.55 + (i / 16) * 0.85) * s, r = (0.18 + rnd() * 0.18) * s;
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 10, 6), i % 3 ? M.leaf : M.leafLight);
      lf.scale.set(1.5, 0.22, 0.6); lf.position.set(x + Math.cos(a) * r, h, z + Math.sin(a) * r); lf.rotation.y = -a; lf.rotation.z = -0.5; lf.castShadow = true; g.add(lf);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, lf = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 8, 6), i % 2 ? M.leaf : M.leafLight);
      lf.scale.set(0.5, 4, 0.5); lf.position.set(x + Math.cos(a) * 0.04 * s, y + 0.3 * s, z + Math.sin(a) * 0.04 * s); lf.rotation.z = Math.cos(a) * 0.25; lf.rotation.x = Math.sin(a) * 0.25; lf.castShadow = true; g.add(lf);
    }
  }
}
function books(g, x0, x1, y, z0, z1) {
  let x = x0; let i = 0;
  while (x < x1 - 0.02) { const t = 0.02 + rnd() * 0.025, h = 0.16 + rnd() * 0.08; B(g, x, x + t, y, y + h, z0, z0 + (z1 - z0) * (0.75 + rnd() * 0.2), M.book[i++ % M.book.length]); x += t + 0.002; }
}
function photoFrame(g, x, y, z, w, h, rotY = 0) {
  const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = rotY; g.add(f);
  B(f, -w / 2, w / 2, 0, h, -0.01, 0.01, M.frameWood); B(f, -w / 2 + 0.02, w / 2 - 0.02, 0.02, h - 0.02, 0.01, 0.012, M.photo, { cast: false });
  f.rotation.x = -0.08;
}

/* Sofá con chaise longue pegado a la pared x = 0, de z0 a z1. chaiseAt: 'end' (hacia la cocina) | 'start' (hacia la ventana) */
function sofa(g, z0, z1, chaiseAt) {
  const f = state.furn, D = f.sofaD, cw = Math.min(0.95, Math.max(0.7, D)), CL = f.chaiseL;
  const s = new THREE.Group(); g.add(s);
  const H = HEIGHTS, arm = 0.14, back = 0.2;
  const cz0 = chaiseAt === 'end' ? z1 - cw : z0, cz1 = cz0 + cw;           // tramo de la chaise
  const mz0 = chaiseAt === 'end' ? z0 : cz1, mz1 = chaiseAt === 'end' ? cz0 : z1;   // tramo normal
  // Bases
  RB(s, 0.02, D, 0.06, 0.3, mz0 + (chaiseAt === 'end' ? 0 : 0), mz1, M.fabDark, 0.03);
  RB(s, 0.02, CL, 0.06, 0.3, cz0, cz1, M.fabDark, 0.03);
  // Patas
  [[0.06, mz0 + 0.06], [D - 0.06, mz0 + 0.06], [CL - 0.06, cz0 + 0.06], [CL - 0.06, cz1 - 0.06]].forEach(([x, z]) => cyl(s, 0.018, 0.06, M.dark, x, 0.03, Math.min(Math.max(z, z0 + 0.04), z1 - 0.04), 10));
  // Respaldo a lo largo de la pared
  RB(s, 0.02, back, 0.3, H.back, z0, z1, M.fabDark, 0.05);
  // Brazo en el extremo sin chaise
  const az0 = chaiseAt === 'end' ? z0 : z1 - arm, az1 = az0 + arm;
  RB(s, 0.02, D, 0.3, 0.6, az0, az1, M.fab, 0.05);
  // Asientos: tramo normal en módulos, chaise de una pieza
  const seatZ0 = chaiseAt === 'end' ? az1 : mz0, seatZ1 = chaiseAt === 'end' ? mz1 : az0;
  const n = Math.max(1, Math.round((seatZ1 - seatZ0) / 0.7));
  for (let i = 0; i < n; i++) {
    const a = seatZ0 + (seatZ1 - seatZ0) * i / n, b = seatZ0 + (seatZ1 - seatZ0) * (i + 1) / n;
    RB(s, back, D - 0.01, 0.3, H.seat, a + 0.005, b - 0.005, M.fab, 0.06);
    RB(s, back - 0.02, back + 0.16, H.seat, H.back + 0.02, a + 0.01, b - 0.01, M.fab, 0.07).rotation.z = 0.12;
  }
  RB(s, back, CL - 0.01, 0.3, H.seat, cz0 + 0.005, cz1 - 0.005, M.fab, 0.06);
  RB(s, back - 0.02, back + 0.16, H.seat, H.back + 0.02, cz0 + 0.01, cz1 - 0.01, M.fab, 0.07).rotation.z = 0.12;
  // Cojines
  const pillow = (z, mat) => { const p = RB(s, back + 0.12, back + 0.26, H.seat + 0.02, H.seat + 0.4, z - 0.22, z + 0.22, mat, 0.08); p.rotation.z = 0.2; };
  pillow(chaiseAt === 'end' ? seatZ0 + 0.3 : seatZ1 - 0.3, M.pillow); pillow((seatZ0 + seatZ1) / 2, M.fabDark);
  // Manta en la chaise
  RB(s, CL - 0.6, CL - 0.02, H.seat - 0.005, H.seat + 0.025, cz0 + 0.04, cz1 - 0.04, M.throw, 0.012);
  // Cotas y etiqueta
  const d = fdims(s), y = 0.9;
  adim(d, [D + 0.06, y, z0], [D + 0.06, y, z1], `sofá ${c1(z1 - z0)}`);
  adim(d, [0, y, chaiseAt === 'end' ? z1 + 0.08 : z0 - 0.08], [CL, y, chaiseAt === 'end' ? z1 + 0.08 : z0 - 0.08], `chaise ${c1(CL)}`);
  adim(d, [0, 0.66, (az0 + az1) / 2], [D, 0.66, (az0 + az1) / 2], `fondo ${c1(D)}`);
  tag(s, 'Sofá chaise longue', `${c1(z1 - z0)} × ${c1(D)} · chaise ${c1(CL)}`, D * 0.6, 1.25, (mz0 + mz1) / 2);
  return { cz0, cz1, cw, CL, D, mz0, mz1 };
}

/* Mesa de centro con tapa en forma de huevo y tres patas */
function coffeeTable(g, x, z) {
  const w = state.furn.coffeeW, d = Math.round(w * 62) / 100, h = HEIGHTS.coffee;
  const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t);
  const shape = new THREE.Shape(); shape.absellipse(0, 0, d / 2, w / 2, 0, Math.PI * 2);
  const top = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }), M.white);
  top.rotation.x = -Math.PI / 2; top.position.y = h - 0.03; top.castShadow = top.receiveShadow = true; t.add(top);
  [[0, w * 0.34], [d * 0.3, -w * 0.25], [-d * 0.3, -w * 0.25]].forEach(([lx, lz]) => { const l = cyl(t, 0.016, h - 0.03, M.frameWood, lx * 0.8, (h - 0.03) / 2, lz * 0.8, 10, 0.02); l.rotation.x = lz > 0 ? -0.08 : 0.08; });
  // Cosas encima
  cyl(t, 0.05, 0.1, M.pot, -0.05, h + 0.05, w * 0.12, 16); plant(t, -0.05, w * 0.12, h + 0.05, 0.5);
  RB(t, 0.02, 0.2, h, h + 0.1, -w * 0.18, -w * 0.02, M.frameWood, 0.02);
  const d2 = fdims(t); adim(d2, [-d / 2, h + 0.06, -w / 2 - 0.05], [d / 2, h + 0.06, -w / 2 - 0.05], `${c1(w)} × ${c1(d)}`);
  tag(t, 'Mesa de centro', `${c1(w)} × ${c1(d)}`, 0, h + 0.35, 0);
  return { x0: x - d / 2, x1: x + d / 2, z0: z - w / 2, z1: z + w / 2 };
}

/* Muebles de la pared de la TV: grupo local con x = -(distancia a la pared), z = a lo largo de la pared */
function desk(wg, u0) {
  const f = state.furn, W = f.deskW, D = f.deskD, h = HEIGHTS.desk;
  const d = new THREE.Group(); d.position.z = u0; wg.add(d);
  B(d, -D, 0, h - 0.025, h, 0, W, M.wood);                                                // tablero
  B(d, -D + 0.02, -0.02, 0, h - 0.025, 0.0, 0.025, M.wood);                               // costado junto a la ventana
  B(d, -0.06, -0.04, 0.35, h - 0.025, 0.03, W - 0.4, M.wood);                             // faldón
  // Cajonera de 5 cajones al otro extremo
  const cw = 0.36, c0 = W - cw - 0.005;
  B(d, -D + 0.02, -0.02, 0, h - 0.03, c0, c0 + cw, M.wood);
  for (let i = 0; i < 5; i++) { const y0 = 0.02 + i * 0.138; B(d, -D + 0.01, -D + 0.02, y0 + 0.004, y0 + 0.134, c0 + 0.005, c0 + cw - 0.005, M.wood); B(d, -D + 0.002, -D + 0.012, y0 + 0.09, y0 + 0.1, c0 + 0.12, c0 + cw - 0.12, M.dark); }
  // Monitor, portátil, lámpara
  const mz = W * 0.52;
  B(d, -0.28, -0.24, h, h + 0.1, mz - 0.04, mz + 0.04, M.dark); B(d, -0.32, -0.2, h, h + 0.01, mz - 0.1, mz + 0.1, M.dark);
  const mon = B(d, -0.27, -0.24, h + 0.1, h + 0.42, mz - 0.3, mz + 0.3, M.black); mon.rotation.y = 0.05;
  B(d, -0.272, -0.27, h + 0.12, h + 0.4, mz - 0.28, mz + 0.28, M.screen, { cast: false });
  B(d, -0.46, -0.24, h, h + 0.015, W * 0.22 - 0.16, W * 0.22 + 0.16, M.lampMetal);
  const scr = B(d, -0.25, -0.24, h + 0.015, h + 0.22, W * 0.22 - 0.16, W * 0.22 + 0.16, M.lampMetal); scr.rotation.z = -0.25;
  cyl(d, 0.06, 0.02, M.lampMetal, -0.15, h + 0.01, 0.12, 16);
  const arm = cyl(d, 0.008, 0.45, M.lampMetal, -0.2, h + 0.23, 0.12, 8); arm.rotation.z = 0.35;
  const head = cyl(d, 0.035, 0.1, M.lampMetal, -0.33, h + 0.42, 0.12, 16, 0.02); head.rotation.z = 1.2;
  const lamp = new THREE.PointLight('#ffc98a', 0, 3, 2); lamp.position.set(-0.36, h + 0.3, 0.12); d.add(lamp); nightFx.push(l => { lamp.intensity = l ? 1.6 : 0; });
  // Silla de oficina
  const ch = new THREE.Group(); ch.position.set(-D - 0.2, 0, W * 0.45); ch.rotation.y = -0.35; d.add(ch);
  for (let i = 0; i < 5; i++) { const a = i * 1.2566, l = B(ch, -0.01, 0.01, 0.04, 0.06, 0, 0.3, M.chairWhite); l.rotation.y = a; l.position.set(Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15); }
  cyl(ch, 0.025, 0.4, M.chairWhite, 0, 0.25, 0, 12);
  RB(ch, -0.24, 0.24, 0.45, 0.52, -0.24, 0.24, M.mesh, 0.03);
  RB(ch, -0.3, -0.26, 0.52, 1.15, -0.22, 0.22, M.chairWhite, 0.03).rotation.z = 0.1;
  RB(ch, -0.285, -0.265, 0.6, 1.1, -0.18, 0.18, M.mesh, 0.01).rotation.z = 0.1;
  // Cotas
  const dd = fdims(d);
  adim(dd, [-D - 0.05, h + 0.03, 0], [-D - 0.05, h + 0.03, W], `escritorio ${c1(W)}`);
  adim(dd, [-D, h + 0.03, -0.05], [0, h + 0.03, -0.05], `fondo ${c1(D)}`);
  tag(d, 'Escritorio', `${c1(W)} × ${c1(D)} con cajonera`, -D / 2, h + 0.6, W * 0.3);
}
function tvUnit(wg, u0) {
  const f = state.furn, W = f.tvUnitW, D = f.tvUnitD, h = HEIGHTS.tvUnit;
  const t = new THREE.Group(); t.position.z = u0; wg.add(t);
  B(t, -D, 0, 0.02, h, 0, W, M.wood);
  const n = Math.max(2, Math.round(W / 0.6)), gap = 0.004;
  for (let i = 0; i < n; i++) B(t, -D - 0.018, -D, 0.03, h - 0.008, W * i / n + gap, W * (i + 1) / n - gap, M.wood);
  B(t, -D + 0.02, -0.02, 0, 0.02, 0.02, W - 0.02, M.dark, { cast: false });
  // Encima: planta, marcos, altavoz
  plant(t, -D / 2, W * 0.62, h, 0.9); photoFrame(t, -D / 2, h, W * 0.12, 0.13, 0.17, -Math.PI / 2 + 0.3);
  cyl(t, 0.06, 0.1, M.potGreen, -D / 2, h + 0.05, W * 0.85, 14); plant(t, -D / 2, W * 0.85, h + 0.05, 0.4);
  const d = fdims(t);
  adim(d, [-D - 0.06, h + 0.03, 0], [-D - 0.06, h + 0.03, W], `mueble TV ${c1(W)}`);
  adim(d, [-D, 0.05, W + 0.05], [0, 0.05, W + 0.05], `fondo ${c1(D)}`);
  tag(t, 'Mueble de TV', `${c1(W)} × ${c1(D)} × ${c1(h)}`, -D / 2, h + 0.15, W * 0.35);
  // TV colgada, centrada sobre el mueble
  const s = tvSize(f.tvIn), yc = HEIGHTS.tvCenter, zc = W / 2;
  const tv = new THREE.Group(); tv.position.set(-0.05, yc, zc); t.add(tv);
  B(tv, -0.03, 0, -s.h / 2 - 0.01, s.h / 2 + 0.01, -s.w / 2 - 0.006, s.w / 2 + 0.006, M.black);
  B(tv, -0.031, -0.03, -s.h / 2 + 0.004, s.h / 2 - 0.004, -s.w / 2 + 0.004, s.w / 2 - 0.004, M.screen, { cast: false });
  const glow = new THREE.RectAreaLight('#bcd0ff', 0, s.w, s.h); glow.position.set(-0.04, 0, 0); glow.rotation.y = Math.PI / 2; tv.add(glow);
  nightFx.push(l => { glow.intensity = l ? 2.2 : 0; M.screen.emissiveIntensity = l ? 0.55 : 0.0; });
  const dt = fdims(tv);
  adim(dt, [-0.05, s.h / 2 + 0.06, -s.w / 2], [-0.05, s.h / 2 + 0.06, s.w / 2], `TV ${f.tvIn}″ · ${c1(s.w)} × ${c1(s.h)}`);
  tag(tv, `TV ${f.tvIn}″`, `centro a ${c1(yc)} del suelo`, -0.1, s.h / 2 + 0.2, -s.w * 0.25);
  return { W, D, s };
}
function shelf(wg, u0) {
  const L = state.furn.shelfL, y = HEIGHTS.shelf, D = 0.22;
  const sh = new THREE.Group(); sh.position.z = u0; wg.add(sh);
  B(sh, -D, 0, y - 0.03, y, 0, L, M.wood);
  seed = 11;
  photoFrame(sh, -0.1, y, L * 0.06, 0.16, 0.2, -Math.PI / 2 + 0.2);
  plant(sh, -0.11, L * 0.2, y, 0.8);
  photoFrame(sh, -0.08, y, L * 0.42, 0.24, 0.3, -Math.PI / 2 + 0.1);
  { const b = new THREE.Group(); b.rotation.y = Math.PI / 2; b.position.set(-0.19, 0, L * 0.9); sh.add(b); for (let i = 0; i < 7; i++) B(b, -0.14 - rnd() * 0.02, 0.1, y + i * 0.035, y + i * 0.035 + 0.033, 0, 0.15 + rnd() * 0.03, M.book[i % M.book.length]); }
  const d = fdims(sh); adim(d, [-D - 0.03, y + 0.04, 0], [-D - 0.03, y + 0.04, L], `repisa ${c1(L)}`);
  tag(sh, 'Repisa', `${c1(L)} × ${c1(D)}`, -D / 2, y + 0.35, L * 0.62);
}
function pendant(g0, x, z) {
  const y = G.H - 0.62, g = new THREE.Group(); g0.add(g); pendantGroup = g;
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), M.paper); sph.position.set(x, y, z); sph.castShadow = false; g.add(sph);
  for (let i = 1; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.22 * Math.sin(i / 6 * Math.PI), 0.002, 4, 40), M.white); r.rotation.x = Math.PI / 2; r.position.set(x, y + 0.22 * Math.cos(i / 6 * Math.PI), z); g.add(r); }
  cyl(g, 0.003, G.H - y - 0.2, M.white, x, (G.H + y + 0.2) / 2, z, 4);
  const p = new THREE.PointLight('#ffd9a8', 0, 7, 2); p.position.set(x, y - 0.05, z); p.castShadow = true; p.shadow.mapSize.set(1024, 1024); p.shadow.bias = -0.002; g.add(p);
  nightFx.push(l => { p.intensity = l ? 5.5 : 0; M.paper.emissiveIntensity = l ? 1.4 : 0; });
}
/* ───────── Distribuciones ───────── */
let layoutGroup = null, layoutAnim = [], MET = {}, pendantGroup = null;
const nightFx = [];
function buildLayout() {
  if (layoutGroup) disposeGroup(layoutGroup);
  layoutGroup = new THREE.Group(); scene.add(layoutGroup);
  layoutAnim = []; nightFx.length = 0; seed = 3;
  const f = state.furn, { L, R, xR, ang, Wt } = G, lay = state.layout;
  const met = { layout: lay, obstacles: [] };

  // Sofá: su extremo coincide con el final de la pared (no sobresale hacia la cocina)
  const z1 = L, z0 = L - f.sofaL, chaiseAt = lay === 'B' ? 'start' : 'end';
  const so = sofa(layoutGroup, z0, z1, chaiseAt);
  met.sofa = { z0, z1, over: f.sofaL - L, ...so, chaiseAt };
  met.obstacles.push({ id: 'sofa', x0: 0, x1: so.D, z0: so.mz0, z1: so.mz1 }, { id: 'chaise', x0: 0, x1: so.CL, z0: so.cz0, z1: so.cz1 });

  // Pared de la TV
  const wg = new THREE.Group(); wg.position.set(Wt, 0, 0); wg.rotation.y = ang; layoutGroup.add(wg);
  desk(wg, 0.02);
  const uTv = Math.min(0.02 + f.deskW + 0.03, R - f.tvUnitW - 0.02);
  met.desk = { u0: 0.02, u1: 0.02 + f.deskW, d: f.deskD, overlap: 0.02 + f.deskW - uTv };
  met.obstacles.push({ id: 'desk', x0: xR(0) - f.deskD, x1: xR(0), z0: 0.02, z1: 0.02 + f.deskW });
  const tu = tvUnit(wg, uTv);
  met.tv = { u0: uTv, u1: uTv + f.tvUnitW, uc: uTv + f.tvUnitW / 2, D: f.tvUnitD, ...tu.s, overflow: uTv + f.tvUnitW - R };
  met.obstacles.push({ id: 'tvUnit', x0: xR(uTv) - f.tvUnitD, x1: xR(uTv), z0: uTv, z1: uTv + f.tvUnitW });
  const sc = (0.02 + f.deskW / 2 + met.tv.uc) / 2;   // repisa entre el escritorio y la TV
  const su0 = Math.max(0.03, Math.min(sc - f.shelfL / 2, R - f.shelfL - 0.03));
  shelf(wg, su0);
  met.shelf = { u0: su0, u1: su0 + f.shelfL };
  // Planta alta junto al mueble de la TV, si queda sitio
  if (met.tv.u1 + 0.22 <= R - 0.05) plant(wg, -0.22, met.tv.u1 + 0.22, 0, 1.15, true);

  // Mesa de centro delante del tramo normal del sofá
  const seatMid = (so.mz0 + so.mz1) / 2;
  const cx = so.D + 0.38 + f.coffeeW * 0.31;
  met.coffee = coffeeTable(layoutGroup, cx, lay === 'B' ? Math.max(seatMid, so.cz1 + 0.1 + f.coffeeW / 2) : seatMid - 0.05);
  met.obstacles.push({ id: 'coffee', ...met.coffee });

  // Alfombra bajo la mesa de centro
  if (M.rug) {
    const rx0 = so.D - 0.25, rx1 = Math.min(xR(0) - 0.6, rx0 + 1.6), rz0 = Math.max(0.05, met.coffee.z0 - 0.5), rz1 = Math.min(L - 0.05, met.coffee.z1 + 0.6);
    const rug = B(layoutGroup, rx0, rx1, 0, 0.012, rz0, rz1, M.rug, { cast: false });
  }

  pendant(layoutGroup, (so.D + xR(L / 2) - f.tvUnitD) / 2, L * 0.45);
  plant(layoutGroup, G.winX + 0.1, -G.nicheD + 0.14, 0, 0.8);

  /* Métricas para el panel */
  const eyeX = so.D * 0.5;                                  // ojos a media profundidad del asiento
  met.viewDist = xR(met.tv.uc) - 0.05 - eyeX;
  met.eyeTilt = Math.atan2(HEIGHTS.tvCenter - 1.08, met.viewDist) * 180 / Math.PI;
  // Paso entre la chaise y el mueble de la TV (lo que queda libre para pasar hacia la ventana)
  const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
  const gapX = (o) => { let best = Infinity; for (const b of met.obstacles) if (b !== o && b.x0 >= o.x1 - 0.01 && ov(o.z0, o.z1, b.z0, b.z1)) best = Math.min(best, b.x0 - o.x1); return best; };
  met.chaisePass = gapX(met.obstacles.find(o => o.id === 'chaise'));
  if (!Number.isFinite(met.chaisePass)) met.chaisePass = xR((so.cz0 + so.cz1) / 2) - so.CL;
  met.coffeePass = met.coffee.x0 - so.D;
  met.tvPass = (xR(met.tv.uc) - f.tvUnitD) - met.coffee.x1;
  if (met.desk) {
    // hueco para la silla del escritorio: hasta lo primero que haya delante
    const dx0 = xR(0) - f.deskD; let best = dx0;
    for (const b of met.obstacles) if (b.id !== 'desk' && b.x1 <= dx0 + 0.01 && ov(b.z0, b.z1, met.desk.u0, met.desk.u1)) best = Math.min(best, dx0 - b.x1);
    met.chairRoom = best;
  }
  // Apertura de las hojas de la balconera: ángulo máximo sin tocar nada
  met.leaves = leafClearance(met.obstacles);
  met.sofaWallFree = L - f.sofaL;
  MET = met;

  applyNightFx();
  syncAdims();
  renderInfo();
}
function leafClearance(obs) {
  const { glass0, glass1, nicheD } = G, lw = (glass1 - glass0 - 0.12) / 2, zb = -nicheD - 0.01;
  const hit = (x, z) => obs.find(b => x > b.x0 - 0.01 && x < b.x1 + 0.01 && z > b.z0 - 0.01 && z < b.z1 + 0.01);
  const leaf = (hx, sign) => {
    for (let a = 1; a <= 90; a++) {
      const r = a * Math.PI / 180;
      for (let t = 0.1; t <= 1.001; t += 0.1) { const b = hit(hx + sign * Math.cos(r) * lw * t, zb + Math.sin(r) * lw * t); if (b) return { a: a - 1, by: b.id }; }
    }
    return { a: 90, by: null };
  };
  const l = leaf(glass0 + 0.06, 1), r = leaf(glass1 - 0.06, -1);
  return { left: l.a, leftBy: l.by, right: r.a, rightBy: r.by, leafW: lw, reach: lw - nicheD };
}
const allAnim = () => roomAnim.concat(layoutAnim);

/* ───────── Panel ───────── */
function renderInfo() {
  const { items, checks } = panelInfo({ L: state.layout, met: MET, room: G, f: state.furn, fmt, cm, c1 });
  $('items').innerHTML = items.map(([n, d, w]) => `<div class="row"><span class="n">${n}</span><span class="d">${d}</span><span class="w">${w}</span></div>`).join('');
  $('checks').innerHTML = checks.map(([s, l, t, x]) => `<div class="check"><span class="pill ${s}">${l}</span><span class="t">${t}</span><span class="x">${x}</span></div>`).join('');
  $('st-area').textContent = `${fmt(G.area, 1)} m²`;
  $('st-size').textContent = `${fmt(G.Wb)} × ${fmt(G.L)}`;
  $('st-tv').textContent = `${fmt(MET.viewDist)} m`;
}

/* ───────── Día / noche ───────── */
function applyNightFx() { nightFx.forEach(fn => fn(state.night)); }
function applyNight() {
  const n = state.night;
  sun.intensity = n ? 0 : 3.6; hemi.intensity = n ? 0.03 : 0.35;
  scene.environmentIntensity = n ? 0.07 : 0.55;
  scene.background = new THREE.Color(n ? '#0d1116' : '#dfe4e2');
  stage.style.background = n ? '#0d1116' : '#dfe4e2';
  M.ground.color.set(n ? '#1a1e22' : '#c9ccc7'); M.outside.color.set(n ? '#1b2128' : '#dfe7e8');
  skyLights.children.forEach(l => l.intensity = n ? 0 : 3.4);
  bloom.enabled = n; applyNightFx();
  renderer.toneMappingExposure = n ? 1.2 : 0.9;
}

/* ───────── Cámara ───────── */
function views() {
  const { Wt, L, R, s, xR } = G, so = MET.sofa || { D: 0.9, mz0: 0, mz1: 1.5 };
  return {
    cocina: { p: [0.35, 1.62, Math.max(L, R) + 0.75], t: [Wt * 0.6, 0.95, 0.2], f: 64 },
    ventana: { p: [G.winX + G.winW * 0.35, 1.3, -G.nicheD + 0.08], t: [G.Wb * 0.42, 0.6, L + 0.9], f: 74 },
    tv: { p: [so.D * 0.5, 1.12, (so.mz0 + so.mz1) / 2], t: [xR(MET.tv?.uc || R / 2), 1.2, MET.tv?.uc || R / 2], f: 58 },
    iso: { p: [-2.6 * s, 5.2 * s, Math.max(L, R) + 3.3 * s], t: [Wt / 2, 0.45, L * 0.45], f: 38 },
    planta: { p: [Wt / 2, 9.5 * s, L / 2 + 0.01], t: [Wt / 2, 0, L / 2], f: 32 },
  };
}
let tween = null, currentView = 'iso';
function goView(name, instant = false) {
  const v = views()[name] || views().iso; currentView = name;
  document.querySelectorAll('.vbtn').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === name));
  const to = { p: new THREE.Vector3(...v.p), t: new THREE.Vector3(...v.t), f: v.f };
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(to.p); controls.target.copy(to.t); camera.fov = to.f; camera.updateProjectionMatrix(); return; }
  tween = { from: { p: camera.position.clone(), t: controls.target.clone(), f: camera.fov }, to, t0: performance.now(), dur: 1300 };
}

/* ───────── Corte de paredes (maqueta) ───────── */
const tmp = new THREE.Vector3();
function updateCutaway() {
  for (const w of walls) {
    if (w.fixed) continue;
    const hide = tmp.copy(camera.position).sub(w.p).dot(w.n) < -0.02;
    if (w.g.userData.hidden === hide) continue;
    w.g.userData.hidden = hide; w.g.visible = !hide;
  }
}

/* ───────── UI ───────── */
const $ = id => document.getElementById(id);
document.querySelectorAll('[data-layout]').forEach(b => b.onclick = () => { state.layout = b.dataset.layout; syncButtons(); buildLayout(); saveHash(); });
document.querySelectorAll('.vbtn').forEach(b => b.onclick = () => goView(b.dataset.view));
$('t-day').onclick = () => { state.night = false; $('t-day').setAttribute('aria-pressed', true); $('t-night').setAttribute('aria-pressed', false); applyNight(); };
$('t-night').onclick = () => { state.night = true; $('t-day').setAttribute('aria-pressed', false); $('t-night').setAttribute('aria-pressed', true); applyNight(); };
$('t-open').onclick = () => { state.open = !state.open; $('t-open').setAttribute('aria-pressed', state.open); };
$('t-dims').onclick = () => { state.dims = !state.dims; $('t-dims').setAttribute('aria-pressed', state.dims); };
$('t-tags').onclick = () => { state.tags = !state.tags; $('t-tags').setAttribute('aria-pressed', state.tags); scene.traverse(o => { if (o.isCSS2DObject && !o.element.classList.contains('dim')) o.visible = state.tags; }); };
function syncAdims() {
  layoutGroup && layoutGroup.traverse(o => { if (o.userData.adims) { o.visible = state.adims; o.children.forEach(c => { if (c.isCSS2DObject) c.visible = state.adims; }); } });
}
$('t-adims').onclick = () => { state.adims = !state.adims; $('t-adims').setAttribute('aria-pressed', state.adims); syncAdims(); };
$('t-rot').onclick = () => { state.rot = !state.rot; $('t-rot').setAttribute('aria-pressed', state.rot); controls.autoRotate = state.rot; };
$('t-hq').onclick = () => { state.hq = !state.hq; setQuality(); };
const flash = (text) => { const msg = $('copy-msg'); msg.textContent = text; msg.hidden = false; clearTimeout(msg._t); msg._t = setTimeout(() => { msg.hidden = true; }, 4000); };
$('copy-link').onclick = async () => {
  saveHash();
  try { await navigator.clipboard.writeText(location.href); flash('Enlace copiado'); } catch { flash(location.href); }
};
// Guardar la vista actual como PNG en alta calidad (hasta ~2400 px de ancho)
$('save-img').onclick = () => { flash('Preparando la imagen…'); setTimeout(saveImage, 30); };
function saveImage() {
  const w = stage.clientWidth, h = stage.clientHeight, hq = state.hq;
  const pr = Math.min(3, Math.max(1, (window.__salaSaveWidth || 2400) / w));   // el test usa un ancho menor
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(w, h);
  state.hq = true; frame(performance.now()); state.hq = hq;
  // La imagen lleva también las etiquetas y las medidas que se ven en pantalla
  const out = document.createElement('canvas'); out.width = renderer.domElement.width; out.height = renderer.domElement.height;
  const g = out.getContext('2d'); g.drawImage(renderer.domElement, 0, 0);
  drawLabels(g, out.width / w);
  out.toBlob(blob => {
    setQuality();
    if (!blob) { flash('No se pudo generar la imagen'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sala-3d-${(location.hash.slice(1) || 'diseno').replace(/[^\w.-]/g, '')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    flash('Imagen guardada con medidas y etiquetas');
  }, 'image/png');
}
// Copia en el lienzo las etiquetas HTML visibles (cotas y nombres) con sus colores y tipos de letra
function drawLabels(g, k) {
  const base = stage.getBoundingClientRect();
  const box = (el, cs) => {
    const r = el.getBoundingClientRect(), x = (r.left - base.left) * k, y = (r.top - base.top) * k, bw = r.width * k, bh = r.height * k;
    if (r.width === 0 || r.right < base.left || r.left > base.right || r.bottom < base.top || r.top > base.bottom) return false;
    const rad = (parseFloat(cs.borderTopLeftRadius) || 0) * k;
    g.beginPath(); g.roundRect(x, y, bw, bh, rad); g.fillStyle = cs.backgroundColor; g.fill();
    const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    if (bt > 0) { g.lineWidth = bt * k; g.strokeStyle = cs.borderTopColor; g.stroke(); }
    else if (bl > 0) { g.fillStyle = cs.borderLeftColor; g.fillRect(x, y, bl * k, bh); }
    return true;
  };
  const text = (el, cs) => {
    const r = el.getBoundingClientRect(), pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0, fs = parseFloat(cs.fontSize);
    g.font = `${cs.fontWeight} ${fs * k}px ${cs.fontFamily}`; g.fillStyle = cs.color; g.textBaseline = 'top';
    const lh = parseFloat(cs.lineHeight) || fs * 1.2;
    g.fillText(el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent, (r.left - base.left + pl) * k, (r.top - base.top + pt + (lh - fs) / 2) * k);
  };
  document.querySelectorAll('#labels > div').forEach(wrap => {
    if (wrap.style.display === 'none') return;
    const el = wrap.classList.contains('tag') || wrap.classList.contains('dim') ? wrap : wrap.firstElementChild || wrap;
    const cs = getComputedStyle(el);
    if (!box(el, cs)) return;
    if (el.classList.contains('tag')) el.querySelectorAll('b,span').forEach(c => text(c, getComputedStyle(c)));
    else text(el, cs);
  });
}
controls.addEventListener('start', () => { tween = null; });

/* ───────── Panel de acabados ───────── */
function thumbStyle(cat, o) {
  if (o.none) return 'background:repeating-linear-gradient(45deg,#2a3033 0 6px,#1c2124 6px 12px)';
  if (cat === 'sofa') return `background-color:${o.color};background-image:url(${THUMBS[o.tex] || ''});background-blend-mode:multiply;background-size:cover`;
  if (o.type === 'wood') return `background-color:${o.tint};background-image:url(${THUMBS.oak || ''});background-blend-mode:multiply;background-size:cover`;
  if (o.color && !o.tex) return `background:${o.color}`;
  return THUMBS[o.tex] ? `background-image:url(${THUMBS[o.tex]});background-size:cover` : 'background:#3a4043';
}
function renderFinishUI() {
  $('presets').innerHTML = PRESETS.map(p => {
    const on = Object.keys(p.fin).every(k => p.fin[k] === state.fin[k]);
    return `<button class="chip" data-preset="${p.id}" aria-pressed="${on}">${p.name}</button>`;
  }).join('');
  $('finishes').innerHTML = Object.entries(CATALOG).map(([cat, c]) => `
    <div class="fin-cat"><div class="fin-head"><span class="label">${c.label}</span><span class="fin-name">${opt(cat).name}</span></div>
    <div class="fin-grid" role="group" aria-label="${c.label}">${c.options.map(o => `<button class="sw-btn" data-cat="${cat}" data-id="${o.id}" aria-pressed="${state.fin[cat] === o.id}" title="${o.name}" aria-label="${c.label}: ${o.name}"><i style="${thumbStyle(cat, o)}"></i></button>`).join('')}</div></div>`).join('');
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { state.fin = { ...PRESETS.find(p => p.id === b.dataset.preset).fin }; applyAll(); });
  document.querySelectorAll('.sw-btn').forEach(b => b.onclick = () => { state.fin[b.dataset.cat] = b.dataset.id; applyAll(); });
}
function applyAll() { applyFinishes(); buildLayout(); renderFinishUI(); saveHash(); }
function syncButtons() {
  document.querySelectorAll('[data-layout]').forEach(x => x.setAttribute('aria-pressed', x.dataset.layout === state.layout));
  $('t-hq').setAttribute('aria-pressed', state.hq);
  $('t-tags').setAttribute('aria-pressed', state.tags);
}
function setQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.hq ? 2 : 1.25));
  const s = state.hq ? 4096 : 2048; sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  resize(); syncButtons();
}

/* ───────── Mis medidas ───────── */
const FIELDS = [
  ['Wt', 'Ancho junto a la ventana'], ['Wb', 'Ancho junto a la cocina'], ['L', 'Pared del sofá'], ['R', 'Pared de la TV'],
  ['winX', 'Esquina → nicho'], ['winW', 'Nicho: ancho'], ['nicheD', 'Nicho: fondo'], ['frame', 'Pared a cada lado'], ['H', 'Altura del techo'],
];
const FFIELDS = [
  ['sofaL', 'Sofá: largo'], ['sofaD', 'Sofá: fondo'], ['chaiseL', 'Chaise: largo'], ['coffeeW', 'Mesa de centro'],
  ['deskW', 'Escritorio: ancho'], ['deskD', 'Escritorio: fondo'], ['tvUnitW', 'Mueble TV: ancho'], ['tvUnitD', 'Mueble TV: fondo'],
  ['tvIn', 'TV'], ['shelfL', 'Repisa: largo'],
];
const isIn = k => k === 'tvIn';
function roomForm() {
  const form = $('room-form');
  const field = (k, label, lim, step) => `<label class="m-field" data-k="${k}"><span>${label}</span><span class="m-in"><input type="number" id="m-${k}" inputmode="decimal" step="${step}" min="${isIn(k) ? lim[0] : Math.round(lim[0] * 100)}" max="${isIn(k) ? lim[1] : Math.round(lim[1] * 100)}"><em>${isIn(k) ? 'pulg.' : 'cm'}</em></span></label>`;
  $('m-fields').innerHTML = FIELDS.map(([k, label]) => field(k, label, ROOM_LIMITS[k], 0.5)).join('');
  $('f-fields').innerHTML = FFIELDS.map(([k, label]) => field(k, label, FURNITURE_LIMITS[k], isIn(k) ? 1 : 0.5)).join('');
  const val = k => { const v = parseFloat(String($(`m-${k}`).value).replace(',', '.')) || 0; return isIn(k) ? v : v / 100; };
  const show = v => String(Math.round(v * 1000) / 10).replace('.', ',');
  const fill = (r, f = state.furn) => { FIELDS.forEach(([k]) => { $(`m-${k}`).value = Math.round(r[k] * 1000) / 10; }); FFIELDS.forEach(([k]) => { $(`m-${k}`).value = isIn(k) ? f[k] : Math.round(f[k] * 1000) / 10; }); };
  const read = () => Object.fromEntries(FIELDS.map(([k]) => [k, val(k)]));
  const readF = () => Object.fromEntries(FFIELDS.map(([k]) => [k, val(k)]));
  let focusKey = null;
  const draw = () => drawPlan(read(), focusKey);
  form.addEventListener('input', draw);
  form.addEventListener('focusin', e => { focusKey = e.target.id?.slice(2) || null; draw(); });
  form.addEventListener('focusout', () => { focusKey = null; draw(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const { room, notes } = sanitizeRoom(read());
    const furn = sanitizeFurniture(readF());
    const clamped = FFIELDS.some(([k]) => Math.abs(furn[k] - readF()[k]) > 0.0005);
    setRoom(room, furn); fill(room, furn); draw();
    $('m-msg').textContent = [...notes, clamped ? 'Alguna medida de mueble estaba fuera de rango y la he ajustado.' : ''].filter(Boolean).join(' ') || 'Medidas aplicadas.';
  });
  $('m-reset').onclick = () => { setRoom({ ...DEFAULT_ROOM }, { ...DEFAULT_FURNITURE }); fill(state.room, state.furn); draw(); $('m-msg').textContent = 'Vuelven las medidas originales.'; };
  fill(state.room); draw();
  void show;
  return { fill, draw };
}
// Plano en planta (SVG) que se actualiza mientras se escriben las medidas
function drawPlan(r, focusKey) {
  const g = computeRoom(sanitizeRoom(r).room), padL = 44, padR = 44, padT = 26, padB = 26, vw = 320, vh = 220;
  const spanX = Math.max(g.Wt, g.Wb), spanZ = g.zMax + g.nicheD;
  const k = Math.min((vw - padL - padR) / spanX, (vh - padT - padB) / spanZ);
  const ox = padL + ((vw - padL - padR) - spanX * k) / 2, oy = padT + ((vh - padT - padB) - spanZ * k) / 2 + g.nicheD * k;
  const X = x => ox + x * k, Y = z => oy + z * k;
  const on = key => focusKey === key ? ' on' : '';
  const seg = (key, x0, z0, x1, z1, cls = 'w') => `<line class="${cls}${on(key)}" x1="${X(x0)}" y1="${Y(z0)}" x2="${X(x1)}" y2="${Y(z1)}"/>`;
  const txt = (key, x, z, t, anchor = 'middle') => `<text class="t${on(key)}" x="${x}" y="${z}" text-anchor="${anchor}">${t}</text>`;
  const nx0 = g.winX, nx1 = g.winX + g.winW, zb = -g.nicheD;
  const pts = [[0, 0], [nx0, 0], [nx0, zb], [nx1, zb], [nx1, 0], [g.Wt, 0], [g.xR(g.R), g.R], [g.xR(g.L), g.L], [0, g.L]];
  let s = `<polygon class="fl" points="${pts.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ')}"/>`;
  s += seg('winX', 0, 0, nx0, 0) + seg('nicheD', nx0, 0, nx0, zb) + seg('nicheD', nx1, zb, nx1, 0) + seg('Wt', nx1, 0, g.Wt, 0);
  s += seg('frame', nx0, zb, g.glass0, zb) + seg('frame', g.glass1, zb, nx1, zb) + seg('winW', g.glass0, zb, g.glass1, zb, 'gl');
  s += seg('L', 0, 0, 0, g.L) + seg('R', g.Wt, 0, g.xR(g.R), g.R);
  s += seg('Wb', 0, g.L, g.xR(g.L), g.L, 'op');
  s += txt('Wt', X(g.Wt / 2), Y(zb) - 8, fmt(g.Wt)) + txt('L', X(0) - 7, Y(g.L / 2), fmt(g.L), 'end') + txt('R', X(g.xR(g.R)) + 7, Y(g.R / 2), fmt(g.R), 'start');
  s += txt('Wb', X(g.Wb / 2), Y(g.L) + 15, `${fmt(g.Wb)} · cocina`);
  s += txt('winW', X((nx0 + nx1) / 2), Y(zb) + 14, 'ventana');
  $('room-svg').innerHTML = s;
}
function setRoom(room, furn = state.furn) {
  state.room = { ...room }; state.furn = { ...furn };
  G = computeRoom(state.room);
  buildRoom(); buildLayout(); applyNight(); saveHash(); goView(currentView, true);
}

/* ───────── Enlace compartible: #A.00000[.m313-316-…][.f240-90-…] ───────── */
const CATS = Object.keys(CATALOG), RKEYS = Object.keys(DEFAULT_ROOM), FKEYS = Object.keys(DEFAULT_FURNITURE);
const enc = (k, v) => isIn(k) ? Math.round(v) : Math.round(v * 1000);   // milímetros (TV en pulgadas)
const dec = (k, n) => isIn(k) ? n : n / 1000;
function saveHash() {
  const code = CATS.map(c => Math.max(0, CATALOG[c].options.findIndex(o => o.id === state.fin[c]))).join('');
  const parts = [state.layout, code];
  if (RKEYS.some(k => enc(k, state.room[k]) !== enc(k, DEFAULT_ROOM[k]))) parts.push('m' + RKEYS.map(k => enc(k, state.room[k])).join('-'));
  if (FKEYS.some(k => enc(k, state.furn[k]) !== enc(k, DEFAULT_FURNITURE[k]))) parts.push('f' + FKEYS.map(k => enc(k, state.furn[k])).join('-'));
  try { history.replaceState(null, '', '#' + parts.join('.')); } catch { }
}
function loadHash(h) {
  const m = /^([AB])\.([0-3]{5})(?:\.m([\d-]+))?(?:\.f([\d-]+))?$/.exec(h);
  if (!m) return false;
  state.layout = m[1];
  CATS.forEach((c, i) => { state.fin[c] = CATALOG[c].options[+m[2][i]].id; });
  if (m[3]) { const v = m[3].split('-').map(Number); if (v.length === RKEYS.length && v.every(Number.isFinite)) state.room = sanitizeRoom(Object.fromEntries(RKEYS.map((k, i) => [k, dec(k, v[i])]))).room; }
  if (m[4]) { const v = m[4].split('-').map(Number); if (v.length && v.length <= FKEYS.length && v.every(Number.isFinite)) state.furn = sanitizeFurniture(Object.fromEntries(v.map((n, i) => [FKEYS[i], dec(FKEYS[i], n)]))); }
  return true;
}

/* ───────── Bucle ───────── */
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  labelRenderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
let openP = 0, last = performance.now();
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function loop(now) {
  if (window.__salaPaused) { requestAnimationFrame(loop); return; }   // usado por la prueba automática
  frame(now);
  requestAnimationFrame(loop);
}
function inside(p) { return p.y < G.H - 0.02 && p.x > 0 && p.x < G.xR(Math.max(0, p.z)) && p.z > -G.nicheD && p.z < G.L; }
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tween) {
    const k = ease(Math.min(1, (now - tween.t0) / tween.dur));
    camera.position.lerpVectors(tween.from.p, tween.to.p, k); controls.target.lerpVectors(tween.from.t, tween.to.t, k);
    camera.fov = tween.from.f + (tween.to.f - tween.from.f) * k; camera.updateProjectionMatrix();
    if (k >= 1) tween = null;
  }
  const target = state.open ? 1 : 0;
  if (openP !== target) {
    openP += Math.sign(target - openP) * dt * 0.9; openP = Math.max(0, Math.min(1, openP));
    applyOpen();
  }
  controls.update(); updateCutaway();
  if (pendantGroup) pendantGroup.visible = camera.position.y < 6;   // en planta no tapa la mesa
  ceiling.visible = camera.position.y < G.H;
  const showDims = state.dims && camera.position.y > 2.8;
  if (dims) { dims.visible = showDims; dims.children.forEach(c => { if (c.isCSS2DObject) c.visible = showDims; }); }
  if (state.hq) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
// Las hojas se abren solo hasta donde les dejan los muebles
function applyOpen() {
  const k = ease(openP), lim = MET.leaves || { left: 90, right: 90 };
  allAnim().forEach((a, i) => {
    const maxA = i === 0 ? lim.left : i === 1 ? lim.right : 90;
    const open = Math.sign(a.open) * Math.min(Math.abs(a.open), maxA * Math.PI / 180);
    a.obj[a.key] = a.closed + (open - a.closed) * k;
  });
}

/* ───────── Arranque ───────── */
const hash = location.hash.slice(1);
if (!loadHash(hash) && ['A', 'B'].includes(hash)) state.layout = hash;
G = computeRoom(state.room);
syncButtons(); applyFinishes(); renderFinishUI(); buildRoom(); buildLayout(); applyNight(); setQuality();
const form = roomForm();
goView(['cocina', 'ventana', 'tv', 'iso', 'planta'].includes(hash) ? hash : 'iso', true);
requestAnimationFrame(t => { last = t; loop(t); setTimeout(() => $('loading').classList.add('gone'), 150); });
warmUp(() => renderFinishUI());
window.__sala = {
  frame: () => frame(performance.now()), passes: { gtao, bloom }, state, goView, buildLayout, applyNight, applyAll, setQuality,
  setRoom: (r, f) => { setRoom(sanitizeRoom({ ...state.room, ...r }).room, sanitizeFurniture({ ...state.furn, ...(f || {}) })); form.fill(state.room, state.furn); form.draw(); },
  metrics: () => MET, room: () => G,
  setOpen(v) { state.open = v; openP = v ? 1 : 0; applyOpen(); },
};
