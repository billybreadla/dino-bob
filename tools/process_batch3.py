#!/usr/bin/env python3
"""Batch 3 art processing: background + cut sprites from 3x3 grids."""
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


# grid geometry: 1536 x 1024, 3x3
XS = [0, 512, 1024, 1536]
YS = [0, 341, 683, 1024]


def cell(img, row, col, inset=0):
    box = (XS[col] + inset, YS[row] + inset, XS[col + 1] - inset, YS[row + 1] - inset)
    return img.crop(box)


def cut_cell(grid_name, row, col, out_name, box=None):
    img = Image.open(f"{SRC}/{grid_name}").convert("RGBA")
    sub = img.crop(box) if box else cell(img, row, col)
    out = autocrop(cut(sub))
    out.save(f"{OUT}/{out_name}.png")
    print(f"  {out_name}: {out.width}x{out.height}")


def do_background():
    img = Image.open(f"{SRC}/bg_grid.png").convert("RGB")
    # crop 1536x1024 -> 16:9 (1536x864), trim top/bottom evenly
    target_h = int(round(1536 * 9 / 16))  # 864
    off = (img.height - target_h) // 2
    img = img.crop((0, off, 1536, off + target_h)).resize((1600, 900), Image.LANCZOS)
    img.save(f"{OUT}/bg_meadow.png")
    print(f"  bg_meadow: {img.width}x{img.height}")


print("background...")
do_background()

print("target (face-on, center cell)...")
# tight box around the round face of the center target
cut_cell("targets_grid.png", 1, 1, "target", box=(566, 352, 916, 700))

print("fruits...")
fruit_map = {
    (0, 0): "fruit_apple", (0, 1): "fruit_banana", (0, 2): "fruit_pineapple",
    (1, 0): "fruit_strawberry", (1, 1): "fruit_orange", (1, 2): "fruit_grapes",
    (2, 0): "fruit_pear", (2, 1): "fruit_cherry", (2, 2): "fruit_watermelon",
}
for (r, c), name in fruit_map.items():
    cut_cell("fruits_grid.png", r, c, name)

print("chests (blue-gem chest through 3 states)...")
cut_cell("chests_grid.png", 0, 0, "chest_closed")
cut_cell("chests_grid.png", 1, 0, "chest_semi")
cut_cell("chests_grid.png", 2, 0, "chest_open")

print("coin (face-on star coin)...")
cut_cell("coins_grid.png", 0, 0, "coin")

print("done.")
