import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPhysics(extraGlobals = {}) {
  const code = fs.readFileSync(new URL('../physics.js', import.meta.url), 'utf8');
  const sandbox = {
    Math,
    Number,
    Array,
    Object,
    performance: { now: () => 0 },
    WATER_Y: 0,
    Shaders: { waterHeightAt: () => 0 },
    THREE: {
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    console,
    ...extraGlobals,
  };
  vm.runInNewContext(code + '\nthis.__Physics = Physics;', sandbox);
  return sandbox.__Physics;
}

function makeVec3Class() {
  return class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
    subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l;
      this.y /= l;
      this.z /= l;
      return this;
    }
    lerp(v, a) {
      this.x += (v.x - this.x) * a;
      this.y += (v.y - this.y) * a;
      this.z += (v.z - this.z) * a;
      return this;
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    project() {
      return this;
    }
  };
}

function makeMockPlayer() {
  const makeNode = (y = 0) => ({
    position: { x: 0, y, z: 0, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } },
    rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    scale: { x: 1, y: 1, z: 1, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } },
  });
  const player = makeNode(0);
  player.rotation.order = 'YXZ';
  player.visible = true;
  player.userData = {
    pelvis: makeNode(0.88),
    torso: makeNode(0),
    headGroup: makeNode(0.65),
    thighL: makeNode(-0.05),
    thighR: makeNode(-0.05),
    kneeL: makeNode(-0.37),
    kneeR: makeNode(-0.37),
    ankleL: makeNode(-0.36),
    ankleR: makeNode(-0.36),
    armL: makeNode(0.485),
    armR: makeNode(0.485),
    elbowL: makeNode(-0.27),
    elbowR: makeNode(-0.27),
    staffPivot: makeNode(-0.245),
    staffHalo: makeNode(1.29),
    capeSegs: [makeNode(0.54), makeNode(-0.32), makeNode(-0.33)],
  };
  return player;
}

function makeMockCamera(Vec3) {
  return {
    position: new Vec3(0, 4, -10),
    lookTarget: new Vec3(0, 1.5, 0),
    lookAt(x, y, z) {
      this.lookTarget.set(x, y, z);
    },
    getWorldDirection(out) {
      out.subVectors(this.lookTarget, this.position).normalize();
      return out;
    },
  };
}

// 1. Solid prop collision push-out (single & corner multi-collider)
test('resolveColliders pushes entity smoothly outside solid tree/rock radii', () => {
  const Ph = loadPhysics();
  const colliders = [{ x: 5, z: 0, r: 1.0 }];
  const res = Ph.resolveColliders(4.4, 0.1, 0.42, colliders, { x: 0, z: 0, hit: false });
  assert.equal(res.hit, true);
  const dist = Math.hypot(res.x - 5, res.z - 0);
  assert.ok(dist >= 1.419, `Expected separation >= 1.42, got ${dist}`);
});

test('resolveColliders resolves tight corner multi-collider overlap in 2 passes', () => {
  const Ph = loadPhysics();
  const colliders = [
    { x: 1.2, z: 0, r: 1.0 },
    { x: 0, z: 1.2, r: 1.0 },
  ];
  const out = { x: 0, z: 0, hit: false };
  const res = Ph.resolveColliders(0.2, 0.2, 0.42, colliders, out);
  assert.equal(res, out, 'Must reuse out object for zero-GC');
  assert.equal(res.hit, true);
  for (const c of colliders) {
    const dist = Math.hypot(res.x - c.x, res.z - c.z);
    assert.ok(dist >= 1.419, `Expected separation >= 1.42 from corner collider, got ${dist}`);
  }
});

// 2. Steep >=42 deg cliff blocking & downhill sliding vs gentle 20 deg walkable hill
test('stepTerrainMove blocks walking up steep >=42 deg cliffs and produces downhill slide', () => {
  const Ph = loadPhysics();
  const slope = Math.tan((60 * Math.PI) / 180);
  const heightFn = (x) => slope * x;
  const ny = Math.cos((60 * Math.PI) / 180);
  const nx = -Math.sin((60 * Math.PI) / 180);
  const normalFn = () => ({ x: nx, y: ny, z: 0 });

  const out = Ph.stepTerrainMove(0, 0, 0.5, 0, true, heightFn, normalFn, {});
  assert.ok(out.x <= 0.01, `Should block uphill climb on 60 deg cliff, moved to x=${out.x}`);
  assert.equal(out.sliding, true, 'Standing on 60 deg cliff should trigger sliding');
  assert.ok(out.slideVx < 0, 'Slide velocity should push downhill (-X)');
});

test('stepTerrainMove allows gentle 20 deg hills freely', () => {
  const Ph = loadPhysics();
  const slope = Math.tan((20 * Math.PI) / 180);
  const heightFn = (x) => slope * x;
  const ny = Math.cos((20 * Math.PI) / 180);
  const nx = -Math.sin((20 * Math.PI) / 180);
  const normalFn = () => ({ x: nx, y: ny, z: 0 });

  const out = Ph.stepTerrainMove(0, 0, 0.5, 0, true, heightFn, normalFn, {});
  assert.ok(out.x > 0.3, `Gentle 20 deg hill should be walkable, got x=${out.x}`);
  assert.equal(out.sliding, false);
});

test('stepTerrainMove allows sideways contour travel along a steep cliff without climbing', () => {
  const Ph = loadPhysics();
  const slope = Math.tan((55 * Math.PI) / 180);
  const heightFn = (x) => slope * x;
  const ny = Math.cos((55 * Math.PI) / 180);
  const nx = -Math.sin((55 * Math.PI) / 180);
  const normalFn = () => ({ x: nx, y: ny, z: 0 });

  const out = Ph.stepTerrainMove(0, 0, 0.4, 0.4, true, heightFn, normalFn, {});
  assert.ok(out.x <= 0.01, `Uphill component should be blocked, got x=${out.x}`);
  assert.ok(out.z > 0.3, `Contour tangent component should remain free, got z=${out.z}`);
});

// 3. Hill-aware computeCameraDistance
test('computeCameraDistance pulls camera inward when a ridge rises between player and camera', () => {
  const Ph = loadPhysics();
  const heightFn = (x, z) => (z < -3 && z > -6 ? 8 : 0);
  const focus = { x: 0, y: 2.0, z: 0 };
  const dir = { x: 0, y: 0.1, z: 1 };
  const dist = Ph.computeCameraDistance(focus, dir, 10, heightFn);
  assert.ok(dist < 4.5, `Camera should pull in front of ridge, got dist=${dist}`);
});

test('computeCameraDistance keeps full desired distance on flat open terrain', () => {
  const Ph = loadPhysics();
  const heightFn = () => 0;
  const focus = { x: 0, y: 2.0, z: 0 };
  const dir = { x: 0, y: -0.1, z: 1 };
  const dist = Ph.computeCameraDistance(focus, dir, 10, heightFn);
  assert.equal(dist, 10);
});

// 4. Coyote time (0.12s grace) & jump buffer (0.12s pre-landing)
test('coyote time allows jumping within 0.12s after walking off a ledge', () => {
  const Vec3 = makeVec3Class();
  let ledgeDrop = false;
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    heightAt: () => (ledgeDrop ? 0 : 10),
    terrainNormalAt: (x, z, out) => {
      out.x = 0; out.y = 1; out.z = 0;
      return out;
    },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  const player = makeMockPlayer();
  Ph.P.x = 0; Ph.P.y = 10; Ph.P.z = 0; Ph.P.onGround = true;
  Ph.updatePlayer(0.016, 0, player);
  assert.equal(Ph.P.onGround, true);

  // Drop terrain suddenly (stepped off cliff)
  ledgeDrop = true;
  Ph.updatePlayer(0.05, 0.05, player);
  assert.equal(Ph.P.onGround, false);
  assert.ok(Ph.P.coyoteT > 0 && Ph.P.coyoteT <= 0.12, `Expected coyoteT active, got ${Ph.P.coyoteT}`);

  // Press Space within coyote grace window
  Ph.keys.Space = true;
  Ph.updatePlayer(0.02, 0.07, player);
  assert.ok(Ph.P.vy > 8.0, `Coyote jump should trigger upward vy (~9.2), got ${Ph.P.vy}`);
});

test('jump buffer triggers jump immediately upon landing within 0.12s', () => {
  const Vec3 = makeVec3Class();
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => {
      out.x = 0; out.y = 1; out.z = 0;
      return out;
    },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  const player = makeMockPlayer();
  // Falling just above the ground after coyote window expired
  Ph.P.y = 0.25;
  Ph.P.vy = -8.0;
  Ph.P.onGround = false;
  Ph.P.coyoteT = 0;
  Ph.keys.Space = true;

  // Frame 1: still slightly above ground (0.25 - 8*0.02 - ... > 0) -> buffers Space
  Ph.updatePlayer(0.02, 0.02, player);
  assert.ok(Ph.P.jumpBufT > 0, 'Jump buffer should be active while airborne');

  // Frame 2: lands at y = 0 -> buffered jump fires!
  Ph.updatePlayer(0.03, 0.05, player);
  assert.ok(Ph.P.vy > 7.5, `Buffered jump should fire right after landing, got vy=${Ph.P.vy}`);
});

// 5. Dodge-roll velocity boost, invulnerability window, and cooldown
test('dodge-roll activates velocity boost, invuln window, somersault, and enforces cooldown', () => {
  const Vec3 = makeVec3Class();
  let rollSounds = 0;
  let dustCount = 0;
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    Sound: { roll: () => { rollSounds++; }, step: () => {}, land: () => {}, splash: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => {
      out.x = 0; out.y = 1; out.z = 0;
      return out;
    },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  Ph.init(null, { onDust: () => { dustCount++; } });
  const player = makeMockPlayer();
  Ph.P.onGround = true;
  Ph.P.facing = 0;

  // Standing still with NO direction pressed must NOT lunge forward; arms roll buffer instead
  assert.equal(Ph.startRoll(), false, 'standing roll with no direction should not fire immediately');
  assert.equal(Ph.P.rollT, 0);
  assert.ok(Ph.P.rollBufT > 0, 'standing empty roll tap should arm brief rollBufT window');

  // Pressing a direction while standing (KeyD) triggers directional side-roll cleanly
  Ph.keys.KeyD = true;
  Ph.updatePlayer(0.016, 0.016, player);
  assert.equal(rollSounds, 1);
  assert.ok(Ph.P.rollT >= 0.42, `Expected rollT ~0.45, got ${Ph.P.rollT}`);
  assert.ok(Ph.P.invulnT >= 0.35, `Expected invulnT ~0.38, got ${Ph.P.invulnT}`);
  assert.ok(Ph.P.rollCooldown >= 0.24, `Expected rollCooldown ~0.25, got ${Ph.P.rollCooldown}`);
  assert.ok(Math.abs(Ph.P.rollDirX) > 0.85, `Standing KeyD should side-roll along X, got rollDirX=${Ph.P.rollDirX}`);
  assert.ok(Math.hypot(Ph.P.vx, Ph.P.vz) >= 11.5, 'Initial dodge-roll speed should boost to ~12.5 u/s');
  assert.equal(Ph.startRoll(), false, 'Cannot start a second roll while already rolling');
  Ph.keys.KeyD = false;

  // Step halfway through side-roll -> check sideways barrel-roll (pelvis.rotation.z) and PRESERVED forward facing!
  const facingBeforeRoll = Ph.P.facing;
  for (let i = 0; i < 4; i++) Ph.updatePlayer(0.05, 0.02 + i * 0.05, player);
  assert.ok(Math.abs(Ph.P.x) > 1.5, `Side-roll should propel player sideways along X, got x=${Ph.P.x}`);
  assert.ok(Math.abs(player.userData.pelvis.rotation.z) > 1.0, `Side-roll should barrel-roll around Z, got rotZ=${player.userData.pelvis.rotation.z}`);
  assert.ok(Math.abs(Ph.P.facing - facingBeforeRoll) < 0.05, `Side-roll must preserve forward facing (${facingBeforeRoll}), got ${Ph.P.facing}`);
  assert.ok(dustCount > 0, 'Roll should emit dust puffs');

  // Finish roll (total 0.45s+) -> cooldown should still block immediate re-roll for 0.25s
  for (let i = 0; i < 6; i++) Ph.updatePlayer(0.05, 0.25 + i * 0.05, player);
  assert.equal(Ph.P.rollT, 0);
  assert.equal(Ph.P.invulnT, 0);
  Ph.keys.KeyS = true;
  assert.equal(Ph.startRoll(), false, 'Cooldown should prevent immediate roll after roll ends');
  Ph.keys.KeyS = false;

  // Wait past 0.25s cooldown -> HOLD KeyX and press KeyS (backward) rolls backward while staying facing forward!
  for (let i = 0; i < 6; i++) Ph.updatePlayer(0.05, 0.55 + i * 0.05, player);
  assert.equal(Ph.P.rollCooldown, 0);
  Ph.P.vx = 0; Ph.P.vz = 0;
  Ph.P.facing = 0;
  Ph.keys.KeyX = true;
  Ph.updatePlayer(0.05, 0.9, player); // hold X alone -> does NOT roll
  assert.equal(Ph.P.rollT, 0, 'Holding X alone with no direction must not roll');
  Ph.keys.KeyS = true; // press backward while holding X -> immediate back-roll!
  Ph.updatePlayer(0.05, 0.95, player);
  assert.ok(Ph.P.rollT > 0.3, 'Holding X and pressing S must trigger backward roll');
  assert.ok(Ph.P.rollDirZ < -0.9, `Expected backward roll along -Z, got rollDirZ=${Ph.P.rollDirZ}`);
  assert.ok(player.userData.pelvis.rotation.x < -0.2, `Backward roll should tumble backward (-rotX), got ${player.userData.pelvis.rotation.x}`);
  assert.ok(Math.abs(Ph.P.facing) < 0.05, `Back-roll must keep forward facing 0, got ${Ph.P.facing}`);
  Ph.keys.KeyX = false;
  Ph.keys.KeyS = false;

  // Complete the ENTIRE backward roll and settle on feet -> Starkeeper MUST still face forward (0)!
  for (let i = 0; i < 16; i++) Ph.updatePlayer(0.05, 1.0 + i * 0.05, player);
  assert.equal(Ph.P.rollT, 0, 'Backward roll should have finished');
  assert.ok(Math.abs(Ph.P.facing) < 0.05, `After standing up from back-roll, must still face forward (0), got ${Ph.P.facing}`);
  assert.ok(Math.abs(player.rotation.y) < 0.08, `Player mesh must stay facing forward after back-roll, got ${player.rotation.y}`);
});

// 6. Z-target acquisition, range auto-drop (>26u), toggle release, strafing & aiming
test('Z-targeting acquires nearest valid target, supports strafing & aiming, and auto-drops beyond 26u', () => {
  const Vec3 = makeVec3Class();
  const lockEvents = [];
  const nearTarget = {
    kind: 'gloom',
    ref: { hp: 2, vx: 2, vz: 0 },
    mesh: { position: new Vec3(0, 0, 10), parent: {} },
    yOffset: 0.6,
  };
  const farTarget = {
    kind: 'cocoon',
    ref: { hp: 1 },
    mesh: { position: new Vec3(0, 0, 23), parent: {} },
    yOffset: 0.8,
  };
  let activeList = [farTarget, nearTarget];

  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    Sound: { lockOn: (v) => lockEvents.push(v), step: () => {}, land: () => {}, splash: () => {}, roll: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => {
      out.x = 0; out.y = 1; out.z = 0;
      return out;
    },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  Ph.init(null, { getLockCandidates: () => activeList });
  const player = makeMockPlayer();
  Ph.P.onGround = true;

  // Toggle on -> acquires nearTarget within 20u (ignores farTarget >20u)
  Ph.toggleLockOn();
  assert.ok(Ph.lockTarget !== null, 'Should acquire lock target within 20u');
  assert.equal(Ph.lockTarget.ref, nearTarget.ref);
  assert.deepEqual(lockEvents, [true]);

  // Aim direction points toward target (with mild velocity lead along +X)
  const aim = Ph.getAimDirection(new Vec3(0, 1.2, 0), new Vec3());
  assert.ok(aim.z > 0.9 && aim.x > 0, `Aim should point toward +Z target with +X lead, got (${aim.x}, ${aim.y}, ${aim.z})`);

  // Circle-strafe right (KeyD) around target at +Z -> moves along -X while facing target
  Ph.keys.KeyD = true;
  Ph.updatePlayer(0.05, 0.05, player);
  assert.ok(Ph.P.x < 0, `Pressing D while locked on +Z target should circle-strafe (-X), got x=${Ph.P.x}`);
  Ph.keys.KeyD = false;

  // Move target beyond 26u -> auto-drops lock-on
  nearTarget.mesh.position.z = 27.5;
  Ph.validateLockTarget();
  assert.equal(Ph.lockTarget, null, 'Should auto-release lock when distance > 26u');
  assert.deepEqual(lockEvents, [true, false]);

  // Re-lock and verify manual toggle off
  nearTarget.mesh.position.z = 8;
  Ph.toggleLockOn();
  assert.ok(Ph.lockTarget !== null);
  Ph.toggleLockOn();
  assert.equal(Ph.lockTarget, null, 'Second toggleLockOn should release target');
});

test('projectLockReticle projects locked target into screen space using scratch vector and hides when unlocked', () => {
  const Vec3 = makeVec3Class();
  // Override project to simulate clip-space NDC projection for point (0, 1, 10)
  Vec3.prototype.project = function () {
    this.x = 0.2;
    this.y = -0.1;
    this.z = 0.5;
    return this;
  };
  const target = {
    kind: 'gloom',
    ref: { hp: 2 },
    mesh: { position: new Vec3(0, 0.4, 10), parent: {} },
    yOffset: 0.6,
  };
  const cam = makeMockCamera(Vec3);
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    camera: cam,
  });
  Ph.init(null, { getLockCandidates: () => [target] });

  const unlocked = Ph.projectLockReticle(cam, 1000, 800);
  assert.equal(unlocked.visible, false);

  Ph.toggleLockOn();
  const locked = Ph.projectLockReticle(cam, 1000, 800);
  assert.equal(locked.visible, true);
  assert.ok(Math.abs(locked.x - 600) < 0.01);
  assert.ok(Math.abs(locked.y - 440) < 0.01);
  assert.ok(locked.scale > 0);
});

test('buoyant water swimming & first-person eye height work cleanly', () => {
  const Vec3 = makeVec3Class();
  let splashes = 0;
  const cam = makeMockCamera(Vec3);
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    WATER_Y: 0,
    Shaders: { waterHeightAt: () => 0.1 },
    Sound: { splash: () => { splashes++; }, step: () => {}, land: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => -4.0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'water',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: cam,
  });
  Ph.init(null, { onSplash: () => { splashes++; } });
  const player = makeMockPlayer();

  // Drop fast into deep water -> triggers splash & buoyant swimming
  Ph.P.y = 0.5;
  Ph.P.vy = -5.0;
  for (let i = 0; i < 20; i++) {
    Ph.updatePlayer(0.05, i * 0.05, player);
  }
  assert.equal(Ph.P.swimming, true, 'Deep water should activate swimming');
  assert.ok(splashes > 0, 'Plunging into water should trigger splash sound/particles');
  assert.ok(Ph.P.y > -1.55 && Ph.P.y < -1.0, `Buoyancy must keep torso submerged IN water (~-1.28, head above 0), got y=${Ph.P.y}`);

  // Underwater melee & Shot -> Melee hybrid combos work smoothly with water-drag duration!
  const swimHit1 = Ph.startMelee();
  assert.equal(swimHit1, 1, 'Underwater melee Hit 1 must trigger while swimming');
  assert.ok(Ph.P.meleeDur > 0.54, `Underwater melee must feel slightly weightier (>=0.54s), got ${Ph.P.meleeDur}`);
  Ph.P.meleeT = 0;
  Ph.P.shotComboStep = 2;
  Ph.P.shotComboWindowT = 0.6;
  assert.equal(Ph.startMelee(), 'dashWhirl', 'Shot -> Melee Dash-Whirl hybrid combo must work underwater');

  // First-person eye height = P.y + 1.82
  Ph.firstPerson = true;
  Ph.updatePlayer(0.016, 1.0, player);
  assert.ok(Math.abs(cam.position.y - (Ph.P.y + 1.82)) < 0.01, `Expected FP eye height P.y + 1.82, got ${cam.position.y - Ph.P.y}`);
});

test('init binds right-click Z-target, left-click melee, KeyF shoot & cast anim, left-drag orbits', () => {
  const Vec3 = makeVec3Class();
  const winListeners = new Map();
  const domListeners = new Map();
  const domEl = {
    addEventListener(type, fn) { domListeners.set(type, fn); },
    removeEventListener(type) { domListeners.delete(type); },
  };
  let shoots = 0;
  let melees = 0;
  const target = {
    kind: 'cocoon',
    ref: { hp: 1 },
    mesh: { position: new Vec3(0, 0, 10), parent: {} },
    yOffset: 0.7,
  };
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    addEventListener(type, fn) { winListeners.set(type, fn); },
    Sound: { lockOn: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, jump: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  Ph.init(domEl, {
    isStarted: () => true,
    onShoot: () => { shoots++; },
    onMelee: () => { melees++; },
    getLockCandidates: () => [target],
  });

  // contextmenu is suppressed
  let prevented = false;
  domListeners.get('contextmenu')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);

  // Right-click toggles lock-on and does NOT trigger shoot or melee
  domListeners.get('mousedown')({ button: 2, clientX: 100, clientY: 100, preventDefault() {} });
  winListeners.get('mouseup')({ button: 2 });
  assert.ok(Ph.lockTarget !== null, 'Right-click should engage lock-on');
  assert.equal(shoots, 0, 'Right-click must not fire Star Bolt');
  assert.equal(melees, 0, 'Right-click must not swing melee');

  // Left-drag (>=6px) does NOT trigger melee or shoot
  domListeners.get('mousedown')({ button: 0, clientX: 100, clientY: 100 });
  winListeners.get('mousemove')({ clientX: 120, clientY: 105 });
  winListeners.get('mouseup')({ button: 0 });
  assert.equal(melees, 0, 'Left-drag orbit must not swing melee');
  assert.equal(shoots, 0, 'Left-drag orbit must not fire Star Bolt');

  // Clean left-click (<6px) triggers Staff Melee callback (not ranged shoot)
  domListeners.get('mousedown')({ button: 0, clientX: 100, clientY: 100 });
  winListeners.get('mouseup')({ button: 0 });
  assert.equal(melees, 1, 'Left-click should trigger melee attack');
  assert.equal(shoots, 0, 'Left-click must not trigger ranged F shoot');

  // KeyF triggers manual ranged Star Bolt & cast animation
  winListeners.get('keydown')({ code: 'KeyF', repeat: false, preventDefault() {} });
  assert.equal(shoots, 1);
  assert.ok(Ph.P.castT >= 0.27, 'KeyF shoot should trigger cast animation');

  const player = makeMockPlayer();
  Ph.P.onGround = true;
  Ph.updatePlayer(0.14, 0.14, player);
  assert.ok(player.userData.staffPivot.rotation.x > 0.7, 'Staff should thrust forward during castT');
  assert.ok(player.userData.armR.rotation.x < -0.5, 'Right arm should thrust forward during castT');
});

test('getAimDirection uses manual camera ray (no passive auto-aim), and reticle hides behind camera', () => {
  const Vec3 = makeVec3Class();
  Vec3.prototype.project = function () {
    this.x = 0; this.y = 0; this.z = 0.5; return this;
  };
  const cam = makeMockCamera(Vec3);
  cam.position.set(0, 3, -8);
  cam.lookAt(0, 3, 12);
  const offAxisCandidate = {
    kind: 'gloom',
    ref: { hp: 3 },
    mesh: { position: new Vec3(4.5, 0.5, 10), parent: {} },
    yOffset: 0.5,
  };
  const behindCandidate = {
    kind: 'gloom',
    ref: { hp: 3 },
    mesh: { position: new Vec3(0, 0.5, -10), parent: {} },
    yOffset: 0.5,
  };
  let candidates = [behindCandidate, offAxisCandidate];
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    camera: cam,
  });
  Ph.init(null, { getLockCandidates: () => candidates });
  Ph.P.facing = 0; // facing +Z

  // Unlocked aim MUST NOT passively snap to off-axis gloom at x=4.5; follows manual camera ray (+Z)
  const aimManual = Ph.getAimDirection(new Vec3(0, 1.2, 0), new Vec3());
  assert.ok(Math.abs(aimManual.x) < 0.08 && aimManual.z > 0.95, `Unlocked aim must follow manual camera ray (no auto-aim), got (${aimManual.x}, ${aimManual.y}, ${aimManual.z})`);

  // Lock onto offAxisCandidate -> intentional Z-target tracks it
  candidates = [offAxisCandidate];
  Ph.toggleLockOn();
  const aimLocked = Ph.getAimDirection(new Vec3(0, 1.2, 0), new Vec3());
  assert.ok(aimLocked.x > 0.3, `Locked aim should track Z-target, got x=${aimLocked.x}`);
  Ph.clearLockOn();

  // Lock onto behindCandidate while camera faces +Z -> reticle must be invisible
  candidates = [behindCandidate];
  Ph.toggleLockOn();
  cam.position.set(0, 2, 0);
  cam.lookAt(0, 2, 10);
  const behindRet = Ph.projectLockReticle(cam, 800, 600);
  assert.equal(behindRet.visible, false, 'Target behind camera must not show reticle');
});

test('melee 3-hit combo, roll-strike, aerial plunge slam, fall damage & drowning damage callbacks work cleanly', () => {
  const Vec3 = makeVec3Class();
  let plungeHits = 0;
  let fallDmgTotal = 0;
  let drownDmgTotal = 0;
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    WATER_Y: 0,
    Shaders: { waterHeightAt: () => 0 },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });
  let plungeTrails = 0;
  Ph.init(null, {
    onMelee: () => Ph.startMelee(),
    onPlungeImpact: () => { plungeHits++; },
    onPlungeTrail: () => { plungeTrails++; },
    onFallDamage: (dmg) => { fallDmgTotal += dmg; },
    onDrownDamage: (dmg) => { drownDmgTotal += dmg; },
  });
  const player = makeMockPlayer();
  Ph.P.onGround = true;
  Ph.P.y = 0;

  // Hit 1: Left -> Right horizontal sweep, plus combo buffering while active!
  assert.equal(Ph.startMelee(), 1);
  assert.ok(Ph.P.meleeDur >= 0.42, `Hit 1 duration must be readable (>=0.42s), got ${Ph.P.meleeDur}`);
  Ph.updatePlayer(0.02, 0.02, player);
  const hit1StartTorsoY = player.userData.torso.rotation.y;
  assert.ok(player.userData.staffPivot.rotation.x > 2.4, `Staff should extend horizontally during Hit 1, got ${player.userData.staffPivot.rotation.x}`);
  // Click early mid-swing -> buffered cleanly instead of dropped!
  assert.equal(Ph.startMelee(), false);
  assert.ok(Ph.P.meleeBufT > 0.1, 'Early mid-swing click should arm combo input buffer');
  for (let i = 0; i < 5; i++) Ph.updatePlayer(0.05, 0.05 + i * 0.05, player);
  const hit1EndTorsoY = player.userData.torso.rotation.y;
  assert.ok(hit1StartTorsoY > hit1EndTorsoY, `Hit 1 should sweep Left (+Y) -> Right (-Y), got ${hit1StartTorsoY} -> ${hit1EndTorsoY}`);
  // Finish cancel window -> buffered Hit 2 auto-triggers! (Hit 1 is 0.48s, cancel opens at 0.36s)
  Ph.updatePlayer(0.05, 0.30, player);
  Ph.updatePlayer(0.05, 0.35, player);
  assert.equal(Ph.P.meleeStep, 2, 'Buffered click must smoothly chain into Hit 2');
  const hit2StartTorsoY = player.userData.torso.rotation.y;
  for (let i = 0; i < 5; i++) Ph.updatePlayer(0.05, 0.40 + i * 0.05, player);
  const hit2EndTorsoY = player.userData.torso.rotation.y;
  assert.ok(hit2EndTorsoY > hit2StartTorsoY, `Hit 2 should sweep Right (-Y) -> Left (+Y), got ${hit2StartTorsoY} -> ${hit2EndTorsoY}`);

  // Hit 3: 360° horizontal whirlwind spin (readable 0.74s airborne spin!)
  for (let i = 0; i < 4; i++) Ph.updatePlayer(0.05, 0.65 + i * 0.05, player);
  assert.equal(Ph.startMelee(), 3);
  assert.ok(Ph.P.meleeDur >= 0.70, `Hit 3 Spin360 must be readable (>=0.70s), got ${Ph.P.meleeDur}`);
  Ph.updatePlayer(0.14, 0.85, player);
  assert.ok(player.userData.staffPivot.rotation.x > 2.8, `360° spin must extend staff horizontally, got ${player.userData.staffPivot.rotation.x}`);
  assert.ok(Math.abs(player.userData.pelvis.rotation.y) > 1.0, `360° spin must rotate pelvis around Y, got ${player.userData.pelvis.rotation.y}`);
  for (let i = 0; i < 14; i++) Ph.updatePlayer(0.05, 0.90 + i * 0.05, player);

  Ph.keys.KeyW = true;
  assert.equal(Ph.startRoll(), true);
  Ph.keys.KeyW = false;
  assert.equal(Ph.startMelee(), 'roll');
  for (let i = 0; i < 10; i++) Ph.updatePlayer(0.05, 1.3 + i * 0.05, player);

  // Steep cliff fall triggers fall damage
  Ph.P.onGround = false;
  Ph.P.y = 12;
  Ph.P.vy = -18;
  for (let i = 0; i < 20; i++) Ph.updatePlayer(0.04, 2.0 + i * 0.04, player);
  assert.ok(fallDmgTotal >= 2, `Steep fall should deal >=2 half-hearts fall damage, got ${fallDmgTotal}`);

  // Low-hop Aerial Star-Slam triggers cleanly at y=0.35, vaults forward, dives with trail, lands in knee-slam pose & cushions fall damage!
  const fallBeforePlunge = fallDmgTotal;
  Ph.P.onGround = false;
  Ph.P.y = 0.35;
  Ph.P.vy = 2.5;
  Ph.P.facing = 0;
  Ph.P.z = 0;
  assert.equal(Ph.startMelee(), 'plunge', 'Jump attack must trigger reliably even on a low hop');
  assert.ok(Ph.P.plungeWindupT > 0.1, 'Jump attack should start with visible overhead vault windup');
  assert.ok(Ph.P.vz > 7.0, `Jump attack should vault forward along facing, got vz=${Ph.P.vz}`);
  Ph.updatePlayer(0.05, 3.0, player);
  assert.ok(player.userData.armR.rotation.x < -2.4, `Plunge windup should raise staff overhead, got armR.x=${player.userData.armR.rotation.x}`);
  let landedPoseSeen = false;
  for (let i = 1; i < 30; i++) {
    Ph.updatePlayer(0.04, 3.0 + i * 0.04, player);
    if (Ph.P.plungeLandT > 0.1 && player.userData.pelvis.position.y < 0.75) landedPoseSeen = true;
  }
  assert.equal(plungeHits, 1, 'Plunge landing must fire onPlungeImpact');
  assert.ok(plungeTrails > 0, 'Plunge dive must emit golden comet trail sparks');
  assert.ok(landedPoseSeen, 'Plunge landing must hold heroic one-knee crater slam pose');
  assert.equal(fallDmgTotal, fallBeforePlunge, 'Plunge Slam should cushion fall damage');

  // Sequential 3-step Star-Shot combo (1 -> 2 -> 3) & hybrid Melee<->Shot combos!
  Ph.P.onGround = true;
  Ph.P.y = 0;
  Ph.P.meleeT = 0;
  Ph.P.meleeStep = 0;
  Ph.P.comboWindowT = 0;
  Ph.P.spinCancelWindowT = 0;
  Ph.P.plungeLandT = 0;
  assert.equal(Ph.startShot(), 1, 'First F press fires Shot step 1');
  assert.equal(Ph.startShot(), 2, 'Second F press in window chains into Shot step 2 (Twin Bolts)');
  assert.equal(Ph.startShot(), 3, 'Third F press chains into Shot step 3 (Grand Star-Orb)');
  assert.equal(Ph.startShot(), 1, 'Shot after finisher resets cleanly to step 1');

  // F -> Click => Starlight Dash-Cut!
  assert.equal(Ph.startMelee(), 'dashCut', 'F -> Click must trigger Starlight Dash-Cut');
  assert.ok(Math.hypot(Ph.P.vx, Ph.P.vz) >= 11.5, 'Starlight Dash-Cut should surge forward');
  Ph.P.meleeT = 0; Ph.P.comboWindowT = 0; Ph.P.meleeStep = 0;

  // F -> F -> Click => Comet Dash-Whirl!
  assert.equal(Ph.startShot(), 1);
  assert.equal(Ph.startShot(), 2);
  assert.equal(Ph.startMelee(), 'dashWhirl', 'F -> F -> Click must trigger Comet Dash-Whirl');
  // Click x3 / Dash-Whirl -> F => Constellation Nova!
  assert.equal(Ph.startShot(), 'nova', '360° Spin -> F must trigger Constellation Nova');

  // Click -> F => Star-Fan Scatter!
  Ph.P.meleeT = 0; Ph.P.comboWindowT = 0; Ph.P.meleeStep = 0;
  assert.equal(Ph.startMelee(), 1);
  assert.equal(Ph.startShot(), 'fan', 'Click -> F must trigger Star-Fan Scatter');

  // Click -> Click -> F => Piercing Comet!
  assert.equal(Ph.startMelee(), 1);
  Ph.P.meleeT = 0;
  assert.equal(Ph.startMelee(), 2);
  assert.equal(Ph.startShot(), 'comet', 'Click -> Click -> F must trigger Piercing Comet');

  // Sprint Charge-Slash carries & boosts forward momentum instead of braking, and chains into Hit 2!
  Ph.P.meleeT = 0; Ph.P.meleeStep = 0; Ph.P.comboWindowT = 0; Ph.P.shotComboWindowT = 0;
  Ph.P.facing = 0;
  Ph.P.sprinting = true;
  Ph.P.sprintBlend = 1;
  Ph.P.vx = 0;
  Ph.P.vz = 11.0;
  assert.equal(Ph.startMelee(), 'sprint', 'Melee while sprinting must fire Sprint Charge-Slash');
  assert.ok(Ph.P.vz >= 13.0, `Sprint Charge-Slash should boost forward momentum (>=13 u/s), got vz=${Ph.P.vz}`);
  Ph.updatePlayer(0.12, 4.5, player);
  assert.ok(Ph.P.vz >= 9.0, `Sprint Charge-Slash must preserve momentum through the swing, got vz=${Ph.P.vz}`);
  Ph.P.meleeT = 0;
  assert.equal(Ph.startMelee(), 2, 'Clicking after Sprint Charge-Slash chains cleanly into Hit 2');

  // Underwater empty air ticks drowning damage instead of auto-floating up
  const PhDeep = loadPhysics({
    THREE: { Vector3: Vec3, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x } },
    WATER_Y: 0,
    Shaders: { waterHeightAt: () => 0 },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => -10,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'water',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });
  PhDeep.init(null, { onDrownDamage: (dmg) => { drownDmgTotal += dmg; } });
  PhDeep.P.y = -3.5;
  PhDeep.P.air = 0;
  PhDeep.P.swimming = true;
  for (let i = 0; i < 40; i++) PhDeep.updatePlayer(0.05, i * 0.05, player);
  assert.ok(drownDmgTotal >= 1, `Empty air underwater must tick drowning damage, got ${drownDmgTotal}`);
  assert.ok(PhDeep.P.y < -2.0, `Out of breath must NOT auto-float player back to surface, got y=${PhDeep.P.y}`);
});

test('updatePlayer prevents walking through solid tree collider', () => {
  const Vec3 = makeVec3Class();
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => {
      out.length = 0;
      out.push({ x: 0, z: 2.0, r: 0.6 });
      return out;
    },
    camera: makeMockCamera(Vec3),
  });
  const player = makeMockPlayer();
  Ph.P.onGround = true;
  Ph.keys.KeyW = true; // walk toward +Z straight into tree at (0, 2.0)

  for (let i = 0; i < 30; i++) {
    Ph.updatePlayer(0.03, i * 0.03, player);
  }
  const dist = Math.hypot(Ph.P.x - 0, Ph.P.z - 2.0);
  assert.ok(dist >= 1.01, `Player radius 0.42 + tree 0.6 = 1.02 must prevent clipping, got dist=${dist}`);
});

test('upward sky-gaze camera keeps full distance on flat terrain while pulling inward before a ridge', () => {
  const Vec3 = makeVec3Class();
  const winListeners = new Map();
  const domListeners = new Map();
  const domEl = {
    addEventListener(type, fn) { domListeners.set(type, fn); },
    removeEventListener(type) { domListeners.delete(type); },
  };
  let ridgeActive = false;
  const cam = makeMockCamera(Vec3);
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    addEventListener(type, fn) { winListeners.set(type, fn); },
    heightAt: (x, z) => (ridgeActive && z < -2 && z > -5 ? 8 : 0),
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: cam,
  });

  Ph.init(domEl, { isStarted: () => true });
  const player = makeMockPlayer();
  Ph.P.onGround = true;

  // Drag mouse upward to tilt camPitch ~1.0 rad (gazing up at sky constellations)
  domListeners.get('mousedown')({ button: 0, clientX: 200, clientY: 300 });
  winListeners.get('mousemove')({ clientX: 200, clientY: 62 }); // dy = -238 -> camPitch ~ 1.002
  winListeners.get('mouseup')({ button: 0 });

  for (let i = 0; i < 40; i++) {
    Ph.updatePlayer(0.05, i * 0.05, player);
  }
  const flatHorizDist = Math.hypot(cam.position.x - Ph.P.x, cam.position.z - Ph.P.z);
  assert.ok(flatHorizDist > 5.0, `Upward sky-gaze on flat terrain should preserve orbit distance (>5.0u), got ${flatHorizDist}`);
  assert.ok(cam.position.y >= 0.80, `Camera must remain above waist clearance, got y=${cam.position.y}`);

  // Now raise a steep ridge behind the player -> camera must pull cleanly in front of ridge
  ridgeActive = true;
  for (let i = 0; i < 40; i++) {
    Ph.updatePlayer(0.05, 2.0 + i * 0.05, player);
  }
  const ridgeHorizDist = Math.hypot(cam.position.x - Ph.P.x, cam.position.z - Ph.P.z);
  assert.ok(ridgeHorizDist < 2.6, `Ridge behind player should pull camera inward, got ${ridgeHorizDist}`);
});

test('resolveColliders handles exact center overlap (dx = 0, dz = 0) without NaN', () => {
  const Ph = loadPhysics();
  const out = { x: 0, z: 0, hit: false };
  const res = Ph.resolveColliders(5, 3, 0.42, [{ x: 5, z: 3, r: 1.0 }], out);
  assert.equal(res.hit, true);
  assert.ok(!Number.isNaN(res.x) && !Number.isNaN(res.z));
  const dist = Math.hypot(res.x - 5, res.z - 3);
  assert.ok(dist >= 1.419, `Expected separation >= 1.42 on exact center overlap, got ${dist}`);
});

test('underwater diving drains air and surfacing refills air', () => {
  const Vec3 = makeVec3Class();
  let breathWarned = false;
  const globalHandlers = {};
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x, a, b) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      } },
    },
    WATER_Y: 0,
    Shaders: { waterHeightAt: () => 0 },
    Sound: { splash: () => {}, step: () => {}, land: () => {}, roll: () => {}, lockOn: () => {}, jump: () => {} },
    heightAt: () => -8.0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'water',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
    addEventListener: (ev, fn) => { (globalHandlers[ev] ||= []).push(fn); },
  });
  const dom = { listeners: {}, addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); } };
  Ph.init(dom, { onToast: (msg) => { if (msg.includes('breath')) breathWarned = true; } });
  const player = makeMockPlayer();

  Ph.P.y = -1.28;
  Ph.P.swimming = true;

  // Point camera downward (drag mouse down -> negative camPitch) and swim forward to dive
  dom.listeners.mousedown[0]({ button: 0, clientX: 200, clientY: 200, preventDefault() {} });
  for (const fn of globalHandlers.mousemove || []) fn({ clientX: 200, clientY: 370 });
  for (const fn of globalHandlers.mouseup || []) fn({ button: 0 });

  Ph.keys.KeyW = true;
  for (let i = 0; i < 40; i++) {
    Ph.updatePlayer(0.05, i * 0.05, player);
  }
  assert.ok(Ph.P.y < -2.0, `Pointing camera down + swimming forward should dive down, got y=${Ph.P.y}`);
  assert.ok(Ph.P.air < Ph.AIR_MAX - 0.5, `Diving below surface should drain air, got air=${Ph.P.air}`);
  assert.ok(player.userData.pelvis.rotation.x > 0.9, `Swimming should pitch Starkeeper prone horizontally, got ${player.userData.pelvis.rotation.x}`);

  // Neutral buoyancy holds underwater depth when stopping movement
  Ph.keys.KeyW = false;
  const depthHeld = Ph.P.y;
  for (let i = 0; i < 12; i++) Ph.updatePlayer(0.04, 2.1 + i * 0.04, player);
  assert.ok(Math.abs(Ph.P.y - depthHeld) < 0.7, `Neutral buoyancy should hold depth (${depthHeld} vs ${Ph.P.y})`);

  // Drain near zero and verify breath warning toast
  Ph.P.air = 0.05;
  Ph.updatePlayer(0.08, 3.0, player);
  assert.equal(Ph.P.air, 0);
  assert.equal(breathWarned, true, 'Running out of air underwater should warn player');

  // Hold Space -> ascends briskly back to surface waterline (torso submerged, head above waves!) and refills air
  Ph.keys.Space = true;
  for (let i = 0; i < 60; i++) {
    Ph.updatePlayer(0.05, 3.1 + i * 0.05, player);
  }
  Ph.keys.Space = false;
  assert.ok(Ph.P.y > -1.45 && Ph.P.y < -1.0, `Holding Space underwater should ascend to in-water surface waterline, got y=${Ph.P.y}`);
  assert.ok(Ph.P.air > 2.0, `Surfacing should refill air, got air=${Ph.P.air}`);
});

test('variable jump height, 3-phase jump pose, and unlimited Shift sprint work cleanly', () => {
  const Vec3 = makeVec3Class();
  let jumpSounds = 0;
  const cam = makeMockCamera(Vec3);
  cam.fov = 60;
  cam.updateProjectionMatrix = () => {};
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    Sound: { jump: () => { jumpSounds++; }, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: cam,
  });
  Ph.init(null, {});
  const player = makeMockPlayer();

  // Short tap standing jump -> symmetric deep knee-bend crouch anticipation BEFORE liftoff!
  Ph.P.onGround = true;
  Ph.P.y = 0;
  Ph.P.vx = 0;
  Ph.P.vz = 0;
  Ph.keys.Space = true;
  Ph.updatePlayer(0.016, 0.016, player);
  assert.ok(Ph.P.jumpPrepT > 0, 'Standing jump should enter brief knee-bend anticipation before takeoff');
  assert.equal(Ph.P.onGround, true, 'Still grounded during initial knee-bend anticipation');
  // Advance halfway through ~74ms standing crouch -> check symmetric knee bend & lowered pelvis!
  Ph.updatePlayer(0.03, 0.046, player);
  assert.ok(player.userData.pelvis.position.y < 0.74, `Standing jump crouch should dip pelvis, got ${player.userData.pelvis.position.y}`);
  assert.ok(
    player.userData.kneeL.rotation.x > 0.7 && player.userData.kneeR.rotation.x > 0.7,
    `Standing jump crouch should bend both knees symmetrically, got L=${player.userData.kneeL.rotation.x}, R=${player.userData.kneeR.rotation.x}`
  );

  // Finish ~74ms crouch -> springs upward!
  Ph.updatePlayer(0.048, 0.094, player);
  assert.equal(jumpSounds, 1, 'Jump launch should trigger Sound.jump()');
  assert.ok(Ph.P.jumpStretch > 0.5, 'Jump takeoff should set jumpStretch');

  Ph.updatePlayer(0.04, 0.134, player);
  assert.ok(
    player.userData.thighR.rotation.x < -0.3 && player.userData.thighL.rotation.x > 0.1,
    `Rising jump should show asymmetric leap pose, got R=${player.userData.thighR.rotation.x}, L=${player.userData.thighL.rotation.x}`
  );

  Ph.keys.Space = false;
  let shortMaxY = 0;
  for (let i = 0; i < 45; i++) {
    Ph.updatePlayer(0.02, 0.15 + i * 0.02, player);
    if (Ph.P.y > shortMaxY) shortMaxY = Ph.P.y;
  }

  // Full held jump reaches higher apex and billows cloak when falling
  Ph.P.onGround = true;
  Ph.P.y = 0;
  Ph.keys.Space = true;
  let fullMaxY = 0;
  let maxFallCloak = 0;
  for (let i = 0; i < 65; i++) {
    Ph.updatePlayer(0.02, 1.5 + i * 0.02, player);
    if (Ph.P.y > fullMaxY) fullMaxY = Ph.P.y;
    if (Ph.P.vy < -4) maxFallCloak = Math.max(maxFallCloak, player.userData.capeSegs[0].rotation.x);
  }
  Ph.keys.Space = false;
  assert.ok(fullMaxY > shortMaxY + 0.35, `Full jump (${fullMaxY.toFixed(2)}) must clear short tap (${shortMaxY.toFixed(2)})`);
  assert.ok(maxFallCloak > 0.85, `Falling cloak should billow upward, got ${maxFallCloak}`);

  // Holding Shift sprints fast (>10 u/s) and widens camera FOV without rolling
  Ph.P.onGround = true;
  Ph.P.y = 0;
  Ph.keys.KeyW = true;
  Ph.keys.ShiftLeft = true;
  for (let i = 0; i < 45; i++) Ph.updatePlayer(0.02, 3.0 + i * 0.02, player);
  const sprintSpd = Math.hypot(Ph.P.vx, Ph.P.vz);
  assert.equal(Ph.P.rollT, 0, 'Holding Shift should sprint, not roll');
  assert.equal(Ph.P.sprinting, true);
  assert.ok(sprintSpd > 10.0, `Sprint speed should exceed 10 u/s, got ${sprintSpd}`);
  assert.ok(cam.fov > 63.5, `Sprint should widen camera FOV toward 65, got ${cam.fov}`);

  // Jumping while sprinting uses asymmetric single-leg plant-and-drive takeoff AND preserves full sprint speed!
  Ph.keys.Space = true;
  Ph.updatePlayer(0.02, 4.0, player);
  assert.ok(Ph.P.jumpPrepT > 0 && Ph.P.jumpPrepRunB > 0.8, `Sprint jump should use running plant-and-drive anticipation, runB=${Ph.P.jumpPrepRunB}`);
  assert.ok(
    Math.abs(player.userData.thighR.rotation.x - player.userData.thighL.rotation.x) > 0.15,
    `Running jump anticipation should be asymmetric single-leg drive, got L=${player.userData.thighL.rotation.x}, R=${player.userData.thighR.rotation.x}`
  );
  Ph.updatePlayer(0.03, 4.03, player);
  Ph.updatePlayer(0.03, 4.06, player);
  assert.ok(Ph.P.vy > 7.5, `Running jump should launch briskly after ~52ms plant, got vy=${Ph.P.vy}`);
  assert.ok(Math.hypot(Ph.P.vx, Ph.P.vz) > 9.5, `Running jump must preserve full sprint momentum, got ${Math.hypot(Ph.P.vx, Ph.P.vz)}`);
  Ph.keys.Space = false;
  Ph.keys.KeyW = false;
  Ph.keys.ShiftLeft = false;
});

test('validateLockTarget drops dead (hp <= 0), detached (parent === null), and null-ref removed targets', () => {
  const Vec3 = makeVec3Class();
  const lockEvents = [];
  let candidates = [];
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    Sound: { lockOn: (v) => lockEvents.push(v), step: () => {}, land: () => {}, splash: () => {}, roll: () => {} },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, { getLockCandidates: () => candidates });

  // Case 1: hp <= 0 drops lock
  const g1 = { kind: 'gloom', ref: { hp: 2 }, mesh: { position: new Vec3(0, 0, 8), parent: {} }, yOffset: 0.6 };
  candidates = [g1];
  Ph.toggleLockOn();
  assert.ok(Ph.lockTarget !== null);
  g1.ref.hp = 0;
  assert.equal(Ph.validateLockTarget(), null, 'Target with hp <= 0 must drop lock-on');
  assert.equal(Ph.lockTarget, null);

  // Case 2: detached mesh (parent === null) drops lock
  const g2 = { kind: 'gloom', ref: { hp: 2 }, mesh: { position: new Vec3(0, 0, 8), parent: {} }, yOffset: 0.6 };
  candidates = [g2];
  Ph.toggleLockOn();
  assert.ok(Ph.lockTarget !== null);
  g2.mesh.parent = null;
  assert.equal(Ph.validateLockTarget(), null, 'Detached target (parent === null) must drop lock-on');
  assert.equal(Ph.lockTarget, null);

  // Case 3: two targets with ref: null -> removing locked target A must NOT match target B
  const nullRefA = { kind: 'cocoon', ref: null, mesh: { position: new Vec3(0, 0, 6), parent: {} }, yOffset: 0.7 };
  const nullRefB = { kind: 'cocoon', ref: null, mesh: { position: new Vec3(5, 0, 12), parent: {} }, yOffset: 0.7 };
  candidates = [nullRefA, nullRefB];
  Ph.toggleLockOn();
  assert.equal(Ph.lockTarget.mesh, nullRefA.mesh);
  candidates = [nullRefB];
  assert.equal(Ph.validateLockTarget(), null, 'Removing null-ref target A must drop lock-on instead of matching null-ref B');
  assert.equal(Ph.lockTarget, null);
  assert.deepEqual(lockEvents, [true, false, true, false, true, false]);
});

test('stepTerrainMove blocks airborne 60 deg cliffs at high FPS and updatePlayer handles non-mutating normalFn', () => {
  const Vec3 = makeVec3Class();
  const slope = Math.tan((60 * Math.PI) / 180);
  const ny = Math.cos((60 * Math.PI) / 180);
  const nx = -Math.sin((60 * Math.PI) / 180);
  // High-FPS step (dt = 0.016, dx = 0.112 -> dh = 0.194 < 0.25) while airborne
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    heightAt: (x) => (x > 0 ? slope * x : 0),
    terrainNormalAt: (x) => (x > 0 ? { x: nx, y: ny, z: 0 } : { x: 0, y: 1, z: 0 }), // non-mutating!
    surfaceAt: () => 'stone',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  const airOut = Ph.stepTerrainMove(0, 0, 0.112, 0, false, (x) => slope * x, () => ({ x: nx, y: ny, z: 0 }), {});
  assert.ok(airOut.x <= 0.01, `Airborne steep cliff should block even at 60 FPS (dh/stepDist > 1.1), got x=${airOut.x}`);

  // Also test updatePlayer with non-mutating normalFn blocking uphill +X velocity
  const player = makeMockPlayer();
  Ph.P.x = -0.02;
  Ph.P.y = 0;
  Ph.P.z = 0;
  Ph.P.onGround = true;
  Ph.P.vx = 6.0;
  Ph.keys.KeyD = false;
  Ph.updatePlayer(0.016, 0.016, player);
  assert.ok(Ph.P.x <= 0.02, `Should block climbing steep cliff even with non-mutating normalFn, got x=${Ph.P.x}`);
  assert.ok(Ph.P.vx <= 0.05, `Blocked uphill velocity should be cancelled using returned normal, got vx=${Ph.P.vx}`);
});

test('height-aware 3D rock colliders allow jumping over & standing on boulders, and emit alternating sand/snow footprints', () => {
  const Vec3 = makeVec3Class();
  const rock = { x: 0, z: 2.0, r: 0.9, topY: 0.95, standable: true };
  let curSurf = 'sand';
  const prints = [];
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => 0.2,
    terrainNormalAt: (_x, _z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => curSurf,
    getNearbyColliders: (_x, _z, _r, out) => {
      out.length = 0;
      out.push(rock);
      return out;
    },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, {
    onFootprint: (x, y, z, yaw, surf, side, scale) => prints.push({ x, y, z, yaw, surf, side, scale }),
  });
  const player = makeMockPlayer();

  // 1. At ground height (footY = 0.2 < rock.topY - 0.18), horizontal collider blocks walking through the rock
  const blocked = Ph.resolveColliders(0, 1.5, 0.45, [rock], {}, 0.2);
  assert.equal(blocked.hit, true, 'Walking at ground level into a boulder should be blocked');
  assert.ok(blocked.z <= rock.z - (rock.r + 0.45) + 0.02, `Should push player outside boulder radius, got z=${blocked.z}`);

  // 2. When feet clear the rock top (footY = 1.05 >= rock.topY - 0.18), player clears cleanly OVER the rock!
  const cleared = Ph.resolveColliders(0, 1.8, 0.45, [rock], {}, 1.05);
  assert.equal(cleared.hit, false, 'Jumping higher than a rock top must NOT block horizontally');
  assert.equal(cleared.z, 1.8);

  // 3. Rising jump near rock top does NOT snag/kill upward vy; descending lands cleanly ON TOP of the rock!
  Ph.P.x = 0;
  Ph.P.z = 2.0;
  Ph.P.y = 0.85;
  Ph.P.vy = 6.5;
  Ph.P.onGround = false;
  Ph.updatePlayer(0.016, 0.016, player);
  assert.ok(Ph.P.vy > 4.0 && Ph.P.y > 0.90, `Rising jump clearing rock must keep rising, got y=${Ph.P.y}, vy=${Ph.P.vy}`);

  // Descend onto the rock top -> stands cleanly at rock.topY (0.95) with onGround=true!
  Ph.P.x = 0;
  Ph.P.z = 2.0;
  Ph.P.y = 1.25;
  Ph.P.vy = -3.0;
  Ph.P.onGround = false;
  prints.length = 0;
  for (let i = 0; i < 12; i++) Ph.updatePlayer(0.02, 0.1 + i * 0.02, player);
  assert.equal(Ph.P.onGround, true, 'Should land on top of standable rock');
  assert.ok(Math.abs(Ph.P.y - rock.topY) < 0.01, `Should stand cleanly at rock.topY=${rock.topY}, got y=${Ph.P.y}`);
  assert.equal(prints.length, 0, 'Must NOT stamp sand/snow footprints on top of a hard stone boulder');

  // 4. Walking & landing on dry sand and snow emits alternating left/right footprints (and none on grass)
  Ph.P.x = 10;
  Ph.P.z = 10;
  Ph.P.y = 0.2;
  Ph.P.onGround = true;
  Ph.P.vx = 0;
  Ph.P.vz = 0;
  prints.length = 0;
  curSurf = 'sand';
  Ph.keys.KeyW = true;
  for (let i = 0; i < 40; i++) Ph.updatePlayer(0.025, 1.0 + i * 0.025, player);
  Ph.keys.KeyW = false;
  assert.ok(prints.length >= 2, `Walking on sand should stamp footprints, got ${prints.length}`);
  assert.equal(prints[0].surf, 'sand');
  assert.equal(prints[0].side, -prints[1].side, 'Consecutive footprints should alternate left/right foot');

  // Snow footprints
  prints.length = 0;
  curSurf = 'snow';
  Ph.keys.KeyW = true;
  for (let i = 0; i < 35; i++) Ph.updatePlayer(0.025, 2.5 + i * 0.025, player);
  Ph.keys.KeyW = false;
  assert.ok(prints.length >= 2 && prints[0].surf === 'snow', 'Walking on snow should stamp snow footprints');

  // Grass emits NO footprints
  prints.length = 0;
  curSurf = 'grass';
  Ph.keys.KeyW = true;
  for (let i = 0; i < 35; i++) Ph.updatePlayer(0.025, 4.0 + i * 0.025, player);
  Ph.keys.KeyW = false;
  assert.equal(prints.length, 0, 'Grass should sway instead of stamping sand/snow footprints');
});

test('Tidecaller Pearl (hasBreathRelic) grants infinite underwater breath, zero drowning ticks, and brisker swim glide', () => {
  const Vec3 = makeVec3Class();
  let drownHits = 0;
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => -12.0,
    terrainNormalAt: (_x, _z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'water',
    getNearbyColliders: (_x, _z, _r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, { onDrownDamage: () => { drownHits++; } });
  const player = makeMockPlayer();

  // Baseline swim speed without relic
  Ph.P.y = -4.0;
  Ph.P.swimming = true;
  Ph.P.hasBreathRelic = false;
  Ph.keys.KeyW = true;
  for (let i = 0; i < 35; i++) Ph.updatePlayer(0.04, i * 0.04, player);
  const baseSwimSpd = Math.hypot(Ph.P.vx, Ph.P.vz);
  assert.ok(Ph.P.air < Ph.AIR_MAX - 0.5, 'Without breathing relic, submerged air must drain');

  // Claim Tidecaller's Pearl -> infinite full air, zero drowning damage, and faster underwater swim!
  Ph.P.hasBreathRelic = true;
  Ph.P.air = 1.0;
  for (let i = 0; i < 80; i++) Ph.updatePlayer(0.05, 2.0 + i * 0.05, player);
  const relicSwimSpd = Math.hypot(Ph.P.vx, Ph.P.vz);
  Ph.keys.KeyW = false;
  assert.equal(Ph.P.air, Ph.AIR_MAX, 'Tidecaller Pearl must keep underwater air permanently full');
  assert.equal(drownHits, 0, 'Tidecaller Pearl must prevent all drowning damage');
  assert.ok(relicSwimSpd > baseSwimSpd * 1.15, `Relic swim speed (${relicSwimSpd.toFixed(2)}) should exceed baseline (${baseSwimSpd.toFixed(2)})`);
});

test('midair jump keeps both knees naturally bent through apex/descent, landings flex knees, and sprint melee executes low forward slide-thrust', () => {
  const Vec3 = makeVec3Class();
  let dustCalls = 0;
  const clothCalls = [];
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    Shaders: {
      waterHeightAt: () => -5,
      setClothMotion: (s, v, r, w) => clothCalls.push({ s, v, r, w }),
    },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (_x, _z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (_x, _z, _r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, { onDust: () => { dustCalls++; } });
  const player = makeMockPlayer();
  player.userData.skirts = {
    fl: { rotation: { x: 0, y: 0, z: 0 } },
    fr: { rotation: { x: 0, y: 0, z: 0 } },
    bl: { rotation: { x: 0, y: 0, z: 0 } },
    br: { rotation: { x: 0, y: 0, z: 0 } },
  };
  player.userData.scarfSegs = [
    { rotation: { x: 0, y: 0, z: 0 } },
    { rotation: { x: 0, y: 0, z: 0 } },
  ];

  // 1. Full jump: verify knees stay comfortably bent during apex & fall, staff stays tilted outward away from hat, and landing compresses knees!
  Ph.P.onGround = true;
  Ph.P.y = 0;
  Ph.keys.Space = true;
  let sawApexBent = false;
  let sawFallBent = false;
  let sawLandingKneeFlex = false;
  let maxStaffZAir = -99;
  for (let i = 0; i < 75; i++) {
    if (i === 40) Ph.keys.Space = false;
    Ph.updatePlayer(0.02, i * 0.02, player);
    if (!Ph.P.onGround && Math.abs(Ph.P.vy) < 1.8 && Ph.P.airB > 0.7) {
      if (player.userData.kneeL.rotation.x > 0.85 && player.userData.kneeR.rotation.x > 0.95) sawApexBent = true;
    }
    if (!Ph.P.onGround && Ph.P.vy < -3.5 && Ph.P.airB > 0.7) {
      if (player.userData.kneeL.rotation.x > 0.75 && player.userData.kneeR.rotation.x > 0.75) sawFallBent = true;
      maxStaffZAir = Math.max(maxStaffZAir, player.userData.staffPivot.rotation.z);
    }
    if (Ph.P.onGround && Ph.P.landT > 0 && player.userData.kneeL.rotation.x > 0.45 && player.userData.pelvis.position.y < 0.84) {
      sawLandingKneeFlex = true;
    }
  }
  Ph.keys.Space = false;
  assert.equal(sawApexBent, true, 'Both knees must remain naturally bent through jump apex');
  assert.equal(sawFallBent, true, 'Both knees must remain athletically bent during jump descent');
  assert.ok(maxStaffZAir < -0.35, `Staff must remain tilted outward away from hat while airborne, got rz=${maxStaffZAir}`);
  assert.ok(clothCalls.length > 10, 'Cloth flow motion uniform should update every frame');
  assert.equal(sawLandingKneeFlex, true, 'Landing must trigger articulated knee-bend impact absorption');

  // 2. Sprint Dash-Attack -> low forward ground-slide thrusting Star-Lantern Staff straight ahead like a spear!
  Ph.P.onGround = true;
  Ph.P.y = 0;
  Ph.keys.KeyW = true;
  Ph.keys.ShiftLeft = true;
  for (let i = 0; i < 40; i++) Ph.updatePlayer(0.02, 2.2 + i * 0.02, player);
  const startZ = Ph.P.z;
  dustCalls = 0;
  const variant = Ph.startMelee();
  assert.equal(variant, 'sprint', 'Melee while sprinting must trigger sprint slide-thrust');
  Ph.keys.KeyW = false;
  Ph.keys.ShiftLeft = false;

  // Mid-slide check (~0.14s into slide)
  for (let i = 0; i < 7; i++) Ph.updatePlayer(0.02, 3.1 + i * 0.02, player);
  assert.ok(player.userData.pelvis.position.y < 0.62, `Sprint slide-thrust must drop into a low slide, got pelvis.y=${player.userData.pelvis.position.y}`);
  assert.ok(player.userData.thighL.rotation.x < -0.9 && player.userData.thighR.rotation.x > 0.4, 'Sprint slide must extend front leg forward and tuck trailing leg low');
  assert.ok(player.userData.armR.rotation.x < -1.2 && player.userData.staffPivot.rotation.x > 2.7, 'Sprint slide-thrust must thrust right arm and staff straight forward horizontally');
  assert.ok(dustCalls >= 2, 'Sliding across ground must kick up continuous dust trail');

  // Finish slide and verify genuine forward slide travel (> 3.2u)
  for (let i = 0; i < 20; i++) Ph.updatePlayer(0.02, 3.3 + i * 0.02, player);
  assert.ok(Math.abs(Ph.P.z - startZ) > 3.2, `Sprint slide-thrust should glide cleanly forward, moved ${Math.abs(Ph.P.z - startZ).toFixed(2)}u`);
});

test('steep-hill sliding bends the higher uphill knee, leans torso back, gazes downhill, and pad colliders support feet without horizontal push-out', () => {
  const Vec3 = makeVec3Class();
  const slope = Math.tan((52 * Math.PI) / 180);
  const ny = Math.cos((52 * Math.PI) / 180);
  const nx = -Math.sin((52 * Math.PI) / 180); // downhill = -X, uphill = +X
  const padCol = { x: 0, z: 0, r: 4.65, topY: 0.10, standable: true, pad: true };
  let useSteep = true;
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    Shaders: { waterHeightAt: () => -5, setClothMotion: () => {} },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: (x) => (useSteep ? slope * x : 0),
    terrainNormalAt: (_x, _z, out) => {
      out.x = useSteep ? nx : 0;
      out.y = useSteep ? ny : 1;
      out.z = 0;
      return out;
    },
    surfaceAt: () => 'stone',
    getNearbyColliders: (_x, _z, _r, out) => {
      out.length = 0;
      if (!useSteep) out.push(padCol);
      return out;
    },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, {});
  const player = makeMockPlayer();

  // 1. Standing on a 52-deg hillside (uphill is +X, facing +Z so legR (+X) is uphill!):
  Ph.P.x = 5;
  Ph.P.z = 0;
  Ph.P.y = slope * 5;
  Ph.P.facing = 0; // +X is legR (uphill!)
  Ph.P.onGround = true;
  for (let i = 0; i < 16; i++) Ph.updatePlayer(0.025, i * 0.025, player);
  assert.equal(Ph.P.sliding, true, '52-deg hillside must trigger sliding');
  assert.ok(Ph.P.slidePoseB > 0.7, `slidePoseB should blend in smoothly, got ${Ph.P.slidePoseB}`);
  assert.ok(player.userData.pelvis.position.y < 0.72, `Hill slide must crouch pelvis low, got ${player.userData.pelvis.position.y}`);
  assert.ok(Math.abs(player.userData.pelvis.rotation.z) < 0.35, `Hill slide pelvis tilt must stay bounded upright, got rz=${player.userData.pelvis.rotation.z}`);
  const maxKnee = Math.max(player.userData.kneeL.rotation.x, player.userData.kneeR.rotation.x);
  const minKnee = Math.min(player.userData.kneeL.rotation.x, player.userData.kneeR.rotation.x);
  assert.ok(maxKnee > 1.0 && maxKnee - minKnee > 0.45, `Uphill knee must bend deeply (${maxKnee.toFixed(2)}) vs extended downhill bracing leg (${minKnee.toFixed(2)})`);
  assert.ok(player.userData.torso.rotation.x < -0.15, `Torso must lean back against steep hill, got ${player.userData.torso.rotation.x}`);
  assert.ok(player.userData.headGroup.rotation.x > 0.15, `Head must gaze downhill while sliding, got ${player.userData.headGroup.rotation.x}`);

  // 2. Starting pad collider (pad: true) lifts Starkeeper's boots cleanly ON TOP OF pad topY (0.10) without horizontal push-out!
  useSteep = false;
  Ph.P.x = 0;
  Ph.P.z = 2.5;
  Ph.P.y = 0.0;
  Ph.P.vy = 0;
  Ph.P.onGround = true;
  const colCheck = Ph.resolveColliders(0, 2.5, 0.42, [padCol], {});
  assert.equal(colCheck.hit, false, 'Walkable floor pad must never push entities horizontally (even without footY)');
  Ph.updatePlayer(0.02, 1.0, player);
  assert.ok(Math.abs(Ph.P.y - 0.10) < 0.005, `Starkeeper boots must stand cleanly atop starting pad at y=0.10, got ${Ph.P.y}`);
});

test('attacks recover smoothly without 1-frame blink, Z-target strafing steps laterally, back skirts tuck under continuous cloak, and faceAimDirection aligns casts', () => {
  const Vec3 = makeVec3Class();
  let lastCurve = null;
  const enemy = {
    kind: 'gloom',
    ref: { hp: 3 },
    mesh: { position: new Vec3(0, 0, 12), parent: {} },
    yOffset: 0.65,
  };
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    Shaders: {
      waterHeightAt: () => -5,
      setClothMotion: () => {},
      setClothCurve: (lift, droop, sway, fl) => { lastCurve = { lift, droop, sway, fl }; },
    },
    Sound: { jump: () => {}, step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (_x, _z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (_x, _z, _r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, { getLockCandidates: () => [enemy] });
  const player = makeMockPlayer();
  player.userData.skirts = {
    fl: { rotation: { x: 0, y: 0, z: 0 } },
    fr: { rotation: { x: 0, y: 0, z: 0 } },
    bl: { rotation: { x: 0, y: 0, z: 0 } },
    br: { rotation: { x: 0, y: 0, z: 0 } },
  };
  Ph.P.onGround = true;
  Ph.P.y = 0;

  // 1. Smooth attack recovery: finishing Hit 1 must NOT snap straight to idle in 1 frame!
  assert.equal(Ph.startMelee(), 1);
  // Step right near the end of Hit 1 (meleeDur = 0.48)
  for (let i = 0; i < 23; i++) Ph.updatePlayer(0.02, i * 0.02, player);
  const preEndArmR = player.userData.armR.rotation.x;
  const preEndStaff = player.userData.staffPivot.rotation.x;
  assert.ok(preEndArmR < -1.0 && preEndStaff > 2.2, `Still mid-attack before end: armR=${preEndArmR}, staff=${preEndStaff}`);

  // Cross meleeT === 0 by 2 small frames -> must be mid-recovery, NOT snapped to idle (0 / 0.42)!
  Ph.updatePlayer(0.032, 0.492, player);
  Ph.updatePlayer(0.016, 0.508, player);
  assert.ok(Ph.P.recoverT > 0.15, `Exiting melee must activate smooth recovery timer, got recoverT=${Ph.P.recoverT}`);
  assert.ok(player.userData.armR.rotation.x < -0.55, `armR must interpolate smoothly instead of blinking to 0, got ${player.userData.armR.rotation.x}`);
  assert.ok(player.userData.staffPivot.rotation.x > 1.35, `staffPivot must interpolate smoothly instead of blinking to 0.42, got ${player.userData.staffPivot.rotation.x}`);

  // After full recovery (~0.28s), bones settle cleanly to idle!
  for (let i = 0; i < 18; i++) Ph.updatePlayer(0.018, 0.31 + i * 0.018, player);
  assert.equal(Ph.P.recoverT, 0);
  assert.ok(Math.abs(player.userData.armR.rotation.x) < 0.08, `armR should reach idle after recovery, got ${player.userData.armR.rotation.x}`);
  assert.ok(Math.abs(player.userData.staffPivot.rotation.x - 0.42) < 0.10, `staffPivot should reach idle after recovery, got ${player.userData.staffPivot.rotation.x}`);

  // 2. Z-target lateral strafing drives genuine lateral hip abduction (thighL/R.rotation.z) & counter-twisted hips vs torso!
  Ph.toggleLockOn();
  assert.ok(Ph.lockTarget !== null, 'Should lock onto enemy ahead');
  Ph.keys.KeyD = true;
  let maxAbsSideL = 0;
  let maxAbsSideR = 0;
  let counterTwistSeen = false;
  for (let i = 0; i < 36; i++) {
    Ph.updatePlayer(0.025, 1.0 + i * 0.025, player);
    maxAbsSideL = Math.max(maxAbsSideL, Math.abs(player.userData.thighL.rotation.z));
    maxAbsSideR = Math.max(maxAbsSideR, Math.abs(player.userData.thighR.rotation.z));
    if (player.userData.pelvis.rotation.y * player.userData.torso.rotation.y < -0.02) counterTwistSeen = true;
  }
  assert.ok(maxAbsSideL > 0.18 && maxAbsSideR > 0.18, `Z-target strafing must abduct thighs laterally (got maxL=${maxAbsSideL.toFixed(2)}, maxR=${maxAbsSideR.toFixed(2)})`);
  assert.ok(counterTwistSeen, 'Z-target strafing must angle hips slightly while counter-rotating torso onto locked enemy');
  Ph.keys.KeyD = false;
  Ph.clearLockOn();

  // 3. Continuous cloak curve uniform is driven & back skirts stay strictly tucked underneath cloak!
  Ph.keys.KeyW = true;
  Ph.keys.ShiftLeft = true;
  for (let i = 0; i < 20; i++) Ph.updatePlayer(0.025, 2.0 + i * 0.025, player);
  assert.ok(lastCurve && lastCurve.lift > 0.5, `Sprint must lift continuous GPU cloak curve, got ${JSON.stringify(lastCurve)}`);
  assert.ok(player.userData.skirts.bl.rotation.x <= lastCurve.lift * 0.62 + 0.01, `Back left skirt (${player.userData.skirts.bl.rotation.x}) must stay tucked underneath continuous cloak (${lastCurve.lift})`);
  assert.ok(player.userData.skirts.br.rotation.x <= lastCurve.lift * 0.62 + 0.01, `Back right skirt (${player.userData.skirts.br.rotation.x}) must stay tucked underneath continuous cloak (${lastCurve.lift})`);
  assert.ok(Math.abs(player.userData.thighL.rotation.z) < 0.02, `Forward sprint must reset thigh lateral abduction to 0, got ${player.userData.thighL.rotation.z}`);
  Ph.keys.KeyW = false;
  Ph.keys.ShiftLeft = false;

  // 4. faceAimDirection immediately turns Starkeeper toward shot direction and sets vertical aim pitch!
  Ph.P.facing = Math.PI; // facing -Z
  Ph.faceAimDirection(1, 0.45, 0); // shooting +X and slightly upward
  assert.ok(Math.abs(Ph.P.facing - Math.PI / 2) < 0.01, `faceAimDirection must turn P.facing to +X (pi/2), got ${Ph.P.facing}`);
  assert.ok(Ph.P.castAimPitch > 0.35, `faceAimDirection must store upward pitch, got ${Ph.P.castAimPitch}`);
  assert.ok(Ph.P.castFaceT > 0.3, `faceAimDirection must hold aim orientation during cast, got ${Ph.P.castFaceT}`);
});

test('Mobile touch APIs drive analog movement, outer-ring sprint, jump, camera orbit, and standstill touch roll', () => {
  const Vec3 = makeVec3Class();
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    WATER_Y: -10,
    Sound: { step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, jump: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });
  Ph.init(null, {});
  const player = makeMockPlayer();
  Ph.P.onGround = true;

  // 1. Virtual joystick forward + outer-ring sprint
  Ph.setTouchMove(0, -1, true);
  for (let i = 0; i < 15; i++) Ph.updatePlayer(0.03, i * 0.03, player);
  assert.ok(Ph.P.z > 2.5, `Forward touch stick must move player along +Z, got z=${Ph.P.z}`);
  assert.equal(Ph.P.sprinting, true, 'Outer-ring touch stick must enable sprinting');
  assert.ok(Math.hypot(Ph.P.vx, Ph.P.vz) > 7.5, `Touch sprint speed should exceed walk speed, got ${Math.hypot(Ph.P.vx, Ph.P.vz)}`);
  Ph.setTouchMove(0, 0, false);

  // 2. Touch camera orbit updates camYaw and camPitch smoothly
  const yaw0 = Ph.camYaw;
  const pitch0 = Ph.camPitch;
  Ph.orbitCamera(80, -40);
  assert.ok(Ph.camYaw < yaw0 - 0.3, `orbitCamera(+dx) must turn camYaw, got ${yaw0} -> ${Ph.camYaw}`);
  assert.ok(Ph.camPitch > pitch0 + 0.1, `orbitCamera(-dy) must tilt camPitch up, got ${pitch0} -> ${Ph.camPitch}`);

  // 3. Touch jump launches Starkeeper off the ground
  Ph.setTouchJump(true);
  for (let i = 0; i < 6; i++) Ph.updatePlayer(0.025, 0.6 + i * 0.025, player);
  assert.ok(Ph.P.y > 0.3 && !Ph.P.onGround, `Touch jump must launch player airborne, got y=${Ph.P.y}`);
  Ph.setTouchJump(false);

  // Land cleanly and verify standstill mobile Roll button (allowFacingFallback=true) rolls forward!
  for (let i = 0; i < 40; i++) Ph.updatePlayer(0.04, 1.0 + i * 0.04, player);
  assert.equal(Ph.P.onGround, true);
  Ph.P.vx = 0; Ph.P.vz = 0;
  assert.equal(Ph.startRoll(true), true, 'Touch Roll button with allowFacingFallback=true must roll even from standstill');
  assert.ok(Ph.P.rollT > 0.3);
});

test('addCameraShake triggers brief inward camKick punch on heavy impacts that decays cleanly', () => {
  const Vec3 = makeVec3Class();
  const cam = makeMockCamera(Vec3);
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x) => x },
    },
    WATER_Y: -10,
    Sound: { step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, jump: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: cam,
  });
  Ph.init(null, {});
  const player = makeMockPlayer();
  Ph.P.onGround = true;

  assert.equal(typeof Ph.getCameraKick, 'function', 'Physics.getCameraKick must be exposed');
  assert.equal(Ph.getCameraKick(), 0);
  Ph.addCameraShake(0.65);
  const peak = Ph.getCameraKick();
  assert.ok(peak >= 0.25 && peak <= 0.60, `Heavy impact must trigger inward camKick (0.25-0.60u), got ${peak}`);
  for (let i = 0; i < 20; i++) Ph.updatePlayer(0.02, i * 0.02, player);
  assert.ok(Ph.getCameraKick() < 0.02, `camKick must decay smoothly back to ~0 within ~0.4s, got ${Ph.getCameraKick()}`);
});

test('Isolated canvas touch IDs keep camera orbit smooth during joystick + button touches and allow 2-finger canvas pinch', () => {
  const Vec3 = makeVec3Class();
  const Ph = loadPhysics({
    THREE: {
      Vector3: Vec3,
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    WATER_Y: -10,
    Sound: { step: () => {}, land: () => {}, splash: () => {}, roll: () => {}, jump: () => {}, lockOn: () => {} },
    heightAt: () => 0,
    terrainNormalAt: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surfaceAt: () => 'grass',
    getNearbyColliders: (x, z, r, out) => { out.length = 0; return out; },
    camera: makeMockCamera(Vec3),
  });

  const listeners = {};
  const domEl = {
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    removeEventListener() {},
  };
  const joyEl = { tagName: 'DIV' };
  const btnEl = { tagName: 'BUTTON' };

  Ph.init(domEl, { isStarted: () => true });
  assert.equal(typeof Ph.camDist, 'number', 'Physics must expose camDist getter');

  const emit = (ev, payload) => {
    for (const fn of (listeners[ev] || [])) fn(payload);
  };

  const yaw0 = Ph.camYaw;
  const dist0 = Ph.camDist;

  // 1. Joystick finger (id=0) on non-canvas element is ignored by canvas touch handler
  emit('touchstart', {
    target: joyEl,
    touches: [{ identifier: 0, clientX: 80, clientY: 460 }],
    changedTouches: [{ identifier: 0, clientX: 80, clientY: 460 }],
    preventDefault() {},
  });

  // 2. Canvas camera finger (id=1) starts while joystick finger (id=0) is held -> e.touches.length === 2!
  // Must track ONLY canvas finger id=1 and NOT falsely trigger pinch zoom!
  let camStartPrevented = false;
  emit('touchstart', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 80, clientY: 460 },
      { identifier: 1, clientX: 500, clientY: 300 },
    ],
    changedTouches: [{ identifier: 1, clientX: 500, clientY: 300 }],
    preventDefault() { camStartPrevented = true; },
  });
  assert.equal(camStartPrevented, true, 'Canvas touchstart must call preventDefault');

  // Move both joystick finger (id=0) and canvas finger (id=1) -> must orbit camYaw, NOT zoom camDist!
  emit('touchmove', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 1, clientX: 580, clientY: 280 },
    ],
    changedTouches: [{ identifier: 1, clientX: 580, clientY: 280 }],
    preventDefault() {},
  });
  assert.equal(Ph.camDist, dist0, 'Joystick + 1 canvas finger must NEVER falsely trigger pinch zoom');
  assert.ok(Ph.camYaw < yaw0 - 0.3, `1 canvas finger while holding joystick must orbit camYaw, got ${yaw0} -> ${Ph.camYaw}`);

  // 3. Third finger (id=2) taps Strike button and lifts -> canvas finger id=1 continues orbiting unaffected!
  emit('touchstart', {
    target: btnEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 1, clientX: 580, clientY: 280 },
      { identifier: 2, clientX: 900, clientY: 500 },
    ],
    changedTouches: [{ identifier: 2, clientX: 900, clientY: 500 }],
    preventDefault() {},
  });
  emit('touchend', {
    target: btnEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 1, clientX: 580, clientY: 280 },
    ],
    changedTouches: [{ identifier: 2, clientX: 900, clientY: 500 }],
  });
  const yawAfterBtn = Ph.camYaw;
  emit('touchmove', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 1, clientX: 640, clientY: 280 },
    ],
    changedTouches: [{ identifier: 1, clientX: 640, clientY: 280 }],
    preventDefault() {},
  });
  assert.ok(Ph.camYaw < yawAfterBtn - 0.2, 'Canvas orbit must continue seamlessly when button touch starts/ends');

  // 4. Two fingers BOTH on canvas (id=1 and id=3) while joystick (id=0) is STILL held (total 3 touches) -> pinch-zooms cleanly!
  emit('touchstart', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 1, clientX: 640, clientY: 280 },
      { identifier: 3, clientX: 740, clientY: 280 },
    ],
    changedTouches: [{ identifier: 3, clientX: 740, clientY: 280 }],
    preventDefault() {},
  });
  emit('touchmove', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 1, clientX: 590, clientY: 280 },
      { identifier: 3, clientX: 790, clientY: 280 },
    ],
    changedTouches: [
      { identifier: 1, clientX: 590, clientY: 280 },
      { identifier: 3, clientX: 790, clientY: 280 },
    ],
    preventDefault() {},
  });
  assert.ok(Ph.camDist < dist0 - 2.0, `Two canvas fingers spreading apart while holding joystick must pinch zoom in, got ${dist0} -> ${Ph.camDist}`);

  // 5. Lift one canvas finger (id=1) -> remaining canvas finger (id=3) transitions seamlessly back to 1-finger orbit without snapping
  emit('touchend', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 3, clientX: 790, clientY: 280 },
    ],
    changedTouches: [{ identifier: 1, clientX: 590, clientY: 280 }],
  });
  const yawBeforeRemain = Ph.camYaw;
  const distAfterPinch = Ph.camDist;
  emit('touchmove', {
    target: domEl,
    touches: [
      { identifier: 0, clientX: 120, clientY: 420 },
      { identifier: 3, clientX: 850, clientY: 280 },
    ],
    changedTouches: [{ identifier: 3, clientX: 850, clientY: 280 }],
    preventDefault() {},
  });
  assert.equal(Ph.camDist, distAfterPinch, 'Single remaining canvas finger must stop pinching');
  assert.ok(Ph.camYaw < yawBeforeRemain - 0.2, 'Single remaining canvas finger must seamlessly resume 1-finger orbit');
});



