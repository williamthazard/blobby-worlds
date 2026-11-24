# Sub-Project 1 Design: Starkeeper Rigged `.glb` & Four-Layer `AnimationMixer` Pipeline

**Date:** 2026-11-23
**Status:** Approved Design Spec (Ready for Implementation Plan)
**Target Environment:** Zero-build pure browser (GitHub Pages / static HTTP **and** double-click `file://`), Three.js r128, 60 FPS forward MSAA renderer.

---

## 1. Goals & Scope

Upgrade Starkeeper from a nested-`Group` procedural rig driven by imperative Euler `if/else` poses to a **real skinned humanoid `.glb`** driven by Three.js's native skeletal animation pipeline — directly incorporating the four official Three.js animation patterns:
1. **`webgl_animation_skinning_blending`:** `THREE.SkinnedMesh` + `THREE.AnimationMixer` + `crossFadeTo` / phase-synchronized transitions (zero 1-frame snap/blink between any two states).
2. **`webgl_animation_skinning_additive_blending`:** `THREE.AnimationUtils.makeClipAdditive` + `THREE.AdditiveAnimationBlendMode` for independent posture, guard crouch, hit flinch, and upper-body combat layers.
3. **`webgl_animation_skinning_morph`:** `geometry.morphAttributes.position` + `mesh.morphTargetInfluences` for organic facial expressions (`Blink`, `Determined`, `Smile`, `Hurt`).
4. **`webgl_animation_walk`:** Speed-coupled `timeScale` (`actualSpeed / refSpeed`) and smooth directional locomotion (`Walk`, `Jog`, `Sprint`, `StrafeLeft`, `StrafeRight`, `Backpedal`).

**In scope (Sub-project 1):**
- Offline Python asset compiler producing a single compact CC0 `assets/starkeeper.glb` + `file://`-only `assets/starkeeper.glb.js` + `assets/LICENSE-CC0.txt`.
- Local vendoring of Three.js r128 `vendor/GLTFLoader.js` (so both GitHub Pages and offline `file://` work with zero third-party CDN fragility).
- New focused module `rig.js` (`CharacterRig`) implementing dual-mode loading, PBR Starkeeper restyling, bone-mounted signature gear (Astronomer Hat, continuous flowing Crimson Cloak + twin Sea-Teal Scarf, glowing Star-Lantern Staff), live Staff-Lantern muzzle world position, and the 4-layer `AnimationMixer` controller.
- Clean delegation from `physics.js` and `game.js`, preserving the existing procedural rig as an automatic loading/headless-test fallback.

**Out of scope (deferred to Sub-project 2):**
- Rigged `.glb` wildlife/companions (cats, foxes, deer, bears, birds, fish).

---

## 2. Offline Asset Pipeline (`scripts/build_starkeeper_glb.py`)

Players and GitHub Pages require **zero build step** — `scripts/build_starkeeper_glb.py` is run once during development to produce the static files committed into `assets/`.

### 2.1 Verified CC0 1.0 Public Domain Sources
- **Base Humanoid Mesh & 49-Bone Skeleton:** Quaternius `Adventurer.glb` (`modular_men/Adventurer.glb` from `trebeljahr/quaternius-showcase`, CC0 1.0).
  - Contains `Adventurer_Head` (7,362 verts across Skin, Eyebrows, Eye, Hair), `Adventurer_Body` (7,104 verts across outer coat, inner tunic, sculpted 5-finger hands), `Adventurer_Legs` (1,670 verts), `Adventurer_Feet` (944 verts), all with `POSITION`, `NORMAL`, `TEXCOORD_0`, `JOINTS_0`, `WEIGHTS_0`.
  - Strips `Backpack` (3,503 verts) during build so the back stays clean for Starkeeper's continuous crimson cloak and scarf.
- **Animation Library:** Quaternius `AnimationLibrary_Godot_Standard.gltf` + `.bin` (`J-Ponzo/gltf-universal-animation-library`, CC0 1.0, 46 animations on a 1-to-1 matching humanoid topology).
- **License Record:** Written to `assets/LICENSE-CC0.txt` noting both Quaternius CC0 1.0 sources and our custom retargeting/morph additions.

### 2.2 Exact 1-to-1 Skeletal Retargeting
All 49 joints of `Adventurer.glb` map 1-to-1 onto `AnimationLibrary_Godot_Standard.gltf`'s `DEF-*` skeleton (`Root` ↔ `root`, `Hips` ↔ `DEF-hips`, `Abdomen`/`Torso`/`Chest` ↔ `DEF-spine.001/.002/.003`, `Neck`/`Head` ↔ `DEF-neck`/`DEF-head`, `Shoulder/UpperArm/LowerArm/Hand` ↔ `DEF-shoulder/upper_arm/forearm/hand`, all 5 fingers L/R, `UpperLeg/LowerLeg/Foot` ↔ `DEF-thigh/shin/foot`).

For every animated bone $b$ with parent $p$, world rest rotations $R^{\text{src}}, R^{\text{tgt}}$ are computed from bind hierarchies once, and every keyframe local quaternion $q_{\text{src}}(t)$ is retargeted via exact world-rest-basis similarity transform:
$$q_{\text{tgt}}(t) = \left((R^{\text{tgt}}_p)^{-1} R^{\text{src}}_p\right) \cdot q_{\text{src}}(t) \cdot \left((R^{\text{src}}_b)^{-1} R^{\text{tgt}}_b\right)$$
Hips translation keyframes are transformed into target root space and scaled by the exact rest hip-height ratio (`tgtHipY / srcHipY`) so feet stay firmly planted on `y = 0`. Baking retargeting offline eliminates Three.js r128 `SkeletonUtils.retargetClip` quirks with Blender's `-90° X / scale=100` root nodes and avoids runtime startup CPU hitching.

### 2.3 Curated Animation Clip Set (32 Clips)
- **Retargeted directly from UAL (22 clips):**
  `Idle` (`Idle_Loop`), `IdleStaff` (`Idle_Torch_Loop`), `Walk` (`Walk_Loop`), `Jog` (`Jog_Fwd_Loop`), `Sprint` (`Sprint_Loop`), `CrouchIdle` (`Crouch_Idle_Loop`), `CrouchFwd` (`Crouch_Fwd_Loop`), `JumpStart` (`Jump_Start`), `JumpLoop` (`Jump_Loop`), `JumpLand` (`Jump_Land`), `Roll` (`Roll`), `SwimIdle` (`Swim_Idle_Loop`), `SwimFwd` (`Swim_Fwd_Loop`), `CastEnter` (`Spell_Simple_Enter`), `CastShoot` (`Spell_Simple_Shoot`), `CastLoop` (`Spell_Simple_Idle_Loop`), `Melee1` (`Sword_Attack`), `MeleeJab` (`Punch_Jab`), `MeleeCross` (`Punch_Cross`), `HitReact` (`Hit_Chest`), `Death` (`Death01`), `Cheer` (`Interact`).
- **Synthesized / Mirrored cleanly on the exact same `Adventurer` bone space (10 clips):**
  - `Backpedal`: time-reversed `Walk` with slight defensive torso forward lean.
  - `StrafeLeft` / `StrafeRight`: authentic lateral sidestepping (abducting hips/thighs laterally with alternating knee lifts, counter-angled pelvis vs. forward-locked chest, poised staff guard).
  - `Melee2`: left-right mirrored `Melee1` for crisp Hit 1 (forehand) → Hit 2 (backhand) flow.
  - `Spin360`: 360° whirlwind spin around `Hips` Y with extended right arm & staff sweep.
  - `SlideThrust`: low forward ground-slide with extended lead leg, tucked rear leg, and dead-level forward right-arm spear thrust.
  - `HillSlide`: asymmetric steep-hill surf brace (bent uphill knee, extended downhill bracing leg, leaned-back torso, balanced outstretched arms).
  - `PlungeDive` / `PlungeLand`: overhead meteor dive and one-knee crater landing.
  - `CastNova`: skyward two-hand staff raise for 360° Constellation Nova.

### 2.4 Baked Facial Morph Targets (`Adventurer_Head`)
Four standard glTF `targets` (`POSITION` deltas) baked onto `Adventurer_Head` primitives (skin/eyebrows/eyes):
1. `Blink` — lowers upper eyelid region over the eye sockets cleanly.
2. `Determined` — lowers and angles inner brows inward for focused combat/Z-target gaze.
3. `Smile` — lifts mouth corners & softens cheeks warmly when befriending Starlings or lighting Totems.
4. `Hurt` — winces brow/cheeks briefly when taking damage.

### 2.5 Normalization & Dual-Mode Outputs
- Normalizes character mesh root scale so standing height is `1.85u` (head crown under hat ~`1.75u`), boot soles rest cleanly at `minY = 0.000`, and forward direction is `+Z`.
- Outputs:
  - `assets/starkeeper.glb` (target `< 1.2 MB`, binary glTF 2.0 served directly on GitHub Pages / HTTP).
  - `assets/starkeeper.glb.js` (`window.__STARKEEPER_GLB_B64__ = "..."`, loaded **only** when `location.protocol === 'file:'`).
- Compiler self-checks: asserts non-empty skin, all expected clip names present, all morph targets present, all accessor floats finite, `|minY| < 0.005`, and output size within budget.

---

## 3. Starkeeper Identity & Bone-Mounted Equipment

### 3.1 Material Restyling (`rig.js`)
When `assets/starkeeper.glb` loads, `CharacterRig` replaces the flat base materials on every `SkinnedMesh` with our procedural `Textures.sets` PBR materials (`skinning: true`, plus `morphTargets: true` on head primitives):
- `Green` (outer coat) → midnight-indigo woven cloth (`Textures.sets.cloth`)
- `LightGreen` (inner tunic/lapels) → sea-teal woven cloth (`Textures.sets.cloth`)
- `Brown2` (trousers) → deep slate-indigo cloth (`Textures.sets.cloth`)
- `Brown` (belt/trims/cuffs) → warm stitched leather (`Textures.sets.leather`)
- `Black` / `Grey` (boots) → dark pebbled leather (`Textures.sets.leather`)
- `Hair` → dark chestnut (`0x3e2415`, soft satin sheen)
- `Skin` → warm porcelain skin (`0xf3c9ad`)
- `Eye` → bright cerulean star-blue (`0x1b66b8`)
- `Eyebrows` → dark chestnut (`0x2f1b10`)
- All opaque skinned meshes set `castShadow = true`, `receiveShadow = true`, and `frustumCulled = false` (prevents Three.js r128 bounding-sphere culling during extended animations like rolls/spins/jumps).

### 3.2 Shared Attachment Factories (`models.js`)
Extract three focused builders on `Models` (reused by both the procedural fallback and `rig.js` so zero geometry is duplicated):
- `Models.makeStarkeeperHat()` → Wide-brimmed astronomer hat with curved brim, gold rim trim, tilted cone, brass band, star pin, tip crystal, and glow sprite — mounted onto the GLB **`Head`** bone.
- `Models.makeStarkeeperCloak()` → Single-piece continuous `18×24` pleated crimson cloak (`continuousBend: true, goldHem: true`) + twin sea-teal scarf ribbons (`bendOffset: +0.075, goldHem: true`) — mounted onto the GLB **`Chest`** bone (driven continuously by `Shaders.setClothCurve`).
- `Models.makeStarkeeperStaff()` → Full Star-Lantern Staff (`shaft`, `grip`, `collarTop`, `buttCap`, brass cage rings, glowing star crystal, `staffHalo`, `pearlAura`, warm `PointLight`) — mounted onto the GLB **`Hand.R`** bone, aligned cleanly through the curled palm and angled outward so it never clips the hat brim.

---

## 4. Runtime Architecture & Four-Layer `AnimationMixer` (`rig.js`)

### 4.1 Script Load Order (`index.html`)
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="vendor/GLTFLoader.js"></script>
<script src="audio.js"></script>
<script src="textures.js"></script>
<script src="shaders.js"></script>
<script src="regions.js"></script>
<script src="world.js"></script>
<script src="models.js"></script>
<script src="rig.js"></script>
<script src="physics.js"></script>
<script src="game.js"></script>
```
*(Updates `tests/game-integration.test.mjs` script-order check to include `vendor/GLTFLoader.js` and `rig.js`.)*

### 4.2 Dual-Mode Loading & Zero-Stutter Hot-Swap
- `CharacterRig.attachToPlayer(playerRoot, opts)`:
  - Wraps the procedural fallback meshes (`pelvis`) inside `playerRoot.userData.proceduralRoot` (visible immediately on frame 0).
  - Detects protocol:
    - `http:` / `https:` (including GitHub Pages): `loader.load('./assets/starkeeper.glb', onLoaded, undefined, onError)` — `starkeeper.glb.js` is **never requested**.
    - `file:`: injects `<script src="./assets/starkeeper.glb.js">`, decodes base64 to `ArrayBuffer`, and calls `loader.parse(arrayBuffer, '', onLoaded, onError)`.
  - On load: mounts `glbRoot` inside `playerRoot`, binds `AnimationMixer`, attaches Hat/Cloak/Staff to bones, sets `proceduralRoot.visible = false`, and sets `controller.ready = true`.
  - On error or missing `GLTFLoader` (e.g., headless Node tests): logs one concise `console.warn` and keeps `proceduralRoot` active with zero thrown exceptions.

### 4.3 Four-Layer `AnimationMixer` State Machine
`controller.update(dt, time, state)` updates all four layers every frame with zero per-frame object allocations:

1. **Base Locomotion Layer (`NormalAnimationBlendMode` + `crossFadeTo`):**
   - Priority selector resolves desired base state from `state`:
     `Death` → `Roll` → `SwimFwd`/`SwimIdle` → `HillSlide` → `JumpStart`/`JumpLoop` (airborne) → `JumpLand` (landing compression) → directional ground locomotion (`StrafeLeft` / `StrafeRight` / `Backpedal` when locked on or moving sideways/backward; `Sprint` / `Jog` / `Walk` when moving forward) → `Idle`.
   - Transitions invoke `prevAction.crossFadeTo(nextAction, fadeDur, true)` (`fadeDur = 0.14–0.24s`), matching normalized stride phase when switching between `Walk`, `Jog`, and `Sprint`.
   - Couples `timeScale` to real horizontal velocity (`clamp(spd / refSpd, 0.55, 1.6)`) so footwork stays grounded without ice-skating.

2. **Action / Combat Layer (Crossfaded One-Shots):**
   - Triggered cleanly from `state.meleeStep` / `state.castStep` / `state.plunging` / `state.plungeLandT` / `state.hurtFlashT`:
     - `meleeStep 1` → `Melee1`, `meleeStep 2` → `Melee2`, `meleeStep 3` → `Spin360`, `meleeStep 4/6` → `Melee1` (accelerated), `meleeStep 7` → `SlideThrust`, `plunging` → `PlungeDive`, `plungeLandT > 0` → `PlungeLand`, `castStep 1..5` → `CastShoot`, `castStep 6` → `CastNova`.
   - Plays with fast attack fade-in (`0.06–0.08s`) and automatically crossfades smoothly back (`0.18–0.24s`) into the active base state when finished — **zero 1-frame snap-back**.

3. **Additive Layer (`THREE.AnimationUtils.makeClipAdditive` + `THREE.AdditiveAnimationBlendMode`):**
   - **Z-Target Combat Guard:** `CrouchIdle` converted to additive delta; smoothly ramps weight `0 → 0.50` while `state.lockedOn` is true, layering an athletic ready stance across idle, walk, backpedal, and strafe.
   - **Hit Recoil:** `HitReact` converted to additive delta; pulses weight briefly when `state.hurtFlashT > 0` without interrupting movement.
   - **Post-Mixer Procedural Bone Offsets:** After `mixer.update(dt)`, applies smoothly damped bounded quaternion offsets to `Neck`/`Head` for live target/Starling/downhill look-at, and slight upward/downward aim pitch to `Chest`/`UpperArm.R` while casting uphill or downhill.

4. **Facial Morph Layer (`morphTargetInfluences`):**
   - Drives smooth damped weights on `headMesh.morphTargetInfluences`:
     - `Blink`: periodic 0.16s blink every ~4.2s.
     - `Determined`: `0.85` when locked on, attacking, plunging, or casting.
     - `Smile`: `0.90` for `2.5s` triggered via `controller.triggerEmote('smile', 2.5)` when befriending a Starling, lighting a Totem, or discovering a Secret Shrine.
     - `Hurt`: `1.0` when `state.hurtFlashT > 0`, smoothly decaying to `0`.

5. **Cloth, Lantern & Live Muzzle Sync:**
   - Feeds `Shaders.setClothMotion` and `Shaders.setClothCurve` identically to the procedural rig so the single-piece crimson cloak and twin sea-teal scarf flow continuously with speed, turns, jumps, spins, and slides.
   - Flares `staffHalo` during casts/melee/plunge and toggles `pearlAura` underwater when `hasBreathRelic` is true.
   - `controller.getStaffTipWorldPos(out)` calls `playerRoot.updateMatrixWorld(true)` and reads `staffHalo.getWorldPosition(out)` so `shoot()` in `game.js` launches every Star Bolt and muzzle starburst from the exact live Star-Lantern crystal tip!

---

## 5. Integration Boundaries & Compatibility

- **`physics.js`:** Adds a single pre-allocated `_rigState` struct passed to `u.glbRig.update(dt, time, _rigState)` inside `animatePlayerRig` whenever `u.glbRig && u.glbRig.ready`. Keeps the existing procedural `animatePlayerRig` intact when `u.glbRig` is absent/loading (preserving 100% compatibility with all existing physics unit tests!).
- **`game.js`:**
  - Calls `CharacterRig.attachToPlayer(player, { Models, Textures, Shaders })` right after creating `player`.
  - In `shoot()`, uses `player.userData.glbRig.getStaffTipWorldPos(_boltFrom)` when ready (falling back to the analytical muzzle formula if procedural).
  - Calls `player.userData.glbRig?.triggerEmote('smile', 2.5)` on befriending a Starling, lighting a Totem, or finding a Secret Shrine.
  - Exposes `CharacterRig` on `window.__GAME_DEBUG__` for automated & live inspection.

---

## 6. Verification & Testing Strategy

1. **Asset Compiler Validation (`scripts/build_starkeeper_glb.py`):** Verifies 1-to-1 bone retargeting counts, all expected clip names, 4 facial morph targets, finite vertex/keyframe floats, exact `y = 0` boot grounding, and `< 1.2 MB` file size.
2. **Unit Tests (`tests/rig.test.mjs`):**
   - Dual-mode loader selects `./assets/starkeeper.glb` on `http:`/`https:` and `./assets/starkeeper.glb.js` on `file:`.
   - Graceful fallback keeps procedural Starkeeper visible with zero errors when `GLTFLoader` is missing or load fails.
   - `AnimationMixer` transitions invoke `crossFadeTo` across `Idle` → `Walk` → `Sprint` → `StrafeLeft`/`StrafeRight` → `Backpedal` → `JumpLoop` → `Melee1` → `Idle` with speed-coupled `timeScale`.
   - `AdditiveAnimationBlendMode` guard crouch weight ramps up smoothly under Z-target lock-on.
   - Facial `morphTargetInfluences` respond to blink, combat determination, `triggerEmote('smile')`, and hurt flash.
   - `getStaffTipWorldPos(out)` returns finite world coordinates from `Hand.R`'s attached staff crystal, and `update()` performs zero runtime `Vector3`/`Quaternion` allocations.
3. **Full Regression Suite:** `node --test --test-concurrency=1 --test-timeout=5000 tests/*.test.mjs` — all existing 68+ tests + new `tests/rig.test.mjs` must pass 100%.
4. **Live Chrome Visual & Dual-Mode Check:**
   - Verify BOTH `http://127.0.0.1:8767/#test` (GitHub Pages HTTP mode) AND `file:///Users/spencergraham/desktop/other/games/index.html#test` (`file://` embedded mode) load with **0 JS/WebGL errors**.
   - Visually inspect screenshots across: Front close-up (face, hair, astronomer hat fit, indigo/teal PBR tunic, boots on pad), Back idle & sprint (continuous crimson cloak + twin sea-teal scarf), Z-target lateral strafe, Melee slash/spin, Staff-Lantern Tip firing, and facial morph expressions.
