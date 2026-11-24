#!/usr/bin/env python3
"""
Offline enemy .glb compiler for Blobby Worlds: The Starkeeper.

Compiles 2 Bestiary - Dungeon Monsters Kit (QAL v1.0) humanoids (Puglin, Imp)
retargeted with Quaternius Universal Animation Library (CC0 1.0) animations,
plus 5 Quaternius CC0 1.0 monster models (Spider, Bee, KnightCharacter, Trex,
Crab) into normalized, Three.js r128 compatible binary glTF 2.0 assets and
file:// base64 JS bundles under assets/enemies/<key>.{glb,glb.js}.

Key processing performed per archetype:
  - Supports optional local overrides in assets/Ultimate Monsters/.
  - Strips KHR_materials_emissive_strength and any non-core extensions for
    strict Three.js r128 GLTFLoader compatibility.
  - Compresses Bestiary 2K textures cleanly (BaseColor & ORM -> 512x512 JPEG
    q=84; Normal & Emissive -> 256x256 PNG) and packs UVs/skinWeights compactly
    using core glTF normalized integers so Puglin and Imp stay <= 650 KB each.
  - Retargets 8 (puglin) / 9 (imp) UAL clips onto the 55-bone Bestiary skeleton
    via world-rest-basis quaternion similarity transforms, zeroing horizontal
    pelvis X/Z drift and scaling vertical bounce by pelvis rest height ratio.
  - Wraps scene roots under a single EnemyRoot node facing +Z forward at
    canonical heights with land (minY=0) or centered (Y=0) grounding.
  - Validates/repairs animation samplers (input.count == output.count, sorted
    non-negative finite timestamps, unit quaternions, hemisphere continuity)
    and ensures unit finite vertex normals.
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
ENEMIES_OUT_DIR = os.path.join(ASSETS_DIR, "enemies")
BESTIARY_DIR = os.path.join(
    ASSETS_DIR,
    "Bestiary - Dungeon Monsters Kit[Standard]",
    "Exports",
    "GLB (Godot-Unreal)",
)
LOCAL_OVERRIDE_DIR = os.path.join(ASSETS_DIR, "Ultimate Monsters")
CACHE_DIR = "/tmp/enemies_cache"
UAL_CACHE_DIR = "/tmp/starkeeper_cache"

UAL_GLTF_URL = "https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.gltf"
UAL_BIN_URL = "https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.bin"

MAX_TOTAL_GLB_BYTES = 3_565_158
MAX_BESTIARY_BYTES = 650_000
TARGET_ARRAY_BUFFER = 34962
TARGET_ELEMENT_ARRAY_BUFFER = 34963

COMP_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_CNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# Bestiary 55-bone names -> Quaternius Universal Animation Library DEF-bone names
BESTIARY_TO_UAL = {
    "pelvis": "DEF-hips",
    "spine_01": "DEF-spine.001",
    "spine_02": "DEF-spine.002",
    "spine_03": "DEF-spine.003",
    "neck_01": "DEF-neck",
    "Head": "DEF-head",
    "clavicle_l": "DEF-shoulder.L",
    "upperarm_l": "DEF-upper_arm.L",
    "lowerarm_l": "DEF-forearm.L",
    "hand_l": "DEF-hand.L",
    "index_01_l": "DEF-f_index.01.L",
    "index_02_l": "DEF-f_index.02.L",
    "index_03_l": "DEF-f_index.03.L",
    "middle_01_l": "DEF-f_middle.01.L",
    "middle_02_l": "DEF-f_middle.02.L",
    "middle_03_l": "DEF-f_middle.03.L",
    "ring_01_l": "DEF-f_ring.01.L",
    "ring_02_l": "DEF-f_ring.02.L",
    "ring_03_l": "DEF-f_ring.03.L",
    "thumb_01_l": "DEF-thumb.01.L",
    "thumb_02_l": "DEF-thumb.02.L",
    "thumb_03_l": "DEF-thumb.03.L",
    "clavicle_r": "DEF-shoulder.R",
    "upperarm_r": "DEF-upper_arm.R",
    "lowerarm_r": "DEF-forearm.R",
    "hand_r": "DEF-hand.R",
    "index_01_r": "DEF-f_index.01.R",
    "index_02_r": "DEF-f_index.02.R",
    "index_03_r": "DEF-f_index.03.R",
    "middle_01_r": "DEF-f_middle.01.R",
    "middle_02_r": "DEF-f_middle.02.R",
    "middle_03_r": "DEF-f_middle.03.R",
    "ring_01_r": "DEF-f_ring.01.R",
    "ring_02_r": "DEF-f_ring.02.R",
    "ring_03_r": "DEF-f_ring.03.R",
    "thumb_01_r": "DEF-thumb.01.R",
    "thumb_02_r": "DEF-thumb.02.R",
    "thumb_03_r": "DEF-thumb.03.R",
    "thigh_l": "DEF-thigh.L",
    "calf_l": "DEF-shin.L",
    "foot_l": "DEF-foot.L",
    "ball_l": "DEF-toe.L",
    "thigh_r": "DEF-thigh.R",
    "calf_r": "DEF-shin.R",
    "foot_r": "DEF-foot.R",
    "ball_r": "DEF-toe.R",
}

PUGLIN_UAL_CLIPS = [
    ("Idle_Loop", "Idle"),
    ("Walk_Loop", "Walk"),
    ("Sprint_Loop", "Run"),
    ("Jump_Start", "Jump"),
    ("Punch_Cross", "Attack"),
    ("Sword_Attack", "HeavyAttack"),
    ("Hit_Chest", "HitReact"),
    ("Death01", "Death"),
]

IMP_UAL_CLIPS = [
    ("Idle_Loop", "Idle"),
    ("Walk_Loop", "Walk"),
    ("Sprint_Loop", "Run"),
    ("Jump_Start", "Jump"),
    ("Punch_Cross", "Attack"),
    ("Sword_Attack", "HeavyAttack"),
    ("Roll", "Roll"),
    ("Hit_Chest", "HitReact"),
    ("Death01", "Death"),
]

ARCHETYPES = [
    {
        "key": "puglin",
        "local_path": os.path.join(BESTIARY_DIR, "Puglin.glb"),
        "override_names": ("Puglin.glb", "Orc.glb", "Goblin.glb"),
        "source_label": "Bestiary - Dungeon Monsters Kit (Puglin.glb, QAL v1.0)",
        "height": 1.18,
        "grounding": "land",
        "retarget_ual": True,
        "ual_clips": PUGLIN_UAL_CLIPS,
        "strip_extra_attrs": True,
        "compress_bestiary_tex": True,
        "quantize_normal_colors": None,
        "max_bytes": MAX_BESTIARY_BYTES,
    },
    {
        "key": "imp",
        "local_path": os.path.join(BESTIARY_DIR, "Imp.glb"),
        "override_names": ("Imp.glb", "Demon.glb"),
        "source_label": "Bestiary - Dungeon Monsters Kit (Imp.glb, QAL v1.0)",
        "height": 1.55,
        "grounding": "land",
        "retarget_ual": True,
        "ual_clips": IMP_UAL_CLIPS,
        "strip_extra_attrs": True,
        "compress_bestiary_tex": True,
        "quantize_normal_colors": 64,
        "weld_coincident": True,
        "max_bytes": MAX_BESTIARY_BYTES,
    },
    {
        "key": "weaver",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/easy_enemies_pack/Spider.glb",
        "override_names": ("Spider.glb", "Weaver.glb"),
        "source_label": "Quaternius Easy Enemies Pack (Spider.glb, CC0 1.0)",
        "height": 0.88,
        "grounding": "land",
    },
    {
        "key": "stinger",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/platformer_game_pack/Bee.glb",
        "override_names": ("Bee.glb", "Ghost.glb", "Stinger.glb"),
        "source_label": "Quaternius Platformer Game Pack (Bee.glb, CC0 1.0)",
        "height": 0.78,
        "grounding": "centered",
    },
    {
        "key": "knight",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/single_knight_pack/KnightCharacter.glb",
        "override_names": ("KnightCharacter.glb", "Knight.glb"),
        "source_label": "Quaternius Single Knight Pack (KnightCharacter.glb, CC0 1.0)",
        "height": 2.05,
        "grounding": "land",
    },
    {
        "key": "behemoth",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/dinosaurs_pack/Trex.glb",
        "override_names": ("Trex.glb", "Yeti.glb", "Behemoth.glb"),
        "source_label": "Quaternius Dinosaurs Pack (Trex.glb, CC0 1.0)",
        "height": 2.85,
        "grounding": "land",
    },
    {
        "key": "stalker",
        "url": "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/platformer_game_pack/Crab.glb",
        "override_names": ("Crab.glb", "Stalker.glb"),
        "source_label": "Quaternius Platformer Game Pack (Crab.glb, CC0 1.0)",
        "height": 0.92,
        "grounding": "land",
    },
]


# ---------- Pure-Python Quaternion, Matrix & GLB Binary Helpers ----------

def qnorm(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if not math.isfinite(n) or n < 1e-12:
        return (0.0, 0.0, 0.0, 1.0)
    return (x / n, y / n, z / n, w / n)


def qconj(q):
    return (-q[0], -q[1], -q[2], q[3])


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def qdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    tx = 2.0 * (y * vz - z * vy)
    ty = 2.0 * (z * vx - x * vz)
    tz = 2.0 * (x * vy - y * vx)
    return (
        vx + w * tx + y * tz - z * ty,
        vy + w * ty + z * tx - x * tz,
        vz + w * tz + x * ty - y * tx,
    )


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


def compute_world_poses(gltf):
    nodes = gltf["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i
    cache = {}

    def get_w(i):
        if i in cache:
            return cache[i]
        n = nodes[i]
        t = tuple(n.get("translation", (0.0, 0.0, 0.0)))
        r = qnorm(tuple(n.get("rotation", (0.0, 0.0, 0.0, 1.0))))
        s = tuple(n.get("scale", (1.0, 1.0, 1.0)))
        if i in parent:
            pt, pr, ps = get_w(parent[i])
            st = (t[0] * ps[0], t[1] * ps[1], t[2] * ps[2])
            rt = qrot(pr, st)
            wt = (pt[0] + rt[0], pt[1] + rt[1], pt[2] + rt[2])
            wr = qnorm(qmul(pr, r))
            ws = (ps[0] * s[0], ps[1] * s[1], ps[2] * s[2])
        else:
            wt, wr, ws = t, r, s
        cache[i] = (wt, wr, ws)
        return cache[i]

    world_by_idx = {i: get_w(i) for i in range(len(nodes))}
    return world_by_idx, parent


def fetch_cached_file(cache_dir, filename, url):
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, filename)
    if not os.path.exists(path):
        print(f"Downloading {filename} from {url} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read()
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        return f.read()


def resolve_source_bytes(spec):
    key = spec["key"]
    if os.path.isdir(LOCAL_OVERRIDE_DIR):
        for fname in spec.get("override_names", ()):
            candidate = os.path.join(LOCAL_OVERRIDE_DIR, fname)
            if os.path.isfile(candidate):
                print(f"[override] {key}: loading local override {candidate}")
                with open(candidate, "rb") as f:
                    return f.read(), f"Ultimate Monsters override ({fname})"
    if "local_path" in spec:
        path = spec["local_path"]
        assert os.path.isfile(path), f"Missing local Bestiary asset: {path}"
        with open(path, "rb") as f:
            return f.read(), spec["source_label"]
    data = fetch_cached_file(CACHE_DIR, f"{key}.glb", spec["url"])
    return data, spec["source_label"]


def load_ual_cached():
    gltf_bytes = fetch_cached_file(UAL_CACHE_DIR, "AnimationLibrary_Godot_Standard.gltf", UAL_GLTF_URL)
    bin_bytes = fetch_cached_file(UAL_CACHE_DIR, "AnimationLibrary_Godot_Standard.bin", UAL_BIN_URL)
    return json.loads(gltf_bytes.decode("utf-8")), bin_bytes


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
    norm_div = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}.get(comp) if acc.get("normalized") else None
    out = []
    for i in range(acc["count"]):
        vals = struct.unpack_from(fmt, bin_data, base + i * stride)
        if norm_div:
            vals = tuple(v / norm_div for v in vals)
        out.append(vals[0] if cnt == 1 else vals)
    return out


class BinBuilder:
    def __init__(self):
        self.buf = bytearray()
        self.buffer_views = []
        self.accessors = []
        self._anim_buf = bytearray()
        self._anim_acc_indices = []

    def pad4(self):
        rem = len(self.buf) % 4
        if rem:
            self.buf.extend(b"\x00" * (4 - rem))

    def add_anim_raw(self, raw_bytes, acc_template):
        """Appends animation accessor bytes into a single shared animation bufferView."""
        rem = len(self._anim_buf) % 4
        if rem:
            self._anim_buf.extend(b"\x00" * (4 - rem))
        local_off = len(self._anim_buf)
        self._anim_buf.extend(raw_bytes)
        acc = dict(acc_template)
        acc["_animOffset"] = local_off
        idx = len(self.accessors)
        self.accessors.append(acc)
        self._anim_acc_indices.append(idx)
        return idx

    def flush_anim_view(self):
        if not self._anim_acc_indices:
            return
        bv_idx = self.add_raw_view(self._anim_buf)
        for idx in self._anim_acc_indices:
            acc = self.accessors[idx]
            off = acc.pop("_animOffset")
            acc["bufferView"] = bv_idx
            if off:
                acc["byteOffset"] = off
        self._anim_buf = bytearray()
        self._anim_acc_indices = []

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

    def add_float_accessor(self, values, acc_type, with_minmax=True, target=None, shared_anim=False):
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
        acc = {
            "componentType": 5126,
            "count": len(values),
            "type": acc_type,
        }
        if with_minmax and values:
            acc["min"] = mins
            acc["max"] = maxs
        if shared_anim:
            return self.add_anim_raw(packed, acc)
        bv_idx = self.add_raw_view(packed, target=target)
        acc["bufferView"] = bv_idx
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_norm_ushort2_accessor(self, values, target=TARGET_ARRAY_BUFFER):
        packed = bytearray()
        for u, v in values:
            iu = max(0, min(65535, int(round(float(u) * 65535.0))))
            iv = max(0, min(65535, int(round(float(v) * 65535.0))))
            packed.extend(struct.pack("<2H", iu, iv))
        bv_idx = self.add_raw_view(packed, target=target)
        acc = {
            "bufferView": bv_idx,
            "componentType": 5123,
            "normalized": True,
            "count": len(values),
            "type": "VEC2",
        }
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_norm_ubyte4_weights_accessor(self, values, target=TARGET_ARRAY_BUFFER):
        """Quantizes 4 bone weights to UNSIGNED_BYTE [0..255] with exact 255 sum."""
        packed = bytearray()
        for w4 in values:
            clamped = [max(0.0, float(w)) if math.isfinite(w) else 0.0 for w in w4]
            s = sum(clamped)
            if s <= 1e-8:
                packed.extend(struct.pack("<4B", 255, 0, 0, 0))
                continue
            scaled = [c / s * 255.0 for c in clamped]
            ints = [int(math.floor(x)) for x in scaled]
            rem = 255 - sum(ints)
            if rem != 0:
                order = sorted(range(4), key=lambda k: scaled[k] - ints[k], reverse=(rem > 0))
                for k in order[:abs(rem)]:
                    ints[k] = max(0, min(255, ints[k] + (1 if rem > 0 else -1)))
            packed.extend(struct.pack("<4B", ints[0], ints[1], ints[2], ints[3]))
        bv_idx = self.add_raw_view(packed, target=target)
        acc = {
            "bufferView": bv_idx,
            "componentType": 5121,
            "normalized": True,
            "count": len(values),
            "type": "VEC4",
        }
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_ubyte4_joints_accessor(self, values, target=TARGET_ARRAY_BUFFER):
        packed = bytearray()
        for j4 in values:
            packed.extend(struct.pack("<4B", int(j4[0]), int(j4[1]), int(j4[2]), int(j4[3])))
        bv_idx = self.add_raw_view(packed, target=target)
        acc = {
            "bufferView": bv_idx,
            "componentType": 5121,
            "count": len(values),
            "type": "VEC4",
        }
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_ushort_accessor(self, values, target=TARGET_ELEMENT_ARRAY_BUFFER):
        packed = struct.pack("<" + ("H" * len(values)), *(int(v) for v in values))
        bv_idx = self.add_raw_view(packed, target=target)
        acc = {
            "bufferView": bv_idx,
            "componentType": 5123,
            "count": len(values),
            "type": "SCALAR",
            "min": [int(min(values))] if values else [0],
            "max": [int(max(values))] if values else [0],
        }
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_norm_short4_quat_accessor(self, quats, shared_anim=True):
        """Packs unit quaternions into glTF core SHORT normalized VEC4 (8 B/key)."""
        packed = bytearray()
        prev_s = None
        for q in quats:
            qn = qnorm(q)
            s4 = [max(-32767, min(32767, int(round(c * 32767.0)))) for c in qn]
            if prev_s is not None and sum(prev_s[k] * s4[k] for k in range(4)) < 0:
                s4 = [-s4[0], -s4[1], -s4[2], -s4[3]]
            packed.extend(struct.pack("<4h", s4[0], s4[1], s4[2], s4[3]))
            prev_s = s4
        acc = {
            "componentType": 5122,
            "normalized": True,
            "count": len(quats),
            "type": "VEC4",
        }
        if shared_anim:
            return self.add_anim_raw(packed, acc)
        bv_idx = self.add_raw_view(packed)
        acc["bufferView"] = bv_idx
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx


# ---------- Geometry, Normals, Orientation & Texture Helpers ----------

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
    Determines the Y-axis rotation (0, pi, +pi/2, -pi/2) needed to align the
    model so its forward face/snout/toes point toward +Z under EnemyRoot.
    """
    nodes = gltf.get("nodes", [])
    joint_pos = {}
    for sk in gltf.get("skins", []):
        for ji in sk.get("joints", []):
            name = (nodes[ji].get("name") or "").lower()
            if name and world_mats[ji] is not None:
                m = world_mats[ji]
                joint_pos[name] = (m[12], m[13], m[14])

    # 1. Explicit front/back creature landmarks (toes/mouth/snout vs heel/tail/abdomen)
    front_back_pairs = [
        ("ball_l", "foot_l"),
        ("ball_r", "foot_r"),
        ("mouth", "head"),
        ("head", "tail5"),
        ("head", "tail3"),
        ("head", "tail"),
        ("head", "abdomen"),
    ]
    for fk, bk in front_back_pairs:
        if fk in joint_pos and bk in joint_pos:
            fp, bp = joint_pos[fk], joint_pos[bk]
            dx = fp[0] - bp[0]
            dz = fp[2] - bp[2]
            if abs(dx) > abs(dz) * 1.15 and abs(dx) > 1e-3:
                return -math.pi * 0.5 if dx > 0.0 else math.pi * 0.5
            if abs(dz) > 1e-3:
                return 0.0 if dz > 0.0 else math.pi

    # 2. Bilateral Left/Right limb pairs (for vertical bipeds like KnightCharacter.glb)
    # In Y-up right-handed space facing +Z, character Left is +X and Right is -X.
    lr_pairs = [
        ("upperarm_l", "upperarm_r"),
        ("upperarm.l", "upperarm.r"),
        ("foot.l", "foot.r"),
        ("eyebrow.l", "eyebrow.r"),
        ("wing1.l", "wing1.r"),
    ]
    for lk, rk in lr_pairs:
        if lk in joint_pos and rk in joint_pos:
            lp, rp = joint_pos[lk], joint_pos[rk]
            dx = lp[0] - rp[0]
            dz = lp[2] - rp[2]
            if abs(dx) > abs(dz) * 1.15:
                return 0.0 if dx > 0.0 else math.pi
            if abs(dz) > 1e-4:
                return -math.pi * 0.5 if dz < 0.0 else math.pi * 0.5

    # 3. Geometry asymmetry fallback
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
    vcount = len(positions)
    tri_indices = list(range(vcount)) if indices is None else indices
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
            ref = corner_fn[vi] or group[0][1]
            rlen = math.sqrt(ref[0] * ref[0] + ref[1] * ref[1] + ref[2] * ref[2]) or 1.0
            uref = (ref[0] / rlen, ref[1] / rlen, ref[2] / rlen)
            sx = sy = sz = 0.0
            for fn, ufn in group:
                if uref[0] * ufn[0] + uref[1] * ufn[1] + uref[2] * ufn[2] >= cos_thresh:
                    sx += fn[0]
                    sy += fn[1]
                    sz += fn[2]
        nlen = math.sqrt(sx * sx + sy * sy + sz * sz)
        out_normals.append((sx / nlen, sy / nlen, sz / nlen) if nlen > 1e-12 else (0.0, 1.0, 0.0))
    return out_normals


def ensure_unit_normals(normals):
    out = []
    for n in normals:
        nx, ny, nz = float(n[0]), float(n[1]), float(n[2])
        if not (math.isfinite(nx) and math.isfinite(ny) and math.isfinite(nz)):
            out.append((0.0, 1.0, 0.0))
            continue
        l = math.sqrt(nx * nx + ny * ny + nz * nz)
        out.append((nx / l, ny / l, nz / l) if l >= 1e-8 else (0.0, 1.0, 0.0))
    return out


def compress_bestiary_image(raw_bytes, img_name, mime_type, quantize_normal_colors=None):
    """
    Compresses Bestiary 2K embedded textures:
      - BaseColor & ORM -> 512x512 JPEG (quality=84, optimize=True)
      - Normal & Emissive -> 256x256 PNG (optimize=True, compress_level=9)
    """
    from PIL import Image

    im = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    lname = (img_name or "").lower()
    out = io.BytesIO()
    if "basecolor" in lname or "_orm" in lname:
        resized = im.resize((512, 512), Image.LANCZOS)
        resized.save(out, format="JPEG", quality=84, optimize=True)
        return out.getvalue(), "image/jpeg"

    resized = im.resize((256, 256), Image.LANCZOS)
    if "normal" in lname and quantize_normal_colors:
        resized = resized.quantize(
            colors=quantize_normal_colors,
            method=Image.MEDIANCUT,
            dither=Image.NONE,
        )
    resized.save(out, format="PNG", optimize=True, compress_level=9)
    return out.getvalue(), "image/png"


def strip_r128_extensions(obj):
    if isinstance(obj, dict):
        obj.pop("extensions", None)
        for v in obj.values():
            strip_r128_extensions(v)
    elif isinstance(obj, list):
        for item in obj:
            strip_r128_extensions(item)


# ---------- UAL Retargeting (Bestiary 55-Bone Humanoid) ----------

def retarget_ual_animations(src_gltf, bb, ual_gltf, ual_bin, clip_pairs):
    tgt_world, tgt_parent = compute_world_poses(src_gltf)
    src_world, src_parent = compute_world_poses(ual_gltf)

    tgt_by_name = {n.get("name"): i for i, n in enumerate(src_gltf["nodes"]) if n.get("name")}
    src_by_name = {n.get("name"): i for i, n in enumerate(ual_gltf["nodes"]) if n.get("name")}

    src_to_tgt = {
        src_by_name[s]: tgt_by_name[t]
        for t, s in BESTIARY_TO_UAL.items()
        if t in tgt_by_name and s in src_by_name
    }

    tgt_hips_idx = tgt_by_name["pelvis"]
    src_hips_idx = src_by_name["DEF-hips"]
    hip_ratio = tgt_world[tgt_hips_idx][0][1] / max(0.1, src_world[src_hips_idx][0][1])

    tgt_hips_rest_t = tuple(src_gltf["nodes"][tgt_hips_idx].get("translation", (0.0, 0.0, 0.0)))
    src_hips_rest_t = tuple(ual_gltf["nodes"][src_hips_idx].get("translation", (0.0, 0.0, 0.0)))
    src_hips_parent_r = src_world[src_parent[src_hips_idx]][1] if src_hips_idx in src_parent else (0.0, 0.0, 0.0, 1.0)
    tgt_hips_parent_r = tgt_world[tgt_parent[tgt_hips_idx]][1] if tgt_hips_idx in tgt_parent else (0.0, 0.0, 0.0, 1.0)
    tgt_hips_parent_s = tgt_world[tgt_parent[tgt_hips_idx]][2] if tgt_hips_idx in tgt_parent else (1.0, 1.0, 1.0)
    inv_hip_sx = 1.0 / (tgt_hips_parent_s[0] or 1.0)
    inv_hip_sy = 1.0 / (tgt_hips_parent_s[1] or 1.0)
    inv_hip_sz = 1.0 / (tgt_hips_parent_s[2] or 1.0)

    ual_anims_by_name = {a["name"]: a for a in ual_gltf.get("animations", [])}
    out_animations = []
    time_cache = {}

    def get_t_acc(tlist):
        tkey = tuple(round(t, 5) for t in tlist)
        if tkey not in time_cache:
            time_cache[tkey] = bb.add_float_accessor(tlist, "SCALAR", with_minmax=True, shared_anim=True)
        return time_cache[tkey]

    for ual_name, out_name in clip_pairs:
        src_anim = ual_anims_by_name[ual_name]
        rot_tracks = {}
        trans_tracks = {}

        for ch in src_anim.get("channels", []):
            src_node = ch["target"].get("node")
            path = ch["target"].get("path")
            if src_node not in src_to_tgt:
                continue
            if path not in ("rotation", "translation"):
                continue
            tgt_node = src_to_tgt[src_node]
            if path == "translation" and tgt_node != tgt_hips_idx:
                continue
            tname = src_gltf["nodes"][tgt_node].get("name", "")
            # Omit finger tracks so Bestiary monsters retain sculpted grip around stick/mace
            if any(k in tname for k in ("index_", "middle_", "ring_", "thumb_")):
                continue

            sampler = src_anim["samplers"][ch["sampler"]]
            raw_times = read_accessor(ual_gltf, ual_bin, sampler["input"])
            raw_vals = read_accessor(ual_gltf, ual_bin, sampler["output"])
            if not raw_times:
                continue

            # Sanitize timestamps
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

            # Downsample dense >30-frame UAL clips 2x (keeping first & last frame)
            step = 2 if len(times) > 30 else 1
            idxs = list(range(0, len(times), step))
            if idxs[-1] != len(times) - 1:
                idxs.append(len(times) - 1)
            stimes = [times[k] for k in idxs]
            svals = [raw_vals[k] for k in idxs]

            if path == "rotation":
                r_src_p = src_world[src_parent[src_node]][1] if src_node in src_parent else (0.0, 0.0, 0.0, 1.0)
                r_src_b = src_world[src_node][1]
                r_tgt_p = tgt_world[tgt_parent[tgt_node]][1] if tgt_node in tgt_parent else (0.0, 0.0, 0.0, 1.0)
                r_tgt_b = tgt_world[tgt_node][1]

                q_left = qnorm(qmul(qconj(r_tgt_p), r_src_p))
                q_right = qnorm(qmul(qconj(r_src_b), r_tgt_b))
                out_qs = [qnorm(qmul(q_left, qmul(qnorm(q), q_right))) for q in svals]

                rest_q = qnorm(tuple(src_gltf["nodes"][tgt_node].get("rotation", (0.0, 0.0, 0.0, 1.0))))
                if all(abs(qdot(rest_q, q)) > 0.9999 for q in out_qs):
                    continue
                if len(out_qs) > 2 and all(abs(qdot(out_qs[0], q)) > 0.9999 for q in out_qs):
                    stimes = [stimes[0], stimes[-1]]
                    out_qs = [out_qs[0], out_qs[-1]]
                rot_tracks[tgt_node] = (stimes, out_qs)

            elif path == "translation" and tgt_node == tgt_hips_idx:
                out_ts = []
                for tv in svals:
                    d_src_local = (
                        tv[0] - src_hips_rest_t[0],
                        tv[1] - src_hips_rest_t[1],
                        tv[2] - src_hips_rest_t[2],
                    )
                    d_world = qrot(src_hips_parent_r, d_src_local)
                    # Zero horizontal X/Z drift; scale vertical bounce by leg/pelvis height ratio
                    d_world_locked = (0.0, d_world[1] * hip_ratio, 0.0)
                    d_tgt_local = qrot(qconj(tgt_hips_parent_r), d_world_locked)
                    out_ts.append((
                        tgt_hips_rest_t[0] + d_tgt_local[0] * inv_hip_sx,
                        tgt_hips_rest_t[1] + d_tgt_local[1] * inv_hip_sy,
                        tgt_hips_rest_t[2] + d_tgt_local[2] * inv_hip_sz,
                    ))
                trans_tracks[tgt_node] = (stimes, out_ts)

        samplers = []
        channels = []

        for ni, (tlist, qlist) in rot_tracks.items():
            clean = []
            prev_q = None
            for q in qlist:
                qn = qnorm(q)
                if prev_q is not None and qdot(prev_q, qn) < 0.0:
                    qn = (-qn[0], -qn[1], -qn[2], -qn[3])
                clean.append(qn)
                prev_q = qn
            s_idx = len(samplers)
            samplers.append({
                "input": get_t_acc(tlist),
                "interpolation": "LINEAR",
                "output": bb.add_norm_short4_quat_accessor(clean, shared_anim=True),
            })
            channels.append({"sampler": s_idx, "target": {"node": ni, "path": "rotation"}})

        for ni, (tlist, vlist) in trans_tracks.items():
            s_idx = len(samplers)
            samplers.append({
                "input": get_t_acc(tlist),
                "interpolation": "LINEAR",
                "output": bb.add_float_accessor(vlist, "VEC3", with_minmax=False, shared_anim=True),
            })
            channels.append({"sampler": s_idx, "target": {"node": ni, "path": "translation"}})

        out_animations.append({"name": out_name, "channels": channels, "samplers": samplers})

    bb.flush_anim_view()
    return out_animations


# ---------- Quaternius Source Animation Sanitizer ----------

def copy_and_clean_animations(src_gltf, src_bin, bb, out_nodes):
    out_animations = []
    for src_anim in src_gltf.get("animations", []):
        aname = src_anim.get("name", "Clip")
        new_samplers = []
        new_channels = []
        time_cache = {}

        def get_t_acc(tlist):
            tkey = tuple(round(t, 5) for t in tlist)
            if tkey not in time_cache:
                time_cache[tkey] = bb.add_float_accessor(tlist, "SCALAR", with_minmax=True, shared_anim=True)
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
            out_type = src_gltf["accessors"][src_smp["output"]]["type"]
            if not raw_times:
                continue

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

            vals = list(raw_vals)
            expected_len = len(times) * 3 if interp == "CUBICSPLINE" else len(times)
            if len(vals) < expected_len and vals:
                vals.extend([vals[-1]] * (expected_len - len(vals)))
            elif len(vals) > expected_len:
                vals = vals[:expected_len]

            if interp != "CUBICSPLINE" and len(times) > 45:
                idxs = list(range(0, len(times), 2))
                if idxs[-1] != len(times) - 1:
                    idxs.append(len(times) - 1)
                times = [times[k] for k in idxs]
                vals = [vals[k] for k in idxs]

            if path == "rotation" and interp != "CUBICSPLINE":
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
                    if isinstance(v, (tuple, list))
                    else (float(v) if math.isfinite(v) else 0.0)
                    for v in vals
                ]

            t_acc_idx = get_t_acc(times)
            v_acc_idx = bb.add_float_accessor(vals, out_type, with_minmax=False, shared_anim=True)
            smp_idx = len(new_samplers)
            new_samplers.append({"input": t_acc_idx, "interpolation": interp, "output": v_acc_idx})
            new_channels.append({"sampler": smp_idx, "target": target})

        if new_channels:
            out_animations.append({"name": aname, "channels": new_channels, "samplers": new_samplers})
    bb.flush_anim_view()
    return out_animations


def weld_coincident_primitive(positions, normals, uvs, joints, weights, indices, min_normal_dot=-2.0):
    """Welds coincident (pos, uv, joints) vertices whose normals agree within min_normal_dot."""
    buckets = {}
    out_pos, out_nrm_acc, out_uv, out_jnt, out_wgt = [], [], [], [], []
    old_to_new = [0] * len(positions)
    for vi in range(len(positions)):
        p = positions[vi]
        u = uvs[vi]
        j = tuple(int(c) for c in joints[vi])
        key = (round(p[0], 4), round(p[1], 4), round(p[2], 4), round(u[0], 4), round(u[1], 4), j)
        candidates = buckets.setdefault(key, [])
        n = normals[vi]
        nl = math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) or 1.0
        un = (n[0] / nl, n[1] / nl, n[2] / nl)
        matched = None
        for ni in candidates:
            acc_n = out_nrm_acc[ni]
            al = math.sqrt(acc_n[0] * acc_n[0] + acc_n[1] * acc_n[1] + acc_n[2] * acc_n[2]) or 1.0
            if (acc_n[0] * un[0] + acc_n[1] * un[1] + acc_n[2] * un[2]) / al >= min_normal_dot:
                matched = ni
                break
        if matched is None:
            matched = len(out_pos)
            candidates.append(matched)
            out_pos.append(p)
            out_nrm_acc.append([un[0], un[1], un[2]])
            out_uv.append(u)
            out_jnt.append(j)
            out_wgt.append(weights[vi])
        else:
            out_nrm_acc[matched][0] += un[0]
            out_nrm_acc[matched][1] += un[1]
            out_nrm_acc[matched][2] += un[2]
        old_to_new[vi] = matched
    out_nrm = ensure_unit_normals(out_nrm_acc)
    out_idx = [old_to_new[i] for i in indices] if indices is not None else None
    return out_pos, out_nrm, out_uv, out_jnt, out_wgt, out_idx


def compact_node_trs(nodes):
    """Rounds float jitter in node TRS while keeping sub-micron accuracy."""
    for n in nodes:
        if "translation" in n:
            t = [0.0 if abs(c) < 1e-7 else round(float(c), 7) for c in n["translation"]]
            if all(c == 0.0 for c in t):
                n.pop("translation")
            else:
                n["translation"] = t
        if "rotation" in n:
            q = qnorm(n["rotation"])
            rq = [0.0 if abs(c) < 1e-7 else round(float(c), 7) for c in q]
            rq = list(qnorm(rq))
            rq = [0.0 if abs(c) < 1e-7 else round(float(c), 7) for c in rq]
            if rq[0] == 0.0 and rq[1] == 0.0 and rq[2] == 0.0 and abs(rq[3] - 1.0) < 1e-6:
                n.pop("rotation")
            else:
                n["rotation"] = rq
        if "scale" in n:
            s = [round(float(c), 6) for c in n["scale"]]
            if all(abs(c - 1.0) < 1e-5 for c in s):
                n.pop("scale")
            else:
                n["scale"] = s


# ---------- Main Archetype Compiler ----------

def compile_archetype(spec, ual_gltf, ual_bin):
    key = spec["key"]
    raw_glb, source_label = resolve_source_bytes(spec)
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

    # 1. Rebuild meshes & primitives cleanly
    out_meshes = []
    strip_extra = bool(spec.get("strip_extra_attrs"))
    keep_attrs = {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"}

    for src_mesh in src_gltf.get("meshes", []):
        mesh_copy = copy.deepcopy(src_mesh)
        new_prims = []

        for src_prim in src_mesh["primitives"]:
            prim = copy.deepcopy(src_prim)
            attrs = prim["attributes"]
            positions = read_accessor(src_gltf, src_bin, attrs["POSITION"])
            indices = read_accessor(src_gltf, src_bin, prim["indices"]) if "indices" in prim else None

            prim_mode = prim.get("mode", 4)
            if (
                spec.get("weld_coincident")
                and prim_mode == 4
                and all(k in attrs for k in ("NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"))
                and indices is not None
            ):
                min_dot = -2.0 if src_mesh.get("name") == "Imp_Chains" else 0.5
                w_pos, w_nrm, w_uv, w_jnt, w_wgt, w_idx = weld_coincident_primitive(
                    positions,
                    read_accessor(src_gltf, src_bin, attrs["NORMAL"]),
                    read_accessor(src_gltf, src_bin, attrs["TEXCOORD_0"]),
                    read_accessor(src_gltf, src_bin, attrs["JOINTS_0"]),
                    read_accessor(src_gltf, src_bin, attrs["WEIGHTS_0"]),
                    indices,
                    min_normal_dot=min_dot,
                )
                uv_in_unit = all(0.0 <= uv[0] <= 1.0 and 0.0 <= uv[1] <= 1.0 for uv in w_uv)
                prim["indices"] = bb.add_ushort_accessor(w_idx, TARGET_ELEMENT_ARRAY_BUFFER)
                prim["attributes"] = {
                    "POSITION": bb.add_float_accessor(w_pos, "VEC3", with_minmax=True, target=TARGET_ARRAY_BUFFER),
                    "NORMAL": bb.add_float_accessor(w_nrm, "VEC3", with_minmax=False, target=TARGET_ARRAY_BUFFER),
                    "TEXCOORD_0": (
                        bb.add_norm_ushort2_accessor(w_uv, TARGET_ARRAY_BUFFER)
                        if uv_in_unit
                        else bb.add_float_accessor(w_uv, "VEC2", with_minmax=False, target=TARGET_ARRAY_BUFFER)
                    ),
                    "JOINTS_0": bb.add_ubyte4_joints_accessor(w_jnt, TARGET_ARRAY_BUFFER),
                    "WEIGHTS_0": bb.add_norm_ubyte4_weights_accessor(w_wgt, TARGET_ARRAY_BUFFER),
                }
                strip_r128_extensions(prim)
                new_prims.append(prim)
                continue

            if "indices" in prim:
                prim["indices"] = bb.copy_accessor(src_gltf, src_bin, prim["indices"], TARGET_ELEMENT_ARRAY_BUFFER)

            new_attrs = {}
            for attr_name, acc_idx in attrs.items():
                if attr_name == "NORMAL":
                    continue
                if strip_extra and attr_name not in keep_attrs:
                    continue

                if strip_extra and attr_name == "TEXCOORD_0":
                    uvs = read_accessor(src_gltf, src_bin, acc_idx)
                    if uvs and all(0.0 <= u <= 1.0 and 0.0 <= v <= 1.0 for u, v in uvs):
                        new_attrs[attr_name] = bb.add_norm_ushort2_accessor(uvs, TARGET_ARRAY_BUFFER)
                    else:
                        new_attrs[attr_name] = bb.copy_accessor(src_gltf, src_bin, acc_idx, TARGET_ARRAY_BUFFER)
                elif strip_extra and attr_name == "WEIGHTS_0":
                    wgts = read_accessor(src_gltf, src_bin, acc_idx)
                    new_attrs[attr_name] = bb.add_norm_ubyte4_weights_accessor(wgts, TARGET_ARRAY_BUFFER)
                elif strip_extra and attr_name == "JOINTS_0":
                    jnts = read_accessor(src_gltf, src_bin, acc_idx)
                    if jnts and all(max(j4) < 256 for j4 in jnts):
                        new_attrs[attr_name] = bb.add_ubyte4_joints_accessor(jnts, TARGET_ARRAY_BUFFER)
                    else:
                        new_attrs[attr_name] = bb.copy_accessor(src_gltf, src_bin, acc_idx, TARGET_ARRAY_BUFFER)
                else:
                    new_attrs[attr_name] = bb.copy_accessor(src_gltf, src_bin, acc_idx, TARGET_ARRAY_BUFFER)

            prim_mode = prim.get("mode", 4)
            if "NORMAL" not in attrs:
                if prim_mode != 4:
                    raise ValueError(f"{key}: compute_smooth_normals requires TRIANGLES mode (4), got {prim_mode}")
                normals = compute_smooth_normals(positions, indices=indices, crease_deg=None)
                new_attrs["NORMAL"] = bb.add_float_accessor(normals, "VEC3", with_minmax=False, target=TARGET_ARRAY_BUFFER)
            else:
                orig_normals = read_accessor(src_gltf, src_bin, attrs["NORMAL"])
                unit_normals = ensure_unit_normals(orig_normals)
                new_attrs["NORMAL"] = bb.add_float_accessor(unit_normals, "VEC3", with_minmax=False, target=TARGET_ARRAY_BUFFER)

            prim["attributes"] = new_attrs
            strip_r128_extensions(prim)
            new_prims.append(prim)

        mesh_copy["primitives"] = new_prims
        strip_r128_extensions(mesh_copy)
        out_meshes.append(mesh_copy)

    # 2. Copy skins
    out_skins = []
    for src_skin in src_gltf.get("skins", []):
        sk = copy.deepcopy(src_skin)
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = bb.copy_accessor(src_gltf, src_bin, sk["inverseBindMatrices"])
        out_skins.append(sk)

    # 3. Copy & compress embedded images
    out_images = []
    for idx_im, src_img in enumerate(src_gltf.get("images", [])):
        im = copy.deepcopy(src_img)
        if "bufferView" in im:
            sbv = src_gltf["bufferViews"][im["bufferView"]]
            raw_img = src_bin[sbv.get("byteOffset", 0) : sbv.get("byteOffset", 0) + sbv["byteLength"]]
            if spec.get("compress_bestiary_tex"):
                comp_img, comp_mime = compress_bestiary_image(
                    raw_img,
                    im.get("name", f"img_{idx_im}"),
                    im.get("mimeType", "image/png"),
                    quantize_normal_colors=spec.get("quantize_normal_colors"),
                )
            else:
                comp_img, comp_mime = raw_img, im.get("mimeType", "image/png")
            im["bufferView"] = bb.add_raw_view(comp_img)
            im["mimeType"] = comp_mime
        out_images.append(im)

    # 4. Copy nodes and wrap scene roots under EnemyRoot
    out_nodes = copy.deepcopy(src_gltf.get("nodes", []))
    if strip_extra:
        compact_node_trs(out_nodes)
    orig_scene = copy.deepcopy(src_gltf["scenes"][src_gltf.get("scene", 0)])
    orig_root_nodes = list(orig_scene.get("nodes", []))

    enemy_root_idx = len(out_nodes)
    out_nodes.append({
        "name": "EnemyRoot",
        "children": orig_root_nodes,
        "translation": [0.0, float(ground_offset_y), 0.0],
        "rotation": [0.0, math.sin(facing_yaw * 0.5), 0.0, math.cos(facing_yaw * 0.5)],
        "scale": [float(scale_factor), float(scale_factor), float(scale_factor)],
    })
    out_scene = {
        "name": orig_scene.get("name", f"{key}Scene"),
        "nodes": [enemy_root_idx],
    }

    # 5. Retarget UAL clips (Bestiary 55-bone rig) or sanitize source animations (Quaternius / Ultimate Monsters override)
    has_bestiary_pelvis = any(n.get("name") == "pelvis" for n in src_gltf.get("nodes", []))
    if spec.get("retarget_ual") and has_bestiary_pelvis:
        out_animations = retarget_ual_animations(src_gltf, bb, ual_gltf, ual_bin, spec["ual_clips"])
    else:
        out_animations = copy_and_clean_animations(src_gltf, src_bin, bb, out_nodes)

    # 6. Strip non-core extensions on materials/textures/samplers for r128 compatibility
    out_materials = copy.deepcopy(src_gltf.get("materials", []))
    out_textures = copy.deepcopy(src_gltf.get("textures", []))
    out_samplers = copy.deepcopy(src_gltf.get("samplers", []))
    strip_r128_extensions(out_materials)
    strip_r128_extensions(out_textures)
    strip_r128_extensions(out_samplers)

    # 7. Assemble output glTF JSON & binary GLB
    bb.pad4()
    out_gltf = {
        "asset": {
            "version": "2.0",
            "generator": "Blobby Worlds build_enemies_glb.py",
        },
        "extras": {
            "archetype": key,
            "canonicalHeight": canonical_h,
            "groundOffsetY": ground_offset_y,
            "facingYaw": facing_yaw,
            "source": source_label,
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
        ("materials", out_materials),
        ("textures", out_textures),
        ("images", out_images),
        ("samplers", out_samplers),
        ("animations", out_animations),
    ):
        if val:
            out_gltf[optional_key] = val
    strip_r128_extensions(out_gltf)

    # Verify normalized bounds before emitting
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

    max_bytes = spec.get("max_bytes")
    if max_bytes is not None:
        assert len(glb) <= max_bytes, f"{key}.glb ({len(glb)} B) exceeds limit {max_bytes} B"

    os.makedirs(ENEMIES_OUT_DIR, exist_ok=True)
    glb_path = os.path.join(ENEMIES_OUT_DIR, f"{key}.glb")
    js_path = os.path.join(ENEMIES_OUT_DIR, f"{key}.glb.js")

    with open(glb_path, "wb") as f:
        f.write(glb)

    b64 = base64.b64encode(bytes(glb)).decode("ascii")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(
            f'(function(g){{g.__ENEMY_GLB_B64__=g.__ENEMY_GLB_B64__||{{}};g.__ENEMY_GLB_B64__["{key}"]="{b64}";}})(typeof window!=="undefined"?window:globalThis);\n'
        )

    clip_names = [a["name"] for a in out_animations]
    joint_names = [
        out_nodes[ji].get("name", "")
        for sk in out_skins
        for ji in sk.get("joints", [])
    ]
    return {
        "key": key,
        "bytes": len(glb),
        "clips": clip_names,
        "joint_count": len(joint_names),
        "joint_sample": joint_names[:8],
        "height": post_h,
        "minY": p_mins[1],
        "maxY": p_maxs[1],
        "yaw": facing_yaw,
        "scale": scale_factor,
        "groundOffsetY": ground_offset_y,
    }


def main():
    ual_gltf, ual_bin = load_ual_cached()
    results = []
    total_bytes = 0
    for spec in ARCHETYPES:
        info = compile_archetype(spec, ual_gltf, ual_bin)
        results.append(info)
        total_bytes += info["bytes"]
        print(
            f"Built {info['key']:10s} | {info['bytes']:7d} B | h={info['height']:.3f}m "
            f"Y=[{info['minY']:+.3f},{info['maxY']:+.3f}] yaw={info['yaw']:+.3f} "
            f"| {info['joint_count']:2d} joints | {len(info['clips']):2d} clips: {info['clips']}"
        )
    print(f"\nTotal 7 .glb size: {total_bytes:,} bytes ({total_bytes / (1024 * 1024):.3f} MB)")
    assert total_bytes <= MAX_TOTAL_GLB_BYTES, (
        f"Total .glb size {total_bytes} exceeds budget {MAX_TOTAL_GLB_BYTES}"
    )


if __name__ == "__main__":
    main()
