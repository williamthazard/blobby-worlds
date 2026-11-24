#!/usr/bin/env python3
"""
Offline asset compiler for Blobby Worlds: The Starkeeper.

Compiles CC0 1.0 Public Domain Quaternius Adventurer.glb + Quaternius
Universal Animation Library (AnimationLibrary_Godot_Standard.gltf) into:
  - assets/starkeeper.glb     (compact binary glTF 2.0 for GitHub Pages / HTTP)
  - assets/starkeeper.glb.js  (base64 wrapper loaded ONLY on file://)

Features:
  - Strips default Backpack mesh so back stays clean for Starkeeper's cloak.
  - Exact 1-to-1 world-rest-basis quaternion retargeting across all 49 humanoid bones.
  - Zero horizontal root-motion drift (physics drives X/Z; animation drives vertical bounce).
  - 22 retargeted UAL clips + 10 synthesized Blobby Worlds combat/strafe/slide clips (32 total).
  - 4 baked facial morph targets (Blink, Determined, Smile, Hurt) on Adventurer_Head.
  - Zero third-party Python dependencies (stdlib only).
"""

import base64
import colorsys
import io
import json
import math
import os
import struct
import urllib.request
import zipfile

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT_DIR, "assets")
OUT_GLB = os.path.join(ASSETS_DIR, "starkeeper.glb")
OUT_JS = os.path.join(ASSETS_DIR, "starkeeper.glb.js")

RANGER_OUTFIT_DIR = os.path.join(ASSETS_DIR, "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)", "Outfits")
RANGER_GLTF_PATH = os.path.join(RANGER_OUTFIT_DIR, "Male_Ranger.gltf")
ADV_URL = "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/modular_men/Adventurer.glb"
UBC_ZIP_URL = "https://github.com/WaviestSun/atelier-packs/releases/download/packs-2/Universal-Base-Characters-Standard.zip"
UBC_CACHE_PATH = "/tmp/ubc_cache/Universal-Base-Characters-Standard.zip"
UAL_GLTF_URL = "https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.gltf"
UAL_BIN_URL = "https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.bin"

# Canonical bone name rename table: UBC / Modular Fantasy Ranger 65-bone names -> Starkeeper canonical names
UBC_BONE_RENAME = {
    "root": "Root",
    "pelvis": "Hips",
    "spine_01": "Abdomen",
    "spine_02": "Torso",
    "spine_03": "Chest",
    "neck_01": "Neck",
    "Head": "Head",
    "clavicle_l": "Shoulder.L",
    "upperarm_l": "UpperArm.L",
    "lowerarm_l": "LowerArm.L",
    "hand_l": "Hand.L",
    "index_01_l": "Index2.L",
    "index_02_l": "Index3.L",
    "index_03_l": "Index4.L",
    "middle_01_l": "Middle2.L",
    "middle_02_l": "Middle3.L",
    "middle_03_l": "Middle4.L",
    "ring_01_l": "Ring2.L",
    "ring_02_l": "Ring3.L",
    "ring_03_l": "Ring4.L",
    "pinky_01_l": "Pinky2.L",
    "pinky_02_l": "Pinky3.L",
    "pinky_03_l": "Pinky4.L",
    "thumb_01_l": "Thumb1.L",
    "thumb_02_l": "Thumb2.L",
    "thumb_03_l": "Thumb3.L",
    "clavicle_r": "Shoulder.R",
    "upperarm_r": "UpperArm.R",
    "lowerarm_r": "LowerArm.R",
    "hand_r": "Hand.R",
    "index_01_r": "Index2.R",
    "index_02_r": "Index3.R",
    "index_03_r": "Index4.R",
    "middle_01_r": "Middle2.R",
    "middle_02_r": "Middle3.R",
    "middle_03_r": "Middle4.R",
    "ring_01_r": "Ring2.R",
    "ring_02_r": "Ring3.R",
    "ring_03_r": "Ring4.R",
    "pinky_01_r": "Pinky2.R",
    "pinky_02_r": "Pinky3.R",
    "pinky_03_r": "Pinky4.R",
    "thumb_01_r": "Thumb1.R",
    "thumb_02_r": "Thumb2.R",
    "thumb_03_r": "Thumb3.R",
    "thigh_l": "UpperLeg.L",
    "calf_l": "LowerLeg.L",
    "foot_l": "Foot.L",
    "ball_l": "Toe.L",
    "thigh_r": "UpperLeg.R",
    "calf_r": "LowerLeg.R",
    "foot_r": "Foot.R",
    "ball_r": "Toe.R",
}

# 1-to-1 bone mapping: Adventurer target bone -> UAL source bone
BONE_MAP = {
    "Hips": "DEF-hips",
    "Abdomen": "DEF-spine.001",
    "Torso": "DEF-spine.002",
    "Chest": "DEF-spine.003",
    "Neck": "DEF-neck",
    "Head": "DEF-head",
    "Shoulder.L": "DEF-shoulder.L",
    "UpperArm.L": "DEF-upper_arm.L",
    "LowerArm.L": "DEF-forearm.L",
    "Hand.L": "DEF-hand.L",
    "Index2.L": "DEF-f_index.01.L",
    "Index3.L": "DEF-f_index.02.L",
    "Index4.L": "DEF-f_index.03.L",
    "Middle2.L": "DEF-f_middle.01.L",
    "Middle3.L": "DEF-f_middle.02.L",
    "Middle4.L": "DEF-f_middle.03.L",
    "Ring2.L": "DEF-f_ring.01.L",
    "Ring3.L": "DEF-f_ring.02.L",
    "Ring4.L": "DEF-f_ring.03.L",
    "Pinky2.L": "DEF-f_pinky.01.L",
    "Pinky3.L": "DEF-f_pinky.02.L",
    "Pinky4.L": "DEF-f_pinky.03.L",
    "Thumb1.L": "DEF-thumb.01.L",
    "Thumb2.L": "DEF-thumb.02.L",
    "Thumb3.L": "DEF-thumb.03.L",
    "Shoulder.R": "DEF-shoulder.R",
    "UpperArm.R": "DEF-upper_arm.R",
    "LowerArm.R": "DEF-forearm.R",
    "Hand.R": "DEF-hand.R",
    "Index2.R": "DEF-f_index.01.R",
    "Index3.R": "DEF-f_index.02.R",
    "Index4.R": "DEF-f_index.03.R",
    "Middle2.R": "DEF-f_middle.01.R",
    "Middle3.R": "DEF-f_middle.02.R",
    "Middle4.R": "DEF-f_middle.03.R",
    "Ring2.R": "DEF-f_ring.01.R",
    "Ring3.R": "DEF-f_ring.02.R",
    "Ring4.R": "DEF-f_ring.03.R",
    "Pinky2.R": "DEF-f_pinky.01.R",
    "Pinky3.R": "DEF-f_pinky.02.R",
    "Pinky4.R": "DEF-f_pinky.03.R",
    "Thumb1.R": "DEF-thumb.01.R",
    "Thumb2.R": "DEF-thumb.02.R",
    "Thumb3.R": "DEF-thumb.03.R",
    "UpperLeg.L": "DEF-thigh.L",
    "LowerLeg.L": "DEF-shin.L",
    "Foot.L": "DEF-foot.L",
    "Toe.L": "DEF-toe.L",
    "UpperLeg.R": "DEF-thigh.R",
    "LowerLeg.R": "DEF-shin.R",
    "Foot.R": "DEF-foot.R",
    "Toe.R": "DEF-toe.R",
}

# 22 curated UAL source clip names -> clean Starkeeper clip names
UAL_CLIP_MAP = [
    ("Idle_Loop", "Idle"),
    ("Idle_Torch_Loop", "IdleStaff"),
    ("Walk_Loop", "Walk"),
    ("Jog_Fwd_Loop", "Jog"),
    ("Sprint_Loop", "Sprint"),
    ("Crouch_Idle_Loop", "CrouchIdle"),
    ("Crouch_Fwd_Loop", "CrouchFwd"),
    ("Jump_Start", "JumpStart"),
    ("Jump_Loop", "JumpLoop"),
    ("Jump_Land", "JumpLand"),
    ("Roll", "Roll"),
    ("Swim_Idle_Loop", "SwimIdle"),
    ("Swim_Fwd_Loop", "SwimFwd"),
    ("Spell_Simple_Enter", "CastEnter"),
    ("Spell_Simple_Shoot", "CastShoot"),
    ("Spell_Simple_Idle_Loop", "CastLoop"),
    ("Punch_Jab", "MeleeJab"),
    ("Punch_Cross", "MeleeCross"),
    ("Hit_Chest", "HitReact"),
    ("Death01", "Death"),
    ("Interact", "Cheer"),
]

# ---------- Pure-Python Quaternion & Vector Math ----------

def qnorm(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if n < 1e-12:
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


def qaxis(axis, angle):
    ax, ay, az = axis
    l = math.sqrt(ax * ax + ay * ay + az * az) or 1.0
    s = math.sin(angle * 0.5) / l
    return (ax * s, ay * s, az * s, math.cos(angle * 0.5))


def qeuler_xyz(rx=0.0, ry=0.0, rz=0.0):
    """World-space rotation applying X then Y then Z (YXZ or ZYX composed cleanly)."""
    qx = qaxis((1.0, 0.0, 0.0), rx)
    qy = qaxis((0.0, 1.0, 0.0), ry)
    qz = qaxis((0.0, 0.0, 1.0), rz)
    return qnorm(qmul(qy, qmul(qx, qz)))


def fetch_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def parse_glb(data):
    magic, ver, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and ver == 2, "Invalid GLB header"
    jlen, jtype = struct.unpack_from("<II", data, 12)
    assert jtype == 0x4E4F534A
    gltf = json.loads(data[20 : 20 + jlen].decode("utf-8"))
    bin_off = 20 + jlen
    blen, btype = struct.unpack_from("<II", data, bin_off)
    assert btype == 0x004E4942
    bin_data = data[bin_off + 8 : bin_off + 8 + blen]
    return gltf, bin_data


# ---------- glTF Accessor Readers & Writers ----------

COMP_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_CNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


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

    def add_raw_view(self, raw_bytes, target=None, byte_stride=None):
        self.pad4()
        offset = len(self.buf)
        self.buf.extend(raw_bytes)
        bv = {"buffer": 0, "byteOffset": offset, "byteLength": len(raw_bytes)}
        if target is not None:
            bv["target"] = target
        if byte_stride is not None:
            bv["byteStride"] = byte_stride
        idx = len(self.buffer_views)
        self.buffer_views.append(bv)
        return idx

    def copy_accessor(self, src_gltf, src_bin, src_acc_idx, target_hint=None):
        acc = dict(src_gltf["accessors"][src_acc_idx])
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
        bv_idx = self.add_raw_view(packed, target=target_hint or bv.get("target"))
        acc["bufferView"] = bv_idx
        acc.pop("byteOffset", None)
        idx = len(self.accessors)
        self.accessors.append(acc)
        return idx

    def add_ushort_accessor(self, values, target=34963):
        packed = struct.pack("<" + ("H" * len(values)), *values)
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

    def add_ubyte4_accessor(self, values, target=34962):
        packed = bytearray()
        for v in values:
            packed.extend(struct.pack("<4B", int(v[0]), int(v[1]), int(v[2]), int(v[3])))
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

    def add_float_accessor(self, values, acc_type, with_minmax=True, target=None):
        cnt = TYPE_CNT[acc_type]
        packed = bytearray()
        if cnt == 1:
            for v in values:
                packed.extend(struct.pack("<f", float(v)))
            mins = [float(min(values))] if values else [0.0]
            maxs = [float(max(values))] if values else [0.0]
        else:
            mins = [float("inf")] * cnt
            maxs = [float("-inf")] * cnt
            fmt = "<" + ("f" * cnt)
            for v in values:
                fv = tuple(float(c) for c in v)
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

    def add_ushort_accessor(self, values, target=34963):
        packed = struct.pack("<" + ("H" * len(values)), *values)
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

    def add_ubyte4_accessor(self, values, target=34962):
        packed = bytearray()
        for v in values:
            packed.extend(struct.pack("<4B", int(v[0]), int(v[1]), int(v[2]), int(v[3])))
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
        t = tuple(n.get("translation", [0.0, 0.0, 0.0]))
        r = qnorm(tuple(n.get("rotation", [0.0, 0.0, 0.0, 1.0])))
        s = tuple(n.get("scale", [1.0, 1.0, 1.0]))
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


def fetch_ubc_zip():
    os.makedirs(os.path.dirname(UBC_CACHE_PATH), exist_ok=True)
    if not os.path.exists(UBC_CACHE_PATH):
        with open(UBC_CACHE_PATH, "wb") as f:
            f.write(fetch_url(UBC_ZIP_URL))
    return UBC_CACHE_PATH


def encode_image_bytes(raw_png_bytes, size, fmt="JPEG", quality=92):
    """Downscales & encodes an embedded glTF texture cleanly via Pillow (with raw PNG fallback)."""
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw_png_bytes)).convert("RGB")
        if im.size != (size, size):
            im = im.resize((size, size), Image.LANCZOS)
        out = io.BytesIO()
        if fmt == "JPEG":
            im.save(out, format="JPEG", quality=quality, optimize=True)
            return out.getvalue(), "image/jpeg"
        im.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"
    except Exception:
        return raw_png_bytes, "image/png"


def restyle_ranger_albedo(raw_png_bytes, size=512, quality=90):
    """
    Re-palettes Quaternius Modular Fantasy Ranger's forest-green cloth into Starkeeper's
    celestial Midnight-Indigo & Sea-Teal astronomer palette and warms silver buckles into
    burnished astral gold, while keeping 100% of hand-painted stitched brown leather straps,
    boots, belts, bracers, and folds untouched!
    """
    from PIL import Image
    im = Image.open(io.BytesIO(raw_png_bytes)).convert("RGB")
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    px = im.load()
    for y in range(size):
        for x in range(size):
            r, g, b = px[x, y]
            rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
            h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
            if 0.19 <= h <= 0.48 and s > 0.16:
                # Forest green tunic & trousers -> celestial midnight-indigo & sea-teal
                if v >= 0.28:
                    # Brighter tunic sleeves & accents -> luminous deep sea-teal / celestial blue
                    h_new = 0.545 + (h - 0.19) * 0.15
                    s_new = min(0.82, s * 0.78)
                    v_new = min(0.72, v * 1.08 + 0.04)
                else:
                    # Deep forest trouser & base coat cloth -> rich royal midnight-indigo
                    h_new = 0.625
                    s_new = min(0.72, s * 0.72)
                    v_new = min(0.50, v * 1.45 + 0.05)
                nr, ng, nb = colorsys.hsv_to_rgb(h_new, s_new, v_new)
                px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255))
            elif s < 0.24 and v > 0.44:
                # Silver/cool-steel buckles & trim -> warm burnished astral gold
                nr = min(255, int(r * 1.12))
                ng = min(255, int(g * 0.99))
                nb = min(255, int(b * 0.62))
                px[x, y] = (nr, ng, nb)
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue(), "image/jpeg"


def extract_ubc_head_yup():
    """
    Extracts the realistic sculpted Head+Neck, hand-painted Eyeballs, 3D Eyebrows, and
    trimmed back-of-head hairline cap directly in native Universal Base Character Y-up
    meter space (exact 1-to-1 match with Modular Character Outfits - Fantasy!).
    """
    zip_path = fetch_ubc_zip()
    with zipfile.ZipFile(zip_path) as zf:
        fn = "Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf"
        ug = json.loads(zf.read(fn).decode("utf-8"))
        ub = zf.read(fn.replace(".gltf", ".bin"))
        hfn = "Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Buzzed.gltf"
        hg = json.loads(zf.read(hfn).decode("utf-8"))
        hb = zf.read(hfn.replace(".gltf", ".bin"))
        tex_eye_raw = zf.read("Universal Base Characters[Standard]/Base Characters/Textures/T_Eye_Brown.png")

    tex_eye, mime_eye = encode_image_bytes(tex_eye_raw, 256, "JPEG", 90)
    u_joints = [ug["nodes"][j].get("name") for j in ug["skins"][0]["joints"]]
    u_neck_ji = u_joints.index("neck_01")
    u_head_ji = u_joints.index("Head")

    def build_part(src_g, src_b, mesh_idx, mat_key, mode="all"):
        p = src_g["meshes"][mesh_idx]["primitives"][0]
        pos_all = read_accessor(src_g, src_b, p["attributes"]["POSITION"])
        nrm_all = read_accessor(src_g, src_b, p["attributes"]["NORMAL"])
        uv_all = read_accessor(src_g, src_b, p["attributes"]["TEXCOORD_0"])
        jnt_all = read_accessor(src_g, src_b, p["attributes"]["JOINTS_0"])
        wgt_all = read_accessor(src_g, src_b, p["attributes"]["WEIGHTS_0"])
        idx_all = read_accessor(src_g, src_b, p["indices"])

        if mode == "head_skin":
            keep = set()
            for i, (ux, uy, uz) in enumerate(pos_all):
                hw = sum(wgt_all[i][k] for k in range(4) if jnt_all[i][k] in (u_head_ji, u_neck_ji))
                if hw > 0.25 and abs(ux) < 0.145 and uy > 1.46:
                    keep.add(i)
            kept_tris = [
                (idx_all[k], idx_all[k + 1], idx_all[k + 2])
                for k in range(0, len(idx_all), 3)
                if idx_all[k] in keep and idx_all[k + 1] in keep and idx_all[k + 2] in keep
            ]
        elif mode == "back_hair":
            # Keep ONLY back-of-head hairline cap strictly behind the ears (z <= -0.020m, y >= 1.65m) -> 0 front/temple tris!
            kept_tris = []
            for k in range(0, len(idx_all), 3):
                i0, i1, i2 = idx_all[k], idx_all[k + 1], idx_all[k + 2]
                cz = (pos_all[i0][2] + pos_all[i1][2] + pos_all[i2][2]) / 3.0
                cy = (pos_all[i0][1] + pos_all[i1][1] + pos_all[i2][1]) / 3.0
                if cz <= -0.020 and cy >= 1.650:
                    kept_tris.append((i0, i1, i2))
        else:
            kept_tris = [(idx_all[k], idx_all[k + 1], idx_all[k + 2]) for k in range(0, len(idx_all), 3)]

        remap = {}
        out_pos, out_nrm, out_uv, out_jnt, out_wgt, out_idx = [], [], [], [], [], []
        for tri in kept_tris:
            for vi in tri:
                if vi not in remap:
                    remap[vi] = len(out_pos)
                    ux, uy, uz = pos_all[vi]
                    if mat_key == "Skin":
                        if uy > 1.762:
                            # Gently tuck top scalp dome slightly inward so it seats cleanly inside the tilted Astronomer Hat!
                            t_top = min(1.0, (uy - 1.762) / 0.048)
                            ux *= (1.0 - 0.16 * t_top)
                            uz = -0.0174 + (uz + 0.0174) * (1.0 - 0.16 * t_top)
                            uy -= 0.010 * t_top
                        elif uy < 1.545:
                            # Tuck lower neck gently downward inside Ranger tunic collar
                            t_low = min(1.0, max(0.0, (1.545 - uy) / 0.045))
                            uy -= 0.028 * t_low
                            ux *= (1.0 - 0.10 * t_low)
                    out_pos.append((ux, uy, uz))
                    nx, ny, nz = nrm_all[vi]
                    nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
                    out_nrm.append((nx / nl, ny / nl, nz / nl))
                    out_uv.append(uv_all[vi])
                    out_jnt.append(jnt_all[vi])
                    out_wgt.append(wgt_all[vi])
                out_idx.append(remap[vi])

        # Enforce <1 deg smooth-normal continuity across UV seams on Skin
        if mat_key == "Skin":
            buckets = {}
            for p_v, n_v in zip(out_pos, out_nrm):
                k = (round(p_v[0], 5), round(p_v[1], 5), round(p_v[2], 5))
                buckets.setdefault(k, []).append(n_v)
            cos_t = math.cos(math.radians(68.0))
            sm = []
            for p_v, n_v in zip(out_pos, out_nrm):
                k = (round(p_v[0], 5), round(p_v[1], 5), round(p_v[2], 5))
                sx = sy = sz = 0.0
                for cn in buckets[k]:
                    if n_v[0] * cn[0] + n_v[1] * cn[1] + n_v[2] * cn[2] >= cos_t:
                        sx += cn[0]; sy += cn[1]; sz += cn[2]
                l = math.sqrt(sx * sx + sy * sy + sz * sz)
                sm.append((sx / l, sy / l, sz / l) if l > 1e-8 else n_v)
            out_nrm = sm

        return {
            "mat_key": mat_key,
            "pos": out_pos,
            "nrm": out_nrm,
            "uv": out_uv,
            "jnt": out_jnt,
            "wgt": out_wgt,
            "idx": out_idx,
        }

    parts = [
        build_part(ug, ub, 2, "Skin", mode="head_skin"),
        build_part(ug, ub, 0, "Eyebrows", mode="all"),
        build_part(ug, ub, 1, "Eye", mode="all"),
        build_part(hg, hb, 0, "Hair", mode="back_hair"),
    ]
    return parts, (tex_eye, mime_eye)


def make_head_morph_deltas_yup(positions, mat_name):
    """
    Computes 4 expressive facial morph delta arrays [Blink, Determined, Smile, Hurt]
    in native Y-up +Z-forward meter space (UBC Superhero_Male Head):
      Eyes center: |x| ~ 0.034m, y ~ 1.698m, z ~ 0.051..0.081m
      Eyebrows:    |x| <= 0.062m, y ~ 1.695..1.725m, z ~ 0.057..0.095m
      Mouth/lips:  |x| <= 0.036m, y ~ 1.615..1.640m, z ~ 0.075..0.095m
    """
    blink, determined, smile, hurt = [], [], [], []
    is_eye = mat_name == "Eye"
    is_brow = mat_name == "Eyebrows"
    is_skin = mat_name == "Skin"

    for (x, y, z) in positions:
        # 1. Blink: lower upper eyelid smoothly over eyeball & tuck eyeball vertically
        bx = by = bz = 0.0
        if is_eye:
            by = (1.698 - y) * 0.72
            bz = -0.004
        elif is_skin and z > 0.052 and 1.698 < y < 1.722 and 0.015 < abs(x) < 0.056:
            lid_w = math.exp(-((abs(x) - 0.034) / 0.015) ** 2) * max(0.0, min(1.0, (1.722 - y) / 0.020))
            by = -0.014 * lid_w
            bz = 0.003 * lid_w
        blink.append((bx, by, bz))

        # 2. Determined: heroic Z-target angled 3D eyebrows & firm brow ridge
        dx = dy = dz = 0.0
        if is_brow:
            inner_w = max(0.0, 1.0 - abs(x) / 0.055)
            outer_w = max(0.0, (abs(x) - 0.035) / 0.030)
            dy = -0.013 * inner_w + 0.005 * outer_w
            dz = 0.003 * inner_w
        elif is_skin and z > 0.055 and 1.704 < y < 1.734 and abs(x) < 0.055:
            inner_w = max(0.0, 1.0 - abs(x) / 0.055)
            dy = -0.007 * inner_w
            dz = 0.002 * inner_w
        determined.append((dx, dy, dz))

        # 3. Smile: warm raised brows + lifted sculpted mouth corners & gentle cheek fullness
        sx = sy = sz = 0.0
        if is_brow:
            sy = 0.007
        elif is_skin and z > 0.052 and 1.600 < y < 1.675 and 0.012 < abs(x) < 0.068:
            lip_corner = math.exp(-((y - 1.624) / 0.015) ** 2) * math.exp(-((abs(x) - 0.028) / 0.015) ** 2)
            cheek_w = math.exp(-((y - 1.654) / 0.022) ** 2) * math.exp(-((abs(x) - 0.044) / 0.020) ** 2)
            sx = math.copysign(0.004 * lip_corner, x)
            sy = 0.010 * lip_corner + 0.006 * cheek_w
            sz = -0.004 * lip_corner + 0.003 * cheek_w
        smile.append((sx, sy, sz))

        # 4. Hurt: wincing squinted eyes + furrowed inner brows + tightened mouth
        hx = hy = hz = 0.0
        if is_eye:
            hy = (1.698 - y) * 0.55
        elif is_brow:
            inner_w = max(0.0, 1.0 - abs(x) / 0.052)
            outer_w = max(0.0, (abs(x) - 0.034) / 0.034)
            hy = 0.009 * inner_w - 0.008 * outer_w
        elif is_skin and z > 0.052 and 1.605 < y < 1.665 and abs(x) < 0.055:
            w = math.exp(-((y - 1.626) / 0.020) ** 2)
            hy = -0.006 * w
            hz = -0.004 * w
        hurt.append((hx, hy, hz))

    return [blink, determined, smile, hurt]


def sculpt_athletic_body(positions, indices, mesh_name):
    """
    Refines Adventurer's boxy Modular-Men torso, legs, and boots into a sleeker, heroic
    athletic silhouette (matching Universal Base Characters proportions) while keeping
    arm sleeves, hands/staff-grip, and y=0 boot soles millimeter-exact!
    """
    is_body = "body" in mesh_name.lower()
    is_legs = "legs" in mesh_name.lower()
    is_feet = "feet" in mesh_name.lower()
    out_pos = []
    for (x, y, z) in positions:
        mx, my, mz = x * 100.0, y * 100.0, z * 100.0  # X=left/right, Y=-Z_fwd, Z=Y_up
        if is_body and abs(mx) < 0.22:
            # Subtle athletic waist cinch (y in 1.00..1.30m) + crisp upper chest V-taper (y in 1.32..1.50m)
            waist_w = math.exp(-((mz - 1.15) / 0.13) ** 2) * max(0.0, 1.0 - max(0.0, abs(mx) - 0.14) / 0.08)
            chest_w = math.exp(-((mz - 1.40) / 0.10) ** 2) * max(0.0, 1.0 - max(0.0, abs(mx) - 0.16) / 0.06)
            mx *= (1.0 - 0.095 * waist_w + 0.030 * chest_w)
            my *= (1.0 - 0.070 * waist_w + 0.035 * chest_w)
        elif is_legs:
            # Sleeker modern athletic trousers (trim excess boxiness around hips & outer thighs)
            hip_w = max(0.0, min(1.0, (mz - 0.72) / 0.30))
            leg_cx = math.copysign(0.095, mx) if abs(mx) > 0.025 else 0.0
            mx = leg_cx + (mx - leg_cx) * (0.93 - 0.03 * hip_w)
            my *= 0.94
        elif is_feet and mz > 0.015:
            # Sleeker fitted leather boot shaft & instep while preserving exact y=0.000 flat soles
            t_up = min(1.0, (mz - 0.015) / 0.08)
            leg_cx = math.copysign(0.095, mx) if abs(mx) > 0.025 else 0.0
            mx = leg_cx + (mx - leg_cx) * (1.0 - 0.06 * t_up)
        out_pos.append((mx / 100.0, my / 100.0, mz / 100.0))

    # Recompute clean per-vertex triangle normals after proportion sculpt
    v_norms = [[0.0, 0.0, 0.0] for _ in range(len(out_pos))]
    for i in range(0, len(indices), 3):
        i0, i1, i2 = indices[i], indices[i + 1], indices[i + 2]
        p0, p1, p2 = out_pos[i0], out_pos[i1], out_pos[i2]
        e1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
        e2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
        nx = e1[1] * e2[2] - e1[2] * e2[1]
        ny = e1[2] * e2[0] - e1[0] * e2[2]
        nz = e1[0] * e2[1] - e1[1] * e2[0]
        nl = math.sqrt(nx * nx + ny * ny + nz * nz)
        if nl > 1e-12:
            nx /= nl; ny /= nl; nz /= nl
            for vi in (i0, i1, i2):
                v_norms[vi][0] += nx; v_norms[vi][1] += ny; v_norms[vi][2] += nz
    out_norms = []
    for vn in v_norms:
        nl = math.sqrt(vn[0] * vn[0] + vn[1] * vn[1] + vn[2] * vn[2])
        out_norms.append((vn[0] / nl, vn[1] / nl, vn[2] / nl) if nl > 1e-10 else (0.0, -1.0, 0.0))
    return out_pos, out_norms


def compute_smooth_normals_and_uvs(positions, orig_normals, is_head=False):
    """
    Computes crease-aware smooth vertex normals across split-triangle vertices so Starkeeper's
    face, hands, tunic, trousers, and boots shade organically smooth instead of flat-faceted,
    AND generates seamless cylindrical PBR UVs for cloth weave & leather grain.
    """
    buckets = {}
    for i, (p, n) in enumerate(zip(positions, orig_normals)):
        key = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
        buckets.setdefault(key, []).append(n)

    cos_thresh = math.cos(math.radians(68.0 if is_head else 64.0))
    smooth_norms = []
    uvs = []
    for p, n in zip(positions, orig_normals):
        key = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
        sx, sy, sz = 0.0, 0.0, 0.0
        for cn in buckets[key]:
            if n[0] * cn[0] + n[1] * cn[1] + n[2] * cn[2] >= cos_thresh:
                sx += cn[0]
                sy += cn[1]
                sz += cn[2]
        l = math.sqrt(sx * sx + sy * sy + sz * sz)
        if l > 1e-8:
            smooth_norms.append((sx / l, sy / l, sz / l))
        else:
            smooth_norms.append(n)

        mx, my, mz = p[0] * 100.0, p[1] * 100.0, p[2] * 100.0
        ang = math.atan2(mx, -my)
        u = (ang / (2.0 * math.pi) + 0.5) * 2.6
        v = mz * 2.8
        uvs.append((u, v))

    return smooth_norms, uvs


def trim_hair_for_box_braids_under_hat(indices, positions):
    """
    Removes facial-hair beard/mustache AND ALL front/side/temple/forehead straight Quaternius
    hair triangles so ZERO leftover dark hair wedges ever slice across Starkeeper's eye-sides,
    temples, brows, or forehead under the tilted astronomer hat brim!
    Keeps ONLY a neat dark back-of-skull scalp cap strictly behind the ears (Head-local z <= -0.025m,
    raw y >= -0.00018) and tucked under the back brim (Head-local y >= +0.113m, raw z >= 0.01700)
    so the back box-braid curtain has zero bald gap from behind.
    """
    kept = []
    for i in range(0, len(indices), 3):
        i0, i1, i2 = indices[i], indices[i + 1], indices[i + 2]
        p0, p1, p2 = positions[i0], positions[i1], positions[i2]
        cz = (p0[2] + p1[2] + p2[2]) / 3.0
        cy = (p0[1] + p1[1] + p2[1]) / 3.0
        # Keep ONLY back-of-head hairline cap strictly behind the ears & above the nape!
        # Head bone sits at raw y = -0.000431, z = +0.015873 (scale=100 -> meters).
        # raw cy < -0.00018 means Head-local z > -0.025m (front/temples/forehead) -> strip 100%!
        if cz < 0.01700 or cy < -0.00018:
            continue
        kept.extend((i0, i1, i2))
    return kept


def make_head_morph_deltas(positions, mat_name):
    """
    Computes 4 expressive facial morph delta arrays [Blink, Determined, Smile, Hurt]
    in Adventurer_Head raw Blender Z-up space (before -90deg X, scale=100):
      X = left(+) / right(-), Y = back(+) / front(-), Z = up(+)
      Eyes live around |x|<=0.0006, y in [-0.0016, -0.0013], z in [0.0168, 0.0171]
      Eyebrows live around |x|<=0.0007, y in [-0.0017, -0.0014], z in [0.0170, 0.0171]
      Mouth/cheeks live on Skin around y < -0.0011, z in [0.0155, 0.0165]
    """
    blink = []
    determined = []
    smile = []
    hurt = []

    is_eye = mat_name == "Eye"
    is_brow = mat_name == "Eyebrows"
    is_skin = mat_name == "Skin"

    for (x, y, z) in positions:
        # 1. Blink: cleanly lower upper eyelid skin over eyeballs & gently flatten eyeball inside lid
        bx, by, bz = 0.0, 0.0, 0.0
        if is_eye:
            bz = (0.01688 - z) * 0.72
            by = 0.00004
        elif is_skin and y < -0.00115 and 0.01690 < z < 0.01716 and 0.00016 < abs(x) < 0.00058:
            lid_w = math.exp(-((abs(x) - 0.00035) / 0.00016) ** 2) * max(0.0, min(1.0, (0.01716 - z) / 0.00022))
            bz = -0.00015 * lid_w
            by = -0.00003 * lid_w
        blink.append((bx, by, bz))

        # 2. Determined: heroic Z-target angled 3D eyebrows & firm brow ridge
        dx, dy, dz = 0.0, 0.0, 0.0
        if is_brow:
            inner_w = max(0.0, 1.0 - abs(x) / 0.00055)
            outer_w = max(0.0, (abs(x) - 0.00036) / 0.00032)
            dz = -0.00014 * inner_w + 0.00005 * outer_w
            dy = -0.00003 * inner_w
        elif is_skin and y < -0.00118 and 0.01698 < z < 0.01730 and abs(x) < 0.00055:
            inner_w = max(0.0, 1.0 - abs(x) / 0.00055)
            dz = -0.00008 * inner_w
            dy = -0.00002 * inner_w
        determined.append((dx, dy, dz))

        # 3. Smile: warm raised brows + lifted sculpted mouth corners & gentle cheek fullness
        sx, sy, sz = 0.0, 0.0, 0.0
        if is_brow:
            sz = 0.00008
        elif is_skin and y < -0.00115 and 0.01590 < z < 0.01668 and 0.00012 < abs(x) < 0.00072:
            lip_corner = math.exp(-((z - 0.01616) / 0.00016) ** 2) * math.exp(-((abs(x) - 0.00030) / 0.00016) ** 2)
            cheek_w = math.exp(-((z - 0.01645) / 0.00024) ** 2) * math.exp(-((abs(x) - 0.00046) / 0.00022) ** 2)
            sx = math.copysign(0.00004 * lip_corner, x)
            sy = 0.00004 * lip_corner - 0.00003 * cheek_w
            sz = 0.00011 * lip_corner + 0.00007 * cheek_w
        smile.append((sx, sy, sz))

        # 4. Hurt: wincing squinted eyes + furrowed inner brows + tightened mouth
        hx, hy, hz = 0.0, 0.0, 0.0
        if is_eye:
            hz = (0.01688 - z) * 0.55
        elif is_brow:
            inner_w = max(0.0, 1.0 - abs(x) / 0.00052)
            outer_w = max(0.0, (abs(x) - 0.00034) / 0.00036)
            hz = 0.00010 * inner_w - 0.00009 * outer_w
        elif is_skin and y < -0.00115 and 0.01592 < z < 0.01660 and abs(x) < 0.00058:
            w = math.exp(-((z - 0.01618) / 0.00022) ** 2)
            hy = 0.00004 * w
            hz = -0.00007 * w
        hurt.append((hx, hy, hz))

    return [blink, determined, smile, hurt]


def world_delta_to_local_quat(tgt_world, tgt_parent, node_idx, world_delta_q):
    """
    Applies a desired world-space rotation `world_delta_q` (in Y-up, +Z forward, +X left)
    to target bone `node_idx` relative to its parent's current orientation:
      q_local = conj(R_tgt_parent) * world_delta_q * R_tgt_bone
    At world_delta_q = identity, returns exact rest local rotation of node_idx!
    """
    _, r_bone, _ = tgt_world[node_idx]
    p_idx = tgt_parent.get(node_idx)
    r_parent = tgt_world[p_idx][1] if p_idx is not None else (0.0, 0.0, 0.0, 1.0)
    return qnorm(qmul(qconj(r_parent), qmul(world_delta_q, r_bone)))


def add_anim_to_gltf(animations, bb, name, track_times, rot_tracks, trans_tracks=None):
    """Appends one Animation object into `animations`, encoding all tracks cleanly into `bb`.
    Supports either uniform `track_times` (when values are plain lists) or per-channel `(tlist, vals)` tuples.
    Asserts exact input/output count parity on every channel (prevents Three.js r128 Interpolant infinite loops!).
    """
    samplers = []
    channels = []
    time_cache = {}

    def get_t_acc(tlist):
        key = (len(tlist), round(tlist[0], 5), round(tlist[-1], 5))
        if key not in time_cache:
            time_cache[key] = bb.add_float_accessor(tlist, "SCALAR", with_minmax=True)
        return time_cache[key]

    for node_idx, entry in rot_tracks.items():
        if isinstance(entry, tuple) and len(entry) == 2 and isinstance(entry[0], list):
            tlist, quats = entry
        else:
            tlist, quats = track_times, entry
        assert len(tlist) == len(quats), f"{name} rot node {node_idx}: {len(tlist)} times != {len(quats)} quats"
        # Enforce shortest-arc hemisphere continuity across consecutive keyframes
        clean = []
        prev = None
        for q in quats:
            qn = qnorm(q)
            if prev is not None and qdot(prev, qn) < 0.0:
                qn = (-qn[0], -qn[1], -qn[2], -qn[3])
            clean.append(qn)
            prev = qn
        out_acc = bb.add_float_accessor(clean, "VEC4", with_minmax=False)
        s_idx = len(samplers)
        samplers.append({"input": get_t_acc(tlist), "interpolation": "LINEAR", "output": out_acc})
        channels.append({"sampler": s_idx, "target": {"node": node_idx, "path": "rotation"}})

    if trans_tracks:
        for node_idx, entry in trans_tracks.items():
            if isinstance(entry, tuple) and len(entry) == 2 and isinstance(entry[0], list):
                tlist, vecs = entry
            else:
                tlist, vecs = track_times, entry
            assert len(tlist) == len(vecs), f"{name} trans node {node_idx}: {len(tlist)} times != {len(vecs)} vecs"
            out_acc = bb.add_float_accessor(vecs, "VEC3", with_minmax=False)
            s_idx = len(samplers)
            samplers.append({"input": get_t_acc(tlist), "interpolation": "LINEAR", "output": out_acc})
            channels.append({"sampler": s_idx, "target": {"node": node_idx, "path": "translation"}})

    animations.append({"name": name, "channels": channels, "samplers": samplers})


def build_synthesized_clips(animations, bb, adv_nodes, tgt_by_name, tgt_world, tgt_parent, retargeted_store):
    """
    Synthesizes the 10 Blobby Worlds gameplay clips cleanly in Adventurer's exact bone space:
      Backpedal, StrafeLeft, StrafeRight, Melee2, Spin360,
      SlideThrust, HillSlide, PlungeDive, PlungeLand, CastNova
    """
    hips_idx = tgt_by_name["Hips"]
    hips_rest_t = tuple(adv_nodes[hips_idx].get("translation", [0.0, 0.043, 0.9491]))
    root_world_r = tgt_world[tgt_parent[hips_idx]][1]
    root_world_s = tgt_world[tgt_parent[hips_idx]][2]
    inv_sx = 1.0 / (root_world_s[0] or 1.0)
    inv_sy = 1.0 / (root_world_s[1] or 1.0)
    inv_sz = 1.0 / (root_world_s[2] or 1.0)

    def hips_t_world_dy(dy_meters):
        dlocal = qrot(qconj(root_world_r), (0.0, dy_meters, 0.0))
        return (
            hips_rest_t[0] + dlocal[0] * inv_sx,
            hips_rest_t[1] + dlocal[1] * inv_sy,
            hips_rest_t[2] + dlocal[2] * inv_sz,
        )

    def pose_from_world_eulers(euler_map):
        """Returns {node_idx: local_quat} for every bone in euler_map (world YXZ rx, ry, rz)."""
        out = {}
        for bname, (rx, ry, rz) in euler_map.items():
            n_idx = tgt_by_name.get(bname)
            if n_idx is None:
                continue
            w_delta = qeuler_xyz(rx, ry, rz)
            out[n_idx] = world_delta_to_local_quat(tgt_world, tgt_parent, n_idx, w_delta)
        return out

    # Base relaxed arms-down world delta (since Adventurer rest pose is T-pose!)
    # UpperArm.L points +X -> rz = -1.25 lowers it down beside left hip
    # UpperArm.R points -X -> rz = +1.25 lowers it down beside right hip
    def add_keyframed_clip(name, times, key_eulers, hip_dys=None):
        all_bones = set()
        for em in key_eulers:
            all_bones.update(em.keys())
        rot_tracks = {tgt_by_name[b]: [] for b in all_bones if b in tgt_by_name}
        for em in key_eulers:
            # Build exact desired absolute world-space delta quaternion for every keyed bone
            w_by_node = {}
            for b in all_bones:
                if b not in tgt_by_name:
                    continue
                rx, ry, rz = em.get(b, (0.0, 0.0, 0.0))
                w_by_node[tgt_by_name[b]] = qeuler_xyz(rx, ry, rz)
            # Parent-compensate each bone against its nearest animated ancestor so parent & child world
            # deltas NEVER compound/multiply across Hips->Torso->Chest->Arm->Hand chains!
            for b in all_bones:
                if b not in tgt_by_name:
                    continue
                n_idx = tgt_by_name[b]
                w_n = w_by_node[n_idx]
                p_idx = tgt_parent.get(n_idx)
                anc = p_idx
                w_anc = (0.0, 0.0, 0.0, 1.0)
                while anc is not None:
                    if anc in w_by_node:
                        w_anc = w_by_node[anc]
                        break
                    anc = tgt_parent.get(anc)
                _, r_bone, _ = tgt_world[n_idx]
                r_parent = tgt_world[p_idx][1] if p_idx is not None else (0.0, 0.0, 0.0, 1.0)
                q_local = qnorm(qmul(qconj(r_parent), qmul(qmul(qconj(w_anc), w_n), r_bone)))
                rot_tracks[n_idx].append(q_local)
        trans_tracks = None
        if hip_dys is not None:
            trans_tracks = {hips_idx: [hips_t_world_dy(dy) for dy in hip_dys]}
        add_anim_to_gltf(animations, bb, name, times, rot_tracks, trans_tracks)

    # 1. Backpedal: time-reversed Walk_Loop preserving EACH channel's exact keyframe count & timestamps!
    walk_times, walk_rots, walk_trans = retargeted_store["Walk"]
    dur = walk_times[-1]
    bp_rots = {
        ni: ([max(0.0, round(dur - t, 5)) for t in reversed(tlist)], list(reversed(qs)))
        for ni, (tlist, qs) in walk_rots.items()
    }
    bp_trans = {
        ni: ([max(0.0, round(dur - t, 5)) for t in reversed(tlist)], list(reversed(vs)))
        for ni, (tlist, vs) in walk_trans.items()
    }
    add_anim_to_gltf(animations, bb, "Backpedal", None, bp_rots, bp_trans)

    # 2 & 3. StrafeLeft & StrafeRight: authentic Z-target lateral sidestep cycles!
    # In Three.js Y-up, +Z forward, +X = character's LEFT, -X = character's RIGHT.
    # For downward leg (0,-1,0): rz > 0 swings foot to +X (left); rz < 0 swings foot to -X (right).
    for clip_name, dir_sign in [("StrafeLeft", 1.0), ("StrafeRight", -1.0)]:
        n_steps = 17
        cycle_dur = 0.68
        times = [cycle_dur * i / (n_steps - 1) for i in range(n_steps)]
        frames = []
        dys = []
        for i in range(n_steps):
            ph = 2.0 * math.pi * i / (n_steps - 1)
            sw = math.sin(ph)
            open_l = max(0.0, dir_sign * sw)
            close_l = max(0.0, -dir_sign * sw)
            open_r = max(0.0, -dir_sign * sw)
            close_r = max(0.0, dir_sign * sw)
            lift_l = max(0.0, math.sin(ph + (0.0 if dir_sign > 0 else math.pi) - 0.5))
            lift_r = max(0.0, math.sin(ph + (math.pi if dir_sign > 0 else 0.0) - 0.5))
            dys.append(-0.075 + abs(math.cos(ph)) * 0.032)
            frames.append({
                "Hips": (0.04, dir_sign * 0.24, -dir_sign * 0.04),
                "Abdomen": (0.03, -dir_sign * 0.10, 0.0),
                "Torso": (0.02, -dir_sign * 0.08, 0.0),
                "Chest": (0.01, -dir_sign * 0.06, 0.0),
                "Neck": (-0.08, 0.0, 0.0),
                "Head": (-0.10, 0.0, 0.0),
                "UpperLeg.L": (-0.28 - open_l * 0.16, 0.0, (0.14 + open_l * 0.34 - close_l * 0.14)),
                "LowerLeg.L": (0.42 + lift_l * 0.52, 0.0, 0.0),
                "Foot.L": (-0.12 - lift_l * 0.18, 0.0, -0.08),
                "UpperLeg.R": (-0.28 - open_r * 0.16, 0.0, -(0.14 + open_r * 0.34 - close_r * 0.14)),
                "LowerLeg.R": (0.42 + lift_r * 0.52, 0.0, 0.0),
                "Foot.R": (-0.12 - lift_r * 0.18, 0.0, 0.08),
                "UpperArm.L": (-0.20, 0.20, -1.08 - dir_sign * sw * 0.08),
                "LowerArm.L": (-0.52, 0.32, -0.92),
                "UpperArm.R": (-0.22, -0.18, 1.08 - dir_sign * sw * 0.06),
                "LowerArm.R": (-0.50, -0.30, 0.92),
                "Hand.R": (-0.12, -0.14, 0.88),
            })
        add_keyframed_clip(clip_name, times, frames, dys)

    # 4. Melee1 (0.48s): Wide Far-Right (-X) -> Far-Left (+X) horizontal bo-sweep (100% readable silhouette from behind!)
    # Note: UpperArm.R rest direction is -X (Far-Right): ry=0 is Far-Right, ry=+1.57 is Straight Front (+Z), ry=+2.55 is Far-Left (+X)!
    m1_times = [0.0, 0.09, 0.19, 0.29, 0.40, 0.48]
    m1_frames = [
        # Enter cleanly from ready guard
        {"Hips": (0.06, -0.18, 0.0), "Torso": (0.06, -0.22, 0.0), "Chest": (0.06, -0.26, 0.0),
         "Neck": (0.0, -0.10, 0.0), "Head": (0.0, 0.0, 0.0),
         "UpperArm.R": (-0.08, 0.32, 0.34), "LowerArm.R": (-0.12, 0.34, 0.28), "Hand.R": (-0.06, 0.36, 0.22),
         "UpperArm.L": (0.04, 0.22, -0.96), "LowerArm.L": (-0.26, 0.18, -0.86),
         "UpperLeg.L": (-0.22, 0.06, 0.08), "LowerLeg.L": (0.34, 0.0, 0.0), "UpperLeg.R": (0.12, -0.06, -0.08), "LowerLeg.R": (0.22, 0.0, 0.0)},
        # Clear anticipation: right arm & glowing lantern drawn WIDE OUT FAR-RIGHT (-X)!
        {"Hips": (0.12, -0.50, 0.0), "Torso": (0.14, -0.58, 0.0), "Chest": (0.14, -0.66, 0.0),
         "Neck": (-0.04, -0.24, 0.0), "Head": (-0.02, -0.06, 0.0),
         "UpperArm.R": (-0.04, -0.22, 0.06), "LowerArm.R": (-0.04, -0.24, 0.04), "Hand.R": (0.0, -0.26, 0.04),
         "UpperArm.L": (-0.04, 0.50, -0.88), "LowerArm.L": (-0.28, 0.42, -0.80),
         "UpperLeg.R": (-0.42, -0.10, -0.10), "LowerLeg.R": (0.60, 0.0, 0.0), "UpperLeg.L": (0.26, 0.08, 0.10), "LowerLeg.L": (0.40, 0.0, 0.0)},
        # Explosive wide horizontal sweep straight across front (+Z) at 100% arm reach!
        {"Hips": (0.16, 0.14, 0.0), "Torso": (0.18, 0.24, 0.0), "Chest": (0.16, 0.34, 0.0),
         "Neck": (-0.04, 0.12, 0.0), "Head": (-0.02, 0.0, 0.0),
         "UpperArm.R": (-0.06, 1.54, 0.02), "LowerArm.R": (-0.02, 1.57, 0.01), "Hand.R": (0.0, 1.60, 0.01),
         "UpperArm.L": (0.36, -0.44, -0.74), "LowerArm.L": (0.14, -0.42, -0.66),
         "UpperLeg.L": (-0.64, 0.08, 0.10), "LowerLeg.L": (0.76, 0.0, 0.0), "UpperLeg.R": (0.36, -0.08, -0.10), "LowerLeg.R": (0.48, 0.0, 0.0)},
        # Full-extension follow-through WIDE OUT FAR-LEFT (+X, deep martial lunge!)
        {"Hips": (0.14, 0.56, 0.0), "Torso": (0.14, 0.68, 0.0), "Chest": (0.12, 0.76, 0.0),
         "Neck": (-0.04, 0.28, 0.0), "Head": (-0.02, 0.08, 0.0),
         "UpperArm.R": (-0.08, 2.52, -0.10), "LowerArm.R": (-0.06, 2.56, -0.08), "Hand.R": (0.0, 2.58, -0.06),
         "UpperArm.L": (0.48, -0.64, -0.64), "LowerArm.L": (0.18, -0.62, -0.58),
         "UpperLeg.L": (-0.58, 0.08, 0.10), "LowerLeg.L": (0.70, 0.0, 0.0), "UpperLeg.R": (0.34, -0.08, -0.10), "LowerLeg.R": (0.46, 0.0, 0.0)},
        # Bold extended pose hold so the player clearly reads the entire sweep!
        {"Hips": (0.12, 0.50, 0.0), "Torso": (0.12, 0.60, 0.0), "Chest": (0.10, 0.68, 0.0),
         "Neck": (-0.03, 0.24, 0.0), "Head": (-0.02, 0.06, 0.0),
         "UpperArm.R": (-0.08, 2.44, -0.14), "LowerArm.R": (-0.08, 2.48, -0.12), "Hand.R": (0.0, 2.50, -0.10),
         "UpperArm.L": (0.42, -0.56, -0.70), "LowerArm.L": (0.12, -0.52, -0.64),
         "UpperLeg.L": (-0.52, 0.06, 0.09), "LowerLeg.L": (0.64, 0.0, 0.0), "UpperLeg.R": (0.30, -0.06, -0.09), "LowerLeg.R": (0.40, 0.0, 0.0)},
        # Poised end-frame (clamped cleanly during smooth fadeOut -> Idle OR flows straight into Hit 2!)
        {"Hips": (0.10, 0.42, 0.0), "Torso": (0.08, 0.50, 0.0), "Chest": (0.08, 0.56, 0.0),
         "Neck": (-0.02, 0.20, 0.0), "Head": (-0.02, 0.04, 0.0),
         "UpperArm.R": (-0.10, 2.26, -0.20), "LowerArm.R": (-0.10, 2.28, -0.16), "Hand.R": (-0.04, 2.30, -0.14),
         "UpperArm.L": (0.30, -0.40, -0.82), "LowerArm.L": (-0.06, -0.36, -0.76),
         "UpperLeg.L": (-0.42, 0.04, 0.08), "LowerLeg.L": (0.52, 0.0, 0.0), "UpperLeg.R": (0.24, -0.04, -0.08), "LowerLeg.R": (0.34, 0.0, 0.0)},
    ]
    add_keyframed_clip("Melee1", m1_times, m1_frames, [-0.04, -0.10, -0.15, -0.14, -0.12, -0.09])

    # 5. Melee2 (0.56s): High Overhead-Left -> Wide Far-Right (-X) diagonal bo-cleave (flows seamlessly from Hit 1!)
    m2_times = [0.0, 0.11, 0.23, 0.35, 0.47, 0.56]
    m2_frames = [
        # Flows directly out of Hit 1's left-side finish!
        {"Hips": (0.10, 0.42, 0.0), "Torso": (0.08, 0.50, 0.0), "Chest": (0.08, 0.56, 0.0),
         "Neck": (-0.02, 0.20, 0.0), "Head": (-0.02, 0.04, 0.0),
         "UpperArm.R": (-0.10, 2.26, -0.26), "LowerArm.R": (-0.10, 2.28, -0.24), "Hand.R": (-0.04, 2.30, -0.20),
         "UpperArm.L": (0.30, -0.40, -0.82), "LowerArm.L": (-0.06, -0.36, -0.76),
         "UpperLeg.L": (-0.42, 0.04, 0.08), "LowerLeg.L": (0.52, 0.0, 0.0), "UpperLeg.R": (0.24, -0.04, -0.08), "LowerLeg.R": (0.34, 0.0, 0.0)},
        # High overhead-left vault windup (glowing lantern rises HIGH ABOVE the wizard hat!)
        {"Hips": (-0.04, 0.46, 0.0), "Torso": (-0.08, 0.54, 0.0), "Chest": (-0.10, 0.60, 0.0),
         "Neck": (0.0, 0.22, 0.0), "Head": (0.02, 0.06, 0.0),
         "UpperArm.R": (-0.10, 1.92, -1.04), "LowerArm.R": (-0.08, 1.94, -1.08), "Hand.R": (-0.04, 1.96, -1.10),
         "UpperArm.L": (0.20, -0.38, -0.72), "LowerArm.L": (-0.18, -0.34, -0.66),
         "UpperLeg.L": (-0.26, 0.06, 0.08), "LowerLeg.L": (0.36, 0.0, 0.0), "UpperLeg.R": (0.16, -0.06, -0.08), "LowerLeg.R": (0.24, 0.0, 0.0)},
        # Blistering diagonal cleave slicing down-right across front (+Z) at full extension!
        {"Hips": (0.18, -0.14, 0.0), "Torso": (0.22, -0.22, 0.0), "Chest": (0.22, -0.28, 0.0),
         "Neck": (-0.04, -0.10, 0.0), "Head": (-0.02, 0.0, 0.0),
         "UpperArm.R": (0.04, 0.88, -0.06), "LowerArm.R": (0.02, 0.86, -0.04), "Hand.R": (0.0, 0.84, -0.02),
         "UpperArm.L": (0.44, 0.48, -0.66), "LowerArm.L": (0.18, 0.46, -0.58),
         "UpperLeg.R": (-0.66, -0.08, -0.12), "LowerLeg.R": (0.82, 0.0, 0.0), "UpperLeg.L": (0.40, 0.08, 0.12), "LowerLeg.L": (0.54, 0.0, 0.0)},
        # Wide dramatic low-right follow-through (-X, completely opposite Hit 1 and clear past right side!)
        {"Hips": (0.18, -0.56, 0.0), "Torso": (0.20, -0.68, 0.0), "Chest": (0.18, -0.76, 0.0),
         "Neck": (-0.04, -0.28, 0.0), "Head": (-0.02, -0.08, 0.0),
         "UpperArm.R": (0.10, -0.24, 0.18), "LowerArm.R": (0.08, -0.26, 0.16), "Hand.R": (0.04, -0.28, 0.14),
         "UpperArm.L": (0.52, 0.66, -0.58), "LowerArm.L": (0.22, 0.64, -0.52),
         "UpperLeg.R": (-0.62, -0.10, -0.12), "LowerLeg.R": (0.76, 0.0, 0.0), "UpperLeg.L": (0.38, 0.10, 0.12), "LowerLeg.L": (0.52, 0.0, 0.0)},
        # Bold low-right pose hold!
        {"Hips": (0.16, -0.50, 0.0), "Torso": (0.16, -0.60, 0.0), "Chest": (0.14, -0.66, 0.0),
         "Neck": (-0.03, -0.24, 0.0), "Head": (-0.02, -0.06, 0.0),
         "UpperArm.R": (0.08, -0.18, 0.22), "LowerArm.R": (0.06, -0.20, 0.20), "Hand.R": (0.04, -0.22, 0.18),
         "UpperArm.L": (0.44, 0.56, -0.66), "LowerArm.L": (0.16, 0.54, -0.60),
         "UpperLeg.R": (-0.54, -0.08, -0.10), "LowerLeg.R": (0.68, 0.0, 0.0), "UpperLeg.L": (0.32, 0.08, 0.10), "LowerLeg.L": (0.44, 0.0, 0.0)},
        # Poised end-frame (clamped cleanly during smooth fadeOut -> Idle OR coils straight into Hit 3!)
        {"Hips": (0.12, -0.38, 0.0), "Torso": (0.12, -0.44, 0.0), "Chest": (0.10, -0.50, 0.0),
         "Neck": (-0.02, -0.18, 0.0), "Head": (-0.02, -0.04, 0.0),
         "UpperArm.R": (0.04, -0.04, 0.28), "LowerArm.R": (0.02, -0.06, 0.26), "Hand.R": (0.0, -0.08, 0.24),
         "UpperArm.L": (0.32, 0.42, -0.78), "LowerArm.L": (0.02, 0.38, -0.72),
         "UpperLeg.R": (-0.44, -0.06, -0.08), "LowerLeg.R": (0.56, 0.0, 0.0), "UpperLeg.L": (0.24, 0.06, 0.08), "LowerLeg.L": (0.34, 0.0, 0.0)},
    ]
    add_keyframed_clip("Melee2", m2_times, m2_frames, [-0.09, 0.02, -0.16, -0.16, -0.13, -0.10])

    # 6. Spin360 (0.74s): Crouch coil -> HIGH AIRBORNE LEAP (+0.32m!) + Full 360° flying-knee whirlwind -> landed martial horse-stance!
    sp_n = 23
    sp_dur = 0.74
    sp_times = [sp_dur * i / (sp_n - 1) for i in range(sp_n)]
    sp_frames = []
    sp_dys = []
    for i in range(sp_n):
        t = i / (sp_n - 1)
        if t < 0.17:
            # Clear crouch coil anticipation before liftoff (0.00 -> 0.13s)
            u = t / 0.17
            dy = -0.06 - 0.12 * u
            yaw = -0.32 * u
            air_w = 0.0
        elif t < 0.80:
            # High graceful 0.46s airborne full 360° flying-knee whirlwind!
            u = (t - 0.17) / 0.63
            air_w = math.sin(u * math.pi)
            dy = -0.18 + air_w * 0.50  # vaults cleanly from -0.18m crouch up to +0.32m HIGH airborne peak!
            ease = 0.5 - 0.5 * math.cos(u * math.pi)
            yaw = -0.32 + (2.0 * math.pi + 0.32) * ease
        else:
            # Bold 0.15s landed martial horse-stance hold!
            u = (t - 0.80) / 0.20
            air_w = 0.0
            dy = -0.16 + 0.04 * u
            yaw = 2.0 * math.pi
        sp_dys.append(dy)
        arm_reach = 0.0 if air_w > 0.12 else 0.18
        l_knee_up = -0.88 * air_w + (-0.46) * (1.0 - air_w)
        l_shin = 1.32 * air_w + 0.72 * (1.0 - air_w)
        r_thigh = 0.28 * air_w + (-0.38) * (1.0 - air_w)
        r_shin = 0.62 * air_w + 0.64 * (1.0 - air_w)
        sp_frames.append({
            "Hips": (0.10 * (1.0 - 0.35 * air_w), yaw, 0.08 * air_w),
            "Torso": (0.14 * (1.0 - 0.30 * air_w), yaw + 0.24 * air_w, 0.05 * air_w),
            "Chest": (0.16 * (1.0 - 0.25 * air_w), yaw + 0.42 * air_w, 0.0),
            "Neck": (0.04, yaw + 0.42 * air_w, 0.0),
            "Head": (0.0, yaw + 0.42 * air_w, 0.0),
            "UpperArm.R": (0.0, yaw + 0.72, arm_reach),
            "LowerArm.R": (0.0, yaw + 0.76, arm_reach * 0.6),
            "Hand.R": (0.0, yaw + 0.80, arm_reach * 0.4),
            "UpperArm.L": (0.06, yaw - 0.65, -0.22),
            "LowerArm.L": (-0.08, yaw - 0.55, -0.30),
            "UpperLeg.L": (l_knee_up, yaw, 0.20),
            "LowerLeg.L": (l_shin, yaw, 0.0),
            "UpperLeg.R": (r_thigh, yaw, -0.20),
            "LowerLeg.R": (r_shin, yaw, 0.0),
        })
    add_keyframed_clip("Spin360", sp_times, sp_frames, sp_dys)

    # 7. RollStrike (0.46s): Coherent low-to-high rising martial lunge diagonal uppercut cleave with readable high hold!
    rs_times = [0.0, 0.10, 0.22, 0.33, 0.40, 0.46]
    rs_frames = [
        # Deep coiled crouch out of roll/dash
        {"Hips": (0.26, -0.42, 0.0), "Torso": (0.30, -0.48, 0.0), "Chest": (0.28, -0.54, 0.0),
         "Neck": (-0.08, -0.20, 0.0), "Head": (-0.06, -0.06, 0.0),
         "UpperArm.R": (0.14, -0.12, 0.54), "LowerArm.R": (0.08, -0.10, 0.46), "Hand.R": (0.04, -0.08, 0.40),
         "UpperArm.L": (0.22, 0.42, -0.92), "LowerArm.L": (-0.28, 0.34, -0.82),
         "UpperLeg.L": (-0.78, 0.08, 0.10), "LowerLeg.L": (1.12, 0.0, 0.0), "UpperLeg.R": (0.48, -0.08, -0.10), "LowerLeg.R": (0.94, 0.0, 0.0)},
        # Explosive upward drive ripping staff diagonally skyward!
        {"Hips": (-0.06, 0.22, 0.0), "Torso": (-0.10, 0.32, 0.0), "Chest": (-0.14, 0.40, 0.0),
         "Neck": (0.02, 0.14, 0.0), "Head": (0.04, 0.02, 0.0),
         "UpperArm.R": (-0.16, 1.48, -0.44), "LowerArm.R": (-0.12, 1.52, -0.48), "Hand.R": (-0.08, 1.54, -0.50),
         "UpperArm.L": (0.44, -0.52, -0.68), "LowerArm.L": (0.16, -0.50, -0.60),
         "UpperLeg.L": (-0.28, 0.04, 0.08), "LowerLeg.L": (0.34, 0.0, 0.0), "UpperLeg.R": (0.24, -0.04, -0.08), "LowerLeg.R": (0.28, 0.0, 0.0)},
        # Peak high diagonal uppercut cleave follow-through (wide clearance ahead & left!)
        {"Hips": (-0.04, 0.50, 0.0), "Torso": (-0.08, 0.62, 0.0), "Chest": (-0.10, 0.68, 0.0),
         "Neck": (0.0, 0.24, 0.0), "Head": (0.02, 0.06, 0.0),
         "UpperArm.R": (-0.14, 2.26, -0.72), "LowerArm.R": (-0.10, 2.30, -0.68), "Hand.R": (-0.06, 2.32, -0.64),
         "UpperArm.L": (0.50, -0.64, -0.62), "LowerArm.L": (0.18, -0.62, -0.56),
         "UpperLeg.L": (-0.34, 0.04, 0.08), "LowerLeg.L": (0.44, 0.0, 0.0), "UpperLeg.R": (0.26, -0.04, -0.08), "LowerLeg.R": (0.32, 0.0, 0.0)},
        # Bold high cleave pose hold!
        {"Hips": (-0.02, 0.44, 0.0), "Torso": (-0.05, 0.54, 0.0), "Chest": (-0.06, 0.60, 0.0),
         "Neck": (0.0, 0.20, 0.0), "Head": (0.02, 0.04, 0.0),
         "UpperArm.R": (-0.12, 2.14, -0.56), "LowerArm.R": (-0.12, 2.18, -0.52), "Hand.R": (-0.08, 2.20, -0.48),
         "UpperArm.L": (0.38, -0.48, -0.74), "LowerArm.L": (0.02, -0.44, -0.68),
         "UpperLeg.L": (-0.30, 0.02, 0.07), "LowerLeg.L": (0.38, 0.0, 0.0), "UpperLeg.R": (0.22, -0.02, -0.07), "LowerLeg.R": (0.28, 0.0, 0.0)},
        # Controlled transition
        {"Hips": (0.02, 0.24, 0.0), "Torso": (0.02, 0.28, 0.0), "Chest": (0.02, 0.30, 0.0),
         "Neck": (-0.02, 0.10, 0.0), "Head": (-0.02, 0.02, 0.0),
         "UpperArm.R": (-0.12, 1.35, -0.04), "LowerArm.R": (-0.18, 1.30, 0.02), "Hand.R": (-0.08, 1.26, 0.06),
         "UpperArm.L": (0.16, -0.22, -0.98), "LowerArm.L": (-0.26, -0.20, -0.90),
         "UpperLeg.L": (-0.22, 0.0, 0.06), "LowerLeg.L": (0.30, 0.0, 0.0), "UpperLeg.R": (0.14, 0.0, -0.06), "LowerLeg.R": (0.20, 0.0, 0.0)},
        # Settle back into combat stance
        {"Hips": (0.04, 0.08, 0.0), "Torso": (0.03, 0.10, 0.0), "Chest": (0.02, 0.08, 0.0),
         "Neck": (-0.02, 0.02, 0.0), "Head": (-0.02, 0.0, 0.0),
         "UpperArm.R": (-0.20, 0.26, 1.02), "LowerArm.R": (-0.42, 0.18, 0.88), "Hand.R": (-0.10, 0.14, 0.84),
         "UpperArm.L": (-0.08, 0.08, -1.18), "LowerArm.L": (-0.32, 0.08, -1.04),
         "UpperLeg.L": (-0.14, 0.0, 0.04), "LowerLeg.L": (0.20, 0.0, 0.0), "UpperLeg.R": (0.08, 0.0, -0.04), "LowerLeg.R": (0.14, 0.0, 0.0)},
    ]
    add_keyframed_clip("RollStrike", rs_times, rs_frames, [-0.24, 0.04, -0.02, -0.03, -0.05, -0.03])

    # 8. SlideThrust (0.56s): Sustained deep athletic baseball-slide spear lunge driving right arm/staff straight forward (+Z)!
    st_times = [0.0, 0.09, 0.42, 0.56]
    st_frames = [
        {"Hips": (0.08, -0.15, 0.0), "Torso": (0.18, -0.15, 0.0), "Chest": (0.20, -0.15, 0.0),
         "Neck": (-0.08, 0.05, 0.0), "Head": (-0.10, 0.08, 0.0),
         "UpperLeg.L": (-0.75, 0.0, 0.06), "LowerLeg.L": (0.55, 0.0, 0.0), "UpperLeg.R": (0.45, 0.0, -0.06), "LowerLeg.R": (1.10, 0.0, 0.0),
         "UpperArm.R": (0.0, 1.50, 0.08), "LowerArm.R": (0.0, 1.55, 0.03), "Hand.R": (0.0, 1.57, 0.02),
         "UpperArm.L": (0.55, -0.35, -0.75), "LowerArm.L": (0.35, -0.35, -0.85)},
        {"Hips": (-0.14, -0.28, 0.0), "Torso": (0.26, -0.24, 0.0), "Chest": (0.34, -0.20, 0.0),
         "Neck": (-0.14, 0.08, 0.0), "Head": (-0.16, 0.12, 0.0),
         "UpperLeg.L": (-1.26, -0.10, 0.08), "LowerLeg.L": (0.40, 0.0, 0.0), "Foot.L": (-0.30, 0.0, 0.0),
         "UpperLeg.R": (0.80, -0.10, -0.10), "LowerLeg.R": (1.48, 0.0, 0.0), "Foot.R": (0.38, 0.0, 0.0),
         "UpperArm.R": (-0.02, 1.57, 0.02), "LowerArm.R": (-0.02, 1.57, 0.01), "Hand.R": (0.0, 1.57, 0.01),
         "UpperArm.L": (0.82, -0.45, -0.66), "LowerArm.L": (0.44, -0.45, -0.80)},
        {"Hips": (-0.12, -0.24, 0.0), "Torso": (0.22, -0.20, 0.0), "Chest": (0.28, -0.16, 0.0),
         "Neck": (-0.10, 0.06, 0.0), "Head": (-0.12, 0.10, 0.0),
         "UpperLeg.L": (-1.18, -0.08, 0.08), "LowerLeg.L": (0.46, 0.0, 0.0), "Foot.L": (-0.28, 0.0, 0.0),
         "UpperLeg.R": (0.72, -0.08, -0.10), "LowerLeg.R": (1.40, 0.0, 0.0), "Foot.R": (0.34, 0.0, 0.0),
         "UpperArm.R": (-0.02, 1.54, 0.06), "LowerArm.R": (-0.02, 1.55, 0.04), "Hand.R": (0.0, 1.56, 0.03),
         "UpperArm.L": (0.68, -0.35, -0.78), "LowerArm.L": (0.32, -0.35, -0.90)},
        {"Hips": (0.04, -0.06, 0.0), "Torso": (0.08, -0.05, 0.0), "Chest": (0.08, -0.04, 0.0),
         "Neck": (-0.04, 0.02, 0.0), "Head": (-0.04, 0.02, 0.0),
         "UpperLeg.L": (-0.30, 0.0, 0.05), "LowerLeg.L": (0.42, 0.0, 0.0), "UpperLeg.R": (0.18, 0.0, -0.05), "LowerLeg.R": (0.32, 0.0, 0.0),
         "UpperArm.R": (-0.15, 0.55, 0.95), "LowerArm.R": (-0.35, 0.45, 0.85), "Hand.R": (-0.10, 0.40, 0.80),
         "UpperArm.L": (0.12, 0.0, -1.18), "LowerArm.L": (-0.25, 0.0, -1.05)},
    ]
    add_keyframed_clip("SlideThrust", st_times, st_frames, [-0.18, -0.36, -0.34, -0.08])

    # 7. HillSlide: steep-hill surf brace (uphill knee bent deep, downhill leg extended, torso leaned back, arms wide, head steady looking downhill!)
    hs_times = [0.0, 0.35, 0.70]
    hs_pose = lambda sway: {
        "Hips": (-0.14, -0.26, 0.12 + sway * 0.04),
        "Abdomen": (-0.18, -0.26, 0.06),
        "Torso": (-0.24, -0.28, -0.05),
        "Chest": (-0.28, -0.28, -0.08),
        "Neck": (-0.14, -0.14, -0.04),
        "Head": (-0.04, -0.04, 0.0),
        "UpperLeg.R": (-1.02, -0.20, -0.14),
        "LowerLeg.R": (1.44, -0.20, 0.0),
        "Foot.R": (-0.20, -0.20, 0.0),
        "UpperLeg.L": (-0.40, -0.22, 0.16),
        "LowerLeg.L": (0.50, -0.22, 0.0),
        "Foot.L": (-0.32, -0.22, 0.0),
        "UpperArm.L": (0.28, -0.35, -0.42 + sway * 0.08),
        "LowerArm.L": (0.10, -0.35, -0.58 + sway * 0.06),
        "UpperArm.R": (-0.22, 0.25, 0.52 - sway * 0.08),
        "LowerArm.R": (-0.35, 0.25, 0.66 - sway * 0.06),
    }
    add_keyframed_clip("HillSlide", hs_times, [hs_pose(-1.0), hs_pose(1.0), hs_pose(-1.0)], [-0.24, -0.22, -0.24])

    # 8. PlungeDive: heroic overhead meteor dive driving staff downward!
    pd_times = [0.0, 0.14, 0.34]
    pd_frames = [
        {"Hips": (-0.12, 0.0, 0.0), "Torso": (-0.22, 0.0, 0.0), "Chest": (-0.26, 0.0, 0.0),
         "Neck": (-0.06, 0.0, 0.0), "Head": (0.04, 0.0, 0.0),
         "UpperLeg.L": (-0.75, 0.0, 0.08), "LowerLeg.L": (1.25, 0.0, 0.0), "UpperLeg.R": (0.38, 0.0, -0.08), "LowerLeg.R": (0.88, 0.0, 0.0),
         "UpperArm.R": (-0.20, 0.95, -1.25), "LowerArm.R": (-0.25, 0.95, -1.35), "Hand.R": (0.0, 0.95, -1.35),
         "UpperArm.L": (-0.20, -0.85, 1.15), "LowerArm.L": (-0.25, -0.85, 1.25)},
        {"Hips": (0.25, 0.0, 0.0), "Torso": (0.42, 0.0, 0.0), "Chest": (0.50, 0.0, 0.0),
         "Neck": (0.28, 0.0, 0.0), "Head": (0.24, 0.0, 0.0),
         "UpperLeg.L": (-0.62, 0.0, 0.08), "LowerLeg.L": (1.15, 0.0, 0.0), "UpperLeg.R": (0.44, 0.0, -0.08), "LowerLeg.R": (0.78, 0.0, 0.0),
         "UpperArm.R": (0.35, 1.45, 0.52), "LowerArm.R": (0.40, 1.45, 0.58), "Hand.R": (0.42, 1.45, 0.62),
         "UpperArm.L": (0.20, -1.25, -0.65), "LowerArm.L": (0.25, -1.25, -0.75)},
        {"Hips": (0.28, 0.0, 0.0), "Torso": (0.46, 0.0, 0.0), "Chest": (0.54, 0.0, 0.0),
         "Neck": (0.30, 0.0, 0.0), "Head": (0.26, 0.0, 0.0),
         "UpperLeg.L": (-0.64, 0.0, 0.08), "LowerLeg.L": (1.18, 0.0, 0.0), "UpperLeg.R": (0.46, 0.0, -0.08), "LowerLeg.R": (0.80, 0.0, 0.0),
         "UpperArm.R": (0.40, 1.48, 0.58), "LowerArm.R": (0.44, 1.48, 0.64), "Hand.R": (0.46, 1.48, 0.68),
         "UpperArm.L": (0.24, -1.25, -0.65), "LowerArm.L": (0.28, -1.25, -0.75)},
    ]
    add_keyframed_clip("PlungeDive", pd_times, pd_frames, [0.02, -0.06, -0.06])

    # 9. PlungeLand: one-knee crater impact planting staff into ground!
    pl_times = [0.0, 0.16, 0.36]
    pl_frames = [
        {"Hips": (0.20, -0.18, 0.0), "Torso": (0.38, -0.22, 0.0), "Chest": (0.44, -0.24, 0.0),
         "Neck": (0.14, -0.08, 0.0), "Head": (0.04, 0.0, 0.0),
         "UpperLeg.L": (-1.05, 0.0, 0.08), "LowerLeg.L": (1.36, 0.0, 0.0), "UpperLeg.R": (0.50, 0.0, -0.08), "LowerLeg.R": (1.44, 0.0, 0.0),
         "UpperArm.R": (0.35, 1.40, 0.72), "LowerArm.R": (0.35, 1.40, 0.76), "Hand.R": (0.35, 1.40, 0.78),
         "UpperArm.L": (0.32, -0.40, -0.62), "LowerArm.L": (0.12, -0.40, -0.72)},
        {"Hips": (0.18, -0.16, 0.0), "Torso": (0.34, -0.18, 0.0), "Chest": (0.40, -0.20, 0.0),
         "Neck": (0.12, -0.06, 0.0), "Head": (0.02, 0.0, 0.0),
         "UpperLeg.L": (-1.00, 0.0, 0.08), "LowerLeg.L": (1.32, 0.0, 0.0), "UpperLeg.R": (0.46, 0.0, -0.08), "LowerLeg.R": (1.40, 0.0, 0.0),
         "UpperArm.R": (0.32, 1.38, 0.74), "LowerArm.R": (0.32, 1.38, 0.78), "Hand.R": (0.32, 1.38, 0.80),
         "UpperArm.L": (0.28, -0.38, -0.66), "LowerArm.L": (0.10, -0.38, -0.76)},
        {"Hips": (0.06, -0.05, 0.0), "Torso": (0.10, -0.06, 0.0), "Chest": (0.10, -0.06, 0.0),
         "Neck": (0.02, 0.0, 0.0), "Head": (0.0, 0.0, 0.0),
         "UpperLeg.L": (-0.34, 0.0, 0.05), "LowerLeg.L": (0.46, 0.0, 0.0), "UpperLeg.R": (0.16, 0.0, -0.05), "LowerLeg.R": (0.34, 0.0, 0.0),
         "UpperArm.R": (0.05, 0.45, 0.98), "LowerArm.R": (-0.25, 0.40, 0.90), "Hand.R": (-0.10, 0.35, 0.88),
         "UpperArm.L": (0.05, -0.10, -1.14), "LowerArm.L": (-0.22, -0.10, -1.02)},
    ]
    add_keyframed_clip("PlungeLand", pl_times, pl_frames, [-0.32, -0.28, -0.08])

    # 10. CastNova: radiant staff-skyward burst pose for 360° Constellation Nova!
    cn_times = [0.0, 0.14, 0.30, 0.44]
    cn_frames = [
        {"Hips": (0.06, 0.0, 0.0), "Torso": (-0.08, 0.0, 0.0), "Chest": (-0.12, 0.0, 0.0),
         "Neck": (-0.10, 0.0, 0.0), "Head": (-0.12, 0.0, 0.0),
         "UpperArm.R": (-0.10, 0.45, -0.75), "LowerArm.R": (-0.12, 0.45, -0.95), "Hand.R": (0.0, 0.45, -1.05),
         "UpperArm.L": (-0.10, -0.45, 0.45), "LowerArm.L": (-0.10, -0.45, 0.65)},
        {"Hips": (-0.04, 0.35, 0.0), "Torso": (-0.18, 0.35, 0.0), "Chest": (-0.22, 0.35, 0.0),
         "Neck": (-0.16, 0.10, 0.0), "Head": (-0.18, 0.05, 0.0),
         "UpperArm.R": (-0.15, 0.40, -1.38), "LowerArm.R": (-0.10, 0.40, -1.46), "Hand.R": (0.0, 0.40, -1.48),
         "UpperArm.L": (-0.10, -0.35, -0.35), "LowerArm.L": (-0.10, -0.35, -0.45)},
        {"Hips": (-0.02, 0.25, 0.0), "Torso": (-0.14, 0.25, 0.0), "Chest": (-0.16, 0.25, 0.0),
         "Neck": (-0.12, 0.08, 0.0), "Head": (-0.14, 0.04, 0.0),
         "UpperArm.R": (-0.12, 0.35, -1.25), "LowerArm.R": (-0.10, 0.35, -1.32), "Hand.R": (0.0, 0.35, -1.36),
         "UpperArm.L": (-0.06, -0.25, -0.55), "LowerArm.L": (-0.12, -0.25, -0.68)},
        {"Hips": (0.02, 0.0, 0.0), "Torso": (0.0, 0.0, 0.0), "Chest": (0.0, 0.0, 0.0),
         "Neck": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0),
         "UpperArm.R": (-0.18, 0.25, 1.02), "LowerArm.R": (-0.38, 0.20, 0.90), "Hand.R": (-0.10, 0.15, 0.86),
         "UpperArm.L": (-0.10, 0.0, -1.20), "LowerArm.L": (-0.30, 0.0, -1.05)},
    ]
    add_keyframed_clip("CastNova", cn_times, cn_frames, [-0.04, 0.03, 0.02, 0.0])


def main():
    os.makedirs(ASSETS_DIR, exist_ok=True)
    print("Compiling Quaternius CC0 Modular Fantasy Ranger + Universal Base Character + UAL...")
    assert os.path.exists(RANGER_GLTF_PATH), f"Missing {RANGER_GLTF_PATH}"
    adv = json.load(open(RANGER_GLTF_PATH, "r", encoding="utf-8"))
    adv_bin = open(RANGER_GLTF_PATH.replace(".gltf", ".bin"), "rb").read()
    ual = json.loads(fetch_url(UAL_GLTF_URL).decode("utf-8"))
    ual_bin = fetch_url(UAL_BIN_URL)

    # Rename UBC/Ranger 65-bone nodes cleanly to canonical Starkeeper bone names so rig.js & all 33 clips align 1-to-1!
    for n in adv["nodes"]:
        nm = n.get("name", "")
        if nm in UBC_BONE_RENAME:
            n["name"] = UBC_BONE_RENAME[nm]

    # Compute exact world rest transforms for BOTH skeletons
    tgt_world, tgt_parent = compute_world_poses(adv)
    src_world, src_parent = compute_world_poses(ual)
    tgt_by_name = {n["name"]: i for i, n in enumerate(adv["nodes"]) if n.get("name")}
    src_by_name = {n["name"]: i for i, n in enumerate(ual["nodes"]) if n.get("name")}

    ubc_head_parts, eye_tex_pair = extract_ubc_head_yup()

    # Build clean output glTF JSON + compacted binary buffer
    bb = BinBuilder()
    out_samplers = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
    out_images = []
    out_textures = []

    def embed_tex(img_bytes, mime, name):
        bv_idx = bb.add_raw_view(img_bytes)
        img_idx = len(out_images)
        out_images.append({"bufferView": bv_idx, "mimeType": mime, "name": name})
        tex_idx = len(out_textures)
        out_textures.append({"sampler": 0, "source": img_idx})
        return tex_idx

    # Load & compress Modular Fantasy Ranger + Regular Male Dark PBR textures
    ranger_base_raw = open(os.path.join(RANGER_OUTFIT_DIR, "T_Ranger_BaseColor.png"), "rb").read()
    ranger_norm_raw = open(os.path.join(RANGER_OUTFIT_DIR, "T_Ranger_Normal.png"), "rb").read()
    ranger_orm_raw = open(os.path.join(RANGER_OUTFIT_DIR, "T_Ranger_ORM.png"), "rb").read()
    skin_base_raw = open(os.path.join(RANGER_OUTFIT_DIR, "T_Regular_Male_Dark_BaseColor.png"), "rb").read()
    skin_norm_raw = open(os.path.join(RANGER_OUTFIT_DIR, "T_Regular_Male_Normal.png"), "rb").read()

    ranger_col_tex = embed_tex(*restyle_ranger_albedo(ranger_base_raw, 512, 88), "Ranger_Starkeeper_Albedo")
    ranger_nrm_tex = embed_tex(*encode_image_bytes(ranger_norm_raw, 256, "PNG"), "Ranger_Normal")
    ranger_orm_tex = embed_tex(*encode_image_bytes(ranger_orm_raw, 256, "JPEG", 86), "Ranger_ORM")
    skin_col_tex = embed_tex(*encode_image_bytes(skin_base_raw, 512, "JPEG", 88), "UBC_Face_Dark")
    skin_nrm_tex = embed_tex(*encode_image_bytes(skin_norm_raw, 256, "PNG"), "UBC_Face_Normal")
    eye_col_tex = embed_tex(*eye_tex_pair, "UBC_Eye_Brown")

    # 5 clean PBR materials:
    #   0: MI_Ranger (celestial midnight-indigo & sea-teal cloth, stitched leather, gold buckles + normal + ORM)
    #   1: Skin (unified hand-painted Regular Male Dark skin + normal for face, neck, and 5-finger hands!)
    #   2: Eye (hand-painted warm brown irises + catchlights)
    #   3: Eyebrows (dark espresso 3D sculpted brows)
    #   4: Hair (dark espresso back-of-head hairline cap behind ears)
    out_materials = [
        {
            "name": "MI_Ranger",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": ranger_col_tex},
                "metallicRoughnessTexture": {"index": ranger_orm_tex},
                "metallicFactor": 0.9,
                "roughnessFactor": 0.95,
            },
            "normalTexture": {"index": ranger_nrm_tex, "scale": 0.85},
        },
        {
            "name": "Skin",
            "doubleSided": False,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": skin_col_tex},
                "metallicFactor": 0.02,
                "roughnessFactor": 0.56,
            },
            "normalTexture": {"index": skin_nrm_tex, "scale": 0.72},
        },
        {
            "name": "Eye",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": eye_col_tex},
                "metallicFactor": 0.06,
                "roughnessFactor": 0.14,
            },
        },
        {
            "name": "Eyebrows",
            "pbrMetallicRoughness": {"baseColorFactor": [0.06, 0.04, 0.025, 1.0], "metallicFactor": 0.02, "roughnessFactor": 0.64},
        },
        {
            "name": "Hair",
            "pbrMetallicRoughness": {"baseColorFactor": [0.07, 0.05, 0.035, 1.0], "metallicFactor": 0.04, "roughnessFactor": 0.58},
        },
    ]

    # Build output meshes: keep all Modular Fantasy Ranger body/belt/pauldron/arms/bracer/legs/boots
    # (stripping unused TEXCOORD_1..4 & COLOR_0..2 for compact GLB!) and replace Hood with UBC Adventurer_Head!
    mesh_remap = {}
    out_meshes = []
    hood_mesh_idx = None
    for mi, m in enumerate(adv["meshes"]):
        m_name = m.get("name", "")
        if "hood" in m_name.lower():
            hood_mesh_idx = mi
            # Replace Hood slot with realistic sculpted UBC Adventurer_Head (Skin + Eyebrows + Eyes + back Hair)
            new_mi = len(out_meshes)
            mesh_remap[mi] = new_mi
            ubc_mat_map = {"Skin": 1, "Eyebrows": 3, "Eye": 2, "Hair": 4}
            head_prims = []
            for part in ubc_head_parts:
                np = {
                    "mode": 4,
                    "material": ubc_mat_map[part["mat_key"]],
                    "indices": bb.add_ushort_accessor(part["idx"], target=34963),
                    "attributes": {
                        "POSITION": bb.add_float_accessor(part["pos"], "VEC3", with_minmax=True, target=34962),
                        "NORMAL": bb.add_float_accessor(part["nrm"], "VEC3", with_minmax=False, target=34962),
                        "TEXCOORD_0": bb.add_float_accessor(part["uv"], "VEC2", with_minmax=False, target=34962),
                        "JOINTS_0": bb.add_ubyte4_accessor(part["jnt"], target=34962),
                        "WEIGHTS_0": bb.add_float_accessor(part["wgt"], "VEC4", with_minmax=False, target=34962),
                    },
                }
                deltas_4 = make_head_morph_deltas_yup(part["pos"], part["mat_key"])
                np["targets"] = [
                    {"POSITION": bb.add_float_accessor(d, "VEC3", with_minmax=True, target=34962)}
                    for d in deltas_4
                ]
                head_prims.append(np)
            out_meshes.append({
                "name": "Adventurer_Head",
                "primitives": head_prims,
                "weights": [0.0, 0.0, 0.0, 0.0],
                "extras": {"targetNames": ["Blink", "Determined", "Smile", "Hurt"]},
            })
            continue

        new_mi = len(out_meshes)
        mesh_remap[mi] = new_mi
        new_prims = []
        for p in m["primitives"]:
            pos_vals = read_accessor(adv, adv_bin, p["attributes"]["POSITION"])
            nrm_vals = read_accessor(adv, adv_bin, p["attributes"]["NORMAL"])
            uv_vals = read_accessor(adv, adv_bin, p["attributes"]["TEXCOORD_0"])
            jnt_vals = read_accessor(adv, adv_bin, p["attributes"]["JOINTS_0"])
            wgt_vals = read_accessor(adv, adv_bin, p["attributes"]["WEIGHTS_0"])
            idx_vals = read_accessor(adv, adv_bin, p["indices"])
            # Ground boot soles cleanly at exact y=0.000 (+0.004m shift across Ranger meshes)
            if "feet" in m_name.lower() or "boots" in m_name.lower():
                pos_vals = [(x, max(0.0, y + 0.004), z) for (x, y, z) in pos_vals]
            np = {
                "mode": p.get("mode", 4),
                "material": p.get("material", 0),  # 0=MI_Ranger, 1=Skin (hands!)
                "indices": bb.add_ushort_accessor(idx_vals, target=34963),
                "attributes": {
                    "POSITION": bb.add_float_accessor(pos_vals, "VEC3", with_minmax=True, target=34962),
                    "NORMAL": bb.add_float_accessor(nrm_vals, "VEC3", with_minmax=False, target=34962),
                    "TEXCOORD_0": bb.add_float_accessor(uv_vals, "VEC2", with_minmax=False, target=34962),
                    "JOINTS_0": bb.add_ubyte4_accessor(jnt_vals, target=34962),
                    "WEIGHTS_0": bb.add_float_accessor(wgt_vals, "VEC4", with_minmax=False, target=34962),
                },
            }
            new_prims.append(np)
        out_meshes.append({"name": m_name, "primitives": new_prims})

    # Copy single unified 65-bone skin
    out_skins = []
    for sk in adv["skins"]:
        nsk = {"joints": list(sk["joints"])}
        if "skeleton" in sk:
            nsk["skeleton"] = sk["skeleton"]
        if "inverseBindMatrices" in sk:
            nsk["inverseBindMatrices"] = bb.copy_accessor(adv, adv_bin, sk["inverseBindMatrices"])
        out_skins.append(nsk)

    # Copy all nodes, renaming Hood node cleanly to Adventurer_Head
    out_nodes = []
    for ni, n in enumerate(adv["nodes"]):
        nn = dict(n)
        if "mesh" in nn:
            if nn["mesh"] == hood_mesh_idx:
                nn["name"] = "Adventurer_Head"
            nn["mesh"] = mesh_remap[nn["mesh"]]
        out_nodes.append(nn)

    # Target/source world transforms & bone name tables already computed above
    src_to_tgt = {src_by_name[s]: tgt_by_name[t] for t, s in BONE_MAP.items() if t in tgt_by_name and s in src_by_name}

    # Exact hip rest height ratio for vertical bounce retargeting (scale-agnostic!)
    tgt_hips_idx = tgt_by_name["Hips"]
    src_hips_idx = src_by_name["DEF-hips"]
    hip_ratio = tgt_world[tgt_hips_idx][0][1] / max(0.1, src_world[src_hips_idx][0][1])
    tgt_hips_rest_t = tuple(adv["nodes"][tgt_hips_idx].get("translation", [0.0, 0.043, 0.9491]))
    src_hips_rest_t = tuple(ual["nodes"][src_hips_idx].get("translation", [0.0, 0.0501, 0.9167]))
    src_hips_parent_r = src_world[src_parent[src_hips_idx]][1]
    tgt_hips_parent_r = tgt_world[tgt_parent[tgt_hips_idx]][1]
    tgt_hips_parent_s = tgt_world[tgt_parent[tgt_hips_idx]][2]
    inv_hip_sx = 1.0 / (tgt_hips_parent_s[0] or 1.0)
    inv_hip_sy = 1.0 / (tgt_hips_parent_s[1] or 1.0)
    inv_hip_sz = 1.0 / (tgt_hips_parent_s[2] or 1.0)

    # Retarget 22 UAL clips onto Adventurer's exact 49-bone skeleton!
    ual_anims_by_name = {a["name"]: a for a in ual.get("animations", [])}
    out_animations = []
    retargeted_store = {}

    for ual_name, out_name in UAL_CLIP_MAP:
        src_anim = ual_anims_by_name[ual_name]
        # Gather source tracks mapped to target bones
        rot_tracks = {}
        trans_tracks = {}
        common_times = None

        for ch in src_anim["channels"]:
            src_node = ch["target"].get("node")
            path = ch["target"].get("path")
            if src_node not in src_to_tgt:
                continue
            tgt_node = src_to_tgt[src_node]
            sampler = src_anim["samplers"][ch["sampler"]]
            times = read_accessor(ual, ual_bin, sampler["input"])
            vals = read_accessor(ual, ual_bin, sampler["output"])

            # Downsample very dense 60fps tracks (> 45 frames) by 2x to keep GLB compact (<1.2 MB)
            step = 2 if len(times) > 45 else 1
            idxs = list(range(0, len(times), step))
            if idxs[-1] != len(times) - 1:
                idxs.append(len(times) - 1)
            stimes = [times[k] for k in idxs]
            svals = [vals[k] for k in idxs]
            if common_times is None or len(stimes) == len(common_times):
                common_times = stimes

            if path == "rotation":
                # World-rest-basis similarity transform:
                #   q_tgt(t) = conj(R_tgt_p) * R_src_p * q_src(t) * conj(R_src_b) * R_tgt_b
                r_src_p = src_world[src_parent[src_node]][1] if src_node in src_parent else (0.0, 0.0, 0.0, 1.0)
                r_src_b = src_world[src_node][1]
                r_tgt_p = tgt_world[tgt_parent[tgt_node]][1] if tgt_node in tgt_parent else (0.0, 0.0, 0.0, 1.0)
                r_tgt_b = tgt_world[tgt_node][1]

                q_left = qnorm(qmul(qconj(r_tgt_p), r_src_p))
                q_right = qnorm(qmul(qconj(r_src_b), r_tgt_b))
                out_qs = [qnorm(qmul(q_left, qmul(qnorm(q), q_right))) for q in svals]

                # Skip completely static finger tracks (saves ~35% animation bytes!)
                is_finger = any(k in adv["nodes"][tgt_node]["name"] for k in ("Index", "Middle", "Ring", "Pinky", "Thumb"))
                if is_finger and len(out_qs) > 2:
                    q0 = out_qs[0]
                    if all(abs(qdot(q0, q)) > 0.9998 for q in out_qs):
                        out_qs = [q0] * len(out_qs)
                rot_tracks[tgt_node] = (stimes, out_qs)

            elif path == "translation" and tgt_node == tgt_hips_idx:
                out_ts = []
                for tv in svals:
                    d_src_local = (tv[0] - src_hips_rest_t[0], tv[1] - src_hips_rest_t[1], tv[2] - src_hips_rest_t[2])
                    d_world = qrot(src_hips_parent_r, d_src_local)
                    # Preserve vertical hip bounce/crouch/jump/death cleanly; lock X/Z so physics owns horizontal motion!
                    d_world_locked = (0.0, d_world[1] * hip_ratio, 0.0)
                    d_tgt_local = qrot(qconj(tgt_hips_parent_r), d_world_locked)
                    out_ts.append((
                        tgt_hips_rest_t[0] + d_tgt_local[0] * inv_hip_sx,
                        tgt_hips_rest_t[1] + d_tgt_local[1] * inv_hip_sy,
                        tgt_hips_rest_t[2] + d_tgt_local[2] * inv_hip_sz,
                    ))
                trans_tracks[tgt_node] = (stimes, out_ts)

        # Build samplers/channels (each track uses its own time accessor if lengths differ, else shared)
        samplers = []
        channels = []
        time_cache = {}

        def get_time_acc(tlist):
            key = (len(tlist), round(tlist[0], 5), round(tlist[-1], 5))
            if key not in time_cache:
                time_cache[key] = bb.add_float_accessor(tlist, "SCALAR", with_minmax=True)
            return time_cache[key]

        stored_rots = {}
        stored_trans = {}
        stored_times = common_times
        for ni, (tlist, qlist) in rot_tracks.items():
            clean = []
            prev = None
            for q in qlist:
                qn = qnorm(q)
                if prev is not None and qdot(prev, qn) < 0.0:
                    qn = (-qn[0], -qn[1], -qn[2], -qn[3])
                clean.append(qn)
                prev = qn
            t_acc = get_time_acc(tlist)
            o_acc = bb.add_float_accessor(clean, "VEC4", with_minmax=False)
            s_idx = len(samplers)
            samplers.append({"input": t_acc, "interpolation": "LINEAR", "output": o_acc})
            channels.append({"sampler": s_idx, "target": {"node": ni, "path": "rotation"}})
            stored_rots[ni] = (tlist, clean)
            if len(tlist) >= len(stored_times):
                stored_times = tlist

        for ni, (tlist, vlist) in trans_tracks.items():
            t_acc = get_time_acc(tlist)
            o_acc = bb.add_float_accessor(vlist, "VEC3", with_minmax=False)
            s_idx = len(samplers)
            samplers.append({"input": t_acc, "interpolation": "LINEAR", "output": o_acc})
            channels.append({"sampler": s_idx, "target": {"node": ni, "path": "translation"}})
            stored_trans[ni] = (tlist, vlist)

        out_animations.append({"name": out_name, "channels": channels, "samplers": samplers})
        retargeted_store[out_name] = (stored_times, stored_rots, stored_trans)

    # Synthesize the 10 Blobby Worlds gameplay clips cleanly in Adventurer's bone space
    build_synthesized_clips(out_animations, bb, adv["nodes"], tgt_by_name, tgt_world, tgt_parent, retargeted_store)

    # Pad binary buffer to 4-byte boundary & assemble glTF 2.0 JSON
    bb.pad4()
    out_gltf = {
        "asset": {
            "version": "2.0",
            "generator": "Blobby Worlds build_starkeeper_glb.py (Quaternius CC0)",
        },
        "scene": 0,
        "scenes": [{"name": "StarkeeperScene", "nodes": list(adv["scenes"][0]["nodes"])}],
        "nodes": out_nodes,
        "meshes": out_meshes,
        "skins": out_skins,
        "materials": out_materials,
        "textures": out_textures,
        "images": out_images,
        "samplers": out_samplers,
        "animations": out_animations,
        "accessors": bb.accessors,
        "bufferViews": bb.buffer_views,
        "buffers": [{"byteLength": len(bb.buf)}],
    }

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

    with open(OUT_GLB, "wb") as f:
        f.write(glb)

    b64 = base64.b64encode(bytes(glb)).decode("ascii")
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// Auto-generated file:// dual-mode asset bundle for assets/starkeeper.glb\n")
        f.write("// Never loaded on http:// or https:// (GitHub Pages fetches starkeeper.glb directly).\n")
        f.write('(typeof window !== "undefined" ? window : globalThis).__STARKEEPER_GLB_B64__ = "')
        f.write(b64)
        f.write('";\n')

    print(f"Built {OUT_GLB}: {len(glb) / 1024:.1f} KB, {len(out_animations)} clips, 4 facial morphs")
    print(f"Built {OUT_JS}: {os.path.getsize(OUT_JS) / 1024:.1f} KB (file:// fallback)")


if __name__ == "__main__":
    main()
