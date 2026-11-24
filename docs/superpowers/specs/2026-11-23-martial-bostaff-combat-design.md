# Martial-Arts Bo-Staff Combat Design (Wukong / Airbender Style)

**Date:** 2026-11-23
**Status:** Draft for user review
**Project:** Blobby Worlds: The Starkeeper (zero-build Three.js r128, dual-mode HTTP/GitHub Pages + `file://`)

---

## 1. Goal & Problem Statement

After upgrading Starkeeper to the rigged `assets/starkeeper.glb` skeleton, melee combat lost its physical punch for three concrete technical reasons:

1. **50/50 animation dilution:** In `rig.js`, melee overlays play at weight `1.0` simultaneously with base locomotion (`Idle`/`Walk`/`Jog`/`Sprint`) at weight `1.0` in `NormalAnimationBlendMode`. Three.js's `AnimationMixer` normalizes equal-weight normal actions to **50% / 50%**, literally cutting every swing, torso coil, lunge, and the 360° whirlwind spin in half.
2. **Clip mismatch & cutoff:** Hit 1 (`Melee1` = UAL `Sword_Attack`, `1.37s`) is a slow sword chop whose `timeScale` cap (`2.2`) cuts off the swing right after windup inside our `0.27s` combo window.
3. **Rigid staff & static VFX:** The staff is bolted rigidly inside `HandR` with zero martial-arts twirling, and the slash VFX sits on a fixed chest-height crescent plane instead of trailing off the real moving Star-Lantern tip.

**Success criteria:** Every melee click and combo chain feels explosive, acrobatic, and unmistakably like a martial-arts bo-staff (*Black Myth: Wukong* / *Avatar: The Last Airbender* energy): full-body committed stances, real staff spins and wrist twirls, glowing live 3D light ribbons whipping straight off the spinning Star-Lantern tip, and snappy kinetic hit-stop + audio punch—while keeping zero hot-loop GC allocations and 100% dual-mode (`http`/`file://`) compatibility.

---

## 2. Architecture & Components

### 2.1 Full-Authority Combat Blending (`rig.js`)
- Track a smooth scalar `combatAuthority` (`0..1`) driven cleanly by whether a full-body combat overlay (`Melee1`, `Melee2`, `Spin360`, `SlideThrust`, `PlungeDive`, `PlungeLand`, `CastNova`) is active:
  - Ramps up rapidly (`~0.045s` snap-in) when a melee/plunge overlay triggers.
  - Smoothly eases back down (`~0.16s`) when the overlay completes so Starkeeper settles fluidly back into `Idle`/`Run` with zero 1-frame pop.
- Set `activeBase.setEffectiveWeight(1 - combatAuthority)` (clamped `[0.04, 1.0]` during non-full-body `CastShoot`, and `[0.0, 1.0]` during full-body melee/plunge moves so melee animations command **100% full-body skeletal weight**!).
- Keep `state.combatAuthority` exposed on `controller.state` for deterministic unit-test verification.

### 2.2 Purpose-Authored Wukong / Airbender Bo-Staff Clips (`scripts/build_starkeeper_glb.py`)
Replace UAL `Sword_Attack` with two dedicated synthesized bo-staff clips (`Melee1` and `RollStrike`, keeping exact **32 total clips**: 21 retargeted UAL + 11 synthesized so `tests/glb-asset.test.mjs` and `rig.js` stay 100% compatible) and upgrade all melee clips in `build_synthesized_clips()`:

| Clip | Gameplay Move | Duration | Martial-Arts Choreography |
|---|---|---|---|
| `Melee1` | Hit 1 | `0.34s` | Snappy coiled left-shoulder windup → explosive **full-extension diagonal forehand bo-sweep** across front (`Hips` yaw `-0.55 → +0.62`, torso twist `+0.85`, deep front knee lunge `dy = -0.14m`, left arm balanced back, right arm whipping wide across `+Z` → `-X`). |
| `Melee2` | Hit 2 | `0.36s` | Low athletic crouched stance (`dy = -0.18m`) → coiled right hip → blistering **reverse backhand bo-whip** sweeping `-X → +X` with rising shoulder follow-through (`Hips` yaw `-0.58 → +0.72`). |
| `Spin360` | Hit 3 / Dash-Whirl | `0.48s` | Brief coil (`dy = -0.14m`) → **athletic airborne hop (`dy = +0.16m`)** while whipping a **true full 360° whirlwind body spin** (`0 → 2π` around `Hips` Y) with right arm extended horizontally at 100% reach → crisp landed martial horse-stance! |
| `RollStrike` | Roll-Strike / Dash-Cut | `0.34s` | Explosive low-to-high rising lunge out of a roll/dash, whipping the right arm & staff up and across in a fierce diagonal uppercut cleave. |
| `SlideThrust` | Sprint Slide-Thrust | `0.46s` | Deep baseball-slide lunge (`dy = -0.36m`) driving the right arm & staff straight forward like a blazing spear (`Hand.R` aimed dead ahead along `+Z`, left leg extended forward, right knee tucked low). |
| `PlungeDive` | Aerial Star-Slam | `0.34s` | High overhead two-handed-style vault coil (`UpperArm.R` & `UpperArm.L` raised overhead) → steep downward meteor drive plunging the Star-Lantern straight toward the earth. |
| `PlungeLand` | Aerial Impact | `0.36s` | Deep hero one-knee crater landing (`dy = -0.32m`) planting the Star-Lantern vertically into the ground before rising back into guard. |

Every synthesized clip includes explicit `Neck` & `Head` tracks so his gaze stays fiercely locked forward onto the target (zero head spin).

### 2.3 Independent Martial-Arts Staff-Spin Pivot (`rig.js` + `models.js`)
- Inside `HandR` (`rig.js`), mount a lightweight `staffMount` at the closed palm cavity `(0.004, 0.138, -0.036) * invS` with the base palm orientation (`rotation.z = Math.PI/2, x = 0.06, y = 0.08`), and child `staffSpinPivot` → `staff` inside `staffMount`. Because `staff`'s shaft runs along its local `+Y` axis, spinning `staffSpinPivot.rotation.x` (or `z`) performs a clean end-over-end martial bo-staff helicopter/wrist twirl centered directly on his leather grip, while spinning `staffSpinPivot.rotation.y` performs an axial star-drill spin:
    - **Hit 1 (`meleeStep === 1`):** Snappy `0 → +π` (`180°`) forward bo-whip arc extension as the arm sweeps, snapping smoothly back via `flourishT`.
    - **Hit 2 (`meleeStep === 2`):** Crisp **full `360°` (`-2π`) wrist-twirl** through the backhand whip-slash!
    - **Hit 3 (`meleeStep === 3`, `Spin360` / `Dash-Whirl`):** Blazing **`720°` (`-4π`) helicopter staff windmill** orbiting around Starkeeper's grip while his whole body spins 360°!
    - **Roll-Strike (`meleeStep === 4`) & Dash-Cut (`meleeStep === 6`):** Fast `360°` (`+2π`) forward baton-spin flourish into the piercing strike!
    - **Sprint Slide-Thrust (`meleeStep === 7`):** High-speed **axial drill spin** (`1080°` around the staff's own shaft `+Y` axis) turning the Star-Lantern into a blazing golden star-drill!
    - **Aerial Plunge (`plunging`):** Fast vertical overhead windmill (`+2π`) during windup, locking lantern-downward during descent!
    - **Post-combo martial flourish (`flourishT`):** When a ground melee combo finishes without chaining another hit, a snappy `0.24s` **180°/360° wrist-twirl settle** snaps the Star-Lantern smoothly back to ready guard!
- Update `Models.makeStarkeeperStaff()` (`models.js`) to also store `buttCap` on `staffPivot.userData` so `CharacterRig` can expose both `getStaffTipWorldPos(out)` AND `getStaffButtWorldPos(out)` for live dual-end ribbon trails.
- Expose `state.staffSpinAngle` on `CharacterRig` for deterministic unit testing.

### 2.4 Live 3D Pooled Starlight Ribbon Trail (`game.js`)
- Pre-allocate a single reusable `BufferGeometry` ribbon mesh (`STAFF_TRAIL_SEGMENTS = 18` ring samples → `36` vertices, `34` triangles, `THREE.AdditiveBlending`, `DoubleSide`, `depthWrite: false`, reusing `slashTex` for luminous feathered energy) at boot—**ZERO runtime allocations or `scene.add()` calls**.
- During any active melee swing, plunge, roll-strike, slide-thrust, or post-combo wrist flourish:
  - Sample live world-space **Star-Lantern tip** (`getStaffTipWorldPos(_trailTip)`) and **mid-shaft anchor** (interpolated `35%` toward `getStaffButtWorldPos(_trailButt)`, giving a bold `~0.95m` glowing blade-ribbon along the spinning lantern end; during `Spin360` widen to `75%` toward butt for a massive golden helicopter star-disc!).
  - Shift the ring buffer each frame (`updateCombatVfx(dt)`), updating `position` and `color` (vertex fade from blazing white-gold/aqua leading edge to soft fading tail) in-place with `needsUpdate = true`.
  - Color-coded per martial move so combo progression pops visually:
    - Hit 1: Crisp celestial sea-teal (`0x5ef8e8`)
    - Hit 2: Bright sky-cyan to gold (`0x92f6ff`)
    - Hit 3 (`Spin360` / Dash-Whirl): Blazing solar gold (`0xffd242`)
    - Sprint Slide-Thrust: Electric aqua-gold drill (`0x7ef8ef`)
    - Air Slam (`PlungeDive`): Molten comet gold (`0xffe46b`)
  - Layer cleanly with our existing `triggerSlashVfx` burst crescent (trimmed slightly softer so the live 3D spinning tip ribbon takes center stage!) and impact sparks emitted directly from the moving lantern tip during `Spin360` & `Melee2`.

### 2.5 Visceral Martial Impact Juice (`game.js` + `physics.js` + `audio.js`)
- **Snappier Hit-Stop & Impact Sparks (`game.js`):**
  - Tune hit-stop to feel unmistakably crisp without sluggishness: `38ms` on Hit 1/2, `68ms` on Hit 3 Whirlwind / Dash-Whirl / Sprint Thrust, `82ms` on Aerial Star-Slam.
  - Spawn directional impact spark bursts + brief ground shockwave micro-ring (`1.8u`) even on Hit 3 Whirlwind impacts (in addition to Plunge Slam!).
  - Add a subtle dynamic **camera kick/zoom punch** (`camKick` in `physics.js`, `0.25–0.55u` brief push-in decaying smoothly over `0.18s`) triggered via `Physics.addCameraShake(amount)` on heavy hits so landing the 360° helicopter finisher *feels* huge!
- **Punchier Martial-Arts Bo-Staff Audio (`audio.js`):**
  - Upgrade `Sound.swing(step)`: add a crisp bamboo/hardwood **air-cut Doppler whoosh** sweep (bandpass frequency ramping dynamically across the swing!) plus a double-whoosh helicopter flutter on `Spin360`/`dashWhirl` and rhythmic spin-whir on `sprint`!
  - Upgrade `Sound.hitImpact(heavy)`: layer a crisp woody **bo-staff crack transient** (`2.2kHz` snappy burst) + deeper bass punch + sparkling Star-Lantern bell resonance on heavy hits (strictly on-key in C-D-E-F-G-A-B!).

---

## 3. Data Flow & Hot-Loop Constraints
- `physics.js` already passes `meleeT`, `meleeDur`, `meleeStep`, `plunging`, `plungeWindupT`, `plungeLandT` inside the pre-allocated `_rigState` struct—zero new per-frame objects.
- `rig.js` uses only pre-allocated scratch math objects (`_axisX`, `_axisY`, `_axisZ`, `_qYaw`, `_qPitch`) and scalar timers (`combatAuthority`, `flourishT`, `staffSpinAngle`).
- `game.js` uses pre-allocated scratch vectors (`_trailTip`, `_trailButt`, `_trailInner`) and fixed-length `Float32Array` attribute buffers for the live ribbon trail—zero `new THREE.Vector3` in hot loops.
- Dual-mode loading (`http` binary `assets/starkeeper.glb` vs `file://` `assets/starkeeper.glb.js`) remains untouched; rebuilding via `python3 scripts/build_starkeeper_glb.py` updates both in lockstep.

---

## 4. Verification Plan
1. **Automated Tests:**
   - `tests/glb-asset.test.mjs`: existing 32-clip / 4-morph / grounding / dual-mode `.glb.js` integrity stays green; verify `Melee1`, `Melee2`, `Spin360`, `SlideThrust` all contain `Hips`, `UpperArm.R`, `Hand.R`, `Neck`, `Head` tracks.
   - `tests/rig.test.mjs`: assert `combatAuthority` ramps to `~1.0` during melee (dropping `activeBase` weight near `0`, eliminating 50/50 dilution!), recovers smoothly back to `0` after melee, and drives non-zero `staffSpinAngle` twirls (`Hit 2 ≥ 360°`, `Spin360 ≥ 540°`, `SlideThrust` axial drill spin) + exposes live `getStaffButtWorldPos()`.
   - `tests/game-integration.test.mjs`: verify live pooled staff trail ribbon activates during `meleeAttack()` without allocating `Vector3` or calling `scene.add()`, and verify zero regressions across all existing combat/combo tests.
   - `tests/audio.test.mjs`: verify upgraded martial `swing()` and `hitImpact()` stay 100% on-key in `C-D-E-F-G-A-B`.
2. **Live Chrome Visual Verification:**
   - Capture mid-swing action frames in Chrome for **Hit 1 Forehand Sweep**, **Hit 2 Backhand Wrist-Twirl**, **Hit 3 360° Airborne Helicopter Spin** (showing full 360° body rotation + spinning staff + live glowing golden ribbon trail!), and **Sprint Slide-Thrust Drill** with zero console/WebGL errors on both HTTP and `file://`.
