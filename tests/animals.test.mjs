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
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
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
      copy.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
      copy.quaternion.copy(this.quaternion);
      copy.scale.copy(this.scale);
      copy.userData = { ...this.userData };
      if (this.isBone) copy.isBone = true;
      if (this.isMesh) {
        copy.isMesh = true;
        copy.material = this.material;
        copy.geometry = this.geometry;
      }
      if (this.isSkinnedMesh) copy.isSkinnedMesh = true;
      if (this.morphTargetDictionary) {
        copy.morphTargetDictionary = { ...this.morphTargetDictionary };
      }
      if (this.morphTargetInfluences) {
        copy.morphTargetInfluences = this.morphTargetInfluences.slice();
      }
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
      this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
      this.emissive = new Color(opts.emissive !== undefined ? opts.emissive : 0x000000);
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
      this.normalScale = opts.normalScale || null;
      this.name = opts.name || '';
      this.needsUpdate = false;
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
      this.material = new MeshStandardMaterial({
        name: matName,
        map: opts.map || null,
        vertexColors: !!opts.vertexColors,
      });
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
    }
    getClip() { return this._clip; }
    reset() { this.time = 0; this.enabled = true; this.paused = false; return this; }
    play() { this.enabled = true; this.playing = true; return this; }
    stop() { this.playing = false; this.weight = 0; return this; }
    setLoop(mode) { this.loop = mode; return this; }
    setEffectiveTimeScale(s) { this.timeScale = s; return this; }
    setEffectiveWeight(w) { this.weight = w; return this; }
    getEffectiveWeight() { return this.weight; }
    fadeIn() { this.weight = 1; this.playing = true; return this; }
    fadeOut() { this.weight = 0; return this; }
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

function makeMockArchetypeGltf(THREE, key) {
  const scene = new THREE.Group('Scene');
  const root = new THREE.Group('AnimalRoot');
  const arm = new THREE.Group('AnimalArmature');
  arm.scale.set(100, 100, 100);
  root.scale.set(0.25, 0.25, 0.25);
  scene.add(root);

  if (key === 'bird') {
    const morphNames = Array.from({ length: 12 }, (_, i) => `parrot_A_${String(i + 1).padStart(3, '0')}`);
    const birdMesh = new THREE.Mesh('ParrotMesh', '', { vertexColors: true, morphNames });
    root.add(birdMesh);
    return {
      scene,
      animations: [{ name: 'parrot_A_', duration: 1.0, tracks: [] }],
    };
  }

  const bBody = new THREE.Bone('Body');
  const bTorso = new THREE.Bone('Torso');
  const bHead = new THREE.Bone('Head');
  bHead.position.set(0, 0.02, 0.02);
  const bEarL = new THREE.Bone('Ear1L');
  const bEarR = new THREE.Bone('Ear1R');
  const bAbdomen = new THREE.Bone('Abdomen');

  bBody.add(bTorso);
  bTorso.add(bHead);
  bHead.add(bEarL, bEarR);
  if (key === 'firefly') bBody.add(bAbdomen);
  arm.add(bBody);
  root.add(arm);

  if (key === 'fox') {
    const m1 = new THREE.SkinnedMesh('Fox_Main', 'Main', { morphNames: ['Feline'] });
    const m2 = new THREE.SkinnedMesh('Fox_Light', 'Main_Light', { morphNames: ['Feline'] });
    const m3 = new THREE.SkinnedMesh('Fox_Eyes', 'Eyes', { morphNames: ['Feline'] });
    root.add(m1, m2, m3);
    const clips = [
      'AnimalArmature|Idle', 'AnimalArmature|Idle_2', 'AnimalArmature|Idle_2_HeadLow',
      'AnimalArmature|Eating', 'AnimalArmature|Walk', 'AnimalArmature|Gallop',
      'AnimalArmature|Gallop_Jump', 'AnimalArmature|Attack', 'AnimalArmature|Idle_HitReact_Left',
      'AnimalArmature|Death',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.8, tracks: [] })) };
  }

  if (key === 'unicorn') {
    root.add(new THREE.SkinnedMesh('Horse', 'Main'));
    root.add(new THREE.SkinnedMesh('Horse_Hair', 'Hair'));
    const clips = [
      'AnimalArmature|Idle', 'AnimalArmature|Eating', 'AnimalArmature|Walk',
      'AnimalArmature|Gallop', 'AnimalArmature|Gallop_Jump',
      'AnimalArmature|Attack_Headbutt', 'AnimalArmature|Death',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.9, tracks: [] })) };
  }

  if (key === 'stag') {
    root.add(new THREE.SkinnedMesh('Stag', 'Material.003'));
    root.add(new THREE.Mesh('Stag_Horns', 'Material.001'));
    const clips = ['AnimalArmature|Idle', 'AnimalArmature|Walk', 'AnimalArmature|Gallop', 'AnimalArmature|Attack_Headbutt'];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.9, tracks: [] })) };
  }

  if (key === 'drake') {
    root.add(new THREE.SkinnedMesh('Velociraptor', 'Brown'));
    const clips = [
      'Armature|Velociraptor_Idle', 'Armature|Velociraptor_Walk',
      'Armature|Velociraptor_Run', 'Armature|Velociraptor_Jump',
      'Armature|Velociraptor_Attack', 'Armature|Velociraptor_Death',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.75, tracks: [] })) };
  }

  if (key === 'firefly') {
    root.add(new THREE.SkinnedMesh('Wasp', 'Yellow'));
    const clips = ['WaspArmature|Wasp_Flying', 'WaspArmature|Wasp_Attack', 'WaspArmature|Wasp_Death'];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.5, tracks: [] })) };
  }

  if (key === 'eel') {
    root.add(new THREE.SkinnedMesh('Snake', 'DarkGreen'));
    const clips = ['SnakeArmature|Snake_Idle', 'SnakeArmature|Snake_Walk', 'SnakeArmature|Snake_Jump', 'SnakeArmature|Snake_Attack'];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.8, tracks: [] })) };
  }

  if (key === 'kiwi') {
    root.add(new THREE.SkinnedMesh('Kiwi', 'lambert1'));
    const clips = ['idle', 'attack', 'dead', 'walk'];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.6, tracks: [] })) };
  }

  if (key === 'fish_tang') {
    root.add(new THREE.SkinnedMesh('BlueTang', 'BlueTang_Main'));
    const clips = [
      'Fish_Armature|Attack', 'Fish_Armature|Death', 'Fish_Armature|Out_Of_Water',
      'Fish_Armature|Swimming_Fast', 'Fish_Armature|Swimming_Impulse', 'Fish_Armature|Swimming_Normal',
    ];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.8, tracks: [] })) };
  }

  if (key === 'manta') {
    root.add(new THREE.SkinnedMesh('MantaRay', 'Top'));
    return { scene, animations: [{ name: 'Armature|Swim', duration: 1.1, tracks: [] }] };
  }

  if (key === 'beetle') {
    root.add(new THREE.SkinnedMesh('Asianladybeetle', 'Material'));
    const clips = ['idle', 'walk', 'run', 'attack', 'hit', 'dead', 'alert', 'eat', 'groom', 'sleep', 'tripod'];
    return { scene, animations: clips.map((name) => ({ name, duration: 0.7, tracks: [] })) };
  }

  const defaultClips = ['Idle', 'Walk', 'Run', 'Attack', 'Death'];
  root.add(new THREE.SkinnedMesh(key, 'Main'));
  return { scene, animations: defaultClips.map((name) => ({ name, duration: 0.8, tracks: [] })) };
}

function loadAnimalsHarness({
  protocol = 'https:',
  omitLoader = false,
  omitSkeletonUtils = false,
  failLoad = false,
  deferLoad = false,
} = {}) {
  const code = fs.readFileSync(new URL('../animals.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  const calls = {
    loadUrls: [],
    parseCount: 0,
    scriptsInjected: [],
    cloneCount: 0,
    animateCritterCalls: 0,
    attachments: [],
    glowSprites: [],
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
            onLoad(makeMockArchetypeGltf(THREE, key));
          }
        };
        if (deferLoad) pendingDeferred.push(finish);
        else finish();
      }
      parse(_buf, _path, onLoad, onErr) {
        calls.parseCount++;
        const key = calls.scriptsInjected[calls.scriptsInjected.length - 1]
          ?.split('/').pop().replace(/\.glb\.js$/, '') || 'fox';
        if (failLoad) {
          if (onErr) onErr(new Error('parse failed'));
        } else if (onLoad) {
          onLoad(makeMockArchetypeGltf(THREE, key));
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
        const key = match ? match[1] : 'fox';
        win.__ANIMAL_GLB_B64__ = win.__ANIMAL_GLB_B64__ || {};
        win.__ANIMAL_GLB_B64__[key] = Buffer.from('glTFmock').toString('base64');
        if (typeof el.onload === 'function') el.onload();
      },
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), src: '', onload: null, onerror: null };
    },
  };

  const Models = {
    makeUnicornHorn() {
      const g = new THREE.Group('UnicornHorn');
      calls.attachments.push('UnicornHorn');
      return g;
    },
    makeLynxEarTufts(col) {
      const g = new THREE.Group('LynxEarTufts');
      g.userData.color = col;
      calls.attachments.push('LynxEarTufts');
      return g;
    },
    makeDrakeEmberCrest() {
      const g = new THREE.Group('DrakeEmberCrest');
      calls.attachments.push('DrakeEmberCrest');
      return g;
    },
    makeOwlEarTufts(col) {
      const g = new THREE.Group('OwlEarTufts');
      g.userData.color = col;
      calls.attachments.push('OwlEarTufts');
      return g;
    },
    makeFireflyLantern() {
      const g = new THREE.Group('FireflyLantern');
      calls.attachments.push('FireflyLantern');
      return g;
    },
    makeKelpFronds(col) {
      const g = new THREE.Group('KelpFronds');
      g.userData.color = col;
      calls.attachments.push('KelpFronds');
      return g;
    },
    makeWishCrown() {
      const g = new THREE.Group('WishCrown');
      calls.attachments.push('WishCrown');
      return g;
    },
    animateCritter() {
      calls.animateCritterCalls++;
    },
  };

  const Textures = {
    sets: {
      fur: { map: { tag: 'furMap' }, normalMap: { tag: 'furNorm' }, roughnessMap: { tag: 'furRough' } },
      feather: { map: { tag: 'featherMap' }, normalMap: { tag: 'featherNorm' }, roughnessMap: { tag: 'featherRough' } },
      scales: { map: { tag: 'scalesMap' }, normalMap: { tag: 'scalesNorm' }, roughnessMap: { tag: 'scalesRough' } },
    },
  };

  const Shaders = {
    createGlowSprite(color, size, opacity, sparkle) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, opacity }));
      sp.scale.set(size || 1, size || 1, 1);
      sp.userData = { color, size, opacity, sparkle };
      calls.glowSprites.push(sp);
      return sp;
    },
  };

  const sandbox = {
    THREE,
    Models,
    Textures,
    Shaders,
    Physics: {},
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
  vm.runInNewContext(code + '\nthis.__Animals = Animals;', sandbox);

  return {
    Animals: sandbox.__Animals,
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

test('speciesToArchetype maps all 15 standard species, 6 rare species, Moon Jelly, and fallbacks', () => {
  const { Animals } = loadAnimalsHarness();
  const cases = [
    [{ name: 'Frost Fox', plan: 'quad' }, 'fox'],
    [{ name: 'Aurora Fox', plan: 'quad', rare: true }, 'fox'],
    [{ name: 'Moss Lynx', plan: 'quad' }, 'fox'],
    [{ name: 'Starlight Unicorn', plan: 'quad' }, 'unicorn'],
    [{ name: 'Astral Unicorn', plan: 'quad', rare: true }, 'unicorn'],
    [{ name: 'Timber Wolf', plan: 'quad' }, 'wolf'],
    [{ name: 'Eclipse Wolf', plan: 'quad', rare: true }, 'wolf'],
    [{ name: 'Woodland Cub', plan: 'quad' }, 'wolf'],
    [{ name: 'Celestial Stag', plan: 'quad', archetype: 'stag', rare: true }, 'stag'],
    [{ name: 'Ember Drake', plan: 'lizard' }, 'drake'],
    [{ name: 'Starfire Drake', plan: 'lizard', rare: true }, 'drake'],
    [{ name: 'Berry Beetle', plan: 'bug' }, 'beetle'],
    [{ name: 'Lantern Firefly', plan: 'bug' }, 'firefly'],
    [{ name: 'Cloud Wren', plan: 'bird' }, 'bird'],
    [{ name: 'Golden Owl', plan: 'bird' }, 'bird'],
    [{ name: 'Solar Owl', plan: 'bird', rare: true }, 'bird'],
    [{ name: 'Wish', plan: 'bird' }, 'bird'],
    [{ name: 'Meadow Kiwi', plan: 'bird' }, 'kiwi'],
    [{ name: 'Seafoam Fin', plan: 'fish' }, 'fish_tang'],
    [{ name: 'Coral Dart', plan: 'fish' }, 'fish_koi'],
    [{ name: 'Kelp Eel', plan: 'eel' }, 'eel'],
    [{ name: 'Starlight Manta', plan: 'fish', archetype: 'manta' }, 'manta'],
    [{ name: 'Moon Jelly', plan: 'jelly' }, 'jelly'],
    [{ name: 'Custom Stag', archetype: 'stag' }, 'stag'],
    [{ name: 'Custom Jelly', plan: 'jelly' }, 'jelly'],
    ['Frost Fox', 'fox'],
  ];
  for (const [sp, expected] of cases) {
    assert.equal(Animals.speciesToArchetype(sp), expected, `Expected ${JSON.stringify(sp)} -> ${expected}`);
  }
});

test('resolveAssetSource selects binary glb on http/https and base64 bundle on file:', () => {
  const { Animals } = loadAnimalsHarness({ protocol: 'https:' });
  assert.deepEqual({ ...Animals.resolveAssetSource('fox', 'https:') }, {
    mode: 'glb',
    url: './assets/animals/fox.glb',
  });
  assert.deepEqual({ ...Animals.resolveAssetSource('bird', 'http:') }, {
    mode: 'glb',
    url: './assets/animals/bird.glb',
  });
  assert.deepEqual({ ...Animals.resolveAssetSource('unicorn', 'file:') }, {
    mode: 'file-bundle',
    url: './assets/animals/unicorn.glb.js',
  });
  assert.deepEqual({ ...Animals.resolveAssetSource('drake') }, {
    mode: 'glb',
    url: './assets/animals/drake.glb',
  });

  const fileHarness = loadAnimalsHarness({ protocol: 'file:' });
  assert.deepEqual({ ...fileHarness.Animals.resolveAssetSource('stag') }, {
    mode: 'file-bundle',
    url: './assets/animals/stag.glb.js',
  });
});

test('preloadArchetype coalesces concurrent loads, supports file: bundle, and resets cleanly', () => {
  const httpH = loadAnimalsHarness({ protocol: 'https:', deferLoad: true });
  const got = [];
  httpH.Animals.preloadArchetype('fox', (tpl) => got.push(tpl));
  httpH.Animals.preloadArchetype('fox', (tpl) => got.push(tpl));
  assert.equal(httpH.calls.loadUrls.length, 1);
  assert.equal(httpH.calls.scriptsInjected.length, 0);
  httpH.flushDeferred();
  assert.equal(got.length, 2);
  assert.equal(got[0], got[1]);

  httpH.Animals._resetCache();
  httpH.Animals.preloadArchetype('fox', () => {});
  httpH.flushDeferred();
  assert.equal(httpH.calls.loadUrls.length, 2);

  const fileH = loadAnimalsHarness({ protocol: 'file:' });
  let fileTpl = null;
  fileH.Animals.preloadArchetype('unicorn', (tpl) => { fileTpl = tpl; });
  assert.equal(fileH.calls.loadUrls.length, 0);
  assert.deepEqual(fileH.calls.scriptsInjected, ['./assets/animals/unicorn.glb.js']);
  assert.equal(fileH.calls.parseCount, 1);
  assert.ok(fileTpl && fileTpl.scene);
});

test('graceful procedural fallback when GLTFLoader/SkeletonUtils missing or failed, and Moon Jelly shader rig', () => {
  for (const opts of [{ omitLoader: true }, { omitSkeletonUtils: true }, { failLoad: true }]) {
    const h = loadAnimalsHarness(opts);
    const root = new h.THREE.Group('CritterRoot');
    const procBody = new h.THREE.Group('ProcBody');
    root.add(procBody);

    const ctrl = h.Animals.attachToCritter(root, { name: 'Frost Fox', plan: 'quad', color: 0xbfe3f0 });
    assert.equal(ctrl.ready, false);
    assert.ok(root.userData.proceduralRoot);
    assert.equal(root.userData.proceduralRoot.visible, true);
    assert.equal(procBody.parent, root.userData.proceduralRoot);
    assert.equal(root.userData.animalRig, ctrl);

    ctrl.update(0.016, 1.2, { speed: 2.5 });
    assert.equal(h.calls.animateCritterCalls, 1);
  }

  const jellyH = loadAnimalsHarness();
  const jellyRoot = new jellyH.THREE.Group('JellyRoot');
  jellyRoot.add(new jellyH.THREE.Group('JellyBell'));
  const jellyCtrl = jellyH.Animals.attachToCritter(jellyRoot, { name: 'Moon Jelly', plan: 'jelly', color: 0x8fbdf7 });
  assert.equal(jellyCtrl.ready, true);
  assert.equal(jellyCtrl.isShaderRig, true);
  assert.equal(jellyCtrl.archetype, 'jelly');
  assert.equal(jellyH.calls.loadUrls.length, 0);
  assert.equal(jellyRoot.userData.proceduralRoot.visible, true);
  jellyCtrl.update(0.016, 2.0, { speed: 1.5 });
  assert.equal(jellyH.calls.animateCritterCalls, 1);
});

test('multi-instance cloning loads template once, clones twice with independent mixers, and restyles PBR coats', () => {
  const h = loadAnimalsHarness();
  const rootA = new h.THREE.Group('FoxA');
  rootA.add(new h.THREE.Group('ProcA'));
  const rootB = new h.THREE.Group('FoxB');
  rootB.add(new h.THREE.Group('ProcB'));

  const sp = { name: 'Frost Fox', plan: 'quad', color: 0xbfe3f0 };
  const ctrlA = h.Animals.attachToCritter(rootA, sp);
  const ctrlB = h.Animals.attachToCritter(rootB, sp);

  assert.equal(h.calls.loadUrls.length, 1);
  assert.equal(h.calls.cloneCount, 2);
  assert.equal(h.THREE._mixers.length, 2);
  assert.notEqual(h.THREE._mixers[0], h.THREE._mixers[1]);
  assert.equal(ctrlA.ready, true);
  assert.equal(ctrlB.ready, true);
  assert.equal(rootA.userData.proceduralRoot.visible, false);
  assert.equal(rootB.userData.proceduralRoot.visible, false);

  let skinnedChecked = 0;
  rootA.traverse((obj) => {
    if (obj.isSkinnedMesh) {
      skinnedChecked++;
      assert.equal(obj.castShadow, true);
      assert.equal(obj.receiveShadow, true);
      assert.equal(obj.frustumCulled, false);
      assert.equal(obj.material.skinning, true);
      assert.equal(obj.material.morphTargets, true);
      if (obj.name !== 'Fox_Eyes') {
        assert.equal(obj.material.map, h.Textures.sets.fur.map);
      }
    }
  });
  assert.equal(skinnedChecked, 3);
});

test('bird.glb morph-target handling disables vertexColors, applies feather PBR, scales species, and attaches Wish/Owl accents', () => {
  const h = loadAnimalsHarness();
  const owlRoot = new h.THREE.Group('Owl');
  const wrenRoot = new h.THREE.Group('Wren');
  const wishRoot = new h.THREE.Group('Wish');

  const owlCtrl = h.Animals.attachToCritter(owlRoot, { name: 'Golden Owl', plan: 'bird', color: 0xf7d948 });
  const wrenCtrl = h.Animals.attachToCritter(wrenRoot, { name: 'Cloud Wren', plan: 'bird', color: 0xf2f5f7 });
  const wishCtrl = h.Animals.attachToCritter(wishRoot, { name: 'Wish', plan: 'bird', color: 0xffd93b });

  assert.equal(owlCtrl.ready, true);
  assert.equal(wrenCtrl.ready, true);
  assert.equal(wishCtrl.ready, true);
  assert.equal(h.calls.loadUrls.length, 1);

  const checkBird = (root, expectedScale, expectedAccent) => {
    let meshCount = 0;
    let accentNode = null;
    let glbClone = null;
    let animalRoot = null;
    root.traverse((obj) => {
      if (obj.name === 'Scene') glbClone = obj;
      if (obj.name === 'AnimalRoot') animalRoot = obj;
      if (obj.name === expectedAccent) accentNode = obj;
      if (obj.isMesh && obj.morphTargetInfluences) {
        meshCount++;
        assert.equal(obj.material.skinning, false);
        assert.equal(obj.material.morphTargets, true);
        assert.equal(obj.material.vertexColors, false);
        assert.equal(obj.material.map, h.Textures.sets.feather.map);
        assert.equal(obj.frustumCulled, false);
        assert.equal(obj.castShadow, true);
        assert.equal(obj.receiveShadow, true);
      }
    });
    assert.equal(meshCount, 1);
    assert.ok(glbClone && Math.abs(glbClone.scale.x - expectedScale) < 1e-4);
    assert.ok(animalRoot && Math.abs(animalRoot.scale.x - 0.25) < 1e-4);
    if (expectedAccent) {
      assert.ok(accentNode, `Expected ${expectedAccent} attached`);
    } else {
      let hasExtra = false;
      root.traverse((obj) => {
        if (obj.name === 'OwlEarTufts' || obj.name === 'WishCrown') hasExtra = true;
      });
      assert.equal(hasExtra, false);
    }
  };

  checkBird(owlRoot, 1.32, 'OwlEarTufts');
  checkBird(wrenRoot, 0.78, null);
  checkBird(wishRoot, 0.76, 'WishCrown');
});

test('Feline morph target weight, all skeletal bone attachments, and Rare aura sprite', () => {
  const h = loadAnimalsHarness();

  const foxRoot = new h.THREE.Group('FrostFox');
  h.Animals.attachToCritter(foxRoot, { name: 'Frost Fox', plan: 'quad', color: 0xbfe3f0 });
  foxRoot.traverse((o) => {
    if (o.morphTargetInfluences) assert.equal(o.morphTargetInfluences[0], 0.0);
  });

  const lynxRoot = new h.THREE.Group('MossLynx');
  h.Animals.attachToCritter(lynxRoot, { name: 'Moss Lynx', plan: 'quad', color: 0x8fce6a });
  let lynxMorphCount = 0;
  let lynxTufts = null;
  lynxRoot.traverse((o) => {
    if (o.morphTargetInfluences) {
      lynxMorphCount++;
      assert.equal(o.morphTargetInfluences[0], 1.0);
    }
    if (o.name === 'LynxEarTufts') lynxTufts = o;
  });
  assert.equal(lynxMorphCount, 3);
  assert.equal(lynxTufts?.parent?.name, 'Head');

  const uniRoot = new h.THREE.Group('Unicorn');
  h.Animals.attachToCritter(uniRoot, { name: 'Starlight Unicorn', plan: 'quad', color: 0xa887d6 });
  let horn = null;
  uniRoot.traverse((o) => { if (o.name === 'UnicornHorn') horn = o; });
  assert.equal(horn?.parent?.name, 'Head');

  const drakeRoot = new h.THREE.Group('Drake');
  h.Animals.attachToCritter(drakeRoot, { name: 'Ember Drake', plan: 'lizard', color: 0xf78e5d });
  let crest = null;
  drakeRoot.traverse((o) => { if (o.name === 'DrakeEmberCrest') crest = o; });
  assert.equal(crest?.parent?.name, 'Torso');

  const fireflyRoot = new h.THREE.Group('Firefly');
  h.Animals.attachToCritter(fireflyRoot, { name: 'Lantern Firefly', plan: 'bug', color: 0xbde36a });
  let lantern = null;
  fireflyRoot.traverse((o) => { if (o.name === 'FireflyLantern') lantern = o; });
  assert.equal(lantern?.parent?.name, 'Abdomen');

  const eelRoot = new h.THREE.Group('Eel');
  h.Animals.attachToCritter(eelRoot, { name: 'Kelp Eel', plan: 'eel', color: 0x5ab86a });
  let fronds = null;
  eelRoot.traverse((o) => { if (o.name === 'KelpFronds') fronds = o; });
  assert.equal(fronds?.parent?.name, 'Body');

  const stagRoot = new h.THREE.Group('Stag');
  h.Animals.attachToCritter(stagRoot, { name: 'Celestial Stag', plan: 'quad', archetype: 'stag', color: 0xf6ecd4, rare: true });
  let aura = null;
  let stagClone = null;
  stagRoot.traverse((o) => {
    if (o.name === 'Scene') stagClone = o;
    if (o.isSprite) aura = o;
  });
  assert.ok(aura, 'Expected Rare aura sprite on Celestial Stag');
  assert.ok(stagClone && Math.abs(stagClone.scale.x - 1.08) < 1e-4);
});

test('semantic clip routing, crossFadeTo, speed-coupled timeScale, one-shots, look-at, and zero-GC hot update', () => {
  const h = loadAnimalsHarness();
  const root = new h.THREE.Group('AuroraFox');
  const ctrl = h.Animals.attachToCritter(root, {
    name: 'Aurora Fox',
    plan: 'quad',
    color: 0x7df0e4,
    rare: true,
  });

  const mixer = h.THREE._mixers[0];
  const findAction = (clipName) => {
    for (const act of mixer.actions.values()) {
      if (act.getClip().name === clipName) return act;
    }
    return null;
  };

  assert.equal(ctrl.state.clip, 'idle');

  ctrl.update(0.016, 0.1, { mode: 'eat', speed: 0 });
  assert.equal(ctrl.state.clip, 'eat');
  assert.ok(findAction('AnimalArmature|Idle').crossFades.some((c) => c.to === 'AnimalArmature|Eating' && c.dur === 0.16));

  ctrl.update(0.016, 0.2, { mode: 'walk', speed: 2.8, refSpeed: 2.8, isMoving: true });
  assert.equal(ctrl.state.clip, 'walk');
  assert.ok(Math.abs(ctrl.state.timeScale - 1.0) < 1e-4);

  ctrl.update(0.016, 0.3, { mode: 'run', speed: 12.0, refSpeed: 5.0, isMoving: true });
  assert.equal(ctrl.state.clip, 'run');
  assert.equal(ctrl.state.timeScale, 1.75);

  ctrl.update(0.016, 0.4, { mode: 'jump', speed: 4.0, airborne: true });
  assert.equal(ctrl.state.clip, 'jump');
  assert.ok(findAction('AnimalArmature|Gallop').crossFades.some((c) => c.to === 'AnimalArmature|Gallop_Jump' && c.dur === 0.07));

  ctrl.triggerOneShot('attack', 0.15);
  ctrl.update(0.016, 0.42, { mode: 'idle', speed: 0 });
  assert.equal(ctrl.state.clip, 'attack');
  assert.ok(findAction('AnimalArmature|Gallop_Jump').crossFades.some((c) => c.to === 'AnimalArmature|Attack' && c.dur === 0.07));

  // After one-shot expires, returns smoothly to base locomotion
  ctrl.update(0.10, 0.52, { mode: 'walk', speed: 2.0, refSpeed: 2.8, isMoving: true });
  ctrl.update(0.08, 0.60, { mode: 'walk', speed: 2.0, refSpeed: 2.8, isMoving: true });
  assert.equal(ctrl.state.clip, 'walk');

  ctrl.triggerOneShot('hit', 0.12);
  ctrl.update(0.016, 0.62, { mode: 'idle', speed: 0 });
  assert.equal(ctrl.state.clip, 'hit');

  // Look-at bounded damping & Head bone modification
  let headBone = null;
  root.traverse((o) => { if (o.name === 'Head') headBone = o; });
  ctrl.setLookTarget(5, 2.5, 0);
  for (let i = 0; i < 30; i++) {
    ctrl.update(0.016, 0.7 + i * 0.016, { mode: 'idle', speed: 0, facingYaw: 0, posX: 0, posY: 0, posZ: 0 });
  }
  assert.ok(ctrl.state.lookYaw > 0.15 && ctrl.state.lookYaw <= 0.42);
  assert.ok(ctrl.state.lookPitch > 0.05 && ctrl.state.lookPitch <= 0.24);
  const headRotSum = Math.abs(headBone.quaternion.x) + Math.abs(headBone.quaternion.y) + Math.abs(headBone.quaternion.z);
  assert.ok(headRotSum > 0.05, 'Expected Head bone quaternion rotated toward lookTarget');

  ctrl.clearLookTarget();

  // Death holds final pose with LoopOnce + clampWhenFinished
  ctrl.triggerOneShot('death');
  ctrl.update(0.016, 1.3, { mode: 'idle', speed: 0 });
  assert.equal(ctrl.state.clip, 'death');
  const deathAct = findAction('AnimalArmature|Death');
  assert.equal(deathAct.loop, h.THREE.LoopOnce);
  assert.equal(deathAct.clampWhenFinished, true);

  // Zero-GC hot update loop verification
  h.THREE._resetAllocs();
  ctrl.triggerOneShot('attack', 0.25);
  ctrl.setLookTarget(3, 1, 4);
  for (let f = 0; f < 120; f++) {
    ctrl.update(0.016, 2.0 + f * 0.016, {
      mode: f % 40 < 20 ? 'walk' : 'run',
      speed: f % 40 < 20 ? 2.5 : 6.2,
      refSpeed: 4.0,
      isMoving: true,
      facingYaw: 0.2,
      posX: f * 0.05,
      posY: 0,
      posZ: 0,
      hurtFlash: f === 10 ? 0.8 : 0,
    });
  }
  assert.equal(h.THREE._allocs.vec3, 0, 'Zero Vector3 allocations in update()');
  assert.equal(h.THREE._allocs.quat, 0, 'Zero Quaternion allocations in update()');
  assert.equal(h.THREE._allocs.euler, 0, 'Zero Euler allocations in update()');
  assert.equal(h.THREE._allocs.color, 0, 'Zero Color allocations in update()');
});

test('swimmer/beetle/flyer semantic clip fallbacks and mammal ear micro-twitch', () => {
  const h = loadAnimalsHarness();

  const tangRoot = new h.THREE.Group('Tang');
  const tangCtrl = h.Animals.attachToCritter(tangRoot, { name: 'Seafoam Fin', plan: 'fish', color: 0x6ad9d0 });
  assert.equal(tangCtrl.state.clip, 'swim');
  tangCtrl.update(0.016, 0.2, { inWater: true, speed: 5.5, refSpeed: 2.6 });
  assert.equal(tangCtrl.state.clip, 'swimFast');
  const tangMixer = h.THREE._mixers[0];
  let tangFastPlaying = false;
  for (const act of tangMixer.actions.values()) {
    if (act.getClip().name === 'Fish_Armature|Swimming_Fast' && act.playing) tangFastPlaying = true;
  }
  assert.equal(tangFastPlaying, true);

  const mantaRoot = new h.THREE.Group('Manta');
  const mantaCtrl = h.Animals.attachToCritter(mantaRoot, { name: 'Starlight Manta', plan: 'fish', archetype: 'manta', color: 0x2f5498 });
  assert.equal(mantaCtrl.state.clip, 'swim');
  mantaCtrl.update(0.016, 0.4, { inWater: true, speed: 3.0 });
  const mantaMixer = h.THREE._mixers[1];
  assert.equal(mantaMixer.actions.size > 0, true);

  const beetleRoot = new h.THREE.Group('Beetle');
  const beetleCtrl = h.Animals.attachToCritter(beetleRoot, { name: 'Berry Beetle', plan: 'bug', color: 0xe2656a });
  beetleCtrl.update(0.016, 0.5, { mode: 'sleep', speed: 0 });
  assert.equal(beetleCtrl.state.clip, 'sleep');
  beetleCtrl.update(0.016, 0.6, { mode: 'eat', speed: 0 });
  assert.equal(beetleCtrl.state.clip, 'eat');

  // Verify mammal ear micro-twitch triggers across time cycle
  const foxRoot = new h.THREE.Group('Fox');
  const foxCtrl = h.Animals.attachToCritter(foxRoot, { name: 'Frost Fox', plan: 'quad', color: 0xbfe3f0 });
  let earL = null;
  foxRoot.traverse((o) => { if (o.name === 'Ear1L') earL = o; });
  let maxEarX = 0;
  for (let i = 0; i < 200; i++) {
    foxCtrl.update(0.016, i * 0.025, { mode: 'idle', speed: 0 });
    maxEarX = Math.max(maxEarX, Math.abs(earL.quaternion.x));
  }
  assert.ok(maxEarX > 0.02, 'Expected mammal Ear1L micro-twitch impulse over idle cycle');
});

test('shared-clip one-shot resumption restores LoopRepeat, paused=false, enabled=true, clampWhenFinished=false', () => {
  const h = loadAnimalsHarness();

  // Kiwi: jump aliases walk (shared AnimationAction)
  const kiwiRoot = new h.THREE.Group('Kiwi');
  const kiwiCtrl = h.Animals.attachToCritter(kiwiRoot, { name: 'Meadow Kiwi', plan: 'bird', color: 0xc9a86a });
  const kiwiMixer = h.THREE._mixers[0];
  const findAct = (mixer, clipName) => {
    for (const act of mixer.actions.values()) {
      if (act.getClip().name === clipName) return act;
    }
    return null;
  };

  kiwiCtrl.update(0.05, 0.05, { mode: 'walk', speed: 2.6, refSpeed: 2.6, isMoving: true });
  assert.equal(kiwiCtrl.state.clip, 'walk');
  const walkAct = findAct(kiwiMixer, 'walk');
  assert.equal(walkAct.loop, h.THREE.LoopRepeat);

  // Trigger jump for 0.8s (> walk clip duration 0.6s so LoopOnce hits end and sets paused=true)
  kiwiCtrl.triggerOneShot('jump', 0.8);
  assert.equal(kiwiCtrl.state.clip, 'jump');
  assert.equal(walkAct.loop, h.THREE.LoopOnce);
  assert.equal(walkAct.clampWhenFinished, true);

  for (let i = 0; i < 7; i++) {
    kiwiCtrl.update(0.1, 0.1 + i * 0.1, { mode: 'walk', speed: 2.6, refSpeed: 2.6, isMoving: true });
  }
  assert.equal(walkAct.paused, true, 'MockAction should pause at end of LoopOnce clip when clamped');

  // Advance past 0.8s one-shot duration -> must resume looping walk smoothly
  kiwiCtrl.update(0.1, 0.8, { mode: 'walk', speed: 2.6, refSpeed: 2.6, isMoving: true });
  kiwiCtrl.update(0.1, 0.9, { mode: 'walk', speed: 2.6, refSpeed: 2.6, isMoving: true });
  assert.equal(kiwiCtrl.state.clip, 'walk');
  assert.equal(walkAct.loop, h.THREE.LoopRepeat);
  assert.equal(walkAct.paused, false);
  assert.equal(walkAct.enabled, true);
  assert.equal(walkAct.clampWhenFinished, false);
  const tBefore = walkAct.time;
  kiwiCtrl.update(0.1, 1.0, { mode: 'walk', speed: 2.6, refSpeed: 2.6, isMoving: true });
  assert.ok(walkAct.time > tBefore, 'Walk animation time must keep advancing after shared-clip one-shot');

  // Drake: hit aliases idle (shared with actions.idle)
  const drakeRoot = new h.THREE.Group('Drake');
  const drakeCtrl = h.Animals.attachToCritter(drakeRoot, { name: 'Ember Drake', plan: 'lizard', color: 0xf78e5d });
  const drakeMixer = h.THREE._mixers[1];
  const idleAct = findAct(drakeMixer, 'Armature|Velociraptor_Idle');

  drakeCtrl.triggerOneShot('hit', 0.9);
  assert.equal(drakeCtrl.state.clip, 'hit');
  assert.equal(idleAct.loop, h.THREE.LoopOnce);
  assert.equal(idleAct.clampWhenFinished, true);

  for (let i = 0; i < 8; i++) {
    drakeCtrl.update(0.1, 0.1 + i * 0.1, { mode: 'idle', speed: 0 });
  }
  assert.equal(idleAct.paused, true);

  drakeCtrl.update(0.1, 0.9, { mode: 'idle', speed: 0 });
  drakeCtrl.update(0.1, 1.0, { mode: 'idle', speed: 0 });
  assert.equal(drakeCtrl.state.clip, 'idle');
  assert.equal(idleAct.loop, h.THREE.LoopRepeat);
  assert.equal(idleAct.paused, false);
  assert.equal(idleAct.enabled, true);
  assert.equal(idleAct.clampWhenFinished, false);
});

test('isZUpHead pitch sign looks up for dy>0 and down for dy<0, eel starts in swim, and rare aura falls back to SpriteMaterial', () => {
  const h = loadAnimalsHarness();

  const foxRoot = new h.THREE.Group('FoxPitch');
  const foxCtrl = h.Animals.attachToCritter(foxRoot, { name: 'Frost Fox', plan: 'quad', color: 0xbfe3f0 });
  let headBone = null;
  foxRoot.traverse((o) => { if (o.name === 'Head') headBone = o; });

  // Target straight ahead and above head height -> positive pitch tilts snout (+Y) toward +Z (up)
  foxCtrl.setLookTarget(0, 3.0, 4.0);
  for (let i = 0; i < 30; i++) {
    foxCtrl.update(0.02, i * 0.02, { mode: 'idle', speed: 0, facingYaw: 0, posX: 0, posY: 0, posZ: 0 });
  }
  assert.ok(foxCtrl.state.lookPitch > 0.1, `Expected positive lookPitch, got ${foxCtrl.state.lookPitch}`);
  assert.ok(headBone.quaternion.x > 0.03, `Expected positive Head q.x for dy>0 on Z-up head, got ${headBone.quaternion.x}`);

  // Target straight ahead and below head height -> negative pitch tilts snout downward
  foxCtrl.setLookTarget(0, -1.5, 4.0);
  for (let i = 0; i < 45; i++) {
    foxCtrl.update(0.02, 1.0 + i * 0.02, { mode: 'idle', speed: 0, facingYaw: 0, posX: 0, posY: 0, posZ: 0 });
  }
  assert.ok(foxCtrl.state.lookPitch < -0.1, `Expected negative lookPitch, got ${foxCtrl.state.lookPitch}`);
  assert.ok(headBone.quaternion.x < -0.03, `Expected negative Head q.x for dy<0 on Z-up head, got ${headBone.quaternion.x}`);

  // Eel initializes in swim clip
  const eelRoot = new h.THREE.Group('EelSwim');
  const eelCtrl = h.Animals.attachToCritter(eelRoot, { name: 'Kelp Eel', plan: 'eel', color: 0x5ab86a });
  assert.equal(eelCtrl.state.clip, 'swim');

  // Rare aura fallback uses SpriteMaterial when Shaders is absent
  const noShaderRoot = new h.THREE.Group('RareFallback');
  h.Animals.attachToCritter(noShaderRoot, { name: 'Celestial Stag', plan: 'quad', archetype: 'stag', color: 0xf6ecd4, rare: true }, { Shaders: null });
  let aura = null;
  noShaderRoot.traverse((o) => { if (o.name === 'RareAura') aura = o; });
  assert.ok(aura && aura.material instanceof h.THREE.SpriteMaterial, 'Expected SpriteMaterial fallback for RareAura');
});

function makeTestPhysicsHelpers() {
  const PLAYER_RADIUS = 0.42;
  return {
    turnToward(obj, targetYaw, dt, rate) {
      let d = targetYaw - obj.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      obj.rotation.y += d * Math.min(1, dt * rate);
    },
    resolveColliders(x, z, radius, colliders, out, footY) {
      out.x = x;
      out.z = z;
      out.hit = false;
      if (!colliders || colliders.length === 0) return out;
      const hasFootY = typeof footY === 'number';
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < colliders.length; i++) {
          const c = colliders[i];
          if (c.pad) continue;
          if (hasFootY && typeof c.topY === 'number' && footY >= c.topY - 0.18) continue;
          const minD = radius + c.r;
          const dx = out.x - c.x;
          const dz = out.z - c.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < minD * minD) {
            out.hit = true;
            const d = Math.sqrt(d2) || 1e-5;
            const push = minD - d;
            out.x += (dx / d) * push;
            out.z += (dz / d) * push;
          }
        }
      }
      return out;
    },
    getSupportHeight(x, z, footY, baseGround, colliders, vy) {
      let support = baseGround;
      if (!colliders || colliders.length === 0) return support;
      const rising = typeof vy === 'number' && vy > 0.5;
      const snapTol = rising ? 0.02 : 0.28;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (!c.standable || typeof c.topY !== 'number') continue;
        if (footY < c.topY - snapTol) continue;
        const maxR = c.r + PLAYER_RADIUS * 0.65;
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz <= maxR * maxR && c.topY > support) {
          support = c.topY;
        }
      }
      return support;
    },
  };
}

test('AnimalPhysics: createPhysicsState, smooth acceleration inertia, knockback decay, and bounded turn banking', () => {
  const h = loadAnimalsHarness();
  assert.equal(typeof h.Animals.createPhysicsState, 'function');
  assert.equal(typeof h.Animals.stepLandPhysics, 'function');

  const sp = { name: 'Frost Fox', plan: 'quad' };
  const phys = h.Animals.createPhysicsState(0, 0, 0, sp);
  assert.equal(phys.onGround, true);
  assert.equal(phys.inWater, false);
  assert.equal(phys.stepSide, 1);
  assert.equal(phys.vx, 0);
  assert.equal(phys.vy, 0);
  assert.equal(phys.vz, 0);

  const mesh = new h.THREE.Group('FoxEnt');
  const ent = { mesh, species: sp, phys, kx: 0, kz: 0 };
  const ctx = {
    Physics: makeTestPhysicsHelpers(),
    heightAt: () => 0,
    WATER_Y: -0.35,
  };

  // Frame 1 from rest must NOT teleport to full speed (desVx = 6)
  const r1 = h.Animals.stepLandPhysics(ent, 0.016, 0.016, 6.0, 0, ctx);
  assert.ok(ent.phys.vx > 0.2 && ent.phys.vx < 2.2, `Expected smooth inertia ramp on frame 1, got vx=${ent.phys.vx}`);
  assert.ok(ent.phys.smoothSpd < 2.2, `Expected smoothSpd < 2.2 on frame 1, got ${ent.phys.smoothSpd}`);
  assert.ok(r1.moved > 0);

  // Converge near 6.0 m/s
  for (let i = 0; i < 45; i++) {
    h.Animals.stepLandPhysics(ent, 0.016, (i + 2) * 0.016, 6.0, 0, ctx);
  }
  assert.ok(ent.phys.vx > 5.5 && ent.phys.vx <= 6.01, `Expected vx to approach 6.0, got ${ent.phys.vx}`);

  // Sharp 90-degree turn produces bounded non-zero bankRoll
  let peakBank = 0;
  for (let i = 0; i < 20; i++) {
    h.Animals.stepLandPhysics(ent, 0.016, 1.0 + i * 0.016, 0, 6.0, ctx);
    peakBank = Math.max(peakBank, Math.abs(ent.phys.bankRoll));
    assert.ok(Math.abs(ent.phys.bankRoll) <= 0.38 + 1e-6, `bankRoll must stay within [-0.38, 0.38], got ${ent.phys.bankRoll}`);
  }
  assert.ok(peakBank > 0.03, `Expected non-zero bankRoll on sharp 90-deg turn, got peakBank=${peakBank}`);

  // Knockback decays exponentially
  ent.kx = 8.0;
  for (let i = 0; i < 30; i++) {
    h.Animals.stepLandPhysics(ent, 0.016, 2.0 + i * 0.016, 0, 0, ctx);
  }
  assert.ok(Math.abs(ent.kx) < 0.3, `Expected knockback kx to decay exponentially, got ${ent.kx}`);
});

test('AnimalPhysics: auto-vault jumps over 0.85u boulder/step-up, fires jump one-shot, and lands via gravity', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();

  // Case A: solid standable boulder collider (topY = 0.85)
  const sp = { name: 'Timber Wolf', plan: 'quad' };
  const meshA = new h.THREE.Group('Wolf');
  const oneShots = [];
  meshA.userData.animalRig = {
    triggerOneShot(name, dur) { oneShots.push({ name, dur }); },
  };
  const entA = { mesh: meshA, species: sp, phys: h.Animals.createPhysicsState(0, 0, 0, sp) };
  const colliders = [{ x: 1.0, z: 0, r: 0.7, topY: 0.85, standable: true }];
  const ctxA = {
    Physics,
    heightAt: () => 0,
    getNearbyColliders(x, z, r, out) {
      out.length = 0;
      for (const c of colliders) out.push(c);
      return out;
    },
    WATER_Y: -0.35,
  };

  let jumped = false;
  let landedOnTop = false;
  for (let i = 0; i < 90; i++) {
    const res = h.Animals.stepLandPhysics(entA, 0.016, i * 0.016, 5.0, 0, ctxA);
    if (res.jumped) {
      jumped = true;
      assert.ok(entA.phys.vy > 6.5, `Expected vault jump vy > 6.5, got ${entA.phys.vy}`);
      assert.equal(entA.phys.onGround, false);
      assert.ok(entA.phys.jumpCd > 0.7);
    }
    if (jumped && res.landed && meshA.position.y >= 0.84) {
      landedOnTop = true;
    }
  }
  assert.equal(jumped, true, 'Expected auto-vault jump when hitting solid 0.85u boulder');
  assert.equal(landedOnTop, true, `Expected smooth gravity landing on top of 0.85u boulder, final y=${meshA.position.y}`);
  assert.equal(entA.phys.onGround, true);
  assert.ok(oneShots.some((s) => s.name === 'jump' && Math.abs(s.dur - 0.55) < 1e-4));

  // Case B: 0.85u terrain step-up in heightAt
  const meshB = new h.THREE.Group('FoxStep');
  const entB = { mesh: meshB, species: { name: 'Frost Fox', plan: 'quad' }, phys: h.Animals.createPhysicsState(0, 0, 0, sp) };
  const ctxB = {
    Physics,
    heightAt: (x) => (x >= 1.0 ? 0.85 : 0),
    WATER_Y: -0.35,
  };
  let stepJumped = false;
  for (let i = 0; i < 90; i++) {
    const res = h.Animals.stepLandPhysics(entB, 0.016, i * 0.016, 4.5, 0, ctxB);
    if (res.jumped) {
      stepJumped = true;
      assert.ok(entB.phys.vy > 6.5);
      assert.equal(entB.phys.onGround, false);
    }
  }
  assert.equal(stepJumped, true, 'Expected auto-vault jump at 0.85u terrain step-up');
  assert.ok(meshB.position.x > 1.2 && Math.abs(meshB.position.y - 0.85) < 0.05, `Expected fox atop 0.85u step, got (${meshB.position.x}, ${meshB.position.y})`);
  assert.equal(entB.phys.onGround, true);
});

test('AnimalPhysics: 60-degree steep cliff discipline blocks climbing (with terrainNormalAt and finite-diff fallback)', () => {
  const h = loadAnimalsHarness();
  const slopeTan = Math.tan((60 * Math.PI) / 180);
  const cliffHeight = (x) => (x > 0 ? x * slopeTan : 0);

  // Run both WITH explicit terrainNormalAt and WITHOUT (finite-difference fallback)
  for (const useExplicitNormal of [true, false]) {
    const mesh = new h.THREE.Group('CliffWolf');
    mesh.position.set(-0.25, 0, 0);
    const sp = { name: 'Timber Wolf', plan: 'quad' };
    const ent = { mesh, species: sp, phys: h.Animals.createPhysicsState(-0.25, 0, 0, sp) };
    const ctx = {
      Physics: makeTestPhysicsHelpers(),
      heightAt: cliffHeight,
      WATER_Y: -0.35,
    };
    if (useExplicitNormal) {
      ctx.terrainNormalAt = (x, _z, out) => {
        if (x > 0) {
          out.x = -Math.sin((60 * Math.PI) / 180);
          out.y = Math.cos((60 * Math.PI) / 180);
          out.z = 0;
        } else {
          out.x = 0;
          out.y = 1;
          out.z = 0;
        }
        return out;
      };
    }

    for (let i = 0; i < 50; i++) {
      const res = h.Animals.stepLandPhysics(ent, 0.016, i * 0.016, 5.5, 0, ctx);
      assert.equal(res.jumped, false, 'Must NOT vault up a continuous 60-deg cliff');
    }
    assert.ok(mesh.position.x <= 0.12, `Expected 60-deg cliff to block uphill climb (explicitNorm=${useExplicitNormal}), got x=${mesh.position.x}`);
    assert.ok(mesh.position.y <= 0.25, `Must not snap up cliff wall, got y=${mesh.position.y}`);
  }

  // Gentle 25-deg slope (< 44 deg) MUST remain climbable
  const gentleTan = Math.tan((25 * Math.PI) / 180);
  const gentleMesh = new h.THREE.Group('GentleWolf');
  gentleMesh.position.set(0, 0, 0);
  const gentleEnt = { mesh: gentleMesh, species: { name: 'Timber Wolf', plan: 'quad' }, phys: h.Animals.createPhysicsState(0, 0, 0) };
  const gentleCtx = {
    Physics: makeTestPhysicsHelpers(),
    heightAt: (x) => (x > 0 ? x * gentleTan : 0),
    WATER_Y: -0.35,
  };
  for (let i = 0; i < 45; i++) {
    h.Animals.stepLandPhysics(gentleEnt, 0.016, i * 0.016, 4.5, 0, gentleCtx);
  }
  assert.ok(gentleMesh.position.x > 1.8 && gentleMesh.position.y > 0.8, `Expected smooth climbing on 25-deg slope, got (${gentleMesh.position.x}, ${gentleMesh.position.y})`);
});

test('AnimalPhysics: deep-water buoyancy, swim drag, splash ripples, footprints, and gallop dust', () => {
  const h = loadAnimalsHarness();
  const sp = { name: 'Frost Fox', plan: 'quad' };
  const mesh = new h.THREE.Group('SwimFox');
  mesh.position.set(0, -0.35, 0);
  const ent = { mesh, species: sp, phys: h.Animals.createPhysicsState(0, -0.35, 0, sp) };

  let splashes = 0;
  let footprints = 0;
  let dusts = 0;
  const waterCtx = {
    Physics: makeTestPhysicsHelpers(),
    heightAt: () => -4.0,
    WATER_Y: -0.35,
    Shaders: { waterHeightAt: () => 0 },
    splashBurst: () => { splashes++; },
  };

  for (let i = 0; i < 90; i++) {
    const res = h.Animals.stepLandPhysics(ent, 0.016, i * 0.016, 6.0, 0, waterCtx);
    assert.equal(res.inWater, true);
    assert.equal(ent.phys.inWater, true);
    assert.equal(ent.phys.onGround, false);
    assert.ok(mesh.position.y > -0.35 - 0.65, `Land animal must float near WATER_Y, never sink! y=${mesh.position.y}`);
  }
  assert.ok(mesh.position.y < -0.35 && mesh.position.y > -0.85, `Expected buoyant float just below WATER_Y, got y=${mesh.position.y}`);
  assert.ok(ent.phys.smoothSpd < 4.5, `Expected swim drag to throttle horizontal speed, got ${ent.phys.smoothSpd}`);
  assert.ok(splashes > 0, 'Expected splashBurst ripples while swimming');

  // Dry sand galloping emits footprints & dust
  const dryMesh = new h.THREE.Group('SandFox');
  const dryEnt = { mesh: dryMesh, species: sp, phys: h.Animals.createPhysicsState(0, 0, 0, sp) };
  const dryCtx = {
    Physics: makeTestPhysicsHelpers(),
    heightAt: () => 1.0,
    surfaceAt: () => 'sand',
    stampFootprint: () => { footprints++; },
    dustBurst: () => { dusts++; },
    WATER_Y: -0.35,
  };
  dryMesh.position.set(0, 1.0, 0);
  for (let i = 0; i < 60; i++) {
    h.Animals.stepLandPhysics(dryEnt, 0.016, i * 0.016, 6.2, 0, dryCtx);
  }
  assert.ok(footprints >= 4, `Expected distance-synced sand footprints, got ${footprints}`);
  assert.ok(dusts >= 1, `Expected gallop dust bursts at high speed, got ${dusts}`);
});

test('AnimalPhysics: stepAerialPhysics skims above water and banks on turns; stepAquaticPhysics stays strictly inside water column', () => {
  const h = loadAnimalsHarness();
  assert.equal(typeof h.Animals.stepAerialPhysics, 'function');
  assert.equal(typeof h.Animals.stepAquaticPhysics, 'function');

  const Physics = makeTestPhysicsHelpers();

  // Aerial flyer over deep water
  const owlSp = { name: 'Golden Owl', plan: 'bird' };
  const owlMesh = new h.THREE.Group('Owl');
  owlMesh.position.set(0, 1.0, 0);
  const owlEnt = { mesh: owlMesh, species: owlSp, phys: h.Animals.createPhysicsState(0, 1.0, 0, owlSp) };
  const seaCtx = {
    Physics,
    heightAt: () => -6.0,
    WATER_Y: -0.35,
  };

  for (let i = 0; i < 60; i++) {
    const res = h.Animals.stepAerialPhysics(owlEnt, 0.016, i * 0.016, 4.5, 0, 1.4, seaCtx);
    assert.equal(res.inWater, false);
    assert.ok(owlMesh.position.y > -0.35 + 0.8, `Flyer must stay well above water, got y=${owlMesh.position.y}`);
  }
  // Sharp aerial turn produces banking
  let owlPeakBank = 0;
  for (let i = 0; i < 20; i++) {
    h.Animals.stepAerialPhysics(owlEnt, 0.016, 1.0 + i * 0.016, 0, 4.5, 1.4, seaCtx);
    owlPeakBank = Math.max(owlPeakBank, Math.abs(owlEnt.phys.bankRoll));
  }
  assert.ok(owlPeakBank > 0.02, `Expected aerial bankRoll on turn, got ${owlPeakBank}`);

  // Aquatic swimmer bounded strictly in [heightAt + 0.75, WATER_Y - 0.85] = [-5.25, -1.20]
  const fishSp = { name: 'Seafoam Fin', plan: 'fish' };
  const fishMesh = new h.THREE.Group('Fish');
  fishMesh.position.set(0, -3.0, 0);
  const fishEnt = { mesh: fishMesh, species: fishSp, phys: h.Animals.createPhysicsState(0, -3.0, 0, fishSp) };

  // Extreme upward surge
  for (let i = 0; i < 60; i++) {
    const res = h.Animals.stepAquaticPhysics(fishEnt, 0.016, i * 0.016, 3.0, 25.0, 0, seaCtx);
    assert.equal(res.inWater, true);
    assert.ok(fishMesh.position.y <= -0.35 - 0.85 + 1e-6, `Swimmer must stay <= WATER_Y - 0.85, got ${fishMesh.position.y}`);
    assert.ok(fishMesh.position.y >= -6.0 + 0.75 - 1e-6);
  }
  assert.equal(fishEnt.phys.vy, 0, 'Outward upward vy must be zeroed at upper clamp');

  // Extreme downward dive
  for (let i = 0; i < 60; i++) {
    h.Animals.stepAquaticPhysics(fishEnt, 0.016, 1.0 + i * 0.016, 0, -25.0, 3.0, seaCtx);
    assert.ok(fishMesh.position.y >= -6.0 + 0.75 - 1e-6, `Swimmer must stay >= heightAt + 0.75, got ${fishMesh.position.y}`);
    assert.ok(fishMesh.position.y <= -0.35 - 0.85 + 1e-6);
  }
  assert.equal(fishEnt.phys.vy, 0, 'Outward downward vy must be zeroed at lower clamp');

  // Zero-GC verification across all 3 physics steppers
  const landEnt = { mesh: new h.THREE.Group('ZeroGC'), species: { name: 'Frost Fox', plan: 'quad' }, phys: h.Animals.createPhysicsState(0, 0, 0) };
  h.THREE._resetAllocs();
  for (let f = 0; f < 60; f++) {
    h.Animals.stepLandPhysics(landEnt, 0.016, f * 0.016, 4.0, 1.5, seaCtx);
    h.Animals.stepAerialPhysics(owlEnt, 0.016, f * 0.016, 3.0, 2.0, 1.4, seaCtx);
    h.Animals.stepAquaticPhysics(fishEnt, 0.016, f * 0.016, 2.5, 0.4, -1.5, seaCtx);
  }
  assert.equal(h.THREE._allocs.vec3, 0, 'Zero Vector3 allocations in AnimalPhysics steppers');
  assert.equal(h.THREE._allocs.quat, 0, 'Zero Quaternion allocations in AnimalPhysics steppers');
  assert.equal(h.THREE._allocs.euler, 0, 'Zero Euler allocations in AnimalPhysics steppers');
  assert.equal(h.THREE._allocs.color, 0, 'Zero Color allocations in AnimalPhysics steppers');
});

test('AnimalPhysics regressions: 50-deg cliff no-vault, YXZ Euler & negative side-slope roll, lazy phys/dt=0, and water-to-shore exit', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();

  // 1) 50-deg continuous cliff (in the 44..56 deg range) must reject uphill climb and NOT vault
  const slope50Tan = Math.tan((50 * Math.PI) / 180);
  const cliff50Mesh = new h.THREE.Group('Cliff50');
  cliff50Mesh.position.set(-0.25, 0, 0);
  const cliff50Ent = { mesh: cliff50Mesh, species: { name: 'Timber Wolf', plan: 'quad' }, phys: h.Animals.createPhysicsState(-0.25, 0, 0) };
  const cliff50Ctx = {
    Physics,
    heightAt: (x) => (x > 0 ? x * slope50Tan : 0),
    WATER_Y: -0.35,
  };
  for (let i = 0; i < 50; i++) {
    const res = h.Animals.stepLandPhysics(cliff50Ent, 0.016, i * 0.016, 5.5, 0, cliff50Ctx);
    assert.equal(res.jumped, false, 'Must NOT vault up a continuous 50-deg slope');
  }
  assert.ok(cliff50Mesh.position.x <= 0.12, `Expected 50-deg cliff to block climbing, got x=${cliff50Mesh.position.x}`);

  // 2) Euler order is enforced to YXZ and side-slope roll tilts -asin(rightDot) when normal tilts toward +X
  const slopeMesh = new h.THREE.Group('SlopeRoll');
  slopeMesh.rotation.order = 'XYZ';
  const slopeEnt = { mesh: slopeMesh, species: { name: 'Frost Fox', plan: 'quad' } };
  const slopeCtx = {
    Physics,
    heightAt: () => 0,
    terrainNormalAt: (_x, _z, out) => {
      // Normal tilted toward world +X (facing +Z => local +X)
      out.x = 0.35;
      out.y = Math.sqrt(1 - 0.35 * 0.35);
      out.z = 0;
      return out;
    },
    WATER_Y: -0.35,
  };
  // Walk straight along +Z so right = +X and turnRate = 0
  for (let i = 0; i < 40; i++) {
    h.Animals.stepLandPhysics(slopeEnt, 0.016, i * 0.016, 0, 3.0, slopeCtx);
  }
  assert.equal(slopeMesh.rotation.order, 'YXZ', 'Expected rot.order enforced to YXZ');
  assert.ok(slopeMesh.rotation.z < -0.25, `Expected negative roll (-asin(0.35)) for +X-tilted normal, got z=${slopeMesh.rotation.z}`);

  // 3) Lazy ent.phys initialization, omitted ctx, and explicit dt=0 early return
  const lazyLand = { mesh: new h.THREE.Group('LazyLand'), species: { name: 'Frost Fox', plan: 'quad' } };
  const r0 = h.Animals.stepLandPhysics(lazyLand, 0, 0, 5.0, 0);
  assert.equal(r0.moved, 0, 'dt=0 must return moved=0 without advancing');
  assert.equal(lazyLand.mesh.position.x, 0);
  assert.ok(lazyLand.phys, 'Expected lazy ent.phys initialization');
  const rStep = h.Animals.stepLandPhysics(lazyLand, 0.016, 0.016, 4.0, 0);
  assert.ok(rStep.moved > 0, 'Omitted ctx should default gracefully and move');

  const lazyAir = { mesh: new h.THREE.Group('LazyAir'), species: { name: 'Cloud Wren', plan: 'bird' } };
  assert.equal(h.Animals.stepAerialPhysics(lazyAir, 0, 0, 3, 0, 1.2).moved, 0);
  assert.equal(lazyAir.mesh.rotation.order, 'YXZ');

  const lazyAqua = { mesh: new h.THREE.Group('LazyAqua'), species: { name: 'Seafoam Fin', plan: 'fish' } };
  assert.equal(h.Animals.stepAquaticPhysics(lazyAqua, 0, 0, 2, 0, 0).moved, 0);
  assert.equal(lazyAqua.mesh.rotation.order, 'YXZ');

  // 4) Deep-water to dry-shore exit transition (inWater: true -> false, onGround: true)
  const shoreMesh = new h.THREE.Group('ShoreFox');
  shoreMesh.position.set(-1.5, -0.5, 0);
  const shoreEnt = { mesh: shoreMesh, species: { name: 'Frost Fox', plan: 'quad' }, phys: h.Animals.createPhysicsState(-1.5, -0.5, 0) };
  const shoreCtx = {
    Physics,
    // Deep water for x < 0, smoothly rises to dry shore (y = 0.2) for x >= 0
    heightAt: (x) => (x < 0 ? -2.0 + Math.max(0, x + 0.5) * 4.0 : 0.2),
    WATER_Y: -0.35,
  };
  let sawWater = false;
  let exitedToShore = false;
  for (let i = 0; i < 120; i++) {
    const res = h.Animals.stepLandPhysics(shoreEnt, 0.016, i * 0.016, 4.5, 0, shoreCtx);
    if (res.inWater) sawWater = true;
    if (sawWater && !res.inWater && shoreEnt.phys.onGround) {
      exitedToShore = true;
      break;
    }
  }
  assert.equal(sawWater, true, 'Expected animal to start swimming in deep water');
  assert.equal(exitedToShore, true, `Expected clean water->shore exit transition, pos=(${shoreMesh.position.x}, ${shoreMesh.position.y}), inWater=${shoreEnt.phys.inWater}, onGround=${shoreEnt.phys.onGround}`);
});

// =========================================================================
// Task 5: AnimalAI Tests (Rare Species, Wild Ecosystem, Pack Combat, Boids, Wish & Zero-GC)
// =========================================================================

test('AnimalAI: RARE_SPECIES catalog, rollRareSpecies mutation rolls, and getTemperament', () => {
  const h = loadAnimalsHarness();
  assert.ok(Array.isArray(h.Animals.RARE_SPECIES), 'Animals.RARE_SPECIES must be exported');
  assert.equal(h.Animals.RARE_SPECIES.length, 6, 'Expected 6 curated rare mythic species');
  assert.equal(typeof h.Animals.rollRareSpecies, 'function');
  assert.equal(typeof h.Animals.getTemperament, 'function');

  const expectedRareNames = [
    'Celestial Stag',
    'Aurora Fox',
    'Eclipse Wolf',
    'Astral Unicorn',
    'Solar Owl',
    'Starfire Drake',
  ];
  for (const name of expectedRareNames) {
    const entry = h.Animals.RARE_SPECIES.find((r) => r.name === name);
    assert.ok(entry, `Expected rare species ${name}`);
    assert.equal(entry.rare, true);
    assert.equal(entry.bonusHp, 3);
    assert.equal(entry.attackDmg, 2);
    assert.equal(typeof entry.auraColor, 'number');
    assert.ok(Array.isArray(entry.names) && entry.names.length > 0);
  }

  const foxBase = { name: 'Frost Fox', plan: 'quad', archetype: 'fox', color: 0xbfe3f0 };
  const wolfBase = { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', color: 0x8e6947 };
  const uniBase = { name: 'Starlight Unicorn', plan: 'quad', archetype: 'deer', color: 0xa887d6 };
  const owlBase = { name: 'Golden Owl', plan: 'bird', archetype: 'owl', color: 0xf7d948 };
  const drakeBase = { name: 'Ember Drake', plan: 'lizard', archetype: 'lizard', color: 0xf78e5d };
  const lynxBase = { name: 'Moss Lynx', plan: 'quad', archetype: 'cat', color: 0x8fce6a };

  // r < 0.045 -> Celestial Stag
  const stagRoll = h.Animals.rollRareSpecies(foxBase, () => 0.02);
  assert.equal(stagRoll.name, 'Celestial Stag');
  assert.equal(stagRoll.rare, true);
  assert.equal(stagRoll.bonusHp, 3);
  assert.equal(stagRoll.attackDmg, 2);
  assert.notEqual(stagRoll, h.Animals.RARE_SPECIES[0], 'rollRareSpecies should return a clean shallow copy');

  // 0.045 <= r < 0.12 -> matching mythic variant
  assert.equal(h.Animals.rollRareSpecies(foxBase, () => 0.08).name, 'Aurora Fox');
  assert.equal(h.Animals.rollRareSpecies(wolfBase, () => 0.08).name, 'Eclipse Wolf');
  assert.equal(h.Animals.rollRareSpecies(uniBase, () => 0.08).name, 'Astral Unicorn');
  assert.equal(h.Animals.rollRareSpecies(owlBase, () => 0.08).name, 'Solar Owl');
  assert.equal(h.Animals.rollRareSpecies(drakeBase, () => 0.08).name, 'Starfire Drake');
  // Base with no direct variant falls back to Celestial Stag when rare hits
  assert.equal(h.Animals.rollRareSpecies(lynxBase, () => 0.08).name, 'Celestial Stag');

  // r >= 0.12 -> baseSpecies unchanged
  assert.equal(h.Animals.rollRareSpecies(foxBase, () => 0.12), foxBase);
  assert.equal(h.Animals.rollRareSpecies(owlBase, () => 0.75), owlBase);

  // Temperament table
  assert.equal(h.Animals.getTemperament({ name: 'Frost Fox' }), 'shy');
  assert.equal(h.Animals.getTemperament({ name: 'Aurora Fox' }), 'shy');
  assert.equal(h.Animals.getTemperament({ name: 'Starlight Unicorn' }), 'shy');
  assert.equal(h.Animals.getTemperament({ name: 'Astral Unicorn' }), 'shy');
  assert.equal(h.Animals.getTemperament({ name: 'Celestial Stag' }), 'shy');
  assert.equal(h.Animals.getTemperament({ name: 'Timber Wolf' }), 'curious');
  assert.equal(h.Animals.getTemperament({ name: 'Eclipse Wolf' }), 'curious');
  assert.equal(h.Animals.getTemperament({ name: 'Woodland Cub' }), 'curious');
  assert.equal(h.Animals.getTemperament({ name: 'Moss Lynx' }), 'curious');
  assert.equal(h.Animals.getTemperament({ name: 'Meadow Kiwi' }), 'curious');
  assert.equal(h.Animals.getTemperament({ name: 'Cloud Wren' }), 'aerial');
  assert.equal(h.Animals.getTemperament({ name: 'Golden Owl' }), 'aerial');
  assert.equal(h.Animals.getTemperament({ name: 'Solar Owl' }), 'aerial');
  assert.equal(h.Animals.getTemperament({ name: 'Lantern Firefly' }), 'aerial');
  assert.equal(h.Animals.getTemperament({ name: 'Wish' }), 'aerial');
  assert.equal(h.Animals.getTemperament({ name: 'Berry Beetle' }), 'busy');
  assert.equal(h.Animals.getTemperament({ name: 'Ember Drake' }), 'busy');
  assert.equal(h.Animals.getTemperament({ name: 'Starfire Drake' }), 'busy');
});

test('AnimalAI: updateWild daily life (graze eat, curious look-at, fleeGloom, rare toast without emojis, 90u despawn)', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  assert.equal(typeof h.Animals.updateWild, 'function');

  const scene = new h.THREE.Group('Scene');
  const wild = [];
  const toasts = [];
  const bursts = [];
  let chimes = 0;
  let spawnCalls = 0;

  // Deterministic rng returning 0.3 so wander cycles reliably into graze
  const ctx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    scene,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0 },
    glooms: [],
    heightAt: () => 0,
    WATER_Y: -0.35,
    rng: () => 0.3,
    toast: (msg, dur) => toasts.push({ msg, dur }),
    burst: (x, y, z, col, count) => bursts.push({ x, y, z, col, count }),
    Sound: { chime: () => { chimes++; } },
    spawnWild: () => {
      spawnCalls++;
      const sp = { name: 'Woodland Cub', plan: 'quad', archetype: 'bear', color: 0x9b7653 };
      const mesh = new h.THREE.Group('WildCub');
      mesh.position.set(16 + wild.length * 2, 0, 16);
      h.Animals.attachToCritter(mesh, sp);
      scene.add(mesh);
      wild.push({
        mesh,
        species: sp,
        displayName: 'Maple the Woodland Cub',
        dir: 0,
        turnT: 2,
        hopT: 0,
        gaitPhase: 0,
        smoothSpd: 0,
        dustAcc: 0,
        state: 'wander',
        stateT: 0.4,
        fleeT: 0,
        trustT: 0,
        phys: h.Animals.createPhysicsState(16 + wild.length * 2, 0, 16, sp),
        lookCand: { mesh, maxDist: 8, yOffset: 0.45 },
      });
    },
  };

  // Frame 1 replenishes up to 3 attempts toward 6 wild
  h.Animals.updateWild(wild, 0.05, 0.05, ctx);
  assert.equal(spawnCalls, 3);
  assert.equal(wild.length, 3);
  h.Animals.updateWild(wild, 0.05, 0.10, ctx);
  assert.equal(wild.length, 6);

  // Advance until first critter transitions wander -> graze (mode 'eat')
  const lead = wild[0];
  let sawEat = false;
  for (let i = 0; i < 30; i++) {
    h.Animals.updateWild(wild, 0.05, 0.15 + i * 0.05, ctx);
    if (lead.state === 'graze' && lead.mesh.userData.animalRig.state.clip === 'eat') {
      sawEat = true;
      break;
    }
  }
  assert.equal(sawEat, true, `Expected wild critter to transition wander -> graze with 'eat' clip, state=${lead.state}, clip=${lead.mesh.userData.animalRig.state.clip}`);

  // Curious look-at tracking
  const lookCalls = [];
  const curiousMesh = new h.THREE.Group('CuriousWolf');
  curiousMesh.position.set(8, 0, 0);
  curiousMesh.userData.animalRig = {
    state: { clip: 'idle' },
    setLookTarget(x, y, z) { lookCalls.push({ x, y, z }); },
    clearLookTarget() {},
    update() {},
  };
  const curiousWild = {
    mesh: curiousMesh,
    species: { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf' },
    displayName: 'Oak the Timber Wolf',
    dir: 0,
    state: 'curious',
    stateT: 2.0,
    fleeT: 0,
    trustT: 0,
    phys: h.Animals.createPhysicsState(8, 0, 0),
  };
  wild.push(curiousWild);
  h.Animals.updateWild(wild, 0.05, 2.0, ctx);
  assert.ok(lookCalls.length > 0, 'Curious wild critter should call rig.setLookTarget toward Starkeeper');
  assert.ok(Math.abs(lookCalls[0].y - 1.3) < 0.01, 'Look target should aim near P.y + 1.3');

  // Gloomblob within 9.0u triggers fleeGloom
  const gloomMesh = new h.THREE.Group('Gloom');
  gloomMesh.position.set(17, 0, 16);
  ctx.glooms.push({ mesh: gloomMesh, hp: 3, state: 'chase' });
  lead.mesh.position.set(14, 0, 16);
  h.Animals.updateWild(wild, 0.05, 2.1, ctx);
  assert.equal(lead.state, 'fleeGloom', 'Wild critter must flee when living Gloomblob is within 9.0u');

  // Rare Starlight sighting toast (NO emojis) within 24u
  const stagSp = h.Animals.RARE_SPECIES[0];
  const stagMesh = new h.THREE.Group('Stag');
  stagMesh.position.set(18, 0, 0);
  h.Animals.attachToCritter(stagMesh, stagSp);
  const stagWild = {
    mesh: stagMesh,
    species: stagSp,
    displayName: 'Aether the Celestial Stag',
    dir: 0,
    state: 'wander',
    stateT: 3,
    fleeT: 0,
    trustT: 0,
    phys: h.Animals.createPhysicsState(18, 0, 0, stagSp),
  };
  wild.push(stagWild);
  ctx.glooms.length = 0;
  const chimesBefore = chimes;
  h.Animals.updateWild(wild, 0.05, 2.2, ctx);
  assert.equal(stagWild.rareAnnounced, true);
  assert.ok(chimes > chimesBefore, 'Rare sighting should chime');
  const rareToast = toasts.find((t) => t.msg.includes('A rare Celestial Stag appeared nearby!'));
  assert.ok(rareToast, 'Expected rare sighting toast copy');
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(rareToast.msg), false, 'HUD toast must contain ZERO emojis');

  // Despawn beyond 90u
  stagMesh.position.set(95, 0, 0);
  h.Animals.updateWild(wild, 0.05, 2.3, ctx);
  assert.equal(wild.includes(stagWild), false, 'Wild critter beyond 90u must despawn');
});

test('AnimalAI: updateWild supports BOTH calmApproach (calmTrust) AND gentleChase (flee -> tired)', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();

  // Path 1: Calm Approach (calmTrust -> befriend)
  const scene1 = new h.THREE.Group('Scene1');
  const foxSp = { name: 'Frost Fox', plan: 'quad', archetype: 'fox', color: 0xbfe3f0 };
  const foxMesh = new h.THREE.Group('ShyFox');
  foxMesh.position.set(4.5, 0, 0);
  h.Animals.attachToCritter(foxMesh, foxSp);
  scene1.add(foxMesh);

  const wild1 = [{
    mesh: foxMesh,
    species: foxSp,
    displayName: 'Yuki the Frost Fox',
    dir: 0,
    state: 'wander',
    stateT: 3,
    fleeT: 0,
    trustT: 0,
    phys: h.Animals.createPhysicsState(4.5, 0, 0, foxSp),
  }];
  const added1 = [];
  const quests1 = [];
  const bursts1 = [];
  const ctx1 = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    scene: scene1,
    P: { x: 0, y: 0, z: 0, vx: 1.5, vz: 0, facing: 0 }, // < 4.6 calm walk
    glooms: [],
    heightAt: () => 0,
    WATER_Y: -0.35,
    spawnWild: () => {},
    addFollower: (...args) => added1.push(args),
    questEvent: (ev) => quests1.push(ev),
    burst: (x, y, z, col) => bursts1.push(col),
    Sound: { chime: () => {} },
    toast: () => {},
  };

  h.Animals.updateWild(wild1, 0.05, 0.05, ctx1);
  assert.equal(wild1[0].state, 'calmTrust', 'Gentle approach < 5.2u should enter calmTrust');

  for (let i = 0; i < 60 && wild1.length > 0; i++) {
    h.Animals.updateWild(wild1, 0.05, 0.1 + i * 0.05, ctx1);
  }
  assert.equal(wild1.length, 0, 'Calm trust > 2.2s should remove wild critter');
  assert.equal(added1.length, 1, 'Calm trust should call addFollower');
  assert.deepEqual(quests1, ['befriend']);
  assert.ok(bursts1.includes(0xff8fb0), 'Calm trust should emit pink heart particles');

  // Path 2: Gentle Chase (flee -> tired -> befriend)
  const scene2 = new h.THREE.Group('Scene2');
  const cubSp = { name: 'Woodland Cub', plan: 'quad', archetype: 'bear', color: 0x9b7653 };
  const cubMesh = new h.THREE.Group('Cub');
  cubMesh.position.set(5.0, 0, 0);
  h.Animals.attachToCritter(cubMesh, cubSp);
  scene2.add(cubMesh);

  const wild2 = [{
    mesh: cubMesh,
    species: cubSp,
    displayName: 'Koda the Woodland Cub',
    dir: 0,
    state: 'wander',
    stateT: 3,
    fleeT: 0,
    trustT: 0,
    phys: h.Animals.createPhysicsState(5.0, 0, 0, cubSp),
  }];
  const added2 = [];
  const quests2 = [];
  const toasts2 = [];
  const ctx2 = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    scene: scene2,
    P: { x: 0, y: 0, z: 0, vx: 7.0, vz: 0, facing: 0 }, // >= 4.6 sprint
    glooms: [],
    heightAt: () => 0,
    WATER_Y: -0.35,
    spawnWild: () => {},
    addFollower: (...args) => added2.push(args),
    questEvent: (ev) => quests2.push(ev),
    burst: () => {},
    Sound: { chime: () => {} },
    toast: (m) => toasts2.push(m),
  };

  h.Animals.updateWild(wild2, 0.05, 0.05, ctx2);
  assert.equal(wild2[0].state, 'flee', 'Sprinting near wild critter should trigger flee');

  // Keep player pursuing within 10u so flee reaches fleeT > 3.5 -> tired, then stay close > 2.0s
  let sawTired = false;
  for (let i = 0; i < 130 && wild2.length > 0; i++) {
    ctx2.P.x = cubMesh.position.x - 4.0;
    h.Animals.updateWild(wild2, 0.05, 0.1 + i * 0.05, ctx2);
    if (wild2[0] && wild2[0].state === 'tired') {
      sawTired = true;
      ctx2.P.vx = 0;
    }
  }
  assert.equal(sawTired, true, 'Fleeing > 3.5s should transition into tired state');
  assert.ok(toasts2.some((m) => m.includes("It's tired!")), 'Expected tired toast prompt');
  assert.equal(wild2.length, 0, 'Staying close while tired > 2.0s should befriend');
  assert.equal(added2.length, 1);
  assert.deepEqual(quests2, ['befriend']);
});

test('AnimalAI: updateFollowers flanking pack separation (>= 1.1u) and idle grazing/resting', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  assert.equal(typeof h.Animals.updateFollowers, 'function');

  const specs = [
    { name: 'Frost Fox', plan: 'quad', archetype: 'fox' },
    { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf' },
    { name: 'Woodland Cub', plan: 'quad', archetype: 'bear' },
    { name: 'Moss Lynx', plan: 'quad', archetype: 'cat' },
  ];
  const followers = specs.map((sp, i) => {
    const mesh = new h.THREE.Group(`Ally${i}`);
    mesh.position.set(0, 0, 0);
    h.Animals.attachToCritter(mesh, sp);
    return {
      mesh,
      species: sp,
      displayName: `Friend${i}`,
      hp: 3,
      maxHp: 3,
      hurtInvulnT: 0,
      flash: 0,
      atkCooldown: 0,
      attacker: null,
      defendT: 0,
      kx: 0,
      kz: 0,
      phys: h.Animals.createPhysicsState(0, 0, 0, sp),
    };
  });

  const ctx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
    glooms: [],
    heightAt: () => 0,
    WATER_Y: -0.35,
  };

  for (let f = 0; f < 65; f++) {
    h.Animals.updateFollowers(followers, 0.04, f * 0.04, ctx);
  }

  for (let i = 0; i < followers.length; i++) {
    for (let j = i + 1; j < followers.length; j++) {
      const a = followers[i].mesh.position;
      const b = followers[j].mesh.position;
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(dist >= 1.1, `Expected flanking pack separation >= 1.1u between ${i} and ${j}, got ${dist}`);
    }
  }

  // Stand still past > 3.2s total -> companions settle into graze ('eat') / rest ('idleAlt'/'sleep')
  for (let f = 0; f < 50; f++) {
    h.Animals.updateFollowers(followers, 0.04, 2.6 + f * 0.04, ctx);
  }
  const idleClips = followers.map((f) => f.mesh.userData.animalRig.state.clip);
  assert.ok(
    idleClips.some((c) => c === 'eat' || c === 'idleAlt' || c === 'sleep'),
    `Expected settled companions to enter graze/rest clip when Starkeeper stands still, got ${JSON.stringify(idleClips)}`
  );
});

test('AnimalAI: updateFollowers uncapped self-defense, species-distinct combat, rare 2-dmg, and celebrate', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  assert.equal(typeof h.Animals.celebrate, 'function');

  const hits = [];
  const bursts = [];

  // 1) Wolf parabolic Pounce Lunge + uncapped self-defense 24u away from Starkeeper
  const wolfSp = { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf' };
  const wolfMesh = new h.THREE.Group('WolfAlly');
  wolfMesh.position.set(24, 0, 0);
  const wolfShots = [];
  h.Animals.attachToCritter(wolfMesh, wolfSp);
  const origTrigger = wolfMesh.userData.animalRig.triggerOneShot;
  wolfMesh.userData.animalRig.triggerOneShot = (name, dur) => {
    wolfShots.push(name);
    origTrigger(name, dur);
  };
  const wolfAlly = {
    mesh: wolfMesh, species: wolfSp, hp: 3, maxHp: 3,
    hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 6, kx: 0, kz: 0,
    phys: h.Animals.createPhysicsState(24, 0, 0, wolfSp),
  };

  const gloomMesh1 = new h.THREE.Group('Gloom1');
  gloomMesh1.position.set(27.0, 0, 0);
  const gloom1 = { mesh: gloomMesh1, hp: 4, state: 'lunge', targetAlly: wolfAlly };
  wolfAlly.attacker = gloom1;

  // 2) Owl Aerial Dive-Swoop (airLift > 0.8) + Rare Aurora Fox dealing 2 damage
  const owlSp = { name: 'Golden Owl', plan: 'bird', archetype: 'owl' };
  const owlMesh = new h.THREE.Group('OwlAlly');
  owlMesh.position.set(0, 0.5, 4.0);
  h.Animals.attachToCritter(owlMesh, owlSp);
  const owlAlly = {
    mesh: owlMesh, species: owlSp, hp: 3, maxHp: 3,
    hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
    phys: h.Animals.createPhysicsState(0, 0.5, 4.0, owlSp),
  };

  const rareFoxSp = { ...h.Animals.RARE_SPECIES[1] }; // Aurora Fox: rare=true, attackDmg=2
  const rareMesh = new h.THREE.Group('AuroraAlly');
  rareMesh.position.set(0, 0, 1.5);
  h.Animals.attachToCritter(rareMesh, rareFoxSp);
  const rareAlly = {
    mesh: rareMesh, species: rareFoxSp, hp: 6, maxHp: 6,
    hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
    phys: h.Animals.createPhysicsState(0, 0, 1.5, rareFoxSp),
  };

  const gloomMesh2 = new h.THREE.Group('Gloom2');
  gloomMesh2.position.set(0, 0, 0.5);
  const gloom2 = { mesh: gloomMesh2, hp: 5, state: 'chase' };

  const followers = [wolfAlly, owlAlly, rareAlly];
  const ctx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
    glooms: [gloom1, gloom2],
    heightAt: () => 0,
    WATER_Y: -0.35,
    burst: (x, y, z, col, cnt) => bursts.push({ col, cnt }),
    hitGloom: (g, idx, dir, dmg, fromMelee, heavy) => {
      hits.push({ g, idx, dirX: dir.x, dirZ: dir.z, dmg, fromMelee, heavy });
      g.hp -= dmg;
    },
  };

  let wolfPeakVy = 0;
  let owlPeakAirLift = 0;
  for (let i = 0; i < 40; i++) {
    h.Animals.updateFollowers(followers, 0.025, i * 0.025, ctx);
    wolfPeakVy = Math.max(wolfPeakVy, wolfAlly.phys.vy);
    owlPeakAirLift = Math.max(owlPeakAirLift, owlAlly.phys.airLift);
  }

  assert.ok(wolfPeakVy > 3.0, `Expected Wolf parabolic pounce vy > 3.0, got ${wolfPeakVy}`);
  assert.ok(wolfShots.includes('attack'), 'Wolf pounce must trigger attack one-shot');
  assert.ok(hits.some((x) => x.g === gloom1), 'Distant wolf (24u away) must fight back in self-defense');

  assert.ok(owlPeakAirLift > 0.8, `Expected Owl aerial dive-swoop airLift > 0.8, got ${owlPeakAirLift}`);
  const rareHit = hits.find((x) => x.g === gloom2 && x.dmg === 2);
  assert.ok(rareHit, `Expected rare Aurora Fox companion to deal 2 radiant damage, hits=${JSON.stringify(hits.map(x => x.dmg))}`);

  // Celebrate triggers joyful vertical hop vy > 4.0 and jump one-shot
  const celebrateShots = [];
  for (const f of followers) {
    const rig = f.mesh.userData.animalRig;
    const prevTrig = rig.triggerOneShot;
    rig.triggerOneShot = (name, dur) => {
      celebrateShots.push({ name, dur });
      prevTrig(name, dur);
    };
  }
  h.Animals.celebrate(followers, ctx);
  for (const f of followers) {
    assert.ok(f.phys.vy > 4.0, `Expected celebrate hop vy > 4.0, got ${f.phys.vy}`);
    assert.equal(f.phys.onGround, false);
  }
  assert.equal(celebrateShots.filter((s) => s.name === 'jump').length, followers.length, 'Celebrate must trigger jump one-shot on every companion');

  // 3) Species-distinct one-shot timings & bursts for Unicorn (0.48), Drake (0.45), Beetle (0.40)
  const spShots = [];
  const spHits = [];
  const spBursts = [];
  const mkFighter = (sp, x, z) => {
    const m = new h.THREE.Group(sp.name);
    m.position.set(x, 0, z);
    h.Animals.attachToCritter(m, sp);
    const orig = m.userData.animalRig.triggerOneShot;
    m.userData.animalRig.triggerOneShot = (name, dur) => {
      spShots.push({ sp: sp.name, name, dur });
      orig(name, dur);
    };
    return {
      mesh: m, species: sp, hp: 5, maxHp: 5,
      hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
      phys: h.Animals.createPhysicsState(x, 0, z, sp),
    };
  };
  const uniAlly = mkFighter({ ...h.Animals.RARE_SPECIES[3] }, 0, 1.8);   // Astral Unicorn
  const drakeAlly = mkFighter({ ...h.Animals.RARE_SPECIES[5] }, 1.8, 0); // Starfire Drake
  const bugAlly = mkFighter({ name: 'Berry Beetle', plan: 'bug', archetype: 'beetle' }, -1.8, 0);
  const gCenter = { mesh: new h.THREE.Group('GCenter'), hp: 20, state: 'chase' };
  const spCtx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
    glooms: [gCenter],
    heightAt: () => 0,
    WATER_Y: -0.35,
    burst: (_x, _y, _z, col) => spBursts.push(col),
    hitGloom: (_g, _i, _d, dmg) => spHits.push(dmg),
  };
  for (let i = 0; i < 6; i++) h.Animals.updateFollowers([uniAlly, drakeAlly, bugAlly], 0.025, i * 0.025, spCtx);
  assert.ok(spShots.some((s) => s.sp === 'Astral Unicorn' && s.name === 'attack' && Math.abs(s.dur - 0.48) < 1e-4));
  assert.ok(spShots.some((s) => s.sp === 'Starfire Drake' && s.name === 'attack' && Math.abs(s.dur - 0.45) < 1e-4));
  assert.ok(spShots.some((s) => s.sp === 'Berry Beetle' && s.name === 'attack' && Math.abs(s.dur - 0.40) < 1e-4));
  assert.ok(spBursts.includes(0xd4a5ff), 'Expected Astral Unicorn violet starlight burst');
  assert.ok(spBursts.includes(0xff6e9c), 'Expected Starfire Drake ember burst');
  assert.ok(spHits.includes(2) && spHits.includes(1), 'Expected rare companions to deal 2 dmg and standard beetle 1 dmg');
});

test('AnimalAI: initAquatic spawns 16 reef creatures, updateAquatic schools with 3D boids & scatter, updateWish tracks & banks', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  assert.equal(typeof h.Animals.initAquatic, 'function');
  assert.equal(typeof h.Animals.updateAquatic, 'function');
  assert.equal(typeof h.Animals.updateWish, 'function');

  const scene = new h.THREE.Group('SeaScene');
  const aquaticCritters = [];
  // Minimal ctx.AQUA with 4 base species (no Starlight Manta) to verify fallback!
  const baseAqua = [
    { name: 'Seafoam Fin', plan: 'fish', color: 0x6ad9d0, aquatic: true },
    { name: 'Coral Dart', plan: 'fish', color: 0xf78ea8, aquatic: true },
    { name: 'Moon Jelly', plan: 'jelly', color: 0x8fbdf7, aquatic: true },
    { name: 'Kelp Eel', plan: 'eel', color: 0x5ab86a, aquatic: true },
  ];
  const seaCtx = {
    THREE: h.THREE,
    Physics,
    Models: {
      ...h.Models,
      makeCritter(sp, scale = 1) {
        const g = new h.THREE.Group(sp.name);
        g.scale.set(scale, scale, scale);
        return g;
      },
    },
    AQUA: baseAqua,
    scene,
    P: { x: 0, y: 2, z: 0, vx: 0, vz: 0, facing: 0 },
    heightAt: () => -8.0,
    WATER_Y: -0.35,
  };

  h.Animals.initAquatic(aquaticCritters, seaCtx);
  assert.equal(aquaticCritters.length, 16, 'initAquatic must spawn 16 Sunken City reef creatures');
  assert.equal(aquaticCritters.filter((c) => c.species.name === 'Seafoam Fin').length, 6);
  assert.equal(aquaticCritters.filter((c) => c.species.name === 'Coral Dart').length, 4);
  assert.equal(aquaticCritters.filter((c) => c.species.name === 'Kelp Eel').length, 2);
  assert.equal(aquaticCritters.filter((c) => c.species.name === 'Moon Jelly').length, 2);
  assert.equal(aquaticCritters.filter((c) => c.species.name === 'Starlight Manta').length, 2);

  // Step all 16 and verify water-column bounds [heightAt + 0.75, WATER_Y - 0.85]
  for (let i = 0; i < 30; i++) {
    h.Animals.updateAquatic(aquaticCritters, 0.03, i * 0.03, seaCtx);
    for (const ac of aquaticCritters) {
      const y = ac.mesh.position.y;
      assert.ok(y >= -8.0 + 0.75 - 1e-6 && y <= -0.35 - 0.85 + 1e-6, `Aquatic y=${y} out of bounds`);
    }
  }

  // Boids separation + swimmer scatter on two close fish
  const f1Mesh = new h.THREE.Group('F1');
  const f2Mesh = new h.THREE.Group('F2');
  f1Mesh.position.set(0, -3.0, 0);
  f2Mesh.position.set(0.2, -3.0, 0);
  const fSp = { name: 'Seafoam Fin', plan: 'fish' };
  h.Animals.attachToCritter(f1Mesh, fSp);
  h.Animals.attachToCritter(f2Mesh, fSp);
  const pair = [
    { mesh: f1Mesh, species: fSp, phys: h.Animals.createPhysicsState(0, -3.0, 0, fSp) },
    { mesh: f2Mesh, species: fSp, phys: h.Animals.createPhysicsState(0.2, -3.0, 0, fSp) },
  ];
  const pairCtx = { THREE: h.THREE, Physics, Models: h.Models, P: { x: 40, y: 0, z: 40 }, heightAt: () => -8.0, WATER_Y: -0.35 };
  for (let i = 0; i < 20; i++) h.Animals.updateAquatic(pair, 0.03, i * 0.03, pairCtx);
  const sepDist = Math.hypot(f1Mesh.position.x - f2Mesh.position.x, f1Mesh.position.z - f2Mesh.position.z);
  assert.ok(sepDist > 0.7, `Expected boids separation to push 0.2u-apart fish apart, got ${sepDist}`);

  // Scatter away when Starkeeper swims within 4.2u
  pairCtx.P = { x: f1Mesh.position.x + 1.2, y: -3.0, z: f1Mesh.position.z, swimming: true };
  const dBefore = Math.hypot(f1Mesh.position.x - pairCtx.P.x, f1Mesh.position.z - pairCtx.P.z);
  for (let i = 0; i < 20; i++) h.Animals.updateAquatic(pair, 0.03, 1.0 + i * 0.03, pairCtx);
  const dAfter = Math.hypot(f1Mesh.position.x - pairCtx.P.x, f1Mesh.position.z - pairCtx.P.z);
  assert.ok(dAfter > dBefore + 0.8, `Fish must scatter away from nearby swimmer: before=${dBefore}, after=${dAfter}`);

  // updateWish smooth aerial follow, Z-target orbit, banking, fly clip & halo pulse
  const wishMesh = new h.THREE.Group('Wish');
  wishMesh.position.set(-4, 2, -4);
  const halo = new h.THREE.Sprite(new h.THREE.SpriteMaterial());
  wishMesh.userData.halo = halo;
  h.Animals.attachToCritter(wishMesh, { name: 'Wish', plan: 'bird' });
  const wish = { mesh: wishMesh, t: 0 };
  const wishCtx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, facing: 0 },
    heightAt: () => 0,
    WATER_Y: -0.35,
  };
  for (let i = 0; i < 25; i++) h.Animals.updateWish(wish, 0.03, i * 0.03, wishCtx);
  assert.equal(wishMesh.userData.animalRig.state.clip, 'fly');
  assert.ok(halo.scale.x > 1.0, 'Halo scale must pulse');
  const dWishPlayer = Math.hypot(wishMesh.position.x - 0, wishMesh.position.z - 0);
  assert.ok(dWishPlayer < 3.0, `Wish should smoothly follow near Starkeeper, dist=${dWishPlayer}`);

  // Z-target orbit overhead
  const lockTargetMesh = new h.THREE.Group('LockedGloom');
  lockTargetMesh.position.set(10, 0, 10);
  wishCtx.Physics.lockTarget = { mesh: lockTargetMesh, yOffset: 0.6 };
  for (let i = 0; i < 40; i++) h.Animals.updateWish(wish, 0.03, 1.0 + i * 0.03, wishCtx);
  assert.ok(wishMesh.position.y > 1.5, `Wish should orbit overhead locked target, got y=${wishMesh.position.y}`);
  assert.ok(Math.hypot(wishMesh.position.x - 10, wishMesh.position.z - 10) < 2.2);
});

test('AnimalAI + Rig + Physics: runtime zero-GC verification and static hot-loop allocation scan', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();

  const foxSp = { name: 'Frost Fox', plan: 'quad', archetype: 'fox' };
  const owlSp = { name: 'Golden Owl', plan: 'bird', archetype: 'owl' };
  const fishSp = { name: 'Seafoam Fin', plan: 'fish' };

  const mkEnt = (sp, x, y, z) => {
    const m = new h.THREE.Group(sp.name);
    m.position.set(x, y, z);
    h.Animals.attachToCritter(m, sp);
    return {
      mesh: m,
      species: sp,
      displayName: sp.name,
      dir: 0,
      state: 'wander',
      stateT: 2,
      fleeT: 0,
      trustT: 0,
      hp: 3,
      maxHp: 3,
      hurtInvulnT: 0,
      flash: 0,
      atkCooldown: 0,
      attacker: null,
      defendT: 0,
      kx: 0,
      kz: 0,
      phys: h.Animals.createPhysicsState(x, y, z, sp),
    };
  };

  const wild = [mkEnt(foxSp, 10, 0, 10), mkEnt(owlSp, 12, 1, 10)];
  const followers = [mkEnt(foxSp, -2, 0, -2), mkEnt(owlSp, 2, 1, -2)];
  const aquatic = [mkEnt(fishSp, -14, -4, 82), mkEnt(fishSp, -13, -4, 83)];
  const wishMesh = new h.THREE.Group('WishGC');
  wishMesh.position.set(-1, 2, -1);
  wishMesh.userData.halo = new h.THREE.Sprite(new h.THREE.SpriteMaterial());
  h.Animals.attachToCritter(wishMesh, { name: 'Wish', plan: 'bird' });
  const wish = { mesh: wishMesh, t: 0, phys: h.Animals.createPhysicsState(-1, 2, -1) };

  const ctx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, vx: 2.0, vz: 0, facing: 0 },
    glooms: [],
    heightAt: (x, z) => (z > 50 ? -8.0 : 0),
    surfaceAt: () => 'grass',
    WATER_Y: -0.35,
    spawnWild: () => {},
    addFollower: () => {},
    questEvent: () => {},
    burst: () => {},
    toast: () => {},
    Sound: { chime: () => {} },
    scene: { add: () => {}, remove: () => {} },
  };

  h.THREE._resetAllocs();
  for (let f = 0; f < 60; f++) {
    const t = f * 0.016;
    h.Animals.updateWild(wild, 0.016, t, ctx);
    h.Animals.updateFollowers(followers, 0.016, t, ctx);
    h.Animals.updateAquatic(aquatic, 0.016, t, ctx);
    h.Animals.updateWish(wish, 0.016, t, ctx);
  }
  assert.equal(h.THREE._allocs.vec3, 0, 'Zero Vector3 allocations across AnimalAI hot loops');
  assert.equal(h.THREE._allocs.quat, 0, 'Zero Quaternion allocations across AnimalAI hot loops');
  assert.equal(h.THREE._allocs.euler, 0, 'Zero Euler allocations across AnimalAI hot loops');
  assert.equal(h.THREE._allocs.color, 0, 'Zero Color allocations across AnimalAI hot loops');

  // Static source scan on animals.js hot-loop functions
  const src = fs.readFileSync(new URL('../animals.js', import.meta.url), 'utf8');
  const extractFnBody = (fnName) => {
    const sig = `function ${fnName}(`;
    const idx = src.indexOf(sig);
    assert.ok(idx >= 0, `Expected ${sig} in animals.js`);
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
    'stepLandPhysics',
    'stepAerialPhysics',
    'stepAquaticPhysics',
    'syncEntityVisual',
    'selectFollowerTarget',
    'updateWild',
    'updateFollowers',
    'updateAquatic',
    'updateWish',
  ];
  for (const fn of hotFns) {
    const body = extractFnBody(fn);
    assert.equal(/new\s+(?:THREE|THREERef)\s*\.\s*(?:Vector3|Quaternion|Euler|Color)/.test(body), false, `Hot function ${fn} must NOT allocate THREE Vector3/Quaternion/Euler/Color`);
  }
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(src), false, 'animals.js must contain zero emojis');
});

test('AnimalAI polish regressions: wild sleep/water-swim/idempotent rare toast, no double pounce attack, Tier 2 ally & dead-player Tier 1 defense', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  const toasts = [];
  const addedFollowers = [];
  let nameRolls = 0;

  // 1. Wild rest ('sleep' clip), rareAnnounced idempotence across multiple frames, and resolved dName consistency
  const rareStag = h.Animals.rollRareSpecies({ name: 'Frost Fox', plan: 'quad', archetype: 'fox', color: 0xbfe3f0 }, () => 0.01);
  const wMesh = new h.THREE.Group();
  wMesh.position.set(12, 0, 0);
  const modesSeen = [];
  wMesh.userData.animalRig = {
    ready: true,
    state: {},
    setLookTarget() {},
    clearLookTarget() {},
    triggerOneShot() {},
    update(_dt, _t, st) { modesSeen.push(st.mode); },
  };
  const wild = [{
    mesh: wMesh,
    species: rareStag,
    displayName: undefined,
    state: 'rest',
    stateT: 2.0,
    dir: 0,
    turnT: 2,
    fleeT: 0,
    trustT: 0,
  }];
  const ctx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
    glooms: [],
    heightAt: () => 0,
    surfaceAt: () => 'grass',
    WATER_Y: -0.35,
    spawnWild: () => {},
    pickUniqueCritterName: () => { nameRolls++; return `Aether#${nameRolls} the Celestial Stag`; },
    addFollower: (_x, _y, _z, msg, _sp, givenName) => addedFollowers.push({ msg, givenName }),
    questEvent: () => {},
    burst: () => {},
    toast: (m) => toasts.push(m),
    Sound: { chime: () => {} },
    scene: { add: () => {}, remove: () => {} },
  };
  for (let i = 0; i < 6; i++) h.Animals.updateWild(wild, 0.05, i * 0.05, ctx);
  assert.ok(modesSeen.includes('sleep'), 'Resting wild animal must drive sleep clip');
  assert.equal(toasts.filter((t) => t.includes('A rare Celestial Stag')).length, 1, 'Rare toast must fire exactly once across multiple frames');

  // Calm-befriend without preset displayName passes identical resolved dName to toast and addFollower
  wMesh.position.set(2.0, 0, 0);
  wild[0].state = 'calmTrust';
  wild[0].trustT = 2.15;
  h.Animals.updateWild(wild, 0.1, 1.0, ctx);
  assert.equal(addedFollowers.length, 1);
  assert.equal(addedFollowers[0].givenName, 'Aether#1 the Celestial Stag');
  assert.ok(addedFollowers[0].msg.startsWith('Aether#1 the Celestial Stag'));

  // 2. Wild ground critter fleeing into deep water passes null mode so AnimalRig selects swim/swimFast
  const swimModes = [];
  const swMesh = new h.THREE.Group();
  swMesh.position.set(0, -0.5, 0);
  swMesh.userData.animalRig = {
    ready: true,
    state: {},
    setLookTarget() {},
    clearLookTarget() {},
    triggerOneShot() {},
    update(_dt, _t, st) { swimModes.push({ mode: st.mode, inWater: st.inWater }); },
  };
  const swimWild = [{
    mesh: swMesh,
    species: { name: 'Frost Fox', plan: 'quad', archetype: 'fox', color: 0xbfe3f0 },
    displayName: 'Yuki',
    state: 'flee',
    dir: 0,
    fleeT: 0.5,
    trustT: 0,
  }];
  h.Animals.updateWild(swimWild, 0.05, 0.1, { ...ctx, heightAt: () => -4.0, P: { x: 0, y: 0, z: -2, vx: 0, vz: 6, facing: 0 } });
  assert.ok(swimModes.some((s) => s.inWater && s.mode === null), 'Ground critter fleeing in deep water must yield null mode so AnimalRig plays swim/swimFast');

  // 3. Pouncer fires 'attack' one-shot ONCE per lunge (no duplicate mid-lunge restart)
  const pMesh = new h.THREE.Group();
  pMesh.position.set(0, 0, 0);
  const pShots = [];
  pMesh.userData.animalRig = {
    ready: true,
    state: {},
    setLookTarget() {},
    clearLookTarget() {},
    triggerOneShot(name) { pShots.push(name); },
    update() {},
  };
  const pouncer = {
    mesh: pMesh,
    species: { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', color: 0x7e6855 },
    hp: 3, maxHp: 3, hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
  };
  const gMesh = new h.THREE.Group();
  gMesh.position.set(0, 0, 2.25); // starts inside 2.3 pounce trigger, then closes to <= 2.1 strike
  const gloom = { mesh: gMesh, hp: 5, state: 'chase', targetAlly: pouncer };
  let hits = 0;
  const fCtx = {
    ...ctx,
    P: { x: 40, y: 0, z: 40, vx: 0, vz: 0, facing: 0, dead: true }, // Dead & far Starkeeper tests Tier 1 uncapped self-defense!
    glooms: [gloom],
    hitGloom: () => { hits++; },
  };
  for (let i = 0; i < 8; i++) h.Animals.updateFollowers([pouncer], 0.04, i * 0.04, fCtx);
  assert.ok(hits >= 1, 'Companion must defend itself even when Starkeeper is dead and far away');
  assert.equal(pShots.filter((s) => s === 'attack').length, 1, 'Pouncer must fire attack one-shot once per lunge without mid-lunge restart');

  // 4. Tier 2 ally defense: unattacked companion rallies to defend nearby fellow ally being targeted by a Gloom
  const allyMesh = new h.THREE.Group();
  allyMesh.position.set(0, 0, 0);
  const helperMesh = new h.THREE.Group();
  helperMesh.position.set(5.5, 0, 0);
  const ally = { mesh: allyMesh, species: { name: 'Berry Beetle', plan: 'bug', archetype: 'beetle', color: 0xe2656a }, hp: 3, maxHp: 3, hurtInvulnT: 0, flash: 0, atkCooldown: 2, attacker: null, defendT: 0, kx: 0, kz: 0 };
  const helper = { mesh: helperMesh, species: { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', color: 0x7e6855 }, hp: 3, maxHp: 3, hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0 };
  const g2Mesh = new h.THREE.Group();
  g2Mesh.position.set(1.5, 0, 0); // 4u from helper, targeting ally
  const g2 = { mesh: g2Mesh, hp: 5, state: 'chase', targetAlly: ally };
  const startHelperX = helperMesh.position.x;
  for (let i = 0; i < 6; i++) {
    h.Animals.updateFollowers([ally, helper], 0.05, i * 0.05, {
      ...ctx,
      P: { x: 40, y: 0, z: 40, vx: 0, vz: 0, facing: 0, dead: true },
      glooms: [g2],
      hitGloom: () => {},
    });
  }
  assert.ok(helperMesh.position.x < startHelperX - 0.3, 'Tier 2 helper must rally toward gloom attacking a fellow ally');

  // 5. Surface-floating companion must NOT target or strike seabed underwater Stalkers ~10u below
  const surfMesh = new h.THREE.Group();
  surfMesh.position.set(0, -0.3, 0);
  const surfAlly = {
    mesh: surfMesh,
    species: { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', color: 0x7e6855 },
    hp: 3, maxHp: 3, hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
  };
  const deepStalkerMesh = new h.THREE.Group();
  deepStalkerMesh.position.set(0.5, -9.8, 0);
  const deepStalker = { mesh: deepStalkerMesh, hp: 5, state: 'wander', underwater: true };
  let deepHits = 0;
  let lastFromMelee = null;
  for (let i = 0; i < 6; i++) {
    h.Animals.updateFollowers([surfAlly], 0.05, i * 0.05, {
      ...ctx,
      heightAt: () => -10.0,
      P: { x: 0, y: -0.3, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
      glooms: [deepStalker],
      hitGloom: (_t, _idx, _dir, _dmg, fromMelee) => { deepHits++; lastFromMelee = fromMelee; },
    });
  }
  assert.equal(deepHits, 0, 'Surface-floating companion must not melee-strike seabed underwater Stalker ~10u below');

  // Close-range melee strike against land boss uses fromMelee = true and respects boss colRadius margin
  const bossMesh = new h.THREE.Group();
  bossMesh.position.set(0, 0, 2.5);
  const boss = { mesh: bossMesh, hp: 14, state: 'chase', tier: { colRadius: 1.25 } };
  const landAllyMesh = new h.THREE.Group();
  landAllyMesh.position.set(0, 0, 0);
  const landAlly = {
    mesh: landAllyMesh,
    species: { name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', color: 0x7e6855 },
    hp: 3, maxHp: 3, hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
  };
  h.Animals.updateFollowers([landAlly], 0.05, 0.2, {
    ...ctx,
    P: { x: 0, y: 0, z: -2, vx: 0, vz: 0, facing: 0, dead: false },
    glooms: [boss],
    hitGloom: (_t, _idx, _dir, _dmg, fromMelee) => { deepHits++; lastFromMelee = fromMelee; },
  });
  assert.equal(deepHits, 1, 'Companion should reach wide Behemoth (colRadius=1.25) at 2.5u');
  assert.equal(lastFromMelee, true, 'Companion bite/pounce strike must pass fromMelee=true so ranged-only dodge-rolls do not trigger');
});

test('Species stats balance, chase-safe speed bounds, individual variation, and rare top-tier rolls', () => {
  const h = loadAnimalsHarness();
  const {
    SPECIES_STAT_RANGES,
    CHASE_SPEED_MIN,
    CHASE_SPEED_MAX,
    rollIndividualStats,
    getSpeciesStatRange,
    RARE_SPECIES,
  } = h.Animals;

  assert.equal(CHASE_SPEED_MIN, 0.86);
  assert.equal(CHASE_SPEED_MAX, 1.16);
  assert.equal(typeof rollIndividualStats, 'function');
  assert.equal(typeof getSpeciesStatRange, 'function');

  const standardNames = [
    'Moss Lynx', 'Berry Beetle', 'Meadow Kiwi', 'Cloud Wren', 'Ember Drake',
    'Starlight Unicorn', 'Lantern Firefly', 'Timber Wolf', 'Golden Owl', 'Frost Fox',
  ];

  // Every standard species must be defined with chase-safe speeds and balanced overall power budget
  const scores = [];
  const roles = new Set();
  for (const name of standardNames) {
    const r = SPECIES_STAT_RANGES[name];
    assert.ok(r, `Missing SPECIES_STAT_RANGES entry for ${name}`);
    roles.add(r.role);
    assert.ok(r.spd[0] >= CHASE_SPEED_MIN && r.spd[1] <= CHASE_SPEED_MAX,
      `${name} speed range [${r.spd}] must stay within chase bounds [${CHASE_SPEED_MIN}, ${CHASE_SPEED_MAX}]`);
    assert.ok(r.hp[0] <= r.hp[1] && r.def[0] < r.def[1] && r.atk[0] < r.atk[1] && r.atkCd[0] < r.atkCd[1],
      `${name} must have valid non-degenerate stat ranges for individual variation`);

    const avgHp = (r.hp[0] + r.hp[1]) * 0.5;
    const avgDef = (r.def[0] + r.def[1]) * 0.5;
    const avgAtk = (r.atk[0] + r.atk[1]) * 0.5;
    const avgCd = (r.atkCd[0] + r.atkCd[1]) * 0.5;
    const avgSpd = (r.spd[0] + r.spd[1]) * 0.5;
    const ehp = avgHp / (1 - avgDef);
    const dps = avgAtk / avgCd;
    const score = Math.sqrt(ehp) * dps * avgSpd;
    scores.push({ name, role: r.role, ehp, dps, score });
  }

  assert.equal(roles.size, 5, 'Roster must span all 5 tactical roles (tank, vanguard, striker, skirmisher, aerial)');
  const minScore = Math.min(...scores.map((s) => s.score));
  const maxScore = Math.max(...scores.map((s) => s.score));
  assert.ok(maxScore / minScore <= 1.25,
    `No single species should overpower others: score ratio ${(maxScore / minScore).toFixed(2)} (${JSON.stringify(scores)})`);

  // Verify clear species identity: Berry Beetle is tankier than Ember Drake; Ember Drake hits harder; Frost Fox is faster
  const beetleMin = rollIndividualStats({ name: 'Berry Beetle' }, () => 0.5);
  const drakeMid = rollIndividualStats({ name: 'Ember Drake' }, () => 0.5);
  const foxMid = rollIndividualStats({ name: 'Frost Fox' }, () => 0.5);
  assert.ok(beetleMin.def > drakeMid.def + 0.25, 'Berry Beetle must have markedly higher defense than Ember Drake');
  assert.ok(beetleMin.maxHp > drakeMid.maxHp, 'Berry Beetle must have higher HP than Ember Drake');
  assert.ok(drakeMid.atk > beetleMin.atk + 0.45, 'Ember Drake must hit markedly harder than Berry Beetle');
  assert.ok(foxMid.spd > beetleMin.spd + 0.12, 'Frost Fox must be faster than Berry Beetle');
  assert.ok(beetleMin.aggroPull > 1.0 && drakeMid.aggroPull === 0, 'Tank must have front-line aggroPull while striker does not');

  // Verify individual variation within the same species across different RNG rolls
  const lowFox = rollIndividualStats({ name: 'Frost Fox' }, () => 0.05);
  const highFox = rollIndividualStats({ name: 'Frost Fox' }, () => 0.95);
  assert.ok(highFox.atk > lowFox.atk, 'Individual Frost Foxes should vary in attack within species range');
  assert.ok(highFox.def > lowFox.def, 'Individual Frost Foxes should vary in defense within species range');
  assert.ok(highFox.spd > lowFox.spd, 'Individual Frost Foxes should vary in speed within species range');
  assert.ok(highFox.sizeVar > lowFox.sizeVar, 'Individual Frost Foxes should vary subtly in size');
  assert.ok(highFox.spd <= CHASE_SPEED_MAX && lowFox.spd >= CHASE_SPEED_MIN);

  // Verify Rare Starlight species roll in top 35% + bonus HP & radiant attack
  for (const rareSp of RARE_SPECIES) {
    const baseRange = getSpeciesStatRange(rareSp);
    const rareLow = rollIndividualStats(rareSp, () => 0.0);
    assert.ok(rareLow.maxHp >= baseRange.hp[0] + 3, `${rareSp.name} must receive +3 rare bonus HP`);
    assert.ok(rareLow.def >= baseRange.def[0] + (baseRange.def[1] - baseRange.def[0]) * 0.64,
      `${rareSp.name} must roll in top 35% of defense range`);
    assert.ok(rareLow.atk >= baseRange.atk[0] + (baseRange.atk[1] - baseRange.atk[0]) * 0.64 + 0.49,
      `${rareSp.name} must roll in top 35% of attack range plus rare radiant bonus`);
    assert.ok(rareLow.spd >= CHASE_SPEED_MIN && rareLow.spd <= CHASE_SPEED_MAX,
      `${rareSp.name} speed must still stay inside chase bounds`);
  }
});

test('Band diversity synergy, defense mitigation, aerial anti-Stinger focus, and wild->follower stat inheritance', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  const { rollIndividualStats, computeBandSynergy, applyCompanionDefense } = h.Animals;

  const mkAlly = (name, x, z, rngVal = 0.5) => {
    const sp = { name, plan: name === 'Golden Owl' ? 'bird' : name === 'Berry Beetle' ? 'bug' : 'quad' };
    const stats = rollIndividualStats(sp, () => rngVal);
    const mesh = new h.THREE.Group(name);
    mesh.position.set(x, 0, z);
    return {
      mesh,
      species: sp,
      stats,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      hurtInvulnT: 0,
      flash: 0,
      atkCooldown: 0,
      attacker: null,
      defendT: 0,
      kx: 0,
      kz: 0,
      phys: h.Animals.createPhysicsState(x, 0, z, sp),
    };
  };

  // 1. Diverse 4-role team strictly outperforms mono-species 4-member team
  const monoTeam = [
    mkAlly('Ember Drake', 0, 0),
    mkAlly('Ember Drake', 1, 0),
    mkAlly('Ember Drake', 2, 0),
    mkAlly('Ember Drake', 3, 0),
  ];
  const diverseTeam = [
    mkAlly('Berry Beetle', 0, 0),
    mkAlly('Timber Wolf', 1, 0),
    mkAlly('Ember Drake', 2, 0),
    mkAlly('Golden Owl', 3, 0),
  ];
  const monoSyn = { ...computeBandSynergy(monoTeam) };
  const divSyn = { ...computeBandSynergy(diverseTeam) };
  assert.equal(monoSyn.uniqueRoles, 1);
  assert.equal(monoSyn.atkMult, 1.0);
  assert.equal(monoSyn.cdMult, 1.0);
  assert.equal(monoSyn.defBonus, 0);
  assert.equal(monoSyn.restHealRate, 0);

  assert.equal(divSyn.uniqueRoles, 4);
  assert.ok(divSyn.atkMult > 1.15, `Diverse 4-role band must boost attack, got ${divSyn.atkMult}`);
  assert.ok(divSyn.cdMult < 0.85, `Diverse 4-role band must speed up attack cadence, got ${divSyn.cdMult}`);
  assert.ok(divSyn.defBonus >= 0.18, `Diverse 4-role band must grant shared defense bonus, got ${divSyn.defBonus}`);
  assert.ok(divSyn.restHealRate > 0.2, `Diverse 4-role band must gently rest-heal out of combat, got ${divSyn.restHealRate}`);

  // Zero-GC check: computeBandSynergy reuses the same scratch object across calls
  const refA = computeBandSynergy(monoTeam);
  const refB = computeBandSynergy(diverseTeam);
  assert.equal(refA, refB, 'computeBandSynergy must reuse its scratch object with zero GC allocations');

  // 2. Defense mitigation: tank takes far less damage and knockback than glass-cannon striker, yet remains mortal
  const beetle = diverseTeam[0];
  const drake = diverseTeam[2];
  const beetleHit = { ...applyCompanionDefense(beetle, 2, monoSyn) };
  const drakeHit = { ...applyCompanionDefense(drake, 2, monoSyn) };
  assert.ok(beetleHit.damage < drakeHit.damage - 0.5,
    `Beetle dmg (${beetleHit.damage}) must be much lower than Drake dmg (${drakeHit.damage})`);
  assert.equal(beetleHit.mitigated, true);
  assert.ok(beetleHit.knockScale < drakeHit.knockScale, 'Tank must resist knockback better than striker');
  assert.ok(beetleHit.damage >= 0.25, 'Defense mitigation must never make companions immortal');

  // 3. Combat strikes apply stats.atk * synergy.atkMult AND aerial anti-Stinger bonus (+35%)
  const owl = mkAlly('Golden Owl', 0, 0, 0.5);
  const stinger = { mesh: new h.THREE.Group('Stinger'), hp: 10, state: 'chase', tier: { key: 'stinger', aerial: true } };
  stinger.mesh.position.set(0, 1.0, 1.4);
  const groundGloom = { mesh: new h.THREE.Group('Classic'), hp: 10, state: 'chase', tier: { key: 'classic', aerial: false } };
  groundGloom.mesh.position.set(0, 0, 1.4);

  const stingerDmgs = [];
  const groundDmgs = [];
  const baseCtx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: -2, vx: 0, vz: 0, facing: 0, dead: false },
    heightAt: () => 0,
    WATER_Y: -0.35,
    burst: () => {},
  };
  h.Animals.updateFollowers([owl], 0.05, 0.1, {
    ...baseCtx,
    glooms: [stinger],
    hitGloom: (_g, _i, _d, dmg) => stingerDmgs.push(dmg),
  });
  owl.atkCooldown = 0;
  h.Animals.updateFollowers([owl], 0.05, 0.2, {
    ...baseCtx,
    glooms: [groundGloom],
    hitGloom: (_g, _i, _d, dmg) => groundDmgs.push(dmg),
  });
  assert.equal(stingerDmgs.length, 1);
  assert.equal(groundDmgs.length, 1);
  assert.ok(stingerDmgs[0] > groundDmgs[0] * 1.30,
    `Aerial Owl must deal ~35% bonus damage vs aerial Stinger (${stingerDmgs[0]} vs ${groundDmgs[0]})`);

  // 4. Out-of-combat rest healing when a diverse 3+ role band pauses together
  const hurtBeetle = diverseTeam[0];
  hurtBeetle.hp = hurtBeetle.maxHp - 1.5;
  for (let i = 0; i < diverseTeam.length; i++) {
    diverseTeam[i]._standT = 4.0;
    const side = (i % 2 === 0) ? 1 : -1;
    const pairStep = Math.floor(i / 2);
    const arcSpread = 0.55 + ((pairStep + 0.5) / 3) * 1.65;
    const flankAngle = Math.PI + side * arcSpread;
    const slotDist = 2.4;
    diverseTeam[i].mesh.position.set(Math.sin(flankAngle) * slotDist, 0, Math.cos(flankAngle) * slotDist);
    diverseTeam[i].phys.smoothSpd = 0;
  }
  const hpBeforeRest = hurtBeetle.hp;
  for (let k = 0; k < 20; k++) {
    h.Animals.updateFollowers(diverseTeam, 0.05, k * 0.05, {
      ...baseCtx,
      P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
      glooms: [],
    });
  }
  assert.ok(hurtBeetle.hp > hpBeforeRest + 0.15,
    `Diverse band resting out of combat should gently heal injured companion (${hpBeforeRest} -> ${hurtBeetle.hp})`);

  // 5. Wild -> Follower stat inheritance preserves rolled individual stats on befriending
  const wildStats = rollIndividualStats({ name: 'Frost Fox' }, () => 0.88);
  const wMesh = new h.THREE.Group('WildFox');
  wMesh.position.set(1.5, 0, 0);
  const wildList = [{
    mesh: wMesh,
    species: { name: 'Frost Fox', plan: 'quad', archetype: 'fox' },
    displayName: 'Yuki the Frost Fox',
    stats: wildStats,
    state: 'calmTrust',
    trustT: 2.15,
    dir: 0,
  }];
  let receivedStats = null;
  h.Animals.updateWild(wildList, 0.1, 0.5, {
    ...baseCtx,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false },
    glooms: [],
    spawnWild: () => {},
    scene: { remove: () => {} },
    addFollower: (_x, _y, _z, _msg, _sp, _name, stats) => { receivedStats = stats; },
  });
  assert.equal(receivedStats, wildStats, 'Befriending a wild animal must preserve its exact rolled individual stats');
});

test('Regression: eat/sleep/idle clips NEVER match Death ("d-eat-h") on Velociraptor drake, firefly, or any real animal GLB', () => {
  const h = loadAnimalsHarness();
  const realDir = new URL('../assets/animals/', import.meta.url);
  const glbFiles = fs.readdirSync(realDir).filter((f) => f.endsWith('.glb'));
  assert.ok(glbFiles.length >= 13, 'Expected all 13 animal GLB files');

  const nonDeathSemantics = ['idle', 'idleAlt', 'eat', 'sleep', 'walk', 'run', 'jump', 'attack', 'hit', 'swim', 'swimFast', 'fly'];

  // Verify Velociraptor drake (Armature|Velociraptor_Death) and Firefly (WaspArmature|Wasp_Death) never play Death when grazing/resting!
  for (const [spName, arch, spPlan] of [
    ['Ember Drake', 'drake', 'lizard'],
    ['Lantern Firefly', 'firefly', 'bug'],
  ]) {
    const glbBuf = fs.readFileSync(new URL(arch + '.glb', realDir));
    const jsonLen = glbBuf.readUInt32LE(12);
    const gltf = JSON.parse(glbBuf.subarray(20, 20 + jsonLen).toString('utf8'));
    const clipNames = (gltf.animations || []).map((a) => a.name);

    // Override GLTFLoader to supply the exact real animation clip names from the GLB
    const hReal = loadAnimalsHarness();
    const playedClips = [];
    const OrigLoader = hReal.THREE.GLTFLoader;
    hReal.THREE.GLTFLoader = class extends OrigLoader {
      load(url, onLoad) {
        const mock = makeMockArchetypeGltf(hReal.THREE, arch);
        mock.animations = clipNames.map((name) => ({ name, duration: 1.0, tracks: [] }));
        onLoad(mock);
      }
    };
    const root = new hReal.THREE.Group(spName);
    const ctrl = hReal.Animals.attachToCritter(root, { name: spName, plan: spPlan, archetype: arch });
    assert.equal(ctrl.ready, true);

    const mixer = hReal.THREE._mixers[0];
    assert.ok(mixer && mixer.actions instanceof Map, 'Mixer should record created clip actions');

    // Drive every non-death semantic mode (especially 'eat' and 'sleep') and assert active clip NEVER contains 'death' or 'dead'
    for (const mode of nonDeathSemantics) {
      ctrl.update(0.05, 1.0, {
        mode,
        speed: mode === 'walk' ? 2.5 : mode === 'run' ? 6.0 : 0,
        refSpeed: 3.0,
        airborne: mode === 'fly' || mode === 'jump',
        inWater: mode === 'swim' || mode === 'swimFast',
        hurtFlash: 0,
        isMoving: mode === 'walk' || mode === 'run' || mode === 'fly',
        facingYaw: 0,
        posX: 0,
        posY: 0,
        posZ: 0,
      });
      const active = [...mixer.actions.values()].find((a) => a.playing && a.weight > 0);
      assert.ok(active && active._clip, `${spName} mode="${mode}" should have an active playing clip`);
      playedClips.push({ mode, clip: active._clip.name });
      assert.equal(
        /death|dead/i.test(active._clip.name),
        false,
        `${spName} mode="${mode}" must NEVER route to death clip (got "${active._clip.name}")`
      );
    }
    assert.ok(playedClips.some((p) => p.mode === 'eat'), `${spName} eat mode should be verified`);
  }
});

test('Regression: large 26-friend bands stay compact around Starkeeper and stranded/stuck followers smoothly regroup', () => {
  const h = loadAnimalsHarness();
  const Physics = makeTestPhysicsHelpers();
  const baseCtx = {
    THREE: h.THREE,
    Physics,
    Models: h.Models,
    P: { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, dead: false, swimming: false },
    glooms: [],
    heightAt: () => 0,
    WATER_Y: -0.35,
    burst: () => {},
  };

  // Create 26 companions scattered far away (simulating outrunning/stranding them while sprinting!)
  const band = [];
  for (let i = 0; i < 26; i++) {
    const sp = { name: i % 2 === 0 ? 'Berry Beetle' : 'Frost Fox', plan: i % 2 === 0 ? 'bug' : 'quad' };
    const m = new h.THREE.Group('Ally' + i);
    m.position.set(60 + i * 2, 0, 50); // > 75u away!
    band.push({
      mesh: m,
      species: sp,
      stats: h.Animals.rollIndividualStats(sp, () => 0.5),
      hp: 4, maxHp: 4, hurtInvulnT: 0, flash: 0, atkCooldown: 0, attacker: null, defendT: 0, kx: 0, kz: 0,
      phys: h.Animals.createPhysicsState(60 + i * 2, 0, 50, sp),
    });
  }

  // First update tick smoothly regroups all far-stranded followers behind Starkeeper
  h.Animals.updateFollowers(band, 0.05, 1.0, baseCtx);
  for (let i = 0; i < band.length; i++) {
    const p = band[i].mesh.position;
    const d = Math.hypot(p.x - baseCtx.P.x, p.z - baseCtx.P.z);
    assert.ok(d < 10.0, `Stranded follower #${i} must regroup near Starkeeper, got dist=${d.toFixed(2)}`);
  }

  // After settling in formation, all 26 friends stay in compact concentric crescent rings (< 9u, NOT 16u+ conga line!)
  for (let k = 0; k < 60; k++) {
    h.Animals.updateFollowers(band, 0.05, 1.0 + k * 0.05, baseCtx);
  }
  const maxDist = Math.max(...band.map((f) => Math.hypot(f.mesh.position.x, f.mesh.position.z)));
  assert.ok(maxDist < 9.5, `All 26 friends should settle within compact crescent pack (< 9.5u), got maxDist=${maxDist.toFixed(2)}`);

  // Also test cliff-stuck regroup: follower stuck at 22u with zero movement for > 4.5s regroups cleanly
  const stuckAlly = band[0];
  stuckAlly.mesh.position.set(22, 0, 0);
  stuckAlly.phys.smoothSpd = 0;
  stuckAlly._stuckT = 0;
  for (let k = 0; k < 52; k++) {
    stuckAlly.phys.smoothSpd = 0;
    stuckAlly.mesh.position.x = 22; // simulate cliff blocking progress
    h.Animals.updateFollowers([stuckAlly], 0.1, 10 + k * 0.1, baseCtx);
    if (Math.hypot(stuckAlly.mesh.position.x, stuckAlly.mesh.position.z) < 10) break;
  }
  const dAfterStuck = Math.hypot(stuckAlly.mesh.position.x, stuckAlly.mesh.position.z);
  assert.ok(dAfterStuck < 10.0, `Cliff-stuck follower must regroup after ~4.5s, got dist=${dAfterStuck.toFixed(2)}`);
});
