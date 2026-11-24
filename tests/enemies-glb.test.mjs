import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ENEMIES_DIR = path.join(ROOT_DIR, 'assets', 'enemies');

const MAX_TOTAL_BYTES = 3_565_158;
const MAX_BESTIARY_BYTES = 650_000;

const ARCHETYPES = [
  { key: 'puglin', height: 1.18, grounding: 'land', bestiary: true, minClips: 8, requiredClips: ['Idle', 'Walk', 'Run', 'Jump', 'Attack', 'HeavyAttack', 'HitReact', 'Death'] },
  { key: 'imp', height: 1.55, grounding: 'land', bestiary: true, minClips: 9, requiredClips: ['Idle', 'Walk', 'Run', 'Jump', 'Attack', 'HeavyAttack', 'Roll', 'HitReact', 'Death'] },
  { key: 'weaver', height: 0.88, grounding: 'land', bestiary: false, minClips: 5, requiredClips: ['SpiderArmature|Spider_Idle', 'SpiderArmature|Spider_Walk', 'SpiderArmature|Spider_Attack', 'SpiderArmature|Spider_Death'] },
  { key: 'stinger', height: 0.78, grounding: 'centered', bestiary: false, minClips: 4, requiredClips: ['MonsterArmature|Flying', 'MonsterArmature|Bite_Front', 'MonsterArmature|HitRecieve', 'MonsterArmature|Death'] },
  { key: 'knight', height: 2.05, grounding: 'land', bestiary: false, minClips: 12, requiredClips: ['HumanArmature|Idle', 'HumanArmature|Walking', 'HumanArmature|Run', 'HumanArmature|Run_swordAttack', 'HumanArmature|Death'] },
  { key: 'behemoth', height: 2.85, grounding: 'land', bestiary: false, minClips: 6, requiredClips: ['Armature|TRex_Idle', 'Armature|TRex_Walk', 'Armature|TRex_Run', 'Armature|TRex_Attack', 'Armature|TRex_Death'] },
  { key: 'stalker', height: 0.92, grounding: 'land', bestiary: false, minClips: 10, requiredClips: ['MonsterArmature|Idle', 'MonsterArmature|Walk', 'MonsterArmature|Bite_Front', 'MonsterArmature|HitRecieve', 'MonsterArmature|Death'] },
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
const NORM_DIVISOR = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

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
  const scale = acc.normalized ? 1 / (NORM_DIVISOR[acc.componentType] || 1) : 1;
  const out = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const off = base + i * stride;
    if (cnt === 1) {
      out[i] = reader(binBuf, off) * scale;
    } else {
      const tuple = new Array(cnt);
      for (let k = 0; k < cnt; k++) {
        tuple[k] = reader(binBuf, off + k * compSize) * scale;
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

test('all 7 enemy .glb and .glb.js files exist, fit within budget, and have exact base64 parity', () => {
  let totalBytes = 0;
  for (const spec of ARCHETYPES) {
    const glbPath = path.join(ENEMIES_DIR, `${spec.key}.glb`);
    const jsPath = path.join(ENEMIES_DIR, `${spec.key}.glb.js`);
    assert.ok(fs.existsSync(glbPath), `Missing ${glbPath}`);
    assert.ok(fs.existsSync(jsPath), `Missing ${jsPath}`);
    const glbBuf = fs.readFileSync(glbPath);
    assert.ok(glbBuf.length > 5000, `${spec.key}.glb unexpectedly tiny (${glbBuf.length} bytes)`);
    if (spec.bestiary) {
      assert.ok(
        glbBuf.length <= MAX_BESTIARY_BYTES,
        `${spec.key}.glb (${glbBuf.length} bytes) exceeds ${MAX_BESTIARY_BYTES} byte limit`
      );
    }
    totalBytes += glbBuf.length;

    const jsSrc = fs.readFileSync(jsPath, 'utf8');
    const win = {};
    vm.runInNewContext(jsSrc, { window: win, globalThis: win });
    assert.ok(win.__ENEMY_GLB_B64__, `${spec.key}.glb.js must initialize __ENEMY_GLB_B64__`);
    assert.equal(typeof win.__ENEMY_GLB_B64__[spec.key], 'string', `${spec.key}.glb.js must define key "${spec.key}"`);
    const decoded = Buffer.from(win.__ENEMY_GLB_B64__[spec.key], 'base64');
    assert.equal(Buffer.compare(glbBuf, decoded), 0, `${spec.key}.glb.js base64 must match ${spec.key}.glb byte-for-byte`);
  }
  assert.ok(
    totalBytes <= MAX_TOTAL_BYTES,
    `Combined size of all 7 enemy .glb files (${totalBytes} bytes) exceeds ${MAX_TOTAL_BYTES} byte limit`
  );
});

test('every enemy GLB has EnemyRoot normalization, canonical height/grounding, +Z facing, r128 compatibility, and valid animations', () => {
  for (const spec of ARCHETYPES) {
    const glbPath = path.join(ENEMIES_DIR, `${spec.key}.glb`);
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
    assert.equal(typeof gltf.extras.source, 'string', `${spec.key}: missing source metadata`);

    // Three.js r128 strict extension hygiene
    const usedExts = gltf.extensionsUsed || [];
    const reqExts = gltf.extensionsRequired || [];
    assert.ok(!usedExts.includes('KHR_materials_emissive_strength'), `${spec.key}: extensionsUsed must not include KHR_materials_emissive_strength`);
    assert.ok(!reqExts.includes('KHR_materials_emissive_strength'), `${spec.key}: extensionsRequired must not include KHR_materials_emissive_strength`);
    assert.equal(reqExts.length, 0, `${spec.key}: extensionsRequired must be empty for r128 compatibility`);
    for (const mat of gltf.materials || []) {
      assert.ok(
        !mat.extensions || !mat.extensions.KHR_materials_emissive_strength,
        `${spec.key}: material "${mat.name}" must strip KHR_materials_emissive_strength`
      );
    }

    // EnemyRoot node
    const scene = gltf.scenes[gltf.scene || 0];
    assert.ok(scene && Array.isArray(scene.nodes) && scene.nodes.length >= 1, `${spec.key}: missing scene nodes`);
    const rootNode = gltf.nodes[scene.nodes[0]];
    assert.equal(rootNode.name, 'EnemyRoot', `${spec.key}: scene root node must be named EnemyRoot`);
    assert.ok(Array.isArray(rootNode.scale) && rootNode.scale.length === 3, `${spec.key}: EnemyRoot must have scale`);
    assert.ok(
      Math.abs(rootNode.scale[0] - rootNode.scale[1]) < 1e-5 &&
      Math.abs(rootNode.scale[0] - rootNode.scale[2]) < 1e-5 &&
      rootNode.scale[0] > 0,
      `${spec.key}: EnemyRoot scale must be positive uniform`
    );

    // Every primitive has POSITION & unit finite NORMAL and mode === 4
    let primCount = 0;
    for (let mi = 0; mi < (gltf.meshes || []).length; mi++) {
      const mesh = gltf.meshes[mi];
      for (let pi = 0; pi < mesh.primitives.length; pi++) {
        primCount++;
        const prim = mesh.primitives[pi];
        assert.ok(prim.mode === undefined || prim.mode === 4, `${spec.key}: primitive mode must be TRIANGLES (4)`);
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
      Math.abs(actualHeight - spec.height) <= 0.03,
      `${spec.key}: world height ${actualHeight.toFixed(4)} != canonical ${spec.height}`
    );
    if (spec.grounding === 'land') {
      assert.ok(Math.abs(minY) < 0.015, `${spec.key} (land): minY=${minY.toFixed(4)} must be ~0`);
    } else {
      const centerY = (minY + maxY) * 0.5;
      assert.ok(Math.abs(centerY) < 0.015, `${spec.key} (${spec.grounding}): centerY=${centerY.toFixed(4)} must be ~0`);
    }

    // Verify +Z forward orientation using semantic joints across all 7 archetypes
    const jointWorldByName = new Map();
    for (const sk of gltf.skins || []) {
      for (const ji of sk.joints || []) {
        const jn = (gltf.nodes[ji]?.name || '').toLowerCase();
        const wm = worldMats[ji];
        if (jn && wm) jointWorldByName.set(jn, [wm[12], wm[13], wm[14]]);
      }
    }
    const leftArm = jointWorldByName.get('upperarm_l') || jointWorldByName.get('upperarm.l') || jointWorldByName.get('eyebrow.l');
    const rightArm = jointWorldByName.get('upperarm_r') || jointWorldByName.get('upperarm.r') || jointWorldByName.get('eyebrow.r');
    if (leftArm && rightArm) {
      // With +Y up and +Z forward, character Left is +X and character Right is -X
      assert.ok(
        leftArm[0] > rightArm[0] && Math.abs(leftArm[0] - rightArm[0]) > Math.abs(leftArm[2] - rightArm[2]),
        `${spec.key}: expected +Z forward alignment (Left.x=${leftArm[0].toFixed(3)} > Right.x=${rightArm[0].toFixed(3)})`
      );
    }
    const frontPt =
      jointWorldByName.get('ball_l') ||
      jointWorldByName.get('mouth') ||
      jointWorldByName.get('head');
    const backPt =
      jointWorldByName.get('foot_l') ||
      jointWorldByName.get('tail5') ||
      jointWorldByName.get('abdomen') ||
      jointWorldByName.get('body');
    if (frontPt && backPt && spec.key !== 'knight') {
      const dz = frontPt[2] - backPt[2];
      assert.ok(dz > 0, `${spec.key}: expected front joint Z (${frontPt[2].toFixed(3)}) > back joint Z (${backPt[2].toFixed(3)})`);
    }
    if (spec.key === 'knight') {
      // Verify Knight Boots toe tips extend further in +Z than heel in -Z
      const knightMesh = gltf.meshes[0];
      const knightNodeIdx = gltf.nodes.findIndex((n) => n.mesh === 0);
      const bootsPrim = knightMesh.primitives[1];
      const bootPts = readAccessor(gltf, binBuf, bootsPrim.attributes.POSITION).map((p) => transformPoint(worldMats[knightNodeIdx], p));
      const solePts = bootPts.filter((p) => p[1] < 0.06);
      const minBootZ = Math.min(...solePts.map((p) => p[2]));
      const maxBootZ = Math.max(...solePts.map((p) => p[2]));
      assert.ok(maxBootZ > Math.abs(minBootZ) * 0.9, `knight: boot toes maxZ=${maxBootZ.toFixed(3)} vs heel minZ=${minBootZ.toFixed(3)}`);
    }

    // Animation clip coverage & validation
    assert.ok(Array.isArray(gltf.animations) && gltf.animations.length >= spec.minClips, `${spec.key}: expected >= ${spec.minClips} clips, got ${gltf.animations?.length}`);
    const clipNames = new Set(gltf.animations.map((a) => a.name));
    for (const reqClip of spec.requiredClips) {
      assert.ok(clipNames.has(reqClip), `${spec.key}: missing required animation clip "${reqClip}"`);
    }
    for (const anim of gltf.animations) {
      assert.ok(anim.channels && anim.channels.length > 0, `${spec.key}: animation "${anim.name}" has no channels`);
      for (let ci = 0; ci < anim.channels.length; ci++) {
        const ch = anim.channels[ci];
        const smp = anim.samplers[ch.sampler];
        assert.ok(smp, `${spec.key}: missing sampler for channel ${ci} in "${anim.name}"`);
        const inAcc = gltf.accessors[smp.input];
        const outAcc = gltf.accessors[smp.output];
        assert.equal(
          inAcc.count,
          outAcc.count,
          `${spec.key} "${anim.name}" ch[${ci}]: input.count (${inAcc.count}) != output.count (${outAcc.count})`
        );
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

test('puglin.glb and imp.glb retain embedded PBR textures and clean world-rest-basis UAL retargeting', () => {
  for (const spec of ARCHETYPES.filter((a) => a.bestiary)) {
    const glbBuf = fs.readFileSync(path.join(ENEMIES_DIR, `${spec.key}.glb`));
    const { gltf, binBuf } = parseGlb(glbBuf);
    assert.ok(Array.isArray(gltf.images) && gltf.images.length >= 3, `${spec.key}: expected >= 3 embedded textures`);
    for (const im of gltf.images) {
      assert.ok(im.mimeType === 'image/jpeg' || im.mimeType === 'image/png', `${spec.key}: unexpected mimeType ${im.mimeType}`);
    }

    // Verify pelvis translation has zero horizontal X/Z drift in world space!
    const pelvisIdx = gltf.nodes.findIndex((n) => n.name === 'pelvis');
    assert.ok(pelvisIdx >= 0, `${spec.key}: missing pelvis joint`);
    const rootIdx = gltf.nodes.findIndex((n) => n.name === 'root');
    assert.ok(rootIdx >= 0, `${spec.key}: missing root joint`);
    const restPelvis = gltf.nodes[pelvisIdx].translation || [0, 0, 0];

    for (const anim of gltf.animations) {
      const pelvisTransCh = anim.channels.find((c) => c.target.node === pelvisIdx && c.target.path === 'translation');
      assert.ok(pelvisTransCh, `${spec.key} "${anim.name}": expected pelvis translation channel`);
      const tVals = readAccessor(gltf, binBuf, anim.samplers[pelvisTransCh.sampler].output);
      // Since root has -90deg X rotation (Z-up -> Y-up), world X = local X, world Y = local Z, world Z = -local Y
      for (const tv of tVals) {
        assert.ok(Math.abs(tv[0] - restPelvis[0]) < 1e-4, `${spec.key} "${anim.name}": pelvis X drift ${tv[0]} != ${restPelvis[0]}`);
        assert.ok(Math.abs(tv[1] - restPelvis[1]) < 1e-4, `${spec.key} "${anim.name}": pelvis local-Y (world Z) drift ${tv[1]} != ${restPelvis[1]}`);
      }
    }
  }
});

test('assets/LICENSE-CC0.txt credits Bestiary - Dungeon Monsters Kit (QAL v1.0) and all 5 Quaternius CC0 1.0 enemies', () => {
  const txt = fs.readFileSync(path.join(ROOT_DIR, 'assets', 'LICENSE-CC0.txt'), 'utf8');
  for (const term of [
    'Bestiary - Dungeon Monsters Kit',
    'QAL',
    'Puglin.glb',
    'Imp.glb',
    'Spider.glb',
    'Bee.glb',
    'KnightCharacter.glb',
    'Trex.glb',
    'Crab.glb',
  ]) {
    assert.ok(txt.includes(term), `assets/LICENSE-CC0.txt must credit ${term}`);
  }
});
