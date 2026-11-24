import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockTHREE() {
  const allocs = { vec3: 0, quat: 0, euler: 0, color: 0 };

  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    set(x, y) { this.x = x; this.y = y; return this; }
  }

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      allocs.vec3++;
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
  }

  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
      allocs.euler++;
      this.x = x;
      this.y = y;
      this.z = z;
      this.order = order;
    }
    set(x, y, z, order) {
      this.x = x;
      this.y = y;
      this.z = z;
      if (order) this.order = order;
      return this;
    }
  }

  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      allocs.quat++;
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    setFromAxisAngle(axis, angle) {
      const s = Math.sin(angle * 0.5);
      this.x = axis.x * s;
      this.y = axis.y * s;
      this.z = axis.z * s;
      this.w = Math.cos(angle * 0.5);
      return this;
    }
    multiply(q) {
      const ax = this.x, ay = this.y, az = this.z, aw = this.w;
      const bx = q.x, by = q.y, bz = q.z, bw = q.w;
      this.x = aw * bx + ax * bw + ay * bz - az * by;
      this.y = aw * by - ax * bz + ay * bw + az * bx;
      this.z = aw * bz + ax * by - ay * bx + az * bw;
      this.w = aw * bw - ax * bx - ay * by - az * bz;
      return this;
    }
    identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
  }

  class Color {
    constructor(hex = 0xffffff) {
      allocs.color++;
      this.hex = hex;
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
      this._linear = false;
    }
    setHex(h) {
      this.hex = h;
      this.r = ((h >> 16) & 255) / 255;
      this.g = ((h >> 8) & 255) / 255;
      this.b = (h & 255) / 255;
      return this;
    }
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
      return this;
    }
    copy(c) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      this.hex = c.hex;
      this._linear = c._linear;
      return this;
    }
    convertSRGBToLinear() { this._linear = true; return this; }
  }

  class Object3D {
    constructor(name = '') {
      this.name = name;
      this.children = [];
      this.parent = null;
      this.visible = true;
      this.castShadow = false;
      this.receiveShadow = false;
      this.frustumCulled = true;
      this.position = new Vector3();
      this.rotation = new Euler();
      this.quaternion = new Quaternion();
      this.scale = new Vector3(1, 1, 1);
      this.userData = {};
    }
    add(...objs) {
      for (const o of objs) {
        if (!o) continue;
        if (o.parent && typeof o.parent.remove === 'function') o.parent.remove(o);
        o.parent = this;
        this.children.push(o);
      }
      return this;
    }
    remove(obj) {
      const idx = this.children.indexOf(obj);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        obj.parent = null;
      }
      return this;
    }
    traverse(fn) {
      fn(this);
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].traverse(fn);
      }
    }
    clone(recursive = true) {
      const copy = new this.constructor(this.name);
      copy.visible = this.visible;
      copy.castShadow = this.castShadow;
      copy.receiveShadow = this.receiveShadow;
      copy.frustumCulled = this.frustumCulled;
      copy.position.copy(this.position);
      copy.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z, this.rotation.order);
      copy.quaternion.copy(this.quaternion);
      copy.scale.copy(this.scale);
      copy.userData = { ...this.userData };
      if (this.isBone) {
        copy.isBone = true;
        copy.type = 'Bone';
      }
      if (this.isMesh) {
        copy.isMesh = true;
        copy.material = this.material;
        copy.geometry = this.geometry;
      }
      if (this.isSkinnedMesh) copy.isSkinnedMesh = true;
      if (this.morphTargetDictionary) copy.morphTargetDictionary = { ...this.morphTargetDictionary };
      if (this.morphTargetInfluences) copy.morphTargetInfluences = this.morphTargetInfluences.slice();
      if (recursive) {
        for (const ch of this.children) copy.add(ch.clone(true));
      }
      return copy;
    }
  }

  class Group extends Object3D {}
  class Bone extends Object3D {
    constructor(name = '') {
      super(name);
      this.isBone = true;
      this.type = 'Bone';
    }
  }

  class MeshStandardMaterial {
    constructor(opts = {}) {
      this.isMeshStandardMaterial = true;
      this.color = opts.color && opts.color.isColor ? opts.color.clone() : new Color(opts.color !== undefined ? opts.color : 0xffffff);
      this.emissive = opts.emissive && opts.emissive.isColor ? opts.emissive.clone() : new Color(opts.emissive !== undefined ? opts.emissive : 0x000000);
      this.emissiveIntensity = opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1;
      this.roughness = opts.roughness !== undefined ? opts.roughness : 0.7;
      this.metalness = opts.metalness !== undefined ? opts.metalness : 0.05;
      this.skinning = !!opts.skinning;
      this.morphTargets = !!opts.morphTargets;
      this.morphNormals = !!opts.morphNormals;
      this.vertexColors = !!opts.vertexColors;
      this.transparent = !!opts.transparent;
      this.opacity = opts.opacity !== undefined ? opts.opacity : 1;
      this.map = opts.map || null;
      this.normalMap = opts.normalMap || null;
      this.roughnessMap = opts.roughnessMap || null;
      this.metalnessMap = opts.metalnessMap || null;
      this.emissiveMap = opts.emissiveMap || null;
      this.normalScale = opts.normalScale || null;
      this.name = opts.name || '';
      this.needsUpdate = false;
    }
    clone() {
      const m = new MeshStandardMaterial({
        name: this.name,
        roughness: this.roughness,
        metalness: this.metalness,
        emissiveIntensity: this.emissiveIntensity,
        skinning: this.skinning,
        morphTargets: this.morphTargets,
        morphNormals: this.morphNormals,
        vertexColors: this.vertexColors,
        transparent: this.transparent,
        opacity: this.opacity,
        map: this.map,
        normalMap: this.normalMap,
        roughnessMap: this.roughnessMap,
        metalnessMap: this.metalnessMap,
        emissiveMap: this.emissiveMap,
        normalScale: this.normalScale,
      });
      m.color.copy(this.color);
      m.emissive.copy(this.emissive);
      return m;
    }
  }

  class MeshBasicMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
    }
  }

  class SpriteMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
      this.opacity = opts.opacity !== undefined ? opts.opacity : 1;
    }
  }

  class Sprite extends Object3D {
    constructor(mat) {
      super('Sprite');
      this.isSprite = true;
      this.material = mat || new SpriteMaterial();
    }
  }

  class Mesh extends Object3D {
    constructor(name = '', matName = '', opts = {}) {
      super(name);
      this.isMesh = true;
      if (opts.material) {
        this.material = opts.material;
      } else {
        this.material = new MeshStandardMaterial({
          name: matName,
          map: opts.map || null,
          normalMap: opts.normalMap || null,
          roughnessMap: opts.roughnessMap || null,
          metalnessMap: opts.metalnessMap || null,
          emissiveMap: opts.emissiveMap || null,
          emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
          emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
          vertexColors: !!opts.vertexColors,
        });
      }
      this.geometry = opts.geometry || {
        attributes: opts.vertexColors ? { position: {}, color: {} } : { position: {} },
        morphAttributes: opts.morphNames ? { position: opts.morphNames.map(() => ({})) } : {},
      };
      if (opts.morphNames) {
        this.morphTargetDictionary = {};
        this.morphTargetInfluences = [];
        opts.morphNames.forEach((mn, idx) => {
          this.morphTargetDictionary[mn] = idx;
          this.morphTargetInfluences.push(0);
        });
      }
    }
  }

  class SkinnedMesh extends Mesh {
    constructor(name = '', matName = '', opts = {}) {
      super(name, matName, opts);
      this.isSkinnedMesh = true;
      this.skeleton = { bones: [], clone() { return { bones: [] }; } };
      this.bindMatrix = {};
      this.bind = () => {};
    }
  }

  class MockAction {
    constructor(clip) {
      this._clip = clip;
      this.enabled = false;
      this.paused = false;
      this.time = 0;
      this.timeScale = 1;
      this.weight = 0;
      this.loop = 2201;
      this.clampWhenFinished = false;
      this.playing = false;
      this.crossFades = [];
      this.stopFadingCalls = 0;
    }
    getClip() { return this._clip; }
    reset() { this.time = 0; this.enabled = true; this.paused = false; return this; }
    play() { this.enabled = true; this.playing = true; return this; }
    stop() { this.playing = false; this.weight = 0; return this; }
    stopFading() { this.stopFadingCalls++; return this; }
    setLoop(mode) { this.loop = mode; return this; }
    setEffectiveTimeScale(s) { this.timeScale = s; return this; }
    setEffectiveWeight(w) { this.weight = w; return this; }
    getEffectiveWeight() { return this.weight; }
    crossFadeTo(target, dur, warp) {
      this.crossFades.push({ to: target._clip.name, dur, warp });
      target.enabled = true;
      target.playing = true;
      target.weight = 1;
      this.weight = 0;
      return this;
    }
  }

  const mixers = [];
  class AnimationMixer {
    constructor(root) {
      this.root = root;
      this.actions = new Map();
      this.updatedDt = 0;
      this.updateCount = 0;
      mixers.push(this);
    }
    clipAction(clip) {
      if (!this.actions.has(clip)) {
        this.actions.set(clip, new MockAction(clip));
      }
      return this.actions.get(clip);
    }
    update(dt) {
      this.updatedDt += dt;
      this.updateCount++;
      for (const act of this.actions.values()) {
        if (act.playing && !act.paused) {
          act.time += dt * act.timeScale;
          if (act.loop === 2200 && act._clip && act._clip.duration > 0 && act.time >= act._clip.duration) {
            act.time = act._clip.duration;
            if (act.clampWhenFinished) act.paused = true;
            else act.enabled = false;
          }
        }
      }
    }
  }

  return {
    Vector2,
    Vector3,
    Euler,
    Quaternion,
    Color,
    Object3D,
    Group,
    Bone,
    Mesh,
    SkinnedMesh,
    Sprite,
    MeshStandardMaterial,
    MeshBasicMaterial,
    SpriteMaterial,
    AnimationMixer,
    LoopOnce: 2200,
    LoopRepeat: 2201,
    AdditiveBlending: 2,
    _allocs: allocs,
    _mixers: mixers,
    _resetAllocs() {
      allocs.vec3 = 0;
      allocs.quat = 0;
      allocs.euler = 0;
      allocs.color = 0;
    },
  };
}

function makeMockEnemyGltf(THREE, key, opts = {}) {
  const scene = new THREE.Group('Scene');
  const enemyRoot = new THREE.Group('EnemyRoot');
  scene.add(enemyRoot);

  if (key === 'puglin' || key === 'imp') {
    enemyRoot.scale.set(key === 'puglin' ? 1.2674 : 0.9238, key === 'puglin' ? 1.2674 : 0.9238, key === 'puglin' ? 1.2674 : 0.9238);
    const arm = new THREE.Group('Armature');
    const bPelvis = new THREE.Bone('pelvis');
    const bHead = new THREE.Bone('Head');
    const bHandR = new THREE.Bone('hand_r');
    bPelvis.add(bHead, bHandR);
    arm.add(bPelvis);
    enemyRoot.add(arm);

    const pbrMat = new THREE.MeshStandardMaterial({
      name: key === 'puglin' ? 'MI_Puglin' : 'MI_Imp',
      map: { tag: `${key}_BaseColor` },
      normalMap: { tag: `${key}_Normal` },
      roughnessMap: { tag: `${key}_ORM` },
      metalnessMap: { tag: `${key}_ORM` },
      emissiveMap: { tag: `${key}_Emissive` },
      emissive: 0xffffff,
      emissiveIntensity: 1.0,
    });
    const mBody = new THREE.SkinnedMesh(key === 'puglin' ? 'Puglin_Body' : 'Imp_Body', '', { material: pbrMat });
    enemyRoot.add(mBody);

    const clips = key === 'puglin'
      ? ['Idle', 'Walk', 'Run', 'Jump', 'Attack', 'HeavyAttack', 'HitReact', 'Death']
      : ['Idle', 'Walk', 'Run', 'Jump', 'Attack', 'HeavyAttack', 'Roll', 'HitReact', 'Death'];
    return {
      scene,
      animations: clips.map((name) => ({ name, duration: 0.75, tracks: [] })),
    };
  }

  const rootNode = new THREE.Group('RootNode');
  enemyRoot.add(rootNode);

  if (key === 'knight') {
    enemyRoot.scale.set(0.3661, 0.3661, 0.3661);
    const arm = new THREE.Group('HumanArmature');
    arm.scale.set(100, 100, 100);
    const bBone = new THREE.Bone('Bone');
    const bBody = new THREE.Bone('Body');
    const bTorso = new THREE.Bone('Torso');
    const bNeck = new THREE.Bone('Neck');
    const bHead = new THREE.Bone('Head');
    const bLowerArmR = new THREE.Bone('LowerArm.R');
    const bPalmR = new THREE.Bone('Palm.R');
    bBone.add(bBody);
    bBody.add(bTorso);
    bTorso.add(bNeck);
    bNeck.add(bHead);
    bTorso.add(bLowerArmR);
    if (!opts.omitPalmR) {
      bLowerArmR.add(bPalmR);
    }
    arm.add(bBone);
    rootNode.add(arm);

    const meshGroup = new THREE.Group('Knight');
    meshGroup.add(new THREE.SkinnedMesh('Knight_0', 'Armor'));
    meshGroup.add(new THREE.SkinnedMesh('Knight_1', 'Boots'));
    meshGroup.add(new THREE.SkinnedMesh('Knight_2', 'Skin'));
    rootNode.add(meshGroup);

    const clips = [
      'HumanArmature|Death', 'HumanArmature|Idle', 'HumanArmature|Idle_swordLeft',
      'HumanArmature|Idle_swordRight', 'HumanArmature|Jump', 'HumanArmature|Roll',
      'HumanArmature|Roll_sword', 'HumanArmature|Run', 'HumanArmature|Run_swordAttack',
      'HumanArmature|Run_swordRight', 'HumanArmature|swordAttackJump', 'HumanArmature|Walking',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.8, tracks: [] })) };
  }

  if (key === 'behemoth') {
    enemyRoot.scale.set(0.1872, 0.1872, 0.1872);
    const arm = new THREE.Group('Armature');
    arm.scale.set(300, 300, 300);
    const bRoot = new THREE.Bone('root');
    const bBody = new THREE.Bone('Body');
    const bHips = new THREE.Bone('Hips');
    const bTorso = new THREE.Bone('Torso');
    const bHead = new THREE.Bone('Head');
    bRoot.add(bBody);
    bBody.add(bHips);
    bHips.add(bTorso);
    bTorso.add(bHead);
    arm.add(bRoot);
    rootNode.add(arm);

    const meshGroup = new THREE.Group('Trex');
    meshGroup.add(new THREE.SkinnedMesh('Trex_0', 'LightYellow'));
    meshGroup.add(new THREE.SkinnedMesh('Trex_1', 'LightGreen'));
    meshGroup.add(new THREE.SkinnedMesh('Trex_2', 'Green'));
    meshGroup.add(new THREE.SkinnedMesh('Trex_3', 'Black'));
    meshGroup.add(new THREE.SkinnedMesh('Trex_4', 'Red'));
    rootNode.add(meshGroup);

    const clips = [
      'Armature|TRex_Attack', 'Armature|TRex_Death', 'Armature|TRex_Idle',
      'Armature|TRex_Jump', 'Armature|TRex_Run', 'Armature|TRex_Walk',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.9, tracks: [] })) };
  }

  if (key === 'weaver') {
    enemyRoot.scale.set(0.4515, 0.4515, 0.4515);
    const arm = new THREE.Group('SpiderArmature');
    arm.scale.set(100, 100, 100);
    const bBody = new THREE.Bone('Body');
    const bHead = new THREE.Bone('Head');
    bBody.add(bHead);
    arm.add(bBody);
    rootNode.add(arm);

    const meshGroup = new THREE.Group('Cube');
    meshGroup.add(new THREE.SkinnedMesh('Cube_0', 'Material'));
    meshGroup.add(new THREE.SkinnedMesh('Cube_1', 'Material.001'));
    rootNode.add(meshGroup);

    const clips = [
      'SpiderArmature|Spider_Attack', 'SpiderArmature|Spider_Death',
      'SpiderArmature|Spider_Idle', 'SpiderArmature|Spider_Jump', 'SpiderArmature|Spider_Walk',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.7, tracks: [] })) };
  }

  if (key === 'stinger') {
    enemyRoot.scale.set(0.4169, 0.4169, 0.4169);
    const arm = new THREE.Group('MonsterArmature');
    arm.scale.set(100, 100, 100);
    const bBody = new THREE.Bone('Body');
    const bHead = new THREE.Bone('Head');
    arm.add(bBody, bHead);
    rootNode.add(arm);

    const meshGroup = new THREE.Group('Bee');
    meshGroup.add(new THREE.SkinnedMesh('Bee_0', 'Main_2'));
    meshGroup.add(new THREE.SkinnedMesh('Bee_1', 'Main'));
    meshGroup.add(new THREE.SkinnedMesh('Bee_2', 'Eyes'));
    meshGroup.add(new THREE.SkinnedMesh('Bee_3', 'Wings'));
    meshGroup.add(new THREE.SkinnedMesh('Bee_4', 'Tongue'));
    meshGroup.add(new THREE.SkinnedMesh('Bee_5', 'Teeth'));
    rootNode.add(meshGroup);

    const clips = [
      'MonsterArmature|Bite_Front', 'MonsterArmature|Death',
      'MonsterArmature|Flying', 'MonsterArmature|HitRecieve',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.65, tracks: [] })) };
  }

  // stalker
  enemyRoot.scale.set(0.6086, 0.6086, 0.6086);
  const arm = new THREE.Group('MonsterArmature');
  arm.scale.set(100, 100, 100);
  const bBody = new THREE.Bone('Body');
  const bHead = new THREE.Bone('Head');
  arm.add(bBody, bHead);
  rootNode.add(arm);

  const meshGroup = new THREE.Group('Crab');
  meshGroup.add(new THREE.SkinnedMesh('Crab_0', 'Main'));
  meshGroup.add(new THREE.SkinnedMesh('Crab_1', 'Black'));
  meshGroup.add(new THREE.SkinnedMesh('Crab_2', 'Main_Dark'));
  meshGroup.add(new THREE.SkinnedMesh('Crab_3', 'White'));
  rootNode.add(meshGroup);

  const clips = [
    'MonsterArmature|Bite_Front', 'MonsterArmature|Bite_InPlace', 'MonsterArmature|Dance',
    'MonsterArmature|Death', 'MonsterArmature|HitRecieve', 'MonsterArmature|Idle',
    'MonsterArmature|Jump', 'MonsterArmature|No', 'MonsterArmature|Walk', 'MonsterArmature|Yes',
  ];
  return { scene, animations: clips.map((name) => ({ name, duration: 0.7, tracks: [] })) };
}

function loadEnemiesHarness({
  protocol = 'https:',
  omitLoader = false,
  omitSkeletonUtils = false,
  failLoad = false,
  deferLoad = false,
  gltfOpts = {},
} = {}) {
  const code = fs.readFileSync(new URL('../enemies.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  const calls = {
    loadUrls: [],
    parseCount: 0,
    scriptsInjected: [],
    cloneCount: 0,
    attachments: [],
    makeGloomCalls: [],
  };

  if (!omitSkeletonUtils) {
    THREE.SkeletonUtils = {
      clone(source) {
        calls.cloneCount++;
        return source.clone(true);
      },
    };
  }

  const pendingDeferred = [];
  if (!omitLoader) {
    THREE.GLTFLoader = class {
      load(url, onLoad, _onProg, onErr) {
        calls.loadUrls.push(url);
        const key = url.split('/').pop().replace(/\.glb$/, '');
        const finish = () => {
          if (failLoad) {
            if (onErr) onErr(new Error('load failed'));
          } else if (onLoad) {
            onLoad(makeMockEnemyGltf(THREE, key, gltfOpts));
          }
        };
        if (deferLoad) pendingDeferred.push(finish);
        else finish();
      }
      parse(_buf, _path, onLoad, onErr) {
        calls.parseCount++;
        const key = calls.scriptsInjected[calls.scriptsInjected.length - 1]
          ?.split('/').pop().replace(/\.glb\.js$/, '') || 'puglin';
        if (failLoad) {
          if (onErr) onErr(new Error('parse failed'));
        } else if (onLoad) {
          onLoad(makeMockEnemyGltf(THREE, key, gltfOpts));
        }
      }
    };
  }

  const win = {};
  const doc = {
    head: {
      appendChild(el) {
        calls.scriptsInjected.push(el.src);
        const match = el.src.match(/\/([^/]+)\.glb\.js$/);
        const key = match ? match[1] : 'puglin';
        win.__ENEMY_GLB_B64__ = win.__ENEMY_GLB_B64__ || {};
        win.__ENEMY_GLB_B64__[key] = Buffer.from('glTFmock').toString('base64');
        if (typeof el.onload === 'function') el.onload();
      },
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), src: '', onload: null, onerror: null };
    },
  };

  const Models = {
    makeGloom(tierDef) {
      calls.makeGloomCalls.push(tierDef);
      const g = new THREE.Group('GloomRoot');
      const eyeMat = new THREE.MeshStandardMaterial({
        color: tierDef && tierDef.eyeColor !== undefined ? tierDef.eyeColor : 0xff8c10,
        emissive: tierDef && tierDef.eyeColor !== undefined ? tierDef.eyeColor : 0xff8c10,
        emissiveIntensity: 1.2,
      });
      const body = new THREE.Group('GloomBody');
      const wisps = [new THREE.Mesh('Wisp0'), new THREE.Mesh('Wisp1'), new THREE.Mesh('Wisp2')];
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x52287a, opacity: 0.45 }));
      halo.scale.set(2.0, 2.0, 1);
      if (tierDef && tierDef.key !== 'classic') {
        const fbRoot = new THREE.Group('FallbackRoot');
        fbRoot.scale.set(tierDef.fallbackScale || 1, tierDef.fallbackScale || 1, tierDef.fallbackScale || 1);
        fbRoot.add(body, ...wisps, halo);
        g.add(fbRoot);
        g.userData = { body, wisps, halo, eyeMat, fallbackRoot: fbRoot, tierKey: tierDef.key };
      } else {
        g.add(body, ...wisps, halo);
        g.userData = { body, wisps, halo, eyeMat, tierKey: 'classic' };
      }
      return g;
    },
    makeShadowBlade() {
      const g = new THREE.Group('ShadowBlade');
      calls.attachments.push('ShadowBlade');
      return g;
    },
    makeDreadCrown() {
      const g = new THREE.Group('DreadCrown');
      calls.attachments.push('DreadCrown');
      return g;
    },
    makeBehemothSpines() {
      const g = new THREE.Group('BehemothSpines');
      calls.attachments.push('BehemothSpines');
      return g;
    },
    makeTelegraphRing() {
      const g = new THREE.Group('TelegraphRing');
      const outerMat = new THREE.MeshBasicMaterial({ color: 0xff2848, transparent: true, opacity: 0.85 });
      const innerMat = new THREE.MeshBasicMaterial({ color: 0xff1e3c, transparent: true, opacity: 0.26 });
      const outerRing = new THREE.Mesh('OuterRing', '', { material: outerMat });
      const innerDisc = new THREE.Mesh('InnerDisc', '', { material: innerMat });
      g.add(outerRing, innerDisc);
      g.userData = { outerRing, innerDisc, outerMat, innerMat };
      return g;
    },
    makeStarPickup() {
      const m = new THREE.Group('StarPickup');
      m.userData = {};
      return m;
    },
  };

  const Textures = {
    sets: {
      scales: { map: { tag: 'scalesMap' }, normalMap: { tag: 'scalesNorm' }, roughnessMap: { tag: 'scalesRough' } },
      stone: { map: { tag: 'stoneMap' }, normalMap: { tag: 'stoneNorm' }, roughnessMap: { tag: 'stoneRough' } },
      cloth: { map: { tag: 'clothMap' }, normalMap: { tag: 'clothNorm' }, roughnessMap: { tag: 'clothRough' } },
    },
  };

  const Shaders = {
    createGlowSprite(color, size, opacity) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, opacity }));
      sp.scale.set(size || 1, size || 1, 1);
      return sp;
    },
  };

  const sandbox = {
    THREE,
    Models,
    Textures,
    Shaders,
    Physics: {},
    Regions: {},
    Math,
    Uint8Array,
    ArrayBuffer,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    location: { protocol },
    document: doc,
    window: win,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code + '\nthis.__Enemies = Enemies;', sandbox);

  return {
    Enemies: sandbox.__Enemies,
    THREE,
    Models,
    Textures,
    Shaders,
    calls,
    flushDeferred() {
      while (pendingDeferred.length) pendingDeferred.shift()();
    },
  };
}

function makeRng(seed = 1234567) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('ARCHETYPE_KEYS and all 8 TIERS profiles match exact Shadow Beast spec and zero emojis in enemies.js', () => {
  const src = fs.readFileSync(new URL('../enemies.js', import.meta.url), 'utf8');
  assert.equal(/\p{Extended_Pictographic}/u.test(src), false, 'enemies.js must contain zero emojis');

  const { Enemies } = loadEnemiesHarness();
  assert.deepEqual([...Enemies.ARCHETYPE_KEYS], ['puglin', 'imp', 'weaver', 'stinger', 'knight', 'behemoth', 'stalker']);

  const T = Enemies.TIERS;
  assert.equal(Object.keys(T).length, 8);
  assert.equal(T.classic.tier, 1);
  assert.equal(T.classic.baseHp, 3);
  assert.equal(T.classic.minThreat, 0);
  assert.equal(T.puglin.tier, 2);
  assert.equal(T.puglin.aoeRadius, 2.0);
  assert.equal(T.weaver.leapVy, 6.2);
  assert.equal(T.stinger.aerial, true);
  assert.equal(T.stinger.hoverAlt, 2.2);
  assert.equal(T.imp.poiseHeavyOnly, true);
  assert.equal(T.imp.canRoll, true);
  assert.equal(T.knight.frontArcOnly, true);
  assert.equal(T.knight.telegraphRing, true);
  assert.equal(T.behemoth.tier, 4);
  assert.equal(T.behemoth.isMiniBoss, true);
  assert.equal(T.behemoth.heartDrops, 2);
  assert.equal(T.behemoth.telegraphRing, true);
  assert.equal(T.stalker.underwater, true);
  assert.deepEqual([...T.stalker.regions], ['sunkenCity']);
});

test('computeThreatLevel and pickEnemyTier enforce Sanctuary Tier 1 safety, escalation, 2.2x territorial bias, max-1 Behemoth, and underwater Stalker', () => {
  const { Enemies } = loadEnemiesHarness();
  assert.equal(Enemies.computeThreatLevel(0, 0, 0), 0);
  assert.equal(Enemies.computeThreatLevel(0, 0, 28), 0);
  assert.ok(Math.abs(Enemies.computeThreatLevel(2, 1, 66) - 3.45) < 1e-6);
  assert.equal(Enemies.computeThreatLevel(20, 20, 500), 10);

  // Solo Sanctuary (< 1.6) = 100% Tier 1 Gloomblob
  const rng1 = makeRng(42);
  for (let i = 0; i < 200; i++) {
    const picked = Enemies.pickEnemyTier(1.59, rng1, { regionId: 'sunlitRuins' });
    assert.equal(picked.key, 'classic');
  }

  // Underwater always returns Abyssal Stalker regardless of threat
  assert.equal(Enemies.pickEnemyTier(0, rng1, { underwater: true }).key, 'stalker');
  assert.equal(Enemies.pickEnemyTier(9.5, rng1, { underwater: true, regionId: 'sunkenCity' }).key, 'stalker');

  // Tier 2 unlock (>= 1.6): Puglin/Weaver/Stinger appear while Behemoth/Knight stay locked
  const rng2 = makeRng(99);
  const t2Counts = {};
  for (let i = 0; i < 400; i++) {
    const t = Enemies.pickEnemyTier(2.2, rng2, { regionId: 'whisperingForest' });
    t2Counts[t.key] = (t2Counts[t.key] || 0) + 1;
    assert.ok(t.minThreat <= 2.2 && !t.underwater);
  }
  assert.ok(t2Counts.weaver > 0 && t2Counts.puglin > 0 && t2Counts.stinger > 0);
  assert.equal(t2Counts.knight || 0, 0);
  assert.equal(t2Counts.behemoth || 0, 0);

  // Territorial affinity 2.2x boosts Whispering Forest signature beasts (weaver/puglin) vs Canyon Oasis
  const forestCounts = { weaver: 0, stinger: 0 };
  const canyonCounts = { weaver: 0, stinger: 0 };
  const rngF = makeRng(777);
  const rngC = makeRng(777);
  for (let i = 0; i < 1200; i++) {
    const tf = Enemies.pickEnemyTier(2.2, rngF, { regionId: 'whisperingForest' });
    if (tf.key === 'weaver' || tf.key === 'stinger') forestCounts[tf.key]++;
    const tc = Enemies.pickEnemyTier(2.2, rngC, { regionId: 'canyonOasis' });
    if (tc.key === 'weaver' || tc.key === 'stinger') canyonCounts[tc.key]++;
  }
  assert.ok(forestCounts.weaver > canyonCounts.weaver * 1.6, `Expected territorial bias for weaver in whisperingForest (${forestCounts.weaver} vs ${canyonCounts.weaver})`);
  assert.ok(canyonCounts.stinger > forestCounts.stinger * 1.6, `Expected territorial bias for stinger in canyonOasis (${canyonCounts.stinger} vs ${forestCounts.stinger})`);

  // High threat unlocks Behemoth, unless one is already active in existingGlooms
  const rngB = makeRng(1337);
  let sawBehemoth = false;
  for (let i = 0; i < 300; i++) {
    const t = Enemies.pickEnemyTier(7.8, rngB, { regionId: 'twilightCoast', existingGlooms: [] });
    if (t.key === 'behemoth') sawBehemoth = true;
  }
  assert.equal(sawBehemoth, true);

  const rngCap = makeRng(1337);
  for (let i = 0; i < 400; i++) {
    const t = Enemies.pickEnemyTier(8.5, rngCap, {
      regionId: 'twilightCoast',
      existingGlooms: [{ tier: Enemies.TIERS.behemoth }],
    });
    assert.notEqual(t.key, 'behemoth');
  }

  // Dead or dying Behemoths must NOT block spawning a new living Behemoth
  for (const deadEntry of [
    { tier: Enemies.TIERS.behemoth, dead: true },
    { tier: Enemies.TIERS.behemoth, hp: 0 },
    { tier: Enemies.TIERS.behemoth, hp: -2 },
    { tier: Enemies.TIERS.behemoth, state: 'death' },
    { tier: Enemies.TIERS.behemoth, state: 'dead' },
  ]) {
    const rngDead = makeRng(1337);
    let sawAfterDead = false;
    for (let i = 0; i < 300; i++) {
      const t = Enemies.pickEnemyTier(8.5, rngDead, {
        regionId: 'twilightCoast',
        existingGlooms: [deadEntry],
      });
      if (t.key === 'behemoth') sawAfterDead = true;
    }
    assert.equal(sawAfterDead, true, `Dead/dying Behemoth ${JSON.stringify(deadEntry)} must not block new Behemoth`);
  }
});

test('resolveAssetSource and preloadArchetype support dual-mode loading, coalescing, and cache reset', () => {
  const httpH = loadEnemiesHarness({ protocol: 'https:', deferLoad: true });
  assert.deepEqual({ ...httpH.Enemies.resolveAssetSource('knight', 'https:') }, {
    mode: 'glb',
    url: './assets/enemies/knight.glb',
  });
  assert.deepEqual({ ...httpH.Enemies.resolveAssetSource('behemoth', 'http:') }, {
    mode: 'glb',
    url: './assets/enemies/behemoth.glb',
  });
  assert.deepEqual({ ...httpH.Enemies.resolveAssetSource('imp', 'file:') }, {
    mode: 'file-bundle',
    url: './assets/enemies/imp.glb.js',
  });

  const got = [];
  httpH.Enemies.preloadArchetype('knight', (tpl) => got.push(tpl));
  httpH.Enemies.preloadArchetype('knight', (tpl) => got.push(tpl));
  assert.equal(httpH.calls.loadUrls.length, 1);
  assert.equal(httpH.calls.scriptsInjected.length, 0);
  httpH.flushDeferred();
  assert.equal(got.length, 2);
  assert.equal(got[0], got[1]);

  httpH.Enemies._resetCache();
  httpH.Enemies.preloadArchetype('knight', () => {});
  httpH.flushDeferred();
  assert.equal(httpH.calls.loadUrls.length, 2);

  const fileH = loadEnemiesHarness({ protocol: 'file:' });
  let fileTpl = null;
  fileH.Enemies.preloadArchetype('behemoth', (tpl) => { fileTpl = tpl; });
  assert.equal(fileH.calls.loadUrls.length, 0);
  assert.deepEqual(fileH.calls.scriptsInjected, ['./assets/enemies/behemoth.glb.js']);
  assert.equal(fileH.calls.parseCount, 1);
  assert.ok(fileTpl && fileTpl.scene);

  let classicErr = null;
  fileH.Enemies.preloadArchetype('classic', () => {}, (err) => { classicErr = err; });
  assert.ok(classicErr && typeof classicErr.message === 'string' && classicErr.message.includes('classic'));
});

test('classic Gloomblob procedural bypass and graceful GLTF fallback when loader/SkeletonUtils missing or load fails', () => {
  const classicH = loadEnemiesHarness();
  const classicRoot = classicH.Models.makeGloom(classicH.Enemies.TIERS.classic);
  const classicCtrl = classicH.Enemies.attachToGloom(classicRoot, classicH.Enemies.TIERS.classic);
  assert.equal(classicCtrl.ready, true);
  assert.equal(classicCtrl.isClassicProcedural, true);
  assert.equal(classicCtrl.archetype, 'classic');
  assert.equal(classicH.calls.loadUrls.length, 0);
  assert.ok(classicRoot.userData.proceduralRoot);
  assert.equal(classicRoot.userData.proceduralRoot.visible, true);
  assert.equal(classicRoot.userData.enemyRig, classicCtrl);

  classicCtrl.update(0.016, 1.0, { speed: 3.0, windingUp: true });
  assert.ok(classicRoot.userData.eyeMat.emissiveIntensity > 2.0);
  classicCtrl.update(0.016, 1.1, { speed: 0, hurtFlash: 0.25 });
  assert.ok(classicRoot.userData.eyeMat.emissive.r >= 0.99 && classicRoot.userData.eyeMat.emissive.g > 0.7);

  for (const opts of [{ omitLoader: true }, { omitSkeletonUtils: true }, { failLoad: true }]) {
    const h = loadEnemiesHarness(opts);
    const root = h.Models.makeGloom(h.Enemies.TIERS.knight);
    const ctrl = h.Enemies.attachToGloom(root, h.Enemies.TIERS.knight);
    assert.equal(ctrl.ready, false);
    assert.equal(ctrl.isClassicProcedural, false);
    assert.equal(root.userData.proceduralRoot.visible, true);
    ctrl.update(0.016, 0.5, { speed: 2.0, windingUp: true });
    assert.ok(root.userData.eyeMat.emissiveIntensity > 2.0);
  }
});

test('multi-instance cloning preserves wisps/halo, Bestiary PBR maps, CC0 shadow restyling, and per-instance windup/flash', () => {
  const h = loadEnemiesHarness();

  // Bestiary Imp x2: embedded maps preserved, emissiveIntensity 1.65, independent windup/flash
  const impRootA = h.Models.makeGloom(h.Enemies.TIERS.imp);
  const impRootB = h.Models.makeGloom(h.Enemies.TIERS.imp);
  const impCtrlA = h.Enemies.attachToGloom(impRootA, h.Enemies.TIERS.imp);
  const impCtrlB = h.Enemies.attachToGloom(impRootB, h.Enemies.TIERS.imp);

  assert.equal(h.calls.loadUrls.length, 1);
  assert.equal(h.calls.cloneCount, 2);
  assert.equal(h.THREE._mixers.length, 2);
  assert.notEqual(h.THREE._mixers[0], h.THREE._mixers[1]);
  assert.equal(impCtrlA.ready, true);
  assert.equal(impRootA.userData.proceduralRoot.visible, false);

  // Wisps & halo re-parented to rootMesh so shadow aura remains visible!
  assert.equal(impRootA.userData.halo.parent, impRootA);
  assert.equal(impRootA.userData.halo.visible, true);
  assert.equal(impRootA.userData.wisps[0].parent, impRootA);
  assert.equal(impRootA.userData.wisps[0].visible, true);

  let impMeshA = null;
  let impMeshB = null;
  impRootA.traverse((o) => { if (o.isSkinnedMesh) impMeshA = o; });
  impRootB.traverse((o) => { if (o.isSkinnedMesh) impMeshB = o; });
  assert.equal(impMeshA.castShadow, true);
  assert.equal(impMeshA.receiveShadow, true);
  assert.equal(impMeshA.frustumCulled, false);
  assert.equal(impMeshA.material.skinning, true);
  assert.equal(impMeshA.material.map.tag, 'imp_BaseColor');
  assert.equal(impMeshA.material.normalMap.tag, 'imp_Normal');
  assert.equal(impMeshA.material.roughnessMap.tag, 'imp_ORM');
  assert.equal(impMeshA.material.emissiveMap.tag, 'imp_Emissive');
  assert.ok(Math.abs(impMeshA.material.emissiveIntensity - 1.65) < 1e-4);
  assert.notEqual(impMeshA.material, impMeshB.material);

  impCtrlA.update(0.016, 0.4, { speed: 0, windingUp: true });
  impCtrlB.update(0.016, 0.4, { speed: 0 });
  assert.ok(impMeshA.material.emissiveIntensity > 2.2);
  assert.ok(impMeshA.material.emissive.r > 0.9 && impMeshA.material.emissive.g < 0.35);
  assert.ok(Math.abs(impMeshB.material.emissiveIntensity - 1.65) < 1e-4);

  impCtrlA.update(0.016, 0.42, { speed: 0, hurtFlash: 0.25 });
  assert.ok(impMeshA.material.emissiveIntensity > 3.5);
  assert.ok(impMeshA.material.emissive.g > 0.7);

  // CC0 Weaver, Stinger, Knight, Behemoth, Stalker restyled with Textures.sets + glowing eye/accent slots
  for (const key of ['weaver', 'stinger', 'knight', 'behemoth', 'stalker']) {
    const root = h.Models.makeGloom(h.Enemies.TIERS[key]);
    const ctrl = h.Enemies.attachToGloom(root, h.Enemies.TIERS[key]);
    assert.equal(ctrl.ready, true);
    let skinnedCount = 0;
    let hasExpectedTex = false;
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        skinnedCount++;
        assert.equal(o.material.skinning, true);
        assert.equal(o.frustumCulled, false);
        assert.equal(o.castShadow, true);
        assert.equal(o.receiveShadow, true);
        if (o.material.map && (o.material.map.tag === 'scalesMap' || o.material.map.tag === 'stoneMap' || o.material.map.tag === 'clothMap')) {
          hasExpectedTex = true;
        }
      }
    });
    assert.ok(skinnedCount > 0);
    assert.equal(hasExpectedTex, true, `${key} should apply Textures.sets PBR map`);
  }

  // CC0 Knight multi-instance windup/flash independence on glowing Skin visor/accent material
  const kA = h.Models.makeGloom(h.Enemies.TIERS.knight);
  const kB = h.Models.makeGloom(h.Enemies.TIERS.knight);
  const kCtrlA = h.Enemies.attachToGloom(kA, h.Enemies.TIERS.knight);
  const kCtrlB = h.Enemies.attachToGloom(kB, h.Enemies.TIERS.knight);
  let kEyeA = null;
  let kEyeB = null;
  kA.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'Skin') kEyeA = o.material; });
  kB.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'Skin') kEyeB = o.material; });
  assert.ok(kEyeA && kEyeB && kEyeA !== kEyeB);
  kCtrlA.update(0.016, 0.5, { speed: 0, windingUp: true });
  kCtrlB.update(0.016, 0.5, { speed: 0 });
  assert.ok(kEyeA.emissiveIntensity > 2.2);
  assert.ok(Math.abs(kEyeB.emissiveIntensity - 0.16) < 1e-4);
});

test('bone attachments mount ShadowBlade & DreadCrown on Knight and BehemothSpines on Behemoth with accumulated scale compensation', () => {
  const h = loadEnemiesHarness();

  const knightRoot = h.Models.makeGloom(h.Enemies.TIERS.knight);
  h.Enemies.attachToGloom(knightRoot, h.Enemies.TIERS.knight);
  let blade = null;
  let crown = null;
  knightRoot.traverse((o) => {
    if (o.name === 'ShadowBlade') blade = o;
    if (o.name === 'DreadCrown') crown = o;
  });
  assert.ok(blade, 'Expected ShadowBlade attached on Knight');
  assert.ok(crown, 'Expected DreadCrown attached on Knight');
  assert.equal(blade.parent.name, 'Palm.R');
  assert.equal(crown.parent.name, 'Head');
  // Knight EnemyRoot(0.3661) * HumanArmature(100) = 36.61 -> invS ~= 0.027316
  const invKnight = 1 / 36.61;
  assert.ok(Math.abs(blade.scale.x - 1.15 * invKnight) < 1e-4, `Expected compensated blade scale, got ${blade.scale.x}`);
  assert.ok(Math.abs(crown.scale.x - 1.85 * invKnight) < 1e-4, `Expected compensated crown scale, got ${crown.scale.x}`);

  const behRoot = h.Models.makeGloom(h.Enemies.TIERS.behemoth);
  h.Enemies.attachToGloom(behRoot, h.Enemies.TIERS.behemoth);
  let spines = null;
  behRoot.traverse((o) => { if (o.name === 'BehemothSpines') spines = o; });
  assert.ok(spines, 'Expected BehemothSpines attached on Behemoth');
  assert.equal(spines.parent.name, 'Torso');
  // Behemoth EnemyRoot(0.1872) * Armature(300) = 56.16 -> invS ~= 0.017806
  const invBeh = 1 / (0.1872 * 300);
  assert.ok(Math.abs(spines.scale.x - 1.95 * invBeh) < 1e-4, `Expected compensated spines scale, got ${spines.scale.x}`);
  assert.ok(Math.abs(spines.rotation.x - Math.PI * 0.5) < 1e-4);
  assert.ok(Math.abs(spines.rotation.y - Math.PI) < 1e-4);

  // Fallback to LowerArm.R if Palm.R missing
  const hFallback = loadEnemiesHarness({ gltfOpts: { omitPalmR: true } });
  const kRoot2 = hFallback.Models.makeGloom(hFallback.Enemies.TIERS.knight);
  hFallback.Enemies.attachToGloom(kRoot2, hFallback.Enemies.TIERS.knight);
  let blade2 = null;
  kRoot2.traverse((o) => { if (o.name === 'ShadowBlade') blade2 = o; });
  assert.equal(blade2?.parent?.name, 'LowerArm.R');
});

test('semantic clip routing, shared-clip one-shot LoopRepeat resumption, head look-at, and zero-GC hot update', () => {
  const h = loadEnemiesHarness();

  const findAct = (mixer, clipName) => {
    for (const act of mixer.actions.values()) {
      if (act.getClip().name === clipName) return act;
    }
    return null;
  };

  // Knight: Idle_swordRight, Walking, Run_swordRight, Run_swordAttack, swordAttackJump, Roll_sword, hit->Idle_swordRight (shared!)
  const knightRoot = h.Models.makeGloom(h.Enemies.TIERS.knight);
  const knightCtrl = h.Enemies.attachToGloom(knightRoot, h.Enemies.TIERS.knight);
  const knightMixer = h.THREE._mixers[0];

  assert.equal(knightCtrl.state.clip, 'idle');
  assert.equal(findAct(knightMixer, 'HumanArmature|Idle_swordRight').playing, true);

  knightCtrl.update(0.016, 0.1, { mode: 'walk', speed: 2.3, refSpeed: 2.3, isMoving: true });
  assert.equal(knightCtrl.state.clip, 'walk');

  knightCtrl.update(0.016, 0.2, { mode: 'run', speed: 12.0, refSpeed: 4.5, isMoving: true });
  assert.equal(knightCtrl.state.clip, 'run');
  assert.equal(knightCtrl.state.timeScale, 2.35);

  knightCtrl.triggerOneShot('heavyAttack', 0.20);
  knightCtrl.update(0.016, 0.25, { mode: 'idle', speed: 0 });
  assert.equal(knightCtrl.state.clip, 'heavyAttack');
  assert.ok(findAct(knightMixer, 'HumanArmature|swordAttackJump').playing);

  // Return to idle (stepDt clamps dt to 0.1s per call, so 2 x 0.1s steps clear 0.20s one-shot),
  // then test shared-clip hit aliasing Idle_swordRight!
  knightCtrl.update(0.10, 0.35, { mode: 'idle', speed: 0 });
  knightCtrl.update(0.10, 0.45, { mode: 'idle', speed: 0 });
  assert.equal(knightCtrl.state.clip, 'idle');
  const idleSwordAct = findAct(knightMixer, 'HumanArmature|Idle_swordRight');

  // Duration of mock clip is 0.8s; trigger hit for 1.0s so LoopOnce hits clip end & pauses
  knightCtrl.triggerOneShot('hit', 1.0);
  assert.equal(knightCtrl.state.clip, 'hit');
  assert.equal(idleSwordAct.loop, h.THREE.LoopOnce);
  assert.equal(idleSwordAct.clampWhenFinished, true);

  for (let i = 0; i < 9; i++) {
    knightCtrl.update(0.1, 0.65 + i * 0.1, { mode: 'idle', speed: 0 });
  }
  assert.equal(idleSwordAct.paused, true);

  // Expire hit -> must restore LoopRepeat, paused=false, enabled=true, clampWhenFinished=false
  knightCtrl.update(0.15, 1.6, { mode: 'idle', speed: 0 });
  knightCtrl.update(0.05, 1.65, { mode: 'idle', speed: 0 });
  assert.equal(knightCtrl.state.clip, 'idle');
  assert.equal(idleSwordAct.loop, h.THREE.LoopRepeat);
  assert.equal(idleSwordAct.paused, false);
  assert.equal(idleSwordAct.enabled, true);
  assert.equal(idleSwordAct.clampWhenFinished, false);
  const tBefore = idleSwordAct.time;
  knightCtrl.update(0.05, 1.70, { mode: 'idle', speed: 0 });
  assert.ok(idleSwordAct.time > tBefore);

  // Stinger aerial defaults to Flying, attacks with Bite_Front, hits with HitRecieve
  const stingerRoot = h.Models.makeGloom(h.Enemies.TIERS.stinger);
  const stingerCtrl = h.Enemies.attachToGloom(stingerRoot, h.Enemies.TIERS.stinger);
  const stingerMixer = h.THREE._mixers[1];
  assert.equal(stingerCtrl.state.clip, 'fly');
  assert.equal(findAct(stingerMixer, 'MonsterArmature|Flying').playing, true);
  stingerCtrl.triggerOneShot('attack', 0.2);
  stingerCtrl.update(0.016, 0.1, { speed: 5.2 });
  assert.equal(stingerCtrl.state.clip, 'attack');
  assert.equal(findAct(stingerMixer, 'MonsterArmature|Bite_Front').playing, true);

  // Stalker uses Bite_InPlace for heavyAttack
  const stalkerRoot = h.Models.makeGloom(h.Enemies.TIERS.stalker);
  const stalkerCtrl = h.Enemies.attachToGloom(stalkerRoot, h.Enemies.TIERS.stalker);
  const stalkerMixer = h.THREE._mixers[2];
  stalkerCtrl.triggerOneShot('heavyAttack', 0.25);
  stalkerCtrl.update(0.016, 0.1, { speed: 0 });
  assert.equal(findAct(stalkerMixer, 'MonsterArmature|Bite_InPlace').playing, true);

  // Look-at bounded damping on Behemoth (Z-up head) & Knight (Y-up head)
  const behRoot = h.Models.makeGloom(h.Enemies.TIERS.behemoth);
  const behCtrl = h.Enemies.attachToGloom(behRoot, h.Enemies.TIERS.behemoth);
  let behHead = null;
  behRoot.traverse((o) => { if (o.name === 'Head') behHead = o; });
  behCtrl.setLookTarget(4, 3.0, 4);
  for (let i = 0; i < 25; i++) {
    behCtrl.update(0.016, i * 0.016, { mode: 'idle', speed: 0, posX: 0, posY: 0, posZ: 0, facingYaw: 0 });
  }
  assert.ok(Math.abs(behHead.quaternion.z) > 0.05, 'Expected Z-up Head lookYaw applied on quaternion.z');

  // Death holds final pose
  behCtrl.triggerOneShot('death');
  behCtrl.update(0.016, 1.0, { mode: 'idle', speed: 0 });
  assert.equal(behCtrl.state.clip, 'death');
  const behDeathAct = findAct(h.THREE._mixers[3], 'Armature|TRex_Death');
  assert.equal(behDeathAct.loop, h.THREE.LoopOnce);
  assert.equal(behDeathAct.clampWhenFinished, true);

  // Zero-GC hot update verification across 120 frames
  h.THREE._resetAllocs();
  knightCtrl.triggerOneShot('attack', 0.25);
  knightCtrl.setLookTarget(3, 1.5, 4);
  for (let f = 0; f < 120; f++) {
    knightCtrl.update(0.016, 2.0 + f * 0.016, {
      mode: f % 40 < 20 ? 'walk' : 'run',
      speed: f % 40 < 20 ? 2.3 : 4.5,
      refSpeed: 2.3,
      isMoving: true,
      facingYaw: 0.2,
      posX: f * 0.05,
      posY: 0,
      posZ: 0,
      windingUp: f >= 30 && f <= 50,
      hurtFlash: f === 10 ? 0.25 : 0,
    });
  }
  assert.equal(h.THREE._allocs.vec3, 0, 'Zero Vector3 allocations in hot update()');
  assert.equal(h.THREE._allocs.quat, 0, 'Zero Quaternion allocations in hot update()');
  assert.equal(h.THREE._allocs.euler, 0, 'Zero Euler allocations in hot update()');
  assert.equal(h.THREE._allocs.color, 0, 'Zero Color allocations in hot update()');
});

test('Puglin Bestiary PBR, Weaver/Behemoth shared-clip LoopRepeat resumption, and real disk GLB clip/bone parity', () => {
  const h = loadEnemiesHarness();

  // Puglin preserves embedded PBR maps and routes Attack/HeavyAttack/HitReact
  const pugRoot = h.Models.makeGloom(h.Enemies.TIERS.puglin);
  const pugCtrl = h.Enemies.attachToGloom(pugRoot, h.Enemies.TIERS.puglin);
  let pugMesh = null;
  pugRoot.traverse((o) => { if (o.isSkinnedMesh) pugMesh = o; });
  assert.equal(pugCtrl.ready, true);
  assert.equal(pugMesh.material.map.tag, 'puglin_BaseColor');
  assert.equal(pugMesh.material.emissiveMap.tag, 'puglin_Emissive');
  assert.ok(Math.abs(pugMesh.material.emissiveIntensity - 1.65) < 1e-4);

  // Weaver shared-clip: hit aliases Spider_Idle
  const weaverRoot = h.Models.makeGloom(h.Enemies.TIERS.weaver);
  const weaverCtrl = h.Enemies.attachToGloom(weaverRoot, h.Enemies.TIERS.weaver);
  const weaverMixer = h.THREE._mixers[1];
  let spiderIdleAct = null;
  for (const act of weaverMixer.actions.values()) {
    if (act.getClip().name === 'SpiderArmature|Spider_Idle') spiderIdleAct = act;
  }
  weaverCtrl.triggerOneShot('hit', 0.85);
  for (let i = 0; i < 8; i++) weaverCtrl.update(0.1, 0.1 + i * 0.1, { mode: 'idle', speed: 0 });
  assert.equal(spiderIdleAct.paused, true);
  weaverCtrl.update(0.1, 0.9, { mode: 'idle', speed: 0 });
  weaverCtrl.update(0.05, 0.95, { mode: 'idle', speed: 0 });
  assert.equal(weaverCtrl.state.clip, 'idle');
  assert.equal(spiderIdleAct.loop, h.THREE.LoopRepeat);
  assert.equal(spiderIdleAct.paused, false);
  assert.equal(spiderIdleAct.clampWhenFinished, false);

  // Verify real compiled GLBs on disk have exact matching attachment bones & clips
  for (const key of h.Enemies.ARCHETYPE_KEYS) {
    const buf = fs.readFileSync(new URL(`../assets/enemies/${key}.glb`, import.meta.url));
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    const nodeNames = new Set((gltf.nodes || []).map((n) => n.name));
    const clipNames = (gltf.animations || []).map((a) => a.name);
    assert.ok(clipNames.length >= 4, `${key}.glb must contain animations`);
    if (key === 'knight') {
      assert.ok(nodeNames.has('Palm.R') && nodeNames.has('Head'), 'knight.glb must contain Palm.R and Head');
    } else if (key === 'behemoth') {
      assert.ok(nodeNames.has('Torso'), 'behemoth.glb must contain Torso');
    }
  }
});

test('pre-ready queued one-shot sharing activeAction sets LoopOnce cleanly, and Headbutt/Punch/Wave Ultimate Monsters aliases route properly', () => {
  // 1. Pre-ready queued one-shot (hit & death) aliasing idle on deferred knight load
  const defH = loadEnemiesHarness({ deferLoad: true });
  const kRoot = defH.Models.makeGloom(defH.Enemies.TIERS.knight);
  const kCtrl = defH.Enemies.attachToGloom(kRoot, defH.Enemies.TIERS.knight);
  assert.equal(kCtrl.ready, false);

  kCtrl.triggerOneShot('hit', 0.45);
  defH.flushDeferred();
  assert.equal(kCtrl.ready, true);
  kCtrl.update(0.016, 0.1, { mode: 'idle', speed: 0 });
  const kMixer = defH.THREE._mixers[0];
  let kIdleAct = null;
  for (const act of kMixer.actions.values()) {
    if (act.getClip().name === 'HumanArmature|Idle_swordRight') kIdleAct = act;
  }
  assert.equal(kCtrl.state.clip, 'hit');
  assert.equal(kIdleAct.loop, defH.THREE.LoopOnce);
  assert.equal(kIdleAct.clampWhenFinished, true);
  assert.equal(kIdleAct.paused, false);
  assert.equal(kIdleAct.enabled, true);

  // Pre-ready queued death one-shot sharing idle (custom clip set with only Idle)
  const defDeathH = loadEnemiesHarness({ deferLoad: true });
  defDeathH.Enemies._resetCache();
  const CustomLoader = defDeathH.THREE.GLTFLoader;
  defDeathH.THREE.GLTFLoader = class extends CustomLoader {
    load(url, onLoad, onProg, onErr) {
      return super.load(url, (gltf) => {
        gltf.animations = [{ name: 'MonsterArmature|Idle', duration: 0.8, tracks: [] }];
        onLoad(gltf);
      }, onProg, onErr);
    }
  };
  const dRoot = defDeathH.Models.makeGloom(defDeathH.Enemies.TIERS.weaver);
  const dCtrl = defDeathH.Enemies.attachToGloom(dRoot, defDeathH.Enemies.TIERS.weaver);
  dCtrl.triggerOneShot('death');
  defDeathH.flushDeferred();
  const dMixer = defDeathH.THREE._mixers[0];
  const dIdleAct = [...dMixer.actions.values()][0];
  dIdleAct.time = 0.5;
  dCtrl.update(0.016, 0.2, { mode: 'idle', speed: 0 });
  assert.equal(dCtrl.state.clip, 'death');
  assert.equal(dIdleAct.loop, defDeathH.THREE.LoopOnce);
  assert.equal(dIdleAct.clampWhenFinished, true);
  assert.ok(dIdleAct.time < 0.1, 'Pre-ready queued death sharing activeAction must reset and replay cleanly');

  // 2. Ultimate Monsters clip aliases: Headbutt, Punch, Wave
  const umH = loadEnemiesHarness();
  umH.Enemies._resetCache();
  const UmLoader = umH.THREE.GLTFLoader;
  umH.THREE.GLTFLoader = class extends UmLoader {
    load(url, onLoad, onProg, onErr) {
      return super.load(url, (gltf) => {
        gltf.animations = [
          { name: 'MonsterArmature|Idle', duration: 0.8, tracks: [] },
          { name: 'MonsterArmature|Walk', duration: 0.8, tracks: [] },
          { name: 'MonsterArmature|Punch', duration: 0.6, tracks: [] },
          { name: 'MonsterArmature|Headbutt', duration: 0.7, tracks: [] },
          { name: 'MonsterArmature|Wave', duration: 0.6, tracks: [] },
          { name: 'MonsterArmature|Death', duration: 0.9, tracks: [] },
        ];
        onLoad(gltf);
      }, onProg, onErr);
    }
  };
  const umRoot = umH.Models.makeGloom(umH.Enemies.TIERS.puglin);
  const umCtrl = umH.Enemies.attachToGloom(umRoot, umH.Enemies.TIERS.puglin);
  const umMixer = umH.THREE._mixers[0];
  const findUm = (n) => [...umMixer.actions.values()].find((a) => a.getClip().name === n);

  umCtrl.triggerOneShot('attack', 0.2);
  umCtrl.update(0.016, 0.1, { mode: 'idle', speed: 0 });
  assert.equal(findUm('MonsterArmature|Punch').playing, true);

  umCtrl.triggerOneShot('heavyAttack', 0.2);
  umCtrl.update(0.016, 0.2, { mode: 'idle', speed: 0 });
  assert.equal(findUm('MonsterArmature|Headbutt').playing, true);

  umCtrl.triggerOneShot('hit', 0.2);
  umCtrl.update(0.016, 0.3, { mode: 'idle', speed: 0 });
  assert.equal(findUm('MonsterArmature|Wave').playing, true);

  // Also verify Headbutt alone (without Punch) resolves attack!
  umH.Enemies._resetCache();
  umH.THREE.GLTFLoader = class extends UmLoader {
    load(url, onLoad, onProg, onErr) {
      return super.load(url, (gltf) => {
        gltf.animations = [
          { name: 'MonsterArmature|Idle', duration: 0.8, tracks: [] },
          { name: 'MonsterArmature|Headbutt', duration: 0.7, tracks: [] },
          { name: 'MonsterArmature|Wave', duration: 0.6, tracks: [] },
        ];
        onLoad(gltf);
      }, onProg, onErr);
    }
  };
  const hbRoot = umH.Models.makeGloom(umH.Enemies.TIERS.weaver);
  const hbCtrl = umH.Enemies.attachToGloom(hbRoot, umH.Enemies.TIERS.weaver);
  const hbMixer = umH.THREE._mixers[1];
  hbCtrl.triggerOneShot('attack', 0.2);
  hbCtrl.update(0.016, 0.1, { mode: 'idle', speed: 0 });
  assert.equal([...hbMixer.actions.values()].find((a) => a.getClip().name === 'MonsterArmature|Headbutt').playing, true);
});

// ============================================================
// Task 4 Tests: EnemyPhysics, Combat AI, Telegraph Pool, Underwater Stalkers
// ============================================================

function makeCombatCtx(h, overrides = {}) {
  const added = [];
  const removed = [];
  const bursts = [];
  const toasts = [];
  const quests = [];
  const heartDrops = [];
  const addedFollowers = [];
  const playerDmgCalls = [];
  const allyDmgCalls = [];
  const celebrates = [];
  const shockwaves = [];
  let lockValidations = 0;

  const scene = {
    addCalls: 0,
    add(obj) {
      this.addCalls++;
      added.push(obj);
    },
    remove(obj) {
      removed.push(obj);
    },
  };

  const Physics = {
    validateLockTarget() { lockValidations++; },
    turnToward(obj, targetYaw, dt, rate) {
      if (!obj || !obj.rotation) return;
      let diff = targetYaw - obj.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      obj.rotation.y += diff * Math.min(1, dt * rate);
    },
    resolveColliders(x, z, _r, colliders, out, footY) {
      out.x = x;
      out.z = z;
      out.hit = false;
      if (!colliders || !colliders.length) return out;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (typeof footY === 'number' && typeof c.topY === 'number' && footY >= c.topY - 0.18) continue;
        const minD = (_r || 0.65) + (c.r || 0.5);
        const dx = out.x - c.x;
        const dz = out.z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD) {
          out.hit = true;
          const d = Math.sqrt(d2) || 0.001;
          out.x += (dx / d) * (minD - d);
          out.z += (dz / d) * (minD - d);
        }
      }
      return out;
    },
    addCameraShake() {},
  };

  const P = { x: 0, y: 2, z: 0, hp: 12, maxHp: 12, dead: false, invulnT: 0, hurtInvulnT: 0, swimming: false };
  const followers = [];
  const glooms = [];
  const pickups = [];

  const ctx = {
    THREE: h.THREE,
    Models: h.Models,
    Textures: h.Textures,
    Shaders: h.Shaders,
    Physics,
    Sound: { hitImpact() {}, poof() {}, slam() {}, hurt() {} },
    Animals: {
      celebrate(fl) { celebrates.push(fl.length); },
    },
    scene,
    P,
    home: { x: 0, z: 0 },
    lit: 0,
    WATER_Y: 0,
    followers,
    glooms,
    pickups,
    heightAt: () => 2.0,
    surfaceAt: () => 'grass',
    getNearbyColliders: (_x, _z, _r, out) => { out.length = 0; },
    burst: (x, y, z, col, cnt) => bursts.push({ x, y, z, col, cnt }),
    dustBurst: () => {},
    toast: (msg) => toasts.push(msg),
    questEvent: (ev) => quests.push(ev),
    spawnHeartDrop: (x, y, z) => heartDrops.push({ x, y, z }),
    addFollower: (x, y, z, msg) => addedFollowers.push({ x, y, z, msg }),
    triggerShockwaveVfx: (x, y, z, r, col) => shockwaves.push({ x, y, z, r, col }),
    damagePlayer: (amt, src, kx, kz) => {
      playerDmgCalls.push({ amt, src, kx, kz });
      P.hp = Math.max(0, P.hp - amt);
      return true;
    },
    damageCompanion: (ally, amt, kx, kz, attacker) => {
      allyDmgCalls.push({ ally, amt, kx, kz, attacker });
      ally.hp = Math.max(0, ally.hp - amt);
      return true;
    },
    rng: () => 0.99,
    ...overrides,
  };

  return {
    ctx,
    scene,
    P,
    followers,
    glooms,
    pickups,
    logs: { added, removed, bursts, toasts, quests, heartDrops, addedFollowers, playerDmgCalls, allyDmgCalls, celebrates, shockwaves, getLockValidations: () => lockValidations },
  };
}

test('createGloomState contract, Behemoth band HP scaling, and initTelegraphPool zero runtime scene.add', () => {
  const h = loadEnemiesHarness();
  const { ctx, scene, glooms } = makeCombatCtx(h);

  // Classic Tier 1 contract check
  const classicMesh = h.Models.makeGloom(h.Enemies.TIERS.classic);
  h.Enemies.attachToGloom(classicMesh, h.Enemies.TIERS.classic);
  const gc = h.Enemies.createGloomState(classicMesh, h.Enemies.TIERS.classic, 4, 2, 6);
  assert.equal(gc.hp, 3);
  assert.equal(gc.maxHp, 3);
  assert.equal(gc.archetype, 'classic');
  assert.equal(gc.name, 'Gloomblob');
  assert.equal(gc.knockResist, 1.0);
  assert.equal(gc.dmgPlayer, 2);
  assert.equal(gc.dmgAlly, 1);
  assert.equal(gc.aoeRadius, 0);
  assert.equal(gc.phys.onGround, true);
  assert.equal(gc.phys.airLift, 0);
  assert.equal(gc.phys.rollCd, 0);
  assert.equal(gc.lockCand.kind, 'gloom');
  assert.equal(gc.lockCand.ref, gc);
  assert.equal(gc.lockCand.yOffset, h.Enemies.TIERS.classic.yOffset);
  assert.equal(gc.lookCand.maxDist, 14);
  assert.equal(gc.mesh.rotation.order, 'YXZ');

  // Aerial Stinger phys defaults
  const stMesh = h.Models.makeGloom(h.Enemies.TIERS.stinger);
  const gs = h.Enemies.createGloomState(stMesh, h.Enemies.TIERS.stinger, 0, 4.2, 0);
  assert.equal(gs.phys.onGround, false);
  assert.equal(gs.phys.airLift, 2.2);

  // Behemoth HP scaling: 14 base for <=5 followers, +1 per ally >5 capped at 18
  const behMesh = h.Models.makeGloom(h.Enemies.TIERS.behemoth);
  h.Enemies.attachToGloom(behMesh, h.Enemies.TIERS.behemoth);
  assert.equal(h.Enemies.createGloomState(behMesh, h.Enemies.TIERS.behemoth, 0, 2, 0, { followersCount: 3 }).maxHp, 14);
  assert.equal(h.Enemies.createGloomState(behMesh, h.Enemies.TIERS.behemoth, 0, 2, 0, { followersCount: 5 }).maxHp, 14);
  assert.equal(h.Enemies.createGloomState(behMesh, h.Enemies.TIERS.behemoth, 0, 2, 0, { followersCount: 7 }).maxHp, 16);
  const gb = h.Enemies.createGloomState(behMesh, h.Enemies.TIERS.behemoth, 0, 2, 12, { followersCount: 11 });
  assert.equal(gb.maxHp, 18);
  assert.equal(gb.hp, 18);

  // Telegraph ring pool added ONCE at init, ZERO scene.add during updateGlooms
  const pool = h.Enemies.initTelegraphPool(scene, h.Models, 4);
  assert.equal(pool.length, 4);
  assert.equal(scene.addCalls, 4);
  for (const ring of pool) assert.equal(ring.visible, false);

  gb.state = 'windup';
  gb.stateT = 0.41; // halfway through 0.82s windup
  glooms.push(gb);
  scene.addCalls = 0;

  h.Enemies.updateGlooms(glooms, 0.016, 1.0, ctx);
  assert.equal(scene.addCalls, 0, 'updateGlooms MUST perform zero scene.add calls');
  assert.equal(pool[0].visible, true, 'Charging Behemoth should activate pooled telegraph ring');
  assert.ok(Math.abs(pool[0].scale.x - 4.8) < 1e-4);
  assert.ok(pool[0].userData.innerDisc.scale.x > 0.45);
  assert.equal(pool[1].visible, false);

  // Exiting windup hides the pooled ring cleanly
  gb.state = 'recover';
  gb.stateT = 0.5;
  h.Enemies.updateGlooms(glooms, 0.016, 1.05, ctx);
  assert.equal(pool[0].visible, false);
});

test('onGloomHit enforces heavy poise, scaled knockback resistance, evasive dodge-rolls, and scaled death loot/celebrate', () => {
  const h = loadEnemiesHarness();
  const { ctx, followers, glooms, pickups, logs } = makeCombatCtx(h);
  followers.push(
    { mesh: new h.THREE.Group('Ally1'), hp: 3, maxHp: 3, phys: {} },
    { mesh: new h.THREE.Group('Ally2'), hp: 3, maxHp: 3, phys: {} }
  );

  // 1. Classic Tier 1 Gloomblob: interrupted on melee/heavy, 3 hits defeat + stale index guard + validateLockTarget
  const cMesh = h.Models.makeGloom(h.Enemies.TIERS.classic);
  h.Enemies.attachToGloom(cMesh, h.Enemies.TIERS.classic);
  const gc = h.Enemies.createGloomState(cMesh, h.Enemies.TIERS.classic, 0, 2, 5);
  gc.state = 'windup';
  gc.stateT = 0.35;
  glooms.push(gc);

  h.Enemies.onGloomHit(gc, 0, { x: 0, z: 1 }, 1, true, false, ctx);
  assert.equal(gc.hp, 2);
  assert.equal(gc.state, 'recover', 'Classic Gloomblob windup interrupted by melee');
  assert.ok(gc.kz > 10 && gc.ky >= 4.4);

  h.Enemies.onGloomHit(gc, 0, { x: 0, z: 1 }, 1, false, false, ctx);
  assert.equal(gc.hp, 1);
  // Deliberately pass stale index 99 to ensure indexOf fallback splices safely
  h.Enemies.onGloomHit(gc, 99, { x: 0, z: 1 }, 1, false, false, ctx);
  assert.equal(glooms.length, 0);
  assert.equal(pickups.length, 2, 'Classic defeat spawns 2 star pickups');
  assert.deepEqual(logs.quests, ['bop']);
  assert.ok(logs.getLockValidations() >= 1);

  // 2. Dread Knight & Eclipse Behemoth: heavy poise ignores light windup hits, breaks on heavy, scaled knockback
  const kMesh = h.Models.makeGloom(h.Enemies.TIERS.knight);
  h.Enemies.attachToGloom(kMesh, h.Enemies.TIERS.knight);
  const gk = h.Enemies.createGloomState(kMesh, h.Enemies.TIERS.knight, 0, 2, 6);
  gk.state = 'windup';
  gk.stateT = 0.45;
  glooms.push(gk);

  h.Enemies.onGloomHit(gk, 0, { x: 0, z: 1 }, 1, false, false, ctx);
  assert.equal(gk.state, 'windup', 'Dread Knight ignores light Star Bolt windup interruption');
  const knightKzAfterLight = gk.kz;
  assert.ok(knightKzAfterLight < 6.0, `Expected reduced knight knockback (0.45x), got ${knightKzAfterLight}`);

  h.Enemies.onGloomHit(gk, 0, { x: 0, z: 1 }, 1, true, false, ctx);
  assert.equal(gk.state, 'windup', 'Dread Knight ignores 1-dmg light melee interruption');

  h.Enemies.onGloomHit(gk, 0, { x: 0, z: 1 }, 2, true, true, ctx);
  assert.equal(gk.state, 'recover', 'Heavy hit breaks Dread Knight poise into recover');

  // Dread Knight also dodge-rolls on ranged Star Bolt hit once recovered
  gk.state = 'chase';
  h.Enemies.onGloomHit(gk, 0, { x: 0, z: 1 }, 1, false, false, ctx);
  assert.equal(gk.state, 'roll', 'Dread Knight triggers lateral roll on ranged Star Bolt hit');
  assert.ok(Math.abs(gk.phys.rollCd - 3.2) < 1e-4);
  assert.equal(kMesh.userData.enemyRig.state.oneShot, 'roll');

  // 3. Cinder Imp & Dread Knight evasive lateral roll on ranged non-melee hit
  const impMesh = h.Models.makeGloom(h.Enemies.TIERS.imp);
  h.Enemies.attachToGloom(impMesh, h.Enemies.TIERS.imp);
  const gi = h.Enemies.createGloomState(impMesh, h.Enemies.TIERS.imp, 0, 2, 6);
  gi.state = 'chase';
  glooms.push(gi);

  // Melee hit must NOT trigger roll
  h.Enemies.onGloomHit(gi, 1, { x: 0, z: 1 }, 1, true, false, ctx);
  assert.notEqual(gi.state, 'roll');

  // Ranged Star Bolt hit MUST trigger lateral roll with 3.2s cooldown
  h.Enemies.onGloomHit(gi, 1, { x: 0, z: 1 }, 1, false, false, ctx);
  assert.equal(gi.state, 'roll');
  assert.ok(Math.abs(gi.stateT - 0.42) < 1e-4);
  assert.ok(Math.abs(gi.phys.rollCd - 3.2) < 1e-4);
  assert.equal(impMesh.userData.enemyRig.state.oneShot, 'roll');

  // Step updateGlooms during roll -> moves laterally
  const xBeforeRoll = gi.mesh.position.x;
  h.Enemies.updateGlooms([gi], 0.05, 2.0, ctx);
  assert.ok(Math.abs(gi.mesh.position.x - xBeforeRoll) > 0.15, 'Imp should laterally dodge-roll');

  // 4. Behemoth scaled knockback (0.22x), heavy poise, 8 stars + 2 hearts + celebrate + emoji-free victory toast
  const bMesh = h.Models.makeGloom(h.Enemies.TIERS.behemoth);
  h.Enemies.attachToGloom(bMesh, h.Enemies.TIERS.behemoth);
  const gb = h.Enemies.createGloomState(bMesh, h.Enemies.TIERS.behemoth, 0, 2, 10);
  gb.state = 'windup';
  gb.stateT = 0.70;
  glooms.push(gb);

  h.Enemies.onGloomHit(gb, 2, { x: 0, z: 1 }, 1, false, false, ctx);
  assert.equal(gb.state, 'windup');
  assert.ok(gb.kz < 3.0, `Expected Behemoth 0.22x knockback (<3.0), got ${gb.kz}`);

  pickups.length = 0;
  logs.heartDrops.length = 0;
  h.Enemies.onGloomHit(gb, 2, { x: 0, z: 1 }, gb.hp, true, true, ctx);
  assert.equal(pickups.length, 8, 'Behemoth defeat spawns 8 star pickups');
  assert.equal(logs.heartDrops.length, 2, 'Behemoth defeat spawns 2 heart drops');
  assert.deepEqual(logs.celebrates, [2], 'Behemoth defeat triggers Animals.celebrate(followers)');
  assert.equal(logs.toasts.includes('The Eclipse Behemoth has been vanquished!'), true);
});

test('Dread Knight front-arc cleave and Eclipse Behemoth 4.8u radial Shockwave Slam challenge companion packs', () => {
  const h = loadEnemiesHarness();

  // 1. Dread Knight 2.8u front-arc cleave hits Starkeeper + clustered front allies, spares rear ally
  {
    const { ctx, P, followers, glooms, logs } = makeCombatCtx(h);
    P.x = 0; P.z = 2.0;
    const frontAllyA = { mesh: new h.THREE.Group('FrontA'), hp: 3, maxHp: 3, phys: {} };
    frontAllyA.mesh.position.set(0.9, 2, 1.8);
    const frontAllyB = { mesh: new h.THREE.Group('FrontB'), hp: 3, maxHp: 3, phys: {} };
    frontAllyB.mesh.position.set(-0.9, 2, 1.8);
    const rearAlly = { mesh: new h.THREE.Group('Rear'), hp: 3, maxHp: 3, phys: {} };
    rearAlly.mesh.position.set(0, 2, -2.0);
    followers.push(frontAllyA, frontAllyB, rearAlly);

    const kMesh = h.Models.makeGloom(h.Enemies.TIERS.knight);
    h.Enemies.attachToGloom(kMesh, h.Enemies.TIERS.knight);
    const gk = h.Enemies.createGloomState(kMesh, h.Enemies.TIERS.knight, 0, 2, 0, { dir: 0 });
    gk.state = 'windup';
    gk.stateT = 0.02;
    glooms.push(gk);

    for (let f = 0; f < 10; f++) {
      h.Enemies.updateGlooms(glooms, 0.03, 1.0 + f * 0.03, ctx);
    }
    assert.equal(logs.playerDmgCalls.length, 1);
    assert.equal(logs.playerDmgCalls[0].amt, 2);
    const hitAllies = logs.allyDmgCalls.map((c) => c.ally);
    assert.equal(hitAllies.includes(frontAllyA), true, 'Front-arc cleave hits FrontA');
    assert.equal(hitAllies.includes(frontAllyB), true, 'Front-arc cleave hits FrontB');
    assert.equal(hitAllies.includes(rearAlly), false, 'Front-arc cleave spares ally behind Dread Knight');
  }

  // 2. Eclipse Behemoth: one-time toast <=32u + 4.8u radial Shockwave Slam + 11.0u/s radial knockback + 1.10s recovery
  {
    const { ctx, P, followers, glooms, logs } = makeCombatCtx(h);
    P.x = 0; P.z = 3.5;
    const ally1 = { mesh: new h.THREE.Group('A1'), hp: 4, maxHp: 4, phys: {} };
    ally1.mesh.position.set(3.2, 2, 0);
    const ally2 = { mesh: new h.THREE.Group('A2'), hp: 4, maxHp: 4, phys: {} };
    ally2.mesh.position.set(-3.2, 2, 0);
    const allyFar = { mesh: new h.THREE.Group('Far'), hp: 4, maxHp: 4, phys: {} };
    allyFar.mesh.position.set(0, 2, -6.5);
    followers.push(ally1, ally2, allyFar);

    const bMesh = h.Models.makeGloom(h.Enemies.TIERS.behemoth);
    h.Enemies.attachToGloom(bMesh, h.Enemies.TIERS.behemoth);
    const gb = h.Enemies.createGloomState(bMesh, h.Enemies.TIERS.behemoth, 0, 2, 0, { followersCount: 3 });
    gb.state = 'windup';
    gb.stateT = 0.02;
    glooms.push(gb);

    for (let f = 0; f < 16; f++) {
      h.Enemies.updateGlooms(glooms, 0.03, 1.0 + f * 0.03, ctx);
    }
    const behToasts = logs.toasts.filter((t) => t === 'An Eclipse Behemoth stalks nearby!');
    assert.equal(behToasts.length, 1, 'Behemoth announcement toast must fire exactly once');
    assert.equal(logs.playerDmgCalls.length, 1);
    assert.equal(logs.playerDmgCalls[0].amt, 3);
    assert.ok(Math.hypot(logs.playerDmgCalls[0].kx, logs.playerDmgCalls[0].kz) > 10.5, 'Shockwave applies 11u/s knockback pulse');
    assert.equal(logs.allyDmgCalls.filter((c) => c.ally === ally1 || c.ally === ally2).length, 2);
    assert.equal(logs.allyDmgCalls.some((c) => c.ally === allyFar), false, 'Ally outside 4.8u radius spared');
    assert.equal(gb.state, 'recover');
    assert.ok(gb.stateT > 0.7 && gb.stateT <= 1.10);
  }
});

test('Shadow Weaver leaps over blockers, Shadow Stinger hovers aloft and dives, Puglin smashes, and EnemyPhysics obeys 44-deg cliffs & YXZ Euler', () => {
  const h = loadEnemiesHarness();

  // 1. Shadow Weaver leaping pounce (vy = 6.2) clears front blocker to strike Starkeeper
  {
    const { ctx, P, followers, glooms, logs } = makeCombatCtx(h, {
      getNearbyColliders(_x, _z, _r, out) {
        out.length = 0;
        out.push({ x: 0, z: 1.5, r: 0.4, topY: 2.35 });
      },
    });
    P.x = 0; P.z = 3.2;
    const blocker = { mesh: new h.THREE.Group('Blocker'), hp: 3, maxHp: 3, phys: {} };
    blocker.mesh.position.set(0, 2, 1.5);
    followers.push(blocker);

    const wMesh = h.Models.makeGloom(h.Enemies.TIERS.weaver);
    h.Enemies.attachToGloom(wMesh, h.Enemies.TIERS.weaver);
    const gw = h.Enemies.createGloomState(wMesh, h.Enemies.TIERS.weaver, 0, 2, 0);
    gw.state = 'windup';
    gw.stateT = 0.01;
    glooms.push(gw);

    h.Enemies.updateGlooms(glooms, 0.02, 0.5, ctx);
    assert.equal(gw.state, 'lunge');
    assert.ok(gw.phys.vy > 5.0, `Expected Weaver leap vy > 5, got ${gw.phys.vy}`);
    let peakY = gw.mesh.position.y;
    for (let f = 0; f < 16; f++) {
      h.Enemies.updateGlooms(glooms, 0.025, 0.55 + f * 0.025, ctx);
      if (gw.mesh.position.y > peakY) peakY = gw.mesh.position.y;
    }
    assert.ok(peakY > 2.6, `Weaver must soar over front-line blocker, peakY=${peakY}`);
    assert.ok(logs.playerDmgCalls.length >= 1, 'Weaver pounce should ambush Starkeeper');
  }

  // 2. Shadow Stinger hovers aloft (y > heightAt + 1.2) and dives cleanly
  {
    const { ctx, P, glooms, logs } = makeCombatCtx(h);
    P.x = 0; P.z = 2.6;
    const sMesh = h.Models.makeGloom(h.Enemies.TIERS.stinger);
    h.Enemies.attachToGloom(sMesh, h.Enemies.TIERS.stinger);
    const gs = h.Enemies.createGloomState(sMesh, h.Enemies.TIERS.stinger, 0, 4.2, 0);
    gs.state = 'wander';
    glooms.push(gs);

    for (let f = 0; f < 10; f++) h.Enemies.updateGlooms(glooms, 0.02, 0.2 + f * 0.02, ctx);
    assert.ok(gs.mesh.position.y > 2.0 + 1.2, `Stinger must hover aloft, got y=${gs.mesh.position.y}`);

    // Trigger dive-sting
    gs.state = 'windup';
    gs.stateT = 0.01;
    let minDiveY = gs.mesh.position.y;
    for (let f = 0; f < 22; f++) {
      h.Enemies.updateGlooms(glooms, 0.025, 0.6 + f * 0.025, ctx);
      if (gs.mesh.position.y < minDiveY) minDiveY = gs.mesh.position.y;
    }
    assert.ok(logs.playerDmgCalls.length >= 1, 'Stinger dive-sting should hit target');
    assert.ok(minDiveY < 3.4, `Stinger must dive down toward target, minDiveY=${minDiveY}`);
    assert.equal(gs.state, 'recover');
    for (let f = 0; f < 16; f++) h.Enemies.updateGlooms(glooms, 0.03, 1.2 + f * 0.03, ctx);
    assert.ok(gs.mesh.position.y > 2.0 + 1.2, `Stinger should climb back aloft in recover, got y=${gs.mesh.position.y}`);
  }

  // 3. Shadow Puglin 2.0u front club smash hits target and close ally simultaneously
  {
    const { ctx, P, followers, glooms, logs } = makeCombatCtx(h);
    P.x = 0; P.z = 1.6;
    const closeAlly = { mesh: new h.THREE.Group('CloseAlly'), hp: 3, maxHp: 3, phys: {} };
    closeAlly.mesh.position.set(0.8, 2.0, 1.5);
    followers.push(closeAlly);

    const pMesh = h.Models.makeGloom(h.Enemies.TIERS.puglin);
    h.Enemies.attachToGloom(pMesh, h.Enemies.TIERS.puglin);
    const gp = h.Enemies.createGloomState(pMesh, h.Enemies.TIERS.puglin, 0, 2.0, 0, { dir: 0 });
    gp.state = 'windup';
    gp.stateT = 0.01;
    glooms.push(gp);

    for (let f = 0; f < 8; f++) h.Enemies.updateGlooms(glooms, 0.025, f * 0.025, ctx);
    assert.equal(logs.playerDmgCalls.length, 1);
    assert.equal(logs.allyDmgCalls.length, 1);
  }

  // 4. Steep >= 44 deg cliff discipline + gentle 25-deg slope climbable + Euler YXZ
  {
    // Cliff rises sharply along +Z starting at z = 2.0 (~50 deg slope: tan(50 deg) ~= 1.19)
    const slopeTan = Math.tan((50 * Math.PI) / 180);
    const { ctx, P, glooms } = makeCombatCtx(h, {
      heightAt: (_x, z) => (z > 2 ? 2.0 + (z - 2) * slopeTan : 2.0),
    });
    P.x = 0; P.z = 12;
    const pMesh = h.Models.makeGloom(h.Enemies.TIERS.puglin);
    h.Enemies.attachToGloom(pMesh, h.Enemies.TIERS.puglin);
    const gp = h.Enemies.createGloomState(pMesh, h.Enemies.TIERS.puglin, 0, 2.0, 0, { dir: 0 });
    gp.state = 'chase';
    glooms.push(gp);

    for (let f = 0; f < 45; f++) h.Enemies.updateGlooms(glooms, 0.025, f * 0.025, ctx);
    assert.equal(gp.mesh.rotation.order, 'YXZ');
    assert.ok(gp.mesh.position.z < 2.6, `Puglin must not climb 50-deg cliff, reached z=${gp.mesh.position.z}`);

    // Gentle 25-deg slope (< 44 deg) remains climbable with YXZ pitch alignment
    const gentleTan = Math.tan((25 * Math.PI) / 180);
    const { ctx: gCtx, P: gP, glooms: gList } = makeCombatCtx(h, {
      heightAt: (_x, z) => (z > 1 ? 2.0 + (z - 1) * gentleTan : 2.0),
    });
    gP.x = 0; gP.z = 14;
    const kMesh = h.Models.makeGloom(h.Enemies.TIERS.knight);
    h.Enemies.attachToGloom(kMesh, h.Enemies.TIERS.knight);
    const gk = h.Enemies.createGloomState(kMesh, h.Enemies.TIERS.knight, 0, 2.0, 0, { dir: 0 });
    gk.state = 'chase';
    gList.push(gk);
    for (let f = 0; f < 40; f++) h.Enemies.updateGlooms(gList, 0.025, f * 0.025, gCtx);
    assert.ok(gk.mesh.position.z > 3.5, `Knight should climb gentle 25-deg slope, z=${gk.mesh.position.z}`);
    assert.ok(gk.mesh.position.y > 3.0, `Knight Y should rise on 25-deg slope, y=${gk.mesh.position.y}`);
    assert.ok(gk.mesh.rotation.x < -0.1, 'Knight nose should pitch up (-X in YXZ) on uphill slope');
  }

  // 5. Classic Gloomblob preserves squash-and-stretch scale, eyeMat glow, body lean, wisps orbit, halo pulse
  {
    const { ctx, P, glooms } = makeCombatCtx(h);
    P.x = 0; P.z = 2.0;
    const cMesh = h.Models.makeGloom(h.Enemies.TIERS.classic);
    h.Enemies.attachToGloom(cMesh, h.Enemies.TIERS.classic);
    const gc = h.Enemies.createGloomState(cMesh, h.Enemies.TIERS.classic, 0, 2.0, 0);
    gc.state = 'windup';
    gc.stateT = 0.35;
    glooms.push(gc);

    const wispX0 = cMesh.userData.wisps[0].position.x;
    for (let f = 0; f < 5; f++) h.Enemies.updateGlooms(glooms, 0.03, 0.5 + f * 0.03, ctx);
    assert.ok(cMesh.scale.y < 0.9 && cMesh.scale.x > 1.1, 'Classic Gloomblob squashes in windup');
    assert.ok(cMesh.userData.eyeMat.emissiveIntensity > 2.5, 'Classic eyeMat turns bright crimson in windup');
    assert.ok(cMesh.userData.body.rotation.x < -0.1, 'Classic body leans back in windup');
    assert.notEqual(cMesh.userData.wisps[0].position.x, wispX0, 'Classic wisps orbit smoothly');
    assert.ok(cMesh.userData.halo.scale.x > 2.2, 'Classic halo expands in windup');
  }
});

test('initUnderwaterEnemies spawns 2 seabed Abyssal Stalkers that stay underwater, tethered within 24u, never despawn at d>90, and bypass land cap', () => {
  const h = loadEnemiesHarness();
  const { ctx, P, glooms, logs } = makeCombatCtx(h, {
    WATER_Y: 0,
    heightAt: (_x, z) => (z > 40 ? -6.0 : 2.0),
  });

  // Start Starkeeper far away (d > 95u from reef) to test no-despawn & land cap independence
  P.x = 0; P.y = 2.0; P.z = -10;
  h.Enemies.initUnderwaterEnemies(glooms, ctx);
  assert.equal(glooms.length, 2);
  assert.equal(glooms[0].underwater, true);
  assert.equal(glooms[1].underwater, true);
  assert.equal(glooms[0].archetype, 'stalker');
  assert.ok(Math.abs(glooms[0].mesh.position.x - (-16)) < 1e-4 && Math.abs(glooms[0].mesh.position.z - 84) < 1e-4);
  assert.ok(Math.abs(glooms[1].mesh.position.x - (-11)) < 1e-4 && Math.abs(glooms[1].mesh.position.z - 93) < 1e-4);

  let spawnedLandCount = 0;
  ctx.spawnGloom = () => {
    spawnedLandCount++;
    const m = h.Models.makeGloom(h.Enemies.TIERS.classic);
    glooms.push(h.Enemies.createGloomState(m, h.Enemies.TIERS.classic, 5, 2, 0));
  };

  for (let f = 0; f < 20; f++) {
    h.Enemies.updateGlooms(glooms, 0.03, f * 0.03, ctx);
  }
  assert.ok(spawnedLandCount >= 1, 'Underwater Stalkers must NOT block land targetCount spawning');
  const stalkers = glooms.filter((g) => g.underwater);
  assert.equal(stalkers.length, 2, 'Abyssal Stalkers must NEVER despawn when Starkeeper is > 90u away');
  for (const s of stalkers) {
    assert.ok(s.mesh.position.y <= -1.2, `Stalker must stay strictly < WATER_Y - 1.2, got y=${s.mesh.position.y}`);
    const dHome = Math.hypot(s.mesh.position.x - s.homeX, s.mesh.position.z - s.homeZ);
    assert.ok(dHome <= 24.05, `Stalker must remain tethered within 24u of home reef, got ${dHome}`);
  }

  // Starkeeper dives underwater nearby -> Stalker chases & strikes
  P.x = -16; P.y = -5.5; P.z = 86.0; P.swimming = true;
  ctx.spawnGloom = null;
  for (let f = 0; f < 40; f++) {
    h.Enemies.updateGlooms(stalkers, 0.03, 1.0 + f * 0.03, ctx);
  }
  assert.ok(logs.playerDmgCalls.length >= 1, 'Abyssal Stalker should attack swimming Starkeeper underwater');
});

test('EnemyPhysics & EnemyAI runtime zero-GC verification across 60 frames + static hot-loop & zero-emoji scans', () => {
  const h = loadEnemiesHarness();
  const { ctx, scene, followers, glooms } = makeCombatCtx(h, {
    WATER_Y: 0,
    heightAt: (_x, z) => (z > 40 ? -6.0 : 2.0),
  });
  h.Enemies.initTelegraphPool(scene, h.Models, 4);
  followers.push({ mesh: new h.THREE.Group('Ally'), hp: 6, maxHp: 6, phys: {} });
  followers[0].mesh.position.set(1.5, 2.0, 2.5);

  const keys = ['classic', 'puglin', 'weaver', 'stinger', 'imp', 'knight', 'behemoth'];
  keys.forEach((k, idx) => {
    const tier = h.Enemies.TIERS[k];
    const m = h.Models.makeGloom(tier);
    h.Enemies.attachToGloom(m, tier);
    const g = h.Enemies.createGloomState(m, tier, (idx - 3) * 2.5, tier.aerial ? 4.2 : 2.0, 4 + idx);
    if (k === 'knight' || k === 'behemoth') {
      g.state = 'windup';
      g.stateT = tier.windupDur;
    }
    glooms.push(g);
  });
  h.Enemies.initUnderwaterEnemies(glooms, ctx);

  h.THREE._resetAllocs();
  scene.addCalls = 0;

  for (let f = 0; f < 60; f++) {
    h.Enemies.updateGlooms(glooms, 0.016, 1.0 + f * 0.016, ctx);
  }
  assert.equal(scene.addCalls, 0, 'Zero runtime scene.add calls across 60 frames');
  assert.equal(h.THREE._allocs.vec3, 0, 'Zero Vector3 allocations across 60 frames');
  assert.equal(h.THREE._allocs.quat, 0, 'Zero Quaternion allocations across 60 frames');
  assert.equal(h.THREE._allocs.euler, 0, 'Zero Euler allocations across 60 frames');
  assert.equal(h.THREE._allocs.color, 0, 'Zero Color allocations across 60 frames');

  // Static source scan on enemies.js hot loops & zero emojis
  const src = fs.readFileSync(new URL('../enemies.js', import.meta.url), 'utf8');
  assert.equal(/[\u{1F300}-\u{1FAFF}\p{Extended_Pictographic}]/u.test(src), false, 'enemies.js must contain zero emojis');

  const extractFnBody = (fnName) => {
    const sig = `function ${fnName}(`;
    const idx = src.indexOf(sig);
    assert.ok(idx >= 0, `Expected ${sig} in enemies.js`);
    const braceStart = src.indexOf('{', idx);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(braceStart, i + 1);
      }
    }
    assert.fail(`Unbalanced braces for ${fnName}`);
  };

  const hotFns = [
    'update',
    'updateEmissiveAndAura',
    'sampleTerrainNormal',
    'resolveEnemyColliders',
    'ensureEnemyPhys',
    'stepEnemyPhysics',
    'applyEnemyAoEStrike',
    'triggerBehemothShockwave',
    'updateClassicFallbackVisuals',
    'onGloomHit',
    'updateGlooms',
  ];
  for (const fn of hotFns) {
    const body = extractFnBody(fn);
    assert.equal(
      /new\s+(?:THREE|THREERef)\s*\.\s*(?:Vector3|Quaternion|Euler|Color)/.test(body),
      false,
      `Hot function ${fn} must NOT allocate THREE Vector3/Quaternion/Euler/Color`
    );
  }
  const ugBody = extractFnBody('updateGlooms');
  assert.equal(/\.\s*add\s*\(/.test(ugBody), false, 'updateGlooms must NEVER call scene.add');
});

test('Task 4 regressions: 30-deg downhill no-jump, side-slope roll sign, surface vs diving Stalker vertical reach, mid-windup kill telegraph hide, rear AoE symmetry, and live getLit/getSanctuary', () => {
  const h = loadEnemiesHarness();

  // 1. Running downhill on 30-deg slope keeps phys.onGround === true and never flickers airborne/'jump'
  {
    const slopeTan30 = Math.tan((30 * Math.PI) / 180);
    const { ctx, P, glooms } = makeCombatCtx(h, {
      heightAt: (_x, z) => (z >= 0 ? 12.0 - z * slopeTan30 : 12.0),
    });
    P.x = 0; P.z = 16; P.y = 12.0 - 16 * slopeTan30;
    const kMesh = h.Models.makeGloom(h.Enemies.TIERS.knight);
    h.Enemies.attachToGloom(kMesh, h.Enemies.TIERS.knight);
    const gk = h.Enemies.createGloomState(kMesh, h.Enemies.TIERS.knight, 0, 12.0, 0, { dir: 0 });
    gk.state = 'chase';
    glooms.push(gk);

    let sawAirborne = false;
    let sawJumpClip = false;
    for (let f = 0; f < 30; f++) {
      h.Enemies.updateGlooms(glooms, 0.025, f * 0.025, ctx);
      if (!gk.phys.onGround) sawAirborne = true;
      if (kMesh.userData.enemyRig.state.clip === 'jump') sawJumpClip = true;
    }
    assert.ok(gk.mesh.position.z > 2.0 && gk.mesh.position.y < 11.0, 'Knight should descend 30-deg slope');
    assert.equal(sawAirborne, false, 'Downhill 30-deg run must keep phys.onGround === true');
    assert.equal(sawJumpClip, false, 'Downhill 30-deg run must never flicker jump clip');
  }

  // 2. Side-slope roll sign (rotation.z < -0.1 when terrain normal tilts toward local +X)
  //    AND sampleTerrainNormal uses c.heightAt finite-diff instead of unrelated global terrainNormalAt
  {
    const tiltTan20 = Math.tan((20 * Math.PI) / 180);
    const { ctx, P, glooms } = makeCombatCtx(h, {
      heightAt: (x, _z) => 4.0 - x * tiltTan20, // rises toward -X, slopes down toward +X -> normal tilts toward +X
    });
    P.x = 0; P.z = 12; P.y = 4.0;
    const pMesh = h.Models.makeGloom(h.Enemies.TIERS.puglin);
    h.Enemies.attachToGloom(pMesh, h.Enemies.TIERS.puglin);
    const gp = h.Enemies.createGloomState(pMesh, h.Enemies.TIERS.puglin, 0, 4.0, 0, { dir: 0 });
    gp.state = 'chase';
    glooms.push(gp);

    for (let f = 0; f < 30; f++) {
      h.Enemies.updateGlooms(glooms, 0.025, f * 0.025, ctx);
    }
    assert.equal(gp.mesh.rotation.order, 'YXZ');
    assert.ok(gp.mesh.rotation.z < -0.1, `Expected rotation.z < -0.1 when terrain normal tilts +X, got ${gp.mesh.rotation.z}`);
  }

  // 3. Seabed Abyssal Stalker at y = -6.0 must NOT hit surface swimmer at y = -0.3, DOES engage when diving at y = -5.2
  {
    const { ctx, P, glooms, logs } = makeCombatCtx(h, {
      WATER_Y: 0,
      heightAt: (_x, z) => (z > 40 ? -6.0 : 2.0),
    });
    h.Enemies.initUnderwaterEnemies(glooms, ctx);
    const stalker = glooms[0];
    // Position Starkeeper swimming right on the surface directly above stalker at (-16, 84)
    P.x = -16; P.y = -0.3; P.z = 84.5; P.swimming = true;
    for (let f = 0; f < 35; f++) {
      h.Enemies.updateGlooms(glooms, 0.03, f * 0.03, ctx);
    }
    assert.equal(logs.playerDmgCalls.length, 0, 'Seabed Stalker at y=-6.0 must NOT damage surface swimmer at y=-0.3');

    // Now Starkeeper dives down to y = -5.2 near the seabed -> Stalker chases & strikes!
    P.y = -5.2; P.z = 85.8;
    for (let f = 0; f < 35; f++) {
      h.Enemies.updateGlooms(glooms, 0.03, 1.5 + f * 0.03, ctx);
    }
    assert.ok(logs.playerDmgCalls.length >= 1, 'Seabed Stalker must engage and damage diving Starkeeper at y=-5.2');
    assert.ok(stalker.mesh.position.y <= -1.2);
  }

  // 4. Killing a winding-up Dread Knight / Eclipse Behemoth mid-windup hides its pooled telegraph ring on next tick
  {
    const { ctx, scene, glooms } = makeCombatCtx(h);
    const pool = h.Enemies.initTelegraphPool(scene, h.Models, 2);
    const kMesh = h.Models.makeGloom(h.Enemies.TIERS.knight);
    h.Enemies.attachToGloom(kMesh, h.Enemies.TIERS.knight);
    const gk = h.Enemies.createGloomState(kMesh, h.Enemies.TIERS.knight, 0, 2.0, 4.0);
    gk.state = 'windup';
    gk.stateT = 0.45;
    glooms.push(gk);

    h.Enemies.updateGlooms(glooms, 0.016, 0.1, ctx);
    assert.equal(pool[0].visible, true, 'Telegraph ring visible during Knight windup');

    // Slay Knight mid-windup
    h.Enemies.onGloomHit(gk, 0, { x: 0, z: 1 }, gk.hp, true, true, ctx);
    assert.equal(glooms.length, 0);

    // Next updateGlooms tick must hide unused telegraph ring cleanly
    h.Enemies.updateGlooms(glooms, 0.016, 0.12, ctx);
    assert.equal(pool[0].visible, false, 'Pooled telegraph ring must hide after mid-windup kill');
  }

  // 5. Rear-arc symmetry for Puglin/Imp (isFrontArc === false hits allies in full aoeRadius) & live getLit/getSanctuary
  {
    const { ctx, followers, glooms, logs } = makeCombatCtx(h);
    const rearAlly = { mesh: new h.THREE.Group('RearImpAlly'), hp: 3, maxHp: 3, phys: {} };
    rearAlly.mesh.position.set(0, 2.0, -1.9); // behind Imp within 2.4u aoeRadius
    followers.push(rearAlly);

    const impMesh = h.Models.makeGloom(h.Enemies.TIERS.imp);
    h.Enemies.attachToGloom(impMesh, h.Enemies.TIERS.imp);
    const gi = h.Enemies.createGloomState(impMesh, h.Enemies.TIERS.imp, 0, 2.0, 0, { dir: 0 });
    gi.state = 'windup';
    gi.stateT = 0.01;
    glooms.push(gi);

    for (let f = 0; f < 6; f++) h.Enemies.updateGlooms(glooms, 0.025, f * 0.025, ctx);
    assert.ok(logs.allyDmgCalls.some((c) => c.ally === rearAlly), 'Imp radial mace flurry must hit close ally symmetrically within aoeRadius');

    // Live getLit() & getSanctuary() scale targetCount dynamically
    let liveLit = 0;
    let spawnCalls = 0;
    const dynCtx = makeCombatCtx(h, {
      getLit: () => liveLit,
      getSanctuary: () => ({ x: 0, z: 0 }),
      spawnGloom: () => { spawnCalls++; },
    }).ctx;
    liveLit = 8; // threat = 8 * 0.75 = 6.0 -> targetCount = 1 + floor(6 * 0.55) = 4
    h.Enemies.updateGlooms([], 0.016, 0.1, dynCtx);
    assert.equal(spawnCalls, 4, 'updateGlooms should read live getLit()/getSanctuary() to compute targetCount');
  }
});

test('Fix 3: Enemies calibrated DEFAULT_REF_SPEEDS, 0.14 moving threshold, real airborne threshold, [0.38, 2.35] timeScale, & hardened crossFadeToSemantic', () => {
  const h = loadEnemiesHarness();

  // 1. Calibrated walk=1.65 on knight, 0.14 moving threshold, relative run switch (1.65 * 1.85 = 3.0525), [0.38, 2.35] timeScale
  const kRoot = h.Models.makeGloom(h.Enemies.TIERS.knight);
  const kCtrl = h.Enemies.attachToGloom(kRoot, h.Enemies.TIERS.knight);
  const kMixer = h.THREE._mixers[0];
  const findAct = (name) => {
    for (const act of kMixer.actions.values()) {
      if (act.getClip().name === name) return act;
    }
    return null;
  };
  const idleAct = findAct('HumanArmature|Idle_swordRight');
  const walkAct = findAct('HumanArmature|Walking');
  const runAct = findAct('HumanArmature|Run_swordRight');

  kCtrl.update(0.016, 0.1, { mode: null, speed: 0.18, refSpeed: 0, isMoving: false, airborne: false });
  assert.equal(kCtrl.state.clip, 'walk', 'Slow movement (0.18 > 0.14) must immediately step walk');
  assert.equal(kCtrl.state.timeScale, 0.38, 'Slow walk clamps cleanly at lower bound 0.38');
  assert.ok(walkAct.stopFadingCalls >= 1, 'crossFadeToSemantic must call stopFading() on nextAct');

  kCtrl.update(0.016, 0.2, { mode: null, speed: 2.5, refSpeed: 0, isMoving: true, airborne: false });
  assert.equal(kCtrl.state.clip, 'walk', 'Knight at 2.5 u/s (< 1.65 * 1.85 = 3.05) stays in walk');
  assert.ok(Math.abs(kCtrl.state.timeScale - 2.5 / 1.65) < 0.02, `Expected knight walk timeScale ~1.515, got ${kCtrl.state.timeScale}`);

  kCtrl.update(0.016, 0.22, { mode: null, speed: 3.9, refSpeed: 0, isMoving: true, airborne: false });
  assert.equal(kCtrl.state.clip, 'run', 'Knight at 3.9 u/s (> 1.65 * 1.85) switches to run');
  assert.equal(idleAct.playing, false, 'Rapid idle -> walk -> run must stop stale Idle action');
  assert.equal(idleAct.weight, 0);
  assert.ok(runAct.stopFadingCalls >= 1);

  // 2. Real airborne threshold in updateGlooms: small airLift (0.12 <= 0.26) & vy (0.5 <= 1.2) keeps enemy out of jump!
  const { ctx, glooms } = makeCombatCtx(h);
  const pugMesh = h.Models.makeGloom(h.Enemies.TIERS.puglin);
  const pugCtrl = h.Enemies.attachToGloom(pugMesh, h.Enemies.TIERS.puglin);
  const pug = h.Enemies.createGloomState(pugMesh, h.Enemies.TIERS.puglin, 0, 2.0, 6.0);
  pug.phys = { onGround: false, vy: 0.4, airLift: 0.12, smoothSpd: 1.5, facing: 0, bankRoll: 0 };
  pugMesh.position.y = 2.12;
  glooms.push(pug);
  h.Enemies.updateGlooms(glooms, 0.016, 0.5, ctx);
  assert.notEqual(pugCtrl.state.clip, 'jump', 'Small terrain micro-lift (<= 0.26u, vy <= 1.2) must NOT freeze legs in jump');

  // 3. Shared oneShot clip resumption wraps time = 0 when near clip end
  const sharedIdle = findAct('HumanArmature|Idle_swordRight');
  kCtrl.update(0.016, 0.3, { mode: 'idle', speed: 0 });
  kCtrl.triggerOneShot('hit', 0.15);
  sharedIdle.time = 0.795; // within 0.01 of mock duration 0.80
  kCtrl.update(0.10, 0.4, { mode: 'idle', speed: 0 });
  kCtrl.update(0.06, 0.46, { mode: 'idle', speed: 0 });
  assert.equal(kCtrl.state.clip, 'idle');
  assert.ok(sharedIdle.time < 0.2, `Resumed shared idle clip must wrap time to 0 before advancing, got ${sharedIdle.time}`);
});
