import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadTextures() {
  const code = fs.readFileSync(new URL('../textures.js', import.meta.url), 'utf8');
  const sandbox = { Math, Uint8Array, Float32Array, console };
  vm.runInNewContext(code + '\nthis.__Textures = Textures;', sandbox);
  return sandbox.__Textures;
}

function loadTexturesWithBrowserMocks({ THREE, document }) {
  const code = fs.readFileSync(new URL('../textures.js', import.meta.url), 'utf8');
  const factory = new Function('THREE', 'document', code + '\nreturn Textures;');
  return factory(THREE, document);
}

test('periodic noise wraps seamlessly across period boundaries', () => {
  const T = loadTextures();
  for (let i = 0; i < 10; i++) {
    const u = i * 0.73;
    const a = T._periodicFbm(u, 1.25, 8, 4, 17);
    const b = T._periodicFbm(u + 8, 1.25 + 8, 8, 4, 17);
    assert.ok(Math.abs(a - b) < 1e-6, `Expected seamless tile wrap, got ${a} vs ${b}`);
    assert.ok(a >= 0 && a <= 1, `Noise out of [0,1]: ${a}`);
  }
});

test('Sobel normal conversion outputs valid unit-length tangent normals', () => {
  const T = loadTextures();
  const size = 16;
  const flat = new Float32Array(size * size).fill(0.5);
  const flatPx = T._heightToNormalPixels(flat, size, 2.5);
  assert.equal(flatPx.length, size * size * 4);
  // Flat heightfield must encode (0, 0, 1) -> RGB ~(128, 128, 255)
  assert.ok(Math.abs(flatPx[0] - 128) <= 1);
  assert.ok(Math.abs(flatPx[1] - 128) <= 1);
  assert.equal(flatPx[2], 255);

  const sloped = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sloped[y * size + x] = Math.sin((x / size) * Math.PI * 2) * 0.5 + 0.5;
    }
  }
  const px = T._heightToNormalPixels(sloped, size, 3.0);
  for (let i = 0; i < px.length; i += 4) {
    const nx = (px[i] / 255) * 2 - 1;
    const ny = (px[i + 1] / 255) * 2 - 1;
    const nz = (px[i + 2] / 255) * 2 - 1;
    const len = Math.hypot(nx, ny, nz);
    assert.ok(Math.abs(len - 1) < 0.03, `Normal not unit length: ${len}`);
    assert.ok(nz > 0, 'Tangent-space normal Z must point outward');
    assert.equal(px[i + 3], 255);
  }
});

test('periodicNoise2, worleyPeriodic, and Sobel edge wrap are deterministic and seamless', () => {
  const T = loadTextures();
  for (let i = 0; i < 8; i++) {
    const x = i * 0.91 - 2.3;
    const y = i * 0.47 + 0.8;
    const n1 = T._periodicNoise2(x, y, 6, 42);
    const n2 = T._periodicNoise2(x + 6, y - 12, 6, 42);
    assert.ok(Math.abs(n1 - n2) < 1e-6, `Noise2 wrap mismatch: ${n1} vs ${n2}`);
    assert.ok(n1 >= 0 && n1 <= 1, `Noise2 out of [0,1]: ${n1}`);

    const w1 = T._worleyPeriodic(x, y, 6, 99);
    const w2 = T._worleyPeriodic(x - 6, y + 6, 6, 99);
    assert.ok(Math.abs(w1 - w2) < 1e-6, `Worley wrap mismatch: ${w1} vs ${w2}`);
    assert.ok(w1 >= 0 && w1 <= 1, `Worley out of [0,1]: ${w1}`);
  }

  // Sobel wrapping check: diagonal periodic wave has matching derivatives across wrap boundary
  const size = 16;
  const wave = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      wave[y * size + x] = 0.5 + 0.5 * Math.sin(((x + y) / size) * Math.PI * 2);
    }
  }
  const px = T._heightToNormalPixels(wave, size, 2.5);
  for (let y = 0; y < size; y++) {
    const a = (y * size + 0) * 4;
    const b = (((y - 1 + size) % size) * size + 1) * 4;
    assert.equal(px[a], px[b]);
    assert.equal(px[a + 1], px[b + 1]);
    assert.equal(px[a + 2], px[b + 2]);
  }
});

function makeMockThreeAndDom() {
  const doc = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        _data: null,
        getContext() {
          return {
            createImageData(w, h) {
              return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
            },
            putImageData(img) {
              canvas._data = img.data;
            },
          };
        },
      };
      return canvas;
    },
  };

  class Color {
    constructor(v = 0xffffff) {
      this.r = 1; this.g = 1; this.b = 1;
      if (typeof v === 'number') this.setHex(v);
    }
    setHex(h) {
      this.r = ((h >> 16) & 255) / 255;
      this.g = ((h >> 8) & 255) / 255;
      this.b = (h & 255) / 255;
      return this;
    }
    set(v) {
      if (v && typeof v === 'object' && 'r' in v) { this.r = v.r; this.g = v.g; this.b = v.b; }
      else if (typeof v === 'number') this.setHex(v);
      return this;
    }
    copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  }

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l;
      return this;
    }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  }

  class CanvasTexture {
    constructor(image) {
      this.image = image;
      this.wrapS = 1001;
      this.wrapT = 1001;
      this.encoding = 3000;
      this.anisotropy = 1;
      this.needsUpdate = true;
    }
  }

  const pmremCalls = { created: 0, fromScene: 0, disposedRT: 0, throwNext: false };

  class PMREMGenerator {
    constructor() { pmremCalls.created++; }
    fromScene() {
      pmremCalls.fromScene++;
      if (pmremCalls.throwNext) throw new Error('WebGL mock failure');
      const id = pmremCalls.fromScene;
      return {
        id,
        texture: { isEnvTexture: true, id },
        dispose() { pmremCalls.disposedRT++; },
      };
    }
    dispose() {}
  }

  class Scene { constructor() { this.children = []; this.environment = null; } add(o) { this.children.push(o); } }
  class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } }
  class SphereGeometry {
    constructor() {
      const count = 64;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const y = (i / (count - 1)) * 2 - 1;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        pos[i * 3] = r * 40; pos[i * 3 + 1] = y * 40; pos[i * 3 + 2] = 0;
      }
      this.attributes = { position: new BufferAttribute(pos, 3) };
    }
    setAttribute(name, attr) { this.attributes[name] = attr; }
  }
  class CircleGeometry { constructor() {} }
  class MeshBasicMaterial { constructor(opts = {}) { Object.assign(this, opts); this.color = new Color(opts.color ?? 0xffffff); } }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry; this.material = material;
      this.position = new Vector3();
    }
    lookAt() {}
  }

  const THREE = {
    RepeatWrapping: 1000,
    ClampToEdgeWrapping: 1001,
    sRGBEncoding: 3001,
    LinearEncoding: 3000,
    BackSide: 1,
    DoubleSide: 2,
    Color,
    Vector3,
    CanvasTexture,
    PMREMGenerator,
    Scene,
    SphereGeometry,
    CircleGeometry,
    BufferAttribute,
    MeshBasicMaterial,
    Mesh,
  };

  return { THREE, doc, pmremCalls };
}

function assertSeamlessEdges(data, size, label) {
  function rowDiff(yA, yB) {
    let sum = 0;
    for (let x = 0; x < size; x++) {
      const a = (yA * size + x) * 4;
      const b = (yB * size + x) * 4;
      sum += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
    }
    return sum / (size * 3);
  }
  function colDiff(xA, xB) {
    let sum = 0;
    for (let y = 0; y < size; y++) {
      const a = (y * size + xA) * 4;
      const b = (y * size + xB) * 4;
      sum += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
    }
    return sum / (size * 3);
  }

  const seamH = colDiff(0, size - 1);
  const nearH = Math.max(colDiff(0, 1), colDiff(size - 2, size - 1), colDiff(63, 64), colDiff(191, 192));
  const seamV = rowDiff(0, size - 1);
  const nearV = Math.max(rowDiff(0, 1), rowDiff(size - 2, size - 1), rowDiff(63, 64), rowDiff(191, 192));

  assert.ok(seamH <= Math.max(nearH * 1.25, 2.0), `${label} horizontal seam jump: ${seamH.toFixed(2)} vs neighbors ${nearH.toFixed(2)}`);
  assert.ok(seamV <= Math.max(nearV * 1.25, 2.0), `${label} vertical seam jump: ${seamV.toFixed(2)} vs neighbors ${nearV.toFixed(2)}`);
}

test('Textures.init builds all 14 seamless PBR sets and sprites with proper encodings, roughness & speed', () => {
  const { THREE, doc } = makeMockThreeAndDom();
  const T = loadTexturesWithBrowserMocks({ THREE, document: doc });
  const mockRenderer = { capabilities: { getMaxAnisotropy: () => 16 } };

  const t0 = performance.now();
  T.init(mockRenderer);
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 950, `Expected fast boot generation (<950ms for 14 PBR sets + 6 cards/sprites), got ${elapsed.toFixed(1)}ms`);

  const expectedFullSets = [
    ['grass', 0.78, 0.95],
    ['forest', 0.80, 0.96],
    ['sand', 0.65, 0.90],
    ['snow', 0.55, 0.82],
    ['rock', 0.68, 0.92],
    ['bark', 0.82, 0.98],
    ['leaves', 0.65, 0.88],
    ['stone', 0.72, 0.92],
    ['cloth', 0.75, 0.92],
    ['leather', 0.48, 0.72],
    ['fur', 0.70, 0.88],
    ['feather', 0.42, 0.78],
    ['scales', 0.30, 0.68],
  ];

  for (const [name, minR, maxR] of expectedFullSets) {
    const s = T.sets[name];
    assert.ok(s, `Missing texture set: ${name}`);
    assert.ok(s.map && s.normalMap && s.roughnessMap, `Set ${name} missing PBR maps`);
    assert.equal(s.map.image.width, 256);
    assert.equal(s.map.image.height, 256);
    assert.equal(s.map.encoding, THREE.sRGBEncoding, `${name}.map must use sRGBEncoding`);
    assert.equal(s.normalMap.encoding, THREE.LinearEncoding, `${name}.normalMap must use LinearEncoding`);
    assert.equal(s.roughnessMap.encoding, THREE.LinearEncoding, `${name}.roughnessMap must use LinearEncoding`);

    for (const tex of [s.map, s.normalMap, s.roughnessMap]) {
      assert.equal(tex.wrapS, THREE.RepeatWrapping);
      assert.equal(tex.wrapT, THREE.RepeatWrapping);
      assert.equal(tex.anisotropy, 4);
    }

    assertSeamlessEdges(s.map.image._data, 256, `${name}.map`);
    assertSeamlessEdges(s.normalMap.image._data, 256, `${name}.normalMap`);

    // Check roughness variation stays inside physical spec and has non-zero dynamic range
    const rData = s.roughnessMap.image._data;
    let rLo = 1;
    let rHi = 0;
    for (let i = 0; i < rData.length; i += 4) {
      const r = rData[i] / 255;
      if (r < rLo) rLo = r;
      if (r > rHi) rHi = r;
    }
    assert.ok(rLo >= minR - 0.02 && rHi <= maxR + 0.02, `${name} roughness [${rLo.toFixed(2)}, ${rHi.toFixed(2)}] outside [${minR}, ${maxR}]`);
    assert.ok(rHi - rLo > 0.05, `${name} roughness lacks variation: ${rLo}..${rHi}`);

    // Verify normal relief isn't flat
    const nData = s.normalMap.image._data;
    let maxDev = 0;
    for (let i = 0; i < nData.length; i += 16) {
      const dev = Math.abs(nData[i] - 128) + Math.abs(nData[i + 1] - 128);
      if (dev > maxDev) maxDev = dev;
    }
    assert.ok(maxDev >= 10, `${name}.normalMap relief is too weak (maxDev=${maxDev})`);
  }

  assert.ok(T.sets.waterNormal?.normalMap, 'waterNormal must have normalMap');
  assert.equal(T.sets.waterNormal.normalMap.encoding, THREE.LinearEncoding);
  assert.equal(T.sets.waterNormal.normalMap.wrapS, THREE.RepeatWrapping);
  assert.equal(T.sets.waterNormal.normalMap.wrapT, THREE.RepeatWrapping);
  assert.equal(T.sets.waterNormal.normalMap.anisotropy, 4);
  assertSeamlessEdges(T.sets.waterNormal.normalMap.image._data, 256, 'waterNormal.normalMap');

  assert.ok(T.glowSprite && T.glowSprite.image.width === 128);
  assert.ok(T.sparkleSprite && T.sparkleSprite.image.width === 128);
  assert.equal(T.glowSprite.image._data[3], 0);
  assert.equal(T.sparkleSprite.image._data[3], 0);
  // Center pixel of sprites must be bright opaque core
  const centerIdx = (64 * 128 + 64) * 4;
  assert.ok(T.glowSprite.image._data[centerIdx + 3] >= 245);
  assert.ok(T.sparkleSprite.image._data[centerIdx + 3] >= 245);

  // Broadleaf fern card, 512px botanical tree cards, and expressive Starkeeper face & radial iris textures
  assert.ok(T.oakLeafCard && T.oakLeafCard.image.width === 512 && T.oakLeafCard.image.height === 512, 'oakLeafCard must be 512x512');
  assert.equal(T.oakLeafCard.encoding, THREE.sRGBEncoding);
  assert.ok(T.pineBoughCard && T.pineBoughCard.image.width === 512 && T.pineBoughCard.image.height === 512, 'pineBoughCard must be 512x512');
  assert.equal(T.pineBoughCard.encoding, THREE.sRGBEncoding);
  assert.ok(T.pineSnowBoughCard && T.pineSnowBoughCard.image.width === 512 && T.pineSnowBoughCard.image.height === 512, 'pineSnowBoughCard must be 512x512');
  assert.equal(T.pineSnowBoughCard.encoding, THREE.sRGBEncoding);
  assert.ok(T.fernCard && T.fernCard.image.width === 128, 'fernCard must be 128x128');
  assert.equal(T.fernCard.encoding, THREE.sRGBEncoding);
  assert.ok(T.starkeeperFace && T.starkeeperFace.image.width === 256, 'starkeeperFace must be 256x256');
  assert.equal(T.starkeeperFace.encoding, THREE.sRGBEncoding);
  assert.ok(T.starkeeperIris && T.starkeeperIris.image.width === 128, 'starkeeperIris must be 128x128');
  assert.equal(T.starkeeperIris.encoding, THREE.sRGBEncoding);
  // Iris center (pupil) should be dark while upper-right catchlight is bright white
  const pupilIdx = (64 * 128 + 64) * 4;
  const glintIdx = (48 * 128 + 79) * 4;
  assert.ok(T.starkeeperIris.image._data[pupilIdx] < 45, 'iris pupil center must be dark');
  assert.ok(T.starkeeperIris.image._data[glintIdx] > 210, 'iris must include bright glossy catchlight');
});

test('Textures.updateEnvMap lazily creates PMREMGenerator, disposes old RT, and handles errors safely', () => {
  const { THREE, doc, pmremCalls } = makeMockThreeAndDom();
  const T = loadTexturesWithBrowserMocks({ THREE, document: doc });
  const mockRenderer = { capabilities: { getMaxAnisotropy: () => 4 } };
  const scene = new THREE.Scene();

  T.updateEnvMap(mockRenderer, scene, 0x1a2648, 0x3b4d6e, new THREE.Vector3(0.4, 0.7, 0.3), 0);
  assert.equal(pmremCalls.created, 1);
  assert.equal(pmremCalls.fromScene, 1);
  assert.equal(pmremCalls.disposedRT, 0);
  assert.ok(scene.environment && scene.environment.id === 1);

  T.updateEnvMap(mockRenderer, scene, 0x4ca2e8, 0x9bd2f2, { x: 0.5, y: 0.8, z: 0.2 }, 1.0);
  assert.equal(pmremCalls.created, 1, 'PMREMGenerator must be cached');
  assert.equal(pmremCalls.fromScene, 2);
  assert.equal(pmremCalls.disposedRT, 1, 'Previous envRT must be disposed');
  assert.ok(scene.environment && scene.environment.id === 2);

  // Error safety: should not throw or overwrite working environment
  pmremCalls.throwNext = true;
  assert.doesNotThrow(() => {
    T.updateEnvMap(mockRenderer, scene, 0x4ca2e8, 0x9bd2f2, { x: 0.5, y: 0.8, z: 0.2 }, 1.0);
  });
  assert.equal(scene.environment.id, 2);
});

test('Textures.init executes 2D canvas botanical card rendering cleanly at 512px for trees and 128px for ferns', () => {
  const { THREE } = makeMockThreeAndDom();
  let strokeCalls = 0;
  let fillCalls = 0;
  const mockDoc = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        _data: null,
        getContext() {
          return {
            strokeStyle: '',
            fillStyle: '',
            lineWidth: 1,
            lineCap: 'butt',
            createImageData(w, h) {
              return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
            },
            putImageData(img) { canvas._data = img.data; },
            clearRect() {},
            save() {},
            restore() {},
            translate() {},
            rotate() {},
            beginPath() {},
            closePath() {},
            moveTo() {},
            lineTo() {},
            quadraticCurveTo() {},
            bezierCurveTo() {},
            ellipse() {},
            arc() {},
            fill() { fillCalls++; },
            stroke() { strokeCalls++; },
          };
        },
      };
      return canvas;
    },
  };
  const T = loadTexturesWithBrowserMocks({ THREE, document: mockDoc });
  T.init({ capabilities: { getMaxAnisotropy: () => 8 } });
  assert.equal(T.oakLeafCard.image.width, 512);
  assert.equal(T.pineBoughCard.image.width, 512);
  assert.equal(T.pineSnowBoughCard.image.width, 512);
  assert.equal(T.fernCard.image.width, 128);
  assert.ok(fillCalls >= 48, `Expected >=48 leaf/pinna fills, got ${fillCalls}`);
  assert.ok(strokeCalls >= 60, `Expected >=60 botanical vein/needle strokes, got ${strokeCalls}`);
});
