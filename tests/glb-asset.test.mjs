import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const EXPECTED_CLIPS = [
  'Idle', 'IdleStaff', 'Walk', 'Jog', 'Sprint', 'CrouchIdle', 'CrouchFwd',
  'JumpStart', 'JumpLoop', 'JumpLand', 'Roll', 'SwimIdle', 'SwimFwd',
  'CastEnter', 'CastShoot', 'CastLoop', 'Melee1', 'MeleeJab', 'MeleeCross',
  'HitReact', 'Death', 'Cheer',
  'Backpedal', 'StrafeLeft', 'StrafeRight', 'Melee2', 'Spin360', 'RollStrike',
  'SlideThrust', 'HillSlide', 'PlungeDive', 'PlungeLand', 'CastNova',
];

function parseGlbJson(buf) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'GLB magic must be glTF');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version must be 2');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'First chunk must be JSON');
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

test('vendor/GLTFLoader.js exists and registers THREE.GLTFLoader cleanly', () => {
  const src = fs.readFileSync(new URL('../vendor/GLTFLoader.js', import.meta.url), 'utf8');
  assert.ok(src.includes('GLTFLoader'), 'vendor/GLTFLoader.js must define GLTFLoader');
  const sandbox = {
    THREE: {
      Loader: class {},
      FileLoader: class {},
      LoaderUtils: {},
      DefaultLoadingManager: {},
      PropertyBinding: {},
      Matrix4: class {},
      Vector3: class {},
      Quaternion: class {},
      Color: class {},
      MeshStandardMaterial: class {},
      Interpolant: class {},
      LinearFilter: 1,
      LinearMipmapLinearFilter: 2,
      RepeatWrapping: 3,
      ClampToEdgeWrapping: 4,
      MirroredRepeatWrapping: 5,
      NearestFilter: 6,
      NearestMipmapNearestFilter: 7,
      LinearMipmapNearestFilter: 8,
      NearestMipmapLinearFilter: 9,
      InterpolateLinear: 10,
      InterpolateDiscrete: 11,
    },
    console,
    self: {},
  };
  vm.runInNewContext(src, sandbox);
  assert.equal(typeof sandbox.THREE.GLTFLoader, 'function', 'THREE.GLTFLoader must attach to global THREE');
});

test('assets/starkeeper.glb has valid skeleton, 32 clips, 4 facial morphs, y=0 grounding, and matches starkeeper.glb.js', () => {
  const glbBuf = fs.readFileSync(new URL('../assets/starkeeper.glb', import.meta.url));
  assert.ok(glbBuf.length > 50_000 && glbBuf.length < 2_900_000, `GLB size ${glbBuf.length} out of expected range`);
  const gltf = parseGlbJson(glbBuf);

  assert.ok(gltf.skins && gltf.skins.length >= 1, 'GLB must contain at least one skin');
  const jointNames = new Set(gltf.skins[0].joints.map((i) => gltf.nodes[i].name));
  for (const required of ['Root', 'Hips', 'Chest', 'Neck', 'Head', 'Hand.R', 'UpperLeg.L', 'UpperLeg.R', 'Foot.L', 'Foot.R']) {
    assert.ok(jointNames.has(required), `Missing required bone ${required}`);
  }

  // Backpack stripped cleanly
  const meshNames = gltf.meshes.map((m) => m.name);
  assert.ok(!meshNames.some((n) => /backpack/i.test(n)), `Backpack mesh must be stripped, found: ${meshNames.join(', ')}`);

  // All 32 curated animations present with non-empty channels
  const animByName = new Map((gltf.animations || []).map((a) => [a.name, a]));
  for (const clip of EXPECTED_CLIPS) {
    const a = animByName.get(clip);
    assert.ok(a, `Missing expected animation clip: ${clip}`);
    assert.ok(Array.isArray(a.channels) && a.channels.length >= 4, `Clip ${clip} must animate at least 4 channels`);
  }

  // 4 facial morph targets baked on Adventurer_Head
  const headMesh = gltf.meshes.find((m) => /head/i.test(m.name));
  assert.ok(headMesh, 'Adventurer_Head mesh must exist');
  assert.deepEqual(headMesh.extras?.targetNames, ['Blink', 'Determined', 'Smile', 'Hurt']);
  assert.ok(
    headMesh.primitives.every((p) => Array.isArray(p.targets) && p.targets.length === 4),
    'Every Adventurer_Head primitive must carry all 4 facial morph targets'
  );

  // Feet grounded at y ~ 0 (supports both native Y-up meters and legacy Blender Z-up * 100)
  const feetMesh = gltf.meshes.find((m) => /feet|boots/i.test(m.name));
  assert.ok(feetMesh, 'Feet/Boots mesh must exist');
  let minWorldY = Infinity;
  for (const p of feetMesh.primitives) {
    const posAcc = gltf.accessors[p.attributes.POSITION];
    if (posAcc && Array.isArray(posAcc.min)) {
      const yVal = posAcc.max && posAcc.max[1] > 0.25 ? posAcc.min[1] : posAcc.min[2] * 100;
      minWorldY = Math.min(minWorldY, yVal);
    }
  }
  assert.ok(Math.abs(minWorldY) < 0.02, `Starkeeper boots must ground near y = 0, got minWorldY=${minWorldY}`);

  // Exact base64 parity with file:// dual-mode wrapper
  const jsSrc = fs.readFileSync(new URL('../assets/starkeeper.glb.js', import.meta.url), 'utf8');
  const win = {};
  vm.runInNewContext(jsSrc, { window: win, globalThis: win });
  assert.equal(typeof win.__STARKEEPER_GLB_B64__, 'string');
  const decoded = Buffer.from(win.__STARKEEPER_GLB_B64__, 'base64');
  assert.equal(Buffer.compare(glbBuf, decoded), 0, 'starkeeper.glb.js base64 must match starkeeper.glb byte-for-byte');
});

test('martial bo-staff combat clips are snappy, full-body, and include RollStrike and airborne Spin360', () => {
  const glbBuf = fs.readFileSync(new URL('../assets/starkeeper.glb', import.meta.url));
  const gltf = parseGlbJson(glbBuf);
  const jsonLen = glbBuf.readUInt32LE(12);
  const binOff = 20 + jsonLen + 8;

  function readScalar(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) out.push(glbBuf.readFloatLE(base + i * 4));
    return out;
  }
  function readVec3(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * 12;
      out.push([glbBuf.readFloatLE(o), glbBuf.readFloatLE(o + 4), glbBuf.readFloatLE(o + 8)]);
    }
    return out;
  }

  const animByName = new Map((gltf.animations || []).map((a) => [a.name, a]));
  const combatClips = ['Melee1', 'Melee2', 'Spin360', 'RollStrike', 'SlideThrust', 'PlungeDive', 'PlungeLand'];
  const requiredBones = ['Hips', 'UpperArm.R', 'Hand.R', 'Neck', 'Head'];

  for (const cname of combatClips) {
    const anim = animByName.get(cname);
    assert.ok(anim, `Missing martial combat clip ${cname}`);
    const animatedBones = new Set(anim.channels.map((ch) => gltf.nodes[ch.target.node]?.name));
    for (const b of requiredBones) {
      assert.ok(animatedBones.has(b), `Clip ${cname} must animate ${b}`);
    }
    const times = readScalar(anim.samplers[0].input);
    const dur = times[times.length - 1];
    assert.ok(dur >= 0.34 && dur <= 0.78, `Combat clip ${cname} duration (${dur.toFixed(2)}s) must be readable and coherent (0.34-0.78s)`);
  }

  // Verify Hit 1, Hit 2, and Spin360 are paced deliberately so players can clearly track every gesture!
  const durOf = (name) => {
    const t = readScalar(animByName.get(name).samplers[0].input);
    return t[t.length - 1];
  };
  assert.ok(durOf('Melee1') >= 0.46 && durOf('Melee2') >= 0.52, `Hit 1/2 clips must be >=0.46s/0.52s for clear anticipation & follow-through`);
  assert.ok(durOf('Spin360') >= 0.70, `Spin360 airborne 360° whirlwind must be >=0.70s so players can clearly track the leap & spin, got ${durOf('Spin360').toFixed(2)}s`);

  const spin = animByName.get('Spin360');
  const hipsTransCh = spin.channels.find(
    (ch) => gltf.nodes[ch.target.node]?.name === 'Hips' && ch.target.path === 'translation'
  );
  assert.ok(hipsTransCh, 'Spin360 must animate Hips translation for crouch -> airborne hop -> landing');
  const hTrans = readVec3(spin.samplers[hipsTransCh.sampler].output);
  const mags = hTrans.map((v) => Math.hypot(v[0], v[1], v[2]));
  const span = Math.max(...mags) - Math.min(...mags);
  assert.ok(span > 0.0018, `Spin360 Hips vertical travel must include airborne hop (>=0.18m / 100), got ${span}`);

  // Forward-kinematics non-compounding regression guard: Spin360 UpperArm.R local track must NOT repeat Hips's 360° spin!
  function readVec4(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * 16;
      out.push([glbBuf.readFloatLE(o), glbBuf.readFloatLE(o + 4), glbBuf.readFloatLE(o + 8), glbBuf.readFloatLE(o + 12)]);
    }
    return out;
  }
  const totalAngleRad = (qs) => {
    let sum = 0;
    for (let i = 1; i < qs.length; i++) {
      const a = qs[i - 1], b = qs[i];
      const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
      sum += 2 * Math.acos(dot);
    }
    return sum;
  };
  const spinHipsRot = spin.channels.find((ch) => gltf.nodes[ch.target.node]?.name === 'Hips' && ch.target.path === 'rotation');
  const spinArmRot = spin.channels.find((ch) => gltf.nodes[ch.target.node]?.name === 'UpperArm.R' && ch.target.path === 'rotation');
  const hipsTravel = totalAngleRad(readVec4(spin.samplers[spinHipsRot.sampler].output));
  const armLocalTravel = totalAngleRad(readVec4(spin.samplers[spinArmRot.sampler].output));
  assert.ok(hipsTravel > 5.5 && hipsTravel < 8.0, `Spin360 Hips must perform one full ~360° spin (~6.3 rad), got ${hipsTravel.toFixed(2)}`);
  assert.ok(armLocalTravel < 2.2, `Spin360 UpperArm.R local rotation must stay parent-compensated (<2.2 rad, no 6x compounding!), got ${armLocalTravel.toFixed(2)}`);
});

test('every channel of every animation clip in starkeeper.glb has matching input/output counts and sorted non-negative timestamps', () => {
  const glbBuf = fs.readFileSync(new URL('../assets/starkeeper.glb', import.meta.url));
  const gltf = parseGlbJson(glbBuf);
  const jsonLen = glbBuf.readUInt32LE(12);
  const binOff = 20 + jsonLen + 8;

  function readScalar(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = [];
    for (let i = 0; i < acc.count; i++) out.push(glbBuf.readFloatLE(base + i * 4));
    return out;
  }

  for (const anim of gltf.animations || []) {
    for (let ci = 0; ci < anim.channels.length; ci++) {
      const ch = anim.channels[ci];
      const smp = anim.samplers[ch.sampler];
      const inAcc = gltf.accessors[smp.input];
      const outAcc = gltf.accessors[smp.output];
      const boneName = gltf.nodes[ch.target.node]?.name || `node#${ch.target.node}`;
      assert.equal(
        inAcc.count,
        outAcc.count,
        `Clip "${anim.name}" channel ${ci} (${boneName}.${ch.target.path}) has mismatched input (${inAcc.count}) vs output (${outAcc.count}) counts — causes Three.js r128 QuaternionLinearInterpolant infinite loop!`
      );
      const times = readScalar(smp.input);
      assert.ok(times.length >= 2, `Clip "${anim.name}" channel ${ci} must have >=2 keyframes`);
      assert.ok(times[0] >= -1e-5, `Clip "${anim.name}" channel ${ci} starts at negative time ${times[0]}`);
      for (let k = 0; k < times.length - 1; k++) {
        assert.ok(
          times[k] <= times[k + 1] + 1e-6,
          `Clip "${anim.name}" channel ${ci} has unsorted timestamps at ${k}: ${times[k]} > ${times[k + 1]}`
        );
      }
    }
  }
});
