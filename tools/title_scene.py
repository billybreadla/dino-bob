#!/usr/bin/env python3
"""Cinematic 3D title scene for Dino Bob.

A golden-hour cliff vista: the hero (seen from behind, 3/4) stands on a rock
ledge with his bow, party balloons drift at depth, dark ridges stack into the
haze toward a low sun. Replaces the flat CSS-gradient title screen.

    blender -b --python tools/title_scene.py -- <outdir>

Writes <outdir>/title_scene.png (1600x900).
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import model_toys as M  # noqa: E402  (studio rig, materials, balloon builder)

RES_W, RES_H = 1600, 900


def rock(name, loc, scale, seed):
    """A craggy boulder: icosphere with noisy vertices."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1,
                                          location=loc)
    ob = bpy.context.active_object
    ob.name = name
    for i, v in enumerate(ob.data.vertices):
        n = math.sin(i * 12.9898 + seed) * 43758.5453
        f = 1.0 + ((n - math.floor(n)) - 0.5) * 0.55
        v.co *= f
    ob.scale = scale
    M.set_smooth(ob)
    return ob


def ridge(name, loc, scale, rot_z):
    """A distant mountain ridge: squashed cone."""
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1, radius2=0,
                                    depth=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = scale
    M.set_smooth(ob)
    return ob


def hero_back():
    """The dino-hoodie kid as a dramatic backlit SILHOUETTE — one dark
    material, proportions carry the read: big chibi head, spiky spine,
    curling tail, bow in hand."""
    root = bpy.data.objects.new('hero', None)
    bpy.context.collection.objects.link(root)

    dark = M.mat('silhouette', M.srgb('#241a30'), 0.6)
    lime = M.mat('lime', M.srgb('#9fd636'), 0.35)

    def ball(name, r, loc, scale=(1, 1, 1)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16,
                                             radius=r, location=loc)
        ob = bpy.context.active_object
        ob.name = name
        ob.scale = scale
        ob.data.materials.append(dark)
        ob.parent = root
        M.set_smooth(ob)
        return ob

    ball('body', 0.34, (0, 0, 0.62), (1, 1, 1.25))
    ball('hood', 0.4, (0, 0, 1.22))
    ball('face', 0.3, (0, -0.16, 1.2))
    ball('armR', 0.09, (0.36, -0.04, 0.78), (1, 1, 2.0))
    ball('armL', 0.09, (-0.34, -0.1, 0.86), (1, 1, 2.2))
    ball('legL', 0.11, (-0.15, 0, 0.16), (1, 1, 1.4))
    ball('legR', 0.11, (0.15, 0, 0.16), (1, 1, 1.4))

    # dino spikes down the back of the head + spine (lime pops at the rim)
    spine = [(0, 0.26, 1.5, 0.13), (0, 0.3, 1.16, 0.14),
             (0, 0.33, 0.84, 0.12), (0, 0.36, 0.56, 0.1)]
    for x, y, z, r in spine:
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=r, radius2=0,
                                        depth=r * 2.6, location=(x, y, z))
        sp = bpy.context.active_object
        sp.rotation_euler = (math.radians(-104), 0, 0)
        sp.data.materials.append(lime)
        sp.parent = root
        M.set_smooth(sp)

    # tail curling out behind
    for i in range(5):
        t = i / 4.0
        ball('tail%d' % i, 0.11 * (1 - t * 0.65),
             (-0.3 - t * 0.55, 0.16 + t * 0.34, 0.34 - t * 0.12))

    # the bow, held low and outward from the left hand
    bow = M.build_bow()
    bow.scale = (0.8, 0.8, 0.8)
    bow.location = (-0.5, -0.34, 0.78)
    bow.rotation_euler = (math.radians(10), math.radians(-18), math.radians(-6))
    bow.parent = root
    return root


def balloon_rig(hue_hex, loc, scale):
    """A repainted toy balloon at depth. Balloons are built ~2 units wide
    (they were sized for a 4.3 ortho box), so keep scales ~0.2-0.35."""
    b = M.build_balloon()
    m = M.mat('balloon_' + hue_hex.strip('#'), M.srgb(hue_hex), 0.12, coat=0.25)
    for ch in bpy.data.objects:
        if ch.parent and ch.parent.name.startswith('balloon_root'):
            for ms in ch.material_slots:
                if ms.material and ms.material.name.startswith('balloon_red'):
                    ms.material = m
    b.name = 'balloon_' + hue_hex.strip('#')
    b.location = loc
    b.scale = (scale, scale, scale)
    return b


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else '/tmp/title'

    bpy.ops.wm.read_factory_settings(use_empty=True)
    M.setup_render()
    sc = bpy.context.scene
    sc.render.resolution_x = RES_W
    sc.render.resolution_y = RES_H
    # the shared rig renders transparent cutouts; the title needs a real sky
    sc.render.film_transparent = False

    # golden-hour world + lights: everything reads against the low sun.
    # NOTE: no 3D hero — the beloved flat character art is composited onto
    # the cliff in CSS (tools can't out-render the existing chibi render).
    # The dusk sky gradient is added in the PIL post-pass below.
    w = bpy.data.worlds.new('sunset')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (*M.srgb('#e8703a'), 1.0)
    bg.inputs[1].default_value = 1.1

    # the low sun itself: a big warm disk the balloons drift across
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24,
                                         radius=3.0, location=(1.6, 24, 1.6))
    sunball = bpy.context.active_object
    sun_m = bpy.data.materials.new('sunball')
    sun_m.use_nodes = True
    sb = sun_m.node_tree.nodes.get('Principled BSDF')
    sb.inputs['Emission Color'].default_value = (*M.srgb('#ffc46a'), 1.0)
    sb.inputs['Emission Strength'].default_value = 1.8
    sunball.data.materials.append(sun_m)
    sunball.visible_shadow = False

    # soft warm front-fill so the balloons keep their candy colors
    fill = bpy.data.lights.new('fill', type='AREA')
    fill.energy = 2600
    fill.size = 26
    fill.color = (1.0, 0.9, 0.8)
    fill_ob = bpy.data.objects.new('fill', fill)
    fill_ob.location = (2, -12, 6)
    sc.collection.objects.link(fill_ob)

    # balloons drifting across the sun, shrinking into the sky
    for hue, loc, s in [('#e62419', (-0.4, 4.5, 2.2), 0.34),
                        ('#ffd23a', (3.4, 7.0, 3.1), 0.26),
                        ('#23aaa2', (-3.6, 9.0, 3.9), 0.2),
                        ('#8e4fd0', (5.2, 11.0, 4.6), 0.15),
                        ('#e62419', (-6.0, 13.0, 2.8), 0.12)]:
        balloon_rig(hue, loc, s)

    # layered ridges marching into the haze, peeking over the horizon
    ridge_mats = [M.mat('r1', M.srgb('#3a2c4e'), 0.9),
                  M.mat('r2', M.srgb('#544061'), 0.9),
                  M.mat('r3', M.srgb('#74566c'), 0.9)]
    for i, (sx, sz, y, z, m) in enumerate([(34, 15, 24, -1.2, ridge_mats[0]),
                                           (44, 19, 36, -2.2, ridge_mats[1]),
                                           (56, 24, 48, -3.2, ridge_mats[2])]):
        r = ridge('ridge%d' % i, (-8 + i * 7, y, z), (sx, 2, sz),
                  math.radians(i * 37))
        r.data.materials.append(m)

    # camera: LOW, slight up-tilt — poster angle
    aim = bpy.data.objects.new('aim', None)
    aim.location = (0.6, 0, 2.6)
    sc.collection.objects.link(aim)
    cam = bpy.data.cameras.new('cam')
    cam.lens = 52
    cam.dof.use_dof = True
    cam.dof.focus_distance = 10.0
    cam.dof.aperture_fstop = 3.5
    ob = bpy.data.objects.new('cam', cam)
    ob.location = (0.4, -9.5, 0.9)
    sc.collection.objects.link(ob)
    ob.constraints.new('TRACK_TO').target = aim
    sc.camera = ob

    # foreground cliff corner, bottom-left, close to the lens — dark
    # silhouette mass the flat hero art will stand on in CSS
    cliff = rock('cliff', (-3.6, -3.2, -2.4), (3.6, 2.2, 1.15), 7)
    cliff_mat = M.mat('cliffm', M.srgb('#2e2338'), 0.85)
    cliff.data.materials.append(cliff_mat)
    for pos, sc3, seed in [((-6.4, -1.4, -3.0), (2.0, 1.3, 0.6), 3),
                           ((4.8, -2.4, -3.4), (2.6, 1.6, 0.7), 11)]:
        r = rock('rock', pos, sc3, seed)
        r.data.materials.append(cliff_mat)

    os.makedirs(outdir, exist_ok=True)
    sc.render.filepath = os.path.join(outdir, 'title_scene.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', sc.render.filepath)
    print('next: python3 tools/title_post.py %s/title_scene.png' % outdir)


main()
