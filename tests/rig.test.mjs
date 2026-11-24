import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockTHREE() {
  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  }
  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    setFromAxisAngle(axis, angle) {
      const s = Math.sin(angle * 0.5);
      this.x = axis.x * s; this.y = axis.y * s; this.z = axis.z * s; this.w = Math.cos(angle * 0.5);
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
    premultiply(q) {
      const bx = this.x, by = this.y, bz = this.z, bw = this.w;
      const ax = q.x, ay = q.y, az = q.z, aw = q.w;
      this.x = aw * bx + ax * bw + ay * bz - az * by;
      this.y = aw * by - ax * bz + ay * bw + az * bx;
      this.z = aw * bz + ax * by - ay * bx + az * bw;
      this.w = aw * bw - ax * bx - ay * by - az * bz;
      return this;
    }
    identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
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
      this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ' };
      this.quaternion = new Quaternion();
      this.scale = new Vector3(1, 1, 1);
      this.userData = {};
    }
    add(...objs) {
      for (const o of objs) {
        if (!o) continue;
        o.parent = this;
        this.children.push(o);
      }
      return this;
    }
    traverse(fn) {
      fn(this);
      for (const c of this.children) c.traverse(fn);
    }
    updateMatrixWorld() {}
    getWorldPosition(out) {
      let x = 0, y = 0, z = 0;
      let cur = this;
      while (cur) {
        x += cur.position.x; y += cur.position.y; z += cur.position.z;
        cur = cur.parent;
      }
      return out.set(x, y, z);
    }
  }
  class Group extends Object3D {}
  class Bone extends Object3D { constructor(name) { super(name); this.isBone = true; } }
  class MeshStandardMaterial {
    constructor(opts = {}) { Object.assign(this, opts); this.isMeshStandardMaterial = true; }
  }
  class SkinnedMesh extends Object3D {
    constructor(name, matName, hasMorphs = false) {
      super(name);
      this.isMesh = true;
      this.isSkinnedMesh = true;
      this.material = new MeshStandardMaterial({ name: matName });
      if (hasMorphs) {
        this.morphTargetDictionary = { Blink: 0, Determined: 1, Smile: 2, Hurt: 3 };
        this.morphTargetInfluences = [0, 0, 0, 0];
      }
    }
  }

  class MockAction {
    constructor(clip) {
      this._clip = clip;
      this.enabled = false;
      this.time = 0;
      this.timeScale = 1;
      this.weight = 0;
      this.loop = 2201;
      this.clampWhenFinished = false;
      this.blendMode = 2500;
      this.playing = false;
      this.crossFades = [];
      this.fadeIns = [];
      this.fadeOuts = [];
    }
    getClip() { return this._clip; }
    reset() { this.time = 0; this.enabled = true; return this; }
    play() { this.enabled = true; this.playing = true; return this; }
    stop() { this.playing = false; this.weight = 0; return this; }
    setLoop(mode) { this.loop = mode; return this; }
    setEffectiveTimeScale(s) { this.timeScale = s; return this; }
    setEffectiveWeight(w) { this.weight = w; return this; }
    getEffectiveWeight() { return this.weight; }
    fadeIn(d) { this.fadeIns.push(d); this.weight = 1; this.playing = true; return this; }
    fadeOut(d) { this.fadeOuts.push(d); this.weight = 0; return this; }
    crossFadeTo(target, dur, warp) {
      this.crossFades.push({ to: target._clip.name, dur, warp });
      target.enabled = true;
      target.playing = true;
      target.weight = 1;
      this.weight = 0;
      return this;
    }
  }

  class AnimationMixer {
    constructor(root) {
      this.root = root;
      this.actions = new Map();
      this.updatedDt = 0;
    }
    clipAction(clip) {
      if (!this.actions.has(clip)) {
        this.actions.set(clip, new MockAction(clip));
      }
      return this.actions.get(clip);
    }
    update(dt) {
      this.updatedDt += dt;
      for (const act of this.actions.values()) {
        if (act.playing) act.time += dt * act.timeScale;
      }
    }
  }

  const AnimationUtils = {
    makeClipAdditive(clip) {
      clip._additive = true;
      return clip;
    },
  };

  return {
    Vector2, Vector3, Quaternion, Object3D, Group, Bone, SkinnedMesh,
    MeshStandardMaterial, AnimationMixer, AnimationUtils,
    LoopOnce: 2200,
    LoopRepeat: 2201,
    NormalAnimationBlendMode: 2500,
    AdditiveAnimationBlendMode: 2501,
  };
}

function makeMockGltf(THREE) {
  const root = new THREE.Group('RootNode');
  const arm = new THREE.Group('CharacterArmature');
  const bRoot = new THREE.Bone('Root');
  const bHips = new THREE.Bone('Hips');
  const bChest = new THREE.Bone('Chest');
  bChest.position.set(0, 1.35, 0);
  const bNeck = new THREE.Bone('Neck');
  const bHead = new THREE.Bone('Head');
  bHead.position.set(0, 0.22, 0);
  const bUpperArmR = new THREE.Bone('UpperArm.R');
  const bHandR = new THREE.Bone('Hand.R');
  bHandR.position.set(-0.35, 0.05, 0.25);

  bChest.add(bNeck, bUpperArmR);
  bNeck.add(bHead);
  bUpperArmR.add(bHandR);
  bHips.add(bChest);
  bRoot.add(bHips);
  arm.add(bRoot);

  const bodyCoat = new THREE.SkinnedMesh('Adventurer_Body_1', 'Green', false);
  const bodyVest = new THREE.SkinnedMesh('Adventurer_Body_2', 'LightGreen', false);
  const headSkin = new THREE.SkinnedMesh('Adventurer_Head_1', 'Skin', true);
  const headEye = new THREE.SkinnedMesh('Adventurer_Head_3', 'Eye', true);
  const feetBoot = new THREE.SkinnedMesh('Adventurer_Feet_1', 'Black', false);
  root.add(arm, bodyCoat, bodyVest, headSkin, headEye, feetBoot);

  const clipNames = [
    'Idle', 'IdleStaff', 'Walk', 'Jog', 'Sprint', 'CrouchIdle', 'CrouchFwd',
    'JumpStart', 'JumpLoop', 'JumpLand', 'Roll', 'SwimIdle', 'SwimFwd',
    'CastEnter', 'CastShoot', 'CastLoop', 'Melee1', 'Melee2', 'Spin360', 'RollStrike',
    'SlideThrust', 'HillSlide', 'PlungeDive', 'PlungeLand', 'CastNova',
    'HitReact', 'Death', 'Cheer', 'Backpedal', 'StrafeLeft', 'StrafeRight',
  ];
  const animations = clipNames.map((name) => ({
    name,
    duration: name === 'Melee1' || name === 'CastShoot' ? 0.35 : 0.9,
    clone() { return { ...this }; },
  }));

  return { scene: root, animations };
}

function loadRig({ protocol = 'https:', gltfFactory = null, failLoad = false, omitLoader = false } = {}) {
  const code = fs.readFileSync(new URL('../rig.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  const calls = { loadUrls: [], parseCount: 0, scriptsInjected: [] };

  if (!omitLoader) {
    THREE.GLTFLoader = class {
      load(url, onLoad, _onProg, onErr) {
        calls.loadUrls.push(url);
        if (failLoad) {
          if (onErr) onErr(new Error('network fail'));
          return;
        }
        if (onLoad) onLoad(gltfFactory ? gltfFactory(THREE) : makeMockGltf(THREE));
      }
      parse(_buf, _path, onLoad, onErr) {
        calls.parseCount++;
        if (failLoad) {
          if (onErr) onErr(new Error('parse fail'));
          return;
        }
        if (onLoad) onLoad(gltfFactory ? gltfFactory(THREE) : makeMockGltf(THREE));
      }
    };
  }

  const win = {};
  const doc = {
    head: {
      appendChild(el) {
        calls.scriptsInjected.push(el.src);
        win.__STARKEEPER_GLB_B64__ = Buffer.from('glTFmock').toString('base64');
        if (typeof el.onload === 'function') el.onload();
      },
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), src: '', onload: null, onerror: null };
    },
  };

  let lastCurve = null;
  let lastMotion = null;
  const Shaders = {
    setClothCurve(l, d, s, f) { lastCurve = { l, d, s, f }; },
    setClothMotion(s, v, sw, w) { lastMotion = { s, v, sw, w }; },
  };
  const Models = {
    makeStarkeeperEyes() {
      const g = new THREE.Group('StarkeeperEyes');
      g.userData = { eyelidL: new THREE.Group(), eyelidR: new THREE.Group() };
      return g;
    },
    makeStarkeeperBraids() {
      const g = new THREE.Group('StarkeeperBraids');
      g.userData = { count: 20 };
      return g;
    },
    makeStarkeeperHat() {
      const g = new THREE.Group('Hat');
      g.userData = { hatTipStar: new THREE.Object3D('Star') };
      return g;
    },
    makeStarkeeperCloak() {
      const g = new THREE.Group('Cloak');
      g.userData = {
        capeRoot: new THREE.Group('CapeRoot'),
        capeSegs: [new THREE.Group(), new THREE.Group(), new THREE.Group()],
        scarfSegs: [new THREE.Group(), new THREE.Group()],
      };
      return g;
    },
    makeStarkeeperStaff() {
      const g = new THREE.Group('Staff');
      const halo = new THREE.Object3D('StaffHalo');
      halo.position.set(0, 1.29, 0);
      const butt = new THREE.Object3D('StaffButt');
      butt.position.set(0, -0.55, 0);
      const pearl = new THREE.Object3D('PearlAura');
      pearl.visible = false;
      g.add(halo, butt, pearl);
      g.userData = { staffHalo: halo, buttCap: butt, pearlAura: pearl };
      return g;
    },
  };
  const Textures = {
    sets: {
      cloth: { map: { tag: 'cloth' }, normalMap: { tag: 'clothN' }, roughnessMap: { tag: 'clothR' } },
      leather: { map: { tag: 'leather' }, normalMap: { tag: 'leatherN' }, roughnessMap: { tag: 'leatherR' } },
    },
  };

  const sandbox = {
    THREE,
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
  vm.runInNewContext(code + '\nthis.__CharacterRig = CharacterRig;', sandbox);

  const playerRoot = new THREE.Group('PlayerRoot');
  const proceduralRoot = new THREE.Group('ProceduralRoot');
  playerRoot.add(proceduralRoot);
  playerRoot.userData = { proceduralRoot };

  return {
    CharacterRig: sandbox.__CharacterRig,
    THREE,
    Models,
    Textures,
    Shaders,
    playerRoot,
    calls,
    getLastCurve: () => lastCurve,
    getLastMotion: () => lastMotion,
    rawCode: code,
  };
}

function baseState(overrides = {}) {
  return {
    spd: 0, baseSpeed: 7, moving: false, walking: false, airborne: false,
    vx: 0, vz: 0, vy: 0, facing: 0, sinF: 0, cosF: 1,
    sprintB: 0, runBlend: 0, amp: 0, riseW: 0, fallW: 0, apexW: 0,
    lockedOn: false, dead: false, rollT: 0, rollDur: 0.45, rollLocalFwd: 1, rollLocalSide: 0,
    swimming: false, swimMoveBlend: 0, sliding: false, slidePoseB: 0, slideNormX: 0, slideNormZ: 0,
    landT: 0, landStrength: 0, meleeT: 0, meleeDur: 0.3, meleeStep: 0,
    castT: 0, castDur: 0.28, castStep: 0, castAimPitch: 0,
    plunging: false, plungeWindupT: 0, plungeLandT: 0, hurtFlashT: 0,
    hasBreathRelic: false, headYaw: 0, headPitch: 0, x: 0, z: 0,
    ...overrides,
  };
}

test('CharacterRig resolves dual-mode asset sources cleanly (HTTP binary .glb vs file:// base64 wrapper)', () => {
  const { CharacterRig } = loadRig({ protocol: 'https:' });
  assert.deepEqual({ ...CharacterRig.resolveAssetSource('https:') }, { mode: 'http', url: './assets/starkeeper.glb' });
  assert.deepEqual({ ...CharacterRig.resolveAssetSource('http:') }, { mode: 'http', url: './assets/starkeeper.glb' });
  assert.deepEqual({ ...CharacterRig.resolveAssetSource('file:') }, { mode: 'file', scriptUrl: './assets/starkeeper.glb.js' });
});

test('CharacterRig falls back gracefully to procedural rig when GLTFLoader is missing or loading fails', () => {
  const missing = loadRig({ omitLoader: true });
  const c1 = missing.CharacterRig.attachToPlayer(missing.playerRoot, { Models: missing.Models, Textures: missing.Textures, Shaders: missing.Shaders });
  assert.equal(c1.ready, false);
  assert.equal(missing.playerRoot.userData.proceduralRoot.visible, true);

  const failed = loadRig({ failLoad: true });
  const c2 = failed.CharacterRig.attachToPlayer(failed.playerRoot, { Models: failed.Models, Textures: failed.Textures, Shaders: failed.Shaders });
  assert.equal(c2.ready, false);
  assert.equal(failed.playerRoot.userData.proceduralRoot.visible, true);
  assert.equal(c2.getStaffTipWorldPos(new failed.THREE.Vector3()), null);
});

test('CharacterRig mounts GLB via HTTP and file://, restyles PBR materials, attaches Hat/Cloak/Staff, and reports live staff tip', () => {
  // HTTP mode (GitHub Pages): fetches binary .glb directly, NEVER injects .glb.js!
  const httpEnv = loadRig({ protocol: 'https:' });
  const ctrl = httpEnv.CharacterRig.attachToPlayer(httpEnv.playerRoot, {
    Models: httpEnv.Models, Textures: httpEnv.Textures, Shaders: httpEnv.Shaders,
  });
  assert.equal(httpEnv.calls.loadUrls[0], './assets/starkeeper.glb');
  assert.equal(httpEnv.calls.scriptsInjected.length, 0, 'HTTP/GitHub Pages must never request starkeeper.glb.js');
  assert.equal(ctrl.ready, true);
  assert.equal(httpEnv.playerRoot.userData.proceduralRoot.visible, false, 'Procedural body hides once GLB rig mounts');
  assert.equal(httpEnv.playerRoot.userData.glbRig, ctrl);

  // Verify skinned PBR materials, morphTargets on head, frustumCulled=false, and bone attachments
  let skinnedCount = 0;
  let headMorphMatCount = 0;
  httpEnv.playerRoot.traverse((o) => {
    if (o.isSkinnedMesh) {
      skinnedCount++;
      assert.equal(o.material.skinning, true, `${o.name} material must set skinning: true for r128`);
      assert.equal(o.frustumCulled, false, `${o.name} must disable frustum culling`);
      if (o.morphTargetInfluences) {
        assert.equal(o.material.morphTargets, true, `${o.name} must set morphTargets: true for r128`);
        headMorphMatCount++;
      }
    }
  });
  assert.ok(skinnedCount >= 5);
  assert.ok(headMorphMatCount >= 2);
  assert.ok(ctrl.state.bones.Head.children.some((c) => c.name === 'StarkeeperEyes'), 'Expressive sculpted 3D eyes must mount onto Head bone');
  assert.ok(ctrl.state.bones.Head.children.some((c) => c.name === 'StarkeeperBraids'), 'Sculpted box braids must mount onto Head bone under hat brim');
  assert.ok(ctrl.state.bones.Head.children.some((c) => c.name === 'Hat'), 'Astronomer hat must mount onto Head bone');
  assert.ok(ctrl.state.bones.Chest.children.some((c) => c.name === 'Cloak'), 'Continuous cloak+scarf must mount onto Chest bone');
  assert.ok(ctrl.state.bones['Hand.R'].children.some((c) => c.name === 'Staff'), 'Star-Lantern Staff must mount onto Hand.R bone');
  const mountedStaff = ctrl.state.bones['Hand.R'].children.find((c) => c.name === 'Staff');
  assert.ok(mountedStaff.position.y >= 0.12 && mountedStaff.position.z <= -0.025,
    `Staff leather grip must sit inside closed palm (y>=0.12, z<=-0.025), not at wrist, got (${mountedStaff.position.x}, ${mountedStaff.position.y}, ${mountedStaff.position.z})`);

  const tip = ctrl.getStaffTipWorldPos(new httpEnv.THREE.Vector3());
  assert.ok(tip && Number.isFinite(tip.x) && Number.isFinite(tip.y) && Number.isFinite(tip.z));
  assert.ok(tip.y > 1.5, `Live staff lantern tip should sit elevated above hand, got y=${tip.y}`);

  // file:// dual-mode: loads starkeeper.glb.js and calls GLTFLoader.parse()!
  const fileEnv = loadRig({ protocol: 'file:' });
  const fileCtrl = fileEnv.CharacterRig.attachToPlayer(fileEnv.playerRoot, {
    Models: fileEnv.Models, Textures: fileEnv.Textures, Shaders: fileEnv.Shaders,
  });
  assert.equal(fileEnv.calls.scriptsInjected[0], './assets/starkeeper.glb.js');
  assert.equal(fileEnv.calls.parseCount, 1);
  assert.equal(fileCtrl.ready, true);
});

test('CharacterRig drives 4-layer AnimationMixer (crossFadeTo, speed-coupled walk/strafe, additive guard, facial morphs) with zero-GC hot loop', () => {
  const env = loadRig({ protocol: 'https:' });
  const ctrl = env.CharacterRig.attachToPlayer(env.playerRoot, {
    Models: env.Models, Textures: env.Textures, Shaders: env.Shaders,
  });

  // 1. Base locomotion crossfades + speed-coupled timeScale
  ctrl.update(0.02, 0.02, baseState());
  assert.equal(ctrl.state.baseAction, 'Idle');

  ctrl.update(0.02, 0.04, baseState({ moving: true, walking: true, spd: 4.5, vz: 4.5, amp: 0.6 }));
  assert.equal(ctrl.state.baseAction, 'Walk');

  ctrl.update(0.02, 0.06, baseState({ moving: true, walking: true, spd: 11.0, vz: 11.0, sprintB: 1, runBlend: 1, amp: 1.2 }));
  assert.equal(ctrl.state.baseAction, 'Sprint');
  assert.ok(ctrl.state.baseTimeScale > 0.85, `Sprint timeScale should track speed, got ${ctrl.state.baseTimeScale}`);
  assert.ok(env.getLastCurve() && env.getLastCurve().l > 0.4, 'Continuous GPU cloak curve must stay driven during GLB sprint');

  // 2. Z-target directional strafing + backpedaling + AdditiveAnimationBlendMode guard stance!
  // Facing +Z (sinF=0, cosF=1): +X = character LEFT (StrafeLeft), -X = character RIGHT (StrafeRight)
  for (let i = 0; i < 12; i++) {
    ctrl.update(0.025, 0.1 + i * 0.025, baseState({
      moving: true, walking: true, lockedOn: true, spd: 6.5, vx: 6.5, vz: 0, amp: 0.9,
    }));
  }
  assert.equal(ctrl.state.baseAction, 'StrafeLeft', 'Moving toward +X while facing +Z must select StrafeLeft');
  assert.ok(ctrl.state.guardWeight > 0.16, `Z-target lock-on must ramp additive guard crouch weight, got ${ctrl.state.guardWeight}`);
  assert.equal(ctrl.state.guardBlendMode, env.THREE.AdditiveAnimationBlendMode, 'Guard layer must use AdditiveAnimationBlendMode');

  ctrl.update(0.025, 0.45, baseState({ moving: true, walking: true, lockedOn: true, spd: 6.5, vx: -6.5, vz: 0, amp: 0.9 }));
  assert.equal(ctrl.state.baseAction, 'StrafeRight', 'Moving toward -X while facing +Z must select StrafeRight');

  ctrl.update(0.025, 0.48, baseState({ moving: true, walking: true, lockedOn: true, spd: 5.5, vx: 0, vz: -5.5, amp: 0.8 }));
  assert.equal(ctrl.state.baseAction, 'Backpedal', 'Moving backward while locked on must select Backpedal');

  // 3. Action combat overlay crossfades cleanly on melee/cast & fades smoothly out afterward
  ctrl.update(0.02, 0.55, baseState({ meleeT: 0.25, meleeDur: 0.27, meleeStep: 1 }));
  assert.equal(ctrl.state.overlayAction, 'Melee1');
  ctrl.update(0.02, 0.60, baseState({ meleeT: 0.40, meleeDur: 0.44, meleeStep: 3 }));
  assert.equal(ctrl.state.overlayAction, 'Spin360');
  ctrl.update(0.02, 0.65, baseState({ castT: 0.24, castDur: 0.28, castStep: 1 }));
  assert.equal(ctrl.state.overlayAction, 'CastShoot');
  ctrl.update(0.02, 0.70, baseState());
  assert.equal(ctrl.state.overlayAction, null, 'Overlay action fades out smoothly when combat ends');

  // 4. Facial morph targets respond to lock-on (Determined), triggerEmote('smile'), and damage (Hurt)
  ctrl.triggerEmote('smile', 2.0);
  for (let i = 0; i < 12; i++) {
    ctrl.update(0.03, 1.0 + i * 0.03, baseState({ lockedOn: true, hurtFlashT: 0 }));
  }
  assert.ok(ctrl.state.morphWeights.Determined > 0.5, `Locked-on Determined morph should activate, got ${ctrl.state.morphWeights.Determined}`);
  assert.ok(ctrl.state.morphWeights.Smile > 0.5, `Smile emote morph should activate, got ${ctrl.state.morphWeights.Smile}`);
  for (let i = 0; i < 8; i++) {
    ctrl.update(0.03, 1.5 + i * 0.03, baseState({ hurtFlashT: 0.25 }));
  }
  assert.ok(ctrl.state.morphWeights.Hurt > 0.5, `Hurt morph should activate on hurtFlashT, got ${ctrl.state.morphWeights.Hurt}`);

  // 5. Hot-loop zero-GC check: update() must not construct Vector3 or Quaternion
  const updateIdx = env.rawCode.indexOf('function update(');
  assert.ok(updateIdx > 0, 'rig.js must define update(dt, time, state)');
  const updateBody = env.rawCode.slice(updateIdx, env.rawCode.indexOf('function getStaffTipWorldPos', updateIdx));
  assert.doesNotMatch(updateBody, /new\s+THREE\.(Vector3|Quaternion|Euler|Matrix4)\s*\(/, 'rig.js update() hot loop must not allocate Three math objects');
});

test('CharacterRig resets post-mixer offset bones to rest pose every frame so HillSlide NEVER spins the head', () => {
  const env = loadRig({ protocol: 'https:' });
  const ctrl = env.CharacterRig.attachToPlayer(env.playerRoot, {
    Models: env.Models, Textures: env.Textures, Shaders: env.Shaders,
  });

  // Mock AnimationMixer does NOT overwrite Head/Neck quaternions (exact same situation as a clip missing Head/Neck tracks!)
  // Stepping 45 frames of HillSlide with steady headYaw=0.55 & headPitch=-0.20 must apply the offset ONCE, never compounding into a spin!
  const slideState = baseState({
    sliding: true,
    slidePoseB: 1,
    spd: 6.5,
    headYaw: 0.55,
    headPitch: -0.20,
  });
  ctrl.update(0.02, 0.02, slideState);
  assert.equal(ctrl.state.baseAction, 'HillSlide');
  const q1 = { ...ctrl.state.bones.Head.quaternion };
  const n1 = { ...ctrl.state.bones.Neck.quaternion };

  for (let i = 0; i < 45; i++) {
    ctrl.update(0.02, 0.04 + i * 0.02, slideState);
  }
  const q46 = ctrl.state.bones.Head.quaternion;
  const n46 = ctrl.state.bones.Neck.quaternion;
  assert.ok(Math.abs(q46.x - q1.x) < 1e-6 && Math.abs(q46.y - q1.y) < 1e-6 && Math.abs(q46.z - q1.z) < 1e-6 && Math.abs(q46.w - q1.w) < 1e-6,
    `Head quaternion must stay steady during HillSlide (frame 1=${JSON.stringify(q1)}, frame 46=${JSON.stringify(q46)})`);
  assert.ok(Math.abs(n46.x - n1.x) < 1e-6 && Math.abs(n46.y - n1.y) < 1e-6 && Math.abs(n46.z - n1.z) < 1e-6 && Math.abs(n46.w - n1.w) < 1e-6,
    `Neck quaternion must stay steady during HillSlide (frame 1=${JSON.stringify(n1)}, frame 46=${JSON.stringify(n46)})`);
  assert.ok(Math.abs(q46.y) > 0.12 && Math.abs(q46.w) > 0.90, `Head should hold a bounded look-at angle, not spin (got w=${q46.w})`);
});

test('starkeeper.glb Adventurer_Head has smooth eye-side/brow/forehead Skin normals and zero front/temple Hair artifacts', () => {
  const glbPath = new URL('../assets/starkeeper.glb', import.meta.url);
  const buf = fs.readFileSync(glbPath);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen + 8;

  function readVec3(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * 12;
      out.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]);
    }
    return out;
  }
  function readIndices(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    const stride = acc.componentType === 5125 ? 4 : 2;
    for (let i = 0; i < acc.count; i++) {
      out.push(stride === 4 ? buf.readUInt32LE(base + i * 4) : buf.readUInt16LE(base + i * 2));
    }
    return out;
  }

  const headMesh = gltf.meshes.find((m) => m.name === 'Adventurer_Head');
  assert.ok(headMesh, 'Adventurer_Head mesh must exist in starkeeper.glb');

  // 1. Hair must have ZERO triangles on front forehead/temples/eye-sides (native Y-up z > -0.018m)
  const hairPrim = headMesh.primitives.find((p) => gltf.materials[p.material]?.name === 'Hair');
  assert.ok(hairPrim, 'Hair primitive must exist');
  const hairPos = readVec3(hairPrim.attributes.POSITION);
  const hairIdx = readIndices(hairPrim.indices);
  let frontHairTris = 0;
  const isNativeYup = hairPos.some((p) => p[1] > 1.0);
  for (let i = 0; i < hairIdx.length; i += 3) {
    const p0 = hairPos[hairIdx[i]], p1 = hairPos[hairIdx[i + 1]], p2 = hairPos[hairIdx[i + 2]];
    if (isNativeYup) {
      const cz = (p0[2] + p1[2] + p2[2]) / 3;
      if (cz > -0.018) frontHairTris++;
    } else {
      const cy = (p0[1] + p1[1] + p2[1]) / 3;
      if (cy < -0.000181) frontHairTris++;
    }
  }
  assert.equal(frontHairTris, 0, `Front/temple/forehead Hair must have 0 leftover triangles, found ${frontHairTris}`);
  assert.ok(hairIdx.length / 3 >= 120, `Back-of-head Hair cap must remain intact (>=120 tris), found ${hairIdx.length / 3}`);

  // 2. Skin eye-side/brow/forehead vertices must have ZERO hard normal splits (<1 deg)
  const skinPrim = headMesh.primitives.find((p) => gltf.materials[p.material]?.name === 'Skin');
  assert.ok(skinPrim, 'Skin primitive must exist');
  const skinPos = readVec3(skinPrim.attributes.POSITION);
  const skinNrm = readVec3(skinPrim.attributes.NORMAL);
  const buckets = new Map();
  for (let i = 0; i < skinPos.length; i++) {
    const p = skinPos[i];
    const xm = isNativeYup ? p[0] : p[0] * 100;
    const ym = isNativeYup ? p[1] - 1.5998 : p[2] * 100 - 1.58726;
    const zm = isNativeYup ? p[2] + 0.0174 : -p[1] * 100 - 0.04308;
    if (Math.abs(xm) >= 0.025 && Math.abs(xm) <= 0.085 && ym >= 0.09 && ym <= 0.19 && zm > 0.05) {
      const k = `${Math.round(xm * 10000)}:${Math.round(ym * 10000)}:${Math.round(zm * 10000)}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(skinNrm[i]);
    }
  }
  let maxSplitDeg = 0;
  for (const [, ns] of buckets) {
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dot = Math.max(-1, Math.min(1, ns[i][0] * ns[j][0] + ns[i][1] * ns[j][1] + ns[i][2] * ns[j][2]));
        const deg = (Math.acos(dot) * 180) / Math.PI;
        if (deg > maxSplitDeg) maxSplitDeg = deg;
      }
    }
  }
  assert.ok(maxSplitDeg < 1.0, `Eye-side/brow/forehead Skin normals must be seamlessly smooth (<1 deg split), got ${maxSplitDeg.toFixed(1)} deg`);
});

test('CharacterRig grants full combatAuthority during melee, routes RollStrike, drives martial staff spins & flourish, and exposes buttCap world pos', () => {
  const env = loadRig({ protocol: 'https:' });
  const ctrl = env.CharacterRig.attachToPlayer(env.playerRoot, {
    Models: env.Models, Textures: env.Textures, Shaders: env.Shaders,
  });

  // Idle baseline: combatAuthority ~0, trail inactive
  ctrl.update(0.02, 0.02, baseState());
  assert.ok(ctrl.state.combatAuthority < 0.05, `Idle combatAuthority must be ~0, got ${ctrl.state.combatAuthority}`);
  assert.equal(ctrl.isCombatTrailActive(), false);

  // Hit 1: clean single sweeping arc (no dizzy spin), trail stays OFF during early windup & ON during active strike!
  ctrl.update(0.02, 0.04, baseState({ meleeT: 0.46, meleeDur: 0.48, meleeStep: 1 }));
  assert.equal(ctrl.isCombatTrailActive(), false, 'Trail must stay dark during early anticipation windup (no windup double-swoosh!)');
  let maxSpin1 = 0;
  for (let i = 1; i < 24; i++) {
    ctrl.update(0.02, 0.04 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.48 - i * 0.02), meleeDur: 0.48, meleeStep: 1 }));
    maxSpin1 = Math.max(maxSpin1, Math.abs(ctrl.state.staffSpinAngle));
    if (i === 11) assert.equal(ctrl.isCombatTrailActive(), true, 'Trail must blaze brightly during active Hit 1 strike arc');
  }
  assert.ok(maxSpin1 <= Math.PI * 0.5, `Hit 1 must stay a pure grounded sweep without chaotic spin, got ${maxSpin1}`);

  // Hit 2 overhead diagonal cleave: full combatAuthority & one smooth 360 deg (-2*PI) twirl ending cleanly right-side-up (zero backward unwind!)
  let maxSpin2 = 0;
  for (let i = 0; i < 28; i++) {
    ctrl.update(0.02, 0.55 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.56 - i * 0.02), meleeDur: 0.56, meleeStep: 2 }));
    maxSpin2 = Math.max(maxSpin2, Math.abs(ctrl.state.staffSpinAngle));
  }
  assert.ok(ctrl.state.combatAuthority > 0.85, `Melee2 must achieve full combatAuthority (>0.85), got ${ctrl.state.combatAuthority}`);
  assert.ok(maxSpin2 >= Math.PI * 1.8 && maxSpin2 <= Math.PI * 2.1, `Melee2 must complete one full 360 deg twirl ending upright (zero unwind), got ${maxSpin2}`);

  // Hit 3 Spin360: readable 360 deg helicopter spin synced with 0.74s high airborne leap!
  let maxSpin3 = 0;
  for (let i = 0; i < 37; i++) {
    ctrl.update(0.02, 1.15 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.74 - i * 0.02), meleeDur: 0.74, meleeStep: 3 }));
    maxSpin3 = Math.max(maxSpin3, Math.abs(ctrl.state.staffSpinAngle));
  }
  assert.ok(maxSpin3 >= Math.PI * 1.8 && maxSpin3 <= Math.PI * 2.1, `Spin360 must spin staff one coherent 360 deg helicopter circle, got ${maxSpin3}`);

  // Roll-Strike (step 4) routes to RollStrike clip
  ctrl.update(0.02, 1.95, baseState({ meleeT: 0.40, meleeDur: 0.46, meleeStep: 4 }));
  assert.equal(ctrl.state.overlayAction, 'RollStrike');

  // Sprint Slide-Thrust (step 7) drives readable axial star-drill spin
  let maxDrill = 0;
  for (let i = 0; i < 28; i++) {
    ctrl.update(0.02, 2.00 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.56 - i * 0.02), meleeDur: 0.56, meleeStep: 7 }));
    maxDrill = Math.max(maxDrill, Math.abs(ctrl.state.staffDrillAngle));
  }
  assert.ok(maxDrill >= Math.PI * 2.5 && maxDrill <= Math.PI * 3.3, `SlideThrust must drive readable 540 deg axial drill spin, got ${maxDrill}`);

  // Ending melee immediately stops trail emission (NO extra post-swing double-swoosh!) and settles combatAuthority smoothly to 0
  ctrl.update(0.02, 2.60, baseState({ meleeT: 0, meleeStep: 0 }));
  assert.equal(ctrl.isCombatTrailActive(), false, 'Ending a swing must stop trail cleanly with no extra unsolicited flourish swoosh');
  for (let i = 0; i < 35; i++) ctrl.update(0.02, 2.62 + i * 0.02, baseState({ meleeT: 0, meleeStep: 0 }));
  assert.ok(ctrl.state.combatAuthority < 0.05, `combatAuthority must settle cleanly back to 0, got ${ctrl.state.combatAuthority}`);

  // Live buttCap world position works cleanly alongside tip
  const butt = ctrl.getStaffButtWorldPos(new env.THREE.Vector3());
  assert.ok(butt && Number.isFinite(butt.x) && Number.isFinite(butt.y) && Number.isFinite(butt.z));
});
