import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadWorldMath() {
  const code = fs.readFileSync(new URL('../world.js', import.meta.url), 'utf8');
  const sandbox = {
    Math,
    Map,
    Set,
    Array,
    Float32Array,
    Uint16Array,
    console,
    __WORLD_MATH_ONLY__: true,
  };
  vm.runInNewContext(
    code +
      '\nthis.__W = { WATER_Y, CHUNK, VIEW_RADIUS, DAY_SKY_MAX_LIT, hash2, noise2, smoothstep, heightAt, terrainNormalAt, climateAt, surfaceAt, getNearbyColliders, setTotemCollider, clearTotemCollider };',
    sandbox
  );
  return sandbox.__W;
}

function makeMockThree() {
  class Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }
    setScalar(v) {
      this.x = v;
      this.y = v;
      return this;
    }
  }

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
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
    crossVectors(a, b) {
      this.x = a.y * b.z - a.z * b.y;
      this.y = a.z * b.x - a.x * b.z;
      this.z = a.x * b.y - a.y * b.x;
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
    applyAxisAngle(axis, angle) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const t = 1 - c;
      const x = this.x, y = this.y, z = this.z;
      const ax = axis.x, ay = axis.y, az = axis.z;
      const dot = ax * x + ay * y + az * z;
      this.x = x * c + (ay * z - az * y) * s + ax * dot * t;
      this.y = y * c + (az * x - ax * z) * s + ay * dot * t;
      this.z = z * c + (ax * y - ay * x) * s + az * dot * t;
      return this;
    }
  }

  class Euler {
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
  }

  class Matrix4 {
    constructor() {
      this.elements = new Float32Array(16);
      this.elements[0] = this.elements[5] = this.elements[10] = this.elements[15] = 1;
    }
    compose(pos, quat, scale) {
      this.elements[12] = pos.x;
      this.elements[13] = pos.y;
      this.elements[14] = pos.z;
      this.elements[0] = scale.x;
      this.elements[5] = scale.y;
      this.elements[10] = scale.z;
      return this;
    }
    copy(m) {
      this.elements.set(m.elements);
      return this;
    }
    multiplyMatrices() {
      return this;
    }
    makeTranslation(x, y, z) {
      this.elements[12] = x;
      this.elements[13] = y;
      this.elements[14] = z;
      return this;
    }
    makeRotationY() {
      return this;
    }
    makeRotationX() {
      return this;
    }
    makeRotationZ() {
      return this;
    }
    makeScale(x, y, z) {
      this.elements[0] = x;
      this.elements[5] = y;
      this.elements[10] = z;
      return this;
    }
  }

  class Quaternion {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
    }
    identity() {
      this.x = 0; this.y = 0; this.z = 0; this.w = 1;
      return this;
    }
    copy(q) {
      this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w;
      return this;
    }
    setFromEuler() {
      return this;
    }
    setFromUnitVectors() {
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
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
      return this;
    }
    copy(c) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      return this;
    }
    clone() {
      return new Color(this);
    }
    lerp(c, t) {
      this.r += (c.r - this.r) * t;
      this.g += (c.g - this.g) * t;
      this.b += (c.b - this.b) * t;
      return this;
    }
    lerpColors(c1, c2, t) {
      this.r = c1.r + (c2.r - c1.r) * t;
      this.g = c1.g + (c2.g - c1.g) * t;
      this.b = c1.b + (c2.b - c1.b) * t;
      return this;
    }
    offsetHSL(h, s, l) {
      this.r = Math.max(0, Math.min(1, this.r + l));
      this.g = Math.max(0, Math.min(1, this.g + l));
      this.b = Math.max(0, Math.min(1, this.b + l));
      return this;
    }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
      this.needsUpdate = false;
    }
    getX(i) {
      return this.array[i * this.itemSize];
    }
    getY(i) {
      return this.array[i * this.itemSize + 1];
    }
    getZ(i) {
      return this.array[i * this.itemSize + 2];
    }
    setXYZ(i, x, y, z) {
      const idx = i * this.itemSize;
      this.array[idx] = x;
      this.array[idx + 1] = y;
      this.array[idx + 2] = z;
    }
    setY(i, y) {
      this.array[i * this.itemSize + 1] = y;
    }
  }

  class BufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
      this.disposed = false;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      return this;
    }
    setIndex(idx) {
      this.index = Array.isArray(idx) ? new BufferAttribute(new Uint16Array(idx), 1) : idx;
      return this;
    }
    setDrawRange() {
      return this;
    }
    rotateX(angle) {
      const pos = this.attributes.position;
      if (!pos) return this;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const z = pos.getZ(i);
        pos.array[i * 3 + 1] = y * c - z * s;
        pos.array[i * 3 + 2] = y * s + z * c;
      }
      return this;
    }
    translate(tx, ty, tz) {
      const pos = this.attributes.position;
      if (!pos) return this;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] += tx;
        pos.array[i * 3 + 1] += ty;
        pos.array[i * 3 + 2] += tz;
      }
      return this;
    }
    scale(sx, sy, sz) {
      const pos = this.attributes.position;
      if (!pos) return this;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] *= sx;
        pos.array[i * 3 + 1] *= sy;
        pos.array[i * 3 + 2] *= sz;
      }
      return this;
    }
    computeVertexNormals() {
      const pos = this.attributes.position;
      if (pos && !this.attributes.normal) {
        const n = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) n[i * 3 + 1] = 1;
        this.attributes.normal = new BufferAttribute(n, 3);
      }
    }
    toNonIndexed() {
      return this;
    }
    clone() {
      const g = new BufferGeometry();
      for (const k in this.attributes) {
        const a = this.attributes[k];
        g.attributes[k] = new BufferAttribute(new a.array.constructor(a.array), a.itemSize);
      }
      if (this.index) {
        g.index = new BufferAttribute(new this.index.array.constructor(this.index.array), this.index.itemSize);
      }
      return g;
    }
    dispose() {
      this.disposed = true;
    }
  }

  class PlaneGeometry extends BufferGeometry {
    constructor(width = 1, height = 1, wSeg = 1, hSeg = 1) {
      super();
      const cols = wSeg + 1;
      const rows = hSeg + 1;
      const count = cols * rows;
      const pos = new Float32Array(count * 3);
      const norm = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      const indices = [];
      let p = 0;
      let u = 0;
      for (let iy = 0; iy < rows; iy++) {
        const v = iy / hSeg;
        const y = (0.5 - v) * height;
        for (let ix = 0; ix < cols; ix++) {
          const s = ix / wSeg;
          const x = (s - 0.5) * width;
          pos[p] = x;
          pos[p + 1] = y;
          pos[p + 2] = 0;
          norm[p + 2] = 1;
          uv[u] = s;
          uv[u + 1] = 1 - v;
          p += 3;
          u += 2;
        }
      }
      for (let iy = 0; iy < hSeg; iy++) {
        for (let ix = 0; ix < wSeg; ix++) {
          const a = ix + cols * iy;
          const b = ix + cols * (iy + 1);
          const c = ix + 1 + cols * (iy + 1);
          const d = ix + 1 + cols * iy;
          indices.push(a, b, d, b, c, d);
        }
      }
      this.setAttribute('position', new BufferAttribute(pos, 3));
      this.setAttribute('normal', new BufferAttribute(norm, 3));
      this.setAttribute('uv', new BufferAttribute(uv, 2));
      this.setIndex(indices);
    }
  }

  class RadialGeometry extends BufferGeometry {
    constructor(seg = 8, rings = 4, height = 1) {
      super();
      const cols = seg + 1;
      const rows = rings + 1;
      const count = cols * rows;
      const pos = new Float32Array(count * 3);
      const norm = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      const indices = [];
      let p = 0;
      let u = 0;
      for (let iy = 0; iy < rows; iy++) {
        const v = iy / rings;
        const y = (v - 0.5) * height;
        for (let ix = 0; ix < cols; ix++) {
          const a = (ix / seg) * Math.PI * 2;
          pos[p] = Math.cos(a) * 0.5;
          pos[p + 1] = y;
          pos[p + 2] = Math.sin(a) * 0.5;
          norm[p] = Math.cos(a);
          norm[p + 2] = Math.sin(a);
          uv[u] = ix / seg;
          uv[u + 1] = v;
          p += 3;
          u += 2;
        }
      }
      for (let iy = 0; iy < rings; iy++) {
        for (let ix = 0; ix < seg; ix++) {
          const a = ix + cols * iy;
          const b = ix + cols * (iy + 1);
          const c = ix + 1 + cols * (iy + 1);
          const d = ix + 1 + cols * iy;
          indices.push(a, b, d, b, c, d);
        }
      }
      this.setAttribute('position', new BufferAttribute(pos, 3));
      this.setAttribute('normal', new BufferAttribute(norm, 3));
      this.setAttribute('uv', new BufferAttribute(uv, 2));
      this.setIndex(indices);
    }
  }

  class CylinderGeometry extends RadialGeometry {
    constructor(rt = 1, rb = 1, h = 1, radSeg = 8, hSeg = 1) {
      super(radSeg, hSeg, h);
    }
  }

  class ConeGeometry extends RadialGeometry {
    constructor(r = 1, h = 1, radSeg = 8, hSeg = 1) {
      super(radSeg, hSeg, h);
    }
  }

  class SphereGeometry extends RadialGeometry {
    constructor(r = 1, wSeg = 8, hSeg = 6) {
      super(wSeg, hSeg, r * 2);
    }
  }

  class IcosahedronGeometry extends RadialGeometry {
    constructor(r = 1, detail = 1) {
      super(6 + detail * 4, 3 + detail * 2, r * 2);
    }
  }

  class Object3D {
    constructor() {
      this.position = new Vector3();
      this.rotation = new Euler();
      this.quaternion = new Quaternion();
      this.scale = new Vector3(1, 1, 1);
      this.matrix = new Matrix4();
      this.children = [];
      this.castShadow = false;
      this.receiveShadow = false;
    }
    add(...objs) {
      for (const o of objs) this.children.push(o);
      return this;
    }
    remove(obj) {
      const idx = this.children.indexOf(obj);
      if (idx >= 0) this.children.splice(idx, 1);
      return this;
    }
    updateMatrix() {
      this.matrix.compose(this.position, this.quaternion, this.scale);
    }
    updateMatrixWorld() {}
  }

  class Group extends Object3D {}

  class Scene extends Object3D {
    constructor() {
      super();
      this.background = null;
      this.fog = null;
      this.environment = null;
    }
  }

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.type = 'Mesh';
    }
  }

  class InstancedMesh extends Mesh {
    constructor(geometry, material, count) {
      super(geometry, material);
      this.count = count;
      this.type = 'InstancedMesh';
      this.isInstancedMesh = true;
      this.instanceMatrix = new BufferAttribute(new Float32Array(count * 16), 16);
      this.instanceColor = null;
    }
    setMatrixAt(i, matrix) {
      this.instanceMatrix.array.set(matrix.elements, i * 16);
    }
    setColorAt(i, color) {
      if (!this.instanceColor) {
        this.instanceColor = new BufferAttribute(new Float32Array(this.count * 3), 3);
      }
      this.instanceColor.array[i * 3] = color.r;
      this.instanceColor.array[i * 3 + 1] = color.g;
      this.instanceColor.array[i * 3 + 2] = color.b;
    }
  }

  class Points extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class LineSegments extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class Sprite extends Object3D {
    constructor(material) {
      super();
      this.material = material;
    }
  }

  class PerspectiveCamera extends Object3D {
    constructor(fov, aspect, near, far) {
      super();
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
    }
    updateProjectionMatrix() {}
  }

  class OrthographicCamera extends Object3D {
    constructor() {
      super();
      this.left = -1;
      this.right = 1;
      this.top = 1;
      this.bottom = -1;
      this.near = 0.5;
      this.far = 500;
    }
    updateProjectionMatrix() {}
  }

  class HemisphereLight extends Object3D {
    constructor(skyColor, groundColor, intensity = 1) {
      super();
      this.color = new Color(skyColor);
      this.groundColor = new Color(groundColor);
      this.intensity = intensity;
    }
  }

  class DirectionalLight extends Object3D {
    constructor(color, intensity = 1) {
      super();
      this.color = new Color(color);
      this.intensity = intensity;
      this.target = new Object3D();
      this.shadow = {
        mapSize: new Vector2(512, 512),
        camera: new OrthographicCamera(),
        bias: 0,
        normalBias: 0,
        map: {
          disposed: false,
          dispose() {
            this.disposed = true;
          },
        },
      };
    }
  }

  class MeshStandardMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
    }
  }
  class MeshBasicMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
    }
  }
  class ShaderMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
    }
  }
  class PointsMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
    }
  }
  class LineBasicMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
    }
  }
  class SpriteMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
    }
  }
  class CanvasTexture {
    constructor(canvas) {
      this.canvas = canvas;
    }
  }
  class Fog {
    constructor(color, near, far) {
      this.color = new Color(color);
      this.near = near;
      this.far = far;
    }
  }

  class WebGLRenderer {
    constructor(opts = {}) {
      this.opts = opts;
      this.domElement = { tagName: 'CANVAS' };
      this.shadowMap = { enabled: false, type: null };
      this.capabilities = { maxTextureSize: 4096 };
      this._pixelRatio = 1;
    }
    setSize() {}
    setPixelRatio(r) {
      this._pixelRatio = r;
    }
    getPixelRatio() {
      return this._pixelRatio;
    }
  }

  return {
    Vector2,
    Vector3,
    Euler,
    Matrix4,
    Quaternion,
    Color,
    BufferAttribute,
    BufferGeometry,
    PlaneGeometry,
    CylinderGeometry,
    ConeGeometry,
    SphereGeometry,
    IcosahedronGeometry,
    Object3D,
    Group,
    Scene,
    Mesh,
    InstancedMesh,
    Points,
    LineSegments,
    Sprite,
    PerspectiveCamera,
    OrthographicCamera,
    HemisphereLight,
    DirectionalLight,
    MeshStandardMaterial,
    MeshBasicMaterial,
    ShaderMaterial,
    PointsMaterial,
    LineBasicMaterial,
    SpriteMaterial,
    CanvasTexture,
    Fog,
    WebGLRenderer,
    DoubleSide: 2,
    BackSide: 1,
    sRGBEncoding: 3001,
    ACESFilmicToneMapping: 4,
    PCFSoftShadowMap: 2,
  };
}

function loadFullWorldWithMocks() {
  const code = fs.readFileSync(new URL('../world.js', import.meta.url), 'utf8');
  const THREE = makeMockThree();
  const envCalls = [];
  const shaderUpdates = [];
  let soundMuffled = null;
  let texInitCount = 0;

  const Textures = {
    sets: {
      grass: { map: {}, normalMap: {}, roughnessMap: {} },
      forest: { map: {}, normalMap: {}, roughnessMap: {} },
      sand: { map: {}, normalMap: {}, roughnessMap: {} },
      snow: { map: {}, normalMap: {}, roughnessMap: {} },
      rock: { map: {}, normalMap: {}, roughnessMap: {} },
      bark: { map: {}, normalMap: {}, roughnessMap: {} },
      leaves: { map: {}, normalMap: {}, roughnessMap: {} },
      stone: { map: {}, normalMap: {}, roughnessMap: {} },
      waterNormal: { normalMap: {} },
    },
    init(renderer) {
      texInitCount++;
      this._renderer = renderer;
    },
    updateEnvMap(renderer, scene, topColor, botColor, sunDir, progress) {
      envCalls.push({ renderer, scene, topColor, botColor, sunDir, progress });
    },
  };

  const Shaders = {
    createTerrainMaterial: () => new THREE.MeshStandardMaterial({ name: 'terrainShaderMat' }),
    createWaterMaterial: () => new THREE.ShaderMaterial({ name: 'waterShaderMat' }),
    createHorizonWaterMaterial: () => new THREE.ShaderMaterial({ name: 'horizonShaderMat' }),
    createGrassMaterial: () => new THREE.MeshStandardMaterial({ vertexColors: true, name: 'grassShaderMat' }),
    createKelpMaterial: () => new THREE.MeshStandardMaterial({ name: 'kelpShaderMat' }),
    createSkyDome: () => ({
      mesh: new THREE.Mesh(new THREE.SphereGeometry(460, 16, 12), new THREE.ShaderMaterial()),
      material: new THREE.ShaderMaterial(),
    }),
    update(time, playerPos, camPos, sunDir, progress, skyTop, skyMid, skyBot, fogColor, fogNear, fogFar) {
      shaderUpdates.push({ time, playerPos, camPos, sunDir, progress, fogNear, fogFar });
    },
  };

  const Sound = {
    setMuffled(v) {
      soundMuffled = v;
    },
  };

  const appended = [];
  const document = {
    body: {
      appendChild(el) {
        appended.push(el);
      },
    },
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            font: '',
            fillStyle: '',
            textAlign: '',
            textBaseline: '',
            shadowColor: '',
            shadowBlur: 0,
            fillText() {},
          };
        },
      };
    },
  };

  const sandbox = {
    Math,
    Map,
    Set,
    Array,
    Float32Array,
    Uint16Array,
    console,
    THREE,
    Textures,
    Shaders,
    Sound,
    document,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    addEventListener() {},
  };

  vm.runInNewContext(
    code +
      '\nthis.__World = { WATER_Y, CHUNK, VIEW_RADIUS, DAY_SKY_MAX_LIT, scene, camera, renderer, sun, hemiLight, heightAt, terrainNormalAt, climateAt, surfaceAt, terrainColor, getNearbyColliders, setTotemCollider, clearTotemCollider, updateChunks, setQuality, getQuality, getViewRadius, updateChunkCulling, isChunkCulled, setSkyProgress, updateEnvironment, addConstellation, constellationNameFor, landSpot, waterSpot, chunks };',
    sandbox
  );

  return {
    W: sandbox.__World,
    THREE,
    envCalls,
    shaderUpdates,
    getTexInitCount: () => texInitCount,
    getSoundMuffled: () => soundMuffled,
    appended,
  };
}

test('heightAt is deterministic and terrainNormalAt matches finite differences', () => {
  const W = loadWorldMath();
  const pts = [
    [0, 0],
    [18.5, -42.3],
    [120, 85],
    [-77, 31],
  ];
  const n = { x: 0, y: 0, z: 0 };
  const eps = 0.25;
  for (const [x, z] of pts) {
    const h1 = W.heightAt(x, z);
    const h2 = W.heightAt(x, z);
    assert.equal(h1, h2);
    const ret = W.terrainNormalAt(x, z, n);
    assert.equal(ret, n, 'terrainNormalAt must write into provided out object');
    const len = Math.hypot(n.x, n.y, n.z);
    assert.ok(Math.abs(len - 1) < 1e-5, `Normal length ${len}`);
    assert.ok(n.y > 0, 'Terrain normal must point upward');

    const dhdx = (W.heightAt(x + eps, z) - W.heightAt(x - eps, z)) / (2 * eps);
    const dhdz = (W.heightAt(x, z + eps) - W.heightAt(x, z - eps)) / (2 * eps);
    const fLen = Math.hypot(-dhdx, 1, -dhdz);
    assert.ok(Math.abs(n.x - -dhdx / fLen) < 0.05, `Normal x mismatch at (${x}, ${z})`);
    assert.ok(Math.abs(n.y - 1 / fLen) < 0.05, `Normal y mismatch at (${x}, ${z})`);
    assert.ok(Math.abs(n.z - -dhdz / fLen) < 0.05, `Normal z mismatch at (${x}, ${z})`);
  }
});

test('climateAt weights are non-negative and sum to ~1', () => {
  const W = loadWorldMath();
  const out = { desert: 0, snow: 0, forest: 0, meadow: 0 };
  for (let x = -200; x <= 200; x += 47) {
    for (let z = -200; z <= 200; z += 53) {
      const ret = W.climateAt(x, z, out);
      assert.equal(ret, out, 'climateAt must populate provided out object');
      const sum = out.desert + out.snow + out.forest + out.meadow;
      assert.ok(Math.abs(sum - 1) < 1e-5, `Climate sum ${sum}`);
      assert.ok(out.desert >= 0 && out.snow >= 0 && out.forest >= 0 && out.meadow >= 0);
    }
  }
});

test('surfaceAt returns valid terrain material tags', () => {
  const W = loadWorldMath();
  const valid = new Set(['water', 'sand', 'snow', 'stone', 'grass']);
  for (let i = -10; i < 10; i++) {
    const s = W.surfaceAt(i * 19, i * -23);
    assert.ok(valid.has(s), `Invalid surface tag: ${s}`);
  }
});

test('getNearbyColliders handles totem collider and zero-GC array reuse in math mode', () => {
  const W = loadWorldMath();
  const out = [{ x: 999, z: 999, r: 999 }];
  W.clearTotemCollider();
  const emptyRet = W.getNearbyColliders(0, 0, 10, out);
  assert.equal(emptyRet, out);
  assert.equal(out.length, 0);

  W.setTotemCollider(12, -8, 1.1);
  W.getNearbyColliders(10, -7, 5, out);
  assert.equal(out.length, 1);
  assert.equal(out[0].x, 12);
  assert.equal(out[0].z, -8);
  assert.equal(out[0].r, 1.1);

  W.getNearbyColliders(40, 40, 5, out);
  assert.equal(out.length, 0);

  W.clearTotemCollider();
  W.getNearbyColliders(12, -8, 5, out);
  assert.equal(out.length, 0);
});

test('chunk streaming, water aBedHeight, grass uvs, colliders, quality, and environment work cleanly', () => {
  const { W, THREE, envCalls, shaderUpdates, getTexInitCount, getSoundMuffled } = loadFullWorldWithMocks();

  assert.equal(W.WATER_Y, 0);
  assert.equal(W.CHUNK, 32);
  assert.equal(W.VIEW_RADIUS, 3);
  assert.equal(W.DAY_SKY_MAX_LIT, 8);
  assert.equal(getTexInitCount(), 1, 'Textures.init(renderer) must run once at boot');
  assert.equal(W.renderer.outputEncoding, THREE.sRGBEncoding);
  assert.equal(W.renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(W.renderer.shadowMap.enabled, true);
  assert.equal(W.renderer.shadowMap.type, THREE.PCFSoftShadowMap);
  assert.ok(envCalls.length >= 1, 'Initial PMREM envMap must be generated');

  // Build initial chunk ring around origin (ocean area -> guarantees water tiles & kelp)
  for (let i = 0; i < 55; i++) {
    W.updateChunks(0, 0);
  }
  assert.ok(W.chunks.size >= 49, `Expected >=49 chunks in 7x7 ring, got ${W.chunks.size}`);

  let sawWaterTile = false;
  let sawKelp = false;
  let originChunk = null;
  const sharedGeos = new Set();

  for (const chunk of W.chunks.values()) {
    if (chunk.cx === 0 && chunk.cz === 0) originChunk = chunk;
    for (const m of chunk.meshes) {
      if (m.geometry && m.geometry.attributes && m.geometry.attributes.aBedHeight) {
        sawWaterTile = true;
        assert.ok(m.geometry.attributes.aBedHeight.count > 0);
      }
      if (m.isInstancedMesh) {
        sharedGeos.add(m.geometry);
        if (m.material && m.material.name === 'kelpShaderMat') {
          sawKelp = true;
          const arr = m.instanceMatrix.array;
          for (let i = 0; i < m.count; i++) {
            const baseY = arr[i * 16 + 13];
            const sy = arr[i * 16 + 5];
            const kelpTopY = baseY + sy * 3.3;
            assert.ok(kelpTopY < W.WATER_Y - 0.3, `Kelp tip must remain submerged: ${kelpTopY}`);
          }
        }
      }
    }
  }
  assert.ok(sawWaterTile, 'Expected at least one chunk water tile with aBedHeight');
  assert.ok(sawKelp, 'Expected submerged kelp instances in ocean chunks');
  assert.ok(originChunk, 'Origin chunk (0, 0) must exist');
  const originMeshes = [...originChunk.meshes];
  const originUniqueGeos = [...originChunk.uniqueGeos];

  // Find a deterministic land continent far enough from (0, 0) so origin unloads cleanly
  let landX = 0;
  let landZ = 0;
  let foundLand = false;
  for (let r = 200; r < 600 && !foundLand; r += 24) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const tx = Math.cos(a) * r;
      const tz = Math.sin(a) * r;
      if (W.heightAt(tx, tz) > 2.5) {
        landX = tx;
        landZ = tz;
        foundLand = true;
        break;
      }
    }
  }
  assert.ok(foundLand, 'Must find a land continent');

  for (let i = 0; i < 55; i++) {
    W.updateChunks(landX, landZ);
  }

  // Verify origin chunk unloaded cleanly: removed from chunks & scene, unique geos disposed, shared geos intact
  for (const chunk of W.chunks.values()) {
    assert.ok(!(chunk.cx === 0 && chunk.cz === 0), 'Origin chunk (0, 0) should be unloaded');
  }
  for (const m of originMeshes) {
    assert.ok(!W.scene.children.includes(m), 'Unloaded chunk mesh must be removed from scene');
  }
  for (const g of originUniqueGeos) {
    assert.equal(g.disposed, true, 'Chunk-unique terrain/water geometry must be disposed on unload');
  }
  for (const sg of sharedGeos) {
    assert.equal(sg.disposed, false, 'Shared prop/kelp geometry must NOT be disposed on chunk unload');
  }

  let sawGrass = false;
  let sawPropCollider = false;
  let highGrassCount = 0;
  const testOut = [];

  for (const chunk of W.chunks.values()) {
    assert.ok(Array.isArray(chunk.meshes) && chunk.meshes.length >= 1);
    assert.ok(Array.isArray(chunk.colliders));
    const terrain = chunk.meshes[0];
    assert.equal(terrain.receiveShadow, true);
    assert.equal(terrain.castShadow, false);

    if (chunk.colliders.length > 0) {
      sawPropCollider = true;
      const sample = chunk.colliders[0];
      W.getNearbyColliders(sample.x, sample.z, 2.5, testOut);
      assert.ok(
        testOut.some(c => c.x === sample.x && c.z === sample.z && c.r === sample.r),
        'getNearbyColliders must find chunk prop colliders'
      );
      for (const c of chunk.colliders) {
        assert.ok(typeof c.topY === 'number' && Number.isFinite(c.topY), 'Prop collider must include numeric topY');
      }
    }

    for (const m of chunk.meshes) {
      if (m.isInstancedMesh) {
        assert.equal(m.frustumCulled, false, 'InstancedMesh should disable frustumCulled in r128');
      }
      if (m.isInstancedMesh && m.material && m.material.name === 'grassShaderMat' && m.count > 72) {
        sawGrass = true;
        highGrassCount = Math.max(highGrassCount, m.count);
        const uv = m.geometry.attributes.uv;
        assert.ok(uv, 'Grass geometry must have UVs for wind/trample vertex shader');
        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = 0; i < uv.count; i++) {
          const v = uv.array[i * 2 + 1];
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        assert.ok(minV >= 0 && minV <= 0.05 && maxV >= 0.95 && maxV <= 1.0, `Grass uv.y range [${minV}, ${maxV}]`);
      }
    }
  }

  assert.ok(sawPropCollider, 'Expected sculpted prop colliders in built land chunks');
  assert.ok(sawGrass, 'Expected instanced grass in built land chunks');
  assert.ok(highGrassCount > 640, `High quality full-coverage grass count should exceed balanced cap 640 (got ${highGrassCount})`);

  // Quality switching
  assert.equal(W.getQuality(), 'high');
  const prevShadowMap = W.sun.shadow.map;
  W.setQuality('balanced');
  assert.equal(W.getQuality(), 'balanced');
  assert.equal(W.renderer.getPixelRatio(), 1.25);
  assert.equal(W.sun.shadow.mapSize.x, 1024);
  assert.equal(prevShadowMap.disposed, true, 'Old shadow map should be disposed on resize');

  // Refresh loaded chunks on balanced quality and confirm grass density drops <= 640
  for (let i = 0; i < 30; i++) {
    W.updateChunks(landX, landZ);
  }
  let balancedGrassMax = 0;
  for (const chunk of W.chunks.values()) {
    for (const m of chunk.meshes) {
      if (m.isInstancedMesh && m.material && m.material.name === 'grassShaderMat' && m.count > 72) {
        balancedGrassMax = Math.max(balancedGrassMax, m.count);
      }
    }
  }
  assert.ok(
    balancedGrassMax > 0 && balancedGrassMax <= 640 && balancedGrassMax < highGrassCount,
    `Balanced grass max ${balancedGrassMax} should be <= 640 and below high ${highGrassCount}`
  );

  W.setQuality('high');
  assert.equal(W.getQuality(), 'high');
  assert.equal(W.renderer.getPixelRatio(), 2);
  assert.equal(W.sun.shadow.mapSize.x, 2048);

  // Environment + underwater fog + texel-snapped shadow camera
  W.setSkyProgress(4);
  assert.ok(envCalls.length >= 2, 'setSkyProgress should update PMREM envMap');
  W.updateEnvironment(-2.0, landX + 2.34, landZ - 7.89, 5.5, 0.016);
  assert.equal(getSoundMuffled(), true);
  assert.ok(shaderUpdates.length >= 1);

  W.updateEnvironment(2.0, landX + 2.34, landZ - 7.89, 5.6); // omit dt to verify optional dt
  assert.equal(getSoundMuffled(), false);

  // Far-from-origin light-space texel-snapped shadow tracking (preserves _sunDir depth component)
  const texelSize = 72 / W.sun.shadow.mapSize.x;
  for (const [fx, fz] of [[500, 500], [-500, -500]]) {
    W.updateEnvironment(2.0, fx, fz); // omit time & dt to verify defaults
    const py = W.heightAt(fx, fz);
    const targetDist = Math.hypot(
      W.sun.target.position.x - fx,
      W.sun.target.position.y - py,
      W.sun.target.position.z - fz
    );
    assert.ok(
      targetDist <= texelSize * 2,
      `Shadow target drifted at (${fx}, ${fz}): ${targetDist} > ${texelSize * 2}`
    );
    const sunDist = Math.hypot(
      W.sun.position.x - W.sun.target.position.x,
      W.sun.position.y - W.sun.target.position.y,
      W.sun.position.z - W.sun.target.position.z
    );
    assert.ok(Math.abs(sunDist - 75) < 1e-4, `Sun distance should remain ~75, got ${sunDist}`);
    assert.ok(
      sunDist > W.sun.shadow.camera.near && sunDist < W.sun.shadow.camera.far,
      'Sun target must stay well inside shadow frustum depth'
    );
  }

  // Spawners
  const land = W.landSpot(landX, landZ, 5, 60, 0.6);
  if (land) assert.ok(land.h >= 0.6);
  const sea = W.waterSpot(0, 0, 5, 160);
  if (sea) assert.ok(sea.h <= W.WATER_Y - 1.6);
});

function loadFullWorldWithEnvMocks() {
  const code = fs.readFileSync(new URL('../world.js', import.meta.url), 'utf8');
  const THREE = makeMockThree();
  const envCalls = [];
  const shaderUpdates = [];
  const foliagePatches = [];
  const treeWindPatches = [];
  const initSceneCalls = [];
  const preloadAllCalls = [];
  const setSkyCalls = [];
  const setQualityCalls = [];
  const updateCalls = [];
  const swapCalls = [];
  const unregisterCalls = [];

  const celState = {
    sunDir: new THREE.Vector3(0.88, -0.26, 0.28).normalize(),
    moonDir: new THREE.Vector3(-0.38, 0.72, -0.32).normalize(),
    shadowDir: new THREE.Vector3(-0.38, 0.72, -0.32).normalize(),
    sunColor: new THREE.Color(0x7ea6e4),
    moonColor: new THREE.Color(0x9abcf5),
    skyTop: new THREE.Color(0x050918),
    skyMid: new THREE.Color(0x0d1732),
    skyBot: new THREE.Color(0x1a284a),
    hemiSky: new THREE.Color(0x2e4875),
    hemiGround: new THREE.Color(0x0e151c),
    sunIntensity: 0.5,
    hemiIntensity: 0.24,
    shadowStrength: 1.0,
    nightFactor: 1.0,
    starAlpha: 1.0,
    dayProgress: 0.0,
    lit: 0,
    cycleTime: 0,
  };

  let mockLit = 0;
  let mockCycle = 0;
  const Env = {
    PROP_KEYS: [
      'oak_tree', 'birch_tree', 'pine_tree', 'pine_snow', 'willow_tree', 'palm_tree',
      'cactus_flower', 'bush_berry', 'boulder_moss', 'boulder_rock', 'fallen_log',
      'tree_stump', 'lilypad', 'ruin_arch', 'ruin_column', 'ruin_column_broken', 'shrine_pedestal',
    ],
    initScene(sc, deps) {
      initSceneCalls.push({ sc, deps });
      return { scene: sc };
    },
    preloadAll(deps) {
      preloadAllCalls.push(deps);
    },
    computeCelestialState(lit, cycleTime = 0) {
      mockLit = lit;
      mockCycle = cycleTime;
      const p = Math.min(1, Math.max(0, lit / 8));
      if (lit < 8) {
        celState.sunDir.set(0.88 * (1 - p) + 0.45 * p, -0.26 + p * 1.04, 0.28 + p * 0.08).normalize();
        celState.moonDir.set(-0.38, 0.72 - p * 1.46, -0.32).normalize();
        celState.nightFactor = 1 - p;
        celState.dayProgress = p;
      } else {
        const ang = (cycleTime / 720) * Math.PI * 2;
        celState.sunDir.set(0.45 * Math.cos(ang) - 0.82 * Math.sin(ang), 0.78 * Math.cos(ang), 0.36 * Math.cos(ang)).normalize();
        celState.moonDir.set(-0.45 * Math.cos(ang) + 0.72 * Math.sin(ang), -0.74 * Math.cos(ang), -0.36 * Math.cos(ang)).normalize();
        celState.nightFactor = celState.sunDir.y < 0 ? 1 : 0;
        celState.dayProgress = Math.max(0, Math.min(1, (celState.sunDir.y + 0.3) / 0.7));
      }
      celState.shadowDir.copy(celState.sunDir.y >= 0 ? celState.sunDir : celState.moonDir);
      if (celState.shadowDir.y < 0.12) celState.shadowDir.y = 0.12;
      celState.shadowDir.normalize();
      celState.lit = lit;
      celState.cycleTime = cycleTime;
      return celState;
    },
    setSkyProgress(lit) {
      setSkyCalls.push(lit);
      return this.computeCelestialState(lit, lit >= 8 ? 0 : mockCycle);
    },
    getCelestialState() {
      return celState;
    },
    setQuality(mode) {
      setQualityCalls.push(mode);
      return mode;
    },
    update(dt, time, ctx) {
      updateCalls.push({ dt, time, px: ctx.px, py: ctx.py, pz: ctx.pz, camY: ctx.camY, underwater: ctx.underwater });
      if (mockLit >= 8) {
        mockCycle += dt || 0;
        this.computeCelestialState(mockLit, mockCycle);
      }
    },
    registerInstancedSwap(key, target, opts) {
      swapCalls.push({ key, target, opts });
      return { key, target, opts };
    },
    unregisterChunk(chunk) {
      unregisterCalls.push(chunk);
    },
  };

  const Textures = {
    sets: {
      grass: { map: {}, normalMap: {}, roughnessMap: {} },
      forest: { map: {}, normalMap: {}, roughnessMap: {} },
      sand: { map: {}, normalMap: {}, roughnessMap: {} },
      snow: { map: {}, normalMap: {}, roughnessMap: {} },
      rock: { map: {}, normalMap: {}, roughnessMap: {} },
      bark: { map: {}, normalMap: {}, roughnessMap: {} },
      leaves: { map: {}, normalMap: {}, roughnessMap: {} },
      stone: { map: {}, normalMap: {}, roughnessMap: {} },
      waterNormal: { normalMap: {} },
    },
    oakLeafCard: {},
    pineBoughCard: {},
    pineSnowBoughCard: {},
    fernCard: {},
    init() {},
    updateEnvMap(renderer, scene, topColor, botColor, sunDir, progress) {
      envCalls.push({ renderer, scene, topColor, botColor, sunDir, progress });
    },
  };

  const Shaders = {
    createTerrainMaterial: () => new THREE.MeshStandardMaterial({ name: 'terrainShaderMat' }),
    createWaterMaterial: () => new THREE.ShaderMaterial({ name: 'waterShaderMat' }),
    createHorizonWaterMaterial: () => new THREE.ShaderMaterial({ name: 'horizonShaderMat' }),
    createGrassMaterial: () => new THREE.MeshStandardMaterial({ vertexColors: true, name: 'grassShaderMat' }),
    createKelpMaterial: () => new THREE.MeshStandardMaterial({ name: 'kelpShaderMat' }),
    createSkyDome: () => ({
      mesh: new THREE.Mesh(new THREE.SphereGeometry(460, 16, 12), new THREE.ShaderMaterial()),
      material: new THREE.ShaderMaterial(),
    }),
    patchTreeWind(mat, isFoliage) {
      treeWindPatches.push({ mat, isFoliage });
      return mat;
    },
    patchFoliageReactive(mat, opts) {
      foliagePatches.push({ mat, opts });
      return mat;
    },
    setCelestial() {},
    update(time, playerPos, camPos, sunDir, progress, skyTop, skyMid, skyBot, fogColor, fogNear, fogFar) {
      shaderUpdates.push({ time, playerPos, camPos, sunDir, progress, fogNear, fogFar });
    },
  };

  // Load real Regions math from regions.js (without buildWorldLandmarks) so all 6 biomes exist deterministically
  const regionsCode = fs.readFileSync(new URL('../regions.js', import.meta.url), 'utf8');
  const regSandbox = { Math, Map, Set, Array, console };
  vm.runInNewContext(regionsCode + '\nthis.__Regions = Regions;', regSandbox);
  const Regions = {
    getElevationMod: regSandbox.__Regions.getElevationMod,
    getClimateMod: regSandbox.__Regions.getClimateMod,
    getTrailWeight: regSandbox.__Regions.getTrailWeight,
    regionAt: regSandbox.__Regions.regionAt,
  };

  const document = {
    body: { appendChild() {} },
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            font: '', fillStyle: '', textAlign: '', textBaseline: '',
            shadowColor: '', shadowBlur: 0, fillText() {},
          };
        },
      };
    },
  };

  const sandbox = {
    Math, Map, Set, Array, Float32Array, Uint16Array, console,
    THREE, Textures, Shaders, Env, Regions, document,
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    addEventListener() {},
  };

  vm.runInNewContext(
    code +
      '\nthis.__World = { WATER_Y, CHUNK, VIEW_RADIUS, DAY_SKY_MAX_LIT, scene, camera, renderer, sun, hemiLight, heightAt, terrainNormalAt, climateAt, surfaceAt, getNearbyColliders, updateChunks, setQuality, getQuality, setSkyProgress, updateEnvironment, chunks };',
    sandbox
  );

  return {
    W: sandbox.__World,
    THREE,
    Env,
    celState,
    initSceneCalls,
    preloadAllCalls,
    setSkyCalls,
    setQualityCalls,
    updateCalls,
    swapCalls,
    unregisterCalls,
    foliagePatches,
    treeWindPatches,
    shaderUpdates,
  };
}

test('World integrates Env celestial moonlight handoff, reactive bushes/ferns, expanded biome props, and GLB hot-swap safely', () => {
  const {
    W,
    THREE,
    celState,
    initSceneCalls,
    preloadAllCalls,
    setSkyCalls,
    setQualityCalls,
    updateCalls,
    swapCalls,
    unregisterCalls,
    foliagePatches,
    shaderUpdates,
  } = loadFullWorldWithEnvMocks();

  // 1. Env boot hooks & legacy star suppression
  assert.equal(initSceneCalls.length, 1, 'Env.initScene(scene, ...) must run once at boot');
  assert.equal(initSceneCalls[0].sc, W.scene);
  assert.equal(preloadAllCalls.length, 1, 'Env.preloadAll(...) must run once at boot');
  const legacyStars = W.scene.children.find(o => o instanceof THREE.Points && o.material && o.material.size === 2.6);
  assert.ok(legacyStars, 'Legacy starfield object should exist for non-Env fallback');
  assert.equal(legacyStars.visible, false, 'Legacy square starfield points must hide when Env spectral starfield is active');

  // 2. Reactive foliage shader patching on fern, reed, and bush (without corrupting grassMat)
  assert.ok(foliagePatches.length >= 3, `Expected >=3 Shaders.patchFoliageReactive calls (fern, reed, bush), got ${foliagePatches.length}`);
  assert.equal(foliagePatches.some(p => p.mat && p.mat.name === 'grassShaderMat'), false, 'reed reactive patch must NOT mutate shared grassMat');

  // 3. Moonlit shadow handoff at lit=0 vs sunlit at lit=8 (always distance 75u)
  W.setSkyProgress(0);
  assert.ok(setSkyCalls.includes(0));
  const vx0 = W.sun.position.x - W.sun.target.position.x;
  const vy0 = W.sun.position.y - W.sun.target.position.y;
  const vz0 = W.sun.position.z - W.sun.target.position.z;
  const d0 = Math.hypot(vx0, vy0, vz0);
  assert.ok(Math.abs(d0 - 75) < 1e-4, `lit=0 shadow light distance must be 75, got ${d0}`);
  const dotMoon = (vx0 * celState.moonDir.x + vy0 * celState.moonDir.y + vz0 * celState.moonDir.z) / d0;
  assert.ok(dotMoon > 0.98, `lit=0 shadow light must align with moonDir (dot=${dotMoon})`);

  W.setSkyProgress(8);
  const vx8 = W.sun.position.x - W.sun.target.position.x;
  const vy8 = W.sun.position.y - W.sun.target.position.y;
  const vz8 = W.sun.position.z - W.sun.target.position.z;
  const d8 = Math.hypot(vx8, vy8, vz8);
  assert.ok(Math.abs(d8 - 75) < 1e-4, `lit=8 shadow light distance must be 75, got ${d8}`);
  const dotSun = (vx8 * celState.sunDir.x + vy8 * celState.sunDir.y + vz8 * celState.sunDir.z) / d8;
  assert.ok(dotSun > 0.98, `lit=8 shadow light must align with sunDir (dot=${dotSun})`);

  // 4. Env.update forwarded cleanly by updateEnvironment and live cycle shifts shadow light at 75u
  W.updateEnvironment(3.5, 10, -8, 12.0, 0.016);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].dt, 0.016);
  assert.equal(updateCalls[0].time, 12.0);
  assert.equal(updateCalls[0].px, 10);
  assert.equal(updateCalls[0].pz, -8);
  assert.ok(shaderUpdates.length >= 1);

  // Advance half a 720s cycle (360s -> night in live cycle!) and confirm shadow light hands off back to moonDir at 75u
  W.updateEnvironment(3.5, 10, -8, 372.0, 360.0);
  const vxN = W.sun.position.x - W.sun.target.position.x;
  const vyN = W.sun.position.y - W.sun.target.position.y;
  const vzN = W.sun.position.z - W.sun.target.position.z;
  const dN = Math.hypot(vxN, vyN, vzN);
  assert.ok(Math.abs(dN - 75) < 1e-4, `Post-8/8 live night cycle shadow light distance must remain 75, got ${dN}`);
  const dotLiveMoon = (vxN * celState.moonDir.x + vyN * celState.moonDir.y + vzN * celState.moonDir.z) / dN;
  assert.ok(dotLiveMoon > 0.90, `Post-8/8 live night cycle should hand shadow light back to moonDir (dot=${dotLiveMoon})`);

  // 5. Build chunks across all biomes (meadow, forest, coast cove, sunken bay, canyon oasis, frostpeak)
  const sampleCenters = [
    [0, 0],       // Star Sanctuary / meadow
    [62, -78],    // Whispering Forest (pine, oak, birch, bush, fallenLog, stump, boulder_moss)
    [36, 62],     // Twilight Coast cove (willow, palm, lilypad, boulder_rock)
    [-86, -14],   // Canyon Oasis (cactus_flower, palm, willow, lilypad, boulder_rock)
    [-68, -88],   // Frostpeak (pine_snow, boulder_rock)
  ];
  let standableCount = 0;
  for (const [cx, cz] of sampleCenters) {
    for (let i = 0; i < 12; i++) {
      W.updateChunks(cx, cz);
    }
    for (const chunk of W.chunks.values()) {
      for (const c of chunk.colliders) {
        if (c.standable) {
          standableCount++;
          assert.ok(typeof c.topY === 'number' && Number.isFinite(c.topY));
          assert.ok(c.r > 0.25 && c.r < 2.0);
        }
      }
    }
  }
  assert.ok(unregisterCalls.length > 0, 'Moving across regions must unload distant chunks and call Env.unregisterChunk');
  assert.ok(standableCount >= 5, `Expected standable boulder/log/stump colliders, got ${standableCount}`);

  // Verify 24x24 water grid in high quality around Twilight Cove / Sunken Bay before switching to balanced
  for (let i = 0; i < 12; i++) W.updateChunks(24, 64);
  let sawHighWater = false;
  for (const chunk of W.chunks.values()) {
    for (const m of chunk.meshes) {
      if (m.geometry && m.geometry.attributes && m.geometry.attributes.aBedHeight) {
        assert.equal(m.geometry.attributes.aBedHeight.count, 625, 'High quality water tile must be 24x24 (625 vertices)');
        sawHighWater = true;
      }
    }
  }
  assert.ok(sawHighWater, 'Must inspect at least one 24x24 water tile in high quality');

  // 6. setQuality('balanced') forwards to Env.setQuality & shrinks water grid to 16x16 (289 vertices)
  W.setQuality('balanced');
  assert.ok(setQualityCalls.includes('balanced'), 'setQuality must forward mode to Env.setQuality');
  let sawBalancedWater = false;
  for (const chunk of W.chunks.values()) {
    for (const m of chunk.meshes) {
      if (m.geometry && m.geometry.attributes && m.geometry.attributes.aBedHeight) {
        assert.equal(m.geometry.attributes.aBedHeight.count, 289, 'Balanced quality water tile must shrink to 16x16 (289 vertices)');
        sawBalancedWater = true;
      }
    }
  }
  assert.ok(sawBalancedWater, 'Must verify 16x16 water tiles after setQuality(balanced)');

  // 7. Verify all 13 nature/prop GLB keys were registered with Env.registerInstancedSwap + valid chunk refs & scaleAdjust
  const swappedKeys = new Set(swapCalls.map(s => s.key));
  const expectedKeys = [
    'oak_tree', 'birch_tree', 'pine_tree', 'pine_snow',
    'willow_tree', 'palm_tree', 'cactus_flower', 'bush_berry',
    'boulder_moss', 'boulder_rock', 'fallen_log', 'tree_stump', 'lilypad',
  ];
  for (const k of expectedKeys) {
    assert.ok(swappedKeys.has(k), `Expected Env.registerInstancedSwap for prop key '${k}', got [${[...swappedKeys].join(', ')}]`);
  }
  for (const sc of swapCalls) {
    assert.ok(sc.opts && sc.opts.chunk && Array.isArray(sc.opts.chunk.meshes), `Swap '${sc.key}' must bind chunk for unload cancellation`);
    if (sc.key === 'cactus_flower') {
      assert.ok(sc.opts.scaleAdjust > 0.35 && sc.opts.scaleAdjust < 0.80, `cactus_flower scaleAdjust should normalize wide cluster, got ${sc.opts.scaleAdjust}`);
    }
    if (sc.key === 'pine_tree' || sc.key === 'pine_snow') {
      assert.ok(sc.opts.scaleAdjust > 1.05, `pine swap must compensate 0.85 trunk scale, got ${sc.opts.scaleAdjust}`);
    }
  }
});

test('World + real Env integration is zero-GC in steady-state updateEnvironment and forwards quality/sky cleanly', () => {
  const worldCode = fs.readFileSync(new URL('../world.js', import.meta.url), 'utf8');
  const envCode = fs.readFileSync(new URL('../env.js', import.meta.url), 'utf8');
  const baseTHREE = makeMockThree();
  let allocCount = 0;
  const THREE = new Proxy(baseTHREE, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function' && /^[A-Z]/.test(String(prop))) {
        return new Proxy(val, {
          construct(Ctor, args, newTarget) {
            allocCount++;
            return Reflect.construct(Ctor, args, newTarget);
          },
        });
      }
      return val;
    },
  });

  const Shaders = {
    createTerrainMaterial: () => new baseTHREE.MeshStandardMaterial({ name: 'terrainShaderMat' }),
    createWaterMaterial: () => new baseTHREE.ShaderMaterial({ name: 'waterShaderMat' }),
    createHorizonWaterMaterial: () => new baseTHREE.ShaderMaterial({ name: 'horizonShaderMat' }),
    createGrassMaterial: () => new baseTHREE.MeshStandardMaterial({ vertexColors: true, name: 'grassShaderMat' }),
    createKelpMaterial: () => new baseTHREE.MeshStandardMaterial({ name: 'kelpShaderMat' }),
    createStarfieldMaterial: () => new baseTHREE.ShaderMaterial({ uniforms: { uStarAlpha: { value: 1 }, uTime: { value: 0 }, uSunDir: { value: new baseTHREE.Vector3() } } }),
    createCloudMaterial: () => new baseTHREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } } }),
    createSkyDome: () => ({ mesh: new baseTHREE.Mesh(new baseTHREE.SphereGeometry(460, 8, 6), new baseTHREE.ShaderMaterial()), material: new baseTHREE.ShaderMaterial() }),
    patchTreeWind: (m) => m,
    patchFoliageReactive: (m) => m,
    setCelestial() {},
    setWind() {},
    update() {},
  };

  const document = {
    body: { appendChild() {} },
    head: { appendChild() {} },
    createElement() {
      return { width: 0, height: 0, getContext: () => ({ fillText() {} }) };
    },
  };

  const sandbox = {
    Math, Map, Set, Array, WeakSet, WeakMap, Float32Array, Uint16Array, console,
    THREE, Shaders, document,
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    addEventListener() {},
  };
  vm.runInNewContext(envCode + '\nthis.Env = Env;', sandbox);
  vm.runInNewContext(
    worldCode + '\nthis.__W = { scene, sun, hemiLight, setSkyProgress, setQuality, getQuality, updateChunks, updateEnvironment, chunks };',
    sandbox
  );

  const W = sandbox.__W;
  const RealEnv = sandbox.Env;

  // Verify real Env rig mounted & quality switching works end-to-end
  assert.ok(RealEnv.getSceneRig(), 'Real Env scene rig must mount on world scene');
  W.setQuality('balanced');
  assert.equal(RealEnv.getQuality(), 'balanced');
  W.setQuality('high');
  assert.equal(RealEnv.getQuality(), 'high');

  // Stream a few chunks then move away to verify real Env.unregisterChunk path runs cleanly
  for (let i = 0; i < 6; i++) W.updateChunks(36, 62);
  for (let i = 0; i < 4; i++) W.updateChunks(-180, -180);

  // Warm up 1 frame then measure steady-state updateEnvironment allocations over 60 frames
  W.setSkyProgress(8);
  W.updateEnvironment(4.0, 12, -10, 1.0, 0.016);
  allocCount = 0;
  for (let f = 0; f < 60; f++) {
    W.updateEnvironment(4.0, 12 + f * 0.1, -10, 1.0 + f * 0.016, 0.016);
  }
  assert.equal(allocCount, 0, `Steady-state updateEnvironment must allocate ZERO THREE objects, got ${allocCount}`);
});

test('Fast quality tier: 3x3 chunk grid, pixel ratio <= 0.9, no shadow pass, closer mist, leaner grass', () => {
  const { W } = loadFullWorldWithMocks();

  assert.equal(W.getQuality(), 'high');
  W.setQuality('fast');
  assert.equal(W.getQuality(), 'fast', 'setQuality must accept the fast tier');
  assert.equal(W.getViewRadius(), 1, 'Fast must stream a 3x3 chunk grid (view radius 1)');
  assert.ok(W.renderer.getPixelRatio() <= 0.9, `Fast pixel ratio must be <= 0.9, got ${W.renderer.getPixelRatio()}`);
  assert.equal(W.renderer.shadowMap.autoUpdate, false, 'Fast tier must skip the heavy shadow pass');
  assert.ok(W.sun.shadow.bias > 1, 'Fast bias must push every lookup past the shadow far plane, so nothing is sampled');
  // Both are compiled into every lit shader: changing either freezes the game while ~35 programs rebuild
  assert.equal(W.sun.castShadow, true, 'dropping to Fast must not toggle castShadow');
  assert.equal(W.renderer.shadowMap.enabled, true, 'dropping to Fast must not toggle shadowMap.enabled');

  // 3x3 grid: streaming around a point must settle at exactly 9 chunks
  for (let i = 0; i < 20; i++) W.updateChunks(0, 0);
  assert.equal(W.chunks.size, 9, `Expected exactly 9 chunks on Fast, got ${W.chunks.size}`);

  // Closer mist on the next environment update (fast: far ~78, high/balanced: ~124)
  W.updateEnvironment(1.6, 0, 0, 1.0, 0.016, '');
  assert.ok(W.scene.fog.far < 100, `Fast fog far must be closer (<100), got ${W.scene.fog.far}`);

  // Leaner grass: find a big continent, then compare per-chunk grass counts across tiers
  let landX = 0;
  let landZ = 0;
  let foundLand = false;
  for (let r = 200; r < 600 && !foundLand; r += 24) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const tx = Math.cos(a) * r;
      const tz = Math.sin(a) * r;
      if (W.heightAt(tx, tz) > 2.5) {
        landX = tx;
        landZ = tz;
        foundLand = true;
        break;
      }
    }
  }
  assert.ok(foundLand, 'Must find a land continent for grass comparison');
  for (let i = 0; i < 20; i++) W.updateChunks(landX, landZ);
  let fastGrassMax = 0;
  for (const chunk of W.chunks.values()) {
    for (const gm of chunk.grassMeshes) fastGrassMax = Math.max(fastGrassMax, gm.count);
  }
  assert.ok(fastGrassMax > 0, 'Expected instanced grass on Fast tier land chunks');
  assert.ok(fastGrassMax <= 14 * 14, `Fast grass per chunk must be <= 196 (14x14 grid), got ${fastGrassMax}`);

  // Back to Balanced restores shadow pass, pixel ratio cap and the 7x7 grid
  W.setQuality('balanced');
  assert.equal(W.getViewRadius(), 3);
  assert.equal(W.renderer.shadowMap.autoUpdate, true, 'Balanced must re-enable the shadow pass');
  assert.equal(W.sun.shadow.bias, -0.0004, 'Balanced must restore the shadow bias');
  assert.equal(W.sun.castShadow, true);
  assert.ok(W.renderer.getPixelRatio() <= 1.25);
  for (let i = 0; i < 60; i++) W.updateChunks(landX, landZ);
  assert.ok(W.chunks.size >= 49, `Expected >=49 chunks on Balanced, got ${W.chunks.size}`);
  W.updateEnvironment(1.6, 0, 0, 1.0, 0.016, '');
  assert.ok(W.scene.fog.far > 110, `Balanced fog far must be distant (>110), got ${W.scene.fog.far}`);

  // Balanced grass density on the same continent exceeds Fast's 14x14 per-chunk cap
  let balancedGrassMax = 0;
  for (const chunk of W.chunks.values()) {
    for (const gm of chunk.grassMeshes) balancedGrassMax = Math.max(balancedGrassMax, gm.count);
  }
  assert.ok(balancedGrassMax > fastGrassMax, `Balanced grass ${balancedGrassMax} must exceed Fast ${fastGrassMax}`);
});

test('Per-chunk frustum culling hides chunks behind the camera and restores them on turn', () => {
  const { W } = loadFullWorldWithMocks();
  W.setQuality('fast');
  for (let i = 0; i < 20; i++) W.updateChunks(0, 0);
  assert.equal(W.chunks.size, 9);

  // Perspective camera (fov 60, aspect 1, near 0.1, far 600) at origin looking toward -Z
  const f = 1 / Math.tan((60 * Math.PI / 180) / 2);
  const near = 0.1;
  const far = 600;
  const proj = { elements: new Float32Array(16) };
  proj.elements[0] = f;
  proj.elements[5] = f;
  proj.elements[10] = (far + near) / (near - far);
  proj.elements[11] = -1;
  proj.elements[14] = (2 * far * near) / (near - far);
  const identity = { elements: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  const cam = {
    position: { x: 0, y: 1.6, z: 0 },
    projectionMatrix: proj,
    matrixWorldInverse: identity,
    updateMatrixWorld() {},
  };

  W.updateChunkCulling(cam);
  assert.equal(W.isChunkCulled(0, -1), false, 'chunk directly in front must stay visible');
  assert.equal(W.isChunkCulled(0, 0), false, 'camera chunk must stay visible');
  assert.equal(W.isChunkCulled(-1, -1), false, 'front-left diagonal chunk must stay visible');
  assert.equal(W.isChunkCulled(0, 1), true, 'chunk behind the camera must be culled');
  assert.equal(W.isChunkCulled(1, 1), true, 'chunk behind-right must be culled');
  assert.equal(W.isChunkCulled(-1, 1), true, 'chunk behind-left must be culled');

  // Culled chunk meshes must actually be hidden
  const behind = [...W.chunks.values()].find(c => c.cx === 0 && c.cz === 1);
  for (const m of behind.meshes) {
    assert.equal(m.visible, false, 'culled chunk mesh must have visible=false');
  }
  const front = [...W.chunks.values()].find(c => c.cx === 0 && c.cz === -1);
  for (const m of front.meshes) {
    assert.equal(m.visible, true, 'visible chunk mesh must stay visible=true');
  }

  // Turn the camera 180 degrees: culled chunks swap, previously hidden meshes restore
  const turned = { elements: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  turned.elements[0] = -1;
  turned.elements[10] = -1;
  W.updateChunkCulling({ ...cam, matrixWorldInverse: turned });
  assert.equal(W.isChunkCulled(0, -1), true, 'previously front chunk must cull after 180 turn');
  assert.equal(W.isChunkCulled(0, 1), false, 'previously culled chunk must restore after 180 turn');
  for (const m of behind.meshes) {
    assert.equal(m.visible, true, 'restored chunk mesh must become visible again');
  }
});

test('Low-end detection helpers: camera without matrices is a safe no-op', () => {
  const { W } = loadFullWorldWithMocks();
  W.updateChunkCulling(null);
  W.updateChunkCulling({ position: { x: 0, y: 0, z: 0 } });
  W.updateChunkCulling({ projectionMatrix: { elements: new Float32Array(16) } });
  assert.equal(W.isChunkCulled(0, 0), false, 'no culling state must be written without a valid camera');
});
