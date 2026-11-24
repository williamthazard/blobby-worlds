// ============================================================
// world.js - zero-GC terrain math, sculpted chunk streamer,
// PBR props, depth-aware water tiles, spatial colliders & sky.
//
// Exports (globals):
//   WATER_Y, CHUNK, VIEW_RADIUS, DAY_SKY_MAX_LIT,
//   hash2, noise2, smoothstep, heightAt, terrainNormalAt,
//   climateAt, surfaceAt, terrainColor,
//   getNearbyColliders, setTotemCollider, clearTotemCollider,
//   scene, camera, renderer, sun, hemiLight,
//   updateChunks, setQuality, getQuality,
//   setSkyProgress, updateEnvironment,
//   CONSTELLATIONS, addConstellation, constellationNameFor,
//   landSpot, waterSpot
// ============================================================

'use strict';

// ---------- world constants & pure zero-GC math ----------

const WATER_Y = 0;
const CHUNK = 32;
const VIEW_RADIUS = 3;
const DAY_SKY_MAX_LIT = 8;

const HALF_CHUNK = CHUNK * 0.5;
const CHUNK_STRIDE = 65536;
const CHUNK_OFFSET = 32768;

function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  const sx = x - fx, sz = z - fz;
  const ux = sx * sx * (3 - 2 * sx);
  const uz = sz * sz * (3 - 2 * sz);
  const a = hash2(fx, fz),     b = hash2(fx + 1, fz);
  const c = hash2(fx, fz + 1), d = hash2(fx + 1, fz + 1);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uz;
}

function smoothstep(edge0, edge1, t) {
  const k = Math.min(1, Math.max(0, (t - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
}

// Continuous procedural heightfield with zero Map/string allocations.
function heightAt(x, z) {
  const cont = noise2(x * 0.004, z * 0.004);
  const hills = noise2(x * 0.018, z * 0.018) * 0.65 + noise2(x * 0.06, z * 0.06) * 0.35;
  const climate = noise2(x * 0.004 + 37, z * 0.004 - 91);

  let h = (cont - 0.42) * 30;
  const landness = smoothstep(-0.5, 2.5, h);
  h += (hills - 0.5) * 12 * landness;

  const mountainW = smoothstep(0.60, 0.76, climate) * landness;
  if (mountainW > 0.01) {
    const ridge = 1 - Math.abs(2 * noise2(x * 0.03 + 7, z * 0.03 - 7) - 1);
    h += ridge * ridge * 20 * mountainW;
  }

  const desertW = smoothstep(0.36, 0.24, climate) * landness;
  if (desertW > 0.01) {
    const dune = Math.sin(x * 0.18) + Math.sin(z * 0.15 + 2);
    h = h * (1 - desertW * 0.5) + dune * 1.6 * desertW;
  }

  if (typeof Regions !== 'undefined' && typeof Regions.getElevationMod === 'function') {
    h = Regions.getElevationMod(x, z, h);
  }
  return h;
}

function terrainNormalAt(x, z, out) {
  if (!out) out = { x: 0, y: 1, z: 0 };
  const eps = 0.15;
  const dhx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const dhz = heightAt(x, z + eps) - heightAt(x, z - eps);
  const nx = -dhx / (2 * eps);
  const nz = -dhz / (2 * eps);
  const invLen = 1 / Math.hypot(nx, 1, nz);
  out.x = nx * invLen;
  out.y = invLen;
  out.z = nz * invLen;
  return out;
}

function climateAt(x, z, out) {
  if (!out) out = { desert: 0, snow: 0, forest: 0, meadow: 0 };
  const climate = noise2(x * 0.004 + 37, z * 0.004 - 91);
  const woods = noise2(x * 0.01 - 200, z * 0.01 + 300);
  const desert = smoothstep(0.36, 0.26, climate);
  const snow = smoothstep(0.64, 0.74, climate);
  const nonExtreme = (1 - desert) * (1 - snow);
  const forestRaw = smoothstep(0.52, 0.64, woods);
  out.desert = desert;
  out.snow = snow;
  out.forest = forestRaw * nonExtreme;
  out.meadow = (1 - forestRaw) * nonExtreme;
  if (typeof Regions !== 'undefined' && typeof Regions.getClimateMod === 'function') {
    Regions.getClimateMod(x, z, out);
  }
  return out;
}

const _surfNorm = { x: 0, y: 1, z: 0 };
const _surfClimate = { desert: 0, snow: 0, forest: 0, meadow: 0 };

function surfaceAt(x, z) {
  const h = heightAt(x, z);
  if (h < WATER_Y + 0.15) return 'water';
  terrainNormalAt(x, z, _surfNorm);
  if (_surfNorm.y < 0.78) return 'stone';
  climateAt(x, z, _surfClimate);
  if (h > 13.5 || _surfClimate.snow > 0.55) return 'snow';
  if (h < WATER_Y + 1.55 || _surfClimate.desert > 0.45) return 'sand';
  if (h > 6.5 && _surfClimate.snow > 0.2) return 'stone';
  return 'grass';
}

// ---------- spatial collider grid ----------

const chunks = new Map();
const _totemCollider = { x: 0, z: 0, r: 0 };
let _hasTotemCollider = false;

function chunkKey(cx, cz) {
  return (cx + CHUNK_OFFSET) * CHUNK_STRIDE + (cz + CHUNK_OFFSET);
}

function setTotemCollider(x, z, r = 0.9) {
  _totemCollider.x = x;
  _totemCollider.z = z;
  _totemCollider.r = r;
  _totemCollider.topY = heightAt(x, z) + 3.6;
  _totemCollider.standable = true;
  _hasTotemCollider = true;
}

function clearTotemCollider() {
  _hasTotemCollider = false;
}

function getNearbyColliders(x, z, radius, out) {
  if (!out) out = [];
  out.length = 0;
  const pad = radius + 2.2;
  const minCx = Math.floor((x - pad + HALF_CHUNK) / CHUNK);
  const maxCx = Math.floor((x + pad + HALF_CHUNK) / CHUNK);
  const minCz = Math.floor((z - pad + HALF_CHUNK) / CHUNK);
  const maxCz = Math.floor((z + pad + HALF_CHUNK) / CHUNK);

  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      const chunk = chunks.get(chunkKey(cx, cz));
      if (!chunk) continue;
      const cols = chunk.colliders;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const dx = c.x - x;
        const dz = c.z - z;
        const limit = radius + c.r;
        if (dx * dx + dz * dz <= limit * limit) {
          out.push(c);
        }
      }
    }
  }

  if (_hasTotemCollider) {
    const dx = _totemCollider.x - x;
    const dz = _totemCollider.z - z;
    const limit = radius + _totemCollider.r;
    if (dx * dx + dz * dz <= limit * limit) {
      out.push(_totemCollider);
    }
  }

  if (typeof Regions !== 'undefined' && typeof Regions.getNearbyColliders === 'function') {
    Regions.getNearbyColliders(x, z, radius, out);
  }

  return out;
}

// ---------- named constellations & spawn helpers ----------

const CONSTELLATIONS = [
  { name: 'The Great Bear', pts: [[0, 0], [0.4, 0], [0.45, 0.3], [0.05, 0.32], [-0.3, 0.4], [-0.55, 0.55], [-0.8, 0.6]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
  { name: 'The Fox', pts: [[0.6, 0.4], [0.2, 0.6], [-0.1, 0.2], [0.2, -0.2], [0.6, 0], [-0.4, -0.1], [-0.8, -0.45]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [5, 6]] },
  { name: 'The Crown', pts: [[-0.6, 0], [-0.4, 0.5], [0, 0.8], [0.4, 0.5], [0.6, 0]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  { name: 'The Swordfish', pts: [[0, 0.5], [0.4, 0], [0, -0.5], [-0.4, 0], [-0.7, -0.3], [-1, -0.5]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5]] },
  { name: 'The Arrow', pts: [[0, -0.6], [0, 0.2], [-0.5, 0.6], [0, 0.9], [0.5, 0.6]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
  { name: 'The Swan', pts: [[0, -0.7], [0, 0.9], [-0.55, 0.2], [0.55, -0.2], [0, 0.2]],
    edges: [[0, 1], [2, 4], [4, 3]] },
  { name: 'The Lantern', pts: [[-0.3, -0.5], [-0.3, 0.2], [0, 0.6], [0.3, 0.2], [0.3, -0.5]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  { name: 'The Whale', pts: [[-0.8, 0], [-0.3, 0.35], [0.4, 0.3], [0.8, 0], [0.4, -0.35], [-0.2, -0.3], [-1, 0.35], [-1, -0.25]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [0, 7]] },
];

const ROTATION = CONSTELLATIONS.filter(s => s.name !== 'The Lantern');
function constellationNameFor(n) {
  return ROTATION[(n - 1) % ROTATION.length].name;
}

function spotAround(px, pz, minD, maxD, filter) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    const x = px + Math.cos(a) * d;
    const z = pz + Math.sin(a) * d;
    const h = heightAt(x, z);
    if (filter(h)) return { x, z, h };
  }
  return null;
}
const landSpot  = (px, pz, minD, maxD, minH = 0.6) => spotAround(px, pz, minD, maxD, h => h >= minH);
const waterSpot = (px, pz, minD, maxD)            => spotAround(px, pz, minD, maxD, h => h <= WATER_Y - 1.6);

// ---------- Three.js globals (initialized when WebGL world loads) ----------

let scene = null;
let camera = null;
let renderer = null;
let hemiLight = null;
let sun = null;
let terrainColor = null;
let updateChunks = () => {};
let setQuality = () => {};
let getQuality = () => 'high';
let setSkyProgress = () => {};
let getSkyProgress = () => 0;
let updateEnvironment = () => {};
let addConstellation = () => {};
let worldLandmarks = null;

if (typeof __WORLD_MATH_ONLY__ === 'undefined') {
  // ---------- scene, renderer & lighting ----------

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2745);
  scene.fog = new THREE.Fog(0x3a4a6a, 38, 118);

  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  let qualityMode = 'high';
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  if (typeof Textures !== 'undefined' && typeof Textures.init === 'function') {
    Textures.init(renderer);
  }

  hemiLight = new THREE.HemisphereLight(0x9db8d9, 0x3b483d, 0.52);
  scene.add(hemiLight);

  const SUN_SHADOW_SPAN = 72;
  const _sunDir = new THREE.Vector3(0.45, 0.62, 0.38).normalize();
  sun = new THREE.DirectionalLight(0xffdfb0, 0.82);
  sun.position.set(_sunDir.x * 75, _sunDir.y * 75, _sunDir.z * 75);
  sun.castShadow = true;

  const maxTexSize = (renderer.capabilities && renderer.capabilities.maxTextureSize)
    ? renderer.capabilities.maxTextureSize
    : 2048;
  const initShadowRes = Math.min(2048, maxTexSize);
  sun.shadow.mapSize.set(initShadowRes, initShadowRes);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.left = -SUN_SHADOW_SPAN * 0.5;
  sun.shadow.camera.right = SUN_SHADOW_SPAN * 0.5;
  sun.shadow.camera.top = SUN_SHADOW_SPAN * 0.5;
  sun.shadow.camera.bottom = -SUN_SHADOW_SPAN * 0.5;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---------- terrain colours (grounded Lake Hylia natural palette + dirt paths) ----------

  const PAL = {
    deepSea: new THREE.Color(0x183c4c),
    seabed:  new THREE.Color(0xb6a376),
    beach:   new THREE.Color(0xdcc898),
    desert:  new THREE.Color(0xd08e54),
    meadow:  new THREE.Color(0x5c8438),
    forest:  new THREE.Color(0x2b552e),
    alpine:  new THREE.Color(0x526b46),
    snow:    new THREE.Color(0xe6edf4),
    rock:    new THREE.Color(0x7c7063),
    dirt:    new THREE.Color(0xb69c72),
  };
  const _tcClimate = { desert: 0, snow: 0, forest: 0, meadow: 0 };

  terrainColor = function terrainColorImpl(x, z, h, out) {
    if (!out) out = new THREE.Color();
    const c = climateAt(x, z, _tcClimate);
    const jitter = (hash2(x * 3.7, z * 3.7) - 0.5) * 0.055;

    if (h < WATER_Y - 1.5)      out.copy(PAL.deepSea).lerp(PAL.seabed, smoothstep(-10, -1.8, h));
    else if (h < WATER_Y + 0.9) out.copy(PAL.seabed).lerp(PAL.beach, smoothstep(-0.5, 0.65, h));
    else if (h < WATER_Y + 2)   out.copy(PAL.beach).lerp(PAL.meadow, (h - 0.9) / 1.1);
    else {
      out.copy(PAL.meadow);
      out.lerp(PAL.forest, c.forest);
      out.lerp(PAL.desert, c.desert);
      out.lerp(PAL.alpine, c.snow * 0.68);
      if (h > 12.5) out.lerp(PAL.snow, smoothstep(12.5, 16.5, h));
      if (h > 5)    out.lerp(PAL.rock, smoothstep(5, 9, h) * 0.30 * c.snow);
    }

    if (h > WATER_Y + 0.65 && typeof Regions !== 'undefined' && typeof Regions.getTrailWeight === 'function') {
      const tw = Regions.getTrailWeight(x, z);
      if (tw > 0.01) out.lerp(PAL.dirt, tw * 0.86);
    }

    out.offsetHSL(0, 0, jitter);
    if (typeof out.convertSRGBToLinear === 'function') out.convertSRGBToLinear();
    return out;
  };

  // ---------- sculpted shared geometry builders ----------

  function ensureVertexColors(geo, r = 1, g = 1, b = 1) {
    if (geo.attributes.color) return geo;
    const count = geo.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  function mergeGeometries(geoms) {
    let totalVerts = 0;
    let totalIndices = 0;
    let hasColors = false;
    for (let g = 0; g < geoms.length; g++) {
      const geo = geoms[g];
      if (geo.attributes.color) hasColors = true;
      totalVerts += geo.attributes.position.count;
      totalIndices += geo.index ? geo.index.count : geo.attributes.position.count;
    }

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const uv = new Float32Array(totalVerts * 2);
    const col = hasColors ? new Float32Array(totalVerts * 3) : null;
    const idx = new Uint16Array(totalIndices);

    let vOff = 0;
    let iOff = 0;
    for (let g = 0; g < geoms.length; g++) {
      const geo = geoms[g];
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const pAttr = geo.attributes.position;
      const nAttr = geo.attributes.normal;
      const uAttr = geo.attributes.uv;
      const cAttr = geo.attributes.color;
      const count = pAttr.count;

      pos.set(pAttr.array, vOff * 3);
      norm.set(nAttr.array, vOff * 3);
      if (uAttr) {
        uv.set(uAttr.array, vOff * 2);
      }
      if (col) {
        if (cAttr) {
          col.set(cAttr.array, vOff * 3);
        } else {
          for (let k = 0; k < count * 3; k++) col[vOff * 3 + k] = 1;
        }
      }

      if (geo.index) {
        const srcIdx = geo.index.array;
        for (let k = 0; k < srcIdx.length; k++) {
          idx[iOff + k] = srcIdx[k] + vOff;
        }
        iOff += srcIdx.length;
      } else {
        for (let k = 0; k < count; k++) {
          idx[iOff + k] = vOff + k;
        }
        iOff += count;
      }
      vOff += count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    merged.setIndex(new THREE.BufferAttribute(idx, 1));
    return merged;
  }

  function buildFlaredTrunkGeo() {
    // Towering Lake Hylia-scale tree trunk (~6.2u main bole + 5 high overarching boughs reaching ~8.5u!)
    const parts = [];
    const main = new THREE.CylinderGeometry(0.20, 0.48, 6.2, 8, 6);
    main.translate(0, 3.1, 0);
    const pos = main.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const angle = Math.atan2(z, x);
      const rootFlare = y < 1.35 ? 1 + (1.35 - y) * (0.48 + 0.22 * Math.cos(angle * 4)) : 1;
      const sway = Math.sin(y * 0.65) * 0.095;
      pos.setXYZ(i, x * rootFlare + sway, y, z * rootFlare);
      const ao = 0.56 + 0.44 * Math.min(1, y / 3.2);
      cols[i * 3] = ao;
      cols[i * 3 + 1] = ao * 0.97;
      cols[i * 3 + 2] = ao * 0.92;
    }
    main.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    main.computeVertexNormals();
    parts.push(main);

    // 5 high arching wooden boughs spreading overhead into the sunlit canopy!
    const boughs = [
      { ang: 0.25, y0: 4.35, len: 2.55, tilt: 0.72, r0: 0.16, r1: 0.065 },
      { ang: 1.50, y0: 4.75, len: 2.35, tilt: 0.66, r0: 0.15, r1: 0.060 },
      { ang: 2.75, y0: 4.50, len: 2.45, tilt: 0.74, r0: 0.155, r1: 0.062 },
      { ang: 4.05, y0: 5.00, len: 2.25, tilt: 0.62, r0: 0.145, r1: 0.058 },
      { ang: 5.30, y0: 5.35, len: 2.10, tilt: 0.54, r0: 0.135, r1: 0.055 },
    ];
    for (let b = 0; b < boughs.length; b++) {
      const br = boughs[b];
      const bg = new THREE.CylinderGeometry(br.r1, br.r0, br.len, 6, 2);
      bg.translate(0, br.len * 0.5, 0);
      const bp = bg.attributes.position;
      const bc = new Float32Array(bp.count * 3);
      const ct = Math.cos(br.tilt);
      const st = Math.sin(br.tilt);
      const ca = Math.cos(br.ang);
      const sa = Math.sin(br.ang);
      for (let i = 0; i < bp.count; i++) {
        const lx = bp.getX(i);
        const ly = bp.getY(i);
        const lz = bp.getZ(i);
        const tx = lx * ct + ly * st;
        const ty = -lx * st + ly * ct + br.y0;
        const tz = lz;
        const wx = tx * ca - tz * sa;
        const wz = tx * sa + tz * ca;
        bp.setXYZ(i, wx, ty, wz);
        const shade = 0.70 + 0.26 * (ly / br.len);
        bc[i * 3] = shade;
        bc[i * 3 + 1] = shade * 0.96;
        bc[i * 3 + 2] = shade * 0.90;
      }
      bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
      bg.computeVertexNormals();
      parts.push(bg);
    }
    return mergeGeometries(parts);
  }

  // Builds a curved 2x2 alpha-cutout foliage card with smooth spherical canopy normals (Zelda/Ghibli style!)
  function buildCurvedLeafCard(w, h, bend, ox, oy, oz, yaw, pitch, roll, centerY, shadeR, shadeG, shadeB) {
    const pos = new Float32Array(9 * 3);
    const norm = new Float32Array(9 * 3);
    const uv = new Float32Array(9 * 2);
    const col = new Float32Array(9 * 3);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);

    let vi = 0;
    for (let iy = 0; iy < 3; iy++) {
      const v = iy * 0.5; // 0 (bottom) .. 1 (top)
      const ly = (v - 0.5) * h;
      for (let ix = 0; ix < 3; ix++) {
        const u = ix * 0.5;
        const lx = (u - 0.5) * w;
        // Subtle convex cup curve so leaf sprig never looks paper-flat from any angle
        const dx = u - 0.5;
        const dy = v - 0.5;
        const lz = bend * (0.25 - dx * dx - dy * dy);

        // Apply roll (Z), pitch (X), yaw (Y)
        const x1 = lx * cr - ly * sr;
        const y1 = lx * sr + ly * cr;
        const z1 = lz;

        const x2 = x1;
        const y2 = y1 * cp - z1 * sp;
        const z2 = y1 * sp + z1 * cp;

        const wx = x2 * cy + z2 * sy + ox;
        const wy = y2 + oy;
        const wz = -x2 * sy + z2 * cy + oz;

        pos[vi * 3] = wx;
        pos[vi * 3 + 1] = wy;
        pos[vi * 3 + 2] = wz;

        // Smooth outward canopy normal so light wraps softly across individual leaves
        const nx = wx;
        const ny = (wy - centerY) + 0.55;
        const nz = wz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        norm[vi * 3] = nx / nl;
        norm[vi * 3 + 1] = ny / nl;
        norm[vi * 3 + 2] = nz / nl;

        uv[vi * 2] = u;
        uv[vi * 2 + 1] = v;

        const sunLift = 0.74 + 0.34 * smoothstep(centerY - 1.2, centerY + 1.35, wy);
        col[vi * 3] = shadeR * sunLift;
        col[vi * 3 + 1] = shadeG * sunLift;
        col[vi * 3 + 2] = shadeB * sunLift;
        vi++;
      }
    }

    const idx = new Uint16Array([
      0, 1, 3, 1, 4, 3,
      1, 2, 4, 2, 5, 4,
      3, 4, 6, 4, 7, 6,
      4, 5, 7, 5, 8, 7,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  function buildOakCanopyGeo() {
    // Broad towering sunlit oak canopy (y = 5.4..10.4u) casting dappled leafy shadows across the meadow!
    const parts = [];
    const centerY = 7.4;
    const rings = [
      { count: 12, rad: 3.10, y: 5.75, cardW: 2.95, cardH: 2.75, pitch: 0.44 },
      { count: 12, rad: 2.65, y: 7.25, cardW: 3.05, cardH: 2.85, pitch: 0.12 },
      { count: 9,  rad: 1.75, y: 8.55, cardW: 2.80, cardH: 2.60, pitch: -0.42 },
      { count: 5,  rad: 0.65, y: 9.55, cardW: 2.55, cardH: 2.40, pitch: -1.08 },
    ];
    let seed = 1;
    for (let r = 0; r < rings.length; r++) {
      const rg = rings[r];
      for (let i = 0; i < rg.count; i++) {
        seed++;
        const jitter = (hash2(seed * 3.1, r * 7.3) - 0.5);
        const ang = (i / rg.count) * Math.PI * 2 + r * 0.52 + jitter * 0.24;
        const rad = rg.rad * (0.85 + hash2(seed * 5.7, i * 2.3) * 0.28);
        const ox = Math.cos(ang) * rad;
        const oz = Math.sin(ang) * rad;
        const oy = rg.y + (hash2(i * 4.1, seed * 1.9) - 0.5) * 0.65;
        const yaw = Math.atan2(ox, oz) + (i % 2 === 0 ? 0.28 : -0.28);
        const pitch = rg.pitch + (hash2(seed, r) - 0.5) * 0.34;
        const roll = (hash2(r * 9.1, seed * 2.7) - 0.5) * 0.68;
        const tint = 0.86 + hash2(seed * 2.3, i * 6.1) * 0.24;
        parts.push(
          buildCurvedLeafCard(rg.cardW, rg.cardH, 0.58, ox, oy, oz, yaw, pitch, roll, centerY, tint * 0.96, tint * 1.02, tint * 0.86)
        );
      }
    }
    return mergeGeometries(parts);
  }

  function buildPineCanopyGeo(snowCapped) {
    // Towering 11.8u alpine conifer with 6 spiral whorls of drooping feathery pine-bough fronds + tall leader spire!
    const parts = [];
    const centerY = 7.4;
    const whorls = [
      { y: 3.45, count: 8, rad: 2.25, w: 3.35, h: 3.10, droop: 1.12 },
      { y: 4.95, count: 7, rad: 1.90, w: 2.95, h: 2.75, droop: 1.05 },
      { y: 6.45, count: 7, rad: 1.52, w: 2.55, h: 2.40, droop: 0.96 },
      { y: 7.90, count: 6, rad: 1.12, w: 2.15, h: 2.05, droop: 0.88 },
      { y: 9.25, count: 5, rad: 0.72, w: 1.72, h: 1.72, droop: 0.74 },
      { y: 10.45, count: 4, rad: 0.38, w: 1.32, h: 1.42, droop: 0.56 },
    ];
    let seed = 100;
    for (let wIdx = 0; wIdx < whorls.length; wIdx++) {
      const wh = whorls[wIdx];
      for (let i = 0; i < wh.count; i++) {
        seed++;
        const ang = (i / wh.count) * Math.PI * 2 + wIdx * 0.58 + (hash2(seed, wIdx) - 0.5) * 0.18;
        const ox = Math.cos(ang) * wh.rad;
        const oz = Math.sin(ang) * wh.rad;
        const oy = wh.y + (hash2(i * 3.1, seed) - 0.5) * 0.30;
        const yaw = Math.atan2(ox, oz);
        const pitch = wh.droop;
        const roll = (hash2(wIdx * 5.3, seed) - 0.5) * 0.22;
        const shade = snowCapped ? 0.98 : (0.84 + (wIdx / whorls.length) * 0.24);
        parts.push(
          buildCurvedLeafCard(wh.w, wh.h, 0.42, ox, oy, oz, yaw, pitch, roll, centerY, shade * 0.94, shade * 1.02, shade * 0.96)
        );
      }
    }
    for (let k = 0; k < 2; k++) {
      parts.push(
        buildCurvedLeafCard(1.35, 2.05, 0.16, 0, 11.45, 0, k * Math.PI * 0.5, 0, 0, centerY, 0.98, 1.04, 1.0)
      );
    }
    return mergeGeometries(parts);
  }

  function buildRibbedCactusGeo() {
    const trunk = new THREE.CylinderGeometry(0.28, 0.32, 2.35, 12, 5);
    trunk.translate(0, 1.18, 0);

    const armL = new THREE.CylinderGeometry(0.18, 0.21, 1.05, 10, 3);
    armL.translate(0, 0.52, 0);
    armL.rotateX(0.08);
    const pL = armL.attributes.position;
    for (let i = 0; i < pL.count; i++) {
      const y = pL.getY(i);
      const bend = Math.max(0, 0.6 - y) * 0.55;
      pL.setXYZ(i, pL.getX(i) - 0.52 + bend, y + 1.05, pL.getZ(i));
    }

    const armR = new THREE.CylinderGeometry(0.16, 0.19, 0.88, 10, 3);
    armR.translate(0, 0.44, 0);
    const pR = armR.attributes.position;
    for (let i = 0; i < pR.count; i++) {
      const y = pR.getY(i);
      const bend = Math.max(0, 0.5 - y) * 0.55;
      pR.setXYZ(i, pR.getX(i) + 0.48 - bend, y + 1.32, pR.getZ(i));
    }

    const parts = [trunk, armL, armR];
    for (let k = 0; k < parts.length; k++) {
      const g = parts[k];
      const pos = g.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const cx = k === 0 ? 0 : (k === 1 ? -0.52 : 0.48);
        const dx = vx - cx;
        const ang = Math.atan2(vz, dx);
        const rib = 1 + 0.12 * Math.cos(ang * 7);
        pos.setXYZ(i, cx + dx * rib, vy, vz * rib);
        const ribShade = 0.82 + 0.18 * Math.cos(ang * 7);
        cols[i * 3] = 0.34 * ribShade;
        cols[i * 3 + 1] = 0.68 * ribShade;
        cols[i * 3 + 2] = 0.44 * ribShade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.computeVertexNormals();
    }
    return mergeGeometries(parts);
  }

  function buildMossyBoulderGeo() {
    const geo = new THREE.IcosahedronGeometry(0.95, 1);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = 0.78 + 0.36 * noise2(x * 2.4 + 13.7, z * 2.4 - 9.2);
      const nx = x * 1.15 * n;
      const ny = y * 0.78 * n + 0.32;
      const nz = z * 1.05 * n;
      pos.setXYZ(i, nx, ny, nz);
    }
    geo.computeVertexNormals();
    const norm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const ny = norm.getY(i);
      const moss = smoothstep(0.35, 0.85, ny);
      cols[i * 3] = 0.92 - moss * 0.34;
      cols[i * 3 + 1] = 0.93 - moss * 0.14;
      cols[i * 3 + 2] = 0.96 - moss * 0.44;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
  }

  function buildRuneStoneGeo() {
    const pillar = new THREE.CylinderGeometry(0.32, 0.48, 2.35, 6, 4);
    pillar.translate(0, 1.18, 0);
    const pos = pillar.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const chiseled = 0.92 + 0.14 * hash2(Math.round(x * 6), Math.round(y * 4));
      const crown = y > 2.15 ? 0.65 : 1.0;
      pos.setXYZ(i, x * chiseled * crown, y, z * 0.72 * chiseled * crown);
      const rootMoss = y < 0.55 ? (0.55 - y) / 0.55 : 0;
      cols[i * 3] = 0.88 - rootMoss * 0.25;
      cols[i * 3 + 1] = 0.90 - rootMoss * 0.08;
      cols[i * 3 + 2] = 0.95 - rootMoss * 0.28;
    }
    pillar.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    pillar.computeVertexNormals();
    return pillar;
  }

  function buildGrassTuftGeo() {
    // 7 slender, gracefully tapering ankle-to-shin Lake Hylia meadow blades (sleek fine silhouette + 60 FPS lean!)
    const blades = 7;
    const segs = 2;
    const vertsPerBlade = (segs + 1) * 2;
    const totalVerts = blades * vertsPerBlade;
    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const uv = new Float32Array(totalVerts * 2);
    const col = new Float32Array(totalVerts * 3);
    const indices = [];

    for (let b = 0; b < blades; b++) {
      const az = (b / blades) * Math.PI * 2 + (b % 2) * 0.27;
      const cosA = Math.cos(az);
      const sinA = Math.sin(az);
      const rx = -sinA;
      const rz = cosA;
      const spreadR = b === 0 ? 0.05 : (0.18 + (b % 4) * 0.125);
      const bx0 = cosA * spreadR;
      const bz0 = sinA * spreadR;
      const height = 0.34 + (b % 3) * 0.11;
      const lean = 0.17 + (b % 3) * 0.07;
      const baseV = b * vertsPerBlade;

      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const y = t * height;
        const arch = t * t * lean;
        const halfW = 0.054 * (1 - t * 0.88);
        const cx = bx0 + cosA * arch;
        const cz = bz0 + sinA * arch;
        const shade = 0.48 + t * 0.60;
        const sunTip = t * t * 0.12;

        for (let side = 0; side < 2; side++) {
          const w = side === 0 ? -halfW : halfW;
          const vi = baseV + s * 2 + side;
          pos[vi * 3] = cx + rx * w;
          pos[vi * 3 + 1] = y;
          pos[vi * 3 + 2] = cz + rz * w;

          norm[vi * 3] = cosA * 0.22;
          norm[vi * 3 + 1] = 0.95;
          norm[vi * 3 + 2] = sinA * 0.22;

          uv[vi * 2] = side;
          uv[vi * 2 + 1] = t;

          // Rich shadowed mossy roots -> warm sunlit olive-gold tips
          col[vi * 3] = shade * (0.94 + sunTip);
          col[vi * 3 + 1] = shade * (1.02 + sunTip * 0.5);
          col[vi * 3 + 2] = shade * 0.82;
        }
      }

      for (let s = 0; s < segs; s++) {
        const i0 = baseV + s * 2;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        const i3 = i0 + 3;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(indices);
    return geo;
  }

  function buildFernClusterGeo() {
    // 3 crossed gently cupped broadleaf forest fern / root shrub cards
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI + 0.2;
      parts.push(buildCurvedLeafCard(1.35, 0.95, 0.22, 0, 0.44, 0, ang, 0.14, 0, 0.45, 0.92, 1.0, 0.88));
    }
    return mergeGeometries(parts);
  }

  function buildReedClusterGeo() {
    // 5 slender tall coastal reeds / cattails for shallow shoreline margins
    const blades = 5;
    const segs = 3;
    const vpb = (segs + 1) * 2;
    const pos = new Float32Array(blades * vpb * 3);
    const norm = new Float32Array(blades * vpb * 3);
    const uv = new Float32Array(blades * vpb * 2);
    const col = new Float32Array(blades * vpb * 3);
    const idx = [];
    for (let b = 0; b < blades; b++) {
      const az = (b / blades) * Math.PI * 2 + 0.4;
      const ca = Math.cos(az), sa = Math.sin(az);
      const rx = -sa, rz = ca;
      const ox = ca * (0.12 + (b % 2) * 0.12);
      const oz = sa * (0.12 + (b % 2) * 0.12);
      const h = 1.15 + (b % 3) * 0.28;
      const lean = 0.22 + (b % 2) * 0.12;
      const baseV = b * vpb;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const hw = 0.042 * (1 - t * 0.78);
        const cx = ox + ca * t * t * lean;
        const cz = oz + sa * t * t * lean;
        for (let side = 0; side < 2; side++) {
          const w = side === 0 ? -hw : hw;
          const vi = baseV + s * 2 + side;
          pos[vi * 3] = cx + rx * w;
          pos[vi * 3 + 1] = t * h;
          pos[vi * 3 + 2] = cz + rz * w;
          norm[vi * 3] = ca * 0.2;
          norm[vi * 3 + 1] = 0.96;
          norm[vi * 3 + 2] = sa * 0.2;
          uv[vi * 2] = side;
          uv[vi * 2 + 1] = t;
          const tip = smoothstep(0.65, 1.0, t);
          col[vi * 3] = 0.44 + tip * 0.34;
          col[vi * 3 + 1] = 0.58 + tip * 0.24;
          col[vi * 3 + 2] = 0.28 + tip * 0.10;
        }
      }
      for (let s = 0; s < segs; s++) {
        const i0 = baseV + s * 2;
        idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  function buildFlowerGeo() {
    const stem = new THREE.CylinderGeometry(0.015, 0.025, 0.36, 4, 2);
    stem.translate(0, 0.18, 0);
    const sUv = stem.attributes.uv;
    for (let i = 0; i < sUv.count; i++) {
      sUv.array[i * 2 + 1] *= 0.72;
    }
    ensureVertexColors(stem, 0.48, 0.72, 0.42);
    stem.computeVertexNormals();

    const parts = [stem];
    for (let p = 0; p < 4; p++) {
      const petal = new THREE.PlaneGeometry(0.11, 0.11, 1, 1);
      petal.rotateX(-Math.PI * 0.38);
      petal.translate(0, 0.36, 0.055);
      const a = (p / 4) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const pPos = petal.attributes.position;
      for (let i = 0; i < pPos.count; i++) {
        const x = pPos.getX(i), z = pPos.getZ(i);
        pPos.setXYZ(i, x * ca - z * sa, pPos.getY(i), x * sa + z * ca);
      }
      const pUv = petal.attributes.uv;
      for (let i = 0; i < pUv.count; i++) {
        pUv.array[i * 2 + 1] = 0.84 + pUv.array[i * 2 + 1] * 0.16;
      }
      ensureVertexColors(petal, 1.0, 1.0, 1.0);
      petal.computeVertexNormals();
      parts.push(petal);
    }
    return mergeGeometries(parts);
  }

  function buildKelpGeo() {
    const segs = 6;
    const geo = new THREE.PlaneGeometry(0.36, 3.3, 1, segs);
    geo.translate(0, 1.65, 0);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, y / 3.3));
      const taper = (0.35 + 0.85 * Math.sin(t * Math.PI)) * (1 - t * 0.55);
      const wave = Math.sin(t * Math.PI * 2.2) * 0.14;
      pos.setXYZ(i, pos.getX(i) * taper + wave, y, pos.getZ(i));
      uv.array[i * 2 + 1] = t;
    }
    geo.computeVertexNormals();
    return geo;
  }

  function buildBirchTrunkGeo() {
    const parts = [];
    const main = new THREE.CylinderGeometry(0.14, 0.34, 6.0, 8, 6);
    main.translate(0, 3.0, 0);
    const pos = main.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const flare = y < 1.0 ? 1 + (1.0 - y) * 0.32 : 1;
      const curve = Math.sin(y * 0.55) * 0.12;
      pos.setXYZ(i, x * flare + curve, y, z * flare);
      const band = Math.sin(y * 9.5 + ang * 1.5) > 0.72 ? 0.32 : 0.94;
      const ao = (0.68 + 0.32 * Math.min(1, y / 2.2)) * band;
      cols[i * 3] = ao;
      cols[i * 3 + 1] = ao * 0.98;
      cols[i * 3 + 2] = ao * 0.94;
    }
    main.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    main.computeVertexNormals();
    parts.push(main);

    const boughs = [
      { ang: 0.4, y0: 4.3, len: 2.1, tilt: 0.48 },
      { ang: 2.1, y0: 4.8, len: 1.9, tilt: 0.44 },
      { ang: 3.9, y0: 4.5, len: 2.0, tilt: 0.50 },
      { ang: 5.4, y0: 5.1, len: 1.7, tilt: 0.40 },
    ];
    for (let b = 0; b < boughs.length; b++) {
      const br = boughs[b];
      const bg = new THREE.CylinderGeometry(0.045, 0.11, br.len, 6, 2);
      bg.translate(0, br.len * 0.5, 0);
      const bp = bg.attributes.position;
      const bc = new Float32Array(bp.count * 3);
      const ct = Math.cos(br.tilt), st = Math.sin(br.tilt);
      const ca = Math.cos(br.ang), sa = Math.sin(br.ang);
      for (let i = 0; i < bp.count; i++) {
        const lx = bp.getX(i), ly = bp.getY(i), lz = bp.getZ(i);
        const tx = lx * ct + ly * st;
        const ty = -lx * st + ly * ct + br.y0;
        bp.setXYZ(i, tx * ca - lz * sa, ty, tx * sa + lz * ca);
        const s = 0.85 + 0.12 * (ly / br.len);
        bc[i * 3] = s; bc[i * 3 + 1] = s * 0.98; bc[i * 3 + 2] = s * 0.94;
      }
      bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
      bg.computeVertexNormals();
      parts.push(bg);
    }
    return mergeGeometries(parts);
  }

  function buildBirchCanopyGeo() {
    const parts = [];
    const centerY = 6.9;
    const rings = [
      { count: 9, rad: 2.15, y: 5.2, cardW: 2.35, cardH: 2.20, pitch: 0.36 },
      { count: 9, rad: 1.95, y: 6.7, cardW: 2.40, cardH: 2.30, pitch: 0.08 },
      { count: 7, rad: 1.25, y: 8.0, cardW: 2.15, cardH: 2.10, pitch: -0.45 },
      { count: 4, rad: 0.45, y: 8.85, cardW: 1.85, cardH: 1.80, pitch: -0.95 },
    ];
    let seed = 210;
    for (let r = 0; r < rings.length; r++) {
      const rg = rings[r];
      for (let i = 0; i < rg.count; i++) {
        seed++;
        const ang = (i / rg.count) * Math.PI * 2 + r * 0.61;
        const rad = rg.rad * (0.85 + hash2(seed * 3.3, i * 4.1) * 0.25);
        const ox = Math.cos(ang) * rad;
        const oz = Math.sin(ang) * rad;
        const oy = rg.y + (hash2(i * 2.9, seed * 1.7) - 0.5) * 0.55;
        const yaw = Math.atan2(ox, oz) + (i % 2 === 0 ? 0.25 : -0.25);
        const pitch = rg.pitch + (hash2(seed, r) - 0.5) * 0.30;
        const roll = (hash2(r * 7.1, seed * 2.3) - 0.5) * 0.55;
        const tint = 0.90 + hash2(seed * 1.9, i * 5.3) * 0.20;
        parts.push(buildCurvedLeafCard(rg.cardW, rg.cardH, 0.46, ox, oy, oz, yaw, pitch, roll, centerY, tint * 0.98, tint * 1.06, tint * 0.78));
      }
    }
    return mergeGeometries(parts);
  }

  function buildWillowCanopyGeo() {
    const parts = [];
    const centerY = 6.2;
    const crown = [
      { count: 10, rad: 2.75, y: 6.4, cardW: 2.6, cardH: 2.4, pitch: 0.30 },
      { count: 7, rad: 1.65, y: 7.7, cardW: 2.5, cardH: 2.3, pitch: -0.45 },
      { count: 4, rad: 0.55, y: 8.45, cardW: 2.2, cardH: 2.0, pitch: -1.0 },
    ];
    let seed = 310;
    for (let r = 0; r < crown.length; r++) {
      const rg = crown[r];
      for (let i = 0; i < rg.count; i++) {
        seed++;
        const ang = (i / rg.count) * Math.PI * 2 + r * 0.47;
        const ox = Math.cos(ang) * rg.rad;
        const oz = Math.sin(ang) * rg.rad;
        const oy = rg.y + (hash2(i, seed) - 0.5) * 0.45;
        const tint = 0.84 + hash2(seed, r * 3.1) * 0.22;
        parts.push(buildCurvedLeafCard(rg.cardW, rg.cardH, 0.50, ox, oy, oz, Math.atan2(ox, oz), rg.pitch, 0, centerY, tint * 0.88, tint * 1.02, tint * 0.84));
      }
    }
    // Hanging weeping frond curtains
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + 0.15;
      const rad = 2.65 + (i % 3) * 0.42;
      const ox = Math.cos(ang) * rad;
      const oz = Math.sin(ang) * rad;
      const oy = 4.35 + (i % 2) * 0.45;
      const tint = 0.82 + (i % 3) * 0.08;
      parts.push(buildCurvedLeafCard(1.45, 3.65, 0.35, ox, oy, oz, Math.atan2(ox, oz), 1.44, 0, centerY, tint * 0.86, tint * 1.0, tint * 0.82));
    }
    return mergeGeometries(parts);
  }

  function buildPalmTrunkGeo() {
    const segs = 10;
    const h = 7.2;
    const geo = new THREE.CylinderGeometry(0.14, 0.28, h, 8, segs);
    geo.translate(0, h * 0.5, 0);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, y / h));
      const archX = Math.sin(t * Math.PI * 0.65) * 0.68;
      const archZ = (t * t) * 0.32;
      const ring = 1 + 0.08 * Math.sin(y * 7.5);
      pos.setXYZ(i, x * ring + archX, y, z * ring + archZ);
      const shade = 0.72 + 0.24 * t - (Math.sin(y * 7.5) > 0.4 ? 0.10 : 0);
      cols[i * 3] = shade;
      cols[i * 3 + 1] = shade * 0.90;
      cols[i * 3 + 2] = shade * 0.76;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function buildPalmCanopyGeo() {
    const parts = [];
    const centerY = 7.4;
    const ox0 = 0.60;
    const oz0 = 0.32;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.22;
      const reach = 1.65 + (i % 2) * 0.25;
      const ox = ox0 + Math.cos(ang) * reach;
      const oz = oz0 + Math.sin(ang) * reach;
      const oy = 7.35 + (i % 2) * 0.38;
      const yaw = Math.atan2(Math.cos(ang), Math.sin(ang));
      const pitch = 1.15 + (i % 2) * 0.22;
      const tint = 0.88 + (i % 3) * 0.08;
      parts.push(buildCurvedLeafCard(1.25, 3.25, 0.55, ox, oy, oz, yaw, pitch, 0, centerY, tint * 0.92, tint * 1.04, tint * 0.74));
    }
    return mergeGeometries(parts);
  }

  function buildBushGeo() {
    const parts = [];
    const centerY = 0.65;
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2 + 0.3;
      const rad = k === 0 ? 0.06 : 0.34;
      const ox = Math.cos(ang) * rad;
      const oz = Math.sin(ang) * rad;
      const oy = k === 0 ? 0.76 : 0.56 + (k % 2) * 0.14;
      const pitch = k === 0 ? -0.95 : 0.32;
      const tint = 0.86 + (k % 3) * 0.09;
      parts.push(buildCurvedLeafCard(1.05, 0.95, 0.32, ox, oy, oz, ang, pitch, 0, centerY, tint * 0.88, tint * 1.02, tint * 0.80));
    }
    return mergeGeometries(parts);
  }

  function buildLogGeo() {
    const log = new THREE.CylinderGeometry(0.38, 0.44, 3.1, 8, 4);
    log.rotateX(Math.PI * 0.5);
    log.translate(0, 0.40, 0);
    const pos = log.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const bump = 0.94 + 0.12 * noise2(z * 2.1 + 4, x * 2.1 - 3);
      pos.setXYZ(i, x * bump, Math.max(0.02, y * bump), z);
      const moss = smoothstep(0.45, 0.78, y);
      cols[i * 3] = 0.92 - moss * 0.35;
      cols[i * 3 + 1] = 0.90 - moss * 0.08;
      cols[i * 3 + 2] = 0.85 - moss * 0.42;
    }
    log.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    log.computeVertexNormals();
    return log;
  }

  function buildStumpGeo() {
    const stump = new THREE.CylinderGeometry(0.54, 0.76, 0.92, 9, 3);
    stump.translate(0, 0.46, 0);
    const pos = stump.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const rootFlare = y < 0.36 ? 1 + (0.36 - y) * (0.45 + 0.25 * Math.cos(ang * 5)) : 1;
      pos.setXYZ(i, x * rootFlare, y, z * rootFlare);
      const isTop = y > 0.86;
      const ao = isTop ? 1.18 : (0.64 + 0.32 * (y / 0.92));
      cols[i * 3] = ao;
      cols[i * 3 + 1] = ao * (isTop ? 1.06 : 0.96);
      cols[i * 3 + 2] = ao * (isTop ? 0.88 : 0.88);
    }
    stump.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    stump.computeVertexNormals();
    return stump;
  }

  function buildLilypadGeo() {
    const pad = new THREE.CylinderGeometry(0.42, 0.40, 0.04, 12, 1);
    pad.translate(0, 0.02, 0);
    ensureVertexColors(pad, 0.42, 0.78, 0.38);
    pad.computeVertexNormals();

    const bud = new THREE.CylinderGeometry(0.05, 0.09, 0.09, 6, 1);
    bud.translate(0.07, 0.07, 0.04);
    ensureVertexColors(bud, 0.98, 0.62, 0.78);
    bud.computeVertexNormals();
    return mergeGeometries([pad, bud]);
  }

  // ---------- PBR prop materials & registry ----------

  const texSets = (typeof Textures !== 'undefined' && Textures.sets) ? Textures.sets : null;

  function makePropMat(setName, fallbackHex, colorHexWithTex, roughness, extra) {
    const set = texSets && texSets[setName];
    const opts = {
      color: set ? colorHexWithTex : fallbackHex,
      roughness,
      metalness: 0.02,
    };
    if (set) {
      if (set.map && !(extra && extra.skipAlbedoMap)) opts.map = set.map;
      if (set.normalMap) opts.normalMap = set.normalMap;
      if (set.roughnessMap) opts.roughnessMap = set.roughnessMap;
    }
    if (extra) {
      for (const k in extra) {
        if (k !== 'skipAlbedoMap') opts[k] = extra[k];
      }
    }
    const mat = new THREE.MeshStandardMaterial(opts);
    if (mat.color && typeof mat.color.convertSRGBToLinear === 'function') {
      mat.color.convertSRGBToLinear();
    }
    return mat;
  }

  const terrainMat = (typeof Shaders !== 'undefined' && typeof Shaders.createTerrainMaterial === 'function')
    ? Shaders.createTerrainMaterial(typeof Textures !== 'undefined' ? Textures : null)
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });

  const waterMat = (typeof Shaders !== 'undefined' && typeof Shaders.createWaterMaterial === 'function')
    ? Shaders.createWaterMaterial(typeof Textures !== 'undefined' ? Textures : null)
    : new THREE.MeshStandardMaterial({ color: 0x2e7fa8, transparent: true, opacity: 0.55, roughness: 0.15, side: THREE.DoubleSide });

  const horizonWaterMat = (typeof Shaders !== 'undefined' && typeof Shaders.createHorizonWaterMaterial === 'function')
    ? Shaders.createHorizonWaterMaterial()
    : new THREE.MeshStandardMaterial({ color: 0x164166, roughness: 0.25, side: THREE.DoubleSide });

  const grassMat = (typeof Shaders !== 'undefined' && typeof Shaders.createGrassMaterial === 'function')
    ? Shaders.createGrassMaterial(typeof Textures !== 'undefined' ? Textures : null)
    : new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });

  const flowerMat = grassMat;

  const kelpMat = (typeof Shaders !== 'undefined' && typeof Shaders.createKelpMaterial === 'function')
    ? Shaders.createKelpMaterial()
    : new THREE.MeshStandardMaterial({ color: 0x2e8b66, side: THREE.DoubleSide, roughness: 0.72 });

  function makeFoliageCardMat(cardTex, fallbackHex, roughness, reactiveOpts) {
    const mat = new THREE.MeshStandardMaterial({
      color: cardTex ? 0xffffff : fallbackHex,
      map: cardTex || null,
      alphaTest: cardTex ? 0.42 : 0,
      side: THREE.DoubleSide,
      roughness,
      metalness: 0.0,
      vertexColors: true,
    });
    if (mat.color && typeof mat.color.convertSRGBToLinear === 'function') {
      mat.color.convertSRGBToLinear();
    }
    if (reactiveOpts) {
      if (typeof Shaders !== 'undefined' && typeof Shaders.patchFoliageReactive === 'function') {
        Shaders.patchFoliageReactive(mat, reactiveOpts);
      }
    } else if (typeof Shaders !== 'undefined' && typeof Shaders.patchTreeWind === 'function') {
      Shaders.patchTreeWind(mat, true);
    }
    return mat;
  }

  const trunkMat = makePropMat('bark', 0x6b4a32, 0xf2e6da, 0.92, { vertexColors: true });
  if (typeof Shaders !== 'undefined' && typeof Shaders.patchTreeWind === 'function') {
    Shaders.patchTreeWind(trunkMat, false);
  }

  const birchTrunkMat = makePropMat('bark', 0xe6e0d4, 0xeae5db, 0.84, { vertexColors: true, skipAlbedoMap: true });
  if (typeof Shaders !== 'undefined' && typeof Shaders.patchTreeWind === 'function') {
    Shaders.patchTreeWind(birchTrunkMat, false);
  }

  const woodFloorMat = makePropMat('bark', 0x6b4a32, 0xe8d6c4, 0.92, { vertexColors: true });

  const reedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  if (typeof Shaders !== 'undefined' && typeof Shaders.patchFoliageReactive === 'function') {
    Shaders.patchFoliageReactive(reedMat, { amp: 0.16, heightScale: 1.55, useUvY: true });
  }

  const PROPS = {
    trunk: {
      geo: buildFlaredTrunkGeo(),
      mat: trunkMat,
    },
    birchTrunk: {
      geo: buildBirchTrunkGeo(),
      mat: birchTrunkMat,
    },
    palmTrunk: {
      geo: buildPalmTrunkGeo(),
      mat: trunkMat,
    },
    oakCanopy: {
      geo: buildOakCanopyGeo(),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.oakLeafCard : null, 0x4d9e4f, 0.78),
    },
    birchCanopy: {
      geo: buildBirchCanopyGeo(),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.oakLeafCard : null, 0x6ab84e, 0.78),
    },
    pineCanopy: {
      geo: buildPineCanopyGeo(false),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.pineBoughCard : null, 0x2f6b46, 0.80),
    },
    pineSnowCanopy: {
      geo: buildPineCanopyGeo(true),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.pineSnowBoughCard : null, 0xd8e4ea, 0.74),
    },
    willowCanopy: {
      geo: buildWillowCanopyGeo(),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.oakLeafCard : null, 0x4a8f48, 0.80),
    },
    palmCanopy: {
      geo: buildPalmCanopyGeo(),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.oakLeafCard : null, 0x5ca442, 0.78),
    },
    cactus: {
      geo: buildRibbedCactusGeo(),
      mat: makePropMat('grass', 0x4f9e6b, 0xcae6cd, 0.78, { vertexColors: true }),
    },
    bush: {
      geo: buildBushGeo(),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.oakLeafCard : null, 0x3b7a38, 0.82, { amp: 0.12, heightScale: 1.35 }),
    },
    rock: {
      geo: buildMossyBoulderGeo(),
      mat: makePropMat('rock', 0x8b8b8f, 0xe8eaed, 0.86, { vertexColors: true }),
    },
    boulderRock: {
      geo: buildMossyBoulderGeo(),
      mat: makePropMat('rock', 0x938d86, 0xe8e4dc, 0.88, { vertexColors: true }),
    },
    fallenLog: {
      geo: buildLogGeo(),
      mat: woodFloorMat,
    },
    stump: {
      geo: buildStumpGeo(),
      mat: woodFloorMat,
    },
    lilypad: {
      geo: buildLilypadGeo(),
      mat: makePropMat('leaves', 0x4b8f48, 0xd8eed0, 0.46, { vertexColors: true, side: THREE.DoubleSide }),
    },
    runeStone: {
      geo: buildRuneStoneGeo(),
      mat: makePropMat('stone', 0x7c8290, 0xd8dce6, 0.82, { vertexColors: true }),
    },
    kelp: {
      geo: buildKelpGeo(),
      mat: kelpMat,
    },
    fern: {
      geo: buildFernClusterGeo(),
      mat: makeFoliageCardMat(typeof Textures !== 'undefined' ? Textures.fernCard : null, 0x3e7432, 0.84, { amp: 0.14, heightScale: 0.95, useUvY: true }),
    },
    reed: {
      geo: buildReedClusterGeo(),
      mat: reedMat,
    },
  };

  const PROP_GLB_KEYS = {
    tree: 'oak_tree',
    birch: 'birch_tree',
    pine: 'pine_tree',
    pineSnow: 'pine_snow',
    willow: 'willow_tree',
    palm: 'palm_tree',
    cactus: 'cactus_flower',
    bush: 'bush_berry',
    rock: 'boulder_moss',
    boulderRock: 'boulder_rock',
    fallenLog: 'fallen_log',
    stump: 'tree_stump',
    lilypad: 'lilypad',
  };

  const PROP_GLB_SCALE_ADJUST = {
    oak_tree: 1.0,
    birch_tree: 1.0,
    pine_tree: 1 / 0.85,
    pine_snow: 1 / 0.85,
    willow_tree: 1 / 0.90,
    palm_tree: 1.0,
    cactus_flower: 0.58,
    bush_berry: 1.0,
    boulder_moss: 1.15,
    boulder_rock: 0.95,
    fallen_log: 1.0,
    tree_stump: 1.0,
    lilypad: 1.30,
  };

  const grassGeo = buildGrassTuftGeo();
  const flowerGeo = buildFlowerGeo();

  // ---------- chunk builder & streamer ----------

  const RES = 36;
  const GRID_PAD = RES + 3;
  const GRASS_CAP_HIGH = 1296;
  const GRASS_CAP_BAL = 625;
  const FLOWER_CAP_HIGH = 72;
  const FLOWER_CAP_BAL = 36;
  const _gridH = new Float32Array(GRID_PAD * GRID_PAD);
  const _gMatrices = new Float32Array(GRASS_CAP_HIGH * 16);
  const _gColors = new Float32Array(GRASS_CAP_HIGH * 3);
  const _fMatrices = new Float32Array(FLOWER_CAP_HIGH * 16);
  const _fColors = new Float32Array(FLOWER_CAP_HIGH * 3);
  const dummy = new THREE.Object3D();
  const _tmpNorm = { x: 0, y: 1, z: 0 };
  const _tmpClimate = { desert: 0, snow: 0, forest: 0, meadow: 0 };
  const _tmpCol = new THREE.Color();
  const _unloadKeys = [];

  const FLOWER_PALETTE = [
    new THREE.Color(0xffe066),
    new THREE.Color(0x7eb8ff),
    new THREE.Color(0xc292ff),
    new THREE.Color(0xff8474),
    new THREE.Color(0xfff4d0),
  ];
  for (let i = 0; i < FLOWER_PALETTE.length; i++) {
    if (typeof FLOWER_PALETTE[i].convertSRGBToLinear === 'function') {
      FLOWER_PALETTE[i].convertSRGBToLinear();
    }
  }

  function makeInstances(type, items, scaleBase, castShadow, receiveShadow, tintBase, flatTilt) {
    const def = PROPS[type];
    const mesh = new THREE.InstancedMesh(def.geo, def.mat, items.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    // Prevent r128 Frustum.intersectsObject from culling world-offset instances by origin geo sphere
    mesh.frustumCulled = false;

    const tiltAmt = flatTilt ? 0 : 0.14;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(
        tiltAmt ? (hash2(p.x + 9, p.z) - 0.5) * tiltAmt : 0,
        hash2(p.x, p.z) * Math.PI * 2,
        tiltAmt ? (hash2(p.x, p.z + 9) - 0.5) * tiltAmt : 0
      );
      const s = scaleBase * p.s;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const v = 0.88 + hash2(p.x * 1.7 + 3, p.z * 1.7 - 5) * 0.22;
      _tmpCol.setRGB(tintBase.r * v, tintBase.g * v, tintBase.b * v);
      mesh.setColorAt(i, _tmpCol);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return mesh;
  }

  function registerPropSwap(propType, primaryMesh, chunk, hideTargets) {
    if (typeof Env === 'undefined' || !Env || typeof Env.registerInstancedSwap !== 'function') return;
    const glbKey = PROP_GLB_KEYS[propType];
    if (!glbKey || !primaryMesh) return;
    Env.registerInstancedSwap(glbKey, primaryMesh, {
      chunk,
      parent: scene,
      hideTargets: hideTargets || null,
      removeFallback: true,
      scaleAdjust: PROP_GLB_SCALE_ADJUST[glbKey] !== undefined ? PROP_GLB_SCALE_ADJUST[glbKey] : 1.0,
      THREE,
    });
  }

  const _tintNeutral = { r: 1, g: 1, b: 1 };
  const _tintOak = { r: 0.96, g: 1.02, b: 0.92 };
  const _tintPine = { r: 0.90, g: 1.0, b: 0.94 };
  const _tintBirch = { r: 0.98, g: 1.04, b: 0.88 };
  const _tintWillow = { r: 0.90, g: 1.02, b: 0.88 };
  const _tintPalm = { r: 0.96, g: 1.04, b: 0.84 };

  function buildChunkWaterTile(chunk) {
    if (chunk.waterMesh) {
      scene.remove(chunk.waterMesh);
      const mIdx = chunk.meshes.indexOf(chunk.waterMesh);
      if (mIdx >= 0) chunk.meshes.splice(mIdx, 1);
      chunk.waterMesh = null;
    }
    if (chunk.waterGeo) {
      chunk.waterGeo.dispose();
      const gIdx = chunk.uniqueGeos.indexOf(chunk.waterGeo);
      if (gIdx >= 0) chunk.uniqueGeos.splice(gIdx, 1);
      chunk.waterGeo = null;
    }
    if (!chunk.hasWater) return;

    const wRes = qualityMode === 'high' ? 24 : 16;
    const ox = chunk.cx * CHUNK;
    const oz = chunk.cz * CHUNK;
    const wGeo = new THREE.PlaneGeometry(CHUNK, CHUNK, wRes, wRes);
    wGeo.rotateX(-Math.PI / 2);
    const wPos = wGeo.attributes.position;
    const bedHeights = new Float32Array(wPos.count);
    for (let i = 0; i < wPos.count; i++) {
      const wx = wPos.getX(i) + ox;
      const wz = wPos.getZ(i) + oz;
      bedHeights[i] = heightAt(wx, wz);
    }
    wGeo.setAttribute('aBedHeight', new THREE.BufferAttribute(bedHeights, 1));
    const waterTile = new THREE.Mesh(wGeo, waterMat);
    waterTile.position.set(ox, WATER_Y, oz);
    waterTile.castShadow = false;
    waterTile.receiveShadow = false;
    scene.add(waterTile);
    chunk.meshes.push(waterTile);
    chunk.uniqueGeos.push(wGeo);
    chunk.waterMesh = waterTile;
    chunk.waterGeo = wGeo;
    chunk.waterRes = wRes;
  }

  function buildChunkGrass(chunk) {
    const cx = chunk.cx;
    const cz = chunk.cz;
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;

    // Remove previous grass/flower meshes cleanly if refreshing quality
    for (let i = 0; i < chunk.grassMeshes.length; i++) {
      const gm = chunk.grassMeshes[i];
      scene.remove(gm);
      const idx = chunk.meshes.indexOf(gm);
      if (idx >= 0) chunk.meshes.splice(idx, 1);
    }
    chunk.grassMeshes.length = 0;
    chunk.grassDirty = false;

    if (!chunk.hasDryLand) return;

    const grassGrid = qualityMode === 'high' ? 36 : 25;
    const grassCap = grassGrid * grassGrid;
    const cellStep = (CHUNK - 0.8) / grassGrid;
    const startOff = -HALF_CHUNK + 0.4 + cellStep * 0.5;
    const flowerCap = qualityMode === 'high' ? FLOWER_CAP_HIGH : FLOWER_CAP_BAL;
    const flowerTries = flowerCap * 3;

    // Stratified jittered grid covers 100% of meadows seamlessly without bald spots or wasted retries
    let gCount = 0;

    for (let gx = 0; gx < grassGrid && gCount < grassCap; gx++) {
      for (let gz = 0; gz < grassGrid && gCount < grassCap; gz++) {
        const jx = (hash2(ox + gx * 3.17, oz + gz * 5.41) - 0.5) * cellStep * 0.86;
        const jz = (hash2(ox + gx * 7.13 + 19, oz + gz * 2.89 - 11) - 0.5) * cellStep * 0.86;
        const x = ox + startOff + gx * cellStep + jx;
        const z = oz + startOff + gz * cellStep + jz;
        const h = heightAt(x, z);
        if (h <= WATER_Y + 0.95 || h > 13.5) continue;

        // Keep worn dirt footpaths & Star Sanctuary stone compass plaza free of grass blades!
        if (typeof Regions !== 'undefined' && typeof Regions.getTrailWeight === 'function') {
          if (Regions.getTrailWeight(x, z) > 0.40) continue;
          if (x * x + z * z < 7.8 * 7.8) continue;
        }

        climateAt(x, z, _tmpClimate);
        if (_tmpClimate.desert > 0.55 || _tmpClimate.snow > 0.68) continue;

        terrainNormalAt(x, z, _tmpNorm);
        if (_tmpNorm.y <= 0.72) continue;

        dummy.position.set(x, h - 0.03, z);
        dummy.rotation.set(0, hash2(x * 2.3, z * 2.3) * Math.PI * 2, 0);
        const sy = 0.76 + hash2(x + 4.1, z - 2.9) * 0.62;
        const sxz = 1.02 + hash2(x - 1.9, z + 5.7) * 0.52;
        dummy.scale.set(sxz, sy, sxz);
        dummy.updateMatrix();
        _gMatrices.set(dummy.matrix.elements, gCount * 16);

        terrainColor(x, z, h, _tmpCol);
        const bright = 1.02 + (hash2(x * 4.1, z * 4.1) - 0.5) * 0.16;
        _gColors[gCount * 3] = Math.min(1.2, _tmpCol.r * bright);
        _gColors[gCount * 3 + 1] = Math.min(1.2, _tmpCol.g * bright);
        _gColors[gCount * 3 + 2] = Math.min(1.2, _tmpCol.b * bright);
        gCount++;
      }
    }

    if (gCount > 0) {
      const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, gCount);
      grassMesh.castShadow = false;
      grassMesh.receiveShadow = true;
      grassMesh.frustumCulled = false;
      grassMesh.instanceMatrix.array.set(_gMatrices.subarray(0, gCount * 16));
      grassMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < gCount; i++) {
        _tmpCol.setRGB(_gColors[i * 3], _gColors[i * 3 + 1], _gColors[i * 3 + 2]);
        grassMesh.setColorAt(i, _tmpCol);
      }
      if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
      scene.add(grassMesh);
      chunk.meshes.push(grassMesh);
      chunk.grassMeshes.push(grassMesh);
    }

    // Second pass: meadow & forest wildflowers
    let fCount = 0;

    for (let i = 0; i < flowerTries && fCount < flowerCap; i++) {
      const rx = hash2(ox + i * 2.13 + 71, oz - i * 1.49) - 0.5;
      const rz = hash2(ox - i * 1.63, oz + i * 2.41 - 37) - 0.5;
      const x = ox + rx * (CHUNK - 2.0);
      const z = oz + rz * (CHUNK - 2.0);
      const h = heightAt(x, z);
      if (h <= WATER_Y + 1.2 || h > 12.5) continue;
      if (typeof Regions !== 'undefined' && typeof Regions.getTrailWeight === 'function') {
        if (Regions.getTrailWeight(x, z) > 0.35 || x * x + z * z < 8.5 * 8.5) continue;
      }

      climateAt(x, z, _tmpClimate);
      if (_tmpClimate.desert > 0.45 || _tmpClimate.snow > 0.55) continue;

      terrainNormalAt(x, z, _tmpNorm);
      if (_tmpNorm.y <= 0.84) continue;

      dummy.position.set(x, h - 0.02, z);
      dummy.rotation.set(0, hash2(x * 3.7, z * 3.7) * Math.PI * 2, 0);
      const s = 0.78 + hash2(x + 7.2, z - 3.3) * 0.52;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      _fMatrices.set(dummy.matrix.elements, fCount * 16);

      const palIdx = Math.floor(hash2(x * 0.45, z * 0.45) * FLOWER_PALETTE.length) % FLOWER_PALETTE.length;
      const fc = FLOWER_PALETTE[palIdx];
      _fColors[fCount * 3] = fc.r;
      _fColors[fCount * 3 + 1] = fc.g;
      _fColors[fCount * 3 + 2] = fc.b;
      fCount++;
    }

    if (fCount > 0) {
      const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, fCount);
      flowerMesh.castShadow = false;
      flowerMesh.receiveShadow = true;
      flowerMesh.frustumCulled = false;
      flowerMesh.instanceMatrix.array.set(_fMatrices.subarray(0, fCount * 16));
      flowerMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < fCount; i++) {
        _tmpCol.setRGB(_fColors[i * 3], _fColors[i * 3 + 1], _fColors[i * 3 + 2]);
        flowerMesh.setColorAt(i, _tmpCol);
      }
      if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
      scene.add(flowerMesh);
      chunk.meshes.push(flowerMesh);
      chunk.grassMeshes.push(flowerMesh);
    }
  }

  function buildChunk(cx, cz) {
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;

    // --- terrain mesh ---
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, RES, RES);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const step = CHUNK / RES;
    const twoStep = 2 * step;
    let minH = Infinity;
    let maxH = -Infinity;

    // Sample padded height grid once so chunk-edge normals match seamlessly with 1/4 the calls
    for (let gz = 0; gz < GRID_PAD; gz++) {
      const wz = oz + (gz - 1 - RES * 0.5) * step;
      const row = gz * GRID_PAD;
      for (let gx = 0; gx < GRID_PAD; gx++) {
        const wx = ox + (gx - 1 - RES * 0.5) * step;
        _gridH[row + gx] = heightAt(wx, wz);
      }
    }

    const cols = RES + 1;
    for (let iz = 0; iz <= RES; iz++) {
      const gz = iz + 1;
      const gRow = gz * GRID_PAD;
      const vRow = iz * cols;
      for (let ix = 0; ix <= RES; ix++) {
        const i = vRow + ix;
        const gIdx = gRow + ix + 1;
        const h = _gridH[gIdx];
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        pos.setY(i, h);

        const nx = -(_gridH[gIdx + 1] - _gridH[gIdx - 1]) / twoStep;
        const nz = -(_gridH[gIdx + GRID_PAD] - _gridH[gIdx - GRID_PAD]) / twoStep;
        const invLen = 1 / Math.hypot(nx, 1, nz);
        normAttr.setXYZ(i, nx * invLen, invLen, nz * invLen);

        const x = pos.getX(i) + ox;
        const z = pos.getZ(i) + oz;
        terrainColor(x, z, h, _tmpCol);
        colors[i * 3] = _tmpCol.r;
        colors[i * 3 + 1] = _tmpCol.g;
        colors[i * 3 + 2] = _tmpCol.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.position.set(ox, 0, oz);
    terrain.receiveShadow = true;
    terrain.castShadow = false;
    scene.add(terrain);

    const meshes = [terrain];
    const uniqueGeos = [geo];
    const colliders = [];

    const chunk = {
      cx,
      cz,
      meshes,
      grassMeshes: [],
      uniqueGeos,
      colliders,
      hasDryLand: maxH > WATER_Y + 1.1,
      hasWater: minH < WATER_Y + 1.0,
      waterMesh: null,
      waterGeo: null,
      waterRes: 0,
      grassDirty: false,
      disposed: false,
    };

    // --- chunk water tile with baked bed height & quality-scaled Gerstner grid ---
    if (chunk.hasWater) {
      buildChunkWaterTile(chunk);
    }

    // --- sculpted props & spatial colliders strictly inside chunk bounds ---
    const byType = {
      pine: [],
      tree: [],
      birch: [],
      willow: [],
      palm: [],
      cactus: [],
      pineSnow: [],
      bush: [],
      rock: [],
      boulderRock: [],
      fallenLog: [],
      stump: [],
      lilypad: [],
      runeStone: [],
      kelp: [],
      fern: [],
      reed: [],
    };

    const hasRegions = typeof Regions !== 'undefined' && typeof Regions.getTrailWeight === 'function';
    const STEP = 4;
    for (let gx = -HALF_CHUNK + 2; gx <= HALF_CHUNK - 2; gx += STEP) {
      for (let gz = -HALF_CHUNK + 2; gz <= HALF_CHUNK - 2; gz += STEP) {
        const x = ox + gx + (hash2(ox + gx, oz + gz) - 0.5) * 2.8;
        const z = oz + gz + (hash2(oz + gz, ox + gx) - 0.5) * 2.8;
        const h = heightAt(x, z);
        const c = climateAt(x, z, _tmpClimate);
        const r = hash2(x * 3.1 + 11, z * 3.1 - 11);
        const sRand = hash2(x + 5, z - 5);
        // Natural age mix: ~20% young saplings (0.42..0.64 -> ~5u) + 80% towering mature trees (0.85..1.25 -> 9.5..14.5u!)
        const treeS = sRand < 0.22 ? 0.42 + (sRand / 0.22) * 0.22 : 0.85 + ((sRand - 0.22) / 0.78) * 0.40;
        const s = 0.78 + sRand * 0.48;

        // Keep worn dirt trails, Star Sanctuary stone plaza, and landmark cores clear of random trees/rocks
        const onTrail = hasRegions && Regions.getTrailWeight(x, z) > 0.28;
        const onPlaza = hasRegions && (
          x * x + z * z < 12 * 12 ||
          Math.hypot(x - 70, z + 10) < 9 ||
          Math.hypot(x - 62, z + 78) < 10 ||
          Math.hypot(x - 64, z - 70) < 9 ||
          Math.hypot(x + 86, z + 14) < 10 ||
          Math.hypot(x + 68, z + 88) < 10
        );

        if (h > WATER_Y + 0.9) {
          terrainNormalAt(x, z, _tmpNorm);
          if (_tmpNorm.y < 0.70) continue;

          const oasisDist = Math.hypot((x + 76) / 18, (z + 14) / 15);
          const nearOasisWater = oasisDist < 1.35 && h < WATER_Y + 4.4;
          const nearWarmShore = h < WATER_Y + 2.8 && c.snow < 0.15 && (c.desert > 0.15 || (x > 16 && z > 34 && z < 84));
          const nearLushShore = h < WATER_Y + 3.5 && c.desert < 0.45 && c.snow < 0.35;
          const birchPatch = noise2(x * 0.025 - 41, z * 0.025 + 67);

          const p1 = c.forest * 0.14;
          const p2 = p1 + c.meadow * 0.042;
          const p3 = p2 + (nearOasisWater ? 0.18 : (nearWarmShore ? 0.055 : 0));
          const p4 = p3 + (nearLushShore ? 0.048 : 0);
          const p5 = p4 + (nearOasisWater ? 0 : c.desert * 0.052);
          const p6 = p5 + c.snow * 0.055;

          if (!onTrail && !onPlaza && _tmpNorm.y >= 0.78 && r < p1) {
            byType.pine.push({ x, y: h - 0.08, z, s: treeS });
            colliders.push({ x, z, r: 0.42 * treeS, topY: h + 11.4 * treeS, standable: false });
            byType.fern.push({ x: x + (hash2(x, z + 3) - 0.5) * 1.6, y: h - 0.03, z: z + (hash2(x + 3, z) - 0.5) * 1.6, s: 0.75 + sRand * 0.45 });
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.78 && r < p2) {
            if (birchPatch > 0.50) {
              byType.birch.push({ x, y: h - 0.08, z, s: treeS });
              colliders.push({ x, z, r: 0.44 * treeS, topY: h + 9.2 * treeS, standable: false });
            } else {
              byType.tree.push({ x, y: h - 0.08, z, s: treeS });
              colliders.push({ x, z, r: 0.48 * treeS, topY: h + 9.8 * treeS, standable: false });
            }
            byType.fern.push({ x: x + (hash2(x, z + 7) - 0.5) * 1.7, y: h - 0.03, z: z + (hash2(x + 7, z) - 0.5) * 1.7, s: 0.72 + sRand * 0.42 });
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.78 && r < p3) {
            byType.palm.push({ x, y: h - 0.08, z, s: treeS });
            colliders.push({ x, z, r: 0.40 * treeS, topY: h + 8.4 * treeS, standable: false });
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.78 && r < p4) {
            byType.willow.push({ x, y: h - 0.08, z, s: treeS });
            colliders.push({ x, z, r: 0.58 * treeS, topY: h + 8.8 * treeS, standable: false });
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.78 && r < p5) {
            byType.cactus.push({ x, y: h - 0.05, z, s });
            colliders.push({ x, z, r: 0.65 * s, topY: h + 1.85 * s, standable: false });
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.78 && r < p6) {
            byType.pineSnow.push({ x, y: h - 0.08, z, s: treeS });
            colliders.push({ x, z, r: 0.42 * treeS, topY: h + 11.4 * treeS, standable: false });
          } else if (!onTrail && !onPlaza && r > 0.992) {
            byType.runeStone.push({ x, y: h - 0.08, z, s });
            colliders.push({ x, z, r: 0.52 * s, topY: h + 2.25 * s, standable: true });
          } else if (!onTrail && !onPlaza && r > 0.968) {
            if (c.desert > 0.30 || c.snow > 0.30 || h < WATER_Y + 2.2) {
              byType.boulderRock.push({ x, y: h - 0.08, z, s });
              colliders.push({ x, z, r: 0.82 * s, topY: h + 1.28 * s, standable: true });
            } else {
              byType.rock.push({ x, y: h - 0.08, z, s });
              colliders.push({ x, z, r: 0.54 * s, topY: h + 1.35 * s, standable: true });
            }
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.84 && (c.forest > 0.28 || c.meadow > 0.40) && r > 0.958) {
            byType.stump.push({ x, y: h - 0.06, z, s });
            colliders.push({ x, z, r: 0.72 * s, topY: h + 0.90 * s, standable: true });
          } else if (!onTrail && !onPlaza && _tmpNorm.y >= 0.86 && (c.forest > 0.28 || (c.meadow > 0.45 && h > WATER_Y + 2.0)) && r > 0.946) {
            byType.fallenLog.push({ x, y: h - 0.06, z, s });
            const logYaw = hash2(x, z) * Math.PI * 2;
            const sinY = Math.sin(logYaw);
            const cosY = Math.cos(logYaw);
            for (let k = -1; k <= 1; k++) {
              colliders.push({
                x: x + sinY * k * 0.92 * s,
                z: z + cosY * k * 0.92 * s,
                r: 0.52 * s,
                topY: h + 0.78 * s,
                standable: true,
              });
            }
          } else if (!onTrail && (c.forest > 0.35 || c.meadow > 0.45) && r > 0.86 && r <= 0.946) {
            // Broadleaf forest ferns & meadow shrubs
            byType.fern.push({ x, y: h - 0.03, z, s: 0.65 + sRand * 0.58 });
          } else if (!onTrail && (c.meadow > 0.30 || c.forest > 0.24) && c.snow < 0.30 && c.desert < 0.35 && r > 0.79 && r <= 0.86) {
            byType.bush.push({ x, y: h - 0.04, z, s: 0.80 + sRand * 0.45 });
          }
        } else if (h >= WATER_Y - 0.35 && h <= WATER_Y + 0.58 && !onTrail && r < 0.24) {
          // Coastal shoreline marsh reeds
          byType.reed.push({ x, y: h - 0.04, z, s: 0.78 + sRand * 0.52 });
        } else if (h >= WATER_Y - 1.75 && h < WATER_Y - 0.22 && !onTrail && !onPlaza && c.snow < 0.45 && r < 0.36) {
          // Calm shallow cove & oasis lilypads
          byType.lilypad.push({ x, y: WATER_Y + 0.02, z, s: 0.78 + sRand * 0.52 });
        } else if (h < WATER_Y - 2.6 && r < 0.15) {
          const baseY = h - 0.05;
          const maxScale = Math.max(0.35, (WATER_Y - 0.55 - baseY) / 3.3);
          byType.kelp.push({ x, y: baseY, z, s: Math.min(s, maxScale) });
        }
      }
    }

    if (byType.tree.length) {
      const trunkMesh = makeInstances('trunk', byType.tree, 1.0, true, true, _tintNeutral);
      const canopyMesh = makeInstances('oakCanopy', byType.tree, 1.0, true, true, _tintOak);
      meshes.push(trunkMesh, canopyMesh);
      registerPropSwap('tree', trunkMesh, chunk, [canopyMesh]);
    }
    if (byType.birch.length) {
      const trunkMesh = makeInstances('birchTrunk', byType.birch, 1.0, true, true, _tintNeutral);
      const canopyMesh = makeInstances('birchCanopy', byType.birch, 1.0, true, true, _tintBirch);
      meshes.push(trunkMesh, canopyMesh);
      registerPropSwap('birch', trunkMesh, chunk, [canopyMesh]);
    }
    if (byType.pine.length) {
      const trunkMesh = makeInstances('trunk', byType.pine, 0.85, true, true, _tintNeutral);
      const canopyMesh = makeInstances('pineCanopy', byType.pine, 1.0, true, true, _tintPine);
      meshes.push(trunkMesh, canopyMesh);
      registerPropSwap('pine', trunkMesh, chunk, [canopyMesh]);
    }
    if (byType.pineSnow.length) {
      const trunkMesh = makeInstances('trunk', byType.pineSnow, 0.85, true, true, _tintNeutral);
      const canopyMesh = makeInstances('pineSnowCanopy', byType.pineSnow, 1.0, true, true, _tintNeutral);
      meshes.push(trunkMesh, canopyMesh);
      registerPropSwap('pineSnow', trunkMesh, chunk, [canopyMesh]);
    }
    if (byType.willow.length) {
      const trunkMesh = makeInstances('trunk', byType.willow, 0.90, true, true, _tintNeutral);
      const canopyMesh = makeInstances('willowCanopy', byType.willow, 1.0, true, true, _tintWillow);
      meshes.push(trunkMesh, canopyMesh);
      registerPropSwap('willow', trunkMesh, chunk, [canopyMesh]);
    }
    if (byType.palm.length) {
      const trunkMesh = makeInstances('palmTrunk', byType.palm, 1.0, true, true, _tintNeutral);
      const canopyMesh = makeInstances('palmCanopy', byType.palm, 1.0, true, true, _tintPalm);
      meshes.push(trunkMesh, canopyMesh);
      registerPropSwap('palm', trunkMesh, chunk, [canopyMesh]);
    }
    if (byType.cactus.length) {
      const m = makeInstances('cactus', byType.cactus, 1.0, true, true, _tintNeutral);
      meshes.push(m);
      registerPropSwap('cactus', m, chunk, null);
    }
    if (byType.bush.length) {
      const m = makeInstances('bush', byType.bush, 1.0, true, true, _tintOak, true);
      meshes.push(m);
      registerPropSwap('bush', m, chunk, null);
    }
    if (byType.rock.length) {
      const m = makeInstances('rock', byType.rock, 1.0, true, true, _tintNeutral);
      meshes.push(m);
      registerPropSwap('rock', m, chunk, null);
    }
    if (byType.boulderRock.length) {
      const m = makeInstances('boulderRock', byType.boulderRock, 1.0, true, true, _tintNeutral);
      meshes.push(m);
      registerPropSwap('boulderRock', m, chunk, null);
    }
    if (byType.fallenLog.length) {
      const m = makeInstances('fallenLog', byType.fallenLog, 1.0, true, true, _tintNeutral, true);
      meshes.push(m);
      registerPropSwap('fallenLog', m, chunk, null);
    }
    if (byType.stump.length) {
      const m = makeInstances('stump', byType.stump, 1.0, true, true, _tintNeutral, true);
      meshes.push(m);
      registerPropSwap('stump', m, chunk, null);
    }
    if (byType.lilypad.length) {
      const m = makeInstances('lilypad', byType.lilypad, 1.0, false, true, _tintNeutral, true);
      meshes.push(m);
      registerPropSwap('lilypad', m, chunk, null);
    }
    if (byType.runeStone.length) {
      meshes.push(makeInstances('runeStone', byType.runeStone, 1.0, true, true, _tintNeutral));
    }
    if (byType.kelp.length) {
      meshes.push(makeInstances('kelp', byType.kelp, 1.0, false, true, _tintNeutral));
    }
    if (byType.fern.length) {
      meshes.push(makeInstances('fern', byType.fern, 1.0, true, true, _tintOak));
    }
    if (byType.reed.length) {
      meshes.push(makeInstances('reed', byType.reed, 1.0, false, true, _tintNeutral));
    }

    buildChunkGrass(chunk);
    chunks.set(chunkKey(cx, cz), chunk);
  }

  updateChunks = function updateChunksImpl(px, pz) {
    const pcx = Math.floor((px + HALF_CHUNK) / CHUNK);
    const pcz = Math.floor((pz + HALF_CHUNK) / CHUNK);

    // Build nearest missing chunk (one per frame to keep frame time flat)
    let bestCx = 0;
    let bestCz = 0;
    let bestD = Infinity;
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!chunks.has(chunkKey(cx, cz))) {
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            bestCx = cx;
            bestCz = cz;
          }
        }
      }
    }
    if (bestD < Infinity) {
      buildChunk(bestCx, bestCz);
    }

    // Smoothly refresh up to 2 chunks whose grass density changed via setQuality
    let refreshed = 0;
    for (const chunk of chunks.values()) {
      if (chunk.grassDirty) {
        buildChunkGrass(chunk);
        refreshed++;
        if (refreshed >= 2) break;
      }
    }

    // Unload distant chunks and dispose ONLY chunk-unique geometries
    _unloadKeys.length = 0;
    const hasUnreg = typeof Env !== 'undefined' && Env && typeof Env.unregisterChunk === 'function';
    for (const [key, chunk] of chunks) {
      if (Math.abs(chunk.cx - pcx) > VIEW_RADIUS + 1 || Math.abs(chunk.cz - pcz) > VIEW_RADIUS + 1) {
        chunk.disposed = true;
        if (hasUnreg) Env.unregisterChunk(chunk);
        for (let i = 0; i < chunk.meshes.length; i++) {
          scene.remove(chunk.meshes[i]);
        }
        for (let i = 0; i < chunk.uniqueGeos.length; i++) {
          chunk.uniqueGeos[i].dispose();
        }
        _unloadKeys.push(key);
      }
    }
    for (let i = 0; i < _unloadKeys.length; i++) {
      chunks.delete(_unloadKeys[i]);
    }
  };

  getQuality = function getQualityImpl() {
    return qualityMode;
  };

  setQuality = function setQualityImpl(mode) {
    const next = mode === 'balanced' ? 'balanced' : 'high';
    if (next === qualityMode) return qualityMode;
    qualityMode = next;

    if (typeof Env !== 'undefined' && Env && typeof Env.setQuality === 'function') {
      Env.setQuality(next);
    }

    const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
    renderer.setPixelRatio(Math.min(dpr, next === 'high' ? 2 : 1.25));

    const targetShadow = Math.min(next === 'high' ? 2048 : 1024, maxTexSize);
    if (sun.shadow.mapSize.x !== targetShadow || sun.shadow.mapSize.y !== targetShadow) {
      sun.shadow.mapSize.set(targetShadow, targetShadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }

    for (const chunk of chunks.values()) {
      for (let i = 0; i < chunk.grassMeshes.length; i++) {
        const gm = chunk.grassMeshes[i];
        scene.remove(gm);
        const idx = chunk.meshes.indexOf(gm);
        if (idx >= 0) chunk.meshes.splice(idx, 1);
      }
      chunk.grassMeshes.length = 0;
      chunk.grassDirty = chunk.hasDryLand;
      if (chunk.hasWater) {
        buildChunkWaterTile(chunk);
      }
    }

    return qualityMode;
  };

  // ---------- distant horizon ocean ring ----------

  const horizonGroup = new THREE.Group();
  {
    const R_IN = (VIEW_RADIUS + 0.5) * CHUNK;
    const R_OUT = 460;
    const BAND = R_OUT - R_IN;
    const MID = R_IN + BAND * 0.5;

    const north = new THREE.Mesh(new THREE.PlaneGeometry(R_OUT * 2, BAND), horizonWaterMat);
    north.rotation.x = -Math.PI / 2;
    north.position.set(0, 0, -MID);

    const south = new THREE.Mesh(new THREE.PlaneGeometry(R_OUT * 2, BAND), horizonWaterMat);
    south.rotation.x = -Math.PI / 2;
    south.position.set(0, 0, MID);

    const west = new THREE.Mesh(new THREE.PlaneGeometry(BAND, R_IN * 2), horizonWaterMat);
    west.rotation.x = -Math.PI / 2;
    west.position.set(-MID, 0, 0);

    const east = new THREE.Mesh(new THREE.PlaneGeometry(BAND, R_IN * 2), horizonWaterMat);
    east.rotation.x = -Math.PI / 2;
    east.position.set(MID, 0, 0);

    horizonGroup.add(north, south, west, east);
  }
  scene.add(horizonGroup);

  // ---------- atmospheric sky dome & constellations ----------

  const skyDomeObj = (typeof Shaders !== 'undefined' && typeof Shaders.createSkyDome === 'function')
    ? Shaders.createSkyDome()
    : {
        mesh: new THREE.Mesh(
          new THREE.SphereGeometry(460, 24, 16),
          new THREE.MeshStandardMaterial({ color: 0x243456, side: THREE.BackSide })
        ),
        material: null,
      };
  const skyDome = skyDomeObj.mesh;
  scene.add(skyDome);

  const skyStarGeo = new THREE.BufferGeometry();
  {
    const pts = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.15 + Math.random() * 0.85;
      const r = Math.sqrt(1 - y * y) * 430;
      pts[i * 3] = Math.cos(a) * r;
      pts[i * 3 + 1] = y * 430;
      pts[i * 3 + 2] = Math.sin(a) * r;
    }
    skyStarGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  }
  const skyStarMat = new THREE.PointsMaterial({
    color: 0xfff6d9,
    size: 2.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.25,
    fog: false,
  });
  const constellations = new THREE.Points(skyStarGeo, skyStarMat);
  scene.add(constellations);

  const skyConstellations = new THREE.Group();
  scene.add(skyConstellations);
  const litShapes = [];

  function makeSkyLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    g.font = 'italic 52px Georgia, serif';
    g.fillStyle = '#ffe9a8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#000';
    g.shadowBlur = 8;
    g.fillText(text, 256, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      fog: false,
    }));
    sprite.scale.set(52, 13, 1);
    return sprite;
  }

  addConstellation = function addConstellationImpl(name) {
    const shape = CONSTELLATIONS.find(s => s.name === name) || CONSTELLATIONS[0];
    const az = Math.random() * Math.PI * 2;
    const elev = 0.5 + Math.random() * 0.6;
    const R = 420, S = 60;
    const cosE = Math.cos(elev), sinE = Math.sin(elev);
    const centre = new THREE.Vector3(Math.cos(az) * cosE * R, sinE * R, Math.sin(az) * cosE * R);
    const t1 = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const t2 = new THREE.Vector3().crossVectors(t1, centre.clone().normalize()).normalize();

    const starPos = new Float32Array(shape.pts.length * 3);
    const byIndex = [];
    let maxV = 0;
    shape.pts.forEach(([u, v], i) => {
      const p = centre.clone()
        .addScaledVector(t1, u * S)
        .addScaledVector(t2, v * S);
      byIndex.push(p);
      starPos[i * 3] = p.x;
      starPos[i * 3 + 1] = p.y;
      starPos[i * 3 + 2] = p.z;
      maxV = Math.max(maxV, v);
    });

    const starMatC = new THREE.PointsMaterial({
      color: 0xfff2c0,
      size: 4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.95,
      fog: false,
    });
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
      starMatC
    );

    const linePos = new Float32Array(shape.edges.length * 2 * 3);
    shape.edges.forEach(([a, b], i) => {
      linePos.set(
        [byIndex[a].x, byIndex[a].y, byIndex[a].z, byIndex[b].x, byIndex[b].y, byIndex[b].z],
        i * 6
      );
    });
    const lineMatC = new THREE.LineBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0.5,
      fog: false,
    });
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(linePos, 3)),
      lineMatC
    );

    const label = makeSkyLabel(shape.name);
    label.position.copy(centre).addScaledVector(t2, maxV * S + 34);

    const group = new THREE.Group();
    group.add(stars, lines, label);
    skyConstellations.add(group);
    litShapes.push({ starMatC, lineMatC, phase: Math.random() * 6 });
  };

  // ---------- sky progression & zero-GC environment loop ----------
  // Dramatic 3-act celestial restoration:
  //   0/8: Starless Midnight Gloom -> 4/8: Rose-Amber Dawn Break -> 8/8: Radiant Sunlit Azure Day!

  const SKY = {
    darkTop: new THREE.Color(0x050918),
    darkMid: new THREE.Color(0x0d1732),
    darkBot: new THREE.Color(0x1a284a),
    dawnTop: new THREE.Color(0x1c356e),
    dawnMid: new THREE.Color(0x745882),
    dawnBot: new THREE.Color(0xdf8f6b),
    dayTop:  new THREE.Color(0x3680cc),
    dayMid:  new THREE.Color(0x78b8e2),
    dayBot:  new THREE.Color(0xc4e2ec),
    deepFog: new THREE.Color(0x0b4c5e),
    deepBg:  new THREE.Color(0x08384a),
    sunDark: new THREE.Color(0x7ea6e4),
    sunDawn: new THREE.Color(0xffac60),
    sunDay:  new THREE.Color(0xfff1cc),
    hemiSkyDark: new THREE.Color(0x2e4875),
    hemiSkyDawn: new THREE.Color(0x9e8eb0),
    hemiSkyDay:  new THREE.Color(0xa6d2f2),
    hemiGndDark: new THREE.Color(0x0e151c),
    hemiGndDay:  new THREE.Color(0x3d4f38),
  };

  const _skyTop = SKY.darkTop.clone();
  const _skyMid = SKY.darkMid.clone();
  const _skyBot = SKY.darkBot.clone();
  const _fogColor = SKY.darkBot.clone();
  const _shadowLightDir = _sunDir.clone();
  const _playerPos = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _lightUpRef = new THREE.Vector3(0, 1, 0);
  const _lightRight = new THREE.Vector3(1, 0, 0);
  const _lightUp = new THREE.Vector3(0, 1, 0);
  const _envCtx = {
    px: 0,
    py: 0,
    pz: 0,
    camX: 0,
    camY: 0,
    camZ: 0,
    waterY: WATER_Y,
    regionId: '',
    underwater: false,
  };

  let skyProgress = 0;
  let _litCount = 0;
  let _lastEnvProgress = -1;
  let underwater = false;
  const _hasEnv = typeof Env !== 'undefined' && Env;

  getSkyProgress = () => skyProgress;

  function syncLightBasis() {
    _lightRight.crossVectors(_lightUpRef, _shadowLightDir);
    if (_lightRight.lengthSq() < 1e-6) _lightRight.set(1, 0, 0);
    _lightRight.normalize();
    _lightUp.crossVectors(_shadowLightDir, _lightRight).normalize();
  }
  syncLightBasis();

  function applyCelestialState(cel) {
    if (!cel) return;
    if (cel.skyTop) _skyTop.copy(cel.skyTop);
    if (cel.skyMid) _skyMid.copy(cel.skyMid);
    if (cel.skyBot) _skyBot.copy(cel.skyBot);
    if (cel.hemiSky && hemiLight.color) hemiLight.color.copy(cel.hemiSky);
    if (cel.hemiGround && hemiLight.groundColor) hemiLight.groundColor.copy(cel.hemiGround);
    if (typeof cel.hemiIntensity === 'number') hemiLight.intensity = cel.hemiIntensity;
    if (cel.sunColor && sun.color) sun.color.copy(cel.sunColor);
    if (typeof cel.sunIntensity === 'number') sun.intensity = cel.sunIntensity;
    if (cel.sunDir) _sunDir.copy(cel.sunDir).normalize();
    if (cel.shadowDir) {
      _shadowLightDir.copy(cel.shadowDir).normalize();
    } else if (cel.sunDir) {
      _shadowLightDir.copy(_sunDir);
    }
    if (typeof cel.dayProgress === 'number') {
      skyProgress = cel.dayProgress < 0 ? 0 : (cel.dayProgress > 1 ? 1 : cel.dayProgress);
    }
    syncLightBasis();
    sun.position.set(
      sun.target.position.x + _shadowLightDir.x * 75,
      sun.target.position.y + _shadowLightDir.y * 75,
      sun.target.position.z + _shadowLightDir.z * 75
    );
  }

  setSkyProgress = function setSkyProgressImpl(lit) {
    _litCount = lit;
    const p = Math.min(1, Math.max(0, lit / DAY_SKY_MAX_LIT));
    let cel = null;
    if (_hasEnv) {
      if (typeof Env.setSkyProgress === 'function') {
        cel = Env.setSkyProgress(lit);
      }
      if (!cel && typeof Env.getCelestialState === 'function') {
        cel = Env.getCelestialState();
      }
      if (!cel && typeof Env.computeCelestialState === 'function') {
        cel = Env.computeCelestialState(lit, 0);
      }
      if (cel && typeof Env.setSkyProgress !== 'function' && typeof Shaders !== 'undefined' && typeof Shaders.setCelestial === 'function' && cel.moonDir) {
        Shaders.setCelestial(cel.moonDir, cel.moonColor, cel.nightFactor);
      }
    }

    if (cel) {
      applyCelestialState(cel);
    } else {
      skyProgress = p;

      if (p <= 0.5) {
        const t = p * 2;
        _skyTop.copy(SKY.darkTop).lerp(SKY.dawnTop, t);
        _skyMid.copy(SKY.darkMid).lerp(SKY.dawnMid, t);
        _skyBot.copy(SKY.darkBot).lerp(SKY.dawnBot, t);
        hemiLight.color.copy(SKY.hemiSkyDark).lerp(SKY.hemiSkyDawn, t);
        sun.color.copy(SKY.sunDark).lerp(SKY.sunDawn, t);
      } else {
        const t = (p - 0.5) * 2;
        _skyTop.copy(SKY.dawnTop).lerp(SKY.dayTop, t);
        _skyMid.copy(SKY.dawnMid).lerp(SKY.dayMid, t);
        _skyBot.copy(SKY.dawnBot).lerp(SKY.dayBot, t);
        hemiLight.color.copy(SKY.hemiSkyDawn).lerp(SKY.hemiSkyDay, t);
        sun.color.copy(SKY.sunDawn).lerp(SKY.sunDay, t);
      }

      // Sky begins almost completely starless (0.03) and blazes back to life with every relit Totem!
      // Strong sunlit contrast (warm golden sun vs. deeper cool shadows) once day returns!
      skyStarMat.opacity = Math.min(1, 0.03 + lit * 0.125);
      hemiLight.intensity = 0.20 + p * 0.44;
      hemiLight.groundColor.copy(SKY.hemiGndDark).lerp(SKY.hemiGndDay, p);

      sun.intensity = 0.25 + p * 1.58;
      _sunDir.set(0.48, 0.34 + p * 0.44, 0.38).normalize();
      _shadowLightDir.copy(_sunDir);
      syncLightBasis();
      sun.position.set(
        sun.target.position.x + _shadowLightDir.x * 75,
        sun.target.position.y + _shadowLightDir.y * 75,
        sun.target.position.z + _shadowLightDir.z * 75
      );
    }

    _lastEnvProgress = skyProgress;
    if (typeof Textures !== 'undefined' && typeof Textures.updateEnvMap === 'function') {
      Textures.updateEnvMap(renderer, scene, _skyTop, _skyBot, _shadowLightDir, skyProgress);
    }
  };

  if (typeof Regions !== 'undefined' && typeof Regions.buildWorldLandmarks === 'function') {
    worldLandmarks = Regions.buildWorldLandmarks(
      scene,
      heightAt,
      terrainNormalAt,
      typeof Textures !== 'undefined' ? Textures : null
    );
  }

  if (_hasEnv) {
    if (typeof Env.initScene === 'function') {
      Env.initScene(scene, {
        THREE,
        Shaders: typeof Shaders !== 'undefined' ? Shaders : null,
        Textures: typeof Textures !== 'undefined' ? Textures : null,
      });
      constellations.visible = false;
      skyStarMat.opacity = 0;
    }
    if (typeof Env.preloadAll === 'function') {
      Env.preloadAll({
        THREE,
        Shaders: typeof Shaders !== 'undefined' ? Shaders : null,
        Textures: typeof Textures !== 'undefined' ? Textures : null,
      });
    }
  }

  setSkyProgress(0);

  updateEnvironment = function updateEnvironmentImpl(camY, px, pz, time, dt, regionId) {
    const t = time || 0;
    const stepDt = dt || 0;
    const py = typeof P !== 'undefined' && P && typeof P.y === 'number' ? P.y : heightAt(px, pz);
    const nowUnder = camY < WATER_Y - 0.1;

    if (_hasEnv && typeof Env.update === 'function') {
      _envCtx.px = px;
      _envCtx.py = py;
      _envCtx.pz = pz;
      _envCtx.camX = camera.position.x;
      _envCtx.camY = camY;
      _envCtx.camZ = camera.position.z;
      _envCtx.waterY = WATER_Y;
      _envCtx.regionId = regionId || '';
      _envCtx.underwater = nowUnder;
      Env.update(stepDt, t, _envCtx);

      const cel = typeof Env.getCelestialState === 'function' ? Env.getCelestialState() : null;
      if (cel) {
        applyCelestialState(cel);
        if (_litCount >= DAY_SKY_MAX_LIT && Math.abs(skyProgress - _lastEnvProgress) >= 0.12) {
          _lastEnvProgress = skyProgress;
          if (typeof Textures !== 'undefined' && typeof Textures.updateEnvMap === 'function') {
            Textures.updateEnvMap(renderer, scene, _skyTop, _skyBot, _shadowLightDir, skyProgress);
          }
        }
      }
    }

    skyDome.position.set(px, 0, pz);
    if (constellations.visible) constellations.position.set(px, 0, pz);
    skyConstellations.position.set(px, 0, pz);

    const pcx = Math.floor((px + HALF_CHUNK) / CHUNK);
    const pcz = Math.floor((pz + HALF_CHUNK) / CHUNK);
    horizonGroup.position.set(pcx * CHUNK, WATER_Y - 0.03, pcz * CHUNK);

    for (let i = 0; i < litShapes.length; i++) {
      const c = litShapes[i];
      const pulse = Math.sin(t * 1.5 + c.phase) * 0.15;
      c.starMatC.opacity = 0.85 + pulse;
      c.lineMatC.opacity = 0.45 + pulse;
    }

    // Light-space texel-snapped directional shadow camera preserves full 3D depth along _shadowLightDir
    const shadowMapDim = sun.shadow.mapSize.x || 1024;
    const texelSize = SUN_SHADOW_SPAN / shadowMapDim;
    const u = px * _lightRight.x + py * _lightRight.y + pz * _lightRight.z;
    const v = px * _lightUp.x + py * _lightUp.y + pz * _lightUp.z;
    const w = px * _shadowLightDir.x + py * _shadowLightDir.y + pz * _shadowLightDir.z;
    const su = Math.round(u / texelSize) * texelSize;
    const sv = Math.round(v / texelSize) * texelSize;
    const tx = su * _lightRight.x + sv * _lightUp.x + w * _shadowLightDir.x;
    const ty = su * _lightRight.y + sv * _lightUp.y + w * _shadowLightDir.y;
    const tz = su * _lightRight.z + sv * _lightUp.z + w * _shadowLightDir.z;
    sun.target.position.set(tx, ty, tz);
    sun.target.updateMatrixWorld();
    sun.position.set(tx + _shadowLightDir.x * 75, ty + _shadowLightDir.y * 75, tz + _shadowLightDir.z * 75);

    if (nowUnder !== underwater) {
      underwater = nowUnder;
      if (typeof Sound !== 'undefined' && typeof Sound.setMuffled === 'function') {
        Sound.setMuffled(underwater);
      }
    }

    let fogNear, fogFar;
    if (underwater) {
      fogNear = 3;
      fogFar = 58;
      _fogColor.copy(SKY.deepFog);
      scene.background.copy(SKY.deepBg);
    } else {
      fogNear = 42 + skyProgress * 10;
      fogFar = 124 + skyProgress * 46;
      _fogColor.copy(_skyBot);
      scene.background.copy(_skyBot);
    }
    scene.fog.color.copy(_fogColor);
    scene.fog.near = fogNear;
    scene.fog.far = fogFar;

    if (typeof Shaders !== 'undefined' && typeof Shaders.update === 'function') {
      _playerPos.set(px, py, pz);
      _camPos.copy(camera.position);
      Shaders.update(
        t,
        _playerPos,
        _camPos,
        _sunDir,
        skyProgress,
        _skyTop,
        _skyMid,
        _skyBot,
        _fogColor,
        fogNear,
        fogFar
      );
    }
  };
}
