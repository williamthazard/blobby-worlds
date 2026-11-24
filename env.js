// ============================================================
// env.js - Dual-Mode Environment Prop Loader, Celestial Rig,
//          Cohesive Wind Field, Volumetric Clouds, Starfield,
//          Underwater Sunbeams & Ambient Biome Motes
//
// Consumes globals: THREE, Shaders, Textures, Regions (optional),
//                   window.__ENV_GLB_B64__ (in file:// mode)
// Exports global:   Env
// ============================================================

const Env = (() => {
  'use strict';

  // ---------- 0. Constants, Quality Table & Pre-allocated Scratch Math ----------

  const PROP_KEYS = [
    'oak_tree',
    'birch_tree',
    'pine_tree',
    'pine_snow',
    'willow_tree',
    'palm_tree',
    'cactus_flower',
    'bush_berry',
    'boulder_moss',
    'boulder_rock',
    'fallen_log',
    'tree_stump',
    'lilypad',
    'ruin_arch',
    'ruin_column',
    'ruin_column_broken',
    'shrine_pedestal',
  ];

  const CANONICAL_HEIGHTS = {
    oak_tree: 9.6,
    birch_tree: 9.2,
    pine_tree: 11.2,
    pine_snow: 11.2,
    willow_tree: 8.8,
    palm_tree: 8.4,
    cactus_flower: 2.6,
    bush_berry: 1.35,
    boulder_moss: 1.35,
    boulder_rock: 1.45,
    fallen_log: 0.85,
    tree_stump: 0.95,
    lilypad: 0.12,
    ruin_arch: 5.8,
    ruin_column: 5.0,
    ruin_column_broken: 3.2,
    shrine_pedestal: 1.6,
  };

  const TREE_KEYS = {
    oak_tree: true,
    birch_tree: true,
    pine_tree: true,
    pine_snow: true,
    willow_tree: true,
    palm_tree: true,
  };

  const QUALITY_COUNTS = {
    high: {
      stars: 900,
      cloudBanks: 28,
      clouds: 168,
      rays: 16,
      motes: 120,
    },
    balanced: {
      stars: 450,
      cloudBanks: 14,
      clouds: 84,
      rays: 6,
      motes: 56,
    },
    fast: {
      stars: 220,
      cloudBanks: 7,
      clouds: 40,
      rays: 3,
      motes: 24,
    },
  };

  const MAX_STARS = 900;
  const MAX_CLOUD_BANKS = 28;
  const PUFFS_PER_BANK = 6;
  const MAX_CLOUD_PUFFS = MAX_CLOUD_BANKS * PUFFS_PER_BANK;
  const MAX_RAYS = 16;
  const MAX_MOTES = 120;
  const CYCLE_DURATION = 720;
  const CLOUD_WRAP_SPAN = 360;
  const MOTE_WRAP_XZ = 48;
  const MOTE_WRAP_Y = 9.0;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function makeVec3(x, y, z) {
    if (typeof THREE !== 'undefined' && THREE.Vector3) {
      return new THREE.Vector3(x, y, z);
    }
    return {
      x: x || 0,
      y: y || 0,
      z: z || 0,
      set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; },
      normalize() {
        const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) || 1;
        this.x /= l; this.y /= l; this.z /= l;
        return this;
      },
    };
  }

  function makeColor(hex) {
    if (typeof THREE !== 'undefined' && THREE.Color) {
      return new THREE.Color(hex);
    }
    const c = {
      r: 1,
      g: 1,
      b: 1,
      set(v) {
        if (typeof v === 'number') {
          this.r = ((v >> 16) & 255) / 255;
          this.g = ((v >> 8) & 255) / 255;
          this.b = (v & 255) / 255;
        } else if (v && typeof v === 'object' && 'r' in v) {
          this.r = v.r; this.g = v.g; this.b = v.b;
        }
        return this;
      },
      copy(src) { this.r = src.r; this.g = src.g; this.b = src.b; return this; },
      lerpColors(a, b, t) {
        this.r = a.r + (b.r - a.r) * t;
        this.g = a.g + (b.g - a.g) * t;
        this.b = a.b + (b.b - a.b) * t;
        return this;
      },
    };
    return c.set(hex);
  }

  function lerpColorOut(out, c0, c1, t) {
    if (typeof out.lerpColors === 'function') {
      out.lerpColors(c0, c1, t);
    } else {
      out.r = c0.r + (c1.r - c0.r) * t;
      out.g = c0.g + (c1.g - c0.g) * t;
      out.b = c0.b + (c1.b - c0.b) * t;
    }
    return out;
  }

  // Celestial palette anchors (allocated once at module init)
  const PAL_SKY = {
    darkTop: makeColor(0x050918),
    darkMid: makeColor(0x0d1732),
    darkBot: makeColor(0x1a284a),
    dawnTop: makeColor(0x1c356e),
    dawnMid: makeColor(0x745882),
    dawnBot: makeColor(0xdf8f6b),
    dayTop: makeColor(0x3680cc),
    dayMid: makeColor(0x78b8e2),
    dayBot: makeColor(0xc4e2ec),
    sunDark: makeColor(0x7ea6e4),
    sunDawn: makeColor(0xffac60),
    sunDay: makeColor(0xfff1cc),
    moonSilver: makeColor(0x9abcf5),
    moonBright: makeColor(0xbcd4ff),
    hemiSkyDark: makeColor(0x2e4875),
    hemiSkyDawn: makeColor(0x9e8eb0),
    hemiSkyDay: makeColor(0xa6d2f2),
    hemiGndDark: makeColor(0x0e151c),
    hemiGndDay: makeColor(0x3d4f38),
  };

  // Pre-allocated celestial & wind state structs (zero-GC return values)
  const _celState = {
    sunDir: makeVec3(0.45, 0.78, 0.36).normalize(),
    moonDir: makeVec3(-0.38, 0.72, -0.32).normalize(),
    shadowDir: makeVec3(-0.38, 0.72, -0.32).normalize(),
    sunColor: makeColor(0x7ea6e4),
    moonColor: makeColor(0x9abcf5),
    skyTop: makeColor(0x050918),
    skyMid: makeColor(0x0d1732),
    skyBot: makeColor(0x1a284a),
    hemiSky: makeColor(0x2e4875),
    hemiGround: makeColor(0x0e151c),
    sunIntensity: 0.52,
    hemiIntensity: 0.24,
    shadowStrength: 1.0,
    nightFactor: 1.0,
    starAlpha: 1.0,
    dayProgress: 0.0,
    lit: 0,
    cycleTime: 0,
  };

  const _windState = {
    dirX: 0.84,
    dirZ: 0.54,
    strength: 0.55,
    phase: 0.0,
    cloudOffX: 0.0,
    cloudOffZ: 0.0,
    gust: 0.55,
  };

  // Pre-allocated scratch math for scene rig updates (allocated lazily once if THREE loads late)
  let _scratchReady = false;
  let _mDummy = null;
  let _mPos = null;
  let _mQuat = null;
  let _mScale = null;
  let _mEuler = null;
  let _mColor = null;
  let _rayQuat = null;
  let _rayDir = null;
  let _rayUp = null;
  let _rayBaseColor = null;
  let _rayNightColor = null;
  let _motePalettes = null;

  function ensureScratch(THREERef) {
    if (_scratchReady) return;
    const T = THREERef || (typeof THREE !== 'undefined' ? THREE : null);
    if (!T || !T.Vector3 || !T.Quaternion || !T.Matrix4 || !T.Color) return;
    _mDummy = new T.Matrix4();
    _mPos = new T.Vector3();
    _mQuat = new T.Quaternion();
    _mScale = new T.Vector3(1, 1, 1);
    _mEuler = T.Euler ? new T.Euler() : null;
    _mColor = new T.Color(0xffffff);
    _rayQuat = new T.Quaternion();
    _rayDir = new T.Vector3(0, 1, 0);
    _rayUp = new T.Vector3(0, 1, 0);
    _rayBaseColor = new T.Color(0x8cf4e4);
    _rayNightColor = new T.Color(0x4b74b8);
    _motePalettes = {
      underwater: [new T.Color(0x5ae8d8), new T.Color(0xb6f7ff)],
      frostpeak: [new T.Color(0xf0f7ff), new T.Color(0xbce0ff)],
      whisperingForest: [new T.Color(0xc8ff64), new T.Color(0xffe46b)],
      canyonOasis: [new T.Color(0xf4be6c), new T.Color(0xd88848)],
      twilightCoast: [new T.Color(0xd4f0f5), new T.Color(0xaecbe8)],
      meadow: [new T.Color(0xffe88c), new T.Color(0xfff6d4)],
    };
    for (const k in _motePalettes) {
      const pair = _motePalettes[k];
      if (typeof pair[0].convertSRGBToLinear === 'function') pair[0].convertSRGBToLinear();
      if (typeof pair[1].convertSRGBToLinear === 'function') pair[1].convertSRGBToLinear();
    }
    _scratchReady = true;
  }

  // ---------- 1. Dual-Mode GLB Prop Loader, PBR Restyler & Hot-Swap Registries ----------

  const SLOT_MATERIAL_MAP = {
    Bark: { tex: 'bark', color: 0xf2e4d6, roughness: 0.90, metalness: 0.02, treeTrunkWind: true },
    Bark_Birch: { tex: 'bark', skipAlbedoMap: true, color: 0xe6e0d4, roughness: 0.82, metalness: 0.02, treeTrunkWind: true },
    Bark_BirchDark: { tex: 'bark', skipAlbedoMap: true, color: 0x3a3430, roughness: 0.88, metalness: 0.02, treeTrunkWind: true },
    Bark_Palm: { tex: 'bark', color: 0xf0dcc4, roughness: 0.88, metalness: 0.02, treeTrunkWind: true },
    Bark_Log: { tex: 'bark', color: 0xe8d6c4, roughness: 0.92, metalness: 0.02, treeTrunkWind: false },
    Bark_Stump: { tex: 'bark', color: 0xe8d6c4, roughness: 0.92, metalness: 0.02, treeTrunkWind: false },

    Leaves: { tex: 'leaves', color: 0xeaf4e2, roughness: 0.84, metalness: 0.0, doubleSide: true, foliageWind: true },
    Leaves_Dark: { tex: 'leaves', color: 0xc2d8b4, roughness: 0.86, metalness: 0.0, doubleSide: true, foliageWind: true },
    Leaves_Needles: { tex: 'leaves', color: 0xcce2c8, roughness: 0.86, metalness: 0.0, doubleSide: true, foliageWind: true },
    Leaves_Willow: { tex: 'leaves', color: 0xd6e8ce, roughness: 0.84, metalness: 0.0, doubleSide: true, foliageWind: true },
    Leaves_Palm: { tex: 'leaves', color: 0xe2f2d0, roughness: 0.82, metalness: 0.0, doubleSide: true, foliageWind: true },
    Leaves_PalmDark: { tex: 'leaves', color: 0xc4dca8, roughness: 0.84, metalness: 0.0, doubleSide: true, foliageWind: true },
    Leaves_Bush: { tex: 'leaves', color: 0xe4f2d8, roughness: 0.82, metalness: 0.0, doubleSide: true, reactiveFoliage: true },
    Leaves_Lilypad: { tex: 'leaves', color: 0xc8e8c0, roughness: 0.44, metalness: 0.02, doubleSide: true },
    Leaves_Cactus: { tex: 'leaves', color: 0xd4eca8, roughness: 0.72, metalness: 0.02, excludeWind: true },

    Snow: { tex: 'snow', color: 0xf8fbff, roughness: 0.48, metalness: 0.02, foliageWind: true },

    Stone: { tex: 'stone', color: 0xeae8e2, roughness: 0.86, metalness: 0.04 },
    Stone_Dark: { tex: 'stone', color: 0xb0b4bc, roughness: 0.88, metalness: 0.04 },
    Stone_Medium: { tex: 'stone', color: 0xd6d8d4, roughness: 0.85, metalness: 0.04 },
    Stone_Highlight: { tex: 'stone', color: 0xf2efe6, roughness: 0.80, metalness: 0.04 },
    Stone_Column: { tex: 'stone', color: 0xe2dfd8, roughness: 0.84, metalness: 0.04 },
    Stone_Marble: { tex: 'stone', color: 0xf0ece4, roughness: 0.68, metalness: 0.06 },
    Stone_Rock: { tex: 'rock', color: 0xe6e2da, roughness: 0.90, metalness: 0.03 },

    Moss: { tex: 'forest', color: 0xd6e6c4, roughness: 0.88, metalness: 0.02 },
    Moss_Dark: { tex: 'forest', color: 0xb6caa8, roughness: 0.90, metalness: 0.02 },

    Flower: { tex: null, color: 0xf5be44, roughness: 0.46, metalness: 0.02 },
    Flower_Berry: { tex: null, color: 0xd9385a, roughness: 0.36, metalness: 0.04, reactiveFoliage: true },
    Flower_Lotus: { tex: null, color: 0xf492b8, emissive: 0x3b1224, emissiveIntensity: 0.24, roughness: 0.42, metalness: 0.02, doubleSide: true },
    Flower_MushroomCap: { tex: null, color: 0xce5e36, roughness: 0.50, metalness: 0.02 },
    Flower_MushroomStem: { tex: null, color: 0xe6decb, roughness: 0.74, metalness: 0.0 },
  };

  const propCache = new Map();
  const pendingLoads = new Map();
  const pendingScripts = new Map();
  const readyCallbacks = new Map();
  const pendingInstancedSwaps = new Map();
  const pendingNodeSwaps = new Map();
  const materialCache = new Map();
  let _disposedChunks = new WeakSet();
  let _chunkEntries = new WeakMap();

  function getGlobalObj() {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined') return globalThis;
    return null;
  }

  function resolveAssetSource(key, protocol) {
    const p = protocol || (typeof location !== 'undefined' && location ? location.protocol : 'https:');
    if (p === 'file:') {
      return { mode: 'file-bundle', url: `./assets/env/${key}.glb.js` };
    }
    return { mode: 'glb', url: `./assets/env/${key}.glb` };
  }

  function base64ToArrayBuffer(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(b64, 'base64');
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
    throw new Error('Base64 decoder unavailable');
  }

  function loadFileBundleScript(key, scriptUrl, deps, onReady, onError) {
    const g = (deps && deps.window) || getGlobalObj();
    const map = g && g.__ENV_GLB_B64__;
    if (map && typeof map[key] === 'string' && map[key].length > 0) {
      onReady(map[key]);
      return;
    }

    if (pendingScripts.has(key)) {
      pendingScripts.get(key).push({ onReady, onError });
      return;
    }

    const doc = (deps && deps.document) || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.head || typeof doc.createElement !== 'function') {
      onError(new Error('DOM unavailable for file:// GLB bundle'));
      return;
    }

    pendingScripts.set(key, [{ onReady, onError }]);
    const sc = doc.createElement('script');
    sc.src = scriptUrl;
    sc.onload = () => {
      const waiters = pendingScripts.get(key) || [];
      pendingScripts.delete(key);
      const b64Map = g && g.__ENV_GLB_B64__;
      const b64 = b64Map && b64Map[key];
      if (typeof b64 === 'string' && b64.length > 0) {
        for (let i = 0; i < waiters.length; i++) waiters[i].onReady(b64);
      } else {
        const err = new Error(`${scriptUrl} loaded without __ENV_GLB_B64__['${key}']`);
        for (let i = 0; i < waiters.length; i++) waiters[i].onError(err);
      }
    };
    sc.onerror = () => {
      const waiters = pendingScripts.get(key) || [];
      pendingScripts.delete(key);
      const err = new Error('Failed to load ' + scriptUrl);
      for (let i = 0; i < waiters.length; i++) waiters[i].onError(err);
    };
    doc.head.appendChild(sc);
  }

  function resolveSlotRule(slotName) {
    if (slotName && SLOT_MATERIAL_MAP[slotName]) {
      return SLOT_MATERIAL_MAP[slotName];
    }
    const prefix = (slotName || '').split('_')[0];
    if (prefix && SLOT_MATERIAL_MAP[prefix]) {
      return SLOT_MATERIAL_MAP[prefix];
    }
    const low = (slotName || '').toLowerCase();
    if (low.includes('wood') || low.includes('trunk') || low.includes('bark')) return SLOT_MATERIAL_MAP.Bark;
    if (low.includes('cactus')) return SLOT_MATERIAL_MAP.Leaves_Cactus;
    if (low.includes('foliage') || low.includes('needle') || low.includes('leaf') || low.includes('palm') || low.includes('leaves')) {
      return SLOT_MATERIAL_MAP.Leaves;
    }
    if (low.includes('snow')) return SLOT_MATERIAL_MAP.Snow;
    if (low.includes('moss')) return SLOT_MATERIAL_MAP.Moss;
    if (low.includes('rock')) return SLOT_MATERIAL_MAP.Stone_Rock;
    if (low.includes('stone') || low.includes('brick') || low.includes('arch') || low.includes('column') || low.includes('pedestal') || low.includes('marble')) {
      return SLOT_MATERIAL_MAP.Stone;
    }
    if (low.includes('berry') || low.includes('flower') || low.includes('lotus') || low.includes('mushroom')) {
      return SLOT_MATERIAL_MAP.Flower;
    }
    return SLOT_MATERIAL_MAP.Stone;
  }

  function linearizeMat(mat) {
    if (!mat || mat._linDone) return mat;
    mat._linDone = true;
    if (mat.color && typeof mat.color.convertSRGBToLinear === 'function') {
      mat.color.convertSRGBToLinear();
    }
    if (mat.emissive && typeof mat.emissive.convertSRGBToLinear === 'function') {
      mat.emissive.convertSRGBToLinear();
    }
    return mat;
  }

  function getTextureSig(TexturesRef) {
    const sets = TexturesRef && TexturesRef.sets;
    if (!sets) return 'none';
    return (sets.bark ? 'B' : '') + (sets.leaves ? 'L' : '') + (sets.stone ? 'S' : '') + (sets.rock ? 'R' : '') + (sets.snow ? 'W' : '') + (sets.forest ? 'F' : '');
  }

  function getStyledMaterial(propKey, origName, deps, opts) {
    const cfg = deps || {};
    const THREERef = cfg.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    if (!THREERef || typeof THREERef.MeshStandardMaterial !== 'function') return null;
    const TexturesRef = cfg.Textures || (typeof Textures !== 'undefined' ? Textures : null);
    const ShadersRef = cfg.Shaders || (typeof Shaders !== 'undefined' ? Shaders : null);
    const sets = TexturesRef && TexturesRef.sets ? TexturesRef.sets : null;

    const slotName = origName || 'Stone';
    const causticsCfg = opts && opts.caustics ? opts.caustics : null;
    const causticsTag = causticsCfg
      ? (typeof causticsCfg === 'object' && causticsCfg.intensity !== undefined ? `c${causticsCfg.intensity}` : 'c1')
      : 'c0';
    const texSig = getTextureSig(TexturesRef);
    const cacheKey = `${propKey}|${slotName}|${causticsTag}|${texSig}`;
    if (materialCache.has(cacheKey)) {
      return materialCache.get(cacheKey);
    }

    const rule = resolveSlotRule(slotName);
    const texSet = rule.tex && sets ? (sets[rule.tex] || sets.stone || null) : null;
    const matOpts = {
      name: slotName,
      color: rule.color !== undefined ? rule.color : 0xe8e8e8,
      roughness: rule.roughness !== undefined ? rule.roughness : 0.85,
      metalness: rule.metalness !== undefined ? rule.metalness : 0.02,
    };

    if (rule.emissive !== undefined) {
      matOpts.emissive = rule.emissive;
      matOpts.emissiveIntensity = rule.emissiveIntensity !== undefined ? rule.emissiveIntensity : 0.25;
    }
    if (rule.doubleSide && THREERef.DoubleSide !== undefined) {
      matOpts.side = THREERef.DoubleSide;
    }
    if (texSet) {
      if (!rule.skipAlbedoMap && texSet.map) matOpts.map = texSet.map;
      if (texSet.normalMap) matOpts.normalMap = texSet.normalMap;
      if (texSet.roughnessMap) matOpts.roughnessMap = texSet.roughnessMap;
    }

    // Always construct a fresh MeshStandardMaterial BEFORE calling Shaders.patch*
    const mat = new THREERef.MeshStandardMaterial(matOpts);
    linearizeMat(mat);

    const isCactus = propKey === 'cactus_flower' || rule.excludeWind || slotName === 'Leaves_Cactus';
    if (!isCactus && ShadersRef) {
      if (rule.reactiveFoliage && typeof ShadersRef.patchFoliageReactive === 'function') {
        ShadersRef.patchFoliageReactive(mat, { amp: 0.12, heightScale: 1.35 });
      } else if (TREE_KEYS[propKey] && typeof ShadersRef.patchTreeWind === 'function') {
        if (rule.foliageWind) {
          ShadersRef.patchTreeWind(mat, true);
        } else if (rule.treeTrunkWind) {
          ShadersRef.patchTreeWind(mat, false);
        }
      }
    }

    if (causticsCfg && ShadersRef && typeof ShadersRef.patchUnderwaterCaustics === 'function') {
      ShadersRef.patchUnderwaterCaustics(mat, typeof causticsCfg === 'object' ? causticsCfg : undefined);
    }

    materialCache.set(cacheKey, mat);
    return mat;
  }

  function extractTemplateParts(sceneRoot, key, deps) {
    const parts = [];
    if (!sceneRoot) return parts;
    if (typeof sceneRoot.updateMatrixWorld === 'function') {
      sceneRoot.updateMatrixWorld(true);
    }
    if (typeof sceneRoot.traverse !== 'function') return parts;

    sceneRoot.traverse((obj) => {
      if (!obj || !obj.isMesh || !obj.geometry) return;
      const origMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const slotName = (origMat && origMat.name) || 'Stone';
      obj.userData = obj.userData || {};
      obj.userData.slotMatName = slotName;

      const styledMat = getStyledMaterial(key, slotName, deps, null);
      if (styledMat) obj.material = styledMat;

      const bakedGeo = typeof obj.geometry.clone === 'function' ? obj.geometry.clone() : obj.geometry;
      if (obj.matrixWorld && bakedGeo && typeof bakedGeo.applyMatrix4 === 'function') {
        bakedGeo.applyMatrix4(obj.matrixWorld);
      }

      parts.push({
        geometry: bakedGeo,
        material: styledMat || origMat,
        slotName,
      });
    });

    return parts;
  }

  function trackChunkEntry(chunk, entry) {
    if (!chunk || typeof chunk !== 'object') return;
    let list = _chunkEntries.get(chunk);
    if (!list) {
      list = [];
      _chunkEntries.set(chunk, list);
    }
    list.push(entry);
  }

  function isChunkCancelled(entry) {
    if (!entry || entry.cancelled) return true;
    const ch = entry.chunk;
    if (!ch) return false;
    return !!(ch.disposed || _disposedChunks.has(ch));
  }

  function applyInstancedSwap(template, entry) {
    if (isChunkCancelled(entry) || !template || !template.parts || template.parts.length === 0) {
      return;
    }
    const target = entry.target;
    if (!target) return;
    const THREERef = entry.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const parts = template.parts;
    const count = target.count || 0;
    const scaleAdjust = entry.scaleAdjust !== undefined ? entry.scaleAdjust : 1.0;

    if (scaleAdjust !== 1.0 && target.instanceMatrix && target.instanceMatrix.array) {
      const arr = target.instanceMatrix.array;
      for (let i = 0; i < count; i++) {
        const off = i * 16;
        arr[off] *= scaleAdjust;
        arr[off + 1] *= scaleAdjust;
        arr[off + 2] *= scaleAdjust;
        arr[off + 4] *= scaleAdjust;
        arr[off + 5] *= scaleAdjust;
        arr[off + 6] *= scaleAdjust;
        arr[off + 8] *= scaleAdjust;
        arr[off + 9] *= scaleAdjust;
        arr[off + 10] *= scaleAdjust;
      }
      target.instanceMatrix.needsUpdate = true;
    }

    target.geometry = parts[0].geometry;
    target.material = parts[0].material;
    target.frustumCulled = false;
    target.userData = target.userData || {};
    target.userData.glbSwapped = template.key;

    const parent = entry.parent || target.parent || (entry.chunk && entry.chunk.group) || _scene;
    if (parts.length > 1 && THREERef && typeof THREERef.InstancedMesh === 'function') {
      const subMeshes = [];
      for (let p = 1; p < parts.length; p++) {
        const sub = new THREERef.InstancedMesh(parts[p].geometry, parts[p].material, count);
        sub.castShadow = !!target.castShadow;
        sub.receiveShadow = !!target.receiveShadow;
        sub.frustumCulled = false;
        if (target.instanceMatrix && target.instanceMatrix.array && sub.instanceMatrix && sub.instanceMatrix.array) {
          const srcLen = Math.min(sub.instanceMatrix.array.length, target.instanceMatrix.array.length);
          sub.instanceMatrix.array.set(target.instanceMatrix.array.subarray(0, srcLen));
          sub.instanceMatrix.needsUpdate = true;
        }
        if (target.instanceColor && target.instanceColor.array && typeof sub.setColorAt === 'function') {
          const cArr = target.instanceColor.array;
          ensureScratch(THREERef);
          if (_mColor) {
            for (let i = 0; i < count; i++) {
              _mColor.setRGB(cArr[i * 3], cArr[i * 3 + 1], cArr[i * 3 + 2]);
              sub.setColorAt(i, _mColor);
            }
          }
          if (sub.instanceColor) sub.instanceColor.needsUpdate = true;
        }
        if (parent && typeof parent.add === 'function') parent.add(sub);
        if (entry.chunk && Array.isArray(entry.chunk.meshes)) entry.chunk.meshes.push(sub);
        subMeshes.push(sub);
      }
      target.userData.swappedParts = subMeshes;
    }

    if (Array.isArray(entry.hideTargets)) {
      for (let i = 0; i < entry.hideTargets.length; i++) {
        const ht = entry.hideTargets[i];
        if (!ht) continue;
        ht.visible = false;
        if (entry.removeFallback && ht.parent && typeof ht.parent.remove === 'function') {
          ht.parent.remove(ht);
        }
      }
    }
  }

  function applyChunkSlotSwap(template, entry) {
    if (isChunkCancelled(entry) || !template || !template.parts || template.parts.length === 0) {
      return;
    }
    const THREERef = entry.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    if (!THREERef || typeof THREERef.InstancedMesh !== 'function') return;

    const matrices = entry.matrices;
    const isTyped = matrices && typeof matrices.length === 'number' && typeof matrices[0] === 'number';
    const count = isTyped ? Math.floor(matrices.length / 16) : (Array.isArray(matrices) ? matrices.length : 0);
    if (count <= 0) return;

    const parent = (entry.chunk && entry.chunk.group) ||
      entry.parent ||
      (entry.fallbackMesh && entry.fallbackMesh.parent) ||
      _scene;
    if (!parent || typeof parent.add !== 'function') return;

    const created = [];
    for (let p = 0; p < template.parts.length; p++) {
      const part = template.parts[p];
      const mesh = new THREERef.InstancedMesh(part.geometry, part.material, count);
      mesh.castShadow = entry.castShadow !== undefined ? !!entry.castShadow : true;
      mesh.receiveShadow = entry.receiveShadow !== undefined ? !!entry.receiveShadow : true;
      mesh.frustumCulled = false;
      if (isTyped && mesh.instanceMatrix && mesh.instanceMatrix.array) {
        mesh.instanceMatrix.array.set(matrices.subarray ? matrices.subarray(0, count * 16) : matrices.slice(0, count * 16));
      } else if (Array.isArray(matrices)) {
        for (let i = 0; i < count; i++) {
          if (matrices[i]) mesh.setMatrixAt(i, matrices[i]);
        }
      }
      if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
      if (entry.chunk && Array.isArray(entry.chunk.meshes)) entry.chunk.meshes.push(mesh);
      created.push(mesh);
    }

    if (entry.fallbackMesh && created.length > 0) {
      entry.fallbackMesh.visible = false;
      if (entry.fallbackMesh.parent && typeof entry.fallbackMesh.parent.remove === 'function') {
        entry.fallbackMesh.parent.remove(entry.fallbackMesh);
      }
    }
    entry.createdMeshes = created;
  }

  function applyNodeSwap(template, entry) {
    if (isChunkCancelled(entry) || !template || !template.scene || !entry.holder) {
      return;
    }
    const holder = entry.holder;
    const opts = entry.opts || {};
    const cloned = typeof template.scene.clone === 'function' ? template.scene.clone(true) : null;
    if (!cloned) return;

    const castShadow = opts.castShadow !== undefined ? !!opts.castShadow : true;
    const receiveShadow = opts.receiveShadow !== undefined ? !!opts.receiveShadow : true;
    if (typeof cloned.traverse === 'function') {
      cloned.traverse((obj) => {
        if (!obj || !obj.isMesh) return;
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
        if (opts.caustics) {
          const slotName = (obj.userData && obj.userData.slotMatName) || (obj.material && obj.material.name) || 'Stone';
          const causticMat = getStyledMaterial(template.key, slotName, entry.deps, opts);
          if (causticMat) obj.material = causticMat;
        }
      });
    }

    if (opts.targetHeight && template.canonicalHeight > 0 && cloned.scale) {
      const mul = opts.targetHeight / template.canonicalHeight;
      cloned.scale.set(
        cloned.scale.x * mul,
        cloned.scale.y * mul,
        cloned.scale.z * mul
      );
    } else if (opts.scale !== undefined && cloned.scale) {
      if (typeof opts.scale === 'number') {
        cloned.scale.set(cloned.scale.x * opts.scale, cloned.scale.y * opts.scale, cloned.scale.z * opts.scale);
      } else if (typeof opts.scale === 'object') {
        cloned.scale.set(opts.scale.x || 1, opts.scale.y || 1, opts.scale.z || 1);
      }
    }
    if (opts.rotationY !== undefined && cloned.rotation) {
      cloned.rotation.y = opts.rotationY;
    }
    if (opts.position && cloned.position) {
      cloned.position.set(opts.position.x || 0, opts.position.y || 0, opts.position.z || 0);
    }

    if (entry.fallbackNode) {
      entry.fallbackNode.visible = false;
      if (opts.removeFallback && typeof holder.remove === 'function') {
        holder.remove(entry.fallbackNode);
      }
    } else if (Array.isArray(holder.children)) {
      for (let i = holder.children.length - 1; i >= 0; i--) {
        const ch = holder.children[i];
        if (!ch) continue;
        if (opts.keepNonPlaceholders && !(ch.userData && ch.userData.isPlaceholder)) continue;
        ch.visible = false;
        if (opts.removeFallback && typeof holder.remove === 'function') {
          holder.remove(ch);
        }
      }
    }

    if (typeof holder.add === 'function') holder.add(cloned);
    holder.userData = holder.userData || {};
    holder.userData.glbSwapped = template.key;
    holder.userData.swappedNode = cloned;
  }

  function flushPendingSwaps(key, template) {
    const readyList = readyCallbacks.get(key);
    if (readyList) {
      readyCallbacks.delete(key);
      for (let i = 0; i < readyList.length; i++) {
        try { readyList[i](template); } catch (_e) {}
      }
    }

    const instList = pendingInstancedSwaps.get(key);
    if (instList) {
      pendingInstancedSwaps.delete(key);
      for (let i = 0; i < instList.length; i++) {
        const entry = instList[i];
        if (entry.isChunkSlot) applyChunkSlotSwap(template, entry);
        else applyInstancedSwap(template, entry);
      }
    }

    const nodeList = pendingNodeSwaps.get(key);
    if (nodeList) {
      pendingNodeSwaps.delete(key);
      for (let i = 0; i < nodeList.length; i++) {
        applyNodeSwap(template, nodeList[i]);
      }
    }
  }

  function preloadProp(key, onReady, onError, deps) {
    if (!key) {
      if (typeof onError === 'function') onError(new Error('Invalid prop key'));
      return;
    }
    if (propCache.has(key)) {
      const cached = propCache.get(key);
      if (typeof onReady === 'function') onReady(cached);
      return;
    }
    if (pendingLoads.has(key)) {
      pendingLoads.get(key).push({ onReady, onError });
      return;
    }

    const cfg = deps || {};
    const THREERef = cfg.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const LoaderCtor = cfg.GLTFLoader || (THREERef && THREERef.GLTFLoader);
    if (typeof LoaderCtor !== 'function') {
      if (typeof onError === 'function') onError(new Error('THREE.GLTFLoader unavailable'));
      return;
    }

    pendingLoads.set(key, [{ onReady, onError }]);

    const finishReady = (gltf) => {
      const waiters = pendingLoads.get(key) || [];
      pendingLoads.delete(key);
      if (!gltf || !gltf.scene) {
        const err = new Error(`Empty GLTF scene for ${key}`);
        for (let i = 0; i < waiters.length; i++) {
          if (typeof waiters[i].onError === 'function') waiters[i].onError(err);
        }
        return;
      }

      const parts = extractTemplateParts(gltf.scene, key, cfg);
      const template = {
        key,
        scene: gltf.scene,
        parts,
        canonicalHeight: CANONICAL_HEIGHTS[key] || 1,
      };
      propCache.set(key, template);

      for (let i = 0; i < waiters.length; i++) {
        if (typeof waiters[i].onReady === 'function') {
          try { waiters[i].onReady(template); } catch (_e) {}
        }
      }
      flushPendingSwaps(key, template);
    };

    const finishError = (err) => {
      const waiters = pendingLoads.get(key) || [];
      pendingLoads.delete(key);
      for (let i = 0; i < waiters.length; i++) {
        if (typeof waiters[i].onError === 'function') {
          try { waiters[i].onError(err); } catch (_e) {}
        }
      }
    };

    try {
      const loader = new LoaderCtor();
      const src = resolveAssetSource(key, cfg.protocol);
      if (src.mode === 'file-bundle') {
        loadFileBundleScript(
          key,
          src.url,
          cfg,
          (b64) => {
            try {
              const buf = base64ToArrayBuffer(b64);
              loader.parse(buf, './assets/env/', finishReady, finishError);
            } catch (e) {
              finishError(e);
            }
          },
          finishError
        );
      } else {
        loader.load(src.url, finishReady, undefined, finishError);
      }
    } catch (err) {
      finishError(err);
    }
  }

  function preloadAll(deps, onDone) {
    let remaining = PROP_KEYS.length;
    const finishOne = () => {
      remaining--;
      if (remaining <= 0 && typeof onDone === 'function') onDone();
    };
    for (let i = 0; i < PROP_KEYS.length; i++) {
      preloadProp(PROP_KEYS[i], finishOne, finishOne, deps);
    }
  }

  function getProp(key) {
    return propCache.get(key) || null;
  }

  function onPropReady(key, cb) {
    if (typeof cb !== 'function') return;
    if (propCache.has(key)) {
      cb(propCache.get(key));
      return;
    }
    let list = readyCallbacks.get(key);
    if (!list) {
      list = [];
      readyCallbacks.set(key, list);
    }
    list.push(cb);
  }

  function registerInstancedSwap(key, target, opts) {
    if (!key || !target) return null;
    const cfg = opts || {};
    const entry = {
      isChunkSlot: false,
      key,
      target,
      chunk: cfg.chunk || null,
      parent: cfg.parent || null,
      hideTargets: cfg.hideTargets || null,
      removeFallback: !!cfg.removeFallback,
      scaleAdjust: cfg.scaleAdjust,
      THREE: cfg.THREE || (typeof THREE !== 'undefined' ? THREE : null),
      cancelled: false,
    };
    if (entry.chunk) trackChunkEntry(entry.chunk, entry);

    const cached = propCache.get(key);
    if (cached) {
      applyInstancedSwap(cached, entry);
      return entry;
    }
    let list = pendingInstancedSwaps.get(key);
    if (!list) {
      list = [];
      pendingInstancedSwaps.set(key, list);
    }
    list.push(entry);
    return entry;
  }

  function registerChunkSlot(chunk, key, matrices, fallbackMesh, opts) {
    if (!key || !matrices) return null;
    const cfg = opts || {};
    const entry = {
      isChunkSlot: true,
      chunk: chunk || null,
      key,
      matrices,
      fallbackMesh: fallbackMesh || null,
      parent: cfg.parent || null,
      castShadow: cfg.castShadow,
      receiveShadow: cfg.receiveShadow,
      THREE: cfg.THREE || (typeof THREE !== 'undefined' ? THREE : null),
      cancelled: false,
    };
    if (entry.chunk) trackChunkEntry(entry.chunk, entry);

    const cached = propCache.get(key);
    if (cached) {
      applyChunkSlotSwap(cached, entry);
      return entry;
    }
    let list = pendingInstancedSwaps.get(key);
    if (!list) {
      list = [];
      pendingInstancedSwaps.set(key, list);
    }
    list.push(entry);
    return entry;
  }

  function unregisterChunk(chunk) {
    if (!chunk || typeof chunk !== 'object') return;
    _disposedChunks.add(chunk);
    const list = _chunkEntries.get(chunk);
    if (list) {
      for (let i = 0; i < list.length; i++) {
        list[i].cancelled = true;
      }
      _chunkEntries.delete(chunk);
    }
  }

  function registerNodeSwap(arg1, arg2, arg3, arg4) {
    let key, holder, fallbackNode, opts;
    if (typeof arg1 === 'string') {
      key = arg1;
      holder = arg2;
      opts = arg3 || {};
      fallbackNode = opts.fallback || null;
    } else {
      holder = arg1;
      key = arg2;
      fallbackNode = arg3 || null;
      opts = arg4 || {};
    }
    if (!key || !holder) return null;

    const entry = {
      key,
      holder,
      fallbackNode,
      opts,
      chunk: opts.chunk || null,
      deps: opts.deps || opts,
      cancelled: false,
    };
    if (entry.chunk) trackChunkEntry(entry.chunk, entry);

    const cached = propCache.get(key);
    if (cached) {
      applyNodeSwap(cached, entry);
      return entry;
    }
    let list = pendingNodeSwaps.get(key);
    if (!list) {
      list = [];
      pendingNodeSwaps.set(key, list);
    }
    list.push(entry);
    return entry;
  }

  // ---------- 2. Celestial Rig & Post-8/8 Live Day/Night Cycle ----------

  let _lit = 0;
  let _cycleTime = 0;
  let _qualityMode = 'high';

  function computeCelestialState(lit, cycleTime, out) {
    const target = out || _celState;
    const rawLit = lit !== undefined && lit !== null ? lit : _lit;
    const clampedLit = clamp(rawLit, 0, 8);
    const storyProgress = clampedLit / 8;
    const ct = cycleTime !== undefined && cycleTime !== null ? cycleTime : _cycleTime;

    let sx, sy, sz;
    let mx, my, mz;
    let nightFactor;
    let dayProgress;

    if (clampedLit < 8) {
      // 3-act story arc: 0/8 Starlit Moonlit Night -> 4/8 Golden Dawn -> 8/8 Sunlit Day
      sx = 0.88 * (1 - storyProgress) + 0.45 * storyProgress;
      sy = -0.26 + storyProgress * 1.04;
      sz = 0.28 + storyProgress * 0.08;

      mx = -0.38 - Math.sin(storyProgress * Math.PI) * 0.26;
      my = 0.72 - storyProgress * 1.46;
      mz = -0.32 - storyProgress * 0.04;

      nightFactor = clamp(1 - smoothstep(0.08, 0.86, storyProgress), 0, 1);
      dayProgress = storyProgress;
    } else {
      // Unlocked 12-minute (720s) continuous day/sunset/night/dawn cycle starting at sunlit day
      const wrapped = ((ct % CYCLE_DURATION) + CYCLE_DURATION) % CYCLE_DURATION;
      const theta = (wrapped / CYCLE_DURATION) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      sx = 0.45 * cosT - 0.82 * sinT;
      sy = 0.78 * cosT;
      sz = 0.36 * cosT + 0.28 * sinT;

      mx = -0.45 * cosT + 0.72 * sinT;
      my = -0.74 * cosT;
      mz = -0.36 * cosT - 0.32 * sinT;

      nightFactor = clamp(1 - smoothstep(-0.18, 0.36, sy), 0, 1);
      dayProgress = smoothstep(-0.34, 0.44, sy);
    }

    target.sunDir.set(sx, sy, sz).normalize();
    target.moonDir.set(mx, my, mz).normalize();

    const useSunShadow = target.sunDir.y >= 0.0;
    const activeShadow = useSunShadow ? target.sunDir : target.moonDir;
    const rawElev = activeShadow.y;
    const shadowStrength = smoothstep(0.0, 0.075, Math.abs(target.sunDir.y));
    const safeShadowY = rawElev < 0.12 ? 0.12 : rawElev;
    target.shadowDir.set(activeShadow.x, safeShadowY, activeShadow.z).normalize();
    target.shadowStrength = shadowStrength;

    // Daytime star suppression: ZERO daytime stars once nightFactor <= 0.08
    const starAlpha = nightFactor <= 0.08 ? 0 : smoothstep(0.08, 0.82, nightFactor);

    if (dayProgress <= 0.5) {
      const k = dayProgress * 2;
      lerpColorOut(target.skyTop, PAL_SKY.darkTop, PAL_SKY.dawnTop, k);
      lerpColorOut(target.skyMid, PAL_SKY.darkMid, PAL_SKY.dawnMid, k);
      lerpColorOut(target.skyBot, PAL_SKY.darkBot, PAL_SKY.dawnBot, k);
      lerpColorOut(target.hemiSky, PAL_SKY.hemiSkyDark, PAL_SKY.hemiSkyDawn, k);
      lerpColorOut(target.sunColor, PAL_SKY.sunDark, PAL_SKY.sunDawn, k);
    } else {
      const k = (dayProgress - 0.5) * 2;
      lerpColorOut(target.skyTop, PAL_SKY.dawnTop, PAL_SKY.dayTop, k);
      lerpColorOut(target.skyMid, PAL_SKY.dawnMid, PAL_SKY.dayMid, k);
      lerpColorOut(target.skyBot, PAL_SKY.dawnBot, PAL_SKY.dayBot, k);
      lerpColorOut(target.hemiSky, PAL_SKY.hemiSkyDawn, PAL_SKY.hemiSkyDay, k);
      lerpColorOut(target.sunColor, PAL_SKY.sunDawn, PAL_SKY.sunDay, k);
    }

    lerpColorOut(target.hemiGround, PAL_SKY.hemiGndDark, PAL_SKY.hemiGndDay, dayProgress);
    lerpColorOut(target.moonColor, PAL_SKY.moonBright, PAL_SKY.moonSilver, nightFactor);

    const handoffFade = 0.42 + 0.58 * shadowStrength;
    target.sunIntensity = (0.50 + dayProgress * 1.34) * handoffFade;
    target.hemiIntensity = 0.24 + dayProgress * 0.42;
    target.nightFactor = nightFactor;
    target.starAlpha = starAlpha;
    target.dayProgress = dayProgress;
    target.lit = clampedLit;
    target.cycleTime = ct;

    return target;
  }

  function setSkyProgress(lit) {
    _lit = clamp(lit || 0, 0, 8);
    if (_lit >= 8) _cycleTime = 0;
    computeCelestialState(_lit, _cycleTime, _celState);
    if (typeof Shaders !== 'undefined' && typeof Shaders.setCelestial === 'function') {
      Shaders.setCelestial(_celState.moonDir, _celState.moonColor, _celState.nightFactor);
    }
    return _celState;
  }

  function getCelestialState() {
    return _celState;
  }

  // ---------- 3. Cohesive Travelling Wind-Gust Field ----------

  function updateWind(time, out) {
    const t = time || 0;
    const target = out || _windState;
    const angle = 0.57 + Math.sin(t * 0.055) * 0.34 + Math.cos(t * 0.023) * 0.18;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const rawStr = 0.58 + Math.sin(t * 0.38) * 0.24 + Math.sin(t * 0.91 + 1.1) * 0.12 + Math.cos(t * 0.14) * 0.10;
    const strength = clamp(rawStr, 0.25, 1.15);
    const phase = t * 0.85 + Math.sin(t * 0.27) * 0.65;
    const cloudOffX = t * 1.45 * 0.84 + Math.sin(t * 0.04) * 4.0;
    const cloudOffZ = t * 1.45 * 0.54 + Math.cos(t * 0.035) * 3.0;

    target.dirX = dirX;
    target.dirZ = dirZ;
    target.strength = strength;
    target.phase = phase;
    target.cloudOffX = cloudOffX;
    target.cloudOffZ = cloudOffZ;
    target.gust = strength;

    if (typeof Shaders !== 'undefined' && typeof Shaders.setWind === 'function') {
      Shaders.setWind(dirX, dirZ, strength, phase, cloudOffX, cloudOffZ);
    }
    return target;
  }

  function getWindGust() {
    return _windState.gust;
  }

  // ---------- 4. Pre-allocated Scene FX Rigs (Stars, Clouds, Sunbeams, Motes) ----------

  let _scene = null;
  let _rig = null;
  let _cloudBanks = null;
  let _moteSeeds = null;
  let _activeMoteBiome = '';
  let _motesDirtyColor = true;

  function seededRand(idx, salt) {
    const s = Math.sin((idx + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function wrapSigned(val, span) {
    const half = span * 0.5;
    let r = (val + half) % span;
    if (r < 0) r += span;
    return r - half;
  }

  function buildStarfieldRig(THREERef, ShadersRef) {
    if (!THREERef.BufferGeometry || !THREERef.BufferAttribute || !THREERef.Points) return null;

    const geo = new THREERef.BufferGeometry();
    const pos = new Float32Array(MAX_STARS * 3);
    const sizes = new Float32Array(MAX_STARS);
    const phases = new Float32Array(MAX_STARS);
    const speeds = new Float32Array(MAX_STARS);
    const colors = new Float32Array(MAX_STARS * 3);

    const goldenAngle = 2.399963229728653;
    for (let i = 0; i < MAX_STARS; i++) {
      // Bias ~30% along tilted Milky Way band for organic clustering
      const inBand = i % 3 === 0;
      const u = seededRand(i, 1);
      const v = seededRand(i, 2);
      let dirX, dirY, dirZ;

      if (inBand) {
        const az = (i / MAX_STARS) * Math.PI * 2 + (u - 0.5) * 0.25;
        const bandLat = (v - 0.5) * 0.34;
        const cosL = Math.cos(bandLat);
        const bx = Math.cos(az) * cosL;
        const by = Math.sin(bandLat);
        const bz = Math.sin(az) * cosL;
        // Tilt band 52 deg
        const tilt = 0.90;
        const cT = Math.cos(tilt);
        const sT = Math.sin(tilt);
        dirX = bx;
        dirY = Math.abs(by * cT - bz * sT) * 0.92 + 0.06;
        dirZ = by * sT + bz * cT;
      } else {
        const elev = 0.04 + 0.95 * (1 - Math.sqrt(1 - u));
        const az = i * goldenAngle + (v - 0.5) * 0.4;
        const horiz = Math.sqrt(Math.max(0, 1 - elev * elev));
        dirX = Math.cos(az) * horiz;
        dirY = elev;
        dirZ = Math.sin(az) * horiz;
      }

      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      const rad = 385 + seededRand(i, 3) * 30;
      pos[i * 3] = (dirX / len) * rad;
      pos[i * 3 + 1] = (dirY / len) * rad;
      pos[i * 3 + 2] = (dirZ / len) * rad;

      const brightRoll = seededRand(i, 4);
      sizes[i] = brightRoll > 0.88 ? (3.0 + seededRand(i, 5) * 1.7) : (1.5 + seededRand(i, 5) * 1.3);
      phases[i] = seededRand(i, 6) * Math.PI * 2;
      speeds[i] = 1.2 + seededRand(i, 7) * 2.6;

      // Spectral star tint (O/B blue-white, A pure white, G warm gold, K pale amber)
      const temp = seededRand(i, 8);
      if (temp < 0.25) {
        colors[i * 3] = 0.78; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 1.0;
      } else if (temp < 0.65) {
        colors[i * 3] = 0.98; colors[i * 3 + 1] = 0.98; colors[i * 3 + 2] = 1.0;
      } else if (temp < 0.88) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.92; colors[i * 3 + 2] = 0.76;
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.78; colors[i * 3 + 2] = 0.58;
      }
    }

    geo.setAttribute('position', new THREERef.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREERef.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREERef.BufferAttribute(phases, 1));
    geo.setAttribute('aTwinkleSpeed', new THREERef.BufferAttribute(speeds, 1));
    geo.setAttribute('aColor', new THREERef.BufferAttribute(colors, 3));

    const counts = QUALITY_COUNTS[_qualityMode];
    if (typeof geo.setDrawRange === 'function') geo.setDrawRange(0, counts.stars);

    const mat = ShadersRef && typeof ShadersRef.createStarfieldMaterial === 'function'
      ? ShadersRef.createStarfieldMaterial()
      : new THREERef.PointsMaterial({ color: 0xfff6d9, size: 2.5, transparent: true, fog: false });
    if (mat && mat.uniforms && mat.uniforms.uStarAlpha) {
      mat.uniforms.uStarAlpha.value = _celState.starAlpha;
    }

    const pts = new THREERef.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 1;
    pts.visible = _celState.starAlpha > 0.002;
    return pts;
  }

  function buildCloudRig(THREERef, ShadersRef) {
    if (!THREERef.InstancedMesh) return null;
    const geo = THREERef.SphereGeometry
      ? new THREERef.SphereGeometry(1, 10, 8)
      : (THREERef.BufferGeometry ? new THREERef.BufferGeometry() : null);
    if (!geo) return null;

    const mat = ShadersRef && typeof ShadersRef.createCloudMaterial === 'function'
      ? ShadersRef.createCloudMaterial()
      : new THREERef.MeshStandardMaterial({ color: 0xf4f2ec, transparent: true, opacity: 0.78, depthWrite: false });

    const mesh = new THREERef.InstancedMesh(geo, mat, MAX_CLOUD_PUFFS);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    mesh.count = QUALITY_COUNTS[_qualityMode].clouds;

    ensureScratch(THREERef);
    _cloudBanks = [];
    for (let b = 0; b < MAX_CLOUD_BANKS; b++) {
      const puffs = [];
      const bankScale = 0.85 + seededRand(b, 14) * 0.65;
      for (let p = 0; p < PUFFS_PER_BANK; p++) {
        const ang = (p / PUFFS_PER_BANK) * Math.PI * 2 + seededRand(b * 7 + p, 15) * 0.5;
        const dist = p === 0 ? 0 : (3.8 + seededRand(b * 7 + p, 16) * 6.5) * bankScale;
        const sx = (p === 0 ? 9.5 : 5.4 + seededRand(b * 7 + p, 17) * 4.5) * bankScale;
        const sy = (p === 0 ? 4.4 : 2.6 + seededRand(b * 7 + p, 18) * 2.2) * bankScale;
        const sz = (p === 0 ? 7.8 : 4.8 + seededRand(b * 7 + p, 19) * 3.8) * bankScale;
        puffs.push({
          dx: Math.cos(ang) * dist,
          dy: (p === 0 ? 1.4 : -0.4 + seededRand(b * 7 + p, 20) * 1.8) * bankScale,
          dz: Math.sin(ang) * dist,
          sx,
          sy,
          sz,
        });
      }
      const bank = {
        baseX: (seededRand(b, 10) - 0.5) * CLOUD_WRAP_SPAN,
        baseZ: (seededRand(b, 11) - 0.5) * CLOUD_WRAP_SPAN,
        alt: 52 + seededRand(b, 12) * 26,
        yaw: seededRand(b, 13) * Math.PI * 2,
        speedMul: 0.82 + seededRand(b, 21) * 0.36,
        puffs,
      };
      _cloudBanks.push(bank);
      if (_scratchReady) {
        const cosY = Math.cos(bank.yaw);
        const sinY = Math.sin(bank.yaw);
        if (_mEuler) _mEuler.set(0, bank.yaw, 0);
        if (_mEuler) _mQuat.setFromEuler(_mEuler);
        else _mQuat.identity();
        for (let p = 0; p < PUFFS_PER_BANK; p++) {
          const puff = puffs[p];
          _mPos.set(bank.baseX + puff.dx * cosY - puff.dz * sinY, bank.alt + puff.dy, bank.baseZ + puff.dx * sinY + puff.dz * cosY);
          _mScale.set(puff.sx, puff.sy, puff.sz);
          _mDummy.compose(_mPos, _mQuat, _mScale);
          mesh.setMatrixAt(b * PUFFS_PER_BANK + p, _mDummy);
        }
      }
    }
    if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;

    return mesh;
  }

  function buildSunbeamsRig(THREERef) {
    const GroupCtor = THREERef.Group || THREERef.Object3D;
    if (!GroupCtor || !THREERef.Mesh || (!THREERef.CylinderGeometry && !THREERef.ConeGeometry)) return null;

    const group = new GroupCtor('UnderwaterSunbeams');
    const geo = THREERef.CylinderGeometry
      ? new THREERef.CylinderGeometry(0.32, 1.45, 1.0, 10, 1, true)
      : new THREERef.ConeGeometry(1.4, 1.0, 10, 1, true);

    const mat = new THREERef.MeshBasicMaterial({
      color: 0x8cf4e4,
      transparent: true,
      opacity: 0.14,
      blending: THREERef.AdditiveBlending !== undefined ? THREERef.AdditiveBlending : 2,
      depthWrite: false,
      side: THREERef.DoubleSide !== undefined ? THREERef.DoubleSide : 2,
      fog: false,
    });

    // Interleave Sunken Bay (indices 0..3, 6..13) and Canyon Oasis spring (4..5, 14..15)
    // so Balanced mode (6 shafts) lights both underwater sites cleanly.
    const anchors = [
      [-14, 86], [-19, 92], [-8, 82], [-22, 78],
      [-76, -14], [-79, -11],
      [-10, 96], [-26, 88], [-4, 74], [-17, 69],
      [-29, 95], [-6, 90], [-20, 102], [-12, 76],
      [-73, -17], [-74, -12],
    ];

    const activeRays = QUALITY_COUNTS[_qualityMode].rays;
    for (let i = 0; i < MAX_RAYS; i++) {
      const ax = anchors[i][0] + (seededRand(i, 30) - 0.5) * 4.5;
      const az = anchors[i][1] + (seededRand(i, 31) - 0.5) * 4.5;
      const len = 9.0 + seededRand(i, 32) * 4.0;
      const radiusScale = 0.85 + seededRand(i, 33) * 0.75;
      const shaft = new THREERef.Mesh(geo, mat);
      shaft.position.set(ax, -len * 0.48, az);
      shaft.scale.set(radiusScale, len, radiusScale);
      shaft.frustumCulled = false;
      shaft.renderOrder = 3;
      shaft.userData = {
        active: i < activeRays,
        bx: ax,
        bz: az,
        len,
        radiusScale,
        phase: seededRand(i, 34) * Math.PI * 2,
      };
      shaft.visible = i < activeRays;
      group.add(shaft);
    }

    group.userData = { sharedMat: mat };
    group.renderOrder = 3;
    group.visible = false;
    return group;
  }

  function buildMotesRig(THREERef) {
    if (!THREERef.InstancedMesh) return null;
    const geo = THREERef.IcosahedronGeometry
      ? new THREERef.IcosahedronGeometry(0.085, 0)
      : (THREERef.SphereGeometry ? new THREERef.SphereGeometry(0.085, 6, 4) : null);
    if (!geo) return null;

    const mat = new THREERef.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });

    const mesh = new THREERef.InstancedMesh(geo, mat, MAX_MOTES);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    mesh.count = QUALITY_COUNTS[_qualityMode].motes;

    _moteSeeds = [];
    ensureScratch(THREERef);
    if (_scratchReady) _mQuat.identity();
    for (let i = 0; i < MAX_MOTES; i++) {
      const seed = {
        rx: (seededRand(i, 40) - 0.5) * MOTE_WRAP_XZ,
        ry: seededRand(i, 41) * MOTE_WRAP_Y,
        rz: (seededRand(i, 42) - 0.5) * MOTE_WRAP_XZ,
        phase: seededRand(i, 43) * Math.PI * 2,
        speed: 0.65 + seededRand(i, 44) * 0.95,
        size: 0.65 + seededRand(i, 45) * 0.95,
        mix: seededRand(i, 46),
      };
      _moteSeeds.push(seed);
      if (_scratchReady) {
        _mPos.set(seed.rx, 1.0 + seed.ry, seed.rz);
        _mScale.set(seed.size, seed.size, seed.size);
        _mDummy.compose(_mPos, _mQuat, _mScale);
        mesh.setMatrixAt(i, _mDummy);
      }
      if (_mColor && typeof mesh.setColorAt === 'function') {
        _mColor.setRGB(1.0, 0.92, 0.56);
        mesh.setColorAt(i, _mColor);
      }
    }
    if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    _activeMoteBiome = '';
    _motesDirtyColor = true;
    return mesh;
  }

  function initScene(scene, deps) {
    if (!scene) return null;
    if (_rig && _rig.scene === scene) return _rig;

    const cfg = deps || {};
    const THREERef = cfg.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const ShadersRef = cfg.Shaders || (typeof Shaders !== 'undefined' ? Shaders : null);
    if (!THREERef) return null;

    ensureScratch(THREERef);
    _scene = scene;

    const stars = buildStarfieldRig(THREERef, ShadersRef);
    const clouds = buildCloudRig(THREERef, ShadersRef);
    const sunbeams = buildSunbeamsRig(THREERef);
    const motes = buildMotesRig(THREERef);

    if (stars && typeof scene.add === 'function') scene.add(stars);
    if (clouds && typeof scene.add === 'function') scene.add(clouds);
    if (sunbeams && typeof scene.add === 'function') scene.add(sunbeams);
    if (motes && typeof scene.add === 'function') scene.add(motes);

    _rig = {
      scene,
      stars,
      clouds,
      sunbeams,
      motes,
      quality: _qualityMode,
    };
    return _rig;
  }

  function setQuality(mode) {
    _qualityMode = mode === 'fast' || mode === 'balanced' ? mode : 'high';
    const counts = QUALITY_COUNTS[_qualityMode] || QUALITY_COUNTS.high;
    if (!_rig) return _qualityMode;

    _rig.quality = _qualityMode;
    if (_rig.stars && _rig.stars.geometry && typeof _rig.stars.geometry.setDrawRange === 'function') {
      _rig.stars.geometry.setDrawRange(0, counts.stars);
    }
    if (_rig.clouds) {
      _rig.clouds.count = counts.clouds;
    }
    if (_rig.sunbeams && _rig.sunbeams.children) {
      const list = _rig.sunbeams.children;
      for (let i = 0; i < list.length; i++) {
        const active = i < counts.rays;
        list[i].userData.active = active;
        list[i].visible = active;
      }
    }
    if (_rig.motes) {
      _rig.motes.count = counts.motes;
      _motesDirtyColor = true;
    }
    return _qualityMode;
  }

  function getQuality() {
    return _qualityMode;
  }

  function update(dt, time, ctx) {
    const stepDt = dt || 0;
    const t = time || 0;

    if (_lit >= 8) {
      if (ctx && ctx.cycleTime !== undefined) {
        _cycleTime = ctx.cycleTime;
      } else {
        _cycleTime = (_cycleTime + (stepDt > 0 ? stepDt : 0)) % CYCLE_DURATION;
      }
    }
    computeCelestialState(_lit, _cycleTime, _celState);

    if (typeof Shaders !== 'undefined' && typeof Shaders.setCelestial === 'function') {
      Shaders.setCelestial(_celState.moonDir, _celState.moonColor, _celState.nightFactor);
    }
    updateWind(t, _windState);

    if (!_rig || !_scratchReady) return;

    const px = ctx && ctx.px !== undefined ? ctx.px : 0;
    const py = ctx && ctx.py !== undefined ? ctx.py : 2;
    const pz = ctx && ctx.pz !== undefined ? ctx.pz : 0;
    const camY = ctx && ctx.camY !== undefined ? ctx.camY : py + 3;
    const waterY = ctx && ctx.waterY !== undefined ? ctx.waterY : 0;

    // 1. Spectral Starfield (strictly invisible in daytime when alpha <= 0.002)
    if (_rig.stars) {
      _rig.stars.position.set(px, 0, pz);
      const starAlpha = _celState.starAlpha;
      _rig.stars.visible = starAlpha > 0.002;
      if (_rig.stars.material && _rig.stars.material.uniforms && _rig.stars.material.uniforms.uStarAlpha) {
        _rig.stars.material.uniforms.uStarAlpha.value = starAlpha;
      }
    }

    // 2. 3D Volumetric Cumulus Cloud Deck (torus-wrapped around player)
    if (_rig.clouds && _cloudBanks) {
      const activeBanks = QUALITY_COUNTS[_qualityMode].cloudBanks;
      const offX = _windState.cloudOffX;
      const offZ = _windState.cloudOffZ;
      for (let b = 0; b < activeBanks; b++) {
        const bank = _cloudBanks[b];
        const wx = px + wrapSigned(bank.baseX + offX * bank.speedMul - px, CLOUD_WRAP_SPAN);
        const wz = pz + wrapSigned(bank.baseZ + offZ * bank.speedMul - pz, CLOUD_WRAP_SPAN);
        const cosY = Math.cos(bank.yaw);
        const sinY = Math.sin(bank.yaw);
        if (_mEuler) _mEuler.set(0, bank.yaw, 0);
        if (_mEuler) _mQuat.setFromEuler(_mEuler);
        else _mQuat.identity();

        for (let p = 0; p < PUFFS_PER_BANK; p++) {
          const puff = bank.puffs[p];
          const rx = puff.dx * cosY - puff.dz * sinY;
          const rz = puff.dx * sinY + puff.dz * cosY;
          _mPos.set(wx + rx, bank.alt + puff.dy, wz + rz);
          _mScale.set(puff.sx, puff.sy, puff.sz);
          _mDummy.compose(_mPos, _mQuat, _mScale);
          _rig.clouds.setMatrixAt(b * PUFFS_PER_BANK + p, _mDummy);
        }
      }
      if (_rig.clouds.instanceMatrix) _rig.clouds.instanceMatrix.needsUpdate = true;
    }

    // 3. Underwater Volumetric Sunbeams (hidden above water or deep night)
    const isCamUnder = ctx && ctx.underwater !== undefined ? !!ctx.underwater : camY < waterY - 0.08;
    const isDeepNight = _celState.nightFactor > 0.94 && _celState.sunDir.y < -0.15;
    if (_rig.sunbeams) {
      const showRays = isCamUnder && !isDeepNight;
      _rig.sunbeams.visible = showRays;
      if (showRays) {
        const dayVis = 1.0 - _celState.nightFactor * 0.85;
        const sharedMat = _rig.sunbeams.userData && _rig.sunbeams.userData.sharedMat;
        if (sharedMat) {
          sharedMat.opacity = (0.12 + 0.035 * Math.sin(t * 1.4)) * dayVis;
          if (sharedMat.color && typeof sharedMat.color.lerpColors === 'function') {
            sharedMat.color.lerpColors(_rayBaseColor, _rayNightColor, _celState.nightFactor);
          }
        }
        // Point local +Y upward toward the refracted sun vector so narrow 0.32 top stays at waterY
        _rayDir.set(
          _celState.sunDir.x * 0.32,
          1.0,
          _celState.sunDir.z * 0.32
        ).normalize();
        if (typeof _rayQuat.setFromUnitVectors === 'function') {
          _rayQuat.setFromUnitVectors(_rayUp, _rayDir);
        }
        const activeRays = QUALITY_COUNTS[_qualityMode].rays;
        const shafts = _rig.sunbeams.children;
        for (let i = 0; i < shafts.length; i++) {
          const sh = shafts[i];
          const active = i < activeRays;
          sh.visible = active;
          if (!active) continue;
          const ud = sh.userData;
          const sway = Math.sin(t * 0.9 + ud.phase) * 0.45;
          sh.position.set(ud.bx + sway, waterY - ud.len * 0.48, ud.bz + Math.cos(t * 0.7 + ud.phase) * 0.35);
          sh.quaternion.copy(_rayQuat);
        }
      }
    }

    // 4. Ambient Biome Motes (pooled InstancedMesh adapting to biome & depth)
    if (_rig.motes && _moteSeeds && _motePalettes) {
      const isPlayerUnder = ctx && ctx.underwater !== undefined ? !!ctx.underwater : (py < waterY - 0.35 || camY < waterY - 0.15);
      let regId = ctx && ctx.regionId ? ctx.regionId : 'wilds';
      if (!ctx || !ctx.regionId) {
        if (typeof Regions !== 'undefined' && typeof Regions.regionAt === 'function') {
          const reg = Regions.regionAt(px, pz);
          if (reg && reg.id) regId = reg.id;
        }
      }

      let biomeKey = 'meadow';
      if (isPlayerUnder || (regId === 'sunkenCity' && py < waterY + 0.2)) {
        biomeKey = 'underwater';
      } else if (regId === 'frostpeak') {
        biomeKey = 'frostpeak';
      } else if (regId === 'whisperingForest') {
        biomeKey = 'whisperingForest';
      } else if (regId === 'canyonOasis') {
        biomeKey = 'canyonOasis';
      } else if (regId === 'twilightCoast') {
        biomeKey = 'twilightCoast';
      }

      const activeMotes = QUALITY_COUNTS[_qualityMode].motes;
      if (biomeKey !== _activeMoteBiome || _motesDirtyColor) {
        _activeMoteBiome = biomeKey;
        _motesDirtyColor = false;
        const pair = _motePalettes[biomeKey] || _motePalettes.meadow;
        for (let i = 0; i < activeMotes; i++) {
          _mColor.lerpColors(pair[0], pair[1], _moteSeeds[i].mix);
          _rig.motes.setColorAt(i, _mColor);
        }
        if (_rig.motes.instanceColor) _rig.motes.instanceColor.needsUpdate = true;
      }

      const wDx = _windState.dirX;
      const wDz = _windState.dirZ;
      const wStr = _windState.strength;
      const isSnow = biomeKey === 'frostpeak';
      const isAqua = biomeKey === 'underwater';
      const isFirefly = biomeKey === 'whisperingForest';

      _mQuat.identity();
      for (let i = 0; i < activeMotes; i++) {
        const s = _moteSeeds[i];
        const driftScale = biomeKey === 'canyonOasis' ? 2.4 : 1.0;
        const mx = px + wrapSigned(s.rx + t * wDx * s.speed * wStr * driftScale + Math.sin(t * 0.7 + s.phase) * 0.9 - px, MOTE_WRAP_XZ);
        const mz = pz + wrapSigned(s.rz + t * wDz * s.speed * wStr * driftScale + Math.cos(t * 0.65 + s.phase) * 0.9 - pz, MOTE_WRAP_XZ);
        const vertRate = isSnow ? -0.95 * s.speed : (isAqua ? 0.55 * s.speed : 0.14 * s.speed);
        let my = py + 0.35 + ((s.ry + t * vertRate + Math.sin(t * 1.2 + s.phase) * 0.45) % MOTE_WRAP_Y);
        if (my < py + 0.35) my += MOTE_WRAP_Y;
        if (isAqua && my > waterY - 0.15) my = waterY - 0.25 - (s.ry % 4.5);

        const pulse = isFirefly ? (0.65 + 0.55 * Math.sin(t * 3.8 + s.phase)) : (0.85 + 0.22 * Math.sin(t * 2.1 + s.phase));
        const sc = s.size * pulse;
        _mPos.set(mx, my, mz);
        _mScale.set(sc, sc, sc);
        _mDummy.compose(_mPos, _mQuat, _mScale);
        _rig.motes.setMatrixAt(i, _mDummy);
      }
      if (_rig.motes.instanceMatrix) _rig.motes.instanceMatrix.needsUpdate = true;
    }
  }

  function getSceneRig() {
    return _rig;
  }

  function _resetCache() {
    propCache.clear();
    pendingLoads.clear();
    pendingScripts.clear();
    readyCallbacks.clear();
    pendingInstancedSwaps.clear();
    pendingNodeSwaps.clear();
    materialCache.clear();
    _disposedChunks = new WeakSet();
    _chunkEntries = new WeakMap();
    _lit = 0;
    _cycleTime = 0;
    _qualityMode = 'high';
    _scene = null;
    _rig = null;
    _cloudBanks = null;
    _moteSeeds = null;
    _activeMoteBiome = '';
    _motesDirtyColor = true;
    computeCelestialState(0, 0, _celState);
    updateWind(0, _windState);
  }

  const api = {
    PROP_KEYS,
    CANONICAL_HEIGHTS,
    SLOT_MATERIAL_MAP,
    QUALITY_COUNTS,
    resolveAssetSource,
    preloadProp,
    preloadAll,
    getProp,
    onPropReady,
    registerInstancedSwap,
    registerChunkSlot,
    unregisterChunk,
    registerNodeSwap,
    _resetCache,
    computeCelestialState,
    setSkyProgress,
    getCelestialState,
    updateWind,
    getWindGust,
    initScene,
    setQuality,
    getQuality,
    update,
    getSceneRig,
  };

  if (typeof window !== 'undefined') window.Env = api;
  return api;
})();
