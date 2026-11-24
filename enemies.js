// ============================================================
// enemies.js - Escalating & Territorial Skinned Shadow Beasts
//
// Part 1: Threat Scaling, Territorial Selection & EnemyRig
//         (Dual-Mode Lazy Loader, SkeletonUtils.clone, Bestiary PBR
//         Preservation, Shadow Restyling, Bone Attachments & Mixer)
//
// Part 2 (Task 4): EnemyPhysics
// Part 3 (Task 4): EnemyAI
//
// Consumes globals: THREE, Models, Textures, Shaders, Physics, Regions
// Exports global:   Enemies
// ============================================================

const Enemies = (() => {
  'use strict';

  // ---------- 0. Pre-allocated Scratch Math & Shared Helpers ----------

  let _eAxisX = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(1, 0, 0) : { x: 1, y: 0, z: 0 };
  let _eAxisY = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(0, 1, 0) : { x: 0, y: 1, z: 0 };
  let _eAxisZ = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(0, 0, 1) : { x: 0, y: 0, z: 1 };
  let _eQYaw = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;
  let _eQPitch = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;
  let _eQScratch = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;

  const _eDefaultAnimState = {
    mode: null,
    speed: 0,
    refSpeed: 4.2,
    airborne: false,
    inWater: false,
    dead: false,
    windingUp: false,
    lunging: false,
    hurtFlash: 0,
    isMoving: false,
    facingYaw: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
  };

  // Pre-allocated pool buffers for zero-GC weighted tier selection
  const _poolTiers = [];
  const _poolWeights = [];

  // Pre-allocated scratch structs & telegraph pool for zero-GC EnemyPhysics / EnemyAI
  const _eColBuf = [];
  const _eColOut = { x: 0, z: 0, hit: false };
  const _eNorm = { x: 0, y: 1, z: 0 };
  const _eCurNorm = { x: 0, y: 1, z: 0 };
  const _eDefaultCtx = {};
  const _eTelegraphPool = [];
  const _eAnimState = {
    mode: null,
    speed: 0,
    refSpeed: 0,
    airborne: false,
    inWater: false,
    dead: false,
    windingUp: false,
    lunging: false,
    hurtFlash: 0,
    isMoving: false,
    facingYaw: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
  };

  function ensureScratchMath(THREERef) {
    if (!_eQYaw && THREERef && typeof THREERef.Quaternion === 'function') {
      _eQYaw = new THREERef.Quaternion();
      _eQPitch = new THREERef.Quaternion();
      _eQScratch = new THREERef.Quaternion();
    }
    if (THREERef && typeof THREERef.Vector3 === 'function' && typeof _eAxisX.set !== 'function') {
      _eAxisX = new THREERef.Vector3(1, 0, 0);
      _eAxisY = new THREERef.Vector3(0, 1, 0);
      _eAxisZ = new THREERef.Vector3(0, 0, 1);
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

  // ---------- 1. Threat Scaling, Territorial Selection & Tier Profiles ----------

  const ARCHETYPE_KEYS = ['puglin', 'imp', 'weaver', 'stinger', 'knight', 'behemoth', 'stalker'];

  const TIERS = {
    classic: {
      key: 'classic',
      name: 'Gloomblob',
      tier: 1,
      minThreat: 0,
      baseHp: 3,
      knockResist: 1.0,
      poiseHeavyOnly: false,
      windupDur: 0.42,
      lungeDur: 0.26,
      recoverDur: 0.55,
      chaseSpd: 3.9,
      lungeSpd: 10.5,
      aggroDist: 13,
      atkRange: 2.55,
      dmgPlayer: 2,
      dmgAlly: 1,
      aoeRadius: 0,
      starDrops: 2,
      heartChance: 0.45,
      fallbackScale: 1.0,
      eyeColor: 0xff8c10,
      haloColor: 0x52287a,
      colRadius: 0.65,
      yOffset: 0.65,
      aerial: false,
      underwater: false,
    },
    puglin: {
      key: 'puglin',
      name: 'Shadow Puglin',
      tier: 2,
      minThreat: 1.6,
      baseHp: 5,
      knockResist: 0.85,
      poiseHeavyOnly: false,
      windupDur: 0.44,
      lungeDur: 0.30,
      recoverDur: 0.60,
      chaseSpd: 4.4,
      lungeSpd: 10.8,
      aggroDist: 14,
      atkRange: 2.6,
      dmgPlayer: 2,
      dmgAlly: 1,
      aoeRadius: 2.0,
      starDrops: 3,
      heartChance: 0.55,
      fallbackScale: 1.12,
      eyeColor: 0xff6220,
      haloColor: 0x62246a,
      colRadius: 0.68,
      yOffset: 0.72,
      aerial: false,
      underwater: false,
      regions: ['sunlitRuins', 'whisperingForest'],
    },
    weaver: {
      key: 'weaver',
      name: 'Shadow Weaver',
      tier: 2,
      minThreat: 1.6,
      baseHp: 5,
      knockResist: 0.85,
      poiseHeavyOnly: false,
      windupDur: 0.38,
      lungeDur: 0.32,
      recoverDur: 0.55,
      chaseSpd: 4.8,
      lungeSpd: 12.5,
      aggroDist: 15,
      atkRange: 3.6,
      dmgPlayer: 2,
      dmgAlly: 1,
      aoeRadius: 0,
      starDrops: 3,
      heartChance: 0.55,
      fallbackScale: 1.08,
      eyeColor: 0xc848ff,
      haloColor: 0x5a1e84,
      colRadius: 0.72,
      yOffset: 0.55,
      aerial: false,
      underwater: false,
      leapVy: 6.2,
      regions: ['whisperingForest', 'twilightCoast'],
    },
    stinger: {
      key: 'stinger',
      name: 'Shadow Stinger',
      tier: 2,
      minThreat: 2.0,
      baseHp: 4,
      knockResist: 1.15,
      poiseHeavyOnly: false,
      windupDur: 0.46,
      lungeDur: 0.34,
      recoverDur: 0.62,
      chaseSpd: 5.2,
      lungeSpd: 13.0,
      aggroDist: 16,
      atkRange: 4.2,
      dmgPlayer: 2,
      dmgAlly: 1,
      aoeRadius: 0,
      starDrops: 3,
      heartChance: 0.55,
      fallbackScale: 0.95,
      eyeColor: 0xff3ca8,
      haloColor: 0x7a1c68,
      colRadius: 0.56,
      yOffset: 0.60,
      aerial: true,
      hoverAlt: 2.2,
      underwater: false,
      regions: ['canyonOasis', 'sunlitRuins'],
    },
    imp: {
      key: 'imp',
      name: 'Cinder Imp',
      tier: 3,
      minThreat: 3.8,
      baseHp: 8,
      knockResist: 0.62,
      poiseHeavyOnly: true,
      windupDur: 0.46,
      lungeDur: 0.32,
      recoverDur: 0.65,
      chaseSpd: 4.9,
      lungeSpd: 11.4,
      aggroDist: 16,
      atkRange: 2.8,
      dmgPlayer: 2,
      dmgAlly: 1,
      aoeRadius: 2.4,
      starDrops: 5,
      heartChance: 1.0,
      fallbackScale: 1.32,
      eyeColor: 0xff4218,
      haloColor: 0x8a1c30,
      colRadius: 0.75,
      yOffset: 0.95,
      aerial: false,
      underwater: false,
      canRoll: true,
      regions: ['canyonOasis', 'frostpeak'],
    },
    knight: {
      key: 'knight',
      name: 'Dread Knight',
      tier: 3,
      minThreat: 4.0,
      baseHp: 10,
      knockResist: 0.45,
      poiseHeavyOnly: true,
      windupDur: 0.55,
      lungeDur: 0.34,
      recoverDur: 0.75,
      chaseSpd: 4.5,
      lungeSpd: 11.8,
      aggroDist: 16.5,
      atkRange: 3.1,
      dmgPlayer: 2,
      dmgAlly: 2,
      aoeRadius: 2.8,
      frontArcOnly: true,
      starDrops: 5,
      heartChance: 1.0,
      fallbackScale: 1.48,
      eyeColor: 0xff1c3c,
      haloColor: 0x6e143e,
      colRadius: 0.85,
      yOffset: 1.25,
      aerial: false,
      underwater: false,
      canRoll: true,
      telegraphRing: true,
      regions: ['sunlitRuins', 'twilightCoast', 'frostpeak'],
    },
    behemoth: {
      key: 'behemoth',
      name: 'Eclipse Behemoth',
      tier: 4,
      minThreat: 6.4,
      baseHp: 14,
      knockResist: 0.22,
      poiseHeavyOnly: true,
      windupDur: 0.82,
      lungeDur: 0.36,
      recoverDur: 1.10,
      chaseSpd: 4.2,
      lungeSpd: 9.5,
      aggroDist: 18,
      atkRange: 4.4,
      dmgPlayer: 3,
      dmgAlly: 2,
      aoeRadius: 4.8,
      starDrops: 8,
      heartDrops: 2,
      heartChance: 1.0,
      fallbackScale: 1.85,
      eyeColor: 0xff1848,
      haloColor: 0x92123c,
      colRadius: 1.25,
      yOffset: 1.65,
      aerial: false,
      underwater: false,
      isMiniBoss: true,
      telegraphRing: true,
      regions: ['twilightCoast', 'frostpeak', 'canyonOasis', 'wilds'],
    },
    stalker: {
      key: 'stalker',
      name: 'Abyssal Stalker',
      tier: 2,
      minThreat: 0,
      baseHp: 5,
      knockResist: 0.75,
      poiseHeavyOnly: false,
      windupDur: 0.45,
      lungeDur: 0.30,
      recoverDur: 0.65,
      chaseSpd: 3.6,
      lungeSpd: 9.5,
      aggroDist: 12,
      atkRange: 2.5,
      dmgPlayer: 2,
      dmgAlly: 1,
      aoeRadius: 0,
      starDrops: 3,
      heartChance: 0.65,
      fallbackScale: 1.05,
      eyeColor: 0x38f2e8,
      haloColor: 0x1e4c78,
      colRadius: 0.72,
      yOffset: 0.55,
      aerial: false,
      underwater: true,
      regions: ['sunkenCity'],
    },
  };

  const TIER_LIST = [
    TIERS.classic,
    TIERS.puglin,
    TIERS.weaver,
    TIERS.stinger,
    TIERS.imp,
    TIERS.knight,
    TIERS.behemoth,
    TIERS.stalker,
  ];

  function computeThreatLevel(followersCount, litCount, distFromHome) {
    return Math.min(
      10,
      Math.max(
        0,
        (followersCount || 0) * 0.85 +
          (litCount || 0) * 0.75 +
          Math.max(0, (distFromHome || 0) - 28) / 38
      )
    );
  }

  function hasConcurrentBehemoth(existingGlooms) {
    if (!Array.isArray(existingGlooms) || existingGlooms.length === 0) return false;
    for (let i = 0; i < existingGlooms.length; i++) {
      const g = existingGlooms[i];
      if (!g) continue;
      if (g.dead || (typeof g.hp === 'number' && g.hp <= 0) || g.state === 'death' || g.state === 'dead') {
        continue;
      }
      if (
        g.tierKey === 'behemoth' ||
        g.archetype === 'behemoth' ||
        (g.tier && g.tier.key === 'behemoth')
      ) {
        return true;
      }
    }
    return false;
  }

  function pickEnemyTier(threat, rng, opts) {
    const options = opts || {};
    if (options.underwater) {
      return TIERS.stalker;
    }

    const tVal = typeof threat === 'number' && !Number.isNaN(threat) ? threat : 0;
    if (tVal < 1.6) {
      return TIERS.classic;
    }

    const randFn = typeof rng === 'function' ? rng : Math.random;
    const regionId = options.regionId || null;
    const capBehemoth = hasConcurrentBehemoth(options.existingGlooms);

    _poolTiers.length = 0;
    _poolWeights.length = 0;
    let totalWeight = 0;

    for (let i = 0; i < TIER_LIST.length; i++) {
      const t = TIER_LIST[i];
      if (t.underwater) continue;
      if (t.minThreat > tVal) continue;
      if (t.key === 'behemoth' && capBehemoth) continue;

      let w;
      if (t.key === 'classic') {
        w = Math.max(0.22, 0.95 - (tVal - 1.6) * 0.12);
      } else if (t.tier === 2) {
        w = Math.max(0.65, 1.15 - Math.max(0, tVal - 4.0) * 0.06);
      } else if (t.tier === 3) {
        w = 1.20 + Math.min(0.35, (tVal - t.minThreat) * 0.08);
      } else {
        w = 0.95;
      }

      if (regionId && Array.isArray(t.regions) && t.regions.indexOf(regionId) >= 0) {
        w *= 2.2;
      }

      _poolTiers.push(t);
      _poolWeights.push(w);
      totalWeight += w;
    }

    if (_poolTiers.length === 0 || totalWeight <= 0) {
      return TIERS.classic;
    }

    let roll = clamp(randFn(), 0, 0.9999999) * totalWeight;
    for (let i = 0; i < _poolTiers.length; i++) {
      roll -= _poolWeights[i];
      if (roll <= 0) return _poolTiers[i];
    }
    return _poolTiers[_poolTiers.length - 1];
  }

  // ---------- 2. EnemyRig ----------

  const DEFAULT_REF_SPEEDS = {
    puglin: { walk: 2.2, run: 4.4 },
    imp: { walk: 2.5, run: 4.9 },
    weaver: { walk: 2.4, run: 4.8 },
    stinger: { walk: 3.2, run: 5.2, fly: 5.2 },
    knight: { walk: 2.3, run: 4.5 },
    behemoth: { walk: 2.2, run: 4.2 },
    stalker: { walk: 1.9, run: 3.6 },
  };

  // Curated shadow-beast PBR palettes for CC0 monsters (sRGB hex linearized once)
  const SHADOW_PALETTES = {
    weaver: {
      tex: 'scales',
      slots: {
        Material: { color: 0x1e162e, emissive: 0x0b0618, emissiveIntensity: 0.25, roughness: 0.42, metalness: 0.28 },
        'Material.001': { tex: null, color: 0xd040ff, emissive: 0xb828ff, emissiveIntensity: 1.55, roughness: 0.16, metalness: 0.14, isEye: true },
        __default: { color: 0x1e162e, emissive: 0x0b0618, emissiveIntensity: 0.25, roughness: 0.42, metalness: 0.28 },
      },
    },
    stinger: {
      tex: 'scales',
      slots: {
        Main_2: { color: 0x161124, emissive: 0x070410, emissiveIntensity: 0.22, roughness: 0.36, metalness: 0.34 },
        Main: { color: 0x3b1b4c, emissive: 0x160826, emissiveIntensity: 0.32, roughness: 0.38, metalness: 0.24 },
        Eyes: { tex: null, color: 0xff3ca8, emissive: 0xff1e88, emissiveIntensity: 1.65, roughness: 0.14, metalness: 0.12, isEye: true },
        Wings: { tex: null, color: 0xc89eff, emissive: 0x6f28cc, emissiveIntensity: 0.55, roughness: 0.16, metalness: 0.12, transparent: true, opacity: 0.62 },
        Tongue: { tex: null, color: 0xe02868, emissive: 0x981048, emissiveIntensity: 0.95, roughness: 0.26, metalness: 0.12, isEye: true },
        Teeth: { tex: null, color: 0xdad2ec, roughness: 0.30, metalness: 0.12 },
        __default: { color: 0x241634, roughness: 0.40, metalness: 0.28 },
      },
    },
    knight: {
      tex: 'stone',
      slots: {
        Armor: { tex: 'stone', color: 0x3b3459, emissive: 0x120c26, emissiveIntensity: 0.24, roughness: 0.34, metalness: 0.62 },
        Boots: { tex: 'cloth', color: 0x201a32, emissive: 0x080614, emissiveIntensity: 0.16, roughness: 0.46, metalness: 0.45 },
        Skin: { tex: null, color: 0x151022, emissive: 0x240718, emissiveIntensity: 0.16, roughness: 0.48, metalness: 0.16, isEye: true },
        __default: { tex: 'stone', color: 0x3b3459, roughness: 0.36, metalness: 0.60 },
      },
    },
    behemoth: {
      tex: 'scales',
      slots: {
        Green: { color: 0x1b132a, emissive: 0x0a0616, emissiveIntensity: 0.26, roughness: 0.44, metalness: 0.28 },
        LightGreen: { color: 0x2d1d46, emissive: 0x120826, emissiveIntensity: 0.28, roughness: 0.46, metalness: 0.24 },
        LightYellow: { tex: null, color: 0xdad0e8, roughness: 0.32, metalness: 0.14 },
        Black: { tex: null, color: 0x100c18, roughness: 0.28, metalness: 0.46 },
        Red: { tex: null, color: 0xff1e4c, emissive: 0xff1440, emissiveIntensity: 1.70, roughness: 0.16, metalness: 0.14, isEye: true },
        __default: { color: 0x1b132a, roughness: 0.44, metalness: 0.28 },
      },
    },
    stalker: {
      tex: 'scales',
      slots: {
        Main: { color: 0x132c3d, emissive: 0x071a28, emissiveIntensity: 0.30, roughness: 0.36, metalness: 0.28 },
        Main_Dark: { color: 0x0c1b29, emissive: 0x04101a, emissiveIntensity: 0.22, roughness: 0.40, metalness: 0.32 },
        Black: { tex: null, color: 0x0a1018, roughness: 0.26, metalness: 0.42 },
        White: { tex: null, color: 0x38f2e8, emissive: 0x20dcd4, emissiveIntensity: 1.55, roughness: 0.16, metalness: 0.12, isEye: true },
        __default: { color: 0x132c3d, roughness: 0.38, metalness: 0.28 },
      },
    },
  };

  const templateCache = new Map();
  const pendingLoads = new Map();
  const pendingScripts = new Map();
  const materialCache = new Map();

  function _resetCache() {
    templateCache.clear();
    pendingLoads.clear();
    pendingScripts.clear();
    materialCache.clear();
  }

  function resolveAssetSource(key, protocol) {
    const p = protocol || (typeof location !== 'undefined' && location ? location.protocol : 'https:');
    if (p === 'file:') {
      return { mode: 'file-bundle', url: `./assets/enemies/${key}.glb.js` };
    }
    return { mode: 'glb', url: `./assets/enemies/${key}.glb` };
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
    const map = g && g.__ENEMY_GLB_B64__;
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
      onError(new Error('DOM unavailable for file:// enemy GLB bundle'));
      return;
    }

    pendingScripts.set(key, [{ onReady, onError }]);
    const sc = doc.createElement('script');
    sc.src = scriptUrl;
    sc.onload = () => {
      const waiters = pendingScripts.get(key) || [];
      pendingScripts.delete(key);
      const b64Map = g && g.__ENEMY_GLB_B64__;
      const b64 = b64Map && b64Map[key];
      if (typeof b64 === 'string' && b64.length > 0) {
        for (let i = 0; i < waiters.length; i++) waiters[i].onReady(b64);
      } else {
        const err = new Error(`${scriptUrl} loaded without __ENEMY_GLB_B64__['${key}']`);
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
    if (!key || key === 'classic' || ARCHETYPE_KEYS.indexOf(key) < 0) {
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
    const THREERef = 'THREE' in cfg ? cfg.THREE : (typeof THREE !== 'undefined' ? THREE : null);
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
              loader.parse(buf, './assets/enemies/', finishReady, finishError);
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
    return (sets.scales ? 'S' : '') + (sets.stone ? 'R' : '') + (sets.cloth ? 'C' : '');
  }

  function resolveShadowSlotCfg(archetype, origName) {
    const palette = SHADOW_PALETTES[archetype] || null;
    if (!palette) return { palette: null, slotCfg: null };
    const slotCfg = palette.slots[origName] || palette.slots.__default || null;
    return { palette, slotCfg };
  }

  function getCachedShadowMaterial(THREERef, TexturesRef, archetype, origMat, isSkinned, hasMorphs, hasMorphNormals) {
    const origName = (origMat && origMat.name) || '';
    const { palette, slotCfg } = resolveShadowSlotCfg(archetype, origName);
    const texKey = slotCfg && slotCfg.tex !== undefined ? slotCfg.tex : (palette ? palette.tex : 'scales');
    const texSig = getTextureSig(TexturesRef);
    const cacheKey = `${archetype}|${origName}|${isSkinned ? 'sk' : 'st'}|${hasMorphs ? (hasMorphNormals ? 'mpn' : 'mp') : ''}|${texKey || 'notex'}|${texSig}`;

    let baseMat = materialCache.get(cacheKey);
    if (!baseMat) {
      const sets = TexturesRef && TexturesRef.sets ? TexturesRef.sets : null;
      const texSet = sets && texKey ? sets[texKey] : null;
      const opts = {
        color: slotCfg && slotCfg.color !== undefined ? slotCfg.color : 0x221a34,
        roughness: slotCfg && slotCfg.roughness !== undefined ? slotCfg.roughness : 0.44,
        metalness: slotCfg && slotCfg.metalness !== undefined ? slotCfg.metalness : 0.28,
        skinning: !!isSkinned,
        morphTargets: !!hasMorphs,
        vertexColors: false,
      };
      if (hasMorphs && hasMorphNormals) opts.morphNormals = true;
      if (slotCfg && slotCfg.emissive !== undefined) {
        opts.emissive = slotCfg.emissive;
        opts.emissiveIntensity = slotCfg.emissiveIntensity !== undefined ? slotCfg.emissiveIntensity : 0.35;
      }
      if (slotCfg && slotCfg.transparent) {
        opts.transparent = true;
        opts.opacity = slotCfg.opacity !== undefined ? slotCfg.opacity : 0.65;
      }
      if (texSet) {
        if (texSet.map) opts.map = texSet.map;
        if (texSet.normalMap) opts.normalMap = texSet.normalMap;
        if (texSet.roughnessMap) opts.roughnessMap = texSet.roughnessMap;
        if (typeof THREERef.Vector2 === 'function') {
          opts.normalScale = new THREERef.Vector2(0.50, 0.50);
        }
      }
      baseMat = linearizeMat(new THREERef.MeshStandardMaterial(opts));
      baseMat.name = origName || archetype;
      baseMat.needsUpdate = true;
      materialCache.set(cacheKey, baseMat);
    }

    const isEye = !!(slotCfg && slotCfg.isEye);
    if (isEye && typeof baseMat.clone === 'function') {
      // Eye/accent slots get a lightweight per-instance clone so windup & hit flash stay independent
      const instEye = baseMat.clone();
      instEye.needsUpdate = true;
      return { mat: instEye, isEye: true };
    }
    return { mat: baseMat, isEye };
  }

  function applyBestiaryPbrMaterial(origMat, isSkinned, hasMorphs, hasMorphNormals) {
    if (!origMat) return null;
    const mat = typeof origMat.clone === 'function' ? origMat.clone() : origMat;
    mat.skinning = !!isSkinned;
    mat.morphTargets = !!hasMorphs;
    if (hasMorphs && hasMorphNormals) mat.morphNormals = true;
    mat.emissiveIntensity = 1.65;
    if (mat.emissive && typeof mat.emissive.setHex === 'function' && mat.emissiveMap) {
      mat.emissive.setHex(0xffffff);
    }
    mat.needsUpdate = true;
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
    if (useSkeletalOffsets && cfg.skelPos) {
      pos = cfg.skelPos;
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
    if (accent.rotation) {
      const rot = isBoneParent ? (cfg.rot || null) : (cfg.fallbackRot || null);
      if (rot) {
        if (typeof accent.rotation.set === 'function') {
          accent.rotation.set(rot[0], rot[1], rot[2]);
        } else {
          accent.rotation.x = rot[0];
          accent.rotation.y = rot[1];
          accent.rotation.z = rot[2];
        }
      }
    }
    targetParent.add(accent);
    return accent;
  }

  function attachEnemyAccents(archetype, cloneRoot, bones, ModelsRef) {
    if (!ModelsRef) return [];
    const attached = [];

    if (archetype === 'knight') {
      const handBone = findBone(
        bones,
        'Palm.R', 'PalmR',
        'LowerArm.R', 'LowerArmR',
        'UpperArm.R', 'UpperArmR',
        'Hand.R', 'HandR', 'hand_r'
      );
      if (typeof ModelsRef.makeShadowBlade === 'function') {
        const blade = ModelsRef.makeShadowBlade();
        mountAttachment(handBone || cloneRoot, cloneRoot, blade, {
          skelPos: [-0.02, 0.115, -0.015],
          bonePos: [-0.02, 0.115, -0.015],
          fallbackPos: [-0.34, 0.65, 0.15],
          rot: [0.08, 0.0, Math.PI * 0.5],
          scale: 1.15,
        });
        attached.push(blade);
      }

      const headBone = findBone(bones, 'Head');
      if (typeof ModelsRef.makeDreadCrown === 'function') {
        const crown = ModelsRef.makeDreadCrown();
        mountAttachment(headBone || cloneRoot, cloneRoot, crown, {
          skelPos: [0, 0.42, -0.02],
          bonePos: [0, 0.42, -0.02],
          fallbackPos: [0, 1.92, 0.0],
          rot: [-0.08, 0, 0],
          scale: 1.85,
        });
        attached.push(crown);
      }
    } else if (archetype === 'behemoth') {
      const spineBone = findBone(bones, 'Torso', 'Spine', 'Body');
      if (typeof ModelsRef.makeBehemothSpines === 'function') {
        const spines = ModelsRef.makeBehemothSpines();
        mountAttachment(spineBone || cloneRoot, cloneRoot, spines, {
          skelPos: [0, 0.12, 0.58],
          bonePos: [0, 0.12, 0.58],
          fallbackPos: [0, 2.25, 0.45],
          rot: [Math.PI * 0.5, Math.PI, 0],
          scale: 1.95,
        });
        attached.push(spines);
      }
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
      sh = sh.replace(/^(spider|trex|velociraptor|wasp|snake)_/, '');
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

    const first = clips[0] || null;

    const idle = pickMatch([
      (s) => s === 'idle_swordright',
      (s) => s === 'idle',
      (s) => s.includes('idle') && !s.includes('2') && !s.includes('left') && !s.includes('hit') && !s.includes('jump'),
      (s) => s === 'flying' || s === 'swimming_normal' || s === 'swim',
    ]) || first;

    const walk = pickMatch([
      (s) => s === 'walk' || s === 'walking',
      (s) => s.includes('walk') && !s.includes('back'),
      (s) => s === 'flying' || s === 'swimming_normal' || s === 'swim',
    ]) || idle;

    const run = pickMatch([
      (s) => s === 'run_swordright',
      (s) => s === 'run' || s === 'gallop' || s === 'sprint',
      (s) => (s.includes('run') || s.includes('gallop') || s.includes('sprint')) && !s.includes('attack') && !s.includes('jump'),
      (s) => s === 'flying',
    ]) || walk;

    const fly = pickMatch([
      (s) => s === 'flying' || s.includes('fly'),
    ]) || run;

    const jump = pickMatch([
      (s) => s === 'jump' || s === 'gallop_jump',
      (s) => s.includes('jump') && !s.includes('attack') && !s.includes('toidle') && !s.includes('to_idle'),
    ]) || run;

    const attack = pickMatch([
      (s) => s === 'attack',
      (s) => s === 'run_swordattack',
      (s) => s === 'bite_front',
      (s) => s.includes('attack') && !s.includes('heavy') && !s.includes('jump'),
      (s) => s.includes('bite') || s.includes('punch'),
      (s) => s.includes('headbutt'),
    ]) || jump;

    const heavyAttack = pickMatch([
      (s) => s === 'heavyattack' || s === 'heavy_attack',
      (s) => s === 'swordattackjump',
      (s) => s === 'bite_inplace',
      (s) => s.includes('heavy') || s.includes('swordattack') || s.includes('slam'),
      (s) => s.includes('headbutt'),
    ]) || attack;

    const roll = pickMatch([
      (s) => s === 'roll_sword',
      (s) => s === 'roll',
      (s) => s.includes('roll') || s.includes('dodge') || s.includes('dash'),
    ]) || jump;

    const hit = pickMatch([
      (s) => s === 'hitreact' || s === 'hitrecieve' || s === 'hitreceive' || s === 'hit',
      (s) => s.includes('hit'),
      (s) => s === 'no' || s === 'wave',
    ]) || idle;

    const death = pickMatch([
      (s) => s === 'death' || s === 'dead',
      (s) => s.includes('death') || s.includes('dead'),
    ]) || hit;

    return {
      idle,
      walk,
      run,
      fly,
      jump,
      attack,
      heavyAttack,
      roll,
      hit,
      death,
    };
  }

  function getRefSpeed(archetype, semantic) {
    const tbl = DEFAULT_REF_SPEEDS[archetype] || DEFAULT_REF_SPEEDS.puglin;
    return tbl[semantic] || tbl.walk || tbl.fly || 3.2;
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

  function resolveTierObj(tierDef) {
    if (!tierDef) return TIERS.classic;
    if (typeof tierDef === 'string') return TIERS[tierDef] || TIERS.classic;
    if (tierDef.key && TIERS[tierDef.key] === tierDef) return tierDef;
    if (tierDef.key && TIERS[tierDef.key]) return Object.assign({}, TIERS[tierDef.key], tierDef);
    return tierDef;
  }

  function attachToGloom(rootMesh, tierDef, deps) {
    const cfg = deps || {};
    const THREERef = 'THREE' in cfg ? cfg.THREE : (typeof THREE !== 'undefined' ? THREE : null);
    const ModelsRef = 'Models' in cfg ? cfg.Models : (typeof Models !== 'undefined' ? Models : null);
    const TexturesRef = 'Textures' in cfg ? cfg.Textures : (typeof Textures !== 'undefined' ? Textures : null);
    const SkeletonUtilsRef = cfg.SkeletonUtils || (THREERef && THREERef.SkeletonUtils);

    ensureScratchMath(THREERef);

    const tier = resolveTierObj(tierDef);
    const archetype = tier.key || 'classic';
    const isClassic = archetype === 'classic';
    const procRoot = wrapProceduralRoot(rootMesh, THREERef);

    const state = {
      clip: tier.aerial ? 'fly' : 'idle',
      speed: 0,
      timeScale: 1,
      oneShot: null,
      oneShotT: 0,
      lookYaw: 0,
      lookPitch: 0,
      hurtFlash: 0,
      windingUp: false,
    };

    let mixer = null;
    const actions = {};
    let activeAction = null;
    let activeSemantic = state.clip;
    let headBone = null;
    let isZUpHead = false;
    const restResetBones = [];
    const emissiveTargets = [];

    // Preserve/re-parent wisps & halo from procedural makeGloom so shadow aura remains epic
    const uData = (rootMesh && rootMesh.userData) || null;
    const wisps = uData && Array.isArray(uData.wisps) ? uData.wisps : null;
    const halo = uData && uData.halo ? uData.halo : null;
    const procEyeMat = uData && uData.eyeMat ? uData.eyeMat : null;
    const procBody = uData && uData.body ? uData.body : null;
    const haloBaseColor = { r: 1, g: 1, b: 1, opacity: 0.48, captured: false };
    if (halo && halo.material) {
      if (halo.material.color) {
        haloBaseColor.r = halo.material.color.r;
        haloBaseColor.g = halo.material.color.g;
        haloBaseColor.b = halo.material.color.b;
        haloBaseColor.captured = true;
      }
      if (typeof halo.material.opacity === 'number') {
        haloBaseColor.opacity = halo.material.opacity;
      }
    }
    const haloBaseScale = isClassic ? 2.0 : (tier.isMiniBoss ? 3.2 : (tier.tier >= 3 ? 2.6 : 2.15));
    const wispOrbitRadius = isClassic ? 0.82 : Math.max(0.84, (tier.colRadius || 0.65) * 1.28);
    const wispCenterY = tier.yOffset || 0.65;
    const eyeHexBase = tier.eyeColor !== undefined ? tier.eyeColor : 0xff8c10;

    let hasLookTarget = false;
    let lookX = 0;
    let lookY = 0;
    let lookZ = 0;
    const phaseSeed = ((rootMesh && rootMesh.id) || 0) * 1.73;

    function recordEmissiveTarget(mat, isBestiary) {
      if (!mat || !mat.emissive) return;
      emissiveTargets.push({
        mat,
        isBestiary: !!isBestiary,
        baseR: mat.emissive.r,
        baseG: mat.emissive.g,
        baseB: mat.emissive.b,
        baseIntensity: typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : (isBestiary ? 1.65 : 1.4),
      });
    }

    function updateEmissiveAndAura(stepDt, time, isWindup, flashVal, isLunge) {
      const flashNorm = clamp(flashVal / 0.25, 0, 1);

      for (let i = 0; i < emissiveTargets.length; i++) {
        const et = emissiveTargets[i];
        const m = et.mat;
        if (!m || !m.emissive) continue;
        if (flashNorm > 0.001) {
          if (typeof m.emissive.setRGB === 'function') {
            m.emissive.setRGB(1.0, 0.55 + flashNorm * 0.45, 0.15 + flashNorm * 0.78);
          }
          m.emissiveIntensity = et.baseIntensity + flashNorm * 3.2;
        } else if (isWindup) {
          if (typeof m.emissive.setRGB === 'function') {
            m.emissive.setRGB(1.0, 0.12, 0.10);
          }
          m.emissiveIntensity = Math.max(2.4, et.baseIntensity + 1.25);
        } else {
          if (typeof m.emissive.setRGB === 'function') {
            m.emissive.setRGB(et.baseR, et.baseG, et.baseB);
          }
          m.emissiveIntensity = et.baseIntensity;
        }
      }

      // Classic or pre-ready procedural eyeMat
      if (procEyeMat && procEyeMat.emissive && (!controller.ready || isClassic)) {
        if (flashNorm > 0.001) {
          if (typeof procEyeMat.emissive.setRGB === 'function') {
            procEyeMat.emissive.setRGB(1.0, 0.55 + flashNorm * 0.45, 0.1 + flashNorm * 0.9);
          }
          procEyeMat.emissiveIntensity = 1.15 + flashNorm * 3.5;
        } else if (isWindup || (isClassic && isLunge)) {
          if (typeof procEyeMat.emissive.setRGB === 'function') {
            procEyeMat.emissive.setRGB(1.0, 0.12, 0.06);
          }
          procEyeMat.emissiveIntensity = 2.8;
        } else {
          if (typeof procEyeMat.emissive.setHex === 'function') {
            procEyeMat.emissive.setHex(eyeHexBase);
          }
          procEyeMat.emissiveIntensity = isClassic ? 1.15 : 1.45;
        }
      }

      if (procBody && procBody.rotation && (!controller.ready || isClassic)) {
        const spd = state.speed || 0;
        const wantLean = flashNorm > 0.001
          ? -flashNorm * 0.45
          : isWindup
            ? -0.32
            : (isClassic && isLunge)
              ? 0.42
              : (spd > 0.25 ? 0.22 : 0.04);
        procBody.rotation.x += (wantLean - procBody.rotation.x) * Math.min(1, stepDt * 12);
      }

      if (wisps && wisps.length > 0) {
        const t = time || 0;
        const angSpd = isWindup ? 5.5 : 2.2;
        const orbitR = (!controller.ready || isClassic) ? 0.82 : wispOrbitRadius;
        const baseY = (!controller.ready || isClassic) ? 0.62 : wispCenterY;
        for (let wIdx = 0; wIdx < wisps.length; wIdx++) {
          const wisp = wisps[wIdx];
          if (!wisp) continue;
          const wa = t * angSpd + (wIdx / wisps.length) * Math.PI * 2;
          if (wisp.position && typeof wisp.position.set === 'function') {
            wisp.position.set(
              Math.cos(wa) * orbitR,
              baseY + Math.sin(t * 3.6 + wIdx * 2.1) * 0.16,
              Math.sin(wa) * orbitR
            );
          }
          if (wisp.rotation) wisp.rotation.y += stepDt * 3.0;
        }
      }

      if (halo && halo.scale) {
        const t = time || 0;
        const curHaloBase = isClassic ? 2.0 : (!controller.ready ? 2.25 : haloBaseScale);
        const hs = curHaloBase + Math.sin(t * 3.1 + phaseSeed) * 0.14 + flashNorm * 0.65 + (isWindup ? 0.55 : 0);
        halo.scale.set(hs, hs, 1);
        if (halo.material) {
          if (halo.material.color && typeof halo.material.color.setRGB === 'function') {
            if (flashNorm > 0.001) {
              halo.material.color.setRGB(1.0, 0.85, 0.45);
            } else if (isWindup) {
              halo.material.color.setRGB(1.0, 0.16, 0.22);
            } else if (haloBaseColor.captured) {
              halo.material.color.setRGB(haloBaseColor.r, haloBaseColor.g, haloBaseColor.b);
            }
          }
          if (typeof halo.material.opacity === 'number') {
            halo.material.opacity = clamp(haloBaseColor.opacity + flashNorm * 0.30 + (isWindup ? 0.22 : 0), 0.1, 0.95);
          }
        }
      }
    }

    function setActionLoop(act, semantic, forceLoopOnce) {
      if (!act) return;
      if (typeof act.setLoop === 'function' && THREERef) {
        if (forceLoopOnce || semantic === 'death') {
          if (THREERef.LoopOnce !== undefined) act.setLoop(THREERef.LoopOnce, 1);
        } else {
          if (THREERef.LoopRepeat !== undefined) act.setLoop(THREERef.LoopRepeat, Infinity);
        }
      }
      act.clampWhenFinished = !!(forceLoopOnce || semantic === 'death');
    }

    function crossFadeToSemantic(wantSemantic, fadeDur, isOneShot) {
      const nextAct = actions[wantSemantic] || actions.idle;
      if (nextAct && nextAct !== activeAction) {
        nextAct.reset();
        setActionLoop(nextAct, wantSemantic, isOneShot);
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
        setActionLoop(nextAct, wantSemantic, false);
        nextAct.paused = false;
        nextAct.enabled = true;
        if (typeof nextAct.setEffectiveWeight === 'function') nextAct.setEffectiveWeight(1);
        nextAct.play();
      } else if (nextAct && isOneShot) {
        setActionLoop(nextAct, wantSemantic, true);
        nextAct.clampWhenFinished = true;
        nextAct.paused = false;
        nextAct.enabled = true;
        if (wantSemantic === 'death') {
          nextAct.reset();
          if (typeof nextAct.setEffectiveWeight === 'function') nextAct.setEffectiveWeight(1);
          nextAct.play();
        }
      }
      activeSemantic = wantSemantic;
      state.clip = wantSemantic;
    }

    function selectBaseSemantic(s) {
      const m = s.mode;
      if (m && actions[m]) return m;
      if (m === 'idle' || m === 'walk' || m === 'run' || m === 'fly' ||
          m === 'jump' || m === 'attack' || m === 'heavyAttack' ||
          m === 'roll' || m === 'hit' || m === 'death') {
        return m;
      }
      if (s.dead) return 'death';
      const spd = s.speed || 0;
      const ref = s.refSpeed || getRefSpeed(archetype, 'walk');
      if (archetype === 'stinger' || tier.aerial) {
        return 'fly';
      }
      if (s.airborne) {
        return 'jump';
      }
      if (s.isMoving || spd > 0.25) {
        return spd > ref * 1.15 ? 'run' : 'walk';
      }
      return 'idle';
    }

    function triggerOneShot(semanticName, duration) {
      if (!semanticName) return;
      state.oneShot = semanticName;
      state.oneShotT = semanticName === 'death'
        ? 999999
        : (duration !== undefined ? duration : 0.45);

      if (controller.ready && mixer && !isClassic) {
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
      const s = animState || _eDefaultAnimState;
      const spd = s.speed || 0;
      const isWindup = !!s.windingUp;
      const isLunge = !!s.lunging;
      const flashVal = s.hurtFlash || 0;

      state.speed = spd;
      state.hurtFlash = flashVal;
      state.windingUp = isWindup;

      if (isClassic || !controller.ready) {
        updateEmissiveAndAura(stepDt, time, isWindup, flashVal, isLunge);
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
        const isFast = wantSemantic === 'attack' || wantSemantic === 'heavyAttack' ||
          wantSemantic === 'hit' || wantSemantic === 'jump' ||
          wantSemantic === 'roll' || wantSemantic === 'death' ||
          activeSemantic === 'attack' || activeSemantic === 'heavyAttack' ||
          activeSemantic === 'hit' || activeSemantic === 'jump' || activeSemantic === 'roll';
        crossFadeToSemantic(wantSemantic, isFast ? 0.07 : 0.15, !!state.oneShot);
      }

      // 2. Speed-coupled timeScale on locomotion clips
      let ts = 1.0;
      if (activeSemantic === 'walk' || activeSemantic === 'run' || activeSemantic === 'fly') {
        const refSpd = s.refSpeed || getRefSpeed(archetype, activeSemantic);
        ts = spd > 0.05 ? clamp(spd / Math.max(0.25, refSpd), 0.60, 1.75) : 1.0;
      }
      state.timeScale = ts;
      if (activeAction && typeof activeAction.setEffectiveTimeScale === 'function') {
        activeAction.setEffectiveTimeScale(ts);
      }

      // 3. Reset un-keyed post-mixer offset bones before mixer.update
      for (let i = 0; i < restResetBones.length; i++) {
        const rb = restResetBones[i];
        const q = rb.bone.quaternion;
        if (q) {
          if (typeof q.set === 'function') q.set(rb.qx, rb.qy, rb.qz, rb.qw);
          else { q.x = rb.qx; q.y = rb.qy; q.z = rb.qz; q.w = rb.qw; }
        }
      }

      if (mixer) mixer.update(stepDt);

      // 4. Post-mixer micro-life & emissive windup/flash modulation (ZERO GC!)
      let targetYaw = 0;
      let targetPitch = 0;
      if (hasLookTarget && state.oneShot !== 'death' && !s.dead) {
        const dx = lookX - (s.posX || 0);
        const dz = lookZ - (s.posZ || 0);
        const dy = lookY - ((s.posY || 0) + wispCenterY);
        const horiz = Math.hypot(dx, dz);
        const relYaw = wrapAngle(Math.atan2(dx, dz) - (s.facingYaw || 0));
        targetYaw = clamp(relYaw, -0.45, 0.45);
        targetPitch = clamp(Math.atan2(dy, Math.max(0.25, horiz)), -0.26, 0.26);
      }

      const kLook = Math.min(1, stepDt * 7.5);
      state.lookYaw += (targetYaw - state.lookYaw) * kLook;
      state.lookPitch += (targetPitch - state.lookPitch) * kLook;

      if (headBone && headBone.quaternion && _eQYaw && _eQPitch) {
        const yawAxis = isZUpHead ? _eAxisZ : _eAxisY;
        const pitchAngle = isZUpHead ? state.lookPitch : -state.lookPitch;
        _eQYaw.setFromAxisAngle(yawAxis, state.lookYaw);
        _eQPitch.setFromAxisAngle(_eAxisX, pitchAngle);
        headBone.quaternion.multiply(_eQYaw).multiply(_eQPitch);
      }

      updateEmissiveAndAura(stepDt, time, isWindup, flashVal, isLunge);
    }

    const controller = {
      ready: false,
      isClassicProcedural: isClassic,
      tier,
      archetype,
      state,
      triggerOneShot,
      setLookTarget,
      clearLookTarget,
      update,
    };

    if (rootMesh) {
      rootMesh.userData = rootMesh.userData || {};
      rootMesh.userData.enemyRig = controller;
    }

    if (isClassic) {
      controller.ready = true;
      if (procRoot) procRoot.visible = true;
      return controller;
    }

    const LoaderCtor = cfg.GLTFLoader || (THREERef && THREERef.GLTFLoader);
    if (!THREERef || typeof LoaderCtor !== 'function' || !SkeletonUtilsRef || typeof SkeletonUtilsRef.clone !== 'function') {
      return controller;
    }

    function onTemplateReady(template) {
      if (!template || !template.scene) return;
      const clone = SkeletonUtilsRef.clone(template.scene);
      const isBestiary = archetype === 'puglin' || archetype === 'imp';

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

          if (isBestiary) {
            if (Array.isArray(obj.material)) {
              obj.material = obj.material.map((m) => {
                const bm = applyBestiaryPbrMaterial(m, isSkinned, hasMorphs, hasMorphNormals);
                if (bm) recordEmissiveTarget(bm, true);
                return bm;
              });
            } else {
              const bm = applyBestiaryPbrMaterial(obj.material, isSkinned, hasMorphs, hasMorphNormals);
              if (bm) {
                obj.material = bm;
                recordEmissiveTarget(bm, true);
              }
            }
          } else if (Array.isArray(obj.material)) {
            obj.material = obj.material.map((m) => {
              const res = getCachedShadowMaterial(THREERef, TexturesRef, archetype, m, isSkinned, hasMorphs, hasMorphNormals);
              if (res.isEye) recordEmissiveTarget(res.mat, false);
              return res.mat;
            });
          } else {
            const res = getCachedShadowMaterial(THREERef, TexturesRef, archetype, obj.material, isSkinned, hasMorphs, hasMorphNormals);
            obj.material = res.mat;
            if (res.isEye) recordEmissiveTarget(res.mat, false);
          }
        }
      });

      attachEnemyAccents(archetype, clone, bones, ModelsRef);

      headBone = findBone(bones, 'Head');
      isZUpHead = archetype === 'weaver' || archetype === 'behemoth';
      restResetBones.length = 0;
      if (headBone && headBone.quaternion) {
        restResetBones.push({
          bone: headBone,
          qx: headBone.quaternion.x,
          qy: headBone.quaternion.y,
          qz: headBone.quaternion.z,
          qw: headBone.quaternion.w,
        });
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
        const initSem = (archetype === 'stinger' || tier.aerial) ? 'fly' : 'idle';
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
        // Re-parent procedural wisps & halo onto rootMesh so shadow aura stays epic around GLB rig
        if (wisps) {
          for (let wi = 0; wi < wisps.length; wi++) {
            const w = wisps[wi];
            if (w && typeof rootMesh.add === 'function') {
              rootMesh.add(w);
              w.visible = true;
            }
          }
        }
        if (halo && typeof rootMesh.add === 'function') {
          rootMesh.add(halo);
          halo.visible = true;
          if (halo.position && typeof halo.position.set === 'function') {
            halo.position.set(0, wispCenterY, 0);
          }
        }
      }
      controller.ready = true;
    }

    function onTemplateError(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[Enemies] Procedural fallback for ${archetype}:`, err && err.message ? err.message : err);
      }
    }

    preloadArchetype(archetype, onTemplateReady, onTemplateError, cfg);
    return controller;
  }

  // ---------- 3. EnemyPhysics & Context Helpers ----------

  const ENEMY_GRAVITY = 22.0;
  const ENEMY_KNOCK_DECAY_K = 8.5;
  const ENEMY_SLOPE_COS = Math.cos((44 * Math.PI) / 180);
  const ENEMY_GROUND_STEER_K = 16.0;
  const ENEMY_AIR_STEER_K = 8.5;
  const ENEMY_AQUA_STEER_K = 10.0;
  const ENEMY_MAX_STEP_H = 1.45;
  const UNDERWATER_TETHER_R = 24.0;
  const UNDERWATER_SPAWNS = [
    { x: -16, z: 84, dir: 0.4 },
    { x: -11, z: 93, dir: -2.1 },
  ];

  function defaultHeightZero() {
    return 0;
  }

  function getHeightFn(c) {
    if (c && typeof c.heightAt === 'function') return c.heightAt;
    if (typeof heightAt === 'function') return heightAt;
    return defaultHeightZero;
  }

  function getPhysRef(c) {
    if (c && c.Physics) return c.Physics;
    if (typeof Physics !== 'undefined' && Physics) return Physics;
    return null;
  }

  function getModelsRef(c) {
    if (c && c.Models) return c.Models;
    if (typeof Models !== 'undefined' && Models) return Models;
    return null;
  }

  function getSoundRef(c) {
    if (c && c.Sound) return c.Sound;
    if (typeof Sound !== 'undefined' && Sound) return Sound;
    return null;
  }

  function getAnimalsRef(c) {
    if (c && c.Animals) return c.Animals;
    if (typeof Animals !== 'undefined' && Animals) return Animals;
    return null;
  }

  function getSceneRef(c) {
    if (c && c.scene) return c.scene;
    if (typeof scene !== 'undefined' && scene) return scene;
    return null;
  }

  function getPlayerState(c) {
    if (c && c.P) return c.P;
    if (typeof P !== 'undefined' && P) return P;
    return null;
  }

  function getFollowers(c) {
    if (c && Array.isArray(c.followers)) return c.followers;
    if (typeof followers !== 'undefined' && Array.isArray(followers)) return followers;
    return null;
  }

  function getPickups(c) {
    if (c && Array.isArray(c.pickups)) return c.pickups;
    if (typeof pickups !== 'undefined' && Array.isArray(pickups)) return pickups;
    return null;
  }

  function getHome(c) {
    if (c && typeof c.getSanctuary === 'function') return c.getSanctuary();
    if (c && c.home) return c.home;
    if (c && c.sanctuary) return c.sanctuary;
    if (typeof home !== 'undefined' && home) return home;
    if (typeof sanctuary !== 'undefined' && sanctuary) return sanctuary;
    return null;
  }

  function getLitCount(c) {
    if (c && typeof c.getLit === 'function') return c.getLit();
    if (c && typeof c.lit === 'number') return c.lit;
    if (typeof lit === 'number') return lit;
    return 0;
  }

  function getWaterY(c) {
    if (c && typeof c.WATER_Y === 'number') return c.WATER_Y;
    if (typeof WATER_Y === 'number') return WATER_Y;
    return 0;
  }

  function getRng(c) {
    return c && typeof c.rng === 'function' ? c.rng : Math.random;
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
    if ((!c || typeof c.heightAt !== 'function') && typeof terrainNormalAt === 'function') {
      const res = terrainNormalAt(x, z, out);
      if (res && res !== out) {
        out.x = res.x;
        out.y = res.y;
        out.z = res.z;
      }
      return out;
    }
    const eps = 0.2;
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

  function resolveEnemyColliders(nx, nz, colRadius, footY, c, PhysicsRef) {
    _eColBuf.length = 0;
    if (c && typeof c.getNearbyColliders === 'function') {
      c.getNearbyColliders(nx, nz, colRadius + 0.65, _eColBuf);
    } else if (typeof getNearbyColliders === 'function') {
      getNearbyColliders(nx, nz, colRadius + 0.65, _eColBuf);
    }
    _eColOut.x = nx;
    _eColOut.z = nz;
    _eColOut.hit = false;
    if (PhysicsRef && typeof PhysicsRef.resolveColliders === 'function') {
      PhysicsRef.resolveColliders(nx, nz, colRadius, _eColBuf, _eColOut, footY);
    }
  }

  function ensureEnemyPhys(g) {
    const tier = (g && g.tier) || TIERS.classic;
    if (g && g.mesh && g.mesh.rotation && typeof g.mesh.rotation.order === 'string' && g.mesh.rotation.order !== 'YXZ') {
      g.mesh.rotation.order = 'YXZ';
    }
    if (g && !g.phys) {
      g.phys = {
        vx: 0,
        vy: g.ky || 0,
        vz: 0,
        onGround: !tier.aerial,
        airLift: tier.aerial ? (tier.hoverAlt || 2.2) : 0,
        smoothSpd: 0,
        bankRoll: 0,
        jumpCd: 0,
        rollCd: 0,
      };
    }
    return g.phys;
  }

  function createGloomState(mesh, tierDef, x, y, z, opts) {
    const tier = resolveTierObj(tierDef);
    const o = opts || {};
    if (mesh && mesh.position && typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
      if (typeof mesh.position.set === 'function') {
        mesh.position.set(x, y, z);
      } else {
        mesh.position.x = x;
        mesh.position.y = y;
        mesh.position.z = z;
      }
    }
    if (mesh && mesh.rotation && typeof mesh.rotation.order === 'string') {
      mesh.rotation.order = 'YXZ';
    }

    const baseHp = tier.baseHp !== undefined ? tier.baseHp : 3;
    const followerBonus = tier.key === 'behemoth'
      ? Math.min(4, Math.max(0, (o.followersCount || 0) - 5))
      : 0;
    const maxHp = baseHp + followerBonus;
    const posX = typeof x === 'number' ? x : (mesh && mesh.position ? mesh.position.x : 0);
    const posZ = typeof z === 'number' ? z : (mesh && mesh.position ? mesh.position.z : 0);
    const yOff = tier.yOffset !== undefined ? tier.yOffset : 0.65;

    const g = {
      mesh,
      tier,
      tierKey: tier.key,
      archetype: tier.key,
      name: tier.name,
      dir: typeof o.dir === 'number' ? o.dir : Math.random() * Math.PI * 2,
      rollDir: 0,
      turnT: typeof o.turnT === 'number' ? o.turnT : 2 + Math.random() * 3,
      hp: maxHp,
      maxHp,
      state: o.state || 'wander',
      stateT: 0,
      fleeT: 0,
      stolen: false,
      flash: 0,
      hopT: typeof o.hopT === 'number' ? o.hopT : Math.random() * 9,
      kx: 0,
      ky: 0,
      kz: 0,
      vx: 0,
      vz: 0,
      knockResist: tier.knockResist !== undefined ? tier.knockResist : 1.0,
      dmgPlayer: tier.dmgPlayer !== undefined ? tier.dmgPlayer : 2,
      dmgAlly: tier.dmgAlly !== undefined ? tier.dmgAlly : 1,
      aoeRadius: tier.aoeRadius !== undefined ? tier.aoeRadius : 0,
      underwater: !!(o.underwater !== undefined ? o.underwater : tier.underwater),
      homeX: o.homeX !== undefined ? o.homeX : posX,
      homeZ: o.homeZ !== undefined ? o.homeZ : posZ,
      announced: false,
      attackDidHit: false,
      dead: false,
      targetAlly: null,
      lockCand: null,
      lookCand: null,
      phys: {
        vx: 0,
        vy: 0,
        vz: 0,
        onGround: !tier.aerial,
        airLift: tier.aerial ? (tier.hoverAlt || 2.2) : 0,
        smoothSpd: 0,
        bankRoll: 0,
        jumpCd: 0,
        rollCd: 0,
      },
    };
    g.lockCand = { kind: 'gloom', ref: g, mesh, yOffset: yOff };
    g.lookCand = { mesh, maxDist: 14, yOffset: yOff };
    return g;
  }

  function initTelegraphPool(sceneRef, ModelsRef, count) {
    _eTelegraphPool.length = 0;
    const n = typeof count === 'number' && count > 0 ? count : 4;
    const M = ModelsRef || (typeof Models !== 'undefined' ? Models : null);
    const S = sceneRef || (typeof scene !== 'undefined' ? scene : null);
    if (!M || typeof M.makeTelegraphRing !== 'function') return _eTelegraphPool;

    for (let i = 0; i < n; i++) {
      const ring = M.makeTelegraphRing();
      if (!ring) continue;
      ring.visible = false;
      if (S && typeof S.add === 'function') S.add(ring);
      _eTelegraphPool.push(ring);
    }
    return _eTelegraphPool;
  }

  function stepEnemyPhysics(g, stepDt, nowTime, desVx, desVz, desYaw, turnRate, targetY, c) {
    const m = g.mesh;
    if (!m || !m.position) return;

    const pos = m.position;
    const rot = m.rotation || null;
    const phys = ensureEnemyPhys(g);
    const tier = g.tier || TIERS.classic;
    const isClassic = tier.key === 'classic';
    const isAerial = !!tier.aerial;
    const isUnderwater = !!(g.underwater || tier.underwater);
    const hFn = getHeightFn(c);
    const PhysicsRef = getPhysRef(c);
    const waterY = getWaterY(c);
    const colRadius = tier.colRadius || 0.65;

    phys.jumpCd = Math.max(0, (phys.jumpCd || 0) - stepDt);
    phys.rollCd = Math.max(0, (phys.rollCd || 0) - stepDt);

    // Sync any external impulse written to g.ky (e.g. plunge shockwave)
    if (g.ky > phys.vy + 0.05) {
      phys.vy = g.ky;
      if (!isAerial && !isUnderwater) phys.onGround = false;
    }

    const prevX = pos.x;
    const prevY = pos.y;
    const prevZ = pos.z;
    const prevYaw = rot ? rot.y : g.dir;

    const steerK = (g.state === 'lunge' || g.state === 'roll')
      ? 28.0
      : g.state === 'windup'
        ? 22.0
        : isUnderwater
          ? ENEMY_AQUA_STEER_K
          : isAerial
            ? ENEMY_AIR_STEER_K
            : phys.onGround
              ? ENEMY_GROUND_STEER_K
              : ENEMY_AIR_STEER_K;
    const steerAlpha = 1 - Math.exp(-steerK * stepDt);
    phys.vx += ((desVx || 0) - phys.vx) * steerAlpha;
    phys.vz += ((desVz || 0) - phys.vz) * steerAlpha;

    const kx = g.kx || 0;
    const kz = g.kz || 0;
    const totalVx = phys.vx + kx;
    const totalVz = phys.vz + kz;
    g.vx = totalVx;
    g.vz = totalVz;

    if (kx || kz) {
      const kDecay = Math.exp(-ENEMY_KNOCK_DECAY_K * stepDt);
      g.kx = Math.abs(kx * kDecay) < 0.02 ? 0 : kx * kDecay;
      g.kz = Math.abs(kz * kDecay) < 0.02 ? 0 : kz * kDecay;
    }

    let dx = totalVx * stepDt;
    let dz = totalVz * stepDt;
    let candX = prevX + dx;
    let candZ = prevZ + dz;

    if (isUnderwater) {
      const maxUnderY = waterY - 1.2;
      const curH = hFn(prevX, prevZ);
      const candH = hFn(candX, candZ);
      if (candH > maxUnderY && candH > curH) {
        candX = prevX;
        candZ = prevZ;
        phys.vx *= -0.35;
        phys.vz *= -0.35;
        if (g.state === 'wander') g.dir += 2.2;
      }

      const hx = g.homeX !== undefined ? g.homeX : prevX;
      const hz = g.homeZ !== undefined ? g.homeZ : prevZ;
      let tdx = candX - hx;
      let tdz = candZ - hz;
      const tDist = Math.hypot(tdx, tdz);
      if (tDist > UNDERWATER_TETHER_R) {
        const invT = UNDERWATER_TETHER_R / tDist;
        candX = hx + tdx * invT;
        candZ = hz + tdz * invT;
        const outDot = (phys.vx * tdx + phys.vz * tdz) / tDist;
        if (outDot > 0) {
          phys.vx -= (outDot * tdx) / tDist;
          phys.vz -= (outDot * tdz) / tDist;
        }
        if (g.state === 'wander') g.dir = Math.atan2(-tdx, -tdz);
      }

      resolveEnemyColliders(candX, candZ, colRadius, prevY, c, PhysicsRef);
      candX = _eColOut.x;
      candZ = _eColOut.z;

      tdx = candX - hx;
      tdz = candZ - hz;
      const postDist = Math.hypot(tdx, tdz);
      if (postDist > UNDERWATER_TETHER_R) {
        const invP = UNDERWATER_TETHER_R / postDist;
        candX = hx + tdx * invP;
        candZ = hz + tdz * invP;
      }

      const groundH = hFn(candX, candZ);
      const floorBound = Math.min(groundH, maxUnderY);
      if (phys.vy > 0 || prevY > floorBound + 0.02) {
        phys.vy -= ENEMY_GRAVITY * 0.55 * stepDt;
        let ny = prevY + phys.vy * stepDt;
        if (ny > maxUnderY) {
          ny = maxUnderY;
          if (phys.vy > 0) phys.vy = 0;
        }
        if (ny <= floorBound) {
          ny = floorBound;
          phys.vy = 0;
          phys.onGround = true;
        } else {
          phys.onGround = false;
        }
        pos.y = ny;
      } else {
        pos.y = floorBound;
        phys.vy = 0;
        phys.onGround = true;
      }
      if (pos.y > maxUnderY) {
        pos.y = maxUnderY;
        if (phys.vy > 0) phys.vy = 0;
      }
      g.ky = phys.vy;
      phys.airLift = 0;
      pos.x = candX;
      pos.z = candZ;
    } else if (isAerial) {
      resolveEnemyColliders(candX, candZ, colRadius, prevY, c, PhysicsRef);
      candX = _eColOut.x;
      candZ = _eColOut.z;

      const floorY = Math.max(hFn(candX, candZ), waterY);
      if (g.state === 'lunge') {
        const diveTargetY = Math.max(floorY + 0.35, (typeof targetY === 'number' ? targetY : floorY) + 0.55);
        phys.vy += (diveTargetY - prevY) * 18.0 * stepDt;
        phys.vy *= Math.exp(-4.5 * stepDt);
      } else {
        const baseAlt = tier.hoverAlt || 2.2;
        const hoverOffset = g.state === 'windup'
          ? baseAlt + 0.45
          : baseAlt + Math.sin(nowTime * 4.5 + g.hopT) * 0.14;
        const wantY = floorY + hoverOffset;
        phys.vy += (wantY - prevY) * 16.0 * stepDt;
        phys.vy *= Math.exp(-5.4 * stepDt);
      }

      let ny = prevY + phys.vy * stepDt;
      if (ny < floorY + 0.35) {
        ny = floorY + 0.35;
        if (phys.vy < 0) phys.vy = 0;
      }
      pos.x = candX;
      pos.y = ny;
      pos.z = candZ;
      phys.onGround = false;
      phys.airLift = Math.max(0, ny - floorY);
      g.ky = phys.vy;
    } else {
      // Land EnemyPhysics with water shoreline guard & >= 44 deg steep cliff discipline
      const curH = hFn(prevX, prevZ);
      let nextH = hFn(candX, candZ);
      const tooDeep = curH > waterY + 0.25
        ? (nextH < waterY - 0.15 && nextH < curH)
        : (nextH < waterY - 0.35 && nextH < curH);
      if (tooDeep) {
        candX = prevX;
        candZ = prevZ;
        dx = 0;
        dz = 0;
        phys.vx *= -0.35;
        phys.vz *= -0.35;
        g.kx *= -0.35;
        g.kz *= -0.35;
        if (g.state === 'wander') g.dir += 2.2;
      }

      const moveLen = Math.hypot(dx, dz);
      const dirX = moveLen > 1e-6 ? dx / moveLen : 0;
      const dirZ = moveLen > 1e-6 ? dz / moveLen : 0;
      const probeDist = Math.max(0.55, moveLen);
      const probeH = moveLen > 1e-6 ? hFn(prevX + dirX * probeDist, prevZ + dirZ * probeDist) : curH;
      const movingUphill = nextH > curH + 1e-4 || probeH > curH + 0.08;

      if (movingUphill) {
        sampleTerrainNormal(prevX, prevZ, c, hFn, _eCurNorm);
        sampleTerrainNormal(candX, candZ, c, hFn, _eNorm);

        if (phys.onGround && _eCurNorm.y <= ENEMY_SLOPE_COS) {
          const hLenSq = _eCurNorm.x * _eCurNorm.x + _eCurNorm.z * _eCurNorm.z;
          const dotCur = dx * _eCurNorm.x + dz * _eCurNorm.z;
          if (hLenSq > 1e-8 && dotCur < 0) {
            const inv = dotCur / hLenSq;
            dx -= inv * _eCurNorm.x;
            dz -= inv * _eCurNorm.z;
            const vDot = phys.vx * _eCurNorm.x + phys.vz * _eCurNorm.z;
            if (vDot < 0) {
              phys.vx -= (vDot / hLenSq) * _eCurNorm.x;
              phys.vz -= (vDot / hLenSq) * _eCurNorm.z;
            }
          }
        }

        if (_eNorm.y <= ENEMY_SLOPE_COS) {
          const hLenSq = _eNorm.x * _eNorm.x + _eNorm.z * _eNorm.z;
          const dotNext = dx * _eNorm.x + dz * _eNorm.z;
          const blockedH = phys.onGround
            ? (nextH > curH + 0.05 || (dotNext < 0 && movingUphill))
            : (nextH > prevY + 0.65 && dotNext < 0);
          if (hLenSq > 1e-8 && dotNext < 0 && blockedH) {
            const inv = dotNext / hLenSq;
            dx -= inv * _eNorm.x;
            dz -= inv * _eNorm.z;
            const vDot = phys.vx * _eNorm.x + phys.vz * _eNorm.z;
            if (vDot < 0) {
              phys.vx -= (vDot / hLenSq) * _eNorm.x;
              phys.vz -= (vDot / hLenSq) * _eNorm.z;
            }
          }
        }

        candX = prevX + dx;
        candZ = prevZ + dz;
        nextH = hFn(candX, candZ);
        if ((phys.onGround && nextH - prevY > ENEMY_MAX_STEP_H) || (!phys.onGround && nextH - prevY > 0.75)) {
          candX = prevX;
          candZ = prevZ;
          dx = 0;
          dz = 0;
          phys.vx *= 0.2;
          phys.vz *= 0.2;
          g.kx *= -0.35;
          g.kz *= -0.35;
          if (g.state === 'wander') g.dir += 2.2;
        }
      }

      resolveEnemyColliders(candX, candZ, colRadius, prevY, c, PhysicsRef);
      candX = _eColOut.x;
      candZ = _eColOut.z;
      if (_eColOut.hit && g.state === 'wander') {
        g.dir += 1.8 * stepDt;
      }
      if (phys.onGround && hFn(candX, candZ) - prevY > ENEMY_MAX_STEP_H) {
        candX = prevX;
        candZ = prevZ;
      }

      const groundH = hFn(candX, candZ);
      const supY = (PhysicsRef && typeof PhysicsRef.getSupportHeight === 'function')
        ? PhysicsRef.getSupportHeight(candX, candZ, prevY, groundH, _eColBuf, phys.vy)
        : groundH;

      const windingUp = g.state === 'windup';
      g.hopT += stepDt * (g.state === 'flee' ? 11 : g.state === 'lunge' ? 14 : 7);
      const hopArc = (isClassic && !windingUp) ? Math.max(0, Math.sin(g.hopT)) * 0.25 : 0;
      const floorTarget = supY + hopArc;
      const dropDelta = prevY - floorTarget;
      const canSnapDownhill = phys.onGround && phys.vy <= 0 && (g.ky || 0) <= 0 && dropDelta >= 0 && dropDelta <= 0.28;

      if (canSnapDownhill) {
        pos.y = floorTarget;
        phys.vy = 0;
        phys.onGround = true;
      } else if (phys.vy > 0 || prevY > floorTarget + 0.02) {
        phys.vy -= ENEMY_GRAVITY * stepDt;
        let ny = prevY + phys.vy * stepDt;
        if (ny <= floorTarget) {
          ny = floorTarget;
          phys.vy = 0;
          phys.onGround = true;
        } else {
          phys.onGround = false;
        }
        pos.y = ny;
      } else {
        pos.y = floorTarget;
        phys.vy = 0;
        phys.onGround = true;
      }

      g.ky = phys.vy;
      phys.airLift = Math.max(0, pos.y - supY);
      pos.x = candX;
      pos.z = candZ;
    }

    const movedHoriz = Math.hypot(pos.x - prevX, pos.z - prevZ);
    const instSpd = movedHoriz / Math.max(0.001, stepDt);
    phys.smoothSpd += (instSpd - phys.smoothSpd) * Math.min(1, stepDt * 12);

    if (PhysicsRef && typeof PhysicsRef.turnToward === 'function') {
      PhysicsRef.turnToward(m, desYaw, stepDt, turnRate);
    } else if (rot) {
      rot.y += wrapAngle(desYaw - rot.y) * Math.min(1, stepDt * turnRate);
    }

    const newYaw = rot ? rot.y : desYaw;
    const yawRate = wrapAngle(newYaw - prevYaw) / Math.max(0.001, stepDt);
    const wantBank = isClassic ? 0 : clamp(-yawRate * phys.smoothSpd * 0.032, -0.26, 0.26);
    phys.bankRoll += (wantBank - phys.bankRoll) * Math.min(1, stepDt * 9);

    if (rot && !isClassic) {
      let wantPitch = 0;
      let wantRoll = phys.bankRoll;
      if (isAerial) {
        wantPitch = clamp(-phys.vy * 0.055, -0.45, 0.45);
      } else if (phys.onGround && !isUnderwater) {
        sampleTerrainNormal(pos.x, pos.z, c, hFn, _eNorm);
        const fwdX = Math.sin(newYaw);
        const fwdZ = Math.cos(newYaw);
        const rightX = Math.cos(newYaw);
        const rightZ = -Math.sin(newYaw);
        const fwdDot = clamp(_eNorm.x * fwdX + _eNorm.z * fwdZ, -0.42, 0.42);
        const rightDot = clamp(_eNorm.x * rightX + _eNorm.z * rightZ, -0.34, 0.34);
        wantPitch = Math.asin(fwdDot);
        wantRoll = -Math.asin(rightDot) + phys.bankRoll;
      } else {
        wantPitch = clamp(-phys.vy * 0.03, -0.28, 0.28);
      }
      const tiltAlpha = Math.min(1, stepDt * 8.5);
      rot.x += (wantPitch - rot.x) * tiltAlpha;
      rot.z += (wantRoll - rot.z) * tiltAlpha;
    }
  }

  // ---------- 4. EnemyAI (Combat, Poise, Telegraph Rings & Underwater Stalkers) ----------

  function onGloomHit(g, index, boltDir, dmg, fromMelee, heavy, ctx) {
    if (!g || g.dead || g.hp <= 0) return false;

    const c = ctx || _eDefaultCtx;
    const PRef = getPlayerState(c);
    const followersRef = getFollowers(c);
    const gloomsRef = (c && Array.isArray(c.glooms)) ? c.glooms : (typeof glooms !== 'undefined' && Array.isArray(glooms) ? glooms : null);
    const pickupsRef = getPickups(c);
    const sceneRef = getSceneRef(c);
    const PhysicsRef = getPhysRef(c);
    const ModelsRef = getModelsRef(c);
    const SoundRef = getSoundRef(c);
    const AnimalsRef = getAnimalsRef(c);
    const hFn = getHeightFn(c);
    const randFn = getRng(c);

    const tier = g.tier || TIERS.classic;
    const phys = ensureEnemyPhys(g);
    const rig = g.mesh && g.mesh.userData ? g.mesh.userData.enemyRig : null;
    const dmgAmt = typeof dmg === 'number' ? dmg : 1;
    const isMelee = !!fromMelee;
    const isHeavy = !!heavy;

    g.hp -= dmgAmt;
    g.flash = isHeavy ? 0.34 : 0.25;

    // Poise & windup interruption
    const hasHeavyPoise = !!tier.poiseHeavyOnly;
    const breaksPoise = hasHeavyPoise
      ? (isHeavy || (isMelee && dmgAmt >= 2))
      : (isHeavy || isMelee);
    if (g.state === 'windup' && breaksPoise) {
      g.state = 'recover';
      g.stateT = 0.35;
    }

    const p = g.mesh.position;
    let kx = 0;
    let kz = 0;
    if (boltDir) {
      const hl = Math.hypot(boltDir.x || 0, boltDir.z || 0);
      if (hl > 0.05) {
        kx = boltDir.x / hl;
        kz = boltDir.z / hl;
      }
    }
    if (kx === 0 && kz === 0 && PRef) {
      const dx = p.x - (PRef.x || 0);
      const dz = p.z - (PRef.z || 0);
      const dl = Math.hypot(dx, dz) || 1;
      kx = dx / dl;
      kz = dz / dl;
    }

    const kr = g.knockResist !== undefined ? g.knockResist : (tier.knockResist !== undefined ? tier.knockResist : 1.0);
    const knockForce = (isHeavy ? 17.0 : isMelee ? 13.5 : 11.5) * kr;
    g.kx = (g.kx || 0) + kx * knockForce;
    g.kz = (g.kz || 0) + kz * knockForce;
    const rawKy = isHeavy ? 6.2 : 4.4;
    const scaledKy = rawKy * kr;
    g.ky = Math.max(g.ky || 0, scaledKy);
    if (g.ky > phys.vy) phys.vy = g.ky;
    if (g.ky > 0.1 && !tier.aerial && !g.underwater) phys.onGround = false;

    if (typeof c.burst === 'function') {
      c.burst(p.x, p.y + 0.65, p.z, 0xffd93b, isHeavy ? 11 : 6);
      c.burst(p.x, p.y + 0.65, p.z, 0x8a5cd8, isHeavy ? 9 : 5);
    }

    if (g.hp > 0) {
      if (!isMelee && SoundRef && typeof SoundRef.hitImpact === 'function') {
        SoundRef.hitImpact(false);
      }

      // Evasive lateral dodge-roll counter for Cinder Imp & Dread Knight against ranged Star Bolts
      if (!isMelee && tier.canRoll && g.state !== 'windup' && g.state !== 'roll' && phys.rollCd <= 0) {
        g.state = 'roll';
        g.stateT = 0.42;
        phys.rollCd = 3.2;
        const sign = phys._rollSign || 1;
        phys._rollSign = -sign;
        if (kx !== 0 || kz !== 0) {
          g.rollDir = Math.atan2(-kz * sign, kx * sign);
        } else {
          g.rollDir = (g.dir || 0) + Math.PI * 0.5 * sign;
        }
        g.dir = g.rollDir;
        if (rig && typeof rig.triggerOneShot === 'function') {
          rig.triggerOneShot('roll', 0.42);
        }
      } else if (rig && typeof rig.triggerOneShot === 'function' && g.state !== 'roll' && !(hasHeavyPoise && g.state === 'windup')) {
        rig.triggerOneShot('hit', 0.32);
      }
      return true;
    }

    // Death burst, audio & scaled rewards
    g.dead = true;
    g.state = 'death';
    if (rig && typeof rig.triggerOneShot === 'function') {
      rig.triggerOneShot('death');
    }
    if (typeof c.burst === 'function') {
      c.burst(p.x, p.y + 0.6, p.z, 0x6a5a8a, 14);
      c.burst(p.x, p.y + 0.8, p.z, 0xffd93b, 14);
    }
    if (SoundRef && typeof SoundRef.poof === 'function') {
      SoundRef.poof();
    }

    const baseDrops = tier.starDrops !== undefined ? tier.starDrops : 2;
    const drops = baseDrops + (g.stolen ? 1 : 0);
    if (ModelsRef && typeof ModelsRef.makeStarPickup === 'function' && pickupsRef) {
      for (let k = 0; k < drops; k++) {
        const mesh = ModelsRef.makeStarPickup();
        const ang = (k / drops) * Math.PI * 2 + (randFn() - 0.5) * 0.9;
        const spd = 2.6 + randFn() * 1.8;
        mesh.position.set(p.x, p.y + 0.95, p.z);
        mesh.userData = mesh.userData || {};
        mesh.userData.kind = 'star';
        mesh.userData.bouncing = true;
        mesh.userData.bounces = 0;
        mesh.userData.vx = Math.cos(ang) * spd;
        mesh.userData.vy = 5.5 + randFn() * 2.0;
        mesh.userData.vz = Math.sin(ang) * spd;
        mesh.userData.baseY = hFn(p.x, p.z) + 0.9;
        mesh.userData.age = 0;
        if (sceneRef && typeof sceneRef.add === 'function') sceneRef.add(mesh);
        pickupsRef.push(mesh);
      }
    }

    const baseHeartChance = tier.heartChance !== undefined ? tier.heartChance : 0.45;
    const hurtBoosted = (PRef && PRef.hp < PRef.maxHp) ? Math.min(1.0, baseHeartChance + 0.30) : baseHeartChance;
    const heartCount = tier.heartDrops || 1;
    if (typeof c.spawnHeartDrop === 'function') {
      for (let hi = 0; hi < heartCount; hi++) {
        if (randFn() < hurtBoosted) {
          const ox = heartCount > 1 ? (hi === 0 ? -0.55 : 0.55) : 0;
          c.spawnHeartDrop(p.x + ox, p.y, p.z);
        }
      }
    }

    if (!g.underwater && !tier.underwater && followersRef && followersRef.length < 6 &&
        typeof c.addFollower === 'function' && randFn() < 0.18) {
      c.addFollower(p.x, p.y, p.z, 'A gloom turned good! It joined your defenders!');
    }

    if (tier.isMiniBoss || tier.key === 'behemoth') {
      if (AnimalsRef && typeof AnimalsRef.celebrate === 'function' && followersRef) {
        AnimalsRef.celebrate(followersRef, c);
      }
      if (typeof c.toast === 'function') {
        c.toast('The Eclipse Behemoth has been vanquished!', 3600);
      }
    }

    if (typeof c.questEvent === 'function') c.questEvent('bop');
    if (sceneRef && typeof sceneRef.remove === 'function') sceneRef.remove(g.mesh);

    if (gloomsRef) {
      let removeIdx = typeof index === 'number' ? index : -1;
      if (removeIdx < 0 || removeIdx >= gloomsRef.length || gloomsRef[removeIdx] !== g) {
        removeIdx = gloomsRef.indexOf(g);
      }
      if (removeIdx >= 0) gloomsRef.splice(removeIdx, 1);
    }

    if (PhysicsRef && typeof PhysicsRef.validateLockTarget === 'function') {
      PhysicsRef.validateLockTarget();
    }
    return true;
  }

  function applyEnemyAoEStrike(g, tier, m, isFrontArc, aoeRad, PRef, followersRef, c) {
    const pos = m.position;
    const fwdX = Math.sin(g.dir);
    const fwdZ = Math.cos(g.dir);
    const dotMin = isFrontArc ? 0.15 : -0.25;
    let didHit = false;

    if (PRef && !PRef.dead && typeof c.damagePlayer === 'function') {
      const dxP = PRef.x - pos.x;
      const dzP = PRef.z - pos.z;
      const dP = Math.hypot(dxP, dzP);
      if (dP <= aoeRad && Math.abs((PRef.y || 0) - pos.y) < 3.0) {
        const dotP = dP > 0.05 ? (dxP * fwdX + dzP * fwdZ) / dP : 1;
        if (!isFrontArc || dP < 0.85 || dotP >= dotMin) {
          if ((PRef.invulnT || 0) <= 0 && (PRef.hurtInvulnT || 0) <= 0) {
            const safeD = Math.max(0.15, dP);
            const kSpd = tier.key === 'knight' ? 9.5 : 8.5;
            c.damagePlayer(g.dmgPlayer || tier.dmgPlayer || 2, 'gloom', (dxP / safeD) * kSpd, (dzP / safeD) * kSpd);
            didHit = true;
          }
        }
      }
    }

    if (followersRef && typeof c.damageCompanion === 'function') {
      for (let fIdx = followersRef.length - 1; fIdx >= 0; fIdx--) {
        const ally = followersRef[fIdx];
        if (!ally || !ally.mesh || !ally.mesh.position) continue;
        const ap = ally.mesh.position;
        const dxA = ap.x - pos.x;
        const dzA = ap.z - pos.z;
        const dA = Math.hypot(dxA, dzA);
        if (dA <= aoeRad && Math.abs(ap.y - pos.y) < 3.0) {
          const dotA = dA > 0.05 ? (dxA * fwdX + dzA * fwdZ) / dA : 1;
          if (!isFrontArc || dA < 1.25 || dotA >= dotMin) {
            const safeD = Math.max(0.15, dA);
            const kSpd = tier.key === 'knight' ? 8.5 : 7.5;
            c.damageCompanion(ally, g.dmgAlly || tier.dmgAlly || 1, (dxA / safeD) * kSpd, (dzA / safeD) * kSpd, g);
            didHit = true;
          }
        }
      }
    }

    if (didHit && typeof c.burst === 'function') {
      c.burst(pos.x + fwdX * 1.2, pos.y + 1.0, pos.z + fwdZ * 1.2, tier.eyeColor || 0xff2848, 10);
    }
    return didHit;
  }

  function triggerBehemothShockwave(g, tier, m, PRef, followersRef, hFn, PhysicsRef, SoundRef, c) {
    const pos = m.position;
    const rad = g.aoeRadius || tier.aoeRadius || 4.8;
    const pulseSpd = 11.0;

    if (PRef && !PRef.dead && typeof c.damagePlayer === 'function') {
      const dxP = PRef.x - pos.x;
      const dzP = PRef.z - pos.z;
      const dP = Math.hypot(dxP, dzP);
      if (dP <= rad && Math.abs((PRef.y || 0) - pos.y) < 3.0 && (PRef.invulnT || 0) <= 0 && (PRef.hurtInvulnT || 0) <= 0) {
        const safeD = Math.max(0.15, dP);
        c.damagePlayer(g.dmgPlayer || tier.dmgPlayer || 3, 'gloom', (dxP / safeD) * pulseSpd, (dzP / safeD) * pulseSpd);
      }
    }

    if (followersRef && typeof c.damageCompanion === 'function') {
      for (let fIdx = followersRef.length - 1; fIdx >= 0; fIdx--) {
        const ally = followersRef[fIdx];
        if (!ally || !ally.mesh || !ally.mesh.position) continue;
        const ap = ally.mesh.position;
        // High-hovering aerial companions naturally soar above ground-level shockwaves
        if (ally.stats && ally.stats.role === 'aerial' && ap.y - pos.y > 1.35) continue;
        const dxA = ap.x - pos.x;
        const dzA = ap.z - pos.z;
        const dA = Math.hypot(dxA, dzA);
        if (dA <= rad && Math.abs(ap.y - pos.y) < 3.0) {
          const safeD = Math.max(0.15, dA);
          c.damageCompanion(ally, g.dmgAlly || tier.dmgAlly || 2, (dxA / safeD) * pulseSpd, (dzA / safeD) * pulseSpd, g);
        }
      }
    }

    const groundH = hFn(pos.x, pos.z);
    if (typeof c.triggerShockwaveVfx === 'function') {
      c.triggerShockwaveVfx(pos.x, groundH, pos.z, rad, 0xff2448);
    }
    if (typeof c.burst === 'function') {
      c.burst(pos.x, pos.y + 0.6, pos.z, 0xff2848, 22);
      c.burst(pos.x, pos.y + 0.6, pos.z, 0x92123c, 16);
    }
    if (typeof c.dustBurst === 'function') {
      const surf = typeof c.surfaceAt === 'function' ? c.surfaceAt(pos.x, pos.z) : 'stone';
      c.dustBurst(pos.x, groundH + 0.1, pos.z, 12, surf);
    }
    if (SoundRef && typeof SoundRef.slam === 'function') SoundRef.slam();
    if (PhysicsRef && typeof PhysicsRef.addCameraShake === 'function') PhysicsRef.addCameraShake(0.65);
  }

  function updateClassicFallbackVisuals(g, m, u, stepDt, nowTime, chasing, windingUp) {
    const flashNorm = (g.flash || 0) / 0.25;
    if (u.eyeMat && u.eyeMat.emissive) {
      if (g.flash > 0) {
        if (typeof u.eyeMat.emissive.setRGB === 'function') {
          u.eyeMat.emissive.setRGB(1.0, 0.55 + flashNorm * 0.45, 0.1 + flashNorm * 0.9);
        }
        u.eyeMat.emissiveIntensity = 1.15 + flashNorm * 3.5;
      } else if (windingUp || g.state === 'lunge') {
        if (typeof u.eyeMat.emissive.setRGB === 'function') {
          u.eyeMat.emissive.setRGB(1.0, 0.12, 0.06);
        }
        u.eyeMat.emissiveIntensity = 2.8;
      } else {
        if (typeof u.eyeMat.emissive.setHex === 'function') {
          u.eyeMat.emissive.setHex(0xff8c10);
        }
        u.eyeMat.emissiveIntensity = 1.15;
      }
    }
    if (u.body && u.body.rotation) {
      const wantLean = g.flash > 0 ? -flashNorm * 0.45 : windingUp ? -0.32 : (g.state === 'lunge' ? 0.42 : chasing ? 0.22 : 0.04);
      u.body.rotation.x += (wantLean - u.body.rotation.x) * Math.min(1, stepDt * 12);
    }
    if (u.wisps) {
      for (let wIdx = 0; wIdx < u.wisps.length; wIdx++) {
        const wisp = u.wisps[wIdx];
        if (!wisp) continue;
        const wa = nowTime * (windingUp ? 5.5 : 2.2) + (wIdx / u.wisps.length) * Math.PI * 2;
        if (wisp.position && typeof wisp.position.set === 'function') {
          wisp.position.set(
            Math.cos(wa) * 0.82,
            0.62 + Math.sin(nowTime * 3.6 + wIdx * 2.1) * 0.16,
            Math.sin(wa) * 0.82
          );
        }
        if (wisp.rotation) wisp.rotation.y += stepDt * 3.0;
      }
    }
    if (u.halo && u.halo.scale) {
      const hs = 2.0 + Math.sin(nowTime * 3.1) * 0.14 + flashNorm * 0.65 + (windingUp ? 0.55 : 0);
      u.halo.scale.set(hs, hs, 1);
    }
  }

  function updateGlooms(gloomsList, dt, nowTime, ctx) {
    if (!Array.isArray(gloomsList)) return;

    const c = ctx || _eDefaultCtx;
    const rawDt = typeof dt === 'number' ? dt : 0.016;
    const stepDt = clamp(rawDt, 0, 0.05);
    const tNow = typeof nowTime === 'number' ? nowTime : 0;

    const PRef = getPlayerState(c);
    const followersRef = getFollowers(c);
    const homeRef = getHome(c);
    const sceneRef = getSceneRef(c);
    const PhysicsRef = getPhysRef(c);
    const SoundRef = getSoundRef(c);
    const hFn = getHeightFn(c);
    const waterY = getWaterY(c);
    const randFn = getRng(c);

    // Count land glooms (excluding underwater Abyssal Stalkers) and replenish up to threat targetCount
    const distFromHome = (PRef && homeRef)
      ? Math.hypot((PRef.x || 0) - (homeRef.x || 0), (PRef.z || 0) - (homeRef.z || 0))
      : 0;
    const threat = computeThreatLevel(followersRef ? followersRef.length : 0, getLitCount(c), distFromHome);
    const targetCount = Math.min(6, Math.max(1, 1 + Math.floor(threat * 0.55)));

    let landCount = 0;
    for (let i = 0; i < gloomsList.length; i++) {
      const eg = gloomsList[i];
      if (eg && !eg.underwater && !(eg.tier && eg.tier.underwater)) landCount++;
    }

    if (typeof c.spawnGloom === 'function') {
      for (let tries = 0; landCount < targetCount && tries < 4; tries++) {
        const prevLen = gloomsList.length;
        c.spawnGloom();
        if (gloomsList.length > prevLen) {
          const spawned = gloomsList[gloomsList.length - 1];
          if (spawned && !spawned.underwater && !(spawned.tier && spawned.tier.underwater)) {
            landCount++;
          }
        }
      }
    }

    let ringIdx = 0;
    const pX = PRef ? (PRef.x || 0) : 0;
    const pY = PRef ? (PRef.y || 0) : 0;
    const pZ = PRef ? (PRef.z || 0) : 0;
    const pDead = !PRef || !!PRef.dead;

    for (let i = gloomsList.length - 1; i >= 0; i--) {
      const g = gloomsList[i];
      if (!g || !g.mesh || !g.mesh.position) continue;

      const m = g.mesh;
      const u = m.userData;
      const tier = g.tier || TIERS.classic;
      const isClassic = tier.key === 'classic';
      const isUnderwater = !!(g.underwater || tier.underwater);
      const isAerial = !!tier.aerial;
      const phys = ensureEnemyPhys(g);
      const rig = u && u.enemyRig ? u.enemyRig : null;

      const dxP = m.position.x - pX;
      const dzP = m.position.z - pZ;
      const d = Math.hypot(dxP, dzP);

      g.flash = Math.max(0, (g.flash || 0) - stepDt);

      // One-time mini-boss announcement within 32u (zero emojis)
      if ((tier.isMiniBoss || tier.key === 'behemoth') && !g.announced && !pDead && d <= 32) {
        g.announced = true;
        if (typeof c.toast === 'function') {
          c.toast('An Eclipse Behemoth stalks nearby!', 3400);
        }
      }

      // Target selection
      let playerEligible = !pDead;
      if (isUnderwater && PRef) {
        playerEligible = !pDead && pY < waterY + 0.35 && Math.abs(pY - m.position.y) < 2.6;
      }
      let targetX = pX;
      let targetY = pY;
      let targetZ = pZ;
      let targetDist = playerEligible ? d : 999;
      let targetEffDist = targetDist;
      let targetAlly = null;

      // Shadow Weaver prefers leaping over front-line allies to ambush Starkeeper when within pounce distance
      const weaverAmbush = tier.key === 'weaver' && playerEligible && d < 6.5;

      if (followersRef && !weaverAmbush) {
        for (let fIdx = 0; fIdx < followersRef.length; fIdx++) {
          const ally = followersRef[fIdx];
          if (!ally || !ally.mesh || !ally.mesh.position) continue;
          const ap = ally.mesh.position;
          if (isUnderwater && ap.y >= waterY - 0.25) continue;
          const ad = Math.hypot(m.position.x - ap.x, m.position.z - ap.z);
          if (ad >= 7.5) continue;
          const aggroPull = (ally.stats && typeof ally.stats.aggroPull === 'number') ? ally.stats.aggroPull : 0;
          const effAd = ad - aggroPull;
          if (effAd < targetEffDist) {
            targetEffDist = effAd;
            targetDist = ad;
            targetX = ap.x;
            targetY = ap.y;
            targetZ = ap.z;
            targetAlly = ally;
          }
        }
      }

      const aggroDist = tier.aggroDist !== undefined ? tier.aggroDist : 13;
      const atkRange = tier.atkRange !== undefined ? tier.atkRange : 2.55;
      const chaseSpd = tier.chaseSpd !== undefined ? tier.chaseSpd : 3.9;
      const lungeSpd = tier.lungeSpd !== undefined ? tier.lungeSpd : 10.5;
      const windupDur = tier.windupDur !== undefined ? tier.windupDur : 0.42;
      const lungeDur = tier.lungeDur !== undefined ? tier.lungeDur : 0.26;
      const recoverDur = tier.recoverDur !== undefined ? tier.recoverDur : 0.55;

      let speed = isUnderwater ? 1.45 : 1.6;
      let moveYaw = g.dir;
      let faceYaw = g.dir;
      let turnRate = 6;
      let chasing = false;
      let windingUp = false;

      if (g.state === 'flee') {
        g.targetAlly = null;
        speed = 7.8;
        g.fleeT -= stepDt;
        g.dir = Math.atan2(dxP, dzP);
        moveYaw = g.dir;
        faceYaw = g.dir;
        turnRate = 10;
        if (g.fleeT <= 0) {
          if (sceneRef && typeof sceneRef.remove === 'function') sceneRef.remove(m);
          gloomsList.splice(i, 1);
          if (PhysicsRef && typeof PhysicsRef.validateLockTarget === 'function') PhysicsRef.validateLockTarget();
          continue;
        }
      } else if (g.state === 'roll') {
        speed = 9.5;
        g.stateT -= stepDt;
        moveYaw = g.rollDir !== undefined ? g.rollDir : g.dir;
        faceYaw = moveYaw;
        turnRate = 18;
        if (g.stateT <= 0) {
          g.state = targetDist < aggroDist ? 'chase' : 'wander';
          if (targetDist < aggroDist) {
            g.dir = Math.atan2(targetX - m.position.x, targetZ - m.position.z);
          }
        }
      } else if (g.state === 'windup') {
        windingUp = true;
        speed = 0;
        g.stateT -= stepDt;
        g.dir = Math.atan2(targetX - m.position.x, targetZ - m.position.z);
        moveYaw = g.dir;
        faceYaw = g.dir;
        turnRate = 14;

        // Activate pooled crimson ground telegraph ring for Dread Knight & Eclipse Behemoth
        if (tier.telegraphRing && ringIdx < _eTelegraphPool.length) {
          const ring = _eTelegraphPool[ringIdx++];
          const rad = g.aoeRadius || tier.aoeRadius || 2.8;
          const prog = clamp(1 - Math.max(0, g.stateT) / Math.max(0.05, windupDur), 0, 1);
          const groundY = hFn(m.position.x, m.position.z) + 0.04;
          ring.visible = true;
          if (ring.position && typeof ring.position.set === 'function') {
            ring.position.set(m.position.x, groundY, m.position.z);
          }
          if (ring.scale && typeof ring.scale.set === 'function') {
            ring.scale.set(rad, 1, rad);
          }
          if (ring.rotation) ring.rotation.y = tNow * 1.4;
          const uRing = ring.userData;
          if (uRing) {
            if (uRing.innerDisc && uRing.innerDisc.scale && typeof uRing.innerDisc.scale.set === 'function') {
              const fill = 0.15 + prog * 0.85;
              uRing.innerDisc.scale.set(fill, fill, 1);
            }
            if (uRing.outerMat) uRing.outerMat.opacity = 0.55 + prog * 0.40;
            if (uRing.innerMat) uRing.innerMat.opacity = 0.14 + prog * 0.36;
          }
        }

        if (g.stateT <= 0) {
          g.state = 'lunge';
          g.stateT = lungeDur;
          g.targetAlly = targetAlly;
          g.attackDidHit = false;
          if (isClassic) {
            g.ky = 3.2;
            phys.vy = 3.2;
            phys.onGround = false;
          } else if (tier.key === 'weaver') {
            const leapVy = tier.leapVy || 6.2;
            phys.vy = leapVy;
            g.ky = leapVy;
            phys.onGround = false;
            if (rig && typeof rig.triggerOneShot === 'function') rig.triggerOneShot('attack', 0.48);
          } else if (isAerial) {
            phys.vy = -12.0;
            g.ky = -12.0;
            if (rig && typeof rig.triggerOneShot === 'function') rig.triggerOneShot('attack', 0.45);
          } else if (tier.key === 'behemoth') {
            phys.vy = 3.2;
            g.ky = 3.2;
            phys.onGround = false;
            if (rig && typeof rig.triggerOneShot === 'function') rig.triggerOneShot('attack', 0.65);
          } else if (tier.key === 'knight') {
            phys.vy = 2.8;
            g.ky = 2.8;
            phys.onGround = false;
            if (rig && typeof rig.triggerOneShot === 'function') rig.triggerOneShot('heavyAttack', 0.50);
          } else {
            phys.vy = isUnderwater ? 1.6 : 2.5;
            g.ky = phys.vy;
            if (!isUnderwater) phys.onGround = false;
            if (rig && typeof rig.triggerOneShot === 'function') rig.triggerOneShot('attack', 0.44);
          }
        }
      } else if (g.state === 'lunge') {
        chasing = true;
        g.stateT -= stepDt;
        moveYaw = g.dir;
        faceYaw = g.dir;
        turnRate = 8;

        if (tier.key === 'behemoth') {
          speed = targetDist > 2.2 ? lungeSpd * 0.28 : 0.8;
          if (!g.attackDidHit && (g.stateT <= lungeDur * 0.65 || g.stateT <= 0)) {
            g.attackDidHit = true;
            triggerBehemothShockwave(g, tier, m, PRef, followersRef, hFn, PhysicsRef, SoundRef, c);
          }
          if (g.stateT <= 0) {
            g.state = 'recover';
            g.stateT = recoverDur;
          }
        } else if (tier.key === 'knight') {
          speed = lungeSpd;
          const cleaveRad = g.aoeRadius || tier.aoeRadius || 2.8;
          if (!g.attackDidHit) {
            const toPD = playerEligible ? Math.hypot(m.position.x - pX, m.position.z - pZ) : 999;
            let closestInCone = toPD;
            if (followersRef) {
              for (let fi = 0; fi < followersRef.length; fi++) {
                const ally = followersRef[fi];
                if (!ally || !ally.mesh || !ally.mesh.position) continue;
                const ad = Math.hypot(m.position.x - ally.mesh.position.x, m.position.z - ally.mesh.position.z);
                if (ad < closestInCone) closestInCone = ad;
              }
            }
            if (closestInCone <= 2.25 || g.stateT <= lungeDur * 0.50 || g.stateT <= 0) {
              const hitAny = applyEnemyAoEStrike(g, tier, m, true, cleaveRad, PRef, followersRef, c);
              if (hitAny) {
                g.attackDidHit = true;
                g.state = 'recover';
                g.stateT = recoverDur;
              }
            }
          }
          if (g.state === 'lunge' && g.stateT <= 0) {
            g.state = 'recover';
            g.stateT = recoverDur;
          }
        } else if ((tier.key === 'puglin' || tier.key === 'imp') && (g.aoeRadius || tier.aoeRadius) > 0) {
          speed = lungeSpd;
          const splashRad = g.aoeRadius || tier.aoeRadius;
          if (!g.attackDidHit) {
            const toPD = playerEligible ? Math.hypot(m.position.x - pX, m.position.z - pZ) : 999;
            let nearAny = toPD;
            if (followersRef) {
              for (let fi = 0; fi < followersRef.length; fi++) {
                const ally = followersRef[fi];
                if (!ally || !ally.mesh || !ally.mesh.position) continue;
                const ad = Math.hypot(m.position.x - ally.mesh.position.x, m.position.z - ally.mesh.position.z);
                if (ad < nearAny) nearAny = ad;
              }
            }
            if (nearAny <= splashRad) {
              const hitAny = applyEnemyAoEStrike(g, tier, m, false, splashRad, PRef, followersRef, c);
              if (hitAny) {
                g.attackDidHit = true;
                g.state = 'recover';
                g.stateT = recoverDur;
              }
            }
          }
          if (g.state === 'lunge' && g.stateT <= 0) {
            g.state = 'recover';
            g.stateT = recoverDur;
          }
        } else {
          // Classic Gloomblob, Shadow Weaver, Shadow Stinger, Abyssal Stalker single-target lunge/pounce/dive
          speed = lungeSpd;
          const toPlayerD = Math.hypot(m.position.x - pX, m.position.z - pZ);
          const pVertOk = isAerial
            ? Math.abs((pY + 0.75) - m.position.y) < 1.05
            : isUnderwater
              ? Math.abs(pY - m.position.y) < 2.6
              : (tier.key === 'weaver' ? Math.abs(pY - m.position.y) < 2.2 : Math.abs(pY - m.position.y) < 2.6);
          const strikeRangeP = tier.key === 'weaver' || isAerial ? 1.85 : 1.75;
          if (!g.attackDidHit && playerEligible && toPlayerD < strikeRangeP && pVertOk) {
            if ((PRef.invulnT || 0) <= 0 && (PRef.hurtInvulnT || 0) <= 0 && typeof c.damagePlayer === 'function') {
              const safeD = Math.max(0.15, toPlayerD);
              const kDirX = (pX - m.position.x) / safeD;
              const kDirZ = (pZ - m.position.z) / safeD;
              c.damagePlayer(g.dmgPlayer || tier.dmgPlayer || 2, 'gloom', kDirX * 8.5, kDirZ * 8.5);
              g.attackDidHit = true;
              g.state = 'recover';
              g.stateT = isClassic ? 0.65 : recoverDur;
              if (isAerial && phys.vy < 3.5) phys.vy = 3.5;
            }
          } else if (!g.attackDidHit && g.targetAlly && followersRef && followersRef.indexOf(g.targetAlly) >= 0 && typeof c.damageCompanion === 'function') {
            const ap = g.targetAlly.mesh.position;
            const aD = Math.hypot(m.position.x - ap.x, m.position.z - ap.z);
            const aVertOk = isAerial
              ? Math.abs((ap.y + 0.70) - m.position.y) < 1.05
              : (tier.key === 'weaver' ? Math.abs(ap.y - m.position.y) < 2.2 : Math.abs(ap.y - m.position.y) < 2.6);
            if (aD < 1.65 && aVertOk) {
              const safeD = Math.max(0.15, aD);
              c.damageCompanion(g.targetAlly, g.dmgAlly || tier.dmgAlly || 1, ((ap.x - m.position.x) / safeD) * 7.5, ((ap.z - m.position.z) / safeD) * 7.5, g);
              g.attackDidHit = true;
              g.state = 'recover';
              g.stateT = isClassic ? 0.65 : recoverDur;
              if (isAerial && phys.vy < 3.5) phys.vy = 3.5;
            }
          }
          if (g.state === 'lunge' && g.stateT <= 0) {
            g.state = 'recover';
            g.stateT = recoverDur;
            if (isAerial && phys.vy < 3.5) phys.vy = 3.5;
          }
        }
      } else if (g.state === 'recover') {
        speed = 0.6;
        g.stateT -= stepDt;
        if (g.stateT <= 0) g.state = 'wander';
      } else if (targetDist < aggroDist) {
        speed = chaseSpd;
        chasing = true;
        g.targetAlly = targetAlly;
        g.dir = Math.atan2(targetX - m.position.x, targetZ - m.position.z);
        moveYaw = g.dir;
        faceYaw = g.dir;
        turnRate = 8;
        if (targetDist < atkRange) {
          g.state = 'windup';
          g.stateT = windupDur;
          g.targetAlly = targetAlly;
          g.attackDidHit = false;
        }
      } else {
        g.targetAlly = null;
        g.turnT -= stepDt;
        if (g.turnT <= 0) {
          g.dir += (randFn() - 0.5) * 2.5;
          g.turnT = 2 + randFn() * 3;
        }
        if (isUnderwater) {
          const hx = g.homeX !== undefined ? g.homeX : m.position.x;
          const hz = g.homeZ !== undefined ? g.homeZ : m.position.z;
          const hd = Math.hypot(m.position.x - hx, m.position.z - hz);
          if (hd > 16) {
            g.dir = Math.atan2(hx - m.position.x, hz - m.position.z);
          }
        }
        moveYaw = g.dir;
        faceYaw = g.dir;
      }

      const desVx = Math.sin(moveYaw) * speed;
      const desVz = Math.cos(moveYaw) * speed;
      stepEnemyPhysics(g, stepDt, tNow, desVx, desVz, faceYaw, turnRate, targetY, c);

      // Squash & stretch for Classic Gloomblob
      if (isClassic) {
        const flashNorm = (g.flash || 0) / 0.25;
        const hopSin = Math.sin(g.hopT);
        const stretch = windingUp ? -0.24 : Math.max(0, hopSin) * 0.12 - Math.max(0, -hopSin) * 0.06;
        const recoil = flashNorm * 0.22;
        const windWiden = windingUp ? 0.18 : 0;
        if (m.scale && typeof m.scale.set === 'function') {
          m.scale.set(
            1 + recoil + windWiden - stretch * 0.45,
            Math.max(0.62, 1 - recoil * 0.55 + stretch),
            1 + recoil + windWiden - stretch * 0.45
          );
        }
      }

      // Sync EnemyRig or fallback classic visual aura
      if (rig && typeof rig.update === 'function') {
        if (typeof rig.setLookTarget === 'function' && targetDist < aggroDist && !pDead) {
          rig.setLookTarget(targetX, targetY + 1.0, targetZ);
        } else if (typeof rig.clearLookTarget === 'function') {
          rig.clearLookTarget();
        }
        _eAnimState.mode = g.state === 'roll' ? 'roll' : null;
        _eAnimState.speed = phys.smoothSpd;
        _eAnimState.refSpeed = 0;
        _eAnimState.airborne = !phys.onGround && !isUnderwater && !isAerial;
        _eAnimState.inWater = isUnderwater;
        _eAnimState.dead = !!g.dead || g.hp <= 0;
        _eAnimState.windingUp = windingUp;
        _eAnimState.lunging = g.state === 'lunge';
        _eAnimState.hurtFlash = g.flash || 0;
        _eAnimState.isMoving = phys.smoothSpd > 0.25;
        _eAnimState.facingYaw = m.rotation ? m.rotation.y : g.dir;
        _eAnimState.posX = m.position.x;
        _eAnimState.posY = m.position.y;
        _eAnimState.posZ = m.position.z;
        rig.update(stepDt, tNow, _eAnimState);
      } else if (u && isClassic) {
        updateClassicFallbackVisuals(g, m, u, stepDt, tNow, chasing, windingUp);
      }

      // Land enemies despawn if > 90u from Starkeeper; underwater Stalkers NEVER despawn
      if (PRef && !isUnderwater && d > 90) {
        if (sceneRef && typeof sceneRef.remove === 'function') sceneRef.remove(m);
        gloomsList.splice(i, 1);
        if (PhysicsRef && typeof PhysicsRef.validateLockTarget === 'function') PhysicsRef.validateLockTarget();
      }
    }

    // Hide any unused pooled telegraph rings
    for (let r = ringIdx; r < _eTelegraphPool.length; r++) {
      if (_eTelegraphPool[r]) _eTelegraphPool[r].visible = false;
    }
  }

  function initUnderwaterEnemies(gloomsList, ctx) {
    if (!Array.isArray(gloomsList)) return gloomsList;
    const c = ctx || _eDefaultCtx;
    const ModelsRef = getModelsRef(c);
    const THREERef = c.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const sceneRef = getSceneRef(c);
    const hFn = getHeightFn(c);
    const waterY = getWaterY(c);
    const maxUnderY = waterY - 1.2;

    for (let i = 0; i < UNDERWATER_SPAWNS.length; i++) {
      const sp = UNDERWATER_SPAWNS[i];
      const y = Math.min(hFn(sp.x, sp.z), maxUnderY);
      let mesh = null;
      if (ModelsRef && typeof ModelsRef.makeGloom === 'function') {
        mesh = ModelsRef.makeGloom(TIERS.stalker);
      } else if (THREERef && typeof THREERef.Group === 'function') {
        mesh = new THREERef.Group('AbyssalStalker');
      } else {
        mesh = { position: { x: sp.x, y, z: sp.z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } }, rotation: { x: 0, y: 0, z: 0, order: 'YXZ' }, userData: {} };
      }

      attachToGloom(mesh, TIERS.stalker, c);
      const g = createGloomState(mesh, TIERS.stalker, sp.x, y, sp.z, {
        underwater: true,
        homeX: sp.x,
        homeZ: sp.z,
        dir: sp.dir,
      });
      if (sceneRef && typeof sceneRef.add === 'function') sceneRef.add(mesh);
      gloomsList.push(g);
    }
    return gloomsList;
  }

  return {
    ARCHETYPE_KEYS,
    TIERS,
    TIER_LIST,
    computeThreatLevel,
    pickEnemyTier,
    resolveAssetSource,
    preloadArchetype,
    attachToGloom,
    createGloomState,
    initTelegraphPool,
    stepEnemyPhysics,
    onGloomHit,
    updateGlooms,
    initUnderwaterEnemies,
    _resetCache,
  };
})();
