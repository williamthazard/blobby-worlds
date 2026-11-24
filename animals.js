// ============================================================
// animals.js - Living Skinned Animals, Physics & Ecosystem
//
// Part 1: AnimalRig (Dual-Mode Lazy Loader, SkeletonUtils.clone,
//         PBR Coat Restyling, Bone Attachments & AnimationMixer)
// Part 2: AnimalPhysics (Acceleration Inertia, Auto-Vault, Slope Discipline, Buoyancy)
// Part 3: AnimalAI (Rare Starlight Species, Living Wild Ecosystem, Flanking Pack,
//         Species-Distinct Combat, 3D Boids Schooling & Wish Pursuit)
//
// Consumes globals: THREE, Models, Textures, Shaders, Physics
// Exports global:   Animals
// ============================================================

const Animals = (() => {
  'use strict';

  // ---------- 0. Pre-allocated Scratch Math & Shared Helpers ----------

  let _axisX = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(1, 0, 0) : { x: 1, y: 0, z: 0 };
  let _axisY = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(0, 1, 0) : { x: 0, y: 1, z: 0 };
  let _axisZ = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(0, 0, 1) : { x: 0, y: 0, z: 1 };
  let _qYaw = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;
  let _qPitch = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;
  let _qScratch = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;

  const _defaultAnimState = {
    mode: 'idle',
    speed: 0,
    refSpeed: 3.2,
    airborne: false,
    inWater: false,
    hurtFlash: 0,
    isMoving: false,
    facingYaw: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
  };
  const _procAnimOpts = { idleTime: 0, airborne: false };

  // Pre-allocated zero-GC scratch buffers for AnimalPhysics
  const _physNorm = { x: 0, y: 1, z: 0 };
  const _physCurNorm = { x: 0, y: 1, z: 0 };
  const _physColBuf = [];
  const _physColOut = { x: 0, z: 0, hit: false };
  const _physLandRes = { moved: 0, jumped: false, landed: false, inWater: false };
  const _physAirRes = { moved: 0, jumped: false, landed: false, inWater: false };
  const _physAquaRes = { moved: 0, inWater: true };
  const _physDefaultCtx = {};

  // Pre-allocated zero-GC scratch objects for AnimalAI
  const _aiAnimState = {
    mode: null,
    speed: 0,
    refSpeed: 3.2,
    airborne: false,
    inWater: false,
    hurtFlash: 0,
    isMoving: false,
    facingYaw: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
  };
  const _aiProcOpts = { idleTime: 0, airborne: false };
  const _aiBoltDir = typeof THREE !== 'undefined' && THREE.Vector3
    ? new THREE.Vector3(1, 0, 0)
    : { x: 1, y: 0, z: 0 };
  const _aiDefaultPlayer = { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false, swimming: false };

  function ensureScratchMath(THREERef) {
    if (!_qYaw && THREERef && typeof THREERef.Quaternion === 'function') {
      _qYaw = new THREERef.Quaternion();
      _qPitch = new THREERef.Quaternion();
      _qScratch = new THREERef.Quaternion();
    }
    if (THREERef && typeof THREERef.Vector3 === 'function' && typeof _axisX.set !== 'function') {
      _axisX = new THREERef.Vector3(1, 0, 0);
      _axisY = new THREERef.Vector3(0, 1, 0);
      _axisZ = new THREERef.Vector3(0, 0, 1);
    }
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function getGlobalObj() {
    if (typeof window !== 'undefined' && window) return window;
    if (typeof globalThis !== 'undefined' && globalThis) return globalThis;
    return {};
  }

  // ---------- 1. AnimalRig ----------

  const SPECIES_TO_ARCHETYPE = {
    'Frost Fox': 'fox',
    'Aurora Fox': 'fox',
    'Moss Lynx': 'fox',
    'Starlight Unicorn': 'unicorn',
    'Astral Unicorn': 'unicorn',
    'Timber Wolf': 'wolf',
    'Eclipse Wolf': 'wolf',
    'Woodland Cub': 'wolf',
    'Celestial Stag': 'stag',
    'Ember Drake': 'drake',
    'Starfire Drake': 'drake',
    'Berry Beetle': 'beetle',
    'Lantern Firefly': 'firefly',
    'Cloud Wren': 'bird',
    'Golden Owl': 'bird',
    'Solar Owl': 'bird',
    'Wish': 'bird',
    'Meadow Kiwi': 'kiwi',
    'Seafoam Fin': 'fish_tang',
    'Coral Dart': 'fish_koi',
    'Kelp Eel': 'eel',
    'Starlight Manta': 'manta',
    'Moon Jelly': 'jelly',
  };

  const ARCHETYPE_ALIASES = {
    fox: 'fox',
    cat: 'fox',
    lynx: 'fox',
    quad: 'fox',
    unicorn: 'unicorn',
    deer: 'unicorn',
    horse: 'unicorn',
    wolf: 'wolf',
    bear: 'wolf',
    stag: 'stag',
    drake: 'drake',
    lizard: 'drake',
    beetle: 'beetle',
    bug: 'beetle',
    firefly: 'firefly',
    bird: 'bird',
    songbird: 'bird',
    owl: 'bird',
    parrot: 'bird',
    kiwi: 'kiwi',
    fish_tang: 'fish_tang',
    fish: 'fish_tang',
    fish_koi: 'fish_koi',
    eel: 'eel',
    manta: 'manta',
    jelly: 'jelly',
  };

  const SPECIES_SCALES = {
    'Golden Owl': 1.32,
    'Solar Owl': 1.32,
    'Cloud Wren': 0.78,
    'Wish': 0.76,
    'Celestial Stag': 1.08,
    'Moss Lynx': 1.04,
    'Astral Unicorn': 1.04,
    'Eclipse Wolf': 1.06,
    'Starfire Drake': 1.08,
    'Meadow Kiwi': 0.95,
    'Kelp Eel': 1.15,
    'Starlight Manta': 1.15,
  };

  const DEFAULT_REF_SPEEDS = {
    fox: { walk: 2.8, run: 5.8 },
    unicorn: { walk: 3.2, run: 6.6 },
    wolf: { walk: 3.0, run: 6.2 },
    stag: { walk: 3.2, run: 6.8 },
    drake: { walk: 2.9, run: 6.0 },
    beetle: { walk: 2.2, run: 4.5 },
    firefly: { walk: 2.4, run: 4.8, fly: 3.6 },
    bird: { walk: 2.6, run: 5.2, fly: 4.2 },
    kiwi: { walk: 2.6, run: 5.2 },
    fish_tang: { swim: 2.6, swimFast: 5.2 },
    fish_koi: { swim: 2.6, swimFast: 5.2 },
    eel: { swim: 2.5, swimFast: 4.8 },
    manta: { swim: 2.4, swimFast: 4.6 },
  };

  // Curated per-species PBR slot restyling table (sRGB hex colors, linearized once at creation)
  const SPECIES_PALETTES = {
    'Frost Fox': {
      tex: 'fur',
      slots: {
        Main: { color: 0xbfe3f0, roughness: 0.76 },
        Main_Light: { color: 0xeef7fc, roughness: 0.74 },
        Grey: { color: 0x6a8ca8, roughness: 0.78 },
        Black: { color: 0x1e2838, roughness: 0.55 },
        Eyes: { tex: null, color: 0x5ed4ff, emissive: 0x1c6896, emissiveIntensity: 0.35, roughness: 0.16, metalness: 0.08 },
      },
    },
    'Aurora Fox': {
      tex: 'fur',
      slots: {
        Main: { color: 0x7df0e4, emissive: 0x1a6870, emissiveIntensity: 0.24, roughness: 0.64 },
        Main_Light: { color: 0xf4fbff, emissive: 0x264860, emissiveIntensity: 0.16, roughness: 0.62 },
        Grey: { color: 0x5c58a6, emissive: 0x1d1a4c, emissiveIntensity: 0.18, roughness: 0.68 },
        Black: { color: 0x1b1e36, roughness: 0.50 },
        Eyes: { tex: null, color: 0xffdf68, emissive: 0xffaa24, emissiveIntensity: 0.55, roughness: 0.14 },
      },
    },
    'Moss Lynx': {
      tex: 'fur',
      slots: {
        Main: { color: 0x82c462, roughness: 0.78 },
        Main_Light: { color: 0xebdeb6, roughness: 0.74 },
        Grey: { color: 0x4d7640, roughness: 0.80 },
        Black: { color: 0x222a1e, roughness: 0.56 },
        Eyes: { tex: null, color: 0xffcf48, emissive: 0x6b4d12, emissiveIntensity: 0.28, roughness: 0.16 },
      },
    },
    'Starlight Unicorn': {
      tex: 'fur',
      slots: {
        Main: { color: 0xc2a8ee, roughness: 0.62, metalness: 0.06 },
        Main_Light: { color: 0xf2ecff, roughness: 0.60, metalness: 0.05 },
        Hair: { color: 0x7a56ce, emissive: 0x2c1b63, emissiveIntensity: 0.26, roughness: 0.52 },
        Muzzle: { color: 0xd9c2ec, roughness: 0.64 },
        Hooves: { tex: null, color: 0xdeb65c, roughness: 0.34, metalness: 0.48 },
        Eye_Black: { tex: null, color: 0x1b1936, roughness: 0.14, metalness: 0.08 },
        Eye_White: { tex: null, color: 0xf8f6ff, roughness: 0.22 },
      },
    },
    'Astral Unicorn': {
      tex: 'fur',
      slots: {
        Main: { color: 0xe6d6ff, emissive: 0x452d82, emissiveIntensity: 0.22, roughness: 0.54, metalness: 0.10 },
        Main_Light: { color: 0xffffff, emissive: 0x3b356e, emissiveIntensity: 0.18, roughness: 0.50 },
        Hair: { color: 0x76e8fa, emissive: 0x2b86a8, emissiveIntensity: 0.44, roughness: 0.44 },
        Muzzle: { color: 0xf0e5ff, roughness: 0.58 },
        Hooves: { tex: null, color: 0xffdc68, emissive: 0x805a10, emissiveIntensity: 0.25, roughness: 0.26, metalness: 0.65 },
        Eye_Black: { tex: null, color: 0x283072, emissive: 0x3858b0, emissiveIntensity: 0.45, roughness: 0.14 },
        Eye_White: { tex: null, color: 0xffffff, roughness: 0.20 },
      },
    },
    'Timber Wolf': {
      tex: 'fur',
      slots: {
        Main: { color: 0x8e6947, roughness: 0.80 },
        Main_Light: { color: 0xd7c1a2, roughness: 0.76 },
        Nose: { tex: null, color: 0x1e1916, roughness: 0.45 },
        Eyes_Black: { tex: null, color: 0xd99228, emissive: 0x523108, emissiveIntensity: 0.32, roughness: 0.16 },
      },
    },
    'Woodland Cub': {
      tex: 'fur',
      slots: {
        Main: { color: 0x9b7653, roughness: 0.82 },
        Main_Light: { color: 0xddc09c, roughness: 0.78 },
        Nose: { tex: null, color: 0x221a16, roughness: 0.48 },
        Eyes_Black: { tex: null, color: 0x2b1e14, roughness: 0.18 },
      },
    },
    'Eclipse Wolf': {
      tex: 'fur',
      slots: {
        Main: { color: 0x363d68, emissive: 0x1b2144, emissiveIntensity: 0.25, roughness: 0.70 },
        Main_Light: { color: 0xc4d4f8, emissive: 0x283b6a, emissiveIntensity: 0.20, roughness: 0.66 },
        Nose: { tex: null, color: 0x141728, roughness: 0.42 },
        Eyes_Black: { tex: null, color: 0xffe066, emissive: 0xffb326, emissiveIntensity: 0.65, roughness: 0.14 },
      },
    },
    'Celestial Stag': {
      tex: 'fur',
      slots: {
        'Material.003': { color: 0xf6ecd4, emissive: 0x4c3d1e, emissiveIntensity: 0.20, roughness: 0.60, metalness: 0.08 },
        Material: { color: 0xfff8e8, emissive: 0x3f331c, emissiveIntensity: 0.16, roughness: 0.62 },
        'Material.010': { tex: null, color: 0x453826, roughness: 0.46, metalness: 0.22 },
        'Material.001': { tex: null, color: 0xffe796, emissive: 0xffc646, emissiveIntensity: 0.56, roughness: 0.26, metalness: 0.55 },
        'Material.011': { tex: null, color: 0xffd24a, emissive: 0xffa61e, emissiveIntensity: 0.45, roughness: 0.16 },
      },
    },
    'Ember Drake': {
      tex: 'scales',
      slots: {
        Brown: { color: 0xe86438, roughness: 0.46, metalness: 0.10 },
        LightBrown: { color: 0xffaa68, emissive: 0x5c2208, emissiveIntensity: 0.22, roughness: 0.44, metalness: 0.08 },
        Black: { tex: null, color: 0x201a22, roughness: 0.34, metalness: 0.14 },
      },
    },
    'Starfire Drake': {
      tex: 'scales',
      slots: {
        Brown: { color: 0xe84878, emissive: 0x5e1634, emissiveIntensity: 0.28, roughness: 0.40, metalness: 0.16 },
        LightBrown: { color: 0xffd268, emissive: 0x804210, emissiveIntensity: 0.32, roughness: 0.38, metalness: 0.18 },
        Black: { tex: null, color: 0x1d1730, roughness: 0.30, metalness: 0.18 },
      },
    },
    'Berry Beetle': {
      tex: 'scales',
      preserveEmbeddedMap: true,
      slots: {
        Material: { color: 0xf49ca4, roughness: 0.32, metalness: 0.12 },
      },
    },
    'Lantern Firefly': {
      tex: 'scales',
      slots: {
        Black: { color: 0x1e3028, roughness: 0.42, metalness: 0.14 },
        Orange: { color: 0x72be4e, roughness: 0.46, metalness: 0.10 },
        Yellow: { tex: null, color: 0xffe860, emissive: 0xffb824, emissiveIntensity: 0.72, roughness: 0.22, metalness: 0.08 },
        LightBlue: { tex: null, color: 0xcdf6ff, emissive: 0x4ca8c8, emissiveIntensity: 0.25, roughness: 0.18, transparent: true, opacity: 0.72 },
      },
    },
    'Cloud Wren': {
      tex: 'feather',
      slots: {
        __default: { color: 0xeef6fc, roughness: 0.72, metalness: 0.04, vertexColors: false },
      },
    },
    'Golden Owl': {
      tex: 'feather',
      slots: {
        __default: { color: 0xe8c254, roughness: 0.70, metalness: 0.06, vertexColors: false },
      },
    },
    'Solar Owl': {
      tex: 'feather',
      slots: {
        __default: { color: 0xffe064, emissive: 0xffaa20, emissiveIntensity: 0.30, roughness: 0.56, metalness: 0.14, vertexColors: false },
      },
    },
    'Wish': {
      tex: 'feather',
      slots: {
        __default: { color: 0xffe04a, emissive: 0xffb820, emissiveIntensity: 0.30, roughness: 0.54, metalness: 0.12, vertexColors: false },
      },
    },
    'Meadow Kiwi': {
      tex: 'feather',
      preserveEmbeddedMap: true,
      slots: {
        lambert1: { color: 0xf4dec4, roughness: 0.78, metalness: 0.04 },
      },
    },
    'Seafoam Fin': {
      tex: 'scales',
      slots: {
        BlueTang_Main: { color: 0x6ad9d0, roughness: 0.34, metalness: 0.14 },
        BlueTang_Dark: { color: 0x246a7a, roughness: 0.36, metalness: 0.14 },
        BlueTang_Fins: { color: 0x9df5e8, roughness: 0.38, metalness: 0.10 },
        Eyes: { tex: null, color: 0x16202c, roughness: 0.14 },
      },
    },
    'Coral Dart': {
      tex: 'scales',
      slots: {
        Koi_Main: { color: 0xf78ea8, roughness: 0.34, metalness: 0.12 },
        Koi_Light: { color: 0xfff0ec, roughness: 0.36, metalness: 0.08 },
        Koi_Dark: { color: 0xd44e74, roughness: 0.38, metalness: 0.12 },
        Koi_Fins: { color: 0xffc4d4, roughness: 0.40, metalness: 0.08 },
        Eyes: { tex: null, color: 0x1a1822, roughness: 0.14 },
      },
    },
    'Kelp Eel': {
      tex: 'scales',
      slots: {
        DarkGreen: { color: 0x3e9654, roughness: 0.38, metalness: 0.10 },
        LightGreen: { color: 0x76d67e, roughness: 0.40, metalness: 0.08 },
        Yellow: { color: 0xb8ff7a, emissive: 0x3b8a28, emissiveIntensity: 0.32, roughness: 0.32 },
        Purple: { color: 0x4ca866, roughness: 0.40 },
        Red: { color: 0x54b472, roughness: 0.42 },
        DarkRed: { color: 0x347c4c, roughness: 0.44 },
        Teeth: { tex: null, color: 0xf0f8ee, roughness: 0.28 },
      },
    },
    'Starlight Manta': {
      tex: 'scales',
      slots: {
        Top: { color: 0x2f5498, emissive: 0x1a567c, emissiveIntensity: 0.30, roughness: 0.36, metalness: 0.16 },
        Bottom: { color: 0xb4e6f8, emissive: 0x16384d, emissiveIntensity: 0.12, roughness: 0.40, metalness: 0.08 },
      },
    },
  };

  const templateCache = new Map();
  const pendingLoads = new Map();
  const pendingScripts = new Map();
  const materialCache = new Map();
  let _wildHinted = false;

  function _resetCache() {
    templateCache.clear();
    pendingLoads.clear();
    pendingScripts.clear();
    materialCache.clear();
    _wildHinted = false;
  }

  function speciesToArchetype(species) {
    if (!species) return 'fox';
    const name = typeof species === 'string' ? species : species.name;
    if (name && SPECIES_TO_ARCHETYPE[name]) {
      return SPECIES_TO_ARCHETYPE[name];
    }
    if (typeof species === 'object') {
      const arch = species.archetype && String(species.archetype).toLowerCase();
      if (arch && ARCHETYPE_ALIASES[arch]) return ARCHETYPE_ALIASES[arch];
      const plan = species.plan && String(species.plan).toLowerCase();
      if (plan && ARCHETYPE_ALIASES[plan]) return ARCHETYPE_ALIASES[plan];
    } else if (typeof species === 'string') {
      const low = species.toLowerCase();
      if (ARCHETYPE_ALIASES[low]) return ARCHETYPE_ALIASES[low];
    }
    return 'fox';
  }

  function resolveAssetSource(key, protocol) {
    const p = protocol || (typeof location !== 'undefined' && location ? location.protocol : 'https:');
    if (p === 'file:') {
      return { mode: 'file-bundle', url: `./assets/animals/${key}.glb.js` };
    }
    return { mode: 'glb', url: `./assets/animals/${key}.glb` };
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function loadFileBundleScript(key, scriptUrl, deps, onReady, onError) {
    const g = (deps && deps.window) || getGlobalObj();
    const map = g && g.__ANIMAL_GLB_B64__;
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
      const b64Map = g && g.__ANIMAL_GLB_B64__;
      const b64 = b64Map && b64Map[key];
      if (typeof b64 === 'string' && b64.length > 0) {
        for (let i = 0; i < waiters.length; i++) waiters[i].onReady(b64);
      } else {
        const err = new Error(`${scriptUrl} loaded without __ANIMAL_GLB_B64__['${key}']`);
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

  function sanitizeAnimationClips(clips) {
    if (!Array.isArray(clips)) return [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (c && Array.isArray(c.tracks)) {
        c.tracks = c.tracks.filter((tr) => {
          if (!tr || !tr.times || !tr.values) return true;
          const vs = typeof tr.getValueSize === 'function' ? tr.getValueSize() : 0;
          return !vs || tr.times.length * vs === tr.values.length;
        });
      }
    }
    return clips;
  }

  function preloadArchetype(key, onReady, onError, deps) {
    if (!key || key === 'jelly') {
      if (typeof onError === 'function') onError(new Error('No GLB archetype for ' + key));
      return;
    }
    if (templateCache.has(key)) {
      if (typeof onReady === 'function') onReady(templateCache.get(key));
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
      const boneNames = [];
      if (typeof gltf.scene.traverse === 'function') {
        gltf.scene.traverse((o) => {
          if ((o.isBone || o.type === 'Bone') && o.name) boneNames.push(o.name);
        });
      }
      const template = {
        scene: gltf.scene,
        animations: sanitizeAnimationClips(gltf.animations || []),
        key,
        boneNames,
      };
      templateCache.set(key, template);
      for (let i = 0; i < waiters.length; i++) {
        if (typeof waiters[i].onReady === 'function') waiters[i].onReady(template);
      }
    };

    const finishError = (err) => {
      const waiters = pendingLoads.get(key) || [];
      pendingLoads.delete(key);
      for (let i = 0; i < waiters.length; i++) {
        if (typeof waiters[i].onError === 'function') waiters[i].onError(err);
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
              loader.parse(buf, './assets/animals/', finishReady, finishError);
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
    return (sets.fur ? 'F' : '') + (sets.feather ? 'P' : '') + (sets.scales ? 'S' : '');
  }

  function defaultTexSetForArchetype(archetype) {
    if (archetype === 'bird' || archetype === 'kiwi') return 'feather';
    if (archetype === 'drake' || archetype === 'beetle' || archetype === 'firefly' ||
        archetype === 'fish_tang' || archetype === 'fish_koi' || archetype === 'eel' || archetype === 'manta') {
      return 'scales';
    }
    return 'fur';
  }

  function getCachedSpeciesMaterial(THREERef, TexturesRef, species, archetype, origMat, isSkinned, hasMorphs, hasMorphNormals) {
    const spName = (species && species.name) || archetype;
    const origName = (origMat && origMat.name) || '';
    const palette = SPECIES_PALETTES[spName] || null;
    const slotCfg = palette
      ? (palette.slots[origName] || palette.slots.__default || null)
      : null;

    const useEmbeddedMap = !!(palette && palette.preserveEmbeddedMap && origMat && origMat.map);
    const texKey = slotCfg && slotCfg.tex !== undefined
      ? slotCfg.tex
      : (palette ? palette.tex : defaultTexSetForArchetype(archetype));

    const texSig = getTextureSig(TexturesRef);
    const customCol = (species && species.color !== undefined) ? species.color : 0xd8d8d8;
    const rareSig = species && species.rare
      ? ('R' + (species.auraColor !== undefined ? species.auraColor : ''))
      : 'N';
    const cacheKey = `${spName}|${rareSig}|${customCol}|${origName}|${isSkinned ? 'sk' : 'st'}|${hasMorphs ? (hasMorphNormals ? 'mpn' : 'mp') : ''}|${useEmbeddedMap ? 'emb' : texSig}`;
    if (materialCache.has(cacheKey)) {
      return materialCache.get(cacheKey);
    }

    const sets = TexturesRef && TexturesRef.sets ? TexturesRef.sets : null;
    const texSet = (!useEmbeddedMap && sets && texKey) ? sets[texKey] : null;

    const opts = {
      color: slotCfg && slotCfg.color !== undefined ? slotCfg.color : customCol,
      roughness: slotCfg && slotCfg.roughness !== undefined ? slotCfg.roughness : 0.72,
      metalness: slotCfg && slotCfg.metalness !== undefined ? slotCfg.metalness : 0.06,
      skinning: !!isSkinned,
      morphTargets: !!hasMorphs,
      vertexColors: false,
    };
    if (hasMorphs && hasMorphNormals) opts.morphNormals = true;
    if (slotCfg && slotCfg.emissive !== undefined) {
      opts.emissive = slotCfg.emissive;
      opts.emissiveIntensity = slotCfg.emissiveIntensity !== undefined ? slotCfg.emissiveIntensity : 0.35;
    } else if (species && species.rare) {
      opts.emissive = species.auraColor !== undefined ? species.auraColor : customCol;
      opts.emissiveIntensity = 0.16;
    }
    if (slotCfg && slotCfg.transparent) {
      opts.transparent = true;
      opts.opacity = slotCfg.opacity !== undefined ? slotCfg.opacity : 0.75;
    }

    if (useEmbeddedMap) {
      opts.map = origMat.map;
    } else if (texSet) {
      if (texSet.map) opts.map = texSet.map;
      if (texSet.normalMap) opts.normalMap = texSet.normalMap;
      if (texSet.roughnessMap) opts.roughnessMap = texSet.roughnessMap;
      if (typeof THREERef.Vector2 === 'function') {
        opts.normalScale = new THREERef.Vector2(0.45, 0.45);
      }
    }

    const mat = linearizeMat(new THREERef.MeshStandardMaterial(opts));
    mat.name = origName || spName;
    mat.needsUpdate = true;
    materialCache.set(cacheKey, mat);
    return mat;
  }

  function findBone(bones, ...candidates) {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (bones[c]) return bones[c];
      const sanitized = c.replace(/\./g, '');
      if (bones[sanitized]) return bones[sanitized];
    }
    return null;
  }

  function getAccumulatedScale(node, stopRoot) {
    let s = 1;
    let cur = node;
    while (cur && cur !== stopRoot) {
      if (cur.scale && typeof cur.scale.x === 'number') {
        s *= cur.scale.x;
      }
      cur = cur.parent;
    }
    return Math.max(0.01, s);
  }

  function mountAttachment(targetParent, cloneRoot, accent, cfg) {
    if (!targetParent || !accent) return null;
    const isBoneParent = targetParent !== cloneRoot;
    const worldScale = isBoneParent ? getAccumulatedScale(targetParent, cloneRoot) : 1;
    const invS = 1 / worldScale;
    const useSkeletalOffsets = isBoneParent && worldScale > 5;

    let pos = cfg.fallbackPos;
    let rotX = 0;
    if (useSkeletalOffsets && cfg.skelPos) {
      pos = cfg.skelPos;
      rotX = cfg.skelRotX || 0;
    } else if (isBoneParent && cfg.bonePos) {
      pos = cfg.bonePos;
    }

    const scl = (cfg.scale || 1) * (isBoneParent ? invS : 1);
    if (accent.scale && typeof accent.scale.set === 'function') {
      accent.scale.set(scl, scl, scl);
    }
    if (accent.position && typeof accent.position.set === 'function') {
      const mul = isBoneParent ? invS : 1;
      accent.position.set(pos[0] * mul, pos[1] * mul, pos[2] * mul);
    }
    if (accent.rotation && rotX !== 0) {
      accent.rotation.x = rotX;
    }
    targetParent.add(accent);
    return accent;
  }

  function attachFantasyAccents(species, archetype, cloneRoot, bones, ModelsRef) {
    if (!ModelsRef || !species) return [];
    const name = species.name || '';
    const attached = [];
    const headBone = findBone(bones, 'Head');

    if ((name === 'Starlight Unicorn' || name === 'Astral Unicorn') && typeof ModelsRef.makeUnicornHorn === 'function') {
      const horn = ModelsRef.makeUnicornHorn();
      mountAttachment(headBone || cloneRoot, cloneRoot, horn, {
        skelPos: [0, 0.11, 0.065],
        skelRotX: Math.PI * 0.44,
        bonePos: [0, 0.18, 0.08],
        fallbackPos: [0, 1.15, 0.65],
        scale: 1.12,
      });
      attached.push(horn);
    } else if (name === 'Moss Lynx' && typeof ModelsRef.makeLynxEarTufts === 'function') {
      const tufts = ModelsRef.makeLynxEarTufts(species.color);
      mountAttachment(headBone || cloneRoot, cloneRoot, tufts, {
        skelPos: [0, -0.02, 0.015],
        skelRotX: Math.PI * 0.5,
        bonePos: [0, 0.12, 0],
        fallbackPos: [0, 0.62, 0.45],
        scale: 0.85,
      });
      attached.push(tufts);
    } else if ((name === 'Ember Drake' || name === 'Starfire Drake') && typeof ModelsRef.makeDrakeEmberCrest === 'function') {
      const drakeBone = findBone(bones, 'Torso', 'Spine', 'Chest', 'Back');
      const crest = ModelsRef.makeDrakeEmberCrest();
      mountAttachment(drakeBone || cloneRoot, cloneRoot, crest, {
        skelPos: [0, -0.02, 0.06],
        skelRotX: Math.PI * 0.5,
        bonePos: [0, 0.12, 0],
        fallbackPos: [0, 0.52, 0.10],
        scale: 0.92,
      });
      attached.push(crest);
    } else if ((name === 'Golden Owl' || name === 'Solar Owl') && typeof ModelsRef.makeOwlEarTufts === 'function') {
      const tufts = ModelsRef.makeOwlEarTufts(species.color);
      mountAttachment(headBone || cloneRoot, cloneRoot, tufts, {
        skelPos: [0, 0.04, 0.02],
        bonePos: [0, 0.04, 0.02],
        fallbackPos: [0, 0.032, 0.235],
        scale: headBone ? 0.78 : 0.65,
      });
      attached.push(tufts);
    } else if (name === 'Lantern Firefly' && typeof ModelsRef.makeFireflyLantern === 'function') {
      const abdBone = findBone(bones, 'Abdomen', 'Abdomen2', 'Tail', 'Body');
      const lantern = ModelsRef.makeFireflyLantern();
      mountAttachment(abdBone || cloneRoot, cloneRoot, lantern, {
        skelPos: [0, 0.07, 0],
        bonePos: [0, 0, -0.08],
        fallbackPos: [0, 0, -0.10],
        scale: 0.88,
      });
      attached.push(lantern);
    } else if (name === 'Kelp Eel' && typeof ModelsRef.makeKelpFronds === 'function') {
      const eelBone = findBone(bones, 'Spine', 'Body', 'Chest');
      const fronds = ModelsRef.makeKelpFronds(species.color);
      mountAttachment(eelBone || cloneRoot, cloneRoot, fronds, {
        skelPos: [0, 0.04, 0],
        bonePos: [0, 0.04, 0],
        fallbackPos: [0, 0.05, 0],
        scale: 0.72,
      });
      attached.push(fronds);
    } else if (name === 'Wish' && typeof ModelsRef.makeWishCrown === 'function') {
      const crown = ModelsRef.makeWishCrown();
      mountAttachment(headBone || cloneRoot, cloneRoot, crown, {
        skelPos: [0, 0.08, 0.02],
        bonePos: [0, 0.08, 0.02],
        fallbackPos: [0, 0.062, 0.245],
        scale: 0.85,
      });
      attached.push(crown);
    }

    return attached;
  }

  function buildSemanticClipMap(clips) {
    const rawNames = [];
    const shortNames = [];
    for (let i = 0; i < clips.length; i++) {
      const raw = clips[i] && clips[i].name ? clips[i].name : '';
      rawNames.push(raw);
      const bar = raw.lastIndexOf('|');
      let sh = (bar >= 0 ? raw.slice(bar + 1) : raw).toLowerCase();
      sh = sh.replace(/^(velociraptor|wasp|snake)_/, '');
      shortNames.push(sh);
    }

    function pickMatch(tests) {
      for (let t = 0; t < tests.length; t++) {
        const fn = tests[t];
        for (let i = 0; i < shortNames.length; i++) {
          if (fn(shortNames[i], rawNames[i].toLowerCase())) return clips[i];
        }
      }
      return null;
    }

    const isDeathName = (s) => s === 'death' || s === 'dead' || s.includes('death') || s.includes('dead');

    const first = clips.find((_, idx) => !isDeathName(shortNames[idx])) || clips[0] || null;
    const idle = pickMatch([
      (s) => s === 'idle',
      (s) => !isDeathName(s) && s.includes('idle') && !s.includes('2') && !s.includes('headlow') && !s.includes('hit') && !s.includes('jump'),
      (s) => s === 'swimming_normal' || s === 'flying' || s === 'swim',
      (s) => s.includes('parrot'),
    ]) || first;

    const idleAlt = pickMatch([
      (s) => s === 'idle_2' || s === 'alert',
      (s) => s === 'groom' || s === 'tripod',
      (s) => !isDeathName(s) && (s.includes('headlow') || s.includes('idle_2')),
    ]) || idle;

    const eat = pickMatch([
      (s) => s === 'eating' || s === 'eat',
      (s) => !isDeathName(s) && (/(^|_)eat(ing)?($|_)/.test(s) || s === 'groom'),
      (s) => !isDeathName(s) && s.includes('headlow'),
    ]) || idleAlt;

    const sleep = pickMatch([
      (s) => !isDeathName(s) && (s === 'sleep' || s.includes('sleep')),
      (s) => !isDeathName(s) && s.includes('headlow'),
    ]) || idleAlt;

    const walk = pickMatch([
      (s) => s === 'walk',
      (s) => !isDeathName(s) && s.includes('walk') && !s.includes('back'),
      (s) => s === 'swimming_normal' || s === 'flying' || s === 'swim',
    ]) || idle;

    const run = pickMatch([
      (s) => s === 'gallop' || s === 'run',
      (s) => !isDeathName(s) && (s.includes('gallop') || s.includes('run')) && !s.includes('jump'),
      (s) => s === 'swimming_fast' || s === 'tripod',
    ]) || walk;

    const jump = pickMatch([
      (s) => s === 'gallop_jump' || s === 'jump',
      (s) => !isDeathName(s) && s.includes('jump') && !s.includes('toidle') && !s.includes('to_idle'),
      (s) => s === 'swimming_impulse',
    ]) || run;

    const attack = pickMatch([
      (s) => s === 'attack' || s === 'attack_headbutt',
      (s) => !isDeathName(s) && s.includes('attack'),
    ]) || jump;

    const hit = pickMatch([
      (s) => !isDeathName(s) && (s.includes('hitreact') || s === 'hit'),
      (s) => !isDeathName(s) && (s.includes('hit') || s === 'out_of_water'),
      (s) => !isDeathName(s) && (s.includes('jump_toidle') || s.includes('jump_to_idle')),
    ]) || idleAlt;

    const death = pickMatch([
      (s) => s === 'death' || s === 'dead',
      (s) => s.includes('death') || s.includes('dead'),
    ]) || hit;

    const swim = pickMatch([
      (s) => s === 'swimming_normal' || s === 'swim',
      (s) => s.includes('swim') && !s.includes('fast') && !s.includes('impulse'),
    ]) || walk;

    const swimFast = pickMatch([
      (s) => s === 'swimming_fast' || s === 'swimming_impulse',
      (s) => s.includes('swim') && (s.includes('fast') || s.includes('impulse')),
    ]) || (swim !== walk ? swim : run);

    const fly = pickMatch([
      (s) => s === 'flying' || s.includes('fly'),
      (s) => s.includes('parrot'),
    ]) || run;

    return {
      idle,
      idleAlt,
      eat,
      sleep,
      walk,
      run,
      jump,
      attack,
      hit,
      death,
      swim,
      swimFast,
      fly,
    };
  }

  function getRefSpeed(archetype, semantic) {
    const tbl = DEFAULT_REF_SPEEDS[archetype] || DEFAULT_REF_SPEEDS.fox;
    return tbl[semantic] || tbl.walk || tbl.swim || 3.2;
  }

  function wrapProceduralRoot(rootMesh, THREERef) {
    if (!rootMesh) return null;
    rootMesh.userData = rootMesh.userData || {};
    if (rootMesh.userData.proceduralRoot) {
      return rootMesh.userData.proceduralRoot;
    }
    const procGroup = THREERef && typeof THREERef.Group === 'function'
      ? new THREERef.Group()
      : { name: 'ProceduralRoot', children: [], visible: true, add() {} };
    procGroup.name = 'ProceduralRoot';

    if (Array.isArray(rootMesh.children) && rootMesh.children.length > 0) {
      const existing = rootMesh.children.slice();
      for (let i = 0; i < existing.length; i++) {
        const ch = existing[i];
        if (typeof rootMesh.remove === 'function') {
          rootMesh.remove(ch);
        } else {
          const idx = rootMesh.children.indexOf(ch);
          if (idx >= 0) rootMesh.children.splice(idx, 1);
          ch.parent = null;
        }
        if (typeof procGroup.add === 'function') {
          procGroup.add(ch);
        } else {
          ch.parent = procGroup;
          procGroup.children.push(ch);
        }
      }
    }

    if (typeof rootMesh.add === 'function') {
      rootMesh.add(procGroup);
    } else if (Array.isArray(rootMesh.children)) {
      procGroup.parent = rootMesh;
      rootMesh.children.push(procGroup);
    }
    rootMesh.userData.proceduralRoot = procGroup;
    return procGroup;
  }

  function attachToCritter(rootMesh, species, deps) {
    const cfg = deps || {};
    const THREERef = 'THREE' in cfg ? cfg.THREE : (typeof THREE !== 'undefined' ? THREE : null);
    const ModelsRef = 'Models' in cfg ? cfg.Models : (typeof Models !== 'undefined' ? Models : null);
    const TexturesRef = 'Textures' in cfg ? cfg.Textures : (typeof Textures !== 'undefined' ? Textures : null);
    const ShadersRef = 'Shaders' in cfg ? cfg.Shaders : (typeof Shaders !== 'undefined' ? Shaders : null);
    const SkeletonUtilsRef = cfg.SkeletonUtils || (THREERef && THREERef.SkeletonUtils);

    ensureScratchMath(THREERef);

    const archetype = speciesToArchetype(species);
    const procRoot = wrapProceduralRoot(rootMesh, THREERef);

    const state = {
      clip: 'idle',
      speed: 0,
      timeScale: 1,
      oneShot: null,
      oneShotT: 0,
      lookYaw: 0,
      lookPitch: 0,
      hurtFlash: 0,
    };

    let mixer = null;
    const actions = {};
    let activeAction = null;
    let activeSemantic = 'idle';
    let headBone = null;
    let earLBone = null;
    let earRBone = null;
    let isZUpHead = false;
    let auraSprite = null;
    let auraBaseScale = 1.1;
    const restResetBones = [];

    let hasLookTarget = false;
    let lookX = 0;
    let lookY = 0;
    let lookZ = 0;
    const twitchPhase = ((rootMesh && rootMesh.id) || 0) * 1.73;

    function setActionLoop(act, semantic) {
      if (!act) return;
      if (typeof act.setLoop === 'function' && THREERef) {
        if (semantic === 'death') {
          if (THREERef.LoopOnce !== undefined) act.setLoop(THREERef.LoopOnce, 1);
        } else {
          if (THREERef.LoopRepeat !== undefined) act.setLoop(THREERef.LoopRepeat, Infinity);
        }
      }
      act.clampWhenFinished = (semantic === 'death');
    }

    function crossFadeToSemantic(wantSemantic, fadeDur, isOneShot) {
      const nextAct = actions[wantSemantic] || actions.idle;
      if (nextAct && nextAct !== activeAction) {
        nextAct.reset();
        setActionLoop(nextAct, wantSemantic);
        if (isOneShot && THREERef && THREERef.LoopOnce !== undefined && typeof nextAct.setLoop === 'function') {
          nextAct.setLoop(THREERef.LoopOnce, 1);
        }
        if (isOneShot) nextAct.clampWhenFinished = true;
        nextAct.paused = false;
        nextAct.enabled = true;
        if (typeof nextAct.setEffectiveTimeScale === 'function') nextAct.setEffectiveTimeScale(1);
        if (typeof nextAct.setEffectiveWeight === 'function') nextAct.setEffectiveWeight(1);
        nextAct.play();
        if (activeAction && typeof activeAction.crossFadeTo === 'function') {
          activeAction.crossFadeTo(nextAct, fadeDur, false);
        }
        activeAction = nextAct;
      } else if (nextAct && !isOneShot) {
        setActionLoop(nextAct, wantSemantic);
        nextAct.paused = false;
        nextAct.enabled = true;
        if (typeof nextAct.setEffectiveWeight === 'function') nextAct.setEffectiveWeight(1);
        nextAct.play();
      } else if (nextAct && wantSemantic === 'death') {
        setActionLoop(nextAct, 'death');
        nextAct.clampWhenFinished = true;
      }
      activeSemantic = wantSemantic;
      state.clip = wantSemantic;
    }

    function selectBaseSemantic(s) {
      const m = s.mode;
      if (m && actions[m]) return m;
      if (m === 'idle' || m === 'idleAlt' || m === 'eat' || m === 'sleep' ||
          m === 'walk' || m === 'run' || m === 'jump' || m === 'attack' ||
          m === 'hit' || m === 'death' || m === 'swim' || m === 'swimFast' || m === 'fly') {
        return m;
      }
      const spd = s.speed || 0;
      const ref = s.refSpeed || 3.2;
      if (s.inWater) {
        return spd > ref * 1.15 ? 'swimFast' : 'swim';
      }
      if (s.airborne) {
        return (archetype === 'bird' || archetype === 'firefly') ? 'fly' : 'jump';
      }
      if (s.isMoving || spd > 0.25) {
        if (archetype === 'bird' || (archetype === 'firefly' && spd > 1.8)) return 'fly';
        return spd > ref * 1.25 ? 'run' : 'walk';
      }
      return 'idle';
    }

    function triggerOneShot(semanticName, duration) {
      if (!semanticName) return;
      state.oneShot = semanticName;
      state.oneShotT = semanticName === 'death'
        ? 999999
        : (duration !== undefined ? duration : 0.55);

      if (controller.ready && mixer && !controller.isShaderRig) {
        const nextAct = actions[semanticName] || actions.idle;
        if (nextAct) {
          if (nextAct !== activeAction) {
            nextAct.reset();
            if (typeof nextAct.setLoop === 'function' && THREERef && THREERef.LoopOnce !== undefined) {
              nextAct.setLoop(THREERef.LoopOnce, 1);
            }
            nextAct.clampWhenFinished = true;
            nextAct.paused = false;
            nextAct.enabled = true;
            if (typeof nextAct.setEffectiveTimeScale === 'function') nextAct.setEffectiveTimeScale(1);
            if (typeof nextAct.setEffectiveWeight === 'function') nextAct.setEffectiveWeight(1);
            nextAct.play();
            if (activeAction && typeof activeAction.crossFadeTo === 'function') {
              activeAction.crossFadeTo(nextAct, 0.07, false);
            }
            activeAction = nextAct;
          } else {
            if (nextAct !== actions.idle || semanticName === 'death') {
              nextAct.reset();
            }
            if (typeof nextAct.setLoop === 'function' && THREERef && THREERef.LoopOnce !== undefined) {
              nextAct.setLoop(THREERef.LoopOnce, 1);
            }
            nextAct.clampWhenFinished = true;
            nextAct.paused = false;
            nextAct.enabled = true;
            if (typeof nextAct.setEffectiveWeight === 'function') nextAct.setEffectiveWeight(1);
            nextAct.play();
          }
          activeSemantic = semanticName;
          state.clip = semanticName;
        }
      }
    }

    function setLookTarget(x, y, z) {
      hasLookTarget = true;
      lookX = x || 0;
      lookY = y || 0;
      lookZ = z || 0;
    }

    function clearLookTarget() {
      hasLookTarget = false;
    }

    function update(dt, time, animState) {
      const stepDt = clamp(dt || 0.016, 0, 0.1);
      const s = animState || _defaultAnimState;
      const spd = s.speed || 0;
      state.speed = spd;
      state.hurtFlash = s.hurtFlash || 0;

      if (!controller.ready) {
        if (ModelsRef && typeof ModelsRef.animateCritter === 'function' && rootMesh) {
          _procAnimOpts.idleTime = time || 0;
          _procAnimOpts.airborne = !!s.airborne;
          ModelsRef.animateCritter(rootMesh, time || 0, spd, _procAnimOpts);
        }
        return;
      }

      if (controller.isShaderRig) {
        state.clip = 'swim';
        if (ModelsRef && typeof ModelsRef.animateCritter === 'function' && rootMesh) {
          _procAnimOpts.idleTime = time || 0;
          _procAnimOpts.airborne = false;
          ModelsRef.animateCritter(rootMesh, time || 0, spd, _procAnimOpts);
        }
        return;
      }

      // 1. One-shot countdown & semantic clip routing
      if (state.oneShot) {
        if (state.oneShot !== 'death') {
          state.oneShotT -= stepDt;
          if (state.oneShotT <= 0) {
            state.oneShot = null;
            state.oneShotT = 0;
          }
        }
      }

      const wantSemantic = state.oneShot || selectBaseSemantic(s);
      if (wantSemantic !== activeSemantic) {
        const isFast = wantSemantic === 'attack' || wantSemantic === 'hit' ||
          wantSemantic === 'jump' || wantSemantic === 'death' ||
          activeSemantic === 'attack' || activeSemantic === 'hit' || activeSemantic === 'jump';
        crossFadeToSemantic(wantSemantic, isFast ? 0.07 : 0.16, !!state.oneShot);
      }

      // 2. Speed-coupled timeScale on locomotion clips
      let ts = 1.0;
      if (activeSemantic === 'walk' || activeSemantic === 'run' ||
          activeSemantic === 'swim' || activeSemantic === 'swimFast' || activeSemantic === 'fly') {
        const refSpd = s.refSpeed || getRefSpeed(archetype, activeSemantic);
        ts = spd > 0.05 ? clamp(spd / Math.max(0.25, refSpd), 0.60, 1.75) : 1.0;
      }
      state.timeScale = ts;
      if (activeAction && typeof activeAction.setEffectiveTimeScale === 'function') {
        activeAction.setEffectiveTimeScale(ts);
      }

      // 3. Reset un-keyed post-mixer offset bones to rest before mixer.update
      for (let i = 0; i < restResetBones.length; i++) {
        const rb = restResetBones[i];
        const q = rb.bone.quaternion;
        if (q) {
          if (typeof q.set === 'function') q.set(rb.qx, rb.qy, rb.qz, rb.qw);
          else { q.x = rb.qx; q.y = rb.qy; q.z = rb.qz; q.w = rb.qw; }
        }
      }

      if (mixer) mixer.update(stepDt);

      // 4. Post-mixer micro-life (ZERO GC!)
      let targetYaw = 0;
      let targetPitch = 0;
      if (hasLookTarget) {
        const dx = lookX - (s.posX || 0);
        const dz = lookZ - (s.posZ || 0);
        const dy = lookY - ((s.posY || 0) + 0.65);
        const horiz = Math.hypot(dx, dz);
        const relYaw = wrapAngle(Math.atan2(dx, dz) - (s.facingYaw || 0));
        targetYaw = clamp(relYaw, -0.42, 0.42);
        targetPitch = clamp(Math.atan2(dy, Math.max(0.25, horiz)), -0.24, 0.24);
      }

      const kLook = Math.min(1, stepDt * 7.5);
      state.lookYaw += (targetYaw - state.lookYaw) * kLook;
      state.lookPitch += (targetPitch - state.lookPitch) * kLook;

      if (headBone && headBone.quaternion && _qYaw && _qPitch) {
        const yawAxis = isZUpHead ? _axisZ : _axisY;
        const pitchAngle = isZUpHead ? state.lookPitch : -state.lookPitch;
        _qYaw.setFromAxisAngle(yawAxis, state.lookYaw);
        _qPitch.setFromAxisAngle(_axisX, pitchAngle);
        headBone.quaternion.multiply(_qYaw).multiply(_qPitch);
      }

      if ((earLBone || earRBone) && _qScratch) {
        const tw = Math.sin((time || 0) * 2.1 + twitchPhase);
        if (tw > 0.90) {
          const earAmt = Math.sin(((tw - 0.90) / 0.10) * Math.PI) * 0.16;
          if (earLBone && earLBone.quaternion) {
            _qScratch.setFromAxisAngle(_axisX, earAmt);
            earLBone.quaternion.multiply(_qScratch);
          }
          if (earRBone && earRBone.quaternion) {
            _qScratch.setFromAxisAngle(_axisX, -earAmt * 0.85);
            earRBone.quaternion.multiply(_qScratch);
          }
        }
      }

      if (auraSprite && auraSprite.scale) {
        const pulse = 1.0 + Math.sin((time || 0) * 3.2 + twitchPhase) * 0.12;
        const as = auraBaseScale * pulse;
        auraSprite.scale.set(as, as, 1);
        if (auraSprite.material && typeof auraSprite.material.opacity === 'number') {
          auraSprite.material.opacity = 0.36 + Math.sin((time || 0) * 2.6 + twitchPhase) * 0.10;
        }
      }
    }

    const controller = {
      ready: false,
      isShaderRig: false,
      species,
      archetype,
      state,
      triggerOneShot,
      setLookTarget,
      clearLookTarget,
      update,
    };

    if (rootMesh && rootMesh.userData) {
      rootMesh.userData.animalRig = controller;
    }

    if (archetype === 'jelly') {
      controller.ready = true;
      controller.isShaderRig = true;
      state.clip = 'swim';
      return controller;
    }

    const LoaderCtor = cfg.GLTFLoader || (THREERef && THREERef.GLTFLoader);
    if (!THREERef || typeof LoaderCtor !== 'function' || !SkeletonUtilsRef || typeof SkeletonUtilsRef.clone !== 'function') {
      return controller;
    }

    function onTemplateReady(template) {
      if (!template || !template.scene) return;
      const clone = SkeletonUtilsRef.clone(template.scene);
      const spName = (species && species.name) || archetype;
      const isLynx = spName === 'Moss Lynx';

      const spScale = SPECIES_SCALES[spName] || 1.0;
      if (clone.scale && typeof clone.scale.set === 'function' && spScale !== 1.0) {
        clone.scale.set(spScale, spScale, spScale);
      }

      const bones = {};
      clone.traverse((obj) => {
        if ((obj.isBone || obj.type === 'Bone') && obj.name) {
          bones[obj.name] = obj;
        }
        if (obj.isMesh || obj.isSkinnedMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = false;

          const isSkinned = !!obj.isSkinnedMesh;
          const hasMorphs = !!(obj.morphTargetInfluences && obj.morphTargetInfluences.length > 0);
          const hasMorphNormals = !!(
            hasMorphs &&
            obj.geometry &&
            obj.geometry.morphAttributes &&
            obj.geometry.morphAttributes.normal &&
            obj.geometry.morphAttributes.normal.length > 0
          );

          if (hasMorphs && archetype === 'fox') {
            const dict = obj.morphTargetDictionary;
            if (dict && dict.Feline !== undefined) {
              obj.morphTargetInfluences[dict.Feline] = isLynx ? 1.0 : 0.0;
            } else if (obj.morphTargetInfluences.length >= 1) {
              obj.morphTargetInfluences[0] = isLynx ? 1.0 : 0.0;
            }
          }

          obj.material = getCachedSpeciesMaterial(
            THREERef,
            TexturesRef,
            species,
            archetype,
            obj.material,
            isSkinned,
            hasMorphs,
            hasMorphNormals
          );
        }
      });

      attachFantasyAccents(species, archetype, clone, bones, ModelsRef);

      if (species && species.rare) {
        const auraCol = species.auraColor !== undefined
          ? species.auraColor
          : (species.color !== undefined ? species.color : 0xffe074);
        auraBaseScale = archetype === 'stag' ? 1.85 : archetype === 'unicorn' ? 1.75 : 1.28;
        const auraY = archetype === 'stag' || archetype === 'unicorn' ? 0.72 : 0.42;
        if (ShadersRef && typeof ShadersRef.createGlowSprite === 'function') {
          auraSprite = ShadersRef.createGlowSprite(auraCol, auraBaseScale, 0.42, true);
        } else if (typeof THREERef.Sprite === 'function') {
          const AuraMat = typeof THREERef.SpriteMaterial === 'function'
            ? THREERef.SpriteMaterial
            : THREERef.MeshBasicMaterial;
          if (typeof AuraMat === 'function') {
            const matOpts = {
              color: auraCol,
              transparent: true,
              opacity: 0.42,
              depthWrite: false,
            };
            if (THREERef.AdditiveBlending !== undefined) matOpts.blending = THREERef.AdditiveBlending;
            auraSprite = new THREERef.Sprite(new AuraMat(matOpts));
            if (auraSprite.scale && typeof auraSprite.scale.set === 'function') {
              auraSprite.scale.set(auraBaseScale, auraBaseScale, 1);
            }
          }
        }
        if (auraSprite) {
          auraSprite.name = 'RareAura';
          auraSprite.castShadow = false;
          auraSprite.receiveShadow = false;
          if (auraSprite.position && typeof auraSprite.position.set === 'function') {
            auraSprite.position.set(0, auraY, 0);
          }
          clone.add(auraSprite);
        }
      }

      headBone = findBone(bones, 'Head');
      earLBone = findBone(bones, 'Ear1.L', 'Ear1L');
      earRBone = findBone(bones, 'Ear1.R', 'Ear1R');
      isZUpHead = archetype === 'fox' || archetype === 'unicorn' || archetype === 'wolf' ||
        archetype === 'stag' || archetype === 'drake' || archetype === 'firefly';

      restResetBones.length = 0;
      const offsetTargets = [headBone, earLBone, earRBone];
      for (let i = 0; i < offsetTargets.length; i++) {
        const b = offsetTargets[i];
        if (b && b.quaternion) {
          restResetBones.push({
            bone: b,
            qx: b.quaternion.x,
            qy: b.quaternion.y,
            qz: b.quaternion.z,
            qw: b.quaternion.w,
          });
        }
      }

      if (typeof THREERef.AnimationMixer === 'function') {
        mixer = new THREERef.AnimationMixer(clone);
        const semClips = buildSemanticClipMap(template.animations || []);
        const semKeys = Object.keys(semClips);
        for (let i = 0; i < semKeys.length; i++) {
          const sk = semKeys[i];
          const clip = semClips[sk];
          if (clip) actions[sk] = mixer.clipAction(clip);
        }
        const initSem = archetype === 'fish_tang' || archetype === 'fish_koi' || archetype === 'manta' || archetype === 'eel'
          ? 'swim'
          : (archetype === 'bird' || archetype === 'firefly') ? 'fly' : 'idle';
        const startAct = actions[initSem] || actions.idle;
        if (startAct) {
          startAct.reset();
          setActionLoop(startAct, initSem);
          if (typeof startAct.setEffectiveWeight === 'function') startAct.setEffectiveWeight(1);
          startAct.play();
          activeAction = startAct;
          activeSemantic = initSem;
          state.clip = initSem;
        }
      }

      if (rootMesh) {
        if (typeof rootMesh.add === 'function') rootMesh.add(clone);
        if (procRoot) procRoot.visible = false;
      }
      controller.ready = true;
    }

    function onTemplateError(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[Animals] Procedural fallback for ${archetype}:`, err && err.message ? err.message : err);
      }
    }

    preloadArchetype(archetype, onTemplateReady, onTemplateError, cfg);
    return controller;
  }

  // ---------- 2. AnimalPhysics ----------

  const ANIMAL_SLOPE_COS = Math.cos((44 * Math.PI) / 180);
  const ANIMAL_GRAVITY = 24;
  const ANIMAL_SWIM_DRAG = 0.68;
  const ANIMAL_GROUND_STEER_K = 9.5;
  const ANIMAL_AIR_STEER_K = 4.2;
  const ANIMAL_AERIAL_STEER_K = 5.5;
  const ANIMAL_AQUA_STEER_K = 4.5;
  const ANIMAL_KNOCK_DECAY_K = 8.0;
  const ANIMAL_VAULT_MIN = 0.32;
  const ANIMAL_VAULT_MAX = 1.65;
  const ANIMAL_VAULT_BASE_VY = 7.8;
  const ANIMAL_VAULT_COOLDOWN = 0.85;
  const ANIMAL_DEFAULT_WATER_Y = -0.35;

  function defaultHeightZero() {
    return 0;
  }

  function createPhysicsState(x, y, z, species) {
    return {
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: true,
      inWater: false,
      airLift: 0,
      bankRoll: 0,
      jumpCd: 0,
      smoothSpd: 0,
      gaitPhase: 0,
      printDist: 0,
      stepSide: 1,
      dustAcc: 0,
      splashAcc: 0,
      facing: 0,
      prevYaw: 0,
    };
  }

  function ensurePhysState(ent, rot) {
    if (rot && typeof rot.order === 'string' && rot.order !== 'YXZ') {
      rot.order = 'YXZ';
    }
    if (!ent.phys) {
      const pos = ent.mesh.position;
      ent.phys = createPhysicsState(pos.x, pos.y, pos.z, ent.species);
      if (rot) {
        ent.phys.facing = wrapAngle(rot.y || 0);
        ent.phys.prevYaw = ent.phys.facing;
      }
    }
    return ent.phys;
  }

  function getPhysRef(c) {
    if (c && c.Physics) return c.Physics;
    if (typeof Physics !== 'undefined' && Physics) return Physics;
    return null;
  }

  function getWaterSurfY(x, z, time, c) {
    const baseY = c && c.WATER_Y !== undefined ? c.WATER_Y : ANIMAL_DEFAULT_WATER_Y;
    const wave = c && c.Shaders && typeof c.Shaders.waterHeightAt === 'function'
      ? c.Shaders.waterHeightAt(x, z, time)
      : 0;
    return baseY + wave;
  }

  function sampleTerrainNormal(x, z, c, hFn, out) {
    if (c && typeof c.terrainNormalAt === 'function') {
      const res = c.terrainNormalAt(x, z, out);
      if (res && res !== out) {
        out.x = res.x;
        out.y = res.y;
        out.z = res.z;
      }
      return out;
    }
    const eps = 0.15;
    const dhx = hFn(x + eps, z) - hFn(x - eps, z);
    const dhz = hFn(x, z + eps) - hFn(x, z - eps);
    const nx = -dhx / (2 * eps);
    const nz = -dhz / (2 * eps);
    const invLen = 1 / Math.hypot(nx, 1, nz);
    out.x = nx * invLen;
    out.y = invLen;
    out.z = nz * invLen;
    return out;
  }

  function getAnimalColRadius(arch) {
    if (arch === 'stag' || arch === 'unicorn' || arch === 'drake') return 0.50;
    if (arch === 'beetle' || arch === 'kiwi' || arch === 'bird' || arch === 'firefly') return 0.34;
    return 0.42;
  }

  function getSubmergeOffset(arch) {
    if (arch === 'stag' || arch === 'unicorn' || arch === 'wolf' || arch === 'drake') return 0.36;
    if (arch === 'beetle' || arch === 'kiwi' || arch === 'bird' || arch === 'firefly') return 0.28;
    return 0.32;
  }

  function turnMeshToward(m, rot, PhysicsRef, targetYaw, stepDt, rate) {
    if (PhysicsRef && typeof PhysicsRef.turnToward === 'function') {
      PhysicsRef.turnToward(m, targetYaw, stepDt, rate);
    } else if (rot) {
      rot.y += wrapAngle(targetYaw - rot.y) * Math.min(1, stepDt * rate);
    }
  }

  function applyKnockback(ent, stepDt) {
    let kx = ent.kx || 0;
    let kz = ent.kz || 0;
    if (kx || kz) {
      const decay = Math.exp(-ANIMAL_KNOCK_DECAY_K * stepDt);
      ent.kx = Math.abs(kx * decay) < 0.02 ? 0 : kx * decay;
      ent.kz = Math.abs(kz * decay) < 0.02 ? 0 : kz * decay;
    }
    return kx || kz;
  }

  function resolveEntityColliders(nx, nz, colRadius, footY, c, PhysicsRef) {
    _physColBuf.length = 0;
    if (c && typeof c.getNearbyColliders === 'function') {
      c.getNearbyColliders(nx, nz, 1.2, _physColBuf);
    }
    _physColOut.x = nx;
    _physColOut.z = nz;
    _physColOut.hit = false;
    if (PhysicsRef && typeof PhysicsRef.resolveColliders === 'function' && _physColBuf.length > 0) {
      PhysicsRef.resolveColliders(nx, nz, colRadius, _physColBuf, _physColOut, footY);
    }
  }

  function stepLandPhysics(ent, dt, time, desVx, desVz, ctx) {
    _physLandRes.moved = 0;
    _physLandRes.jumped = false;
    _physLandRes.landed = false;
    _physLandRes.inWater = false;

    const m = ent && ent.mesh;
    if (!m || !m.position) return _physLandRes;

    const pos = m.position;
    const rot = m.rotation || null;
    const phys = ensurePhysState(ent, rot);
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) {
      _physLandRes.inWater = phys.inWater;
      return _physLandRes;
    }
    const stepDt = Math.min(0.05, Math.max(0.0001, rawDt));
    const c = ctx || _physDefaultCtx;
    const hFn = typeof c.heightAt === 'function' ? c.heightAt : defaultHeightZero;
    const PhysicsRef = getPhysRef(c);
    const arch = speciesToArchetype(ent.species);
    const colRadius = getAnimalColRadius(arch);

    phys.jumpCd = Math.max(0, phys.jumpCd - stepDt);

    const prevX = pos.x;
    const prevY = pos.y;
    const prevZ = pos.z;
    const prevYaw = rot ? rot.y : phys.facing;

    // 1. Exponential steering inertia + knockback decay
    const dvx = desVx || 0;
    const dvz = desVz || 0;
    const desSpd = Math.hypot(dvx, dvz);
    const steerK = phys.onGround ? ANIMAL_GROUND_STEER_K : ANIMAL_AIR_STEER_K;
    const steerAlpha = 1 - Math.exp(-steerK * stepDt);
    phys.vx += (dvx - phys.vx) * steerAlpha;
    phys.vz += (dvz - phys.vz) * steerAlpha;

    // 2. Water entry check at current position (throttles swim velocity)
    const curGh = hFn(prevX, prevZ);
    const waterSurfCur = getWaterSurfY(prevX, prevZ, time, c);
    if (curGh < waterSurfCur - 0.35 && prevY <= waterSurfCur + 0.45) {
      phys.inWater = true;
      phys.onGround = false;
    }

    let effVx = phys.inWater ? phys.vx * ANIMAL_SWIM_DRAG : phys.vx;
    let effVz = phys.inWater ? phys.vz * ANIMAL_SWIM_DRAG : phys.vz;
    const rawKx = ent.kx || 0;
    const rawKz = ent.kz || 0;
    if (rawKx || rawKz) {
      effVx += rawKx;
      effVz += rawKz;
      applyKnockback(ent, stepDt);
    }

    let dx = effVx * stepDt;
    let dz = effVz * stepDt;
    const moveLen = Math.hypot(dx, dz);
    const dirX = moveLen > 1e-6 ? dx / moveLen : (desSpd > 1e-4 ? dvx / desSpd : 0);
    const dirZ = moveLen > 1e-6 ? dz / moveLen : (desSpd > 1e-4 ? dvz / desSpd : 0);

    // 3. Collider push-out + lookahead step-up probe
    resolveEntityColliders(prevX + dx, prevZ + dz, colRadius, prevY, c, PhysicsRef);
    let cx = _physColOut.x;
    let cz = _physColOut.z;
    const colHit = _physColOut.hit;

    const hasDir = dirX !== 0 || dirZ !== 0;
    const probeDist = Math.max(0.55, moveLen);
    const farDist = Math.max(probeDist + 0.5, 1.4);
    const probeX = prevX + dirX * probeDist;
    const probeZ = prevZ + dirZ * probeDist;
    const farX = prevX + dirX * farDist;
    const farZ = prevZ + dirZ * farDist;
    const probeGh = hasDir ? hFn(probeX, probeZ) : hFn(cx, cz);
    const farGh = hasDir ? hFn(farX, farZ) : probeGh;
    const probePadSup = PhysicsRef && typeof PhysicsRef.getSupportHeight === 'function'
      ? PhysicsRef.getSupportHeight(probeX, probeZ, prevY + ANIMAL_VAULT_MAX, probeGh, _physColBuf, 0)
      : probeGh;

    const candBaseGh = hFn(cx, cz);
    const candSup = PhysicsRef && typeof PhysicsRef.getSupportHeight === 'function'
      ? PhysicsRef.getSupportHeight(cx, cz, prevY, candBaseGh, _physColBuf, phys.vy)
      : candBaseGh;

    const stepTerrain = probeGh - prevY;
    const stepFar = farGh - prevY;
    const hasColSupportStep =
      (candSup > candBaseGh && candSup - prevY >= ANIMAL_VAULT_MIN && candSup - prevY <= ANIMAL_VAULT_MAX) ||
      (probePadSup > probeGh && probePadSup - prevY >= ANIMAL_VAULT_MIN && probePadSup - prevY <= ANIMAL_VAULT_MAX);
    const plateauOk = !hasDir || (
      ((farGh - probeGh) / (farDist - probeDist)) < 0.72 &&
      sampleTerrainNormal(farX, farZ, c, hFn, _physCurNorm).y >= ANIMAL_SLOPE_COS
    );
    const hasTerrainStep =
      stepTerrain >= ANIMAL_VAULT_MIN &&
      stepTerrain <= ANIMAL_VAULT_MAX &&
      stepFar <= ANIMAL_VAULT_MAX + 0.12 &&
      plateauOk;
    const hasStepVault = hasColSupportStep || hasTerrainStep;

    // 4. Steep cliff discipline (>= 44 deg uphill projection/slide)
    let cliffBlocked = false;
    if (!phys.inWater && !hasStepVault) {
      sampleTerrainNormal(cx, cz, c, hFn, _physNorm);
      sampleTerrainNormal(prevX, prevZ, c, hFn, _physCurNorm);

      const nextGh = candBaseGh;
      const movingUphill = nextGh > curGh + 1e-4 || probeGh > curGh + 0.08;
      if (phys.onGround && _physCurNorm.y < ANIMAL_SLOPE_COS && movingUphill) {
        const hLenSq = _physCurNorm.x * _physCurNorm.x + _physCurNorm.z * _physCurNorm.z;
        const dotCur = dx * _physCurNorm.x + dz * _physCurNorm.z;
        if (hLenSq > 1e-8 && dotCur < 0) {
          const inv = dotCur / hLenSq;
          dx -= inv * _physCurNorm.x;
          dz -= inv * _physCurNorm.z;
          const vDot = phys.vx * _physCurNorm.x + phys.vz * _physCurNorm.z;
          if (vDot < 0) {
            phys.vx -= (vDot / hLenSq) * _physCurNorm.x;
            phys.vz -= (vDot / hLenSq) * _physCurNorm.z;
          }
          cliffBlocked = true;
        }
      }

      if (_physNorm.y < ANIMAL_SLOPE_COS) {
        const hLenSq = _physNorm.x * _physNorm.x + _physNorm.z * _physNorm.z;
        const dotNext = dx * _physNorm.x + dz * _physNorm.z;
        const blockedHeight = phys.onGround
          ? (nextGh > curGh + 0.08 || (dotNext < 0 && movingUphill))
          : (nextGh > prevY + 0.32 && dotNext < 0);
        if (hLenSq > 1e-8 && dotNext < 0 && blockedHeight) {
          const inv = dotNext / hLenSq;
          dx -= inv * _physNorm.x;
          dz -= inv * _physNorm.z;
          const vDot = phys.vx * _physNorm.x + phys.vz * _physNorm.z;
          if (vDot < 0) {
            phys.vx -= (vDot / hLenSq) * _physNorm.x;
            phys.vz -= (vDot / hLenSq) * _physNorm.z;
          }
          cliffBlocked = true;
        }
      }

      if (cliffBlocked) {
        resolveEntityColliders(prevX + dx, prevZ + dz, colRadius, prevY, c, PhysicsRef);
        cx = _physColOut.x;
        cz = _physColOut.z;
      }

      // Guard against discontinuous sheer walls too tall to vault
      if (phys.onGround && (cliffBlocked ? hFn(cx, cz) : candBaseGh) - prevY > ANIMAL_VAULT_MAX) {
        cx = prevX;
        cz = prevZ;
        phys.vx *= 0.2;
        phys.vz *= 0.2;
        cliffBlocked = true;
      }
    }

    // 5. Auto-vault jump over step-ups or solid obstacles while moving actively
    let jumped = false;
    if (!phys.inWater && phys.onGround && phys.jumpCd <= 0 && desSpd > 1.8 && (hasStepVault || colHit)) {
      phys.vy = ANIMAL_VAULT_BASE_VY + Math.min(1.4, desSpd * 0.14);
      phys.onGround = false;
      phys.jumpCd = ANIMAL_VAULT_COOLDOWN;
      jumped = true;
      if (m.userData && m.userData.animalRig && typeof m.userData.animalRig.triggerOneShot === 'function') {
        m.userData.animalRig.triggerOneShot('jump', 0.55);
      }
    }

    // 6. Final support height, water buoyancy & gravity/landing
    const baseGh = cliffBlocked ? hFn(cx, cz) : candBaseGh;
    const supY = PhysicsRef && typeof PhysicsRef.getSupportHeight === 'function'
      ? PhysicsRef.getSupportHeight(cx, cz, prevY, baseGh, _physColBuf, phys.vy)
      : baseGh;
    const waterSurf = getWaterSurfY(cx, cz, time, c);

    let nextY = prevY;
    let landed = false;
    if (baseGh < waterSurf - 0.35 && prevY <= waterSurf + 0.45) {
      phys.inWater = true;
      phys.onGround = false;
      const targetY = waterSurf - getSubmergeOffset(arch);
      const errY = targetY - prevY;
      const springK = errY > 0 ? 42 : 24;
      phys.vy += (errY * springK - phys.vy * 8.0) * stepDt;
      nextY = prevY + phys.vy * stepDt;
      if (nextY < baseGh) {
        nextY = baseGh;
        if (phys.vy < 0) phys.vy = 0;
      }
    } else {
      phys.inWater = false;
      phys.vy -= ANIMAL_GRAVITY * stepDt;
      nextY = prevY + phys.vy * stepDt;
      if (nextY <= supY) {
        if (!phys.onGround && phys.vy < -2.0) landed = true;
        nextY = supY;
        phys.vy = 0;
        phys.onGround = true;
      } else if (phys.onGround && phys.vy <= 0 && nextY <= supY + 0.06) {
        nextY = supY;
        phys.vy = 0;
      } else if (nextY > supY + 0.06) {
        phys.onGround = false;
      }
    }

    pos.x = cx;
    pos.y = nextY;
    pos.z = cz;
    phys.airLift = Math.max(0, nextY - supY);

    // 7. Yaw turn, dynamic turn banking & terrain slope alignment
    const horizSpd = Math.hypot(phys.vx, phys.vz);
    if (horizSpd > 0.15) {
      const targetYaw = Math.atan2(phys.vx, phys.vz);
      turnMeshToward(m, rot, PhysicsRef, targetYaw, stepDt, phys.onGround ? 10 : 5);
    }
    const newYaw = rot ? rot.y : phys.facing;
    phys.facing = wrapAngle(newYaw);
    const turnRate = wrapAngle(newYaw - prevYaw) / Math.max(0.001, stepDt);
    phys.prevYaw = newYaw;

    const wantBank = clamp(-turnRate * horizSpd * 0.055, -0.38, 0.38);
    phys.bankRoll += (wantBank - phys.bankRoll) * Math.min(1, stepDt * 9);

    if (rot) {
      let wantPitch = 0;
      let wantRoll = phys.bankRoll;
      if (phys.inWater) {
        wantPitch = clamp(-phys.vy * 0.04, -0.25, 0.25);
      } else if (phys.onGround) {
        sampleTerrainNormal(cx, cz, c, hFn, _physNorm);
        const fwdX = Math.sin(newYaw);
        const fwdZ = Math.cos(newYaw);
        const rightX = Math.cos(newYaw);
        const rightZ = -Math.sin(newYaw);
        const fwdDot = clamp(_physNorm.x * fwdX + _physNorm.z * fwdZ, -0.52, 0.52);
        const rightDot = clamp(_physNorm.x * rightX + _physNorm.z * rightZ, -0.42, 0.42);
        wantPitch = Math.asin(fwdDot);
        wantRoll = -Math.asin(rightDot) + phys.bankRoll;
      } else {
        wantPitch = clamp(-phys.vy * 0.035, -0.32, 0.32);
      }
      const alignAlpha = Math.min(1, stepDt * 9);
      rot.x += (wantPitch - rot.x) * alignAlpha;
      rot.z += (wantRoll - rot.z) * alignAlpha;
    }

    // 8. Displacement-synced gait, footprints, dust & water splashes
    const moved = Math.hypot(cx - prevX, cz - prevZ);
    const instSpd = moved / Math.max(0.001, stepDt);
    phys.smoothSpd += (instSpd - phys.smoothSpd) * Math.min(1, stepDt * 10);
    const scaleX = m.scale ? m.scale.x : 1;
    const strideLen = ((m.userData && m.userData.strideLen) || 0.85) * scaleX;
    phys.gaitPhase += (moved / Math.max(0.25, strideLen)) * Math.PI * 2;

    if (phys.inWater) {
      if (horizSpd > 0.35 || moved > 0.004) {
        phys.splashAcc += stepDt;
        if (phys.splashAcc >= 0.34) {
          phys.splashAcc = 0;
          if (typeof c.splashBurst === 'function') c.splashBurst(cx, waterSurf, cz, 3);
        }
      }
    } else if (phys.onGround && moved > 0.001 && nextY > waterSurf - 0.12) {
      phys.printDist += moved;
      const stepDist = arch === 'stag' || arch === 'unicorn' || arch === 'wolf' ? 0.78 : arch === 'beetle' ? 0.56 : 0.66;
      if (phys.printDist >= stepDist) {
        phys.printDist -= stepDist;
        if (typeof c.surfaceAt === 'function' && typeof c.stampFootprint === 'function') {
          const surf = c.surfaceAt(cx, cz);
          if (surf === 'sand' || surf === 'snow') {
            phys.stepSide = -(phys.stepSide || 1);
            const pScale = arch === 'stag' || arch === 'unicorn' ? 0.78 : arch === 'beetle' || arch === 'kiwi' ? 0.50 : 0.66;
            c.stampFootprint(cx, supY, cz, newYaw, surf, phys.stepSide, pScale);
          }
        }
      }
      if (phys.smoothSpd > 4.6) {
        phys.dustAcc += stepDt;
        if (phys.dustAcc >= 0.24) {
          phys.dustAcc = 0;
          if (typeof c.dustBurst === 'function') {
            const dSurf = typeof c.surfaceAt === 'function' ? c.surfaceAt(cx, cz) : 'grass';
            c.dustBurst(cx, supY + 0.06, cz, 1, dSurf);
          }
        }
      }
    }

    _physLandRes.moved = moved;
    _physLandRes.jumped = jumped;
    _physLandRes.landed = landed;
    _physLandRes.inWater = phys.inWater;
    return _physLandRes;
  }

  function stepAerialPhysics(ent, dt, time, desVx, desVz, targetAlt, ctx) {
    _physAirRes.moved = 0;
    _physAirRes.jumped = false;
    _physAirRes.landed = false;
    _physAirRes.inWater = false;

    const m = ent && ent.mesh;
    if (!m || !m.position) return _physAirRes;

    const pos = m.position;
    const rot = m.rotation || null;
    const phys = ensurePhysState(ent, rot);
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) return _physAirRes;
    const stepDt = Math.min(0.05, Math.max(0.0001, rawDt));
    const c = ctx || _physDefaultCtx;
    const hFn = typeof c.heightAt === 'function' ? c.heightAt : defaultHeightZero;
    const PhysicsRef = getPhysRef(c);
    const arch = speciesToArchetype(ent.species);

    const prevX = pos.x;
    const prevY = pos.y;
    const prevZ = pos.z;
    const prevYaw = rot ? rot.y : phys.facing;

    // Smooth horizontal flight acceleration
    const hAlpha = 1 - Math.exp(-ANIMAL_AERIAL_STEER_K * stepDt);
    phys.vx += ((desVx || 0) - phys.vx) * hAlpha;
    phys.vz += ((desVz || 0) - phys.vz) * hAlpha;

    let effVx = phys.vx;
    let effVz = phys.vz;
    if (ent.kx || ent.kz) {
      effVx += ent.kx || 0;
      effVz += ent.kz || 0;
      applyKnockback(ent, stepDt);
    }

    resolveEntityColliders(prevX + effVx * stepDt, prevZ + effVz * stepDt, getAnimalColRadius(arch), prevY, c, PhysicsRef);
    const nx = _physColOut.x;
    const nz = _physColOut.z;

    // Smooth vertical altitude damping above max(heightAt, WATER_Y)
    const waterBaseY = c.WATER_Y !== undefined ? c.WATER_Y : ANIMAL_DEFAULT_WATER_Y;
    const floorY = Math.max(hFn(nx, nz), waterBaseY);
    const alt = targetAlt !== undefined ? targetAlt : 1.2;
    const wantY = floorY + alt;

    phys.vy += (wantY - prevY) * 5.2 * stepDt;
    phys.vy *= Math.exp(-4.2 * stepDt);
    let ny = prevY + phys.vy * stepDt;
    if (alt > 0.8 && ny < floorY + 0.35) {
      ny = floorY + 0.35;
      if (phys.vy < 0) phys.vy = 0;
    } else if (ny < floorY + 0.02) {
      ny = floorY + 0.02;
      if (phys.vy < 0) phys.vy = 0;
    }

    pos.x = nx;
    pos.y = ny;
    pos.z = nz;

    phys.inWater = false;
    phys.onGround = false;
    phys.airLift = Math.max(0, ny - floorY);

    const horizSpd = Math.hypot(phys.vx, phys.vz);
    if (horizSpd > 0.15) {
      const targetYaw = Math.atan2(phys.vx, phys.vz);
      turnMeshToward(m, rot, PhysicsRef, targetYaw, stepDt, 8);
    }
    const newYaw = rot ? rot.y : phys.facing;
    phys.facing = wrapAngle(newYaw);
    const turnRate = wrapAngle(newYaw - prevYaw) / Math.max(0.001, stepDt);
    phys.prevYaw = newYaw;

    const wantBank = clamp(-turnRate * horizSpd * 0.065, -0.48, 0.48);
    phys.bankRoll += (wantBank - phys.bankRoll) * Math.min(1, stepDt * 8);

    if (rot) {
      const wantPitch = clamp(-phys.vy * 0.08 + Math.min(0.18, horizSpd * 0.025), -0.35, 0.35);
      rot.x += (wantPitch - rot.x) * Math.min(1, stepDt * 7);
      rot.z += (phys.bankRoll - rot.z) * Math.min(1, stepDt * 8);
    }

    const horizMoved = Math.hypot(nx - prevX, nz - prevZ);
    const instSpd = horizMoved / Math.max(0.001, stepDt);
    phys.smoothSpd += (instSpd - phys.smoothSpd) * Math.min(1, stepDt * 10);
    phys.gaitPhase += Math.max(horizMoved * 2.5, stepDt * 8.5);

    _physAirRes.moved = Math.hypot(nx - prevX, ny - prevY, nz - prevZ);
    return _physAirRes;
  }

  function stepAquaticPhysics(ent, dt, time, desVx, desVy, desVz, ctx) {
    _physAquaRes.moved = 0;
    _physAquaRes.inWater = true;

    const m = ent && ent.mesh;
    if (!m || !m.position) return _physAquaRes;

    const pos = m.position;
    const rot = m.rotation || null;
    const phys = ensurePhysState(ent, rot);
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) return _physAquaRes;
    const stepDt = Math.min(0.05, Math.max(0.0001, rawDt));
    const c = ctx || _physDefaultCtx;
    const hFn = typeof c.heightAt === 'function' ? c.heightAt : defaultHeightZero;
    const PhysicsRef = getPhysRef(c);
    const arch = speciesToArchetype(ent.species);

    const prevX = pos.x;
    const prevY = pos.y;
    const prevZ = pos.z;
    const prevYaw = rot ? rot.y : phys.facing;

    // Smooth 3D velocity damping
    const alpha = 1 - Math.exp(-ANIMAL_AQUA_STEER_K * stepDt);
    phys.vx += ((desVx || 0) - phys.vx) * alpha;
    phys.vy += ((desVy || 0) - phys.vy) * alpha;
    phys.vz += ((desVz || 0) - phys.vz) * alpha;

    resolveEntityColliders(prevX + phys.vx * stepDt, prevZ + phys.vz * stepDt, getAnimalColRadius(arch), prevY, c, PhysicsRef);
    const nx = _physColOut.x;
    const nz = _physColOut.z;
    let ny = prevY + phys.vy * stepDt;

    // Strict water-column bounds: [heightAt(x, z) + 0.75, WATER_Y - 0.85]
    const waterBaseY = c.WATER_Y !== undefined ? c.WATER_Y : ANIMAL_DEFAULT_WATER_Y;
    const minY = hFn(nx, nz) + 0.75;
    const maxY = waterBaseY - 0.85;
    if (minY <= maxY) {
      if (ny < minY) {
        ny = minY;
        if (phys.vy < 0) phys.vy = 0;
      } else if (ny > maxY) {
        ny = maxY;
        if (phys.vy > 0) phys.vy = 0;
      }
    } else {
      if (ny > maxY) {
        ny = maxY;
        if (phys.vy > 0) phys.vy = 0;
      }
      const floorSafe = hFn(nx, nz) + 0.25;
      if (ny < floorSafe) {
        ny = floorSafe;
        if (phys.vy < 0) phys.vy = 0;
      }
    }

    pos.x = nx;
    pos.y = ny;
    pos.z = nz;

    phys.inWater = true;
    phys.onGround = false;
    phys.airLift = 0;

    const horizSpd = Math.hypot(phys.vx, phys.vz);
    if (horizSpd > 0.08) {
      const targetYaw = Math.atan2(phys.vx, phys.vz);
      turnMeshToward(m, rot, PhysicsRef, targetYaw, stepDt, 6.5);
    }
    const newYaw = rot ? rot.y : phys.facing;
    phys.facing = wrapAngle(newYaw);
    const turnRate = wrapAngle(newYaw - prevYaw) / Math.max(0.001, stepDt);
    phys.prevYaw = newYaw;

    const wantBank = clamp(-turnRate * horizSpd * 0.05, -0.32, 0.32);
    phys.bankRoll += (wantBank - phys.bankRoll) * Math.min(1, stepDt * 7);

    if (rot) {
      const wantPitch = clamp(-Math.atan2(phys.vy, Math.max(0.4, horizSpd)), -0.65, 0.65);
      rot.x += (wantPitch - rot.x) * Math.min(1, stepDt * 6);
      rot.z += (phys.bankRoll - rot.z) * Math.min(1, stepDt * 7);
    }

    const moved = Math.hypot(nx - prevX, ny - prevY, nz - prevZ);
    const speed3D = Math.hypot(phys.vx, phys.vy, phys.vz);
    phys.smoothSpd += (speed3D - phys.smoothSpd) * Math.min(1, stepDt * 8);
    phys.gaitPhase += Math.max(moved * 2.4, stepDt * 4.5);

    _physAquaRes.moved = moved;
    return _physAquaRes;
  }

  // ---------- 3. AnimalAI ----------

  const RARE_SPECIES = [
    {
      name: 'Celestial Stag',
      plan: 'quad',
      archetype: 'stag',
      body: 'tall',
      color: 0xf4e8c1,
      auraColor: 0xffe985,
      deco: 'antlers',
      rare: true,
      bonusHp: 3,
      attackDmg: 2,
      names: ['Aether', 'Orionis', 'Solstice', 'Astral', 'Lumina', 'Halcyon'],
    },
    {
      name: 'Aurora Fox',
      baseName: 'Frost Fox',
      plan: 'quad',
      archetype: 'fox',
      body: 'round',
      color: 0x8ef5e4,
      auraColor: 0x7effd4,
      deco: 'ears',
      rare: true,
      bonusHp: 3,
      attackDmg: 2,
      names: ['Borealis', 'Prism', 'Zephyr', 'Shimmer'],
    },
    {
      name: 'Eclipse Wolf',
      baseName: 'Timber Wolf',
      plan: 'quad',
      archetype: 'wolf',
      body: 'mid',
      color: 0x4b5688,
      auraColor: 0xa79bff,
      deco: 'ears',
      rare: true,
      bonusHp: 3,
      attackDmg: 2,
      names: ['Umbra', 'Vesper', 'Nebula', 'Nyx'],
    },
    {
      name: 'Astral Unicorn',
      baseName: 'Starlight Unicorn',
      plan: 'quad',
      archetype: 'unicorn',
      body: 'tall',
      color: 0xe6d6ff,
      auraColor: 0xd4a5ff,
      deco: 'horn',
      rare: true,
      bonusHp: 3,
      attackDmg: 2,
      names: ['Celestia', 'Seraphina', 'Stardust', 'Nova'],
    },
    {
      name: 'Solar Owl',
      baseName: 'Golden Owl',
      plan: 'bird',
      archetype: 'owl',
      color: 0xffc844,
      auraColor: 0xffe476,
      deco: 'crown',
      rare: true,
      bonusHp: 3,
      attackDmg: 2,
      names: ['Helios', 'Solaria', 'Radiant', 'Dawn'],
    },
    {
      name: 'Starfire Drake',
      baseName: 'Ember Drake',
      plan: 'lizard',
      archetype: 'drake',
      color: 0xff6e9c,
      auraColor: 0xff9ec4,
      deco: 'fins',
      rare: true,
      bonusHp: 3,
      attackDmg: 2,
      names: ['Supernova', 'Comet', 'Flare', 'Ignis'],
    },
  ];

  const RARE_BY_BASE = {};
  for (let i = 0; i < RARE_SPECIES.length; i++) {
    const rs = RARE_SPECIES[i];
    if (rs.baseName) RARE_BY_BASE[rs.baseName] = rs;
  }

  const SPECIES_TEMPERAMENT = {
    'Frost Fox': 'shy',
    'Aurora Fox': 'shy',
    'Starlight Unicorn': 'shy',
    'Astral Unicorn': 'shy',
    'Celestial Stag': 'shy',
    'Timber Wolf': 'curious',
    'Eclipse Wolf': 'curious',
    'Woodland Cub': 'curious',
    'Moss Lynx': 'curious',
    'Meadow Kiwi': 'curious',
    'Cloud Wren': 'aerial',
    'Golden Owl': 'aerial',
    'Solar Owl': 'aerial',
    'Lantern Firefly': 'aerial',
    'Wish': 'aerial',
    'Berry Beetle': 'busy',
    'Ember Drake': 'busy',
    'Starfire Drake': 'busy',
  };

  // Bounded chase-friendly speed multipliers so wild chases stay fun & fair for every species
  const CHASE_SPEED_MIN = 0.86;
  const CHASE_SPEED_MAX = 1.16;

  // Balanced species stat ranges across 5 tactical roles (tank, vanguard, striker, skirmisher, aerial)
  // Every species shares an equitable power budget so no single animal overpowers the others
  // and a diverse multi-role team organically outperforms a mono-species pack.
  const SPECIES_STAT_RANGES = {
    'Berry Beetle':      { role: 'tank',       hp: [5, 6], def: [0.38, 0.48], atk: [1.10, 1.35], atkCd: [1.85, 2.10], spd: [0.88, 0.96], knockResist: 0.45, sizeVar: [0.95, 1.07] },
    'Timber Wolf':       { role: 'vanguard',   hp: [4, 5], def: [0.22, 0.30], atk: [1.30, 1.60], atkCd: [1.70, 1.95], spd: [0.98, 1.08], knockResist: 0.65, sizeVar: [0.94, 1.07] },
    'Woodland Cub':      { role: 'vanguard',   hp: [4, 5], def: [0.22, 0.30], atk: [1.30, 1.60], atkCd: [1.70, 1.95], spd: [0.98, 1.08], knockResist: 0.65, sizeVar: [0.94, 1.07] },
    'Starlight Unicorn': { role: 'vanguard',   hp: [4, 5], def: [0.24, 0.32], atk: [1.35, 1.65], atkCd: [1.85, 2.12], spd: [1.02, 1.12], knockResist: 0.58, sizeVar: [0.95, 1.06] },
    'Celestial Stag':    { role: 'vanguard',   hp: [4, 5], def: [0.24, 0.32], atk: [1.45, 1.75], atkCd: [1.72, 1.98], spd: [1.04, 1.14], knockResist: 0.52, sizeVar: [0.98, 1.08] },
    'Ember Drake':       { role: 'striker',    hp: [3, 4], def: [0.06, 0.14], atk: [1.70, 2.15], atkCd: [1.75, 2.05], spd: [1.00, 1.10], knockResist: 0.90, sizeVar: [0.94, 1.07] },
    'Moss Lynx':         { role: 'striker',    hp: [3, 4], def: [0.10, 0.18], atk: [1.50, 1.85], atkCd: [1.60, 1.85], spd: [1.04, 1.14], knockResist: 0.85, sizeVar: [0.94, 1.06] },
    'Frost Fox':         { role: 'skirmisher', hp: [3, 4], def: [0.12, 0.20], atk: [1.25, 1.55], atkCd: [1.40, 1.65], spd: [1.06, 1.16], knockResist: 0.88, sizeVar: [0.94, 1.06] },
    'Meadow Kiwi':       { role: 'skirmisher', hp: [3, 4], def: [0.15, 0.23], atk: [1.15, 1.45], atkCd: [1.32, 1.58], spd: [1.04, 1.14], knockResist: 0.82, sizeVar: [0.94, 1.06] },
    'Golden Owl':        { role: 'aerial',     hp: [3, 4], def: [0.12, 0.20], atk: [1.40, 1.75], atkCd: [1.68, 1.92], spd: [1.04, 1.14], knockResist: 0.92, sizeVar: [0.95, 1.07] },
    'Cloud Wren':        { role: 'aerial',     hp: [3, 3], def: [0.10, 0.18], atk: [1.05, 1.35], atkCd: [1.18, 1.40], spd: [1.08, 1.16], knockResist: 0.96, sizeVar: [0.94, 1.06] },
    'Lantern Firefly':   { role: 'aerial',     hp: [3, 3], def: [0.12, 0.20], atk: [1.05, 1.35], atkCd: [1.22, 1.44], spd: [1.06, 1.16], knockResist: 0.96, sizeVar: [0.94, 1.06] },
  };

  const DEFAULT_STAT_RANGE = {
    role: 'skirmisher',
    hp: [3, 4],
    def: [0.12, 0.20],
    atk: [1.25, 1.55],
    atkCd: [1.55, 1.80],
    spd: [0.96, 1.06],
    knockResist: 0.85,
    sizeVar: [0.95, 1.05],
  };

  const ROLE_BITS = {
    tank: 1,
    vanguard: 2,
    striker: 4,
    skirmisher: 8,
    aerial: 16,
  };

  const _bandSynergy = {
    uniqueRoles: 0,
    uniqueSpecies: 0,
    atkMult: 1.0,
    cdMult: 1.0,
    defBonus: 0,
    restHealRate: 0,
  };

  const _defResult = {
    damage: 0,
    mitigated: false,
    knockScale: 1.0,
  };

  function getSpeciesStatRange(species) {
    if (!species) return DEFAULT_STAT_RANGE;
    const name = typeof species === 'string' ? species : species.name;
    if (name && SPECIES_STAT_RANGES[name]) return SPECIES_STAT_RANGES[name];
    const baseName = typeof species === 'object' ? species.baseName : null;
    if (baseName && SPECIES_STAT_RANGES[baseName]) return SPECIES_STAT_RANGES[baseName];
    return DEFAULT_STAT_RANGE;
  }

  function rollIndividualStats(species, rng) {
    const range = getSpeciesStatRange(species);
    const randFn = typeof rng === 'function' ? rng : Math.random;
    const isRare = !!(species && typeof species === 'object' && species.rare);

    const sampleHigh = () => {
      const r = clamp(randFn(), 0, 1);
      return isRare ? (0.65 + r * 0.35) : r;
    };
    const sampleLow = () => {
      const r = clamp(randFn(), 0, 1);
      return isRare ? (r * 0.35) : r;
    };

    const bonusHp = (species && typeof species === 'object' && typeof species.bonusHp === 'number')
      ? species.bonusHp
      : (isRare ? 3 : 0);
    const maxHp = Math.round(range.hp[0] + (range.hp[1] - range.hp[0]) * sampleHigh()) + bonusHp;
    const def = Math.round((range.def[0] + (range.def[1] - range.def[0]) * sampleHigh()) * 1000) / 1000;
    const baseAtk = range.atk[0] + (range.atk[1] - range.atk[0]) * sampleHigh();
    const atk = Math.round((baseAtk + (isRare ? 0.5 : 0)) * 100) / 100;
    const atkCd = Math.round((range.atkCd[0] + (range.atkCd[1] - range.atkCd[0]) * sampleLow()) * 100) / 100;
    const rawSpd = range.spd[0] + (range.spd[1] - range.spd[0]) * sampleHigh();
    const spd = Math.round(clamp(rawSpd, CHASE_SPEED_MIN, CHASE_SPEED_MAX) * 1000) / 1000;
    const rawSize = range.sizeVar[0] + (range.sizeVar[1] - range.sizeVar[0]) * clamp(randFn(), 0, 1);
    const sizeVar = Math.round(rawSize * 1000) / 1000;

    return {
      role: range.role,
      maxHp,
      def,
      atk,
      atkCd,
      spd,
      knockResist: range.knockResist,
      sizeVar,
      antiAirMult: range.role === 'aerial' ? 1.35 : 1.0,
      aggroPull: range.role === 'tank' ? 1.65 : (range.role === 'vanguard' ? 0.85 : 0),
    };
  }

  function computeBandSynergy(followers, out) {
    const res = out || _bandSynergy;
    let roleMask = 0;
    let uniqueSpecies = 0;

    if (Array.isArray(followers)) {
      const len = followers.length;
      for (let i = 0; i < len; i++) {
        const f = followers[i];
        if (!f) continue;
        const role = (f.stats && f.stats.role) || getSpeciesStatRange(f.species).role;
        roleMask |= (ROLE_BITS[role] || 0);

        const spName = f.species && (f.species.baseName || f.species.name);
        if (spName) {
          let seen = false;
          for (let j = 0; j < i; j++) {
            const prev = followers[j];
            const prevName = prev && prev.species && (prev.species.baseName || prev.species.name);
            if (prevName === spName) {
              seen = true;
              break;
            }
          }
          if (!seen) uniqueSpecies++;
        }
      }
    }

    let uniqueRoles = 0;
    for (let m = roleMask; m > 0; m &= (m - 1)) uniqueRoles++;

    res.uniqueRoles = uniqueRoles;
    res.uniqueSpecies = uniqueSpecies;
    if (uniqueRoles >= 4) {
      res.atkMult = 1.18;
      res.cdMult = 0.80;
      res.defBonus = 0.20;
      res.restHealRate = 0.28;
    } else if (uniqueRoles === 3) {
      res.atkMult = 1.12;
      res.cdMult = 0.85;
      res.defBonus = 0.15;
      res.restHealRate = 0.18;
    } else if (uniqueRoles === 2) {
      res.atkMult = 1.06;
      res.cdMult = 0.92;
      res.defBonus = 0.08;
      res.restHealRate = 0;
    } else if (uniqueRoles === 1 && uniqueSpecies >= 2) {
      res.atkMult = 1.03;
      res.cdMult = 0.97;
      res.defBonus = 0.03;
      res.restHealRate = 0;
    } else {
      res.atkMult = 1.0;
      res.cdMult = 1.0;
      res.defBonus = 0;
      res.restHealRate = 0;
    }
    return res;
  }

  function applyCompanionDefense(ally, rawAmount, synergy, out) {
    const res = out || _defResult;
    const amt = typeof rawAmount === 'number' && rawAmount > 0 ? rawAmount : 0;
    const st = ally && ally.stats;
    const baseDef = st && typeof st.def === 'number' ? st.def : 0;
    const synDef = (st && synergy && typeof synergy.defBonus === 'number') ? synergy.defBonus : 0;
    const effDef = clamp(baseDef + synDef, 0, 0.65);

    res.damage = amt > 0 ? Math.max(0.25, Math.round(amt * (1 - effDef) * 100) / 100) : 0;
    res.mitigated = effDef >= 0.22;
    res.knockScale = st && typeof st.knockResist === 'number' ? st.knockResist : 1.0;
    return res;
  }

  const AQUA_FALLBACK_SPECIES = {
    'Seafoam Fin': {
      name: 'Seafoam Fin',
      plan: 'fish',
      archetype: 'fish_tang',
      color: 0x6ad9d0,
      aquatic: true,
      names: ['Ripple', 'Marina', 'Splash', 'Tide', 'Nautilus', 'Crest'],
    },
    'Coral Dart': {
      name: 'Coral Dart',
      plan: 'fish',
      archetype: 'fish_koi',
      color: 0xf78ea8,
      deco: 'spots',
      aquatic: true,
      names: ['Anemone', 'Pearl', 'Reef', 'Saffron', 'Lagoon', 'Petal'],
    },
    'Kelp Eel': {
      name: 'Kelp Eel',
      plan: 'eel',
      archetype: 'eel',
      color: 0x5ab86a,
      aquatic: true,
      names: ['Frond', 'Ribbon', 'Current', 'Verdant', 'Swell', 'Eddy'],
    },
    'Moon Jelly': {
      name: 'Moon Jelly',
      plan: 'jelly',
      archetype: 'jelly',
      color: 0x8fbdf7,
      aquatic: true,
      names: ['Lumina', 'Drift', 'Aurelia', 'Gossamer', 'Halo', 'Shimmer'],
    },
    'Starlight Manta': {
      name: 'Starlight Manta',
      plan: 'fish',
      archetype: 'manta',
      color: 0x4b74b8,
      auraColor: 0x64f6ee,
      aquatic: true,
      names: ['Glider', 'Pelagic', 'Zephyr', 'Abyssal', 'Manta', 'Skimmer'],
    },
  };

  // 16 Sunken City reef spawns: 6 Seafoam Fin, 4 Coral Dart, 2 Kelp Eel, 2 Moon Jelly, 2 Starlight Manta
  const AQUA_REEF_SPAWNS = [
    { name: 'Seafoam Fin',     x: -11.5, y: -4.5, z: 75.5, cx: -11.5, cy: -4.6, cz: 78.0, rad: 5.0, spd: 2.8, school: 'fin' },
    { name: 'Seafoam Fin',     x: -10.2, y: -4.8, z: 77.2, cx: -11.5, cy: -4.6, cz: 78.0, rad: 5.0, spd: 2.9, school: 'fin' },
    { name: 'Seafoam Fin',     x: -12.8, y: -4.6, z: 78.6, cx: -11.5, cy: -4.6, cz: 78.0, rad: 5.0, spd: 2.7, school: 'fin' },
    { name: 'Seafoam Fin',     x: -9.8,  y: -5.1, z: 79.4, cx: -11.5, cy: -4.6, cz: 78.0, rad: 5.0, spd: 2.8, school: 'fin' },
    { name: 'Seafoam Fin',     x: -13.4, y: -4.9, z: 76.8, cx: -11.5, cy: -4.6, cz: 78.0, rad: 5.0, spd: 2.9, school: 'fin' },
    { name: 'Seafoam Fin',     x: -11.0, y: -5.3, z: 80.2, cx: -11.5, cy: -4.6, cz: 78.0, rad: 5.0, spd: 2.7, school: 'fin' },
    { name: 'Coral Dart',      x: -17.5, y: -5.1, z: 84.5, cx: -17.0, cy: -5.3, cz: 86.0, rad: 5.5, spd: 3.0, school: 'dart' },
    { name: 'Coral Dart',      x: -15.8, y: -5.4, z: 86.8, cx: -17.0, cy: -5.3, cz: 86.0, rad: 5.5, spd: 3.1, school: 'dart' },
    { name: 'Coral Dart',      x: -18.6, y: -5.2, z: 87.6, cx: -17.0, cy: -5.3, cz: 86.0, rad: 5.5, spd: 2.9, school: 'dart' },
    { name: 'Coral Dart',      x: -16.2, y: -5.6, z: 84.2, cx: -17.0, cy: -5.3, cz: 86.0, rad: 5.5, spd: 3.0, school: 'dart' },
    { name: 'Kelp Eel',        x: -12.0, y: -6.3, z: 83.5, cx: -14.0, cy: -6.3, cz: 84.0, rad: 6.0, spd: 2.2, school: 'eel' },
    { name: 'Kelp Eel',        x: -16.5, y: -6.6, z: 85.0, cx: -14.0, cy: -6.3, cz: 84.0, rad: 6.0, spd: 2.3, school: 'eel' },
    { name: 'Moon Jelly',      x: -14.5, y: -4.5, z: 80.5, cx: -14.0, cy: -4.7, cz: 81.5, rad: 4.5, spd: 0.65, school: 'jelly' },
    { name: 'Moon Jelly',      x: -10.5, y: -4.9, z: 83.5, cx: -14.0, cy: -4.7, cz: 81.5, rad: 4.5, spd: 0.60, school: 'jelly' },
    { name: 'Starlight Manta', x: -18.0, y: -4.7, z: 79.0, cx: -14.5, cy: -4.8, cz: 82.0, rad: 9.5, spd: 2.4, school: 'manta' },
    { name: 'Starlight Manta', x: -10.0, y: -5.0, z: 87.0, cx: -14.5, cy: -4.8, cz: 82.0, rad: 9.5, spd: 2.4, school: 'manta' },
  ];

  const _aiCombatPick = { target: null, idx: -1, isSelfDefense: false };

  function cloneSpeciesDef(sp) {
    if (!sp) return null;
    const copy = {};
    const keys = Object.keys(sp);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = sp[k];
      copy[k] = Array.isArray(v) ? v.slice() : v;
    }
    return copy;
  }

  function rollRareSpecies(baseSpecies, rng) {
    const r = typeof rng === 'function' ? rng() : Math.random();
    if (r < 0.12) {
      if (r < 0.045) return cloneSpeciesDef(RARE_SPECIES[0]);
      const baseName = baseSpecies && baseSpecies.name;
      const match = baseName ? RARE_BY_BASE[baseName] : null;
      return cloneSpeciesDef(match || RARE_SPECIES[0]);
    }
    return baseSpecies;
  }

  function isAerialSpecies(sp) {
    if (!sp) return false;
    const rawArch = sp.archetype ? String(sp.archetype).toLowerCase() : '';
    if (rawArch === 'kiwi' || sp.name === 'Meadow Kiwi') return false;
    if (rawArch === 'songbird' || rawArch === 'owl' || rawArch === 'firefly' || rawArch === 'bird') return true;
    if (sp.name === 'Cloud Wren' || sp.name === 'Golden Owl' || sp.name === 'Solar Owl' ||
        sp.name === 'Lantern Firefly' || sp.name === 'Wish') {
      return true;
    }
    return sp.plan === 'bird';
  }

  function getTemperament(species) {
    if (species && species.name && SPECIES_TEMPERAMENT[species.name]) {
      return SPECIES_TEMPERAMENT[species.name];
    }
    if (isAerialSpecies(species)) return 'aerial';
    const arch = speciesToArchetype(species);
    if (arch === 'beetle' || arch === 'drake' || (species && (species.plan === 'bug' || species.plan === 'lizard'))) {
      return 'busy';
    }
    if (arch === 'fox' || arch === 'unicorn' || arch === 'stag') return 'shy';
    return 'curious';
  }

  function getModelsRef(c) {
    if (c && c.Models) return c.Models;
    if (typeof Models !== 'undefined' && Models) return Models;
    return null;
  }

  function getSceneRef(c) {
    if (c && c.scene) return c.scene;
    if (typeof scene !== 'undefined' && scene) return scene;
    return null;
  }

  function getPlayerRef(c) {
    if (c && c.P) return c.P;
    if (typeof Physics !== 'undefined' && Physics && Physics.P) return Physics.P;
    return _aiDefaultPlayer;
  }

  function syncEntityVisual(m, phys, dt, time, mode, refSpeed, hurtFlash, isMoving, airborne, c) {
    const rig = m.userData && m.userData.animalRig;
    if (rig && typeof rig.update === 'function') {
      _aiAnimState.mode = mode;
      _aiAnimState.speed = phys.smoothSpd;
      _aiAnimState.refSpeed = refSpeed;
      _aiAnimState.airborne = airborne;
      _aiAnimState.inWater = !!phys.inWater;
      _aiAnimState.hurtFlash = hurtFlash;
      _aiAnimState.isMoving = isMoving;
      _aiAnimState.facingYaw = m.rotation ? m.rotation.y : phys.facing;
      _aiAnimState.posX = m.position.x;
      _aiAnimState.posY = m.position.y;
      _aiAnimState.posZ = m.position.z;
      rig.update(dt, time, _aiAnimState);
      return;
    }
    const ModelsRef = getModelsRef(c);
    if (ModelsRef && typeof ModelsRef.animateCritter === 'function') {
      _aiProcOpts.idleTime = time;
      _aiProcOpts.airborne = airborne;
      ModelsRef.animateCritter(m, phys.gaitPhase, phys.smoothSpd, _aiProcOpts);
    }
  }

  function befriendWild(wild, idx, w, c) {
    const m = w.mesh;
    const pos = m.position;
    if (typeof c.burst === 'function') {
      c.burst(pos.x, pos.y + 0.8, pos.z, 0xffd93b, 12);
    }
    if (c.Sound && typeof c.Sound.chime === 'function') {
      c.Sound.chime();
    }
    const fallbackName = (w.species && w.species.name) || 'Starling';
    const dName = w.displayName || (typeof c.pickUniqueCritterName === 'function'
      ? c.pickUniqueCritterName(w.species)
      : fallbackName);
    if (typeof c.addFollower === 'function') {
      c.addFollower(
        pos.x,
        pos.y,
        pos.z,
        dName + ' joined your band! Friends fight beside you against Gloomblobs.',
        w.species,
        dName,
        w.stats || null
      );
    }
    if (typeof c.questEvent === 'function') {
      c.questEvent('befriend');
    }
    const sceneRef = getSceneRef(c);
    if (sceneRef && typeof sceneRef.remove === 'function') {
      sceneRef.remove(m);
    }
    wild.splice(idx, 1);
  }

  function updateWild(wild, dt, time, ctx) {
    if (!Array.isArray(wild)) return;
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) return;

    const c = ctx || _physDefaultCtx;
    const aiDt = Math.min(0.25, rawDt);
    const nSub = aiDt > 0.05 ? Math.min(5, Math.ceil(aiDt / 0.05)) : 1;
    const physDt = aiDt / nSub;
    const nowTime = typeof time === 'number' ? time : 0;

    if (typeof c.spawnWild === 'function') {
      for (let tries = 0; wild.length < 6 && tries < 3; tries++) {
        c.spawnWild();
      }
    }

    const P = getPlayerRef(c);
    const px = P.x || 0;
    const py = P.y || 0;
    const pz = P.z || 0;
    const playerSpd = Math.hypot(P.vx || 0, P.vz || 0);
    const glooms = Array.isArray(c.glooms) ? c.glooms : null;
    const randFn = typeof c.rng === 'function' ? c.rng : Math.random;
    const hFn = typeof c.heightAt === 'function' ? c.heightAt : defaultHeightZero;
    const waterY = c.WATER_Y !== undefined ? c.WATER_Y : ANIMAL_DEFAULT_WATER_Y;
    const sceneRef = getSceneRef(c);

    for (let i = wild.length - 1; i >= 0; i--) {
      const w = wild[i];
      if (!w || !w.mesh || !w.mesh.position) continue;
      const m = w.mesh;
      const pos = m.position;
      const rig = m.userData && m.userData.animalRig;
      const aerial = isAerialSpecies(w.species);
      const arch = speciesToArchetype(w.species);
      const temp = getTemperament(w.species);
      const isRare = !!(w.species && w.species.rare);
      const isShyOrRare = temp === 'shy' || isRare;

      const d = Math.hypot(pos.x - px, pos.z - pz);
      if (d > 90) {
        if (sceneRef && typeof sceneRef.remove === 'function') sceneRef.remove(m);
        wild.splice(i, 1);
        continue;
      }

      // Rare starlight sightings: low-rate sparkles + clean storybook toast at <= 24u
      if (isRare) {
        w._sparkleAcc = (w._sparkleAcc || 0) + aiDt;
        if (w._sparkleAcc >= 0.45) {
          w._sparkleAcc = 0;
          if (typeof c.burst === 'function') {
            c.burst(pos.x, pos.y + 0.75, pos.z, w.species.auraColor || 0xffe476, 1, true);
          }
        }
        if (d <= 24 && !w.rareAnnounced) {
          w.rareAnnounced = true;
          if (c.Sound && typeof c.Sound.chime === 'function') c.Sound.chime();
          if (typeof c.toast === 'function') {
            c.toast('A rare ' + w.species.name + ' appeared nearby!', 3600);
          }
        }
      }

      // Check nearest living Gloomblob within 9.0u
      let nearGloom = null;
      let nearGloomD = 9.0001;
      if (glooms) {
        for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
          const g = glooms[gIdx];
          if (!g || g.hp <= 0 || g.state === 'flee' || !g.mesh || !g.mesh.position) continue;
          const gd = Math.hypot(g.mesh.position.x - pos.x, g.mesh.position.z - pos.z);
          if (gd <= 9.0 && gd < nearGloomD) {
            nearGloomD = gd;
            nearGloom = g;
          }
        }
      }

      if (nearGloom) {
        w.state = 'fleeGloom';
      } else if (w.state === 'fleeGloom') {
        // Hysteresis before calming back down
        let anyNear = false;
        if (glooms) {
          for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
            const g = glooms[gIdx];
            if (!g || g.hp <= 0 || g.state === 'flee' || !g.mesh || !g.mesh.position) continue;
            if (Math.hypot(g.mesh.position.x - pos.x, g.mesh.position.z - pos.z) <= 12.0) {
              anyNear = true;
              break;
            }
          }
        }
        if (!anyNear) {
          w.state = 'wander';
          w.stateT = 2.5 + randFn() * 2.5;
        }
      }

      const calmR = isShyOrRare ? 5.2 : 5.8;
      let speed = 0;
      let mode = null;
      let lookAtPlayer = false;

      if (w.state === 'fleeGloom') {
        if (nearGloom) {
          w.dir = Math.atan2(pos.x - nearGloom.mesh.position.x, pos.z - nearGloom.mesh.position.z);
        }
        speed = aerial ? 6.0 : 6.4;
        mode = aerial ? 'fly' : 'run';
      } else if (w.state === 'flee') {
        w.dir = Math.atan2(pos.x - px, pos.z - pz);
        speed = isRare || arch === 'stag' || arch === 'unicorn' ? 6.2 : 5.8;
        mode = aerial ? 'fly' : 'run';
        w.fleeT = (w.fleeT || 0) + aiDt;
        if (d > 15) {
          w.state = 'wander';
          w.fleeT = 0;
          w.stateT = 2.5 + randFn() * 2.5;
        } else if (w.fleeT > 3.5) {
          w.state = 'tired';
          w.trustT = 0;
          if (typeof c.toast === 'function') {
            c.toast("It's tired! Stay close a moment...", 2200);
          }
        }
      } else if (w.state === 'tired') {
        w.dir = Math.atan2(px - pos.x, pz - pos.z);
        lookAtPlayer = true;
        mode = 'idleAlt';
        w._heartAcc = (w._heartAcc || 0) + aiDt;
        if (w._heartAcc >= 0.14) {
          w._heartAcc = 0;
          if (typeof c.burst === 'function') c.burst(pos.x, pos.y + 1, pos.z, 0xff8fb0, 1, true);
        }
        if (d > 9.0) {
          w.state = 'flee';
          w.fleeT = 2.0;
        } else {
          w.trustT = (w.trustT || 0) + aiDt;
          if (w.trustT > 2.0) {
            if (rig && typeof rig.clearLookTarget === 'function') rig.clearLookTarget();
            befriendWild(wild, i, w, c);
            continue;
          }
        }
      } else if (w.state === 'calmTrust') {
        w.dir = Math.atan2(px - pos.x, pz - pos.z);
        lookAtPlayer = true;
        mode = 'idleAlt';
        w._heartAcc = (w._heartAcc || 0) + aiDt;
        if (w._heartAcc >= 0.16) {
          w._heartAcc = 0;
          if (typeof c.burst === 'function') c.burst(pos.x, pos.y + 1, pos.z, 0xff8fb0, 1, true);
        }
        if (d < 7.5 && playerSpd >= 4.6) {
          w.state = 'flee';
          w.dir = Math.atan2(pos.x - px, pos.z - pz);
          w.fleeT = 0;
          w.trustT = 0;
          if (!_wildHinted && typeof c.toast === 'function') {
            _wildHinted = true;
            c.toast('That critter is shy! Chase it gently until it stops...', 3500);
          }
        } else if (d > calmR + 2.4) {
          w.state = 'wander';
          w.trustT = 0;
          w.stateT = 2.5 + randFn() * 2.5;
        } else {
          w.trustT = (w.trustT || 0) + aiDt;
          if (w.trustT > 2.2) {
            if (rig && typeof rig.clearLookTarget === 'function') rig.clearLookTarget();
            befriendWild(wild, i, w, c);
            continue;
          }
        }
      } else {
        // Daily life: wander <-> graze <-> rest <-> curious
        const sprintSpook = d < 7.5 && playerSpd >= 4.6;
        const shySpook = isShyOrRare && d < 4.2 && playerSpd >= 2.5;
        if (sprintSpook || shySpook) {
          w.state = 'flee';
          w.dir = Math.atan2(pos.x - px, pos.z - pz);
          w.fleeT = 0;
          if (!_wildHinted && typeof c.toast === 'function') {
            _wildHinted = true;
            c.toast('That critter is shy! Chase it gently until it stops...', 3500);
          }
          speed = 5.8;
          mode = aerial ? 'fly' : 'run';
        } else if (d < calmR && playerSpd < 4.6) {
          w.state = 'calmTrust';
          w.trustT = 0;
          w.dir = Math.atan2(px - pos.x, pz - pos.z);
          lookAtPlayer = true;
          mode = 'idleAlt';
        } else {
          if (w.stateT === undefined) w.stateT = 2.5 + randFn() * 2.5;
          w.stateT -= aiDt;

          if (w.state === 'graze') {
            mode = 'eat';
            if (w.stateT <= 0) {
              w.state = randFn() < 0.42 ? 'rest' : 'wander';
              w.stateT = w.state === 'rest' ? (2.5 + randFn() * 2.0) : (2.8 + randFn() * 2.5);
            }
          } else if (w.state === 'rest') {
            mode = 'sleep';
            if (w.stateT <= 0) {
              w.state = 'wander';
              w.stateT = 2.8 + randFn() * 2.5;
            }
          } else if (w.state === 'curious') {
            mode = 'idleAlt';
            lookAtPlayer = true;
            w.dir = Math.atan2(px - pos.x, pz - pos.z);
            if (w.stateT <= 0 || d > 14) {
              w.state = 'wander';
              w.stateT = 2.8 + randFn() * 2.5;
              lookAtPlayer = false;
            }
          } else {
            w.state = 'wander';
            speed = temp === 'busy' ? 2.4 : 2.0;
            w.turnT = (w.turnT !== undefined ? w.turnT : 2.0) - aiDt;
            if (w.turnT <= 0) {
              w.dir = (w.dir || 0) + (randFn() - 0.5) * 2.5;
              w.turnT = 2.0 + randFn() * 3.0;
            }
            // Gently avoid wandering straight into deep water or sheer cliffs
            const aheadX = pos.x + Math.sin(w.dir || 0) * 1.8;
            const aheadZ = pos.z + Math.cos(w.dir || 0) * 1.8;
            const aheadH = hFn(aheadX, aheadZ);
            if (!aerial && (aheadH < waterY + 0.15 || aheadH - hFn(pos.x, pos.z) > 2.0)) {
              w.dir = (w.dir || 0) + 2.2 * aiDt;
            }
            if (w.stateT <= 0) {
              if (d < 12.0 && temp === 'curious' && randFn() < 0.45) {
                w.state = 'curious';
                w.stateT = 2.4 + randFn() * 1.8;
                lookAtPlayer = true;
              } else if (!w._lastGrazed || randFn() < 0.6) {
                w.state = 'graze';
                w._lastGrazed = true;
                w.stateT = 2.5 + randFn() * 2.5;
                mode = 'eat';
                speed = 0;
              } else {
                w.state = 'rest';
                w._lastGrazed = false;
                w.stateT = 2.5 + randFn() * 2.0;
                mode = 'sleep';
                speed = 0;
              }
            }
          }
        }
      }

      if (rig) {
        if (lookAtPlayer && typeof rig.setLookTarget === 'function') {
          rig.setLookTarget(px, py + 1.3, pz);
        } else if (!lookAtPlayer && typeof rig.clearLookTarget === 'function') {
          rig.clearLookTarget();
        }
      }

      const yaw = w.dir || 0;
      const wildSpdMult = (w.stats && typeof w.stats.spd === 'number')
        ? clamp(w.stats.spd, CHASE_SPEED_MIN, CHASE_SPEED_MAX)
        : 1.0;
      const adjSpeed = speed > 0 ? speed * wildSpdMult : 0;
      const desVx = adjSpeed > 0 ? Math.sin(yaw) * adjSpeed : 0;
      const desVz = adjSpeed > 0 ? Math.cos(yaw) * adjSpeed : 0;

      if (aerial) {
        let targetAlt = 0.75;
        if (w.state === 'flee' || w.state === 'fleeGloom') {
          targetAlt = 1.25 + Math.sin(nowTime * 5.0 + i) * 0.18;
        } else if (w.state === 'graze' || w.state === 'rest' || w.state === 'curious' ||
                   w.state === 'calmTrust' || w.state === 'tired') {
          targetAlt = arch === 'firefly' ? 0.55 : 0.08;
        } else {
          targetAlt = (arch === 'bird' && w.species && w.species.archetype === 'songbird')
            ? 0.35 + Math.sin(nowTime * 3.0 + i) * 0.12
            : 0.90 + Math.sin(nowTime * 2.2 + i) * 0.14;
        }
        for (let s = 0; s < nSub; s++) {
          stepAerialPhysics(w, physDt, nowTime, desVx, desVz, targetAlt, c);
        }
      } else {
        for (let s = 0; s < nSub; s++) {
          stepLandPhysics(w, physDt, nowTime, desVx, desVz, c);
        }
        // Keep facing toward Starkeeper cleanly during calm/curious/tired pauses
        if (lookAtPlayer && speed === 0) {
          turnMeshToward(m, m.rotation, getPhysRef(c), yaw, aiDt, 7);
        }
      }

      const phys = w.phys;
      w.smoothSpd = phys.smoothSpd;
      w.gaitPhase = phys.gaitPhase;

      const isFleeing = w.state === 'flee' || w.state === 'fleeGloom';
      const isAirborne = aerial ? phys.airLift > 0.22 : (!phys.onGround && !phys.inWater);
      const wildVisualMode = (!aerial && phys.inWater) ? null : mode;
      syncEntityVisual(
        m,
        phys,
        aiDt,
        nowTime + i * 1.3,
        wildVisualMode,
        isFleeing ? 5.6 : 2.6,
        0,
        phys.smoothSpd > 0.25,
        isAirborne,
        c
      );
    }
  }

  function selectFollowerTarget(f, prevX, prevZ, P, glooms, fightersUsed) {
    _aiCombatPick.target = null;
    _aiCombatPick.idx = -1;
    _aiCombatPick.isSelfDefense = false;
    if (!glooms || glooms.length === 0) return _aiCombatPick;

    const prevY = (f && f.mesh && f.mesh.position && f.mesh.position.y) || 0;

    // Tier 1a: Retaliate directly against recent attacker (UNCAPPED)
    if (f.attacker && f.attacker.hp > 0 && f.attacker.state !== 'flee') {
      const aIdx = glooms.indexOf(f.attacker);
      if (aIdx >= 0 && f.attacker.mesh && f.attacker.mesh.position) {
        const ap = f.attacker.mesh.position;
        if (Math.hypot(ap.x - prevX, ap.z - prevZ) < 14 && (!f.attacker.underwater || Math.abs(ap.y - prevY) <= 3.5)) {
          _aiCombatPick.target = f.attacker;
          _aiCombatPick.idx = aIdx;
          _aiCombatPick.isSelfDefense = true;
          return _aiCombatPick;
        }
      } else {
        f.attacker = null;
      }
    }

    // Tier 1b: Fight back against any gloom targeting this companion or within 7u (UNCAPPED)
    let bestSelfD = Infinity;
    for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
      const g = glooms[gIdx];
      if (!g || g.hp <= 0 || g.state === 'flee' || !g.mesh || !g.mesh.position) continue;
      const gp = g.mesh.position;
      if (g.underwater && Math.abs(gp.y - prevY) > 3.5) continue;
      const dSelf = Math.hypot(gp.x - prevX, gp.z - prevZ);
      const targetingMe = g.targetAlly === f && dSelf < 11.5;
      const immediateThreat = dSelf < 7.0;
      if ((targetingMe || immediateThreat) && dSelf < bestSelfD) {
        bestSelfD = dSelf;
        _aiCombatPick.target = g;
        _aiCombatPick.idx = gIdx;
        _aiCombatPick.isSelfDefense = true;
      }
    }
    if (_aiCombatPick.target) return _aiCombatPick;

    // Tier 2: Rally to help a fellow friend under attack
    const isAerialHunter = !!(f && f.stats && f.stats.role === 'aerial');
    if (fightersUsed < 4) {
      let bestAllyThreatScore = 10.5;
      for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
        const g = glooms[gIdx];
        if (!g || g.hp <= 0 || g.state === 'flee' || !g.targetAlly || g.targetAlly === f || !g.mesh || !g.mesh.position) continue;
        const gp = g.mesh.position;
        if (g.underwater && Math.abs(gp.y - prevY) > 3.5) continue;
        const dSelf = Math.hypot(gp.x - prevX, gp.z - prevZ);
        if (dSelf >= 10.5) continue;
        const score = dSelf - (isAerialHunter && g.tier && g.tier.aerial ? 3.5 : 0);
        if (score < bestAllyThreatScore) {
          bestAllyThreatScore = score;
          _aiCombatPick.target = g;
          _aiCombatPick.idx = gIdx;
        }
      }
      if (_aiCombatPick.target) return _aiCombatPick;
    }

    // Tier 3: Escort defense around Starkeeper (up to 3 escort fighters within 14u)
    if (!P.dead && fightersUsed < 3) {
      let bestScore = 14.0;
      const px = P.x || 0;
      const pz = P.z || 0;
      for (let gIdx = 0; gIdx < glooms.length; gIdx++) {
        const g = glooms[gIdx];
        if (!g || g.hp <= 0 || g.state === 'flee' || !g.mesh || !g.mesh.position) continue;
        const gp = g.mesh.position;
        if (g.underwater && Math.abs(gp.y - prevY) > 3.5) continue;
        const dPlayer = Math.hypot(gp.x - px, gp.z - pz);
        if (dPlayer >= 14.0) continue;
        const score = dPlayer - (isAerialHunter && g.tier && g.tier.aerial ? 3.5 : 0);
        if (score < bestScore) {
          bestScore = score;
          _aiCombatPick.target = g;
          _aiCombatPick.idx = gIdx;
        }
      }
    }

    return _aiCombatPick;
  }

  function updateFollowers(followers, dt, time, ctx) {
    if (!Array.isArray(followers)) return;
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) return;

    const c = ctx || _physDefaultCtx;
    const aiDt = Math.min(0.25, rawDt);
    const nSub = aiDt > 0.05 ? Math.min(5, Math.ceil(aiDt / 0.05)) : 1;
    const physDt = aiDt / nSub;
    const nowTime = typeof time === 'number' ? time : 0;

    const P = getPlayerRef(c);
    const px = P.x || 0;
    const py = P.y || 0;
    const pz = P.z || 0;
    const pFacing = P.facing || 0;
    const playerSpd = Math.hypot(P.vx || 0, P.vz || 0);
    const glooms = Array.isArray(c.glooms) ? c.glooms : null;
    const randFn = typeof c.rng === 'function' ? c.rng : Math.random;
    const PhysicsRef = getPhysRef(c);

    let fightersUsed = 0;
    const synergy = computeBandSynergy(followers, _bandSynergy);

    for (let i = 0; i < followers.length; i++) {
      const f = followers[i];
      if (!f || !f.mesh || !f.mesh.position) continue;
      const m = f.mesh;
      const pos = m.position;
      const prevX = pos.x;
      const prevZ = pos.z;

      if (f._baseScale === undefined) {
        f._baseScale = m.scale && typeof m.scale.x === 'number' && m.scale.x > 0 ? m.scale.x : 0.8;
      }

      const phys = ensurePhysState(f, m.rotation);
      const rig = m.userData && m.userData.animalRig;
      const arch = speciesToArchetype(f.species);
      const aerial = isAerialSpecies(f.species);
      const fStats = f.stats || null;
      const spdMult = (fStats && typeof fStats.spd === 'number')
        ? clamp(fStats.spd, CHASE_SPEED_MIN, CHASE_SPEED_MAX)
        : 1.0;

      if (f.hurtInvulnT > 0) f.hurtInvulnT = Math.max(0, f.hurtInvulnT - aiDt);
      if (f.flash > 0) {
        f.flash = Math.max(0, f.flash - aiDt);
        if (!f._hurtAnimPlayed && rig && typeof rig.triggerOneShot === 'function') {
          rig.triggerOneShot('hit', 0.35);
        }
        f._hurtAnimPlayed = true;
      } else {
        f._hurtAnimPlayed = false;
      }
      if (f.atkCooldown > 0) f.atkCooldown = Math.max(0, f.atkCooldown - aiDt);
      if (f.celebrateT > 0) f.celebrateT = Math.max(0, f.celebrateT - aiDt);
      if (f.defendT > 0) {
        f.defendT = Math.max(0, f.defendT - aiDt);
        if (f.defendT <= 0) f.attacker = null;
      }

      const pick = selectFollowerTarget(f, prevX, prevZ, P, glooms, fightersUsed);
      const combatTarget = pick.target;
      const combatIdx = pick.idx;
      const isSelfDefense = pick.isSelfDefense;

      let desVx = 0;
      let desVz = 0;
      let targetAlt = aerial ? 0.72 : 0;
      let mode = null;
      let lookYaw = m.rotation ? m.rotation.y : phys.facing;
      let forceLookYaw = false;
      let isIdleSettled = false;

      if (combatTarget) {
        if (!isSelfDefense) fightersUsed++;
        f._standT = 0;
        f._idlePhaseT = 0;

        const gp = combatTarget.mesh.position;
        const dx = gp.x - prevX;
        const dz = gp.z - prevZ;
        const distG = Math.hypot(dx, dz);
        const inv = 1 / Math.max(0.01, distG);
        lookYaw = Math.atan2(dx, dz);
        const inRecovery = f.atkCooldown > 1.25;

        const isPouncer = arch === 'wolf' || arch === 'fox' || arch === 'stag';
        let approachSpd = 7.6;
        if (arch === 'unicorn') {
          if (inRecovery) {
            f._chargeSpd = 5.5;
            approachSpd = 3.0;
          } else {
            f._chargeSpd = Math.min(10.8, (f._chargeSpd || 6.5) + aiDt * 7.5);
            approachSpd = f._chargeSpd;
          }
        } else if (arch === 'drake') {
          approachSpd = inRecovery ? 2.8 : 9.2;
        } else if (aerial) {
          approachSpd = inRecovery ? 4.8 : 8.8;
          targetAlt = (inRecovery || distG > 2.4) ? 1.9 : 0.95;
        } else if (isPouncer) {
          approachSpd = inRecovery ? 2.6 : 8.4;
        } else {
          approachSpd = inRecovery ? 2.6 : 8.2;
        }

        // Unicorn starlight trail shimmer during charge
        if (arch === 'unicorn' && !inRecovery && distG > 2.0 && distG < 4.5 && f.atkCooldown <= 0) {
          f._chargeSparkT = (f._chargeSparkT || 0) + aiDt;
          if (f._chargeSparkT >= 0.14) {
            f._chargeSparkT = 0;
            if (typeof c.burst === 'function') {
              c.burst(prevX, pos.y + 0.65, prevZ, (f.species && f.species.auraColor) || 0xd4a5ff, 2, true);
            }
          }
        }

        // Wolf / Fox / Lynx / Stag Parabolic Pounce Lunge start at distG <= 2.3
        if (isPouncer && distG <= 2.3 && f.atkCooldown <= 0 && !f._pouncing && phys.onGround && !phys.inWater) {
          phys.vy = 5.4;
          phys.onGround = false;
          f._pouncing = true;
          f._pounceAnimFired = true;
          if (rig && typeof rig.triggerOneShot === 'function') {
            rig.triggerOneShot('attack', 0.45);
          }
        }

        if (distG > 1.35) {
          const finalApproachSpd = approachSpd * spdMult;
          desVx = dx * inv * finalApproachSpd;
          desVz = dz * inv * finalApproachSpd;
        }

        const gRadExtra = combatTarget.tier && combatTarget.tier.colRadius
          ? Math.max(0, combatTarget.tier.colRadius - 0.65)
          : 0;
        const vertStrikeOk = !combatTarget.underwater || Math.abs(gp.y - pos.y) <= 3.5;

        // Impact strike at distG <= 2.1 (+ large boss radius margin)
        if (distG <= 2.1 + gRadExtra && vertStrikeOk && f.atkCooldown <= 0) {
          const isRare = !!(f.species && f.species.rare);
          let dmg;
          if (fStats) {
            const baseCd = fStats.atkCd * synergy.cdMult;
            f.atkCooldown = Math.max(0.75, baseCd * (0.92 + randFn() * 0.16));
            const antiAir = (combatTarget.tier && combatTarget.tier.aerial && fStats.antiAirMult)
              ? fStats.antiAirMult
              : 1.0;
            dmg = Math.round(fStats.atk * synergy.atkMult * antiAir * 100) / 100;
          } else {
            f.atkCooldown = 1.9 + randFn() * 0.5;
            dmg = (f.species && f.species.attackDmg) || (isRare ? 2 : 1);
          }

          let fxCol = 0x7ef09c;
          let atkDur = 0.45;
          if (arch === 'unicorn') {
            fxCol = isRare ? (f.species.auraColor || 0xd4a5ff) : 0xc89eff;
            atkDur = 0.48;
          } else if (arch === 'drake') {
            fxCol = isRare ? 0xff6e9c : 0xff7a33;
            atkDur = 0.45;
          } else if (aerial) {
            fxCol = 0xffe476;
            atkDur = 0.45;
            phys.vy = Math.max(phys.vy, 3.2);
          } else if (arch === 'beetle' || arch === 'kiwi') {
            fxCol = 0xffe45c;
            atkDur = 0.40;
          } else {
            fxCol = isRare ? (f.species.auraColor || 0xffe476) : 0x7ef09c;
            atkDur = 0.45;
            if (!f._pouncing && !phys.inWater) {
              phys.vy = Math.max(phys.vy, 5.4);
              phys.onGround = false;
              f._pouncing = true;
            }
          }

          if (!f._pounceAnimFired && rig && typeof rig.triggerOneShot === 'function') {
            rig.triggerOneShot('attack', atkDur);
          }
          f._pounceAnimFired = false;
          if (typeof c.burst === 'function') {
            c.burst(gp.x, gp.y + 0.7, gp.z, fxCol, isRare ? 11 : 8);
          }

          const dirLen = Math.hypot(dx, dz);
          if (dirLen > 1e-4) {
            _aiBoltDir.x = dx / dirLen;
            _aiBoltDir.y = 0;
            _aiBoltDir.z = dz / dirLen;
          } else {
            _aiBoltDir.x = 1;
            _aiBoltDir.y = 0;
            _aiBoltDir.z = 0;
          }
          if (typeof c.hitGloom === 'function') {
            c.hitGloom(combatTarget, combatIdx, _aiBoltDir, dmg, true, false);
          }

          const hopInv = 1 / Math.max(0.1, distG);
          f.kx = (f.kx || 0) - dx * hopInv * 5.2;
          f.kz = (f.kz || 0) - dz * hopInv * 5.2;
        }

        if (phys.onGround && f.atkCooldown <= 0.4) {
          f._pouncing = false;
          f._pounceAnimFired = false;
        }
        if (rig && typeof rig.setLookTarget === 'function') {
          rig.setLookTarget(gp.x, gp.y + 0.65, gp.z);
        }
      } else {
        if (f._chargeSpd !== undefined && f._chargeSpd > 5.5) f._chargeSpd = 5.5;
        f._pounceAnimFired = false;

        // Smart Regroup Leash: if a non-fighting companion falls far behind (> 38u) after sprinting
        // or gets wedged behind a cliff/obstacle (> 4.5s stuck at > 18u), gracefully regroup it behind Starkeeper!
        const distToPlayer = Math.hypot(prevX - px, prevZ - pz);
        if (!P.dead && distToPlayer > 18.0) {
          if (phys.smoothSpd < 0.75) {
            f._stuckT = (f._stuckT || 0) + aiDt;
          } else {
            f._stuckT = Math.max(0, (f._stuckT || 0) - aiDt * 2.0);
          }
          if (distToPlayer > 38.0 || f._stuckT > 4.5) {
            const hFn = typeof c.heightAt === 'function' ? c.heightAt : defaultHeightZero;
            const waterY = c.WATER_Y !== undefined ? c.WATER_Y : ANIMAL_DEFAULT_WATER_Y;
            const regAng = pFacing + Math.PI + (((i % 7) - 3) * 0.34);
            const regDist = 3.6 + (i % 3) * 1.15;
            const rx = px + Math.sin(regAng) * regDist;
            const rz = pz + Math.cos(regAng) * regDist;
            const gh = hFn(rx, rz);
            const ry = aerial ? Math.max(gh, waterY) + 0.9 : (P.swimming ? Math.max(gh, waterY - 0.35) : Math.max(gh, waterY));
            pos.x = rx;
            pos.y = ry;
            pos.z = rz;
            phys.vx = 0;
            phys.vy = 0;
            phys.vz = 0;
            phys.onGround = !aerial && ry <= gh + 0.05;
            phys.inWater = !aerial && ry < waterY;
            f.kx = 0;
            f.kz = 0;
            f._stuckT = 0;
            if (typeof c.burst === 'function') {
              c.burst(rx, ry + 0.65, rz, 0xffe89c, 5, true);
            }
            continue;
          }
        } else {
          f._stuckT = 0;
        }

        // Compact Concentric Crescent Pack Formation behind/beside Starkeeper (scales cleanly to 25-100+ friends!)
        let ring = 0;
        let idxInRing = i;
        let ringCap = 6;
        while (idxInRing >= ringCap) {
          idxInRing -= ringCap;
          ring++;
          ringCap = 6 + ring * 4;
        }
        const side = (idxInRing % 2 === 0) ? 1 : -1;
        const pairStep = Math.floor(idxInRing / 2);
        const maxPairs = Math.max(1, Math.ceil(ringCap / 2));
        const arcSpread = 0.55 + ((pairStep + 0.5) / maxPairs) * 1.65;
        const flankAngle = pFacing + Math.PI + side * arcSpread;
        const slotDist = 2.4 + ring * 1.75;
        const slotX = px + Math.sin(flankAngle) * slotDist;
        const slotZ = pz + Math.cos(flankAngle) * slotDist;

        // Boids separation between fellow followers (sepDist = 1.65u)
        const sepDist = 1.65;
        const sepDistSq = sepDist * sepDist;
        let sepVx = 0;
        let sepVz = 0;
        for (let j = 0; j < followers.length; j++) {
          if (j === i) continue;
          const other = followers[j];
          if (!other || !other.mesh || !other.mesh.position) continue;
          const sdx = prevX - other.mesh.position.x;
          const sdz = prevZ - other.mesh.position.z;
          const sd2 = sdx * sdx + sdz * sdz;
          if (sd2 < sepDistSq) {
            if (sd2 < 1e-6) {
              const breakAng = i * 2.399963 + j * 0.7;
              sepVx += Math.cos(breakAng) * 4.5;
              sepVz += Math.sin(breakAng) * 4.5;
            } else {
              const sd = Math.sqrt(sd2);
              const push = (sepDist - sd) / sepDist;
              sepVx += (sdx / sd) * push * 5.2;
              sepVz += (sdz / sd) * push * 5.2;
            }
          }
        }

        const dxSlot = slotX - prevX;
        const dzSlot = slotZ - prevZ;
        const distSlot = Math.hypot(dxSlot, dzSlot);
        const arriveRadius = 2.0;

        if (distSlot > 0.35) {
          // Catch-up sprint boost when falling behind Starkeeper (> 10u) so band keeps pace during sprints!
          const catchupCap = distSlot > 10.0 ? 13.5 : 10.5;
          const baseSpd = Math.min(catchupCap, 2.2 + distSlot * 2.2) * spdMult;
          const ramp = distSlot < arriveRadius ? Math.max(0.25, distSlot / arriveRadius) : 1.0;
          const moveSpd = baseSpd * ramp;
          desVx = (dxSlot / distSlot) * moveSpd + sepVx;
          desVz = (dzSlot / distSlot) * moveSpd + sepVz;
          lookYaw = Math.atan2(dxSlot, dzSlot);
        } else {
          desVx = sepVx;
          desVz = sepVz;
          lookYaw = pFacing;
          forceLookYaw = Math.hypot(sepVx, sepVz) < 0.25;
        }

        if (aerial) {
          targetAlt = f.celebrateT > 0
            ? 1.55 + Math.sin(nowTime * 9 + i) * 0.25
            : (0.78 + (ring % 2) * 0.22 + Math.sin(nowTime * 2.8 + i) * 0.14);
        }

        // Idle Grazing & Resting when Starkeeper stands still > 3.0s
        if (playerSpd < 0.35) {
          f._standT = (f._standT || 0) + aiDt;
        } else {
          f._standT = 0;
          f._idlePhaseT = 0;
        }

        if (f._standT > 3.0 && distSlot < 1.4 && phys.smoothSpd < 0.85 && !(f.celebrateT > 0)) {
          isIdleSettled = true;
          // Diverse 3+ role bands organically tend to each other while resting out of combat
          if (fStats && synergy.restHealRate > 0 && f.hp > 0 && f.hp < f.maxHp) {
            f.hp = Math.min(f.maxHp, f.hp + synergy.restHealRate * aiDt);
            f._healSparkAcc = (f._healSparkAcc || 0) + aiDt;
            if (f._healSparkAcc >= 1.1) {
              f._healSparkAcc = 0;
              if (typeof c.burst === 'function') {
                c.burst(pos.x, pos.y + 0.75, pos.z, 0xa8f5b8, 2, true);
              }
            }
          }
          if (aerial) {
            targetAlt = arch === 'firefly' ? 0.55 : 0.12;
          }
          f._idlePhaseT = (f._idlePhaseT || 0) + aiDt;
          const cycle = (f._idlePhaseT + i * 1.1) % 10.5;
          if (cycle < 4.0) {
            mode = 'eat';
            if (rig && typeof rig.clearLookTarget === 'function') rig.clearLookTarget();
          } else if (cycle < 7.5) {
            mode = (i % 2 === 0) ? 'idleAlt' : 'sleep';
            if (rig && typeof rig.setLookTarget === 'function') {
              rig.setLookTarget(px, py + 1.3, pz);
            }
          } else {
            mode = 'idle';
            if (rig && typeof rig.setLookTarget === 'function') {
              rig.setLookTarget(
                px + Math.sin(nowTime * 0.8 + i) * 3.5,
                py + 1.1,
                pz + Math.cos(nowTime * 0.8 + i) * 3.5
              );
            }
          }
        } else if (rig && typeof rig.clearLookTarget === 'function') {
          rig.clearLookTarget();
        }
      }

      if (aerial) {
        for (let s = 0; s < nSub; s++) {
          stepAerialPhysics(f, physDt, nowTime, desVx, desVz, targetAlt, c);
        }
      } else {
        for (let s = 0; s < nSub; s++) {
          stepLandPhysics(f, physDt, nowTime, desVx, desVz, c);
        }
      }

      if (forceLookYaw) {
        turnMeshToward(m, m.rotation, PhysicsRef, lookYaw, aiDt, 6);
      }

      if (m.scale && typeof m.scale.setScalar === 'function') {
        const hurtPulse = f.flash > 0 ? 1 + (f.flash / 0.3) * 0.22 : 1;
        m.scale.setScalar(f._baseScale * hurtPulse);
      }

      f.smoothSpd = phys.smoothSpd;
      f.gaitPhase = phys.gaitPhase;

      const isAirborne = aerial ? phys.airLift > 0.22 : (!phys.onGround && !phys.inWater);
      const hurtNorm = f.flash > 0 ? Math.min(1, f.flash / 0.3) : 0;
      syncEntityVisual(
        m,
        phys,
        aiDt,
        nowTime + i * 1.7,
        (isIdleSettled && (aerial || !phys.inWater)) ? mode : null,
        combatTarget ? 5.6 : 3.2,
        hurtNorm,
        phys.smoothSpd > 0.25,
        isAirborne,
        c
      );
    }
  }

  function celebrate(followers, ctx) {
    if (!Array.isArray(followers)) return;
    const c = ctx || _physDefaultCtx;
    for (let i = 0; i < followers.length; i++) {
      const f = followers[i];
      if (!f) continue;
      const m = f.mesh;
      const phys = m ? ensurePhysState(f, m.rotation) : (f.phys || createPhysicsState(0, 0, 0, f.species));
      f.phys = phys;
      phys.vy = 4.8 + (i % 3) * 0.65;
      phys.onGround = false;
      f.celebrateT = 1.4;
      const rig = m && m.userData && m.userData.animalRig;
      if (rig && typeof rig.triggerOneShot === 'function') {
        rig.triggerOneShot('jump', 0.65);
      }
      if (m && m.position && typeof c.burst === 'function') {
        c.burst(m.position.x, m.position.y + 0.8, m.position.z, 0xffe476, 6);
      }
    }
  }

  function resolveAquaSpecies(name, aquaList) {
    if (Array.isArray(aquaList)) {
      for (let i = 0; i < aquaList.length; i++) {
        if (aquaList[i] && aquaList[i].name === name) return aquaList[i];
      }
    }
    return AQUA_FALLBACK_SPECIES[name] || AQUA_FALLBACK_SPECIES['Seafoam Fin'];
  }

  function initAquatic(aquaticCritters, ctx) {
    if (!Array.isArray(aquaticCritters)) return aquaticCritters;
    const c = ctx || _physDefaultCtx;
    const ModelsRef = getModelsRef(c);
    const THREERef = c.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const sceneRef = getSceneRef(c);
    const aquaPool = c.AQUA || (typeof AQUA !== 'undefined' ? AQUA : null);

    for (let i = 0; i < AQUA_REEF_SPAWNS.length; i++) {
      const s = AQUA_REEF_SPAWNS[i];
      const sp = resolveAquaSpecies(s.name, aquaPool);
      const scale = sp.name === 'Starlight Manta' ? 1.15 : 0.95;
      let mesh = null;
      if (ModelsRef && typeof ModelsRef.makeCritter === 'function') {
        mesh = ModelsRef.makeCritter(sp, scale);
      } else if (THREERef && typeof THREERef.Group === 'function') {
        mesh = new THREERef.Group();
        if (mesh.scale && typeof mesh.scale.setScalar === 'function') mesh.scale.setScalar(scale);
      } else {
        mesh = {
          position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
          rotation: { x: 0, y: 0, z: 0, order: 'YXZ' },
          scale: { x: scale, y: scale, z: scale, setScalar(v) { this.x = v; this.y = v; this.z = v; } },
          userData: {},
        };
      }

      if (mesh.position && typeof mesh.position.set === 'function') {
        mesh.position.set(s.x, s.y, s.z);
      } else if (mesh.position) {
        mesh.position.x = s.x;
        mesh.position.y = s.y;
        mesh.position.z = s.z;
      }

      attachToCritter(mesh, sp, c);
      if (sceneRef && typeof sceneRef.add === 'function') {
        sceneRef.add(mesh);
      }

      const phys = createPhysicsState(s.x, s.y, s.z, sp);
      phys.inWater = true;
      phys.onGround = false;
      const initYaw = (i * 0.85) % (Math.PI * 2);
      phys.vx = Math.sin(initYaw) * s.spd * 0.6;
      phys.vz = Math.cos(initYaw) * s.spd * 0.6;
      phys.facing = wrapAngle(initYaw);
      phys.prevYaw = phys.facing;

      aquaticCritters.push({
        mesh,
        species: sp,
        phys,
        cx: s.cx,
        cy: s.cy,
        cz: s.cz,
        rad: s.rad,
        homeR: Math.max(14, s.rad * 2.2),
        schoolId: s.school,
        baseSpd: s.spd,
        ang: initYaw,
        phase: i * 1.37,
      });
    }
    return aquaticCritters;
  }

  function updateAquatic(aquaticCritters, dt, time, ctx) {
    if (!Array.isArray(aquaticCritters)) return;
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) return;

    const c = ctx || _physDefaultCtx;
    const aiDt = Math.min(0.25, rawDt);
    const nSub = aiDt > 0.05 ? Math.min(5, Math.ceil(aiDt / 0.05)) : 1;
    const physDt = aiDt / nSub;
    const nowTime = typeof time === 'number' ? time : 0;

    const P = getPlayerRef(c);
    const px = P.x || 0;
    const py = P.y || 0;
    const pz = P.z || 0;

    const sepR = 1.8;
    const sepR2 = sepR * sepR;
    const aliR = 6.5;
    const aliR2 = aliR * aliR;
    const cohR = 7.5;
    const cohR2 = cohR * cohR;

    for (let i = 0; i < aquaticCritters.length; i++) {
      const ac = aquaticCritters[i];
      if (!ac || !ac.mesh || !ac.mesh.position) continue;
      const m = ac.mesh;
      const pos = m.position;
      const phys = ensurePhysState(ac, m.rotation);
      const arch = speciesToArchetype(ac.species);
      const spName = (ac.species && ac.species.name) || arch;

      if (ac.cx === undefined) {
        ac.cx = pos.x;
        ac.cy = pos.y;
        ac.cz = pos.z;
        ac.homeR = 15.0;
      }

      let sepX = 0;
      let sepY = 0;
      let sepZ = 0;
      let aliX = 0;
      let aliY = 0;
      let aliZ = 0;
      let aliCount = 0;
      let cohX = 0;
      let cohY = 0;
      let cohZ = 0;
      let cohCount = 0;

      for (let j = 0; j < aquaticCritters.length; j++) {
        if (j === i) continue;
        const nb = aquaticCritters[j];
        if (!nb || !nb.mesh || !nb.mesh.position) continue;
        const nPos = nb.mesh.position;
        const dx = pos.x - nPos.x;
        const dy = pos.y - nPos.y;
        const dz = pos.z - nPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (d2 < sepR2) {
          if (d2 < 1e-6) {
            const ang = i * 2.13 + j * 0.91;
            sepX += Math.cos(ang) * 2.0;
            sepZ += Math.sin(ang) * 2.0;
          } else {
            const d = Math.sqrt(d2);
            const invD = 1 / d;
            const w = (sepR - d) / sepR + (d < 1.2 ? 2.0 * (1.2 - d) / 1.2 : 0);
            sepX += dx * invD * w;
            sepY += dy * invD * w;
            sepZ += dz * invD * w;
          }
        }

        const nbName = (nb.species && nb.species.name) || speciesToArchetype(nb.species);
        if (nbName === spName) {
          if (d2 < aliR2 && nb.phys) {
            aliX += nb.phys.vx || 0;
            aliY += nb.phys.vy || 0;
            aliZ += nb.phys.vz || 0;
            aliCount++;
          }
          if (d2 < cohR2) {
            cohX += nPos.x;
            cohY += nPos.y;
            cohZ += nPos.z;
            cohCount++;
          }
        }
      }

      const phase = ac.phase !== undefined ? ac.phase : i * 1.37;
      const baseCruise = ac.baseSpd || (arch === 'jelly' ? 0.6 : arch === 'manta' ? 2.4 : arch === 'eel' ? 2.2 : 2.8);

      // Gentle reef orbit swirl + home-reef tether
      const offX = pos.x - ac.cx;
      const offZ = pos.z - ac.cz;
      const offH = Math.hypot(offX, offZ);
      const rad = ac.rad || 5.0;
      const homeR = ac.homeR || 15.0;

      let swirlX = 0;
      let swirlZ = 0;
      if (offH > 0.2) {
        const invH = 1 / offH;
        // Tangential flow around reef arch center + soft radial ring spring
        const radialErr = (rad - offH) * 0.25;
        swirlX = (-offZ * invH) * baseCruise + (offX * invH) * radialErr;
        swirlZ = (offX * invH) * baseCruise + (offZ * invH) * radialErr;
      } else {
        const a0 = nowTime * 0.5 + phase;
        swirlX = Math.cos(a0) * baseCruise;
        swirlZ = Math.sin(a0) * baseCruise;
      }

      let tetherX = 0;
      let tetherZ = 0;
      if (offH > homeR * 0.65) {
        const pull = (offH - homeR * 0.65) * 0.85;
        tetherX = (-offX / offH) * pull;
        tetherZ = (-offZ / offH) * pull;
      }

      const targetY = ac.cy + Math.sin(nowTime * (arch === 'jelly' ? 1.5 : 1.1) + phase) * (arch === 'jelly' ? 0.55 : 0.35);
      const tetherY = (targetY - pos.y) * (arch === 'eel' ? 1.8 : 1.2);

      let desVx = swirlX + tetherX + sepX * 4.8;
      let desVy = tetherY + sepY * 2.8;
      let desVz = swirlZ + tetherZ + sepZ * 4.8;

      if (aliCount > 0) {
        desVx += (aliX / aliCount - phys.vx) * 0.55;
        desVy += (aliY / aliCount - phys.vy) * 0.35;
        desVz += (aliZ / aliCount - phys.vz) * 0.55;
      }
      if (cohCount > 0) {
        desVx += (cohX / cohCount - pos.x) * 0.45;
        desVy += (cohY / cohCount - pos.y) * 0.30;
        desVz += (cohZ / cohCount - pos.z) * 0.45;
      }

      // Swimmer scatter within 4.2u
      const dpX = pos.x - px;
      const dpY = pos.y - py;
      const dpZ = pos.z - pz;
      const dPlayer3D = Math.hypot(dpX, dpY, dpZ);
      let scattering = false;
      if (dPlayer3D < 4.2) {
        const pLen = Math.max(0.05, Math.hypot(dpX, dpZ));
        const awayX = dpX / pLen;
        const awayZ = dpZ / pLen;
        if (arch === 'jelly') {
          desVx += awayX * 0.35;
          desVz += awayZ * 0.35;
        } else if (arch === 'manta') {
          // Manta banks gracefully outward
          desVx = awayX * 3.4 + sepX * 3.5;
          desVz = awayZ * 3.4 + sepZ * 3.5;
          desVy += 0.35;
        } else {
          scattering = true;
          const dartSpd = 5.4;
          desVx = awayX * dartSpd + sepX * 4.0;
          desVz = awayZ * dartSpd + sepZ * 4.0;
          desVy += (dpY >= 0 ? 0.4 : -0.4);
        }
      }

      // Moon Jellies drift serenely with gentle vertical pulsing
      if (arch === 'jelly') {
        const jSpd = Math.hypot(desVx, desVz);
        if (jSpd > 0.95) {
          desVx = (desVx / jSpd) * 0.95;
          desVz = (desVz / jSpd) * 0.95;
        }
      }

      for (let s = 0; s < nSub; s++) {
        stepAquaticPhysics(ac, physDt, nowTime, desVx, desVy, desVz, c);
      }

      syncEntityVisual(
        m,
        phys,
        aiDt,
        nowTime * 1.4 + phase,
        scattering ? 'swimFast' : 'swim',
        scattering ? 4.6 : 2.5,
        0,
        true,
        false,
        c
      );
    }
  }

  function updateWish(wish, dt, time, ctx) {
    if (!wish || !wish.mesh || !wish.mesh.position) return;
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    if (rawDt <= 0) return;

    const aiDt = Math.min(0.1, rawDt);
    wish.t = (wish.t || 0) + aiDt;
    const nowTime = typeof time === 'number' ? time : wish.t;

    const c = ctx || _physDefaultCtx;
    const P = getPlayerRef(c);
    const PhysicsRef = getPhysRef(c);
    const m = wish.mesh;
    const pos = m.position;
    const phys = ensurePhysState(wish, m.rotation);
    const hFn = typeof c.heightAt === 'function' ? c.heightAt : defaultHeightZero;
    const waterY = c.WATER_Y !== undefined ? c.WATER_Y : ANIMAL_DEFAULT_WATER_Y;

    const lock = PhysicsRef && PhysicsRef.lockTarget;
    const locked = !!(lock && lock.mesh && lock.mesh.position);

    let tx = 0;
    let ty = 0;
    let tz = 0;
    let aimYaw = P.facing || 0;

    if (locked) {
      const tp = lock.mesh.position;
      const orbitA = wish.t * 3.8;
      const yOff = lock.yOffset !== undefined ? lock.yOffset : 0.6;
      tx = tp.x + Math.cos(orbitA) * 0.65;
      ty = tp.y + yOff + 1.6 + Math.sin(wish.t * 5) * 0.14;
      tz = tp.z + Math.sin(orbitA) * 0.65;
      aimYaw = Math.atan2(tp.x - pos.x, tp.z - pos.z);
    } else {
      const pFacing = P.facing || 0;
      const sinF = Math.sin(pFacing);
      const cosF = Math.cos(pFacing);
      tx = (P.x || 0) - sinF * 1.5 + cosF * 0.72;
      tz = (P.z || 0) - cosF * 1.5 - sinF * 0.72;
      const floorY = Math.max(hFn(tx, tz), waterY - 0.2);
      ty = Math.max(floorY + 0.85, (P.y || 0) + 1.45) + Math.sin(wish.t * 3.1) * 0.22;
      aimYaw = pFacing;
    }

    const ex = tx - pos.x;
    const ey = ty - pos.y;
    const ez = tz - pos.z;
    const gain = locked ? 10.5 : 5.8;
    const desVx = ex * gain;
    const desVy = ey * (locked ? 10.5 : 6.2);
    const desVz = ez * gain;

    const alpha = 1 - Math.exp(-(locked ? 12.0 : 7.5) * aiDt);
    phys.vx += (desVx - phys.vx) * alpha;
    phys.vy += (desVy - phys.vy) * alpha;
    phys.vz += (desVz - phys.vz) * alpha;

    pos.x += phys.vx * aiDt;
    pos.y += phys.vy * aiDt;
    pos.z += phys.vz * aiDt;

    phys.inWater = false;
    phys.onGround = false;
    phys.airLift = Math.max(0.8, pos.y - hFn(pos.x, pos.z));

    const prevYaw = m.rotation ? m.rotation.y : phys.facing;
    const errHoriz = Math.hypot(ex, ez);
    const horizSpd = Math.hypot(phys.vx, phys.vz);
    const faceYaw = (!locked && errHoriz > 1.2 && horizSpd > 0.6)
      ? Math.atan2(phys.vx, phys.vz)
      : aimYaw;
    turnMeshToward(m, m.rotation, PhysicsRef, faceYaw, aiDt, locked ? 14 : 8);

    const newYaw = m.rotation ? m.rotation.y : phys.facing;
    phys.facing = wrapAngle(newYaw);
    const turnRate = wrapAngle(newYaw - prevYaw) / Math.max(0.001, aiDt);
    phys.prevYaw = newYaw;

    const wantBank = clamp(-turnRate * Math.max(1.0, horizSpd) * 0.06, -0.52, 0.52);
    phys.bankRoll += (wantBank - phys.bankRoll) * Math.min(1, aiDt * 8);

    if (m.rotation) {
      const wantPitch = clamp(-phys.vy * 0.06 + Math.min(0.16, horizSpd * 0.02), -0.35, 0.35);
      m.rotation.x += (wantPitch - m.rotation.x) * Math.min(1, aiDt * 7);
      m.rotation.z += (phys.bankRoll - m.rotation.z) * Math.min(1, aiDt * 8);
    }

    const spd3D = Math.hypot(phys.vx, phys.vy, phys.vz);
    phys.smoothSpd += (spd3D - phys.smoothSpd) * Math.min(1, aiDt * 10);
    phys.gaitPhase += Math.max(spd3D * aiDt * 2.5, aiDt * 8.5);

    const rig = m.userData && m.userData.animalRig;
    if (rig && typeof rig.update === 'function') {
      _aiAnimState.mode = 'fly';
      _aiAnimState.speed = Math.max(locked ? 4.8 : 2.6, phys.smoothSpd);
      _aiAnimState.refSpeed = 3.8;
      _aiAnimState.airborne = true;
      _aiAnimState.inWater = false;
      _aiAnimState.hurtFlash = 0;
      _aiAnimState.isMoving = true;
      _aiAnimState.facingYaw = newYaw;
      _aiAnimState.posX = pos.x;
      _aiAnimState.posY = pos.y;
      _aiAnimState.posZ = pos.z;
      rig.update(aiDt, nowTime, _aiAnimState);
    } else {
      const ModelsRef = getModelsRef(c);
      if (ModelsRef && typeof ModelsRef.animateCritter === 'function') {
        ModelsRef.animateCritter(m, wish.t, locked);
      }
    }

    if (m.userData && m.userData.halo && m.userData.halo.scale) {
      const hs = (locked ? 1.55 : 1.35) + Math.sin(wish.t * 4.2) * 0.12;
      m.userData.halo.scale.set(hs, hs, 1);
    }
  }

  return {
    speciesToArchetype,
    resolveAssetSource,
    preloadArchetype,
    attachToCritter,
    _resetCache,
    createPhysicsState,
    stepLandPhysics,
    stepAerialPhysics,
    stepAquaticPhysics,
    RARE_SPECIES,
    CHASE_SPEED_MIN,
    CHASE_SPEED_MAX,
    SPECIES_STAT_RANGES,
    getSpeciesStatRange,
    rollIndividualStats,
    computeBandSynergy,
    applyCompanionDefense,
    rollRareSpecies,
    getTemperament,
    updateWild,
    updateFollowers,
    celebrate,
    initAquatic,
    updateAquatic,
    updateWish,
  };
})();
