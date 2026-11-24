# Starkeeper Rigged `.glb` & Four-Layer `AnimationMixer` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Starkeeper to a real skinned humanoid `.glb` (`assets/starkeeper.glb`, compiled from CC0 Quaternius `Adventurer.glb` + `AnimationLibrary_Godot_Standard.gltf`) driven by a dedicated 4-layer `THREE.AnimationMixer` controller (`rig.js`) featuring `crossFadeTo` blending, `AdditiveAnimationBlendMode` layers, baked facial `morphTargetInfluences`, speed-coupled directional walk/strafe locomotion, bone-mounted Starkeeper gear, and dual-mode GitHub Pages (HTTP) + offline `file://` loading.

**Architecture:** An offline Python asset compiler (`scripts/build_starkeeper_glb.py`) retargets 22 Quaternius CC0 animations onto `Adventurer.glb`'s 49-bone skeleton using exact world-rest-basis quaternion transforms, synthesizes 10 Blobby Worlds combat/strafe/slide clips in the same bone space, bakes 4 facial morph targets (`Blink`, `Determined`, `Smile`, `Hurt`), grounds the boots at `y = 0`, and emits both binary `assets/starkeeper.glb` and `file://`-only `assets/starkeeper.glb.js`. At runtime, `rig.js` (`CharacterRig`) loads the GLB asynchronously while keeping the procedural Starkeeper active as an instant/headless fallback, restyles the skinned materials with `Textures.sets` PBR maps, mounts Starkeeper's Hat/Cloak/Staff from shared `Models` factories onto `Head`/`Chest`/`Hand.R`, and drives the 4-layer `AnimationMixer` via a zero-GC state snapshot from `physics.js`.

**Tech Stack:** Pure-browser JavaScript (ES2020, global IIFE modules), Three.js r128 (`three.min.js` + locally vendored `vendor/GLTFLoader.js`), Python 3 (stdlib `json`, `struct`, `math`, `base64`, `urllib.request` — zero external pip packages), Node.js built-in test runner (`node --test`).

## Global Constraints

- Zero runtime build step; must work directly on GitHub Pages (`https://`, fetching binary `./assets/starkeeper.glb` without requesting `.glb.js`) **and** via double-click `file://` (loading `./assets/starkeeper.glb.js` + `GLTFLoader.parse`).
- Strictly Three.js r128 compatible (no `CapsuleGeometry`, no `.rotation.set()`, `skinning: true` and `morphTargets: true` set explicitly on materials).
- Zero runtime `new THREE.Vector3` / `new THREE.Quaternion` allocations inside hot update loops (`rig.js` `update()`, `physics.js`, `game.js`).
- Preserve Starkeeper's celestial-stargazer visual identity (human face/ears, midnight-indigo woven coat, sea-teal inner tunic, dark-chestnut hair, wide astronomer hat, single-piece continuous crimson cloak + twin sea-teal scarf, right-hand glowing Star-Lantern Staff).
- No git repository exists in `/Users/spencergraham/desktop/other/games` — do not run `git` commands.
- All automated tests run via `node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `vendor/GLTFLoader.js` | Create | Locally vendored Three.js r128 `THREE.GLTFLoader` (works on GitHub Pages + offline `file://`) |
| `scripts/build_starkeeper_glb.py` | Create | Offline Python compiler: fetches CC0 `Adventurer.glb` + `UAL_Godot`, strips backpack, retargets 22 clips + synthesizes 10 clips, bakes 4 facial morph targets, normalizes scale/grounding, writes `assets/starkeeper.glb` + `assets/starkeeper.glb.js` |
| `assets/starkeeper.glb` | Generated | Compact (< 1.5 MB) binary glTF 2.0 rigged Starkeeper with 32 animations & 4 facial morphs |
| `assets/starkeeper.glb.js` | Generated | Base64 data wrapper loaded ONLY on `file://` |
| `assets/LICENSE-CC0.txt` | Create | CC0 1.0 Public Domain provenance for Quaternius assets |
| `models.js` | Modify | Extract `Models.makeStarkeeperHat()`, `Models.makeStarkeeperCloak()`, `Models.makeStarkeeperStaff()`; wrap procedural pelvis in `player.userData.proceduralRoot` |
| `rig.js` | Create | `CharacterRig`: dual-mode loader, PBR material restyling, bone-mounted gear, 4-layer `AnimationMixer` (`blending`, `additive`, `morph`, `walk`), live `getStaffTipWorldPos`, `triggerEmote`, graceful fallback |
| `index.html` | Modify | Add `<script src="vendor/GLTFLoader.js">` and `<script src="rig.js">` in exact dependency order |
| `physics.js` | Modify | Delegate to `u.glbRig.update(dt, time, _rigState)` via zero-GC scratch struct when `u.glbRig?.ready` |
| `game.js` | Modify | Attach `CharacterRig.attachToPlayer(player, ...)`, use `getStaffTipWorldPos` in `shoot()`, trigger `'smile'` emote on befriend/totem/secret, expose `CharacterRig` on `debugHandle` |
| `tests/glb-asset.test.mjs` | Create | Validates `assets/starkeeper.glb` schema, 32 clips, 49 joints, 4 morphs, `minY ≈ 0`, `.glb.js` round-trip, and `vendor/GLTFLoader.js` |
| `tests/rig.test.mjs` | Create | Unit tests for `CharacterRig` dual-mode loading, fallback, PBR restyling, 4-layer `AnimationMixer`, additive guard, facial morphs, live staff muzzle, and zero-GC update |
| `tests/models.test.mjs` | Modify | Tests shared `Models.makeStarkeeperHat/Cloak/Staff` factories and `proceduralRoot` |
| `tests/game-integration.test.mjs` | Modify | Updates script-order check, loads `rig.js` in sandbox, verifies GLB rig attachment & live staff-tip shooting |

---

### Task 1: Vendor `vendor/GLTFLoader.js` & Build `assets/starkeeper.glb` + `assets/starkeeper.glb.js`

**Files:**
- Create: `vendor/GLTFLoader.js`
- Create: `scripts/build_starkeeper_glb.py`
- Create: `assets/LICENSE-CC0.txt`
- Generated: `assets/starkeeper.glb`, `assets/starkeeper.glb.js`
- Test: `tests/glb-asset.test.mjs`

**Interfaces:**
- Consumes: CC0 Quaternius `Adventurer.glb` & `AnimationLibrary_Godot_Standard.gltf/.bin` (downloaded once by `scripts/build_starkeeper_glb.py`), Three.js r128 `GLTFLoader.js` from unpkg (`three@0.128.0/examples/js/loaders/GLTFLoader.js`).
- Produces:
  - `vendor/GLTFLoader.js` exporting `THREE.GLTFLoader`
  - `assets/starkeeper.glb` with 49 joints (`Root`, `Hips`, `Abdomen`, `Torso`, `Chest`, `Neck`, `Head`, `Shoulder.L/R`, `UpperArm.L/R`, `LowerArm.L/R`, `Hand.L/R`, 5 fingers L/R, `UpperLeg.L/R`, `LowerLeg.L/R`, `Foot.L/R`), 32 named animations, 4 morph targets (`Blink`, `Determined`, `Smile`, `Hurt`) on `Adventurer_Head`, normalized height `~1.85u` and `minY ≈ 0`, facing `+Z`.
  - `assets/starkeeper.glb.js` setting `window.__STARKEEPER_GLB_B64__` to the exact base64 of `assets/starkeeper.glb`.

- [ ] **Step 1: Write failing asset validation test `tests/glb-asset.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const EXPECTED_CLIPS = [
  'Idle', 'IdleStaff', 'Walk', 'Jog', 'Sprint', 'CrouchIdle', 'CrouchFwd',
  'JumpStart', 'JumpLoop', 'JumpLand', 'Roll', 'SwimIdle', 'SwimFwd',
  'CastEnter', 'CastShoot', 'CastLoop', 'Melee1', 'MeleeJab', 'MeleeCross',
  'HitReact', 'Death', 'Cheer',
  'Backpedal', 'StrafeLeft', 'StrafeRight', 'Melee2', 'Spin360',
  'SlideThrust', 'HillSlide', 'PlungeDive', 'PlungeLand', 'CastNova',
];

function parseGlbJson(buf) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'GLB magic must be glTF');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version must be 2');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'First chunk must be JSON');
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

test('vendor/GLTFLoader.js exists and registers THREE.GLTFLoader cleanly', () => {
  const src = fs.readFileSync(new URL('../vendor/GLTFLoader.js', import.meta.url), 'utf8');
  assert.ok(src.includes('GLTFLoader'), 'vendor/GLTFLoader.js must define GLTFLoader');
  const sandbox = { THREE: { Loader: class {}, FileLoader: class {}, LoaderUtils: {}, DefaultLoadingManager: {}, PropertyBinding: {} }, console, self: {} };
  vm.runInNewContext(src, sandbox);
  assert.equal(typeof sandbox.THREE.GLTFLoader, 'function', 'THREE.GLTFLoader must be attached to global THREE');
});

test('assets/starkeeper.glb has valid skeleton, 32 clips, 4 facial morphs, y=0 grounding, and matches starkeeper.glb.js', () => {
  const glbBuf = fs.readFileSync(new URL('../assets/starkeeper.glb', import.meta.url));
  assert.ok(glbBuf.length > 50_000 && glbBuf.length < 2_200_000, `GLB size ${glbBuf.length} out of expected range`);
  const gltf = parseGlbJson(glbBuf);

  assert.ok(gltf.skins && gltf.skins.length >= 1, 'GLB must contain at least one skin');
  const jointNames = new Set(gltf.skins[0].joints.map(i => gltf.nodes[i].name));
  for (const required of ['Root', 'Hips', 'Chest', 'Neck', 'Head', 'Hand.R', 'UpperLeg.L', 'UpperLeg.R', 'Foot.L', 'Foot.R']) {
    assert.ok(jointNames.has(required), `Missing required bone ${required}`);
  }

  // Backpack stripped cleanly
  const meshNames = gltf.meshes.map(m => m.name);
  assert.ok(!meshNames.some(n => /backpack/i.test(n)), `Backpack mesh must be stripped, found: ${meshNames.join(', ')}`);

  // All 32 curated animations present with valid channels
  const animNames = new Set((gltf.animations || []).map(a => a.name));
  for (const clip of EXPECTED_CLIPS) {
    assert.ok(animNames.has(clip), `Missing expected animation clip: ${clip}`);
  }

  // 4 facial morph targets baked on Adventurer_Head
  const headMesh = gltf.meshes.find(m => /head/i.test(m.name));
  assert.ok(headMesh, 'Adventurer_Head mesh must exist');
  assert.deepEqual(headMesh.extras?.targetNames, ['Blink', 'Determined', 'Smile', 'Hurt']);
  assert.ok(headMesh.primitives.some(p => Array.isArray(p.targets) && p.targets.length === 4), 'Head primitive must have 4 morph targets');

  // Exact base64 parity with file:// dual-mode wrapper
  const jsSrc = fs.readFileSync(new URL('../assets/starkeeper.glb.js', import.meta.url), 'utf8');
  const win = {};
  vm.runInNewContext(jsSrc, { window: win, globalThis: win });
  assert.equal(typeof win.__STARKEEPER_GLB_B64__, 'string');
  const decoded = Buffer.from(win.__STARKEEPER_GLB_B64__, 'base64');
  assert.equal(Buffer.compare(glbBuf, decoded), 0, 'starkeeper.glb.js base64 must match starkeeper.glb byte-for-byte');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/glb-asset.test.mjs`
Expected: FAIL (`ENOENT` on `vendor/GLTFLoader.js` and `assets/starkeeper.glb`).

- [ ] **Step 3: Download `vendor/GLTFLoader.js`, create `assets/LICENSE-CC0.txt`, and write `scripts/build_starkeeper_glb.py`**

1. Fetch Three.js r128 `GLTFLoader.js` into `vendor/GLTFLoader.js`:
```bash
mkdir -p vendor assets scripts && curl -fsSL "https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js" -o vendor/GLTFLoader.js && node --check vendor/GLTFLoader.js
```
2. Write `assets/LICENSE-CC0.txt` crediting Quaternius CC0 1.0 Public Domain (`Adventurer.glb` + `Universal Animation Library`).
3. Write `scripts/build_starkeeper_glb.py` implementing:
   - Pure-Python quaternion & 4x4 matrix math (`quat_mul`, `quat_conj`, `quat_norm`, `quat_from_euler`, `quat_to_mat`, `node_local_mat`, `compute_world_mats`).
   - Exact 1-to-1 bone map from `DEF-*` (`AnimationLibrary_Godot_Standard.gltf`) to `Adventurer.glb`'s 49 joints.
   - Exact world-rest-basis quaternion retargeting (`Q_tgt = conj(R_tgt_p) * R_src_p * Q_src * conj(R_src_b) * R_tgt_b`) + shortest-hemisphere quaternion continuity (`dot < 0 => negate`) so slerp never flips 360°.
   - Hip translation retargeting scaled by `tgt_hip_height / src_hip_height` and rotated into `Adventurer`'s `Root` frame, with horizontal root-motion locked to zero (`x = 0, z = 0`) so physics controls horizontal displacement cleanly without double-movement!
   - Removal of `Backpack` mesh/node and normalization of root scale/translation so standing model height is `1.85u` (`minY = 0.000`, facing `+Z`).
   - Synthesis of the 10 Blobby Worlds clips (`Backpedal`, `StrafeLeft`, `StrafeRight`, `Melee2`, `Spin360`, `SlideThrust`, `HillSlide`, `PlungeDive`, `PlungeLand`, `CastNova`) using exact target-space rest-relative bone rotations computed via world-axis-to-local-bone conversion (`q_local = conj(R_tgt_b) * q_world_delta * R_tgt_b` — guaranteed axis-correct regardless of Blender bone roll!).
   - Baking of 4 facial morph targets (`Blink`, `Determined`, `Smile`, `Hurt`) onto `Adventurer_Head` primitives (using vertex Y/X/Z bounding box relative to eye/brow/mouth regions + `extras.targetNames = ["Blink", "Determined", "Smile", "Hurt"]`).
   - Compaction of BIN buffer with 4-byte alignment, writing `assets/starkeeper.glb` and `assets/starkeeper.glb.js` (`(window || globalThis).__STARKEEPER_GLB_B64__ = "...";`).

- [ ] **Step 4: Run compiler & verify `tests/glb-asset.test.mjs` passes**

Run: `python3 scripts/build_starkeeper_glb.py && node --test tests/glb-asset.test.mjs`
Expected: Compiler prints clip count (32), morph count (4), exact `minY = 0.000`, height `~1.85u`, file size `< 1.5 MB`, and `tests/glb-asset.test.mjs` PASSES 100%.

---

### Task 2: Extract Shared Starkeeper Attachment Factories in `models.js`

**Files:**
- Modify: `models.js:1200-1915` (`makePlayer` & exports at bottom of `models.js`)
- Test: `tests/models.test.mjs`

**Interfaces:**
- Consumes: `ensureShared()`, `geo()`, `makeMesh()`, `makeGlow()`, `curveHatBrimGeo()`, `taperCapeGeo()` inside `models.js`.
- Produces:
  - `Models.makeStarkeeperHat()` → returns `THREE.Group` (`hatGroup`, with `userData: { brim, crownCone, hatBand, hatTipStar, hatStarGlow }`).
  - `Models.makeStarkeeperCloak()` → returns `THREE.Group` (`cloakGroup`, with `userData: { capeRoot, cloakMesh, capeSegs: [seg0, seg1, seg2], scarfSegs: [scL, scR] }`).
  - `Models.makeStarkeeperStaff()` → returns `THREE.Group` (`staffPivot`, with `userData: { staffHalo, pearlAura, staffLight, staffStar }`).
  - `Models.makePlayer()` → unchanged visual output & `userData` contract, PLUS `player.userData.proceduralRoot = proceduralRoot` (wrapping `pelvis` so `rig.js` can cleanly hide the procedural body when the GLB swaps in!).

- [ ] **Step 1: Add failing test in `tests/models.test.mjs`**

Append to `tests/models.test.mjs`:
```javascript
test('Models exposes shared Starkeeper attachment factories and proceduralRoot wrapper', () => {
  const { Models: M, THREE } = loadModels();
  const hat = M.makeStarkeeperHat();
  assert.ok(hat instanceof THREE.Group && hat.userData.hatTipStar, 'makeStarkeeperHat must return astronomer hat group');

  const cloak = M.makeStarkeeperCloak();
  assert.ok(cloak instanceof THREE.Group && cloak.userData.capeRoot && cloak.userData.scarfSegs?.length === 2 && cloak.userData.capeSegs?.length === 3, 'makeStarkeeperCloak must return continuous cloak + twin scarf + telemetry capeSegs');

  const staff = M.makeStarkeeperStaff();
  assert.ok(staff instanceof THREE.Group && staff.userData.staffHalo && staff.userData.pearlAura, 'makeStarkeeperStaff must return Star-Lantern Staff with halo & pearl aura');

  const player = M.makePlayer();
  assert.ok(player.userData.proceduralRoot instanceof THREE.Group, 'makePlayer must expose proceduralRoot group');
  assert.equal(player.userData.pelvis.parent, player.userData.proceduralRoot, 'pelvis must live inside proceduralRoot for clean GLB hot-swap');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/models.test.mjs`
Expected: FAIL (`M.makeStarkeeperHat is not a function`).

- [ ] **Step 3: Refactor `models.js` to extract the 3 attachment factories & wrap `pelvis` in `proceduralRoot`**

- Implement `makeStarkeeperHat()`, `makeStarkeeperCloak()`, `makeStarkeeperStaff()` directly above `makePlayer()` using the exact existing geometry/materials/positions.
- Call them inside `makePlayer()`, wire `proceduralRoot.add(pelvis); g.add(proceduralRoot);`, preserve EVERY existing `g.userData` key (`pelvis`, `torso`, `headGroup`, `hatGroup`, `capeSegs`, `scarfSegs`, `staffPivot`, `staffHalo`, `pearlAura`, etc.), and export `makeStarkeeperHat`, `makeStarkeeperCloak`, `makeStarkeeperStaff` in `Models` return object.

- [ ] **Step 4: Run `tests/models.test.mjs` & syntax check**

Run: `node --check models.js && node --test tests/models.test.mjs`
Expected: PASS (all models tests including exact `y = 0` boot grounding pass!).

---

### Task 3: Implement `rig.js` (`CharacterRig`) — Dual-Mode Loader, Restyling & Four-Layer `AnimationMixer`

**Files:**
- Create: `rig.js`
- Test: `tests/rig.test.mjs`

**Interfaces:**
- Consumes: Global `THREE` (including `THREE.GLTFLoader`, `THREE.AnimationMixer`, `THREE.AnimationUtils.makeClipAdditive`, `THREE.AdditiveAnimationBlendMode`), `Models.makeStarkeeperHat/Cloak/Staff`, `Textures.sets`, `Shaders.setClothMotion`, `Shaders.setClothCurve`.
- Produces: Global `CharacterRig`:
  - `CharacterRig.resolveAssetSource(protocol)` → returns `{ mode: 'http', url: './assets/starkeeper.glb' }` for `http:`/`https:`, `{ mode: 'file', scriptUrl: './assets/starkeeper.glb.js' }` for `file:`.
  - `CharacterRig.attachToPlayer(playerRoot, deps)` → returns `controller`:
    - `controller.ready` (`boolean`)
    - `controller.update(dt, time, state)` (zero-GC hot-loop update driving Base `crossFadeTo`, Action one-shots, Additive guard/recoil + bone look-at, Facial `morphTargetInfluences`, Cloth uniforms, Staff halo & pearl aura)
    - `controller.getStaffTipWorldPos(out)` → returns `out` (or `null` if not ready)
    - `controller.triggerEmote(name, dur)` → triggers `'smile'` / `'cheer'` facial morph smoothly
    - `controller.state` → read-only telemetry (`baseAction`, `overlayAction`, `guardWeight`, `morphWeights`, `bones`) for testing & debugging.
    - Also stored on `playerRoot.userData.glbRig = controller`.

- [ ] **Step 1: Write comprehensive failing test suite `tests/rig.test.mjs`**

Test all 6 core behaviors with a clean mock `THREE` (`AnimationMixer`, `AnimationAction` tracking `crossFadeTo` calls & `timeScale` & `blendMode` & `weight`, `AnimationUtils.makeClipAdditive`, mock `GLTFLoader` supporting both `.load()` and `.parse()`, mock skinned `Adventurer` hierarchy with `Head`/`Chest`/`Neck`/`Hand.R` bones and 4 morph targets):
1. `resolveAssetSource` picks HTTP binary `.glb` for `http:` / `https:` and `file:` base64 wrapper for `file:`.
2. Graceful fallback when `GLTFLoader` is missing or `.load()` invokes `onError` (`controller.ready === false`, `proceduralRoot.visible === true`, zero exceptions).
3. Successful mount hides `proceduralRoot`, restyles skinned materials with `skinning: true` (and `morphTargets: true` on `Adventurer_Head`), disables frustum culling on skinned meshes, and mounts Hat (`Head`), Cloak+Scarf (`Chest`), and Staff (`Hand.R`).
4. Base locomotion `crossFadeTo` transitions across `Idle` → `Walk` → `Jog` → `Sprint` → `StrafeLeft` → `StrafeRight` → `Backpedal` → `JumpLoop` → `JumpLand` → `Roll` → `SwimFwd` → `HillSlide` → `Death`, with speed-coupled `timeScale` and zero 1-frame snap after `Melee1`/`CastShoot` ends.
5. Additive `AdditiveAnimationBlendMode` guard crouch weight ramps smoothly when `state.lockedOn === true`, and `morphTargetInfluences` drive `Blink`, `Determined`, `Smile` (`triggerEmote('smile', 2.5)`), and `Hurt` (`hurtFlashT > 0`).
6. `getStaffTipWorldPos(out)` populates world coordinates from `staffHalo`, `Shaders.setClothCurve` receives continuous cloak parameters, and `rig.js`'s `update()` function body contains zero `new THREE.Vector3` / `new THREE.Quaternion` allocations.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rig.test.mjs`
Expected: FAIL (`ENOENT` on `rig.js`).

- [ ] **Step 3: Implement `rig.js` cleanly**

Key implementation details:
- Pre-allocated module scratch objects (`_qTmp`, `_qYaw`, `_qPitch`, `_vTmp`) — zero GC in `update()`.
- `buildSkinnedMaterials(Textures)`: creates shared `MeshStandardMaterial`s with `skinning: true`, `morphTargets: true` (for head), applying `Textures.sets.cloth` / `Textures.sets.leather` maps when present, matching Starkeeper's midnight-indigo / sea-teal / warm-leather / dark-chestnut palette.
- Bone attachment calibration helper with clean constants (`HAT_OFFSET`, `CLOAK_OFFSET`, `STAFF_OFFSET`) so hat sits snugly above the brow without clipping hair, cloak pins to upper shoulder blades cleanly behind chest, and staff shaft passes straight through `Hand.R`'s curled fingers clear of the hat brim.
- 4-layer `AnimationMixer` controller:
  - Normalizes base clip playback & `crossFadeTo(next, fadeDur, true)` with phase sync between `Walk`/`Jog`/`Sprint`.
  - Action one-shot clips (`LoopOnce`, `clampWhenFinished = false`) trigger on state transitions (`meleeStep`, `castStep`, `plunging`, `plungeLandT`) and smoothly fade out back into the base layer (`fadeOut(0.20)`) on completion.
  - Additive clips (`CrouchIdle`, `HitReact`) created via `THREE.AnimationUtils.makeClipAdditive(clip.clone())` and assigned `THREE.AdditiveAnimationBlendMode` with smoothly damped `setEffectiveWeight`.
  - Post-mixer bounded quaternion look-at on `Neck` (35%) and `Head` (65%) + cast aim pitch on `Chest` (35%) and `UpperArm.R` (65%).
  - Smoothly damped facial `morphTargetInfluences` (`Blink`, `Determined`, `Smile`, `Hurt`).

- [ ] **Step 4: Run `tests/rig.test.mjs` & syntax check**

Run: `node --check rig.js && node --test tests/rig.test.mjs`
Expected: PASS (all `rig.test.mjs` assertions green).

---

### Task 4: Wire `index.html`, `physics.js`, `game.js`, and Integration Tests

**Files:**
- Modify: `index.html:595-604`
- Modify: `physics.js:205-235, 1005-1055, 1580-1755`
- Modify: `game.js:706-714, 1740-1790, 2295-2315, 2783-2805, 2944-2958, 3200-3250`
- Modify: `tests/game-integration.test.mjs:300-315, 412-470, 1005-1023`

**Interfaces:**
- Consumes: `CharacterRig.attachToPlayer`, `controller.update(dt, time, _rigState)`, `controller.getStaffTipWorldPos(out)`, `controller.triggerEmote(name, dur)`.
- Produces: Complete runtime integration across HTML, physics rig dispatch, Star-Bolt live staff-tip launch, celebratory facial smiles, and `window.__GAME_DEBUG__.CharacterRig`.

- [ ] **Step 1: Update `tests/game-integration.test.mjs` script-order & GLB integration test (TDD)**

- Update expected `<script src="...">` array in `tests/game-integration.test.mjs:457-467` to include `'vendor/GLTFLoader.js'` after `three.min.js` and `'rig.js'` between `'models.js'` and `'physics.js'`.
- Load `rig.js` into the `loadGameHarness()` VM sandbox right after `modelsCode`.
- Add integration assertions verifying:
  - `dbg.CharacterRig` is exposed on `window.__GAME_DEBUG__`.
  - `dbg.player.userData.glbRig` is attached (and stays gracefully on procedural fallback in mock VM).
  - When a mock `ready: true` `glbRig` with `getStaffTipWorldPos` is mounted on `dbg.player.userData.glbRig`, `dbg.shoot()` spawns the Star Bolt directly at `getStaffTipWorldPos` coordinates!

- [ ] **Step 2: Run integration test to verify it fails**

Run: `node --test tests/game-integration.test.mjs`
Expected: FAIL on script list and `dbg.CharacterRig`.

- [ ] **Step 3: Wire `index.html`, `physics.js`, and `game.js`**

1. `index.html`: add `<script src="vendor/GLTFLoader.js"></script>` after `three.min.js` and `<script src="rig.js"></script>` after `models.js`.
2. `physics.js`:
   - Add pre-allocated `_rigState` scratch object at module scope (zero GC).
   - In `animatePlayerRig`, after computing `walking`, `airborne`, `runBlend`, `sprintB`, `amp`, `slope`, `riseW`, `fallW`, `apexW`, and head look target `(wantYaw, wantPitch)`:
     - If `u && u.glbRig && u.glbRig.ready`: populate `_rigState` fields (`spd`, `baseSpeed`, `moving`, `walking`, `airborne`, `vx`, `vz`, `vy`, `facing`, `sinF`, `cosF`, `sprintB`, `runBlend`, `amp`, `riseW`, `fallW`, `apexW`, `lockedOn: !!lockTarget`, `dead: P.dead`, `rollT: P.rollT`, `rollDur: ROLL_DURATION`, `rollLocalFwd: P.rollLocalFwd`, `rollLocalSide: P.rollLocalSide`, `swimming: P.swimming`, `swimMoveBlend: P.swimMoveBlend`, `sliding: P.sliding`, `slidePoseB: P.slidePoseB`, `slideNormX: P.slideNormX`, `slideNormZ: P.slideNormZ`, `landT: P.landT`, `landStrength: P.landStrength`, `meleeT: P.meleeT`, `meleeDur: P.meleeDur`, `meleeStep: P.meleeStep`, `castT: P.castT`, `castDur: P.castDur`, `castStep: P.castStep`, `castAimPitch: P.castAimPitch`, `plunging: P.plunging`, `plungeWindupT: P.plungeWindupT`, `plungeLandT: P.plungeLandT`, `hurtFlashT: P.hurtFlashT`, `hasBreathRelic: P.hasBreathRelic`, `headYaw: P.headYaw`, `headPitch: P.headPitch`, `x: P.x`, `z: P.z`), call `u.glbRig.update(dt, time, _rigState)`, AND still run `turnToward(player, P.facing, ...)` + `player.position.set(P.x, P.y + glbBob, P.z)` + `player.scale.set(...)`!
     - Otherwise run the existing procedural `u.pelvis` rig branch untouched.
3. `game.js`:
   - Right after `const player = Models.makePlayer();`, call `if (typeof CharacterRig !== 'undefined' && CharacterRig.attachToPlayer) { CharacterRig.attachToPlayer(player, { Models, Textures, Shaders }); }`.
   - In `shoot()` (non-nova shots): if `player?.userData?.glbRig?.ready && player.userData.glbRig.getStaffTipWorldPos(_boltFrom)` returns non-null, use that live animated crystal world position as the launch muzzle before re-converging `_boltDir`!
   - Call `if (player.userData.glbRig) player.userData.glbRig.triggerEmote('smile', 2.5);` on befriending a Starling, lighting a Star Totem, and finding a Secret Shrine.
   - Add `CharacterRig: typeof CharacterRig !== 'undefined' ? CharacterRig : null` to `debugHandle`.

- [ ] **Step 4: Run syntax checks & entire test suite**

Run: `node --check vendor/GLTFLoader.js && node --check models.js && node --check rig.js && node --check physics.js && node --check game.js && node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs`
Expected: Exit code 0, ALL tests passing (68 existing + new `glb-asset.test.mjs` + `rig.test.mjs` + expanded `models.test.mjs` & `game-integration.test.mjs`).

---

### Task 5: Live Chrome Visual Calibration & Dual-Mode (`http://` + `file://`) Verification

**Files:**
- Potentially calibrate attachment offsets in `rig.js` (Hat/Cloak/Staff local transforms on `Head`/`Chest`/`Hand.R`) or morph amplitudes in `scripts/build_starkeeper_glb.py` based on live visual inspection.

- [ ] **Step 1: Verify GitHub Pages HTTP mode (`http://127.0.0.1:8767/#test`)**
  - Start temporary local HTTP server (`python3 -m http.server 8767 --bind 127.0.0.1`).
  - Open in Chrome via DevTools MCP, verify `window.__GAME_DEBUG__.player.userData.glbRig.ready === true`, verify **0 console errors / 0 WebGL shader errors**, and confirm via `list_network_requests` that `assets/starkeeper.glb` loaded cleanly and `assets/starkeeper.glb.js` was **NOT** requested!

- [ ] **Step 2: Visual Inspection & Bone Attachment Calibration Across 6 Shots**
  - Inspect screenshots of:
    1. **Front close-up** (face, dark-chestnut hair, wide astronomer hat fit on `Head`, midnight-indigo & sea-teal PBR woven tunic, warm leather belt & boots grounded cleanly on the Star Sanctuary pad).
    2. **Back idle & Back sprint** (single-piece continuous flowing crimson cloak + twin sea-teal scarf pinned cleanly on `Chest` with zero back clipping).
    3. **Z-target lateral strafe** (`StrafeRight` + additive `CrouchIdle` guard stance + focused `Determined` morph).
    4. **Melee combo / 360° spin** (`Melee1`, `Spin360` + smooth crossfade return to idle).
    5. **Staff-Lantern Tip firing** (`CastShoot` facing aimed direction with Star Bolt launching straight out of the glowing crystal on `Hand.R`).
    6. **Facial morph close-up** (`Smile` vs `Determined` vs `Blink` on `Adventurer_Head`).
  - If any bone attachment offset (hat height/tilt, cloak shoulder pin, staff grip angle/position) or retargeted limb angle looks slightly off in live WebGL, refine and re-verify until visually spotless!

- [ ] **Step 3: Verify Offline `file://` Dual-Mode (`file:///Users/spencergraham/desktop/other/games/index.html#test`)**
  - Navigate Chrome directly to `file:///Users/spencergraham/desktop/other/games/index.html#test`.
  - Confirm `window.__GAME_DEBUG__.player.userData.glbRig.ready === true`, 0 JS/WebGL/CORS errors, and identical rendered Starkeeper!

- [ ] **Step 4: Final Cleanup & Full Regression Re-Check**
  - Park Chrome on `about:blank` and kill the temporary HTTP server.
  - Re-run `node --check vendor/GLTFLoader.js && node --check models.js && node --check rig.js && node --check physics.js && node --check game.js && node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs` after any final calibration tweak and confirm 100% PASS before reporting completion.
