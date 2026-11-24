import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadShaders() {
  const code = fs.readFileSync(new URL('../shaders.js', import.meta.url), 'utf8');
  const sandbox = { Math, console };
  vm.runInNewContext(code + '\nthis.__Shaders = Shaders;', sandbox);
  return sandbox.__Shaders;
}

function makeMockThree() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    normalize() {
      const len = Math.sqrt(this.lengthSq()) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    }
  }

  class Color {
    constructor(v = 0xffffff) {
      this.r = 1;
      this.g = 1;
      this.b = 1;
      if (v !== undefined) this.set(v);
    }
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
    }
    setHex(v) {
      return this.set(v);
    }
    lerpColors(c1, c2, t) {
      this.r = c1.r + (c2.r - c1.r) * t;
      this.g = c1.g + (c2.g - c1.g) * t;
      this.b = c1.b + (c2.b - c1.b) * t;
      return this;
    }
  }

  class MeshStandardMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.isMeshStandardMaterial = true;
    }
  }

  class ShaderMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.isShaderMaterial = true;
    }
  }

  class SpriteMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.isSpriteMaterial = true;
    }
  }

  class Sprite {
    constructor(material) {
      this.material = material;
      this.scale = new Vector3(1, 1, 1);
      this.isSprite = true;
    }
  }

  class SphereGeometry {
    constructor(radius, widthSegments, heightSegments) {
      this.radius = radius;
      this.widthSegments = widthSegments;
      this.heightSegments = heightSegments;
    }
  }

  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.isMesh = true;
    }
  }

  class DataTexture {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
      this.needsUpdate = false;
    }
  }

  return {
    Vector3,
    Color,
    MeshStandardMaterial,
    ShaderMaterial,
    SpriteMaterial,
    Sprite,
    SphereGeometry,
    Mesh,
    DataTexture,
    DoubleSide: 2,
    FrontSide: 0,
    BackSide: 1,
    AdditiveBlending: 2,
    RepeatWrapping: 1000,
    RGBAFormat: 1023,
    UnsignedByteType: 1009,
    LinearEncoding: 3000,
    sRGBEncoding: 3001,
  };
}

function loadShadersWithMocks() {
  const code = fs.readFileSync(new URL('../shaders.js', import.meta.url), 'utf8');
  const THREE = makeMockThree();
  const Textures = {
    sets: {
      grass: { map: { id: 'grassMap' }, normalMap: { id: 'grassNorm' }, roughnessMap: { id: 'grassRough' } },
      rock: { map: { id: 'rockMap' }, normalMap: { id: 'rockNorm' }, roughnessMap: { id: 'rockRough' } },
      waterNormal: { normalMap: { id: 'waterNorm' } },
    },
    glowSprite: { id: 'glowTex' },
    sparkleSprite: { id: 'sparkleTex' },
  };
  const sandbox = { Math, console, Uint8Array, THREE, Textures };
  vm.runInNewContext(code + '\nthis.__Shaders = Shaders;', sandbox);
  return { S: sandbox.__Shaders, THREE, Textures };
}

test('waterHeightAt is smooth, bounded, and time-varying', () => {
  const S = loadShaders();
  const h0 = S.waterHeightAt(10, -5, 0);
  const h1 = S.waterHeightAt(10, -5, 1.2);
  const hNear = S.waterHeightAt(10.01, -5, 0);
  assert.ok(Math.abs(h0) < 0.25, `Wave amplitude too large: ${h0}`);
  assert.ok(Math.abs(h1) < 0.25, `Wave amplitude too large: ${h1}`);
  assert.notEqual(h0, h1, 'Water height should animate over time');
  assert.ok(Math.abs(h0 - hNear) < 0.02, 'Water surface must be spatially smooth');
});

test('GLSL shader sources contain required uniforms and attributes', () => {
  const S = loadShaders();
  assert.match(S._WATER_VERT, /attribute float aBedHeight/);
  assert.match(S._WATER_VERT, /uTime/);
  assert.match(S._WATER_FRAG, /uWaterNormal/);
  assert.match(S._WATER_FRAG, /fresnel|pow\(1\.0 - max/);
  assert.match(S._SKY_FRAG, /uSunDir/);
  assert.match(S._SKY_FRAG, /uProgress/);
  assert.match(S._WATER_FRAG, /#include <tonemapping_fragment>/);
  assert.match(S._WATER_FRAG, /#include <encodings_fragment>/);
  assert.match(S._SKY_FRAG, /#include <tonemapping_fragment>/);
  assert.match(S._SKY_FRAG, /#include <encodings_fragment>/);
  assert.doesNotMatch(S._WATER_FRAG, /dFdx|dFdy/);
  assert.doesNotMatch(S._SKY_FRAG, /dFdx|dFdy/);
});

test('Shaders.uniforms and Shaders.update mutate shared uniforms in-place', () => {
  const { S, THREE } = loadShadersWithMocks();
  const required = [
    'uTime', 'uWaterY', 'uPlayerPos', 'uTramplers', 'uCamPos', 'uSunDir', 'uSunColor',
    'uSkyTop', 'uSkyMid', 'uSkyBot', 'uProgress', 'uFogColor', 'uFogNear', 'uFogFar',
  ];
  for (const key of required) {
    assert.ok(key in S.uniforms, `Missing uniform: ${key}`);
  }

  const uPlayerRef = S.uniforms.uPlayerPos.value;
  const uCamRef = S.uniforms.uCamPos.value;
  const uFogRef = S.uniforms.uFogColor.value;

  S.update(
    4.5,
    { x: 12, y: 3, z: -8 },
    { x: 18, y: 9, z: -15 },
    new THREE.Vector3(2, 4, 1),
    0.75,
    0x1b3b70,
    0x4a76a8,
    0x88b4d8,
    0x78a6cc,
    42,
    130
  );

  assert.equal(S.uniforms.uTime.value, 4.5);
  assert.equal(S.uniforms.uPlayerPos.value, uPlayerRef);
  assert.equal(S.uniforms.uCamPos.value, uCamRef);
  assert.equal(S.uniforms.uFogColor.value, uFogRef);
  assert.equal(S.uniforms.uPlayerPos.value.x, 12);
  assert.equal(S.uniforms.uCamPos.value.y, 9);
  assert.ok(Math.abs(Math.hypot(
    S.uniforms.uSunDir.value.x,
    S.uniforms.uSunDir.value.y,
    S.uniforms.uSunDir.value.z
  ) - 1) < 1e-6);
  assert.equal(S.uniforms.uProgress.value, 0.75);
  assert.equal(S.uniforms.uFogNear.value, 42);
  assert.equal(S.uniforms.uFogFar.value, 130);
});

test('createTerrainMaterial, createGrassMaterial, and createKelpMaterial patch r128 chunks cleanly', () => {
  const { S, Textures } = loadShadersWithMocks();
  const baseShader = () => ({
    uniforms: {},
    vertexShader: [
      '#define STANDARD',
      '#include <common>',
      'void main() {',
      '  #include <beginnormal_vertex>',
      '  #include <begin_vertex>',
      '  #include <project_vertex>',
      '  #include <worldpos_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: [
      '#define STANDARD',
      '#include <common>',
      'void main() {',
      '  vec4 diffuseColor = vec4(1.0);',
      '  float roughnessFactor = 0.8;',
      '  #include <color_fragment>',
      '  #include <roughnessmap_fragment>',
      '  #include <normal_fragment_begin>',
      '  #include <normal_fragment_maps>',
      '}',
    ].join('\n'),
  });

  const terrainMat = S.createTerrainMaterial(Textures);
  assert.equal(terrainMat.isMeshStandardMaterial, true);
  assert.equal(terrainMat.vertexColors, true);
  const tShader = baseShader();
  terrainMat.onBeforeCompile(tShader);
  assert.equal(tShader.uniforms.uDetailMap.value, Textures.sets.grass.map);
  assert.equal(tShader.uniforms.uRockMap.value, Textures.sets.rock.map);
  assert.equal(tShader.uniforms.uRockNormal.value, Textures.sets.rock.normalMap);
  assert.match(tShader.vertexShader, /vWorldPos/);
  assert.match(tShader.vertexShader, /vWorldNorm/);
  assert.doesNotMatch(tShader.vertexShader, /\bworldPosition\b/);
  assert.match(tShader.fragmentShader, /uDetailMap/);
  assert.match(tShader.fragmentShader, /uRockMap/);
  assert.match(tShader.fragmentShader, /uRockNormal/);
  assert.match(tShader.fragmentShader, /smoothstep\(\s*0\.18,\s*0\.42/);
  assert.match(tShader.fragmentShader, /exp\(/);
  assert.doesNotMatch(tShader.fragmentShader, /dFdx|dFdy/);

  const grassMat = S.createGrassMaterial(Textures);
  assert.equal(grassMat.isMeshStandardMaterial, true);
  assert.equal(grassMat.vertexColors, true);
  assert.equal(grassMat.side, 2);
  const gShader = baseShader();
  grassMat.onBeforeCompile(gShader);
  assert.ok(gShader.uniforms.uPlayerPos);
  assert.ok(gShader.uniforms.uTramplers);
  assert.equal(gShader.uniforms.uTramplers.value.length, S.MAX_TRAMPLERS);
  assert.ok(gShader.uniforms.uCamPos);
  assert.match(gShader.vertexShader, /USE_INSTANCING/);
  assert.match(gShader.vertexShader, /uPlayerPos/);
  assert.match(gShader.vertexShader, /uTramplers/);
  assert.match(gShader.vertexShader, /56\.0,\s*78\.0/);

  // setTrampler & clearTramplersFrom mutate pre-allocated slots in-place
  const slot0Ref = S.uniforms.uTramplers.value[0];
  S.setTrampler(0, 12.5, 2.0, -4.5, 1.65);
  assert.equal(S.uniforms.uTramplers.value[0], slot0Ref, 'setTrampler must mutate in-place');
  assert.equal(slot0Ref.x, 12.5);
  assert.equal(slot0Ref.w, 1.65);
  S.clearTramplersFrom(0);
  assert.equal(slot0Ref.w, 0, 'clearTramplersFrom should zero unused radius');

  const kelpMat = S.createKelpMaterial();
  assert.equal(kelpMat.isMeshStandardMaterial, true);
  assert.equal(kelpMat.side, 2);
  const kShader = baseShader();
  kelpMat.onBeforeCompile(kShader);
  assert.ok(kShader.uniforms.uTime);
  assert.match(kShader.vertexShader, /USE_INSTANCING/);
  assert.match(kShader.vertexShader, /uTime/);
});

test('createWaterMaterial, createHorizonWaterMaterial, createSkyDome, and createGlowSprite return valid Three objects', () => {
  const { S, THREE, Textures } = loadShadersWithMocks();

  const waterMat = S.createWaterMaterial(Textures);
  assert.equal(waterMat.isShaderMaterial, true);
  assert.equal(waterMat.transparent, true);
  assert.equal(waterMat.depthWrite, false);
  assert.equal(waterMat.side, THREE.DoubleSide);
  assert.equal(waterMat.uniforms.uWaterNormal.value, Textures.sets.waterNormal.normalMap);

  const horizonMat = S.createHorizonWaterMaterial();
  assert.equal(horizonMat.isShaderMaterial, true);
  assert.ok(horizonMat.uniforms.uFogColor);

  const sky = S.createSkyDome();
  assert.ok(sky.mesh && sky.material);
  assert.equal(sky.material.isShaderMaterial, true);
  assert.equal(sky.material.side, THREE.BackSide);
  assert.equal(sky.material.depthWrite, false);
  assert.equal(sky.material.fog, false);

  const glow = S.createGlowSprite(0xffd93b, 2.5, 0.8, false);
  assert.equal(glow.isSprite, true);
  assert.equal(glow.material.map, Textures.glowSprite);
  assert.equal(glow.material.blending, THREE.AdditiveBlending);
  assert.equal(glow.material.depthWrite, false);
  assert.equal(glow.material.transparent, true);
  assert.equal(glow.scale.x, 2.5);

  const sparkle = S.createGlowSprite(0xffffff, 1.4, 0.9, true);
  assert.equal(sparkle.material.map, Textures.sparkleSprite);

  // Also test safe fallback when textures is null or passed directly as sets
  const terrainFallback = S.createTerrainMaterial(null);
  const waterFallback = S.createWaterMaterial(null);
  assert.equal(terrainFallback.isMeshStandardMaterial, true);
  assert.equal(waterFallback.isShaderMaterial, true);
  assert.ok(waterFallback.uniforms.uWaterNormal.value instanceof THREE.DataTexture);

  const terrainDirectSets = S.createTerrainMaterial(Textures.sets);
  const s = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
  };
  terrainDirectSets.onBeforeCompile(s);
  assert.equal(s.uniforms.uRockMap.value, Textures.sets.rock.map);
  assert.doesNotMatch(s.vertexShader, /mat3\(\s*modelMatrix\s*\)/);

  // Verify exact 4-wave Gerstner waterHeightAt formula & shore damping
  const expected =
    Math.sin((7 * 0.86 + -3 * 0.51) * 0.16 - 2.5 * 1.25) * 0.11 +
    Math.sin((7 * -0.48 + -3 * 0.88) * 0.27 - 2.5 * 1.55) * 0.068 +
    Math.sin((7 * 0.34 + -3 * -0.94) * 0.48 - 2.5 * 2.05) * 0.036 +
    Math.sin((7 * -0.82 + -3 * -0.57) * 0.78 - 2.5 * 2.65) * 0.018;
  assert.ok(Math.abs(S.waterHeightAt(7, -3, 2.5) - expected) < 1e-12);
  assert.ok(
    Math.abs(S.waterHeightAt(7, -3, 2.5, -0.02)) < Math.abs(S.waterHeightAt(7, -3, 2.5, -5.0)),
    'Shallow bedHeight near shore should damp Gerstner wave amplitude'
  );
});

test('customProgramCacheKey values are distinct and GLSL smoothstep bounds are strictly ordered', () => {
  const { S, THREE, Textures } = loadShadersWithMocks();
  const baseShader = () => ({
    uniforms: {},
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
  });

  const terrainMat = S.createTerrainMaterial(Textures);
  const grassMat = S.createGrassMaterial(Textures);
  const kelpMat = S.createKelpMaterial();
  const trunkMat = S.patchTreeWind(new (loadShadersWithMocks().THREE.MeshStandardMaterial)(), false);
  const foliageMat = S.patchTreeWind(new (loadShadersWithMocks().THREE.MeshStandardMaterial)(), true);

  const keys = [
    terrainMat.customProgramCacheKey(),
    grassMat.customProgramCacheKey(),
    kelpMat.customProgramCacheKey(),
    trunkMat.customProgramCacheKey(),
    foliageMat.customProgramCacheKey(),
  ];
  assert.ok(keys.every((k) => typeof k === 'string' && k.length > 0));
  assert.equal(new Set(keys).size, 5, `Expected 5 distinct program cache keys, got ${keys.join(', ')}`);

  const tShader = baseShader();
  const gShader = baseShader();
  const kShader = baseShader();
  const trShader = baseShader();
  const fShader = baseShader();
  terrainMat.onBeforeCompile(tShader);
  grassMat.onBeforeCompile(gShader);
  kelpMat.onBeforeCompile(kShader);
  trunkMat.onBeforeCompile(trShader);
  foliageMat.onBeforeCompile(fShader);

  // Mature trunks stay rock-steady (only young saplings + outer forked limbs flex); foliage gets radial bough sway + leaf flutter!
  assert.ok(trShader.uniforms.uTime && fShader.uniforms.uTime);
  assert.match(trShader.vertexShader, /USE_INSTANCING/);
  assert.match(trShader.vertexShader, /saplingFlex/);
  assert.match(trShader.vertexShader, /limbWeight/);
  assert.doesNotMatch(trShader.vertexShader, /leafPhase/);
  assert.match(fShader.vertexShader, /saplingFlex/);
  assert.match(fShader.vertexShader, /boughWeight/);
  assert.match(fShader.vertexShader, /leafPhase/);
  assert.match(fShader.vertexShader, /flutterAmp/);

  // Verify flat ground 2D normal sampling & defensive fog guards
  assert.match(tShader.fragmentShader, /vWorldPos\.xz \* 0\.16/);
  assert.match(S._WATER_FRAG, /smoothstep\(\s*uFogNear,\s*max\(\s*uFogFar,\s*uFogNear \+ 0\.001\s*\)/);
  assert.match(S._HORIZON_FRAG, /smoothstep\(\s*uFogNear,\s*max\(\s*uFogFar,\s*uFogNear \+ 0\.001\s*\)/);

  // Scan every numeric smoothstep(a, b, ...) in all GLSL sources to reject a >= b
  const glslSources = [
    ['WATER_VERT', S._WATER_VERT],
    ['WATER_FRAG', S._WATER_FRAG],
    ['HORIZON_VERT', S._HORIZON_VERT],
    ['HORIZON_FRAG', S._HORIZON_FRAG],
    ['SKY_VERT', S._SKY_VERT],
    ['SKY_FRAG', S._SKY_FRAG],
    ['TERRAIN_VERT', tShader.vertexShader],
    ['TERRAIN_FRAG', tShader.fragmentShader],
    ['GRASS_VERT', gShader.vertexShader],
    ['KELP_VERT', kShader.vertexShader],
    ['TRUNK_VERT', trShader.vertexShader],
    ['FOLIAGE_VERT', fShader.vertexShader],
  ];

  const smoothstepNumRe = /smoothstep\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,/g;
  let checkedCount = 0;
  for (const [label, src] of glslSources) {
    let match;
    while ((match = smoothstepNumRe.exec(src)) !== null) {
      const a = parseFloat(match[1]);
      const b = parseFloat(match[2]);
      checkedCount++;
      assert.ok(a < b, `${label} has invalid smoothstep(${match[1]}, ${match[2]}, ...): edge0 >= edge1`);
    }
  }
  assert.ok(checkedCount >= 10, `Expected at least 10 numeric smoothstep checks, got ${checkedCount}`);

  // Verify flowing garment cloth shader (both standard & continuousBend+goldHem single-piece cloak) & zero-GC setters
  const clothMat = S.patchClothFlow(new THREE.MeshStandardMaterial({ roughness: 0.78 }), { tag: 'cloth_test_v1' });
  const clothShader = baseShader();
  clothMat.onBeforeCompile(clothShader);
  assert.equal(clothMat.customProgramCacheKey(), 'cloth_test_v1');
  assert.ok(clothShader.uniforms.uTime && clothShader.uniforms.uClothMotion);
  assert.match(clothShader.vertexShader, /uClothMotion/);
  assert.match(clothShader.vertexShader, /objectNormal\s*=/);
  S.setClothMotion(1.2, -0.5, 0.3, 0.4);
  assert.equal(S.uniforms.uClothMotion.value.x, 1.2);
  assert.equal(S.uniforms.uClothMotion.value.y, -0.5);

  const cloakMat = S.patchClothFlow(new THREE.MeshStandardMaterial({ roughness: 0.72 }), {
    continuousBend: true,
    bendOffset: 0.075,
    goldHem: true,
    tag: 'cloth_continuous_test_v1',
  });
  const cloakShader = baseShader();
  cloakMat.onBeforeCompile(cloakShader);
  assert.equal(cloakMat.customProgramCacheKey(), 'cloth_continuous_test_v1');
  assert.ok(cloakShader.uniforms.uClothCurve);
  assert.match(cloakShader.vertexShader, /uClothCurve/);
  assert.match(cloakShader.vertexShader, /cLift/);
  assert.match(cloakShader.vertexShader, /vClothV/);
  assert.match(cloakShader.fragmentShader, /cHemBand/);
  S.setClothCurve(0.85, 0.22, -0.35, 0.48);
  assert.equal(S.uniforms.uClothCurve.value.x, 0.85);
  assert.equal(S.uniforms.uClothCurve.value.y, 0.22);
  assert.equal(S.uniforms.uClothCurve.value.z, -0.35);
  assert.equal(S.uniforms.uClothCurve.value.w, 0.48);
  let cloakSmoothChecks = 0;
  let cm;
  while ((cm = smoothstepNumRe.exec(cloakShader.fragmentShader)) !== null) {
    cloakSmoothChecks++;
    assert.ok(parseFloat(cm[1]) < parseFloat(cm[2]), `CLOAK_FRAG invalid smoothstep(${cm[1]}, ${cm[2]})`);
  }
  assert.ok(cloakSmoothChecks >= 3, `Expected >=3 gold-hem smoothstep checks, got ${cloakSmoothChecks}`);
});

test('createJellyMaterial returns animated bioluminescent ShaderMaterial with valid GLSL', () => {
  const { S, THREE } = loadShadersWithMocks();

  assert.equal(typeof S.createJellyMaterial, 'function', 'Shaders.createJellyMaterial must be exported');
  assert.equal(typeof S._JELLY_VERT, 'string', '_JELLY_VERT must be exported');
  assert.equal(typeof S._JELLY_FRAG, 'string', '_JELLY_FRAG must be exported');

  const bellMat = S.createJellyMaterial(0x8fbdf7);
  assert.equal(bellMat.isShaderMaterial, true);
  assert.equal(bellMat.transparent, true);
  assert.equal(bellMat.depthWrite, false);
  assert.equal(bellMat.side, THREE.DoubleSide);
  assert.equal(bellMat.blending, THREE.AdditiveBlending);
  assert.equal(bellMat.fog, false);
  assert.equal(bellMat.uniforms.uTime, S.uniforms.uTime, 'uTime must share Shaders.uniforms.uTime reference');
  assert.equal(bellMat.uniforms.uIsTentacle.value, 0.0);
  assert.equal(bellMat.uniforms.uPhase.value, 0.0);
  assert.ok(bellMat.uniforms.uColor.value instanceof THREE.Color);
  assert.ok(bellMat.uniforms.uRimColor.value instanceof THREE.Color);

  const tentMat = S.createJellyMaterial(0x8fbdf7, { isTentacle: true, phase: 2.1, rimColor: 0x99eeff });
  assert.equal(tentMat.uniforms.uTime, S.uniforms.uTime);
  assert.equal(tentMat.uniforms.uIsTentacle.value, 1.0);
  assert.equal(tentMat.uniforms.uPhase.value, 2.1);

  const nullRimMat = S.createJellyMaterial(0x8fbdf7, { rimColor: null });
  assert.ok(Math.abs(nullRimMat.uniforms.uRimColor.value.r - (0xc8 / 255)) < 1e-6, 'null rimColor should fall back cleanly to 0xc8f6ff');

  assert.match(S._JELLY_VERT, /\buTime\b/);
  assert.match(S._JELLY_VERT, /\buIsTentacle\b/);
  assert.match(S._JELLY_VERT, /\buPhase\b/);
  assert.match(S._JELLY_VERT, /0\.62/);
  assert.match(S._JELLY_VERT, /\bvNormal\b/);
  assert.match(S._JELLY_VERT, /\bvViewDir\b/);
  assert.match(S._JELLY_FRAG, /\buColor\b/);
  assert.match(S._JELLY_FRAG, /\buRimColor\b/);
  assert.match(S._JELLY_FRAG, /pow\(/);
  assert.match(S._JELLY_FRAG, /#include <tonemapping_fragment>/);
  assert.match(S._JELLY_FRAG, /#include <encodings_fragment>/);
  assert.doesNotMatch(S._JELLY_VERT, /dFdx|dFdy/);
  assert.doesNotMatch(S._JELLY_FRAG, /dFdx|dFdy/);

  const smoothstepNumRe = /smoothstep\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,/g;
  for (const [label, src] of [['JELLY_VERT', S._JELLY_VERT], ['JELLY_FRAG', S._JELLY_FRAG]]) {
    let match;
    while ((match = smoothstepNumRe.exec(src)) !== null) {
      assert.ok(
        parseFloat(match[1]) < parseFloat(match[2]),
        `${label} has invalid smoothstep(${match[1]}, ${match[2]}, ...): edge0 >= edge1`
      );
    }
  }
});

test('Sub-Project 4 PBR environment shaders: Moon/Milky Way sky, Gerstner water wakes, cloud shadows, reactive foliage, underwater caustics, starfield & clouds', () => {
  const { S, THREE, Textures } = loadShadersWithMocks();

  // 1. New celestial & wind uniforms + zero-GC in-place setters
  for (const key of ['uMoonDir', 'uMoonColor', 'uNightFactor', 'uWindVec', 'uCloudOffset']) {
    assert.ok(key in S.uniforms, `Missing uniform: ${key}`);
  }
  assert.equal(typeof S.setCelestial, 'function', 'Shaders.setCelestial must be exported');
  assert.equal(typeof S.setWind, 'function', 'Shaders.setWind must be exported');

  const moonDirRef = S.uniforms.uMoonDir.value;
  const moonColRef = S.uniforms.uMoonColor.value;
  const windVecRef = S.uniforms.uWindVec.value;
  const cloudOffRef = S.uniforms.uCloudOffset.value;

  S.setCelestial({ x: -3, y: 4, z: 0 }, 0x99bbff, 0.82);
  assert.equal(S.uniforms.uMoonDir.value, moonDirRef, 'uMoonDir must mutate in-place');
  assert.equal(S.uniforms.uMoonColor.value, moonColRef, 'uMoonColor must mutate in-place');
  assert.ok(Math.abs(S.uniforms.uMoonDir.value.x - (-0.6)) < 1e-6);
  assert.ok(Math.abs(S.uniforms.uMoonDir.value.y - 0.8) < 1e-6);
  assert.equal(S.uniforms.uNightFactor.value, 0.82);

  S.setWind(0.6, 0.8, 0.92, 1.4, 15.5, -8.25);
  assert.equal(S.uniforms.uWindVec.value, windVecRef, 'uWindVec must mutate in-place');
  assert.equal(S.uniforms.uCloudOffset.value, cloudOffRef, 'uCloudOffset must mutate in-place');
  assert.equal(S.uniforms.uWindVec.value.x, 0.6);
  assert.equal(S.uniforms.uWindVec.value.y, 0.8);
  assert.equal(S.uniforms.uWindVec.value.z, 0.92);
  assert.equal(S.uniforms.uWindVec.value.w, 1.4);
  assert.equal(S.uniforms.uCloudOffset.value.x, 15.5);
  assert.equal(S.uniforms.uCloudOffset.value.y, -8.25);

  // 2. Sky Moon, maria/crater relief & Milky Way band (night-only, depthWrite=false, zero dFdx/dFdy)
  assert.match(S._SKY_FRAG, /\buMoonDir\b/);
  assert.match(S._SKY_FRAG, /\buNightFactor\b/);
  assert.match(S._SKY_FRAG, /\buCloudOffset\b/);
  assert.match(S._SKY_FRAG, /maria|crater/i);
  assert.match(S._SKY_FRAG, /milky|galBand|galLat/i);
  assert.doesNotMatch(S._SKY_FRAG, /dFdx|dFdy/);

  // 3. Gerstner 4-wave water + crest foam + wake ripples
  assert.match(S._WATER_VERT, /vCrest/);
  assert.match(S._WATER_VERT, /0\.86/);
  assert.match(S._WATER_VERT, /-0\.82/);
  assert.match(S._WATER_VERT, /smoothstep\(\s*0\.05,\s*1\.35/);
  assert.match(S._WATER_FRAG, /\buPlayerPos\b/);
  assert.match(S._WATER_FRAG, /\buTramplers\b/);
  assert.match(S._WATER_FRAG, /\buMoonDir\b/);
  assert.match(S._WATER_FRAG, /crestFoam|vCrest/);
  assert.match(S._WATER_FRAG, /wake/i);
  assert.doesNotMatch(S._WATER_VERT, /dFdx|dFdy/);
  assert.doesNotMatch(S._WATER_FRAG, /dFdx|dFdy/);

  // 4. Terrain cloud shadows + horizon turf sheen + preserved slope blend
  const baseShader = () => ({
    uniforms: {},
    vertexShader: [
      '#define STANDARD',
      '#include <common>',
      'void main() {',
      '  #include <beginnormal_vertex>',
      '  #include <begin_vertex>',
      '  #include <project_vertex>',
      '  #include <worldpos_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: [
      '#define STANDARD',
      '#include <common>',
      'void main() {',
      '  vec4 diffuseColor = vec4(1.0);',
      '  float roughnessFactor = 0.8;',
      '  #include <color_fragment>',
      '  #include <roughnessmap_fragment>',
      '  #include <normal_fragment_begin>',
      '  #include <normal_fragment_maps>',
      '}',
    ].join('\n'),
  });

  const terrainMat = S.createTerrainMaterial(Textures);
  const tShader = baseShader();
  terrainMat.onBeforeCompile(tShader);
  assert.ok(tShader.uniforms.uCloudOffset && tShader.uniforms.uWindVec);
  assert.match(tShader.fragmentShader, /\buCloudOffset\b/);
  assert.match(tShader.fragmentShader, /\buWindVec\b/);
  assert.match(tShader.fragmentShader, /smoothstep\(\s*0\.18,\s*0\.42/);
  assert.doesNotMatch(tShader.fragmentShader, /dFdx|dFdy/);

  // 5. patchFoliageReactive & patchUnderwaterCaustics + cache key composition
  assert.equal(typeof S.patchFoliageReactive, 'function');
  assert.equal(typeof S.patchUnderwaterCaustics, 'function');

  const preTaggedMat = new THREE.MeshStandardMaterial();
  preTaggedMat.customProgramCacheKey = () => 'custom_base_v1';
  const reactMat = S.patchFoliageReactive(new THREE.MeshStandardMaterial());
  const reactTaggedMat = S.patchFoliageReactive(preTaggedMat);
  const causticMat = S.patchUnderwaterCaustics(new THREE.MeshStandardMaterial());
  const grassMat = S.createGrassMaterial(Textures);
  const treeMat = S.patchTreeWind(new THREE.MeshStandardMaterial(), true);

  const cacheKeys = [
    terrainMat.customProgramCacheKey(),
    grassMat.customProgramCacheKey(),
    treeMat.customProgramCacheKey(),
    reactMat.customProgramCacheKey(),
    reactTaggedMat.customProgramCacheKey(),
    causticMat.customProgramCacheKey(),
  ];
  assert.equal(new Set(cacheKeys).size, 6, `Expected 6 distinct cache keys, got ${cacheKeys.join(', ')}`);
  assert.ok(reactTaggedMat.customProgramCacheKey().includes('custom_base_v1'), 'patchFoliageReactive must compose existing customProgramCacheKey');

  const rShader = baseShader();
  const cShader = baseShader();
  reactMat.onBeforeCompile(rShader);
  causticMat.onBeforeCompile(cShader);

  assert.ok(rShader.uniforms.uWindVec && rShader.uniforms.uPlayerPos && rShader.uniforms.uTramplers);
  assert.match(rShader.vertexShader, /\buWindVec\b/);
  assert.match(rShader.vertexShader, /\buPlayerPos\b/);
  assert.match(rShader.vertexShader, /\buTramplers\b/);
  assert.match(rShader.fragmentShader, /\buSunDir\b/);
  assert.doesNotMatch(rShader.vertexShader, /mat3\(\s*modelMatrix\s*\)/);
  assert.doesNotMatch(rShader.fragmentShader, /dFdx|dFdy/);

  assert.ok(cShader.uniforms.uTime && cShader.uniforms.uWaterY && cShader.uniforms.uSunDir);
  assert.match(cShader.fragmentShader, /\buWaterY\b/);
  assert.match(cShader.fragmentShader, /caustic/i);
  assert.doesNotMatch(cShader.vertexShader, /mat3\(\s*modelMatrix\s*\)/);
  assert.doesNotMatch(cShader.fragmentShader, /dFdx|dFdy/);

  // 6. createStarfieldMaterial & createCloudMaterial
  assert.equal(typeof S.createStarfieldMaterial, 'function');
  assert.equal(typeof S.createCloudMaterial, 'function');

  const starMat = S.createStarfieldMaterial();
  const cloudMat = S.createCloudMaterial();
  for (const [name, m] of [['starfield', starMat], ['cloud', cloudMat]]) {
    assert.equal(m.isShaderMaterial, true, `${name} must be ShaderMaterial`);
    assert.ok(m.uniforms.uTime && m.uniforms.uSunDir && m.uniforms.uMoonDir, `${name} missing celestial/time uniforms`);
    assert.match(m.fragmentShader, /#include <tonemapping_fragment>/, `${name} missing tonemapping_fragment`);
    assert.match(m.fragmentShader, /#include <encodings_fragment>/, `${name} missing encodings_fragment`);
    assert.doesNotMatch(m.vertexShader, /dFdx|dFdy|mat3\(\s*modelMatrix\s*\)/);
    assert.doesNotMatch(m.fragmentShader, /dFdx|dFdy/);
  }
  assert.ok(starMat.uniforms.uStarAlpha, 'starfield must have uStarAlpha');
  assert.match(starMat.vertexShader, /\baSize\b/);
  assert.match(starMat.vertexShader, /\baTwinkleSpeed\b/);
  assert.match(starMat.vertexShader, /\baColor\b/);
  assert.match(cloudMat.fragmentShader, /\buSkyTop\b/);
  assert.match(cloudMat.fragmentShader, /\buFogColor\b/);

  // 7. Strict numeric smoothstep(edge0 < edge1) across all new GLSL sources
  const glslList = [
    ['WATER_VERT', S._WATER_VERT],
    ['WATER_FRAG', S._WATER_FRAG],
    ['HORIZON_FRAG', S._HORIZON_FRAG],
    ['SKY_FRAG', S._SKY_FRAG],
    ['TERRAIN_FRAG', tShader.fragmentShader],
    ['REACT_VERT', rShader.vertexShader],
    ['REACT_FRAG', rShader.fragmentShader],
    ['CAUSTIC_VERT', cShader.vertexShader],
    ['CAUSTIC_FRAG', cShader.fragmentShader],
    ['STAR_VERT', starMat.vertexShader],
    ['STAR_FRAG', starMat.fragmentShader],
    ['CLOUD_VERT', cloudMat.vertexShader],
    ['CLOUD_FRAG', cloudMat.fragmentShader],
  ];
  const smoothstepNumRe = /smoothstep\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,/g;
  for (const [label, src] of glslList) {
    let m;
    while ((m = smoothstepNumRe.exec(src)) !== null) {
      assert.ok(parseFloat(m[1]) < parseFloat(m[2]), `${label} invalid smoothstep(${m[1]}, ${m[2]})`);
    }
  }
});
