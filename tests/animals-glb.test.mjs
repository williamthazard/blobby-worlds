import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ANIMALS_DIR = path.join(ROOT_DIR, 'assets', 'animals');

const ARCHETYPES = [
  { key: 'fox', height: 0.72, grounding: 'land' },
  { key: 'unicorn', height: 1.28, grounding: 'land' },
  { key: 'wolf', height: 0.92, grounding: 'land' },
  { key: 'stag', height: 1.36, grounding: 'land' },
  { key: 'drake', height: 0.84, grounding: 'land' },
  { key: 'beetle', height: 0.44, grounding: 'land' },
  { key: 'firefly', height: 0.46, grounding: 'centered' },
  { key: 'bird', height: 0.52, grounding: 'centered' },
  { key: 'kiwi', height: 0.56, grounding: 'land' },
  { key: 'fish_tang', height: 0.50, grounding: 'centered' },
  { key: 'fish_koi', height: 0.54, grounding: 'centered' },
  { key: 'eel', height: 0.55, grounding: 'centered' },
  { key: 'manta', height: 0.36, grounding: 'centered' },
];

const COMP_TYPE_READERS = {
  5120: (buf, o) => buf.readInt8(o),
  5121: (buf, o) => buf.readUInt8(o),
  5122: (buf, o) => buf.readInt16LE(o),
  5123: (buf, o) => buf.readUInt16LE(o),
  5125: (buf, o) => buf.readUInt32LE(o),
  5126: (buf, o) => buf.readFloatLE(o),
};
const COMP_BYTE_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(buf) {
  assert.ok(buf.length >= 28, 'GLB too short');
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'GLB magic must be glTF');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version must be 2');
  const totalLen = buf.readUInt32LE(8);
  assert.equal(totalLen, buf.length, 'GLB declared length must match buffer length');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'First chunk must be JSON');
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeaderOff = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderOff);
  assert.equal(buf.readUInt32LE(binHeaderOff + 4), 0x004e4942, 'Second chunk must be BIN');
  const binBuf = buf.subarray(binHeaderOff + 8, binHeaderOff + 8 + binLen);
  return { gltf, binBuf };
}

function readAccessor(gltf, binBuf, accIdx) {
  const acc = gltf.accessors[accIdx];
  assert.ok(acc, `Missing accessor ${accIdx}`);
  const bv = gltf.bufferViews[acc.bufferView];
  assert.ok(bv, `Missing bufferView ${acc.bufferView}`);
  const cnt = TYPE_COUNTS[acc.type];
  const compSize = COMP_BYTE_SIZE[acc.componentType];
  const reader = COMP_TYPE_READERS[acc.componentType];
  assert.ok(cnt && compSize && reader, `Unsupported accessor format ${acc.type}/${acc.componentType}`);
  const stride = bv.byteStride || cnt * compSize;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const off = base + i * stride;
    if (cnt === 1) {
      out[i] = reader(binBuf, off);
    } else {
      const tuple = new Array(cnt);
      for (let k = 0; k < cnt; k++) {
        tuple[k] = reader(binBuf, off + k * compSize);
      }
      out[i] = tuple;
    }
  }
  return out;
}

function mat4Identity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function mat4Multiply(a, b) {
  // Column-major 4x4 matrix multiply: a * b
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

function mat4FromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function computeWorldMatrices(gltf) {
  const nodes = gltf.nodes || [];
  const mats = new Array(nodes.length);
  const scene = gltf.scenes[gltf.scene || 0];
  function visit(idx, parentMat) {
    const n = nodes[idx];
    const local = n.matrix
      ? n.matrix.slice()
      : mat4FromTRS(n.translation, n.rotation, n.scale);
    const world = mat4Multiply(parentMat, local);
    mats[idx] = world;
    for (const c of n.children || []) {
      visit(c, world);
    }
  }
  const id = mat4Identity();
  for (const r of scene.nodes || []) {
    visit(r, id);
  }
  return mats;
}

test('vendor/SkeletonUtils.js exists and attaches THREE.SkeletonUtils.clone cleanly in VM sandbox', () => {
  const filePath = path.join(ROOT_DIR, 'vendor', 'SkeletonUtils.js');
  assert.ok(fs.existsSync(filePath), 'vendor/SkeletonUtils.js must exist');
  const src = fs.readFileSync(filePath, 'utf8');
  assert.ok(src.includes('SkeletonUtils'), 'vendor/SkeletonUtils.js must define SkeletonUtils');
  const sandbox = {
    THREE: {
      Skeleton: class {},
      Bone: class {},
      Matrix4: class {},
      Quaternion: class {},
      Vector3: class {},
      Vector2: class {},
      Euler: class {},
      Object3D: class {},
      AnimationClip: class {},
    },
    console,
    self: {},
  };
  vm.runInNewContext(src, sandbox);
  assert.ok(
    sandbox.THREE.SkeletonUtils &&
    (typeof sandbox.THREE.SkeletonUtils === 'function' || typeof sandbox.THREE.SkeletonUtils === 'object'),
    'THREE.SkeletonUtils must attach to global THREE'
  );
  assert.equal(typeof sandbox.THREE.SkeletonUtils.clone, 'function', 'THREE.SkeletonUtils.clone must be a function');
});

test('all 13 animal .glb and .glb.js files exist, fit within 5,100,000 byte budget, and have exact base64 parity', () => {
  let totalBytes = 0;
  for (const spec of ARCHETYPES) {
    const glbPath = path.join(ANIMALS_DIR, `${spec.key}.glb`);
    const jsPath = path.join(ANIMALS_DIR, `${spec.key}.glb.js`);
    assert.ok(fs.existsSync(glbPath), `Missing ${glbPath}`);
    assert.ok(fs.existsSync(jsPath), `Missing ${jsPath}`);
    const glbBuf = fs.readFileSync(glbPath);
    assert.ok(glbBuf.length > 2000, `${spec.key}.glb unexpectedly tiny (${glbBuf.length} bytes)`);
    totalBytes += glbBuf.length;

    const jsSrc = fs.readFileSync(jsPath, 'utf8');
    const win = {};
    vm.runInNewContext(jsSrc, { window: win, globalThis: win });
    assert.ok(win.__ANIMAL_GLB_B64__, `${spec.key}.glb.js must initialize __ANIMAL_GLB_B64__`);
    assert.equal(typeof win.__ANIMAL_GLB_B64__[spec.key], 'string', `${spec.key}.glb.js must define key "${spec.key}"`);
    const decoded = Buffer.from(win.__ANIMAL_GLB_B64__[spec.key], 'base64');
    assert.equal(Buffer.compare(glbBuf, decoded), 0, `${spec.key}.glb.js base64 must match ${spec.key}.glb byte-for-byte`);
  }
  assert.ok(
    totalBytes <= 5_100_000,
    `Combined size of all 13 animal .glb files (${totalBytes} bytes) exceeds 5,100,000 byte limit`
  );
});

test('every animal GLB has AnimalRoot normalization, canonical height/grounding, POSITION+NORMAL, valid animations, and metadata', () => {
  for (const spec of ARCHETYPES) {
    const glbPath = path.join(ANIMALS_DIR, `${spec.key}.glb`);
    const glbBuf = fs.readFileSync(glbPath);
    const { gltf, binBuf } = parseGlb(glbBuf);

    // Metadata
    assert.ok(gltf.extras && typeof gltf.extras === 'object', `${spec.key}: missing gltf.extras`);
    assert.equal(gltf.extras.archetype, spec.key, `${spec.key}: gltf.extras.archetype mismatch`);
    assert.ok(
      Math.abs(gltf.extras.canonicalHeight - spec.height) < 1e-4,
      `${spec.key}: gltf.extras.canonicalHeight (${gltf.extras.canonicalHeight}) != ${spec.height}`
    );
    assert.equal(typeof gltf.extras.groundOffsetY, 'number', `${spec.key}: missing groundOffsetY`);
    assert.equal(typeof gltf.extras.facingYaw, 'number', `${spec.key}: missing facingYaw`);

    // AnimalRoot node
    const scene = gltf.scenes[gltf.scene || 0];
    assert.ok(scene && Array.isArray(scene.nodes) && scene.nodes.length >= 1, `${spec.key}: missing scene nodes`);
    const rootNode = gltf.nodes[scene.nodes[0]];
    assert.equal(rootNode.name, 'AnimalRoot', `${spec.key}: scene root node must be named AnimalRoot`);
    assert.ok(Array.isArray(rootNode.scale) && rootNode.scale.length === 3, `${spec.key}: AnimalRoot must have scale`);
    assert.ok(
      Math.abs(rootNode.scale[0] - rootNode.scale[1]) < 1e-5 &&
      Math.abs(rootNode.scale[0] - rootNode.scale[2]) < 1e-5 &&
      rootNode.scale[0] > 0,
      `${spec.key}: AnimalRoot scale must be positive uniform`
    );

    // Every primitive has POSITION & NORMAL (unit finite)
    let primCount = 0;
    for (let mi = 0; mi < (gltf.meshes || []).length; mi++) {
      const mesh = gltf.meshes[mi];
      for (let pi = 0; pi < mesh.primitives.length; pi++) {
        primCount++;
        const prim = mesh.primitives[pi];
        assert.notEqual(prim.attributes.POSITION, undefined, `${spec.key} mesh[${mi}].prim[${pi}] missing POSITION`);
        assert.notEqual(prim.attributes.NORMAL, undefined, `${spec.key} mesh[${mi}].prim[${pi}] missing NORMAL`);
        const normals = readAccessor(gltf, binBuf, prim.attributes.NORMAL);
        for (let ni = 0; ni < normals.length; ni++) {
          const n = normals[ni];
          const len = Math.hypot(n[0], n[1], n[2]);
          assert.ok(Number.isFinite(len) && Math.abs(len - 1.0) < 0.03, `${spec.key} invalid normal length ${len}`);
        }
      }
    }
    assert.ok(primCount > 0, `${spec.key}: must contain at least one mesh primitive`);

    // World-space bounds check across all mesh nodes
    const worldMats = computeWorldMatrices(gltf);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let ni = 0; ni < gltf.nodes.length; ni++) {
      const node = gltf.nodes[ni];
      if (node.mesh === undefined || !worldMats[ni]) continue;
      const mesh = gltf.meshes[node.mesh];
      const mat = worldMats[ni];
      for (const prim of mesh.primitives) {
        const positions = readAccessor(gltf, binBuf, prim.attributes.POSITION);
        for (const p of positions) {
          const wp = transformPoint(mat, p);
          if (wp[1] < minY) minY = wp[1];
          if (wp[1] > maxY) maxY = wp[1];
        }
      }
    }
    const actualHeight = maxY - minY;
    assert.ok(
      Math.abs(actualHeight - spec.height) < 0.025,
      `${spec.key}: world height ${actualHeight.toFixed(4)} != canonical ${spec.height}`
    );
    if (spec.grounding === 'land') {
      assert.ok(Math.abs(minY) < 0.015, `${spec.key} (land): minY=${minY.toFixed(4)} must be ~0`);
    } else {
      const centerY = (minY + maxY) * 0.5;
      assert.ok(Math.abs(centerY) < 0.015, `${spec.key} (${spec.grounding}): centerY=${centerY.toFixed(4)} must be ~0`);
    }

    // Verify +Z forward orientation using semantic joints when available
    const jointWorldByName = new Map();
    for (const sk of gltf.skins || []) {
      for (const ji of sk.joints || []) {
        const jn = (gltf.nodes[ji]?.name || '').toLowerCase();
        const wm = worldMats[ji];
        if (jn && wm) jointWorldByName.set(jn, [wm[12], wm[13], wm[14]]);
      }
    }
    const headPt =
      jointWorldByName.get('head') ||
      jointWorldByName.get('mouth') ||
      jointWorldByName.get('main1');
    const tailPt =
      jointWorldByName.get('tail8') ||
      jointWorldByName.get('tail6') ||
      jointWorldByName.get('tail3') ||
      jointWorldByName.get('tail2') ||
      jointWorldByName.get('tail') ||
      jointWorldByName.get('abdomen2') ||
      jointWorldByName.get('main6') ||
      jointWorldByName.get('hips') ||
      jointWorldByName.get('body');
    if (headPt && tailPt) {
      const dz = headPt[2] - tailPt[2];
      const dx = headPt[0] - tailPt[0];
      assert.ok(
        dz > 0 && Math.abs(dz) > Math.abs(dx),
        `${spec.key}: expected +Z forward (head z=${headPt[2].toFixed(3)} > tail z=${tailPt[2].toFixed(3)}, dx=${dx.toFixed(3)})`
      );
    }

    // Animation validation: input/output count parity, sorted non-negative finite timestamps
    assert.ok(Array.isArray(gltf.animations) && gltf.animations.length >= 1, `${spec.key}: expected at least 1 animation clip`);
    for (const anim of gltf.animations || []) {
      assert.ok(anim.channels && anim.channels.length > 0, `${spec.key}: animation "${anim.name}" has no channels`);
      for (let ci = 0; ci < anim.channels.length; ci++) {
        const ch = anim.channels[ci];
        const smp = anim.samplers[ch.sampler];
        assert.ok(smp, `${spec.key}: missing sampler for channel ${ci} in "${anim.name}"`);
        const inAcc = gltf.accessors[smp.input];
        const outAcc = gltf.accessors[smp.output];
        if (ch.target.path === 'weights') {
          const targetMesh = gltf.meshes[gltf.nodes[ch.target.node].mesh];
          const targetCount = targetMesh?.primitives?.[0]?.targets?.length || 1;
          assert.equal(
            outAcc.count,
            inAcc.count * targetCount,
            `${spec.key} "${anim.name}" ch[${ci}]: weights output.count (${outAcc.count}) != input.count * targets (${inAcc.count} * ${targetCount})`
          );
        } else {
          assert.equal(
            inAcc.count,
            outAcc.count,
            `${spec.key} "${anim.name}" ch[${ci}]: input.count (${inAcc.count}) != output.count (${outAcc.count})`
          );
        }
        const times = readAccessor(gltf, binBuf, smp.input);
        assert.ok(times.length >= 1, `${spec.key} "${anim.name}" ch[${ci}]: empty keyframes`);
        assert.ok(Number.isFinite(times[0]) && times[0] >= -1e-5, `${spec.key} "${anim.name}" ch[${ci}]: bad start time ${times[0]}`);
        for (let k = 0; k < times.length; k++) {
          assert.ok(Number.isFinite(times[k]), `${spec.key} "${anim.name}" ch[${ci}]: non-finite time at ${k}`);
          if (k > 0) {
            assert.ok(
              times[k - 1] <= times[k] + 1e-6,
              `${spec.key} "${anim.name}" ch[${ci}]: unsorted timestamps ${times[k - 1]} > ${times[k]}`
            );
          }
        }
        const vals = readAccessor(gltf, binBuf, smp.output);
        let prevQ = null;
        for (let k = 0; k < vals.length; k++) {
          const v = Array.isArray(vals[k]) ? vals[k] : [vals[k]];
          for (const c of v) {
            assert.ok(Number.isFinite(c), `${spec.key} "${anim.name}" ch[${ci}]: non-finite output value`);
          }
          if (ch.target.path === 'rotation' && (smp.interpolation || 'LINEAR') !== 'CUBICSPLINE') {
            const len = Math.hypot(v[0], v[1], v[2], v[3]);
            assert.ok(
              Math.abs(len - 1.0) < 1e-3,
              `${spec.key} "${anim.name}" ch[${ci}] key ${k}: non-unit quaternion length ${len}`
            );
            if (prevQ) {
              const dot = prevQ[0] * v[0] + prevQ[1] * v[1] + prevQ[2] * v[2] + prevQ[3] * v[3];
              assert.ok(
                dot >= -1e-4,
                `${spec.key} "${anim.name}" ch[${ci}] key ${k}: quaternion hemisphere discontinuity dot=${dot}`
              );
            }
            prevQ = v;
          }
        }
      }
    }
  }
});

test('fox.glb has valid Feline morph target with min/max bounds, weights=[0.0], and targetNames', () => {
  const glbBuf = fs.readFileSync(path.join(ANIMALS_DIR, 'fox.glb'));
  const { gltf, binBuf } = parseGlb(glbBuf);
  const morphMesh = gltf.meshes.find((m) => Array.isArray(m.extras?.targetNames) && m.extras.targetNames.includes('Feline'));
  assert.ok(morphMesh, 'fox.glb must have a mesh with extras.targetNames containing "Feline"');
  assert.deepEqual(morphMesh.extras.targetNames, ['Feline']);
  assert.deepEqual(morphMesh.weights, [0.0]);
  assert.ok(morphMesh.primitives.length >= 1);
  let overallMaxMag = 0;
  for (const prim of morphMesh.primitives) {
    assert.ok(Array.isArray(prim.targets) && prim.targets.length === 1, 'fox Feline mesh primitive must have 1 morph target');
    const posDeltaAccIdx = prim.targets[0].POSITION;
    assert.notEqual(posDeltaAccIdx, undefined, 'Feline morph target must define POSITION delta accessor');
    const deltaAcc = gltf.accessors[posDeltaAccIdx];
    assert.ok(Array.isArray(deltaAcc.min) && deltaAcc.min.length === 3, 'Feline POSITION delta accessor must define min[3]');
    assert.ok(Array.isArray(deltaAcc.max) && deltaAcc.max.length === 3, 'Feline POSITION delta accessor must define max[3]');
    const deltas = readAccessor(gltf, binBuf, posDeltaAccIdx);
    const maxMag = deltas.reduce((mx, d) => Math.max(mx, Math.hypot(d[0], d[1], d[2])), 0);
    overallMaxMag = Math.max(overallMaxMag, maxMag);
  }
  assert.ok(overallMaxMag > 5e-4, `Feline morph deltas must be non-trivial, got overallMaxMag=${overallMaxMag}`);

  // Verify in final world space that front snout vertices actually shorten backward (-Z)
  const worldMats = computeWorldMatrices(gltf);
  const morphMeshIdx = gltf.meshes.indexOf(morphMesh);
  const meshNodeIdx = gltf.nodes.findIndex((n) => n.mesh === morphMeshIdx);
  assert.ok(meshNodeIdx >= 0 && worldMats[meshNodeIdx], 'fox.glb Feline mesh node must have a world matrix');
  const meshWorldMat = worldMats[meshNodeIdx];

  let maxBaseWorldZ = -Infinity;
  const snoutSamples = [];
  for (const prim of morphMesh.primitives) {
    const positions = readAccessor(gltf, binBuf, prim.attributes.POSITION);
    const deltas = readAccessor(gltf, binBuf, prim.targets[0].POSITION);
    for (let i = 0; i < positions.length; i++) {
      const baseW = transformPoint(meshWorldMat, positions[i]);
      const morphedW = transformPoint(meshWorldMat, [
        positions[i][0] + deltas[i][0],
        positions[i][1] + deltas[i][1],
        positions[i][2] + deltas[i][2],
      ]);
      if (baseW[2] > maxBaseWorldZ) maxBaseWorldZ = baseW[2];
      snoutSamples.push({ bz: baseW[2], dz: morphedW[2] - baseW[2] });
    }
  }
  const noseVerts = snoutSamples.filter((v) => v.bz > maxBaseWorldZ - 0.04);
  assert.ok(noseVerts.length > 0, 'Expected front snout vertices near maxBaseWorldZ');
  const minNoseDeltaZ = Math.min(...noseVerts.map((v) => v.dz));
  assert.ok(
    minNoseDeltaZ < -0.01,
    `Feline morph must pull front snout backward in world -Z (delta_world_z < -0.01), got minNoseDeltaZ=${minNoseDeltaZ.toFixed(4)}`
  );
});

test('bird.glb (Parrot) has smooth vertex normals shared across coincident positions', () => {
  const glbBuf = fs.readFileSync(path.join(ANIMALS_DIR, 'bird.glb'));
  const { gltf, binBuf } = parseGlb(glbBuf);
  const prim = gltf.meshes[0].primitives[0];
  const positions = readAccessor(gltf, binBuf, prim.attributes.POSITION);
  const normals = readAccessor(gltf, binBuf, prim.attributes.NORMAL);
  assert.equal(positions.length, normals.length);

  // Coincident positions should have consistent smooth normals (not raw flat face normals)
  const byPos = new Map();
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const key = `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`;
    if (!byPos.has(key)) byPos.set(key, []);
    byPos.get(key).push(normals[i]);
  }
  let sharedGroups = 0;
  let smoothSharedGroups = 0;
  for (const group of byPos.values()) {
    if (group.length < 2) continue;
    sharedGroups++;
    const n0 = group[0];
    const allClose = group.every((n) => n[0] * n0[0] + n[1] * n0[1] + n[2] * n0[2] > 0.99);
    if (allClose) smoothSharedGroups++;
  }
  assert.ok(sharedGroups > 10, 'Expected coincident vertex positions in bird.glb');
  assert.equal(
    smoothSharedGroups,
    sharedGroups,
    `All ${sharedGroups} coincident vertex groups in bird.glb must share smooth normals (got ${smoothSharedGroups})`
  );
});

test('assets/LICENSE-CC0.txt credits all 13 animal sources (CC0 1.0 & Parrot.glb MIT)', () => {
  const txt = fs.readFileSync(path.join(ROOT_DIR, 'assets', 'LICENSE-CC0.txt'), 'utf8');
  for (const term of ['Fox.glb', 'Horse_White.glb', 'Wolf.glb', 'Stag.glb', 'Velociraptor.glb', 'Asianladybeetle.glb', 'Wasp.glb', 'Parrot.glb', 'Kiwi.glb', 'BlueTang.glb', 'Koi.glb', 'Snake.glb', 'Manta_ray.glb', 'MIT']) {
    assert.ok(txt.includes(term), `assets/LICENSE-CC0.txt must credit ${term}`);
  }
});
