# Blobby Worlds: The Starkeeper — Stylized PBR, Grounded Physics & 60 FPS Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade *Blobby Worlds: The Starkeeper* to higher-fidelity stylized PBR visuals, original heroic celestial-stargazer character & wildlife models, grounded Ocarina-of-Time-inspired physics (prop collisions, slope sliding, coyote/buffered jumps, dodge-roll, Z-targeting, buoyant splashing water, hill-aware camera), and locked 60 FPS single-pass native MSAA performance.

**Architecture:** Modular zero-build pure-browser engine loaded via ordered `<script>` tags in `index.html` using Three.js r128 from CDN (`audio.js` → `textures.js` → `shaders.js` → `world.js` → `models.js` → `physics.js` → `game.js`). Single-pass forward PBR (`ACESFilmicToneMapping`, `sRGBEncoding`, `PCFSoftShadowMap`, `PMREMGenerator` sky IBL, additive glow sprites) combined with zero-GC terrain math, chunked spatial colliders, shared species assets, and a pooled instanced particle system.

**Tech Stack:** Vanilla ES2020 JavaScript (classic browser scripts with UMD/Node test guards), Three.js r128 CDN, WebGL/GLSL shaders, HTML5 Canvas 2D procedural PBR generator, Web Audio API, Node.js built-in test runner (`node --test`), Chrome DevTools MCP for live WebGL/FPS/visual verification.

## Global Constraints

- **Zero-Build Pure Browser:** Must open and run directly via `file://` or any static HTTP server — no bundler, no `npm install`, no `<script type="module">` (uses classic `<script>` tags and Three.js r128 CDN).
- **Zero External Assets:** All PBR albedo/normal/roughness maps, glow sprites, geometry, and audio are procedurally generated in JS.
- **Single-Pass MSAA (Approach C):** No offscreen bloom render-target pass; keep native hardware `antialias: true`, `ACESFilmicToneMapping`, `sRGBEncoding`, `PMREMGenerator` sky reflections, and additive glow sprites.
- **Original Starkeeper Identity:** Heroic ~2.1u athletic human stargazer (midnight-indigo & sea-teal layered coat with gold trim, leather baldric/satchel/compass, human ears, tousled dark-chestnut hair, wide-brimmed astronomer hat with perched star, 3-segment crimson cloak, Star-Lantern Staff). Wish remains a luminous golden songbird; Star Totems are ancient celestial observatory monoliths.
- **Preserve Gameplay & Harness:** Keep all 10 `LAND` & 4 `AQUA` species, 8 named constellations, endless quest loop, first/third-person toggle (`V`), and `index.html#test` fast-boot hook. Fix `they\'ll` typo in `index.html`.
- **No Git Repository Yet:** Workspace `/Users/spencergraham/desktop/other/games` is not git-initialized; do not run `git commit` commands. Every task finishes with `node --check` + `node --test` verification.

---

### Task 1: Expanded Procedural Audio (`audio.js`)

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/audio.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/audio.test.mjs`

**Interfaces:**
- Consumes: Browser `AudioContext` / `webkitAudioContext` (optional; gracefully no-ops when absent or muted).
- Produces: Global `Sound` object with existing methods (`start()`, `toggle()`, `setMuffled(under)`, `shoot()`, `sparkle()`, `poof()`, `chime()`, `steal()`, `fanfare()`) plus new methods:
  - `step(surface)` where `surface` is `'grass' | 'sand' | 'stone' | 'snow' | 'water'`
  - `land(intensity)` where `intensity` is `0..1`
  - `splash(intensity)` where `intensity` is `0..1`
  - `roll()`
  - `lockOn(locked)` where `locked` is boolean

- [ ] **Step 1: Write the failing unit test**

Create `/Users/spencergraham/desktop/other/games/tests/audio.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadAudio(mockCtx) {
  const code = fs.readFileSync(new URL('../audio.js', import.meta.url), 'utf8');
  const sandbox = {
    window: mockCtx ? { AudioContext: function () { return mockCtx; } } : {},
    setInterval: () => 0,
    setTimeout: () => 0,
    Math,
  };
  vm.runInNewContext(code + '\nthis.__Sound = Sound;', sandbox);
  return sandbox.__Sound;
}

function makeMockAudioContext() {
  const calls = [];
  const makeParam = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });
  return {
    calls,
    currentTime: 1.0,
    sampleRate: 44100,
    destination: { id: 'dest' },
    resume: () => {},
    createGain: () => ({ gain: makeParam(), connect: () => {} }),
    createBiquadFilter: () => {
      const f = { type: 'lowpass', frequency: makeParam(), Q: makeParam(), connect: () => {} };
      calls.push(['filter', f]);
      return f;
    },
    createOscillator: () => {
      const o = { type: 'sine', frequency: makeParam(), detune: makeParam(), connect: () => {}, start: () => {}, stop: () => {} };
      calls.push(['osc', o]);
      return o;
    },
    createBuffer: (ch, len, sr) => {
      const data = new Float32Array(len);
      calls.push(['buffer', len]);
      return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => data };
    },
    createBufferSource: () => {
      const s = { buffer: null, connect: () => {}, start: () => {}, stop: () => {} };
      calls.push(['noise', s]);
      return s;
    },
  };
}

test('Sound exposes step, land, splash, roll, lockOn and reuses noise buffer', () => {
  const ctx = makeMockAudioContext();
  const Sound = loadAudio(ctx);
  // Safe before start()
  assert.doesNotThrow(() => {
    Sound.step('grass');
    Sound.land(0.7);
    Sound.splash(0.8);
    Sound.roll();
    Sound.lockOn(true);
  });

  Sound.start();
  const before = ctx.calls.length;
  Sound.step('grass');
  Sound.step('stone');
  Sound.step('sand');
  Sound.step('snow');
  Sound.step('water');
  Sound.land(0.8);
  Sound.splash(0.9);
  Sound.roll();
  Sound.lockOn(true);
  Sound.lockOn(false);

  const added = ctx.calls.slice(before);
  const bufferCreates = added.filter(([k]) => k === 'buffer').length;
  const noisePlays = added.filter(([k]) => k === 'noise').length;
  const oscPlays = added.filter(([k]) => k === 'osc').length;

  assert.equal(bufferCreates, 1, 'noise buffer should be created once and cached');
  assert.ok(noisePlays >= 7, 'step/land/splash/roll should trigger filtered noise');
  assert.ok(oscPlays >= 4, 'lockOn and land should trigger tonal oscillators');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.mjs`
Expected: FAIL (`Sound.step is not a function`).

- [ ] **Step 3: Implement cached noise buffer and new SFX in `audio.js`**

Modify `/Users/spencergraham/desktop/other/games/audio.js` to add `noiseBuf: null`, `getNoiseBuffer()`, `noiseBurst(freq, q, filterType, duration, volume, delay = 0)`, and the 5 new SFX methods (`step`, `land`, `splash`, `roll`, `lockOn`):

```javascript
  noiseBuf: null,

  getNoiseBuffer() {
    if (this.noiseBuf || !this.ctx) return this.noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  },

  noiseBurst(freq, q, filterType, duration, volume, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.03);
  },

  step(surface = 'grass') {
    if (!this.ctx || this.muted) return;
    const jitter = 0.9 + Math.random() * 0.2;
    if (surface === 'stone') {
      this.noiseBurst(1600 * jitter, 2.2, 'bandpass', 0.055, 0.045);
      this.bling(190 * jitter, this.ctx.currentTime, 0.025, 0.05, 'triangle');
    } else if (surface === 'sand' || surface === 'snow') {
      this.noiseBurst(950 * jitter, 1.0, 'bandpass', 0.085, 0.035);
    } else if (surface === 'water') {
      this.noiseBurst(1250 * jitter, 1.4, 'bandpass', 0.14, 0.055);
    } else {
      this.noiseBurst(680 * jitter, 1.1, 'bandpass', 0.065, 0.032);
    }
  },

  land(intensity = 0.5) {
    if (!this.ctx || this.muted) return;
    const k = Math.max(0.2, Math.min(1, intensity));
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09 * k, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
    this.noiseBurst(520, 0.9, 'lowpass', 0.12, 0.06 * k);
  },

  splash(intensity = 0.6) {
    if (!this.ctx || this.muted) return;
    const k = Math.max(0.2, Math.min(1, intensity));
    this.noiseBurst(1400, 0.8, 'bandpass', 0.26, 0.085 * k);
    this.noiseBurst(650, 0.7, 'lowpass', 0.32, 0.07 * k, 0.04);
  },

  roll() {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(420, 0.9, 'bandpass', 0.22, 0.07);
    this.noiseBurst(780, 1.2, 'bandpass', 0.16, 0.04, 0.08);
  },

  lockOn(locked) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (locked) {
      this.bling(880, t, 0.055, 0.09, 'triangle');
      this.bling(1318.5, t + 0.05, 0.06, 0.14, 'sine');
    } else {
      this.bling(784, t, 0.04, 0.1, 'triangle');
      this.bling(523.25, t + 0.045, 0.04, 0.12, 'sine');
    }
  },
```

- [ ] **Step 4: Run syntax check and unit test**

Run: `node --check audio.js && node --test tests/audio.test.mjs`
Expected: PASS (0 failures).

---

### Task 2: Procedural PBR Texture Synthesizer & Sky IBL (`textures.js`)

**Files:**
- Create: `/Users/spencergraham/desktop/other/games/textures.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/textures.test.mjs`

**Interfaces:**
- Consumes: `THREE` (when running in browser for `CanvasTexture`, `DataTexture`, `PMREMGenerator`).
- Produces: Global `Textures` object:
  - `Textures.init(renderer)` — populates `Textures.sets` (`grass`, `forest`, `sand`, `snow`, `rock`, `bark`, `leaves`, `stone`, `cloth`, `leather`, `fur`, `waterNormal`), each having `{ map, normalMap, roughnessMap }` (or `{ normalMap }` for `waterNormal`), plus `Textures.glowSprite` and `Textures.sparkleSprite`.
  - `Textures.updateEnvMap(renderer, scene, topColor, botColor, sunDir, progress)` — generates and assigns `scene.environment` using a cached `THREE.PMREMGenerator`, disposing the previous render target safely.
  - Pure math exports testable without DOM: `Textures._periodicNoise2(x, y, period, seed)`, `Textures._periodicFbm(x, y, period, octaves, seed)`, `Textures._heightToNormalPixels(heights, size, strength)`.

- [ ] **Step 1: Write the failing unit test**

Create `/Users/spencergraham/desktop/other/games/tests/textures.test.mjs`:

```javascript
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
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/textures.test.mjs`
Expected: FAIL (`ENOENT: no such file or directory, open '.../textures.js'`).

- [ ] **Step 3: Implement `textures.js`**

Create `/Users/spencergraham/desktop/other/games/textures.js` with:
- Fast deterministic periodic 2D hash/noise/FBM (`_periodicNoise2`, `_periodicFbm`, `_worleyPeriodic`) so every 256×256 tile wraps with zero seams.
- `_heightToNormalPixels(heights, size, strength)` computing wrapping Sobel gradients `(dx, dy)` and encoding tangent-space `(nx, ny, nz)` into RGBA bytes.
- Canvas builders for all 12 material sets (`grass`, `forest`, `sand`, `snow`, `rock`, `bark`, `leaves`, `stone`, `cloth`, `leather`, `fur`, `waterNormal`):
  - `grass`: lush layered meadow blades + soil micro-flecks, roughness 0.78–0.95.
  - `forest`: rich mossy clover/pine-needle floor, roughness 0.8–0.96.
  - `sand`: directional wind-rippled dunes + sparkling quartz grains, roughness 0.65–0.9.
  - `snow`: soft drifts + subtle glint crystals, roughness 0.55–0.82.
  - `rock`: stratified sedimentary cracks + faceted boulder crevices, roughness 0.68–0.92.
  - `bark`: vertical gnarled bark furrows & warm crevices, roughness 0.82–0.98.
  - `leaves`: overlapping organic leaf clusters with highlight/shadow depth, roughness 0.65–0.88.
  - `stone`: weathered ancient masonry blocks + fine chiselled star-chart lines, roughness 0.72–0.92.
  - `cloth`: fine cross-hatch woven traveler fabric, roughness 0.75–0.92.
  - `leather`: organic pebble grain & warm patina, roughness 0.48–0.72.
  - `fur`: directional soft fur/feather brushstrokes, roughness 0.65–0.88.
  - `waterNormal`: multi-octave periodic wave ripples normal map (`RepeatWrapping`).
- Radial `glowSprite` (smooth Gaussian falloff) and `sparkleSprite` (4-point star flare + core glow) canvas textures.
- `updateEnvMap(renderer, scene, topColor, botColor, sunDir, progress)`: lazily creates a `THREE.PMREMGenerator(renderer)` and an offscreen `THREE.Scene` containing a gradient dome + glowing sun disc; compiles a PMREM cube target, disposes any previous `envRT`, and assigns `scene.environment = envRT.texture`.

- [ ] **Step 4: Run syntax check and unit test**

Run: `node --check textures.js && node --test tests/textures.test.mjs`
Expected: PASS (0 failures).

---

### Task 3: Stylized PBR Shaders — Terrain, Water, Wind Grass & Atmospheric Sky (`shaders.js`)

**Files:**
- Create: `/Users/spencergraham/desktop/other/games/shaders.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/shaders.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `Textures.sets`, `Textures.glowSprite`, `Textures.sparkleSprite`.
- Produces: Global `Shaders` object:
  - `Shaders.uniforms` — shared uniform objects updated once per frame (`uTime`, `uWaterY`, `uPlayerPos`, `uCamPos`, `uSunDir`, `uSunColor`, `uSkyTop`, `uSkyMid`, `uSkyBot`, `uProgress`, `uFogColor`, `uFogNear`, `uFogFar`).
  - `Shaders.waterHeightAt(x, z, time)` — returns exact wave Y (`WATER_Y + 3-wave sum`), matching water vertex GLSL.
  - `Shaders.createTerrainMaterial(textures)` — `MeshStandardMaterial` patched via `onBeforeCompile` for world-space dual-scale detail texture, slope-based cliff rock blending, and animated shallow underwater caustics.
  - `Shaders.createWaterMaterial(textures)` — custom `ShaderMaterial` using `aBedHeight` vertex attribute for wave displacement, dual-scrolling normal ripples, Fresnel sky reflection, sun specular sparkle, depth color absorption, and animated shoreline foam.
  - `Shaders.createHorizonWaterMaterial()` — lightweight distant ocean skirt material matching fog & horizon reflection.
  - `Shaders.createGrassMaterial(textures)` — `MeshStandardMaterial` patched via `onBeforeCompile` for instanced wind sway, player-trample bending (`uPlayerPos`), and distance fade (`48..68`).
  - `Shaders.createKelpMaterial()` — `MeshStandardMaterial` patched for gentle underwater ribbon sway.
  - `Shaders.createSkyDome()` — returns `{ mesh, material }` for atmospheric Rayleigh/Mie twilight-to-day sky with sun/moon disc and drifting 2-layer FBM clouds.
  - `Shaders.createGlowSprite(color, size, opacity, sparkle = false)` — additive halo billboard sprite.
  - `Shaders.update(time, playerPos, camPos, sunDir, progress, skyTop, skyMid, skyBot, fogColor, fogNear, fogFar)`.

- [ ] **Step 1: Write the failing unit test**

Create `/Users/spencergraham/desktop/other/games/tests/shaders.test.mjs`:

```javascript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shaders.test.mjs`
Expected: FAIL (`ENOENT: no such file or directory, open '.../shaders.js'`).

- [ ] **Step 3: Implement `shaders.js`**

Create `/Users/spencergraham/desktop/other/games/shaders.js`:
- Exact synchronized wave math in JS and GLSL:
  ```js
  function waterHeightAt(x, z, time) {
    return (
      Math.sin(x * 0.21 + z * 0.09 + time * 1.45) * 0.065 +
      Math.cos(x * 0.11 - z * 0.24 + time * 1.15) * 0.045 +
      Math.sin((x + z) * 0.36 - time * 1.9) * 0.022
    );
  }
  ```
- Terrain `onBeforeCompile` hooks verified against Three.js r128 `MeshStandardMaterial` shader chunks:
  - Vertex: declares `varying vec3 vWorldPos; varying vec3 vWorldNorm;`, computes both in `#include <worldpos_vertex>` using `modelMatrix` (note: terrain chunks have identity rotation/scale, so `mat3(modelMatrix) * objectNormal` is exact world normal).
  - Fragment: declares `uTime`, `uWaterY`, `uSunDir`, `uDetailMap`, `uRockMap`, `uRockNormal`, `vWorldPos`, `vWorldNorm`.
  - In `#include <color_fragment>`: samples world-space detail albedo at two frequencies (`vWorldPos.xz * 0.14` and `* 0.037`) to enrich biome vertex colors; computes `slope = 1.0 - clamp(vWorldNorm.y, 0.0, 1.0)` and blends stratified cliff rock (`smoothstep(0.18, 0.42, slope)`) cleanly onto steep hills/cliffs; below `uWaterY`, adds animated sunlit Voronoi/trig caustics fading smoothly with depth (`exp(-depth * 0.24)`).
  - In `#include <roughnessmap_fragment>`: adjusts roughness smoothly for damp shoreline (`abs(vWorldPos.y - uWaterY) < 0.7` becomes glistening wet sand/rock with roughness ~0.32) and rocky cliffs (~0.76).
- Water `ShaderMaterial` (`transparent: true, side: THREE.DoubleSide, depthWrite: false` for clean alpha blending over seabed):
  - Vertex displaces Y by exact matching 3-wave formula, passes `vWorldPos`, `vDepth = worldY - aBedHeight`, `vWaveNormal`.
  - Fragment scrolls `uWaterNormal` in two opposing directions, perturbs normal, computes Fresnel (`pow(1.0 - max(dot(N, V), 0.0), 3.4)`), mixes shallow emerald-turquoise (`vec3(0.12, 0.56, 0.62)`) to deep ocean indigo (`vec3(0.04, 0.18, 0.32)`) by depth, blends sky zenith/horizon reflection + tight sun specular glints, adds animated frothy shoreline foam where `vDepth < 0.85` (modulated by noise & wave phase), and applies matching linear scene fog so water melts into the horizon seamlessly!
- Grass `onBeforeCompile` on `MeshStandardMaterial` (`side: THREE.DoubleSide`, `vertexColors: true`, `roughness: 0.82`):
  - Uses `instanceMatrix` world position to compute height-weighted wind sway (`uv.y * uv.y`), radial trample push away from `uPlayerPos` within 1.45 units, and smooth scale-to-zero distance fade between 48–68 units from `uCamPos`!
- Sky Dome `ShaderMaterial` (`side: THREE.BackSide, depthWrite: false, fog: false`):
  - Zenith / mid-sky / horizon scatter gradient + glowing sun/moon disc aligned with `uSunDir` + Mie horizon scatter halo + 2-octave drifting FBM clouds lit warmly on sun-facing edges.

- [ ] **Step 4: Run syntax check and unit test**

Run: `node --check shaders.js && node --test tests/shaders.test.mjs`
Expected: PASS (0 failures).

---

### Task 4: Zero-GC Terrain, Sculpted Chunk Streamer, Water Tiles & Spatial Colliders (`world.js`)

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/world.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/world-math.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `Textures`, `Shaders`, `Sound` (optional).
- Produces: Global world API:
  - Constants: `WATER_Y = 0`, `CHUNK = 32`, `VIEW_RADIUS = 3`, `DAY_SKY_MAX_LIT = 8`.
  - Scene/renderer: `scene`, `camera`, `renderer`, `sun`, `hemiLight`.
  - Zero-GC math: `hash2(x, z)`, `noise2(x, z)`, `smoothstep(edge0, edge1, t)`, `heightAt(x, z)`, `terrainNormalAt(x, z, out)`, `climateAt(x, z, out)`, `surfaceAt(x, z)`, `terrainColor(x, z, h, out)`.
  - Spatial colliders: `getNearbyColliders(x, z, radius, out)`, `setTotemCollider(x, z, r)`, `clearTotemCollider()`.
  - Streaming & quality: `updateChunks(px, pz)`, `setQuality(mode)`, `getQuality()`.
  - Environment & sky: `setSkyProgress(lit)`, `updateEnvironment(camY, px, pz, time, dt)`, `addConstellation(name)`, `constellationNameFor(n)`.
  - Spawners: `landSpot(px, pz, minD, maxD, minH)`, `waterSpot(px, pz, minD, maxD)`.

- [ ] **Step 1: Write the failing unit test**

Create `/Users/spencergraham/desktop/other/games/tests/world-math.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadWorldMath() {
  const code = fs.readFileSync(new URL('../world.js', import.meta.url), 'utf8');
  const sandbox = { Math, Map, Set, Array, Float32Array, Uint16Array, console, __WORLD_MATH_ONLY__: true };
  vm.runInNewContext(code + '\nthis.__W = { heightAt, terrainNormalAt, climateAt, surfaceAt, WATER_Y, CHUNK };', sandbox);
  return sandbox.__W;
}

test('heightAt is deterministic and terrainNormalAt matches finite differences', () => {
  const W = loadWorldMath();
  const pts = [[0, 0], [18.5, -42.3], [120, 85], [-77, 31]];
  for (const [x, z] of pts) {
    const h1 = W.heightAt(x, z);
    const h2 = W.heightAt(x, z);
    assert.equal(h1, h2);
    const n = W.terrainNormalAt(x, z, { x: 0, y: 0, z: 0 });
    const len = Math.hypot(n.x, n.y, n.z);
    assert.ok(Math.abs(len - 1) < 1e-5, `Normal length ${len}`);
    assert.ok(n.y > 0, 'Terrain normal must point upward');
  }
});

test('climateAt weights are non-negative and sum to ~1', () => {
  const W = loadWorldMath();
  const out = { desert: 0, snow: 0, forest: 0, meadow: 0 };
  for (let x = -200; x <= 200; x += 47) {
    for (let z = -200; z <= 200; z += 53) {
      W.climateAt(x, z, out);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/world-math.test.mjs`
Expected: FAIL (`THREE is not defined` — `world.js` currently doesn't separate pure math from Three.js scene boot or expose `terrainNormalAt`/`surfaceAt`).

- [ ] **Step 3: Upgrade `world.js`**

Rewrite `/Users/spencergraham/desktop/other/games/world.js` cleanly with:
1. Top pure-math section (`hash2`, `noise2`, `smoothstep`, `heightAt`, `terrainNormalAt`, `climateAt`, `surfaceAt`) with **zero `Map`/string caches** and optional `out` objects for zero GC. Guard the Three.js scene initialization below with `if (typeof __WORLD_MATH_ONLY__ === 'undefined')` so pure math tests run in Node without a WebGL context!
2. Renderer & lighting setup:
   - `antialias: true`, `powerPreference: 'high-performance'`, `outputEncoding = THREE.sRGBEncoding`, `toneMapping = THREE.ACESFilmicToneMapping`, `toneMappingExposure = 1.08`.
   - `shadowMap.enabled = true`, `shadowMap.type = THREE.PCFSoftShadowMap`.
   - `Textures.init(renderer)` called once right after renderer creation!
   - Directional `sun` casting soft shadows (`shadow.mapSize = 2048` on `'high'`, `1024` on `'balanced'`, `shadow.bias = -0.0004`, `shadow.normalBias = 0.04`, frustum `±36`), plus `hemiLight` and `sun.target` added to scene.
   - `Textures.updateEnvMap(renderer, scene, ...)` invoked initially and whenever `setSkyProgress(lit)` advances!
3. Sculpted shared prop geometries (built once):
   - Tapered flared oak/pine bark trunk (`CylinderGeometry` with root-flare vertex deformation), sculpted 3-cluster oak canopy, 3-tier scalloped pine boughs (green + snow-capped), ribbed cactus column + side arms, displaced faceted mossy boulder, ancient standing rune-stone pillar, and 3-blade curved grass tuft + wildflower petal cluster geometry, plus multi-segment kelp ribbon geometry.
4. Per-chunk builder (`buildChunk(cx, cz)`):
   - Smooth terrain mesh (`RES = 36`, `receiveShadow = true`, analytical `terrainNormalAt`, rich biome vertex colors).
   - Per-chunk `16×16` subdivided water tile (only if chunk min height `< WATER_Y + 1.0`) with baked `aBedHeight` vertex attribute using `Shaders.createWaterMaterial(Textures)`.
   - Instanced sculpted props (`castShadow = true`, `receiveShadow = true`) with per-instance color variation AND `colliders.push({ x, z, r })` for every tree trunk, boulder, cactus, and standing stone!
   - Instanced grass tufts (`~480` on High / `~240` on Balanced) and wildflowers (`~65` / `~32`) placed on dry land (`h > WATER_Y + 1.1`, `normal.y > 0.82`) tinted by underlying `terrainColor`.
   - Stores `{ meshes, colliders, cx, cz }` in `chunks` Map and disposes chunk-owned geometries/instanced matrices cleanly on unload!
5. Far horizon ocean ring (4 large strips outside `VIEW_RADIUS * CHUNK`) following player so the sea reaches seamlessly to the horizon fog.
6. `getNearbyColliders(x, z, radius, out)` scanning only the overlapping chunks + active `totemCollider`, writing into `out` array with zero garbage allocation.
7. `updateEnvironment(camY, px, pz, time, dt)`:
   - Updates sky dome, constellations, horizon ocean skirt, sun & texel-snapped shadow camera (`snap = 72 / shadowMapSize`), `Shaders.update(...)`, and underwater/above-water fog & `Sound.setMuffled`.
8. `setQuality(mode)` (`'high' | 'balanced'`): updates `pixelRatio`, `sun.shadow.mapSize` (disposing old shadow map cleanly so Three.js reallocates), and clears/re-streams chunk grass smoothly on the next frames.

- [ ] **Step 4: Run syntax check and unit test**

Run: `node --check world.js && node --test tests/world-math.test.mjs`
Expected: PASS (0 failures).

---

### Task 5: Heroic Starkeeper, Wish, Fantasy Wildlife & Shadow Monsters (`models.js`)

**Files:**
- Create: `/Users/spencergraham/desktop/other/games/models.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/models.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `Textures`, `Shaders`.
- Produces: Global `Models` object:
  - `Models.makePlayer()` — heroic ~2.1u original Starkeeper rig with `userData: { pelvis, torso, headGroup, thighL, thighR, kneeL, kneeR, ankleL, ankleR, armL, armR, elbowL, elbowR, staffPivot, staffHalo, capeSegs }`.
  - `Models.makeWish()` — luminous golden songbird companion with `userData: { wings, tail, head, halo }`.
  - `Models.makeCritter(sp, scale)` — upgraded fantasy wildlife for all 7 plans (`quad`, `bird`, `bug`, `lizard`, `fish`, `jelly`, `eel`) with cached per-species PBR materials.
  - `Models.animateCritter(mesh, t, active)` — drives limbs, wings, tails, antennae, tentacles, bells, and eel segments.
  - `Models.makeGloom()` — horned shadow-beast with `userData: { body, wisps, halo, eyeMat }`.
  - `Models.makeCocoon()` — obsidian thorn-cocoon with pulsing starlight core (`userData: { core, halo }`).
  - `Models.makeTotem()` — ancient celestial observatory monolith with `userData: { crystal, ringA, ringB, halo, beam }`.
  - `Models.makeStarPickup()`, `Models.makePearlPickup()`, `Models.makeStarBolt()`.

- [ ] **Step 1: Write the failing unit test**

Create `/Users/spencergraham/desktop/other/games/tests/models.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeMockTHREE() {
  class Vec3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(s) { this.x = this.y = this.z = s; return this; } }
  class Obj {
    constructor() { this.children = []; this.position = new Vec3(); this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ' }; this.scale = new Vec3(1, 1, 1); this.userData = {}; this.castShadow = false; this.receiveShadow = false; }
    add(...items) { for (const c of items) { c.parent = this; this.children.push(c); } return this; }
    lookAt() {}
    rotateX() {}
  }
  class Geo { translate() { return this; } rotateX() { return this; } rotateY() { return this; } rotateZ() { return this; } scale() { return this; } computeVertexNormals() { return this; } }
  class Mat { constructor(p = {}) { Object.assign(this, p); } clone() { return new Mat({ ...this }); } }
  class Color { constructor(c) { this.c = c; } multiplyScalar() { return this; } lerp() { return this; } clone() { return new Color(this.c); } }
  return {
    Group: Obj,
    Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    PointLight: class extends Obj {},
    Sprite: class extends Obj {},
    Color,
    DoubleSide: 2,
    AdditiveBlending: 2,
    MeshStandardMaterial: Mat,
    MeshBasicMaterial: Mat,
    SphereGeometry: Geo,
    CylinderGeometry: Geo,
    ConeGeometry: Geo,
    BoxGeometry: Geo,
    TorusGeometry: Geo,
    OctahedronGeometry: Geo,
    IcosahedronGeometry: Geo,
    DodecahedronGeometry: Geo,
    PlaneGeometry: Geo,
  };
}

function loadModels() {
  const code = fs.readFileSync(new URL('../models.js', import.meta.url), 'utf8');
  const THREE = makeMockTHREE();
  const sandbox = {
    THREE,
    Math,
    Map,
    Textures: { sets: {} },
    Shaders: { createGlowSprite: () => new THREE.Sprite() },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Models = Models;', sandbox);
  return sandbox.__Models;
}

test('Starkeeper parents eyes and astronomer hat inside headGroup (no detached eyes)', () => {
  const M = loadModels();
  const p = M.makePlayer();
  assert.ok(p.userData.headGroup, 'headGroup must exist');
  assert.ok(p.userData.headGroup.children.length >= 8, 'headGroup should contain head, hair, ears, eyes, brows, and hat');
  assert.equal(p.userData.capeSegs.length, 3, 'cloak should have 3 articulated segments');
  assert.ok(p.userData.staffPivot, 'Star-Lantern Staff pivot must exist');
});

test('All 7 critter body plans build and share species materials cleanly', () => {
  const M = loadModels();
  const specs = [
    { name: 'Momo', plan: 'quad', body: 'round', color: 0x8fce6a, deco: 'ears' },
    { name: 'Bramble', plan: 'bug', color: 0xe2656a, deco: 'spots' },
    { name: 'Kiwi', plan: 'bird', color: 0xc9a86a, deco: 'crest', beak: 0.55 },
    { name: 'Ember', plan: 'lizard', color: 0xf78e5d, deco: 'fins' },
    { name: 'Fin', plan: 'fish', color: 0x6ad9d0, aquatic: true },
    { name: 'Bubbles', plan: 'jelly', color: 0x8fbdf7, aquatic: true },
    { name: 'Kelpy', plan: 'eel', color: 0x5ab86a, aquatic: true },
  ];
  for (const sp of specs) {
    const a = M.makeCritter(sp, 1);
    const b = M.makeCritter(sp, 0.8);
    assert.ok(a.children.length > 0, `Critter ${sp.name} empty`);
    assert.doesNotThrow(() => M.animateCritter(a, 1.5, true));
    assert.doesNotThrow(() => M.animateCritter(b, 1.5, false));
  }
  assert.ok(M.makeWish().userData.wings.length === 2);
  assert.ok(M.makeGloom().userData.wisps.length >= 2);
  assert.ok(M.makeCocoon().userData.core);
  assert.ok(M.makeTotem().userData.ringA && M.makeTotem().userData.ringB);
  assert.ok(M.makeStarPickup());
  assert.ok(M.makePearlPickup());
  assert.ok(M.makeStarBolt());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/models.test.mjs`
Expected: FAIL (`ENOENT: no such file or directory, open '.../models.js'`).

- [ ] **Step 3: Implement `models.js`**

Create `/Users/spencergraham/desktop/other/games/models.js` implementing:
- Lazy shared geometry & material caches using `Textures.sets` (`cloth`, `leather`, `fur`, `stone`, `bark`) with realistic roughness/metalness and `castShadow = true` / `receiveShadow = true` helpers.
- `makePlayer()` (~2.1u tall original celestial stargazer Starkeeper):
  - `pelvis` group (allows full somersault pitch during dodge-roll without messing up world-ground anchor!).
  - Articulated legs (thigh, knee, calf, cuffed leather boot with sole) in dark slate trousers + grained leather boots.
  - Sculpted `torso` group: layered midnight-indigo & sea-teal traveler coat, flared split coat-tails with gold constellation hem trim, crossed leather baldric with brass clasp, leather belt with gold buckle, left-hip leather satchel + brass compass charm.
  - `headGroup` mounted cleanly atop a neck cylinder: warm sculpted head, subtle nose, **human ears**, tousled dark-chestnut hair locks, expressive eyes (sclera, deep-blue iris, pupil, white specular catchlight, expressive eyebrows), and the signature **wide-brimmed stargazer hat** (curved wide brim, tilted conical astronomer crown, metallic brass hatband, hovering glowing star charm at the tip).
  - Articulated arms (coated upper sleeve, elbow, bracered forearm, gloved/wrapped hand) with the right hand holding the **Star-Lantern Staff** (`staffPivot`: carved dark-wood shaft, brass collar, twin crossed brass cage rings housing a glowing golden miniature star crystal + soft additive halo).
  - **3-segment hinged crimson-burgundy cloak** (`capeSegs = [seg0, seg1, seg2]`) with gold trim bar at the hem.
- `makeWish()`: sculpted golden songbird with curved crest, articulated dual-layered wings, streaming ribbon tail, tiny floating gold crown, and soft additive golden halo.
- All 7 wildlife body plans (`quad`, `bird`, `bug`, `lizard`, `fish`, `jelly`, `eel`) upgraded with multi-part proportions, catchlight eyes, textured PBR materials cached by species color, and expressive `animateCritter`.
- `makeGloom()`: crouched jagged obsidian-violet shadow-beast with hunched shoulder plates, curved twin shadow horns, glowing amber eyes under angular dark brows, orbiting floating shadow-shard wisps, and subtle dark mist glow.
- `makeCocoon()`: faceted dark-obsidian thorn shell enclosing a pulsing glowing golden starlight core & halo.
- `makeTotem()`: stepped ancient weathered stone base, tapered carved stone monolith with glowing golden star-chart bands, twin counter-rotating brass astrolabe rings around a faceted glowing crystal, soft additive halo, warm `PointLight`, and subtle skyward golden light beam.
- `makeStarPickup()` (crossed sculpted golden star crystal + sparkle halo), `makePearlPickup()` (iridescent mother-of-pearl + cool shimmer halo), `makeStarBolt()` (bright star crystal + additive flare).

- [ ] **Step 4: Run syntax check and unit test**

Run: `node --check models.js && node --test tests/models.test.mjs`
Expected: PASS (0 failures).

---

### Task 6: Grounded OoT Physics, Dodge-Roll, Z-Targeting & Hill-Aware Camera (`physics.js`)

**Files:**
- Create: `/Users/spencergraham/desktop/other/games/physics.js`
- Test: `/Users/spencergraham/desktop/other/games/tests/physics.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `heightAt`, `terrainNormalAt`, `surfaceAt`, `getNearbyColliders`, `WATER_Y`, `Shaders.waterHeightAt`, `Sound`, `camera`.
- Produces: Global `Physics` object:
  - `Physics.P` (player kinematics, animation & combat state)
  - `Physics.AIR_MAX` (`25`), `Physics.MAX_WALK_SLOPE_COS` (`Math.cos(42 * Math.PI / 180)`)
  - `Physics.lockTarget` (`null` or `{ kind, ref, mesh, yOffset }`)
  - `Physics.firstPerson` (boolean)
  - `Physics.init(domElement, callbacks)`
  - `Physics.resolveColliders(x, z, radius, colliders, out)`
  - `Physics.stepTerrainMove(x, z, dx, dz, onGround, heightFn, normalFn, out)`
  - `Physics.computeCameraDistance(focus, dir, desiredDist, heightFn)`
  - `Physics.toggleLockOn()` / `Physics.clearLockOn()` / `Physics.validateLockTarget()`
  - `Physics.triggerCastAnim()`
  - `Physics.updatePlayer(dt, time, player, lookCandidates)`
  - `Physics.getAimDirection(fromPos, out)`
  - `Physics.projectLockReticle(cam, viewW, viewH)`

- [ ] **Step 1: Write the failing unit test**

Create `/Users/spencergraham/desktop/other/games/tests/physics.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPhysics() {
  const code = fs.readFileSync(new URL('../physics.js', import.meta.url), 'utf8');
  const sandbox = {
    Math,
    performance: { now: () => 0 },
    WATER_Y: 0,
    Shaders: { waterHeightAt: () => 0 },
    THREE: {
      MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        smoothstep: (x, a, b) => {
          const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
          return t * t * (3 - 2 * t);
        },
      },
    },
    console,
  };
  vm.runInNewContext(code + '\nthis.__Physics = Physics;', sandbox);
  return sandbox.__Physics;
}

test('resolveColliders pushes entity smoothly outside solid tree/rock radii', () => {
  const Ph = loadPhysics();
  const colliders = [{ x: 5, z: 0, r: 1.0 }];
  const res = Ph.resolveColliders(4.4, 0.1, 0.42, colliders, { x: 0, z: 0, hit: false });
  assert.equal(res.hit, true);
  const dist = Math.hypot(res.x - 5, res.z - 0);
  assert.ok(dist >= 1.419, `Expected separation >= 1.42, got ${dist}`);
});

test('stepTerrainMove blocks walking up steep >=42 deg cliffs and produces downhill slide', () => {
  const Ph = loadPhysics();
  // 60-degree steep cliff climbing along +X: h(x) = tan(60 deg) * x = 1.732 * x
  const slope = Math.tan((60 * Math.PI) / 180);
  const heightFn = (x) => slope * x;
  const ny = Math.cos((60 * Math.PI) / 180);
  const nx = -Math.sin((60 * Math.PI) / 180);
  const normalFn = () => ({ x: nx, y: ny, z: 0 });

  const out = Ph.stepTerrainMove(0, 0, 0.5, 0, true, heightFn, normalFn, {});
  assert.ok(out.x <= 0.01, `Should block uphill climb on 60 deg cliff, moved to x=${out.x}`);
  assert.equal(out.sliding, true, 'Standing on 60 deg cliff should trigger sliding');
  assert.ok(out.slideVx < 0, 'Slide velocity should push downhill (-X)');
});

test('stepTerrainMove allows gentle 20 deg hills freely', () => {
  const Ph = loadPhysics();
  const slope = Math.tan((20 * Math.PI) / 180);
  const heightFn = (x) => slope * x;
  const ny = Math.cos((20 * Math.PI) / 180);
  const nx = -Math.sin((20 * Math.PI) / 180);
  const normalFn = () => ({ x: nx, y: ny, z: 0 });

  const out = Ph.stepTerrainMove(0, 0, 0.5, 0, true, heightFn, normalFn, {});
  assert.ok(out.x > 0.3, `Gentle 20 deg hill should be walkable, got x=${out.x}`);
  assert.equal(out.sliding, false);
});

test('computeCameraDistance pulls camera inward when a ridge rises between player and camera', () => {
  const Ph = loadPhysics();
  // Hill wall sits at z = -4 rising to y = 8
  const heightFn = (x, z) => (z < -3 && z > -6 ? 8 : 0);
  const focus = { x: 0, y: 2.0, z: 0 };
  const dir = { x: 0, y: 0.1, z: 1 }; // camera hangs along -dir (toward -Z)
  const dist = Ph.computeCameraDistance(focus, dir, 10, heightFn);
  assert.ok(dist < 4.5, `Camera should pull in front of ridge, got dist=${dist}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/physics.test.mjs`
Expected: FAIL (`ENOENT: no such file or directory, open '.../physics.js'`).

- [ ] **Step 3: Implement `physics.js`**

Create `/Users/spencergraham/desktop/other/games/physics.js` containing:
- Pure exported physics primitives:
  - `resolveColliders(x, z, radius, colliders, out)` (2-pass circle push-out).
  - `stepTerrainMove(x, z, dx, dz, onGround, heightFn, normalFn, out)` (evaluates `normalAt(nx, nz)` and `normalAt(x, z)`: if target `normal.y < MAX_WALK_SLOPE_COS` and uphill `dx*nx + dz*nz < 0`, projects out the uphill component; if current underfoot `normal.y < MAX_WALK_SLOPE_COS` while grounded, sets `sliding = true` and outputs downhill tangent velocity `(nx * 6.5, nz * 6.5)`).
  - `computeCameraDistance(focus, dir, desiredDist, heightFn)` (samples 6 evenly spaced points from `t = 0.2..1.0` along the ray `focus - dir * d`; if any sample dips below `heightFn(sx, sz) + 0.65`, reduces effective distance cleanly).
- Full player controller & input bindings (`init(domElement, callbacks)`):
  - Prevents default on game keys (`WASD`, Arrows, `Space`, `ShiftLeft`/`ShiftRight`, `Tab`, `KeyQ/E/V/F`) and suppresses `contextmenu` on canvas so right-click cleanly toggles Z-target lock-on!
  - Left-click (<6px drag) fires Star Bolt; left-drag orbits camera; mouse wheel zooms `4.5..18`.
  - **Coyote time (`0.12s`) & Jump buffer (`0.12s`)**, momentum-preserving air control, gravity `24`, jump `vy = 9.2`, landing squash + `Sound.land(impact)` + `onDust` / `onSplash`.
  - **Dodge-roll (`ShiftLeft` / `ShiftRight`)**: triggers if grounded/shallow-wading, not swimming, `rollT <= 0`, `rollCooldown <= 0`. Sets `rollT = 0.45`, `rollCooldown = 0.25`, `invulnT = 0.38`, locks roll direction along movement input (or facing if idle), propels at `12.5 u/s` tapering smoothly to `6.5 u/s`, spawns dust/splash puffs and plays `Sound.roll()`.
  - **Z-Targeting (`Tab` or Right-Click)**: finds closest valid candidate (`gloom` or `cocoon`) within `20` units favoring camera forward cone; toggles lock-on with `Sound.lockOn(true/false)`; auto-releases if target removed or distance `> 26`; switches movement to target-relative circle-strafing while keeping Starkeeper facing the target and framing an over-the-shoulder duel camera!
  - **Buoyant Water Physics**: samples `surfY = Shaders.waterHeightAt(P.x, P.z, time)`; deep water (`ground < surfY - 1.65`) switches smoothly to swimming with spring buoyancy toward `surfY - 0.35` (or diving on `Space` while `P.air > 0`); surface splashes + wading footsteps (`surfaceAt(P.x, P.z)`) trigger `Sound.splash` / `Sound.step` and droplet/dust callbacks.
  - **Heroic Animation Driver**: drives walk/run/strafe leg & arm gait, forward run lean, uphill counter-balance, head look-at on `headGroup` (locking onto `lockTarget` first, then nearest gloom/critter/Wish), Star-Lantern Staff swing & casting recoil (`castT`), 3-segment crimson cloak billowing (`capeSegs` with phase delay & velocity drag), jump tuck, swimming stroke, and full forward somersault during `rollT > 0`!

- [ ] **Step 4: Run syntax check and unit test**

Run: `node --check physics.js && node --test tests/physics.test.mjs`
Expected: PASS (0 failures).

---

### Task 7: Gameplay Integration, Combat Impulse, Pooled Particles & HUD (`index.html`, `game.js`)

**Files:**
- Modify: `/Users/spencergraham/desktop/other/games/index.html`
- Modify: `/Users/spencergraham/desktop/other/games/game.js`

**Interfaces:**
- Consumes: `Sound`, `Textures`, `Shaders`, `world.js` globals, `Models`, `Physics`.
- Produces: Complete playable game + `window.__GAME_DEBUG__` inspection handle for browser verification.

- [ ] **Step 1: Update `index.html`**

Update `/Users/spencergraham/desktop/other/games/index.html`:
- Fix the `they\'ll` typo → `they'll`.
- Upgrade HUD styling with crisp dark-indigo glassmorphic pills (`backdrop-filter: blur(8px)`), subtle gold border accents, top-right controls container holding both `Quality: High` (`#qualityBtn`) and `Sound: On` (`#soundBtn`).
- Add subtle Z-target cinematic bars (`#letterboxTop`, `#letterboxBot`, height `26px`, animated via `transform` on `.z-active`) and animated golden diamond lock-on reticle (`#lockReticle`, positioned via `transform: translate3d(...)`, `pointer-events: none`).
- Update `#controls` text to document `Shift` (Dodge-Roll) and `Tab / Right-Click` (Z-Target Lock-On).
- Load scripts in exact order:
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="audio.js"></script>
  <script src="textures.js"></script>
  <script src="shaders.js"></script>
  <script src="world.js"></script>
  <script src="models.js"></script>
  <script src="physics.js"></script>
  <script src="game.js"></script>
  ```

- [ ] **Step 2: Rewrite `game.js` to wire `Models`, `Physics`, pooled particles, knockback & bouncing drops**

Update `/Users/spencergraham/desktop/other/games/game.js`:
- Keep `LAND` (10 species), `AQUA` (4 species), `WISH_SPECIES`, quest progression, `beginGame()`, and `#test` bootstrap.
- **Pooled Particle System**:
  - `MAX_PARTICLES = 320` rendered via a single `THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }))` with `instanceColor` and scale-down fade (inactive instances scaled to `0`).
  - `MAX_BUBBLES = 80` rendered via a second `THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }))` for rising bubbles and floating heart/starlight motes.
  - Helpers: `burst(x, y, z, color, count, rise)`, `dustBurst(x, y, z, count, surface)`, `splashBurst(x, y, z, count)`. Zero `new Material()` or `scene.add()` during gameplay!
- **Player & Physics Wiring**:
  - Create `player = Models.makePlayer()`, place at `home` dry-land spot, call `Physics.init(renderer.domElement, { isStarted, onShoot: shoot, onToast: toast, onDust: dustBurst, onSplash: splashBurst, getLockCandidates })`.
- **Wish Companion**:
  - Uses `Models.makeWish()`. Normally hovers gently behind/beside Starkeeper's shoulder; when `Physics.lockTarget` is active, Wish swiftly arcs over to circle `1.6` units above the locked target!
- **Gloomblobs & Combat Impulse**:
  - Uses `Models.makeGloom()`, stores velocity impulse `{ kx, kz, ky }`, resolves prop colliders via `Physics.resolveColliders` + `getNearbyColliders`.
  - Respects `Physics.P.invulnT > 0` during Starkeeper dodge-roll (cannot steal star or bump while rolling!).
  - On `hitGloom`: applies strong horizontal knockback impulse away from the Star Bolt + small upward hop + squash recoil + spark burst.
  - On Gloomblob defeat: spawns 2–3 `Models.makeStarPickup()` items with parabolic velocity (`vx, vy = 5.5..7.5, vz`) and `bouncing: true`; in `updatePickups`, bouncing stars simulate gravity (`-18`) and bounce 2–3 times off `heightAt(x, z)` with damped restitution (`0.52`) before settling into their hover-bob!
- **Cocoons, Wild Starlings, Followers & Observatory Totems**:
  - Use `Models.makeCocoon()`, `Models.makeCritter()`, `Models.animateCritter()`, `Models.makeTotem()`.
  - Wild critters & followers resolve prop colliders smoothly so they weave around trees and boulders instead of clipping through them.
  - Totem registers `setTotemCollider(spot.x, spot.z, 1.15)` on spawn and `clearTotemCollider()` on `lightTotem()`, rotating its crystal and twin brass astrolabe rings (`ringA`, `ringB`).
- **HUD & Debug Hook**:
  - Wire `#qualityBtn` click to toggle `setQuality('high' | 'balanced')`.
  - Update `#lockReticle` and `document.body.classList.toggle('z-active', !!Physics.lockTarget)` each frame.
  - Expose `window.__GAME_DEBUG__ = { P: Physics.P, Physics, Models, Shaders, Textures, scene, camera, renderer, glooms, cocoons, pickups, wild, followers, getTotem: () => totem, heightAt, terrainNormalAt, getNearbyColliders, setQuality, setSkyProgress, lightTotem, shoot, spawnGloom, spawnCocoon }` for automated verification.

- [ ] **Step 3: Syntax-check all JS files and re-run all unit tests**

Run: `node --check audio.js && node --check textures.js && node --check shaders.js && node --check world.js && node --check models.js && node --check physics.js && node --check game.js && node --test tests/*.test.mjs`
Expected: All 7 files pass syntax check and all unit tests PASS.

---

### Task 8: End-to-End Automated Verification, Visual Audit & Performance Profiling

**Files:**
- Verify: All project files in `/Users/spencergraham/desktop/other/games/`

- [ ] **Step 1: Start local static server and inspect in Chrome DevTools MCP**

Start `python3 -m http.server 8765` as a daemon, open `http://127.0.0.1:8765/index.html#test`, and check:
- `list_console_messages`: confirm **zero** JS errors and **zero** WebGL/GLSL compilation errors.
- Evaluate live telemetry via `evaluate_script`: confirm `renderer.shadowMap.enabled === true`, `scene.environment !== null`, chunk colliders populated, FPS / average frame time over 120 frames in both `High` and `Balanced` modes.

- [ ] **Step 2: Functional physics & combat verification in live browser**

Via `evaluate_script`, verify:
- Solid prop collision prevents Starkeeper from walking into a nearby tree/boulder center.
- Dodge-roll (`Shift`) activates `rollT > 0`, grants `invulnT > 0`, and propels Starkeeper forward.
- Z-targeting (`toggleLockOn`) locks onto a nearby Gloomblob, sets `.z-active`, positions `#lockReticle`, and sends Wish circling over the target.
- Firing a Star Bolt (`shoot()`) hits the Gloomblob, applies knockback impulse, and defeating it spawns bouncing stars.
- `Quality: High` ↔ `Quality: Balanced` toggle executes cleanly without errors.

- [ ] **Step 3: Visual screenshot audit**

Take screenshots via `take_screenshot` across:
1. Hero close-up (front/3-quarter view of the original Starkeeper, astronomer hat, coat, Star-Lantern Staff, crimson cloak, directional shadow).
2. Biome vista (cliff rock slopes, swaying grass/flowers, sculpted trees/rocks, atmospheric sky & clouds).
3. Shoreline & water (Fresnel reflections, shoreline foam, shallow underwater caustics).
4. Z-target duel (reticle, thin cinematic bars, Wish circling above shadow-beast Gloomblob, Star Bolt glow).

Inspect every screenshot carefully with `read_file`; if any visual, alignment, shading, or performance defect appears, fix it cleanly and re-verify!
