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

def paintify(im):
    """Storybook finish: chunkier shade bands + soft ink outline.

    Tuned for TripoSR/mesh bakes (v52): stronger chroma + posterize so clay
    reads closer to AI-painted sprites. Still keeps source hues (no silhouette crush).
    """
    from PIL import Image, ImageFilter, ImageOps, ImageChops, ImageEnhance
    im = im.convert("RGBA")
    rgb = im.convert("RGB")
    # 5-bit banding + smooth kills specular clay sparkle
    rgb = ImageOps.posterize(rgb, 5)
    rgb = rgb.filter(ImageFilter.SMOOTH_MORE)
    rgb = rgb.filter(ImageFilter.SMOOTH)
    rgb = ImageEnhance.Color(rgb).enhance(1.34)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.16)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)
    out = rgb.convert("RGBA")
    a = im.split()[-1]
    out.putalpha(a)
    # Soft dark outline from alpha edge
    edge = ImageChops.difference(
        a.filter(ImageFilter.MaxFilter(5)),
        a,
    )
    edge = edge.point(lambda v: 190 if v > 12 else 0)
    edge = edge.filter(ImageFilter.SMOOTH)
    ink = Image.new("RGBA", im.size, (48, 32, 26, 0))
    ink.putalpha(edge)
    out = Image.alpha_composite(out, ink)
    return out



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
        im = Image.open(f).convert("RGBA")
        # Trim empty transparent margin first so the toy fills the sprite
        # (otherwise ortho padding leaves pets tiny in a sea of alpha).
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        # Fit longest side to ~88% of canvas, keep aspect, center on square.
        pad = int(size * 0.88)
        im.thumbnail((pad, pad), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        im = paintify(im)
        canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
        out = "%s/%s_%d.%s" % (dest_dir, prefix, i, fmt)
        canvas.save(out, "WEBP" if fmt == "webp" else "PNG", quality=92)
        print("wrote", out, "content", im.size)

    print("\nNext steps (the house ritual):")
    print("  1. add the new names to js/sprites.js NAMES (skip for same-name replacements)")
    print("  2. add the files to sw.js FILES")
    print("  3. bump the sw.js CACHE string (mandatory — cache-first never revalidates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
