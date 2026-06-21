#!/usr/bin/env python3
"""Batch 4: obsidian arrow, black-hole frames, mountain bg, 9 hats, re-centered target."""
import numpy as np
from PIL import Image
from rembg import remove, new_session

SRC = "assets/source"
OUT = "assets/sprites"
SESSION = new_session("isnet-general-use")


def cut(img):
    return remove(img, session=SESSION, post_process_mask=True).convert("RGBA")


def autocrop(img, pad_frac=0.04):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = int(max(x1 - x0, y1 - y0) * pad_frac)
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1 + 1, y1 + 1))


def pad_square(img):
    s = max(img.width, img.height)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(img, ((s - img.width) // 2, (s - img.height) // 2), img)
    return out


def orient_arrow(img):
    a = np.asarray(img)[:, :, 3] > 24
    ys, xs = np.where(a)
    xs = xs - xs.mean(); ys = ys - ys.mean()
    cov = np.cov(np.vstack([xs, ys]))
    evals, evecs = np.linalg.eigh(cov)
    vx, vy = evecs[:, np.argmax(evals)]
    ang = np.degrees(np.arctan2(vy, vx))
    rot = img.rotate(ang, resample=Image.BICUBIC, expand=True)
    a2 = np.asarray(rot)[:, :, 3] > 24
    w = a2.shape[1]
    left = a2[:, :w // 4].sum(); right = a2[:, 3 * w // 4:].sum()
    if left < right:
        rot = rot.transpose(Image.FLIP_LEFT_RIGHT)
    return rot


# ---- obsidian arrow (top-middle cell) ----
print("obsidian arrow...")
g = Image.open(f"{SRC}/obsidian_grid.png").convert("RGBA")
arrow = orient_arrow(autocrop(cut(g.crop((512, 0, 1024, 512)))))
arrow = autocrop(arrow)
arrow.save(f"{OUT}/arrow_obsidian.png")
print(f"  arrow_obsidian: {arrow.width}x{arrow.height}")

# ---- black hole frames (bottom row, 3) ----
print("black-hole frames...")
for i, (x0, x1) in enumerate([(40, 500), (560, 1010), (1070, 1530)]):
    bh = pad_square(autocrop(cut(g.crop((x0, 540, x1, 1024)))))
    bh.save(f"{OUT}/blackhole_{i}.png")
    print(f"  blackhole_{i}: {bh.width}x{bh.height}")

# ---- mountain background (random alt) ----
print("mountain background...")
bg = Image.open(f"{SRC}/bg_mountain_src.png").convert("RGB")
target_h = int(round(bg.width * 9 / 16))
if target_h <= bg.height:
    off = (bg.height - target_h) // 2
    bg = bg.crop((0, off, bg.width, off + target_h))
else:
    target_w = int(round(bg.height * 16 / 9))
    off = (bg.width - target_w) // 2
    bg = bg.crop((off, 0, off + target_w, bg.height))
bg = bg.resize((1600, 900), Image.LANCZOS)
bg.save(f"{OUT}/bg_mountain.png")
print(f"  bg_mountain: {bg.width}x{bg.height}")

# ---- hats (3x3) ----
print("hats...")
XS = [0, 512, 1024, 1536]; YS = [0, 341, 683, 1024]
hat_map = {
    (0, 0): "hat_cap", (0, 1): "hat_viking", (0, 2): "hat_robin",
    (1, 0): "hat_bandana", (1, 1): "hat_wizard", (1, 2): "hat_crown",
    (2, 0): "hat_pirate", (2, 1): "hat_dino", (2, 2): "hat_astro",
}
h = Image.open(f"{SRC}/hats_grid.png").convert("RGBA")
for (r, c), name in hat_map.items():
    piece = autocrop(cut(h.crop((XS[c], YS[r], XS[c + 1], YS[r + 1]))))
    piece.save(f"{OUT}/{name}.png")
    print(f"  {name}: {piece.width}x{piece.height}")

# ---- re-center target on the colored bullseye rings ----
print("re-centered target...")
t = Image.open(f"{SRC}/targets_grid.png").convert("RGB")
cell = t.crop((512, 341, 1024, 683))
arr = np.asarray(cell).astype(float) / 255
mx = arr.max(2); mn = arr.min(2)
sat = np.where(mx > 0, (mx - mn) / np.clip(mx, 1e-6, 1), 0)
vivid = (sat > 0.45) & (mx > 0.35)
ys, xs = np.where(vivid)
cx, cy = int(np.median(xs)), int(np.median(ys))           # robust center of ring mass
d = np.hypot(xs - cx, ys - cy)
R = int(np.percentile(d, 88) * 1.35)                       # ring extent + a little straw
box = (cx - R, cy - R, cx + R, cy + R)
sq = cell.crop(box).convert("RGBA")
sq = cut(sq)                                               # drop the tan straw background
sq.save(f"{OUT}/target.png")
print(f"  target: centered at ({cx},{cy}) R={R} -> {sq.width}x{sq.height}")
print("done.")
