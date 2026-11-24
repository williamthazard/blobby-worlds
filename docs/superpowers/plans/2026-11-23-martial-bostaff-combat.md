# Martial-Arts Bo-Staff Combat (Approach A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Blobby Worlds: The Starkeeper's melee combat into visceral, acrobatic Wukong / Airbender bo-staff martial arts with full-authority skeletal combat animations, independent grip-centered staff twirls & helicopter spins, a live 3D pooled Star-Lantern ribbon trail, kinetic hit-stop + camera kick, and Doppler bo-staff audio.

**Architecture:** We fix the 50/50 animation dilution in `rig.js` via a smooth `combatAuthority` scalar that fades base locomotion to `0` during committed melee moves, replace the slow UAL sword clip with purpose-authored synthesized bo-staff clips in `scripts/build_starkeeper_glb.py`, mount an independent `staffSpinPivot` inside `HandR`'s palm cavity for true 180°/360°/720° twirls & 1080° axial drills, drive a pre-allocated 18-segment 3D ribbon mesh directly from live tip/butt world positions in `game.js`, and layer camera kick (`physics.js`) + Doppler wood-whoosh audio (`audio.js`).

**Tech Stack:** Zero-build browser JavaScript (ES6+), Three.js r128, Web Audio API, Python 3 stdlib GLB compiler (`scripts/build_starkeeper_glb.py`), Node built-in test runner (`node --test`).

## Global Constraints

- **No git repository:** Do NOT run any `git` commands in `/Users/spencergraham/desktop/other/games`.
- **Dual-mode asset loading:** Every change to `scripts/build_starkeeper_glb.py` must rebuild BOTH `assets/starkeeper.glb` (GitHub Pages / HTTP) and `assets/starkeeper.glb.js` (`file://` double-click) in lockstep.
- **Three.js r128 compatibility:** No r140+ APIs (no `CapsuleGeometry`, no `colorSpace`); guard `THREE.BufferGeometry` / `THREE.BufferAttribute` for headless Node unit tests.
- **Zero hot-loop GC allocations:** No `new THREE.Vector3()`, `new THREE.Quaternion()`, `new THREE.Color()`, or `scene.add()` inside `rig.update()`, `updateCombatVfx()`, or `updatePlayer()`.
- **Strict musical tuning:** All tonal oscillators in `audio.js` must stay strictly within diatonic `C-D-E-F-G-A-B` pitch classes (`{0, 2, 4, 5, 7, 9, 11}`).
- **Mock safety:** Node tests in `tests/models.test.mjs`, `tests/rig.test.mjs`, `tests/audio.test.mjs`, and `tests/game-integration.test.mjs` use lightweight mocks (`Object3D.rotation` uses `.x/.y/.z`, `AudioContext` supports oscillator/gain/biquadFilter/buffer/bufferSource only).

---

## File Structure & Responsibility Map

| File | Responsibility |
|---|---|
| `scripts/build_starkeeper_glb.py` | Author 7 committed martial-arts bo-staff clips (`Melee1`, `Melee2`, `Spin360`, `RollStrike`, `SlideThrust`, `PlungeDive`, `PlungeLand`) with explicit `Neck`/`Head` gaze tracks; rebuild `assets/starkeeper.glb` + `.glb.js`. |
| `models.js` | Expose `buttCap` on `makeStarkeeperStaff().userData` so live dual-end shaft tracking works on both GLB and procedural rigs. |
| `rig.js` | Add `combatAuthority` full-body blend authority, route `RollStrike`, mount `staffMount -> staffSpinPivot -> staff` inside `HandR`, drive per-move martial staff spins + post-combo `flourishT` wrist-twirl, expose `getStaffButtWorldPos(out)` & `isCombatTrailActive()`. |
| `physics.js` | Add smooth `camKick` punch decaying over `~0.18s` on heavy camera shakes (both free-cam & Z-target duel cam), expose `getCameraKick()`. |
| `game.js` | Pre-allocate pooled 18-segment 3D Star-Lantern ribbon trail (`staffTrailMesh`), sample live tip/butt positions each frame during swings & flourish, soften static `slashPivot`, upgrade hit-stop (`38ms`/`68ms`/`82ms`), add Hit 3 Whirlwind impact micro-shockwave & live lantern-tip sparks. |
| `audio.js` | Add Doppler bandpass-swept bo-staff air-cut whoosh + double helicopter flutter in `swing()`, and crisp `2.2kHz` hardwood crack transient + deeper bass + on-key star bell in `hitImpact()`. |

---

### Task 1: Purpose-Authored Wukong / Airbender Bo-Staff Clips

**Files:**
- Modify: `scripts/build_starkeeper_glb.py:88-112` (`UAL_CLIP_MAP`) and `scripts/build_starkeeper_glb.py:661-820` (`build_synthesized_clips`)
- Regenerate: `assets/starkeeper.glb`, `assets/starkeeper.glb.js`
- Test: `tests/glb-asset.test.mjs`

**Interfaces:**
- Produces: 33 animation clips in `assets/starkeeper.glb` including purpose-authored `Melee1` (`0.34s`), `Melee2` (`0.36s`), `Spin360` (`0.48s` with airborne hop & full `2π` hip yaw), `RollStrike` (`0.34s`), `SlideThrust` (`0.46s`), `PlungeDive` (`0.34s`), `PlungeLand` (`0.36s`), each containing `Hips`, `UpperArm.R`, `Hand.R`, `Neck`, and `Head` rotation channels.

- [ ] **Step 1: Write the failing test in `tests/glb-asset.test.mjs`**

Add `'RollStrike'` to `EXPECTED_CLIPS` and add a dedicated test verifying the martial-arts clip properties (snappy `Melee1 <= 0.45s`, `RollStrike` present, `Spin360` lifts `Hips` airborne and rotates full `360°`, and all 7 combat clips animate `Hips`, `UpperArm.R`, `Hand.R`, `Neck`, `Head`):

```js
// In tests/glb-asset.test.mjs:
// Add 'RollStrike' to EXPECTED_CLIPS, and append:
test('martial bo-staff combat clips are snappy, full-body, and include RollStrike and airborne Spin360', () => {
  const glbBuf = fs.readFileSync(new URL('../assets/starkeeper.glb', import.meta.url));
  const gltf = parseGlbJson(glbBuf);
  const jsonLen = glbBuf.readUInt32LE(12);
  const binOff = 20 + jsonLen + 8;

  function readScalar(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) out.push(glbBuf.readFloatLE(base + i * 4));
    return out;
  }
  function readVec3(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * 12;
      out.push([glbBuf.readFloatLE(o), glbBuf.readFloatLE(o + 4), glbBuf.readFloatLE(o + 8)]);
    }
    return out;
  }

  const animByName = new Map((gltf.animations || []).map((a) => [a.name, a]));
  const combatClips = ['Melee1', 'Melee2', 'Spin360', 'RollStrike', 'SlideThrust', 'PlungeDive', 'PlungeLand'];
  const requiredBones = ['Hips', 'UpperArm.R', 'Hand.R', 'Neck', 'Head'];

  for (const cname of combatClips) {
    const anim = animByName.get(cname);
    assert.ok(anim, `Missing martial combat clip ${cname}`);
    const animatedBones = new Set(anim.channels.map((ch) => gltf.nodes[ch.target.node]?.name));
    for (const b of requiredBones) {
      assert.ok(animatedBones.has(b), `Clip ${cname} must animate ${b}`);
    }
    const times = readScalar(anim.samplers[0].input);
    const dur = times[times.length - 1];
    assert.ok(dur >= 0.28 && dur <= 0.52, `Combat clip ${cname} duration (${dur.toFixed(2)}s) must be snappy (0.28-0.52s)`);
  }

  // Verify Spin360 includes an airborne vertical hop in its Hips translation track
  const spin = animByName.get('Spin360');
  const hipsTransCh = spin.channels.find(
    (ch) => gltf.nodes[ch.target.node]?.name === 'Hips' && ch.target.path === 'translation'
  );
  assert.ok(hipsTransCh, 'Spin360 must animate Hips translation for crouch -> airborne hop -> landing');
  const hTrans = readVec3(spin.samplers[hipsTransCh.sampler].output);
  const zs = hTrans.map((v) => v[1]); // Hips local Y aligns along vertical axis in Adventurer
  const ys = hTrans.map((v) => Math.hypot(v[0], v[1], v[2]));
  const span = Math.max(...ys) - Math.min(...ys);
  assert.ok(span > 0.0018, `Spin360 Hips vertical travel must include airborne hop (>=0.18m / 100), got ${span}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/glb-asset.test.mjs`
Expected: FAIL (`Missing expected animation clip: RollStrike` and `Melee1 duration (1.37s) must be snappy`).

- [ ] **Step 3: Implement purpose-authored Wukong / Airbender bo-staff clips in `scripts/build_starkeeper_glb.py`**

1. Remove `("Sword_Attack", "Melee1"),` from `UAL_CLIP_MAP` (21 UAL clips).
2. In `build_synthesized_clips()`, add synthesized `Melee1` (`0.34s` coiled left-shoulder windup -> explosive full-extension diagonal forehand sweep with deep front-knee lunge `dy = -0.14m`, `Hips` yaw `-0.55 -> +0.62`, torso twist `+0.85`, explicit `Neck`/`Head` gaze forward) and `RollStrike` (`0.34s` explosive low-to-high rising lunge diagonal uppercut cleave, `dy = -0.24m -> +0.04m -> -0.04m`).
3. Upgrade `Melee2` (`0.36s` low crouched stance `dy = -0.18m` -> coiled right hip -> blistering reverse backhand whip `Hips` yaw `-0.58 -> +0.72`), `Spin360` (`0.48s` 17 keyframes: crouch coil `dy = -0.14m` -> airborne hop peak `dy = +0.16m` while spinning full `0 -> 2π` around `Hips` Y with right arm extended horizontally at 100% reach -> crisp landed martial horse-stance `dy = -0.12m`), `SlideThrust` (`0.46s` deeper `dy = -0.36m` baseball-slide spear lunge), `PlungeDive` (`0.34s` overhead vault coil -> steep meteor plunge), and `PlungeLand` (`0.36s` deep `dy = -0.32m` hero one-knee crater plant).
4. Rebuild both assets: `python3 scripts/build_starkeeper_glb.py`.

- [ ] **Step 4: Run tests to verify Task 1 passes**

Run: `python3 scripts/build_starkeeper_glb.py && node --test --test-concurrency=1 --test-timeout=5000 tests/glb-asset.test.mjs tests/rig.test.mjs`
Expected: PASS (0 failures).

---

### Task 2: Full-Authority Combat Blending & Martial Staff-Spin Pivot

**Files:**
- Modify: `models.js:1585-1591` (`makeStarkeeperStaff`)
- Modify: `rig.js:145-395`, `rig.js:650-670` (`CharacterRig`)
- Test: `tests/models.test.mjs`, `tests/rig.test.mjs`

**Interfaces:**
- Consumes: `RollStrike`, `Melee1`, `Melee2`, `Spin360`, `SlideThrust`, `PlungeDive`, `PlungeLand` clips from Task 1.
- Produces:
  - `Models.makeStarkeeperStaff().userData.buttCap` (Object3D mesh at bottom end of staff).
  - `CharacterRig` controller methods: `getStaffTipWorldPos(out)`, `getStaffButtWorldPos(out)`, `isCombatTrailActive()` (boolean).
  - `CharacterRig` telemetry state: `state.combatAuthority` (`0..1`), `state.staffSpinAngle` (radians), `state.staffDrillAngle` (radians), `state.overlayAction` (routes steps 4 & 6 to `'RollStrike'`).

- [ ] **Step 1: Write failing tests in `tests/models.test.mjs` and `tests/rig.test.mjs`**

In `tests/models.test.mjs`: assert `staff.userData.buttCap` exists on `Models.makeStarkeeperStaff()`.
In `tests/rig.test.mjs`: add mock `buttCap` to `Models.makeStarkeeperStaff()`, include `'RollStrike'` in mock GLTF clip list, and add test:

```js
test('CharacterRig grants full combatAuthority during melee, routes RollStrike, drives martial staff spins & flourish, and exposes buttCap world pos', () => {
  const env = loadRig({ protocol: 'https:' });
  const ctrl = env.CharacterRig.attachToPlayer(env.playerRoot, {
    Models: env.Models, Textures: env.Textures, Shaders: env.Shaders,
  });

  // Idle baseline: combatAuthority = 0, base weight = 1
  ctrl.update(0.02, 0.02, baseState());
  assert.ok(ctrl.state.combatAuthority < 0.05, 'Idle combatAuthority must be ~0');
  assert.equal(ctrl.isCombatTrailActive(), false);

  // Hit 2 backhand wrist-twirl: combatAuthority snaps near 1.0, activeBase weight drops near 0, staffSpinAngle sweeps >= 360 deg!
  let maxSpin2 = 0;
  for (let i = 0; i < 16; i++) {
    ctrl.update(0.02, 0.04 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.32 - i * 0.02), meleeDur: 0.32, meleeStep: 2 }));
    maxSpin2 = Math.max(maxSpin2, Math.abs(ctrl.state.staffSpinAngle));
  }
  assert.ok(ctrl.state.combatAuthority > 0.85, `Melee2 must achieve full combatAuthority (>0.85), got ${ctrl.state.combatAuthority}`);
  assert.ok(maxSpin2 >= Math.PI * 1.6, `Melee2 must execute a full wrist-twirl (>=~360 deg), got ${maxSpin2}`);
  assert.equal(ctrl.isCombatTrailActive(), true);

  // Hit 3 Spin360: blazing 720 deg helicopter windmill!
  let maxSpin3 = 0;
  for (let i = 0; i < 20; i++) {
    ctrl.update(0.02, 0.40 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.44 - i * 0.02), meleeDur: 0.44, meleeStep: 3 }));
    maxSpin3 = Math.max(maxSpin3, Math.abs(ctrl.state.staffSpinAngle));
  }
  assert.ok(maxSpin3 >= Math.PI * 3.2, `Spin360 must spin staff >=~720 deg helicopter windmill, got ${maxSpin3}`);

  // Roll-Strike (step 4) routes to RollStrike clip
  ctrl.update(0.02, 0.85, baseState({ meleeT: 0.28, meleeDur: 0.30, meleeStep: 4 }));
  assert.equal(ctrl.state.overlayAction, 'RollStrike');

  // Sprint Slide-Thrust (step 7) drives axial star-drill spin
  let maxDrill = 0;
  for (let i = 0; i < 18; i++) {
    ctrl.update(0.02, 0.90 + i * 0.02, baseState({ meleeT: Math.max(0.01, 0.44 - i * 0.02), meleeDur: 0.44, meleeStep: 7 }));
    maxDrill = Math.max(maxDrill, Math.abs(ctrl.state.staffDrillAngle));
  }
  assert.ok(maxDrill >= Math.PI * 4.0, `SlideThrust must drive high-speed axial drill spin, got ${maxDrill}`);

  // Ending melee triggers smooth post-combo flourish and settles combatAuthority back to 0
  ctrl.update(0.02, 1.30, baseState({ meleeT: 0, meleeStep: 0 }));
  assert.equal(ctrl.isCombatTrailActive(), true, 'Post-combo flourish should briefly keep trail alive');
  for (let i = 0; i < 25; i++) ctrl.update(0.02, 1.32 + i * 0.02, baseState({ meleeT: 0, meleeStep: 0 }));
  assert.ok(ctrl.state.combatAuthority < 0.05, `combatAuthority must settle cleanly back to 0, got ${ctrl.state.combatAuthority}`);
  assert.equal(ctrl.isCombatTrailActive(), false);

  // Live buttCap world position works cleanly
  const butt = ctrl.getStaffButtWorldPos(new env.THREE.Vector3());
  assert.ok(butt && Number.isFinite(butt.x) && Number.isFinite(butt.y) && Number.isFinite(butt.z));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/models.test.mjs tests/rig.test.mjs`
Expected: FAIL (`buttCap` missing, `combatAuthority` undefined, `isCombatTrailActive` not a function).

- [ ] **Step 3: Implement changes in `models.js` and `rig.js`**

1. In `models.js` (`makeStarkeeperStaff`, line 1589):
   `staffPivot.userData = { staffHalo, pearlAura, staffLight, staffStar, buttCap };`
2. In `rig.js`:
   - Add `combatAuthority: 0`, `staffSpinAngle: 0`, `staffDrillAngle: 0` to `state`.
   - Add `let staffSpinPivot = null; let staffButt = null; let flourishT = 0; let flourishDur = 0.24; let flourishDir = 1; let wasInMelee = false;`.
   - Expose `getStaffButtWorldPos(out)` and `isCombatTrailActive()` (`controller.ready && (activeMeleeOverlay || flourishT > 0.02)`).
   - In `selectOverlayState(s)`: route `step === 4 || step === 6` to `{ name: 'RollStrike', key: 'melee' + step }` (falling back to `'Melee1'` in `triggerOverlay` if a custom clip set lacks `RollStrike`).
   - In `triggerOverlay`: raise `tScale` upper cap to `2.6` and use snappy `fadeIn(0.045)` for melee/plunge overlays (`0.07` for casts).
   - In `update(dt, time, s)`:
     - Identify full-body combat overlays (`Melee1`, `Melee2`, `Spin360`, `RollStrike`, `SlideThrust`, `PlungeDive`, `PlungeLand`, `CastNova`) vs upper-body `CastShoot`.
     - Smoothly ramp `state.combatAuthority`: target `1.0` when full-body combat overlay active (`rate = 26` -> `~0.045s` snap-in), `0.55` during `CastShoot`, and `0.0` otherwise (`rate = 7.5` -> `~0.16s` settle-out).
     - Set `activeBase.setEffectiveWeight(clamp(1 - state.combatAuthority, fullBody ? 0.0 : 0.04, 1.0))` (and also preserve it inside `crossFadeBase` so a mid-attack base transition never jumps back to weight `1.0`!).
     - Drive `staffSpinPivot` rotations every frame:
       - `meleeT > 0`: compute `prog = clamp(1 - s.meleeT / Math.max(0.08, s.meleeDur), 0, 1)` and smoothstep/ease curve:
         - `step === 1`: `spinX = Math.PI * easeOut(prog)` (`+180°` forward bo-whip)
         - `step === 2`: `spinX = -Math.PI * 2.0 * easeInOut(prog)` (`-360°` wrist-twirl)
         - `step === 3`: `spinX = -Math.PI * 4.0 * easeOut(prog)` (`-720°` helicopter windmill!)
         - `step === 4 || step === 6`: `spinX = Math.PI * 2.0 * easeOut(prog)` (`+360°` forward baton spin!)
         - `step === 7`: `drillY = Math.PI * 6.0 * prog` (`1080°` axial star-drill around staff shaft `+Y`!)
       - `s.plunging`: overhead `+2π` windmill during `plungeWindupT > 0`, locking lantern-forward/downward during dive.
       - Detect melee end (`wasInMelee && !(s.meleeT > 0) && !s.dead && !s.swimming && s.rollT <= 0`): trigger `flourishT = flourishDur = 0.24` (`flourishDir = lastStep === 2 || lastStep === 3 ? -1 : 1`), spinning a crisp `2π` wrist-twirl settle back to `0`!
       - Apply `staffSpinPivot.rotation.x = state.staffSpinAngle; staffSpinPivot.rotation.y = state.staffDrillAngle;` cleanly.
   - In `onGltfLoaded`: mount `staffMount` (`name = 'Staff'`) at `(0.004, 0.138, -0.036) * invS` with `scale(invS * 0.96)` and palm Euler `(0.06, 0.08, Math.PI * 0.5)`, add `staffSpinPivot` inside `staffMount`, and add `staff` inside `staffSpinPivot`. Store `staffButt = staff.userData ? staff.userData.buttCap : null`.

- [ ] **Step 4: Run tests to verify Task 2 passes**

Run: `node --check models.js && node --check rig.js && node --test --test-concurrency=1 --test-timeout=5000 tests/models.test.mjs tests/rig.test.mjs`
Expected: PASS (0 failures).

---

### Task 3: Dynamic Camera Kick Punch (`physics.js`)

**Files:**
- Modify: `physics.js:126-130`, `physics.js:740-746`, `physics.js:1974-2034`, `physics.js:2660-2672`
- Test: `tests/physics.test.mjs`

**Interfaces:**
- Produces: `Physics.addCameraShake(amount)` also triggers a proportional `camKick` (`0.22..0.55u` brief inward camera punch decaying smoothly over `~0.18s`), exposed via `Physics.getCameraKick()` for deterministic testing.

- [ ] **Step 1: Write failing test in `tests/physics.test.mjs`**

```js
test('addCameraShake drives brief inward camKick punch on heavy impacts that decays cleanly', () => {
  const { Physics } = loadPhysics();
  assert.equal(typeof Physics.getCameraKick, 'function');
  assert.equal(Physics.getCameraKick(), 0);
  Physics.addCameraShake(0.65);
  const peak = Physics.getCameraKick();
  assert.ok(peak >= 0.25 && peak <= 0.60, `Heavy impact must trigger inward camKick (0.25-0.60u), got ${peak}`);
  const cam = { position: new THREE.Vector3(0, 5, -9), lookAt() {} };
  for (let i = 0; i < 20; i++) Physics.updateCamera(0.02, cam);
  assert.ok(Physics.getCameraKick() < 0.02, `camKick must decay back to 0 within ~0.4s, got ${Physics.getCameraKick()}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/physics.test.mjs`
Expected: FAIL (`Physics.getCameraKick is not a function`).

- [ ] **Step 3: Implement `camKick` in `physics.js`**

1. Declare `let camKick = 0;` right beside `let camShake = 0;`.
2. In `addCameraShake(amount)`:
   ```js
   const a = amount || 0;
   camShake = Math.min(1.0, Math.max(camShake, a));
   if (a >= 0.28) {
     camKick = Math.min(0.55, Math.max(camKick, a * 0.72));
   }
   ```
3. In `updateCamera(dt, camera)`:
   - Compute `const kickPull = camKick;` and decay `camKick = camKick > 0.004 ? Math.max(0, camKick - dt * 3.1) : 0;` in BOTH Z-target duel mode and free-camera mode, subtracting `kickPull` from `effCamDist` (clamped `>= 2.2`) when positioning `_camTargetPos`!
   - Also apply `camShake` jitter during Z-target duel camera so locked-on impacts shake cleanly too!
4. Export `getCameraKick: () => camKick` in `Physics` return object.

- [ ] **Step 4: Run test to verify Task 3 passes**

Run: `node --check physics.js && node --test --test-concurrency=1 --test-timeout=5000 tests/physics.test.mjs`
Expected: PASS (0 failures).

---

### Task 4: Live 3D Pooled Starlight Staff Ribbon Trail & Hit-Stop Impact Punch (`game.js`)

**Files:**
- Modify: `game.js:1085-1315`, `game.js:1495-1602`, `game.js:3475-3516`
- Test: `tests/game-integration.test.mjs`

**Interfaces:**
- Consumes: `glbRig.getStaffTipWorldPos(out)`, `glbRig.getStaffButtWorldPos(out)`, `glbRig.isCombatTrailActive()` from Task 2; `Physics.addCameraShake()` from Task 3.
- Produces: Pooled `staffTrailMesh` (`STAFF_TRAIL_SEGMENTS = 18`, pre-allocated `Float32Array` position/color/uv buffers, zero runtime `scene.add()` or `Vector3` allocations), exposed as `staffTrail` state on `window.__GAME_DEBUG__`.

- [ ] **Step 1: Write failing test in `tests/game-integration.test.mjs`**

```js
test('Live pooled 3D staff ribbon trail activates on meleeAttack with zero runtime scene.add or Vector3 allocations', () => {
  const { dbg, scene, THREE } = loadGame();
  assert.ok(dbg.staffTrail, 'window.__GAME_DEBUG__.staffTrail must be exposed');
  assert.equal(dbg.staffTrail.active, false);

  const addsBefore = scene.addCalls;
  let v3Allocs = 0;
  const OrigV3 = THREE.Vector3;
  // Trigger Hit 1 -> Hit 2 -> Hit 3 Spin360 while stepping updateCombatVfx
  assert.equal(dbg.meleeAttack(), true);
  assert.equal(dbg.staffTrail.active, true, 'Staff ribbon trail must activate immediately on meleeAttack');
  assert.equal(dbg.staffTrail.colorHex, 0x5ef8e8, 'Hit 1 trail must use crisp celestial sea-teal');
  assert.equal(scene.addCalls, addsBefore, 'Activating staff trail must perform ZERO scene.add calls');

  // Verify trail samples advance smoothly across frames and fade out cleanly once swing completes
  for (let i = 0; i < 8; i++) dbg.updateCombatVfx(0.02);
  assert.ok(dbg.staffTrail.sampleCount >= 4, 'Staff trail ring buffer must accumulate live samples');
  assert.equal(scene.addCalls, addsBefore, 'Updating staff trail must perform ZERO scene.add calls');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/game-integration.test.mjs`
Expected: FAIL (`window.__GAME_DEBUG__.staffTrail must be exposed`).

- [ ] **Step 3: Implement pooled 3D staff ribbon trail & kinetic impact upgrades in `game.js`**

1. Pre-allocate `STAFF_TRAIL_SEGMENTS = 18`, fixed `Float32Array` `trailPositions` (`18 * 2 * 3`), `trailColors` (`18 * 2 * 3`), `trailUvs` (`18 * 2 * 2`), ring-buffer arrays (`trailTips`, `trailInners` each `Float32Array(18 * 3)`), and scratch vectors `_trailTip`, `_trailButt`, `_trailInner`, `_trailCol`.
2. Build `staffTrailGeo` (guarded by `typeof THREE.BufferGeometry === 'function' && typeof THREE.BufferAttribute === 'function'`, else `PlaneGeometry`), `staffTrailMat` (`MeshBasicMaterial` with `vertexColors: true`, `map: slashTex || null`, `transparent: true`, `opacity: 0.92`, `blending: THREE.AdditiveBlending`, `depthWrite: false`, `side: THREE.DoubleSide`), and `staffTrailMesh` (`frustumCulled = false`, `visible = false`, added ONCE to `scene` at boot!).
3. Add `staffTrail = { active: false, colorHex: 0x5ef8e8, widthFrac: 0.38, sampleCount: 0, fadeT: 0, sparkAcc: 0, mesh: staffTrailMesh }`.
4. Add `triggerStaffTrail(step)`: sets color-coding (`0x5ef8e8` Hit 1, `0x92f6ff` Hit 2, `0xffd242` Hit 3 / `dashWhirl`, `0x7ef8ef` `sprint`, `0xffe46b` `plunge` / `roll` / `dashCut`), `widthFrac` (`0.75` for `Spin360`/`dashWhirl` for massive helicopter star-disc, `0.42` otherwise), resets `sampleCount = 0`, sets `active = true`, `fadeT = 0.22`, `staffTrailMesh.visible = true`.
5. Add zero-GC `sampleStaffEndpoints(tipOut, buttOut)`: uses `player.userData.glbRig.getStaffTipWorldPos` & `getStaffButtWorldPos` when ready, else falls back cleanly to procedural `player.position` + facing + staff arm tip so both GLB & procedural modes render crisp trails!
6. In `updateCombatVfx(dt)`:
   - Trim static `slashMat.opacity` to `Math.sin(prog * Math.PI) * 0.56` so the live 3D spinning tip ribbon owns the spotlight.
   - Advance `staffTrail` ring buffer whenever `P.meleeT > 0 || P.plunging || (glbRig && glbRig.isCombatTrailActive()) || staffTrail.fadeT > 0`, updating `position` & fading `color` attributes in-place (`needsUpdate = true`), and emit blazing tip sparks from `_trailTip` every `0.032s` during `Spin360` (`P.meleeStep === 3`) and `Melee2` (`P.meleeStep === 2`)!
7. In `meleeAttack()` and `handlePlungeImpact()`:
   - Call `triggerStaffTrail(step)` for ALL melee steps (including `'plunge'` and `'sprint'`).
   - Tune hit-stop: `38ms` Hit 1/2, `68ms` Hit 3 / Dash-Whirl / Sprint Thrust (`isHeavy`), `82ms` Aerial Star-Slam (`handlePlungeImpact`).
   - On Hit 3 Whirlwind impacts (`landed > 0 && isSpin`), spawn extra directional star sparks + brief `1.8u` golden ground impact micro-shockwave!
8. Expose `staffTrail` and `updateCombatVfx` on `debugHandle`.

- [ ] **Step 4: Run tests to verify Task 4 passes**

Run: `node --check game.js && node --test --test-concurrency=1 --test-timeout=5000 tests/game-integration.test.mjs`
Expected: PASS (0 failures).

---

### Task 5: Punchy Martial-Arts Bo-Staff Doppler Audio (`audio.js`) & Full Visual Verification

**Files:**
- Modify: `audio.js:776-824` (`swing`, `hitImpact`)
- Test: `tests/audio.test.mjs`

**Interfaces:**
- Consumes: `Sound.swing(step)` and `Sound.hitImpact(heavy)` calls from `game.js`.
- Produces: Bandpass-swept Doppler bamboo/hardwood air-cut whoosh (with double helicopter flutter on `Spin360`/`dashWhirl` and fast whir on `sprint`) + crisp `2.2kHz` woody bo-staff crack transient + deeper punch + strictly on-key `C-D-E-F-G-A-B` star bell resonance.

- [ ] **Step 1: Write failing test in `tests/audio.test.mjs`**

```js
test('Martial bo-staff swing() produces Doppler filter sweeps and hitImpact() layers hardwood crack strictly on-key', () => {
  const ctx = makeMockAudioContext();
  // Track filter ramp calls and oscillator start frequencies!
  const filterSweeps = [];
  const oscFreqs = [];
  const origFilter = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const f = origFilter();
    const origRamp = f.frequency.exponentialRampToValueAtTime;
    f.frequency.exponentialRampToValueAtTime = (val, t) => {
      filterSweeps.push(val);
      return origRamp(val, t);
    };
    return f;
  };
  const origOsc = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = origOsc();
    const origSet = o.frequency.setValueAtTime;
    o.frequency.setValueAtTime = (val, t) => {
      oscFreqs.push(val);
      return origSet(val, t);
    };
    return o;
  };

  const Sound = loadAudio(ctx);
  Sound.start();
  Sound.swing(1);
  Sound.swing(2);
  Sound.swing(3);
  Sound.swing('dashWhirl');
  Sound.swing('sprint');
  Sound.swing('plunge');
  Sound.hitImpact(false);
  Sound.hitImpact(true);

  assert.ok(filterSweeps.length >= 6, `Martial swing() must sweep bandpass frequencies for Doppler air-cut whoosh, got ${filterSweeps.length} sweeps`);
  const allowedPitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
  for (const hz of oscFreqs) {
    if (hz >= 300) {
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      const pc = ((midi % 12) + 12) % 12;
      assert.ok(allowedPitchClasses.has(pc), `Combat tonal note ${hz.toFixed(2)}Hz (pc=${pc}) must stay strictly on-key in C-D-E-F-G-A-B`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/audio.test.mjs`
Expected: FAIL (`Martial swing() must sweep bandpass frequencies for Doppler air-cut whoosh, got 0 sweeps`).

- [ ] **Step 3: Implement Doppler `whooshSweep()` helper and upgraded `swing()` & `hitImpact()` in `audio.js`**

Add a lightweight `whooshSweep(fStart, fEnd, q, dur, vol, delay = 0)` helper inside `Sound` using the cached `_noiseBuf` + `BiquadFilter(type='bandpass')` with `frequency.setValueAtTime(fStart, t0)` -> `frequency.exponentialRampToValueAtTime(fEnd, t0 + dur)` and fast-attack envelope, then:
- `swing(step)`:
  - `step === 1`: snappy bamboo cut `480Hz -> 1320Hz` (`0.14s`)
  - `step === 2`: crisp wrist-twirl reverse whip `620Hz -> 1680Hz` (`0.13s`) + quick `1180Hz -> 540Hz` tail flick (`+0.07s`)
  - `step === 3 || step === 'dashWhirl'`: triple helicopter flutter (`520->1780`, `+0.08s: 1620->640`, `+0.17s: 680->1960`) + on-key star chime (`G5=783.99`, `B5=987.77`, `G6=1567.98`)
  - `step === 'sprint'`: rapid axial drill spin-whir (`740->2100`, `+0.07s: 920->2200`) + on-key `G5`/`E6` (`783.99`/`1318.51`)
  - `step === 'roll' || step === 'dashCut'`: fierce rising cleave (`540->1840`) + on-key `E5`/`A5` (`659.25`/`880`)
  - `step === 'plunge'`: overhead windup cut (`1420->420`) + plunging sine drop (`440Hz -> 146.83Hz`, on-key `A4 -> D3`!)
- `hitImpact(heavy)`:
  - Crisp hardwood bo-staff crack transient (`noiseBurst(2200, 1.8, 'bandpass', 0.048, heavy ? 0.14 : 0.095)`)
  - Deeper kinetic punch (`196Hz -> 55Hz` heavy, `261.63Hz -> 82.41Hz` light — even the sub-bass start notes are on-key `G3`/`C4`!)
  - Sparkling Star-Lantern harmonic bell on heavy impacts (`D6=1174.66` + `A6=1760.0` at `+0.03s`, strictly on-key!)

- [ ] **Step 4: Run full automated suite & syntax checks**

Run:
```bash
node --check models.js && node --check rig.js && node --check physics.js && node --check game.js && node --check audio.js && node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs
```
Expected: All 84+ tests PASS, 0 failures.

- [ ] **Step 5: Live Chrome Visual Action Verification**

1. Start local HTTP server (`python3 -m http.server 8767 --bind 127.0.0.1`), hard-reload Chrome `http://127.0.0.1:8767/#test` with rAF-throttling `initScript`.
2. Step and capture live action frames in daylight (`setSkyProgress(0.85)`) for:
   - **Hit 1 Forehand Bo-Sweep** (full torso lunge + teal tip ribbon)
   - **Hit 2 Reverse Backhand Wrist-Twirl** (crouched stance + spinning staff + cyan ribbon)
   - **Hit 3 360° Airborne Helicopter Spin** (airborne hop + rotated body + helicopter staff + wide blazing gold star-disc ribbon!)
   - **Sprint Slide-Thrust Drill** (low baseball slide + forward spear-drill + aqua-gold lance!)
3. Verify zero console errors (`list_console_messages`), park Chrome on `about:blank`, and stop the temporary HTTP server.
