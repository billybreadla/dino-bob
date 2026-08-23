#!/usr/bin/env python3
"""Import a kid's drawing as a Dino Bob "doodle enemy".

Usage:
    python3 tools/import_drawing.py <image> --name <short-name> [--points 40] [--size 512]

Pipeline:
    1. open the picture
    2. remove the background (rembg AI if installed, otherwise a simple
       flood-fill from the four corners -- good for photos of drawings
       on plain paper)
    3. autocrop to the drawing, center it on a square transparent canvas
       with a little padding, resize to 512x512
    4. save assets/sprites/doodle_<name>.png and add an entry to
       assets/sprites/doodles.json (the manifest the game reads)

Only needs Pillow + numpy. rembg is optional (pip install rembg).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SPRITES_DIR = REPO / "assets" / "sprites"
MANIFEST = SPRITES_DIR / "doodles.json"


def autocrop(img, pad_frac=0.04):
    """Trim transparent borders, leaving a small padding (same recipe as
    tools/process_batch3.py so all game art gets identical framing)."""
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = int(max(x1 - x0, y1 - y0) * pad_frac)
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1 + 1, y1 + 1))


def cutout_rembg(img):
    """Best quality: the same isnet session the V6 art batch used."""
    from rembg import remove, new_session
    session = new_session("isnet-general-use")
    return remove(img.convert("RGBA"), session=session, post_process_mask=True).convert("RGBA")


def cutout_floodfill(img, tol=90):
    """No-rembg fallback: knock out the paper by flood-filling from each of
    the four corners with a color tolerance. Works great for crayon/markers
    on plain paper; struggles if the drawing touches the frame edges."""
    im = img.convert("RGBA")
    w, h = im.size
    # a 1px transparent border gives every corner flood room to reach around
    # the outside of the artwork even if it touches the original edge
    padded = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    padded.paste(im, (1, 1))
    # seed just INSIDE the pad: the pad itself is already transparent, and
    # floodfill skips seeds that match the fill value
    corners = [(1, 1), (padded.width - 2, 1), (1, padded.height - 2),
               (padded.width - 2, padded.height - 2)]
    from PIL import ImageDraw
    for xy in corners:
        ImageDraw.floodfill(padded, xy, (0, 0, 0, 0), thresh=tol)
    return padded.crop((1, 1, w + 1, h + 1))


def square_pad(img, pad_frac=0.08):
    """Center on a square transparent canvas with ~8% breathing room."""
    side = int(max(img.width, img.height) * (1 + pad_frac * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2),
                 img)
    return canvas


def update_manifest(name, sprite, points):
    data = {"doodles": []}
    if MANIFEST.exists():
        try:
            data = json.loads(MANIFEST.read_text())
            if not isinstance(data.get("doodles"), list):
                data["doodles"] = []
        except (ValueError, OSError):
            print(f"  warning: could not parse {MANIFEST.name}, starting fresh")
            data = {"doodles": []}
    entry = {"name": name, "sprite": sprite, "points": points}
    data["doodles"] = [d for d in data["doodles"] if d.get("name") != name]
    data["doodles"].append(entry)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
    return len(data["doodles"])


def main():
    ap = argparse.ArgumentParser(description="Turn a kid's drawing into a doodle enemy.")
    ap.add_argument("image", help="path to the drawing (png/jpg/webp/heic-anything Pillow opens)")
    ap.add_argument("--name", required=True, help="short name, letters/numbers only (e.g. dragon)")
    ap.add_argument("--points", type=int, default=40, help="score when hit (default 40)")
    ap.add_argument("--size", type=int, default=512, help="output square size (default 512)")
    ap.add_argument("--tol", type=int, default=90, help="corner flood-fill tolerance 0-255 (default 90)")
    args = ap.parse_args()

    name = re.sub(r"[^a-z0-9_]", "", args.name.lower())
    if not name:
        sys.exit("error: --name must contain letters or numbers")
    if not Path(args.image).exists():
        sys.exit(f"error: no such file: {args.image}")

    img = Image.open(args.image)
    img.load()
    print(f"loaded {args.image} ({img.width}x{img.height})")

    try:
        cut = cutout_rembg(img)
        print("background removed with rembg (AI cutout)")
    except ImportError:
        cut = cutout_floodfill(img, tol=args.tol)
        print(f"background removed with corner flood-fill (tol={args.tol})")

    cut = autocrop(cut)
    print(f"autocropped to {cut.width}x{cut.height}")
    cut = square_pad(cut).resize((args.size, args.size), Image.LANCZOS)

    sprite = f"doodle_{name}"
    out_path = SPRITES_DIR / f"{sprite}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cut.save(out_path)
    n = update_manifest(name, sprite, args.points)
    print(f"saved {out_path.relative_to(REPO)} ({cut.width}x{cut.height})")
    print(f"doodles.json now lists {n} doodle(s)")

    print("""
Next steps:
  1. Restart the game page (or reload it) -- doodles.json is fetched fresh
     every boot, no service-worker bump needed for new doodles.
  2. Play until phase 2+ and watch for your drawing wobbling onto the field!
""")


if __name__ == "__main__":
    main()
