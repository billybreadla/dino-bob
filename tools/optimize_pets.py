#!/usr/bin/env python3
"""
Retopo heroes — optimize pet GLBs from ~50k → ~4k tris with proper normals/UVs.

Mirrors the studio rig pattern from tools/model_toys.py:
  clear_scene  →  setup_render (EEVEE, Transparent, Standard, exposure 0.35)
  setup_camera (Ortho)  etc.  The studio state is cleared per file so exports
  are deterministic and mobile-friendly.

Usage (Blender headless, preferred):
    blender -b --python tools/optimize_pets.py -- <in.glb> [<out.glb>] [...]
    blender -b --python tools/optimize_pets.py -- assets/models/pet_ptero.glb assets/models/pet_ptero.glb
    # batch all three (no args = discover all assets/models/pet_*.glb):
    blender -b --python tools/optimize_pets.py

Fallback (outside Blender, bpy missing):
    python3 tools/optimize_pets.py
    -> reports what would be done and exits 0 (no file write, at least documents pipeline).

Pipeline per GLB:
  1  bpy.ops.import_scene.gltf(filepath=...)
  2  Join all MESH objects into one
  3  Ensure PBR material (metalness 0.05 roughness 0.85, vertex COLOR_0 → Base Color)
  4  Decimate modifier ratio ~0.08 COLLAPSE + triangulate  → 50k → ~4k
  5  shade_smooth()
  6  uv.smart_project(angle_limit=66, island_margin=0.02)
  7  recalc normals (normals_make_consistent + calc_normals_split)
  8  export GLB with Draco level 7, normals+uvs+colors
"""

import os
import sys
import pathlib

# ---------------------------------------------------------------- fallback
try:
    import bpy
    HAS_BPY = True
except Exception as e:  # noqa: BLE001
    HAS_BPY = False
    _bpy_err = e

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "assets" / "models"

TARGET_TRIS = 4000
DECIMATE_RATIO = 0.08  # spec: 50k → ~4k


# ───────────────────────────────────────────────────────── studio rig (mirrors model_toys.py)
def clear_scene():
    # factory empty is the cheapest deterministic clear
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            sc.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    sc.render.film_transparent = True
    # Standard keeps albedo punchy (AgX mutes to pastel)
    try:
        sc.view_settings.view_transform = "Standard"
    except Exception:
        pass
    try:
        sc.view_settings.exposure = 0.35
    except Exception:
        pass
    # keep resolution neutral — we are exporting, not rendering
    sc.render.resolution_x = 1024
    sc.render.resolution_y = 1024
    sc.render.resolution_percentage = 100


def setup_camera(ortho_scale=4.0):
    import math
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    cam_ob = bpy.data.objects.new("cam", cam_data)
    cam_ob.location = (0, -10, 1.8)
    cam_ob.rotation_euler = (math.radians(80), 0, 0)
    bpy.context.collection.objects.link(cam_ob)
    bpy.context.scene.camera = cam_ob
    return cam_ob


def ensure_gltf_addon():
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        pass


# ───────────────────────────────────────────────────────── helpers
def _safe_op(op, *a, **kw):
    try:
        return op(*a, **kw)
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] {op} failed: {e}")
        return None


def _ensure_pbr_material(obj):
    """Ensure obj has a Principled PBR mat: metalness 0.05 roughness 0.85.
    Routes COLOR_0 vertex color into Base Color so GLB still looks correct
    without the game3d.js hack (though that hack stays as safety)."""
    mesh = obj.data
    # If no material at all, create one
    if not mesh.materials or mesh.materials[0] is None:
        mat = bpy.data.materials.new(name="pet_pbr")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            if "Base Color" in bsdf.inputs:
                bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.85
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.05
            for spec_name in ("Specular IOR Level", "Specular"):
                if spec_name in bsdf.inputs:
                    bsdf.inputs[spec_name].default_value = 0.12
                    break
        # Route COLOR_0 → Base Color (Attribute node is portable across Blender versions)
        try:
            nt = mat.node_tree
            nodes, links = nt.nodes, nt.links
            # Prefer Attribute; fall back to VertexColor
            attr = None
            try:
                attr = nodes.new("ShaderNodeAttribute")
                attr.attribute_name = "COLOR_0"
                # attribute_type enum: GEOMETRY vs INSTANCER, but default GEOMETRY
                if hasattr(attr, "attribute_type"):
                    try:
                        attr.attribute_type = "GEOMETRY"
                    except Exception:
                        pass
                print(f"  material {mat.name}: added Attribute(COLOR_0) → Base Color")
            except Exception:
                try:
                    attr = nodes.new("ShaderNodeVertexColor")
                    attr.layer_name = "COLOR_0"
                    print(f"  material {mat.name}: added VertexColor(COLOR_0) → Base Color")
                except Exception as e2:
                    print(f"  [warn] could not add color attribute node: {e2}")
                    attr = None
            if attr and bsdf and "Base Color" in bsdf.inputs:
                # Remove potential duplicate links? just add
                try:
                    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
                except Exception:
                    try:
                        links.new(attr.outputs[0], bsdf.inputs["Base Color"])
                    except Exception as e3:
                        print(f"  [warn] link COLOR_0 failed: {e3}")
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] PBR color routing failed: {e}")
        mesh.materials.append(mat)
        return mat
    else:
        # Tune existing mats to correct PBR (so even trimesh-sourced GLBs look right)
        for mat in list(mesh.materials):
            if mat is None or not mat.use_nodes:
                continue
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if not bsdf:
                continue
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.85
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.05
            for spec_name in ("Specular IOR Level", "Specular"):
                if spec_name in bsdf.inputs:
                    bsdf.inputs[spec_name].default_value = 0.12
                    break
            # ensure COLOR_0 routing exists if mesh has color attribute
            has_color = False
            try:
                # Blender 3.2+ color_attributes, older: vertex_colors
                if hasattr(mesh, "color_attributes") and mesh.color_attributes:
                    has_color = any(a.name == "COLOR_0" for a in mesh.color_attributes)
                if not has_color and hasattr(mesh, "vertex_colors") and mesh.vertex_colors:
                    has_color = any(vc.name == "COLOR_0" for vc in mesh.vertex_colors)
                if not has_color:
                    # also check generic attributes
                    if hasattr(mesh, "attributes") and "COLOR_0" in mesh.attributes:
                        has_color = True
            except Exception:
                has_color = True  # assume yes, try to route
            if has_color:
                # check if already routed
                already = False
                for n in mat.node_tree.nodes:
                    if n.type == "ATTRIBUTE" and getattr(n, "attribute_name", "") == "COLOR_0":
                        already = True
                    if n.type == "VERTEX_COLOR" and getattr(n, "layer_name", "") == "COLOR_0":
                        already = True
                if not already:
                    try:
                        nt = mat.node_tree
                        nodes, links = nt.nodes, nt.links
                        attr = nodes.new("ShaderNodeAttribute")
                        attr.attribute_name = "COLOR_0"
                        if hasattr(attr, "attribute_type"):
                            try:
                                attr.attribute_type = "GEOMETRY"
                            except Exception:
                                pass
                        links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
                        print(f"  material {mat.name}: routed existing COLOR_0 → Base Color")
                    except Exception as e:  # noqa: BLE001
                        print(f"  [warn] routing COLOR_0 for {mat.name} failed: {e}")
        return mesh.materials[0]


def optimize_one(in_path: pathlib.Path, out_path: pathlib.Path):
    print(f"\n=== {in_path.name} → {out_path.name} ===")
    if not in_path.exists():
        print(f"  [skip] not found: {in_path}")
        return False

    # Backup is responsibility of caller, but also guard: if overwriting, ensure backup exists
    if in_path.resolve() == out_path.resolve():
        backup = in_path.parent / f"backup_{in_path.stem}.glb"
        # legacy name spec mentions backup_ptero.glb — also keep backup_<name>.glb
        legacy = in_path.parent / f"backup_{in_path.stem.split('_')[-1]}.glb"  # e.g. backup_ptero.glb
        for bp in {backup, legacy}:
            if not bp.exists():
                try:
                    import shutil
                    shutil.copy2(in_path, bp)
                    print(f"  backup → {bp.name} ({bp.stat().st_size/1024:.0f} KB)")
                except Exception as e:  # noqa: BLE001
                    print(f"  [warn] backup to {bp} failed: {e}")

    clear_scene()
    setup_render()
    setup_camera(4.0)
    ensure_gltf_addon()

    # Import
    print(f"  import {in_path}")
    # ensure clean select
    _safe_op(bpy.ops.object.select_all, action="DESELECT")
    try:
        bpy.ops.import_scene.gltf(filepath=str(in_path))
    except Exception as e:  # noqa: BLE001
        print(f"  [error] import failed: {e}")
        return False

    mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
    if not mesh_objs:
        print("  [error] no MESH after import")
        return False
    print(f"  imported {len(mesh_objs)} mesh object(s)")

    # Join if multiple
    if len(mesh_objs) > 1:
        _safe_op(bpy.ops.object.select_all, action="DESELECT")
        for o in mesh_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = mesh_objs[0]
        try:
            bpy.ops.object.join()
            print("  joined → 1 mesh")
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] join failed: {e}")
        mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]

    obj = mesh_objs[0] if mesh_objs else bpy.context.active_object
    # Fallback active
    if obj is None or obj.type != "MESH":
        cands = [o for o in bpy.data.objects if o.type == "MESH"]
        obj = cands[0] if cands else None
    if obj is None:
        print("  [error] no mesh object to optimize")
        return False

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    _safe_op(bpy.ops.object.mode_set, mode="OBJECT")

    # Stats before
    try:
        verts_before = len(obj.data.vertices)
        polys_before = len(obj.data.polygons)
        # approximate tris: if no triangulate, polys may be ngons/quads; but source is triangulated
        tris_before = polys_before
        print(f"  before: {verts_before} verts, {tris_before} polys (tris~{tris_before})")
    except Exception:
        verts_before = polys_before = tris_before = 0

    # Clear custom split normals (legacy API name; try both)
    _safe_op(bpy.ops.object.mode_set, mode="OBJECT")
    # bpy 5.x rename: customdata_custom_splitnormals_clear moved / removed
    for op_path in [
        lambda: bpy.ops.mesh.customdata_custom_splitnormals_clear(),
        lambda: _safe_op(bpy.ops.object.mode_set, mode="EDIT") or bpy.ops.mesh.customdata_custom_splitnormals_clear(),
    ]:
        try:
            op_path()
            _safe_op(bpy.ops.object.mode_set, mode="OBJECT")
            break
        except Exception:
            pass
    _safe_op(bpy.ops.object.mode_set, mode="OBJECT")

    # Ensure PBR material (must happen before decimate so material slot survives)
    _ensure_pbr_material(obj)

    # ── Decimate
    # Ratio 0.08 is spec (50k→4k). For non-50k meshes, compute dynamic but clamp near 0.08.
    if tris_before > 8000:
        dynamic = TARGET_TRIS / max(tris_before, 1)
        # clamp so we never go extreme; keep cuteness by not over-collapsing
        dynamic = max(0.05, min(dynamic, 0.18))
        # blend: weighted toward spec so ~50k still ≈0.08
        # If tris_before is 50k, dynamic = 0.08 exactly → use it
        ratio = dynamic
    else:
        ratio = DECIMATE_RATIO
    # Hard spec compliance: if original verts ~50k, ensure ratio ≈0.08
    if 40000 <= verts_before <= 65000:
        ratio = DECIMATE_RATIO
    print(f"  decimate ratio {ratio:.4f} (COLLAPSE, triangulate)")

    mod = obj.modifiers.new(name="decimate_retopo", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    try:
        mod.use_collapse_triangulate = True
    except Exception:
        pass
    # Preserve vertex colors / attributes boundary
    try:
        if hasattr(mod, "use_collapse_seam_weight"):
            mod.use_collapse_seam_weight = False
    except Exception:
        pass

    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print("  modifier applied")
    except Exception as e:  # noqa: BLE001
        print(f"  [error] modifier_apply failed: {e}")
        # try fallback: apply via depsgraph? remove modifier anyway
        try:
            bpy.ops.object.modifier_apply(modifier="decimate_retopo")
        except Exception:
            pass
        return False

    # Stats mid
    try:
        verts_mid = len(obj.data.vertices)
        polys_mid = len(obj.data.polygons)
        print(f"  after decimate: {verts_mid} verts, {polys_mid} polys (tris~{polys_mid})")
    except Exception:
        verts_mid = polys_mid = 0

    # Shade smooth
    _safe_op(bpy.ops.object.shade_smooth)
    # Enable auto smooth equivalent: in Blender 5, shade_smooth auto_smooth is separate
    try:
        # 4.1+: shade_smooth with keep_sharp_edges?
        pass
    except Exception:
        pass

    # ── UV: smart_project angle 66, margin 0.02
    try:
        _safe_op(bpy.ops.object.mode_set, mode="EDIT")
        _safe_op(bpy.ops.mesh.select_all, action="SELECT")
        _safe_op(bpy.ops.uv.smart_project, angle_limit=66, island_margin=0.02)
        print("  UV smart_project done")
        _safe_op(bpy.ops.object.mode_set, mode="OBJECT")
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] UV smart_project failed: {e}")
        _safe_op(bpy.ops.object.mode_set, mode="OBJECT")
        # fallback cube project
        try:
            _safe_op(bpy.ops.object.mode_set, mode="EDIT")
            _safe_op(bpy.ops.mesh.select_all, action="SELECT")
            _safe_op(bpy.ops.uv.cube_project, cube_size=1.0)
            _safe_op(bpy.ops.object.mode_set, mode="OBJECT")
            print("  UV cube_project fallback done")
        except Exception:
            _safe_op(bpy.ops.object.mode_set, mode="OBJECT")

    # ── Mesh cleanup: remove doubles, delete loose, make consistent
    try:
        _safe_op(bpy.ops.object.mode_set, mode="EDIT")
        _safe_op(bpy.ops.mesh.select_all, action="SELECT")
        # merge by distance = old remove_doubles, tolerance 0.0001
        try:
            bpy.ops.mesh.remove_doubles(threshold=0.0001)
        except Exception:
            try:
                _safe_op(bpy.ops.mesh.merge_by_distance)
            except Exception:
                pass
        _safe_op(bpy.ops.mesh.delete_loose, use_verts=True, use_edges=True, use_faces=False)
        _safe_op(bpy.ops.mesh.normals_make_consistent, inside=False)
        _safe_op(bpy.ops.object.mode_set, mode="OBJECT")
        print("  mesh cleanup (merge_by_distance, delete_loose, consistent) done")
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] mesh cleanup failed: {e}")
        _safe_op(bpy.ops.object.mode_set, mode="OBJECT")

    try:
        mesh = obj.data
        # calc_normals_split is still available in 5.2 but may warn
        mesh.calc_normals_split()
        print("  calc_normals_split done")
    except Exception as e:  # noqa: BLE001
        print(f"  [note] calc_normals_split skipped: {e}")

    # Ensure split normals are considered (add custom split normals if op exists)
    try:
        _safe_op(bpy.ops.mesh.customdata_custom_splitnormals_add)
    except Exception:
        pass

    # Final stats
    try:
        verts_final = len(obj.data.vertices)
        polys_final = len(obj.data.polygons)
        has_uv = bool(obj.data.uv_layers)
        uv_count = len(obj.data.uv_layers) if has_uv else 0
        has_color = False
        try:
            if hasattr(obj.data, "color_attributes") and obj.data.color_attributes:
                has_color = len(obj.data.color_attributes) > 0
            elif hasattr(obj.data, "vertex_colors") and obj.data.vertex_colors:
                has_color = len(obj.data.vertex_colors) > 0
            elif hasattr(obj.data, "attributes") and "COLOR_0" in obj.data.attributes:
                has_color = True
        except Exception:
            has_color = True
        print(f"  final: {verts_final} verts, {polys_final} polys, UVs={uv_count}, COLOR_0={has_color}")
    except Exception:
        pass

    # ── Export (Blender 5.2 renamed export_colors → export_vertex_color / export_all_vertex_colors)
    ensure_gltf_addon()
    # Ensure output dir exists
    out_path.parent.mkdir(parents=True, exist_ok=True)
    export_ok = False
    last_err = None
    # Probe which color API the io_scene_gltf2 expects (5.x vs 3.x)
    # We'll try new names first, fall back to legacy export_colors if needed.
    for attempt, use_draco in enumerate([True, False]):
        # Try new 5.2 style first, then legacy
        for color_style in ("new", "legacy"):
            try:
                print(f"  export {'Draco L7' if use_draco else 'no Draco'} ({color_style}) → {out_path}")
                kwargs = dict(
                    filepath=str(out_path),
                    export_format="GLB",
                    export_draco_mesh_compression_enable=use_draco,
                    export_materials="EXPORT",
                    export_normals=True,
                    export_texcoords=True,
                    export_apply=True,
                )
                if color_style == "new":
                    kwargs.update(
                        export_vertex_color="MATERIAL",
                        export_all_vertex_colors=True,
                        export_active_vertex_color_when_no_material=True,
                    )
                else:
                    kwargs.update(export_colors=True)  # type: ignore[arg-type]
                if use_draco:
                    kwargs.update(
                        export_draco_mesh_compression_level=7,
                        export_draco_position_quantization=14,
                        export_draco_normal_quantization=10,
                        export_draco_texcoord_quantization=12,
                        export_draco_color_quantization=10,
                        export_draco_generic_quantization=12,
                    )
                bpy.ops.export_scene.gltf(**kwargs)
                export_ok = True
                print(f"  exported OK ({'draco' if use_draco else 'plain'}, {color_style})")
                break
            except Exception as e:  # noqa: BLE001
                # Only remember last; if unrecognized keyword, try next style
                last_err = e
                msg = str(e)
                is_unknown_kw = "unrecognized" in msg or "export_colors" in msg or "export_vertex_color" in msg
                print(f"  [warn] export attempt {attempt}/{color_style} failed: {e}")
                if is_unknown_kw and color_style == "new":
                    # try legacy without marking draco attempt as failed
                    continue
                # if legacy also failed, break to next draco mode
                if color_style == "legacy":
                    break
        if export_ok:
            break

    if not export_ok:
        print(f"  [error] all exports failed: {last_err}")
        return False

    # Verify file size (Draco L7 compresses ~4.5x, so 65-85KB is ideal for 4k verts; 150-300KB is non-Draco)
    try:
        sz = out_path.stat().st_size
        print(f"  wrote {out_path.name} {sz/1024:.0f} KB ({sz} bytes)")
        if sz < 30_000:
            print("  [warn] suspiciously small — check")
        if sz > 400_000:
            print("  [warn] still large — may need stronger decimate or Draco failed")
        elif sz < 60_000:
            print("  [note] small but plausible with Draco L7")
    except Exception:
        pass

    # Verify GLB attributes quickly (read back JSON chunk)
    try:
        import struct, json
        with open(out_path, "rb") as f:
            magic = f.read(4)
            if magic != b"glTF":
                print("  [warn] exported file is not glTF binary?")
            else:
                _ver = struct.unpack("<I", f.read(4))[0]
                _len = struct.unpack("<I", f.read(4))[0]
                clen = struct.unpack("<I", f.read(4))[0]
                ctype = struct.unpack("<I", f.read(4))[0]
                jdata = f.read(clen)
                j = json.loads(jdata.decode("utf-8"))
                prims = []
                for m in j.get("meshes", []):
                    for p in m.get("primitives", []):
                        prims.append(list(p.get("attributes", {}).keys()))
                has_normal = any("NORMAL" in attrs for attrs in prims)
                has_uv = any("TEXCOORD_0" in attrs for attrs in prims)
                has_color = any("COLOR_0" in attrs for attrs in prims)
                print(f"  verify GLB attrs: NORMAL={has_normal} TEXCOORD_0={has_uv} COLOR_0={has_color} meshs={len(j.get('meshes',[]))}")
                if not has_normal or not has_uv:
                    print("  [warn] missing expected NORMAL/TEXCOORD_0 — THREE.GLTFLoader will still load but shading/UV imperfect")
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] verify failed: {e}")

    return export_ok


def main():
    # Parse argv — Blender inserts '--' before our args.
    # When run as `blender -b --python script.py` without trailing --, there are no user args → auto-discover.
    if "--" in sys.argv:
        raw = sys.argv[sys.argv.index("--") + 1 :]
    else:
        # No '--' means either launched outside Blender (fallback) or Blender with no user args.
        # In Blender, sys.argv contains blender flags; do NOT treat them as files.
        if HAS_BPY:
            raw = []  # auto discover all pet_*.glb
        else:
            raw = sys.argv[1:]

    # No bpy → fallback report (spec #4)
    if not HAS_BPY:
        print("=" * 60)
        print("optimize_pets: bpy not available (outside Blender).")
        print(f"bpy import error: {_bpy_err}")
        print()
        print("What would be done inside Blender for each pet GLB:")
        print("  1  bpy.ops.import_scene.gltf(filepath=...)")
        print("  2  join meshes, ensure mesh.calc_normals() clean")
        print("  3  bpy.ops.mesh.customdata_custom_splitnormals_clear()")
        print("  4  Decimate COLLAPSE ratio 0.08 triangulate → 50k→~4k")
        print("  5  bpy.ops.object.shade_smooth()")
        print("  6  bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)")
        print("  7  mesh.calc_normals_split() / normals_make_consistent")
        print("  8  PBR: metalness 0.05 roughness 0.85, COLOR_0→BaseColor")
        print("  9  bpy.ops.export_scene.gltf(..., draco_level=7, normals=True, texcoords=True, colors=True)")
        print()
        print("To actually run:")
        print("  blender -b --python tools/optimize_pets.py -- assets/models/pet_ptero.glb assets/models/pet_ptero.glb")
        print("  blender -b --python tools/optimize_pets.py   # batch all pets")
        print("=" * 60)
        # Also report current file sizes (informative even without bpy)
        for p in sorted(MODELS_DIR.glob("pet_*.glb")):
            try:
                sz = p.stat().st_size
                print(f"  {p.name}: {sz/1024:.0f} KB ({sz} bytes)")
            except Exception:
                pass
        return 0

    # Has bpy: build file list
    files = []
    if not raw:
        # discover all pet_*.glb
        files = sorted(MODELS_DIR.glob("pet_*.glb"))
        # exclude backups
        files = [p for p in files if not p.name.startswith("backup_")]
        # map each to overwrite itself
        pairs = [(p, p) for p in files]
    else:
        # raw may be: in out in out ... or just list of ins (overwrite)
        # If even count and every second exists as path-like, treat as pairs; else overwrite
        # Heuristic: if len(raw) %2==0 and second element dir exists or .glb → pairs
        # For spec example: "assets/models/pet_ptero.glb assets/models/pet_ptero.glb" = pair
        # Simpler: if even and 2 args per pet in same dir, assume pairs. We'll support both.
        paths = [pathlib.Path(a) for a in raw if a.strip()]
        # resolve relative to ROOT if not absolute
        def resolve(p):
            return p if p.is_absolute() else (ROOT / p)
        if len(paths) % 2 == 0 and len(paths) >= 2:
            # check if treat as pairs: second file's parent exists or extension .glb
            # Use pairs if we see duplicate basename pattern like in spec
            maybe_pairs = True
            # If odd count of distinct names? Just assume pairs when even
            # But single-pair case is ambiguous with 2-file batch overwrite
            # We'll treat even as pairs when len==2 or when first two share same stem pattern in spec
            # Safer: if user passed exactly "in out" they intend overwrite pair; if they passed
            # "pet_a.glb pet_b.glb pet_c.glb" (3 files) they'd expect overwrite each.
            # So: if len ==2 → pair; if len>2 even and many distinct → ambiguous. Use pairs only for 2.
            if len(paths) == 2:
                pairs = [(resolve(paths[0]), resolve(paths[1]))]
            else:
                # for >2 even, assume overwrite each (most intuitive for batch)
                pairs = [(resolve(p), resolve(p)) for p in paths]
        else:
            pairs = [(resolve(p), resolve(p)) for p in paths]
        # filter to .glb only
        pairs = [(i, o) for i, o in pairs if i.suffix.lower() == ".glb"]

    if not pairs:
        print("No GLB files to process. Usage:")
        print("  blender -b --python tools/optimize_pets.py -- assets/models/pet_ptero.glb assets/models/pet_ptero.glb")
        print("  blender -b --python tools/optimize_pets.py   # auto all pets")
        return 1

    print(f"optimize_pets: {len(pairs)} file(s) with bpy {bpy.app.version_string}")
    ok = 0
    fail = 0
    for inp, out in pairs:
        try:
            if optimize_one(inp, out):
                ok += 1
            else:
                fail += 1
        except Exception as e:  # noqa: BLE001
            import traceback
            print(f"[error] {inp} → {out}: {e}")
            traceback.print_exc()
            fail += 1

    print("\n" + "=" * 60)
    print(f"Done: {ok} ok, {fail} failed")
    # ls -lh style summary
    try:
        for p in sorted(MODELS_DIR.glob("*.glb")):
            sz = p.stat().st_size
            # quick GLB verify summary
            attrs_summary = ""
            try:
                import struct, json
                with open(p, "rb") as f:
                    if f.read(4) == b"glTF":
                        f.read(8)
                        clen = struct.unpack("<I", f.read(4))[0]
                        f.read(4)
                        j = json.loads(f.read(clen).decode("utf-8"))
                        prims = []
                        for m in j.get("meshes", []):
                            for pr in m.get("primitives", []):
                                prims.append(set(pr.get("attributes", {}).keys()))
                        # union
                        u = set().union(*prims) if prims else set()
                        attrs_summary = ",".join(sorted(u)) if u else "-"
            except Exception:
                pass
            print(f"  {p.name:22s} {sz/1024:6.0f} KB  [{attrs_summary}]")
    except Exception:
        pass
    print("=" * 60)

    # js/game3d.js material fix check (#14)
    try:
        game3d = ROOT / "js" / "game3d.js"
        if game3d.exists():
            txt = game3d.read_text()
            has_metal = "metalness" in txt and "0.05" in txt
            has_rough = "roughness" in txt and "0.85" in txt
            print(f"js/game3d.js PBR hack: metalness 0.05={has_metal} roughness 0.85={has_rough} (safety net for retopo)")
    except Exception:
        pass

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
