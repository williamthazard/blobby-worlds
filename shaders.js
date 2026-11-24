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
  };

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

  // ---------- Synchronized Water Wave Height ----------

  function waterHeightAt(x, z, time) {
    return (
      uniforms.uWaterY.value +
      Math.sin(x * 0.21 + z * 0.09 + time * 1.45) * 0.065 +
      Math.cos(x * 0.11 - z * 0.24 + time * 1.15) * 0.045 +
      Math.sin((x + z) * 0.36 - time * 1.9) * 0.022
    );
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

float waveHeight(vec2 xz, float t) {
  return sin(xz.x * 0.21 + xz.y * 0.09 + t * 1.45) * 0.065
       + cos(xz.x * 0.11 - xz.y * 0.24 + t * 1.15) * 0.045
       + sin((xz.x + xz.y) * 0.36 - t * 1.90) * 0.022;
}

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float x = worldPos.x;
  float z = worldPos.z;

  float h = waveHeight(worldPos.xz, uTime);
  worldPos.y = uWaterY + h;

  float p1 = x * 0.21 + z * 0.09 + uTime * 1.45;
  float p2 = x * 0.11 - z * 0.24 + uTime * 1.15;
  float p3 = (x + z) * 0.36 - uTime * 1.90;

  float dhdx = 0.21 * 0.065 * cos(p1) - 0.11 * 0.045 * sin(p2) + 0.36 * 0.022 * cos(p3);
  float dhdz = 0.09 * 0.065 * cos(p1) + 0.24 * 0.045 * sin(p2) + 0.36 * 0.022 * cos(p3);

  vWorldPos = worldPos.xyz;
  vDepth = worldPos.y - aBedHeight;
  vWaveNormal = normalize(vec3(-dhdx, 1.0, -dhdz));

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

  const _WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uWaterY;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
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

void main() {
  vec2 uvA = vWorldPos.xz * 0.11 + vec2(uTime * 0.042, uTime * 0.028);
  vec2 uvB = vWorldPos.xz * 0.17 + vec2(-uTime * 0.031, uTime * 0.036);

  vec3 nA = texture2D(uWaterNormal, uvA).xyz * 2.0 - 1.0;
  vec3 nB = texture2D(uWaterNormal, uvB).xyz * 2.0 - 1.0;
  vec2 ripple = (nA.xy + nB.xy) * 0.24;

  vec3 N = normalize(vec3(vWaveNormal.x + ripple.x, vWaveNormal.y, vWaveNormal.z + ripple.y));
  vec3 V = normalize(uCamPos - vWorldPos);
  if (dot(N, V) < 0.0) {
    N = -N;
  }

  float fresnel = pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 3.4);

  // Depth-based light absorption (clear Lake Hylia turquoise shallows revealing the Sunken City below!)
  float depth = max(vDepth, 0.0);
  float absorb = 1.0 - exp(-depth * 0.25);
  vec3 shallowCol = vec3(0.036, 0.35, 0.39);
  vec3 deepCol = vec3(0.012, 0.088, 0.16);
  vec3 waterBody = mix(shallowCol, deepCol, absorb);

  // Sky reflection (convert sRGB sky uniforms to linear)
  vec3 skyTopLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 skyBotLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));
  vec3 R = reflect(-V, N);
  float reflUp = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyRefl = mix(skyBotLin, skyTopLin, pow(max(reflUp, 0.0001), 0.78));

  // Subsurface sun scatter in wave crests
  vec3 L = normalize(uSunDir);
  vec3 sunColLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));
  float sss = pow(max(dot(V, -L + N * 0.45), 0.0001), 3.0) * (1.0 - absorb * 0.55);
  waterBody += vec3(0.05, 0.24, 0.26) * sss;

  vec3 col = mix(waterBody, skyRefl, clamp(fresnel * 0.78 + 0.08, 0.0, 0.92));

  // Tight + broad sun specular sparkle
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0001);
  float dayBoost = mix(0.55, 1.2, clamp(uProgress, 0.0, 1.0));
  float specTight = pow(ndh, 240.0) * 2.4 * dayBoost;
  float specBroad = pow(ndh, 38.0) * 0.20 * dayBoost;
  col += sunColLin * (specTight + specBroad);

  // Organic lacy shoreline foam tight along beaches & submerged rocks
  float shoreZone = 1.0 - smoothstep(0.01, 0.58, vDepth);
  float surfNoise = (nA.x * 0.55 + nB.y * 0.45) * 0.5 + 0.5;
  float laceWave = sin(vWorldPos.x * 2.4 - vWorldPos.z * 1.8 - uTime * 2.2 + surfNoise * 4.2) * 0.5 + 0.5;
  float edgeSurge = 1.0 - smoothstep(0.0, 0.24 + laceWave * 0.18, vDepth);
  float foamField = shoreZone * (0.38 + 0.62 * surfNoise) * (0.45 + 0.55 * laceWave) + edgeSurge * 0.65;
  float foam = smoothstep(0.48, 0.82, foamField);
  float edgeFade = smoothstep(-0.08, 0.04, vDepth);
  foam *= edgeFade;

  vec3 foamCol = mix(vec3(0.40, 0.54, 0.68), vec3(0.84, 0.92, 0.97), clamp(uProgress, 0.0, 1.0));
  col = mix(col, foamCol, foam * 0.85);

  float alpha = mix(0.42, 0.86, clamp(absorb * 0.80 + fresnel * 0.36, 0.0, 1.0));
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

  float fresnel = pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 3.4);
  vec3 deepCol = vec3(0.008, 0.042, 0.11);

  vec3 skyTopLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 skyBotLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(skyBotLin, skyTopLin, pow(clamp(R.y * 0.5 + 0.5, 0.0001, 1.0), 0.78));

  vec3 col = mix(deepCol, skyRefl, clamp(fresnel * 0.80 + 0.10, 0.0, 0.94));

  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);
  vec3 sunColLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));
  float dayBoost = mix(0.55, 1.2, clamp(uProgress, 0.0, 1.0));
  col += sunColLin * pow(max(dot(N, H), 0.0001), 96.0) * 0.45 * dayBoost;

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

  vec3 topLin = pow(max(uSkyTop, vec3(0.0001)), vec3(2.2));
  vec3 midLin = pow(max(uSkyMid, vec3(0.0001)), vec3(2.2));
  vec3 botLin = pow(max(uSkyBot, vec3(0.0001)), vec3(2.2));
  vec3 sunLin = pow(max(uSunColor, vec3(0.0001)), vec3(2.2));

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

  // Mie forward scatter + moon-to-sun transition (truly dark starless night at p=0 -> warm dawn -> radiant day at p=1!)
  vec3 sunDir = normalize(uSunDir);
  float sunDot = max(dot(dir, sunDir), 0.0001);
  float horizonBand = pow(max(1.0 - abs(dir.y), 0.0001), 4.2);

  float dawnArc = sin(p * 3.14159265);
  float mieGlow = pow(sunDot, 7.0) * mix(0.03, 0.56, p) + pow(sunDot, 42.0) * mix(0.05, 0.85, p);
  vec3 scatterTint = mix(vec3(0.14, 0.22, 0.45), vec3(1.0, 0.68, 0.36), clamp(p * 0.85 + dawnArc * 0.45, 0.0, 1.0));
  col += sunLin * mieGlow + scatterTint * (horizonBand * pow(sunDot, 2.0) * mix(0.04, 0.32, p + dawnArc * 0.35));

  float disc = smoothstep(0.9984, 0.9994, sunDot);
  float corona = pow(sunDot, 180.0) * mix(0.10, 1.25, p);
  col += sunLin * (disc * mix(0.32, 2.4, p) + corona);

  // Drifting 2-layer FBM clouds across the upper hemisphere (moody indigo night clouds -> rose dawn -> bright day)
  if (dir.y > 0.01) {
    float horizonFade = smoothstep(0.02, 0.26, dir.y);
    vec2 skyUv = dir.xz / (dir.y + 0.16);

    float c1 = fbm2(skyUv * 0.78 + vec2(uTime * 0.0085, uTime * 0.0032));
    float c2 = fbm2(skyUv * 1.45 + vec2(-uTime * 0.0055, uTime * 0.0068) + 19.4);

    float dens1 = smoothstep(0.50, 0.78, c1);
    float dens2 = smoothstep(0.55, 0.84, c2) * 0.55;
    float cloudAlpha = clamp((dens1 + dens2 * (1.0 - dens1 * 0.5)) * horizonFade, 0.0, 0.85);

    vec3 cloudShadow = mix(vec3(0.008, 0.014, 0.032), vec3(0.42, 0.50, 0.65), p);
    vec3 dawnCloudTint = vec3(0.88, 0.44, 0.34) * (dawnArc * 0.42);
    vec3 cloudLit = mix(vec3(0.026, 0.042, 0.088), vec3(1.0, 0.97, 0.90), p) + dawnCloudTint;
    float edgeLight = clamp(0.40 + 0.60 * pow(sunDot, 2.0) + (1.0 - c1) * 0.25, 0.0, 1.0);
    vec3 cloudCol = mix(cloudShadow, cloudLit + sunLin * (pow(sunDot, 5.0) * mix(0.06, 0.38, p)), edgeLight);

    col = mix(col, cloudCol, cloudAlpha * mix(0.48, 0.82, p));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>

  // Melt sky horizon seamlessly into scene fog
  float fogBlend = 1.0 - smoothstep(-0.05, 0.09, dir.y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogBlend);
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
    mat.customProgramCacheKey = () => 'terrain_pbr_v1';

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWaterY = uniforms.uWaterY;
      shader.uniforms.uSunDir = uniforms.uSunDir;
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
uniform vec3 uSunDir;
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

// Dual-scale world-space detail albedo (decoded from sRGB to linear)
vec3 detA = pow( max( texture2D( uDetailMap, vWorldPos.xz * 0.14 ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 detB = pow( max( texture2D( uDetailMap, vWorldPos.xz * 0.037 ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 detMix = detA * 0.62 + detB * 0.38;
float detLum = dot( detMix, vec3( 0.299, 0.587, 0.114 ) );
float detContrast = clamp( 0.78 + ( detLum - 0.18 ) * 1.35, 0.64, 1.28 );
vec3 detChroma = mix( vec3( 1.0 ), detMix / max( detLum, 0.06 ), 0.14 );
diffuseColor.rgb *= detContrast * detChroma;

// Triplanar stratified cliff rock bands on steep coastal & canyon walls
float absX = abs( tNorm.x );
float absZ = abs( tNorm.z );
float triW = ( absX * absX ) / max( absX * absX + absZ * absZ, 0.0001 );
vec2 cliffUvA = vec2( vWorldPos.z * 0.085, vWorldPos.y * 0.16 );
vec2 cliffUvB = vec2( vWorldPos.x * 0.085, vWorldPos.y * 0.16 );
vec3 rockA = pow( max( texture2D( uRockMap, cliffUvA ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 rockB = pow( max( texture2D( uRockMap, cliffUvB ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 rockMacro = pow( max( texture2D( uRockMap, vWorldPos.xz * 0.038 ).rgb, vec3( 0.0001 ) ), vec3( 2.2 ) );
vec3 rockCol = mix( rockB, rockA, triW ) * ( 0.78 + 0.44 * dot( rockMacro, vec3( 0.333 ) ) );
vec3 rockTinted = mix( rockCol, rockCol * ( 0.65 + 0.70 * diffuseColor.rgb ), 0.30 );
diffuseColor.rgb = mix( diffuseColor.rgb, rockTinted, rockBlend );

// Damp darkened shoreline sand band right above water level (Lake Hylia wet beach transition)
float wetShore = ( 1.0 - smoothstep( 0.0, 0.85, abs( vWorldPos.y - uWaterY ) ) ) * ( 1.0 - rockBlend * 0.55 );
diffuseColor.rgb *= ( 1.0 - wetShore * 0.28 );

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
vec3 wPerturbed = normalize( tNorm + ( wT * rn.x + wB * rn.y ) * ( 0.14 + rockBlend * 0.70 ) );
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
        uCamPos: uniforms.uCamPos,
        uSunDir: uniforms.uSunDir,
        uSunColor: uniforms.uSunColor,
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
      roughness: 0.82,
      metalness: 0.0,
    });
    mat.customProgramCacheKey = () => 'grass_wind_v2';

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uPlayerPos = uniforms.uPlayerPos;
      shader.uniforms.uTramplers = uniforms.uTramplers;
      shader.uniforms.uCamPos = uniforms.uCamPos;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec3 uPlayerPos;
uniform vec4 uTramplers[16];
uniform vec3 uCamPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float bladeH = clamp( uv.y, 0.0, 1.0 );
float hWeight = bladeH * bladeH;

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

// Sweeping rolling meadow breeze waves + fine individual blade flutter
float swell = sin( grassBaseWorld.x * 0.14 + grassBaseWorld.z * 0.11 + uTime * 1.85 );
float gust = sin( grassBaseWorld.x * 0.32 - grassBaseWorld.z * 0.22 + uTime * 2.6 ) * 0.55;
float flutter = cos( grassBaseWorld.x * 0.95 - grassBaseWorld.z * 0.82 + uTime * 4.8 ) * 0.32;
float windX = ( swell * 0.24 + gust * 0.14 + flutter * 0.07 + 0.06 ) * hWeight * distScale;
float windZ = ( sin( grassBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.16 + flutter * 0.05 ) * hWeight * distScale;

gWorld.x += windX;
gWorld.z += windZ;
gWorld.y -= ( abs( windX ) + abs( windZ ) ) * 0.22;

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

vec4 mvPosition = viewMatrix * gWorld;
gl_Position = projectionMatrix * mvPosition;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
  vec4 worldPosition = gWorld;
#endif`
        );
    };

    return mat;
  }

  function patchTreeWind(mat, isFoliage = true) {
    if (!mat) return mat;
    const cacheKey = isFoliage ? 'tree_foliage_wind_v2' : 'tree_trunk_wind_v2';
    mat.customProgramCacheKey = () => cacheKey;

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;

      const foliageMotion = isFoliage
        ? `
// Outer branches, drooping pine boughs & flexible top spire gently sway; inner trunk attachment stays calm
float boughWeight = max( smoothstep( 0.45, 2.40, radialDist ), smoothstep( 7.8, 12.0, hAboveBase ) * 0.48 );
float boughSwayX = ( swell * 0.12 + gust * 0.07 + 0.02 ) * boughWeight;
float boughSwayZ = ( sin( treeBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.08 + gust * 0.035 ) * boughWeight;
tWorld.x += boughSwayX;
tWorld.z += boughSwayZ;
tWorld.y -= ( abs( boughSwayX ) + abs( boughSwayZ ) ) * 0.14;

// Outer leaf sprigs & pine needle clusters rustle briskly as wind gusts pass through the crown
float radialOut = clamp( radialDist / 2.2, 0.18, 1.35 );
float leafPhase = tWorld.x * 2.1 + tWorld.y * 1.7 + tWorld.z * 2.3;
float f1 = sin( leafPhase + uTime * 3.9 );
float f2 = cos( leafPhase * 1.6 - uTime * 5.7 ) * 0.45;
float flutterAmp = ( 0.055 + 0.045 * max( 0.0, swell ) ) * radialOut * clamp( hAboveBase / 1.8, 0.0, 1.0 );
tWorld.x += ( f1 + f2 ) * flutterAmp;
tWorld.y += sin( leafPhase * 1.3 + uTime * 4.6 ) * ( flutterAmp * 0.72 );
tWorld.z += ( cos( leafPhase + uTime * 4.2 ) - f2 ) * flutterAmp;`
        : `
// Subtle outer-limb tip flex only on high forked wooden boughs (main mature trunk core stays rigid)
float limbWeight = smoothstep( 0.55, 1.85, radialDist ) * smoothstep( 3.6, 6.2, hAboveBase );
tWorld.x += ( swell * 0.05 + gust * 0.028 ) * limbWeight;
tWorld.z += ( sin( treeBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.035 ) * limbWeight;`;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;`
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

// Gentle meadow breeze: mature oak & pine trunks stand rock-steady; only young saplings gently flex
float hAboveBase = max( 0.0, tWorld.y - treeBaseWorld.y );
float radialDist = length( tWorld.xz - treeBaseWorld.xz );
float swell = sin( treeBaseWorld.x * 0.14 + treeBaseWorld.z * 0.11 + uTime * 1.85 );
float gust = sin( treeBaseWorld.x * 0.32 - treeBaseWorld.z * 0.22 + uTime * 2.6 ) * 0.55;

float saplingFlex = 1.0 - smoothstep( 0.44, 0.74, treeScale );
float stemH = clamp( hAboveBase / 6.8, 0.0, 1.2 );
float saplingW = saplingFlex * stemH * stemH;
float swayX = ( swell * 0.09 + gust * 0.05 + 0.015 ) * saplingW;
float swayZ = ( sin( treeBaseWorld.z * 0.26 + uTime * 1.95 ) * 0.06 + gust * 0.025 ) * saplingW;

tWorld.x += swayX;
tWorld.z += swayZ;
tWorld.y -= ( abs( swayX ) + abs( swayZ ) ) * 0.14;${foliageMotion}

vec4 mvPosition = viewMatrix * tWorld;
gl_Position = projectionMatrix * mvPosition;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
  vec4 worldPosition = tWorld;
#endif`
        );
    };

    return mat;
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
    waterHeightAt,
    createTerrainMaterial,
    createWaterMaterial,
    createHorizonWaterMaterial,
    createGrassMaterial,
    patchTreeWind,
    patchClothFlow,
    createKelpMaterial,
    createJellyMaterial,
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
  };
})();
