import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockThree(opts = {}) {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Object3D {
    constructor() {
      this.children = [];
      this.parent = null;
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ' };
      this.scale = new Vector3(1, 1, 1);
      this.userData = {};
      this.visible = true;
      this.castShadow = false;
      this.receiveShadow = false;
      this.frustumCulled = true;
    }
    add(...items) {
      for (const c of items) {
        if (!c) continue;
        c.parent = this;
        this.children.push(c);
      }
      return this;
    }
    traverse(fn) {
      fn(this);
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].traverse(fn);
      }
    }
  }
  class Color {
    constructor(hex = 0xffffff) { this.hex = hex; }
    convertSRGBToLinear() { return this; }
  }
  class Geo {
    constructor(kind) { this.kind = kind; this.attributes = {}; }
    translate() { return this; }
    rotateX() { return this; }
    rotateY() { return this; }
    rotateZ() { return this; }
    scale() { return this; }
    computeVertexNormals() { return this; }
  }
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array ? Math.floor(array.length / itemSize) : 0;
    }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
    setXYZ(i, x, y, z) {
      const o = i * this.itemSize;
      this.array[o] = x;
      this.array[o + 1] = y;
      this.array[o + 2] = z;
    }
  }
  class BufferGeometry extends Geo {
    constructor() {
      super('buffer');
      this.index = null;
    }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setIndex(idx) {
      this.index = idx instanceof BufferAttribute ? idx : new BufferAttribute(idx, 1);
      return this;
    }
  }
  class Mat {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.color = new Color(opts.color ?? 0xffffff);
      this.emissive = new Color(opts.emissive ?? 0x000000);
    }
  }
  class Mesh extends Object3D {
    constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; }
  }
  class PointLight extends Object3D {
    constructor(c, i, d) { super(); this.color = c; this.intensity = i; this.distance = d; }
  }
  class Sprite extends Object3D {
    constructor(m) { super(); this.material = m; }
  }
  const api = {
    Vector3,
    Object3D,
    Group: Object3D,
    Scene: Object3D,
    Mesh,
    PointLight,
    Sprite,
    Color,
    DoubleSide: 2,
    AdditiveBlending: 2,
    MeshStandardMaterial: Mat,
    MeshBasicMaterial: Mat,
    SpriteMaterial: Mat,
    BoxGeometry: class extends Geo { constructor() { super('box'); } },
    CylinderGeometry: class extends Geo { constructor() { super('cyl'); } },
    ConeGeometry: class extends Geo { constructor() { super('cone'); } },
    SphereGeometry: class extends Geo { constructor() { super('sphere'); } },
    TorusGeometry: class extends Geo { constructor() { super('torus'); } },
    OctahedronGeometry: class extends Geo { constructor() { super('octa'); } },
    DodecahedronGeometry: class extends Geo { constructor() { super('dodeca'); } },
    PlaneGeometry: class extends Geo { constructor(w = 1, h = 1) { super('plane'); this.w = w; this.h = h; } },
  };
  if (opts.withBufferGeo) {
    api.BufferGeometry = BufferGeometry;
    api.BufferAttribute = BufferAttribute;
  }
  return api;
}

function loadRegions(withThree = false, extraOpts = {}) {
  const code = fs.readFileSync(new URL('../regions.js', import.meta.url), 'utf8');
  const THREE = withThree ? makeMockThree({ withBufferGeo: !!extraOpts.withBufferGeo }) : undefined;
  const causticPatches = [];
  const treeWindPatches = [];
  const foliagePatches = [];
  const nodeSwaps = [];

  const mockShaders = withThree
    ? (extraOpts.fullShaders
      ? {
          createGlowSprite: () => new THREE.Sprite(new THREE.SpriteMaterial()),
          patchUnderwaterCaustics: (mat, opts) => { causticPatches.push({ mat, opts }); return mat; },
          patchTreeWind: (mat, isFoliage) => { treeWindPatches.push({ mat, isFoliage }); return mat; },
          patchFoliageReactive: (mat, opts) => { foliagePatches.push({ mat, opts }); return mat; },
        }
      : { createGlowSprite: () => new THREE.Sprite(new THREE.SpriteMaterial()) })
    : undefined;

  const mockEnv = extraOpts.withEnv
    ? {
        registerNodeSwap(arg1, arg2, arg3, arg4) {
          let key, holder, fallbackNode, opts;
          if (typeof arg1 === 'string') {
            key = arg1; holder = arg2; opts = arg3 || {}; fallbackNode = opts.fallback || null;
          } else {
            holder = arg1; key = arg2; fallbackNode = arg3 || null; opts = arg4 || {};
          }
          nodeSwaps.push({ key, holder, fallbackNode, opts });
          return { key, holder, opts };
        },
      }
    : undefined;

  const mockTextures = extraOpts.textures || (withThree ? { sets: {} } : undefined);

  const sandbox = {
    Math,
    Number,
    Array,
    Object,
    Float32Array,
    Uint16Array,
    console,
    WATER_Y: 0,
    ...(THREE ? { THREE } : {}),
    ...(mockShaders ? { Shaders: mockShaders } : {}),
    ...(mockEnv ? { Env: mockEnv } : {}),
    ...(mockTextures ? { Textures: mockTextures } : {}),
  };
  vm.runInNewContext(code + '\nthis.__Regions = Regions;', sandbox);
  return {
    Regions: sandbox.__Regions,
    THREE,
    Textures: mockTextures,
    causticPatches,
    treeWindPatches,
    foliagePatches,
    nodeSwaps,
  };
}

test('Regions defines 7 named anchored regions, 8 guided totems, Tidecaller Pearl, and 6 secret shrines', () => {
  const { Regions: R } = loadRegions(false);
  assert.equal(R.LIST.length, 7, 'Must define Star Sanctuary + 6 distinct regions');
  assert.equal(R.TOTEM_ROUTE.length, 8, 'Guided totem route must cover all 8 constellations');
  assert.equal(R.SECRETS.length, 6, 'Must define 6 off-path Secret Star Shrines');
  assert.ok(R.RELIC_SITE && typeof R.RELIC_SITE.x === 'number' && typeof R.RELIC_SITE.z === 'number');

  // Totem 5 leads into the Sunken Underwater City
  assert.equal(R.TOTEM_ROUTE[4].regionId, 'sunkenCity');
  assert.equal(R.TOTEM_ROUTE[4].underwater, true);
  // Final Totem 8 crowns Frostpeak Summit
  assert.equal(R.TOTEM_ROUTE[7].regionId, 'frostpeak');

  // regionAt identifies each region cleanly at its center and falls back to Wilds far offshore
  for (const reg of R.LIST) {
    const found = R.regionAt(reg.x, reg.z);
    assert.equal(found.id, reg.id, `Expected ${reg.id} at (${reg.x}, ${reg.z}), got ${found.id}`);
  }
  assert.equal(R.regionAt(400, 400).id, 'wilds', 'Far offshore coordinates should return outer wilds');
});

test('Regions elevation, climate, and dirt-trail math shape dramatic landmarks with walkable paths', () => {
  const { Regions: R } = loadRegions(false);
  const h = (x, z) => R.getElevationMod(x, z, 2.0);

  // 1. Star Sanctuary flat hilltop plateau ~6.2u
  const hSanc = h(0, 0);
  assert.ok(hSanc >= 5.5 && hSanc <= 7.0, `Sanctuary height should be ~6.2, got ${hSanc}`);
  assert.ok(Math.abs(h(4, 0) - hSanc) < 0.35, 'Sanctuary stone plaza should be level');

  // 2. Twilight Basalt Coast headland rises steeply above sea while sandy cove slopes gently to water
  const hHeadland = h(R.RELIC_SITE.x, R.RELIC_SITE.z);
  const hCove = h(40, 58);
  assert.ok(hHeadland >= 8.0, `Tidecaller headland should tower over bay, got ${hHeadland}`);
  assert.ok(hCove >= 0.1 && hCove <= 2.6, `Coastal cove beach should meet water gently, got ${hCove}`);

  // 3. Sunken Underwater City bay sits deeply submerged (-9.5u..-13.5u)
  const hCity = h(-14, 90);
  const hTemple = h(-14, 94);
  assert.ok(hCity <= -9.5 && hCity >= -14.0, `Sunken City floor must be deeply underwater, got ${hCity}`);
  assert.ok(hTemple <= -9.5 && hTemple >= -14.0, `Sunken Star-Temple floor must be deeply underwater, got ${hTemple}`);

  // 4. Canyon Oasis has emerald water spring flanked by high stratified mesa walls
  const hPool = h(-76, -14);
  const hMesa = h(-86, -34);
  assert.ok(hPool < -0.8, `Canyon Oasis spring pool must be below WATER_Y, got ${hPool}`);
  assert.ok(hMesa > 9.0, `Canyon mesa walls must tower above canyon floor, got ${hMesa}`);

  // 5. Frostpeak rises majestically (>16u) with walkable switchback trail (< 36 deg = slope < 0.72)
  const hPeak = h(-68, -88);
  assert.ok(hPeak > 16.0, `Frostpeak summit should rise >16u, got ${hPeak}`);
  for (let i = 0; i < 20; i++) {
    const t0 = i / 20;
    const t1 = (i + 1) / 20;
    const x0 = -68 * t0, z0 = -88 * t0;
    const x1 = -68 * t1, z1 = -88 * t1;
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const slope = Math.abs(h(x1, z1) - h(x0, z0)) / dist;
    assert.ok(slope < 0.72, `Frostpeak ascent trail slope too steep (${slope.toFixed(2)}) at step ${i}`);
  }

  // 6. Outer procedural blend leaves baseH untouched beyond r = 200
  assert.equal(R.getElevationMod(250, -180, 12.345), 12.345);

  // 7. Climate overrides match each biome cleanly
  const cl = { desert: 0, snow: 0, forest: 0, meadow: 1 };
  R.getClimateMod(62, -78, cl);
  assert.ok(cl.forest > 0.7, `Whispering Deep Forest must have forest climate, got ${cl.forest}`);
  R.getClimateMod(-86, -14, cl);
  assert.ok(cl.desert > 0.7, `Canyon Oasis must have desert climate, got ${cl.desert}`);
  R.getClimateMod(-68, -88, cl);
  assert.ok(cl.snow > 0.7, `Frostpeak must have snow climate, got ${cl.snow}`);

  // 8. Dirt trails peak along Sanctuary -> Sunlit Ruins path and vanish far off-trail
  assert.ok(R.getTrailWeight(26, -3) > 0.85, 'Sunlit Ruins footpath must have high trailWeight');
  assert.equal(R.getTrailWeight(130, 130), 0, 'Off-trail coordinates should have zero trailWeight');
});

test('Regions.buildWorldLandmarks builds skyline landmarks, Sunken City, relic, secrets, and standable colliders', () => {
  const { Regions: R, THREE } = loadRegions(true);
  const scene = new THREE.Scene();
  const hFn = (x, z) => R.getElevationMod(x, z, 2.0);
  const nFn = (_x, _z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; };

  const built = R.buildWorldLandmarks(scene, hFn, nFn, { sets: {} });
  assert.ok(built.group && scene.children.includes(built.group), 'Landmarks group must be added to scene');
  assert.ok(built.relicObj && built.relicObj.pearlMesh, 'Must construct interactive Tidecaller Pearl pedestal');
  assert.equal(built.secretObjs.length, 6, 'Must construct all 6 Secret Star Shrines');
  assert.ok(built.animated.length >= 4, 'Landmarks should include animated crystals/rings/lanterns');

  // Verify height-aware standable colliders exist on wooden pier and Sunken Star-Temple
  const pierCols = R.getNearbyColliders(36, 65, 8, []);
  assert.ok(
    pierCols.some(c => c.standable && c.topY > 0.5 && c.topY < 2.0),
    'Wooden pier on Twilight Basalt Coast must register standable deck colliders'
  );
  const templeCols = R.getNearbyColliders(-14, 94, 14, []);
  assert.ok(
    templeCols.some(c => c.standable && c.topY < -5.0),
    'Sunken Star-Temple must register submerged standable terrace colliders'
  );

  // Verify Star Sanctuary starting pad registers standable floor pads so Starkeeper boots sit ON TOP of the dais!
  const sancCols = R.getNearbyColliders(0, 2.5, 1, []);
  const hSanc = hFn(0, 0);
  assert.ok(
    sancCols.some(c => c.standable && c.pad && Math.abs(c.topY - (hSanc + 0.10)) < 0.01),
    'Star Sanctuary inner compass dais must register standable floor pad collider at hSanc + 0.10'
  );

  // Verify ALL rotating tower rings clear their stone tower pinnacles without clipping!
  const obRings = built.animated.filter(a => a.kind === 'ring' && Math.hypot(a.mesh.position.x - 70, a.mesh.position.z + 10) < 1);
  assert.equal(obRings.length, 2, 'Sun-Dial Obelisk must have 2 orbiting rings');
  const hOb = hFn(70, -10);
  for (const r of obRings) {
    assert.ok(r.mesh.position.y - r.mesh.scale.x - 0.12 > hOb + 14.15, `Obelisk ring must clear stone pillar top (${hOb + 14.15})`);
  }
  const spireRing = built.animated.find(a => a.kind === 'ring' && Math.hypot(a.mesh.position.x + 68, a.mesh.position.z + 88) < 1);
  const hPeak = hFn(-68, -88);
  assert.ok(spireRing && spireRing.mesh.position.y - spireRing.mesh.scale.x - 0.12 > hPeak + 17.35, 'Frostpeak spire ring must clear stone spire top');
});

test('Sub-Project 4 landmarks: botanical Hollow Great-Tree canopy, underwater caustics on Sunken City stone, oasis grove, and carved GLB shrine hot-swaps', () => {
  const oakLeafCard = { isTexture: true, id: 'oakLeafCard' };
  const {
    Regions: R,
    THREE,
    Textures,
    causticPatches,
    treeWindPatches,
    nodeSwaps,
  } = loadRegions(true, {
    withBufferGeo: true,
    fullShaders: true,
    withEnv: true,
    textures: { sets: {}, oakLeafCard },
  });

  const scene = new THREE.Scene();
  const hFn = (x, z) => R.getElevationMod(x, z, 2.0);
  const nFn = (_x, _z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; };
  const built = R.buildWorldLandmarks(scene, hFn, nFn, Textures);

  // 1. Hollow Great-Tree must have ZERO DodecahedronGeometry foliage blobs and MUST use botanical oakLeafCard canopy with Shaders.patchTreeWind
  const treeMeshes = [];
  built.group.traverse((obj) => {
    if (obj && obj.isMesh) {
      treeMeshes.push(obj);
    }
  });
  const dodecaLeafBlobs = treeMeshes.filter((m) => {
    if (!m.geometry || m.geometry.kind !== 'dodeca') return false;
    // Check meshes near Hollow Great-Tree (62, -78) or green leaf materials
    const dx = (m.position ? m.position.x : 0) - 62;
    const dz = (m.position ? m.position.z : 0) + 78;
    const nearTree = Math.hypot(dx, dz) < 16;
    const isLeafHex = m.material && m.material.color && m.material.color.hex === 0x4e8a42;
    return nearTree || isLeafHex;
  });
  assert.equal(dodecaLeafBlobs.length, 0, 'Hollow Great-Tree canopy must contain ZERO DodecahedronGeometry foliage blobs');

  const foliageWindCalls = treeWindPatches.filter((p) => p.isFoliage === true);
  assert.ok(foliageWindCalls.length >= 1, 'Shaders.patchTreeWind(mat, true) must be called for botanical canopy foliage');
  assert.ok(
    foliageWindCalls.some((p) => p.mat && p.mat.map === oakLeafCard),
    'Hollow Great-Tree canopy material must bind Textures.oakLeafCard'
  );
  const greatTreeCanopyNodes = treeMeshes.filter((m) => m.userData && m.userData.isGreatTreeCanopy);
  assert.ok(greatTreeCanopyNodes.length >= 1, 'Hollow Great-Tree must tag botanical canopy node(s)');
  assert.ok(
    greatTreeCanopyNodes.some((m) => m.geometry && m.geometry.kind === 'buffer' && m.geometry.attributes.position && m.geometry.attributes.color),
    'Hollow Great-Tree canopy should build merged vertex-colored curved leaf-card BufferGeometry when BufferGeometry is available'
  );

  // 2. Sunken City submerged stonework & coral materials must receive Shaders.patchUnderwaterCaustics
  assert.ok(causticPatches.length >= 2, `Expected >=2 Shaders.patchUnderwaterCaustics calls (sunkenStone + corals), got ${causticPatches.length}`);
  const causticMats = new Set(causticPatches.map((p) => p.mat));
  const sunkenTempleCols = treeMeshes.filter((m) => m.userData && m.userData.sunkenStoneMesh);
  assert.ok(sunkenTempleCols.length >= 4, 'Sunken City stonework meshes must exist');
  for (const m of sunkenTempleCols) {
    assert.ok(causticMats.has(m.material), 'All Sunken City stonework meshes must use caustic-patched materials');
  }

  // 3. Env.registerNodeSwap must register all expected ruin, shrine, and oasis prop keys
  const registeredKeys = new Set(nodeSwaps.map((s) => s.key));
  for (const expectedKey of [
    'ruin_arch',
    'ruin_column',
    'ruin_column_broken',
    'shrine_pedestal',
    'palm_tree',
    'willow_tree',
    'lilypad',
  ]) {
    assert.ok(registeredKeys.has(expectedKey), `Env.registerNodeSwap must register '${expectedKey}'`);
  }

  // Sunken City swapped ruins/shrines must enable caustics: true
  const sunkenSwaps = nodeSwaps.filter((s) => s.opts && s.opts.caustics === true);
  assert.ok(sunkenSwaps.length >= 6, `Expected >=6 Sunken City node swaps with caustics: true, got ${sunkenSwaps.length}`);
  assert.ok(sunkenSwaps.some((s) => s.key === 'ruin_arch'), 'Sunken City arches must register ruin_arch with caustics: true');
  assert.ok(sunkenSwaps.some((s) => s.key === 'shrine_pedestal'), 'Sunken City pedestals/shrine must register shrine_pedestal with caustics: true');

  // Every Secret Shrine must register a shrine_pedestal swap
  const pedestalSwaps = nodeSwaps.filter((s) => s.key === 'shrine_pedestal');
  assert.ok(pedestalSwaps.length >= 7, `Expected >=7 shrine_pedestal swaps (6 secrets + Tidecaller Pearl), got ${pedestalSwaps.length}`);

  // Every swap holder must be attached in scene graph with a visible fallback child and preserve non-placeholder trim
  for (const sw of nodeSwaps) {
    assert.ok(sw.holder && sw.holder.parent, `Swap holder for '${sw.key}' must be attached to scene graph`);
    assert.ok(sw.holder.children.length >= 1, `Swap holder for '${sw.key}' must contain procedural fallback geometry`);
    assert.ok(sw.opts && (sw.opts.keepNonPlaceholders || sw.opts.fallback), `Swap for '${sw.key}' must preserve non-placeholder trim`);
  }

  // 4. Preserve ALL existing standable colliders & ring clearances
  const pierCols = R.getNearbyColliders(36, 65, 8, []);
  assert.ok(pierCols.some((c) => c.standable && c.topY > 0.5 && c.topY < 2.0));
  const templeCols = R.getNearbyColliders(-14, 94, 14, []);
  assert.ok(templeCols.some((c) => c.standable && c.topY < -5.0));
  const sancCols = R.getNearbyColliders(0, 2.5, 1, []);
  const hSanc = hFn(0, 0);
  assert.ok(sancCols.some((c) => c.standable && c.pad && Math.abs(c.topY - (hSanc + 0.10)) < 0.01));

  const obRings = built.animated.filter((a) => a.kind === 'ring' && Math.hypot(a.mesh.position.x - 70, a.mesh.position.z + 10) < 1);
  assert.equal(obRings.length, 2, 'Sun-Dial Obelisk must preserve exactly 2 orbiting rings');
  const hOb = hFn(70, -10);
  for (const r of obRings) {
    assert.ok(r.mesh.position.y - r.mesh.scale.x - 0.12 > hOb + 14.15);
  }
  const spireRing = built.animated.find((a) => a.kind === 'ring' && Math.hypot(a.mesh.position.x + 68, a.mesh.position.z + 88) < 1);
  const hPeak = hFn(-68, -88);
  assert.ok(spireRing && spireRing.mesh.position.y - spireRing.mesh.scale.x - 0.12 > hPeak + 17.35);

  // 5. animateLandmarks updates crystals, rings, kelp sway, and pulsing rune collars cleanly
  R.animateLandmarks(built, 0.016, 2.4);
  const pulseEntries = built.animated.filter((a) => a.kind === 'pulse');
  assert.ok(pulseEntries.length >= 6, 'Glowing Star-Rune collars on shrines/landmarks should gently pulse');

  // 6. Lightweight mock THREE (without BufferGeometry) also builds multi-tier PlaneGeometry leaf cards with zero DodecahedronGeometry
  const fallbackCtx = loadRegions(true, {
    withBufferGeo: false,
    fullShaders: true,
    withEnv: true,
    textures: { sets: {}, oakLeafCard },
  });
  const fbScene = new fallbackCtx.THREE.Scene();
  const fbBuilt = fallbackCtx.Regions.buildWorldLandmarks(fbScene, hFn, nFn, fallbackCtx.Textures);
  const fbMeshes = [];
  fbBuilt.group.traverse((obj) => { if (obj && obj.isMesh) fbMeshes.push(obj); });
  assert.equal(
    fbMeshes.filter((m) => m.geometry && m.geometry.kind === 'dodeca').length,
    0,
    'PlaneGeometry canopy fallback must also emit zero DodecahedronGeometry meshes'
  );
  const fbTreeCards = fbMeshes.filter((m) => m.userData && m.userData.isGreatTreeCanopy && m.geometry && m.geometry.kind === 'plane');
  assert.ok(fbTreeCards.length >= 20, `Expected multi-tier PlaneGeometry botanical cards on fallback canopy, got ${fbTreeCards.length}`);
});
