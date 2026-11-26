// ============================================================
// game.js - Blobby Worlds: "The Starkeeper"
//
// Consumes globals:
//   THREE, Sound, Textures, Shaders, Env, Regions, world.js globals, Models, Rig, Physics, Animals, Enemies
// Exposes:
//   window.__GAME_DEBUG__
// ============================================================

'use strict';

// ---------- 1. Species & Constants ----------

const LAND = [
  { name: 'Moss Lynx',         plan: 'quad',   archetype: 'cat',      body: 'round', color: 0x8fce6a, deco: 'ears',
    names: ['Clover', 'Fern', 'Momo', 'Willow', 'Bramble', 'Hazel', 'Pip', 'Sorrel', 'Sage', 'Lichen'] },
  { name: 'Berry Beetle',      plan: 'bug',    archetype: 'beetle',   color: 0xe2656a, deco: 'spots',
    names: ['Pippin', 'Ruby', 'Dot', 'Crimson', 'Bramble', 'Juniper', 'Marigold', 'Cora'] },
  { name: 'Meadow Kiwi',       plan: 'bird',   archetype: 'kiwi',     color: 0xc9a86a, deco: 'crest', beak: 0.55,
    names: ['Tui', 'Biscuit', 'Kauri', 'Nutmeg', 'Pebble', 'Acorn', 'Ruru', 'Toffee'] },
  { name: 'Cloud Wren',        plan: 'bird',   archetype: 'songbird', color: 0xf2f5f7, deco: 'crest',
    names: ['Nimbus', 'Cirrus', 'Flit', 'Breeze', 'Lark', 'Wisp', 'Chirp', 'Puff'] },
  { name: 'Ember Drake',       plan: 'lizard', archetype: 'lizard',   color: 0xf78e5d, deco: 'fins',
    names: ['Cinder', 'Spark', 'Flint', 'Blaze', 'Pyro', 'Hearth', 'Ash', 'Singe'] },
  { name: 'Starlight Unicorn', plan: 'quad',   archetype: 'deer',     body: 'tall',  color: 0xa887d6, deco: 'horn',
    names: ['Lyra', 'Orion', 'Celeste', 'Vesper', 'Aurelia', 'Nova', 'Sol', 'Althea'] },
  { name: 'Lantern Firefly',   plan: 'bug',    archetype: 'firefly',  color: 0xbde36a, deco: 'ears',
    names: ['Glimmer', 'Flicker', 'Dewdrop', 'Lumen', 'Gleam', 'Twinkle', 'Sprout', 'Beam'] },
  { name: 'Timber Wolf',       plan: 'quad',   archetype: 'wolf',     body: 'mid',   color: 0x7e6855, deco: 'ears',
    names: ['Koda', 'Timber', 'Ash', 'Bramble', 'Lupin', 'Oakley', 'Cedar', 'Fen'] },
  { name: 'Golden Owl',        plan: 'bird',   archetype: 'owl',      color: 0xf7d948, deco: 'crown',
    names: ['Archimedes', 'Soren', 'Apollo', 'Aurelius', 'Topaz', 'Helios', 'Vega', 'Orpheus'] },
  { name: 'Frost Fox',         plan: 'quad',   archetype: 'fox',      body: 'round', color: 0xbfe3f0, deco: 'ears',
    names: ['Yuki', 'Glacier', 'Boreal', 'Flurry', 'Shiver', 'Sleet', 'Polaris', 'Snowdrop'] },
];
const AQUA = [
  { name: 'Seafoam Fin',  plan: 'fish',  color: 0x6ad9d0, aquatic: true,
    names: ['Ripple', 'Marina', 'Splash', 'Tide', 'Nautilus', 'Crest'] },
  { name: 'Coral Dart',   plan: 'fish',  color: 0xf78ea8, deco: 'spots', aquatic: true,
    names: ['Anemone', 'Pearl', 'Reef', 'Saffron', 'Lagoon', 'Petal'] },
  { name: 'Moon Jelly',   plan: 'jelly', color: 0x8fbdf7, aquatic: true,
    names: ['Lumina', 'Drift', 'Aurelia', 'Gossamer', 'Halo', 'Shimmer'] },
  { name: 'Kelp Eel',     plan: 'eel',   color: 0x5ab86a, aquatic: true,
    names: ['Frond', 'Ribbon', 'Current', 'Verdant', 'Swell', 'Eddy'] },
  { name: 'Starlight Manta', plan: 'fish', archetype: 'manta', color: 0x4b74d8, aquatic: true,
    names: ['Glide', 'Celestia', 'Ray', 'Abyssal', 'Manta', 'Vega'] },
];
const WISH_SPECIES = { name: 'Wish', plan: 'bird', color: 0xffd93b, deco: 'crown' };

const usedCritterNames = new Set();
function pickUniqueCritterName(sp) {
  const pool = (sp && sp.names) || ['Starling'];
  const unused = pool.filter(n => !usedCritterNames.has(n + ':' + sp.name));
  const choice = unused.length > 0
    ? unused[Math.floor(Math.random() * unused.length)]
    : pool[Math.floor(Math.random() * pool.length)];
  usedCritterNames.add(choice + ':' + sp.name);
  return `${choice} the ${sp.name}`;
}

let unlockedLand = 3; // grows as totems are lit
let started = false;

const P = Physics.P;
const AIR_MAX = Physics.AIR_MAX;

// Module-scope reusable scratch objects & buffers (zero GC in hot loops)
const _camFwd = new THREE.Vector3();
const _joyOut = { ox: 0, oy: 0, nx: 0, ny: 0, outMag: 0, rawMag: 0, sprinting: false };
const _wishTargetVec = new THREE.Vector3();
const _playerPickupVec = new THREE.Vector3();
const _allyPickupVec = new THREE.Vector3();
const _boltFrom = new THREE.Vector3();
const _boltDir = new THREE.Vector3();
const _trailTip = new THREE.Vector3();
const _trailButt = new THREE.Vector3();
const _trailInner = new THREE.Vector3();
const _trailPrevTip = new THREE.Vector3();
const _trailPrevButt = new THREE.Vector3();
const _trailMidA = new THREE.Vector3();
const _trailMidB = new THREE.Vector3();
const _trailDirA = new THREE.Vector3();
const _trailDirB = new THREE.Vector3();
const _trailCol = new THREE.Color(0x5ef8e8);
const _followDir = new THREE.Vector3();
const _critterNorm = new THREE.Vector3(0, 1, 0);
const _critterAnimOpts = { idleTime: 0, airborne: false };
const _gloomColBuf = [];
const _critterColBuf = [];
const _colOut = { x: 0, z: 0, hit: false };
const _lockCandidates = [];
const _lookCandidates = [];
const _tramplerSlots = [];
const _MAX_GRASS_TRAMPLERS = (typeof Shaders !== 'undefined' && Shaders.MAX_TRAMPLERS) || 16;
for (let i = 0; i < _MAX_GRASS_TRAMPLERS; i++) {
  _tramplerSlots.push({ d2: Infinity, x: 0, y: 0, z: 0, r: 0 });
}

function critterGrassRadius(sp, scale = 1) {
  const arch = (sp && (sp.archetype || sp.plan)) || 'quad';
  let base = 1.45;
  if (arch === 'bear' || arch === 'deer' || arch === 'wolf' || arch === 'stag' || arch === 'unicorn') base = 1.72;
  else if (arch === 'cat' || arch === 'fox' || arch === 'lizard' || arch === 'drake') base = 1.48;
  else if (arch === 'kiwi' || arch === 'owl' || arch === 'songbird' || arch === 'bird') base = 1.22;
  else if (arch === 'beetle' || arch === 'firefly') base = 1.08;
  return base * scale;
}

function pushGrassTrampler(count, x, y, z, radius) {
  const dx = x - P.x;
  const dz = z - P.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > 44 * 44) return count;

  if (count < _MAX_GRASS_TRAMPLERS) {
    const slot = _tramplerSlots[count];
    slot.d2 = d2;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.r = radius;
    return count + 1;
  }

  // Replace farthest trampler if this creature is closer to the player
  let farIdx = 0;
  let farD2 = _tramplerSlots[0].d2;
  for (let i = 1; i < _MAX_GRASS_TRAMPLERS; i++) {
    if (_tramplerSlots[i].d2 > farD2) {
      farD2 = _tramplerSlots[i].d2;
      farIdx = i;
    }
  }
  if (d2 < farD2) {
    const slot = _tramplerSlots[farIdx];
    slot.d2 = d2;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.r = radius;
  }
  return count;
}

function gloomGrassRadius(g) {
  const tierKey = g && (g.tierKey || (g.tier && g.tier.key));
  if (tierKey === 'behemoth') return 2.85;
  if (tierKey === 'knight') return 2.20;
  if (tierKey === 'imp') return 1.95;
  if (tierKey === 'puglin' || tierKey === 'weaver') return 1.80;
  return 1.72;
}

function updateGrassTramplers() {
  if (typeof Shaders === 'undefined' || typeof Shaders.setTrampler !== 'function') return;
  let n = 0;

  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    const p = f.mesh.position;
    n = pushGrassTrampler(n, p.x, p.y, p.z, critterGrassRadius(f.species, 0.9));
  }
  for (let i = 0; i < wild.length; i++) {
    const w = wild[i];
    const p = w.mesh.position;
    n = pushGrassTrampler(n, p.x, p.y, p.z, critterGrassRadius(w.species, 1.0));
  }
  for (let i = 0; i < glooms.length; i++) {
    const g = glooms[i];
    if (g.hp <= 0 || g.underwater) continue;
    const p = g.mesh.position;
    n = pushGrassTrampler(n, p.x, p.y, p.z, gloomGrassRadius(g));
  }
  if (wish && wish.mesh && wish.mesh.position) {
    const wp = wish.mesh.position;
    n = pushGrassTrampler(n, wp.x, wp.y, wp.z, 1.12);
  }

  for (let i = 0; i < n; i++) {
    const s = _tramplerSlots[i];
    Shaders.setTrampler(i, s.x, s.y, s.z, s.r);
  }
  if (typeof Shaders.clearTramplersFrom === 'function') {
    Shaders.clearTramplersFrom(n);
  }
}

// ---------- 2. Pooled Particle System (Zero GC) ----------

const MAX_PARTICLES = 320;
const MAX_BUBBLES = 80;

const _pDummy = new THREE.Object3D();
const _pColor = new THREE.Color(0xffffff);

function makeParticlePool(capacity, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;

  const slots = new Array(capacity);
  _pDummy.position.set(0, 0, 0);
  _pDummy.rotation.set(0, 0, 0);
  _pDummy.scale.set(0, 0, 0);
  _pDummy.updateMatrix();
  _pColor.setHex(0xffffff);

  for (let i = 0; i < capacity; i++) {
    slots[i] = {
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rotSpd: 0,
      life: 0,
      maxLife: 1,
      gravity: -9,
      size: 1,
    };
    mesh.setMatrixAt(i, _pDummy.matrix);
    mesh.setColorAt(i, _pColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  return {
    mesh,
    slots,
    capacity,
    cursor: 0,
    matrixDirty: false,
    colorDirty: false,
  };
}

const particlePool = makeParticlePool(
  MAX_PARTICLES,
  new THREE.OctahedronGeometry(0.11, 0),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
const bubblePool = makeParticlePool(
  MAX_BUBBLES,
  new THREE.SphereGeometry(0.075, 6, 5),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 })
);

function spawnPooled(pool, x, y, z, colorHex, vx, vy, vz, maxLife, gravity, size) {
  const slots = pool.slots;
  const cap = pool.capacity;
  let idx = -1;
  for (let n = 0; n < cap; n++) {
    const cand = (pool.cursor + n) % cap;
    if (!slots[cand].active) {
      idx = cand;
      break;
    }
  }
  if (idx === -1) {
    idx = pool.cursor;
  }
  pool.cursor = (idx + 1) % cap;

  const s = slots[idx];
  s.active = true;
  s.x = x;
  s.y = y;
  s.z = z;
  s.vx = vx;
  s.vy = vy;
  s.vz = vz;
  s.rx = Math.random() * Math.PI * 2;
  s.ry = Math.random() * Math.PI * 2;
  s.rotSpd = 3 + Math.random() * 5;
  s.life = maxLife;
  s.maxLife = maxLife;
  s.gravity = gravity;
  s.size = size;

  _pDummy.position.set(x, y, z);
  _pDummy.rotation.set(s.rx, s.ry, 0);
  _pDummy.scale.set(size, size, size);
  _pDummy.updateMatrix();
  pool.mesh.setMatrixAt(idx, _pDummy.matrix);

  _pColor.setHex(colorHex);
  pool.mesh.setColorAt(idx, _pColor);

  pool.matrixDirty = true;
  pool.colorDirty = true;
}

function burst(x, y, z, color, count, rise) {
  const n = count | 0;
  if (n <= 0) return;
  if (rise) {
    for (let i = 0; i < n; i++) {
      spawnPooled(
        bubblePool,
        x + (Math.random() - 0.5) * 0.35,
        y + (Math.random() - 0.5) * 0.25,
        z + (Math.random() - 0.5) * 0.35,
        color,
        (Math.random() - 0.5) * 1.4,
        1.15 + Math.random() * 1.2,
        (Math.random() - 0.5) * 1.4,
        1.35 + Math.random() * 0.35,
        0.55,
        0.85 + Math.random() * 0.45
      );
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    spawnPooled(
      particlePool,
      x,
      y,
      z,
      color,
      (Math.random() - 0.5) * 5.2,
      2.0 + Math.random() * 3.8,
      (Math.random() - 0.5) * 5.2,
      0.75 + Math.random() * 0.35,
      -9.5,
      0.85 + Math.random() * 0.55
    );
  }
}

function dustBurst(x, y, z, count = 4, surface = 'grass') {
  if (surface === 'water') {
    splashBurst(x, y, z, count);
    return;
  }
  let col = 0xc5bd8e;
  if (surface === 'sand') col = 0xe6d49c;
  else if (surface === 'snow') col = 0xeaf6ff;
  else if (surface === 'stone') col = 0xb5afa8;

  const n = count | 0;
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    spawnPooled(
      particlePool,
      x + (Math.random() - 0.5) * 0.45,
      y + 0.05,
      z + (Math.random() - 0.5) * 0.45,
      col,
      (Math.random() - 0.5) * 2.5,
      0.7 + Math.random() * 1.2,
      (Math.random() - 0.5) * 2.5,
      0.45 + Math.random() * 0.2,
      -4.5,
      0.8 + Math.random() * 0.5
    );
  }
}

function splashBurst(x, y, z, count = 6) {
  const n = count | 0;
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const col = i % 2 === 0 ? 0xc8f4ff : 0x7ce0e8;
    spawnPooled(
      particlePool,
      x + (Math.random() - 0.5) * 0.5,
      y + 0.08,
      z + (Math.random() - 0.5) * 0.5,
      col,
      (Math.random() - 0.5) * 4.4,
      2.4 + Math.random() * 2.6,
      (Math.random() - 0.5) * 4.4,
      0.5 + Math.random() * 0.25,
      -12.5,
      0.75 + Math.random() * 0.45
    );
  }
  const bubbles = Math.max(1, Math.round(n * 0.4));
  for (let i = 0; i < bubbles; i++) {
    spawnPooled(
      bubblePool,
      x + (Math.random() - 0.5) * 0.6,
      y + 0.05,
      z + (Math.random() - 0.5) * 0.6,
      0xe6fbff,
      (Math.random() - 0.5) * 1.5,
      1.1 + Math.random() * 1.1,
      (Math.random() - 0.5) * 1.5,
      0.85 + Math.random() * 0.35,
      0.4,
      0.85 + Math.random() * 0.35
    );
  }
}

function stepPool(pool, dt) {
  const slots = pool.slots;
  const cap = pool.capacity;
  for (let i = 0; i < cap; i++) {
    const s = slots[i];
    if (!s.active) continue;

    s.life -= dt;
    if (s.life <= 0) {
      s.active = false;
      _pDummy.position.set(s.x, s.y, s.z);
      _pDummy.scale.set(0, 0, 0);
      _pDummy.updateMatrix();
      pool.mesh.setMatrixAt(i, _pDummy.matrix);
      pool.matrixDirty = true;
      continue;
    }

    s.vy += s.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.rx += s.rotSpd * dt;
    s.ry += s.rotSpd * 0.7 * dt;

    const fade = Math.max(0, Math.min(1, s.life / s.maxLife));
    const sc = s.size * (0.2 + 0.8 * fade);
    _pDummy.position.set(s.x, s.y, s.z);
    _pDummy.rotation.set(s.rx, s.ry, 0);
    _pDummy.scale.set(sc, sc, sc);
    _pDummy.updateMatrix();
    pool.mesh.setMatrixAt(i, _pDummy.matrix);
    pool.matrixDirty = true;
  }

  if (pool.matrixDirty) {
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.matrixDirty = false;
  }
  if (pool.colorDirty) {
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    pool.colorDirty = false;
  }
}

let bubbleT = 0;
function updateParticles(dt) {
  const surfY = (typeof Shaders !== 'undefined' && typeof Shaders.waterHeightAt === 'function')
    ? Shaders.waterHeightAt(P.x, P.z, time)
    : WATER_Y;

  if (P.swimming && P.y < surfY - 0.5) {
    bubbleT -= dt;
    if (bubbleT <= 0) {
      bubbleT = 0.35;
      spawnPooled(
        bubblePool,
        P.x + (Math.random() - 0.5) * 0.8,
        P.y + 1.2,
        P.z + (Math.random() - 0.5) * 0.8,
        0xd9f2ff,
        0,
        2.1,
        0,
        2.1,
        0.5,
        1.0
      );
    }
  }

  stepPool(particlePool, dt);
  stepPool(bubblePool, dt);
}

// ---------- 2b. Pooled Sand & Snow Footprints (Wave-Washed on Beaches, Zero GC) ----------

const MAX_FOOTPRINTS = 240;
const _fpDummy = new THREE.Object3D();
_fpDummy.rotation.order = 'YXZ';
const _fpColor = new THREE.Color(0xffffff);
const _fpNorm = { x: 0, y: 1, z: 0 };

function makeFootprintTex() {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof THREE.CanvasTexture !== 'function'
  ) {
    return null;
  }
  const c = document.createElement('canvas');
  if (!c || typeof c.getContext !== 'function') return null;
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function') return null;

  const img = ctx.createImageData(64, 64);
  const d = img.data;
  for (let y = 0; y < 64; y++) {
    const v = y / 63; // 0 = toe (+Z), 1 = heel (-Z)
    for (let x = 0; x < 64; x++) {
      const u = x / 63;
      const fx = (u - 0.50) / 0.23;
      const fy = (v - 0.33) / 0.24;
      const dFore = Math.sqrt(fx * fx + fy * fy);

      const hx = (u - 0.50) / 0.175;
      const hy = (v - 0.72) / 0.165;
      const dHeel = Math.sqrt(hx * hx + hy * hy);

      const ax = (u - 0.50) / 0.125;
      const ay = (v - 0.54) / 0.135;
      const dArch = Math.sqrt(ax * ax + ay * ay);

      const dist = Math.min(dFore, dHeel, dArch);
      let alpha = 0;
      let shade = 0.72;
      if (dist < 1.04) {
        const inner = Math.max(0, Math.min(1, (1.04 - dist) / 0.30));
        const depth = Math.max(0, Math.min(1, 1.0 - dist * 0.82));
        alpha = inner * (0.64 + 0.30 * depth);
        shade = 0.62 + (1.0 - depth) * 0.24;
      } else if (dist < 1.24) {
        // Subtle displaced sand/snow lip around the boot print
        const rim = Math.sin(((dist - 1.04) / 0.20) * Math.PI);
        alpha = rim * 0.20;
        shade = 1.0;
      }
      const idx = (y * 64 + x) * 4;
      const lum = Math.round(shade * 255);
      d[idx] = lum;
      d[idx + 1] = lum;
      d[idx + 2] = lum;
      d[idx + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const footprintGeo = new THREE.PlaneGeometry(0.42, 0.56);
footprintGeo.rotateX(-Math.PI / 2);
const footprintMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: makeFootprintTex(),
  transparent: true,
  opacity: 0.78,
  roughness: 0.96,
  metalness: 0.0,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

function makeFootprintPool(capacity) {
  const mesh = new THREE.InstancedMesh(footprintGeo, footprintMat, capacity);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const slots = new Array(capacity);
  _fpDummy.position.set(0, -999, 0);
  _fpDummy.rotation.set(0, 0, 0);
  _fpDummy.scale.set(0, 0, 0);
  _fpDummy.updateMatrix();
  _fpColor.setHex(0xffffff);

  for (let i = 0; i < capacity; i++) {
    slots[i] = {
      active: false,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      surf: 'sand',
      scale: 1,
      life: 0,
      maxLife: 28,
      washing: false,
    };
    mesh.setMatrixAt(i, _fpDummy.matrix);
    mesh.setColorAt(i, _fpColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  return {
    mesh,
    slots,
    capacity,
    cursor: 0,
    matrixDirty: false,
    colorDirty: false,
  };
}

const footprintPool = makeFootprintPool(MAX_FOOTPRINTS);

function stampFootprint(x, y, z, yaw, surf, side = 0, scale = 1.0) {
  if (surf !== 'sand' && surf !== 'snow') return false;
  const slots = footprintPool.slots;
  const cap = footprintPool.capacity;
  let idx = -1;
  for (let n = 0; n < cap; n++) {
    const cand = (footprintPool.cursor + n) % cap;
    if (!slots[cand].active) {
      idx = cand;
      break;
    }
  }
  if (idx === -1) idx = footprintPool.cursor;
  footprintPool.cursor = (idx + 1) % cap;

  const sc = Math.max(0.35, Math.min(1.6, scale || 1.0));
  const lat = (side || 0) * 0.14 * sc;
  const fx = x + Math.cos(yaw) * lat;
  const fz = z - Math.sin(yaw) * lat;
  const gh = typeof heightAt === 'function' ? heightAt(fx, fz) : y;

  _fpNorm.x = 0;
  _fpNorm.y = 1;
  _fpNorm.z = 0;
  if (typeof terrainNormalAt === 'function') {
    const ret = terrainNormalAt(fx, fz, _fpNorm);
    if (ret && ret !== _fpNorm) {
      _fpNorm.x = ret.x;
      _fpNorm.y = ret.y;
      _fpNorm.z = ret.z;
    }
  }

  // Exact YXZ terrain-normal alignment (zero Quaternion dependency)
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const rightDot = _fpNorm.x * cosY - _fpNorm.z * sinY;
  const fwdDot = _fpNorm.x * sinY + _fpNorm.z * cosY;
  const roll = Math.asin(Math.max(-0.65, Math.min(0.65, -rightDot)));
  const pitch = Math.asin(Math.max(-0.65, Math.min(0.65, fwdDot / Math.max(0.4, Math.cos(roll)))));

  const s = slots[idx];
  s.active = true;
  s.x = fx + _fpNorm.x * 0.025;
  s.y = gh + Math.max(0.028, _fpNorm.y * 0.032);
  s.z = fz + _fpNorm.z * 0.025;
  s.yaw = yaw;
  s.pitch = pitch;
  s.roll = roll;
  s.surf = surf;
  s.scale = sc;
  s.maxLife = surf === 'snow' ? 32.0 : 28.0;
  s.life = s.maxLife;
  s.washing = false;

  _fpDummy.position.set(s.x, s.y, s.z);
  _fpDummy.rotation.set(s.pitch, s.yaw, s.roll);
  _fpDummy.scale.set(sc, 1, sc);
  _fpDummy.updateMatrix();
  footprintPool.mesh.setMatrixAt(idx, _fpDummy.matrix);

  // Warm damp-ochre shadow in sand vs cool recessed ice-blue in snow
  _fpColor.setHex(surf === 'snow' ? 0x89aacb : 0x9b7a4b);
  if (typeof _fpColor.convertSRGBToLinear === 'function') _fpColor.convertSRGBToLinear();
  footprintPool.mesh.setColorAt(idx, _fpColor);

  footprintPool.matrixDirty = true;
  footprintPool.colorDirty = true;
  return true;
}

function updateFootprints(dt, nowTime) {
  const slots = footprintPool.slots;
  const cap = footprintPool.capacity;
  const hasWaterWave = typeof Shaders !== 'undefined' && typeof Shaders.waterHeightAt === 'function';

  for (let i = 0; i < cap; i++) {
    const s = slots[i];
    if (!s.active) continue;

    if (s.surf === 'sand' && !s.washing) {
      const waveY = hasWaterWave ? Shaders.waterHeightAt(s.x, s.z, nowTime) : WATER_Y;
      if (waveY >= s.y - 0.14) {
        s.washing = true;
        if (s.life > 1.1) s.life = 1.1;
      }
    }

    s.life -= s.washing ? dt * 1.65 : dt;
    if (s.life <= 0) {
      s.active = false;
      s.washing = false;
      _fpDummy.position.set(s.x, -999, s.z);
      _fpDummy.scale.set(0, 0, 0);
      _fpDummy.updateMatrix();
      footprintPool.mesh.setMatrixAt(i, _fpDummy.matrix);
      footprintPool.matrixDirty = true;
      continue;
    }

    const fadeWindow = s.washing ? 1.1 : 3.0;
    if (s.life < fadeWindow) {
      const frac = Math.max(0, Math.min(1, s.life / fadeWindow));
      const sc = s.scale * (0.25 + 0.75 * frac);
      _fpDummy.position.set(s.x, s.y, s.z);
      _fpDummy.rotation.set(s.pitch, s.yaw, s.roll);
      _fpDummy.scale.set(sc, 1, sc);
      _fpDummy.updateMatrix();
      footprintPool.mesh.setMatrixAt(i, _fpDummy.matrix);
      footprintPool.matrixDirty = true;
    }
  }

  if (footprintPool.matrixDirty) {
    footprintPool.mesh.instanceMatrix.needsUpdate = true;
    footprintPool.matrixDirty = false;
  }
  if (footprintPool.colorDirty) {
    if (footprintPool.mesh.instanceColor) footprintPool.mesh.instanceColor.needsUpdate = true;
    footprintPool.colorDirty = false;
  }
}

// ---------- 3. Player, Home Spot & Wish Companion ----------

const player = Models.makePlayer();
if (typeof CharacterRig !== 'undefined' && CharacterRig && typeof CharacterRig.attachToPlayer === 'function') {
  CharacterRig.attachToPlayer(player, { Models, Textures, Shaders });
}
scene.add(player);

let home = null;
if (typeof Regions !== 'undefined' && Regions && typeof Regions.getElevationMod === 'function') {
  // Seat spawn & respawn cleanly ON TOP OF the Star Sanctuary stone compass dais (topY = heightAt(0,0) + 0.10)!
  home = { x: 0, z: 2.5, h: Math.max(heightAt(0, 2.5), heightAt(0, 0) + 0.10) };
} else {
  for (let i = 0; i < 400 && !home; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = i * 3 + Math.random() * 3;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h >= 1.5 && h <= 12) home = { x, z, h };
  }
  home = home || { x: 0, z: 0, h: heightAt(0, 0) };
}
P.x = home.x;
P.y = home.h;
P.z = home.z;
player.position.set(P.x, P.y, P.z);

const wish = { mesh: Models.makeWish(), t: 0, species: WISH_SPECIES, phys: null };
wish.mesh.position.set(P.x - 1.2, P.y + 1.5, P.z - 1.2);
if (typeof Animals !== 'undefined' && Animals) {
  if (typeof Animals.attachToCritter === 'function') {
    Animals.attachToCritter(wish.mesh, WISH_SPECIES, { Models, Textures, Shaders });
  }
  if (typeof Animals.createPhysicsState === 'function') {
    wish.phys = Animals.createPhysicsState(P.x - 1.2, P.y + 1.5, P.z - 1.2, WISH_SPECIES);
  }
}
scene.add(wish.mesh);
const _wishLookCand = { mesh: wish.mesh, maxDist: 10, yOffset: 0.45 };

function updateWish(dt) {
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.updateWish === 'function') {
    Animals.updateWish(wish, dt, time, _animalCtx);
    return;
  }
  wish.t += dt;
  const m = wish.mesh;
  const lock = Physics.lockTarget;
  const locked = !!(lock && lock.mesh && lock.mesh.position);

  if (locked) {
    const tp = lock.mesh.position;
    const orbitA = wish.t * 3.8;
    const yOff = lock.yOffset !== undefined ? lock.yOffset : 0.6;
    _wishTargetVec.set(
      tp.x + Math.cos(orbitA) * 0.65,
      tp.y + yOff + 1.6 + Math.sin(wish.t * 5) * 0.14,
      tp.z + Math.sin(orbitA) * 0.65
    );
    m.position.lerp(_wishTargetVec, Math.min(1, dt * 10));
    const lookYaw = Math.atan2(tp.x - m.position.x, tp.z - m.position.z);
    Physics.turnToward(m, lookYaw, dt, 14);
  } else {
    const sinF = Math.sin(P.facing);
    const cosF = Math.cos(P.facing);
    const tx = P.x - sinF * 1.5 + cosF * 0.72;
    const tz = P.z - cosF * 1.5 - sinF * 0.72;
    const floorY = Math.max(heightAt(tx, tz), WATER_Y - 0.2);
    const ty = Math.max(floorY + 0.85, P.y + 1.45) + Math.sin(wish.t * 3.1) * 0.22;
    _wishTargetVec.set(tx, ty, tz);
    m.position.lerp(_wishTargetVec, Math.min(1, dt * 4.8));
    Physics.turnToward(m, P.facing, dt, 8);
  }

  Models.animateCritter(m, wish.t, locked);
  if (m.userData && m.userData.halo && m.userData.halo.scale) {
    const hs = (locked ? 1.55 : 1.35) + Math.sin(wish.t * 4.2) * 0.12;
    m.userData.halo.scale.set(hs, hs, 1);
  }
}

// ---------- 4. Pickups: Fallen Stars & Sea Pearls ----------

const pickups = [];
let stars = 0;

function spawnPickup(kind) {
  const spot = kind === 'pearl' ? waterSpot(P.x, P.z, 6, 30) : landSpot(P.x, P.z, 8, 32, 0.6);
  if (!spot) return;
  const mesh = kind === 'pearl' ? Models.makePearlPickup() : Models.makeStarPickup();
  const baseY = kind === 'pearl' ? spot.h + 0.55 : spot.h + 1.05;
  mesh.position.set(spot.x, baseY, spot.z);
  mesh.userData.kind = kind;
  mesh.userData.baseY = baseY;
  mesh.userData.bouncing = false;
  mesh.userData.bounces = 0;
  mesh.userData.age = 0;
  scene.add(mesh);
  pickups.push(mesh);
}

function updatePickups(dt, nowTime) {
  let nStars = 0;
  let nPearls = 0;
  for (let i = 0; i < pickups.length; i++) {
    if (pickups[i].userData.kind === 'pearl') nPearls++;
    else if (pickups[i].userData.kind === 'star') nStars++;
  }
  for (let i = 0; nStars < 10 && i < 3; i++) {
    spawnPickup('star');
    nStars++;
  }
  if (P.swimming || heightAt(P.x, P.z) < WATER_Y - 1) {
    for (let i = 0; nPearls < 6 && i < 3; i++) {
      spawnPickup('pearl');
      nPearls++;
    }
  }

  _playerPickupVec.set(P.x, P.y + 0.8, P.z);

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const u = p.userData;
    u.age = (u.age || 0) + dt;
    p.rotation.y += dt * 3;
    if (u.halo && u.halo.scale) {
      const hs = 1.35 + Math.sin(nowTime * 3.5 + i) * 0.14;
      u.halo.scale.set(hs, hs, 1);
    }

    if (u.bouncing) {
      u.vy -= 18 * dt;
      p.position.x += u.vx * dt;
      p.position.y += u.vy * dt;
      p.position.z += u.vz * dt;
      const groundH = heightAt(p.position.x, p.position.z);
      const floorY = groundH + 0.42;
      if (p.position.y <= floorY) {
        p.position.y = floorY;
        u.bounces = (u.bounces || 0) + 1;
        burst(p.position.x, floorY + 0.05, p.position.z, 0xffd93b, 4);
        if (u.bounces >= 3 || Math.abs(u.vy) < 1.6) {
          u.bouncing = false;
          u.vx = 0;
          u.vy = 0;
          u.vz = 0;
          u.baseY = groundH + 0.9;
        } else {
          u.vy = Math.abs(u.vy) * 0.52;
          u.vx *= 0.72;
          u.vz *= 0.72;
        }
      }
    } else {
      const isHeart = u.kind === 'heart';
      const playerNeedsHeart = !isHeart || (P.hp < P.maxHp && !P.dead);
      const d = Math.hypot(p.position.x - P.x, p.position.z - P.z);
      const dyMag = Math.abs(p.position.y - _playerPickupVec.y);
      if (playerNeedsHeart && d < 3.4 && dyMag < 4.5) {
        p.position.lerp(_playerPickupVec, Math.min(1, dt * 7.5));
        u.baseY = p.position.y;
      } else if (isHeart && !playerNeedsHeart && followers.length > 0) {
        // When Starkeeper is at full hearts, let injured companions attract & absorb spare hearts!
        let bestAlly = null;
        let bestD = 7.5;
        for (let fi = 0; fi < followers.length; fi++) {
          const f = followers[fi];
          if (f.hp >= f.maxHp) continue;
          const fp = f.mesh.position;
          const fd = Math.hypot(p.position.x - fp.x, p.position.z - fp.z);
          if (fd < bestD) {
            bestD = fd;
            bestAlly = f;
          }
        }
        if (bestAlly && bestD < 5.2) {
          const fp = bestAlly.mesh.position;
          _allyPickupVec.set(fp.x, fp.y + 0.55, fp.z);
          p.position.lerp(_allyPickupVec, Math.min(1, dt * 6.5));
          u.baseY = p.position.y;
        } else {
          const hoverY = u.baseY + Math.sin(nowTime * 3 + p.position.x) * 0.15;
          p.position.y += (hoverY - p.position.y) * Math.min(1, dt * 8);
        }
      } else {
        const hoverY = u.baseY + Math.sin(nowTime * 3 + p.position.x) * 0.15;
        p.position.y += (hoverY - p.position.y) * Math.min(1, dt * 8);
      }
    }

    const dx = p.position.x - P.x;
    const dy = p.position.y - _playerPickupVec.y;
    const dz = p.position.z - P.z;
    const dHoriz = Math.hypot(dx, dz);
    const d3 = Math.hypot(dx, dy, dz);
    const isHeart = u.kind === 'heart';
    const ready = !u.bouncing || u.age > 0.25;
    const heartExpired = isHeart && u.age > 32;
    if (isHeart && u.age > 29.5 && p.scale && typeof p.scale.setScalar === 'function') {
      p.scale.setScalar(Math.max(0.05, (32 - u.age) / 2.5));
    }

    let consumed = false;
    if (d3 < 0.95 && ready) {
      if (isHeart) {
        // Only absorb hearts into Starkeeper if there is missing health to refill!
        if (P.hp < P.maxHp && !P.dead) {
          burst(p.position.x, p.position.y, p.position.z, 0xff5a87, 12);
          Sound.heartPickup();
          healPlayer(2);
          consumed = true;
        }
      } else {
        burst(
          p.position.x,
          p.position.y,
          p.position.z,
          u.kind === 'pearl' ? 0xf2e8f7 : 0xffd93b,
          10
        );
        Sound.sparkle();
        stars++;
        if (u.kind === 'pearl') toast('A sea pearl! Just as precious as a star.');
        const starEl = document.getElementById('starCount');
        if (starEl) starEl.textContent = stars;
        questEvent('stars');
        consumed = true;
      }
    }

    // If heart wasn't needed by Starkeeper, injured companions can absorb it to heal!
    const playerCanUseHeart = P.hp < P.maxHp && !P.dead;
    if (!consumed && isHeart && ready && !playerCanUseHeart && followers.length > 0) {
      for (let fi = 0; fi < followers.length; fi++) {
        const f = followers[fi];
        if (f.hp >= f.maxHp) continue;
        const fp = f.mesh.position;
        if (Math.hypot(p.position.x - fp.x, p.position.z - fp.z) < 1.35) {
          f.hp = Math.min(f.maxHp, f.hp + 2);
          burst(fp.x, fp.y + 0.7, fp.z, 0xff6b96, 11, true);
          Sound.heartPickup();
          toast(`${f.displayName || f.species.name} recovered health!`, 1800);
          consumed = true;
          break;
        }
      }
    }

    if (consumed || heartExpired || dHoriz > 90) {
      scene.remove(p);
      pickups.splice(i, 1);
    }
  }
}

// ---------- 5. Combat, Health, Gloomblobs, Cocoons & Star Bolts ----------

const glooms = [];
const cocoons = [];
const bolts = [];
let shootCooldown = 0;
let shotBufT = 0;
let hitStopT = 0;
let respawnT = 0;
let damageFlashT = 0;
const sanctuary = { x: home.x, y: home.h, z: home.z };

// Pooled luminous additive 3D slash ribbon, shockwave ring & plunge Star-Nova pillar VFX (zero runtime allocations)
function makeCombatVfxTex(kind) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext && c.getContext('2d');
  if (!ctx) return null;

  if (kind === 'slash') {
    // Polar crescent trail: U (x) = trailing tail (0) -> blazing leading edge (1); V (y) = inner -> outer edge
    const img = ctx.createImageData(128, 128);
    const d = img.data;
    for (let y = 0; y < 128; y++) {
      const v = y / 127; // 0 = inner, 1 = outer
      const radGlow = Math.pow(Math.sin(v * Math.PI), 0.75) * (0.45 + 0.55 * Math.pow(v, 1.35));
      for (let x = 0; x < 128; x++) {
        const u = x / 127; // 0 = tail, 1 = leading tip
        const headFade = u > 0.92 ? (1 - u) / 0.08 : 1.0;
        const tailRamp = Math.pow(u, 1.45);
        const streak = 0.8 + 0.2 * Math.sin(v * 26 + u * 6);
        const a = Math.max(0, Math.min(1, tailRamp * headFade * radGlow * streak));
        const core = Math.pow(u, 3.0) * Math.pow(v, 2.2);
        const idx = (y * 128 + x) * 4;
        d[idx] = Math.min(255, Math.round((0.88 + 0.12 * core) * 255));
        d[idx + 1] = Math.min(255, Math.round((0.82 + 0.18 * core) * 255));
        d[idx + 2] = Math.min(255, Math.round((0.68 + 0.32 * core) * 255));
        d[idx + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (kind === 'ring') {
    const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0.0, 'rgba(255, 220, 110, 0)');
    g.addColorStop(0.54, 'rgba(255, 195, 65, 0.06)');
    g.addColorStop(0.74, 'rgba(255, 215, 95, 0.72)');
    g.addColorStop(0.83, 'rgba(255, 248, 200, 1.0)');
    g.addColorStop(0.91, 'rgba(255, 185, 50, 0.45)');
    g.addColorStop(1.0, 'rgba(255, 160, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  } else {
    // Star-Nova vertical light column: softly feathered at top & base with vertical luminous rays
    const img = ctx.createImageData(128, 128);
    const d = img.data;
    for (let y = 0; y < 128; y++) {
      const v = y / 127; // 0 = top sky fade, 1 = ground base
      const topFade = Math.pow(v, 1.85);
      const botFade = v > 0.88 ? Math.max(0, (1 - v) / 0.12) : 1.0;
      const vert = topFade * (0.35 + 0.65 * botFade);
      for (let x = 0; x < 128; x++) {
        const u = (x / 128) * Math.PI * 2;
        const rays = 0.52 + 0.30 * Math.pow(0.5 + 0.5 * Math.sin(u * 6), 2) + 0.18 * Math.pow(0.5 + 0.5 * Math.sin(u * 12 + 1.3), 3);
        const a = Math.max(0, Math.min(1, vert * rays));
        const idx = (y * 128 + x) * 4;
        d[idx] = 255;
        d[idx + 1] = Math.round((0.78 + 0.18 * v) * 255);
        d[idx + 2] = Math.round((0.36 + 0.34 * v) * 255);
        d[idx + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(c);
  if (kind === 'nova' && typeof THREE.RepeatWrapping !== 'undefined') {
    tex.wrapS = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function makeSlashRibbonGeo(rInner, rOuter, arcSpan, segs) {
  if (typeof THREE.BufferGeometry !== 'function' || typeof THREE.BufferAttribute !== 'function') {
    return new THREE.PlaneGeometry(2.8, 1.4);
  }
  const pos = new Float32Array((segs + 1) * 2 * 3);
  const uv = new Float32Array((segs + 1) * 2 * 2);
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; // 0 = trailing tail, 1 = leading blade tip
    const ang = (t - 0.5) * arcSpan;
    // Taper inner & outer radius smoothly to a pointed crescent tip at both tail and leading edge
    const widthEnv = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const rMid = rOuter - (rOuter - rInner) * 0.42;
    const ri = rOuter - (rOuter - rInner) * (0.18 + 0.82 * widthEnv);
    const ro = rMid + (rOuter - rMid) * (0.28 + 0.72 * Math.sin(Math.pow(t, 0.6) * Math.PI));
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const vBase = i * 2;
    pos[vBase * 3] = sa * ri;
    pos[vBase * 3 + 1] = 0;
    pos[vBase * 3 + 2] = ca * ri;
    pos[(vBase + 1) * 3] = sa * ro;
    pos[(vBase + 1) * 3 + 1] = 0;
    pos[(vBase + 1) * 3 + 2] = ca * ro;
    uv[vBase * 2] = t;
    uv[vBase * 2 + 1] = 0;
    uv[(vBase + 1) * 2] = t;
    uv[(vBase + 1) * 2 + 1] = 1;
    if (i < segs) {
      const a = vBase;
      const b = vBase + 1;
      const c = vBase + 2;
      const d = vBase + 3;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const slashTex = makeCombatVfxTex('slash');
const ringTex = makeCombatVfxTex('ring');
const novaTex = makeCombatVfxTex('nova');

const slashGeo = makeSlashRibbonGeo(0.95, 2.55, Math.PI * 0.92, 26);
const slashMat = new THREE.MeshBasicMaterial({
  color: 0xffd858,
  map: slashTex || null,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const slashPivot = new THREE.Group();
const slashMesh = new THREE.Mesh(slashGeo, slashMat);
slashPivot.add(slashMesh);
slashPivot.visible = false;
scene.add(slashPivot);

const ringGeo = new THREE.PlaneGeometry(2.1, 2.1);
ringGeo.rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0xffc636,
  map: ringTex || null,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const ringMesh = new THREE.Mesh(ringGeo, ringMat);
ringMesh.visible = false;
scene.add(ringMesh);

const novaGeo = typeof THREE.CylinderGeometry === 'function'
  ? new THREE.CylinderGeometry(0.55, 1.85, 4.6, 20, 1, true)
  : new THREE.PlaneGeometry(2.0, 4.6);
if (typeof novaGeo.translate === 'function') novaGeo.translate(0, 2.3, 0);
const novaMat = new THREE.MeshBasicMaterial({
  color: 0xffc83b,
  map: novaTex || null,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const novaMesh = new THREE.Mesh(novaGeo, novaMat);
novaMesh.visible = false;
scene.add(novaMesh);

// Pooled directional Starlight Lance VFX for Sprint Slide-Thrust (piercing forward cone + twin slipstream rings)
const thrustPivot = new THREE.Group();
const thrustConeGeo = typeof THREE.ConeGeometry === 'function'
  ? new THREE.ConeGeometry(0.46, 2.95, 16, 1, true)
  : new THREE.PlaneGeometry(0.9, 2.95);
if (typeof thrustConeGeo.rotateX === 'function') thrustConeGeo.rotateX(Math.PI / 2);
if (typeof thrustConeGeo.translate === 'function') thrustConeGeo.translate(0, 0, 1.85);
const thrustMat = new THREE.MeshBasicMaterial({
  color: 0x7ef8ef,
  map: novaTex || null,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const thrustCone = new THREE.Mesh(thrustConeGeo, thrustMat);
const thrustCoreGeo = typeof THREE.ConeGeometry === 'function'
  ? new THREE.ConeGeometry(0.20, 3.25, 12, 1, true)
  : new THREE.PlaneGeometry(0.4, 3.25);
if (typeof thrustCoreGeo.rotateX === 'function') thrustCoreGeo.rotateX(Math.PI / 2);
if (typeof thrustCoreGeo.translate === 'function') thrustCoreGeo.translate(0, 0, 2.05);
const thrustCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffe87a,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const thrustCore = new THREE.Mesh(thrustCoreGeo, thrustCoreMat);
const thrustRingGeo = typeof THREE.TorusGeometry === 'function'
  ? new THREE.TorusGeometry(0.42, 0.045, 6, 18)
  : new THREE.PlaneGeometry(0.84, 0.84);
const thrustRingA = new THREE.Mesh(thrustRingGeo, thrustMat);
thrustRingA.position.set(0, 0, 1.25);
const thrustRingB = new THREE.Mesh(thrustRingGeo, thrustCoreMat);
thrustRingB.position.set(0, 0, 2.15);
thrustRingB.scale.set(0.68, 0.68, 0.68);
thrustPivot.add(thrustCone, thrustCore, thrustRingA, thrustRingB);
thrustPivot.visible = false;
scene.add(thrustPivot);

const slashFx = { life: 0, dur: 0.24, startAngle: 0, sweep: 0 };
const ringFx = { life: 0, dur: 0.42, maxScale: 4.0 };
const novaFx = { life: 0, dur: 0.44 };
const thrustFx = { life: 0, dur: 0.42, sparkAcc: 0 };
let slideHitT = 0;
const _slideHitSet = new Set();

// Live 3D Pooled Starlight Ribbon Trail (48 arc-subsampled ring samples -> 96 verts, 94 tris, ZERO runtime allocations!)
const STAFF_TRAIL_SEGMENTS = 48;
const trailTips = new Float32Array(STAFF_TRAIL_SEGMENTS * 3);
const trailInners = new Float32Array(STAFF_TRAIL_SEGMENTS * 3);
const trailPosArr = new Float32Array(STAFF_TRAIL_SEGMENTS * 2 * 3);
const trailColArr = new Float32Array(STAFF_TRAIL_SEGMENTS * 2 * 3);
const trailUvArr = new Float32Array(STAFF_TRAIL_SEGMENTS * 2 * 2);
let staffTrailGeo;
let trailPosAttr = null;
let trailColAttr = null;
if (typeof THREE.BufferGeometry === 'function' && typeof THREE.BufferAttribute === 'function') {
  staffTrailGeo = new THREE.BufferGeometry();
  const tIdx = [];
  for (let i = 0; i < STAFF_TRAIL_SEGMENTS; i++) {
    const u = 1 - i / (STAFF_TRAIL_SEGMENTS - 1); // i=0 newest leading tip (u=1), i=N-1 tail (u=0)
    const vBase = i * 2;
    trailUvArr[vBase * 2] = u;
    trailUvArr[vBase * 2 + 1] = 0; // inner shaft anchor
    trailUvArr[(vBase + 1) * 2] = u;
    trailUvArr[(vBase + 1) * 2 + 1] = 1; // outer Star-Lantern tip
    if (i < STAFF_TRAIL_SEGMENTS - 1) {
      const a = vBase;
      const b = vBase + 1;
      const c = vBase + 2;
      const d = vBase + 3;
      tIdx.push(a, b, c, b, d, c);
    }
  }
  trailPosAttr = new THREE.BufferAttribute(trailPosArr, 3);
  trailColAttr = new THREE.BufferAttribute(trailColArr, 3);
  staffTrailGeo.setAttribute('position', trailPosAttr);
  staffTrailGeo.setAttribute('color', trailColAttr);
  staffTrailGeo.setAttribute('uv', new THREE.BufferAttribute(trailUvArr, 2));
  staffTrailGeo.setIndex(tIdx);
} else {
  staffTrailGeo = new THREE.PlaneGeometry(1.4, 0.8);
}
const staffTrailMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  vertexColors: true,
  map: slashTex || null,
  transparent: true,
  opacity: 0.94,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const staffTrailMesh = new THREE.Mesh(staffTrailGeo, staffTrailMat);
staffTrailMesh.frustumCulled = false;
staffTrailMesh.visible = false;
scene.add(staffTrailMesh);

const staffTrail = {
  active: false,
  colorHex: 0x5ef8e8,
  widthFrac: 0.42,
  sampleCount: 0,
  fadeT: 0,
  sparkAcc: 0,
  mesh: staffTrailMesh,
};

function sampleStaffEndpoints(tipOut, buttOut) {
  const rig = player && player.userData ? player.userData.glbRig : null;
  if (rig && rig.ready && typeof rig.getStaffTipWorldPos === 'function') {
    const gotTip = rig.getStaffTipWorldPos(tipOut);
    if (gotTip) {
      const gotButt = typeof rig.getStaffButtWorldPos === 'function' ? rig.getStaffButtWorldPos(buttOut) : null;
      if (!gotButt) {
        buttOut.set(P.x, P.y + 1.05, P.z);
      }
      return true;
    }
  }
  // Procedural fallback endpoints when GLB rig is not mounted
  const sinF = Math.sin(P.facing);
  const cosF = Math.cos(P.facing);
  const sw = P.meleeT > 0 ? Math.sin((1 - P.meleeT / Math.max(0.08, P.meleeDur)) * Math.PI * 2) : 0;
  tipOut.set(P.x + sinF * 1.45 - cosF * (0.45 + sw * 0.9), P.y + 1.42, P.z + cosF * 1.45 + sinF * (0.45 + sw * 0.9));
  buttOut.set(P.x + sinF * 0.35 - cosF * 0.15, P.y + 0.98, P.z + cosF * 0.35 + sinF * 0.15);
  return true;
}

function triggerStaffTrail(step) {
  const isSpin = step === 3 || step === 'dashWhirl';
  let col = 0x5ef8e8; // Hit 1: crisp celestial sea-teal
  if (step === 2) col = 0x92f6ff; // Hit 2: bright sky-cyan
  else if (isSpin) col = 0xffd242; // Hit 3 / Dash-Whirl: blazing solar gold
  else if (step === 'sprint') col = 0x7ef8ef; // Sprint Slide-Thrust: electric aqua-gold drill
  else if (step === 'plunge' || step === 'roll' || step === 'dashCut') col = 0xffe46b; // Comet / uppercut gold

  staffTrail.active = true;
  staffTrail.colorHex = col;
  staffTrail.widthFrac = isSpin ? 0.78 : 0.52;
  staffTrail.sampleCount = 0;
  staffTrail.fadeT = 0.24;
  staffTrail.sparkAcc = 0;
  _trailCol.setHex(col);
  staffTrailMat.opacity = 0;
  staffTrailMesh.visible = false;
}

function triggerThrustVfx() {
  thrustFx.dur = 0.56;
  thrustFx.life = thrustFx.dur;
  thrustFx.sparkAcc = 0;
  thrustPivot.position.set(P.x, P.y + 0.86, P.z);
  thrustPivot.rotation.y = P.facing;
  thrustPivot.visible = true;
}

function triggerSlashVfx(step) {
  const isSpin = step === 3 || step === 'dashWhirl';
  slashFx.dur = isSpin ? 0.58 : 0.38;
  slashFx.life = slashFx.dur;
  slashPivot.position.set(P.x, P.y + 1.12, P.z);
  slashPivot.rotation.y = P.facing;

  // Ribbon leading tip sits at +ang (left/+X) when scale.x = +1, and at -ang (right/-X) when scale.x = -1!
  if (step === 1) {
    // Hit 1: Wide Left (+X) -> Right (-X) diagonal forehand crescent (leading edge points right!)
    slashFx.startAngle = 0.85;
    slashFx.sweep = -2.05;
    slashPivot.rotation.z = -0.22;
    slashMat.color.setHex(0x52ebd8);
    slashMesh.scale.set(-1.14, 1.14, 1.14);
  } else if (step === 2) {
    // Hit 2: Wide Right (-X) -> Left (+X) opposite diagonal backhand crescent (leading edge points left!)
    slashFx.startAngle = -0.85;
    slashFx.sweep = 2.05;
    slashPivot.rotation.z = 0.22;
    slashMat.color.setHex(0x88f2ff);
    slashMesh.scale.set(1.18, 1.18, 1.18);
  } else if (isSpin) {
    // Hit 3 / F->F->Click Dash-Whirl: Full 360-degree golden Whirlwind Spin arc
    slashFx.startAngle = 0.6;
    slashFx.sweep = -Math.PI * 2.15;
    slashPivot.rotation.z = 0.05;
    slashMat.color.setHex(0xffc93c);
    slashMesh.scale.set(-1.44, 1.44, 1.44);
  } else if (step === 'dashCut' || step === 'sprint') {
    // F -> Click Starlight Dash-Cut & Shift Sprint Charge-Slash: wide golden-teal momentum cleave!
    slashFx.startAngle = 0.95;
    slashFx.sweep = -2.25;
    slashPivot.rotation.z = -0.14;
    slashMat.color.setHex(step === 'sprint' ? 0x72f8e6 : 0xffd84a);
    slashMesh.scale.set(-1.38, 1.38, 1.38);
  } else {
    // Hit 4 (Roll Dash-Strike): Piercing golden forward crescent
    slashFx.startAngle = 0.4;
    slashFx.sweep = -0.85;
    slashPivot.rotation.z = 0;
    slashMat.color.setHex(0xffd24a);
    slashMesh.scale.set(-1.26, 1.26, 1.26);
  }
  slashMesh.rotation.y = slashFx.startAngle;
  slashPivot.visible = true;
}

function triggerShockwaveVfx(x, y, z, maxScale, colorHex) {
  ringFx.dur = 0.44;
  ringFx.life = ringFx.dur;
  ringFx.maxScale = maxScale || 4.0;
  ringMat.color.setHex(colorHex || 0xffc636);
  ringMesh.position.set(x, y + 0.14, z);
  ringMesh.scale.set(0.55, 1, 0.55);
  ringMesh.visible = true;
}

function triggerNovaVfx(x, y, z) {
  novaFx.dur = 0.44;
  novaFx.life = novaFx.dur;
  novaMesh.position.set(x, y + 0.05, z);
  novaMesh.scale.set(0.55, 0.45, 0.55);
  novaMesh.visible = true;
}

function updateCombatVfx(dt) {
  if (slashFx.life > 0) {
    slashFx.life = Math.max(0, slashFx.life - dt);
    const prog = 1 - slashFx.life / slashFx.dur;
    const ease = 1 - Math.pow(1 - prog, 2.4);
    slashPivot.position.set(P.x, P.y + 1.12, P.z);
    slashMesh.rotation.y = slashFx.startAngle + slashFx.sweep * ease;
    // Soften static crescent slightly so the live 3D spinning Star-Lantern tip ribbon owns center stage!
    slashMat.opacity = Math.sin(prog * Math.PI) * 0.56;
    if (slashFx.life <= 0) slashPivot.visible = false;
  }
  if (staffTrail.active) {
    const rig = player && player.userData ? player.userData.glbRig : null;
    const hasRigGate = !!(rig && rig.ready && typeof rig.isCombatTrailActive === 'function');
    const inSwing = !P.dead && (P.meleeT > 0 || P.plunging);
    // When GLB rig is mounted, emit ONLY during the single active strike sweep (dark during windup & recovery — ZERO double-swoosh!)
    const emitting = hasRigGate ? (!P.dead && rig.isCombatTrailActive()) : inSwing;

    if (emitting) {
      staffTrail.fadeT = 0.24;
      staffTrailMesh.visible = true;
    } else if (staffTrail.sampleCount > 0) {
      staffTrail.fadeT = Math.max(0, staffTrail.fadeT - dt);
    } else if (!inSwing) {
      staffTrail.fadeT = 0;
    }

    if (staffTrail.fadeT <= 0 && !emitting && !inSwing) {
      staffTrail.active = false;
      staffTrail.sampleCount = 0;
      staffTrailMesh.visible = false;
    } else if (emitting || staffTrail.sampleCount > 0) {
      if (emitting) {
        sampleStaffEndpoints(_trailTip, _trailButt);
        const wf = staffTrail.widthFrac;
        _trailInner.set(
          _trailTip.x + (_trailButt.x - _trailTip.x) * wf,
          _trailTip.y + (_trailButt.y - _trailTip.y) * wf,
          _trailTip.z + (_trailButt.z - _trailTip.z) * wf
        );

        if (staffTrail.sampleCount === 0) {
          for (let i = 0; i < STAFF_TRAIL_SEGMENTS; i++) {
            const i3 = i * 3;
            trailTips[i3] = _trailTip.x;
            trailTips[i3 + 1] = _trailTip.y;
            trailTips[i3 + 2] = _trailTip.z;
            trailInners[i3] = _trailInner.x;
            trailInners[i3 + 1] = _trailInner.y;
            trailInners[i3 + 2] = _trailInner.z;
          }
          _trailPrevTip.copy(_trailTip);
          _trailPrevButt.copy(_trailButt);
          staffTrail.sampleCount = 1;
        } else {
          const dxJ = _trailTip.x - _trailPrevTip.x;
          const dyJ = _trailTip.y - _trailPrevTip.y;
          const dzJ = _trailTip.z - _trailPrevTip.z;
          const jumpDist = Math.hypot(dxJ, dyJ, dzJ);
          const subSteps = jumpDist > 0.14 ? Math.min(4, Math.ceil(jumpDist / 0.14)) : 1;

          _trailMidA.set(
            (_trailPrevTip.x + _trailPrevButt.x) * 0.5,
            (_trailPrevTip.y + _trailPrevButt.y) * 0.5,
            (_trailPrevTip.z + _trailPrevButt.z) * 0.5
          );
          _trailMidB.set(
            (_trailTip.x + _trailButt.x) * 0.5,
            (_trailTip.y + _trailButt.y) * 0.5,
            (_trailTip.z + _trailButt.z) * 0.5
          );
          _trailDirA.set(
            _trailPrevTip.x - _trailMidA.x,
            _trailPrevTip.y - _trailMidA.y,
            _trailPrevTip.z - _trailMidA.z
          );
          _trailDirB.set(
            _trailTip.x - _trailMidB.x,
            _trailTip.y - _trailMidB.y,
            _trailTip.z - _trailMidB.z
          );
          const lenA = Math.hypot(_trailDirA.x, _trailDirA.y, _trailDirA.z) || 0.8;
          const lenB = Math.hypot(_trailDirB.x, _trailDirB.y, _trailDirB.z) || 0.8;

          for (let st = 1; st <= subSteps; st++) {
            const u = st / subSteps;
            let sx, sy, sz, ix, iy, iz;
            if (st === subSteps) {
              sx = _trailTip.x; sy = _trailTip.y; sz = _trailTip.z;
              ix = _trailInner.x; iy = _trailInner.y; iz = _trailInner.z;
            } else {
              // Radius-preserving arc interpolation around the moving grip midpoint (silky curved ribbons, zero polygon spikes!)
              const mx = _trailMidA.x + (_trailMidB.x - _trailMidA.x) * u;
              const my = _trailMidA.y + (_trailMidB.y - _trailMidA.y) * u;
              const mz = _trailMidA.z + (_trailMidB.z - _trailMidA.z) * u;
              let rx = _trailDirA.x + (_trailDirB.x - _trailDirA.x) * u;
              let ry = _trailDirA.y + (_trailDirB.y - _trailDirA.y) * u;
              let rz = _trailDirA.z + (_trailDirB.z - _trailDirA.z) * u;
              const rLen = Math.hypot(rx, ry, rz);
              const targetLen = lenA + (lenB - lenA) * u;
              if (rLen > 0.05) {
                const sc = targetLen / rLen;
                rx *= sc; ry *= sc; rz *= sc;
              }
              sx = mx + rx; sy = my + ry; sz = mz + rz;
              const bx = mx - rx, by = my - ry, bz = mz - rz;
              ix = sx + (bx - sx) * wf;
              iy = sy + (by - sy) * wf;
              iz = sz + (bz - sz) * wf;
            }
            for (let i = STAFF_TRAIL_SEGMENTS - 1; i > 0; i--) {
              const dst = i * 3;
              const src = (i - 1) * 3;
              trailTips[dst] = trailTips[src];
              trailTips[dst + 1] = trailTips[src + 1];
              trailTips[dst + 2] = trailTips[src + 2];
              trailInners[dst] = trailInners[src];
              trailInners[dst + 1] = trailInners[src + 1];
              trailInners[dst + 2] = trailInners[src + 2];
            }
            trailTips[0] = sx;
            trailTips[1] = sy;
            trailTips[2] = sz;
            trailInners[0] = ix;
            trailInners[1] = iy;
            trailInners[2] = iz;
            if (staffTrail.sampleCount < STAFF_TRAIL_SEGMENTS) staffTrail.sampleCount++;
          }
          _trailPrevTip.copy(_trailTip);
          _trailPrevButt.copy(_trailButt);
        }
      }

      const fadeAlpha = emitting ? 1.0 : Math.max(0, staffTrail.fadeT / 0.24);
      _trailCol.setHex(staffTrail.colorHex);
      if (trailPosAttr && trailColAttr) {
        for (let i = 0; i < STAFF_TRAIL_SEGMENTS; i++) {
          const i3 = i * 3;
          const vBase = i * 2;
          const pIn = vBase * 3;
          const pOut = (vBase + 1) * 3;
          trailPosArr[pIn] = trailInners[i3];
          trailPosArr[pIn + 1] = trailInners[i3 + 1];
          trailPosArr[pIn + 2] = trailInners[i3 + 2];
          trailPosArr[pOut] = trailTips[i3];
          trailPosArr[pOut + 1] = trailTips[i3 + 1];
          trailPosArr[pOut + 2] = trailTips[i3 + 2];

          const tAge = 1 - i / (STAFF_TRAIL_SEGMENTS - 1);
          const lum = tAge * tAge * fadeAlpha;
          const hot = tAge > 0.72 ? (tAge - 0.72) / 0.28 : 0;
          const rOut = Math.min(1, (_trailCol.r + hot * 0.45) * lum);
          const gOut = Math.min(1, (_trailCol.g + hot * 0.45) * lum);
          const bOut = Math.min(1, (_trailCol.b + hot * 0.45) * lum);
          trailColArr[pIn] = rOut * 0.55;
          trailColArr[pIn + 1] = gOut * 0.55;
          trailColArr[pIn + 2] = bOut * 0.55;
          trailColArr[pOut] = rOut;
          trailColArr[pOut + 1] = gOut;
          trailColArr[pOut + 2] = bOut;
        }
        trailPosAttr.needsUpdate = true;
        trailColAttr.needsUpdate = true;
      }
      staffTrailMat.opacity = 0.98 * fadeAlpha;

      // Emit live starlight sparks directly off the spinning Star-Lantern tip during active Spin360 & Melee2!
      if (emitting && (P.meleeStep === 2 || P.meleeStep === 3)) {
        staffTrail.sparkAcc += dt;
        if (staffTrail.sparkAcc >= 0.036) {
          staffTrail.sparkAcc = 0;
          burst(_trailTip.x, _trailTip.y, _trailTip.z, staffTrail.colorHex, P.meleeStep === 3 ? 3 : 2, true);
        }
      }
    }
  }
  if (ringFx.life > 0) {
    ringFx.life = Math.max(0, ringFx.life - dt);
    const prog = 1 - ringFx.life / ringFx.dur;
    const ease = 1 - Math.pow(1 - prog, 2.2);
    const sc = 0.55 + ease * ringFx.maxScale;
    ringMesh.scale.set(sc, 1, sc);
    ringMat.opacity = (1 - prog) * 0.96;
    if (ringFx.life <= 0) ringMesh.visible = false;
  }
  if (novaFx.life > 0) {
    novaFx.life = Math.max(0, novaFx.life - dt);
    const prog = 1 - novaFx.life / novaFx.dur;
    const rad = 0.55 + prog * 1.95;
    const tall = 0.55 + Math.sin(Math.min(1, prog * 1.55) * Math.PI * 0.5) * 0.78;
    novaMesh.scale.set(rad, tall, rad);
    novaMesh.rotation.y += dt * 4.5;
    novaMat.opacity = Math.pow(1 - prog, 1.35) * 0.92;
    if (novaFx.life <= 0) novaMesh.visible = false;
  }
  if (thrustFx.life > 0) {
    thrustFx.life = Math.max(0, thrustFx.life - dt);
    const prog = 1 - thrustFx.life / thrustFx.dur;
    const ease = 1 - Math.pow(1 - Math.min(1, prog * 2.2), 2.5);
    const fade = prog < 0.72 ? 1.0 : Math.max(0, (1 - prog) / 0.28);
    thrustPivot.position.set(P.x, P.y + 0.86, P.z);
    thrustPivot.rotation.y = P.facing;
    thrustCone.rotation.z += dt * 11;
    thrustCore.rotation.z -= dt * 14;
    const lenScale = 0.55 + ease * 0.72;
    const radScale = (0.72 + Math.sin(prog * Math.PI) * 0.36) * (0.6 + fade * 0.4);
    thrustCone.scale.set(radScale, radScale, lenScale);
    thrustCore.scale.set(radScale * 0.88, radScale * 0.88, lenScale * 1.08);
    thrustRingA.position.z = 1.0 + prog * 1.4;
    thrustRingA.scale.setScalar(0.55 + prog * 1.15);
    thrustRingB.position.z = 1.65 + prog * 1.55;
    thrustRingB.scale.setScalar(0.45 + prog * 0.85);
    thrustMat.opacity = fade * 0.86;
    thrustCoreMat.opacity = fade * 0.95;
    thrustFx.sparkAcc += dt;
    if (thrustFx.sparkAcc >= 0.045 && fade > 0.2) {
      thrustFx.sparkAcc = 0;
      const fx = Math.sin(P.facing);
      const fz = Math.cos(P.facing);
      burst(P.x + fx * 2.2, P.y + 0.86, P.z + fz * 2.2, 0x7ef8ef, 2, true);
    }
    if (thrustFx.life <= 0) thrustPivot.visible = false;
  }
  if (slideHitT > 0 && !P.dead) {
    slideHitT = Math.max(0, slideHitT - dt);
    const fx = Math.sin(P.facing);
    const fz = Math.cos(P.facing);
    let slideLanded = 0;
    for (let j = glooms.length - 1; j >= 0; j--) {
      const g = glooms[j];
      if (_slideHitSet.has(g)) continue;
      const gp = g.mesh.position;
      const gYOff = (g.tier && g.tier.yOffset) || 0.65;
      const gRadExtra = g.tier && g.tier.colRadius ? Math.max(0, g.tier.colRadius - 0.65) : 0;
      const dx = gp.x - P.x;
      const dy = Math.abs((gp.y + gYOff) - (P.y + 0.85));
      const dz = gp.z - P.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.5 + gRadExtra || dy > 2.0 + gRadExtra * 0.6) continue;
      const dot = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      if (dot < 0.25 && dist > 1.2) continue;
      _slideHitSet.add(g);
      _boltDir.set(dx || fx, 0, dz || fz).normalize();
      hitGloom(g, j, _boltDir, 2, true, true);
      slideLanded++;
    }
    for (let j = cocoons.length - 1; j >= 0; j--) {
      const cc = cocoons[j];
      if (_slideHitSet.has(cc)) continue;
      const cp = cc.mesh.position;
      const dx = cp.x - P.x;
      const dz = cp.z - P.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.5) continue;
      const dot = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      if (dot < 0.25 && dist > 1.2) continue;
      _slideHitSet.add(cc);
      popCocoon(cc, j);
      slideLanded++;
    }
    if (slideLanded > 0) {
      Sound.hitImpact(true);
      Physics.addCameraShake(0.42);
      hitStopT = 0.052;
    }
  }
  if (damageFlashT > 0) {
    damageFlashT = Math.max(0, damageFlashT - dt);
    const dfEl = document.getElementById('damageFlash');
    if (dfEl) dfEl.style.opacity = (damageFlashT / 0.35).toFixed(3);
  }
}

const heartsHudEl = document.getElementById('heartsHud');
const deathOverlayEl = document.getElementById('deathOverlay');
const aimReticleEl = document.getElementById('aimReticle');
let aimPulseTimer = null;

function heartSvg(fillState) {
  if (fillState === 2) {
    return '<svg class="heartIcon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff3b6b" stroke="#ffd97a" stroke-width="1.3"/></svg>';
  }
  if (fillState === 1) {
    return '<svg class="heartIcon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="rgba(255,255,255,0.12)" stroke="#c2a46d" stroke-width="1.2"/><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09V21.35z" fill="#ff3b6b"/></svg>';
  }
  return '<svg class="heartIcon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="rgba(255,255,255,0.1)" stroke="rgba(232,228,216,0.32)" stroke-width="1.2"/></svg>';
}

function renderHeartsUI() {
  if (!heartsHudEl) return;
  const totalHearts = Math.ceil(P.maxHp / 2);
  let html = '';
  for (let i = 0; i < totalHearts; i++) {
    const rem = P.hp - i * 2;
    html += heartSvg(rem >= 2 ? 2 : rem === 1 ? 1 : 0);
  }
  heartsHudEl.innerHTML = html;
  if (heartsHudEl.classList) heartsHudEl.classList.toggle('low-hp', P.hp > 0 && P.hp <= 3);
}

function healPlayer(amount) {
  if (P.dead) return;
  P.hp = Math.min(P.maxHp, P.hp + amount);
  renderHeartsUI();
  burst(P.x, P.y + 1.2, P.z, 0xff6b96, 8, true);
}

function damagePlayer(amount, source = 'gloom', knockX = 0, knockZ = 0) {
  if (P.dead || amount <= 0) return false;
  if (source === 'gloom' && (P.invulnT > 0 || P.hurtInvulnT > 0)) return false;

  P.hp = Math.max(0, P.hp - amount);
  P.hurtFlashT = 0.35;
  damageFlashT = 0.35;
  if (source === 'gloom') P.hurtInvulnT = 1.1;

  if (knockX || knockZ) {
    P.vx = knockX;
    P.vz = knockZ;
    if (P.onGround) {
      P.vy = 4.2;
      P.onGround = false;
    }
  }

  Sound.hurt();
  Physics.addCameraShake(source === 'fall' ? 0.55 : 0.45);
  burst(P.x, P.y + 1.0, P.z, 0xff4568, 9);
  renderHeartsUI();

  if (source === 'fall') toast('Ouch! Watch those steep drops!', 1800);
  else if (source === 'drown') toast('You\'re drowning! Hold Space to swim up!', 1800);

  if (P.hp <= 0) triggerDeath();
  return true;
}

function triggerDeath() {
  if (P.dead) return;
  P.dead = true;
  respawnT = 2.0;
  Physics.clearLockOn();
  Sound.death();
  burst(P.x, P.y + 1.0, P.z, 0x8a5cd8, 16);
  if (deathOverlayEl && deathOverlayEl.classList) deathOverlayEl.classList.add('show');
}

function respawnPlayer() {
  P.dead = false;
  respawnT = 0;
  P.hp = P.maxHp;
  P.air = AIR_MAX;
  P.drownAcc = 0;
  P.hurtInvulnT = 1.5;
  P.swimming = false;
  P.plunging = false;
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;
  P.x = sanctuary.x;
  P.z = sanctuary.z;
  P.y = heightAt(sanctuary.x, sanctuary.z);
  player.position.set(P.x, P.y, P.z);

  const lost = Math.min(3, stars);
  if (lost > 0) {
    stars -= lost;
    const starEl = document.getElementById('starCount');
    if (starEl) starEl.textContent = stars;
  }

  // Surviving rescued/befriended Starling companions immediately rally around you in concentric rings!
  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    let ring = 0;
    let idxInRing = i;
    let ringCap = 6;
    while (idxInRing >= ringCap) {
      idxInRing -= ringCap;
      ring++;
      ringCap = 6 + ring * 4;
    }
    const ang = (idxInRing / Math.max(1, ringCap)) * Math.PI * 2 + 0.5 + ring * 0.35;
    const rad = 2.65 + ring * 1.95;
    const fx = P.x + Math.cos(ang) * rad;
    const fz = P.z + Math.sin(ang) * rad;
    const fy = Math.max(heightAt(fx, fz), WATER_Y);
    f.mesh.position.set(fx, fy, fz);
    if (f.phys) {
      f.phys.vx = 0;
      f.phys.vy = 0;
      f.phys.vz = 0;
      f.phys.onGround = true;
      f.phys.inWater = false;
    }
    f.hp = f.maxHp;
    f.kx = 0;
    f.kz = 0;
    f._stuckT = 0;
    if (i < 18) burst(fx, f.mesh.position.y + 0.8, fz, 0xffd93b, 6);
  }

  if (deathOverlayEl && deathOverlayEl.classList) deathOverlayEl.classList.remove('show');
  renderHeartsUI();
  Sound.respawn();
  burst(P.x, P.y + 1.2, P.z, 0xffe482, 18);
  toast(
    followers.length > 0
      ? 'Wish guided you back to safety — your friends rallied to your side!'
      : 'Wish guided you back to the Star Sanctuary.',
    3000
  );
}

const HEART_MAX_ACTIVE = 12;

function spawnHeartDrop(x, y, z) {
  // Cap active spare heart crystals so long battles with large bands never carpet the meadow
  let heartCount = 0;
  let oldestIdx = -1;
  let oldestAge = -1;
  for (let i = 0; i < pickups.length; i++) {
    const pu = pickups[i] && pickups[i].userData;
    if (pu && pu.kind === 'heart') {
      heartCount++;
      const age = pu.age || 0;
      if (age > oldestAge) {
        oldestAge = age;
        oldestIdx = i;
      }
    }
  }
  if (heartCount >= HEART_MAX_ACTIVE && oldestIdx >= 0) {
    scene.remove(pickups[oldestIdx]);
    pickups.splice(oldestIdx, 1);
  }
  const mesh = Models.makeHeartPickup();
  const ang = Math.random() * Math.PI * 2;
  const spd = 2.0 + Math.random() * 1.4;
  mesh.position.set(x, y + 0.9, z);
  mesh.userData.kind = 'heart';
  mesh.userData.bouncing = true;
  mesh.userData.bounces = 0;
  mesh.userData.vx = Math.cos(ang) * spd;
  mesh.userData.vy = 5.4 + Math.random() * 1.5;
  mesh.userData.vz = Math.sin(ang) * spd;
  mesh.userData.baseY = heightAt(x, z) + 0.9;
  mesh.userData.age = 0;
  scene.add(mesh);
  pickups.push(mesh);
}

function meleeAttack() {
  if (!started || P.dead) return false;
  const step = Physics.startMelee();
  if (!step) return false;

  Sound.swing(step);
  triggerStaffTrail(step);
  if (P.swimming) {
    // Swirling underwater hydro-staff bubble vortex!
    const bCount = step === 3 || step === 'dashWhirl' ? 12 : 7;
    for (let bi = 0; bi < bCount; bi++) {
      const ang = (bi / bCount) * Math.PI * 2 + P.facing;
      spawnPooled(
        bubblePool,
        P.x + Math.sin(ang) * 0.95,
        P.y + 1.05 + (Math.random() - 0.5) * 0.5,
        P.z + Math.cos(ang) * 0.95,
        0xb4f8ff,
        Math.sin(ang) * 1.4,
        0.9 + Math.random() * 1.1,
        Math.cos(ang) * 1.4,
        0.95,
        0.04,
        0.78
      );
    }
  }
  if (step === 'plunge') {
    burst(P.x, P.y + 2.0, P.z, 0xffe875, 9, true);
    return true;
  }

  if (step === 'sprint') {
    triggerThrustVfx();
    slideHitT = 0.44;
    _slideHitSet.clear();
  } else if (!(player && player.userData && player.userData.glbRig && player.userData.glbRig.ready)) {
    // Only use static flat chest crescent on procedural fallback — GLB uses the single live 3D tip ribbon (zero double-swoosh!)
    triggerSlashVfx(step);
  }
  const isSpin = step === 3 || step === 'dashWhirl';
  const isDash = step === 'dashCut' || step === 'dashWhirl' || step === 'sprint';
  if (isSpin) {
    triggerShockwaveVfx(P.x, P.y, P.z, step === 'dashWhirl' ? 4.3 : 3.9, 0xffe875);
    burst(P.x, P.y + 1.1, P.z, 0xffe476, step === 'dashWhirl' ? 14 : 10, true);
  } else if (step === 'dashCut' || step === 'sprint') {
    burst(P.x, P.y + 0.95, P.z, 0x8ef5ee, 8, true);
    burst(P.x, P.y + 0.95, P.z, 0xffe476, 8, true);
  }

  const isHeavy = isSpin || step === 'roll' || isDash;
  const dmg = isHeavy ? 2 : 1;
  const reach = step === 'sprint' ? 4.4 : step === 'dashWhirl' ? 4.2 : step === 'dashCut' ? 4.1 : step === 3 ? 3.8 : step === 'roll' ? 3.9 : 3.2;
  const minDot = isSpin ? -2.0 : step === 'sprint' ? 0.30 : step === 'roll' ? 0.15 : -0.15;
  const fwdX = Math.sin(P.facing);
  const fwdZ = Math.cos(P.facing);
  let landed = 0;

  for (let j = glooms.length - 1; j >= 0; j--) {
    const g = glooms[j];
    const gp = g.mesh.position;
    const gYOff = (g.tier && g.tier.yOffset) || 0.65;
    const gRadExtra = g.tier && g.tier.colRadius ? Math.max(0, g.tier.colRadius - 0.65) : 0;
    const dx = gp.x - P.x;
    const dy = Math.abs((gp.y + gYOff) - (P.y + 1.0));
    const dz = gp.z - P.z;
    const dist = Math.hypot(dx, dz);
    if (dist > reach + gRadExtra || dy > 2.3 + gRadExtra * 0.6) continue;
    const dot = dist > 0.01 ? (dx * fwdX + dz * fwdZ) / dist : 1;
    if (dot < minDot && dist > 1.5) continue;

    if (step === 'sprint') _slideHitSet.add(g);
    _boltDir.set(dx || fwdX, 0, dz || fwdZ).normalize();
    hitGloom(g, j, _boltDir, dmg, true, isHeavy);
    landed++;
  }

  for (let j = cocoons.length - 1; j >= 0; j--) {
    const cc = cocoons[j];
    const cp = cc.mesh.position;
    const dx = cp.x - P.x;
    const dz = cp.z - P.z;
    const dist = Math.hypot(dx, dz);
    if (dist > reach) continue;
    const dot = dist > 0.01 ? (dx * fwdX + dz * fwdZ) / dist : 1;
    if (dot < minDot && dist > 1.5) continue;
    if (step === 'sprint') _slideHitSet.add(cc);
    popCocoon(cc, j);
    landed++;
  }

  if (landed > 0) {
    Sound.hitImpact(isHeavy);
    Physics.addCameraShake(isHeavy ? 0.56 : 0.28);
    hitStopT = isHeavy ? 0.068 : 0.038;
    if (isSpin) {
      triggerShockwaveVfx(P.x, P.y, P.z, 1.85, 0xffe46b);
      burst(P.x, P.y + 1.05, P.z, 0xffe476, 12, true);
    }
  }
  return true;
}

function handlePlungeImpact(x, y, z) {
  Sound.slam();
  triggerShockwaveVfx(x, y, z, 5.4, 0xffe052);
  triggerNovaVfx(x, y, z);
  burst(x, y + 0.45, z, 0xffe476, 24);
  dustBurst(x, y + 0.15, z, 14, surfaceAt(x, z));

  let landed = 0;
  for (let j = glooms.length - 1; j >= 0; j--) {
    const g = glooms[j];
    const gp = g.mesh.position;
    const gRadExtra = g.tier && g.tier.colRadius ? Math.max(0, g.tier.colRadius - 0.65) : 0;
    const dx = gp.x - x;
    const dz = gp.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist > 4.8 + gRadExtra) continue;
    _boltDir.set(dx || 1, 0, dz).normalize();
    const kResist = typeof g.knockResist === 'number' ? Math.max(0.3, g.knockResist) : 1.0;
    g.ky = Math.max(g.ky || 0, 7.6 * kResist);
    hitGloom(g, j, _boltDir, 2, true, true);
    landed++;
  }
  for (let j = cocoons.length - 1; j >= 0; j--) {
    const cp = cocoons[j].mesh.position;
    if (Math.hypot(cp.x - x, cp.z - z) <= 4.8) {
      popCocoon(cocoons[j], j);
      landed++;
    }
  }
  if (landed > 0) {
    Sound.hitImpact(true);
    hitStopT = 0.082;
  }
}

function gloomTargetCount() {
  const dist = Math.hypot(P.x - home.x, P.z - home.z);
  if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.computeThreatLevel === 'function') {
    const threat = Enemies.computeThreatLevel(followers.length, lit, dist);
    return Math.min(6, Math.max(1, 1 + Math.floor(threat * 0.55)));
  }
  return Math.min(6, 1 + Math.floor(dist / 70));
}

function offscreenLandSpot(cx, cz, minR, maxR, minH = 0.4, farFrontR = 0) {
  let fwdX = Math.sin(P.facing);
  let fwdZ = Math.cos(P.facing);
  if (typeof camera !== 'undefined' && camera && typeof camera.getWorldDirection === 'function') {
    camera.getWorldDirection(_camFwd);
    const len = Math.hypot(_camFwd.x, _camFwd.z);
    if (len > 0.001) {
      fwdX = _camFwd.x / len;
      fwdZ = _camFwd.z / len;
    }
  }

  for (let i = 0; i < 36; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minR + Math.random() * (maxR - minR);
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const dot = ux * fwdX + uz * fwdZ;
    if (dot > 0.30 && !(farFrontR > 0 && d >= farFrontR)) continue;
    const x = cx + ux * d;
    const z = cz + uz * d;
    const h = heightAt(x, z);
    if (h > minH && h < 30) {
      return { x, z, h };
    }
  }

  if (farFrontR > 0) {
    const farSpot = landSpot(cx, cz, farFrontR, farFrontR + 18, minH);
    if (farSpot) return farSpot;
  }
  return landSpot(cx, cz, minR, maxR, minH);
}

function spawnGloom(tierOverride) {
  const spot = started
    ? offscreenLandSpot(P.x, P.z, 22, 46, 0.4, 54)
    : landSpot(P.x, P.z, 12, 34, 0.4);
  if (!spot) return null;

  let tierDef = null;
  if (typeof Enemies !== 'undefined' && Enemies) {
    if (tierOverride) {
      tierDef = typeof tierOverride === 'string'
        ? (Enemies.TIERS[tierOverride] || Enemies.TIERS.classic)
        : tierOverride;
    } else {
      const dist = Math.hypot(P.x - home.x, P.z - home.z);
      const threat = typeof Enemies.computeThreatLevel === 'function'
        ? Enemies.computeThreatLevel(followers.length, lit, dist)
        : 0;
      const regionId = (typeof Regions !== 'undefined' && Regions && typeof Regions.regionAt === 'function')
        ? Regions.regionAt(spot.x, spot.z).id
        : null;
      tierDef = typeof Enemies.pickEnemyTier === 'function'
        ? Enemies.pickEnemyTier(threat, Math.random, { regionId, existingGlooms: glooms })
        : Enemies.TIERS.classic;
    }
  }

  const mesh = Models.makeGloom(tierDef);
  if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.attachToGloom === 'function') {
    Enemies.attachToGloom(mesh, tierDef, { Models, Textures, Shaders });
  }
  mesh.position.set(spot.x, spot.h, spot.z);
  scene.add(mesh);

  let g;
  if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.createGloomState === 'function') {
    g = Enemies.createGloomState(mesh, tierDef, spot.x, spot.h, spot.z, {
      followersCount: followers.length,
    });
  } else {
    g = {
      mesh,
      dir: Math.random() * Math.PI * 2,
      turnT: 2 + Math.random() * 3,
      hp: 3,
      maxHp: 3,
      state: 'wander',
      stateT: 0,
      fleeT: 0,
      stolen: false,
      flash: 0,
      hopT: Math.random() * 9,
      kx: 0,
      ky: 0,
      kz: 0,
      vx: 0,
      vz: 0,
      targetAlly: null,
      lockCand: null,
      lookCand: null,
    };
    g.lockCand = { kind: 'gloom', ref: g, mesh, yOffset: 0.65 };
    g.lookCand = { mesh, maxDist: 14, yOffset: 0.65 };
  }
  if (started) {
    const towardPlayer = Math.atan2(P.x - spot.x, P.z - spot.z);
    g.dir = towardPlayer + (Math.random() * 2 - 1) * ((55 * Math.PI) / 180);
    if (mesh.rotation) mesh.rotation.y = g.dir;
  }
  glooms.push(g);
  return g;
}

function spawnCocoon() {
  const spot = landSpot(P.x, P.z, 14, 32, 0.6);
  if (!spot) return;
  const mesh = Models.makeCocoon();
  mesh.position.set(spot.x, spot.h, spot.z);
  scene.add(mesh);
  const cc = {
    mesh,
    phase: Math.random() * 6,
    lockCand: null,
  };
  cc.lockCand = { kind: 'cocoon', ref: cc, mesh, yOffset: 0.72 };
  cocoons.push(cc);
}

function getLockCandidates() {
  _lockCandidates.length = 0;
  for (let i = 0; i < glooms.length; i++) {
    const g = glooms[i];
    if (g.hp > 0 && g.lockCand) _lockCandidates.push(g.lockCand);
  }
  for (let i = 0; i < cocoons.length; i++) {
    const cc = cocoons[i];
    if (cc.lockCand) _lockCandidates.push(cc.lockCand);
  }
  return _lockCandidates;
}

function spawnBoltProjectile(x, y, z, dx, dy, dz, opts = {}) {
  const mesh = Models.makeStarBolt();
  mesh.position.set(x, y, z);
  const sc = opts.scale || 1;
  if (sc !== 1 && mesh.scale) mesh.scale.setScalar(sc);
  scene.add(mesh);
  const spd = opts.speed || 20;
  bolts.push({
    mesh,
    vx: dx * spd,
    vy: dy * spd,
    vz: dz * spd,
    life: opts.life || 1.45,
    gravity: opts.gravity !== undefined ? opts.gravity : 1.4,
    dmg: opts.dmg || 1,
    heavy: !!opts.heavy,
    pierce: !!opts.pierce,
    explodeRadius: opts.explodeRadius || 0,
    radius: opts.radius || 1.25,
    trailColor: opts.trailColor || 0,
    trailAcc: 0,
    kind: opts.kind || 'bolt',
    hitList: opts.pierce ? [] : null,
  });
}

function explodeStarOrb(x, y, z, radius, dmg) {
  triggerShockwaveVfx(x, y, z, radius * 1.15, 0xffd24a);
  burst(x, y + 0.25, z, 0xffe476, 16);
  burst(x, y + 0.25, z, 0x7ef2ea, 8, true);
  Sound.hitImpact(true);
  Physics.addCameraShake(0.38);

  for (let j = glooms.length - 1; j >= 0; j--) {
    const g = glooms[j];
    const gp = g.mesh.position;
    const gRadExtra = g.tier && g.tier.colRadius ? Math.max(0, g.tier.colRadius - 0.65) : 0;
    const dx = gp.x - x;
    const dz = gp.z - z;
    if (Math.hypot(dx, dz) > radius + gRadExtra) continue;
    _boltDir.set(dx || 1, 0, dz).normalize();
    hitGloom(g, j, _boltDir, dmg, true, true);
  }
  for (let j = cocoons.length - 1; j >= 0; j--) {
    const cp = cocoons[j].mesh.position;
    if (Math.hypot(cp.x - x, cp.z - z) <= radius) {
      popCocoon(cocoons[j], j);
    }
  }
}

function shoot() {
  if (!started || P.dead) return false;
  if (shootCooldown > 0) {
    // Buffer rapid F presses so F->F->F and Click->F combos chain effortlessly!
    shotBufT = 0.24;
    return false;
  }

  const variant = typeof Physics.startShot === 'function' ? Physics.startShot() : 1;
  if (!variant) return false;

  shotBufT = 0;
  shootCooldown = variant === 'nova' ? 0.44
    : variant === 3 ? 0.42
    : variant === 'comet' ? 0.40
    : variant === 'fan' ? 0.32
    : variant === 2 ? 0.24
    : 0.22;

  Sound.shoot(variant);
  if (aimReticleEl && aimReticleEl.classList) {
    aimReticleEl.classList.add('pulse');
    clearTimeout(aimPulseTimer);
    aimPulseTimer = setTimeout(() => aimReticleEl.classList.remove('pulse'), 140);
  }

  _boltFrom.set(P.x, P.y + 1.42, P.z);
  Physics.getAimDirection(_boltFrom, _boltDir);
  if (variant !== 'nova') {
    if (typeof Physics.faceAimDirection === 'function') {
      Physics.faceAimDirection(_boltDir.x, _boltDir.y, _boltDir.z);
    }
    const aimHoriz = Math.hypot(_boltDir.x, _boltDir.z);
    if (aimHoriz > 0.01 && player && player.rotation) {
      player.rotation.y = Math.atan2(_boltDir.x, _boltDir.z);
    }
  }

  let bx = _boltDir.x;
  let by = _boltDir.y;
  let bz = _boltDir.z;
  // Horizontal local-right (+X staff hand) vector perpendicular to aim direction
  const hLen = Math.hypot(bx, bz) || 1;
  const staffSideX = bz / hLen;
  const staffSideZ = -bx / hLen;

  // Launch visibly from the glowing Star-Lantern crystal at the extended tip of Starkeeper's staff!
  const liveGlbRig = player && player.userData && player.userData.glbRig && player.userData.glbRig.ready
    ? player.userData.glbRig
    : null;
  if (variant === 'nova') {
    if (!(liveGlbRig && typeof liveGlbRig.getStaffTipWorldPos === 'function' && liveGlbRig.getStaffTipWorldPos(_boltFrom))) {
      _boltFrom.set(
        P.x + Math.cos(P.facing) * 0.20,
        P.y + 2.32,
        P.z - Math.sin(P.facing) * 0.20
      );
    }
  } else {
    if (!(liveGlbRig && typeof liveGlbRig.getStaffTipWorldPos === 'function' && liveGlbRig.getStaffTipWorldPos(_boltFrom))) {
      _boltFrom.set(
        P.x + bx * 1.24 + staffSideX * 0.22,
        P.y + 1.48 + by * 0.82,
        P.z + bz * 1.24 + staffSideZ * 0.22
      );
    }
    // Re-converge aim from exact staff-lantern muzzle so bolts fly straight through crosshair / Z-target
    Physics.getAimDirection(_boltFrom, _boltDir);
    bx = _boltDir.x;
    by = _boltDir.y;
    bz = _boltDir.z;
  }
  const rightX = -staffSideX;
  const rightZ = -staffSideZ;

  if (variant === 2) {
    // F -> F: Twin Starlight Bolts from Staff-Lantern tip!
    spawnBoltProjectile(_boltFrom.x - rightX * 0.24, _boltFrom.y + 0.07, _boltFrom.z - rightZ * 0.24, bx, by, bz, {
      speed: 22, dmg: 1, scale: 0.95, kind: 'twin', trailColor: 0x8ef5ee,
    });
    spawnBoltProjectile(_boltFrom.x + rightX * 0.24, _boltFrom.y - 0.05, _boltFrom.z + rightZ * 0.24, bx, by, bz, {
      speed: 22, dmg: 1, scale: 0.95, kind: 'twin', trailColor: 0xffe476,
    });
    burst(_boltFrom.x, _boltFrom.y, _boltFrom.z, 0x8ef5ee, 7, true);
  } else if (variant === 3) {
    // F -> F -> F: Grand Star-Orb Finisher (explodes in 3.2u radial starburst!)
    spawnBoltProjectile(_boltFrom.x, _boltFrom.y + 0.06, _boltFrom.z, bx, by, bz, {
      speed: 18.5, dmg: 2, heavy: true, scale: 1.9, radius: 1.55, explodeRadius: 3.2,
      life: 1.65, gravity: 1.0, kind: 'orb', trailColor: 0xffe052,
    });
    burst(_boltFrom.x, _boltFrom.y + 0.06, _boltFrom.z, 0xffe476, 12, true);
    Physics.addCameraShake(0.2);
  } else if (variant === 'fan') {
    // Click -> F: 3-Bolt Star-Fan Scatter (-14°, 0°, +14°) from Staff-Lantern sweep
    const angles = [-0.24, 0, 0.24];
    for (let k = 0; k < angles.length; k++) {
      const ca = Math.cos(angles[k]);
      const sa = Math.sin(angles[k]);
      const fx = bx * ca - bz * sa;
      const fz = bx * sa + bz * ca;
      spawnBoltProjectile(_boltFrom.x, _boltFrom.y, _boltFrom.z, fx, by, fz, {
        speed: 21, dmg: 1, scale: 1.05, kind: 'fan', trailColor: 0x6ef2e6,
      });
    }
    triggerSlashVfx(2);
    burst(_boltFrom.x, _boltFrom.y, _boltFrom.z, 0x6ef2e6, 10, true);
  } else if (variant === 'comet') {
    // Click -> Click -> F: Blazing Piercing Comet Lance from Staff-Lantern!
    spawnBoltProjectile(_boltFrom.x, _boltFrom.y + 0.06, _boltFrom.z, bx, by, bz, {
      speed: 25.5, dmg: 2, heavy: true, pierce: true, scale: 2.2, radius: 1.65,
      life: 1.35, gravity: 0.35, kind: 'comet', trailColor: 0xffd24a,
    });
    burst(_boltFrom.x, _boltFrom.y + 0.06, _boltFrom.z, 0xffe875, 14, true);
    Physics.addCameraShake(0.32);
  } else if (variant === 'nova') {
    // Click x3 -> F: 6-Bolt 360° Constellation Nova from skyward Staff-Lantern!
    for (let k = 0; k < 6; k++) {
      const ang = P.facing + (k / 6) * Math.PI * 2;
      spawnBoltProjectile(_boltFrom.x, _boltFrom.y - 0.65, _boltFrom.z, Math.sin(ang), 0.04, Math.cos(ang), {
        speed: 19.5, dmg: 1, heavy: true, scale: 1.25, life: 1.15, gravity: 0.6,
        kind: 'nova', trailColor: 0xffe476,
      });
    }
    triggerShockwaveVfx(P.x, P.y, P.z, 4.4, 0xffe052);
    burst(_boltFrom.x, _boltFrom.y, _boltFrom.z, 0xffe476, 18, true);
    Physics.addCameraShake(0.4);
  } else {
    // F (Step 1): Crisp golden Star Bolt launched directly from glowing Staff-Lantern crystal!
    spawnBoltProjectile(_boltFrom.x, _boltFrom.y, _boltFrom.z, bx, by, bz, {
      speed: 20, dmg: 1, scale: 1.0, kind: 'bolt', trailColor: 0xffe476,
    });
    burst(_boltFrom.x, _boltFrom.y, _boltFrom.z, 0xfff0a0, 7, true);
  }
  return variant;
}

function updateBolts(dt, nowTime) {
  shootCooldown = Math.max(0, shootCooldown - dt);
  if (shotBufT > 0) {
    shotBufT = Math.max(0, shotBufT - dt);
    if (shootCooldown <= 0 && started && !P.dead) {
      shotBufT = 0;
      shoot();
    }
  }

  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    b.vy -= (b.gravity !== undefined ? b.gravity : 1.4) * dt;
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.y += b.vy * dt;
    b.mesh.position.z += b.vz * dt;

    if (b.trailColor) {
      b.trailAcc += dt;
      if (b.trailAcc >= (b.heavy ? 0.028 : 0.055)) {
        b.trailAcc = 0;
        burst(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.trailColor, b.heavy ? 2 : 1, true);
      }
    }

    const bu = b.mesh.userData;
    if (bu && bu.core) {
      bu.core.rotation.z += dt * (b.heavy ? 15 : 11);
      bu.core.rotation.y += dt * 7;
    }
    if (bu && bu.halo && bu.halo.scale) {
      const hs = 0.95 + Math.sin(nowTime * 16 + i) * 0.14;
      bu.halo.scale.set(hs, hs, 1);
    }

    let consumed = false;
    const hitR = b.radius || 1.25;
    for (let j = glooms.length - 1; j >= 0; j--) {
      const g = glooms[j];
      if (b.hitList && b.hitList.includes(g)) continue;
      const gp = g.mesh.position;
      const gYOff = (g.tier && g.tier.yOffset) || 0.65;
      const gRadExtra = g.tier && g.tier.colRadius ? Math.max(0, g.tier.colRadius - 0.65) : 0;
      const d = Math.hypot(
        b.mesh.position.x - gp.x,
        b.mesh.position.y - (gp.y + gYOff),
        b.mesh.position.z - gp.z
      );
      if (d < hitR + gRadExtra) {
        if (b.explodeRadius > 0) {
          explodeStarOrb(b.mesh.position.x, Math.max(gp.y, b.mesh.position.y - 0.3), b.mesh.position.z, b.explodeRadius, b.dmg);
          consumed = true;
          break;
        }
        _boltDir.set(b.vx, b.vy, b.vz);
        hitGloom(g, j, _boltDir, b.dmg, false, b.heavy);
        if (b.pierce) {
          b.hitList.push(g);
          Sound.hitImpact(true);
        } else {
          consumed = true;
          break;
        }
      }
    }
    if (!consumed) {
      for (let j = cocoons.length - 1; j >= 0; j--) {
        const cc = cocoons[j];
        const cp = cc.mesh.position;
        const d = Math.hypot(
          b.mesh.position.x - cp.x,
          b.mesh.position.y - (cp.y + 0.7),
          b.mesh.position.z - cp.z
        );
        if (d < hitR + 0.08) {
          if (b.explodeRadius > 0) {
            explodeStarOrb(cp.x, cp.y, cp.z, b.explodeRadius, b.dmg);
            consumed = true;
            break;
          }
          popCocoon(cc, j);
          if (!b.pierce) {
            consumed = true;
            break;
          }
        }
      }
    }
    // Exploding Grand Star-Orb also detonates cleanly if it slams into the ground
    if (!consumed && b.explodeRadius > 0) {
      const gh = heightAt(b.mesh.position.x, b.mesh.position.z);
      if (b.mesh.position.y <= gh + 0.3) {
        explodeStarOrb(b.mesh.position.x, gh, b.mesh.position.z, b.explodeRadius, b.dmg);
        consumed = true;
      }
    }
    if (consumed || b.life <= 0) {
      scene.remove(b.mesh);
      bolts.splice(i, 1);
    }
  }
}

function hitGloom(g, index, boltDir, dmg = 1, fromMelee = false, heavy = false) {
  if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.onGloomHit === 'function') {
    return Enemies.onGloomHit(g, index, boltDir, dmg, fromMelee, heavy, _enemyCtx);
  }
  g.hp -= dmg;
  g.flash = heavy ? 0.34 : 0.25;
  // Interrupt windup when struck hard!
  if (g.state === 'windup' && (heavy || fromMelee)) {
    g.state = 'recover';
    g.stateT = 0.35;
  }

  const p = g.mesh.position;
  let kx = 0;
  let kz = 0;
  if (boltDir) {
    const hl = Math.hypot(boltDir.x, boltDir.z);
    if (hl > 0.05) {
      kx = boltDir.x / hl;
      kz = boltDir.z / hl;
    }
  }
  if (kx === 0 && kz === 0) {
    const dx = p.x - P.x;
    const dz = p.z - P.z;
    const dl = Math.hypot(dx, dz) || 1;
    kx = dx / dl;
    kz = dz / dl;
  }

  const knockForce = heavy ? 17.0 : fromMelee ? 13.5 : 11.5;
  g.kx += kx * knockForce;
  g.kz += kz * knockForce;
  g.ky = Math.max(g.ky || 0, heavy ? 6.2 : 4.4);

  burst(p.x, p.y + 0.65, p.z, 0xffd93b, heavy ? 11 : 6);
  burst(p.x, p.y + 0.65, p.z, 0x8a5cd8, heavy ? 9 : 5);

  if (g.hp > 0) {
    if (!fromMelee) Sound.hitImpact(false);
    return;
  }

  burst(p.x, p.y + 0.6, p.z, 0x6a5a8a, 14);
  burst(p.x, p.y + 0.8, p.z, 0xffd93b, 14);
  Sound.poof();

  const drops = g.stolen ? 3 : 2;
  for (let k = 0; k < drops; k++) {
    const mesh = Models.makeStarPickup();
    const ang = (k / drops) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
    const spd = 2.6 + Math.random() * 1.8;
    mesh.position.set(p.x, p.y + 0.95, p.z);
    mesh.userData.kind = 'star';
    mesh.userData.bouncing = true;
    mesh.userData.bounces = 0;
    mesh.userData.vx = Math.cos(ang) * spd;
    mesh.userData.vy = 5.5 + Math.random() * 2.0;
    mesh.userData.vz = Math.sin(ang) * spd;
    mesh.userData.baseY = heightAt(p.x, p.z) + 0.9;
    mesh.userData.age = 0;
    scene.add(mesh);
    pickups.push(mesh);
  }

  // Heart crystal drop (45% base, 75% when Starkeeper is hurt)
  const heartChance = P.hp < P.maxHp ? 0.75 : 0.45;
  if (Math.random() < heartChance) {
    spawnHeartDrop(p.x, p.y, p.z);
  }

  if (Math.random() < 0.18 && followers.length < 6) {
    addFollower(p.x, p.y, p.z, 'A gloom turned good! It joined your defenders!');
  }
  questEvent('bop');
  scene.remove(g.mesh);
  const rmIdx = glooms[index] === g ? index : glooms.indexOf(g);
  if (rmIdx >= 0) glooms.splice(rmIdx, 1);
  Physics.validateLockTarget();
}

function updateGlooms(dt, nowTime) {
  if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.updateGlooms === 'function') {
    if (!underwaterEnemiesInit && (P.z > 40 || (currentRegion && currentRegion.id === 'sunkenCity'))) {
      underwaterEnemiesInit = true;
      if (typeof Enemies.initUnderwaterEnemies === 'function') {
        Enemies.initUnderwaterEnemies(glooms, _enemyCtx);
      }
    }
    Enemies.updateGlooms(glooms, dt, nowTime, _enemyCtx);
    return;
  }
  for (let tries = 0; glooms.length < gloomTargetCount() && tries < 4; tries++) {
    spawnGloom();
  }

  const knockDecay = Math.exp(-8.5 * dt);

  for (let i = glooms.length - 1; i >= 0; i--) {
    const g = glooms[i];
    const m = g.mesh;
    const u = m.userData;
    const dxP = m.position.x - P.x;
    const dzP = m.position.z - P.z;
    const d = Math.hypot(dxP, dzP);

    g.flash = Math.max(0, g.flash - dt);

    // Choose nearest combat target (Starkeeper or a close defending companion)
    let targetX = P.x;
    let targetZ = P.z;
    let targetDist = P.dead ? 999 : d;
    let targetAlly = null;
    for (let fIdx = 0; fIdx < followers.length; fIdx++) {
      const ally = followers[fIdx];
      const ad = Math.hypot(m.position.x - ally.mesh.position.x, m.position.z - ally.mesh.position.z);
      if (ad < targetDist && ad < 7.5) {
        targetDist = ad;
        targetX = ally.mesh.position.x;
        targetZ = ally.mesh.position.z;
        targetAlly = ally;
      }
    }

    let speed = 1.6;
    let chasing = false;
    let windingUp = false;

    if (g.state === 'flee') {
      g.targetAlly = null;
      speed = 7.8;
      g.fleeT -= dt;
      g.dir = Math.atan2(dxP, dzP);
      if (g.fleeT <= 0) {
        scene.remove(m);
        glooms.splice(i, 1);
        Physics.validateLockTarget();
        continue;
      }
    } else if (g.state === 'windup') {
      windingUp = true;
      speed = 0;
      g.stateT -= dt;
      g.dir = Math.atan2(targetX - m.position.x, targetZ - m.position.z);
      if (g.stateT <= 0) {
        g.state = 'lunge';
        g.stateT = 0.26;
        g.targetAlly = targetAlly;
        g.ky = 3.2;
      }
    } else if (g.state === 'lunge') {
      speed = 10.5;
      chasing = true;
      g.stateT -= dt;
      const toPlayerD = Math.hypot(m.position.x - P.x, m.position.z - P.z);
      if (!P.dead && toPlayerD < 1.75) {
        if (P.invulnT <= 0 && P.hurtInvulnT <= 0) {
          const safeD = Math.max(0.15, toPlayerD);
          const kDirX = (P.x - m.position.x) / safeD;
          const kDirZ = (P.z - m.position.z) / safeD;
          damagePlayer(2, 'gloom', kDirX * 8.5, kDirZ * 8.5);
          g.state = 'recover';
          g.stateT = 0.65;
        }
      } else if (g.targetAlly && followers.includes(g.targetAlly)) {
        const ap = g.targetAlly.mesh.position;
        const aD = Math.hypot(m.position.x - ap.x, m.position.z - ap.z);
        if (aD < 1.65) {
          const safeD = Math.max(0.15, aD);
          damageCompanion(g.targetAlly, 1, ((ap.x - m.position.x) / safeD) * 7.5, ((ap.z - m.position.z) / safeD) * 7.5, g);
          g.state = 'recover';
          g.stateT = 0.65;
        }
      }
      if (g.state === 'lunge' && g.stateT <= 0) {
        g.state = 'recover';
        g.stateT = 0.55;
      }
    } else if (g.state === 'recover') {
      speed = 0.6;
      g.stateT -= dt;
      if (g.stateT <= 0) g.state = 'wander';
    } else if (targetDist < 13) {
      speed = 3.9;
      chasing = true;
      g.targetAlly = targetAlly;
      g.dir = Math.atan2(targetX - m.position.x, targetZ - m.position.z);
      if (targetDist < 2.55) {
        g.state = 'windup';
        g.stateT = 0.42;
        g.targetAlly = targetAlly;
      }
    } else {
      g.targetAlly = null;
      g.turnT -= dt;
      if (g.turnT <= 0) {
        g.dir += (Math.random() - 0.5) * 2.5;
        g.turnT = 2 + Math.random() * 3;
      }
    }

    const aiVx = Math.sin(g.dir) * speed;
    const aiVz = Math.cos(g.dir) * speed;
    const totalVx = aiVx + g.kx;
    const totalVz = aiVz + g.kz;
    g.vx = totalVx;
    g.vz = totalVz;
    g.kx *= knockDecay;
    g.kz *= knockDecay;
    if (Math.abs(g.kx) < 0.02) g.kx = 0;
    if (Math.abs(g.kz) < 0.02) g.kz = 0;

    let nx = m.position.x + totalVx * dt;
    let nz = m.position.z + totalVz * dt;
    const curH = heightAt(m.position.x, m.position.z);
    const nextH = heightAt(nx, nz);

    if (nextH > 0.3 && nextH - curH < 2.2) {
      m.position.x = nx;
      m.position.z = nz;
    } else {
      g.dir += 2.5;
      g.kx *= -0.35;
      g.kz *= -0.35;
    }

    getNearbyColliders(m.position.x, m.position.z, 1.2, _gloomColBuf);
    Physics.resolveColliders(m.position.x, m.position.z, 0.65, _gloomColBuf, _colOut);
    m.position.x = _colOut.x;
    m.position.z = _colOut.z;

    const groundH = heightAt(m.position.x, m.position.z);
    g.hopT += dt * (g.state === 'flee' ? 11 : g.state === 'lunge' ? 14 : 7);
    const hopArc = windingUp ? 0 : Math.max(0, Math.sin(g.hopT)) * 0.25;

    if (g.ky > 0 || m.position.y > groundH + hopArc + 0.02) {
      g.ky -= 22 * dt;
      m.position.y += g.ky * dt;
      if (m.position.y <= groundH + hopArc) {
        m.position.y = groundH + hopArc;
        g.ky = 0;
      }
    } else {
      m.position.y = groundH + hopArc;
    }

    const flashNorm = g.flash / 0.25;
    const hopSin = Math.sin(g.hopT);
    const stretch = windingUp ? -0.24 : Math.max(0, hopSin) * 0.12 - Math.max(0, -hopSin) * 0.06;
    const recoil = flashNorm * 0.22;
    const windWiden = windingUp ? 0.18 : 0;
    m.scale.set(
      1 + recoil + windWiden - stretch * 0.45,
      Math.max(0.62, 1 - recoil * 0.55 + stretch),
      1 + recoil + windWiden - stretch * 0.45
    );

    if (u) {
      if (u.eyeMat) {
        if (g.flash > 0) {
          u.eyeMat.emissive.setRGB(1.0, 0.55 + flashNorm * 0.45, 0.1 + flashNorm * 0.9);
          u.eyeMat.emissiveIntensity = 1.15 + flashNorm * 3.5;
        } else if (windingUp || g.state === 'lunge') {
          u.eyeMat.emissive.setRGB(1.0, 0.12, 0.06);
          u.eyeMat.emissiveIntensity = 2.8;
        } else {
          u.eyeMat.emissive.setHex(0xff8c10);
          u.eyeMat.emissiveIntensity = 1.15;
        }
      }
      if (u.body) {
        const wantLean = g.flash > 0 ? -flashNorm * 0.45 : windingUp ? -0.32 : (g.state === 'lunge' ? 0.42 : chasing ? 0.22 : 0.04);
        u.body.rotation.x += (wantLean - u.body.rotation.x) * Math.min(1, dt * 12);
      }
      if (u.wisps) {
        for (let wIdx = 0; wIdx < u.wisps.length; wIdx++) {
          const wisp = u.wisps[wIdx];
          const wa = nowTime * (windingUp ? 5.5 : 2.2) + (wIdx / u.wisps.length) * Math.PI * 2;
          wisp.position.set(
            Math.cos(wa) * 0.82,
            0.62 + Math.sin(nowTime * 3.6 + wIdx * 2.1) * 0.16,
            Math.sin(wa) * 0.82
          );
          wisp.rotation.y += dt * 3.0;
        }
      }
      if (u.halo && u.halo.scale) {
        const hs = 2.0 + Math.sin(nowTime * 3.1 + i) * 0.14 + flashNorm * 0.65 + (windingUp ? 0.55 : 0);
        u.halo.scale.set(hs, hs, 1);
      }
    }

    Physics.turnToward(m, g.dir, dt, windingUp ? 14 : 6);

    if (d > 90) {
      scene.remove(m);
      glooms.splice(i, 1);
      Physics.validateLockTarget();
    }
  }
}

function updateCocoons(dt, nowTime) {
  for (let tries = 0; cocoons.length < 2 && tries < 3; tries++) {
    spawnCocoon();
  }
  for (let i = 0; i < cocoons.length; i++) {
    const cc = cocoons[i];
    const u = cc.mesh.userData;
    if (!u) continue;
    const pulse = Math.sin(nowTime * 2.8 + cc.phase);
    if (u.core) {
      u.core.rotation.y += dt * 0.85;
      const s = 0.95 + pulse * 0.06;
      u.core.scale.set(s, 1.22 + pulse * 0.07, s);
    }
    if (u.halo && u.halo.scale) {
      const hs = 2.05 + pulse * 0.22;
      u.halo.scale.set(hs, hs, 1);
    }
  }
}

// ---------- 6. Rescue Parade & Wild Starlings ----------

function popCocoon(cc, index) {
  const p = cc.mesh.position;
  burst(p.x, p.y + 0.7, p.z, 0x6a5a8a, 14);
  burst(p.x, p.y + 0.7, p.z, 0xffe9a8, 12);
  Sound.chime();
  addFollower(p.x, p.y, p.z);
  questEvent('rescue');
  scene.remove(cc.mesh);
  cocoons.splice(index, 1);
  Physics.validateLockTarget();
}

const followers = [];
const wild = [];
let wildHinted = false;

const _animalCtx = {
  scene,
  P,
  player,
  Physics,
  Models,
  Shaders,
  Textures,
  Sound: typeof Sound !== 'undefined' ? Sound : null,
  Regions: typeof Regions !== 'undefined' ? Regions : null,
  LAND,
  AQUA,
  glooms,
  heightAt: (x, z) => heightAt(x, z),
  terrainNormalAt: (x, z, out) => terrainNormalAt(x, z, out),
  surfaceAt: (x, z) => surfaceAt(x, z),
  getNearbyColliders: (x, z, r, out) => getNearbyColliders(x, z, r, out),
  burst,
  dustBurst,
  splashBurst,
  stampFootprint,
  hitGloom,
  addFollower,
  spawnWild,
  pickUniqueCritterName,
  questEvent,
  toast,
  WATER_Y,
};

let underwaterEnemiesInit = false;

const _enemyCtx = {
  scene,
  P,
  player,
  Physics,
  Models,
  Shaders,
  Textures,
  Sound: typeof Sound !== 'undefined' ? Sound : null,
  Regions: typeof Regions !== 'undefined' ? Regions : null,
  Animals: typeof Animals !== 'undefined' ? Animals : null,
  glooms,
  followers,
  pickups,
  getLit: () => lit,
  getSanctuary: () => sanctuary,
  heightAt: (x, z) => heightAt(x, z),
  terrainNormalAt: (x, z, out) => terrainNormalAt(x, z, out),
  surfaceAt: (x, z) => surfaceAt(x, z),
  getNearbyColliders: (x, z, r, out) => getNearbyColliders(x, z, r, out),
  burst,
  dustBurst,
  splashBurst,
  triggerShockwaveVfx,
  damagePlayer,
  damageCompanion,
  spawnGloom,
  spawnHeartDrop,
  addFollower,
  questEvent,
  toast,
  WATER_Y,
};

if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.initTelegraphPool === 'function') {
  Enemies.initTelegraphPool(scene, Models, 4);
}

function alignCritterToSlope(mesh, x, z, dt) {
  if (typeof terrainNormalAt !== 'function') return;
  terrainNormalAt(x, z, _critterNorm);
  const yaw = mesh.rotation.y;
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  // Upward slope has negative fwdDotN -> pitch nose up (-rotation.x in YXZ local space)
  const fwdDot = Math.max(-0.52, Math.min(0.52, _critterNorm.x * fwdX + _critterNorm.z * fwdZ));
  const rightDot = Math.max(-0.42, Math.min(0.42, _critterNorm.x * rightX + _critterNorm.z * rightZ));
  const wantPitch = Math.asin(fwdDot);
  const wantRoll = Math.asin(rightDot);
  const k = Math.min(1, dt * 8);
  mesh.rotation.x += (wantPitch - mesh.rotation.x) * k;
  mesh.rotation.z += (wantRoll - mesh.rotation.z) * k;
}

function addFollower(x, y, z, message, sp, givenName, statsOverride) {
  const pool = LAND.slice(0, unlockedLand);
  const use = sp || pool[Math.floor(Math.random() * pool.length)];
  const displayName = givenName || pickUniqueCritterName(use);
  const stats = statsOverride || (
    typeof Animals !== 'undefined' && Animals && typeof Animals.rollIndividualStats === 'function'
      ? Animals.rollIndividualStats(use)
      : null
  );
  const scale = 0.8 * (stats && typeof stats.sizeVar === 'number' ? stats.sizeVar : 1);
  const mesh = Models.makeCritter(use, scale);
  const spawnY = Math.max(y, heightAt(x, z));
  mesh.position.set(x, spawnY, z);
  let phys = null;
  if (typeof Animals !== 'undefined' && Animals) {
    if (typeof Animals.attachToCritter === 'function') {
      Animals.attachToCritter(mesh, use, { Models, Textures, Shaders });
    }
    if (typeof Animals.createPhysicsState === 'function') {
      phys = Animals.createPhysicsState(x, spawnY, z, use);
    }
  }
  scene.add(mesh);
  const baseHp = (stats && typeof stats.maxHp === 'number')
    ? stats.maxHp
    : (3 + ((use && use.bonusHp) ? use.bonusHp : (use && use.rare ? 3 : 0)));
  followers.push({
    mesh,
    phys,
    stats,
    hopT: Math.random() * 9,
    gaitPhase: Math.random() * Math.PI * 2,
    smoothSpd: 0,
    dustAcc: 0,
    species: use,
    displayName,
    hp: baseHp,
    maxHp: baseHp,
    hurtInvulnT: 0,
    flash: 0,
    atkCooldown: 0.7 + Math.random() * 0.6,
    attacker: null,
    defendT: 0,
    kx: 0,
    kz: 0,
    lookCand: { mesh, maxDist: 8, yOffset: 0.45 },
  });
  if ((followers.length > 1 || (message && message.includes('joined your band'))) &&
      typeof Animals !== 'undefined' && Animals && typeof Animals.celebrate === 'function') {
    Animals.celebrate(followers, _animalCtx);
  }
  const fEl = document.getElementById('friendCount');
  if (fEl) fEl.textContent = followers.length;
  if (player && player.userData && player.userData.glbRig && typeof player.userData.glbRig.triggerEmote === 'function') {
    player.userData.glbRig.triggerEmote('smile', 2.5);
  }
  if (message) toast(message);
  else toast(`${displayName} is free and joined your band!`, 2600);
}

function damageCompanion(ally, amount = 1, kx = 0, kz = 0, attacker = null) {
  const idx = followers.indexOf(ally);
  if (idx < 0 || amount <= 0) return false;
  if (ally.hurtInvulnT > 0) return false;

  let effDmg = amount;
  let knockScale = 1.0;
  let mitigated = false;
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.applyCompanionDefense === 'function') {
    const syn = typeof Animals.computeBandSynergy === 'function'
      ? Animals.computeBandSynergy(followers)
      : null;
    const defRes = Animals.applyCompanionDefense(ally, amount, syn);
    effDmg = defRes.damage;
    knockScale = defRes.knockScale;
    mitigated = defRes.mitigated;
  }

  ally.hp = Math.max(0, ally.hp - effDmg);
  ally.hurtInvulnT = 0.75;
  ally.flash = 0.3;
  ally.kx += kx * knockScale;
  ally.kz += kz * knockScale;
  if (attacker && ally.hp > 0) {
    ally.attacker = attacker;
    ally.defendT = 6.0;
  }
  if (ally.mesh && ally.mesh.userData && ally.mesh.userData.animalRig &&
      typeof ally.mesh.userData.animalRig.triggerOneShot === 'function') {
    ally.mesh.userData.animalRig.triggerOneShot('hit', 0.35);
    ally._hurtAnimPlayed = true;
  }

  const p = ally.mesh.position;
  burst(p.x, p.y + 0.6, p.z, 0xff5a7a, mitigated ? 5 : 8);
  if (mitigated) {
    burst(p.x, p.y + 0.65, p.z, 0xb8f0ff, 5, true);
  }
  Sound.hurt();

  if (ally.hp <= 0) {
    burst(p.x, p.y + 0.7, p.z, 0xffe49c, 14);
    burst(p.x, p.y + 0.7, p.z, ally.species.color || 0xffffff, 10);
    spawnHeartDrop(p.x, p.y, p.z);
    scene.remove(ally.mesh);
    followers.splice(idx, 1);
    const fEl = document.getElementById('friendCount');
    if (fEl) fEl.textContent = followers.length;
    toast(`${ally.displayName || ally.species.name} fell defending you!`, 2600);
  }
  return true;
}

function spawnWild() {
  const spot = started
    ? offscreenLandSpot(P.x, P.z, 20, 46, 0.6, 50)
    : landSpot(P.x, P.z, 10, 40, 0.6);
  if (!spot) return;
  const pool = LAND.slice(0, unlockedLand);
  const baseSp = pool[Math.floor(Math.random() * pool.length)];
  const sp = (typeof Animals !== 'undefined' && Animals && typeof Animals.rollRareSpecies === 'function')
    ? Animals.rollRareSpecies(baseSp)
    : baseSp;
  const stats = (typeof Animals !== 'undefined' && Animals && typeof Animals.rollIndividualStats === 'function')
    ? Animals.rollIndividualStats(sp)
    : null;
  const mesh = Models.makeCritter(sp, stats && typeof stats.sizeVar === 'number' ? stats.sizeVar : 1);
  mesh.position.set(spot.x, spot.h, spot.z);
  let phys = null;
  if (typeof Animals !== 'undefined' && Animals) {
    if (typeof Animals.attachToCritter === 'function') {
      Animals.attachToCritter(mesh, sp, { Models, Textures, Shaders });
    }
    if (typeof Animals.createPhysicsState === 'function') {
      phys = Animals.createPhysicsState(spot.x, spot.h, spot.z, sp);
    }
  }
  scene.add(mesh);
  wild.push({
    mesh,
    species: sp,
    stats,
    displayName: pickUniqueCritterName(sp),
    phys,
    dir: Math.random() * Math.PI * 2,
    turnT: 2 + Math.random() * 3,
    hopT: Math.random() * 9,
    gaitPhase: Math.random() * Math.PI * 2,
    smoothSpd: 0,
    dustAcc: 0,
    state: 'wander',
    fleeT: 0,
    trustT: 0,
    lookCand: { mesh, maxDist: 8, yOffset: 0.45 },
  });
}

function updateWild(dt) {
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.updateWild === 'function') {
    Animals.updateWild(wild, dt, time, _animalCtx);
    return;
  }
  for (let tries = 0; wild.length < 6 && tries < 3; tries++) spawnWild();

  for (let i = wild.length - 1; i >= 0; i--) {
    const w = wild[i];
    const m = w.mesh;
    const prevX = m.position.x;
    const prevZ = m.position.z;
    const d = Math.hypot(prevX - P.x, prevZ - P.z);
    let speed = 0;

    if (w.state === 'wander') {
      w.turnT -= dt;
      if (w.turnT <= 0) {
        w.dir += (Math.random() - 0.5) * 2.5;
        w.turnT = 2 + Math.random() * 3;
      }
      speed = 2.0;
      if (d < 6) {
        w.state = 'flee';
        w.fleeT = 0;
        if (!wildHinted) {
          wildHinted = true;
          toast('That critter is shy! Chase it gently until it stops...', 3500);
        }
      }
    } else if (w.state === 'flee') {
      w.dir = Math.atan2(prevX - P.x, prevZ - P.z);
      speed = 5.8;
      w.fleeT += dt;
      if (d > 14) {
        w.state = 'wander';
      } else if (w.fleeT > 3.5) {
        w.state = 'tired';
        w.trustT = 0;
        toast("It's tired! Stay close a moment...", 2200);
      }
    } else {
      if (Math.random() < dt * 7) {
        burst(m.position.x, m.position.y + 1, m.position.z, 0xff8fb0, 1, true);
      }
      if (d > 9) {
        w.state = 'flee';
        w.fleeT = 2;
      }
      w.trustT += dt;
      if (w.trustT > 2) {
        burst(m.position.x, m.position.y + 0.8, m.position.z, 0xffd93b, 12);
        Sound.chime();
        addFollower(
          m.position.x,
          m.position.y,
          m.position.z,
          (w.displayName || pickUniqueCritterName(w.species)) + ' joined your band! Friends fight beside you against Gloomblobs.',
          w.species,
          w.displayName,
          w.stats || null
        );
        questEvent('befriend');
        scene.remove(m);
        wild.splice(i, 1);
        continue;
      }
    }

    if (speed > 0) {
      const nx = prevX + Math.sin(w.dir) * speed * dt;
      const nz = prevZ + Math.cos(w.dir) * speed * dt;
      const h = heightAt(nx, nz);
      if (h > 0.4 && h - heightAt(prevX, prevZ) < 2) {
        getNearbyColliders(nx, nz, 1.0, _critterColBuf);
        Physics.resolveColliders(nx, nz, 0.42, _critterColBuf, _colOut);
        m.position.x = _colOut.x;
        m.position.z = _colOut.z;
        if (_colOut.hit) w.dir += 1.4 * dt;
      } else {
        w.dir += 2.5;
      }
    }

    // Displacement-synced gait phase so paws/feet NEVER skate over the ground!
    const moved = Math.hypot(m.position.x - prevX, m.position.z - prevZ);
    const instSpd = moved / Math.max(0.001, dt);
    w.smoothSpd += (instSpd - w.smoothSpd) * Math.min(1, dt * 10);
    const strideLen = ((m.userData && m.userData.strideLen) || 0.85) * (m.scale ? m.scale.x : 1);
    w.gaitPhase += (moved / Math.max(0.25, strideLen)) * Math.PI * 2;
    w.hopT += dt;

    const baseGh = heightAt(m.position.x, m.position.z);
    const gh = typeof Physics.getSupportHeight === 'function'
      ? Physics.getSupportHeight(m.position.x, m.position.z, baseGh + 0.25, baseGh, _critterColBuf, 0)
      : baseGh;
    const arch = w.species.archetype || w.species.plan;
    // Species-authentic vertical flight/hop behavior:
    // - Kiwi stays firmly grounded sprinting on foot!
    // - Songbird hops on land & flutters aloft when startled; Owl swoops smoothly; Firefly buzz-hovers when fleeing!
    let airLift = 0;
    if (arch === 'songbird') {
      airLift = w.smoothSpd > 4.2 ? 0.55 + Math.sin(time * 9 + i) * 0.14 : Math.max(0, Math.sin(w.gaitPhase)) * 0.14;
    } else if (arch === 'owl') {
      airLift = w.smoothSpd > 3.6 ? 0.72 + Math.sin(time * 5.5 + i) * 0.16 : 0;
    } else if (arch === 'firefly') {
      airLift = w.smoothSpd > 3.5 ? 0.48 + Math.sin(time * 12 + i) * 0.12 : 0;
    }
    m.position.y = gh + airLift;

    // ALL grounded wild critters leave crisp distance-synced tracks in sand & snow!
    if (moved > 0.001 && airLift < 0.16 && gh > WATER_Y - 0.12) {
      w.printDist = (w.printDist || 0) + moved;
      const stepDist = arch === 'bear' || arch === 'deer' ? 0.78 : arch === 'beetle' ? 0.56 : 0.66;
      if (w.printDist >= stepDist) {
        w.printDist -= stepDist;
        const wSurf = surfaceAt(m.position.x, m.position.z);
        if (wSurf === 'sand' || wSurf === 'snow') {
          w.stepSide = -(w.stepSide || 1);
          const pScale = arch === 'bear' || arch === 'deer' ? 0.78 : arch === 'beetle' || arch === 'songbird' ? 0.50 : 0.66;
          stampFootprint(m.position.x, gh, m.position.z, m.rotation.y, wSurf, w.stepSide, pScale);
        }
      }
    }
    if (w.species.plan === 'quad' && w.smoothSpd > 4.8) {
      w.dustAcc += dt;
      if (w.dustAcc >= 0.24) {
        w.dustAcc = 0;
        dustBurst(m.position.x, gh + 0.06, m.position.z, 1, surfaceAt(m.position.x, m.position.z));
      }
    }

    Physics.turnToward(m, w.dir, dt, 8);
    if (airLift < 0.2) alignCritterToSlope(m, m.position.x, m.position.z, dt);
    else { m.rotation.x *= 0.85; m.rotation.z *= 0.85; }
    _critterAnimOpts.idleTime = time + i * 1.3;
    _critterAnimOpts.airborne = airLift > 0.22;
    Models.animateCritter(m, w.gaitPhase, w.smoothSpd, _critterAnimOpts);
    if (d > 90) {
      scene.remove(m);
      wild.splice(i, 1);
    }
  }
}

function updateFollowers(dt) {
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.updateFollowers === 'function') {
    Animals.updateFollowers(followers, dt, time, _animalCtx);
    return;
  }
  const knockDecay = Math.exp(-8 * dt);
  let fightersUsed = 0;
  let leader = player.position;

  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    const m = f.mesh;
    const prevX = m.position.x;
    const prevZ = m.position.z;
    if (f.hurtInvulnT > 0) f.hurtInvulnT = Math.max(0, f.hurtInvulnT - dt);
    if (f.flash > 0) f.flash = Math.max(0, f.flash - dt);
    if (f.atkCooldown > 0) f.atkCooldown = Math.max(0, f.atkCooldown - dt);
    if (f.defendT > 0) {
      f.defendT = Math.max(0, f.defendT - dt);
      if (f.defendT <= 0) f.attacker = null;
    }

    // 3-Tier Companion Combat Priority:
    //   1. Self-Defense (UNCAPPED, active even when Starkeeper is far away or down!)
    //   2. Defend Fellow Companions being actively attacked nearby
    //   3. Defend Starkeeper (up to 3 escort fighters within 14u of Starkeeper)
    let combatTarget = null;
    let combatIdx = -1;
    let isSelfDefense = false;
    if (glooms.length > 0) {
      // Tier 1a: Retaliate directly against recent attacker
      if (f.attacker && f.attacker.hp > 0 && f.attacker.state !== 'flee') {
        const aIdx = glooms.indexOf(f.attacker);
        if (aIdx >= 0) {
          const ap = f.attacker.mesh.position;
          if (Math.hypot(ap.x - prevX, ap.z - prevZ) < 14) {
            combatTarget = f.attacker;
            combatIdx = aIdx;
            isSelfDefense = true;
          }
        } else {
          f.attacker = null;
        }
      }

      // Tier 1b: Fight back against any gloom targeting this companion or closing within 7u
      if (!combatTarget) {
        let bestSelfD = Infinity;
        for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
          const g = glooms[gIdx];
          if (g.hp <= 0 || g.state === 'flee') continue;
          const gp = g.mesh.position;
          const dSelf = Math.hypot(gp.x - prevX, gp.z - prevZ);
          const targetingMe = g.targetAlly === f && dSelf < 11.5;
          const immediateThreat = dSelf < 7.0;
          if ((targetingMe || immediateThreat) && dSelf < bestSelfD) {
            bestSelfD = dSelf;
            combatTarget = g;
            combatIdx = gIdx;
            isSelfDefense = true;
          }
        }
      }

      // Tier 2: Rally to help a nearby fellow friend being attacked by a gloom
      if (!combatTarget && fightersUsed < 4) {
        let bestAllyThreatD = 10.5;
        for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
          const g = glooms[gIdx];
          if (g.hp <= 0 || g.state === 'flee' || !g.targetAlly || g.targetAlly === f) continue;
          const gp = g.mesh.position;
          const dSelf = Math.hypot(gp.x - prevX, gp.z - prevZ);
          if (dSelf < bestAllyThreatD) {
            bestAllyThreatD = dSelf;
            combatTarget = g;
            combatIdx = gIdx;
          }
        }
      }

      // Tier 3: Escort defense around Starkeeper
      if (!combatTarget && !P.dead && fightersUsed < 3) {
        let bestD = 14;
        for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
          const g = glooms[gIdx];
          if (g.hp <= 0 || g.state === 'flee') continue;
          const gp = g.mesh.position;
          const dPlayer = Math.hypot(gp.x - P.x, gp.z - P.z);
          if (dPlayer < bestD) {
            bestD = dPlayer;
            combatTarget = g;
            combatIdx = gIdx;
          }
        }
      }
    }

    let activeMove = false;
    let aimYaw = m.rotation.y;

    if (combatTarget) {
      if (!isSelfDefense) fightersUsed++;
      const gp = combatTarget.mesh.position;
      const dx = gp.x - m.position.x;
      const dz = gp.z - m.position.z;
      const distG = Math.hypot(dx, dz);
      aimYaw = Math.atan2(dx, dz);

      if (distG > 1.55) {
        const inv = 1 / Math.max(0.01, distG);
        const spd = f.atkCooldown > 1.3 ? 2.5 : 7.2;
        m.position.x += dx * inv * spd * dt;
        m.position.z += dz * inv * spd * dt;
        activeMove = true;
      }

      if (distG <= 1.9 && f.atkCooldown <= 0) {
        f.atkCooldown = 1.9 + Math.random() * 0.5;
        const plan = f.species.plan;
        const fxCol = plan === 'lizard' ? 0xff7a33 : plan === 'bug' ? 0xffe45c : plan === 'bird' ? 0xffffff : 0x7ef09c;
        burst(gp.x, gp.y + 0.7, gp.z, fxCol, 8);
        _boltDir.set(dx || 1, 0, dz).normalize();
        hitGloom(combatTarget, combatIdx, _boltDir, 1, false, false);
        // Quick tactical hop-back after landing a strike
        const inv = 1 / Math.max(0.1, distG);
        f.kx -= dx * inv * 5.2;
        f.kz -= dz * inv * 5.2;
      }
    } else {
      const d = m.position.distanceTo(leader);
      if (d > 1.55) {
        _followDir.subVectors(leader, m.position).setY(0).normalize();
        const speed = Math.min(10.5, 2.2 + d * 2.5);
        m.position.x += _followDir.x * speed * dt;
        m.position.z += _followDir.z * speed * dt;
        activeMove = d > 2;
      }
      aimYaw = Math.atan2(leader.x - m.position.x, leader.z - m.position.z);
      leader = m.position;
    }

    // Apply companion knockback decay
    if (f.kx || f.kz) {
      m.position.x += f.kx * dt;
      m.position.z += f.kz * dt;
      f.kx *= knockDecay;
      f.kz *= knockDecay;
      if (Math.abs(f.kx) < 0.02) f.kx = 0;
      if (Math.abs(f.kz) < 0.02) f.kz = 0;
    }

    getNearbyColliders(m.position.x, m.position.z, 1.0, _critterColBuf);
    Physics.resolveColliders(m.position.x, m.position.z, 0.4, _critterColBuf, _colOut);
    m.position.x = _colOut.x;
    m.position.z = _colOut.z;

    // Displacement-synced gait phase & grounded contact (no foot skating!)
    const moved = Math.hypot(m.position.x - prevX, m.position.z - prevZ);
    const instSpd = moved / Math.max(0.001, dt);
    f.smoothSpd += (instSpd - f.smoothSpd) * Math.min(1, dt * 10);
    const strideLen = ((m.userData && m.userData.strideLen) || 0.82) * 0.8;
    f.gaitPhase += (moved / Math.max(0.22, strideLen)) * Math.PI * 2;
    f.hopT += dt;

    const baseGh = heightAt(m.position.x, m.position.z);
    const gh = typeof Physics.getSupportHeight === 'function'
      ? Physics.getSupportHeight(m.position.x, m.position.z, baseGh + 0.25, baseGh, _critterColBuf, 0)
      : baseGh;
    const arch = f.species.archetype || f.species.plan;
    const canFly = arch === 'songbird' || arch === 'owl' || arch === 'firefly';
    const aerialSwoop = combatTarget && canFly;
    let airLift = 0;
    if (aerialSwoop) {
      airLift = 0.62 + Math.sin(time * (arch === 'firefly' ? 12 : 7) + i) * 0.12;
    } else if (arch === 'songbird') {
      airLift = f.smoothSpd > 4.6 ? 0.48 + Math.sin(time * 9 + i) * 0.12 : (f.smoothSpd > 0.5 ? Math.max(0, Math.sin(f.gaitPhase)) * 0.12 : 0);
    } else if (arch === 'owl' && f.smoothSpd > 4.0) {
      airLift = 0.65 + Math.sin(time * 5.5 + i) * 0.14;
    } else if (arch === 'firefly' && f.smoothSpd > 4.0) {
      airLift = 0.45 + Math.sin(time * 12 + i) * 0.10;
    }
    m.position.y = Math.max(gh, WATER_Y - 0.3) + airLift;

    // ALL grounded companions leave crisp distance-synced footsteps in sand & snow (not just quadrupeds!)
    if (moved > 0.001 && airLift < 0.16 && gh > WATER_Y - 0.12) {
      f.printDist = (f.printDist || 0) + moved;
      const stepDist = arch === 'bear' || arch === 'deer' ? 0.72 : arch === 'beetle' ? 0.52 : 0.62;
      if (f.printDist >= stepDist) {
        f.printDist -= stepDist;
        const fSurf = surfaceAt(m.position.x, m.position.z);
        if (fSurf === 'sand' || fSurf === 'snow') {
          f.stepSide = -(f.stepSide || 1);
          const pScale = arch === 'bear' || arch === 'deer' ? 0.76 : arch === 'beetle' || arch === 'songbird' ? 0.50 : 0.65;
          stampFootprint(m.position.x, gh, m.position.z, m.rotation.y, fSurf, f.stepSide, pScale);
        }
      }
    }
    if (f.species.plan === 'quad' && f.smoothSpd > 5.2 && gh > WATER_Y + 0.1) {
      f.dustAcc += dt;
      if (f.dustAcc >= 0.22) {
        f.dustAcc = 0;
        dustBurst(m.position.x, gh + 0.06, m.position.z, 1, surfaceAt(m.position.x, m.position.z));
      }
    }

    const hurtPulse = f.flash > 0 ? 1 + (f.flash / 0.3) * 0.22 : 1;
    m.scale.setScalar(0.8 * hurtPulse);
    Physics.turnToward(m, aimYaw, dt, 10);
    if (airLift < 0.2 && gh > WATER_Y - 0.1) {
      alignCritterToSlope(m, m.position.x, m.position.z, dt);
    } else {
      m.rotation.x *= 0.85;
      m.rotation.z *= 0.85;
    }
    _critterAnimOpts.idleTime = time + i * 1.7;
    _critterAnimOpts.airborne = airLift > 0.22;
    Models.animateCritter(m, f.gaitPhase, f.smoothSpd, _critterAnimOpts);
  }
}

function buildLookCandidates() {
  _lookCandidates.length = 0;
  let hasCloseGloom = false;
  for (let i = 0; i < glooms.length; i++) {
    const g = glooms[i];
    const gp = g.mesh.position;
    if (Math.hypot(gp.x - P.x, gp.y - P.y, gp.z - P.z) < 14) {
      _lookCandidates.push(g.lookCand);
      hasCloseGloom = true;
    }
  }
  if (hasCloseGloom) return _lookCandidates;

  let hasCloseCritter = false;
  for (let i = 0; i < wild.length; i++) {
    const w = wild[i];
    const wp = w.mesh.position;
    if (Math.hypot(wp.x - P.x, wp.y - P.y, wp.z - P.z) < 8) {
      _lookCandidates.push(w.lookCand);
      hasCloseCritter = true;
    }
  }
  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    const fp = f.mesh.position;
    if (Math.hypot(fp.x - P.x, fp.y - P.y, fp.z - P.z) < 8) {
      _lookCandidates.push(f.lookCand);
      hasCloseCritter = true;
    }
  }
  if (hasCloseCritter) return _lookCandidates;

  _lookCandidates.push(_wishLookCand);
  return _lookCandidates;
}

// ---------- 7. Observatory Monolith Star Totems ----------

let lit = 0;
let totem = null;
let totemHintT = 0;
let totemCooldownT = 0;
// The lit totem's light stays in the scene at zero until the next totem arrives. Removing it
// changes the point-light count, which recompiles every lit shader (a multi-second freeze).
let parkedTotemLight = null;

function spawnTotem() {
  if (totem || lit >= DAY_SKY_MAX_LIT) return;
  let spot = null;
  let routeStep = null;
  if (typeof Regions !== 'undefined' && Regions && Array.isArray(Regions.TOTEM_ROUTE) && Regions.TOTEM_ROUTE[lit]) {
    routeStep = Regions.TOTEM_ROUTE[lit];
    const baseH = heightAt(routeStep.x, routeStep.z);
    // Seat Sunken City Totem squarely atop the Sunken Star-Temple central terrace!
    const y = routeStep.underwater ? baseH + 3.15 : baseH;
    spot = { x: routeStep.x, z: routeStep.z, h: y };
  } else {
    spot = landSpot(P.x, P.z, 35, Math.min(85, 40 + lit * 6), 0.8);
  }
  if (!spot) return;
  const g = Models.makeTotem();
  if (typeof lowEndBoot !== 'undefined' && lowEndBoot) {
    // Low-end boots never carry a totem light (one less light in every lit shader)
    const light = g.children.find((c) => c.isPointLight);
    if (light) g.remove(light);
  }
  g.position.set(spot.x, spot.h, spot.z);
  scene.add(g);
  if (parkedTotemLight) {
    scene.remove(parkedTotemLight);
    parkedTotemLight = null;
  }
  setTotemCollider(spot.x, spot.z, 1.15);
  const u = g.userData || {};
  totem = {
    mesh: g,
    crystal: u.crystal,
    ringA: u.ringA,
    ringB: u.ringB,
    halo: u.halo,
    x: spot.x,
    y: spot.h,
    z: spot.z,
    underwater: !!(routeStep && routeStep.underwater),
    routeStep,
    need: Math.min(5 + lit * 5, stars + 25),
  };
}

function updateTotem(dt, nowTime) {
  if (!totem) {
    if (lit >= DAY_SKY_MAX_LIT) return;
    if (totemCooldownT > 0) {
      totemCooldownT -= dt;
      if (totemCooldownT > 0) return;
    }
    spawnTotem();
    return;
  }
  if (totem.crystal) {
    totem.crystal.rotation.y += dt * 1.1;
    totem.crystal.position.y = 4.38 + Math.sin(nowTime * 2.2) * 0.14;
  }
  if (totem.ringA) {
    totem.ringA.rotation.y += dt * 0.85;
    totem.ringA.rotation.z += dt * 0.35;
  }
  if (totem.ringB) {
    totem.ringB.rotation.y -= dt * 0.65;
    totem.ringB.rotation.x += dt * 0.25;
  }
  if (totem.halo && totem.halo.scale) {
    const hs = 3.0 + Math.sin(nowTime * 3.0) * 0.22;
    totem.halo.scale.set(hs, hs, 1);
  }

  totemHintT -= dt;
  const d = Math.hypot(totem.x - P.x, totem.z - P.z);
  const dy = Math.abs((totem.y !== undefined ? totem.y : P.y) - P.y);
  if (d < 3.0 && (!totem.underwater || dy < 4.5)) {
    if (stars >= totem.need) {
      lightTotem();
    } else if (totemHintT <= 0) {
      totemHintT = 2.5;
      toast(`The totem craves ${totem.need} stars. You carry ${stars}.`, 2200);
    }
  }
}

function lightTotem() {
  if (!totem) return;
  stars = Math.max(0, stars - totem.need);
  const starEl = document.getElementById('starCount');
  if (starEl) starEl.textContent = stars;
  lit++;
  setSkyProgress(lit);
  addConstellation(constellationNameFor(lit));
  const litEl = document.getElementById('litCount');
  if (litEl) litEl.textContent = lit;
  unlockedLand = Math.min(LAND.length, 3 + lit);
  const p = totem.mesh.position;
  if (!totem.underwater) {
    sanctuary.x = p.x;
    sanctuary.y = p.y;
    sanctuary.z = p.z;
  }
  P.hp = P.maxHp;
  renderHeartsUI();
  for (let i = 0; i < followers.length; i++) followers[i].hp = followers[i].maxHp;
  burst(p.x, p.y + 4.4, p.z, 0xffd93b, 24);
  Sound.fanfare();
  if (player && player.userData && player.userData.glbRig && typeof player.userData.glbRig.triggerEmote === 'function') {
    player.userData.glbRig.triggerEmote('smile', 2.8);
  }
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.celebrate === 'function') {
    Animals.celebrate(followers, _animalCtx);
  }
  const done = lit >= DAY_SKY_MAX_LIT;
  const nextStep = (!done && typeof Regions !== 'undefined' && Regions && Regions.TOTEM_ROUTE)
    ? Regions.TOTEM_ROUTE[lit]
    : null;
  toast(
    done
      ? 'The sky blazes with all 8 constellations! Daylight returns to every realm!'
      : nextStep
        ? `${constellationNameFor(lit)} relights! (${lit}/${DAY_SKY_MAX_LIT}) ${nextStep.hint}`
        : `${constellationNameFor(lit)} relights! Look up - the world grows brighter. (${lit} of ${DAY_SKY_MAX_LIT})`
  );
  questEvent('totem');
  clearTotemCollider();
  const totemLight = totem.mesh.children.find((c) => c.isPointLight);
  if (totemLight) {
    totemLight.intensity = 0;
    scene.add(totemLight);
    parkedTotemLight = totemLight;
  }
  scene.remove(totem.mesh);
  totem = null;
  totemCooldownT = done ? 0 : 0.25;
}

// ---------- 7b. Regions, Tidecaller's Pearl Relic, Secret Shrines, Sea Wildlife & Ambient Motes ----------

let currentRegion = (typeof Regions !== 'undefined' && Regions && Regions.regionAt)
  ? Regions.regionAt(P.x, P.z)
  : { id: 'sanctuary', name: 'Star Sanctuary', subtitle: '' };
let regionBannerTimer = null;
let lastRegionBannerAt = -9999;
let secretsFound = 0;
let moteAcc = 0;

const regionPillEl = document.getElementById('regionPill');
const regionBannerEl = document.getElementById('regionBanner');
const regionBannerTitleEl = document.getElementById('regionBannerTitle');
const regionBannerSubEl = document.getElementById('regionBannerSub');
const secretCountEl = document.getElementById('secretCount');
const relicBadgeEl = document.getElementById('relicBadge');

function showRegionBanner(reg) {
  if (!reg) return;
  if (regionPillEl) regionPillEl.textContent = reg.name;
  const now = performance.now();
  if (now - lastRegionBannerAt < 2500) return;
  lastRegionBannerAt = now;
  if (regionBannerTitleEl) regionBannerTitleEl.textContent = reg.name;
  if (regionBannerSubEl) regionBannerSubEl.textContent = reg.subtitle || '';
  if (regionBannerEl && regionBannerEl.classList) {
    regionBannerEl.classList.add('show');
    clearTimeout(regionBannerTimer);
    regionBannerTimer = setTimeout(() => regionBannerEl.classList.remove('show'), 3200);
  }
}

function claimBreathRelic() {
  if (P.hasBreathRelic) return false;
  P.hasBreathRelic = true;
  P.air = AIR_MAX;
  if (relicBadgeEl && relicBadgeEl.style) relicBadgeEl.style.display = 'inline-block';

  const wl = typeof worldLandmarks !== 'undefined' ? worldLandmarks : null;
  const ro = wl && wl.relicObj;
  if (ro && !ro.claimed) {
    ro.claimed = true;
    if (ro.pearlMesh) ro.pearlMesh.visible = false;
    if (ro.pearlRing) ro.pearlRing.visible = false;
    if (ro.pearlHalo) ro.pearlHalo.visible = false;
    if (ro.pearlLight) ro.pearlLight.intensity = 0;
    burst(ro.x, ro.y + 0.6, ro.z, 0x64f6ee, 24, true);
    burst(ro.x, ro.y + 0.6, ro.z, 0xffe476, 16);
  } else {
    burst(P.x, P.y + 1.4, P.z, 0x64f6ee, 20, true);
  }
  Sound.fanfare();
  toast("Claimed Tidecaller's Pearl! Infinite underwater breath & swift diving unlocked!", 3500);
  return true;
}

// Graceful aquatic wildlife patrolling the Sunken Underwater City arches & bay
const aquaticCritters = [];
function initAquaticCritters() {
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.initAquatic === 'function') {
    Animals.initAquatic(aquaticCritters, _animalCtx);
    return;
  }
  if (typeof Regions === 'undefined' || !Regions || !AQUA.length) return;
  const spots = [
    [-14, 70, -4.5, 4.5, 0],
    [-19, 80, -6.2, 5.2, 1],
    [-9,  84, -5.0, 4.8, 2],
    [-14, 92, -6.5, 6.0, 3],
    [-22, 88, -5.8, 5.5, 0],
    [-6,  74, -4.2, 4.2, 1],
  ];
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const sp = AQUA[s[4] % AQUA.length];
    const mesh = Models.makeCritter(sp, 0.95);
    mesh.position.set(s[0], s[2], s[1]);
    scene.add(mesh);
    aquaticCritters.push({
      mesh,
      species: sp,
      cx: s[0],
      cz: s[1],
      cy: s[2],
      rad: s[3],
      ang: i * 1.1,
      spd: 0.42 + (i % 3) * 0.14,
      phase: i * 1.7,
    });
  }
}
initAquaticCritters();

function updateRegionsAndDiscovery(dt, nowTime) {
  const wl = typeof worldLandmarks !== 'undefined' ? worldLandmarks : null;
  if (typeof Regions !== 'undefined' && Regions) {
    if (wl && typeof Regions.animateLandmarks === 'function') {
      Regions.animateLandmarks(wl, dt, nowTime);
    }

    // 1. Region transition detection, atmospheric title banner & seamless on-key regional soundtrack!
    if (typeof Regions.regionAt === 'function') {
      const reg = Regions.regionAt(P.x, P.z);
      if (reg && (!currentRegion || reg.id !== currentRegion.id)) {
        currentRegion = reg;
        showRegionBanner(reg);
        if (typeof Sound !== 'undefined' && typeof Sound.setRegion === 'function') {
          Sound.setRegion(reg.id);
        }
      }
    }

    // 2. Tidecaller's Pearl pickup on Twilight Basalt Coast headland
    if (!P.hasBreathRelic && wl && wl.relicObj && !wl.relicObj.claimed) {
      const ro = wl.relicObj;
      if (Math.hypot(P.x - ro.x, P.z - ro.z) < 2.8 && Math.abs(P.y - ro.y) < 3.2) {
        claimBreathRelic();
      }
    }

    // 3. Six Off-Path Secret Star Shrines discovery
    if (wl && Array.isArray(wl.secretObjs)) {
      for (let i = 0; i < wl.secretObjs.length; i++) {
        const sec = wl.secretObjs[i];
        if (sec.discovered) continue;
        if (Math.hypot(P.x - sec.x, P.z - sec.z) < 3.2 && Math.abs(P.y - sec.y) < 3.5) {
          sec.discovered = true;
          secretsFound++;
          if (secretCountEl) secretCountEl.textContent = secretsFound;
          if (sec.gemMat) sec.gemMat.emissiveIntensity = 1.65;
          if (sec.halo && sec.halo.scale) sec.halo.scale.set(3.4, 3.4, 1);
          stars += 5;
          const starEl = document.getElementById('starCount');
          if (starEl) starEl.textContent = stars;
          P.hp = P.maxHp;
          renderHeartsUI();
          burst(sec.x, sec.y + 1.0, sec.z, sec.def.underwater ? 0x64f6ee : 0xffe476, 22, true);
          Sound.fanfare();
          if (player && player.userData && player.userData.glbRig && typeof player.userData.glbRig.triggerEmote === 'function') {
            player.userData.glbRig.triggerEmote('smile', 2.5);
          }
          if (typeof Animals !== 'undefined' && Animals && typeof Animals.celebrate === 'function') {
            Animals.celebrate(followers, _animalCtx);
          }
          toast(`Secret Shrine Discovered: ${sec.def.name}! (+5 Stars & Full Hearts)`, 3200);
        }
      }
    }
  }

  // 4. Animate Sunken City aquatic wildlife gliding through arches
  if (typeof Animals !== 'undefined' && Animals && typeof Animals.updateAquatic === 'function') {
    Animals.updateAquatic(aquaticCritters, dt, nowTime, _animalCtx);
  } else {
    for (let i = 0; i < aquaticCritters.length; i++) {
      const ac = aquaticCritters[i];
      ac.ang += dt * ac.spd;
      const nx = ac.cx + Math.cos(ac.ang) * ac.rad;
      const nz = ac.cz + Math.sin(ac.ang) * ac.rad;
      const ny = ac.cy + Math.sin(nowTime * 1.4 + ac.phase) * 0.55;
      const dx = nx - ac.mesh.position.x;
      const dz = nz - ac.mesh.position.z;
      ac.mesh.position.set(nx, ny, nz);
      ac.mesh.rotation.y = Math.atan2(dx, dz);
      Models.animateCritter(ac.mesh, nowTime * 4.5 + ac.phase, 3.2);
    }
  }

  // 5. Gentle ambient forest fireflies & sunlit meadow pollen motes (zero GC via bubblePool!)
  moteAcc += dt;
  if (moteAcc >= 0.42 && !P.swimming) {
    moteAcc = 0;
    const inForest = currentRegion && currentRegion.id === 'whisperingForest';
    const skyP = typeof getSkyProgress === 'function' ? getSkyProgress() : 0;
    if (inForest || skyP > 0.35) {
      const mx = P.x + (Math.random() - 0.5) * 18;
      const mz = P.z + (Math.random() - 0.5) * 18;
      const my = heightAt(mx, mz) + 0.9 + Math.random() * 2.8;
      spawnPooled(
        bubblePool,
        mx, my, mz,
        inForest ? 0x9eff8a : 0xfff3b8,
        (Math.random() - 0.5) * 0.45,
        0.22 + Math.random() * 0.25,
        (Math.random() - 0.5) * 0.45,
        2.4,
        0.04,
        inForest ? 0.62 : 0.42
      );
    }
  }
}

// ---------- 8. Quests, HUD, Controls & Game Loop ----------

const quests = {
  stars:    n => ({ type: 'stars', n, count: 0, text: `The stars fell and the sky went dark! Gather ${n} fallen stars.` }),
  rescue:   n => ({ type: 'rescue', n, count: 0, text: `Starlings are trapped in gloom-cocoons! Bop them open (F or click shoots).` }),
  befriend: n => ({ type: 'befriend', n, count: 0, text: `Shy critters trust you if you chase them gently. Befriend ${n}!` }),
  bop:      n => ({ type: 'bop', n, count: 0, text: `Gloomblobs hoard starlight! Give ${n} of them a bop.` }),
  totem:    n => ({ type: 'totem', n, count: 0, text: `Carry your starlight to the Star Totem - follow the golden beam!` }),
};
let questStage = 0;
let quest = null;

function makeQuest() {
  const pattern = lit >= DAY_SKY_MAX_LIT
    ? ['stars', 'rescue', 'befriend', 'bop']
    : ['stars', 'rescue', 'befriend', 'bop', 'totem'];
  const kind = pattern[questStage % pattern.length];
  const cycle = Math.floor(questStage / pattern.length);
  let q;
  if (kind === 'stars') q = quests.stars(8 + cycle * 4);
  if (kind === 'rescue') q = quests.rescue(2 + cycle * 2);
  if (kind === 'befriend') q = quests.befriend(2 + cycle * 2);
  if (kind === 'bop') q = quests.bop(3 + cycle * 2);
  if (kind === 'totem') q = quests.totem(1);
  quest = q;
  updateQuestUI();
}

function questEvent(type) {
  if (!quest || quest.type !== type) return;
  quest.count++;
  if (quest.count >= quest.n) {
    if (quest.type === 'totem') toast('Wish: "The sky remembers you! More starlight waits out there..."');
    else toast('Wish: "Yes! On to the next thing!"');
    questStage++;
    makeQuest();
  } else {
    updateQuestUI();
  }
}

function updateQuestUI() {
  const el = document.getElementById('questText');
  if (el && quest) el.textContent = `Wish: "${quest.text}" (${quest.count}/${quest.n})`;
}

let toastTimer = null;
let lastToastAt = 0;
let lastToastText = '';
function toast(text, minGap = 600) {
  const now = performance.now();
  if (text === lastToastText && now - lastToastAt < Math.max(4000, minGap)) return;
  lastToastAt = now;
  lastToastText = text;
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const airWrapEl = document.getElementById('airWrap');
const airFillEl = document.getElementById('airFill');
function updateAirUI() {
  if (airWrapEl) airWrapEl.style.display = P.swimming && !P.hasBreathRelic ? 'block' : 'none';
  if (airFillEl) airFillEl.style.width = (P.air / AIR_MAX * 100) + '%';
}

const lockReticleEl = document.getElementById('lockReticle');
const touchLockEl = document.getElementById('touchLock');
function updateLockHUD() {
  const locked = !!Physics.lockTarget;
  if (document.body && document.body.classList) {
    document.body.classList.toggle('z-active', locked);
  }
  if (touchLockEl && touchLockEl.classList) {
    touchLockEl.classList.toggle('active', locked);
  }
  if (!lockReticleEl) return;
  if (camera && camera.updateMatrixWorld) camera.updateMatrixWorld();
  const proj = Physics.projectLockReticle(camera, innerWidth, innerHeight);
  if (proj && proj.visible) {
    lockReticleEl.style.opacity = '1';
    lockReticleEl.style.visibility = 'visible';
    lockReticleEl.style.transform =
      `translate3d(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px, 0) scale(${proj.scale.toFixed(3)})`;
  } else {
    lockReticleEl.style.opacity = '0';
    lockReticleEl.style.visibility = 'hidden';
  }
}

const soundBtn = document.getElementById('soundBtn');
if (soundBtn) {
  soundBtn.addEventListener('click', e => {
    const muted = Sound.toggle();
    e.target.textContent = muted ? 'Sound: Off' : 'Sound: On';
  });
}

const QUALITY_ORDER = ['high', 'balanced', 'fast'];
const QUALITY_LABELS = { high: 'Quality: High', balanced: 'Quality: Balanced', fast: 'Quality: Fast' };
function qualityLabelFor(mode) {
  return QUALITY_LABELS[mode] || QUALITY_LABELS.high;
}

const qualityBtn = document.getElementById('qualityBtn');
if (qualityBtn) {
  qualityBtn.textContent = qualityLabelFor(getQuality());
  qualityBtn.addEventListener('click', e => {
    const cur = getQuality();
    const idx = QUALITY_ORDER.indexOf(cur);
    const next = QUALITY_ORDER[(idx + 1) % QUALITY_ORDER.length] || 'high';
    const applied = setQuality(next);
    e.target.textContent = qualityLabelFor(applied);
  });
}

const controlsBtn = document.getElementById('controlsBtn');
const controlsPanel = document.getElementById('controlsPanel');
const closeControlsBtn = document.getElementById('closeControlsBtn');
function setControlsOpen(open) {
  if (!controlsPanel) return;
  controlsPanel.classList.toggle('open', open);
  if (typeof controlsPanel.setAttribute === 'function') {
    controlsPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
}
if (controlsBtn && controlsPanel) {
  controlsBtn.addEventListener('click', () => {
    setControlsOpen(!controlsPanel.classList.contains('open'));
  });
}
if (closeControlsBtn && controlsPanel) {
  closeControlsBtn.addEventListener('click', () => setControlsOpen(false));
}
if (typeof addEventListener === 'function' && controlsPanel) {
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyH' || e.key === '?') {
      setControlsOpen(!controlsPanel.classList.contains('open'));
    } else if (e.code === 'Escape' && controlsPanel.classList.contains('open')) {
      setControlsOpen(false);
    }
  });
}

// ---------- Responsive Mobile Touch Controls ----------
const touchToggleBtn = document.getElementById('touchToggleBtn');
function setTouchUIEnabled(enabled) {
  const on = !!enabled;
  if (document.body && document.body.classList) {
    document.body.classList.toggle('touch-ui', on);
  }
  if (touchToggleBtn) {
    touchToggleBtn.textContent = on ? 'Touch Controls: On' : 'Touch Controls: Off';
  }
  if (!on && typeof Physics.setTouchMove === 'function') {
    Physics.setTouchMove(0, 0, false);
    if (typeof Physics.setTouchJump === 'function') Physics.setTouchJump(false);
  }
}

const initialCoarseTouch =
  (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth <= 1180);
setTouchUIEnabled(initialCoarseTouch);

if (touchToggleBtn) {
  touchToggleBtn.addEventListener('click', () => {
    const cur = !!(document.body && document.body.classList && document.body.classList.contains('touch-ui'));
    setTouchUIEnabled(!cur);
  });
}

const winTarget = (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  ? window
  : (typeof addEventListener === 'function' ? globalThis : null);

const preventDefaultEvent = e => {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
};

// iOS Safari pinch-zoom & gesture guards
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('gesturestart', preventDefaultEvent, { passive: false });
  document.addEventListener('gesturechange', preventDefaultEvent, { passive: false });
}
if (winTarget && typeof winTarget.addEventListener === 'function') {
  winTarget.addEventListener('gesturestart', preventDefaultEvent, { passive: false });
  winTarget.addEventListener('gesturechange', preventDefaultEvent, { passive: false });
  const enableOnFirstTouch = () => {
    setTouchUIEnabled(true);
    if (typeof winTarget.removeEventListener === 'function') {
      winTarget.removeEventListener('touchstart', enableOnFirstTouch);
    }
  };
  winTarget.addEventListener('touchstart', enableOnFirstTouch, { passive: true });
}

const touchControlsEl = document.getElementById('touchControls');
if (touchControlsEl && typeof touchControlsEl.addEventListener === 'function') {
  touchControlsEl.addEventListener('dblclick', e => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  });
}

function findTouchById(list, id) {
  if (!list || id === null) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

/**
 * Evaluate console-grade virtual joystick deflection with deadzone, crisp full-run plateau,
 * visual knob clamping, and sprint-ring hysteresis. Reuses `out` for zero GC.
 */
function evalTouchJoy(dx, dy, maxR, wasSprinting, out = _joyOut) {
  const r = Math.max(1, maxR || 44);
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, r);
  const inv = dist > 0.001 ? clamped / dist : 0;
  out.ox = dx * inv;
  out.oy = dy * inv;
  const rawMag = dist / r;
  out.rawMag = rawMag;

  let outMag = 0;
  let sprinting = false;
  if (rawMag < 0.12) {
    outMag = 0;
    sprinting = false;
  } else if (rawMag < 0.34) {
    outMag = 0.38 + ((rawMag - 0.12) / 0.22) * 0.30;
    sprinting = false;
  } else if (rawMag < 0.86) {
    outMag = 0.68 + Math.min(1, (rawMag - 0.34) / 0.22) * 0.32;
    sprinting = wasSprinting ? rawMag >= 0.75 : false;
  } else {
    outMag = 1.0;
    sprinting = wasSprinting ? rawMag >= 0.75 : rawMag >= 0.88;
  }

  if (outMag > 0 && dist > 0.001) {
    out.nx = (dx / dist) * outMag;
    out.ny = (dy / dist) * outMag;
  } else {
    out.nx = 0;
    out.ny = 0;
  }
  out.outMag = outMag;
  out.sprinting = sprinting;
  return out;
}

const touchJoyBase = document.getElementById('touchJoyBase');
const touchJoyKnob = document.getElementById('touchJoyKnob');
if (touchJoyBase && touchJoyKnob && typeof touchJoyBase.addEventListener === 'function') {
  let joyTouchId = null;
  let joyPid = null;
  let joyCx = 0;
  let joyCy = 0;
  let joyMaxR = 50;
  let joySprinting = false;
  let lastJoyTouchEv = null;
  let lastJoyPtrEv = null;

  const updateJoyFromPoint = (clientX, clientY) => {
    const res = evalTouchJoy(clientX - joyCx, clientY - joyCy, joyMaxR, joySprinting, _joyOut);
    joySprinting = res.sprinting;
    touchJoyKnob.style.transform = `translate3d(${res.ox.toFixed(1)}px, ${res.oy.toFixed(1)}px, 0)`;
    if (touchJoyBase.classList) touchJoyBase.classList.toggle('sprinting', joySprinting);
    if (typeof Physics.setTouchMove === 'function') {
      Physics.setTouchMove(res.nx, res.ny, joySprinting);
    }
  };

  const resetJoy = () => {
    joyTouchId = null;
    joyPid = null;
    joySprinting = false;
    touchJoyKnob.style.transform = 'translate3d(0px, 0px, 0)';
    if (touchJoyBase.classList) {
      touchJoyBase.classList.remove('active');
      touchJoyBase.classList.remove('sprinting');
    }
    if (typeof Physics.setTouchMove === 'function') Physics.setTouchMove(0, 0, false);
  };

  const measureJoyRect = () => {
    const rect = typeof touchJoyBase.getBoundingClientRect === 'function'
      ? touchJoyBase.getBoundingClientRect()
      : { left: 0, top: 0, width: 120, height: 120 };
    const rectW = rect && rect.width > 0 ? rect.width : 120;
    const rectH = rect && rect.height > 0 ? rect.height : rectW;
    joyCx = (rect ? rect.left : 0) + rectW * 0.5;
    joyCy = (rect ? rect.top : 0) + rectH * 0.5;
    joyMaxR = Math.max(36, rectW * 0.42);
  };

  const onJoyTouchMove = e => {
    if (!e || e === lastJoyTouchEv) return;
    if (joyTouchId === null) return;
    const t = findTouchById(e.touches, joyTouchId) || findTouchById(e.changedTouches, joyTouchId);
    if (!t) return;
    lastJoyTouchEv = e;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    updateJoyFromPoint(t.clientX, t.clientY);
  };

  const onJoyTouchEnd = e => {
    if (e && e === lastJoyTouchEv) return;
    if (joyTouchId === null) return;
    if (e && e.changedTouches) {
      if (!findTouchById(e.changedTouches, joyTouchId)) return;
    } else if (e && e.touches && findTouchById(e.touches, joyTouchId)) {
      return;
    }
    lastJoyTouchEv = e || null;
    resetJoy();
  };

  touchJoyBase.addEventListener('touchstart', e => {
    if (!started) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (joyTouchId !== null && (!e.touches || findTouchById(e.touches, joyTouchId))) return;
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return;
    measureJoyRect();
    joyTouchId = t.identifier;
    joyPid = null;
    if (touchJoyBase.classList) touchJoyBase.classList.add('active');
    updateJoyFromPoint(t.clientX, t.clientY);
  }, { passive: false });
  touchJoyBase.addEventListener('touchmove', onJoyTouchMove, { passive: false });
  touchJoyBase.addEventListener('touchend', onJoyTouchEnd, { passive: false });
  touchJoyBase.addEventListener('touchcancel', onJoyTouchEnd, { passive: false });
  touchJoyBase.addEventListener('dblclick', e => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  });

  if (winTarget && typeof winTarget.addEventListener === 'function') {
    winTarget.addEventListener('touchmove', onJoyTouchMove, { passive: false });
    winTarget.addEventListener('touchend', onJoyTouchEnd, { passive: false });
    winTarget.addEventListener('touchcancel', onJoyTouchEnd, { passive: false });
  }

  // Non-touch pointer fallback for desktop mouse/pen testing (never conflicts with touch*)
  const onJoyPointerMove = e => {
    if (!e || e === lastJoyPtrEv || e.pointerType === 'touch') return;
    if (joyPid === null) return;
    if (e.pointerId !== undefined && e.pointerId !== joyPid) return;
    lastJoyPtrEv = e;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    updateJoyFromPoint(e.clientX, e.clientY);
  };

  const onJoyPointerUp = e => {
    if (e && (e === lastJoyPtrEv || e.pointerType === 'touch')) return;
    if (joyPid === null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== joyPid) return;
    lastJoyPtrEv = e || null;
    resetJoy();
  };

  touchJoyBase.addEventListener('pointerdown', e => {
    if (!started || e.pointerType === 'touch') return;
    if (joyTouchId !== null) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    measureJoyRect();
    joyPid = e.pointerId !== undefined ? e.pointerId : 0;
    if (touchJoyBase.classList) touchJoyBase.classList.add('active');
    updateJoyFromPoint(e.clientX, e.clientY);
  });
  touchJoyBase.addEventListener('pointermove', onJoyPointerMove);
  touchJoyBase.addEventListener('pointerup', onJoyPointerUp);
  touchJoyBase.addEventListener('pointercancel', onJoyPointerUp);
  touchJoyBase.addEventListener('lostpointercapture', e => {
    if (joyPid !== null) onJoyPointerUp(e);
  });
  if (winTarget && typeof winTarget.addEventListener === 'function') {
    winTarget.addEventListener('pointermove', onJoyPointerMove);
    winTarget.addEventListener('pointerup', onJoyPointerUp);
    winTarget.addEventListener('pointercancel', onJoyPointerUp);
    winTarget.addEventListener('blur', resetJoy);
  }
}

function bindTouchBtn(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el || typeof el.addEventListener !== 'function') return;
  let activeTouchId = null;
  let activePid = null;

  const releaseTouch = (e, shouldPrevent) => {
    if (activeTouchId === null) return;
    if (e && e.changedTouches) {
      if (!findTouchById(e.changedTouches, activeTouchId)) return;
    } else if (e && e.touches && findTouchById(e.touches, activeTouchId)) {
      return;
    }
    if (shouldPrevent && e && e.cancelable !== false && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    activeTouchId = null;
    if (el.classList) el.classList.remove('pressed');
    if (typeof onUp === 'function') onUp();
  };

  const releasePointer = e => {
    if (e && e.pointerType === 'touch') return;
    if (activePid === null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== activePid) return;
    activePid = null;
    if (el.classList) el.classList.remove('pressed');
    if (typeof onUp === 'function') onUp();
  };

  el.addEventListener('touchstart', e => {
    if (!started) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (activeTouchId !== null && (!e.touches || findTouchById(e.touches, activeTouchId))) return;
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return;
    activeTouchId = t.identifier;
    activePid = null;
    if (el.classList) el.classList.add('pressed');
    if (typeof onDown === 'function') onDown();
  }, { passive: false });
  el.addEventListener('touchend', e => releaseTouch(e, true), { passive: false });
  el.addEventListener('touchcancel', e => releaseTouch(e, false), { passive: false });
  el.addEventListener('dblclick', e => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  });

  if (winTarget && typeof winTarget.addEventListener === 'function') {
    winTarget.addEventListener('touchend', e => releaseTouch(e, false), { passive: false });
    winTarget.addEventListener('touchcancel', e => releaseTouch(e, false), { passive: false });
  }

  // Non-touch pointer fallback for desktop mouse/pen testing
  el.addEventListener('pointerdown', e => {
    if (!started || e.pointerType === 'touch') return;
    if (activeTouchId !== null) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    activePid = e.pointerId !== undefined ? e.pointerId : 0;
    if (el.classList) el.classList.add('pressed');
    if (typeof onDown === 'function') onDown();
  });
  el.addEventListener('pointerup', releasePointer);
  el.addEventListener('pointercancel', releasePointer);
  el.addEventListener('lostpointercapture', releasePointer);
  if (winTarget && typeof winTarget.addEventListener === 'function') {
    winTarget.addEventListener('pointerup', releasePointer);
    winTarget.addEventListener('pointercancel', releasePointer);
  }
}

bindTouchBtn('touchStrike', () => { if (!P.dead) meleeAttack(); });
bindTouchBtn('touchStar', () => { if (!P.dead) shoot(); });
bindTouchBtn(
  'touchJump',
  () => { if (!P.dead && typeof Physics.setTouchJump === 'function') Physics.setTouchJump(true); },
  () => { if (typeof Physics.setTouchJump === 'function') Physics.setTouchJump(false); }
);
bindTouchBtn('touchRoll', () => { if (!P.dead) Physics.startRoll(true); });
bindTouchBtn('touchLock', () => { if (!P.dead) Physics.toggleLockOn(); });

// Made on the first V press, not at boot: three.js draws object ids from Math.random, so creating it
// at boot would shift the world's random spawns.
let firstPersonLightStandIn = null;

Physics.init(renderer.domElement, {
  isStarted: () => started,
  onShoot: shoot,
  onMelee: meleeAttack,
  onPlungeImpact: handlePlungeImpact,
  onPlungeTrail: (x, y, z) => burst(x, y, z, 0xffe476, 2, true),
  onFallDamage: (dmg) => damagePlayer(dmg, 'fall'),
  onDrownDamage: (dmg) => damagePlayer(dmg, 'drown'),
  onToast: toast,
  onDust: dustBurst,
  onSplash: splashBurst,
  onFootprint: stampFootprint,
  getLockCandidates,
  onPlayerVisible: (v) => {
    player.visible = v;
    // Hiding the player also hides its lantern light. A zero-intensity stand-in keeps the
    // point-light count constant, or every lit shader recompiles (~3 s freeze on the first V).
    if (!firstPersonLightStandIn) {
      if (v || !(player.userData && player.userData.staffLight) || typeof THREE.PointLight !== 'function') return;
      firstPersonLightStandIn = new THREE.PointLight(0xffcf64, 0, 16);
    }
    if (v) scene.remove(firstPersonLightStandIn);
    else scene.add(firstPersonLightStandIn);
  },
});

renderHeartsUI();

let lastTime = performance.now();
let time = 0;

// FPS watchdog: any device that drops under ~16 FPS for 3 straight seconds steps
// one quality tier down (High -> Balanced -> Fast) so Chromebooks self-heal.
const perfWatchdog = {
  enabled: true,
  fpsThreshold: 16,
  lowSecondsForStep: 3,
  windowSec: 0,
  frames: 0,
  lowStreak: 0,
  cooldown: 0,
  lastFps: 60,
  stepdowns: 0,
  reset() {
    this.windowSec = 0;
    this.frames = 0;
    this.lowStreak = 0;
    this.cooldown = 0;
    this.lastFps = 60;
  },
  tick(dt) {
    if (!this.enabled) return null;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.windowSec += dt;
    this.frames++;
    if (this.windowSec < 1) return null;
    this.lastFps = this.frames / this.windowSec;
    this.frames = 0;
    this.windowSec = 0;
    if (this.lastFps >= this.fpsThreshold) {
      this.lowStreak = 0;
      return null;
    }
    this.lowStreak++;
    if (this.lowStreak < this.lowSecondsForStep || this.cooldown > 0) return null;
    const stepped = stepQualityDown();
    this.lowStreak = 0;
    this.cooldown = 10;
    if (stepped) this.stepdowns++;
    return stepped;
  },
};

function stepQualityDown() {
  const cur = getQuality();
  if (cur === 'fast') return null;
  const applied = setQuality(cur === 'high' ? 'balanced' : 'fast');
  if (qualityBtn) qualityBtn.textContent = qualityLabelFor(applied);
  toast(`Dropping to ${QUALITY_LABELS[applied] || applied} to keep the game smooth`, 3000);
  return applied;
}

function loop(now) {
  requestAnimationFrame(loop);
  const frameSec = (now - lastTime) / 1000;
  const dt = Math.min(frameSec, 0.05);
  lastTime = now;
  // Uncapped time: dt tops out at 0.05s (20 FPS), above the watchdog's threshold
  if (started) perfWatchdog.tick(frameSec);
  if (!started) {
    updateChunks(P.x, P.z);
    updateChunkCulling(camera);
    return;
  }
  time += dt;

  if (hitStopT > 0) {
    hitStopT = Math.max(0, hitStopT - dt);
    updateCombatVfx(dt);
    updateChunkCulling(camera);
    renderer.render(scene, camera);
    return;
  }

  if (P.dead) {
    respawnT -= dt;
    if (respawnT <= 0) respawnPlayer();
  }

  Physics.updatePlayer(dt, time, player, buildLookCandidates());
  updateAirUI();
  updateWish(dt);
  updatePickups(dt, time);
  updateGlooms(dt, time);
  updateCocoons(dt, time);
  updateBolts(dt, time);
  updateWild(dt);
  updateFollowers(dt);
  updateGrassTramplers();
  updateTotem(dt, time);
  updateRegionsAndDiscovery(dt, time);
  updateParticles(dt);
  updateFootprints(dt, time);
  updateCombatVfx(dt);
  updateLockHUD();
  updateChunks(P.x, P.z);
  const fallbackReg = (!currentRegion || !currentRegion.id) && typeof Regions !== 'undefined' && Regions && typeof Regions.regionAt === 'function'
    ? Regions.regionAt(P.x, P.z)
    : null;
  const activeRegionId = currentRegion && currentRegion.id
    ? currentRegion.id
    : (fallbackReg && fallbackReg.id ? fallbackReg.id : '');
  updateEnvironment(camera.position.y, P.x, P.z, time, dt, activeRegionId);
  updateChunkCulling(camera);
  if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.setClothMotion === 'function') {
    const envWindGust = (typeof Env !== 'undefined' && Env && typeof Env.getWindGust === 'function')
      ? Env.getWindGust()
      : null;
    if (typeof envWindGust === 'number') {
      const uCloth = Shaders.uniforms && Shaders.uniforms.uClothMotion && Shaders.uniforms.uClothMotion.value;
      if (uCloth) {
        Shaders.setClothMotion(uCloth.x, uCloth.y, uCloth.z, envWindGust);
      } else {
        const spd = Math.hypot(P.vx, P.vz);
        const speedNorm = P.meleeStep === 7 && P.meleeT > 0 ? 1.55 : Math.min(1.6, Math.max(0, spd / 7.5));
        const vertNorm = !P.onGround && !P.swimming ? Math.min(1.5, Math.max(-1.5, P.vy / 8.0)) : 0;
        Shaders.setClothMotion(speedNorm, vertNorm, P.capeSway || 0, envWindGust);
      }
    }
  }
  // Warm golden Star-Lantern illuminates the dark night around Starkeeper, softening as daylight returns
  if (player.userData && player.userData.staffLight) {
    const cel = (typeof Env !== 'undefined' && Env && typeof Env.getCelestialState === 'function')
      ? Env.getCelestialState()
      : null;
    const lanternScale = (cel && typeof cel.nightFactor === 'number')
      ? (0.15 + 0.85 * cel.nightFactor)
      : (1 - (typeof getSkyProgress === 'function' ? getSkyProgress() : Math.min(1, lit / DAY_SKY_MAX_LIT)) * 0.85);
    player.userData.staffLight.intensity = Math.max(0.18, 1.55 * lanternScale + Math.sin(time * 3.4) * 0.08);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

const playBtn = document.getElementById('playBtn');
if (playBtn) {
  playBtn.addEventListener('click', () => {
    beginGame();
  });
}

function beginGame() {
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.style.display = 'none';
  if (document.body && document.body.classList && typeof document.body.classList.toggle === 'function') {
    document.body.classList.toggle('game-started', true);
  }
  if (typeof Sound !== 'undefined' && typeof Sound.setRegion === 'function' && currentRegion) {
    Sound.setRegion(currentRegion.id);
  }
  Sound.start();
  renderHeartsUI();
  makeQuest();
  spawnTotem();
  addConstellation('The Lantern');
  started = true;
  toast('The sky went dark. You are the Starkeeper.', 0);
}

const debugHandle = {
  P,
  Physics,
  Models,
  CharacterRig: typeof CharacterRig !== 'undefined' ? CharacterRig : null,
  Animals: typeof Animals !== 'undefined' ? Animals : null,
  Enemies: typeof Enemies !== 'undefined' ? Enemies : null,
  initUnderwaterEnemies: () => {
    if (!underwaterEnemiesInit && typeof Enemies !== 'undefined' && Enemies && typeof Enemies.initUnderwaterEnemies === 'function') {
      underwaterEnemiesInit = true;
      Enemies.initUnderwaterEnemies(glooms, _enemyCtx);
    }
  },
  Shaders,
  Textures,
  Env: typeof Env !== 'undefined' ? Env : null,
  Sound: typeof Sound !== 'undefined' ? Sound : null,
  Regions: typeof Regions !== 'undefined' ? Regions : null,
  LAND,
  AQUA,
  WATER_Y,
  scene,
  camera,
  renderer,
  player,
  wish,
  glooms,
  cocoons,
  bolts,
  pickups,
  wild,
  followers,
  getTotem: () => totem,
  heightAt,
  terrainNormalAt,
  getNearbyColliders,
  setQuality,
  getQuality,
  getViewRadius,
  isChunkCulled,
  updateChunkCulling,
  perfWatchdog,
  stepQualityDown,
  setSkyProgress,
  lightTotem,
  shoot,
  meleeAttack,
  damagePlayer,
  healPlayer,
  damageCompanion,
  respawnPlayer,
  offscreenLandSpot,
  evalTouchJoy,
  spawnGloom,
  spawnCocoon,
  spawnWild,
  addFollower,
  burst,
  dustBurst,
  splashBurst,
  stampFootprint,
  footprintPool,
  staffTrail,
  updateCombatVfx,
  updateGrassTramplers,
  claimBreathRelic,
  getSecretsFound: () => secretsFound,
  getCurrentRegion: () => currentRegion,
  aquaticCritters,
  worldLandmarks: typeof worldLandmarks !== 'undefined' ? worldLandmarks : null,
};
if (typeof window !== 'undefined') window.__GAME_DEBUG__ = debugHandle;
if (typeof globalThis !== 'undefined') globalThis.__GAME_DEBUG__ = debugHandle;

if (location.hash === '#test') {
  for (let i = 0; i < 60; i++) updateChunks(P.x, P.z);
  beginGame();
}
