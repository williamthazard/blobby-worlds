# Escalating & Territorial Skinned Shadow Beasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Blobby Worlds' beloved classic procedural **Gloomblob** as **Tier 1 (`3 HP`)** while escalating into 7 curated, territory-themed **skinned & animated `.glb` Shadow Beasts** (including `Puglin.glb` and `Imp.glb` from `assets/Bestiary - Dungeon Monsters Kit[Standard]/` retargeted from Quaternius's Universal Animation Library, plus `weaver`, `stinger`, `knight`, `behemoth`, and underwater `stalker`) driven by Hybrid Threat Scaling, real 3D physics, heavy poise, group-challenging cleave/shockwave attacks, and pooled ground warning telegraphs.

**Architecture:** Compile 7 skinned enemy `.glb` + `file://` `.glb.js` bundles offline via `scripts/build_enemies_glb.py`, extend `models.js` (`makeGloom(tierDef)` fallback + 4 cached shadow attachment/telegraph factories), encapsulate `EnemyRig`, `EnemyPhysics`, and `EnemyAI` in a zero-GC module `enemies.js`, and wire `index.html` + `game.js` cleanly via a single module-scope `_enemyCtx`.

**Tech Stack:** Pure-browser Three.js r128 (zero build step), Python 3 stdlib + Pillow, Node.js `node:test`, Chrome DevTools MCP for live HTTP & `file://` visual verification.

## Global Constraints
- **No git repository:** NEVER execute `git` commands in this workspace.
- **Dual-mode zero-build runtime:** HTTP/GitHub Pages fetches binary `./assets/enemies/<key>.glb`; double-click `file://` dynamically loads `./assets/enemies/<key>.glb.js` (`window.__ENEMY_GLB_B64__["<key>"]`).
- **Zero per-frame GC allocations:** All scratch math objects, collider arrays, and telegraph rings MUST be pre-allocated/pooled (zero runtime `new THREE.Vector3` / `Quaternion` or `scene.add` in combat loops!).
- **Strict Three.js r128 compatibility:** No `CapsuleGeometry`, strip `KHR_materials_emissive_strength` from `extensionsUsed`/`extensionsRequired` in compiled GLBs, `frustumCulled = false` on skinned meshes, exact `input.count === output.count`, sorted non-negative timestamps, unit quaternions with `dot >= 0`.
- **Zero emojis:** Clean storybook text in all HUD toasts and UI copy.
- **Classic Tier 1 Guarantee:** When `threat < 1.6` (solo near Star Sanctuary, `0` companions, `0` totems), `spawnGloom()` spawns classic Tier 1 `Gloomblob` (`3 HP`), preserving 100% compatibility with all 121 existing tests.

---

## File Structure
- **Create:** `scripts/build_enemies_glb.py` — Offline compiler for 7 skinned Shadow Beast archetypes (`puglin`, `imp`, `weaver`, `stinger`, `knight`, `behemoth`, `stalker`) + Bestiary UAL animation retargeting & 512px/256px PBR texture compression + optional local `Ultimate Monsters` override hook.
- **Create:** `assets/enemies/{puglin,imp,weaver,stinger,knight,behemoth,stalker}.{glb,glb.js}` (`<= 3.4 MB` total `.glb`).
- **Create:** `tests/enemies-glb.test.mjs` — Permanent integrity, retargeting, grounding, normal, channel-parity & quaternion-continuity suite.
- **Create:** `enemies.js` — Exports global `Enemies` (`TIERS`, `ARCHETYPE_KEYS`, `computeThreatLevel`, `pickEnemyTier`, `resolveAssetSource`, `preloadArchetype`, `attachToGloom`, `createGloomState`, `onGloomHit`, `updateGlooms`, `initTelegraphPool`, `initUnderwaterEnemies`, `_resetCache`).
- **Create:** `tests/enemies.test.mjs` — Unit & behavioral suite covering threat curve, territorial bias, dual-mode loader, `SkeletonUtils.clone`, Bestiary clips, bone attachments, poise, AoE Shockwave Slam, Dread Knight cleave/roll, Stinger aerial dive, Weaver leap, pooled telegraph rings, zero emojis, and zero-GC hot loops.
- **Modify:** `models.js` — Support optional `tierDef` in `makeGloom(tierDef)` (0-arg call stays exact classic Gloomblob), export `makeShadowBlade`, `makeDreadCrown`, `makeBehemothSpines`, `makeTelegraphRing`.
- **Modify:** `index.html` — Load `enemies.js` immediately after `animals.js` and before `game.js`.
- **Modify:** `game.js` — Wire module-scope `_enemyCtx`, delegate `gloomTargetCount`, `spawnGloom(tierOverride)`, `hitGloom`, `updateGlooms`, `initTelegraphPool`, and `initUnderwaterEnemies` to `Enemies`, expose `Enemies` on `window.__GAME_DEBUG__`.
- **Modify:** `assets/LICENSE-CC0.txt`, `tests/models.test.mjs`, `tests/game-integration.test.mjs`.

---

### Task 1: Offline Enemy `.glb` Compiler & Bestiary Retargeter (`scripts/build_enemies_glb.py`)
- **Files:** Create `scripts/build_enemies_glb.py`, `assets/enemies/*.{glb,glb.js}`, `tests/enemies-glb.test.mjs`; modify `assets/LICENSE-CC0.txt`.
- **TDD:** Write `tests/enemies-glb.test.mjs` -> RED -> implement `scripts/build_enemies_glb.py` (retargeting UAL clips onto 55-bone `Puglin.glb` & `Imp.glb`, compressing embedded 2K Bestiary textures to crisp 512px JPEG / 256px PNG, compiling all 7 archetypes normalized to `+Z` forward under `EnemyRoot`, stripping r128-unsupported extensions, total `<= 3.4 MB`) -> update `assets/LICENSE-CC0.txt` -> GREEN!

### Task 2: Shadow Bone Attachments, Pooled Telegraph Ring & `makeGloom(tierDef)` (`models.js`)
- **Files:** Modify `models.js`, `tests/models.test.mjs`.
- **TDD:** Add tests in `tests/models.test.mjs` asserting `makeGloom()` 0-arg compatibility + `makeGloom(tierDef)` fallback scaling + cached `makeShadowBlade`, `makeDreadCrown`, `makeBehemothSpines`, `makeTelegraphRing` -> RED -> implement -> GREEN!

### Task 3: `enemies.js` Part 1 — Threat Scaling, Territorial Selection & `EnemyRig`
- **Files:** Create `enemies.js`, `tests/enemies.test.mjs`.
- **TDD:** Write unit tests for `TIERS`, `computeThreatLevel`, `pickEnemyTier` (including solo Sanctuary Tier 1 guarantee, territorial bias across all 7 regions, max-1 concurrent Behemoth), `resolveAssetSource`, `preloadArchetype`, `attachToGloom` (classic Tier 1 bypass, `SkeletonUtils.clone` independent mixers, Bestiary PBR preservation + obsidian shadow restyling on CC0 meshes, bone-scale-compensated `ShadowBlade`/`DreadCrown`/`BehemothSpines`, semantic clip router with safe shared-clip `LoopRepeat` restore, eye glow sync, zero-GC `update`) -> RED -> implement -> GREEN!

### Task 4: `enemies.js` Part 2 — `EnemyPhysics`, Archetype Combat AI, Pooled Telegraph Rings & Underwater Stalkers
- **Files:** Modify `enemies.js`, `tests/enemies.test.mjs`.
- **TDD:** Append behavioral tests for `createGloomState`, `onGloomHit` (poise & knockback resistance, heavy-only interrupt on Tier 3–4, scaled loot), `initTelegraphPool` (zero runtime `scene.add`), `updateGlooms` (Classic lunge, Puglin club smash, Weaver leaping pounce, Stinger aerial dive, Cinder Imp mace flurry & evasive roll, Dread Knight front cleave & sword-roll, Eclipse Behemoth `4.8u` radial shockwave slam + emoji-free one-time toast + band celebration), `initUnderwaterEnemies` (2 Abyssal Stalkers on Sunken City floor), runtime + static zero-GC verification, and zero-emoji scan -> RED -> implement -> GREEN!

### Task 5: Wire `index.html`, `game.js`, Full Regression Suite & Dual-Mode Chrome Visual Verification
- **Files:** Modify `index.html`, `game.js`, `tests/game-integration.test.mjs`.
- **TDD:** Update `tests/game-integration.test.mjs` (`enemies.js` script order, `loadGameHarness`, integration test for `window.__GAME_DEBUG__.Enemies`, solo Sanctuary Tier 1 `3 HP` preservation, escalated Tier 2–4 spawns, pooled telegraph ring reuse, Abyssal Stalker reef guardians) -> RED -> wire `index.html` & `game.js` -> run full syntax & regression suite (all tests 100% GREEN) -> run Final Whole-Project Code Review -> live Chrome verification in BOTH HTTP (`http://127.0.0.1:8767/#test`) AND `file://` showcasing all 8 Shadow Beasts side-by-side + live companion battle + underwater Abyssal Stalkers (0 console errors)!
