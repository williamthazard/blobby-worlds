# Blobby Worlds: The Starkeeper — Stylized PBR, Grounded Physics & 60 FPS Overhaul

**Date:** 2026-11-22  
**Status:** Design Spec (Pending User Review)  
**Target Reference:** *The Legend of Zelda: Ocarina of Time* / modern Zelda remasters in terms of grounded fantasy atmosphere, tactile physics & Z-targeting combat, and rock-solid 60 FPS performance — while preserving *Blobby Worlds: The Starkeeper*'s original celestial stargazer identity and zero-build browser architecture.

---

## 1. Goals & Constraints

### Goals
1. **Higher-Fidelity Stylized PBR Visuals**: Replace untextured primitives and flat vertex colors with procedural albedo/normal/roughness PBR textures, sky environment reflections (`PMREM`), slope-blended cliff rock, animated Fresnel/caustic/shoreline-foam water, wind-swaying instanced grass & wildflowers, volumetric-feeling atmospheric sky with clouds/sun/constellations, soft real-time directional shadows, and radiant additive glow halos.
2. **Original Heroic Character & Fantasy Wildlife Art**: Upgrade the Starkeeper to athletic ~2.1-unit heroic human proportions with his own unmistakable **celestial stargazer** identity (indigo/teal traveler coat, wide-brimmed astronomer hat, crimson multi-segment cloak, leather satchel, Star-Lantern Staff), fix the floating-eye head-turn bug, resculpt all 14 Starling species into rich fantasy wildlife, and elevate Gloomblobs/cocoons/totems into shadow-beasts and ancient observatory monoliths.
3. **Grounded OoT-Inspired Physics & Combat/Traversal**: Add real slope-angle limits with cliff sliding, solid prop collisions (trees, rocks, cacti, ruins, totems), coyote time & jump buffering, forward dodge-roll (`Shift`) with invulnerability and dust bursts, Z-targeting lock-on (`Tab` / right-click) with circle-strafing and duel framing, buoyant wave-matched water with splashes, knockback & bouncing star drops, and a multi-sample hill-aware camera.
4. **Locked 60 FPS Performance**: Single-pass native MSAA rendering (no screen-space post-processing render-target overhead), zero-GC terrain math, chunked spatial collider grids, shared species materials/geometries, pooled particles, texel-snapped shadow frustums, and a `Quality: High / Balanced` toggle.

### Constraints
- **Zero-Build Pure Browser**: Must run directly by opening `index.html` via `file://` or any static HTTP server — no bundler, no `npm install`, classic `<script>` tags with Three.js r128 from CDN.
- **Zero External Texture/Model Assets**: All PBR textures, normal/roughness maps, glow sprites, geometry, and audio remain procedurally generated in JavaScript.
- **Preserve Core Gameplay & Harness**: Retain all existing game loops (gathering fallen stars & sea pearls, bopping cocoons & Gloomblobs, befriending shy wild critters into a parade, relighting 8 constellations via Star Totems, endless quest cycle, first/third-person toggle, and `index.html#test` fast-boot hook).

---

## 2. Architecture & Module Layout

Scripts load in dependency order in `index.html`:

```
three.min.js (r128 CDN)
  └─ audio.js      Generative music + expanded procedural SFX
  └─ textures.js   Procedural PBR albedo/normal/roughness maps, glow sprites, PMREM IBL
  └─ shaders.js    Terrain PBR injection, animated chunk water, wind grass, atmospheric sky
  └─ world.js      Zero-GC height/climate/normals, chunk streamer, sculpted props & colliders
  └─ models.js     Heroic Starkeeper, Wish, 14 Starling species, Gloomblobs, Cocoons, Totems
  └─ physics.js    Player controller, slope sliding, prop collisions, roll, Z-target, camera
  └─ game.js       Entity AI, combat/knockback, quests, HUD, pooled particles, main loop
```

### Module Boundaries & Public Interfaces

| Module | Global | Responsibilities & Public API |
|---|---|---|
| `audio.js` | `Sound` | Existing soundtrack & SFX plus `step(surface)`, `land(intensity)`, `splash(intensity)`, `roll()`, `lockOn(locked)`. |
| `textures.js` | `Textures` | `init(renderer)` builds cached 256×256 tileable `{ map, normalMap, roughnessMap }` sets (`grass`, `forest`, `sand`, `snow`, `rock`, `bark`, `leaves`, `stone`, `cloth`, `leather`, `fur`, `waterNormal`), `glowSprite`, `sparkleSprite`, and `updateEnvMap(renderer, topCol, botCol, sunDir, progress)` using `THREE.PMREMGenerator`. |
| `shaders.js` | `Shaders` | `createTerrainMaterial(textures)`, `waterHeightAt(x, z, time)`, `createWaterMaterial(textures)`, `createGrassMaterial(textures)`, `createSkyDome()`, `createGlowSprite(color, size, opacity)`, and `update(time, playerPos, camPos, sunDir, progress)` for shared uniforms. |
| `world.js` | globals | `scene`, `camera`, `renderer`, `sun`, `hemiLight`, `WATER_Y`, `CHUNK`, `VIEW_RADIUS`, `DAY_SKY_MAX_LIT`, `heightAt(x, z)`, `terrainNormalAt(x, z, out)`, `climateAt(x, z)`, `surfaceAt(x, z)`, `getNearbyColliders(x, z, radius, out)`, `setTotemCollider(x, z, r)`, `landSpot(...)`, `waterSpot(...)`, `updateChunks(px, pz)`, `setSkyProgress(lit)`, `updateEnvironment(camY, px, pz, time, dt)`, `setQuality(mode)`, `addConstellation(name)`, `constellationNameFor(n)`. |
| `models.js` | `Models` | `makePlayer()`, `makeCritter(sp, scale)`, `animateCritter(mesh, t, active)`, `makeWish()`, `makeGloom()`, `makeCocoon()`, `makeTotem()`, `makeStarPickup()`, `makePearlPickup()`, `makeStarBolt()`. Shared geometry and per-species material caches. |
| `physics.js` | `Physics` | Owns player state `P`, camera orbit/first-person/duel state, Z-target state (`lockTarget`), input bindings, `updatePlayer(dt, time, worldCtx)`, `resolveColliders(x, z, radius, out)`, `toggleLockOn(candidates)`, `getAimTarget()`, and `animatePlayer(player, dt, time)`. |
| `game.js` | — | Entity lifecycles (`wish`, `pickups`, `glooms`, `bolts`, `cocoons`, `wild`, `followers`, `totem`), combat impulse & bouncing drops, pooled particle system (`burst`, `splashBurst`, `dustBurst`), quests, HUD, quality toggle, main loop, and `#test` bootstrap. |

---

## 3. Visual & Shader Design

### 3.1 Renderer & Lighting Configuration
- `THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })`
- `renderer.outputEncoding = THREE.sRGBEncoding`
- `renderer.toneMapping = THREE.ACESFilmicToneMapping`
- `renderer.toneMappingExposure = 1.08`
- `renderer.shadowMap.enabled = true`, `renderer.shadowMap.type = THREE.PCFSoftShadowMap`
- **Directional Sun Light**: Follows player at offset `(60, 88, 36)` with orthographic frustum `±36` units (`near: 10, far: 210`). Shadow camera position snaps to texel grid increments (`texelSize = 72 / shadowMapSize`) every frame to eliminate shadow shimmering while moving.
- **Hemisphere Bounce Light**: Transitions smoothly from cool twilight (`0x6c88c4` sky / `0x2d3546` ground) at `lit = 0` to warm sunlit meadow bounce (`0xaad4ff` sky / `0x5b6b49` ground) at `lit = 8`.
- **PMREM Sky Environment Map**: Generated from a lightweight offscreen sky+sun scene via `THREE.PMREMGenerator`, updated when `setSkyProgress(lit)` advances so metals, crystals, water, and damp rocks reflect the evolving sky.

### 3.2 Procedural PBR Textures (`textures.js`)
Generated once at startup using deterministic seeded noise on offscreen `<canvas>` elements (256×256 tileable via periodic domain wrapping), producing matched **albedo (`sRGBEncoding`)**, **normal map** (Sobel gradient computed from height canvas), and **roughness map**:
- **Terrain**: Meadow grass turf, mossy forest floor, wind-rippled desert sand, sparkly alpine snow, stratified cliff/boulder rock.
- **Props & Structures**: Furrowed tree bark, clustered leaf foliage, weathered carved monolith stone with etched recesses.
- **Characters**: Woven fabric cloth, grained leather, soft stylized fur/feather grain.
- **Water**: Tileable multi-octave wave ripple heightfield converted to a tangent-space normal map.
- **Sprites**: Soft radial glow (`glowSprite`) and 4-point star sparkle (`sparkleSprite`) textures with `THREE.AdditiveBlending` and `depthWrite: false`.

### 3.3 Terrain Material (`shaders.js`)
Uses `THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 })` extended via `onBeforeCompile` so Three.js shadows, fog, hemisphere light, and PMREM reflections work natively:
- **World-Space Detail Texturing**: Samples tiled ground detail normal & color variation using world `xz` at two scales to avoid visible tiling seams across chunks.
- **Slope-Based Cliff Rock**: Computes `slope = 1.0 - clamp(vWorldNormal.y, 0.0, 1.0)` and smoothly blends steep faces (`smoothstep(0.18, 0.42, slope)`) into stratified rock albedo, stronger normal relief, and lower roughness — automatically giving mountains and coastal cliffs crisp rocky faces.
- **Underwater Caustics**: Below `WATER_Y`, adds animated dual-scrolling caustic light webs modulated by sun angle and exponential depth attenuation (`exp(-depth * 0.25)`).

### 3.4 Animated Per-Chunk Water & Horizon Skirt
- **Exact Shoreline Depth Without Per-Frame CPU Cost**: Any chunk containing terrain below `WATER_Y + 1.0` builds a `16×16` subdivided water mesh covering the chunk (`32×32` units) with a static vertex attribute `aBedHeight = heightAt(worldX, worldZ)`. A distant flat horizon ring beyond `VIEW_RADIUS` blends seamlessly into fog.
- **Synchronized Wave Function**: Both JS (`Shaders.waterHeightAt(x, z, time)`) and GLSL vertex shader evaluate the same 3-wave sum (amplitude ~0.12 units total) so waves stay continuous across chunk boundaries and the swimming player bobs directly on the visible surface.
- **Fragment Shader**:
  - Dual-layer scrolling procedural normal map for crisp surface ripples.
  - **Fresnel Reflection**: Grazing angles reflect sky zenith/horizon + bright sun specular highlight; steep downward angles reveal translucent shallow teal-turquoise grading into deep indigo-teal with depth (`waterY - vBedHeight`).
  - **Shoreline Foam**: Where `depth < 0.85`, animated sinusoidal foam bands + noise froth gently lap beaches and submerged rocks.

### 3.5 Lush Instanced Grass & Wildflowers
- On land chunks (`h > WATER_Y + 1.1` and slope `< 35°`), generate instanced 3-blade crossed grass tufts and biome wildflowers/ferns/desert scrub in at most 2 `InstancedMesh` draw calls per chunk:
  - Per-instance color tinted from underlying `terrainColor(x, z, h)` with subtle golden/emerald hue variation.
  - Vertex shader applies **traveling wind gust wave** (height-weighted so roots stay pinned), **player-trample bend** pushing blades radially away from `uPlayerPos` within 1.4 units, and smooth **distance scale-down fade** between 48–68 units to eliminate pop-in.
  - `High` quality: up to ~480 tufts/chunk; `Balanced` quality: ~240 tufts/chunk.

### 3.6 Sculpted Multi-Part Environment Props
All instanced per chunk with shadow casting (`castShadow = true`, `receiveShadow = true`):
- **Meadow Oaks**: Tapered flared trunk with root flare + textured bark + 3 asymmetrical layered foliage clusters with per-instance foliage tint variation.
- **Alpine / Forest Pines**: Tapered bark trunk + 3 layered scalloped pine-bough tiers (snow-capped boughs in cold alpine zones).
- **Desert Cacti**: Ribbed main column + asymmetric curved side arms with spines tint.
- **Faceted Mossy Boulders**: Displaced faceted rock geometry with rock PBR normal/roughness and subtle moss-green top vertex tinting.
- **Underwater Kelp**: Multi-segment undulating kelp ribbons swaying gently via vertex shader.
- **Ancient Standing Stones**: Occasional weathered stone fragments scattered on ridges and near totems to reinforce the ancient stargazer world.

### 3.7 Atmospheric Sky Dome & Lighting Progression
- Custom `ShaderMaterial` sky sphere (`BackSide`, radius 480) centered on the player:
  - Smooth zenith → mid-sky → horizon scatter gradient driven by `uProgress` (`lit / 8`: twilight indigo-violet → dawn rose-gold → clear azure daylight).
  - **Glowing Sun/Moon Disc**: Celestial disc aligned with `sun.position`, shifting from pale silver-gold crescent/moon glow in twilight to a warm sun with Rayleigh horizon scatter and soft additive corona in daylight.
  - **Procedural Drifting Clouds**: Two-octave smooth FBM cloud layer softly lit on sun-facing edges, tinted warm peach/gold near the horizon.
  - Existing 500 background stars + 8 named twinkling constellations remain vividly readable in twilight and softly visible as mythic day-stars as the sky brightens.

---

## 4. Character, Wildlife & Shadow-Monster Design (`models.js`)

### 4.1 The Starkeeper (Original Heroic Stargazer Identity)
- **Heroic Proportions (~2.1 units tall)**: Athletic, expressive human silhouette with articulated joints (`pelvis`, `torso`, `headGroup`, `legL/R` with hip/knee/ankle, `armL/R` with shoulder/elbow/wrist, `staffPivot`, and a 3-segment hinged `cape`).
- **Fixed Head Hierarchy**: Head mesh, tousled dark-chestnut hair locks, subtle human ears, expressive layered eyes (sclera, iris, pupil, specular catchlight, brows), and the wide-brimmed astronomer hat are all children of `headGroup`, so head look-at tracking moves the entire head and face cohesively.
- **Signature Outfit**:
  - Layered midnight-indigo & sea-teal traveler's coat/tunic with flared coat-tail panels and embroidered gold constellation trim, using procedural cloth PBR textures.
  - Crossed brown leather baldric with brass clasp, waist belt with gold star buckle, slung leather field satchel + dangling brass compass/astrolabe charm at the left hip, leather bracers/wraps, and cuffed traveler boots.
  - **Wide-Brimmed Stargazer Hat**: Sculpted curved brim, tilted conical crown, brass hatband, and hovering golden star charm at the tip.
  - **3-Segment Crimson-Burgundy Cloak**: Hinged top/mid/hem segments that billow backward with velocity, flutter in wind, flare out during jumps, and tuck cleanly during dodge-rolls.
  - **Star-Lantern Staff**: Held in the right hand — carved dark-wood shaft wrapped with leather grip, topped by an open brass ring-cage enclosing a glowing miniature crystal star with a soft additive halo. Swings naturally while walking/running and aims forward with a casting recoil pulse when firing Star Bolts.

### 4.2 Wish (Celestial Songbird Companion)
- Sculpted luminous golden songbird (slender arched wings with feather tips, streaming dual tail ribbons, delicate beak, expressive eyes, tiny golden crown, and soft additive golden aura).
- Hovers gracefully behind/beside the Starkeeper's shoulder during exploration; when Z-targeting is active, **Wish darts out to circle above the locked-on target** as a living visual indicator.

### 4.3 Upgraded Fantasy Wildlife Starlings (14 Species, 7 Body Plans)
All 10 `LAND` and 4 `AQUA` species keep their names, colors, unlock cadence, and behaviors, rebuilt with shared per-species cached materials/geometries and richer sculpted anatomy:
- **Quad (`round`, `tall`, `wide`)**: Distinct neck, tapered muzzle, nose bridge, jointed thighs/shins/paws, expressive eyes with brows/catchlights, tufted wagging tail, plus refined species flourishes (fox-like tall ears, spiral golden horn, spotted pelt patterns).
- **Bird**: Streamlined feathered chest, curved beak, sculpted two-part flapping wings, fanned tail feathers, layered head crest/crown, spindly legs with clawed feet.
- **Bug**: Iridescent segmented thorax & glossy wing-cases (elytra), compound eyes, 6 jointed legs, glowing lantern-tipped antennae.
- **Lizard**: Sleek salamander/drake torso, angular snout, crest ridge along spine, splayed jointed legs, 2-segment swishing tail.
- **Fish**: Tapered hydrodynamic body, forked translucent tail fin, swept dorsal & pectoral fins, glistening scale roughness.
- **Jelly**: Translucent dome bell with glowing inner core, scalloped rim, 6 two-segment undulating tentacles.
- **Eel**: 3-segment sinuous ribbon body that undulates sequentially, continuous dorsal fin crest, bright eyes.

### 4.4 Gloomblobs, Cocoons, Observatory Totems & Pickups
- **Gloomblobs**: Crouched obsidian-violet shadow-beasts with jagged hunched shoulders, swept curved dark horns/crest, glowing fierce amber eyes under sharp furrowed brows, orbiting shadow-shard wisps, and a soft dark-violet mist halo. Play squash-stretch hops, lunge lean when chasing, and white/violet recoil flash on hit.
- **Gloom-Cocoons**: Faceted dark-obsidian thorn shell bound around a pulsing golden starlight core peeking through glowing seams.
- **Star Totems (Ancient Observatory Monoliths)**: Stepped weathered stone base, tapered carved rune obelisk with glowing gold star-chart bands, twin counter-rotating brass astrolabe rings around a faceted glowing star crystal, soft additive halo, and translucent golden skyward beacon.
- **Fallen Stars & Sea Pearls**: Sculpted 3D multi-pointed star crystal with rotating sparkle halo; iridescent mother-of-pearl sphere with cool aqua-lavender shimmer halo.

---

## 5. Grounded OoT Physics, Controls & Camera (`physics.js`, `game.js`)

### 5.1 Terrain Slope & Cliff Sliding
- Analytical surface normal computed via central differences (`terrainNormalAt(x, z, out)`).
- `slopeAngle = Math.acos(clamp(normal.y, 0, 1))`:
  - **`slopeAngle < 42°`**: Walkable; uphill speed scales gently (`1.0 - slopeFactor * 0.32`), downhill speed gets a mild boost.
  - **`slopeAngle ≥ 42°`**: Blocks upward movement along the uphill component; when standing on a steep face, applies smooth downhill sliding velocity along the horizontal projection of the surface normal with periodic dust puffs.

### 5.2 Solid Prop & Obstacle Collisions
- Every chunk populates `chunk.colliders` when building props:
  - Oak/pine trunks (`r = 0.42–0.55`), boulders (`r = 0.85 * scale`), cacti (`r = 0.42`), standing stones (`r = 0.65`).
  - Active Star Totem registers a dynamic collider (`r = 1.15`).
- `getNearbyColliders(x, z, searchRadius, out)` checks only the 1–4 overlapping chunks in O(1) time.
- **Resolution**: Circle-vs-circle minimum translation vector push-out (2 iterations for tight corners) applied to the Starkeeper (`r = 0.42`), Gloomblobs (`r = 0.62`), wild critters (`r = 0.45`), and followers (`r = 0.4`), producing smooth sliding around trunks and rocks without snagging.

### 5.3 Crisp Jumping, Coyote Time & Dodge-Roll
- **Coyote Time & Jump Buffer**:
  - `coyoteT = 0.12` s after leaving ground without jumping.
  - Pressing `Space` sets `jumpBufT = 0.12` s; jump triggers immediately if `onGround || coyoteT > 0`.
  - Air control blends horizontal input at reduced authority (`3.5` vs ground `10`), preserving jump momentum cleanly; gravity = `24`, jump velocity = `9.2`.
  - Landing triggers impact squash, procedural `Sound.land(impact)`, and surface-matched dust or water-splash particles.
- **Forward Dodge-Roll (`Shift`)**:
  - Available on dry/shallow ground when not rolling and cooldown (`0.25` s) has expired.
  - Launches forward at `12.5` units/s along current movement direction (or facing direction if stationary) for `0.45` s, decaying smoothly into run speed on exit.
  - Grants brief invulnerability (`0.38` s) against Gloomblob bumps and star-steals.
  - Drives a full forward somersault tuck on the Starkeeper's torso/limbs, kicks up trailing dust/water bursts, and plays `Sound.roll()`.

### 5.4 Z-Targeting Lock-On (`Tab` or Right-Click)
- **Activation**: Pressing `Tab` or right-clicking searches for the nearest visible Gloomblob or Gloom-Cocoon within `20` units (favoring targets near the camera's forward cone). Pressing again releases lock-on. Auto-releases if the target is defeated or moves beyond `26` units.
- **Context Menu Suppression**: Prevent browser context menu on `renderer.domElement` so right-click works cleanly for lock-on.
- **Movement & Aiming**:
  - Starkeeper continuously faces the locked target.
  - `A`/`D` become responsive **circle-strafing** around the target; `W`/`S` advance/retreat along the line to target.
  - Dodge-roll (`Shift`) rolls cleanly along your current strafe/move vector (allowing side-rolls or forward dives!).
  - Firing a Star Bolt (`F` or left-click) tracks cleanly toward the locked target's center (with slight lead on moving Gloomblobs).
- **Visual & Audio Feedback**:
  - Subtle thin cinematic top/bottom bars (`28px` height, smooth CSS transition).
  - Projected animated golden diamond lock-on reticle pulsing smoothly over the target in HUD overlay.
  - **Wish** flies over to circle above the locked-on target.
  - Camera smoothly transitions into an over-the-shoulder duel framing keeping both the Starkeeper and the target cleanly in view.
  - Crisp `Sound.lockOn(true/false)` chime.

### 5.5 Buoyant Water Physics & Splashes
- Shared `Shaders.waterHeightAt(x, z, time)` provides the real-time surface height at any `(x, z)`.
- Entering deep water (`ground < surfaceY - 1.65`) smoothly transitions to swimming with a spring-damped buoyancy force pulling the Starkeeper toward `surfaceY - 0.35` (or diving down to `Math.max(ground + 0.85, WATER_Y - 9)` while holding `Space` with remaining air).
- Crossing the water surface at vertical speed `|vy| > 2.5` or sprinting/rolling through shallow water spawns radial foam droplet bursts (`splashBurst`) and plays `Sound.splash(intensity)`.

### 5.6 Combat Knockback & Bouncing Drops
- **Star Bolt Impact**: Applies radial horizontal knockback impulse (`vx, vz` decaying via friction) + brief upward hop + recoil squash to hit Gloomblobs, plus golden-violet spark burst.
- **Bouncing Dropped Stars**: Defeated Gloomblobs eject 2–3 stars with outward radial velocity and upward arc (`vy = 5.5–7.5`). Stars simulate gravity and damped bounces off `heightAt(x, z)` (2–3 crisp hops with mini sparkles) before settling into their hovering magnetic pickup state.

### 5.7 Hill-Aware Camera Controller
- Third-person orbit camera (and Z-target duel camera) samples 6 points along the ray from player focus `(P.x, P.y + 1.65, P.z)` to the desired camera position:
  - At each sample, ensures the ray stays at least `0.65` units above `heightAt(sx, sz)`.
  - If an intervening ridge or cliff intrudes, pulls effective camera distance smoothly inward so the camera never clips into terrain, then eases smoothly back out (`dt * 5`) once clear.
  - First-person view (`V`) remains fully supported, riding at the heroic Starkeeper's eye height (`P.y + 1.82`).

---

## 6. Performance Pipeline & Budgets

1. **Zero-GC Analytic Terrain**: Remove string-keyed `heightCache`/`climateCache` `Map`s completely; use pure numeric `noise2` + `heightAt` (taking ~30ns per call with zero heap allocations) and pre-allocated scratch `THREE.Vector3` instances for all per-frame math.
2. **Budgeted Chunk Streaming**: Build missing chunks nearest-first (`VIEW_RADIUS = 3`, 49 chunks max), capping at 1 chunk build per frame (or immediate batching under `#test`). Disposing out-of-range chunks cleanly disposes chunk-unique terrain, water, grass, and prop `InstancedMesh` buffers while retaining shared prop geometries/materials.
3. **Pooled Particle System**: Replace per-particle `new MeshBasicMaterial()` / `scene.add()` / `dispose()` with a fixed-capacity pool (e.g., 320 particles using a single `THREE.InstancedMesh` with per-instance color + scale animation, plus 80 soft rising bubble/mote sprites). Zero runtime allocations or GC pauses during bursts and splashes.
4. **Shared Model Assets**: Cache geometries and per-species PBR materials inside `models.js` so spawning critters, Gloomblobs, and pickups reuses GPU buffers.
5. **Quality Toggle**: HUD button (`Quality: High` / `Quality: Balanced`) dynamically adjusts renderer pixel ratio (`min(dpr, 2)` vs `min(dpr, 1.25)`), directional shadow map resolution (`2048` vs `1024`), and instanced grass density (`100%` vs `50%`).

---

## 7. HUD Polish, Error Handling & Verification Plan

### UI & Controls Updates (`index.html`)
- Fix the literal `they\'ll` typo in the start-screen story text.
- Update controls summary on the start screen to document `Shift` (Dodge-Roll) and `Tab / Right-Click` (Z-Target Lock-On).
- Add top-right `Quality: High` toggle beside `Sound: On`, subtle Z-target cinematic letterbox bars (`#letterboxTop`, `#letterboxBot`), and animated Z-target reticle overlay (`#lockReticle`).
- Preserve `index.html#test` fast-boot hash for automated verification.

### Error Handling & Robustness
- Graceful WebGL fallback: clamp shadow map size to `renderer.capabilities.maxTextureSize`, guard `PMREMGenerator` safely, and ensure audio calls remain silent/no-op before user gesture.
- Guard all `onBeforeCompile` shader patches cleanly against Three.js r128 `#include` anchors, verifying zero GLSL compilation warnings/errors in WebGL console.

### Automated & Visual Verification
Using a local static server and Chrome DevTools MCP:
1. Boot `index.html#test` and verify **zero** JS errors, **zero** WebGL/GLSL shader compile errors, and clean frame timing (target ~60 FPS / <16.7ms per frame).
2. Capture visual verification screenshots across:
   - Starkeeper hero close-up (front/back — verifying coat, astronomer hat, Star-Lantern Staff, cloak, fixed head/eye alignment, shadows).
   - Terrain biomes, steep cliff rock blending, lush swaying grass/flowers, sculpted trees/rocks, and sky/clouds.
   - Water shoreline foam, Fresnel sky reflections, underwater caustics, and diving splashes.
   - Combat: Z-targeting lock-on reticle + cinematic bars + Wish circling target + Gloomblob shadow-beast + Star Bolt knockback + bouncing star drops.
   - Dodge-roll animation & dust burst; solid prop collision & steep-cliff sliding tests via script checks.
3. Confirm `Quality: High` ↔ `Quality: Balanced` toggle switches cleanly without errors and improves frame time.
