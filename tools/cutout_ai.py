#!/usr/bin/env python3
"""AI background removal (rembg) + optional lineup splitting + autocrop.

Usage:
  cutout_ai.py IN OUT [--split N] [--names a,b,c] [--keep-largest]
"""
import sys, io
import numpy as np
from PIL import Image
from rembg import remove, new_session

SESSION = new_session("isnet-general-use")


def cut(img):
    return remove(img, session=SESSION, post_process_mask=True).convert("RGBA")


def autocrop(img, pad_frac=0.05):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = int(max(x1 - x0, y1 - y0) * pad_frac)
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1 + 1, y1 + 1))


def split_columns(img, n, gap=6):
    a = np.asarray(img)[:, :, 3]
    col_has = (a > 16).sum(axis=0) > 3
    runs, start = [], None
    for x, on in enumerate(col_has):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x)); start = None
    if start is not None:
        runs.append((start, len(col_has)))
    # merge runs separated by tiny gaps
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < gap:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(list(r))
    merged.sort(key=lambda r: r[1] - r[0], reverse=True)
    merged = sorted(merged[:n], key=lambda r: r[0])
    return [img.crop((x0, 0, x1, img.height)) for x0, x1 in merged]


def split_blobs(img, n):
    """Separate the n largest connected components (any orientation)."""
    import collections
    a = (np.asarray(img)[:, :, 3] > 24)
    h, w = a.shape
    lbl = np.zeros((h, w), dtype=np.int32)
    cur = 0
    comps = []
    for sy in range(h):
        for sx in range(w):
            if a[sy, sx] and lbl[sy, sx] == 0:
                cur += 1
                dq = collections.deque([(sy, sx)])
                lbl[sy, sx] = cur
                cnt = 0; minx = maxx = sx; miny = maxy = sy
                while dq:
                    y, x = dq.popleft(); cnt += 1
                    minx = min(minx, x); maxx = max(maxx, x)
                    miny = min(miny, y); maxy = max(maxy, y)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and lbl[ny, nx] == 0:
                            lbl[ny, nx] = cur; dq.append((ny, nx))
                comps.append((cnt, cur, (minx, miny, maxx, maxy)))
    comps.sort(reverse=True)
    comps = comps[:n]
    comps.sort(key=lambda c: c[2][0])  # left -> right
    arr = np.asarray(img)
    pieces = []
    for cnt, cid, (minx, miny, maxx, maxy) in comps:
        sub = arr[miny:maxy + 1, minx:maxx + 1].copy()
        m = (lbl[miny:maxy + 1, minx:maxx + 1] != cid)
        sub[m, 3] = 0
        pieces.append(Image.fromarray(sub, "RGBA"))
    return pieces


def orient_arrow(img):
    """Rotate so the arrow's long axis is horizontal with the tip pointing right."""
    a = np.asarray(img)[:, :, 3] > 24
    ys, xs = np.where(a)
    xs = xs - xs.mean(); ys = ys - ys.mean()
    cov = np.cov(np.vstack([xs, ys]))
    evals, evecs = np.linalg.eigh(cov)
    vx, vy = evecs[:, np.argmax(evals)]
    ang = np.degrees(np.arctan2(vy, vx))
    rot = img.rotate(ang, resample=Image.BICUBIC, expand=True)
    # tip = narrower end (fletching feathers are wider). flip so tip points right.
    a2 = np.asarray(rot)[:, :, 3] > 24
    w = a2.shape[1]
    left = a2[:, :w // 4].sum()
    right = a2[:, 3 * w // 4:].sum()
    if left < right:  # tip currently on the left
        rot = rot.transpose(Image.FLIP_LEFT_RIGHT)
    return rot


def main():
    args = sys.argv[1:]
    src, dst = args[0], args[1]
    split = 1; names = None; mode = "columns"; orient = False
    i = 2
    while i < len(args):
        if args[i] == "--split": split = int(args[i + 1]); i += 2
        elif args[i] == "--names": names = args[i + 1].split(","); i += 2
        elif args[i] == "--blobs": mode = "blobs"; i += 1
        elif args[i] == "--orient-arrow": orient = True; i += 1
        else: i += 1

    img = Image.open(src).convert("RGBA")
    out = cut(img)

    if split > 1:
        pieces = split_blobs(out, split) if mode == "blobs" else split_columns(out, split)
        if orient:
            pieces = [orient_arrow(p) for p in pieces]
        print(f"split into {len(pieces)} pieces")
        for idx, p in enumerate(pieces):
            p = autocrop(p)
            name = names[idx] if names and idx < len(names) else f"piece{idx}"
            path = dst.replace("{}", name) if "{}" in dst else f"{dst}/{name}.png"
            p.save(path)
            print(f"  {name}: {p.width}x{p.height} -> {path}")
    else:
        out = autocrop(out)
        out.save(dst)
        print(f"{out.width}x{out.height} -> {dst}")


if __name__ == "__main__":
    main()
