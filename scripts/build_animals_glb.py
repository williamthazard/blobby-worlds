#!/usr/bin/env python3
"""
Offline animal .glb compiler for Blobby Worlds: The Starkeeper.

Downloads (cached in /tmp/animals_cache/) and compiles 13 CC0 / MIT animal GLB
models into normalized, Three.js r128 compatible binary glTF 2.0 assets and
file:// base64 JS bundles under assets/animals/<key>.{glb,glb.js}.

Key processing performed per archetype:
  - Computes true world-space rest bounding boxes across the full node hierarchy.
  - Detects facing direction (+Z, -Z, +X, -X) via skeleton joint or geometry
    asymmetry and rotates AnimalRoot around Y so every animal faces +Z forward.
  - Wraps scene roots inside a single AnimalRoot node with uniform canonical scale,
    facing yaw quaternion, and grounding offset (minY=0 for land, centered Y=0
    for flyers and swimmers).
  - Injects clean smooth vertex NORMALs where missing (Parrot.glb / bird) and
    computes crease-aware smooth vertex normals on kiwi & beetle.
  - Bakes the "Feline" morph target (blunter snout, wider cheek tufts) on all
    primitives of fox.glb for Moss Lynx variant switching.
  - Validates and repairs every animation sampler (matching input/output counts,
    sorted non-negative finite timestamps, quaternion normalization & hemisphere
    continuity) and downsamples dense >45-frame skeletal tracks 2x.
  - Filters beetle clips to core insect actions and compresses oversized (>60 KB)
    embedded textures to 256px JPEG.
"""

import base64
import copy
import io
import json
import math
import os
import struct
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT_DIR, "assets")
ANIMALS_OUT_DIR = os.path.join(ASSETS_DIR, "animals")
CACHE_DIR = "/tmp/animals_cache"

MAX_TOTAL_GLB_BYTES = 5_100_000
TARGET_ARRAY_BUFFER = 34962
TARGET_ELEMENT_ARRAY_BUFFER = 34963

COMP_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_CNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

BEETLE_CORE_CLIPS = frozenset({
    "idle", "walk", "run", "tripod", "groom", "alert",
    "eat", "attack", "hit", "sleep", "dead",
})

ARCHETYPES = [
    {
        "key": "fox",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/animals_pack/Fox.glb",
        "height": 0.72,
        "grounding": "land",
        "feline_morph": True,
    },
    {
        "key": "unicorn",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/animals_pack/Horse_White.glb",
        "height": 1.28,
        "grounding": "land",
    },
    {
        "key": "wolf",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/animals_pack/Wolf.glb",
        "height": 0.92,
        "grounding": "land",
    },
    {
        "key": "stag",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/animals_pack/Stag.glb",
        "height": 1.36,
        "grounding": "land",
    },
    {
        "key": "drake",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/dinosaurs_pack/Velociraptor.glb",
        "height": 0.84,
        "grounding": "land",
    },
    {
        "key": "beetle",
        "url": "https://gobkit.com/freebies/insect002/Asianladybeetle.glb",
        "height": 0.44,
        "grounding": "land",
        "keep_clips": BEETLE_CORE_CLIPS,
        "smooth_crease_deg": 70.0,
        "compress_tex_kb": 60,
    },
    {
        "key": "firefly",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/easy_enemies_pack/Wasp.glb",
        "height": 0.46,
        "grounding": "centered",
    },
    {
        "key": "bird",
        "url": "https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/models/gltf/Parrot.glb",
        "height": 0.52,
        "grounding": "centered",
        "smooth_crease_deg": None,  # Force full smooth normals across coincident vertices
        "inject_normals": True,
    },
    {
        "key": "kiwi",
        "url": "https://gobkit.com/freebies/birds/Kiwi.glb",
        "height": 0.56,
        "grounding": "land",
        "smooth_crease_deg": 70.0,
        "compress_tex_kb": 60,
    },
    {
        "key": "fish_tang",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/cute_fish_pack/BlueTang.glb",
        "height": 0.50,
        "grounding": "centered",
    },
    {
        "key": "fish_koi",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/cute_fish_pack/Koi.glb",
        "height": 0.54,
        "grounding": "centered",
    },
    {
        "key": "eel",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/easy_enemies_pack/Snake.glb",
        "height": 0.55,
        "grounding": "centered",
    },
    {
        "key": "manta",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/fish_pack/Manta_ray.glb",
        "height": 0.36,
        "grounding": "centered",
    },
]


# ---------- Pure-Python Math & GLB Binary Helpers ----------

def qnorm(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if not math.isfinite(n) or n < 1e-12:
        return (0.0, 0.0, 0.0, 1.0)
    return (x / n, y / n, z / n, w / n)


def qdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]


def mat4_identity():
    return [
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]


def mat4_mul(a, b):
    out = [0.0] * 16
    for col in range(4):
        for row in range(4):
            out[col * 4 + row] = (
                a[0 * 4 + row] * b[col * 4 + 0]
                + a[1 * 4 + row] * b[col * 4 + 1]
                + a[2 * 4 + row] * b[col * 4 + 2]
                + a[3 * 4 + row] * b[col * 4 + 3]
            )
    return out


def mat4_from_trs(t=(0.0, 0.0, 0.0), q=(0.0, 0.0, 0.0, 1.0), s=(1.0, 1.0, 1.0)):
    x, y, z, w = qnorm(q)
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    sx, sy, sz = s
    return [
        (1.0 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0.0,
        (xy - wz) * sy, (1.0 - (xx + zz)) * sy, (yz + wx) * sy, 0.0,
        (xz + wy) * sz, (yz - wx) * sz, (1.0 - (xx + yy)) * sz, 0.0,
        float(t[0]), float(t[1]), float(t[2]), 1.0,
    ]


def mat4_transform_point(m, p):
    return (
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    )


def mat3_inverse_from_mat4(m):
    """Inverts the upper-left 3x3 linear transform of a column-major 4x4 matrix."""
    a00, a10, a20 = m[0], m[1], m[2]
    a01, a11, a21 = m[4], m[5], m[6]
    a02, a12, a22 = m[8], m[9], m[10]
    c00 = a11 * a22 - a12 * a21
    c10 = a12 * a20 - a10 * a22
    c20 = a10 * a21 - a11 * a20
    det = a00 * c00 + a01 * c10 + a02 * c20
    if abs(det) < 1e-20:
        return [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    inv = 1.0 / det
    c01 = a02 * a21 - a01 * a22
    c11 = a00 * a22 - a02 * a20
    c21 = a01 * a20 - a00 * a21
    c02 = a01 * a12 - a02 * a11
    c12 = a02 * a10 - a00 * a12
    c22 = a00 * a11 - a01 * a10
    # Return column-major 3x3 (adjugate = cofactor^T)
    return [
        c00 * inv, c10 * inv, c20 * inv,
        c01 * inv, c11 * inv, c21 * inv,
        c02 * inv, c12 * inv, c22 * inv,
    ]


def mat3_transform_vec(m3, v):
    return (
        m3[0] * v[0] + m3[3] * v[1] + m3[6] * v[2],
        m3[1] * v[0] + m3[4] * v[1] + m3[7] * v[2],
        m3[2] * v[0] + m3[5] * v[1] + m3[8] * v[2],
    )


def compute_world_matrices(gltf):
    nodes = gltf.get("nodes", [])
    mats = [None] * len(nodes)
    scene_idx = gltf.get("scene", 0)
    scene = gltf["scenes"][scene_idx]

    def visit(ni, parent_mat):
        node = nodes[ni]
        if "matrix" in node:
            local = list(node["matrix"])
        else:
            local = mat4_from_trs(
                node.get("translation", (0.0, 0.0, 0.0)),
                node.get("rotation", (0.0, 0.0, 0.0, 1.0)),
                node.get("scale", (1.0, 1.0, 1.0)),
            )
        world = mat4_mul(parent_mat, local)
        mats[ni] = world
        for child in node.get("children", []):
            visit(child, world)

    identity = mat4_identity()
    for root in scene.get("nodes", []):
        visit(root, identity)
    return mats


def fetch_cached_glb(key, url):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{key}.glb")
    if not os.path.exists(path):
        print(f"Downloading {key} from {url} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read()
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        return f.read()


def parse_glb(data):
    magic, ver, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and ver == 2, "Invalid GLB header"
    jlen, jtype = struct.unpack_from("<II", data, 12)
    assert jtype == 0x4E4F534A, "First GLB chunk must be JSON"
    gltf = json.loads(data[20 : 20 + jlen].decode("utf-8"))
    bin_off = 20 + jlen
    blen, btype = struct.unpack_from("<II", data, bin_off)
    assert btype == 0x004E4942, "Second GLB chunk must be BIN"
    bin_data = data[bin_off + 8 : bin_off + 8 + blen]
    return gltf, bin_data


def read_accessor(gltf, bin_data, acc_idx):
    acc = gltf["accessors"][acc_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    comp = acc["componentType"]
    cnt = TYPE_CNT[acc["type"]]
    csize = COMP_SIZE[comp]
    stride = bv.get("byteStride", cnt * csize)
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = "<" + (COMP_FMT[comp] * cnt)
    out = []
    for i in range(acc["count"]):
        vals = struct.unpack_from(fmt, bin_data, base + i * stride)
        out.append(vals[0] if cnt == 1 else vals)
    return out


class BinBuilder:
    def __init__(self):
        self.buf = bytearray()
        self.buffer_views = []
        self.accessors = []

    def pad4(self):
        rem = len(self.buf) % 4
        if rem:
            self.buf.extend(b"\x00" * (4 - rem))

    def add_raw_view(self, raw_bytes, target=None):
        self.pad4()
        offset = len(self.buf)
        self.buf.extend(raw_bytes)
        bv = {"buffer": 0, "byteOffset": offset, "byteLength": len(raw_bytes)}
        if target is not None:
            bv["target"] = target
        idx = len(self.buffer_views)
        self.buffer_views.append(bv)
        return idx

    def copy_accessor(self, src_gltf, src_bin, src_acc_idx, target_hint=None):
        acc = copy.deepcopy(src_gltf["accessors"][src_acc_idx])
        bv = src_gltf["bufferViews"][acc["bufferView"]]
        comp = acc["componentType"]
        cnt = TYPE_CNT[acc["type"]]
        csize = COMP_SIZE[comp]
        stride = bv.get("byteStride", cnt * csize)
        base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        elem_bytes = cnt * csize
        packed = bytearray()
        for i in range(acc["count"]):
            off = base + i * stride
            packed.extend(src_bin[off : off + elem_bytes])
        target = target_hint if target_hint is not None else bv.get("target")
        bv_idx = self.add_raw_view(packed, target=target)
        acc["bufferView"] = bv_idx
        acc.pop("byteOffset", None)
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_float_accessor(self, values, acc_type, with_minmax=True, target=None):
        cnt = TYPE_CNT[acc_type]
        packed = bytearray()
        if cnt == 1:
            clean = [float(v) if math.isfinite(v) else 0.0 for v in values]
            for fv in clean:
                packed.extend(struct.pack("<f", fv))
            mins = [min(clean)] if clean else [0.0]
            maxs = [max(clean)] if clean else [0.0]
        else:
            mins = [float("inf")] * cnt
            maxs = [float("-inf")] * cnt
            fmt = "<" + ("f" * cnt)
            for v in values:
                fv = tuple(float(c) if math.isfinite(c) else 0.0 for c in v)
                packed.extend(struct.pack(fmt, *fv))
                for k in range(cnt):
                    if fv[k] < mins[k]:
                        mins[k] = fv[k]
                    if fv[k] > maxs[k]:
                        maxs[k] = fv[k]
        bv_idx = self.add_raw_view(packed, target=target)
        acc = {
            "bufferView": bv_idx,
            "componentType": 5126,
            "count": len(values),
            "type": acc_type,
        }
        if with_minmax and values:
            acc["min"] = mins
            acc["max"] = maxs
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx


# ---------- Geometry, Orientation & Morph Helpers ----------

def compute_world_bounds_and_points(gltf, bin_data, world_mats):
    pts = []
    mins = [float("inf"), float("inf"), float("inf")]
    maxs = [float("-inf"), float("-inf"), float("-inf")]
    for ni, node in enumerate(gltf.get("nodes", [])):
        if "mesh" not in node or world_mats[ni] is None:
            continue
        mesh = gltf["meshes"][node["mesh"]]
        wm = world_mats[ni]
        for prim in mesh["primitives"]:
            pos = read_accessor(gltf, bin_data, prim["attributes"]["POSITION"])
            for v in pos:
                wp = mat4_transform_point(wm, v)
                pts.append(wp)
                for c in range(3):
                    if wp[c] < mins[c]:
                        mins[c] = wp[c]
                    if wp[c] > maxs[c]:
                        maxs[c] = wp[c]
    return mins, maxs, pts


def detect_facing_yaw(gltf, world_mats, mins, maxs, pts):
    """
    Returns rotation angle around Y (in radians: 0, pi, pi/2, -pi/2) needed to
    rotate the rest model so its forward head/snout points toward +Z.
    """
    nodes = gltf.get("nodes", [])
    joint_pos = {}
    for sk in gltf.get("skins", []):
        for ji in sk.get("joints", []):
            name = (nodes[ji].get("name") or "").lower()
            if name and world_mats[ji] is not None:
                m = world_mats[ji]
                joint_pos[name] = (m[12], m[13], m[14])

    head_keys = ("head", "mouth", "main1", "snout", "beak")
    tail_keys = ("tail8", "tail7", "tail6", "tail5", "tail4", "tail3", "tail2", "tail1", "tail", "abdomen3", "abdomen2", "abdomen", "main6", "hips", "body")

    head_pt = None
    for hk in head_keys:
        if hk in joint_pos:
            head_pt = joint_pos[hk]
            break

    ref_pt = None
    for tk in tail_keys:
        if tk in joint_pos:
            ref_pt = joint_pos[tk]
            break

    if head_pt is not None and ref_pt is not None:
        dx = head_pt[0] - ref_pt[0]
        dz = head_pt[2] - ref_pt[2]
        if abs(dx) > abs(dz) * 1.15:
            # Facing +X -> rotate -pi/2; facing -X -> rotate +pi/2
            return -math.pi * 0.5 if dx > 0.0 else math.pi * 0.5
        if abs(dz) > 1e-5:
            # Facing +Z -> 0.0; facing -Z -> pi
            return 0.0 if dz > 0.0 else math.pi

    # Fallback for unrigged or obfuscated skeletons (e.g., Parrot.glb, beetle):
    # Check bilateral symmetry across X=0 vs Z=0 and upper/anterior mass offset.
    x_asym = abs((mins[0] + maxs[0]) * 0.5) / max(1e-6, maxs[0] - mins[0])
    z_asym = abs((mins[2] + maxs[2]) * 0.5) / max(1e-6, maxs[2] - mins[2])
    mid_y = mins[1] + 0.55 * (maxs[1] - mins[1])
    top_pts = [p for p in pts if p[1] >= mid_y] or pts
    avg_top_x = sum(p[0] for p in top_pts) / len(top_pts)
    avg_top_z = sum(p[2] for p in top_pts) / len(top_pts)
    center_x = (mins[0] + maxs[0]) * 0.5
    center_z = (mins[2] + maxs[2]) * 0.5

    if z_asym >= x_asym:
        return 0.0 if (avg_top_z - center_z) >= 0.0 else math.pi
    return -math.pi * 0.5 if (avg_top_x - center_x) >= 0.0 else math.pi * 0.5


def compute_smooth_normals(positions, indices=None, crease_deg=None):
    """
    Computes smooth vertex normals for indexed or non-indexed triangle meshes.
    - When crease_deg is None, averages area-weighted face normals across all
      coincident vertex positions (rounded to 1e-4) for organic continuous shading.
    - When crease_deg is provided, averages coincident corner face normals within
      the crease angle threshold so hard edges stay crisp while curves smooth.
    """
    vcount = len(positions)
    if indices is None:
        tri_indices = list(range(vcount))
    else:
        tri_indices = indices

    corner_fn = [None] * vcount
    pos_buckets = {}

    for k in range(0, len(tri_indices) - 2, 3):
        i0, i1, i2 = tri_indices[k], tri_indices[k + 1], tri_indices[k + 2]
        p0, p1, p2 = positions[i0], positions[i1], positions[i2]
        e1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
        e2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
        fn = (
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        )
        flen = math.sqrt(fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2])
        if flen < 1e-14:
            continue
        ufn = (fn[0] / flen, fn[1] / flen, fn[2] / flen)
        for vi in (i0, i1, i2):
            p = positions[vi]
            key = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
            pos_buckets.setdefault(key, []).append((fn, ufn))
            if corner_fn[vi] is None:
                corner_fn[vi] = [0.0, 0.0, 0.0]
            corner_fn[vi][0] += fn[0]
            corner_fn[vi][1] += fn[1]
            corner_fn[vi][2] += fn[2]

    cos_thresh = math.cos(math.radians(crease_deg)) if crease_deg is not None else -2.0
    out_normals = []

    for vi, p in enumerate(positions):
        key = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
        group = pos_buckets.get(key)
        if not group:
            out_normals.append((0.0, 1.0, 0.0))
            continue
        if crease_deg is None:
            sx = sum(item[0][0] for item in group)
            sy = sum(item[0][1] for item in group)
            sz = sum(item[0][2] for item in group)
        else:
            ref = corner_fn[vi]
            if ref is None:
                ref = group[0][1]
            rlen = math.sqrt(ref[0] * ref[0] + ref[1] * ref[1] + ref[2] * ref[2]) or 1.0
            uref = (ref[0] / rlen, ref[1] / rlen, ref[2] / rlen)
            sx = sy = sz = 0.0
            for fn, ufn in group:
                if uref[0] * ufn[0] + uref[1] * ufn[1] + uref[2] * ufn[2] >= cos_thresh:
                    sx += fn[0]
                    sy += fn[1]
                    sz += fn[2]
        nlen = math.sqrt(sx * sx + sy * sy + sz * sz)
        if nlen > 1e-12:
            out_normals.append((sx / nlen, sy / nlen, sz / nlen))
        else:
            out_normals.append((0.0, 1.0, 0.0))
    return out_normals


def ensure_unit_normals(normals):
    out = []
    for n in normals:
        nx, ny, nz = float(n[0]), float(n[1]), float(n[2])
        if not (math.isfinite(nx) and math.isfinite(ny) and math.isfinite(nz)):
            out.append((0.0, 1.0, 0.0))
            continue
        l = math.sqrt(nx * nx + ny * ny + nz * nz)
        if l < 1e-8:
            out.append((0.0, 1.0, 0.0))
        else:
            out.append((nx / l, ny / l, nz / l))
    return out


def compute_fox_feline_deltas(positions, mesh_world_mat):
    """
    Computes mesh-local POSITION morph deltas for the "Feline" (Moss Lynx) morph:
    shortens the elongated fox snout slightly into a blunter feline muzzle and
    widens outer cheek ruffs and ear tufts smoothly across all primitives.
    """
    inv_linear = mat3_inverse_from_mat4(mesh_world_mat)
    deltas = []
    for lp in positions:
        wx, wy, wz = mat4_transform_point(mesh_world_mat, lp)
        dx = dy = dz = 0.0

        # 1. Blunt the front snout & nose cleanly toward skull center (starting past eyes at wz > 2.26)
        if wz > 2.26 and wy > 1.60:
            t_snout = min(1.0, (wz - 2.26) / 0.44)
            dz -= (wz - 2.26) * 0.24
            dy += 0.018 * t_snout

        # 2. Widen outer cheek ruffs while keeping eyes undisturbed
        if 1.86 <= wz <= 2.38 and 1.70 <= wy <= 2.30 and abs(wx) > 0.27:
            w_z = math.exp(-((wz - 2.10) / 0.18) ** 2)
            w_y = math.exp(-((wy - 1.98) / 0.20) ** 2)
            w_x = min(1.0, (abs(wx) - 0.27) / 0.14)
            dx += math.copysign(0.075 * w_z * w_y * w_x, wx)

        # 3. Subtle lynx ear tuft flare
        if wy > 2.38 and abs(wx) > 0.12 and wz > 1.65:
            w_ear = min(1.0, (wy - 2.38) / 0.25)
            dx += math.copysign(0.045 * w_ear, wx)
            dy += 0.055 * w_ear

        if dx != 0.0 or dy != 0.0 or dz != 0.0:
            deltas.append(mat3_transform_vec(inv_linear, (dx, dy, dz)))
        else:
            deltas.append((0.0, 0.0, 0.0))
    return deltas


def maybe_compress_image(raw_bytes, mime_type, max_kb):
    if max_kb is None or len(raw_bytes) <= max_kb * 1024:
        return raw_bytes, mime_type
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw_bytes))
        has_alpha = False
        if im.mode in ("RGBA", "LA", "PA"):
            alpha = im.getchannel("A")
            min_a, _ = alpha.getextrema()
            has_alpha = min_a < 250
        im_resized = im.resize((256, 256), Image.LANCZOS)
        out = io.BytesIO()
        if has_alpha:
            im_resized.convert("RGBA").save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"
        im_resized.convert("RGB").save(out, format="JPEG", quality=86, optimize=True)
        return out.getvalue(), "image/jpeg"
    except Exception:
        return raw_bytes, mime_type


# ---------- Main Archetype Compiler ----------

def compile_archetype(spec):
    key = spec["key"]
    raw_glb = fetch_cached_glb(key, spec["url"])
    src_gltf, src_bin = parse_glb(raw_glb)

    world_mats = compute_world_matrices(src_gltf)
    mins, maxs, pts = compute_world_bounds_and_points(src_gltf, src_bin, world_mats)
    raw_height = maxs[1] - mins[1]
    assert raw_height > 1e-5, f"{key}: degenerate mesh height {raw_height}"

    facing_yaw = detect_facing_yaw(src_gltf, world_mats, mins, maxs, pts)
    canonical_h = spec["height"]
    scale_factor = canonical_h / raw_height
    if spec["grounding"] == "land":
        ground_offset_y = -mins[1] * scale_factor
    else:
        ground_offset_y = -0.5 * (mins[1] + maxs[1]) * scale_factor

    bb = BinBuilder()

    # Track mesh node world transform for Fox Feline morph
    mesh_world_by_mesh_idx = {}
    for ni, node in enumerate(src_gltf.get("nodes", [])):
        if "mesh" in node and world_mats[ni] is not None:
            mesh_world_by_mesh_idx[node["mesh"]] = world_mats[ni]

    # 1. Rebuild meshes & primitives cleanly
    out_meshes = []
    mesh_target_counts = {}
    for mi, src_mesh in enumerate(src_gltf.get("meshes", [])):
        mesh_copy = copy.deepcopy(src_mesh)
        new_prims = []
        target_count_for_mesh = 0

        for src_prim in src_mesh["primitives"]:
            prim = copy.deepcopy(src_prim)
            attrs = prim["attributes"]
            pos_acc_idx = attrs["POSITION"]
            positions = read_accessor(src_gltf, src_bin, pos_acc_idx)
            indices = read_accessor(src_gltf, src_bin, prim["indices"]) if "indices" in prim else None

            # Copy indices if present
            if "indices" in prim:
                prim["indices"] = bb.copy_accessor(src_gltf, src_bin, prim["indices"], TARGET_ELEMENT_ARRAY_BUFFER)

            # Copy non-NORMAL attributes
            new_attrs = {}
            for attr_name, acc_idx in attrs.items():
                if attr_name == "NORMAL":
                    continue
                new_attrs[attr_name] = bb.copy_accessor(src_gltf, src_bin, acc_idx, TARGET_ARRAY_BUFFER)

            # Compute or validate NORMALs
            prim_mode = prim.get("mode", 4)
            if spec.get("inject_normals") or "NORMAL" not in attrs or "smooth_crease_deg" in spec:
                if prim_mode != 4:
                    raise ValueError(f"{key}: compute_smooth_normals requires TRIANGLES mode (4), got {prim_mode}")
                normals = compute_smooth_normals(
                    positions,
                    indices=indices,
                    crease_deg=spec.get("smooth_crease_deg"),
                )
                new_attrs["NORMAL"] = bb.add_float_accessor(normals, "VEC3", with_minmax=True, target=TARGET_ARRAY_BUFFER)
            else:
                orig_normals = read_accessor(src_gltf, src_bin, attrs["NORMAL"])
                unit_normals = ensure_unit_normals(orig_normals)
                new_attrs["NORMAL"] = bb.add_float_accessor(unit_normals, "VEC3", with_minmax=True, target=TARGET_ARRAY_BUFFER)

            prim["attributes"] = new_attrs

            # Copy existing morph targets (e.g., Parrot.glb 12 morph targets)
            new_targets = []
            for src_t in prim.get("targets", []):
                nt = {}
                for t_attr, t_acc in src_t.items():
                    nt[t_attr] = bb.copy_accessor(src_gltf, src_bin, t_acc, TARGET_ARRAY_BUFFER)
                new_targets.append(nt)

            # Bake Feline morph target on fox.glb
            if spec.get("feline_morph") and mi == 0:
                wm = mesh_world_by_mesh_idx.get(mi, mat4_identity())
                deltas = compute_fox_feline_deltas(positions, wm)
                delta_acc = bb.add_float_accessor(deltas, "VEC3", with_minmax=True, target=TARGET_ARRAY_BUFFER)
                new_targets.append({"POSITION": delta_acc})

            if new_targets:
                prim["targets"] = new_targets
                target_count_for_mesh = max(target_count_for_mesh, len(new_targets))

            new_prims.append(prim)

        mesh_copy["primitives"] = new_prims
        if spec.get("feline_morph") and mi == 0:
            mesh_copy["weights"] = [0.0]
            mesh_copy.setdefault("extras", {})["targetNames"] = ["Feline"]

        mesh_target_counts[mi] = target_count_for_mesh
        out_meshes.append(mesh_copy)

    # 2. Copy skins (inverseBindMatrices)
    out_skins = []
    for src_skin in src_gltf.get("skins", []):
        sk = copy.deepcopy(src_skin)
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = bb.copy_accessor(src_gltf, src_bin, sk["inverseBindMatrices"])
        out_skins.append(sk)

    # 3. Copy & optionally compress embedded images
    out_images = []
    for src_img in src_gltf.get("images", []):
        im = copy.deepcopy(src_img)
        if "bufferView" in im:
            sbv = src_gltf["bufferViews"][im["bufferView"]]
            raw_img = src_bin[sbv.get("byteOffset", 0) : sbv.get("byteOffset", 0) + sbv["byteLength"]]
            comp_img, comp_mime = maybe_compress_image(
                raw_img,
                im.get("mimeType", "image/png"),
                spec.get("compress_tex_kb"),
            )
            im["bufferView"] = bb.add_raw_view(comp_img)
            im["mimeType"] = comp_mime
        out_images.append(im)

    # 4. Copy nodes and wrap scene roots under AnimalRoot
    out_nodes = copy.deepcopy(src_gltf.get("nodes", []))
    orig_scene = copy.deepcopy(src_gltf["scenes"][src_gltf.get("scene", 0)])
    orig_root_nodes = list(orig_scene.get("nodes", []))

    animal_root_idx = len(out_nodes)
    out_nodes.append({
        "name": "AnimalRoot",
        "children": orig_root_nodes,
        "translation": [0.0, float(ground_offset_y), 0.0],
        "rotation": [0.0, math.sin(facing_yaw * 0.5), 0.0, math.cos(facing_yaw * 0.5)],
        "scale": [float(scale_factor), float(scale_factor), float(scale_factor)],
    })
    out_scene = {
        "name": orig_scene.get("name", f"{key}Scene"),
        "nodes": [animal_root_idx],
    }

    # 5. Clean, validate, & downsample animations
    keep_clips = spec.get("keep_clips")
    out_animations = []

    for src_anim in src_gltf.get("animations", []):
        aname = src_anim.get("name", "Clip")
        if keep_clips is not None and aname.lower() not in keep_clips:
            continue

        new_samplers = []
        new_channels = []
        time_cache = {}

        def get_time_accessor(tlist):
            tkey = tuple(round(t, 5) for t in tlist)
            if tkey not in time_cache:
                time_cache[tkey] = bb.add_float_accessor(tlist, "SCALAR", with_minmax=True)
            return time_cache[tkey]

        for ch in src_anim.get("channels", []):
            target = copy.deepcopy(ch["target"])
            if "node" not in target:
                continue
            path = target["path"]
            src_smp = src_anim["samplers"][ch["sampler"]]
            interp = src_smp.get("interpolation", "LINEAR")

            raw_times = read_accessor(src_gltf, src_bin, src_smp["input"])
            raw_vals = read_accessor(src_gltf, src_bin, src_smp["output"])
            out_acc_meta = src_gltf["accessors"][src_smp["output"]]
            out_type = out_acc_meta["type"]

            if not raw_times:
                continue

            # Sanitize timestamps: finite, >= 0, monotonically non-decreasing
            times = []
            prev_t = 0.0
            for idx_t, t in enumerate(raw_times):
                ft = float(t) if math.isfinite(t) else prev_t
                if idx_t == 0 and ft < 0.0:
                    ft = 0.0
                if ft < prev_t:
                    ft = prev_t
                times.append(ft)
                prev_t = ft

            if path == "weights":
                node_mesh_idx = out_nodes[target["node"]].get("mesh")
                t_cnt = mesh_target_counts.get(node_mesh_idx, 1) or 1
                expected = len(times) * t_cnt
                vals = [float(v) if math.isfinite(v) else 0.0 for v in raw_vals]
                if len(vals) < expected:
                    vals.extend([0.0] * (expected - len(vals)))
                elif len(vals) > expected:
                    vals = vals[:expected]
            else:
                vals = list(raw_vals)
                expected_len = len(times) * 3 if interp == "CUBICSPLINE" else len(times)
                if len(vals) < expected_len and vals:
                    vals.extend([vals[-1]] * (expected_len - len(vals)))
                elif len(vals) > expected_len:
                    vals = vals[:expected_len]

                # Downsample dense >45-frame skeletal tracks 2x (keeping first & last)
                if interp != "CUBICSPLINE" and len(times) > 45:
                    idxs = list(range(0, len(times), 2))
                    if idxs[-1] != len(times) - 1:
                        idxs.append(len(times) - 1)
                    times = [times[k] for k in idxs]
                    vals = [vals[k] for k in idxs]

                if path == "rotation":
                    clean_qs = []
                    prev_q = None
                    for q in vals:
                        qn = qnorm(q)
                        if prev_q is not None and qdot(prev_q, qn) < 0.0:
                            qn = (-qn[0], -qn[1], -qn[2], -qn[3])
                        clean_qs.append(qn)
                        prev_q = qn
                    vals = clean_qs
                else:
                    vals = [
                        tuple(float(c) if math.isfinite(c) else 0.0 for c in v)
                        for v in vals
                    ]

            t_acc_idx = get_time_accessor(times)
            v_acc_idx = bb.add_float_accessor(vals, out_type, with_minmax=False)
            smp_idx = len(new_samplers)
            new_samplers.append({"input": t_acc_idx, "interpolation": interp, "output": v_acc_idx})
            new_channels.append({"sampler": smp_idx, "target": target})

        if new_channels:
            out_animations.append({"name": aname, "channels": new_channels, "samplers": new_samplers})

    # 6. Assemble output glTF JSON & binary GLB
    bb.pad4()
    out_gltf = {
        "asset": {
            "version": "2.0",
            "generator": "Blobby Worlds build_animals_glb.py",
        },
        "extras": {
            "archetype": key,
            "canonicalHeight": canonical_h,
            "groundOffsetY": ground_offset_y,
            "facingYaw": facing_yaw,
        },
        "scene": 0,
        "scenes": [out_scene],
        "nodes": out_nodes,
        "meshes": out_meshes,
        "accessors": bb.accessors,
        "bufferViews": bb.buffer_views,
        "buffers": [{"byteLength": len(bb.buf)}],
    }
    for optional_key, val in (
        ("skins", out_skins),
        ("materials", copy.deepcopy(src_gltf.get("materials", []))),
        ("textures", copy.deepcopy(src_gltf.get("textures", []))),
        ("images", out_images),
        ("samplers", copy.deepcopy(src_gltf.get("samplers", []))),
        ("animations", out_animations),
    ):
        if val:
            out_gltf[optional_key] = val

    # Verify normalized output bounds before writing
    post_mats = compute_world_matrices(out_gltf)
    p_mins, p_maxs, _ = compute_world_bounds_and_points(out_gltf, bytes(bb.buf), post_mats)
    post_h = p_maxs[1] - p_mins[1]
    assert abs(post_h - canonical_h) < 1e-3, f"{key}: post height {post_h:.4f} != {canonical_h}"
    if spec["grounding"] == "land":
        assert abs(p_mins[1]) < 1e-3, f"{key}: post minY={p_mins[1]:.4f} != 0"
    else:
        assert abs(0.5 * (p_mins[1] + p_maxs[1])) < 1e-3, f"{key}: post centerY != 0"

    json_bytes = json.dumps(out_gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bb.buf)
    glb = bytearray()
    glb.extend(struct.pack("<III", 0x46546C67, 2, total_len))
    glb.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    glb.extend(json_bytes)
    glb.extend(struct.pack("<II", len(bb.buf), 0x004E4942))
    glb.extend(bb.buf)

    os.makedirs(ANIMALS_OUT_DIR, exist_ok=True)
    glb_path = os.path.join(ANIMALS_OUT_DIR, f"{key}.glb")
    js_path = os.path.join(ANIMALS_OUT_DIR, f"{key}.glb.js")

    with open(glb_path, "wb") as f:
        f.write(glb)

    b64 = base64.b64encode(bytes(glb)).decode("ascii")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(
            f'(function(g){{g.__ANIMAL_GLB_B64__=g.__ANIMAL_GLB_B64__||{{}};g.__ANIMAL_GLB_B64__["{key}"]="{b64}";}})(typeof window!=="undefined"?window:globalThis);\n'
        )

    clip_names = [a["name"] for a in out_animations]
    return {
        "key": key,
        "bytes": len(glb),
        "clips": clip_names,
        "height": post_h,
        "minY": p_mins[1],
        "maxY": p_maxs[1],
        "yaw": facing_yaw,
        "scale": scale_factor,
        "groundOffsetY": ground_offset_y,
    }


def main():
    results = []
    total_bytes = 0
    for spec in ARCHETYPES:
        info = compile_archetype(spec)
        results.append(info)
        total_bytes += info["bytes"]
        print(
            f"Built {info['key']:10s} | {info['bytes']:7d} B | h={info['height']:.3f}m "
            f"Y=[{info['minY']:+.3f},{info['maxY']:+.3f}] yaw={info['yaw']:+.3f} "
            f"| {len(info['clips']):2d} clips"
        )
    print(f"\nTotal 13 .glb size: {total_bytes:,} bytes ({total_bytes / (1024 * 1024):.2f} MB)")
    assert total_bytes <= MAX_TOTAL_GLB_BYTES, (
        f"Total .glb size {total_bytes} exceeds budget {MAX_TOTAL_GLB_BYTES}"
    )


if __name__ == "__main__":
    main()
