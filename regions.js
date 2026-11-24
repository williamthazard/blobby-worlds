// ============================================================
// regions.js - Anchored 6-Region World Geography, Dirt Trails,
// Monumental Skyline Landmarks, Sunken Underwater City,
// Tidecaller's Pearl Relic & 6 Off-Path Secret Star Shrines.
//
// Zero-GC math API consumed by world.js, physics.js & game.js.
// ============================================================

const Regions = (() => {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function gauss2(x, z, cx, cz, rx, rz) {
    const dx = (x - cx) / rx;
    const dz = (z - cz) / (rz || rx);
    const d2 = dx * dx + dz * dz;
    return d2 > 9 ? 0 : Math.exp(-d2);
  }

  // ---------- Region Definitions & Progression Route ----------

  const LIST = [
    {
      id: 'sanctuary',
      name: 'Star Sanctuary',
      subtitle: 'Ancient Hilltop of the First Lantern',
      x: 0,
      z: 0,
      radius: 26,
    },
    {
      id: 'sunlitRuins',
      name: 'Sunlit Ruins',
      subtitle: 'Meadow Colonnades & Sun-Dial Obelisk',
      x: 68,
      z: -10,
      radius: 44,
    },
    {
      id: 'whisperingForest',
      name: 'Whispering Deep Forest',
      subtitle: 'Hollow Great-Tree & Firefly Glades',
      x: 62,
      z: -78,
      radius: 46,
    },
    {
      id: 'twilightCoast',
      name: 'Twilight Basalt Coast',
      subtitle: "Stratified Cliffs & Tidecaller's Arch",
      x: 58,
      z: 62,
      radius: 42,
    },
    {
      id: 'canyonOasis',
      name: 'Canyon Oasis',
      subtitle: 'Red-Ochre Arch & Emerald Spring',
      x: -86,
      z: -14,
      radius: 46,
    },
    {
      id: 'frostpeak',
      name: 'Frostpeak Shrines',
      subtitle: 'Glacial Tarn & Summit Star-Spire',
      x: -68,
      z: -88,
      radius: 48,
    },
    {
      id: 'sunkenCity',
      name: 'The Sunken Underwater City',
      subtitle: 'Coral Arches & Submerged Star-Temple',
      x: -14,
      z: 86,
      radius: 48,
    },
  ];

  const OUTER_WILDS = {
    id: 'wilds',
    name: 'Outer Starlight Wilds',
    subtitle: 'Uncharted Horizon Isles',
    x: 0,
    z: 0,
    radius: 9999,
  };

  const BY_ID = Object.create(null);
  for (let i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  const RELIC_SITE = {
    id: 'tidecallerPearl',
    name: "Tidecaller's Pearl",
    regionId: 'twilightCoast',
    x: 64,
    z: 70,
  };

  const TOTEM_ROUTE = [
    {
      x: 46, z: -6, regionId: 'sunlitRuins', underwater: false,
      title: 'Sunlit Ruins Overlook',
      hint: 'Follow the eastern footpath into the Sunlit Ruins!',
    },
    {
      x: 70, z: -12, regionId: 'sunlitRuins', underwater: false,
      title: 'Sun-Dial Obelisk',
      hint: 'The next Star Totem calls from the Sun-Dial Obelisk to the east!',
    },
    {
      x: 62, z: -76, regionId: 'whisperingForest', underwater: false,
      title: 'Hollow Great-Tree Shrine',
      hint: 'Follow the northeast trail beneath the towering canopy of Whispering Deep Forest!',
    },
    {
      x: 54, z: 58, regionId: 'twilightCoast', underwater: false,
      title: "Tidecaller's Headland",
      hint: "Head southeast to Twilight Basalt Coast — seek Tidecaller's Pearl above the cove!",
    },
    {
      x: -14, z: 94, regionId: 'sunkenCity', underwater: true,
      title: 'The Sunken Star-Temple',
      hint: "Dive into the glowing turquoise bay to light the Sunken Underwater City's Star-Temple!",
    },
    {
      x: -86, z: -12, regionId: 'canyonOasis', underwater: false,
      title: 'Sandstone Sun-Gate',
      hint: 'Cross beneath the great western arch into Canyon Oasis!',
    },
    {
      x: -58, z: -70, regionId: 'frostpeak', underwater: false,
      title: 'Glacial Tarn Terrace',
      hint: 'Climb the northwest alpine trail toward the Frostpeak Shrines!',
    },
    {
      x: -70, z: -92, regionId: 'frostpeak', underwater: false,
      title: 'Frostpeak Summit Star-Spire',
      hint: 'Ascend to the Frostpeak Summit Star-Spire for the final constellation!',
    },
  ];

  const SECRETS = [
    { id: 'ruinsAlcove', name: 'Mossy Colonnade Cache',    regionId: 'sunlitRuins',      x: 82,  z: 4,   underwater: false },
    { id: 'forestGlade', name: 'Firefly Fern Sanctum',     regionId: 'whisperingForest', x: 78,  z: -94, underwater: false },
    { id: 'coastGrotto', name: 'Sea-Cliff Lookout Shrine', regionId: 'twilightCoast',    x: 74,  z: 52,  underwater: false },
    { id: 'canyonCrown', name: 'Mesa Rim Sun-Brazier',     regionId: 'canyonOasis',      x: -98, z: -28, underwater: false },
    { id: 'frostTarn',   name: 'Glacial Tarn Mirror',      regionId: 'frostpeak',        x: -48, z: -78, underwater: false },
    { id: 'sunkenVault', name: 'Coral Vault of the Deep',  regionId: 'sunkenCity',       x: -32, z: 92,  underwater: true  },
  ];

  // 6 Scenic winding dirt footpaths radiating from Star Sanctuary (0, 0)
  const TRAILS = [
    // East -> Sunlit Ruins
    [[0, 0], [18, -2], [38, -5], [56, -8], [70, -10]],
    // North-East -> Whispering Deep Forest
    [[0, 0], [18, -18], [36, -40], [50, -60], [62, -78]],
    // South-East -> Twilight Basalt Coast Cove, Pier & Tidecaller's Headland
    [[0, 0], [18, 16], [34, 38], [43, 56], [54, 62], [64, 70]],
    // Short spur to the weathered Lake Hylia wooden pier
    [[43, 56], [39, 60]],
    // South -> Sunken Bay sandy beach entry
    [[0, 0], [-4, 16], [-10, 32], [-12, 42]],
    // West -> Canyon Oasis arch & spring
    [[0, 0], [-22, -4], [-46, -9], [-66, -14], [-86, -14]],
    // North-West -> Frostpeak walkable alpine ascent
    [[0, 0], [-18, -22], [-38, -46], [-56, -68], [-68, -88]],
  ];

  function distToSegmentSq(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq <= 1e-6) {
      const dx = px - ax;
      const dz = pz - az;
      return dx * dx + dz * dz;
    }
    const t = clamp(((px - ax) * abx + (pz - az) * abz) / lenSq, 0, 1);
    const cx = ax + abx * t;
    const cz = az + abz * t;
    const dx = px - cx;
    const dz = pz - cz;
    return dx * dx + dz * dz;
  }

  function getTrailWeight(x, z) {
    if (x * x + z * z > 135 * 135) return 0;
    let minD2 = 9999;
    for (let t = 0; t < TRAILS.length; t++) {
      const pts = TRAILS[t];
      for (let i = 0; i < pts.length - 1; i++) {
        const d2 = distToSegmentSq(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        if (d2 < minD2) minD2 = d2;
      }
    }
    if (minD2 > 16.0) return 0;
    return smoothstep(3.8, 1.45, Math.sqrt(minD2));
  }

  function regionAt(x, z) {
    const r = Math.hypot(x, z);
    if (r > 152) return OUTER_WILDS;
    // Star Sanctuary center priority
    if (r <= 21) return BY_ID.sanctuary;

    // Pick closest region weighted by its radius
    let best = BY_ID.sanctuary;
    let bestScore = Infinity;
    for (let i = 0; i < LIST.length; i++) {
      const reg = LIST[i];
      const d = Math.hypot(x - reg.x, z - reg.z) / reg.radius;
      if (d < bestScore) {
        bestScore = d;
        best = reg;
      }
    }
    return bestScore <= 1.45 ? best : OUTER_WILDS;
  }

  function getRegionById(id) {
    return BY_ID[id] || OUTER_WILDS;
  }

  // ---------- Deterministic Sculpted Macro Elevation & Climate ----------

  function getElevationMod(x, z, baseH) {
    const r = Math.hypot(x, z);
    if (r >= 198) return baseH;

    // Subtle organic meadow undulation using smooth trig (zero allocations, C-infinity smooth)
    const gentleRoll =
      Math.sin(x * 0.042 + 0.5) * Math.cos(z * 0.038 - 0.3) * 1.15 +
      Math.sin((x + z) * 0.075) * 0.42;

    // 1. Base continental landmass inside central archipelago (smooth coastline curving into southern bay)
    const islandDrop = smoothstep(115, 162, r);
    let h = 5.1 + gentleRoll * (1 - islandDrop * 0.5) - islandDrop * 9.8;

    // 2. Star Sanctuary (0, 0): serene flat stone-compass hilltop plateau ~6.2u
    const wSanc = gauss2(x, z, 0, 0, 17, 17);
    h = lerp(h, 6.2, smoothstep(0.18, 0.72, wSanc));

    // 3. Sunlit Ruins (68, -10): rolling Lake Hylia golden meadows with flat colonnade courtyard ~5.4u
    const wRuins = gauss2(x, z, 68, -10, 24, 22);
    h = lerp(h, 5.4 + Math.sin(x * 0.09) * 0.35, wRuins * 0.82);

    // 4. Whispering Deep Forest (62, -78): elevated lush forest glade ~7.4u with gentle knolls
    const wForest = gauss2(x, z, 62, -78, 30, 28);
    h = lerp(h, 7.2 + Math.cos(x * 0.08 - z * 0.07) * 0.85, wForest * 0.88);
    // Flat Great-Tree shrine clearing
    const wTreeClear = gauss2(x, z, 62, -78, 12, 12);
    h = lerp(h, 7.2, smoothstep(0.3, 0.8, wTreeClear));

    // 5. Sunken Underwater City Deep Turquoise Bay (-14, 86):
    // Carve broad deep crystal bay (-11.5u floor) with gentle sandy beach transition on north shore (z = 36..52)
    const bayD = Math.hypot((x + 14) / 48, (z - 88) / 42);
    const bayCarve = 1.0 - smoothstep(0.55, 1.16, bayD);
    if (bayCarve > 0.001) {
      h = lerp(h, -11.5 + Math.sin(x * 0.12) * Math.cos(z * 0.12) * 0.45, bayCarve);
    }
    // Flat submerged Star-Temple seabed plaza at (-14, 94)
    const wSunkenPlaza = gauss2(x, z, -14, 94, 16, 16);
    if (wSunkenPlaza > 0.02) {
      h = lerp(h, -11.5, smoothstep(0.2, 0.78, wSunkenPlaza));
    }

    // 6. Twilight Basalt Coast (58, 62):
    // Dramatic sheer stratified coastal cliff headland at (64, 70) overlooking the bay!
    const headD = Math.hypot((x - 66) / 21, (z - 70) / 17);
    const headland = 1.0 - smoothstep(0.68, 0.92, headD);
    if (headland > 0.001) {
      h = lerp(h, 11.4, headland);
    }
    // Sheltered Lake Hylia sandy cove beach & open-water pier ramp sloping cleanly into turquoise bay!
    const wCove = gauss2(x, z, 36, 62, 16, 16);
    if (wCove > 0.01) {
      const beachSlope = lerp(2.8, -4.8, smoothstep(50, 74, z));
      h = lerp(h, beachSlope, smoothstep(0.12, 0.72, wCove));
    }
    // Walkable coastal trail ramp connecting cove (44, 56) up onto Tidecaller's Headland (64, 70)
    const wRamp = gauss2(x, z, 52, 62, 11, 9);
    if (wRamp > 0.01) {
      const rampTarget = lerp(3.6, 10.8, smoothstep(44, 62, x));
      h = lerp(h, rampTarget, wRamp * 0.80);
    }

    // 7. Canyon Oasis (-86, -14):
    // Flat sun-warmed sandstone canyon floor (~3.2u) framed by towering stratified canyon mesa walls!
    const wCanyon = gauss2(x, z, -82, -14, 32, 24);
    if (wCanyon > 0.01) {
      h = lerp(h, 3.3, wCanyon * 0.85);
    }
    // North & south stratified mesa walls flanking Canyon Oasis
    const wMesaN = 1.0 - smoothstep(10, 22, Math.hypot(x + 86, z + 36));
    const wMesaS = 1.0 - smoothstep(10, 22, Math.hypot(x + 86, z - 10));
    const wMesaW = 1.0 - smoothstep(12, 24, Math.hypot(x + 114, z + 14));
    const mesa = Math.max(wMesaN, wMesaS, wMesaW);
    if (mesa > 0.001) {
      h = lerp(h, 13.6, mesa);
    }
    // Emerald oasis spring pool at (-76, -14)
    const poolD = Math.hypot((x + 76) / 10, (z + 14) / 8.5);
    const poolCarve = 1.0 - smoothstep(0.45, 1.05, poolD);
    if (poolCarve > 0.001) {
      h = lerp(h, -1.9, poolCarve);
    }

    // 8. Frostpeak Shrines (-68, -88):
    // Majestic smooth alpine ascent (keeps switchback slope cleanly < 30 deg!) peaking at ~19.2u
    const peakDist = Math.hypot((x + 68) / 56, (z + 88) / 56);
    const alpineRise = 1.0 - smoothstep(0.0, 1.0, peakDist);
    if (alpineRise > 0.001) {
      h += alpineRise * alpineRise * 14.4;
    }
    // Level glacial tarn terrace at (-58, -70) & frozen tarn basin at (-48, -78)
    const wSummitPad = gauss2(x, z, -68, -88, 10, 10);
    if (wSummitPad > 0.02) {
      h = lerp(h, 19.2, smoothstep(0.25, 0.82, wSummitPad));
    }
    const wTarn = gauss2(x, z, -48, -78, 8, 7);
    if (wTarn > 0.02) {
      h = lerp(h, 11.4, smoothstep(0.2, 0.78, wTarn));
    }

    // Smoothly blend outer fringe (r = 148..198) back into infinite procedural terrain/ocean
    const outerBlend = smoothstep(148, 198, r);
    return h + (baseH - h) * outerBlend;
  }

  function getClimateMod(x, z, out) {
    const r = Math.hypot(x, z);
    if (r >= 195) return out;

    const wForest = gauss2(x, z, 62, -78, 36, 34);
    const wDesert = gauss2(x, z, -86, -14, 38, 32);
    const wSnow = gauss2(x, z, -68, -88, 40, 38);

    // Inside the anchored central archipelago (r < 145), cleanly assign regional biomes (no stray cacti in Sunlit Ruins!)
    const anchorW = 1.0 - smoothstep(138, 190, r);
    const specSum = wForest + wDesert + wSnow;
    const invSpec = specSum > 1 ? 1 / specSum : 1;
    const tForest = wForest * invSpec;
    const tDesert = wDesert * invSpec;
    const tSnow = wSnow * invSpec;
    const tMeadow = clamp(1 - tForest - tDesert - tSnow, 0, 1);

    out.desert = lerp(out.desert, tDesert, anchorW);
    out.snow = lerp(out.snow, tSnow, anchorW);
    out.forest = lerp(out.forest, tForest, anchorW);
    out.meadow = lerp(out.meadow, tMeadow, anchorW);
    return out;
  }

  // ---------- Spatial Landmark Colliders (Height-Aware 3D) ----------

  const _landmarkColliders = [];

  function addCollider(x, z, r, topY, standable, pad) {
    _landmarkColliders.push({ x, z, r, topY, standable: !!standable, pad: !!pad });
  }

  function clearLandmarkColliders() {
    _landmarkColliders.length = 0;
  }

  function getNearbyColliders(x, z, radius, out) {
    if (!out) out = [];
    for (let i = 0; i < _landmarkColliders.length; i++) {
      const c = _landmarkColliders[i];
      const dx = c.x - x;
      const dz = c.z - z;
      const lim = radius + c.r;
      if (dx * dx + dz * dz <= lim * lim) {
        out.push(c);
      }
    }
    return out;
  }

  // ---------- Monumental Landmarks & Sunken City Builder ----------

  function buildWorldLandmarks(scene, heightAt, terrainNormalAt, textures) {
    clearLandmarkColliders();
    const group = new THREE.Group();
    const animated = [];
    const secretObjs = [];
    let relicObj = null;

    if (!scene || typeof THREE === 'undefined') {
      return { group, relicObj, secretObjs, animated };
    }

    const sets = (textures && textures.sets) || {};
    const makeMat = (setName, hex, rough, metal = 0.04, extra = null) => {
      const s = sets[setName];
      const opts = {
        color: hex,
        roughness: rough,
        metalness: metal,
      };
      if (s && s.map) opts.map = s.map;
      if (s && s.normalMap) opts.normalMap = s.normalMap;
      if (s && s.roughnessMap) opts.roughnessMap = s.roughnessMap;
      if (extra) Object.assign(opts, extra);
      const m = new THREE.MeshStandardMaterial(opts);
      if (m.color && typeof m.color.convertSRGBToLinear === 'function') m.color.convertSRGBToLinear();
      if (m.emissive && typeof m.emissive.convertSRGBToLinear === 'function') m.emissive.convertSRGBToLinear();
      return m;
    };

    const ruinStone = makeMat('stone', 0xc9c4b8, 0.86);
    const mossyStone = makeMat('stone', 0x9fa892, 0.88);
    const sandstone = makeMat('rock', 0xd69666, 0.84);
    const frostStone = makeMat('stone', 0xc8d8e6, 0.72);
    const sunkenStone = makeMat('stone', 0x7c9ca4, 0.78);
    const woodMat = makeMat('bark', 0x9b7650, 0.90);
    const treeBark = makeMat('bark', 0x7a563a, 0.92);
    const goldMat = makeMat(null, 0xf2c85b, 0.28, 0.72, { emissive: 0x452d04, emissiveIntensity: 0.4 });
    const crystalGold = makeMat(null, 0xffe066, 0.16, 0.25, { emissive: 0xffb824, emissiveIntensity: 1.15 });
    const crystalAqua = makeMat(null, 0x76f6ef, 0.14, 0.22, { emissive: 0x26d8d4, emissiveIntensity: 1.35 });
    const crystalIce = makeMat(null, 0xb8eeff, 0.14, 0.20, { emissive: 0x52c4ff, emissiveIntensity: 1.1 });
    const coralRose = makeMat('rock', 0xf07a94, 0.68, 0.02, { emissive: 0x4a1628, emissiveIntensity: 0.35 });
    const coralAmber = makeMat('rock', 0xf59e56, 0.68, 0.02, { emissive: 0x4a2208, emissiveIntensity: 0.32 });
    const coralViolet = makeMat('rock', 0xa87ee8, 0.68, 0.02, { emissive: 0x2e1a52, emissiveIntensity: 0.38 });
    const kelpGlow = makeMat(null, 0x46e6b8, 0.42, 0.05, { emissive: 0x1eb892, emissiveIntensity: 0.85, side: THREE.DoubleSide });
    const leafCanopy = makeMat('leaves', 0x4e8a42, 0.78, 0.0);

    const makeGlow = (color, size, opacity) => {
      if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.createGlowSprite === 'function') {
        const sp = Shaders.createGlowSprite(color, size, opacity, true);
        sp.castShadow = false;
        sp.receiveShadow = false;
        return sp;
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity }));
      sp.scale.set(size, size, 1);
      return sp;
    };

    const addShadowMesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.rotation.y = ry;
      m.rotation.z = rz;
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // Shared landmark geometries (minimizes allocations & shader switches)
    const gCol = new THREE.CylinderGeometry(0.46, 0.56, 1.0, 10);
    const gCap = new THREE.BoxGeometry(1.45, 0.36, 1.45);
    const gPlinth = new THREE.CylinderGeometry(1.0, 1.15, 1.0, 10);
    const gBox = new THREE.BoxGeometry(1, 1, 1);
    const gRing = new THREE.TorusGeometry(1.0, 0.09, 8, 22);
    const gOrb = new THREE.OctahedronGeometry(0.55, 1);
    const gCoralFan = new THREE.DodecahedronGeometry(0.65, 0);
    const gArch = new THREE.TorusGeometry(1.0, 0.22, 8, 18, Math.PI);

    const placeColumn = (x, z, height, mat, standableTop = true) => {
      const y0 = heightAt(x, z);
      addShadowMesh(gPlinth, mat, x, y0 + 0.35, z, 0, 0, 0, 0.72, 0.7, 0.72);
      addShadowMesh(gCol, mat, x, y0 + 0.35 + height * 0.5, z, 0, 0, 0, 1, height, 1);
      if (height >= 2.2) {
        addShadowMesh(gCap, mat, x, y0 + 0.35 + height + 0.14, z);
      }
      addCollider(x, z, 0.68, y0 + 0.35 + height + 0.32, standableTop);
      return y0 + 0.35 + height;
    };

    // 1. STAR SANCTUARY (0, 0): Compass Stone Plaza & North Starlight Arch (standable floor pads!)
    const hSanc = heightAt(0, 0);
    addShadowMesh(new THREE.CylinderGeometry(7.2, 7.6, 0.42, 24), ruinStone, 0, hSanc - 0.14, 0);
    addCollider(0, 0, 7.35, hSanc + 0.07, true, true);
    addShadowMesh(new THREE.CylinderGeometry(4.6, 4.7, 0.46, 16), mossyStone, 0, hSanc - 0.13, 0);
    addCollider(0, 0, 4.65, hSanc + 0.10, true, true);
    // Flush inlaid golden compass ring sitting dead-level with inner dais top (hSanc + 0.10)
    addShadowMesh(gRing, goldMat, 0, hSanc + 0.068, 0, Math.PI * 0.5, 0, 0, 4.4, 4.4, 0.36);
    placeColumn(-3.6, -7.8, 4.4, ruinStone, true);
    placeColumn(3.6, -7.8, 4.4, ruinStone, true);
    addShadowMesh(gArch, ruinStone, 0, hSanc + 4.65, -7.8, 0, 0, 0, 3.6, 3.2, 1.3);
    const sancCrystal = addShadowMesh(gOrb, crystalGold, 0, hSanc + 7.9, -7.8, 0, 0, 0, 0.75, 1.1, 0.75);
    const sancHalo = makeGlow(0xffe070, 2.8, 0.65);
    sancHalo.position.set(0, hSanc + 7.9, -7.8);
    group.add(sancHalo);
    animated.push({ mesh: sancCrystal, kind: 'spin', speed: 1.4, baseY: hSanc + 7.9 });

    // 2. SUNLIT RUINS (68, -10): Mossy Colonnade Avenue & 14u Sun-Dial Obelisk
    const ruinsCols = [
      [54, -14, 4.6], [54, -2, 3.2],
      [60, -15, 5.2], [60, -3, 4.8],
      [66, -18, 5.6], [66, -2, 2.4],
      [74, -17, 4.8], [74, -3, 5.2],
    ];
    for (let i = 0; i < ruinsCols.length; i++) {
      const rc = ruinsCols[i];
      placeColumn(rc[0], rc[1], rc[2], i % 2 === 0 ? ruinStone : mossyStone, true);
    }
    // Ruined stone lintel spanning intact column pair
    const hLintel = Math.min(heightAt(60, -15), heightAt(66, -18)) + 5.4;
    addShadowMesh(gBox, mossyStone, 63, hLintel, -16.5, 0, 0.46, 0, 7.6, 0.65, 1.15);

    // Towering 14u Sun-Dial Obelisk skyline landmark at (70, -10) — floating rings orbit cleanly ABOVE stone tip (hOb + 14.15)!
    const hOb = heightAt(70, -10);
    addShadowMesh(new THREE.CylinderGeometry(3.4, 3.9, 0.9, 12), ruinStone, 70, hOb + 0.4, -10);
    addCollider(70, -10, 3.6, hOb + 0.85, true);
    addShadowMesh(new THREE.CylinderGeometry(0.55, 1.35, 13.5, 6), ruinStone, 70, hOb + 7.4, -10);
    addCollider(70, -10, 1.35, hOb + 14.2, false);
    const obCrystal = addShadowMesh(gOrb, crystalGold, 70, hOb + 16.65, -10, 0, 0, 0, 0.78, 1.15, 0.78);
    const obRingA = addShadowMesh(gRing, goldMat, 70, hOb + 16.65, -10, 0.4, 0, 0, 2.15, 2.15, 1.15);
    const obRingB = addShadowMesh(gRing, goldMat, 70, hOb + 16.65, -10, -0.5, 0.9, 0, 1.55, 1.55, 1.05);
    const obGlow = makeGlow(0xffe066, 4.4, 0.72);
    obGlow.position.set(70, hOb + 16.65, -10);
    group.add(obGlow);
    animated.push({ mesh: obCrystal, kind: 'spin', speed: 1.2, baseY: hOb + 16.65 });
    animated.push({ mesh: obRingA, kind: 'ring', speed: 0.75 });
    animated.push({ mesh: obRingB, kind: 'ring', speed: -1.1 });

    // 3. WHISPERING DEEP FOREST (62, -78): 18u Hollow Great-Tree Shrine
    const hTree = heightAt(62, -78);
    // 4 massive buttress root pillars leaving a dramatic walk-in hollow shrine archway!
    const buttressAngles = [0.65, 2.45, 3.85, 5.65];
    for (let i = 0; i < buttressAngles.length; i++) {
      const a = buttressAngles[i];
      const bx = 62 + Math.cos(a) * 2.55;
      const bz = -78 + Math.sin(a) * 2.55;
      addShadowMesh(new THREE.CylinderGeometry(0.75, 1.35, 8.8, 8), treeBark, bx, hTree + 4.2, bz, 0, a, 0);
      addCollider(bx, bz, 1.15, hTree + 8.6, false);
    }
    // Towering upper trunk + wide ancient limbs + huge layered emerald crown (18u tall skyline silhouette!)
    addShadowMesh(new THREE.CylinderGeometry(1.7, 2.4, 7.6, 10), treeBark, 62, hTree + 10.6, -78);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.25;
      const lx = 62 + Math.cos(a) * 4.4;
      const lz = -78 + Math.sin(a) * 4.4;
      addShadowMesh(new THREE.CylinderGeometry(0.38, 0.85, 6.2, 7), treeBark, lx * 0.5 + 31, hTree + 12.8, lz * 0.5 - 39, Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65);
      addShadowMesh(new THREE.DodecahedronGeometry(3.8, 1), leafCanopy, lx, hTree + 14.6 + (i % 2) * 1.1, lz, 0, a, 0, 1.25, 0.78, 1.25);
    }
    addShadowMesh(new THREE.DodecahedronGeometry(4.6, 1), leafCanopy, 62, hTree + 16.8, -78, 0, 0.4, 0, 1.3, 0.82, 1.3);
    // Warm emerald-gold spirit lantern suspended inside the Hollow Great-Tree archway
    const treeLantern = addShadowMesh(gOrb, crystalGold, 62, hTree + 3.9, -78, 0, 0, 0, 0.65, 0.85, 0.65);
    const treeGlow = makeGlow(0x9fffa8, 3.6, 0.75);
    treeGlow.position.set(62, hTree + 3.9, -78);
    group.add(treeGlow);
    animated.push({ mesh: treeLantern, kind: 'spin', speed: 1.1, baseY: hTree + 3.9 });

    // 4. TWILIGHT BASALT COAST: Weathered Lake Hylia Wooden Pier + Tidecaller's Arch & Pearl
    // Weathered Wooden Pier extending cleanly from sandy cove shore (36, 60) straight out into deep turquoise water (26, 76)
    const pierAngle = Math.atan2(26 - 36, 76 - 60);
    const pierDeckY = 1.15;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const px = lerp(36, 26, t);
      const pz = lerp(60, 76, t);
      addShadowMesh(gBox, woodMat, px, pierDeckY - 0.14, pz, 0, pierAngle, 0, 3.4, 0.28, 3.6);
      addCollider(px, pz, 1.85, pierDeckY, true);
      const rx = Math.cos(pierAngle) * 1.45;
      const rz = -Math.sin(pierAngle) * 1.45;
      addShadowMesh(gCol, treeBark, px + rx, pierDeckY - 2.4, pz + rz, 0, 0, 0, 0.34, 5.4, 0.34);
      addShadowMesh(gCol, treeBark, px - rx, pierDeckY - 2.4, pz - rz, 0, 0, 0, 0.34, 5.4, 0.34);
    }
    // Warm hanging lantern post at the open-water pier end
    addShadowMesh(gCol, treeBark, 27.3, pierDeckY + 1.5, 76.6, 0, 0, 0, 0.24, 3.1, 0.24);
    const pierGlow = makeGlow(0xffd478, 2.4, 0.85);
    pierGlow.position.set(27.3, pierDeckY + 3.05, 76.6);
    group.add(pierGlow);

    // Tidecaller's Arch on dramatic coastal cliff headland (64, 70) housing Tidecaller's Pearl!
    const rx = RELIC_SITE.x;
    const rz = RELIC_SITE.z;
    const hRelic = heightAt(rx, rz);
    addShadowMesh(new THREE.CylinderGeometry(4.2, 4.8, 0.8, 12), sunkenStone, rx, hRelic + 0.3, rz);
    addCollider(rx, rz, 4.4, hRelic + 0.7, true);
    placeColumn(rx - 3.0, rz - 1.2, 5.4, sunkenStone, true);
    placeColumn(rx + 3.0, rz + 1.2, 5.4, sunkenStone, true);
    const archYaw = Math.atan2(2.4, 6.0);
    addShadowMesh(gArch, sunkenStone, rx, hRelic + 5.7, rz, 0, -archYaw, 0, 3.3, 3.1, 1.35);

    // Interactive Tidecaller's Pearl Pedestal (floating pearl + ring orbit cleanly ABOVE stone pedestal top at hRelic + 2.025!)
    addShadowMesh(new THREE.CylinderGeometry(0.65, 0.85, 1.35, 10), sunkenStone, rx, hRelic + 1.35, rz);
    addCollider(rx, rz, 0.85, hRelic + 2.0, true);
    const pearlMesh = addShadowMesh(new THREE.SphereGeometry(0.46, 16, 12), crystalAqua, rx, hRelic + 2.88, rz);
    const pearlRing = addShadowMesh(gRing, goldMat, rx, hRelic + 2.88, rz, 0.65, 0.3, 0, 0.68, 0.68, 0.68);
    const pearlHalo = makeGlow(0x64f6ee, 3.2, 0.92);
    pearlHalo.position.set(rx, hRelic + 2.88, rz);
    group.add(pearlHalo);
    const pearlLight = typeof THREE.PointLight === 'function'
      ? new THREE.PointLight(0x5ef2ea, 1.6, 18)
      : null;
    if (pearlLight) {
      pearlLight.position.set(rx, hRelic + 2.95, rz);
      group.add(pearlLight);
    }
    relicObj = {
      x: rx,
      y: hRelic + 2.0,
      z: rz,
      claimed: false,
      pearlMesh,
      pearlRing,
      pearlHalo,
      pearlLight,
      baseY: hRelic + 2.88,
    };
    animated.push({ mesh: pearlMesh, kind: 'spin', speed: 1.6, baseY: hRelic + 2.88 });
    animated.push({ mesh: pearlRing, kind: 'ring', speed: -1.4 });

    // 5. CANYON OASIS (-86, -14): 16u Natural Sandstone Arch & Sandstone Sun-Gate
    const hArch = heightAt(-66, -14);
    addShadowMesh(new THREE.CylinderGeometry(1.7, 2.6, 11.5, 8), sandstone, -66, hArch + 5.2, -23.5);
    addCollider(-66, -23.5, 2.3, hArch + 11.0, false);
    addShadowMesh(new THREE.CylinderGeometry(1.7, 2.6, 11.5, 8), sandstone, -66, hArch + 5.2, -4.5);
    addCollider(-66, -4.5, 2.3, hArch + 11.0, false);
    addShadowMesh(gArch, sandstone, -66, hArch + 10.6, -14, 0, Math.PI * 0.5, 0, 9.6, 6.2, 5.2);

    // Sandstone Sun-Gate at (-86, -14)
    const hGate = heightAt(-86, -14);
    addShadowMesh(new THREE.BoxGeometry(2.2, 9.6, 2.2), sandstone, -88, hGate + 4.6, -19.5);
    addCollider(-88, -19.5, 1.45, hGate + 9.4, false);
    addShadowMesh(new THREE.BoxGeometry(2.2, 9.6, 2.2), sandstone, -88, hGate + 4.6, -8.5);
    addCollider(-88, -8.5, 1.45, hGate + 9.4, false);
    addShadowMesh(gBox, sandstone, -88, hGate + 9.8, -14, 0, 0, 0, 2.6, 1.5, 13.8);
    const sunDisc = addShadowMesh(gRing, crystalGold, -88, hGate + 12.9, -14, 0, Math.PI * 0.5, 0, 1.95, 1.95, 1.3);
    animated.push({ mesh: sunDisc, kind: 'ring', speed: 0.65 });

    // 6. FROSTPEAK SHRINES (-68, -88): Carved Stone Stairs & 18u Summit Star-Spire
    for (let s = 0; s < 5; s++) {
      const sx = lerp(-60, -65, s / 4);
      const sz = lerp(-76, -83, s / 4);
      const sy = heightAt(sx, sz);
      addShadowMesh(gBox, frostStone, sx, sy + 0.15, sz, 0, 0.64, 0, 4.6, 0.5, 1.8);
      addCollider(sx, sz, 2.0, sy + 0.4, true);
    }
    const hPeak = heightAt(-68, -88);
    addShadowMesh(new THREE.CylinderGeometry(4.4, 5.2, 1.1, 12), frostStone, -68, hPeak + 0.4, -88);
    addCollider(-68, -88, 4.8, hPeak + 0.95, true);
    addShadowMesh(new THREE.CylinderGeometry(0.45, 1.45, 16.5, 6), frostStone, -68, hPeak + 9.1, -88);
    addCollider(-68, -88, 1.5, hPeak + 17.4, false);
    // Floating crystal & orbiting ring elevated cleanly ABOVE stone spire pinnacle (hPeak + 17.35)!
    const spireCrown = addShadowMesh(gOrb, crystalIce, -68, hPeak + 20.1, -88, 0, 0, 0, 1.2, 1.75, 1.2);
    const spireRing = addShadowMesh(gRing, goldMat, -68, hPeak + 20.1, -88, 0.55, 0.2, 0, 2.35, 2.35, 1.15);
    const spireGlow = makeGlow(0x9ce8ff, 5.6, 0.82);
    spireGlow.position.set(-68, hPeak + 20.1, -88);
    group.add(spireGlow);
    animated.push({ mesh: spireCrown, kind: 'spin', speed: 1.1, baseY: hPeak + 20.1 });
    animated.push({ mesh: spireRing, kind: 'ring', speed: 0.9 });

    // Tapered organic wavy kelp frond geometry for bioluminescent Sunken City avenues (NOT plain rectangles!)
    const gKelpFrond = new THREE.PlaneGeometry(0.55, 1.0, 1, 6);
    gKelpFrond.translate(0, 0.5, 0);
    if (gKelpFrond.attributes && gKelpFrond.attributes.position) {
      const kp = gKelpFrond.attributes.position;
      for (let i = 0; i < kp.count; i++) {
        const y = kp.getY(i);
        const taper = (0.32 + 0.82 * Math.sin(y * Math.PI)) * (1 - y * 0.62);
        const wave = Math.sin(y * Math.PI * 2.5) * 0.16;
        kp.setXYZ(i, kp.getX(i) * taper + wave, y, kp.getZ(i));
      }
      gKelpFrond.computeVertexNormals();
    }

    // 7. THE SUNKEN UNDERWATER CITY (-14, 86): Coral Colonnade Arches, Bioluminescent Kelp & Sunken Star-Temple!
    const coralMats = [coralRose, coralAmber, coralViolet];
    // 5 monumental submerged coral-encrusted colonnade arches leading toward Sunken Star-Temple
    for (let a = 0; a < 5; a++) {
      const az = 62 + a * 6.0;
      const axL = -19.5;
      const axR = -8.5;
      const hL = heightAt(axL, az);
      const hR = heightAt(axR, az);
      const colH = 6.2;
      placeColumn(axL, az, colH, sunkenStone, true);
      placeColumn(axR, az, colH, sunkenStone, true);
      const archY = Math.min(hL, hR) + colH + 0.45;
      addShadowMesh(gArch, sunkenStone, -14, archY, az, 0, 0, 0, 5.5, 4.2, 1.5);

      // Multi-lobe branching reef coral clusters encrusting arch footings
      addShadowMesh(gCoralFan, coralMats[a % 3], axL + 0.8, hL + 0.55, az + 0.35, 0.25, a, 0.18, 0.95, 1.25, 0.52);
      addShadowMesh(gCoralFan, coralMats[(a + 2) % 3], axL + 0.35, hL + 0.38, az - 0.55, -0.2, a + 1.2, -0.22, 0.72, 0.88, 0.48);
      addShadowMesh(gCoralFan, coralMats[(a + 1) % 3], axR - 0.8, hR + 0.55, az - 0.35, -0.22, a + 1, 0.15, 0.92, 1.18, 0.52);
      const lanY = archY + 4.1;
      const lanOrb = addShadowMesh(gOrb, crystalAqua, -14, lanY, az, 0, 0, 0, 0.52, 0.52, 0.52);
      const lanGlow = makeGlow(0x5ef8ee, 3.6, 0.78);
      lanGlow.position.set(-14, lanY, az);
      group.add(lanGlow);
      animated.push({ mesh: lanOrb, kind: 'spin', speed: 1.0 + a * 0.15, baseY: lanY });

      // Tapered wavy bioluminescent kelp avenue spires flanking every arch!
      for (let side = -1; side <= 1; side += 2) {
        const kx = -14 + side * 8.8;
        const kz = az + 1.5;
        const kh = heightAt(kx, kz);
        const kTall = 5.4 + ((a * 3 + (side > 0 ? 1 : 0)) % 3) * 1.4;
        const kelpRibbon = addShadowMesh(gKelpFrond, kelpGlow, kx, kh, kz, 0, a * 0.7 + side, 0, 1.35, kTall, 1.35);
        const kelpBulb = makeGlow(0x4effcc, 2.2, 0.68);
        kelpBulb.position.set(kx, kh + kTall, kz);
        group.add(kelpBulb);
        animated.push({ mesh: kelpRibbon, kind: 'sway', speed: 1.4 + a * 0.2, phase: a + side });
      }
    }

    // Grand 3-Tiered Sunken Star-Temple at (-14, 94)
    const tx = -14;
    const tz = 94;
    const hT = heightAt(tx, tz);
    addShadowMesh(new THREE.CylinderGeometry(11.0, 12.2, 1.1, 16), sunkenStone, tx, hT + 0.5, tz);
    addCollider(tx, tz, 11.2, hT + 1.05, true);
    addShadowMesh(new THREE.CylinderGeometry(8.2, 9.2, 1.1, 16), sunkenStone, tx, hT + 1.6, tz);
    addCollider(tx, tz, 8.4, hT + 2.15, true);
    addShadowMesh(new THREE.CylinderGeometry(5.6, 6.4, 1.0, 16), sunkenStone, tx, hT + 2.65, tz);
    addCollider(tx, tz, 5.8, hT + 3.15, true);

    // 8 ringed temple columns + glowing Celestial Tide-Dome crown shining up through the turquoise bay!
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const cx = tx + Math.cos(ang) * 7.2;
      const cz = tz + Math.sin(ang) * 7.2;
      addShadowMesh(gCol, sunkenStone, cx, hT + 4.9, cz, 0, 0, 0, 0.95, 5.8, 0.95);
      addCollider(cx, cz, 0.62, hT + 7.8, true);
    }
    const domeRingA = addShadowMesh(gRing, crystalAqua, tx, hT + 9.2, tz, 0.25, 0, 0, 5.2, 5.2, 1.6);
    const domeRingB = addShadowMesh(gRing, goldMat, tx, hT + 9.2, tz, -0.35, 0.8, 0, 3.8, 3.8, 1.2);
    const domeGlow = makeGlow(0x66fff2, 7.5, 0.72);
    domeGlow.position.set(tx, hT + 9.4, tz);
    group.add(domeGlow);
    animated.push({ mesh: domeRingA, kind: 'ring', speed: 0.55 });
    animated.push({ mesh: domeRingB, kind: 'ring', speed: -0.85 });

    // 8. SIX OFF-PATH SECRET STAR SHRINES (Discoverable Braziers!)
    for (let i = 0; i < SECRETS.length; i++) {
      const sec = SECRETS[i];
      const sh = heightAt(sec.x, sec.z);
      const pedMat = sec.underwater ? sunkenStone : ruinStone;
      addShadowMesh(new THREE.CylinderGeometry(0.95, 1.2, 0.55, 8), pedMat, sec.x, sh + 0.22, sec.z);
      addShadowMesh(new THREE.CylinderGeometry(0.45, 0.58, 1.15, 8), pedMat, sec.x, sh + 0.95, sec.z);
      addCollider(sec.x, sec.z, 0.95, sh + 1.52, true);
      const gemMat = makeMat(null, sec.underwater ? 0x6ef6ee : 0xffd95a, 0.22, 0.28, {
        emissive: sec.underwater ? 0x165e64 : 0x5c3e06,
        emissiveIntensity: 0.55,
      });
      const gem = addShadowMesh(gOrb, gemMat, sec.x, sh + 2.15, sec.z, 0, 0, 0, 0.45, 0.68, 0.45);
      const halo = makeGlow(sec.underwater ? 0x70fff4 : 0xffe478, 1.6, 0.45);
      halo.position.set(sec.x, sh + 2.15, sec.z);
      group.add(halo);
      secretObjs.push({
        def: sec,
        x: sec.x,
        y: sh + 1.5,
        z: sec.z,
        discovered: false,
        gem,
        gemMat,
        halo,
        baseY: sh + 2.15,
      });
      animated.push({ mesh: gem, kind: 'spin', speed: 1.5, baseY: sh + 2.15 });
    }

    scene.add(group);
    return { group, relicObj, secretObjs, animated };
  }

  function animateLandmarks(built, dt, nowTime) {
    if (!built || !built.animated) return;
    const list = built.animated;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const m = item.mesh;
      if (!m || !m.visible) continue;
      if (item.kind === 'spin') {
        m.rotation.y += dt * item.speed;
        if (typeof item.baseY === 'number') {
          m.position.y = item.baseY + Math.sin(nowTime * 2.2 + i) * 0.16;
        }
      } else if (item.kind === 'ring') {
        m.rotation.y += dt * item.speed;
        m.rotation.z += dt * item.speed * 0.45;
      } else if (item.kind === 'sway') {
        m.rotation.z = Math.sin(nowTime * item.speed + (item.phase || 0)) * 0.16;
      }
    }
  }

  return {
    LIST,
    OUTER_WILDS,
    RELIC_SITE,
    TOTEM_ROUTE,
    SECRETS,
    TRAILS,
    getRegionById,
    regionAt,
    getElevationMod,
    getClimateMod,
    getTrailWeight,
    getNearbyColliders,
    clearLandmarkColliders,
    buildWorldLandmarks,
    animateLandmarks,
  };
})();
