# World Verisimilitude, Expressive Starkeeper & Anchored Regions (Sub-Project 4) Design

**Date:** 2026-11-23
**Project:** Blobby Worlds: The Starkeeper (`/Users/spencergraham/desktop/other/games`)
**Constraints:** Zero-build pure browser (`file://` + static HTTP), Three.js r128 CDN, single-pass native MSAA forward renderer targeting 60 FPS (`High` + `Balanced` presets), zero external image/model assets, preserve Starkeeper's original celestial-stargazer identity (human ears, midnight-indigo/sea-teal coat, wide-brimmed astronomer hat, crimson cloak, Star-Lantern staff).

---

## 1. Visual & Architectural Goals

Elevate the entire world to a cohesive stylized-realist benchmark (inspired by modern *Ocarina of Time* Lake Hylia environments and expressive stylized-realist character detailing) while delivering **Sub-Project 4**: six hand-crafted anchored regions radiating from the central Star Sanctuary, monumental skyline landmarks, the **Sunken Underwater City**, the unlockable **Tidecaller's Pearl** (Underwater Breathing Relic), guided regional progression, and 6 off-path Secret Star Shrines.

### Module Boundary (Approach A)
Add one focused zero-GC module **`regions.js`** loaded right before `world.js`:
```text
three.min.js -> audio.js -> textures.js -> shaders.js -> regions.js -> world.js -> models.js -> physics.js -> game.js
```
- **`regions.js` owns:** Pure deterministic macro geography (`heightMod`, `climateMod`, `trailWeight`, `regionAt`), landmark geometry builders & height-aware solid colliders, Sunken Underwater City structures, the Tidecaller's Pearl pedestal, 6 off-path Secret Star Shrines, and the 8-Totem regional progression route.
- **`world.js` owns:** Terrain chunk meshing/streaming, towering instanced trees & micro ground-dressing (fine meadow grass, root ferns/shrubs, shoreline reeds), water tiles, dynamic sun/sky/haze environment, and spatial collider queries (combining chunk props + landmark colliders + totem collider).
- **`textures.js` & `shaders.js` own:** Stratified cliff rock PBR textures, skin/iris/hair procedural maps, grounded terrain shader (dirt footpaths, wet shoreline darkening, stratified cliff rock, moss caps), fine-grass/tree/kelp wind shaders, turquoise foam water, and coastal atmospheric haze.
- **`models.js` owns:** Expressive sculpted Starkeeper head, radial-fiber eyes + blink/brow rig, layered hair locks, tactile coat/cross-belt detailing, plus existing wildlife/critters/aquatic species.
- **`physics.js` & `game.js` own:** Infinite-breath + swift-glide underwater relic mechanics, region-entry title banners, guided Totem route, Tidecaller's Pearl discovery, Secret Shrine discovery (`0/6`), and ambient forest/sunbeam motes.

---

## 2. Environment Realism Overhaul

### 2.1 Stratified Cliffs, Dirt Trails & Grounded Palette (`textures.js`, `shaders.js`, `world.js`)
- **Stratified Cliff Rock Texture (`genRock` upgrade):** Replace uniform Voronoi cobblestone tiles with layered horizontal sedimentary/granite strata, natural vertical fissures, subtle moss streaks, warm weathered umber-ochre-slate albedo variation, and deep Sobel normal relief.
- **Winding Dirt Footpaths (`Regions.getTrailWeight`):** Pure zero-GC distance-to-polyline field radiating from the Star Sanctuary plaza to all surface regions.
  - Terrain vertex/fragment blending warms trails into compacted earthy ochre-beige soil (`#b3986d`) with pebbled roughness.
  - Meadow grass, shrubs, rocks, and trees automatically part cleanly around trail centers (`trailWeight > 0.42`) while lush grass and flowers frame the borders.
- **Damp Shorelines, Moss Caps & Turquoise Water:**
  - Terrain shader darkens and glosses sand within `0.85u` above `WATER_Y` (wet shoreline band), caps cliff ledges with mossy turf, and deepens crevice contrast.
  - Water shader accentuates shallow turquoise-emerald clarity (revealing the Sunken City beneath!) transitioning into deep sapphire offshore, with crisp animated foam streaks lapping against beaches and cliffs.
- **High-Contrast Sunlight & Coastal Haze:**
  - Preserve the dramatic 3-act celestial arc (**0/8 Starless Velvet Midnight** lit by Starkeeper's golden Star-Lantern → **4/8 Rose-Apricot Dawn** → **8/8 Radiant Sunlit Day**).
  - At mid-to-full daylight (`5/8..8/8`), sharpen directional sun warmth vs. cooler sky-tinted shadows (stronger `sun` intensity `~1.85` vs. grounded `hemiLight` `~0.62`, crisp `2048` PCF soft shadows with tuned `bias`/`normalBias`) and tint horizon fog with soft coastal blue-teal aerial perspective (`#9fc4d4` at full day) so distant cliffs and landmarks read with atmospheric depth.

### 2.2 Towering Overhead Trees, Dappled Shadows, Fine Grass & Ground-Dressing (`world.js`, `shaders.js`, `textures.js`)
- **Monumental Natural Tree Scale:**
  - Upgrade `buildFlaredTrunkGeo`, `buildOakCanopyGeo`, and `buildPineCanopyGeo` so mature oaks and pines tower **`9.5–14.5u` tall** (5–7× Starkeeper's `1.75u` stature) with slender tapered trunks, high spreading boughs arching well overhead (`y = 4.5–8.5u`), and denser multi-layered curved alpha-cutout leaf/pine-bough crowns (`alphaTest: 0.42`, `castShadow: true`) casting natural dappled foliage shadows across the sunlit meadow below.
  - Preserve scale-aware wind physics: mature trunks stand rock-steady while outer boughs, drooping pine fronds, leaf sprigs, and young saplings (`20%` scale `0.42–0.65`) sway and rustle in sync with rolling meadow gusts.
- **Fine, Sleek Layered Meadow Grass:**
  - Refine `buildGrassTuftGeo()` into a **9-blade cluster of slender, gracefully tapering ankle-to-shin blades** (`0.36–0.62u` tall, narrower base width `0.055–0.085u`, gentle outward arch) with subtle warm olive-gold tips and rich shadowed emerald bases (`terrainColor` harmonized to grounded meadow greens `#4e7d34`–`#6a9440`).
  - Retains full wall-to-wall stratified grid coverage (`36×36` High / `25×25` Balanced), rolling wind waves, and multi-entity reactive trampling (Starkeeper + 16 nearby creatures).
- **Micro Ground-Dressing (Instanced per Chunk):**
  - **Broadleaf Forest Ferns & Root Shrubs:** Curved alpha-cutout fern/shrub clusters tucked naturally around tree bases, forest floors, and mossy rocks (animated with gentle breeze rustle).
  - **Shoreline Reeds & Cattails:** Tall swaying marsh reeds rooted in shallow margins (`WATER_Y - 0.35` to `WATER_Y + 0.55`).
  - **Ambient Sunbeam / Firefly Motes:** Pooled zero-GC drifting golden pollen motes in sunlit meadows and soft emerald fireflies in the Whispering Deep Forest.

---

## 3. Expressive Sculpted Starkeeper (`models.js`, `textures.js`)

Preserves Starkeeper's original celestial-stargazer identity (human ears, midnight-indigo/sea-teal coat, wide-brimmed astronomer hat, crimson cloak, right-hand Star-Lantern Staff) while dramatically elevating facial and costume fidelity:

- **Sculpted Head & Warm Skin Albedo (`textures.js`, `models.js`):**
  - Upgrade Starkeeper's head to a sculpted `28×22` sphere with shaped cheekbones, soft brow ridge, gently recessed eye sockets, defined jawline & chin, delicate sculpted nose bridge + upturned tip, subtle philtrum, and sculpted upper/lower lip contours.
  - Pair with a procedural `256×256` face canvas texture (`Textures.starkeeperFace`) painting warm subsurface cheek/nose/ear blush, subtle socket occlusion, soft rosy lip tint, and gentle warm freckle/skin grain.
- **Detailed Glossy Eyes & Living Expression Rig:**
  - Procedural `128×128` radial iris texture (`Textures.starkeeperIris`): deep sapphire outer limbal ring, luminous radial cerulean-gold iris fibers, crisp dark pupil, and dual glossy catchlights.
  - Curved glossy corneas nested cleanly in recessed sockets, sculpted dark lash-line arcs (upper + subtle lower crease), hinged upper eyelids (`eyelidL`/`eyelidR`) for smooth natural periodic **blinking** every `3–6s`, and sculpted curved eyebrows (`browL`/`browR`) that stay gently relaxed while exploring and subtly furrow into focus during melee/Z-target combat!
- **Layered Hair Locks:**
  - Individually sculpted, tapered front bangs, temple sideburns, and rear hair locks framing the face beneath the astronomer hat brim, using a combed warm-chestnut hair-strand canvas texture (`Textures.sets.hair` or dedicated `hairCard`).
- **Tactile Outfit Detail:**
  - Layered folded collar lapels on the midnight-indigo/sea-teal woven coat, a diagonal stitched leather cross-strap across the torso with an embossed brass buckle & star-pouch at the hip, woven cloth normal/roughness micro-detail, and defined boot/glove cuffs.

---

## 4. Anchored 6-Region World, Landmarks & Sunken City (`regions.js`, `world.js`)

Within radius `r <= 145u` around the **Star Sanctuary (`0, 0`)**, deterministic region elevation/climate sculptors shape six memorable, visually distinct regions with walkable slopes (`< 36°` along trails & ascents) and dramatic skyline silhouettes—tightly composed within `65u–108u` so every region's skyline landmark sits cleanly on loaded terrain (`VIEW_RADIUS = 3`, `±112u`) and is visible across the horizon from the Sanctuary hilltop! Between `r = 145u..195u`, terrain smoothly blends into infinite procedural Perlin continents and ocean.

| # | Region | Center `(x, z)` | Signature Terrain & Palette | Skyline Landmark & Key Features |
|---|--------|------------------|-----------------------------|---------------------------------|
| 0 | **Star Sanctuary** | `(0, 0)` | Gentle hilltop meadow (`h ≈ 6.2u`), flat circular stone compass plaza | Ancient Starlight Arch, radiating dirt trails, safe respawn sanctuary |
| 1 | **Sunlit Ruins** | `(68, -10)` | Golden-green rolling meadows, wildflowers, mossy flagstones | Ruined stone colonnade rows, broken arches, **14u Sun-Dial Obelisk** |
| 2 | **Whispering Deep Forest** | `(62, -78)` | Shaded emerald canopy (`forest = 1`), lush ferns, drifting emerald fireflies | Towering `12–15u` oaks/pines & **18u Hollow Great-Tree Shrine** with lantern arch |
| 3 | **Twilight Basalt Coast** | `(58, 62)` | Sheer stratified coastal cliffs (`h ≈ 9.5–13u`) dropping to a turquoise cove & beach | Weathered wooden pier, shoreline reeds, & **Tidecaller's Arch** housing the **Tidecaller's Pearl** (`(64, 70)`) |
| 4 | **Canyon Oasis** | `(-86, -14)` | Terraced warm terracotta canyon walls (`desert = 1`), emerald spring pool (`h = -1.6u`) | **16u Natural Sandstone Arch**, oasis palms/reeds, & **Sandstone Sun-Gate** |
| 5 | **Frostpeak Shrines** | `(-68, -88)` | Snow-mantled alpine ridge (`snow = 1`, walkable switchback ascent to `h ≈ 19u`), frozen tarn | Carved rune-stone stairway, snowy tall pines, & **18u Summit Star-Spire** |
| 6 | **The Sunken Underwater City** | `(-14, 86)` | Deep crystal turquoise bay (`floor -10.5u to -13.5u`), clearly visible from cliffs above | **Coral-encrusted colonnade arches**, **bioluminescent kelp avenues**, sea-lantern plazas, aquatic wildlife schools, & the **Sunken Star-Temple** (`(-14, 94)`) |

### Landmark Colliders & Standability
- Every monumental stone column, stair step, pier deck, ruined arch footing, and temple terrace registers height-aware 3D colliders (`{ x, z, r, topY, standable }`) into `Regions.getNearbyColliders(x, z, radius, out)` (merged cleanly by `world.js`'s `getNearbyColliders`), so players can walk onto the wooden pier, climb temple steps, and jump onto ruined stone pedestals!

---

## 5. Progression, Tidecaller's Pearl Relic & Off-Path Secrets (`game.js`, `physics.js`, `index.html`)

### 5.1 Region Discovery & Guided 8-Totem Journey
- Entering a new region displays a clean, unobtrusive Zelda-style region banner (fade-in title + subtitle, gentle chime, debounced so borders don't spam) and updates a subtle HUD region pill.
- The 8 Star Totems follow a purposeful scenic tour (`Regions.TOTEM_ROUTE`):
  1. Sunlit Ruins Trail Overlook `(46, -6)`
  2. Sunlit Ruins Sun-Dial Obelisk `(70, -12)`
  3. Whispering Deep Forest Great-Tree Shrine `(62, -76)`
  4. Twilight Basalt Coast Headland `(54, 58)` *(right beside Tidecaller's Arch & Pearl!)*
  5. Sunken Underwater City Star-Temple `(-14, 94)` *(submerged — lights underwater with golden star-beam piercing the turquoise waves!)*
  6. Canyon Oasis Sandstone Sun-Gate `(-86, -12)`
  7. Frostpeak Glacial Tarn Terrace `(-58, -70)`
  8. Frostpeak Summit Star-Spire `(-70, -92)` *(final constellation — brings radiant daylight across the entire world!)*
- Totem quests & Wish hints reference the next region's name so exploration always feels purposeful without forcing linear rails.

### 5.2 Tidecaller's Pearl (Underwater Breathing Relic)
- Rests visibly as a radiant rotating aqua pearl atop an ancient tide-carved pedestal at **Tidecaller's Arch** `(64, 70)` on the Twilight Basalt Coast.
- **Open-World Discovery:** Claimable as soon as the player walks up to the pedestal (whether guided there around Totem 4 OR discovered early by bold explorers!).
- **Effects when claimed (`P.hasBreathRelic = true`):**
  - Infinite underwater breath (`P.air` remains full at `AIR_MAX`, zero drowning damage).
  - Enhanced underwater swimming speed & agile dive glide (`+25%` swim speed, smoother camera-aimed dive feel).
  - HUD air bar transforms into a shimmering aqua **Tidecaller's Pearl** blessing pill, plus a soft turquoise pearl glow orb orbiting Starkeeper's staff underwater.
  - Celebration fanfare, particle burst, and Wish dialogue announcing you can now dive deep into the Sunken Underwater City!

### 5.3 Off-Path Secret Star Shrines (`Secrets 0/6`)
Six hidden miniature celestial shrines tucked off the beaten paths (one per region: behind a Sunlit Ruins broken arch, inside a hidden Whispering Forest grove, on a sea-cliff ledge below Twilight Basalt Coast, perched near the Canyon Oasis arch, beside the Frostpeak frozen tarn, and inside a glowing coral vault in the Sunken Underwater City):
- Each shrine glows softly with an unlit star-brazier that ignites permanently on discovery, awarding **+5 Fallen Stars**, full heart restoration, celebratory chime + burst, and incrementing a compact `Secrets X/6` HUD pill!

---

## 6. Verification & Performance Plan

- **New Unit Test Suite (`tests/regions.test.mjs`):** Deterministic checks for all 6 regions, trail smoothing, cliff/bay elevations, Sunken City depth (`< -9u`), walkable slope gradients along dirt trails, landmark collider registration, Tidecaller's Pearl site, 6 Secret Shrine coordinates, and smooth outer procedural transition (`r > 240u`).
- **Updated Existing Suites:**
  - `tests/textures.test.mjs`: verify upgraded stratified cliff rock + Starkeeper face/iris procedural maps stay seamless & within `< 750ms` init budget.
  - `tests/models.test.mjs`: verify sculpted Starkeeper head, eye/eyelid/brow rig, layered hair locks, cross-belt, and blink animation without breaking existing rig hierarchy or shadow consistency.
  - `tests/physics.test.mjs`: verify `P.hasBreathRelic` grants infinite underwater breath, zero drowning ticks, and boosted underwater swim speed, plus standing on landmark piers/steps.
  - `tests/world-math.test.mjs`, `tests/shaders.test.mjs`, `tests/game-integration.test.mjs`: verify script load order (`regions.js`), region banner transitions, guided Totem route, claiming Tidecaller's Pearl, discovering Secret Shrines, and zero runtime `scene.add` / `Vector3` allocations in hot loops.
- **Live Chrome Visual & Performance Verification:** Capture and inspect close-ups of:
  1. Expressive sculpted Starkeeper face, eyes, hair, and coat detail.
  2. Sunlit Ruins / Lake Hylia-style meadow with towering overhead trees, dappled leaf shadows, fine grass, dirt footpaths, and stratified cliffs.
  3. Twilight Basalt Coast pier & Tidecaller's Pearl shrine overlooking the turquoise bay.
  4. Sunken Underwater City (coral arches, bioluminescent kelp avenues, Sunken Star-Temple, infinite-breath diving).
  5. Confirm zero console/WebGL errors and smooth draw-call / FPS budget on both High and Balanced quality presets.
