# Sub-Project 4: PBR Realistic Nature Environment, Sky & World Physics Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Blobby Worlds' entire natural environment — celestial sky (cratered Moon, Rayleigh/Mie Sun, twinkling spectral starfield & Milky Way, 3D multi-scatter cumulus clouds, post-8/8 live day/night cycle), synchronized 4-wave Gerstner ocean water (wakes, whitecaps, underwater sunbeams & landmark caustics), higher-detail PBR terrain & cohesive wind physics, 17 curated CC0 1.0 nature & ruin GLB props with instant procedural fallback, carved PBR shrines, and pooled ambient biome motes — with Chromebook-friendly High/Balanced quality scaling.

**Architecture:** Mirror the modular architecture of `animals.js` and `enemies.js` by adding a zero-GC `env.js` (`Env` global) and offline compiler `scripts/build_env_glb.py` -> `assets/env/*.{glb,glb.js}`, while upgrading `textures.js`, `shaders.js`, `world.js`, `regions.js`, `index.html`, and `game.js`. Every chunk and shrine renders immediately using upgraded procedural fallback geometry and hot-swaps seamlessly to CC0 GLB props as they load over HTTP or `file://`.

**Tech Stack:** Zero-build browser ES2020 JavaScript, Three.js r128 (`GLTFLoader`), WebGL 1 GLSL shaders (`onBeforeCompile` + `ShaderMaterial`), Python 3 stdlib GLB build script, Node.js `node:test` test runner, Chrome DevTools MCP visual verification.

## Global Constraints

- **Zero-build dual-mode compatibility:** Must run identically on GitHub Pages HTTPS (fetching `./assets/env/<key>.glb`) AND local `file://` double-click (injecting `./assets/env/<key>.glb.js` base64 script wrapper populating `window.__ENV_GLB_B64__[key]`).
- **WebGL 1 / Three.js r128 GLSL rules:** Never use `dFdx`/`dFdy` or `mat3(modelMatrix)` in any shader; keep all `smoothstep(edge0, edge1, x)` bounds strictly ordered (`edge0 < edge1`); assign distinct `customProgramCacheKey()` strings to every `onBeforeCompile` material variant.
- **Strict zero-GC hot loops:** All per-frame updates in `env.js`, `shaders.js`, `world.js`, and `regions.js` must reuse pre-allocated vectors, colors, matrices, and pools — zero runtime `new THREE.*`, array/object literal allocations, or `scene.add` calls during steady-state gameplay ticks.
- **Graceful procedural fallback:** Missing `GLTFLoader`, offline/failed GLB fetches, or headless test sandboxes without `Env` must fall back cleanly to upgraded procedural geometry & PBR materials with zero console errors.
- **Chromebook High/Balanced scaling:** `setQuality('high' | 'balanced')` scales pixel ratio (`2.0`/`1.25`), shadows (`2048`/`1024`), chunk water grid (`24`/`16`), grass density (`36×36`/`25×25`), stars (`900`/`450`), cumulus cloud banks (`28`/`14`), underwater rays (`16`/`6`), and ambient biome motes (`120`/`56`).
- **100% CC0 1.0 Public Domain provenance & zero emojis:** Every external nature/ruin `.glb` is sourced from CC0 1.0 Quaternius packs (`trebeljahr/quaternius-showcase` mirror) and credited in `assets/LICENSE-CC0.txt`. Zero emojis in UI/toast strings.
- **Existing test contract preservation:** Keep `Textures` 13 core PBR sets at `256×256` within their exact roughness ranges and `fernCard` at `128×128` (`< 950 ms` total init); keep `waterHeightAt` max wave amplitude `< 0.25`; keep `smoothstep(0.18, 0.42, tSlope)` in terrain and `smoothstep(56.0, 78.0, camDist)` in grass; keep `sun` distance `75u` from `sun.target`; keep all landmark standable colliders and ring clearances intact.

---

### Task 1: Curated CC0 1.0 Nature & Ruin GLB Pipeline

**Files:**
- Create: `scripts/build_env_glb.py`
- Create: `assets/env/*.glb` & `assets/env/*.glb.js` (17 prop pairs = 34 files)
- Modify: `assets/LICENSE-CC0.txt`
- Create: `tests/env-glb.test.mjs`

**Interfaces:**
- Consumes: CC0 1.0 GLB source models from `https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/` (cached locally under `/tmp/blobby_env_cache/` during build; never committed raw).
- Produces:
  - 17 normalized `.glb` binary files + 17 `.glb.js` wrappers (`window.__ENV_GLB_B64__['<key>'] = '<base64>'`) for keys: `oak_tree`, `birch_tree`, `pine_tree`, `pine_snow`, `willow_tree`, `palm_tree`, `cactus_flower`, `bush_berry`, `boulder_moss`, `boulder_rock`, `fallen_log`, `tree_stump`, `lilypad`, `ruin_arch`, `ruin_column`, `ruin_column_broken`, `shrine_pedestal`.
  - Every compiled GLB has an `EnvRoot` wrapper node normalized so `minY` sits at `0.0` (`±0.02u`), centered on X/Z, scaled to its canonical target height, with valid `POSITION`, crease-aware smooth `NORMAL`, and `TEXCOORD_0` attributes on every primitive, and descriptive material names (`Bark`, `Leaves`, `Snow`, `Stone`, `Moss`, `Flower`) so `env.js` can restyle PBR slots deterministically.

- [ ] **Step 1: Write the failing test `tests/env-glb.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const EXPECTED_PROPS = {
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

function parseGlb(fileUrl) {
  const buf = fs.readFileSync(fileUrl);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'glTF', 'Must have glTF magic header');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen + 8;
  const bin = buf.subarray(binOff);
  return { buf, gltf, bin };
}

test('all 17 environment .glb and .glb.js files exist, fit within 1,500,000 byte budget, and have exact base64 parity', () => {
  const dir = new URL('../assets/env/', import.meta.url);
  let totalGlbBytes = 0;

  for (const key of Object.keys(EXPECTED_PROPS)) {
    const glbUrl = new URL(`${key}.glb`, dir);
    const jsUrl = new URL(`${key}.glb.js`, dir);
    assert.ok(fs.existsSync(glbUrl), `Missing ${key}.glb`);
    assert.ok(fs.existsSync(jsUrl), `Missing ${key}.glb.js`);

    const raw = fs.readFileSync(glbUrl);
    totalGlbBytes += raw.length;
    assert.ok(raw.length > 500 && raw.length < 220_000, `${key}.glb size ${raw.length} out of expected range`);

    const jsSrc = fs.readFileSync(jsUrl, 'utf8');
    const win = {};
    vm.runInNewContext(jsSrc, { window: win });
    assert.ok(win.__ENV_GLB_B64__ && typeof win.__ENV_GLB_B64__[key] === 'string', `${key}.glb.js must register window.__ENV_GLB_B64__.${key}`);
    const decoded = Buffer.from(win.__ENV_GLB_B64__[key], 'base64');
    assert.equal(Buffer.compare(raw, decoded), 0, `${key}.glb.js base64 must match binary .glb byte-for-byte`);
  }

  assert.ok(totalGlbBytes <= 1_500_000, `Total env GLB binary budget exceeded: ${totalGlbBytes} bytes`);
});

test('every environment GLB has EnvRoot normalization, canonical height/grounding, POSITION+NORMAL+TEXCOORD_0, and r128 compatibility', () => {
  const dir = new URL('../assets/env/', import.meta.url);
  for (const [key, targetH] of Object.entries(EXPECTED_PROPS)) {
    const { gltf } = parseGlb(new URL(`${key}.glb`, dir));
    assert.ok(Array.isArray(gltf.meshes) && gltf.meshes.length >= 1, `${key} must contain at least one mesh`);
    assert.ok(!gltf.extensionsRequired || gltf.extensionsRequired.length === 0, `${key} must not require unsupported glTF extensions`);

    const rootNode = (gltf.nodes || []).find((n) => n.name === 'EnvRoot');
    assert.ok(rootNode, `${key} must have an EnvRoot normalization node`);
    const meta = rootNode.extras || {};
    assert.ok(Math.abs(meta.groundMinY) <= 0.025, `${key} groundMinY should be ~0, got ${meta.groundMinY}`);
    assert.ok(Math.abs(meta.height - targetH) <= targetH * 0.08 + 0.04, `${key} height ${meta.height} should match target ${targetH}`);

    for (const mesh of gltf.meshes) {
      for (const prim of mesh.primitives) {
        assert.ok(prim.attributes.POSITION !== undefined, `${key} primitive missing POSITION`);
        assert.ok(prim.attributes.NORMAL !== undefined, `${key} primitive missing NORMAL`);
        assert.ok(prim.attributes.TEXCOORD_0 !== undefined, `${key} primitive missing TEXCOORD_0`);
      }
    }
  }
});

test('assets/LICENSE-CC0.txt credits all 17 environment CC0 1.0 nature and ruin sources', () => {
  const txt = fs.readFileSync(new URL('../assets/LICENSE-CC0.txt', import.meta.url), 'utf8');
  for (const token of ['nature_pack', 'modular_dungeon_1', 'modular_dungeon_pack', 'CommonTree_1.glb', 'Willow_1.glb', 'PalmTree_1.glb', 'Rock_Moss_1.glb', 'Arch.glb', 'Pedestal.glb']) {
    assert.ok(txt.includes(token), `LICENSE-CC0.txt must credit ${token}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/env-glb.test.mjs`  
Expected: FAIL with `Missing oak_tree.glb`.

- [ ] **Step 3: Write `scripts/build_env_glb.py`, run it, and update `assets/LICENSE-CC0.txt`**

Implement `scripts/build_env_glb.py` using Python 3 stdlib (`urllib.request`, `struct`, `json`, `math`, `base64`, `os`, `pathlib`):
- Manifest of all 17 props with exact `trebeljahr/quaternius-showcase` paths and target heights (`oak_tree` `9.6`, `birch_tree` `9.2`, `pine_tree` `11.2`, `pine_snow` `11.2`, `willow_tree` `8.8`, `palm_tree` `8.4`, `cactus_flower` `2.6`, `bush_berry` `1.35`, `boulder_moss` `1.35`, `boulder_rock` `1.45`, `fallen_log` `0.85`, `tree_stump` `0.95`, `lilypad` `0.12`, `ruin_arch` `5.8`, `ruin_column` `5.0`, `ruin_column_broken` `3.2`, `shrine_pedestal` `1.6`).
- Downloads to `/tmp/blobby_env_cache/<key>.glb` (reusing cache on re-runs).
- Parses GLB JSON + BIN chunk, walks scene graph computing world matrices for all mesh primitives, computes exact world AABB (`minX, maxX, minY, maxY, minZ, maxZ`), wraps scene roots under `EnvRoot` scaled by `targetH / rawH` and translated so centered `(cx, cz) -> (0, 0)` and `minY -> 0.0`, storing `extras: {"groundMinY": 0.0, "height": targetH, "source": src_path}`.
- Strips unsupported r128 extensions (`KHR_materials_emissive_strength`, `KHR_materials_specular`, `KHR_materials_ior`), keeps `extensionsUsed`/`extensionsRequired` empty.
- For any primitive missing `NORMAL`, computes crease-aware smooth vertex normals (`cos(45°)` crease threshold); for any primitive missing `TEXCOORD_0`, generates clean world-scale box/triplanar UVs (`u = (|nx| > |nz| ? pz : px) * 0.45`, `v = py * 0.45` for walls/trunks/columns, planar XZ for caps/lilypads) and appends the new accessor + bufferView cleanly aligned to 4-byte boundaries.
- Writes both `assets/env/<key>.glb` and `assets/env/<key>.glb.js`:
  ```js
  window.__ENV_GLB_B64__ = window.__ENV_GLB_B64__ || {};
  window.__ENV_GLB_B64__["<key>"] = "<base64>";
  ```
- Append an `Environment Nature & Ruin 3D Models (assets/env/*.glb & *.glb.js)` section to `assets/LICENSE-CC0.txt` listing all 17 models, `nature_pack`, `modular_dungeon_1`, and `modular_dungeon_pack` under CC0 1.0 Universal.

- [ ] **Step 4: Run build script and verify `tests/env-glb.test.mjs` passes**

Run: `python3 scripts/build_env_glb.py && node --test --test-concurrency=1 --test-timeout=5000 tests/env-glb.test.mjs`  
Expected: PASS (3/3 tests, total binary size `<= 1.5 MB`).

- [ ] **Step 5: Commit**

```bash
git add scripts/build_env_glb.py assets/env assets/LICENSE-CC0.txt tests/env-glb.test.mjs
git commit -m "feat(env): add CC0 1.0 nature and ruin GLB build pipeline and 17 compiled assets"
```

---

### Task 2: Upgraded Realistic PBR Textures & Shaders (Sky/Moon/Stars/Clouds, Gerstner Ocean & Wakes, Terrain/Cloud Shadows & Reactive Foliage)

**Files:**
- Modify: `textures.js` (sharper bark/rock/stone/water PBR detail + 512px botanical `oakLeafCard`, `pineBoughCard`, `pineSnowBoughCard` + richer `fernCard`)
- Modify: `shaders.js` (new uniforms `uMoonDir`, `uMoonColor`, `uNightFactor`, `uWindVec`, `uCloudOffset`; cratered Moon + Milky Way + cirrus in `_SKY_FRAG`; 4-wave synchronized Gerstner `_WATER_VERT` & `waterHeightAt`; Schlick Fresnel, whitecap crests & `uTramplers` swim wake ripples in `_WATER_FRAG`; 3-scale anti-tiling + moss/snow ledge caps + projected cloud shadows + horizon turf sheen in `createTerrainMaterial`; backlit grass + `uWindVec` in `createGrassMaterial`; new exports `patchFoliageReactive`, `patchUnderwaterCaustics`, `createStarfieldMaterial`, `createCloudMaterial`, `setCelestial`, `setWind`)
- Modify: `tests/textures.test.mjs` (verify 512px botanical tree cards & fast boot `< 950 ms`)
- Modify: `tests/shaders.test.mjs` (update `waterHeightAt` test to 4-wave Gerstner + shore damping; test new uniforms, sky Moon/Milky Way, water wake ripples, terrain cloud shadows, `patchFoliageReactive`, `patchUnderwaterCaustics`, `createStarfieldMaterial`, `createCloudMaterial`, and distinct program cache keys)

**Interfaces:**
- Produces on `Textures`:
  - Existing 14 `sets` (`256×256` seamless) + `oakLeafCard` (`512×512`), `pineBoughCard` (`512×512`), `pineSnowBoughCard` (`512×512`), `fernCard` (`128×128`), `glowSprite`, `sparkleSprite`, `starkeeperFace`, `starkeeperIris`.
- Produces on `Shaders`:
  - `uniforms`: existing uniforms PLUS `uMoonDir` (`vec3`), `uMoonColor` (`Color`), `uNightFactor` (`float 0..1`), `uWindVec` (`vec4(dirX, dirZ, strength, phase)`), `uCloudOffset` (`vec2`).
  - `waterHeightAt(x, z, time, bedHeight)` — 4-wave Gerstner vertical displacement (`maxAmp <= 0.232 < 0.25`), optional `bedHeight` applying shore damping `smoothstep(0.05, 1.35, max(uWaterY - bedHeight, 0))`.
  - `setCelestial(moonDir, moonColor, nightFactor)` — zero-GC in-place mutation of `uMoonDir`, `uMoonColor`, `uNightFactor`.
  - `setWind(dirX, dirZ, strength, phase, cloudOffX, cloudOffZ)` — zero-GC in-place mutation of `uWindVec` and `uCloudOffset`.
  - `patchFoliageReactive(mat, opts)` — `onBeforeCompile` patch for ferns/reeds/bushes combining `uWindVec` sway + `uPlayerPos` & `uTramplers[16]` parting + backlit subsurface glow; distinct cache key `'foliage_reactive_v1'` (or `opts.tag`).
  - `patchUnderwaterCaustics(mat, opts)` — `onBeforeCompile` patch projecting animated dual-layer underwater caustics onto submerged stone/coral/ruin `MeshStandardMaterial`s below `uWaterY`; distinct cache key `'underwater_caustics_v1'` (or `opts.tag`).
  - `createStarfieldMaterial()` — `ShaderMaterial` for circular Airy-disc twinkling spectral stars (`aSize`, `aPhase`, `aTwinkleSpeed`, `aColor`, `uStarAlpha`, `uTime`).
  - `createCloudMaterial()` — `ShaderMaterial` for 3D instanced volumetric-lit cumulus cloud puffs (Beer-powder multi-scattering cream tops, Henyey-Greenstein silver linings facing `uSunDir`/`uMoonDir`, dawn/sunset rose-amber underbellies, fog blend).

- [ ] **Step 1: Write failing tests in `tests/shaders.test.mjs` and `tests/textures.test.mjs`**

Add tests in `tests/shaders.test.mjs`:
1. Update the exact `waterHeightAt` formula test to check the 4-wave Gerstner formula (`W1..W4`: `[(0.86,0.51,0.16,0.11,1.25), (-0.48,0.88,0.27,0.068,1.55), (0.34,-0.94,0.48,0.036,2.05), (-0.82,-0.57,0.78,0.018,2.65)]`) AND verify shore damping (`Math.abs(S.waterHeightAt(7, -3, 2.5, -0.02)) < Math.abs(S.waterHeightAt(7, -3, 2.5, -5.0))`).
2. Add a test `Sub-Project 4 PBR environment shaders: Moon/Milky Way sky, Gerstner water wakes, cloud shadows, reactive foliage, underwater caustics, starfield & clouds` asserting:
   - `uMoonDir`, `uMoonColor`, `uNightFactor`, `uWindVec`, `uCloudOffset` exist on `S.uniforms` and `setCelestial` / `setWind` mutate in-place (same object references).
   - `S._SKY_FRAG` references `uMoonDir`, `uNightFactor`, `uCloudOffset`, and contains crater/maria + Milky Way shading with no `dFdx`/`dFdy`.
   - `S._WATER_VERT` & `S._WATER_FRAG` contain 4 Gerstner waves, `uPlayerPos`, `uTramplers`, `uMoonDir`, crest whitecap foam, and wake ripples with no `dFdx`/`dFdy`.
   - `createTerrainMaterial` injects `uCloudOffset` cloud shadow modulation and `uWindVec` horizon turf sheen while preserving `smoothstep(0.18, 0.42`.
   - `patchFoliageReactive` & `patchUnderwaterCaustics` patch `MeshStandardMaterial` cleanly with distinct `customProgramCacheKey()` values and zero `dFdx`/`dFdy` or `mat3(modelMatrix)`.
   - `createStarfieldMaterial` & `createCloudMaterial` return valid `ShaderMaterial`s with `uTime`, `uSunDir`, `uMoonDir`, and `#include <tonemapping_fragment>` / `#include <encodings_fragment>`.
   - Add assertion in `tests/textures.test.mjs` verifying `T.oakLeafCard.image.width === 512`, `T.pineBoughCard.image.width === 512`, `T.pineSnowBoughCard.image.width === 512`, while `T.fernCard.image.width === 128`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/shaders.test.mjs tests/textures.test.mjs`  
Expected: FAIL (`setCelestial` / `patchFoliageReactive` / `patchUnderwaterCaustics` undefined; `oakLeafCard` width `256 !== 512`).

- [ ] **Step 3: Upgrade `textures.js` and `shaders.js`**

1. **`textures.js`:**
   - Enhance `genBark`, `genRock`, `genStone`, and `genWaterNormal` with richer high-frequency fissures/grain/capillary ripples while staying strictly inside each set's existing `[minR, maxR]` roughness range and seamless toroidal wrapping.
   - Upgrade `buildFoliageCard('oak' | 'pine' | 'pineSnow', 512, maxAniso)` to render denser, multi-layered realistic botanical leaf sprigs (48 serrated/lobed sunlit-to-shaded oak leaves with fine lateral veins & dark inner canopy depth; richer tapered pine needle sprays with crisp highlights and realistic snow-dusted clusters).
   - Keep `buildFernCard(128, maxAniso)` at `128×128` with crisper pinnae leaf highlights.
2. **`shaders.js`:**
   - Add `uMoonDir`, `uMoonColor`, `uNightFactor`, `uWindVec`, `uCloudOffset` uniforms and zero-GC `setCelestial()` / `setWind()` mutators.
   - Upgrade `waterHeightAt(x, z, time, bedHeight)` and `_WATER_VERT` to the exact matching 4-wave Gerstner table + shore damping `smoothstep(0.05, 1.35, max(uWaterY - aBedHeight, 0.0))` + `vCrest` varying for whitecaps.
   - Upgrade `_WATER_FRAG` with Schlick Fresnel (`F0 = 0.02`), Beer-Lambert optical absorption, golden sun + silver moon specular glitter paths, Gerstner crest whitecaps, dual-stage shoreline surge foam, and dynamic GPU swim wake rings using `uPlayerPos` & `uTramplers[16]`.
   - Upgrade `_SKY_FRAG` with procedural cratered Moon (`uMoonDir`, lunar maria + crater relief + solar phase illumination + silver halo), tilted night-only Milky Way dust ribbon, enhanced Rayleigh/Mie dawn/sunset scattering, and high wispy cirrus layer synced to `uCloudOffset`.
   - Upgrade `createTerrainMaterial`: 3-scale anti-tiling detail, deeper stratified cliffs with moss/snow ledge caps, scrolling projected cloud shadows (`uCloudOffset`), and seamless distant meadow turf sheen (`uWindVec`).
   - Upgrade `createGrassMaterial` & `patchTreeWind`: integrate `uWindVec` travelling gusts + warm sun-backlit subsurface translucency (preserving `smoothstep(56.0, 78.0, camDist)`).
   - Implement `patchFoliageReactive(mat, opts)`, `patchUnderwaterCaustics(mat, opts)`, `createStarfieldMaterial()`, and `createCloudMaterial()`, and export all of them on `Shaders`.

- [ ] **Step 4: Run tests to verify `tests/shaders.test.mjs` & `tests/textures.test.mjs` pass**

Run: `node --check textures.js && node --check shaders.js && node --test --test-concurrency=1 --test-timeout=5000 tests/shaders.test.mjs tests/textures.test.mjs`  
Expected: PASS (100% green, `Textures.init` `< 650 ms`).

- [ ] **Step 5: Commit**

```bash
git add textures.js shaders.js tests/textures.test.mjs tests/shaders.test.mjs
git commit -m "feat(shaders,textures): add Gerstner ocean wakes, cratered moon/Milky Way sky, cloud shadows, and realistic PBR foliage shaders"
```

---

### Task 3: Dedicated `env.js` Module — Prop Loader, Celestial Rig, Wind Field, Clouds, Sunbeams & Ambient Biome Motes

**Files:**
- Create: `env.js`
- Create: `tests/env.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `Shaders`, `Textures`, `Regions` (optional), `window.__ENV_GLB_B64__` (in `file:` mode).
- Produces global `Env` with:
  - `PROP_KEYS` (array of 17 prop keys), `resolveAssetSource(key, protocol)`, `preloadProp(key, onReady, onErr, deps)`, `preloadAll(deps)`, `getProp(key)`, `onPropReady(key, cb)`, `registerInstancedSwap(key, target, opts)` (hot-swaps `InstancedMesh` geometry/material per sub-part when GLB finishes loading!), `registerNodeSwap(key, placeholderGroup, opts)` (replaces placeholder landmark child with styled GLB clone when ready!), `_resetCache()`.
  - `computeCelestialState(lit, cycleTime, out)` — zero-GC pure math computing `{ sunDir, moonDir, shadowDir, sunColor, moonColor, skyTop, skyMid, skyBot, hemiSky, hemiGround, sunIntensity, hemiIntensity, nightFactor, starAlpha, dayProgress }` across both `0/8 -> 8/8` story arc and unlocked post-8/8 12-minute live cycle (`cycleTime = 0` starts in bright azure Day).
  - `setSkyProgress(lit)` — sets `lit` count, resets `cycleTime = 0` when `lit >= 8` (deterministic for tests!), returns current celestial state.
  - `getCelestialState()` — returns current pre-allocated celestial state struct.
  - `updateWind(time, out)` — computes cohesive travelling wind vector `{ dirX, dirZ, strength, phase, cloudOffX, cloudOffZ }`, pushes to `Shaders.setWind(...)`.
  - `getWindGust()` — returns live scalar gust intensity (`0.25..1.15`) for Starkeeper's cloak & ambient audio.
  - `initScene(scene, deps)` — pre-allocates and adds once to `scene`:
    1. **Spectral Starfield** (`Points`, 900 High / 450 Balanced via `Shaders.createStarfieldMaterial()`).
    2. **3D Volumetric Cumulus Cloud Deck** (single `InstancedMesh`, 28 cloud banks × 6 puffs = 168 instances High / 14 × 6 = 84 Balanced, wrapping torus around player via `Shaders.createCloudMaterial()`).
    3. **Underwater Volumetric Sunbeams** (16 translucent additive shafts High / 6 Balanced anchored over Sunken Bay & Canyon Oasis spring, hidden when above water or night-dimmed).
    4. **Ambient Biome Motes** (single `InstancedMesh`, 120 motes High / 56 Balanced adapting to `Regions.regionAt(px, pz)` & underwater depth).
  - `setQuality(mode)` — switches `'high'` vs `'balanced'` cleanly by adjusting active draw counts (`mesh.count` / `geometry.setDrawRange`, zero reallocations!).
  - `update(dt, time, ctx)` — zero-GC per-frame update advancing post-8/8 live cycle, wind field, starfield follow + `uStarAlpha`, cloud drift & torus wrap, underwater ray tilt/fade, and biome mote drift.

- [ ] **Step 1: Write the failing test `tests/env.test.mjs`**

Cover:
1. `resolveAssetSource` selects `./assets/env/<key>.glb` on `http:`/`https:` and `./assets/env/<key>.glb.js` on `file:`.
2. `preloadProp` coalesces concurrent requests, parses base64 `.glb.js` in `file:` mode, restyles PBR slots (`Bark` -> `Textures.sets.bark`, `Leaves` -> `Textures.sets.leaves` + `Shaders.patchTreeWind`, `Stone` -> `Textures.sets.stone`), and falls back gracefully when `GLTFLoader` is absent or errors.
3. `registerInstancedSwap` & `registerNodeSwap` hot-swap seamlessly both when registered *before* load completes (deferred callback) and *after* load completes (immediate swap).
4. `computeCelestialState`:
   - At `lit = 0`: `nightFactor > 0.85`, `moonDir.y > 0.45`, `sunDir.y < 0`, `shadowDir` follows `moonDir`, `starAlpha > 0.02`.
   - At `lit = 4`: golden dawn (`sunDir.y > 0`, warm `skyBot`).
   - At `lit = 8, cycleTime = 0`: bright azure day (`sunDir.y > 0.55`, `nightFactor < 0.05`, `starAlpha === 0` — zero daytime ambient stars!).
   - Post-8/8 live cycle (`lit = 8, cycleTime = 360` = half of 720s): smoothly transitions to starlit moonlit night (`moonDir.y > 0.4`, `starAlpha > 0.8`, `shadowDir` aligned to `moonDir`), then returns to sunny day at `cycleTime = 720`!
5. `updateWind` smoothly varies gust strength & direction and syncs `Shaders.setWind`.
6. `initScene`, `setQuality('balanced' | 'high')`, and `update` adjust `count`/`drawRange` cleanly (`stars: 900 -> 450`, `clouds: 168 -> 84`, `motes: 120 -> 56`, `rays: 16 -> 6`), adapt mote palette per biome (`frostpeak` snow, `whisperingForest` fireflies, `canyonOasis` sand, underwater plankton), and pass **runtime + static zero-GC allocation scan** (zero `new THREE.`, `new Map`, `new Set` inside `update`, `updateWind`, `computeCelestialState`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/env.test.mjs`  
Expected: FAIL (`ENOENT: no such file or directory, open '.../env.js'`).

- [ ] **Step 3: Implement `env.js`**

Write `env.js` as a clean IIFE exposing global `Env`:
- Section 0: Pre-allocated scratch vectors/colors/matrices (`_celState`, `_windState`, `_mDummy`, `_mColor`, `_sunV`, `_moonV`, etc.).
- Section 1: Dual-mode GLB prop loader & slot-aware PBR restyler (`SLOT_MATERIAL_MAP` mapping `Bark`/`Wood`/`Trunk` -> `bark`, `Leaves`/`Foliage`/`Needle`/`Leaf`/`Palm` -> `leaves` + `patchTreeWind` or `patchFoliageReactive`, `Snow` -> `snow`, `Stone`/`Rock`/`Brick`/`Arch`/`Column`/`Pedestal` -> `stone`/`rock`, `Moss` -> `forest`, `Flower`/`Berry` -> vivid botanical accent), plus `registerInstancedSwap` & `registerNodeSwap` registries.
- Section 2: `computeCelestialState`, `setSkyProgress`, `getCelestialState` (smooth 3-act story arc + unlocked 720s live cycle after `lit >= 8`, with smooth horizon shadow-handoff damping so shadow intensity fades cleanly through `|sunDir.y| < 0.06`).
- Section 3: Cohesive travelling wind-gust field (`updateWind`, `getWindGust`).
- Section 4: Pre-allocated scene FX rigs (`initScene`, `setQuality`, `update`): Spectral Starfield (`Points`), 3D Volumetric Cumulus Cloud Deck (`InstancedMesh`), Underwater Volumetric Sunbeam Shafts (`Group` of 16 cones), and Ambient Biome Motes (`InstancedMesh` pool of 120).

- [ ] **Step 4: Run test to verify `tests/env.test.mjs` passes**

Run: `node --check env.js && node --test --test-concurrency=1 --test-timeout=5000 tests/env.test.mjs`  
Expected: PASS (100% green).

- [ ] **Step 5: Commit**

```bash
git add env.js tests/env.test.mjs
git commit -m "feat(env): add Env module with dual-mode GLB prop hot-swap, celestial moon/star/cloud rig, wind field, sunbeams, and biome motes"
```

---

### Task 4: World Chunks, Moonlit Shadow Handoff, Expanded Biome Props & GLB Instanced Hot-Swap

**Files:**
- Modify: `world.js`
- Modify: `tests/world-math.test.mjs`

**Interfaces:**
- Consumes: `Env` (optional — guarded with `typeof Env !== 'undefined' && Env`), `Shaders.patchFoliageReactive`, `Shaders.setCelestial`, `Shaders.setWind`.
- Produces:
  - Chunk water mesh resolution `WRES = qualityMode === 'high' ? 24 : 16` (updating cleanly on quality refresh).
  - Expanded chunk biome prop builders (`willow` near water/oasis shores, `palm` in Canyon Oasis, `birch` in meadows, `bush` reactive berry bushes, `fallenLog` & `stump` standable forest debris, `lilypad` floating calmly in shallow sheltered water) — all with procedural fallbacks AND `Env.registerInstancedSwap` hot-swap to loaded CC0 GLBs!
  - Reactive `fern`, `reed`, and `bush` materials patched with `Shaders.patchFoliageReactive()`.
  - `setSkyProgress(lit)` and `updateEnvironment(camY, px, pz, time, dt)` drive `Env` celestial state, smooth Moonlit shadow-light handoff (`sun.position` always `75u` along active `_shadowLightDir`), `Env.update()`, and `Env.setQuality()` in `setQuality()`.

- [ ] **Step 1: Add failing tests in `tests/world-math.test.mjs`**

Add a test `World integrates Env celestial moonlight handoff, reactive bushes/ferns, expanded biome props, and GLB hot-swap safely`:
1. Load `world.js` with mock `Env` (`initScene`, `preloadAll`, `setSkyProgress`, `setQuality`, `update`, `registerInstancedSwap`, `computeCelestialState`) and verify:
   - `Env.initScene(scene, ...)` and `Env.preloadAll(...)` run once at boot.
   - `setSkyProgress(0)` aligns directional shadow light with `moonDir` at exact distance `75u`; `setSkyProgress(8)` aligns with `sunDir` at exact distance `75u`.
   - `setQuality('balanced')` forwards `'balanced'` to `Env.setQuality` and shrinks chunk water grid to `16×16` (vs `24×24` in `'high'`).
   - Built land/shore chunks register instanced prop hot-swaps via `Env.registerInstancedSwap` and include new biome props (`birch`/`willow`/`bush`/`fallenLog`/`stump`/`lilypad`) with valid standable colliders on boulders, logs, and stumps.
   - `updateEnvironment` invokes `Env.update(dt, time, ...)` cleanly.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/world-math.test.mjs`  
Expected: FAIL (`Env.initScene` not called, `WRES` still `16`).

- [ ] **Step 3: Update `world.js`**

- Add lightweight procedural fallback builders (`buildBirchCanopyGeo`, `buildWillowCanopyGeo`, `buildPalmCanopyGeo`, `buildBushGeo`, `buildLogGeo`, `buildStumpGeo`, `buildLilypadGeo`) and register them in `PROPS`, patching `fern`, `reed`, and `bush` with `Shaders.patchFoliageReactive()`.
- Map each prop type to its `Env` CC0 prop key (`tree -> oak_tree`, `birch -> birch_tree`, `pine -> pine_tree`, `pineSnow -> pine_snow`, `willow -> willow_tree`, `palm -> palm_tree`, `cactus -> cactus_flower`, `bush -> bush_berry`, `rock -> boulder_moss`, `fallenLog -> fallen_log`, `stump -> tree_stump`, `lilypad -> lilypad`).
- In `makeInstances(...)`, if `Env` is present and the prop has a GLB key, call `Env.registerInstancedSwap(glbKey, mesh, { chunk, scaleBase, tintBase })` (cleaning up registrations on chunk unload so unloaded chunks never leak memory!).
- Upgrade `buildChunk`: use `const wRes = qualityMode === 'high' ? 24 : 16;` for water tiles, scatter biome-accurate `birch` (meadows), `willow` (shallow shores `WATER_Y + 0.9 .. 3.5`), `palm` (Canyon Oasis & warm beaches), `bush` (meadows & forest edges), `fallenLog` & `stump` (forest with standable colliders!), and `lilypad` (`WATER_Y - 1.4 .. -0.25` in calm coves).
- Wire `Env.initScene(scene, ...)` + `Env.preloadAll(...)` at boot (when `Env` is available, hiding the fallback square `skyStarMat` points so the spectral `ShaderMaterial` starfield takes over cleanly!).
- Wire `Env.setSkyProgress(lit)` + Moonlit shadow-light handoff in `setSkyProgress()` & `updateEnvironment()`, and forward `Env.setQuality(next)` in `setQuality()`.

- [ ] **Step 4: Run test to verify `tests/world-math.test.mjs` passes**

Run: `node --check world.js && node --test --test-concurrency=1 --test-timeout=5000 tests/world-math.test.mjs`  
Expected: PASS (100% green).

- [ ] **Step 5: Commit**

```bash
git add world.js tests/world-math.test.mjs
git commit -m "feat(world): integrate Env celestial moonlight handoff, expanded biome props, 24x24 Gerstner water tiles, and GLB hot-swap"
```

---

### Task 5: Carved PBR Shrines, Lush Hollow Great-Tree & Caustic-Lit Sunken City

**Files:**
- Modify: `regions.js`
- Modify: `tests/regions.test.mjs`

**Interfaces:**
- Consumes: `Shaders.patchUnderwaterCaustics`, `Shaders.patchTreeWind`, `Env.registerNodeSwap` (optional — graceful procedural fallback when `Env` is absent), `Textures.oakLeafCard` / `Textures.sets`.
- Produces:
  - Upgraded `Regions.buildWorldLandmarks(scene, heightAt, terrainNormalAt, textures)`:
    - Zero raw `DodecahedronGeometry` blobs on the Hollow Great-Tree Shrine (replaced with a lush multi-tiered botanical leaf-card canopy + wind-patched foliage material + glowing hanging spirit wisps).
    - Carved stepped stone columns, arches, broken colonnades, and Secret Shrine pedestals wired with `Env.registerNodeSwap` (`ruin_arch`, `ruin_column`, `ruin_column_broken`, `shrine_pedestal`) + sculpted procedural fallbacks.
    - Oasis palm & weeping willow grove + floating lilypads around Canyon Oasis spring (`(-76, -14)`).
    - Glowing carved Star-Rune collars on Star Sanctuary, Sun-Dial Obelisk, Frostpeak Spire, and Secret Shrines (pulsing gently in `animateLandmarks`).
    - `Shaders.patchUnderwaterCaustics()` applied to `sunkenStone` and submerged coral materials so animated underwater sunbeams dance across all Sunken City stonework!
    - Preserves 100% of existing standable colliders (`Star Sanctuary pad`, `pier`, `Sunken Star-Temple`) and orbiting ring clearances.

- [ ] **Step 1: Add failing tests in `tests/regions.test.mjs`**

Add a test `Sub-Project 4 landmarks: botanical Hollow Great-Tree canopy, underwater caustics on Sunken City stone, oasis grove, and carved GLB shrine hot-swaps`:
1. Pass mock `Shaders` tracking `patchUnderwaterCaustics` and `patchTreeWind` calls, and mock `Env` tracking `registerNodeSwap` calls.
2. Assert:
   - Hollow Great-Tree canopy contains **zero** `DodecahedronGeometry` meshes using `leafCanopy` (uses multi-tier botanical foliage cards with `patchTreeWind` instead!).
   - `Shaders.patchUnderwaterCaustics` is called on the Sunken City submerged stonework material.
   - `Env.registerNodeSwap` registers `ruin_arch`, `ruin_column`, `ruin_column_broken`, `shrine_pedestal`, `palm_tree`, and `willow_tree` placements across the 7 regions & 6 secret shrines.
   - All existing standable colliders & ring clearances continue to pass.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/regions.test.mjs`  
Expected: FAIL (Hollow Great-Tree still uses `DodecahedronGeometry`, `patchUnderwaterCaustics` not called, `Env.registerNodeSwap` not called).

- [ ] **Step 3: Upgrade `regions.js`**

- Add `mountSwappableProp(key, fallbackBuilder, x, y, z, ry, targetH, matOverride)` helper that builds the upgraded stepped/carved procedural fallback immediately and registers `Env.registerNodeSwap(key, holder, ...)` when `Env` is present.
- Patch `sunkenStone` and reef coral materials with `Shaders.patchUnderwaterCaustics(mat)` when available.
- Rebuild Hollow Great-Tree Shrine crown with a rich 4-tier botanical leaf-card canopy (`oakLeafCard` alpha-cutout curved boughs + `Shaders.patchTreeWind(mat, true)`) + mossy root collar + warm golden-emerald spirit wisps.
- Upgrade Star Sanctuary arch, Sunlit Ruins intact/broken colonnade, Tidecaller's Arch & Pearl pedestal, wooden pier bollards/rope trim, Canyon Oasis palm/willow/lilypad spring grove, Frostpeak alpine stairs & spire rune collar, Sunken City carved arches/columns, and all 6 Secret Star Shrine carved braziers.

- [ ] **Step 4: Run test to verify `tests/regions.test.mjs` passes**

Run: `node --check regions.js && node --test --test-concurrency=1 --test-timeout=5000 tests/regions.test.mjs`  
Expected: PASS (100% green).

- [ ] **Step 5: Commit**

```bash
git add regions.js tests/regions.test.mjs
git commit -m "feat(regions): upgrade shrines, botanical Hollow Great-Tree canopy, oasis grove, and caustic-lit Sunken City stonework"
```

---

### Task 6: Game & HTML Wiring, Integration Tests & Live Dual-Mode Chrome Verification

**Files:**
- Modify: `index.html` (load `<script src="env.js"></script>` right after `shaders.js`)
- Modify: `game.js` (feed `Env.getWindGust()` into `Shaders.setClothMotion`, expose `Env` on `window.__GAME_DEBUG__`)
- Modify: `tests/game-integration.test.mjs` (load `env.js` in integration harness + add full Sub-Project 4 integration test)

**Interfaces:**
- Consumes: `Env`, `Shaders`, `world.js`, `regions.js`.
- Produces: Full live integration of Sub-Project 4 on both HTTP (GitHub Pages) and `file://`, plus `window.__GAME_DEBUG__.Env`.

- [ ] **Step 1: Add failing integration test in `tests/game-integration.test.mjs`**

1. Update `loadGameHarness()` in `tests/game-integration.test.mjs` to load `env.js` right after `shaders.js` (matching `index.html` load order).
2. Add test `Sub-Project 4 Env wiring: moonlit night -> sunlit day -> live cycle, zero steady-state scene.addCalls, Gerstner buoyancy, and Balanced quality`:
   - Assert `dbg.Env && typeof dbg.Env.update === 'function'`.
   - At `lit = 0`: assert `dbg.Env.getCelestialState().nightFactor > 0.8` and `moonDir.y > 0.4`.
   - Light all 8 totems (`for (let i = 0; i < 8; i++) dbg.lightTotem()`): assert `nightFactor < 0.05`, `starAlpha === 0` (no daytime white square stars!).
   - Advance simulated frames past `8/8`: assert `scene.addCalls` delta === `0` during steady-state ticks and live cycle advances cleanly.
   - Switch `dbg.setQuality('balanced')` and `'high'` cleanly with zero errors.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 --test-timeout=5000 tests/game-integration.test.mjs`  
Expected: FAIL (`dbg.Env` undefined).

- [ ] **Step 3: Wire `index.html` and `game.js`**

- In `index.html`, add `<script src="env.js"></script>` immediately after `<script src="shaders.js"></script>` (before `regions.js` and `world.js`).
- In `game.js`, pass live `Env.getWindGust()` into Starkeeper's cloth wind gust parameter (`Shaders.setClothMotion(..., windGust)`) and expose `Env: typeof Env !== 'undefined' ? Env : null` on `window.__GAME_DEBUG__`.

- [ ] **Step 4: Run complete syntax check & full test suite across ALL test files**

Run:
```bash
for f in *.js; do node --check "$f" || exit 1; done && echo "SYNTAX_OK" && node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs
```
Expected: `SYNTAX_OK` and 100% of all tests passing (`0` failures).

- [ ] **Step 5: Live Dual-Mode Chrome Visual Verification (HTTP + `file://`)**

1. Start temporary local HTTP server (`python3 -m http.server 8768 --bind 127.0.0.1`, daemon).
2. Load `http://127.0.0.1:8768/#test` in Chrome DevTools MCP:
   - Verify **0 console errors** and all 17 `assets/env/*.glb` props loaded cleanly.
   - Capture and inspect a **4-panel visual showcase screenshot**:
     - Panel 1: **Moonlit Night (`0/8`)** — cratered Moon + silver halo, Milky Way ribbon, twinkling spectral stars, moonlit shadows on Star Sanctuary.
     - Panel 2: **Golden Dawn (`4/8`)** — warm Mie horizon glow, rose-amber 3D volumetric cumulus clouds, drifting cloud shadows over hills.
     - Panel 3: **Sunlit Day (`8/8`)** — realistic trees (oak/birch/pine/willow/palm), mossy boulders, carved stone shrines, lush botanical Hollow Great-Tree canopy, zero daytime square star dots!
     - Panel 4: **Gerstner Ocean & Underwater Sunken Bay** — choppy whitecap waves, Starkeeper swim wake ripples, volumetric underwater sunbeams, and animated caustics dancing on submerged Sunken City stone arches.
   - Inspect every panel critically and fix any visual blemishes before finalizing!
3. Navigate to `file:///Users/spencergraham/desktop/other/games/index.html#test` and verify `.glb.js` base64 loading for `Env` (`17/17` props ready), `Animals`, `Enemies`, and `Starkeeper` with **0 console errors**!
4. Park Chrome on `about:blank` and kill the temporary HTTP server.

- [ ] **Step 6: Commit & Push to GitHub Pages**

```bash
git add index.html game.js tests/game-integration.test.mjs
git commit -m "feat(env): wire Sub-Project 4 PBR environment overhaul into game and verify HTTP + file://"
git push origin main
```
Verify GitHub Pages build succeeds (`status: "built"`) so the updated environment is immediately playable on Chromebook!
