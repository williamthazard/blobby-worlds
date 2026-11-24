import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const EXPECTED_PROPS = {
  oak_tree: 9.6,
  birch_tree: 9.2,
  pine_tree: 11.2,
  pine_snow: 11.2,
  willow_tree: 8.8,
  palm_tree: 8.4,
  cactus_flower: 2.6,
  bush_berry: 1.35,
  boulder_moss: 1.35,
  boulder_rock: 1.45,
  fallen_log: 0.85,
  tree_stump: 0.95,
  lilypad: 0.12,
  ruin_arch: 5.8,
  ruin_column: 5.0,
  ruin_column_broken: 3.2,
  shrine_pedestal: 1.6,
};

const COMP_READERS = {
  5120: (buf, o) => buf.readInt8(o),
  5121: (buf, o) => buf.readUInt8(o),
  5122: (buf, o) => buf.readInt16LE(o),
  5123: (buf, o) => buf.readUInt16LE(o),
  5125: (buf, o) => buf.readUInt32LE(o),
  5126: (buf, o) => buf.readFloatLE(o),
};
const COMP_SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(fileUrl) {
  const buf = fs.readFileSync(fileUrl);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'glTF', 'Must have glTF magic header');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version must be 2');
  assert.equal(buf.readUInt32LE(8), buf.length, 'GLB declared byteLength must match file length');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen + 8;
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const bin = buf.subarray(binOff, binOff + binLen);
  return { buf, gltf, bin };
}

function readAccessor(gltf, bin, accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const cnt = TYPE_COUNTS[acc.type];
  const sz = COMP_SIZES[acc.componentType];
  const reader = COMP_READERS[acc.componentType];
  const stride = bv.byteStride || cnt * sz;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const off = base + i * stride;
    if (cnt === 1) {
      out[i] = reader(bin, off);
    } else {
      const tuple = new Array(cnt);
      for (let k = 0; k < cnt; k++) tuple[k] = reader(bin, off + k * sz);
      out[i] = tuple;
    }
  }
  return out;
}

function mat4Mul(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4FromTrs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function computeWorldMatrices(gltf) {
  const nodes = gltf.nodes || [];
  const mats = new Array(nodes.length).fill(null);
  const scene = gltf.scenes[gltf.scene || 0];
  function visit(ni, parent) {
    const n = nodes[ni];
    const local = n.matrix ? n.matrix.slice() : mat4FromTrs(n.translation, n.rotation, n.scale);
    const world = mat4Mul(parent, local);
    mats[ni] = world;
    for (const c of n.children || []) visit(c, world);
  }
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of scene.nodes || []) visit(r, id);
  return mats;
}

test('all 17 environment .glb and .glb.js files exist, fit within 1,500,000 byte budget, and have exact base64 parity', () => {
  const dir = new URL('../assets/env/', import.meta.url);
  let totalGlbBytes = 0;

  for (const key of Object.keys(EXPECTED_PROPS)) {
    const glbUrl = new URL(`${key}.glb`, dir);
    const jsUrl = new URL(`${key}.glb.js`, dir);
    assert.ok(fs.existsSync(glbUrl), `Missing ${key}.glb`);
    assert.ok(fs.existsSync(jsUrl), `Missing ${key}.glb.js`);

    const raw = fs.readFileSync(glbUrl);
    totalGlbBytes += raw.length;
    assert.ok(raw.length > 500 && raw.length < 220_000, `${key}.glb size ${raw.length} out of expected range`);

    const jsSrc = fs.readFileSync(jsUrl, 'utf8');
    const win = {};
    vm.runInNewContext(jsSrc, { window: win });
    assert.ok(win.__ENV_GLB_B64__ && typeof win.__ENV_GLB_B64__[key] === 'string', `${key}.glb.js must register window.__ENV_GLB_B64__.${key}`);
    const decoded = Buffer.from(win.__ENV_GLB_B64__[key], 'base64');
    assert.equal(Buffer.compare(raw, decoded), 0, `${key}.glb.js base64 must match binary .glb byte-for-byte`);
  }

  assert.ok(totalGlbBytes <= 1_500_000, `Total env GLB binary budget exceeded: ${totalGlbBytes} bytes`);
});

test('every environment GLB has EnvRoot normalization, canonical height/grounding, POSITION+NORMAL+TEXCOORD_0, and r128 compatibility', () => {
  const dir = new URL('../assets/env/', import.meta.url);
  for (const [key, targetH] of Object.entries(EXPECTED_PROPS)) {
    const { gltf, bin } = parseGlb(new URL(`${key}.glb`, dir));
    assert.ok(Array.isArray(gltf.meshes) && gltf.meshes.length >= 1, `${key} must contain at least one mesh`);
    assert.ok(!gltf.extensionsRequired || gltf.extensionsRequired.length === 0, `${key} must not require unsupported glTF extensions`);
    assert.ok(!gltf.extensionsUsed || gltf.extensionsUsed.length === 0, `${key} must not depend on non-core glTF extensions`);

    const rootNode = (gltf.nodes || []).find((n) => n.name === 'EnvRoot');
    assert.ok(rootNode, `${key} must have an EnvRoot normalization node`);
    const meta = rootNode.extras || {};
    assert.ok(Math.abs(meta.groundMinY) <= 0.025, `${key} groundMinY should be ~0, got ${meta.groundMinY}`);
    assert.ok(Math.abs(meta.height - targetH) <= targetH * 0.08 + 0.04, `${key} height ${meta.height} should match target ${targetH}`);

    for (const mat of gltf.materials || []) {
      assert.match(mat.name || '', /^(Bark|Leaves|Snow|Stone|Moss|Flower)(_|$)/, `${key} material "${mat.name}" must use canonical slot prefix`);
    }

    for (const mesh of gltf.meshes) {
      for (const prim of mesh.primitives) {
        assert.ok(prim.attributes.POSITION !== undefined, `${key} primitive missing POSITION`);
        assert.ok(prim.attributes.NORMAL !== undefined, `${key} primitive missing NORMAL`);
        assert.ok(prim.attributes.TEXCOORD_0 !== undefined, `${key} primitive missing TEXCOORD_0`);

        const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
        const nrm = readAccessor(gltf, bin, prim.attributes.NORMAL);
        const uvs = readAccessor(gltf, bin, prim.attributes.TEXCOORD_0);
        assert.equal(nrm.length, pos.length, `${key} NORMAL count mismatch`);
        assert.equal(uvs.length, pos.length, `${key} TEXCOORD_0 count mismatch`);

        for (const n of nrm) {
          const len = Math.hypot(n[0], n[1], n[2]);
          assert.ok(Number.isFinite(len) && Math.abs(len - 1) < 0.03, `${key} non-unit normal length ${len}`);
        }
        for (const uv of uvs) {
          assert.ok(Number.isFinite(uv[0]) && Number.isFinite(uv[1]), `${key} non-finite UV`);
        }
        if (prim.indices !== undefined) {
          const idxs = readAccessor(gltf, bin, prim.indices);
          assert.ok(idxs.length >= 3 && idxs.length % 3 === 0, `${key} invalid index count ${idxs.length}`);
          for (const ix of idxs) assert.ok(ix >= 0 && ix < pos.length, `${key} index out of bounds`);
        }
      }
    }

    const worldMats = computeWorldMatrices(gltf);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let ni = 0; ni < gltf.nodes.length; ni++) {
      const node = gltf.nodes[ni];
      if (node.mesh === undefined || !worldMats[ni]) continue;
      const m = worldMats[ni];
      for (const prim of gltf.meshes[node.mesh].primitives) {
        for (const p of readAccessor(gltf, bin, prim.attributes.POSITION)) {
          const wy = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
          if (wy < minY) minY = wy;
          if (wy > maxY) maxY = wy;
        }
      }
    }
    assert.ok(Math.abs(minY) <= 0.02, `${key} computed world minY=${minY} should be ~0`);
    assert.ok(Math.abs((maxY - minY) - targetH) <= 0.02, `${key} computed world height=${maxY - minY} != ${targetH}`);
  }
});

test('assets/LICENSE-CC0.txt credits all 17 environment CC0 1.0 nature and ruin sources', () => {
  const txt = fs.readFileSync(new URL('../assets/LICENSE-CC0.txt', import.meta.url), 'utf8');
  for (const token of ['nature_pack', 'modular_dungeon_1', 'modular_dungeon_pack', 'CommonTree_1.glb', 'Willow_1.glb', 'PalmTree_1.glb', 'Rock_Moss_1.glb', 'Arch.glb', 'Pedestal.glb']) {
    assert.ok(txt.includes(token), `LICENSE-CC0.txt must credit ${token}`);
  }
});
