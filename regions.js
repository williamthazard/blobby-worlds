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

  function hash2(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
    return s - Math.floor(s);
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

    const texRef = textures || (typeof Textures !== 'undefined' ? Textures : null);
    const shaderRef = typeof Shaders !== 'undefined' ? Shaders : null;
    const envRef = typeof Env !== 'undefined' ? Env : null;
    const sets = (texRef && texRef.sets) || {};
    const oakCardTex = (texRef && texRef.oakLeafCard) || null;
    const hasBufferGeo = typeof THREE.BufferGeometry === 'function' &&
      typeof THREE.BufferAttribute === 'function' &&
      typeof Float32Array === 'function' &&
      typeof Uint16Array === 'function';

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
    const coastalStone = makeMat('stone', 0x6f848c, 0.80);
    const sandstone = makeMat('rock', 0xd69666, 0.84);
    const frostStone = makeMat('stone', 0xc8d8e6, 0.72);
    const sunkenStone = makeMat('stone', 0x7c9ca4, 0.78);
    const woodMat = makeMat('bark', 0x9b7650, 0.90);
    const treeBark = makeMat('bark', 0x7a563a, 0.92);
    const ropeMat = makeMat(null, 0xaa8c60, 0.92, 0.02);
    const goldMat = makeMat(null, 0xf2c85b, 0.28, 0.72, { emissive: 0x452d04, emissiveIntensity: 0.4 });
    const runeGoldMat = makeMat(null, 0xffdc70, 0.24, 0.62, { emissive: 0xffb82c, emissiveIntensity: 0.75 });
    const runeAquaMat = makeMat(null, 0x78f8f0, 0.20, 0.45, { emissive: 0x26ded8, emissiveIntensity: 0.85 });
    const runeIceMat = makeMat(null, 0xbcf0ff, 0.20, 0.45, { emissive: 0x56c8ff, emissiveIntensity: 0.82 });
    const crystalGold = makeMat(null, 0xffe066, 0.16, 0.25, { emissive: 0xffb824, emissiveIntensity: 1.15 });
    const crystalAqua = makeMat(null, 0x76f6ef, 0.14, 0.22, { emissive: 0x26d8d4, emissiveIntensity: 1.35 });
    const crystalIce = makeMat(null, 0xb8eeff, 0.14, 0.20, { emissive: 0x52c4ff, emissiveIntensity: 1.1 });
    const coralRose = makeMat('rock', 0xf07a94, 0.68, 0.02, { emissive: 0x4a1628, emissiveIntensity: 0.35 });
    const coralAmber = makeMat('rock', 0xf59e56, 0.68, 0.02, { emissive: 0x4a2208, emissiveIntensity: 0.32 });
    const coralViolet = makeMat('rock', 0xa87ee8, 0.68, 0.02, { emissive: 0x2e1a52, emissiveIntensity: 0.38 });
    const kelpGlow = makeMat(null, 0x46e6b8, 0.42, 0.05, { emissive: 0x1eb892, emissiveIntensity: 0.85, side: THREE.DoubleSide });
    const lilypadMat = makeMat('leaves', 0x4b8f48, 0.46, 0.02, { side: THREE.DoubleSide });
    const lotusMat = makeMat(null, 0xf492b8, 0.42, 0.02, { emissive: 0x3b1224, emissiveIntensity: 0.24, side: THREE.DoubleSide });
    const oasisReedMat = makeMat('grass', 0x6ea64d, 0.82, 0.0, { side: THREE.DoubleSide });

    const greatTreeLeafMat = new THREE.MeshStandardMaterial({
      color: oakCardTex ? 0xffffff : 0x4b9445,
      map: oakCardTex,
      alphaTest: oakCardTex ? 0.40 : 0,
      side: THREE.DoubleSide,
      roughness: 0.76,
      metalness: 0.0,
      vertexColors: hasBufferGeo,
    });
    if (greatTreeLeafMat.color && typeof greatTreeLeafMat.color.convertSRGBToLinear === 'function') {
      greatTreeLeafMat.color.convertSRGBToLinear();
    }

    const oasisLeafMat = new THREE.MeshStandardMaterial({
      color: oakCardTex ? 0xffffff : 0x569e4a,
      map: oakCardTex,
      alphaTest: oakCardTex ? 0.40 : 0,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0.0,
      vertexColors: hasBufferGeo,
    });
    if (oasisLeafMat.color && typeof oasisLeafMat.color.convertSRGBToLinear === 'function') {
      oasisLeafMat.color.convertSRGBToLinear();
    }

    if (shaderRef) {
      if (typeof shaderRef.patchUnderwaterCaustics === 'function') {
        shaderRef.patchUnderwaterCaustics(sunkenStone, { intensity: 0.82 });
        shaderRef.patchUnderwaterCaustics(coralRose, { intensity: 0.56 });
        shaderRef.patchUnderwaterCaustics(coralAmber, { intensity: 0.56 });
        shaderRef.patchUnderwaterCaustics(coralViolet, { intensity: 0.56 });
      }
      if (typeof shaderRef.patchTreeWind === 'function') {
        shaderRef.patchTreeWind(greatTreeLeafMat, true);
        shaderRef.patchTreeWind(oasisLeafMat, true);
      }
      if (typeof shaderRef.patchFoliageReactive === 'function') {
        shaderRef.patchFoliageReactive(oasisReedMat, { amp: 0.14, heightScale: 1.15, useUvY: true });
      }
    }

    const makeGlow = (color, size, opacity) => {
      if (shaderRef && typeof shaderRef.createGlowSprite === 'function') {
        const sp = shaderRef.createGlowSprite(color, size, opacity, true);
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
      if (mat === sunkenStone) m.userData.sunkenStoneMesh = true;
      parent.add(m);
      return m;
    };

    const mountSwappableProp = (key, fallbackBuilder, x, y, z, ry, targetH, extraOpts) => {
      const holder = new THREE.Group();
      holder.position.set(x, y, z);
      holder.rotation.y = ry || 0;
      holder.userData.propKey = key;
      group.add(holder);

      const fallback = new THREE.Group();
      fallback.userData.isPlaceholder = true;
      holder.add(fallback);

      const isMat = extraOpts && (
        extraOpts.isMaterial ||
        (typeof THREE.MeshStandardMaterial === 'function' && (extraOpts instanceof THREE.MeshStandardMaterial))
      );
      const cfg = isMat ? { mat: extraOpts } : (extraOpts || {});

      if (typeof fallbackBuilder === 'function') {
        fallbackBuilder(fallback, cfg.mat || null);
      }

      if (envRef && typeof envRef.registerNodeSwap === 'function') {
        const swapOpts = {
          fallback,
          keepNonPlaceholders: true,
          castShadow: cfg.castShadow !== undefined ? cfg.castShadow : true,
          receiveShadow: cfg.receiveShadow !== undefined ? cfg.receiveShadow : true,
          deps: {
            THREE,
            Shaders: shaderRef,
            Textures: texRef,
          },
        };
        if (cfg.scale !== undefined) swapOpts.scale = cfg.scale;
        else swapOpts.targetHeight = targetH;
        if (cfg.caustics) swapOpts.caustics = true;
        envRef.registerNodeSwap(key, holder, swapOpts);
      }
      return holder;
    };

    // Botanical curved leaf-card geometry helpers (merged 1-draw-call crown when BufferGeometry exists, PlaneGeometry fallback otherwise)
    const buildCurvedLeafCardGeo = (w, h, bend, ox, oy, oz, yaw, pitch, roll, centerY, shadeR, shadeG, shadeB) => {
      const pos = new Float32Array(9 * 3);
      const norm = new Float32Array(9 * 3);
      const uv = new Float32Array(9 * 2);
      const col = new Float32Array(9 * 3);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cr = Math.cos(roll), sr = Math.sin(roll);

      let vi = 0;
      for (let iy = 0; iy < 3; iy++) {
        const v = iy * 0.5;
        const ly = (v - 0.5) * h;
        for (let ix = 0; ix < 3; ix++) {
          const u = ix * 0.5;
          const lx = (u - 0.5) * w;
          const dx = u - 0.5;
          const dy = v - 0.5;
          const lz = bend * (0.25 - dx * dx - dy * dy);

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

          const nx = wx;
          const ny = (wy - centerY) + 0.85;
          const nz = wz;
          const nl = Math.hypot(nx, ny, nz) || 1;
          norm[vi * 3] = nx / nl;
          norm[vi * 3 + 1] = ny / nl;
          norm[vi * 3 + 2] = nz / nl;

          uv[vi * 2] = u;
          uv[vi * 2 + 1] = v;

          const sunLift = 0.72 + 0.38 * smoothstep(centerY - 3.2, centerY + 3.6, wy);
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
    };

    const mergeBufferGeos = (geos) => {
      let totalVerts = 0;
      let totalIdx = 0;
      for (let i = 0; i < geos.length; i++) {
        totalVerts += geos[i].attributes.position.count;
        totalIdx += geos[i].index.count;
      }
      const pos = new Float32Array(totalVerts * 3);
      const norm = new Float32Array(totalVerts * 3);
      const uv = new Float32Array(totalVerts * 2);
      const col = new Float32Array(totalVerts * 3);
      const idx = new Uint16Array(totalIdx);
      let vOff = 0;
      let iOff = 0;
      for (let gIdx = 0; gIdx < geos.length; gIdx++) {
        const g = geos[gIdx];
        const vCount = g.attributes.position.count;
        pos.set(g.attributes.position.array, vOff * 3);
        norm.set(g.attributes.normal.array, vOff * 3);
        uv.set(g.attributes.uv.array, vOff * 2);
        col.set(g.attributes.color.array, vOff * 3);
        const gi = g.index.array;
        for (let k = 0; k < gi.length; k++) {
          idx[iOff + k] = gi[k] + vOff;
        }
        vOff += vCount;
        iOff += gi.length;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      return out;
    };

    const buildBotanicalCrown = (parent, tiers, mat, centerY, seedBase, tagGreatTree = false) => {
      if (hasBufferGeo) {
        const parts = [];
        let seed = seedBase;
        for (let t = 0; t < tiers.length; t++) {
          const rg = tiers[t];
          for (let i = 0; i < rg.count; i++) {
            seed++;
            const ang = (i / rg.count) * Math.PI * 2 + t * 0.53 + (hash2(seed * 3.1, t * 7.3) - 0.5) * 0.26;
            const rad = rg.rad * (0.85 + hash2(seed * 5.7, i * 2.3) * 0.28);
            const ox = (rg.ox || 0) + Math.cos(ang) * rad;
            const oz = (rg.oz || 0) + Math.sin(ang) * rad;
            const oy = rg.y + (hash2(i * 4.1, seed * 1.9) - 0.5) * (rg.yJitter || 0.65);
            const yaw = Math.atan2(ox - (rg.ox || 0), oz - (rg.oz || 0)) + (i % 2 === 0 ? 0.28 : -0.28);
            const pitch = rg.pitch + (hash2(seed, t) - 0.5) * 0.34;
            const roll = (hash2(t * 9.1, seed * 2.7) - 0.5) * 0.62;
            const tint = 0.84 + hash2(seed * 2.3, i * 6.1) * 0.26;
            parts.push(
              buildCurvedLeafCardGeo(
                rg.cardW, rg.cardH, rg.bend !== undefined ? rg.bend : 0.62,
                ox, oy, oz, yaw, pitch, roll, centerY,
                tint * (rg.rMul || 0.94), tint * (rg.gMul || 1.04), tint * (rg.bMul || 0.82)
              )
            );
          }
        }
        const m = new THREE.Mesh(mergeBufferGeos(parts), mat);
        m.castShadow = true;
        m.receiveShadow = true;
        if (tagGreatTree) {
          m.userData.isGreatTreeCanopy = true;
          m.userData.foliageTiers = tiers.length;
        }
        parent.add(m);
        return m;
      }

      let seed = seedBase;
      for (let t = 0; t < tiers.length; t++) {
        const rg = tiers[t];
        for (let i = 0; i < rg.count; i++) {
          seed++;
          const ang = (i / rg.count) * Math.PI * 2 + t * 0.53;
          const ox = (rg.ox || 0) + Math.cos(ang) * rg.rad;
          const oz = (rg.oz || 0) + Math.sin(ang) * rg.rad;
          const oy = rg.y;
          const yaw = Math.atan2(ox - (rg.ox || 0), oz - (rg.oz || 0));
          const cardGeo = new THREE.PlaneGeometry(rg.cardW, rg.cardH, 2, 2);
          const m = addShadowMesh(cardGeo, mat, ox, oy, oz, rg.pitch, yaw, 0, 1, 1, 1, parent);
          if (tagGreatTree) {
            m.userData.isGreatTreeCanopy = true;
            m.userData.foliageTiers = tiers.length;
          }
        }
      }
      return parent;
    };

    // Shared landmark geometries (minimizes allocations & shader switches)
    const gCol = new THREE.CylinderGeometry(0.42, 0.50, 1.0, 12);
    const gCap = new THREE.BoxGeometry(1.38, 0.30, 1.38);
    const gPlinth = new THREE.BoxGeometry(1.28, 0.28, 1.28);
    const gMolding = new THREE.CylinderGeometry(0.54, 0.68, 0.24, 12);
    const gBox = new THREE.BoxGeometry(1, 1, 1);
    const gRing = new THREE.TorusGeometry(1.0, 0.09, 8, 22);
    const gOrb = new THREE.OctahedronGeometry(0.55, 1);
    const gCoralFan = new THREE.OctahedronGeometry(0.62, 1);
    const gArch = new THREE.TorusGeometry(1.0, 0.22, 8, 18, Math.PI);
    const gPedShaft = new THREE.CylinderGeometry(0.46, 0.60, 1.0, 8);
    const gPedCrown = new THREE.CylinderGeometry(0.72, 0.48, 0.30, 8);
    const gPedBase = new THREE.CylinderGeometry(0.88, 1.08, 0.34, 8);

    const buildCarvedColumnLocal = (parent, height, mat, broken = false) => {
      addShadowMesh(gPlinth, mat, 0, 0.14, 0, 0, 0, 0, 1, 1, 1, parent);
      addShadowMesh(gMolding, mat, 0, 0.38, 0, 0, 0, 0, 1, 1, 1, parent);
      const topTrim = broken ? 0.24 : 0.46;
      const shaftH = Math.max(0.8, height - 0.48 - topTrim);
      addShadowMesh(gCol, mat, 0, 0.48 + shaftH * 0.5, 0, 0, 0, 0, 1, shaftH, 1, parent);
      if (broken) {
        addShadowMesh(gCol, mat, 0.04, 0.48 + shaftH + 0.12, -0.02, 0.22, 0.4, -0.16, 0.88, 0.28, 0.84, parent);
        addShadowMesh(gBox, mat, -0.62, 0.14, 0.46, 0.12, 0.45, 0.18, 0.38, 0.26, 0.34, parent);
      } else {
        addShadowMesh(gMolding, mat, 0, 0.48 + shaftH + 0.12, 0, Math.PI, 0, 0, 0.94, 0.9, 0.94, parent);
        addShadowMesh(gCap, mat, 0, 0.48 + shaftH + 0.34, 0, 0, 0, 0, 1, 1, 1, parent);
      }
    };

    const buildCarvedArchLocal = (parent, spanW, height, depth, mat) => {
      const halfSpan = spanW * 0.5;
      const colH = Math.max(2.6, height - halfSpan * 0.78);
      const leftHolder = new THREE.Group();
      leftHolder.position.set(-halfSpan, 0, 0);
      parent.add(leftHolder);
      buildCarvedColumnLocal(leftHolder, colH, mat, false);

      const rightHolder = new THREE.Group();
      rightHolder.position.set(halfSpan, 0, 0);
      parent.add(rightHolder);
      buildCarvedColumnLocal(rightHolder, colH, mat, false);

      const archH = Math.max(1.8, height - colH);
      addShadowMesh(gArch, mat, 0, colH - 0.06, 0, 0, 0, 0, halfSpan, archH * 0.88, depth, parent);
      addShadowMesh(gBox, mat, 0, colH + archH * 0.86, 0, 0, 0, 0, 0.92, 0.72, depth * 0.96, parent);
    };

    const buildCarvedPedestalLocal = (parent, height, mat) => {
      addShadowMesh(gPedBase, mat, 0, 0.17, 0, 0, 0, 0, 1, 1, 1, parent);
      const shaftH = Math.max(0.45, height - 0.64);
      addShadowMesh(gPedShaft, mat, 0, 0.34 + shaftH * 0.5, 0, 0, 0, 0, 1, shaftH, 1, parent);
      addShadowMesh(gPedCrown, mat, 0, 0.34 + shaftH + 0.15, 0, 0, 0, 0, 1, 1, 1, parent);
    };

    const addStarRuneCollar = (parent, x, y, z, radius, mat, speed = 2.0, phase = 0) => {
      const collarMat = mat && typeof mat.clone === 'function' ? mat.clone() : mat;
      const collar = addShadowMesh(gRing, collarMat, x, y, z, Math.PI * 0.5, 0, 0, radius, radius, 0.48, parent);
      collar.castShadow = false;
      collar.userData.isPlaceholder = false;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const rune = addShadowMesh(
          gOrb, collarMat,
          x + Math.cos(a) * radius, y, z + Math.sin(a) * radius,
          0, a, 0, 0.14, 0.22, 0.14, parent
        );
        rune.castShadow = false;
        rune.userData.isPlaceholder = false;
      }
      animated.push({
        mesh: collar,
        mat: collarMat,
        kind: 'pulse',
        speed,
        phase,
        baseEmissive: 0.55,
        pulseAmp: 0.60,
        baseScale: radius,
        baseScaleZ: 0.48,
      });
      return collar;
    };

    // 1. STAR SANCTUARY (0, 0): Compass Stone Plaza, Carved North Starlight Arch & Star-Lantern Pedestals
    const hSanc = heightAt(0, 0);
    addShadowMesh(new THREE.CylinderGeometry(7.2, 7.6, 0.42, 24), ruinStone, 0, hSanc - 0.14, 0);
    addCollider(0, 0, 7.35, hSanc + 0.07, true, true);
    addShadowMesh(new THREE.CylinderGeometry(4.6, 4.7, 0.46, 16), mossyStone, 0, hSanc - 0.13, 0);
    addCollider(0, 0, 4.65, hSanc + 0.10, true, true);
    // Flush inlaid golden compass ring + 8 cardinal rune bezel pips sitting level with inner dais top (hSanc + 0.10)
    addShadowMesh(gRing, goldMat, 0, hSanc + 0.068, 0, Math.PI * 0.5, 0, 0, 4.4, 4.4, 0.36);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      addShadowMesh(gBox, goldMat, Math.cos(a) * 4.4, hSanc + 0.078, Math.sin(a) * 4.4, 0, -a, 0, 0.32, 0.06, 0.16);
    }

    const sancArchHolder = mountSwappableProp(
      'ruin_arch',
      (fb) => buildCarvedArchLocal(fb, 7.2, 7.8, 1.3, ruinStone),
      0, hSanc, -7.8, 0, 7.8
    );
    addStarRuneCollar(sancArchHolder, -3.55, 0.52, 0, 0.68, runeGoldMat, 1.8, 0.2);
    addStarRuneCollar(sancArchHolder, 3.55, 0.52, 0, 0.68, runeGoldMat, 1.8, 1.4);
    addCollider(-3.6, -7.8, 0.68, hSanc + 0.35 + 4.4 + 0.32, true);
    addCollider(3.6, -7.8, 0.68, hSanc + 0.35 + 4.4 + 0.32, true);

    const sancCrystal = addShadowMesh(gOrb, crystalGold, 0, hSanc + 8.55, -7.8, 0, 0, 0, 0.75, 1.1, 0.75);
    const sancHalo = makeGlow(0xffe070, 2.8, 0.65);
    sancHalo.position.set(0, hSanc + 8.55, -7.8);
    group.add(sancHalo);
    animated.push({ mesh: sancCrystal, kind: 'spin', speed: 1.4, baseY: hSanc + 8.55 });

    const sancPeds = [[-4.8, -11.0], [4.8, -11.0]];
    for (let i = 0; i < sancPeds.length; i++) {
      const px = sancPeds[i][0];
      const pz = sancPeds[i][1];
      const py = heightAt(px, pz);
      const pedH = mountSwappableProp(
        'shrine_pedestal',
        (fb) => buildCarvedPedestalLocal(fb, 1.55, ruinStone),
        px, py, pz, i * Math.PI, 1.55
      );
      addStarRuneCollar(pedH, 0, 1.42, 0, 0.62, runeGoldMat, 2.1, i * 1.1);
      addCollider(px, pz, 0.85, py + 1.55, true);
      const spOrb = addShadowMesh(gOrb, crystalGold, px, py + 2.05, pz, 0, 0, 0, 0.32, 0.48, 0.32);
      const spGlow = makeGlow(0xffe070, 1.5, 0.48);
      spGlow.position.set(px, py + 2.05, pz);
      group.add(spGlow);
      animated.push({ mesh: spOrb, kind: 'spin', speed: 1.3, baseY: py + 2.05 });
    }

    // 2. SUNLIT RUINS (68, -10): Carved Colonnade Avenue, Entrance Arch & 14u Sun-Dial Obelisk
    const hGateRuins = heightAt(50, -6);
    mountSwappableProp(
      'ruin_arch',
      (fb) => buildCarvedArchLocal(fb, 6.2, 6.4, 1.2, mossyStone),
      50, hGateRuins, -6, Math.PI * 0.5, 6.4
    );
    addCollider(50, -9.1, 0.68, hGateRuins + 4.0, true);
    addCollider(50, -2.9, 0.68, hGateRuins + 4.0, true);

    const ruinsCols = [
      [54, -14, 4.6], [54, -2, 3.2],
      [60, -15, 5.2], [60, -3, 4.8],
      [66, -18, 5.6], [66, -2, 2.4],
      [74, -17, 4.8], [74, -3, 5.2],
    ];
    for (let i = 0; i < ruinsCols.length; i++) {
      const rc = ruinsCols[i];
      const y0 = heightAt(rc[0], rc[1]);
      const broken = rc[2] < 4.2;
      const mat = i % 2 === 0 ? ruinStone : mossyStone;
      mountSwappableProp(
        broken ? 'ruin_column_broken' : 'ruin_column',
        (fb) => buildCarvedColumnLocal(fb, rc[2] + 0.35, mat, broken),
        rc[0], y0, rc[1], i * 0.7, rc[2] + 0.35
      );
      addCollider(rc[0], rc[1], 0.68, y0 + 0.35 + rc[2] + 0.32, true);
    }
    // Ruined stone lintel spanning intact column pair
    const hLintel = Math.min(heightAt(60, -15), heightAt(66, -18)) + 5.4;
    addShadowMesh(gBox, mossyStone, 63, hLintel, -16.5, 0, 0.46, 0, 7.6, 0.65, 1.15);

    // Towering 14u Sun-Dial Obelisk skyline landmark at (70, -10) — floating rings orbit cleanly ABOVE stone tip (hOb + 14.15)!
    const hOb = heightAt(70, -10);
    addShadowMesh(new THREE.CylinderGeometry(3.4, 3.9, 0.9, 12), ruinStone, 70, hOb + 0.4, -10);
    addCollider(70, -10, 3.6, hOb + 0.85, true);
    addShadowMesh(new THREE.CylinderGeometry(2.3, 2.7, 0.55, 8), mossyStone, 70, hOb + 1.05, -10);
    addShadowMesh(new THREE.CylinderGeometry(0.55, 1.35, 13.5, 6), ruinStone, 70, hOb + 7.4, -10);
    addCollider(70, -10, 1.35, hOb + 14.2, false);
    addStarRuneCollar(group, 70, hOb + 2.15, -10, 1.38, runeGoldMat, 1.9, 0.5);
    addStarRuneCollar(group, 70, hOb + 13.1, -10, 0.76, runeGoldMat, 2.2, 1.7);
    const obCrystal = addShadowMesh(gOrb, crystalGold, 70, hOb + 16.65, -10, 0, 0, 0, 0.78, 1.15, 0.78);
    const obRingA = addShadowMesh(gRing, goldMat, 70, hOb + 16.65, -10, 0.4, 0, 0, 2.15, 2.15, 1.15);
    const obRingB = addShadowMesh(gRing, goldMat, 70, hOb + 16.65, -10, -0.5, 0.9, 0, 1.55, 1.55, 1.05);
    const obGlow = makeGlow(0xffe066, 4.4, 0.72);
    obGlow.position.set(70, hOb + 16.65, -10);
    group.add(obGlow);
    animated.push({ mesh: obCrystal, kind: 'spin', speed: 1.2, baseY: hOb + 16.65 });
    animated.push({ mesh: obRingA, kind: 'ring', speed: 0.75 });
    animated.push({ mesh: obRingB, kind: 'ring', speed: -1.1 });

    // 3. WHISPERING DEEP FOREST (62, -78): 20u Hollow Great-Tree Shrine with Lush Botanical Leaf-Card Canopy!
    const hTree = heightAt(62, -78);
    // Walk-in mossy stone hearth ring inside the hollow shrine
    addShadowMesh(new THREE.CylinderGeometry(2.1, 2.35, 0.24, 12), mossyStone, 62, hTree + 0.08, -78);
    addStarRuneCollar(group, 62, hTree + 0.22, -78, 1.85, runeGoldMat, 1.5, 0.3);

    // 4 massive buttress root pillars + mossy flared root collars leaving a dramatic walk-in hollow archway!
    const buttressAngles = [0.65, 2.45, 3.85, 5.65];
    for (let i = 0; i < buttressAngles.length; i++) {
      const a = buttressAngles[i];
      const bx = 62 + Math.cos(a) * 2.55;
      const bz = -78 + Math.sin(a) * 2.55;
      addShadowMesh(new THREE.CylinderGeometry(0.75, 1.38, 8.8, 8), treeBark, bx, hTree + 4.2, bz, 0, a, 0);
      addShadowMesh(new THREE.CylinderGeometry(1.15, 1.65, 1.15, 8), mossyStone, bx, hTree + 0.55, bz, 0, a + 0.3, 0);
      addCollider(bx, bz, 1.15, hTree + 8.6, false);
    }

    // Towering upper trunk + gnarled primary & secondary spreading limbs
    addShadowMesh(new THREE.CylinderGeometry(1.65, 2.45, 7.8, 10), treeBark, 62, hTree + 10.6, -78);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.25;
      const lx = 62 + Math.cos(a) * 4.6;
      const lz = -78 + Math.sin(a) * 4.6;
      addShadowMesh(
        new THREE.CylinderGeometry(0.36, 0.88, 6.6, 7),
        treeBark,
        lx * 0.5 + 31, hTree + 12.8, lz * 0.5 - 39,
        Math.sin(a) * 0.68, 0, -Math.cos(a) * 0.68
      );
      const a2 = a + 0.42;
      const bx2 = 62 + Math.cos(a2) * 5.6;
      const bz2 = -78 + Math.sin(a2) * 5.6;
      addShadowMesh(
        new THREE.CylinderGeometry(0.22, 0.48, 5.0, 6),
        treeBark,
        bx2 * 0.5 + 31, hTree + 14.9, bz2 * 0.5 - 39,
        Math.sin(a2) * 0.52, 0, -Math.cos(a2) * 0.52
      );
    }

    // Lush 4-Tier Botanical Leaf-Card Crown centered at (62, hTree, -78) (zero DodecahedronGeometry!)
    const greatTreeCanopyRoot = new THREE.Group();
    greatTreeCanopyRoot.position.set(62, hTree, -78);
    greatTreeCanopyRoot.userData.isGreatTreeCanopy = true;
    group.add(greatTreeCanopyRoot);

    const greatTreeTiers = [
      { count: 14, rad: 6.2, y: 12.6, cardW: 4.6, cardH: 4.2, pitch: 0.48, yJitter: 0.7, bend: 0.72, rMul: 0.86, gMul: 1.00, bMul: 0.76 },
      { count: 14, rad: 5.1, y: 14.8, cardW: 4.8, cardH: 4.4, pitch: 0.14, yJitter: 0.75, bend: 0.76, rMul: 0.94, gMul: 1.05, bMul: 0.82 },
      { count: 10, rad: 3.4, y: 17.0, cardW: 4.4, cardH: 4.0, pitch: -0.38, yJitter: 0.65, bend: 0.68, rMul: 1.00, gMul: 1.08, bMul: 0.84 },
      { count: 7,  rad: 1.4, y: 19.0, cardW: 3.8, cardH: 3.5, pitch: -0.96, yJitter: 0.55, bend: 0.60, rMul: 1.06, gMul: 1.10, bMul: 0.86 },
    ];
    buildBotanicalCrown(greatTreeCanopyRoot, greatTreeTiers, greatTreeLeafMat, 15.6, 700, true);

    // Central spirit lantern + 5 hanging glowing spirit wisps suspended under the boughs
    const treeLantern = addShadowMesh(gOrb, crystalGold, 62, hTree + 3.9, -78, 0, 0, 0, 0.65, 0.85, 0.65);
    const treeGlow = makeGlow(0x9fffa8, 3.6, 0.75);
    treeGlow.position.set(62, hTree + 3.9, -78);
    group.add(treeGlow);
    animated.push({ mesh: treeLantern, kind: 'spin', speed: 1.1, baseY: hTree + 3.9 });

    for (let w = 0; w < 5; w++) {
      const wa = (w / 5) * Math.PI * 2 + 0.45;
      const wr = 3.6 + (w % 2) * 1.3;
      const wx = 62 + Math.cos(wa) * wr;
      const wz = -78 + Math.sin(wa) * wr;
      const wy = hTree + 7.2 + (w % 3) * 0.9;
      addShadowMesh(gCol, treeBark, wx, wy + 2.3, wz, 0, 0, 0, 0.06, 4.4, 0.06);
      const wispMat = w % 2 === 0 ? crystalAqua : crystalGold;
      const wisp = addShadowMesh(gOrb, wispMat, wx, wy, wz, 0, 0, 0, 0.24, 0.36, 0.24);
      const wGlow = makeGlow(w % 2 === 0 ? 0x8effd8 : 0xffe885, 2.0, 0.72);
      wGlow.position.set(wx, wy, wz);
      group.add(wGlow);
      animated.push({ mesh: wisp, kind: 'spin', speed: 1.3 + w * 0.15, baseY: wy });
    }

    // Ancient broken ruin waypoints framing the Whispering Deep Forest glade approach
    const forestWaypoints = [[52.5, -72.5], [65.5, -66.5]];
    for (let i = 0; i < forestWaypoints.length; i++) {
      const fx = forestWaypoints[i][0];
      const fz = forestWaypoints[i][1];
      const fy = heightAt(fx, fz);
      mountSwappableProp(
        'ruin_column_broken',
        (fb) => buildCarvedColumnLocal(fb, 2.8, mossyStone, true),
        fx, fy, fz, i * 1.4, 2.8
      );
      addCollider(fx, fz, 0.68, fy + 2.8, true);
    }

    // 4. TWILIGHT BASALT COAST: Weathered Lake Hylia Wooden Pier (Bollards & Rope Trim) + Tidecaller's Arch & Pearl
    const pierAngle = Math.atan2(26 - 36, 76 - 60);
    const pierDeckY = 1.15;
    const rxEdge = Math.cos(pierAngle) * 1.45;
    const rzEdge = -Math.sin(pierAngle) * 1.45;
    const fwdX = Math.sin(pierAngle);
    const fwdZ = Math.cos(pierAngle);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const px = lerp(36, 26, t);
      const pz = lerp(60, 76, t);
      addShadowMesh(gBox, woodMat, px, pierDeckY - 0.14, pz, 0, pierAngle, 0, 3.4, 0.28, 3.6);
      addCollider(px, pz, 1.85, pierDeckY, true);
      // Submerged support pilings + carved mooring bollards above deck
      addShadowMesh(gCol, treeBark, px + rxEdge, pierDeckY - 2.4, pz + rzEdge, 0, 0, 0, 0.34, 5.4, 0.34);
      addShadowMesh(gCol, treeBark, px - rxEdge, pierDeckY - 2.4, pz - rzEdge, 0, 0, 0, 0.34, 5.4, 0.34);
      addShadowMesh(gCol, woodMat, px + rxEdge, pierDeckY + 0.42, pz + rzEdge, 0, 0, 0, 0.30, 0.86, 0.30);
      addShadowMesh(gCol, woodMat, px - rxEdge, pierDeckY + 0.42, pz - rzEdge, 0, 0, 0, 0.30, 0.86, 0.30);
      addShadowMesh(gRing, ropeMat, px + rxEdge, pierDeckY + 0.72, pz + rzEdge, Math.PI * 0.5, 0, 0, 0.19, 0.19, 0.36);
      addShadowMesh(gRing, ropeMat, px - rxEdge, pierDeckY + 0.72, pz - rzEdge, Math.PI * 0.5, 0, 0, 0.19, 0.19, 0.36);

      if (i < 5) {
        const tNext = (i + 1) / 5;
        const nx = lerp(36, 26, tNext);
        const nz = lerp(60, 76, tNext);
        const mx = (px + nx) * 0.5;
        const mz = (pz + nz) * 0.5;
        const segLen = Math.hypot(nx - px, nz - pz);
        addShadowMesh(gBox, ropeMat, mx + rxEdge, pierDeckY + 0.62, mz + rzEdge, 0, pierAngle, 0, 0.08, 0.08, segLen);
        addShadowMesh(gBox, ropeMat, mx - rxEdge, pierDeckY + 0.62, mz - rzEdge, 0, pierAngle, 0, 0.08, 0.08, segLen);
      }
    }
    // Warm hanging lantern post + bracket at the open-water pier end
    addShadowMesh(gCol, treeBark, 27.3, pierDeckY + 1.5, 76.6, 0, 0, 0, 0.24, 3.1, 0.24);
    addShadowMesh(gBox, woodMat, 27.3 + fwdX * 0.3, pierDeckY + 2.95, 76.6 + fwdZ * 0.3, 0, pierAngle, 0, 0.18, 0.16, 0.85);
    const pierGlow = makeGlow(0xffd478, 2.4, 0.85);
    pierGlow.position.set(27.3, pierDeckY + 3.05, 76.6);
    group.add(pierGlow);

    // Tidecaller's Arch on dramatic coastal cliff headland (64, 70) housing Tidecaller's Pearl!
    const rx = RELIC_SITE.x;
    const rz = RELIC_SITE.z;
    const hRelic = heightAt(rx, rz);
    addShadowMesh(new THREE.CylinderGeometry(4.2, 4.8, 0.8, 12), coastalStone, rx, hRelic + 0.3, rz);
    addCollider(rx, rz, 4.4, hRelic + 0.7, true);
    const archYaw = Math.atan2(2.4, 6.0);
    const tideArchH = mountSwappableProp(
      'ruin_arch',
      (fb) => buildCarvedArchLocal(fb, 6.46, 8.2, 1.35, coastalStone),
      rx, hRelic + 0.65, rz, -archYaw, 8.2
    );
    addStarRuneCollar(tideArchH, -3.15, 0.55, 0, 0.72, runeAquaMat, 2.0, 0.1);
    addStarRuneCollar(tideArchH, 3.15, 0.55, 0, 0.72, runeAquaMat, 2.0, 1.3);
    addCollider(rx - 3.0, rz - 1.2, 0.68, hRelic + 0.35 + 5.4 + 0.32, true);
    addCollider(rx + 3.0, rz + 1.2, 0.68, hRelic + 0.35 + 5.4 + 0.32, true);

    // Interactive Tidecaller's Pearl Pedestal (floating pearl + ring orbit cleanly ABOVE stone pedestal top at hRelic + 2.03!)
    const pearlPedH = mountSwappableProp(
      'shrine_pedestal',
      (fb) => buildCarvedPedestalLocal(fb, 1.38, coastalStone),
      rx, hRelic + 0.65, rz, -archYaw, 1.38
    );
    addStarRuneCollar(pearlPedH, 0, 1.26, 0, 0.68, runeAquaMat, 2.2, 0.8);
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

    // 5. CANYON OASIS (-86, -14): Natural Sandstone Arch, Sun-Gate & Palm / Willow / Lilypad Spring Grove
    const hArch = heightAt(-66, -14);
    addShadowMesh(new THREE.CylinderGeometry(1.7, 2.6, 11.5, 8), sandstone, -66, hArch + 5.2, -23.5);
    addCollider(-66, -23.5, 2.3, hArch + 11.0, false);
    addShadowMesh(new THREE.CylinderGeometry(1.7, 2.6, 11.5, 8), sandstone, -66, hArch + 5.2, -4.5);
    addCollider(-66, -4.5, 2.3, hArch + 11.0, false);
    addShadowMesh(gArch, sandstone, -66, hArch + 10.6, -14, 0, Math.PI * 0.5, 0, 9.6, 6.2, 5.2);

    // Sandstone Sun-Gate at (-88, -14) with carved plinths & glowing Star-Rune collars
    const hGate = heightAt(-86, -14);
    addShadowMesh(new THREE.BoxGeometry(2.8, 0.7, 2.8), sandstone, -88, hGate + 0.35, -19.5);
    addShadowMesh(new THREE.BoxGeometry(2.2, 9.6, 2.2), sandstone, -88, hGate + 4.6, -19.5);
    addCollider(-88, -19.5, 1.45, hGate + 9.4, false);
    addShadowMesh(new THREE.BoxGeometry(2.8, 0.7, 2.8), sandstone, -88, hGate + 0.35, -8.5);
    addShadowMesh(new THREE.BoxGeometry(2.2, 9.6, 2.2), sandstone, -88, hGate + 4.6, -8.5);
    addCollider(-88, -8.5, 1.45, hGate + 9.4, false);
    addShadowMesh(gBox, sandstone, -88, hGate + 9.8, -14, 0, 0, 0, 2.6, 1.5, 13.8);
    addStarRuneCollar(group, -88, hGate + 1.85, -19.5, 1.55, runeGoldMat, 1.8, 0.2);
    addStarRuneCollar(group, -88, hGate + 1.85, -8.5, 1.55, runeGoldMat, 1.8, 1.1);
    const sunDisc = addShadowMesh(gRing, crystalGold, -88, hGate + 12.9, -14, 0, Math.PI * 0.5, 0, 1.95, 1.95, 1.3);
    animated.push({ mesh: sunDisc, kind: 'ring', speed: 0.65 });

    // Oasis Palm & Weeping Willow Spring Grove ringing (-76, -14)
    const oasisPalms = [
      [-78.5, -19.8, 8.6, 0.4],
      [-69.6, -18.5, 8.1, 1.8],
      [-80.8, -9.2,  8.8, 3.1],
      [-70.0, -9.0,  7.9, 4.7],
    ];
    for (let i = 0; i < oasisPalms.length; i++) {
      const op = oasisPalms[i];
      const oy = heightAt(op[0], op[1]);
      mountSwappableProp(
        'palm_tree',
        (fb) => {
          const segs = 5;
          const trunkH = op[2] * 0.84;
          for (let s = 0; s < segs; s++) {
            const t = (s + 0.5) / segs;
            const lean = Math.sin(t * Math.PI * 0.65) * 0.55;
            addShadowMesh(gCol, treeBark, lean, t * trunkH, 0, 0, 0, -0.14 * (1 - t * 0.4), 0.42 - t * 0.16, trunkH / segs + 0.12, 0.42 - t * 0.16, fb);
          }
          buildBotanicalCrown(
            fb,
            [{ count: 8, rad: 1.55, ox: 0.48, y: trunkH + 0.1, cardW: 1.4, cardH: 3.1, pitch: 1.15, yJitter: 0.32, bend: 0.55, rMul: 0.94, gMul: 1.04, bMul: 0.74 }],
            oasisLeafMat,
            trunkH,
            1100 + i * 30
          );
        },
        op[0], oy, op[1], op[3], op[2]
      );
      addCollider(op[0], op[1], 0.52, oy + op[2] * 0.7, false);
    }

    const oasisWillows = [
      [-73.0, -19.8, 8.8, 0.9],
      [-74.2, -8.2,  8.5, 2.5],
      [-81.2, -18.6, 9.1, 4.1],
    ];
    for (let i = 0; i < oasisWillows.length; i++) {
      const ow = oasisWillows[i];
      const oy = heightAt(ow[0], ow[1]);
      mountSwappableProp(
        'willow_tree',
        (fb) => {
          const trunkH = ow[2] * 0.58;
          addShadowMesh(gCol, treeBark, 0, trunkH * 0.5, 0, 0, 0, 0, 0.72, trunkH, 0.72, fb);
          buildBotanicalCrown(
            fb,
            [
              { count: 10, rad: 2.35, y: trunkH + 1.1, cardW: 2.6, cardH: 2.4, pitch: 0.34, yJitter: 0.4, bend: 0.5, rMul: 0.88, gMul: 1.02, bMul: 0.82 },
              { count: 10, rad: 2.55, y: trunkH - 0.7, cardW: 1.4, cardH: 3.2, pitch: 0.16, yJitter: 0.4, bend: 0.35, rMul: 0.86, gMul: 1.00, bMul: 0.80 },
            ],
            oasisLeafMat,
            trunkH + 0.5,
            1400 + i * 40
          );
        },
        ow[0], oy, ow[1], ow[3], ow[2]
      );
      addCollider(ow[0], ow[1], 0.62, oy + ow[2] * 0.55, false);
    }

    // Floating Lilypads & Lotus blossoms on the Canyon Oasis emerald spring (WATER_Y = 0)
    const oasisLilies = [
      [-76.5, -15.6, 0.20, 0.3],
      [-74.0, -13.2, 0.24, 1.4],
      [-78.8, -12.6, 0.18, 2.5],
      [-73.2, -16.2, 0.22, 3.7],
      [-77.4, -10.8, 0.19, 4.8],
      [-79.2, -16.8, 0.21, 5.5],
    ];
    for (let i = 0; i < oasisLilies.length; i++) {
      const ol = oasisLilies[i];
      mountSwappableProp(
        'lilypad',
        (fb) => {
          const diam = ol[2] * 5.2;
          addShadowMesh(new THREE.CylinderGeometry(diam * 0.5, diam * 0.48, 0.05, 14), lilypadMat, 0, 0.025, 0, 0, 0, 0, 1, 1, 1, fb);
          if (i % 2 === 0) {
            addShadowMesh(gOrb, lotusMat, 0.1, 0.11, 0, 0, 0, 0, 0.18, 0.14, 0.18, fb);
          }
        },
        ol[0], 0.03, ol[1], ol[3], ol[2],
        { castShadow: false }
      );
    }

    // Oasis shoreline reactive reed tufts
    const oasisReeds = [
      [-73.0, -19.0], [-80.5, -18.0], [-70.0, -17.0],
      [-70.0, -11.0], [-82.0, -11.0], [-79.0, -9.0],
    ];
    const gReedBlade = new THREE.PlaneGeometry(0.28, 1.15, 1, 3);
    gReedBlade.translate(0, 0.575, 0);
    for (let i = 0; i < oasisReeds.length; i++) {
      const rx0 = oasisReeds[i][0];
      const rz0 = oasisReeds[i][1];
      const ry0 = heightAt(rx0, rz0);
      for (let b = 0; b < 3; b++) {
        addShadowMesh(gReedBlade, oasisReedMat, rx0 + (b - 1) * 0.22, ry0, rz0 + (b % 2) * 0.18, 0.08 * b, i * 1.1 + b * 0.9, 0.05 * (b - 1));
      }
    }

    // 6. FROSTPEAK SHRINES (-68, -88): Carved Alpine Stairs, Waypoint Pillars & 18u Summit Star-Spire
    for (let s = 0; s < 5; s++) {
      const sx = lerp(-60, -65, s / 4);
      const sz = lerp(-76, -83, s / 4);
      const sy = heightAt(sx, sz);
      addShadowMesh(gBox, frostStone, sx, sy + 0.15, sz, 0, 0.64, 0, 4.6, 0.5, 1.8);
      addShadowMesh(gBox, frostStone, sx - 1.95, sy + 0.42, sz + 1.35, 0, 0.64, 0, 0.48, 0.36, 1.75);
      addShadowMesh(gBox, frostStone, sx + 1.95, sy + 0.42, sz - 1.35, 0, 0.64, 0, 0.48, 0.36, 1.75);
      addCollider(sx, sz, 2.0, sy + 0.4, true);
    }

    const frostMarkers = [
      { key: 'ruin_column_broken', x: -54.5, z: -75.5, h: 3.1, ry: 0.4 },
      { key: 'ruin_column_broken', x: -63.5, z: -70.5, h: 2.7, ry: 1.9 },
      { key: 'ruin_column', x: -61.8, z: -84.2, h: 4.8, ry: 0.2 },
      { key: 'ruin_column', x: -73.0, z: -82.0, h: 5.0, ry: 1.1 },
    ];
    for (let i = 0; i < frostMarkers.length; i++) {
      const fm = frostMarkers[i];
      const fy = heightAt(fm.x, fm.z);
      const broken = fm.key === 'ruin_column_broken';
      mountSwappableProp(
        fm.key,
        (fb) => buildCarvedColumnLocal(fb, fm.h, frostStone, broken),
        fm.x, fy, fm.z, fm.ry, fm.h
      );
      addCollider(fm.x, fm.z, 0.68, fy + fm.h, true);
    }

    const hPeak = heightAt(-68, -88);
    addShadowMesh(new THREE.CylinderGeometry(4.4, 5.2, 1.1, 12), frostStone, -68, hPeak + 0.4, -88);
    addCollider(-68, -88, 4.8, hPeak + 0.95, true);
    addShadowMesh(new THREE.CylinderGeometry(2.6, 3.2, 0.65, 8), frostStone, -68, hPeak + 1.18, -88);
    addShadowMesh(new THREE.CylinderGeometry(0.45, 1.45, 16.5, 6), frostStone, -68, hPeak + 9.1, -88);
    addCollider(-68, -88, 1.5, hPeak + 17.4, false);
    addStarRuneCollar(group, -68, hPeak + 2.3, -88, 1.48, runeIceMat, 1.7, 0.6);
    addStarRuneCollar(group, -68, hPeak + 16.4, -88, 0.72, runeIceMat, 2.3, 1.9);
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

    // 7. THE SUNKEN UNDERWATER CITY (-14, 86): Caustic-Lit Coral Colonnade Arches, Broken Ruins & Sunken Star-Temple!
    const coralMats = [coralRose, coralAmber, coralViolet];
    for (let a = 0; a < 5; a++) {
      const az = 62 + a * 6.0;
      const axL = -19.5;
      const axR = -8.5;
      const hL = heightAt(axL, az);
      const hR = heightAt(axR, az);
      const archBaseY = Math.min(hL, hR);
      const colH = 6.2;

      mountSwappableProp(
        'ruin_arch',
        (fb) => buildCarvedArchLocal(fb, 11.0, 10.6, 1.5, sunkenStone),
        -14, archBaseY, az, 0, 10.6,
        { caustics: true }
      );
      addCollider(axL, az, 0.68, hL + 0.35 + colH + 0.32, true);
      addCollider(axR, az, 0.68, hR + 0.35 + colH + 0.32, true);

      // Multi-lobe caustic-lit branching reef coral clusters encrusting arch footings
      addShadowMesh(gCoralFan, coralMats[a % 3], axL + 0.8, hL + 0.55, az + 0.35, 0.25, a, 0.18, 0.95, 1.25, 0.52);
      addShadowMesh(gCoralFan, coralMats[(a + 2) % 3], axL + 0.35, hL + 0.38, az - 0.55, -0.2, a + 1.2, -0.22, 0.72, 0.88, 0.48);
      addShadowMesh(gCoralFan, coralMats[(a + 1) % 3], axR - 0.8, hR + 0.55, az - 0.35, -0.22, a + 1, 0.15, 0.92, 1.18, 0.52);
      const lanY = archBaseY + 11.25;
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

    // Flanking submerged broken ruins along the sunken avenue
    const sunkenBroken = [
      [-24, 72, 3.1, 0.4],
      [-4,  76, 2.6, 1.7],
      [-25, 84, 3.4, 2.8],
      [-3,  88, 2.9, 4.0],
    ];
    for (let i = 0; i < sunkenBroken.length; i++) {
      const sb = sunkenBroken[i];
      const sy = heightAt(sb[0], sb[1]);
      mountSwappableProp(
        'ruin_column_broken',
        (fb) => buildCarvedColumnLocal(fb, sb[2], sunkenStone, true),
        sb[0], sy, sb[1], sb[3], sb[2],
        { caustics: true }
      );
      addCollider(sb[0], sb[1], 0.68, sy + sb[2], true);
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

    // Flanking caustic-lit temple altar pedestal on upper terrace (clear of Totem 5 at (-14, 94) and ringed columns at r=7.2)
    const altarX = tx;
    const altarZ = tz + 3.6;
    const templePedH = mountSwappableProp(
      'shrine_pedestal',
      (fb) => buildCarvedPedestalLocal(fb, 1.45, sunkenStone),
      altarX, hT + 3.15, altarZ, Math.PI, 1.45,
      { caustics: true }
    );
    addStarRuneCollar(templePedH, 0, 1.34, 0, 0.68, runeAquaMat, 2.1, 0.3);
    addCollider(altarX, altarZ, 0.92, hT + 3.15 + 1.45, true);

    // 8 ringed temple columns + glowing Celestial Tide-Dome crown shining up through the turquoise bay!
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const cx = tx + Math.cos(ang) * 7.2;
      const cz = tz + Math.sin(ang) * 7.2;
      mountSwappableProp(
        'ruin_column',
        (fb) => buildCarvedColumnLocal(fb, 5.8, sunkenStone, false),
        cx, hT + 2.0, cz, ang, 5.8,
        { caustics: true }
      );
      addCollider(cx, cz, 0.62, hT + 7.8, true);
    }
    const domeRingA = addShadowMesh(gRing, crystalAqua, tx, hT + 9.2, tz, 0.25, 0, 0, 5.2, 5.2, 1.6);
    const domeRingB = addShadowMesh(gRing, goldMat, tx, hT + 9.2, tz, -0.35, 0.8, 0, 3.8, 3.8, 1.2);
    const domeGlow = makeGlow(0x66fff2, 7.5, 0.72);
    domeGlow.position.set(tx, hT + 9.4, tz);
    group.add(domeGlow);
    animated.push({ mesh: domeRingA, kind: 'ring', speed: 0.55 });
    animated.push({ mesh: domeRingB, kind: 'ring', speed: -0.85 });

    // 8. SIX OFF-PATH SECRET STAR SHRINES (Carved Brazier Pedestals + Pulsing Star-Rune Collars!)
    for (let i = 0; i < SECRETS.length; i++) {
      const sec = SECRETS[i];
      const sh = heightAt(sec.x, sec.z);
      const pedMat = sec.underwater
        ? sunkenStone
        : (sec.regionId === 'canyonOasis' ? sandstone : (sec.regionId === 'frostpeak' ? frostStone : ruinStone));
      const collarMat = sec.underwater ? runeAquaMat : (sec.regionId === 'frostpeak' ? runeIceMat : runeGoldMat);

      const secHolder = mountSwappableProp(
        'shrine_pedestal',
        (fb) => buildCarvedPedestalLocal(fb, 1.52, pedMat),
        sec.x, sh, sec.z, i * 0.85, 1.52,
        { caustics: !!sec.underwater }
      );
      addStarRuneCollar(secHolder, 0, 1.40, 0, 0.66, collarMat, 2.2, i * 0.9);
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
      } else if (item.kind === 'pulse') {
        const wave = 0.5 + 0.5 * Math.sin(nowTime * (item.speed || 2.0) + (item.phase !== undefined ? item.phase : i));
        if (item.mat && typeof item.mat.emissiveIntensity === 'number') {
          item.mat.emissiveIntensity =
            (item.baseEmissive !== undefined ? item.baseEmissive : 0.55) +
            wave * (item.pulseAmp !== undefined ? item.pulseAmp : 0.60);
        }
        if (typeof item.baseScale === 'number' && m.scale && typeof m.scale.set === 'function') {
          const s = item.baseScale * (1 + (wave - 0.5) * 0.04);
          m.scale.set(s, s, item.baseScaleZ !== undefined ? item.baseScaleZ : 0.48);
        }
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
