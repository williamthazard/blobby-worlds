# Sub-Project 1: Movement Feel, Sprint, Directional Roll, True 3D Swimming, Controls HUD & Floating-Star Fix

**Date:** 2026-11-22  
**Status:** Approved Design Spec

## Scope
1. **Jump Physics & 3-Phase Airborne Animation (`physics.js`, `audio.js`)**:
   - Variable jump height: `JUMP_VEL = 9.8`, rise gravity `22`, apex hang gravity `17` (`|vy| <= 1.8`), fall gravity `30`, early Space-release jump-cut gravity `42` (`vy > 2.5`).
   - Takeoff stretch (`scale` spring), takeoff dust/splash puff, and procedural `Sound.jump()`.
   - Distinct rising (asymmetric leap: right knee driven up, left leg trailing back, reach arm up, cloak streaming down), apex (balanced poise), and falling (braced legs, balance arms out, cloak billowing high) poses.
2. **Unlimited Sprint (`Shift`) & Directional Roll (`C` / `X`) (`physics.js`)**:
   - Hold `Shift` (Left or Right) for unlimited sprinting: ramps ground speed `7.0 -> 11.2 u/s`, swim speed `4.5 -> 7.0 u/s`, faster stride cadence, athletic forward lean, wider cloak billow, subtle dynamic camera FOV (`60 -> 65°`), and sprint dust puffs.
   - Press `C` or `X` (`KeyC` / `KeyX`) for directional rolling:
     - Moving (`spd > 0.6`): rolls in pressed input direction (or current horizontal travel velocity `(vx, vz)` if coasting).
     - Standing (`spd <= 0.6`): only rolls if a movement/arrow direction is pressed (or tapped within a `0.18s` `rollBufT` window) — enabling side-rolls and back-rolls from standing without lunging forward on an empty press.
3. **True 3D Swimming & Diving (`physics.js`)**:
   - Prone horizontal swim posture (`pelvis.rotation.x` smoothly ~`1.28 rad` adjusted by 3D `swimPitch`) with head lifted forward, alternating wide sweeping arm strokes (`arm.rotation.x` + `arm.rotation.z`), and flutter kicks when moving; upright treading-water pose when idle.
   - Camera-aimed 3D swim vector: moving forward follows `camPitch` (3rd-person) / `lookPitch` (1st-person) — look down & move to dive, look level to cruise neutrally underwater without forced surface bounce, look up & move to ascend.
   - `Space` ascends smoothly toward surface; tapping `Space` at the water surface near shallow ground triggers a crisp water-exit hop.
   - Air still drains below surface and refills at surface; gentle upward buoyancy assist only when `P.air <= 0`.
4. **Always-Accessible Controls Reminder HUD (`index.html`, `game.js`)**:
   - Top-right `Controls (H)` pill button alongside `Quality` and `Sound`.
   - Clicking or pressing `H` / `?` toggles a sleek compact glassmorphic keybind card on the right side without restarting or blocking gameplay (closes via `H`, `?`, `Escape`, or `×`).
   - Update start-screen controls list to document `Shift` (Sprint), `C / X` (Directional Roll), and camera-aimed Dive / `Space` Swim Up.
5. **Floating-Star Magnet Bug Fix (`game.js`)**:
   - Inside magnet range (`dHoriz < 3.4` and `|dy| < 4.5`), pull `p.position` cleanly toward `_playerPickupVec` (`dt * 7`) WITHOUT applying the conflicting `u.baseY` hover-Y pull so magnetized stars never stall indefinitely above the Starkeeper's head.
