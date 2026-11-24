# Sub-Project 3 Design: Escalating & Territorial Skinned Shadow Beasts (`enemies.js`)

**Date:** 2026-11-23
**Status:** Updated Design Spec (Awaiting Final Approval)
**Target Environment:** Zero-build pure browser (GitHub Pages / static HTTP **and** double-click `file://`), Three.js r128, 60 FPS forward MSAA renderer.

---

## 1. Goals & Scope

Evolve Blobby Worlds' enemies so our iconic classic **Gloomblob** remains proudly alive as **Tier 1**, while escalating smoothly into intimidating, territory-themed **skinned `.glb` Shadow Beasts** as Starkeeper's companion band grows, totems are relit, and you venture into outer realms — built with the exact same architecture as Starkeeper (`rig.js` + Universal Animation Library retargeting) and the living animals (`animals.js` + `SkeletonUtils.clone` + `AnimationMixer` + real 3D physics):

1. **Keep Classic Tier 1 Gloomblobs Alive:**
   - Preserve our signature obsidian-orb **Gloomblob** (`Models.makeGloom()` — glossy dark body, blazing amber-to-crimson eyes, orbiting violet shadow wisps, bouncy squash-and-stretch) as **Tier 1 (`3 HP`)** — honoring the game's original identity and making the visual jump to hulking skinned Shadow Beasts feel truly earned and dramatic!
2. **7 Curated Skinned `.glb` Shadow Beast Archetypes (`EnemyRig`):**
   - **Directly incorporates the new `Bestiary - Dungeon Monsters Kit[Standard]` in `assets/`:**
     - **`puglin.glb`** (Tier 2 **Shadow Puglin** — 55-bone PBR tusked club-raider with real Normal/ORM/Emissive maps, retargeted with full `Idle/Walk/Run/Jump/Attack/Hit/Death` animations from Quaternius's Universal Animation Library!).
     - **`imp.glb`** (Tier 3 **Cinder Imp** — 55-bone PBR horned demon with spiked collar, rattling chains, glowing emissive eyes & iron mace, retargeted with `Idle/Walk/Run/Jump/Attack/Roll/Hit/Death`!).
   - **Combined with 5 verified CC0 1.0 Quaternius rigged beasts:**
     - **`weaver.glb`** (Tier 2 **Shadow Weaver** — 39-joint obsidian spider with glowing amethyst fangs & leaping pounce).
     - **`stinger.glb`** (Tier 2 **Shadow Stinger** — hovering winged shadow hornet that dives from above).
     - **`knight.glb`** (Tier 3 **Dread Knight** — 31-joint armored shadow duelist with bone-mounted Shadow Blade & Horned Dread Crown, front-arc cleave, leaping slash & evasive sword-roll).
     - **`behemoth.glb`** (Tier 4 **Eclipse Behemoth** — `2.85 m` towering colossus with glowing dorsal spines & radial **Eclipse Shockwave Slam** mini-boss).
     - **`stalker.glb`** (Underwater **Abyssal Stalker** — armored deep-sea crustacean prowling the Sunken City floor).
   - **Drop-In Bestiary/Monster Expansion Hook:** `scripts/build_enemies_glb.py` automatically detects any extra `.glb`/`.gltf` monsters placed in `assets/Bestiary - Dungeon Monsters Kit*/` or `assets/Ultimate Monsters/` and retargets standard 55-bone Quaternius humanoids seamlessly!
3. **Hybrid Threat + Territorial Escalation (`computeThreatLevel` & `pickEnemyTier`):**
   - Continuous threat score combines **companion band size**, **totems lit**, and **distance from Star Sanctuary**:
     - `threat = Math.min(10, followers.length * 0.85 + lit * 0.75 + Math.max(0, distFromHome - 28) / 38)`
   - **Territorial Bias (`Regions.regionAt(x, z)`):** Each realm favors thematic Shadow Beasts once your threat unlocks that tier (while Star Sanctuary solo stays welcoming Tier 1 Classic Gloomblobs!):
     - **Star Sanctuary:** Classic Gloomblobs (`threat < 1.6` = 100% Classic Gloomblobs; higher bands attract occasional Puglins/Weavers near the outskirts).
     - **Sunlit Ruins:** Shadow Puglins & Dread Knights patrolling ancient colonnades.
     - **Whispering Deep Forest:** Shadow Weavers & Shadow Puglins ambushing from the glades.
     - **Canyon Oasis:** Shadow Stingers swooping from mesas & Cinder Imps guarding red-ochre arches.
     - **Twilight Basalt Coast:** Shadow Weavers, Dread Knights & Eclipse Behemoths stalking the dark cliffs.
     - **Frostpeak Shrines:** Cinder Imps, Dread Knights & Eclipse Behemoths atop the glacial ridges.
     - **Sunken Underwater City:** Abyssal Stalkers prowling the submerged seabed ruins (engaging Starkeeper's underwater hydro-staff melee!).
4. **Real 3D Enemy Physics & Group-Challenging Combat (`EnemyPhysics` + `EnemyAI`):**
   - Persistent 3D momentum, gravity, tier-scaled knockback resistance / poise (so big knights and behemoths feel weighty!), steep `>= 44°` cliff discipline, obstacle-vault jumps, aerial hovering/diving (`Shadow Stinger`), and seabed prowling (`Abyssal Stalker`).
   - Group counterplay against big companion packs: **Shadow Weaver** leaps over front-line defenders, **Shadow Stinger** dives from above, **Cinder Imp** evades with nimble dodge-rolls and mace flurries, **Dread Knight** sweeps a `2.8u` cleaving sword arc hitting clustered allies, and **Eclipse Behemoth** unleashes a telegraphed `4.8u` **Eclipse Shockwave Slam** with a pooled crimson ground warning ring (zero runtime `scene.add`!).

**Queued Roadmap After Sub-Project 3:**
- **Sub-Project 4:** Environment Graphics, Sky & World Physics Overhaul (investigating Three.js Resources guides & modern shader/instancing techniques for trees, grass, water, hills, shrines, moon, sun, stars, and clouds).
- **Sub-Project 5:** Deep Sunken City & Abyssal Challenge (building on the upgraded underwater environment & Abyssal Stalkers to make the sunken city genuinely deep, monumental, explorable, and gated by Tidecaller's Pearl).

---

## 2. Offline Enemy Asset Pipeline (`scripts/build_enemies_glb.py`)

### 2.1 Complete 8-Enemy Roster (1 Classic Procedural + 7 Compiled Skinned `.glb`s)

| Tier | Name | Key | Source & License | Rig & Animations | Height | Budget Target |
|---|---|---|---|---|---:|---:|
| **Tier 1** (`threat >= 0`) | **Gloomblob** | `classic` | Native `Models.makeGloom()` (preserved intact!) | Procedural bouncy orb + orbiting wisps + glowing `eyeMat` | `1.10 m` | `0 B` |
| **Tier 2** (`threat >= 1.6`) | **Shadow Puglin** | `puglin` | Local `assets/Bestiary - Dungeon Monsters Kit[Standard]/Exports/GLB (Godot-Unreal)/Puglin.glb` (QAL v1.0) | 55 joints (tusks + club), retargeted 8 clips (`Idle`, `Walk`, `Run`, `Jump`, `Attack`, `HeavyAttack`, `HitReact`, `Death`) from Universal Animation Library; textures compressed cleanly to `512px` BaseColor/Emissive/ORM + `256px` Normal | `1.18 m` | `~420 KB` |
| **Tier 2** (`threat >= 1.6`) | **Shadow Weaver** | `weaver` | Quaternius `easy_enemies_pack/Spider.glb` (CC0 1.0) | 39 joints, 5 clips (`Idle`, `Walk`, `Jump`, `Attack`, `Death`) | `0.88 m` | `~445 KB` |
| **Tier 2** (`threat >= 2.0`) | **Shadow Stinger** | `stinger` | Quaternius `platformer_game_pack/Bee.glb` (CC0 1.0) | 9 joints, 4 clips (`Flying`, `Bite_Front`, `HitRecieve`, `Death`) | `0.78 m` | `~195 KB` |
| **Tier 3** (`threat >= 3.8`) | **Cinder Imp** | `imp` | Local `assets/Bestiary - Dungeon Monsters Kit[Standard]/Exports/GLB (Godot-Unreal)/Imp.glb` (QAL v1.0) | 55 joints (horns, spiked collar, chains, mace), retargeted 9 clips (`Idle`, `Walk`, `Run`, `Jump`, `Attack`, `HeavyAttack`, `Roll`, `HitReact`, `Death`); textures compressed to `512px` BaseColor/Emissive/ORM + `256px` Normal | `1.55 m` | `~480 KB` |
| **Tier 3** (`threat >= 4.0`) | **Dread Knight** | `knight` | Quaternius `single_knight_pack/KnightCharacter.glb` (CC0 1.0) | 31 joints, 12 clips (`Idle`, `Walking`, `Run`, `Run_swordAttack`, `swordAttackJump`, `Roll_sword`, `Jump`, `Death`) + bone-mounted Shadow Blade & Horned Dread Crown | `2.05 m` | `~395 KB` |
| **Tier 4** (`threat >= 6.4`, Mini-Boss) | **Eclipse Behemoth** | `behemoth` | Quaternius `dinosaurs_pack/Trex.glb` (CC0 1.0) | 29 joints, 6 clips (`Idle`, `Walk`, `Run`, `Jump`, `Attack`, `Death`) + glowing dorsal spines & crimson shockwave ring | `2.85 m` | `~335 KB` |
| **Aquatic** (Sunken City) | **Abyssal Stalker** | `stalker` | Quaternius `platformer_game_pack/Crab.glb` (CC0 1.0) | 7 joints, 10 clips (`Idle`, `Walk`, `Jump`, `Bite_Front`, `HitRecieve`, `Death`) | `0.92 m` | `~220 KB` |

**Combined binary `.glb` budget:** `~2.5 MB` across all 7 `.glb` files (hard test ceiling `<= 3.4 MB`), loaded **lazily per archetype** only when a tier/territory spawns it!

### 2.2 Bestiary Texture Optimization & Universal Retargeting (`scripts/build_enemies_glb.py`)
1. **Bestiary PBR Preservation & Shadow Re-Paletting (`Imp.glb`, `Puglin.glb`):**
   - Reads the rich embedded BaseColor, Emissive, ORM, and Normal textures from `Imp.glb` / `Puglin.glb` (or `Textures/T_*` fallback), applies a subtle dusk-shadow hue shift if desired while preserving every crisp hand-painted detail (tusks, chains, spiked collar, iron mace, glowing eyes!), and downscales textures cleanly (`512×512` JPEG for BaseColor/ORM, `256×256` PNG for Normal & Emissive) so each Bestiary monster shrinks from `~8–9 MB` raw down to **`~400–500 KB`** with crisp PBR shading!
2. **Exact World-Rest-Basis Retargeting (`Imp.glb`, `Puglin.glb`):**
   - Uses `/tmp/starkeeper_cache/AnimationLibrary_Godot_Standard.gltf` (downloading to `/tmp/starkeeper_cache/` automatically if absent) and the exact proven world-rest-basis quaternion retargeting + hemisphere-continuity pipeline from `scripts/build_starkeeper_glb.py` onto the 55-bone `pelvis`..`ball_r` skeleton (skipping `root` horizontal translation drift, scaling pelvis height bounce proportionally to each monster's leg height so `Puglin` and `Imp` feet stay planted cleanly at `minY = 0`!).
3. **Unified Normalization & Strict r128 Parity:**
   - Every one of the 7 compiled `.glb`s wraps roots inside `EnemyRoot` facing **`+Z` forward**, canonical height, `minY = 0` (land/seabed) or centered `Y = 0` (`stinger`), unit smooth normals (`TRIANGLES` mode `4` guarded), exact `input.count === output.count`, sorted non-negative timestamps, unit quaternions with `dot >= 0` continuity, and dual-mode `assets/enemies/<key>.glb` + `assets/enemies/<key>.glb.js` (`window.__ENEMY_GLB_B64__["<key>"] = "..."`).
   - Appends both QAL v1.0 (`Bestiary - Dungeon Monsters Kit`) and CC0 1.0 (Quaternius showcase monsters) attributions to `assets/LICENSE-CC0.txt`.

---

## 3. Escalation, Territorial Spawning & Combat Profiles (`enemies.js`)

### 3.1 Hybrid Threat Curve & Regional Flavor
- `threat = Math.min(10, followers.length * 0.85 + lit * 0.75 + Math.max(0, distFromHome - 28) / 38)`
- **Target Land Enemy Count:** scales smoothly from `1–2` solo near Sanctuary up to `5–6` at high threat (max `1` concurrent Tier 4 `Eclipse Behemoth`!).
- **Strict Opening Guarantee (`threat < 1.6`):** `100%` classic Tier 1 **Gloomblob (`3 HP`)** so solo players near Star Sanctuary and all baseline integration tests behave identically to before.
- **Territorial Weights (`threat >= 1.6`):** Region ID gently doubles the weight of that region's signature beasts (`whisperingForest` → `weaver`/`puglin`; `sunlitRuins` → `puglin`/`knight`; `canyonOasis` → `stinger`/`imp`; `twilightCoast` → `weaver`/`knight`/`behemoth`; `frostpeak` → `imp`/`knight`/`behemoth`) so traveling across the world visually transforms the Shadow forces!

### 3.2 Per-Archetype Combat Profiles

| Enemy | Base HP | Knockback Resist | Poise Interrupt | Windup | Signature Attack & Counterplay | Rewards |
|---|---:|---:|---|---:|---|---|
| **Gloomblob** (`classic`) | `3` | `1.00x` | Any hit / melee | `0.42s` | Classic bouncing **Bite Lunge** (`2` half-hearts / `1` to ally). | `2` stars, 45%/75% heart |
| **Shadow Puglin** (`puglin`) | `5` | `0.85x` | Any melee / heavy | `0.44s` | **Club Smash Charge** (`Run` → `Attack` leap-swing, `2` dmg player / `1` ally, small `2.0u` front splash). | `3` stars, 55%/80% heart |
| **Shadow Weaver** (`weaver`) | `5` | `0.85x` | Any melee / heavy | `0.38s` | **Leaping Web Pounce** (`vy = 6.2`, `12.5u/s` leap over front-line allies to ambush Starkeeper!). | `3` stars, 55%/80% heart |
| **Shadow Stinger** (`stinger`) | `4` | `1.15x` | Any hit (knocks back!) | `0.46s` | **Aerial Dive-Sting** hovering at `+2.2u`, diving diagonally, then climbing aloft — rewards Star Bolts, Spin-360, and flying companions! | `3` stars, 55%/80% heart |
| **Cinder Imp** (`imp`) | `8` | `0.62x` | Heavy / Combo Finisher | `0.46s` | **Mace Flurry & Evasive Roll** — aggressive `2.4u` mace cleave + nimble **dodge-roll** (`Roll` clip) after taking ranged Star Bolt hits! | `5` stars, guaranteed heart |
| **Dread Knight** (`knight`) | `10` | `0.45x` | Heavy / Combo Finisher | `0.55s` | **Cleaving Sword Arc & Leaping Slam** (`2.8u` front arc hitting clustered companions + `swordAttackJump` + `Roll_sword`, crisp ground telegraph ring!). | `5` stars, guaranteed heart |
| **Eclipse Behemoth** (`behemoth`) | `14` (+1 per ally > 5, cap `18`) | `0.22x` | Heavy Plunge / Combo Finisher | `0.82s` | **Eclipse Shockwave Slam** (`4.8u` radial AoE dealing `3` half-hearts to player / `2` to nearby allies + heavy pack knockback, expanding crimson ground ring telegraph, `1.1s` recovery opening!). One-time storybook toast: `"An Eclipse Behemoth stalks nearby!"` (zero emojis). | `8` bouncing stars, `2` hearts, band `Animals.celebrate()`! |
| **Abyssal Stalker** (`stalker`) | `5` | `0.75x` | Any melee / heavy | `0.45s` | Underwater **Claw Snap Lunge** patrolling Sunken City floor (`underwater: true`). | `3` stars/pearls, 65% heart |

---

## 4. Runtime Architecture & Integration (`enemies.js` + `models.js` + `index.html` + `game.js`)

- **`models.js`:**
  - Keeps `Models.makeGloom(tierDef)` 100% backwards-compatible (zero-arg call produces our exact beloved classic Gloomblob with `eyeMat`, `body`, `wisps`, `halo`; when given a higher-tier `tierDef` in loading/headless fallback, scales silhouette & horns cleanly!).
  - Adds 4 cached shared factories: `Models.makeShadowBlade()`, `Models.makeDreadCrown()`, `Models.makeBehemothSpines()`, and `Models.makeTelegraphRing()` (used as a reusable pooled ring in `enemies.js` — **zero runtime `scene.add`**!).
- **`enemies.js`:**
  - Mirrors `animals.js` cleanly with 3 internal sections (`EnemyRig`, `EnemyPhysics`, `EnemyAI`) and module-scope zero-GC scratch objects (`_eAxisX/Y/Z`, `_eQYaw`, `_eColBuf`, `_eColOut`, `_eAnimState`, etc.).
  - Exports: `TIERS`, `ARCHETYPE_KEYS`, `computeThreatLevel`, `pickEnemyTier`, `resolveAssetSource`, `preloadArchetype`, `attachToGloom`, `createGloomState`, `onGloomHit`, `updateGlooms`, `initTelegraphPool`, `initUnderwaterEnemies`, `_resetCache`.
  - Classic `tier === 'classic'` skips GLB loading (`ready: true, isClassicProcedural: true`), preserving classic Gloomblob animation (squash-and-stretch, eye glow, orbiting wisps) seamlessly!
- **`index.html` & `game.js`:**
  - Loads `<script src="enemies.js"></script>` immediately after `animals.js` before `game.js`.
  - Allocates `_enemyCtx` ONCE at module scope (zero hot-loop GC) and delegates `gloomTargetCount`, `spawnGloom(tierOverride)`, `hitGloom`, and `updateGlooms` cleanly to `Enemies` with graceful fallback if `Enemies` is absent; exposes `Enemies` on `window.__GAME_DEBUG__`.
  - Spawns 2 patrolling underwater **Abyssal Stalkers** on the Sunken City seabed (`Enemies.initUnderwaterEnemies`) that engage Starkeeper underwater without interfering with land gloom counts!

---

## 5. Verification & Testing Strategy

1. **Compiler & GLB Integrity (`tests/enemies-glb.test.mjs`):**
   - Verifies all 7 compiled `.glb` + `.glb.js` files (`puglin`, `imp`, `weaver`, `stinger`, `knight`, `behemoth`, `stalker`), combined `.glb` size `<= 3.4 MB`, exact base64 parity, `+Z` orientation, `minY = 0` grounding (`stinger` centered), unit normals, strict animation channel parity & sorted timestamps, unit quaternions with `dot >= 0` continuity, Bestiary embedded PBR textures intact, and `assets/LICENSE-CC0.txt` credits.
2. **Enemy System Unit Tests (`tests/enemies.test.mjs`):**
   - Hybrid threat curve + territorial weighting (`threat < 1.6` = 100% Classic Gloomblob `3 HP`; `whisperingForest` biases `weaver`/`puglin`; `canyonOasis` biases `stinger`/`imp`; `threat >= 6.4` unlocks max-1 `behemoth`).
   - Dual-mode loader (`./assets/enemies/<key>.glb` on HTTP vs `.glb.js` on `file:`), `SkeletonUtils.clone`, Bestiary `Imp` & `Puglin` clips + bone attachments (`ShadowBlade`, `DreadCrown`, `BehemothSpines`), and classic `Gloomblob` procedural bypass.
   - Heavy poise/knockback resistance, radial **Eclipse Shockwave Slam** AoE damage & knockback, **Dread Knight** front-arc cleave & evasive roll, **Cinder Imp** evasive roll, **Shadow Stinger** aerial dive, **Shadow Weaver** leaping pounce, pooled telegraph ring reuse (zero runtime `scene.add`), zero emojis, and zero-GC hot-loop verification (runtime + static scan).
3. **Full Regression & Dual-Mode Chrome Verification:**
   - All `121` existing tests + new enemy suites passing (`0` failures).
   - Live Chrome verification in **HTTP** and **`file://`** modes showcasing all 8 Shadow Beasts side-by-side (Classic Gloomblob + Bestiary **Shadow Puglin** & **Cinder Imp** + **Shadow Weaver** + **Shadow Stinger** + **Dread Knight** + towering **Eclipse Behemoth** with crimson shockwave telegraph ring + underwater **Abyssal Stalker**), live companion pack battle, and **0 console/WebGL/CORS errors**.
