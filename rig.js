// ============================================================
// rig.js - Starkeeper Skinned GLB Loader & 4-Layer AnimationMixer
//
// Models the four official Three.js animation architectures:
//   1. animation/skinning/blending          (crossFadeTo + phase sync)
//   2. animation/skinning/additive/blending (makeClipAdditive + AdditiveAnimationBlendMode)
//   3. animation/skinning/morph             (facial morphTargetInfluences)
//   4. animation/walk                       (speed-coupled timeScale + 2D directional strafe)
//
// Supports dual-mode loading:
//   - http:// / https:// (GitHub Pages): fetches lean binary ./assets/starkeeper.glb
//   - file:// (double-click index.html): loads ./assets/starkeeper.glb.js + GLTFLoader.parse()
//   - Graceful fallback to procedural Models.makePlayer() if offline/headless/error.
//
// Consumes globals: THREE, Models, Textures, Shaders
// Exports global:   CharacterRig
// ============================================================

const CharacterRig = (() => {
  'use strict';

  const GLB_URL = './assets/starkeeper.glb';
  const FILE_SCRIPT_URL = './assets/starkeeper.glb.js';

  // Pre-allocated scratch math objects (ZERO GC in hot update loop!)
  const _axisX = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(1, 0, 0) : { x: 1, y: 0, z: 0 };
  const _axisY = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3(0, 1, 0) : { x: 0, y: 1, z: 0 };
  const _qYaw = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;
  const _qPitch = typeof THREE !== 'undefined' && THREE.Quaternion ? new THREE.Quaternion() : null;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function resolveAssetSource(protocol) {
    const p = protocol || (typeof location !== 'undefined' && location ? location.protocol : 'https:');
    if (p === 'file:') {
      return { mode: 'file', scriptUrl: FILE_SCRIPT_URL };
    }
    return { mode: 'http', url: GLB_URL };
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function makeSkinnedMat(Textures, setName, colorHex, fallbackHex, extra) {
    const sets = Textures && Textures.sets ? Textures.sets : null;
    const tex = sets && setName ? sets[setName] : null;
    const opts = Object.assign(
      {
        color: tex ? colorHex : fallbackHex,
        roughness: 0.78,
        metalness: 0.04,
        skinning: true,
      },
      extra || {}
    );
    if (tex) {
      if (tex.map) opts.map = tex.map;
      if (tex.normalMap) opts.normalMap = tex.normalMap;
      if (tex.roughnessMap) opts.roughnessMap = tex.roughnessMap;
      if (typeof THREE.Vector2 === 'function' && !opts.normalScale) {
        opts.normalScale = new THREE.Vector2(0.38, 0.38);
      }
    }
    return new THREE.MeshStandardMaterial(opts);
  }

  function linearizeMat(mat) {
    if (!mat) return mat;
    if (mat.color && typeof mat.color.convertSRGBToLinear === 'function') {
      mat.color.convertSRGBToLinear();
    }
    if (mat.emissive && typeof mat.emissive.convertSRGBToLinear === 'function') {
      mat.emissive.convertSRGBToLinear();
    }
    return mat;
  }

  function buildStarkeeperMaterials(Textures) {
    // Map Quaternius Adventurer material slots into Starkeeper's celestial-stargazer PBR wardrobe
    // SkinHead maps our 256x256 sculpted face texture (warm highlights, blush, sculpted nose & warm smiling lips!)
    const faceMap = Textures && Textures.starkeeperFace ? Textures.starkeeperFace : null;
    return {
      // Coat & Tunic (midnight-indigo woven traveler coat + sea-teal inner vest)
      Green: makeSkinnedMat(Textures, 'cloth', 0x2a3b6e, 0x2c3f76, { roughness: 0.78 }),
      LightGreen: makeSkinnedMat(Textures, 'cloth', 0x2c7a86, 0x308794, { roughness: 0.75 }),
      // Trousers (Brown in Adventurer_Legs is main trousers; Brown2 is knee pads / leather trim!)
      Brown: makeSkinnedMat(Textures, 'cloth', 0x252d44, 0x29324c, { roughness: 0.82 }),
      Brown2: makeSkinnedMat(Textures, 'leather', 0x7d4e2f, 0x8b5836, { roughness: 0.58 }),
      // Sleek Fitted Dark Leather Boots
      Black: makeSkinnedMat(Textures, 'leather', 0x452b1d, 0x4e3221, { roughness: 0.62 }),
      Grey: makeSkinnedMat(Textures, 'leather', 0x5c3a25, 0x68432b, { roughness: 0.60 }),
      // Gold trims
      Gold: new THREE.MeshStandardMaterial({ color: 0xf0c248, roughness: 0.28, metalness: 0.82, skinning: true }),
      // Warm mixed-race golden-brown skin matched seamlessly to embedded Quaternius Universal Base Character face texture!
      SkinBody: linearizeMat(new THREE.MeshStandardMaterial({ color: 0xa47451, roughness: 0.56, metalness: 0.02, skinning: true })),
      SkinHead: faceMap
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceMap, roughness: 0.56, metalness: 0.01, skinning: true, morphTargets: true })
        : linearizeMat(new THREE.MeshStandardMaterial({ color: 0xa47451, roughness: 0.56, metalness: 0.02, skinning: true, morphTargets: true })),
      // Natural dark espresso-black braided scalp cap & brows + expressive warm dark-brown eyes
      Hair: linearizeMat(new THREE.MeshStandardMaterial({ color: 0x201814, roughness: 0.54, metalness: 0.06, skinning: true, morphTargets: true })),
      Eye: linearizeMat(new THREE.MeshStandardMaterial({ color: 0x462614, emissive: 0x241208, emissiveIntensity: 0.36, roughness: 0.14, metalness: 0.10, skinning: true, morphTargets: true })),
      Eyebrows: linearizeMat(new THREE.MeshStandardMaterial({ color: 0x17110e, roughness: 0.64, metalness: 0.03, skinning: true, morphTargets: true })),
    };
  }

  function loadFileBundleScript(scriptUrl, onReady, onError) {
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (g && typeof g.__STARKEEPER_GLB_B64__ === 'string' && g.__STARKEEPER_GLB_B64__.length > 0) {
      onReady(g.__STARKEEPER_GLB_B64__);
      return;
    }
    if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') {
      onError(new Error('DOM unavailable for file:// GLB bundle'));
      return;
    }
    const sc = document.createElement('script');
    sc.src = scriptUrl;
    sc.onload = () => {
      const b64 = g && g.__STARKEEPER_GLB_B64__;
      if (typeof b64 === 'string' && b64.length > 0) onReady(b64);
      else onError(new Error('starkeeper.glb.js loaded without __STARKEEPER_GLB_B64__'));
    };
    sc.onerror = () => onError(new Error('Failed to load ' + scriptUrl));
    document.head.appendChild(sc);
  }

  function attachToPlayer(playerRoot, deps) {
    const cfg = deps || {};
    const ModelsRef = cfg.Models || (typeof Models !== 'undefined' ? Models : null);
    const TexturesRef = cfg.Textures || (typeof Textures !== 'undefined' ? Textures : null);
    const ShadersRef = cfg.Shaders || (typeof Shaders !== 'undefined' ? Shaders : null);

    const state = {
      baseAction: 'Idle',
      baseTimeScale: 1,
      overlayAction: null,
      combatAuthority: 0,
      staffSpinAngle: 0,
      staffDrillAngle: 0,
      guardWeight: 0,
      guardBlendMode: THREE.AdditiveAnimationBlendMode,
      morphWeights: { Blink: 0, Determined: 0, Smile: 0, Hurt: 0 },
      bones: {},
    };

    let mixer = null;
    const actions = {};
    let activeBase = null;
    let activeBaseName = null;
    let activeOverlay = null;
    let activeOverlayName = null;
    let lastOverlayKey = '';
    let guardAction = null;
    let recoilAction = null;
    let morphMeshes = [];
    let gripFingerSpecs = [];
    let restResetBones = [];
    let glbRoot = null;
    let staffSpinPivot = null;
    let staffHalo = null;
    let staffButt = null;
    let pearlAura = null;
    let cloakGroup = null;
    let scarfSegs = null;
    let capeSegs = null;
    let eyelidL = null;
    let eyelidR = null;
    let smileT = 0;
    let capeLag = 0;
    let capeSway = 0;
    let prevFacing = 0;
    let recoilPulse = 0;
    let trailEmitWindow = false;
    let prevHurtT = 0;

    const controller = {
      ready: false,
      state,
      triggerEmote(name, dur) {
        if (name === 'smile' || name === 'cheer') {
          smileT = Math.max(smileT, dur !== undefined ? dur : 2.5);
        }
      },
      getStaffTipWorldPos(out) {
        if (!controller.ready || !staffHalo || !out) return null;
        if (playerRoot && typeof playerRoot.updateMatrixWorld === 'function') {
          playerRoot.updateMatrixWorld(true);
        }
        if (typeof staffHalo.getWorldPosition === 'function') {
          staffHalo.getWorldPosition(out);
          return out;
        }
        return null;
      },
      getStaffButtWorldPos(out) {
        if (!controller.ready || !staffButt || !out) return null;
        if (playerRoot && typeof playerRoot.updateMatrixWorld === 'function') {
          playerRoot.updateMatrixWorld(true);
        }
        if (typeof staffButt.getWorldPosition === 'function') {
          staffButt.getWorldPosition(out);
          return out;
        }
        return null;
      },
      isCombatTrailActive() {
        return !!(controller.ready && trailEmitWindow);
      },
      update,
    };

    if (playerRoot && playerRoot.userData) {
      playerRoot.userData.glbRig = controller;
    }

    function selectBaseState(s) {
      if (s.dead) return 'Death';
      if (s.rollT > 0) return 'Roll';
      if (s.swimming) return s.swimMoveBlend > 0.25 ? 'SwimFwd' : 'SwimIdle';
      if (s.sliding || s.slidePoseB > 0.45) return 'HillSlide';
      if (s.airborne) return s.vy > 3.5 && s.riseW > 0.65 ? 'JumpStart' : 'JumpLoop';
      if (s.landT > 0.05 && !s.moving) return 'JumpLand';
      if (s.walking && s.moving) {
        // Project velocity onto Starkeeper's local facing basis:
        // Facing +Z (sinF=0, cosF=1) -> +X is character LEFT (+sideVel), -X is character RIGHT (-sideVel)
        const fwdVel = s.vx * s.sinF + s.vz * s.cosF;
        const sideVel = s.vx * s.cosF - s.vz * s.sinF;
        const hSpd = Math.max(0.001, s.spd);
        const fwdFrac = clamp(fwdVel / hSpd, -1, 1);
        const sideFrac = clamp(sideVel / hSpd, -1, 1);
        if (Math.abs(sideFrac) > 0.52) {
          return sideFrac > 0 ? 'StrafeLeft' : 'StrafeRight';
        }
        if (fwdFrac < -0.35) {
          return 'Backpedal';
        }
        if (s.sprintB > 0.45 || s.spd > 8.6) return 'Sprint';
        if (s.runBlend > 0.55 || s.spd > 5.4) return 'Jog';
        return 'Walk';
      }
      return 'Idle';
    }

    function selectOverlayState(s) {
      if (s.dead || s.rollT > 0) return { name: null, key: '' };
      if (s.plunging) return { name: 'PlungeDive', key: 'plunge' };
      if (s.plungeLandT > 0.04) return { name: 'PlungeLand', key: 'plungeLand' };
      if (s.meleeT > 0) {
        const step = s.meleeStep || 1;
        if (step === 2) return { name: 'Melee2', key: 'melee2' };
        if (step === 3) return { name: 'Spin360', key: 'melee3' };
        if (step === 4 || step === 6) return { name: 'RollStrike', key: 'melee' + step };
        if (step === 7) return { name: 'SlideThrust', key: 'melee7' };
        return { name: 'Melee1', key: 'melee' + step };
      }
      if (s.castT > 0) {
        const cStep = s.castStep || 1;
        if (cStep === 6) return { name: 'CastNova', key: 'cast6' };
        return { name: 'CastShoot', key: 'cast' + cStep };
      }
      return { name: null, key: '' };
    }

    function crossFadeBase(nextName, fadeDur) {
      const next = actions[nextName] || actions.Idle;
      if (!next || next === activeBase) return;
      const isLocomotionPair =
        (activeBaseName === 'Walk' || activeBaseName === 'Jog' || activeBaseName === 'Sprint') &&
        (nextName === 'Walk' || nextName === 'Jog' || nextName === 'Sprint');

      next.reset();
      if (isLocomotionPair && activeBase && activeBase.getClip && next.getClip) {
        const prevDur = activeBase.getClip().duration || 1;
        const nextDur = next.getClip().duration || 1;
        // Phase-synchronized locomotion transition (walk <-> jog <-> sprint)
        next.time = (activeBase.time / prevDur) * nextDur;
      }
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);
      next.play();

      if (activeBase) {
        activeBase.crossFadeTo(next, fadeDur, true);
      }
      activeBase = next;
      activeBaseName = nextName;
      state.baseAction = nextName;
    }

    function triggerOverlay(name, key, desiredDur) {
      if (!name) {
        if (activeOverlay) {
          activeOverlay.fadeOut(0.20);
          activeOverlay = null;
          activeOverlayName = null;
          state.overlayAction = null;
        }
        lastOverlayKey = '';
        return;
      }
      if (key === lastOverlayKey && activeOverlay) return;
      const next = actions[name] || (name === 'RollStrike' ? actions.Melee1 : null);
      if (!next) return;

      const isCombatMove =
        name === 'Melee1' || name === 'Melee2' || name === 'Spin360' ||
        name === 'RollStrike' || name === 'SlideThrust' || name === 'PlungeDive' || name === 'PlungeLand';
      if (activeOverlay && activeOverlay !== next) {
        activeOverlay.fadeOut(isCombatMove ? 0.055 : 0.08);
      }
      next.reset();
      if (typeof next.setLoop === 'function' && THREE.LoopOnce !== undefined) {
        next.setLoop(THREE.LoopOnce, 1);
      }
      // Hold final combat pose cleanly while fadeOut(0.18) settles back to Idle (prevents 1-frame snap-back whip!)
      next.clampWhenFinished = isCombatMove;
      const clipDur = next.getClip ? (next.getClip().duration || 0.4) : 0.4;
      const tScale = desiredDur > 0.05 ? clamp(clipDur / desiredDur, 0.75, 2.6) : 1.0;
      next.setEffectiveTimeScale(tScale);
      next.setEffectiveWeight(1);
      next.fadeIn(isCombatMove ? 0.05 : 0.07);
      next.play();

      activeOverlay = next;
      activeOverlayName = name;
      lastOverlayKey = key;
      state.overlayAction = name;
    }

    function update(dt, time, s) {
      if (!controller.ready || !mixer || !s) return;
      const stepDt = clamp(dt || 0.016, 0, 0.1);

      // 1. Base locomotion layer (crossFadeTo + speed-coupled timeScale)
      const wantBase = selectBaseState(s);
      const fadeDur =
        wantBase === 'Roll' || wantBase === 'JumpStart' ? 0.09
          : wantBase === 'Death' ? 0.16
          : 0.18;
      if (wantBase !== activeBaseName) {
        crossFadeBase(wantBase, fadeDur);
      }

      // 2. Action / Combat overlay layer (full-authority martial blending — zero 50/50 dilution!)
      const ov = selectOverlayState(s);
      const ovDur = s.meleeT > 0 ? s.meleeDur : s.castT > 0 ? s.castDur : 0.36;
      triggerOverlay(ov.name, ov.key, ovDur);

      const isFullBodyCombat =
        ov.name === 'Melee1' || ov.name === 'Melee2' || ov.name === 'Spin360' ||
        ov.name === 'RollStrike' || ov.name === 'SlideThrust' ||
        ov.name === 'PlungeDive' || ov.name === 'PlungeLand' || ov.name === 'CastNova';
      const wantAuth = isFullBodyCombat ? 1.0 : ov.name === 'CastShoot' ? 0.55 : 0.0;
      const authRate = wantAuth > state.combatAuthority ? 28 : 8;
      state.combatAuthority += (wantAuth - state.combatAuthority) * Math.min(1, stepDt * authRate);
      if (state.combatAuthority < 0.002 && wantAuth === 0) state.combatAuthority = 0;

      if (activeBase) {
        let ts = 1.0;
        if (activeBaseName === 'Walk') ts = clamp(s.spd / 4.2, 0.55, 1.45);
        else if (activeBaseName === 'Jog') ts = clamp(s.spd / 6.8, 0.72, 1.40);
        else if (activeBaseName === 'Sprint') ts = clamp(s.spd / 10.2, 0.80, 1.45);
        else if (activeBaseName === 'StrafeLeft' || activeBaseName === 'StrafeRight') ts = clamp(s.spd / 6.2, 0.65, 1.45);
        else if (activeBaseName === 'Backpedal') ts = clamp(s.spd / 4.8, 0.65, 1.40);
        else if (activeBaseName === 'SwimFwd') ts = clamp(s.spd / 4.6, 0.70, 1.50);
        else if (activeBaseName === 'Roll') {
          const rDur = activeBase.getClip ? (activeBase.getClip().duration || 0.7) : 0.7;
          ts = clamp(rDur / Math.max(0.2, s.rollDur || 0.45), 0.9, 2.2);
        }
        activeBase.setEffectiveTimeScale(ts);
        // Drop base locomotion weight to ~0 during full-body martial moves so Three.js NEVER dilutes swings 50/50!
        const minBaseW = isFullBodyCombat ? 0.0 : 0.04;
        activeBase.setEffectiveWeight(clamp(1.0 - state.combatAuthority, minBaseW, 1.0));
        state.baseTimeScale = ts;
      }

      // 2b. Independent Martial-Arts Bo-Staff Spin Pivot (ONE clean coherent gesture per swing — ZERO double-swoosh or backward unwind!)
      const inMeleeNow = !!(s.meleeT > 0 && !s.dead && s.rollT <= 0);
      trailEmitWindow = false;
      if (inMeleeNow) {
        const mStep = s.meleeStep || 1;
        const mDur = Math.max(0.08, s.meleeDur || 0.48);
        const prog = clamp(1.0 - s.meleeT / mDur, 0, 1);
        const easeIO = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) * 0.5;
        // Strike window maps active spin strictly across the forward sweep (dark during windup & hold!)
        const strikeP = clamp((prog - 0.16) / 0.62, 0, 1);
        const strikeEase = strikeP < 0.5 ? 2 * strikeP * strikeP : 1 - Math.pow(-2 * strikeP + 2, 2) * 0.5;
        if (mStep === 1) {
          // Hit 1: Pure wide right-to-left horizontal sweep with subtle grounded wrist arc (-20 deg -> +22 deg)
          state.staffSpinAngle = -0.11 * Math.PI + 0.23 * Math.PI * strikeEase;
          state.staffDrillAngle = 0;
          trailEmitWindow = prog >= 0.16 && prog <= 0.78;
        } else if (mStep === 2) {
          // Hit 2: High overhead diagonal cleave with ONE clean 360 deg (-2*PI) twirl ending right-side-up (zero unwind!)
          state.staffSpinAngle = -Math.PI * 2.0 * strikeEase;
          state.staffDrillAngle = 0;
          trailEmitWindow = prog >= 0.15 && prog <= 0.78;
        } else if (mStep === 3) {
          // Hit 3 (Spin360): ONE bold 360 deg (-2*PI) helicopter circle synced with 0.74s high airborne leap!
          const airP = clamp((prog - 0.14) / 0.68, 0, 1);
          const airEase = airP < 0.5 ? 2 * airP * airP : 1 - Math.pow(-2 * airP + 2, 2) * 0.5;
          state.staffSpinAngle = -Math.PI * 2.0 * airEase;
          state.staffDrillAngle = 0;
          trailEmitWindow = prog >= 0.15 && prog <= 0.84;
        } else if (mStep === 4 || mStep === 6) {
          // Roll-Strike / Dash-Cut: ONE crisp 360 deg (+2*PI) rising cleave spin ending upright!
          state.staffSpinAngle = Math.PI * 2.0 * strikeEase;
          state.staffDrillAngle = 0;
          trailEmitWindow = prog >= 0.14 && prog <= 0.80;
        } else if (mStep === 7) {
          // Sprint Slide-Thrust: Smooth 540 deg (3*PI) axial star-drill around the staff shaft!
          state.staffSpinAngle = 0;
          state.staffDrillAngle = Math.PI * 3.0 * prog;
          trailEmitWindow = prog >= 0.06 && prog <= 0.86;
        } else {
          state.staffSpinAngle = 0.22 * Math.PI * strikeEase;
          state.staffDrillAngle = 0;
          trailEmitWindow = prog >= 0.16 && prog <= 0.78;
        }
      } else if (s.plunging && !s.dead) {
        const wT = clamp((s.plungeWindupT || 0) / 0.18, 0, 1);
        state.staffSpinAngle = wT > 0 ? Math.PI * 2.0 * (1.0 - wT) : 0;
        state.staffDrillAngle = 0;
        trailEmitWindow = wT <= 0.35;
      } else {
        // Wrap completed full spins silently modulo 2*PI so staff NEVER visually unwinds backward!
        state.staffSpinAngle = wrapAngle(state.staffSpinAngle);
        state.staffSpinAngle += (0 - state.staffSpinAngle) * Math.min(1, stepDt * 10);
        state.staffDrillAngle = wrapAngle(state.staffDrillAngle);
        state.staffDrillAngle += (0 - state.staffDrillAngle) * Math.min(1, stepDt * 10);
        if (Math.abs(state.staffSpinAngle) < 0.002) state.staffSpinAngle = 0;
        if (Math.abs(state.staffDrillAngle) < 0.002) state.staffDrillAngle = 0;
      }
      if (staffSpinPivot && staffSpinPivot.rotation) {
        staffSpinPivot.rotation.x = state.staffSpinAngle;
        staffSpinPivot.rotation.y = state.staffDrillAngle;
      }

      // 3. Additive blending layer (Z-target combat guard crouch + hit recoil pulse)
      const wantGuard = s.lockedOn && !s.dead && !s.swimming && s.rollT <= 0 && !s.airborne && !s.sliding ? 0.24 : 0;
      state.guardWeight += (wantGuard - state.guardWeight) * Math.min(1, stepDt * 9);
      if (guardAction) {
        guardAction.setEffectiveWeight(state.guardWeight);
      }
      if (s.hurtFlashT > prevHurtT + 0.05) {
        recoilPulse = 1.0;
        if (recoilAction) {
          recoilAction.reset();
          recoilAction.play();
        }
      }
      prevHurtT = s.hurtFlashT || 0;
      recoilPulse = Math.max(0, recoilPulse - stepDt * 3.8);
      if (recoilAction) {
        recoilAction.setEffectiveWeight(recoilPulse * 0.65);
      }

      // Reset post-mixer offset bones to rest pose BEFORE mixer.update so clips lacking Neck/Head/Finger tracks
      // NEVER accumulate spin or rotation across frames (fixes head spinning during HillSlide & un-keyed clips!)
      for (let ri = 0; ri < restResetBones.length; ri++) {
        const rb = restResetBones[ri];
        const q = rb.bone.quaternion;
        if (q) {
          if (typeof q.set === 'function') q.set(rb.qx, rb.qy, rb.qz, rb.qw);
          else { q.x = rb.qx; q.y = rb.qy; q.z = rb.qz; q.w = rb.qw; }
        }
      }

      // Advance AnimationMixer across all active normal + additive tracks
      mixer.update(stepDt);

      // 3b. Post-mixer additive bone offsets: live head look-at + cast aim pitch!
      if (_qYaw && _qPitch) {
        const bNeck = state.bones.Neck;
        const bHead = state.bones.Head;
        const hYaw = clamp(s.headYaw || 0, -0.7, 0.7);
        const hPitch = clamp(s.headPitch || 0, -0.45, 0.50);
        if (bNeck && bNeck.quaternion) {
          _qYaw.setFromAxisAngle(_axisY, hYaw * 0.35);
          _qPitch.setFromAxisAngle(_axisX, hPitch * 0.35);
          bNeck.quaternion.multiply(_qYaw).multiply(_qPitch);
        }
        if (bHead && bHead.quaternion) {
          _qYaw.setFromAxisAngle(_axisY, hYaw * 0.65);
          _qPitch.setFromAxisAngle(_axisX, hPitch * 0.65);
          bHead.quaternion.multiply(_qYaw).multiply(_qPitch);
        }
        if (s.castT > 0 && Math.abs(s.castAimPitch || 0) > 0.02) {
          const bChest = state.bones.Chest;
          if (bChest && bChest.quaternion) {
            _qPitch.setFromAxisAngle(_axisX, clamp(-s.castAimPitch * 0.45, -0.32, 0.32));
            bChest.quaternion.multiply(_qPitch);
          }
        }
        // Keep right-hand fingers & thumb firmly wrapped inward around the Star-Lantern Staff leather grip
        // in every animation! We apply an exact ergonomic grip pose from each finger's rest quaternion so
        // no locomotion/combat clip can accidentally open the hand or over-curl fingers into the palm.
        if (gripFingerSpecs.length > 0) {
          for (let fi = 0; fi < gripFingerSpecs.length; fi++) {
            const fs = gripFingerSpecs[fi];
            const q = fs.bone.quaternion;
            if (!q) continue;
            if (typeof q.set === 'function') q.set(fs.qx, fs.qy, fs.qz, fs.qw);
            else { q.x = fs.qx; q.y = fs.qy; q.z = fs.qz; q.w = fs.qw; }
            _qPitch.setFromAxisAngle(_axisX, fs.curlX);
            q.multiply(_qPitch);
            if (fs.curlY !== 0) {
              _qYaw.setFromAxisAngle(_axisY, fs.curlY);
              q.multiply(_qYaw);
            }
          }
        }
      }

      // 4. Facial morph target blending (Blink, Determined, Smile, Hurt)
      if (smileT > 0) smileT = Math.max(0, smileT - stepDt);
      const blinkCycle = (time * 0.24) % 1.0;
      const wantBlink = blinkCycle > 0.962 ? Math.sin(((blinkCycle - 0.962) / 0.038) * Math.PI) : 0;
      const wantDet = (s.lockedOn || s.meleeT > 0 || s.castT > 0 || s.plunging) && !s.dead ? 0.85 : 0;
      const wantSmile = smileT > 0 && !s.dead && !(s.hurtFlashT > 0) ? Math.min(1, smileT * 1.4) * 0.92 : 0;
      const wantHurt = s.hurtFlashT > 0 || s.dead ? 1.0 : 0;

      const kM = Math.min(1, stepDt * 12);
      state.morphWeights.Blink = wantBlink;
      state.morphWeights.Determined += (wantDet - state.morphWeights.Determined) * kM;
      state.morphWeights.Smile += (wantSmile - state.morphWeights.Smile) * kM;
      state.morphWeights.Hurt += (wantHurt - state.morphWeights.Hurt) * Math.min(1, stepDt * 16);

      for (let i = 0; i < morphMeshes.length; i++) {
        const inf = morphMeshes[i].morphTargetInfluences;
        if (inf && inf.length >= 4) {
          inf[0] = state.morphWeights.Blink;
          inf[1] = state.morphWeights.Determined;
          inf[2] = state.morphWeights.Smile;
          inf[3] = state.morphWeights.Hurt;
        }
      }
      // Drive sculpted glossy 3D eye blinking & expression eyelids in exact sync with facial morphs!
      if (eyelidL && eyelidR) {
        const lidClose = clamp(
          state.morphWeights.Blink * 1.05 +
          state.morphWeights.Hurt * 0.65 +
          state.morphWeights.Determined * 0.20 -
          state.morphWeights.Smile * 0.12,
          -0.12,
          1.08
        );
        // Resting at -0.48 (relaxed warm upper-lid hood) -> +0.24 fully closed on blink!
        const lidRot = -0.48 + lidClose * 0.70;
        eyelidL.rotation.x = lidRot;
        eyelidR.rotation.x = lidRot;
      }

      // 5. Continuous GPU Crimson Cloak, Twin Sea-Teal Scarf & Star-Lantern Halo
      const rawTurnRate = stepDt > 0.0005 ? wrapAngle((s.facing || 0) - prevFacing) / stepDt : 0;
      prevFacing = s.facing || 0;
      const targetSway = clamp(-rawTurnRate * 0.14 + (s.meleeStep === 3 && s.meleeT > 0 ? 0.95 : 0), -0.85, 0.85);
      capeSway += (targetSway - capeSway) * Math.min(1, stepDt * 8);

      const targetDrag = s.rollT > 0
        ? 0.90
        : s.plunging
          ? 1.38
          : s.meleeT > 0 && s.meleeStep === 3
            ? 1.35
            : s.meleeT > 0 && s.meleeStep === 7
              ? 1.24
              : s.swimming
                ? 0.24 + (s.swimMoveBlend || 0) * 0.36
                : clamp((s.spd || 0) / 7.2, 0, 1.45) * (0.50 + (s.sprintB || 0) * 0.18) +
                  (s.slidePoseB || 0) * 0.52 + 0.16 * (s.riseW || 0) + 0.94 * (s.fallW || 0) + 0.38 * (s.apexW || 0);
      capeLag += (targetDrag - capeLag) * Math.min(1, stepDt * 11);

      const windGust = 0.30 + Math.sin(time * 1.45 + (s.x || 0) * 0.08) * 0.16 + Math.cos(time * 2.3 - (s.z || 0) * 0.07) * 0.08;
      const windWave = Math.sin(time * 2.4) * (0.045 + windGust * 0.04);
      const drag = Math.min(1.18, Math.max(capeLag, targetDrag * 0.88));
      const liftAngle = clamp(0.22 + drag * 0.96 + windWave * 0.7, 0.18, 1.38);
      const sDroop = clamp(0.06 + drag * 0.28, 0.04, 0.42);
      const flutterAmp = clamp(0.18 + drag * 0.45 + Math.abs(capeSway) * 0.35 + (s.swimming ? 0.35 : 0), 0.12, 1.25);

      if (ShadersRef) {
        if (typeof ShadersRef.setClothMotion === 'function') {
          const speedNorm = s.meleeStep === 7 && s.meleeT > 0 ? 1.55 : clamp((s.spd || 0) / 7.5, 0, 1.6);
          const vertNorm = s.airborne ? clamp((s.vy || 0) / 8.0, -1.5, 1.5) : 0;
          ShadersRef.setClothMotion(speedNorm, vertNorm, capeSway, windGust);
        }
        if (typeof ShadersRef.setClothCurve === 'function') {
          ShadersRef.setClothCurve(liftAngle, sDroop, capeSway, flutterAmp);
        }
      }

      if (scarfSegs && scarfSegs.length === 2) {
        scarfSegs[0].rotation.x = 0.03 + Math.sin(time * 4.4) * (0.04 + (s.amp || 0) * 0.03);
        scarfSegs[0].rotation.z = -0.12 + capeSway * 0.16 + Math.cos(time * 3.1) * 0.04;
        scarfSegs[1].rotation.x = 0.03 + Math.sin(time * 4.9 + 1.1) * (0.04 + (s.amp || 0) * 0.03);
        scarfSegs[1].rotation.z = 0.12 + capeSway * 0.16 + Math.sin(time * 3.4 + 0.8) * 0.04;
      }
      if (capeSegs && capeSegs.length === 3) {
        capeSegs[0].rotation.x = 0.18 + drag + windWave;
      }

      if (staffHalo && staffHalo.scale) {
        let wantHalo = 0.72 + Math.sin(time * 3.2) * 0.04;
        if (s.plunging) wantHalo = 1.85;
        else if (s.meleeT > 0) wantHalo = 1.48;
        else if (s.castT > 0) wantHalo = s.castStep >= 3 ? 2.15 : 1.75;
        const curH = typeof staffHalo.scale.x === 'number' && staffHalo.scale.x > 0.01 ? staffHalo.scale.x : wantHalo;
        const nextH = curH + (wantHalo - curH) * Math.min(1, stepDt * 14);
        staffHalo.scale.set(nextH, nextH, 1);
      }
      if (pearlAura) {
        const showPearl = !!(s.hasBreathRelic && s.swimming);
        pearlAura.visible = showPearl;
        if (showPearl && pearlAura.scale) {
          const ps = 0.92 + Math.sin(time * 4.4) * 0.14;
          pearlAura.scale.set(ps, ps, 1);
        }
      }
    }

    function onGltfLoaded(gltf) {
      if (!gltf || !gltf.scene) return;
      glbRoot = gltf.scene;

      const matMap = buildStarkeeperMaterials(TexturesRef);
      const bones = {};
      morphMeshes = [];
      let armScale = 1.0;

      const hasSculptedEyes = !!(ModelsRef && typeof ModelsRef.makeStarkeeperEyes === 'function');
      let hasTexturedGlbEyes = false;
      glbRoot.traverse((obj) => {
        if (obj.name === 'CharacterArmature' && obj.scale && obj.scale.x > 10) {
          armScale = obj.scale.x;
        }
        if (obj.isBone && obj.name) {
          bones[obj.name] = obj;
        }
        if (obj.isMesh || obj.isSkinnedMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = false;
          const isHeadMesh = /head/i.test(obj.name || '') || !!obj.morphTargetInfluences;
          if (obj.morphTargetInfluences && obj.morphTargetInfluences.length >= 4) {
            morphMeshes.push(obj);
          }
          const origMat = obj.material;
          const origName = origMat && origMat.name ? origMat.name : '';
          if (origName === 'MI_Ranger' && origMat && origMat.map) {
            // Preserve hand-painted Quaternius Modular Fantasy Ranger outfit (re-paletted midnight-indigo/sea-teal + leather + gold + ORM/normal)!
            origMat.skinning = true;
            origMat.roughness = 0.92;
            origMat.metalness = 0.85;
            if (origMat.color && typeof origMat.color.setHex === 'function') origMat.color.setHex(0xffffff);
            if (origMat.normalScale && typeof origMat.normalScale.set === 'function') origMat.normalScale.set(0.85, 0.85);
            origMat.needsUpdate = true;
          } else if ((origName === 'Skin' || origName === 'MI_Regular_Male') && origMat && origMat.map) {
            // Preserve embedded Quaternius Universal Base Character face & hand skin albedo + normal map!
            origMat.skinning = true;
            if (isHeadMesh) origMat.morphTargets = true;
            origMat.roughness = 0.56;
            origMat.metalness = 0.02;
            if (origMat.color && typeof origMat.color.setHex === 'function') origMat.color.setHex(0xffffff);
            if (origMat.normalScale && typeof origMat.normalScale.set === 'function') origMat.normalScale.set(0.75, 0.75);
            origMat.needsUpdate = true;
          } else if (origName === 'Eye' && origMat && origMat.map) {
            // Preserve hand-painted Quaternius brown irises + crisp specular highlights inside real eye sockets!
            hasTexturedGlbEyes = true;
            origMat.skinning = true;
            origMat.morphTargets = true;
            origMat.roughness = 0.14;
            origMat.metalness = 0.06;
            if (origMat.color && typeof origMat.color.setHex === 'function') origMat.color.setHex(0xffffff);
            origMat.needsUpdate = true;
            obj.visible = true;
          } else if (origName === 'Skin' || origName === 'SkinBody') {
            obj.material = isHeadMesh && origName === 'Skin' ? matMap.SkinHead : matMap.SkinBody;
          } else if (matMap[origName]) {
            obj.material = matMap[origName];
            // Hide untextured low-poly fallback Eye blocks when procedural sculpted eyes mount cleanly
            if (origName === 'Eye' && hasSculptedEyes) {
              obj.visible = false;
            }
          } else if (origMat) {
            origMat.skinning = true;
            if (isHeadMesh) origMat.morphTargets = true;
          }
        }
      });

      state.bones = bones;
      const isUbcNative = armScale < 10 && !!(bones.ToeR || bones['Toe.R'] || hasTexturedGlbEyes);
      // Right-hand ergonomic staff-grip finger wrap:
      //   UBC/Ranger native 1.0m rig: +X local curls fingers into palm (-Y world)
      //   Legacy Adventurer scale=100 rig: -X local curls fingers into palm (-Z local)
      gripFingerSpecs = [];
      const fingerCurlTable = isUbcNative
        ? [
            ['Index2R', 0.94, 0], ['Index3R', 1.12, 0], ['Index4R', 0.74, 0],
            ['Middle2R', 1.00, 0], ['Middle3R', 1.16, 0], ['Middle4R', 0.78, 0],
            ['Ring2R', 1.04, 0], ['Ring3R', 1.18, 0], ['Ring4R', 0.80, 0],
            ['Pinky2R', 1.08, 0], ['Pinky3R', 1.20, 0], ['Pinky4R', 0.80, 0],
            ['Thumb2R', 0.56, -0.32], ['Thumb3R', 0.64, -0.14],
          ]
        : [
            ['Index2R', -0.92, 0], ['Index3R', -1.08, 0], ['Index4R', -0.72, 0],
            ['Middle2R', -0.98, 0], ['Middle3R', -1.12, 0], ['Middle4R', -0.76, 0],
            ['Ring2R', -1.02, 0], ['Ring3R', -1.14, 0], ['Ring4R', -0.78, 0],
            ['Pinky2R', -1.06, 0], ['Pinky3R', -1.16, 0], ['Pinky4R', -0.78, 0],
            ['Thumb2R', -0.58, 0.34], ['Thumb3R', -0.68, 0.12],
          ];
      for (let fi = 0; fi < fingerCurlTable.length; fi++) {
        const key = fingerCurlTable[fi][0];
        const dotted = key.slice(0, -1) + '.R';
        const fb = bones[key] || bones[dotted];
        if (fb && fb.quaternion) {
          gripFingerSpecs.push({
            bone: fb,
            qx: fb.quaternion.x,
            qy: fb.quaternion.y,
            qz: fb.quaternion.z,
            qw: fb.quaternion.w,
            curlX: fingerCurlTable[fi][1],
            curlY: fingerCurlTable[fi][2],
          });
        }
      }
      // Snapshot rest quaternions for every bone that receives post-mixer offsets
      restResetBones = [];
      const offsetBones = [bones.Neck, bones.Head, bones.Chest];
      for (let oi = 0; oi < offsetBones.length; oi++) {
        const ob = offsetBones[oi];
        if (ob && ob.quaternion) {
          restResetBones.push({
            bone: ob,
            qx: ob.quaternion.x,
            qy: ob.quaternion.y,
            qz: ob.quaternion.z,
            qw: ob.quaternion.w,
          });
        }
      }
      const invS = 1 / Math.max(1, armScale);

      // Mount Starkeeper's signature celestial-stargazer accessories onto skeleton bones!
      // Note: Three.js r128 GLTFLoader sanitizes dotted bone names ("Hand.R" -> "HandR").
      const handRBone = bones['Hand.R'] || bones.HandR || null;
      if (ModelsRef) {
        // Only mount procedural sphere eyes when GLB doesn't already carry realistic textured 3D eyeballs!
        if (bones.Head && !hasTexturedGlbEyes && typeof ModelsRef.makeStarkeeperEyes === 'function') {
          const eyes = ModelsRef.makeStarkeeperEyes();
          eyes.scale.set(invS, invS, invS);
          eyes.position.set(0, 0, 0);
          bones.Head.add(eyes);
          eyelidL = eyes.userData ? eyes.userData.eyelidL : null;
          eyelidR = eyes.userData ? eyes.userData.eyelidR : null;
        }
        if (bones.Head && typeof ModelsRef.makeStarkeeperBraids === 'function') {
          const braids = ModelsRef.makeStarkeeperBraids();
          braids.scale.set(invS, invS, invS);
          braids.position.set(0, (isUbcNative ? 0.010 : 0.012) * invS, (isUbcNative ? -0.004 : -0.006) * invS);
          bones.Head.add(braids);
        }
        if (bones.Head && typeof ModelsRef.makeStarkeeperHat === 'function') {
          const hat = ModelsRef.makeStarkeeperHat();
          const hs = isUbcNative ? 0.91 : 0.90;
          hat.scale.set(invS * hs, invS * hs, invS * hs);
          hat.position.set(0, (isUbcNative ? 0.158 : 0.172) * invS, (isUbcNative ? -0.012 : -0.016) * invS);
          hat.rotation.x = isUbcNative ? -0.08 : -0.14;
          hat.rotation.z = -0.02;
          bones.Head.add(hat);
        }
        if (bones.Chest && typeof ModelsRef.makeStarkeeperCloak === 'function') {
          cloakGroup = ModelsRef.makeStarkeeperCloak();
          cloakGroup.scale.set(invS * 0.98, invS * 1.02, invS * 0.98);
          cloakGroup.position.set(0, (isUbcNative ? 0.158 : 0.105) * invS, (isUbcNative ? -0.125 : -0.108) * invS);
          bones.Chest.add(cloakGroup);
          scarfSegs = cloakGroup.userData ? cloakGroup.userData.scarfSegs : null;
          capeSegs = cloakGroup.userData ? cloakGroup.userData.capeSegs : null;
        }
        if (handRBone && typeof ModelsRef.makeStarkeeperStaff === 'function') {
          const staffMount = new THREE.Group();
          staffMount.name = 'Staff';
          staffMount.scale.set(invS * 0.96, invS * 0.96, invS * 0.96);
          if (isUbcNative) {
            // Native UBC/Ranger HandR: +Y runs out along fingers (knuckles at y=+0.115m), palm faces -X, thumb is +Z.
            // Center leather grip squarely inside the closed palm cavity with shaft pointing forward (+Z)!
            staffMount.position.set(-0.028 * invS, 0.106 * invS, 0.008 * invS);
            staffMount.rotation.x = Math.PI * 0.5;
            staffMount.rotation.y = 0.06;
            staffMount.rotation.z = 0.06;
          } else {
            staffMount.position.set(0.004 * invS, 0.138 * invS, -0.036 * invS);
            staffMount.rotation.x = 0.06;
            staffMount.rotation.y = 0.08;
            staffMount.rotation.z = Math.PI * 0.5;
          }
          staffSpinPivot = new THREE.Group();
          staffSpinPivot.name = 'StaffSpinPivot';
          const staff = ModelsRef.makeStarkeeperStaff();
          staffSpinPivot.add(staff);
          staffMount.add(staffSpinPivot);
          handRBone.add(staffMount);
          staffHalo = staff.userData ? staff.userData.staffHalo : null;
          staffButt = staff.userData ? staff.userData.buttCap : null;
          pearlAura = staff.userData ? staff.userData.pearlAura : null;
        }
      }

      // Initialize AnimationMixer and bind all base, action, and additive clips
      mixer = new THREE.AnimationMixer(glbRoot);
      const clips = gltf.animations || [];
      const clipByName = {};
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        // Defense-in-depth: drop any malformed track where times*valueSize !== values (prevents r128 Interpolant infinite loop!)
        if (Array.isArray(c.tracks)) {
          c.tracks = c.tracks.filter((tr) => {
            if (!tr || !tr.times || !tr.values) return true;
            const vs = typeof tr.getValueSize === 'function' ? tr.getValueSize() : 0;
            return !vs || tr.times.length * vs === tr.values.length;
          });
        }
        clipByName[c.name] = c;
        actions[c.name] = mixer.clipAction(c);
      }

      // Set up Additive Blending Layer (Z-target combat guard crouch + hit recoil)
      const makeAdd = THREE.AnimationUtils && typeof THREE.AnimationUtils.makeClipAdditive === 'function';
      if (clipByName.CrouchIdle && typeof clipByName.CrouchIdle.clone === 'function') {
        const gClip = clipByName.CrouchIdle.clone();
        gClip.name = 'AdditiveGuard';
        if (makeAdd) THREE.AnimationUtils.makeClipAdditive(gClip, 0, clipByName.Idle || gClip, 30);
        guardAction = mixer.clipAction(gClip);
        if (THREE.AdditiveAnimationBlendMode !== undefined) {
          guardAction.blendMode = THREE.AdditiveAnimationBlendMode;
        }
        guardAction.setEffectiveWeight(0);
        guardAction.play();
        state.guardBlendMode = guardAction.blendMode;
      }
      if (clipByName.HitReact && typeof clipByName.HitReact.clone === 'function') {
        const hClip = clipByName.HitReact.clone();
        hClip.name = 'AdditiveHit';
        if (makeAdd) THREE.AnimationUtils.makeClipAdditive(hClip, 0, clipByName.Idle || hClip, 30);
        recoilAction = mixer.clipAction(hClip);
        if (THREE.AdditiveAnimationBlendMode !== undefined) {
          recoilAction.blendMode = THREE.AdditiveAnimationBlendMode;
        }
        if (typeof recoilAction.setLoop === 'function' && THREE.LoopOnce !== undefined) {
          recoilAction.setLoop(THREE.LoopOnce, 1);
        }
        recoilAction.setEffectiveWeight(0);
      }

      // Start smoothly in Idle (or IdleStaff)
      const startAct = actions.Idle || actions.IdleStaff || (clips[0] ? actions[clips[0].name] : null);
      if (startAct) {
        startAct.reset().setEffectiveWeight(1).play();
        activeBase = startAct;
        activeBaseName = startAct.getClip ? startAct.getClip().name : 'Idle';
        state.baseAction = activeBaseName;
      }

      // Hot-swap cleanly inside playerRoot (hiding procedural body with zero camera/collider jump!)
      if (playerRoot) {
        playerRoot.add(glbRoot);
        if (playerRoot.userData && playerRoot.userData.proceduralRoot) {
          playerRoot.userData.proceduralRoot.visible = false;
        }
      }
      controller.ready = true;
    }

    function onLoadError(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[CharacterRig] Falling back to procedural Starkeeper:', err && err.message ? err.message : err);
      }
    }

    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader !== 'function') {
      return controller;
    }

    const loader = new THREE.GLTFLoader();
    const src = resolveAssetSource();
    try {
      if (src.mode === 'file') {
        loadFileBundleScript(
          src.scriptUrl,
          (b64) => {
            try {
              const buf = base64ToArrayBuffer(b64);
              loader.parse(buf, '', onGltfLoaded, onLoadError);
            } catch (e) {
              onLoadError(e);
            }
          },
          onLoadError
        );
      } else {
        loader.load(src.url, onGltfLoaded, undefined, onLoadError);
      }
    } catch (e) {
      onLoadError(e);
    }

    return controller;
  }

  return {
    resolveAssetSource,
    attachToPlayer,
  };
})();
