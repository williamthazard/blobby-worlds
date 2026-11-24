# Living Skinned Animals, Physics & Ecosystem Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all 15 Blobby Worlds animals (+ Sunken City Starlight Manta Rays) from rigid procedural Euler meshes and direct-step AI to real CC0/MIT skinned & morph-animated `.glb` rigs (`SkeletonUtils.clone` + `AnimationMixer`), genuine 3D momentum/jumping/buoyancy physics, and a living ecosystem with flanking companion formations, species-distinct combat, and 3D boids schooling.

**Architecture:** Compile 12 curated CC0/MIT animal `.glb` archetypes offline via `scripts/build_animals_glb.py` (with `file://`-only `.glb.js` wrappers), vendor Three.js r128 `vendor/SkeletonUtils.js` for multi-instance skeletal cloning, add a GPU bioluminescent Moon Jelly shader in `shaders.js` + bone-mounted fantasy attachments in `models.js`, and encapsulate `AnimalRig`, `AnimalPhysics`, and `AnimalAI` inside a new focused module `animals.js` delegated to cleanly by `game.js`.

**Tech Stack:** Pure-browser Three.js r128 (zero build step, zero bundler), Python 3 stdlib + Pillow (offline asset compiler), Node.js `node:test` test runner, Chrome DevTools MCP for live HTTP & `file://` visual verification.

## Global Constraints

- **No git repository:** NEVER execute `git` commands in this workspace.
- **Dual-mode zero-build browser runtime:** Must work seamlessly on GitHub Pages (`http:`/`https:`, fetching binary `.glb` only) AND double-click `file://` (loading base64 `.glb.js` wrappers dynamically, never triggering CORS errors).
- **Zero runtime hot-loop GC allocations:** All per-frame scratch `THREE.Vector3`, `THREE.Quaternion`, `THREE.Euler`, and scratch arrays MUST be pre-allocated at module scope.
- **Strict Three.js r128 compatibility:** No `CapsuleGeometry`, no ES module imports in browser scripts, exact `input.count === output.count` on every glTF animation channel (prevents r128 `QuaternionLinearInterpolant` infinite loops), and `frustumCulled = false` on all `SkinnedMesh` instances.
- **Automatic procedural fallback:** Existing `Models.makeCritter(sp)` meshes stay visible immediately on frame 0 and in headless Node tests (where `GLTFLoader` is absent), hot-swapping cleanly when the `.glb` archetype finishes loading.
- **Asset budget:** Combined binary size of all 13 compiled `.glb` files in `assets/animals/` must stay `<= 4.9 MB`, loaded lazily per archetype on demand.
- **Controls unchanged:** Zero new keyboard buttons or mobile HUD controls.

---

## File Structure

- **Create:** `vendor/SkeletonUtils.js` — Three.js r128 non-module `THREE.SkeletonUtils` (`clone`) for independent multi-instance skeletal cloning.
- **Create:** `scripts/build_animals_glb.py` — Offline compiler fetching, normalizing (`+Z` forward, canonical scale, `minY=0` land grounding, smooth normals, baked `Feline` morph on `fox.glb`, strict channel parity checks), and outputting `assets/animals/*.glb` + `assets/animals/*.glb.js`.
- **Create:** `assets/animals/*.glb` & `assets/animals/*.glb.js` (13 archetypes: `fox`, `unicorn`, `wolf`, `stag`, `drake`, `beetle`, `firefly`, `bird`, `kiwi`, `fish_tang`, `fish_koi`, `eel`, `manta`).
- **Create:** `animals.js` — Exports global `Animals` containing `AnimalRig` (dual-mode lazy loader, `SkeletonUtils.clone`, PBR coat restyling, bone accents, `AnimationMixer` semantic crossfader, Head look-at), `AnimalPhysics` (3D momentum, banking, gravity, obstacle-vault jumps, cliff discipline, water buoyancy, aquatic bounds), and `AnimalAI` (7-state wild ecosystem, calm & chase befriending, flanking pack formations, species-distinct combat, celebrations, 3D boids schooling).
- **Create:** `tests/animals-glb.test.mjs` — Permanent integrity & channel-parity suite for `vendor/SkeletonUtils.js` and all 12 compiled animal `.glb` / `.glb.js` files.
- **Create:** `tests/animals.test.mjs` — Unit & integration test suite for `AnimalRig`, `AnimalPhysics`, and `AnimalAI`.
- **Modify:** `shaders.js` — Add `Shaders.createJellyMaterial(colorHex)` GPU bioluminescent vertex-animated jellyfish shader.
- **Modify:** `models.js` — Wire GPU Jelly material in `makeJelly`, add `wolf` support in `makeQuad`, expose shared fantasy bone-attachment factories (`makeUnicornHorn`, `makeLynxEarTufts`, `makeDrakeEmberCrest`, `makeOwlEarTufts`, `makeFireflyLantern`, `makeKelpFronds`, `makeWishCrown`).
- **Modify:** `index.html` — Load `vendor/SkeletonUtils.js` after `vendor/GLTFLoader.js`, and `animals.js` after `physics.js`.
- **Modify:** `game.js` — Update `LAND` (`Woodland Cub` → `Timber Wolf`), add `Starlight Manta` to `AQUA`, delegate wild/follower/aquatic/Wish rigging & updates cleanly to `Animals`, wire `Animals.celebrate(followers)`, expose `Animals` on `window.__GAME_DEBUG__`.
- **Modify:** `assets/LICENSE-CC0.txt` — Document all CC0 1.0 (Quaternius, Gobkit) and MIT (Three.js `Parrot.glb`) animal sources.
- **Modify:** `tests/shaders.test.mjs`, `tests/models.test.mjs`, `tests/game-integration.test.mjs` — Cover new Jelly shader, attachment factories, updated script order, and `Animals` wiring.

---

### Task 1: Vendor `vendor/SkeletonUtils.js` & Build Offline Animal `.glb` Compiler (`scripts/build_animals_glb.py`)

**Files:**
- Create: `vendor/SkeletonUtils.js`
- Create: `scripts/build_animals_glb.py`
- Create: `assets/animals/{fox,unicorn,wolf,stag,drake,beetle,firefly,bird,kiwi,fish_tang,fish_koi,eel,manta}.{glb,glb.js}`
- Modify: `assets/LICENSE-CC0.txt`
- Test: `tests/animals-glb.test.mjs`

**Interfaces:**
- Produces:
  - Browser global `THREE.SkeletonUtils.clone(source)` from `vendor/SkeletonUtils.js`.
  - 13 normalized binary glTF 2.0 files at `assets/animals/<key>.glb` (`key` in `['fox', 'unicorn', 'wolf', 'stag', 'drake', 'beetle', 'firefly', 'bird', 'kiwi', 'fish_tang', 'fish_koi', 'eel', 'manta']`, where `stag` is Quaternius `animals_pack/Stag.glb`, canonical height `1.36`, powering the ultra-rare **Celestial Stag**!).
  - 13 `file://` wrappers at `assets/animals/<key>.glb.js` setting `window.__ANIMAL_GLB_B64__['<key>'] = "<base64>"`.
  - `fox.glb` carries 1 morph target named `"Feline"` on its body mesh for Moss Lynx restyling.

- [ ] **Step 1: Write failing asset integrity & `SkeletonUtils` test (`tests/animals-glb.test.mjs`)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const EXPECTED_KEYS = [
  'fox', 'unicorn', 'wolf', 'stag', 'drake', 'beetle', 'firefly',
  'bird', 'kiwi', 'fish_tang', 'fish_koi', 'eel', 'manta',
];
const LAND_KEYS = new Set(['fox', 'unicorn', 'wolf', 'stag', 'drake', 'beetle', 'kiwi']);

function parseGlbJson(buf) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'GLB magic must be glTF');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version must be 2');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'First chunk must be JSON');
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

test('vendor/SkeletonUtils.js exists and registers THREE.SkeletonUtils.clone cleanly', () => {
  const src = fs.readFileSync(new URL('../vendor/SkeletonUtils.js', import.meta.url), 'utf8');
  assert.ok(src.includes('SkeletonUtils'), 'vendor/SkeletonUtils.js must define SkeletonUtils');
  const sandbox = {
    THREE: {
      AnimationClip: class {},
      Bone: class {},
      Matrix4: class {},
      Quaternion: class {},
      QuaternionKeyframeTrack: class {},
      SkeletonHelper: class {},
      Vector2: class {},
      Vector3: class {},
      VectorKeyframeTrack: class {},
    },
    console,
    self: {},
  };
  vm.runInNewContext(src, sandbox);
  assert.equal(typeof sandbox.THREE.SkeletonUtils?.clone, 'function', 'THREE.SkeletonUtils.clone must be a function');
});

test('all 12 animal archetypes exist in assets/animals/, stay under 4.2 MB total, match .glb.js wrappers, and pass channel parity', () => {
  let totalBytes = 0;
  for (const key of EXPECTED_KEYS) {
    const glbPath = new URL(`../assets/animals/${key}.glb`, import.meta.url);
    const jsPath = new URL(`../assets/animals/${key}.glb.js`, import.meta.url);
    const glbBuf = fs.readFileSync(glbPath);
    totalBytes += glbBuf.length;
    const gltf = parseGlbJson(glbBuf);
    const jsonLen = glbBuf.readUInt32LE(12);
    const binOff = 20 + jsonLen + 8;

    assert.ok((gltf.meshes || []).length >= 1, `${key}.glb must have >= 1 mesh`);
    assert.ok((gltf.animations || []).length >= 1, `${key}.glb must have >= 1 animation clip`);

    // Every mesh primitive must have NORMALs and finite POSITION bounds
    for (const m of gltf.meshes) {
      for (const p of m.primitives) {
        assert.ok(p.attributes.POSITION !== undefined, `${key}.glb primitive missing POSITION`);
        assert.ok(p.attributes.NORMAL !== undefined, `${key}.glb primitive missing NORMAL`);
      }
    }

    // Channel input/output count parity & sorted non-negative timestamps (prevents r128 Interpolant hangs!)
    for (const anim of gltf.animations) {
      for (let ci = 0; ci < anim.channels.length; ci++) {
        const ch = anim.channels[ci];
        const smp = anim.samplers[ch.sampler];
        const inAcc = gltf.accessors[smp.input];
        const outAcc = gltf.accessors[smp.output];
        assert.equal(inAcc.count, outAcc.count, `${key}.glb clip "${anim.name}" ch ${ci}: input (${inAcc.count}) != output (${outAcc.count})`);
        const bv = gltf.bufferViews[inAcc.bufferView];
        const base = binOff + (bv.byteOffset || 0) + (inAcc.byteOffset || 0);
        let prev = -1e-5;
        for (let k = 0; k < inAcc.count; k++) {
          const t = glbBuf.readFloatLE(base + k * 4);
          assert.ok(Number.isFinite(t) && t >= prev - 1e-5, `${key}.glb clip "${anim.name}" unsorted/negative time at ${k}: ${t}`);
          prev = t;
        }
      }
    }

    // Exact base64 parity with file:// wrapper
    const win = {};
    vm.runInNewContext(fs.readFileSync(jsPath, 'utf8'), { window: win, globalThis: win });
    const decoded = Buffer.from(win.__ANIMAL_GLB_B64__[key], 'base64');
    assert.equal(Buffer.compare(glbBuf, decoded), 0, `${key}.glb.js base64 mismatch`);

    if (key === 'fox') {
      const hasFeline = gltf.meshes.some((m) => (m.extras?.targetNames || []).includes('Feline'));
      assert.ok(hasFeline, 'fox.glb must include baked Feline morph target for Moss Lynx');
    }
    if (LAND_KEYS.has(key)) {
      assert.ok(gltf.extras && Math.abs(gltf.extras.groundOffsetY || 0) < 5, `${key}.glb must record normalization metadata`);
    }
  }
  assert.ok(totalBytes <= 5_100_000, `Combined animal GLB size ${totalBytes} exceeds 4.9 MB budget`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/animals-glb.test.mjs`
Expected: FAIL (`ENOENT` on `vendor/SkeletonUtils.js` and `assets/animals/fox.glb`).

- [ ] **Step 3: Vendor `vendor/SkeletonUtils.js` from Three.js r128**

Download `https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/js/utils/SkeletonUtils.js` directly into `vendor/SkeletonUtils.js` and verify `node --check vendor/SkeletonUtils.js`.

- [ ] **Step 4: Implement `scripts/build_animals_glb.py` and compile all 12 archetypes**

`scripts/build_animals_glb.py` downloads (caching under `/tmp/animals_cache/`) all 12 verified CC0/MIT sources:
- `fox`: Quaternius `animals_pack/Fox.glb` (canonical height `0.72`, bakes `"Feline"` morph target on muzzle/cheeks/ears for Moss Lynx)
- `unicorn`: Quaternius `animals_pack/Horse_White.glb` (canonical height `1.28`)
- `wolf`: Quaternius `animals_pack/Wolf.glb` (canonical height `0.92`)
- `drake`: Quaternius `dinosaurs_pack/Velociraptor.glb` (canonical height `0.84`)
- `beetle`: Gobkit `insect002/Asianladybeetle.glb` (canonical height `0.44`, trims non-essential anims if needed to keep compact while keeping `idle`, `walk`, `run`, `tripod`, `groom`, `alert`, `eat`, `attack`, `hit`, `sleep`, `dead`)
- `firefly`: Quaternius `easy_enemies_pack/Wasp.glb` (canonical height `0.46`)
- `bird`: Three.js r128 `examples/models/gltf/Parrot.glb` (canonical height `0.52`, generates smooth vertex `NORMAL`s so PBR lighting & `Textures.sets.feather` work cleanly!)
- `kiwi`: Gobkit `birds/Kiwi.glb` (canonical height `0.56`, generates smooth normals, embeds compressed texture cleanly)
- `fish_tang`: Quaternius `cute_fish_pack/BlueTang.glb` (canonical height `0.50`)
- `fish_koi`: Quaternius `cute_fish_pack/Koi.glb` (canonical height `0.54`)
- `eel`: Quaternius `easy_enemies_pack/Snake.glb` (canonical height `0.40`)
- `manta`: Quaternius `fish_pack/Manta_ray.glb` (canonical height `1.15`)

For every archetype:
- Computes actual rest world-space bounding box (`minY`, `maxY`, `height`, facing axis), wraps scene roots inside a normalized `AnimalRoot` node with exact uniform scale + `groundOffsetY` (`-minY * scale` for land species so feet rest cleanly at `y = 0`, `-centerY * scale` for swimmers/flyers) and canonical `+Z` forward yaw rotation (checking snout/beak vs tail direction per source).
- Computes smooth vertex normals where missing (e.g., Three.js `Parrot.glb`) or flat-faceted (Gobkit `Kiwi.glb`).
- Validates every channel of every animation clip (`len(times) == len(values)`, sorted non-negative timestamps, finite floats), fixing or dropping any malformed static channel defensively.
- Embeds `gltf["extras"] = { "archetype": key, "canonicalHeight": h, "groundOffsetY": offY, "facingYaw": yaw }`.
- Writes `assets/animals/<key>.glb` and `assets/animals/<key>.glb.js` (`window.__ANIMAL_GLB_B64__ = window.__ANIMAL_GLB_B64__ || {}; window.__ANIMAL_GLB_B64__["<key>"] = "...";`), and appends all CC0/MIT attributions to `assets/LICENSE-CC0.txt`.

- [ ] **Step 5: Run `python3 scripts/build_animals_glb.py && node --test tests/animals-glb.test.mjs`**

Expected: All 12 `.glb` + `.glb.js` files built (`<= 4.2 MB` combined) and `tests/animals-glb.test.mjs` PASS (2/2).

---

### Task 2: GPU Bioluminescent Moon Jelly Shader (`shaders.js`) & Fantasy Bone-Attachment Factories (`models.js`)

**Files:**
- Modify: `shaders.js` (add `createJellyMaterial`)
- Modify: `models.js` (update `makeJelly`, add `wolf` archetype in `makeQuad`, export 7 bone-attachment factories)
- Test: `tests/shaders.test.mjs`, `tests/models.test.mjs`

**Interfaces:**
- Produces:
  - `Shaders.createJellyMaterial(colorHex, opts)` → `THREE.ShaderMaterial` using shared `Shaders.uniforms.uTime` for radial bell contraction, Fresnel rim glow, and traveling sinusoidal tentacle waves (supports `{ isTentacle: true/false }`).
  - `Models.makeUnicornHorn()`, `Models.makeLynxEarTufts(colorHex)`, `Models.makeDrakeEmberCrest()`, `Models.makeOwlEarTufts(colorHex)`, `Models.makeFireflyLantern()`, `Models.makeKelpFronds(colorHex)`, `Models.makeWishCrown()`.
  - `Models.makeCritter({ name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', ... })` works identically in procedural fallback.

- [ ] **Step 1: Add failing tests in `tests/shaders.test.mjs` and `tests/models.test.mjs`**

In `tests/shaders.test.mjs`, assert `typeof Shaders.createJellyMaterial === 'function'`, returns a transparent `ShaderMaterial` sharing `Shaders.uniforms.uTime`, and GLSL vertex shader contains `uTime` and `uIsTentacle` displacement.
In `tests/models.test.mjs`, assert all 7 attachment factories return valid `THREE.Group` objects with children (`>= 1`) and that `Models.makeCritter({ name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', color: 0x7b6554 })` builds cleanly grounded at `y = 0`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/shaders.test.mjs tests/models.test.mjs`
Expected: FAIL (`Shaders.createJellyMaterial is not a function`, `Models.makeUnicornHorn is not a function`).

- [ ] **Step 3: Implement `Shaders.createJellyMaterial` in `shaders.js` and attachment factories + `wolf` support in `models.js`**

- `Shaders.createJellyMaterial(colorHex, opts)`:
  - Uniforms: `uTime: uniforms.uTime`, `uColor: { value: new THREE.Color(colorHex || 0x8fbdf7) }`, `uRimColor: { value: new THREE.Color(0xc8f6ff) }`, `uIsTentacle: { value: opts && opts.isTentacle ? 1.0 : 0.0 }`, `uPhase: { value: (opts && opts.phase) || 0.0 }`.
  - Vertex shader: when `uIsTentacle < 0.5`, computes smooth radial bell pulse `sin(uTime * 2.6 + uPhase - position.y * 2.4)` expanding lower rim while conserving volume; when `uIsTentacle > 0.5`, computes traveling sinusoidal ribbon wave `sin(uTime * 3.1 + uPhase + position.y * 5.2) * (1.0 - smoothstep(-0.05, 0.05, position.y))`.
  - Fragment shader: Fresnel edge glow `pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0)` blending translucent inner core with glowing bioluminescent rim, `transparent: true`, `depthWrite: false`, `side: THREE.DoubleSide`, `blending: THREE.AdditiveBlending`.
- `models.js`:
  - Update `makeJelly` to use `Shaders.createJellyMaterial` when available (with fallback to existing translucent material in minimal mocks).
  - Support `arch === 'wolf'` in `makeQuad` / `sculptQuad*` (athletic long-legged woodland wolf proportions with lush ruff & plumed tail; keep `bear` fully supported!).
  - Implement and export `makeUnicornHorn`, `makeLynxEarTufts`, `makeDrakeEmberCrest`, `makeOwlEarTufts`, `makeFireflyLantern`, `makeKelpFronds`, `makeWishCrown` using cached shared geometries (`geo()`).

- [ ] **Step 4: Run tests to verify pass**

Run: `node --check shaders.js && node --check models.js && node --test tests/shaders.test.mjs tests/models.test.mjs`
Expected: PASS (all shader & model tests green).

---

### Task 3: `animals.js` Part 1 — `AnimalRig` (Dual-Mode Lazy Loader, `SkeletonUtils.clone` & `AnimationMixer` State Machine)

**Files:**
- Create: `animals.js`
- Test: `tests/animals.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `THREE.GLTFLoader`, `THREE.SkeletonUtils`, `Models`, `Textures`, `Shaders`.
- Produces (on global `Animals`):
  - `Animals.speciesToArchetype(species)` → archetype key string (or `'jelly'` for shader Moon Jelly).
  - `Animals.resolveAssetSource(key, protocol)` → `{ mode: 'glb' | 'file-bundle', url: string }`.
  - `Animals.preloadArchetype(key, onReady, onError)` — coalescing template cache; parses each `.glb` once.
  - `Animals.attachToCritter(rootMesh, species, deps)` → returns controller `{ ready, state, species, archetype, triggerOneShot(name, dur), setLookTarget(x, y, z), update(dt, time, state) }` attached to `rootMesh.userData.animalRig`.

- [ ] **Step 1: Write failing `AnimalRig` unit tests in `tests/animals.test.mjs`**

Test coverage:
1. `speciesToArchetype` maps all 15 Blobby Worlds creatures (`Frost Fox`→`'fox'`, `Moss Lynx`→`'fox'`, `Starlight Unicorn`→`'unicorn'`, `Timber Wolf`→`'wolf'`, `Ember Drake`→`'drake'`, `Berry Beetle`→`'beetle'`, `Lantern Firefly`→`'firefly'`, `Cloud Wren`/`Golden Owl`/`Wish`→`'bird'`, `Meadow Kiwi`→`'kiwi'`, `Seafoam Fin`→`'fish_tang'`, `Coral Dart`→`'fish_koi'`, `Kelp Eel`→`'eel'`, `Starlight Manta`→`'manta'`, `Moon Jelly`→`'jelly'`).
2. `resolveAssetSource('fox', 'https:')` returns `{ mode: 'glb', url: './assets/animals/fox.glb' }` and `resolveAssetSource('fox', 'file:')` returns `{ mode: 'file-bundle', url: './assets/animals/fox.glb.js' }`.
3. Graceful fallback keeps procedural mesh visible with zero errors when `GLTFLoader` or `SkeletonUtils` is absent.
4. Mounting two `Frost Fox` instances calls `SkeletonUtils.clone` once per instance (independent `AnimationMixer`s & skeletons, shared template load only once!).
5. Semantic clip router crossfades (`crossFadeTo`) cleanly across `idle` → `eat` → `walk` → `run` → `jump` → `attack` → `hit` → `death`, couples `timeScale` to `speed`, applies `Feline` morph target `1.0` on `Moss Lynx` (and `0.0` on `Frost Fox`), mounts `makeUnicornHorn` onto `Head` bone for `Starlight Unicorn`, and updates with zero per-frame `Vector3`/`Quaternion` allocations.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/animals.test.mjs`
Expected: FAIL (`ENOENT` on `animals.js`).

- [ ] **Step 3: Implement `animals.js` with `AnimalRig`**

- Module-scope scratch `_qYaw`, `_qPitch`, `_axisX`, `_axisY`, `_lookVec` (zero GC).
- Wrap procedural children of `rootMesh` cleanly inside `rootMesh.userData.proceduralRoot` (same pattern as `rig.js`), keeping frame-0 mesh visible until async archetype loads.
- Species restyle map applies `Textures.sets.fur` / `feather` / `scales` PBR coats with linearized colors, `skinning: true` (for `SkinnedMesh`), `morphTargets: true` (when `morphTargetInfluences` present), `frustumCulled = false`, `castShadow = true`, `receiveShadow = true`.
- Semantic clip matcher maps raw clip names case-insensitively across all 12 archetypes (`Gallop`/`Run`→`run`, `Walk`/`tripod`/`Swimming_Normal`→`walk`, `Eating`/`eat`/`groom`→`eat`, `Gallop_Jump`/`Jump`→`jump`, `Attack*`/`attack`→`attack`, `HitReact*`/`hit`→`hit`, `Death`/`dead`→`death`, `Swimming_Fast`/`Flying`→`swimFast`/`fly`, `sleep`→`sleep`, `Idle_2`/`alert`→`idleAlt`, `Idle`/`idle`→`idle`), gracefully falling back to nearest available clip if an archetype lacks a specific sub-clip.
- Post-mixer damped Head-bone look-at (`±0.42 rad` yaw, `±0.24 rad` pitch) + subtle mammal ear twitch (`Ear1.L`/`Ear1.R`).

- [ ] **Step 4: Run tests to verify pass**

Run: `node --check animals.js && node --test tests/animals.test.mjs`
Expected: PASS.

---

### Task 4: `animals.js` Part 2 — `AnimalPhysics` (3D Momentum, Banking, Gravity, Auto-Vault Jumps & Water Buoyancy)

**Files:**
- Modify: `animals.js`
- Test: `tests/animals.test.mjs`

**Interfaces:**
- Consumes: `ctx = { Physics, Shaders, heightAt, terrainNormalAt, surfaceAt, getNearbyColliders, dustBurst, splashBurst, stampFootprint, WATER_Y }`.
- Produces (on global `Animals`):
  - `Animals.createPhysicsState(x, y, z, species)` → flat struct `{ vx, vy, vz, onGround, inWater, airLift, bankRoll, jumpCd, smoothSpd, gaitPhase, printDist, stepSide, dustAcc, splashAcc }`.
  - `Animals.stepLandPhysics(ent, dt, time, desVx, desVz, ctx)` → advances horizontal momentum, gravity, obstacle-vault jumps, cliff rejection, collider resolution, water buoyancy/paddling, terrain slope alignment, turn banking, footprints/dust/splashes; returns `{ moved, jumped, landed, inWater }`.
  - `Animals.stepAerialPhysics(ent, dt, time, desVx, desVz, targetAlt, ctx)` → advances 3D flight velocity, altitude damping, and smooth wing banking.
  - `Animals.stepAquaticPhysics(ent, dt, time, desVx, desVy, desVz, ctx)` → advances 3D underwater velocity strictly clamped inside `[heightAt + 0.75, WATER_Y - 0.85]` with smooth swim pitch & roll.

- [ ] **Step 1: Append failing `AnimalPhysics` unit tests to `tests/animals.test.mjs`**

Test coverage:
1. Inertia & turn banking: accelerating from rest ramps `smoothSpd` smoothly (never teleporting to max speed on frame 1) and turning sharply produces non-zero bounded `bankRoll`.
2. Gravity & auto-vault jumping: when an entity runs into a `0.85u` boulder/pad step-up or solid collider while pursuing a target, `stepLandPhysics` triggers `jumped = true` (`vy > 6.5`, `onGround = false`) and lands smoothly via gravity (`onGround = true`).
3. Steep cliff discipline: trying to walk up a `60°` cliff blocks climbing instead of snapping vertically up the wall.
4. Deep-water buoyancy: a land companion (`Timber Wolf` / `Frost Fox`) moving into deep water (`heightAt = -4.0`, `WATER_Y = -0.35`) sets `inWater = true` and floats buoyantly near `WATER_Y` (`y > WATER_Y - 0.65`, NEVER sinking to `y = -4.0`!).
5. Aerial flyers (`Golden Owl` / `Cloud Wren` / `Lantern Firefly`) maintain target altitude cleanly above water (`y > WATER_Y + 0.8`).
6. Aquatic physics stays strictly bounded between seabed (`heightAt + 0.75`) and below wave surface (`WATER_Y - 0.85`).

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/animals.test.mjs`
Expected: FAIL (`Animals.stepLandPhysics is not a function`).

- [ ] **Step 3: Implement `AnimalPhysics` inside `animals.js`**

Implement `createPhysicsState`, `stepLandPhysics`, `stepAerialPhysics`, and `stepAquaticPhysics` using module-scope scratch `_physNorm`, `_physColBuf`, `_physColOut`, `_physMat` (zero per-frame heap allocations!).

- [ ] **Step 4: Run tests to verify pass**

Run: `node --check animals.js && node --test tests/animals.test.mjs`
Expected: PASS.

---

### Task 5: `animals.js` Part 3 — `AnimalAI` (Living Wild Ecosystem, Flanking Formations, Species Combat & 3D Boids Schooling)

**Files:**
- Modify: `animals.js`
- Test: `tests/animals.test.mjs`

**Interfaces:**
- Consumes: `AnimalRig` & `AnimalPhysics` inside `animals.js` + `ctx` callbacks from `game.js` (`P`, `glooms`, `burst`, `hitGloom`, `addFollower`, `questEvent`, `toast`, `Sound`, `spawnWild`, `scene`, `Models`, `AQUA`).
- Produces (on global `Animals`):
  - `Animals.RARE_SPECIES` — curated table of rare mythic animals (`Celestial Stag` using `stag.glb` + rare iridescent variants `Aurora Fox`, `Eclipse Wolf`, `Astral Unicorn`, `Solar Owl`, `Starfire Drake`) with `rare: true`, distinct luminous coat palette, bonus HP (`+3`), and radiant `2`-damage starlight strikes!
  - `Animals.rollRareSpecies(baseSpecies, rng)` — ~12% chance to upgrade a wild spawn into the ultra-rare **Celestial Stag** or a rare mythic shimmering variant of that biome's species!
  - `Animals.getTemperament(species)` → `'shy' | 'curious' | 'aerial' | 'busy'`.
  - `Animals.updateWild(wild, dt, time, ctx)` — drives 7-state daily life (`wander`, `graze`, `rest`, `curious`, `calmTrust`, `flee`, `tired`, `fleeGloom`), rare sparkle aura & discovery toast/chime, calm-approach & classic chase befriending, physics + rig updates.
  - `Animals.updateFollowers(followers, dt, time, ctx)` — drives flanking pack formations (boids separation + arrival), 3-tier combat priority with species-distinct animated lunge/charge/dive/ram attacks, idle resting/grazing, celebration hops, physics + rig updates.
  - `Animals.celebrate(followers)` — triggers staggered joyful celebration hops & `jump`/`idleAlt` animations across all companions.
  - `Animals.initAquatic(aquaticCritters, ctx)` — populates 16 living Sunken City reef creatures (6 `Seafoam Fin`, 4 `Coral Dart`, 2 `Kelp Eel`, 2 GPU `Moon Jelly`, 2 `Starlight Manta`).
  - `Animals.updateAquatic(aquaticCritters, dt, time, ctx)` — drives true zero-GC 3D boids schooling (separation, alignment, cohesion, home-reef tether, swimmer scatter) + `stepAquaticPhysics` + `AnimalRig`.
  - `Animals.updateWish(wish, dt, time, ctx)` — drives Wish's skinned/morph `bird.glb` flight animations, banking turns, and overhead lock-on swoop.

- [ ] **Step 1: Append failing `AnimalAI` unit tests to `tests/animals.test.mjs`**

Test coverage:
1. Wild daily-life transitions: idle wild creatures transition into `graze` (driving `eat` animation state) and `rest`, and scatter into `fleeGloom` when a Gloomblob approaches within `9u`.
2. Two befriending paths:
   - **Calm approach:** walking/standing gently (`playerSpd < 4.0`) near a wild creature (`d < 5.0`) enters `calmTrust` and calls `addFollower` + `questEvent('befriend')` after `~2.3s`.
   - **Gentle chase:** sprinting near a shy creature triggers `flee` → `tired` after `3.5s` → staying close calls `addFollower`.
3. Flanking pack formation: 4 followers escorting Starkeeper spread out with pairwise horizontal spacing `>= 1.1u` (no single-file overlap collapse) and transition into idle `graze`/`rest` when Starkeeper stands still `> 3.2s`.
4. Species-distinct combat & self-defense: followers defend themselves even far from Starkeeper, trigger `attack` one-shot animation + parabolic pounce (`vy > 3` for wolf/fox/lynx) or aerial dive (`airLift > 0.8` for owl/wren/firefly), and call `hitGloom`.
5. `Animals.celebrate(followers)` triggers positive vertical hop velocities (`vy > 4.0`) across grounded followers.
6. 3D boids schooling: `initAquatic` spawns 16 creatures including `Starlight Manta` and `Moon Jelly`; `updateAquatic` maintains pairwise separation when two fish start `0.2u` apart, scatters away when Starkeeper swims right into the school, and stays strictly inside `[heightAt + 0.75, WATER_Y - 0.85]`.
7. Hot-loop static scan confirms zero `new THREE.Vector3` / `new THREE.Quaternion` inside `updateWild`, `updateFollowers`, `updateAquatic`, `stepLandPhysics`, `stepAerialPhysics`, `stepAquaticPhysics`, or `updateRig`.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/animals.test.mjs`
Expected: FAIL (`Animals.updateWild is not a function`).

- [ ] **Step 3: Implement `AnimalAI` inside `animals.js`**

Implement `getTemperament`, `updateWild`, `updateFollowers`, `celebrate`, `initAquatic`, `updateAquatic`, and `updateWish` cleanly with pre-allocated scratch variables.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --check animals.js && node --test tests/animals.test.mjs`
Expected: PASS.

---

### Task 6: Wire `index.html`, `game.js`, Regression Tests & Dual-Mode Chrome Visual Verification

**Files:**
- Modify: `index.html`
- Modify: `game.js`
- Modify: `tests/game-integration.test.mjs`

**Interfaces:**
- Consumes: `Animals` (`animals.js`), `THREE.SkeletonUtils` (`vendor/SkeletonUtils.js`).
- Produces: Complete end-to-end live integration in `game.js` with `window.__GAME_DEBUG__.Animals` exposed and 100% compatibility with all existing tests.

- [ ] **Step 1: Update `tests/game-integration.test.mjs` script-order check and `loadGameHarness`**

Add `'vendor/SkeletonUtils.js'` right after `'vendor/GLTFLoader.js'` and `'animals.js'` right after `'physics.js'` in `index.html` order assertion and `loadGameHarness`, plus add an integration test asserting `window.__GAME_DEBUG__.Animals` is wired, `Timber Wolf` & `Starlight Manta` exist in the species roster, `aquaticCritters.length === 16`, and companion celebration triggers on Totem light.

- [ ] **Step 2: Run `node --test tests/game-integration.test.mjs` to confirm RED before wiring**

Expected: FAIL on missing `vendor/SkeletonUtils.js` / `animals.js` tags in `index.html`.

- [ ] **Step 3: Update `index.html` and wire `Animals` cleanly in `game.js`**

- In `index.html`: insert `<script src="vendor/SkeletonUtils.js"></script>` after `GLTFLoader.js` and `<script src="animals.js"></script>` after `physics.js`.
- In `game.js`:
  - Update `LAND` entry `'Woodland Cub'` → `'Timber Wolf'` (`plan: 'quad', archetype: 'wolf'`, `color: 0x7e6855`, `names: ['Koda', 'Timber', 'Ash', 'Bramble', 'Lupin', 'Oakley', 'Cedar', 'Fen']`).
  - Add `'Starlight Manta'` (`plan: 'fish', archetype: 'manta', color: 0x4b74d8, aquatic: true, names: ['Glide', 'Celestia', 'Ray', 'Abyssal', 'Manta', 'Vega']`) to `AQUA`.
  - Mount `Animals.attachToCritter(mesh, sp, { Models, Textures, Shaders })` in `spawnWild`, `addFollower`, `initAquaticCritters`, and on `wish`.
  - Create reusable module-scope `_animalCtx` object and delegate `updateWild`, `updateFollowers`, `initAquaticCritters`, `updateAquaticCritters`, and Wish animation cleanly to `Animals` (falling back gracefully if `Animals` is unavailable).
  - Call `Animals.celebrate(followers)` in `lightTotem`, Secret Shrine discovery, and Starling befriending.
  - Expose `Animals` on `window.__GAME_DEBUG__`.

- [ ] **Step 4: Run syntax checks & full regression suite**

Run:
```bash
node --check vendor/SkeletonUtils.js && node --check shaders.js && node --check models.js && node --check rig.js && node --check physics.js && node --check animals.js && node --check game.js && node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs
```
Expected: All syntax checks pass, **100% of test suites pass (0 failures)**!

- [ ] **Step 5: Live Chrome Dual-Mode Visual Verification (HTTP + `file://`)**

- Start temporary HTTP server (`python3 -m http.server 8767 --bind 127.0.0.1`), navigate with rAF-throttling `initScript` and `ignoreCache: true`.
- Capture & visually inspect screenshots across:
  1. **Land Showcase:** Frost Fox, Moss Lynx (Feline morph + ear tufts), Starlight Unicorn (glowing spiral horn), Timber Wolf, Ember Drake, Berry Beetle, Lantern Firefly, Meadow Kiwi, Cloud Wren, Golden Owl, and Wish — verify grounded feet, smooth shading, crisp coats, zero detached parts.
  2. **Physics & Behaviors:** Flanking companion pack formation around Starkeeper, land companions swimming buoyantly at water surface (not walking on seafloor!), and animated combat lunge.
  3. **Sunken City Reef:** 16-creature 3D boids school (Seafoam Fin, Coral Dart, Kelp Eel, glowing GPU Moon Jelly, gliding Starlight Manta Ray).
- Verify **`file:///Users/spencergraham/desktop/other/games/index.html#test`** loads all `.glb.js` wrappers cleanly with **0 JS/WebGL/CORS errors** (`list_console_messages`).
- Park Chrome on `about:blank` and kill the temporary HTTP server.
