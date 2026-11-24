# Sub-Project 2: Visceral Staff Melee Combos, Manual Aiming, Health/Fall/Drowning Stakes, True Directional Rolling & Mortal Fighting Companions

**Date:** 2026-11-22  
**Status:** Approved Design Spec

## Scope
1. **True Directional Rolling Fix (`physics.js`)**:
   - Holding `C` or `X` and pressing any movement/arrow key immediately triggers a roll in that direction (and pressing `C`/`X` while moving rolls along travel/input direction).
   - **Preserves `P.facing`**: Never overwrites `P.facing` with `rollDir`; computes `(rollLocalFwd, rollLocalSide)` relative to `P.facing` and animates true forward somersault (`+rotation.x`), backward roll (`-rotation.x`), or sideways barrel-roll (`±rotation.z`) so the Starkeeper exits side-rolls and back-rolls still facing forward.
   - Prevents directional key held during `X`/`C` roll-stance from merely walking before rolling.
2. **Visceral Star-Staff Melee Combos & Context Moves (`physics.js`, `game.js`, `models.js`, `audio.js`)**:
   - **Left-Click** executes Star-Staff melee attacks (leaving **`F`** dedicated to manual-aimed Star Bolts):
     - **3-Hit Ground Combo** (`0.65 s` chain window): Hit 1 Forehand Arc Sweep (`1 dmg`), Hit 2 Backhand Cross Slash (`1 dmg`), Hit 3 360° Spinning Starburst Finisher (`2 dmg`, heavy knockback + radial ring).
     - **Roll Dash-Strike** (Left-Click during/right after roll): lunging forward staff thrust (`2 dmg`) + piercing crescent wave.
     - **Aerial Plunge Star-Slam** (Left-Click while airborne `y > ground + 0.7`): rapid diving slam (`vy = -22`) erupting into a `3.8 u` AoE ground shockwave (`2 dmg`, heavy knockback, absorbs cliff fall damage).
   - **Visceral Feedback**: Hit-stop (`45–75 ms`), damped camera trauma shake (`Physics.addCameraShake(amount)`), pooled additive 3D slash arc & shockwave ring VFX, and procedural SFX (`Sound.swing(step)`, `Sound.hitImpact(heavy)`, `Sound.slam()`, `Sound.hurt()`, `Sound.heartPickup()`, `Sound.death()`, `Sound.respawn()`).
3. **Manual Aiming for Star Bolts (`F`) — Zero Passive Auto-Aim (`physics.js`, `index.html`, `game.js`)**:
   - Remove passive 14-unit auto-aim snapping in `Physics.getAimDirection()`.
   - Add a subtle center-screen celestial crosshair (`#aimReticle`, hidden when Z-targeting is active).
   - When unlocked, `F` fires Star Bolts strictly toward the center-screen camera view ray (`camPos + camForward * 32`). When Z-targeted (`Tab` / Right-Click), both melee lunges and `F` bolts track the locked enemy.
4. **Classic Zelda Stakes: 6 Hearts, Telegraphed Gloomblob Attacks, Fall Damage, Drowning & Sanctuary Respawn (`physics.js`, `models.js`, `index.html`, `game.js`)**:
   - **6 Hearts (`maxHp = 12` half-hearts)** displayed in `#heartsHud` below the top-left pills (pulses when `hp <= 3`).
   - **Telegraphed Gloomblobs (`3 HP`)**: `wander` → `chase` → `windup` (`0.42 s` crouch + crimson-amber eye flare) → `lunge` (`2 dmg` = 1 full heart to Starkeeper, or `1 dmg` to fighting companions) + knockback + red damage vignette (`#damageFlash`) + `1.1 s` post-hit `hurtInvulnT`.
   - **Fall Damage**: Landing with downward speed `< -14.5 u/s` (unless canceling via Plunge Slam) deals `2..6` half-hearts (`1–3` full hearts) with shockwave dust, camera shake, and `Sound.hurt()`.
   - **Drowning Damage**: Below water surface with `air <= 0`, remove auto-float assist; tick `1` half-heart (`0.5 heart`) every `1.4 s` with red flash, bubble gasp, and `Sound.hurt()` until surfacing or reaching `0 HP`.
   - **Healing**: Defeated Gloomblobs drop bouncing ruby **Heart Crystals** (`Models.makeHeartPickup()`, `+2 HP` = 1 full heart, 45% base drop chance / 75% when hurt); lighting a Star Totem restores full 6 Hearts (and heals surviving companions).
   - **Death & Respawn (`0 HP`)**: `2.0 s` collapse + `#deathOverlay` fade, lose at most 3 carried stars, respawn at last lit Star Totem sanctuary (or `home`) with full `12 HP` & full air, and immediately regroup all surviving companions around you.
5. **Mortal Fighting Companions (`game.js`)**:
   - Remove random star-digging (`findT`) completely.
   - Each rescued/befriended Starling has `hp = 3, maxHp = 3, hurtInvulnT = 0`.
   - Up to 3 nearby companions break formation to engage Gloomblobs within `14 u` using species-flavored attacks (`quad` pounce, `bird` dive-peck, `bug` spark-zap, `lizard` flame-lunge) dealing `1 dmg` + knockback with cooldown `1.9–2.4 s`.
   - Gloomblobs can counter-attack and damage companions (`1 dmg` + knockback + flash); if a companion reaches `0 HP`, it falls in a starlight burst, drops a ruby Heart Crystal, updates the `Friends` count, and shows a toast.
