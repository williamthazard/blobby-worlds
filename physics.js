// ============================================================
// physics.js - Grounded OoT Physics, Dodge-Roll, Z-Targeting,
// Buoyant Wave Swimming, Rig Animation & Hill-Aware Camera.
//
// Consumes globals: THREE, heightAt, terrainNormalAt, surfaceAt,
//                   getNearbyColliders, WATER_Y, Shaders, Sound, camera
// Exports global:   Physics
// ============================================================

const Physics = (() => {
  'use strict';

  const AIR_MAX = 25;
  const MAX_WALK_SLOPE_COS = Math.cos((42 * Math.PI) / 180);
  const PLAYER_RADIUS = 0.42;
  const COYOTE_TIME = 0.12;
  const JUMP_BUF_TIME = 0.12;
  const ROLL_BUF_TIME = 0.18;
  const GRAVITY_RISE = 22;
  const GRAVITY_APEX = 17;
  const GRAVITY_FALL = 30;
  const GRAVITY_CUT = 42;
  const JUMP_VEL = 9.8;
  const WALK_SPEED = 7.0;
  const SPRINT_SPEED = 11.2;
  const SWIM_SPEED = 4.5;
  const SWIM_SPRINT_SPEED = 7.0;
  const ROLL_DURATION = 0.45;
  const ROLL_COOLDOWN = 0.25;
  const ROLL_INVULN = 0.38;
  const ROLL_SPEED_START = 12.5;
  const ROLL_SPEED_END = 6.5;
  const CAST_DURATION = 0.28;
  const LOCK_ACQUIRE_RANGE = 20;
  const LOCK_DROP_RANGE = 26;
  const SLIDE_SPEED = 6.5;

  const P = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: false,
    facing: 0,
    walkT: 0,
    idleT: 0,
    swimming: false,
    air: AIR_MAX,
    hp: 12,
    maxHp: 12,
    hurtInvulnT: 0,
    hurtFlashT: 0,
    dead: false,
    drownAcc: 0,
    headYaw: 0,
    headPitch: 0,
    slopeS: 0,
    squash: 0,
    jumpStretch: 0,
    jumpPrepT: 0,
    jumpPrepDur: 0.074,
    jumpPrepRunB: 0,
    landT: 0,
    landDur: 0.18,
    landStrength: 0,
    capeLag: 0,
    capeSway: 0,
    prevFacing: 0,
    slideTrailAcc: 0,
    airB: 0,
    coyoteT: 0,
    jumpBufT: 0,
    rollBufT: 0,
    rollT: 0,
    rollCooldown: 0,
    rollDirX: 0,
    rollDirZ: 1,
    rollLocalFwd: 1,
    rollLocalSide: 0,
    invulnT: 0,
    castT: 0,
    castDur: CAST_DURATION,
    castStep: 0,
    castAimPitch: 0,
    castFaceT: 0,
    recoverT: 0,
    recoverDur: 0.24,
    wasActionAnim: false,
    shotComboStep: 0,
    shotComboWindowT: 0,
    spinCancelWindowT: 0,
    meleeT: 0,
    meleeDur: 0.3,
    meleeStep: 0,
    meleeBufT: 0,
    comboWindowT: 0,
    plunging: false,
    plungeWindupT: 0,
    plungeTrailAcc: 0,
    plungeLandT: 0,
    stepAcc: 0,
    stepSide: 1,
    wasInWater: false,
    sliding: false,
    slidePoseB: 0,
    slideNormX: 0,
    slideNormZ: 0,
    sprinting: false,
    sprintBlend: 0,
    swimPitch: 0,
    swimMoveBlend: 0,
    hasBreathRelic: false,
  };

  const keys = {};
  let lockTarget = null;
  let firstPerson = false;

  // Camera state
  let camYaw = 0;
  let camDist = 10.5;
  let effCamDist = 10.5;
  let camPitch = 0.05;
  let lookPitch = 0;
  let camShake = 0;
  let camKick = 0;

  let callbacks = {};
  let boundDom = null;
  let globalListenersBound = false;
  let prevSpaceKey = false;
  let lastBreathToastTime = -10;

  const mouse = { down: false, button: -1, moved: 0, lastX: 0, lastY: 0 };
  let touchMoveX = 0;
  let touchMoveZ = 0;
  let touchSprint = false;
  let touchJumpHeld = false;
  const canvasTouches = [
    { id: null, x: 0, y: 0 },
    { id: null, x: 0, y: 0 },
  ];
  const touchCam = { pinchDist: 0 };

  const PREVENT_KEYS = {
    KeyW: true,
    KeyA: true,
    KeyS: true,
    KeyD: true,
    KeyQ: true,
    KeyE: true,
    KeyV: true,
    KeyF: true,
    KeyC: true,
    KeyX: true,
    Space: true,
    ShiftLeft: true,
    ShiftRight: true,
    Tab: true,
    ArrowUp: true,
    ArrowDown: true,
    ArrowLeft: true,
    ArrowRight: true,
  };

  function clamp(v, a, b) {
    if (typeof THREE !== 'undefined' && THREE.MathUtils && typeof THREE.MathUtils.clamp === 'function') {
      return THREE.MathUtils.clamp(v, a, b);
    }
    return v < a ? a : v > b ? b : v;
  }

  function smoothstep(x, a, b) {
    if (typeof THREE !== 'undefined' && THREE.MathUtils && typeof THREE.MathUtils.smoothstep === 'function') {
      return THREE.MathUtils.smoothstep(x, a, b);
    }
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function makeVec3(x = 0, y = 0, z = 0) {
    if (typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function') {
      return new THREE.Vector3(x, y, z);
    }
    return {
      x,
      y,
      z,
      set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
      addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
      subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; },
      normalize() {
        const l = Math.hypot(this.x, this.y, this.z) || 1;
        this.x /= l; this.y /= l; this.z /= l;
        return this;
      },
      lerp(v, a) {
        this.x += (v.x - this.x) * a;
        this.y += (v.y - this.y) * a;
        this.z += (v.z - this.z) * a;
        return this;
      },
      project() { return this; },
    };
  }

  // Pre-allocated scratch buffers (zero GC in hot update loop)
  const _stepNormCur = { x: 0, y: 1, z: 0 };
  const _stepNormNext = { x: 0, y: 1, z: 0 };
  const _stepOut = { x: 0, z: 0, sliding: false, slideVx: 0, slideVz: 0, blocked: false, blockNx: 0, blockNz: 0 };
  const _colOut = { x: 0, z: 0, hit: false };
  const _colliderBuf = [];
  const _reticleOut = { visible: false, x: 0, y: 0, scale: 1 };
  const _inDir = { x: 0, z: 0 };
  const _prevPose = {
    pelvisY: 0.88,
    pelvisRX: 0,
    pelvisRY: 0,
    pelvisRZ: 0,
    torsoRX: 0,
    torsoRY: 0,
    torsoRZ: 0,
    thighLX: 0,
    thighLZ: 0,
    thighRX: 0,
    thighRZ: 0,
    kneeLX: 0,
    kneeRX: 0,
    ankleLX: 0,
    ankleRX: 0,
    armLX: 0,
    armLZ: -0.14,
    armRX: 0,
    armRZ: 0.14,
    elbowLX: -0.25,
    elbowRX: -0.25,
    staffRX: 0.42,
    staffRZ: -0.38,
  };
  const _rigState = {
    spd: 0, baseSpeed: 7, moving: false, walking: false, airborne: false,
    vx: 0, vz: 0, vy: 0, facing: 0, sinF: 0, cosF: 1,
    sprintB: 0, runBlend: 0, amp: 0, riseW: 0, fallW: 0, apexW: 0,
    lockedOn: false, dead: false, rollT: 0, rollDur: ROLL_DURATION, rollLocalFwd: 1, rollLocalSide: 0,
    swimming: false, swimMoveBlend: 0, sliding: false, slidePoseB: 0, slideNormX: 0, slideNormZ: 0,
    landT: 0, landStrength: 0, meleeT: 0, meleeDur: 0.3, meleeStep: 0,
    castT: 0, castDur: CAST_DURATION, castStep: 0, castAimPitch: 0,
    plunging: false, plungeWindupT: 0, plungeLandT: 0, hurtFlashT: 0,
    hasBreathRelic: false, headYaw: 0, headPitch: 0, x: 0, z: 0,
  };

  const _camFocus = makeVec3();
  const _camDir = makeVec3();
  const _camRayDir = makeVec3();
  const _camTargetPos = makeVec3();
  const _camFwd = makeVec3();
  const _reticleVec = makeVec3();
  const _aimDir = makeVec3();

  function defaultHeightZero() {
    return 0;
  }

  function defaultNormalUp(x, z, out) {
    out.x = 0;
    out.y = 1;
    out.z = 0;
    return out;
  }

  function wrapAngle(a) {
    if (a > -Math.PI && a <= Math.PI) return a;
    let r = (a + Math.PI) % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    r -= Math.PI;
    return r === -Math.PI && a > 0 ? Math.PI : r;
  }

  function turnToward(obj, targetYaw, dt, rate) {
    if (!obj || !obj.rotation) return;
    obj.rotation.y += wrapAngle(targetYaw - obj.rotation.y) * Math.min(1, dt * rate);
  }

  /**
   * 2-pass height-aware circle-vs-circle push-out around solid props.
   * Skips horizontal push-out whenever footY clears c.topY so the player can jump over & stand on rocks!
   * Reuses `out` for zero GC.
   */
  function resolveColliders(x, z, radius, colliders, out, footY) {
    if (!out) out = { x: 0, z: 0, hit: false };
    out.x = x;
    out.z = z;
    out.hit = false;
    if (!colliders || colliders.length === 0) return out;

    const hasFootY = typeof footY === 'number';
    const n = colliders.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const c = colliders[i];
        if (c.pad) continue;
        if (hasFootY && typeof c.topY === 'number' && footY >= c.topY - 0.18) continue;
        const minD = radius + c.r;
        const dx = out.x - c.x;
        const dz = out.z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD) {
          out.hit = true;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const push = minD - d;
            out.x += (dx / d) * push;
            out.z += (dz / d) * push;
          } else {
            out.x = c.x + minD;
            out.z = c.z;
          }
        }
      }
    }
    return out;
  }

  function getSupportHeight(x, z, footY, baseGround, colliders, vy) {
    let support = baseGround;
    if (!colliders || colliders.length === 0) return support;
    const rising = typeof vy === 'number' && vy > 0.5;
    const snapTol = rising ? 0.02 : 0.28;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.standable || typeof c.topY !== 'number') continue;
      if (footY < c.topY - snapTol) continue;
      const maxR = c.r + PLAYER_RADIUS * 0.65;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz <= maxR * maxR && c.topY > support) {
        support = c.topY;
      }
    }
    return support;
  }

  function projectOutUphill(dx, dz, nx, nz) {
    const hLenSq = nx * nx + nz * nz;
    if (hLenSq <= 1e-8) return false;
    const dot = dx * nx + dz * nz;
    if (dot >= 0) return false;
    const inv = dot / hLenSq;
    _inDir.x = dx - inv * nx;
    _inDir.z = dz - inv * nz;
    return true;
  }

  /**
   * Resolves horizontal terrain movement with 42-deg slope blocking,
   * uphill/downhill speed scaling, and downhill cliff sliding.
   */
  function stepTerrainMove(x, z, dx, dz, onGround, heightFn, normalFn, out) {
    const hFn = heightFn || (typeof heightAt === 'function' ? heightAt : defaultHeightZero);
    const nFn = normalFn || (typeof terrainNormalAt === 'function' ? terrainNormalAt : defaultNormalUp);
    if (!out) out = {};

    out.x = x;
    out.z = z;
    out.sliding = false;
    out.slideVx = 0;
    out.slideVz = 0;
    out.blocked = false;
    out.blockNx = 0;
    out.blockNz = 0;

    const curN = nFn(x, z, _stepNormCur) || _stepNormCur;
    const curNy = clamp(curN.y, 0, 1);

    let sdx = dx;
    let sdz = dz;
    const stepLen = Math.hypot(sdx, sdz);

    if (onGround && curNy < MAX_WALK_SLOPE_COS) {
      out.sliding = true;
      out.slideVx = curN.x * SLIDE_SPEED;
      out.slideVz = curN.z * SLIDE_SPEED;
    } else if (onGround && stepLen > 1e-8) {
      const slopeFactor = clamp((1 - curNy) / (1 - MAX_WALK_SLOPE_COS), 0, 1);
      const horizN = Math.max(0.01, Math.hypot(curN.x, curN.z));
      const dotCur = sdx * curN.x + sdz * curN.z;
      const align = clamp(Math.abs(dotCur) / (stepLen * horizN), 0, 1);
      const scale = dotCur < 0
        ? 1 - slopeFactor * 0.32 * align
        : 1 + slopeFactor * 0.10 * align;
      sdx *= scale;
      sdz *= scale;
    }

    // Block climbing off an already-steep grounded face
    if (onGround && curNy < MAX_WALK_SLOPE_COS && projectOutUphill(sdx, sdz, curN.x, curN.z)) {
      sdx = _inDir.x;
      sdz = _inDir.z;
      out.blocked = true;
      out.blockNx = curN.x;
      out.blockNz = curN.z;
    }

    const tx = x + sdx;
    const tz = z + sdz;
    const nextN = nFn(tx, tz, _stepNormNext) || _stepNormNext;
    if (nextN !== _stepNormNext) {
      _stepNormNext.x = nextN.x;
      _stepNormNext.y = nextN.y;
      _stepNormNext.z = nextN.z;
    }
    const nextNy = clamp(nextN.y, 0, 1);

    if (nextNy < MAX_WALK_SLOPE_COS) {
      const horizStep = Math.hypot(sdx, sdz);
      const shouldBlockAir = onGround || (horizStep > 1e-8 && (hFn(tx, tz) - hFn(x, z)) / horizStep > 1.1);
      if (shouldBlockAir && projectOutUphill(sdx, sdz, nextN.x, nextN.z)) {
        sdx = _inDir.x;
        sdz = _inDir.z;
        out.blocked = true;
        out.blockNx = nextN.x;
        out.blockNz = nextN.z;
      }
    }

    out.x = x + sdx;
    out.z = z + sdz;
    return out;
  }

  /**
   * 6-sample terrain ray-march from focus along -dir to keep the camera
   * from dipping into intervening ridges or cliffs.
   */
  function computeCameraDistance(focus, dir, desiredDist, heightFn) {
    if (desiredDist <= 0) return 0;
    const hFn = heightFn || (typeof heightAt === 'function' ? heightAt : defaultHeightZero);
    const dLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / dLen;
    const dy = dir.y / dLen;
    const dz = dir.z / dLen;
    const minDist = Math.min(desiredDist, 0.9);
    let prevClear = 0;

    for (let i = 0; i < 6; i++) {
      const t = 0.2 + (i / 5) * 0.8;
      const d = desiredDist * t;
      const sx = focus.x - dx * d;
      const sy = focus.y - dy * d;
      const sz = focus.z - dz * d;
      if (sy < hFn(sx, sz) + 0.65) {
        let lo = i === 0 ? Math.min(minDist, d * 0.5) : prevClear;
        let hi = d;
        for (let b = 0; b < 5; b++) {
          const mid = (lo + hi) * 0.5;
          const mx = focus.x - dx * mid;
          const my = focus.y - dy * mid;
          const mz = focus.z - dz * mid;
          if (my < hFn(mx, mz) + 0.65) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        return Math.max(minDist, lo - 0.15);
      }
      prevClear = d;
    }
    return desiredDist;
  }

  function isStarted() {
    return typeof callbacks.isStarted === 'function' ? !!callbacks.isStarted() : true;
  }

  function emitToast(msg, ms) {
    if (typeof callbacks.onToast === 'function') callbacks.onToast(msg, ms);
  }

  function getWaterSurfaceY(x, z, time) {
    if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.waterHeightAt === 'function') {
      return Shaders.waterHeightAt(x, z, time);
    }
    return typeof WATER_Y === 'number' ? WATER_Y : 0;
  }

  function setTouchMove(ix, iz, sprint) {
    touchMoveX = clamp(Number(ix) || 0, -1, 1);
    touchMoveZ = clamp(Number(iz) || 0, -1, 1);
    touchSprint = !!sprint;
  }

  function setTouchJump(held) {
    const next = !!held;
    if (next && !touchJumpHeld) {
      P.jumpBufT = JUMP_BUF_TIME;
    }
    touchJumpHeld = next;
  }

  function orbitCamera(dx, dy) {
    const ddx = Number(dx) || 0;
    const ddy = Number(dy) || 0;
    if (firstPerson) {
      P.facing -= ddx * 0.006;
      lookPitch = clamp(lookPitch - ddy * 0.004, -1.25, 1.3);
    } else {
      camYaw -= ddx * 0.006;
      camPitch = clamp(camPitch - ddy * 0.004, -0.88, 1.25);
    }
  }

  function computeMoveInput(out) {
    let mx = 0;
    let mz = 0;
    if (firstPerson) {
      const kbFwd = (keys.KeyW || keys.ArrowUp) ? 1 : (keys.KeyS || keys.ArrowDown) ? -1 : 0;
      const fwd = clamp(kbFwd - touchMoveZ, -1, 1);
      mx = Math.sin(P.facing) * fwd;
      mz = Math.cos(P.facing) * fwd;
    } else if (lockTarget && lockTarget.mesh && lockTarget.mesh.position) {
      let ix = touchMoveX;
      let iz = touchMoveZ;
      if (keys.KeyW || keys.ArrowUp) iz -= 1;
      if (keys.KeyS || keys.ArrowDown) iz += 1;
      if (keys.KeyA || keys.ArrowLeft) ix -= 1;
      if (keys.KeyD || keys.ArrowRight) ix += 1;
      const l = Math.hypot(ix, iz);
      if (l > 0.02) {
        if (l > 1) {
          ix /= l;
          iz /= l;
        }
        const tp = lockTarget.mesh.position;
        const tx = tp.x - P.x;
        const tz = tp.z - P.z;
        const td = Math.hypot(tx, tz) || 1;
        const fx = tx / td;
        const fz = tz / td;
        const rx = -fz;
        const rz = fx;
        mx = fx * -iz + rx * ix;
        mz = fz * -iz + rz * ix;
      }
    } else {
      let ix = touchMoveX;
      let iz = touchMoveZ;
      if (keys.KeyW || keys.ArrowUp) iz -= 1;
      if (keys.KeyS || keys.ArrowDown) iz += 1;
      if (keys.KeyA || keys.ArrowLeft) ix -= 1;
      if (keys.KeyD || keys.ArrowRight) ix += 1;
      const l = Math.hypot(ix, iz);
      if (l > 0.02) {
        if (l > 1) {
          ix /= l;
          iz /= l;
        }
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        const rx = -fz;
        const rz = fx;
        mx = fx * -iz + rx * ix;
        mz = fz * -iz + rz * ix;
      }
    }
    out.x = mx;
    out.z = mz;
    return out;
  }

  function isCandidateValid(c) {
    if (!c || !c.mesh || !c.mesh.position) return false;
    if (c.mesh.parent === null) return false;
    if (c.ref && typeof c.ref.hp === 'number' && c.ref.hp <= 0) return false;
    if (c.kind && c.kind !== 'gloom' && c.kind !== 'cocoon') return false;
    return true;
  }

  function clearLockOn() {
    if (!lockTarget) return false;
    lockTarget = null;
    if (typeof Sound !== 'undefined' && Sound && typeof Sound.lockOn === 'function') {
      Sound.lockOn(false);
    }
    return true;
  }

  function validateLockTarget() {
    if (!lockTarget) return null;
    if (!lockTarget.mesh || !lockTarget.mesh.position || lockTarget.mesh.parent === null) {
      clearLockOn();
      return null;
    }
    if (lockTarget.ref && typeof lockTarget.ref.hp === 'number' && lockTarget.ref.hp <= 0) {
      clearLockOn();
      return null;
    }
    if (typeof callbacks.getLockCandidates === 'function') {
      const list = callbacks.getLockCandidates();
      if (Array.isArray(list)) {
        let found = false;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c && ((c.ref != null && c.ref === lockTarget.ref) || c.mesh === lockTarget.mesh)) {
            found = true;
            break;
          }
        }
        if (!found) {
          clearLockOn();
          return null;
        }
      }
    }
    const pos = lockTarget.mesh.position;
    const dist = Math.hypot(pos.x - P.x, pos.y - P.y, pos.z - P.z);
    if (dist > LOCK_DROP_RANGE) {
      clearLockOn();
      return null;
    }
    return lockTarget;
  }

  function toggleLockOn() {
    if (lockTarget) {
      clearLockOn();
      return null;
    }
    if (typeof callbacks.getLockCandidates !== 'function') return null;
    const candidates = callbacks.getLockCandidates();
    if (!candidates || candidates.length === 0) return null;

    const fwdYaw = firstPerson ? P.facing : camYaw;
    const fwdX = Math.sin(fwdYaw);
    const fwdZ = Math.cos(fwdYaw);
    let best = null;
    let bestScore = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!isCandidateValid(c)) continue;
      const pos = c.mesh.position;
      const dx = pos.x - P.x;
      const dy = pos.y - P.y;
      const dz = pos.z - P.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > LOCK_ACQUIRE_RANGE) continue;

      const hDist = Math.max(0.001, Math.hypot(dx, dz));
      const coneDot = (dx * fwdX + dz * fwdZ) / hDist;
      const score = dist * (1.35 - 0.55 * coneDot);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (!best) return null;

    lockTarget = {
      kind: best.kind || 'gloom',
      ref: best.ref !== undefined ? best.ref : best,
      mesh: best.mesh,
      yOffset: best.yOffset !== undefined ? best.yOffset : (best.kind === 'cocoon' ? 0.75 : 0.6),
    };
    if (typeof Sound !== 'undefined' && Sound && typeof Sound.lockOn === 'function') {
      Sound.lockOn(true);
    }
    return lockTarget;
  }

  function triggerCastAnim(step = 1, dur = CAST_DURATION) {
    P.castStep = step;
    P.castDur = dur;
    P.castT = dur;
  }

  function faceAimDirection(dx, dy, dz) {
    const h = Math.hypot(dx || 0, dz || 0);
    if (h > 0.01) {
      P.facing = Math.atan2(dx, dz);
    }
    P.castAimPitch = clamp(Math.atan2(dy || 0, Math.max(0.25, h)), -0.65, 0.75);
    P.castFaceT = Math.max(P.castDur + 0.14, 0.38);
    return P.facing;
  }

  /**
   * Starts either a hybrid Melee->Shot finisher or the 3-step sequential Star-Shot combo:
   * - Click -> F           => 'fan'   (3-bolt horizontal Star-Fan Scatter)
   * - Click -> Click -> F  => 'comet' (giant blazing Piercing Comet)
   * - Click x3 -> F        => 'nova'  (6-bolt 360° Constellation Nova)
   * - F -> F -> F          => 1 (Star Bolt) -> 2 (Twin Bolts) -> 3 (Exploding Grand Star-Orb)
   */
  function startShot() {
    if (P.dead) return false;

    // 1) Hybrid Melee -> Shot finishers!
    if (P.meleeStep === 3 && (P.meleeT > 0 || P.spinCancelWindowT > 0)) {
      P.meleeT = 0;
      P.meleeStep = 0;
      P.meleeBufT = 0;
      P.comboWindowT = 0;
      P.spinCancelWindowT = 0;
      P.shotComboStep = 0;
      P.shotComboWindowT = 0;
      triggerCastAnim(6, 0.44);
      return 'nova';
    }
    if (P.meleeStep === 2 && (P.meleeT > 0 || P.comboWindowT > 0)) {
      P.meleeT = 0;
      P.meleeStep = 0;
      P.meleeBufT = 0;
      P.comboWindowT = 0;
      P.shotComboStep = 0;
      P.shotComboWindowT = 0;
      triggerCastAnim(5, 0.40);
      return 'comet';
    }
    if ((P.meleeStep === 1 || P.meleeStep === 7) && (P.meleeT > 0 || P.comboWindowT > 0)) {
      P.meleeT = 0;
      P.meleeStep = 0;
      P.meleeBufT = 0;
      P.comboWindowT = 0;
      P.shotComboStep = 0;
      P.shotComboWindowT = 0;
      triggerCastAnim(4, 0.32);
      return 'fan';
    }

    // 2) Sequential 3-step Star-Shot Combo (1 -> 2 -> 3)
    const nextShot = P.shotComboWindowT > 0 && P.shotComboStep >= 1 && P.shotComboStep < 3
      ? P.shotComboStep + 1
      : 1;
    P.shotComboStep = nextShot;
    P.shotComboWindowT = nextShot === 3 ? 0 : 0.80;
    P.meleeStep = 0;
    P.comboWindowT = 0;
    triggerCastAnim(nextShot, nextShot === 3 ? 0.42 : 0.26);
    return nextShot;
  }

  function addCameraShake(amount) {
    const a = amount || 0;
    camShake = Math.min(1.0, Math.max(camShake, a));
    if (a >= 0.28) {
      camKick = Math.min(0.55, Math.max(camKick, a * 0.72));
    }
  }

  function startRoll(allowFacingFallback = false) {
    if (P.dead || P.swimming || P.plunging || P.rollT > 0 || P.rollCooldown > 0) return false;
    if (!P.onGround && P.coyoteT <= 0) return false;

    computeMoveInput(_inDir);
    const inLen = Math.hypot(_inDir.x, _inDir.z);
    const velLen = Math.hypot(P.vx, P.vz);
    if (inLen > 0.05) {
      P.rollDirX = _inDir.x / inLen;
      P.rollDirZ = _inDir.z / inLen;
    } else if (velLen > 0.6) {
      P.rollDirX = P.vx / velLen;
      P.rollDirZ = P.vz / velLen;
    } else if (allowFacingFallback) {
      P.rollDirX = Math.sin(P.facing);
      P.rollDirZ = Math.cos(P.facing);
    } else {
      // Standing still with no direction pressed: wait briefly for an arrow/WASD tap
      P.rollBufT = ROLL_BUF_TIME;
      return false;
    }

    // Project roll direction into Starkeeper's local facing frame so side-rolls and
    // back-rolls tumble sideways/backward while PRESERVING forward facing!
    const fwdX = Math.sin(P.facing);
    const fwdZ = Math.cos(P.facing);
    const leftX = Math.cos(P.facing);
    const leftZ = -Math.sin(P.facing);
    let lf = P.rollDirX * fwdX + P.rollDirZ * fwdZ;
    let ls = P.rollDirX * leftX + P.rollDirZ * leftZ;
    const lLen = Math.hypot(lf, ls) || 1;
    P.rollLocalFwd = lf / lLen;
    P.rollLocalSide = ls / lLen;

    P.rollBufT = 0;
    P.meleeT = 0;
    P.rollT = ROLL_DURATION;
    P.rollCooldown = ROLL_COOLDOWN;
    P.invulnT = ROLL_INVULN;
    P.vx = P.rollDirX * ROLL_SPEED_START;
    P.vz = P.rollDirZ * ROLL_SPEED_START;
    P.stepAcc = 0;

    if (typeof Sound !== 'undefined' && Sound && typeof Sound.roll === 'function') {
      Sound.roll();
    }
    const hFn = typeof heightAt === 'function' ? heightAt : defaultHeightZero;
    const g = hFn(P.x, P.z);
    const surfY = getWaterSurfaceY(P.x, P.z, 0);
    if (g < surfY - 0.08) {
      if (typeof callbacks.onSplash === 'function') callbacks.onSplash(P.x, surfY, P.z, 5);
    } else if (typeof callbacks.onDust === 'function') {
      const surf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
      callbacks.onDust(P.x, P.y + 0.1, P.z, 5, surf);
    }
    return true;
  }

  function startMelee() {
    if (P.dead || P.plunging) return false;
    // Buffer clicks during active swing 1, 2, or sprint-slash so rapid combos never drop inputs,
    // while letting the active swing finish its readable arc before chaining cleanly at <= 0.15s!
    if (P.meleeT > 0.15) {
      if (P.meleeStep === 1 || P.meleeStep === 2 || P.meleeStep === 7) {
        P.meleeBufT = 0.36;
      }
      return false;
    }
    const hFn = typeof heightAt === 'function' ? heightAt : defaultHeightZero;
    const ground = hFn(P.x, P.z);
    const inWater = !!P.swimming;
    const durMul = inWater ? 1.22 : 1.0;

    // Orient cleanly toward locked enemy when Z-targeting
    let aimYaw = P.facing;
    if (lockTarget && lockTarget.mesh && lockTarget.mesh.position) {
      aimYaw = Math.atan2(lockTarget.mesh.position.x - P.x, lockTarget.mesh.position.z - P.z);
      P.facing = aimYaw;
    }

    // 1) Heroic Aerial Star-Slam (Jump Attack) — land/airborne only
    if (!inWater && !P.onGround && (P.y > ground + 0.22 || P.vy > 1.2)) {
      P.plunging = true;
      P.plungeWindupT = 0.18;
      P.plungeTrailAcc = 0;
      P.meleeStep = 5;
      P.meleeT = 0;
      P.meleeBufT = 0;
      P.rollT = 0;
      P.vy = Math.max(P.vy * 0.35, 3.8);
      P.vx = Math.sin(aimYaw) * 8.4;
      P.vz = Math.cos(aimYaw) * 8.4;
      return 'plunge';
    }

    // 2) Roll Dash-Strike during or immediately exiting a land roll
    if (!inWater && (P.rollT > 0 || P.rollCooldown > 0.06)) {
      P.rollT = 0;
      P.meleeStep = 4;
      P.meleeDur = 0.46;
      P.meleeT = 0.46;
      P.meleeBufT = 0;
      P.comboWindowT = 0.86;
      P.shotComboStep = 0;
      P.shotComboWindowT = 0;
      P.vx = Math.sin(aimYaw) * 11.4;
      P.vz = Math.cos(aimYaw) * 11.4;
      return 'roll';
    }

    // 2.5) Hybrid Shot -> Melee Dash Finishers (works both on land and underwater with water-drag weighting!)
    // F -> Click: Starlight Dash-Cut | F -> F -> Click: Comet Dash-Whirl (360° spin!)
    if (P.shotComboWindowT > 0 && P.shotComboStep >= 1) {
      const wasTwin = P.shotComboStep >= 2;
      P.shotComboStep = 0;
      P.shotComboWindowT = 0;
      P.castT = 0;
      P.meleeBufT = 0;
      const dashMul = inWater ? 0.56 : 1.0;
      if (wasTwin) {
        P.meleeStep = 3;
        P.meleeDur = 0.74 * durMul;
        P.meleeT = P.meleeDur;
        P.comboWindowT = 0;
        P.spinCancelWindowT = 0.82 * durMul;
        P.vx = Math.sin(aimYaw) * 12.8 * dashMul;
        P.vz = Math.cos(aimYaw) * 12.8 * dashMul;
        return 'dashWhirl';
      }
      P.meleeStep = 6;
      P.meleeDur = 0.46 * durMul;
      P.meleeT = P.meleeDur;
      P.comboWindowT = 0.88 * durMul;
      P.vx = Math.sin(aimYaw) * 12.2 * dashMul;
      P.vz = Math.cos(aimYaw) * 12.2 * dashMul;
      return 'dashCut';
    }

    // 2.8) Sprint Starlight Slide-Thrust (land sprint only)
    const curSpd = Math.hypot(P.vx, P.vz);
    const inComboChain = P.comboWindowT > 0 && (P.meleeStep === 1 || P.meleeStep === 2 || P.meleeStep === 7);
    if (!inWater && !inComboChain && (P.sprinting || P.sprintBlend > 0.4) && curSpd > 7.5) {
      P.meleeStep = 7;
      P.meleeDur = 0.56;
      P.meleeT = 0.56;
      P.meleeBufT = 0;
      P.comboWindowT = 0.94;
      P.spinCancelWindowT = 0;
      P.slideTrailAcc = 0;
      const chargeSpd = Math.max(curSpd * 1.36, 15.6);
      P.vx = Math.sin(aimYaw) * chargeSpd;
      P.vz = Math.cos(aimYaw) * chargeSpd;
      if (typeof callbacks.onDust === 'function') {
        const surf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
        callbacks.onDust(P.x, P.y + 0.1, P.z, 7, surf);
      }
      return 'sprint';
    }

    // 3) 3-Hit Staff Combo (on land OR weighty hydro-staff combo underwater!)
    const prevStep = P.meleeStep === 7 ? 1 : P.meleeStep;
    const nextStep = P.comboWindowT > 0 && prevStep >= 1 && prevStep < 3 ? prevStep + 1 : 1;
    P.meleeStep = nextStep;
    P.meleeDur = (nextStep === 3 ? 0.74 : nextStep === 2 ? 0.56 : 0.48) * durMul;
    P.meleeT = P.meleeDur;
    P.meleeBufT = 0;
    P.comboWindowT = nextStep === 3 ? 0 : 0.96 * durMul;
    P.spinCancelWindowT = nextStep === 3 ? 0.82 * durMul : 0;

    const lungeSpd = inWater
      ? Math.max(nextStep === 3 ? 5.4 : 4.2, curSpd * 0.85)
      : Math.max(nextStep === 3 ? 7.6 : 5.8, curSpd * 0.9);
    P.vx = Math.sin(aimYaw) * lungeSpd;
    P.vz = Math.cos(aimYaw) * lungeSpd;
    return nextStep;
  }

  function launchJump(groundY, surfY) {
    P.vy = JUMP_VEL;
    P.onGround = false;
    P.coyoteT = 0;
    P.jumpBufT = 0;
    P.rollT = 0;
    P.jumpStretch = 1.0;

    if (typeof Sound !== 'undefined' && Sound && typeof Sound.jump === 'function') {
      Sound.jump();
    }
    if (groundY < surfY - 0.08) {
      if (typeof callbacks.onSplash === 'function') callbacks.onSplash(P.x, surfY, P.z, 5);
    } else if (typeof callbacks.onDust === 'function') {
      const surf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
      callbacks.onDust(P.x, P.y + 0.08, P.z, 4, surf);
    }
  }

  function onKeyDown(e) {
    if (PREVENT_KEYS[e.code] && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!isStarted()) return;
    if (e.code === 'KeyF' && !e.repeat) {
      if (typeof callbacks.onShoot === 'function') {
        const res = callbacks.onShoot();
        if (res !== false && P.castT <= 0) triggerCastAnim();
      } else if (P.castT <= 0) {
        triggerCastAnim();
      }
    } else if (e.code === 'KeyV' && !e.repeat) {
      firstPerson = !firstPerson;
      if (typeof callbacks.onPlayerVisible === 'function') callbacks.onPlayerVisible(!firstPerson);
      emitToast(
        firstPerson ? 'First-person view. A and D turn, W and S walk.' : 'Third-person view.',
        1500
      );
    } else if (e.code === 'Tab' && !e.repeat) {
      toggleLockOn();
    } else if ((e.code === 'KeyC' || e.code === 'KeyX') && !e.repeat) {
      startRoll();
    } else if (e.code === 'Space' && !e.repeat) {
      P.jumpBufT = JUMP_BUF_TIME;
    }
    keys[e.code] = true;
  }

  function onKeyUp(e) {
    if (PREVENT_KEYS[e.code] && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    keys[e.code] = false;
  }

  function onContextMenu(e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onMouseDown(e) {
    if (!isStarted()) return;
    if (e.button === 2) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      toggleLockOn();
      return;
    }
    if (e.button === 0) {
      mouse.down = true;
      mouse.button = 0;
      mouse.moved = 0;
      mouse.lastX = e.clientX;
      mouse.lastY = e.clientY;
    }
  }

  function onMouseMove(e) {
    if (!mouse.down || mouse.button !== 0) return;
    const dx = e.clientX - mouse.lastX;
    const dy = e.clientY - mouse.lastY;
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
    orbitCamera(dx, dy);
  }

  function findTouchInList(list, id) {
    if (!list || id === null) return null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  function compactCanvasTouches() {
    if (canvasTouches[0].id === null && canvasTouches[1].id !== null) {
      canvasTouches[0].id = canvasTouches[1].id;
      canvasTouches[0].x = canvasTouches[1].x;
      canvasTouches[0].y = canvasTouches[1].y;
      canvasTouches[1].id = null;
    }
  }

  function resetCanvasTouches() {
    canvasTouches[0].id = null;
    canvasTouches[1].id = null;
    touchCam.pinchDist = 0;
  }

  function onTouchStart(e) {
    if (!isStarted() || !e) return;
    if (boundDom && e.target && e.target !== boundDom) return;
    if (e.touches) {
      if (canvasTouches[0].id !== null && !findTouchInList(e.touches, canvasTouches[0].id)) {
        canvasTouches[0].id = null;
      }
      if (canvasTouches[1].id !== null && !findTouchInList(e.touches, canvasTouches[1].id)) {
        canvasTouches[1].id = null;
      }
      compactCanvasTouches();
    }
    const list = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches : e.touches;
    if (!list || list.length === 0) return;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.identifier === canvasTouches[0].id) {
        canvasTouches[0].x = t.clientX;
        canvasTouches[0].y = t.clientY;
      } else if (t.identifier === canvasTouches[1].id) {
        canvasTouches[1].x = t.clientX;
        canvasTouches[1].y = t.clientY;
      } else if (canvasTouches[0].id === null) {
        canvasTouches[0].id = t.identifier;
        canvasTouches[0].x = t.clientX;
        canvasTouches[0].y = t.clientY;
      } else if (canvasTouches[1].id === null) {
        canvasTouches[1].id = t.identifier;
        canvasTouches[1].x = t.clientX;
        canvasTouches[1].y = t.clientY;
      }
    }
    if (canvasTouches[0].id !== null && canvasTouches[1].id !== null) {
      touchCam.pinchDist = Math.hypot(
        canvasTouches[0].x - canvasTouches[1].x,
        canvasTouches[0].y - canvasTouches[1].y
      );
    } else {
      touchCam.pinchDist = 0;
    }
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onTouchMove(e) {
    if (!isStarted() || !e || !e.touches) return;
    const t0 = findTouchInList(e.touches, canvasTouches[0].id);
    const t1 = findTouchInList(e.touches, canvasTouches[1].id);
    if (t0 && t1) {
      canvasTouches[0].x = t0.clientX;
      canvasTouches[0].y = t0.clientY;
      canvasTouches[1].x = t1.clientX;
      canvasTouches[1].y = t1.clientY;
      const nextDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (touchCam.pinchDist > 0) {
        const delta = touchCam.pinchDist - nextDist;
        camDist = clamp(camDist + delta * 0.035, 4.5, 18);
      }
      touchCam.pinchDist = nextDist;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    const slot = t0 ? canvasTouches[0] : (t1 ? canvasTouches[1] : null);
    const t = t0 || t1;
    if (!slot || !t) return;
    touchCam.pinchDist = 0;
    const dx = t.clientX - slot.x;
    const dy = t.clientY - slot.y;
    slot.x = t.clientX;
    slot.y = t.clientY;
    if (dx !== 0 || dy !== 0) {
      orbitCamera(dx * 1.35, dy * 1.35);
    }
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onTouchEnd(e) {
    if (!e) {
      resetCanvasTouches();
      return;
    }
    if (e.changedTouches) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const id = e.changedTouches[i].identifier;
        if (canvasTouches[0].id === id) canvasTouches[0].id = null;
        if (canvasTouches[1].id === id) canvasTouches[1].id = null;
      }
    } else if (e.touches) {
      if (canvasTouches[0].id !== null && !findTouchInList(e.touches, canvasTouches[0].id)) {
        canvasTouches[0].id = null;
      }
      if (canvasTouches[1].id !== null && !findTouchInList(e.touches, canvasTouches[1].id)) {
        canvasTouches[1].id = null;
      }
    }
    compactCanvasTouches();
    if (canvasTouches[0].id === null || canvasTouches[1].id === null) {
      touchCam.pinchDist = 0;
    }
  }

  function onMouseUp(e) {
    if (e && e.button !== undefined && e.button !== 0) return;
    if (mouse.down && mouse.button === 0 && mouse.moved < 10 && isStarted() && !P.dead) {
      if (typeof callbacks.onMelee === 'function') {
        callbacks.onMelee();
      } else if (typeof callbacks.onShoot === 'function') {
        if (P.castT <= 0) triggerCastAnim();
        callbacks.onShoot();
      }
    }
    mouse.down = false;
    mouse.button = -1;
  }

  function onWheel(e) {
    camDist = clamp(camDist + e.deltaY * 0.01, 4.5, 18);
  }

  function onBlur() {
    for (const code in keys) keys[code] = false;
    mouse.down = false;
    mouse.button = -1;
    prevSpaceKey = false;
    touchMoveX = 0;
    touchMoveZ = 0;
    touchSprint = false;
    touchJumpHeld = false;
    resetCanvasTouches();
  }

  function init(domElement, cb) {
    callbacks = cb || {};
    mouse.down = false;
    mouse.button = -1;
    mouse.moved = 0;
    resetCanvasTouches();

    if (boundDom && boundDom !== domElement && typeof boundDom.removeEventListener === 'function') {
      boundDom.removeEventListener('mousedown', onMouseDown);
      boundDom.removeEventListener('contextmenu', onContextMenu);
      boundDom.removeEventListener('touchstart', onTouchStart);
      boundDom.removeEventListener('touchmove', onTouchMove);
      boundDom.removeEventListener('touchend', onTouchEnd);
      boundDom.removeEventListener('touchcancel', onTouchEnd);
      boundDom = null;
    }

    if (domElement && domElement !== boundDom && typeof domElement.addEventListener === 'function') {
      domElement.addEventListener('mousedown', onMouseDown);
      domElement.addEventListener('contextmenu', onContextMenu);
      domElement.addEventListener('touchstart', onTouchStart, { passive: false });
      domElement.addEventListener('touchmove', onTouchMove, { passive: false });
      domElement.addEventListener('touchend', onTouchEnd);
      domElement.addEventListener('touchcancel', onTouchEnd);
      boundDom = domElement;
    }

    if (!globalListenersBound && typeof addEventListener === 'function') {
      addEventListener('keydown', onKeyDown);
      addEventListener('keyup', onKeyUp);
      addEventListener('mousemove', onMouseMove);
      addEventListener('mouseup', onMouseUp);
      addEventListener('wheel', onWheel, { passive: true });
      addEventListener('blur', onBlur);
      globalListenersBound = true;
    }
  }

  function animatePlayerRig(dt, time, player, spd, baseSpeed, moving, lookCandidates) {
    if (!player) return;
    const u = player.userData;
    const walking = moving && P.onGround && !P.swimming && P.rollT <= 0 && !P.sliding;
    const airborne = !P.onGround && !P.swimming;
    const runBlend = smoothstep(spd, 3.5, 6.8);
    const sprintB = P.sprintBlend;
    const amp = Math.min(1.25, spd / WALK_SPEED) * (0.72 + runBlend * 0.36 + sprintB * 0.16);
    const ph = P.walkT;

    P.airB += ((airborne ? 1 : 0) - P.airB) * Math.min(1, dt * 11);

    const hFn = typeof heightAt === 'function' ? heightAt : defaultHeightZero;
    const sinF = Math.sin(P.facing);
    const cosF = Math.cos(P.facing);
    const slope = walking
      ? clamp((hFn(P.x + sinF * 1.2, P.z + cosF * 1.2) - hFn(P.x - sinF * 1.2, P.z - cosF * 1.2)) / 2.4, -1, 1)
      : 0;
    P.slopeS += (slope - P.slopeS) * Math.min(1, dt * 5);

    const riseW = airborne ? smoothstep(P.vy, 1.0, 4.5) : 0;
    const fallW = airborne ? smoothstep(-P.vy, 1.5, 6.0) : 0;
    const apexW = airborne ? Math.max(0, 1 - riseW - fallW) : 0;

    // Shared slide-blend & target/Starling/downhill head look-at (used by both GLB CharacterRig and procedural fallback)
    const slideTarget = P.sliding && P.onGround && !P.swimming && P.rollT <= 0 && P.meleeT <= 0 && P.jumpPrepT <= 0 ? 1 : 0;
    P.slidePoseB += (slideTarget - P.slidePoseB) * Math.min(1, dt * 11);

    let lookX = 0;
    let lookY = 0;
    let lookZ = 0;
    let hasLook = false;
    if (lockTarget && lockTarget.mesh && lockTarget.mesh.position) {
      const tp = lockTarget.mesh.position;
      lookX = tp.x;
      lookY = tp.y + (lockTarget.yOffset !== undefined ? lockTarget.yOffset : 0.6);
      lookZ = tp.z;
      hasLook = true;
    } else if (lookCandidates && lookCandidates.length > 0) {
      let bestD = 14;
      for (let i = 0; i < lookCandidates.length; i++) {
        const c = lookCandidates[i];
        if (!c) continue;
        const pos = c.mesh ? c.mesh.position : (c.position || c);
        if (!pos || pos.x === undefined) continue;
        const maxD = c.maxDist || 14;
        const d = Math.hypot(pos.x - P.x, pos.y - P.y, pos.z - P.z);
        if (d < bestD && d < maxD) {
          bestD = d;
          lookX = pos.x;
          lookY = pos.y + (c.yOffset !== undefined ? c.yOffset : 0.3);
          lookZ = pos.z;
          hasLook = true;
        }
      }
    }
    let wantYaw = 0;
    let wantPitch = 0;
    if (P.swimming) {
      wantPitch = -0.74 * P.swimMoveBlend;
    } else if (P.slidePoseB > 0.2 && (P.slideNormX !== 0 || P.slideNormZ !== 0)) {
      const downYaw = Math.atan2(P.slideNormX, P.slideNormZ);
      wantYaw = clamp(wrapAngle(downYaw - player.rotation.y), -0.68, 0.68);
      wantPitch = 0.32 * P.slidePoseB;
    } else if (hasLook) {
      const dx = lookX - P.x;
      const dz = lookZ - P.z;
      const relYaw = wrapAngle(Math.atan2(dx, dz) - player.rotation.y);
      if (lockTarget) {
        wantYaw = clamp(relYaw, -0.7, 0.7);
        wantPitch = clamp(Math.atan2(P.y + 1.65 - lookY, Math.max(0.8, Math.hypot(dx, dz))), -0.35, 0.42);
      } else if (Math.abs(relYaw) < 1.25) {
        // Gentle proud glance for nearby critters/Wish in front cone (never craning 30 deg down at ground heels!)
        wantYaw = clamp(relYaw, -0.52, 0.52);
        wantPitch = clamp(Math.atan2(P.y + 1.55 - lookY, Math.max(1.8, Math.hypot(dx, dz))) * 0.42, -0.16, 0.10);
      }
    }
    P.headYaw += (wantYaw - P.headYaw) * Math.min(1, dt * 6);
    P.headPitch += (wantPitch - P.headPitch) * Math.min(1, dt * 6);

    const usingGlb = !!(u && u.glbRig && u.glbRig.ready && typeof u.glbRig.update === 'function');
    if (usingGlb) {
      _rigState.spd = spd;
      _rigState.baseSpeed = baseSpeed;
      _rigState.moving = moving;
      _rigState.walking = walking;
      _rigState.airborne = airborne;
      _rigState.vx = P.vx;
      _rigState.vz = P.vz;
      _rigState.vy = P.vy;
      _rigState.facing = P.facing;
      _rigState.sinF = sinF;
      _rigState.cosF = cosF;
      _rigState.sprintB = sprintB;
      _rigState.runBlend = runBlend;
      _rigState.amp = amp;
      _rigState.riseW = riseW;
      _rigState.fallW = fallW;
      _rigState.apexW = apexW;
      _rigState.lockedOn = !!lockTarget;
      _rigState.dead = P.dead;
      _rigState.rollT = P.rollT;
      _rigState.rollDur = ROLL_DURATION;
      _rigState.rollLocalFwd = P.rollLocalFwd;
      _rigState.rollLocalSide = P.rollLocalSide;
      _rigState.swimming = P.swimming;
      _rigState.swimMoveBlend = P.swimMoveBlend;
      _rigState.sliding = P.sliding;
      _rigState.slidePoseB = P.slidePoseB;
      _rigState.slideNormX = P.slideNormX;
      _rigState.slideNormZ = P.slideNormZ;
      _rigState.landT = P.landT;
      _rigState.landStrength = P.landStrength;
      _rigState.meleeT = P.meleeT;
      _rigState.meleeDur = P.meleeDur;
      _rigState.meleeStep = P.meleeStep;
      _rigState.castT = P.castT;
      _rigState.castDur = P.castDur;
      _rigState.castStep = P.castStep;
      _rigState.castAimPitch = P.castAimPitch;
      _rigState.plunging = P.plunging;
      _rigState.plungeWindupT = P.plungeWindupT;
      _rigState.plungeLandT = P.plungeLandT;
      _rigState.hurtFlashT = P.hurtFlashT;
      _rigState.hasBreathRelic = P.hasBreathRelic;
      _rigState.headYaw = P.headYaw;
      _rigState.headPitch = P.headPitch;
      _rigState.x = P.x;
      _rigState.z = P.z;
      u.glbRig.update(dt, time, _rigState);
    } else if (u && u.pelvis) {
      const inActionAnim = !P.dead && (P.rollT > 0 || P.plunging || P.plungeLandT > 0 || P.meleeT > 0 || P.castT > 0);
      if (P.wasActionAnim && !inActionAnim && !P.dead) {
        P.recoverT = P.recoverDur;
        // Shortest-arc unwrap so 360° rolls & whirlwind spins recover forward smoothly instead of unwinding backward!
        u.pelvis.rotation.x = wrapAngle(u.pelvis.rotation.x);
        u.pelvis.rotation.y = wrapAngle(u.pelvis.rotation.y);
        u.pelvis.rotation.z = wrapAngle(u.pelvis.rotation.z);
      } else if (inActionAnim) {
        P.recoverT = 0;
      }
      P.wasActionAnim = inActionAnim;

      const doRecoverBlend = P.recoverT > 0 && !inActionAnim && !P.dead && !P.swimming;
      if (doRecoverBlend) {
        _prevPose.pelvisY = u.pelvis.position.y;
        _prevPose.pelvisRX = u.pelvis.rotation.x;
        _prevPose.pelvisRY = u.pelvis.rotation.y;
        _prevPose.pelvisRZ = u.pelvis.rotation.z;
        if (u.torso) {
          _prevPose.torsoRX = u.torso.rotation.x;
          _prevPose.torsoRY = u.torso.rotation.y;
          _prevPose.torsoRZ = u.torso.rotation.z;
        }
        if (u.thighL) { _prevPose.thighLX = u.thighL.rotation.x; _prevPose.thighLZ = u.thighL.rotation.z; }
        if (u.thighR) { _prevPose.thighRX = u.thighR.rotation.x; _prevPose.thighRZ = u.thighR.rotation.z; }
        if (u.kneeL) _prevPose.kneeLX = u.kneeL.rotation.x;
        if (u.kneeR) _prevPose.kneeRX = u.kneeR.rotation.x;
        if (u.ankleL) _prevPose.ankleLX = u.ankleL.rotation.x;
        if (u.ankleR) _prevPose.ankleRX = u.ankleR.rotation.x;
        if (u.armL) { _prevPose.armLX = u.armL.rotation.x; _prevPose.armLZ = u.armL.rotation.z; }
        if (u.armR) { _prevPose.armRX = u.armR.rotation.x; _prevPose.armRZ = u.armR.rotation.z; }
        if (u.elbowL) _prevPose.elbowLX = u.elbowL.rotation.x;
        if (u.elbowR) _prevPose.elbowRX = u.elbowR.rotation.x;
        if (u.staffPivot) { _prevPose.staffRX = u.staffPivot.rotation.x; _prevPose.staffRZ = u.staffPivot.rotation.z; }
      }

      if (P.dead) {
        u.pelvis.rotation.x += (1.42 - u.pelvis.rotation.x) * Math.min(1, dt * 7);
        u.pelvis.rotation.y = 0;
        u.pelvis.rotation.z = 0;
        u.pelvis.position.y += (0.28 - u.pelvis.position.y) * Math.min(1, dt * 7);
        if (u.thighL) u.thighL.rotation.z = 0;
        if (u.thighR) u.thighR.rotation.z = 0;
        if (u.armL) { u.armL.rotation.x = -0.3; u.armL.rotation.z = -0.6; }
        if (u.armR) { u.armR.rotation.x = -0.3; u.armR.rotation.z = 0.6; }
        if (u.torso) { u.torso.rotation.x = 0.1; u.torso.rotation.y = 0; u.torso.rotation.z = 0; }
      } else if (P.rollT > 0) {
        const rollProg = 1 - P.rollT / ROLL_DURATION;
        u.pelvis.rotation.x = rollProg * Math.PI * 2 * P.rollLocalFwd;
        u.pelvis.rotation.y = 0;
        u.pelvis.rotation.z = -rollProg * Math.PI * 2 * P.rollLocalSide;
        u.pelvis.position.y = 0.88 - Math.sin(rollProg * Math.PI) * 0.25;
        if (u.torso) {
          u.torso.rotation.x = 0.28 * P.rollLocalFwd;
          u.torso.rotation.y = 0;
          u.torso.rotation.z = -0.22 * P.rollLocalSide;
        }
        if (u.thighL) { u.thighL.rotation.x = -1.1; u.thighL.rotation.z = 0; }
        if (u.thighR) { u.thighR.rotation.x = -1.1; u.thighR.rotation.z = 0; }
        if (u.kneeL) u.kneeL.rotation.x = 1.6;
        if (u.kneeR) u.kneeR.rotation.x = 1.6;
        if (u.ankleL) u.ankleL.rotation.x = -0.3;
        if (u.ankleR) u.ankleR.rotation.x = -0.3;
        if (u.armL) { u.armL.rotation.x = -0.85; u.armL.rotation.z = -0.16; }
        if (u.armR) { u.armR.rotation.x = -0.85; u.armR.rotation.z = 0.16; }
        if (u.elbowL) u.elbowL.rotation.x = -1.15;
        if (u.elbowR) u.elbowR.rotation.x = -1.15;
        if (u.staffPivot) { u.staffPivot.rotation.x = 0.95; u.staffPivot.rotation.z = -0.24; }
      } else if (P.swimming) {
        u.pelvis.rotation.y = 0;
        u.pelvis.rotation.z = 0;
        // Horizontal prone swimming when moving/diving; upright gentle treading when idle
        const sm = P.swimMoveBlend;
        const targetPelvisX = 0.18 + (1.14 - P.swimPitch * 0.58) * sm;
        u.pelvis.rotation.x += (targetPelvisX - u.pelvis.rotation.x) * Math.min(1, dt * 8);
        u.pelvis.position.y = 0.88 - sm * 0.14;

        const strokeRate = 6.2 + sprintB * 2.8;
        const swimPh = time * strokeRate;
        const kick = Math.sin(swimPh * 1.45);
        const tread = Math.sin(time * 2.6);

        // Flutter kick when swimming horizontally; soft frog-tread when idle
        if (u.thighL) { u.thighL.rotation.x = (0.28 + tread * 0.18) * (1 - sm) + (0.08 + kick * 0.36) * sm; u.thighL.rotation.z = 0; }
        if (u.thighR) { u.thighR.rotation.x = (0.28 - tread * 0.18) * (1 - sm) + (0.08 - kick * 0.36) * sm; u.thighR.rotation.z = 0; }
        if (u.kneeL) u.kneeL.rotation.x = (0.55 + Math.max(0, -tread) * 0.3) * (1 - sm) + (0.22 + Math.max(0, -kick) * 0.35) * sm;
        if (u.kneeR) u.kneeR.rotation.x = (0.55 + Math.max(0, tread) * 0.3) * (1 - sm) + (0.22 + Math.max(0, kick) * 0.35) * sm;
        if (u.ankleL) u.ankleL.rotation.x = 0.45 * sm + 0.18 * (1 - sm);
        if (u.ankleR) u.ankleR.rotation.x = 0.45 * sm + 0.18 * (1 - sm);

        // Wide alternating breaststroke / freestyle arm pulls
        const armSwingL = Math.sin(swimPh);
        const armSwingR = Math.sin(swimPh + Math.PI);
        const sweepL = Math.cos(swimPh) * 0.5 + 0.5;
        const sweepR = Math.cos(swimPh + Math.PI) * 0.5 + 0.5;
        if (u.armL) {
          u.armL.rotation.x = (-0.55 + tread * 0.2) * (1 - sm) + (-1.55 + armSwingL * 0.95) * sm;
          u.armL.rotation.z = -0.22 - (0.22 + 0.18 * tread) * (1 - sm) - (0.32 + sweepL * 0.65) * sm;
        }
        if (u.armR) {
          u.armR.rotation.x = (-0.55 - tread * 0.2) * (1 - sm) + (-1.55 + armSwingR * 0.95) * sm;
          u.armR.rotation.z = 0.22 + (0.22 - 0.18 * tread) * (1 - sm) + (0.32 + sweepR * 0.65) * sm;
        }
        if (u.elbowL) u.elbowL.rotation.x = -0.75 * (1 - sm) + (-0.35 - Math.max(0, -armSwingL) * 0.55) * sm;
        if (u.elbowR) u.elbowR.rotation.x = -0.75 * (1 - sm) + (-0.35 - Math.max(0, -armSwingR) * 0.55) * sm;
        if (u.torso) {
          u.torso.rotation.x = 0.08 + sm * 0.12;
          u.torso.rotation.y = armSwingL * 0.18 * sm;
          u.torso.rotation.z = -armSwingL * 0.08 * sm;
        }
        if (u.staffPivot) { u.staffPivot.rotation.x = 0.55 + sm * 0.35; u.staffPivot.rotation.z = -0.28; }
      } else {
        // Project horizontal velocity into Starkeeper's local facing basis for true 2D Z-target footwork
        // (forward run, backward backpedal, and authentic lateral sidestepping!)
        const fwdVel = P.vx * sinF + P.vz * cosF;
        const sideVel = P.vx * cosF - P.vz * sinF; // +X = local right leg side
        const horizSpd = Math.max(0.001, spd);
        const fwdFrac = walking ? clamp(fwdVel / horizSpd, -1, 1) : 1;
        const sideFrac = walking ? clamp(sideVel / horizSpd, -1, 1) : 0;
        const sideAbs = Math.abs(sideFrac);
        const strafeW = walking ? smoothstep(sideAbs, 0.25, 0.72) : 0;
        const backW = walking ? smoothstep(-fwdFrac, 0.20, 0.65) : 0;
        const sDir = sideFrac >= 0 ? 1 : -1;
        const strideSign = walking ? (fwdFrac < -0.15 ? -1 : 1) : 1;
        const fwdStrideWeight = 1 - strafeW * 0.90;

        u.pelvis.rotation.x += (0 - u.pelvis.rotation.x) * Math.min(1, dt * 12);
        u.pelvis.rotation.y = sDir * 0.30 * strafeW;
        u.pelvis.rotation.z += (0 - u.pelvis.rotation.z) * Math.min(1, dt * 14);
        u.pelvis.position.y = 0.88 + 0.03 * riseW * P.airB - 0.075 * strafeW - 0.04 * backW * (1 - strafeW);

        const thighSwing = walking ? Math.sin(ph) * (0.52 + sprintB * 0.16) * amp * strideSign * fwdStrideWeight : 0;
        const kneePhaseOff = strideSign < 0 ? 0.8 : -0.9;
        const kneeLiftL = walking ? Math.max(0, Math.sin(ph + kneePhaseOff)) * (0.7 + runBlend * 0.45 + sprintB * 0.25) * amp * fwdStrideWeight : 0;
        const kneeLiftR = walking ? Math.max(0, Math.sin(ph + Math.PI + kneePhaseOff)) * (0.7 + runBlend * 0.45 + sprintB * 0.25) * amp * fwdStrideWeight : 0;

        // Lateral sidestep cycle: lead foot steps wide outward while lifting knee, trailing foot gathers smoothly without crossing!
        const stepWave = walking ? Math.sin(ph) : 0;
        const openL = Math.max(0, -sDir * stepWave);
        const closeL = Math.max(0, sDir * stepWave);
        const openR = Math.max(0, sDir * stepWave);
        const closeR = Math.max(0, -sDir * stepWave);
        const strafeAmp = Math.min(1.15, amp);
        const strafeThighZL = (-0.12 - openL * 0.38 + closeL * 0.18) * strafeW * strafeAmp;
        const strafeThighZR = ( 0.12 + openR * 0.38 - closeR * 0.18) * strafeW * strafeAmp;
        const strafeThighXL = (-0.18 - openL * 0.12 + closeL * 0.08) * strafeW;
        const strafeThighXR = (-0.18 - openR * 0.12 + closeR * 0.08) * strafeW;
        const strafeKneeL = (0.34 + Math.max(0, Math.sin(ph + (sDir > 0 ? Math.PI : 0) - 0.6)) * 0.50) * strafeW;
        const strafeKneeR = (0.34 + Math.max(0, Math.sin(ph + (sDir > 0 ? 0 : Math.PI) - 0.6)) * 0.50) * strafeW;

        // Athletic 3-phase airborne pose: bent knees STAY naturally flexed through rise, apex, AND descent!
        const airMicro = Math.sin(time * 6.0) * 0.04;
        const airThighL = 0.34 * riseW - 0.32 * apexW - 0.44 * fallW + airMicro;
        const airThighR = -1.04 * riseW - 0.78 * apexW - 0.26 * fallW - airMicro;
        const airKneeL = 0.88 * riseW + 1.14 * apexW + 1.02 * fallW;
        const airKneeR = 1.46 * riseW + 1.38 * apexW + 0.92 * fallW;
        const airArmL = -1.18 * riseW - 0.74 * apexW - 0.88 * fallW;
        const airArmR = 0.28 * riseW - 0.32 * apexW - 0.62 * fallW;
        const airElbowL = -0.68 * riseW - 0.54 * apexW - 0.42 * fallW;
        const airElbowR = -0.62 * riseW - 0.50 * apexW - 0.44 * fallW;

        const gW = 1 - P.airB;
        if (u.thighL) {
          u.thighL.rotation.x = (thighSwing + strafeThighXL) * gW + airThighL * P.airB;
          u.thighL.rotation.z = strafeThighZL * gW;
        }
        if (u.thighR) {
          u.thighR.rotation.x = (-thighSwing + strafeThighXR) * gW + airThighR * P.airB;
          u.thighR.rotation.z = strafeThighZR * gW;
        }
        if (u.kneeL) u.kneeL.rotation.x = (kneeLiftL + strafeKneeL + 0.08 * (1 - strafeW)) * gW + airKneeL * P.airB;
        if (u.kneeR) u.kneeR.rotation.x = (kneeLiftR + strafeKneeR + 0.08 * (1 - strafeW)) * gW + airKneeR * P.airB;
        if (u.ankleL && u.thighL && u.kneeL) {
          const gAnkL = -(u.thighL.rotation.x + u.kneeL.rotation.x) * 0.42;
          const aAnkL = 0.24 * riseW + 0.26 * apexW + 0.08 * fallW;
          u.ankleL.rotation.x = gAnkL * gW + aAnkL * P.airB;
        }
        if (u.ankleR && u.thighR && u.kneeR) {
          const gAnkR = -(u.thighR.rotation.x + u.kneeR.rotation.x) * 0.42;
          const aAnkR = 0.28 * riseW + 0.24 * apexW + 0.06 * fallW;
          u.ankleR.rotation.x = gAnkR * gW + aAnkR * P.airB;
        }

        const guardBlend = Math.max(strafeW, backW * 0.65);
        const groundArmL = (-thighSwing * (0.72 + runBlend * 0.22 + sprintB * 0.14) - P.slopeS * 0.35 * amp) * (1 - guardBlend) + (-0.36 - stepWave * 0.10 * sDir) * guardBlend;
        const groundArmR = (thighSwing * (0.72 + runBlend * 0.22 + sprintB * 0.14) - P.slopeS * 0.35 * amp) * (1 - guardBlend) + (-0.28 + stepWave * 0.08 * sDir) * guardBlend;
        if (u.armL) {
          u.armL.rotation.x = groundArmL * gW + airArmL * P.airB;
          u.armL.rotation.z = -0.14 - 0.18 * strafeW * gW - 0.36 * fallW * P.airB - 0.16 * apexW * P.airB - 0.10 * riseW * P.airB;
        }
        if (u.armR) {
          u.armR.rotation.x = groundArmR * gW + airArmR * P.airB;
          u.armR.rotation.z = 0.14 + 0.10 * strafeW * gW + 0.34 * fallW * P.airB + 0.14 * apexW * P.airB + 0.10 * riseW * P.airB;
        }
        const groundElbL = (-0.25 - Math.max(0, Math.sin(ph)) * (0.35 + runBlend * 0.3 + sprintB * 0.25) * amp * fwdStrideWeight) * (1 - guardBlend) - 0.62 * guardBlend;
        const groundElbR = (-0.25 - Math.max(0, -Math.sin(ph)) * (0.35 + runBlend * 0.3 + sprintB * 0.25) * amp * fwdStrideWeight) * (1 - guardBlend) - 0.56 * guardBlend;
        if (u.elbowL) u.elbowL.rotation.x = groundElbL * gW + airElbowL * P.airB;
        if (u.elbowR) u.elbowR.rotation.x = groundElbR * gW + airElbowR * P.airB;

        if (u.torso) {
          const idleBreath = !walking && !airborne ? Math.sin(P.idleT * 2.0) * 0.025 : 0;
          const strafeLocal = spd > 0.2 ? sideVel / Math.max(1, baseSpeed) : 0;
          const airTorsoX = 0.16 * riseW + 0.10 * apexW + 0.12 * fallW;
          u.torso.rotation.x = (idleBreath + (P.sliding ? -0.18 : 0) + sprintB * 0.14 + 0.10 * strafeW + 0.12 * backW * (1 - strafeW)) * gW + airTorsoX * P.airB;
          // Counter-rotate chest against angled strafing hips so Starkeeper stays locked square on the enemy!
          u.torso.rotation.y = walking
            ? Math.sin(ph) * (0.04 + sprintB * 0.05) * amp * fwdStrideWeight - sDir * 0.28 * strafeW
            : (0.10 * riseW + 0.05 * apexW) * P.airB;
          u.torso.rotation.z = (lockTarget || strafeW > 0.1) && moving ? clamp(-strafeLocal * 0.12, -0.16, 0.16) : 0;
        }
        if (u.staffPivot) {
          // Keep Star-Lantern Staff angled cleanly outward & forward so it NEVER clips the wide astronomer hat brim!
          u.staffPivot.rotation.x = 0.42 + 0.24 * guardBlend * gW + (walking ? Math.sin(ph) * (0.08 + sprintB * 0.06) * amp * fwdStrideWeight : Math.sin(P.idleT * 1.8) * 0.025) + (0.24 * riseW + 0.14 * apexW + 0.18 * fallW) * P.airB;
          const armOutZ = u.armR ? Math.max(0, u.armR.rotation.z - 0.14) : 0;
          u.staffPivot.rotation.z = -0.38 - armOutZ * 1.05;
        }

        // Articulated landing shock-absorption knee-bend compression when touching down from a jump
        if (P.landT > 0 && P.onGround && P.jumpPrepT <= 0 && P.meleeT <= 0 && P.plungeLandT <= 0) {
          const lp = 1 - P.landT / Math.max(0.01, P.landDur);
          const lBend = Math.sin(Math.min(1, lp * 1.25) * Math.PI) * P.landStrength;
          u.pelvis.position.y -= 0.19 * lBend;
          if (u.thighL) u.thighL.rotation.x -= 0.54 * lBend;
          if (u.thighR) u.thighR.rotation.x -= 0.54 * lBend;
          if (u.kneeL) u.kneeL.rotation.x += 1.04 * lBend;
          if (u.kneeR) u.kneeR.rotation.x += 1.04 * lBend;
          if (u.ankleL) u.ankleL.rotation.x -= 0.42 * lBend;
          if (u.ankleR) u.ankleR.rotation.x -= 0.42 * lBend;
          if (u.torso) u.torso.rotation.x += 0.22 * lBend;
        }

        // Realistic steep-hill sliding surf/brace stance: bend the higher (uphill) knee deep into the slope,
        // extend the lower (downhill) leg bracing forward, lean torso back, spread arms & look downhill!
        if (P.slidePoseB > 0.01 && P.meleeT <= 0 && P.jumpPrepT <= 0 && P.plungeLandT <= 0) {
          const sb = P.slidePoseB;
          const upX = -P.slideNormX;
          const upZ = -P.slideNormZ;
          // Project uphill direction onto Starkeeper's local +X side (legR) to bend whichever knee sits HIGHER on the slope!
          const dotPlusX = upX * cosF - upZ * sinF;
          const uphillIsR = dotPlusX >= -0.08;
          const sideSign = uphillIsR ? 1 : -1;

          u.pelvis.position.y -= 0.24 * sb;
          u.pelvis.rotation.z = sideSign * 0.14 * sb;
          u.pelvis.rotation.y = -sideSign * 0.28 * sb;

          const hiThigh = -1.02;
          const hiKnee = 1.46;
          const hiAnkle = -0.22;
          const loThigh = -0.38;
          const loKnee = 0.52;
          const loAnkle = -0.38;

          const tL = uphillIsR ? loThigh : hiThigh;
          const kL = uphillIsR ? loKnee : hiKnee;
          const aL = uphillIsR ? loAnkle : hiAnkle;
          const tR = uphillIsR ? hiThigh : loThigh;
          const kR = uphillIsR ? hiKnee : loKnee;
          const aR = uphillIsR ? hiAnkle : loAnkle;

          if (u.thighL) u.thighL.rotation.x += (tL - u.thighL.rotation.x) * sb;
          if (u.kneeL) u.kneeL.rotation.x += (kL - u.kneeL.rotation.x) * sb;
          if (u.ankleL) u.ankleL.rotation.x += (aL - u.ankleL.rotation.x) * sb;
          if (u.thighR) u.thighR.rotation.x += (tR - u.thighR.rotation.x) * sb;
          if (u.kneeR) u.kneeR.rotation.x += (kR - u.kneeR.rotation.x) * sb;
          if (u.ankleR) u.ankleR.rotation.x += (aR - u.ankleR.rotation.x) * sb;

          if (u.torso) {
            u.torso.rotation.x += (-0.26 - u.torso.rotation.x) * sb;
            u.torso.rotation.y += (-sideSign * 0.30 - u.torso.rotation.y) * sb;
            u.torso.rotation.z += (-sideSign * 0.10 - u.torso.rotation.z) * sb;
          }
          // Spread arms out for athletic hillside balance while keeping staff clear of hat brim!
          if (u.armL) {
            u.armL.rotation.x += (0.48 - u.armL.rotation.x) * sb;
            u.armL.rotation.z += (-0.76 - u.armL.rotation.z) * sb;
          }
          if (u.elbowL) u.elbowL.rotation.x += (-0.42 - u.elbowL.rotation.x) * sb;
          if (u.armR) {
            u.armR.rotation.x += (-0.28 - u.armR.rotation.x) * sb;
            u.armR.rotation.z += (0.64 - u.armR.rotation.z) * sb;
          }
          if (u.elbowR) u.elbowR.rotation.x += (-0.36 - u.elbowR.rotation.x) * sb;
          if (u.staffPivot) {
            u.staffPivot.rotation.x += (0.52 - u.staffPivot.rotation.x) * sb;
            u.staffPivot.rotation.z = -0.38 - Math.max(0, (u.armR ? u.armR.rotation.z : 0.14) - 0.14) * 1.05;
          }
        }

        // Pre-jump knee-bend anticipation: symmetric two-leg crouch (standing) vs asymmetric single-leg plant-and-drive (running/sprinting)
        if (P.jumpPrepT > 0 && P.onGround) {
          const jp = 1 - P.jumpPrepT / Math.max(0.01, P.jumpPrepDur);
          const dip = Math.sin(Math.min(1, 0.28 + jp * 0.92) * Math.PI * 0.72);
          const rb = P.jumpPrepRunB;
          const sb = 1 - rb;

          u.pelvis.position.y = 0.88 - (0.25 * sb + 0.17 * rb) * dip;
          if (u.thighL) u.thighL.rotation.x = (-0.78 * sb - 0.52 * rb) * dip;
          if (u.thighR) u.thighR.rotation.x = (-0.78 * sb - 0.96 * rb) * dip;
          if (u.kneeL) u.kneeL.rotation.x = (1.42 * sb + 1.18 * rb) * dip;
          if (u.kneeR) u.kneeR.rotation.x = (1.42 * sb + 1.32 * rb) * dip;
          if (u.ankleL && u.thighL && u.kneeL) u.ankleL.rotation.x = -(u.thighL.rotation.x + u.kneeL.rotation.x) * 0.55;
          if (u.ankleR && u.thighR && u.kneeR) u.ankleR.rotation.x = -(u.thighR.rotation.x + u.kneeR.rotation.x) * 0.55;
          if (u.armL) {
            u.armL.rotation.x = (0.72 * sb - 1.12 * rb) * dip;
            u.armL.rotation.z = -0.18 - 0.14 * dip;
          }
          if (u.armR) {
            u.armR.rotation.x = (0.65 * sb + 0.48 * rb) * dip;
            u.armR.rotation.z = 0.18 + 0.14 * dip;
          }
          if (u.elbowL) u.elbowL.rotation.x = (-0.42 * sb - 0.85 * rb) * dip;
          if (u.elbowR) u.elbowR.rotation.x = (-0.42 * sb - 0.55 * rb) * dip;
          if (u.torso) {
            u.torso.rotation.x = (0.30 * sb + (0.24 + sprintB * 0.14) * rb) * dip;
            u.torso.rotation.y = 0.22 * rb * dip;
          }
        }
      }

      if (!P.dead && P.rollT <= 0) {
        if (P.plunging) {
          if (P.plungeWindupT > 0) {
            // Stage 1: Heroic overhead vault-raise with blazing Star-Staff skyward
            const wp = 1 - P.plungeWindupT / 0.14;
            if (u.torso) { u.torso.rotation.x = -0.24 * wp; u.torso.rotation.y = 0; }
            if (u.thighL) u.thighL.rotation.x = -0.78;
            if (u.kneeL) u.kneeL.rotation.x = 1.25;
            if (u.thighR) u.thighR.rotation.x = 0.42;
            if (u.kneeR) u.kneeR.rotation.x = 0.85;
            if (u.armR) { u.armR.rotation.x = -2.85; u.armR.rotation.z = 0.14; }
            if (u.armL) { u.armL.rotation.x = -2.55; u.armL.rotation.z = -0.24; }
            if (u.elbowR) u.elbowR.rotation.x = -0.22;
            if (u.elbowL) u.elbowL.rotation.x = -0.35;
            if (u.staffPivot) { u.staffPivot.rotation.x = 2.45; u.staffPivot.rotation.z = 0; }
            if (u.staffHalo && u.staffHalo.scale) u.staffHalo.scale.set(1.75, 1.75, 1);
          } else {
            // Stage 2: Blazing meteor dive — driving staff tip straight down into the earth
            if (u.torso) { u.torso.rotation.x = 0.54; u.torso.rotation.y = 0; }
            if (u.thighL) u.thighL.rotation.x = -0.65;
            if (u.kneeL) u.kneeL.rotation.x = 1.15;
            if (u.thighR) u.thighR.rotation.x = 0.48;
            if (u.kneeR) u.kneeR.rotation.x = 0.72;
            if (u.armR) { u.armR.rotation.x = -1.02; u.armR.rotation.z = 0.12; }
            if (u.armL) { u.armL.rotation.x = -0.82; u.armL.rotation.z = -0.35; }
            if (u.elbowR) u.elbowR.rotation.x = -0.10;
            if (u.staffPivot) { u.staffPivot.rotation.x = 3.16; u.staffPivot.rotation.z = 0; }
            if (u.staffHalo && u.staffHalo.scale) u.staffHalo.scale.set(1.88, 1.88, 1);
          }
        } else if (P.plungeLandT > 0) {
          // Stage 3: Heroic one-knee crater landing pose with staff planted into ground
          const lw = clamp(P.plungeLandT / 0.34, 0, 1);
          const hold = Math.min(1, lw * 1.45);
          u.pelvis.position.y = 0.88 - 0.28 * hold;
          if (u.torso) { u.torso.rotation.x = 0.46 * hold; u.torso.rotation.y = -0.24 * hold; }
          if (u.thighL) u.thighL.rotation.x = -1.05 * hold;
          if (u.kneeL) u.kneeL.rotation.x = 1.38 * hold;
          if (u.thighR) u.thighR.rotation.x = 0.52 * hold;
          if (u.kneeR) u.kneeR.rotation.x = 1.46 * hold;
          if (u.armR) { u.armR.rotation.x = -0.86 * hold; u.armR.rotation.z = 0.12; }
          if (u.armL) { u.armL.rotation.x = 0.35 * hold; u.armL.rotation.z = -0.68 * hold; }
          if (u.elbowR) u.elbowR.rotation.x = -0.12 * hold;
          if (u.staffPivot) { u.staffPivot.rotation.x = 0.42 + 2.78 * hold; u.staffPivot.rotation.z = -0.38 * (1 - hold); }
          if (u.staffHalo && u.staffHalo.scale) {
            const sc = 0.85 + 1.05 * hold;
            u.staffHalo.scale.set(sc, sc, 1);
          }
        } else if (P.meleeT > 0) {
          const mp = 1 - P.meleeT / Math.max(0.05, P.meleeDur);
          const swingArc = Math.sin(mp * Math.PI);
          const ease = 1 - Math.pow(1 - mp, 3);
          if (P.meleeStep === 1) {
            // Hit 1: Wide horizontal Left -> Right forehand slash
            u.pelvis.rotation.y = 0.32 - ease * 0.62;
            if (u.torso) { u.torso.rotation.y = 1.05 - ease * 2.15; u.torso.rotation.x = 0.16 * swingArc; }
            if (u.armR) { u.armR.rotation.x = -1.48; u.armR.rotation.z = 0.55 - ease * 1.15; }
            if (u.armL) { u.armL.rotation.x = -0.35 + ease * 0.85; u.armL.rotation.z = -0.58; }
            if (u.elbowR) u.elbowR.rotation.x = -0.16;
            if (u.staffPivot) { u.staffPivot.rotation.x = 2.92; u.staffPivot.rotation.z = 0; }
          } else if (P.meleeStep === 2) {
            // Hit 2: Wide horizontal Right -> Left backhand slash
            u.pelvis.rotation.y = -0.30 + ease * 0.62;
            if (u.torso) { u.torso.rotation.y = -1.10 + ease * 2.25; u.torso.rotation.x = 0.18 * swingArc; }
            if (u.armR) { u.armR.rotation.x = -1.44; u.armR.rotation.z = -0.55 + ease * 1.25; }
            if (u.armL) { u.armL.rotation.x = 0.45 - ease * 0.95; u.armL.rotation.z = -0.45; }
            if (u.elbowR) u.elbowR.rotation.x = -0.14;
            if (u.staffPivot) { u.staffPivot.rotation.x = 2.86; u.staffPivot.rotation.z = 0; }
          } else if (P.meleeStep === 3) {
            // Hit 3: Full 360-degree horizontal Whirlwind Starburst Spin finisher!
            const spinEase = mp < 0.78 ? (1 - Math.pow(1 - mp / 0.78, 2.4)) : 1.0;
            u.pelvis.rotation.y = -spinEase * Math.PI * 2;
            u.pelvis.position.y = 0.80;
            if (u.torso) { u.torso.rotation.x = 0.22; u.torso.rotation.y = -0.25; }
            if (u.armR) { u.armR.rotation.x = -1.52; u.armR.rotation.z = 0.85; }
            if (u.armL) { u.armL.rotation.x = -0.50; u.armL.rotation.z = -1.15; }
            if (u.elbowR) u.elbowR.rotation.x = -0.06;
            if (u.staffPivot) { u.staffPivot.rotation.x = 3.04; u.staffPivot.rotation.z = 0; }
          } else if (P.meleeStep === 4) {
            // Roll Dash-Strike forward lance thrust
            if (u.torso) { u.torso.rotation.x = 0.36 * swingArc; u.torso.rotation.y = -0.35 * swingArc; }
            if (u.armR) { u.armR.rotation.x = -1.56 * swingArc; u.armR.rotation.z = 0.08; }
            if (u.elbowR) u.elbowR.rotation.x = -0.08;
            if (u.staffPivot) { u.staffPivot.rotation.x = 0.42 + 2.68 * swingArc; u.staffPivot.rotation.z = -0.38 * (1 - swingArc); }
          } else if (P.meleeStep === 6) {
            // F -> Click Starlight Dash-Cut: blazing forward momentum cleave!
            u.pelvis.rotation.y = 0.35 - ease * 0.78;
            if (u.torso) { u.torso.rotation.x = 0.36; u.torso.rotation.y = 0.98 - ease * 2.12; }
            if (u.armR) { u.armR.rotation.x = -1.52; u.armR.rotation.z = 0.64 - ease * 1.36; }
            if (u.armL) { u.armL.rotation.x = 0.58; u.armL.rotation.z = -0.80; }
            if (u.elbowR) u.elbowR.rotation.x = -0.08;
            if (u.staffPivot) { u.staffPivot.rotation.x = 3.0; u.staffPivot.rotation.z = 0; }
          } else if (P.meleeStep === 7) {
            // Sprint Dash-Attack: Low athletic forward slide thrusting the Star-Lantern Staff straight ahead like a spear!
            const slideHold = mp < 0.16 ? mp / 0.16 : mp < 0.78 ? 1.0 : Math.max(0, (1 - mp) / 0.22);
            const thrust = mp < 0.14 ? mp / 0.14 : mp < 0.80 ? 1.0 : Math.max(0, (1 - mp) / 0.20);
            u.pelvis.position.y = 0.88 - 0.36 * slideHold;
            u.pelvis.rotation.x = -0.12 * slideHold;
            u.pelvis.rotation.y = -0.34 * slideHold;
            // Lead left leg skimming low forward, trailing right leg tucked low behind into the slide
            if (u.thighL) u.thighL.rotation.x = -1.24 * slideHold;
            if (u.kneeL) u.kneeL.rotation.x = 0.48 * slideHold;
            if (u.ankleL) u.ankleL.rotation.x = -0.34 * slideHold;
            if (u.thighR) u.thighR.rotation.x = 0.74 * slideHold;
            if (u.kneeR) u.kneeR.rotation.x = 1.48 * slideHold;
            if (u.ankleR) u.ankleR.rotation.x = 0.42 * slideHold;
            if (u.torso) {
              u.torso.rotation.x = 0.34 * slideHold;
              u.torso.rotation.y = -0.32 * slideHold;
            }
            // Right arm & staff thrust dead-level straight horizontally forward (+Z) at enemy chest height!
            if (u.armR) { u.armR.rotation.x = -1.72 * thrust; u.armR.rotation.z = -0.05 * thrust; }
            if (u.elbowR) u.elbowR.rotation.x = -0.04;
            if (u.armL) { u.armL.rotation.x = 0.86 * slideHold; u.armL.rotation.z = -0.52 * slideHold; }
            if (u.elbowL) u.elbowL.rotation.x = -0.32 * slideHold;
            if (u.staffPivot) {
              u.staffPivot.rotation.x = 0.42 + 2.58 * thrust;
              u.staffPivot.rotation.z = -0.38 * (1 - thrust);
            }
          }
          if (u.staffHalo && u.staffHalo.scale) {
            const sc = (P.meleeStep === 7 ? 1.15 : 0.95) + swingArc * 0.78;
            u.staffHalo.scale.set(sc, sc, 1);
          }
        } else if (P.castT > 0) {
          const cp = 1 - P.castT / Math.max(0.05, P.castDur);
          const castCurve = Math.sin(cp * Math.PI);
          // Fast-attack launch curve so the Star-Lantern Staff points straight at the target right as the bolt leaves the crystal!
          const castThrust = Math.pow(Math.sin(Math.min(1, 0.18 + cp * 0.82) * Math.PI), 0.72);
          const cEase = 1 - Math.pow(1 - cp, 2.8);
          const aimPitch = P.castAimPitch * 0.65;
          if (P.castStep === 2) {
            // Shot 2 (F -> F): Crisp backhand staff thrust launching Twin Bolts from crystal tip
            if (u.torso) u.torso.rotation.y = -0.36 + cEase * 0.72;
            if (u.armR) { u.armR.rotation.x = -1.42 * castThrust - aimPitch; u.armR.rotation.z = -0.18 + cEase * 0.55; }
            if (u.elbowR) u.elbowR.rotation.x = -0.22;
            if (u.staffPivot) { u.staffPivot.rotation.x = 0.42 + 2.45 * castThrust; u.staffPivot.rotation.z = -0.38 * (1 - castThrust); }
          } else if (P.castStep === 3 || P.castStep === 5) {
            // Shot 3 (Grand Star-Orb) & Click->Click->F (Piercing Comet): dramatic two-hand forward channel!
            if (u.torso) { u.torso.rotation.x = -0.14 + cEase * 0.36; u.torso.rotation.y = 0; }
            if (u.armR) { u.armR.rotation.x = (-1.92 + cEase * 0.54) - aimPitch; u.armR.rotation.z = 0.10; }
            if (u.armL) { u.armL.rotation.x = (-1.62 + cEase * 0.52) - aimPitch * 0.7; u.armL.rotation.z = -0.18; }
            if (u.elbowR) u.elbowR.rotation.x = -0.14;
            if (u.staffPivot) { u.staffPivot.rotation.x = 2.94; u.staffPivot.rotation.z = 0; }
          } else if (P.castStep === 4) {
            // Click -> F (Star-Fan Scatter): wide horizontal staff fan-sweep!
            if (u.torso) u.torso.rotation.y = -0.72 + cEase * 1.44;
            if (u.armR) { u.armR.rotation.x = -1.44 - aimPitch; u.armR.rotation.z = -0.42 + cEase * 1.08; }
            if (u.elbowR) u.elbowR.rotation.x = -0.14;
            if (u.staffPivot) { u.staffPivot.rotation.x = 2.88; u.staffPivot.rotation.z = 0; }
          } else if (P.castStep === 6) {
            // Click x3 -> F (Constellation Nova): radiant staff-skyward burst pose!
            u.pelvis.rotation.y = cEase * Math.PI * 0.5;
            if (u.torso) { u.torso.rotation.x = -0.2; }
            if (u.armR) { u.armR.rotation.x = -2.65; u.armR.rotation.z = 0.22; }
            if (u.armL) { u.armL.rotation.x = -1.05; u.armL.rotation.z = -0.95; }
            if (u.staffPivot) { u.staffPivot.rotation.x = 1.65; u.staffPivot.rotation.z = 0; }
          } else {
            // Shot 1 (F): Direct forward Star-Lantern staff-point cast toward aimed target!
            if (u.torso) u.torso.rotation.y = 0.24 - cEase * 0.38;
            if (u.armR) { u.armR.rotation.x = -1.36 * castThrust - aimPitch; u.armR.rotation.z = 0.08 + 0.06 * (1 - castThrust); }
            if (u.elbowR) u.elbowR.rotation.x = -0.22 - castCurve * 0.14;
            if (u.staffPivot) { u.staffPivot.rotation.x = 0.42 + 2.48 * castThrust; u.staffPivot.rotation.z = -0.38 * (1 - castThrust); }
          }
          if (u.staffHalo && u.staffHalo.scale) {
            const boost = P.castStep >= 3 ? 1.15 : 0.78;
            const sc = 1.15 + castThrust * boost;
            u.staffHalo.scale.set(sc, sc, 1);
          }
        } else if (u.staffHalo && u.staffHalo.scale) {
          const idleHalo = 0.72 + Math.sin(time * 3.2) * 0.04;
          const curHalo = typeof u.staffHalo.scale.x === 'number' && u.staffHalo.scale.x > 0.01 ? u.staffHalo.scale.x : idleHalo;
          const nextHalo = curHalo + (idleHalo - curHalo) * Math.min(1, dt * 10);
          u.staffHalo.scale.set(nextHalo, nextHalo, 1);
        }
      }

      // Smooth follow-through recovery when exiting melee/cast/roll/slam back into idle or locomotion (ZERO 1-frame snap/blink!)
      if (doRecoverBlend) {
        const recProg = 1 - P.recoverT / Math.max(0.01, P.recoverDur);
        const kRec = Math.min(1, 1 - Math.exp(-(11 + recProg * 14) * dt));
        u.pelvis.position.y = _prevPose.pelvisY + (u.pelvis.position.y - _prevPose.pelvisY) * kRec;
        u.pelvis.rotation.x = _prevPose.pelvisRX + (u.pelvis.rotation.x - _prevPose.pelvisRX) * kRec;
        u.pelvis.rotation.y = _prevPose.pelvisRY + wrapAngle(u.pelvis.rotation.y - _prevPose.pelvisRY) * kRec;
        u.pelvis.rotation.z = _prevPose.pelvisRZ + (u.pelvis.rotation.z - _prevPose.pelvisRZ) * kRec;
        if (u.torso) {
          u.torso.rotation.x = _prevPose.torsoRX + (u.torso.rotation.x - _prevPose.torsoRX) * kRec;
          u.torso.rotation.y = _prevPose.torsoRY + (u.torso.rotation.y - _prevPose.torsoRY) * kRec;
          u.torso.rotation.z = _prevPose.torsoRZ + (u.torso.rotation.z - _prevPose.torsoRZ) * kRec;
        }
        if (u.thighL) {
          u.thighL.rotation.x = _prevPose.thighLX + (u.thighL.rotation.x - _prevPose.thighLX) * kRec;
          u.thighL.rotation.z = _prevPose.thighLZ + (u.thighL.rotation.z - _prevPose.thighLZ) * kRec;
        }
        if (u.thighR) {
          u.thighR.rotation.x = _prevPose.thighRX + (u.thighR.rotation.x - _prevPose.thighRX) * kRec;
          u.thighR.rotation.z = _prevPose.thighRZ + (u.thighR.rotation.z - _prevPose.thighRZ) * kRec;
        }
        if (u.kneeL) u.kneeL.rotation.x = _prevPose.kneeLX + (u.kneeL.rotation.x - _prevPose.kneeLX) * kRec;
        if (u.kneeR) u.kneeR.rotation.x = _prevPose.kneeRX + (u.kneeR.rotation.x - _prevPose.kneeRX) * kRec;
        if (u.ankleL) u.ankleL.rotation.x = _prevPose.ankleLX + (u.ankleL.rotation.x - _prevPose.ankleLX) * kRec;
        if (u.ankleR) u.ankleR.rotation.x = _prevPose.ankleRX + (u.ankleR.rotation.x - _prevPose.ankleRX) * kRec;
        if (u.armL) {
          u.armL.rotation.x = _prevPose.armLX + (u.armL.rotation.x - _prevPose.armLX) * kRec;
          u.armL.rotation.z = _prevPose.armLZ + (u.armL.rotation.z - _prevPose.armLZ) * kRec;
        }
        if (u.armR) {
          u.armR.rotation.x = _prevPose.armRX + (u.armR.rotation.x - _prevPose.armRX) * kRec;
          u.armR.rotation.z = _prevPose.armRZ + (u.armR.rotation.z - _prevPose.armRZ) * kRec;
        }
        if (u.elbowL) u.elbowL.rotation.x = _prevPose.elbowLX + (u.elbowL.rotation.x - _prevPose.elbowLX) * kRec;
        if (u.elbowR) u.elbowR.rotation.x = _prevPose.elbowRX + (u.elbowR.rotation.x - _prevPose.elbowRX) * kRec;
        if (u.staffPivot) {
          u.staffPivot.rotation.x = _prevPose.staffRX + (u.staffPivot.rotation.x - _prevPose.staffRX) * kRec;
          u.staffPivot.rotation.z = _prevPose.staffRZ + (u.staffPivot.rotation.z - _prevPose.staffRZ) * kRec;
        }
      }

      // Flowing Cloth Dynamics: spring-lagged single-piece continuous crimson cloak, tucked coat skirts, scarf ribbons & GPU wave shader!
      const rawTurnRate = dt > 0.0005 ? wrapAngle(P.facing - P.prevFacing) / dt : 0;
      P.prevFacing = P.facing;
      const targetSway = clamp(-rawTurnRate * 0.14 + (P.meleeStep === 3 && P.meleeT > 0 ? 0.95 : 0), -0.85, 0.85);
      P.capeSway += (targetSway - P.capeSway) * Math.min(1, dt * 8);

      const targetSpeedDrag = P.rollT > 0
        ? 0.90
        : P.plunging
          ? 1.38
          : P.meleeT > 0 && P.meleeStep === 3
            ? 1.35
            : P.meleeT > 0 && P.meleeStep === 7
              ? 1.24
              : P.swimming
                ? 0.24 + P.swimMoveBlend * 0.36
                : clamp(spd / 7.2, 0, 1.45) * (0.50 + sprintB * 0.18) + P.slidePoseB * 0.52 + 0.16 * riseW * P.airB + 0.94 * fallW * P.airB + 0.38 * apexW * P.airB;
      P.capeLag += (targetSpeedDrag - P.capeLag) * Math.min(1, dt * 11);

      const windGust = 0.30 + Math.sin(time * 1.45 + P.x * 0.08) * 0.16 + Math.cos(time * 2.3 - P.z * 0.07) * 0.08;
      const windWave = Math.sin(time * 2.4) * (0.045 + windGust * 0.04);
      const flutterWave = P.swimming ? Math.sin(time * 5.0) * 0.14 : Math.sin(ph * 2) * (0.06 + sprintB * 0.04) * amp;
      const drag = Math.min(1.18, Math.max(P.capeLag, targetSpeedDrag * 0.88));
      const liftAngle = clamp(0.22 + drag * 0.96 + windWave * 0.7 + flutterWave * 0.45, 0.18, 1.38);
      const sDroop = clamp(0.06 + drag * 0.28, 0.04, 0.42);
      const flutterAmp = clamp(0.18 + drag * 0.45 + Math.abs(P.capeSway) * 0.35 + (P.swimming ? 0.35 : 0), 0.12, 1.25);

      if (typeof Shaders !== 'undefined' && Shaders) {
        if (typeof Shaders.setClothMotion === 'function') {
          const speedNorm = P.meleeStep === 7 && P.meleeT > 0 ? 1.55 : clamp(spd / 7.5, 0, 1.6);
          const vertNorm = airborne ? clamp(P.vy / 8.0, -1.5, 1.5) : 0;
          Shaders.setClothMotion(speedNorm, vertNorm, P.capeSway, windGust);
        }
        if (typeof Shaders.setClothCurve === 'function') {
          Shaders.setClothCurve(liftAngle, sDroop, P.capeSway, flutterAmp);
        }
      }

      if (u.capeSegs && u.capeSegs.length === 3) {
        const s0 = u.capeSegs[0];
        const s1 = u.capeSegs[1];
        const s2 = u.capeSegs[2];
        // Keep reference chain synced with continuous GPU cloth curve for rig telemetry & tests
        s0.rotation.x = 0.18 + drag + flutterWave + windWave;
        s0.rotation.z = P.capeSway * 0.22 + Math.sin(time * 1.9) * 0.025;
        s1.rotation.x = -drag * 0.18 + Math.sin(ph * 2 - 0.95) * (0.10 + sprintB * 0.05) * amp + Math.sin(time * 2.8 - 0.8) * 0.06;
        s1.rotation.z = P.capeSway * 0.28 + Math.sin(time * 2.3 - 0.7) * 0.04;
        s2.rotation.x = -drag * 0.14 + Math.sin(ph * 2 - 1.9) * (0.14 + sprintB * 0.07) * amp + Math.sin(time * 3.3 - 1.5) * 0.08;
        s2.rotation.z = P.capeSway * 0.34 + Math.sin(time * 2.7 - 1.4) * 0.055;
      }

      // Stride- & air-reactive articulated coat-skirt panels (back skirts stay cleanly tucked UNDER the crimson cloak!)
      if (u.skirts) {
        const thL = u.thighL ? u.thighL.rotation.x : 0;
        const thR = u.thighR ? u.thighR.rotation.x : 0;
        const skirtWave = Math.sin(time * 3.1) * 0.038;
        const liftAir = (0.32 * fallW + 0.14 * apexW) * P.airB;
        const slipBack = clamp(spd / 9.5, 0, 1.2) * 0.20 + (P.meleeStep === 7 && P.meleeT > 0 ? 0.24 : 0);
        const maxBackSkirt = Math.max(0.14, liftAngle * 0.56);
        if (u.skirts.fl) {
          u.skirts.fl.rotation.x = -0.10 - Math.max(0, -thL) * 0.65 - liftAir * 0.45 + skirtWave;
          u.skirts.fl.rotation.z = -0.10 - Math.max(0, -thL) * 0.22 - liftAir * 0.40 + P.capeSway * 0.12;
        }
        if (u.skirts.fr) {
          u.skirts.fr.rotation.x = -0.10 - Math.max(0, -thR) * 0.65 - liftAir * 0.45 - skirtWave;
          u.skirts.fr.rotation.z = 0.10 + Math.max(0, -thR) * 0.22 + liftAir * 0.40 + P.capeSway * 0.12;
        }
        if (u.skirts.bl) {
          const rawBl = 0.08 + Math.max(0, thL) * 0.42 + slipBack + liftAir * 0.55 + skirtWave;
          u.skirts.bl.rotation.x = Math.min(rawBl, maxBackSkirt);
          u.skirts.bl.rotation.z = -0.05 + P.capeSway * 0.14;
        }
        if (u.skirts.br) {
          const rawBr = 0.08 + Math.max(0, thR) * 0.42 + slipBack + liftAir * 0.55 - skirtWave;
          u.skirts.br.rotation.x = Math.min(rawBr, maxBackSkirt);
          u.skirts.br.rotation.z = 0.05 + P.capeSway * 0.14;
        }
      }

      // Twin neck scarf ribbons ride continuously OVER the crimson cloak via GPU continuousBend (bendOffset: +0.075 rad)
      if (u.scarfSegs && u.scarfSegs.length === 2) {
        u.scarfSegs[0].rotation.x = 0.03 + Math.sin(time * 4.4) * (0.04 + amp * 0.03);
        u.scarfSegs[0].rotation.z = -0.12 + P.capeSway * 0.16 + Math.cos(time * 3.1) * 0.04;
        u.scarfSegs[1].rotation.x = 0.03 + Math.sin(time * 4.9 + 1.1) * (0.04 + amp * 0.03);
        u.scarfSegs[1].rotation.z = 0.12 + P.capeSway * 0.16 + Math.sin(time * 3.4 + 0.8) * 0.04;
      }

      // Apply shared head look-at angles to procedural headGroup + periodic blink/brows
      if (u.headGroup) {
        const slideHeadOff = P.meleeStep === 7 && P.meleeT > 0 ? -0.26 : 0;
        u.headGroup.rotation.y = P.headYaw + (P.meleeStep === 7 && P.meleeT > 0 ? 0.46 : 0);
        u.headGroup.rotation.x = P.headPitch + slideHeadOff;

        // Lifelike periodic blinking & expressive combat/exploration eyebrows
        if (u.eyelidL && u.eyelidR) {
          const blinkPhase = (time * 0.24) % 1.0;
          const blink = blinkPhase > 0.962 ? Math.sin(((blinkPhase - 0.962) / 0.038) * Math.PI) : 0;
          const lidX = -0.82 + blink * 0.98;
          u.eyelidL.rotation.x = lidX;
          u.eyelidR.rotation.x = lidX;
        }
        if (u.browL && u.browR) {
          const focused = P.meleeT > 0 || P.plunging || !!lockTarget;
          const wantTilt = focused ? 0.22 : 0.0;
          const wantDrop = focused ? 0.017 : 0.022;
          u.browL.rotation.z += (-wantTilt - u.browL.rotation.z) * Math.min(1, dt * 10);
          u.browR.rotation.z += (wantTilt - u.browR.rotation.z) * Math.min(1, dt * 10);
          u.browL.position.y += (wantDrop - u.browL.position.y) * Math.min(1, dt * 10);
          u.browR.position.y += (wantDrop - u.browR.position.y) * Math.min(1, dt * 10);
        }
      }
      if (u.pearlAura) {
        const showPearl = !!(P.hasBreathRelic && P.swimming);
        u.pearlAura.visible = showPearl;
        if (showPearl && u.pearlAura.scale) {
          const ps = 0.92 + Math.sin(time * 4.4) * 0.14;
          u.pearlAura.scale.set(ps, ps, 1);
        }
      }
    }

    turnToward(player, P.facing, dt, P.castT > 0 || P.castFaceT > 0 ? 34 : P.rollT > 0 ? 22 : lockTarget ? 18 : 14);
    player.rotation.x = usingGlb || P.rollT > 0 || P.swimming
      ? 0
      : walking
        ? amp * 0.05 + runBlend * 0.06 + sprintB * 0.09 - Math.max(0, P.slopeS) * 0.15
        : (0.06 * riseW - 0.08 * fallW) * P.airB;

    const bob = !usingGlb && walking
      ? Math.abs(Math.sin(ph)) * (0.045 + runBlend * 0.045 + sprintB * 0.03) * amp
      : P.swimming
        ? Math.sin(time * 2.4) * 0.05 * (1 - P.swimMoveBlend * 0.6)
        : 0;
    player.position.set(P.x, P.y + bob, P.z);

    P.squash = Math.max(0, P.squash - dt * 3.2);
    P.jumpStretch = Math.max(0, P.jumpStretch - dt * 5.2);
    const sq = P.squash * P.squash;
    const st = P.jumpStretch * P.jumpStretch;
    player.scale.set(
      1 + sq * 0.07 - st * 0.04,
      1 - sq * 0.09 + st * 0.07,
      1 + sq * 0.07 - st * 0.04
    );
  }

  function updateCamera(dt, hFn) {
    if (typeof camera === 'undefined' || !camera) return;

    // Subtle dynamic FOV boost when sprinting
    if (typeof camera.fov === 'number' && typeof camera.updateProjectionMatrix === 'function') {
      const targetFov = 60 + P.sprintBlend * 5.2;
      if (Math.abs(targetFov - camera.fov) > 0.02) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 7);
        camera.updateProjectionMatrix();
      }
    }

    if (firstPerson) {
      camera.position.set(P.x, P.y + 1.82, P.z);
      const cp = Math.cos(lookPitch);
      const sp = Math.sin(lookPitch);
      camera.lookAt(
        P.x + Math.sin(P.facing) * 5 * cp,
        P.y + 1.82 + sp * 5,
        P.z + Math.cos(P.facing) * 5 * cp
      );
      return;
    }

    if (lockTarget && lockTarget.mesh && lockTarget.mesh.position) {
      const tp = lockTarget.mesh.position;
      const ty = tp.y + (lockTarget.yOffset !== undefined ? lockTarget.yOffset : 0.65);
      const duelYaw = Math.atan2(tp.x - P.x, tp.z - P.z);
      camYaw += wrapAngle(duelYaw + 0.22 - camYaw) * Math.min(1, dt * 6);

      const tDist = Math.hypot(tp.x - P.x, tp.z - P.z);
      const duelDist = clamp(tDist * 0.45 + 5.2, 6.2, 10.5);
      _camFocus.set(P.x, P.y + 1.75, P.z);
      _camDir.set(Math.sin(camYaw) * 0.96, -0.26, Math.cos(camYaw) * 0.96).normalize();

      const safeDist = computeCameraDistance(_camFocus, _camDir, duelDist, hFn);
      const distRate = safeDist < effCamDist ? 12 : 5;
      effCamDist += (safeDist - effCamDist) * Math.min(1, dt * distRate);
      const duelKick = camKick;
      camKick = camKick > 0.004 ? Math.max(0, camKick - dt * 3.1) : 0;

      _camTargetPos.copy(_camFocus).addScaledVector(_camDir, -Math.max(2.2, effCamDist - duelKick));
      _camTargetPos.y = Math.max(_camTargetPos.y, hFn(_camTargetPos.x, _camTargetPos.z) + 0.65);
      camera.position.lerp(_camTargetPos, Math.min(1, dt * 8));
      if (camShake > 0.005) {
        const sh = camShake * camShake * 0.28;
        camera.position.x += (Math.random() - 0.5) * sh;
        camera.position.y += (Math.random() - 0.5) * sh;
        camera.position.z += (Math.random() - 0.5) * sh;
        camShake = Math.max(0, camShake - dt * 2.8);
      } else {
        camShake = 0;
      }

      const midX = P.x + (tp.x - P.x) * 0.42;
      const midY = P.y + 1.65 + (ty - (P.y + 1.65)) * 0.42;
      const midZ = P.z + (tp.z - P.z) * 0.42;
      camera.lookAt(midX, midY, midZ);
      return;
    }

    _camFocus.set(P.x, P.y + 1.65, P.z);
    const elevBias = Math.max(0, 0.24 * (1 - Math.max(0, camPitch) / 0.7));
    const effPitch = camPitch - elevBias;
    const cp = Math.cos(effPitch);
    const sp = Math.sin(effPitch);
    _camDir.set(Math.sin(camYaw) * cp, sp, Math.cos(camYaw) * cp);

    // Clamp desired camera floor height before occlusion ray-march so upward sky-gaze
    // lowers the camera cleanly behind the Starkeeper instead of driving underground.
    const desX = _camFocus.x - _camDir.x * camDist;
    const rawDesY = _camFocus.y - _camDir.y * camDist;
    const desY = Math.max(rawDesY, P.y + 0.85);
    const desZ = _camFocus.z - _camDir.z * camDist;

    const backX = _camFocus.x - desX;
    const backY = _camFocus.y - desY;
    const backZ = _camFocus.z - desZ;
    const rayLen = Math.hypot(backX, backY, backZ) || 1;
    _camRayDir.set(backX / rayLen, backY / rayLen, backZ / rayLen);

    const safeDist = computeCameraDistance(_camFocus, _camRayDir, rayLen, hFn);
    const distRate = safeDist < effCamDist ? 14 : 5;
    effCamDist += (safeDist - effCamDist) * Math.min(1, dt * distRate);
    const kickPull = camKick;
    camKick = camKick > 0.004 ? Math.max(0, camKick - dt * 3.1) : 0;

    _camTargetPos.copy(_camFocus).addScaledVector(_camRayDir, -Math.max(2.2, effCamDist - kickPull));
    _camTargetPos.y = Math.max(_camTargetPos.y, hFn(_camTargetPos.x, _camTargetPos.z) + 0.65);
    camera.position.lerp(_camTargetPos, Math.min(1, dt * 8));

    if (camShake > 0.005) {
      const sh = camShake * camShake * 0.32;
      camera.position.x += (Math.random() - 0.5) * sh;
      camera.position.y += (Math.random() - 0.5) * sh;
      camera.position.z += (Math.random() - 0.5) * sh;
      camShake = Math.max(0, camShake - dt * 2.8);
    } else {
      camShake = 0;
    }

    const lookCp = Math.cos(camPitch);
    const lookSp = Math.sin(camPitch);
    camera.lookAt(
      _camFocus.x + Math.sin(camYaw) * lookCp * 6,
      _camFocus.y + lookSp * 6,
      _camFocus.z + Math.cos(camYaw) * lookCp * 6
    );
  }

  function updatePlayer(dt, time, player, lookCandidates) {
    const stepDt = Math.min(Math.max(dt, 0), 0.1);
    const nowTime = time || 0;
    const hFn = typeof heightAt === 'function' ? heightAt : defaultHeightZero;
    const nFn = typeof terrainNormalAt === 'function' ? terrainNormalAt : defaultNormalUp;

    validateLockTarget();

    if (P.coyoteT > 0) P.coyoteT = Math.max(0, P.coyoteT - stepDt);
    if (P.jumpBufT > 0) P.jumpBufT = Math.max(0, P.jumpBufT - stepDt);
    if (P.rollBufT > 0) P.rollBufT = Math.max(0, P.rollBufT - stepDt);
    if (P.invulnT > 0) P.invulnT = Math.max(0, P.invulnT - stepDt);
    if (P.hurtInvulnT > 0) P.hurtInvulnT = Math.max(0, P.hurtInvulnT - stepDt);
    if (P.hurtFlashT > 0) P.hurtFlashT = Math.max(0, P.hurtFlashT - stepDt);
    if (P.castT > 0) P.castT = Math.max(0, P.castT - stepDt);
    if (P.castFaceT > 0) P.castFaceT = Math.max(0, P.castFaceT - stepDt);
    if (P.recoverT > 0) P.recoverT = Math.max(0, P.recoverT - stepDt);
    if (P.shotComboWindowT > 0) P.shotComboWindowT = Math.max(0, P.shotComboWindowT - stepDt);
    if (P.spinCancelWindowT > 0) P.spinCancelWindowT = Math.max(0, P.spinCancelWindowT - stepDt);
    if (P.meleeT > 0) P.meleeT = Math.max(0, P.meleeT - stepDt);
    if (P.meleeBufT > 0) P.meleeBufT = Math.max(0, P.meleeBufT - stepDt);
    if (P.comboWindowT > 0) P.comboWindowT = Math.max(0, P.comboWindowT - stepDt);
    if (P.plungeLandT > 0) P.plungeLandT = Math.max(0, P.plungeLandT - stepDt);
    if (P.landT > 0) P.landT = Math.max(0, P.landT - stepDt);

    // Fire buffered next combo swing the moment the previous swing reaches its follow-through cancel window
    if (P.meleeBufT > 0 && P.meleeT <= 0.15 && !P.dead && !P.swimming && !P.plunging && P.onGround) {
      P.meleeBufT = 0;
      if (typeof callbacks.onMelee === 'function') callbacks.onMelee();
      else startMelee();
    }

    if (P.dead) {
      P.vx *= Math.exp(-8 * stepDt);
      P.vz *= Math.exp(-8 * stepDt);
      P.idleT += stepDt;
      animatePlayerRig(stepDt, nowTime, player, 0, WALK_SPEED, false, lookCandidates);
      updateCamera(stepDt, hFn);
      return;
    }

    // Rising-edge detection for Space / touch jump so keyboard & mobile jump both buffer cleanly
    const spaceNow = !!keys.Space || touchJumpHeld;
    if (spaceNow && !prevSpaceKey) {
      P.jumpBufT = JUMP_BUF_TIME;
    }
    prevSpaceKey = spaceNow;

    if (firstPerson) {
      if (keys.KeyA || keys.ArrowLeft) P.facing += 2.6 * stepDt;
      if (keys.KeyD || keys.ArrowRight) P.facing -= 2.6 * stepDt;
      if (Math.abs(touchMoveX) > 0.12) P.facing -= touchMoveX * 2.4 * stepDt;
    } else if (!lockTarget) {
      if (keys.KeyQ) camYaw += 2.2 * stepDt;
      if (keys.KeyE) camYaw -= 2.2 * stepDt;
    }

    computeMoveInput(_inDir);
    const mx = _inDir.x;
    const mz = _inDir.z;
    const hasMoveInput = Math.hypot(mx, mz) > 0.05;
    const rollKeyHeld = !!(keys.KeyC || keys.KeyX);

    // Hold X/C + press any direction key (or buffered tap) fires directional roll immediately!
    if ((rollKeyHeld || P.rollBufT > 0) && hasMoveInput) {
      startRoll();
    }

    const surfY = getWaterSurfaceY(P.x, P.z, nowTime);
    const ground = hFn(P.x, P.z);
    const swimHere = ground < surfY - 1.65;

    const wantSprint = (!!(keys.ShiftLeft || keys.ShiftRight) || touchSprint) && hasMoveInput && !rollKeyHeld && P.rollT <= 0 && (P.meleeT <= 0 || P.meleeStep === 7) && !P.sliding;
    P.sprinting = wantSprint;
    P.sprintBlend += ((wantSprint ? 1 : 0) - P.sprintBlend) * Math.min(1, stepDt * 7.5);

    const relicSwimMul = P.hasBreathRelic ? 1.25 : 1.0;
    const baseSpeed = swimHere
      ? (SWIM_SPEED + (SWIM_SPRINT_SPEED - SWIM_SPEED) * P.sprintBlend) * relicSwimMul
      : WALK_SPEED + (SPRINT_SPEED - WALK_SPEED) * P.sprintBlend;
    const viewPitch = firstPerson ? lookPitch : camPitch;
    const horizSwimScale = P.swimming && hasMoveInput ? Math.max(0.45, Math.cos(viewPitch * 0.6)) : 1.0;

    const wasRolling = P.rollT > 0;
    if (P.rollT > 0) {
      P.rollT = Math.max(0, P.rollT - stepDt);
      if (P.rollT > 0) {
        const rollProg = 1 - P.rollT / ROLL_DURATION;
        const rollSpd = ROLL_SPEED_START + (ROLL_SPEED_END - ROLL_SPEED_START) * rollProg;
        P.vx = P.rollDirX * rollSpd;
        P.vz = P.rollDirZ * rollSpd;
      } else if (P.rollLocalFwd < 0.55) {
        // Stick the landing cleanly on side-rolls and back-rolls instead of coasting backward
        P.vx *= 0.12;
        P.vz *= 0.12;
      }
    } else if (P.plunging) {
      if (P.rollCooldown > 0) P.rollCooldown = Math.max(0, P.rollCooldown - stepDt);
      // Maintain forward plunge leap trajectory cleanly into the target zone
      const drag = Math.exp((P.plungeWindupT > 0 ? -1.4 : -2.8) * stepDt);
      P.vx *= drag;
      P.vz *= drag;
    } else if (P.meleeT > 0 || P.plungeLandT > 0.12) {
      if (P.rollCooldown > 0) P.rollCooldown = Math.max(0, P.rollCooldown - stepDt);
      // Carry smooth gliding momentum through Sprint Slide-Thrust, Dash-Cut & Roll-Strike!
      const dragRate = P.meleeStep === 7 ? 2.0
        : (P.meleeStep === 4 || P.meleeStep === 6) ? 3.5
        : P.plungeLandT > 0.12 ? 9.0
        : 5.2;
      const drag = Math.exp(-dragRate * stepDt);
      P.vx *= drag;
      P.vz *= drag;
    } else {
      if (P.rollCooldown > 0) P.rollCooldown = Math.max(0, P.rollCooldown - stepDt);
      const accel = P.onGround || P.swimming ? 10.0 : 4.2;
      const k = Math.min(1, stepDt * accel);
      // Holding X/C on land holds roll-ready stance instead of walking/turning
      const allowWalk = !(rollKeyHeld && !P.swimming);
      const targetSpd = allowWalk ? baseSpeed * horizSwimScale : 0;
      P.vx += (mx * targetSpd - P.vx) * k;
      P.vz += (mz * targetSpd - P.vz) * k;
    }

    if (P.swimming) {
      const tx = P.x + P.vx * stepDt;
      const tz = P.z + P.vz * stepDt;
      if (hFn(tx, P.z) <= P.y + 0.65) P.x = tx;
      if (hFn(P.x, tz) <= P.y + 0.65) P.z = tz;
      P.sliding = false;
    } else {
      stepTerrainMove(
        P.x,
        P.z,
        P.vx * stepDt,
        P.vz * stepDt,
        P.onGround || P.y <= ground + 0.25,
        hFn,
        nFn,
        _stepOut
      );
      P.x = _stepOut.x;
      P.z = _stepOut.z;
      P.sliding = _stepOut.sliding && P.onGround;
      if (P.sliding) {
        const sk = Math.min(1, stepDt * 10);
        P.vx += (_stepOut.slideVx - P.vx) * sk;
        P.vz += (_stepOut.slideVz - P.vz) * sk;
        const slMag = Math.hypot(_stepOut.slideVx, _stepOut.slideVz);
        if (slMag > 0.05) {
          P.slideNormX = _stepOut.slideVx / slMag;
          P.slideNormZ = _stepOut.slideVz / slMag;
        }
        if (Math.random() < stepDt * 7 && typeof callbacks.onDust === 'function') {
          const surf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'stone';
          callbacks.onDust(P.x, P.y + 0.08, P.z, 2, surf);
        }
      } else if (_stepOut.blocked) {
        const nx = _stepOut.blockNx;
        const nz = _stepOut.blockNz;
        const hLenSq = nx * nx + nz * nz;
        const dot = P.vx * nx + P.vz * nz;
        if (hLenSq > 1e-8 && dot < 0) {
          P.vx -= (dot / hLenSq) * nx;
          P.vz -= (dot / hLenSq) * nz;
        }
      }
    }

    if (typeof getNearbyColliders === 'function') {
      getNearbyColliders(P.x, P.z, PLAYER_RADIUS + 0.9, _colliderBuf);
      resolveColliders(P.x, P.z, PLAYER_RADIUS, _colliderBuf, _colOut, P.y);
      P.x = _colOut.x;
      P.z = _colOut.z;
    } else {
      _colliderBuf.length = 0;
    }

    const spd = Math.hypot(P.vx, P.vz);
    const moving = spd > 0.6;
    if (moving && !P.sliding) {
      P.walkT += stepDt * (9.6 + P.sprintBlend * 2.2) * (spd / Math.max(1, baseSpeed));
    }

    if (wasRolling || P.rollT > 0) {
      // Preserve Starkeeper's forward facing during and right out of side-rolls & back-rolls!
    } else if (lockTarget && lockTarget.mesh && lockTarget.mesh.position) {
      const tp = lockTarget.mesh.position;
      P.facing = Math.atan2(tp.x - P.x, tp.z - P.z);
    } else if (P.sliding && !firstPerson && !lockTarget && P.meleeT <= 0 && (P.slideNormX !== 0 || P.slideNormZ !== 0)) {
      // Gently turn toward an angled downhill surf orientation while sliding down a steep cliff!
      const downYaw = Math.atan2(P.slideNormX, P.slideNormZ);
      const diff = wrapAngle(downYaw - P.facing);
      P.facing = wrapAngle(P.facing + diff * Math.min(1, stepDt * 3.8));
    } else if (!firstPerson && hasMoveInput && !rollKeyHeld && P.rollCooldown <= 0 && P.meleeT <= 0 && P.castFaceT <= 0 && moving) {
      P.facing = Math.atan2(P.vx, P.vz);
    }

    const terrainG2 = hFn(P.x, P.z);
    const g2 = getSupportHeight(P.x, P.z, P.y, terrainG2, _colliderBuf, P.vy);
    const surfY2 = getWaterSurfaceY(P.x, P.z, nowTime);

    P.swimming = g2 < surfY2 - 1.65 && P.y < surfY2 + 0.45;

    if (P.swimming) {
      P.onGround = false;
      P.coyoteT = 0;
      P.rollT = 0;
      P.plunging = false;

      const fwdInput = ((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0)) - touchMoveZ;
      let surfaceHopped = false;

      // Tap Space at water surface near shallow shoreline to hop cleanly out onto land
      if (P.jumpBufT > 0 && P.y >= surfY2 - 1.65 && g2 > surfY2 - 2.6) {
        P.vy = 7.4;
        P.swimming = false;
        P.jumpBufT = 0;
        P.jumpStretch = 0.8;
        surfaceHopped = true;
        if (typeof Sound !== 'undefined' && Sound && typeof Sound.jump === 'function') Sound.jump();
        if (typeof callbacks.onSplash === 'function') callbacks.onSplash(P.x, surfY2, P.z, 7);
      }

      if (!surfaceHopped) {
        P.jumpBufT = 0;
        let targetVy = 0;
        let hasVerticalDrive = false;

        if (spaceNow) {
          // Space / Jump button ascends smoothly toward the surface waterline
          targetVy = 4.6 + P.sprintBlend * 1.4;
          hasVerticalDrive = true;
        } else if (fwdInput > 0.15) {
          // Aim camera down + move forward to dive; level to cruise; up to rise
          targetVy = Math.sin(viewPitch) * baseSpeed * 1.05;
          hasVerticalDrive = true;
        } else if (fwdInput < -0.15) {
          targetVy = -Math.sin(viewPitch) * baseSpeed * 0.55;
          hasVerticalDrive = true;
        } else if (P.y > surfY2 - 2.10) {
          // Buoyant treading float IN the water (torso & shoulders submerged, chin & hat above the waves!)
          targetVy = (surfY2 - 1.38 - P.y) * 4.5;
          hasVerticalDrive = true;
        }

        const vertRate = hasVerticalDrive ? 6.5 : 5.5;
        P.vy += (targetVy - P.vy) * Math.min(1, stepDt * vertRate);
        P.y += P.vy * stepDt;

        // Keep Starkeeper's torso genuinely submerged IN the water (never floating on top of waves!) and above seabed
        if (P.y > surfY2 - 1.22) {
          P.y = surfY2 - 1.22;
          if (P.vy > 0) P.vy = 0;
        }
        if (P.y < g2 + 0.42) {
          P.y = g2 + 0.42;
          if (P.vy < 0) P.vy = 0;
        }

        const swimActive = moving || Math.abs(P.vy) > 0.65;
        P.swimMoveBlend += ((swimActive ? 1 : 0) - P.swimMoveBlend) * Math.min(1, stepDt * 7);
        const wantSwimPitch = swimActive ? clamp(Math.atan2(P.vy, Math.max(1.4, spd)), -0.95, 0.95) : 0;
        P.swimPitch += (wantSwimPitch - P.swimPitch) * Math.min(1, stepDt * 7);

        // Drain air when Starkeeper's head submerges below the waterline; refill smoothly while treading at surface!
        if (P.y < surfY2 - 1.52) {
          if (P.hasBreathRelic) {
            P.air = AIR_MAX;
            P.drownAcc = 0;
          } else {
            P.air = Math.max(0, P.air - stepDt);
            if (P.air <= 0) {
              if (nowTime - lastBreathToastTime > 2.5) {
                lastBreathToastTime = nowTime;
                emitToast('Out of breath - hold Space to swim up!', 2000);
              }
              P.drownAcc += stepDt;
              if (P.drownAcc >= 1.4) {
                P.drownAcc -= 1.4;
                if (typeof callbacks.onDrownDamage === 'function') callbacks.onDrownDamage(1);
              }
            } else {
              P.drownAcc = 0;
            }
          }
        } else {
          P.air = Math.min(AIR_MAX, P.air + stepDt * 3.5);
          P.drownAcc = 0;
        }
      }
    } else {
      P.drownAcc = 0;
      P.swimMoveBlend += (0 - P.swimMoveBlend) * Math.min(1, stepDt * 9);
      P.swimPitch += (0 - P.swimPitch) * Math.min(1, stepDt * 9);
      P.air = Math.min(AIR_MAX, P.air + stepDt * 5);
      if (P.onGround) {
        P.coyoteT = COYOTE_TIME;
      }

      if (P.jumpPrepT > 0) {
        P.jumpPrepT = Math.max(0, P.jumpPrepT - stepDt);
        if (P.jumpPrepT <= 0) {
          launchJump(g2, surfY2);
        }
      } else if (P.jumpBufT > 0 && P.onGround) {
        // Context-aware knee-bend anticipation before grounded takeoff (standing crouch vs running plant-and-drive)
        const hSpd = Math.hypot(P.vx, P.vz);
        const runB = smoothstep(hSpd, 1.0, 6.5);
        P.jumpPrepRunB = runB;
        P.jumpPrepDur = 0.074 - runB * 0.022;
        P.jumpPrepT = P.jumpPrepDur;
        P.jumpBufT = 0;
        P.rollT = 0;
      } else if (P.jumpBufT > 0 && P.coyoteT > 0) {
        // Coyote-time ledge saves launch instantaneously for responsive platforming
        launchJump(g2, surfY2);
      }

      const wasOnGround = P.onGround;
      let grav = GRAVITY_FALL;
      if (P.plunging) {
        if (P.plungeWindupT > 0) {
          P.plungeWindupT = Math.max(0, P.plungeWindupT - stepDt);
          grav = GRAVITY_APEX;
          if (P.plungeWindupT <= 0) {
            P.vy = -21.0;
            P.vx *= 0.65;
            P.vz *= 0.65;
          }
        } else {
          grav = 52;
        }
        P.plungeTrailAcc += stepDt;
        if (P.plungeTrailAcc >= 0.028) {
          P.plungeTrailAcc = 0;
          if (typeof callbacks.onPlungeTrail === 'function') {
            callbacks.onPlungeTrail(P.x, P.y + 1.35, P.z);
          }
        }
      } else if (P.vy > 2.5 && !spaceNow) {
        grav = GRAVITY_CUT;
      } else if (P.vy > 1.8) {
        grav = GRAVITY_RISE;
      } else if (Math.abs(P.vy) <= 1.8 && spaceNow) {
        grav = GRAVITY_APEX;
      }
      P.vy -= grav * stepDt;
      P.y += P.vy * stepDt;

      if (P.y <= g2) {
        const impactVy = P.vy;
        if (!wasOnGround && P.plunging) {
          P.plunging = false;
          P.plungeWindupT = 0;
          P.plungeLandT = 0.34;
          P.vx *= 0.14;
          P.vz *= 0.14;
          P.squash = 1.0;
          addCameraShake(0.72);
          if (typeof callbacks.onPlungeImpact === 'function') {
            callbacks.onPlungeImpact(P.x, g2, P.z);
          }
        } else if (!wasOnGround && impactVy < -2.5) {
          const impact = clamp(Math.abs(impactVy) / 14, 0.2, 1.0);
          P.squash = Math.max(P.squash, impact);
          P.landStrength = Math.max(P.landStrength * 0.4, impact);
          P.landDur = 0.16 + impact * 0.06;
          P.landT = P.landDur;
          if (g2 < surfY2 - 0.08) {
            if (typeof Sound !== 'undefined' && Sound && typeof Sound.splash === 'function') {
              Sound.splash(impact * 0.85);
            }
            if (typeof callbacks.onSplash === 'function') {
              callbacks.onSplash(P.x, surfY2, P.z, Math.round(5 + impact * 6));
            }
          } else {
            if (typeof Sound !== 'undefined' && Sound && typeof Sound.land === 'function') {
              Sound.land(impact);
            }
            const landSurf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
            if ((landSurf === 'sand' || landSurf === 'snow') && g2 <= terrainG2 + 0.15 && typeof callbacks.onFootprint === 'function') {
              callbacks.onFootprint(P.x, g2, P.z, P.facing, landSurf, -1, 1.08);
              callbacks.onFootprint(P.x, g2, P.z, P.facing, landSurf, 1, 1.08);
            }
            if (Math.abs(impactVy) > 6.5 && typeof callbacks.onDust === 'function') {
              callbacks.onDust(P.x, g2 + 0.15, P.z, Math.round(4 + impact * 5), landSurf);
            }
            // Fall damage on steep cliff drops (> 14.5 u/s downward impact on solid ground)
            if (impactVy < -14.5 && g2 >= surfY2 - 0.5) {
              const fallDmg = Math.min(6, Math.max(2, Math.floor((Math.abs(impactVy) - 13.5) * 0.65)));
              addCameraShake(clamp(Math.abs(impactVy) / 24, 0.4, 0.85));
              if (typeof callbacks.onFallDamage === 'function') {
                callbacks.onFallDamage(fallDmg, Math.abs(impactVy));
              }
            }
          }
        }
        P.y = g2;
        P.vy = 0;
        P.onGround = true;
        if (P.jumpBufT > 0) {
          launchJump(g2, surfY2);
        }
      } else if (wasOnGround && P.vy <= 0 && P.y - g2 <= 0.18) {
        // Stay grounded smoothly when running down gentle slopes
        P.y = g2;
        P.vy = 0;
        P.onGround = true;
      } else {
        P.onGround = false;
      }
    }

    // Water surface crossing splash
    const submergedNow = P.y < surfY2 - 0.15 && g2 < surfY2 - 0.25;
    if (submergedNow !== P.wasInWater) {
      if (Math.abs(P.vy) > 2.5 || (submergedNow && P.swimming)) {
        const intensity = clamp(Math.abs(P.vy) / 10, 0.3, 1.0);
        if (typeof Sound !== 'undefined' && Sound && typeof Sound.splash === 'function') {
          Sound.splash(intensity);
        }
        if (typeof callbacks.onSplash === 'function') {
          callbacks.onSplash(P.x, surfY2, P.z, Math.round(6 + intensity * 8));
        }
      }
      P.wasInWater = submergedNow;
    }

    // Footstep, roll & sprint slide-thrust ground trail audio/FX
    if (P.meleeStep === 7 && P.meleeT > 0.08 && P.onGround && !P.swimming) {
      P.slideTrailAcc += stepDt;
      if (P.slideTrailAcc >= 0.055) {
        P.slideTrailAcc -= 0.055;
        const rawSurf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
        if (g2 < surfY2 - 0.08) {
          if (typeof callbacks.onSplash === 'function') callbacks.onSplash(P.x, surfY2, P.z, 4);
        } else {
          if (typeof callbacks.onDust === 'function') callbacks.onDust(P.x, P.y + 0.08, P.z, 3, rawSurf);
          if ((rawSurf === 'sand' || rawSurf === 'snow') && g2 <= terrainG2 + 0.15 && typeof callbacks.onFootprint === 'function') {
            callbacks.onFootprint(P.x, g2, P.z, P.facing, rawSurf, -1, 1.05);
          }
        }
      }
    } else if (P.rollT > 0) {
      P.stepAcc += stepDt * 7.5;
      if (P.stepAcc >= 1.0) {
        P.stepAcc -= 1.0;
        if (g2 < surfY2 - 0.08) {
          if (typeof callbacks.onSplash === 'function') callbacks.onSplash(P.x, surfY2, P.z, 4);
        } else if (typeof callbacks.onDust === 'function') {
          const surf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
          callbacks.onDust(P.x, P.y + 0.1, P.z, 3, surf);
        }
      }
    } else if (moving && P.onGround && !P.swimming && !P.sliding) {
      P.stepAcc += stepDt * (spd / baseSpeed) * 2.9;
      if (P.stepAcc >= 1.0) {
        P.stepAcc -= 1.0;
        P.stepSide = -P.stepSide;
        const rawSurf = typeof surfaceAt === 'function' ? surfaceAt(P.x, P.z) : 'grass';
        const surf = g2 < surfY2 - 0.08 ? 'water' : rawSurf;
        if (typeof Sound !== 'undefined' && Sound && typeof Sound.step === 'function') {
          Sound.step(surf);
        }
        if ((rawSurf === 'sand' || rawSurf === 'snow') && g2 >= surfY2 - 0.14 && g2 <= terrainG2 + 0.15 && typeof callbacks.onFootprint === 'function') {
          callbacks.onFootprint(P.x, g2, P.z, P.facing, rawSurf, P.stepSide, 1.0);
        }
        if (surf === 'water') {
          if (typeof callbacks.onSplash === 'function') callbacks.onSplash(P.x, surfY2, P.z, 3);
        } else if (spd > 5.0 && typeof callbacks.onDust === 'function') {
          callbacks.onDust(P.x, P.y + 0.08, P.z, 2, surf);
        }
      }
    }

    P.idleT += stepDt;
    animatePlayerRig(stepDt, nowTime, player, spd, baseSpeed, moving, lookCandidates);
    updateCamera(stepDt, hFn);
  }

  /**
   * Computes Star Bolt aim direction:
   * 1) Active Z-target (intentional lock-on with mild velocity lead)
   * 2) Manual center-screen camera ray (NO passive enemy auto-aim!)
   * 3) Starkeeper facing fallback if camera is unavailable
   */
  function getAimDirection(fromPos, out) {
    if (!out) out = _aimDir;
    const fx = fromPos ? fromPos.x : P.x;
    const fy = fromPos ? fromPos.y : P.y + 1.25;
    const fz = fromPos ? fromPos.z : P.z;

    validateLockTarget();
    if (lockTarget && lockTarget.mesh && lockTarget.mesh.position) {
      const tp = lockTarget.mesh.position;
      let tx = tp.x;
      const ty = tp.y + (lockTarget.yOffset !== undefined ? lockTarget.yOffset : 0.6);
      let tz = tp.z;

      const ref = lockTarget.ref;
      if (ref && typeof ref.vx === 'number' && typeof ref.vz === 'number') {
        const dist = Math.hypot(tx - fx, ty - fy, tz - fz);
        const leadT = Math.min(0.45, dist / 18) * 0.5;
        tx += ref.vx * leadT;
        tz += ref.vz * leadT;
      }

      out.set(tx - fx, ty - fy, tz - fz).normalize();
      return out;
    }

    // True manual aiming along center-screen camera view ray (zero passive auto-aim)
    if (typeof camera !== 'undefined' && camera && camera.position && typeof camera.getWorldDirection === 'function') {
      camera.getWorldDirection(_camFwd);
      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;
      const hFn = typeof heightAt === 'function' ? heightAt : null;
      const camToPlayer = Math.hypot(fx - cx, fy - cy, fz - cz);
      let aimDist = Math.max(24, camToPlayer + 18);

      // Intersect camera ray with terrain so aiming at hills/ground hits cleanly under crosshair
      if (hFn) {
        const startD = Math.max(2, camToPlayer + 2.5);
        for (let step = 0; step < 14; step++) {
          const d = startD + step * 2.5;
          const rx = cx + _camFwd.x * d;
          const ry = cy + _camFwd.y * d;
          const rz = cz + _camFwd.z * d;
          if (ry <= hFn(rx, rz) + 0.35) {
            aimDist = d;
            break;
          }
        }
      }

      const aimX = cx + _camFwd.x * aimDist;
      const aimY = cy + _camFwd.y * aimDist;
      const aimZ = cz + _camFwd.z * aimDist;
      out.set(aimX - fx, aimY - fy, aimZ - fz).normalize();
      return out;
    }

    const fwdX = Math.sin(P.facing);
    const fwdZ = Math.cos(P.facing);
    const fyDir = firstPerson ? Math.sin(lookPitch) : 0;
    const fCos = firstPerson ? Math.cos(lookPitch) : 1;
    out.set(fwdX * fCos, fyDir, fwdZ * fCos).normalize();
    return out;
  }

  /**
   * Projects active lockTarget world position + yOffset into HUD pixel coords.
   * Returns a reused scratch object `{ visible, x, y, scale }`.
   */
  function projectLockReticle(cam, viewW, viewH) {
    validateLockTarget();
    if (!lockTarget || !lockTarget.mesh || !lockTarget.mesh.position || !cam) {
      _reticleOut.visible = false;
      return _reticleOut;
    }

    const tp = lockTarget.mesh.position;
    const tx = tp.x;
    const ty = tp.y + (lockTarget.yOffset !== undefined ? lockTarget.yOffset : 0.65);
    const tz = tp.z;

    if (cam.position && typeof cam.getWorldDirection === 'function') {
      cam.getWorldDirection(_camFwd);
      const toX = tx - cam.position.x;
      const toY = ty - cam.position.y;
      const toZ = tz - cam.position.z;
      if (toX * _camFwd.x + toY * _camFwd.y + toZ * _camFwd.z <= 0.1) {
        _reticleOut.visible = false;
        return _reticleOut;
      }
    }

    _reticleVec.set(tx, ty, tz);
    if (typeof _reticleVec.project === 'function') {
      _reticleVec.project(cam);
    }

    if (
      Math.abs(_reticleVec.x) > 1.08 ||
      Math.abs(_reticleVec.y) > 1.08 ||
      _reticleVec.z < -1 ||
      _reticleVec.z > 1
    ) {
      _reticleOut.visible = false;
      return _reticleOut;
    }

    const cx = cam.position ? cam.position.x : P.x;
    const cy = cam.position ? cam.position.y : P.y + 1.6;
    const cz = cam.position ? cam.position.z : P.z;
    const dist = Math.hypot(tx - cx, ty - cy, tz - cz);

    _reticleOut.visible = true;
    _reticleOut.x = (_reticleVec.x * 0.5 + 0.5) * viewW;
    _reticleOut.y = (-_reticleVec.y * 0.5 + 0.5) * viewH;
    _reticleOut.scale = clamp(9 / Math.max(3, dist), 0.65, 1.45);
    return _reticleOut;
  }

  return {
    P,
    AIR_MAX,
    MAX_WALK_SLOPE_COS,
    keys,
    get lockTarget() { return lockTarget; },
    set lockTarget(v) { lockTarget = v; },
    get firstPerson() { return firstPerson; },
    set firstPerson(v) { firstPerson = !!v; },
    get camYaw() { return camYaw; },
    get camPitch() { return camPitch; },
    get camDist() { return camDist; },
    init,
    setTouchMove,
    setTouchJump,
    orbitCamera,
    resolveColliders,
    getSupportHeight,
    stepTerrainMove,
    computeCameraDistance,
    toggleLockOn,
    clearLockOn,
    validateLockTarget,
    triggerCastAnim,
    faceAimDirection,
    startShot,
    startRoll,
    startMelee,
    addCameraShake,
    getCameraKick: () => camKick,
    updatePlayer,
    getAimDirection,
    projectLockReticle,
    turnToward,
    wrapAngle,
  };
})();
