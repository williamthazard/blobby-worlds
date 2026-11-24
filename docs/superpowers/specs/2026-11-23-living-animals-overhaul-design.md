# Sub-Project 2 Design: Living Skinned Animals, Physics & Ecosystem Overhaul

**Date:** 2026-11-23
**Status:** Approved Design Spec (Ready for Review → Implementation Plan)
**Target Environment:** Zero-build pure browser (GitHub Pages / static HTTP **and** double-click `file://`), Three.js r128, 60 FPS forward MSAA renderer.

---

## 1. Goals & Scope

Upgrade every animal in **Blobby Worlds: The Starkeeper** — wild creatures, befriended companions, underwater reef wildlife, and Starkeeper's guide bird **Wish** — to the same visual, physical, and behavioral craft as Starkeeper's rigged `.glb` overhaul:

1. **Skinned & Morph-Animated `.glb` Appearance (`AnimalRig`):**
   - Replace rigid sphere/cone runtime meshes with curated **CC0 / MIT rigged & morph-animated `.glb` archetypes**, cloned efficiently per creature via Three.js r128 **`THREE.SkeletonUtils.clone`** (the `webgl_animation_multiple` pattern) so every wild animal and companion runs an independent `THREE.AnimationMixer` while sharing geometry buffers and cached PBR species materials.
   - Restyle every archetype with our procedural `Textures.sets` PBR materials (`fur`, `feather`, `scales`), bone-mounted fantasy accents (Unicorn spiral Star-Horn, Owl golden ear-tufts, Ember Drake dorsal ember ridge & flame tail, Firefly glowing lantern abdomen, Kelp Eel luminous dorsal fronds), smooth `crossFadeTo` animation blending (`Idle`, `Eating`, `Walk`, `Gallop`, `Gallop_Jump`, `Attack`, `HitReact`, `Death`), speed-coupled `timeScale`, and live Head-bone look-at + ear micro-twitches.
2. **Real 3D Animal Physics (`AnimalPhysics`):**
   - Replace teleport-step movement in `game.js` with persistent 3D velocity `(vx, vy, vz)`, inertia, turn-rate banking (`bankRoll`), gravity, automatic obstacle/boulder vault-jumping, steep-cliff clamping/sliding, water buoyancy & paddling for swimming land companions, aerial flight altitude damping for birds/fireflies, and seabed/wave-bounded 3D swimming for aquatic species — all zero-GC.
3. **Living Ecosystem & Expressive Companions (`AnimalAI`):**
   - Give wild creatures species-distinct daily life (`wander`, `graze`/`Eating`, `rest`/`sleep`, `curious` head-turns, `fleeGloom`, plus **two** kid-friendly ways to befriend: **calm slow approach** *or* **gentle chase**).
   - Upgrade companions from a rigid single-file conga line into natural **flanking pack formations** with boids separation and arrival damping, **species-distinct animated combat moves** synced to real `Attack`/`Jump` clips, and idle grazing/resting + joyful Totem/discovery celebration hops.
   - Replace circular aquatic orbits with **true 3D boids schooling** (separation, alignment, cohesion, reef tether, swimmer scatter) across an expanded Sunken City reef including **Starlight Manta Rays** and **GPU vertex-shader bioluminescent Moon Jellies**.

**Out of scope:**
- New HUD buttons or extra keyboard/touch bindings (no separate Pet or Whistle key; all new behaviors trigger organically through natural player movement and exploration).
- Upgrading Gloomblobs or Obsidian Cocoons (deferred to a separate Enemies sub-project).

---

## 2. Offline Asset Pipeline (`scripts/build_animals_glb.py`)

Players and GitHub Pages require **zero build step**. `scripts/build_animals_glb.py` runs once during development to fetch, verify, normalize, and compile all animal archetypes into `assets/animals/` alongside `file://`-only base64 wrappers (`assets/animals/*.glb.js`) and an updated `assets/LICENSE-CC0.txt`.

### 2.1 Curated CC0 1.0 & MIT Archetype Mapping (15 Species + Starlight Manta)

| Archetype File | Source Asset & License | Rig / Clips | Powered Blobby Worlds Species & Restyling |
|---|---|---|---|
| `fox.glb` | Quaternius `animals_pack/Fox.glb` (CC0 1.0) | 51 joints, 12 clips (`Idle`, `Idle_2`, `Eating`, `Walk`, `Gallop`, `Gallop_Jump`, `Jump_ToIdle`, `Attack`, `HitReact_Left/Right`, `Death`) | **Frost Fox** (ice-blue/white `fur` PBR, aurora tail tip) & **Moss Lynx** (compiler-baked feline morph target shortening muzzle + widening cheek ruff; bone-mounted lynx ear-tufts & mossy-green/gold `fur` PBR) |
| `unicorn.glb` | Quaternius `animals_pack/Horse_White.glb` (CC0 1.0) | 50 joints, 13 clips (+ `Attack_Headbutt`, `Attack_Kick`) | **Starlight Unicorn** (pearlescent lavender `fur` PBR, Head-bone mounted glowing spiral Star-Horn & starlight mane) |
| `wolf.glb` | Quaternius `animals_pack/Wolf.glb` (CC0 1.0) | 51 joints, 12 clips | **Timber Wolf** *(replaces `Woodland Cub` in `LAND` with warm chestnut/slate `fur` PBR & amber eyes; procedural `bear`/`wolf` fallback preserved in `models.js`)* |
| `stag.glb` | Quaternius `animals_pack/Stag.glb` (CC0 1.0) | 38 joints, 13 clips | **Celestial Stag** *(Ultra-Rare Mythic Starlight Species — gleaming ivory-gold `fur` PBR, glowing starlight antlers, floating constellation sparkles!)* |
| `drake.glb` | Quaternius `dinosaurs_pack/Velociraptor.glb` (CC0 1.0) | 29 joints, 6 clips (`Idle`, `Walk`, `Run`, `Jump`, `Attack`, `Death`) | **Ember Drake** (molten coral-orange `scales` PBR, glowing ember spine ridge & tail flame spark) |
| `beetle.glb` | Gobkit `insect002/Asianladybeetle.glb` (CC0 1.0) | 24 joints, **19 clips** (`idle`, `walk`, `run`, `tripod`, `groom`, `alert`, `eat`, `attack`, `hit`, `sleep`, `dead`, …) | **Berry Beetle** (glossy crimson carapace PBR with black spots, smoothed normals) |
| `firefly.glb` | Quaternius `easy_enemies_pack/Wasp.glb` (CC0 1.0) | 29 joints, 3 clips (`Flying`, `Attack`, `Death`) | **Lantern Firefly** (emerald-gold iridescent carapace + pulsing warm golden lantern abdomen glow & halo) |
| `bird.glb` | Three.js `examples/models/gltf/Parrot.glb` (MIT) | 12 morph-target wingbeat frames (`497` verts, `~95 KB`, UVs + vertex colors + compiled smooth normals) | **Wish** (golden starlight `feather` PBR + crown crest + warm glow halo), **Cloud Wren** (cloud-white/sky-blue `feather` PBR + crest), **Golden Owl** (amber-gold `feather` PBR + sculpted ear-tufts & broad soaring scale) |
| `kiwi.glb` | Gobkit `birds/Kiwi.glb` (CC0 1.0) | 16 joints, 4 clips (`idle`, `walk`, `attack`, `dead`) | **Meadow Kiwi** (warm chestnut `feather` PBR, smoothed normals, grounded sprinting scale) |
| `fish_tang.glb` | Quaternius `cute_fish_pack/BlueTang.glb` (CC0 1.0) | 6 spine joints, 6 clips (`Swimming_Normal`, `Swimming_Fast`, `Swimming_Impulse`, `Attack`, `Death`, `Out_Of_Water`) | **Seafoam Fin** (iridescent seafoam-aqua `scales` PBR) |
| `fish_koi.glb` | Quaternius `cute_fish_pack/Koi.glb` (CC0 1.0) | 6 spine joints, 6 clips | **Coral Dart** (coral-pink & pearl `scales` PBR) |
| `eel.glb` | Quaternius `easy_enemies_pack/Snake.glb` (CC0 1.0) | 15 spine joints, 4 clips (`Idle`, `Walk`→swim undulation, `Jump`, `Attack`) | **Kelp Eel** (emerald-jade `scales` PBR + translucent bioluminescent kelp dorsal fins) |
| `manta.glb` | Quaternius `fish_pack/Manta_ray.glb` (CC0 1.0) | 13 wing/tail joints, `Swim` clip | **Starlight Manta** (deep indigo-cyan `scales` PBR with starry dorsal shimmer gliding through Sunken City) |
| *(Shader Mesh)* | Built natively in `shaders.js` + `models.js` | GPU vertex-shader pulsing translucent bell + 6 traveling-wave ribbon tentacles + inner star core | **Moon Jelly** (zero asset download, ethereal underwater bioluminescence) |

### 2.2 Compiler Normalization & Self-Checks (`scripts/build_animals_glb.py`)
For every archetype `.glb`:
1. **Canonical Orientation & Grounding:** Inspects rest vertex bounds across skinned/morph meshes, normalizes facing direction to **`+Z`**, scales to canonical world unit height (`fox: 0.72u`, `unicorn: 1.28u`, `wolf: 0.92u`, `drake: 0.84u`, `beetle: 0.44u`, `firefly: 0.46u`, `bird: 0.52u`, `kiwi: 0.56u`, `fish_tang: 0.50u`, `fish_koi: 0.54u`, `eel: 0.40u`, `manta: 1.15u`), and grounds land archetypes cleanly to `minY = 0.000` (and centers swimmers/flyers vertically around `y = 0`).
2. **Smooth Normals & Feline Morph Target:** Ensures every primitive has unit-length `NORMAL`s (generating smooth normals for Three.js `Parrot.glb` and Gobkit meshes where flat-shaded), and bakes a `Feline` morph target (`targets[0]`) on `fox.glb` that subtly shortens the snout and rounds the cheekbones for **Moss Lynx**.
3. **Channel Parity & Clip Validation:** Asserts on **every channel of every animation clip** that `input.count === output.count`, timestamps are sorted and non-negative, and every float is finite (guaranteeing zero Three.js r128 `QuaternionLinearInterpolant` infinite loops!).
4. **Dual-Mode Outputs:** Writes `assets/animals/<key>.glb` and `assets/animals/<key>.glb.js` (`window.__ANIMAL_GLB_B64__ = window.__ANIMAL_GLB_B64__ || {}; window.__ANIMAL_GLB_B64__['<key>'] = "...";`). Total combined binary `.glb` budget across all 13 archetypes: **`<= 4.9 MB`**, loaded **lazily per archetype** only when first spawned (initial meadow play fetches only `~1.2–1.6 MB`).

---

## 3. Runtime Architecture (`vendor/SkeletonUtils.js` + `animals.js`)

### 3.1 Script Load Order (`index.html`)
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="vendor/GLTFLoader.js"></script>
<script src="vendor/SkeletonUtils.js"></script>
<script src="audio.js"></script>
<script src="textures.js"></script>
<script src="shaders.js"></script>
<script src="regions.js"></script>
<script src="world.js"></script>
<script src="models.js"></script>
<script src="rig.js"></script>
<script src="physics.js"></script>
<script src="animals.js"></script>
<script src="game.js"></script>
```
*(Updates `tests/game-integration.test.mjs` script-order check and `loadGameHarness` cleanly.)*

### 3.2 `AnimalRig` — Dual-Mode Lazy Loader, `SkeletonUtils.clone` & `AnimationMixer`
- **Template Cache & Lazy Loading:**
  - `Animals.preloadArchetype(key)` loads `./assets/animals/${key}.glb` on `http:`/`https:` (never requesting `.glb.js`) or injects `<script src="./assets/animals/${key}.glb.js">` + decodes base64 on `file:`.
  - Multiple creatures requesting the same archetype coalesce onto one pending callback list; once parsed, the template `{ scene, animations, boneNames }` is cached permanently.
  - While loading (or in headless Node tests without `GLTFLoader`), the existing procedural `Models.makeCritter(sp)` mesh remains visible on frame 0 inside `mesh.userData.proceduralRoot` and hot-swaps seamlessly (`proceduralRoot.visible = false`) the instant the skinned clone binds!
- **Independent Multi-Instance Cloning (`THREE.SkeletonUtils.clone`):**
  - Each spawned wild animal, companion, Wish, or aquatic creature clones its own bone hierarchy via `THREE.SkeletonUtils.clone(template.scene)` while sharing source geometries and per-species cached PBR materials (`skinning: true`, `morphTargets: true` where present, `frustumCulled = false`, `castShadow = true`, `receiveShadow = true`).
  - Bone-mounted fantasy accents (e.g., Starlight Unicorn spiral horn on `Head`, Moss Lynx ear-tufts on `Ear1.L`/`Ear1.R` or `Head`, Ember Drake spine embers & tail flame on `Torso`/`Tail`, Firefly glowing lantern & halo on abdomen) attach directly to the cloned skeleton's live joints!
- **Unified Semantic Clip Router & Micro-Life:**
  - Maps every archetype's raw clip names onto a unified semantic state table:
    - `idle`, `idleAlt`, `eat`, `sleep`, `walk`, `run`, `jump`, `attack`, `hit`, `death`, `swim`, `swimFast`, `fly`.
  - Smooth `prevAction.crossFadeTo(nextAction, fadeDur, false)` transitions (`fadeDur = 0.14–0.24s`; fast `0.07s` into `attack`/`hit`/`jump`).
  - Speed-coupled `timeScale = clamp(speed / refSpeed, 0.60, 1.75)` on `walk`/`run`/`swim`/`fly` clips (eliminates paw/foot skating).
  - Post-mixer zero-GC micro-life: resets `Head` bone to mixer pose, applies smoothly damped bounded yaw/pitch look-at toward Starkeeper / target (`±0.42 rad` yaw, `±0.24 rad` pitch), subtle mammal ear-twitch (`sin` impulse), and smooth `hurtFlash` / celebration hop pulse.

### 3.3 `AnimalPhysics` — Real 3D Momentum, Jumping, Banking & Water Buoyancy
Every animal entity (`wild`, `followers`, `aquaticCritters`, `wish`) carries a compact flat physics struct initialized once on spawn:
`{ vx, vy, vz, onGround, inWater, airLift, bankRoll, jumpCd, smoothSpd, smoothYaw, gaitPhase }`.

1. **Steering & Inertia (Land & Aerial):**
   - Desired horizontal velocity `(desVx, desVz)` approaches smoothly via exponential acceleration (`k = onGround ? 9.5 : 4.2`), eliminating instant directional snaps.
   - Smooth yaw turn via `Physics.turnToward` + **dynamic turn banking**: `targetBank = clamp(-turnRate * speed * 0.055, -0.38, 0.38)`, smoothly damped onto the visual root's local `roll` so galloping wolves/foxes/unicorns and soaring birds lean organically into turns!
2. **Gravity, Obstacle-Vault Jumping & Cliff Discipline:**
   - Applies vertical gravity (`vy -= 24 * dt`) whenever airborne.
   - Resolves solid prop colliders (`Physics.resolveColliders`) and checks terrain/pad support height (`Physics.getSupportHeight`).
   - **Auto-vault jump:** When moving at `speed > 1.8`, grounded, `jumpCd <= 0`, and either (a) a boulder/terrace ahead rises `0.32–1.55u` above current `y` or (b) a solid prop blocks forward progress while chasing/following/fleeing, triggers an authentic parabolic vault (`vy = 7.8–9.2`, `onGround = false`, `jumpCd = 0.85s`) synced to the `jump` animation clip!
   - Rejects near-vertical cliffs (`>= 44°`) via tangential contour slide instead of snapping animals straight up sheer rock faces.
   - Aligns grounded pitch & roll smoothly to `terrainNormalAt(x, z)`.
3. **Real Water Buoyancy & Aerial Over-Water Flight:**
   - **Swimming land animals (`quad`, `drake`, `kiwi`, `beetle`):** When `gh < WATER_Y - 0.35`, transitions smoothly into `inWater = true`, applies spring buoyancy toward `WATER_Y - submergeOffset` with wave bobbing (`Shaders.waterHeightAt`), throttles horizontal swim speed to `0.68x`, kicks water splash ripples, and drives paddling leg animation instead of sinking to the seafloor!
   - **Flyers (`songbird`, `owl`, `firefly`, `wish`):** Maintain smooth target altitude (`1.2–2.4u` above terrain or water) when flying/swooping/crossing water, damping vertical velocity cleanly and banking into curves.
4. **Aquatic Bounds:**
   - Keeps every underwater creature smoothly clamped between `heightAt(x, z) + 0.75` and `WATER_Y - 0.85`, orienting pitch along `atan2(vy, horizSpd)` and rolling gently into horizontal turns.

### 3.4 `AnimalAI` — Living Ecosystem, Companion Formations, Species Combat & 3D Boids
1. **Wild Daily-Life State Machine (`updateWild`):**
   - Species temperament table:
     - `shy` (**Frost Fox**, **Starlight Unicorn**): spots Starkeeper at `8.5u`; runs if sprinted at (`playerSpd > 5.0`), pauses curiously if approached calmly!
     - `curious` (**Timber Wolf**, **Moss Lynx**, **Meadow Kiwi**): stops and turns head toward Starkeeper at `9.5u`; approaches warmly on calm approach (`calmTrust`), darts away playfully if sprinted straight into (`flee`).
     - `aerial` (**Cloud Wren**, **Golden Owl**, **Lantern Firefly**): perches/flutters on meadows, takes wing gracefully when startled, settles back down calmly when Starkeeper slows down.
     - `busy` (**Berry Beetle**, **Ember Drake**): alternates foraging (`eat`/`groom`), scurrying, and alert head-turns.
   - States: `wander` ↔ `graze` (`2.5–5.0s`, plays `eat`/`groom` clip) ↔ `rest` (`2.5–4.5s`, plays `idleAlt`/`sleep`) ↔ `curious` (head-tracks Starkeeper) → **`calmTrust`** (when `d < 5.8u` and player `spd < 4.6`, warms up with pink hearts and joins band after `2.2s`!) **OR** **`flee`** (`Gallop` + vault jumps) → **`tired`** (`fleeT > 3.5s` → stay close `2.0s` to join — 100% compatible with existing befriending flow and quests!) **OR** **`fleeGloom`** (scatters away when any Gloomblob closes within `9.0u`).
   - **Rare Starlight Animals (~12% rare sighting chance):**
     - **Celestial Stag** (unique rare-only mythic species using `stag.glb` with luminous ivory-gold coat & glowing star-antlers) PLUS rare mythic shimmering variants of signature land creatures (**Aurora Fox**, **Eclipse Wolf**, **Astral Unicorn**, **Solar Owl**, **Starfire Drake**).
     - Rare spawns emit a soft shimmering golden/aurora glow sprite aura + periodic drifting starlight sparkles, announce themselves with a gentle chime & toast (`"A rare Celestial Stag appeared nearby!"` — clean storybook copy, no emojis), are slightly swifter/shyer in the wild, and grant **bonus max HP (`+3`) & radiant starlight impact bursts (`2` damage)** once befriended into your companion band!
2. **Companion Flanking Formations, Species Combat & Celebrations (`updateFollowers`):**
   - **Pack Flanking Formation:** Computes spread-out golden-angle / fan arc slots beside and behind Starkeeper (radius `2.2–4.2u`) + **boids separation** (`sepDist = 1.65u`) between fellow companions + smooth arrival slowing (`arriveRadius = 2.0u`) so companions spread naturally like a living band instead of clipping into a single-file conga line.
   - **3-Tier Combat Priority Preserved + Species-Distinct Animated Moves:**
     - Keeps Self-Defense → Defend Fellow Friend → Escort Starkeeper priority intact.
     - Replaces instant bump-damage with a crisp animated lunge/strike phase (`atkPhase`: `approach` → `telegraph/leap` → `strike` impact at `dist <= 2.1u` playing `attack` clip + species VFX → nimble tactical hop-back):
       - **Wolf / Fox / Lynx:** Parabolic **Pounce Lunge** (`vy = 5.4`, `jump` → `attack`).
       - **Starlight Unicorn:** Accelerating **Star-Horn Charge** (`run` → `attack` headbutt + violet star burst).
       - **Ember Drake:** Sprinting **Flame Dash** (`run` → `attack` + orange ember burst).
       - **Golden Owl / Cloud Wren / Lantern Firefly:** **Aerial Dive-Swoop** (rises to `+1.9u`, dives diagonally through Gloomblob with golden/feather burst, pulls back up).
       - **Berry Beetle / Meadow Kiwi:** **Shell Ram / Rapid Peck Dash** (`attack` + bright spark burst).
   - **Idle & Celebration Life:** When Starkeeper stands still (`spd < 0.35` for `> 3.0s`), companions smoothly transition into resting/grazing/head-looking around Starkeeper. Exposes `Animals.celebrate(followers)` called by `game.js` whenever Starkeeper lights a Star Totem, discovers a Secret Shrine, or befriends a new friend — triggering joyful staggered celebration hops & `idleAlt`/`jump` animations!
3. **3D Boids Schooling (`updateAquatic`):**
   - Expands Sunken City reef from 6 fixed-orbit sprites to **16 living aquatic creatures**:
     - School of 6 **Seafoam Fins** (tight synchronized boids school with alignment + cohesion + separation + occasional `Swimming_Impulse` bursts).
     - School of 4 **Coral Darts** (agile reef school weaving through sunken arches).
     - 2 **Kelp Eels** (sinuous low-seabed reef cruisers).
     - 2 **Moon Jellies** (GPU vertex-shader bioluminescent pulsing drifters).
     - 2 **Starlight Manta Rays** (wide majestic mid-water gliders banking slowly over the Sunken Star-Temple).
   - All swimmers steer via zero-GC 3D boids forces (separation, alignment, cohesion, gentle home-reef attraction, terrain/surface bounds, and smooth dart-away scatter when Starkeeper swims within `4.0u`!).
4. **GPU Bioluminescent Moon Jelly Shader (`shaders.js` + `models.js`):**
   - Upgrades `makeJelly` bell & tentacles to use a dedicated additive/translucent `ShaderMaterial` (or `onBeforeCompile` standard shader using shared `Shaders.uniforms.uTime`) driving rhythmic radial bell contraction, rim Fresnel bioluminescence, and traveling sinusoidal tentacle waves on the GPU.

---

## 4. Integration Boundaries & Backwards Compatibility

- **`game.js`:**
  - Updates `LAND` entry `'Woodland Cub'` → `'Timber Wolf'` (`plan: 'quad', archetype: 'wolf'`, woodland names `['Koda', 'Timber', 'Ash', 'Bramble', 'Lupin', 'Oakley', 'Cedar', 'Fen']`), and adds `'Starlight Manta'` (`plan: 'fish', archetype: 'manta'`, names `['Glide', 'Celestia', 'Ray', 'Abyssal', 'Manta', 'Vega']`) to `AQUA` for the Sunken City reef.
  - Delegates `attachCritterRig`, `updateWild`, `updateFollowers`, `initAquaticCritters`, `updateAquaticCritters`, and `updateWishRig` cleanly to `Animals` (`animals.js`) via an explicit context object `{ scene, P, Physics, Models, Shaders, Textures, Sound, Regions, heightAt, terrainNormalAt, surfaceAt, getNearbyColliders, burst, dustBurst, splashBurst, stampFootprint, hitGloom, addFollower, questEvent, toast, WATER_Y }`.
  - Triggers `Animals.celebrate(followers)` on Totem lit, Secret Shrine discovered, and Starling befriended.
  - Exposes `Animals` on `window.__GAME_DEBUG__` and preserves `wild`, `followers`, `aquaticCritters`, and `wish` shapes so every existing integration test continues working cleanly.
- **`models.js`:**
  - Keeps all 7 procedural critter body plans (`quad` incl. `wolf`/`bear`/`cat`/`fox`/`deer`, `bird`, `lizard`, `bug`, `fish`, `jelly`, `eel`) intact as instant loading/headless fallbacks, and adds shared bone-attachment builders (`makeUnicornHorn`, `makeLynxEarTufts`, `makeDrakeEmberCrest`, `makeOwlEarTufts`, `makeFireflyLantern`, `makeKelpFronds`) reused cleanly by `animals.js`.

---

## 5. Verification & Testing Strategy

1. **Compiler & GLB Integrity Tests (`tests/animals-glb.test.mjs`):**
   - Verifies all 12 compiled `.glb` files in `assets/animals/` exist, match their `assets/animals/*.glb.js` base64 payloads byte-for-byte, stay within total size budget (`<= 4.2 MB`), have valid skeletons/morph targets, smooth finite normals, grounded `minY` for land species, and **100% exact input/output count parity & sorted non-negative timestamps on every channel of every clip**.
2. **Core Module Unit Tests (`tests/animals.test.mjs`):**
   - Dual-mode loader selects `./assets/animals/<key>.glb` on `http:`/`https:` and `./assets/animals/<key>.glb.js` on `file:`.
   - Graceful procedural fallback when `GLTFLoader`/`SkeletonUtils` is absent or fails.
   - `SkeletonUtils.clone` creates independent bone hierarchies & `AnimationMixer` instances for multiple creatures sharing one template.
   - `AnimationMixer` crossfade router transitions cleanly across `idle` / `eat` / `walk` / `run` / `jump` / `attack` / `hit` / `death` with speed-coupled `timeScale`.
   - `AnimalPhysics` proves inertia, turn banking, gravity + automatic obstacle-vault jumping, cliff blocking, terrain slope alignment, and deep-water buoyancy (land companions float at `WATER_Y`, never sinking to seafloor!).
   - `AnimalAI` proves calm-approach `calmTrust` befriending, classic chase `flee → tired` befriending, `fleeGloom` scatter, flanking pack separation (no conga-line collapse), species combat moves, `celebrate()` hops, and 3D boids schooling separation/cohesion/bounds — all with **zero per-frame `Vector3` allocations**.
3. **Full Regression Suite:** `node --check` on all scripts + `node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs` — 100% green across all existing 85 tests plus the new animal test suites.
4. **Live Chrome Visual & Dual-Mode Check:**
   - Verify BOTH HTTP (`http://127.0.0.1:8767/#test`, `ignoreCache: true`) AND `file://` load with **0 JS/WebGL errors**.
   - Visually inspect screenshots across:
     - Land wildlife & companion showcase (Frost Fox, Moss Lynx, Starlight Unicorn, Timber Wolf, Ember Drake, Berry Beetle, Lantern Firefly, Meadow Kiwi, Cloud Wren, Golden Owl, Wish).
     - Flanking companion formation + swimming buoyancy in water + animated combat lunge.
     - Underwater Sunken City 3D boids reef (Seafoam Fin school, Coral Darts, Kelp Eels, pulsing GPU Moon Jellies, Starlight Manta Rays).
