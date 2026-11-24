#!/usr/bin/env python3
"""
Offline environment prop .glb compiler for Blobby Worlds: The Starkeeper.

Downloads (cached in /tmp/blobby_env_cache/) and compiles 17 curated CC0 1.0
Quaternius nature & ruin GLB models into normalized, Three.js r128 compatible
binary glTF 2.0 assets and file:// base64 JS bundles under
assets/env/<key>.{glb,glb.js}.

Key processing performed per prop:
  - Computes true world-space bounding boxes across the full node hierarchy.
  - Wraps scene roots under a single EnvRoot node scaled uniformly to canonical
    target height, grounded at minY = 0.0, and centered on X/Z (trunk-base
    centered for trees so cylinder colliders align; AABB-centered otherwise).
  - Strips unsupported Three.js r128 extensions (KHR_materials_* etc.) and
    FBX conversion metadata, ensuring extensionsUsed/extensionsRequired are empty.
  - Normalizes material slot names into canonical PBR categories (Bark, Leaves,
    Snow, Stone, Moss, Flower) for deterministic restyling in env.js.
  - Computes crease-aware smooth vertex NORMALs and clean world-scale box/planar
    TEXCOORD_0 UVs, welding shared vertices cleanly to minimize binary footprint.
"""

import base64
import copy
import json
import math
import os
import struct
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT_DIR, "assets")
ENV_OUT_DIR = os.path.join(ASSETS_DIR, "env")
CACHE_DIR = "/tmp/blobby_env_cache"

BASE_URL = "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/"
MAX_SINGLE_GLB_BYTES = 220_000
MAX_TOTAL_GLB_BYTES = 1_500_000

TARGET_ARRAY_BUFFER = 34962
TARGET_ELEMENT_ARRAY_BUFFER = 34963

COMP_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_CNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

PROPS = [
    {
        "key": "oak_tree",
        "rel_path": "nature_pack/CommonTree_1.glb",
        "height": 9.6,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {"Wood": "Bark", "Green": "Leaves"},
    },
    {
        "key": "birch_tree",
        "rel_path": "nature_pack/BirchTree_1.glb",
        "height": 9.2,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {
            "White": "Bark_Birch",
            "Black": "Bark_BirchDark",
            "DarkGreen": "Leaves_Dark",
            "Green": "Leaves",
        },
    },
    {
        "key": "pine_tree",
        "rel_path": "nature_pack/PineTree_1.glb",
        "height": 11.2,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {"Wood": "Bark", "Green": "Leaves_Needles"},
    },
    {
        "key": "pine_snow",
        "rel_path": "nature_pack/PineTree_Snow_1.glb",
        "height": 11.2,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {"Wood": "Bark", "Green": "Leaves_Needles", "Snow": "Snow"},
    },
    {
        "key": "willow_tree",
        "rel_path": "nature_pack/Willow_1.glb",
        "height": 8.8,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {"Wood": "Bark", "DarkGreen": "Leaves_Willow"},
    },
    {
        "key": "palm_tree",
        "rel_path": "nature_pack/PalmTree_1.glb",
        "height": 8.4,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {
            "Wood": "Bark_Palm",
            "Green": "Leaves_Palm",
            "DarkGreen": "Leaves_PalmDark",
        },
    },
    {
        "key": "cactus_flower",
        "rel_path": "nature_pack/CactusFlower_1.glb",
        "height": 2.6,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Green": "Leaves_Cactus"},
    },
    {
        "key": "bush_berry",
        "rel_path": "nature_pack/BushBerries_1.glb",
        "height": 1.35,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Green": "Leaves_Bush", "Berry": "Flower_Berry"},
    },
    {
        "key": "boulder_moss",
        "rel_path": "nature_pack/Rock_Moss_1.glb",
        "height": 1.35,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Rock": "Stone_Rock", "Green": "Moss"},
    },
    {
        "key": "boulder_rock",
        "rel_path": "nature_pack/Rock_3.glb",
        "height": 1.45,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Rock": "Stone_Rock"},
    },
    {
        "key": "fallen_log",
        "rel_path": "nature_pack/WoodLog_Moss.glb",
        "height": 0.85,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {
            "Wood": "Bark_Log",
            "Green": "Moss",
            "DarkGreen": "Moss_Dark",
            "Mushroom_Top": "Flower_MushroomCap",
            "Mushroom_Bottom": "Flower_MushroomStem",
        },
    },
    {
        "key": "tree_stump",
        "rel_path": "nature_pack/TreeStump_Moss.glb",
        "height": 0.95,
        "center": "trunk",
        "crease_deg": 45.0,
        "mat_map": {"Wood": "Bark_Stump", "Green": "Moss"},
    },
    {
        "key": "lilypad",
        "rel_path": "nature_pack/Lilypad.glb",
        "height": 0.12,
        "center": "aabb",
        "crease_deg": 45.0,
        "uv_mode": "planar_xz",
        "uv_scale": 0.85,
        "mat_map": {"Green": "Leaves_Lilypad", "Pink": "Flower_Lotus"},
    },
    {
        "key": "ruin_arch",
        "rel_path": "modular_dungeon_1/Arch.glb",
        "height": 5.8,
        "center": "aabb",
        "crease_deg": 72.0,
        "mat_map": {
            "Wall_Dark": "Stone_Dark",
            "Wall_Highlights": "Stone_Highlight",
            "Wall_Medium": "Stone_Medium",
        },
    },
    {
        "key": "ruin_column",
        "rel_path": "modular_dungeon_pack/Column.glb",
        "height": 5.0,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Rock": "Stone_Column"},
    },
    {
        "key": "ruin_column_broken",
        "rel_path": "modular_dungeon_pack/Column_Broken.glb",
        "height": 3.2,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Rock": "Stone_Column"},
    },
    {
        "key": "shrine_pedestal",
        "rel_path": "modular_dungeon_1/Pedestal.glb",
        "height": 1.6,
        "center": "aabb",
        "crease_deg": 45.0,
        "mat_map": {"Marble": "Stone_Marble"},
    },
]


# ---------- Pure-Python Math & GLB Binary Helpers ----------

def qnorm(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if not math.isfinite(n) or n < 1e-12:
        return (0.0, 0.0, 0.0, 1.0)
    return (x / n, y / n, z / n, w / n)


def vnorm3(v):
    x, y, z = float(v[0]), float(v[1]), float(v[2])
    if not (math.isfinite(x) and math.isfinite(y) and math.isfinite(z)):
        return (0.0, 1.0, 0.0)
    n = math.sqrt(x * x + y * y + z * z)
    if n < 1e-12:
        return (0.0, 1.0, 0.0)
    return (x / n, y / n, z / n)


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


def mat4_transform_normal_transpose(m, world_n):
    """Maps a world-space unit normal back to mesh-local normal via M^T."""
    lx = m[0] * world_n[0] + m[1] * world_n[1] + m[2] * world_n[2]
    ly = m[4] * world_n[0] + m[5] * world_n[1] + m[6] * world_n[2]
    lz = m[8] * world_n[0] + m[9] * world_n[1] + m[10] * world_n[2]
    return vnorm3((lx, ly, lz))


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


def fetch_cached_glb(key, rel_path):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{key}.glb")
    if not os.path.exists(path):
        url = BASE_URL + rel_path
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

    def add_float_accessor(self, values, acc_type, with_minmax=True, target=None):
        cnt = TYPE_CNT[acc_type]
        packed = bytearray()
        mins = [float("inf")] * cnt
        maxs = [float("-inf")] * cnt
        fmt = "<" + ("f" * cnt)
        for v in values:
            if cnt == 1:
                fv = (float(v) if math.isfinite(v) else 0.0,)
            else:
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

    def add_index_accessor(self, indices):
        max_idx = max(indices) if indices else 0
        if max_idx <= 65535:
            comp_type = 5123
            packed = struct.pack("<" + ("H" * len(indices)), *(int(i) for i in indices))
        else:
            comp_type = 5125
            packed = struct.pack("<" + ("I" * len(indices)), *(int(i) for i in indices))
        bv_idx = self.add_raw_view(packed, target=TARGET_ELEMENT_ARRAY_BUFFER)
        acc = {
            "bufferView": bv_idx,
            "componentType": comp_type,
            "count": len(indices),
            "type": "SCALAR",
            "min": [int(min(indices))] if indices else [0],
            "max": [int(max_idx)],
        }
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx


# ---------- Geometry, Bounds & Material Helpers ----------

def strip_r128_extensions(obj):
    if isinstance(obj, dict):
        obj.pop("extensions", None)
        for v in obj.values():
            strip_r128_extensions(v)
    elif isinstance(obj, list):
        for item in obj:
            strip_r128_extensions(item)


def compute_world_bounds(gltf, bin_data, world_mats):
    mins = [float("inf"), float("inf"), float("inf")]
    maxs = [float("-inf"), float("-inf"), float("-inf")]
    prim0_pts = []
    for ni, node in enumerate(gltf.get("nodes", [])):
        if "mesh" not in node or world_mats[ni] is None:
            continue
        mesh = gltf["meshes"][node["mesh"]]
        wm = world_mats[ni]
        for pi, prim in enumerate(mesh["primitives"]):
            pos = read_accessor(gltf, bin_data, prim["attributes"]["POSITION"])
            for v in pos:
                wp = mat4_transform_point(wm, v)
                if pi == 0:
                    prim0_pts.append(wp)
                for c in range(3):
                    if wp[c] < mins[c]:
                        mins[c] = wp[c]
                    if wp[c] > maxs[c]:
                        maxs[c] = wp[c]
    return mins, maxs, prim0_pts


def compute_center_xz(mins, maxs, prim0_pts, center_mode):
    if center_mode == "trunk" and prim0_pts:
        raw_h = maxs[1] - mins[1]
        y_cut = mins[1] + 0.08 * raw_h
        bot = [p for p in prim0_pts if p[1] <= y_cut]
        if not bot:
            y_cut = mins[1] + 0.16 * raw_h
            bot = [p for p in prim0_pts if p[1] <= y_cut]
        if bot:
            cx = 0.5 * (min(p[0] for p in bot) + max(p[0] for p in bot))
            cz = 0.5 * (min(p[2] for p in bot) + max(p[2] for p in bot))
            return cx, cz
    return 0.5 * (mins[0] + maxs[0]), 0.5 * (mins[2] + maxs[2])


def rebuild_primitive_geometry(
    positions,
    indices,
    orig_uvs,
    mesh_world_mat,
    env_mat,
    crease_deg,
    uv_mode,
    uv_scale,
):
    """
    Computes crease-aware smooth vertex normals and world-scale box/planar
    TEXCOORD_0 UVs in normalized game-world space, welding matching vertices
    so flat-shaded Quaternius source exports shade smoothly and pack compactly.
    """
    if indices is None:
        indices = list(range(len(positions)))

    full_mat = mat4_mul(env_mat, mesh_world_mat)
    game_pts = [mat4_transform_point(full_mat, p) for p in positions]

    cos_thresh = math.cos(math.radians(crease_deg))
    pos_buckets = {}
    tri_norms = []

    for k in range(0, len(indices) - 2, 3):
        i0, i1, i2 = indices[k], indices[k + 1], indices[k + 2]
        p0, p1, p2 = game_pts[i0], game_pts[i1], game_pts[i2]
        e1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
        e2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
        fn = (
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        )
        flen = math.sqrt(fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2])
        if flen < 1e-14:
            tri_norms.append(None)
            continue
        ufn = (fn[0] / flen, fn[1] / flen, fn[2] / flen)
        tri_norms.append((fn, ufn))
        for vi in (i0, i1, i2):
            gp = game_pts[vi]
            wkey = (round(gp[0], 4), round(gp[1], 4), round(gp[2], 4))
            pos_buckets.setdefault(wkey, []).append((fn, ufn))

    weld_map = {}
    out_positions = []
    out_normals = []
    out_uvs = []
    out_indices = []

    for ti, k in enumerate(range(0, len(indices) - 2, 3)):
        tri_info = tri_norms[ti]
        if tri_info is None:
            continue
        _, ufn = tri_info
        ax_x, ax_y, ax_z = abs(ufn[0]), abs(ufn[1]), abs(ufn[2])
        if uv_mode == "planar_xz" or (ax_y >= ax_x and ax_y >= ax_z):
            proj_ax = 1  # horizontal cap / lilypad: planar XZ
        elif ax_x > ax_z:
            proj_ax = 0  # X-facing wall/trunk: (Z, Y)
        else:
            proj_ax = 2  # Z-facing wall/trunk: (X, Y)

        for vi in (indices[k], indices[k + 1], indices[k + 2]):
            gp = game_pts[vi]
            wkey = (round(gp[0], 4), round(gp[1], 4), round(gp[2], 4))
            group = pos_buckets.get(wkey)
            if not group:
                wn = ufn
            else:
                sx = sy = sz = 0.0
                for fn, g_ufn in group:
                    if ufn[0] * g_ufn[0] + ufn[1] * g_ufn[1] + ufn[2] * g_ufn[2] >= cos_thresh:
                        sx += fn[0]
                        sy += fn[1]
                        sz += fn[2]
                nlen = math.sqrt(sx * sx + sy * sy + sz * sz)
                wn = (sx / nlen, sy / nlen, sz / nlen) if nlen > 1e-12 else ufn

            if orig_uvs is not None:
                uv = (float(orig_uvs[vi][0]), float(orig_uvs[vi][1]))
                uv_key = (round(uv[0], 4), round(uv[1], 4))
            else:
                if proj_ax == 1:
                    uv = (gp[0] * uv_scale, gp[2] * uv_scale)
                elif proj_ax == 0:
                    uv = (gp[2] * uv_scale, gp[1] * uv_scale)
                else:
                    uv = (gp[0] * uv_scale, gp[1] * uv_scale)
                uv_key = proj_ax

            weld_key = (wkey, (round(wn[0], 3), round(wn[1], 3), round(wn[2], 3)), uv_key)
            new_idx = weld_map.get(weld_key)
            if new_idx is None:
                new_idx = len(out_positions)
                weld_map[weld_key] = new_idx
                out_positions.append(positions[vi])
                out_normals.append(mat4_transform_normal_transpose(mesh_world_mat, wn))
                out_uvs.append(uv)
            out_indices.append(new_idx)

    return out_positions, out_normals, out_uvs, out_indices


def normalize_materials(src_materials, mat_map):
    out_mats = []
    for idx, src_mat in enumerate(src_materials):
        mat = copy.deepcopy(src_mat)
        mat.pop("extras", None)
        strip_r128_extensions(mat)
        orig_name = mat.get("name", f"Material_{idx}")
        norm_name = mat_map.get(orig_name)
        if norm_name is None:
            low = orig_name.lower()
            if "wood" in low or "bark" in low or "trunk" in low:
                norm_name = "Bark"
            elif "snow" in low:
                norm_name = "Snow"
            elif "moss" in low:
                norm_name = "Moss"
            elif "flower" in low or "berry" in low or "pink" in low:
                norm_name = "Flower"
            elif "rock" in low or "stone" in low or "wall" in low or "marble" in low:
                norm_name = "Stone"
            else:
                norm_name = "Leaves"
        mat["name"] = norm_name
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        if "roughnessFactor" not in pbr:
            pbr["roughnessFactor"] = 0.85
        if "metallicFactor" not in pbr:
            pbr["metallicFactor"] = 0.0
        out_mats.append(mat)
    return out_mats


# ---------- Main Prop Compiler ----------

def compile_prop(spec):
    key = spec["key"]
    raw_glb = fetch_cached_glb(key, spec["rel_path"])
    src_gltf, src_bin = parse_glb(raw_glb)

    world_mats = compute_world_matrices(src_gltf)
    mins, maxs, prim0_pts = compute_world_bounds(src_gltf, src_bin, world_mats)
    raw_height = maxs[1] - mins[1]
    assert raw_height > 1e-5, f"{key}: degenerate mesh height {raw_height}"

    target_h = float(spec["height"])
    scale_factor = target_h / raw_height
    cx, cz = compute_center_xz(mins, maxs, prim0_pts, spec["center"])
    env_translation = (
        float(-cx * scale_factor),
        float(-mins[1] * scale_factor),
        float(-cz * scale_factor),
    )
    env_scale = (scale_factor, scale_factor, scale_factor)
    env_mat = mat4_from_trs(env_translation, (0.0, 0.0, 0.0, 1.0), env_scale)

    mesh_world_by_idx = {}
    for ni, node in enumerate(src_gltf.get("nodes", [])):
        if "mesh" in node and world_mats[ni] is not None:
            mesh_world_by_idx[node["mesh"]] = world_mats[ni]

    bb = BinBuilder()
    out_meshes = []
    uv_mode = spec.get("uv_mode", "box")
    uv_scale = spec.get("uv_scale", 0.45)
    crease_deg = spec.get("crease_deg", 45.0)

    for mi, src_mesh in enumerate(src_gltf.get("meshes", [])):
        mesh_copy = copy.deepcopy(src_mesh)
        mesh_copy.pop("extras", None)
        wm = mesh_world_by_idx.get(mi, mat4_identity())
        new_prims = []

        for src_prim in src_mesh["primitives"]:
            prim = copy.deepcopy(src_prim)
            prim.pop("extras", None)
            strip_r128_extensions(prim)
            prim_mode = prim.get("mode", 4)
            if prim_mode != 4:
                raise ValueError(f"{key}: expected TRIANGLES mode (4), got {prim_mode}")

            attrs = prim["attributes"]
            positions = read_accessor(src_gltf, src_bin, attrs["POSITION"])
            indices = read_accessor(src_gltf, src_bin, prim["indices"]) if "indices" in prim else None
            orig_uvs = read_accessor(src_gltf, src_bin, attrs["TEXCOORD_0"]) if "TEXCOORD_0" in attrs else None

            out_pos, out_nrm, out_uv, out_idx = rebuild_primitive_geometry(
                positions,
                indices,
                orig_uvs,
                wm,
                env_mat,
                crease_deg,
                uv_mode,
                uv_scale,
            )

            prim["indices"] = bb.add_index_accessor(out_idx)
            prim["attributes"] = {
                "POSITION": bb.add_float_accessor(out_pos, "VEC3", with_minmax=True, target=TARGET_ARRAY_BUFFER),
                "NORMAL": bb.add_float_accessor(out_nrm, "VEC3", with_minmax=True, target=TARGET_ARRAY_BUFFER),
                "TEXCOORD_0": bb.add_float_accessor(out_uv, "VEC2", with_minmax=True, target=TARGET_ARRAY_BUFFER),
            }
            new_prims.append(prim)

        mesh_copy["primitives"] = new_prims
        out_meshes.append(mesh_copy)

    out_nodes = copy.deepcopy(src_gltf.get("nodes", []))
    strip_r128_extensions(out_nodes)
    for n in out_nodes:
        n.pop("extras", None)

    orig_scene = copy.deepcopy(src_gltf["scenes"][src_gltf.get("scene", 0)])
    orig_root_nodes = list(orig_scene.get("nodes", []))

    env_root_idx = len(out_nodes)
    out_nodes.append({
        "name": "EnvRoot",
        "children": orig_root_nodes,
        "translation": list(env_translation),
        "scale": [scale_factor, scale_factor, scale_factor],
        "extras": {
            "groundMinY": 0.0,
            "height": target_h,
            "source": spec["rel_path"],
        },
    })
    out_scene = {
        "name": orig_scene.get("name", f"{key}Scene"),
        "nodes": [env_root_idx],
    }

    out_materials = normalize_materials(src_gltf.get("materials", []), spec["mat_map"])

    bb.pad4()
    out_gltf = {
        "asset": {
            "version": "2.0",
            "generator": "Blobby Worlds build_env_glb.py",
        },
        "scene": 0,
        "scenes": [out_scene],
        "nodes": out_nodes,
        "meshes": out_meshes,
        "accessors": bb.accessors,
        "bufferViews": bb.buffer_views,
        "buffers": [{"byteLength": len(bb.buf)}],
    }
    if out_materials:
        out_gltf["materials"] = out_materials

    # Verify normalized post-transform bounds before writing
    post_mats = compute_world_matrices(out_gltf)
    p_mins, p_maxs, _ = compute_world_bounds(out_gltf, bytes(bb.buf), post_mats)
    post_h = p_maxs[1] - p_mins[1]
    assert abs(post_h - target_h) < 1e-3, f"{key}: post height {post_h:.4f} != {target_h}"
    assert abs(p_mins[1]) < 1e-3, f"{key}: post minY={p_mins[1]:.4f} != 0"

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

    assert 500 < len(glb) < MAX_SINGLE_GLB_BYTES, (
        f"{key}: compiled GLB size {len(glb)} outside (500, {MAX_SINGLE_GLB_BYTES})"
    )

    os.makedirs(ENV_OUT_DIR, exist_ok=True)
    glb_path = os.path.join(ENV_OUT_DIR, f"{key}.glb")
    js_path = os.path.join(ENV_OUT_DIR, f"{key}.glb.js")

    with open(glb_path, "wb") as f:
        f.write(glb)

    b64 = base64.b64encode(bytes(glb)).decode("ascii")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(
            f'(function(g){{g.__ENV_GLB_B64__=g.__ENV_GLB_B64__||{{}};g.__ENV_GLB_B64__["{key}"]="{b64}";}})(typeof window!=="undefined"?window:globalThis);\n'
        )

    mat_names = [m["name"] for m in out_materials]
    vert_count = sum(
        out_gltf["accessors"][p["attributes"]["POSITION"]]["count"]
        for m in out_meshes
        for p in m["primitives"]
    )
    tri_count = sum(
        out_gltf["accessors"][p["indices"]]["count"] // 3
        for m in out_meshes
        for p in m["primitives"]
    )
    return {
        "key": key,
        "bytes": len(glb),
        "height": post_h,
        "minY": p_mins[1],
        "maxY": p_maxs[1],
        "verts": vert_count,
        "tris": tri_count,
        "materials": mat_names,
    }


def main():
    total_bytes = 0
    for spec in PROPS:
        info = compile_prop(spec)
        total_bytes += info["bytes"]
        print(
            f"Built {info['key']:18s} | {info['bytes']:7d} B | h={info['height']:6.2f}m "
            f"Y=[{info['minY']:+.3f},{info['maxY']:+.3f}] | {info['verts']:4d}v/{info['tris']:4d}t "
            f"| mats={info['materials']}"
        )
    print(f"\nTotal 17 .glb size: {total_bytes:,} bytes ({total_bytes / (1024 * 1024):.2f} MB)")
    assert total_bytes <= MAX_TOTAL_GLB_BYTES, (
        f"Total .glb size {total_bytes} exceeds budget {MAX_TOTAL_GLB_BYTES}"
    )


if __name__ == "__main__":
    main()
