#!/usr/bin/env python3
"""Background removal for Dino Bob art assets.

Flood-fills the background starting from the image border using *local*
color similarity, so it follows smooth gradients and never eats white/silver
parts of a subject that aren't connected to the border. Optionally splits a
lineup into N pieces (by detecting fully-transparent separator columns) and
auto-crops each piece.

Usage:
  cutout.py IN OUT [--tol N] [--split N] [--names a,b,c] [--feather N]
"""
import sys, collections
import numpy as np
from PIL import Image, ImageFilter


def remove_bg(img, tol=30):
    rgb = np.asarray(img.convert("RGB"), dtype=np.int32)
    h, w, _ = rgb.shape
    bg = np.zeros((h, w), dtype=bool)
    dq = collections.deque()

    def seed(y, x):
        if not bg[y, x]:
            bg[y, x] = True
            dq.append((y, x))

    for x in range(w):
        seed(0, x); seed(h - 1, x)
    for y in range(h):
        seed(y, 0); seed(y, w - 1)

    tol2 = tol * tol
    while dq:
        y, x = dq.popleft()
        c = rgb[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]:
                d = rgb[ny, nx] - c
                if d[0] * d[0] + d[1] * d[1] + d[2] * d[2] <= tol2:
                    bg[ny, nx] = True
                    dq.append((ny, nx))

    out = img.convert("RGBA")
    a = np.asarray(out, dtype=np.uint8).copy()
    a[bg, 3] = 0
    return Image.fromarray(a, "RGBA")


def feather(img, radius):
    if radius <= 0:
        return img
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.GaussianBlur(radius))
    return Image.merge("RGBA", (r, g, b, a))


def autocrop(img, pad_frac=0.04):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = int(max(x1 - x0, y1 - y0) * pad_frac)
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1 + 1, y1 + 1))


def split_columns(img, n):
    """Split into n pieces using transparent separator columns."""
    a = np.asarray(img)[:, :, 3]
    col_has = (a > 12).any(axis=0)
    # find contiguous runs of content columns
    runs, start = [], None
    for x, on in enumerate(col_has):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x)); start = None
    if start is not None:
        runs.append((start, len(col_has)))
    # keep the n widest runs, then sort left->right
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    runs = sorted(runs[:n], key=lambda r: r[0])
    return [img.crop((x0, 0, x1, img.height)) for x0, x1 in runs]


def main():
    args = sys.argv[1:]
    src, dst = args[0], args[1]
    tol = 30; split = 1; names = None; fr = 1.0
    i = 2
    while i < len(args):
        if args[i] == "--tol": tol = int(args[i + 1]); i += 2
        elif args[i] == "--split": split = int(args[i + 1]); i += 2
        elif args[i] == "--names": names = args[i + 1].split(","); i += 2
        elif args[i] == "--feather": fr = float(args[i + 1]); i += 2
        else: i += 1

    img = Image.open(src)
    cut = feather(remove_bg(img, tol), fr)

    if split > 1:
        pieces = split_columns(cut, split)
        print(f"split into {len(pieces)} pieces")
        for idx, p in enumerate(pieces):
            p = autocrop(p)
            name = names[idx] if names and idx < len(names) else f"piece{idx}"
            out = dst.replace("{}", name) if "{}" in dst else f"{dst}/{name}.png"
            p.save(out)
            print(f"  {name}: {p.width}x{p.height} -> {out}")
    else:
        cut = autocrop(cut)
        cut.save(dst)
        print(f"{cut.width}x{cut.height} -> {dst}")


if __name__ == "__main__":
    main()
