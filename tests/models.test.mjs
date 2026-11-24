import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockTHREE() {
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
  }
  class Obj {
    constructor() {
      this.children = [];
      this.position = new Vec3();
      this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ' };
      this.scale = new Vec3(1, 1, 1);
      this.userData = {};
      this.castShadow = false;
      this.receiveShadow = false;
    }
    add(...items) {
      for (const c of items) {
        c.parent = this;
        this.children.push(c);
      }
      return this;
    }
    lookAt() {}
    rotateX() {}
  }
  class Geo {
    constructor(kind = 'geo', minY = 0, maxY = 0, args = []) {
      this.kind = kind;
      this.minY = minY;
      this.maxY = maxY;
      this.args = args;
      this.ty = 0;
    }
    translate(_x, y = 0, _z) { this.ty += y; this.minY += y; this.maxY += y; return this; }
    rotateX() { return this; }
    rotateY() { return this; }
    rotateZ() { return this; }
    scale() { return this; }
    computeVertexNormals() { return this; }
  }
  class Mat {
    constructor(p = {}) { Object.assign(this, p); }
    clone() { return new Mat({ ...this }); }
  }
  class Color {
    constructor(c) { this.c = c; }
    multiplyScalar() { return this; }
    lerp() { return this; }
    clone() { return new Color(this.c); }
  }
  return {
    Group: Obj,
    Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    PointLight: class extends Obj { constructor(c, i, d) { super(); this.color = c; this.intensity = i; this.distance = d; } },
    Sprite: class extends Obj {},
    Color,
    DoubleSide: 2,
    AdditiveBlending: 2,
    MeshStandardMaterial: Mat,
    MeshBasicMaterial: Mat,
    SphereGeometry: class extends Geo { constructor(r = 1, ...rest) { super('sphere', -r, r, [r, ...rest]); } },
    CylinderGeometry: class extends Geo { constructor(rt = 1, rb = 1, h = 1, ...rest) { super('cylinder', -h / 2, h / 2, [rt, rb, h, ...rest]); } },
    ConeGeometry: class extends Geo { constructor(r = 1, h = 1, ...rest) { super('cone', -h / 2, h / 2, [r, h, ...rest]); } },
    BoxGeometry: class extends Geo { constructor(w = 1, h = 1, d = 1, ...rest) { super('box', -h / 2, h / 2, [w, h, d, ...rest]); } },
    TorusGeometry: class extends Geo { constructor(...args) { super('torus', 0, 0, args); } },
    OctahedronGeometry: class extends Geo { constructor(r = 1, ...rest) { super('octa', -r, r, [r, ...rest]); } },
    IcosahedronGeometry: class extends Geo { constructor(r = 1, ...rest) { super('icosa', -r, r, [r, ...rest]); } },
    DodecahedronGeometry: class extends Geo { constructor(r = 1, ...rest) { super('dodeca', -r, r, [r, ...rest]); } },
    PlaneGeometry: class extends Geo { constructor(w = 1, h = 1, ...rest) { super('plane', -h / 2, h / 2, [w, h, ...rest]); } },
  };
}

function loadModels(textureSets = {}) {
  const code = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  const glowCalls = [];
  const sandbox = {
    THREE,
    Math,
    Map,
    Set,
    Textures: { sets: textureSets },
    Shaders: {
      createGlowSprite: (color, size, opacity, sparkle) => {
        glowCalls.push({ color, size, opacity, sparkle });
        return new THREE.Sprite();
      },
    },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Models = Models;', sandbox);
  return { Models: sandbox.__Models, THREE, glowCalls, code };
}

function collectDescendants(root, out = []) {
  for (const child of root.children) {
    out.push(child);
    collectDescendants(child, out);
  }
  return out;
}

test('Starkeeper parents eyes and astronomer hat inside headGroup (no detached eyes)', () => {
  const { Models: M, THREE } = loadModels();
  const p = M.makePlayer();
  assert.equal(p.rotation.order, 'YXZ', 'Root rotation order must be YXZ');
  assert.ok(p.userData.pelvis, 'pelvis must exist');
  assert.ok(p.userData.pelvis.position.y >= 0.75 && p.userData.pelvis.position.y <= 1.0, 'pelvis should sit near center of mass');
  assert.ok(p.userData.torso, 'torso must exist');
  assert.ok(p.userData.headGroup, 'headGroup must exist');
  assert.ok(p.userData.headGroup.children.length >= 8, 'headGroup should contain head, hair, ears, eyes, brows, and hat');
  assert.equal(p.userData.capeSegs.length, 3, 'cloak should have 3 articulated segments');
  assert.equal(p.userData.capeSegs[1].parent, p.userData.capeSegs[0], 'capeSegs[1] must be child of capeSegs[0]');
  assert.equal(p.userData.capeSegs[2].parent, p.userData.capeSegs[1], 'capeSegs[2] must be child of capeSegs[1]');
  assert.ok(p.userData.staffPivot, 'Star-Lantern Staff pivot must exist');
  assert.ok(p.userData.staffPivot.rotation.z <= -0.28, `Staff must tilt outward away from hat brim, got rz=${p.userData.staffPivot.rotation.z}`);
  assert.ok(p.userData.handL && p.userData.handR, 'Sculpted multi-part humanoid hands must exist');
  assert.ok(p.userData.handL.children.length >= 4 && p.userData.handR.children.length >= 4, 'Hands must have palm, glove cuff, thumb, and articulated fingers (not orbs)');
  assert.ok(p.userData.skirts && p.userData.skirts.fl && p.userData.skirts.fr && p.userData.skirts.bl && p.userData.skirts.br, '4 articulated flowing coat-skirt panels must exist');
  assert.equal(p.userData.scarfSegs.length, 2, 'Twin flowing neck scarf tails must exist');
  assert.ok(p.userData.staffHalo, 'Star-Lantern Staff halo must exist');
  assert.ok(p.userData.pearlAura, 'Tidecaller Pearl underwater aura must exist on staffPivot');
  assert.equal(p.userData.pearlAura.visible, false, 'pearlAura starts hidden until breathing relic claimed');
  for (const key of ['eyelidL', 'eyelidR', 'browL', 'browR']) {
    assert.ok(p.userData[key], `Expressive face rig player.userData.${key} must exist`);
  }
  const headChildren = collectDescendants(p.userData.headGroup);
  assert.ok(headChildren.includes(p.userData.eyelidL) && headChildren.includes(p.userData.browR), 'Eyelids and brows must be parented inside headGroup');
  for (const key of ['thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'armL', 'armR', 'elbowL', 'elbowR']) {
    assert.ok(p.userData[key], `player.userData.${key} must exist`);
  }
  const all = collectDescendants(p);
  const opaqueMeshes = all.filter((o) => o instanceof THREE.Mesh && !o.material?.transparent);
  assert.ok(opaqueMeshes.length > 20, 'Starkeeper should have rich sculpted multi-part geometry');
  assert.ok(opaqueMeshes.every((m) => m.castShadow && m.receiveShadow), 'All opaque Starkeeper meshes must cast & receive shadows');
  assert.equal(p.userData.staffHalo.castShadow, false, 'Staff glow sprite must not cast shadows');
});

test('All 7 critter body plans and all 14 game species build and share species materials cleanly', () => {
  const { Models: M, THREE } = loadModels();
  const specs = [
    { name: 'Momo the Moss', plan: 'quad', body: 'round', color: 0x8fce6a, deco: 'ears' },
    { name: 'Bramble the Berry', plan: 'bug', color: 0xe2656a, deco: 'spots' },
    { name: 'Kiwi the Khaki', plan: 'bird', color: 0xc9a86a, deco: 'crest', beak: 0.55 },
    { name: 'Puff the Cloud', plan: 'bird', color: 0xf2f5f7, deco: 'crest' },
    { name: 'Ember the Coal', plan: 'lizard', color: 0xf78e5d, deco: 'fins' },
    { name: 'Grapo the Vine', plan: 'quad', body: 'tall', color: 0xa887d6, deco: 'horn' },
    { name: 'Sprout the Seed', plan: 'bug', color: 0xbde36a, deco: 'ears' },
    { name: 'Coco the Cocoa', plan: 'quad', body: 'wide', color: 0x9b7653, deco: 'spots' },
    { name: 'Twink the Star', plan: 'bird', color: 0xf7d948, deco: 'crown' },
    { name: 'Frost the Flake', plan: 'quad', body: 'round', color: 0xbfe3f0, deco: 'ears' },
    { name: 'Fin the Foam', plan: 'fish', color: 0x6ad9d0, aquatic: true },
    { name: 'Coral the Reef', plan: 'fish', color: 0xf78ea8, deco: 'spots', aquatic: true },
    { name: 'Bubbles the Pop', plan: 'jelly', color: 0x8fbdf7, aquatic: true },
    { name: 'Kelpy the Frond', plan: 'eel', color: 0x5ab86a, aquatic: true },
  ];
  for (const sp of specs) {
    const a = M.makeCritter(sp, 1);
    const b = M.makeCritter(sp, 0.8);
    assert.ok(a.children.length > 0, `Critter ${sp.name} empty`);
    assert.doesNotThrow(() => M.animateCritter(a, 1.5, true));
    assert.doesNotThrow(() => M.animateCritter(b, 1.5, false));

    const meshesA = collectDescendants(a).filter((o) => o instanceof THREE.Mesh);
    const meshesB = collectDescendants(b).filter((o) => o instanceof THREE.Mesh);
    assert.equal(meshesA[0].material, meshesB[0].material, `Species ${sp.name} should reuse cached primary material`);
    assert.equal(meshesA[0].geometry, meshesB[0].geometry, `Species ${sp.name} should reuse cached body geometry`);
    assert.ok(
      meshesA.filter((m) => !m.material?.transparent).every((m) => m.castShadow && m.receiveShadow),
      `Opaque meshes on ${sp.name} must cast & receive shadows`
    );
  }

  const wish = M.makeWish();
  assert.equal(wish.userData.wings.length, 2);
  assert.ok(wish.userData.tail && wish.userData.head && wish.userData.halo);
  assert.doesNotThrow(() => M.animateCritter(wish, 2.1, false));
  assert.equal(wish.userData.halo.castShadow, false);

  const gloom = M.makeGloom();
  assert.ok(gloom.userData.body && gloom.userData.halo && gloom.userData.eyeMat);
  assert.ok(gloom.userData.wisps.length >= 2);
  assert.equal(gloom.userData.halo.castShadow, false);

  const cocoon = M.makeCocoon();
  assert.ok(cocoon.userData.core && cocoon.userData.halo);
  assert.equal(cocoon.userData.halo.castShadow, false);

  const totem = M.makeTotem();
  assert.ok(totem.userData.crystal && totem.userData.ringA && totem.userData.ringB && totem.userData.halo && totem.userData.beam);
  assert.ok(totem.userData.ringB.position.y - 0.92 - 0.045 > 3.90, `Totem rotating astrolabe ring must clear stone finials (3.90), got bottom=${totem.userData.ringB.position.y - 0.965}`);
  assert.equal(totem.userData.beam.castShadow, false, 'Totem beacon beam must not cast shadow');
  assert.equal(totem.userData.halo.castShadow, false, 'Totem halo must not cast shadow');
  assert.ok(collectDescendants(totem).some((o) => o instanceof THREE.PointLight), 'Totem should include warm PointLight');

  assert.ok(M.makeStarPickup());
  assert.ok(M.makePearlPickup());
  assert.ok(M.makeHeartPickup().userData.kind === 'heart');
  assert.ok(M.makeStarBolt());
});

test('Uses Textures.sets maps when available and stays r128 compatible (no CapsuleGeometry)', () => {
  const fakeSet = (tag) => ({ map: { tag }, normalMap: { tag }, roughnessMap: { tag } });
  const { Models: M, THREE, code } = loadModels({
    cloth: fakeSet('cloth'),
    leather: fakeSet('leather'),
    fur: fakeSet('fur'),
    feather: fakeSet('feather'),
    scales: fakeSet('scales'),
    stone: fakeSet('stone'),
    bark: fakeSet('bark'),
  });
  assert.equal(code.includes('CapsuleGeometry'), false, 'Three.js r128 does not have CapsuleGeometry');

  const p = M.makePlayer();
  const playerMeshes = collectDescendants(p).filter((o) => o instanceof THREE.Mesh);
  assert.ok(playerMeshes.some((m) => m.material.map?.tag === 'cloth'), 'Starkeeper coat/cloak should use cloth texture set');
  assert.ok(playerMeshes.some((m) => m.material.map?.tag === 'leather'), 'Starkeeper leather gear should use leather texture set');
  assert.ok(playerMeshes.some((m) => m.material.map?.tag === 'bark'), 'Starkeeper staff shaft should use bark texture set');

  const totem = M.makeTotem();
  const totemMeshes = collectDescendants(totem).filter((o) => o instanceof THREE.Mesh);
  assert.ok(totemMeshes.some((m) => m.material.map?.tag === 'stone'), 'Totem monolith should use stone texture set');

  const fox = M.makeCritter({ name: 'Momo', plan: 'quad', body: 'round', color: 0x8fce6a, deco: 'ears' }, 1);
  const foxMeshes = collectDescendants(fox).filter((o) => o instanceof THREE.Mesh);
  assert.ok(foxMeshes.some((m) => m.material.map?.tag === 'fur'), 'Quad critters should use fur texture set');

  const bird = M.makeCritter({ name: 'Kiwi', plan: 'bird', color: 0xc9a86a, deco: 'crest', beak: 0.55 }, 1);
  const birdMeshes = collectDescendants(bird).filter((o) => o instanceof THREE.Mesh);
  assert.ok(birdMeshes.some((m) => m.material.map?.tag === 'feather'), 'Bird critters should use feather texture set');
  assert.ok(bird.userData.wings[0].children.some((c) => c.userData?.featherCount >= 4), 'Bird wings should have merged 4-blade primary flight feathers');
  assert.ok(bird.userData.tail.children.some((c) => c.userData?.featherCount >= 5), 'Bird tail should have merged 5-blade fanned tail feathers');

  const lizard = M.makeCritter({ name: 'Ember', plan: 'lizard', color: 0xf78e5d, deco: 'fins' }, 1);
  const lizMeshes = collectDescendants(lizard).filter((o) => o instanceof THREE.Mesh);
  assert.ok(lizMeshes.some((m) => m.material.map?.tag === 'scales'), 'Lizard critters should use scales texture set');
  assert.ok(lizMeshes.some((m) => m.userData?.scuteCount >= 9), 'Lizard should have merged sculpted dorsal scutes & crest armor');

  const fish = M.makeCritter({ name: 'Fin', plan: 'fish', color: 0x6ad9d0, aquatic: true }, 1);
  const fishMeshes = collectDescendants(fish).filter((o) => o instanceof THREE.Mesh);
  assert.ok(fishMeshes.some((m) => m.material.map?.tag === 'scales'), 'Fish critters should use scales texture set');

  // Velocity-synced grounded species-specific gaits:
  M.animateCritter(fox, 0.35, 6.8, { idleTime: 1.0 });
  assert.ok(Math.abs(fox.userData.bodyGroup.rotation.x) > 0.08, 'Fast bounding cat/fox should pitch spine dynamically');
  M.animateCritter(bird, 0.8, 5.5, { idleTime: 1.0 });
  assert.ok(Math.abs(bird.userData.legs[0].rotation.x - bird.userData.legs[1].rotation.x) > 0.25, 'Kiwi should sprint on alternating legs even at high speed');
  const songbird = M.makeCritter({ name: 'Puff', plan: 'bird', archetype: 'songbird', color: 0xf2f5f7, deco: 'crest' }, 1);
  M.animateCritter(songbird, 0.8, 2.2, { idleTime: 1.0 });
  assert.ok(Math.abs(songbird.userData.legs[0].rotation.x - songbird.userData.legs[1].rotation.x) < 0.05, 'Songbird should hop with paired feet on land');
  M.animateCritter(lizard, 1.2, 3.8, { idleTime: 1.0 });
  assert.ok(Math.abs(lizard.userData.bodyGroup.rotation.y) > 0.1 && Math.sign(lizard.userData.head.rotation.y) === -Math.sign(lizard.userData.bodyGroup.rotation.y), 'Lizard must slither in S-curve with counter-stabilized head');
});

test('Vertex sculpting helpers deform BufferAttribute positions cleanly without NaN', () => {
  const code = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  class PosAttr {
    constructor(coords) { this.coords = coords; this.count = coords.length / 3; }
    getX(i) { return this.coords[i * 3]; }
    getY(i) { return this.coords[i * 3 + 1]; }
    getZ(i) { return this.coords[i * 3 + 2]; }
    setY(i, v) { this.coords[i * 3 + 1] = v; }
    setXYZ(i, x, y, z) { this.coords[i * 3] = x; this.coords[i * 3 + 1] = y; this.coords[i * 3 + 2] = z; }
  }
  const BaseGeo = THREE.PlaneGeometry;
  class AttrGeo extends BaseGeo {
    constructor() {
      super();
      this.attributes = {
        position: new PosAttr([
          -0.45, 0.0, 0.0,
          0.0, 0.0, 0.45,
          0.45, -0.3, 0.0,
          -0.45, -0.3, 0.0,
        ]),
      };
    }
  }
  THREE.PlaneGeometry = AttrGeo;
  THREE.CylinderGeometry = AttrGeo;
  THREE.TorusGeometry = AttrGeo;
  THREE.BoxGeometry = AttrGeo;
  const sandbox = {
    THREE,
    Math,
    Map,
    Set,
    Textures: { sets: {} },
    Shaders: { createGlowSprite: () => new THREE.Sprite() },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Models = Models;', sandbox);
  const p = sandbox.__Models.makePlayer();
  const meshes = collectDescendants(p).filter((o) => o instanceof THREE.Mesh);
  for (const m of meshes) {
    const pos = m.geometry?.attributes?.position;
    if (!pos) continue;
    for (const v of pos.coords) {
      assert.ok(Number.isFinite(v), 'Sculpted geometry coordinates must be finite');
    }
  }
});

function worldY(obj) {
  let y = 0;
  let cur = obj;
  while (cur) {
    y += cur.position ? cur.position.y : 0;
    cur = cur.parent;
  }
  return y;
}

test('Gloomblobs get distinct eyeMat, bugs have symmetric elytra, and player/quads/cocoon ground at y = 0', () => {
  const { Models: M, THREE } = loadModels();

  // (a) Distinct per-gloom eyeMat instances so hit-flash never mutates other glooms
  const gloomA = M.makeGloom();
  const gloomB = M.makeGloom();
  assert.notEqual(gloomA.userData.eyeMat, gloomB.userData.eyeMat, 'Each Gloomblob must own a distinct eyeMat instance');

  // (b) makeBug left/right elytra symmetry across x = 0
  const bug = M.makeBug
    ? M.makeBug({ name: 'Bramble', plan: 'bug', color: 0xe2656a, deco: 'spots' }, 1)
    : M.makeCritter({ name: 'Bramble', plan: 'bug', color: 0xe2656a, deco: 'spots' }, 1);
  const elytraMeshes = collectDescendants(bug).filter(
    (o) => o instanceof THREE.Mesh && o.geometry?.kind === 'sphere' && Math.abs(o.scale.x - 1.24) < 1e-6
  );
  assert.equal(elytraMeshes.length, 2, 'Bug must have exactly 2 elytra wing-cases');
  const [leftShell, rightShell] = elytraMeshes.sort((a, b) => a.position.x - b.position.x);
  assert.ok(leftShell.position.x < 0 && rightShell.position.x > 0, 'Elytra must sit on opposite -X and +X sides');
  assert.ok(Math.abs(leftShell.position.x + rightShell.position.x) < 1e-6, 'Elytra X positions must mirror across x = 0');
  assert.ok(Math.abs(leftShell.rotation.y + rightShell.rotation.y) < 1e-6, 'Elytra Y rotations must mirror across x = 0');
  assert.ok(Math.abs(leftShell.rotation.z + rightShell.rotation.z) < 1e-6, 'Elytra Z tilts must mirror across x = 0');
  assert.equal(leftShell.scale.x, rightShell.scale.x);
  assert.equal(leftShell.scale.y, rightShell.scale.y);
  assert.equal(leftShell.scale.z, rightShell.scale.z);

  // (c) Exact y = 0 grounding for makePlayer (contoured rounded boot soles, ZERO boxy blocks!), all 3 makeQuad body shapes, and makeCocoon
  const player = M.makePlayer();
  const soles = collectDescendants(player).filter(
    (o) => o instanceof THREE.Mesh && o.userData?.isBootSole
  );
  assert.equal(soles.length, 2, 'Starkeeper should have 2 contoured boot soles');
  for (const sole of soles) {
    assert.equal(sole.geometry?.kind, 'cylinder', 'Boot soles should be rounded sculpted cylinders, not blocky boxes');
    const bottomY = worldY(sole) + sole.geometry.minY * sole.scale.y;
    assert.ok(Math.abs(bottomY) < 1e-5, `Starkeeper boot sole bottom should sit at y = 0, got ${bottomY}`);
  }
  const ankleBoxes = [
    ...collectDescendants(player.userData.ankleL),
    ...collectDescendants(player.userData.ankleR),
  ].filter((o) => o instanceof THREE.Mesh && o.geometry?.kind === 'box');
  assert.equal(ankleBoxes.length, 0, 'Starkeeper boots must not have blocky boxes under the soles/heels');

  for (const body of ['round', 'tall', 'wide']) {
    const quad = M.makeCritter({ name: 'Quad_' + body, plan: 'quad', body, color: 0x8fce6a, deco: 'ears' }, 1);
    const paws = collectDescendants(quad).filter(
      (o) => o instanceof THREE.Mesh && o.geometry?.kind === 'sphere' && Math.abs(o.geometry.args[0] - 0.062) < 1e-6
    );
    assert.equal(paws.length, 4, `Quad (${body}) should have 4 paws`);
    for (const paw of paws) {
      const bottomY = worldY(paw) + paw.geometry.minY * paw.scale.y;
      assert.ok(Math.abs(bottomY) < 1e-5, `Quad (${body}) paw bottom should sit at y = 0, got ${bottomY}`);
    }
  }

  const cocoon = M.makeCocoon();
  const rootBase = collectDescendants(cocoon).find(
    (o) => o instanceof THREE.Mesh && o.geometry?.kind === 'cylinder'
  );
  assert.ok(rootBase, 'Cocoon should have grounded obsidian root base cylinder');
  const cocoonBottomY = worldY(rootBase) + rootBase.geometry.minY * rootBase.scale.y;
  assert.ok(Math.abs(cocoonBottomY) < 1e-5, `Cocoon base bottom should sit at y = 0, got ${cocoonBottomY}`);
});

test('Models exposes shared Starkeeper attachment factories and proceduralRoot wrapper', () => {
  const { Models: M, THREE } = loadModels();
  const eyes = M.makeStarkeeperEyes();
  assert.ok(eyes instanceof THREE.Group && eyes.userData.eyelidL && eyes.userData.eyelidR, 'makeStarkeeperEyes must return sculpted 3D eyes with blinking eyelids');

  const braids = M.makeStarkeeperBraids();
  assert.ok(braids instanceof THREE.Group && braids.userData.count >= 18, 'makeStarkeeperBraids must return full sculpted box braids group');
  for (const bPivot of braids.userData.braids) {
    const rXZ = Math.hypot(bPivot.position.x, bPivot.position.z);
    assert.ok(
      bPivot.position.y >= 0.115 && bPivot.position.y <= 0.162 && rXZ <= 0.135,
      `Each box braid root (${bPivot.position.x}, ${bPivot.position.y}, ${bPivot.position.z}) must tuck cleanly inside the astronomer hat crown interior`
    );
  }

  const hat = M.makeStarkeeperHat();
  assert.ok(hat instanceof THREE.Group && hat.userData.hatTipStar, 'makeStarkeeperHat must return astronomer hat group');
  const { crownCone, hatBand } = hat.userData;
  assert.equal(crownCone.geometry.args[4], true, 'hat crownCone must be open-ended so no bottom cap slices through the brim');
  assert.equal(crownCone.position.x, hatBand.position.x, 'hatBand must be coaxial with crownCone base (X)');
  assert.equal(crownCone.position.z, hatBand.position.z, 'hatBand must be coaxial with crownCone base (Z)');
  assert.equal(crownCone.rotation.x, 0, 'hat crownCone base must sit flush without intersecting brim/hatBand');
  const bandTopR = hatBand.geometry.args[0];
  const bandBotR = hatBand.geometry.args[1];
  const bandH = hatBand.geometry.args[2];
  const bandBotY = hatBand.position.y - bandH * 0.5;
  const bandTopY = hatBand.position.y + bandH * 0.5;
  const coneBaseR = crownCone.geometry.args[0];
  const coneH = crownCone.geometry.args[1];
  const coneBotY = crownCone.position.y - coneH * 0.5;
  const coneRAtBandBot = coneBaseR * (1 - (bandBotY - coneBotY) / coneH);
  const coneRAtBandTop = coneBaseR * (1 - (bandTopY - coneBotY) / coneH);
  assert.ok(bandBotR - coneRAtBandBot >= 0.015, `hatBand bottom must clear crownCone by >= 15mm, got ${((bandBotR - coneRAtBandBot) * 1000).toFixed(1)}mm`);
  assert.ok(bandTopR - coneRAtBandTop >= 0.015, `hatBand top must clear crownCone by >= 15mm, got ${((bandTopR - coneRAtBandTop) * 1000).toFixed(1)}mm`);
  assert.ok(bandBotY >= 0.012 && bandTopY >= 0.065, `hatBand must sit cleanly above brim underside and clear curved brim crest (y=${bandBotY.toFixed(3)}..${bandTopY.toFixed(3)})`);

  const cloak = M.makeStarkeeperCloak();
  assert.ok(
    cloak instanceof THREE.Group && cloak.userData.capeRoot && cloak.userData.scarfSegs?.length === 2 && cloak.userData.capeSegs?.length === 3,
    'makeStarkeeperCloak must return continuous cloak + twin scarf + telemetry capeSegs'
  );

  const staff = M.makeStarkeeperStaff();
  assert.ok(staff instanceof THREE.Group && staff.userData.staffHalo && staff.userData.pearlAura && staff.userData.buttCap, 'makeStarkeeperStaff must return Star-Lantern Staff with halo, pearl aura, and buttCap');

  const player = M.makePlayer();
  assert.ok(player.userData.proceduralRoot instanceof THREE.Group, 'makePlayer must expose proceduralRoot group');
  assert.ok(player.userData.braidsGroup instanceof THREE.Group && player.userData.braidsGroup.parent === player.userData.headGroup, 'makePlayer must mount box braids inside headGroup');
  assert.equal(player.userData.pelvis.parent, player.userData.proceduralRoot, 'pelvis must live inside proceduralRoot for clean GLB hot-swap');
});

test('Timber Wolf quad archetype grounds paws at y = 0 and all 7 fantasy attachment factories share cached geometry', () => {
  const { Models: M, THREE } = loadModels();

  const wolf = M.makeCritter({ name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', body: 'mid', color: 0x7b6554 }, 1);
  const wolfB = M.makeCritter({ name: 'Timber Wolf', plan: 'quad', archetype: 'wolf', body: 'mid', color: 0x7b6554 }, 0.9);
  assert.equal(wolf.userData.archetype, 'wolf');
  assert.ok(wolf.userData.legs.length === 4 && wolf.userData.tail && wolf.userData.head);
  assert.doesNotThrow(() => M.animateCritter(wolf, 1.1, 4.8, { idleTime: 0.5 }));
  const wolfPaws = collectDescendants(wolf).filter(
    (o) => o instanceof THREE.Mesh && o.geometry?.kind === 'sphere' && Math.abs(o.geometry.args[0] - 0.062) < 1e-6
  );
  assert.equal(wolfPaws.length, 4, 'Timber Wolf should have 4 grounded paws');
  for (const paw of wolfPaws) {
    const bottomY = worldY(paw) + paw.geometry.minY * paw.scale.y;
    assert.ok(Math.abs(bottomY) < 1e-5, `Timber Wolf paw bottom should sit at y = 0, got ${bottomY}`);
  }
  const wolfMeshesA = collectDescendants(wolf).filter((o) => o instanceof THREE.Mesh);
  const wolfMeshesB = collectDescendants(wolfB).filter((o) => o instanceof THREE.Mesh);
  assert.equal(wolfMeshesA[0].geometry, wolfMeshesB[0].geometry, 'Timber Wolf must reuse cached torso geometry');
  assert.equal(wolfMeshesA[0].material, wolfMeshesB[0].material, 'Timber Wolf must reuse cached species material');

  const attachmentCalls = [
    ['makeUnicornHorn', () => M.makeUnicornHorn()],
    ['makeLynxEarTufts', () => M.makeLynxEarTufts(0x8fce6a)],
    ['makeDrakeEmberCrest', () => M.makeDrakeEmberCrest()],
    ['makeOwlEarTufts', () => M.makeOwlEarTufts(0xc9a86a)],
    ['makeFireflyLantern', () => M.makeFireflyLantern()],
    ['makeKelpFronds', () => M.makeKelpFronds(0x5ab86a)],
    ['makeWishCrown', () => M.makeWishCrown()],
  ];
  for (const [name, build] of attachmentCalls) {
    assert.equal(typeof M[name], 'function', `Models.${name} must be exported`);
    const g1 = build();
    const g2 = build();
    assert.ok(g1 instanceof THREE.Group, `${name} must return a THREE.Group`);
    assert.ok(g1.children.length >= 1, `${name} must contain at least 1 child`);
    const m1 = collectDescendants(g1).filter((o) => o instanceof THREE.Mesh);
    const m2 = collectDescendants(g2).filter((o) => o instanceof THREE.Mesh);
    assert.ok(m1.length >= 1, `${name} must contain at least 1 Mesh`);
    assert.equal(m1.length, m2.length, `${name} mesh count must be deterministic`);
    assert.ok(m1.every((m, idx) => m.geometry === m2[idx].geometry), `${name} must reuse cached geometry across all meshes`);
    for (const s of collectDescendants(g1).filter((o) => o instanceof THREE.Sprite)) {
      assert.equal(s.castShadow, false, `${name} glow sprite must not cast shadow`);
    }
  }
});

test('makeJelly upgrades to Shaders.createJellyMaterial when available and caches shader materials', () => {
  const code = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  const jellyMatCalls = [];
  const sandbox = {
    THREE,
    Math,
    Map,
    Set,
    Textures: { sets: {} },
    Shaders: {
      createGlowSprite: () => new THREE.Sprite(),
      createJellyMaterial: (colorHex, opts) => {
        jellyMatCalls.push({ colorHex, opts });
        return new THREE.MeshStandardMaterial({
          color: colorHex,
          transparent: true,
          isJellyShaderMat: true,
          isTentacle: !!(opts && opts.isTentacle),
          phase: (opts && opts.phase) || 0,
        });
      },
    },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Models = Models;', sandbox);
  const M = sandbox.__Models;
  const sp = { name: 'Bubbles the Pop', plan: 'jelly', color: 0x8fbdf7, aquatic: true };
  const j1 = M.makeCritter(sp, 1);
  const j2 = M.makeCritter(sp, 0.85);
  assert.equal(j1.userData.tentacles.length, 6);
  assert.ok(j1.userData.bell);
  assert.ok(jellyMatCalls.some((c) => !c.opts?.isTentacle), 'Bell dome/lobes must request isTentacle=false shader material');
  assert.ok(jellyMatCalls.some((c) => c.opts?.isTentacle === true), 'Tentacles must request isTentacle=true shader material');
  const meshes1 = collectDescendants(j1).filter((o) => o instanceof THREE.Mesh);
  const meshes2 = collectDescendants(j2).filter((o) => o instanceof THREE.Mesh);
  assert.equal(meshes1[0].material.isJellyShaderMat, true);
  assert.equal(meshes1[0].material, meshes2[0].material, 'Jelly ShaderMaterials must be cached per species');
  assert.ok(
    j1.userData.tentacles.every((t) => t.children.length === 1 && t.children[0] instanceof THREE.Mesh && !t.userData.tip),
    'GPU-shaded jelly tentacles must use single continuous mesh with no mid-joint seam'
  );
  assert.doesNotThrow(() => M.animateCritter(j1, 1.5, true), 'animateCritter must handle continuous GPU jelly tentacles safely');
  const bellMeshes = j1.userData.bell.children.filter((o) => o instanceof THREE.Mesh);
  assert.equal(bellMeshes.length, 3, 'Bell should merge 8 scalloped rim lobes into 1 draw call (lobes + dome + core)');
});

test('mergeGeo executes real BufferGeometry merge path with transformed vertex attributes', () => {
  const code = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = Math.floor(array.length / itemSize);
    }
    clone() { return new BufferAttribute(new Float32Array(this.array), this.itemSize); }
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; this.userData = {}; this.index = null; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    clone() {
      const g = new BufferGeometry();
      for (const [k, a] of Object.entries(this.attributes)) g.attributes[k] = a.clone();
      g.userData = { ...this.userData };
      return g;
    }
    applyMatrix4(mat4) {
      const p = this.attributes.position;
      if (p) {
        const tx = mat4.tx || 0, ty = mat4.ty || 0, tz = mat4.tz || 0;
        const sx = mat4.sx || 1, sy = mat4.sy || 1, sz = mat4.sz || 1;
        for (let i = 0; i < p.array.length; i += 3) {
          p.array[i] = p.array[i] * sx + tx;
          p.array[i + 1] = p.array[i + 1] * sy + ty;
          p.array[i + 2] = p.array[i + 2] * sz + tz;
        }
      }
      return this;
    }
    computeVertexNormals() {
      if (!this.attributes.normal && this.attributes.position) {
        this.attributes.normal = new BufferAttribute(new Float32Array(this.attributes.position.array.length), 3);
      }
      return this;
    }
    dispose() {}
  }
  class SphereGeoMerged extends BufferGeometry {
    constructor(r = 1) {
      super();
      this.setAttribute('position', new BufferAttribute(new Float32Array([0, r, 0, r, 0, 0, 0, 0, r]), 3));
      this.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 1, 0, 0, 0, 0, 1]), 3));
      this.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    }
    translate() { return this; }
    rotateX() { return this; }
    rotateY() { return this; }
    rotateZ() { return this; }
    scale() { return this; }
  }
  THREE.Vector3 = class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
  };
  THREE.Euler = class {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  };
  THREE.Quaternion = class { setFromEuler() { return this; } };
  THREE.Matrix4 = class {
    compose(pos, _quat, scl) {
      this.tx = pos.x; this.ty = pos.y; this.tz = pos.z;
      this.sx = scl.x; this.sy = scl.y; this.sz = scl.z;
      return this;
    }
  };
  THREE.BufferAttribute = BufferAttribute;
  THREE.BufferGeometry = BufferGeometry;
  THREE.SphereGeometry = SphereGeoMerged;
  const sandbox = {
    THREE,
    Math,
    Map,
    Set,
    Float32Array,
    Textures: { sets: {} },
    Shaders: {
      createGlowSprite: () => new THREE.Sprite(),
      createJellyMaterial: () => new THREE.MeshStandardMaterial({ transparent: true }),
    },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Models = Models;', sandbox);
  const M = sandbox.__Models;
  const j = M.makeCritter({ name: 'Moon Jelly', plan: 'jelly', color: 0x8fbdf7, aquatic: true }, 1);
  const bellMeshes = j.userData.bell.children.filter((o) => o instanceof THREE.Mesh);
  const lobesMesh = bellMeshes.find((m) => m.geometry && m.geometry.attributes && m.geometry.attributes.position && m.geometry.attributes.position.count === 24);
  assert.ok(lobesMesh, 'mergeGeo must combine all 8 rim lobes (8 * 3 = 24 verts) into a single merged BufferGeometry');
  // Verify vertices were translated radially around the bell center (~radius 0.41), not left at origin
  let maxR = 0;
  const arr = lobesMesh.geometry.attributes.position.array;
  for (let i = 0; i < arr.length; i += 3) {
    maxR = Math.max(maxR, Math.hypot(arr[i], arr[i + 2]));
  }
  assert.ok(maxR > 0.35 && maxR < 0.65, `Merged jelly rim lobes should sit at radial bell perimeter (~0.41), got maxR=${maxR}`);
});

test('makeGloom(tierDef) preserves classic Tier 1 and scales higher-tier shadow fallbacks cleanly', () => {
  const { Models: M, THREE } = loadModels();

  const classic0 = M.makeGloom();
  const classic1 = M.makeGloom({ key: 'classic', tier: 1 });
  assert.ok(classic0.userData.body && classic0.userData.halo && classic0.userData.eyeMat);
  assert.equal(classic0.userData.wisps.length, 3, '0-arg makeGloom must produce exact 3 classic wisps');
  assert.equal(classic0.userData.tierKey, 'classic');
  assert.equal(classic1.userData.wisps.length, 3, 'Tier 1 classic makeGloom must produce 3 wisps');
  assert.equal(classic1.userData.tierKey, 'classic');
  assert.notEqual(classic0.userData.eyeMat, classic1.userData.eyeMat, 'Classic Gloomblobs must own distinct eyeMat instances');
  assert.equal(classic0.userData.halo.castShadow, false);

  const knight = M.makeGloom({
    key: 'knight',
    tier: 3,
    fallbackScale: 1.45,
    eyeColor: 0xff3b52,
    haloColor: 0x7a163d,
  });
  assert.equal(knight.userData.tierKey, 'knight');
  assert.ok(knight.userData.wisps.length >= 4, `Tier 3 knight fallback must have >= 4 wisps, got ${knight.userData.wisps.length}`);
  assert.ok(knight.userData.body && knight.userData.halo && knight.userData.eyeMat);

  const behemothA = M.makeGloom({
    key: 'behemoth',
    tier: 4,
    fallbackScale: 1.85,
    eyeColor: 0xff2848,
    haloColor: 0x92184a,
  });
  const behemothB = M.makeGloom({
    key: 'behemoth',
    tier: 4,
    fallbackScale: 1.85,
    eyeColor: 0xff2848,
    haloColor: 0x92184a,
  });
  assert.equal(behemothA.userData.tierKey, 'behemoth');
  assert.ok(behemothA.userData.wisps.length >= 4, `Tier 4 behemoth fallback must have >= 4 wisps, got ${behemothA.userData.wisps.length}`);
  assert.notEqual(behemothA.userData.eyeMat, behemothB.userData.eyeMat, 'Higher-tier Gloom fallbacks must own distinct eyeMat instances');
  assert.equal(behemothA.userData.eyeMat.color?.c ?? behemothA.userData.eyeMat.color, 0xff2848, 'Higher-tier Gloom fallback eyeMat must use tierDef.eyeColor');
  assert.ok(behemothA.userData.fallbackRoot instanceof THREE.Group, 'Higher-tier fallback should wrap visual silhouette cleanly in fallbackRoot');
  assert.ok(Math.abs(behemothA.userData.fallbackRoot.scale.x - 1.85) < 1e-6, 'Behemoth fallbackRoot must scale by fallbackScale 1.85');
  assert.equal(behemothA.userData.halo.castShadow, false);
});

test('Shadow attachment & telegraph factories return named Groups, cache geometries, and handle absent/present RingGeometry', () => {
  const { Models: M, THREE } = loadModels();

  const expectedNames = [
    ['makeShadowBlade', 'ShadowBlade'],
    ['makeDreadCrown', 'DreadCrown'],
    ['makeBehemothSpines', 'BehemothSpines'],
    ['makeTelegraphRing', 'TelegraphRing'],
  ];

  for (const [fnName, groupName] of expectedNames) {
    assert.equal(typeof M[fnName], 'function', `Models.${fnName} must be exported`);
    const g1 = M[fnName]();
    const g2 = M[fnName]();
    assert.ok(g1 instanceof THREE.Group, `${fnName} must return a THREE.Group`);
    assert.equal(g1.name, groupName, `${fnName} group.name must be ${groupName}`);
    assert.ok(g1.children.length >= 2, `${fnName} must have at least 2 children`);

    const m1 = collectDescendants(g1).filter((o) => o instanceof THREE.Mesh);
    const m2 = collectDescendants(g2).filter((o) => o instanceof THREE.Mesh);
    assert.ok(m1.length >= 2, `${fnName} must contain at least 2 Meshes`);
    assert.equal(m1.length, m2.length, `${fnName} mesh count must be deterministic`);
    assert.ok(m1.every((m, idx) => m.geometry === m2[idx].geometry), `${fnName} must reuse cached geometry across calls`);
    if (fnName !== 'makeTelegraphRing') {
      assert.ok(m1.every((m, idx) => m.material === m2[idx].material), `${fnName} must reuse cached material across calls`);
    }
    for (const sp of collectDescendants(g1).filter((o) => o instanceof THREE.Sprite)) {
      assert.equal(sp.castShadow, false, `${fnName} glow sprite must not cast shadow`);
    }
  }

  // makeTelegraphRing with absent THREE.RingGeometry (default mock)
  const r1 = M.makeTelegraphRing();
  const r2 = M.makeTelegraphRing();
  assert.ok(r1.userData.outerRing && r1.userData.innerDisc && r1.userData.outerMat && r1.userData.innerMat);
  assert.notEqual(r1.userData.outerMat, r2.userData.outerMat, 'Each pooled TelegraphRing must own mutable outerMat');
  assert.notEqual(r1.userData.innerMat, r2.userData.innerMat, 'Each pooled TelegraphRing must own mutable innerMat');
  assert.ok(Math.abs(r1.userData.outerRing.rotation.x + Math.PI / 2) < 1e-6, 'outerRing must lie flat in XZ');
  assert.ok(Math.abs(r1.userData.innerDisc.rotation.x + Math.PI / 2) < 1e-6, 'innerDisc must lie flat in XZ');
  assert.equal(r1.userData.outerRing.castShadow, false);
  assert.equal(r1.userData.innerDisc.castShadow, false);
  assert.equal(r1.userData.outerMat.transparent, true);
  assert.equal(r1.userData.outerMat.depthWrite, false);
  assert.equal(r1.userData.outerMat.side, THREE.DoubleSide);
  assert.equal(r1.userData.outerMat.blending, THREE.AdditiveBlending);

  // makeTelegraphRing when THREE.RingGeometry IS available
  const code = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const THREEWithRing = makeMockTHREE();
  THREEWithRing.RingGeometry = class {
    constructor(innerR, outerR, segs) {
      this.kind = 'ring';
      this.args = [innerR, outerR, segs];
    }
  };
  const sandbox = {
    THREE: THREEWithRing,
    Math,
    Map,
    Set,
    Textures: { sets: {} },
    Shaders: { createGlowSprite: () => new THREEWithRing.Sprite() },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Models = Models;', sandbox);
  const rReal = sandbox.__Models.makeTelegraphRing();
  assert.equal(rReal.userData.outerRing.geometry.kind, 'ring', 'Should use RingGeometry when available');
  assert.equal(rReal.userData.innerDisc.geometry.kind, 'ring', 'Should use RingGeometry for innerDisc when available');
});
