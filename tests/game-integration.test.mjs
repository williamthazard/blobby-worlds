import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockThree() {
  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    set(x, y) { this.x = x; this.y = y; return this; }
    setScalar(v) { this.x = v; this.y = v; return this; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setY(y) { this.y = y; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    crossVectors(a, b) {
      this.x = a.y * b.z - a.z * b.y;
      this.y = a.z * b.x - a.x * b.z;
      this.z = a.x * b.y - a.y * b.x;
      return this;
    }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l;
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
    lerp(v, a) {
      this.x += (v.x - this.x) * a;
      this.y += (v.y - this.y) * a;
      this.z += (v.z - this.z) * a;
      return this;
    }
    distanceTo(v) {
      return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
    }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    project() {
      this.x = 0;
      this.y = 0;
      this.z = 0.5;
      return this;
    }
  }
  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
      this.x = x; this.y = y; this.z = z; this.order = order;
    }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x; this.y = y; this.z = z; this.w = w;
    }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
    setFromEuler() { return this; }
    setFromUnitVectors() { return this; }
    setFromAxisAngle(axis, angle) {
      const s = Math.sin(angle * 0.5);
      this.x = axis.x * s;
      this.y = axis.y * s;
      this.z = axis.z * s;
      this.w = Math.cos(angle * 0.5);
      return this;
    }
    multiply(q) {
      const ax = this.x, ay = this.y, az = this.z, aw = this.w;
      const bx = q.x, by = q.y, bz = q.z, bw = q.w;
      this.x = aw * bx + ax * bw + ay * bz - az * by;
      this.y = aw * by - ax * bz + ay * bw + az * bx;
      this.z = aw * bz + ax * by - ay * bx + az * bw;
      this.w = aw * bw - ax * bx - ay * by - az * bz;
      return this;
    }
    slerp(q, t) {
      this.x += (q.x - this.x) * t;
      this.y += (q.y - this.y) * t;
      this.z += (q.z - this.z) * t;
      this.w += (q.w - this.w) * t;
      return this;
    }
  }
  class Matrix4 {
    constructor() {
      this.elements = new Float32Array(16);
      this.elements[0] = this.elements[5] = this.elements[10] = this.elements[15] = 1;
    }
    compose(pos, quat, scale) {
      if (pos) {
        this.elements[12] = pos.x;
        this.elements[13] = pos.y;
        this.elements[14] = pos.z;
      }
      if (scale) {
        this.elements[0] = scale.x;
        this.elements[5] = scale.y;
        this.elements[10] = scale.z;
      }
      return this;
    }
    copy(m) { this.elements.set(m.elements); return this; }
    multiplyMatrices() { return this; }
    makeTranslation(x, y, z) {
      this.elements[12] = x; this.elements[13] = y; this.elements[14] = z;
      return this;
    }
    makeRotationX() { return this; }
    makeRotationY() { return this; }
    makeRotationZ() { return this; }
    makeScale(x, y, z) {
      this.elements[0] = x; this.elements[5] = y; this.elements[10] = z;
      return this;
    }
  }
  class Color {
    constructor(c = 0xffffff) { this.r = 1; this.g = 1; this.b = 1; this.set(c); }
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
    setHex(hex) { return this.set(hex); }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
    copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
    clone() { return new Color().copy(this); }
    multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
    lerp(c, a) {
      this.r += (c.r - this.r) * a;
      this.g += (c.g - this.g) * a;
      this.b += (c.b - this.b) * a;
      return this;
    }
    lerpColors(a, b, t) {
      this.r = a.r + (b.r - a.r) * t;
      this.g = a.g + (b.g - a.g) * t;
      this.b = a.b + (b.b - a.b) * t;
      return this;
    }
    offsetHSL(_h, _s, l) {
      this.r = Math.max(0, Math.min(1, this.r + l));
      this.g = Math.max(0, Math.min(1, this.g + l));
      this.b = Math.max(0, Math.min(1, this.b + l));
      return this;
    }
    convertSRGBToLinear() { return this; }
  }
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
      this.needsUpdate = false;
    }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
    setXYZ(i, x, y, z) {
      const idx = i * this.itemSize;
      this.array[idx] = x;
      this.array[idx + 1] = y;
      this.array[idx + 2] = z;
    }
    setXY(i, x, y) {
      const idx = i * this.itemSize;
      this.array[idx] = x;
      this.array[idx + 1] = y;
    }
    setY(i, y) { this.array[i * this.itemSize + 1] = y; }
  }
  class BufferGeometry {
    constructor(kind = 'buffer') {
      this.kind = kind;
      this.attributes = {};
      this.index = null;
      this.disposed = false;
    }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setIndex(idx) {
      this.index = Array.isArray(idx) ? new BufferAttribute(new Uint16Array(idx), 1) : idx;
      return this;
    }
    setDrawRange() { return this; }
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
    rotateY() { return this; }
    rotateZ() { return this; }
    applyMatrix4() { return this; }
    translate(tx = 0, ty = 0, tz = 0) {
      const pos = this.attributes.position;
      if (!pos) return this;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] += tx;
        pos.array[i * 3 + 1] += ty;
        pos.array[i * 3 + 2] += tz;
      }
      return this;
    }
    scale(sx = 1, sy = 1, sz = 1) {
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
      return this;
    }
    toNonIndexed() { return this; }
    clone() {
      const g = new BufferGeometry(this.kind);
      for (const k in this.attributes) {
        const a = this.attributes[k];
        g.attributes[k] = new BufferAttribute(new a.array.constructor(a.array), a.itemSize);
      }
      if (this.index) {
        g.index = new BufferAttribute(new this.index.array.constructor(this.index.array), this.index.itemSize);
      }
      return g;
    }
    dispose() { this.disposed = true; }
  }
  class PlaneGeometry extends BufferGeometry {
    constructor(width = 1, height = 1, wSeg = 1, hSeg = 1) {
      super('plane');
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
          pos[p] = x; pos[p + 1] = y; pos[p + 2] = 0;
          norm[p + 2] = 1;
          uv[u] = s; uv[u + 1] = 1 - v;
          p += 3; u += 2;
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
    constructor(kind, seg = 8, rings = 4, height = 1) {
      super(kind);
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
          p += 3; u += 2;
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
    constructor(_rt = 1, _rb = 1, h = 1, radSeg = 8, hSeg = 1) { super('cylinder', radSeg, hSeg, h); }
  }
  class ConeGeometry extends RadialGeometry {
    constructor(_r = 1, h = 1, radSeg = 8, hSeg = 1) { super('cone', radSeg, hSeg, h); }
  }
  class SphereGeometry extends RadialGeometry {
    constructor(r = 1, wSeg = 8, hSeg = 6) { super('sphere', wSeg, hSeg, r * 2); }
  }
  class IcosahedronGeometry extends RadialGeometry {
    constructor(r = 1, detail = 1) { super('icosahedron', 6 + detail * 4, 3 + detail * 2, r * 2); }
  }
  class BoxGeometry extends RadialGeometry {
    constructor() { super('box', 4, 2, 1); }
  }
  class TorusGeometry extends RadialGeometry {
    constructor() { super('torus', 6, 3, 1); }
  }
  class OctahedronGeometry extends RadialGeometry {
    constructor() { super('octahedron', 4, 2, 1); }
  }
  class DodecahedronGeometry extends RadialGeometry {
    constructor() { super('dodecahedron', 5, 3, 1); }
  }
  class RingGeometry extends RadialGeometry {
    constructor() { super('ring', 6, 1, 0); }
  }
  class Object3D {
    constructor() {
      this.children = [];
      this.parent = null;
      this.position = new Vector3();
      this.rotation = new Euler();
      this.quaternion = new Quaternion();
      this.scale = new Vector3(1, 1, 1);
      this.matrix = new Matrix4();
      this.userData = {};
      this.visible = true;
      this.castShadow = false;
      this.receiveShadow = false;
      this.frustumCulled = true;
    }
    add(...items) {
      for (const c of items) {
        if (!c) continue;
        c.parent = this;
        this.children.push(c);
      }
      return this;
    }
    remove(item) {
      const idx = this.children.indexOf(item);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        item.parent = null;
      }
    }
    traverse(fn) {
      fn(this);
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].traverse(fn);
      }
    }
    updateMatrix() { this.matrix.compose(this.position, this.quaternion, this.scale); }
    updateMatrixWorld() {}
    lookAt() {}
    rotateX() {}
    getWorldDirection(v) { return v.set(0, 0, 1); }
  }
  class Scene extends Object3D {
    constructor() {
      super();
      this.addCalls = 0;
      this.background = null;
      this.fog = null;
      this.environment = null;
    }
    add(...items) {
      this.addCalls += items.length;
      return super.add(...items);
    }
  }
  class Mat {
    constructor(opts = {}) {
      this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
      this.emissive = new Color(opts.emissive !== undefined ? opts.emissive : 0x000000);
      this.emissiveIntensity = opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1;
      Object.assign(this, opts);
      this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
      this.emissive = new Color(opts.emissive !== undefined ? opts.emissive : 0x000000);
    }
    clone() { return new Mat({ ...this }); }
    dispose() {}
  }
  class InstancedMesh extends Object3D {
    constructor(geometry, material, count) {
      super();
      this.type = 'InstancedMesh';
      this.isInstancedMesh = true;
      this.geometry = geometry;
      this.material = material;
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
  class Mesh extends Object3D {
    constructor(g, m) { super(); this.type = 'Mesh'; this.geometry = g; this.material = m; }
  }
  class Points extends Object3D {
    constructor(g, m) { super(); this.geometry = g; this.material = m; }
  }
  class LineSegments extends Object3D {
    constructor(g, m) { super(); this.geometry = g; this.material = m; }
  }
  class Sprite extends Object3D {
    constructor(m) { super(); this.material = m; }
  }
  class PointLight extends Object3D {
    constructor(c, i, d) { super(); this.color = c; this.intensity = i; this.distance = d; }
  }
  class HemisphereLight extends Object3D {
    constructor(sky, gnd, i = 1) {
      super();
      this.color = new Color(sky);
      this.groundColor = new Color(gnd);
      this.intensity = i;
    }
  }
  class OrthographicCamera extends Object3D {
    constructor() {
      super();
      this.left = -1; this.right = 1; this.top = 1; this.bottom = -1; this.near = 0.5; this.far = 500;
    }
    updateProjectionMatrix() {}
  }
  class DirectionalLight extends Object3D {
    constructor(c, i = 1) {
      super();
      this.color = new Color(c);
      this.intensity = i;
      this.target = new Object3D();
      this.shadow = {
        mapSize: new Vector2(512, 512),
        camera: new OrthographicCamera(),
        bias: 0,
        normalBias: 0,
        map: { disposed: false, dispose() { this.disposed = true; } },
      };
    }
  }
  class PerspectiveCamera extends Object3D {
    constructor(fov = 60, aspect = 1, near = 0.1, far = 600) {
      super();
      this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    }
    updateProjectionMatrix() {}
  }
  class CanvasTexture {
    constructor(canvas) { this.canvas = canvas; this.needsUpdate = false; }
  }
  class DataTexture {
    constructor(data, w, h) { this.data = data; this.width = w; this.height = h; this.needsUpdate = false; }
  }
  class Fog {
    constructor(color, near, far) { this.color = new Color(color); this.near = near; this.far = far; }
  }
  class WebGLRenderer {
    constructor(opts = {}) {
      this.opts = opts;
      this.domElement = {
        tagName: 'CANVAS',
        listeners: {},
        addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
        removeEventListener() {},
      };
      this.shadowMap = { enabled: false, type: null };
      this.capabilities = { maxTextureSize: 4096, getMaxAnisotropy: () => 4 };
      this._pixelRatio = 1;
    }
    setSize() {}
    setPixelRatio(r) { this._pixelRatio = r; }
    getPixelRatio() { return this._pixelRatio; }
    render() {}
  }
  class PMREMGenerator {
    constructor() {}
    fromScene() { return { texture: {}, dispose() {} }; }
    dispose() {}
  }

  return {
    Vector2,
    Vector3,
    Euler,
    Quaternion,
    Matrix4,
    Color,
    BufferAttribute,
    BufferGeometry,
    Object3D,
    Group: Object3D,
    Scene,
    Mesh,
    InstancedMesh,
    Points,
    LineSegments,
    Sprite,
    PointLight,
    HemisphereLight,
    DirectionalLight,
    PerspectiveCamera,
    OrthographicCamera,
    CanvasTexture,
    DataTexture,
    Fog,
    WebGLRenderer,
    PMREMGenerator,
    DoubleSide: 2,
    BackSide: 1,
    AdditiveBlending: 2,
    sRGBEncoding: 3001,
    LinearEncoding: 3000,
    ClampToEdgeWrapping: 1001,
    RepeatWrapping: 1000,
    ACESFilmicToneMapping: 4,
    PCFSoftShadowMap: 2,
    MathUtils: {
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      smoothstep: (x, a, b) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      },
    },
    MeshStandardMaterial: Mat,
    MeshBasicMaterial: Mat,
    ShaderMaterial: Mat,
    PointsMaterial: Mat,
    LineBasicMaterial: Mat,
    SpriteMaterial: Mat,
    SphereGeometry,
    CylinderGeometry,
    ConeGeometry,
    BoxGeometry,
    TorusGeometry,
    OctahedronGeometry,
    IcosahedronGeometry,
    DodecahedronGeometry,
    PlaneGeometry,
    RingGeometry,
    CircleGeometry: RingGeometry,
  };
}

function makeMockDocument({ withCanvas = false } = {}) {
  const elements = new Map();
  const makeEl = (id) => {
    const classes = new Set();
    const listeners = {};
    const el = {
      id,
      textContent: '',
      style: {},
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          } else if (force) classes.add(c);
          else classes.delete(c);
          return classes.has(c);
        },
        contains: (c) => classes.has(c),
      },
      addEventListener: (ev, fn, opts) => {
        (listeners[ev] ||= []).push({ fn, opts });
      },
      removeEventListener: (ev, fn) => {
        if (!listeners[ev]) return;
        listeners[ev] = listeners[ev].filter(entry => entry.fn !== fn);
      },
      dispatchEvent: (evObj) => {
        const list = (listeners[evObj.type] || []).slice();
        for (const entry of list) entry.fn(evObj);
      },
      getListeners: (ev) => listeners[ev] || [],
      getBoundingClientRect: () => el._rect || { left: 20, top: 400, width: 120, height: 120 },
      click: () => {
        for (const entry of (listeners.click || [])) entry.fn({ target: el });
      },
    };
    elements.set(id, el);
    return el;
  };
  for (const id of [
    'starCount', 'friendCount', 'litCount', 'airWrap', 'airFill',
    'questBar', 'questText', 'toast', 'overlay', 'playBtn',
    'soundBtn', 'qualityBtn', 'lockReticle', 'letterboxTop', 'letterboxBot',
  ]) {
    makeEl(id);
  }
  const bodyClasses = new Set();
  const docListeners = {};
  const doc = {
    elements,
    head: { appendChild() {} },
    body: {
      appendChild() {},
      classList: {
        toggle: (c, force) => {
          if (force === undefined) {
            if (bodyClasses.has(c)) bodyClasses.delete(c);
            else bodyClasses.add(c);
          } else if (force) bodyClasses.add(c);
          else bodyClasses.delete(c);
          return bodyClasses.has(c);
        },
        contains: (c) => bodyClasses.has(c),
      },
    },
    getElementById: (id) => elements.get(id) || makeEl(id),
    addEventListener: (ev, fn, opts) => {
      (docListeners[ev] ||= []).push({ fn, opts });
    },
    removeEventListener: (ev, fn) => {
      if (!docListeners[ev]) return;
      docListeners[ev] = docListeners[ev].filter(entry => entry.fn !== fn);
    },
    dispatchEvent: (evObj) => {
      const list = (docListeners[evObj.type] || []).slice();
      for (const entry of list) entry.fn(evObj);
    },
    getListeners: (ev) => docListeners[ev] || [],
  };
  if (withCanvas) {
    doc.createElement = (tag) => {
      if (tag !== 'canvas') return { tagName: tag };
      const canvas = {
        width: 0,
        height: 0,
        _data: null,
        getContext() {
          return {
            font: '',
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            lineCap: 'butt',
            textAlign: '',
            textBaseline: '',
            shadowColor: '',
            shadowBlur: 0,
            createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: (img) => { canvas._data = img.data; },
            createRadialGradient: () => ({ addColorStop() {} }),
            clearRect() {},
            fillRect() {},
            fillText() {},
            beginPath() {},
            closePath() {},
            moveTo() {},
            lineTo() {},
            quadraticCurveTo() {},
            arc() {},
            ellipse() {},
            stroke() {},
            fill() {},
            save() {},
            restore() {},
            translate() {},
            rotate() {},
            scale() {},
          };
        },
      };
      return canvas;
    };
  }
  return doc;
}

function loadGameHarness({ hash = '', fullWorld = false } = {}) {
  const THREE = makeMockThree();
  const doc = makeMockDocument({ withCanvas: fullWorld });
  const rafQueue = [];

  const audioCode = fs.readFileSync(new URL('../audio.js', import.meta.url), 'utf8');
  const texturesCode = fullWorld ? fs.readFileSync(new URL('../textures.js', import.meta.url), 'utf8') : null;
  const shadersCode = fullWorld ? fs.readFileSync(new URL('../shaders.js', import.meta.url), 'utf8') : null;
  const envCode = fs.readFileSync(new URL('../env.js', import.meta.url), 'utf8');
  const regionsCode = fs.readFileSync(new URL('../regions.js', import.meta.url), 'utf8');
  const worldCode = fullWorld ? fs.readFileSync(new URL('../world.js', import.meta.url), 'utf8') : null;
  const modelsCode = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const rigCode = fs.readFileSync(new URL('../rig.js', import.meta.url), 'utf8');
  const physicsCode = fs.readFileSync(new URL('../physics.js', import.meta.url), 'utf8');
  const animalsCode = fs.readFileSync(new URL('../animals.js', import.meta.url), 'utf8');
  const enemiesCode = fs.readFileSync(new URL('../enemies.js', import.meta.url), 'utf8');
  const gameCode = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');

  const makeAudioParam = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });
  const winListeners = {};
  const windowObj = {
    addEventListener: (ev, fn, opts) => {
      (winListeners[ev] ||= []).push({ fn, opts });
    },
    removeEventListener: (ev, fn) => {
      if (!winListeners[ev]) return;
      winListeners[ev] = winListeners[ev].filter(entry => entry.fn !== fn);
    },
    dispatchEvent: (evObj) => {
      const list = (winListeners[evObj.type] || []).slice();
      for (const entry of list) entry.fn(evObj);
    },
    getListeners: (ev) => winListeners[ev] || [],
    AudioContext: function () {
      return {
        currentTime: 0,
        sampleRate: 44100,
        destination: {},
        resume: () => {},
        createGain: () => ({ gain: makeAudioParam(), connect: () => {} }),
        createBiquadFilter: () => ({ type: 'lowpass', frequency: makeAudioParam(), Q: makeAudioParam(), connect: () => {} }),
        createOscillator: () => ({ type: 'sine', frequency: makeAudioParam(), detune: makeAudioParam(), connect: () => {}, start: () => {}, stop: () => {} }),
        createBuffer: (_c, l) => ({ getChannelData: () => new Float32Array(l) }),
        createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {}, stop: () => {} }),
      };
    },
  };

  let quality = 'high';
  let skyProgress = 0;
  let totemCol = null;
  let colliders = [];
  const mockScene = fullWorld ? null : new THREE.Scene();
  const mockCamera = fullWorld ? null : new THREE.PerspectiveCamera();
  const mockRenderer = fullWorld ? null : new THREE.WebGLRenderer();

  const sandbox = {
    Math,
    Number,
    Array,
    Object,
    Map,
    Set,
    WeakSet,
    WeakMap,
    Float32Array,
    Uint16Array,
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
    console,
    performance: { now: () => 1000 },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    addEventListener: windowObj.addEventListener,
    removeEventListener: windowObj.removeEventListener,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    location: { hash },
    document: doc,
    window: windowObj,
    THREE,
  };

  if (!fullWorld) {
    Object.assign(sandbox, {
      Textures: { sets: {} },
      Shaders: {
        MAX_TRAMPLERS: 16,
        uniforms: {
          uClothMotion: {
            value: {
              x: 0, y: 0, z: 0, w: 0.25,
              set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; },
            },
          },
        },
        tramplers: Array.from({ length: 16 }, () => ({ x: 0, y: -999, z: 0, w: 0 })),
        setTrampler(i, x, y, z, r) {
          if (i >= 0 && i < 16) {
            this.tramplers[i].x = x;
            this.tramplers[i].y = y;
            this.tramplers[i].z = z;
            this.tramplers[i].w = r;
          }
        },
        clearTramplersFrom(start) {
          for (let i = Math.max(0, start | 0); i < 16; i++) {
            this.tramplers[i].x = 0;
            this.tramplers[i].y = -999;
            this.tramplers[i].z = 0;
            this.tramplers[i].w = 0;
          }
        },
        setClothMotion(s, v, r, w) {
          this.uniforms.uClothMotion.value.set(s || 0, v || 0, r || 0, w !== undefined ? w : 0.25);
        },
        setCelestial() {},
        setWind() {},
        waterHeightAt: () => 0,
        createGlowSprite: () => new THREE.Sprite(new THREE.SpriteMaterial()),
        createStarfieldMaterial: () => new THREE.ShaderMaterial({ uniforms: { uStarAlpha: { value: 1 } } }),
        createCloudMaterial: () => new THREE.ShaderMaterial({ uniforms: {} }),
      },
      WATER_Y: 0,
      DAY_SKY_MAX_LIT: 8,
      heightAt: () => 2.0,
      terrainNormalAt: (_x, _z, out) => {
        const o = out || {};
        o.x = 0; o.y = 1; o.z = 0;
        return o;
      },
      surfaceAt: () => 'grass',
      setTotemCollider: (x, z, r) => { totemCol = { x, z, r }; },
      clearTotemCollider: () => { totemCol = null; },
      getNearbyColliders: (x, z, rad, out) => {
        const arr = out || [];
        arr.length = 0;
        for (const c of colliders) {
          if (Math.hypot(c.x - x, c.z - z) <= rad + c.r) arr.push(c);
        }
        if (totemCol && Math.hypot(totemCol.x - x, totemCol.z - z) <= rad + totemCol.r) {
          arr.push(totemCol);
        }
        return arr;
      },
      landSpot: (px, pz, minD, maxD) => ({ x: px + (minD + maxD) * 0.5, z: pz, h: 2.0 }),
      waterSpot: (px, pz, minD, maxD) => ({ x: px + (minD + maxD) * 0.5, z: pz, h: -4.0 }),
      constellationNameFor: (n) => 'Constellation ' + n,
      addConstellation: () => {},
      setQuality: (m) => { quality = m === 'balanced' ? 'balanced' : 'high'; return quality; },
      getQuality: () => quality,
      setSkyProgress: (lit) => { skyProgress = lit; },
      updateChunks: () => {},
      updateEnvironment: () => {},
      scene: mockScene,
      camera: mockCamera,
      renderer: mockRenderer,
    });
  }

  sandbox.globalThis = sandbox;

  const chunksToRun = fullWorld
    ? [
      audioCode, texturesCode, shadersCode, envCode, regionsCode, worldCode,
      modelsCode, rigCode, physicsCode, animalsCode, enemiesCode, gameCode,
    ]
    : [
      audioCode, envCode, regionsCode,
      'var worldLandmarks = Regions.buildWorldLandmarks(scene, heightAt, terrainNormalAt, Textures);',
      modelsCode, rigCode, physicsCode, animalsCode, enemiesCode, gameCode,
    ];

  vm.runInNewContext(chunksToRun.join('\n'), sandbox);

  const dbg = sandbox.window.__GAME_DEBUG__ || sandbox.__GAME_DEBUG__;
  return {
    sandbox,
    dbg,
    doc,
    win: windowObj,
    scene: fullWorld ? dbg.scene : mockScene,
    THREE,
    rafQueue,
    getTotemCol: () => totemCol,
    setColliders: (c) => { colliders = c; },
    getQualityState: () => (fullWorld ? dbg.getQuality() : quality),
    getSkyProgress: () => skyProgress,
  };
}

test('index.html fixes typo, loads scripts in exact order, and includes upgraded HUD & Z-target elements', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes("they\\'ll"), 'must fix escaped they\\\'ll typo');
  assert.ok(html.includes("they'll"), "must contain proper they'll contraction");
  assert.ok(html.includes('backdrop-filter: blur(8px)'), 'HUD pills should use backdrop-filter blur');
  assert.ok(html.includes('id="qualityBtn"'), 'must include #qualityBtn');
  assert.ok(html.includes('Quality: High'), 'must label #qualityBtn Quality: High initially');
  assert.ok(html.includes('id="soundBtn"'), 'must include #soundBtn');
  assert.ok(html.includes('id="lockReticle"'), 'must include #lockReticle');
  assert.ok(html.includes('id="letterboxTop"'), 'must include #letterboxTop');
  assert.ok(html.includes('id="letterboxBot"'), 'must include #letterboxBot');
  assert.ok(html.includes('id="controlsBtn"'), 'must include #controlsBtn in HUD');
  assert.ok(html.includes('id="controlsPanel"'), 'must include toggleable #controlsPanel');
  assert.ok(html.includes('id="heartsHud"'), 'must include #heartsHud for 6 hearts');
  assert.ok(html.includes('id="topHudBar"'), 'must wrap top HUD in responsive #topHudBar container');
  assert.ok(html.includes('id="statusRow"'), 'must stack hearts & air meter cleanly in flow inside #statusRow');
  assert.ok(html.includes('id="touchControls"') && html.includes('id="touchJoyBase"') && html.includes('id="touchToggleBtn"'), 'must include responsive mobile touch controls & toggle');
  assert.ok(html.includes('viewport-fit=cover'), 'viewport meta must include viewport-fit=cover for mobile notches');
  assert.ok(html.includes('id="aimReticle"'), 'must include manual #aimReticle crosshair');
  assert.ok(html.includes('id="damageFlash"'), 'must include #damageFlash vignette');
  assert.ok(html.includes('id="deathOverlay"'), 'must include #deathOverlay respawn screen');
  assert.ok(html.includes('z-active'), 'must include .z-active letterbox state');
  assert.ok(html.includes('Shift'), 'controls must document Shift sprint');
  assert.ok(html.includes('C / X') || html.includes('C or X'), 'controls must document C/X directional roll');
  assert.ok(html.includes('Tab') && html.includes('Right-Click'), 'controls must document Tab / Right-Click lock-on');

  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'vendor/GLTFLoader.js',
    'vendor/SkeletonUtils.js',
    'audio.js',
    'textures.js',
    'shaders.js',
    'env.js',
    'regions.js',
    'world.js',
    'models.js',
    'rig.js',
    'physics.js',
    'animals.js',
    'enemies.js',
    'game.js',
  ]);
});

test('game.js exposes window.__GAME_DEBUG__, wires Physics/Models, and toggles quality button', () => {
  const { dbg, doc, getQualityState } = loadGameHarness({ hash: '#test' });
  assert.ok(dbg, 'window.__GAME_DEBUG__ must be defined');
  for (const key of [
    'P', 'Physics', 'Models', 'Shaders', 'Textures', 'Env', 'scene', 'camera', 'renderer',
    'glooms', 'cocoons', 'pickups', 'wild', 'followers', 'getTotem',
    'heightAt', 'terrainNormalAt', 'getNearbyColliders', 'setQuality',
    'setSkyProgress', 'lightTotem', 'shoot', 'spawnGloom', 'spawnCocoon',
  ]) {
    assert.ok(key in dbg, `debug handle must expose ${key}`);
  }
  assert.ok(dbg.player.userData.pelvis, 'player must be created via Models.makePlayer()');
  assert.ok(dbg.wish.mesh.userData.wings && dbg.wish.mesh.userData.halo, 'wish must be created via Models.makeWish()');

  const qBtn = doc.getElementById('qualityBtn');
  qBtn.click();
  assert.equal(getQualityState(), 'balanced');
  assert.equal(qBtn.textContent, 'Quality: Balanced');
  qBtn.click();
  assert.equal(getQualityState(), 'high');
  assert.equal(qBtn.textContent, 'Quality: High');
});

test('pooled particle system uses 320 particles and 80 bubbles with zero runtime scene.add or Material allocations', () => {
  const { dbg, scene, rafQueue } = loadGameHarness({ hash: '#test' });
  const instanced = scene.children.filter(c => c.count === 320 || c.count === 80);
  assert.equal(instanced.length, 2, 'should add exactly two InstancedMeshes (320 particles + 80 bubbles)');

  const pMesh = instanced.find(c => c.count === 320);
  const bMesh = instanced.find(c => c.count === 80);
  pMesh.instanceMatrix.needsUpdate = false;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = false;
  bMesh.instanceMatrix.needsUpdate = false;
  if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = false;

  // Idle frame with zero active particles should not flag dirty buffers
  rafQueue[0](1016);
  assert.equal(pMesh.instanceMatrix.needsUpdate, false, 'idle frame should not upload particle matrix');
  assert.equal(bMesh.instanceMatrix.needsUpdate, false, 'idle frame should not upload bubble matrix');

  const addsBefore = scene.addCalls;
  dbg.burst(dbg.P.x, dbg.P.y + 1, dbg.P.z, 0xffd93b, 12, false);
  dbg.dustBurst(dbg.P.x, dbg.P.y, dbg.P.z, 5, 'sand');
  dbg.splashBurst(dbg.P.x, 0, dbg.P.z, 6);
  dbg.burst(dbg.P.x, dbg.P.y + 1, dbg.P.z, 0xff8fb0, 4, true);
  assert.equal(scene.addCalls, addsBefore, 'burst/dustBurst/splashBurst must not call scene.add()');

  rafQueue[rafQueue.length - 1](1032);
  assert.equal(pMesh.instanceMatrix.needsUpdate, true, 'active particles should upload instanceMatrix');
  assert.equal(bMesh.instanceMatrix.needsUpdate, true, 'active bubbles should upload instanceMatrix');
});

test('Gloomblob combat applies knockback impulse, spawns bouncing star drops, and respects roll invulnT', () => {
  const { dbg, rafQueue, doc } = loadGameHarness({ hash: '#test' });
  dbg.spawnGloom();
  assert.ok(dbg.glooms.length >= 1, 'should spawn gloom');
  const g = dbg.glooms[0];
  g.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 5);
  dbg.P.facing = 0;

  // First hit applies knockback impulse & recoil flash (3 HP -> 2 HP)
  dbg.Physics.toggleLockOn();
  dbg.shoot();
  for (let i = 0; i < 12; i++) rafQueue[rafQueue.length - 1](1050 + i * 20);
  assert.equal(g.hp, 2, 'first Star Bolt hit reduces 3 HP gloom to 2');
  assert.ok(Math.hypot(g.kx, g.kz) > 0.5 || g.ky > 0, 'hitGloom should apply knockback impulse');

  // Second and third hits defeat gloom and spawn bouncing star pickups
  for (let shot = 0; shot < 2; shot++) {
    rafQueue[rafQueue.length - 1](1350 + shot * 450);
    rafQueue[rafQueue.length - 1](1400 + shot * 450);
    g.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 5);
    dbg.shoot();
    for (let i = 0; i < 14; i++) rafQueue[rafQueue.length - 1](1425 + shot * 450 + i * 20);
  }
  const pickupsBefore = 0;
  for (let i = 0; i < 12; i++) rafQueue[rafQueue.length - 1](2300 + i * 25);
  assert.equal(dbg.glooms.includes(g), false, '3 Star Bolt hits should defeat 3 HP gloom');
  assert.ok(dbg.pickups.length >= pickupsBefore + 2, 'defeating gloom should spawn 2-3 star pickups');
  const dropped = dbg.pickups.filter(p => p.userData.kind === 'star');
  assert.ok(dropped.some(p => p.userData.bouncing === true || p.userData.bounces >= 1), 'dropped stars should bounce');
  dbg.Physics.clearLockOn();

  // Collect a dropped star so Starkeeper carries >= 1 star
  const starPickup = dropped[0];
  starPickup.userData.bouncing = false;
  starPickup.userData.baseY = dbg.P.y + 0.8;
  starPickup.position.set(dbg.P.x, dbg.P.y + 0.8, dbg.P.z);
  rafQueue[rafQueue.length - 1](2050);
  assert.ok(Number(doc.getElementById('starCount').textContent) >= 1, 'player should collect dropped star');

  // Dodge-roll invulnerability prevents star theft even right on top of gloom
  dbg.spawnGloom();
  const g2 = dbg.glooms[dbg.glooms.length - 1];
  g2.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 0.5);
  dbg.P.invulnT = 0.35;
  const starsBeforeInvuln = Number(doc.getElementById('starCount').textContent);
  rafQueue[rafQueue.length - 1](2100);
  assert.equal(g2.stolen, false, 'invulnT > 0 should block gloom star theft');
  assert.equal(Number(doc.getElementById('starCount').textContent), starsBeforeInvuln, 'star count unchanged during roll invuln');
});

test('Z-target updates HUD reticle + letterbox, sends Wish overhead, and Totem manages collider', () => {
  const { dbg, rafQueue, doc, getTotemCol } = loadGameHarness({ hash: '#test' });
  const totem = dbg.getTotem();
  assert.ok(totem, 'beginGame should spawn totem');
  assert.ok(getTotemCol() && Math.abs(getTotemCol().r - 1.15) < 0.01, 'totem should register 1.15 collider');

  dbg.spawnGloom();
  const g = dbg.glooms[0];
  g.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 6);
  dbg.Physics.toggleLockOn();
  assert.ok(dbg.Physics.lockTarget, 'lockTarget should engage');

  for (let i = 0; i < 25; i++) rafQueue[rafQueue.length - 1](1050 + i * 30);
  assert.equal(doc.body.classList.contains('z-active'), true, 'body should have z-active class when locked');
  assert.equal(doc.getElementById('lockReticle').style.opacity, '1', 'lock reticle should be visible');
  assert.ok(doc.getElementById('lockReticle').style.transform.includes('translate3d'), 'reticle uses translate3d');
  assert.ok(dbg.wish.mesh.position.y > g.mesh.position.y + 1.2, 'Wish should arc above locked target');

  dbg.lightTotem();
  assert.equal(getTotemCol(), null, 'lightTotem should clear totem collider');
});

test('wild critters and followers resolve solid prop colliders and hot loops avoid Vector3 allocations', () => {
  const { dbg, rafQueue, setColliders } = loadGameHarness({ hash: '#test' });
  const gameSrc = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  const hotLoopStart = gameSrc.indexOf('function updateWish');
  assert.ok(hotLoopStart >= 0, 'updateWish must exist');
  const hotSection = gameSrc.slice(hotLoopStart);
  assert.ok(!hotSection.includes('new THREE.Vector3'), 'hot update functions must not allocate new THREE.Vector3');

  // Place a rock collider and ensure follower is pushed outside it (no hollow guard)
  setColliders([{ x: dbg.P.x + 2.0, z: dbg.P.z, r: 0.9 }]);
  dbg.spawnCocoon();
  assert.ok(dbg.cocoons.length >= 1, 'spawnCocoon should create a cocoon');
  const cc = dbg.cocoons[0];
  cc.mesh.position.set(dbg.P.x, 2, dbg.P.z + 2.2);
  dbg.P.facing = 0;
  dbg.meleeAttack();
  assert.ok(dbg.followers.length > 0, 'popping cocoon must deterministically create a follower');
  const f = dbg.followers[0];
  f.mesh.position.set(dbg.P.x + 2.1, 2, dbg.P.z + 0.05);
  rafQueue[rafQueue.length - 1](1500);
  rafQueue[rafQueue.length - 1](1550);
  const distToRock = Math.hypot(f.mesh.position.x - (dbg.P.x + 2.0), f.mesh.position.z - dbg.P.z);
  // Small critters (beetle/kiwi) use colRadius 0.34 + rock radius 0.90 = 1.24 push-out
  assert.ok(distToRock >= 1.22, `follower should be pushed outside rock collider, got dist=${distToRock}`);

  // Verify wild critter resolves solid prop collider during movement
  for (let i = 0; i < 4; i++) rafQueue[rafQueue.length - 1](1550 + i * 30);
  assert.ok(dbg.wild.length > 0, 'wild critters should spawn during update');
  const w = dbg.wild[0];
  w.state = 'wander';
  w.turnT = 5;
  w.dir = 0;
  const wx = dbg.P.x + 12.0;
  const wz = dbg.P.z + 12.0;
  setColliders([{ x: wx, z: wz, r: 0.9 }]);
  w.mesh.position.set(wx, 2, wz - 0.15);
  rafQueue[rafQueue.length - 1](1700);
  const wildDist = Math.hypot(w.mesh.position.x - wx, w.mesh.position.z - wz);
  assert.ok(wildDist >= 1.22, `wild critter should be pushed outside rock collider, got dist=${wildDist}`);
});

test('lightTotem enforces cooldown without double-spawning and stops spawning at 8/8 lit', () => {
  const { dbg, scene, rafQueue } = loadGameHarness({ hash: '#test' });
  const countTotemsInScene = () =>
    scene.children.filter(c => c.userData && c.userData.crystal && c.userData.ringA).length;

  assert.equal(countTotemsInScene(), 1, 'initial scene should have exactly 1 totem');

  // Light totems 1..7 and verify immediate frames respect cooldown and never leave >1 totem in scene
  for (let n = 1; n < 8; n++) {
    dbg.lightTotem();
    assert.equal(dbg.getTotem() === null, true, `totem should be null during cooldown after lighting #${n}`);
    assert.equal(countTotemsInScene(), 0, 'no orphaned totem should remain in scene');
    // Step 2 frames (<0.25s) -> still in cooldown
    rafQueue[rafQueue.length - 1](1000 + n * 500 + 30);
    assert.equal(dbg.getTotem() === null, true, 'totem should wait for 0.25s cooldown before respawning');
    // Step past 0.25s -> exactly 1 new totem spawns
    for (let k = 1; k <= 8; k++) rafQueue[rafQueue.length - 1](1000 + n * 500 + 30 + k * 40);
    assert.equal(dbg.getTotem() !== null, true, `totem #${n + 1} should respawn after cooldown`);
    assert.equal(countTotemsInScene(), 1, `scene must contain exactly 1 totem (not 2) on #${n + 1}`);
  }

  // Light 8th totem -> 8/8 complete, totem must NOT respawn even after many frames
  dbg.lightTotem();
  assert.equal(dbg.getTotem() === null, true);
  for (let k = 1; k <= 20; k++) rafQueue[rafQueue.length - 1](6000 + k * 40);
  assert.equal(dbg.getTotem() === null, true, 'totem must not respawn once lit >= 8');
  assert.equal(countTotemsInScene(), 0, 'scene must have 0 totems at 8/8');
});

test('magnetized uphill stars never stall above player head and Controls HUD panel toggles cleanly', () => {
  const { dbg, doc, rafQueue } = loadGameHarness({ hash: '#test' });

  // Place a fallen star 2.4 units ABOVE the player (simulating uphill spawn while player stepped downhill)
  const star = dbg.Models.makeStarPickup();
  star.position.set(dbg.P.x + 1.2, dbg.P.y + 3.2, dbg.P.z);
  star.userData = { kind: 'star', baseY: dbg.P.y + 3.2, bouncing: false, vx: 0, vy: 0, vz: 0, bounces: 0, age: 1 };
  dbg.scene.add(star);
  dbg.pickups.push(star);

  const starsBefore = Number(doc.getElementById('starCount').textContent);
  for (let k = 1; k <= 30; k++) rafQueue[rafQueue.length - 1](1000 + k * 30);
  assert.equal(dbg.pickups.includes(star), false, 'uphill magnetized star must zip cleanly into player and collect (never stall overhead)');
  assert.ok(Number(doc.getElementById('starCount').textContent) >= starsBefore + 1, 'star count should increment');

  // Toggle Controls reminder panel via button click
  const cBtn = doc.getElementById('controlsBtn');
  const panel = doc.getElementById('controlsPanel');
  assert.equal(panel.classList.contains('open'), false, 'controlsPanel starts closed');
  cBtn.click();
  assert.equal(panel.classList.contains('open'), true, 'clicking Controls button opens controlsPanel');
  cBtn.click();
  assert.equal(panel.classList.contains('open'), false, 'clicking Controls button again closes controlsPanel');
});

test('melee combos, player health/respawn, and mortal fighting companions work end-to-end', () => {
  const { dbg, doc, rafQueue } = loadGameHarness({ hash: '#test' });

  // 1. Player starts at 12 half-hearts (6 full hearts); Gloomblobs start at 3 HP
  assert.equal(dbg.P.hp, 12, 'player starts with 12 half-hearts (6 hearts)');
  dbg.spawnGloom();
  const g = dbg.glooms[0];
  assert.equal(g.hp, 3, 'gloomblobs should have 3 HP for combo combat');
  g.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 2.1);
  dbg.P.facing = 0;

  // Melee combo hit reduces gloom HP
  assert.equal(typeof dbg.meleeAttack, 'function', 'debug handle should expose meleeAttack');
  dbg.meleeAttack();
  assert.equal(g.hp, 2, 'first melee hit deals 1 dmg to gloomblob');

  // 2. Companions actively defend player (attack gloom, NEVER dig random stars) and can take damage & die
  dbg.spawnCocoon();
  const cc = dbg.cocoons[0];
  cc.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 2.0);
  dbg.P.facing = 0;
  for (let k = 0; k < 10; k++) rafQueue[rafQueue.length - 1](1050 + k * 40);
  dbg.meleeAttack(); // pop cocoon via melee!
  assert.ok(dbg.followers.length >= 1, 'melee attack pops cocoon and adds companion');
  const ally = dbg.followers[0];
  assert.ok(ally.stats && ally.hp === ally.maxHp && ally.maxHp >= 3 && ally.maxHp <= 7,
    `companion starts at full species-balanced HP (3-7), got ${ally.hp}/${ally.maxHp}`);
  assert.equal(ally.findT, undefined, 'companions must NOT have random star-digging findT timer');
  assert.ok(typeof ally.displayName === 'string' && ally.displayName.includes(' the '), `companion should have unique individual displayName, got ${ally.displayName}`);

  // Position ally right next to gloom -> ally damages gloom
  g.mesh.position.set(dbg.P.x + 2.0, dbg.P.y, dbg.P.z + 2.0);
  ally.mesh.position.set(dbg.P.x + 1.5, dbg.P.y, dbg.P.z + 2.0);
  ally.atkCooldown = 0;
  const gHpBefore = g.hp;
  for (let k = 0; k < 15; k++) rafQueue[rafQueue.length - 1](1600 + k * 40);
  assert.ok(g.hp < gHpBefore || !dbg.glooms.includes(g), 'fighting companion should damage nearby gloom');

  // Companion takes mitigated damage and dies at 0 HP, updating Friends count
  assert.equal(typeof dbg.damageCompanion, 'function', 'debug handle should expose damageCompanion');
  dbg.damageCompanion(ally, ally.maxHp * 3);
  assert.equal(dbg.followers.includes(ally), false, 'companion at 0 HP must die and leave parade');
  assert.equal(Number(doc.getElementById('friendCount').textContent), dbg.followers.length);

  // 3. Player damage -> death at 0 HP -> respawn with full 12 HP & surviving friends regrouped
  dbg.spawnCocoon();
  dbg.cocoons[dbg.cocoons.length - 1].mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 1.8);
  dbg.P.facing = 0;
  for (let k = 0; k < 12; k++) rafQueue[rafQueue.length - 1](2400 + k * 40);
  dbg.meleeAttack();
  assert.ok(dbg.followers.length >= 1, 'have a surviving friend before death');
  dbg.followers[0].mesh.position.set(dbg.P.x + 40, dbg.P.y, dbg.P.z + 40);

  dbg.damagePlayer(12, 'test');
  assert.equal(dbg.P.dead, true, 'reaching 0 HP triggers dead state');
  assert.equal(doc.getElementById('deathOverlay').classList.contains('show'), true, 'death overlay appears');
  // Advance past 2.0s respawn timer
  for (let k = 0; k < 60; k++) rafQueue[rafQueue.length - 1](3000 + k * 45);
  assert.equal(dbg.P.dead, false, 'player should respawn after 2.0s');
  assert.equal(dbg.P.hp, 12, 'respawn restores full 12 HP');
  const distFriend = Math.hypot(dbg.followers[0].mesh.position.x - dbg.P.x, dbg.followers[0].mesh.position.z - dbg.P.z);
  assert.ok(distFriend < 8, `surviving friend must rejoin player on respawn, dist=${distFriend}`);
});

test('3-step Star-Shot sequence and Melee<->Shot hybrid combos fire distinct projectiles and pierce/explode', () => {
  const { dbg, rafQueue } = loadGameHarness({ hash: '#test' });
  dbg.P.onGround = true;
  dbg.P.facing = 0;
  let now = 5000;
  const tick = (n, step = 40) => {
    for (let k = 0; k < n; k++) {
      now += step;
      rafQueue[rafQueue.length - 1](now);
    }
  };
  const clearBolts = () => {
    while (dbg.bolts.length) {
      const b = dbg.bolts.pop();
      dbg.scene.remove(b.mesh);
    }
  };

  // 1. F -> F -> F sequential Star-Shot combo: 1 bolt -> 2 twin bolts -> 1 exploding Star-Orb
  clearBolts();
  assert.equal(dbg.shoot(), 1);
  assert.equal(dbg.bolts.length, 1, 'F step 1 spawns 1 star bolt');
  tick(8, 35); // past 0.22s cooldown, well inside 0.80s chain window
  clearBolts();
  assert.equal(dbg.shoot(), 2);
  assert.equal(dbg.bolts.length, 2, 'F -> F step 2 spawns 2 Twin Starlight Bolts');
  tick(8, 35);
  clearBolts();
  assert.equal(dbg.shoot(), 3);
  assert.equal(dbg.bolts.length, 1, 'F -> F -> F step 3 spawns 1 Grand Star-Orb');
  assert.ok(dbg.bolts[0].explodeRadius >= 3.0 && dbg.bolts[0].dmg === 2, 'Grand Star-Orb deals 2 heavy AoE dmg');

  // 2. Click -> F => 3-Bolt Star-Fan Scatter
  tick(14, 35);
  clearBolts();
  dbg.P.meleeT = 0; dbg.P.meleeStep = 0; dbg.P.comboWindowT = 0;
  dbg.meleeAttack();
  assert.equal(dbg.shoot(), 'fan');
  assert.equal(dbg.bolts.length, 3, 'Click -> F spawns 3-bolt Star-Fan Scatter');

  // 3. Click -> Click -> F => Piercing Comet Lance (pierces straight through two lined-up glooms!)
  tick(12, 35);
  clearBolts();
  dbg.P.meleeT = 0; dbg.P.meleeStep = 0; dbg.P.comboWindowT = 0;
  dbg.meleeAttack();
  dbg.P.meleeT = 0;
  dbg.meleeAttack();
  assert.equal(dbg.shoot(), 'comet');
  assert.equal(dbg.bolts.length, 1);
  assert.equal(dbg.bolts[0].pierce, true, 'Piercing Comet must have pierce=true');
  assert.equal(dbg.bolts[0].dmg, 2, 'Piercing Comet deals 2 heavy dmg');

  // 4. Click x3 -> F => 6-Bolt 360° Constellation Nova
  tick(14, 35);
  clearBolts();
  dbg.P.meleeT = 0; dbg.P.meleeStep = 2; dbg.P.comboWindowT = 0.5;
  dbg.meleeAttack(); // Hit 3 Spin
  assert.equal(dbg.shoot(), 'nova');
  assert.equal(dbg.bolts.length, 6, 'Click x3 -> F spawns 6-bolt 360° Constellation Nova');
});

test('pooled sand & snow footprints use zero runtime scene.add, persist on dry ground, and wash away under shoreline waves', () => {
  const { dbg, sandbox, scene, rafQueue } = loadGameHarness({ hash: '#test' });
  let waveY = -0.2;
  sandbox.Shaders.waterHeightAt = () => waveY;
  sandbox.heightAt = (x) => (x < 0 ? 0.12 : 2.5);

  assert.ok(dbg.footprintPool && dbg.footprintPool.capacity === 240, 'footprint pool should pre-allocate 240 slots');
  assert.equal(typeof dbg.stampFootprint, 'function');

  const addsBefore = scene.addCalls;
  // Stamp 1 shoreline wet-sand print (x=-5, y=0.12), 1 high dry-sand print (x=5, y=2.5), and 1 snow print (x=10, y=2.5)
  assert.equal(dbg.stampFootprint(-5, 0.12, 0, 0.4, 'sand', -1, 1.0), true);
  assert.equal(dbg.stampFootprint(5, 2.5, 0, 0.4, 'sand', 1, 1.0), true);
  assert.equal(dbg.stampFootprint(10, 2.5, 0, 0.4, 'snow', -1, 1.0), true);
  assert.equal(dbg.stampFootprint(12, 2.5, 0, 0.4, 'grass', 1, 1.0), false, 'grass should not stamp footprints');
  assert.equal(scene.addCalls, addsBefore, 'stampFootprint must NEVER call scene.add() at runtime');

  const activeSlots = () => dbg.footprintPool.slots.filter(s => s.active);
  assert.equal(activeSlots().length, 3, 'should have 3 active footprints');

  // With tide low (waveY = -0.2 < 0.12 - 0.14), all 3 prints stay intact after 0.5s
  let now = 2000;
  for (let i = 0; i < 12; i++) {
    now += 40;
    rafQueue[rafQueue.length - 1](now);
  }
  assert.equal(activeSlots().length, 3, 'all 3 footprints should persist when wave stays below shoreline print');

  // Shoreline wave rolls in (waveY = 0.25 >= 0.12 - 0.14) -> washes away the shoreline sand print cleanly!
  waveY = 0.25;
  for (let i = 0; i < 25; i++) {
    now += 40;
    rafQueue[rafQueue.length - 1](now);
  }
  const remaining = activeSlots();
  assert.equal(remaining.length, 2, 'shoreline wave must wash away the low sand footprint');
  assert.ok(remaining.every(s => s.x > 0), 'only high dry-sand and snow footprints should remain after wave washes shoreline');
});

test('updateGrassTramplers feeds nearby companions, wild critters, and gloomblobs into uTramplers', () => {
  const { dbg, sandbox, rafQueue } = loadGameHarness({ hash: '#test' });
  dbg.spawnGloom();
  const g = dbg.glooms[0];
  g.mesh.position.set(dbg.P.x + 3.5, dbg.P.y, dbg.P.z + 2.0);

  dbg.spawnCocoon();
  const cc = dbg.cocoons[0];
  cc.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 2.0);
  dbg.P.facing = 0;
  dbg.meleeAttack(); // pop cocoon -> spawns a follower
  assert.ok(dbg.followers.length >= 1);
  const f = dbg.followers[0];
  f.mesh.position.set(dbg.P.x - 2.5, dbg.P.y, dbg.P.z + 1.5);

  // Step past melee hit-stop freeze frame onto a full simulation frame
  rafQueue[rafQueue.length - 1](1500);
  rafQueue[rafQueue.length - 1](1540);
  const active = sandbox.Shaders.tramplers.filter(t => t.w > 0);
  assert.ok(active.length >= 2, `Expected follower + gloomblob + wish/wild in uTramplers, got ${active.length}`);
  assert.ok(
    active.some(t => Math.hypot(t.x - g.mesh.position.x, t.z - g.mesh.position.z) < 0.8 && t.w >= 1.5),
    'Nearby Gloomblob must appear in grass trampler uniforms'
  );
  assert.ok(
    active.some(t => Math.hypot(t.x - f.mesh.position.x, t.z - f.mesh.position.z) < 0.8 && t.w >= 0.9),
    'Nearby companion must appear in grass trampler uniforms'
  );
  // Unused trailing slots must be cleared to w = 0
  for (let i = active.length; i < 16; i++) {
    assert.equal(sandbox.Shaders.tramplers[i].w, 0, `Unused trampler slot ${i} must have radius 0`);
  }
});

test('Region transitions, Tidecaller Pearl relic claiming, Secret Star Shrines, and guided Sunken City Totem work end-to-end', () => {
  const { dbg, sandbox, doc, rafQueue } = loadGameHarness({ hash: '#test' });
  let now = 2000;
  const tick = (n = 2, step = 40) => {
    for (let i = 0; i < n; i++) {
      now += step;
      rafQueue[rafQueue.length - 1](now);
    }
  };

  // 1. Starts in Star Sanctuary with 16 aquatic critters patrolling the Sunken City reef
  assert.equal(dbg.getCurrentRegion().id, 'sanctuary');
  assert.equal(dbg.aquaticCritters.length, 16, 'Should spawn 16 aquatic critters in the Sunken Underwater City');

  // 2. Stepping into Whispering Deep Forest triggers region banner & updates HUD pill
  dbg.P.x = 62;
  dbg.P.z = -78;
  tick(2);
  assert.equal(dbg.getCurrentRegion().id, 'whisperingForest');
  assert.equal(doc.getElementById('regionPill').textContent, 'Whispering Deep Forest');
  assert.equal(doc.getElementById('regionBanner').classList.contains('show'), true);

  // 3. Walking up to Tidecaller's Pearl pedestal claims breathing relic & shows aqua HUD badge
  const ro = dbg.worldLandmarks.relicObj;
  assert.equal(dbg.P.hasBreathRelic, false);
  dbg.P.x = ro.x;
  dbg.P.y = ro.y;
  dbg.P.z = ro.z;
  tick(2);
  assert.equal(dbg.P.hasBreathRelic, true, 'Approaching Tidecaller Pearl pedestal must claim breathing relic');
  assert.equal(ro.claimed, true);
  assert.equal(ro.pearlMesh.visible, false);
  assert.equal(doc.getElementById('relicBadge').style.display, 'inline-block');

  // 4. Discovering an off-path Secret Star Shrine grants +5 Stars, full HP, and increments Secrets 1/6
  const sec0 = dbg.worldLandmarks.secretObjs[0];
  dbg.P.hp = 6;
  const starsBefore = Number(doc.getElementById('starCount').textContent);
  dbg.P.x = sec0.x;
  dbg.P.y = sec0.y;
  dbg.P.z = sec0.z;
  tick(2);
  assert.equal(sec0.discovered, true, 'Approaching Secret Star Shrine must mark it discovered');
  assert.equal(dbg.getSecretsFound(), 1);
  assert.equal(Number(doc.getElementById('secretCount').textContent), 1);
  assert.equal(dbg.P.hp, dbg.P.maxHp, 'Secret Shrine discovery must restore full hearts');
  assert.ok(Number(doc.getElementById('starCount').textContent) >= starsBefore + 5, 'Secret Shrine must award +5 stars');

  // 5. Guided 8-Totem route places Totem #5 underwater at the Sunken Star-Temple!
  for (let k = 0; k < 4; k++) {
    dbg.lightTotem();
    tick(10, 40);
  }
  const t5 = dbg.getTotem();
  assert.ok(t5 && t5.underwater === true, 'Totem #5 must spawn underwater in the Sunken Underwater City');
  assert.equal(t5.x, dbg.Regions.TOTEM_ROUTE[4].x);
  assert.equal(t5.z, dbg.Regions.TOTEM_ROUTE[4].z);
});

test('hearts are only absorbed when needed, heal injured companions when player is full, companions leave sand/snow footprints, and region switches music', () => {
  const { dbg, sandbox, rafQueue } = loadGameHarness({ hash: '#test' });
  let now = 3000;
  const tick = (n = 2, step = 40) => {
    for (let i = 0; i < n; i++) {
      now += step;
      rafQueue[rafQueue.length - 1](now);
    }
  };

  // 1. Spawn a heart right on top of full-health Starkeeper -> must NOT be wasted!
  dbg.P.hp = dbg.P.maxHp;
  const heart = dbg.Models.makeHeartPickup();
  heart.position.set(dbg.P.x, dbg.P.y + 0.8, dbg.P.z);
  heart.userData = { kind: 'heart', baseY: dbg.P.y + 0.8, bouncing: false, vx: 0, vy: 0, vz: 0, bounces: 0, age: 1 };
  dbg.scene.add(heart);
  dbg.pickups.push(heart);
  tick(4);
  assert.equal(dbg.pickups.includes(heart), true, 'Full-health Starkeeper must NOT absorb/waste a dropped heart');

  // 2. Spawn an injured companion -> companion attracts & absorbs the spare heart to heal!
  dbg.spawnCocoon();
  const cc = dbg.cocoons[dbg.cocoons.length - 1];
  cc.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 2.0);
  dbg.P.facing = 0;
  dbg.meleeAttack();
  tick(3);
  assert.ok(dbg.followers.length >= 1, 'Should have a companion');
  const ally = dbg.followers[0];
  ally.hp = 1; // injured!
  ally.mesh.position.set(dbg.P.x + 0.5, dbg.P.y, dbg.P.z);
  heart.position.set(dbg.P.x + 0.5, dbg.P.y + 0.6, dbg.P.z);
  tick(3);
  assert.equal(dbg.pickups.includes(heart), false, 'Injured companion should absorb spare heart when Starkeeper is full');
  assert.equal(ally.hp, Math.min(ally.maxHp, 3), 'Absorbing spare heart should restore +2 companion health (clamped to maxHp)');

  // 3. When Starkeeper IS hurt, Starkeeper absorbs a heart and heals!
  dbg.P.hp = 8;
  const heart2 = dbg.Models.makeHeartPickup();
  heart2.position.set(dbg.P.x, dbg.P.y + 0.8, dbg.P.z);
  heart2.userData = { kind: 'heart', baseY: dbg.P.y + 0.8, bouncing: false, vx: 0, vy: 0, vz: 0, bounces: 0, age: 1 };
  dbg.scene.add(heart2);
  dbg.pickups.push(heart2);
  tick(3);
  assert.equal(dbg.pickups.includes(heart2), false, 'Hurt Starkeeper should absorb heart');
  assert.equal(dbg.P.hp, 10, 'Heart should heal Starkeeper by +2 half-hearts');

  // 3b. Heart pickups cap at <= 12 active and expire cleanly after 32s so long sessions never carpet the world!
  dbg.P.hp = dbg.P.maxHp;
  ally.hp = ally.maxHp;
  for (let hi = 0; hi < 18; hi++) {
    sandbox.spawnHeartDrop(dbg.P.x + 8 + hi * 0.2, dbg.P.y, dbg.P.z + 8);
  }
  const activeHearts = dbg.pickups.filter(p => p.userData && p.userData.kind === 'heart');
  assert.ok(activeHearts.length <= 12, `Active heart drops must be capped at <= 12, got ${activeHearts.length}`);
  activeHearts[0].userData.age = 33;
  const expiredHeart = activeHearts[0];
  tick(2);
  assert.equal(dbg.pickups.includes(expiredHeart), false, 'Heart pickup older than 32s must expire cleanly');

  // 4. Companions walking on snow/sand leave crisp distance-synced footprints (all grounded body plans!)
  sandbox.surfaceAt = () => 'snow';
  const printsBefore = dbg.footprintPool.slots.filter(s => s.active).length;
  ally.mesh.position.set(dbg.P.x + 4.5, dbg.P.y, dbg.P.z + 4.5);
  tick(14, 35);
  const printsAfter = dbg.footprintPool.slots.filter(s => s.active).length;
  assert.ok(printsAfter > printsBefore, `Moving companion on snow must stamp footprints (${printsBefore} -> ${printsAfter})`);

  // 5. Crossing into Canyon Oasis switches Sound active region soundtrack to canyonOasis!
  dbg.P.x = -86;
  dbg.P.z = -14;
  tick(2);
  assert.equal(dbg.Sound.getRegion(), 'canyonOasis', 'Entering Canyon Oasis must switch generative soundtrack region');

  // 6. Firing a Star Bolt while facing AWAY from camera aim immediately turns Starkeeper toward shot AND spawns bolt at Staff-Lantern tip ahead!
  dbg.Physics.clearLockOn();
  dbg.P.meleeT = 0;
  dbg.P.comboWindowT = 0;
  dbg.P.x = 0;
  dbg.P.z = 0;
  dbg.P.y = dbg.heightAt(0, 0);
  dbg.P.facing = Math.PI; // facing -Z (away from camera look direction)
  dbg.player.rotation.y = Math.PI;
  dbg.camera.position.set(0, dbg.P.y + 3, -10);
  dbg.camera.lookAt(0, dbg.P.y + 2, 20);
  const boltsBefore = dbg.bolts.length;
  const shotRes = dbg.shoot();
  assert.ok(shotRes, 'shoot() should fire a Star Bolt');
  assert.equal(dbg.bolts.length, boltsBefore + 1, 'shoot() must spawn a bolt');
  const firedBolt = dbg.bolts[dbg.bolts.length - 1];
  assert.ok(Math.abs(dbg.Physics.wrapAngle(dbg.P.facing - 0)) < 0.25, `shoot() must turn P.facing toward +Z aim, got ${dbg.P.facing}`);
  assert.ok(Math.abs(dbg.Physics.wrapAngle(dbg.player.rotation.y - 0)) < 0.25, `shoot() must orient player mesh toward +Z aim on frame 0, got ${dbg.player.rotation.y}`);
  assert.ok(firedBolt.mesh.position.z > dbg.P.z + 0.85, `Star Bolt must launch ahead of Starkeeper from Staff-Lantern tip, got dz=${(firedBolt.mesh.position.z - dbg.P.z).toFixed(2)}`);
  assert.ok(firedBolt.mesh.position.y > dbg.P.y + 1.32, `Star Bolt must launch at raised Staff-Lantern tip height, got dy=${(firedBolt.mesh.position.y - dbg.P.y).toFixed(2)}`);

  // 7. CharacterRig attaches cleanly on debugHandle & live GLB staff-tip world pos drives shoot() muzzle!
  assert.ok(dbg.CharacterRig && typeof dbg.CharacterRig.attachToPlayer === 'function', 'debugHandle must expose CharacterRig');
  assert.ok(dbg.player.userData.glbRig, 'player must have glbRig controller attached');
  let rigUpdated = false;
  let smileCalled = false;
  const origGlbRig = dbg.player.userData.glbRig;
  dbg.player.userData.glbRig = {
    ready: true,
    update() { rigUpdated = true; },
    getStaffTipWorldPos(out) { return out.set(dbg.P.x + 0.45, dbg.P.y + 1.92, dbg.P.z + 1.55); },
    triggerEmote(name) { if (name === 'smile') smileCalled = true; },
  };
  tick(6, 50);
  assert.equal(rigUpdated, true, 'physics.js must delegate player animation to ready glbRig.update()');
  const shot2 = dbg.shoot();
  assert.ok(shot2, 'shoot() should fire with ready glbRig');
  const liveBolt = dbg.bolts[dbg.bolts.length - 1];
  assert.ok(Math.abs(liveBolt.mesh.position.y - (dbg.P.y + 1.92)) < 0.15, `GLB ready shoot() must launch bolt from live staff tip y=${dbg.P.y + 1.92}, got ${liveBolt.mesh.position.y}`);
  assert.ok(Math.abs(liveBolt.mesh.position.z - (dbg.P.z + 1.55)) < 0.25, `GLB ready shoot() must launch bolt from live staff tip z=${dbg.P.z + 1.55}, got ${liveBolt.mesh.position.z}`);
  dbg.lightTotem();
  assert.equal(smileCalled, true, 'Lighting a Star Totem must trigger Starkeeper smile facial emote');
  dbg.player.userData.glbRig = origGlbRig;
});

test('Companions actively defend themselves when attacked even far away from Starkeeper (not just when Starkeeper is near)', () => {
  const { dbg, rafQueue } = loadGameHarness({ hash: '#test' });
  let now = 2000;
  const tick = (n = 1, step = 40) => {
    for (let i = 0; i < n; i++) {
      now += step;
      rafQueue[rafQueue.length - 1](now);
    }
  };

  // Start cleanly with 1 companion far away (24u) from Starkeeper (outside the 14u player-escort radius!)
  dbg.glooms.length = 0;
  dbg.cocoons.length = 0;
  dbg.followers.length = 0;
  dbg.P.x = 0;
  dbg.P.z = 0;
  dbg.P.y = dbg.heightAt(0, 0);

  // Free a companion via cocoon crack
  dbg.spawnCocoon();
  const cc = dbg.cocoons[0];
  cc.mesh.position.set(0, dbg.P.y, 1.8);
  dbg.P.facing = 0;
  dbg.meleeAttack();
  tick(3);
  assert.ok(dbg.followers.length >= 1, 'Should have freed a companion');

  const ally = dbg.followers[0];
  ally.mesh.position.set(24, dbg.heightAt(24, 0), 0);
  ally.atkCooldown = 0;
  ally.hp = 3;

  // Spawn a Gloomblob directly attacking this distant companion (24u from Starkeeper!)
  dbg.spawnGloom();
  const g = dbg.glooms[0];
  g.mesh.position.set(25.4, dbg.heightAt(25.4, 0), 0);
  g.hp = 3;
  g.state = 'lunge';
  g.targetAlly = ally;
  const gloomHpBefore = g.hp;

  // Gloom lands a hit on the companion -> companion MUST record attacker and immediately fight back!
  dbg.damageCompanion(ally, 1, -3, 0, g);
  assert.equal(ally.attacker, g, 'damageCompanion must record attacking gloom for self-defense');
  tick(18, 40);
  assert.ok(g.hp < gloomHpBefore || !dbg.glooms.includes(g),
    `Attacked companion 24u away from Starkeeper must fight back and damage gloom (hp ${gloomHpBefore} -> ${g.hp})`);
});

test('Live pooled 3D staff ribbon trail activates per combo step with zero runtime scene.add allocations', () => {
  const { dbg } = loadGameHarness({ hash: '#test' });
  dbg.glooms.length = 0;
  dbg.cocoons.length = 0;

  assert.ok(dbg.staffTrail, 'window.__GAME_DEBUG__.staffTrail must be exposed');
  assert.equal(dbg.staffTrail.active, false);

  const addsBefore = dbg.scene.addCalls;
  assert.equal(dbg.meleeAttack(), true);
  assert.equal(dbg.staffTrail.active, true, 'Hit 1 must activate live pooled staff ribbon trail');
  assert.equal(dbg.staffTrail.colorHex, 0x5ef8e8, 'Hit 1 trail must use crisp celestial sea-teal');
  assert.equal(dbg.scene.addCalls, addsBefore, 'Triggering staff trail must perform ZERO scene.add calls');

  for (let i = 0; i < 5; i++) dbg.updateCombatVfx(0.025);
  assert.ok(dbg.staffTrail.sampleCount >= 4, `Staff trail must accumulate live samples, got ${dbg.staffTrail.sampleCount}`);

  // Chain into Hit 2 (cyan) -> Hit 3 Spin360 (blazing gold + wide 0.75 star-disc!)
  dbg.P.meleeT = 0;
  dbg.P.comboWindowT = 0.4;
  assert.equal(dbg.meleeAttack(), true);
  assert.equal(dbg.staffTrail.colorHex, 0x92f6ff, 'Hit 2 trail must use bright sky-cyan');
  for (let i = 0; i < 4; i++) dbg.updateCombatVfx(0.025);

  dbg.P.meleeT = 0;
  dbg.P.comboWindowT = 0.4;
  assert.equal(dbg.meleeAttack(), true);
  assert.equal(dbg.staffTrail.colorHex, 0xffd242, 'Hit 3 Spin360 trail must use blazing solar gold');
  assert.ok(dbg.staffTrail.widthFrac >= 0.70, `Hit 3 Spin360 must widen trail for massive helicopter star-disc, got ${dbg.staffTrail.widthFrac}`);
  for (let i = 0; i < 4; i++) dbg.updateCombatVfx(0.025);
  assert.equal(dbg.scene.addCalls, addsBefore, 'Updating staff trail across combo must perform ZERO scene.add calls');

  // After combo ends and fades out, trail hides cleanly
  dbg.P.meleeT = 0;
  dbg.P.meleeStep = 0;
  for (let i = 0; i < 15; i++) dbg.updateCombatVfx(0.03);
  assert.equal(dbg.staffTrail.active, false, 'Staff trail must deactivate cleanly after fade');
});

test('Animals module wiring: Timber Wolf, Starlight Manta, 16-reef ecosystem, rare 6-HP companions, and celebrations', () => {
  const { dbg, rafQueue } = loadGameHarness({ hash: '#test' });

  // 1. Debug handle exposes Animals, LAND, AQUA, and WATER_Y
  assert.ok(dbg.Animals && typeof dbg.Animals.updateWild === 'function', 'window.__GAME_DEBUG__.Animals must be wired');
  assert.ok(Array.isArray(dbg.LAND), 'debugHandle must expose LAND');
  assert.ok(Array.isArray(dbg.AQUA), 'debugHandle must expose AQUA');
  assert.equal(typeof dbg.WATER_Y, 'number', 'debugHandle must expose WATER_Y');

  // 2. Rosters include Timber Wolf (replacing Woodland Cub) and Starlight Manta
  assert.ok(dbg.LAND.some(s => s.name === 'Timber Wolf' && s.archetype === 'wolf'), 'LAND must contain Timber Wolf');
  assert.equal(dbg.LAND.some(s => s.name === 'Woodland Cub'), false, 'LAND must replace Woodland Cub with Timber Wolf');
  assert.ok(dbg.AQUA.some(s => s.name === 'Starlight Manta' && s.archetype === 'manta'), 'AQUA must contain Starlight Manta');

  // 3. Wish and 16 aquatic reef critters attach AnimalRig + physics states
  assert.ok(dbg.wish.mesh.userData.animalRig, 'Wish must attach an animalRig');
  assert.ok(dbg.wish.phys, 'Wish must carry a physics state');
  assert.equal(dbg.aquaticCritters.length, 16, 'Sunken City must spawn 16 aquatic critters');
  assert.ok(dbg.aquaticCritters.some(c => c.species && c.species.name === 'Starlight Manta'), 'Aquatic reef must include Starlight Manta');
  assert.ok(dbg.aquaticCritters.some(c => c.species && c.species.name === 'Moon Jelly'), 'Aquatic reef must include Moon Jelly');
  assert.ok(dbg.aquaticCritters.every(c => c.phys && c.mesh.userData.animalRig), 'Every aquatic critter must have phys and animalRig');

  // 4. Wild spawn attaches animalRig + phys
  dbg.spawnWild();
  assert.ok(dbg.wild.length >= 1, 'spawnWild must add wild critter');
  assert.ok(dbg.wild[0].phys && dbg.wild[0].mesh.userData.animalRig, 'Wild critter must attach animalRig and phys');

  // 5. Rare companion gets boosted maxHp (>= 6), hurt one-shot on damageCompanion, and celebrates on lightTotem + Secret Shrine
  const rareSp = dbg.Animals.RARE_SPECIES[0];
  dbg.addFollower(dbg.P.x + 1.5, dbg.P.y, dbg.P.z + 1.5, null, rareSp);
  const rareAlly = dbg.followers[dbg.followers.length - 1];
  assert.ok(rareAlly.maxHp >= 6 && rareAlly.maxHp <= 8, `Rare companion must have boosted maxHp (6-8), got ${rareAlly.maxHp}`);
  assert.equal(rareAlly.hp, rareAlly.maxHp, 'Rare companion must start at full HP');
  assert.ok(rareAlly.stats && rareAlly.stats.def >= 0.24, 'Rare Celestial Stag must carry rolled top-tier vanguard stats');
  assert.ok(rareAlly.phys && rareAlly.mesh.userData.animalRig, 'Companion must attach animalRig and phys');

  const hitOneShots = [];
  const origTrigger = rareAlly.mesh.userData.animalRig.triggerOneShot;
  rareAlly.mesh.userData.animalRig.triggerOneShot = (name, dur) => {
    hitOneShots.push({ name, dur });
    return origTrigger(name, dur);
  };
  dbg.damageCompanion(rareAlly, 1);
  assert.ok(hitOneShots.some(c => c.name === 'hit'), 'damageCompanion must trigger animalRig hit one-shot');

  // Reset grounded state then lightTotem -> celebrates with positive hop vy > 3.5!
  rareAlly.phys.vy = 0;
  rareAlly.phys.onGround = true;
  dbg.lightTotem();
  assert.ok(rareAlly.phys.vy > 3.5, `lightTotem must celebrate followers with positive hop vy > 3.5, got ${rareAlly.phys.vy}`);

  // Secret Star Shrine discovery also triggers celebration hop
  rareAlly.phys.vy = 0;
  rareAlly.phys.onGround = true;
  const sec0 = dbg.worldLandmarks.secretObjs[0];
  dbg.P.x = sec0.x;
  dbg.P.y = sec0.y;
  dbg.P.z = sec0.z;
  rafQueue[rafQueue.length - 1](2100);
  assert.equal(sec0.discovered, true);
  assert.ok(rareAlly.phys.vy > 3.5, `Secret Shrine discovery must celebrate followers with positive hop vy > 3.5, got ${rareAlly.phys.vy}`);
});

test('Enemies module wiring: threat escalation, pooled telegraph rings, proportional grass tramplers, and lazy Sunken City Stalkers', () => {
  const { dbg, sandbox, scene, rafQueue } = loadGameHarness({ hash: '#test' });

  // 1. Debug handle wires Enemies & initUnderwaterEnemies, and pre-allocates 4 TelegraphRings at startup
  assert.ok(dbg.Enemies && typeof dbg.Enemies.updateGlooms === 'function', 'window.__GAME_DEBUG__.Enemies must be wired');
  assert.equal(typeof dbg.initUnderwaterEnemies, 'function', 'debugHandle must expose initUnderwaterEnemies');
  const telegraphRings = scene.children.filter(c => c.name === 'TelegraphRing');
  assert.equal(telegraphRings.length, 4, 'startup must pre-allocate 4 pooled TelegraphRings on scene');
  assert.ok(telegraphRings.every(r => r.visible === false), 'pooled TelegraphRings must start hidden');

  // 2. Solo Sanctuary spawnGloom() stays Tier 1 Classic Gloomblob (3 HP) and zero Stalkers exist at startup
  dbg.glooms.length = 0;
  const soloClassic = dbg.spawnGloom();
  assert.ok(soloClassic, 'spawnGloom() should return spawned enemy state');
  assert.equal(soloClassic.tierKey, 'classic', 'solo Sanctuary spawnGloom() must spawn classic Gloomblob');
  assert.equal(soloClassic.hp, 3);
  assert.equal(soloClassic.maxHp, 3);
  assert.equal(dbg.glooms.filter(g => g.underwater).length, 0, 'underwater Stalkers must NOT clutter dbg.glooms at Sanctuary startup');

  // 3. With 6 followers & outer coordinates, all escalating Shadow Beast tiers spawn cleanly
  dbg.glooms.length = 0;
  for (let i = 0; i < 6; i++) {
    dbg.addFollower(dbg.P.x + 1 + i * 0.4, dbg.P.y, dbg.P.z + 1, null, dbg.LAND[0]);
  }
  dbg.P.x = 70;
  dbg.P.z = -12;

  const behemoth = dbg.spawnGloom('behemoth');
  assert.ok(behemoth && behemoth.tierKey === 'behemoth', 'spawnGloom("behemoth") must spawn Eclipse Behemoth');
  assert.ok(behemoth.maxHp >= 15, `Behemoth with 6 followers must scale HP >= 15, got ${behemoth.maxHp}`);

  const knight = dbg.spawnGloom('knight');
  assert.ok(knight && knight.tierKey === 'knight' && knight.maxHp === 10, 'spawnGloom("knight") must spawn 10-HP Dread Knight');

  const imp = dbg.spawnGloom('imp');
  assert.ok(imp && imp.tierKey === 'imp' && imp.maxHp === 8, 'spawnGloom("imp") must spawn 8-HP Cinder Imp');

  const puglin = dbg.spawnGloom('puglin');
  assert.ok(puglin && puglin.tierKey === 'puglin' && puglin.maxHp === 5, 'spawnGloom("puglin") must spawn 5-HP Shadow Puglin');

  // 4. Pooled telegraph ring activates during Behemoth windup with ZERO runtime scene.addCalls
  behemoth.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 2.5);
  behemoth.state = 'windup';
  behemoth.stateT = 0.45;
  knight.mesh.position.set(dbg.P.x + 2.5, dbg.P.y, dbg.P.z + 2.0);
  knight.state = 'windup';
  knight.stateT = 0.35;
  imp.mesh.position.set(dbg.P.x - 2.5, dbg.P.y, dbg.P.z + 2.0);
  puglin.mesh.position.set(dbg.P.x + 2.0, dbg.P.y, dbg.P.z - 2.5);

  // Check proportional grass tramplers: Behemoth > Knight > Imp > Classic
  dbg.updateGrassTramplers();
  const activeTramplers = sandbox.Shaders.tramplers.filter(t => t.w > 0);
  const trFor = (enemy) => activeTramplers.find(
    t => Math.hypot(t.x - enemy.mesh.position.x, t.z - enemy.mesh.position.z) < 0.2
  );
  const behTr = trFor(behemoth);
  const kntTr = trFor(knight);
  const impTr = trFor(imp);
  assert.ok(behTr && kntTr && impTr, 'Shadow Beasts must register in grass tramplers');
  assert.ok(behTr.w > kntTr.w && kntTr.w > impTr.w, `Grass trampler radii must scale behemoth (${behTr.w}) > knight (${kntTr.w}) > imp (${impTr.w})`);

  // Settle ambient star/wild/cocoon pools in 4 warmup ticks, then verify windup telegraph rings do ZERO scene.addCalls
  for (let w = 0; w < 4; w++) rafQueue[rafQueue.length - 1](1320 + w * 40);
  behemoth.mesh.position.set(dbg.P.x, dbg.P.y, dbg.P.z + 2.5);
  behemoth.state = 'windup';
  behemoth.stateT = 0.45;
  knight.mesh.position.set(dbg.P.x + 2.5, dbg.P.y, dbg.P.z + 2.0);
  knight.state = 'windup';
  knight.stateT = 0.35;
  while (dbg.glooms.filter(g => !g.underwater).length < 6) {
    dbg.spawnGloom('classic');
  }
  const addsBeforeTick = scene.addCalls;
  rafQueue[rafQueue.length - 1](1500);
  assert.equal(scene.addCalls, addsBeforeTick, 'updateGlooms with winding-up Behemoth/Knight must perform ZERO scene.addCalls for telegraph rings');
  assert.equal(scene.children.filter(c => c.name === 'TelegraphRing').length, 4, 'TelegraphRing pool size must remain exactly 4');
  assert.ok(telegraphRings.some(r => r.visible === true), 'pooled TelegraphRing must become visible during Behemoth/Knight windup');

  // 5. Approaching Sunken City (P.z = 55) lazily spawns 2 underwater Abyssal Stalkers cleanly & idempotently
  dbg.glooms.length = 0;
  dbg.P.x = -14;
  dbg.P.z = 55;
  rafQueue[rafQueue.length - 1](1600);
  const stalkers = dbg.glooms.filter(g => g.underwater === true && g.tierKey === 'stalker');
  assert.equal(stalkers.length, 2, 'approaching Sunken City (P.z = 55) must lazily spawn 2 underwater Abyssal Stalkers');

  // Subsequent ticks and explicit debugHandle call must remain idempotent (still 2 stalkers)
  dbg.initUnderwaterEnemies();
  rafQueue[rafQueue.length - 1](1650);
  const stalkersAfter = dbg.glooms.filter(g => g.underwater === true && g.tierKey === 'stalker');
  assert.equal(stalkersAfter.length, 2, 'lazy Sunken City Stalker init must be idempotent');
});

test('Individualized companion stats, defense mitigation, tank aggro pull, aerial shockwave evasion, and under-the-hood UX', () => {
  const { dbg, doc, rafQueue } = loadGameHarness({ hash: '#test' });

  // 1. Wild spawn rolls individualized stats & befriending preserves them on the new follower
  dbg.wild.length = 0;
  dbg.spawnWild();
  assert.equal(dbg.wild.length, 1);
  const w = dbg.wild[0];
  assert.ok(w.stats && typeof w.stats.atk === 'number' && typeof w.stats.def === 'number', 'Wild animal must roll individualized stats');
  assert.ok(w.stats.spd >= dbg.Animals.CHASE_SPEED_MIN && w.stats.spd <= dbg.Animals.CHASE_SPEED_MAX,
    `Wild animal speed ${w.stats.spd} must remain within chase-friendly bounds`);

  const rolledStats = w.stats;
  w.mesh.position.set(dbg.P.x + 1.4, dbg.P.y, dbg.P.z);
  w.state = 'calmTrust';
  w.trustT = 2.18;
  rafQueue[rafQueue.length - 1](1200);
  const befriended = dbg.followers[dbg.followers.length - 1];
  assert.ok(befriended, 'Befriending wild animal must add follower');
  assert.equal(befriended.stats, rolledStats, 'Befriended companion must preserve exact rolled individual stats from wild');

  // Toast stays purely organic/story-driven with ZERO stat numbers or spreadsheets
  const toastText = doc.getElementById('toast').textContent || '';
  assert.equal(/\b(HP|ATK|DEF|SPD|DPS)\b/i.test(toastText), false, `Toast must keep stats purely under the hood: "${toastText}"`);

  // 2. Tank (Berry Beetle) mitigates damage & knockback much better than striker (Ember Drake)
  dbg.followers.length = 0;
  const beetleSp = dbg.LAND.find(s => s.name === 'Berry Beetle');
  const drakeSp = dbg.LAND.find(s => s.name === 'Ember Drake');
  const owlSp = dbg.LAND.find(s => s.name === 'Golden Owl');
  dbg.addFollower(dbg.P.x + 2.0, dbg.P.y, dbg.P.z, null, beetleSp);
  dbg.addFollower(dbg.P.x - 2.0, dbg.P.y, dbg.P.z, null, drakeSp);
  const beetle = dbg.followers[0];
  const drake = dbg.followers[1];

  const beetleHp0 = beetle.hp;
  const drakeHp0 = drake.hp;
  dbg.damageCompanion(beetle, 2, 10, 0);
  dbg.damageCompanion(drake, 2, 10, 0);
  const beetleLoss = beetleHp0 - beetle.hp;
  const drakeLoss = drakeHp0 - drake.hp;
  assert.ok(beetleLoss < drakeLoss - 0.4, `Berry Beetle tank loss (${beetleLoss}) must be far less than Ember Drake loss (${drakeLoss})`);
  assert.ok(beetle.kx < drake.kx * 0.7, `Berry Beetle tank knockback (${beetle.kx}) must be well below Ember Drake (${drake.kx})`);

  // 3. Tank front-line aggro pull: enemy prefers Berry Beetle over an equidistant Ember Drake
  dbg.glooms.length = 0;
  dbg.P.x = 0; dbg.P.z = -18; // keep Starkeeper out of close-range tie
  dbg.spawnGloom('classic');
  const g = dbg.glooms[0];
  g.mesh.position.set(0, dbg.heightAt(0, 0), 0);
  g.state = 'windup';
  g.stateT = 0.01;
  beetle.mesh.position.set(4.0, dbg.heightAt(4, 0), 0);
  drake.mesh.position.set(-3.6, dbg.heightAt(-3.6, 0), 0); // slightly closer than beetle, yet beetle's 1.65u aggroPull wins!
  rafQueue[rafQueue.length - 1](1400);
  assert.equal(g.targetAlly, beetle, 'Berry Beetle tank must draw enemy aggro ahead of nearby striker');

  // 4. Aerial companion soaring high naturally evades Eclipse Behemoth ground shockwave
  dbg.addFollower(0, dbg.heightAt(0, 0) + 2.0, 2.0, null, owlSp);
  const owl = dbg.followers[2];
  owl.hurtInvulnT = 0;
  beetle.hurtInvulnT = 0;
  const owlHpBefore = owl.hp;
  const beetleHpBefore = beetle.hp;

  dbg.glooms.length = 0;
  dbg.spawnGloom('behemoth');
  const beh = dbg.glooms[0];
  const by = dbg.heightAt(0, 0);
  beh.mesh.position.set(0, by, 0);
  beh.state = 'lunge';
  beh.stateT = 0.08;
  beh.attackDidHit = false;
  owl.mesh.position.set(0, by + 2.1, 2.0); // soaring 2.1u above Behemoth slam
  beetle.mesh.position.set(0, by, 2.0);    // grounded inside 4.8u slam
  rafQueue[rafQueue.length - 1](1440);
  assert.equal(owl.hp, owlHpBefore, 'High-hovering aerial Owl must evade ground Behemoth shockwave');
  assert.ok(beetle.hp < beetleHpBefore, 'Grounded tank inside Behemoth shockwave must take the hit');
});

test('Sub-Project 4 Env wiring: moonlit night -> sunlit day -> live cycle, zero steady-state scene.addCalls, Gerstner buoyancy, and Balanced quality', () => {
  const { dbg, rafQueue } = loadGameHarness({ hash: '#test', fullWorld: true });
  let now = 1000;
  const tick = (n = 1, step = 40) => {
    for (let i = 0; i < n; i++) {
      now += step;
      rafQueue[rafQueue.length - 1](now);
    }
  };

  // 1. Env is wired on window.__GAME_DEBUG__ and initialized by world.js
  assert.ok(dbg.Env && typeof dbg.Env.update === 'function', 'window.__GAME_DEBUG__.Env must be wired');
  assert.ok(dbg.Env.getSceneRig(), 'world.js must initialize Env scene rig on startup');
  assert.ok(dbg.Shaders && dbg.Shaders.uniforms && dbg.Shaders.uniforms.uClothMotion, 'real Shaders uniforms must be active');

  // Wrap Env.update without altering behavior to verify active regionId handoff from game.js -> world.js -> Env
  const origEnvUpdate = dbg.Env.update;
  const seenRegionIds = [];
  dbg.Env.update = (dt, t, ctx) => {
    if (ctx && ctx.regionId) seenRegionIds.push(ctx.regionId);
    return origEnvUpdate(dt, t, ctx);
  };

  // 2. At lit = 0 (Starlit Moonlit Night): moon overhead, nightFactor > 0.8, warm Staff-Lantern bright
  const cel0 = dbg.Env.getCelestialState();
  assert.ok(cel0.nightFactor > 0.8, `At lit=0 nightFactor must exceed 0.8, got ${cel0.nightFactor}`);
  assert.ok(cel0.moonDir.y > 0.4, `At lit=0 moonDir.y must exceed 0.4, got ${cel0.moonDir.y}`);
  tick(2, 40);
  assert.ok(dbg.Shaders.uniforms.uNightFactor.value > 0.8, 'Shaders uNightFactor must sync > 0.8 at night');
  assert.ok(dbg.player.userData.staffLight.intensity > 1.0, `Staff-Lantern must glow warmly at night, got ${dbg.player.userData.staffLight.intensity}`);

  // 3. Light all 8 totems (0/8 -> 8/8 Sunlit Day): zero daytime white square stars, gentle Staff-Lantern
  for (let i = 0; i < 8; i++) {
    dbg.lightTotem();
    tick(10, 40);
  }
  const celDay = dbg.Env.getCelestialState();
  assert.ok(celDay.nightFactor < 0.05, `At 8/8 sunlit day nightFactor must be < 0.05, got ${celDay.nightFactor}`);
  assert.equal(celDay.starAlpha, 0, 'At 8/8 sunlit day starAlpha must be strictly 0 (zero daytime stars)');
  assert.equal(dbg.Env.getSceneRig().stars.visible, false, 'Env starfield mesh must hide during daytime');
  assert.ok(dbg.Shaders.uniforms.uNightFactor.value < 0.05, 'Shaders uNightFactor must sync < 0.05 in daytime');
  assert.ok(dbg.player.userData.staffLight.intensity < 0.45, `Staff-Lantern must dim gently in daylight, got ${dbg.player.userData.staffLight.intensity}`);

  // 4. Steady-state post-8/8 frames: zero scene.addCalls, live cycle advances, cloak wind tracks Env.getWindGust()
  // Warm up ambient spawn pools first, then assert steady-state ticks add 0 objects to scene
  while (dbg.glooms.filter(g => !g.underwater).length < 6) dbg.spawnGloom('classic');
  tick(8, 40);
  const addsBefore = dbg.scene.addCalls;
  const cycleBefore = dbg.Env.getCelestialState().cycleTime;
  tick(30, 40);
  assert.equal(dbg.scene.addCalls - addsBefore, 0, 'Steady-state post-8/8 frames must produce ZERO scene.addCalls');
  assert.ok(dbg.Env.getCelestialState().cycleTime > cycleBefore, 'Post-8/8 live day/night cycle must advance');

  const expectedGust = dbg.Env.getWindGust();
  assert.ok(expectedGust >= 0.25 && expectedGust <= 1.15, `Env.getWindGust() out of bounds: ${expectedGust}`);
  assert.ok(
    Math.abs(dbg.Shaders.uniforms.uClothMotion.value.w - expectedGust) < 1e-6,
    `Starkeeper cloak wind (${dbg.Shaders.uniforms.uClothMotion.value.w}) must match Env.getWindGust() (${expectedGust})`
  );
  assert.ok(
    Math.abs(dbg.Shaders.uniforms.uWindVec.value.z - expectedGust) < 1e-6,
    `Shaders uWindVec.z (${dbg.Shaders.uniforms.uWindVec.value.z}) must match Env.getWindGust() (${expectedGust})`
  );

  // 5. Region transition passes active regionId into updateEnvironment -> Env.update
  dbg.P.x = 62;
  dbg.P.z = -78;
  dbg.P.y = dbg.heightAt(62, -78) + 0.1;
  tick(2, 40);
  assert.equal(dbg.getCurrentRegion().id, 'whisperingForest');
  assert.ok(seenRegionIds.includes('whisperingForest'), `updateEnvironment must pass active regionId to Env.update, saw [${seenRegionIds.join(', ')}]`);

  // 6. Post-8/8 live cycle night restores Staff-Lantern glow automatically
  dbg.Env.update = (dt, t, ctx) => origEnvUpdate(dt, t, { ...ctx, cycleTime: 360 });
  tick(2, 40);
  assert.ok(dbg.Env.getCelestialState().nightFactor > 0.8, 'Post-8/8 midnight must raise nightFactor > 0.8');
  assert.ok(dbg.player.userData.staffLight.intensity > 1.0, `Staff-Lantern must glow warmly again during post-8/8 live night, got ${dbg.player.userData.staffLight.intensity}`);

  // 7. Gerstner wave height & ocean swimming buoyancy
  const w1 = dbg.Shaders.waterHeightAt(12, 55, 1.5);
  const w2 = dbg.Shaders.waterHeightAt(12, 55, 2.7);
  assert.ok(Math.abs(w1) < 0.25 && Math.abs(w2) < 0.25 && Math.abs(w1 - w2) > 0.001, 'Gerstner waterHeightAt must vary smoothly over time');
  dbg.P.x = -14;
  dbg.P.z = 55;
  dbg.P.y = dbg.WATER_Y - 0.6;
  dbg.P.vy = 0;
  tick(4, 40);
  assert.equal(dbg.P.swimming, true, 'Starkeeper in Sunken Bay ocean must enter buoyant swimming state');

  // 8. Quality toggling scales both Env and World water tile resolution cleanly
  const waterTilesBefore = dbg.scene.children.filter(c => c.geometry && c.geometry.attributes && c.geometry.attributes.aBedHeight);
  assert.ok(waterTilesBefore.length > 0, 'World must contain water tile meshes');
  assert.equal(waterTilesBefore[0].geometry.attributes.position.count, 25 * 25, 'High quality water tiles use 24x24 grid (625 verts)');

  dbg.setQuality('balanced');
  assert.equal(dbg.getQuality(), 'balanced');
  assert.equal(dbg.Env.getQuality(), 'balanced');
  const waterTilesBalanced = dbg.scene.children.filter(c => c.geometry && c.geometry.attributes && c.geometry.attributes.aBedHeight);
  assert.equal(waterTilesBalanced[0].geometry.attributes.position.count, 17 * 17, 'Balanced quality water tiles shrink to 16x16 grid (289 verts)');

  dbg.setQuality('high');
  assert.equal(dbg.getQuality(), 'high');
  assert.equal(dbg.Env.getQuality(), 'high');
  const waterTilesHigh = dbg.scene.children.filter(c => c.geometry && c.geometry.attributes && c.geometry.attributes.aBedHeight);
  assert.equal(waterTilesHigh[0].geometry.attributes.position.count, 25 * 25, 'Restoring High quality restores 24x24 water grid (625 verts)');
});

test('index.html locks mobile zoom via viewport & touch-action rules while keeping modals scrollable', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const viewportMatch = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i);
  assert.ok(viewportMatch, 'viewport meta tag must exist');
  const vp = viewportMatch[1];
  assert.ok(vp.includes('maximum-scale=1'), `viewport must include maximum-scale=1, got "${vp}"`);
  assert.ok(vp.includes('user-scalable=no'), `viewport must include user-scalable=no, got "${vp}"`);
  assert.ok(vp.includes('viewport-fit=cover'), `viewport must include viewport-fit=cover, got "${vp}"`);

  const extractBlock = (selector) => {
    const idx = html.indexOf(`${selector} {`);
    assert.ok(idx >= 0, `CSS block for "${selector}" must exist`);
    const end = html.indexOf('}', idx);
    return html.slice(idx, end);
  };

  const htmlBodyCss = extractBlock('html, body');
  assert.ok(htmlBodyCss.includes('touch-action: none'), 'html, body must set touch-action: none');

  for (const sel of ['#controlsPanel', '#overlay']) {
    const css = extractBlock(sel);
    assert.ok(css.includes('touch-action: pan-y'), `${sel} must keep touch-action: pan-y so modals stay scrollable`);
  }

  for (const sel of ['#touchControls', '#touchJoyBase', '#touchActions', '.touchBtn']) {
    const css = extractBlock(sel);
    assert.ok(css.includes('touch-action: none'), `${sel} must set touch-action: none`);
    assert.ok(css.includes('user-select: none'), `${sel} must set user-select: none`);
    assert.ok(css.includes('-webkit-touch-callout: none'), `${sel} must set -webkit-touch-callout: none`);
  }
});

test('Mobile touch joystick & action buttons prevent zoom, survive 360 turns & multi-touch, and apply console speed curve', () => {
  const { dbg, doc, win, rafQueue } = loadGameHarness({ hash: '#test' });
  assert.equal(typeof dbg.evalTouchJoy, 'function', 'game.js must expose evalTouchJoy helper on debugHandle');

  // 1. Verify console-grade joystick speed curve & sprint hysteresis
  const out = { ox: 0, oy: 0, nx: 0, ny: 0, outMag: 0, rawMag: 0, sprinting: false };
  const maxR = 50;

  // Deadzone (< 0.12)
  dbg.evalTouchJoy(0, -5, maxR, false, out);
  assert.equal(out.outMag, 0, 'rawMag=0.10 must fall in deadzone');
  assert.equal(out.sprinting, false);

  // Walk zone (0.12 <= rawMag < 0.34 -> 0.38..0.68)
  dbg.evalTouchJoy(0, -11.5, maxR, false, out); // rawMag = 0.23
  assert.ok(out.outMag > 0.50 && out.outMag < 0.56, `rawMag=0.23 should output ~0.53 walk speed, got ${out.outMag}`);
  assert.equal(out.sprinting, false);

  // Full run achieved cleanly by rawMag = 0.56 (comfortable thumb hold!)
  dbg.evalTouchJoy(0, -28, maxR, false, out); // rawMag = 0.56
  assert.ok(Math.abs(out.outMag - 1.0) < 1e-6, `rawMag=0.56 must hit full 1.0 run output, got ${out.outMag}`);
  assert.equal(out.sprinting, false);

  // Sprint hysteresis ring: enter at >= 0.88, stay at >= 0.75, exit < 0.75
  dbg.evalTouchJoy(0, -44, maxR, false, out); // rawMag = 0.88
  assert.equal(out.sprinting, true, 'rawMag >= 0.88 must enter sprinting');
  assert.equal(out.outMag, 1.0);
  dbg.evalTouchJoy(0, -40, maxR, true, out); // rawMag = 0.80 while already sprinting
  assert.equal(out.sprinting, true, 'rawMag = 0.80 must hold sprint via hysteresis');
  dbg.evalTouchJoy(0, -37, maxR, true, out); // rawMag = 0.74
  assert.equal(out.sprinting, false, 'rawMag < 0.75 must cleanly exit sprint');

  // Sliding past the visual circle clamps knob offset at maxR while holding full sprint!
  dbg.evalTouchJoy(0, -90, maxR, false, out); // rawMag = 1.80
  assert.ok(Math.abs(Math.hypot(out.ox, out.oy) - maxR) < 1e-5, 'visual knob must clamp to maxR');
  assert.equal(out.outMag, 1.0);
  assert.equal(out.sprinting, true);

  // 2. Non-passive touchstart / window touchmove / touchend + iOS gesture/dblclick zoom guards
  const joyBase = doc.getElementById('touchJoyBase');
  const joyKnob = doc.getElementById('touchJoyKnob');
  const touchControlsEl = doc.getElementById('touchControls');
  const strikeBtn = doc.getElementById('touchStrike');

  const joyTouchStartListeners = joyBase.getListeners('touchstart');
  assert.ok(joyTouchStartListeners.length > 0, '#touchJoyBase must register direct touchstart listener');
  assert.equal(joyTouchStartListeners[0].opts && joyTouchStartListeners[0].opts.passive, false, 'joystick touchstart must be { passive: false }');

  const winTouchMoveListeners = win.getListeners('touchmove');
  assert.ok(winTouchMoveListeners.some(l => l.opts && l.opts.passive === false), 'window must register { passive: false } touchmove listener for joystick');

  const strikeTouchStartListeners = strikeBtn.getListeners('touchstart');
  assert.ok(strikeTouchStartListeners.length > 0 && strikeTouchStartListeners[0].opts && strikeTouchStartListeners[0].opts.passive === false, 'touch button must register { passive: false } touchstart listener');

  // iOS gesturestart/gesturechange & dblclick guards
  let gStartPrevented = false;
  let gChangePrevented = false;
  let dblPrevented = false;
  doc.dispatchEvent({ type: 'gesturestart', preventDefault() { gStartPrevented = true; } });
  doc.dispatchEvent({ type: 'gesturechange', preventDefault() { gChangePrevented = true; } });
  strikeBtn.dispatchEvent({ type: 'dblclick', preventDefault() { dblPrevented = true; }, stopPropagation() {} });
  assert.equal(gStartPrevented, true, 'gesturestart must call preventDefault');
  assert.equal(gChangePrevented, true, 'gesturechange must call preventDefault');
  assert.equal(dblPrevented, true, 'touch button dblclick must call preventDefault');

  let tcDblPrevented = false;
  touchControlsEl.dispatchEvent({ type: 'dblclick', preventDefault() { tcDblPrevented = true; }, stopPropagation() {} });
  assert.equal(tcDblPrevented, true, '#touchControls dblclick must call preventDefault');

  // Start joystick touch (center of rect {left:20, top:400, width:120, height:120} is (80, 460), joyMaxR = 50.4)
  let joyStartPrevented = false;
  joyBase.dispatchEvent({
    type: 'touchstart',
    touches: [{ identifier: 10, clientX: 80, clientY: 460 }],
    changedTouches: [{ identifier: 10, clientX: 80, clientY: 460 }],
    preventDefault() { joyStartPrevented = true; },
    stopPropagation() {},
  });
  assert.equal(joyStartPrevented, true);
  assert.equal(joyBase.classList.contains('active'), true);

  // Move joystick to comfortable run ring (clientY: 432 -> dy=-28, rawMag=0.556 -> full 1.0 run, sprinting=false)
  let now = 2000;
  win.dispatchEvent({
    type: 'touchmove',
    touches: [{ identifier: 10, clientX: 80, clientY: 432 }],
    changedTouches: [{ identifier: 10, clientX: 80, clientY: 432 }],
    preventDefault() {},
  });
  for (let i = 0; i < 6; i++) {
    now += 35;
    rafQueue[rafQueue.length - 1](now);
  }
  assert.equal(dbg.P.sprinting, false, 'Comfortable run hold (~56%) must run at full speed without sprinting');
  assert.ok(dbg.P.vz > 5.0, `Comfortable run hold must achieve full desktop run speed, got vz=${dbg.P.vz}`);

  // While holding joystick (id=10), rapid double-tap Strike (id=11 then id=12) advances combo without zooming or dropping joystick!
  dbg.glooms.length = 0;
  let tap1Prevented = false;
  let tap2Prevented = false;
  strikeBtn.dispatchEvent({
    type: 'touchstart',
    touches: [
      { identifier: 10, clientX: 80, clientY: 432 },
      { identifier: 11, clientX: 900, clientY: 500 },
    ],
    changedTouches: [{ identifier: 11, clientX: 900, clientY: 500 }],
    preventDefault() { tap1Prevented = true; },
    stopPropagation() {},
  });
  assert.equal(tap1Prevented, true);
  assert.equal(dbg.P.meleeStep, 1, 'First Strike tap must start combo step 1');
  strikeBtn.dispatchEvent({
    type: 'touchend',
    touches: [{ identifier: 10, clientX: 80, clientY: 432 }],
    changedTouches: [{ identifier: 11, clientX: 900, clientY: 500 }],
    preventDefault() {},
  });
  // Unrelated touchend must NOT drop joystick!
  win.dispatchEvent({
    type: 'touchend',
    touches: [{ identifier: 10, clientX: 80, clientY: 432 }],
    changedTouches: [{ identifier: 11, clientX: 900, clientY: 500 }],
  });
  assert.equal(joyBase.classList.contains('active'), true, 'Releasing Strike button must NOT release held joystick');

  dbg.P.meleeT = 0;
  dbg.P.comboWindowT = 0.4;
  strikeBtn.dispatchEvent({
    type: 'touchstart',
    touches: [
      { identifier: 10, clientX: 80, clientY: 432 },
      { identifier: 12, clientX: 900, clientY: 500 },
    ],
    changedTouches: [{ identifier: 12, clientX: 900, clientY: 500 }],
    preventDefault() { tap2Prevented = true; },
    stopPropagation() {},
  });
  assert.equal(tap2Prevented, true);
  assert.equal(dbg.P.meleeStep, 2, 'Rapid second Strike tap must chain into combo step 2');
  strikeBtn.dispatchEvent({
    type: 'touchend',
    touches: [{ identifier: 10, clientX: 80, clientY: 432 }],
    changedTouches: [{ identifier: 12, clientX: 900, clientY: 500 }],
    preventDefault() {},
  });

  // Slide well outside the 120px circle (80px above center) on window touchmove -> sprints forward
  let joyMovePrevented = false;
  win.dispatchEvent({
    type: 'touchmove',
    touches: [{ identifier: 10, clientX: 80, clientY: 380 }],
    changedTouches: [{ identifier: 10, clientX: 80, clientY: 380 }],
    preventDefault() { joyMovePrevented = true; },
  });
  assert.equal(joyMovePrevented, true, 'joystick window touchmove must call preventDefault');
  for (let i = 0; i < 24; i++) {
    now += 35;
    rafQueue[rafQueue.length - 1](now);
  }
  assert.equal(dbg.P.sprinting, true, 'Thumb pushed outside joystick ring must engage sprint');
  assert.ok(dbg.P.vz > 7.5, `Forward sprint must move player along +Z, got vz=${dbg.P.vz}`);

  // 360 degree turning while holding joystick outside visual ring (right -> down -> left)
  const sweepPoints = [
    { x: 160, y: 460, expectVxNeg: true },  // +X stick (right) -> -X world (facing +Z, right is -X)
    { x: 80,  y: 540, expectVzNeg: true },  // +Y stick (down)  -> -Z world
    { x: 0,   y: 460, expectVxPos: true },  // -X stick (left)  -> +X world
  ];
  for (const pt of sweepPoints) {
    win.dispatchEvent({
      type: 'touchmove',
      touches: [{ identifier: 10, clientX: pt.x, clientY: pt.y }],
      changedTouches: [{ identifier: 10, clientX: pt.x, clientY: pt.y }],
      preventDefault() {},
    });
    for (let i = 0; i < 10; i++) {
      now += 35;
      rafQueue[rafQueue.length - 1](now);
    }
    assert.equal(dbg.P.sprinting, true, '360 sweep outside ring must stay sprinting without dropping');
    if (pt.expectVxNeg) assert.ok(dbg.P.vx < -5, `Expected -X velocity on right stick, got vx=${dbg.P.vx}`);
    if (pt.expectVzNeg) assert.ok(dbg.P.vz < -5, `Expected -Z velocity on down stick, got vz=${dbg.P.vz}`);
    if (pt.expectVxPos) assert.ok(dbg.P.vx > 5, `Expected +X velocity on left stick, got vx=${dbg.P.vx}`);
  }

  // Release joystick finger id=10 -> resets cleanly
  win.dispatchEvent({
    type: 'touchend',
    touches: [],
    changedTouches: [{ identifier: 10, clientX: 0, clientY: 460 }],
  });
  assert.equal(joyBase.classList.contains('active'), false);
  assert.equal(joyKnob.style.transform, 'translate3d(0px, 0px, 0)');

  // Pointer events with pointerType === 'touch' must be ignored so they never conflict with touch* handlers
  joyBase.dispatchEvent({
    type: 'pointerdown',
    pointerType: 'touch',
    pointerId: 55,
    clientX: 80,
    clientY: 380,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(joyBase.classList.contains('active'), false, 'pointerdown with pointerType==="touch" must be ignored');

  // Desktop mouse pointerdown still works for non-touch testing!
  joyBase.dispatchEvent({
    type: 'pointerdown',
    pointerType: 'mouse',
    pointerId: 1,
    clientX: 80,
    clientY: 380,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(joyBase.classList.contains('active'), true, 'pointerdown with pointerType==="mouse" must still work');
  win.dispatchEvent({ type: 'pointerup', pointerType: 'mouse', pointerId: 1 });
  assert.equal(joyBase.classList.contains('active'), false);
});

test('Natural offscreen creature spawning keeps enemies & wild critters out of front camera cone when started', () => {
  const { dbg } = loadGameHarness({ hash: '#test' });
  const gameSrc = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  assert.ok(!gameSrc.slice(gameSrc.indexOf('function offscreenLandSpot')).includes('new THREE.Vector3'),
    'offscreenLandSpot must reuse module-scope _camFwd without new THREE.Vector3');

  // Orient camera looking straight along +Z
  dbg.P.x = 0;
  dbg.P.z = 0;
  dbg.P.facing = 0;
  dbg.camera.getWorldDirection = (out) => out.set(0, -0.2, 0.98).normalize();

  // 1. spawnGloom spawns offscreen [22..46] (or farFrontR >= 54) and biases g.dir within +-55 deg toward player
  dbg.glooms.length = 0;
  for (let i = 0; i < 20; i++) {
    const g = dbg.spawnGloom('classic');
    assert.ok(g, 'spawnGloom must return spawned gloom');
    const dx = g.mesh.position.x - dbg.P.x;
    const dz = g.mesh.position.z - dbg.P.z;
    const dist = Math.hypot(dx, dz);
    assert.ok(dist >= 22, `Started spawnGloom must spawn >= 22u away, got ${dist}`);
    const dot = (dx / dist) * 0 + (dz / dist) * 1;
    if (dist < 54) {
      assert.ok(dot <= 0.30 + 1e-6, `spawnGloom within fog radius (${dist}) must stay out of front FOV cone (dot=${dot})`);
    }
    const toPlayerYaw = Math.atan2(dbg.P.x - g.mesh.position.x, dbg.P.z - g.mesh.position.z);
    const diff = dbg.Physics.wrapAngle(g.dir - toPlayerYaw);
    assert.ok(Math.abs(diff) <= (55 * Math.PI) / 180 + 1e-5, `spawnGloom initial dir must bias within +-55deg toward player, got ${(diff * 180 / Math.PI).toFixed(1)}deg`);
  }

  // 2. spawnWild when started=true spawns offscreen [20..46] (or farFrontR >= 50)
  dbg.wild.length = 0;
  for (let i = 0; i < 20; i++) {
    dbg.spawnWild();
  }
  assert.equal(dbg.wild.length, 20, 'spawnWild must spawn 20 wild critters');
  for (const w of dbg.wild) {
    const dx = w.mesh.position.x - dbg.P.x;
    const dz = w.mesh.position.z - dbg.P.z;
    const dist = Math.hypot(dx, dz);
    assert.ok(dist >= 20, `Started spawnWild must spawn >= 20u away, got ${dist}`);
    const dot = (dx / dist) * 0 + (dz / dist) * 1;
    if (dist < 50) {
      assert.ok(dot <= 0.30 + 1e-6, `spawnWild within fog radius (${dist}) must stay out of front FOV cone (dot=${dot})`);
    }
  }

  // 3. respawnPlayer uses updated concentric ring spacing (rad = 2.65 + ring * 1.95)
  dbg.followers.length = 0;
  for (let i = 0; i < 7; i++) dbg.addFollower(1, dbg.P.y, 1, null, dbg.LAND[0]);
  dbg.respawnPlayer();
  const ring0Dist = Math.hypot(dbg.followers[0].mesh.position.x - dbg.P.x, dbg.followers[0].mesh.position.z - dbg.P.z);
  const ring1Dist = Math.hypot(dbg.followers[6].mesh.position.x - dbg.P.x, dbg.followers[6].mesh.position.z - dbg.P.z);
  assert.ok(Math.abs(ring0Dist - 2.65) < 0.05, `respawnPlayer ring 0 radius must be 2.65, got ${ring0Dist}`);
  assert.ok(Math.abs(ring1Dist - 4.60) < 0.05, `respawnPlayer ring 1 radius must be 4.60 (2.65+1.95), got ${ring1Dist}`);

  // 4. Pre-start (!started) spawnWild keeps landSpot(P.x, P.z, 10, 40, 0.6) so opening vista is populated
  const pre = loadGameHarness({ hash: '' });
  pre.dbg.wild.length = 0;
  pre.dbg.spawnWild();
  assert.equal(pre.dbg.wild.length, 1);
  const preDist = Math.hypot(pre.dbg.wild[0].mesh.position.x - pre.dbg.P.x, pre.dbg.wild[0].mesh.position.z - pre.dbg.P.z);
  assert.ok(preDist >= 10 && preDist <= 40, `Pre-start spawnWild must use [10..40] opening ring, got ${preDist}`);
});

