// ============================================================
// models.js - Original Heroic Starkeeper, Wish, Fantasy Wildlife
// Starlings (14 species / 7 plans), Gloomblobs, Obsidian Cocoons,
// Ancient Observatory Star Totems, Pickups & Star Bolts.
//
// Consumes globals: THREE, Textures, Shaders
// Exports global:   Models
// ============================================================

'use strict';

const Models = (() => {
  const geoCache = new Map();
  const speciesMatCache = new Map();
  const attachMatCache = new Map();
  const jellyMatCache = new Map();
  let shared = null;
  let sharedTexSig = '';

  function getTextureSets() {
    return (typeof Textures !== 'undefined' && Textures && Textures.sets) ? Textures.sets : null;
  }

  function getTextureSig() {
    const sets = getTextureSets();
    if (!sets) return 'none';
    return (sets.cloth ? 'C' : '') + (sets.leather ? 'L' : '') + (sets.fur ? 'F' : '') +
           (sets.feather ? 'P' : '') + (sets.scales ? 'R' : '') +
           (sets.stone ? 'S' : '') + (sets.bark ? 'B' : '');
  }

  function geo(key, factory) {
    let g = geoCache.get(key);
    if (!g) {
      g = factory();
      geoCache.set(key, g);
    }
    return g;
  }

  /**
   * Merges static same-material child primitives into a single cached BufferGeometry
   * to keep rich sculpted feathers, fur tufts, whiskers & scutes at 60 FPS with minimal draw calls.
   * Each spec is: [sourceGeo, px, py, pz, rx, ry, rz, sx, sy, sz]
   */
  function mergeGeo(key, specsFactory) {
    let cached = geoCache.get(key);
    if (cached) return cached;
    const specs = specsFactory();
    if (
      !specs || specs.length === 0 ||
      typeof THREE.BufferGeometry !== 'function' ||
      typeof THREE.Matrix4 !== 'function' ||
      typeof THREE.Quaternion !== 'function' ||
      typeof THREE.Euler !== 'function' ||
      !specs[0][0] || typeof specs[0][0].clone !== 'function' ||
      !specs[0][0].attributes || !specs[0][0].attributes.position
    ) {
      const fb = specs && specs[0] ? specs[0][0] : new THREE.BoxGeometry(0.1, 0.1, 0.1);
      fb.userData = fb.userData || {};
      fb.userData.partCount = specs ? specs.length : 1;
      geoCache.set(key, fb);
      return fb;
    }

    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const eul = new THREE.Euler(0, 0, 0, 'XYZ');
    const quat = new THREE.Quaternion();
    const mat4 = new THREE.Matrix4();
    const clones = [];
    let totalVerts = 0;
    let hasUV = true;

    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const src = s[0];
      const c = src.index ? src.toNonIndexed() : src.clone();
      pos.set(s[1] || 0, s[2] || 0, s[3] || 0);
      eul.set(s[4] || 0, s[5] || 0, s[6] || 0);
      quat.setFromEuler(eul);
      scl.set(s[7] !== undefined ? s[7] : 1, s[8] !== undefined ? s[8] : 1, s[9] !== undefined ? s[9] : 1);
      mat4.compose(pos, quat, scl);
      c.applyMatrix4(mat4);
      if (!c.attributes.normal) c.computeVertexNormals();
      if (!c.attributes.uv) hasUV = false;
      totalVerts += c.attributes.position.count;
      clones.push(c);
    }

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const uvArr = hasUV ? new Float32Array(totalVerts * 2) : null;
    let vOff = 0;
    for (let i = 0; i < clones.length; i++) {
      const c = clones[i];
      const cnt = c.attributes.position.count;
      posArr.set(c.attributes.position.array, vOff * 3);
      normArr.set(c.attributes.normal.array, vOff * 3);
      if (uvArr && c.attributes.uv) uvArr.set(c.attributes.uv.array, vOff * 2);
      vOff += cnt;
      if (typeof c.dispose === 'function') c.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    if (uvArr) merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    merged.userData = { partCount: specs.length };
    geoCache.set(key, merged);
    return merged;
  }

  function linearizeMat(mat) {
    if (!mat || mat._linDone) return mat;
    mat._linDone = true;
    if (mat.color && typeof mat.color.convertSRGBToLinear === 'function') {
      mat.color.convertSRGBToLinear();
    }
    if (mat.emissive && typeof mat.emissive.convertSRGBToLinear === 'function') {
      mat.emissive.convertSRGBToLinear();
    }
    return mat;
  }

  function makePbrMat(setName, fallbackHex, texturedHex, opts = {}) {
    const sets = getTextureSets();
    const set = sets && sets[setName];
    const params = {
      color: (set && set.map && texturedHex !== undefined) ? texturedHex : fallbackHex,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.65,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.04,
    };
    if (set) {
      if (set.map) params.map = set.map;
      if (set.normalMap) params.normalMap = set.normalMap;
      if (set.roughnessMap) params.roughnessMap = set.roughnessMap;
    }
    if (opts.emissive !== undefined) params.emissive = opts.emissive;
    if (opts.emissiveIntensity !== undefined) params.emissiveIntensity = opts.emissiveIntensity;
    if (opts.side !== undefined) params.side = opts.side;
    if (opts.transparent !== undefined) params.transparent = opts.transparent;
    if (opts.opacity !== undefined) params.opacity = opts.opacity;
    return linearizeMat(new THREE.MeshStandardMaterial(params));
  }

  function attachMat(key, factory) {
    let m = attachMatCache.get(key);
    if (!m) {
      m = linearizeMat(factory());
      attachMatCache.set(key, m);
    }
    return m;
  }

  function getJellyShaderMats(colorHex) {
    const key = String(colorHex);
    let cached = jellyMatCache.get(key);
    if (!cached) {
      const bellMat = Shaders.createJellyMaterial(colorHex, { isTentacle: false });
      const tentMats = [];
      for (let i = 0; i < 6; i++) {
        tentMats.push(Shaders.createJellyMaterial(colorHex, { isTentacle: true, phase: i * 1.05 }));
      }
      cached = { bellMat, tentMats };
      jellyMatCache.set(key, cached);
    }
    return cached;
  }

  function makeMesh(geometry, material, castShadow = true, receiveShadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    return m;
  }

  function makeGlow(color, size, opacity, sparkle = false) {
    let sprite;
    if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.createGlowSprite === 'function') {
      sprite = Shaders.createGlowSprite(color, size, opacity, sparkle);
    } else {
      sprite = new THREE.Sprite(new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      sprite.scale.set(size, size, 1);
    }
    sprite.castShadow = false;
    sprite.receiveShadow = false;
    return sprite;
  }

  function curveHatBrimGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const rNorm = Math.min(1, r / 0.45);
      const ang = Math.atan2(z, x);
      const wave = Math.sin(ang * 2 + 0.4) * 0.022 + Math.cos(ang + 0.2) * 0.013;
      const cup = (rNorm * rNorm - 0.35) * 0.044;
      pos.setY(i, y + (wave + cup) * rNorm);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptHatConeGeo(geometry, height = 0.36) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const halfH = height * 0.5;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, (y + halfH) / height));
      // Keep the crown base circular and flush with the hatband, curving the upper tip jauntily back-left
      const bend = t * t;
      pos.setXYZ(i, x - bend * 0.030, y, z - bend * 0.088);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function taperCapeGeo(geometry, topScale, botScale, wrapCurve, pleatCount = 0, pleatAmp = 0) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxAbsX = 0.001;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      const y = pos.getY(i);
      if (x > maxAbsX) maxAbsX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(0.001, maxY - minY);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = 1 - (y - minY) / span; // 0 at top seam, 1 at free lower hem
      const sx = topScale + (botScale - topScale) * t;
      const wx = x * sx;
      const uNorm = x / maxAbsX; // -1..1 across panel width
      const pleat = pleatCount > 0
        ? Math.sin(uNorm * pleatCount * Math.PI) * pleatAmp * (0.28 + 0.72 * t)
        : 0;
      const hemDip = pleatCount > 0 ? Math.cos(uNorm * Math.PI * 0.5) * 0.014 * t : 0;
      pos.setXYZ(i, wx, y - hemDip, z + wx * wx * wrapCurve + pleat);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptAnatomicalTorsoGeo(geometry, isOuterCoat) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const pad = isOuterCoat ? 0.022 : 0.0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(x, z); // 0 = front (+Z), PI = back (-Z)
      const r0 = Math.hypot(x, z);
      const t = Math.max(0, Math.min(1, (y + 0.28) / 0.56)); // 0=hips -> 0.26=waist -> 0.78=chest -> 1=collar

      // Athletic youthful humanoid V-taper silhouette (hips -> cinched waist -> sculpted chest/shoulders -> collar)
      const hipW = Math.exp(-Math.pow((t - 0.04) / 0.20, 2));
      const waistCinch = Math.exp(-Math.pow((t - 0.26) / 0.20, 2));
      const chestW = Math.exp(-Math.pow((t - 0.78) / 0.24, 2));
      const collarTaper = t > 0.88 ? (t - 0.88) / 0.12 : 0;

      let rx = 0.172 + hipW * 0.020 - waistCinch * 0.026 + chestW * 0.064 - collarTaper * 0.088 + pad;
      let rz = 0.122 + hipW * 0.014 - waistCinch * 0.015 + chestW * 0.028 - collarTaper * 0.042 + pad * 0.88;

      // Sculpted anterior chest fullness, sternum groove, and dorsal spine indentation
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const frontW = Math.max(0, cosA);
      const backW = Math.max(0, -cosA);
      const pec = Math.exp(-Math.pow((t - 0.72) / 0.16, 2)) * frontW * (0.4 + 0.6 * Math.abs(sinA));
      const spineGroove = Math.exp(-Math.pow((t - 0.55) / 0.32, 2)) * Math.pow(backW, 4) * 0.014;
      const shoulderBlade = Math.exp(-Math.pow((t - 0.76) / 0.16, 2)) * backW * Math.sin(ang * 2) * Math.sin(ang * 2) * 0.012;
      const clothFold = isOuterCoat
        ? Math.sin(ang * 6.0) * 0.0055 * (1.0 - t * 0.55)
        : 0;

      // Subtle open-front coat recess along center chest so inner sea-teal tunic reads with real layered depth
      const coatSplit = isOuterCoat && cosA > 0.78
        ? -Math.pow((cosA - 0.78) / 0.22, 1.5) * 0.019 * (0.3 + 0.7 * Math.sin(t * Math.PI))
        : 0;

      const radScale = Math.min(1.0, r0);
      const nx = Math.sin(ang) * (rx + clothFold) * radScale;
      const nz = Math.cos(ang) * (rz + pec * 0.018 + shoulderBlade - spineGroove + coatSplit + clothFold) * radScale;
      pos.setXYZ(i, nx, y, nz);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptMantleGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(x, z);
      const t = Math.max(0, Math.min(1, (0.085 - y) / 0.17)); // 0=collar -> 1=draped shoulder edge
      const shoulderSaddle = Math.sin(ang) * Math.sin(ang);
      const frontW = Math.max(0, Math.cos(ang));
      const backW = Math.max(0, -Math.cos(ang));
      const gentleFold = Math.sin(ang * 6.0) * 0.0045 * t;
      const dropY = y - shoulderSaddle * 0.030 * t + frontW * 0.010 * t;
      // Drape proudly over front chest & lapels (frontW -> +0.20 zScale) while staying tucked cleanly inside back cloak (-Z)!
      const zScale = 0.68 + frontW * 0.20 - backW * 0.16 * t;
      pos.setXYZ(i, x * (0.98 + gentleFold * 1.4), dropY, z * zScale + frontW * 0.024 + gentleFold);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptBaldricGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    // Parametric surface-conforming chest-only leather baldric ribbon riding cleanly ON TOP OF outer coat & lapels!
    // Input: BoxGeometry(0.054, 1.0, 0.016, 2, 20, 1) where y in [-0.5, +0.5] maps from right hip belt -> left shoulder under mantle!
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i); // strap half-width (-0.027..+0.027)
      const ly = pos.getY(i); // -0.5 (bottom right belt) .. +0.5 (top left under mantle)
      const lz = pos.getZ(i); // strap thickness (-0.008..+0.008)
      const s = Math.max(0, Math.min(1, ly + 0.5)); // 0=right hip -> 1=left shoulder
      // Torso normalized height t (0.12=belt .. 0.78=tucked cleanly beneath shoulder mantle hem)
      const t = 0.12 + s * 0.66;
      const worldY = -0.25 + t * 0.50; // matches outerCoat local y (center at 0.275, height 0.50)
      // Diagonal azimuth around front chest: from right hip (+0.60 rad) to left upper chest (-0.54 rad)
      const angCenter = 0.60 - s * 1.14;
      const ang = angCenter + lx * 3.6;

      // Taut leather strap bridging cleanly across the sculpted chest & folded lapels into the belt (ZERO waist-cinch dip!)
      const hipW = Math.exp(-Math.pow((t - 0.04) / 0.20, 2));
      const waistCinch = Math.exp(-Math.pow((t - 0.26) / 0.20, 2));
      const chestW = Math.exp(-Math.pow((t - 0.78) / 0.24, 2));
      const collarTaper = t > 0.88 ? (t - 0.88) / 0.12 : 0;
      const rx = 0.172 + hipW * 0.020 - waistCinch * 0.012 + chestW * 0.064 - collarTaper * 0.088 + 0.026 + 0.022;
      const rz = 0.122 + hipW * 0.018 - waistCinch * 0.003 + chestW * 0.028 - collarTaper * 0.042 + 0.024 + 0.042;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const frontW = Math.max(0, cosA);
      const pec = Math.exp(-Math.pow((t - 0.72) / 0.16, 2)) * frontW * (0.4 + 0.6 * Math.abs(sinA));
      const thick = lz; // positive = outward from chest surface

      const px = sinA * (rx + thick);
      const pz = cosA * (rz + pec * 0.018 + thick);
      pos.setXYZ(i, px, worldY, pz);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptNeckGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, (y + 0.075) / 0.15)); // 0=trapezius base -> 1=jaw
      const trapFlare = Math.pow(1 - t, 1.8);
      pos.setXYZ(i, x * (1.0 + trapFlare * 0.85), y, z * (0.94 + trapFlare * 0.35));
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptThighGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, -y / 0.37)); // 0=hip -> 1=knee
      const quad = Math.exp(-Math.pow((t - 0.36) / 0.28, 2));
      const hipFull = Math.exp(-Math.pow(t / 0.22, 2));
      const kneePinch = Math.exp(-Math.pow((t - 0.94) / 0.14, 2));
      const sx = 1.0 + hipFull * 0.14 + quad * 0.10 - kneePinch * 0.08;
      const sz = 1.04 + hipFull * 0.16 + quad * 0.15 - kneePinch * 0.06;
      const quadShiftZ = quad * 0.011 - hipFull * 0.008;
      pos.setXYZ(i, x * sx, y, z * sz + quadShiftZ);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptShinGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, -y / 0.36)); // 0=knee -> 1=ankle
      const calf = Math.exp(-Math.pow((t - 0.34) / 0.22, 2));
      const ankle = Math.pow(Math.max(0, (t - 0.65) / 0.35), 1.4);
      const sx = 1.0 + calf * 0.14 - ankle * 0.12;
      const sz = 1.0 + calf * 0.24 - ankle * 0.08;
      // Gastrocnemius muscle curves backward (-Z) behind shin bone
      const calfBack = -calf * 0.014;
      pos.setXYZ(i, x * sx, y, z * sz + calfBack);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptUpperArmGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, -y / 0.27)); // 0=deltoid -> 1=elbow cuff
      const deltoid = Math.exp(-Math.pow((t - 0.14) / 0.20, 2));
      const bicep = Math.exp(-Math.pow((t - 0.52) / 0.24, 2));
      const sleeveGather = Math.exp(-Math.pow((t - 0.86) / 0.10, 2));
      const sx = 1.0 + deltoid * 0.18 + bicep * 0.08 + sleeveGather * 0.10;
      const sz = 1.02 + deltoid * 0.16 + bicep * 0.14 + sleeveGather * 0.10;
      pos.setXYZ(i, x * sx, y, z * sz + bicep * 0.006);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptForearmGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, -y / 0.24)); // 0=elbow -> 1=wrist
      const brachio = Math.exp(-Math.pow((t - 0.22) / 0.24, 2));
      const wristFlat = Math.pow(t, 1.5);
      // Natural anatomical forearm: muscular near elbow, slightly oval/flatter across wrist
      const sx = 1.0 + brachio * 0.14 - wristFlat * 0.08;
      const sz = 1.0 + brachio * 0.16 - wristFlat * 0.20;
      pos.setXYZ(i, x * sx, y, z * sz);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptHandPalmGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // t = 0 at wrist (+y) -> 1 at knuckles (-y)
      const t = Math.max(0, Math.min(1, (0.042 - y) / 0.084));
      const widthScale = 0.78 + t * 0.34;
      const thickScale = 0.84 - t * 0.24;
      // Gentle natural palm cup inward (+Z)
      const cupZ = (x * x) * 1.4;
      pos.setXYZ(i, x * widthScale, y, z * thickScale + cupZ * 0.18);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptBootFootGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      // Sculpt realistic leather boot instep, arched heel, and softly tapered slightly-upturned toe box
      const zNorm = Math.max(-1, Math.min(1, z / 0.086));
      if (zNorm > 0) {
        // Taper toe width and flatten toe box smoothly toward front tip
        const toeW = 1.0 - zNorm * zNorm * 0.28;
        const toeH = 1.0 - zNorm * 0.34;
        x *= toeW;
        if (y > 0) y *= toeH;
        y += Math.pow(zNorm, 2.4) * 0.012; // crisp subtle boot toe upturn
      } else {
        // Rounded sturdy heel counter
        x *= 0.88;
      }
      if (y < 0) y *= 0.65;
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptBootSoleGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    // Input: CylinderGeometry(1, 1, 0.022, 18, 2) -> sleek form-fitting rounded leather boot sole (NO square wooden blocks!)
    for (let i = 0; i < pos.count; i++) {
      const ux = pos.getX(i); // -1..1
      let y = pos.getY(i);    // -0.011..+0.011
      const uz = pos.getZ(i); // -1..1 (-1=heel, +1=toe)
      const zNorm = Math.max(-1, Math.min(1, uz));
      const archPinch = Math.exp(-Math.pow((zNorm + 0.16) / 0.28, 2)) * 0.16;
      const toeTaper = zNorm > 0 ? zNorm * zNorm * 0.28 : 0;
      const heelTaper = zNorm < 0 ? zNorm * zNorm * 0.14 : 0;
      const bevel = y < -0.002 ? 0.94 : 1.0;
      const halfW = 0.072 * (1.0 - archPinch - toeTaper - heelTaper) * bevel;
      const halfL = 0.128 * bevel;
      // Subtle sculpted instep arch cutout underneath midfoot while heel & ball rest flat at exact y = -0.011
      if (y < -0.004) {
        const archLift = Math.exp(-Math.pow((zNorm + 0.18) / 0.20, 2)) * 0.0045;
        const toeSpring = zNorm > 0.72 ? Math.pow((zNorm - 0.72) / 0.28, 2) * 0.004 : 0;
        y += archLift + toeSpring;
      }
      pos.setXYZ(i, ux * halfW, y, uz * halfL);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptHairCapGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const R = 0.214;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const ang = Math.atan2(x, z); // 0 = front (+Z), +-PI = back (-Z)
      const ny = y / R;
      const cosA = Math.cos(ang); // +1 front, -1 back

      // Keep FULL cranial hair shell over the entire upper forehead & crown (ny >= 0.28) so ZERO bald spot can show under hat!
      // Only open the face cutout strictly below the brow hairline (ny < 0.28) and never wrap under the chin/jaw!
      if (cosA > -0.08 && ny < 0.28) {
        const frontFace = Math.min(1, (cosA + 0.08) / 0.42) * Math.min(1, (0.28 - ny) / 0.36);
        const tuck = 1.0 - frontFace * 0.34;
        x *= tuck;
        z *= tuck;
        if (ny < 0.0) y += frontFace * (-ny) * R * 0.55;
      }

      // Natural layered nape hair behind the ears & back of neck; gently tuck top pole strictly inside hat crown (ny > 0.54)
      const backWeight = Math.max(0, (-cosA - 0.05) / 0.95);
      const lowerWeight = Math.max(0, Math.min(1, (0.28 - ny) / 0.95));
      const crownTuck = ny > 0.54 ? 1.0 - Math.min(1, (ny - 0.54) / 0.46) * 0.16 : 1.0;
      const crownFull = (ny >= 0.24 ? 1.02 : 0.98) * crownTuck;
      const clumpWave = Math.sin(ang * 14.0 + ny * 2.2) * 0.0055 + Math.cos(ang * 8.0) * 0.0035;
      const radialBoost = crownFull + backWeight * lowerWeight * 0.07 + clumpWave * (0.4 + 0.6 * lowerWeight);

      x *= radialBoost;
      z *= 1.02 * radialBoost;
      if (ny > 0.54) y *= crownTuck;
      if (ny < -0.10 && backWeight > 0.20) {
        const featherNotch = (Math.sin(ang * 10.0) * 0.5 + 0.5) * 0.018;
        y -= backWeight * lowerWeight * (0.042 + featherNotch);
        z -= backWeight * lowerWeight * 0.010;
      }

      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptHairStrandGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // Full, plush sculpted hair lock arching OUTWARD proud of the forehead then sweeping cleanly down to a tapered tip!
      const t = Math.min(1, Math.max(0, -y / 0.16)); // 0=root inside hat -> 1=tapered feathered tip
      const widthCurve = (1.0 - t * 0.42) + Math.sin(t * Math.PI) * 0.32;
      const thickCurve = (0.72 - t * 0.40) + Math.sin(t * Math.PI) * 0.16;
      // Convex proud arch (+Z) so the lock NEVER sinks into the forehead skin!
      const archZ = Math.sin(t * Math.PI) * 0.022 + (1 - t) * 0.008;
      pos.setXYZ(i, x * widthCurve, y, z * thickCurve + archZ);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  // ---------- Anatomical Wildlife Sculpting Helpers (True Four-Legged / Avian / Reptilian Physiognomy) ----------

  function sculptQuadTorsoGeo(geometry, arch) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const R = 0.40;
    const isBear = arch === 'bear';
    const isDeer = arch === 'deer';
    const isWolf = arch === 'wolf';
    const isCat = arch === 'cat' || arch === 'fox';
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const nz = Math.max(-1, Math.min(1, z / R)); // -1 rump -> 0 loin -> +1 chest/shoulders
      const ny = y / R;

      // Deep ribcage & chest forward, sleek tucked waist/loin in middle, muscular pelvis/croup behind!
      const chest = Math.exp(-Math.pow((nz - 0.52) / 0.36, 2));
      const waist = Math.exp(-Math.pow((nz + 0.06) / 0.32, 2));
      const croup = Math.exp(-Math.pow((nz + 0.62) / 0.34, 2));

      const widthMul = isBear
        ? 1.06 + chest * 0.12 - waist * 0.05 + croup * 0.10
        : isDeer
          ? 0.72 + chest * 0.14 - waist * 0.20 + croup * 0.06
          : isWolf
            ? 0.80 + chest * 0.16 - waist * 0.24 + croup * 0.11
            : 0.78 + chest * 0.12 - waist * 0.22 + croup * 0.12; // lithe feline/vulpine taper

      x *= widthMul;
      // Muscular withers rise over shoulders; feline/deer/wolf belly tucks UP cleanly at loin!
      if (ny > 0) {
        const withers = chest * (isBear ? 0.16 : isDeer ? 0.14 : isWolf ? 0.13 : 0.09);
        const backDip = waist * (isCat ? 0.07 : isWolf ? 0.05 : 0.04);
        const rumpSlope = nz < -0.45 ? (-nz - 0.45) * 0.16 : 0;
        y *= (0.94 + withers - backDip - rumpSlope);
      } else {
        // Deep sternum/chest keel dropping low; dramatic abdominal tuck-up!
        const chestDrop = chest * (isDeer ? 0.22 : isWolf ? 0.20 : isCat ? 0.16 : 0.12);
        const bellyTuck = waist * (isBear ? 0.04 : isDeer ? 0.34 : isWolf ? 0.30 : 0.28);
        const groinTuck = croup * (isBear ? 0.06 : 0.22);
        y *= Math.max(0.42, 0.94 + chestDrop - bellyTuck - groinTuck);
      }
      // Gently elongate chest forward & round croup smoothly
      z *= 1.04;
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptQuadNeckGeo(geometry, arch) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const isDeer = arch === 'deer';
    const isBear = arch === 'bear';
    const isWolf = arch === 'wolf';
    const len = isDeer ? 0.40 : isBear ? 0.24 : isWolf ? 0.32 : 0.30;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, (y + len * 0.5) / Math.max(0.01, len))); // 0=chest base -> 1=occiput/skull
      const baseFlare = Math.pow(1 - t, 1.5);
      // Natural S-curve arch from shoulders forward-up to head
      const sCurveZ = Math.sin(t * Math.PI) * (isDeer ? 0.045 : isWolf ? 0.032 : 0.025);
      const sx = (isBear ? 1.18 : isDeer ? 0.78 : isWolf ? 0.94 : 0.88) + baseFlare * 0.42;
      const sz = (isBear ? 1.12 : isDeer ? 0.88 : isWolf ? 1.02 : 0.96) + baseFlare * 0.48;
      pos.setXYZ(i, x * sx, y, z * sz + sCurveZ);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptQuadHeadGeo(geometry, arch) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const R = 0.235;
    const isCat = arch === 'cat';
    const isFox = arch === 'fox';
    const isDeer = arch === 'deer';
    const isBear = arch === 'bear';
    const isWolf = arch === 'wolf';
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const nx = x / R;
      const ny = y / R;
      const nz = z / R;

      // Sculpted cranium: slightly flatter crown, distinct cheek zygoma, tapered snout & lower jaw!
      const skullW = isCat ? 1.04 : isBear ? 1.10 : isDeer ? 0.80 : isWolf ? 0.95 : 0.92;
      const skullH = isCat ? 0.88 : isBear ? 0.94 : isDeer ? 0.86 : isWolf ? 0.87 : 0.86;
      x *= skullW;
      y *= skullH;

      // Prominent feline/vulpine/lupine cheekbones flaring subtly at mid-side
      const cheek = Math.exp(-((Math.abs(nx) - 0.65) * (Math.abs(nx) - 0.65) / 0.14 + (ny + 0.18) * (ny + 0.18) / 0.14 + (nz - 0.12) * (nz - 0.12) / 0.18));
      x += Math.sign(nx || 1) * cheek * (isCat ? 0.036 : isFox ? 0.028 : isWolf ? 0.024 : 0.014);

      // Subtle brow-stop concavity above bridge of snout
      if (nz > 0.30) {
        const frontW = Math.min(1, (nz - 0.30) / 0.45);
        const browStop = Math.exp(-((nx * nx) / 0.25 + (ny - 0.28) * (ny - 0.28) / 0.05)) * frontW;
        z -= browStop * (isCat ? 0.024 : isWolf ? 0.020 : 0.016);

        // Integrated anatomical snout/muzzle emerging cleanly from the face (NOT a stuck-on cone!)
        const snoutMask = Math.exp(-((nx * nx) / (isBear ? 0.34 : isCat ? 0.24 : isWolf ? 0.17 : 0.18) + (ny + 0.22) * (ny + 0.22) / (isBear ? 0.24 : isWolf ? 0.17 : 0.18))) * frontW;
        const snoutPull = isCat ? 0.095 : isFox ? 0.165 : isDeer ? 0.175 : isWolf ? 0.185 : 0.135;
        z += snoutMask * snoutPull;
        y -= snoutMask * (isCat ? 0.018 : 0.028);
        // Taper snout width smoothly toward nose tip while preserving whisker-pad fullness
        x *= 1.0 - snoutMask * (isCat ? 0.28 : isBear ? 0.22 : isWolf ? 0.42 : 0.40);

        // Soft whisker-pad lobes flanking feline/vulpine muzzle + distinct sculpted lower jaw chin
        const whiskL = Math.exp(-(((nx + 0.24) * (nx + 0.24)) / 0.045 + ((ny + 0.34) * (ny + 0.34)) / 0.032)) * frontW;
        const whiskR = Math.exp(-(((nx - 0.24) * (nx - 0.24)) / 0.045 + ((ny + 0.34) * (ny + 0.34)) / 0.032)) * frontW;
        z += (whiskL + whiskR) * (isCat ? 0.024 : 0.014);
        const chin = Math.exp(-((nx * nx) / 0.12 + ((ny + 0.54) * (ny + 0.54)) / 0.045)) * frontW;
        y -= chin * 0.016;
        z += chin * 0.018;
      }

      // Gently taper occiput behind skull into neck
      if (nz < -0.35) {
        const backW = Math.min(1, (-nz - 0.35) / 0.55);
        x *= 1.0 - backW * 0.16;
        y *= 1.0 - backW * 0.10;
      }

      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptAnimalEarGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(0.001, maxY - minY);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);
      const t = (y - minY) / span; // 0 base -> 1 tip
      // Flatten front-to-back into a cupped feline/fox pinna with concave hollow front & curved outer ridge!
      const cup = z > 0 ? 0.35 : 0.62;
      const bowlHollow = z > 0 ? -Math.sin(t * Math.PI) * 0.018 * (1 - Math.min(1, Math.abs(x) * 9)) : 0;
      const tipBack = t * t * -0.022;
      pos.setXYZ(i, x * (1.12 - t * 0.14), y, z * cup + bowlHollow + tipBack);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptQuadLegUpperGeo(geometry, len, isFront, arch) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const isBear = arch === 'bear';
    const isDeer = arch === 'deer';
    const isWolf = arch === 'wolf';
    // Input is unit SphereGeometry(1, 12, 10) -> smoothly rounded organic shoulder/haunch muscle with ZERO flat top cap!
    for (let i = 0; i < pos.count; i++) {
      const ux = pos.getX(i); // -1..1
      const uy = pos.getY(i); // -1..1 (+1 = top of shoulder/hip dome, -1 = elbow/stifle)
      const uz = pos.getZ(i); // -1..1
      const t = (1 - uy) * 0.5; // 0 = rounded top inside ribcage/pelvis -> 1 = elbow/stifle joint
      const y = 0.055 * len - t * (len * 1.12);
      const bulk = isBear ? 1.28 : isDeer ? 0.74 : isWolf ? 0.86 : 0.88;
      let rx, rz, shiftZ;
      if (isFront) {
        // Tapered muscular shoulder & upper arm sweeping gracefully back toward elbow
        const shoulderSw = Math.sin(Math.pow(t, 0.75) * Math.PI);
        rx = (0.042 + shoulderSw * 0.042) * bulk;
        rz = (0.048 + shoulderSw * 0.056) * bulk;
        shiftZ = (0.45 - t) * len * 0.20;
      } else {
        // Sweeping broad rounded muscular haunch/thigh angling forward-down to stifle knee!
        const haunchSw = Math.sin(Math.pow(t, 0.68) * Math.PI);
        rx = (0.044 + haunchSw * 0.048) * bulk;
        rz = (0.056 + haunchSw * 0.078) * bulk;
        shiftZ = (t - 0.38) * len * 0.26;
      }
      pos.setXYZ(i, ux * rx, y, uz * rz + shiftZ);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptQuadLegLowerGeo(geometry, len, isFront, arch) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const isBear = arch === 'bear';
    const isDeer = arch === 'deer';
    const isWolf = arch === 'wolf';
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, -y / Math.max(0.01, len))); // 0=elbow/stifle -> 1=wrist/ankle above paw
      const slim = isBear ? 1.24 : isDeer ? 0.72 : isWolf ? 0.82 : 0.86;
      const taper = 1.0 - t * 0.22;
      x *= slim * taper;
      z *= slim * (1.06 - t * 0.16);
      if (isFront) {
        // Forearm starts slightly behind under elbow, straightens cleanly down to wrist/paw
        z += (1 - t) * -len * 0.12;
      } else {
        // Iconic quadruped reverse-angled HOCK joint curving back (-Z) at mid-shin before dropping to hind paw!
        const hockCurve = Math.sin(t * Math.PI) * -len * (isBear ? 0.14 : 0.28);
        const topAlign = (1 - t) * len * 0.16;
        z += topAlign + hockCurve;
      }
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptCatTailGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, y / 0.52)); // 0 base -> 1 curved tip
      // Graceful upright S-curved feline tail arching gently backward then curling softly at the tip
      const archZ = -Math.sin(t * Math.PI * 0.85) * 0.16 - t * 0.10 + Math.pow(t, 3) * 0.08;
      const taper = 1.0 - t * 0.36;
      pos.setXYZ(i, x * taper, y, z * taper + archZ);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptBirdBodyGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const R = 0.38;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const nz = Math.max(-1, Math.min(1, z / R));
      // Aerodynamic avian teardrop: full rounded puffed breast in front (+Z), sleek tapered tail-rump behind (-Z)!
      const breast = Math.max(0, nz);
      const rump = Math.max(0, -nz);
      x *= (0.86 + breast * 0.12 - rump * 0.34);
      y *= (0.94 + breast * 0.14 - rump * 0.32);
      if (nz < 0) y += rump * rump * 0.06;
      z *= 1.14;
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptLizardBodyGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const R = 0.32;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const nz = Math.max(-1, Math.min(1, z / R));
      const chest = Math.exp(-Math.pow((nz - 0.45) / 0.35, 2));
      const waist = Math.exp(-Math.pow(nz / 0.32, 2));
      const hips = Math.exp(-Math.pow((nz + 0.52) / 0.32, 2));
      x *= 0.72 + chest * 0.18 - waist * 0.12 + hips * 0.14;
      y *= 0.56 + chest * 0.10 - Math.abs(nz) * 0.10;
      z *= 1.88;
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptStarkeeperHeadGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const R = 0.205;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const nx = x / R;
      const ny = y / R;
      const nz = z / R;

      // Youthful oval face silhouette: gently taper jaw/chin and add slight oval height
      const jawTaper = ny < -0.10 ? 1.0 - Math.min(0.24, (-ny - 0.10) * 0.28) : 1.0;
      x *= 0.94 * jawTaper;
      y *= 1.06;
      z *= 1.01;

      if (nz > 0.22) {
        const frontW = Math.min(1, (nz - 0.22) / 0.45);
        // Full soft youthful cheeks
        const chL = Math.exp(-(((nx + 0.44) * (nx + 0.44)) / 0.08 + ((ny + 0.18) * (ny + 0.18)) / 0.08));
        const chR = Math.exp(-(((nx - 0.44) * (nx - 0.44)) / 0.08 + ((ny + 0.18) * (ny + 0.18)) / 0.08));
        const cheeks = (chL + chR) * frontW;
        z += cheeks * 0.015;
        x += Math.sign(nx || 1) * cheeks * 0.008;

        // Subtle sculpted brow ridge & concave recessed eye sockets
        const browRidge = Math.exp(-((nx * nx) / 0.36 + ((ny - 0.30) * (ny - 0.30)) / 0.025)) * frontW;
        z += browRidge * 0.009;

        const sockL = Math.exp(-(((nx + 0.34) * (nx + 0.34)) / 0.048 + ((ny - 0.07) * (ny - 0.07)) / 0.036));
        const sockR = Math.exp(-(((nx - 0.34) * (nx - 0.34)) / 0.048 + ((ny - 0.07) * (ny - 0.07)) / 0.036));
        z -= (sockL + sockR) * frontW * 0.017;

        // Delicate sculpted nose bridge + gently upturned button tip
        const noseBridge = Math.exp(-((nx * nx) / 0.013 + ((ny - 0.02) * (ny - 0.02)) / 0.032)) * frontW;
        const noseTip = Math.exp(-((nx * nx) / 0.014 + ((ny + 0.11) * (ny + 0.11)) / 0.015)) * frontW;
        z += noseBridge * 0.018 + noseTip * 0.038;
        y += noseTip * 0.007;

        // Subtle philtrum groove, sculpted upper & lower lips, and gentle chin
        const philtrum = Math.exp(-((nx * nx) / 0.006 + ((ny + 0.24) * (ny + 0.24)) / 0.008)) * frontW;
        const upperLip = Math.exp(-((nx * nx) / 0.042 + ((ny + 0.33) * (ny + 0.33)) / 0.006)) * frontW;
        const mouthCrease = Math.exp(-((nx * nx) / 0.048 + ((ny + 0.385) * (ny + 0.385)) / 0.0025)) * frontW;
        const lowerLip = Math.exp(-((nx * nx) / 0.034 + ((ny + 0.445) * (ny + 0.445)) / 0.007)) * frontW;
        const chinCleft = Math.exp(-((nx * nx) / 0.038 + ((ny + 0.56) * (ny + 0.56)) / 0.010)) * frontW;
        const chinTip = Math.exp(-((nx * nx) / 0.060 + ((ny + 0.74) * (ny + 0.74)) / 0.032)) * frontW;

        z += upperLip * 0.014 + lowerLip * 0.016 + chinTip * 0.018 - philtrum * 0.005 - mouthCrease * 0.009 - chinCleft * 0.008;
        y -= chinTip * 0.012;
      }

      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptEyeballGeo(radius) {
    const g = new THREE.SphereGeometry(radius, 18, 14);
    if (g.attributes && g.attributes.position && g.attributes.uv) {
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      const irisSpan = radius * 0.76;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        if (vz > 0) {
          const u = Math.max(0.02, Math.min(0.98, 0.5 + (vx / irisSpan) * 0.5));
          const v = Math.max(0.02, Math.min(0.98, 0.5 + (vy / irisSpan) * 0.5));
          uv.setXY(i, u, v);
        } else {
          uv.setXY(i, 0.02, 0.02);
        }
      }
      uv.needsUpdate = true;
    }
    return g;
  }

  function sculptHairLockGeo() {
    const g = new THREE.CylinderGeometry(0.034, 0.005, 0.155, 7, 4);
    g.translate(0, -0.0775, 0);
    if (g.attributes && g.attributes.position) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = Math.min(1, Math.max(0, -y / 0.155)); // 0 at root -> 1 at softly tapered tip
        const archZ = Math.sin(t * Math.PI) * 0.022 - t * t * 0.014;
        const flareX = 1.0 + Math.sin(t * Math.PI) * 0.28;
        pos.setXYZ(i, x * flareX, y, z * 0.72 + archZ);
      }
      g.computeVertexNormals();
    }
    return g;
  }

  function ensureShared() {
    const sig = getTextureSig();
    if (shared && sharedTexSig === sig) return shared;
    sharedTexSig = sig;
    if (sig !== 'none') speciesMatCache.clear();

    const faceMap = (typeof Textures !== 'undefined' && Textures && Textures.starkeeperFace) || null;
    const irisMap = (typeof Textures !== 'undefined' && Textures && Textures.starkeeperIris) || null;

    shared = {
      // Starkeeper character materials (warm rich medium-deep brown skin + natural braided dark espresso hair)
      skin: new THREE.MeshStandardMaterial({ color: 0x7e4a2c, roughness: 0.56, metalness: 0.02 }),
      faceSkin: new THREE.MeshStandardMaterial({
        color: faceMap ? 0xffffff : 0x7e4a2c,
        map: faceMap,
        roughness: 0.56,
        metalness: 0.01,
      }),
      hair: makePbrMat('fur', 0x1d1612, 0x261d18, { roughness: 0.56, metalness: 0.06 }),
      braidHair: new THREE.MeshStandardMaterial({ color: 0x201814, roughness: 0.54, metalness: 0.07 }),
      lashDark: new THREE.MeshStandardMaterial({ color: 0x140e0c, roughness: 0.44, metalness: 0.04 }),
      sclera: new THREE.MeshStandardMaterial({ color: 0xf8f5ee, roughness: 0.20, metalness: 0.02 }),
      irisBlue: new THREE.MeshStandardMaterial({ color: 0x4e2d18, roughness: 0.20, metalness: 0.06 }),
      irisEye: new THREE.MeshStandardMaterial({
        color: irisMap ? 0xffffff : 0x4e2d18,
        map: irisMap,
        roughness: 0.10,
        metalness: 0.06,
      }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x161822, roughness: 0.18, metalness: 0.04 }),
      catchlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),

      coatIndigo: makePbrMat('cloth', 0x263459, 0x283862, {
        roughness: 0.78,
        ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.42, 0.42) } : {}),
      }),
      coatTeal: makePbrMat('cloth', 0x276a74, 0x2a7682, {
        roughness: 0.74,
        ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.38, 0.38) } : {}),
      }),
      coatFlowIndigo: (() => {
        const m = makePbrMat('cloth', 0x263459, 0x283862, {
          roughness: 0.78,
          side: THREE.DoubleSide,
          ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.38, 0.38) } : {}),
        });
        if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.patchClothFlow === 'function') {
          Shaders.patchClothFlow(m, { amp: 0.026, freq: 5.0, phase: 0.6, tag: 'cloth_coat_indigo_v1' });
        }
        return m;
      })(),
      coatFlowTeal: (() => {
        const m = makePbrMat('cloth', 0x276a74, 0x2a7682, {
          roughness: 0.74,
          side: THREE.DoubleSide,
          ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.36, 0.36) } : {}),
        });
        if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.patchClothFlow === 'function') {
          Shaders.patchClothFlow(m, { amp: 0.028, freq: 5.8, phase: 1.4, tag: 'cloth_coat_teal_v1' });
        }
        return m;
      })(),
      scarfFlowTeal: (() => {
        const m = makePbrMat('cloth', 0x276a74, 0x2a7682, {
          roughness: 0.72,
          side: THREE.DoubleSide,
          ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.34, 0.34) } : {}),
        });
        if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.patchClothFlow === 'function') {
          Shaders.patchClothFlow(m, {
            amp: 0.032,
            freq: 6.2,
            phase: 1.1,
            continuousBend: true,
            bendOffset: 0.075,
            goldHem: true,
            tag: 'cloth_scarf_teal_v2',
          });
        }
        return m;
      })(),
      trousers: makePbrMat('cloth', 0x262c3f, 0x2a3146, {
        roughness: 0.82,
        ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.36, 0.36) } : {}),
      }),
      hatCloth: makePbrMat('cloth', 0x212b4d, 0x243058, {
        roughness: 0.74,
        ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.38, 0.38) } : {}),
      }),
      cloakCrimson: (() => {
        const m = makePbrMat('cloth', 0x8f2438, 0x99283e, {
          roughness: 0.78,
          side: THREE.DoubleSide,
          ...(typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.40, 0.40) } : {}),
        });
        if (typeof Shaders !== 'undefined' && Shaders && typeof Shaders.patchClothFlow === 'function') {
          Shaders.patchClothFlow(m, {
            amp: 0.044,
            freq: 5.4,
            phase: 0.0,
            continuousBend: true,
            bendOffset: 0.0,
            goldHem: true,
            tag: 'cloth_cloak_crimson_v2',
          });
        }
        return m;
      })(),
      leatherWarm: makePbrMat('leather', 0x7b4c2d, 0xcaa482, { roughness: 0.58 }),
      leatherDark: makePbrMat('leather', 0x4e3120, 0x926e52, { roughness: 0.64 }),
      bootSole: new THREE.MeshStandardMaterial({ color: 0x241914, roughness: 0.84, metalness: 0.02 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xd9a841, roughness: 0.28, metalness: 0.84 }),
      goldTrim: new THREE.MeshStandardMaterial({
        color: 0xf6ca4b,
        emissive: 0x5c3e08,
        emissiveIntensity: 0.55,
        roughness: 0.26,
        metalness: 0.82,
      }),
      starCrystal: new THREE.MeshStandardMaterial({
        color: 0xffe476,
        emissive: 0xffc633,
        emissiveIntensity: 1.05,
        roughness: 0.18,
        metalness: 0.25,
      }),
      staffWood: makePbrMat('bark', 0x4b3323, 0xd8c2ae, { roughness: 0.76 }),
      compassFace: new THREE.MeshStandardMaterial({
        color: 0x67d8d0,
        emissive: 0x1c5960,
        roughness: 0.22,
        metalness: 0.2,
      }),

      // Shared world-entity materials
      gloomBody: new THREE.MeshStandardMaterial({
        color: 0x211530,
        emissive: 0x11071e,
        roughness: 0.34,
        metalness: 0.18,
      }),
      gloomHorn: new THREE.MeshStandardMaterial({
        color: 0x160d22,
        roughness: 0.28,
        metalness: 0.28,
      }),
      gloomBrow: new THREE.MeshStandardMaterial({
        color: 0x110a1a,
        roughness: 0.45,
        metalness: 0.12,
      }),
      gloomWisp: new THREE.MeshStandardMaterial({
        color: 0x362052,
        emissive: 0x2a144a,
        roughness: 0.24,
        metalness: 0.3,
      }),
      cocoonObsidian: new THREE.MeshStandardMaterial({
        color: 0x1c1328,
        emissive: 0x0b0514,
        roughness: 0.36,
        metalness: 0.22,
      }),
      cocoonCore: new THREE.MeshStandardMaterial({
        color: 0xffdc5c,
        emissive: 0xffb824,
        emissiveIntensity: 1.15,
        roughness: 0.2,
        metalness: 0.2,
      }),
      totemStone: makePbrMat('stone', 0x697082, 0xdce0eb, { roughness: 0.84, metalness: 0.04 }),
      totemDarkStone: makePbrMat('stone', 0x4c5264, 0x9aa2b6, { roughness: 0.88, metalness: 0.05 }),
      totemRune: new THREE.MeshStandardMaterial({
        color: 0xffdf6a,
        emissive: 0xe6a819,
        emissiveIntensity: 0.95,
        roughness: 0.24,
        metalness: 0.55,
      }),
      totemBeam: new THREE.MeshBasicMaterial({
        color: 0xffe482,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      pearlOrb: new THREE.MeshStandardMaterial({
        color: 0xfff5f2,
        emissive: 0x383f54,
        emissiveIntensity: 0.55,
        roughness: 0.14,
        metalness: 0.26,
      }),
      pearlRing: new THREE.MeshStandardMaterial({
        color: 0xa6e3e9,
        emissive: 0x2c5b6e,
        roughness: 0.18,
        metalness: 0.4,
      }),
      heartRuby: new THREE.MeshStandardMaterial({
        color: 0xff3b6b,
        emissive: 0xb8103c,
        emissiveIntensity: 0.9,
        roughness: 0.16,
        metalness: 0.22,
      }),

      // Wish songbird materials (layered feather PBR set)
      wishGold: makePbrMat('feather', 0xffd946, 0xffe054, {
        roughness: 0.52,
        metalness: 0.14,
        emissive: 0x5c4200,
        emissiveIntensity: 0.45,
      }),
      wishWing: makePbrMat('feather', 0xf6b928, 0xf8c238, {
        roughness: 0.48,
        metalness: 0.16,
        emissive: 0x4d3200,
        emissiveIntensity: 0.35,
      }),
      wishBreast: makePbrMat('feather', 0xfff0a8, 0xfff2b4, {
        roughness: 0.56,
        emissive: 0x4a3806,
        emissiveIntensity: 0.3,
      }),
      wishBeak: new THREE.MeshStandardMaterial({
        color: 0xf49824,
        emissive: 0x452200,
        roughness: 0.3,
        metalness: 0.1,
      }),
    };

    const keys = Object.keys(shared);
    for (let i = 0; i < keys.length; i++) {
      linearizeMat(shared[keys[i]]);
    }

    return shared;
  }

  function addCatchlightEyes(parent, opts) {
    const s = ensureShared();
    const r = opts.radius || 0.04;
    const xOff = opts.x || 0.08;
    const yOff = opts.y || 0;
    const zOff = opts.z || 0.15;
    const irisMat = opts.irisMat || s.irisBlue;
    const scleraGeo = geo('eye_sclera_' + r, () => new THREE.SphereGeometry(r, 10, 8));
    const irisGeo = geo('eye_iris_' + r, () => new THREE.SphereGeometry(r * 0.72, 8, 8));
    const pupilGeo = geo('eye_pupil_' + r, () => new THREE.SphereGeometry(r * 0.46, 8, 6));
    const catchGeo = geo('eye_catch_' + r, () => new THREE.SphereGeometry(r * 0.24, 6, 5));

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * xOff, yOff, zOff);

      const sclera = makeMesh(scleraGeo, s.sclera);
      sclera.scale.set(0.92, 1.05, 0.75);
      eyeGroup.add(sclera);

      if (opts.hasIris !== false) {
        const iris = makeMesh(irisGeo, irisMat);
        iris.position.set(0, 0, r * 0.38);
        iris.scale.set(0.95, 1.02, 0.55);
        eyeGroup.add(iris);
      }

      const pupil = makeMesh(pupilGeo, s.pupil);
      pupil.position.set(0, 0, r * 0.56);
      pupil.scale.set(0.95, 1.02, 0.5);
      eyeGroup.add(pupil);

      const catchDot = makeMesh(catchGeo, s.catchlight);
      catchDot.position.set(r * 0.24, r * 0.28, r * 0.72);
      eyeGroup.add(catchDot);

      if (opts.hasBrow) {
        const browGeo = geo('eye_brow_' + r, () => new THREE.BoxGeometry(r * 1.85, r * 0.42, r * 0.48));
        const brow = makeMesh(browGeo, opts.browMat || s.hair);
        brow.position.set(0, r * 1.35, r * 0.36);
        brow.rotation.z = side * (opts.browTilt !== undefined ? opts.browTilt : -0.14);
        eyeGroup.add(brow);
      }

      parent.add(eyeGroup);
    }
  }

  // ---------- 1. Heroic Celestial-Stargazer Starkeeper & Shared Signature Attachments ----------

  function sculptBoxBraidGeo(geometry, length, curveX, curveZ, numPlaits) {
    // Sculpts an even-thickness box braid with crisp alternating chevron/diamond 3-strand plait relief
    // and natural downward gravity drape (origin at root y=0, hangs to y=-length)
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    const invLen = 1 / Math.max(0.01, length);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, -y * invLen));
      const ang = Math.atan2(z, x);
      const phase = t * numPlaits * Math.PI * 2;
      // Alternating crisscrossed 3-strand box-braid lobes (classic diamond-weave silhouette!)
      const plaitLobe = 0.22 * Math.sin(phase + ang * 2.0) + 0.14 * Math.cos(phase - ang * 2.0);
      const pinch = 0.08 * Math.cos(phase * 2.0);
      // Slight taper at sealed root and neat blunt-rounded end at tip (box braids stay even-width!)
      let profile = 1.0;
      if (t < 0.06) profile = 0.84 + (t / 0.06) * 0.16;
      else if (t > 0.90) profile = Math.max(0.32, Math.cos(((t - 0.90) / 0.10) * Math.PI * 0.44));
      const radialScale = profile * (1.0 + plaitLobe + pinch);
      x *= radialScale;
      z *= radialScale;
      // Smooth gravity drape curve pushing gently clear of cheekbones, jaw, ears & cloak collar
      const drape = Math.sin(t * Math.PI * 0.72);
      const hang = t * t;
      x += curveX * (drape * 0.55 + hang * 0.45);
      z += curveZ * (drape * 0.55 + hang * 0.45);
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeStarkeeperBraids() {
    // Sculpted box braids seated cleanly UP into the astronomer hat crown interior (all roots
    // sit inside the crown cone r_hat < 0.225 and above the brim underside y = 0.130..0.155)
    // so every braid emerges naturally from beneath the brim with ZERO floating gap, ZERO exposed
    // flat top cap, and ZERO clipping through hat exterior, cheeks, ears, or crimson cloak!
    const s = ensureShared();
    const braidsGroup = new THREE.Group();
    braidsGroup.name = 'StarkeeperBraids';

    // Shared sculpted braid variants (short brow/forehead bangs, front-temple framers, side shoulder drapes, back nape curtain)
    const browBraidGeo = geo('player_box_braid_brow_v1', () =>
      sculptBoxBraidGeo(new THREE.CylinderGeometry(0.0132, 0.0124, 0.112, 8, 16).translate(0, -0.056, 0), 0.112, 0.0, 0.022, 6.2)
    );
    const frontBraidGeo = geo('player_box_braid_front_v2', () =>
      sculptBoxBraidGeo(new THREE.CylinderGeometry(0.0145, 0.0140, 0.240, 8, 24).translate(0, -0.120, 0), 0.240, 0.0, 0.018, 10.5)
    );
    const sideBraidGeo = geo('player_box_braid_side_v2', () =>
      sculptBoxBraidGeo(new THREE.CylinderGeometry(0.0155, 0.0148, 0.275, 8, 26).translate(0, -0.1375, 0), 0.275, 0.0, 0.022, 12.0)
    );
    const backBraidGeo = geo('player_box_braid_back_v2', () =>
      sculptBoxBraidGeo(new THREE.CylinderGeometry(0.0160, 0.0152, 0.260, 8, 24).translate(0, -0.130, 0), 0.260, 0.0, -0.024, 11.0)
    );
    const cuffGeo = geo('player_braid_cuff_v1', () => new THREE.CylinderGeometry(0.0182, 0.0182, 0.018, 10));
    const endBeadGeo = geo('player_braid_bead_v1', () => new THREE.SphereGeometry(0.0165, 8, 6));

    // [x, y, z, rotX, rotY, rotZ, geoKind, lengthScale, hasCuff, hasEndBead]
    // All roots tuck neatly inside the hat crown interior above the tilted brim underside!
    const braidSpecs = [
      // Stylish front forehead/brow braids emerging under the hat brim to frame the brow without blocking his eyes!
      [ 0.066, 0.155,  0.082, -0.18,  0.28,  0.30, 'brow',  0.80, false, true ],
      [ 0.036, 0.157,  0.089, -0.22,  0.14,  0.24, 'brow',  0.54, true,  false],
      [ 0.002, 0.158,  0.092, -0.24, -0.04, -0.14, 'brow',  0.46, false, false],
      [-0.034, 0.157,  0.089, -0.21, -0.18, -0.26, 'brow',  0.58, false, true ],
      [-0.066, 0.154,  0.082, -0.18, -0.30, -0.30, 'brow',  0.82, true,  false],
      // Left front-temple face-framing braids (clear of left eye & cheek, rooted seamlessly inside hat brim!)
      [ 0.094, 0.158,  0.070, -0.06,  0.55,  0.14, 'front', 0.96, true,  true ],
      [ 0.108, 0.156,  0.042, -0.04,  0.95,  0.15, 'front', 1.02, false, false],
      // Right front-temple face-framing braids (mirrored cleanly on right side)
      [-0.094, 0.152,  0.070, -0.06, -0.55, -0.14, 'front', 0.96, true,  true ],
      [-0.108, 0.150,  0.042, -0.04, -0.95, -0.15, 'front', 1.02, false, false],

      // Left side & behind-ear braids draping neatly toward left shoulder
      [ 0.114, 0.152,  0.010,  0.02,  1.45,  0.14, 'side',  0.98, false, false],
      [ 0.112, 0.146, -0.026,  0.06,  1.88,  0.13, 'side',  1.04, true,  false],
      [ 0.102, 0.140, -0.060,  0.10,  2.28,  0.11, 'side',  1.02, false, false],

      // Right side & behind-ear braids draping neatly toward right shoulder
      [-0.114, 0.148,  0.010,  0.02, -1.45, -0.14, 'side',  0.98, false, false],
      [-0.112, 0.144, -0.026,  0.06, -1.88, -0.13, 'side',  1.04, true,  false],
      [-0.102, 0.139, -0.060,  0.10, -2.28, -0.11, 'side',  1.02, false, false],

      // Outer back curtain (7 rich box braids cascading cleanly over the nape, above the crimson cloak!)
      [ 0.082, 0.138, -0.086,  0.16,  0.0,   0.08, 'back',  0.98, false, false],
      [ 0.056, 0.137, -0.102,  0.18,  0.0,   0.05, 'back',  1.02, false, false],
      [ 0.028, 0.136, -0.110,  0.19,  0.0,   0.02, 'back',  1.05, true,  false],
      [ 0.000, 0.136, -0.113,  0.20,  0.0,   0.00, 'back',  1.06, false, false],
      [-0.028, 0.136, -0.110,  0.19,  0.0,  -0.02, 'back',  1.05, false, false],
      [-0.056, 0.137, -0.102,  0.18,  0.0,  -0.05, 'back',  1.02, true,  false],
      [-0.082, 0.138, -0.086,  0.16,  0.0,  -0.08, 'back',  0.98, false, false],

      // Inner back volume layer (staggered between outer braids so back view looks full & dimensional!)
      [ 0.042, 0.122, -0.094,  0.14,  0.0,   0.04, 'back',  0.88, false, false],
      [ 0.000, 0.120, -0.098,  0.15,  0.0,   0.00, 'back',  0.90, false, false],
      [-0.042, 0.122, -0.094,  0.14,  0.0,  -0.04, 'back',  0.88, false, false],
    ];

    const braids = [];
    for (let i = 0; i < braidSpecs.length; i++) {
      const sp = braidSpecs[i];
      const pivot = new THREE.Group();
      pivot.position.set(sp[0], sp[1], sp[2]);
      pivot.rotation.x = sp[3];
      pivot.rotation.y = sp[4];
      pivot.rotation.z = sp[5];
      const gRef = sp[6] === 'brow' ? browBraidGeo : sp[6] === 'front' ? frontBraidGeo : sp[6] === 'side' ? sideBraidGeo : backBraidGeo;
      const baseLen = sp[6] === 'brow' ? 0.112 : sp[6] === 'front' ? 0.240 : sp[6] === 'side' ? 0.275 : 0.260;
      const braidMesh = makeMesh(gRef, s.braidHair);
      braidMesh.scale.set(1.0, sp[7], 1.0);
      pivot.add(braidMesh);

      if (sp[8]) {
        const cuff = makeMesh(cuffGeo, s.goldTrim);
        if (sp[6] === 'brow') cuff.scale.setScalar(0.84);
        const cuffT = sp[6] === 'brow' ? 0.64 : sp[6] === 'front' ? 0.62 : 0.56;
        const cz = sp[6] === 'back' ? -0.016 : sp[6] === 'brow' ? 0.015 : 0.012;
        cuff.position.set(0, -baseLen * sp[7] * cuffT, cz);
        pivot.add(cuff);
      }
      if (sp[9]) {
        const bead = makeMesh(endBeadGeo, s.brass);
        if (sp[6] === 'brow') bead.scale.setScalar(0.82);
        const cz = sp[6] === 'back' ? -0.022 : sp[6] === 'brow' ? 0.020 : 0.017;
        bead.position.set(0, -baseLen * sp[7] * 0.94, cz);
        pivot.add(bead);
      }

      braidsGroup.add(pivot);
      braids.push(pivot);
    }

    braidsGroup.userData = { braids, count: braids.length };
    return braidsGroup;
  }

  function makeStarkeeperEyes() {
    // Expressive stylized-realist glossy eyes (warm ivory sclera, deep chestnut-amber iris with golden
    // star-fleck & bright dual catchlights, sculpted lash arches, and blinking upper eyelids!) sized
    // precisely to Adventurer_Head's eye sockets (Head-local meters: x=+-0.0435, y=+0.1055, z=+0.1045)
    const s = ensureShared();
    const eyesGroup = new THREE.Group();
    eyesGroup.name = 'StarkeeperEyes';

    const eyeballGeo = geo('glb_eyeball_uv_v1', () => sculptEyeballGeo(0.0172));
    const upperLashGeo = geo('glb_upper_lash_v2', () => new THREE.TorusGeometry(0.0176, 0.0022, 6, 14, Math.PI * 0.72));
    const lowerLashGeo = geo('glb_lower_lash_v2', () => new THREE.TorusGeometry(0.0172, 0.0009, 5, 12, Math.PI * 0.48));
    const eyelidGeo = geo('glb_eyelid_cap_v1', () => new THREE.SphereGeometry(0.0188, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.54));

    let eyelidL = null;
    let eyelidR = null;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1; // +1 = character Left (+X), -1 = character Right (-X)
      const eyeSocket = new THREE.Group();
      // Nestled cleanly inside the curved skull socket so outer lash tips NEVER poke through temple skin!
      eyeSocket.position.set(side * 0.0432, 0.1045, 0.0992);
      eyeSocket.rotation.y = side * 0.26;

      const eyeball = makeMesh(eyeballGeo, s.irisEye, false, false);
      eyeball.scale.set(1.12, 0.88, 0.68);
      eyeSocket.add(eyeball);

      const upperLash = makeMesh(upperLashGeo, s.lashDark, false, false);
      upperLash.position.set(0, 0.0032, 0.0046);
      upperLash.rotation.z = Math.PI * 0.14;
      upperLash.rotation.x = -0.14;
      upperLash.scale.set(1.04, 0.88, 0.85);
      eyeSocket.add(upperLash);

      const lowerLash = makeMesh(lowerLashGeo, s.lashDark, false, false);
      lowerLash.position.set(0, -0.0020, 0.0036);
      lowerLash.rotation.z = Math.PI + Math.PI * 0.26;
      lowerLash.rotation.x = 0.22;
      lowerLash.scale.set(0.98, 0.86, 0.80);
      eyeSocket.add(lowerLash);

      const lidPivot = new THREE.Group();
      // Natural warm resting upper eyelid hood (covers top ~18% of iris for friendly, confident gaze!)
      lidPivot.rotation.x = -0.48;
      const lidMesh = makeMesh(eyelidGeo, s.skin, false, false);
      lidMesh.scale.set(1.13, 0.93, 0.72);
      lidPivot.add(lidMesh);
      eyeSocket.add(lidPivot);

      if (side > 0) eyelidL = lidPivot;
      else eyelidR = lidPivot;
      eyesGroup.add(eyeSocket);
    }

    eyesGroup.userData = { eyelidL, eyelidR };
    return eyesGroup;
  }

  function makeStarkeeperHat() {
    const s = ensureShared();
    const hatGroup = new THREE.Group();

    const brim = makeMesh(
      geo('player_hat_brim_v3', () => curveHatBrimGeo(new THREE.CylinderGeometry(0.422, 0.428, 0.024, 32))),
      s.hatCloth
    );
    const brimTrim = makeMesh(
      geo('player_hat_brim_trim_v4', () => curveHatBrimGeo(new THREE.TorusGeometry(0.436, 0.016, 8, 32).rotateX(Math.PI / 2))),
      s.goldTrim
    );
    brimTrim.position.y = 0.001;

    const crownCone = makeMesh(
      geo('player_hat_cone_v2', () => sculptHatConeGeo(new THREE.ConeGeometry(0.206, 0.36, 24, 10, true), 0.36)),
      s.hatCloth
    );
    // Open-ended base sits flush inside the brim thickness (y = +0.014) while upper tip curves back-left
    crownCone.position.set(0.006, 0.194, -0.014);

    // Coaxial conical brass collar band wrapping strictly outside crownCone (+18..20mm radial clearance)
    // and rising well above the curved brim crest so cone, band, and brim NEVER Z-fight!
    const hatBand = makeMesh(
      geo('player_hat_band_v3', () => new THREE.CylinderGeometry(0.194, 0.224, 0.056, 28, 1, false)),
      s.brass
    );
    hatBand.position.set(0.006, 0.044, -0.014);

    const hatPin = makeMesh(
      geo('player_hat_pin', () => new THREE.OctahedronGeometry(0.036, 0)),
      s.goldTrim
    );
    hatPin.position.set(-0.148, 0.048, 0.160);
    hatPin.scale.set(1, 1, 0.5);

    const hatTipStar = makeMesh(
      geo('player_hat_star', () => new THREE.OctahedronGeometry(0.05, 0)),
      s.starCrystal
    );
    hatTipStar.position.set(-0.024, 0.382, -0.102);
    hatTipStar.scale.set(1, 1.25, 1);

    const hatStarGlow = makeGlow(0xffe066, 0.34, 0.65, true);
    hatStarGlow.position.set(-0.024, 0.382, -0.102);

    hatGroup.add(brim, brimTrim, crownCone, hatBand, hatPin, hatTipStar, hatStarGlow);
    hatGroup.userData = { brim, crownCone, hatBand, hatTipStar, hatStarGlow };
    return hatGroup;
  }

  function makeStarkeeperCloak() {
    const s = ensureShared();
    const cloakGroup = new THREE.Group();

    // Cohesive Single-Piece Continuous Flowing Crimson-Burgundy Cloak (18x24 pleated cloth mesh bent seamlessly in GPU shader!)
    const capeRoot = new THREE.Group();
    const cloakMesh = makeMesh(
      geo('player_cape_continuous_v1', () =>
        taperCapeGeo(new THREE.PlaneGeometry(0.46, 0.96, 18, 24).translate(0, -0.48, 0), 0.92, 1.72, 0.34, 4.5, 0.024)
      ),
      s.cloakCrimson
    );
    capeRoot.add(cloakMesh);
    cloakGroup.add(capeRoot);

    // Twin fluttering sea-teal neck scarf ribbons riding cleanly OVER the crimson cloak (+0.075 rad bendOffset)
    const scarfTailGeo = geo('player_scarf_tail_flow_v2', () =>
      taperCapeGeo(new THREE.PlaneGeometry(0.105, 0.38, 6, 10).translate(0, -0.19, 0), 0.85, 1.24, 0.16, 2.0, 0.008)
    );
    const scarfSegs = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const scPivot = new THREE.Group();
      scPivot.position.set(side * 0.070, 0.014, -0.030);
      scPivot.rotation.z = side * 0.12;
      scPivot.rotation.y = side * -0.08;
      const scMesh = makeMesh(scarfTailGeo, s.scarfFlowTeal);
      scPivot.add(scMesh);
      cloakGroup.add(scPivot);
      scarfSegs.push(scPivot);
    }

    // Articulated cape reference chain (keeps rig hierarchy & telemetry synced cleanly with the continuous GPU cloth curve)
    const seg0 = new THREE.Group();
    seg0.rotation.x = 0.22;
    const seg1 = new THREE.Group();
    seg1.position.set(0, -0.32, 0);
    seg0.add(seg1);
    const seg2 = new THREE.Group();
    seg2.position.set(0, -0.32, 0);
    seg1.add(seg2);
    cloakGroup.add(seg0);

    cloakGroup.userData = { capeRoot, cloakMesh, capeSegs: [seg0, seg1, seg2], scarfSegs };
    return cloakGroup;
  }

  function makeStarkeeperStaff() {
    const s = ensureShared();
    const staffPivot = new THREE.Group();

    const shaft = makeMesh(
      geo('staff_shaft', () => new THREE.CylinderGeometry(0.024, 0.02, 1.66, 10)),
      s.staffWood
    );
    shaft.position.y = 0.31;
    const grip = makeMesh(
      geo('staff_grip', () => new THREE.CylinderGeometry(0.031, 0.031, 0.24, 10)),
      s.leatherWarm
    );
    grip.position.y = 0.0;
    const collarTop = makeMesh(
      geo('staff_collar', () => new THREE.CylinderGeometry(0.048, 0.034, 0.11, 10)),
      s.brass
    );
    collarTop.position.y = 1.12;
    const buttCap = makeMesh(
      geo('staff_butt', () => new THREE.ConeGeometry(0.028, 0.09, 8)),
      s.brass
    );
    buttCap.rotation.x = Math.PI;
    buttCap.position.y = -0.55;

    // Twin crossed open brass cage rings enclosing glowing faceted miniature star crystal
    const cageGeo = geo('staff_cage_ring', () => new THREE.TorusGeometry(0.135, 0.013, 8, 18));
    const cageA = makeMesh(cageGeo, s.brass);
    cageA.position.y = 1.29;
    cageA.rotation.y = Math.PI * 0.25;
    const cageB = makeMesh(cageGeo, s.brass);
    cageB.position.y = 1.29;
    cageB.rotation.y = -Math.PI * 0.25;
    const cageEquatorial = makeMesh(
      geo('staff_cage_eq', () => new THREE.TorusGeometry(0.115, 0.01, 6, 16)),
      s.brass
    );
    cageEquatorial.position.y = 1.29;
    cageEquatorial.rotation.x = Math.PI / 2;

    const staffStar = makeMesh(
      geo('staff_star', () => new THREE.OctahedronGeometry(0.072, 0)),
      s.starCrystal
    );
    staffStar.position.y = 1.29;
    staffStar.scale.set(1, 1.28, 1);
    const staffStarCross = makeMesh(
      geo('staff_star', () => new THREE.OctahedronGeometry(0.072, 0)),
      s.starCrystal
    );
    staffStarCross.position.y = 1.29;
    staffStarCross.rotation.y = Math.PI / 4;
    staffStarCross.scale.set(1.22, 0.72, 1.22);

    const staffHalo = makeGlow(0xffdf70, 0.72, 0.75, true);
    staffHalo.position.set(0, 1.29, 0);

    // Shimmering aqua blessing halo that illuminates underwater once Tidecaller's Pearl is claimed
    const pearlAura = makeGlow(0x64f2e8, 0.98, 0.68, true);
    pearlAura.position.set(0, 1.29, 0);
    pearlAura.visible = false;

    // Warm golden Star-Lantern light so the Starkeeper genuinely illuminates the night around them!
    const staffLight = typeof THREE.PointLight === 'function'
      ? new THREE.PointLight(0xffcf64, 1.45, 16)
      : null;
    if (staffLight) {
      staffLight.position.set(0, 1.29, 0);
      staffPivot.add(staffLight);
    }

    staffPivot.add(shaft, grip, collarTop, buttCap, cageA, cageB, cageEquatorial, staffStar, staffStarCross, staffHalo, pearlAura);
    staffPivot.userData = { staffHalo, pearlAura, staffLight, staffStar, buttCap };
    return staffPivot;
  }

  function makePlayer() {
    const s = ensureShared();
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';

    // Procedural body wrapped inside proceduralRoot so CharacterRig can cleanly swap in assets/starkeeper.glb!
    const proceduralRoot = new THREE.Group();
    g.add(proceduralRoot);

    // Pelvis centered at 0.88 so dodge-roll somersault rotates cleanly around center of mass
    const pelvis = new THREE.Group();
    pelvis.position.set(0, 0.88, 0);
    proceduralRoot.add(pelvis);

    const pelvisCore = makeMesh(
      geo('player_pelvis_core_v2', () => new THREE.CylinderGeometry(0.184, 0.168, 0.13, 14)),
      s.trousers
    );
    pelvisCore.scale.set(1.06, 1, 0.78);
    pelvisCore.position.y = -0.025;
    pelvis.add(pelvisCore);

    // Sculpted Anatomical Legs: hip -> contoured thigh -> knee -> muscular calf/shin -> tall cuffed leather boot
    const thighGeo = geo('player_thigh_sculpted', () =>
      sculptThighGeo(new THREE.CylinderGeometry(0.092, 0.070, 0.37, 14, 8).translate(0, -0.185, 0))
    );
    const kneeCapGeo = geo('player_knee_cap_v2', () => new THREE.SphereGeometry(0.070, 10, 8));
    const shinGeo = geo('player_shin_sculpted', () =>
      sculptShinGeo(new THREE.CylinderGeometry(0.070, 0.052, 0.36, 14, 8).translate(0, -0.18, 0))
    );
    const bootShaftGeo = geo('player_boot_shaft', () =>
      sculptShinGeo(new THREE.CylinderGeometry(0.072, 0.060, 0.21, 14, 6).translate(0, -0.105, 0))
    );
    const bootFoldCuffGeo = geo('player_boot_fold_cuff', () => new THREE.CylinderGeometry(0.088, 0.076, 0.078, 14));
    const bootStrapGeo = geo('player_boot_strap', () => new THREE.TorusGeometry(0.068, 0.009, 6, 14));
    const bootUpperGeo = geo('player_boot_upper_v2', () => new THREE.CylinderGeometry(0.066, 0.076, 0.10, 12));
    const bootFootGeo = geo('player_boot_foot_sculpted', () =>
      sculptBootFootGeo(new THREE.SphereGeometry(0.086, 14, 10))
    );
    const bootSoleGeo = geo('player_boot_sole_sculpted', () =>
      sculptBootSoleGeo(new THREE.CylinderGeometry(1, 1, 0.022, 18, 2))
    );

    function makeLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.128, -0.05, 0);

      const thigh = makeMesh(thighGeo, s.trousers);
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -0.37, 0);
      hip.add(knee);

      const kneeCap = makeMesh(kneeCapGeo, s.trousers);
      kneeCap.scale.set(0.96, 1.04, 1.05);
      const shin = makeMesh(shinGeo, s.trousers);
      const bootShaft = makeMesh(bootShaftGeo, s.leatherDark);
      bootShaft.position.set(0, -0.155, -0.002);
      const bootCuff = makeMesh(bootFoldCuffGeo, s.leatherWarm);
      bootCuff.position.set(0, -0.175, -0.004);
      bootCuff.rotation.x = 0.08;
      const bootStrap = makeMesh(bootStrapGeo, s.brass);
      bootStrap.rotation.x = Math.PI / 2;
      bootStrap.position.set(0, -0.255, 0);
      knee.add(kneeCap, shin, bootShaft, bootCuff, bootStrap);

      const ankle = new THREE.Group();
      ankle.position.set(0, -0.36, 0);
      knee.add(ankle);

      const bootUpper = makeMesh(bootUpperGeo, s.leatherDark);
      bootUpper.position.set(0, -0.025, 0);
      const bootFoot = makeMesh(bootFootGeo, s.leatherDark);
      bootFoot.scale.set(0.92, 0.66, 1.62);
      bootFoot.position.set(0, -0.058, 0.056);
      // Sleek contoured rounded boot sole sitting flush at exact y = 0.000 (0.88 - 0.05 - 0.37 - 0.36 - 0.089 - 0.011)
      const bootSole = makeMesh(bootSoleGeo, s.bootSole);
      bootSole.position.set(0, -0.089, 0.055);
      bootSole.userData.isBootSole = true;
      ankle.add(bootUpper, bootFoot, bootSole);

      pelvis.add(hip);
      return { hip, knee, ankle };
    }
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    // Sculpted Anatomical Torso: athletic V-taper inner teal tunic + open-front layered indigo traveler coat
    const torso = new THREE.Group();
    torso.position.set(0, 0, 0);
    pelvis.add(torso);

    const innerVest = makeMesh(
      geo('player_torso_inner_sculpted', () =>
        sculptAnatomicalTorsoGeo(new THREE.CylinderGeometry(1, 1, 0.56, 22, 12), false)
      ),
      s.coatTeal
    );
    innerVest.position.set(0, 0.285, 0.008);
    torso.add(innerVest);

    const outerCoat = makeMesh(
      geo('player_torso_coat_sculpted', () =>
        sculptAnatomicalTorsoGeo(new THREE.CylinderGeometry(1, 1, 0.50, 22, 12), true)
      ),
      s.coatIndigo
    );
    outerCoat.position.set(0, 0.275, -0.008);
    torso.add(outerCoat);

    // Physical folded coat lapels with gold edge piping cleanly tucked beneath the draped shoulder mantle
    const lapelGeo = geo('player_lapel_sculpted_v2', () =>
      taperCapeGeo(new THREE.BoxGeometry(0.064, 0.34, 0.028, 2, 5, 1), 1.14, 0.74, 0.12)
    );
    const lapelTrimGeo = geo('player_lapel_trim_v2', () => new THREE.BoxGeometry(0.012, 0.33, 0.032));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const lapel = makeMesh(lapelGeo, s.coatIndigo);
      lapel.position.set(side * 0.090, 0.258, 0.136);
      lapel.rotation.z = side * -0.14;
      lapel.rotation.y = side * 0.28;
      const lTrim = makeMesh(lapelTrimGeo, s.goldTrim);
      lTrim.position.set(-side * 0.028, 0, 0.004);
      lapel.add(lTrim);
      torso.add(lapel);
    }

    // Draped sculpted sea-teal shoulder mantle / capelet with scalloped cloth folds + folded collar scarf
    const mantle = makeMesh(
      geo('player_mantle_sculpted', () =>
        sculptMantleGeo(new THREE.CylinderGeometry(0.145, 0.315, 0.175, 22, 6))
      ),
      s.coatTeal
    );
    mantle.position.set(0, 0.495, 0.008);
    const collarScarf = makeMesh(
      geo('player_collar_scarf', () => new THREE.TorusGeometry(0.145, 0.034, 10, 20)),
      s.coatTeal
    );
    collarScarf.rotation.x = Math.PI / 2;
    collarScarf.scale.set(1.12, 0.92, 1.0);
    collarScarf.position.set(0, 0.562, 0.004);
    const collarTrim = makeMesh(
      geo('player_collar_trim_v2', () => new THREE.TorusGeometry(0.158, 0.013, 6, 20)),
      s.goldTrim
    );
    collarTrim.rotation.x = Math.PI / 2;
    collarTrim.scale.set(1.12, 0.92, 1.0);
    collarTrim.position.set(0, 0.542, 0.006);
    torso.add(mantle, collarScarf, collarTrim);

    // Shared continuous flowing crimson cloak + twin sea-teal scarf ribbons (reused on GLB rig!)
    const cloakGroup = makeStarkeeperCloak();
    cloakGroup.position.set(0, 0.542, -0.208);
    torso.add(cloakGroup);
    const scarfSegs = cloakGroup.userData.scarfSegs;
    const [seg0, seg1, seg2] = cloakGroup.userData.capeSegs;

    // 4 Articulated, Pleated Flowing Coat-Skirt Panels (open front split -> move dynamically with leg stride & cloth wave shader!)
    const frontSkirtGeo = geo('player_coat_skirt_front_flow', () =>
      taperCapeGeo(new THREE.PlaneGeometry(0.24, 0.41, 6, 7).translate(0, -0.205, 0), 0.90, 1.38, 0.42, 3.0, 0.016)
    );
    const backSkirtGeo = geo('player_coat_skirt_back_flow', () =>
      taperCapeGeo(new THREE.PlaneGeometry(0.28, 0.44, 6, 7).translate(0, -0.22, 0), 0.92, 1.42, 0.45, 3.5, 0.018)
    );
    const frontHemGeo = geo('player_front_hem_v2', () => new THREE.BoxGeometry(0.31, 0.022, 0.014));
    const backHemGeo = geo('player_back_hem_v2', () => new THREE.BoxGeometry(0.37, 0.024, 0.014));
    const starPipGeo = geo('player_hem_pip', () => new THREE.OctahedronGeometry(0.020, 0));

    function makeSkirtPanel(geoRef, matRef, hemGeo, hemY, x, y, z, rx, ry, rz) {
      const piv = new THREE.Group();
      piv.position.set(x, y, z);
      piv.rotation.x = rx;
      piv.rotation.y = ry;
      piv.rotation.z = rz;
      const mesh = makeMesh(geoRef, matRef);
      const trim = makeMesh(hemGeo, s.goldTrim);
      trim.position.set(0, hemY, 0.008);
      const pip = makeMesh(starPipGeo, s.goldTrim);
      pip.position.set(0, hemY + 0.045, 0.014);
      piv.add(mesh, trim, pip);
      torso.add(piv);
      return piv;
    }

    const skirts = {
      fl: makeSkirtPanel(frontSkirtGeo, s.coatFlowIndigo, frontHemGeo, -0.402, -0.148, 0.068, 0.088, -0.10, -0.58, -0.10),
      fr: makeSkirtPanel(frontSkirtGeo, s.coatFlowIndigo, frontHemGeo, -0.402,  0.148, 0.068, 0.088, -0.10,  0.58,  0.10),
      bl: makeSkirtPanel(backSkirtGeo,  s.coatFlowTeal,   backHemGeo,  -0.432, -0.118, 0.068, -0.106, 0.08, -0.42, -0.05),
      br: makeSkirtPanel(backSkirtGeo,  s.coatFlowTeal,   backHemGeo,  -0.432,  0.118, 0.068, -0.106, 0.08,  0.42,  0.05),
    };

    // Contoured waist cinch belt + gold star buckle
    const belt = makeMesh(
      geo('player_belt_v2', () => new THREE.TorusGeometry(0.188, 0.032, 10, 20)),
      s.leatherWarm
    );
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.06, 0.78, 1.0);
    belt.position.set(0, 0.078, 0);
    const buckleFrame = makeMesh(
      geo('player_buckle_frame', () => new THREE.BoxGeometry(0.088, 0.072, 0.030)),
      s.brass
    );
    buckleFrame.position.set(0, 0.078, 0.168);
    const buckleStar = makeMesh(
      geo('player_buckle_star', () => new THREE.OctahedronGeometry(0.025, 0)),
      s.starCrystal
    );
    buckleStar.position.set(0, 0.078, 0.186);
    torso.add(belt, buckleFrame, buckleStar);

    // Surface-conforming curved leather chest baldric riding strictly ON TOP OF outer coat (ZERO clipping through chest/lapels/cape!)
    const baldricStrap = makeMesh(
      geo('player_baldric_ribbon_v3', () =>
        sculptBaldricGeo(new THREE.BoxGeometry(0.054, 1.0, 0.016, 2, 20, 1))
      ),
      s.leatherWarm
    );
    baldricStrap.position.set(0, 0.275, -0.008);
    const baldricClasp = makeMesh(
      geo('player_baldric_clasp', () => new THREE.CylinderGeometry(0.034, 0.034, 0.018, 10)),
      s.brass
    );
    baldricClasp.rotation.x = Math.PI / 2;
    baldricClasp.position.set(-0.044, 0.338, 0.194);
    torso.add(baldricStrap, baldricClasp);

    // Slung leather field satchel + dangling brass astrolabe/compass charm on left hip
    const satchelGroup = new THREE.Group();
    satchelGroup.position.set(-0.228, -0.005, -0.018);
    satchelGroup.rotation.z = 0.12;
    satchelGroup.rotation.y = -0.15;
    const satchelBag = makeMesh(
      geo('player_satchel_bag', () => new THREE.BoxGeometry(0.115, 0.185, 0.21)),
      s.leatherWarm
    );
    const satchelFlap = makeMesh(
      geo('player_satchel_flap', () => new THREE.BoxGeometry(0.13, 0.09, 0.22)),
      s.leatherDark
    );
    satchelFlap.position.set(-0.005, 0.058, 0);
    const satchelBuckle = makeMesh(
      geo('player_satchel_buckle', () => new THREE.BoxGeometry(0.022, 0.042, 0.042)),
      s.brass
    );
    satchelBuckle.position.set(-0.068, 0.018, 0);
    satchelGroup.add(satchelBag, satchelFlap, satchelBuckle);

    const compassGroup = new THREE.Group();
    compassGroup.position.set(-0.018, -0.028, 0.135);
    compassGroup.rotation.y = 0.35;
    const compassRing = makeMesh(
      geo('player_compass_ring', () => new THREE.TorusGeometry(0.044, 0.010, 6, 14)),
      s.brass
    );
    const compassDisc = makeMesh(
      geo('player_compass_disc', () => new THREE.CylinderGeometry(0.038, 0.038, 0.013, 12)),
      s.compassFace
    );
    compassDisc.rotation.x = Math.PI / 2;
    const compassNeedle = makeMesh(
      geo('player_compass_needle', () => new THREE.OctahedronGeometry(0.020, 0)),
      s.goldTrim
    );
    compassNeedle.scale.set(0.45, 1.5, 0.45);
    compassNeedle.position.z = 0.011;
    compassGroup.add(compassRing, compassDisc, compassNeedle);
    satchelGroup.add(compassGroup);
    torso.add(satchelGroup);

    // Brass shoulder cloak clasps seated visibly on front-top of mantle
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const clasp = makeMesh(
        geo('player_cape_pin', () => new THREE.CylinderGeometry(0.032, 0.032, 0.020, 10)),
        s.brass
      );
      clasp.rotation.x = Math.PI * 0.32;
      clasp.rotation.z = side * -0.24;
      clasp.position.set(side * 0.152, 0.528, 0.125);
      torso.add(clasp);
    }

    // Sculpted Anatomical Arms + Fingerless-Glove Humanoid Hands (NO orb hands!)
    const shoulderCapGeo = geo('player_shoulder_cap_v2', () => new THREE.SphereGeometry(0.088, 12, 10));
    const upperArmGeo = geo('player_upper_arm_sculpted', () =>
      sculptUpperArmGeo(new THREE.CylinderGeometry(0.072, 0.058, 0.27, 14, 7).translate(0, -0.135, 0))
    );
    const elbowJointGeo = geo('player_elbow_joint_v2', () => new THREE.SphereGeometry(0.056, 10, 8));
    const forearmGeo = geo('player_forearm_sculpted', () =>
      sculptForearmGeo(new THREE.CylinderGeometry(0.060, 0.044, 0.24, 14, 7).translate(0, -0.12, 0))
    );
    const bracerCuffGeo = geo('player_bracer_cuff', () => new THREE.CylinderGeometry(0.065, 0.060, 0.048, 12));
    const bracerStrapGeo = geo('player_bracer_strap', () => new THREE.TorusGeometry(0.052, 0.0085, 6, 14));
    const handPalmGeo = geo('player_hand_palm_sculpted', () =>
      sculptHandPalmGeo(new THREE.BoxGeometry(0.066, 0.078, 0.036, 4, 4, 2))
    );
    const thumbBaseGeo = geo('player_thumb_base', () => new THREE.CylinderGeometry(0.012, 0.010, 0.034, 7).translate(0, -0.017, 0));
    const thumbTipGeo = geo('player_thumb_tip', () => new THREE.CylinderGeometry(0.010, 0.0075, 0.026, 7).translate(0, -0.013, 0));
    const fingerGeo = geo('player_finger_seg', () => new THREE.CylinderGeometry(0.0095, 0.0072, 0.048, 7).translate(0, -0.024, 0));
    const knuckleStudGeo = geo('player_knuckle_stud', () => new THREE.SphereGeometry(0.009, 6, 5));

    function makeArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.276, 0.482, 0);
      shoulder.rotation.z = side * 0.14;

      const cap = makeMesh(shoulderCapGeo, s.coatIndigo);
      cap.scale.set(0.96, 0.88, 0.92);
      const upper = makeMesh(upperArmGeo, s.coatIndigo);
      shoulder.add(cap, upper);

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.27, 0);
      shoulder.add(elbow);

      const elbowBall = makeMesh(elbowJointGeo, s.coatIndigo);
      const forearm = makeMesh(forearmGeo, s.leatherWarm);
      const bracerCuff = makeMesh(bracerCuffGeo, s.leatherDark);
      bracerCuff.position.set(0, -0.045, 0);
      const strapA = makeMesh(bracerStrapGeo, s.brass);
      strapA.rotation.x = Math.PI / 2;
      strapA.position.set(0, -0.10, 0);
      const strapB = makeMesh(bracerStrapGeo, s.brass);
      strapB.rotation.x = Math.PI / 2;
      strapB.scale.set(0.88, 0.88, 1);
      strapB.position.set(0, -0.185, 0);

      // Sculpted fingerless-glove humanoid hand (palm + opposable thumb + 4 contoured fingers!)
      const hand = new THREE.Group();
      hand.position.set(0, -0.242, 0.004);
      const gloveWrist = makeMesh(
        geo('player_glove_wrap_v2', () => new THREE.CylinderGeometry(0.046, 0.048, 0.038, 10)),
        s.leatherDark
      );
      gloveWrist.scale.set(1.04, 1.0, 0.78);
      gloveWrist.position.set(0, 0.008, 0);

      const palm = makeMesh(handPalmGeo, s.leatherDark);
      palm.position.set(0, -0.036, 0);
      const stud = makeMesh(knuckleStudGeo, s.brass);
      stud.position.set(0, -0.052, -0.018);

      // Opposable thumb on medial (-side) side
      const thumbPivot = new THREE.Group();
      thumbPivot.position.set(-side * 0.030, -0.022, 0.015);
      thumbPivot.rotation.z = side * -0.52;
      thumbPivot.rotation.x = side > 0 ? -0.58 : -0.34;
      const thumbBase = makeMesh(thumbBaseGeo, s.leatherDark);
      const thumbTip = makeMesh(thumbTipGeo, s.skin);
      thumbTip.position.set(0, -0.031, 0.004);
      thumbTip.rotation.x = -0.38;
      thumbPivot.add(thumbBase, thumbTip);

      // 4 sculpted stepped fingers (right hand curls securely around Star-Lantern Staff grip!)
      const fingersPivot = new THREE.Group();
      fingersPivot.position.set(0, -0.072, 0.003);
      fingersPivot.rotation.x = side > 0 ? -1.08 : -0.44;
      const fingerSpecs = [
        // [xOff, scaleY, spreadZ]
        [-side * 0.023, 0.96,  0.04], // index
        [-side * 0.007, 1.06,  0.01], // middle
        [ side * 0.009, 0.98, -0.02], // ring
        [ side * 0.024, 0.80, -0.05], // pinky
      ];
      for (let fi = 0; fi < fingerSpecs.length; fi++) {
        const fs = fingerSpecs[fi];
        const fMesh = makeMesh(fingerGeo, s.skin);
        fMesh.position.set(fs[0], 0, 0);
        fMesh.scale.set(0.95, fs[1], 0.95);
        fMesh.rotation.z = side * fs[2];
        fingersPivot.add(fMesh);
      }

      hand.add(gloveWrist, palm, stud, thumbPivot, fingersPivot);
      elbow.add(elbowBall, forearm, bracerCuff, strapA, strapB, hand);
      torso.add(shoulder);
      return { shoulder, elbow, hand, fingersPivot };
    }
    const armL = makeArm(-1);
    const armR = makeArm(1);

    // Star-Lantern Staff parented cleanly in right hand grip, angled outward (-Z tilt) to NEVER clip the wide hat brim!
    const staffPivot = makeStarkeeperStaff();
    staffPivot.position.set(0.014, -0.278, 0.046);
    staffPivot.rotation.x = 0.42;
    staffPivot.rotation.z = -0.38;
    const staffHalo = staffPivot.userData.staffHalo;
    const pearlAura = staffPivot.userData.pearlAura;
    const staffLight = staffPivot.userData.staffLight;
    armR.elbow.add(staffPivot);

    // Sculpted Neck & Trapezius Bridge + headGroup (all face, hair, human ears, eyes, eyelids, brows & hat inside headGroup)
    const neck = makeMesh(
      geo('player_neck_sculpted', () =>
        sculptNeckGeo(new THREE.CylinderGeometry(0.064, 0.086, 0.15, 14, 5))
      ),
      s.skin
    );
    neck.position.set(0, 0.592, 0.004);
    torso.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.655, 0.006);
    torso.add(headGroup);

    const head = makeMesh(
      geo('player_head_sculpted', () => sculptStarkeeperHeadGeo(new THREE.SphereGeometry(0.205, 28, 22).rotateY(-Math.PI / 2))),
      s.faceSkin
    );
    head.position.set(0, 0.155, 0);
    headGroup.add(head);

    // Normal human rounded ears (NOT pointed elf ears)
    const earGeo = geo('player_human_ear', () => new THREE.SphereGeometry(0.042, 10, 8));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ear = makeMesh(earGeo, s.skin);
      ear.scale.set(0.42, 1.04, 0.72);
      ear.position.set(side * 0.184, 0.152, -0.008);
      ear.rotation.y = side * -0.18;
      headGroup.add(ear);
    }

    // Expressive stylized-realist glossy eyes nested in recessed sockets + sculpted lashes, blinking eyelids & brows
    const eyeballGeo = geo('player_eyeball_uv', () => sculptEyeballGeo(0.044));
    const upperLashGeo = geo('player_upper_lash', () => new THREE.TorusGeometry(0.046, 0.0072, 6, 14, Math.PI * 0.88));
    const lowerLashGeo = geo('player_lower_lash', () => new THREE.TorusGeometry(0.045, 0.0032, 5, 12, Math.PI * 0.64));
    const eyelidGeo = geo('player_eyelid_cap', () => new THREE.SphereGeometry(0.0475, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52));
    const browGeo = geo('player_brow_arch', () => new THREE.TorusGeometry(0.050, 0.0085, 6, 12, Math.PI * 0.58));

    let eyelidL = null;
    let eyelidR = null;
    let browL = null;
    let browR = null;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.068, 0.168, 0.163);
      eyeGroup.rotation.y = side * 0.14;

      const eyeball = makeMesh(eyeballGeo, s.irisEye);
      eyeball.scale.set(1.04, 1.0, 0.84);
      eyeGroup.add(eyeball);

      const upperLash = makeMesh(upperLashGeo, s.lashDark);
      upperLash.position.set(0, 0.006, 0.016);
      upperLash.rotation.z = Math.PI * 0.06;
      upperLash.rotation.x = -0.18;
      eyeGroup.add(upperLash);

      const lowerLash = makeMesh(lowerLashGeo, s.lashDark);
      lowerLash.position.set(0, -0.005, 0.012);
      lowerLash.rotation.z = Math.PI + Math.PI * 0.18;
      lowerLash.rotation.x = 0.20;
      eyeGroup.add(lowerLash);

      const lidPivot = new THREE.Group();
      lidPivot.rotation.x = -0.82;
      const lidMesh = makeMesh(eyelidGeo, s.skin);
      lidMesh.scale.set(1.05, 1.02, 0.88);
      lidPivot.add(lidMesh);
      eyeGroup.add(lidPivot);
      if (side < 0) eyelidL = lidPivot;
      else eyelidR = lidPivot;

      const browPivot = new THREE.Group();
      browPivot.position.set(0, 0.022, 0.028);
      const brow = makeMesh(browGeo, s.hair);
      brow.rotation.z = Math.PI * 0.21 + side * -0.06;
      brow.scale.set(1.05, 0.84, 1.08);
      browPivot.add(brow);
      eyeGroup.add(browPivot);
      if (side < 0) browL = browPivot;
      else browR = browPivot;

      headGroup.add(eyeGroup);
    }

    // Tight sculpted braided scalp cap tucked cleanly inside the hat + full sculpted box braids under the brim!
    const hairCap = makeMesh(
      geo('player_hair_cap_sculpted_v3', () =>
        sculptHairCapGeo(new THREE.SphereGeometry(0.210, 24, 16))
      ),
      s.hair
    );
    hairCap.position.set(0, 0.178, -0.008);
    headGroup.add(hairCap);

    const braidsGroup = makeStarkeeperBraids();
    braidsGroup.position.set(0, 0.082, 0.006);
    braidsGroup.scale.set(1.52, 1.46, 1.52);
    headGroup.add(braidsGroup);

    // Signature Wide-Brimmed Astronomer/Stargazer Hat seated snugly over the sculpted hair volume (all inside headGroup)
    const hatGroup = makeStarkeeperHat();
    hatGroup.position.set(0, 0.274, -0.008);
    hatGroup.rotation.x = -0.05;
    hatGroup.rotation.z = -0.025;
    headGroup.add(hatGroup);

    g.userData = {
      proceduralRoot,
      pelvis,
      torso,
      headGroup,
      braidsGroup,
      hatGroup,
      thighL: legL.hip,
      thighR: legR.hip,
      kneeL: legL.knee,
      kneeR: legR.knee,
      ankleL: legL.ankle,
      ankleR: legR.ankle,
      armL: armL.shoulder,
      armR: armR.shoulder,
      elbowL: armL.elbow,
      elbowR: armR.elbow,
      handL: armL.hand,
      handR: armR.hand,
      fingersL: armL.fingersPivot,
      fingersR: armR.fingersPivot,
      staffPivot,
      staffHalo,
      staffLight,
      pearlAura,
      eyelidL,
      eyelidR,
      browL,
      browR,
      capeSegs: [seg0, seg1, seg2],
      skirts,
      scarfSegs,
    };
    return g;
  }

  // ---------- 2. Wish (Celestial Golden Songbird) ----------

  function makeWish() {
    const s = ensureShared();
    const g = new THREE.Group();

    const body = makeMesh(
      geo('wish_body', () => new THREE.SphereGeometry(0.22, 14, 12)),
      s.wishGold
    );
    body.scale.set(0.84, 0.92, 1.28);
    body.position.set(0, 0.42, 0);

    const breast = makeMesh(
      geo('wish_breast', () => new THREE.SphereGeometry(0.16, 12, 10)),
      s.wishBreast
    );
    breast.scale.set(0.85, 0.95, 0.9);
    breast.position.set(0, 0.39, 0.11);
    g.add(body, breast);

    // Sculpted head with curved feather crest, tapered beak, catchlight eyes & tiny gold crown
    const head = new THREE.Group();
    head.position.set(0, 0.59, 0.21);
    const skull = makeMesh(
      geo('wish_skull', () => new THREE.SphereGeometry(0.15, 12, 10)),
      s.wishGold
    );
    skull.scale.set(0.96, 0.95, 1.05);
    head.add(skull);

    const beak = makeMesh(
      geo('wish_beak', () => new THREE.ConeGeometry(0.04, 0.15, 8)),
      s.wishBeak
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.015, 0.19);
    head.add(beak);

    addCatchlightEyes(head, {
      x: 0.085,
      y: 0.03,
      z: 0.095,
      radius: 0.036,
      irisMat: s.irisBlue,
      hasIris: true,
    });

    const crestGeo = geo('wish_crest', () => new THREE.ConeGeometry(0.034, 0.17, 6));
    for (let i = -1; i <= 1; i++) {
      const feather = makeMesh(crestGeo, s.wishWing);
      feather.position.set(i * 0.045, 0.145, -0.04);
      feather.rotation.x = -0.75 - Math.abs(i) * 0.18;
      feather.rotation.z = -i * 0.22;
      head.add(feather);
    }

    // Tiny floating golden crown
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 0.215, 0.01);
    const crownRing = makeMesh(
      geo('wish_crown_ring', () => new THREE.TorusGeometry(0.075, 0.016, 6, 14)),
      s.goldTrim
    );
    crownRing.rotation.x = Math.PI / 2;
    const crownGem = makeMesh(
      geo('wish_crown_gem', () => new THREE.OctahedronGeometry(0.028, 0)),
      s.starCrystal
    );
    crownGem.position.set(0, 0.025, 0.07);
    crownGroup.add(crownRing, crownGem);
    head.add(crownGroup);
    g.add(head);

    // Articulated feathered golden wings with covert pad + merged 4-feather primary fan (2 meshes/wing)
    const innerWingGeo = geo('wish_wing_inner', () => new THREE.SphereGeometry(0.18, 10, 8));
    const featherVaneGeo = geo('wish_feather_vane', () => new THREE.ConeGeometry(0.052, 0.34, 6));
    const wings = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const wingPivot = new THREE.Group();
      wingPivot.position.set(side * 0.16, 0.47, 0.02);

      const inner = makeMesh(innerWingGeo, s.wishWing);
      inner.scale.set(1.22, 0.22, 0.72);
      inner.position.set(side * 0.15, 0, -0.02);
      inner.rotation.z = side * 0.08;

      const fanGeo = mergeGeo('wish_wing_fan_' + side, () => {
        const specs = [];
        for (let f = 0; f < 4; f++) {
          const fan = (f - 1.5) * 0.24;
          specs.push([
            featherVaneGeo,
            side * (0.31 - f * 0.03), 0.02 - f * 0.008, 0.02 - f * 0.065,
            0, side * (-0.18 - f * 0.14), -side * (Math.PI * 0.52 - fan * 0.32),
            0.68, 1.05 - f * 0.12, 0.22,
          ]);
        }
        return specs;
      });
      wingPivot.add(inner, makeMesh(fanGeo, s.wishGold));
      g.add(wingPivot);
      wings.push(wingPivot);
    }

    // 5-vane streaming feathered tail fan (merged into 1 draw call!)
    const tail = new THREE.Group();
    tail.position.set(0, 0.40, -0.24);
    const ribbonGeo = geo('wish_tail_ribbon', () => new THREE.ConeGeometry(0.052, 0.44, 6));
    const wishTailGeo = mergeGeo('wish_tail_fan', () => {
      const specs = [];
      for (let i = -2; i <= 2; i++) {
        const lenScale = i === 0 ? 1.0 : Math.abs(i) === 1 ? 1.06 : 0.84;
        specs.push([ribbonGeo, i * 0.052, 0.035 - Math.abs(i) * 0.006, -0.17, -Math.PI * 0.55, 0, i * 0.22, 0.72, lenScale, 0.22]);
      }
      return specs;
    });
    tail.add(makeMesh(wishTailGeo, s.wishWing));
    g.add(tail);

    const halo = makeGlow(0xffdf66, 1.35, 0.72, true);
    halo.position.set(0, 0.46, 0);
    g.add(halo);

    g.userData = { plan: 'wish', wings, tail, head, halo };
    return g;
  }

  // ---------- 3. Fantasy Wildlife Starlings (14 species, 7 body plans) ----------

  const BODY_SHAPES = {
    round: { len: 1.24, height: 0.72, legH: 0.48 },
    mid: { len: 1.32, height: 0.76, legH: 0.56 },
    tall: { len: 1.16, height: 0.78, legH: 0.62 },
    wide: { len: 1.48, height: 0.84, legH: 0.38 },
  };

  function getSpeciesMats(plan, colorHex) {
    const key = plan + ':' + colorHex + ':' + getTextureSig();
    let cached = speciesMatCache.get(key);
    if (cached) return cached;

    const baseCol = new THREE.Color(colorHex);
    const darkCol = baseCol.clone().multiplyScalar(0.55);
    const lightCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.42);
    const isQuad = plan === 'quad';
    const isBird = plan === 'bird';
    const isBug = plan === 'bug';
    const isAqua = plan === 'fish' || plan === 'jelly' || plan === 'eel';

    if (isQuad) {
      const furNorm = typeof THREE.Vector2 === 'function' ? { normalScale: new THREE.Vector2(0.36, 0.36) } : {};
      cached = {
        main: makePbrMat('fur', colorHex, colorHex, { roughness: 0.82, metalness: 0.01, ...furNorm }),
        dark: makePbrMat('fur', darkCol, darkCol, { roughness: 0.86, metalness: 0.01, ...furNorm }),
        light: makePbrMat('fur', lightCol, lightCol, { roughness: 0.78, metalness: 0.01, ...furNorm }),
      };
    } else if (isBird) {
      cached = {
        main: makePbrMat('feather', colorHex, colorHex, { roughness: 0.54, metalness: 0.08 }),
        dark: makePbrMat('feather', darkCol, darkCol, { roughness: 0.58, metalness: 0.10 }),
        light: makePbrMat('feather', lightCol, lightCol, { roughness: 0.50, metalness: 0.06 }),
      };
    } else if (isBug) {
      cached = {
        main: new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.20,
          metalness: 0.28,
          emissive: darkCol,
          emissiveIntensity: 0.14,
        }),
        dark: new THREE.MeshStandardMaterial({ color: darkCol, roughness: 0.30, metalness: 0.24 }),
        light: new THREE.MeshStandardMaterial({ color: lightCol, roughness: 0.24, metalness: 0.20 }),
      };
    } else if (plan === 'jelly') {
      cached = {
        main: new THREE.MeshStandardMaterial({
          color: colorHex,
          emissive: darkCol,
          emissiveIntensity: 0.45,
          roughness: 0.18,
          metalness: 0.08,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
        }),
        dark: new THREE.MeshStandardMaterial({
          color: darkCol,
          emissive: darkCol,
          emissiveIntensity: 0.25,
          roughness: 0.28,
          metalness: 0.06,
        }),
        light: new THREE.MeshStandardMaterial({
          color: lightCol,
          emissive: colorHex,
          emissiveIntensity: 0.65,
          roughness: 0.15,
        }),
      };
    } else if (isAqua) {
      // Fish & Eels get iridescent shimmering scale PBR maps
      cached = {
        main: makePbrMat('scales', colorHex, colorHex, {
          roughness: 0.30,
          metalness: 0.22,
          emissive: darkCol,
          emissiveIntensity: 0.12,
        }),
        dark: new THREE.MeshStandardMaterial({
          color: darkCol,
          roughness: 0.28,
          metalness: 0.14,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
        }),
        light: makePbrMat('scales', lightCol, lightCol, { roughness: 0.32, metalness: 0.16 }),
      };
    } else {
      // Lizards get overlapping diamond reptile scale PBR maps!
      cached = {
        main: makePbrMat('scales', colorHex, colorHex, { roughness: 0.44, metalness: 0.14 }),
        dark: makePbrMat('scales', darkCol, darkCol, { roughness: 0.48, metalness: 0.16 }),
        light: makePbrMat('scales', lightCol, lightCol, { roughness: 0.46, metalness: 0.10 }),
      };
    }

    linearizeMat(cached.main);
    linearizeMat(cached.dark);
    linearizeMat(cached.light);
    speciesMatCache.set(key, cached);
    return cached;
  }

  function makeQuad(sp, scale) {
    const s = ensureShared();
    const mats = getSpeciesMats('quad', sp.color);
    const shape = BODY_SHAPES[sp.body] || BODY_SHAPES.round;
    const arch = sp.archetype || (sp.body === 'tall' ? 'deer' : sp.body === 'wide' ? 'bear' : 'cat');
    const isWolf = arch === 'wolf';
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';

    const legH = shape.legH;
    const thighLen = legH * 0.52;
    const shinLen = legH * 0.48;
    const pawR = 0.062;
    const pawScaleY = 0.6;
    const pawHalfH = pawR * pawScaleY;
    const hipY = thighLen + shinLen + pawHalfH;
    const bodyY = hipY + (arch === 'bear' ? 0.05 : 0.03);
    const bodyR = arch === 'bear' ? 0.38 : 0.34;

    // Articulated spine bodyGroup with sculpted four-legged animal ribcage, tucked loin & muscular croup!
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, bodyY, 0);
    g.add(bodyGroup);

    const shapeKey = sp.body || 'round';
    const body = makeMesh(
      geo('quad_body_sculpted_' + arch + '_' + shapeKey, () =>
        sculptQuadTorsoGeo(new THREE.SphereGeometry(bodyR, 18, 14), arch)
      ),
      mats.main
    );
    body.scale.set(1.0, shape.height * 0.92, shape.len * 1.06);
    bodyGroup.add(body);

    const belly = makeMesh(
      geo('quad_belly_sculpted_' + arch + '_' + shapeKey, () =>
        sculptQuadTorsoGeo(new THREE.SphereGeometry(bodyR * 0.78, 12, 10), arch)
      ),
      mats.light
    );
    belly.scale.set(0.84, shape.height * 0.62, shape.len * 0.88);
    belly.position.set(0, -0.095 * shape.height, 0.08);
    bodyGroup.add(belly);

    // Subtle chest ruff & flank fur contours (merged into 2 static draw calls per quad)
    const furTuftGeo = geo('quad_fur_tuft', () => new THREE.ConeGeometry(0.068, 0.19, 6));
    const ruffKey = 'quad_ruff_v2_' + arch + '_' + shapeKey;
    const ruffGeo = mergeGeo(ruffKey, () => {
      const ruffAngles = [-0.48, -0.22, 0, 0.22, 0.48];
      return ruffAngles.map((a) => [
        furTuftGeo,
        Math.sin(a) * 0.19, 0.01 - Math.abs(a) * 0.06, shape.len * bodyR * 0.84 + Math.cos(a) * 0.05,
        2.55, 0, -a * 0.55,
        0.78, 0.92 - Math.abs(a) * 0.28, 0.45,
      ]);
    });
    bodyGroup.add(makeMesh(ruffGeo, mats.light));

    // Sweeping sculpted muscular animal neck bridging chest/withers seamlessly into skull
    const neckLen = arch === 'deer' ? 0.40 : arch === 'bear' ? 0.24 : isWolf ? 0.32 : 0.30;
    const neck = makeMesh(
      geo('quad_neck_sculpted_' + arch, () =>
        sculptQuadNeckGeo(new THREE.CylinderGeometry(0.115, 0.165, neckLen, 12, 6), arch)
      ),
      mats.main
    );
    neck.position.set(0, arch === 'deer' ? 0.28 : isWolf ? 0.22 : 0.20, shape.len * bodyR * 0.78);
    neck.rotation.x = arch === 'deer' ? 0.24 : arch === 'bear' ? 0.72 : isWolf ? 0.42 : 0.46;
    bodyGroup.add(neck);

    // Sculpted anatomical animal skull (integrated brow-stop, cheekbones, tapered muzzle & lower jaw — NO orb+cone!)
    const head = new THREE.Group();
    head.position.set(
      0,
      arch === 'deer' ? 0.48 : arch === 'bear' ? 0.29 : isWolf ? 0.37 : 0.35,
      shape.len * bodyR + (arch === 'deer' ? 0.14 : isWolf ? 0.17 : 0.15)
    );

    const cranium = makeMesh(
      geo('quad_head_sculpted_' + arch, () =>
        sculptQuadHeadGeo(new THREE.SphereGeometry(0.235, 18, 14), arch)
      ),
      mats.main
    );
    // Light muzzle chin fur accent & sculpted animal nose leather pad
    const muzzlePad = makeMesh(
      geo('quad_muzzle_pad_' + arch, () => new THREE.SphereGeometry(arch === 'bear' ? 0.095 : 0.072, 10, 8)),
      mats.light
    );
    muzzlePad.scale.set(arch === 'cat' ? 1.15 : 0.92, 0.72, arch === 'cat' ? 0.85 : 1.25);
    muzzlePad.position.set(0, -0.068, arch === 'cat' ? 0.215 : arch === 'bear' ? 0.245 : isWolf ? 0.285 : 0.265);
    const nose = makeMesh(
      geo('quad_nose_v2', () => new THREE.SphereGeometry(0.036, 8, 6)),
      s.pupil
    );
    nose.scale.set(1.18, 0.78, 0.85);
    nose.position.set(0, -0.038, arch === 'cat' ? 0.278 : arch === 'bear' ? 0.335 : isWolf ? 0.388 : 0.365);
    head.add(cranium, muzzlePad, nose);

    // Soft cheek tufts & delicate feline/fox/wolf whiskers (merged)
    const cheekTuftGeo = geo('quad_cheek_tuft', () => new THREE.ConeGeometry(0.044, 0.14, 5));
    const whiskerGeo = geo('quad_whisker', () => new THREE.CylinderGeometry(0.0036, 0.0018, 0.17, 4));
    if (arch === 'cat' || arch === 'fox' || isWolf) {
      const cheeksMergedGeo = mergeGeo('quad_cheeks_merged_v2', () => {
        const specs = [];
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? -1 : 1;
          for (let t = 0; t < 2; t++) {
            specs.push([
              cheekTuftGeo,
              side * 0.20, -0.055 - t * 0.042, 0.03 - t * 0.025,
              0, -side * 0.35, -side * (1.32 + t * 0.24),
              0.75, 0.82 - t * 0.16, 0.42,
            ]);
          }
        }
        return specs;
      });
      head.add(makeMesh(cheeksMergedGeo, mats.light));
    }
    if (sp.body !== 'tall') {
      const whiskersMergedGeo = mergeGeo('quad_whiskers_merged_v2', () => {
        const specs = [];
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? -1 : 1;
          for (let w = -1; w <= 1; w++) {
            specs.push([whiskerGeo, side * 0.145, -0.062 + w * 0.022, 0.23, 0, side * -0.18, side * (Math.PI * 0.5 + w * 0.15), 1, 1, 1]);
          }
        }
        return specs;
      });
      head.add(makeMesh(whiskersMergedGeo, mats.light));
    }

    addCatchlightEyes(head, {
      x: arch === 'deer' ? 0.118 : 0.112,
      y: 0.052,
      z: arch === 'cat' ? 0.178 : 0.172,
      radius: 0.046,
      irisMat: mats.dark,
      hasIris: true,
    });

    const bigEars = sp.deco === 'ears';
    const isBear = arch === 'bear';
    const earOuterGeo = isBear
      ? geo('quad_ear_bear', () => new THREE.SphereGeometry(0.095, 10, 8))
      : geo(bigEars ? 'quad_ear_cup_big' : isWolf ? 'quad_ear_cup_wolf' : 'quad_ear_cup_sm', () =>
          sculptAnimalEarGeo(new THREE.ConeGeometry(bigEars ? 0.10 : isWolf ? 0.092 : 0.082, bigEars ? 0.34 : isWolf ? 0.26 : 0.20, 10, 4))
        );
    const earInnerGeo = isBear
      ? geo('quad_ear_bear_in', () => new THREE.SphereGeometry(0.058, 6, 6))
      : geo(bigEars ? 'quad_ear_in_cup_big' : isWolf ? 'quad_ear_in_cup_wolf' : 'quad_ear_in_cup_sm', () =>
          sculptAnimalEarGeo(new THREE.ConeGeometry(bigEars ? 0.058 : isWolf ? 0.052 : 0.046, bigEars ? 0.24 : isWolf ? 0.18 : 0.14, 8, 3))
        );
    const earTipGeo = geo('quad_ear_tip_tuft', () => new THREE.ConeGeometry(0.022, 0.085, 5));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ear = makeMesh(earOuterGeo, mats.dark);
      if (isBear) {
        ear.scale.set(1.0, 1.0, 0.52);
        ear.position.set(side * 0.175, 0.195, -0.02);
        const inner = makeMesh(earInnerGeo, mats.light);
        inner.position.set(0, 0, 0.042);
        ear.add(inner);
      } else {
        ear.position.set(side * 0.118, bigEars ? 0.225 : 0.185, -0.025);
        ear.rotation.z = side * -0.26;
        ear.rotation.x = -0.06;
        const inner = makeMesh(earInnerGeo, mats.light);
        inner.position.set(0, -0.018, 0.022);
        ear.add(inner);
      }
      head.add(ear);
    }

    if (sp.deco === 'horn') {
      const hornGroup = new THREE.Group();
      hornGroup.position.set(0, 0.24, 0.11);
      hornGroup.rotation.x = 0.48;
      const horn = makeMesh(
        geo('quad_horn', () => new THREE.ConeGeometry(0.075, 0.34, 8)),
        s.goldTrim
      );
      horn.position.y = 0.14;
      hornGroup.add(horn);
      for (let r = 0; r < 3; r++) {
        const spiral = makeMesh(
          geo('quad_horn_ring_' + r, () => new THREE.TorusGeometry(0.062 - r * 0.015, 0.014, 6, 12)),
          s.starCrystal
        );
        spiral.rotation.x = Math.PI / 2 - 0.18;
        spiral.position.y = 0.05 + r * 0.085;
        hornGroup.add(spiral);
      }
      head.add(hornGroup);
    } else if (sp.deco === 'crown') {
      const crown = makeMesh(
        geo('quad_crown', () => new THREE.TorusGeometry(0.125, 0.036, 6, 12)),
        s.goldTrim
      );
      crown.rotation.x = Math.PI / 2;
      crown.position.set(0, 0.29, 0);
      head.add(crown);
    }
    bodyGroup.add(head);

    // 4 anatomically sculpted legs: smoothly rounded shoulder/haunch (zero flat caps!) -> elbow/stifle -> angled forelimb / hock -> paw (exact y = 0!)
    const foreUpperGeo = geo('quad_fore_up_v2_' + arch + '_' + shape.legH, () =>
      sculptQuadLegUpperGeo(new THREE.SphereGeometry(1, 12, 10), thighLen, true, arch)
    );
    const foreLowerGeo = geo('quad_fore_lo_v2_' + arch + '_' + shape.legH, () =>
      sculptQuadLegLowerGeo(new THREE.CylinderGeometry(0.044, 0.032, shinLen, 10, 5).translate(0, -shinLen * 0.5, 0), shinLen, true, arch)
    );
    const hindUpperGeo = geo('quad_hind_up_v2_' + arch + '_' + shape.legH, () =>
      sculptQuadLegUpperGeo(new THREE.SphereGeometry(1, 12, 10), thighLen, false, arch)
    );
    const hindLowerGeo = geo('quad_hind_lo_v2_' + arch + '_' + shape.legH, () =>
      sculptQuadLegLowerGeo(new THREE.CylinderGeometry(0.046, 0.032, shinLen, 10, 5).translate(0, -shinLen * 0.5, 0), shinLen, false, arch)
    );
    const pawGeo = geo('quad_paw', () => new THREE.SphereGeometry(pawR, 10, 8));
    const legs = [];
    const offsets = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    const hipSpread = arch === 'deer' ? 0.128 : arch === 'bear' ? 0.195 : 0.138;
    for (let i = 0; i < offsets.length; i++) {
      const sx = offsets[i][0];
      const sz = offsets[i][1];
      const isFront = sz > 0;
      const hip = new THREE.Group();
      hip.position.set(sx * hipSpread, hipY, sz * (0.28 * shape.len));
      const thigh = makeMesh(isFront ? foreUpperGeo : hindUpperGeo, mats.main);
      const knee = new THREE.Group();
      knee.position.set(0, -thighLen, 0);
      const shin = makeMesh(isFront ? foreLowerGeo : hindLowerGeo, mats.dark);
      const paw = makeMesh(pawGeo, mats.light);
      paw.scale.set(arch === 'deer' ? 0.78 : 1.02, pawScaleY, arch === 'deer' ? 1.15 : 1.42);
      paw.position.set(0, -shinLen, 0.025);
      knee.add(shin, paw);
      hip.add(thigh, knee);
      hip.userData = { knee, side: sx, front: isFront, hipBaseY: hipY };
      g.add(hip);
      legs.push(hip);
    }

    // Species-authentic sculpted tail: sleek S-curved feline tail, lush fox plume, or woodland bear/deer bobtail!
    const tail = new THREE.Group();
    tail.position.set(0, 0.14, -shape.len * bodyR - 0.01);
    const tailTip = new THREE.Group();
    if (arch === 'bear' || arch === 'deer') {
      const bob = makeMesh(
        geo('quad_tail_bob', () => new THREE.SphereGeometry(0.115, 8, 8)),
        mats.light
      );
      bob.scale.set(0.95, 1.05, 0.95);
      bob.position.set(0, 0.04, -0.05);
      tailTip.position.set(0, 0.04, -0.08);
      tail.add(bob, tailTip);
    } else if (arch === 'cat') {
      const catTailMesh = makeMesh(
        geo('quad_tail_cat_curved', () =>
          sculptCatTailGeo(new THREE.CylinderGeometry(0.036, 0.052, 0.52, 10, 8).translate(0, 0.26, 0))
        ),
        mats.dark
      );
      tailTip.position.set(0, 0.46, -0.11);
      const catTip = makeMesh(
        geo('quad_tail_cat_tip', () => new THREE.SphereGeometry(0.042, 8, 6)),
        mats.light
      );
      catTip.scale.set(0.9, 1.35, 0.9);
      tailTip.add(catTip);
      tail.add(catTailMesh, tailTip);
    } else {
      const tailBase = makeMesh(
        geo('quad_tail_base', () => new THREE.CylinderGeometry(0.058, 0.082, 0.25, 8).translate(0, 0.125, 0)),
        mats.dark
      );
      tailBase.scale.set(1.25, 1.08, 1.25);
      tailBase.rotation.x = -0.95;
      tailTip.position.set(0, 0.14, -0.17);
      const tuft = makeMesh(
        geo('quad_tail_tuft', () => new THREE.SphereGeometry(0.115, 8, 8)),
        mats.light
      );
      tuft.scale.set(1.36, 1.42, 2.04);
      tuft.position.set(0, 0.04, -0.06);
      const tailPlumeMergedGeo = mergeGeo('quad_tail_plumes_merged', () => [
        [cheekTuftGeo, -0.065, 0.055, -0.16, -1.65, 0, -0.35, 1.15, 1.35, 0.85],
        [cheekTuftGeo, 0, 0.055, -0.16, -1.65, 0, 0, 1.15, 1.35, 0.85],
        [cheekTuftGeo, 0.065, 0.055, -0.16, -1.65, 0, 0.35, 1.15, 1.35, 0.85],
      ]);
      const plumeMesh = makeMesh(tailPlumeMergedGeo, mats.light);
      plumeMesh.scale.setScalar(1.38);
      tailTip.add(tuft, plumeMesh);
      tail.add(tailBase, tailTip);
    }
    bodyGroup.add(tail);

    if (sp.deco === 'spots') {
      const spotGeo = geo('quad_spot', () => new THREE.SphereGeometry(0.085, 8, 6));
      const rx = bodyR * 0.84;
      const ry = bodyR * shape.height * 0.84;
      const rz = bodyR * shape.len;
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 ? 0.16 : -0.16;
        const sz = (i - 1.5) * 0.19;
        const yFrac = Math.sqrt(Math.max(0.12, 1 - (sx / rx) * (sx / rx) - (sz / rz) * (sz / rz)));
        const spot = makeMesh(spotGeo, mats.dark);
        spot.position.set(sx, ry * yFrac + 0.004, sz);
        spot.scale.set(1, 0.45, 1.15);
        spot.rotation.z = i % 2 ? -0.42 : 0.42;
        bodyGroup.add(spot);
      }
    } else if (sp.deco === 'fins') {
      const spikeGeo = geo('quad_spike', () => new THREE.ConeGeometry(0.065, 0.22, 5));
      for (let i = 0; i < 3; i++) {
        const spike = makeMesh(spikeGeo, mats.dark);
        spike.position.set(0, 0.34 * shape.height, 0.22 - i * 0.22);
        spike.rotation.x = -0.25;
        bodyGroup.add(spike);
      }
    }

    g.userData = {
      plan: 'quad',
      archetype: arch,
      bodyGroup,
      bodyBaseY: bodyY,
      legs,
      tail,
      tailTip,
      head,
      strideLen: Math.max(0.75, shape.legH * (arch === 'deer' ? 2.85 : arch === 'bear' ? 2.25 : 2.55)),
    };
    g.scale.setScalar(scale);
    return g;
  }

  function makeBird(sp, scale) {
    const s = ensureShared();
    const mats = getSpeciesMats('bird', sp.color);
    const arch = sp.archetype || ((sp.beak && sp.beak > 0.4) ? 'kiwi' : sp.deco === 'crown' ? 'owl' : 'songbird');
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';

    const bodyBaseY = 0.62;
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, bodyBaseY, 0);
    g.add(bodyGroup);

    const body = makeMesh(
      geo('bird_body_sculpted', () => sculptBirdBodyGeo(new THREE.SphereGeometry(0.38, 16, 12))),
      mats.main
    );
    bodyGroup.add(body);

    const breast = makeMesh(
      geo('bird_breast', () => new THREE.SphereGeometry(0.28, 12, 10)),
      mats.light
    );
    breast.scale.set(0.86, 0.94, 0.85);
    breast.position.set(0, -0.04, 0.14);
    bodyGroup.add(breast);

    // Layered scalloped breast plumage feathers (merged into 1 draw call!)
    const plumeGeo = geo('bird_plume_blade', () => new THREE.ConeGeometry(0.068, 0.24, 6));
    const breastPlumesGeo = mergeGeo('bird_breast_plumes', () => {
      const specs = [];
      for (let i = -2; i <= 2; i++) {
        specs.push([plumeGeo, i * 0.088, 0.06 - Math.abs(i) * 0.03, 0.34 - Math.abs(i) * 0.045, 2.85, 0, -i * 0.18, 0.9, 0.85, 0.24]);
      }
      return specs;
    });
    bodyGroup.add(makeMesh(breastPlumesGeo, mats.light));

    const head = new THREE.Group();
    head.position.set(0, 0.44, 0.08);
    const skull = makeMesh(
      geo('bird_skull', () => new THREE.SphereGeometry(0.24, 12, 10)),
      mats.main
    );
    head.add(skull);

    // Cheek feather tufts framing the eyes (merged into 1 draw call!)
    const birdCheeksGeo = mergeGeo('bird_cheek_plumes', () => [
      [plumeGeo, -0.21, -0.03, 0.02, 0, 0.35, 1.35, 0.58, 0.62, 0.22],
      [plumeGeo, 0.21, -0.03, 0.02, 0, -0.35, -1.35, 0.58, 0.62, 0.22],
    ]);
    head.add(makeMesh(birdCheeksGeo, mats.light));

    const beakLen = sp.beak || 0.26;
    const beak = makeMesh(
      geo('bird_beak_' + beakLen, () => new THREE.ConeGeometry(0.072, beakLen, 8)),
      s.wishBeak
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, 0.19 + beakLen * 0.45);
    head.add(beak);

    addCatchlightEyes(head, {
      x: 0.13,
      y: 0.055,
      z: 0.155,
      radius: 0.052,
      irisMat: mats.dark,
      hasIris: true,
    });

    if (sp.deco === 'crest' || sp.deco === 'ears') {
      const crestGeo = geo('bird_crest', () => new THREE.ConeGeometry(0.048, 0.26, 6));
      for (let i = -1; i <= 1; i++) {
        const feather = makeMesh(crestGeo, i === 0 ? mats.main : mats.dark);
        feather.scale.set(0.85, 1.05 - Math.abs(i) * 0.12, 0.28);
        feather.position.set(i * 0.072, 0.23, -0.04);
        feather.rotation.x = -0.58 - Math.abs(i) * 0.14;
        feather.rotation.z = -i * 0.22;
        head.add(feather);
      }
    } else if (sp.deco === 'crown') {
      const crown = makeMesh(
        geo('bird_crown', () => new THREE.TorusGeometry(0.12, 0.036, 6, 12)),
        s.goldTrim
      );
      crown.rotation.x = Math.PI / 2;
      crown.position.set(0, 0.26, 0);
      const gem = makeMesh(
        geo('bird_crown_gem', () => new THREE.OctahedronGeometry(0.038, 0)),
        s.starCrystal
      );
      gem.position.set(0, 0.29, 0.11);
      head.add(crown, gem);
    }
    bodyGroup.add(head);

    // Sculpted layered feathered wings: inner covert pad + merged 4-feather primary flight fan!
    const wingInnerGeo = geo('bird_wing_inner', () => new THREE.SphereGeometry(0.24, 10, 8));
    const wingFeatherGeo = geo('bird_wing_feather', () => new THREE.ConeGeometry(0.068, 0.42, 6));
    const wings = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.31, 0.10, 0.0);

      const inner = makeMesh(wingInnerGeo, mats.dark);
      inner.scale.set(0.96, 0.24, 0.80);
      inner.position.set(side * 0.14, 0, -0.02);

      const fanGeo = mergeGeo('bird_wing_primaries_' + side, () => {
        const specs = [];
        for (let f = 0; f < 4; f++) {
          const lenScale = 1.08 - f * 0.14;
          specs.push([
            wingFeatherGeo,
            side * (0.32 - f * 0.032), 0.015 - f * 0.012, 0.03 - f * 0.075,
            0, side * (-0.14 - f * 0.16), -side * (Math.PI * 0.50 + (f - 1.5) * 0.14),
            0.74, lenScale, 0.20,
          ]);
        }
        return specs;
      });
      const primaries = makeMesh(fanGeo, mats.main);
      primaries.userData.featherCount = 4;
      pivot.add(inner, primaries);
      // Kiwi has tiny tucked vestigial ground-bird wings; Owl has broad soaring wings!
      if (arch === 'kiwi') {
        pivot.scale.set(0.46, 0.55, 0.55);
        pivot.position.set(side * 0.27, 0.04, -0.04);
      } else if (arch === 'owl') {
        pivot.scale.set(1.24, 1.0, 1.15);
      }
      bodyGroup.add(pivot);
      wings.push(pivot);
    }

    // Jointed 2-segment bird legs (drumstick -> ankle knee -> merged tarsus + 4-toed foot grounded at y = 0!)
    const drumGeo = geo('bird_drumstick', () => new THREE.CylinderGeometry(0.056, 0.032, 0.13, 6).translate(0, -0.065, 0));
    const tarsusGeo = geo('bird_tarsus', () => new THREE.CylinderGeometry(0.024, 0.02, 0.15, 6).translate(0, -0.075, 0));
    const toeGeo = geo('bird_toe', () => new THREE.ConeGeometry(0.02, 0.11, 5));
    const birdFootMergedGeo = mergeGeo('bird_foot_merged', () => [
      [tarsusGeo, 0, 0, 0, 0, 0, 0, 1, 1, 1],
      [toeGeo, -0.025, -0.15, 0.052, Math.PI * 0.5, 0, 0.42, 1, 1, 1],
      [toeGeo, 0, -0.15, 0.052, Math.PI * 0.5, 0, 0, 1, 1, 1],
      [toeGeo, 0.025, -0.15, 0.052, Math.PI * 0.5, 0, -0.42, 1, 1, 1],
      [toeGeo, 0, -0.15, -0.042, -Math.PI * 0.5, 0, 0, 0.85, 0.72, 0.85],
    ]);
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const leg = new THREE.Group();
      leg.position.set(side * 0.125, 0.30, 0.02);
      const drum = makeMesh(drumGeo, mats.main);
      const knee = new THREE.Group();
      knee.position.set(0, -0.13, 0);
      knee.add(makeMesh(birdFootMergedGeo, s.wishBeak));
      leg.add(drum, knee);
      leg.userData = { knee, side };
      g.add(leg);
      legs.push(leg);
    }

    // 5-blade overlapping fanned tail feathers (merged into 1 draw call!)
    const tail = new THREE.Group();
    tail.position.set(0, 0.0, -0.35);
    const tailFeatherGeo = geo('bird_tail_feather', () => new THREE.ConeGeometry(0.078, 0.44, 6));
    const birdTailFanGeo = mergeGeo('bird_tail_fan_5', () => {
      const specs = [];
      for (let i = -2; i <= 2; i++) {
        specs.push([tailFeatherGeo, i * 0.068, 0.02 - Math.abs(i) * 0.008, -0.17, -1.92, 0, i * 0.24, 0.76, 1.04 - Math.abs(i) * 0.09, 0.22]);
      }
      return specs;
    });
    const tailFanMesh = makeMesh(birdTailFanGeo, mats.dark);
    tailFanMesh.userData.featherCount = 5;
    tail.add(tailFanMesh);
    bodyGroup.add(tail);

    g.userData = {
      plan: 'bird',
      archetype: arch,
      bodyGroup,
      bodyBaseY,
      headBaseZ: 0.08,
      wings,
      legs,
      tail,
      head,
      strideLen: arch === 'kiwi' ? 0.54 : 0.62,
    };
    g.scale.setScalar(scale);
    return g;
  }

  function makeBug(sp, scale) {
    const s = ensureShared();
    const mats = getSpeciesMats('bug', sp.color);
    const arch = sp.archetype || (sp.deco === 'ears' ? 'firefly' : 'beetle');
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';

    // Thorax + segmented abdomen + glossy curved elytra wing-cases
    const abdomen = makeMesh(
      geo('bug_abdomen', () => new THREE.SphereGeometry(0.28, 12, 10)),
      mats.dark
    );
    abdomen.scale.set(0.88, 0.72, 1.18);
    abdomen.position.set(0, 0.29, -0.16);

    const thorax = makeMesh(
      geo('bug_thorax', () => new THREE.SphereGeometry(0.21, 10, 8)),
      mats.dark
    );
    thorax.scale.set(0.95, 0.82, 0.85);
    thorax.position.set(0, 0.30, 0.12);
    g.add(abdomen, thorax);

    const elytraGeo = geo('bug_elytra', () => new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI, 0, Math.PI * 0.58));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const shell = makeMesh(elytraGeo, mats.main);
      shell.rotation.order = 'ZYX';
      shell.scale.set(1.24, 0.86, 0.56);
      shell.position.set(side * 0.025, 0.32, -0.15);
      shell.rotation.y = side * Math.PI * 0.5;
      shell.rotation.z = -side * 0.14;
      g.add(shell);
    }

    if (sp.deco === 'spots') {
      const spotGeo = geo('bug_spot', () => new THREE.SphereGeometry(0.056, 6, 5));
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        const sx = side * 0.105;
        const sz = -0.06 - (i > 1 ? 0.18 : 0);
        const dz = sz - -0.15;
        const dx = Math.abs(sx) - 0.025;
        const rx = 0.26 * 0.56;
        const ry = 0.26 * 0.86;
        const rz = 0.26 * 1.24;
        const yFrac = Math.sqrt(Math.max(0.15, 1 - (dx / rx) * (dx / rx) - (dz / rz) * (dz / rz)));
        const spot = makeMesh(spotGeo, s.pupil);
        spot.position.set(sx, 0.32 + ry * yFrac + 0.005, sz);
        spot.scale.set(1, 0.42, 1);
        spot.rotation.z = -side * 0.36;
        g.add(spot);
      }
    }

    // Head with glossy compound eyes & firefly lantern antennae
    const head = new THREE.Group();
    head.position.set(0, 0.32, 0.28);
    const skull = makeMesh(
      geo('bug_skull', () => new THREE.SphereGeometry(0.17, 12, 10)),
      mats.dark
    );
    head.add(skull);

    const eyeGeo = geo('bug_eye', () => new THREE.SphereGeometry(0.068, 8, 8));
    const eyeCatchGeo = geo('bug_eye_catch', () => new THREE.SphereGeometry(0.02, 6, 5));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const eye = makeMesh(eyeGeo, s.pupil);
      eye.position.set(side * 0.11, 0.04, 0.11);
      const dot = makeMesh(eyeCatchGeo, s.catchlight);
      dot.position.set(side * 0.125, 0.06, 0.165);
      head.add(eye, dot);
    }

    const antGeo = geo('bug_ant', () => new THREE.CylinderGeometry(0.012, 0.014, 0.28, 6).translate(0, 0.14, 0));
    const tipGeo = geo('bug_ant_tip', () => new THREE.SphereGeometry(0.044, 6, 6));
    const antennae = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ant = new THREE.Group();
      ant.position.set(side * 0.065, 0.13, 0.07);
      const stalk = makeMesh(antGeo, mats.dark);
      ant.add(stalk);
      if (sp.deco === 'ears') {
        const bulb = makeMesh(tipGeo, s.starCrystal);
        bulb.position.y = 0.29;
        ant.add(bulb);
      } else {
        const knob = makeMesh(tipGeo, mats.light);
        knob.scale.setScalar(0.65);
        knob.position.y = 0.29;
        ant.add(knob);
      }
      head.add(ant);
      antennae.push(ant);
    }
    g.add(head);

    // 6 jointed legs
    const femurGeo = geo('bug_femur', () => new THREE.CylinderGeometry(0.018, 0.015, 0.14, 5).translate(0, -0.07, 0));
    const tibiaGeo = geo('bug_tibia', () => new THREE.CylinderGeometry(0.014, 0.01, 0.16, 5).translate(0, -0.08, 0));
    const legs = [];
    const zRow = [0.14, 0, -0.15];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      for (let j = 0; j < zRow.length; j++) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.17, 0.27, zRow[j]);
        leg.rotation.z = side * 0.85;
        const femur = makeMesh(femurGeo, mats.dark);
        const tibia = makeMesh(tibiaGeo, mats.dark);
        tibia.position.set(0, -0.13, 0);
        tibia.rotation.z = -side * 0.65;
        leg.add(femur, tibia);
        g.add(leg);
        legs.push(leg);
      }
    }

    // Translucent buzzing wings for firefly species
    let wings = null;
    if (arch === 'firefly') {
      const fWingGeo = geo('bug_firefly_wing', () => new THREE.SphereGeometry(0.18, 8, 6));
      const fWingMat = new THREE.MeshStandardMaterial({
        color: 0xe6fff2,
        emissive: 0x6ef0a8,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });
      linearizeMat(fWingMat);
      wings = [];
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const wp = new THREE.Group();
        wp.position.set(side * 0.14, 0.44, -0.02);
        const blade = makeMesh(fWingGeo, fWingMat, false, false);
        blade.scale.set(1.25, 0.12, 0.55);
        blade.position.set(side * 0.16, 0, -0.06);
        wp.add(blade);
        g.add(wp);
        wings.push(wp);
      }
    }

    g.userData = { plan: 'bug', archetype: arch, legs, antennae, wings, head, legStyle: 'bug', strideLen: 0.46 };
    g.scale.setScalar(scale * 0.82);
    return g;
  }

  function makeLizard(sp, scale) {
    const s = ensureShared();
    const mats = getSpeciesMats('lizard', sp.color);
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';

    const bodyBaseY = 0.36;
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, bodyBaseY, 0);
    g.add(bodyGroup);

    const body = makeMesh(
      geo('liz_body_sculpted', () => sculptLizardBodyGeo(new THREE.SphereGeometry(0.32, 16, 12))),
      mats.main
    );
    bodyGroup.add(body);

    const belly = makeMesh(
      geo('liz_belly', () => new THREE.SphereGeometry(0.25, 10, 8)),
      mats.light
    );
    belly.scale.set(0.7, 0.4, 1.66);
    belly.position.set(0, -0.09, 0.02);
    bodyGroup.add(belly);

    // Interlocking beveled dorsal scute armor plates + crest spikes (merged into 1 draw call!)
    const scuteGeo = geo('liz_scute_plate', () => new THREE.OctahedronGeometry(0.11, 0));
    const frillGeo = geo('liz_frill', () => new THREE.ConeGeometry(0.055, 0.24, 5));
    const frillCount = sp.deco === 'fins' ? 5 : 3;
    const dorsalArmorGeo = mergeGeo('liz_dorsal_armor_' + frillCount, () => {
      const specs = [];
      for (let i = 0; i < 6; i++) {
        const zPos = 0.44 - i * 0.175;
        const arch = Math.cos((i - 2.5) * 0.35);
        specs.push([scuteGeo, 0, 0.165 * arch + 0.02, zPos, -0.18, 0, 0, 1.15 - Math.abs(i - 2.5) * 0.12, 0.36, 1.18]);
      }
      for (let i = 0; i < frillCount; i++) {
        specs.push([frillGeo, 0, 0.21, 0.38 - i * 0.22, -0.32, 0, 0, 0.55, 1.05 - Math.abs(i - 2) * 0.12, 1.22]);
      }
      return specs;
    });
    const dorsalArmorMesh = makeMesh(dorsalArmorGeo, mats.dark);
    dorsalArmorMesh.userData.scuteCount = 6 + frillCount;
    bodyGroup.add(dorsalArmorMesh);

    // Angular scaled salamander/drake head with brow ridges & layered neck scale frill (merged!)
    const head = new THREE.Group();
    head.position.set(0, 0.08, 0.64);
    const cranium = makeMesh(
      geo('liz_skull', () => new THREE.SphereGeometry(0.20, 12, 10)),
      mats.main
    );
    cranium.scale.set(0.95, 0.72, 1.25);
    const snout = makeMesh(
      geo('liz_snout', () => new THREE.ConeGeometry(0.13, 0.25, 6)),
      mats.main
    );
    snout.scale.set(1.05, 0.65, 1.0);
    snout.rotation.x = Math.PI * 0.5;
    snout.position.set(0, -0.02, 0.24);
    head.add(cranium, snout);

    const browScaleGeo = geo('liz_brow_scale', () => new THREE.ConeGeometry(0.045, 0.13, 5));
    const headScalesGeo = mergeGeo('liz_head_scales', () => {
      const specs = [];
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        specs.push([browScaleGeo, side * 0.115, 0.115, 0.08, -0.95, 0, side * -0.45, 0.85, 1.0, 0.55]);
        for (let f = 0; f < 2; f++) {
          specs.push([browScaleGeo, side * (0.175 + f * 0.02), 0.04 - f * 0.075, -0.09, 0, side * -0.35, -side * (1.15 + f * 0.35), 0.9, 1.12, 0.42]);
        }
      }
      return specs;
    });
    head.add(makeMesh(headScalesGeo, mats.dark));

    addCatchlightEyes(head, {
      x: 0.115,
      y: 0.065,
      z: 0.10,
      radius: 0.048,
      irisMat: mats.dark,
      hasIris: true,
    });
    bodyGroup.add(head);

    // 4 splayed jointed legs with merged 3-clawed feet grounded at y = 0
    const upperGeo = geo('liz_upper', () => new THREE.CylinderGeometry(0.046, 0.038, 0.18, 6).translate(0, -0.09, 0));
    const lowerGeo = geo('liz_lower', () => new THREE.CylinderGeometry(0.036, 0.028, 0.18, 6).translate(0, -0.09, 0));
    const footGeo = geo('liz_foot', () => new THREE.SphereGeometry(0.048, 6, 5));
    const clawGeo = geo('liz_claw', () => new THREE.ConeGeometry(0.015, 0.085, 4));
    const lizClawsMergedGeo = mergeGeo('liz_claws_merged', () => [
      [clawGeo, -0.032, -0.18, 0.085, Math.PI * 0.48, 0, 0.38, 1, 1, 1],
      [clawGeo, 0, -0.18, 0.085, Math.PI * 0.48, 0, 0, 1, 1, 1],
      [clawGeo, 0.032, -0.18, 0.085, Math.PI * 0.48, 0, -0.38, 1, 1, 1],
    ]);
    const legs = [];
    const lPos = [[-1, 0.38], [1, 0.38], [-1, -0.36], [1, -0.36]];
    for (let i = 0; i < lPos.length; i++) {
      const sx = lPos[i][0];
      const sz = lPos[i][1];
      const leg = new THREE.Group();
      leg.position.set(sx * 0.20, 0.32, sz);
      leg.rotation.z = sx * 0.72;
      const upper = makeMesh(upperGeo, mats.main);
      const knee = new THREE.Group();
      knee.position.set(0, -0.17, 0);
      knee.rotation.z = -sx * 0.65;
      const lower = makeMesh(lowerGeo, mats.dark);
      const foot = makeMesh(footGeo, mats.dark);
      foot.scale.set(1.2, 0.45, 1.4);
      foot.position.set(0, -0.17, 0.03);
      knee.add(lower, foot, makeMesh(lizClawsMergedGeo, s.pupil));
      leg.add(upper, knee);
      leg.userData = { knee, side: sx, front: sz > 0, baseZ: sx * 0.72 };
      g.add(leg);
      legs.push(leg);
    }

    // 2-segment swishing scaled tail with merged dorsal ridge scutes
    const tail = new THREE.Group();
    tail.position.set(0, 0.0, -0.56);
    const tailA = makeMesh(
      geo('liz_tail_a', () => new THREE.CylinderGeometry(0.12, 0.072, 0.44, 8).rotateX(Math.PI / 2).translate(0, 0, -0.22)),
      mats.main
    );
    const tailScutesGeo = mergeGeo('liz_tail_scutes', () => [
      [scuteGeo, 0, 0.09, -0.12, 0, 0, 0, 0.62, 0.38, 0.85],
      [scuteGeo, 0, 0.07, -0.30, 0, 0, 0, 0.56, 0.36, 0.80],
    ]);
    tail.add(tailA, makeMesh(tailScutesGeo, mats.dark));
    const tailTip = new THREE.Group();
    tailTip.position.set(0, 0, -0.42);
    const tailB = makeMesh(
      geo('liz_tail_b', () => new THREE.ConeGeometry(0.072, 0.48, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.24)),
      mats.dark
    );
    tailTip.add(tailB);
    tail.add(tailTip);
    bodyGroup.add(tail);

    g.userData = {
      plan: 'lizard',
      bodyGroup,
      bodyBaseY,
      legs,
      tail,
      tailTip,
      head,
      strideLen: 0.74,
    };
    g.scale.setScalar(scale);
    return g;
  }

  function makeFish(sp, scale) {
    const s = ensureShared();
    const mats = getSpeciesMats('fish', sp.color);
    const g = new THREE.Group();

    const body = makeMesh(
      geo('fish_body', () => new THREE.SphereGeometry(0.45, 14, 12)),
      mats.main
    );
    body.scale.set(0.74, 0.86, 1.32);
    body.position.set(0, 0.6, 0);

    const belly = makeMesh(
      geo('fish_belly', () => new THREE.SphereGeometry(0.36, 12, 10)),
      mats.light
    );
    belly.scale.set(0.68, 0.56, 1.16);
    belly.position.set(0, 0.49, 0.02);
    g.add(body, belly);

    // Translucent swept dorsal fin
    const dorsal = makeMesh(
      geo('fish_dorsal', () => new THREE.ConeGeometry(0.16, 0.42, 6)),
      mats.dark,
      false,
      true
    );
    dorsal.scale.set(0.24, 1, 1.35);
    dorsal.rotation.x = -0.35;
    dorsal.position.set(0, 1.02, -0.04);
    g.add(dorsal);

    // Paired pectoral side fins
    const pecGeo = geo('fish_pectoral', () => new THREE.SphereGeometry(0.17, 8, 6));
    const fins = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const finPivot = new THREE.Group();
      finPivot.position.set(side * 0.30, 0.52, 0.18);
      const fin = makeMesh(pecGeo, mats.dark, false, true);
      fin.scale.set(0.95, 0.16, 0.65);
      fin.position.set(side * 0.12, -0.02, -0.05);
      fin.rotation.y = side * -0.42;
      finPivot.add(fin);
      g.add(finPivot);
      fins.push(finPivot);
    }

    // Translucent forked tail fin
    const tail = new THREE.Group();
    tail.position.set(0, 0.6, -0.56);
    const forkGeo = geo('fish_tail_fork', () => new THREE.ConeGeometry(0.14, 0.44, 6));
    for (let i = 0; i < 2; i++) {
      const up = i === 0 ? 1 : -1;
      const blade = makeMesh(forkGeo, mats.dark, false, true);
      blade.scale.set(0.22, 1, 0.85);
      blade.rotation.x = up > 0 ? -2.25 : -0.9;
      blade.position.set(0, up * 0.13, -0.18);
      tail.add(blade);
    }
    g.add(tail);

    addCatchlightEyes(g, {
      x: 0.19,
      y: 0.70,
      z: 0.40,
      radius: 0.058,
      irisMat: mats.dark,
      hasIris: true,
    });

    if (sp.deco === 'spots') {
      const spotGeo = geo('fish_spot', () => new THREE.SphereGeometry(0.075, 6, 5));
      const rx = 0.45 * 0.74;
      const ry = 0.45 * 0.86;
      const rz = 0.45 * 1.32;
      const spotYZ = [[0.74, 0.16], [0.64, -0.04], [0.71, -0.24]];
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const side = sideIdx === 0 ? -1 : 1;
        for (let i = 0; i < spotYZ.length; i++) {
          const sy = spotYZ[i][0];
          const sz = spotYZ[i][1];
          const dy = sy - 0.6;
          const xFrac = Math.sqrt(Math.max(0.15, 1 - (dy / ry) * (dy / ry) - (sz / rz) * (sz / rz)));
          const spot = makeMesh(spotGeo, mats.light);
          spot.position.set(side * (rx * xFrac + 0.004), sy, sz);
          spot.scale.set(0.38, 0.95, 1.1);
          g.add(spot);
        }
      }
    } else if (sp.deco === 'crown') {
      const crown = makeMesh(
        geo('fish_crown', () => new THREE.TorusGeometry(0.12, 0.036, 6, 12)),
        s.goldTrim
      );
      crown.rotation.x = Math.PI / 2;
      crown.position.set(0, 1.08, 0.12);
      g.add(crown);
    }

    g.userData = { tail, fins };
    g.scale.setScalar(scale);
    return g;
  }

  function makeJelly(sp, scale) {
    const mats = getSpeciesMats('jelly', sp.color);
    const hasJellyShader = typeof Shaders !== 'undefined' && Shaders && typeof Shaders.createJellyMaterial === 'function';
    const jellyShaders = hasJellyShader ? getJellyShaderMats(sp.color) : null;
    const bellMat = jellyShaders ? jellyShaders.bellMat : mats.main;
    const g = new THREE.Group();

    const bell = new THREE.Group();
    bell.position.y = 0.86;
    const dome = makeMesh(
      geo('jelly_dome', () => new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)),
      bellMat,
      false,
      true
    );
    const core = makeMesh(
      geo('jelly_core', () => new THREE.OctahedronGeometry(0.18, 0)),
      mats.light
    );
    core.position.y = 0.16;

    // Scalloped translucent rim lobes (merged in bell-centered coordinates so GPU pulse expands them in sync with dome!)
    const lobeGeo = geo('jelly_lobe', () => new THREE.SphereGeometry(0.09, 8, 6));
    const lobesMergedGeo = mergeGeo('jelly_rim_lobes_v1', () => {
      const specs = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        specs.push([lobeGeo, Math.cos(a) * 0.41, 0.0, Math.sin(a) * 0.41, 0, 0, 0, 1.1, 0.55, 1.1]);
      }
      return specs;
    });
    bell.add(makeMesh(lobesMergedGeo, bellMat, false, false));

    addCatchlightEyes(bell, {
      x: 0.145,
      y: 0.14,
      z: 0.36,
      radius: 0.052,
      irisMat: mats.dark,
      hasIris: true,
    });

    bell.add(dome, core);
    g.add(bell);

    // 6 flowing tentacles (single continuous multi-segment mesh in GPU shader mode; 2-segment fallback otherwise)
    const tContinuousGeo = jellyShaders
      ? geo('jelly_tent_continuous_v1', () => new THREE.CylinderGeometry(0.028, 0.008, 0.62, 6, 12).translate(0, -0.31, 0))
      : null;
    const tUpperGeo = jellyShaders
      ? null
      : geo('jelly_tent_up', () => new THREE.CylinderGeometry(0.028, 0.018, 0.32, 6).translate(0, -0.16, 0));
    const tLowerGeo = jellyShaders
      ? null
      : geo('jelly_tent_dn', () => new THREE.CylinderGeometry(0.018, 0.008, 0.32, 6).translate(0, -0.16, 0));
    const tentacles = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tent = new THREE.Group();
      tent.position.set(Math.cos(a) * 0.25, 0.84, Math.sin(a) * 0.25);
      tent.userData.phase = i * 1.05;
      if (jellyShaders) {
        tent.add(makeMesh(tContinuousGeo, jellyShaders.tentMats[i], false, false));
      } else {
        const upper = makeMesh(tUpperGeo, mats.light);
        const tip = new THREE.Group();
        tip.position.set(0, -0.30, 0);
        const lower = makeMesh(tLowerGeo, mats.main, false, false);
        tip.add(lower);
        tent.add(upper, tip);
        tent.userData.tip = tip;
      }
      g.add(tent);
      tentacles.push(tent);
    }

    g.userData = { tentacles, bell };
    g.scale.setScalar(scale);
    return g;
  }

  function makeEel(sp, scale) {
    const mats = getSpeciesMats('eel', sp.color);
    const g = new THREE.Group();

    const head = new THREE.Group();
    head.position.set(0, 0.52, 0.56);
    const skull = makeMesh(
      geo('eel_skull', () => new THREE.SphereGeometry(0.19, 12, 10)),
      mats.main
    );
    skull.scale.set(0.84, 0.78, 1.25);
    head.add(skull);

    addCatchlightEyes(head, {
      x: 0.11,
      y: 0.055,
      z: 0.125,
      radius: 0.048,
      irisMat: mats.dark,
      hasIris: true,
    });
    g.add(head);

    // 3-segment sinuous ribbon body + dorsal fin crest
    const segLens = [0.46, 0.42, 0.38];
    const segRads = [0.16, 0.135, 0.105];
    const segments = [];
    const dorsalGeo = geo('eel_dorsal', () => new THREE.ConeGeometry(0.045, 0.22, 5));

    let parentGroup = g;
    let zAttach = 0.44;
    let yAttach = 0.50;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, yAttach, zAttach);
      const segBody = makeMesh(
        geo('eel_seg_' + i, () => new THREE.SphereGeometry(segRads[i], 12, 10)),
        mats.main
      );
      segBody.scale.set(0.68, 0.85, (segLens[i] * 0.65) / segRads[i]);
      segBody.position.set(0, 0, -segLens[i] * 0.5);

      const dorsal = makeMesh(dorsalGeo, mats.dark, false, true);
      dorsal.scale.set(0.32, 1, 1.4);
      dorsal.rotation.x = -0.3;
      dorsal.position.set(0, segRads[i] + 0.06, -segLens[i] * 0.5);

      seg.add(segBody, dorsal);
      parentGroup.add(seg);
      segments.push(seg);

      parentGroup = seg;
      zAttach = -segLens[i] * 0.88;
      yAttach = 0;
    }

    // Ribbon tail attached to final segment
    const tail = new THREE.Group();
    tail.position.set(0, 0, zAttach);
    const tailBlade = makeMesh(
      geo('eel_tail', () => new THREE.ConeGeometry(0.11, 0.38, 6)),
      mats.dark,
      false,
      true
    );
    tailBlade.scale.set(0.32, 1, 1.15);
    tailBlade.rotation.x = -Math.PI / 2;
    tailBlade.position.set(0, 0, -0.17);
    tail.add(tailBlade);
    parentGroup.add(tail);

    g.userData = { segments, tail, head };
    g.scale.setScalar(scale);
    return g;
  }

  function makeCritter(sp, scale = 1) {
    if (sp.plan === 'bird') return makeBird(sp, scale);
    if (sp.plan === 'bug') return makeBug(sp, scale);
    if (sp.plan === 'lizard') return makeLizard(sp, scale);
    if (sp.plan === 'fish') return makeFish(sp, scale);
    if (sp.plan === 'jelly') return makeJelly(sp, scale);
    if (sp.plan === 'eel') return makeEel(sp, scale);
    return makeQuad(sp, scale);
  }

  // Zero-GC displacement-synced grounded gait & expression driver for all 7 plans + Wish.
  // Supports both legacy (mesh, t, activeBool) and rich (mesh, gaitPhase, speed, opts) calls!
  const TAU = Math.PI * 2;
  function smooth01(x, a, b) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  // Asymmetric stance/swing foot waveform:
  // u in [0, 0.58): planted stance sweeping steadily backward (-1 -> +1 hip angle push) with lift=0
  // u in [0.58, 1): lifted swing recovering briskly forward (+1 -> -1) with high arc lift=sin(...)
  function stepWave(phaseRad, out) {
    let u = (phaseRad / TAU) % 1;
    if (u < 0) u += 1;
    if (u < 0.58) {
      const s = u / 0.58;
      out.swing = -1 + 2 * s; // foot moves front (-1) -> back (+1) smoothly planted on ground
      out.lift = 0;
    } else {
      const s = (u - 0.58) / 0.42;
      out.swing = 1 - 2 * (0.5 - 0.5 * Math.cos(s * Math.PI));
      out.lift = Math.sin(s * Math.PI);
    }
    return out;
  }
  const _stepScratch = { swing: 0, lift: 0 };

  function animateCritter(mesh, t, speedOrActive, opts) {
    const u = mesh.userData;
    if (!u) return;

    const speed = typeof speedOrActive === 'number' ? speedOrActive : (speedOrActive ? 4.2 : 0);
    const active = speed > 0.18;
    const idleTime = opts && typeof opts.idleTime === 'number' ? opts.idleTime : t;
    const airborne = !!(opts && opts.airborne);
    const plan = u.plan || (u.legStyle === 'bug' ? 'bug' : '');

    if (plan === 'quad' && u.legs && u.legs.length === 4) {
      const arch = u.archetype || 'cat';
      const moveW = active ? Math.min(1, speed / 1.8) : 0;
      const trotW = smooth01(speed, 2.2, 4.3);
      const boundW = smooth01(speed, 4.6, 7.2);
      // Bear = sturdy shorter rolling stride; Deer = proud high-stepping prance/pronk; Cat/Fox = lithe fluid bound!
      const strideAmp = (arch === 'bear' ? 0.38 : arch === 'deer' ? 0.56 : 0.48) * moveW + (trotW * 0.16 + boundW * 0.24) * moveW;

      const pFL = 0;
      const pFR = arch === 'deer' && boundW > 0.4
        ? 0.16
        : Math.PI * (1 - boundW) + (arch === 'bear' ? 0.45 : 0.30) * boundW;
      const pBL = (Math.PI * 1.5) * (1 - trotW) + Math.PI * trotW;
      const pBR = (Math.PI * 0.5) * (1 - trotW) + (0 * (1 - boundW) + (Math.PI + 0.30) * boundW) * trotW;
      const phases = [pFL, pFR, pBL, pBR];

      for (let i = 0; i < 4; i++) {
        const leg = u.legs[i];
        if (active) {
          stepWave(t + phases[i], _stepScratch);
          leg.rotation.x = _stepScratch.swing * strideAmp;
          if (leg.userData && leg.userData.knee) {
            const isFront = leg.userData.front;
            const highStep = arch === 'deer' ? 1.22 : arch === 'bear' ? 0.72 : 1.0;
            leg.userData.knee.rotation.x = _stepScratch.lift * (isFront ? 0.98 : 0.85) * highStep * (0.7 + boundW * 0.35);
          }
        } else {
          leg.rotation.x = 0;
          if (leg.userData && leg.userData.knee) leg.userData.knee.rotation.x = 0.06;
        }
      }

      if (u.bodyGroup) {
        const breath = Math.sin(idleTime * 2.4) * 0.022;
        const trotBounce = active ? Math.abs(Math.sin(t)) * (arch === 'deer' ? 0.075 : 0.045) * (1 - boundW) * moveW : 0;
        const boundArc = active ? Math.max(0, Math.sin(t - 0.4)) * (arch === 'deer' ? 0.24 : arch === 'bear' ? 0.10 : 0.18) * boundW : 0;
        u.bodyGroup.position.y = (u.bodyBaseY || 0.45) + trotBounce + boundArc;
        // Bear sways side-to-side with heavy plantigrade roll; Cat/Fox flex spine deeply when bounding!
        u.bodyGroup.rotation.x = active
          ? Math.cos(t - 0.35) * (0.05 * trotW + (arch === 'bear' ? 0.14 : 0.26) * boundW) * moveW
          : 0;
        u.bodyGroup.rotation.z = active
          ? Math.sin(t) * (arch === 'bear' ? 0.13 : 0.045) * (1 - boundW * 0.5) * moveW
          : 0;
        u.bodyGroup.scale.set(1 - breath * 0.3, 1 + breath, 1 + (boundArc > 0.05 ? 0.06 * boundW : 0));
      }
      if (u.head) {
        u.head.rotation.x = active
          ? -Math.cos(t - 0.35) * 0.16 * boundW + Math.sin(t * 2) * (arch === 'bear' ? 0.07 : 0.045) * (1 - boundW) * moveW
          : Math.sin(idleTime * 1.4) * 0.06;
        u.head.rotation.y = active ? 0 : Math.sin(idleTime * 0.85) * (arch === 'cat' ? 0.22 : 0.14);
      }
      if (u.tail) {
        const tailFreq = arch === 'cat' ? 1.5 : 1.15;
        u.tail.rotation.y = Math.sin(active ? t * tailFreq : idleTime * 2.2) * (active ? (arch === 'bear' ? 0.22 : 0.44) : 0.24);
        u.tail.rotation.x = active ? (arch === 'cat' ? 0.15 - 0.28 * boundW : -0.18 * boundW) : 0;
        if (u.tailTip) {
          u.tailTip.rotation.y = Math.sin((active ? t * tailFreq : idleTime * 2.2) - 0.85) * (active ? 0.48 : 0.26);
        }
      }
      return;
    }

    if (plan === 'bird' && u.legs && u.wings) {
      const arch = u.archetype || 'songbird';
      const moveW = active ? Math.min(1, speed / 1.6) : 0;
      // Kiwi is a flightless ground-runner (never flutters aloft); Songbird hops paired-foot on land & flutters fast; Owl glides broadly!
      const flutterW = arch === 'kiwi' ? 0 : (airborne ? 1 : smooth01(speed, 4.0, 6.0));
      const strutW = moveW * (1 - flutterW * 0.75);

      for (let i = 0; i < u.legs.length; i++) {
        const leg = u.legs[i];
        if (airborne || flutterW > 0.7) {
          leg.rotation.x = 0.52;
          if (leg.userData && leg.userData.knee) leg.userData.knee.rotation.x = -0.72;
        } else if (active) {
          // Songbird hops with BOTH feet together (phase offset 0); Kiwi & Owl alternate strides (phase offset PI)!
          const legPhase = arch === 'songbird' ? t : (t + i * Math.PI);
          stepWave(legPhase, _stepScratch);
          leg.rotation.x = _stepScratch.swing * (arch === 'kiwi' ? 0.78 : 0.62) * strutW;
          if (leg.userData && leg.userData.knee) {
            leg.userData.knee.rotation.x = -_stepScratch.lift * (arch === 'kiwi' ? 1.05 : 0.92) * strutW;
          }
        } else {
          leg.rotation.x = 0;
          if (leg.userData && leg.userData.knee) leg.userData.knee.rotation.x = -0.08;
        }
      }

      if (u.bodyGroup) {
        const strideBob = active
          ? Math.abs(Math.sin(t)) * (arch === 'songbird' ? 0.11 : 0.055) * strutW
          : 0;
        const hopLift = flutterW > 0.1 ? Math.max(0, Math.sin(t * 1.4)) * 0.14 * flutterW : 0;
        u.bodyGroup.position.y = (u.bodyBaseY || 0.62) + strideBob + hopLift;
        u.bodyGroup.rotation.x = active
          ? (arch === 'kiwi' ? 0.24 * strutW : 0.12 * strutW + 0.26 * flutterW)
          : (arch === 'kiwi' ? 0.14 + Math.max(0, Math.sin(idleTime * 2.4)) * 0.18 : Math.sin(idleTime * 2.2) * 0.03);
        u.bodyGroup.rotation.z = active && arch !== 'songbird' ? Math.sin(t) * 0.09 * strutW : 0;
      }
      if (u.head) {
        // Kiwi probes downward when idle & bobs swiftly while sprinting; Songbirds & Owls bob rhythmically!
        u.head.position.z = (u.headBaseZ || 0.08) + (active ? Math.sin(t * 2) * 0.058 * strutW : 0);
        u.head.rotation.x = active
          ? Math.sin(t * 2 - 0.5) * 0.15 * strutW - 0.12 * flutterW
          : (arch === 'kiwi' ? 0.24 + Math.max(0, Math.sin(idleTime * 2.8)) * 0.28 : Math.sin(idleTime * 1.6) * 0.06);
        u.head.rotation.y = active ? 0 : Math.sin(idleTime * (arch === 'owl' ? 0.75 : 1.5)) * (arch === 'owl' ? 0.34 : 0.18);
      }
      const flap = arch === 'kiwi'
        ? 0.08 + Math.sin(active ? t * 2 : idleTime * 2) * 0.05
        : flutterW > 0.05
          ? 0.32 + Math.sin(idleTime * (arch === 'owl' ? 8.5 : 15) + t * 1.5) * (0.28 + 0.56 * flutterW)
          : 0.18 + Math.sin(active ? t * 2 : idleTime * 2.2) * (active ? 0.14 : 0.06);
      u.wings[0].rotation.z = flap;
      u.wings[1].rotation.z = -flap;
      if (u.tail) {
        u.tail.rotation.x = active ? Math.sin(t * 2) * 0.14 * moveW : Math.sin(idleTime * 2.0) * 0.06;
      }
      return;
    }

    if (plan === 'lizard' && u.legs && u.legs.length === 4) {
      const moveW = active ? Math.min(1, speed / 1.5) : 0;
      // Authentic S-curve lateral spine undulation driving alternating diagonal sprawled strides!
      const sWave = active ? Math.sin(t) * moveW : 0;
      if (u.bodyGroup) {
        u.bodyGroup.rotation.y = sWave * 0.22;
        u.bodyGroup.position.y = (u.bodyBaseY || 0.36) + (active ? Math.abs(Math.sin(t)) * 0.025 * moveW : 0);
      }
      if (u.head) {
        // Head counter-rotates cleanly to stay locked on travel direction while torso snakes!
        u.head.rotation.y = -sWave * 0.26 + (active ? 0 : Math.sin(idleTime * 1.3) * 0.12);
        u.head.rotation.x = Math.sin(idleTime * 2.0) * 0.04;
      }
      if (u.tail) {
        u.tail.rotation.y = Math.sin(active ? t - 1.15 : idleTime * 1.8) * (active ? 0.54 * moveW : 0.16);
        if (u.tailTip) {
          u.tailTip.rotation.y = Math.sin((active ? t - 2.15 : idleTime * 1.8 - 0.9)) * (active ? 0.62 * moveW : 0.18);
        }
      }
      // Diagonal sprawled strides: FL(0)+BR(3) vs FR(1)+BL(2)
      const diagPhases = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < 4; i++) {
        const leg = u.legs[i];
        const baseZ = leg.userData && leg.userData.baseZ !== undefined ? leg.userData.baseZ : 0;
        const side = leg.userData ? leg.userData.side : (i % 2 ? 1 : -1);
        if (active) {
          stepWave(t + diagPhases[i], _stepScratch);
          leg.rotation.y = -side * _stepScratch.swing * 0.58 * moveW;
          leg.rotation.z = baseZ + side * _stepScratch.lift * 0.38 * moveW;
        } else {
          leg.rotation.y = 0;
          leg.rotation.z = baseZ;
        }
      }
      return;
    }

    if (plan === 'bug' && u.legs) {
      const moveW = active ? Math.min(1, speed / 1.4) : 0;
      // Alternating 3+3 insect tripod gait: [L0, L1, L2, R0, R1, R2] -> group A = {0, 2, 4}, group B = {1, 3, 5}
      for (let i = 0; i < u.legs.length; i++) {
        const leg = u.legs[i];
        const side = i < 3 ? -1 : 1;
        const tripodPhase = (i % 2 === 0 ? 0 : Math.PI);
        if (active) {
          stepWave(t * 1.5 + tripodPhase, _stepScratch);
          leg.rotation.y = -side * _stepScratch.swing * 0.38 * moveW;
          leg.rotation.z = side * (0.85 + _stepScratch.lift * 0.28 * moveW);
        } else {
          leg.rotation.y = 0;
          leg.rotation.z = side * 0.85;
        }
      }
      if (u.wings) {
        // Rapid firefly wing buzz when fluttering/hovering!
        const buzz = airborne ? 0.35 + Math.sin(idleTime * 36) * 0.65 : 0.12 + Math.sin(idleTime * 6) * 0.06;
        u.wings[0].rotation.z = buzz;
        u.wings[1].rotation.z = -buzz;
      }
      if (u.antennae) {
        for (let i = 0; i < u.antennae.length; i++) {
          u.antennae[i].rotation.z = (i ? -1 : 1) * (0.35 + Math.sin(idleTime * 3.0 + i * 2) * (active ? 0.20 : 0.12));
        }
      }
      if (u.head) u.head.rotation.x = Math.sin(idleTime * 2.2) * 0.06;
      return;
    }

    // Aquatic species (fish, jelly, eel) & Wish songbird
    if (u.tail) {
      u.tail.rotation.y = Math.sin(t * 1.4) * (active ? 0.44 : 0.18);
      if (u.tailTip) {
        u.tailTip.rotation.y = Math.sin(t * 1.4 - 0.9) * (active ? 0.42 : 0.16);
      }
    }
    if (u.head) {
      u.head.rotation.x = Math.sin(t * 0.75) * 0.07;
    }
    if (u.wings) {
      const flap = active ? 0.45 + Math.sin(t * 9.5) * 0.62 : 0.25 + Math.sin(t * 2.4) * 0.18;
      u.wings[0].rotation.z = flap;
      u.wings[1].rotation.z = -flap;
    }
    if (u.fins) {
      const flutter = Math.sin(t * (active ? 6.0 : 2.5)) * (active ? 0.34 : 0.14);
      u.fins[0].rotation.y = flutter;
      u.fins[1].rotation.y = -flutter;
    }
    if (u.tentacles) {
      const tents = u.tentacles;
      for (let i = 0; i < tents.length; i++) {
        const tent = tents[i];
        const ph = tent.userData.phase || 0;
        tent.rotation.x = Math.sin(t * 2.0 + ph) * 0.24;
        tent.rotation.z = Math.cos(t * 1.7 + ph) * 0.18;
        if (tent.userData.tip) {
          tent.userData.tip.rotation.x = Math.sin(t * 2.0 + ph - 0.9) * 0.28;
          tent.userData.tip.rotation.z = Math.cos(t * 1.7 + ph - 0.9) * 0.22;
        }
      }
    }
    if (u.bell) {
      const pulse = 1 + Math.sin(t * 2.5) * 0.1;
      u.bell.scale.set(pulse, 2 - pulse, pulse);
    }
    if (u.segments) {
      const segs = u.segments;
      const spd = active ? 4.2 : 1.8;
      const amp = active ? 0.32 : 0.16;
      for (let i = 0; i < segs.length; i++) {
        segs[i].rotation.y = Math.sin(t * spd - i * 1.15) * amp;
      }
    }
  }

  // ---------- 4. Shadow-Beast Gloomblob ----------

  function makeGloom(tierDef) {
    const s = ensureShared();
    const g = new THREE.Group();
    const isClassic = !tierDef || tierDef.key === 'classic' || tierDef.tier === 1;
    const tierKey = isClassic ? 'classic' : (tierDef.key || 'shadow');
    const tierNum = isClassic ? 1 : (typeof tierDef.tier === 'number' ? tierDef.tier : 2);
    const fbScale = isClassic ? 1.0 : (typeof tierDef.fallbackScale === 'number' && tierDef.fallbackScale > 0 ? tierDef.fallbackScale : 1.0);
    const wispCount = isClassic ? 3 : (tierNum >= 4 ? 5 : (tierNum >= 3 ? 4 : 3));
    const eyeHex = isClassic ? 0xffb830 : (tierDef.eyeColor !== undefined ? tierDef.eyeColor : 0xff4038);
    const eyeEmissiveHex = isClassic ? 0xff8c10 : eyeHex;
    const haloHex = isClassic ? 0x52287a : (tierDef.haloColor !== undefined ? tierDef.haloColor : 0x721c6a);

    let mountRoot = g;
    let fallbackRoot = null;
    if (!isClassic) {
      fallbackRoot = new THREE.Group();
      fallbackRoot.scale.setScalar(fbScale);
      g.add(fallbackRoot);
      mountRoot = fallbackRoot;
    }

    const body = new THREE.Group();
    body.position.set(0, 0.58, 0);

    // Crouched obsidian-violet mass + jagged shoulder plates + spinal shadow crest
    const core = makeMesh(
      geo('gloom_core', () => new THREE.IcosahedronGeometry(0.60, 1)),
      s.gloomBody
    );
    core.scale.set(1.06, 0.88, 1.12);
    body.add(core);

    const shoulderGeo = geo('gloom_shoulder', () => new THREE.ConeGeometry(0.28, 0.54, 5));
    const shoulderScale = isClassic ? 1.0 : (tierNum >= 3 ? 1.24 : 1.1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const plate = makeMesh(shoulderGeo, s.gloomBody);
      plate.position.set(side * 0.42, 0.24, -0.06);
      plate.rotation.z = side * -0.58;
      plate.rotation.x = -0.35;
      if (shoulderScale !== 1.0) plate.scale.setScalar(shoulderScale);
      body.add(plate);
    }

    // Swept twin curved shadow horns
    const hornBaseGeo = geo('gloom_horn_a', () => new THREE.ConeGeometry(0.13, 0.42, 6));
    const hornTipGeo = geo('gloom_horn_b', () => new THREE.ConeGeometry(0.08, 0.38, 6));
    const hornScale = isClassic ? 1.0 : (tierNum >= 4 ? 1.32 : (tierNum >= 3 ? 1.18 : 1.08));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const horn = new THREE.Group();
      horn.position.set(side * 0.24, 0.44, 0.06);
      horn.rotation.z = side * -0.45;
      horn.rotation.x = -0.42;
      if (hornScale !== 1.0) horn.scale.setScalar(hornScale);
      const segA = makeMesh(hornBaseGeo, s.gloomHorn);
      segA.position.y = 0.18;
      const segB = makeMesh(hornTipGeo, s.gloomHorn);
      segB.position.set(side * -0.06, 0.44, -0.10);
      segB.rotation.z = side * 0.35;
      segB.rotation.x = -0.38;
      horn.add(segA, segB);
      body.add(horn);
    }

    // Dorsal shadow spikes
    const spineGeo = geo('gloom_spine', () => new THREE.ConeGeometry(0.09, 0.34, 5));
    const spineCount = isClassic ? 3 : (tierNum >= 3 ? 4 : 3);
    const spineStepY = isClassic ? 0.16 : 0.14;
    const spineStepZ = isClassic ? 0.14 : 0.12;
    for (let i = 0; i < spineCount; i++) {
      const sp = makeMesh(spineGeo, s.gloomHorn);
      sp.position.set(0, 0.34 - i * spineStepY, -0.34 - i * spineStepZ);
      sp.rotation.x = -0.95 - i * 0.2;
      if (!isClassic && tierNum >= 3) sp.scale.setScalar(1.2);
      body.add(sp);
    }

    // Fierce glowing amber-gold (or tier-tinted) eyes under angular dark brows (mutable eyeMat for flash/mood)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: eyeHex,
      emissive: eyeEmissiveHex,
      emissiveIntensity: isClassic ? 1.15 : 1.45,
      roughness: 0.22,
      metalness: 0.1,
    });
    const eyeGeo = geo('gloom_eye', () => new THREE.SphereGeometry(0.095, 8, 8));
    const browGeo = geo('gloom_brow', () => new THREE.BoxGeometry(0.24, 0.065, 0.08));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const eye = makeMesh(eyeGeo, eyeMat);
      eye.scale.set(1.15, 0.78, 0.75);
      eye.position.set(side * 0.20, 0.14, 0.54);
      const brow = makeMesh(browGeo, s.gloomBrow);
      brow.position.set(side * 0.20, 0.24, 0.56);
      brow.rotation.z = side * -0.38;
      brow.rotation.y = side * 0.18;
      body.add(eye, brow);
    }
    mountRoot.add(body);

    // Orbiting floating obsidian shard wisps (3 classic; 4-5 for Tier 3-4)
    const wispGeo = geo('gloom_wisp', () => new THREE.OctahedronGeometry(0.11, 0));
    const wisps = [];
    for (let i = 0; i < wispCount; i++) {
      const a = (i / wispCount) * Math.PI * 2;
      const wisp = makeMesh(wispGeo, s.gloomWisp);
      wisp.scale.set(0.7, 1.45, 0.7);
      wisp.position.set(Math.cos(a) * 0.82, 0.62 + (i % 2) * 0.22, Math.sin(a) * 0.82);
      wisp.rotation.z = 0.25;
      mountRoot.add(wisp);
      wisps.push(wisp);
    }

    const halo = makeGlow(haloHex, isClassic ? 2.0 : 2.25, isClassic ? 0.44 : 0.54, false);
    halo.position.set(0, 0.62, 0);
    mountRoot.add(halo);

    g.userData = { body, wisps, halo, eyeMat, tierKey };
    if (!isClassic) {
      g.userData.fallbackRoot = fallbackRoot;
      g.userData.fallbackScale = fbScale;
    }
    return g;
  }

  // ---------- 5. Obsidian Thorn-Cocoon ----------

  function makeCocoon() {
    const s = ensureShared();
    const g = new THREE.Group();

    // Grounded obsidian root collar sitting firmly at y = 0
    const rootBase = makeMesh(
      geo('cocoon_root_base', () => new THREE.CylinderGeometry(0.42, 0.62, 0.24, 6)),
      s.cocoonObsidian
    );
    rootBase.position.set(0, 0.12, 0);
    g.add(rootBase);

    const core = makeMesh(
      geo('cocoon_core', () => new THREE.IcosahedronGeometry(0.45, 0)),
      s.cocoonCore
    );
    core.position.set(0, 0.64, 0);
    core.scale.set(0.95, 1.22, 0.95);
    g.add(core);

    // Faceted jagged obsidian thorn plates wrapping core with glowing starlight seams
    const plateGeo = geo('cocoon_plate', () => new THREE.ConeGeometry(0.24, 1.12, 5));
    const thornGeo = geo('cocoon_thorn', () => new THREE.ConeGeometry(0.08, 0.42, 5));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const plate = makeMesh(plateGeo, s.cocoonObsidian);
      plate.position.set(Math.cos(a) * 0.36, 0.62 + (i % 2 ? 0.04 : -0.02), Math.sin(a) * 0.36);
      plate.rotation.y = -a;
      plate.rotation.z = (i % 2 ? 0.22 : -0.18);
      plate.rotation.x = 0.14;
      g.add(plate);

      const thorn = makeMesh(thornGeo, s.gloomHorn);
      thorn.position.set(Math.cos(a + 0.3) * 0.48, 0.54 + (i % 3) * 0.18, Math.sin(a + 0.3) * 0.48);
      thorn.rotation.z = Math.cos(a + 0.3) * -0.95;
      thorn.rotation.x = Math.sin(a + 0.3) * 0.95;
      g.add(thorn);
    }

    const halo = makeGlow(0xffd452, 2.05, 0.62, true);
    halo.position.set(0, 0.64, 0);
    g.add(halo);

    g.userData = { core, halo };
    return g;
  }

  // ---------- 6. Ancient Observatory Monolith Star Totem ----------

  function makeTotem() {
    const s = ensureShared();
    const g = new THREE.Group();

    // Stepped weathered ancient stone base
    const baseLower = makeMesh(
      geo('totem_base_1', () => new THREE.CylinderGeometry(1.15, 1.32, 0.34, 8)),
      s.totemDarkStone
    );
    baseLower.position.y = 0.17;
    const baseUpper = makeMesh(
      geo('totem_base_2', () => new THREE.CylinderGeometry(0.86, 1.04, 0.32, 8)),
      s.totemStone
    );
    baseUpper.position.y = 0.50;
    g.add(baseLower, baseUpper);

    // Tapered carved stone monolith pillar
    const pillar = makeMesh(
      geo('totem_pillar', () => new THREE.CylinderGeometry(0.45, 0.72, 2.78, 8)),
      s.totemStone
    );
    pillar.position.y = 2.05;
    g.add(pillar);

    // Glowing golden star-chart bands inlaid around monolith shaft
    const bandHeights = [1.35, 2.10, 2.85];
    const bandRadii = [0.64, 0.57, 0.50];
    for (let i = 0; i < bandHeights.length; i++) {
      const band = makeMesh(
        geo('totem_band_' + i, () => new THREE.TorusGeometry(bandRadii[i], 0.036, 6, 16)),
        s.totemRune
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = bandHeights[i];
      g.add(band);
    }

    // Capital crown & corner observatory finials
    const cap = makeMesh(
      geo('totem_cap', () => new THREE.CylinderGeometry(0.68, 0.50, 0.24, 8)),
      s.totemDarkStone
    );
    cap.position.y = 3.54;
    g.add(cap);

    const finialGeo = geo('totem_finial', () => new THREE.ConeGeometry(0.08, 0.32, 6));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const finial = makeMesh(finialGeo, s.totemStone);
      finial.position.set(Math.cos(a) * 0.56, 3.74, Math.sin(a) * 0.56);
      g.add(finial);
    }

    // Hovering faceted golden star crystal & orbiting astrolabe rings cleanly ABOVE stone finials (top y = 3.90!)
    const crystalY = 4.98;
    const crystal = new THREE.Group();
    crystal.position.set(0, crystalY, 0);
    const crystalMain = makeMesh(
      geo('totem_crystal', () => new THREE.OctahedronGeometry(0.42, 0)),
      s.starCrystal
    );
    crystalMain.scale.set(0.86, 1.35, 0.86);
    const crystalCross = makeMesh(
      geo('totem_crystal', () => new THREE.OctahedronGeometry(0.42, 0)),
      s.starCrystal
    );
    crystalCross.rotation.y = Math.PI / 4;
    crystalCross.scale.set(1.12, 0.68, 1.12);
    crystal.add(crystalMain, crystalCross);
    g.add(crystal);

    // Twin counter-rotating brass astrolabe rings
    const nodeGeo = geo('totem_ring_node', () => new THREE.SphereGeometry(0.045, 8, 6));
    function makeAstrolabeRing(radius, key, tiltX, tiltZ) {
      const ring = new THREE.Group();
      ring.position.set(0, crystalY, 0);
      ring.rotation.x = tiltX;
      ring.rotation.z = tiltZ;
      const torus = makeMesh(
        geo(key, () => new THREE.TorusGeometry(radius, 0.028, 8, 28)),
        s.brass
      );
      ring.add(torus);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const stud = makeMesh(nodeGeo, s.goldTrim);
        stud.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        ring.add(stud);
      }
      g.add(ring);
      return ring;
    }
    const ringA = makeAstrolabeRing(0.76, 'totem_ring_a', 0.42, 0.15);
    const ringB = makeAstrolabeRing(0.92, 'totem_ring_b', -0.52, 0.48);

    const halo = makeGlow(0xffe070, 3.0, 0.82, true);
    halo.position.set(0, crystalY, 0);
    g.add(halo);

    const light = new THREE.PointLight(0xffd966, 1.4, 18);
    light.position.set(0, crystalY, 0);
    g.add(light);

    const beam = makeMesh(
      geo('totem_beam', () => new THREE.CylinderGeometry(0.28, 0.56, 26, 12, 1, true)),
      s.totemBeam,
      false,
      false
    );
    beam.position.set(0, 16.5, 0);
    g.add(beam);

    g.userData = { crystal, ringA, ringB, halo, beam };
    return g;
  }

  // ---------- 7. Pickups & Star Bolts ----------

  function makeStarPickup() {
    const s = ensureShared();
    const g = new THREE.Group();

    const crystal = new THREE.Group();
    const spireA = makeMesh(
      geo('pickup_star_spire', () => new THREE.OctahedronGeometry(0.26, 0)),
      s.starCrystal
    );
    spireA.scale.set(0.65, 1.35, 0.65);
    const spireB = makeMesh(
      geo('pickup_star_spire', () => new THREE.OctahedronGeometry(0.26, 0)),
      s.starCrystal
    );
    spireB.scale.set(1.25, 0.58, 0.58);
    const spireC = makeMesh(
      geo('pickup_star_spire', () => new THREE.OctahedronGeometry(0.26, 0)),
      s.starCrystal
    );
    spireC.scale.set(0.58, 0.58, 1.25);
    crystal.add(spireA, spireB, spireC);
    g.add(crystal);

    const halo = makeGlow(0xffe478, 1.35, 0.85, true);
    g.add(halo);

    g.userData = { kind: 'star', crystal, halo };
    return g;
  }

  function makePearlPickup() {
    const s = ensureShared();
    const g = new THREE.Group();

    const orb = makeMesh(
      geo('pickup_pearl_orb', () => new THREE.SphereGeometry(0.26, 16, 12)),
      s.pearlOrb
    );
    const shimmerRing = makeMesh(
      geo('pickup_pearl_ring', () => new THREE.TorusGeometry(0.32, 0.016, 6, 18)),
      s.pearlRing
    );
    shimmerRing.rotation.x = Math.PI * 0.42;
    shimmerRing.rotation.y = 0.35;
    g.add(orb, shimmerRing);

    const halo = makeGlow(0xbde8ff, 1.35, 0.72, false);
    g.add(halo);

    g.userData = { kind: 'pearl', orb, halo };
    return g;
  }

  function makeHeartPickup() {
    const s = ensureShared();
    const g = new THREE.Group();

    const core = new THREE.Group();
    const lobeGeo = geo('pickup_heart_lobe', () => new THREE.SphereGeometry(0.16, 12, 10));
    const lobeL = makeMesh(lobeGeo, s.heartRuby);
    lobeL.position.set(-0.11, 0.08, 0);
    lobeL.scale.set(1.0, 1.05, 0.72);
    const lobeR = makeMesh(lobeGeo, s.heartRuby);
    lobeR.position.set(0.11, 0.08, 0);
    lobeR.scale.set(1.0, 1.05, 0.72);
    const tip = makeMesh(
      geo('pickup_heart_tip', () => new THREE.ConeGeometry(0.24, 0.34, 8)),
      s.heartRuby
    );
    tip.rotation.x = Math.PI;
    tip.position.set(0, -0.09, 0);
    tip.scale.set(1.02, 1.0, 0.65);

    const collar = makeMesh(
      geo('pickup_heart_ring', () => new THREE.TorusGeometry(0.28, 0.018, 6, 18)),
      s.goldTrim
    );
    collar.rotation.y = Math.PI * 0.25;
    core.add(lobeL, lobeR, tip, collar);
    g.add(core);

    const halo = makeGlow(0xff6b96, 1.25, 0.82, true);
    g.add(halo);

    g.userData = { kind: 'heart', core, halo };
    return g;
  }

  function makeStarBolt() {
    const s = ensureShared();
    const g = new THREE.Group();

    const core = makeMesh(
      geo('bolt_core', () => new THREE.OctahedronGeometry(0.21, 0)),
      s.starCrystal
    );
    core.scale.set(1, 1, 1.45);
    const cross = makeMesh(
      geo('bolt_core', () => new THREE.OctahedronGeometry(0.21, 0)),
      s.goldTrim
    );
    cross.rotation.z = Math.PI / 4;
    cross.scale.set(1.28, 0.5, 0.5);
    g.add(core, cross);

    const halo = makeGlow(0xffe87a, 0.95, 0.9, true);
    g.add(halo);

    g.userData = { core, halo };
    return g;
  }

  // ---------- 8. Shared Fantasy Bone-Attachment Factories ----------

  function sculptAlicornHornGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, Math.min(1, y / 0.28));
      const ang = Math.atan2(z, x);
      const flute = 1.0 + 0.14 * Math.sin(ang * 3.0 + t * 14.0) * (1.0 - t * 0.45);
      pos.setXYZ(i, x * flute, y, z * flute);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function sculptKelpFrondGeo(geometry) {
    if (!geometry.attributes || !geometry.attributes.position) return geometry;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, -y / 0.42));
      const taper = 1.0 - Math.pow(t, 1.35) * 0.78;
      const ruffle = Math.sin(t * Math.PI * 3.5) * 0.018 * (0.3 + 0.7 * t);
      pos.setXYZ(i, x * taper, y, ruffle + Math.cos(t * Math.PI * 2.0) * 0.012);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeUnicornHorn() {
    const s = ensureShared();
    const g = new THREE.Group();
    g.name = 'UnicornHorn';

    const pearlMat = attachMat('attach_unicorn_pearl_v1', () => new THREE.MeshStandardMaterial({
      color: 0xfff4df,
      emissive: 0xffd27a,
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.36,
    }));

    const baseCollar = makeMesh(
      geo('attach_unicorn_collar_v1', () => new THREE.CylinderGeometry(0.036, 0.044, 0.018, 12).translate(0, 0.009, 0)),
      s.goldTrim
    );
    const horn = makeMesh(
      geo('attach_unicorn_horn_v1', () => sculptAlicornHornGeo(new THREE.ConeGeometry(0.032, 0.28, 12, 10).translate(0, 0.14, 0))),
      pearlMat
    );
    g.add(baseCollar, horn);

    for (let r = 0; r < 3; r++) {
      const ring = makeMesh(
        geo('attach_unicorn_ring_' + r, () => new THREE.TorusGeometry(0.027 - r * 0.006, 0.0045, 6, 12)),
        s.goldTrim
      );
      ring.rotation.x = Math.PI / 2 - 0.18;
      ring.position.set(0, 0.055 + r * 0.068, 0);
      g.add(ring);
    }

    const glow = makeGlow(0xfff0a8, 0.22, 0.68, true);
    glow.position.set(0, 0.28, 0);
    g.add(glow);

    g.userData = { horn, glow };
    return g;
  }

  function makeLynxEarTufts(colorHex) {
    const mats = getSpeciesMats('quad', colorHex !== undefined ? colorHex : 0x8fce6a);
    const g = new THREE.Group();
    g.name = 'LynxEarTufts';

    const barbGeo = geo('attach_lynx_barb_v1', () => new THREE.ConeGeometry(0.016, 0.088, 5).translate(0, 0.044, 0));
    const tuftGeo = mergeGeo('attach_lynx_tuft_plume_v1', () => [
      [barbGeo, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.55],
      [barbGeo, -0.012, -0.005, 0.004, 0.04, 0.0, 0.24, 0.78, 0.82, 0.50],
      [barbGeo, 0.012, -0.005, -0.004, -0.04, 0.0, -0.24, 0.78, 0.82, 0.50],
    ]);

    const tufts = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const tuft = makeMesh(tuftGeo, mats.dark);
      tuft.position.set(side * 0.088, 0.145, -0.018);
      tuft.rotation.z = side * -0.22;
      tuft.rotation.x = -0.08;
      g.add(tuft);
      tufts.push(tuft);
    }

    g.userData = { tufts };
    return g;
  }

  function makeDrakeEmberCrest() {
    const g = new THREE.Group();
    g.name = 'DrakeEmberCrest';

    const emberMat = attachMat('attach_drake_ember_v1', () => new THREE.MeshStandardMaterial({
      color: 0xff6e38,
      emissive: 0xff4512,
      emissiveIntensity: 1.05,
      roughness: 0.22,
      metalness: 0.28,
    }));
    const shardGeo = geo('attach_drake_shard_v1', () => new THREE.ConeGeometry(0.036, 0.16, 5).translate(0, 0.08, 0));

    const shards = [];
    for (let i = 0; i < 5; i++) {
      const shard = makeMesh(shardGeo, emberMat);
      const archScale = 1.05 - Math.abs(i - 1.5) * 0.14;
      shard.scale.set(0.65, archScale, 1.25);
      shard.position.set(0, 0.02 + Math.cos((i - 2) * 0.35) * 0.025, 0.14 - i * 0.085);
      shard.rotation.x = -0.34 - i * 0.06;
      g.add(shard);
      shards.push(shard);
    }

    g.userData = { shards };
    return g;
  }

  function makeOwlEarTufts(colorHex) {
    const mats = getSpeciesMats('bird', colorHex !== undefined ? colorHex : 0xc9a86a);
    const g = new THREE.Group();
    g.name = 'OwlEarTufts';

    const vaneGeo = geo('attach_owl_vane_v1', () => new THREE.ConeGeometry(0.026, 0.13, 6).translate(0, 0.065, 0));
    const plumeGeo = mergeGeo('attach_owl_plume_v1', () => [
      [vaneGeo, 0.0, 0.0, 0.0, -0.24, 0.0, 0.0, 0.85, 1.0, 0.36],
      [vaneGeo, 0.015, -0.01, -0.012, -0.30, 0.0, -0.18, 0.72, 0.84, 0.32],
    ]);
    const browGeo = geo('attach_owl_brow_v1', () => new THREE.CylinderGeometry(0.015, 0.013, 0.18, 8).rotateZ(Math.PI / 2));

    const plumes = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const plume = makeMesh(plumeGeo, mats.dark);
      plume.position.set(side * 0.095, 0.092, 0.015);
      plume.rotation.z = side * -0.42;
      plume.rotation.y = side * -0.18;
      g.add(plume);
      plumes.push(plume);
    }

    const brow = makeMesh(browGeo, mats.light);
    brow.scale.set(1.0, 0.72, 0.85);
    brow.position.set(0, 0.045, 0.105);
    g.add(brow);

    g.userData = { plumes, brow };
    return g;
  }

  function makeBirdLegs(color) {
    const s = ensureShared();
    const mats = color !== undefined ? getSpeciesMats('bird', color) : null;
    const g = new THREE.Group();
    g.name = 'BirdLegs';

    const thighGeo = geo('attach_bird_thigh_v1', () => new THREE.CylinderGeometry(0.017, 0.011, 0.125, 6).translate(0, -0.0375, 0));
    const ankleGeo = geo('attach_bird_ankle_v1', () => new THREE.SphereGeometry(0.011, 6, 5));
    const shinGeo = geo('attach_bird_shin_v1', () => new THREE.CylinderGeometry(0.010, 0.008, 0.142, 6).translate(0, -0.165, 0));
    const toeGeo = geo('attach_bird_toe_v1', () => new THREE.ConeGeometry(0.0085, 0.072, 5));
    const legGeo = mergeGeo('attach_bird_leg_v1', () => [
      [thighGeo, 0, 0, 0, 0, 0, 0, 1, 1, 1],
      [ankleGeo, 0, -0.095, 0, 0, 0, 0, 1, 1, 1],
      [shinGeo, 0, 0, 0, 0, 0, 0, 1, 1, 1],
      [toeGeo, -0.018, -0.2315, 0.034, Math.PI * 0.5, 0, 0.42, 1, 1, 1],
      [toeGeo, 0, -0.2315, 0.036, Math.PI * 0.5, 0, 0, 1, 1, 1],
      [toeGeo, 0.018, -0.2315, 0.034, Math.PI * 0.5, 0, -0.42, 1, 1, 1],
      [toeGeo, 0, -0.2315, -0.028, -Math.PI * 0.5, 0, 0, 0.85, 0.72, 0.85],
    ]);
    const cuffGeo = mats
      ? geo('attach_bird_thigh_cuff_v1', () => new THREE.CylinderGeometry(0.024, 0.015, 0.072, 6).translate(0, -0.022, 0))
      : null;

    const legs = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const leg = new THREE.Group();
      leg.name = side < 0 ? 'LeftBirdLeg' : 'RightBirdLeg';
      leg.position.set(side * 0.056, 0.24, 0);
      leg.add(makeMesh(legGeo, s.wishBeak));
      if (cuffGeo && mats) {
        leg.add(makeMesh(cuffGeo, mats.main));
      }
      g.add(leg);
      legs.push(leg);
    }

    g.userData = { leftLeg: legs[0], rightLeg: legs[1] };
    return g;
  }

  function makeFireflyLantern() {
    const s = ensureShared();
    const g = new THREE.Group();
    g.name = 'FireflyLantern';

    const lanternMat = attachMat('attach_firefly_lantern_v1', () => new THREE.MeshStandardMaterial({
      color: 0xffe46b,
      emissive: 0xffaa1d,
      emissiveIntensity: 1.25,
      roughness: 0.16,
      metalness: 0.10,
    }));

    const orb = makeMesh(
      geo('attach_firefly_orb_v1', () => new THREE.SphereGeometry(0.095, 12, 10)),
      lanternMat
    );
    orb.scale.set(0.92, 0.88, 1.25);

    const ring = makeMesh(
      geo('attach_firefly_ring_v1', () => new THREE.TorusGeometry(0.082, 0.011, 6, 14)),
      s.goldTrim
    );
    ring.position.set(0, 0, 0.055);

    const halo = makeGlow(0xffcf52, 0.55, 0.78, false);
    g.add(orb, ring, halo);

    g.userData = { orb, halo };
    return g;
  }

  function makeKelpFronds(colorHex) {
    const col = colorHex !== undefined ? colorHex : 0x5ab86a;
    const frondMat = attachMat('attach_kelp_frond_mat_' + col, () => new THREE.MeshStandardMaterial({
      color: col,
      emissive: 0x0f3b22,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }));
    const frondGeo = geo('attach_kelp_frond_v1', () =>
      sculptKelpFrondGeo(new THREE.PlaneGeometry(0.11, 0.42, 4, 10).translate(0, -0.21, 0))
    );

    const g = new THREE.Group();
    g.name = 'KelpFronds';
    const fronds = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const frond = makeMesh(frondGeo, frondMat, false, true);
      frond.position.set(side * 0.055, 0.02, -0.02);
      frond.rotation.x = Math.PI * 0.44;
      frond.rotation.z = side * -0.34;
      frond.rotation.y = side * 0.22;
      g.add(frond);
      fronds.push(frond);
    }

    g.userData = { fronds };
    return g;
  }

  function makeWishCrown() {
    const s = ensureShared();
    const g = new THREE.Group();
    g.name = 'WishCrown';

    const circlet = makeMesh(
      geo('attach_wish_circlet_v1', () => new THREE.TorusGeometry(0.068, 0.011, 6, 16).rotateX(Math.PI / 2)),
      s.goldTrim
    );
    const star = makeMesh(
      geo('attach_wish_star_v1', () => new THREE.OctahedronGeometry(0.026, 0)),
      s.starCrystal
    );
    star.position.set(0, 0.036, 0.055);
    star.scale.set(1.0, 1.32, 0.72);

    const halo = makeGlow(0xffe476, 0.24, 0.75, true);
    halo.position.set(0, 0.04, 0.055);
    g.add(circlet, star, halo);

    g.userData = { circlet, star, halo };
    return g;
  }

  // ---------- Shadow Beast Bone Attachments & Combat Telegraph ----------

  function getShadowAttachMats() {
    return {
      obsidian: attachMat('attach_shadow_obsidian_v1', () => new THREE.MeshStandardMaterial({
        color: 0x161022,
        emissive: 0x090412,
        roughness: 0.28,
        metalness: 0.72,
      })),
      blade: attachMat('attach_shadow_blade_v1', () => new THREE.MeshStandardMaterial({
        color: 0x26153d,
        emissive: 0x18082a,
        emissiveIntensity: 0.45,
        roughness: 0.20,
        metalness: 0.82,
      })),
      horn: attachMat('attach_shadow_horn_v1', () => new THREE.MeshStandardMaterial({
        color: 0x1b102b,
        emissive: 0x0d0618,
        roughness: 0.26,
        metalness: 0.45,
      })),
      energy: attachMat('attach_shadow_energy_v1', () => new THREE.MeshStandardMaterial({
        color: 0xe62958,
        emissive: 0xd91b4c,
        emissiveIntensity: 1.45,
        roughness: 0.18,
        metalness: 0.22,
      })),
      magma: attachMat('attach_behemoth_magma_v1', () => new THREE.MeshStandardMaterial({
        color: 0xd92662,
        emissive: 0xa81648,
        emissiveIntensity: 1.35,
        roughness: 0.20,
        metalness: 0.25,
      })),
    };
  }

  function makeShadowBlade() {
    const mats = getShadowAttachMats();
    const g = new THREE.Group();
    g.name = 'ShadowBlade';

    const pommel = makeMesh(
      geo('attach_shadow_blade_pommel_v1', () => new THREE.OctahedronGeometry(0.042, 0)),
      mats.obsidian
    );
    pommel.position.set(0, -0.15, 0);

    const grip = makeMesh(
      geo('attach_shadow_blade_grip_v1', () => new THREE.CylinderGeometry(0.022, 0.026, 0.28, 8)),
      mats.obsidian
    );
    grip.position.set(0, 0, 0);

    const crossguard = makeMesh(
      geo('attach_shadow_blade_guard_v1', () => new THREE.BoxGeometry(0.32, 0.045, 0.065)),
      mats.obsidian
    );
    crossguard.position.set(0, 0.15, 0);

    const fangGeo = geo('attach_shadow_blade_fang_v1', () => new THREE.ConeGeometry(0.032, 0.14, 5).translate(0, 0.07, 0));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const fang = makeMesh(fangGeo, mats.obsidian);
      fang.position.set(side * 0.15, 0.15, 0);
      fang.rotation.z = side * -0.78;
      g.add(fang);
    }

    const blade = makeMesh(
      geo('attach_shadow_blade_body_v1', () => new THREE.ConeGeometry(0.082, 1.18, 4).translate(0, 0.59, 0)),
      mats.blade
    );
    blade.position.set(0, 0.17, 0);
    blade.scale.set(1.1, 1.0, 0.34);

    const fuller = makeMesh(
      geo('attach_shadow_blade_fuller_v1', () => new THREE.BoxGeometry(0.026, 0.84, 0.038).translate(0, 0.42, 0)),
      mats.energy
    );
    fuller.position.set(0, 0.20, 0);

    const glow = makeGlow(0xe62958, 0.42, 0.68, true);
    glow.position.set(0, 1.32, 0);

    g.add(pommel, grip, crossguard, blade, fuller, glow);
    g.userData = { grip, crossguard, blade, fuller, glow };
    return g;
  }

  function makeDreadCrown() {
    const mats = getShadowAttachMats();
    const g = new THREE.Group();
    g.name = 'DreadCrown';

    const circlet = makeMesh(
      geo('attach_dread_crown_circlet_v1', () => new THREE.TorusGeometry(0.115, 0.018, 6, 16).rotateX(Math.PI / 2).translate(0, 0.018, 0)),
      mats.obsidian
    );

    const hornBaseGeo = geo('attach_dread_crown_horn_a_v1', () => new THREE.ConeGeometry(0.036, 0.16, 6).translate(0, 0.08, 0));
    const hornTipGeo = geo('attach_dread_crown_horn_b_v1', () => new THREE.ConeGeometry(0.022, 0.18, 6).translate(0, 0.09, 0));
    const horns = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const horn = new THREE.Group();
      horn.position.set(side * 0.105, 0.02, 0.01);
      horn.rotation.z = side * -0.46;
      horn.rotation.x = -0.22;
      const segA = makeMesh(hornBaseGeo, mats.horn);
      const segB = makeMesh(hornTipGeo, mats.horn);
      segB.position.set(side * -0.02, 0.14, -0.02);
      segB.rotation.z = side * 0.34;
      segB.rotation.x = -0.26;
      horn.add(segA, segB);
      g.add(horn);
      horns.push(horn);
    }

    const crystal = makeMesh(
      geo('attach_dread_crown_crystal_v1', () => new THREE.OctahedronGeometry(0.042, 0)),
      mats.energy
    );
    crystal.position.set(0, 0.075, 0.11);
    crystal.scale.set(0.72, 1.75, 0.58);

    // Sleek dark-iron warhelm brow visor + twin blazing crimson eye slits beneath the crown!
    const visor = makeMesh(
      geo('attach_dread_crown_visor_v1', () => new THREE.BoxGeometry(0.22, 0.042, 0.055)),
      mats.obsidian
    );
    visor.position.set(0, -0.025, 0.112);

    const eyeSlitGeo = geo('attach_dread_crown_eye_v1', () => new THREE.BoxGeometry(0.055, 0.018, 0.025));
    const eyeL = makeMesh(eyeSlitGeo, mats.energy);
    eyeL.position.set(-0.048, -0.056, 0.122);
    eyeL.rotation.z = -0.18;
    const eyeR = makeMesh(eyeSlitGeo, mats.energy);
    eyeR.position.set(0.048, -0.056, 0.122);
    eyeR.rotation.z = 0.18;

    const glow = makeGlow(0xff2e58, 0.22, 0.62, true);
    glow.position.set(0, 0.09, 0.115);

    g.add(circlet, crystal, visor, eyeL, eyeR, glow);
    g.userData = { circlet, horns, crystal, visor, eyeL, eyeR, glow };
    return g;
  }

  function makeBehemothSpines() {
    const mats = getShadowAttachMats();
    const g = new THREE.Group();
    g.name = 'BehemothSpines';

    const spikeGeo = geo('attach_behemoth_spike_v1', () => new THREE.ConeGeometry(0.075, 0.36, 5).translate(0, 0.18, 0));
    const crystalGeo = geo('attach_behemoth_crystal_v1', () => new THREE.OctahedronGeometry(0.048, 0).translate(0, 0.048, 0));

    const spikes = [];
    const crystals = [];
    for (let i = 0; i < 5; i++) {
      const arch = 1.15 - Math.abs(i - 1.8) * 0.14;
      const zPos = 0.26 - i * 0.13;

      const spike = makeMesh(spikeGeo, mats.obsidian);
      spike.position.set(0, 0.0, zPos);
      spike.rotation.x = -0.26 - i * 0.12;
      spike.scale.set(0.85, arch, 1.15);

      const crystal = makeMesh(crystalGeo, mats.magma);
      crystal.position.set(0, 0.02, zPos + 0.02);
      crystal.rotation.x = -0.22 - i * 0.12;
      crystal.scale.set(0.62, arch * 1.45, 0.78);

      g.add(spike, crystal);
      spikes.push(spike);
      crystals.push(crystal);
    }

    g.userData = { spikes, crystals };
    return g;
  }

  function makeTelegraphRing() {
    const g = new THREE.Group();
    g.name = 'TelegraphRing';

    const outerGeo = geo('telegraph_outer_ring_v1', () => (
      typeof THREE.RingGeometry === 'function'
        ? new THREE.RingGeometry(0.84, 1.0, 32)
        : new THREE.TorusGeometry(0.92, 0.06, 6, 24)
    ));
    const innerGeo = geo('telegraph_inner_disc_v1', () => (
      typeof THREE.RingGeometry === 'function'
        ? new THREE.RingGeometry(0.08, 0.84, 24)
        : new THREE.TorusGeometry(0.46, 0.22, 4, 24)
    ));

    // Per-instance lightweight mutable materials so pooled telegraph rings can fade independently
    const outerMat = linearizeMat(new THREE.MeshBasicMaterial({
      color: 0xff2848,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const innerMat = linearizeMat(new THREE.MeshBasicMaterial({
      color: 0xff1e3c,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    const outerRing = makeMesh(outerGeo, outerMat, false, false);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.set(0, 0.06, 0);

    const innerDisc = makeMesh(innerGeo, innerMat, false, false);
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.position.set(0, 0.05, 0);

    g.add(outerRing, innerDisc);
    g.userData = { outerRing, innerDisc, outerMat, innerMat };
    return g;
  }

  return {
    makePlayer,
    makeStarkeeperBraids,
    makeStarkeeperEyes,
    makeStarkeeperHat,
    makeStarkeeperCloak,
    makeStarkeeperStaff,
    makeUnicornHorn,
    makeLynxEarTufts,
    makeDrakeEmberCrest,
    makeOwlEarTufts,
    makeBirdLegs,
    makeFireflyLantern,
    makeKelpFronds,
    makeWishCrown,
    makeShadowBlade,
    makeDreadCrown,
    makeBehemothSpines,
    makeTelegraphRing,
    makeWish,
    makeCritter,
    animateCritter,
    makeGloom,
    makeCocoon,
    makeTotem,
    makeStarPickup,
    makePearlPickup,
    makeHeartPickup,
    makeStarBolt,
  };
})();
