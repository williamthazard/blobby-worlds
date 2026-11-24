// ============================================================
// textures.js - Procedural PBR Texture Synthesizer & Sky IBL
// Generates seamless 256x256 tileable albedo (sRGB), Sobel normal,
// and roughness maps for all 12 terrain/prop/character materials,
// additive glow/sparkle sprites, and dynamic PMREM sky IBL.
// ============================================================

const Textures = (() => {
  'use strict';

  const SIZE = 256;
  const SPRITE_SIZE = 128;
  const TAU = Math.PI * 2;

  // 16 isotropic unit gradient directions for periodic 2D gradient noise
  const GRAD_X = new Float64Array(16);
  const GRAD_Y = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16;
    GRAD_X[i] = Math.cos(a);
    GRAD_Y[i] = Math.sin(a);
  }

  // Scratch object for zero-GC Worley F1/F2 inner-loop queries
  const _worleyScratch = { f1: 0, f2: 0, id: 0 };

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function clampByte(v) {
    const n = v < 0 ? 0 : (v > 255 ? 255 : v);
    return (n + 0.5) | 0;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function wrapInt(i, p) {
    if ((p & (p - 1)) === 0) return i & (p - 1);
    const m = i % p;
    return m < 0 ? m + p : m;
  }

  function hash2i(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function hash01(ix, iy, seed) {
    return (hash2i(ix, iy, seed) & 0xffffff) / 16777216;
  }

  function _periodicNoise2XY(x, y, px, py, seed = 1) {
    const perX = px > 1 ? (px | 0) : 1;
    const perY = py > 1 ? (py | 0) : 1;
    const pow2X = (perX & (perX - 1)) === 0;
    const pow2Y = (perY & (perY - 1)) === 0;
    const maskX = perX - 1;
    const maskY = perY - 1;

    const ix = x >= 0 ? (x | 0) : Math.floor(x);
    const iy = y >= 0 ? (y | 0) : Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    let x0, x1, y0, y1;
    if (pow2X) {
      x0 = ix & maskX;
      x1 = (x0 + 1) & maskX;
    } else {
      x0 = ((ix % perX) + perX) % perX;
      x1 = x0 + 1 >= perX ? 0 : x0 + 1;
    }
    if (pow2Y) {
      y0 = iy & maskY;
      y1 = (y0 + 1) & maskY;
    } else {
      y0 = ((iy % perY) + perY) % perY;
      y1 = y0 + 1 >= perY ? 0 : y0 + 1;
    }

    const g00 = hash2i(x0, y0, seed) & 15;
    const g10 = hash2i(x1, y0, seed) & 15;
    const g01 = hash2i(x0, y1, seed) & 15;
    const g11 = hash2i(x1, y1, seed) & 15;

    const fx1 = fx - 1;
    const fy1 = fy - 1;
    const d00 = GRAD_X[g00] * fx + GRAD_Y[g00] * fy;
    const d10 = GRAD_X[g10] * fx1 + GRAD_Y[g10] * fy;
    const d01 = GRAD_X[g01] * fx + GRAD_Y[g01] * fy1;
    const d11 = GRAD_X[g11] * fx1 + GRAD_Y[g11] * fy1;

    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

    const nx0 = d00 + (d10 - d00) * sx;
    const nx1 = d01 + (d11 - d01) * sx;
    const val = 0.5 + 0.707 * (nx0 + (nx1 - nx0) * sy);
    return val < 0 ? 0 : (val > 1 ? 1 : val);
  }

  function _periodicNoise2(x, y, period, seed = 1) {
    return _periodicNoise2XY(x, y, period, period, seed);
  }

  function _periodicFbmXY(x, y, px, py, octaves = 4, seed = 1) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * _periodicNoise2XY(x * freq, y * freq, px * freq, py * freq, seed + o * 101);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    const v = norm > 0 ? sum / norm : 0.5;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function _periodicFbm(x, y, period, octaves = 4, seed = 1) {
    return _periodicFbmXY(x, y, period, period, octaves, seed);
  }

  function _worleyF1F2XY(x, y, px, py, seed = 1, out = _worleyScratch) {
    const perX = px > 1 ? (px | 0) : 1;
    const perY = py > 1 ? (py | 0) : 1;
    const pow2X = (perX & (perX - 1)) === 0;
    const pow2Y = (perY & (perY - 1)) === 0;
    const maskX = perX - 1;
    const maskY = perY - 1;
    const ix = x >= 0 ? (x | 0) : Math.floor(x);
    const iy = y >= 0 ? (y | 0) : Math.floor(y);

    let f1Sq = 99;
    let f2Sq = 99;
    let bestId = 0;

    for (let dy = -1; dy <= 1; dy++) {
      const cyRaw = iy + dy;
      const cy = pow2Y ? (cyRaw & maskY) : (((cyRaw % perY) + perY) % perY);
      for (let dx = -1; dx <= 1; dx++) {
        const cxRaw = ix + dx;
        const cx = pow2X ? (cxRaw & maskX) : (((cxRaw % perX) + perX) % perX);

        const h = hash2i(cx, cy, seed);
        const jx = 0.08 + 0.84 * ((h & 0xfff) / 4096);
        const jy = 0.08 + 0.84 * (((h >>> 12) & 0xfff) / 4096);

        const pxPos = cxRaw + jx - x;
        const pyPos = cyRaw + jy - y;
        const dSq = pxPos * pxPos + pyPos * pyPos;

        if (dSq < f1Sq) {
          f2Sq = f1Sq;
          f1Sq = dSq;
          bestId = ((h >>> 24) & 0xff) / 255;
        } else if (dSq < f2Sq) {
          f2Sq = dSq;
        }
      }
    }

    out.f1 = Math.sqrt(f1Sq);
    out.f2 = Math.sqrt(f2Sq);
    out.id = bestId;
    return out;
  }

  function _worleyPeriodic(x, y, period, seed = 1) {
    const res = _worleyF1F2XY(x, y, period, period, seed, _worleyScratch);
    return res.f1 > 1 ? 1 : res.f1;
  }

  // Toroidal 3x3 Sobel gradient -> OpenGL tangent-space RGBA normal map bytes
  function _heightToNormalPixels(heights, size, strength = 2.5, out = null) {
    const pxOut = out || new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const ym = y === 0 ? size - 1 : y - 1;
      const yp = y === size - 1 ? 0 : y + 1;
      const rowM = ym * size;
      const row0 = y * size;
      const rowP = yp * size;

      for (let x = 0; x < size; x++) {
        const xm = x === 0 ? size - 1 : x - 1;
        const xp = x === size - 1 ? 0 : x + 1;

        const tl = heights[rowM + xm];
        const t = heights[rowM + x];
        const tr = heights[rowM + xp];
        const l = heights[row0 + xm];
        const r = heights[row0 + xp];
        const bl = heights[rowP + xm];
        const b = heights[rowP + x];
        const br = heights[rowP + xp];

        const dx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * 0.25;
        const dy = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * 0.25;

        const nx = -dx * strength;
        const ny = dy * strength;
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1);

        const idx = (row0 + x) * 4;
        pxOut[idx] = clampByte((nx * invLen * 0.5 + 0.5) * 255);
        pxOut[idx + 1] = clampByte((ny * invLen * 0.5 + 0.5) * 255);
        pxOut[idx + 2] = clampByte((invLen * 0.5 + 0.5) * 255);
        pxOut[idx + 3] = 255;
      }
    }
    return pxOut;
  }

  function writePixel(albedoPx, roughPx, idx4, r, g, b, rough) {
    albedoPx[idx4] = clampByte(r);
    albedoPx[idx4 + 1] = clampByte(g);
    albedoPx[idx4 + 2] = clampByte(b);
    albedoPx[idx4 + 3] = 255;
    const rb = clampByte(rough * 255);
    roughPx[idx4] = rb;
    roughPx[idx4 + 1] = rb;
    roughPx[idx4 + 2] = rb;
    roughPx[idx4 + 3] = 255;
  }

  function makeCanvasTexture(size, pixels, encoding, maxAniso, repeat) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.encoding = encoding;
    tex.anisotropy = repeat ? maxAniso : 1;
    tex.needsUpdate = true;
    return tex;
  }

  function buildSet(size, heights, albedoPx, roughPx, normalPx, normalStrength, maxAniso) {
    _heightToNormalPixels(heights, size, normalStrength, normalPx);
    return {
      map: makeCanvasTexture(size, albedoPx, THREE.sRGBEncoding, maxAniso, true),
      normalMap: makeCanvasTexture(size, normalPx, THREE.LinearEncoding, maxAniso, true),
      roughnessMap: makeCanvasTexture(size, roughPx, THREE.LinearEncoding, maxAniso, true),
    };
  }

  // ---------- 12 Material Synthesizers (256x256 Seamless Tileable) ----------

  function genGrass(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const macro = _periodicFbm(u * 4, v * 4, 4, 3, 11);
        const warp = (_periodicNoise2(u * 8, v * 8, 8, 23) - 0.5) * 0.9;
        const bladesA = _periodicNoise2XY(u * 16 + warp, v * 5, 16, 5, 37);
        const bladesB = _periodicNoise2XY(u * 24 - v * 12 + warp * 0.7, v * 12 + u * 6, 12, 6, 53);
        const micro = _periodicNoise2(u * 32, v * 32, 32, 71);
        const soilNoise = _periodicNoise2(u * 16, v * 16, 16, 89);

        const bladeMix = Math.max(bladesA, bladesB * 0.92);
        const turf = clamp01(macro * 0.32 + bladeMix * 0.52 + micro * 0.16);
        const soilMask = smoothstep(0.32, 0.18, turf) * smoothstep(0.35, 0.75, soilNoise);
        heights[idx] = clamp01(turf * (1 - soilMask * 0.55));

        const warm = smoothstep(0.45, 0.85, macro);
        let r = lerp(56, 128, turf) + warm * 16;
        let g = lerp(92, 162, turf) + warm * 8;
        let b = lerp(38, 66, turf);

        if (soilMask > 0.01) {
          r = lerp(r, 108, soilMask);
          g = lerp(g, 86, soilMask);
          b = lerp(b, 56, soilMask);
        }

        const rough = lerp(0.95, 0.78, clamp01(turf * (1 - soilMask * 0.6)));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genForest(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const moss = 1 - _worleyPeriodic(u * 6, v * 6, 6, 107);
        const humus = _periodicFbm(u * 4, v * 4, 4, 3, 121);
        const needlesA = _periodicNoise2XY(u * 20 + v * 10, v * 6, 10, 6, 139);
        const needlesB = _periodicNoise2XY(u * 18 - v * 9, v * 18 + u * 9, 9, 9, 151);
        const needle = smoothstep(0.62, 0.86, Math.max(needlesA, needlesB));
        const clover = smoothstep(0.55, 0.85, moss) * humus;

        heights[idx] = clamp01(humus * 0.35 + clover * 0.45 + needle * 0.28);

        let r = lerp(60, 54, clover);
        let g = lerp(48, 122, clover);
        let b = lerp(34, 52, clover);
        const tip = smoothstep(0.6, 0.92, clover);
        r = lerp(r, 86, tip);
        g = lerp(g, 148, tip);
        b = lerp(b, 64, tip);
        r = lerp(r, 126, needle * 0.78);
        g = lerp(g, 88, needle * 0.78);
        b = lerp(b, 48, needle * 0.78);

        const rough = clamp01(lerp(0.96, 0.80, clover * (1 - needle * 0.5)));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genSand(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const warp = _periodicFbm(u * 4, v * 4, 4, 3, 211);
        const phase = (u * 8 + v * 2) * TAU + (warp - 0.5) * 4.2;
        const ripple = 0.5 + 0.5 * Math.sin(phase + 0.45 * Math.sin(phase));
        const grain = _periodicNoise2(u * 64, v * 64, 64, 227);
        const glint = smoothstep(0.84, 0.96, grain);

        const h = clamp01(ripple * 0.68 + warp * 0.24 + grain * 0.08);
        heights[idx] = h;

        let r = lerp(196, 238, h);
        let g = lerp(164, 210, h);
        let b = lerp(112, 154, h);
        r = lerp(r, 252, glint * 0.65);
        g = lerp(g, 240, glint * 0.65);
        b = lerp(b, 208, glint * 0.65);

        const rough = clamp01(lerp(0.90, 0.65, ripple * 0.7 + glint * 0.3));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genSnow(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const drift = _periodicFbm(u * 3 + v * 3, v * 3, 3, 3, 307);
        const softWave = 0.5 + 0.5 * Math.sin((u * 3 - v * 1) * TAU + (drift - 0.5) * 2.5);
        const crust = _periodicNoise2(u * 32, v * 32, 32, 317);
        const sparkle = smoothstep(0.86, 0.98, _periodicNoise2(u * 64, v * 64, 64, 331));

        const h = clamp01(drift * 0.58 + softWave * 0.32 + crust * 0.10);
        heights[idx] = h;

        let r = lerp(196, 244, h);
        let g = lerp(216, 249, h);
        let b = lerp(238, 255, h);
        r = lerp(r, 255, sparkle * 0.6);
        g = lerp(g, 255, sparkle * 0.6);
        b = lerp(b, 255, sparkle * 0.6);

        const rough = clamp01(lerp(0.82, 0.55, softWave * 0.55 + sparkle * 0.45));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genRock(size, heights, albedoPx, roughPx) {
    // Stratified natural cliff rock (layered sedimentary horizontal bands + vertical fracture joints)
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const warp = (_periodicFbm(u * 2, v * 2, 2, 2, 401) - 0.5) * 0.90;
        const bed = _periodicFbmXY(u * 2, v * 12 + warp, 2, 12, 2, 419);
        const shelf = 0.5 + 0.5 * Math.sin((v * 8 + warp * 0.65) * TAU + (bed - 0.5) * 2.1);
        const ledge = smoothstep(0.18, 0.82, shelf);

        // Tall anisotropic fractured rock columns (NOT square cobblestone bricks!)
        const w = _worleyF1F2XY(u * 6 + warp * 0.32, v * 3, 6, 3, 433, _worleyScratch);
        const fissure = smoothstep(0.015, 0.16, w.f2 - w.f1);
        const hairline = smoothstep(0.015, 0.085, Math.abs(bed - 0.5));
        const microStrata = _periodicNoise2XY(u * 16 + warp * 0.5, v * 48, 16, 48, 461);
        const grit = _periodicNoise2(u * 32, v * 32, 32, 449);

        const strata = clamp01(bed * 0.36 + ledge * 0.28 + w.id * 0.13 + grit * 0.12 + microStrata * 0.11);
        const h = clamp01(strata * (0.40 + 0.60 * fissure) * (0.84 + 0.16 * hairline));
        heights[idx] = h;

        // Weathered Lake Hylia warm umber-ochre limestone & cool slate strata
        const ochre = smoothstep(0.28, 0.86, bed * 0.68 + shelf * 0.32);
        let r = lerp(64, 162, h) + ochre * 24;
        let g = lerp(59, 143, h) + ochre * 13;
        let b = lerp(54, 120, h) - ochre * 4;

        // Subtle dark sedimentary crevice shadows + faint damp lichen fleck in shaded cracks
        const seam = 1 - fissure * (0.75 + 0.25 * hairline);
        const lichen = seam * smoothstep(0.60, 0.90, _periodicNoise2(u * 8, v * 8, 8, 479));
        r = lerp(r, 40, seam * 0.64);
        g = lerp(g, 38, seam * 0.64);
        b = lerp(b, 42, seam * 0.64);
        r = lerp(r, 76, lichen * 0.35);
        g = lerp(g, 94, lichen * 0.35);
        b = lerp(b, 54, lichen * 0.35);

        const rough = clamp01(lerp(0.91, 0.69, fissure * (0.40 + bed * 0.45 + microStrata * 0.15)));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genBark(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const warp = (_periodicNoise2(u * 4, v * 4, 4, 503) - 0.5) * 0.7;
        const channel = _periodicFbmXY(u * 12 + warp, v * 2, 12, 2, 3, 521);
        const w = _worleyF1F2XY(u * 10 + warp * 0.8, v * 2, 10, 2, 541, _worleyScratch);
        const ridge = smoothstep(0.03, 0.28, w.f2 - w.f1);
        const fiber = _periodicNoise2XY(u * 32, v * 8, 32, 8, 557);
        const fineGrain = _periodicNoise2XY(u * 64 + warp * 1.1, v * 16, 64, 16, 571);
        const lenticel = smoothstep(0.74, 0.94, _periodicNoise2XY(u * 12, v * 24, 12, 24, 587)) * ridge;

        const h = clamp01((channel * 0.44 + fiber * 0.16 + fineGrain * 0.14 + 0.26) * (0.18 + 0.82 * ridge) - lenticel * 0.10);
        heights[idx] = h;

        const r = lerp(42, 158, h) - lenticel * 16;
        const g = lerp(30, 116, h) - lenticel * 12;
        const b = lerp(21, 80, h) - lenticel * 8;

        const rough = clamp01(lerp(0.98, 0.82, h));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genLeaves(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    const leafShade = new Float32Array(size * size);
    const leafVein = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        heights[idx] = 0.08 + 0.12 * _periodicFbm(u * 6, v * 6, 6, 2, 601);
        leafShade[idx] = 0.15;
      }
    }

    const count = 145;
    for (let i = 0; i < count; i++) {
      const layer = i / (count - 1);
      const cx = hash01(i, 1, 613) * size;
      const cy = hash01(i, 2, 613) * size;
      const angle = hash01(i, 3, 613) * TAU;
      const rx = 12 + hash01(i, 4, 613) * 10;
      const ry = rx * (0.48 + hash01(i, 5, 613) * 0.18);
      const tint = hash01(i, 6, 613);
      const baseZ = 0.25 + layer * 0.62;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const bound = Math.ceil(rx + 2);

      for (let dy = -bound; dy <= bound; dy++) {
        const py = wrapInt(Math.round(cy + dy), size);
        const row = py * size;
        for (let dx = -bound; dx <= bound; dx++) {
          const lx = dx * cosA + dy * sinA;
          const ly = -dx * sinA + dy * cosA;
          const u = lx / rx;
          if (u < -1 || u > 1) continue;

          const widthEnv = ry * (1 - 0.36 * u * u);
          const v = ly / widthEnv;
          const r2 = u * u + v * v;
          if (r2 > 1) continue;

          const px = wrapInt(Math.round(cx + dx), size);
          const idx = row + px;

          const edgeFade = smoothstep(1.0, 0.72, r2);
          const dome = (1 - v * v * 0.55) * (1 - u * u * 0.28);
          const midrib = smoothstep(0.16, 0.0, Math.abs(v)) * (1 - Math.abs(u) * 0.3);
          const sideVein = Math.max(0, Math.sin(u * 13 - Math.abs(v) * 7)) * 0.045 * (1 - r2);
          const leafH = baseZ + (dome * 0.12 + midrib * 0.04 + sideVein) * edgeFade;

          if (leafH > heights[idx]) {
            heights[idx] = leafH > 1 ? 1 : leafH;
            leafShade[idx] = 0.32 + layer * 0.58 + tint * 0.14;
            leafVein[idx] = midrib * 0.6 + dome * 0.25;
          }
        }
      }
    }

    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const micro = (_periodicNoise2(u * 32, v * 32, 32, 641) - 0.5) * 0.08;
        const s = clamp01(leafShade[idx] + micro);
        const vein = leafVein[idx];

        const r = lerp(52, 148, s) + vein * 22;
        const g = lerp(96, 212, s) + vein * 18;
        const b = lerp(42, 92, s) + vein * 8;

        const rough = clamp01(lerp(0.88, 0.65, clamp01(heights[idx])));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genStone(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      const dv = v - 0.5;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const du = u - 0.5;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const fbm = _periodicFbm(u * 6, v * 6, 6, 3, 701);
        const grain = _periodicNoise2(u * 32, v * 32, 32, 719);

        const wobbleU = (fbm - 0.5) * 0.018;
        const wobbleV = (_periodicNoise2(u * 12, v * 12, 12, 733) - 0.5) * 0.014;
        const rows = 4;
        const cols = 3;
        const rv = ((v + wobbleV) * rows % rows + rows) % rows;
        const rowId = rv | 0;
        const rf = rv - rowId;

        const rowShift = (rowId & 1) * 0.5;
        const cu = ((u + wobbleU) * cols + rowShift) % cols;
        const cuWrap = cu < 0 ? cu + cols : cu;
        const colId = cuWrap | 0;
        const cf = cuWrap - colId;

        const edgeDist = Math.min(Math.min(rf, 1 - rf) * (cols / rows), Math.min(cf, 1 - cf));
        const mortar = smoothstep(0.024, 0.082, edgeDist);
        const bevel = smoothstep(0.03, 0.14, edgeDist);
        const blockTint = hash01(colId, rowId, 743);
        const pit = _periodicNoise2(u * 64, v * 64, 64, 757);

        const rad = Math.sqrt(du * du + dv * dv);
        const ringOuter = 1 - smoothstep(0.004, 0.014, Math.abs(rad - 0.34));
        const ringInner = 1 - smoothstep(0.004, 0.013, Math.abs(rad - 0.19));
        const crossH = 1 - smoothstep(0.003, 0.011, Math.abs(dv));
        const crossV = 1 - smoothstep(0.003, 0.011, Math.abs(du));
        const starCross = Math.max(crossH, crossV) * smoothstep(0.42, 0.06, rad);
        const runeGroove = Math.max(Math.max(ringOuter, ringInner), starCross);

        const stoneH = clamp01((0.60 + fbm * 0.22 + grain * 0.10 + pit * 0.08) * (0.24 + 0.62 * mortar + 0.14 * bevel) - runeGroove * 0.34);
        heights[idx] = stoneH;

        const base = lerp(136, 204, blockTint * 0.34 + fbm * 0.42 + grain * 0.14 + pit * 0.10);
        let r = base * 0.96;
        let g = base * 0.99;
        let b = base * 1.03;

        const seamMoss = (1 - mortar) * smoothstep(0.46, 0.84, fbm);
        r = lerp(78, r, mortar);
        g = lerp(86, g, mortar);
        b = lerp(92, b, mortar);
        r = lerp(r, 64, seamMoss * 0.45);
        g = lerp(g, 92, seamMoss * 0.45);
        b = lerp(b, 56, seamMoss * 0.45);

        r = lerp(r, 74, runeGroove * 0.80);
        g = lerp(g, 89, runeGroove * 0.80);
        b = lerp(b, 116, runeGroove * 0.80);

        const rough = clamp01(lerp(0.92, 0.72, mortar * (1 - runeGroove * 0.85) * (0.35 + 0.50 * fbm + 0.15 * pit)));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genCloth(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    const freq = 32 * TAU;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      const cellV = (v * 32) | 0;
      const weftSin = Math.sin(v * freq);
      const threadV = 0.5 + 0.5 * Math.cos(v * freq);

      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const cellU = (u * 32) | 0;
        const warpSin = Math.sin(u * freq);
        const threadU = 0.5 + 0.5 * Math.cos(u * freq);
        const over = ((cellU + cellV) & 1) === 0;

        const weave = over
          ? threadU * 0.72 + threadV * 0.28 + 0.08 * warpSin
          : threadV * 0.72 + threadU * 0.28 + 0.08 * weftSin;

        const slub = _periodicFbm(u * 8, v * 8, 8, 3, 809);
        const micro = _periodicNoise2(u * 64, v * 64, 64, 821);

        const h = clamp01(weave * 0.62 + slub * 0.26 + micro * 0.12);
        heights[idx] = h;

        const val = lerp(204, 248, h);
        const rough = clamp01(lerp(0.92, 0.75, h));
        writePixel(albedoPx, roughPx, idx4, val, val * 0.99, val * 0.96, rough);
      }
    }
  }

  function genLeather(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        const warp = (_periodicNoise2(u * 8, v * 8, 8, 907) - 0.5) * 0.35;
        const w = _worleyF1F2XY(u * 14 + warp, v * 14 + warp, 14, 14, 919, _worleyScratch);
        const pebble = Math.sqrt(clamp01((w.f2 - w.f1) * 2.2));
        const patina = _periodicFbm(u * 4, v * 4, 4, 3, 937);
        const grain = _periodicNoise2(u * 32, v * 32, 32, 953);

        const h = clamp01(pebble * 0.72 + patina * 0.18 + grain * 0.10);
        heights[idx] = h;

        const burnish = clamp01(pebble * 0.65 + patina * 0.35 + (w.id - 0.5) * 0.12);
        const r = lerp(128, 224, burnish);
        const g = lerp(86, 178, burnish);
        const b = lerp(52, 128, burnish);

        const rough = clamp01(lerp(0.72, 0.48, pebble * 0.7 + patina * 0.3));
        writePixel(albedoPx, roughPx, idx4, r, g, b, rough);
      }
    }
  }

  function genFur(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        // Continuous silky directional fur strands + organic soft mottled coat blotches (NO shingle grid!)
        const flow = (_periodicNoise2(u * 4, v * 4, 4, 1009) - 0.5) * 0.45;
        const fineA = _periodicNoise2XY(u * 48 + flow * 4, v * 6, 48, 6, 1021);
        const fineB = _periodicNoise2XY(u * 96 - flow * 3, v * 12, 96, 12, 1039);
        const hairWave = 0.5 + 0.5 * Math.sin((u * 64 + flow * 6 + Math.sin(v * TAU * 4) * 0.25) * TAU);
        const mottle = _periodicNoise2(u * 4, v * 4, 4, 1063);

        const strand = fineA * 0.46 + fineB * 0.24 + hairWave * 0.30;
        const h = clamp01(strand * 0.76 + mottle * 0.24);
        heights[idx] = h;

        // Soft velvety fur albedo with gentle natural coat mottle
        const val = lerp(188, 252, h);
        const warmShift = lerp(0.95, 1.0, mottle);
        const rough = clamp01(lerp(0.88, 0.70, strand));
        writePixel(albedoPx, roughPx, idx4, val, val * (0.985 + 0.015 * warmShift), val * warmShift, rough);
      }
    }
  }

  function genFeather(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    // Bold, unmistakable overlapping bird plumage shingles (100% seamless C0 wrap across row boundaries!)
    const cols = 4;
    const rows = 6;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      const vr = v * rows;
      const r0 = Math.floor(vr);
      const fv0 = vr - r0;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        // Upper row (r0 - 1) feather tip drapes down into row r0 by tipAbove = 0.56 * (1 - dxAbove^2)
        const ucAbove = u * cols + (((r0 - 1) & 1) ? 0.5 : 0.0);
        const fuAbove = ucAbove - Math.floor(ucAbove);
        const dxAbove = Math.abs(fuAbove - 0.5) * 2;
        const tipAbove = 0.56 * (1.0 - dxAbove * dxAbove);

        let dx, fv, overlapShadow;
        if (fv0 < tipAbove) {
          // Lower curved tip of feather from row (r0 - 1): seamlessly continues from fv0=1.0 of previous row!
          dx = dxAbove;
          fv = (1.0 + fv0) / (1.0 + tipAbove);
          const edgeDrop = smoothstep(tipAbove - 0.10, tipAbove, fv0);
          overlapShadow = 0.30 * edgeDrop;
        } else {
          // Body of feather in row r0, tucked under row (r0 - 1)'s scalloped lip!
          const uc0 = u * cols + ((r0 & 1) ? 0.5 : 0.0);
          const fu0 = uc0 - Math.floor(uc0);
          dx = Math.abs(fu0 - 0.5) * 2;
          const tip0 = 0.56 * (1.0 - dx * dx);
          fv = fv0 / (1.0 + tip0);
          // Crisp dark drop-shadow immediately underneath the overlapping feather tip above
          const distBelowLip = fv0 - tipAbove;
          overlapShadow = 0.54 * (1.0 - smoothstep(0.0, 0.24, distBelowLip));
        }

        // Bold pale central rachis (quill shaft) + crisp angled herringbone vane barbs + bright feather tip rim
        const r2 = dx * dx * 65.0;
        const rachis = r2 < 10 ? (1 - fv * 0.35) / (1 + r2 + 0.5 * r2 * r2) : 0;
        const barb = 0.5 + 0.5 * Math.sin((dx * 9.0 - fv * 7.5) * TAU);
        const tipHighlight = smoothstep(0.68, 0.94, fv) * (1 - smoothstep(0.94, 1.0, fv)) * 0.28;
        const baseDome = (1 - dx * dx * 0.42) * (0.60 + 0.40 * fv);

        const h = clamp01((baseDome * 0.54 + barb * 0.18 + rachis * 0.32 + tipHighlight) * (1 - overlapShadow));
        heights[idx] = h;

        // High-contrast crisp overlapping plumage shading + sleek silky feather sheen
        const val = lerp(118, 255, h);
        const quillTint = rachis * 22;
        const rough = clamp01(lerp(0.78, 0.42, h));
        writePixel(albedoPx, roughPx, idx4, val + quillTint, val * 0.99 + quillTint, val * 0.97 + quillTint, rough);
      }
    }
  }

  function genScales(size, heights, albedoPx, roughPx) {
    const inv = 1 / size;
    const cols = 10;
    const rows = 12;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      const vr = v * rows;
      const r0 = Math.floor(vr);
      const fv0 = vr - r0;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;
        const idx4 = idx * 4;

        // Overlapping staggered diamond/teardrop scales with beveled dome & subtle central keel
        const uc0 = u * cols + (r0 & 1) * 0.5;
        const fu0 = uc0 - Math.floor(uc0);
        const dx0 = Math.abs(fu0 - 0.5) * 2;
        const lip0 = 1.0 - 0.72 * dx0 * dx0;
        const upper = fv0 < lip0;

        let dx, fv;
        if (upper) {
          dx = dx0;
          fv = fv0 / Math.max(0.18, lip0);
        } else {
          const uc1 = u * cols + ((r0 + 1) & 1) * 0.5;
          const fu1 = uc1 - Math.floor(uc1);
          dx = Math.abs(fu1 - 0.5) * 2;
          fv = clamp01((fv0 - lip0) * 1.6);
        }

        // Convex scale dome + sharp dark crevice rim between overlapping plates + dorsal keel ridge
        const dv = fv - 0.32;
        const distRimSq = dx * dx * 0.8464 + dv * dv * 0.9025;
        const dome = clamp01(1.0 - distRimSq * 0.92);
        const k2 = dx * dx * 24.0;
        const keel = k2 < 10 ? ((0.3 + 0.7 * (1 - fv)) * 0.22) / (1 + k2 + 0.5 * k2 * k2) : 0;
        const crevice = upper ? smoothstep(lip0 - 0.14, lip0, fv0) : 0.65 * (1 - fv);
        const h = clamp01((dome * 0.74 + keel + 0.16) * (1 - crevice * 0.58));
        heights[idx] = h;

        const val = lerp(144, 250, h);
        const rough = clamp01(lerp(0.68, 0.30, dome * (1 - crevice * 0.6)));
        writePixel(albedoPx, roughPx, idx4, val * 0.98, val, val * 0.97, rough);
      }
    }
  }

  function genWaterNormal(size, heights) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = y * size + x;

        const w1 = Math.sin((u * 4 + v * 2) * TAU) * 0.18;
        const w2 = Math.cos((u * 3 - v * 5) * TAU) * 0.14;
        const w3 = Math.sin((u * 7 + v * 6) * TAU) * 0.09;
        const fbmA = _periodicFbm(u * 8, v * 8, 8, 3, 1103) - 0.5;
        const fbmB = _periodicNoise2(u * 16, v * 16, 16, 1117) - 0.5;
        const cap = Math.sin((u * 13 - v * 9) * TAU + fbmA * 2.4) * 0.06;
        const fineRip = _periodicNoise2(u * 32, v * 32, 32, 1131) - 0.5;

        heights[idx] = clamp01(0.5 + w1 + w2 + w3 + cap + fbmA * 0.38 + fbmB * 0.18 + fineRip * 0.14);
      }
    }
  }

  function buildGlowSprite(size, maxAniso) {
    const px = new Uint8Array(size * size * 4);
    const half = size * 0.5;
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5 - half) / half;
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - half) / half;
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        const idx4 = (y * size + x) * 4;

        if (r >= 1.0) {
          px[idx4] = 255;
          px[idx4 + 1] = 255;
          px[idx4 + 2] = 255;
          px[idx4 + 3] = 0;
          continue;
        }

        const gauss = Math.exp(-r2 * 5.2);
        const edgeFade = 1 - smoothstep(0.68, 1.0, r);
        const alpha = clampByte(gauss * edgeFade * 255);
        px[idx4] = 255;
        px[idx4 + 1] = 255;
        px[idx4 + 2] = 255;
        px[idx4 + 3] = alpha;
      }
    }
    return makeCanvasTexture(size, px, THREE.sRGBEncoding, maxAniso, false);
  }

  function buildSparkleSprite(size, maxAniso) {
    const px = new Uint8Array(size * size * 4);
    const half = size * 0.5;
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5 - half) / half;
      const ady = Math.abs(dy);
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - half) / half;
        const adx = Math.abs(dx);
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        const idx4 = (y * size + x) * 4;

        if (r >= 1.0) {
          px[idx4] = 255;
          px[idx4 + 1] = 255;
          px[idx4 + 2] = 255;
          px[idx4 + 3] = 0;
          continue;
        }

        const core = Math.exp(-r2 * 16.0);
        const rayH = Math.exp(-ady * 28.0) * Math.exp(-adx * 3.4);
        const rayV = Math.exp(-adx * 28.0) * Math.exp(-ady * 3.4);
        const diagA = Math.abs(dx - dy) * 0.7071;
        const diagB = Math.abs(dx + dy) * 0.7071;
        const microDiag = (Math.exp(-diagA * 34.0) + Math.exp(-diagB * 34.0)) * Math.exp(-r * 6.0) * 0.35;
        const edgeFade = 1 - smoothstep(0.72, 1.0, r);

        const intensity = clamp01((core + (rayH + rayV) * 0.85 + microDiag) * edgeFade);
        px[idx4] = 255;
        px[idx4 + 1] = 255;
        px[idx4 + 2] = 255;
        px[idx4 + 3] = clampByte(intensity * 255);
      }
    }
    return makeCanvasTexture(size, px, THREE.sRGBEncoding, maxAniso, false);
  }

  let _cardFallbackPx = null;

  function buildFoliageCard(kind, size, maxAniso) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (ctx && typeof ctx.beginPath === 'function') {
      ctx.clearRect(0, 0, size, size);
      const cx = size * 0.5;
      const cy = size * 0.52;
      const scale = size / 256;

      if (kind === 'oak') {
        // Woody branching twigs radiating from center with warm sunlit bark highlight
        ctx.lineCap = 'round';
        const twigs = [
          [0, 0.38, 0, -0.36, 4.8],
          [0, 0.16, -0.32, -0.14, 3.4],
          [0, 0.16, 0.32, -0.14, 3.4],
          [0, -0.04, -0.28, -0.32, 2.8],
          [0, -0.04, 0.28, -0.32, 2.8],
          [0, 0.26, -0.28, 0.14, 2.6],
          [0, 0.26, 0.28, 0.14, 2.6],
          [-0.14, -0.18, -0.36, -0.26, 1.9],
          [0.14, -0.18, 0.36, -0.26, 1.9],
        ];
        for (let i = 0; i < twigs.length; i++) {
          const t = twigs[i];
          ctx.strokeStyle = '#4a301e';
          ctx.lineWidth = t[4] * scale;
          ctx.beginPath();
          ctx.moveTo(cx + t[0] * size, cy + t[1] * size);
          ctx.lineTo(cx + t[2] * size, cy + t[3] * size);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(136, 98, 66, 0.45)';
          ctx.lineWidth = Math.max(1, t[4] * 0.35 * scale);
          ctx.beginPath();
          ctx.moveTo(cx + t[0] * size - 1, cy + t[1] * size - 1);
          ctx.lineTo(cx + t[2] * size - 1, cy + t[3] * size - 1);
          ctx.stroke();
        }

        // 48 layered serrated/lobed botanical oak leaves with lateral veins & airy sky gaps
        const leafCount = 48;
        const deepFills = ['#235321', '#2c6528', '#35742f'];
        const midFills = ['#3e8436', '#4c963f', '#5aa746'];
        const topFills = ['#68b24c', '#7bc455', '#8ed460'];
        for (let i = 0; i < leafCount; i++) {
          const ring = i < 18 ? 0 : i < 36 ? 1 : 2;
          const idxInRing = ring === 0 ? i : ring === 1 ? i - 18 : i - 36;
          const totalInRing = ring === 0 ? 18 : ring === 1 ? 18 : 12;
          const baseAng = (idxInRing / totalInRing) * TAU + ring * 0.44 + ((i * 37) % 11 - 5) * 0.032;
          const dist = (ring === 0 ? 0.33 : ring === 1 ? 0.21 : 0.095) * size * (0.88 + ((i * 23) % 10) * 0.022);
          const lx = cx + Math.cos(baseAng) * dist;
          const ly = cy + Math.sin(baseAng) * dist * 0.94;
          const len = (ring === 0 ? 0.145 : ring === 1 ? 0.135 : 0.12) * size * (0.88 + ((i * 17) % 7) * 0.03);
          const wid = len * 0.58;

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(baseAng + Math.PI * 0.5);

          // Inner canopy depth shading -> sunlit outer golden-emerald crowns
          const palette = ring === 2 ? deepFills : ring === 1 ? midFills : topFills;
          ctx.fillStyle = palette[i % 3];
          ctx.beginPath();
          ctx.moveTo(0, len * 0.44);
          ctx.quadraticCurveTo(-wid * 0.85, len * 0.20, -wid * 0.68, len * 0.06);
          ctx.quadraticCurveTo(-wid * 1.12, -len * 0.12, -wid * 0.62, -len * 0.24);
          ctx.quadraticCurveTo(-wid * 0.72, -len * 0.42, 0, -len * 0.60);
          ctx.quadraticCurveTo(wid * 0.72, -len * 0.42, wid * 0.62, -len * 0.24);
          ctx.quadraticCurveTo(wid * 1.12, -len * 0.12, wid * 0.68, len * 0.06);
          ctx.quadraticCurveTo(wid * 0.85, len * 0.20, 0, len * 0.44);
          ctx.closePath();
          ctx.fill();

          // Subtle leaf edge highlight on outer sunlit ring
          if (ring === 0) {
            ctx.strokeStyle = 'rgba(184, 232, 128, 0.35)';
            ctx.lineWidth = Math.max(1, size * 0.0025);
            ctx.stroke();
          }

          // Crisp central midrib vein + 3 pairs of delicate lateral veins
          ctx.strokeStyle = ring === 2 ? 'rgba(145, 198, 108, 0.34)' : 'rgba(222, 246, 168, 0.48)';
          ctx.lineWidth = Math.max(1, size * 0.0038);
          ctx.beginPath();
          ctx.moveTo(0, len * 0.36);
          ctx.lineTo(0, -len * 0.48);
          for (let vIdx = 0; vIdx < 3; vIdx++) {
            const vy = lerp(len * 0.18, -len * 0.24, vIdx / 2);
            const vw = wid * (0.62 - vIdx * 0.12);
            ctx.moveTo(0, vy);
            ctx.lineTo(-vw, vy - len * 0.10);
            ctx.moveTo(0, vy);
            ctx.lineTo(vw, vy - len * 0.10);
          }
          ctx.stroke();
          ctx.restore();
        }
      } else {
        // Feathery evergreen pine-bough needle spray (with optional snow-dusted clusters)
        const snow = kind === 'pineSnow';
        ctx.strokeStyle = '#48301e';
        ctx.lineWidth = 4.6 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, size * 0.90);
        ctx.lineTo(cx, size * 0.14);
        ctx.stroke();

        // 6 pairs of angled sub-branchlets + leader fanning outward
        const branches = [
          [0, 0.84, -0.34, 0.62], [0, 0.84, 0.34, 0.62],
          [0, 0.70, -0.40, 0.44], [0, 0.70, 0.40, 0.44],
          [0, 0.56, -0.36, 0.28], [0, 0.56, 0.36, 0.28],
          [0, 0.42, -0.28, 0.16], [0, 0.42, 0.28, 0.16],
          [0, 0.30, -0.18, 0.09], [0, 0.30, 0.18, 0.09],
          [0, 0.20, 0, 0.05],
        ];
        for (let b = 0; b < branches.length; b++) {
          const br = branches[b];
          const x0 = cx + br[0] * size;
          const y0 = br[1] * size;
          const x1 = cx + br[2] * size;
          const y1 = br[3] * size;
          const ang = Math.atan2(y1 - y0, x1 - x0);
          ctx.strokeStyle = '#462e1c';
          ctx.lineWidth = 2.4 * scale;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();

          // Dense multi-layered radiating needle sprays along each branchlet
          const steps = 11;
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const bx = lerp(x0, x1, t);
            const by = lerp(y0, y1, t);
            const nLen = (0.088 + (1 - t) * 0.042) * size;
            for (let side = -2; side <= 2; side++) {
              const na = ang + side * (0.40 + (s % 2) * 0.07);
              const nx = bx + Math.cos(na) * nLen;
              const ny = by + Math.sin(na) * nLen;
              const isTipSnow = snow && (t > 0.38 || b >= 6) && (side >= -1);
              if (isTipSnow) {
                ctx.strokeStyle = (s + side) % 2 === 0 ? '#f0f7fc' : '#cfe2ee';
              } else {
                const shadeIdx = (s + Math.abs(side)) % 3;
                ctx.strokeStyle = shadeIdx === 0 ? '#1e4e32' : (shadeIdx === 1 ? '#2d6e46' : '#418f54');
              }
              ctx.lineWidth = (2.6 + (1 - t) * 1.1) * scale;
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(nx, ny);
              ctx.stroke();
            }
          }

          // Organic powdery snow clumps perched along upper pine boughs
          if (snow && b >= 2) {
            ctx.fillStyle = 'rgba(238, 246, 252, 0.85)';
            for (let d = 1; d <= 3; d++) {
              const t = d * 0.28;
              const sx = lerp(x0, x1, t);
              const sy = lerp(y0, y1, t) - size * 0.012;
              ctx.beginPath();
              ctx.arc(sx, sy, size * (0.022 - d * 0.003), 0, TAU);
              ctx.fill();
            }
          }
        }
      }

      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
      return tex;
    }

    // Headless Node mock fallback (reuses buffer for fast zero-GC boot)
    const needLen = size * size * 4;
    if (!_cardFallbackPx || _cardFallbackPx.length < needLen) {
      _cardFallbackPx = new Uint8Array(needLen);
    }
    const px = _cardFallbackPx;
    const half = size * 0.5;
    const invHalf = 1 / half;
    const rLimitSq = 0.85 * 0.85;
    const isSnow = kind === 'pineSnow';
    const baseR = isSnow ? 220 : (kind === 'pine' ? 54 : 88);
    const baseG = isSnow ? 236 : (kind === 'pine' ? 128 : 168);
    const baseB = isSnow ? 245 : (kind === 'pine' ? 76 : 92);
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5 - half) * invHalf;
      const dy2 = dy * dy;
      const rowOff = y * size;
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - half) * invHalf;
        const idx4 = (rowOff + x) * 4;
        px[idx4] = baseR;
        px[idx4 + 1] = baseG;
        px[idx4 + 2] = baseB;
        px[idx4 + 3] = (dx * dx + dy2) < rLimitSq ? 255 : 0;
      }
    }
    return makeCanvasTexture(size, px.subarray(0, needLen), THREE.sRGBEncoding, maxAniso, false);
  }

  function buildFernCard(size, maxAniso) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (ctx && typeof ctx.beginPath === 'function') {
      ctx.clearRect(0, 0, size, size);
      const cx = size * 0.5;
      const baseY = size * 0.94;
      // 7 arching fern / broadleaf forest fronds fanning upward from a root clump
      const fronds = [
        [-0.78, 0.78], [-0.52, 0.88], [-0.26, 0.96],
        [0.0, 1.0],
        [0.26, 0.96], [0.52, 0.88], [0.78, 0.78],
      ];
      for (let f = 0; f < fronds.length; f++) {
        const tilt = fronds[f][0];
        const len = fronds[f][1] * size * 0.80;
        const tipX = cx + Math.sin(tilt) * len;
        const tipY = baseY - Math.cos(tilt) * len;
        const midX = lerp(cx, tipX, 0.5) + tilt * size * 0.08;
        const midY = lerp(baseY, tipY, 0.5) - size * 0.04;

        ctx.strokeStyle = '#335927';
        ctx.lineWidth = Math.max(1.4, size * 0.018);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, baseY);
        ctx.quadraticCurveTo(midX, midY, tipX, tipY);
        ctx.stroke();

        // Pairs of scalloped pinnae leaflets along each arching frond + sunlit vein highlights
        const pairs = 9;
        for (let p = 1; p <= pairs; p++) {
          const t = p / (pairs + 0.5);
          const it = 1 - t;
          const bx = it * it * cx + 2 * it * t * midX + t * t * tipX;
          const by = it * it * baseY + 2 * it * t * midY + t * t * tipY;
          const tx = 2 * it * (midX - cx) + 2 * t * (tipX - midX);
          const ty = 2 * it * (midY - baseY) + 2 * t * (tipY - midY);
          const ang = Math.atan2(ty, tx);
          const leafLen = size * (0.145 - t * 0.078) * (0.88 + (f % 2) * 0.16);
          const leafWid = leafLen * 0.44;
          for (let side = -1; side <= 1; side += 2) {
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(ang + side * 1.12);
            const gShade = t > 0.58 ? '#78b24c' : (f % 2 === 0 ? '#4d8236' : '#3d6e2d');
            ctx.fillStyle = gShade;
            ctx.beginPath();
            ctx.ellipse(leafLen * 0.52, 0, leafLen * 0.54, leafWid * 0.52, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(218, 245, 165, 0.35)';
            ctx.lineWidth = Math.max(0.8, size * 0.008);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(leafLen * 0.85, 0);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
      return tex;
    }

    // Node headless fallback
    const px = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const ny = y / (size - 1);
      for (let x = 0; x < size; x++) {
        const nx = (x / (size - 1)) * 2 - 1;
        const arch = Math.abs(nx) < (0.85 * (1.05 - ny * 0.35)) && ny > 0.10;
        const idx4 = (y * size + x) * 4;
        px[idx4] = 74;
        px[idx4 + 1] = 132;
        px[idx4 + 2] = 54;
        px[idx4 + 3] = arch ? 255 : 0;
      }
    }
    return makeCanvasTexture(size, px, THREE.sRGBEncoding, maxAniso, false);
  }

  function buildStarkeeperFaceTex(size, maxAniso) {
    // Spherical face UV map aligned to head sphere rotated so +Z front sits cleanly at u = 0.5, y = 0.5
    const px = new Uint8Array(size * size * 4);
    const inv = 1 / (size - 1);
    for (let y = 0; y < size; y++) {
      const v = y * inv; // 0 = crown top (+Y), 1 = chin/neck bottom (-Y)
      for (let x = 0; x < size; x++) {
        const u = x * inv; // 0.5 = nose centerline (+Z)
        const du = u - 0.5;
        const idx4 = (y * size + x) * 4;

        // Warm rich medium-deep brown skin base (darker side of mixed spectrum) with luminous dimensional sculpting
        const grain = (hash01(x, y, 701) - 0.5) * 3.4;
        let r = 130 + grain;
        let g = 78 + grain * 0.70;
        let b = 46 + grain * 0.52;

        // Soft warm golden-bronze sculptural facial highlights (brow center, nose bridge, upper cheekbones & chin)
        // so the face reads dimensionally expressive in both twilight and bright daylight!
        const browHi = Math.max(0, 1 - Math.hypot(du / 0.118, (v - 0.395) / 0.048));
        const bridgeHi = Math.max(0, 1 - Math.hypot(du / 0.015, (v - 0.495) / 0.048));
        const cheekHiL = Math.max(0, 1 - Math.hypot((du + 0.072) / 0.046, (v - 0.530) / 0.032));
        const cheekHiR = Math.max(0, 1 - Math.hypot((du - 0.072) / 0.046, (v - 0.530) / 0.032));
        const chinHi = Math.max(0, 1 - Math.hypot(du / 0.032, (v - 0.700) / 0.026));
        const faceLift = Math.min(1, browHi * browHi * 0.34 + bridgeHi * bridgeHi * 0.48 + Math.max(cheekHiL, cheekHiR) * 0.32 + chinHi * chinHi * 0.36);
        r = lerp(r, 168, faceLift * 0.55);
        g = lerp(g, 108, faceLift * 0.55);
        b = lerp(b, 68, faceLift * 0.55);

        // Warm healthy mahogany-terracotta cheek blush on both cheeks
        const cL = Math.hypot((du + 0.084) / 0.062, (v - 0.562) / 0.048);
        const cR = Math.hypot((du - 0.084) / 0.062, (v - 0.562) / 0.048);
        const cheekBlush = Math.max(0, 1 - Math.min(cL, cR));
        const blushW = cheekBlush * cheekBlush * 0.40;
        r = lerp(r, 152, blushW);
        g = lerp(g, 74, blushW);
        b = lerp(b, 50, blushW);

        // Sculpted nose-tip warmth + subtle side-nose & under-nose contour shading
        const noseD = Math.hypot(du / 0.026, (v - 0.538) / 0.024);
        const noseW = Math.max(0, 1 - noseD);
        r = lerp(r, 162, noseW * noseW * 0.36);
        g = lerp(g, 98, noseW * noseW * 0.36);
        b = lerp(b, 60, noseW * noseW * 0.36);

        const noseSideL = Math.max(0, 1 - Math.hypot((du + 0.024) / 0.014, (v - 0.520) / 0.042));
        const noseSideR = Math.max(0, 1 - Math.hypot((du - 0.024) / 0.014, (v - 0.520) / 0.042));
        const noseUnder = Math.max(0, 1 - Math.hypot(du / 0.026, (v - 0.568) / 0.014));
        const noseShadow = Math.min(1, noseUnder * noseUnder * 0.42 + Math.max(noseSideL, noseSideR) * 0.20);
        r = lerp(r, 74, noseShadow);
        g = lerp(g, 42, noseShadow);
        b = lerp(b, 25, noseShadow);

        // Soft recessed eye-socket ambient shading so glossy 3D eyes nestle naturally into the skull
        const sL = Math.hypot((du + 0.064) / 0.044, (v - 0.468) / 0.038);
        const sR = Math.hypot((du - 0.064) / 0.044, (v - 0.468) / 0.038);
        const sock = Math.max(0, 1 - Math.min(sL, sR));
        const sockW = sock * sock * 0.32;
        r = lerp(r, 78, sockW);
        g = lerp(g, 44, sockW);
        b = lerp(b, 26, sockW);

        // Expressive, youthful, natural MOUTH & SOFT TWO-TONE LIPS (proportioned cleanly to center of face,
        // seated naturally between nose base and rounded chin — NEVER wrapping around the jaw edges!)
        const mouthSpan = 0.027;
        const mNorm = Math.min(1, Math.abs(du) / mouthSpan);
        const smileCurve = -0.0095 * mNorm * mNorm; // gentle cheerful upward smile corners
        const cupidsBow = Math.cos(Math.min(Math.PI * 2, mNorm * Math.PI * 2.2)) * 0.0018 * (1 - mNorm);
        const lipCenterV = 0.614 + smileCurve;
        const lipDx = du / mouthSpan;
        const lipDy = (v - lipCenterV) / 0.017;
        const lipD = Math.hypot(lipDx, lipDy);
        if (lipD < 1.15) {
          const lipMask = smoothstep(1.02, 0.30, lipD);
          const isUpper = v < lipCenterV + cupidsBow;
          if (isUpper) {
            // Soft natural warm cocoa-plum upper lip
            r = lerp(r, 98, lipMask * 0.56);
            g = lerp(g, 50, lipMask * 0.56);
            b = lerp(b, 42, lipMask * 0.56);
          } else {
            // Soft warm terracotta-rose lower lip with gentle sunlit fullness highlight
            const lowerCenter = Math.max(0, 1 - Math.hypot(du / 0.018, (v - (lipCenterV + 0.007)) / 0.008));
            r = lerp(r, 152 + lowerCenter * 20, lipMask * 0.58);
            g = lerp(g, 84 + lowerCenter * 15, lipMask * 0.58);
            b = lerp(b, 64 + lowerCenter * 12, lipMask * 0.58);
          }
          // Delicate friendly smile crease (softly tapered at corners — never harsh!)
          const creaseDist = Math.abs(v - lipCenterV);
          const creaseW = Math.exp(-Math.pow(creaseDist / 0.0028, 2)) * smoothstep(1.02, 0.15, Math.abs(lipDx));
          r = lerp(r, 52, creaseW * 0.78);
          g = lerp(g, 26, creaseW * 0.78);
          b = lerp(b, 18, creaseW * 0.78);
        }
        // Very subtle soft chin-hollow dip below lower lip (gentle anatomical contour, never a jaw slit!)
        const underLip = Math.max(0, 1 - Math.hypot(du / 0.022, (v - 0.642) / 0.010));
        r = lerp(r, 92, underLip * underLip * 0.20);
        g = lerp(g, 52, underLip * underLip * 0.20);
        b = lerp(b, 34, underLip * underLip * 0.20);

        // Gentle shadow under chin & under hat hairline
        const chinAO = smoothstep(0.75, 0.92, v) * 0.16;
        const browAO = smoothstep(0.35, 0.20, v) * 0.12;
        const ao = 1 - chinAO - browAO;

        px[idx4] = clampByte(r * ao);
        px[idx4 + 1] = clampByte(g * ao);
        px[idx4 + 2] = clampByte(b * ao);
        px[idx4 + 3] = 255;
      }
    }
    return makeCanvasTexture(size, px, THREE.sRGBEncoding, maxAniso, false);
  }

  function buildStarkeeperIrisTex(size, maxAniso) {
    // High-craft stylized-realist warm deep espresso-amber brown iris with limbal ring, golden star-fleck & dual catchlights
    const px = new Uint8Array(size * size * 4);
    const half = (size - 1) * 0.5;
    for (let y = 0; y < size; y++) {
      const dy = (y - half) / half; // -1 = top of eye, +1 = bottom of eye
      for (let x = 0; x < size; x++) {
        const dx = (x - half) / half;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const idx4 = (y * size + x) * 4;

        let cr = 250, cg = 247, cb = 240; // warm natural ivory sclera edge
        if (r < 0.89) {
          // Larger, warm soulful Pixar-proportioned iris (zero wide-eyed stare!)
          const irNorm = r / 0.89;
          const f1 = 0.5 + 0.5 * Math.sin(ang * 22 + Math.sin(irNorm * 14) * 0.45);
          const f2 = 0.5 + 0.5 * Math.cos(ang * 37 - irNorm * 8);
          const fiber = f1 * 0.62 + f2 * 0.38;

          // Deep rich espresso-brown under upper lid shadow -> warm glowing chestnut-amber lower bounce crescent
          const verticalLift = smoothstep(-0.48, 0.68, dy);
          let ir = lerp(56, 148, verticalLift) + fiber * 20;
          let ig = lerp(32, 88, verticalLift) + fiber * 14;
          let ib = lerp(18, 44, verticalLift) + fiber * 8;

          // Subtle warm golden Starkeeper star-fleck inner halo around pupil
          const starRing = Math.exp(-Math.pow((irNorm - 0.45) / 0.085, 2)) * (0.5 + 0.5 * Math.sin(ang * 12));
          ir = lerp(ir, 224, starRing * 0.30);
          ig = lerp(ig, 174, starRing * 0.30);
          ib = lerp(ib, 94, starRing * 0.30);

          // Deep walnut outer limbal ring (gives soulful crisp eye definition)
          const limbal = smoothstep(0.72, 0.92, irNorm);
          ir = lerp(ir, 24, limbal * 0.88);
          ig = lerp(ig, 14, limbal * 0.88);
          ib = lerp(ib, 10, limbal * 0.88);

          // Upper lid drop shadow across top of iris
          const upperLidShadow = smoothstep(-0.04, -0.68, dy);
          ir *= (1 - upperLidShadow * 0.48);
          ig *= (1 - upperLidShadow * 0.48);
          ib *= (1 - upperLidShadow * 0.44);

          // Deep obsidian pupil center
          const pupilW = smoothstep(0.42, 0.32, irNorm);
          ir = lerp(ir, 14, pupilW);
          ig = lerp(ig, 11, pupilW);
          ib = lerp(ib, 12, pupilW);

          const edgeBlend = smoothstep(0.89, 0.81, r);
          cr = lerp(cr, ir, edgeBlend);
          cg = lerp(cg, ig, edgeBlend);
          cb = lerp(cb, ib, edgeBlend);
        }

        // Crisp glossy dual specular catchlights (primary upper-right + gentle lower-left bounce)
        const g1 = smoothstep(0.20, 0.08, Math.hypot(dx - 0.24, dy + 0.25));
        const g2 = smoothstep(0.095, 0.03, Math.hypot(dx + 0.24, dy - 0.24)) * 0.72;
        const glint = clamp01(g1 + g2);
        cr = lerp(cr, 255, glint);
        cg = lerp(cg, 255, glint);
        cb = lerp(cb, 255, glint);

        px[idx4] = clampByte(cr);
        px[idx4 + 1] = clampByte(cg);
        px[idx4 + 2] = clampByte(cb);
        px[idx4 + 3] = 255;
      }
    }
    return makeCanvasTexture(size, px, THREE.sRGBEncoding, maxAniso, false);
  }

  // ---------- PMREM Sky + Sun IBL State ----------

  let _pmrem = null;
  let _pmremRenderer = null;
  let _envRT = null;
  let _envScene = null;
  let _domeGeo = null;
  let _sunMesh = null;
  let _sunMat = null;
  let _colTop = null;
  let _colBot = null;
  let _colMid = null;
  let _colGround = null;
  let _colSun = null;
  let _sunVec = null;

  function parseColor(input, target, fallbackHex) {
    if (input !== undefined && input !== null) {
      if (typeof input === 'number' || typeof input === 'string') {
        target.set(input);
        return target;
      }
      if (typeof input === 'object' && 'r' in input && 'g' in input && 'b' in input) {
        target.r = input.r;
        target.g = input.g;
        target.b = input.b;
        return target;
      }
    }
    target.setHex(fallbackHex);
    return target;
  }

  function ensureEnvScene() {
    if (_envScene) return;
    _colTop = new THREE.Color(0x1a2648);
    _colBot = new THREE.Color(0x3a4d6d);
    _colMid = new THREE.Color();
    _colGround = new THREE.Color();
    _colSun = new THREE.Color();
    _sunVec = new THREE.Vector3(0.45, 0.72, 0.38);

    _envScene = new THREE.Scene();

    // Radius 40 stays safely inside PMREMGenerator.fromScene default far=100
    _domeGeo = new THREE.SphereGeometry(40, 24, 16);
    const count = _domeGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    _domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const domeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
    });
    _envScene.add(new THREE.Mesh(_domeGeo, domeMat));

    _sunMat = new THREE.MeshBasicMaterial({
      color: 0xffe49c,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    _sunMesh = new THREE.Mesh(new THREE.CircleGeometry(3.8, 20), _sunMat);
    _sunMesh.renderOrder = 1;
    _envScene.add(_sunMesh);
  }

  function updateEnvMap(renderer, scene, topColor, botColor, sunDir, progress = 0) {
    if (!renderer || !scene || typeof THREE === 'undefined' || typeof THREE.PMREMGenerator !== 'function') {
      return;
    }

    try {
      if (!_pmrem || _pmremRenderer !== renderer) {
        if (_pmrem && typeof _pmrem.dispose === 'function') _pmrem.dispose();
        _pmrem = new THREE.PMREMGenerator(renderer);
        _pmremRenderer = renderer;
      }

      ensureEnvScene();

      const p = clamp01(typeof progress === 'number' ? progress : 0);
      parseColor(topColor, _colTop, 0x1a2648);
      parseColor(botColor, _colBot, 0x3b4e6f);

      if (sunDir && typeof sunDir === 'object' && 'x' in sunDir) {
        _sunVec.set(sunDir.x, sunDir.y, sunDir.z);
      } else {
        _sunVec.set(0.45, 0.72, 0.38);
      }
      if (_sunVec.x === 0 && _sunVec.y === 0 && _sunVec.z === 0) {
        _sunVec.set(0.45, 0.72, 0.38);
      }
      _sunVec.normalize();

      _colMid.r = lerp(_colBot.r, _colTop.r, 0.42);
      _colMid.g = lerp(_colBot.g, _colTop.g, 0.42);
      _colMid.b = lerp(_colBot.b, _colTop.b, 0.42);

      _colGround.r = lerp(0.015, 0.24, p);
      _colGround.g = lerp(0.022, 0.28, p);
      _colGround.b = lerp(0.042, 0.22, p);

      _colSun.r = lerp(0.50, 1.0, p);
      _colSun.g = lerp(0.62, 0.94, p);
      _colSun.b = lerp(0.88, 0.78, p);

      const posAttr = _domeGeo.attributes.position;
      const colAttr = _domeGeo.attributes.color;
      const posArr = posAttr.array;
      const colArr = colAttr.array;
      const count = posAttr.count;
      const sunIntensity = lerp(0.05, 0.78, p);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const vx = posArr[i3];
        const vy = posArr[i3 + 1];
        const vz = posArr[i3 + 2];
        const invLen = 1 / (Math.sqrt(vx * vx + vy * vy + vz * vz) || 1);
        const nx = vx * invLen;
        const ny = vy * invLen;
        const nz = vz * invLen;

        let r, g, b;
        if (ny >= 0) {
          const up = Math.pow(ny, 0.65);
          if (up < 0.5) {
            const t = up * 2;
            r = lerp(_colBot.r, _colMid.r, t);
            g = lerp(_colBot.g, _colMid.g, t);
            b = lerp(_colBot.b, _colMid.b, t);
          } else {
            const t = (up - 0.5) * 2;
            r = lerp(_colMid.r, _colTop.r, t);
            g = lerp(_colMid.g, _colTop.g, t);
            b = lerp(_colMid.b, _colTop.b, t);
          }
        } else {
          const dn = Math.min(1, -ny * 1.4);
          r = lerp(_colBot.r, _colGround.r, dn);
          g = lerp(_colBot.g, _colGround.g, dn);
          b = lerp(_colBot.b, _colGround.b, dn);
        }

        const dot = nx * _sunVec.x + ny * _sunVec.y + nz * _sunVec.z;
        if (dot > 0) {
          const halo = Math.pow(dot, 6) * sunIntensity;
          r += _colSun.r * halo;
          g += _colSun.g * halo;
          b += _colSun.b * halo;
        }

        colArr[i3] = r;
        colArr[i3 + 1] = g;
        colArr[i3 + 2] = b;
      }
      colAttr.needsUpdate = true;

      _sunMat.color.copy(_colSun);
      _sunMesh.position.copy(_sunVec).multiplyScalar(32);
      _sunMesh.lookAt(0, 0, 0);

      const nextRT = _pmrem.fromScene(_envScene, 0.04);
      if (_envRT && typeof _envRT.dispose === 'function') {
        _envRT.dispose();
      }
      _envRT = nextRT;
      scene.environment = _envRT.texture;
    } catch (err) {
      // Fail safely if WebGL/PMREM is unavailable in constrained environments
    }
  }

  // ---------- Public API ----------

  const api = {
    sets: {},
    glowSprite: null,
    sparkleSprite: null,
    oakLeafCard: null,
    pineBoughCard: null,
    pineSnowBoughCard: null,
    fernCard: null,
    starkeeperFace: null,
    starkeeperIris: null,

    init(renderer) {
      if (typeof THREE === 'undefined' || typeof document === 'undefined') {
        return this.sets;
      }

      const cap = renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function'
        ? renderer.capabilities.getMaxAnisotropy()
        : 1;
      const maxAniso = Math.min(4, Math.max(1, cap));

      // Reuse scratch buffers across all 12 sets to eliminate GC pauses at boot
      const heights = new Float32Array(SIZE * SIZE);
      const albedoPx = new Uint8Array(SIZE * SIZE * 4);
      const roughPx = new Uint8Array(SIZE * SIZE * 4);
      const normalPx = new Uint8Array(SIZE * SIZE * 4);

      const specs = [
        ['grass', genGrass, 2.8],
        ['forest', genForest, 3.0],
        ['sand', genSand, 2.4],
        ['snow', genSnow, 1.8],
        ['rock', genRock, 4.5],
        ['bark', genBark, 4.4],
        ['leaves', genLeaves, 3.2],
        ['stone', genStone, 4.0],
        ['cloth', genCloth, 2.0],
        ['leather', genLeather, 2.6],
        ['fur', genFur, 2.2],
        ['feather', genFeather, 4.2],
        ['scales', genScales, 4.0],
      ];

      for (let i = 0; i < specs.length; i++) {
        const [name, generator, normalStrength] = specs[i];
        generator(SIZE, heights, albedoPx, roughPx);
        this.sets[name] = buildSet(SIZE, heights, albedoPx, roughPx, normalPx, normalStrength, maxAniso);
      }

      genWaterNormal(SIZE, heights);
      _heightToNormalPixels(heights, SIZE, 2.8, normalPx);
      this.sets.waterNormal = {
        normalMap: makeCanvasTexture(SIZE, normalPx, THREE.LinearEncoding, maxAniso, true),
      };

      this.glowSprite = buildGlowSprite(SPRITE_SIZE, maxAniso);
      this.sparkleSprite = buildSparkleSprite(SPRITE_SIZE, maxAniso);
      this.oakLeafCard = buildFoliageCard('oak', 512, maxAniso);
      this.pineBoughCard = buildFoliageCard('pine', 512, maxAniso);
      this.pineSnowBoughCard = buildFoliageCard('pineSnow', 512, maxAniso);
      this.fernCard = buildFernCard(128, maxAniso);
      this.starkeeperFace = buildStarkeeperFaceTex(256, maxAniso);
      this.starkeeperIris = buildStarkeeperIrisTex(128, maxAniso);

      return this.sets;
    },

    updateEnvMap,

    // Pure math helpers exposed for verification and reuse
    _periodicNoise2,
    _periodicFbm,
    _worleyPeriodic,
    _heightToNormalPixels,
  };

  return api;
})();
