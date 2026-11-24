# Sub-Project 4: PBR Realistic Nature Environment, Sky & World Physics Overhaul — Design Spec

**Date:** 2026-11-24  
**Status:** Draft for user review  
**Target Game:** Blobby Worlds: The Starkeeper (zero-build Three.js r128, dual-mode GitHub Pages HTTPS + double-click `file://`, High/Balanced Chromebook performance toggle)

---

## 1. Goals & Design Principles

Elevate every environmental layer of Blobby Worlds — **sky, moon, sun, stars, clouds, ocean water, hills/terrain, grass/foliage, trees/rocks, shrines/landmarks, and wind/water physics** — to a cohesive **PBR Realistic Nature** standard that matches the fidelity of our skinned Starkeeper, Living Animals, and Shadow Beasts, while laying the optical foundation for Sub-Project 5's Deep Sunken City.

### Non-Negotiable Constraints
1. **Zero-build dual-mode compatibility:** Must work identically on GitHub Pages (`https://williamthazard.github.io/blobby-worlds/`) via binary `.glb` fetches AND local `file://` double-click via `.glb.js` base64 script bundles.
2. **Strict zero-GC hot loops:** All per-frame updates in `env.js`, `shaders.js`, `world.js`, and `regions.js` reuse pre-allocated vectors, colors, matrices, and pools — zero runtime `new THREE.*` or `scene.add` allocations during gameplay.
3. **Graceful procedural fallback:** If `GLTFLoader` is missing, offline, or fails in headless tests, every tree, rock, bush, and shrine renders cleanly with upgraded procedural geometry and PBR materials with zero console errors.
4. **Chromebook-friendly quality scaling:** `Quality: High` delivers full visual richness; `Quality: Balanced` scales stars, cumulus clouds, ambient motes, grass density, underwater sunbeam shafts, and shadow resolution (`1024px`) smoothly with zero visual breakage.
5. **100% CC0 1.0 Public Domain provenance:** Every external environment `.glb` comes from verified CC0 1.0 Quaternius packs (`nature_pack`, `modular_dungeon_1`, `modular_dungeon_pack`), credited in `assets/LICENSE-CC0.txt`. No emojis anywhere in game UI strings.

---

## 2. Architecture & Module Boundaries

Following the proven modular pattern established by `animals.js` and `enemies.js`:

| File | Responsibility |
|---|---|
| `scripts/build_env_glb.py` | Compiles **17** curated CC0 1.0 nature & ruin `.glb` + `.glb.js` bundles under `assets/env/` with crease-aware smooth normals, generated cylindrical/triplanar UVs where absent, canonical `minY = 0` grounding, and separated material slots (`Bark`/`Wood`, `Leaves`/`Needles`, `Snow`, `Stone`, `Moss`, `Flower`). |
| `env.js` *(new global `Env`)* | Dual-mode prop loader + registry (`Env.preloadProp`, `Env.getProp`, `Env.onPropReady`), `InstancedMesh` hot-swap helpers, **Celestial Rig** (cratered Moon, twinkling spectral starfield, 3D multi-scatter volumetric cumulus cloud deck, post-8/8 gentle live Day/Sunset/Moonlit cycle), **Cohesive Wind-Gust Field**, **Underwater Volumetric Sunbeams**, and **Zero-GC Pooled Ambient Biome Motes**. |
| `textures.js` | Upgraded realistic PBR texture synthesizers (`grass`, `forest`, `rock`, `stone`, `bark`, `sand`, `snow`, `waterNormal` with sharper normal relief and organic moss/bark/fissure micro-detail) + crisper **512px** botanical alpha-cutout foliage cards (`oakLeafCard`, `pineBoughCard`, `pineSnowBoughCard`, `fernCard`) within a `< 500 ms` startup budget. |
| `shaders.js` | Shared new uniforms (`uMoonDir`, `uMoonColor`, `uNightFactor`, `uWindVec`, `uCloudOffset`), upgraded Rayleigh/Mie sky dome with procedural cratered Moon, Milky Way galactic band, and cirrus layer; **4-wave synchronized Gerstner ocean** (`waterHeightAt` JS/GLSL parity + whitecaps + `uTramplers` swim wake ripples); reusable `patchUnderwaterCaustics(mat)`; multi-scale anti-tiling PBR terrain with moss/snow ledge caps, projected drifting cloud shadows, and seamless horizon turf sheen; backlit grass + reactive fern/bush/reed proximity bending. |
| `world.js` | Integrates `Env` celestial rig, moonlit shadow-light handoff at night, shared wind vector updates, biome-expanded chunk prop distribution (willows near shores/oasis, palms in Canyon Oasis, birches in meadows, mossy logs/stumps/boulders, floating lilypads), instant procedural-to-GLB `InstancedMesh` hot-swap, and `setQuality('high' | 'balanced')` sync to `Env.setQuality()`. |
| `regions.js` | Upgrades all 7 regional landmarks & 6 Secret Shrines with carved PBR stone architecture (`ruin_arch`, `ruin_column`, `ruin_column_broken`, `shrine_pedestal` with procedural stepped fallbacks), weathered moss/snow gradients, pulsing Star-Rune inlays, lush multi-tiered Hollow Great-Tree canopy (replacing faceted dodecahedron blobs), oasis palms & willows, and `Shaders.patchUnderwaterCaustics()` on all submerged Sunken City stonework. |
| `index.html` & `game.js` | Loads `<script src="env.js"></script>` right after `shaders.js` (before `regions.js` / `world.js`), feeds `Env.getWindGust()` into Starkeeper's cloak motion, updates `Env.update()` each frame, and exposes `Env` on `window.__GAME_DEBUG__`. |

---

## 3. Detailed Subsystem Specifications

### 3.1 Celestial Sky, Cratered Moon, Sun, Spectral Starfield & Volumetric Clouds

1. **Dual-Mode Celestial Arc (`Env.computeCelestialState(lit, cycleTime)`):**
   - **Story-Arc Phase (`lit < 8`):** Deterministic progression driven directly by `lit / 8` (preserving all existing tests):
     - `0/8` (Midnight Moonlit Gloom): Sun well below horizon (`sunElev = -0.35`), **Moon high overhead (`moonElev = +0.62`)** casting cool silver-indigo directional moonlight (`#8ab4f0`, intensity `0.58`) with real ground shadows.
     - `4/8` (Rose-Amber Dawn Break): Sun crests eastern horizon (`sunElev = +0.12`) with rich warm Mie scatter; Moon sets opposite in the west.
     - `8/8` (Radiant Azure Day): Sun rides high (`sunElev = +0.66`, `#fff1cc`, intensity `1.85`); Moon sits faint/low opposite.
   - **Unlocked Gentle Live Cycle (`lit >= 8`):** Once all 8 totems are relit, `Env` begins advancing `cyclePhase` via live `dt` at `1 / 720` rev/sec (**12-minute full day**), starting at bright late-morning (`cyclePhase = 0` -> sunny Day for ~4 minutes -> warm Golden Sunset -> Starlit Moonlit Night -> Rose Dawn -> Day). Calling `setSkyProgress(8)` deterministically initializes `cyclePhase = 0` (bright azure day) so unit/integration tests remain 100% deterministic.
   - **Seamless Shadow-Light Handoff:** `world.js` smoothly directs the shadow-casting `DirectionalLight` along `uSunDir` when `sunDir.y > 0.04` and hands off to `uMoonDir` when night falls, ramping directional intensity down cleanly through the horizon crossover (`|sunDir.y| < 0.06`) so shadows never snap abruptly.

2. **Realistic Sky Dome (`_SKY_FRAG` in `shaders.js`):**
   - **Rayleigh + Mie Atmosphere:** Physically-inspired zenith-to-horizon Rayleigh gradient, Mie forward-scatter solar aureole (`pow(sunDot, 7)` + `pow(sunDot, 48)` + crisp solar disc + subtle horizon crepuscular band).
   - **Procedural Cratered Moon:** Rendered cleanly at `uMoonDir` (`moonDot > 0.9965` disc + soft silver Mie corona). Surface shading combines low-frequency dark basaltic maria noise + high-frequency circular crater relief + Lambertian phase lighting from `uSunDir`, washed out naturally by daytime sky brightness (`nightMask`).
   - **Milky Way Galactic Ribbon:** Subtle tilted procedural galactic dust band (`fbm2` warped along a celestial equator plane) visible strictly at night (`nightMask * starVisibility`) and scaling with relit constellations.
   - **High Cirrus Cloud Layer:** Delicate windswept ice-crystal streaks drifting across the upper sky dome synced to `uCloudOffset`.

3. **Twinkling Spectral Starfield (`Env.createStarfield()`):**
   - Replaces `world.js`'s raw square `PointsMaterial` pixels with a custom `ShaderMaterial` `Points` geometry (**900 stars High / 450 Balanced**):
     - Smooth circular Airy-disc falloff (`gl_PointCoord`) + crisp 4-point diffraction cross on the brightest ~12% magnitude-1 stars.
     - Per-star attributes: `aSize`, `aPhase`, `aTwinkleSpeed`, `aColor` (realistic O/B/A/F/G/K/M spectral tints from ice-blue `#b8d8ff` to warm gold `#ffe2a8` and pale amber `#ffbe8c`).
     - **True daylight visibility fade:** `uStarAlpha` smoothly fades ambient stars to `0.0` in bright daylight (eliminating daytime white squares!) while `skyConstellations` keep a subtle luminous celestial filigree (`opacity = 0.22` in day, `0.95` at night).

4. **3D Multi-Scatter Volumetric Cumulus Clouds (`Env.createCloudDeck()`):**
   - **28 drifting cumulus cloud banks in High / 14 in Balanced** placed at `y = 68..96u` in a `340u` wrapping torus around the player (zero pop-in, zero GC).
   - Each cloud bank consists of 5–9 organically clustered soft-normal icosphere puffs rendered via a **single `InstancedMesh`** with a custom r128 `ShaderMaterial`:
     - Soft world-height + normal-based multi-scattering lighting: bright sunlit cream tops, **Henyey-Greenstein forward-scattered silver linings** facing `uSunDir`/`uMoonDir`, cool atmospheric sky-blue mid-shadows, and soft indigo/rose-amber underbellies at night/dawn/sunset.
     - Gentle internal billow vertex breathing + world-space wrapping synced to `uWindVec`.
   - **Projected Ground Cloud Shadows:** Both `_TERRAIN_FRAG` and `_GRASS_FRAG` evaluate a fast matching 2-octave scrolling cloud-shadow mask (`uCloudOffset`) that dims direct sunlight by `18–26%` as cloud banks drift overhead!

---

### 3.2 Synchronized 4-Wave Gerstner Ocean, Swim Wakes & Underwater Optics

1. **4-Wave Synchronized Gerstner Ocean (`_WATER_VERT` & `Shaders.waterHeightAt`):**
   - Exact shared wave table (4 directional swells: long SW ocean swell, cross SE swell, mid coastal chop, crisp wind-aligned ripple):
     - `W1`: dir `(0.86, 0.51)`, `k = 0.16`, `amp = 0.11`, `speed = 1.25`, `Q = 0.34`
     - `W2`: dir `(-0.48, 0.88)`, `k = 0.27`, `amp = 0.068`, `speed = 1.55`, `Q = 0.30`
     - `W3`: dir `(0.34, -0.94)`, `k = 0.48`, `amp = 0.036`, `speed = 2.05`, `Q = 0.24`
     - `W4`: dir `(-0.82, -0.57)`, `k = 0.78`, `amp = 0.018`, `speed = 2.65`, `Q = 0.18`
   - **Shore Damping (`shoreDamp = smoothstep(0.05, 1.35, max(uWaterY - aBedHeight, 0.0))`):** Dampens horizontal/vertical chop smoothly in ultra-shallow water so beaches, reeds, lilypads, and wooden pier pilings stay crisp without z-clipping, while open ocean swells reach realistic `~0.23m` crest-to-trough chop!
   - **Exact JS <-> GLSL Parity:** `Shaders.waterHeightAt(x, z, time, bedHeight)` evaluates the same 4-wave vertical profile (defaulting to full open-water swell when `bedHeight` is omitted) so Starkeeper swimming buoyancy (`physics.js`) and floating companions (`animals.js`) bob in lockstep with the rendered waves!
   - **Chunk Water Resolution:** Increase chunk water tile grid `WRES` from `16` to `24` (High) / `16` (Balanced) so Gerstner crests curve smoothly.

2. **Optical Water Surface Shading & Dynamic Swim Wakes (`_WATER_FRAG`):**
   - **Analytical Gerstner Normals** blended with **2 scrolling high-detail micro-normal maps** (`uWaterNormal`, speed modulated by `uWindVec`).
   - **Schlick Fresnel (`F0 = 0.02`)** reflecting dynamic sky gradient + sun/moon specular glints (golden sun glitter by day, cool silver moon-path shimmer across dark waves at night!).
   - **Beer-Lambert Optical Absorption:** Clear luminous turquoise over sunlit sandy shallows -> emerald mid-depths -> deep pelagic sapphire in Sunken Bay.
   - **Whitecap Crest Foam + Shoreline Surge:** Steep Gerstner wave crests (`vCrest > 0.55`) blossom with lacy wind-driven whitecap foam; shorelines render dual-band animated run-up foam.
   - **GPU Swim Wake & Splash Ripples:** Directly inside `_WATER_FRAG`, check `uPlayerPos` and `uTramplers[16]` when within `|y - uWaterY| < 1.85`: generate expanding concentric wave rings (`sin(dist * 7.5 - uTime * 6.5) * exp(-dist * 0.72)`) that both perturb surface normals AND add crisp frothy ring highlights around Starkeeper and swimming animals — zero extra draw calls or GC!

3. **Underwater Optics (`env.js` & `shaders.js`):**
   - **Volumetric Underwater Sunbeams (`Env.createUnderwaterRays()`):** 16 pre-allocated additive translucent light-shaft cones (High; 6 in Balanced) anchored across Sunken Bay (`(-14, 72..100)`) and the Canyon Oasis spring (`(-76, -14)`), dynamically tilted along `uSunDir`/`uMoonDir`, shimmering gently and fading cleanly by depth & underwater camera state (`camY < WATER_Y + 0.4`).
   - **Reusable Underwater Caustics (`Shaders.patchUnderwaterCaustics(mat)`):** Applies animated dual-layer interference caustics + depth attenuation to ANY `MeshStandardMaterial` below `uWaterY`, wired onto all submerged Sunken City stone arches, temple columns, coral, and boulders in `regions.js` (and ready for Sub-Project 5!).

---

### 3.3 PBR Terrain, Cohesive Wind Physics & Curated CC0 GLB Nature Props

1. **Higher-Detail PBR Textures (`textures.js`):**
   - Keep core tileable PBR sets at `256x256` with enhanced multi-octave relief, deeper Sobel normal strength, bark ridge crevices, stratified fractured cliff beds, weathered mortar/moss stone seams, and high-frequency water ripples.
   - Upgrade botanical alpha-cutout foliage cards (`oakLeafCard`, `pineBoughCard`, `pineSnowBoughCard`, `fernCard`) to **512×512** with layered leaf depth shading, darker shadowed undersides, bright sunlit outer margins, fine venation, and natural silhouette irregularity — still synthesized procedurally in `< 120 ms` total!

2. **PBR Terrain & Reactive Grass/Bushes (`shaders.js`, `world.js`):**
   - **3-Scale Anti-Tiling Detail + Macro Color Variation:** Combine fine (`0.16`), medium (`0.042`), and macro (`0.011`) world-space texture modulation so rolling hills stay rich and natural up close and from afar.
   - **Stratified Cliffs + Slope Moss/Snow Caps:** Steep slopes (`tSlope > 0.22`) blend triplanar cliff rock with stronger normal relief and darkened fracture fissures; gentle ledges on rock faces collect subtle green moss (below snowline) or crisp frost/snow (above `y > 11.5u` or snow biome).
   - **Projected Cloud Shadows:** Fast scrolling world-space cloud shadow field synced to `uCloudOffset` sweeps organically over hills, meadows, and cliffs.
   - **Seamless Turf-to-Horizon Sheen:** Blend subtle warm sun-rim sheen and travelling wind-wave luminance ripples onto meadow terrain beyond `48u` so the `56–78u` grass fade transitions invisibly into sunlit hills.
   - **Backlit Translucent Grass & Reactive Foliage:**
     - Add warm sun-backlit subsurface tip glow (`uSunDir`, `uSunColor`) + travelling gust-field sway (`uWindVec`) to `createGrassMaterial()`.
     - Add `Shaders.patchFoliageReactive(mat, opts)` (combining wind gust sway + `uPlayerPos` & `uTramplers[16]` proximity parting + backlit leaf translucency!) and apply it to **instanced ferns, coastal reeds, and woodland berry bushes**!

3. **Cohesive Travelling Wind-Gust Field (`Env.updateWind(time)`):**
   - Computes a smooth travelling wind vector (`dirX`, `dirZ`, `strength` oscillating smoothly `0.35..1.15` with periodic breezy swells) written once per frame to `Shaders.uniforms.uWindVec` (`vec4(wx, wz, strength, gustPhase)`).
   - Drives **cloud drift, tree canopy bough/leaf rustle, reactive bush/fern sway, meadow grass waves, ocean chop micro-ripples, ambient drifting leaves, and Starkeeper's cloak flutter** in physical unison!

4. **Curated CC0 1.0 Nature & Ruin GLB Pipeline (`scripts/build_env_glb.py` -> `assets/env/`):**
   Compiles **17** lightweight CC0 1.0 models from verified Quaternius public-domain mirrors (`trebeljahr/quaternius-showcase`), normalized with `minY = 0` grounding, crease-aware smooth normals, generated cylindrical/triplanar UVs where absent, and separated PBR material slots (target total binary size **`< 1.3 MB`** across all 17 `.glb` files):

   | Prop Key | CC0 Source Model | Target Height | Biome / Usage |
   |---|---|---|---|
   | `oak_tree` | `nature_pack/CommonTree_1.glb` | `9.6u` | Meadows & Star Sanctuary hills |
   | `birch_tree` | `nature_pack/BirchTree_1.glb` | `9.2u` | Sunlit Ruins & meadow groves |
   | `pine_tree` | `nature_pack/PineTree_1.glb` | `11.2u` | Whispering Deep Forest |
   | `pine_snow` | `nature_pack/PineTree_Snow_1.glb` | `11.2u` | Frostpeak Shrines alpine slopes |
   | `willow_tree` | `nature_pack/Willow_1.glb` | `8.8u` | Lakeside coves & Canyon Oasis spring |
   | `palm_tree` | `nature_pack/PalmTree_1.glb` | `8.4u` | Canyon Oasis & sandy beaches |
   | `cactus_flower` | `nature_pack/CactusFlower_1.glb` | `2.6u` | Canyon Oasis desert floor |
   | `bush_berry` | `nature_pack/BushBerries_1.glb` | `1.35u` | Meadows & forest understory (reactive!) |
   | `boulder_moss` | `nature_pack/Rock_Moss_1.glb` | `1.35u` | Standable mossy boulders worldwide |
   | `boulder_rock` | `nature_pack/Rock_3.glb` | `1.45u` | Coastal basalt, canyon & alpine rocks |
   | `fallen_log` | `nature_pack/WoodLog_Moss.glb` | `0.85u` | Whispering Forest standable mossy logs |
   | `tree_stump` | `nature_pack/TreeStump_Moss.glb` | `0.95u` | Forest & meadow standable mossy stumps |
   | `lilypad` | `nature_pack/Lilypad.glb` | `0.10u` | Calm shallow coves & Oasis pool (`y = WATER_Y + 0.03`) |
   | `ruin_arch` | `modular_dungeon_1/Arch.glb` | `5.8u` | Star Sanctuary, Tidecaller's Arch, Sunken City |
   | `ruin_column` | `modular_dungeon_pack/Column.glb` | `5.0u` | Sunlit Ruins, Sanctuary, Sunken City colonnades |
   | `ruin_column_broken` | `modular_dungeon_pack/Column_Broken.glb` | `3.2u` | Weathered broken colonnade pillars |
   | `shrine_pedestal` | `modular_dungeon_1/Pedestal.glb` | `1.6u` | Secret Star Shrines & Tidecaller's Pearl altar |

   *(17 props total; each ~`25–85 KB` binary, well under `1.3 MB` total.)*

   - **PBR Material Restyling & Seamless `InstancedMesh` Hot-Swap (`env.js` + `world.js`):**
     - `world.js` builds every chunk immediately using upgraded procedural fallback geometries (zero blocking!).
     - As each `assets/env/<key>.glb` (HTTP) or `.glb.js` (`file://`) loads, `Env` extracts its separated sub-geometries (e.g., `bark` + `foliage` or `stone` + `moss`), restyles them with our realistic PBR maps (`Textures.sets.bark`, `leaves`, `rock`, `stone`, `snow`), patches `Shaders.patchTreeWind` / `Shaders.patchFoliageReactive` / `Shaders.patchUnderwaterCaustics`, and notifies `world.js` & `regions.js` to hot-swap chunk `InstancedMesh` buffers and landmark nodes cleanly while preserving all existing 3D colliders!

---

### 3.4 Carved PBR Shrines, Ambient Biome Motes & Quality Scaling

1. **Architectural Shrine & Landmark Upgrades (`regions.js`):**
   - **Star Sanctuary:** Multi-tiered beveled stone dais, carved `ruin_arch` + fluted `ruin_column` frame, glowing inlaid Star-Rune floor ring.
   - **Sunlit Ruins:** Alternating intact `ruin_column` and weathered `ruin_column_broken` colonnade avenue, stepped obelisk plinth with pulsing gold rune collar.
   - **Whispering Deep Forest (Hollow Great-Tree Shrine):** Replace raw `DodecahedronGeometry` canopy spheres with a **towering sculpted multi-tier botanical canopy** (layered curved sunlit leaf-card bough crowns + mossy root buttresses + glowing hanging spirit wisps + backlit wind sway!).
   - **Twilight Basalt Coast:** Weathered planked pier with mooring bollards & warm swinging lantern glow; carved sea-worn `ruin_arch` & `shrine_pedestal` holding Tidecaller's Pearl.
   - **Canyon Oasis:** Stratified sandstone arch reinforced with boulder buttresses, **oasis `palm_tree` & lakeside `willow_tree` grove + floating `lilypad`s** framing the emerald spring, carved Sun-Gate.
   - **Frostpeak Shrines:** Frost-rimed carved alpine stairs, stepped glacial spire dais, icy rune collars.
   - **Sunken Underwater City:** Submerged carved `ruin_column` & `ruin_arch` colonnades with `Shaders.patchUnderwaterCaustics()` dancing across every submerged stone surface.
   - **All 6 Secret Star Shrines:** Carved `shrine_pedestal` altars with pulsing Star-Rune glow halos that brighten warmly when discovered.

2. **Zero-GC Pooled Ambient Biome Motes (`Env.createBiomeMotes()`):**
   - Single pre-allocated `InstancedMesh` pool (**120 motes High / 56 Balanced**) drifting in a `34u` radius around Starkeeper with smooth fade-in/out and zero runtime allocations:
     - **Star Sanctuary / Sunlit Ruins:** Sunlit drifting oak leaf flecks & warm golden pollen motes.
     - **Whispering Deep Forest:** Soft pulsing emerald-gold forest fireflies & spore wisps.
     - **Frostpeak Shrines:** Gentle wind-blown sparkling snow flurries.
     - **Canyon Oasis:** Warm sunlit ochre dust glints drifting on canyon breezes.
     - **Twilight Basalt Coast:** Crisp pale sea-spray mist motes rising along cliffs & surf.
     - **Underwater (camY < WATER_Y):** Luminous slow-drifting turquoise seabed plankton motes.

3. **Quality Scaling Matrix (`Quality: High` vs `Quality: Balanced`):**

   | Feature | High Mode | Balanced Mode (Chromebook-lean) |
   |---|---|---|
   | Pixel Ratio Cap | `min(dpr, 2.0)` | `min(dpr, 1.25)` |
   | Shadow Map | `2048×2048` | `1024×1024` |
   | Chunk Water Subdivisions (`WRES`) | `24×24` | `16×16` |
   | Spectral Stars | `900` | `450` |
   | 3D Cumulus Cloud Banks | `28` | `14` |
   | Underwater Sunbeam Shafts | `16` | `6` |
   | Ambient Biome Motes | `120` | `56` |
   | Chunk Grass Density | `36×36` | `25×25` |

---

## 4. Verification & Testing Strategy

1. **`tests/env-glb.test.mjs`:** Verifies all 17 `assets/env/*.glb` + `*.glb.js` files exist, match exact base64 parity, fit within `< 1.5 MB` combined binary budget, have canonical grounding (`minY ≈ 0`), valid `POSITION`/`NORMAL`/`TEXCOORD_0`, separated material slots, and full CC0 1.0 attribution in `assets/LICENSE-CC0.txt`.
2. **`tests/env.test.mjs`:** Unit tests for `Env` dual-mode asset resolver (`http:` vs `file:`), concurrent load coalescing, graceful procedural fallback, `InstancedMesh` hot-swap registration, story-arc (`0/8 -> 8/8`) + post-8/8 live celestial cycle (`sunDir`, `moonDir`, daylight star fade, moonlight shadow handoff), cohesive wind-gust field, biome mote pooling, High/Balanced quality scaling, and **runtime + static zero-GC allocation scan**.
3. **Updated `tests/shaders.test.mjs` & `tests/world-math.test.mjs` & `tests/regions.test.mjs`:**
   - 4-wave Gerstner `waterHeightAt` JS/GLSL parity, shore damping, and bounded wave crests.
   - New GLSL shader uniforms/patches (`uMoonDir`, `uWindVec`, `uCloudOffset`, `patchUnderwaterCaustics`, `patchFoliageReactive`, `createStarfieldMaterial`, `createCloudMaterial`).
   - Hollow Great-Tree upgraded canopy (zero raw dodecahedron blobs), Oasis palms/willows, Sunken City caustic-patched stone, and preserved standable landmark colliders.
4. **Updated `tests/game-integration.test.mjs`:** End-to-end wiring of `Env`, zero `scene.addCalls` during steady-state gameplay ticks, moonlit night -> sunlit day -> live cycle transitions, and `setQuality('balanced')` propagation.
5. **Live Chrome Visual Verification (HTTP & `file://`):**
   - Multi-panel verification screenshots covering: (a) Moonlit Night (`0/8`) with cratered Moon, Milky Way, twinkling spectral stars & moonlight shadows, (b) Golden Dawn (`4/8`) with volumetric rose-amber cumulus clouds & cloud shadows on hills, (c) Sunlit Day (`8/8`) showing upgraded trees, mossy boulders, carved shrines, Hollow Great-Tree & zero daytime square star artifacts, and (d) Choppy Gerstner Ocean with swim wakes + underwater volumetric sunbeams & caustics in Sunken Bay — with **0 console errors** on both HTTP and `file://`!
