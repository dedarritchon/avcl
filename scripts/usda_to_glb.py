#!/usr/bin/env python3
"""Convert Sketchfab USDA terrain export to a single textured GLB."""

from __future__ import annotations

import json
import re
import struct
from pathlib import Path

import numpy as np
from pygltflib import (
    FLOAT,
    GLTF2,
    UNSIGNED_INT,
    Accessor,
    Asset,
    Buffer,
    BufferView,
    Image,
    Material,
    Mesh,
    Node,
    PbrMetallicRoughness,
    Primitive,
    Scene,
    Texture,
    TextureInfo,
)

ROOT = Path(__file__).resolve().parents[1]
USDA = ROOT / "extracted" / "scene.usda"
TEXTURE = ROOT / "extracted" / "0" / "TerrainNodeMaterial_baseColor.jpg"
OUT = ROOT / "public" / "torres.glb"

SCALE = 0.08006405
# USDA declares upAxis = "Y"; only apply the Sketchfab root scale.


def parse_float_array(line: str) -> np.ndarray:
    payload = line.split("=", 1)[1]
    nums = re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", payload)
    return np.asarray([float(n) for n in nums], dtype=np.float32)


def parse_int_array(line: str) -> np.ndarray:
    payload = line.split("=", 1)[1]
    nums = re.findall(r"[-+]?\d+", payload)
    return np.asarray([int(n) for n in nums], dtype=np.int32)


def triangulate(counts: np.ndarray, indices: np.ndarray) -> np.ndarray:
    out: list[int] = []
    cursor = 0
    for c in counts:
        face = indices[cursor : cursor + c]
        cursor += c
        if c < 3:
            continue
        for i in range(1, c - 1):
            out.extend((int(face[0]), int(face[i]), int(face[i + 1])))
    return np.asarray(out, dtype=np.uint32)


def load_meshes(path: Path):
    meshes = []
    current = None
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            s = line.strip()
            if s.startswith("def Mesh "):
                if current and "points" in current and current.get("material") != "AdornmentsMaterial":
                    meshes.append(current)
                name = s.split('"')[1]
                current = {"name": name}
            elif current is None:
                continue
            elif s.startswith("rel material:binding"):
                current["material"] = "AdornmentsMaterial" if "Adornments" in s else "Terrain"
            elif s.startswith("int[] faceVertexCounts"):
                current["counts"] = parse_int_array(s)
            elif s.startswith("int[] faceVertexIndices"):
                current["indices"] = parse_int_array(s)
            elif s.startswith("point3f[] points"):
                current["points"] = parse_float_array(s).reshape(-1, 3)
            elif s.startswith("normal3f[] normals"):
                current["normals"] = parse_float_array(s).reshape(-1, 3)
            elif s.startswith("texCoord2f[]"):
                current["uvs"] = parse_float_array(s).reshape(-1, 2)
    if current and "points" in current and current.get("material") != "AdornmentsMaterial":
        meshes.append(current)
    return meshes


def transform_points(pts: np.ndarray) -> np.ndarray:
    return (pts * SCALE).astype(np.float32)


def transform_normals(nrms: np.ndarray) -> np.ndarray:
    lengths = np.linalg.norm(nrms, axis=1, keepdims=True)
    lengths = np.maximum(lengths, 1e-8)
    return (nrms / lengths).astype(np.float32)


def main() -> None:
    print("Parsing USDA…")
    meshes = load_meshes(USDA)
    print(f"Terrain meshes: {len(meshes)}")

    positions = []
    normals = []
    uvs = []
    indices = []
    vertex_offset = 0

    for m in meshes:
        pts = transform_points(m["points"])
        nrms = transform_normals(m.get("normals", np.zeros_like(m["points"])))
        uv = m.get("uvs")
        if uv is None:
            uv = np.zeros((len(pts), 2), dtype=np.float32)
        tris = triangulate(m["counts"], m["indices"]) + vertex_offset

        positions.append(pts)
        normals.append(nrms)
        uvs.append(uv.astype(np.float32))
        indices.append(tris)
        vertex_offset += len(pts)
        print(f"  {m['name']}: {len(pts)} verts, {len(tris)//3} tris")

    pos = np.concatenate(positions, axis=0)
    nrm = np.concatenate(normals, axis=0)
    uv = np.concatenate(uvs, axis=0)
    idx = np.concatenate(indices, axis=0)

    print(f"Total: {len(pos)} verts, {len(idx)//3} tris")

    # Build binary blob: indices, positions, normals, uvs, image
    idx_bytes = idx.astype("<u4").tobytes()
    pos_bytes = pos.astype("<f4").tobytes()
    nrm_bytes = nrm.astype("<f4").tobytes()
    uv_bytes = uv.astype("<f4").tobytes()
    image_bytes = TEXTURE.read_bytes()

    def pad4(b: bytes) -> bytes:
        return b + (b"\x00" * ((4 - (len(b) % 4)) % 4))

    blob = b"".join(
        [
            pad4(idx_bytes),
            pad4(pos_bytes),
            pad4(nrm_bytes),
            pad4(uv_bytes),
            pad4(image_bytes),
        ]
    )

    # Offsets after padding
    o = 0
    idx_off, idx_len = o, len(idx_bytes)
    o += len(pad4(idx_bytes))
    pos_off, pos_len = o, len(pos_bytes)
    o += len(pad4(pos_bytes))
    nrm_off, nrm_len = o, len(nrm_bytes)
    o += len(pad4(nrm_bytes))
    uv_off, uv_len = o, len(uv_bytes)
    o += len(pad4(uv_bytes))
    img_off, img_len = o, len(image_bytes)

    mins = pos.min(axis=0).tolist()
    maxs = pos.max(axis=0).tolist()

    gltf = GLTF2(
        asset=Asset(version="2.0", generator="varela-usda-to-glb"),
        scene=0,
        scenes=[Scene(nodes=[0])],
        nodes=[Node(mesh=0, name="TorresDelPaine")],
        meshes=[
            Mesh(
                name="Terrain",
                primitives=[
                    Primitive(
                        attributes={"POSITION": 1, "NORMAL": 2, "TEXCOORD_0": 3},
                        indices=0,
                        material=0,
                    )
                ],
            )
        ],
        materials=[
            Material(
                name="Terrain",
                pbrMetallicRoughness=PbrMetallicRoughness(
                    baseColorTexture=TextureInfo(index=0),
                    metallicFactor=0.05,
                    roughnessFactor=0.9,
                ),
                doubleSided=True,
            )
        ],
        textures=[Texture(source=0)],
        images=[Image(bufferView=4, mimeType="image/jpeg", name="baseColor")],
        accessors=[
            Accessor(
                bufferView=0,
                componentType=UNSIGNED_INT,
                count=len(idx),
                type="SCALAR",
                max=[int(idx.max())],
                min=[int(idx.min())],
            ),
            Accessor(
                bufferView=1,
                componentType=FLOAT,
                count=len(pos),
                type="VEC3",
                max=maxs,
                min=mins,
            ),
            Accessor(
                bufferView=2,
                componentType=FLOAT,
                count=len(nrm),
                type="VEC3",
            ),
            Accessor(
                bufferView=3,
                componentType=FLOAT,
                count=len(uv),
                type="VEC2",
            ),
        ],
        bufferViews=[
            BufferView(buffer=0, byteOffset=idx_off, byteLength=idx_len, target=34963),
            BufferView(buffer=0, byteOffset=pos_off, byteLength=pos_len, target=34962),
            BufferView(buffer=0, byteOffset=nrm_off, byteLength=nrm_len, target=34962),
            BufferView(buffer=0, byteOffset=uv_off, byteLength=uv_len, target=34962),
            BufferView(buffer=0, byteOffset=img_off, byteLength=img_len),
        ],
        buffers=[Buffer(byteLength=len(blob))],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)

    # Write GLB manually for reliability with large buffers
    json_str = gltf.to_json()
    # Embed buffer via GLB chunk rather than URI
    json_dict = json.loads(json_str)
    json_dict["buffers"][0] = {"byteLength": len(blob)}
    json_bytes = json.dumps(json_dict, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - (len(json_bytes) % 4)) % 4)

    total_len = 12 + 8 + len(json_bytes) + 8 + len(blob)
    with OUT.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(blob)

    print(f"Wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")
    print(f"Bounds: {mins} → {maxs}")


if __name__ == "__main__":
    main()
