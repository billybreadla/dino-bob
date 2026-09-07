#!/usr/bin/env python3
"""Procedural baked-3D toys for Dino Bob (no downloads, pure bpy).

Builds a party balloon and a gold coin from primitives, then renders 6-frame
Z-turntables headless using the studio rig from tools/TOY_PIPELINE.md:

    blender -b --python tools/model_toys.py -- <outdir> <prefix> <frames>
      <prefix>: balloon_3d | coin_3d | pet_ptero | pet_turtle | pet_firefly | all     <frames>: default 6

Writes <outdir>/<prefix>_0.png .. _N.png (1024x1024 PNG RGBA, transparent).
"""
import math
import os
import sys

import bpy

FRAMES_DEFAULT = 6
RES = 1024


# ---------------------------------------------------------------- studio ----
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render():
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception:
        try:
            sc.render.engine = 'BLENDER_EEVEE'
        except Exception:
            pass
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = 0.35   # small lift so albedo colors stay lively
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    ims = sc.render.image_settings
    ims.file_format = 'PNG'
    ims.color_mode = 'RGBA'


def setup_world():
    w = bpy.data.worlds.new('studio')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        # warm bright room: metals (coin) have no diffuse — they ONLY reflect
        # this, so a dark world renders them as dull olive brass
        bg.inputs[0].default_value = (1.0, 0.96, 0.9, 1.0)
        bg.inputs[1].default_value = 0.45


def add_light(name, kind, loc, energy, size):
    data = bpy.data.lights.new(name, type=kind)
    data.energy = energy
    data.size = size
    ob = bpy.data.objects.new(name, data)
    ob.location = loc
    bpy.context.collection.objects.link(ob)
    return ob


def setup_lights():
    target = bpy.data.objects.new('rig-target', None)
    bpy.context.collection.objects.link(target)
    rig = [
        # wattages are 1/4 of TOY_PIPELINE.md §studio: at our scene scale the
        # full 400W clips diffuse to white and washes albedo out to pastel
        ('key', 'AREA', (-3, -3, 4), 150, 5),
        ('fill', 'AREA', (3, -2, 1), 12, 5),
        ('rim', 'AREA', (0, 3, 3), 30, 3),
    ]
    for name, kind, loc, energy, size in rig:
        ob = add_light(name, kind, loc, energy, size)
        con = ob.constraints.new('TRACK_TO')
        con.target = target
        con.track_axis = 'TRACK_NEGATIVE_Z'
        con.up_axis = 'UP_Y'


def setup_camera(ortho_scale):
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = ortho_scale
    ob = bpy.data.objects.new('cam', cam)
    ob.location = (0, -10, 1.8)
    ob.rotation_euler = (math.radians(80), 0, 0)
    bpy.context.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


# ------------------------------------------------------------ materials ----
def srgb(hexstr):
    """#RRGGBB sRGB -> linear RGB tuple.

    Base Color sockets are LINEAR; feeding sRGB-looking numbers makes every
    color render washed-out pastel (the bulb rendered #F27166 salmon when we
    meant #E62419 cherry). Convert at the door.
    """
    r, g, b = (int(hexstr[i:i + 2], 16) / 255.0 for i in (1, 3, 5))

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b))


def mat(name, color, rough, metallic=0.0, coat=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    for spec_name in ('Specular IOR Level', 'Specular'):
        if spec_name in bsdf.inputs:
            bsdf.inputs[spec_name].default_value = spec
            break
    # clearcoat: extra glossy lacquer on top (balloon toy shine); name varies
    # across Blender versions
    for coat_name in ('Coat Weight', 'Clearcoat'):
        if coat and coat_name in bsdf.inputs:
            bsdf.inputs[coat_name].default_value = coat
            break
    return m


# ---------------------------------------------------------------- balloon --
# Frame contract (post-bake fractions of the square frame):
#   bulb centered horizontally, bulb center ~58% down, string near bottom.
BALLOON_ORTHO = 4.3
BALLOON_BULB_Z = -0.08 * BALLOON_ORTHO   # 58% down => 8% of frame below center


def build_balloon():
    root = bpy.data.objects.new('balloon_root', None)
    bpy.context.collection.objects.link(root)

    zc = BALLOON_BULB_Z
    # cherry red, glossy: low roughness keeps a hard upper-left highlight so
    # the bulb reads as a shiny painted toy, not matte clay
    red = mat('balloon_red', srgb('#E62419'), 0.12, coat=0.25, spec=0.22)
    dark = mat('balloon_dark', srgb('#5C1A12'), 0.6)       # knot + string

    # bulb: UV sphere scaled (1, 1, 1.15) with a gentle bottom taper
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24,
                                         radius=1, location=(0, 0, zc))
    bulb = bpy.context.active_object
    for v in bulb.data.vertices:
        v.co.z *= 1.15
        if v.co.z < zc - 0.30:
            t = min(1.0, (-(v.co.z - zc) - 0.30) / 0.85)
            f = 1.0 - 0.38 * (t ** 1.2)
            v.co.x *= f
            v.co.y *= f
    bulb.data.materials.append(red)
    bulb.parent = root
    set_smooth(bulb)

    # knot: tiny flared cone under the bulb
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.13, radius2=0.06,
                                    depth=0.15, location=(0, 0, zc - 1.18))
    knot = bpy.context.active_object
    knot.data.materials.append(dark)
    knot.parent = root
    set_smooth(knot)

    # string: wavy bezier hanging to just above the frame bottom
    curve = bpy.data.curves.new('string', type='CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.008
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    sp = curve.splines.new('BEZIER')
    z0 = zc - 1.26
    pts = [(0, 0, z0), (0.07, 0, z0 - 0.16), (-0.08, 0, z0 - 0.32),
           (0.06, 0, z0 - 0.46)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sobj = bpy.data.objects.new('string', curve)
    sobj.data.materials.append(dark)
    sobj.parent = root
    bpy.context.collection.objects.link(sobj)
    return root



def mat_paint(name, color, shadow=0.52, mid=1.0, lit=1.18):
    """Matte painted-toy clay: Principled, high roughness, almost no specular.

    Soft area lights then give gentle form shading without plastic hotspots.
    (Full ShaderToRGB toon went too flat and killed readable faces.)
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.78
    bsdf.inputs['Metallic'].default_value = 0.0
    for spec_name in ('Specular IOR Level', 'Specular'):
        if spec_name in bsdf.inputs:
            bsdf.inputs[spec_name].default_value = 0.12
            break
    for coat_name in ('Coat Weight', 'Clearcoat'):
        if coat_name in bsdf.inputs:
            bsdf.inputs[coat_name].default_value = 0.04
            break
    return m


def mat_glow_paint(name, color, strength=5.0):
    """Emissive lantern that still goes through a soft ramp for painted bands."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*color, 1.0)
    emit.inputs['Strength'].default_value = strength
    links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return m


def add_ink_outline(ob, thickness=0.035):
    """Outline is applied in bake_frames.paintify (alpha edge), not in-mesh.
    In-mesh solidify hulls were painting every pet a solid brown silhouette.
    """
    return ob


def soft_pet_lights():
    """Bigger, softer key for pets — less harsh specular, more clay-illustration."""
    for name, energy in (('key', 90), ('fill', 28), ('rim', 18)):
        ob = bpy.data.objects.get(name)
        if ob and ob.type == 'LIGHT':
            ob.data.energy = energy
            if hasattr(ob.data, 'size'):
                ob.data.size = max(ob.data.size, 7.0)
    bg = bpy.context.scene.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (1.0, 0.97, 0.92, 1.0)
        bg.inputs[1].default_value = 0.55


def set_smooth(ob):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth()


# ------------------------------------------------------------------- coin --
COIN_ORTHO = 2.5


def star_points(outer, inner):
    pts = []
    for i in range(10):
        r = outer if i % 2 == 0 else inner
        a = math.pi / 2 + i * math.pi / 5
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def make_star(name, m, y_sign):
    import bmesh
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0)) for x, y in star_points(0.55, 0.23)]
    bm.faces.new(verts)
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    up = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, 0.06), verts=up)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    ob.data.materials.append(m)
    bpy.context.collection.objects.link(ob)
    return ob


def build_coin():
    root = bpy.data.objects.new('coin_root', None)
    bpy.context.collection.objects.link(root)
    # three golds: bright face, slightly deeper rim, and a dark engraved
    # bronze for the star so the relief reads even at 128 px on screen
    gold = mat('coin_gold', srgb('#F2C038'), 0.16, metallic=1.0)
    gold_rim = mat('coin_gold_rim', srgb('#D99E2B'), 0.22, metallic=1.0)
    gold_star = mat('coin_star', srgb('#734D17'), 0.42, metallic=1.0)

    # body: cylinder standing on edge (faces point at the camera at frame 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1, depth=0.18,
                                        location=(0, 0, 0))
    body = bpy.context.active_object
    body.rotation_euler = (math.radians(90), 0, 0)
    body.data.materials.append(gold)
    body.parent = root
    set_smooth(body)

    # chunky rim ridges proud of each face
    for side in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.82, minor_radius=0.045,
                                         location=(0, side * 0.088, 0))
        ring = bpy.context.active_object
        ring.rotation_euler = (math.radians(90), 0, 0)
        ring.scale = (1, 1, 1)
        ring.data.materials.append(gold_rim)
        ring.parent = root
        set_smooth(ring)

    # extruded stars on both faces
    front = make_star('star_front', gold_star, 1)
    front.rotation_euler = (math.radians(90), 0, 0)
    front.location = (0, -0.09, 0)
    front.parent = root
    back = make_star('star_back', gold_star, -1)
    back.rotation_euler = (math.radians(-90), 0, 0)
    back.location = (0, 0.09, 0)
    back.parent = root
    return root


# ------------------------------------------------------------------- bow --
# One glossy toy recurve bow, vertical like the flat bow.png it replaces.
BOW_ORTHO = 3.1


def build_bow():
    root = bpy.data.objects.new('bow_root', None)
    bpy.context.collection.objects.link(root)
    wood = mat('bow_wood', srgb('#a06a35'), 0.16, coat=0.35)
    wood_dk = mat('bow_wood_dk', srgb('#7a4c22'), 0.3)
    grip_m = mat('bow_grip', srgb('#3a2a1a'), 0.45)
    string_m = mat('bow_string', srgb('#e8e2d0'), 0.6)

    # limbs: bezier C-curves (recurve kick at the tips), beveled round.
    # Built in the XZ plane — this rig's camera looks down +Y, so Z is up.
    tips = []
    for side in (-1, 1):
        curve = bpy.data.curves.new('limb', type='CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = 0.075
        curve.bevel_resolution = 4
        curve.use_fill_caps = True
        sp = curve.splines.new('BEZIER')
        pts = [(0.02, 0, side * 0.22), (0.16, 0, side * 0.72),
               (0.02, 0, side * 1.12), (-0.16, 0, side * 1.34)]
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        ob = bpy.data.objects.new('limb', curve)
        ob.data.materials.append(wood)
        ob.parent = root
        bpy.context.collection.objects.link(ob)
        tips.append((-0.16, 0, side * 1.34))

    # grip between the limbs (cylinder axis is already Z = up)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.09, depth=0.52,
                                        location=(0.03, 0, 0))
    grip = bpy.context.active_object
    grip.data.materials.append(grip_m)
    grip.parent = root
    set_smooth(grip)

    # string between the tips
    curve = bpy.data.curves.new('string', type='CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.012
    curve.bevel_resolution = 2
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(1)
    sp.bezier_points[0].co = tips[0]
    sp.bezier_points[1].co = tips[1]
    for bp in sp.bezier_points:
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sobj = bpy.data.objects.new('bowstring', curve)
    sobj.data.materials.append(string_m)
    sobj.parent = root
    bpy.context.collection.objects.link(sobj)
    _ = wood_dk
    return root


# ---------------------------------------------------------------- arrows --
# One arrow per type, lying along +X (tip leading — matches drawArrow's
# contract). The turntable is a ROLL around the shaft axis: in flight the
# frames cycle as a tumble. 256px bake is plenty at drawArrow's 92px width.
ARROW_ORTHO = 3.05

ARROW_TYPES = {
    'wooden':   {'shaft': '#a06a35', 'head': '#c0c7cc', 'fletch': '#9fd636', 'emit': None},
    'fire':     {'shaft': '#5a321c', 'head': '#ff7a1a', 'fletch': '#ffd23a', 'emit': '#ff5a1a'},
    'ice':      {'shaft': '#6fa8c8', 'head': '#bfeaff', 'fletch': '#62e6ff', 'emit': '#62e6ff'},
    'lightning': {'shaft': '#3a3a44', 'head': '#ffe33a', 'fletch': '#fff6d0', 'emit': '#ffe33a'},
    'obsidian': {'shaft': '#1c1424', 'head': '#8e4fd0', 'fletch': '#c9a8ff', 'emit': '#8e4fd0'},
}


def build_arrow(kind):
    spec = ARROW_TYPES[kind]
    root = bpy.data.objects.new('arrow_root', None)
    bpy.context.collection.objects.link(root)
    shaft_m = mat('shaft_' + kind, srgb(spec['shaft']), 0.3)
    head_m = mat('head_' + kind, srgb(spec['head']), 0.15, metallic=0.85)
    fl_m = mat('fl_' + kind, srgb(spec['fletch']), 0.4)
    if spec['emit']:
        for m in (head_m,):
            b = m.node_tree.nodes.get('Principled BSDF')
            b.inputs['Emission Color'].default_value = (*srgb(spec['emit']), 1.0)
            b.inputs['Emission Strength'].default_value = 2.2

    # shaft along +X
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.045, depth=2.1,
                                        location=(0, 0, 0))
    shaft = bpy.context.active_object
    shaft.rotation_euler = (0, math.radians(90), 0)
    shaft.data.materials.append(shaft_m)
    shaft.parent = root
    set_smooth(shaft)

    # head: cone at the +X tip
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.1, radius2=0,
                                    depth=0.34, location=(1.2, 0, 0))
    head = bpy.context.active_object
    head.rotation_euler = (0, math.radians(-90), 0)
    head.data.materials.append(head_m)
    head.parent = root
    set_smooth(head)

    # nock at the -X end
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.06, depth=0.12,
                                        location=(-1.08, 0, 0))
    nock = bpy.context.active_object
    nock.rotation_euler = (0, math.radians(90), 0)
    nock.data.materials.append(fl_m)
    nock.parent = root
    set_smooth(nock)

    # three fletchings, 120 deg apart around the shaft
    for i in range(3):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.86, 0, 0))
        f = bpy.context.active_object
        f.scale = (0.22, 0.012, 0.17)
        f.rotation_euler = (math.radians(120) * i, 0, 0)
        f.data.materials.append(fl_m)
        f.parent = root
        set_smooth(f)
    return root
# ------------------------------------------------------------------ crab --
# The Crab King: hermit-crab golem in a cracked brass diving helmet, glowing
# target-ring belly (the weak spot). damage 0/1/2 = healthy/cracked/battered;
# yaw turns him a little for the hit-flash poses. Replaces the flat art the
# V7 handoff asked for — built in-house instead.
CRAB_ORTHO = 4.4


def build_crab(damage=0, yaw=0.0):
    root = bpy.data.objects.new('crab_root', None)
    bpy.context.collection.objects.link(root)

    brass = mat('crab_brass', srgb('#c9963a'), 0.28, metallic=1.0)
    brass_dk = mat('crab_brass_dk', srgb('#8a6420'), 0.4, metallic=1.0)
    red = mat('crab_red', srgb('#d85a3a'), 0.45)
    cream = mat('crab_cream', srgb('#f2e0c0'), 0.5)
    dark = mat('crab_dark', srgb('#3a2020'), 0.6)
    glow = mat('crab_glow', srgb('#ffd23a'), 0.3)
    gb = glow.node_tree.nodes.get('Principled BSDF')
    gb.inputs['Emission Color'].default_value = (*srgb('#ffd23a'), 1.0)
    gb.inputs['Emission Strength'].default_value = 2.4

    def part(name, mesh_fn, m, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
        mesh_fn()
        ob = bpy.context.active_object
        ob.name = name
        ob.location = loc
        ob.rotation_euler = rot
        ob.scale = scale
        ob.data.materials.append(m)
        ob.parent = root
        set_smooth(ob)
        return ob

    # body: wide squashed sphere
    part('body', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=20, radius=1.0, location=(0, 0, 0)),
        red, (0, 0, 0.55), scale=(1.15, 0.85, 0.8))

    # glowing target-ring belly, proud of the front (camera side = -Y)
    part('belly_ring', lambda: bpy.ops.mesh.primitive_torus_add(
        major_radius=0.42, minor_radius=0.075, location=(0, 0, 0)),
        red, (0, -0.78, 0.5), rot=(math.radians(90), 0, 0))
    part('belly_ring2', lambda: bpy.ops.mesh.primitive_torus_add(
        major_radius=0.26, minor_radius=0.07, location=(0, 0, 0)),
        cream, (0, -0.8, 0.5), rot=(math.radians(90), 0, 0))
    part('belly_core', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=12, radius=0.13, location=(0, 0, 0)),
        glow, (0, -0.82, 0.5))

    # face under the helmet front: eyes on stalks + grumpy brows
    for side in (-1, 1):
        part('stalk', lambda: bpy.ops.mesh.primitive_cylinder_add(
            vertices=12, radius=0.045, depth=0.34, location=(0, 0, 0)),
            red, (side * 0.28, -0.5, 1.06), rot=(math.radians(-18 * side), 0, 0))
        part('eye', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=10, radius=0.12, location=(0, 0, 0)),
            cream, (side * 0.35, -0.58, 1.24))
        part('pupil', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.055, location=(0, 0, 0)),
            dark, (side * 0.36, -0.68, 1.24))
        part('brow', lambda: bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, 0)),
            dark, (side * 0.35, -0.6, 1.4), rot=(0, 0, side * 0.5),
            scale=(0.3, 0.06, 0.055))

    # the brass diving helmet: dome + porthole visor rim + rivets
    part('helmet', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40, ring_count=24, radius=0.92, location=(0, 0, 0)),
        brass, (0, 0.14, 1.62), scale=(1.12, 1.0, 0.8))
    part('visor', lambda: bpy.ops.mesh.primitive_torus_add(
        major_radius=0.52, minor_radius=0.08, location=(0, 0, 0)),
        brass_dk, (0, -0.52, 1.22), rot=(math.radians(102), 0, 0))
    for i in range(6):
        a = math.pi * (0.12 + 0.15 * i)
        part('rivet', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.06, location=(0, 0, 0)),
            brass_dk, (math.cos(a) * 0.95, 0.14, 1.62 + math.sin(a) * 0.66))

    # claws: left oversized (his big boy), right regular — big proud pincers
    for side, big in ((-1, True), (1, False)):
        arm_s = 1.4 if big else 1.0
        part('arm', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=10, radius=0.22, location=(0, 0, 0)),
            red, (side * 1.05, -0.15, 0.78), scale=(arm_s, arm_s, arm_s))
        part('paw', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=20, ring_count=12, radius=0.32, location=(0, 0, 0)),
            red, (side * 1.5, -0.22, 0.86), scale=(arm_s, arm_s * 0.8, arm_s * 0.85))
        part('pincer_top', lambda: bpy.ops.mesh.primitive_cone_add(
            vertices=14, radius1=0.19, radius2=0, depth=0.55,
            location=(0, 0, 0)),
            cream, (side * 1.74, -0.22, 1.06),
            rot=(0, math.radians(118 * side), math.radians(-14 * side)),
            scale=(arm_s, arm_s, arm_s))
        part('pincer_bot', lambda: bpy.ops.mesh.primitive_cone_add(
            vertices=14, radius1=0.15, radius2=0, depth=0.44,
            location=(0, 0, 0)),
            cream, (side * 1.7, -0.22, 0.68),
            rot=(0, math.radians(62 * side), math.radians(22 * side)),
            scale=(arm_s, arm_s, arm_s))

    # legs: three stubby pairs
    for side in (-1, 1):
        for i in range(3):
            part('leg', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
                segments=12, ring_count=8, radius=0.13, location=(0, 0, 0)),
                dark, (side * (0.75 + i * 0.26), 0.12, 0.16 - i * 0.03),
                scale=(1.6, 1, 0.6))

    # DAMAGE: 1 = cracks + one rivet gone; 2 = heavy cracks, tilted helmet,
    # chipped claw, a leg missing
    crack_m = mat('crack', srgb('#140c10'), 0.7)
    if damage >= 1:
        spots = [(0.45, -0.4, 1.95, 0.5, 0.7), (-0.5, 0.2, 1.8, -0.7, 0.6)]
        if damage >= 2:
            spots += [(0.05, -0.55, 1.6, 0.15, 0.8), (-0.28, 0.4, 2.1, 1.1, 0.7),
                      (0.7, 0.2, 1.55, -0.3, 0.55)]
        for i, (cx, cy, cz, rz, cs) in enumerate(spots):
            part('crack%d' % i, lambda: bpy.ops.mesh.primitive_cube_add(
                size=1, location=(0, 0, 0)),
                crack_m, (cx, cy, cz), rot=(0, rz, rz * 1.3),
                scale=(cs, 0.06, 0.085))
    if damage >= 1:
        rivs = [ob for ob in bpy.data.objects if ob.name.startswith('rivet')]
        if rivs:
            bpy.data.objects.remove(rivs[-1], do_unlink=True)
    if damage >= 2:
        helm = bpy.data.objects.get('helmet')
        if helm:
            helm.rotation_euler = (0, 0, math.radians(14))
        paw = bpy.data.objects.get('pincer_top')
        if paw:
            paw.scale = (0.5, 0.5, 0.5)  # chipped
        legs = [ob for ob in bpy.data.objects if ob.name.startswith('leg')]
        if legs:
            bpy.data.objects.remove(legs[-1], do_unlink=True)

    root.rotation_euler = (0, 0, yaw)
    return root


# ------------------------------------------------------------- anglerfish --
# The Angler Golem: deep-sea stone fish with a glowing lantern lure whose
# target-ring IS the weak spot. Same 6-frame damage pipeline as the crab.
ANGLER_ORTHO = 4.6


def build_angler(damage=0, yaw=0.0):
    root = bpy.data.objects.new('angler_root', None)
    bpy.context.collection.objects.link(root)

    stone = mat('ang_stone', srgb('#465064'), 0.6)
    stone_dk = mat('ang_stone_dk', srgb('#2c3342'), 0.7)
    cream = mat('ang_cream', srgb('#e8ddc0'), 0.5)
    red = mat('ang_red', srgb('#d85a3a'), 0.4)
    glow = mat('ang_glow', srgb('#ffd23a'), 0.3)
    gb = glow.node_tree.nodes.get('Principled BSDF')
    gb.inputs['Emission Color'].default_value = (*srgb('#ffd23a'), 1.0)
    gb.inputs['Emission Strength'].default_value = 2.6

    def part(name, mesh_fn, m, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
        mesh_fn()
        ob = bpy.context.active_object
        ob.name = name
        ob.location = loc
        ob.rotation_euler = rot
        ob.scale = scale
        ob.data.materials.append(m)
        ob.parent = root
        set_smooth(ob)
        return ob

    # body: big round stone head-body, tilted so the face fronts the camera
    part('body', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=36, ring_count=22, radius=0.95, location=(0, 0, 0)),
        stone, (0, 0.12, 0.85), scale=(1.12, 0.95, 1.0))
    # wide-open mouth: upper maw cut + big dropped lower jaw, pushed FORWARD
    part('maw', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24, ring_count=14, radius=0.55, location=(0, 0, 0)),
        stone_dk, (0, -0.62, 0.62), scale=(0.85, 0.6, 0.5))
    part('jaw', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=28, ring_count=16, radius=0.6, location=(0, 0, 0)),
        stone, (0, -0.55, 0.18), scale=(1.0, 0.85, 0.5))
    # teeth: big ragged cones ringing the maw
    for i in range(6):
        fx = -0.5 + i * 0.2
        part('tooth', lambda: bpy.ops.mesh.primitive_cone_add(
            vertices=8, radius1=0.085, radius2=0, depth=0.34,
            location=(0, 0, 0)),
            cream, (fx, -0.88, 0.78), rot=(math.radians(196), 0, 0))
        part('tooth', lambda: bpy.ops.mesh.primitive_cone_add(
            vertices=8, radius1=0.075, radius2=0, depth=0.3,
            location=(0, 0, 0)),
            cream, (fx + 0.1, -0.86, 0.3))
    # glowing eyes under the lure light, on the face front
    for side in (-1, 1):
        part('eye', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=14, ring_count=10, radius=0.13, location=(0, 0, 0)),
            glow, (side * 0.38, -0.86, 1.22))
        part('lid', lambda: bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, 0)),
            stone_dk, (side * 0.38, -0.88, 1.35), rot=(0, 0, side * 0.4),
            scale=(0.32, 0.09, 0.06))

    # the lantern lure: arcing stalk from the brow, glowing ring-bulb tip.
    # The ring around the bulb is the aim target.
    part('stalk', lambda: bpy.ops.mesh.primitive_cylinder_add(
        vertices=10, radius=0.05, depth=0.85, location=(0, 0, 0)),
        stone_dk, (0, -0.4, 2.0), rot=(math.radians(18), 0, 0))
    part('bulb', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=14, radius=0.3, location=(0, 0, 0)),
        glow, (0, -0.72, 2.42))
    part('lure_ring', lambda: bpy.ops.mesh.primitive_torus_add(
        major_radius=0.42, minor_radius=0.06, location=(0, 0, 0)),
        red, (0, -0.72, 2.42), rot=(math.radians(12), 0, 0))
    part('lure_ring2', lambda: bpy.ops.mesh.primitive_torus_add(
        major_radius=0.26, minor_radius=0.05, location=(0, 0, 0)),
        cream, (0, -0.74, 2.42), rot=(math.radians(12), 0, 0))

    # side fins + tail
    for side in (-1, 1):
        part('fin', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=10, radius=0.3, location=(0, 0, 0)),
            stone_dk, (side * 1.08, 0.1, 0.6), rot=(0, math.radians(28 * side), 0),
            scale=(0.35, 1.0, 0.75))
    part('tailfin', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=10, radius=0.42, location=(0, 0, 0)),
        stone_dk, (0, 0.95, 0.85), rot=(math.radians(76), 0, 0),
        scale=(1.0, 0.3, 1.0))

    # barnacle bumps on the stone hide
    barn = [(0.6, 0.35, 1.3, 0.09), (-0.65, 0.3, 1.25, 0.08),
            (0.85, -0.1, 1.0, 0.07), (-0.85, -0.05, 0.95, 0.075),
            (0.2, 0.55, 1.45, 0.06)]
    for i, (bx, by, bz, br) in enumerate(barn):
        part('barn%d' % i, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=br, location=(0, 0, 0)),
            cream, (bx, by, bz))

    # legs/fins at the base: three stubby stone pairs to stand on
    for side in (-1, 1):
        for i in range(3):
            part('foot', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
                segments=12, ring_count=8, radius=0.13, location=(0, 0, 0)),
                stone_dk, (side * (0.6 + i * 0.28), 0.05, 0.12),
                scale=(1.5, 1, 0.55))

    # DAMAGE: 1 = cracks + dim lure; 2 = heavy cracks, snapped lure (bent +
    # dimmer), broken tooth, missing foot
    crack_m = mat('ang_crack', srgb('#10141c'), 0.75)
    if damage >= 1:
        spots = [(0.5, -0.3, 1.35, 0.5, 0.65), (-0.55, 0.2, 1.15, -0.7, 0.6)]
        if damage >= 2:
            spots += [(0.0, -0.6, 0.9, 0.15, 0.7), (0.35, 0.4, 1.5, 1.0, 0.6)]
        for i, (cx, cy, cz, rz, cs) in enumerate(spots):
            part('crack%d' % i, lambda: bpy.ops.mesh.primitive_cube_add(
                size=1, location=(0, 0, 0)),
                crack_m, (cx, cy, cz), rot=(0, rz, rz * 1.3),
                scale=(cs, 0.06, 0.08))
    if damage >= 1:
        gb2 = glow.node_tree.nodes.get('Principled BSDF')
        gb2.inputs['Emission Strength'].default_value = 1.4 if damage == 1 else 0.7
    if damage >= 2:
        stalk = bpy.data.objects.get('stalk')
        if stalk:
            stalk.rotation_euler = (math.radians(24), math.radians(26), 0)
            stalk.location = (0.12, -0.3, 1.85)
        teeth = [ob for ob in bpy.data.objects if ob.name.startswith('tooth')]
        if teeth:
            bpy.data.objects.remove(teeth[-1], do_unlink=True)
        feet = [ob for ob in bpy.data.objects if ob.name.startswith('foot')]
        if feet:
            bpy.data.objects.remove(feet[-1], do_unlink=True)

    root.rotation_euler = (0, 0, yaw)
    root.location = (0, 0, -0.5)  # sit lower in the ortho frame
    return root


# ----------------------------------------------------------------- render --



# -------------------------------------------------------- baby pterodactyl --
# Painted-toy pass: toon materials, ink outlines, overlapping soft forms.
PTERO_ORTHO = 2.75


def build_ptero(wing_up=0.0):
    root = bpy.data.objects.new('ptero_root', None)
    bpy.context.collection.objects.link(root)

    teal = mat_paint('ptero_teal', srgb('#3cb89a'), shadow=0.48, lit=1.2)
    teal_w = mat_paint('ptero_wing', srgb('#57c9ad'), shadow=0.5, lit=1.15)
    cream = mat_paint('ptero_cream', srgb('#fff1cf'), shadow=0.55, lit=1.1)
    beak = mat_paint('ptero_beak', srgb('#ffb347'), shadow=0.5, lit=1.15)
    crest = mat_paint('ptero_crest', srgb('#ff6b7a'), shadow=0.5, lit=1.2)
    eye_w = mat_paint('ptero_eye_w', srgb('#fffaf2'), shadow=0.7, lit=1.05)
    eye_b = mat_paint('ptero_eye_b', srgb('#1a1e28'), shadow=0.8, lit=1.0)
    blush = mat_paint('ptero_blush', srgb('#ff9aaf'), shadow=0.6, lit=1.1)

    def part(name, mesh_fn, m, loc, rot=(0, 0, 0), scale=(1, 1, 1), ink=0.03):
        mesh_fn()
        ob = bpy.context.active_object
        ob.name = name
        ob.location = loc
        ob.rotation_euler = rot
        ob.scale = scale
        ob.data.materials.append(m)
        ob.parent = root
        set_smooth(ob)
        if ink:
            add_ink_outline(ob, ink)
        return ob

    flap = max(0.0, min(1.0, wing_up))

    # One continuous "toy" body: head almost merges into body
    part('body', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40, ring_count=22, radius=0.7),
        teal, (0.08, 0, 0.02), scale=(1.08, 0.95, 0.98), ink=0.04)
    part('belly', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=28, ring_count=16, radius=0.48),
        cream, (0.05, -0.32, -0.05), scale=(0.95, 0.65, 0.9), ink=0.0)
    part('head', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=36, ring_count=20, radius=0.55),
        teal, (-0.55, -0.05, 0.55), scale=(1.1, 1.02, 1.02), ink=0.04)
    # neck blend blob hides the sphere seam
    part('neck', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24, ring_count=14, radius=0.32),
        teal, (-0.28, -0.04, 0.32), scale=(1.2, 1.0, 1.0), ink=0.0)

    part('beak', lambda: bpy.ops.mesh.primitive_cone_add(
        vertices=22, radius1=0.17, radius2=0.025, depth=0.5),
        beak, (-1.15, -0.07, 0.5),
        rot=(0, math.radians(88), math.radians(-5)), scale=(0.78, 0.58, 1.0), ink=0.025)
    part('crest', lambda: bpy.ops.mesh.primitive_cone_add(
        vertices=16, radius1=0.2, radius2=0.02, depth=0.4),
        crest, (-0.42, 0.02, 1.05),
        rot=(math.radians(10), math.radians(-26), 0), scale=(0.55, 0.35, 1.0), ink=0.02)

    for side, y in ((-1, -0.28), (1, 0.16)):
        part('eye_w_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=20, ring_count=12, radius=0.16),
            eye_w, (-0.88, y, 0.7), scale=(0.9, 1.1, 1.1), ink=0.0)
        part('eye_b_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=14, ring_count=10, radius=0.075),
            eye_b, (-0.98, y - 0.01, 0.72), ink=0.0)
        part('blush_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.09),
            blush, (-0.72, y, 0.48), scale=(0.5, 1.0, 0.5), ink=0.0)

    # Thick soft wings (ellipsoids that read as cloth/felt, not discs)
    wing_z = 0.22 + flap * 0.48
    wing_fold = math.radians(5 + flap * 42)
    for side in (-1, 1):
        part('wing_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=28, ring_count=16, radius=0.62),
            teal_w,
            (0.12, side * (0.5 - flap * 0.1), wing_z),
            rot=(side * wing_fold, math.radians(-14 - flap * 18), side * math.radians(5)),
            scale=(0.95, 0.22, 1.25), ink=0.03)
        part('wingtip_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=20, ring_count=12, radius=0.32),
            teal,
            (0.45, side * (0.92 - flap * 0.18), wing_z + 0.04),
            rot=(side * (wing_fold + math.radians(6)), math.radians(-16), 0),
            scale=(1.0, 0.18, 0.75), ink=0.02)

    for side in (-1, 1):
        part('foot_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=14, ring_count=10, radius=0.13),
            beak, (0.25, side * 0.26, -0.52), scale=(1.35, 0.8, 0.55), ink=0.02)
    part('tail', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=10, radius=0.22),
        teal_w, (0.78, 0, 0.02), scale=(1.5, 0.55, 0.55), ink=0.02)

    root.location = (0.1, 0, -0.05)
    root.rotation_euler = (0, 0, math.radians(20))
    return root


# ------------------------------------------------------------- Shelly turtle --
TURTLE_ORTHO = 2.6


def build_turtle(hop=0.0):
    root = bpy.data.objects.new('turtle_root', None)
    bpy.context.collection.objects.link(root)

    shell = mat_paint('turtle_shell', srgb('#3d9a5c'), shadow=0.45, lit=1.18)
    scute = mat_paint('turtle_scute', srgb('#6ed18a'), shadow=0.5, lit=1.12)
    rim = mat_paint('turtle_rim', srgb('#2f7348'), shadow=0.5, lit=1.1)
    skin = mat_paint('turtle_skin', srgb('#d4ec8a'), shadow=0.5, lit=1.15)
    belly = mat_paint('turtle_belly', srgb('#fff0c8'), shadow=0.55, lit=1.08)
    beak = mat_paint('turtle_beak', srgb('#ffb347'), shadow=0.5, lit=1.15)
    eye_w = mat_paint('turtle_eye_w', srgb('#fffaf2'), shadow=0.7, lit=1.05)
    eye_b = mat_paint('turtle_eye_b', srgb('#1a1e28'), shadow=0.8, lit=1.0)
    blush = mat_paint('turtle_blush', srgb('#ff9aaf'), shadow=0.6, lit=1.1)

    def part(name, mesh_fn, m, loc, rot=(0, 0, 0), scale=(1, 1, 1), ink=0.03):
        mesh_fn()
        ob = bpy.context.active_object
        ob.name = name
        ob.location = loc
        ob.rotation_euler = rot
        ob.scale = scale
        ob.data.materials.append(m)
        ob.parent = root
        set_smooth(ob)
        if ink:
            add_ink_outline(ob, ink)
        return ob

    h = max(0.0, min(1.0, hop))
    lift = h * 0.18

    part('shell', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40, ring_count=22, radius=0.82),
        shell, (0, 0, 0.4 + lift), scale=(1.1, 1.0, 0.82), ink=0.045)
    for i, (x, y, s) in enumerate([
        (0, 0.05, 0.34), (-0.34, -0.15, 0.26), (0.34, -0.15, 0.26),
        (-0.3, 0.3, 0.24), (0.3, 0.3, 0.24)
    ]):
        part('scute_%d' % i, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18, ring_count=12, radius=s),
            scute, (x, y, 0.82 + lift), scale=(1.0, 1.0, 0.32), ink=0.0)
    part('rim', lambda: bpy.ops.mesh.primitive_torus_add(
        major_radius=0.82, minor_radius=0.1, major_segments=40, minor_segments=14),
        rim, (0, 0, 0.3 + lift), rot=(math.radians(5), 0, 0), ink=0.02)
    part('belly', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=28, ring_count=14, radius=0.58),
        belly, (0, 0, 0.02 + lift), scale=(1.0, 0.9, 0.34), ink=0.0)

    part('head', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=18, radius=0.38),
        skin, (-0.95, -0.04, 0.34 + lift), scale=(1.25, 1.05, 1.05), ink=0.035)
    part('neck', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=12, radius=0.22),
        skin, (-0.55, -0.02, 0.28 + lift), scale=(1.4, 1.0, 1.0), ink=0.0)
    part('beak', lambda: bpy.ops.mesh.primitive_cone_add(
        vertices=16, radius1=0.12, radius2=0.02, depth=0.22),
        beak, (-1.35, -0.04, 0.32 + lift),
        rot=(0, math.radians(90), 0), scale=(0.8, 0.55, 1.0), ink=0.02)

    for side, y in ((-1, -0.2), (1, 0.14)):
        part('eye_w_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=10, radius=0.145),
            eye_w, (-1.15, y, 0.5 + lift), ink=0.0)
        part('eye_b_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.055),
            eye_b, (-1.18, y - 0.01, 0.5 + lift), ink=0.0)
        part('blush_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=10, ring_count=8, radius=0.075),
            blush, (-1.0, y, 0.26 + lift), scale=(0.55, 1.0, 0.5), ink=0.0)

    for i, (x, y) in enumerate([(-0.4, -0.52), (-0.4, 0.52), (0.4, -0.52), (0.4, 0.52)]):
        part('leg_%d' % i, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=10, radius=0.2),
            skin, (x * 0.85, y * 0.85, -0.1 + lift * 0.3),
            scale=(0.95, 0.95, 0.8 + h * 0.1), ink=0.025)
    part('tail', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=14, ring_count=10, radius=0.14),
        skin, (0.88, 0, 0.12 + lift), scale=(1.55, 0.6, 0.55), ink=0.02)

    root.location = (0.06, 0, 0.0)
    root.rotation_euler = (0, 0, math.radians(16))
    return root


# ----------------------------------------------------------- Glowbug firefly --
FIREFLY_ORTHO = 2.25


def build_firefly(bright=0.0):
    root = bpy.data.objects.new('firefly_root', None)
    bpy.context.collection.objects.link(root)

    b = max(0.0, min(1.0, bright))
    body = mat_paint('ff_body', srgb('#4a5470'), shadow=0.45, lit=1.15)
    cream = mat_paint('ff_cream', srgb('#fff1cf'), shadow=0.55, lit=1.08)
    wing = mat_paint('ff_wing', srgb('#e4eeff'), shadow=0.65, lit=1.12)
    glow_c = srgb('#ffe66d') if b < 0.5 else srgb('#fff6b0')
    glow = mat_glow_paint('ff_glow', glow_c, strength=6.0 + b * 5.0)
    eye_w = mat_paint('ff_eye_w', srgb('#fffaf2'), shadow=0.7, lit=1.05)
    eye_b = mat_paint('ff_eye_b', srgb('#1a1e28'), shadow=0.8, lit=1.0)
    blush = mat_paint('ff_blush', srgb('#ff9aaf'), shadow=0.6, lit=1.1)

    def part(name, mesh_fn, m, loc, rot=(0, 0, 0), scale=(1, 1, 1), ink=0.028):
        mesh_fn()
        ob = bpy.context.active_object
        ob.name = name
        ob.location = loc
        ob.rotation_euler = rot
        ob.scale = scale
        ob.data.materials.append(m)
        ob.parent = root
        set_smooth(ob)
        if ink:
            add_ink_outline(ob, ink)
        return ob

    part('body', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=36, ring_count=20, radius=0.48),
        body, (0.02, 0, 0.08), scale=(1.05, 1.0, 1.0), ink=0.035)
    part('lantern', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=18, radius=0.4),
        glow, (0.48, 0, 0.0), scale=(1.15, 1.05, 1.0), ink=0.0)
    part('head', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=18, radius=0.4),
        body, (-0.4, 0, 0.24), scale=(1.12, 1.08, 1.08), ink=0.035)
    part('blend', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=12, radius=0.28),
        body, (-0.18, 0, 0.14), scale=(1.1, 1.0, 1.0), ink=0.0)
    part('cheeks', lambda: bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=10, radius=0.2),
        cream, (-0.4, 0, 0.05), scale=(0.95, 1.15, 0.55), ink=0.0)

    for side, y in ((-1, -0.18), (1, 0.18)):
        part('eye_w_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18, ring_count=12, radius=0.165),
            eye_w, (-0.62, y, 0.38), scale=(0.85, 1.05, 1.05), ink=0.012)
        part('eye_b_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.06),
            eye_b, (-0.72, y - 0.01, 0.4), ink=0.0)
        part('blush_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=10, ring_count=8, radius=0.07),
            blush, (-0.5, y, 0.16), scale=(0.55, 1.0, 0.5), ink=0.0)

    for side in (-1, 1):
        part('ant_%d' % side, lambda: bpy.ops.mesh.primitive_cylinder_add(
            vertices=10, radius=0.03, depth=0.34),
            body, (-0.55, side * 0.12, 0.58),
            rot=(math.radians(side * 20), math.radians(-38), 0), ink=0.015)
        part('ant_tip_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.065),
            glow, (-0.7, side * 0.16, 0.76), ink=0.0)

    wing_z = 0.3 + b * 0.1
    for side in (-1, 1):
        part('wing_%d' % side, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24, ring_count=14, radius=0.45),
            wing,
            (0.0, side * (0.34 + b * 0.05), wing_z),
            rot=(side * math.radians(48 + b * 16), math.radians(-18), side * math.radians(6)),
            scale=(0.85, 0.12, 1.2), ink=0.02)

    for i, (x, y) in enumerate([(-0.05, -0.24), (-0.05, 0.24), (0.2, -0.26), (0.2, 0.26)]):
        part('foot_%d' % i, lambda: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.08),
            body, (x, y, -0.35), scale=(1.0, 1.0, 0.7), ink=0.015)

    root.location = (0.04, 0, 0.08)
    root.rotation_euler = (0, 0, math.radians(20))
    return root


def render_turntable(root, prefix, outdir, frames, ortho_scale, world_strength):
    setup_camera(ortho_scale)
    # per-toy ambient: the balloon is a diffuse red — a bright world washes it
    # out to salmon — while the metal coin ONLY exists via reflections and
    # needs the bright room
    bg = bpy.context.scene.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[1].default_value = world_strength
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    for i in range(frames):
        root.rotation_euler.z = math.radians(i * 360.0 / frames)
        sc.render.filepath = os.path.join(
            outdir, '%s_%d.png' % (prefix, i))
        bpy.ops.render.render(write_still=True)
        print('rendered', sc.render.filepath)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else '/tmp/toys'
    prefix = argv[1] if len(argv) > 1 else 'all'
    frames = int(argv[2]) if len(argv) > 2 and argv[2] not in ('-',) \
        else FRAMES_DEFAULT

    clear_scene()
    setup_render()
    setup_world()
    setup_lights()

    jobs = ['balloon_3d', 'coin_3d'] if prefix == 'all' else \
        ['bow'] if prefix == 'bow' else \
        list(ARROW_TYPES) if prefix == 'arrows' else \
        ['crab_3d'] if prefix == 'crab' else \
        ['angler_3d'] if prefix == 'angler' else \
        ['pet_ptero'] if prefix in ('pet_ptero', 'ptero', 'pet') else \
        ['pet_turtle'] if prefix in ('pet_turtle', 'turtle', 'shelly') else \
        ['pet_firefly'] if prefix in ('pet_firefly', 'firefly', 'glowbug') else [prefix]
    # crab/angler: 6 frames = 3 damage states x 2 yaws (bossDamageSprite
    # indexes frame 0 healthy, 2 light, 4 heavy; odd frames = hit-flash poses)
    boss_specs = [(0, 0.0), (0, 0.16), (1, 0.0), (1, 0.16), (2, 0.0), (2, 0.16)]
    for which in jobs:
        if which.startswith('balloon'):
            root, scale, wstr = build_balloon(), BALLOON_ORTHO, 0.18
        elif which.startswith('coin'):
            root, scale, wstr = build_coin(), COIN_ORTHO, 0.45
        elif which == 'bow':
            root, scale, wstr = build_bow(), BOW_ORTHO, 0.3
        elif which in ARROW_TYPES:
            root, scale, wstr = build_arrow(which), ARROW_ORTHO, 0.3
        elif which == 'crab_3d':
            root, scale, wstr = build_crab(), CRAB_ORTHO, 0.3
        elif which == 'angler_3d':
            root, scale, wstr = build_angler(), ANGLER_ORTHO, 0.3
        elif which == 'pet_ptero':
            # two wing poses, not a Z-spin — matches TODO "idle/hop"
            sc = bpy.context.scene
            setup_camera(PTERO_ORTHO)
            soft_pet_lights()
            bg = sc.world.node_tree.nodes.get('Background')
            if bg:
                bg.inputs[1].default_value = 0.28
            os.makedirs(outdir, exist_ok=True)
            for i, flap in enumerate((0.0, 1.0)):
                r = build_ptero(wing_up=flap)
                sc.render.filepath = os.path.join(outdir, 'pet_ptero_%d.png' % i)
                bpy.ops.render.render(write_still=True)
                print('rendered', sc.render.filepath)
                doomed = [ob.name for ob in bpy.data.objects
                          if ob == r or (ob.parent and ob.parent.name == r.name)]
                for nm in doomed:
                    bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
            continue
        elif which == 'pet_turtle':
            sc = bpy.context.scene
            setup_camera(TURTLE_ORTHO)
            soft_pet_lights()
            bg = sc.world.node_tree.nodes.get('Background')
            if bg:
                bg.inputs[1].default_value = 0.3
            os.makedirs(outdir, exist_ok=True)
            for i, hop in enumerate((0.0, 1.0)):
                r = build_turtle(hop=hop)
                sc.render.filepath = os.path.join(outdir, 'pet_turtle_%d.png' % i)
                bpy.ops.render.render(write_still=True)
                print('rendered', sc.render.filepath)
                doomed = [ob.name for ob in bpy.data.objects
                          if ob == r or (ob.parent and ob.parent.name == r.name)]
                for nm in doomed:
                    bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
            continue
        elif which == 'pet_firefly':
            sc = bpy.context.scene
            setup_camera(FIREFLY_ORTHO)
            soft_pet_lights()
            bg = sc.world.node_tree.nodes.get('Background')
            if bg:
                # darker room so the emission lantern pops
                bg.inputs[1].default_value = 0.12
            os.makedirs(outdir, exist_ok=True)
            for i, bright in enumerate((0.0, 1.0)):
                r = build_firefly(bright=bright)
                sc.render.filepath = os.path.join(outdir, 'pet_firefly_%d.png' % i)
                bpy.ops.render.render(write_still=True)
                print('rendered', sc.render.filepath)
                doomed = [ob.name for ob in bpy.data.objects
                          if ob == r or (ob.parent and ob.parent.name == r.name)]
                for nm in doomed:
                    bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
            continue
        else:
            raise SystemExit('unknown prefix: ' + which)
        name = 'bow' if which == 'bow' else \
            ('arrow_%s_3d' % which) if which in ARROW_TYPES else which
        if which in ('crab_3d', 'angler_3d'):
            # inline render: render_turntable would overwrite the yaw
            sc = bpy.context.scene
            setup_camera(scale)
            for i, (dmg, yaw) in enumerate(boss_specs):
                r = build_crab(dmg, yaw) if which == 'crab_3d' \
                    else build_angler(dmg, yaw)
                sc.render.filepath = os.path.join(
                    outdir, '%s_%d.png' % (which, i))
                bpy.ops.render.render(write_still=True)
                print('rendered', sc.render.filepath)
                doomed = [ob.name for ob in bpy.data.objects
                          if ob == r or (ob.parent and ob.parent.name == r.name)]
                for nm in doomed:
                    bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
            continue
        render_turntable(root, name, outdir, frames, scale, wstr)
        # drop this toy so the next one renders alone
        doomed = [ob.name for ob in bpy.data.objects
                  if ob == root or (ob.parent and ob.parent.name == root.name)]
        for name in doomed:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)


if __name__ == '__main__':
    main()
