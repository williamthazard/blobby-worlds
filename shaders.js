// ============================================================
// shaders.js - Stylized PBR Shaders & Atmospheric Sky
// Provides synchronized water waves, terrain detail/cliff/caustics,
// Fresnel depth-absorbing water, distant horizon ocean skirt,
// instanced wind-swaying grass & kelp, Rayleigh/Mie sky dome
// with drifting FBM clouds, and additive glow halo sprites.
// ============================================================

const Shaders = (() => {
  'use strict';

  // ---------- Lightweight Fallbacks for Headless / Node Evaluation ----------

  function makeVec2(x, y) {
    if (typeof THREE !== 'undefined' && THREE.Vector2) {
      return new THREE.Vector2(x, y);
    }
    return {
      x,
      y,
      set(nx, ny) {
        this.x = nx;
        this.y = ny;
        return this;
      },
      copy(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
      },
    };
  }

  function makeVec3(x, y, z) {
    if (typeof THREE !== 'undefined' && THREE.Vector3) {
      return new THREE.Vector3(x, y, z);
    }
    return {
      x,
      y,
      z,
      set(nx, ny, nz) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
        return this;
      },
      copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
      },
      lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
      },
      normalize() {
        const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) || 1;
        this.x /= len;
        this.y /= len;
        this.z /= len;
        return this;
      },
    };
  }

  function makeVec4(x, y, z, w) {
    if (typeof THREE !== 'undefined' && THREE.Vector4) {
      return new THREE.Vector4(x, y, z, w);
    }
    return {
      x,
      y,
      z,
      w,
      set(nx, ny, nz, nw) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
        this.w = nw;
        return this;
      },
    };
  }

  function makeColor(hex) {
    if (typeof THREE !== 'undefined' && THREE.Color) {
      return new THREE.Color(hex);
    }
    const col = {
      r: 1,
      g: 1,
      b: 1,
      set(v) {
        if (typeof v === 'number') {
          this.r = ((v >> 16) & 255) / 255;
          this.g = ((v >> 8) & 255) / 255;
          this.b = (v & 255) / 255;
        } else if (v && typeof v === 'object' && 'r' in v) {
          this.r = v.r;
          this.g = v.g;
          this.b = v.b;
        }
        return this;
      },
      lerpColors(c1, c2, t) {
        this.r = c1.r + (c2.r - c1.r) * t;
        this.g = c1.g + (c2.g - c1.g) * t;
        this.b = c1.b + (c2.b - c1.b) * t;
        return this;
      },
    };
    return col.set(hex);
  }

  function setColorInPlace(target, src) {
    if (src === undefined || src === null) return;
    if (typeof src === 'object' && 'r' in src && 'g' in src && 'b' in src) {
      target.r = src.r;
      target.g = src.g;
      target.b = src.b;
    } else if (typeof target.set === 'function') {
      target.set(src);
    }
  }

  // ---------- Shared Per-Frame Uniforms ----------

  const MAX_TRAMPLERS = 16;
  const _tramplers = [];
  for (let i = 0; i < MAX_TRAMPLERS; i++) {
    _tramplers.push(makeVec4(0, -999, 0, 0));
  }

  const uniforms = {
    uTime: { value: 0 },
    uWaterY: { value: 0 },
    uPlayerPos: { value: makeVec3(0, 0, 0) },
    uTramplers: { value: _tramplers },
    uCamPos: { value: makeVec3(0, 5, 10) },
    uSunDir: { value: makeVec3(0.45, 0.72, 0.38).normalize() },
    uSunColor: { value: makeColor(0xffd699) },
    uSkyTop: { value: makeColor(0x162244) },
    uSkyMid: { value: makeColor(0x2d436e) },
    uSkyBot: { value: makeColor(0x4b638a) },
    uProgress: { value: 0 },
    uFogColor: { value: makeColor(0x283656) },
    uFogNear: { value: 38 },
    uFogFar: { value: 112 },
    // x = horizontal speed norm (0..1.6), y = vertical vel norm (-1.5..1.5), z = turn/spin rate, w = ambient wind
    uClothMotion: { value: makeVec4(0, 0, 0, 0.25) },
    // Continuous single-piece cloth bend: x = liftAngle (rad), y = sCurveDroop, z = lateralSway, w = flutterAmp
    uClothCurve: { value: makeVec4(0.22, 0.04, 0.0, 0.15) },
    // Sub-Project 4 celestial & cohesive wind field uniforms
    uMoonDir: { value: makeVec3(-0.42, 0.62, -0.34).normalize() },
    uMoonColor: { value: makeColor(0x9abcf5) },
    uNightFactor: { value: 1.0 },
    uWindVec: { value: makeVec4(0.84, 0.54, 0.55, 0.0) },
    uCloudOffset: { value: makeVec2(0.0, 0.0) },
  };

  let _celestialDriven = false;

  function setCelestial(moonDir, moonColor, nightFactor) {
    _celestialDriven = true;
    if (moonDir && typeof moonDir === 'object' && 'x' in moonDir) {
      uniforms.uMoonDir.value.set(moonDir.x, moonDir.y, moonDir.z);
      if (uniforms.uMoonDir.value.lengthSq() > 0) {
        uniforms.uMoonDir.value.normalize();
      }
    }
    if (moonColor !== undefined && moonColor !== null) {
      setColorInPlace(uniforms.uMoonColor.value, moonColor);
    }
    if (nightFactor !== undefined && nightFactor !== null) {
      uniforms.uNightFactor.value = nightFactor < 0 ? 0 : (nightFactor > 1 ? 1 : nightFactor);
    }
  }

  function setWind(dirX, dirZ, strength, phase, cloudOffX, cloudOffZ) {
    uniforms.uWindVec.value.set(
      dirX !== undefined ? dirX : 0.84,
      dirZ !== undefined ? dirZ : 0.54,
      strength !== undefined ? strength : 0.55,
      phase !== undefined ? phase : 0.0
    );
    if (cloudOffX !== undefined || cloudOffZ !== undefined) {
      uniforms.uCloudOffset.value.set(
        cloudOffX !== undefined ? cloudOffX : uniforms.uCloudOffset.value.x,
        cloudOffZ !== undefined ? cloudOffZ : uniforms.uCloudOffset.value.y
      );
    }
  }

  function setClothMotion(speedNorm, vertVelNorm, spinRate, windGust) {
    uniforms.uClothMotion.value.set(
      speedNorm || 0,
      vertVelNorm || 0,
      spinRate || 0,
      windGust !== undefined ? windGust : 0.25
    );
  }

  function setClothCurve(liftAngle, sDroop, lateralSway, flutterAmp) {
    uniforms.uClothCurve.value.set(
      liftAngle !== undefined ? liftAngle : 0.22,
      sDroop || 0,
      lateralSway || 0,
      flutterAmp !== undefined ? flutterAmp : 0.15
    );
  }

  function setTrampler(index, x, y, z, radius) {
    if (index < 0 || index >= MAX_TRAMPLERS) return;
    _tramplers[index].set(x, y, z, radius);
  }

  function clearTramplersFrom(startIndex) {
    const from = Math.max(0, startIndex | 0);
    for (let i = from; i < MAX_TRAMPLERS; i++) {
      _tramplers[i].set(0, -999, 0, 0);
    }
  }

  // Pre-allocated colors for zero-GC sun tint & sky midpoint interpolation
  const _sunTwilight = makeColor(0xffcc80);
  const _sunDay = makeColor(0xfff4d6);

  function smoothstepScalar(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // ---------- Synchronized 4-Wave Gerstner Water Height ----------
  // W1..W4 amplitudes sum to 0.11 + 0.068 + 0.036 + 0.018 = 0.232 (< 0.25).
  function waterHeightAt(x, z, time, bedHeight) {
    const t = time || 0;
    let shoreDamp = 1.0;
    if (bedHeight !== undefined && bedHeight !== null) {
      const depth = Math.max(uniforms.uWaterY.value - bedHeight, 0);
      shoreDamp = smoothstepScalar(0.05, 1.35, depth);
    }
    const h =
      Math.sin((x * 0.86 + z * 0.51) * 0.16 - t * 1.25) * 0.11 +
      Math.sin((x * -0.48 + z * 0.88) * 0.27 - t * 1.55) * 0.068 +
      Math.sin((x * 0.34 + z * -0.94) * 0.48 - t * 2.05) * 0.036 +
      Math.sin((x * -0.82 + z * -0.57) * 0.78 - t * 2.65) * 0.018;
    return uniforms.uWaterY.value + h * shoreDamp;
  }

  // ---------- Fallback 1x1 Procedural Textures ----------

  let _fallbackColorTex = null;
  let _fallbackNormalTex = null;

  function getFallbackTexture(isNormal) {
    if (typeof THREE === 'undefined' || typeof THREE.DataTexture !== 'function') {
      return null;
    }
    if (isNormal) {
      if (!_fallbackNormalTex) {
        const px = new Uint8Array([128, 128, 255, 255]);
        _fallbackNormalTex = new THREE.DataTexture(
          px, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType
        );
        _fallbackNormalTex.wrapS = THREE.RepeatWrapping;
        _fallbackNormalTex.wrapT = THREE.RepeatWrapping;
        _fallbackNormalTex.encoding = THREE.LinearEncoding;
        _fallbackNormalTex.needsUpdate = true;
      }
      return _fallbackNormalTex;
    }
    if (!_fallbackColorTex) {
      const px = new Uint8Array([180, 180, 180, 255]);
      _fallbackColorTex = new THREE.DataTexture(
        px, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType
      );
      _fallbackColorTex.wrapS = THREE.RepeatWrapping;
      _fallbackColorTex.wrapT = THREE.RepeatWrapping;
      _fallbackColorTex.encoding = THREE.sRGBEncoding;
      _fallbackColorTex.needsUpdate = true;
    }
    return _fallbackColorTex;
  }

  function resolveTextureSets(textures) {
    if (!textures) return null;
    return textures.sets ? textures.sets : textures;
  }

  // ---------- GLSL Shader Sources ----------

  const _WATER_VERT = /* glsl */ `
attribute float aBedHeight;

uniform float uTime;
uniform float uWaterY;

varying vec3 vWorldPos;
varying float vDepth;
varying vec3 vWaveNormal;
varying float vCrest;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float x = worldPos.x;
  float z = worldPos.z;

  float rawDepth = max(uWaterY - aBedHeight, 0.0);
  float shoreDamp = smoothstep(0.05, 1.35, rawDepth);

  // 4-wave synchronized Gerstner ocean table (sum A = 0.232 < 0.25)
  float p1 = (x * 0.86 + z * 0.51) * 0.16 - uTime * 1.25;
  float p2 = (x * -0.48 + z * 0.88) * 0.27 - uTime * 1.55;
  float p3 = (x * 0.34 + z * -0.94) * 0.48 - uTime * 2.05;
  float p4 = (x * -0.82 + z * -0.57) * 0.78 - uTime * 2.65;

  float s1 = sin(p1); float c1 = cos(p1);
  float s2 = sin(p2); float c2 = cos(p2);
  float s3 = sin(p3); float c3 = cos(p3);
  float s4 = sin(p4); float c4 = cos(p4);

  float dispX = (0.34 * 0.11 * 0.86 * c1
               + 0.30 * 0.068 * -0.48 * c2
               + 0.24 * 0.036 * 0.34 * c3
               + 0.18 * 0.018 * -0.82 * c4) * shoreDamp;
  float dispZ = (0.34 * 0.11 * 0.51 * c1
               + 0.30 * 0.068 * 0.88 * c2
               + 0.24 * 0.036 * -0.94 * c3
               + 0.18 * 0.018 * -0.57 * c4) * shoreDamp;
  float h = (s1 * 0.11 + s2 * 0.068 + s3 * 0.036 + s4 * 0.018) * shoreDamp;

  worldPos.x += dispX;
  worldPos.y = uWaterY + h;
  worldPos.z += dispZ;

  // Analytical Gerstner tangent derivatives (cross(dPdz, dPdx) -> +Y normal)
  float dxx = 1.0 - (0.34 * 0.11 * 0.16 * 0.86 * 0.86 * s1
                   + 0.30 * 0.068 * 0.27 * 0.48 * 0.48 * s2
                   + 0.24 * 0.036 * 0.48 * 0.34 * 0.34 * s3
                   + 0.18 * 0.018 * 0.78 * 0.82 * 0.82 * s4) * shoreDamp;
  float dxz = -(0.34 * 0.11 * 0.16 * 0.86 * 0.51 * s1
              + 0.30 * 0.068 * 0.27 * -0.48 * 0.88 * s2
              + 0.24 * 0.036 * 0.48 * 0.34 * -0.94 * s3
              + 0.18 * 0.018 * 0.78 * -0.82 * -0.57 * s4) * shoreDamp;
  float dzz = 1.0 - (0.34 * 0.11 * 0.16 * 0.51 * 0.51 * s1
                   + 0.30 * 0.068 * 0.27 * 0.88 * 0.88 * s2
                   + 0.24 * 0.036 * 0.48 * 0.94 * 0.94 * s3
                   + 0.18 * 0.018 * 0.78 * 0.57 * 0.57 * s4) * shoreDamp;
  float dhdx = (0.16 * 0.11 * 0.86 * c1
              + 0.27 * 0.068 * -0.48 * c2
              + 0.48 * 0.036 * 0.34 * c3
              + 0.78 * 0.018 * -0.82 * c4) * shoreDamp;
  float dhdz = (0.16 * 0.11 * 0.51 * c1
              + 0.27 * 0.068 * 0.88 * c2
              + 0.48 * 0.036 * -0.94 * c3
              + 0.78 * 0.018 * -0.57 * c4) * shoreDamp;

  vec3 dPdx = vec3(dxx, dhdx, dxz);
  vec3 dPdz = vec3(dxz, dhdz, dzz);
  vec3 waveNorm = normalize(cross(dPdz, dPdx));

  vWorldPos = worldPos.xyz;
  vDepth = worldPos.y - aBedHeight;
  vWaveNormal = waveNorm;
  vCrest = clamp(
    smoothstep(0.12, 0.88, h / 0.232) * 0.68 +
    smoothstep(0.018, 0.058, length(waveNorm.xz)) * 0.45,
    0.0,
    1.0
  ) * shoreDamp;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

  const _WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uWaterY;
uniform vec3 uPlayerPos;
uniform vec4 uTramplers[16];
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uNightFactor;
uniform vec4 uWindVec;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform float uProgress;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uWaterNormal;

varying vec3 vWorldPos;
varying float vDepth;
varying vec3 vWaveNormal;
varying float vCrest;

void main() {
  vec2 wDir = normalize(uWindVec.xy + vec2(0.0001, 0.0));
  vec2 wPerp = vec2(-wDir.y, wDir.x);
  float wSpd = 0.78 + clamp(uWindVec.z, 0.0, 1.8) * 0.52;

  vec2 uvA = vWorldPos.xz * 0.11 + wDir * (uTime * 0.045 * wSpd) + wPerp * (uTime * 0.018);
  vec2 uvB = vWorldPos.xz * 0.19 - wDir * (uTime * 0.026 * wSpd) + wPerp * (uTime * 0.036);

  vec3 nA = texture2D(uWaterNormal, uvA).xyz * 2.0 - 1.0;
  vec3 nB = texture2D(uWaterNormal, uvB).xyz * 2.0 - 1.0;
  vec2 ripple = (nA.xy + nB.xy) * (0.22 + 0.06 * clamp(uWindVec.z, 0.0, 1.5));

  // Dynamic GPU swim wake & splash rings around Starkeeper and swimming creatures
  vec2 wakeRipple = vec2(0.0);
  float wakeFoam = 0.0;
  float playerSub = abs(uPlayerPos.y - uWaterY);
  if (playerSub < 1.85) {
    vec2 pDelta = vWorldPos.xz - uPlayerPos.xz;
    float pDist = length(pDelta);
    if (pDist < 7.5 && pDist > 0.04) {
      float pEnv = exp(-pDist * 0.68) * smoothstep(0.08, 0.42, pDist) * (1.0 - smoothstep(1.25, 1.85, playerSub));
      float pRing = sin(pDist * 7.5 - uTime * 6.5);
      wakeRipple += (pDelta / pDist) * (pRing * pEnv * 0.24);
      wakeFoam += max(0.0, pRing) * pEnv * 0.72;
    }
  }
  for (int i = 0; i < 16; i++) {
    vec4 tr = uTramplers[i];
    if (tr.w > 0.05) {
      float trSub = abs(tr.y - uWaterY);
      if (trSub < 1.85) {
        vec2 cDelta = vWorldPos.xz - tr.xz;
        float cDist = length(cDelta);
        if (cDist < 5.5 && cDist > 0.04) {
          float cEnv = exp(-cDist * 0.85) * smoothstep(0.06, 0.34, cDist)
                     * clamp(tr.w * 0.72, 0.35, 1.15) * (1.0 - smoothstep(1.15, 1.85, trSub));
          float cRing = sin(cDist * 8.2 - uTime * 6.8 + float(i) * 0.7);
          wakeRipple += (cDelta / cDist) * (cRing * cEnv * 0.18);
          wakeFoam += max(0.0, cRing) * cEnv * 0.56;
        }
      }
    }
  }

  vec3 N = normalize(vec3(vWaveNormal.x + ripple.x + wakeRipple.x, vWaveNormal.y, vWaveNormal.z + ripple.y + wakeRipple.y));
  vec3 V = normalize(uCamPos - vWorldPos);
  if (dot(N, V) < 0.0) {
    N = -N;
  }

  // Schlick Fresnel (F0 = 0.02 for water)
  float ndv = max(dot(N, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 5.0);

  // Beer-Lambert optical spectral absorption (clear sunlit turquoise shallows -> deep sapphire bay)
  float depth = max(vDepth, 0.0);
  vec3 beerTrans = exp(-depth * vec3(0.42, 0.14, 0.095));
  float absorb = 1.0 - beerTrans.g;
  vec3 shallowCol = vec3(0.042, 0.38, 0.42);
  vec3 deepCol = vec3(0.010, 0.072, 0.145);
  vec3 waterBody = mix(deepCol, shallowCol, clamp(beerTrans.g * 0.75 + beerTrans.b * 0.25, 0.0, 1.0));

  // Sky reflection (convert sRGB sky uniforms to linear)
  vec3 skyTopLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 skyBotLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));
  vec3 R = reflect(-V, N);
  float reflUp = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyRefl = mix(skyBotLin, skyTopLin, pow(max(reflUp, 0.0001), 0.78));

  // Subsurface sun scatter in wave crests
  vec3 L = normalize(uSunDir);
  vec3 sunColLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));
  float sunVis = smoothstep(-0.06, 0.22, L.y);
  float sss = pow(max(dot(V, -L + N * 0.45), 0.0001), 3.0) * (1.0 - absorb * 0.52) * sunVis;
  waterBody += vec3(0.055, 0.26, 0.28) * sss;

  vec3 col = mix(waterBody, skyRefl, clamp(fresnel * 0.85 + 0.06, 0.0, 0.94));

  // Golden sun specular sparkle + silver moonlight path shimmer across night waves
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0001);
  float dayBoost = mix(0.45, 1.25, clamp(uProgress, 0.0, 1.0)) * sunVis;
  float specTight = pow(ndh, 250.0) * 2.5 * dayBoost;
  float specBroad = pow(ndh, 38.0) * 0.22 * dayBoost;
  col += sunColLin * (specTight + specBroad);

  vec3 Lm = normalize(uMoonDir);
  float moonVis = smoothstep(-0.05, 0.20, Lm.y) * clamp(uNightFactor, 0.0, 1.0);
  vec3 Hm = normalize(Lm + V);
  float ndhm = max(dot(N, Hm), 0.0001);
  vec3 moonColLin = pow(max(uMoonColor, vec3(0.0001)), vec3(2.2));
  float moonSpec = pow(ndhm, 190.0) * 1.45 + pow(ndhm, 26.0) * 0.16;
  col += moonColLin * (moonSpec * moonVis);

  // Dual-stage shoreline surge + Gerstner crest whitecaps + swim wake froth
  float shoreZone = 1.0 - smoothstep(0.01, 0.62, vDepth);
  float surfNoise = (nA.x * 0.55 + nB.y * 0.45) * 0.5 + 0.5;
  float laceWave = sin(vWorldPos.x * 2.4 - vWorldPos.z * 1.8 - uTime * 2.2 + surfNoise * 4.2) * 0.5 + 0.5;
  float edgeSurge = 1.0 - smoothstep(0.0, 0.24 + laceWave * 0.18, vDepth);
  float shoreField = shoreZone * (0.38 + 0.62 * surfNoise) * (0.45 + 0.55 * laceWave) + edgeSurge * 0.65;
  float shoreFoam = smoothstep(0.48, 0.82, shoreField);
  float crestFoam = smoothstep(0.52, 0.88, vCrest * (0.65 + surfNoise * 0.55)) * (0.42 + 0.38 * clamp(uWindVec.z, 0.0, 1.5));
  float edgeFade = smoothstep(-0.08, 0.04, vDepth);
  float foam = clamp(shoreFoam + crestFoam + wakeFoam, 0.0, 1.0) * edgeFade;

  vec3 nightFoam = mix(vec3(0.38, 0.50, 0.66), vec3(0.86, 0.94, 0.98), 1.0 - clamp(uNightFactor, 0.0, 1.0));
  col = mix(col, nightFoam, foam * 0.86);

  float alpha = mix(0.42, 0.88, clamp(absorb * 0.78 + fresnel * 0.42, 0.0, 1.0));
  alpha = max(alpha, foam * 0.92) * edgeFade;

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <encodings_fragment>

  float viewDist = length(uCamPos - vWorldPos);
  float fogFactor = smoothstep(uFogNear, max(uFogFar, uFogNear + 0.001), viewDist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogFactor);
}
`;

  const _HORIZON_VERT = /* glsl */ `
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

  const _HORIZON_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uNightFactor;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform float uProgress;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vWorldPos;

void main() {
  float shimmer = sin(vWorldPos.x * 0.14 + uTime * 1.1) * cos(vWorldPos.z * 0.16 - uTime * 0.9) * 0.035;
  vec3 N = normalize(vec3(shimmer, 1.0, shimmer * 0.8));
  vec3 V = normalize(uCamPos - vWorldPos);
  if (dot(N, V) < 0.0) {
    N = -N;
  }

  float fresnel = 0.02 + 0.98 * pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 5.0);
  vec3 deepCol = vec3(0.008, 0.042, 0.11);

  vec3 skyTopLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 skyBotLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(skyBotLin, skyTopLin, pow(clamp(R.y * 0.5 + 0.5, 0.0001, 1.0), 0.78));

  vec3 col = mix(deepCol, skyRefl, clamp(fresnel * 0.84 + 0.08, 0.0, 0.94));

  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);
  vec3 sunColLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));
  float sunVis = smoothstep(-0.06, 0.22, L.y);
  float dayBoost = mix(0.45, 1.25, clamp(uProgress, 0.0, 1.0)) * sunVis;
  col += sunColLin * pow(max(dot(N, H), 0.0001), 96.0) * 0.45 * dayBoost;

  vec3 Lm = normalize(uMoonDir);
  float moonVis = smoothstep(-0.05, 0.20, Lm.y) * clamp(uNightFactor, 0.0, 1.0);
  vec3 Hm = normalize(Lm + V);
  vec3 moonColLin = pow(max(uMoonColor, vec3(0.0001)), vec3(2.2));
  col += moonColLin * pow(max(dot(N, Hm), 0.0001), 72.0) * 0.34 * moonVis;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>

  float viewDist = length(uCamPos - vWorldPos);
  float fogFactor = smoothstep(uFogNear, max(uFogFar, uFogNear + 0.001), viewDist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogFactor);
}
`;

  const _SKY_VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

  const _SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uNightFactor;
uniform vec2 uCloudOffset;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyBot;
uniform float uProgress;
uniform vec3 uFogColor;

varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p) {
  float v = vnoise(p) * 0.55;
  v += vnoise(p * 2.07 + vec2(13.7, 29.3)) * 0.30;
  v += vnoise(p * 4.19 + vec2(41.2, 7.9)) * 0.15;
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float p = clamp(uProgress, 0.0, 1.0);
  float nightRaw = clamp(uNightFactor, 0.0, 1.0);
  float skyLum = dot(uSkyTop, vec3(0.299, 0.587, 0.114));
  float nightMask = smoothstep(0.08, 0.65, nightRaw) * (1.0 - smoothstep(0.22, 0.42, skyLum));

  vec3 topLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 midLin = pow(max(uSkyMid, vec3(0.0001)), vec3(2.2));
  vec3 botLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));
  vec3 sunLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));
  vec3 moonLin = pow(max(uMoonColor, vec3(0.0001)), vec3(2.2));

  // Rayleigh vertical sky gradient
  vec3 col;
  if (dir.y >= 0.0) {
    float up = pow(clamp(dir.y, 0.0001, 1.0), 0.62);
    vec3 lowBand = mix(botLin, midLin, smoothstep(0.0, 0.44, up));
    col = mix(lowBand, topLin, smoothstep(0.42, 1.0, up));
  } else {
    float down = clamp(-dir.y * 2.2, 0.0, 1.0);
    col = mix(botLin, botLin * 0.38, down);
  }

  // Night-only Milky Way galactic dust ribbon tilted across upper sky (completely off in daylight)
  if (dir.y > 0.01 && nightMask > 0.001) {
    vec3 galAxis = normalize(vec3(0.42, 0.56, -0.71));
    float galLat = abs(dot(dir, galAxis));
    float galBand = exp(-galLat * galLat * 18.0);
    vec2 galUv = vec2(atan(dir.z, dir.x) * 1.6, dot(dir, galAxis) * 4.5);
    float galCloud = fbm2(galUv * 2.2 + vec2(7.3, 2.1));
    float dustLane = smoothstep(0.36, 0.68, fbm2(galUv * 4.8 + vec2(19.1, 5.7)));
    float milky = galBand * smoothstep(0.32, 0.82, galCloud) * (1.0 - dustLane * 0.55);
    float galHorizon = smoothstep(0.02, 0.25, dir.y);
    vec3 milkyCol = mix(vec3(0.07, 0.11, 0.23), vec3(0.14, 0.15, 0.24), galCloud);
    col += milkyCol * (milky * galHorizon * nightMask * 0.72);
  }

  // Mie forward scatter + sun disc/corona
  vec3 sunDir = normalize(uSunDir);
  float sunDot = max(dot(dir, sunDir), 0.0001);
  float sunUp = smoothstep(-0.08, 0.16, sunDir.y);
  float horizonBand = pow(max(1.0 - abs(dir.y), 0.0001), 4.2);

  float dawnArc = sin(p * 3.14159265) * (1.0 - nightMask * 0.5);
  float lowSunArc = (1.0 - smoothstep(0.08, 0.45, sunDir.y)) * smoothstep(-0.12, 0.14, sunDir.y);
  float warmGlow = max(dawnArc, lowSunArc);
  float sunDayStrength = (1.0 - nightMask * 0.88);
  float mieGlow = (pow(sunDot, 7.0) * 0.48 + pow(sunDot, 48.0) * 0.82) * sunDayStrength * smoothstep(-0.15, 0.25, sunDir.y);
  vec3 scatterTint = mix(vec3(0.14, 0.22, 0.45), vec3(1.0, 0.65, 0.34), clamp((1.0 - nightMask) * 0.85 + warmGlow * 0.45, 0.0, 1.0));
  col += sunLin * mieGlow + scatterTint * (horizonBand * pow(sunDot, 2.0) * mix(0.03, 0.34, clamp(1.0 - nightMask + warmGlow * 0.4, 0.0, 1.0)));

  float disc = smoothstep(0.9984, 0.9994, sunDot);
  float corona = pow(sunDot, 180.0) * 1.15;
  col += sunLin * ((disc * 2.3 + corona) * sunUp * (1.0 - nightMask * 0.75));

  // Procedural Cratered Moon (lunar basalt maria + 2-scale impact craters + solar phase + silver halo)
  vec3 moonDir = normalize(uMoonDir);
  float moonUp = smoothstep(-0.06, 0.12, moonDir.y);
  float moonDot = dot(dir, moonDir);
  float moonGlow = pow(max(moonDot, 0.0001), 18.0) * 0.09 + pow(max(moonDot, 0.0001), 120.0) * 0.34;
  col += moonLin * (moonGlow * moonUp * nightMask);

  if (moonDot > 0.996 && moonUp > 0.001 && nightMask > 0.001) {
    vec3 mRef = abs(moonDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 mRight = normalize(cross(mRef, moonDir));
    vec3 mUp = cross(moonDir, mRight);
    vec2 mProj = vec2(dot(dir, mRight), dot(dir, mUp)) / 0.044;
    float mR2 = dot(mProj, mProj);
    if (mR2 < 1.0) {
      float mEdge = 1.0 - smoothstep(0.88, 1.0, mR2);
      float mZ = sqrt(max(0.0, 1.0 - mR2));
      float maria = fbm2(mProj * 2.1 + vec2(3.7, 8.2));
      float highlands = fbm2(mProj * 5.8 + vec2(11.4, 2.9));
      float lunarAlbedo = mix(0.56, 0.96, smoothstep(0.38, 0.68, maria)) * (0.82 + 0.32 * highlands);

      vec2 cr1 = fract(mProj * 3.8) - 0.5;
      vec2 cr1Id = floor(mProj * 3.8);
      vec2 cr1Off = vec2(hash21(cr1Id) - 0.5, hash21(cr1Id + 17.3) - 0.5) * 0.38;
      float dCr1 = length(cr1 - cr1Off);
      float rCr1 = 0.18 + 0.14 * hash21(cr1Id + 43.1);
      float craterRim1 = exp(-pow((dCr1 - rCr1) / 0.055, 2.0)) * 0.22;
      float craterBasin1 = (1.0 - smoothstep(0.0, rCr1, dCr1)) * 0.26;

      vec2 cr2 = fract(mProj * 8.4 + 2.3) - 0.5;
      vec2 cr2Id = floor(mProj * 8.4 + 2.3);
      float dCr2 = length(cr2 - (vec2(hash21(cr2Id), hash21(cr2Id + 9.1)) - 0.5) * 0.32);
      float rCr2 = 0.16 + 0.12 * hash21(cr2Id + 31.7);
      float craterRim2 = exp(-pow((dCr2 - rCr2) / 0.05, 2.0)) * 0.15;
      float craterBasin2 = (1.0 - smoothstep(0.0, rCr2, dCr2)) * 0.18;

      float craterRelief = lunarAlbedo + craterRim1 + craterRim2 - craterBasin1 - craterBasin2;
      vec3 mSurfNorm = normalize(mRight * (mProj.x + (cr1.x - cr1Off.x) * 0.35) + mUp * (mProj.y + (cr1.y - cr1Off.y) * 0.35) - moonDir * mZ);
      float solarPhase = smoothstep(-0.16, 0.32, dot(mSurfNorm, sunDir));
      float phaseShade = mix(0.20, 1.15, solarPhase);
      float limb = pow(max(mZ, 0.001), 0.32);
      vec3 moonDiscCol = moonLin * (clamp(craterRelief, 0.25, 1.25) * phaseShade * limb * 1.48);
      col = mix(col, moonDiscCol, mEdge * moonUp * nightMask);
    }
  }

  // Drifting high wispy cirrus + 2-layer FBM sky clouds synced to uCloudOffset
  if (dir.y > 0.01) {
    float horizonFade = smoothstep(0.02, 0.26, dir.y);
    vec2 skyUv = dir.xz / (dir.y + 0.16);
    vec2 cloudShift = uCloudOffset * 0.014;

    float c1 = fbm2(skyUv * 0.78 - cloudShift * 0.65 + vec2(uTime * 0.004, uTime * 0.0015));
    float c2 = fbm2(skyUv * 1.45 - cloudShift * 0.95 + 19.4);
    vec2 cirrusUv = vec2(skyUv.x * 1.9 + skyUv.y * 0.65, skyUv.y * 0.42) - cloudShift * 1.2;
    float cirrus = smoothstep(0.56, 0.88, fbm2(cirrusUv * 2.1)) * smoothstep(0.08, 0.38, dir.y) * 0.42;

    float dens1 = smoothstep(0.52, 0.80, c1);
    float dens2 = smoothstep(0.56, 0.84, c2) * 0.50;
    float cloudAlpha = clamp((dens1 + dens2 * (1.0 - dens1 * 0.5) + cirrus) * horizonFade, 0.0, 0.82);

    float dayLuma = 1.0 - nightMask;
    vec3 cloudShadow = mix(vec3(0.012, 0.020, 0.044), vec3(0.42, 0.50, 0.65), dayLuma);
    vec3 dawnCloudTint = vec3(0.88, 0.44, 0.34) * (warmGlow * 0.42);
    vec3 cloudLit = mix(vec3(0.04, 0.06, 0.12), vec3(1.0, 0.97, 0.90), dayLuma) + dawnCloudTint;
    float edgeLight = clamp(0.40 + 0.60 * pow(sunDot, 2.0) + (1.0 - c1) * 0.25, 0.0, 1.0);
    vec3 cloudCol = mix(cloudShadow, cloudLit + sunLin * (pow(sunDot, 5.0) * mix(0.04, 0.36, dayLuma)), edgeLight);

    col = mix(col, cloudCol, cloudAlpha * mix(0.45, 0.76, dayLuma));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>

  // Melt sky horizon seamlessly into scene fog
  float fogBlend = 1.0 - smoothstep(-0.05, 0.09, dir.y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogBlend);
}
`;

  const _STARFIELD_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aTwinkleSpeed;
attribute vec3 aColor;

uniform float uTime;
uniform vec3 uSunDir;

varying vec3 vColor;
varying float vTwinkle;
varying float vBright;

void main() {
  vec3 starDir = normalize(position);
  float horizonExt = smoothstep(0.02, 0.24, starDir.y);
  float sunWash = 1.0 - smoothstep(0.86, 0.995, max(dot(starDir, normalize(uSunDir)), 0.0)) * 0.65;
  float tw = 0.72 + 0.28 * sin(uTime * aTwinkleSpeed + aPhase);
  vColor = aColor;
  vTwinkle = tw * horizonExt * sunWash;
  vBright = smoothstep(2.4, 4.6, aSize);

  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * (0.86 + 0.22 * tw), 1.0, 18.0);
  gl_Position = projectionMatrix * mvPos;
}
`;

  const _STARFIELD_FRAG = /* glsl */ `
uniform float uStarAlpha;

varying vec3 vColor;
varying float vTwinkle;
varying float vBright;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d = length(p) * 2.0;
  if (d > 1.0) discard;

  float edge = 1.0 - smoothstep(0.70, 1.0, d);
  float airy = exp(-d * d * 7.2);
  float rayH = exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 4.2);
  float rayV = exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 4.2);
  float crossRays = (rayH + rayV) * vBright * 0.78;

  float alpha = clamp((airy + crossRays) * edge * vTwinkle * uStarAlpha, 0.0, 1.0);
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(vColor * (1.1 + crossRays * 0.65), alpha);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}
`;

  const _CLOUD_VERT = /* glsl */ `
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vWorldNorm;

void main() {
  vec4 baseWorld = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    baseWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif

  float billow = sin(uTime * 0.52 + baseWorld.x * 0.07 + baseWorld.z * 0.06) * 0.28;
  vec3 pos = position + normal * billow;

  vec4 cWorld = vec4(pos, 1.0);
  vec3 cNorm = normal;
  #ifdef USE_INSTANCING
    cWorld = instanceMatrix * cWorld;
    cNorm = (instanceMatrix * vec4(cNorm, 0.0)).xyz;
  #endif
  cWorld = modelMatrix * cWorld;

  vWorldPos = cWorld.xyz;
  vWorldNorm = normalize((modelMatrix * vec4(cNorm, 0.0)).xyz);

  gl_Position = projectionMatrix * viewMatrix * cWorld;
}
`;

  const _CLOUD_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uNightFactor;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform float uProgress;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vWorldPos;
varying vec3 vWorldNorm;

void main() {
  vec3 N = normalize(vWorldNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  float ndv = abs(dot(N, V));
  float softEdge = smoothstep(0.06, 0.65, ndv);

  vec3 L = normalize(uSunDir);
  vec3 Lm = normalize(uMoonDir);
  vec3 sunColLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));
  vec3 moonColLin = pow(max(uMoonColor, vec3(0.0001)), vec3(2.2));
  vec3 skyTopLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 skyBotLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));

  float night = clamp(uNightFactor, 0.0, 1.0);
  float sunVis = smoothstep(-0.08, 0.20, L.y) * (1.0 - night * 0.85);
  float moonVis = smoothstep(-0.04, 0.18, Lm.y) * night;
  float upFill = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);

  // Beer-powder multi-scattering illumination
  float ndlSun = dot(N, L) * 0.5 + 0.5;
  float beer = (1.0 - exp(-ndlSun * 2.6)) * (0.42 + 0.58 * upFill);
  float ndlMoon = dot(N, Lm) * 0.5 + 0.5;
  float moonBeer = (1.0 - exp(-ndlMoon * 2.2)) * (0.35 + 0.65 * upFill);

  // Henyey-Greenstein forward scattering silver lining facing Sun/Moon
  vec3 viewRay = normalize(vWorldPos - uCamPos);
  float g = 0.66;
  float cosS = dot(viewRay, L);
  float hgSun = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * cosS, 0.05), 1.5);
  float cosM = dot(viewRay, Lm);
  float hgMoon = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * cosM, 0.05), 1.5);
  float rimScatter = 1.0 - ndv;

  float dawnArc = sin(clamp(uProgress, 0.0, 1.0) * 3.14159265) * (1.0 - night * 0.6);
  float lowSun = (1.0 - smoothstep(0.08, 0.45, L.y)) * smoothstep(-0.10, 0.14, L.y);
  float warmGlow = max(dawnArc, lowSun);

  vec3 creamTop = mix(vec3(0.95, 0.94, 0.91), sunColLin * 1.12, 0.34);
  vec3 skyShadow = mix(skyBotLin * 0.52, skyTopLin * 0.66, 0.48);
  vec3 roseUnder = vec3(0.92, 0.46, 0.34) * (warmGlow * 0.65 * (1.0 - upFill));
  vec3 dayCloud = mix(skyShadow, creamTop, beer) + roseUnder;
  dayCloud += sunColLin * (min(hgSun, 3.2) * (0.12 + 0.24 * rimScatter) * sunVis);

  vec3 nightShadow = vec3(0.018, 0.028, 0.068);
  vec3 nightLit = mix(nightShadow, moonColLin * 0.36, moonBeer)
                + moonColLin * (min(hgMoon, 2.8) * (0.08 + 0.20 * rimScatter) * moonVis);

  vec3 col = mix(dayCloud, nightLit, night * 0.92);

  float camDist = length(vWorldPos - uCamPos);
  float distFade = 1.0 - smoothstep(135.0, 185.0, camDist);
  float alpha = clamp(softEdge * 0.88 * distFade, 0.0, 0.92);
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <encodings_fragment>

  float fogFactor = smoothstep(uFogNear, max(uFogFar * 1.45, uFogNear + 0.001), camDist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogFactor * 0.58);
}
`;

  const _JELLY_VERT = /* glsl */ `
uniform float uTime;
uniform float uIsTentacle;
uniform float uPhase;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vHeight;
varying float vPulse;

void main() {
  vec3 pos = position;

  if (uIsTentacle < 0.5) {
    float bellWave = sin(uTime * 2.6 + uPhase - position.y * 2.4);
    float rimWeight = 1.0 - smoothstep(0.0, 0.45, max(position.y, 0.0));
    float radialExpand = 1.0 + bellWave * (0.08 + 0.10 * rimWeight);
    pos.xz *= radialExpand;
    pos.y += -bellWave * 0.045 * (0.4 + 0.6 * smoothstep(0.0, 0.45, max(position.y, 0.0)));
    vHeight = clamp(position.y / 0.45, 0.0, 1.0);
    vPulse = 0.5 + 0.5 * bellWave;
  } else {
    float tentDist = clamp(-position.y / 0.62, 0.0, 1.05);
    float tentWeight = tentDist * tentDist;
    float waveX = sin(uTime * 3.1 + uPhase + position.y * 5.2);
    float waveZ = cos(uTime * 2.7 + uPhase * 1.13 + position.y * 4.8);
    pos.x += waveX * 0.075 * tentWeight;
    pos.z += waveZ * 0.065 * tentWeight;
    vHeight = clamp(1.0 - tentDist * 0.75, 0.0, 1.0);
    vPulse = 0.5 + 0.5 * waveX;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);

  gl_Position = projectionMatrix * mvPosition;
}
`;

  const _JELLY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uIsTentacle;
uniform float uPhase;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vHeight;
varying float vPulse;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fresnel = pow(max(1.0 - ndv, 0.0001), 2.0);

  vec3 innerLin = pow(max(uColor, vec3(0.0001)), vec3(2.2));
  vec3 rimLin = pow(max(uRimColor, vec3(0.0001)), vec3(2.2));

  float bioPulse = 0.75 + 0.25 * sin(uTime * 2.6 + uPhase + vHeight * 3.2);
  float rimBlend = clamp(fresnel * 0.85 + 0.15 * vPulse + uIsTentacle * 0.12, 0.0, 1.0);
  vec3 col = mix(innerLin, rimLin, rimBlend) * (0.85 + 0.45 * bioPulse);

  float alpha = clamp(mix(0.24, 0.90, clamp(fresnel * 0.78 + 0.22 * bioPulse, 0.0, 1.0)), 0.22, 0.92);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}
`;

  // ---------- Material & Mesh Factories ----------

  function patchMaterialHook(mat, tag, compileFn) {
    if (!mat) return mat;
    const proto = typeof THREE !== 'undefined' && THREE.Material && THREE.Material.prototype;
    const prevKey = typeof mat.customProgramCacheKey === 'function' && (!proto || mat.customProgramCacheKey !== proto.customProgramCacheKey)
      ? mat.customProgramCacheKey
      : null;
    const prevCompile = typeof mat.onBeforeCompile === 'function' && (!proto || mat.onBeforeCompile !== proto.onBeforeCompile)
      ? mat.onBeforeCompile
      : null;

    mat.customProgramCacheKey = function customProgramCacheKey() {
      const base = prevKey ? prevKey.call(this) : '';
      return base ? base + '|' + tag : tag;
    };
    mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
      if (prevCompile) prevCompile.call(this, shader, renderer);
      compileFn(shader, renderer);
    };
    return mat;
  }

  function createTerrainMaterial(textures) {
    const sets = resolveTextureSets(textures);
    const detailMap = (sets && sets.grass && sets.grass.map) || getFallbackTexture(false);
    const rockMap = (sets && sets.rock && sets.rock.map) || getFallbackTexture(false);
    const rockNormal = (sets && sets.rock && sets.rock.normalMap) || getFallbackTexture(true);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
    });
    mat.customProgramCacheKey = () => 'terrain_pbr_v2';

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWaterY = uniforms.uWaterY;
      shader.uniforms.uCamPos = uniforms.uCamPos;
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;
      shader.uniforms.uWindVec = uniforms.uWindVec;
      shader.uniforms.uCloudOffset = uniforms.uCloudOffset;
      shader.uniforms.uDetailMap = { value: detailMap };
      shader.uniforms.uRockMap = { value: rockMap };
      shader.uniforms.uRockNormal = { value: rockNormal };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNorm;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vec4 terrainWorldPos = modelMatrix * vec4( transformed, 1.0 );
vWorldPos = terrainWorldPos.xyz;
vWorldNorm = normalize( ( modelMatrix * vec4( objectNormal, 0.0 ) ).xyz );`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform float uWaterY;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uNightFactor;
uniform vec4 uWindVec;
uniform vec2 uCloudOffset;
uniform sampler2D uDetailMap;
uniform sampler2D uRockMap;
uniform sampler2D uRockNormal;
varying vec3 vWorldPos;
varying vec3 vWorldNorm;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
vec3 tNorm = normalize( vWorldNorm );
float tSlope = 1.0 - clamp( tNorm.y, 0.0, 1.0 );
float rockBlend = smoothstep( 0.18, 0.42, tSlope );

// 3-scale anti-tiling world-space detail albedo (decoded from sRGB to linear)
vec3 detA = pow( max( texture2D( uDetailMap, vWorldPos.xz * 0.14 ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 detB = pow( max( texture2D( uDetailMap, vWorldPos.xz * 0.037 + vec2( 3.7, 7.1 ) ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 detC = pow( max( texture2D( uDetailMap, vWorldPos.xz * 0.011 + vec2( 11.3, 5.9 ) ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 detMix = detA * 0.50 + detB * 0.32 + detC * 0.18;
float detLum = dot( detMix, vec3( 0.299, 0.587, 0.114 ) );
float detContrast = clamp( 0.78 + ( detLum - 0.18 ) * 1.40, 0.62, 1.30 );
vec3 detChroma = mix( vec3( 1.0 ), detMix / max( detLum, 0.06 ), 0.16 );
diffuseColor.rgb *= detContrast * detChroma;

// Triplanar stratified cliff rock bands + moss/snow ledge caps on coastal & alpine faces
float absX = abs( tNorm.x );
float absZ = abs( tNorm.z );
float triW = ( absX * absX ) / max( absX * absX + absZ * absZ, 0.0001 );
vec2 cliffUvA = vec2( vWorldPos.z * 0.085, vWorldPos.y * 0.16 );
vec2 cliffUvB = vec2( vWorldPos.x * 0.085, vWorldPos.y * 0.16 );
vec3 rockA = pow( max( texture2D( uRockMap, cliffUvA ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 rockB = pow( max( texture2D( uRockMap, cliffUvB ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 rockMacro = pow( max( texture2D( uRockMap, vWorldPos.xz * 0.038 ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 rockCol = mix( rockB, rockA, triW ) * ( 0.76 + 0.48 * dot( rockMacro, vec3( 0.333 ) ) );
vec3 rockTinted = mix( rockCol, rockCol * ( 0.65 + 0.70 * diffuseColor.rgb ), 0.30 );
float ledgeCap = rockBlend * ( 1.0 - smoothstep( 0.44, 0.76, tSlope ) );
float snowAlt = smoothstep( 10.5, 14.5, vWorldPos.y );
vec3 mossCap = vec3( 0.12, 0.22, 0.08 );
vec3 snowCap = vec3( 0.78, 0.84, 0.90 );
vec3 ledgeCol = mix( mossCap, snowCap, snowAlt );
float ledgePatch = smoothstep( 0.25, 0.75, dot( detC, vec3( 0.333 ) ) * 2.4 );
rockTinted = mix( rockTinted, ledgeCol, ledgeCap * ledgePatch * 0.42 );
diffuseColor.rgb = mix( diffuseColor.rgb, rockTinted, rockBlend );

// Damp darkened shoreline sand band right above water level (Lake Hylia wet beach transition)
float wetShore = ( 1.0 - smoothstep( 0.0, 0.85, abs( vWorldPos.y - uWaterY ) ) ) * ( 1.0 - rockBlend * 0.55 );
diffuseColor.rgb *= ( 1.0 - wetShore * 0.28 );

// Scrolling projected cloud shadows across hills, meadows & cliffs synced to uCloudOffset
vec2 csUv = ( vWorldPos.xz - uCloudOffset ) * 0.016;
float csA = sin( csUv.x * 1.7 + cos( csUv.y * 1.3 + 0.8 ) ) * 0.5 + 0.5;
float csB = sin( csUv.x * 3.1 - csUv.y * 2.4 + 1.9 ) * 0.5 + 0.5;
float cloudShadow = smoothstep( 0.46, 0.84, csA * 0.62 + csB * 0.38 );
float sunDayVis = ( 1.0 - clamp( uNightFactor, 0.0, 1.0 ) * 0.78 ) * smoothstep( 0.02, 0.25, uSunDir.y );
float aboveWaterT = smoothstep( -0.4, 0.6, vWorldPos.y - uWaterY );
diffuseColor.rgb *= ( 1.0 - cloudShadow * 0.23 * sunDayVis * aboveWaterT );

// Seamless distant meadow turf sheen matching 56..78u grass fade
float farDist = length( vWorldPos.xz - uCamPos.xz );
float farTurf = smoothstep( 44.0, 74.0, farDist ) * ( 1.0 - rockBlend ) * aboveWaterT;
vec2 wDirT = normalize( uWindVec.xy + vec2( 0.0001, 0.0 ) );
float windWaveT = sin( dot( vWorldPos.xz, wDirT ) * 0.20 - uTime * 1.85 - uWindVec.w * 0.6 ) * 0.5 + 0.5;
float turfMask = farTurf * smoothstep( 0.06, 0.34, diffuseColor.g - diffuseColor.b * 0.45 );
diffuseColor.rgb += vec3( 0.042, 0.062, 0.016 ) * ( windWaveT * turfMask * ( 0.45 + 0.55 * clamp( uWindVec.z, 0.0, 1.5 ) ) );

// Animated shallow underwater caustics fading smoothly with depth
float subDepth = uWaterY - vWorldPos.y;
if ( subDepth > -0.15 ) {
  float fadeIn = smoothstep( -0.15, 0.25, subDepth );
  float depthAtten = exp( -max( subDepth, 0.0 ) * 0.24 );
  vec2 cUv = vWorldPos.xz * 0.32 + uSunDir.xz * ( max( subDepth, 0.0 ) * 0.18 );
  float c1 = sin( cUv.x * 2.1 + uTime * 1.4 + cos( cUv.y * 1.9 - uTime * 1.1 ) );
  float c2 = cos( cUv.y * 2.4 - uTime * 1.25 + sin( cUv.x * 1.7 + uTime * 0.95 ) );
  float c3 = sin( ( cUv.x - cUv.y ) * 1.6 + uTime * 0.85 );
  float caustic = pow( clamp( 1.0 - abs( c1 + c2 ) * 0.42, 0.0001, 1.0 ), 4.0 )
                + pow( clamp( 1.0 - abs( c2 - c3 ) * 0.48, 0.0001, 1.0 ), 5.0 ) * 0.55;
  float sunUp = clamp( uSunDir.y * 1.35 + 0.25, 0.15, 1.0 );
  diffuseColor.rgb += vec3( 0.22, 0.46, 0.48 ) * ( caustic * fadeIn * depthAtten * sunUp * 0.62 );
}`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
float wetBand = 1.0 - smoothstep( 0.0, 0.70, abs( vWorldPos.y - uWaterY ) );
float underwaterWet = 1.0 - smoothstep( -0.35, 0.10, vWorldPos.y - uWaterY );
float wetness = max( wetBand, underwaterWet * 0.75 );
roughnessFactor = mix( roughnessFactor, 0.76, rockBlend );
roughnessFactor = mix( roughnessFactor, 0.32, wetness * ( 1.0 - rockBlend * 0.35 ) );`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
vec3 rnFlat = texture2D( uRockNormal, vWorldPos.xz * 0.16 ).xyz * 2.0 - 1.0;
vec3 rnA = texture2D( uRockNormal, cliffUvA ).xyz * 2.0 - 1.0;
vec3 rnB = texture2D( uRockNormal, cliffUvB ).xyz * 2.0 - 1.0;
vec3 rnCliff = mix( rnB, rnA, triW );
vec3 rn = mix( rnFlat, rnCliff, rockBlend );
vec3 refAxis = abs( tNorm.x ) < 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 );
vec3 wT = normalize( cross( tNorm, refAxis ) );
vec3 wB = cross( tNorm, wT );
vec3 wPerturbed = normalize( tNorm + ( wT * rn.x + wB * rn.y ) * ( 0.14 + rockBlend * 0.74 ) );
normal = normalize( ( viewMatrix * vec4( wPerturbed, 0.0 ) ).xyz );
#ifdef DOUBLE_SIDED
  normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
#endif`
        );
    };

    return mat;
  }

  function createWaterMaterial(textures) {
    const sets = resolveTextureSets(textures);
    const waterNormal = (sets && sets.waterNormal && sets.waterNormal.normalMap) || getFallbackTexture(true);

    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uWaterY: uniforms.uWaterY,
        uPlayerPos: uniforms.uPlayerPos,
        uTramplers: uniforms.uTramplers,
        uCamPos: uniforms.uCamPos,
        uSunDir: uniforms.uSunDir,
        uSunColor: uniforms.uSunColor,
        uMoonDir: uniforms.uMoonDir,
        uMoonColor: uniforms.uMoonColor,
        uNightFactor: uniforms.uNightFactor,
        uWindVec: uniforms.uWindVec,
        uSkyTop: uniforms.uSkyTop,
        uSkyBot: uniforms.uSkyBot,
        uProgress: uniforms.uProgress,
        uFogColor: uniforms.uFogColor,
        uFogNear: uniforms.uFogNear,
        uFogFar: uniforms.uFogFar,
        uWaterNormal: { value: waterNormal },
      },
      vertexShader: _WATER_VERT,
      fragmentShader: _WATER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  function createHorizonWaterMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uCamPos: uniforms.uCamPos,
        uSunDir: uniforms.uSunDir,
        uSunColor: uniforms.uSunColor,
        uMoonDir: uniforms.uMoonDir,
        uMoonColor: uniforms.uMoonColor,
        uNightFactor: uniforms.uNightFactor,
        uSkyTop: uniforms.uSkyTop,
        uSkyBot: uniforms.uSkyBot,
        uProgress: uniforms.uProgress,
        uFogColor: uniforms.uFogColor,
        uFogNear: uniforms.uFogNear,
        uFogFar: uniforms.uFogFar,
      },
      vertexShader: _HORIZON_VERT,
      fragmentShader: _HORIZON_FRAG,
      transparent: false,
      side: THREE.DoubleSide,
    });
  }

  function createGrassMaterial(textures) {
    const mat = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.80,
      metalness: 0.0,
    });
    mat.customProgramCacheKey = () => 'grass_wind_v3';

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uPlayerPos = uniforms.uPlayerPos;
      shader.uniforms.uTramplers = uniforms.uTramplers;
      shader.uniforms.uCamPos = uniforms.uCamPos;
      shader.uniforms.uWindVec = uniforms.uWindVec;
      shader.uniforms.uCloudOffset = uniforms.uCloudOffset;
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uSunColor = uniforms.uSunColor;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec3 uPlayerPos;
uniform vec4 uTramplers[16];
uniform vec3 uCamPos;
uniform vec4 uWindVec;
varying float vGrassTip;
varying vec3 vGrassWorld;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float bladeH = clamp( uv.y, 0.0, 1.0 );
float hWeight = bladeH * bladeH;
vGrassTip = bladeH;

vec4 grassBaseWorld = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#ifdef USE_INSTANCING
  grassBaseWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#endif

float camDist = length( grassBaseWorld.xz - uCamPos.xz );
float distScale = 1.0 - smoothstep( 56.0, 78.0, camDist );
transformed *= distScale;`
        )
        .replace(
          '#include <project_vertex>',
          `vec4 gWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  gWorld = instanceMatrix * gWorld;
#endif
gWorld = modelMatrix * gWorld;

// Sweeping travelling wind-gust meadow breeze + fine individual blade flutter
vec2 gWindDir = normalize( uWindVec.xy + vec2( 0.0001, 0.0 ) );
vec2 gWindPerp = vec2( -gWindDir.y, gWindDir.x );
float gWindStr = max( 0.25, uWindVec.z );
float wProj = dot( grassBaseWorld.xz, gWindDir );
float swell = sin( wProj * 0.16 - uTime * 1.90 - uWindVec.w );
float gust = sin( grassBaseWorld.x * 0.32 - grassBaseWorld.z * 0.22 - uTime * 2.65 ) * 0.55;
float flutter = cos( grassBaseWorld.x * 0.95 - grassBaseWorld.z * 0.82 + uTime * 4.8 ) * 0.32;
vec2 gWindPush = gWindDir * ( ( swell * 0.23 + gust * 0.13 + 0.06 ) * gWindStr )
               + gWindPerp * ( flutter * 0.075 * gWindStr );
gWindPush *= hWeight * distScale;

gWorld.x += gWindPush.x;
gWorld.z += gWindPush.y;
gWorld.y -= ( abs( gWindPush.x ) + abs( gWindPush.y ) ) * 0.22;

// Responsive step-parting trample around the Starkeeper AND up to 16 nearby creatures!
vec2 totalPush = vec2( 0.0 );
float totalBow = 0.0;

vec2 away = gWorld.xz - uPlayerPos.xz;
float pDist = length( away );
float trample = ( 1.0 - smoothstep( 0.15, 2.05, pDist ) ) * hWeight * distScale;
if ( pDist > 0.001 && trample > 0.001 ) {
  float vertMask = 1.0 - smoothstep( 1.6, 2.8, abs( grassBaseWorld.y - uPlayerPos.y ) );
  float tPush = trample * vertMask;
  totalPush += ( away / pDist ) * ( tPush * 0.78 );
  totalBow = max( totalBow, tPush * 0.42 );
}

for ( int i = 0; i < 16; i++ ) {
  vec4 tr = uTramplers[ i ];
  if ( tr.w > 0.05 ) {
    vec2 cAway = gWorld.xz - tr.xz;
    float cDist = length( cAway );
    if ( cDist > 0.001 && cDist < tr.w ) {
      float cTrample = ( 1.0 - smoothstep( 0.08, 1.0, cDist / tr.w ) ) * hWeight * distScale;
      float cVert = 1.0 - smoothstep( 1.1, 2.2, abs( grassBaseWorld.y - tr.y ) );
      float cPush = cTrample * cVert;
      float strength = clamp( tr.w * 0.46, 0.38, 0.78 );
      totalPush += ( cAway / cDist ) * ( cPush * strength );
      totalBow = max( totalBow, cPush * ( strength * 0.56 ) );
    }
  }
}

float pushLen = length( totalPush );
if ( pushLen > 0.92 ) {
  totalPush *= ( 0.92 / pushLen );
}
gWorld.xz += totalPush;
gWorld.y -= totalBow;
vGrassWorld = gWorld.xyz;

vec4 mvPosition = viewMatrix * gWorld;
gl_Position = projectionMatrix * mvPosition;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
  vec4 worldPosition = gWorld;
#endif`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNightFactor;
uniform vec2 uCloudOffset;
varying float vGrassTip;
varying vec3 vGrassWorld;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
// Cloud shadow modulation matching terrain
vec2 gCsUv = ( vGrassWorld.xz - uCloudOffset ) * 0.016;
float gCsA = sin( gCsUv.x * 1.7 + cos( gCsUv.y * 1.3 + 0.8 ) ) * 0.5 + 0.5;
float gCsB = sin( gCsUv.x * 3.1 - gCsUv.y * 2.4 + 1.9 ) * 0.5 + 0.5;
float gCloudSh = smoothstep( 0.46, 0.84, gCsA * 0.62 + gCsB * 0.38 );
float gSunUp = ( 1.0 - clamp( uNightFactor, 0.0, 1.0 ) * 0.78 ) * smoothstep( 0.02, 0.25, uSunDir.y );
diffuseColor.rgb *= ( 1.0 - gCloudSh * 0.22 * gSunUp );

// Warm sun-backlit subsurface tip translucency
vec3 gView = normalize( uCamPos - vGrassWorld );
vec3 gSun = normalize( uSunDir );
float gBack = pow( max( dot( gView, -gSun ), 0.0001 ), 3.0 );
vec3 gSunLin = pow( max( uSunColor, vec3( 0.0001 ) ), vec3( 2.2 ) );
diffuseColor.rgb += gSunLin * ( diffuseColor.rgb * gBack * vGrassTip * gSunUp * 0.46 );`
        );
    };

    return mat;
  }

  function patchTreeWind(mat, isFoliage = true) {
    if (!mat) return mat;
    const cacheKey = isFoliage ? 'tree_foliage_wind_v3' : 'tree_trunk_wind_v3';

    return patchMaterialHook(mat, cacheKey, (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWindVec = uniforms.uWindVec;
      shader.uniforms.uCamPos = uniforms.uCamPos;
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uSunColor = uniforms.uSunColor;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;

      const foliageMotion = isFoliage
        ? `
// Outer branches, drooping pine boughs & flexible top spire gently sway; inner trunk attachment stays calm
float boughWeight = max( smoothstep( 0.45, 2.40, radialDist ), smoothstep( 7.8, 12.0, hAboveBase ) * 0.48 );
vec2 boughSway = tWindDir * ( ( swell * 0.12 + gust * 0.07 + 0.02 ) * tWindStr * boughWeight )
               + tWindPerp * ( ( sin( treeBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.07 + gust * 0.035 ) * tWindStr * boughWeight );
tWorld.x += boughSway.x;
tWorld.z += boughSway.y;
tWorld.y -= ( abs( boughSway.x ) + abs( boughSway.y ) ) * 0.14;

// Outer leaf sprigs & pine needle clusters rustle briskly as wind gusts pass through the crown
float radialOut = clamp( radialDist / 2.2, 0.18, 1.35 );
float leafPhase = tWorld.x * 2.1 + tWorld.y * 1.7 + tWorld.z * 2.3;
float f1 = sin( leafPhase + uTime * 3.9 );
float f2 = cos( leafPhase * 1.6 - uTime * 5.7 ) * 0.45;
float flutterAmp = ( 0.055 + 0.045 * max( 0.0, swell ) ) * tWindStr * radialOut * clamp( hAboveBase / 1.8, 0.0, 1.0 );
tWorld.x += ( f1 + f2 ) * flutterAmp;
tWorld.y += sin( leafPhase * 1.3 + uTime * 4.6 ) * ( flutterAmp * 0.72 );
tWorld.z += ( cos( leafPhase + uTime * 4.2 ) - f2 ) * flutterAmp;
vTreeLeafWorld = tWorld.xyz;`
        : `
// Subtle outer-limb tip flex only on high forked wooden boughs (main mature trunk core stays rigid)
float limbWeight = smoothstep( 0.55, 1.85, radialDist ) * smoothstep( 3.6, 6.2, hAboveBase );
tWorld.x += ( swell * 0.05 + gust * 0.028 ) * tWindStr * limbWeight;
tWorld.z += ( sin( treeBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.035 ) * tWindStr * limbWeight;`;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec4 uWindVec;${isFoliage ? '\nvarying vec3 vTreeLeafWorld;' : ''}`
        )
        .replace(
          '#include <project_vertex>',
          `vec4 treeBaseWorld = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
float treeScale = 1.0;
#ifdef USE_INSTANCING
  treeBaseWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  treeScale = length( instanceMatrix[0].xyz );
#endif
vec4 tWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  tWorld = instanceMatrix * tWorld;
#endif
tWorld = modelMatrix * tWorld;

// Cohesive meadow breeze: mature oak & pine trunks stand rock-steady; only young saplings gently flex
float hAboveBase = max( 0.0, tWorld.y - treeBaseWorld.y );
float radialDist = length( tWorld.xz - treeBaseWorld.xz );
vec2 tWindDir = normalize( uWindVec.xy + vec2( 0.0001, 0.0 ) );
vec2 tWindPerp = vec2( -tWindDir.y, tWindDir.x );
float tWindStr = max( 0.30, uWindVec.z );
float swell = sin( dot( treeBaseWorld.xz, tWindDir ) * 0.16 - uTime * 1.85 - uWindVec.w );
float gust = sin( treeBaseWorld.x * 0.32 - treeBaseWorld.z * 0.22 - uTime * 2.6 ) * 0.55;

float saplingFlex = 1.0 - smoothstep( 0.44, 0.74, treeScale );
float stemH = clamp( hAboveBase / 6.8, 0.0, 1.2 );
float saplingW = saplingFlex * stemH * stemH * tWindStr;
vec2 sapSway = tWindDir * ( ( swell * 0.09 + gust * 0.05 + 0.015 ) * saplingW )
             + tWindPerp * ( ( sin( treeBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.05 ) * saplingW );

tWorld.x += sapSway.x;
tWorld.z += sapSway.y;
tWorld.y -= ( abs( sapSway.x ) + abs( sapSway.y ) ) * 0.14;${foliageMotion}

vec4 mvPosition = viewMatrix * tWorld;
gl_Position = projectionMatrix * mvPosition;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
  vec4 worldPosition = tWorld;
#endif`
        );

      if (isFoliage) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNightFactor;
varying vec3 vTreeLeafWorld;`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
vec3 tView = normalize( uCamPos - vTreeLeafWorld );
vec3 tSun = normalize( uSunDir );
float tBack = pow( max( dot( tView, -tSun ), 0.0001 ), 2.6 );
float tSunUp = ( 1.0 - clamp( uNightFactor, 0.0, 1.0 ) * 0.78 ) * smoothstep( -0.05, 0.25, tSun.y );
vec3 tSunLin = pow( max( uSunColor, vec3( 0.0001 ) ), vec3( 2.2 ) );
diffuseColor.rgb += tSunLin * ( diffuseColor.rgb * tBack * tSunUp * 0.34 );`
          );
      }
    });
  }

  function patchFoliageReactive(mat, opts) {
    if (!mat) return mat;
    const cfg = opts || {};
    const amp = cfg.amp !== undefined ? cfg.amp : 0.14;
    const heightScale = cfg.heightScale !== undefined ? cfg.heightScale : 1.25;
    const useUvY = !!cfg.useUvY;
    const tag = cfg.tag || 'foliage_reactive_v1';

    return patchMaterialHook(mat, tag, (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWindVec = uniforms.uWindVec;
      shader.uniforms.uPlayerPos = uniforms.uPlayerPos;
      shader.uniforms.uTramplers = uniforms.uTramplers;
      shader.uniforms.uCamPos = uniforms.uCamPos;
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uSunColor = uniforms.uSunColor;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;

      const flexExpr = useUvY
        ? 'clamp( uv.y, 0.0, 1.0 )'
        : `clamp( position.y / ${Math.max(0.1, heightScale).toFixed(3)}, 0.0, 1.0 )`;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec4 uWindVec;
uniform vec3 uPlayerPos;
uniform vec4 uTramplers[16];
varying float vFolTip;
varying vec3 vFolWorld;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float folFlex = ${flexExpr};
float folWeight = folFlex * folFlex;
vFolTip = folFlex;

vec4 folBaseWorld = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#ifdef USE_INSTANCING
  folBaseWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#endif`
        )
        .replace(
          '#include <project_vertex>',
          `vec4 fWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  fWorld = instanceMatrix * fWorld;
#endif
fWorld = modelMatrix * fWorld;

// Cohesive wind gust sway + crisp tip flutter
vec2 fWindDir = normalize( uWindVec.xy + vec2( 0.0001, 0.0 ) );
vec2 fWindPerp = vec2( -fWindDir.y, fWindDir.x );
float fWindStr = max( 0.25, uWindVec.z );
float fWave = sin( dot( folBaseWorld.xz, fWindDir ) * 0.20 - uTime * 2.05 - uWindVec.w ) * 0.68
            + cos( fWorld.x * 1.15 - fWorld.z * 0.95 + uTime * 3.8 ) * 0.32;
vec2 fGust = ( fWindDir * fWave + fWindPerp * ( sin( fWorld.z * 1.3 + uTime * 3.1 ) * 0.25 ) )
           * ( ${(amp).toFixed(4)} * fWindStr * folWeight );
fWorld.xz += fGust;
fWorld.y -= length( fGust ) * 0.18;

// Proximity parting from Starkeeper and nearby creatures
vec2 fPush = vec2( 0.0 );
float fBow = 0.0;

vec2 fpAway = fWorld.xz - uPlayerPos.xz;
float fpDist = length( fpAway );
float fpTrample = ( 1.0 - smoothstep( 0.18, 2.25, fpDist ) ) * folWeight;
if ( fpDist > 0.001 && fpTrample > 0.001 ) {
  float fpVert = 1.0 - smoothstep( 1.6, 2.8, abs( folBaseWorld.y - uPlayerPos.y ) );
  float fpAmt = fpTrample * fpVert;
  fPush += ( fpAway / fpDist ) * ( fpAmt * 0.72 );
  fBow = max( fBow, fpAmt * 0.34 );
}

for ( int i = 0; i < 16; i++ ) {
  vec4 ftr = uTramplers[ i ];
  if ( ftr.w > 0.05 ) {
    vec2 fcAway = fWorld.xz - ftr.xz;
    float fcDist = length( fcAway );
    if ( fcDist > 0.001 && fcDist < ftr.w ) {
      float fcTrample = ( 1.0 - smoothstep( 0.10, 1.0, fcDist / ftr.w ) ) * folWeight;
      float fcVert = 1.0 - smoothstep( 1.1, 2.2, abs( folBaseWorld.y - ftr.y ) );
      float fcAmt = fcTrample * fcVert;
      float fStr = clamp( ftr.w * 0.42, 0.32, 0.68 );
      fPush += ( fcAway / fcDist ) * ( fcAmt * fStr );
      fBow = max( fBow, fcAmt * ( fStr * 0.45 ) );
    }
  }
}

float fPushLen = length( fPush );
if ( fPushLen > 0.85 ) {
  fPush *= ( 0.85 / fPushLen );
}
fWorld.xz += fPush;
fWorld.y -= fBow;
vFolWorld = fWorld.xyz;

vec4 mvPosition = viewMatrix * fWorld;
gl_Position = projectionMatrix * mvPosition;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
  vec4 worldPosition = fWorld;
#endif`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNightFactor;
varying float vFolTip;
varying vec3 vFolWorld;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
vec3 fView = normalize( uCamPos - vFolWorld );
vec3 fSun = normalize( uSunDir );
float fBack = pow( max( dot( fView, -fSun ), 0.0001 ), 2.6 );
float fSunUp = ( 1.0 - clamp( uNightFactor, 0.0, 1.0 ) * 0.78 ) * smoothstep( -0.05, 0.25, fSun.y );
vec3 fSunLin = pow( max( uSunColor, vec3( 0.0001 ) ), vec3( 2.2 ) );
diffuseColor.rgb += fSunLin * ( diffuseColor.rgb * fBack * vFolTip * fSunUp * 0.48 );`
        );
    });
  }

  function patchUnderwaterCaustics(mat, opts) {
    if (!mat) return mat;
    const cfg = opts || {};
    const intensity = cfg.intensity !== undefined ? cfg.intensity : 0.72;
    const tag = cfg.tag || 'underwater_caustics_v1';

    return patchMaterialHook(mat, tag, (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWaterY = uniforms.uWaterY;
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vCausticWorldPos;
varying vec3 vCausticWorldNorm;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vec4 cwPos = vec4( transformed, 1.0 );
vec3 cwNorm = objectNormal;
#ifdef USE_INSTANCING
  cwPos = instanceMatrix * cwPos;
  cwNorm = ( instanceMatrix * vec4( cwNorm, 0.0 ) ).xyz;
#endif
cwPos = modelMatrix * cwPos;
vCausticWorldPos = cwPos.xyz;
vCausticWorldNorm = normalize( ( modelMatrix * vec4( cwNorm, 0.0 ) ).xyz );`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform float uWaterY;
uniform vec3 uSunDir;
uniform float uNightFactor;
varying vec3 vCausticWorldPos;
varying vec3 vCausticWorldNorm;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
float cSubDepth = uWaterY - vCausticWorldPos.y;
if ( cSubDepth > -0.25 ) {
  float cFadeIn = smoothstep( -0.25, 0.30, cSubDepth );
  float cDepthAtten = exp( -max( cSubDepth, 0.0 ) * 0.16 );
  float cUpFace = smoothstep( -0.25, 0.65, normalize( vCausticWorldNorm ).y );
  vec2 cUvA = vCausticWorldPos.xz * 0.36 + uSunDir.xz * ( max( cSubDepth, 0.0 ) * 0.18 );
  vec2 cUvB = vCausticWorldPos.xz * 0.52 - uSunDir.xz * ( max( cSubDepth, 0.0 ) * 0.12 );
  float cL1 = sin( cUvA.x * 2.2 + uTime * 1.45 + cos( cUvA.y * 1.95 - uTime * 1.15 ) );
  float cL2 = cos( cUvA.y * 2.45 - uTime * 1.30 + sin( cUvA.x * 1.75 + uTime * 0.95 ) );
  float cL3 = sin( ( cUvB.x - cUvB.y ) * 1.85 + uTime * 1.05 );
  float cL4 = cos( ( cUvB.x + cUvB.y ) * 2.15 - uTime * 1.38 );
  float causticPattern = pow( clamp( 1.0 - abs( cL1 + cL2 ) * 0.42, 0.0001, 1.0 ), 4.0 )
                       + pow( clamp( 1.0 - abs( cL3 - cL4 ) * 0.46, 0.0001, 1.0 ), 5.0 ) * 0.62;
  float cLightUp = mix( 0.28, 1.0, smoothstep( -0.05, 0.45, uSunDir.y ) ) * ( 1.0 - clamp( uNightFactor, 0.0, 1.0 ) * 0.55 );
  vec3 cTint = mix( vec3( 0.26, 0.56, 0.62 ), vec3( 0.18, 0.40, 0.58 ), clamp( uNightFactor, 0.0, 1.0 ) );
  diffuseColor.rgb += cTint * ( causticPattern * cFadeIn * cDepthAtten * ( 0.25 + 0.75 * cUpFace ) * cLightUp * ${(intensity).toFixed(3)} );
}`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
float cWet = smoothstep( -0.35, 0.25, uWaterY - vCausticWorldPos.y );
roughnessFactor = mix( roughnessFactor, min( roughnessFactor, 0.34 ), cWet * 0.65 );`
        );
    });
  }

  function createStarfieldMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uSunDir: uniforms.uSunDir,
        uMoonDir: uniforms.uMoonDir,
        uStarAlpha: { value: 1.0 },
      },
      vertexShader: _STARFIELD_VERT,
      fragmentShader: _STARFIELD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
  }

  function createCloudMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uCamPos: uniforms.uCamPos,
        uSunDir: uniforms.uSunDir,
        uSunColor: uniforms.uSunColor,
        uMoonDir: uniforms.uMoonDir,
        uMoonColor: uniforms.uMoonColor,
        uNightFactor: uniforms.uNightFactor,
        uSkyTop: uniforms.uSkyTop,
        uSkyBot: uniforms.uSkyBot,
        uProgress: uniforms.uProgress,
        uWindVec: uniforms.uWindVec,
        uCloudOffset: uniforms.uCloudOffset,
        uFogColor: uniforms.uFogColor,
        uFogNear: uniforms.uFogNear,
        uFogFar: uniforms.uFogFar,
      },
      vertexShader: _CLOUD_VERT,
      fragmentShader: _CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      side: typeof THREE.FrontSide !== 'undefined' ? THREE.FrontSide : 0,
      fog: false,
    });
  }

  function patchClothFlow(mat, opts) {
    if (!mat) return mat;
    const cfg = opts || {};
    const amp = cfg.amp !== undefined ? cfg.amp : 0.036;
    const freq = cfg.freq !== undefined ? cfg.freq : 5.4;
    const phaseOff = cfg.phase !== undefined ? cfg.phase : 0.0;
    const continuousBend = !!cfg.continuousBend;
    const bendOffset = cfg.bendOffset !== undefined ? cfg.bendOffset : 0.0;
    const goldHem = !!cfg.goldHem;
    const cacheTag = cfg.tag || 'cloth_flow_v1';

    mat.customProgramCacheKey = () => cacheTag;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uClothMotion = uniforms.uClothMotion;
      shader.uniforms.uClothCurve = uniforms.uClothCurve;

      const bendNormalBlock = continuousBend
        ? `
float cLift = clamp( uClothCurve.x + ${(bendOffset).toFixed(3)}, 0.16, 1.48 );
float cDroop = uClothCurve.y;
float cAng = clamp( cLift * ( 0.42 + 0.58 * pow( max( cPin, 0.0001 ), 0.68 ) ) - cDroop * cFlex * 0.48, 0.14, 1.45 );
float cCosA = cos( cAng );
float cSinA = sin( cAng );
float cOnY = objectNormal.y * cCosA - objectNormal.z * cSinA;
float cOnZ = objectNormal.y * cSinA + objectNormal.z * cCosA;
objectNormal = normalize( vec3( objectNormal.x, cOnY, cOnZ ) + vec3( -cSlopeX * 0.80, cSlopeY * 0.45 * cSinA, cSlopeY * 0.45 * cCosA ) );`
        : `
objectNormal = normalize( objectNormal + vec3( -cSlopeX * 0.85, cSlopeY * 0.55, 0.0 ) );`;

      const bendVertexBlock = continuousBend
        ? `
float cDist = max( 0.0, -transformed.y );
float cOrigZ = transformed.z;
float cRipple = cWave * cAmp;
transformed.y = -cDist * cCosA + cRipple * cSinA;
transformed.z = cOrigZ - cDist * cSinA + cRipple * cCosA;
transformed.x += uClothCurve.z * cFlex * 0.36 + sin( cPhaseA * 0.72 + 0.9 ) * cAmp * 0.38;`
        : `
transformed.z += cWave * cAmp - ( cSpd * 0.022 + cFall * 0.032 ) * cFlex;
transformed.x += ( sin( cPhaseA * 0.72 + 0.9 ) * cAmp * 0.42 + cSpin * 0.045 * cFlex );
transformed.y += ( cFall * 0.028 + abs( cWave ) * cAmp * 0.18 ) * cFlex;`;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec4 uClothMotion;
uniform vec4 uClothCurve;${goldHem ? '\nvarying float vClothV;' : ''}`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
#ifdef USE_UV
  float cPin = clamp( 1.0 - uv.y, 0.0, 1.0 );
#else
  float cPin = clamp( -position.y * 1.05, 0.0, 1.0 );
#endif
${goldHem ? 'vClothV = 1.0 - cPin;' : ''}
float cFlex = cPin * cPin;
float cSpd = clamp( uClothMotion.x, 0.0, 1.8 );
float cFall = clamp( -uClothMotion.y, 0.0, 1.5 );
float cSpin = clamp( uClothMotion.z, -1.5, 1.5 );
float cWind = max( 0.22, uClothMotion.w );
float cRate = ${(freq).toFixed(3)} + cSpd * 4.6 + cFall * 3.8;
float cPhaseA = position.x * 11.5 + cPin * 6.8 - uTime * cRate + ${(phaseOff).toFixed(3)};
float cPhaseB = position.x * 18.0 - cPin * 9.2 - uTime * ( cRate * 1.27 ) + ${(phaseOff + 1.7).toFixed(3)};
float cAmp = ${(amp).toFixed(4)} * ( cWind + cSpd * 0.95 + cFall * 0.85 + abs( cSpin ) * 0.55 + uClothCurve.w * 0.45 ) * cFlex;
float cWave = sin( cPhaseA ) * 0.68 + cos( cPhaseB ) * 0.32;
float cSlopeX = ( cos( cPhaseA ) * 11.5 * 0.68 - sin( cPhaseB ) * 18.0 * 0.32 ) * cAmp;
float cSlopeY = ( cos( cPhaseA ) * 6.8 * 0.68 + sin( cPhaseB ) * 9.2 * 0.32 ) * cAmp;${bendNormalBlock}`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>${bendVertexBlock}`
        );

      if (goldHem) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
varying float vClothV;`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
float cHemBand = 1.0 - smoothstep( 0.026, 0.044, vClothV );
float cGoldPip = smoothstep( 0.056, 0.064, vClothV ) * ( 1.0 - smoothstep( 0.068, 0.076, vClothV ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.62, 0.10 ), clamp( cHemBand + cGoldPip * 0.65, 0.0, 1.0 ) );`
          );
      }
    };
    return mat;
  }

  function createKelpMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2e8b66,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.02,
    });
    mat.customProgramCacheKey = () => 'kelp_sway_v1';

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uCamPos = uniforms.uCamPos;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec3 uCamPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float kelpH = clamp( uv.y, 0.0, 1.0 );
vec4 kelpBaseWorld = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#ifdef USE_INSTANCING
  kelpBaseWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#endif
float kelpFade = 1.0 - smoothstep( 52.0, 74.0, length( kelpBaseWorld.xz - uCamPos.xz ) );
transformed *= kelpFade;`
        )
        .replace(
          '#include <project_vertex>',
          `vec4 kWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  kWorld = instanceMatrix * kWorld;
#endif
kWorld = modelMatrix * kWorld;

float phase = kelpBaseWorld.x * 0.37 + kelpBaseWorld.z * 0.29 + kelpH * 3.4;
float swayX = sin( phase + uTime * 1.15 ) * 0.24 * kelpH * kelpFade;
float swayZ = cos( phase * 0.85 - uTime * 0.92 ) * 0.18 * kelpH * kelpFade;
kWorld.x += swayX;
kWorld.z += swayZ;

vec4 mvPosition = viewMatrix * kWorld;
gl_Position = projectionMatrix * mvPosition;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
  vec4 worldPosition = kWorld;
#endif`
        );
    };

    return mat;
  }

  function createJellyMaterial(colorHex, opts) {
    const cfg = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uColor: { value: makeColor(colorHex != null ? colorHex : 0x8fbdf7) },
        uRimColor: { value: makeColor(cfg.rimColor != null ? cfg.rimColor : 0xc8f6ff) },
        uIsTentacle: { value: cfg.isTentacle ? 1.0 : 0.0 },
        uPhase: { value: cfg.phase || 0.0 },
      },
      vertexShader: _JELLY_VERT,
      fragmentShader: _JELLY_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
  }

  function createSkyDome() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uSunDir: uniforms.uSunDir,
        uSunColor: uniforms.uSunColor,
        uMoonDir: uniforms.uMoonDir,
        uMoonColor: uniforms.uMoonColor,
        uNightFactor: uniforms.uNightFactor,
        uCloudOffset: uniforms.uCloudOffset,
        uSkyTop: uniforms.uSkyTop,
        uSkyMid: uniforms.uSkyMid,
        uSkyBot: uniforms.uSkyBot,
        uProgress: uniforms.uProgress,
        uFogColor: uniforms.uFogColor,
      },
      vertexShader: _SKY_VERT,
      fragmentShader: _SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    const geometry = new THREE.SphereGeometry(460, 32, 20);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;

    return { mesh, material };
  }

  function createGlowSprite(color, size, opacity, sparkle = false) {
    const tex = typeof Textures !== 'undefined'
      ? (sparkle ? Textures.sparkleSprite : Textures.glowSprite)
      : null;

    const matOpts = {
      color: color !== undefined ? color : 0xffd93b,
      transparent: true,
      opacity: opacity !== undefined ? opacity : 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    };
    if (tex) {
      matOpts.map = tex;
    }

    const material = new THREE.SpriteMaterial(matOpts);
    const sprite = new THREE.Sprite(material);
    const s = size !== undefined ? size : 1;
    sprite.scale.set(s, s, 1);
    return sprite;
  }

  // ---------- Per-Frame Zero-GC Uniform Sync ----------

  function update(time, playerPos, camPos, sunDir, progress, skyTop, skyMid, skyBot, fogColor, fogNear, fogFar) {
    uniforms.uTime.value = time || 0;

    if (playerPos) {
      uniforms.uPlayerPos.value.set(playerPos.x, playerPos.y, playerPos.z);
    }
    if (camPos) {
      uniforms.uCamPos.value.set(camPos.x, camPos.y, camPos.z);
    }
    if (sunDir) {
      uniforms.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
      if (uniforms.uSunDir.value.lengthSq() > 0) {
        uniforms.uSunDir.value.normalize();
      }
    }

    const p = progress !== undefined && progress !== null
      ? (progress < 0 ? 0 : (progress > 1 ? 1 : progress))
      : uniforms.uProgress.value;
    uniforms.uProgress.value = p;
    if (!_celestialDriven) {
      const nf = 1 - p / 0.7;
      uniforms.uNightFactor.value = nf < 0 ? 0 : (nf > 1 ? 1 : nf);
    }

    if (typeof uniforms.uSunColor.value.lerpColors === 'function') {
      uniforms.uSunColor.value.lerpColors(_sunTwilight, _sunDay, p);
    }

    setColorInPlace(uniforms.uSkyTop.value, skyTop);
    setColorInPlace(uniforms.uSkyBot.value, skyBot);
    if (skyMid !== undefined && skyMid !== null) {
      setColorInPlace(uniforms.uSkyMid.value, skyMid);
    } else if (typeof uniforms.uSkyMid.value.lerpColors === 'function') {
      uniforms.uSkyMid.value.lerpColors(uniforms.uSkyBot.value, uniforms.uSkyTop.value, 0.42);
    }

    setColorInPlace(uniforms.uFogColor.value, fogColor);
    if (fogNear !== undefined && fogNear !== null) {
      uniforms.uFogNear.value = fogNear;
    }
    if (fogFar !== undefined && fogFar !== null) {
      uniforms.uFogFar.value = fogFar;
    }
  }

  return {
    uniforms,
    MAX_TRAMPLERS,
    setTrampler,
    clearTramplersFrom,
    setClothMotion,
    setClothCurve,
    setCelestial,
    setWind,
    waterHeightAt,
    createTerrainMaterial,
    createWaterMaterial,
    createHorizonWaterMaterial,
    createGrassMaterial,
    patchTreeWind,
    patchFoliageReactive,
    patchUnderwaterCaustics,
    patchClothFlow,
    createKelpMaterial,
    createJellyMaterial,
    createStarfieldMaterial,
    createCloudMaterial,
    createSkyDome,
    createGlowSprite,
    update,
    _WATER_VERT,
    _WATER_FRAG,
    _HORIZON_VERT,
    _HORIZON_FRAG,
    _SKY_VERT,
    _SKY_FRAG,
    _JELLY_VERT,
    _JELLY_FRAG,
    _STARFIELD_VERT,
    _STARFIELD_FRAG,
    _CLOUD_VERT,
    _CLOUD_FRAG,
  };
})();
