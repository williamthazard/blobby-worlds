# World Verisimilitude, Expressive Starkeeper & Anchored Regions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution in this session to keep memory clean) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade *Blobby Worlds: The Starkeeper* to a cohesive stylized-realist environmental & character benchmark (stratified natural cliffs, towering overhead trees with dappled leaf shadows, fine layered meadow grass, winding dirt footpaths, ground ferns/reeds, coastal haze, expressive sculpted Starkeeper face/eyes/hair) while implementing Sub-Project 4 (6 anchored named regions around Star Sanctuary, monumental skyline landmarks, the Sunken Underwater City, Tidecaller's Pearl underwater breathing relic, guided 8-Totem journey, and 6 off-path Secret Star Shrines).

**Architecture:** Introduce one focused zero-GC module (`regions.js`, loaded immediately before `world.js`) that defines deterministic macro geography, trail splines, landmark geometry/colliders, the Sunken Underwater City, Tidecaller's Pearl pedestal, and 6 Secret Star Shrines. Upgrade `textures.js`, `shaders.js`, `world.js`, `models.js`, `physics.js`, `game.js`, and `index.html` cleanly in 6 independently testable tasks.

**Tech Stack:** Vanilla ES2020 JavaScript (zero build step), Three.js r128 CDN, procedural Canvas2D PBR textures & custom GLSL ES 1.00 shaders, Node built-in `node:test` runner (`node --test --test-concurrency=1 --test-timeout=5000`).

## Global Constraints
- Zero-build pure browser (`file://` and static HTTP), zero external image/model/audio assets.
- Three.js r128 compatible: no `CapsuleGeometry`; `InstancedMesh` in world space sets `frustumCulled = false` and `instanceColor.needsUpdate = true`.
- GLSL ES 1.00 / macOS Metal-ANGLE compliant: all `smoothstep(a, b, x)` calls must have `a < b`; no `dFdx`/`dFdy` in custom shaders.
- Under `sRGBEncoding` + `ACESFilmicToneMapping`, `MeshStandardMaterial` hex/vertex colors call `.convertSRGBToLinear()` (guarded for Node mocks); `SKY` / `scene.fog.color` / `scene.background` remain sRGB.
- Zero runtime `scene.add`, `Material`, or `new THREE.Vector3` allocations inside hot `loop()` paths.
- `Textures.init()` must finish cleanly in `< 750ms`.
- Preserve Starkeeper's original celestial-stargazer identity (human ears, midnight-indigo/sea-teal coat, wide-brimmed astronomer hat, crimson cloak, right-hand Star-Lantern Staff).
- No git repository exists in `/Users/spencergraham/desktop/other/games` — do not run `git` commands; verify with `node --check` and `node --test` after every task.

---

### Task 1: Stratified Cliff PBR, Broadleaf Fern Card, and Starkeeper Face & Iris Textures

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/textures.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/textures.test.mjs`

**Interfaces:**
- Produces on `Textures`:
  - Upgraded seamless `Textures.sets.rock` (stratified natural weathered cliff bands + vertical fractures, replacing cobblestone Voronoi grid)
  - Upgraded grounded `Textures.sets.grass` & `Textures.sets.forest` palettes
  - `Textures.fernCard`: 128×128 alpha-cutout broadleaf forest fern & root shrub card (`sRGBEncoding`)
  - `Textures.starkeeperFace`: 256×256 procedural face albedo map (warm cheek/nose/ear subsurface blush, recessed socket tone, sculpted rosy lip tint, subtle skin grain)
  - `Textures.starkeeperIris`: 128×128 procedural radial cerulean-sapphire iris map (dark limbal ring, striated light-catching iris fibers, crisp pupil, dual specular catchlights)

- [ ] **Step 1: Add failing assertions in `tests/textures.test.mjs`** verifying `Textures.fernCard`, `Textures.starkeeperFace`, and `Textures.starkeeperIris` exist with valid `sRGBEncoding` and canvas dimensions, while keeping total `Textures.init()` runtime `< 750ms` and verifying `sets.rock` remains toroidal-seamless.
- [ ] **Step 2: Run `node --test --test-concurrency=1 --test-timeout=5000 tests/textures.test.mjs`** and verify the new assertions fail before implementation.
- [ ] **Step 3: Implement upgrades in `textures.js`:**
  - Rewrite `genRock` to produce realistic **stratified sedimentary/granite cliff strata** (layered warped horizontal bedding planes, anisotropic vertical joint cracks, warm weathered umber-ochre-slate mineral variation, moss crevice tint, high-relief Sobel normals).
  - Refine `genGrass` & `genForest` toward grounded Lake Hylia sunlit olive-emerald & mossy forest soil tones.
  - Add `buildFernCard(size, maxAniso)` (128×128 curved radiating fern fronds + broadleaf cluster with midribs & alpha gaps).
  - Add `buildStarkeeperFaceTex(size, maxAniso)` (256×256 UV-mapped spherical face albedo aligned to Three.js `SphereGeometry` front face at `u = 0.25` / `u = 0.75` or cleanly rotated so front `+Z` is centered at `u = 0.5, v = 0.5`: warm peach-cream base, rose-apricot cheek & nose-tip blush, gentle brow/socket shading, soft natural rose-coral upper/lower lip shading, warm neck/chin shading).
  - Add `buildStarkeeperIrisTex(size, maxAniso)` (128×128 high-detail anime-realist eye texture with dark navy limbal ring, luminous radial cerulean-azure iris fibers, lower-crescent sky bounce light, deep pupil, and crisp primary + secondary white catchlights).
  - Expose `fernCard`, `starkeeperFace`, `starkeeperIris` on `Textures` API.
- [ ] **Step 4: Run `node --check textures.js && node --test --test-concurrency=1 --test-timeout=5000 tests/textures.test.mjs`** and confirm all tests pass cleanly under `< 750ms`.

---

### Task 2: Expressive Sculpted Starkeeper Face, Blinking/Furrowing Eyes, Layered Hair & Outfit Detail

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/models.js`
- Modify: `/Users/spencergraham/desktop/other/games/physics.js` (blink + combat brow animation inside `animatePlayerRig`)
- Test: `/Users/spencergraham/desktop/other/games/tests/models.test.mjs`

**Interfaces:**
- Consumes: `Textures.starkeeperFace`, `Textures.starkeeperIris`, `Textures.sets.cloth`, `Textures.sets.leather`
- Produces on `player.userData`:
  - Preserves all existing rig refs (`pelvis`, `torso`, `headGroup`, `thighL/R`, `kneeL/R`, `ankleL/R`, `armL/R`, `elbowL/R`, `staffPivot`, `staffHalo`, `staffLight`, `capeSegs`, `hatGroup`, `hatTipStar`, `hatStarGlow`)
  - Adds `eyelidL`, `eyelidR`, `browL`, `browR`, `pearlAura` (optional underwater breathing relic glow orb around staff/collar, `visible = false` until relic claimed!)

- [ ] **Step 1: Add failing assertions in `tests/models.test.mjs`** verifying `Models.makePlayer()` exposes `eyelidL`, `eyelidR`, `browL`, `browR`, and `pearlAura` inside `userData`, parents all eyes/eyelids/brows/hair/ears/hat strictly inside `headGroup`, uses sculpted head geometry (`>= 24×18` segments), and passes shadow-consistency checks.
- [ ] **Step 2: Run `node --test --test-concurrency=1 --test-timeout=5000 tests/models.test.mjs`** and verify failure.
- [ ] **Step 3: Upgrade `Models.makePlayer()` in `models.js`:**
  - Add `sculptStarkeeperHeadGeo()` vertex sculptor on `SphereGeometry(0.205, 28, 22)` rotated so UV `u = 0.5` faces `+Z`: sculpt soft rounded cheeks, gentle brow ridge, recessed eye sockets, defined jawline & tapered chin, delicate sculpted nose bridge + upturned nose tip, subtle philtrum groove, and gently raised upper/lower lip contours. Apply `Textures.starkeeperFace` to `faceSkin` material!
  - Build dedicated `buildStarkeeperEyes(headGroup, s)`: curved glossy white sclera nested inside the recessed eye sockets, slightly proud textured iris discs/domes mapped with `Textures.starkeeperIris` (with `roughness: 0.12` glossy specular sheen), sculpted curved dark upper lash-line rims + delicate lower lid line, upper blinking eyelid caps (`eyelidL`, `eyelidR`), and sculpted tapered arched eyebrows (`browL`, `browR`).
  - Upgrade Starkeeper's hair beneath the astronomer hat brim to **11 individually sculpted tapered curved bangs, temple sideburns, and back locks** framing the forehead & cheeks naturally (using combed dark-chestnut hair material) while preserving human rounded ears with sculpted inner concha shade.
  - Refine torso coat lapels, gold filigree collar trim, stitched diagonal cross-strap with embossed brass buckle ring, and add hidden `pearlAura` glow halo on `staffPivot` (activated when `P.hasBreathRelic && P.swimming`).
- [ ] **Step 4: Wire natural periodic blinking & expressive brow focus in `physics.js` `animatePlayerRig()`:**
  - Periodic blink cycle every `~4.2s` (`0.14s` smooth close-and-open on `eyelidL`/`eyelidR`).
  - Subtle expressive brow tilt (`browL`/`browR` gently neutral/curious when exploring, subtly lowered & angled in determined focus during `P.meleeT > 0 || lockTarget`).
  - Toggle `pearlAura.visible = !!(P.hasBreathRelic && P.swimming)` with gentle pulse.
- [ ] **Step 5: Run `node --check models.js && node --check physics.js && node --test --test-concurrency=1 --test-timeout=5000 tests/models.test.mjs tests/physics.test.mjs`** and confirm all pass.

---

### Task 3: Anchored 6-Region World Geography, Trails, Skyline Landmarks, Sunken City & Secrets (`regions.js`)

**Files:**
- Create: `/Users/spencergraham/desktop/other/games/regions.js`
- Create: `/Users/spencergraham/desktop/other/games/tests/regions.test.mjs`

**Interfaces:**
- Produces global `Regions`:
  - `Regions.LIST`: 7 region descriptors (`sanctuary`, `sunlitRuins`, `whisperingForest`, `twilightCoast`, `canyonOasis`, `frostpeak`, `sunkenCity`) with `id`, `name`, `subtitle`, `x`, `z`, `radius`
  - `Regions.TOTEM_ROUTE`: 8 ordered `{ x, z, regionId, title, hint, underwater }` coordinates culminating in Sunken Star-Temple (Totem 5) and Frostpeak Summit (Totem 8)
  - `Regions.RELIC_SITE`: `{ x: 64, z: 70, name: "Tidecaller's Pearl", regionId: 'twilightCoast' }`
  - `Regions.SECRETS`: 6 off-path Secret Star Shrine definitions `{ id, name, regionId, x, z, underwater }`
  - `Regions.getElevationMod(x, z, baseH)`: deterministic zero-GC heightfield sculpting for Sanctuary hilltop, Sunlit Ruins meadows, Whispering Forest knoll, Twilight Basalt Coast sheer cliff + cove, Canyon Oasis terraced mesa + spring pool, Frostpeak walkable alpine ascent + glacial tarn, and Sunken Underwater City deep turquoise bay (`-10.5u..-13.5u`), smoothly blending back to procedural `baseH` over `r = 145..195u`
  - `Regions.getClimateMod(x, z, out)`: overrides/blends `{ desert, snow, forest, meadow }` cleanly inside anchored regions
  - `Regions.getTrailWeight(x, z)`: returns `0..1` worn dirt footpath intensity along the 5 radiating trails from `(0, 0)`
  - `Regions.regionAt(x, z)`: returns current region descriptor (or outer Wilds descriptor beyond `145u`)
  - `Regions.getNearbyColliders(x, z, radius, out)`: zero-GC spatial query returning height-aware `{ x, z, r, topY, standable }` colliders for landmark pillars, wooden pier decks, temple stairs, and arch footings
  - `Regions.buildWorldLandmarks(scene, heightAt, terrainNormalAt, textures)`: constructs all monumental skyline landmarks, Star Sanctuary stone compass plaza & arch, Sunlit Ruins colonnades + 14u Sun-Dial Obelisk, Whispering Forest 18u Hollow Great-Tree Shrine, Twilight Basalt Coast wooden pier + Tidecaller's Arch + interactive `relicObj` (Tidecaller's Pearl pedestal), Canyon Oasis 16u Natural Sandstone Arch + Sandstone Sun-Gate, Frostpeak rune-stone steps + 18u Summit Star-Spire, **Sunken Underwater City** (coral-encrusted colonnade arches, bioluminescent kelp avenues, sea-lantern plazas, stepped Sunken Star-Temple), and 6 interactive `secretObjs` braziers; returns `{ group, relicObj, secretObjs, animated }` for lightweight zero-GC animation in `game.js`.

- [ ] **Step 1: Write `tests/regions.test.mjs`** testing all pure math & landmark contracts: deterministic elevations at every region center (Sanctuary flat `~6.2u`, Twilight Coast high headland + beach cove, Canyon Oasis pool `< 0` surrounded by mesa `> 9u`, Frostpeak summit `> 16u`, Sunken City bay floor `-10u..-13.5u`), walkable trail slopes (`< 36°` along Sunlit Ruins & Frostpeak trails), `getTrailWeight` peaking on paths and zero off-path, `regionAt` identification, outer procedural blend (`r > 200u` returns `baseH` unchanged), `TOTEM_ROUTE` length `8`, `SECRETS` length `6`, and `buildWorldLandmarks` populating height-aware `standable` colliders with zero `NaN`s.
- [ ] **Step 2: Run `node --test --test-concurrency=1 --test-timeout=5000 tests/regions.test.mjs`** and confirm failure (`regions.js` missing).
- [ ] **Step 3: Implement `/Users/spencergraham/desktop/other/games/regions.js`** cleanly using cached geometries, merged static temple/arch meshes, shared PBR stone/wood/coral/emissive materials (properly linearized), and zero-GC runtime helpers.
- [ ] **Step 4: Run `node --check regions.js && node --test --test-concurrency=1 --test-timeout=5000 tests/regions.test.mjs`** and confirm all pass.

---

### Task 4: Terrain/Water/Lighting Realism, Towering Overhead Trees, Fine Grass & Ground-Dressing

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/shaders.js`
- Modify: `/Users/spencergraham/desktop/other/games/world.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/shaders.test.mjs`
- Test: `/Users/spencergraham/desktop/other/games/tests/world-math.test.mjs`

**Interfaces:**
- Consumes: `Regions` (guarded with `typeof Regions !== 'undefined'`), `Textures.fernCard`, `Textures.sets.rock`, `Textures.oakLeafCard`, `Textures.pineBoughCard`, `Textures.pineSnowBoughCard`
- Produces:
  - `world.js` integrates `Regions.getElevationMod`, `Regions.getClimateMod`, `Regions.getTrailWeight`, `Regions.getNearbyColliders`, and calls `Regions.buildWorldLandmarks(...)` at world init (exposing `worldLandmarks` global).
  - Towering `9.5–14.5u` oak & pine geometry + dappled alpha-cutout shadows + fine sleek 9-blade ankle/shin grass + chunk-instanced root ferns/shrubs & shoreline reeds.
  - Upgraded terrain shader (stratified cliff triplanar scale, damp shoreline darkening, mossy cliff tops), clearer turquoise-emerald water shader with crisp shoreline foam, and sunlit high-contrast lighting + soft coastal blue-teal fog (`fogNear = 44, fogFar = 162` at day so distant skyline landmarks silhouette gracefully!).

- [ ] **Step 1: Add/update assertions in `tests/shaders.test.mjs` and `tests/world-math.test.mjs`** covering fine grass tuft UV/geometry invariants, towering tree collider heights (`topY > 6.0`), fern/reed instanced props, and terrain/water shader smoothstep & wet-shore checks.
- [ ] **Step 2: Upgrade `shaders.js`:**
  - Enhance terrain fragment shader: richer stratified horizontal cliff projection (`cliffUv` aspect tuned for wide horizontal sedimentary bands), damp darkened shoreline band (`0..0.85u` above `WATER_Y`), and mossy cliff-top edge blending.
  - Enhance water fragment shader: clearer turquoise-emerald shallow/mid transmission (`depthCol` tuned so the Sunken Underwater City arches & lanterns gleam alluringly through the surface!), plus livelier white coastal foam along beaches and cliffs.
  - Add subtle breeze flutter on `fernMat` / `reedMat` using `patchTreeWind` or `createKelpMaterial`-style lightweight wind sway.
- [ ] **Step 3: Upgrade `world.js`:**
  - Wire `Regions.getElevationMod`, `Regions.getClimateMod`, `Regions.getTrailWeight`, `Regions.getNearbyColliders` cleanly (guarded by `typeof Regions !== 'undefined'`).
  - Ground `PAL` meadow/forest/dirt/rock tones toward the natural Lake Hylia palette and blend worn compacted dirt footpaths (`PAL.dirt`) wherever `trailWeight > 0`.
  - Upgrade `SKY` daytime palette & lighting contrast (`sun.intensity` up to `1.82` at full day vs. grounded `hemiLight` `0.62`, extended `SUN_SHADOW_SPAN = 92` so tall overhead tree canopies cast sweeping dappled shadows across the meadow, coastal blue-teal horizon haze `fogNear = 44, fogFar = 165` above water, preserving the dramatic starless midnight opening at `0/8`!).
  - Rebuild `buildFlaredTrunkGeo`, `buildOakCanopyGeo`, and `buildPineCanopyGeo` at towering realistic proportions (`9.5–14u` mature height, slender realistic trunks, 5 high spreading boughs, 40+ curved leaf-sprig / 7-whorl pine-bough fronds casting dappled alpha-cutout shadows, with ~20% young saplings `0.42–0.65` scale).
  - Refine `buildGrassTuftGeo()` into a sleek **9-blade ankle-to-shin tapered meadow cluster** (`0.36–0.62u` tall, slender arching blades) and suppress grass/trees/rocks inside worn dirt footpaths (`trailWeight > 0.42`).
  - Add chunk-instanced **broadleaf root ferns/shrubs** (`PROPS.fern` hugging tree bases & forest floors) and **shoreline reeds** (`PROPS.reed` along shallow water margins).
  - Call `Regions.buildWorldLandmarks(scene, heightAt, terrainNormalAt, Textures)` at world startup and export `worldLandmarks`.
- [ ] **Step 4: Run `node --check shaders.js && node --check world.js && node --test --test-concurrency=1 --test-timeout=5000 tests/shaders.test.mjs tests/world-math.test.mjs tests/regions.test.mjs`** and verify all pass.

---

### Task 5: Tidecaller's Pearl Relic, Region Banners, Guided 8-Totem Route, Secret Shrines & Ambient Motes

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/index.html`
- Modify: `/Users/spencergraham/desktop/other/games/physics.js`
- Modify: `/Users/spencergraham/desktop/other/games/game.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/physics.test.mjs`
- Test: `/Users/spencergraham/desktop/other/games/tests/game-integration.test.mjs`

**Interfaces:**
- Consumes: `Regions` (`regionAt`, `TOTEM_ROUTE`, `RELIC_SITE`, `SECRETS`), `worldLandmarks` (`relicObj`, `secretObjs`, `animated`)
- Produces:
  - `Physics.P.hasBreathRelic` (boolean, default `false`): grants infinite underwater air + `1.25×` agile underwater swim speed + zero drowning damage
  - `index.html`: loads `regions.js` right before `world.js`; adds `#regionBanner`, `#regionPill`, `#secretCount`, and `#relicBadge` HUD elements
  - `game.js`: spawns Starkeeper at Star Sanctuary `(0, 0)`, updates region banner cleanly on region entry, spawns Star Totems along `Regions.TOTEM_ROUTE` (supporting underwater Sunken Star-Temple Totem 5!), detects claiming **Tidecaller's Pearl** & discovering **6 Secret Star Shrines**, animates landmark crystals/lanterns & ambient meadow pollen / forest firefly motes via existing zero-GC particle pool, and exposes `claimBreathRelic`, `secretsFound`, `currentRegion`, and `worldLandmarks` on `window.__GAME_DEBUG__`.

- [ ] **Step 1: Add failing tests in `tests/physics.test.mjs` and `tests/game-integration.test.mjs`:**
  - `tests/physics.test.mjs`: test `P.hasBreathRelic = true` keeps `P.air === AIR_MAX` deeply submerged, prevents drowning callbacks, and increases underwater swim speed.
  - `tests/game-integration.test.mjs`: update expected script order in `index.html` to include `regions.js`, load `regions.js` in `loadGameHarness`, and test region banner transitions, guided Totem route spawning (including underwater Totem 5), claiming Tidecaller's Pearl at `RELIC_SITE`, discovering Secret Star Shrines (`Secrets 1/6`), and zero runtime `scene.add`/`Vector3` allocations.
- [ ] **Step 2: Run `node --test --test-concurrency=1 --test-timeout=5000 tests/physics.test.mjs tests/game-integration.test.mjs`** and confirm the new tests fail.
- [ ] **Step 3: Implement `physics.js` breathing relic mechanics:**
  - Add `hasBreathRelic: false` on `P`.
  - When `P.hasBreathRelic` is true underwater: hold `P.air = AIR_MAX` (never drain, never fire `onDrownDamage`), multiply `SWIM_SPEED` / `SWIM_SPRINT_SPEED` by `1.25` for exhilarating deep Sunken City exploration!
- [ ] **Step 4: Implement `index.html` HUD & script tag:**
  - Add `<script src="regions.js"></script>` right before `world.js`.
  - Add compact `Secrets 0/6` pill, subtle `#regionPill` top-center/left indicator, `#relicBadge` aqua Tidecaller's Pearl badge (shown once claimed), and atmospheric Zelda-style `#regionBanner` (large serif/clean title + subtitle with smooth CSS fade).
- [ ] **Step 5: Implement `game.js` region loop, guided Totems, Tidecaller's Pearl, Secret Shrines & ambient motes:**
  - Spawn `home` right at Star Sanctuary `(0, 0)` (falling back to search only if `Regions` absent).
  - Route `spawnTotem()` through `Regions.TOTEM_ROUTE[lit]` (preserving underwater elevation for Totem 5 at the Sunken Star-Temple so its tall golden light beam pierces straight up through the turquoise bay!).
  - Add `updateRegionsAndDiscovery(dt, nowTime)`: region entry detection + `#regionBanner` toast, Tidecaller's Pearl proximity pickup (`dist < 2.6u`), 6 Secret Shrine discoveries (`dist < 3.0u` -> permanent brazier ignite + +5 stars + full heal + `Secrets X/6`), animated spinning temple crystals/kelp lanterns, and gentle pooled sunlit pollen / emerald forest firefly motes (zero runtime allocations!).
  - Spawn aquatic critters (`AQUA`: `Seafoam Fin`, `Coral Dart`, `Moon Jelly`, `Kelp Eel`) swimming gracefully through the Sunken Underwater City arches!
- [ ] **Step 6: Run full syntax check + all 8 test suites:**
  `node --check textures.js && node --check shaders.js && node --check regions.js && node --check world.js && node --check models.js && node --check physics.js && node --check game.js && node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs`
  Expected: ALL tests across all 8 suites PASS.

---

### Task 6: Live Chrome Visual, Lighting, Sunken City & Performance Verification

**Files:**
- Inspect live browser rendering via Chrome DevTools MCP (temporary HTTP server, parked cleanly on `about:blank` + server killed right after).

- [ ] **Step 1: Verify zero WebGL/console errors and check FPS/draw-call budgets** in both `High` and `Balanced` presets.
- [ ] **Step 2: Visually inspect screenshots of 5 key views:**
  1. Close-up of **Starkeeper's sculpted face, glossy radial eyes, layered bangs, and outfit**.
  2. **Star Sanctuary -> Sunlit Ruins meadow** at full day (`8/8`): towering `10–14u` trees with dappled leaf shadows, fine layered grass, winding dirt path, stratified cliffs, and skyline landmarks on the horizon.
  3. **Whispering Deep Forest** with towering oaks/pines, root ferns, Great-Tree Shrine, and emerald fireflies.
  4. **Twilight Basalt Coast** stratified cliffs, wooden pier, shoreline reeds, and **Tidecaller's Pearl** overlooking the turquoise Sunken Bay.
  5. **Sunken Underwater City** dive with Tidecaller's Pearl claimed: coral arches, bioluminescent kelp avenues, Sunken Star-Temple, and swimming sea creatures.
- [ ] **Step 3: Fix any visual or lighting polish items caught in screenshots**, re-run full syntax & test suite (`verification-before-completion`), park Chrome on `about:blank`, and kill the temporary HTTP server.
