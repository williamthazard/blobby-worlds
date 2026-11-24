import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockEnv() {
  const allocs = {
    vec2: 0,
    vec3: 0,
    vec4: 0,
    quat: 0,
    euler: 0,
    mat4: 0,
    color: 0,
    mesh: 0,
    instancedMesh: 0,
    points: 0,
    group: 0,
    geo: 0,
    mat: 0,
  };

  class Vector2 {
    constructor(x = 0, y = 0) {
      allocs.vec2++;
      this.x = x;
      this.y = y;
    }
    set(x, y) { this.x = x; this.y = y; return this; }
    copy(v) { this.x = v.x; this.y = v.y; return this; }
  }

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      allocs.vec3++;
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() {
      const l = this.length() || 1;
      this.x /= l; this.y /= l; this.z /= l;
      return this;
    }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    crossVectors(a, b) {
      const ax = a.x, ay = a.y, az = a.z;
      const bx = b.x, by = b.y, bz = b.z;
      this.x = ay * bz - az * by;
      this.y = az * bx - ax * bz;
      this.z = ax * by - ay * bx;
      return this;
    }
    applyMatrix4(m) {
      const e = m.elements;
      const x = this.x, y = this.y, z = this.z;
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
      this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      return this;
    }
  }

  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
      allocs.euler++;
      this.x = x; this.y = y; this.z = z; this.order = order;
    }
    set(x, y, z, order) {
      this.x = x; this.y = y; this.z = z;
      if (order) this.order = order;
      return this;
    }
  }

  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      allocs.quat++;
      this.x = x; this.y = y; this.z = z; this.w = w;
    }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
    setFromEuler(e) {
      const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2);
      const s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
      this.x = s1 * c2 * c3 + c1 * s2 * s3;
      this.y = c1 * s2 * c3 - s1 * c2 * s3;
      this.z = c1 * c2 * s3 + s1 * s2 * c3;
      this.w = c1 * c2 * c3 - s1 * s2 * s3;
      return this;
    }
    setFromUnitVectors(vFrom, vTo) {
      let r = vFrom.dot(vTo) + 1;
      if (r < 1e-6) {
        r = 0;
        if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
          this.x = -vFrom.y; this.y = vFrom.x; this.z = 0; this.w = r;
        } else {
          this.x = 0; this.y = -vFrom.z; this.z = vFrom.y; this.w = r;
        }
      } else {
        this.x = vFrom.y * vTo.z - vFrom.z * vTo.y;
        this.y = vFrom.z * vTo.x - vFrom.x * vTo.z;
        this.z = vFrom.x * vTo.y - vFrom.y * vTo.x;
        this.w = r;
      }
      const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
      this.x /= l; this.y /= l; this.z /= l; this.w /= l;
      return this;
    }
  }

  class Matrix4 {
    constructor() {
      allocs.mat4++;
      this.elements = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
    }
    identity() {
      const e = this.elements;
      e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
      e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
      e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
      e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
      return this;
    }
    copy(m) {
      this.elements.set(m.elements);
      return this;
    }
    compose(pos, q, scale) {
      const te = this.elements;
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      const sx = scale.x, sy = scale.y, sz = scale.z;
      te[0] = (1 - (yy + zz)) * sx;
      te[1] = (xy + wz) * sx;
      te[2] = (xz - wy) * sx;
      te[3] = 0;
      te[4] = (xy - wz) * sy;
      te[5] = (1 - (xx + zz)) * sy;
      te[6] = (yz + wx) * sy;
      te[7] = 0;
      te[8] = (xz + wy) * sz;
      te[9] = (yz - wx) * sz;
      te[10] = (1 - (xx + yy)) * sz;
      te[11] = 0;
      te[12] = pos.x;
      te[13] = pos.y;
      te[14] = pos.z;
      te[15] = 1;
      return this;
    }
    multiplyMatrices(a, b) {
      const ae = a.elements, be = b.elements, te = this.elements;
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          te[col * 4 + row] =
            ae[0 * 4 + row] * be[col * 4 + 0] +
            ae[1 * 4 + row] * be[col * 4 + 1] +
            ae[2 * 4 + row] * be[col * 4 + 2] +
            ae[3 * 4 + row] * be[col * 4 + 3];
        }
      }
      return this;
    }
    makeScale(x, y, z) {
      this.identity();
      this.elements[0] = x;
      this.elements[5] = y;
      this.elements[10] = z;
      return this;
    }
  }

  class Color {
    constructor(hex = 0xffffff) {
      allocs.color++;
      this.r = 1; this.g = 1; this.b = 1;
      this.linearized = false;
      this.set(hex);
    }
    set(v) {
      if (typeof v === 'number') {
        this.r = ((v >> 16) & 255) / 255;
        this.g = ((v >> 8) & 255) / 255;
        this.b = (v & 255) / 255;
      } else if (v && typeof v === 'object' && 'r' in v) {
        this.r = v.r; this.g = v.g; this.b = v.b;
      }
      return this;
    }
    setHex(v) { return this.set(v); }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
    copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
    lerp(c, t) {
      this.r += (c.r - this.r) * t;
      this.g += (c.g - this.g) * t;
      this.b += (c.b - this.b) * t;
      return this;
    }
    lerpColors(a, b, t) {
      this.r = a.r + (b.r - a.r) * t;
      this.g = a.g + (b.g - a.g) * t;
      this.b = a.b + (b.b - a.b) * t;
      return this;
    }
    convertSRGBToLinear() { this.linearized = true; return this; }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array ? array.length / itemSize : 0;
      this.needsUpdate = false;
    }
  }

  class BufferGeometry {
    constructor() {
      allocs.geo++;
      this.attributes = {};
      this.index = null;
      this.drawRange = { start: 0, count: Infinity };
    }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setIndex(idx) { this.index = idx; return this; }
    setDrawRange(start, count) { this.drawRange.start = start; this.drawRange.count = count; }
    applyMatrix4(m) {
      const pos = this.attributes.position;
      if (pos && pos.array) {
        for (let i = 0; i < pos.count; i++) {
          const x = pos.array[i * 3], y = pos.array[i * 3 + 1], z = pos.array[i * 3 + 2];
          const e = m.elements;
          pos.array[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          pos.array[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          pos.array[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      }
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
    dispose() {}
  }

  class SphereGeometry extends BufferGeometry {
    constructor(r = 1) {
      super();
      this.radius = r;
      this.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, r, 0, 0, 0, r, 0]), 3));
    }
  }
  class ConeGeometry extends BufferGeometry {
    constructor(r = 1, h = 1) {
      super();
      this.radius = r; this.height = h;
      this.setAttribute('position', new BufferAttribute(new Float32Array([0, h * 0.5, 0, -r, -h * 0.5, 0, r, -h * 0.5, 0]), 3));
    }
  }
  class CylinderGeometry extends BufferGeometry {
    constructor(rt = 1, rb = 1, h = 1) {
      super();
      this.radiusTop = rt; this.radiusBottom = rb; this.height = h;
      this.setAttribute('position', new BufferAttribute(new Float32Array([0, h * 0.5, 0, -rb, -h * 0.5, 0, rb, -h * 0.5, 0]), 3));
    }
  }
  class IcosahedronGeometry extends BufferGeometry {
    constructor(r = 1) {
      super();
      this.radius = r;
      this.setAttribute('position', new BufferAttribute(new Float32Array([0, r, 0, r, 0, 0, 0, 0, r]), 3));
    }
  }

  class Material {
    constructor(opts = {}) {
      allocs.mat++;
      this.name = opts.name || '';
      this.userData = {};
      Object.assign(this, opts);
      this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
      this.emissive = new Color(opts.emissive !== undefined ? opts.emissive : 0x000000);
    }
    clone() {
      const m = new this.constructor({ ...this });
      if (this.userData && this.userData._shaderHooks) {
        m.cloneOfPatched = true;
      }
      return m;
    }
    dispose() {}
  }
  class MeshStandardMaterial extends Material {
    constructor(opts = {}) { super(opts); this.isMeshStandardMaterial = true; }
  }
  class MeshBasicMaterial extends Material {
    constructor(opts = {}) { super(opts); this.isMeshBasicMaterial = true; }
  }
  class PointsMaterial extends Material {
    constructor(opts = {}) { super(opts); this.isPointsMaterial = true; }
  }
  class ShaderMaterial extends Material {
    constructor(opts = {}) {
      super(opts);
      this.isShaderMaterial = true;
      this.uniforms = opts.uniforms || {};
    }
  }

  class Object3D {
    constructor(name = '') {
      this.name = name;
      this.children = [];
      this.parent = null;
      this.visible = true;
      this.castShadow = false;
      this.receiveShadow = false;
      this.frustumCulled = true;
      this.renderOrder = 0;
      this.position = new Vector3();
      this.rotation = new Euler();
      this.quaternion = new Quaternion();
      this.scale = new Vector3(1, 1, 1);
      this.matrix = new Matrix4();
      this.matrixWorld = new Matrix4();
      this.userData = {};
    }
    add(...objs) {
      for (const o of objs) {
        if (!o) continue;
        if (o.parent && typeof o.parent.remove === 'function') o.parent.remove(o);
        o.parent = this;
        this.children.push(o);
      }
      return this;
    }
    remove(o) {
      const idx = this.children.indexOf(o);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        o.parent = null;
      }
      return this;
    }
    traverse(fn) {
      fn(this);
      for (let i = 0; i < this.children.length; i++) this.children[i].traverse(fn);
    }
    updateMatrix() {
      this.matrix.compose(this.position, this.quaternion, this.scale);
    }
    updateMatrixWorld(force) {
      this.updateMatrix();
      if (this.parent) {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      } else {
        this.matrixWorld.copy(this.matrix);
      }
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].updateMatrixWorld(force);
      }
    }
    clone(recursive = true) {
      const copy = new this.constructor(this.name);
      copy.visible = this.visible;
      copy.castShadow = this.castShadow;
      copy.receiveShadow = this.receiveShadow;
      copy.frustumCulled = this.frustumCulled;
      copy.position.copy(this.position);
      copy.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
      copy.quaternion.copy(this.quaternion);
      copy.scale.copy(this.scale);
      copy.userData = { ...this.userData };
      if (this.isMesh) {
        copy.isMesh = true;
        copy.geometry = this.geometry;
        copy.material = this.material;
      }
      if (recursive) {
        for (const ch of this.children) copy.add(ch.clone(true));
      }
      return copy;
    }
  }

  class Group extends Object3D {
    constructor(name = '') { super(name); allocs.group++; }
  }

  class Scene extends Group {
    constructor() {
      super('Scene');
      this.addCalls = 0;
    }
    add(...objs) {
      this.addCalls += objs.length;
      return super.add(...objs);
    }
  }

  class Mesh extends Object3D {
    constructor(geometry, material, name = '') {
      super(name);
      allocs.mesh++;
      this.isMesh = true;
      this.geometry = geometry;
      this.material = material;
    }
  }

  class InstancedMesh extends Mesh {
    constructor(geometry, material, count) {
      super(geometry, material, 'InstancedMesh');
      allocs.instancedMesh++;
      this.isInstancedMesh = true;
      this.count = count;
      this.instanceMatrix = new BufferAttribute(new Float32Array(count * 16), 16);
      this.instanceColor = null;
    }
    setMatrixAt(i, m) {
      this.instanceMatrix.array.set(m.elements, i * 16);
    }
    setColorAt(i, c) {
      if (!this.instanceColor) {
        this.instanceColor = new BufferAttribute(new Float32Array(this.count * 3), 3);
      }
      this.instanceColor.array[i * 3] = c.r;
      this.instanceColor.array[i * 3 + 1] = c.g;
      this.instanceColor.array[i * 3 + 2] = c.b;
    }
  }

  class Points extends Object3D {
    constructor(geometry, material) {
      super('Points');
      allocs.points++;
      this.geometry = geometry;
      this.material = material;
    }
  }

  const THREE = {
    Vector2,
    Vector3,
    Euler,
    Quaternion,
    Matrix4,
    Color,
    BufferAttribute,
    BufferGeometry,
    SphereGeometry,
    ConeGeometry,
    CylinderGeometry,
    IcosahedronGeometry,
    Material,
    MeshStandardMaterial,
    MeshBasicMaterial,
    PointsMaterial,
    ShaderMaterial,
    Object3D,
    Group,
    Scene,
    Mesh,
    InstancedMesh,
    Points,
    DoubleSide: 2,
    FrontSide: 0,
    BackSide: 1,
    AdditiveBlending: 2,
  };

  const Textures = {
    sets: {
      bark: { map: { tag: 'bark_map' }, normalMap: { tag: 'bark_n' }, roughnessMap: { tag: 'bark_r' } },
      leaves: { map: { tag: 'leaves_map' }, normalMap: { tag: 'leaves_n' }, roughnessMap: { tag: 'leaves_r' } },
      stone: { map: { tag: 'stone_map' }, normalMap: { tag: 'stone_n' }, roughnessMap: { tag: 'stone_r' } },
      rock: { map: { tag: 'rock_map' }, normalMap: { tag: 'rock_n' }, roughnessMap: { tag: 'rock_r' } },
      snow: { map: { tag: 'snow_map' }, normalMap: { tag: 'snow_n' }, roughnessMap: { tag: 'snow_r' } },
      forest: { map: { tag: 'forest_map' }, normalMap: { tag: 'forest_n' }, roughnessMap: { tag: 'forest_r' } },
    },
  };

  const shaderCalls = {
    setCelestial: [],
    setWind: [],
    patchTreeWind: [],
    patchFoliageReactive: [],
    patchUnderwaterCaustics: [],
  };

  const Shaders = {
    uniforms: {
      uTime: { value: 0 },
      uMoonDir: { value: new Vector3(0, 1, 0) },
      uMoonColor: { value: new Color(0x9abcf5) },
      uNightFactor: { value: 1 },
      uWindVec: { value: { x: 0.84, y: 0.54, z: 0.55, w: 0 } },
      uCloudOffset: { value: new Vector2(0, 0) },
      uSunDir: { value: new Vector3(0.4, 0.7, 0.3).normalize() },
    },
    setCelestial(moonDir, moonColor, nightFactor) {
      shaderCalls.setCelestial.push({ moonDir: { x: moonDir.x, y: moonDir.y, z: moonDir.z }, nightFactor });
      Shaders.uniforms.uMoonDir.value.copy(moonDir);
      Shaders.uniforms.uMoonColor.value.set(moonColor);
      Shaders.uniforms.uNightFactor.value = nightFactor;
    },
    setWind(dirX, dirZ, strength, phase, cloudOffX, cloudOffZ) {
      shaderCalls.setWind.push({ dirX, dirZ, strength, phase, cloudOffX, cloudOffZ });
      Shaders.uniforms.uWindVec.value = { x: dirX, y: dirZ, z: strength, w: phase };
      Shaders.uniforms.uCloudOffset.value.set(cloudOffX, cloudOffZ);
    },
    patchTreeWind(mat, isFoliage) {
      shaderCalls.patchTreeWind.push({ matName: mat.name, isFoliage });
      mat.userData = mat.userData || {};
      mat.userData._shaderHooks = mat.userData._shaderHooks || {};
      mat.userData._shaderHooks[isFoliage ? 'tree_foliage_wind_v3' : 'tree_trunk_wind_v3'] = true;
      return mat;
    },
    patchFoliageReactive(mat, opts) {
      shaderCalls.patchFoliageReactive.push({ matName: mat.name, opts });
      mat.userData = mat.userData || {};
      mat.userData._shaderHooks = mat.userData._shaderHooks || {};
      mat.userData._shaderHooks.foliage_reactive_v1 = true;
      return mat;
    },
    patchUnderwaterCaustics(mat, opts) {
      shaderCalls.patchUnderwaterCaustics.push({ matName: mat.name, opts });
      mat.userData = mat.userData || {};
      mat.userData._shaderHooks = mat.userData._shaderHooks || {};
      mat.userData._shaderHooks.underwater_caustics_v1 = true;
      return mat;
    },
    createStarfieldMaterial() {
      return new ShaderMaterial({
        uniforms: {
          uTime: Shaders.uniforms.uTime,
          uSunDir: Shaders.uniforms.uSunDir,
          uMoonDir: Shaders.uniforms.uMoonDir,
          uStarAlpha: { value: 1.0 },
        },
        transparent: true,
        depthWrite: false,
      });
    },
    createCloudMaterial() {
      return new ShaderMaterial({
        uniforms: {
          uTime: Shaders.uniforms.uTime,
          uSunDir: Shaders.uniforms.uSunDir,
          uMoonDir: Shaders.uniforms.uMoonDir,
          uNightFactor: Shaders.uniforms.uNightFactor,
          uWindVec: Shaders.uniforms.uWindVec,
          uCloudOffset: Shaders.uniforms.uCloudOffset,
        },
        transparent: true,
        depthWrite: false,
      });
    },
  };

  let currentRegion = { id: 'sanctuary', name: 'Star Sanctuary' };
  const Regions = {
    regionAt(px, pz) {
      if (px < -50 && pz < -50) return { id: 'frostpeak', name: 'Frostpeak Shrines' };
      if (px > 40 && pz < -40) return { id: 'whisperingForest', name: 'Whispering Deep Forest' };
      if (px < -50 && pz >= -40 && pz <= 20) return { id: 'canyonOasis', name: 'Canyon Oasis' };
      if (px > 30 && pz > 30) return { id: 'twilightCoast', name: 'Twilight Basalt Coast' };
      if (px >= -40 && px <= 20 && pz > 60) return { id: 'sunkenCity', name: 'The Sunken Underwater City' };
      return currentRegion;
    },
  };

  const sandbox = {
    THREE,
    Textures,
    Shaders,
    Regions,
    Math,
    console,
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    window: {},
    location: { protocol: 'https:' },
  };
  sandbox.window = sandbox;

  const src = fs.readFileSync(new URL('../env.js', import.meta.url), 'utf8');
  vm.runInNewContext(src + '\nthis.__Env = Env;', sandbox);

  const resetAllocs = () => {
    for (const k in allocs) allocs[k] = 0;
  };
  const totalAllocs = () => Object.values(allocs).reduce((a, b) => a + b, 0);

  return {
    Env: sandbox.__Env,
    THREE,
    Textures,
    Shaders,
    Regions,
    sandbox,
    shaderCalls,
    allocs,
    resetAllocs,
    totalAllocs,
    src,
  };
}

function makeMockPropScene(THREE, slotNames) {
  const root = new THREE.Group('EnvRoot');
  for (let i = 0; i < slotNames.length; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    const m = new THREE.MeshStandardMaterial({ name: slotNames[i] });
    const mesh = new THREE.Mesh(g, m, `Part_${slotNames[i]}`);
    root.add(mesh);
  }
  return root;
}

test('PROP_KEYS lists all 17 environment props and resolveAssetSource supports http/https vs file:', () => {
  const { Env } = makeMockEnv();
  assert.equal(Env.PROP_KEYS.length, 17);
  for (const key of [
    'oak_tree', 'birch_tree', 'pine_tree', 'pine_snow', 'willow_tree', 'palm_tree',
    'cactus_flower', 'bush_berry', 'boulder_moss', 'boulder_rock', 'fallen_log',
    'tree_stump', 'lilypad', 'ruin_arch', 'ruin_column', 'ruin_column_broken', 'shrine_pedestal',
  ]) {
    assert.ok(Env.PROP_KEYS.includes(key), `Missing prop key ${key}`);
  }

  const src1 = Env.resolveAssetSource('oak_tree', 'https:');
  assert.equal(src1.mode, 'glb');
  assert.equal(src1.url, './assets/env/oak_tree.glb');

  const src2 = Env.resolveAssetSource('ruin_arch', 'http:');
  assert.equal(src2.mode, 'glb');
  assert.equal(src2.url, './assets/env/ruin_arch.glb');

  const src3 = Env.resolveAssetSource('oak_tree', 'file:');
  assert.equal(src3.mode, 'file-bundle');
  assert.equal(src3.url, './assets/env/oak_tree.glb.js');
});

test('preloadProp coalesces concurrent loads, parses file: .glb.js bundles, restyles PBR slots without cloning patched materials, and falls back gracefully', () => {
  const { Env, THREE, Textures, shaderCalls, sandbox } = makeMockEnv();
  Env._resetCache();

  let loadCalls = 0;
  let pendingLoadCb = null;
  class MockGLTFLoader {
    load(url, onLoad) {
      loadCalls++;
      pendingLoadCb = { url, onLoad };
    }
    parse(buf, path, onLoad) {
      this._parsed = { buf, path };
      const magic = Buffer.from(buf, 0, 4).toString('ascii');
      assert.equal(magic, 'glTF', 'Decoded file:// GLB bundle must start with glTF magic');
      const scene = makeMockPropScene(THREE, ['Stone_Dark', 'Stone_Highlight', 'Stone_Medium']);
      onLoad({ scene });
    }
  }

  // 1) Coalescing in HTTP mode + oak_tree Bark/Leaves PBR restyling
  const results = [];
  for (let i = 0; i < 3; i++) {
    Env.preloadProp('oak_tree', (tpl) => results.push(tpl), (e) => assert.fail(e), {
      THREE,
      Textures,
      GLTFLoader: MockGLTFLoader,
      protocol: 'https:',
    });
  }
  assert.equal(loadCalls, 1, 'Concurrent requests for same key must coalesce');
  assert.equal(pendingLoadCb.url, './assets/env/oak_tree.glb');

  pendingLoadCb.onLoad({ scene: makeMockPropScene(THREE, ['Bark', 'Leaves']) });
  assert.equal(results.length, 3);
  assert.equal(Env.getProp('oak_tree'), results[0]);

  const barkMat = results[0].parts[0].material;
  const leafMat = results[0].parts[1].material;
  assert.equal(barkMat.map, Textures.sets.bark.map);
  assert.equal(leafMat.map, Textures.sets.leaves.map);
  assert.equal(barkMat.cloneOfPatched, undefined);
  assert.equal(leafMat.cloneOfPatched, undefined);
  assert.ok(
    shaderCalls.patchTreeWind.some((c) => c.isFoliage === false),
    'Bark slot must receive trunk wind hook (isFoliage=false)'
  );
  assert.ok(
    shaderCalls.patchTreeWind.some((c) => c.isFoliage === true),
    'Leaves slot must receive foliage wind hook (isFoliage=true)'
  );

  // 2) cactus_flower MUST be excluded from tree/foliage wind shader hooks
  shaderCalls.patchTreeWind.length = 0;
  shaderCalls.patchFoliageReactive.length = 0;
  Env.preloadProp('cactus_flower', (tpl) => {
    assert.equal(tpl.parts[0].material.map, Textures.sets.leaves.map);
  }, (e) => assert.fail(e), {
    THREE,
    Textures,
    GLTFLoader: MockGLTFLoader,
    protocol: 'https:',
  });
  pendingLoadCb.onLoad({ scene: makeMockPropScene(THREE, ['Leaves_Cactus']) });
  assert.equal(shaderCalls.patchTreeWind.length, 0, 'cactus_flower must NOT get patchTreeWind');
  assert.equal(shaderCalls.patchFoliageReactive.length, 0, 'cactus_flower must NOT get patchFoliageReactive');

  // 3) file: mode injects <script src="./assets/env/ruin_arch.glb.js"> and decodes real base64 GLB
  const oakBundleJs = fs.readFileSync(new URL('../assets/env/ruin_arch.glb.js', import.meta.url), 'utf8');
  const injectedScripts = [];
  const mockDoc = {
    head: {
      appendChild(sc) {
        injectedScripts.push(sc);
        vm.runInNewContext(oakBundleJs, sandbox);
        sc.onload();
      },
    },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { src: '', onload: null, onerror: null };
    },
  };

  let archTpl = null;
  Env.preloadProp('ruin_arch', (tpl) => { archTpl = tpl; }, (e) => assert.fail(e), {
    THREE,
    Textures,
    GLTFLoader: MockGLTFLoader,
    protocol: 'file:',
    document: mockDoc,
    window: sandbox,
  });
  assert.equal(injectedScripts.length, 1);
  assert.equal(injectedScripts[0].src, './assets/env/ruin_arch.glb.js');
  assert.ok(archTpl, 'ruin_arch template must load from .glb.js');
  assert.equal(archTpl.parts[0].material.map, Textures.sets.stone.map);

  // 4) Graceful fallback when GLTFLoader is missing or errors
  let errCaught = null;
  const origConsoleError = console.error;
  let consoleErrors = 0;
  console.error = () => { consoleErrors++; };
  try {
    Env._resetCache();
    Env.preloadProp('pine_tree', () => assert.fail('Should not succeed without GLTFLoader'), (err) => {
      errCaught = err;
    }, { THREE: { ...THREE, GLTFLoader: undefined } });
    assert.ok(errCaught && typeof errCaught.message === 'string');

    class ErrorLoader {
      load(_url, _ok, _prog, onErr) { onErr(new Error('network offline')); }
    }
    let fetchErr = null;
    Env.preloadProp('pine_tree', () => assert.fail('Should not succeed on fetch fail'), (err) => {
      fetchErr = err;
    }, { THREE, GLTFLoader: ErrorLoader, protocol: 'https:' });
    assert.ok(fetchErr && typeof fetchErr.message === 'string');

    Env.preloadAll({ THREE: { ...THREE, GLTFLoader: undefined } });
  } finally {
    console.error = origConsoleError;
  }
  assert.equal(consoleErrors, 0, 'Fallbacks must log zero console.error messages');

  // 5) Throwing onReady listener must not block subsequent waiters or flushPendingSwaps
  Env._resetCache();
  let asyncLoadCb = null;
  class AsyncThrowLoader {
    load(_url, onLoad) { asyncLoadCb = onLoad; }
  }
  let goodListenerFired = false;
  let readyHookFired = false;
  const throwHolder = new THREE.Group('ThrowHolder');
  Env.onPropReady('ruin_column', () => { readyHookFired = true; });
  Env.registerNodeSwap('ruin_column', throwHolder);
  Env.preloadProp('ruin_column', () => { throw new Error('waiter 1 boom'); }, null, {
    THREE,
    Textures,
    GLTFLoader: AsyncThrowLoader,
    protocol: 'https:',
  });
  Env.preloadProp('ruin_column', () => { goodListenerFired = true; }, null, {
    THREE,
    Textures,
    GLTFLoader: AsyncThrowLoader,
    protocol: 'https:',
  });
  asyncLoadCb({ scene: makeMockPropScene(THREE, ['Stone_Column']) });
  assert.equal(goodListenerFired, true, 'Subsequent onReady waiter must fire after earlier waiter throws');
  assert.equal(readyHookFired, true, 'onPropReady must still fire after waiter throws');
  assert.equal(throwHolder.userData.glbSwapped, 'ruin_column', 'Pending node swaps must flush after waiter throws');
});

test('registerInstancedSwap, unregisterChunk, and registerNodeSwap hot-swap both deferred and cached props', () => {
  const { Env, THREE, Textures, shaderCalls } = makeMockEnv();
  Env._resetCache();

  let loaders = [];
  class MockLoader {
    load(url, onLoad) { loaders.push({ url, onLoad }); }
  }

  const scene = new THREE.Scene();
  const chunk = { cx: 0, cz: 0, meshes: [] };

  const fallbackGeo = new THREE.SphereGeometry(1);
  const fallbackMat = new THREE.MeshStandardMaterial({ name: 'FallbackTrunk' });
  const canopyGeo = new THREE.SphereGeometry(2);
  const canopyMat = new THREE.MeshStandardMaterial({ name: 'FallbackCanopy' });

  const trunkMesh = new THREE.InstancedMesh(fallbackGeo, fallbackMat, 4);
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, 4);
  const mat4 = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    trunkMesh.setMatrixAt(i, mat4);
    trunkMesh.setColorAt(i, new THREE.Color(0xffffff));
    canopyMesh.setMatrixAt(i, mat4);
  }
  scene.add(trunkMesh, canopyMesh);
  chunk.meshes.push(trunkMesh, canopyMesh);

  // Deferred instanced swap registered BEFORE load completes
  Env.registerInstancedSwap('oak_tree', trunkMesh, {
    chunk,
    parent: scene,
    hideTargets: [canopyMesh],
  });

  // Deferred node swap registered BEFORE load completes (brief signature: key, holder, opts)
  const shrineHolder = new THREE.Group('ShrineHolder');
  const placeholderStone = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
  placeholderStone.userData.isPlaceholder = true;
  shrineHolder.add(placeholderStone);
  Env.registerNodeSwap('shrine_pedestal', shrineHolder, { caustics: true });

  // Unregistered chunk should NOT receive swap when oak_tree finishes loading
  const disposedChunk = { cx: 9, cz: 9, meshes: [] };
  const disposedMesh = new THREE.InstancedMesh(fallbackGeo, fallbackMat, 2);
  Env.registerInstancedSwap('oak_tree', disposedMesh, { chunk: disposedChunk, parent: scene });
  Env.unregisterChunk(disposedChunk);

  // Trigger loads
  Env.preloadProp('oak_tree', null, null, { THREE, Textures, GLTFLoader: MockLoader, protocol: 'https:' });
  Env.preloadProp('shrine_pedestal', null, null, { THREE, Textures, GLTFLoader: MockLoader, protocol: 'https:' });
  assert.equal(loaders.length, 2);

  loaders[0].onLoad({ scene: makeMockPropScene(THREE, ['Bark', 'Leaves']) });
  loaders[1].onLoad({ scene: makeMockPropScene(THREE, ['Stone_Marble']) });

  // Verify deferred instanced swap fired cleanly
  assert.equal(trunkMesh.material.map, Textures.sets.bark.map);
  assert.equal(canopyMesh.visible, false, 'Companion fallback canopy should be hidden');
  assert.ok(chunk.meshes.length >= 3, 'Second sub-part (Leaves) should be added to chunk.meshes');
  assert.equal(disposedMesh.material, fallbackMat, 'Unregistered chunk must not be mutated');

  // Verify deferred node swap fired cleanly with caustics
  assert.equal(shrineHolder.userData.glbSwapped, 'shrine_pedestal');
  assert.equal(placeholderStone.visible, false);
  assert.ok(
    shaderCalls.patchUnderwaterCaustics.length >= 1,
    'caustics option must invoke Shaders.patchUnderwaterCaustics'
  );

  // Immediate swap AFTER load is cached (alt signature: parentGroup, key, fallbackNode, opts)
  const secondHolder = new THREE.Group('SecondHolder');
  const secondFallback = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
  secondHolder.add(secondFallback);
  Env.registerNodeSwap(secondHolder, 'shrine_pedestal', secondFallback, {});
  assert.equal(secondHolder.userData.glbSwapped, 'shrine_pedestal');
  assert.equal(secondFallback.visible, false);

  const cachedInstanced = new THREE.InstancedMesh(fallbackGeo, fallbackMat, 2);
  cachedInstanced.setMatrixAt(0, mat4);
  cachedInstanced.setMatrixAt(1, mat4);
  scene.add(cachedInstanced);
  Env.registerInstancedSwap('oak_tree', cachedInstanced, { parent: scene });
  assert.equal(cachedInstanced.material.map, Textures.sets.bark.map);

  // registerChunkSlot + onPropReady + bush_berry reactive foliage
  let readyFired = false;
  Env.onPropReady('bush_berry', () => { readyFired = true; });
  const slotChunk = { group: new THREE.Group('ChunkGroup'), meshes: [] };
  const slotFallback = new THREE.Mesh(fallbackGeo, fallbackMat);
  slotChunk.group.add(slotFallback);
  const slotMatrices = new Float32Array(32);
  slotMatrices[0] = 1; slotMatrices[5] = 1; slotMatrices[10] = 1; slotMatrices[15] = 1;
  slotMatrices[16] = 1; slotMatrices[21] = 1; slotMatrices[26] = 1; slotMatrices[31] = 1;
  Env.registerChunkSlot(slotChunk, 'bush_berry', slotMatrices, slotFallback, { THREE });
  Env.preloadProp('bush_berry', null, null, { THREE, Textures, GLTFLoader: MockLoader, protocol: 'https:' });
  loaders[2].onLoad({ scene: makeMockPropScene(THREE, ['Leaves_Bush', 'Flower_Berry']) });
  assert.equal(readyFired, true);
  assert.equal(slotFallback.visible, false);
  assert.equal(slotChunk.meshes.length, 2, 'bush_berry slot should mount 2 sub-part InstancedMeshes');
  assert.ok(shaderCalls.patchFoliageReactive.length >= 1, 'bush_berry must receive patchFoliageReactive');

  // registerChunkSlot without chunk.group or opts.parent when _scene === null must resolve fallbackMesh.parent
  const worldParent = new THREE.Group('WorldScene');
  const worldChunk = { meshes: [] };
  const worldFallback = new THREE.Mesh(fallbackGeo, fallbackMat);
  worldParent.add(worldFallback);
  Env.registerChunkSlot(worldChunk, 'oak_tree', slotMatrices, worldFallback, { THREE });
  assert.equal(worldChunk.meshes.length, 2, 'Should mount 2 GLB sub-parts into fallbackMesh.parent');
  assert.equal(worldParent.children.includes(worldChunk.meshes[0]), true);
  assert.equal(worldParent.children.includes(worldChunk.meshes[1]), true);
  assert.equal(worldFallback.visible, false);
  assert.equal(worldFallback.parent, null);

  // registerChunkSlot with NO parent anywhere must keep fallbackMesh intact
  const orphanChunk = { meshes: [] };
  const orphanFallback = new THREE.Mesh(fallbackGeo, fallbackMat);
  Env.registerChunkSlot(orphanChunk, 'oak_tree', slotMatrices, orphanFallback, { THREE });
  assert.equal(orphanFallback.visible, true, 'Fallback must remain visible if no parent exists to attach GLB');
  assert.equal(orphanChunk.meshes.length, 0);
});

test('computeCelestialState covers 0/8 night, 4/8 golden dawn, 8/8 azure day (zero stars), and 720s post-8/8 live cycle', () => {
  const { Env, Shaders } = makeMockEnv();
  Env._resetCache();

  // 0/8: Moonlit Night
  const s0 = Env.computeCelestialState(0, 0);
  assert.ok(s0.nightFactor > 0.85, `Expected nightFactor > 0.85 at lit=0, got ${s0.nightFactor}`);
  assert.ok(s0.moonDir.y > 0.45, `Expected moonDir.y > 0.45 at lit=0, got ${s0.moonDir.y}`);
  assert.ok(s0.sunDir.y < 0, `Expected sunDir.y < 0 at lit=0, got ${s0.sunDir.y}`);
  const dotMoon0 = s0.shadowDir.x * s0.moonDir.x + s0.shadowDir.y * s0.moonDir.y + s0.shadowDir.z * s0.moonDir.z;
  assert.ok(dotMoon0 > 0.98, `Expected shadowDir aligned to moonDir at lit=0, dot=${dotMoon0}`);
  assert.ok(s0.starAlpha > 0.02, `Expected starAlpha > 0.02 at lit=0, got ${s0.starAlpha}`);

  // 4/8: Golden Dawn
  const s4 = Env.computeCelestialState(4, 0);
  assert.ok(s4.sunDir.y > 0, `Expected sunDir.y > 0 at lit=4, got ${s4.sunDir.y}`);
  assert.ok(s4.skyBot.r > s4.skyBot.b, `Expected warm dawn horizon skyBot at lit=4`);

  // 8/8, cycleTime=0: Bright Azure Day with ZERO stars
  const s8 = Env.setSkyProgress(8);
  const s8ShadowStrength = s8.shadowStrength;
  assert.ok(s8.sunDir.y > 0.55, `Expected sunDir.y > 0.55 at lit=8, got ${s8.sunDir.y}`);
  assert.ok(s8.nightFactor < 0.05, `Expected nightFactor < 0.05 at lit=8, got ${s8.nightFactor}`);
  assert.equal(s8.starAlpha, 0, 'Daytime starAlpha MUST be exact 0');
  const dotSun8 = s8.shadowDir.x * s8.sunDir.x + s8.shadowDir.y * s8.sunDir.y + s8.shadowDir.z * s8.sunDir.z;
  assert.ok(dotSun8 > 0.98, `Expected shadowDir aligned to sunDir at lit=8, dot=${dotSun8}`);
  assert.ok(s8.skyTop.b > s8.skyTop.r, 'Expected azure skyTop at lit=8');
  assert.equal(Shaders.uniforms.uNightFactor.value, s8.nightFactor);

  // Post-8/8 live cycle: half-period cycleTime = 360s -> Moonlit Starry Night
  const sNight = Env.computeCelestialState(8, 360);
  assert.ok(sNight.moonDir.y > 0.4, `Expected moonDir.y > 0.4 at cycleTime=360, got ${sNight.moonDir.y}`);
  assert.ok(sNight.starAlpha > 0.8, `Expected starAlpha > 0.8 at cycleTime=360, got ${sNight.starAlpha}`);
  const dotMoonNight =
    sNight.shadowDir.x * sNight.moonDir.x +
    sNight.shadowDir.y * sNight.moonDir.y +
    sNight.shadowDir.z * sNight.moonDir.z;
  assert.ok(dotMoonNight > 0.98, `Expected shadowDir aligned to moonDir at cycleTime=360, dot=${dotMoonNight}`);

  // Full 720s cycle wraps seamlessly back to sunny day
  const sWrap = Env.computeCelestialState(8, 720);
  assert.ok(sWrap.sunDir.y > 0.55);
  assert.equal(sWrap.starAlpha, 0);
  assert.ok(sWrap.nightFactor < 0.05);

  // Horizon handoff damping near sunset/dawn transition
  const sHorizon = Env.computeCelestialState(8, 180);
  assert.ok(sHorizon.shadowStrength < s8ShadowStrength, 'Shadow strength should damp near horizon');
  assert.ok(sHorizon.shadowDir.y > 0.05, 'shadowDir.y must remain safely positive through horizon handoff');
  assert.equal(Env.getCelestialState(), sHorizon, 'getCelestialState must return pre-allocated struct');
});

test('updateWind varies gust strength & direction and syncs Shaders.setWind', () => {
  const { Env, Shaders, shaderCalls } = makeMockEnv();
  Env._resetCache();

  const w0 = Env.updateWind(0);
  const w0CloudX = w0.cloudOffX;
  const w0Str = w0.strength;
  const w1 = Env.updateWind(4.5);
  assert.equal(w0, w1, 'updateWind without out param must mutate pre-allocated wind struct');
  assert.ok(w0Str >= 0.25 && w0Str <= 1.15);
  assert.ok(w1.strength >= 0.25 && w1.strength <= 1.15);
  assert.equal(Env.getWindGust(), w1.strength);
  assert.ok(Math.hypot(w1.dirX, w1.dirZ) > 0.99, 'Wind direction must remain normalized');
  assert.notEqual(w0CloudX, w1.cloudOffX, 'Cloud offset must advance smoothly with time');
  assert.ok(shaderCalls.setWind.length >= 2);
  assert.equal(Shaders.uniforms.uWindVec.value.z, w1.strength);
});

test('initScene, setQuality, biome motes, underwater rays, and strict zero-GC scan', () => {
  const { Env, THREE, resetAllocs, totalAllocs, src } = makeMockEnv();
  Env._resetCache();

  const scene = new THREE.Scene();
  const rig = Env.initScene(scene, { THREE });
  assert.ok(rig.stars && rig.clouds && rig.sunbeams && rig.motes);
  assert.equal(scene.addCalls, 4, 'initScene must add the 4 pooled FX rigs once');

  // High mode defaults & initial renderOrder / uStarAlpha sync
  assert.equal(rig.stars.geometry.drawRange.count, 900);
  assert.equal(rig.clouds.count, 168);
  assert.equal(rig.sunbeams.children.length, 16);
  assert.equal(rig.sunbeams.children[0].renderOrder, 3, 'Each sunbeam shaft must carry renderOrder=3');
  assert.equal(rig.motes.count, 120);
  assert.equal(
    rig.stars.material.uniforms.uStarAlpha.value,
    Env.getCelestialState().starAlpha,
    'Initial uStarAlpha must match current celestial starAlpha'
  );

  // Switch to Balanced -> half/scaled counts without reallocations
  Env.setQuality('balanced');
  assert.equal(rig.stars.geometry.drawRange.count, 450);
  assert.equal(rig.clouds.count, 84);
  assert.equal(rig.motes.count, 56);
  const visibleRaysBalanced = rig.sunbeams.children.filter((r) => r.userData.active !== false).length;
  assert.equal(visibleRaysBalanced, 6);

  // Switch back to High
  Env.setQuality('high');
  assert.equal(rig.stars.geometry.drawRange.count, 900);
  assert.equal(rig.clouds.count, 168);
  assert.equal(rig.motes.count, 120);

  // Daytime starfield suppression & above-water sunbeam hiding
  Env.setSkyProgress(8);
  Env.update(0.016, 1.0, { px: 0, py: 4, pz: 0, camX: 0, camY: 6, camZ: 10, waterY: 0 });
  assert.equal(rig.stars.visible, false, 'Daytime starfield must be hidden');
  assert.equal(rig.stars.material.uniforms.uStarAlpha.value, 0);
  assert.equal(rig.sunbeams.visible, false, 'Sunbeams must hide above water');

  // Underwater daytime -> sunbeams shine upright (narrow top at waterY, wide base below) and motes adapt to plankton
  Env.update(0.016, 2.0, { px: -14, py: -3, pz: 86, camX: -14, camY: -2, camZ: 92, waterY: 0 });
  assert.equal(rig.sunbeams.visible, true, 'Sunbeams must shine underwater during day');
  const qRay = rig.sunbeams.children[0].quaternion;
  const rayUpY = 1 - 2 * (qRay.x * qRay.x + qRay.z * qRay.z);
  assert.ok(rayUpY > 0.8, `Sunbeam local +Y must stay upright (y > 0.8), got ${rayUpY}`);
  const planktonR = rig.motes.instanceColor.array[0];
  const planktonG = rig.motes.instanceColor.array[1];
  const planktonB = rig.motes.instanceColor.array[2];
  assert.ok(planktonG > planktonR && planktonB > planktonR, 'Underwater motes should shift to aqua/cyan plankton');

  // Night underwater -> starfield visible & sunbeams night-dimmed/hidden
  Env.setSkyProgress(0);
  Env.update(0.016, 3.0, { px: -14, py: -3, pz: 86, camX: -14, camY: -2, camZ: 92, waterY: 0 });
  assert.equal(rig.stars.visible, true, 'Nighttime starfield must be visible');
  assert.ok(rig.stars.material.uniforms.uStarAlpha.value > 0.5);
  assert.equal(rig.sunbeams.visible, false, 'Sunbeams must be hidden at lit=0 deep night underwater');

  // Biome mote palettes: Frostpeak snow vs Canyon Oasis sand vs Whispering Forest fireflies
  Env.setSkyProgress(8);
  Env.update(0.016, 4.0, { px: -68, py: 8, pz: -88, camX: -68, camY: 11, camZ: -80, waterY: 0 });
  const snowR = rig.motes.instanceColor.array[0];
  const snowB = rig.motes.instanceColor.array[2];
  assert.ok(snowR > 0.7 && snowB > 0.85, 'Frostpeak motes should be icy white/blue snow flurries');

  Env.update(0.016, 5.0, { px: -86, py: 4, pz: -14, camX: -86, camY: 7, camZ: -6, waterY: 0 });
  const sandR = rig.motes.instanceColor.array[0];
  const sandB = rig.motes.instanceColor.array[2];
  assert.ok(sandR > sandB + 0.15, 'Canyon Oasis motes should be warm sand/ochre');

  Env.update(0.016, 6.0, { px: 62, py: 5, pz: -78, camX: 62, camY: 8, camZ: -70, waterY: 0 });
  const ffG = rig.motes.instanceColor.array[1];
  const ffB = rig.motes.instanceColor.array[2];
  assert.ok(ffG > ffB + 0.15, 'Whispering Forest motes should be emerald-gold fireflies/spores');

  // Strict runtime zero-GC check across steady-state gameplay ticks
  const addCallsBefore = scene.addCalls;
  resetAllocs();
  for (let i = 0; i < 30; i++) {
    const t = 7.0 + i * 0.016;
    Env.computeCelestialState(8, t);
    Env.getCelestialState();
    Env.updateWind(t);
    Env.getWindGust();
    Env.update(0.016, t, { px: 10, py: 3, pz: -10, camX: 10, camY: 6, camZ: -2, waterY: 0 });
  }
  Env.setQuality('balanced');
  Env.setQuality('high');
  assert.equal(totalAllocs(), 0, 'Steady-state Env ticks must allocate ZERO THREE objects');
  assert.equal(scene.addCalls, addCallsBefore, 'Steady-state Env ticks must call scene.add ZERO times');

  // Static zero-GC allocation scan of hot-loop functions
  const hotFns = ['computeCelestialState', 'setSkyProgress', 'getCelestialState', 'updateWind', 'getWindGust', 'setQuality', 'update'];
  for (const fnName of hotFns) {
    const fnStart = src.indexOf(`function ${fnName}(`);
    assert.ok(fnStart >= 0, `Could not locate function ${fnName} in env.js`);
    let depth = 0;
    let bodyStart = src.indexOf('{', fnStart);
    let i = bodyStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const fnBody = src.slice(bodyStart, i + 1);
    for (const forbidden of [
      /\bnew\s+THREE\./,
      /\bnew\s+Map\b/,
      /\bnew\s+Set\b/,
      /\bnew\s+Float32Array\b/,
      /\bnew\s+Uint8Array\b/,
      /\bnew\s+Array\b/,
      /\bArray\.from\b/,
    ]) {
      assert.ok(!forbidden.test(fnBody), `Hot function ${fnName} matched forbidden allocation ${forbidden}`);
    }
  }

  // initScene initializes uStarAlpha directly from current celestial state
  Env._resetCache();
  Env.setSkyProgress(8);
  const rigDay = Env.initScene(new THREE.Scene(), { THREE, Shaders: makeMockEnv().Shaders });
  assert.equal(rigDay.stars.material.uniforms.uStarAlpha.value, 0, 'uStarAlpha must initialize to 0 when day is active');
});
