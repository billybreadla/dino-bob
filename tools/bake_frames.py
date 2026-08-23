#!/usr/bin/env python3
"""Post-process turntable renders into game-ready sprites (plan 6.3).

Takes the PNG frames written by tools/render_turntable.py, trims them to a
square canvas of --size, centers them, and writes WebP (or PNG) sprites that
drop straight into assets/sprites/.

Usage:
    python3 tools/bake_frames.py <src_dir> <prefix> <dest_dir> [size] [fmt]
    python3 tools/bake_frames.py /tmp/balloon balloon_3d assets/sprites 512 webp
    python3 tools/bake_frames.py --help
"""
import glob
import sys

USAGE = __doc__


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(USAGE)
        return 0
    if len(argv) < 3:
        print(USAGE)
        return 1

    src_dir, prefix, dest_dir = argv[0], argv[1], argv[2]
    size = int(argv[3]) if len(argv) > 3 else 512
    fmt = argv[4] if len(argv) > 4 else "webp"

    # Imported lazily so --help works on machines without Pillow.
    from PIL import Image

    files = sorted(glob.glob("%s/%s_*.png" % (src_dir, prefix)))
    if not files:
        print("no %s_*.png in %s" % (prefix, src_dir))
        return 1

    import os
    os.makedirs(dest_dir, exist_ok=True)
    for i, f in enumerate(files):
        im = Image.open(f)
        im.thumbnail((size, size), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
        out = "%s/%s_%d.%s" % (dest_dir, prefix, i, fmt)
        canvas.save(out, "WEBP" if fmt == "webp" else "PNG", quality=90)
        print("wrote", out)

    print("\nNext steps (the house ritual):")
    print("  1. add the new names to js/sprites.js NAMES (skip for same-name replacements)")
    print("  2. add the files to sw.js FILES")
    print("  3. bump the sw.js CACHE string (mandatory — cache-first never revalidates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
