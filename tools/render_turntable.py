#!/usr/bin/env python3
"""Turntable renderer for the Dino Bob Blender studio (VISUAL_3D_GAME_PLAN 6.2).

Renders a GLB model as N evenly-spaced turntable frames using whatever
camera + three-point lights are saved in the studio blend file.

Run headless:
    blender -b assets/source/blender-studio.blend -P tools/render_turntable.py -- \
        <model.glb> <outdir> <prefix> [frames] [res] [start_angle_deg]

e.g.
    blender -b assets/source/blender-studio.blend -P tools/render_turntable.py -- \
        ~/Downloads/balloon.glb /tmp/balloon balloon_3d 6 1024
"""
import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 3:
    print(__doc__)
    raise SystemExit(1)

MODEL = argv[0]
OUTDIR = argv[1]
PREFIX = argv[2]
FRAMES = int(argv[3]) if len(argv) > 3 else 6
RES = int(argv[4]) if len(argv) > 4 else 1024
START_ANGLE_DEG = float(argv[5]) if len(argv) > 5 else 0.0   # nudge so frame 0 = canonical view

os.makedirs(OUTDIR, exist_ok=True)
scene = bpy.context.scene

bpy.ops.import_scene.gltf(filepath=MODEL)

# Parent everything imported to one empty pivot so a single rotation spins it all.
pivot = bpy.data.objects.new(PREFIX + "_pivot", None)
scene.collection.objects.link(pivot)
imported = [o for o in scene.objects if o.select_get()]
for o in imported:
    o.parent = pivot

# Compute bounding radius to auto-frame the ortho camera.
import mathutils
radius = 0.001
for o in scene.objects:
    if o.type == 'MESH':
        for corner in o.bound_box:
            world = o.matrix_world @ mathutils.Vector(corner)
            radius = max(radius, world.length)
cam = next(o for o in scene.objects if o.type == 'CAMERA')
cam.data.ortho_scale = radius * 2.6          # padding so nothing clips

# Engine selection: prefer the newer EEVEE name on Blender 4.2+, fall back to
# the classic one. Setting an unknown enum raises TypeError, hence try/except.
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception:
    scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = RES
scene.render.resolution_y = RES
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'

for i in range(FRAMES):
    pivot.rotation_euler = (0.0, 0.0,
                            math.radians(START_ANGLE_DEG) + (2 * math.pi * i / FRAMES))
    scene.render.filepath = os.path.join(OUTDIR, "%s_%d.png" % (PREFIX, i))
    bpy.ops.render.render(write_still=True)
print("DONE", OUTDIR, PREFIX, FRAMES)
